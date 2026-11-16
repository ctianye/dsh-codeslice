/**
 * The v2 API methods and Host tools, ready to merge into `index.js`.
 *
 * `index.js` owns the route table and the note library; it is the Lead's file and
 * this module never edits it. So that the merge is four spreading lines rather than
 * a rewrite, every factory here has the same shape `apiMethods` already uses:
 *
 *     factory({ defaultDir, load }) -> { async method(payload, { ctx }) { … } }
 *
 * `load` is `index.js`'s `documentFor` (already exported), so the methods see the
 * same cached, built document the v1 methods do — a second index would be a second
 * source of truth.
 *
 * Three things are worth reading before changing anything here:
 *
 * 1. **`ask` is the only method that answers SSE** (`WIRE-CHAT.md §13`). It sets its
 *    own headers, writes one frame per event, and ends after exactly one `done` or
 *    one `error`. A handler that threw would leave the client's `fetch` body reader
 *    waiting, so every failure inside the stream becomes an `error` frame.
 * 2. **The user turn is persisted before dispatch and the assistant turn on
 *    completion**, which is what makes a dropped connection lose the in-flight
 *    answer and nothing else.
 * 3. **Wire shapes are camelCase**, the on-disk document is snake_case in some
 *    places (the built index uses `start_line`/`end_line`). The conversion happens in
 *    the projections below, exactly as `index.js` does for `node`/`outline`.
 */

import { promises as fs } from 'node:fs';

import { KIND_FILE, KIND_RATIONALE, collapseWhitespace } from './model.js';
import { languageFor, readRange, safeJoin, snippetHash } from './notes.js';
import { loadNotes } from './store.js';
import {
  appendTurn, clearConversation, createConversation, deleteConversation,
  ensureConversation, linkTurnToNote, listConversations, readConversation,
  renameConversation, titleFromQuestion,
} from './chat.js';
import { readRagSettings, writeRagSettings } from './rag.js';
import { startVectorIndex, vectorIndexStatus } from './vectors.js';
import {
  PRESETS, ollamaStatus, readModelSettings, testEmbedding, writeModelSettings,
} from './models.js';
import { ASK_MAX_TOKENS, resolveLlm, runAsk } from './answer.js';
import { listFrames, updateFrameTitle } from './frames.js';
import { commitInfo, showFileAtCommit } from './git.js';
import {
  noteFromConversation, persistNote, turnsForNote,
} from './notegen.js';

/* ------------------------------------------------------------------ *
 * Shared helpers                                                     *
 * ------------------------------------------------------------------ */

/** The wire error shape. */
function apiError(message, code = 'chat-error') {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Resolve one request's root.
 *
 * `root` wins, then `cwd` (the session directory a parked panel replays), then the
 * plugin's default. Same precedence as `index.js`, so a v1 and a v2 call from one
 * panel can never disagree about which workspace they are talking to.
 * @param payload - the request.
 * @param defaultDir - the plugin's default workspace.
 * @returns an absolute path.
 */
function resolveRoot(payload, defaultDir) {
  const candidate = [payload?.root, payload?.cwd, defaultDir]
    .find((value) => typeof value === 'string' && value.trim() !== '');
  if (candidate === undefined) {
    throw apiError('no workspace directory is available; pass `root` explicitly', 'no-root');
  }
  return candidate.trim();
}

/** A finite, clamped integer. */
function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

/** Normalise a workspace-relative path. */
function relPath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\/+/u, '').trim();
}

/* ------------------------------------------------------------------ *
 * chat                                                              *
 * ------------------------------------------------------------------ */

/**
 * The `chat` method table (`WIRE-CHAT.md §11`).
 * @param options - `{ defaultDir, load }`.
 * @returns `{ async chat(payload, context) }`.
 */
export function chatApiMethods(options = {}) {
  const { defaultDir, load } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * `op` selects the operation.
     * @param payload - `{ op, root, … }`.
     * @returns the op's value.
     */
    async chat(payload = {}) {
      const root = rootOf(payload);
      const op = typeof payload.op === 'string' && payload.op !== '' ? payload.op : 'list';

      if (op === 'list') {
        return {
          conversations: await listConversations(root, {
            query: payload.query,
            limit: clamp(payload.limit, 1, 200, 50),
          }),
        };
      }

      if (op === 'read') {
        const id = requireId(payload.id);
        return readConversation(root, id);
      }

      if (op === 'create') {
        return createConversation(root, {
          title: payload.title,
          mode: payload.mode,
          path: relPath(payload.path),
          startLine: payload.startLine,
          endLine: payload.endLine,
          selectedCode: payload.selectedCode,
          graphAnchor: payload.graphAnchor,
        });
      }

      if (op === 'rename') return renameConversation(root, requireId(payload.id), payload.title);
      if (op === 'delete') return deleteConversation(root, requireId(payload.id));
      if (op === 'clear') return clearConversation(root, requireId(payload.id));

      if (op === 'appendTurn') {
        if (payload.turn === null || typeof payload.turn !== 'object') {
          throw apiError('appendTurn requires a `turn` object', 'invalid-request');
        }
        return appendTurn(root, requireId(payload.id), payload.turn);
      }

      throw apiError(`unknown chat op: ${op}`, 'unknown-op');
    },
  };
}

