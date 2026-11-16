/**
 * Canvas constants and pure predicates, transcribed from the desktop app.
 *
 * This module exists because the drawing vocabulary had drifted into two places:
 * `graph-tables.js` owned the edge weights while `graph-canvas.js` owned the
 * radius, the label budget, the arrow set and the dimming numbers. Every one of
 * those is a verbatim table in the reference tree, so they are collected here —
 * pure values and pure functions, no state, no React, no DOM — and both the
 * table module and the canvas read them from one place (spec §12 invariant 7:
 * the vocabulary is single-sourced).
 *
 * Nothing here imports anything. That is deliberate: the bundle is one factory
 * scope and this module must be emittable before any consumer, which is also why
 * every top-level name carries an `align` / `ALIGN` prefix (no collision with
 * `graph-tables.js`, `graph-canvas.js` or any other module in the bundle).
 *
 * Colour discipline: this file contains **no colour literals**. Any ink the
 * canvas needs is a `var(--dsw-alias-*)` token or a `color-mix` of one, taken
 * from `graph-tables.js`; a variant (a dimmer rim, a lighter core) is mixed here
 * at the call site rather than frozen into a hex value.
 */

/* ------------------------------------------------------------------ *
 * Edge ink — `graphTheme.ts:45-80`, `GraphCanvas.tsx:462-464`        *
 * ------------------------------------------------------------------ */

/**
 * Weight and alpha per relation, verbatim from `graphTheme.ts:50-55` and the
 * `edgeStyle()` switch at `:58-80`.
 *
 * Read it as loudness: a call is the evidence a reader came for, a containment
 * edge is scaffolding. The desktop draws both at one weight in the old canvas,
 * which is what turned a dense module into rope (`graphTheme.ts:40-44`).
 *
 * `default` is the fallback row for a relation this build has never heard of —
 * the desktop's `default: DEFAULT_EDGE` arm (`graphTheme.ts:77-78`), with the
 * same 0.8 / 0.28 weights (`graphTheme.ts:55`).
 */
export const ALIGN_EDGE_INK = {
  /* `CALL_EDGE` — `graphTheme.ts:50`, used by `:60-63`. */
  calls: { width: 1.5, opacity: 0.58 },
  indirect_call: { width: 1.5, opacity: 0.58 },
  references: { width: 1.5, opacity: 0.58 },
  /* `DEPENDENCY_EDGE` — `graphTheme.ts:51`, used by `:64-67`. */
  imports: { width: 0.8, opacity: 0.3 },
  imports_from: { width: 0.8, opacity: 0.3 },
  uses: { width: 0.8, opacity: 0.3 },
  /* `HIERARCHY_EDGE` — `graphTheme.ts:52`, used by `:68-70`. */
  inherits: { width: 0.9, opacity: 0.38 },
  implements: { width: 0.9, opacity: 0.38 },
  /* `STRUCTURE_EDGE` — `graphTheme.ts:53`, used by `:71-74`. */
  contains: { width: 0.5, opacity: 0.12 },
  method: { width: 0.5, opacity: 0.12 },
  declares: { width: 0.5, opacity: 0.12 },
  /* `MEANING_EDGE` — `graphTheme.ts:54`, used by `:75-76`. */
  rationale_for: { width: 0.5, opacity: 0.12 },
  /* `DEFAULT_EDGE` — `graphTheme.ts:55`, the `default` arm of the switch. */
  default: { width: 0.8, opacity: 0.28 },
};

/** The fallback row, named so callers need not know the `default` key. */
export const ALIGN_DEFAULT_EDGE_INK = ALIGN_EDGE_INK.default;

/**
 * Inferred-width/opacity factors, verbatim `GraphCanvas.tsx:463-464`:
 * `width * 0.7`, `opacity * 0.6` (not a flat halving — see the note in
 * `graph-tables.js`: halving puts an inferred call edge at dependency ink).
 */
export const ALIGN_INFERRED_WIDTH = 0.7;
export const ALIGN_INFERRED_OPACITY = 0.6;

