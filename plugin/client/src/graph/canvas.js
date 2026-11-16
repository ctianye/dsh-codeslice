/**
 * Force-directed graph canvas for the CodeSlice graph view (Agent C, §2.2).
 *
 * Ported from the desktop reference `GraphCanvas.tsx`. The vis-network options
 * are mirrored verbatim in {@link GRAPH_CANVAS_PARAMS} so `dev/compare` can
 * diff them against the reference; the runtime here only expands that constant
 * into the Network options object.
 *
 * Three behaviours matter, same as the reference:
 * - Physics settles once, then switches off; settled coordinates are cached in
 *   memory and persisted through the `layout` API so a tab switch does not shake
 *   the graph again.
 * - Filters hide, never remove: rows stay in the DataSet with a `hidden` flag.
 * - Labels are earned by degree: high-degree anchors carry names at the
 *   overview zoom; the rest stay dots with a tooltip until the reader zooms in.
 *
 * vis-network is a lazy Host asset (`loadVis`); until it resolves the stage
 * shows a loading pill. All non-canvas UI lives in `view.js` as plain React DOM.
 */

import { useEffect, useMemo, useRef, useState } from '../icons.js';
import { loadVis } from '../assets.js';
import {
  grCommunityColor, grEdgeStyle, grIsStructuralRelation,
  GRAPH_UNDIRECTED, GRAPH_ARROWED,
} from './theme.js';
import {
  grRelationLabel, grKindLabel, grConfidenceLabel, grIsInferred,
} from './relations.js';

/**
 * Desktop canvas parameters, verbatim from `GraphCanvas.tsx`.
 *
 * `physics.forceAtlas2Based`, `physics.stabilization`, `layout`, `interaction`,
 * `nodes`, `edges` map 1:1 onto the vis `Options` object; the scalars below
 * back the settle watchdog, the label budget and the inferred-edge halving.
 */
export const GRAPH_CANVAS_PARAMS = {
  /** Zoom used when a search/locate request focuses one node. */
  focusScale: 0.7,
  /** A settle that keeps reporting progress is not stuck; only silence is. */
  settleIdleMs: 15_000,
  /** Hard ceiling so a runaway layout cannot spin forever. */
  settleHardMs: 120_000,
  labelFace: 'system-ui, "Microsoft YaHei UI", "Segoe UI", sans-serif',
  /** Label size in CSS pixels; labels keep it constant while zooming. */
  labelPx: 12,
  labelHaloDark: '#0a0f16',
  labelHaloLight: '#ffffff',
  /** Selection ring: white fill + community border, per the reference highlight. */
  selectionFill: '#ffffff',
  /** Fallback edge ink when no community colour applies. */
  fallbackEdge: '#8794a6',
  /** Viewport candidate margin when picking labelled nodes. */
  viewportMargin: 1.2,
  labelMaxChars: 42,
  seedRadius: 40,
  seedAngle: 2.4,
  /** Minimum id hit ratio to reuse a cached or persisted coordinate set. */
  seedRecallRatio: 0.8,
  positionCacheMax: 4,
  nodeSizeMin: 7,
  nodeSizeSpan: 17,
  nodeBorderWidth: 1.5,
  arrowScaleFactor: 0.45,
  inferredWidthFactor: 0.7,
  inferredOpacityFactor: 0.6,
  /** Label count at each zoom scale band (desktop `labelLimit`). */
  labelBudget: [
    { minScale: 0.7, limit: 22 },
    { minScale: 0.45, limit: 26 },
    { minScale: 0.28, limit: 24 },
    { minScale: 0.15, limit: 16 },
    { minScale: 0.08, limit: 10 },
    { minScale: 0, limit: 6 },
  ],
  physics: {
    solver: 'forceAtlas2Based',
    /** Tiny velocity threshold so the pass actually uses its iteration budget. */
    minVelocity: 0,
    forceAtlas2Based: {
      gravitationalConstant: -60,
      centralGravity: 0.005,
      springLength: 120,
      springConstant: 0.08,
      damping: 0.4,
      avoidOverlap: 0.8,
    },
    stabilization: {
      enabled: true,
      updateInterval: 25,
      fit: false,
      iterationsSmall: 140,
      iterationsLarge: 200,
      largeNodeThreshold: 1200,
    },
  },
  layout: { improvedLayout: false, randomSeed: 42 },
  interaction: {
    hover: true,
    tooltipDelay: 120,
    hideEdgesOnDrag: true,
    keyboard: false,
    multiselect: false,
  },
  nodes: { shape: 'dot', borderWidth: 1.5, chosen: { node: true, label: false } },
  edges: {
    smooth: { enabled: true, type: 'continuous', roundness: 0.15 },
    selectionWidth: 3,
  },
};