/** A required id, with a message that names the field. */
function requireId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (id === '') throw apiError('`id` is required for this operation', 'invalid-request');
  return id;
}

/* ------------------------------------------------------------------ *
 * code                                                              *
 * ------------------------------------------------------------------ */

/**
 * The `code` method (`WIRE-CHAT.md §12`): one file window plus everything that
 * decorates it.
 *
 * The decorations are computed here rather than by the client because they all
 * depend on the *window*: the declarations overlapping it, the annotations
 * overlapping it, the notes overlapping it. Three round trips that each re-read the
 * file would drift apart mid-edit; one response is one consistent picture.
 *
 * @param options - `{ defaultDir, load }`.
 * @returns `{ async code(payload) }`.
 */
export function codeApiMethods(options = {}) {
  const { defaultDir, load } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * @param payload - `{ root, path, startLine, endLine, maxLines }`.
     * @returns `WIRE-CHAT.md §12`'s object.
     */
    async code(payload = {}) {
      const root = rootOf(payload);
      const path = relPath(payload.path);
      if (path === '') throw apiError('`path` is required', 'invalid-request');

      const absolute = safeJoin(root, path);
      if (absolute === undefined) {
        throw apiError(`refused: ${path} is outside the workspace`, 'outside-root');
      }

      let text = '';
      let found = true;
      let history = null;
      const commit = typeof payload.commit === 'string' ? payload.commit.trim() : '';
      if (/^[0-9a-f]{4,64}$/iu.test(commit)) {
        // A note can outlive its file. Reading the blob at the note's own commit
        // is the only way to show the code the note actually describes, and it
        // is also what lets the reader draw the original box over real lines.
        const blob = await showFileAtCommit(root, commit, path);
        if (blob === null) {
          found = false;
        } else {
          text = blob;
          const info = await commitInfo(root, commit);
          history = {
            sha: info?.commit ?? commit,
            date: info?.date ?? null,
            author: info?.author ?? null,
            subject: info?.subject ?? null,
          };
        }
      } else {
        try {
          text = await fs.readFile(absolute, 'utf8');
        } catch {
          // A missing file is an answer ("found: false"), not an error: the code pane
          // opened for a node whose file has since been deleted must say so.
          found = false;
        }
      }

      const allLines = found ? text.split('\n') : [];
      // A trailing newline yields a final empty element; it is not a line of code.
      const lineCount = found
        ? (allLines.length > 0 && allLines[allLines.length - 1] === '' ? allLines.length - 1 : allLines.length)
        : 0;

      const maxLines = clamp(payload.maxLines, 1, 20000, 2000);
      const requestedStart = clamp(payload.startLine, 1, Number.MAX_SAFE_INTEGER, 1);
      const startLine = found ? Math.min(requestedStart, Math.max(1, lineCount)) : requestedStart;
      const requestedEnd = payload.endLine === undefined || payload.endLine === null
        ? startedEnd(lineCount, startLine, maxLines)
        : clamp(payload.endLine, startLine, Number.MAX_SAFE_INTEGER, startLine);
      const endLine = found ? Math.min(requestedEnd, Math.max(startLine, lineCount)) : requestedEnd;

      const windowText = found
        ? allLines.slice(startLine - 1, Math.min(endLine, lineCount)).join('\n')
        : '';

      const document = await loadDocument(load, root, false);
      const notesDocument = await loadNotesSafely(root);

      const symbols = history === null ? (document.nodes ?? [])
        .filter((node) => node.path === path && node.kind !== KIND_FILE && node.kind !== KIND_RATIONALE)
        .filter((node) => overlaps(node.start_line, node.end_line, startLine, endLine))
        .sort((a, b) => a.start_line - b.start_line)
        .map((node) => ({
          id: node.id,
          name: node.label,
          kind: node.kind,
          line: node.start_line,
          endLine: node.end_line,
          signature: node.signature ?? '',
        })) : [];

      const annotations = history === null ? notesDocument.annotations
        .filter((row) => row.path === path && overlaps(row.startLine, row.endLine, startLine, endLine))
        .sort((a, b) => a.startLine - b.startLine)
        .map((row) => ({
          id: row.id,
          startLine: row.startLine,
          endLine: row.endLine,
          title: row.title,
          // Drift is reported as stored, not recomputed: `annotations list` is the
          // method that re-checks hashes against disk, and doing it here would make
          // opening a file cost one stat per annotation.
          drift: { status: row.status ?? 'fresh', shift: row.shift ?? 0 },
        })) : [];

      const notes = [];
      for (const note of history === null ? notesDocument.notes : []) {
        for (const anchor of note.anchors ?? []) {
          if (anchor.path !== path) continue;
          const aStart = Number(anchor.startLine ?? 0);
          const aEnd = Number(anchor.endLine ?? aStart);
          if (!overlaps(aStart, aEnd, startLine, endLine)) continue;
          notes.push({
            id: note.id,
            title: note.title,
            startLine: aStart,
            endLine: aEnd,
          });
          break;
        }
      }

      return {
        path,
        found,
        language: languageFor(path),
        lines: lineCount,
        startLine,
        endLine,
        text: windowText,
        symbols,
        annotations,
        notes,
        ...(history === null ? {} : { history }),
      };
    },
  };
}

