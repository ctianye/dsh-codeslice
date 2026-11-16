import {
  ALIGN_DEFAULT_EDGE_INK, ALIGN_EDGE_INK, ALIGN_INFERRED_OPACITY, ALIGN_INFERRED_WIDTH,
  ALIGN_NODE_RADIUS_MIN, ALIGN_NODE_RADIUS_SPAN, ALIGN_STRUCTURAL_INK,
  alignArrowed, alignEdgeInk, alignIsStructural, alignLabelBudget, alignNodeRadius,
} from './graph-align.js';

/**
 * Every piece of graph vocabulary the canvas, the legend and the inspector read.
 *
 * Single-sourced on purpose (spec §12 invariant 7): a relation that renders
 * "调用" in the inspector must not read "calls" in a tooltip, and an inferred
 * edge must look inferred in the canvas, the legend and the row alike. That is
 * why labels live here as bilingual objects rather than as i18n keys — the
 * tables from `spec/frontend-interaction.md` §3 are the authority, and splitting
 * them across a dictionary would let one surface drift.
 *
 * The *drawing* tables — edge weight/alpha, radius, label budget, arrows, dim
 * strength — live in `graph-align.js` and are re-exported from here. They moved
 * because `graph-canvas.js` needs them and this module already imports nothing
 * but `graph-align.js`; keeping a second copy here is exactly the drift that
 * invariant 7 forbids. Everything below that is not a re-export is either a
 * label table or a confidence predicate.
 *
 * Colours are the one thing NOT transcribed verbatim from the desktop's CSS:
 * the graph is painted by vis-network on a canvas, which cannot parse a CSS
 * custom property or `color-mix()`. The palette below is therefore graphify's
 * own Tableau-10 hexadecimal array — the same values the desktop ships — so the
 * canvas, the rail swatches and the neighbour links cannot drift.
 */

/* ------------------------------------------------------------------ *
 * Relations                                                          *
 * ------------------------------------------------------------------ */

/**
 * Relation → bilingual label, verbatim from `graphMeta.ts:12-29`.
 *
 * All sixteen relations are present, including the three this build never emits
 * (`references`, `implements`, `declares`): they are in the desktop's vocabulary
 * and can arrive from a future scanner (`DESIGN §4.2`), so including them costs a
 * row and prevents an untranslated `implements` from reaching a tooltip. The
 * order also matches `graphMeta.ts` so the two tables diff cleanly.
 */
export const RELATION_LABEL = {
  same_folder: { zh: '同一笔记目录', en: 'Same note folder' },
  same_project: { zh: '同项目未分类', en: 'Same project, unfiled' },
  shared_reference: { zh: '共同引用文件', en: 'Shares a code reference' },
  community_member: { zh: '社区成员（布局索引）', en: 'Community member (layout index)' },
  contains: { zh: '包含', en: 'Contains' },
  imports: { zh: '导入模块', en: 'Imports module' },
  imports_from: { zh: '导入符号', en: 'Imports symbol' },
  calls: { zh: '调用', en: 'Calls' },
  indirect_call: { zh: '回调引用', en: 'Callback reference' },
  references: { zh: '引用', en: 'References' },
  inherits: { zh: '继承', en: 'Inherits' },
  implements: { zh: '实现', en: 'Implements' },
  method: { zh: '方法', en: 'Method' },
  declares: { zh: '声明', en: 'Declares' },
  rationale_for: { zh: '说明', en: 'Explains' },
  uses: { zh: '依赖', en: 'Uses' },
  community: { zh: '跨社区关联', en: 'Cross-community link' },
};

/**
 * Node kind → bilingual label, verbatim from `graphMeta.ts:32-41`.
 *
 * The eight kinds are the desktop's full set. `module` and `note` have no
 * producer in this build (`lib/model.js:32-34` keeps `module` for parity), which
 * is why they are carried rather than dropped: a kind the scanner cannot emit
 * today is still a kind the label table must be able to name.
 */
export const KIND_LABEL = {
  community: { zh: '社区', en: 'Community' },
  note: { zh: '笔记', en: 'Note' },
  file: { zh: '文件', en: 'File' },
  class: { zh: '类', en: 'Class' },
  function: { zh: '函数', en: 'Function' },
  module: { zh: '模块', en: 'Module' },
  rationale: { zh: '说明', en: 'Rationale' },
  external: { zh: '外部', en: 'External' },
};

