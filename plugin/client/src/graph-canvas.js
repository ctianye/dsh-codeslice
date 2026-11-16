import { useState, useEffect, useRef, useMemo } from './icons.js';
import { loadVis } from './assets.js';
import {
  FAMILIES, canvasCountLabel, clipLabel, communityColor, confidenceLabel,
  familyLabel, kindLabel, relationLabel,
} from './graph-tables.js';
import { Glyph } from './icons.js';

/**
 * The graph canvas, drawn by the renderer graphify itself ships.
 *
 * The previous SVG scene was a hand-reproduction: it could match the desktop's
 * *rules* (node radius, ink, label budgets) but not its feel, because the desktop
 * hands the picture to vis-network and lets physics settle it. This component
 * does the same. The options below are graphify's `graph.html` verbatim
 * (`graphify/exporters/html.py:225-268`): forceAtlas2Based at −60/0.005/120/
 * 0.08/0.4/0.8, 200 stabilization passes, dot nodes sized by degree, continuous
 * rounded edges with arrows, and physics switched off once the pass reports
 * completion.
 *
 * What is deliberately *not* copied from graphify: its sidebar. The rail here is
 * the desktop's (search, inspector, community checklist), and the community
 * names it lists come from the Host's desktop-rule labels (`api.ts +44`,
 * `未分类`). The canvas and the rail therefore describe the same communities.
 *
 * Degradation is explicit: vis-network is a lazy Host asset. Until it loads the
 * panel shows a loading pill; if the asset cannot be fetched it shows an error
 * with retry, rather than a blank rectangle.
 */

/** vis-network's default edge grey, at graphify's two confidence alphas. */
const GC_EDGE_INK = '#848484';

/** Graphify paints the selected/hovered node with a white core. */
const GC_HIGHLIGHT_FILL = '#ffffff';

const GC_LABEL_FACE = 'system-ui, "Microsoft YaHei UI", "Segoe UI", sans-serif';

/** Stop waiting for a stabilization pass that has gone silent. */
const GC_SETTLE_TIMEOUT_MS = 25_000;

/** Settled coordinates, keyed by topology; a tab switch must not shake the graph. */
const GC_POSITIONS = new Map();
const GC_POSITIONS_MAX = 4;

/** The topology fingerprint: node and edge ids, nothing cosmetic. */
function gcTopologyKey(nodes, links) {
  let hash = 2166136261;
  const mix = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const node of nodes) {
    mix(String(node.id));
    mix('\u0000');
  }
  for (const link of links) {
    mix(String(link.source));
    mix('\u0001');
    mix(String(link.target));
    mix('\u0002');
  }
  return `${nodes.length}:${links.length}:${hash >>> 0}`;
}

function gcRememberPositions(key, network) {
  if (key === '') return;
  const positions = network.getPositions();
  const map = new Map();
  for (const [id, point] of Object.entries(positions)) {
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) map.set(id, point);
  }
  GC_POSITIONS.delete(key);
  GC_POSITIONS.set(key, map);
  while (GC_POSITIONS.size > GC_POSITIONS_MAX) {
    const oldest = GC_POSITIONS.keys().next().value;
    if (oldest === undefined) break;
    GC_POSITIONS.delete(oldest);
  }
}

function gcRecallPositions(key, ids) {
  const cached = GC_POSITIONS.get(key);
  if (cached === undefined) return undefined;
  const hits = ids.reduce((count, id) => count + (cached.has(id) ? 1 : 0), 0);
  return ids.length > 0 && hits / ids.length >= 0.8 ? cached : undefined;
}

/** Legend swatch ink: family identity in the same weight as the canvas edges. */
function gcFamilySwatch(family) {
  return {
    behaviour: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, transparent)',
    dependency: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 46%, transparent)',
    structure: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 46%, transparent)',
    hierarchy: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 74%, transparent)',
    meaning: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 74%, transparent)',
    other: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 34%, transparent)',
  }[family] ?? 'color-mix(in srgb, var(--dsw-alias-label-secondary) 34%, transparent)';
}

/**
 * The label ink is whatever the host's surface uses; vis needs a real colour.
 */
