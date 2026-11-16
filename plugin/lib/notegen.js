/**
 * Turn a conversation (or one answer out of it) into a reading note.
 *
 * `WIRE-CHAT.md §14` makes the template the desktop app's, verbatim:
 *
 * ```
 * # <title>
 *
 * ## 知识点      what the code does, what the concept is
 * ## 关联代码    the cited ranges, copied verbatim with their location
 * ## 要点        load-bearing details, assumptions and edge cases
 * ## 何时使用    when to reach for this approach (and when not to)
 * ```
 *
 * Two rules carry the weight, and both are about *not* trusting the model:
 *
 * 1. **`## 关联代码` comes from the turn's `citations`, never from the model.** The
 *    ranges were extracted from retrieval when the answer was written
 *    (`answer.extractCitations`); the note copies them, reads the code off disk, and
 *    prints it. A model that hallucinated `cluster.py:12-400` in prose cannot get
 *    that range into the note, because prose is never the source of this section.
 * 2. **A failed summary must not lose the note.** When the model call fails, the
 *    raw answer becomes the 知识点 section through the documented no-model fallback
 *    (`notes.fallbackSections`), the note is still saved, and `summaryFailed` says
 *    so. The alternative — reporting an error and saving nothing — throws away the
 *    one thing the reader cannot regenerate.
 *
 * The composer itself is `notes.composeNote`, not a copy of it: the note library
 * already had the template, the fence sizing, and the "missing section gets an
 * explicit marker" behaviour, and a second implementation would drift from the
 * notes the user writes by hand.
 */

import { collapseWhitespace } from './model.js';
import { headCommit } from './git.js';
import {
  composeNote, fallbackSections, languageFor, readRangeDetailed, resolveTitle,
  sectionsFromText, snippetHash, splitSections, stripLeadingH1,
} from './notes.js';
import { loadNotes, updateNotes } from './store.js';
import { normalisePath } from './chat.js';
import { DEFAULT_NOTE_PROMPT, effectivePrompts } from './prompts.js';

/* ------------------------------------------------------------------ *
 * Bounds                                                             *
 * ------------------------------------------------------------------ */

/**
 * Output budget for the summary call, and its one retry.
 *
 * Both numbers are the desktop's (`notegen.NOTE_MAX_TOKENS` /
 * `NOTE_RETRY_MAX_TOKENS`). The retry exists for a specific failure: a reasoning
 * model can spend the whole budget thinking and emit no visible text at all, which
 * looks like an empty reply. One retry with double the room usually succeeds, and
 * a second failure falls back to the raw answer rather than asking a third time.
 */
export const NOTE_MAX_TOKENS = 4096;
export const NOTE_RETRY_MAX_TOKENS = 8192;

/**
 * Longest transcript handed to the model. The desktop app has two caps — 8 000 for
 * one answer and 12 000 for a whole conversation — because a single answer is the
 * unit it summarises. Both entry points here build one transcript, so there is one
 * cap and it is the larger of the two: clipping a long conversation at 8 000 would
 * cut off the later turns of exactly the sessions this exists to fold together.
 */
export const MAX_CONVERSATION_CHARS = 12000;

/** How many cited ranges a note keeps (`notegen.MAX_CODE_REFS`). */
export const MAX_CODE_REFS = 4;

/**
 * Line cap for one cited range. The character cap (1 600) is `notes.readRange`'s
 * own, applied inside it, so it is not repeated as a second truncation here.
 */
export const MAX_REF_LINES = 40;

/* ------------------------------------------------------------------ *
 * The prompt                                                         *
 * ------------------------------------------------------------------ */

/**
 * The desktop's note prompt, verbatim (`notegen.DEFAULT_NOTE_PROMPT`).
 *
 * The single source of truth lives in `lib/prompts.js` so the settings page's
 * reset and the note generator agree on one default; this alias keeps the
 * existing import name working. `{location}` is the one substitution.
 */
export const NOTE_PROMPT = DEFAULT_NOTE_PROMPT;

/**
 * The location line the prompt's `{location}` slot gets.
 * @param conversation - the conversation record.
 * @param transcript - true when the whole session is being summarised.
 * @returns the location text.
 */
