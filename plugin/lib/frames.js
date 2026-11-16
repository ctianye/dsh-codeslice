/**
 * Code frame store (INTERFACES-v3.md §3.2).
 *
 * A frame pins a reader's selection — a file range they asked about — so the panel
 * can reopen it later and tell whether the code has moved since. One document per
 * root: `<sha1(root)>.frames.json` under the state dir.
 *
 * Identity and dedup: a frame's id is sha1(`root:path:start:end`) first 16 hex.
 * Re-creating the same range overwrites its fields (latest wins) while keeping the
 * original `createdAt`; it does not append a duplicate row.
 *
 * Drift detection at read time mirrors the note anchors:
 *   fresh    the recorded range still hashes to the captured snippet
 *   moved    the same text was found within ±200 lines → `actualStart/actualEnd`
 *   missing  the file is gone, unreadable, or the text no longer matches
 * Out-of-range lines are clamped into `[1, lineCount]` before comparison.
 *
 * State location honours `CODESLICE_STATE_DIR` at call time so the dev probe can
 * isolate the store in a temp dir. A corrupt document is quarantined to
 * `<file>.corrupt-<ts>` and the read throws; it is never read back as empty.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { stateDir, readJsonChecked, writeJson } from './store.js';
import { quarantineCorrupt, safeJoin, snippetHash, ensureStateDir } from './notes.js';
import { projectId } from './projects.js';

/** Persisted document version, bumped if the shape ever changes. */
const STORE_VERSION = 1;

/** How far away a moved range may land and still count as moved. */
const MOVE_WINDOW = 200;

/** Line cap when capturing the snippet at create time. */
const MAX_CAPTURE_LINES = 40;

/** State directory, honouring the probe isolation env var at call time. */
function stateDirFor() {
  return process.env.CODESLICE_STATE_DIR || stateDir();
}

/** Absolute path to this root's frame document. */
function framesFile(root) {
  return join(stateDirFor(), `${projectId(root)}.frames.json`);
}

/**
 * Stable frame id: sha1 of `root:path:start:end`, first 16 hex.
 * @param root - absolute workspace root.
 * @param path - relative POSIX path.
 * @param startLine - 1-based inclusive.
 * @param endLine - 1-based inclusive.
 * @returns the 16-char id.
 */
