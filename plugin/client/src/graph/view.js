/**
 * Code graph view for the conversation session (Agent C, §2.2).
 *
 * This is the single integration point the session view registers beside
 * 对话 / 轨迹: a left vis-network stage and a right inspector rail. Behaviour
 * is aligned with the desktop reference `GraphView.tsx`:
 *
 * - Header stats recompute from the filtered projection, never the raw payload.
 * - Family chips toggle relation families locally; hidden rows stay in the
 *   DataSet so toggling back cannot restart the layout.
 * - The rail is one mode at a time: search results → node inspector → community
 *   legend.
 * - `focusRequest` lands here from the conversation: resolve the node by id or
 *   path, select it and centre the camera.
 * - A node opened (double-click / inspector button) hands `{path, startLine,
 *   endLine, nodeId, label}` to `props.onOpenFile`, which opens the reader.
 * - When `sessionId` is present the stage first asks for session-related nodes;
 *   if the host returns none, the whole workspace is shown behind a banner so
 *   the canvas is never blank.
 */

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from '../icons.js';
import { makeCaller, makeRequestScope } from '../api.js';
import { resolveWorkspace } from '../workspace-resolve.js';
import { formatInt } from '../i18n.js';
import { GraphStage } from './canvas.js';
import { grCommunityColor, grRelationFamily } from './theme.js';
import {
  grRelationGroups, grRelationLabel, grKindLabel, grConfidenceLabel,
} from './relations.js';
import {
  grFilterGraph, grDefaultFilters, grVisibleCount, GRAPH_CHIP_FAMILIES, GRAPH_FAMILY_LIST,
} from './filter.js';

/** Rows per relation group before the rail tells the reader how many it hid. */
const GRAPH_MAX_ROWS = 60;

/** Fingerprint a topology from its ids, for the coordinate cache key. */
function grTopologyKey(payload) {
  let hash = 2166136261;
  const mix = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const node of payload?.nodes ?? []) mix(String(node.id));
  for (const edge of payload?.edges ?? payload?.links ?? []) {
    mix(String(edge.source));
    mix('\u0001');
    mix(String(edge.target));
  }
  return `${(payload?.nodes ?? []).length}:${(payload?.edges ?? payload?.links ?? []).length}:${hash >>> 0}`;
}

/**
 * The graph session view.
 *
 * @param {object} props
 * @param {object} props.ctx - client context.
 * @param {{cwd?:string, sessionId?:string}} [props.scope]
 * @param {boolean} [props.visible] - `false` means parked-but-mounted.
 * @param {{path?:string,nodeId?:string,startLine?:number,endLine?:number,nonce?:number}} [props.focusRequest]
 * @param {(target:{path:string,startLine?:number,endLine?:number,nodeId:string,label:string})=>void} [props.onOpenFile]
 * @param {(node:object)=>void} [props.onAsk]
 * @param {boolean} [props.railCollapsible] - hide the inspector rail behind a
 *   toggle; used by the workbench project canvas so the graph gets the full
 *   main-panel width instead of a permanently docked rail.
 * @param {(key:string,vars?:object)=>string} props.t
 * @param {string} props.locale
 * @returns {object} the view element.
 */