/** Stabilization passes before coordinates are frozen (desktop `stabilizationIterations`). */
export function grStabilizationIterations(nodeCount) {
  return nodeCount > GRAPH_CANVAS_PARAMS.physics.stabilization.largeNodeThreshold
    ? GRAPH_CANVAS_PARAMS.physics.stabilization.iterationsLarge
    : GRAPH_CANVAS_PARAMS.physics.stabilization.iterationsSmall;
}

/** How many node labels stay visible at the current viewport scale. */
export function grLabelLimit(scale) {
  for (const band of GRAPH_CANVAS_PARAMS.labelBudget) {
    if (scale >= band.minScale) return band.limit;
  }
  return GRAPH_CANVAS_PARAMS.labelBudget[GRAPH_CANVAS_PARAMS.labelBudget.length - 1].limit;
}

/** Settled positions per build, newest last. Reset by page reload. */
const grPositionCache = new Map();

function grRememberPositions(layoutKey, positions) {
  if (layoutKey === '') return;
  const map = new Map();
  for (const [id, point] of Object.entries(positions ?? {})) {
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) map.set(id, point);
  }
  grPositionCache.delete(layoutKey);
  grPositionCache.set(layoutKey, map);
  while (grPositionCache.size > GRAPH_CANVAS_PARAMS.positionCacheMax) {
    const oldest = grPositionCache.keys().next().value;
    if (oldest === undefined) break;
    grPositionCache.delete(oldest);
  }
}

function grRecallPositions(layoutKey, ids) {
  const cached = grPositionCache.get(layoutKey);
  if (cached === undefined) return undefined;
  const hits = ids.reduce((count, id) => count + (cached.has(id) ? 1 : 0), 0);
  return ids.length > 0 && hits / ids.length >= GRAPH_CANVAS_PARAMS.seedRecallRatio ? cached : undefined;
}

/** Label ink follows the host surface; vis needs a real colour. */
function grReadLabelInk(host) {
  try {
    const color = host && typeof getComputedStyle === 'function' ? getComputedStyle(host).color : '';
    if (typeof color === 'string' && color !== '' && color !== 'rgba(0, 0, 0, 0)') return color;
  } catch {
    // Detached node during teardown.
  }
  return '#e0e0e0';
}

function grClipLabel(label) {
  const text = String(label ?? '');
  return text.length > GRAPH_CANVAS_PARAMS.labelMaxChars
    ? text.slice(0, GRAPH_CANVAS_PARAMS.labelMaxChars - 1) + '…'
    : text;
}

/* ---- DataSet access that tolerates the harness stub ------------------ */

function grDsIds(ds) {
  if (typeof ds.getIds === 'function') return ds.getIds();
  return ds.rows ? [...ds.rows.keys()] : [];
}

function grDsRemove(ds, ids) {
  if (typeof ds.remove === 'function') { ds.remove(ids); return; }
  if (ds.rows) ids.forEach((id) => ds.rows.delete(id));
}

function grDsClear(ds) {
  if (typeof ds.clear === 'function') { ds.clear(); return; }
  if (ds.rows) ds.rows.clear();
}

function grDsAdd(ds, rows) {
  if (typeof ds.add === 'function') { ds.add(rows); return; }
  if (ds.rows) rows.forEach((row) => ds.rows.set(row.id, row));
}

function grDsGet(ds, id) {
  if (ds.rows && typeof ds.rows.get === 'function') return ds.rows.get(id);
  if (typeof ds.get === 'function') return ds.get(id);
  return undefined;
}

/**
 * Build the vis options object from the frozen parameter constant. Kept as a
 * pure function so the constant stays the single diffable source.
 */
function grVisOptions(usePhysics, iterationCount) {
  return {
    physics: {
      enabled: usePhysics,
      solver: GRAPH_CANVAS_PARAMS.physics.solver,
      minVelocity: GRAPH_CANVAS_PARAMS.physics.minVelocity,
      forceAtlas2Based: { ...GRAPH_CANVAS_PARAMS.physics.forceAtlas2Based },
      stabilization: {
        enabled: GRAPH_CANVAS_PARAMS.physics.stabilization.enabled,
        iterations: iterationCount,
        updateInterval: GRAPH_CANVAS_PARAMS.physics.stabilization.updateInterval,
        fit: GRAPH_CANVAS_PARAMS.physics.stabilization.fit,
      },
    },
    layout: { ...GRAPH_CANVAS_PARAMS.layout },
    interaction: { ...GRAPH_CANVAS_PARAMS.interaction },
    nodes: { ...GRAPH_CANVAS_PARAMS.nodes },
    edges: { ...GRAPH_CANVAS_PARAMS.edges },
  };
}

