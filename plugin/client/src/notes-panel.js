import { useState, useEffect, useRef, useMemo, useCallback } from './icons.js';
import { makeCaller } from './api.js';
import { Markdown, stripTitleLine, noteExcerpt } from './markdown.js';
import { Glyph } from './icons.js';
import { formatRelative } from './i18n.js';
import { revealCodeRange } from './reveal-code.js';

/**
 * The `codeslice:knowledge` tab.
 *
 * Three columns in one panel: folder tree, note list, reader. The reference
 * spreads these across a 268 px sidebar and a middle pane; here they share one
 * host tab, so the layout is measured (not queried) and folds into a stack when
 * the panel is narrower than `NARROW_STACK` — a folder tree that cannot show a
 * folder name is worse than no tree.
 *
 * Deliberate departures, all of them because the host owns what the desktop app
 * had to build:
 *
 *   - `window.prompt` / `window.confirm` are gone. Rename and delete happen
 *     inline: the host may replace `window` dialogs, and a `confirm()` inside a
 *     parked tab blocks the whole page.
 *   - No `move_folder` flag: that is a desktop-backend idempotence hack
 *     (`types.ts:604-611`); this wire takes `folderId` directly (`WIRE.md §6`).
 *   - The note body is rendered by `markdown.js`, so `### path:line` headings
 *     become clickable citations rather than plain text.
 */

/** Below this width the three columns become one stack. */
const NARROW_STACK = 560;

/**
 * @param props - `{ctx, store, scope, tab, visible, onOpenFile, t, locale}`.
 *   `scope.cwd` scopes every request; `visible === false` stops all fetching;
 *   `onOpenFile(path)` is used only when the host sidebar cannot open files.
 * @returns the panel.
 */
