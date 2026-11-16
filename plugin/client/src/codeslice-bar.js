/**
 * The CodeSlice seat in the normal conversation composer.
 *
 * This is the bridge that lets the plugin live inside DSH's own dialog instead
 * of owning a second one:
 *
 *   - it shows the code range the reader last picked (`path:start-end`) above the
 *     input, so "what is this question about" is visible before sending;
 *   - "就这段提问" from any CodeSlice surface parks one quote request here, and
 *     this component inserts the quote through the host composer's own
 *     `inputActions` — the normal conversation, normal send, normal history;
 *   - "生成笔记" turns the *current DSH session* into a knowledge-base note, so
 *     the note is about the conversation the user actually had.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from './icons.js';
import { Glyph, h } from './icons.js';
import { makeCaller } from './api.js';
import {
  quoteText, setSelection, takePendingQuote, useSelectionState,
  setContextEnabled,
} from './selection-store.js';
import { resolveWorkspace } from './workspace-resolve.js';
import { revealCodeRange } from './reveal-code.js';

/** Prompt placed after the inserted code quote. */
const ASK_PROMPT = '请解释这段代码在做什么，以及为什么这么写。';

/**
 * @param props - the `conversation.input.dock` slot props, including
 *   `inputActions`, `sessionId`, `scope`, `t`.
 * @returns the bar.
 */
