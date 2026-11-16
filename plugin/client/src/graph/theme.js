/**
 * Canvas vocabulary for the CodeSlice graph view (Agent C, §2.2).
 *
 * Ported verbatim from the desktop reference
 * `D:\CodeSplit\frontend\src\components\graph\graphTheme.ts`:
 * the Tableau-10 classification palette and the per-family edge weight/alpha
 * table. Community identity is a colour identity: the canvas dot, the legend
 * swatch and the inspector tag must read the same fill, so the palette lives
 * here once and every other module reads it back.
 *
 * Data colours (the palette) are the one exception to the host semantic-token
 * rule; everything else in the rail is styled through `var(--dsw-alias-*)`.
 */

/**
 * Tableau 10, in the reference's order. Hue identity is the community's
 * identity: it must not drift between the canvas, the rail swatches and the
 * neighbour links.
 */
export const GRAPH_PALETTE = [
  '#4E79A7', // blue
  '#F28E2B', // orange
  '#E15759', // red
  '#76B7B2', // teal
  '#59A14F', // green
  '#EDC948', // yellow
  '#B07AA1', // purple
  '#FF9DA7', // pink
  '#9C755F', // brown
  '#BAB0AC', // grey
];

/** Edge weight and alpha for one relation family (desktop `EdgeInk`). */
const grCALL_EDGE = { width: 1.5, opacity: 0.58 };
const grDEPENDENCY_EDGE = { width: 0.8, opacity: 0.3 };
const grHIERARCHY_EDGE = { width: 0.9, opacity: 0.38 };
const grSTRUCTURE_EDGE = { width: 0.5, opacity: 0.12 };
const grMEANING_EDGE = { width: 0.5, opacity: 0.12 };
const grDEFAULT_EDGE = { width: 0.8, opacity: 0.28 };

/**
 * Weight and alpha for one edge; inferred edges are halved again by the
 * canvas (see `GRAPH_CANVAS_PARAMS.inferredWidthFactor / inferredOpacityFactor`).
 *
 * @param {string} relation - the wire relation kind.
 * @returns {{ width: number, opacity: number }}
 */
export function grEdgeStyle(relation) {
  switch (relation) {
    case 'calls':
    case 'indirect_call':
    case 'references':
      return grCALL_EDGE;
    case 'imports':
    case 'imports_from':
    case 'uses':
      return grDEPENDENCY_EDGE;
    case 'inherits':
    case 'implements':
      return grHIERARCHY_EDGE;
    case 'contains':
    case 'method':
    case 'declares':
      return grSTRUCTURE_EDGE;
    case 'rationale_for':
      return grMEANING_EDGE;
    default:
      return grDEFAULT_EDGE;
  }
}

/** Structural scaffolding gets neutral ink so call edges keep their colour signal. */
export function grIsStructuralRelation(relation) {
  return relation === 'contains'
    || relation === 'method'
    || relation === 'declares'
    || relation === 'rationale_for';
}

/**
 * Relation family, used to pick an edge colour and the family switch bar.
 * Grouped rather than one colour per relation: five families stay
 * distinguishable where a dozen per-kind palettes do not.
 *
 * @param {string} relation - the wire relation kind.
 * @returns {'structure'|'dependency'|'behaviour'|'hierarchy'|'meaning'|'other'}
 */
export function grRelationFamily(relation) {
  switch (relation) {
    case 'contains':
    case 'method':
    case 'declares':
    case 'mentions':
    case 'co_occurs':
    case 'shares_topic':
    case 'same_folder':
    case 'shared_reference':
      return 'structure';
    case 'imports':
    case 'imports_from':
    case 'uses':
      return 'dependency';
    case 'calls':
    case 'indirect_call':
    case 'references':
      return 'behaviour';
    case 'inherits':
    case 'implements':
      return 'hierarchy';
    case 'rationale_for':
    case 'similar':
      return 'meaning';
    default:
      return 'other';
  }
}

/** Fill for one community, tolerant of negative or huge ids. */
export function grCommunityColor(community) {
  const colors = GRAPH_PALETTE;
  const index = (((Number(community) || 0) % colors.length) + colors.length) % colors.length;
  return colors[index];
}

/** Relations with no direction; an arrowhead would imply a call that does not exist. */
export const GRAPH_UNDIRECTED = new Set([
  'same_folder', 'same_project', 'shared_reference', 'mentions', 'co_occurs', 'similar',
]);

/** Relations that draw a `to` arrowhead. */
export const GRAPH_ARROWED = new Set([
  'calls', 'indirect_call', 'imports', 'imports_from', 'inherits', 'implements',
]);