/** The end line when the caller named none: `maxLines` from the start, clamped. */
function startedEnd(lineCount, startLine, maxLines) {
  const last = Math.max(startLine, lineCount);
  return Math.min(last, startLine + maxLines - 1);
}

/** True when `[aStart, aEnd]` and `[start, end]` share at least one line. */
function overlaps(aStart, aEnd, start, end) {
  const from = Math.max(1, Math.trunc(Number(aStart) || 0));
  const to = Math.max(from, Math.trunc(Number(aEnd) || from));
  return to >= start && from <= end;
}

/** Load the built document, tolerating a missing loader in a probe. */
async function loadDocument(load, root, force) {
  if (typeof load !== 'function') return { nodes: [], edges: [], files: [], chunks: { chunks: [] } };
  return load(root, force);
}

/** Load the note library, degrading to an empty one when it is damaged. */
async function loadNotesSafely(root) {
  try {
    return await loadNotes(root);
  } catch {
    // The code pane must still render. Whoever calls the `notes` API gets the
    // corruption reported with its `.corrupt-<ts>` path; a decorator read does not.
    return { folders: [], notes: [], annotations: [], anchors: [] };
  }
}

/* ------------------------------------------------------------------ *
 * files                                                             *
 * ------------------------------------------------------------------ */

/**
 * The `files` method: the indexed file list the workspace browser needs.
 *
 * Reading the same built document `code`/`graph` use keeps the browser and the
 * graph agreeing on what exists; a raw `fs.readdir` would also list ignored
 * bundles and binaries the index deliberately skips.
 *
 * @param options - `{ defaultDir, load }`.
 * @returns `{ async files(payload) }`.
 */
export function filesApiMethods(options = {}) {
  const { defaultDir, load } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * @param payload - `{ root, cwd }`.
     * @returns `{ files, dirs }`, both sorted.
     */
    async files(payload = {}) {
      const root = rootOf(payload);
      const document = await loadDocument(load, root, false);
      const files = (Array.isArray(document.files) ? document.files : [])
        .map((row) => ({
          path: relPath(row.path),
          lines: Math.max(0, Math.trunc(Number(row.lines) || 0)),
          bytes: Math.max(0, Math.trunc(Number(row.bytes) || 0)),
          language: typeof row.language === 'string' ? row.language : '',
          skipped: typeof row.skipped === 'string' ? row.skipped : undefined,
        }))
        .filter((row) => row.path !== '')
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const dirs = (Array.isArray(document.dirs) ? document.dirs : [])
        .map((row) => ({
          path: relPath(row.path),
          files: Math.max(0, Math.trunc(Number(row.files) || 0)),
          lines: Math.max(0, Math.trunc(Number(row.lines) || 0)),
        }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { files, dirs };
    },
  };
}

/* ------------------------------------------------------------------ *
 * models                                                             *
 * ------------------------------------------------------------------ */

/**
 * The `models` method: local embedding model settings plus an Ollama probe.
 *
 * `read`/`write` are cheap and local; `status` and `test` are the two operations
 * that reach 127.0.0.1. A failed probe is a value, not a throw, so the settings
 * screen can explain what is missing.
 *
 * @param options - `{ defaultDir }`.
 * @returns `{ async models(payload) }`.
 */
export function modelsApiMethods(options = {}) {
  const { defaultDir } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * @param payload - `{ op: 'read'|'write'|'status'|'test', root, settings }`.
     * @returns the op's value.
     */
    async models(payload = {}) {
      const root = rootOf(payload);
      const op = typeof payload.op === 'string' && payload.op !== '' ? payload.op : 'read';

      if (op === 'read') {
        return { settings: await readModelSettings(root), presets: PRESETS };
      }
      if (op === 'write') {
        const patch = payload.settings ?? payload.config;
        if (patch === null || typeof patch !== 'object') {
          throw apiError('`settings` must be an object', 'invalid-request');
        }
        return {
          settings: await writeModelSettings(root, patch),
          presets: PRESETS,
        };
      }
      if (op === 'status') {
        const settings = await readModelSettings(root);
        return {
          settings,
          presets: PRESETS,
          ollama: await ollamaStatus(settings.embedding.base_url, 2500),
        };
      }
      if (op === 'test') {
        const settings = await readModelSettings(root);
        return {
          settings,
          result: await testEmbedding({
            base_url: settings.embedding.base_url,
            model: settings.embedding.model,
          }),
        };
      }
      throw apiError(`unknown models op: ${op}`, 'unknown-op');
    },
  };
}

