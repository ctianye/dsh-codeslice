/**
 * Pure visibility projection for the graph canvas (Agent C, §2.2).
 *
 * Ported from the desktop reference `graphFilter.ts`. The canvas keeps every
 * node and edge in its DataSet with a `hidden` flag, so toggling a filter never
 * reassigns positions or restarts the layout. Re-adding a filtered node would
 * otherwise drop it at a new random position and shove the whole layout around
 * on every chip click.
 */

import { grRelationFamily } from './theme.js';

/** Every family the filter semantics know about, in display order. */
export const GRAPH_FAMILY_LIST = [
  'behaviour', 'dependency', 'structure', 'hierarchy', 'meaning', 'other',
];

/**
 * Families the switch bar renders (desktop `FAMILY_CHIPS`, verbatim order).
 * `hierarchy` and `other` still participate in filtering but have no chip.
 */
export const GRAPH_CHIP_FAMILIES = ['behaviour', 'dependency', 'structure', 'meaning'];

/**
 * Everything except `meaning`: rationale nodes are commentary, and showing
 * hundreds of them by default turns the call graph into a wall of prose dots.
 * (Desktop `DEFAULT_FAMILIES`, verbatim.)
 */
export const GRAPH_DEFAULT_FAMILIES = ['behaviour', 'dependency', 'structure', 'other'];

/**
 * @returns {{ families: Set<string>, hiddenCommunities: Set<number> }}
 *   the default filter state.
 */
export function grDefaultFilters() {
  return {
    families: new Set(GRAPH_DEFAULT_FAMILIES),
    hiddenCommunities: new Set(),
  };
}

/** Annotation nodes inherit visibility from the relation family they belong to. */
function grNodeHidden(node, filters) {
  if (filters.hiddenCommunities.has(Number(node.community ?? 0))) return true;
  if (node.kind === 'rationale') return !filters.families.has('meaning');
  if (node.kind === 'external') return !filters.families.has('dependency');
  return false;
}

/**
 * Project a payload onto visible/hidden rows.
 *
 * @param {{ nodes?: object[], edges?: object[], links?: object[] }} payload
 *   raw graph slice (`links` accepted as the legacy edge key).
 * @param {{ families: Set<string>, hiddenCommunities: Set<number> }} filters
 * @returns {{ nodes: object[], edges: object[] }} rows annotated with `hidden`.
 */
export function grFilterGraph(payload, filters) {
  const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload?.edges)
    ? payload.edges
    : (Array.isArray(payload?.links) ? payload.links : []);

  const hiddenById = new Map();
  const nodes = rawNodes.map((node) => {
    const hidden = grNodeHidden(node, filters);
    hiddenById.set(node.id, hidden);
    return { ...node, hidden };
  });

  const edges = rawEdges.map((edge) => ({
    ...edge,
    hidden: Boolean(
      hiddenById.get(edge.source)
      || hiddenById.get(edge.target)
      || !filters.families.has(String(edge.family ?? grRelationFamily(edge.relation))),
    ),
  }));

  return { nodes, edges };
}

/** Count visible rows after a filter projection. */
export function grVisibleCount(rows) {
  return rows.reduce((count, row) => count + (row.hidden ? 0 : 1), 0);
}