export function locationFor(conversation, transcript = false) {
  let text = '整个项目（项目问答）';
  const path = normalisePath(conversation?.path);
  if (path !== '') {
    const start = Math.trunc(Number(conversation?.startLine) || 0);
    const end = Math.trunc(Number(conversation?.endLine) || 0);
    if (start > 0 && end >= start) text = `${path}:${start}-${end}`;
    else if (start > 0) text = `${path}:${start}`;
    else text = path;
  }
  return transcript ? `${text}（整段会话，包含多轮问答）` : text;
}

/**
 * The user message for the summary call.
 *
 * When the conversation carries a selected snippet, it is fenced and labelled as
 * the primary subject: the prompt asks for a note about *that* code, and the
 * answers are supporting context. Without one, the answer itself is the subject —
 * the same two shapes the desktop uses.
 *
 * @param options - `{ transcript, conversation, prompt }`.
 * @returns the user text.
 */
export function noteUserMessage(options = {}) {
  const { transcript = '', conversation = {} } = options;
  const selected = String(conversation.selectedCode ?? '').trim();
  const body = truncate(transcript, MAX_CONVERSATION_CHARS);
  if (selected !== '') {
    const fence = fenceFor(selected, languageFor(conversation.path));
    return [
      `用户明确选中的代码（本笔记的首要依据）：\n${fence[0]}\n${selected}\n${fence[1]}`,
      '对话回答及其中引用的其它代码（仅作辅助上下文，不得取代选中代码作为主题）：\n',
      body,
    ].join('\n\n');
  }
  return [
    '没有单独提供选中代码；请以本次讲解明确讨论的核心代码或机制为主题。'
    + '如回答中包含联系上下文的其它代码，只能用于辅助解释。',
    '',
    body,
  ].join('\n');
}

/** Oversized text clipped with the desktop's marker. */
function truncate(text, limit) {
  const body = String(text ?? '');
  return body.length <= limit ? body : `${body.slice(0, limit)}\n\n…（回答过长，后面部分已省略）`;
}