export function NotesPanel(props) {
  const {
    ctx, scope, visible, onOpenFile, t, locale,
  } = props;
  const parked = visible === false;

  const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState(undefined);
  const [folderId, setFolderId] = useState(undefined);
  const [query, setQuery] = useState('');
  const [openFolders, setOpenFolders] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(undefined);
  const [notice, setNotice] = useState(undefined);
  const [mode, setMode] = useState({ kind: 'idle' });
  const [narrow, setNarrow] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  // Checkboxes only exist while exporting: a checkbox on every row makes the list
  // look like a bulk tool instead of a shelf you read from.
  const [exportMode, setExportMode] = useState(false);
  const [renaming, setRenaming] = useState(undefined);
  const [confirming, setConfirming] = useState(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  // Right-click on a note opens a small menu; only the actions that need a
  // second step (choosing a folder) open a dialog. The menu is `{x, y, id, title}`.
  const [menu, setMenu] = useState(undefined);
  const [moving, setMoving] = useState(undefined);
  const alive = useRef(true);
  const hostRef = useRef(null);
  const searchRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /* ---- measure ---- */
  useEffect(() => {
    const element = hostRef.current;
    if (element === null || element === undefined || parked) return undefined;
    const read = () => {
      const rect = element.getBoundingClientRect();
      setNarrow(rect.width < NARROW_STACK);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [parked, note]);

  /* ---- list ---- */

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const value = await call('notes', { op: 'list' });
      if (!alive.current) return;
      setFolders(Array.isArray(value.folders) ? value.folders : []);
      setNotes(Array.isArray(value.notes) ? value.notes : []);
      setError(undefined);
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (parked) return;
    void refresh();
  }, [parked, refresh]);

  /* ---- open ---- */

  const open = useCallback(async (id) => {
    setBusy(true);
    setError(undefined);
    try {
      const value = await call('notes', { op: 'read', id });
      if (alive.current) {
        setNote(value.note);
        setMode({ kind: 'read' });
      }
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call]);

  /* ---- mutations ---- */

  const createNote = useCallback(async (title, body) => {
    setBusy(true);
    try {
      const value = await call('notes', {
        op: 'create',
        title,
        body,
        folderId: folderId ?? undefined,
      });
      if (!alive.current) return;
      setNote(value.note);
      setMode({ kind: 'read' });
      setNotice(t('common.save'));
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, folderId, refresh, t]);

  const updateNote = useCallback(async (patch) => {
    if (note === undefined) return;
    setBusy(true);
    try {
      const value = await call('notes', { op: 'update', id: note.id, ...patch });
      if (!alive.current) return;
      setNote(value.note);
      setMode({ kind: 'read' });
      setNotice(t('common.save'));
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, note, refresh, t]);

  /**
   * Re-file any note, not only the one on screen: the right-click menu acts on
   * the row that was clicked, which may be a different note than the reader's.
   * Passing `null` sends it back to 未分类.
   */
  const moveNoteTo = useCallback(async (id, nextFolderId) => {
    setBusy(true);
    try {
      const value = await call('notes', {
        op: 'update',
        id,
        folderId: nextFolderId ?? null,
      });
      if (!alive.current) return;
      if (note !== undefined && note.id === id && value !== undefined && value.note !== undefined) {
        setNote(value.note);
      }
      // The destination folder collapses once the note lands in it — the tree
      // stays compact instead of unfolding a folder the user did not open.
      if (nextFolderId !== undefined && nextFolderId !== null) {
        setOpenFolders((current) => {
          const next = new Set(current);
          next.delete(nextFolderId);
          return next;
        });
      }
      setNotice(t('notes.move.moved'));
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, note, refresh, t]);

  const deleteNote = useCallback(async () => {
    if (note === undefined) return;
    setBusy(true);
    try {
      await call('notes', { op: 'delete', id: note.id });
      if (!alive.current) return;
      setNote(undefined);
      setMode({ kind: 'idle' });
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, note, refresh]);

  const createFolder = useCallback(async (name) => {
    setBusy(true);
    try {
      const value = await call('notes', { op: 'createFolder', name, parentId: folderId ?? undefined });
      if (!alive.current) return;
      // A created folder must hand the panel back to the list: staying in the form
      // is how nine folders named 目录 were made one click each.
      setMode({ kind: 'idle' });
      setNotice(t('notes.folder.created', { name: value?.folder?.name ?? name }));
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, folderId, refresh, t]);

  const renameFolder = useCallback(async (id, name) => {
    setBusy(true);
    try {
      await call('notes', { op: 'renameFolder', id, name });
      if (!alive.current) return;
      setRenaming(undefined);
      setNotice(t('notes.folder.renamed'));
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, refresh, t]);

  const deleteFolder = useCallback(async (id) => {
    setBusy(true);
    try {
      const value = await call('notes', { op: 'deleteFolder', id });
      if (!alive.current) return;
      setConfirming(undefined);
      if (folderId === id) setFolderId(undefined);
      setNotice(t('notes.folder.deleted', { count: value?.moved ?? 0 }));
      await refresh();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, folderId, refresh, t]);

  const exportNote = useCallback(async () => {
    if (note === undefined) return;
    try {
      const value = await call('notes', { op: 'export', id: note.id });
      if (alive.current) setNotice(t('notes.reader.exported', { path: value.path }));
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    }
  }, [call, note, t]);

  /* ---- import / batch export ---- */

  const runImport = useCallback(async (items, paths) => {
    setImportBusy(true);
    setError(undefined);
    try {
      const value = await call('notes', { op: 'import', items, paths });
      if (!alive.current) return;
      setNotice(t('notes.imported', { count: value.imported ?? 0 }));
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
      setError(t('notes.importEmpty'));
      return;
    }
    await runImport(items, undefined);
  }, [runImport, t]);

  const importFromPaths = useCallback(async () => {
    const paths = importPath.split(/[\n,;]/u).map((row) => row.trim()).filter((row) => row !== '');
    if (paths.length === 0) {
      setError(t('notes.importEmpty'));
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
      if (!alive.current) return;
      setNotice(t('notes.exportedMany', { count: value.count ?? 0, path: value.dir ?? '' }));
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

  const backToList = useCallback(() => {
    setNote(undefined);
    setMode({ kind: 'idle' });
  }, []);

  /* ---- keyboard: `/` and Esc, never while typing ---- */

  useEffect(() => {
    if (parked) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
      const editable = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (event.key === 'Escape') {
        if (editable) { target.blur(); return; }
        setQuery('');
        setMode({ kind: 'idle' });
        setNote(undefined);
        setSelected(new Set());
        setExportMode(false);
        return;
      }
      if (editable) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [parked]);

  // A context menu or dialog closes on any click that is not part of it. The
  // listener waits a tick so the click that opened the menu does not close it.
  useEffect(() => {
    if (menu === undefined && moving === undefined) return undefined;
    const close = () => setMenu(undefined);
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setMenu(undefined);
      setMoving(undefined);
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('resize', close);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, moving]);

  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const searching = query.trim() !== '';
  // Search spans the whole library, the way a file tree's quick-open does; the
  // tree itself is the normal navigation surface and ignores the folder scope.
  const searchResults = useMemo(
    () => (searching ? filterNotes(notes, query, undefined) : []),
    [notes, query, searching],
  );
  const visibleNotes = searching ? searchResults : notes;
  const notesOf = useCallback(
    (id) => visibleNotes.filter((row) => (row.folderId ?? undefined) === id),
    [visibleNotes],
  );

  // Reading or editing one note takes the whole panel: a long list above a
  // half-height reader is unusable once the library grows, so the list is hidden
  // until the reader's back arrow brings it back.
  const focused = note !== undefined || mode.kind !== 'idle';

  /**
   * A note is a leaf in the tree: same row in a folder, under 全部笔记, or in a
   * search result — only its indent changes, exactly like a file in VS Code.
   */
  const renderNoteRow = (row, depth) => {
    const active = note !== undefined && note.id === row.id;
    return h('div', {
      key: row.id,
      className: `cs-note-item${active ? ' cs-active' : ''}`,
      style: { paddingLeft: `${2 + depth * 14}px` },
      onContextMenu: (event) => {
        event.preventDefault();
        setMenu({
          x: event.clientX, y: event.clientY, id: row.id, title: row.title,
        });
      },
    },
    exportMode ? h('input', {
      type: 'checkbox',
      className: 'cs-note-check',
      checked: selected.has(row.id),
      'aria-label': t('notes.select'),
      title: t('notes.select'),
      onChange: () => toggleSelected(row.id),
    }) : null,
    h('button', {
      type: 'button',
      className: `cs-note-row${active ? ' cs-active' : ''}`,
      title: row.title,
      onClick: () => { void open(row.id); },
    },
    h('span', { className: 'cs-note-icon' }, Glyph.notes(12)),
    h('span', { className: 'cs-note-main' },
      h('span', { className: 'cs-note-title' }, row.title))),
    // Desktop keeps per-row actions on hover; right-click stays as the fast path.
    h('button', {
      type: 'button',
      className: 'cs-note-more',
      title: t('notes.more'),
      'aria-label': t('notes.more'),
      onClick: (event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setMenu({
          x: Math.max(8, rect.right - 160),
          y: Math.min(rect.bottom + 2, Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 120)),
          id: row.id,
          title: row.title,
        });
      },
    }, Glyph.more(14)));
  };

  /**
   * Folder rows as a tree. Children render only while their parent is open, so a
   * collapsed folder is one line instead of dumping ten subfolders under it —
   * indentation (`6 + depth*14`) mirrors the reference's file-tree behaviour.
   */
  const renderFolders = (rows, depth) => (rows ?? []).map((folder) => {
    const kids = Array.isArray(folder.children) ? folder.children : [];
    const files = notesOf(folder.id);
    const childRows = renderFolders(kids, depth + 1);
    // Search keeps the tree instead of flattening it: a folder survives when it
    // has a matching note, a matching descendant, or a matching name.
    const nameHit = folder.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    if (searching && childRows.length === 0 && files.length === 0 && !nameHit) return null;

    const isOpen = searching || openFolders.has(folder.id);
    const editing = renaming !== undefined && renaming.id === folder.id;
    const asking = confirming === folder.id;
    const indent = `${6 + depth * 14}px`;
    const toggle = () => setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(folder.id)) next.delete(folder.id);
      else next.add(folder.id);
      return next;
    });
    let row;
    if (editing) {
      row = h('div', { className: 'cs-folder-row cs-renaming', style: { paddingLeft: indent } },
        h('span', { className: 'cs-twist' }, Glyph.folder(12)),
        h('input', {
          className: 'cs-input cs-grow',
          style: { minWidth: '0' },
          value: renaming.name,
          autoFocus: true,
          'aria-label': t('notes.folder.rename'),
          onChange: (event) => setRenaming({ id: folder.id, name: event.target.value }),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && renaming.name.trim() !== '') {
              event.preventDefault();
              void renameFolder(folder.id, renaming.name.trim());
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setRenaming(undefined);
            }
          },
        }),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small',
          disabled: busy || renaming.name.trim() === '',
          onClick: () => { void renameFolder(folder.id, renaming.name.trim()); },
        }, t('common.save')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small', onClick: () => setRenaming(undefined),
        }, t('common.cancel')));
    } else if (asking) {
      row = h('div', { className: 'cs-folder-row cs-confirming', style: { paddingLeft: indent } },
        h('span', { className: 'cs-grow', style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } },
          t('notes.folder.deleteConfirm')),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small cs-primary',
          disabled: busy,
          onClick: () => { void deleteFolder(folder.id); },
        }, t('notes.folder.delete')),
        h('button', {
          type: 'button', className: 'cs-btn cs-small', onClick: () => setConfirming(undefined),
        }, t('common.cancel')));
    } else {
      row = h('div', { className: 'cs-folder-row', style: { paddingLeft: indent } },
        // Explorer semantics: the chevron alone folds the node; the name selects
        // it and reveals it. One button for both made a click on the name look
        // like the folder had vanished.
        h('button', {
          type: 'button',
          className: 'cs-chev',
          'data-open': isOpen ? 'true' : 'false',
          title: t('notes.folder.toggle'),
          'aria-label': t('notes.folder.toggle'),
          onClick: toggle,
        }, Glyph.chevronRight(11)),
        h('button', {
          type: 'button',
          className: `cs-folder${folderId === folder.id ? ' cs-active' : ''}`,
          title: folder.name,
          onClick: () => {
            setFolderId(folder.id);
            setOpenFolders((current) => {
              if (current.has(folder.id)) return current;
              const next = new Set(current);
              next.add(folder.id);
              return next;
            });
          },
        },
        isOpen ? Glyph.folderOpen(12) : Glyph.folder(12),
        h('span', { className: 'cs-grow' }, folder.name),
        h('span', { className: 'cs-count' }, formatInt(folder.noteCount ?? folder.count ?? 0, locale))),
        h('div', { className: 'cs-folder-acts' },
          h('button', {
            type: 'button',
            className: 'cs-iconbtn',
            title: t('notes.folder.rename'),
            'aria-label': t('notes.folder.rename'),
            onClick: () => setRenaming({ id: folder.id, name: folder.name }),
          }, Glyph.pencil(11)),
          h('button', {
            type: 'button',
            className: 'cs-iconbtn cs-danger',
            title: t('notes.folder.delete'),
            'aria-label': t('notes.folder.delete'),
            onClick: () => setConfirming(folder.id),
          }, Glyph.trash(11))));
    }
    return h('div', { key: folder.id, className: 'cs-folder-node' },
      row,
      isOpen && (childRows.length > 0 || files.length > 0)
        ? h('div', { className: 'cs-folder-children' },
          childRows,
          files.map((item) => renderNoteRow(item, depth + 1)))
        : null);
  }).filter((node) => node !== null);

  const openCitation = useCallback((path, startLine, endLine) => {
    const start = Math.max(1, Math.trunc(Number(startLine) || 1));
    const end = Math.max(start, Math.trunc(Number(endLine) || start));
    const sessionId = typeof scope === 'string'
      ? scope
      : (typeof scope?.sessionId === 'string' ? scope.sessionId : '');
    if (path !== undefined && path !== null && path !== ''
      && revealCodeRange(ctx, { path, startLine: start, endLine: end }, cwd, sessionId)) {
      return;
    }
    if (typeof onOpenFile === 'function') onOpenFile(path);
  }, [ctx, cwd, scope, onOpenFile]);

  /* ---- render ---- */

  // Desktop order: folders first, unfiled notes last. Rendering the unfiled pile
  // above the folders made every note look detached from the tree.
  const folderRows = renderFolders(folders, 0);
  const unfiledRows = notesOf(undefined);

  return h('div', { className: 'cs-root', ref: hostRef },
    h('div', { className: 'cs-bar cs-wrap' },
      h('div', { className: 'cs-search' },
        h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
        h('input', {
          ref: searchRef,
          className: 'cs-input',
          type: 'search',
          value: query,
          placeholder: t('notes.search'),
          'aria-label': t('notes.search'),
          onChange: (event) => setQuery(event.target.value),
        }),
        searching ? h('button', {
          type: 'button',
          className: 'cs-search-clear',
          title: t('notes.clearSearch'),
          'aria-label': t('notes.clearSearch'),
          onClick: () => setQuery(''),
        }, Glyph.close(12)) : null),
      h('button', {
        type: 'button',
        className: 'cs-iconbtn',
        title: t('common.refresh'),
        'aria-label': t('common.refresh'),
        onClick: () => { void refresh(); },
      }, Glyph.refresh(14))),

    // Labels, not bare glyphs: the four file actions are not self-evident from
    // an icon alone, and this rail has enough width for one compact row.
    h('div', { className: 'cs-bar cs-wrap cs-notes-actions' },
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        disabled: busy,
        onClick: () => setMode({ kind: 'create' }),
      }, Glyph.plus(12), t('notes.newNote')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        disabled: busy,
        onClick: () => setMode({ kind: 'folder' }),
      }, Glyph.folder(12), t('notes.newFolder')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        disabled: busy || importBusy,
        onClick: () => setImportOpen((open) => !open),
      }, Glyph.file(12), t('notes.import')),
      h('button', {
        type: 'button',
        className: `cs-btn cs-small${exportMode ? ' cs-on' : ''}`,
        disabled: busy,
        'aria-pressed': exportMode ? 'true' : 'false',
        onClick: () => {
          setExportMode((open) => {
            if (open) setSelected(new Set());
            return !open;
          });
        },
      }, Glyph.open(12), t('notes.export')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        disabled: busy,
        onClick: () => { void exportMany(undefined); },
      }, Glyph.open(12), t('notes.exportAll'))),

    importOpen ? h('div', { className: 'cs-bar cs-wrap', style: { gap: '6px' } },
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
        className: 'cs-btn cs-small',
        disabled: importBusy,
        onClick: () => fileRef.current?.click(),
      }, Glyph.file(11), t('notes.importPick')),
      h('input', {
        className: 'cs-input',
        style: { flex: '1 1 150px', minWidth: '100px' },
        value: importPath,
        placeholder: t('notes.importPath'),
        'aria-label': t('notes.importPath'),
        onChange: (event) => setImportPath(event.target.value),
      }),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        disabled: importBusy || importPath.trim() === '',
        onClick: () => { void importFromPaths(); },
      }, t('notes.importRun')),
      h('button', {
        type: 'button',
        className: 'cs-iconbtn',
        title: t('notes.reader.cancel'),
        'aria-label': t('notes.reader.cancel'),
        onClick: () => { setImportOpen(false); setImportPath(''); },
      }, Glyph.close(11))) : null,

    exportMode ? h('div', { className: 'cs-bulk' },
      h('span', { className: 'cs-grow' }, t('notes.selected', { count: selected.size })),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        disabled: busy || selected.size === 0,
        onClick: () => { void exportMany(Array.from(selected)); },
      }, Glyph.open(11), t('notes.exportSelected')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small',
        onClick: () => {
          setSelected(new Set());
          setExportMode(false);
        },
      }, t('notes.cancelSelect'))) : null,

    notice === undefined ? null : h('div', { className: 'cs-banner', style: { color: 'var(--dsw-alias-label-secondary)' } },
      Glyph.check(12),
      h('span', { className: 'cs-grow' }, notice),
      h('button', {
        type: 'button', className: 'cs-iconbtn', onClick: () => setNotice(undefined),
      }, Glyph.close(11))),

    error === undefined ? null : h('div', { className: 'cs-banner' },
      Glyph.alert(13),
      h('span', { className: 'cs-grow' }, error),
      h('button', {
        type: 'button', className: 'cs-iconbtn', onClick: () => setError(undefined),
      }, Glyph.close(11))),

    h('div', { className: `cs-notes${narrow ? ' cs-narrow' : ''}${focused ? ' cs-focus' : ''}` },
      /* ---- column 1: folders + list ---- */
      h('div', { className: 'cs-notes-list' },
        h('div', { className: 'cs-folder-row' },
          h('button', {
            type: 'button',
            className: `cs-folder${folderId === undefined ? ' cs-active' : ''}`,
            title: t('notes.library'),
            onClick: () => setFolderId(undefined),
          },
          h('span', { className: 'cs-twist' }, Glyph.layers(12)),
          h('span', { className: 'cs-grow' }, t('notes.library')),
          h('span', { className: 'cs-count' }, formatInt(notes.length, locale)))),

        // One tree, like a file explorer: folders first, each holding its
        // subfolders and notes; unfiled notes come last. Search filters the same
        // tree instead of flattening the hierarchy away.
        h('div', { className: 'cs-grow', style: { minHeight: 0, overflow: 'auto', marginTop: '2px', paddingBottom: '10px' } },
          loading && notes.length === 0
            ? h('div', { className: 'cs-empty' }, t('common.loading'))
            : searching
              ? (folderRows.length === 0 && unfiledRows.length === 0
                ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '16px 10px' } }, t('notes.emptySearch'))
                : h('div', { className: 'cs-folder-tree', 'data-cs': 'notes-tree' },
                  folderRows,
                  unfiledRows.length === 0 ? null : h('div', { className: 'cs-tree-divider' },
                    h('span', { className: 'cs-grow' }, t('notes.folder.unfiled')),
                    h('span', { className: 'cs-count' }, formatInt(unfiledRows.length, locale))),
                  unfiledRows.map((row) => renderNoteRow(row, 0))))
              : (notes.length === 0 && folders.length === 0
                ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '16px 10px' } }, t('notes.empty'))
                : h('div', { className: 'cs-folder-tree', 'data-cs': 'notes-tree' },
                  folderRows,
                  unfiledRows.length === 0 ? null : h('div', { className: 'cs-tree-divider' },
                    h('span', { className: 'cs-grow' }, t('notes.folder.unfiled')),
                    h('span', { className: 'cs-count' }, formatInt(unfiledRows.length, locale))),
                  unfiledRows.map((row) => renderNoteRow(row, 0)))))),

      /* ---- column 2: editor or reader ---- */
      h('div', { className: 'cs-notes-reader' },
        mode.kind === 'create'
          ? h(NoteEditor, {
            mode: 'create',
            initial: { title: '', body: '' },
            busy,
            onSave: (title, body) => { void createNote(title, body); },
            onCancel: () => setMode({ kind: 'idle' }),
            t,
          })
          : mode.kind === 'folder'
            ? h(FolderForm, {
              busy,
              onCreate: (name) => { void createFolder(name); },
              onCancel: () => setMode({ kind: 'idle' }),
              t,
            })
            : mode.kind === 'edit' && note !== undefined
              ? h(NoteEditor, {
                mode: 'edit',
                initial: { title: note.title, body: stripTitleLine(note.body) },
                busy,
                onSave: (title, body) => { void updateNote({ title, body }); },
                onCancel: () => setMode({ kind: 'read' }),
                t,
              })
              : note === undefined
                ? h('div', { className: 'cs-empty' })
                : h(NoteReader, {
                  note,
                  busy,
                  onEdit: () => setMode({ kind: 'edit' }),
                  onDelete: () => { void deleteNote(); },
                  onExport: () => { void exportNote(); },
                  onBack: backToList,
                  onMove: () => setMoving(note.id),
                  onOpenCitation: openCitation,
                  onOpenFile,
                  t,
                  locale,
                }))),

    // Right-click menu: the row's own actions, so 移动到 does not need the reader.
    menu === undefined ? null : h('div', {
      className: 'cs-menu',
      style: {
        position: 'fixed',
        left: `${Math.min(menu.x, Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 170))}px`,
        top: `${menu.y}px`,
      },
      onClick: (event) => event.stopPropagation(),
    },
    h('div', { className: 'cs-menu-title', title: menu.title }, menu.title),
    h('button', {
      type: 'button',
      className: 'cs-menu-item',
      onClick: () => {
        const id = menu.id;
        setMenu(undefined);
        void open(id);
      },
    }, Glyph.file(12), t('notes.menu.open')),
    h('button', {
      type: 'button',
      className: 'cs-menu-item',
      onClick: () => {
        const id = menu.id;
        setMenu(undefined);
        setMoving(id);
      },
    }, Glyph.folder(12), t('notes.move'))),

    // Folder picker. A dialog rather than a dropdown: the folder list can be long
    // and the reader column is too narrow for a `<select>` that shows its name.
    moving === undefined ? null : h('div', {
      className: 'cs-modal-backdrop',
      onClick: () => setMoving(undefined),
    },
    h('div', { className: 'cs-modal', onClick: (event) => event.stopPropagation() },
      h('div', { className: 'cs-modal-head' }, t('notes.move.title')),
      h('div', { className: 'cs-modal-list' },
        h('button', {
          type: 'button',
          className: 'cs-modal-item',
          onClick: () => {
            const id = moving;
            setMoving(undefined);
            void moveNoteTo(id, null);
          },
        }, Glyph.layers(12), h('span', { className: 'cs-grow' }, t('notes.folder.unfiled'))),
        flatFolders.length === 0 ? null : h('div', { className: 'cs-muted', style: { fontSize: '11px', padding: '6px 10px' } },
          t('notes.move.hint')),
        flatFolders.map((row) => {
          const current = notes.find((item) => item.id === moving);
          const active = current !== undefined && (current.folderId ?? undefined) === row.folder.id;
          return h('button', {
            key: row.folder.id,
            type: 'button',
            className: `cs-modal-item${active ? ' cs-active' : ''}`,
            style: { paddingLeft: `${10 + row.depth * 14}px` },
            onClick: () => {
              const id = moving;
              setMoving(undefined);
              void moveNoteTo(id, row.folder.id);
            },
          }, Glyph.folder(12), h('span', { className: 'cs-grow' }, row.folder.name));
        })),
      h('div', { className: 'cs-modal-foot' },
        h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => setMoving(undefined) }, t('common.cancel'))))));
}

