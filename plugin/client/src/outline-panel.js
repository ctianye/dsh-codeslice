import { useState, useEffect, useRef, useMemo, useCallback } from './icons.js';
import { makeCaller } from './api.js';
import { kindLabel } from './graph-tables.js';
import { Markdown } from './markdown.js';
import { Glyph } from './icons.js';
import { formatInt } from './i18n.js';

/**
 * The `codeslice:outline` tab.
 *
 * One file at a time: declarations, imports, rationale, and what imports this
 * file. Clicking any row opens the file at its line through the host's own
 * `path#L<n>` grammar.
 *
 * The file picker is a *filtered list*, not a tree: the host already owns a file
 * tree, so duplicating it here would mean two navigation models for one
 * workspace. `files` is a flat, filterable projection by design (`WIRE.md §8`),
 * and that is exactly the shape a combobox needs.
 *
 * The tab is registered with `dedupeKey: tab => tab.path` (spec §7, the reference
 * uses the same trick for its editor tab), so two files means two tabs, each
 * pinned to its own path — which is why `path` is read from the tab descriptor
 * and never guessed.
 */

/** Rows shown in the picker before it becomes a scroll problem. */
const PICKER_LIMIT = 60;

/**
 * @param props - `{ctx, store, scope, tab, visible, onOpenFile, t, locale}`.
 *   `tab.path` is the pinned file, when the host opened the tab for one;
 *   `visible === false` stops fetching; `onOpenFile(path)` is the fallback
 *   opener when the sidebar service is absent.
 * @returns the panel.
 */