function gcLabelColor(host) {
  try {
    const color = getComputedStyle(host).color;
    if (typeof color === 'string' && color !== '' && color !== 'rgba(0, 0, 0, 0)') return color;
  } catch {
    // Detached node during teardown.
  }
  return '#e0e0e0';
}

/** Cross-file community labels are already short; clip the pathological ones. */
function gcNodeLabel(node) {
  return clipLabel(node.label);
}

/**
 * Compute which nodes and links the filters hide.
 *
 * Filters set `hidden` on the DataSet rather than deleting rows: vis keeps the
 * coordinates of a hidden node, so re-enabling a family cannot restart the
 * layout (the same invariant the SVG canvas had).
 */
function gcFilterModel(nodes, links, families, hiddenCommunities) {
  const familySet = families ?? new Set();
  const hiddenSet = hiddenCommunities ?? new Set();
  const nodeHidden = new Map();
  for (const node of nodes) {
    let hidden = hiddenSet.has(Number(node.community ?? 0));
    if (!hidden && node.kind === 'rationale') hidden = !familySet.has('meaning');
    if (!hidden && node.kind === 'external') hidden = !familySet.has('dependency');
    nodeHidden.set(node.id, hidden);
  }
  const linkHidden = new Map();
  for (const link of links) {
    const hidden = !familySet.has(link.family)
      || nodeHidden.get(link.source) === true
      || nodeHidden.get(link.target) === true;
    linkHidden.set(link.id, hidden);
  }
  return { nodeHidden, linkHidden };
}

/**
 * @param props - the panel's canvas contract:
 *   `{ctx, nodes, links, selectedId, onSelect, onOpen, families,
 *   onToggleFamily, hiddenCommunities, truncation, loading, error, onRetry,
 *   visible, t, locale, controller, aggregated}`.
 * @returns the canvas, its tools, the count caption and the family legend.
 */
