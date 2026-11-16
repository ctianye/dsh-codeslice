/**
 * The vocabulary of the code graph.
 *
 * One module owns every name that appears on the wire — node kinds, relations,
 * confidences, id construction, the stats shape — so the scanner, the resolver,
 * the cluster pass, the query layer and the browser half cannot drift apart.
 * A relation that renders "调用" in the inspector must not read "calls" in a
 * tooltip, and an inferred edge must look inferred everywhere.
 *
 * Ported from `backend/app/graph/ast/__init__.py` plus the stats shape of
 * `backend/app/graph/ast/resolve.py:936-946`.
 */

/* ------------------------------------------------------------------ *
 * Kinds                                                              *
 * ------------------------------------------------------------------ */

export const KIND_FILE = 'file';
export const KIND_CLASS = 'class';
export const KIND_FUNCTION = 'function';
export const KIND_RATIONALE = 'rationale';
export const KIND_EXTERNAL = 'external';

/**
 * `module` is declared for parity and has no producer — the original never
 * emits one either (`graph/ast/__init__.py:52-57` keeps it, nothing imports the
 * constant into a constructor). It is listed so a future producer is already
 * handled by the filters that skip it.
 */
export const KIND_MODULE = 'module';

export const NODE_KINDS = [
  KIND_FILE, KIND_CLASS, KIND_FUNCTION, KIND_RATIONALE, KIND_MODULE, KIND_EXTERNAL,
];

/**
 * Kinds that count as "a declaration" when the resolver asks whether a name is
 * defined. `file`/`module`/`rationale` are excluded: a call cannot target them.
 */
export const DECLARATION_KINDS = new Set([KIND_CLASS, KIND_FUNCTION]);

/* ------------------------------------------------------------------ *
 * Relations                                                          *
 * ------------------------------------------------------------------ */

export const REL_CONTAINS = 'contains';
export const REL_IMPORTS = 'imports';
export const REL_IMPORTS_FROM = 'imports_from';
export const REL_CALLS = 'calls';
export const REL_INDIRECT_CALL = 'indirect_call';
export const REL_INHERITS = 'inherits';
export const REL_METHOD = 'method';
export const REL_RATIONALE_FOR = 'rationale_for';
export const REL_USES = 'uses';

/**
 * Every relation this implementation can emit, in the order the legend shows
 * them. `references` / `implements` / `declares` exist in the original's
 * vocabulary but are never produced by any code path (`spec §1.3`), so emitting
 * them here would invent edges the desktop app cannot show.
 */
export const RELATIONS = [
  REL_CALLS,
  REL_INDIRECT_CALL,
  REL_IMPORTS,
  REL_IMPORTS_FROM,
  REL_USES,
  REL_INHERITS,
  REL_CONTAINS,
  REL_METHOD,
  REL_RATIONALE_FOR,
];

export const RELATION_SET = new Set(RELATIONS);

/**
 * Direction semantics: `source —relation→ target` reads as an active verb.
 * `rationale_for` is the one inverted case — the rationale is the *source*, so
 * "what explains node X" is an incoming query on X.
 */
export const RELATION_IS_ACTIVE = {
  [REL_CALLS]: 'calls',
  [REL_INDIRECT_CALL]: 'references',
  [REL_IMPORTS]: 'imports',
  [REL_IMPORTS_FROM]: 'imports from',
  [REL_USES]: 'depends on',
  [REL_INHERITS]: 'extends',
  [REL_CONTAINS]: 'contains',
  [REL_METHOD]: 'owns method',
  [REL_RATIONALE_FOR]: 'explains',
};

/* ------------------------------------------------------------------ *
 * Confidence                                                         *
 * ------------------------------------------------------------------ */

export const CONF_EXTRACTED = 'EXTRACTED';
export const CONF_INFERRED = 'INFERRED';
export const CONF_AMBIGUOUS = 'AMBIGUOUS';
export const CONF_UNRESOLVED = 'UNRESOLVED';

/**
 * The only confidences a *graph edge* carries. `indirect_call` is the sole
 * `INFERRED` producer; everything else is read straight off the source.
 */
export const EDGE_CONFIDENCES = [CONF_EXTRACTED, CONF_INFERRED];

/**
 * Rank used when a chain must be judged by its weakest link
 * (`graph/query.py:481`). Unknown → 0.
 */
export const CONFIDENCE_RANK = {
  [CONF_EXTRACTED]: 3,
  [CONF_INFERRED]: 2,
  [CONF_AMBIGUOUS]: 1,
  [CONF_UNRESOLVED]: 0,
};

export const RANK_CONFIDENCE = {
  3: CONF_EXTRACTED,
  2: CONF_INFERRED,
  1: CONF_AMBIGUOUS,
  0: 'UNKNOWN',
};

/* ------------------------------------------------------------------ *
 * Rationale markers                                                  *
 * ------------------------------------------------------------------ */

/**
 * Comment prefixes that turn a comment into a `rationale` node, uppercased for
 * comparison (`graph/ast/__init__.py:63-77`). The Chinese markers are the ones
 * the original author actually used.
 */
