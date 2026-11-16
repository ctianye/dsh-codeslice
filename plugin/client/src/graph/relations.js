/**
 * Inspector relation grouping (Agent C, §2.2).
 *
 * Ported from the desktop reference `graphRelations.ts`: a selected node's
 * edges are split into the buckets the inspector shows. Calls are split by
 * direction ("who calls this" vs "what this calls"); every other family reads
 * better grouped together with a per-row arrow.
 */

const grCALL_RELATIONS = new Set(['calls', 'indirect_call', 'references']);
const grDEPENDENCY_RELATIONS = new Set(['imports', 'imports_from', 'uses', 'inherits', 'implements']);
const grSTRUCTURE_RELATIONS = new Set(['contains', 'method', 'declares']);
const grMEANING_RELATIONS = new Set(['rationale_for']);

/** Group keys in inspector order (desktop `RelationGroupKey`, plus `hierarchy`). */
export const GRAPH_GROUP_ORDER = [
  'callers', 'calls', 'dependencies', 'structure', 'meaning', 'hierarchy', 'related',
];

/** Fallback Chinese labels; the rail normally routes through `t('gr.group.<key>')`. */
export const GRAPH_GROUP_LABELS = {
  callers: '调用者',
  calls: '调用',
  dependencies: '依赖',
  structure: '结构',
  meaning: '说明',
  hierarchy: '继承',
  related: '关联',
};

/* ---- display vocabulary (desktop `graphMeta.ts`) --------------------- */

const grRELATION_LABEL = {
  shares_topic: '共同主题',
  same_folder: '同一笔记目录',
  same_project: '同项目未分类',
  shared_reference: '共同引用文件',
  community_member: '社区成员（布局索引）',
  mentions: '提及主题',
  co_occurs: '主题共现',
  similar: '内容相似',
  contains: '包含',
  imports: '导入模块',
  imports_from: '导入符号',
  calls: '调用',
  indirect_call: '回调引用',
  references: '引用',
  inherits: '继承',
  implements: '实现',
  method: '方法',
  declares: '声明',
  rationale_for: '说明',
  uses: '依赖',
};

const grKIND_LABEL = {
  community: '社区',
  note: '笔记',
  topic: '主题',
  file: '文件',
  class: '类',
  function: '函数',
  module: '模块',
  rationale: '说明',
  external: '外部',
};

const grCONFIDENCE_LABEL = {
  EXTRACTED: '源码直读',
  INFERRED: '推断',
  AMBIGUOUS: '存疑',
};

/** Chinese label for a relation kind; English falls back to the raw kind. */
export function grRelationLabel(relation, locale) {
  if (locale === 'en') return relation;
  return grRELATION_LABEL[relation] ?? relation;
}

/** Short label for a node kind. */
export function grKindLabel(kind, locale) {
  if (locale === 'en') return kind;
  return grKIND_LABEL[kind] ?? kind;
}

/** Confidence label. */
export function grConfidenceLabel(confidence, locale) {
  if (locale === 'en') {
    return { EXTRACTED: 'Extracted', INFERRED: 'Inferred', AMBIGUOUS: 'Ambiguous' }[confidence] ?? confidence;
  }
  return grCONFIDENCE_LABEL[confidence] ?? confidence;
}

/** Relations treated as solid even without an `EXTRACTED` confidence tag. */
const grSTRUCTURAL_RELATIONS = new Set([
  'contains', 'method', 'imports', 'imports_from', 'inherits', 'implements',
  'declares', 'rationale_for', 'uses',
]);

/** True when the edge should be drawn dotted (a deduction, not a reading). */
export function grIsInferred(relation, confidence) {
  if (confidence === 'INFERRED' || confidence === 'AMBIGUOUS') return true;
  return !grSTRUCTURAL_RELATIONS.has(relation) && confidence !== 'EXTRACTED';
}

/**
 * Group one node's edges into inspector buckets.
 *
 * @param {string} selectedId - the selected node id.
 * @param {Array<{source:string,target:string,relation:string,confidence?:string,line?:number}>} edges
 *   raw graph edges.
 * @param {ReadonlyMap<string, object>} byId - node id → node.
 * @param {'code'|'notes'} scope - notes scope folds everything into `related`.
 * @returns {Array<{key:string,label:string,items:Array<{edge:object,other:object,outgoing:boolean}>}>}
 *   non-empty groups only, in desktop order.
 */
export function grRelationGroups(selectedId, edges, byId, scope) {
  const groups = {
    callers: [], calls: [], dependencies: [], structure: [], meaning: [], hierarchy: [], related: [],
  };

  for (const edge of edges) {
    if (edge.source !== selectedId && edge.target !== selectedId) continue;
    const outgoing = edge.source === selectedId;
    const other = byId.get(outgoing ? edge.target : edge.source);
    if (!other || other.id === selectedId) continue;
    const connection = { edge, other, outgoing };

    if (scope === 'notes') {
      groups.related.push(connection);
    } else if (grCALL_RELATIONS.has(edge.relation)) {
      (outgoing ? groups.calls : groups.callers).push(connection);
    } else if (grDEPENDENCY_RELATIONS.has(edge.relation)) {
      groups.dependencies.push(connection);
    } else if (grSTRUCTURE_RELATIONS.has(edge.relation)) {
      groups.structure.push(connection);
    } else if (grMEANING_RELATIONS.has(edge.relation)) {
      groups.meaning.push(connection);
    } else if (edge.relation === 'inherits' || edge.relation === 'implements') {
      groups.hierarchy.push(connection);
    } else {
      groups.dependencies.push(connection);
    }
  }

  const byLabel = (a, b) => String(a.other.label ?? '').localeCompare(String(b.other.label ?? ''), 'zh-CN');
  const byRelation = (a, b) => (
    String(a.edge.relation ?? '').localeCompare(String(b.edge.relation ?? '')) || byLabel(a, b)
  );
  for (const key of ['dependencies', 'structure', 'meaning', 'hierarchy']) groups[key].sort(byRelation);
  groups.callers.sort(byLabel);
  groups.calls.sort(byLabel);
  groups.related.sort(byRelation);

  return GRAPH_GROUP_ORDER
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, label: GRAPH_GROUP_LABELS[key], items: groups[key] }));
}