/**
 * Read a note, with its anchors and references.
 * @param props - `{note, busy, onEdit, onDelete, onExport, onMove, onOpenCitation, onOpenFile, t, locale}`.
 *   `note` is the `read` payload; `onMove()` opens the folder picker for this note;
 *   `onOpenCitation(path, line)` opens a `path:line` chip; `onOpenFile` is the
 *   host's fallback opener.
 * @returns the reader column.
 */
function NoteReader(props) {
  const {
    note, busy, onEdit, onDelete, onExport, onBack, onMove, onOpenCitation, t, locale,
  } = props;
  const anchors = Array.isArray(note.anchors) ? note.anchors : [];
  const refs = Array.isArray(note.codeRefs) ? note.codeRefs : [];
  const scrollRef = useRef(null);

  // Every note opens at its own top, not wherever the previous one was scrolled.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [note.id]);

  return h('div', { className: 'cs-col', style: { flex: '1 1 auto', minHeight: 0 } },
    h('div', { className: 'cs-reader-head' },
      h('div', { className: 'cs-row' },
        onBack === undefined ? null : h('button', {
          type: 'button',
          className: 'cs-iconbtn',
          title: t('notes.back'),
          'aria-label': t('notes.back'),
          onClick: () => onBack(),
        }, Glyph.back(14)),
        h('h2', { className: 'cs-grow', title: note.title }, note.title),
        h('span', { className: 'cs-tag' }, formatRelative(locale, note.updatedAt))),
      h('div', { className: 'cs-reader-acts' },
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small',
          title: t('notes.move'),
          disabled: busy,
          onClick: () => onMove?.(),
        }, Glyph.folder(11), t('notes.move')),
        h('button', { type: 'button', className: 'cs-btn cs-small', disabled: busy, onClick: () => onEdit?.() },
          Glyph.pencil(11), t('notes.reader.edit')),
        h('button', { type: 'button', className: 'cs-btn cs-small', disabled: busy, onClick: () => onExport?.() },
          Glyph.open(11), t('notes.reader.export')),
        h('span', { className: 'cs-grow' }),
        h('button', {
          type: 'button', className: 'cs-iconbtn cs-danger', title: t('notes.reader.delete'), 'aria-label': t('notes.reader.delete'), disabled: busy, onClick: () => onDelete?.(),
        }, Glyph.trash(13)))),

    refs.length === 0 && anchors.length === 0 ? null : h('div', { className: 'cs-bar cs-sub cs-wrap' },
      refs.length === 0 ? null : h('span', { className: 'cs-muted', style: { fontSize: '10px' } }, t('notes.reader.refs')),
      refs.map((ref, index) => {
        const start = Math.max(1, Math.trunc(Number(ref.line ?? ref.startLine ?? 1)) || 1);
        const end = Math.max(start, Math.trunc(Number(ref.endLine ?? start)) || start);
        const label = start === end ? `${ref.path}:${start}` : `${ref.path}:${start}-${end}`;
        return h('button', {
          key: `ref${index}`,
          type: 'button',
          className: 'cs-cite',
          title: label,
          onClick: () => onOpenCitation?.(ref.path, start, end),
        }, `${ref.symbol ?? ''}${ref.symbol === undefined ? '' : ' '}${label}`);
      }),
      anchors.length === 0 ? null : h('span', { className: 'cs-muted', style: { fontSize: '10px' } }, t('notes.reader.anchors')),
      anchors.map((anchor, index) => h('span', {
        key: `anchor${index}`,
        className: `cs-tag ${anchor.status === 'fresh' ? 'cs-ok' : anchor.status === 'missing' ? 'cs-bad' : 'cs-warn'}`,
        title: `${anchor.path}:${anchor.startLine ?? anchor.line ?? 1}`,
      }, t(`notes.drift.${anchor.status ?? 'fresh'}`)))),

    h('div', { className: 'cs-reader-scroll', ref: scrollRef },
      h('div', { className: 'cs-reader-doc' },
        stripTitleLine(note.body).trim() === ''
          ? h('p', { className: 'cs-muted' }, t('notes.reader.bodyEmpty'))
          : h(Markdown, { text: stripTitleLine(note.body), onOpenCitation, t }))));
}