export const RATIONALE_MARKERS = [
  'NOTE:', 'WHY:', 'RATIONALE:', 'IMPORTANT:', 'WARNING:', 'HACK:',
  'TODO:', 'FIXME:', 'XXX:', '注意:', '原因:', '说明:', '重要:',
];

/** Longest rationale body kept, in characters (`engine.py:48`). */
export const MAX_RATIONALE_CHARS = 400;

/** How many leading source lines the file-header rationale scan reads. */
export const FILE_HEADER_LINES = 12;

/* ------------------------------------------------------------------ *
 * Ids                                                                *
 * ------------------------------------------------------------------ */

/**
 * One node id: `<path>::<kind>::<name>::<line>`.
 *
 * The line number is part of identity, so two same-named methods in one file are
 * two nodes and re-declared functions never collapse. `__file__` is the sentinel
 * for a node without a name, which keeps `<path>::file::__file__::1` unambiguous
 * even for a symbol literally called `__file__`.
 *
 * @param path - relative POSIX path.
 * @param kind - one of NODE_KINDS.
 * @param name - symbol name, or null/empty for a file node.
 * @param line - 1-based line.
 * @returns the node id.
 */
export function makeNodeId(path, kind, name, line) {
  const raw = name === null || name === undefined ? '' : String(name).trim();
  const safe = raw === '' ? '__file__' : raw;
  const at = Number.isFinite(Number(line)) ? Math.trunc(Number(line)) : 1;
  return `${path}::${kind}::${safe}::${at}`;
}

/** The id of a file node — the one id every symbol in that file can be found by. */
export function fileNodeId(path) {
  return makeNodeId(path, KIND_FILE, '__file__', 1);
}

/** The id of an out-of-corpus dependency node. */
export function externalNodeId(key) {
  return makeNodeId('<external>', KIND_EXTERNAL, key, 1);
}

/**
 * A rationale node's id embeds its first 40 characters.
 *
 * Deliberately not a stable key across edits: the text is the identity, and the
 * row is rebuilt when the file changes. Nothing may join on it long term.
 */
export function rationaleNodeId(path, text, line) {
  const clipped = String(text ?? '').slice(0, 40);
  return makeNodeId(path, KIND_RATIONALE, clipped, line);
}

/** Does this id belong to a rationale node? Used by the UI to hide them by default. */
export function isRationaleId(id) {
  return typeof id === 'string' && id.includes('::rationale::');
}

/* ------------------------------------------------------------------ *
 * Constructors                                                       *
 * ------------------------------------------------------------------ */

/**
 * A file node. `end_line` is the last line the file has, so a file node's span
 * always covers every symbol inside it.
 * @param path - relative POSIX path.
 * @param lineCount - number of lines in the file.
 * @param language - scanner dialect name.
 * @returns the node.
 */
export function makeFileNode(path, lineCount, language) {
  const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return {
    id: fileNodeId(path),
    label: base,
    kind: KIND_FILE,
    path,
    start_line: 1,
    start_col: 1,
    end_line: Math.max(1, lineCount),
    end_col: 1,
    parent: null,
    language,
  };
}

/**
 * A declaration node (class or function). Methods are `function` nodes whose
 * `parent` is the owning class — that, plus the `method` relation, is the whole
 * distinction between "lexically inside" and "this class owns this".
 * @param options - the fields to record.
 * @returns the node.
 */
export function makeDeclarationNode(options) {
  const {
    path, kind, name, line, endLine, startCol = 1, endCol = 1,
    parent = null, language, signature = '',
  } = options;
  const node = {
    id: makeNodeId(path, kind, name, line),
    label: String(name),
    kind,
    path,
    start_line: line,
    start_col: startCol,
    end_line: Math.max(line, endLine ?? line),
    end_col: endCol,
    parent,
    language,
  };
  if (signature !== '') node.signature = signature;
  return node;
}

/**
 * A rationale node: a docstring or a marker comment that explains why something
 * exists. Its label is the explanatory text itself.
 * @param options - the fields to record.
 * @returns the node.
 */
export function makeRationaleNode(options) {
  const { path, text, line, parent, language, origin } = options;
  const body = collapseWhitespace(text).slice(0, MAX_RATIONALE_CHARS);
  return {
    id: rationaleNodeId(path, body, line),
    label: body,
    kind: KIND_RATIONALE,
    path,
    start_line: line,
    start_col: 1,
    end_line: line,
    end_col: 1,
    parent: parent ?? null,
    language,
    origin: origin === 'docstring' ? 'docstring' : 'comment',
  };
}

/**
 * An out-of-corpus dependency node. `path` is empty and the span is zero-length:
 * there is no source to point at, and pretending otherwise would put a fake
 * `path:line` in front of the reader.
 * @param key - the module spec or base-class name.
 * @returns the node.
 */
export function makeExternalNode(key) {
  return {
    id: externalNodeId(key),
    label: String(key),
    kind: KIND_EXTERNAL,
    path: '',
    start_line: 0,
    start_col: 1,
    end_line: 0,
    end_col: 1,
    parent: null,
    external: true,
  };
}