/**
 * Resolve one edge's ink.
 *
 * Corresponds to `GraphCanvas.tsx:450-464`:
 *
 *   const style = edgeStyle(edge.relation)
 *   width:   inferred ? style.width * 0.7   : style.width
 *   color:   { opacity: inferred ? style.opacity * 0.6 : style.opacity }
 *
 * `inferred` is passed in rather than derived, because the decision is a
 * *confidence* question and stays single-sourced in
 * `graphMeta.ts:81-85` / `graph-tables.js#isInferred`.
 *
 * @param relation - the wire relation name.
 * @param options - `{inferred}`; anything else is ignored.
 * @returns `{width, opacity, inferred}` — the same shape `edgeInk()` returns, so
 *   the two can be swapped without touching a caller.
 */
export function alignEdgeInk(relation, options) {
  const row = ALIGN_EDGE_INK[String(relation)] ?? ALIGN_EDGE_INK.default;
  const inferred = options !== undefined && options !== null && options.inferred === true;
  return {
    width: inferred ? row.width * ALIGN_INFERRED_WIDTH : row.width,
    opacity: inferred ? row.opacity * ALIGN_INFERRED_OPACITY : row.opacity,
    inferred,
  };
}

/**
 * Structural scaffolding takes neutral ink instead of the source community's
 * colour — verbatim `graphTheme.ts:82-85`:
 * `contains | method | declares | rationale_for`.
 *
 * Note this is *not* the same set as `STRUCTURAL_RELATIONS` in `graphMeta.ts`
 * (which also lists imports/inherits/uses and answers a confidence question).
 * The desktop keeps both, and so does this port; conflating them makes imports
 * lose their community colour.
 *
 * @param relation - the wire relation name.
 * @returns whether the edge should be drawn in neutral ink.
 */
export function alignIsStructural(relation) {
  return relation === 'contains' || relation === 'method'
    || relation === 'declares' || relation === 'rationale_for';
}

/* ------------------------------------------------------------------ *
 * Arrows — `GraphCanvas.tsx:65-67`, `:465-470`                       *
 * ------------------------------------------------------------------ */

/**
 * Relations that get an arrowhead.
 *
 * The desktop's set is `{calls, indirect_call, imports, imports_from, inherits,
 * implements}` (`GraphCanvas.tsx:67`). `references` and `uses` are added here:
 * both are directed, and the desktop draws them headless only because they fall
 * in neither of its two sets (`spec §2.9`, §11.4 flags it as a hole). Drawing
 * the arrow is the point of porting direction, so the hole is closed rather than
 * reproduced.
 */
const ALIGN_ARROWED = new Set([
  'calls', 'indirect_call', 'imports', 'imports_from', 'inherits', 'implements', 'references', 'uses',
]);

/**
 * Relations with no direction, verbatim `UNDIRECTED` (`GraphCanvas.tsx:66`).
 * An arrowhead here would claim a call that does not exist.
 */
const ALIGN_UNDIRECTED = new Set(['same_folder', 'same_project', 'shared_reference']);

/**
 * @param relation - the wire relation name.
 * @returns whether to draw an arrowhead at the target.
 */
export function alignArrowed(relation) {
  return ALIGN_ARROWED.has(relation) && !ALIGN_UNDIRECTED.has(relation);
}

/**
 * @param relation - the wire relation name.
 * @returns whether the relation is direction-free (`GraphCanvas.tsx:66`).
 */
export function alignUndirected(relation) {
  return ALIGN_UNDIRECTED.has(relation);
}

/* ------------------------------------------------------------------ *
 * Node geometry — `GraphCanvas.tsx:409`, `:433`                      *
 * ------------------------------------------------------------------ */

/** Radius floor, verbatim `GraphCanvas.tsx:409` (7 px at degree 0). */
export const ALIGN_NODE_RADIUS_MIN = 7;

/** Extra radius at the maximum degree, verbatim `GraphCanvas.tsx:409` (7 + 17). */
export const ALIGN_NODE_RADIUS_SPAN = 17;

/**
 * Node radius from degree — verbatim `GraphCanvas.tsx:409`:
 *
 *   size: 7 + 17 * Math.sqrt(node.degree / maxDegree)
 *
 * with `maxDegree = Math.max(1, ...nodes.map(n => n.degree))` (`:409`). The
 * square root, not a linear ramp, is what keeps a 3-degree utility visible next
 * to a 200-degree hub instead of collapsing it to a pixel.
 *
 * @param degree - the node's incident edge count.
 * @param maxDegree - the largest degree in the slice; clamped to at least 1.
 * @returns the radius in graph units (7 … 24).
 */