/**
 * Confidence → bilingual label, verbatim from `graphMeta.ts:43-47` plus
 * `UNRESOLVED`.
 *
 * The desktop's `CONFIDENCE_LABEL` names only the three states its model uses.
 * `UNRESOLVED` exists in this build's model (`lib/model.js:100`) and in the wire
 * docs as a fourth state, so an untranslated one would otherwise reach a
 * tooltip as the raw enum — a row is cheaper than that bug.
 */
export const CONFIDENCE_LABEL = {
  EXTRACTED: { zh: '源码直读', en: 'Read from source' },
  INFERRED: { zh: '推断', en: 'Inferred' },
  AMBIGUOUS: { zh: '存疑', en: 'Ambiguous' },
  UNRESOLVED: { zh: '未解析', en: 'Unresolved' },
};

/* ------------------------------------------------------------------ *
 * Families                                                          *
 * ------------------------------------------------------------------ */

/** Relation → family, verbatim from `graphMeta.ts:97-119`. */
export const RELATION_FAMILY = {
  contains: 'structure',
  method: 'structure',
  declares: 'structure',
  imports: 'dependency',
  imports_from: 'dependency',
  uses: 'dependency',
  calls: 'behaviour',
  indirect_call: 'behaviour',
  references: 'behaviour',
  inherits: 'hierarchy',
  implements: 'hierarchy',
  rationale_for: 'meaning',
  community: 'dependency',
};

/** Every family the legend offers, in legend order. */
export const FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy', 'meaning', 'other'];

/**
 * Families visible on a cold start.
 *
 * Deviates from `graphFilter.ts:26` in one deliberate way: the desktop's default
 * set is `behaviour, dependency, structure, other`, which leaves the `hierarchy`
 * family out — and it had no chip either, so inheritance edges were hidden by
 * default *and* unreachable (`spec §2.10`, §11.4). Inheritance being invisible is
 * the exact gap this plugin exists to close (`DESIGN §5.3`), so `hierarchy` is on
 * by default and `other` — which this scanner never produces for code edges — is
 * off. Both remain toggleable from the legend.
 */
export const DEFAULT_FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy'];

/**
 * Family of a relation.
 * @param relation - the wire relation name.
 * @returns one of `FAMILIES`; unknown relations land in `other`.
 */
export function relationFamily(relation) {
  return RELATION_FAMILY[relation] ?? 'other';
}

/**
 * Relations whose *confidence* can be read off the syntax.
 *
 * This is the desktop's `STRUCTURAL_RELATIONS` (`graphMeta.ts:56-66`) and it
 * answers a different question from `alignIsStructural` (which decides the ink
 * and lists only `contains/method/declares/rationale_for`, `graphTheme.ts:83-85`).
 * The two sets are deliberately distinct in the desktop and stay distinct here:
 * conflating them makes `imports` lose its community colour *and* makes an
 * untagged call edge render solid.
 */
const STRUCTURAL_CONFIDENCE = new Set([
  'contains', 'method', 'imports', 'imports_from', 'inherits', 'implements', 'declares',
  'rationale_for', 'uses',
]);

/* ------------------------------------------------------------------ *
 * Edge ink — re-exported from `graph-align.js`                       *
 * ------------------------------------------------------------------ */

/**
 * Width + opacity per relation, verbatim `graphTheme.ts:50-80`.
 *
 * Re-exported rather than re-declared: `graph-canvas.js` reads the same object
 * through `alignEdgeInk`, and two literals would let a canvas edge and a legend
 * swatch disagree about how loud a call is.
 */
export const EDGE_INK = ALIGN_EDGE_INK;

/** The neutral row for a relation with no table entry (`ALIGN_EDGE_INK.default`). */
export const DEFAULT_EDGE_INK = ALIGN_DEFAULT_EDGE_INK;

/** Inferred-edge factors, verbatim `GraphCanvas.tsx:463-464` (`×0.7` / `×0.6`). */
export const INFERRED_WIDTH_FACTOR = ALIGN_INFERRED_WIDTH;
export const INFERRED_OPACITY_FACTOR = ALIGN_INFERRED_OPACITY;

/** Radius floor and span, verbatim `GraphCanvas.tsx:409`. */
export const NODE_RADIUS_MIN = ALIGN_NODE_RADIUS_MIN;
export const NODE_RADIUS_MAX = ALIGN_NODE_RADIUS_MIN + ALIGN_NODE_RADIUS_SPAN;

/** Neutral ink for structural edges; the alpha comes from the host theme. */
export const STRUCTURAL_EDGE_INK = ALIGN_STRUCTURAL_INK;

