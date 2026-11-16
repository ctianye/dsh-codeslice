/**
 * The `codeslice:reader` tab — file tree + multi-tab read-only code editor +
 * framed ranges.
 *
 * This is the sidebar area's single integration point (contract §2.1): the
 * integration side registers one tab type and hands props in; everything below
 * the tree / tab bar / frame rail is owned here.
 *
 * Layout:
 *   ┌───────────────────────────────┐
 *   │ file tree (filterable, folds) │
 *   ├───────────────────────────────┤
 *   │ tab strip (close / switch)    │
 *   ├────────────────────────┬──────┤
 *   │ CodeMirror host         │ frame│
 *   │                         │ rail │
 *   ├────────────────────────┴──────┤
 *   │ selection picker bar          │
 *   └───────────────────────────────┘
 *
 * Discipline borrowed from the existing panels:
 *   - `visible === false` means parked-but-mounted: abort the request scope,
 *     keep state, refetch on resume; never `dispose` (that is terminal);
 *   - one `makeRequestScope` owns every in-flight call, so a stale answer can
 *     never paint over the resumed pane;
 *   - selection and frames live per tab / per file, so switching tabs restores
 *     what each file last had selected.
 */

import {
  useState, useEffect, useMemo, useCallback, useRef, h, Glyph,
} from '../icons.js';
import { makeCaller, makeRequestScope } from '../api.js';
import { SbFileTree } from './tree.js';
import { SbTabBar } from './tabs.js';
import { SbEditorHost } from './editor.js';
import { SbFrameRail, sbDedupeFrames } from './frames.js';

/** The last path segment, for a tab label too narrow to show a directory. */
function sbBaseName(path) {
  const text = String(path ?? '');
  const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return cut < 0 ? text : text.slice(cut + 1);
}

