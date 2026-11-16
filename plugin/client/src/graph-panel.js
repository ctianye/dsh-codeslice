import { useState, useEffect, useRef, useMemo, useCallback } from './icons.js';
import { makeCaller, makeRequestScope } from './api.js';
import {
  DEFAULT_FAMILIES, groupLabel, kindLabel, communityColor, relationLabel, confidenceLabel,
  familyLabel,
} from './graph-tables.js';
import { connectedSlice } from './graph-layout.js';
import { GraphCanvas } from './graph-canvas.js';
import { GraphSearch } from './graph-search.js';
import { Glyph } from './icons.js';
import { formatInt, formatRelative } from './i18n.js';
import { revealCodeRange } from './reveal-code.js';

/**
 * The `codeslice:graph` tab.
 *
 * Structure, and why each part is where it is:
 *
 *   toolbar   scope switch (workspace / file / focus), refresh, rebuild, and the
 *             status line. Scope is *state*, not three buttons that each fetch:
 *             switching to `file` with nothing selected has to be visibly
 *             disabled, which is what the reference gets wrong by hiding the
 *             chips for the notes scope only (`spec §6.6`).
 *   canvas    pan/zoom/select/double-click, family legend, truncation notice.
 *   rail      one mode at a time, in the reference's priority order (§5.1):
 *             search results → node inspector → community list.
 *
 * Fetch discipline: mount, explicit refresh, rebuild, scope change, and
 * `visible` turning true. No interval, no polling, no re-fetch on hover.
 *
 * Narrow/wide is measured from **this component's own box**, not the viewport
 * (`spec §1.4`): a 900 px window can hold a 320 px sidebar, and the panel has to
 * decide from what it was actually given.
 */

/** Rail width below which the rail moves under the canvas, in px. */
const NARROW_RAIL_WIDTH = 520;

/** Node cap requested from the Host. Above this the Host returns one node per
 * community (graphify's aggregated view), so this is a rendering budget rather
 * than a truncation point. */
const GRAPH_LIMIT = 5000;

/**
 * @param props - `{ctx, store, scope, tab, visible, onOpenFile, onAsk, t, locale}`.
 *   `ctx` is the client context; `scope.cwd` is the workspace; `visible === false`
 *   means parked-but-mounted, so every heavy effect must stand down; `t` is the
 *   translator; `onOpenFile(path)` is the host's own fallback opener;
 *   `onAsk(node)` hands a node to the shared conversation (absent in the
 *   standalone graph tab, which has no conversation beside it).
 * @returns the panel.
 */