/** A fence sized above the longest backtick run inside the code. */
function fenceFor(code, language) {
  const longest = String(code ?? '').match(/`+/gu)?.reduce((most, run) => Math.max(most, run.length), 3) ?? 3;
  const fence = '`'.repeat(Math.max(3, longest) + 1);
  return [`${fence}${language ?? ''}`, fence];
}

/* ------------------------------------------------------------------ *
 * Citations → code references                                        *
 * ------------------------------------------------------------------ */

/**
 * The cited ranges of one turn, or of every turn, in first-seen order.
 *
 * `note://` citations are skipped: a note that cites another note has no lines on
 * disk, and keeping it here would only ever render "the content could not be read".
 *
 * When the conversation has a selection, that range is the note's primary
 * reference and comes first; model citations wholly inside it are dropped so
 * the note keeps the full `start-end` range instead of a single line. The
 * selection-only fallback is the desktop's `_code_refs` behavior for answers
 * that cite nothing.
 *
 * @param conversation - the conversation record.
 * @param turns - the turns whose citations to collect.
 * @returns `[{ path, startLine, endLine, symbol }]`.
 */
export function citationsOf(conversation, turns) {
  const collected = [];
  const seen = new Set();
  const push = (citation) => {
    const path = normalisePath(citation?.path);
    if (path === '' || path.startsWith('note://')) return;
    const startLine = Math.max(1, Math.trunc(Number(citation?.startLine ?? citation?.line ?? 1)) || 1);
    const endLine = Math.max(startLine, Math.trunc(Number(citation?.endLine ?? startLine)) || startLine);
    const key = `${path}:${startLine}-${endLine}`;
    if (seen.has(key)) {
      // The selection row is pushed first and intentionally has no symbol (the
      // frame, not the model, owns its subject). If an assistant citation lands
      // on the same exact range later, borrow its symbol rather than losing the
      // `（symbol）` suffix from the note's 关联代码 heading.
      const existing = collected.find((row) => `${row.path}:${row.startLine}-${row.endLine}` === key);
      if (existing !== undefined && existing.symbol === null
        && citation?.symbol !== undefined && citation?.symbol !== null && citation?.symbol !== '') {
        existing.symbol = String(citation.symbol);
      }
      return;
    }
    seen.add(key);
    collected.push({
      path,
      startLine,
      endLine,
      symbol: citation?.symbol === undefined || citation?.symbol === null || citation?.symbol === ''
        ? null : String(citation.symbol),
    });
  };

  // A CodeSlice conversation is bound to the reader's selection. That range is
  // the primary subject even when the answer also cites a single line inside it;
  // keeping the model's narrower citation would make the note's reference chip
  // read `:122` while the frame and the question were `122-126`.
  const selectionPath = normalisePath(conversation?.path);
  const selectionStart = Math.trunc(Number(conversation?.startLine) || 0);
  const selectionEnd = Math.max(
    selectionStart,
    Math.trunc(Number(conversation?.endLine) || selectionStart),
  );
  if (selectionPath !== '' && selectionStart > 0) {
    push({
      path: selectionPath,
      startLine: selectionStart,
      endLine: selectionEnd,
      symbol: null,
    });
  }

  for (const turn of turns ?? []) {
    if (turn?.role !== 'assistant') continue;
    for (const citation of turn.citations ?? []) {
      const path = normalisePath(citation?.path);
      const start = Math.trunc(Number(citation?.startLine ?? citation?.line) || 0);
      const end = Math.trunc(Number(citation?.endLine ?? start) || start);
      const insideSelection = selectionPath !== ''
        && selectionStart > 0
        && path === selectionPath
        && start >= selectionStart
        && end <= selectionEnd;
      if (insideSelection) {
        // The selection row already represents this range. Keep it, but let this
        // narrower citation contribute the symbol it knows.
        if (citation?.symbol !== undefined && citation?.symbol !== null && citation?.symbol !== '') {
          const row = collected.find((entry) => entry.path === selectionPath
            && entry.startLine === selectionStart && entry.endLine === selectionEnd);
          if (row !== undefined && row.symbol === null) row.symbol = String(citation.symbol);
        }
        continue;
      }
      push(citation);
    }
  }

  if (collected.length === 0) {
    const path = normalisePath(conversation?.path);
    const start = Math.trunc(Number(conversation?.startLine) || 0);
    if (path !== '' && start > 0) {
      push({
        path,
        startLine: start,
        endLine: Math.max(start, Math.trunc(Number(conversation?.endLine) || start)),
        symbol: null,
      });
    }
  }
  return collected.slice(0, MAX_CODE_REFS);
}

/**
 * Read each cited range off disk into the shape `composeNote` renders.
 *
 * The code is read *now*, so the note keeps the snippet as it read when the note
 * was made; the hash recorded alongside it is what a later drift check compares
 * against. A range that cannot be read is kept with `code: undefined` so the note
 * says "this could not be read" instead of silently dropping the citation — a
 * missing range is information the reader needs.
 *
 * @param root - absolute workspace root.
 * @param citations - rows from {@link citationsOf}.
 * @returns `[{ path, startLine, endLine, symbol, code, hash, status }]`.
 */
export async function resolveRefs(root, citations) {
  const refs = [];
  for (const citation of citations ?? []) {
    // `readRangeDetailed` caps at `MAX_REF_LINES` lines and 1600 characters and
    // reports the actual clipped span; the anchor records that span, not the
    // requested one, so a later drift check does not hash a different range.
    const detailed = await readRangeDetailed(root, citation.path, citation.startLine, citation.endLine, MAX_REF_LINES);
    const code = detailed === null ? null : detailed.text;
    refs.push({
      path: citation.path,
      startLine: detailed?.startLine ?? citation.startLine,
      endLine: detailed?.endLine ?? citation.endLine,
      symbol: citation.symbol ?? null,
      code: code === null ? undefined : code,
      hash: code === null ? null : snippetHash(code),
      status: code === null ? 'missing' : 'fresh',
    });
  }
  return refs;
}

/* ------------------------------------------------------------------ *
 * The model call                                                     *
 * ------------------------------------------------------------------ */

/**
 * Ask the model for the three prose sections.
 *
 * Returns `{ sections, error }` and never throws: a provider failure is a
 * `summaryFailed`, not a request failure. Non-streaming is deliberate — the note
 * needs the whole reply, and a partial reply rendered into a note would look
 * complete.
 *
 * @param options - `{ llm, route, conversation, transcript, prompt, signal, maxTokens }`.
 * @returns `{ sections, error, usage }`.
 */
export async function summarise(options = {}) {
  const {
    llm, route, conversation, transcript = '', signal, maxTokens,
  } = options;
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    return { sections: null, error: 'the LLM service is unavailable, so the note holds the original answer', usage: null };
  }
  if (route === undefined || route === null || route.provider === undefined || route.model === undefined) {
    return { sections: null, error: 'no default model is configured, so the note holds the original answer', usage: null };
  }

  const prompt = String(options.prompt ?? NOTE_PROMPT).replace('{location}', locationFor(conversation, false));
  const user = noteUserMessage({ transcript, conversation });
  const messages = [{ role: 'user', content: [{ type: 'text', text: user }] }];

  let error = null;
  let usage = null;
  for (const budget of [Math.trunc(Number(maxTokens ?? NOTE_MAX_TOKENS)) || NOTE_MAX_TOKENS, NOTE_RETRY_MAX_TOKENS]) {
    const parts = [];
    let failed = null;
    try {
      const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
        messages,
        system: prompt,
        maxTokens: Math.max(1, budget),
        ...(signal === undefined ? {} : { signal }),
      });
      for await (const chunk of stream) {
        if (chunk === null || typeof chunk !== 'object') continue;
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') parts.push(chunk.text);
        else if (chunk.type === 'usage') {
          const inputTokens = Math.trunc(Number(chunk.usage?.inputTokens));
          const outputTokens = Math.trunc(Number(chunk.usage?.outputTokens));
          if (Number.isFinite(inputTokens) || Number.isFinite(outputTokens)) {
            usage = {
              inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
              outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
            };
          }
        } else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
          failed = String(chunk.reason.failure?.message ?? 'the model call failed');
        }
      }
    } catch (thrown) {
      failed = thrown instanceof Error ? thrown.message : String(thrown);
    }

    const text = parts.join('').trim();
    if (failed === null && text !== '') {
      const sections = splitSections(stripLeadingH1(text));
      const usable = sectionsFromText(sections, text);
      // `sectionsFromText` returns `{ knowledge: full text }` when the model ignored
      // every heading, which is exactly the "keep its prose" outcome we want.
      return { sections: usable, error: null, usage };
    }
    error = failed ?? 'the model returned no content';
  }
  return { sections: null, error, usage };
}