export function GraphCanvas(props) {
  const {
    ctx, nodes, links, selectedId, onSelect, onOpen,
    families, onToggleFamily, hiddenCommunities,
    truncation, loading, error, onRetry, visible, t, locale, controller, aggregated,
  } = props;

  const hostRef = useRef(null);
  const mountRef = useRef(null);
  const networkRef = useRef(null);
  const setsRef = useRef(undefined);
  const settleTimer = useRef(0);

  const [vis, setVis] = useState(undefined);
  const [assetError, setAssetError] = useState(undefined);
  const [assetNonce, setAssetNonce] = useState(0);
  const [settling, setSettling] = useState(false);
  const [labelColor, setLabelColor] = useState('#e0e0e0');

  const parked = visible === false;
  const maxDegree = useMemo(() => {
    let max = 1;
    for (const node of nodes) {
      const degree = Number(node.degree ?? 0);
      if (degree > max) max = degree;
    }
    return max;
  }, [nodes]);
  const topologyKey = useMemo(() => gcTopologyKey(nodes, links), [nodes, links]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const filterModel = useMemo(
    () => gcFilterModel(nodes, links, families, hiddenCommunities),
    [nodes, links, families, hiddenCommunities],
  );
  const visibleCount = useMemo(() => {
    let count = 0;
    for (const node of nodes) if (filterModel.nodeHidden.get(node.id) !== true) count += 1;
    return count;
  }, [nodes, filterModel]);

  /* ---- label ink follows the host theme -------------------------- */

  useEffect(() => {
    if (parked) return undefined;
    const read = () => {
      const host = hostRef.current;
      if (host !== null && host !== undefined) setLabelColor(gcLabelColor(host));
    };
    read();
    const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(read);
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    if (document.body) observer?.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
    media?.addEventListener?.('change', read);
    return () => {
      observer?.disconnect();
      media?.removeEventListener?.('change', read);
    };
  }, [parked]);

  /* ---- load the renderer ----------------------------------------- */

  useEffect(() => {
    if (parked) return undefined;
    let cancelled = false;
    setAssetError(undefined);
    loadVis(ctx).then((namespace) => {
      if (!cancelled) setVis(namespace);
    }).catch((caught) => {
      if (!cancelled) setAssetError(caught && caught.message ? caught.message : String(caught));
    });
    return () => { cancelled = true; };
  }, [ctx, parked, assetNonce]);

  /* ---- build / rebuild the network ------------------------------- */

  useEffect(() => {
    if (parked || vis === undefined || mountRef.current === null) return undefined;

    const cachedPositions = gcRecallPositions(topologyKey, nodes.map((node) => node.id));
    const nodeRows = nodes.map((node, index) => {
      const degree = Number(node.degree ?? 0);
      const color = communityColor(node.community ?? 0);
      const seed = { x: 30 * Math.sqrt(index) * Math.cos(index * 2.4), y: 30 * Math.sqrt(index) * Math.sin(index * 2.4) };
      const position = cachedPositions?.get(node.id) ?? seed;
      return {
        id: node.id,
        label: gcNodeLabel(node),
        title: `${node.label}\n${kindLabel(node.kind, locale)}${node.path ? `\n${node.path}${node.line ? `:${node.line}` : ''}` : ''}${node.communityLabel ? `\n${t('graph.tooltip.community', { label: node.communityLabel })}` : ''}\n${t('graph.tooltip.connections', { degree: node.memberCount ?? node.degree ?? 0 })}`,
        hidden: filterModel.nodeHidden.get(node.id) === true,
        shape: 'dot',
        size: 10 + 30 * (degree / maxDegree),
        color: {
          background: color,
          border: color,
          highlight: { background: GC_HIGHLIGHT_FILL, border: color },
          hover: { background: GC_HIGHLIGHT_FILL, border: color },
        },
        // Graphify shows names only on hubs at the overview (15% of the max
        // degree); the rest stay dots with a tooltip. Community meta-nodes are
        // all hubs by construction, so they always carry their name.
        font: {
          size: node.aggregated === true || degree >= maxDegree * 0.15 ? 12 : 0,
          color: labelColor,
          face: GC_LABEL_FACE,
        },
        x: position.x,
        y: position.y,
      };
    });

    const edgeRows = links.map((link, index) => {
      const extracted = link.confidence === 'EXTRACTED';
      return {
        id: link.id ?? `e${index}`,
        from: link.source,
        to: link.target,
        hidden: filterModel.linkHidden.get(link.id) === true,
        label: '',
        title: `${relationLabel(link.relation, locale)} · ${confidenceLabel(link.confidence, locale)}${link.line ? ` · L${link.line}` : ''}${link.count ? ` · ${link.count}` : ''}`,
        dashes: !extracted,
        width: extracted ? 2 : 1,
        color: { color: GC_EDGE_INK, opacity: extracted ? 0.7 : 0.35 },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      };
    });

    const data = {
      nodes: new vis.DataSet(nodeRows),
      edges: new vis.DataSet(edgeRows),
    };
    setsRef.current = data;

    const options = {
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -60,
          centralGravity: 0.005,
          springLength: 120,
          springConstant: 0.08,
          damping: 0.4,
          avoidOverlap: 0.8,
        },
        stabilization: { iterations: 200, fit: true },
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        hideEdgesOnDrag: true,
        navigationButtons: false,
        keyboard: false,
      },
      nodes: { shape: 'dot', borderWidth: 1.5 },
      edges: { smooth: { type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
    };

    const network = new vis.Network(mountRef.current, data, options);
    networkRef.current = network;
    setSettling(true);

    const fitVisible = () => {
      const ids = nodes.filter((node) => filterModel.nodeHidden.get(node.id) !== true).map((node) => node.id);
      network.fit(ids.length > 0 ? { nodes: ids, animation: false } : { animation: false });
    };

    const settle = () => {
      if (networkRef.current !== network) return;
      if (settleTimer.current !== 0) {
        clearTimeout(settleTimer.current);
        settleTimer.current = 0;
      }
      network.setOptions({ physics: { enabled: false } });
      setSettling(false);
      gcRememberPositions(topologyKey, network);
      fitVisible();
    };

    network.once('stabilizationIterationsDone', settle);
    settleTimer.current = setTimeout(settle, GC_SETTLE_TIMEOUT_MS);

    // A cached topology opens settled: physics off, camera on the picture. This
    // is the desktop's position cache, and it is why switching tabs does not
    // shake a graph the reader already oriented themselves in.
    if (gcRecallPositions(topologyKey, nodes.map((node) => node.id)) !== undefined) {      network.setOptions({ physics: { enabled: false } });
      setSettling(false);
      if (settleTimer.current !== 0) {
        clearTimeout(settleTimer.current);
        settleTimer.current = 0;
      }
      fitVisible();
    }

    network.on('click', (params) => {
      if (Array.isArray(params.nodes) && params.nodes.length > 0) onSelect?.(params.nodes[0]);
      else onSelect?.(undefined);
    });
    network.on('doubleClick', (params) => {
      const id = Array.isArray(params.nodes) ? params.nodes[0] : undefined;
      if (id !== undefined) onOpen?.(nodesById.get(id));
    });
    network.on('hoverNode', () => {
      if (mountRef.current !== null) mountRef.current.style.cursor = 'pointer';
    });
    network.on('blurNode', () => {
      if (mountRef.current !== null) mountRef.current.style.cursor = 'default';
    });
    network.on('dragEnd', () => gcRememberPositions(topologyKey, network));

    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => network.redraw());
    if (observer !== undefined && mountRef.current !== null) observer.observe(mountRef.current);

    return () => {
      observer?.disconnect();
      if (settleTimer.current !== 0) {
        clearTimeout(settleTimer.current);
        settleTimer.current = 0;
      }
      gcRememberPositions(topologyKey, network);
      network.destroy();
      networkRef.current = null;
      setsRef.current = undefined;
      setSettling(false);
    };
    // Rebuilt only when the topology or the renderer changes; filters, theme and
    // selection update the datasets in place so the camera never resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis, parked, topologyKey, nodesById, t, locale]);

  /* ---- update rows in place -------------------------------------- */

  useEffect(() => {
    const sets = setsRef.current;
    const network = networkRef.current;
    if (sets === undefined || network === null) return;

    sets.nodes.update(nodes.map((node) => {
      const degree = Number(node.degree ?? 0);
      const color = communityColor(node.community ?? 0);
      return {
        id: node.id,
        label: gcNodeLabel(node),
        hidden: filterModel.nodeHidden.get(node.id) === true,
        size: 10 + 30 * (degree / maxDegree),
        color: {
          background: color,
          border: color,
          highlight: { background: GC_HIGHLIGHT_FILL, border: color },
          hover: { background: GC_HIGHLIGHT_FILL, border: color },
        },
        font: {
          size: node.aggregated === true || degree >= maxDegree * 0.15 ? 12 : 0,
          color: labelColor,
          face: GC_LABEL_FACE,
        },
      };
    }));
    sets.edges.update(links.map((link, index) => {
      const extracted = link.confidence === 'EXTRACTED';
      return {
        id: link.id ?? `e${index}`,
        hidden: filterModel.linkHidden.get(link.id) === true,
        dashes: !extracted,
        width: extracted ? 2 : 1,
        color: { color: GC_EDGE_INK, opacity: extracted ? 0.7 : 0.35 },
      };
    }));
  }, [nodes, links, filterModel, maxDegree, labelColor]);

  /* ---- selection -------------------------------------------------- */

  useEffect(() => {
    const network = networkRef.current;
    if (network === null) return;
    network.selectNodes(selectedId === undefined || selectedId === null ? [] : [selectedId]);
  }, [selectedId, vis, topologyKey]);

  /* ---- imperative controls --------------------------------------- */

  useEffect(() => {
    if (controller === undefined || controller === null) return;
    controller.current = {
      zoomBy(factor) {
        const network = networkRef.current;
        if (network === null) return;
        const scale = Math.max(0.03, Math.min(4, network.getScale() * factor));
        network.moveTo({ scale, animation: false });
      },
      fit() {
        const network = networkRef.current;
        if (network === null) return;
        const ids = nodes.filter((node) => filterModel.nodeHidden.get(node.id) !== true).map((node) => node.id);
        network.fit(ids.length > 0 ? { nodes: ids, animation: false } : { animation: false });
      },
      centre(id) {
        const network = networkRef.current;
        if (network === null) return;
        const point = network.getPositions([id])[id];
        if (point === undefined) return;
        network.moveTo({ position: point, scale: network.getScale(), animation: false });
      },
    };
  }, [controller, nodes, filterModel]);

  /* ---- render ----------------------------------------------------- */

  const empty = nodes.length === 0 && loading !== true && (error === undefined || error === null);
  const shown = truncation !== undefined && truncation !== null ? Number(truncation.shown ?? nodes.length) : nodes.length;
  const total = truncation !== undefined && truncation !== null ? Number(truncation.total ?? shown) : shown;
  const capped = total > shown;

  return h('div', { className: 'cs-graph-stage' },
    h('div', { className: 'cs-canvas', ref: hostRef, 'data-settling': settling ? 'true' : undefined },
    h('div', { ref: mountRef, style: { position: 'absolute', inset: '0' } }),

    loading === true ? h('div', { className: 'cs-canvas-empty' },
      h('span', { className: 'cs-row' },
        h('span', { className: 'cs-spin' }, Glyph.spinner(12)),
        h('span', null, t('graph.loading')))) : null,

    loading !== true && assetError !== undefined ? h('div', { className: 'cs-canvas-empty' },
      h('div', { className: 'cs-col', style: { gap: '6px', alignItems: 'center' } },
        h('b', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('graph.error.title')),
        h('span', null, assetError),
        h('button', {
          type: 'button',
          className: 'cs-btn',
          onClick: () => {
            setVis(undefined);
            setAssetError(undefined);
            setAssetNonce((current) => current + 1);
          },
        }, t('common.retry')))) : null,

    loading !== true && assetError === undefined && error !== undefined && error !== null ? h('div', { className: 'cs-canvas-empty' },
      h('div', { className: 'cs-col', style: { gap: '6px', alignItems: 'center' } },
        h('b', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('graph.error.title')),
        h('span', null, error.message),
        h('button', { type: 'button', className: 'cs-btn', onClick: () => onRetry?.() }, t('common.retry')))) : null,

    empty ? h('div', { className: 'cs-canvas-empty' },
      h('div', { className: 'cs-col', style: { gap: '4px', alignItems: 'center' } },
        h('b', null, t('graph.empty.title')),
        h('span', null, t('graph.empty.body')))) : null,

    empty !== true && loading !== true && assetError === undefined && (error === undefined || error === null) && visibleCount === 0
      ? h('div', { className: 'cs-canvas-empty' }, t('graph.empty.filtered'))
      : null,

    settling ? h('div', { className: 'cs-canvas-pill' },
      h('span', { className: 'cs-spin' }, Glyph.spinner(11)),
      h('span', null, t('graph.laying'))) : null,

    capped || aggregated === true ? h('div', {
      className: 'cs-canvas-cap',
      title: aggregated === true
        ? t('graph.status.aggregatedTitle', { communities: shown, total })
        : t('graph.status.truncated', { shown, total }),
    }, aggregated === true
      ? t('graph.status.aggregated', { communities: shown, total })
      : canvasCountLabel(shown, total, locale)) : null,

    h('div', { className: 'cs-canvas-tools' },
      h('button', {
        type: 'button', className: 'cs-iconbtn', title: t('graph.zoom.in'), 'aria-label': t('graph.zoom.in'),
        onClick: () => controller?.current?.zoomBy(1.1),
      }, Glyph.plus(14)),
      h('button', {
        type: 'button', className: 'cs-iconbtn', title: t('graph.zoom.out'), 'aria-label': t('graph.zoom.out'),
        onClick: () => controller?.current?.zoomBy(1 / 1.1),
      }, Glyph.minus(14)),
      h('button', {
        type: 'button', className: 'cs-iconbtn', title: t('graph.action.fit'), 'aria-label': t('graph.action.fit'),
        onClick: () => controller?.current?.fit(),
      }, Glyph.fit(14))),

    h('div', { className: 'cs-canvas-hint' }, t('graph.canvas.hint'))),

  h('div', { className: 'cs-legend' },
    h('span', { className: 'cs-legend-label' }, t('graph.legend.title')),
    FAMILIES.map((family) => h('button', {
      key: family,
      type: 'button',
      className: 'cs-chip',
      'aria-pressed': families?.has(family) === true ? 'true' : 'false',
      title: familyLabel(family, locale),
      onClick: () => onToggleFamily?.(family),
    },
    h('span', {
      className: 'cs-swatch',
      style: { background: gcFamilySwatch(family), opacity: family === 'behaviour' ? '0.9' : '0.45' },
    }),
    h('span', null, familyLabel(family, locale))))));
}