export function CodeSliceBar(props) {
  const {
    ctx, t, locale, scope, sessionId, inputActions,
  } = props;
  const workspace = resolveWorkspace(ctx, { ...props, scope });
  const call = useMemo(() => makeCaller(ctx, workspace), [ctx, workspace]);
  const state = useSelectionState(sessionId);
  const selection = state.selection;
  const contextOn = state.context === true;

  const [noteBusy, setNoteBusy] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [notice, setNotice] = useState(undefined);
  const alive = useRef(true);
  const restoreTried = useRef('');

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /* ---- one-shot quote requests from the code pane ------------------ */

  useEffect(() => {
    if (state.pending === null) return;
    const pending = takePendingQuote(sessionId);
    if (pending === null) return;
    const actions = inputActions;
    if (actions === undefined || actions === null) {
      setNotice({ kind: 'bad', text: t('bar.noComposer') });
      return;
    }
    // A graph node asks with plain text; a code range asks by quoting the code
    // and following it with the reading question.
    if (typeof pending.text === 'string' && pending.text !== '') {
      try {
        const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined;
        if (typeof actions.insertText === 'function' && span !== undefined) {
          actions.insertText(pending.text, span);
          return;
        }
      } catch {
        // Fall through to the quote path, which will report a missing composer.
      }
      setNotice({ kind: 'bad', text: t('bar.noComposer') });
      return;
    }
    const text = quoteText(pending.selection);
    if (text === '') return;
    if (typeof actions.insertQuote !== 'function') {
      setNotice({ kind: 'bad', text: t('bar.noComposer') });
      return;
    }
    actions.insertQuote(text);
    try {
      const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined;
      if (span !== undefined && typeof actions.insertText === 'function') {
        actions.insertText(ASK_PROMPT, span);
      }
    } catch {
      // The quote is already in; a prompt that could not be appended is not worth
      // an error banner.
    }
  }, [state, inputActions, sessionId, t]);

  /* ---- restore the last frame after a reload ------------------------- */

  useEffect(() => {
    if (selection !== null && selection !== undefined) {
      restoreTried.current = '';
      return undefined;
    }
    if (typeof sessionId !== 'string' || sessionId === '' || workspace === '') return undefined;
    if (restoreTried.current === sessionId) return undefined;
    restoreTried.current = sessionId;
    let live = true;
    call('frames', { op: 'list', root: workspace, sessionId })
      .then((value) => {
        if (!live) return;
        const frames = Array.isArray(value?.frames) ? value.frames : [];
        const latest = frames
          .slice()
          .sort((a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0))[0];
        if (latest === undefined) return;
        setSelection({
          path: latest.path,
          // A frame whose source shifted carries the anchored range; showing
          // the stored range would point at code that is no longer there.
          startLine: Number(latest.actualStart ?? latest.startLine),
          endLine: Number(latest.actualEnd ?? latest.endLine),
          code: '',
        }, sessionId);
      })
      .catch(() => {
        // No frame store or no frame: the label stays disabled, but a click can
        // never jump to the workbench or the notes page.
      });
    return () => { live = false; };
  }, [call, selection, sessionId, workspace]);

  /* ---- notes from the live DSH session ----------------------------- */

  const makeNote = useCallback(async () => {
    if (noteBusy) return;
    if (typeof sessionId !== 'string' || sessionId === '') {
      setNotice({ kind: 'bad', text: t('bar.noTurns') });
      return;
    }
    setNotice(undefined);
    setNoteBusy(true);
    try {
      // The transcript is read on the Host through `sessionQuery.readSurface`;
      // the client sends only the identity, so no Cordis reference objects cross
      // the wire and the session log stays the single source of truth.
      const value = await call('noteFromSession', {
        sessionId,
        title: t('bar.noteTitle'),
        path: selection?.path,
        startLine: selection?.startLine,
        endLine: selection?.endLine,
      });
      if (!alive.current) return;
      const title = value?.title ?? value?.note?.title ?? '';
      setNotice(value?.summaryFailed === true
        ? { kind: 'warn', text: t('bar.noteSavedRaw', { title }) }
        : { kind: 'ok', text: t('bar.noteSaved', { title }) });
    } catch (caught) {
      if (!alive.current) return;
      setNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setNoteBusy(false);
    }
  }, [call, noteBusy, selection, sessionId, t]);

  /**
   * Toggle whether the next question may use the project's relationships.
   *
   * The state is kept twice on purpose: this module store makes the bar's own
   * label immediate, while the Host copy feeds the dynamic `CodeSlice 联系上下文`
   * system-prompt section. A failed Host sync must not flip the button back —
   * the local session state remains authoritative for the UI.
   */
  const toggleContext = useCallback(async () => {
    if (selection === null || selection === undefined || contextBusy) return;
    const next = !contextOn;
    setContextEnabled(next, sessionId);
    setContextBusy(true);
    try {
      await call('context', { enabled: next, sessionId });
    } catch {
      // The local state + quote directive remain authoritative for this session.
    } finally {
      if (alive.current) setContextBusy(false);
    }
  }, [call, contextBusy, contextOn, selection, sessionId]);

  /* Keep the Host's prompt section in step with the bar when a session mounts
     or the selection changes. The Host state is process-wide, so a stale value
     from another conversation must not decide this one's answer. */
  useEffect(() => {
    if (selection === null || selection === undefined) return undefined;
    if (typeof sessionId !== 'string' || sessionId === '') return undefined;
    call('context', { enabled: contextOn, sessionId }).catch(() => {
      // A missing Host method only means the prompt section cannot be updated.
    });
    return undefined;
  }, [call, contextOn, selection, sessionId]);

  /**
   * Open the selected range in the sidebar editor.
   *
   * There is deliberately no fallback to the workbench: with no selection the
   * label is disabled, and a failed reveal is a failed reveal rather than a
   * surprising jump to the notes page.
   */
  const openSelection = useCallback(() => {
    if (selection === null || selection === undefined) return;
    revealCodeRange(ctx, selection, workspace, sessionId);
  }, [ctx, selection, sessionId, workspace]);

  const rangeLabel = selection === null
    ? t('bar.noSelection')
    : selection.startLine === selection.endLine
      ? `${selection.path}:${selection.startLine}`
      : `${selection.path}:${selection.startLine}-${selection.endLine}`;

  return h('div', { className: 'cs-bar-wrap' },
    h('div', { className: `cs-bar${selection === null ? '' : ' cs-bound'}` },
      h('button', {
        type: 'button',
        className: 'cs-bar-ref',
        disabled: selection === null,
        title: selection === null ? t('bar.noSelection') : `${selection.path}:${selection.startLine}-${selection.endLine} · 点击定位到代码`,
        onClick: openSelection,
      },
      h('span', { className: 'cs-dot' }),
      h('span', { className: 'cs-ellipsis' }, rangeLabel)),

      notice === undefined
        ? null
        : h('span', {
          className: `cs-bar-note${notice.kind === 'ok' ? ' cs-ok' : notice.kind === 'warn' ? ' cs-warn' : ' cs-bad'}`,
          title: notice.text,
        }, notice.kind === 'ok' ? Glyph.check(11) : Glyph.alert(11), h('span', { className: 'cs-ellipsis' }, notice.text)),

      h('span', { className: 'cs-grow' }),
      selection === null
        ? null
        : h('button', {
          type: 'button',
          className: `cs-btn cs-small cs-ghost cs-context${contextOn ? ' is-on' : ''}`,
          'aria-pressed': contextOn ? 'true' : 'false',
          title: contextOn ? t('bar.contextOnHint') : t('bar.contextOffHint'),
          disabled: contextBusy,
          onClick: () => { void toggleContext(); },
        }, Glyph.graph(11), t('bar.context')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-ghost',
        title: t('bar.noteHint'),
        disabled: noteBusy || typeof sessionId !== 'string' || sessionId === '',
        onClick: () => { void makeNote(); },
      }, Glyph.noteAdd(12), noteBusy ? t('bar.noteBusy') : t('bar.note'))));
}

/** Whether a surface can use the host composer. */
export function codeSliceBarAvailable(props) {
  return props !== null
    && props !== undefined
    && (typeof props.inputActions === 'object' || typeof props.useConversation === 'function');
}