export function GraphView(props) {
  const {
    ctx, scope, visible, focusRequest, onOpenFile, onAsk, t, locale, railCollapsible,
    loader, persistLayout, showFamilies, fetchDetail, relationScope, onActivateNode,
  } = props;

  const keepLayout = persistLayout !== false;
  const chips = showFamilies !== false;
  const wantDetail = fetchDetail !== false;
  const groupsScope = relationScope === 'notes' ? 'notes' : 'code';

  const parked = visible === false;
  const railToggle = railCollapsible === true;
  const [railOpen, setRailOpen] = useState(false);

  // A `conversation.view` registration receives shell props only — there is no
  // `scope` on them. Without resolving the session's own directory the request
  // carries no `cwd`, and the Host falls back to
  // `workingDirectory.defaultDirectory`: the canvas then draws the harness
  // profile (package.json / pnpm-workspace.yaml, ~40 nodes) instead of the
  // project the conversation belongs to (~900 nodes). Resolve it here so the
  // graph, its cached layout and every node lookup share one root.
  //
  // The shell's own path lookup (`sessionFilePath` in ui-conversation) reads
  // `sessions.binding(id).session.projections.faceOf('workingDirectory')` and
  // falls back to `sessions.list.byId[id].cwd`; `workspace-resolve.js` already
  // joins the workspace model on the session id for the composer bar, so this
  // view uses the same two sources rather than inventing a third.
  const cwd = useMemo(() => {
    if (scope && typeof scope.cwd === 'string' && scope.cwd !== '') return scope.cwd;
    const id = props.sessionId ?? (scope && typeof scope.sessionId === 'string' ? scope.sessionId : undefined);
    if (typeof id !== 'string' || id === '') return undefined;
    try {
      const sessions = typeof ctx?.get === 'function' ? ctx.get('sessions') : undefined;
      if (sessions !== undefined && sessions !== null) {
        const binding = typeof sessions.binding === 'function' ? sessions.binding(id) : undefined;
        const live = binding?.session?.projections?.faceOf?.('workingDirectory')?.getSnapshot?.();
        if (typeof live === 'string' && live !== '') return live;
        const listed = sessions.list?.getSnapshot?.()?.byId?.[id]?.cwd;
        if (typeof listed === 'string' && listed !== '') return listed;
      }
    } catch {
      // fall through to the workspace model
    }
    return resolveWorkspace(ctx, { sessionId: id });
  }, [ctx, scope, props.sessionId]);

  const sessionId = props.sessionId ?? (scope && typeof scope.sessionId === 'string' ? scope.sessionId : undefined);
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const [payload, setPayload] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(undefined);
  const [relatedEmpty, setRelatedEmpty] = useState(false);
  // A graph with no relation chips (the notes graph) must not gate its edges on
  // the code-graph default families: every family is visible when nothing can be
  // toggled.
  const [filters, setFilters] = useState(() => (chips && groupsScope !== 'notes'
    ? grDefaultFilters()
    : { families: new Set(GRAPH_FAMILY_LIST), hiddenCommunities: new Set() }));
  const [selectedId, setSelectedId] = useState(undefined);
  const [detail, setDetail] = useState(undefined);
  const [detailError, setDetailError] = useState(undefined);
  const [focus, setFocus] = useState(null);
  const [query, setQuery] = useState('');
  const [activeCommunity, setActiveCommunity] = useState(undefined);
  const [layoutKey, setLayoutKey] = useState('');
  const [initialPositions, setInitialPositions] = useState(undefined);

  const requests = useRef(undefined);
  const alive = useRef(true);
  const familiesRef = useRef(filters.families);
  familiesRef.current = filters.families;
  const focusNonce = useRef(0);
  const appliedFocusNonce = useRef(undefined);
  const controllerRef = useRef(undefined);
  // The workbench passes an inline loader; keeping it in a ref means a parent
  // re-render cannot restart the fetch (and the camera) every time.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    alive.current = true;
    const scopeHandle = makeRequestScope();
    requests.current = scopeHandle;
    return () => {
      alive.current = false;
      scopeHandle.dispose();
      requests.current = undefined;
    };
  }, []);

  /* ---- data load: mount, resume from parking, explicit revision ------ */

  const load = useCallback(async () => {
    const scopeHandle = requests.current;
    if (scopeHandle === undefined) return;
    setLoading(true);
    setError(undefined);
    try {
      let value;
      if (typeof loaderRef.current === 'function') {
        value = await scopeHandle.run((signal) => loaderRef.current(call, signal));
      } else if (sessionId !== undefined && sessionId !== '') {
        value = await scopeHandle.run((signal) => call('graph', {
          sessionId, related: sessionId, families: [...familiesRef.current],
        }, signal));
        if (value !== undefined && (!Array.isArray(value.nodes) || value.nodes.length === 0)) {
          setRelatedEmpty(true);
          value = await scopeHandle.run((signal) => call('graph', {
            families: [...familiesRef.current],
          }, signal));
        } else {
          setRelatedEmpty(false);
        }
      } else {
        value = await scopeHandle.run((signal) => call('graph', {
          families: [...familiesRef.current],
        }, signal));
      }
      if (!alive.current || value === undefined) return;
      setPayload(value);
      const key = typeof value.topologyKey === 'string' && value.topologyKey !== ''
        ? value.topologyKey
        : grTopologyKey(value);
      setLayoutKey(key);
      // The notes graph has its own topology and no layout store entry; asking
      // for one would only add a round-trip and a stale-coordinate risk.
      if (!keepLayout) {
        setInitialPositions(undefined);
        return;
      }
      const layout = await scopeHandle.run((signal) => call('layout', { key }, signal));
      if (alive.current && layout !== undefined && layout.positions !== undefined) {
        setInitialPositions(layout.positions);
      }
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call, sessionId, keepLayout]);

  useEffect(() => {
    if (parked) return undefined;
    void load();
    return undefined;
  }, [parked, load]);

  // Parking cancels in-flight work but keeps the scope usable on resume.
  useEffect(() => {
    if (parked) requests.current?.abort();
  }, [parked]);

  /* ---- derived graph model ------------------------------------------ */

  const byId = useMemo(() => new Map(
    (payload?.nodes ?? []).map((node) => [node.id, node]),
  ), [payload]);

  const view = useMemo(
    () => grFilterGraph(payload ?? { nodes: [], edges: [] }, filters),
    [payload, filters],
  );

  const visibleNodeCount = useMemo(() => grVisibleCount(view.nodes), [view.nodes]);
  const visibleEdgeCount = useMemo(() => grVisibleCount(view.edges), [view.edges]);

  const communities = useMemo(() => {
    const map = new Map();
    for (const node of view.nodes) {
      if (node.hidden) continue;
      const cid = Number(node.community ?? 0);
      const entry = map.get(cid) ?? { id: cid, label: node.communityLabel || `#${cid}`, size: 0 };
      entry.size += 1;
      map.set(cid, entry);
    }
    return [...map.values()].sort((a, b) => b.size - a.size || a.id - b.id);
  }, [view.nodes]);

  /* ---- selection ----------------------------------------------------- */

  const choose = useCallback((id, zoom = true) => {
    const node = byId.get(id);
    if (node === undefined) return;
    setFilters((current) => {
      const families = new Set(current.families);
      if (node.kind === 'rationale') families.add('meaning');
      if (node.kind === 'external') families.add('dependency');
      const hiddenCommunities = new Set(current.hiddenCommunities);
      hiddenCommunities.delete(Number(node.community ?? 0));
      return { families, hiddenCommunities };
    });
    setSelectedId(id);
    setQuery('');
    setActiveCommunity(undefined);
    if (zoom) setFocus({ id, nonce: ++focusNonce.current });
    else setFocus(null);
  }, [byId]);

  const handleSelect = useCallback((id) => {
    if (id === null || id === undefined) {
      setSelectedId(undefined);
      setActiveCommunity(undefined);
      setFocus(null);
      return;
    }
    choose(id, false);
  }, [choose]);

  const openNode = useCallback((node) => {
    if (node === undefined || node === null) return;
    // A notes-graph node is not a code location; the workbench decides what
    // activation means (open the note, or nothing for a topic label).
    if (typeof onActivateNode === 'function') {
      onActivateNode(node);
      return;
    }
    const path = typeof node.path === 'string' ? node.path : '';
    if (path === '') return;
    onOpenFile?.({
      path,
      startLine: node.line ?? node.start_line,
      endLine: node.endLine ?? node.end_line,
      nodeId: node.id,
      label: node.label,
    });
  }, [onOpenFile, onActivateNode]);

  const handleActivate = useCallback((id) => {
    const node = byId.get(id);
    if (node !== undefined) openNode(node);
  }, [byId, openNode]);

  /* ---- inspector detail --------------------------------------------- */

  useEffect(() => {
    if (!wantDetail || parked || selectedId === undefined || selectedId === null) {
      setDetail(undefined);
      setDetailError(undefined);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const value = await call('node', { id: selectedId });
        if (!cancelled) {
          setDetail(value);
          setDetailError(undefined);
        }
      } catch (caught) {
        if (cancelled) return;
        setDetail(undefined);
        setDetailError(caught && caught.message ? caught.message : String(caught));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, call, parked, wantDetail]);

  /* ---- conversation → graph focus landing --------------------------- */

  useEffect(() => {
    const fr = focusRequest;
    if (fr === undefined || fr === null) return;
    if (appliedFocusNonce.current === fr.nonce) return;
    if (payload === undefined) return;
    let target = fr.nodeId !== undefined && fr.nodeId !== null
      ? byId.get(String(fr.nodeId))
      : undefined;
    if (target === undefined && typeof fr.path === 'string' && fr.path !== '') {
      target = (payload.nodes ?? []).find((node) => node.path === fr.path);
    }
    if (target !== undefined) {
      appliedFocusNonce.current = fr.nonce;
      choose(target.id, true);
    }
  }, [focusRequest, payload, byId, choose]);

  /* ---- filters -------------------------------------------------------- */

  const toggleFamily = useCallback((family) => {
    setFilters((current) => {
      const families = new Set(current.families);
      if (families.has(family)) families.delete(family);
      else families.add(family);
      return { ...current, families };
    });
  }, []);

  const toggleCommunityHighlight = useCallback((cid) => {
    if (activeCommunity === cid) {
      setActiveCommunity(undefined);
      setSelectedId(undefined);
      setFocus(null);
      return;
    }
    const members = view.nodes.filter((node) => !node.hidden
      && Number(node.community ?? 0) === cid);
    // The row is a region summary, but the canvas needs one concrete anchor for
    // the same white-ring focus a node click gets. Pick the community's most
    // connected member; it is usually the file that names the community in the
    // legend (`pages.js +28`, `api-chat.js +6`, …).
    const hub = members.reduce((best, node) => {
      if (best === undefined) return node;
      const a = Number(node.degree ?? node.memberCount ?? 0);
      const b = Number(best.degree ?? best.memberCount ?? 0);
      if (a > b) return node;
      if (a === b && String(node.label) < String(best.label)) return node;
      return best;
    }, undefined);
    setSelectedId(undefined);
    setActiveCommunity(cid);
    // Match a node click exactly: centre the community's hub with the same
    // `focusScale`, instead of fitting all 131 members. Fitting the region left
    // the hub's selection ring too small to read at the resulting zoom.
    setFocus(hub === undefined
      ? null
      : { id: hub.id, hubId: hub.id, nonce: ++focusNonce.current });
    // The drawer covers almost the whole 394px stage. Leaving it open after a
    // community click hides both the camera move and the hub ring, so collapse
    // it; `详情` reopens the list and the selected row is still blue.
    if (railToggle && railOpen) setRailOpen(false);
  }, [activeCommunity, view.nodes, railOpen, railToggle]);

  const handleSettled = useCallback((positions) => {
    if (layoutKey === '' || !keepLayout) return;
    call('layout', { key: layoutKey, positions }).catch(() => {
      /* layout persistence is best effort; the in-memory cache still works */
    });
  }, [call, layoutKey, keepLayout]);

  /* ---- search results ------------------------------------------------- */

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return [];
    return (payload?.nodes ?? []).filter((node) => [
      node.label, node.path ?? '', node.communityLabel ?? '',
    ].join(' ').toLowerCase().includes(needle)).slice(0, 30);
  }, [query, payload]);

  /* ---- inspector groups: host grouping first, local fallback ---------- */

  const selected = selectedId !== undefined && selectedId !== null ? byId.get(selectedId) ?? null : null;

  const inspectorGroups = useMemo(() => {
    if (selected === null) return [];
    if (Array.isArray(detail?.groups) && detail.groups.length > 0) return detail.groups;
    const raw = grRelationGroups(selected.id, payload?.links ?? payload?.edges ?? [], byId, groupsScope);
    return raw.map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items.map((connection) => ({
        id: connection.other.id,
        label: connection.other.label,
        kind: connection.other.kind,
        path: connection.other.path,
        line: connection.other.line ?? connection.other.start_line,
        relation: connection.edge.relation,
        confidence: connection.edge.confidence,
        outgoing: connection.outgoing,
      })),
    }));
  }, [selected, detail, payload, byId, groupsScope]);

  const detailNode = detail?.node ?? selected;

  /* ---- height: the shell's view area is content-sized ------------------ */

  // `conversation.session` mounts this view in a `flex: 1 0 auto` area whose
  // height is whatever its children measure. The inspector's community list
  // therefore stretched the view to 5424px on a 609px pane and vis fitted the
  // graph into that strip (small dots, huge gaps, labels stacked). Pin the
  // height to the nearest scrolling ancestor — the conversation scroll body —
  // and keep it in sync when the sidebar opens or closes.
  const rootRef = useRef(undefined);
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (node === undefined || node === null || typeof window === 'undefined') return undefined;
    let scroller = node.parentElement;
    while (scroller !== null && scroller !== undefined && scroller !== window.document.body) {
      const overflowY = window.getComputedStyle(scroller).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.clientHeight > 0) break;
      scroller = scroller.parentElement;
    }
    if (scroller === null || scroller === undefined || scroller === window.document.body) return undefined;
    // The composer is sticky inside the same scroll body and paints over the
    // bottom of this view (the CodeSlice chip and the input box). Reserve its
    // height, otherwise the community list ends up underneath the input.
    const seatOf = () => {
      const seat = scroller.querySelector('[class*="_composerSeat"]');
      if (seat === null || seat === undefined) return 0;
      return Math.max(0, Math.round(seat.getBoundingClientRect().height));
    };
    const apply = () => {
      const height = scroller.clientHeight - seatOf();
      if (height > 0) node.style.height = `${height}px`;
    };
    apply();
    if (typeof window.ResizeObserver !== 'function') return undefined;
    const observer = new window.ResizeObserver(apply);
    observer.observe(scroller);
    const seat = scroller.querySelector('[class*="_composerSeat"]');
    if (seat !== null && seat !== undefined) observer.observe(seat);
    return () => observer.disconnect();
  }, []);

  /* ---- render ---------------------------------------------------------- */

  // Only the families this payload actually contains get a chip. The notes graph
  // has structure (mention/co-occurrence) and meaning (similarity) but no calls,
  // so offering a 「调用」 switch would be a lie.
  const chipFamilies = chips
    ? GRAPH_CHIP_FAMILIES.filter((family) => (payload?.links ?? payload?.edges ?? [])
      .some((edge) => String(edge.family ?? grRelationFamily(edge.relation)) === family))
    : [];

  const statRow = (label, count) => h('span', { className: 'gr-stat' },
    h('b', null, formatInt(count, locale)),
    h('span', null, label));

  return h('div', { className: 'gr-view', ref: rootRef },
    h('div', { className: 'gr-head' },
      h('div', { className: 'gr-stats', 'data-cs': 'graph-stats' },
        statRow(t('gr.stats.nodes'), visibleNodeCount),
        statRow(t('gr.stats.edges'), visibleEdgeCount),
        statRow(t('gr.stats.communities'), communities.length)),
      chipFamilies.length > 0
        ? h('div', { className: 'gr-family-bar', 'data-cs': 'graph-families' },
          chipFamilies.map((family) => h('button', {
            key: family,
            type: 'button',
            className: 'gr-chip',
            'aria-pressed': filters.families.has(family) ? 'true' : 'false',
            title: t(`gr.family.hint.${family}`),
            onClick: () => toggleFamily(family),
          },
            h('span', { className: 'gr-swatch' }),
            h('span', null, t(`gr.family.${family}`)))))
        : null),

    relatedEmpty
      ? h('div', { className: 'gr-banner-all' }, t('gr.scope.all'))
      : null,

    h('div', { className: `gr-body${railToggle ? ' gr-body-collapsible' : ''}` },
      h(GraphStage, {
        ctx,
        nodes: view.nodes,
        edges: view.edges,
        selectedId,
        focus,
        layoutKey,
        initialPositions,
        activeCommunity,
        visible,
        fitPad: groupsScope === 'notes' ? { x: 150, y: 200, maxScale: 1.6 } : undefined,
        nodeScale: groupsScope === 'notes' ? 0.55 : undefined,
        hintKey: groupsScope === 'notes' ? 'gr.canvas.hintNotes' : undefined,
        onSelect: handleSelect,
        onActivate: handleActivate,
        onSettled: handleSettled,
        controllerRef,
        t,
        locale,
      }),

      railToggle
        ? h('button', {
          type: 'button',
          className: 'gr-rail-toggle',
          'aria-expanded': railOpen ? 'true' : 'false',
          onClick: () => setRailOpen((open) => !open),
        }, railOpen ? t('gr.rail.hide') : t('gr.rail.show'))
        : null,

      h('aside', {
        className: `gr-rail${railToggle ? ' gr-rail-drawer' : ''}`,
        'data-cs': 'graph-inspector',
        hidden: railToggle && !railOpen,
      },
        h('div', { className: 'gr-rail-search' },
          h('input', {
            className: 'gr-input',
            value: query,
            placeholder: t(groupsScope === 'notes' ? 'gr.search.placeholderNotes' : 'gr.search.placeholder'),
            'aria-label': t(groupsScope === 'notes' ? 'gr.search.placeholderNotes' : 'gr.search.placeholder'),
            onChange: (event) => setQuery(event.target.value),
          })),

        query.trim() !== ''
          ? h('div', { className: 'gr-rail-scroll gr-results' },
            matches.length === 0
              ? h('p', { className: 'gr-empty-line' }, t('gr.search.empty'))
              : matches.map((node) => h('button', {
                key: node.id,
                type: 'button',
                className: 'gr-result',
                'aria-pressed': selectedId === node.id ? 'true' : 'false',
                title: node.path ?? '',
                onClick: () => choose(node.id),
              },
                h('span', { className: 'gr-dot', style: { background: grCommunityColor(node.community) } }),
                h('span', { className: 'gr-result-label' }, node.label),
                h('span', { className: 'gr-result-kind' }, grKindLabel(node.kind, locale)))))
          : detailNode !== null
            ? h(GrInspector, {
              node: detailNode,
              groups: inspectorGroups,
              rationale: detail?.rationale ?? [],
              siblings: detail?.siblings ?? [],
              detailError,
              onBack: () => { setSelectedId(undefined); setFocus(null); },
              onSelect: choose,
              onOpen: openNode,
              onAsk: onAsk !== undefined ? () => onAsk(detailNode) : undefined,
              t,
              locale,
            })
            : h(GraphLegend, {
              communities,
              activeCommunity,
              onToggle: toggleCommunityHighlight,
              t,
              locale,
              scope: groupsScope,
            }))));
}