/**
 * Low-level stage factory: construct the DataSets and the Network on one mount
 * element, attach the event handlers, and return a destroyable handle. The React
 * component {@link GraphStage} owns the lifecycle; this is the seam the contract
 * exposes for tests and for a future non-React host.
 *
 * @param {object} options
 * @param {HTMLElement} options.mount - vis container element.
 * @param {object} options.vis - the loaded `vis` namespace.
 * @param {{nodes: object[], edges: object[]}} options.rows - initial rows.
 * @param {object} options.visOptions - expanded vis options.
 * @param {object} options.handlers - `{onSelect, onActivate}`.
 * @returns {{ network: object, datasets: object, destroy: () => void }}
 */
export function grCreateStage(options) {
  const { mount, vis, rows, visOptions, handlers } = options;
  const datasets = {
    nodes: new vis.DataSet(rows.nodes),
    edges: new vis.DataSet(rows.edges),
  };
  const network = new vis.Network(mount, datasets, visOptions);

  network.on('click', (event) => {
    const id = Array.isArray(event.nodes) && typeof event.nodes[0] === 'string' ? event.nodes[0] : null;
    handlers.onSelect(id);
  });
  network.on('doubleClick', (event) => {
    const id = Array.isArray(event.nodes) && typeof event.nodes[0] === 'string' ? event.nodes[0] : null;
    if (id !== null) handlers.onActivate(id);
  });

  return {
    network,
    datasets,
    destroy() {
      try { network.destroy(); } catch { /* already torn down */ }
    },
  };
}

/**
 * React stage: canvas wrapper, vis mount point, tools and the settle pill.
 *
 * @param {object} props
 * @param {object} props.ctx - client context.
 * @param {Array<object>} props.nodes - filtered/annotated node rows.
 * @param {Array<object>} props.edges - filtered/annotated edge rows.
 * @param {string|null} props.selectedId - selected node id.
 * @param {{id:string,nonce:number,ids?:string[],hubId?:string}|null} props.focus - one-shot camera focus.
 *   `ids` fits a community region; `hubId` is the member that receives the
 *   white selection ring while the rail stays on the community list.
 * @param {string} props.layoutKey - topology key for the coordinate cache.
 * @param {Record<string,{x:number,y:number}>} [props.initialPositions]
 *   coordinates restored from the `layout` API.
 * @param {number} [props.activeCommunity] - highlighted community id, if any.
 * @param {boolean} props.visible - `false` means parked-but-mounted.
 * @param {(id:string|null)=>void} props.onSelect
 * @param {(id:string)=>void} props.onActivate
 * @param {(positions:Record<string,{x:number,y:number}>)=>void} [props.onSettled]
 * @param {(network:object)=>void} [props.controllerRef] - imperative handle.
 * @param {(key:string)=>string} props.t
 * @param {string} props.locale
 */