/* ------------------------------------------------------------------ *
 * rag                                                               *
 * ------------------------------------------------------------------ */

/**
 * The `rag` method table (`WIRE-CHAT.md §15`).
 * @param options - `{ defaultDir, load }`.
 * @returns `{ async rag(payload) }`.
 */
export function ragApiMethods(options = {}) {
  const { defaultDir, load } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * @param payload - `{ op: 'read'|'write'|'status'|'index', root, config, force }`.
     * @returns `{ config, index }`.
     */
    async rag(payload = {}) {
      const root = rootOf(payload);
      const op = typeof payload.op === 'string' && payload.op !== '' ? payload.op : 'read';
      const document = await loadDocument(load, root, false);

      if (op === 'read' || op === 'status') {
        const [rag, models] = await Promise.all([
          readRagSettings(root),
          readModelSettings(root),
        ]);
        return {
          ...rag,
          index: await vectorIndexStatus(root, document, models.embedding),
        };
      }
      if (op === 'write') {
        if (payload.config === null || typeof payload.config !== 'object') {
          throw apiError('`config` must be an object', 'invalid-request');
        }
        const written = await writeRagSettings(root, payload.config);
        const models = await readModelSettings(root);
        return {
          ...written,
          index: await vectorIndexStatus(root, document, models.embedding),
        };
      }
      if (op === 'index') {
        const models = await readModelSettings(root);
        const index = await startVectorIndex({
          root,
          document,
          embedding: models.embedding,
          force: payload.force === true,
        });
        return { index };
      }
      throw apiError(`unknown rag op: ${op}`, 'unknown-op');
    },
  };
}

/* ------------------------------------------------------------------ *
 * ask — streaming                                                    *
 * ------------------------------------------------------------------ */

/**
 * Write one SSE frame.
 *
 * `res.write` may return false under backpressure; the answer is not allowed to be
 * silently truncated, so the caller's `await` on this promise is what paces it. A
 * `res` that has already closed throws, which the stream loop treats as "the client
 * went away" and stops at.
 * @param res - the HTTP response.
 * @param frame - the frame object.
 */
