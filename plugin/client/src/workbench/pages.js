/**
 * Workbench main panel (Agent D surface): the left-nav workbench with three
 * reader pages plus the settings page. No code panel lives here — code opening
 * is handed back through `props.onOpenFile` / `props.onOpenGraph`.
 *
 * Scope rules:
 *   - Every top-level declaration is `wb`-prefixed; the whole client bundle is
 *     one function scope, so a reused top-level name is a fatal redeclaration.
 *   - React and hooks come from `../icons.js`; there is no `import 'react'`.
 *   - Every API call is wrapped so a missing Host method or a missing field
 *     degrades to a visible empty state instead of throwing.
 */

import {
  h, useState, useEffect, useMemo, useCallback, useRef, Glyph,
} from '../icons.js';
import { makeCaller, makeRequestScope } from '../api.js';
import { resolveWorkspace } from '../workspace-resolve.js';
import { formatRelative, formatInt } from '../i18n.js';
import { Markdown, stripTitleLine } from '../markdown.js';
import { SettingsPage } from './settings.js';
import { GraphView } from '../graph/view.js';

/** The three workbench tabs, in navigation order. */
const WB_TABS = [
  { id: 'notes', glyph: 'notes', label: 'wb.nav.notes' },
  { id: 'projects', glyph: 'layers', label: 'wb.nav.projects' },
  { id: 'settings', glyph: 'settings', label: 'wb.nav.settings' },
];

/** Pull the workspace directory out of the scope, tolerating a missing scope. */
function wbCwd(scope) {
  return scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
}