export function GraphStage(props) {
  const {
    ctx, nodes, edges, selectedId, focus, layoutKey, initialPositions,
    activeCommunity, visible, onSelect, onActivate, onSettled, controllerRef, t, locale,
    fitPad, hintKey, nodeScale,
  } = props;

  const hostRef = useRef(null);
  const mountRef = useRef(null);
  const stageRef = useRef(undefined);
  const datasetsRef = useRef(undefined);
  const networkRef = useRef(undefined);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const activeCommunityRef = useRef(activeCommunity);
  activeCommunityRef.current = activeCommunity;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const handlersRef = useRef({ onSelect, onActivate });
  handlersRef.current = { onSelect, onActivate };

  const [vis, setVis] = useState(undefined);
  const [assetError, setAssetError] = useState(undefined);
  const [settling, setSettling] = useState(false);
  const [stageEpoch, setStageEpoch] = useState(0);
  const [labelInk, setLabelInk] = useState('#e0e0e0');

  const parked = visible === false;
  const maxDegree = useMemo(() => {
    let max = 1;
    for (const node of nodes) {
      const degree = Number(node.degree ?? 0);
      if (degree > max) max = degree;
    }
    return max;
  }, [nodes]);

  const persistedPositions = useMemo(
    () => new Map(Object.entries(initialPositions ?? {})),
    [initialPositions],
  );

  /* ---- load the renderer ------------------------------------------- */

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
  }, [ctx, parked]);

  /* ---- label ink follows the host theme ---------------------------- */

  useEffect(() => {
    if (parked) return undefined;
    const read = () => {
      if (hostRef.current !== null) setLabelInk(grReadLabelInk(hostRef.current));
    };
    read();
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => observer.disconnect();
  }, [parked]);

  /* ---- build the network once per topology ------------------------- */

  const seedPositions = useRef(undefined);
  const seedApplied = useRef(false);
  const fitted = useRef(false);
  const settleDone = useRef(false);
  const settleCompleted = useRef(false);
  const settleTimer = useRef(0);
  const settleDeadline = useRef(0);
  const stabilizeRequested = useRef(false);
  const stabilizePending = useRef(false);
  const appliedFocus = useRef(null);
  const labelFrame = useRef(0);

  const viewport = () => ({
    width: hostRef.current?.clientWidth ?? 1200,
    height: hostRef.current?.clientHeight ?? 800,
  });

  const resolveSeed = () => {
    const ids = nodesRef.current.map((node) => node.id);
    const cached = grRecallPositions(layoutKey, ids);
    if (cached !== undefined) return cached;
    const hits = ids.reduce((count, id) => count + (persistedPositions.has(id) ? 1 : 0), 0);
    return ids.length > 0 && hits / ids.length >= GRAPH_CANVAS_PARAMS.seedRecallRatio
      ? persistedPositions
      : undefined;
  };

  const fitIds = (network, ids, padX = 96, padY = 72, maxScale = 1.6) => {
    if (ids.length === 0) {
      if (typeof network.fit === 'function') network.fit({ animation: false });
      return;
    }
    // `network.fit` fits the node centres, not their labels or halos; at the
    // overview zoom that leaves the top/right labels clipped in a dense graph.
    // Compute the bounding box ourselves and reserve a real pixel margin, then
    // centre it with `moveTo`. This is deterministic and survives
    // `ResizeObserver` calls that arrive before vis has updated its viewport.
    const positions = typeof network.getPositions === 'function' ? network.getPositions(ids) : {};
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const point = positions[id];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    const box = viewport();
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || box.width <= 0 || box.height <= 0) {
      if (typeof network.fit === 'function') network.fit({ nodes: ids, animation: false });
      return;
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    // Labels are drawn at a constant screen size, so reserve screen pixels
    // rather than graph units. 96/72 leaves room for the longest file labels.
    const usableWidth = Math.max(120, box.width - padX);
    const usableHeight = Math.max(100, box.height - padY);
    const scale = Math.max(0.03, Math.min(maxScale, Math.min(usableWidth / spanX, usableHeight / spanY)));
    if (typeof network.moveTo === 'function') {
      network.moveTo({
        position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        scale,
        animation: false,
      });
    } else if (typeof network.fit === 'function') {
      network.fit({ nodes: ids, animation: false });
    }
  };

  const fitVisible = (network) => {
    // A sparse graph is magnified harder, so its node discs and labels need a
    // bigger screen margin than the dense project graph does.
    fitIds(
      network,
      nodesRef.current.filter((node) => !node.hidden).map((node) => node.id),
      fitPad?.x ?? 96,
      fitPad?.y ?? 72,
      fitPad?.maxScale ?? 1.6,
    );
  };

  const applyLabels = (network) => {
    const datasets = datasetsRef.current;
    if (datasets === undefined || network === undefined) return;
    const scale = Math.max(typeof network.getScale === 'function' ? network.getScale() : 1, 0.01);
    const limit = grLabelLimit(scale);
    const view = typeof network.getViewPosition === 'function' ? network.getViewPosition() : { x: 0, y: 0 };
    const positions = typeof network.getPositions === 'function' ? network.getPositions() : {};
    const box = viewport();
    const halfWidth = (box.width / scale / 2) * GRAPH_CANVAS_PARAMS.viewportMargin;
    const halfHeight = (box.height / scale / 2) * GRAPH_CANVAS_PARAMS.viewportMargin;

    const candidates = nodesRef.current.filter((node) => {
      if (node.hidden) return false;
      const position = positions[node.id];
      return Boolean(position)
        && Math.abs(position.x - view.x) <= halfWidth
        && Math.abs(position.y - view.y) <= halfHeight;
    });
    candidates.sort((a, b) => Number(b.degree ?? 0) - Number(a.degree ?? 0));
    const labelled = new Set(candidates.slice(0, limit).map((node) => node.id));
    if (selectedRef.current !== null && selectedRef.current !== undefined) labelled.add(selectedRef.current);

    const fontPx = Math.round((GRAPH_CANVAS_PARAMS.labelPx / scale) * 10) / 10;
    const halo = Math.round((1.1 / scale) * 10) / 10;
    datasets.nodes.update(nodesRef.current.map((node) => {
      const visible = !node.hidden && labelled.has(node.id);
      return {
        id: node.id,
        font: {
          size: visible ? fontPx : 0,
          color: labelInk,
          face: GRAPH_CANVAS_PARAMS.labelFace,
          strokeWidth: visible ? halo : 0,
          strokeColor: GRAPH_CANVAS_PARAMS.labelHaloDark,
        },
      };
    }));
  };

  useEffect(() => {
    if (parked || vis === undefined || mountRef.current === null) return undefined;

    seedPositions.current = resolveSeed();
    seedApplied.current = false;
    const usePhysics = seedPositions.current === undefined;
    const iterationCount = grStabilizationIterations(nodesRef.current.length);
    const stage = grCreateStage({
      mount: mountRef.current,
      vis,
      rows: { nodes: [], edges: [] },
      visOptions: grVisOptions(usePhysics, iterationCount),
      handlers: {
        onSelect: (id) => handlersRef.current.onSelect(id),
        onActivate: (id) => handlersRef.current.onActivate(id),
      },
    });
    stageRef.current = stage;
    datasetsRef.current = stage.datasets;
    networkRef.current = stage.network;
    settleDone.current = false;
    settleCompleted.current = false;
    stabilizeRequested.current = false;
    stabilizePending.current = usePhysics;
    appliedFocus.current = null;
    fitted.current = false;
    setSettling(usePhysics);
    // The stage can be created *after* the payload arrived (e.g. the view was
    // parked while another tab was active). Bump an epoch so the data effect
    // runs against the fresh datasets instead of leaving them empty.
    setStageEpoch((value) => value + 1);

    // vis only follows `window` resizes; this stage may change size when the
    // sidebar opens, the composer grows, or the container query flips from a
    // row to a stack. Keep the canvas bitmap in step with the mount box.
    let resizeObserver;
    let resizeFrame = 0;
    if (typeof window.ResizeObserver === 'function' && mountRef.current !== null) {
      resizeObserver = new window.ResizeObserver(() => {
        const width = mountRef.current?.clientWidth ?? 0;
        const height = mountRef.current?.clientHeight ?? 0;
        if (width > 0 && height > 0 && typeof networkRef.current?.setSize === 'function') {
          networkRef.current.setSize(`${width}px`, `${height}px`);
          if (typeof networkRef.current.redraw === 'function') networkRef.current.redraw();
          // vis keeps the old viewport centre after `setSize`, so a stage that
          // grows from 617 to 949 px leaves the graph parked in the left half.
          // Refit on the settled size; a short frame debounce avoids fighting
          // the rail-drawer animation.
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0;
            if (networkRef.current !== undefined) fitVisible(networkRef.current);
          });
        }
      });
      resizeObserver.observe(mountRef.current);
    }

    const armSettleTimer = (delay) => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => settle(), delay);
    };
    const settle = () => {
      if (settleDone.current) return;
      settleDone.current = true;
      stabilizePending.current = false;
      if (settleTimer.current) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = 0;
      }
      const network = networkRef.current;
      if (network !== undefined && typeof network.setOptions === 'function') {
        network.setOptions({ physics: { enabled: false } });
      }
      const positions = typeof network?.getPositions === 'function' ? network.getPositions() : {};
      if (settleCompleted.current) {
        grRememberPositions(layoutKey, positions);
        settledRef.current?.(positions);
      }
      setSettling(false);
      if (network !== undefined) fitVisible(network);
      const wanted = focusRef.current;
      if (wanted && grDsGet(datasetsRef.current?.nodes, wanted.id)) {
        if (typeof network?.focus === 'function') {
          network.focus(wanted.id, { scale: GRAPH_CANVAS_PARAMS.focusScale, animation: false, locked: false });
        }
        appliedFocus.current = wanted;
        if (network !== undefined) applyLabels(network);
      }
    };
    settleDeadline.current = Date.now() + GRAPH_CANVAS_PARAMS.settleHardMs;
    if (usePhysics) armSettleTimer(GRAPH_CANVAS_PARAMS.settleIdleMs);

    const noteProgress = (info) => {
      if (settleDone.current) return;
      if (info?.total && (info.iterations ?? 0) >= info.total) settleCompleted.current = true;
      const remaining = settleDeadline.current - Date.now();
      if (remaining <= 0) { settle(); return; }
      armSettleTimer(Math.min(GRAPH_CANVAS_PARAMS.settleIdleMs, remaining));
    };

    const completeSettle = () => {
      if (!stabilizeRequested.current) return;
      settleCompleted.current = true;
      settle();
    };

    const network = stage.network;
    network.once('stabilizationIterationsDone', completeSettle);
    network.on('stabilizationProgress', noteProgress);
    network.on('dragEnd', () => {
      const positions = typeof network.getPositions === 'function' ? network.getPositions() : {};
      grRememberPositions(layoutKey, positions);
      settledRef.current?.(positions);
    });
    network.on('zoom', () => {
      if (labelFrame.current) return;
      labelFrame.current = window.requestAnimationFrame(() => {
        labelFrame.current = 0;
        if (networkRef.current !== undefined) applyLabels(networkRef.current);
      });
    });

    if (controllerRef !== undefined) {
      controllerRef.current = {
        fit() { if (networkRef.current !== undefined) fitVisible(networkRef.current); },
        zoomBy(factor) {
          const n = networkRef.current;
          if (n === undefined || typeof n.moveTo !== 'function') return;
          const scale = Math.max(0.03, Math.min(4, n.getScale() * factor));
          n.moveTo({ scale, animation: false });
        },
        centre(id) {
          const n = networkRef.current;
          if (n === undefined) return;
          const point = typeof n.getPositions === 'function' ? n.getPositions([id])[id] : undefined;
          if (point !== undefined && typeof n.moveTo === 'function') {
            n.moveTo({ position: point, scale: n.getScale(), animation: false });
          }
        },
        focusNode(id) {
          const n = networkRef.current;
          if (n === undefined || typeof n.focus !== 'function') return;
          n.focus(id, { scale: GRAPH_CANVAS_PARAMS.focusScale, animation: false, locked: false });
        },
      };
    }

    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      if (resizeObserver !== undefined) resizeObserver.disconnect();
      if (labelFrame.current) window.cancelAnimationFrame(labelFrame.current);
      labelFrame.current = 0;
      if (settleTimer.current) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = 0;
      }
      settleDone.current = true;
      stabilizeRequested.current = false;
      stage.destroy();
      if (controllerRef !== undefined) controllerRef.current = undefined;
      stageRef.current = undefined;
      datasetsRef.current = undefined;
      networkRef.current = undefined;
    };
    // Rebuilt only for a different topology or renderer; data/filter/selection
    // changes update the datasets in place so the camera is never reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis, parked, layoutKey]);

  /* ---- push rows into the datasets in place ------------------------ */

  useEffect(() => {
    const datasets = datasetsRef.current;
    const network = networkRef.current;
    if (datasets === undefined || network === undefined) return;

    const ids = new Set(nodes.map((node) => node.id));
    const staleIds = grDsIds(datasets.nodes).filter((id) => !ids.has(String(id)));
    if (staleIds.length > 0) grDsRemove(datasets.nodes, staleIds);

    const positions = !seedApplied.current && seedPositions.current
      ? seedPositions.current
      : new Map(Object.entries(typeof network.getPositions === 'function' ? network.getPositions() : {}));
    seedApplied.current = true;

    datasets.nodes.update(nodes.map((node, index) => {
      const degree = Number(node.degree ?? 0);
      const color = grCommunityColor(node.community);
      const title = document.createElement('div');
      title.textContent = [
        node.label,
        grKindLabel(node.kind, locale),
        node.path ? `${node.path}:${node.line ?? ''}` : '',
        node.communityLabel ? `社区：${node.communityLabel}` : '',
        `连接：${node.memberCount ?? degree}`,
      ].filter(Boolean).join('\n');
      const position = positions.get(node.id);
      return {
        id: node.id,
        label: grClipLabel(node.label),
        title,
        hidden: node.hidden,
        shape: 'dot',
        // A sparse graph is magnified harder by the fit, so its discs must start
        // smaller to end up looking like the dense project graph's dots.
        size: (GRAPH_CANVAS_PARAMS.nodeSizeMin
          + GRAPH_CANVAS_PARAMS.nodeSizeSpan * Math.sqrt(degree / maxDegree)
          // A note is the anchor of its own sub-graph; the topics hang off it.
          + (node.kind === 'note' ? 4 : 0)) * (nodeScale ?? 1),
        color: {
          background: color,
          border: color,
          highlight: { background: GRAPH_CANVAS_PARAMS.selectionFill, border: color },
          hover: { background: GRAPH_CANVAS_PARAMS.selectionFill, border: color },
        },
        font: { size: 0, color: labelInk, face: GRAPH_CANVAS_PARAMS.labelFace },
        ...(position ?? {
          x: GRAPH_CANVAS_PARAMS.seedRadius * Math.sqrt(index) * Math.cos(index * GRAPH_CANVAS_PARAMS.seedAngle),
          y: GRAPH_CANVAS_PARAMS.seedRadius * Math.sqrt(index) * Math.sin(index * GRAPH_CANVAS_PARAMS.seedAngle),
        }),
      };
    }));

    const byId = new Map(nodes.map((node) => [node.id, node]));
    grDsClear(datasets.edges);
    grDsAdd(datasets.edges, edges.map((edge, index) => {
      const inferred = grIsInferred(edge.relation, edge.confidence);
      const style = grEdgeStyle(edge.relation);
      const source = byId.get(edge.source);
      const ink = grIsStructuralRelation(edge.relation) || source === undefined
        ? GRAPH_CANVAS_PARAMS.fallbackEdge
        : grCommunityColor(source.community);
      const title = document.createElement('div');
      title.textContent = grRelationLabel(edge.relation, locale)
        + ' · ' + grConfidenceLabel(edge.confidence, locale)
        + (edge.line ? ` · L${edge.line}` : '');
      return {
        id: edge.id ?? `e${index}`,
        from: edge.source,
        to: edge.target,
        hidden: edge.hidden,
        title,
        dashes: inferred,
        width: inferred ? style.width * GRAPH_CANVAS_PARAMS.inferredWidthFactor : style.width,
        color: { color: ink, opacity: inferred ? style.opacity * GRAPH_CANVAS_PARAMS.inferredOpacityFactor : style.opacity },
        arrows: {
          to: {
            enabled: !GRAPH_UNDIRECTED.has(edge.relation) && GRAPH_ARROWED.has(edge.relation),
            scaleFactor: GRAPH_CANVAS_PARAMS.arrowScaleFactor,
          },
        },
      };
    }));

    if (!fitted.current && nodes.some((node) => !node.hidden)) {
      fitVisible(network);
      fitted.current = true;
    }
    if (stabilizePending.current && nodes.length > 0) {
      stabilizePending.current = false;
      stabilizeRequested.current = true;
      settleDeadline.current = Date.now() + GRAPH_CANVAS_PARAMS.settleHardMs;
      const iterations = grStabilizationIterations(nodes.length);
      window.setTimeout(() => {
        if (!settleDone.current && typeof networkRef.current?.stabilize === 'function') {
          networkRef.current.stabilize(iterations);
        }
      }, 0);
    }
    applyLabels(network);
  }, [nodes, edges, maxDegree, labelInk, locale, stageEpoch]);

  /* ---- selection / community highlight dimming ---------------------- */

  useEffect(() => {
    const network = networkRef.current;
    if (network === undefined) return;
    const active = selectedRef.current && grDsGet(datasetsRef.current?.nodes, selectedRef.current)
      ? selectedRef.current
      : null;
    const community = activeCommunityRef.current;
    const punch = community !== undefined && focusRef.current?.hubId
      && grDsGet(datasetsRef.current?.nodes, focusRef.current.hubId)
      ? focusRef.current.hubId
      : null;
    if (typeof network.selectNodes === 'function') {
      network.selectNodes(active ? [active] : (punch ? [punch] : []), false);
    }

    const connected = new Set();
    if (active !== null) {
      connected.add(active);
      if (typeof network.getConnectedNodes === 'function') {
        for (const id of network.getConnectedNodes(active)) connected.add(String(id));
      }
    }
    const members = community === undefined
      ? null
      : new Set(nodesRef.current
        .filter((node) => !node.hidden && Number(node.community ?? 0) === community)
        .map((node) => node.id));
    datasetsRef.current?.nodes.update(nodesRef.current.map((node) => ({
      id: node.id,
      opacity: (!active && community === undefined) || node.hidden || connected.has(node.id)
        || (members !== null && members.has(node.id))
        ? 1
        : 0.28,
    })));
    datasetsRef.current?.edges.update((datasetsRef.current.edges.get() ?? []).map((edge) => {
      const base = typeof edge.color === 'object' && edge.color
        ? Number(edge.color.opacity ?? 0.6)
        : 0.6;
      // A node selection keeps only incident edges; a community selection keeps
      // only edges whose two ends are in the community. The old community path
      // left every edge at full opacity, so the dimmed nodes still sat in a
      // brightly coloured web and the focus read as "slightly grey", not focused.
      const inCommunity = members !== null && members.has(edge.from) && members.has(edge.to);
      const opacity = active !== null
        ? edge.from === active || edge.to === active ? Math.max(base, 0.75) : 0.08
        : community !== undefined
          ? inCommunity ? Math.max(base, 0.7) : 0.06
          : undefined;
      return {
        id: edge.id,
        color: {
          ...(typeof edge.color === 'object' ? edge.color : {}),
          opacity,
        },
      };
    }));
    if (networkRef.current !== undefined) applyLabels(networkRef.current);
  }, [selectedId, activeCommunity, nodes, edges]);

  /* ---- one-shot camera focus --------------------------------------- */

  useEffect(() => {
    const network = networkRef.current;
    if (!focus) { appliedFocus.current = null; return; }
    const requestedIds = Array.isArray(focus.ids) ? focus.ids : [focus.id];
    const ids = requestedIds.filter((id) => grDsGet(datasetsRef.current?.nodes, id) !== undefined);
    if (ids.length === 0) return;
    if (appliedFocus.current === focus) return;
    if (network !== undefined) {
      if (Array.isArray(focus.ids) && typeof network.getPositions === 'function') {
        // A community is a region, not one node: fit its members with a smaller
        // margin than the whole graph, then keep the hub ring from the selection
        // effect. `focusScale` is for a single node; using it here would crop
        // most of a large community.
        fitIds(network, ids, 40, 32, 1.25);
      } else if (typeof network.focus === 'function') {
        network.focus(focus.id, { scale: GRAPH_CANVAS_PARAMS.focusScale, animation: false, locked: false });
      }
    }
    appliedFocus.current = focus;
    if (network !== undefined) {
      applyLabels(network);
      window.requestAnimationFrame(() => {
        if (networkRef.current !== undefined) applyLabels(networkRef.current);
      });
    }
  }, [focus, nodes]);

  const empty = nodes.length === 0;
  const visibleCount = nodes.reduce((count, node) => count + (node.hidden ? 0 : 1), 0);

  return h('div', { className: 'gr-stage', 'data-cs': 'graph-canvas' },
    h('div', { className: 'gr-stage-host', ref: hostRef },
      h('div', { ref: mountRef, style: { position: 'absolute', inset: '0' } })),

    assetError !== undefined
      ? h('div', { className: 'gr-stage-empty' },
        h('b', null, t('gr.canvas.error')),
        h('span', null, assetError))
      : null,

    empty && !parked
      ? h('div', { className: 'gr-stage-empty' },
        h('b', null, t('gr.canvas.emptyTitle')),
        h('span', null, t('gr.canvas.emptyBody')))
      : null,

    !empty && visibleCount === 0
      ? h('div', { className: 'gr-stage-empty' }, t('gr.canvas.emptyFiltered'))
      : null,

    settling
      ? h('div', { className: 'gr-stage-pill' },
        h('span', { className: 'gr-spin' }),
        h('span', null, t('gr.canvas.laying')))
      : null,

    h('div', { className: 'gr-stage-tools', role: 'group', 'aria-label': t(hintKey ?? 'gr.canvas.hint') },
      h('button', {
        type: 'button', className: 'gr-iconbtn', title: t('gr.tool.fit'), 'aria-label': t('gr.tool.fit'),
        onClick: () => controllerRef?.current?.fit(),
      }, '⤢'),
      h('button', {
        type: 'button', className: 'gr-iconbtn', title: t('gr.tool.zoomIn'), 'aria-label': t('gr.tool.zoomIn'),
        onClick: () => controllerRef?.current?.zoomBy(1.25),
      }, '+'),
      h('button', {
        type: 'button', className: 'gr-iconbtn', title: t('gr.tool.zoomOut'), 'aria-label': t('gr.tool.zoomOut'),
        onClick: () => controllerRef?.current?.zoomBy(0.8),
      }, '−')),

    h('div', { className: 'gr-stage-hint' }, t(hintKey ?? 'gr.canvas.hint')));
}