export function OutlinePanel(props) {
  const {
    ctx, scope, tab, visible, onOpenFile, t, locale,
  } = props;
  const parked = visible === false;

  const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const pinned = tab && typeof tab.path === 'string' && tab.path !== '' ? tab.path : undefined;
  const [path, setPath] = useState(pinned);
  const [outline, setOutline] = useState(undefined);
  const [files, setFiles] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(pinned === undefined);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(undefined);
  const alive = useRef(true);
  const filterRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (pinned !== undefined) setPath(pinned);
  }, [pinned]);

  /* ---- file list, only while the picker is needed ---- */

  useEffect(() => {
    if (parked || !pickerOpen || files.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const value = await call('files', { limit: 800 });
        if (!cancelled && alive.current) setFiles(Array.isArray(value.files) ? value.files : []);
      } catch (caught) {
        if (!cancelled && alive.current) setError(caught && caught.message ? caught.message : String(caught));
      }
    })();
    return () => { cancelled = true; };
  }, [parked, pickerOpen, files.length, call]);

  /* ---- outline ---- */

  useEffect(() => {
    if (parked || path === undefined) {
      if (path === undefined) setOutline(undefined);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    (async () => {
      try {
        const value = await call('outline', { path }, controller.signal);
        if (!cancelled && alive.current) setOutline(value);
      } catch (caught) {
        if (cancelled || !alive.current) return;
        if (caught && caught.name === 'AbortError') return;
        setError(caught && caught.message ? caught.message : String(caught));
      } finally {
        if (!cancelled && alive.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [parked, path, call]);

  const open = useCallback((target, line) => {
    if (typeof target !== 'string' || target === '') return;
    const sidebar = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
    const address = line === undefined || line === null ? target : `${target}#L${line}`;
    try {
      if (sidebar && typeof sidebar.openFile === 'function' && scope !== undefined) {
        sidebar.openFile(scope, address);
        return;
      }
    } catch {
      // Fall through.
    }
    if (typeof onOpenFile === 'function') onOpenFile(target);
  }, [ctx, scope, onOpenFile]);

  const pick = useCallback((next) => {
    setPath(next);
    setPickerOpen(false);
    setFilter('');
  }, []);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const rows = needle === '' ? files : files.filter((row) => String(row.path).toLowerCase().includes(needle));
    return rows.slice(0, PICKER_LIMIT);
  }, [files, filter]);

  /* ---- picker view ---- */

  if (path === undefined || pickerOpen) {
    return h('div', { className: 'cs-root' },
      h('div', { className: 'cs-bar' },
        h('div', { className: 'cs-search' },
          h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
          h('input', {
            ref: filterRef,
            className: 'cs-input',
            type: 'search',
            value: filter,
            autoFocus: pickerOpen && path === undefined ? true : undefined,
            placeholder: t('outline.search'),
            'aria-label': t('outline.search'),
            onChange: (event) => setFilter(event.target.value),
          })),
        path === undefined ? null : h('button', {
          type: 'button', className: 'cs-btn cs-small', onClick: () => setPickerOpen(false),
        }, t('common.cancel'))),
      error === undefined ? null : h('div', { className: 'cs-banner' },
        Glyph.alert(13),
        h('span', { className: 'cs-grow' }, error)),
      filtered.length === 0
        ? h('div', { className: 'cs-empty' }, t(files.length === 0 ? 'common.loading' : 'graph.search.empty'))
        : h('div', { className: 'cs-col', style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto' } },
          filtered.map((row) => h('button', {
            key: row.path,
            type: 'button',
            className: 'cs-item',
            title: row.path,
            onClick: () => pick(row.path),
          },
          Glyph.file(12),
          h('span', { className: 'cs-name cs-ellipsis' }, baseName(row.path)),
          h('span', { className: 'cs-where' }, row.path),
          h('span', { className: 'cs-meta' }, formatInt(row.symbols ?? 0, locale))))));
  }

  const symbols = outline?.symbols ?? [];
  const imports = outline?.imports ?? [];
  const importedBy = outline?.importedBy ?? [];
  const rationale = outline?.rationale ?? [];

  return h('div', { className: 'cs-root' },
    h('div', { className: 'cs-bar' },
      h('button', {
        type: 'button',
        className: 'cs-iconbtn',
        title: t('outline.pick'),
        'aria-label': t('outline.pick'),
        onClick: () => setPickerOpen(true),
      }, Glyph.back(14)),
      h('span', { className: 'cs-grow cs-mono cs-ellipsis', style: { fontSize: '11px' }, title: path }, path),
      h('span', { className: 'cs-tag' }, outline?.language ?? ''),
      symbols.length === 0 ? null : h('span', { className: 'cs-tag cs-tabular' }, formatInt(symbols.length, locale))),

    loading ? h('div', { className: 'cs-bar cs-sub' }, h('span', { className: 'cs-spin' }, Glyph.spinner(11)), t('outline.loading')) : null,

    error === undefined ? null : h('div', { className: 'cs-banner' },
      Glyph.alert(13),
      h('span', { className: 'cs-grow' }, error)),

    outline !== undefined && outline.found === false
      ? h('div', { className: 'cs-empty' }, h('b', null, t('outline.notFound')))
      : h('div', { className: 'cs-outline' },
        h('div', { className: 'cs-grow', style: { minHeight: 0, overflow: 'auto' } },
          h('div', { className: 'cs-section-head' },
            h('span', { className: 'cs-grow' }, t('outline.declarations')),
            h('span', { className: 'cs-muted' }, t('outline.hint'))),
          symbols.length === 0
            ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '14px 10px' } }, t('outline.empty'))
            : symbols.map((symbol, index) => h('button', {
              key: symbol.id ?? `${index}`,
              type: 'button',
              className: 'cs-sym-row',
              title: symbol.signature === undefined || symbol.signature === '' ? symbol.name : symbol.signature,
              onClick: () => open(path, symbol.line),
            },
            h('span', { className: `cs-kind cs-k-${symbol.kind ?? 'function'}` }, kindLabel(symbol.kind, locale)),
            h('span', { className: 'cs-sym-name' }, symbol.name),
            h('span', { className: 'cs-sym-sig' }, symbol.signature ?? ''),
            h('span', { className: 'cs-sym-line' }, `L${symbol.line ?? 1}`))),

          imports.length === 0 ? null : h('div', null,
            h('div', { className: 'cs-section-head' }, h('span', { className: 'cs-grow' }, t('outline.imports'))),
            imports.map((row, index) => h('div', { key: `${row.module}:${index}`, className: 'cs-import-row' },
              h('span', { className: 'cs-imp-name cs-ellipsis' }, row.module),
              h('span', { className: 'cs-imp-line' }, row.line === undefined ? '' : `L${row.line}`),
              h('span', { className: 'cs-grow' }),
              row.resolved === null || row.resolved === undefined
                ? h('span', { className: 'cs-tag' }, t('kind.module'))
                : h('button', {
                  type: 'button',
                  className: 'cs-btn cs-ghost cs-small cs-ellipsis',
                  title: row.resolved,
                  onClick: () => open(row.resolved),
                }, Glyph.open(11), baseName(row.resolved))))),

          importedBy.length === 0 ? null : h('div', null,
            h('div', { className: 'cs-section-head' }, h('span', { className: 'cs-grow' }, t('outline.importedBy'))),
            importedBy.map((row) => h('button', {
              key: row,
              type: 'button',
              className: 'cs-sym-row',
              title: row,
              onClick: () => open(row),
            }, Glyph.file(12), h('span', { className: 'cs-sym-name cs-ellipsis' }, baseName(row)), h('span', { className: 'cs-sym-sig' }, row)))),

          rationale.length === 0 ? null : h('div', null,
            h('div', { className: 'cs-section-head' }, h('span', { className: 'cs-grow' }, t('outline.rationale'))),
            rationale.map((row, index) => h('div', {
              key: `${row.line}:${index}`,
              className: `cs-rationale${row.origin === 'docstring' ? '' : ' cs-quiet'}`,
            }, row.text))))));
}

/** The last path segment — what a narrow row can actually show. */
function baseName(path) {
  const text = String(path ?? '');
  const cut = text.lastIndexOf('/');
  return cut < 0 ? text : text.slice(cut + 1);
}
