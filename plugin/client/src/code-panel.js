/**
 * `code-panel.js` — the read-only code reader.
 *
 * One `POST /codeslice/api/code` per open target (`WIRE-CHAT.md §12`), then
 * nothing: the response already carries everything the pane decorates with —
 * `symbols` overlapping the window, `annotations` and `notes` whose ranges
 * overlap it — so marking a range up costs no extra round trip.
 *
 * The window is rendered by the CodeMirror chunk (`client/editor.js`, lazily
 * fetched from the Host). It has real syntax highlighting and text selection,
 * while the desktop gesture is preserved: a line **number** is a picker — first
 * click sets the start, a second sets the end, a third starts over — and a text
 * drag reports the same line span. Every change is reported through
 * `onSelectionChange` so the conversation panel can bind the next question to it.
 *
 * Discipline borrowed from `graph-panel.js`:
 *   - `visible === false` means parked-but-mounted: abort the scope, fetch again
 *     on resume, never `dispose` (that is the unmount path and it is terminal).
 *   - Narrow/wide is measured from *this* element's box, never the viewport.
 *   - No polling. Mount, target change, resumed edge, explicit refresh.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from './icons.js';
import { makeCaller, makeRequestScope } from './api.js';
import { loadEditor } from './assets.js';
import { Glyph, h } from './icons.js';
import { formatInt } from './i18n.js';

/** Below this width the toolbar drops its secondary labels. */
const CODE_NARROW_WIDTH = 340;

/**
 * Read a `target` prop into the two fields that matter.
 *
 * Accepts `{path, line}` (a citation, a graph node) and `{path, startLine,
 * endLine}` (a range), because both arrive from the caller and the pane should
 * not depend on which one it got.
 * @param target - the prop.
 * @returns `{path, startLine, endLine}` with `startLine`/`endLine` optional.
 */
function codeReadTarget(target) {
  if (target === undefined || target === null) return { path: '', };
  const path = typeof target.path === 'string' ? target.path : '';
  if (path === '') return { path: '' };
  // A single line means "reveal this line", not "show a one-line window": the
  // wire reads an omitted `endLine` as "from here to the end of the window". A
  // citation to a function therefore lands with the function visible.
  const single = Number(target.line ?? target.startLine);
  const startLine = Number.isFinite(single) && single > 0 ? Math.trunc(single) : undefined;
  const last = Number(target.endLine);
  const endLine = Number.isFinite(last) && last > 0 ? Math.trunc(last) : undefined;
  return endLine === undefined ? { path, startLine } : { path, startLine, endLine };
}

/**
 * The last path segment, for a header too narrow to show a directory.
 * @param path - a workspace-relative path.
 * @returns the basename.
 */
function codeBaseName(path) {
  const text = String(path ?? '');
  const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return cut < 0 ? text : text.slice(cut + 1);
}

/**
 * The declaration rows that start inside the returned window.
 * @param symbols - the `code` response's symbols.
 * @param startLine - the window's first line.
 * @returns a map of 1-based line → symbol.
 */
function codeSymbolLines(symbols, startLine) {
  const map = new Map();
  for (const row of Array.isArray(symbols) ? symbols : []) {
    const line = Number(row.line);
    if (!Number.isFinite(line) || line < startLine) continue;
    if (!map.has(line)) map.set(line, row);
  }
  return map;
}

/**
 * The code reader.
 *
 * @param props - `{ctx, cwd, t, locale, visible, target, onAskSelection,
 *   onSelectionChange}`:
 *   `target` is `{path, line}` or `{path, startLine, endLine}`;
 *   `onAskSelection(selection)` hands `{path, startLine, endLine, code}` up for
 *   the conversation panel; `onSelectionChange(selection | null)` keeps the
 *   workbench's shared selection in step on every change.
 * @returns the pane.
 */
