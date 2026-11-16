/**
 * The selection each session's CodeSlice surfaces share.
 *
 * The code pane, the graph, the main panel and the composer bar are rendered by
 * different slot trees, so React context cannot reach from one to another. A
 * module-level store is the smallest thing that lets them agree on "this is the
 * code range the reader is looking at" without coupling any two of them:
 *
 *   - the code pane publishes a selection under its session id;
 *   - the composer bar reads the selection for the session it belongs to;
 *   - "添加到对话" pushes a one-shot quote request; the bar — which owns the
 *     host composer's `inputActions` — inserts it into the normal conversation.
 *
 * A selection is per-session. The host re-mounts the composer when the user
 * switches conversations, and a single global slot made a range picked in one
 * conversation disappear from that conversation (or worse, appear in another)
 * as soon as a different editor cleared it. Keeping one slot per session means
 * switching away and back restores the label and the range it points at.
 *
 * The store is intentionally tiny and synchronous. It is not persisted: a
 * selection is a reading gesture, not user data.
 */

import { useState, useEffect } from './icons.js';

/** @type {{selections: Map<string, object>, contexts: Map<string, boolean>, pending: {selection?: object, text?: string, useContext?: boolean, sessionId: string, nonce: number}|null}} */
let state = { selections: new Map(), contexts: new Map(), pending: null };
let nonce = 0;
const listeners = new Set();

/** The map key for a session. An absent session is the legacy global slot. */
function keyOf(sessionId) {
  return typeof sessionId === 'string' && sessionId.trim() !== '' ? sessionId : '';
}

function publish(next) {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // One broken subscriber must not stop the others from seeing the change.
    }
  }
}

/** The current selection for one session, or null. */
export function getSelection(sessionId = '') {
  return state.selections.get(keyOf(sessionId)) ?? null;
}

/**
 * Whether a session's next question may use project context.
 *
 * Off by default, matching the desktop composer: a selected range is answered as
 * a range until the reader explicitly asks for the project's relationships.
 * @param sessionId - the session whose composer is asking.
 */
export function getContextEnabled(sessionId = '') {
  return state.contexts.get(keyOf(sessionId)) === true;
}

/**
 * Set one session's context preference.
 * @param enabled - true when project relationships may be used.
 * @param sessionId - the session that owns the composer toggle.
 */
export function setContextEnabled(enabled, sessionId = '') {
  const key = keyOf(sessionId);
  const next = enabled === true;
  if (state.contexts.get(key) === next) return;
  const contexts = new Map(state.contexts);
  contexts.set(key, next);
  publish({ ...state, contexts });
}

/**
 * Publish what the code pane has picked in one session.
 * @param selection - `{path, startLine, endLine, code}` or null.
 * @param sessionId - the session that owns the selection.
 */
export function setSelection(selection, sessionId = '') {
  const key = keyOf(sessionId);
  if (selection === null || selection === undefined) {
    // Clearing is explicit; an empty browser selection must not erase the
    // session's last range. `hideChip` already removes the in-editor action.
    if (!state.selections.has(key)) return;
    const selections = new Map(state.selections);
    selections.delete(key);
    publish({ ...state, selections });
    return;
  }
  const path = typeof selection.path === 'string' ? selection.path : '';
  if (path === '') return;
  const startLine = Math.max(1, Math.trunc(Number(selection.startLine ?? selection.line ?? 1)) || 1);
  const endLine = Math.max(startLine, Math.trunc(Number(selection.endLine ?? startLine)) || startLine);
  const selections = new Map(state.selections);
  selections.set(key, {
    path,
    startLine,
    endLine,
    code: typeof selection.code === 'string' ? selection.code : '',
  });
  publish({ ...state, selections });
}

/**
 * Ask for one quote to be inserted into one session's composer.
 *
 * The request is one-shot: the bar consumes it, so a remount does not paste the
 * same code twice.
 * @param selection - `{path, startLine, endLine, code}`.
 * @param sessionId - the target session; empty means the next bar to mount.
 */
export function requestQuote(selection, sessionId = '') {
  const path = typeof selection?.path === 'string' ? selection.path : '';
  if (path === '') return;
  const startLine = Math.max(1, Math.trunc(Number(selection.startLine ?? 1)) || 1);
  const endLine = Math.max(startLine, Math.trunc(Number(selection.endLine ?? startLine)) || startLine);
  nonce += 1;
  publish({
    ...state,
    pending: {
      selection: {
        path,
        startLine,
        endLine,
        code: typeof selection.code === 'string' ? selection.code : '',
      },
      useContext: getContextEnabled(sessionId),
      sessionId: keyOf(sessionId),
      nonce,
    },
  });
}

/**
 * Ask for one plain prompt to be inserted into one session's composer.
 *
 * The graph uses this for "ask about this node": there is no code range to
 * quote, but the question still belongs in the normal conversation.
 * @param text - the prompt.
 * @param sessionId - the target session; empty means the next bar to mount.
 */
export function requestPrompt(text, sessionId = '') {
  const body = String(text ?? '').trim();
  if (body === '') return;
  nonce += 1;
  publish({
    ...state,
    pending: { text: body, sessionId: keyOf(sessionId), nonce },
  });
}

/** Take the pending quote request for this session, if any. */
export function takePendingQuote(sessionId = '') {
  if (state.pending === null) return null;
  const target = state.pending.sessionId ?? '';
  const current = keyOf(sessionId);
  if (target !== '' && target !== current) return null;
  const pending = state.pending;
  publish({ ...state, pending: null });
  return pending;
}

/** Subscribe to every change; returns the disposer. */
export function subscribeSelection(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A hook for consumers that only need the selection of one session. */
export function useSelection(sessionId = '') {
  const [value, setValue] = useState(() => getSelection(sessionId));
  useEffect(() => {
    setValue(getSelection(sessionId));
    return subscribeSelection(() => setValue(getSelection(sessionId)));
  }, [sessionId]);
  return value;
}

/** A hook for the bar: one session's selection, context mode and pending request. */
export function useSelectionState(sessionId = '') {
  const [value, setValue] = useState(() => ({
    selection: getSelection(sessionId),
    context: getContextEnabled(sessionId),
    pending: state.pending?.sessionId === keyOf(sessionId) || state.pending?.sessionId === ''
      ? state.pending
      : null,
  }));
  useEffect(() => {
    const read = () => ({
      selection: getSelection(sessionId),
      context: getContextEnabled(sessionId),
      pending: state.pending !== null
        && (state.pending.sessionId === '' || state.pending.sessionId === keyOf(sessionId))
        ? state.pending
        : null,
    });
    setValue(read());
    return subscribeSelection(() => setValue(read()));
  }, [sessionId]);
  return value;
}

/** The quote text the host composer receives. */
export function quoteText(selection) {
  if (selection === null || selection === undefined) return '';
  const range = selection.startLine === selection.endLine
    ? `${selection.startLine}`
    : `${selection.startLine}-${selection.endLine}`;
  const code = typeof selection.code === 'string' && selection.code.trim() !== ''
    ? selection.code
    : `（${selection.path}:${range}）`;
  return `关于 ${selection.path} 第 ${range} 行：\n${code}`;
}