/* ---- legend: community list ------------------------------------------- */

/**
 * One row per community: colour dot, label, size. Clicking a row focuses the
 * whole community on the canvas (members stay opaque, the rest dim), fits the
 * camera to its region, and puts the same white selection ring on its most
 * connected member; clicking again clears everything.
 */
function GraphLegend(props) {
  const { communities, activeCommunity, onToggle, t, locale, scope = 'code' } = props;
  return h('section', { className: 'gr-rail-scroll', 'data-cs': 'graph-legend' },
    h('div', { className: 'gr-legend-head' },
      h('span', { className: 'gr-grow' }, t('gr.legend.title')),
      h('span', { className: 'gr-muted' }, formatInt(communities.length, locale))),
    communities.length === 0
      ? h('p', { className: 'gr-empty-line' }, t('gr.legend.empty'))
      : h('div', { className: 'gr-comm-list' },
        communities.map((community) => h('button', {
          key: community.id,
          type: 'button',
          className: 'gr-comm',
          'aria-pressed': activeCommunity === community.id ? 'true' : 'false',
          onClick: () => onToggle(community.id),
        },
          h('span', { className: 'gr-dot', style: { background: grCommunityColor(community.id) } }),
          h('span', { className: 'gr-comm-label' }, community.label),
          h('span', { className: 'gr-count' }, formatInt(community.size, locale))))),
    h('p', { className: 'gr-legend-hint' }, t(scope === 'notes' ? 'gr.legend.hintNotes' : 'gr.legend.hint')));
}