/**
 * Relations that get an arrowhead.
 *
 * The set now lives in `graph-align.js` (`alignArrowed`), which is where the
 * canvas reads it; this wrapper exists so a caller holding the label tables does
 * not have to import two modules for one question.
 * @param relation - the wire relation name.
 * @returns whether to draw an arrowhead at the target.
 */
export function hasArrow(relation) {
  return alignArrowed(relation);
}

/**
 * Is this edge a deduction rather than a reading? Verbatim
 * `graphMeta.ts:81-85`, and the reason inferred edges are dotted everywhere.
 * @param relation - the wire relation name.
 * @param confidence - `EXTRACTED | INFERRED | AMBIGUOUS`, possibly absent.
 * @returns whether to render it as inferred.
 */
export function isInferred(relation, confidence) {
  if (confidence === 'INFERRED' || confidence === 'AMBIGUOUS') return true;
  return !STRUCTURAL_CONFIDENCE.has(relation) && confidence !== 'EXTRACTED';
}

/**
 * Resolve one edge's ink.
 *
 * A thin adapter over `alignEdgeInk` so the historical signature (relation +
 * confidence, rather than a precomputed `inferred` flag) keeps working: the
 * canvas knows the confidence and should not have to remember to call
 * `isInferred` first.
 * @param relation - the wire relation name.
 * @param confidence - the wire confidence, possibly absent.
 * @returns `{width, opacity, inferred}` with the inferred factors applied.
 */
export function edgeInk(relation, confidence) {
  return alignEdgeInk(relation, { inferred: isInferred(relation, confidence) });
}

/**
 * Should this edge take the community colour, or the neutral structural ink?
 *
 * Delegates to `alignIsStructural`, which is `graphTheme.ts:83-85`'s narrower set
 * (`contains/method/declares/rationale_for`). Note the name collision with
 * `STRUCTURAL_CONFIDENCE` above is *intentional and must stay*: the desktop has
 * two different notions of "structural" and merging them is a visible bug.
 * @param relation - the wire relation name.
 * @returns whether the edge is structural for ink purposes.
 */
export function isStructuralRelation(relation) {
  return alignIsStructural(relation);
}

/* ------------------------------------------------------------------ *
 * Node geometry — re-exported from `graph-align.js`                  *
 * ------------------------------------------------------------------ */

/**
 * @param degree - the node's incident edge count.
 * @param maxDegree - the largest degree in the visible slice, at least 1.
 * @returns the radius in graph units.
 */
export function nodeRadius(degree, maxDegree) {
  return alignNodeRadius(degree, maxDegree);
}

/** Label truncation, verbatim `GraphCanvas.tsx:429`: 42 chars → 41 + ellipsis. */
export const LABEL_MAX_CHARS = 42;

/**
 * @param label - the node's label.
 * @returns the label clipped to fit a 12 px glyph run.
 */