export function GraphPanel(props) {
  const {
    ctx, scope, visible, onOpenFile, onAsk, focusRequest, t, locale,
  } = props;
  const parked = visible === false;

  const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const [status, setStatus] = useState(undefined);
  const [graph, setGraph] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [scopeMode, setScopeMode] = useState('workspace');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(undefined);
  const [detail, setDetail] = useState(undefined);
  const [detailError, setDetailError] = useState(undefined);
  const [families, setFamilies] = useState(() => new Set(DEFAULT_FAMILIES));
  const [hiddenCommunities, setHiddenCommunities] = useState(() => new Set());
  const [narrow, setNarrow] = useState(false);
  const [revision, setRevision] = useState(0);

  const requests = useRef(undefined);
  const searchInput = useRef(null);
  const canvasController = useRef(undefined);
  const alive = useRef(true);
  const hostRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // A jump from the code pane ("show this file in the graph") arrives as a
  // one-shot query. It seeds the rail's search rather than a separate filter, so
  // the reader can refine it with the same controls they already know.
  const focusNonce = focusRequest !== null && focusRequest !== undefined ? focusRequest.nonce : undefined;
  useEffect(() => {
    if (focusNonce === undefined) return;
    if (typeof focusRequest?.text === 'string' && focusRequest.text !== '') {
      setQuery(focusRequest.text);
    }
  }, [focusNonce, focusRequest]);

  // One request scope for the whole tab. Disposing on unmount (and on every
  // `visible: false`) is what makes a parked tab stop costing network.
  useEffect(() => {
    const scopeHandle = makeRequestScope();
    requests.current = scopeHandle;
    return () => {
      scopeHandle.dispose();
      requests.current = undefined;
    };
  }, []);

  /* ---- measure this panel's own box ------------------------------ */

  useEffect(() => {
    const element = hostRef.current;
    if (element === null || element === undefined) return undefined;
    if (parked) return undefined;
    const read = () => {
      const rect = element.getBoundingClientRect();
      setNarrow(rect.width < NARROW_RAIL_WIDTH);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [parked, graph]);

  /* ---- fetch ----------------------------------------------------- */

  // `selectedId` is read through a ref rather than a dependency: it is only needed
  // when the scope is `focus`, and listing it made `load` change identity on
  // every selection, which re-ran the boot effect — so each node click refetched
  // status + graph, turning a one-request selection into three.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // The family filter is *state*: the legend can turn a relation family on that
  // the default set omits (`meaning` has no default), and the Host filters links
  // before sending, so a legend toggle the server never hears about is a no-op.
  const familiesRef = useRef(families);
  familiesRef.current = families;

  const load = useCallback(async (mode, options = {}) => {
    const requestScope = requests.current;
    if (requestScope === undefined) return;
    const focusId = options.focus ?? (mode === 'focus' ? selectedIdRef.current : undefined);
    if (mode === 'file' && (options.path === undefined || options.path === '')) return;
    if (mode === 'focus' && (focusId === undefined || focusId === null)) return;

    if (options.quiet !== true) setLoading(true);
    setError(undefined);
    try {
      const value = await requestScope.run((signal) => call('graph', {
        scope: mode,
        path: options.path,
        focus: focusId === undefined ? undefined : String(focusId),
        depth: options.depth ?? 1,
        limit: GRAPH_LIMIT,
        families: [...familiesRef.current],
      }, signal));
      if (value === undefined || !alive.current) return;
      setGraph(value);
      // Selection survives a refresh only when the node is still in the slice:
      // a stale inspector on a node the Host no longer returns would let the
      // reader open code that the graph says nothing about.
      setSelectedId((current) => {
        if (current === undefined || current === null) return current;
        return value.nodes.some((node) => node.id === current) ? current : undefined;
      });
    } catch (caught) {
      if (alive.current) setError({ message: caught && caught.message ? caught.message : String(caught) });
    } finally {
      if (alive.current && options.quiet !== true) setLoading(false);
    }
  }, [call, selectedId]);

  const loadStatus = useCallback(async (refresh) => {
    const requestScope = requests.current;
    if (requestScope === undefined) return;
    try {
      const value = await requestScope.run((signal) => call('status', refresh === true ? { refresh: true } : {}, signal));
      if (value !== undefined && alive.current) setStatus(value);
    } catch {
      // Status is cosmetic: a failure must not stop the graph from drawing.
    }
  }, [call]);

  /* ---- first paint, and every visible→true ----------------------- */

  const painted = useRef(false);
  const wasParked = useRef(parked);
  useEffect(() => {
    const resumed = wasParked.current && !parked;
    wasParked.current = parked;
    if (parked) return;

    // Fetch on mount, on an explicit revision bump, and on the parked → visible
    // edge. That last one is why `resumed` exists: without it a tab that was
    // hidden before its first paint would come back to an empty canvas, and a
    // tab that finished painting would never refresh what changed meanwhile.
    const firstPaint = !painted.current;
    if (!firstPaint && revision === 0 && !resumed) return;

    painted.current = true;
    void loadStatus(false);
    void load('workspace');
  }, [parked, loadStatus, load, revision]);

  // Parking must cancel in-flight work: an answer that lands while the tab is
  // hidden would paint a graph nobody is looking at and, worse, keep the
  // selected node's inspector fetch alive. `abort()` rather than `dispose()` —
  // the scope has to survive until the tab comes back.
  useEffect(() => {
    if (!parked) return;
    requests.current?.abort();
  }, [parked]);

  /* ---- the node inspector ---------------------------------------- */

  const nodeRequest = useRef(undefined);
  useEffect(() => {
    if (parked || selectedId === undefined || selectedId === null) {
      setDetail(undefined);
      setDetailError(undefined);
      return undefined;
    }
    if (nodeRequest.current !== undefined) nodeRequest.current.abort();
    const controller = new AbortController();
    nodeRequest.current = controller;
    let cancelled = false;
    (async () => {
      try {
        const value = await call('node', { id: selectedId }, controller.signal);
        if (!cancelled && alive.current) {
          setDetail(value);
          setDetailError(undefined);
        }
      } catch (caught) {
        if (cancelled || !alive.current) return;
        if (caught && caught.name === 'AbortError') return;
        setDetail(undefined);
        setDetailError(caught && caught.message ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedId, call, parked]);

  /* ---- actions --------------------------------------------------- */

  const rebuild = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await call('rebuild', {});
      if (alive.current) setStatus(next);
      setSelectedId(undefined);
      setQuery('');
      painted.current = false;
      setRevision((current) => current + 1);
    } catch (caught) {
      if (alive.current) setError({ message: caught && caught.message ? caught.message : String(caught) });
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call]);

  const refresh = useCallback(async () => {
    setBusy(true);
    await Promise.all([loadStatus(false), load(scopeMode, { quiet: true, focus: scopeMode === 'focus' ? selectedId : undefined })]);
    if (alive.current) setBusy(false);
  }, [loadStatus, load, scopeMode, selectedId]);

  const choose = useCallback((id, centre) => {
    if (id === undefined || id === null) {
      setSelectedId(undefined);
      return;
    }
    const node = graph?.nodes.find((row) => row.id === id);
    // Selecting a node force-enables its family and community (§12 inv. 8):
    // otherwise a search hit inside a hidden community selects an invisible node
    // and the inspector describes something the canvas does not show.
    if (node !== undefined) {
      const wanted = node.kind === 'rationale' ? 'meaning'
        : node.kind === 'external' ? 'dependency'
          : undefined;
      if (wanted !== undefined) {
        setFamilies((current) => {
          if (current.has(wanted)) return current;
          const next = new Set(current);
          next.add(wanted);
          return next;
        });
      }
      const community = Number(node.community ?? 0);
      setHiddenCommunities((current) => {
        if (!current.has(community)) return current;
        const next = new Set(current);
        next.delete(community);
        return next;
      });
    }
    setSelectedId(id);
    // A canvas click means "show me this node", so the rail's search box must
    // clear: leaving a query typed keeps the rail in results mode and the
    // inspector never appears, which reads as the click having done nothing.
    setQuery('');
    if (centre === true) canvasController.current?.centre(id);
  }, [graph]);

  /**
   * Open a node's code through the vendored sidebar.
   *
   * `openFile` takes a session id and a path; `path#L<n>` is not a path and the
   * scope object is not a session id. The shared reveal helper resolves both and
   * keeps graph and note citations on the same line.
   */
  const openNode = useCallback((node) => {
    if (node === undefined || node === null) return;
    const path = typeof node.path === 'string' ? node.path : '';
    if (path === '') return;
    const start = Math.max(1, Math.trunc(Number(node.line) || 1));
    const end = Math.max(start, Math.trunc(Number(node.endLine) || start));
    const sessionId = typeof scope === 'string'
      ? scope
      : (typeof scope?.sessionId === 'string' ? scope.sessionId : '');
    if (revealCodeRange(ctx, { path, startLine: start, endLine: end }, cwd, sessionId)) return;
    if (typeof onOpenFile === 'function') onOpenFile(path);
  }, [ctx, cwd, scope, onOpenFile]);

  /**
   * Toggle one relation family.
   *
   * Refetches rather than only filtering locally: the Host prunes links by family
   * before sending (so a 600-node slice stays small), which means turning a family
   * *on* can reveal links the current payload never contained. Local filtering
   * alone would make the `meaning` chip a no-op forever. The refetch is quiet —
   * the canvas keeps its current picture until the new slice arrives.
   */
  const toggleFamily = useCallback((family) => {
    // Compute the next set *outside* the updater. The updater runs during render,
    // so writing `familiesRef` from inside it either happens too late for the
    // refetch below or twice under StrictMode's double-invoke.
    const next = new Set(familiesRef.current);
    if (next.has(family)) next.delete(family);
    else next.add(family);
    familiesRef.current = next;
    setFamilies(next);
    void load('workspace', { quiet: true });
  }, [load]);

  const toggleCommunity = useCallback((community) => {
    setHiddenCommunities((current) => {
      const next = new Set(current);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
    // Hiding the community of the selected node clears the selection, exactly as
    // the reference does (`GraphView.tsx:225-228`): an inspector on a node that
    // is no longer drawn is a lie about the current view.
    setSelectedId((current) => {
      if (current === undefined || current === null) return current;
      const node = graph?.nodes.find((row) => row.id === current);
      return node !== undefined && Number(node.community ?? 0) === community && !hiddenCommunities.has(community)
        ? undefined
        : current;
    });
  }, [graph, hiddenCommunities]);

  const allCommunities = useCallback((hide) => {
    const ids = [...new Set((graph?.nodes ?? []).map((node) => Number(node.community ?? 0)))];
    setHiddenCommunities(hide ? new Set(ids) : new Set());
    if (hide) setSelectedId(undefined);
  }, [graph]);

  /* ---- keyboard -------------------------------------------------- */

  /**
   * The panel's key map: `/` focuses the search, `Esc` clears, `f` fits,
   * `+`/`-` zoom.
   *
   * Two disciplines: never capture while a text field or a button has focus
   * (typing "f" in the search box must type, not zoom), and never capture a bare
   * key with modifiers. `Esc` is the exception — it is checked even inside the
   * box, because a search you cannot dismiss without the mouse is a trap.
   */
  useEffect(() => {
    if (parked) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
      const editable = tag === 'input' || tag === 'textarea' || tag === 'select'
        || target?.isContentEditable === true;
      if (event.key === 'Escape') {
        if (editable && target !== searchInput.current) return;
        setQuery('');
        setSelectedId(undefined);
        searchInput.current?.blur();
        return;
      }
      if (editable) return;
      if (event.key === '/') {
        event.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        canvasController.current?.fit();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        canvasController.current?.zoomBy(1.1);
        return;
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        canvasController.current?.zoomBy(1 / 1.1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [parked]);

  /* ---- derived --------------------------------------------------- */

  const rawNodes = graph?.nodes ?? [];
  const rawLinks = graph?.links ?? [];

  /**
   * The canvas keeps a *cap* of the slice, grown for connectivity.
   *
   * The Host already trims to `limit`, but its cap and the canvas's budget are
   * different questions (the Host answers "what is the graph", the canvas "what
   * can be drawn at 60 fps"), so the slice is applied again here. It is applied
   * to the *raw* payload so filtering by family cannot change which nodes exist.
   */
  const capped = useMemo(() => {
    if (rawNodes.length <= GRAPH_LIMIT) return rawNodes;
    return connectedSlice(rawNodes, rawLinks, GRAPH_LIMIT);
  }, [rawNodes, rawLinks]);

  const kept = useMemo(() => new Set(capped.map((node) => node.id)), [capped]);
  const links = useMemo(() => rawLinks.filter((link) => kept.has(link.source) && kept.has(link.target)), [rawLinks, kept]);

  const communities = useMemo(() => {
    const byId = new Map();
    for (const node of capped) {
      const id = Number(node.community ?? 0);
      const size = Number(node.memberCount ?? 1) || 1;
      const entry = byId.get(id);
      if (entry === undefined) {
        byId.set(id, {
          id,
          label: node.communityLabel ?? t('graph.communities.unnamed', { id }),
          size,
        });
      } else {
        entry.size += size;
      }
    }
    return [...byId.values()].sort((a, b) => b.size - a.size || a.id - b.id);
  }, [capped, t]);

  const selectedNode = selectedId === undefined ? undefined : capped.find((node) => node.id === selectedId);
  const searching = query.trim() !== '';

  const onSearchPick = useCallback((node) => {
    choose(node.id, true);
    setQuery('');
  }, [choose]);

  const scopeDisabled = (mode) => {
    if (mode === 'file') return selectedNode === undefined || selectedNode.path === undefined || selectedNode.path === '';
    if (mode === 'focus') return selectedId === undefined || selectedId === null;
    return false;
  };

  const changeScope = useCallback((mode) => {
    if (scopeDisabled(mode)) return;
    setScopeMode(mode);
    setQuery('');
    if (mode === 'file') {
      void load('file', { path: selectedNode.path });
      return;
    }
    if (mode === 'focus') {
      void load('focus', { focus: selectedId, depth: 1 });
      return;
    }
    void load('workspace');
  }, [load, selectedId, selectedNode, scopeDisabled]);

  /* ---- render ---------------------------------------------------- */

  if (error !== undefined && graph === undefined) {
    return h('div', { className: 'cs-root' },
      h('div', { className: 'cs-empty' },
        h(Glyph.alert, { size: 22 }),
        h('b', null, t('graph.error.title')),
        h('p', null, error.message),
        h('button', {
          type: 'button', className: 'cs-btn cs-primary', onClick: () => { void loadStatus(false); void load('workspace'); },
        }, t('common.retry'))));
  }

  return h('div', { className: 'cs-root', ref: hostRef },
    /* ---- toolbar ---- */
    h('div', { className: 'cs-bar cs-wrap' },
      h('div', { className: 'cs-seg', role: 'group', 'aria-label': t('graph.legend.title') },
        ['workspace', 'file', 'focus'].map((mode) => h('button', {
          key: mode,
          type: 'button',
          className: scopeMode === mode ? 'cs-on' : undefined,
          disabled: scopeDisabled(mode),
          title: scopeDisabled(mode)
            ? t(mode === 'file' ? 'graph.scope.hint.file' : 'graph.scope.hint.focus')
            : undefined,
          'aria-pressed': scopeMode === mode ? 'true' : 'false',
          onClick: () => changeScope(mode),
        }, t(`graph.scope.${mode}`)))),
      h('div', { className: 'cs-grow' }),
      busy || (loading && graph !== undefined)
        ? h('span', { className: 'cs-row cs-muted', style: { fontSize: '10px' } },
          h('span', { className: 'cs-spin' }, Glyph.spinner(11)))
        : null,
      h('button', {
        type: 'button',
        className: 'cs-iconbtn',
        title: t('graph.action.refresh'),
        'aria-label': t('graph.action.refresh'),
        disabled: busy,
        onClick: () => { void refresh(); },
      }, Glyph.refresh(14)),
      h('button', {
        type: 'button',
        className: 'cs-iconbtn',
        title: t('graph.action.rebuild.hint'),
        'aria-label': t('graph.action.rebuild'),
        disabled: busy,
        onClick: () => { void rebuild(); },
      }, Glyph.rebuild(14))),

    status !== undefined
      ? h('div', { className: 'cs-bar cs-sub cs-mono', style: { fontSize: '10.5px' } },
        h('span', { className: 'cs-ellipsis cs-grow' },
          t('graph.status.summary', {
            nodes: formatInt(status.nodes, locale),
            edges: formatInt(status.edges, locale),
            communities: formatInt(status.communities, locale),
          })),
        h('span', { className: 'cs-muted cs-noshrink' },
          t('graph.status.built', {
            files: formatInt(status.files, locale),
            lines: formatInt(status.lines, locale),
            buildMs: formatInt(status.buildMs, locale),
          })))
      : null,

    error !== undefined && graph !== undefined
      ? h('div', { className: 'cs-banner cs-warn' },
        h(Glyph.alert, { size: 13 }),
        h('span', { className: 'cs-grow' }, error.message),
        h('button', {
          type: 'button', className: 'cs-btn cs-small', onClick: () => { void load(scopeMode, { focus: selectedId }); },
        }, t('common.retry')))
      : null,

    /* ---- body: canvas + rail ---- */
    h('div', { className: `cs-graph-body${narrow ? ' cs-narrow' : ''}` },
      h(GraphCanvas, {
        ctx,
        nodes: capped,
        links,
        selectedId,
        onSelect: (id) => choose(id, false),
        onOpen: openNode,
        families,
        onToggleFamily: toggleFamily,
        hiddenCommunities,
        aggregated: graph?.aggregated === true,
        truncation: graph === undefined
          ? undefined
          : {
            shown: capped.length,
            total: Math.max(capped.length, Number(graph.total?.nodes ?? rawNodes.length)),
          },
        loading: loading && graph === undefined,
        error: graph === undefined ? error : undefined,
        onRetry: () => { void load('workspace'); },
        visible,
        t,
        locale,
        controller: canvasController,
      }),

      h('div', { className: 'cs-rail' },
        h(GraphSearch, {
          nodes: capped,
          query,
          onQuery: setQuery,
          onPick: onSearchPick,
          onClear: () => setQuery(''),
          selectedId,
          t,
          locale,
          inputRef: searchInput,
        }),

        // Rail modes, in the reference's priority order (§5.1): search results
        // outrank the inspector, the inspector outranks the community list.
        searching ? null : selectedNode !== undefined
          ? h(NodeInspector, {
            node: selectedNode,
            detail,
            detailError,
            onBack: () => setSelectedId(undefined),
            onOpen: openNode,
            onPick: (id) => choose(id, false),
            onAsk: typeof onAsk === 'function' ? onAsk : undefined,
            t,
            locale,
          })
          : h(CommunityList, {
            communities,
            hiddenCommunities,
            onToggle: toggleCommunity,
            onAll: allCommunities,
            t,
            locale,
          })),

        !searching && selectedNode === undefined
          ? h('div', { className: 'cs-rail-foot' }, t('graph.inspector.idle'))
          : null));
}

/**
 * The rail's node inspector.
 *
 * Order and content follow `spec §5.3-5.4`: back button, kind pill + community,
 * label, `path:line · N neighbours`, actions, rationale, then the relation
 * groups as `<details>` with the call groups expanded. `MAX_ROWS` is 60 and the
 * truncation note is a real string, not a silent cut.
 *
 * @param props - `{node, detail, detailError, onBack, onOpen, onPick, onAsk, t, locale}`:
 *   `node` is the slice row (available before `detail` lands, so the header
 *   renders instantly); `detail` is the `node` method's answer; `onPick(id)`
 *   selects a neighbour without moving the camera.
 * @returns the inspector.
 */
function NodeInspector(props) {
  const {
    node, detail, detailError, onBack, onOpen, onPick, onAsk, t, locale,
  } = props;

  const groups = detail?.groups ?? [];
  const rationale = detail?.rationale ?? [];
  const siblings = detail?.siblings ?? [];
  const neighbours = detail?.node?.neighbourCount ?? node.degree ?? 0;
  const location = node.path === undefined || node.path === '' ? '' : `${node.path}:${node.line ?? 1}`;

  /** `callers`/`calls` open by default; otherwise the first group (spec §5.4). */
  const hasCalls = groups.some((group) => group.key === 'callers' || group.key === 'calls');

  return h('div', { className: 'cs-detail' },
    renderBackBar(onBack, t),
    renderHead(node, neighbours, location, onOpen, onAsk, t, locale),
    renderAlert(detailError),
    renderRationale(rationale),
    renderGroups(groups, hasCalls, { onPick, onOpen, t, locale }),
    renderSiblings(siblings, { onPick, onOpen, t, locale }),
  );
}

/** The inspector's back row. */
function renderBackBar(onBack, t) {
  return h('div', { className: 'cs-bar cs-sub' },
    h('button', {
      type: 'button', className: 'cs-btn cs-ghost cs-small', onClick: () => onBack?.(),
    }, Glyph.back(12), t('graph.inspector.back')));
}

/** Kind pill, community tag, name, and the location/degree line. */
function renderHead(node, neighbours, location, onOpen, onAsk, t, locale) {
  const hasCommunity = node.communityLabel !== undefined && node.communityLabel !== '';
  const communityTag = hasCommunity
    ? h('span', {
      className: 'cs-tag cs-ellipsis',
      style: { borderColor: communityColor(node.community ?? 0), color: communityColor(node.community ?? 0) },
    }, node.communityLabel)
    : null;

  const openButton = node.path === undefined || node.path === ''
    ? null
    : h('button', {
      type: 'button', className: 'cs-btn cs-small cs-primary', onClick: () => onOpen?.(node),
    }, Glyph.open(12), t('graph.inspector.open'));

  // "Ask about this node" goes into the workbench's shared conversation. The
  // standalone graph tab has no conversation beside it, so the host simply does
  // not pass `onAsk` and the button does not exist — a disabled button would
  // promise a panel that is not there.
  const askButton = typeof onAsk === 'function'
    ? h('button', {
      type: 'button', className: 'cs-btn cs-small cs-ghost', title: t('graph.inspector.askHint'),
      onClick: () => onAsk(node),
    }, Glyph.chat(12), t('graph.inspector.ask'))
    : null;

  return h('div', { className: 'cs-detail-head' },
    h('div', { className: 'cs-detail-title' },
      h('div', { className: 'cs-row' },
        h('span', { className: `cs-kind cs-k-${node.kind ?? 'function'}` }, kindLabel(node.kind, locale)),
        h('span', { className: 'cs-grow' }),
        communityTag),
      h('h2', { title: node.label }, node.label),
      h('div', { className: 'cs-detail-meta cs-mono cs-ellipsis' },
        location === '' ? t('common.none') : location,
        ' · ',
        t('graph.inspector.neighbours', { count: neighbours }))),
    h('div', { className: 'cs-detail-acts' }, askButton, openButton));
}

/** The failure banner, when the detail fetch failed. */
function renderAlert(detailError) {
  if (detailError === undefined || detailError === null) return null;
  return h('div', { className: 'cs-banner cs-warn' },
    h(Glyph.alert, { size: 12 }),
    h('span', { className: 'cs-grow' }, detailError));
}

/**
 * The recorded reasons, above the relation groups.
 *
 * "Why does this exist" is the question the graph exists to answer, and burying
 * it under sixty relation rows loses it.
 */
function renderRationale(rationale) {
  if (rationale.length === 0) return null;
  const rows = rationale.map((row, index) => h('div', {
    key: `r${index}`,
    className: `cs-rationale${row.origin === 'docstring' ? '' : ' cs-quiet'}`,
  }, row.text));
  return h('div', { className: 'cs-col', style: { gap: '4px', paddingBottom: '4px' } }, rows);
}

/** One relation row. */
function renderConnectionRow(item, handlers, locale) {
  const { onPick, onOpen } = handlers;
  const title = [
    item.path,
    relationLabel(item.relation, locale),
    confidenceLabel(item.confidence, locale),
    item.line === undefined ? undefined : `L${item.line}`,
  ].filter((part) => part !== undefined && part !== '').join(' · ');

  const direction = h('span', {
    className: 'cs-dir',
    'data-dir': item.outgoing === true ? 'out' : 'in',
  }, item.outgoing === true ? '→' : '←');

  const location = item.path === undefined || item.path === ''
    ? null
    : h('span', { className: 'cs-loc' }, `${item.path}:${item.line ?? 1}`);

  const open = item.external === true || item.path === undefined
    ? null
    : h('span', { className: 'cs-open' }, Glyph.open(11));

  return h('button', {
    key: `${item.relation}:${item.id}`,
    type: 'button',
    className: 'cs-rel',
    title,
    onClick: () => onPick?.(item.id),
    onDoubleClick: () => onOpen?.(item),
  },
  direction,
  h('span', { className: 'cs-name cs-ellipsis' }, item.label),
  h('span', { className: 'cs-meta' }, kindLabel(item.kind, locale)),
  location,
  h('span', {
    className: 'cs-rel-label',
    style: { color: communityColor(item.community ?? 0) },
  }, relationLabel(item.relation, locale)),
  open);
}

/** One collapsible relation group. */
function renderGroup(group, index, hasCalls, handlers, locale) {
  const { t, onPick, onOpen } = handlers;
  const visible = group.items.slice(0, 60);
  const rows = visible.map((item) => renderConnectionRow(item, { onPick, onOpen }, locale));
  const more = group.items.length > 60
    ? h('div', { className: 'cs-group-more' },
      t('graph.rows.more', { count: formatInt(group.items.length - 60, locale) }))
    : null;

  return h('details', {
    key: group.key,
    className: 'cs-group',
    open: group.key === 'callers' || group.key === 'calls' || (!hasCalls && index === 0),
  },
  h('summary', null,
    h('span', { className: 'cs-twist' }, Glyph.chevronRight(11)),
    h('span', { className: 'cs-grow' }, groupLabel(group.key, locale)),
    h('span', { className: 'cs-count' }, formatInt(group.items.length, locale))),
  h('div', { className: 'cs-group-list' }, rows, more));
}

/** The relation groups, or a loading line while they are still arriving. */
function renderGroups(groups, hasCalls, handlers) {
  if (groups.length === 0) {
    return h('div', { className: 'cs-group-more' }, handlers.t('common.loading'));
  }
  return groups.map((group, index) => renderGroup(group, index, hasCalls, handlers, handlers.locale));
}

/** Same-file declarations that are not the selected node. */
function renderSiblings(siblings, handlers) {
  if (siblings.length === 0) return null;
  const { t, locale, onPick, onOpen } = handlers;
  const rows = siblings.map((row) => h('button', {
    key: row.id,
    type: 'button',
    className: 'cs-rel',
    onClick: () => onPick?.(row.id),
    onDoubleClick: () => onOpen?.(row),
  },
  h('span', { className: 'cs-name cs-ellipsis' }, row.label),
  h('span', { className: 'cs-meta' }, kindLabel(row.kind, locale)),
  h('span', { className: 'cs-loc' }, `:${row.line ?? 1}`)));

  return h('details', { className: 'cs-group' },
    h('summary', null,
      h('span', { className: 'cs-twist' }, Glyph.chevronRight(11)),
      h('span', { className: 'cs-grow' }, t('graph.inspector.siblings')),
      h('span', { className: 'cs-count' }, formatInt(siblings.length, locale))),
    h('div', { className: 'cs-group-list' }, rows));
}

/**
 * The rail's community list.
 *
 * One row per community: checkbox, colour dot, label, size. "Hide all" also
 * clears the selection, because after it the canvas has nothing to select.
 * @param props - `{communities, hiddenCommunities, onToggle(id), onAll(hide), t, locale}`.
 * @returns the community section.
 */
function CommunityList(props) {
  const {
    communities, hiddenCommunities, onToggle, onAll, t, locale,
  } = props;
  const allHidden = communities.length > 0 && communities.every((row) => hiddenCommunities.has(row.id));

  return h('div', { className: 'cs-col', style: { minHeight: 0 } },
    h('div', { className: 'cs-section-head' },
      h('span', { className: 'cs-grow' }, t('graph.communities.title')),
      h('span', { className: 'cs-muted cs-tabular' }, formatInt(communities.length, locale)),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-ghost cs-small',
        onClick: () => onAll?.(!allHidden),
      }, allHidden ? t('graph.communities.showAll') : t('graph.communities.hideAll'))),
    communities.length === 0
      ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '14px 10px' } }, t('graph.communities.none'))
      : h('div', { className: 'cs-rail-scroll' }, communities.map((row) => h('label', {
        key: row.id,
        className: `cs-comm${hiddenCommunities.has(row.id) ? ' cs-off' : ''}`,
      },
      h('input', {
        type: 'checkbox',
        checked: !hiddenCommunities.has(row.id),
        onChange: () => onToggle?.(row.id),
      }),
      h('span', { className: 'cs-swatch', style: { background: communityColor(row.id) } }),
      h('span', { className: 'cs-grow', title: row.label }, row.label),
      h('span', { className: 'cs-count' }, formatInt(row.size, locale))))));
}