export function frameId(root, path, startLine, endLine) {
  const key = `${resolve(root).toLowerCase()}:${path}:${startLine}:${endLine}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/** Validate and normalise one create payload. Throws on an unusable shape. */
function normaliseInput(input = {}) {
  const path = typeof input.path === 'string' ? input.path.replace(/\\/gu, '/').replace(/^\/+/u, '') : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
  if (path === '') throw new Error('a frame path is required');
  if (title === '') throw new Error('a frame title is required');
  if (question === '') throw new Error('a frame question is required');
  if (sessionId === '') throw new Error('a sessionId is required');

  const startLine = Math.max(1, Math.trunc(Number(input.startLine) || 1));
  const endLine = Math.max(startLine, Math.trunc(Number(input.endLine) || startLine));
  const messageId = typeof input.messageId === 'string' && input.messageId !== ''
    ? input.messageId : null;
  return { path, title, question, sessionId, startLine, endLine, messageId };
}

/** Read the lines of one file inside the root, or null when it cannot be read. */
async function readLines(root, path) {
  const safe = safeJoin(root, path);
  if (safe === undefined) return null;
  try {
    const text = await fs.readFile(safe, 'utf8');
    return text.split('\n');
  } catch {
    return null;
  }
}

/** Clamp a 1-based line number into `[1, lineCount]`. */
function clampLine(line, lineCount, fallback) {
  const value = Math.max(1, Math.trunc(Number(line) || fallback));
  return Math.min(value, lineCount);
}

/**
 * Locate the recorded snippet elsewhere in the file after a shift.
 * @returns `{ startLine, endLine }` or null.
 */
function findMoved(lines, targetLines, recordedStart, recordedEnd) {
  if (targetLines.length === 0) return null;
  const trimmed = lines.map((line) => line.trim());
  const head = targetLines[0];
  const windowStart = Math.max(0, recordedStart - 1 - MOVE_WINDOW);
  const windowEnd = Math.min(trimmed.length - targetLines.length, recordedEnd - 1 + MOVE_WINDOW);
  for (let index = Math.max(0, windowStart); index <= windowEnd; index += 1) {
    if (trimmed[index] !== head) continue;
    let matched = true;
    for (let offset = 1; offset < targetLines.length; offset += 1) {
      if (trimmed[index + offset] !== targetLines[offset]) { matched = false; break; }
    }
    if (matched) return { startLine: index + 1, endLine: index + targetLines.length };
  }
  return null;
}

/**
 * Re-check one stored frame against the current file content.
 * @param root - absolute workspace root.
 * @param frame - the stored record.
 * @returns the record plus `status` and, when not missing, `actualStart/actualEnd`.
 */
async function inspectFrame(root, frame) {
  const lines = await readLines(root, frame.path);
  if (lines === null) return { ...frame, status: 'missing' };

  const lineCount = lines.length;
  const actualStart = clampLine(frame.startLine, lineCount, 1);
  const actualEnd = clampLine(frame.endLine, lineCount, actualStart);

  if (frame.hash !== undefined && frame.hash !== null) {
    const current = lines.slice(actualStart - 1, actualEnd).join('\n');
    if (current !== '' && snippetHash(current) === frame.hash) {
      return { ...frame, status: 'fresh', actualStart, actualEnd };
    }

    const target = String(frame.snippet ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const moved = findMoved(lines, target, frame.startLine, frame.endLine);
    if (moved !== null) {
      return { ...frame, status: 'moved', actualStart: moved.startLine, actualEnd: moved.endLine };
    }
  }
  return { ...frame, status: 'missing', actualStart, actualEnd };
}

/** Strip the internal capture fields off a stored row for the wire shape. */
function wireRow(frame) {
  const { snippet, hash, ...row } = frame;
  return row;
}

/**
 * Read every stored frame, optionally filtered by session and/or path.
 * @param root - absolute workspace root.
 * @param filters - `{ sessionId?, path? }`.
 * @returns `{ frames: [...] }`.
 */
export async function listFrames(root, filters = {}) {
  const file = framesFile(root);
  const checked = await readJsonChecked(file);
  if (!checked.ok) {
    if (checked.reason === 'absent') return { frames: [] };
    await quarantineCorrupt(file);
    throw new Error(`frames state is corrupt: ${checked.detail ?? 'unknown'}`);
  }
  const rows = Array.isArray(checked.value?.frames) ? checked.value.frames : [];
  const sessionId = typeof filters.sessionId === 'string' ? filters.sessionId.trim() : '';
  const path = typeof filters.path === 'string' ? filters.path.replace(/\\/gu, '/') : '';

  const inspected = [];
  for (const row of rows) {
    if (sessionId !== '' && row.sessionId !== sessionId) continue;
    if (path !== '' && row.path !== path) continue;
    inspected.push(await inspectFrame(root, row));
  }
  return { frames: inspected.map(wireRow) };
}

/**
 * Create (or refresh) one frame. Same `(root, path, start, end)` overwrites the
 * existing row's fields; the original `createdAt` is kept.
 * @param root - absolute workspace root.
 * @param input - `{ path, startLine, endLine, sessionId, messageId?, title, question }`.
 * @returns the stored wire row.
 */
export async function createFrame(root, input = {}) {
  const fields = normaliseInput(input);
  const file = framesFile(root);
  const checked = await readJsonChecked(file);
  let frames = [];
  if (checked.ok) {
    frames = Array.isArray(checked.value?.frames) ? checked.value.frames : [];
  } else if (checked.reason !== 'absent') {
    await quarantineCorrupt(file);
    throw new Error(`frames state is corrupt: ${checked.detail ?? 'unknown'}`);
  }

  const id = frameId(root, fields.path, fields.startLine, fields.endLine);
  const existing = frames.find((frame) => frame.id === id);
  const now = Date.now();

  const captured = await readLines(root, fields.path);
  let snippet = null;
  let hash = null;
  if (captured !== null) {
    const lineCount = captured.length;
    const start = clampLine(fields.startLine, lineCount, 1);
    const end = clampLine(fields.endLine, lineCount, start);
    const raw = captured.slice(start - 1, end).join('\n');
    if (raw !== '') {
      snippet = raw.length > 1600 ? `${raw.slice(0, 1600)}\n…(已截断)` : raw;
      hash = snippetHash(raw);
    }
  }

  const record = {
    id,
    path: fields.path,
    startLine: fields.startLine,
    endLine: fields.endLine,
    sessionId: fields.sessionId,
    messageId: fields.messageId,
    title: fields.title,
    question: fields.question,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    snippet,
    hash,
  };

  const next = existing === undefined
    ? [...frames, record]
    : frames.map((frame) => (frame.id === id ? record : frame));

  await ensureStateDir(stateDirFor());
  const ok = await writeJson(file, { storeVersion: STORE_VERSION, frames: next });
  if (ok !== true) throw new Error('failed to persist frames state');
  return wireRow(record);
}

/**
 * Update one frame's title in place.
 *
 * `sessionId` is a guard, not a filter: the same range can be quoted by a later
 * conversation, and a title call that started in the older session must not
 * overwrite the newer frame's label.
 *
 * @param root - absolute workspace root.
 * @param id - the frame id.
 * @param title - the new title.
 * @param sessionId - the session that owns the frame, when known.
 * @returns the updated wire row.
 */
export async function updateFrameTitle(root, id, title, sessionId = '') {
  const file = framesFile(root);
  const checked = await readJsonChecked(file);
  if (!checked.ok) {
    if (checked.reason === 'absent') throw new Error('frame not found');
    await quarantineCorrupt(file);
    throw new Error(`frames state is corrupt: ${checked.detail ?? 'unknown'}`);
  }
  const frames = Array.isArray(checked.value?.frames) ? checked.value.frames : [];
  const frame = frames.find((row) => row.id === id);
  if (frame === undefined) throw new Error('frame not found');
  const expectedSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (expectedSession !== '' && frame.sessionId !== expectedSession) {
    throw new Error('frame belongs to another session');
  }
  const nextTitle = typeof title === 'string' ? title.trim() : '';
  if (nextTitle === '') throw new Error('a frame title is required');
  const updated = { ...frame, title: nextTitle, updatedAt: Date.now() };
  const next = frames.map((row) => (row.id === id ? updated : row));
  await ensureStateDir(stateDirFor());
  const ok = await writeJson(file, { storeVersion: STORE_VERSION, frames: next });
  if (ok !== true) throw new Error('failed to persist frames state');
  return wireRow(updated);
}

/**
 * Delete one frame by id.
 * @param root - absolute workspace root.
 * @param id - the frame id.
 */
export async function deleteFrame(root, id) {
  const file = framesFile(root);
  const checked = await readJsonChecked(file);
  if (!checked.ok) {
    if (checked.reason === 'absent') throw new Error('frame not found');
    await quarantineCorrupt(file);
    throw new Error(`frames state is corrupt: ${checked.detail ?? 'unknown'}`);
  }
  const frames = Array.isArray(checked.value?.frames) ? checked.value.frames : [];
  const remaining = frames.filter((frame) => frame.id !== id);
  if (remaining.length === frames.length) throw new Error('frame not found');
  await ensureStateDir(stateDirFor());
  const ok = await writeJson(file, { storeVersion: STORE_VERSION, frames: remaining });
  if (ok !== true) throw new Error('failed to persist frames state');
}