/* ------------------------------------------------------------------ *
 * The note                                                           *
 * ------------------------------------------------------------------ */

/**
 * Build and store one note from a conversation.
 *
 * @param options - `{ root, conversation, turns, llm, route, folderId, prompt,
 *   maxTokens, signal }`.
 * @returns the note record plus `{ summaryFailed, summaryError }`.
 */
export async function noteFromConversation(options = {}) {
  const {
    root = '', conversation = {}, turns = [], llm, route, folderId = null, signal,
    title: titleOverride,
  } = options;
  const rows = Array.isArray(turns) ? turns : [];

  const answerText = rows
    .filter((turn) => turn?.role === 'assistant')
    .map((turn) => String(turn.text ?? '').trim())
    .filter((text) => text !== '')
    .join('\n\n---\n\n');
  const transcript = transcriptOf(rows);
  if (transcript.trim() === '') {
    throw new Error('this conversation has no content to summarise');
  }

  const citations = citationsOf(conversation, rows);
  const refs = await resolveRefs(root, citations);

  // The note prompt comes from the prompts store's effective slot (custom ??
  // default); an explicit `options.prompt` still wins for probes/one-off calls.
  const { note: effectiveNotePrompt } = await effectivePrompts();

  const summary = await summarise({
    llm,
    route,
    conversation,
    transcript,
    prompt: options.prompt ?? effectiveNotePrompt,
    maxTokens: options.maxTokens,
    signal,
  });
  const summaryFailed = summary.sections === null;
  const sections = summaryFailed ? fallbackSections(transcript || answerText, refs) : summary.sections;

  // The frame title is the single source of truth when the caller has one: the
  // note's H1 and the note-list row must read exactly like the code box's
  // title. Only a note generated without a frame asks the model for a title.
  const override = typeof titleOverride === 'string' ? titleOverride.trim() : '';
  const title = override !== '' ? override : resolveTitle(sections, answerText || transcript, '阅读笔记');
  const body = composeNote(title, sections, refs);

  const { note } = await upsertNoteForConversation(root, {
    title,
    body,
    refs,
    folderId,
    conversationId: conversation.id ?? null,
  });

  return { ...note, summaryFailed, summaryError: summaryFailed ? summary.error : null };
}