/** The active conversation id, when the main panel is opened beside one. */
function wbSessionId(ctx, props, cwd) {
  const direct = props?.sessionId ?? props?.scope?.sessionId;
  if (typeof direct === 'string' && direct !== '') return direct;
  try {
    const ui = typeof ctx?.get === 'function' ? ctx.get('uiSession') : undefined;
    const current = ui?.current?.value;
    const nested = current?.props?.sessionId ?? current?.hooks?.session?.sessionId;
    if (typeof nested === 'string' && nested !== '') return nested;
  } catch {
    // fall through to the workspace model
  }
  if (typeof cwd === 'string' && cwd !== '') {
    const norm = (value) => String(value ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase();
    try {
      const model = typeof ctx?.get === 'function' ? ctx.get('workspaces')?.model : undefined;
      const items = Array.isArray(model?.items) ? model.items : [];
      const owner = items.find((item) => typeof item?.path === 'string' && norm(item.path) === norm(cwd));
      const first = Array.isArray(owner?.sessionIds) ? owner.sessionIds[0] : undefined;
      if (typeof first === 'string' && first !== '') return first;
    } catch {
      // try the sessions list next
    }
    try {
      const list = typeof ctx?.get === 'function' ? ctx.get('sessions')?.list?.getSnapshot?.() : undefined;
      const byId = list?.byId && typeof list.byId === 'object' ? list.byId : {};
      for (const [id, row] of Object.entries(byId)) {
        if (row && typeof row === 'object' && norm(row.cwd) === norm(cwd)) return id;
      }
    } catch {
      // no session id; the graph still renders project-level
    }
  }
  return undefined;
}

/** A note node when the id or kind marks it as a stored note. */
function wbIsNoteNode(node) {
  if (node === null || node === undefined) return false;
  if (node.kind === 'note') return true;
  return String(node.id ?? node.path ?? '').startsWith('note://');
}

/** Apply the folder scope and the local query to the note list. */
function wbFilterNotes(notes, query, folderId) {
  const needle = String(query ?? '').trim().toLowerCase();
  const scopeId = folderId ?? undefined;
  return (notes ?? []).filter((row) => {
    if (scopeId !== undefined && (row.folderId ?? undefined) !== scopeId) return false;
    if (needle === '') return true;
    return `${row.title ?? ''} ${row.excerpt ?? ''}`.toLowerCase().includes(needle);
  });
}

/**
 * Group notes under the folders they were filed in, newest first.
 *
 * The library has a real folder tree; a flat list hides it, which makes a
 * dozen notes look like a dozen unrelated files. Notes with no folder come
 * back separately so they can render at the top level.
 * @param folders - the folder tree rows.
 * @param notes - every note row.
 * @returns `{tree, loose}`.
 */
function wbNoteGroups(folders, notes) {
  const byFolder = new Map();
  for (const note of notes ?? []) {
    const key = note.folderId ?? '';
    const list = byFolder.get(key) ?? [];
    list.push(note);
    byFolder.set(key, list);
  }
  const newestFirst = (list) => list.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
  const build = (rows) => (rows ?? []).map((folder) => ({
    folder,
    notes: newestFirst([...(byFolder.get(folder.id) ?? [])]),
    children: build(folder.children),
  }));
  return { tree: build(folders), loose: newestFirst([...(byFolder.get('') ?? [])]) };
}

/** Map an anchor drift status to a workbench tag tone. */
function wbDriftClass(status) {
  if (status === 'fresh') return 'wb-ok';
  if (status === 'missing') return 'wb-bad';
  return 'wb-warn';
}

/**
 * The workbench shell: top tab strip shared by the three reader pages and the
 * settings page. Inactive pages stay in the DOM (hidden) so the harness can
 * assert every page container; only the active one fetches.
 *
 * @param props - `{ctx, scope, visible, t, locale, onOpenGraph, onOpenNote, onOpenFile}`.
 * @returns the shell.
 */
export function WorkbenchPage(props) {
  const { t, visible } = props;
  const panelParked = visible === false;
  const [tab, setTab] = useState('notes');
  const [graphRoot, setGraphRoot] = useState('');
  // Bumped on every visit back to the library so the list reloads: notes and
  // folders are also changed from the sidebar panel, which this page cannot see.
  const [refreshSeq, setRefreshSeq] = useState(0);

  // A global main-panel slot carries no conversation scope. Resolve the
  // workspace model once here so the note library and the note graph do not
  // each fail with "no workspace directory is available; pass root explicitly".
  const resolvedCwd = wbCwd(props.scope) ?? resolveWorkspace(props.ctx, props);
  const resolvedSessionId = wbSessionId(props.ctx, props, resolvedCwd);
  const pageScope = resolvedCwd !== undefined
    ? {
      ...(props.scope ?? {}),
      cwd: resolvedCwd,
      ...(resolvedSessionId === undefined ? {} : { sessionId: resolvedSessionId }),
    }
    : props.scope;

  const choose = useCallback((next) => {
    if (WB_TABS.some((row) => row.id === next)) {
      setTab(next);
      if (next === 'notes') setRefreshSeq((seq) => seq + 1);
    }
  }, []);

  const openGraph = useCallback((target) => {
    const root = typeof target?.root === 'string' ? target.root : '';
    if (root !== '') setGraphRoot(root);
    setTab('project-graph');
  }, []);

  return h('div', { className: 'wb-root', 'data-cs': 'workbench' },
    h('nav', {
      className: 'wb-nav',
      'data-cs': 'workbench-nav',
      role: 'tablist',
      'aria-label': t('wb.nav.title'),
    }, WB_TABS.map((row) => {
      const draw = Glyph[row.glyph];
      return h('button', {
        key: row.id,
        type: 'button',
        role: 'tab',
        className: `wb-nav-item${tab === row.id || (row.id === 'projects' && tab === 'project-graph') ? ' wb-on' : ''}`,
        'aria-pressed': tab === row.id ? 'true' : 'false',
        'data-tab': row.id,
        onClick: () => choose(row.id),
      }, draw === undefined ? t(row.label) : h('span', {
        style: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
      }, draw(12), t(row.label)));
    })),

    h('div', { className: 'wb-body' },
      h('div', {
        className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'notes',
        hidden: tab !== 'notes', role: 'tabpanel',
      }, h(WbNoteLibrary, {
        ...props, scope: pageScope, parked: panelParked || tab !== 'notes', refreshSeq,
      })),
      h('div', {
        className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'projects',
        hidden: tab !== 'projects', role: 'tabpanel',
      }, h(WbProjectList, {
        ...props,
        scope: pageScope,
        parked: panelParked || tab !== 'projects',
        onOpenGraph: openGraph,
      })),
      h('div', {
        className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'project-graph',
        hidden: tab !== 'project-graph', role: 'tabpanel',
      }, h(WbProjectGraph, {
        ...props,
        scope: pageScope,
        sessionId: resolvedSessionId,
        graphRoot,
        parked: panelParked || tab !== 'project-graph',
        onBack: () => setTab('projects'),
      })),
      h('div', {
        className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'settings',
        hidden: tab !== 'settings', role: 'tabpanel',
      }, h(SettingsPage, { ...props, scope: pageScope, parked: panelParked || tab !== 'settings' }))));
}

/* ------------------------------------------------------------------ *
 * Page 1: notes library (read-only shell over the `notes` API)         *
 * ------------------------------------------------------------------ */

/**
 * The code range a note points at, rendered where the note is read.
 *
 * A note outlives the code it quotes. Two cases matter and they must not look
 * alike: the same code still exists (lines may have shifted while it moved), and
 * the code is gone from today's tree — in which case the honest thing to show is
 * the commit the note was written against, not line 1 of whatever is there now.
 *
 * @param props - `{ peek, t, onOpen, onClose }`.
 * @returns the peek card, or null when nothing was requested.
 */
function WbCodePeek(props) {
  const { peek, t, onOpen, onClose } = props;
  if (peek === undefined || peek === null) return null;
  if (peek.loading === true) {
    return h('div', { className: 'wb-peek', 'data-cs': 'code-peek' },
      h('div', { className: 'wb-peek-head' },
        h('span', { className: 'wb-peek-path' }, peek.path ?? ''),
        h('span', { className: 'wb-peek-tag' }, t('wb.peek.loading'))));
  }
  if (peek.error !== undefined) {
    return h('div', { className: 'wb-peek', 'data-cs': 'code-peek' },
      h('div', { className: 'wb-peek-head' },
        h('span', { className: 'wb-peek-path' }, peek.path ?? ''),
        h('button', {
          type: 'button', className: 'wb-iconbtn', title: t('wb.peek.close'),
          'aria-label': t('wb.peek.close'), onClick: onClose,
        }, Glyph.close(12))),
      h('div', { className: 'wb-peek-empty' }, t('wb.peek.failed', { error: peek.error })));
  }

  const data = peek.data ?? {};
  const mode = data.mode ?? 'missing';
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const sha = typeof data.commit?.sha === 'string' ? data.commit.sha.slice(0, 7) : '';
  const date = typeof data.commit?.date === 'string' ? data.commit.date.slice(0, 10) : '';
  const tag = mode === 'worktree'
    ? (data.status === 'moved' ? t('wb.peek.moved') : t('wb.peek.current'))
    : mode === 'history' ? t('wb.peek.history', { sha }) : t('wb.peek.missing');

  return h('div', { className: `wb-peek${mode === 'history' ? ' wb-peek-history' : ''}`, 'data-cs': 'code-peek', 'data-mode': mode },
    h('div', { className: 'wb-peek-head' },
      h('span', { className: 'wb-peek-path', title: data.path ?? '' }, data.path ?? ''),
      h('span', { className: `wb-peek-tag${mode === 'history' ? ' wb-warn' : ''}` }, tag),
      h('span', { className: 'wb-peek-range' }, `${data.startLine ?? '—'}–${data.endLine ?? '—'}`),
      h('span', { className: 'cs-grow' }),
      mode === 'worktree'
        ? h('button', {
          type: 'button', className: 'cs-btn cs-small wb-btn-sm',
          onClick: () => onOpen(data.path, data.startLine, data.endLine),
        }, t('wb.peek.open'))
        : null,
      h('button', {
        type: 'button', className: 'wb-iconbtn', title: t('wb.peek.close'),
        'aria-label': t('wb.peek.close'), onClick: onClose,
      }, Glyph.close(12))),

    mode === 'history'
      ? h('div', { className: 'wb-peek-banner' },
        h('span', { className: 'wb-peek-sha' }, sha),
        h('span', null, `${date} · ${String(data.commit?.subject ?? '')}`),
        h('span', { className: 'wb-peek-gone' }, t('wb.peek.gone')))
      : null,

    rows.length === 0
      ? h('div', { className: 'wb-peek-empty' }, t('wb.peek.noCode'))
      : h('div', { className: 'wb-peek-code' }, rows.map((row) => h('div', {
        key: `l${row.line}`,
        className: row.line >= (data.startLine ?? 0) && row.line <= (data.endLine ?? 0) ? 'wb-peek-line wb-on' : 'wb-peek-line',
      }, h('span', { className: 'wb-peek-ln' }, String(row.line)),
      h('span', { className: 'wb-peek-src' }, row.text === '' ? ' ' : row.text)))),

    mode === 'missing'
      ? h('div', { className: 'wb-peek-banner' }, t('wb.peek.missingHint'))
      : null);
}

/**
 * Folder tree + note list + reader. Read-only: creation and editing stay with
 * the dedicated notes sidebar; this shell lists notes, opens them, and shows
 * anchor drift.
 * @param props - `{ctx, scope, parked, t, locale, onOpenFile}`.
 * @returns the library page.
 */
export function WbNoteLibrary(props) {
  const { ctx, scope, parked, t, locale, onOpenFile, refreshSeq } = props;
  // The tab can be opened before any conversation exists; without the resolver
  // fallback the library asked a different root and showed an empty shelf next
  // to a sidebar that listed notes.
  const cwd = wbCwd(scope) ?? resolveWorkspace(ctx, props);
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState(undefined);
  const [folderId, setFolderId] = useState(undefined);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(undefined);
  const [selected, setSelected] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [notice, setNotice] = useState(undefined);
  /* The citation the reader just clicked: loading, then located worktree/history. */
  const [peek, setPeek] = useState(undefined);

  const alive = useRef(true);
  const requests = useRef(undefined);
  const fileRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    const scopeReq = makeRequestScope();
    requests.current = scopeReq;
    return () => {
      alive.current = false;
      scopeReq.dispose();
      requests.current = undefined;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const value = await requests.current.run((signal) => call('notes', { op: 'list' }, signal));
      if (!alive.current || value === undefined) return;
      setFolders(Array.isArray(value.folders) ? value.folders : []);
      setNotes(Array.isArray(value.notes) ? value.notes : []);
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (parked) return undefined;
    void refresh();
    return undefined;
  }, [parked, refresh, refreshSeq]);

  const open = useCallback(async (id) => {
    setBusy(true);
    setError(undefined);
    try {
      const value = await requests.current.run((signal) => call('notes', { op: 'read', id }, signal));
      if (alive.current && value !== undefined && value.note !== undefined) {
        setNote(value.note);
        setShowGraph(false);
      }
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call]);

  const openCitation = useCallback((path, startLine, endLine) => {
    if (typeof onOpenFile === 'function') {
      try {
        // `cwd` and `sessionId` ride along: the main-panel slot has no
        // conversation scope of its own, and without them the right sidebar
        // cannot resolve which session's tab to reuse.
        onOpenFile({
          path,
          startLine,
          endLine,
          cwd,
          ...(scope?.sessionId === undefined ? {} : { sessionId: scope.sessionId }),
        });
        return;
      } catch {
        // Fall through to the sidebar service grammar.
      }
    }
    const sidebar = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
    try {
      if (sidebar && typeof sidebar.openFile === 'function' && scope !== undefined) {
        sidebar.openFile(scope, `${path}#L${startLine ?? 1}`);
      }
    } catch {
      // Without any opener the reader still shows the citation text.
    }
  }, [ctx, scope, onOpenFile, cwd]);

  /**
   * Click handling for one citation.
   *
   * The note's stored line number is a snapshot, not an address: ask the Host
   * where the code is now, then hand the answer to the right sidebar rather than
   * drawing a second code pane here. Worktree hits open today's file at the new
   * range; a hit that survives only in history opens the blob from the note's
   * own commit, and both carry the note's range so the sidebar can box it.
   */
  const revealCitation = useCallback(async (path, startLine, endLine, index) => {
    let located;
    try {
      located = await call('notes', {
        op: 'locate',
        ...(note?.id === undefined ? {} : { noteId: note.id }),
        ...(index === undefined ? {} : { index }),
        path,
        startLine,
        endLine,
      });
    } catch (caught) {
      if (alive.current) {
        setPeek({ path, error: caught && caught.message ? caught.message : String(caught) });
      }
      return;
    }
    if (!alive.current || located === undefined) return;

    if (located.mode === 'worktree' || located.mode === 'history') {
      let target = located.path ?? path;
      let title;
      if (located.mode === 'history' && typeof located.commit?.sha === 'string') {
        // The worktree copy is gone, so the editor has nothing to open: the Host
        // mirrors the blob at the note's commit into `.codeslice/history/<sha>/`.
        const shadow = await call('notes', {
          op: 'materialize',
          path: target,
          commit: located.commit.sha,
        });
        if (!alive.current || shadow === undefined || typeof shadow.path !== 'string') {
          setPeek({ data: located, path });
          return;
        }
        target = shadow.path;
        title = `${path} @ ${located.commit.sha.slice(0, 7)}`;
      }

      const sessionId = typeof note?.conversationId === 'string' && note.conversationId !== ''
        ? note.conversationId
        : (typeof scope?.sessionId === 'string' && scope.sessionId !== '' ? scope.sessionId : undefined);
      const start = located.startLine ?? startLine;
      const end = located.endLine ?? endLine;
      if (sessionId !== undefined) {
        // Recording the range as a frame is what paints the box in the editor;
        // the same interval dedupes, so repeated clicks do not stack strips.
        try {
          await call('frames', {
            op: 'create',
            path: target,
            startLine: start,
            endLine: end,
            sessionId,
            title: note?.title ?? t('wb.peek.citation'),
            question: `${note?.title ?? t('wb.peek.citation')} · ${start}-${end}`,
          });
        } catch {
          // The jump still works without the box.
        }
      }
      if (typeof onOpenFile === 'function') {
        try {
          onOpenFile({
            path: target,
            title,
            startLine: start,
            endLine: end,
            box: { startLine: start, endLine: end },
            cwd,
            ...(sessionId === undefined ? {} : { sessionId, activateSession: sessionId }),
          });
          setPeek(undefined);
          // The Host rewrites the note's stored range when the snippet moved;
          // reload so the chip and the Markdown heading show today's numbers.
          void refresh();
          return;
        } catch {
          // Fall through to the inline answer below.
        }
      }
    }
    setPeek({ data: located, path });
  }, [call, cwd, note?.id, note?.conversationId, note?.title, onOpenFile, refresh, scope?.sessionId, t]);

  /* ---- import / export / selection ---- */

  const runImport = useCallback(async (items, paths) => {
    setImportBusy(true);
    setError(undefined);
    try {
      const value = await call('notes', { op: 'import', items, paths });
      if (!alive.current || value === undefined) return;
      setNotice(t('wb.notes.imported', { count: value.imported ?? 0 }));
      setImportOpen(false);
      setImportPath('');
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setImportBusy(false);
    }
  }, [call, refresh, t]);

  const importFromFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const items = [];
    for (const file of files) {
      let body = '';
      try {
        body = await file.text();
      } catch {
        body = '';
      }
      if (body.trim() === '') continue;
      items.push({ title: '', name: file.name, body });
    }
    if (items.length === 0) {
      setError(t('wb.notes.importEmpty'));
      return;
    }
    await runImport(items, undefined);
  }, [runImport, t]);

  const importFromPaths = useCallback(async () => {
    const paths = importPath.split(/[\n,;]/u).map((row) => row.trim()).filter((row) => row !== '');
    if (paths.length === 0) {
      setError(t('wb.notes.importEmpty'));
      return;
    }
    await runImport(undefined, paths);
  }, [importPath, runImport, t]);

  const exportMany = useCallback(async (ids) => {
    setBusy(true);
    setError(undefined);
    try {
      const value = await call('notes', {
        op: 'exportMany',
        ...(Array.isArray(ids) ? { ids } : {}),
      });
      if (!alive.current || value === undefined) return;
      setNotice(t('wb.notes.exportedMany', { count: value.count ?? 0, path: value.dir ?? '' }));
      if (Array.isArray(ids)) setSelected(new Set());
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, t]);

  const toggleSelected = useCallback((id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const backToList = useCallback(() => { setNote(undefined); setShowGraph(false); }, []);

  const searching = query.trim() !== '';
  const visibleNotes = useMemo(
    () => wbFilterNotes(notes, query, undefined),
    [notes, query],
  );

  // Folders open by default — a collapsed tree on first paint hides the very
  // structure the list exists to show.
  useEffect(() => {
    if (folders.length === 0) return;
    setExpanded((current) => {
      if (current.size > 0) return current;
      const next = new Set();
      const walk = (rows) => {
        for (const row of rows ?? []) {
          next.add(row.id);
          walk(row.children);
        }
      };
      walk(folders);
      return next;
    });
  }, [folders]);

  const viewGroups = useMemo(() => wbNoteGroups(folders, visibleNotes), [folders, visibleNotes]);
  // Search keeps the folder tree and only drops folders with no surviving note,
  // matching the right-rail library and the desktop reference.
  const listRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const buildRows = (nodes, depth) => {
      const rows = [];
      for (const node of nodes) {
        const childRows = buildRows(node.children, depth + 1);
        const nameHit = needle !== '' && node.folder.name.toLocaleLowerCase().includes(needle);
        if (needle !== '' && node.notes.length === 0 && childRows.length === 0 && !nameHit) continue;
        const open = searching || expanded.has(node.folder.id);
        rows.push({ kind: 'folder', folder: node.folder, depth, count: node.notes.length, open });
        if (!open) continue;
        rows.push(...childRows);
        for (const row of node.notes) rows.push({ kind: 'note', row, depth: depth + 1 });
      }
      return rows;
    };
    const rows = buildRows(viewGroups.tree, 0);
    if (viewGroups.loose.length > 0) {
      rows.push({ kind: 'divider', count: viewGroups.loose.length });
      for (const row of viewGroups.loose) rows.push({ kind: 'note', row, depth: 0 });
    }
    return rows;
  }, [viewGroups, expanded, searching, query]);

  const toggleExpanded = useCallback((id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const anchors = note !== undefined && Array.isArray(note.anchors) ? note.anchors : [];
  const refs = note !== undefined && Array.isArray(note.codeRefs) ? note.codeRefs : [];

  return h('div', { className: 'wb-notes-wrap' },
    h('div', { className: 'wb-notes-bar' },
      h('button', {
        type: 'button',
        className: 'wb-btn',
        disabled: busy || importBusy,
        title: t('wb.notes.import'),
        onClick: () => setImportOpen((open) => !open),
      }, Glyph.file(12), h('span', null, t('wb.notes.import'))),
      h('button', {
        type: 'button',
        className: `wb-btn${selecting ? ' wb-on' : ''}`,
        disabled: busy,
        title: t('wb.notes.export'),
        onClick: () => {
          setSelecting((on) => {
            if (on) setSelected(new Set());
            return !on;
          });
        },
      }, Glyph.open(12), h('span', null, t('wb.notes.export'))),
      h('button', {
        type: 'button',
        className: `wb-btn${showGraph ? ' wb-on' : ''}`,
        disabled: notes.length === 0 && !showGraph,
        title: t('wb.notes.graph'),
        onClick: () => setShowGraph((on) => !on),
      }, Glyph.graph(12), h('span', null, t('wb.notes.graph'))),
      selecting ? h('span', { className: 'wb-note-time' },
        t('wb.notes.selected', { count: selected.size })) : null,
      selecting ? h('button', {
        type: 'button',
        className: 'wb-btn',
        disabled: busy || selected.size === 0,
        onClick: () => { void exportMany(Array.from(selected)); },
      }, Glyph.open(12), h('span', null, t('wb.notes.exportSelected'))) : null,
      selecting ? h('button', {
        type: 'button',
        className: 'wb-btn',
        disabled: busy,
        onClick: () => { void exportMany(undefined); },
      }, h('span', null, t('wb.notes.exportAll'))) : null,
      selecting ? h('button', {
        type: 'button',
        className: 'wb-btn',
        onClick: () => { setSelected(new Set()); setSelecting(false); },
      }, h('span', null, t('wb.notes.cancelSelect'))) : null,
      h('span', { style: { flex: '1 1 auto' } }),
      notice === undefined ? null : h('span', { className: 'wb-note-time', title: notice }, notice)),

    importOpen ? h('div', { className: 'wb-notes-import' },
      h('input', {
        ref: fileRef,
        type: 'file',
        accept: '.md,.markdown,.txt,text/markdown',
        multiple: true,
        style: { display: 'none' },
        onChange: (event) => {
          const files = event.target.files;
          event.target.value = '';
          if (files !== null && files !== undefined && files.length > 0) void importFromFiles(files);
        },
      }),
      h('button', {
        type: 'button',
        className: 'wb-btn',
        disabled: importBusy,
        onClick: () => fileRef.current?.click(),
      }, Glyph.file(12), h('span', null, t('wb.notes.importPick'))),
      h('input', {
        className: 'cs-input',
        style: { flex: '1 1 200px', maxWidth: '420px' },
        value: importPath,
        placeholder: t('wb.notes.importPath'),
        'aria-label': t('wb.notes.importPath'),
        onChange: (event) => setImportPath(event.target.value),
      }),
      h('button', {
        type: 'button',
        className: 'wb-btn',
        disabled: importBusy || importPath.trim() === '',
        onClick: () => { void importFromPaths(); },
      }, h('span', null, t('wb.notes.importRun'))),
      h('button', {
        type: 'button',
        className: 'wb-iconbtn',
        title: t('notes.reader.cancel'),
        'aria-label': t('notes.reader.cancel'),
        onClick: () => { setImportOpen(false); setImportPath(''); },
      }, Glyph.close(12))) : null,

    h('div', { className: 'wb-notes' },
    h('div', { className: 'wb-notes-side' },
      h('div', { className: 'wb-notes-side-head' },
        h('input', {
          className: 'cs-input',
          type: 'search',
          value: query,
          placeholder: t('wb.notes.search'),
          'aria-label': t('wb.notes.search'),
          onChange: (event) => setQuery(event.target.value),
        })),
      h('div', { className: 'wb-scroll' },
        h('button', {
          type: 'button',
          className: `wb-folder-row${folderId === undefined ? ' wb-on' : ''}`,
          onClick: () => setFolderId(undefined),
        }, Glyph.layers(12), h('span', { style: { flex: '1 1 auto' } }, t('notes.library')),
          h('span', { className: 'wb-note-time' }, formatInt(notes.length, locale))),
        loading && notes.length === 0
          ? h('div', { className: 'wb-empty' }, t('wb.notes.loading'))
          : listRows.length === 0
            ? h('div', { className: 'wb-empty' },
              h('p', null, searching ? t('notes.emptySearch') : notes.length === 0 ? t('wb.notes.empty') : t('notes.list.empty')))
            : listRows.map((entry) => {
              if (entry.kind === 'divider') {
                return h('div', { key: 'divider', className: 'wb-notes-divider' },
                  h('span', { style: { flex: '1 1 auto' } }, t('notes.folder.unfiled')),
                  h('span', { className: 'wb-note-time' }, formatInt(entry.count, locale)));
              }
              if (entry.kind === 'folder') {
                return h('div', {
                  key: `f-${entry.folder.id}`,
                  className: 'wb-folder-node',
                  style: { paddingLeft: `${6 + entry.depth * 14}px` },
                },
                h('button', {
                  type: 'button',
                  className: 'wb-chevron',
                  title: t('wb.notes.folderToggle'),
                  'aria-label': t('wb.notes.folderToggle'),
                  onClick: () => toggleExpanded(entry.folder.id),
                }, h('span', null, entry.open ? '▾' : '▸')),
                h('button', {
                  type: 'button',
                  className: `wb-folder-row${folderId === entry.folder.id ? ' wb-on' : ''}`,
                  title: entry.folder.name,
                  // Explorer semantics: the name selects the folder and reveals
                  // it; only the chevron folds it back up.
                  onClick: () => {
                    setFolderId(entry.folder.id);
                    setExpanded((current) => {
                      if (current.has(entry.folder.id)) return current;
                      const next = new Set(current);
                      next.add(entry.folder.id);
                      return next;
                    });
                  },
                }, Glyph.folder(12), h('span', { style: { flex: '1 1 auto' } }, entry.folder.name),
                  h('span', { className: 'wb-note-time' }, formatInt(entry.count, locale))));
              }
              const row = entry.row;
              const active = note !== undefined && note.id === row.id;
              return h('div', {
                key: row.id,
                className: `wb-note-item${active ? ' wb-on' : ''}`,
                style: { paddingLeft: `${entry.depth * 14}px` },
              },
              selecting ? h('input', {
                type: 'checkbox',
                className: 'wb-note-check',
                checked: selected.has(row.id),
                'aria-label': t('wb.notes.select'),
                title: t('wb.notes.select'),
                onChange: () => toggleSelected(row.id),
              }) : null,
              h('button', {
                type: 'button',
                className: `wb-note-row${active ? ' wb-on' : ''}`,
                title: row.title,
                onClick: () => { void open(row.id); },
              },
              h('span', { className: 'wb-note-title' }, row.title),
              h('span', { className: 'wb-note-excerpt' }, row.excerpt ?? ''),
              h('span', { className: 'wb-note-time' }, formatRelative(locale, row.updatedAt))));
            }))),
    h('div', { className: 'wb-reader' },
      error === undefined ? null : h('div', { className: 'wb-banner wb-bad' },
        Glyph.alert(13), h('span', { style: { flex: '1 1 auto' } }, error)),
      showGraph
        ? h('div', { className: 'wb-reader-graph', 'data-cs': 'notes-graph' },
          h(WbNoteGraph, {
            ...props,
            scope,
            parked: false,
            onOpenNote: (target) => {
              const id = target?.id ?? target?.noteId;
              if (typeof id === 'string' && id !== '') void open(id);
            },
          }))
        : note === undefined
          ? h('div', { className: 'wb-empty' },
            Glyph.notes(24),
            h('p', null, t('wb.notes.reader.empty')))
          : h('div', { className: 'wb-reader-head' },
          h('div', { className: 'wb-reader-title' },
            h('button', {
              type: 'button',
              className: 'wb-iconbtn',
              title: t('wb.notes.back'),
              'aria-label': t('wb.notes.back'),
              onClick: backToList,
            }, Glyph.back(14)),
            h('h2', { title: note.title }, note.title),
            h('span', { className: 'wb-note-time' }, formatRelative(locale, note.updatedAt))),
          refs.length === 0 && anchors.length === 0 ? null : h('div', { className: 'wb-reader-chips' },
            refs.map((ref, index) => {
              const start = ref.line ?? 1;
              const end = ref.endLine ?? ref.line ?? 1;
              return h('button', {
                key: `ref${index}`,
                type: 'button',
                className: 'wb-cite',
                title: `${ref.path}:${start}-${end}`,
                onClick: () => { void revealCitation(ref.path, start, end, index); },
              }, [ref.symbol ?? '', ref.symbol === undefined ? '' : ' ', `${ref.path}:${start}${end === start ? '' : `-${end}`}`].join(''));
            }),
            anchors.map((anchor, index) => h('span', {
              key: `anchor${index}`,
              className: `wb-tag ${wbDriftClass(anchor.status)}`,
              title: `${anchor.path}:${anchor.startLine ?? anchor.line ?? 1}`,
            }, t(`notes.drift.${anchor.status ?? 'fresh'}`)))),
          h(WbCodePeek, {
            peek,
            t,
            onOpen: (path, startLine, endLine) => openCitation(path, startLine, endLine),
            onClose: () => setPeek(undefined),
          }),
          h('div', { className: 'wb-scroll' },
            h('div', { className: 'wb-reader-doc' },
              stripTitleLine(note.body ?? '').trim() === ''
                ? h('p', { className: 'wb-note-time' }, t('notes.reader.bodyEmpty'))
                : h(Markdown, {
                  text: stripTitleLine(note.body),
                  onOpenCitation: (path, line, endLine) => { void revealCitation(path, line ?? 1, endLine ?? line ?? 1); },
                  t,
                })))))));
}

/* ------------------------------------------------------------------ *
 * Page 2: project graph register                                     *
 * ------------------------------------------------------------------ */

/**
 * Registered project graphs: rename inline, inspect stats, open the graph in
 * the session view, or forget the registration. A missing `projects` method
 * renders the empty state with a rebuild button instead of throwing.
 * @param props - `{ctx, scope, parked, t, locale, onOpenGraph}`.
 * @returns the register page.
 */
export function WbProjectList(props) {
  const { ctx, scope, parked, t, locale, onOpenGraph } = props;
  const cwd = wbCwd(scope);
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notice, setNotice] = useState(undefined);
  const [renamingId, setRenamingId] = useState(undefined);
  const [renameValue, setRenameValue] = useState('');
  const [armDeleteId, setArmDeleteId] = useState(undefined);

  const alive = useRef(true);
  const requests = useRef(undefined);

  useEffect(() => {
    alive.current = true;
    const scopeReq = makeRequestScope();
    requests.current = scopeReq;
    return () => {
      alive.current = false;
      scopeReq.dispose();
      requests.current = undefined;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const value = await requests.current.run((signal) => call('projects', { op: 'list' }, signal));
      if (!alive.current || value === undefined) return;
      setProjects(Array.isArray(value.projects) ? value.projects : []);
    } catch (caught) {
      if (!alive.current) return;
      setProjects([]);
      setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (parked) return undefined;
    void refresh();
    return undefined;
  }, [parked, refresh]);

  const commitRename = useCallback(async (row) => {
    const name = renameValue.trim();
    if (name === '' || name === row.name) {
      setRenamingId(undefined);
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      const value = await requests.current.run((signal) => call('projects', { op: 'rename', id: row.id, name }, signal));
      if (!alive.current) return;
      const updated = value && value.project !== undefined ? value.project : { name };
      setProjects((rows) => rows.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
    } catch (caught) {
      if (alive.current) setNotice({ kind: 'bad', text: caught && caught.message ? caught.message : String(caught) });
    } finally {
      if (alive.current) {
        setBusy(false);
        setRenamingId(undefined);
      }
    }
  }, [call, renameValue]);

  const remove = useCallback(async (row) => {
    setBusy(true);
    setNotice(undefined);
    try {
      await requests.current.run((signal) => call('projects', { op: 'delete', id: row.id }, signal));
      if (!alive.current) return;
      setProjects((rows) => rows.filter((r) => r.id !== row.id));
    } catch (caught) {
      if (alive.current) setNotice({ kind: 'bad', text: caught && caught.message ? caught.message : String(caught) });
    } finally {
      if (alive.current) {
        setBusy(false);
        setArmDeleteId(undefined);
      }
    }
  }, [call]);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setNotice(undefined);
    try {
      await requests.current.run((signal) => call('rebuild', {}, signal));
      if (alive.current) setNotice({ kind: 'ok', text: t('wb.projects.rebuilt') });
      await refresh();
    } catch (caught) {
      if (alive.current) setNotice({ kind: 'bad', text: caught && caught.message ? caught.message : String(caught) });
    } finally {
      if (alive.current) setRebuilding(false);
    }
  }, [call, refresh, t]);

  const statsText = (stats) => {
    const safe = stats ?? {};
    return t('wb.projects.stats', {
      files: formatInt(safe.files ?? 0, locale),
      lines: formatInt(safe.lines ?? 0, locale),
      nodes: formatInt(safe.nodes ?? 0, locale),
      edges: formatInt(safe.edges ?? 0, locale),
      communities: formatInt(safe.communities ?? 0, locale),
    });
  };

  return h('div', { className: 'wb-scroll' },
    error === undefined ? null : h('div', { className: 'wb-banner wb-bad' },
      Glyph.alert(13),
      h('span', { style: { flex: '1 1 auto' } }, error)),
    notice === undefined ? null : h('div', { className: `wb-banner ${notice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
      Glyph.check(12),
      h('span', { style: { flex: '1 1 auto' } }, notice.text)),

    loading && projects.length === 0
      ? h('div', { className: 'wb-empty' }, Glyph.spinner(14), h('span', null, t('wb.projects.loading')))
      : projects.length === 0
        ? h('div', { className: 'wb-empty' },
          Glyph.layers(24),
          h('b', null, t('wb.projects.empty.title')),
          h('p', null, t('wb.projects.empty.body')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-primary',
            disabled: rebuilding,
            onClick: () => { void rebuild(); },
          }, Glyph.rebuild(12), rebuilding ? t('wb.projects.rebuilding') : t('wb.projects.rebuild')))
        : h('div', { className: 'wb-proj-list' },
          projects.map((row) => {
            const stats = row.stats ?? {};
            const renaming = renamingId === row.id;
            const arming = armDeleteId === row.id;
            const name = row.name || t('wb.projects.unnamed');
            const builtAtText = formatRelative(locale, row.builtAt) === ''
              ? ''
              : t('wb.projects.builtAt', { time: formatRelative(locale, row.builtAt) });
            return h('div', {
              key: row.id,
              className: 'wb-proj-card',
              'data-cs': 'project-row',
              'data-root': row.root,
            },
              h('div', { className: 'wb-proj-top' },
                renaming
                  ? h('input', {
                    className: 'cs-input wb-proj-rename',
                    value: renameValue,
                    placeholder: t('wb.projects.renamePlaceholder'),
                    'aria-label': t('wb.projects.rename'),
                    onChange: (event) => setRenameValue(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') void commitRename(row);
                      if (event.key === 'Escape') setRenamingId(undefined);
                    },
                    onBlur: () => { if (renaming) void commitRename(row); },
                  })
                  : h('span', { className: 'wb-proj-name', title: name }, name),
                h('div', { className: 'wb-proj-acts' },
                  h('button', {
                    type: 'button',
                    className: 'cs-btn cs-small cs-ghost',
                    title: t('wb.projects.open'),
                    onClick: () => { if (typeof onOpenGraph === 'function') onOpenGraph({ root: row.root }); },
                  }, Glyph.open(12), t('wb.projects.open')),
                  renaming ? null : h('button', {
                    type: 'button',
                    className: 'cs-iconbtn',
                    title: t('wb.projects.rename'),
                    'aria-label': t('wb.projects.rename'),
                    disabled: busy,
                    onClick: () => { setRenamingId(row.id); setRenameValue(row.name ?? ''); },
                  }, Glyph.pencil(12)),
                  h('button', {
                    type: 'button',
                    className: `cs-iconbtn cs-danger${arming ? ' wb-on' : ''}`,
                    title: arming ? t('wb.projects.deleteArm') : t('wb.projects.delete'),
                    'aria-label': arming ? t('wb.projects.deleteArm') : t('wb.projects.delete'),
                    disabled: busy,
                    onClick: () => {
                      if (arming) void remove(row);
                      else setArmDeleteId(row.id);
                    },
                  }, Glyph.trash(13)))),
              h('div', { className: 'wb-proj-root', title: row.root }, row.root),
              h('div', { className: 'wb-proj-stats' }, statsText(stats)),
              h('div', { className: 'wb-proj-stats' }, builtAtText));
          }),
          h('div', { className: 'wb-proj-acts' },
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small cs-ghost',
              disabled: rebuilding,
              onClick: () => { void rebuild(); },
            }, Glyph.refresh(12), rebuilding ? t('wb.projects.rebuilding') : t('common.refresh')))));
}

/* ------------------------------------------------------------------ *
 * Page 3: project code graph canvas                                  *
 * ------------------------------------------------------------------ */

/**
 * A project graph opened from the register. The canvas itself is the same
 * `GraphView` the session tab uses; this page owns only the back button and the
 * explicit `scope.cwd`, because a workbench page has no conversation scope of
 * its own.
 *
 * @param props - `{ctx, graphRoot, parked, t, locale, onOpenFile, onBack}`.
 * @returns the graph page.
 */
export function WbProjectGraph(props) {
  const {
    ctx, graphRoot, parked, t, locale, onOpenFile, onBack, scope, sessionId,
  } = props;
  if (parked) return null;
  const activeSessionId = sessionId ?? scope?.sessionId;
  if (graphRoot === '') {
    return h('div', { className: 'wb-empty' },
      Glyph.graph(24),
      h('b', null, t('wb.canvas.empty.title')),
      h('p', null, t('wb.canvas.empty.body')));
  }
  return h('div', { className: 'wb-project-graph' },
    h('div', { className: 'wb-graph-bar' },
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-ghost',
        onClick: () => { if (typeof onBack === 'function') onBack(); },
      }, Glyph.back(12), t('wb.canvas.back')),
      h('span', { className: 'wb-graph-root', title: graphRoot }, graphRoot)),
    h(GraphView, {
      ctx,
      scope: { cwd: graphRoot },
      visible: true,
      railCollapsible: true,
      onOpenFile: (target) => {
        if (typeof onOpenFile !== 'function') return;
        onOpenFile({
          ...target,
          cwd: graphRoot,
          ...(activeSessionId === undefined ? {} : { sessionId: activeSessionId }),
        });
      },
      t,
      locale,
    }));
}

/* ------------------------------------------------------------------ *
 * Page 3: note knowledge graph canvas                                *
 * ------------------------------------------------------------------ */

/**
 * The notes graph drawn on the same canvas as the project graph: the same
 * `GraphView` (vis-network stage, community legend, focus, inspector rail) over
 * a different payload. The Host builds a pure note layer — notes, the knowledge
 * points they mention, and note↔note similarity — so a single note still has
 * structure to show.
 *
 * Differences from the code graph are all props:
 *   - `loader` fetches `notes op=graph` instead of `graph`;
 *   - no layout cache (its topology is not the project graph's);
 *   - no relation chips (the note relations are not code families);
 *   - activating a node opens the note, not a file.
 *
 * @param props - `{ctx, scope, parked, t, locale, onOpenNote}`.
 * @returns the note graph page.
 */
export function WbNoteGraph(props) {
  const { ctx, scope, parked, t, locale, onOpenNote } = props;

  const loader = useCallback((call, signal) => call('notes', { op: 'graph' }, signal), []);

  const activate = useCallback((node) => {
    if (node === null || node === undefined) return;
    if (!wbIsNoteNode(node)) return;
    if (typeof onOpenNote !== 'function') return;
    try {
      onOpenNote({ id: node.noteId ?? node.id, noteId: node.noteId });
    } catch {
      /* an open failure must not take the canvas down */
    }
  }, [onOpenNote]);

  return h('div', { className: 'wb-note-graph' },
    h(GraphView, {
      ctx,
      scope,
      visible: parked !== true,
      railCollapsible: true,
      loader,
      persistLayout: false,
      showFamilies: true,
      fetchDetail: false,
      relationScope: 'notes',
      onActivateNode: activate,
      t,
      locale,
    }));
}