export function alignNodeRadius(degree, maxDegree) {
  const ceiling = Math.max(1, Number(maxDegree) || 1);
  const value = Math.max(0, Number(degree) || 0);
  return ALIGN_NODE_RADIUS_MIN + ALIGN_NODE_RADIUS_SPAN * Math.sqrt(value / ceiling);
}

/* ------------------------------------------------------------------ *
 * Labels — `GraphCanvas.tsx:76-83`, `:113-153`                       *
 * ------------------------------------------------------------------ */

/**
 * How many labels survive at a zoom level — verbatim `labelLimit`
 * (`GraphCanvas.tsx:76-83`).
 *
 * The non-monotonic shape (26 at 0.45, 24 at 0.28) is not a mistake: the
 * overview band holds more nodes on screen, so it gets fewer labels per node but
 * a similar total, which keeps the two zoom ranges looking equally dense.
 *
 * @param scale - the current zoom.
 * @returns the label budget for that band.
 */
export function alignLabelBudget(scale) {
  const value = Number(scale) || 0;
  if (value >= 0.7) return 22;
  if (value >= 0.45) return 26;
  if (value >= 0.28) return 24;
  if (value >= 0.15) return 16;
  if (value >= 0.08) return 10;
  return 6;
}

/** The 1.2 view margin that lets a label near the edge still appear (`:125-126`). */
export const ALIGN_LABEL_VIEW_MARGIN = 1.2;

/**
 * Choose which nodes get a name at the current zoom — the SVG port of
 * `applyLabels()` (`GraphCanvas.tsx:113-153`).
 *
 * The desktop's steps, kept in order:
 *
 *   1. `scale = max(getScale(), 0.01)` — `:121`;
 *   2. the visible box in graph coordinates is
 *      `halfW = (viewportW / scale / 2) * 1.2`, same for height — `:125-127`;
 *   3. candidates are the non-hidden nodes inside that box — `:127-133`;
 *   4. sort by `degree` descending and take `limit` — `:134-135`;
 *   5. **the selected node is always added**, even when it did not make the cut
 *      — `:136`, invariant 4: a selection the reader cannot name is useless.
 *
 * One difference from the desktop: ties break on `id` so two equal-degree nodes
 * cannot swap places between renders. vis keeps insertion order, which is also
 * stable, but the SVG scene rebuilds its list per render and needs the tiebreak
 * to stay still.
 *
 * @param nodes - the slice's nodes; `{id, degree}` are read. `hidden: true` is
 *   skipped, so a caller may pass the unfiltered list.
 * @param positions - `Map<id, {x, y}>` in graph coordinates.
 * @param view - the camera centre in graph coordinates, i.e. what vis calls
 *   `network.getViewPosition()`.
 * @param scale - the current zoom.
 * @param viewport - `{width, height}` in CSS pixels.
 * @param limit - the label budget; `alignLabelBudget(scale)` is the usual value.
 * @param selectedId - optional; forced into the result when it has a position.
 * @returns a `Set` of node ids to label.
 */
export function alignPickLabels(nodes, positions, view, scale, viewport, limit, selectedId) {
  const safeScale = Math.max(Number(scale) || 0, 0.01);
  const width = Math.max(0, Number(viewport?.width ?? 0) || 0);
  const height = Math.max(0, Number(viewport?.height ?? 0) || 0);
  const halfWidth = (width / safeScale / 2) * ALIGN_LABEL_VIEW_MARGIN;
  const halfHeight = (height / safeScale / 2) * ALIGN_LABEL_VIEW_MARGIN;
  const centreX = Number(view?.x ?? 0) || 0;
  const centreY = Number(view?.y ?? 0) || 0;
  const budget = Math.max(0, Math.trunc(Number(limit) || 0));

  const picked = new Set();
  if (positions === undefined || positions === null) return picked;

  const candidates = [];
  for (const node of nodes ?? []) {
    if (node === undefined || node === null) continue;
    if (node.hidden === true) continue;
    const point = positions.get(node.id);
    if (point === undefined) continue;
    if (Math.abs(point.x - centreX) > halfWidth) continue;
    if (Math.abs(point.y - centreY) > halfHeight) continue;
    candidates.push(node);
  }

  candidates.sort((a, b) => (
    (Number(b.degree) || 0) - (Number(a.degree) || 0)
    || String(a.id).localeCompare(String(b.id))
  ));

  for (const node of candidates.slice(0, budget)) picked.add(node.id);

  if (selectedId !== undefined && selectedId !== null && typeof positions.has === 'function'
    && positions.has(selectedId)) {
    picked.add(selectedId);
  }
  return picked;
}