/**
 * Flatten turns into the `问：`/`答：` transcript the desktop's prompt expects.
 * @param turns - the conversation's turns.
 * @returns the transcript, clipped.
 */
export function transcriptOf(turns) {
  const parts = [];
  for (const turn of turns ?? []) {
    if (turn?.role !== 'user' && turn?.role !== 'assistant') continue;
    const body = String(turn.text ?? '').trim();
    if (body === '') continue;
    parts.push(`${turn.role === 'user' ? '问' : '答'}：${body}`);
  }
  return truncate(parts.join('\n\n'), MAX_CONVERSATION_CHARS);
}

/**
 * Write one note (plus its anchors) into the note library.
 *
 * Runs inside `updateNotes`, so the read-modify-write is one queued cycle: a note
 * generated while the reader is hand-editing another note cannot lose their edit.
 *
 * @param root - absolute workspace root.
 * @param input - `{ title, body, refs, folderId, conversationId }`.
 * @returns the stored note row.
 */
export async function persistNote(root, input) {
  const built = buildNote(input);
  const result = await updateNotes(root, (document) => {
    document.notes.push(built.note);
    document.anchors.push(...built.note.anchors.map((anchor) => ({ ...anchor, noteId: built.note.id })));
    return { note: built.note };
  });
  return result.value.note;
}

/**
 * Build the note row and its anchors without touching disk.
 * @param input - `{ title, body, refs, folderId, conversationId }`.
 * @returns `{ note }`.
 */