export function CodePanel(props) {
  const {
    ctx, cwd, t, locale, visible, target, onAskSelection, onSelectionChange,
  } = props;
  const parked = visible === false;

  const workspace = typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
  const call = useMemo(() => makeCaller(ctx, workspace), [ctx, workspace]);
  const wanted = useMemo(() => codeReadTarget(target), [target]);

  const [file, setFile] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(undefined);
  const [pick, setPick] = useState({ start: undefined, end: undefined });
  const [narrow, setNarrow] = useState(false);
  const [notice, setNotice] = useState(undefined);
  const [copied, setCopied] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const requests = useRef(undefined);
  const alive = useRef(true);
  const hostRef = useRef(null);
  const editorRef = useRef(null);
  const editorHandle = useRef(undefined);
  const [editorApi, setEditorApi] = useState(undefined);
  const [editorError, setEditorError] = useState(undefined);
  const [editorNonce, setEditorNonce] = useState(0);
  const [flash, setFlash] = useState(undefined);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /* ---- request scope --------------------------------------------- */

  useEffect(() => {
    const scope = makeRequestScope();
    requests.current = scope;
    return () => {
      scope.dispose();
      requests.current = undefined;
    };
  }, []);

  /* ---- measure this pane's own box -------------------------------- */

  useEffect(() => {
    const element = hostRef.current;
    if (element === null || element === undefined || parked) return undefined;
    const read = () => {
      setNarrow(element.getBoundingClientRect().width < CODE_NARROW_WIDTH);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [parked, file]);

  /* ---- fetch ------------------------------------------------------ */

  const load = useCallback(async () => {
    const scope = requests.current;
    if (scope === undefined) return;
    if (wanted.path === '') {
      setFile(undefined);
      setError(undefined);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const payload = { path: wanted.path };
      if (wanted.startLine !== undefined) payload.startLine = wanted.startLine;
      if (wanted.endLine !== undefined) payload.endLine = wanted.endLine;
      const value = await scope.run((signal) => call('code', payload, signal));
      if (value === undefined || !alive.current) return;
      setFile(value);
    } catch (caught) {
      if (caught && caught.name === 'AbortError') return;
      if (alive.current) {
        setFile(undefined);
        setError(caught && caught.message ? caught.message : String(caught));
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call, wanted.path, wanted.startLine, wanted.endLine]);

  /* ---- first paint, target change, and every resume --------------- */

  const painted = useRef('');
  const wasParked = useRef(parked);
  const stamp = `${wanted.path}:${wanted.startLine ?? ''}:${wanted.endLine ?? ''}`;

  useEffect(() => {
    const resumed = wasParked.current && !parked;
    wasParked.current = parked;
    if (parked) {
      // Parking cancels rather than disposes: the scope has to survive until the
      // pane comes back, or every later `run` is a no-op.
      requests.current?.abort();
      return;
    }
    if (painted.current === stamp && !resumed) return;
    painted.current = stamp;
    void load();
  }, [parked, stamp, load]);

  // A new target is a new pair of endpoints: a half-finished pick from the last
  // file would otherwise silently bind the next question to the wrong lines.
  useEffect(() => {
    setPick({ start: undefined, end: undefined });
    setNoteOpen(false);
    setNotice(undefined);
    setFlash(undefined);
  }, [stamp]);

  /* ---- reveal the requested line, once per stamp ------------------ */

  const lines = useMemo(() => {
    const text = typeof file?.text === 'string' ? file.text : '';
    return text === '' ? [] : text.split('\n');
  }, [file?.text]);

  const startLine = Number.isFinite(Number(file?.startLine)) ? Number(file.startLine) : 1;

  /* ---- the CodeMirror chunk -------------------------------------- */

  useEffect(() => {
    if (parked || wanted.path === '' || file === undefined || file.found === false) return undefined;
    let cancelled = false;
    setEditorError(undefined);
    loadEditor(ctx).then((namespace) => {
      if (!cancelled) setEditorApi(namespace);
    }).catch((caught) => {
      if (!cancelled) setEditorError(caught && caught.message ? caught.message : String(caught));
    });
    return () => { cancelled = true; };
  }, [ctx, parked, wanted.path, file?.found, editorNonce]);

  const onEditorSelection = useCallback((range) => {
    if (range === null) {
      setPick({ start: undefined, end: undefined });
      return;
    }
    setPick({ start: range.startLine, end: range.endLine });
  }, []);

  const onGutterPick = useCallback((line) => {
    setNotice(undefined);
    setPick((current) => {
      if (current.start === undefined) return { start: line, end: line };
      if (current.start === line && current.end === line) return { start: undefined, end: undefined };
      return { start: current.start, end: line };
    });
  }, []);

  // One editor per loaded window. Recreating rather than `setDoc` keeps the
  // CodeMirror state (undo history, search, folds) from leaking across files.
  useEffect(() => {
    if (editorApi === undefined || editorRef.current === null) return undefined;
    if (file === undefined || file.found === false) return undefined;
    const handle = editorApi.create(editorRef.current, {
      doc: file.text ?? '',
      startLine,
      language: file.language ?? '',
      decorations: {
        symbols: file.symbols,
        annotations: file.annotations,
        notes: file.notes,
        pick: pick.start === undefined
          ? null
          : { startLine: Math.min(pick.start, pick.end ?? pick.start), endLine: Math.max(pick.start, pick.end ?? pick.start) },
        flash,
      },
      onSelection: onEditorSelection,
      onGutterPick,
    });
    editorHandle.current = handle;
    return () => {
      handle.destroy();
      if (editorHandle.current === handle) editorHandle.current = undefined;
    };
  }, [editorApi, file?.text, file?.language, file?.found, startLine]);

  /* ---- decorations follow the selection and the fetched marks ---- */

  useEffect(() => {
    const handle = editorHandle.current;
    if (handle === undefined) return;
    handle.setDecorations({
      symbols: file?.symbols,
      annotations: file?.annotations,
      notes: file?.notes,
      pick: pick.start === undefined
        ? null
        : { startLine: Math.min(pick.start, pick.end ?? pick.start), endLine: Math.max(pick.start, pick.end ?? pick.start) },
      flash,
    });
  }, [file?.symbols, file?.annotations, file?.notes, pick, flash]);

  useEffect(() => {
    if (flash === undefined) return undefined;
    const timer = setTimeout(() => setFlash(undefined), 1200);
    return () => clearTimeout(timer);
  }, [flash]);

  /* ---- reveal the requested line, once per stamp ------------------ */

  const revealed = useRef('');
  useEffect(() => {
    if (parked || file === undefined) return;
    const handle = editorHandle.current;
    if (handle === undefined) return;
    const wantedLine = wanted.startLine;
    const marker = `${stamp}:${wantedLine ?? ''}`;
    if (revealed.current === marker) return;
    revealed.current = marker;
    if (wantedLine === undefined) return;
    handle.scrollToLine(wantedLine);
    setFlash(wantedLine);
  }, [parked, file, stamp, wanted.startLine, editorApi, startLine]);

  /* ---- selection -------------------------------------------------- */

  const selection = useMemo(() => {
    if (pick.start === undefined) return null;
    const first = Math.min(pick.start, pick.end ?? pick.start);
    const last = Math.max(pick.start, pick.end ?? pick.start);
    const from = Math.max(0, first - startLine);
    const to = Math.max(from, last - startLine);
    const code = lines.slice(from, to + 1).join('\n');
    return {
      path: wanted.path, startLine: first, endLine: last, code,
    };
  }, [pick, lines, startLine, wanted.path]);

  // One effect for every change of the selection, so the workbench's copy and the
  // conversation panel's copy cannot disagree about what is selected.
  const selectionKey = selection === null ? '' : `${selection.path}:${selection.startLine}:${selection.endLine}`;
  const reportRef = useRef(onSelectionChange);
  reportRef.current = onSelectionChange;
  useEffect(() => {
    if (typeof reportRef.current !== 'function') return;
    reportRef.current(selection === null ? null : {
      path: selection.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
      code: selection.code,
    });
    // `selection` is rebuilt every render, so the key is the dependency that
    // actually changes.
  }, [selectionKey]);

  const pickLine = useCallback((number) => {
    if (!Number.isFinite(number) || number <= 0) return;
    setNotice(undefined);
    setPick((current) => {
      if (current.start === undefined) return { start: number, end: number };
      // A second click on the start line clears the pick: the same click that
      // selected it is the obvious way to undo it.
      if (current.start === number && current.end === number) {
        return { start: undefined, end: undefined };
      }
      return { start: current.start, end: number };
    });
  }, []);

  const clearPick = useCallback(() => {
    setPick({ start: undefined, end: undefined });
    setNoteOpen(false);
    editorHandle.current?.clearSelection?.();
  }, []);

  /* ---- copy ------------------------------------------------------- */

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copySelection = useCallback(() => {
    if (selection === null) return;
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip === undefined || typeof clip.writeText !== 'function') return;
    const text = `${wanted.path}:${selection.startLine}-${selection.endLine}\n${selection.code}`;
    clip.writeText(text).then(() => setCopied(true)).catch(() => {});
  }, [selection, wanted.path]);

  /* ---- ask / note ------------------------------------------------- */

  const ask = useCallback(() => {
    if (selection === null || typeof onAskSelection !== 'function') return;
    onAskSelection({
      path: selection.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
      code: selection.code,
    });
  }, [selection, onAskSelection]);

  const saveNote = useCallback(async (title) => {
    if (selection === null) return;
    const cleanTitle = String(title ?? '').trim();
    if (cleanTitle === '') return;
    const scope = requests.current;
    if (scope === undefined) return;
    setNotice(undefined);
    try {
      const value = await scope.run((signal) => call('notes', {
        op: 'create',
        title: cleanTitle,
        body: `## 知识点\n\n## 关联代码\n`,
        codeRefs: [{
          path: selection.path,
          line: selection.startLine,
          endLine: selection.endLine,
          symbol: codeSymbolLines(file?.symbols, startLine).get(selection.startLine)?.name,
        }],
      }, signal));
      if (value === undefined || !alive.current) return;
      const note = value.note ?? value;
      setNoteOpen(false);
      setNotice({
        kind: 'ok',
        text: t('code.note.saved', { title: note?.title ?? cleanTitle }),
      });
    } catch (caught) {
      if (caught && caught.name === 'AbortError') return;
      if (alive.current) {
        setNotice({
          kind: 'bad',
          text: t('code.note.failed', {
            detail: caught && caught.message ? caught.message : String(caught),
          }),
        });
      }
    }
  }, [selection, call, file?.symbols, startLine, t]);

  /* ---- derived ---------------------------------------------------- */

  const found = file === undefined ? true : file.found !== false;

  /* ---- render: no target ------------------------------------------ */

  if (wanted.path === '') {
    return h('div', { className: 'cs-code', ref: hostRef },
      h('div', { className: 'cs-code-empty' },
        Glyph.code(24),
        h('b', null, t('code.empty.title')),
        h('p', null, t('code.empty.body'))));
  }

  /* ---- render: failure -------------------------------------------- */

  if (error !== undefined && file === undefined) {
    return h('div', { className: 'cs-code', ref: hostRef },
      h('div', { className: 'cs-code-bar' },
        h('span', { className: 'cs-code-path', title: wanted.path }, wanted.path)),
      h('div', { className: 'cs-code-empty' },
        Glyph.alert(24),
        h('b', null, t('code.error.title')),
        h('p', null, error),
        h('button', {
          type: 'button', className: 'cs-btn', onClick: () => { void load(); },
        }, Glyph.refresh(12), t('common.retry'))));
  }

  /* ---- render: the file is gone ----------------------------------- */

  if (file !== undefined && found === false) {
    return h('div', { className: 'cs-code', ref: hostRef },
      h('div', { className: 'cs-code-bar' },
        h('span', { className: 'cs-code-path', title: wanted.path }, wanted.path)),
      h('div', { className: 'cs-code-empty' },
        Glyph.file(24),
        h('b', null, t('code.notFound', { path: codeBaseName(wanted.path) })),
        h('p', null, wanted.path)));
  }

  /* ---- render: the file ------------------------------------------- */

  const header = h('div', { className: 'cs-code-bar' },
    h('span', { className: 'cs-code-path', title: wanted.path },
      narrow ? codeBaseName(wanted.path) : wanted.path),
    file?.language !== undefined && file.language !== ''
      ? h('span', { className: 'cs-tag cs-accent' }, file.language)
      : null,
    file?.lines !== undefined
      ? h('span', { className: 'cs-tag cs-tabular' }, t('code.lines', { count: formatInt(file.lines, locale) }))
      : null,
    narrow || file?.symbols === undefined
      ? null
      : h('span', { className: 'cs-tag cs-tabular' },
        t('code.symbols', { count: formatInt(file.symbols.length, locale) })),
    loading ? h('span', { className: 'cs-spin' }, Glyph.spinner(11)) : null,
    h('div', { className: 'cs-grow' }),
    h('button', {
      type: 'button',
      className: 'cs-iconbtn',
      title: t('code.refresh'),
      'aria-label': t('code.refresh'),
      disabled: loading,
      onClick: () => { void load(); },
    }, Glyph.refresh(13)));

  const truncated = (() => {
    const total = Number(file?.lines);
    const last = Number(file?.endLine);
    if (!Number.isFinite(total) || total <= 0) return false;
    if (!Number.isFinite(last)) return false;
    return startLine > 1 || last < total;
  })();

  return h('div', { className: 'cs-code', ref: hostRef },
    header,

    notice === undefined
      ? null
      : h('div', { className: `cs-chat-banner${notice.kind === 'ok' ? ' cs-ok' : ''}` },
        notice.kind === 'ok' ? Glyph.check(13) : Glyph.alert(13),
        h('span', null, notice.text),
        h('button', {
          type: 'button', className: 'cs-iconbtn', 'aria-label': t('common.close'), onClick: () => setNotice(undefined),
        }, Glyph.close(11))),

    truncated
      ? h('div', { className: 'cs-code-hint' },
        h('span', { className: 'cs-ellipsis' },
          t('code.truncated', {
            start: formatInt(startLine, locale),
            end: formatInt(file?.endLine ?? startLine, locale),
            lines: formatInt(file?.lines ?? 0, locale),
          })))
      : null,

    h('div', { className: 'cs-code-editor' },
      h('div', { ref: editorRef, style: { height: '100%' } }),
      editorApi === undefined && editorError === undefined
        ? h('div', { className: 'cs-code-loading' },
          h('span', { className: 'cs-spin' }, Glyph.spinner(11)),
          h('span', null, t('code.editor.loading')))
        : null,
      editorError === undefined
        ? null
        : h('div', { className: 'cs-code-loading' },
          h('span', null, t('code.editor.failed')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            onClick: () => {
              setEditorApi(undefined);
              setEditorError(undefined);
              setEditorNonce((current) => current + 1);
            },
          }, t('common.retry')))),

    noteOpen && selection !== null
      ? h(CodeNoteForm, {
        path: selection.path,
        startLine: selection.startLine,
        endLine: selection.endLine,
        onCancel: () => setNoteOpen(false),
        onSave: (title) => { void saveNote(title); },
        t,
      })
      : null,

    selection === null
      ? h('div', { className: 'cs-code-hint' }, Glyph.target(11), h('span', { className: 'cs-ellipsis' }, t('code.hint')))
      : h('div', { className: 'cs-code-sel' },
        h('span', { className: 'cs-code-sel-label' },
          h('b', null, `${selection.startLine}-${selection.endLine}`),
          ' · ',
          t('code.selected', {
            start: formatInt(selection.startLine, locale),
            end: formatInt(selection.endLine, locale),
            count: formatInt(selection.endLine - selection.startLine + 1, locale),
          })),
        h('button', {
          type: 'button', className: 'cs-btn cs-small cs-primary', onClick: ask,
        }, Glyph.chatPlus(12), t('code.action.ask')),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small',
          disabled: noteOpen,
          onClick: () => setNoteOpen(true),
        }, Glyph.noteAdd(12), t('code.action.note')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small cs-ghost', onClick: copySelection,
        }, Glyph.copy(12), copied ? t('code.copied') : t('code.action.copy')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small cs-ghost', onClick: clearPick,
        }, t('code.action.clear'))));
}

/**
 * The inline "save these lines as a note" form.
 *
 * Inline rather than a modal: the point of saving a selection as a note is to
 * keep looking at the code while naming it.
 * @param props - `{path, startLine, endLine, onSave(title), onCancel, t}`.
 * @returns the form.
 */
function CodeNoteForm(props) {
  const {
    path, startLine, endLine, onSave, onCancel, t,
  } = props;
  const [title, setTitle] = useState(`${codeBaseName(path)} 第 ${startLine}-${endLine} 行`);
  return h('div', { className: 'cs-code-noteform' },
    h('div', { className: 'cs-row' },
      h('input', {
        className: 'cs-input',
        value: title,
        autoFocus: true,
        maxLength: 200,
        placeholder: t('code.note.title'),
        'aria-label': t('code.note.title'),
        onChange: (event) => setTitle(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSave?.(title);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel?.();
          }
        },
      }),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-primary',
        disabled: title.trim() === '',
        onClick: () => onSave?.(title),
      }, t('code.note.save')),
      h('button', {
        type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.(),
      }, t('code.note.cancel'))));
}
