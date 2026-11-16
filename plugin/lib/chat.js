/**
 * Conversations: the durable half of the workbench.
 *
 * `WIRE-CHAT.md §10` adds one sibling document to the note library,
 * `<rootKey>.chat.json`, holding every conversation and its turns. It is **user
 * data** — a reading session someone invested an hour in — so it gets the same
 * durability treatment as `notes.json`, not the "cache" treatment of
 * `index.json`:
 *
 *   - atomic temp + fsync + rename, through `store.writeJson`
 *   - one write chain per file, so two panels' appends cannot interleave
 *   - the **whole read-modify-write cycle** queued, not just the write. Queueing
 *     only the write still loses an update: both panels load, both append to
 *     their own snapshot, the second rename publishes a document the first turn
 *     never entered. `store.js` solves this with its private `serialiseWrite`;
 *     that helper is not exported, so this module owns a small equivalent chain
 *     (see {@link serialise}) and runs `load → mutate → write` inside it.
 *   - a corrupt file is moved aside to `.corrupt-<ts>` and refused, never read
 *     as empty. Reading a damaged library as empty and then writing is exactly
 *     how a history gets replaced by one row.
 *
 * What this file deliberately is *not*: it does not talk to the model and does
 * not know about retrieval. It stores the turn record as given; the answer
 * pipeline (`answer.js`) and the note generator (`notegen.js`) are the producers.
 */

import { promises as fs } from 'node:fs';

import { collapseWhitespace } from './model.js';
import { cleanTitle, clipTitle, firstSentence } from './notes.js';
import { STORE_VERSION, readJsonChecked, statePath, writeJson } from './store.js';

/** Bumped when the on-disk chat document shape changes. */
export const CHAT_VERSION = 1;

/** How many conversations `chat list` returns when the caller says nothing. */
export const LIST_LIMIT_DEFAULT = 50;

/** Hard cap for `chat list`. */
export const LIST_LIMIT_MAX = 200;

/**
 * Longest `selectedCode` one conversation keeps.
 *
 * The selection is the conversation's subject, so it is stored verbatim rather
 * than as a line range — the file may be edited between opening the conversation
 * and asking the third question, and the reader must still be looking at the code
 * they selected. The cap only stops a pathological "select the whole 30 MB file"
 * from making the document unopenable; 20 000 characters is far more than a code
 * pane selection and far less than a file that would break the panel anyway.
 */
export const MAX_SELECTED_CODE_CHARS = 20000;

/** Longest conversation title stored. */
const MAX_TITLE_CHARS = 72;

/* ------------------------------------------------------------------ *
 * Ids                                                                *
 * ------------------------------------------------------------------ */

let counter = 0;

/**
 * A short, collision-resistant id, in the same style as `notes.mintId`.
 *
 * Not exported from `notes.js`, so the two-character scheme is repeated here
 * rather than reaching into another module's private state. `c_` is a
 * conversation, `m_` a message/turn.
 * @param prefix - 'c' or 'm'.
 * @returns the id.
 */