function buildNote(input) {
  const now = Date.now();
  const title = collapseWhitespace(input.title ?? '') || `笔记 ${new Date(now).toISOString().slice(0, 10)}`;
  const noteId = input.id === undefined || input.id === null || input.id === ''
    ? `n_${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
    : String(input.id);
  const createdAt = Math.trunc(Number(input.createdAt));
  const refs = (input.refs ?? []).map((ref) => ({
    path: ref.path,
    line: ref.startLine,
    endLine: ref.endLine,
    symbol: ref.symbol ?? null,
  }));

  return {
    note: {
      id: noteId,
      title,
      folderId: input.folderId === undefined || input.folderId === null || input.folderId === ''
        ? null : String(input.folderId),
      body: String(input.body ?? ''),
      createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now,
      updatedAt: now,
      codeRefs: refs,
      anchors: (input.refs ?? []).map((ref, index) => ({
        id: `a_${index.toString(36)}_${now.toString(36)}`,
        path: ref.path,
        startLine: ref.startLine,
        endLine: ref.endLine,
        symbol: ref.symbol ?? null,
        snippet: typeof ref.code === 'string' ? ref.code : '',
        hash: typeof ref.hash === 'string' ? ref.hash : null,
        commit: typeof input.commit === 'string' ? input.commit : null,
        status: ref.status ?? (typeof ref.code === 'string' ? 'fresh' : 'missing'),
        shift: 0,
        checkedAt: now,
      })),
      conversationId: input.conversationId === undefined || input.conversationId === null
        ? null : String(input.conversationId),
    },
  };
}

/**
 * Create the conversation's note, or refresh the one already generated from it.
 *
 * Saving the same conversation twice is a normal thing to do — the reader answers
 * one more question and wants the note to include it. Appending a second note with
 * the same title would make the library grow duplicates that look like different
 * notes. A hand-written note that merely *points at* this conversation is never
 * touched: only a body this generator produced is refreshed (see
 * {@link isGeneratedBody}).
 *
 * @param root - absolute workspace root.
 * @param input - `{ title, body, refs, folderId, conversationId }`.
 * @returns `{ note, created }`.
 */
export async function upsertNoteForConversation(root, input) {
  const commit = await headCommit(root);
  const built = buildNote({ ...input, commit });
  const conversationId = built.note.conversationId;
  const result = await updateNotes(root, (document) => {
    if (conversationId !== null) {
      const existing = document.notes.find((note) => note.conversationId === conversationId
        && isGeneratedBody(note.body));
      if (existing !== undefined) {
        const previousAnchors = new Set((existing.anchors ?? []).map((anchor) => anchor.id));
        existing.title = built.note.title;
        existing.body = built.note.body;
        existing.codeRefs = built.note.codeRefs;
        existing.anchors = built.note.anchors.map((anchor) => ({ ...anchor, id: `${existing.id}_${anchor.id}` }));
        existing.updatedAt = built.note.updatedAt;
        if (built.note.folderId !== null) existing.folderId = built.note.folderId;
        document.anchors = document.anchors.filter((anchor) => anchor.noteId !== existing.id
          || !previousAnchors.has(anchor.id));
        document.anchors.push(...existing.anchors.map((anchor) => ({ ...anchor, noteId: existing.id })));
        return { note: existing, created: false };
      }
    }
    document.notes.push(built.note);
    document.anchors.push(...built.note.anchors.map((anchor) => ({ ...anchor, noteId: built.note.id })));
    return { note: built.note, created: true };
  });
  return result.value;
}

/**
 * Which turns a `noteFromChat` request covers.
 *
 * `messageId` present means "this answer" (plus the question before it, because an
 * answer without its question reads as a fragment). Absent means "the whole
 * conversation".
 *
 * @param turns - every turn.
 * @param messageId - the requested turn id, or nothing.
 * @returns the covered turns, in order.
 */
export function turnsForNote(turns, messageId) {
  const rows = Array.isArray(turns) ? turns : [];
  const id = typeof messageId === 'string' ? messageId.trim() : '';
  if (id === '') return rows;
  const at = rows.findIndex((turn) => turn.id === id);
  if (at < 0) throw new Error(`message not found: ${id}`);
  const selected = rows[at];
  if (selected.role !== 'assistant') {
    throw new Error('only an assistant answer can be turned into a note');
  }
  // Include the immediately preceding user turn: the answer's question is what
  // makes the note's 知识点 section readable on its own.
  const withQuestion = at > 0 && rows[at - 1].role === 'user' ? [rows[at - 1], selected] : [selected];
  return withQuestion;
}

/**
 * Every note this plugin has written for a conversation, so a re-run refreshes the
 * interesting row rather than piling up duplicates.
 *
 * The desktop app keeps one note per conversation (`find_note_for_conversation`);
 * here a conversation may legitimately produce several (one per answer), so the
 * lookup is by `(conversationId, title family)` and only used to decide whether the
 * new note supersedes an older one with the same citations.
 *
 * @param root - absolute workspace root.
 * @param conversationId - the conversation id.
 * @returns the stored note rows for it, newest first.
 */
export async function notesForConversation(root, conversationId) {
  if (typeof conversationId !== 'string' || conversationId === '') return [];
  const document = await loadNotes(root);
  return document.notes
    .filter((note) => note.conversationId === conversationId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Exported for the probe: the fence a snippet would get, without the file read. */
export { fenceFor as fenceForSnippet };

/**
 * Whether a note body is the shape this generator produces.
 *
 * Used by the API to decide between "compose a body" and "keep the caller's", so a
 * note the user typed by hand is never overwritten by a template.
 * @param body - the note body.
 * @returns true when the four headings are all present.
 */
export function isGeneratedBody(body) {
  const text = String(body ?? '');
  return text.includes('## 知识点')
    && text.includes('## 关联代码')
    && text.includes('## 要点')
    && text.includes('## 何时使用');
}