/**
 * Create/edit form.
 * @param props - `{mode, initial, busy, onSave(title, body), onCancel, t}`.
 *   `mode` is `'create'` or `'edit'` (label differs, behaviour does not).
 * @returns the form column.
 */
function NoteEditor(props) {
  const {
    mode, initial, busy, onSave, onCancel, t,
  } = props;
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Ctrl/Cmd+S saves instead of the browser's dialog. Bound on the form, not the
  // window: two open panels must not both react to one keystroke.
  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
      event.preventDefault();
      if (title.trim() !== '' && body.trim() !== '') onSave?.(title.trim(), body);
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel?.();
    }
  };

  const ready = title.trim() !== '' && body.trim() !== '';

  return h('div', { className: 'cs-col', style: { flex: '1 1 auto', minHeight: 0 }, onKeyDown },
    h('div', { className: 'cs-bar cs-sub' },
      h('span', { className: 'cs-grow' }, t(mode === 'create' ? 'notes.newNote' : 'notes.reader.edit'))),
    h('div', { className: 'cs-field' },
      h('label', { htmlFor: 'cs-note-title' }, t('notes.create.title')),
      h('input', {
        id: 'cs-note-title',
        ref: titleRef,
        className: 'cs-input',
        value: title,
        placeholder: t('notes.create.placeholder.title'),
        onChange: (event) => setTitle(event.target.value),
      })),
    h('div', { className: 'cs-field cs-grow', style: { minHeight: 0 } },
      h('label', { htmlFor: 'cs-note-body' }, t('notes.create.body')),
      h('textarea', {
        id: 'cs-note-body',
        className: 'cs-textarea',
        style: { flex: '1 1 auto', minHeight: '140px' },
        value: body,
        placeholder: t('notes.create.placeholder.body'),
        onChange: (event) => setBody(event.target.value),
      })),
    h('div', { className: 'cs-bar cs-flat' },
      h('div', { className: 'cs-grow' }),
      h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.() }, t('common.cancel')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-primary',
        disabled: busy || !ready,
        onClick: () => onSave?.(title.trim(), body),
      }, t('notes.create.save'))));
}