function writeFrame(res, frame) {
  res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

/**
 * Start an SSE response. Idempotent, because the first frame may be emitted from a
 * different branch (a failure before retrieval) than the success path.
 * @param res - the HTTP response.
 */
function openStream(res) {
  if (res.headersSent === true) return;
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // Tells nginx-style intermediaries not to buffer: a buffered SSE stream is an
    // answer that appears all at once when it finishes, which defeats the point.
    'x-accel-buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

/**
 * The `ask` handler (`WIRE-CHAT.md §13`).
 *
 * The signature is `(payload, context, res)`: `payload` and `context` are what
 * every other method receives, and `res` is the raw response the route already
 * owns. Called without a `res`, it collects the frames and returns them — which is
 * what makes the whole streaming path testable without an HTTP server.
 *
 * @param options - `{ defaultDir, load, maxTokens }`.
 * @returns `(payload, context, res) => Promise<frames | undefined>`.
 */
export function askHandler(options = {}) {
  const { defaultDir, load } = options;

  return async function ask(payload = {}, context = {}, res = undefined) {
    const root = resolveRoot(payload, defaultDir);
    const frames = [];
    const emit = (frame) => {
      frames.push(frame);
      if (res !== undefined && res !== null) {
        try {
          openStream(res);
          writeFrame(res, frame);
        } catch {
          // The client closed the socket. The turn is still persisted below, so the
          // answer a reader loses is only the one they stopped waiting for.
        }
      }
    };

    // A client that navigates away must stop the model call, not leave it billing.
    const controller = new AbortController();
    if (res !== undefined && res !== null && typeof res.on === 'function') {
      res.on('close', () => controller.abort());
    }

    let conversation;
    let turns;
    let assistantTurnId = null;
    try {
      const text = String(payload.text ?? '').trim();
      if (text === '') throw apiError('`text` must not be empty', 'invalid-request');

      const ensured = await ensureConversation(root, {
        conversationId: payload.conversationId,
        // A snippet conversation reads better named after what it is about than
        // after the first question; the client supplies that title. A project
        // conversation still takes its name from the question.
        title: typeof payload.title === 'string' && payload.title.trim() !== ''
          ? payload.title
          : titleFromQuestion(text),
        mode: payload.mode,
        path: relPath(payload.path),
        startLine: payload.startLine,
        endLine: payload.endLine,
        selectedCode: payload.selectedCode,
        graphAnchor: payload.graphAnchor,
      });
      conversation = ensured.conversation;
      turns = ensured.turns;

      // The user turn is persisted *before* dispatch, so a crash mid-answer still
      // leaves the question on record.
      const userTurn = await appendTurn(root, conversation.id, {
        role: 'user',
        text,
        createdAt: Date.now(),
      });
      assistantTurnId = null;

      const resolved = resolveLlm(context?.ctx ?? context);
      emit({
        type: 'meta',
        conversationId: conversation.id,
        turnId: userTurn.turn.id,
        model: resolved.ok ? resolved.route.model : '',
      });

      const document = await loadDocument(load, root, false);
      const result = await runAsk({
        root,
        document,
        conversation,
        text,
        useContext: payload.useContext === true,
        graphAnchor: payload.graphAnchor,
        // A conversation may outlive the selection it started from: each question
        // can name its own. Only a complete snippet (code included) is a subject;
        // a path without code must not silently become an empty stage.
        turnSelection: payload.mode === 'snippet' && typeof payload.selectedCode === 'string'
          ? {
            mode: 'snippet',
            path: relPath(payload.path),
            startLine: payload.startLine,
            endLine: payload.endLine,
            selectedCode: payload.selectedCode,
          }
          : undefined,
        rag: payload.rag,
        llm: resolved.ok ? resolved.llm : undefined,
        route: resolved.ok ? resolved.route : undefined,
        maxTokens: clamp(payload.maxTokens, 1, 32000, Number(options.maxTokens ?? ASK_MAX_TOKENS)),
        signal: controller.signal,
        emit,
      });

      const assistantTurn = await appendTurn(root, conversation.id, {
        role: 'assistant',
        text: result.text,
        createdAt: Date.now(),
        retrieval: result.retrieval,
        citations: result.citations,
        usage: result.usage,
        error: result.error,
      });
      assistantTurnId = assistantTurn.turn.id;

      if (result.error !== null && result.text.trim() === '') {
        emit({
          type: 'error',
          message: result.error,
          code: resolved.ok ? 'model-error' : resolved.code,
        });
      } else {
        emit({
          type: 'done',
          assistantTurnId,
          usage: result.usage,
          // Additive: a partial answer (a mid-stream provider failure) is reported
          // rather than silently presented as complete. Documented in the report.
          ...(result.error === null ? {} : { warning: result.error }),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = typeof error?.code === 'string' ? error.code : 'ask-error';
      emit({ type: 'error', message, code });
    } finally {
      if (res !== undefined && res !== null) {
        try {
          res.end();
        } catch {
          // Already closed.
        }
      }
    }

    return res === undefined || res === null ? frames : undefined;
  };
}

/* ------------------------------------------------------------------ *
 * noteFromChat                                                      *
 * ------------------------------------------------------------------ */

/**
 * The `noteFromChat` method (`WIRE-CHAT.md §14`).
 *
 * Synchronous on purpose: the caller asked for a note, not for a job id, and one
 * short model call is faster than a poll. The cost is a request that can take a few
 * seconds — acceptable for an explicit "save this as a note" click.
 *
 * @param options - `{ defaultDir, load }`.
 * @returns `{ async noteFromChat(payload, context) }`.
 */
export function noteFromChatApiMethods(options = {}) {
  const { defaultDir } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * @param payload - `{ root, conversationId, messageId, folderId }`.
     * @param context - `{ ctx }`, for the LLM service.
     * @returns the note record plus `{ summaryFailed, summaryError }`.
     */
    async noteFromChat(payload = {}, context = {}) {
      const root = rootOf(payload);
      const conversationId = requireId(payload.conversationId);
      const { conversation, turns } = await readConversation(root, conversationId);
      const covered = turnsForNote(turns, payload.messageId);

      const resolved = resolveLlm(context?.ctx ?? context);
      const messageId = typeof payload.messageId === 'string' && payload.messageId !== ''
        ? payload.messageId
        : (turns.length > 0 ? turns[turns.length - 1].id : null);

      const note = await noteFromConversation({
        root,
        conversation,
        turns: covered,
        llm: resolved.ok ? resolved.llm : undefined,
        route: resolved.ok ? resolved.route : undefined,
        folderId: payload.folderId,
      });

      // The back-link is best effort: the note is already saved, and a failure to
      // record which turn produced it must not turn a success into an error.
      if (resolved.ok) {
        const turnId = likelyAnswerTurnId(covered) ?? messageId;
        await linkTurnToNote(root, conversationId, turnId, note.id);
      }

      return noteProjection(note);
    },
  };
}

/**
 * Whether a frame title is still a placeholder or a mechanical location.
 * @param title - the candidate title.
 * @returns true when it must not be copied into a note.
 */
function isPlaceholderTitle(title) {
  const text = String(title ?? '').trim();
  if (text === '') return true;
  if (text.startsWith('正在总结')) return true;
  return /^关于\s+[^\s]+\s+第\s*\d+([-–~]\d+)?\s*行$/u.test(text);
}

/**
 * Project a stored note onto the wire shape (`WIRE.md §6`).
 * @param note - the stored note record.
 * @returns the wire row plus summary status.
 */
function noteProjection(note) {
  return {
    note: {
      id: note.id,
      title: note.title,
      folderId: note.folderId,
      body: note.body,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      codeRefs: note.codeRefs,
      anchors: note.anchors.map((anchor) => ({
        id: anchor.id,
        path: anchor.path,
        startLine: anchor.startLine,
        endLine: anchor.endLine,
        symbol: anchor.symbol,
        snippet: anchor.snippet,
        hash: anchor.hash,
        status: anchor.status,
        shift: anchor.shift ?? 0,
        checkedAt: anchor.checkedAt,
      })),
      conversationId: note.conversationId,
    },
    summaryFailed: note.summaryFailed,
    summaryError: note.summaryError,
  };
}

/**
 * The `noteFromSession` method: a note from the DSH conversation itself.
 *
 * `noteFromChat` reads a conversation this plugin stored; the normal DSH
 * conversation lives in the host's session log, so the client sends the turns it
 * is looking at. The turn list is untrusted input: only `role` and `text` cross
 * the boundary, and the count is capped.
 *
 * @param options - `{ defaultDir }`.
 * @returns `{ async noteFromSession(payload, context) }`.
 */
export function noteFromSessionApiMethods(options = {}) {
  const { defaultDir } = options;
  const rootOf = (payload) => resolveRoot(payload, defaultDir);

  return {
    /**
     * @param payload - `{ root, sessionId, title, turns, path, startLine, endLine,
     *   folderId }`.
     * @param context - `{ ctx }`, for the LLM service.
     * @returns the note record plus `{ summaryFailed, summaryError }`.
     */
    async noteFromSession(payload = {}, context = {}) {
      const root = rootOf(payload);
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';

      // The session log is the source of truth (`practices.md`). Reading the
      // surface through `sessionQuery` keeps the note about what the model
      // actually saw, including turns the client never rendered.
      let rows = [];
      if (sessionId !== '') {
        const host = context?.ctx ?? context;
        const query = typeof host?.get === 'function' ? host.get('sessionQuery') : undefined;
        if (query === undefined || query === null || typeof query.readSurface !== 'function') {
          throw apiError('the session query service is unavailable, so this conversation cannot be summarised', 'session-query-unavailable');
        }
        const surface = await query.readSurface(sessionId);
        rows = sessionSurfaceTurns(surface);
      } else if (Array.isArray(payload.turns)) {
        // A caller that already holds plain turns (a probe, or a host without a
        // session id) may send them; only role and text cross the boundary.
        rows = payload.turns
          .filter((turn) => turn !== null && typeof turn === 'object'
            && (turn.role === 'user' || turn.role === 'assistant')
            && typeof turn.text === 'string' && turn.text.trim() !== '')
          .slice(-160)
          .map((turn) => ({
            role: turn.role,
            text: String(turn.text).slice(0, 12000),
            citations: [],
            createdAt: Date.now(),
          }));
      }
      if (rows.length === 0) {
        throw apiError('this session has no user or assistant turns to summarise', 'empty-session');
      }

      const path = relPath(payload.path);
      const startLine = Math.max(0, Math.trunc(Number(payload.startLine) || 0));
      const endLine = Math.max(startLine, Math.trunc(Number(payload.endLine) || startLine));
      const conversation = {
        id: typeof payload.sessionId === 'string' && payload.sessionId !== ''
          ? `session:${payload.sessionId}`
          : undefined,
        title: typeof payload.title === 'string' && payload.title.trim() !== ''
          ? payload.title.trim()
          : '对话笔记',
        mode: path !== '' && startLine > 0 ? 'snippet' : 'project',
        path,
        startLine,
        endLine,
        selectedCode: '',
      };

      const resolved = resolveLlm(context?.ctx ?? context);
      // The frame created by "添加到对话" is the single source of truth for the
      // title. Read it by its owning session and exact range; a frame with a
      // placeholder title is not usable yet, so let the note model name it and
      // then write that name back into the frame.
      let frame;
      let frameTitle = '';
      if (sessionId !== '' && path !== '' && startLine > 0) {
        try {
          const listed = await listFrames(root, { sessionId, path });
          frame = (listed.frames ?? []).find((row) => row.path === path
            && Number(row.startLine) === startLine
            && Number(row.endLine) === endLine);
          const candidate = typeof frame?.title === 'string' ? frame.title.trim() : '';
          if (candidate !== '' && !isPlaceholderTitle(candidate)) frameTitle = candidate;
        } catch {
          // A missing frame must not prevent the note; the model title is the
          // documented fallback.
        }
      }

      const note = await noteFromConversation({
        root,
        conversation,
        turns: rows,
        title: frameTitle,
        llm: resolved.ok ? resolved.llm : undefined,
        route: resolved.ok ? resolved.route : undefined,
        folderId: payload.folderId,
      });
      if (frame !== undefined && frameTitle === '') {
        try {
          await updateFrameTitle(root, frame.id, note.title, sessionId);
        } catch {
          // The note is already saved; a failed backfill only leaves the
          // placeholder visible until the next title attempt.
        }
      }
      return noteProjection(note);
    },
  };
}

/**
 * Read the text out of a message content value.
 * @param content - a string, a block array, or `{text}`.
 * @returns the joined text.
 */
function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part !== null && typeof part === 'object' && part.type === 'text') return String(part.text ?? '');
        return '';
      })
      .filter((text) => text !== '')
      .join('\n');
  }
  if (content !== null && typeof content === 'object' && typeof content.text === 'string') return content.text;
  return '';
}