/* ---- inspector --------------------------------------------------------- */

/**
 * Selected node detail: kind pill, community tag, name, location/degree,
 * action buttons, rationale rows, relation groups and same-file siblings.
 */
function GrInspector(props) {
  const {
    node, groups, rationale, siblings, detailError,
    onBack, onSelect, onOpen, onAsk, t, locale,
  } = props;

  const location = node.path === undefined || node.path === ''
    ? ''
    : `${node.path}:${node.line ?? node.start_line ?? ''}`;
  const neighbourCount = Number(node.degree ?? node.memberCount ?? 0);
  const hasCalls = groups.some((group) => group.key === 'callers' || group.key === 'calls');

  return h('section', { className: 'gr-rail-scroll' },
    h('div', { className: 'gr-detail-back' },
      h('button', { type: 'button', className: 'gr-btn', onClick: onBack },
        '‹ ', t('gr.inspector.back'))),

    h('div', { className: 'gr-detail-head' },
      h('div', { className: 'gr-detail-row' },
        h('span', { className: 'gr-kind' }, grKindLabel(node.kind, locale)),
        node.communityLabel
          ? h('span', { className: 'gr-kind-note' }, node.communityLabel)
          : null,
        h('span', { className: 'gr-grow' })),
      h('h2', { className: 'gr-detail-title', title: node.label }, node.label),
      h('p', { className: 'gr-detail-meta gr-mono gr-ellipsis', title: location },
        location === '' ? (node.noteId !== undefined ? grKindLabel('note', locale) : t('common.none')) : location,
        ' · ',
        t('gr.inspector.neighbours', { count: formatInt(neighbourCount, locale) }))),

    node.signature
      ? h('p', { className: 'gr-detail-meta gr-mono gr-ellipsis', title: node.signature },
        t('gr.inspector.signature'), '：', node.signature)
      : null,

    h('div', { className: 'gr-detail-acts' },
      onAsk !== undefined
        ? h('button', { type: 'button', className: 'gr-btn', onClick: onAsk },
          t('gr.inspector.ask'))
        : null,
      (node.path !== undefined && node.path !== '') || node.noteId !== undefined
        ? h('button', { type: 'button', className: 'gr-btn gr-btn-primary', onClick: () => onOpen(node) },
          t(node.noteId !== undefined ? 'wb.ng.openNote' : 'gr.inspector.open'))
        : null),

    detailError !== undefined
      ? h('p', { className: 'gr-empty-line', role: 'alert' }, detailError)
      : null,

    rationale.map((row, index) => h('div', {
      key: `rationale-${index}`,
      className: 'gr-rationale',
    }, row.text)),

    groups.length === 0
      ? h('p', { className: 'gr-empty-line' }, t('gr.inspector.noRelations'))
      : groups.map((group, index) => h(GrRelationSection, {
        key: group.key,
        group,
        open: group.key === 'callers' || group.key === 'calls' || (!hasCalls && index === 0),
        onSelect,
        onOpen,
        t,
        locale,
      })),

    siblings.length > 0
      ? h('details', { className: 'gr-rel-group' },
        h('summary', null,
          h('span', { className: 'gr-grow' }, t('gr.inspector.siblings')),
          h('span', { className: 'gr-rel-count' }, formatInt(siblings.length, locale))),
        h('div', { className: 'gr-rel-list' },
          siblings.map((row) => h('button', {
            key: row.id,
            type: 'button',
            className: 'gr-rel-row',
            onClick: () => onSelect(row.id),
            onDoubleClick: () => onOpen(row),
          },
            h('span', { className: 'gr-rel-label' }, row.label),
            h('span', { className: 'gr-rel-kind' }, grKindLabel(row.kind, locale)),
            h('span', { className: 'gr-rel-loc' }, `:${row.line ?? 1}`)))))
      : null);
}