/**
 * New-folder form.
 * @param props - `{busy, onCreate(name), onCancel, t}`.
 * @returns the form row.
 */
function FolderForm(props) {
  const {
    busy, onCreate, onCancel, t,
  } = props;
  const [name, setName] = useState('');
  return h('div', { className: 'cs-bar cs-sub' },
    h('input', {
      className: 'cs-input',
      value: name,
      autoFocus: true,
      placeholder: t('notes.folder.name'),
      'aria-label': t('notes.folder.name'),
      onChange: (event) => setName(event.target.value),
      onKeyDown: (event) => {
        if (event.key === 'Enter' && name.trim() !== '') onCreate?.(name.trim());
        if (event.key === 'Escape') onCancel?.();
      },
    }),
    h('button', {
      type: 'button',
      className: 'cs-btn cs-small cs-primary',
      disabled: busy || name.trim() === '',
      onClick: () => onCreate?.(name.trim()),
    }, t('notes.folder.create')),
    h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.() }, t('common.cancel')));
}

/**
 * Flatten the folder tree in tree order, carrying depth for the indent.
 *
 * The depth is applied as padding, mirroring the reference's `6 + depth*16`
 * (§6.1) — a flat list with no indent reads as a tag cloud, not a hierarchy.
 * @param folders - the tree from the `list` op.
 * @returns `[{folder, depth}]` in display order.
 */
export function flattenFolders(folders) {
  const out = [];
  const walk = (rows, depth) => {
    for (const folder of rows ?? []) {
      out.push({ folder, depth });
      if (Array.isArray(folder.children)) walk(folder.children, depth + 1);
    }
  };
  walk(folders, 0);
  return out;
}

/**
 * Apply the folder scope and the query to the note list.
 *
 * The reference filters titles, previews and project names as you type with no
 * debounce (§6.1); this panel filters the rows the Host already returned, so
 * typing never issues a request.
 * @param notes - the `list` rows.
 * @param query - the raw query.
 * @param folderId - the active folder, or `undefined` for all notes.
 * @returns the filtered rows.
 */
export function filterNotes(notes, query, folderId) {
  const needle = String(query ?? '').trim().toLowerCase();
  const scopeId = folderId ?? undefined;
  return (notes ?? []).filter((row) => {
    if (scopeId !== undefined && (row.folderId ?? undefined) !== scopeId) return false;
    if (needle === '') return true;
    const haystack = `${row.title ?? ''} ${row.excerpt ?? ''}`.toLowerCase();
    return haystack.includes(needle);
  });
}