/** First non-empty line, trimmed to a short frame title. */
function sbFirstLine(text) {
  const line = String(text ?? '').split('\n').map((part) => part.trim()).find((part) => part !== '');
  if (line === undefined) return '';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

/**
 * The reader panel.
 *
 * @param props - `{ctx, scope:{cwd?, sessionId?}, tab?:{path?,id}, visible?,
 *   focusRequest?, onOpenFile?, onAsk?, onAskSelection?, onSelectionChange?,
 *   onOpenSession?, t, locale}`.
 *   `onAskSelection({path,startLine,endLine,text})` hands the selection up to
 *   the conversation; `onOpenSession({sessionId,messageId?,title,question})`
 *   jumps back to the session that owns a frame.
 * @returns the panel.
 */
export function SidebarReader(props) {
  const {
    ctx, scope, tab, visible, focusRequest,
    onAskSelection, onSelectionChange, onOpenSession,
  } = props;
  const t = typeof props.t === 'function' ? props.t : (key) => key;
  const parked = visible === false;

  const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
  const sessionId = scope && typeof scope.sessionId === 'string' && scope.sessionId !== ''
    ? scope.sessionId : undefined;
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  /* ---- tree state ---------------------------------------------------- */
  const [treeEntries, setTreeEntries] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState(undefined);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(() => new Set(['']));
  const [treeNonce, setTreeNonce] = useState(0);

  /* ---- tabs and active file ------------------------------------------ */
  const [tabs, setTabs] = useState([]);
  const [activePath, setActivePath] = useState(undefined);
  const [file, setFile] = useState(undefined);
  const [fileError, setFileError] = useState(undefined);
  const [frames, setFrames] = useState([]);
  const [framesNonce, setFramesNonce] = useState(0);

  /* ---- ui state ------------------------------------------------------- */
  const [notice, setNotice] = useState(undefined);
  const [noteOpen, setNoteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // One request scope per request family. `makeRequestScope.run()` aborts the
  // previous controller and bumps the sequence, so two families sharing one
  // scope would silently supersede each other: the frames list firing right
  // after a code fetch would discard the file content (the editor never mounts).
  const treeScope = useRef(undefined);
  const codeScope = useRef(undefined);
  const framesScope = useRef(undefined);
  const notesScope = useRef(undefined);
  const alive = useRef(true);
  const fileCache = useRef(new Map());
  const pendingPick = useRef(undefined);
  const wasParked = useRef(parked);
  const activePathRef = useRef(activePath);

  const activeTab = useMemo(
    () => tabs.find((entry) => entry.path === activePath),
    [tabs, activePath],
  );

  /* ---- request scope + alive flag ------------------------------------- */

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  activePathRef.current = activePath;

  useEffect(() => {
    treeScope.current = makeRequestScope();
    codeScope.current = makeRequestScope();
    framesScope.current = makeRequestScope();
    notesScope.current = makeRequestScope();
    return () => {
      treeScope.current?.dispose();
      codeScope.current?.dispose();
      framesScope.current?.dispose();
      notesScope.current?.dispose();
      treeScope.current = undefined;
      codeScope.current = undefined;
      framesScope.current = undefined;
      notesScope.current = undefined;
    };
  }, []);

  /* ---- park / resume: abort in flight, refetch on wake ----------------- */

  useEffect(() => {
    const resumed = wasParked.current && !parked;
    wasParked.current = parked;
    if (parked) {
      treeScope.current?.abort();
      codeScope.current?.abort();
      framesScope.current?.abort();
      notesScope.current?.abort();
      return;
    }
    if (resumed) {
      setTreeNonce((n) => n + 1);
      setFramesNonce((n) => n + 1);
      fileCache.current.clear();
      setFile(undefined);
      setFileError(undefined);
      // The normal load effect refires on the `parked` transition and re-reads
      // the active file; no activePath change is needed to trigger it.
    }
  }, [parked]);

  /* ---- file tree ------------------------------------------------------- */

  useEffect(() => {
    if (parked) return undefined;
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(undefined);
    treeScope.current?.run((signal) => call('tree', {}, signal)).then((value) => {
      if (cancelled || !alive.current) return;
      setTreeEntries(Array.isArray(value?.entries) ? value.entries : []);
    }).catch((caught) => {
      if (cancelled || !alive.current) return;
      if (caught && caught.name === 'AbortError') return;
      setTreeError(caught && caught.message ? caught.message : String(caught));
    }).finally(() => {
      if (alive.current) setTreeLoading(false);
    });
    return () => { cancelled = true; };
  }, [parked, call, treeNonce]);

  /* ---- open / close / activate tabs ----------------------------------- */

  const openFile = useCallback((path) => {
    if (typeof path !== 'string' || path === '') return;
    setTabs((current) => (
      current.some((tabEntry) => tabEntry.path === path)
        ? current
        : [...current, { path, title: sbBaseName(path), pick: null }]
    ));
    setActivePath(path);
  }, []);

  const activateTab = useCallback((path) => setActivePath(path), []);

  const closeTab = useCallback((path) => {
    const index = tabs.findIndex((entry) => entry.path === path);
    const next = tabs.filter((entry) => entry.path !== path);
    setTabs(next);
    if (path === activePath) {
      const neighbor = next[Math.min(Math.max(index, 0), next.length - 1)];
      setActivePath(neighbor === undefined ? undefined : neighbor.path);
    }
  }, [tabs, activePath]);

  const toggleDir = useCallback((dirPath) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  // A pinned tab (`tab.path`) opens on first mount.
  useEffect(() => {
    const pinned = tab && typeof tab.path === 'string' && tab.path !== '' ? tab.path : undefined;
    if (pinned !== undefined) openFile(pinned);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A focus request from the graph opens the file and stages its range.
  const focusNonce = focusRequest && typeof focusRequest === 'object' ? focusRequest.nonce : undefined;
  useEffect(() => {
    if (focusRequest === undefined || focusRequest === null) return;
    if (typeof focusRequest.path !== 'string' || focusRequest.path === '') return;
    openFile(focusRequest.path);
    const commit = typeof focusRequest.commit === 'string' ? focusRequest.commit : '';
    const box = focusRequest.box;
    if (commit !== '' || (box !== undefined && box !== null)) {
      setTabs((current) => current.map((entry) => (entry.path === focusRequest.path
        ? {
          ...entry,
          ...(commit === '' ? {} : { commit }),
          ...(box === undefined || box === null ? {} : { frame: { startLine: box.startLine, endLine: box.endLine } }),
          ...(commit === '' ? {} : { title: `${sbBaseName(focusRequest.path)} @ ${commit.slice(0, 7)}` }),
        }
        : entry)));
    }
    const startLine = Number(focusRequest.startLine);
    if (Number.isFinite(startLine) && startLine > 0) {
      pendingPick.current = {
        path: focusRequest.path,
        start: Math.trunc(startLine),
        end: Number.isFinite(Number(focusRequest.endLine)) && Number(focusRequest.endLine) > 0
          ? Math.trunc(Number(focusRequest.endLine))
          : Math.trunc(startLine),
      };
    }
  }, [focusNonce, focusRequest, openFile]);

  /* ---- active file content --------------------------------------------- */

  useEffect(() => {
    if (parked || activePath === undefined) return undefined;
    const commit = typeof activeTab?.commit === 'string' ? activeTab.commit : '';
    const cacheKey = `${activePath}::${commit}`;
    const cached = fileCache.current.get(cacheKey);
    const staged = pendingPick.current;
    if (cached !== undefined) {
      setFile(cached);
      setFileError(undefined);
      if (staged !== undefined && staged.path === activePath) {
        pendingPick.current = undefined;
        setTabs((current) => current.map((entry) => (
          entry.path === activePath ? { ...entry, pick: { start: staged.start, end: staged.end } } : entry
        )));
      }
      return undefined;
    }
    let cancelled = false;
    const wantedPath = activePath;
    setFileError(undefined);
    codeScope.current?.run((signal) => call('code', {
      path: wantedPath,
      ...(commit === '' ? {} : { commit }),
    }, signal)).then((value) => {
      // Stale responses must not paint over another file: scope sequence +
      // cancelled flag already guard, and the path check is the backstop.
      if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
      fileCache.current.set(cacheKey, value);
      setFile(value);
      if (staged !== undefined && staged.path === wantedPath) {
        pendingPick.current = undefined;
        setTabs((current) => current.map((entry) => (
          entry.path === wantedPath ? { ...entry, pick: { start: staged.start, end: staged.end } } : entry
        )));
      }
    }).catch((caught) => {
      if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
      if (caught && caught.name === 'AbortError') return;
      setFile(undefined);
      setFileError(caught && caught.message ? caught.message : String(caught));
    });
    return () => { cancelled = true; };
  }, [parked, activePath, call, activeTab?.commit]);

  /* ---- frames for the active file -------------------------------------- */

  useEffect(() => {
    if (parked || activePath === undefined) {
      setFrames([]);
      return undefined;
    }
    let cancelled = false;
    const wantedPath = activePath;
    framesScope.current?.run((signal) => call('frames', { op: 'list', path: wantedPath }, signal)).then((value) => {
      if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
      setFrames(Array.isArray(value?.frames) ? value.frames : []);
    }).catch((caught) => {
      if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
      if (caught && caught.name === 'AbortError') return;
      setFrames([]);
    });
    return () => { cancelled = true; };
  }, [parked, activePath, call, framesNonce]);

  const dedupedFrames = useMemo(() => {
    const rows = frames.filter((frame) => frame?.path === activePath);
    const box = activeTab?.frame;
    const local = box === undefined || box === null
      ? []
      : [{
        path: activePath,
        startLine: Number(box.startLine),
        endLine: Number(box.endLine ?? box.startLine),
        status: 'fresh',
        title: t('reader.frame.citation'),
      }];
    return sbDedupeFrames([...rows, ...local]);
  }, [frames, activePath, activeTab?.frame, t]);

  /* ---- selection -------------------------------------------------------- */

  const startLine = Number.isFinite(Number(file?.startLine)) ? Number(file.startLine) : 1;
  const lines = useMemo(() => {
    const text = typeof file?.text === 'string' ? file.text : '';
    return text === '' ? [] : text.split('\n');
  }, [file?.text]);

  const updateTabPick = useCallback((path, pick) => {
    setTabs((current) => current.map((entry) => (entry.path === path ? { ...entry, pick } : entry)));
  }, []);

  const onEditorSelection = useCallback((range) => {
    if (activePath === undefined) return;
    if (range === null) {
      updateTabPick(activePath, null);
      return;
    }
    updateTabPick(activePath, { start: range.startLine, end: range.endLine });
  }, [activePath, updateTabPick]);

  const onGutterPick = useCallback((line) => {
    if (activePath === undefined || !Number.isFinite(line) || line <= 0) return;
    setTabs((current) => current.map((entry) => {
      if (entry.path !== activePath) return entry;
      const pick = entry.pick;
      if (pick === null || pick.start === undefined) return { ...entry, pick: { start: line, end: line } };
      if (pick.start === line && pick.end === line) return { ...entry, pick: null };
      return { ...entry, pick: { start: pick.start, end: line } };
    }));
  }, [activePath]);

  const selection = useMemo(() => {
    if (activeTab === undefined || activeTab.pick === null || activeTab.pick.start === undefined) return null;
    if (file === undefined || file.found === false) return null;
    const first = Math.min(Number(activeTab.pick.start), Number(activeTab.pick.end ?? activeTab.pick.start));
    const last = Math.max(Number(activeTab.pick.start), Number(activeTab.pick.end ?? activeTab.pick.start));
    const from = Math.max(0, first - startLine);
    const to = Math.max(from, last - startLine);
    const text = lines.slice(from, to + 1).join('\n');
    return { path: activePath, startLine: first, endLine: last, text };
  }, [activeTab, file, lines, startLine, activePath]);

  // Publish the shared selection so the workbench / composer stay in step.
  const reportRef = useRef(onSelectionChange);
  reportRef.current = onSelectionChange;
  const selectionKey = selection === null ? '' : `${selection.path}:${selection.startLine}:${selection.endLine}`;
  useEffect(() => {
    if (typeof reportRef.current !== 'function') return;
    reportRef.current(selection === null ? null : {
      path: selection.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
      code: selection.text,
    });
  }, [selectionKey]);

  /* ---- actions ---------------------------------------------------------- */

  const ask = useCallback(async () => {
    if (selection === null) return;
    if (typeof onAskSelection === 'function') {
      onAskSelection({
        path: selection.path,
        startLine: selection.startLine,
        endLine: selection.endLine,
        text: selection.text,
        code: selection.text,
      });
    }
    // Register the range as a frame in the current session so its box shows up.
    if (sessionId === undefined) return;
    try {
      await framesScope.current?.run((signal) => call('frames', {
        op: 'create',
        path: selection.path,
        startLine: selection.startLine,
        endLine: selection.endLine,
        sessionId,
        title: sbFirstLine(selection.text),
        question: selection.text,
      }, signal));
      if (alive.current) setFramesNonce((n) => n + 1);
    } catch {
      // The quote already went out; frame registration is best-effort.
    }
  }, [selection, onAskSelection, sessionId, call]);

  const openSession = useCallback((payload) => {
    if (typeof onOpenSession === 'function') onOpenSession(payload);
  }, [onOpenSession]);

  const deleteFrame = useCallback(async (frame) => {
    if (frame === undefined || frame.id === undefined) return;
    try {
      await framesScope.current?.run((signal) => call('frames', { op: 'delete', id: frame.id }, signal));
      if (alive.current) setFramesNonce((n) => n + 1);
    } catch {
      // A failed delete leaves the strip as-is; the next list refresh heals it.
    }
  }, [call]);

  const saveNote = useCallback(async (title) => {
    if (selection === null) return;
    const cleanTitle = String(title ?? '').trim();
    if (cleanTitle === '') return;
    try {
      const value = await notesScope.current?.run((signal) => call('notes', {
        op: 'create',
        title: cleanTitle,
        body: '## 知识点\n\n## 关联代码\n',
        codeRefs: [{
          path: selection.path,
          line: selection.startLine,
          endLine: selection.endLine,
        }],
      }, signal));
      if (!alive.current) return;
      const note = value?.note ?? value;
      setNoteOpen(false);
      setNotice({ kind: 'ok', text: t('reader.note.saved', { title: note?.title ?? cleanTitle }) });
    } catch (caught) {
      if (caught && caught.name === 'AbortError') return;
      if (alive.current) {
        setNotice({
          kind: 'bad',
          text: t('reader.note.failed', { detail: caught && caught.message ? caught.message : String(caught) }),
        });
      }
    }
  }, [selection, call, t]);

  const copySelection = useCallback(() => {
    if (selection === null) return;
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip === undefined || typeof clip.writeText !== 'function') return;
    const text = `${selection.path}:${selection.startLine}-${selection.endLine}\n${selection.text}`;
    clip.writeText(text).then(() => setCopied(true)).catch(() => {});
  }, [selection]);

  const clearPick = useCallback(() => {
    if (activePath === undefined) return;
    updateTabPick(activePath, null);
    setNoteOpen(false);
  }, [activePath, updateTabPick]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  /* ---- render ------------------------------------------------------------ */

  const found = file === undefined ? true : file.found !== false;

  return h('div', { className: 'cs-root cs-sb-root' },
    h(SbFileTree, {
      entries: treeEntries,
      activePath,
      expanded,
      onToggleDir: toggleDir,
      onOpenFile: openFile,
      filter,
      onFilterChange: setFilter,
      loading: treeLoading,
      error: treeError,
      onRetry: () => setTreeNonce((n) => n + 1),
      t,
    }),

    h(SbTabBar, {
      tabs,
      activePath,
      onActivate: activateTab,
      onClose: closeTab,
      t,
    }),

    notice === undefined
      ? null
      : h('div', { className: `cs-sb-banner${notice.kind === 'ok' ? ' cs-ok' : ''}` },
        notice.kind === 'ok' ? Glyph.check(13) : Glyph.alert(13),
        h('span', { className: 'cs-grow' }, notice.text),
        h('button', {
          type: 'button', className: 'cs-iconbtn', 'aria-label': t('common.close'),
          onClick: () => setNotice(undefined),
        }, Glyph.close(11))),

    activePath === undefined
      ? h('div', { className: 'cs-sb-empty' },
        Glyph.code(24),
        h('b', null, t('reader.empty.title')),
        h('p', null, t('reader.empty.body')))
      : fileError !== undefined && file === undefined
        ? h('div', { className: 'cs-sb-empty' },
          Glyph.alert(24),
          h('b', null, t('reader.error.title')),
          h('p', null, fileError),
          h('button', {
            type: 'button', className: 'cs-btn',
            onClick: () => {
              fileCache.current.delete(activePath);
              setFile(undefined);
              setFileError(undefined);
              setFramesNonce((n) => n + 1);
            },
          }, Glyph.refresh(12), t('reader.tree.retry')))
        : file !== undefined && found === false
          ? h('div', { className: 'cs-sb-empty' },
            Glyph.file(24),
            h('b', null, t('reader.notFound', { path: activePath })),
            h('p', null, activePath))
          : h('div', { className: 'cs-sb-body' },
            file?.history !== undefined && file.history !== null
              ? h('div', { className: 'cs-sb-history', 'data-cs': 'history-banner' },
                Glyph.layers(12),
                h('span', { className: 'cs-grow cs-ellipsis' },
                  t('reader.history.banner', {
                    sha: String(file.history.sha ?? '').slice(0, 7),
                    date: String(file.history.date ?? '').slice(0, 10),
                    subject: String(file.history.subject ?? ''),
                  })))
              : null,
            h(SbEditorHost, {
              ctx,
              file,
              pick: activeTab?.pick ?? null,
              frames: dedupedFrames,
              onSelection: onEditorSelection,
              onGutterPick,
              t,
            }),
            h(SbFrameRail, {
              frames: dedupedFrames,
              t,
              onOpenSession: openSession,
              onDelete: deleteFrame,
            })),

    noteOpen && selection !== null
      ? h(SbNoteForm, {
        path: selection.path,
        startLine: selection.startLine,
        endLine: selection.endLine,
        onCancel: () => setNoteOpen(false),
        onSave: (title) => { void saveNote(title); },
        t,
      })
      : null,

    selection === null
      ? activePath !== undefined && file !== undefined && found !== false
        ? h('div', { className: 'cs-sb-picker-bar' },
          Glyph.target(11),
          h('span', { className: 'cs-sb-picker-label cs-ellipsis' }, t('reader.hint')))
        : null
      : h('div', { className: 'cs-sb-picker-bar', 'data-cs': 'picker-bar' },
        h('span', { className: 'cs-sb-picker-label' },
          h('b', null, `${selection.startLine}-${selection.endLine}`),
          ' · ',
          t('reader.selected', {
            start: selection.startLine,
            end: selection.endLine,
            count: selection.endLine - selection.startLine + 1,
          })),
        h('button', {
          type: 'button', className: 'cs-btn cs-small cs-primary',
          onClick: () => { void ask(); },
        }, Glyph.chatPlus(12), t('reader.action.ask')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small',
          disabled: noteOpen,
          onClick: () => setNoteOpen(true),
        }, Glyph.noteAdd(12), t('reader.action.note')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small cs-ghost',
          onClick: copySelection,
        }, Glyph.copy(12), copied ? t('reader.copied') : t('reader.action.copy')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small cs-ghost',
          onClick: clearPick,
        }, t('reader.action.clear'))));
}

/**
 * The inline "save these lines as a note" form.
 *
 * Inline rather than modal: the point is to keep looking at the code while
 * naming the note. Mirrors the existing code pane's form.
 *
 * @param props - `{path, startLine, endLine, onSave(title), onCancel, t}`.
 * @returns the form node.
 */
function SbNoteForm(props) {
  const { path, startLine, endLine, onSave, onCancel, t } = props;
  const [title, setTitle] = useState(t('reader.note.defaultTitle', {
    file: sbBaseName(path), start: startLine, end: endLine,
  }));
  return h('div', { className: 'cs-sb-noteform' },
    h('div', { className: 'cs-row' },
      h('input', {
        className: 'cs-input',
        value: title,
        autoFocus: true,
        maxLength: 200,
        placeholder: t('reader.note.title'),
        'aria-label': t('reader.note.title'),
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
        type: 'button', className: 'cs-btn cs-small cs-primary',
        disabled: title.trim() === '',
        onClick: () => onSave?.(title),
      }, t('reader.note.save')),
      h('button', {
        type: 'button', className: 'cs-btn cs-small',
        onClick: () => onCancel?.(),
      }, t('reader.note.cancel'))));
}