/* ------------------------------------------------------------------ *
 * Dimming — `GraphCanvas.tsx:501-524`, plus the hover variant        *
 * ------------------------------------------------------------------ */

/**
 * The two dim tables.
 *
 * `select` is verbatim `GraphCanvas.tsx:508-521`:
 *
 *   nodes: opacity = (!active || node.hidden || connected) ? 1 : 0.42
 *   edges: opacity = !active ? base
 *          : (edge.from === active || edge.to === active) ? Math.max(base, 0.75)
 *          : 0.08
 *
 * `hover` is the port's addition: the desktop has no hover dimming at all
 * (`spec §2.3`), but this build asked for it, so the numbers are derived from the
 * same scale instead of being invented — three quarters of the way to full ink
 * for the faded nodes (`0.72`, the value the canvas already used), and incident
 * edges lifted only to `0.6` because a hover is a lighter claim than a click.
 */
const ALIGN_DIM = {
  select: { node: 0.42, edge: 0.08, incidentEdgeMin: 0.75, hoverNode: 0.72 },
  hover: { node: 0.72, edge: 0.24, incidentEdgeMin: 0.6, hoverNode: 0.72 },
};

/**
 * The dim table for one focus kind.
 *
 * The returned object is shared and must not be mutated; `kind` is `'hover'` for
 * the lighter table and anything else (conventionally `'select'`) for the
 * desktop's selection table.
 *
 * @param kind - `'select'` or `'hover'`.
 * @returns `{node, edge, incidentEdgeMin, hoverNode}`.
 */
export function alignDimOpacity(kind) {
  return kind === 'hover' ? ALIGN_DIM.hover : ALIGN_DIM.select;
}

/**
 * Combine two dim candidates the way the canvas stacks them: the darker wins.
 *
 * The desktop only ever has one focus (the selection), so this rule only matters
 * in the port, where hover and selection can name two different nodes. Taking
 * the minimum is the only defensible composition: an element is dimmed if
 * *either* focus says it should be, so hovering elsewhere while something is
 * selected cannot brighten the graph.
 *
 * @param values - candidate opacities, already clamped to 0…1.
 * @returns the darkest one, or `1` when nothing was passed.
 */
export function alignDarker(values) {
  let result = 1;
  for (const value of values ?? []) {
    const number = Number(value);
    if (Number.isFinite(number) && number < result) result = number;
  }
  return result;
}

/**
 * Ink for a selected node's ring.
 *
 * The desktop paints the selected node with a *white* core
 * (`highlight.background = selectionFill`) and keeps the community colour as the
 * border (`GraphCanvas.tsx:436-439`, `graphTheme.ts:96`, §2.5: "white core,
 * coloured rim"). A plugin may not ship that literal — the gate scans the source
 * for colour values, and a frozen white would also be wrong on a light theme —
 * so the core is re-derived from the same `communityColor` the node already uses:
 * the host's base surface with a trace of the community colour mixed in, and the
 * rim is the colour itself.
 *
 * @param communityInk - a CSS colour, normally `communityColor(community)`.
 * @returns `{fill, stroke}` for the selection ring and the node body.
 */
export function alignSelectionRing(communityInk) {
  const ink = String(communityInk);
  return {
    fill: `color-mix(in srgb, ${ink} 10%, var(--dsw-alias-bg-base))`,
    stroke: ink,
  };
}

/**
 * The neutral ink for structural edges (`graphTheme.ts:107`: `fallbackEdge`).
 * A token rather than a frozen value, so the rim follows the host theme.
 */
export const ALIGN_STRUCTURAL_INK = 'var(--dsw-alias-label-secondary)';