function mintId(prefix) {
  counter = (counter + 1) % 1_000_000;
  const stamp = Date.now().toString(36);
  const noise = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${prefix}_${stamp}${noise}${counter.toString(36)}`;
}

/** A lowercase-trimmed string, or '' when the value is not a usable string. */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Normalise a workspace-relative path: forward slashes, no leading slash. */
export function normalisePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\/+/u, '').trim();
}

/** A 1-based line number, or `fallback` when the value is not finite. */
function asLine(value, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return number;
}

/* ------------------------------------------------------------------ *
 * Wire shapes                                                        *
 * ------------------------------------------------------------------ */

/**
 * One retrieval row in the shape `WIRE-CHAT.md §10` documents.
 *
 * `searchRecords` speaks in `line`/`endLine` (the v1 `records` shape); a turn's
 * `retrieval` speaks in `startLine`/`endLine` (the v2 shape). Converting in one
 * place is what stops a citation from rendering `path:undefined-undefined`.
 * @param record - a record from `searchRecords`/`rrfFuse`, or an already-normal
 *   row.
 * @returns the turn-shaped row.
 */
export function retrievalRow(record) {
  const startLine = Math.max(1, Math.trunc(Number(record?.startLine ?? record?.line ?? 1)) || 1);
  const endLine = Math.max(startLine, Math.trunc(Number(record?.endLine ?? record?.line ?? startLine)) || startLine);
  return {
    path: normalisePath(record?.path),
    startLine,
    endLine,
    symbol: record?.symbol === undefined || record?.symbol === null || record?.symbol === '' ? null : String(record.symbol),
    kind: typeof record?.kind === 'string' ? record.kind : '',
    score: Number.isFinite(Number(record?.score)) ? Number(Number(record.score).toFixed(5)) : 0,
    retriever: typeof record?.retriever === 'string' && record.retriever !== '' ? record.retriever : 'keyword',
  };
}

/**
 * One citation row. Citations are always extracted from the retrieved set by the
 * Host, so this shape never carries a range the retriever did not produce.
 * @param reference - `{ path, startLine, endLine, symbol, hash, status }`.
 * @returns the row.
 */
export function citationRow(reference) {
  const startLine = Math.max(1, Math.trunc(Number(reference?.startLine ?? reference?.line ?? 1)) || 1);
  const endLine = Math.max(startLine, Math.trunc(Number(reference?.endLine ?? startLine)) || startLine);
  return {
    path: normalisePath(reference?.path),
    startLine,
    endLine,
    symbol: reference?.symbol === undefined || reference?.symbol === null || reference?.symbol === ''
      ? null : String(reference.symbol),
    hash: typeof reference?.hash === 'string' ? reference.hash : null,
    status: typeof reference?.status === 'string' && reference.status !== '' ? reference.status : 'fresh',
  };
}

/**
 * Token usage, or null. A provider that reports nothing must not render a
 * fabricated `0 tokens`.
 * @param usage - `{ inputTokens, outputTokens }` from a stream usage chunk.
 * @returns the usage row, or null.
 */
export function normaliseUsage(usage) {
  if (usage === null || usage === undefined || typeof usage !== 'object') return null;
  const inputTokens = Math.trunc(Number(usage.inputTokens));
  const outputTokens = Math.trunc(Number(usage.outputTokens));
  if (!Number.isFinite(inputTokens) && !Number.isFinite(outputTokens)) return null;
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
  };
}

/**
 * Normalise one turn record.
 * @param input - the turn as a producer (or a request) supplied it.
 * @param now - the fallback timestamp.
 * @returns the stored turn.
 */
export function normaliseTurn(input, now = Date.now()) {
  const role = input?.role === 'assistant' ? 'assistant' : 'user';
  const created = Math.trunc(Number(input?.createdAt));
  return {
    id: asString(input?.id) === '' ? mintId('m') : asString(input.id),
    role,
    text: typeof input?.text === 'string' ? input.text : '',
    createdAt: Number.isFinite(created) && created > 0 ? created : now,
    retrieval: Array.isArray(input?.retrieval) ? input.retrieval.map(retrievalRow) : [],
    citations: Array.isArray(input?.citations) ? input.citations.map(citationRow) : [],
    usage: normaliseUsage(input?.usage),
    noteId: input?.noteId === undefined || input?.noteId === null || input?.noteId === '' ? null : String(input.noteId),
    error: normaliseError(input?.error),
  };
}

/**
 * An error string, or null. A caller may hand over an `Error`, a message, or an
 * object with a `message`; a turn stores the text a reader can act on.
 * @param value - whatever was supplied.
 * @returns the message, or null.
 */
function normaliseError(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'object' && typeof value.message === 'string') return value.message;
  return String(value);
}

/* ------------------------------------------------------------------ *
 * The document                                                       *
 * ------------------------------------------------------------------ */

/** A brand-new, empty chat document. */
function emptyChat() {
  return { version: CHAT_VERSION, conversations: [] };
}

/**
 * One conversation row, with every documented field present.
 *
 * `turns` lives inside the row on disk; the wire shape splits it out, so a list
 * row and a read row can differ without either lying about the other.
 * @param input - a stored or requested conversation.
 * @param now - the fallback timestamps.
 * @returns the normalised row.
 */
function normaliseConversation(input, now = Date.now()) {
  const mode = input?.mode === 'snippet' ? 'snippet' : 'project';
  const path = normalisePath(input?.path);
  const start = asLine(input?.startLine, null);
  const end = start === null ? null : Math.max(start, asLine(input?.endLine, start));
  const created = Math.trunc(Number(input?.createdAt));
  const updated = Math.trunc(Number(input?.updatedAt));
  const selectedCode = typeof input?.selectedCode === 'string' ? input.selectedCode : '';
  return {
    id: asString(input?.id) === '' ? mintId('c') : asString(input.id),
    title: collapseWhitespace(input?.title ?? '') || '新对话',
    mode: mode === 'snippet' && (path === '' || selectedCode === '') ? 'project' : mode,
    createdAt: Number.isFinite(created) && created > 0 ? created : now,
    updatedAt: Number.isFinite(updated) && updated > 0 ? updated : now,
    path,
    startLine: start,
    endLine: end,
    selectedCode: selectedCode.slice(0, MAX_SELECTED_CODE_CHARS),
    graphAnchor: asString(input?.graphAnchor) === '' ? null : asString(input.graphAnchor),
    turns: Array.isArray(input?.turns) ? input.turns.map((turn) => normaliseTurn(turn, now)) : [],
  };
}

/**
 * The wire row: the conversation record without its turns.
 * @param conversation - a normalised conversation.
 * @returns the record `WIRE-CHAT.md §10` documents.
 */
function conversationRow(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    path: conversation.path,
    startLine: conversation.startLine,
    endLine: conversation.endLine,
    selectedCode: conversation.selectedCode,
    graphAnchor: conversation.graphAnchor,
    // Additive, documented in the delivery report: a sidebar needs a preview and a
    // turn count, and a second round trip per row to get them is what makes a
    // conversation list feel slow. Neither field is part of the contract.
    turnCount: conversation.turns.length,
    excerpt: excerptOf(conversation),
  };
}

/** A one-line preview: the last turn's first meaningful line. */
function excerptOf(conversation) {
  for (let index = conversation.turns.length - 1; index >= 0; index -= 1) {
    const text = String(conversation.turns[index].text ?? '').trim();
    if (text === '') continue;
    const line = text.split('\n').map((row) => row.trim()).find((row) => row !== '' && !row.startsWith('```')) ?? '';
    if (line === '') continue;
    return line.length > 160 ? `${line.slice(0, 160)}…` : line;
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * Reads                                                              *
 * ------------------------------------------------------------------ */

/**
 * Read one root's chat document.
 *
 * Mirror of `store.loadNotes`, deliberately: absent is a new workspace, a version
 * mismatch is this plugin's own schema moving forward, and anything else is
 * damaged user data that must be preserved and refused.
 * @param root - absolute workspace root.
 * @returns `{ version, conversations }`, always with an array.
 * @throws when the stored file exists but cannot be parsed.
 */
export async function loadChat(root) {
  const file = statePath(root, 'chat');
  const result = await readJsonChecked(file);

  if (!result.ok) {
    if (result.reason === 'absent') return emptyChat();
    const aside = `${file}.corrupt-${Date.now()}`;
    try {
      await fs.rename(file, aside);
    } catch {
      // If it cannot be moved aside, still refuse to overwrite it.
    }
    throw new Error(
      `conversation store is unreadable (${result.detail ?? 'parse error'}); the damaged file was kept at ${aside}`,
    );
  }

  const document = result.value;
  if (document.storeVersion !== STORE_VERSION) return emptyChat();
  return {
    version: CHAT_VERSION,
    conversations: Array.isArray(document.conversations)
      ? document.conversations.map((row) => normaliseConversation(row))
      : [],
  };
}

/* ------------------------------------------------------------------ *
 * Writes                                                             *
 * ------------------------------------------------------------------ */

/**
 * One promise chain per file, so a read-modify-write cycle never races another.
 *
 * Not the same map as `store.js`'s: that one is private, and the *queue* this
 * module needs is over the read-modify-write cycle, which `store.writeJson` only
 * half-provides. Every chat mutation therefore enters here first and calls
 * `writeJson` (atomic, and separately queued) from inside.
 *
 * `then(task, task)` continues the chain after a failed cycle, so one unreadable
 * document cannot wedge every later write for the process lifetime.
 */
const writeChains = new Map();

/**
 * Run `task` after every earlier cycle on `file` has settled.
 * @param file - the document's absolute path.
 * @param task - the work to perform.
 * @returns the task's value.
 */
function serialise(file, task) {
  const prior = writeChains.get(file) ?? Promise.resolve();
  const next = prior.then(task, task);
  writeChains.set(file, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * Read-modify-write the chat document as one queued cycle.
 *
 * This is the only safe way to mutate conversations. `loadChat → mutate →
 * write` without the queue is a lost-update bug the moment two panels (or the
 * streaming writer and a rename) overlap; queueing the whole cycle means the
 * second caller's `loadChat` observes the first caller's write.
 *
 * A throwing mutator aborts the cycle **before** anything is written, so a
 * "conversation not found" error cannot silently publish a half-applied document.
 *
 * @param root - absolute workspace root.
 * @param mutate - `(document) => value | Promise<value>`; may mutate in place.
 * @returns the mutator's value.
 * @throws when the stored file is unreadable, the mutator throws, or the write
 *   does not land.
 */
export async function updateChat(root, mutate) {
  const file = statePath(root, 'chat');
  return serialise(file, async () => {
    const document = await loadChat(root);
    const value = await mutate(document);
    const saved = await writeJson(file, { ...document, storeVersion: STORE_VERSION });
    if (!saved) throw new Error('the conversation store could not be written (disk full or permission denied)');
    return value;
  });
}

/* ------------------------------------------------------------------ *
 * Operations                                                         *
 * ------------------------------------------------------------------ */

/**
 * `chat list` — newest first, without turns.
 * @param root - absolute workspace root.
 * @param options - `{ query, limit }`.
 * @returns `[{ …conversationRow }]`.
 */
export async function listConversations(root, options = {}) {
  const document = await loadChat(root);
  const query = collapseWhitespace(options.query ?? '').toLowerCase();
  const limit = Math.max(1, Math.min(LIST_LIMIT_MAX, Math.trunc(Number(options.limit ?? LIST_LIMIT_DEFAULT)) || LIST_LIMIT_DEFAULT));
  return document.conversations
    .filter((conversation) => query === '' || matchesQuery(conversation, query))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit)
    .map(conversationRow);
}

/**
 * How many conversations this workspace has.
 *
 * Separate from `listConversations` because that function applies a display
 * limit: asking it for one row to count the store reports "1" forever once the
 * second conversation exists.
 * @param root - absolute workspace root.
 * @returns the number of stored conversations.
 */
export async function countConversations(root) {
  const document = await loadChat(root);
  return document.conversations.length;
}

/** True when a conversation's title, path or any turn text contains `query`. */
function matchesQuery(conversation, query) {
  if (String(conversation.title ?? '').toLowerCase().includes(query)) return true;
  if (String(conversation.path ?? '').toLowerCase().includes(query)) return true;
  return conversation.turns.some((turn) => String(turn.text ?? '').toLowerCase().includes(query));
}

/**
 * `chat read` — one conversation plus its turns.
 * @param root - absolute workspace root.
 * @param id - the conversation id.
 * @returns `{ conversation, turns }`.
 * @throws when the id is unknown.
 */
export async function readConversation(root, id) {
  const document = await loadChat(root);
  const conversation = document.conversations.find((row) => row.id === id);
  if (conversation === undefined) throw new Error(`conversation not found: ${String(id)}`);
  return { conversation: conversationRow(conversation), turns: conversation.turns };
}

/**
 * Create one conversation.
 *
 * The title is cleaned the same way a note title is (`cleanTitle`/`clipTitle`):
 * a caller that passes a question rather than a name gets a sidebar row that
 * reads as a topic instead of a wall of text. A `mode: "snippet"` without a path
 * or without the code degrades to `project`, because a selection that does not
 * exist cannot be the subject of anything.
 *
 * @param root - absolute workspace root.
 * @param request - `{ title, mode, path, startLine, endLine, selectedCode, graphAnchor }`.
 * @returns `{ conversation }` (the wire row, without turns).
 */
export async function createConversation(root, request = {}) {
  const now = Date.now();
  const rawTitle = collapseWhitespace(request.title ?? '');
  // A snippet conversation is named after the code it is about ("about
  // cluster.py lines 10-40"). Note-title cleaning would strip the location and
  // cut at the dot in "cluster.py", leaving a title that names nothing.
  const snippetTitle = request.mode === 'snippet'
    && typeof request.path === 'string' && request.path.trim() !== ''
    && typeof request.selectedCode === 'string' && request.selectedCode.trim() !== '';
  const title = rawTitle === ''
    ? '新对话'
    : snippetTitle
      ? clipTitle(rawTitle, MAX_TITLE_CHARS)
      : clipTitle(cleanTitle(rawTitle) || firstSentence(rawTitle) || rawTitle, MAX_TITLE_CHARS);
  const mode = request.mode === 'snippet' ? 'snippet' : 'project';
  return updateChat(root, (document) => {
    const conversation = normaliseConversation({
      id: mintId('c'),
      title,
      mode,
      createdAt: now,
      updatedAt: now,
      path: request.path,
      startLine: request.startLine,
      endLine: request.endLine,
      selectedCode: request.selectedCode,
      graphAnchor: request.graphAnchor,
      turns: [],
    }, now);
    document.conversations.push(conversation);
    return { conversation: conversationRow(conversation) };
  });
}

/**
 * Rename one conversation.
 * @param root - absolute workspace root.
 * @param id - the conversation id.
 * @param title - the new title; an empty one is refused rather than stored.
 * @returns `{ conversation }`.
 */
export async function renameConversation(root, id, title) {
  const cleaned = clipTitle(cleanTitle(collapseWhitespace(title ?? '')) || collapseWhitespace(title ?? ''), MAX_TITLE_CHARS);
  if (cleaned === '') throw new Error('rename: `title` must not be empty');
  return updateChat(root, (document) => {
    const conversation = document.conversations.find((row) => row.id === id);
    if (conversation === undefined) throw new Error(`conversation not found: ${String(id)}`);
    conversation.title = cleaned;
    conversation.updatedAt = Date.now();
    return { conversation: conversationRow(conversation) };
  });
}

/**
 * Delete one conversation and its turns.
 * @param root - absolute workspace root.
 * @param id - the conversation id.
 * @returns `{ deleted: true }`.
 */
export async function deleteConversation(root, id) {
  return updateChat(root, (document) => {
    const index = document.conversations.findIndex((row) => row.id === id);
    if (index < 0) throw new Error(`conversation not found: ${String(id)}`);
    document.conversations.splice(index, 1);
    return { deleted: true };
  });
}

/**
 * Drop a conversation's turns, keeping the row (and its selection/title).
 *
 * "Clear" rather than "delete" because the conversation is the snippet the reader
 * opened, not only the messages under it.
 * @param root - absolute workspace root.
 * @param id - the conversation id.
 * @returns `{ conversation }` with an empty `turns`.
 */
export async function clearConversation(root, id) {
  return updateChat(root, (document) => {
    const conversation = document.conversations.find((row) => row.id === id);
    if (conversation === undefined) throw new Error(`conversation not found: ${String(id)}`);
    conversation.turns = [];
    conversation.updatedAt = Date.now();
    return { conversation: { ...conversationRow(conversation), turns: [] } };
  });
}

/**
 * Append one turn.
 *
 * Idempotent by turn id: the `ask` writer persists the user turn before dispatch
 * and the assistant turn on completion, and a client retry that resends the same
 * id must not double the row. An existing turn is returned unchanged rather than
 * overwritten, so a retry cannot rewrite an answer already on screen.
 *
 * @param root - absolute workspace root.
 * @param id - the conversation id.
 * @param turn - the turn to append.
 * @returns `{ turn }`.
 */
export async function appendTurn(root, id, turn) {
  return updateChat(root, (document) => {
    const conversation = document.conversations.find((row) => row.id === id);
    if (conversation === undefined) throw new Error(`conversation not found: ${String(id)}`);
    const incoming = normaliseTurn(turn);
    const existing = conversation.turns.find((row) => row.id === incoming.id);
    if (existing !== undefined) return { turn: existing };
    conversation.turns.push(incoming);
    conversation.updatedAt = Math.max(conversation.updatedAt ?? 0, incoming.createdAt);
    return { turn: incoming };
  });
}

/**
 * Resolve the conversation an `ask` belongs to, creating one when the request
 * names none.
 *
 * This is what makes a first question work without a create round trip
 * (`WIRE-CHAT.md §13`). A *named* id that does not exist is an error, not a new
 * conversation: silently creating one would hide a client bug and drop the
 * user's history out of their sidebar.
 *
 * @param root - absolute workspace root.
 * @param request - `{ conversationId, title, mode, path, startLine, endLine,
 *   selectedCode, graphAnchor }`.
 * @returns `{ conversation, turns }`.
 */
export async function ensureConversation(root, request = {}) {
  const id = asString(request.conversationId);
  if (id !== '') return readConversation(root, id);
  const created = await createConversation(root, request);
  return { conversation: created.conversation, turns: [] };
}

/**
 * Set one turn's `noteId` after a note was generated from it.
 *
 * Best effort by design: the note is already saved when this runs, and failing to
 * record the back-link must not make `noteFromChat` report a failure it did not
 * have. The caller decides whether to await it.
 * @param root - absolute workspace root.
 * @param conversationId - the conversation id.
 * @param turnId - the assistant turn id, or null for "no single turn".
 * @param noteId - the note id.
 * @returns true when the link was written.
 */
export async function linkTurnToNote(root, conversationId, turnId, noteId) {
  if (asString(turnId) === '') return false;
  try {
    await updateChat(root, (document) => {
      const conversation = document.conversations.find((row) => row.id === conversationId);
      if (conversation === undefined) return false;
      const turn = conversation.turns.find((row) => row.id === turnId);
      if (turn === undefined) return false;
      turn.noteId = String(noteId);
      return true;
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * A conversation title derived from a question, for the auto-created
 * conversation path. Kept here so `answer.js` and `api-chat.js` agree on it.
 * @param question - the user's question.
 * @returns the title (never empty).
 */
export function titleFromQuestion(question) {
  const text = collapseWhitespace(question ?? '');
  if (text === '') return '新对话';
  return clipTitle(cleanTitle(text) || firstSentence(text) || text, MAX_TITLE_CHARS) || '新对话';
}