export function clipLabel(label) {
  const text = String(label ?? '');
  return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…` : text;
}

/**
 * How many labels this zoom level may draw, verbatim `GraphCanvas.tsx:76-83`.
 *
 * The non-monotonic shape is not a mistake to "fix": the overview range
 * (0.28–0.45) holds more nodes on screen than the 0.45–0.7 range, so it gets
 * fewer labels per node but a similar total, which is what keeps the two zoom
 * bands looking equally dense.
 * @param scale - the current zoom.
 * @returns the label budget.
 */
export function labelBudget(scale) {
  return alignLabelBudget(scale);
}

/* ------------------------------------------------------------------ *
 * Palette                                                            *
 * ------------------------------------------------------------------ */

/**
 * Ten community inks, re-derived from the alias tokens.
 *
 * The desktop uses Tableau-10 (`graphTheme.ts:27-38`); a plugin must not ship
 * hex, so each entry is a `color-mix` between two host tokens at a ratio chosen
 * to keep consecutive communities separable in both themes. Order matters: the
 * first entry is the brand colour itself, so community 0 reads as "the accent".
 */
/**
 * Community → ink.
 *
 * These are graphify's own Tableau-10 values (`exporters/base.py:11-14`), not
 * host tokens, because vis-network paints a canvas: a CSS custom property or a
 * `color-mix()` string cannot be parsed as a canvas fill. The rail swatches read
 * the same function, so a dot in the legend is byte-identical to the node.
 */
export const COMMUNITY_PALETTE = [
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

/**
 * Community → ink, with a **true** modulo so a negative id works
 * (`graphTheme.ts:126-130`).
 * @param community - the numeric community id.
 * @returns a CSS colour string.
 */
export function communityColor(community) {
  const id = Number(community);
  const length = COMMUNITY_PALETTE.length;
  const slot = Number.isFinite(id) ? ((Math.trunc(id) % length) + length) % length : 0;
  return COMMUNITY_PALETTE[slot];
}

/* ------------------------------------------------------------------ *
 * Lookups                                                            *
 * ------------------------------------------------------------------ */

/**
 * Read a bilingual cell, falling back to the raw key.
 * @param table - one of the label tables above.
 * @param key - the wire name.
 * @param locale - `'zh'` or `'en'`.
 * @returns the label, or `key` when the table has no row.
 */
export function labelOf(table, key, locale) {
  const row = table[key];
  if (row === undefined) return String(key ?? '');
  return locale === 'zh' ? row.zh : row.en;
}

/** @param relation - wire name. @param locale - `'zh' | 'en'`. */
export function relationLabel(relation, locale) {
  return labelOf(RELATION_LABEL, relation, locale);
}

/** @param kind - wire name. @param locale - `'zh' | 'en'`. */
export function kindLabel(kind, locale) {
  return labelOf(KIND_LABEL, kind, locale);
}

/** @param confidence - wire name. @param locale - `'zh' | 'en'`. */
export function confidenceLabel(confidence, locale) {
  return confidence === undefined || confidence === null
    ? ''
    : labelOf(CONFIDENCE_LABEL, confidence, locale);
}

/** @param family - one of `FAMILIES`. @param locale - `'zh' | 'en'`. */
export function familyLabel(family, locale) {
  const row = {
    behaviour: { zh: '行为', en: 'Behaviour' },
    dependency: { zh: '依赖', en: 'Dependency' },
    structure: { zh: '结构', en: 'Structure' },
    hierarchy: { zh: '继承', en: 'Hierarchy' },
    meaning: { zh: '说明', en: 'Meaning' },
    other: { zh: '其他', en: 'Other' },
  }[family];
  return row === undefined ? String(family ?? '') : (locale === 'zh' ? row.zh : row.en);
}

/**
 * The inspector's group order and labels.
 *
 * `key` matches the wire (`WIRE.md §3`) so the rail renders what the Host
 * grouped instead of re-deriving direction in the browser.
 */
export const GROUP_ORDER = [
  { key: 'callers', zh: '调用者', en: 'Callers' },
  { key: 'calls', zh: '调用', en: 'Calls' },
  { key: 'dependencies', zh: '依赖', en: 'Dependencies' },
  { key: 'structure', zh: '结构', en: 'Structure' },
  { key: 'meaning', zh: '说明', en: 'Explains' },
  { key: 'hierarchy', zh: '继承', en: 'Extends' },
  { key: 'related', zh: '关联', en: 'Related' },
];

/**
 * @param key - a wire group key.
 * @param locale - `'zh' | 'en'`.
 * @returns the group's label, or the raw key.
 */
export function groupLabel(key, locale) {
  const row = GROUP_ORDER.find((entry) => entry.key === key);
  if (row === undefined) return String(key ?? '');
  return locale === 'zh' ? row.zh : row.en;
}

/**
 * The canvas corner's on-screen count — "已显示 N / 共 M".
 *
 * Bilingual here rather than in `i18n.js` for the same reason the relation
 * labels are: it is canvas vocabulary, and the canvas is the only surface that
 * renders it. It is deliberately *not* the same sentence as
 * `graph.status.truncated` ("图谱已截断：只画了 …"): that one is a warning about a
 * cap and belongs in a tooltip, while this one is a standing count that has to
 * fit a 60 px corner chip in both languages.
 *
 * The desktop shows the same pair as `.graph-head-stats` (`GraphView.tsx:281-283`,
 * "可见节点 / 关系 / 社区"), so the wording stays a count and never becomes advice.
 */
export const CANVAS_COUNT_LABEL = {
  zh: '已显示 {shown} / 共 {total}',
  en: 'Showing {shown} of {total}',
};

/**
 * @param shown - how many nodes the slice actually passes to the canvas.
 * @param total - how many the index holds, or `shown` when nothing was cut.
 * @param locale - `'zh' | 'en'`.
 * @returns the count phrase, interpolated.
 */
export function canvasCountLabel(shown, total, locale) {
  const row = CANVAS_COUNT_LABEL[locale] ?? CANVAS_COUNT_LABEL.en;
  return row
    .replace('{shown}', String(shown))
    .replace('{total}', String(total));
}