/** One collapsible relation group in the inspector rail. */
function GrRelationSection(props) {
  const { group, open, onSelect, onOpen, t, locale } = props;
  const shown = group.items.slice(0, GRAPH_MAX_ROWS);
  const labelKey = `gr.group.${group.key}`;
  const groupLabel = t(labelKey) === labelKey ? group.label : t(labelKey);

  return h('details', { className: 'gr-rel-group', open },
    h('summary', null,
      h('span', { className: 'gr-grow' }, groupLabel),
      h('span', { className: 'gr-rel-count' }, formatInt(group.items.length, locale))),
    h('div', { className: 'gr-rel-list' },
      shown.map((item) => {
        const rowTitle = [
          item.path,
          grRelationLabel(item.relation, locale),
          grConfidenceLabel(item.confidence, locale),
          item.line === undefined ? undefined : `L${item.line}`,
        ].filter((part) => part !== undefined && part !== '').join(' · ');
        return h('div', {
          key: `${item.id}:${item.relation}:${group.key}`,
          className: 'gr-rel-row',
          role: 'button',
          tabIndex: 0,
          title: rowTitle,
          onClick: () => onSelect(item.id),
          onDoubleClick: () => onOpen(item),
          onKeyDown: (event) => { if (event.key === 'Enter') onSelect(item.id); },
        },
          h('span', { className: 'gr-dir', 'data-dir': item.outgoing === true ? 'out' : 'in' },
            item.outgoing === true ? '→' : '←'),
          h('span', { className: 'gr-rel-label' }, item.label),
          h('span', { className: 'gr-rel-kind' }, grKindLabel(item.kind, locale)),
          item.path
            ? h('span', { className: 'gr-rel-loc gr-mono' }, `${item.path}:${item.line ?? 1}`)
            : null,
          item.path
            ? h('button', {
              type: 'button',
              className: 'gr-rel-open',
              title: t('gr.inspector.open'),
              'aria-label': `${t('gr.inspector.open')} ${item.label}`,
              onClick: (event) => { event.stopPropagation(); onOpen(item); },
            }, '↗')
            : null,
          h('span', { className: 'gr-rel-relation', style: { color: grCommunityColor(item.community) } },
            grRelationLabel(item.relation, locale)));
      }),
      group.items.length > shown.length
        ? h('p', { className: 'gr-group-more' },
          t('gr.rows.more', { count: formatInt(group.items.length - shown.length, locale) }))
        : null));
}