/**
 * Project a `sessionQuery.readSurface` result into user/assistant turns.
 *
 * The query service returns the model surface; depending on the backend it is an
 * array of records or an object holding `messages`/`surface`. Both are accepted,
 * and only `role` plus text is kept so nothing provider-shaped reaches the note
 * template.
 * @param surface - the readSurface value.
 * @returns `[{role, text, citations, createdAt}]`.
 */
function sessionSurfaceTurns(surface) {
  const rows = Array.isArray(surface)
    ? surface
    : (Array.isArray(surface?.messages) ? surface.messages
      : Array.isArray(surface?.surface) ? surface.surface
        : Array.isArray(surface?.surface?.messages) ? surface.surface.messages
          : Array.isArray(surface?.events) ? surface.events
            : []);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const type = typeof row.type === 'string' ? row.type : '';
    const payload = row.data !== null && typeof row.data === 'object'
      ? row.data
      : row.message !== null && typeof row.message === 'object' ? row.message : row;
    let role = typeof payload.role === 'string' ? payload.role : (typeof row.role === 'string' ? row.role : '');
    if (role !== 'user' && role !== 'assistant') {
      if (type.startsWith('user/')) role = 'user';
      else if (type.startsWith('assistant/')) role = 'assistant';
    }
    if (role !== 'user' && role !== 'assistant') continue;
    const text = contentText(
      payload.content ?? payload.message?.content ?? row.content ?? payload.text ?? row.text,
    ).trim();
    if (text === '') continue;
    const key = `${role}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      role,
      text: text.slice(0, 12000),
      citations: [],
      createdAt: Date.now(),
    });
  }
  return out.slice(-160);
}

/** The last assistant turn in the covered set — the answer the note is about. */
function likelyAnswerTurnId(turns) {
  for (let index = (turns ?? []).length - 1; index >= 0; index -= 1) {
    if (turns[index]?.role === 'assistant') return turns[index].id;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Host tools (WIRE-CHAT.md §16)                                      *
 * ------------------------------------------------------------------ */

/** A plain text content block. */
function text(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

/**
 * Hoist property-level `required: true` markers onto the owning object.
 *
 * A duplicate of the helper in `index.js`, which is not exported. Kept tiny and
 * identical rather than reached for across module boundaries: the upstream
 * tool-schema validator rejects a nested `properties.x.required`, so both copies
 * must produce the same object-level array.
 * @param properties - the loose property map.
 * @returns `{ properties, required? }`.
 */
function hoistRequired(properties) {
  const required = [];
  const cleaned = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value.required === true) required.push(key);
    const { required: _omit, ...rest } = value;
    cleaned[key] = rest;
  }
  return { properties: cleaned, ...(required.length === 0 ? {} : { required }) };
}

/** Shape a tool's input `parameters`. */
function inputSchema(properties) {
  return { type: 'object', additionalProperties: false, ...hoistRequired(properties) };
}

/** The `root` property every tool carries. */
const ROOT_PROP = {
  type: 'string',
  description: 'Optional absolute workspace root; defaults to the session directory.',
};

/**
 * The v2 Host tools (`WIRE-CHAT.md §16`).
 *
 * `codeslice_ask` is registered as a **non-streaming** tool: a model calling a tool
 * wants the answer, and streaming deltas into a tool result would produce a result
 * the provider cannot attribute. The tool therefore runs the same pipeline and
 * returns the joined text plus its citations.
 *
 * @param options - `{ defaultDir, load, maxTokens }`.
 * @returns the tool definitions to register with `ctx.tools.register`.
 */
export function chatToolDefinitions(options = {}) {
  const { defaultDir, load } = options;
  const rootOf = (args) => resolveRoot(args, defaultDir);

  return [
    {
      name: 'codeslice_ask',
      description: 'Answer a question about this workspace from its code graph, note library and retrieved code chunks, and return the answer with the exact file:line ranges it was written from. Use it when the question is "how does X work" and a single search would not be enough context.',
      parameters: inputSchema({
        question: { type: 'string', required: true, description: 'The question, in any language.' },
        context: { type: 'boolean', description: 'Widen the context with the enclosing symbol of the selected range.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => {
        const root = rootOf(args);
        const resolved = resolveLlm(exec?.ctx);
        if (!resolved.ok) return text(resolved.message);
        const question = String(args.question ?? '').trim();
        if (question === '') return text('`question` must not be empty');
        const document = await loadDocument(load, root, false);
        const result = await runAsk({
          root,
          document,
          conversation: { mode: 'project' },
          text: question,
          useContext: args.context === true,
          llm: resolved.llm,
          route: resolved.route,
          maxTokens: Number(options.maxTokens ?? ASK_MAX_TOKENS),
        });
        if (result.text.trim() === '' && result.error !== null) return text(`ask failed: ${result.error}`);
        const citations = result.citations
          .map((row) => `- ${row.path}:${row.startLine}-${row.endLine}${row.symbol === null ? '' : ` (${row.symbol})`}`)
          .join('\n');
        return text([
          result.text.trim() === '' ? '（模型没有给出内容。）' : result.text,
          ...(citations === '' ? [] : ['', '引用位置：', citations]),
        ].join('\n'));
      },
    },
    {
      name: 'codeslice_notes_search',
      description: 'Search the reader\'s own note knowledge base by title and body. Returns note ids, titles, and the code ranges each note is anchored to, so a follow-up can read the exact code the note is about.',
      parameters: inputSchema({
        query: { type: 'string', description: 'Keyword to match against note titles and bodies. Omit to list the most recent notes.' },
        limit: { type: 'number', description: 'Maximum notes (default 8, cap 40).' },
        root: ROOT_PROP,
      }),
      execute: async (args) => {
        const root = rootOf(args);
        const document = await loadNotesSafely(root);
        const query = collapseWhitespace(args.query ?? '').toLowerCase();
        const limit = clamp(args.limit, 1, 40, 8);
        const rows = document.notes
          .filter((note) => query === ''
            || String(note.title ?? '').toLowerCase().includes(query)
            || String(note.body ?? '').toLowerCase().includes(query))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .slice(0, limit);
        if (rows.length === 0) return text(query === '' ? '还没有任何笔记。' : `没有匹配「${args.query}」的笔记。`);
        return text(rows.map((note) => {
          const anchors = (note.anchors ?? [])
            .map((anchor) => `  - ${anchor.path}:${anchor.startLine}-${anchor.endLine}`)
            .join('\n');
          return [
            `# ${note.title}`,
            `  id: ${note.id}`,
            `  更新于: ${new Date(note.updatedAt ?? 0).toISOString()}`,
            ...(anchors === '' ? [] : ['  锚定的代码：', anchors]),
            '',
            String(note.body ?? '').slice(0, 1200),
          ].join('\n');
        }).join('\n\n---\n\n'));
      },
    },
    {
      name: 'codeslice_note_create',
      description: 'Write one note into the reader\'s knowledge base. The body should explain what the code does and why; the cited ranges become the note\'s anchors, so the note is later checked for code drift.',
      parameters: inputSchema({
        title: { type: 'string', required: true, description: 'A short knowledge-point title, not a file name or line range.' },
        body: { type: 'string', required: true, description: 'The note body in Markdown.' },
        codeRefs: {
          type: 'array',
          description: 'Cited ranges, as `[{ path, line, endLine, symbol }]`.',
        },
        root: ROOT_PROP,
      }),
      execute: async (args) => {
        const root = rootOf(args);
        const title = collapseWhitespace(args.title ?? '');
        const body = String(args.body ?? '');
        if (title === '') return text('`title` must not be empty');
        if (body.trim() === '') return text('`body` must not be empty');
        const refs = Array.isArray(args.codeRefs) ? args.codeRefs : [];
        const resolvedRefs = [];
        for (const ref of refs.slice(0, 8)) {
          const path = relPath(ref?.path);
          if (path === '') continue;
          const startLine = Math.max(1, Math.trunc(Number(ref.line ?? ref.startLine ?? 1)) || 1);
          const endLine = Math.max(startLine, Math.trunc(Number(ref.endLine ?? startLine)) || startLine);
          const code = await readRange(root, path, startLine, endLine, 40);
          resolvedRefs.push({
            path,
            startLine,
            endLine,
            symbol: ref.symbol ?? null,
            code: code === null ? undefined : code,
            hash: code === null ? null : snippetHash(code),
            status: code === null ? 'missing' : 'fresh',
          });
        }
        const note = await persistNote(root, { title, body, refs: resolvedRefs, folderId: null, conversationId: null });
        return text(`note created: ${note.id}\n${note.title}\n${note.anchors.length} anchor(s)`);
      },
    },
    {
      name: 'codeslice_rag_config',
      description: 'Read or change the retrieval settings used when answering questions: how many chunks to retrieve, the RRF constant, and which relation families the graph contributes. Chunking is fixed (the desktop bands) and is not configurable.',
      parameters: inputSchema({
        config: { type: 'object', description: 'Fields to change. Omit to only read the current settings.' },
        root: ROOT_PROP,
      }),
      execute: async (args) => {
        const root = rootOf(args);
        if (args.config === undefined || args.config === null) {
          const read = await readRagSettings(root);
          return text(read.config);
        }
        const written = await writeRagSettings(root, args.config);
        return text(written.config);
      },
    },
  ];
}