/**
 * One edge. The dedupe key is `(source, target, relation)` — the line is
 * first-writer-wins and confidence only ever upgrades, never downgrades
 * (`spec §1.7`).
 * @param source - source node id.
 * @param target - target node id.
 * @param relation - one of RELATIONS.
 * @param confidence - EXTRACTED or INFERRED.
 * @param line - 1-based source line, or null.
 * @returns the edge.
 */
export function makeEdge(source, target, relation, confidence, line) {
  return {
    source,
    target,
    relation,
    confidence: confidence ?? CONF_EXTRACTED,
    line: Number.isFinite(Number(line)) ? Number(line) : null,
  };
}

/** The identity of an edge, for dedupe sets. */
export function edgeKey(edge) {
  return `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
}

/* ------------------------------------------------------------------ *
 * Small helpers                                                      *
 * ------------------------------------------------------------------ */

/**
 * Collapse every run of whitespace to one space and trim.
 * @param text - raw text.
 * @returns the collapsed text.
 */
export function collapseWhitespace(text) {
  return String(text ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * The first line of a declaration, clipped — what the inspector shows under the
 * name so a reader can tell two overloads apart without opening the file.
 * @param text - the declaration's source text.
 * @param limit - maximum characters (default 200).
 * @returns the signature line.
 */
export function signatureOf(text, limit = 200) {
  const first = String(text ?? '').split('\n')[0].trim();
  return first.length > limit ? `${first.slice(0, limit - 1)}…` : first;
}

/** `dir/` portion of a POSIX path, or '' at the root. */
export function dirOf(path) {
  if (typeof path !== 'string') return '';
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/** Text after the last slash. */
export function baseOf(path) {
  if (typeof path !== 'string' || path === '') return '';
  const cut = path.lastIndexOf('/');
  return cut < 0 ? path : path.slice(cut + 1);
}

/**
 * A kind ordering used wherever a list must be stable across builds: declarations
 * first (functions before methods before classes), then files, then the rest.
 */
export const KIND_ORDER = new Map([
  [KIND_FUNCTION, 0],
  [KIND_CLASS, 1],
  [KIND_FILE, 2],
  [KIND_RATIONALE, 3],
  [KIND_MODULE, 4],
  [KIND_EXTERNAL, 5],
]);

/**
 * The keyword weight of a node kind when ranking against a question
 * (`graph/query.py:84-91`).
 *
 * `external` is suppressed almost to zero because a dependency name is not an
 * answer — a question mentioning "pytest" should lead to the project's own test
 * helpers, not to a node that only records the dependency exists. `rationale`
 * sits below real symbols but above `external`: excellent supporting evidence,
 * never the seed of a traversal.
 */
export const KIND_WEIGHT = {
  [KIND_FUNCTION]: 1.0,
  [KIND_CLASS]: 1.0,
  [KIND_FILE]: 0.85,
  [KIND_RATIONALE]: 0.6,
  [KIND_MODULE]: 0.5,
  [KIND_EXTERNAL]: 0.05,
};

/**
 * Relation families, used to pick an edge's weight/ink and to group the
 * inspector's connection lists. Grouped rather than one colour per relation:
 * with a dozen kinds a per-kind palette becomes unreadable, but five families
 * stay distinguishable (`spec frontend §3.1`).
 */
export const RELATION_FAMILY = {
  [REL_CONTAINS]: 'structure',
  [REL_METHOD]: 'structure',
  [REL_RATIONALE_FOR]: 'meaning',
  [REL_IMPORTS]: 'dependency',
  [REL_IMPORTS_FROM]: 'dependency',
  [REL_USES]: 'dependency',
  [REL_CALLS]: 'behaviour',
  [REL_INDIRECT_CALL]: 'behaviour',
  [REL_INHERITS]: 'hierarchy',
  // Graphify vocabulary (kept here so a graphify-sourced edge draws under the
  // same family as its built-in counterpart instead of disappearing as "other").
  dynamic_import: 'dependency',
  re_exports: 'dependency',
  declarations: 'structure',
  declares: 'structure',
  implements: 'hierarchy',
  references: 'dependency',
  explains: 'meaning',
  // The aggregated canvas view's cross-community edges. Dependency is the
  // closest honest family: these are not calls the extractor proved.
  community: 'dependency',
};

/** Families the graph draws by default. `hierarchy` is included on purpose — see DESIGN §5.3. */
export const DEFAULT_FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy'];

export const ALL_FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy', 'meaning'];

/**
 * The family of a relation, defaulting to `other` so an unknown relation from a
 * newer scanner still renders instead of vanishing.
 * @param relation - the relation string.
 * @returns the family name.
 */
export function familyOf(relation) {
  return RELATION_FAMILY[relation] ?? 'other';
}

/** True when an edge is a deduction rather than a reading. */
export function isInferredEdge(edge) {
  return edge.confidence === CONF_INFERRED;
}
