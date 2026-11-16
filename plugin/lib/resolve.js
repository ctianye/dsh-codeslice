/**
 * Pass 2 — merge every extraction and resolve the raw facts project-wide.
 *
 * This is the step that turns a bag of per-file observations into a call graph,
 * and the phase order is load-bearing (`spec §2.3`):
 *
 * ```
 * 1. build the symbol table
 * 2. carry over every extraction's nodes and structural edges
 * 3. resolve imports      (creates external nodes + per-file bindings)
 * 4. resolve inheritance
 * 5. build the per-file local symbol index
 * 6. resolve calls
 * 7. resolve indirect calls
 * 8. degree, sort, stats, symbol index
 * ```
 *
 * Imports come first because they *define the candidate set* for cross-file
 * calls: `from app.db import get_conn` is what tells the resolver which file owns
 * the `get_conn` this file calls.
 *
 * The policy that matters most: **a name that is ambiguous is dropped, not
 * guessed.** `SymbolTable.unique` returns null unless exactly one node has the
 * name, including same-file duplicates. A confidently wrong caller is read as
 * fact by the user; a missing one is merely a gap (`resolve.py:11-13`).
 *
 * The language gate is the second half of that policy. For Python, JavaScript and
 * TypeScript a bare call that is neither local nor import-bound stops at rule 3
 * instead of falling through to a global-unique guess, because nothing records
 * what those files import — a project-wide unique name is not evidence that *this*
 * file can see it.
 *
 * ## Exports
 *
 * - {@link resolveGraph} — the pipeline; returns `{ nodes, edges, stats, index }`.
 * - {@link definitionsAt} — the declarations starting on one line of one file.
 * - {@link refsTo} — every resolved occurrence that targets a node.
 * - {@link definitionsByName} — declarations matching a name, exact case first.
 * - {@link searchDefinitions} — normalized substring search for the pickers.
 * - {@link SymbolTable} — the index the ladders consult, exported for tooling.
 */

import {
  CONF_AMBIGUOUS,
  CONF_EXTRACTED,
  CONF_INFERRED,
  CONF_UNRESOLVED,
  DECLARATION_KINDS,
  KIND_CLASS,
  KIND_EXTERNAL,
  KIND_FILE,
  KIND_FUNCTION,
  KIND_MODULE,
  KIND_RATIONALE,
  REL_CALLS,
  REL_IMPORTS,
  REL_IMPORTS_FROM,
  REL_INDIRECT_CALL,
  REL_INHERITS,
  REL_USES,
  fileNodeId,
  makeEdge,
  makeExternalNode,
} from './model.js';

/* ------------------------------------------------------------------ *
 * Normalization                                                      *
 * ------------------------------------------------------------------ */

/**
 * The one normalization used by every name lookup (`resolve.py:109-110`).
 *
 * Case and punctuation are not part of an identifier's identity, so `MyClass`,
 * `my_class` and `a-b.c` all collapse. The same function must be used by the
 * symbol index, because `symbol_defs.normalized` is queried with it.
 *
 * @param name - any symbol name.
 * @returns the normalized key, possibly the empty string.
 */
export function symbolKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9_]/gu, '');
}

/* ------------------------------------------------------------------ *
 * Constants                                                          *
 * ------------------------------------------------------------------ */

/**
 * Python builtins that must never resolve to a project symbol even when a project
 * happens to define something with the same name (`resolve.py:50-60`).
 */
const BORING_CALLEES = new Set([
  'print', 'len', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  'range', 'enumerate', 'zip', 'sorted', 'reversed', 'min', 'max', 'sum', 'abs',
  'isinstance', 'issubclass', 'getattr', 'setattr', 'hasattr', 'delattr',
  'open', 'super', 'object', 'type', 'repr', 'hash', 'id', 'iter', 'next',
  'any', 'all', 'map', 'filter', 'format', 'input', 'vars', 'dir', 'callable',
  'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
  'RuntimeError', 'AttributeError', 'OSError', 'StopIteration',
]);

/**
 * Languages whose imports are parsed. A bare cross-file call in one of these has
 * to be backed by an import binding; the others keep the global-unique fallback
 * because nothing records what their files import (`resolve.py:116`).
 */
const GATED_LANGUAGES = new Set(['python', 'javascript', 'typescript']);

/** Language family that counts as "the same kind of module" for import matching. */
const JS_LANGUAGES = new Set(['javascript', 'typescript']);

/* ------------------------------------------------------------------ *
 * Small predicates                                                  *
 * ------------------------------------------------------------------ */

/** Plain ascending string comparison, the ordering the original uses. */
function cmp(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/**
 * Whether an import from one language may name a file in another.
 *
 * A Python `from types import ...` must never resolve to `types.ts` just because
 * the module name matches; language is part of the import's identity.
 * @param importer - the importing file's language.
 * @param target - the candidate target's language.
 * @returns whether the two are compatible.
 */
function compatibleLanguage(importer, target) {
  if (importer === '' || target === '') return true;
  if (JS_LANGUAGES.has(importer)) return JS_LANGUAGES.has(target);
  return importer === target;
}

/**
 * Path-ish forms an import spec could match (`resolve.py:63-106`).
 *
 * Longer variants come first because the resolver prefers the most specific
 * match: `app.core.db` should find `app/core/db.py` rather than some other
 * `db.py`. A package import is matched by the `__init__` variant, which is how
 * Python expresses "the package itself".
 *
 * `includeShortTail` is disabled for the gated languages: otherwise
 * `from langgraph.types import ...` resolves to any project file named `types.*`
 * and creates a confident but false cross-file edge.
 *
 * @param module - the raw import specifier.
 * @param includeShortTail - whether to add the last path segment on its own.
 * @returns variant strings, most specific first, deduped in order.
 */
export function moduleSuffixVariants(module, includeShortTail = true) {
  if (typeof module !== 'string' || module === '') return [];
  let spec = module.trim().replace(/^["']+|["']+$/gu, '');
  if (spec.startsWith('.')) spec = spec.replace(/^\.+/u, '');
  spec = spec.split('\\').join('/');
  const base = spec.includes('/') ? spec : spec.split('.').join('/');
  const out = [];
  const add = (value) => {
    const trimmed = String(value).replace(/^\/+|\/+$/gu, '');
    if (trimmed !== '' && !out.includes(trimmed)) out.push(trimmed);
  };
  for (const candidate of [spec, base]) {
    add(candidate);
    add(`${candidate}/__init__`);
    add(`${candidate}/__init__.py`);
  }
  if (includeShortTail) {
    for (const candidate of [spec, base]) {
      const cut = candidate.lastIndexOf('/');
      add(cut < 0 ? candidate : candidate.slice(cut + 1));
    }
  }
  return out;
}

/**
 * Names an import actually binds in the importing file (`resolve.py:134-147`).
 *
 * `from x import y as z` binds only `z`; the original `y` is not addressable
 * here. A re-export binds nothing at all — it only records the dependency.
 * @param fact - a raw import fact.
 * @returns the local names, in declaration order.
 */
export function importLocalNames(fact) {
  if (fact?.reexport === true) return [];
  const aliases = fact?.aliases ?? {};
  const aliased = new Set(Object.values(aliases));
  const names = (fact?.names ?? []).filter((name) => !aliased.has(name));
  names.push(...Object.keys(aliases));
  return names;
}

/**
 * The original (pre-alias) name of one local import binding.
 * @param fact - a raw import fact.
 * @param local - the local name written at the call site.
 * @returns the declaration's name, which is what the symbol table is keyed on.
 */
export function importOriginalName(fact, local) {
  const mapped = (fact?.aliases ?? {})[local];
  return String(mapped === undefined || mapped === null || mapped === '' ? local : mapped);
}

/**
 * Names an import makes available as a *receiver* for `name.attr()` calls
 * (`resolve.py:154-181`).
 *
 * `import app.services.paths` binds only `app`; `from app import repo` binds
 * `repo`; `import app.x as p` binds only `p`. Recording these spellings is what
 * lets `repo.get_project()` resolve without type inference.
 * @param fact - a raw import fact.
 * @returns the receiver names this import binds.
 */
export function importReceiverNames(fact) {
  if (fact?.reexport === true) return [];
  const module = String(fact?.module ?? '');
  const out = [];
  if (fact?.kind === 'plain') {
    const aliases = fact?.aliases ?? {};
    const keys = Object.keys(aliases);
    if (keys.length > 0) return keys;
    // `import a.b` binds only `a` in Python. The trailing component is a
    // *module*, not a local name; binding it too made `paths.x()` resolve for a
    // file that only wrote `import app.services.paths`.
    const head = module.split('.').join('/').split('/')[0];
    if (head !== '') out.push(head);
    return out;
  }
  for (const name of importLocalNames(fact)) {
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * SymbolTable                                                        *
 * ------------------------------------------------------------------ */

/**
 * Index of every named symbol in the corpus, plus per-file views.
 *
 * Fields mirror `resolve.py:184-235` one for one; the shapes are documented
 * because the resolution ladders are unreadable without them.
 */
export class SymbolTable {
  /**
   * @param extractions - every scanned file, in collection order.
   */
  constructor(extractions) {
    /** `(kind, normalized) → [node id]`, in insertion order. */
    this.byName = new Map();
    /** `path → [node id]` of the symbols that file declares. */
    this.byFile = new Map();
    /** `node id → node`, excluding file/module/rationale. */
    this.nodes = new Map();
    /** `path → (local name → [candidate file paths])`. */
    this.importBindings = new Map();
    /** `path → (local alias → original symbol name)`, for `import y as z`. */
    this.importOriginals = new Map();
    /** `path → [imported module paths]`, duplicates allowed. */
    this.importedModules = new Map();
    /** `path → language`, read off the file node the scanner emitted. */
    this.fileLanguages = new Map();
    /** `class node id → [function node ids owned by that class node]`. */
    this.classMembers = new Map();
    /** Every corpus path. */
    this.files = new Set();
    /** `suffix key → [path]`, for import-spec matching. */
    this.suffixIndex = new Map();

    for (const extraction of extractions) {
      for (const node of extraction.nodes ?? []) {
        const kind = node.kind;
        if (kind === KIND_FILE) {
          this.fileLanguages.set(node.path ?? extraction.path, node.language ?? '');
          continue;
        }
        if (kind === KIND_MODULE || kind === KIND_RATIONALE) continue;
        this.nodes.set(node.id, node);
        const key = `${kind}\u0000${symbolKey(node.label)}`;
        push(this.byName, key, node.id);
        push(this.byFile, node.path, node.id);
      }
      this.files.add(extraction.path);
    }

    for (const [nodeId, node] of this.nodes) {
      const parentId = node.parent;
      const parent = parentId === null || parentId === undefined ? undefined : this.nodes.get(parentId);
      if (node.kind === KIND_FUNCTION && parent !== undefined && parent.kind === KIND_CLASS) {
        push(this.classMembers, parentId, nodeId);
      }
    }

    for (const path of this.files) {
      const parts = path.split('/');
      for (let cut = 0; cut < parts.length; cut += 1) {
        const key = parts.slice(cut).join('/');
        push(this.suffixIndex, key, path);
        const dot = key.lastIndexOf('.');
        if (dot > 0) {
          const stem = key.slice(0, dot);
          // Only a real extension, not the last segment of a directory name.
          if (!stem.slice(stem.lastIndexOf('/') + 1).includes('.')) push(this.suffixIndex, stem, path);
        }
      }
    }
  }

  /**
   * The one node of this kind with that name, or null when absent or ambiguous.
   * @param kind - node kind.
   * @param name - the symbol name, normalized internally.
   * @returns the node id, or null.
   */
  unique(kind, name) {
    const ids = this.byName.get(`${kind}\u0000${symbolKey(name)}`);
    if (ids === undefined || ids.length === 0) return null;
    // Same-file duplicates are still ambiguous: two `run` in one file means a
    // bare `run()` cannot be attributed without type inference.
    return ids.length === 1 ? ids[0] : null;
  }

  /**
   * Every node of one kind whose name normalizes to `name`.
   * @param kind - node kind.
   * @param name - the symbol name.
   * @returns the candidate ids, in insertion order.
   */
  candidates(kind, name) {
    return [...(this.byName.get(`${kind}\u0000${symbolKey(name)}`) ?? [])];
  }

  /**
   * The method owned by this exact class node, with no global name lookup.
   *
   * Two classes named `Panel` in different files are different classes; using the
   * caller's class id keeps `self.helper()` from landing in the other one.
   * @param classId - the class node id.
   * @param method - the method name.
   * @returns the method node id, or null.
   */
  methodOfClass(classId, method) {
    const key = symbolKey(method);
    for (const nodeId of this.classMembers.get(classId) ?? []) {
      if (symbolKey(this.nodes.get(nodeId)?.label ?? '') === key) return nodeId;
    }
    return null;
  }

  /**
   * A class called `name` declared in this file, when there is exactly one.
   * @param path - the file path.
   * @param name - the class name.
   * @returns the class node id, or null.
   */
  classDeclaredInFile(path, name) {
    const key = symbolKey(name);
    const local = (this.byFile.get(path) ?? []).filter((nodeId) => {
      const node = this.nodes.get(nodeId);
      return node !== undefined && node.kind === KIND_CLASS && symbolKey(node.label) === key;
    });
    return local.length === 1 ? local[0] : null;
  }

  /**
   * A unique class called `name` that the caller file can actually see.
   *
   * Visible means declared in the caller's own file or in a file it imports. A
   * class elsewhere in the project is not evidence for a `Foo.bar()` there.
   * @param path - the caller's file path.
   * @param name - the receiver type name.
   * @returns the class node id, or null.
   */
  classVisibleFrom(path, name) {
    const key = symbolKey(name);
    const local = (this.byFile.get(path) ?? []).filter((nodeId) => {
      const node = this.nodes.get(nodeId);
      return node !== undefined && node.kind === KIND_CLASS && symbolKey(node.label) === key;
    });
    if (local.length > 0) return local.length === 1 ? local[0] : null;
    const imported = new Set(this.importedModules.get(path) ?? []);
    const hits = new Set((this.byName.get(`${KIND_CLASS}\u0000${key}`) ?? [])
      .filter((nodeId) => imported.has(this.nodes.get(nodeId)?.path)));
    return hits.size === 1 ? [...hits][0] : null;
  }

  /**
   * Files an import spec unambiguously identifies (`resolve.py:313-350`).
   *
   * The first variant that matches anything wins. When a variant matches more
   * than one file the import is genuinely ambiguous and the next variant is
   * tried; if nothing is unambiguous the result is empty and the caller records
   * an `external` node rather than inventing a link.
   *
   * @param module - the import specifier.
   * @param includeShortTail - whether the last segment may match on its own.
   * @param language - the importer's language, for the compatibility gate.
   * @returns the matched paths, usually zero or one.
   */
  resolveModule(module, includeShortTail = true, language = '') {
    for (const variant of moduleSuffixVariants(module, includeShortTail)) {
      let candidates = this.suffixIndex.get(variant);
      if (candidates === undefined || candidates.length === 0) continue;
      if (language !== '') {
        candidates = candidates.filter((path) => compatibleLanguage(language, this.languageOf(path)));
        if (candidates.length === 0) continue;
      }
      const unique = [...new Set(candidates)].sort(cmp);
      if (unique.length === 1) return [unique[0]];
      const exact = unique.filter((path) => path === variant || path.startsWith(`${variant}/`));
      if (exact.length === 1) return [exact[0]];
    }
    return [];
  }

  /**
   * The language recorded on a path's file node.
   * @param path - the corpus path.
   * @returns the language name, or ''.
   */
  languageOf(path) {
    return this.fileLanguages.get(path) ?? '';
  }
}

/* ------------------------------------------------------------------ *
 * Map helpers                                                        *
 * ------------------------------------------------------------------ */

/** Append to a Map-of-arrays, creating the array lazily. */
function push(map, key, value) {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** Get-or-create a nested `path → name → []` map entry. */
function pushBinding(table, path, name, value) {
  let byName = table.importBindings.get(path);
  if (byName === undefined) {
    byName = new Map();
    table.importBindings.set(path, byName);
  }
  const list = byName.get(name);
  if (list === undefined) byName.set(name, [value]);
  else if (!list.includes(value)) list.push(value);
}

/* ------------------------------------------------------------------ *
 * The pipeline                                                       *
 * ------------------------------------------------------------------ */

/**
 * Merge every extraction and resolve the cross-file facts.
 *
 * @param extractions - the per-file `Extraction` records, in collection order.
 * @param options - `{ withIndex = true }`. The symbol index is what the
 *   navigation API needs; setting it false skips that assembly.
 * @returns `{ nodes, edges, stats, index }`:
 *   `nodes` ordered `(-degree, path, start_line)`, `edges` ordered
 *   `(source, target, relation)`, `stats` in the exact shape of
 *   `resolve.py:936-946`, and `index` the per-occurrence symbol index.
 */
export function resolveGraph(extractions, options = {}) {
  const withIndex = options?.withIndex !== false;
  const list = Array.isArray(extractions) ? extractions : [];
  const table = new SymbolTable(list);

  /** `node id → node`; first writer wins (pass-1 order, `nodes.setdefault`). */
  const nodes = new Map();
  /** `source\u0000target\u0000relation → edge`; first writer wins for `line`. */
  const edges = new Map();
  const refs = [];
  const refKeys = new Set();
  /** The single external namespace shared by imports and base classes. */
  const externalSeen = new Map();

  const counters = {
    calls_extracted: 0,
    calls_inferred: 0,
    calls_dropped: 0,
    calls_project: 0,
  };

  /**
   * Add one edge, deduping on `(source, target, relation)`.
   *
   * `line` is first-writer-wins and confidence only ever upgrades — an
   * `EXTRACTED` reading outranks an `INFERRED` one between the same pair.
   */
  function addEdge(source, target, relation, confidence, line) {
    if (!source || !target || source === target) return;
    const key = `${source}\u0000${target}\u0000${relation}`;
    const existing = edges.get(key);
    if (existing === undefined) {
      edges.set(key, makeEdge(source, target, relation, confidence ?? CONF_EXTRACTED, line));
      return;
    }
    if ((confidence ?? CONF_EXTRACTED) === CONF_EXTRACTED && existing.confidence !== CONF_EXTRACTED) {
      existing.confidence = CONF_EXTRACTED;
    }
  }

  /**
   * Record one navigable occurrence, deduped on
   * `(path, line, column, name, kind, target, from_node_id)`.
   *
   * Unresolved rows are kept on purpose: the query layer can still offer
   * same-name candidates instead of pretending the identifier does not exist.
   */
  function addRef(entry) {
    const key = [
      entry.path, entry.line, entry.column, entry.name,
      entry.kind, entry.target, entry.fromNodeId,
    ].join('\u0000');
    if (refKeys.has(key)) return;
    refKeys.add(key);
    refs.push(entry);
  }

  /** The unique function/class `name` declared in `path` (case-sensitive). */
  function symbolInFile(path, name) {
    const hits = (table.byFile.get(path) ?? []).filter((nodeId) => {
      const node = nodes.get(nodeId);
      return node !== undefined
        && (node.kind === KIND_FUNCTION || node.kind === KIND_CLASS)
        && String(node.label ?? '') === name;
    });
    return hits.length === 1 ? hits[0] : null;
  }

  /** One external node per key, in the shared namespace. */
  function externalFor(key) {
    const existing = externalSeen.get(key);
    if (existing !== undefined) return existing;
    const id = makeExternalNode(key).id;
    externalSeen.set(key, id);
    if (!nodes.has(id)) nodes.set(id, makeExternalNode(key));
    return id;
  }

  // ---- 2. carry over per-file nodes and structural edges ---------------
  for (const extraction of list) {
    for (const node of extraction.nodes ?? []) {
      if (!nodes.has(node.id)) nodes.set(node.id, node);
    }
    for (const edge of extraction.edges ?? []) {
      addEdge(edge.source, edge.target, edge.relation, edge.confidence ?? CONF_EXTRACTED, edge.line);
    }
  }

  // ---- 3. imports ------------------------------------------------------
  for (const extraction of list) {
    const path = extraction.path;
    const sourceFile = fileNodeId(path);
    const importerLanguage = table.languageOf(path);
    for (const fact of extraction.rawImports ?? []) {
      const module = fact.module ?? '';
      const line = fact.line ?? null;
      const targets = table.resolveModule(
        module,
        !GATED_LANGUAGES.has(importerLanguage),
        importerLanguage,
      );

      if (targets.length === 0) {
        // An import of something we do not index is still a fact about the
        // project: one `external` node per module name makes "this project
        // depends on X" answerable. The relation is `uses`, not `imports` — an
        // edge count that mixes the two makes the project's own dependency
        // structure unreadable, because library edges outnumber the real ones.
        const key = module === '' ? '<unknown>' : module;
        const extId = externalFor(key);
        addEdge(sourceFile, extId, REL_USES, CONF_EXTRACTED, line);
        for (const local of importReceiverNames(fact)) {
          addRef({
            path,
            name: local,
            kind: 'import',
            line,
            column: fact.column ?? null,
            endLine: fact.end_line ?? null,
            endColumn: fact.end_column ?? null,
            fromNodeId: sourceFile,
            target: extId,
            confidence: CONF_EXTRACTED,
          });
        }
        continue;
      }

      const relation = fact.kind === 'from' ? REL_IMPORTS_FROM : REL_IMPORTS;
      for (const local of importLocalNames(fact)) {
        const original = importOriginalName(fact, local);
        if (original !== '' && original !== local) {
          // `from app.service import load as load_service` binds the alias while
          // the declaration is still labelled `load`.
          let originals = table.importOriginals.get(path);
          if (originals === undefined) {
            originals = new Map();
            table.importOriginals.set(path, originals);
          }
          originals.set(local, original);
        }
      }

      for (const targetFile of targets) {
        addEdge(sourceFile, fileNodeId(targetFile), relation, CONF_EXTRACTED, line);
        for (const name of importReceiverNames(fact)) {
          pushBinding(table, path, name, targetFile);
          const original = importOriginalName(fact, name);
          // `from x import helper` names the symbol, so the editor should land on
          // its definition rather than the module header.
          const target = (fact.kind === 'from' ? symbolInFile(targetFile, original) : null)
            ?? fileNodeId(targetFile);
          addRef({
            path,
            name,
            kind: 'import',
            line,
            column: fact.column ?? null,
            endLine: fact.end_line ?? null,
            endColumn: fact.end_column ?? null,
            fromNodeId: sourceFile,
            target,
            confidence: CONF_EXTRACTED,
          });
        }
        push(table.importedModules, path, targetFile);

        // `from app.storage import repo` imports a *submodule*, not a symbol:
        // the generic rule binds `repo` to `app/storage/__init__.py`, which
        // declares nothing useful, so `repo.get_project()` would never resolve.
        if (fact.kind !== 'from') continue;
        const base = String(fact.module ?? '').trim();
        for (const local of importLocalNames(fact)) {
          const original = importOriginalName(fact, local);
          const spec = base !== '' && !base.startsWith('.')
            ? `${base}.${original}`
            : `${base}/${original}`;
          for (const subFile of table.resolveModule(
            spec,
            !GATED_LANGUAGES.has(table.languageOf(path)),
            table.languageOf(path),
          )) {
            if (subFile === targetFile) continue;
            addEdge(sourceFile, fileNodeId(subFile), REL_IMPORTS_FROM, CONF_EXTRACTED, line);
            pushBinding(table, path, local, subFile);
            push(table.importedModules, path, subFile);
          }
        }
      }
    }
  }

  // ---- 4. inheritance --------------------------------------------------
  for (const extraction of list) {
    for (const fact of extraction.rawInherits ?? []) {
      // `Generic[T]` / `Base[int]` / `Base(x)`: the resolvable part is the head.
      const head = String(fact.base ?? '').split(/[[(<]/u)[0].trim();
      if (head === '') continue;
      let target = table.unique(KIND_CLASS, head);
      if (target === null) {
        // A base outside the corpus (`BaseModel`, `TypedDict`) still describes
        // the shape of the project, so it becomes an external node rather than a
        // dropped edge — and it stays `EXTRACTED`, because the `extends` clause
        // was read, not inferred.
        const key = head.includes('.') ? head.slice(head.lastIndexOf('.') + 1) : head;
        target = externalFor(key);
      }
      addEdge(fact.child_id, target, REL_INHERITS, CONF_EXTRACTED, fact.line ?? null);
      addRef({
        path: extraction.path,
        name: head,
        kind: 'base',
        line: fact.line ?? 1,
        column: fact.column ?? null,
        endLine: fact.end_line ?? null,
        endColumn: fact.end_column ?? null,
        fromNodeId: fact.child_id,
        target,
        confidence: CONF_EXTRACTED,
      });
    }
  }

  // ---- 5. per-file local symbol index ----------------------------------
  /** `path → (normalized name → first node id)`; the nearest scope wins. */
  const localSymbols = new Map();
  /** `path → (normalized name → declaration count)`. */
  const localCounts = new Map();
  for (const [path, fileIds] of table.byFile) {
    const symbols = new Map();
    const counts = new Map();
    for (const nodeId of fileIds) {
      const node = nodes.get(nodeId);
      if (node === undefined) continue;
      if (node.kind !== KIND_FUNCTION && node.kind !== KIND_CLASS) continue;
      const key = symbolKey(node.label);
      if (key === '') continue;
      if (!symbols.has(key)) symbols.set(key, nodeId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    localSymbols.set(path, symbols);
    localCounts.set(path, counts);
  }

  /**
   * Resolve `module.func()` where `module` is an imported project module.
   *
   * This is the dominant cross-file call shape in Python (`repo.get_project()`,
   * `prompts.build_system_prompt()`) and the reason a name-only resolver misses so
   * much: the callee lives in a file the caller imports *under an alias*. The
   * alias was recorded when the import was resolved, so this is still a proof.
   */
  function resolveModuleMember(path, receiver, callee) {
    const key = symbolKey(callee);
    const modules = table.importBindings.get(path)?.get(receiver) ?? [];
    for (const targetFile of modules) {
      for (const nodeId of table.byFile.get(targetFile) ?? []) {
        const node = nodes.get(nodeId);
        if (node === undefined) continue;
        if (node.kind !== KIND_FUNCTION && node.kind !== KIND_CLASS) continue;
        if (symbolKey(node.label) === key) return nodeId;
      }
    }
    // `import app.services.paths` binds only the leading name, so a dotted
    // receiver may not be in the binding map. Fall back to every module the file
    // imports at all: if exactly one declares the callee, that is it.
    const hits = new Set();
    for (const targetFile of table.importedModules.get(path) ?? []) {
      for (const nodeId of table.byFile.get(targetFile) ?? []) {
        const node = nodes.get(nodeId);
        if (node === undefined) continue;
        if (node.kind !== KIND_FUNCTION && node.kind !== KIND_CLASS) continue;
        if (symbolKey(node.label) === key) hits.add(nodeId);
      }
    }
    return hits.size === 1 ? [...hits][0] : null;
  }

  /**
   * The node a bare name refers to, using only evidence the caller file has.
   *
   * Order: a same-file definition, then files this file explicitly imports. A
   * unique name elsewhere in the project is *not* evidence for Python/JS/TS: a
   * file that never imports `helper` cannot be said to call it. Languages without
   * an import parser keep the global-unique fallback.
   */
  function resolveBare(path, callee) {
    const key = symbolKey(callee);
    if (key === '') return null;
    if (localCounts.get(path)?.get(key) === 1) {
      const hit = localSymbols.get(path)?.get(key);
      if (hit !== undefined) return hit;
    }
    const importedName = table.importOriginals.get(path)?.get(callee) ?? callee;
    const importedKey = symbolKey(importedName);
    const hits = new Set();
    for (const importedFile of table.importBindings.get(path)?.get(callee) ?? []) {
      for (const nodeId of table.byFile.get(importedFile) ?? []) {
        const node = nodes.get(nodeId);
        if (node === undefined) continue;
        if (node.kind !== KIND_FUNCTION && node.kind !== KIND_CLASS) continue;
        if (symbolKey(node.label) === importedKey) hits.add(nodeId);
      }
    }
    if (hits.size > 0) return hits.size === 1 ? [...hits][0] : null;
    if (GATED_LANGUAGES.has(table.languageOf(path))) return null;
    return table.unique(KIND_FUNCTION, importedName) ?? table.unique(KIND_CLASS, importedName);
  }

  // ---- 6. calls --------------------------------------------------------
  for (const extraction of list) {
    const path = extraction.path;
    const language = table.languageOf(path);
    for (const fact of extraction.rawCalls ?? []) {
      const callee = String(fact.callee ?? '');
      const key = symbolKey(callee);
      if (key === '' || BORING_CALLEES.has(callee)) continue;
      const callerId = fact.caller_id;
      const line = fact.line ?? null;
      const refLine = fact.name_line || line || 1;
      const refEndLine = fact.name_end_line || refLine;
      let target = null;

      const refBase = {
        path,
        name: callee,
        kind: 'call',
        line: refLine,
        column: fact.name_col ?? null,
        endLine: refEndLine,
        endColumn: fact.name_end_col ?? null,
        fromNodeId: callerId,
      };

      if (fact.is_member_call === true) {
        const receiverType = fact.receiver_type ?? null;
        const receiverName = String(fact.receiver ?? '');
        if (receiverType === '<self>') {
          // `self`/`this`/`cls`: the owner is the caller's exact class node, not
          // whichever class happens to share the name.
          let classId = fact.caller_class_id ?? null;
          if (!classId && fact.caller_class) classId = table.classDeclaredInFile(path, fact.caller_class);
          if (classId) target = table.methodOfClass(classId, callee);
        } else if (receiverType) {
          // `Foo.bar()`: `Foo` must be declared in this file or in a file this
          // one imports. Elsewhere in the project is not enough.
          const classId = GATED_LANGUAGES.has(language)
            ? table.classVisibleFrom(path, receiverType)
            : table.unique(KIND_CLASS, receiverType);
          if (classId) target = table.methodOfClass(classId, callee);
        }
        if (target === null && receiverName !== '' && !['self', 'this', 'cls'].includes(receiverName)) {
          // `repo.get_project()`: the receiver is an imported module.
          target = resolveModuleMember(path, receiverName, callee);
        }
        if (target === null && receiverType) {
          // The receiver was capitalised but is not a known class; it may still
          // be a module alias written capitalised.
          target = resolveModuleMember(path, receiverName, callee);
        }
        if (target === null) {
          // A member call on an untyped value cannot be attributed. It is still a
          // navigable identifier: keep the occurrence with no target so the
          // editor can offer same-name candidates.
          counters.calls_dropped += 1;
          const ambiguous = table.candidates(KIND_FUNCTION, callee).length > 0
            || table.candidates(KIND_CLASS, callee).length > 0;
          addRef({ ...refBase, target: null, confidence: ambiguous ? CONF_AMBIGUOUS : CONF_UNRESOLVED });
          continue;
        }
        addEdge(callerId, target, REL_CALLS, CONF_EXTRACTED, line);
        addRef({ ...refBase, target, confidence: CONF_EXTRACTED });
        counters.calls_extracted += 1;
        counters.calls_project += 1;
        continue;
      }

      target = resolveBare(path, callee);
      if (target === null) {
        counters.calls_dropped += 1;
        // Distinguish "no such project symbol" (fine to drop) from "project
        // symbol exists but ambiguous" (a real miss).
        const ambiguous = table.candidates(KIND_FUNCTION, callee).length > 0
          || table.candidates(KIND_CLASS, callee).length > 0;
        if (ambiguous) counters.calls_project += 1;
        addRef({ ...refBase, target: null, confidence: ambiguous ? CONF_AMBIGUOUS : CONF_UNRESOLVED });
        continue;
      }
      addEdge(callerId, target, REL_CALLS, CONF_EXTRACTED, line);
      addRef({ ...refBase, target, confidence: CONF_EXTRACTED });
      counters.calls_extracted += 1;
      counters.calls_project += 1;
    }
  }

  // ---- 7. indirect calls -----------------------------------------------
  // `map(handler)` / `submit(process)` / `Thread(target=run)` reference a
  // callable without calling it here. The scanner records this explicitly, so
  // this pass never has to infer it from a failed lookup.
  for (const extraction of list) {
    for (const fact of extraction.rawCalls ?? []) {
      if (fact.indirect !== true) continue;
      const callee = String(fact.callee ?? '');
      const target = resolveBare(extraction.path, callee);
      if (target === null || target === fact.caller_id) continue;
      addEdge(fact.caller_id, target, REL_INDIRECT_CALL, CONF_INFERRED, fact.line ?? null);
      addRef({
        path: extraction.path,
        name: callee,
        kind: 'ref',
        line: fact.name_line || fact.line || 1,
        column: fact.name_col ?? null,
        endLine: fact.name_end_line ?? null,
        endColumn: fact.name_end_col ?? null,
        fromNodeId: fact.caller_id,
        target,
        confidence: CONF_INFERRED,
      });
      // Only an `indirect_call` edge can be INFERRED, and this is the only place
      // one is emitted, so counting here keeps the field honest. The original
      // initialises this counter and never increments it (spec §14.1); fixing it
      // is a deliberate, one-line deviation and is reported as such.
      counters.calls_inferred += 1;
    }
  }

  // ---- 8. degree, sort, stats, symbol index ----------------------------
  const degree = new Map();
  for (const edge of edges.values()) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const nodeList = [];
  for (const node of nodes.values()) {
    nodeList.push({ ...node, degree: degree.get(node.id) ?? 0 });
  }
  nodeList.sort((a, b) => (
    (b.degree - a.degree)
    || cmp(a.path ?? '', b.path ?? '')
    || ((a.start_line ?? 0) - (b.start_line ?? 0))
  ));

  const edgeList = [...edges.values()].sort((a, b) => (
    cmp(a.source, b.source) || cmp(a.target, b.target) || cmp(a.relation, b.relation)
  ));

  const extracted = edgeList.filter((edge) => edge.confidence === CONF_EXTRACTED).length;
  const relationCounts = new Map();
  for (const edge of edgeList) {
    relationCounts.set(edge.relation, (relationCounts.get(edge.relation) ?? 0) + 1);
  }
  const byRelation = Object.fromEntries(
    [...relationCounts.entries()].sort((a, b) => b[1] - a[1]),
  );

  const stats = {
    files: list.length,
    symbols: nodeList.filter((node) => DECLARATION_KINDS.has(node.kind)).length,
    rationale: nodeList.filter((node) => node.kind === KIND_RATIONALE).length,
    external: nodeList.filter((node) => node.kind === KIND_EXTERNAL).length,
    edges: edgeList.length,
    extracted,
    inferred: edgeList.length - extracted,
    by_relation: byRelation,
    ...counters,
  };

  const index = withIndex ? buildSymbolIndex(nodeList, refs, nodes) : emptyIndex();
  return { nodes: nodeList, edges: edgeList, stats, index };
}

/* ------------------------------------------------------------------ *
 * Symbol index                                                       *
 * ------------------------------------------------------------------ */

/** An index with no rows, so callers never have to null-check. */
function emptyIndex() {
  return {
    defs: [],
    refs: [],
    byNode: new Map(),
    byPath: new Map(),
    byNormalized: new Map(),
    refsByTarget: new Map(),
  };
}

/**
 * Assemble the per-occurrence symbol index.
 *
 * The graph deliberately keeps one edge per `(caller, callee)` pair, so it cannot
 * answer "what is the identifier under the cursor?" when the same function is
 * called twenty times. This index stores the missing dimension.
 *
 * @param nodeList - the ordered nodes.
 * @param refs - every recorded occurrence.
 * @param nodes - `node id → node`, used for the rationale join.
 * @returns the index object documented on {@link resolveGraph}.
 */
/**
 * Rebuild the symbol index from two serializable arrays.
 *
 * Exported because the built document is persisted as JSON, and the index is five
 * `Map`s — `JSON.stringify` turns a `Map` into `{}` without warning, so a document
 * saved and reloaded would answer nothing. Rebuilding is one fold over the arrays
 * that are already stored, so the cache stays plain JSON a human can inspect.
 *
 * @param nodes - the resolved node array.
 * @param refs - the recorded reference array.
 * @returns the symbol index.
 */
export function rebuildSymbolIndex(nodes, refs) {
  const byId = new Map();
  for (const node of nodes ?? []) byId.set(node.id, node);
  return buildSymbolIndex(nodes ?? [], refs ?? [], byId);
}

function buildSymbolIndex(nodeList, refs, nodes) {
  // Rationale nodes already hang off the symbol they explain; joining them here
  // lets a hover card quote the author's own docstring without a second read.
  const docByOwner = new Map();
  for (const node of nodes.values()) {
    if (node.kind !== KIND_RATIONALE || !node.parent) continue;
    push(docByOwner, node.parent, String(node.label ?? ''));
  }

  const defs = [];
  const byNode = new Map();
  const byPath = new Map();
  const byNormalized = new Map();

  for (const node of nodeList) {
    if (node.kind !== KIND_FILE && node.kind !== KIND_CLASS && node.kind !== KIND_FUNCTION) continue;
    const isFile = node.kind === KIND_FILE;
    const label = isFile ? String(node.path ?? '') : String(node.label ?? '');
    if (label === '') continue;
    const row = {
      id: node.id,
      nodeId: node.id,
      label,
      name: label,
      normalized: isFile ? label.toLowerCase() : symbolKey(label),
      kind: node.kind,
      path: node.path ?? '',
      line: Math.trunc(Number(node.start_line) || 1),
      column: Math.trunc(Number(node.start_col) || 1),
      endLine: Math.trunc(Number(node.end_line) || Number(node.start_line) || 1),
      endColumn: Math.trunc(Number(node.end_col) || 1),
      parent: node.parent ?? null,
      signature: String(node.signature ?? ''),
      doc: (docByOwner.get(node.id) ?? []).join(' ').slice(0, 600),
      language: String(node.language ?? ''),
    };
    defs.push(row);
    byNode.set(row.id, row);
    push(byPath, row.path, row);
    push(byNormalized, row.normalized, row);
  }
  for (const rows of byPath.values()) {
    rows.sort((a, b) => (a.line - b.line) || (a.column - b.column) || cmp(a.id, b.id));
  }

  const refsByTarget = new Map();
  const enriched = refs.map((ref) => {
    const from = byNode.get(ref.fromNodeId);
    const row = {
      ...ref,
      normalized: symbolKey(ref.name),
      fromLabel: from === undefined ? '' : from.label,
      fromKind: from === undefined ? '' : from.kind,
      fromPath: from === undefined ? '' : from.path,
    };
    if (row.target) push(refsByTarget, row.target, row);
    return row;
  });
  for (const rows of refsByTarget.values()) {
    rows.sort((a, b) => (cmp(a.path, b.path) || (a.line - b.line) || ((a.column ?? 0) - (b.column ?? 0))));
  }

  return { defs, refs: enriched, byNode, byPath, byNormalized, refsByTarget };
}

/**
 * Definitions that start on `line` in `path` (`spec §11.2`).
 *
 * F12 anywhere on a `def`/`class` line should land on that definition, so the
 * match is line-based. When two definitions share a line (a one-line class with a
 * method) the smallest span is the most specific one.
 *
 * @param index - the index returned by {@link resolveGraph}.
 * @param path - the corpus-relative path.
 * @param line - the 1-based line.
 * @returns the definition rows, smallest span first.
 */
export function definitionsAt(index, path, line) {
  const rows = (index?.byPath?.get(String(path ?? '')) ?? []).filter((row) => row.line === Number(line));
  return rows.slice().sort((a, b) => (
    ((a.endLine - a.line) - (b.endLine - b.line))
    || ((a.endColumn - a.column) - (b.endColumn - b.column))
    || (a.column - b.column)
  ));
}

/**
 * Every occurrence that resolved to `nodeId`, with its enclosing symbol
 * (`spec §11.2`).
 * @param index - the index returned by {@link resolveGraph}.
 * @param nodeId - the target node id.
 * @param limit - maximum rows (default 500).
 * @returns `{ locations, truncated }`.
 */
export function refsTo(index, nodeId, limit = 500) {
  const rows = index?.refsByTarget?.get(String(nodeId ?? '')) ?? [];
  const capped = Math.max(1, Math.trunc(Number(limit) || 500));
  return {
    locations: rows.slice(0, capped),
    truncated: rows.length > capped,
  };
}

/**
 * Declarations matching a name (`spec §11.2`).
 *
 * A case-sensitive match is tried first and only the fallback is normalized,
 * because `settings` is not the class `Settings`.
 *
 * @param index - the index returned by {@link resolveGraph}.
 * @param name - the name to resolve.
 * @param kinds - which kinds count (default class + function).
 * @param limit - maximum rows (default 20).
 * @returns the matching rows, ordered `(path, line)`.
 */
export function definitionsByName(index, name, kinds = [KIND_FUNCTION, KIND_CLASS], limit = 20) {
  const wanted = String(name ?? '');
  const allowed = new Set(kinds);
  const all = index?.defs ?? [];
  const byPathLine = (a, b) => cmp(a.path, b.path) || (a.line - b.line);
  const exact = all.filter((row) => allowed.has(row.kind) && row.name === wanted);
  const rows = exact.length > 0
    ? exact
    : all.filter((row) => allowed.has(row.kind) && row.normalized === symbolKey(wanted));
  return rows.slice().sort(byPathLine).slice(0, Math.max(1, Math.trunc(Number(limit) || 20)));
}

/**
 * Normalized substring search over declarations (`spec §11.2`).
 *
 * Ordering is exact match, then prefix match, then the rest; within a bucket the
 * shorter name wins, which is what puts `run` above `run_all` for the query `run`.
 *
 * @param index - the index returned by {@link resolveGraph}.
 * @param query - the search text.
 * @param limit - maximum rows (default 50).
 * @returns the matching rows.
 */
export function searchDefinitions(index, query, limit = 50) {
  const wanted = symbolKey(query);
  if (wanted === '') return [];
  const rank = (row) => {
    if (row.normalized === wanted) return 0;
    if (row.normalized.startsWith(wanted)) return 1;
    return 2;
  };
  return (index?.defs ?? [])
    .filter((row) => (row.kind === KIND_FUNCTION || row.kind === KIND_CLASS) && row.normalized.includes(wanted))
    .sort((a, b) => (
      (rank(a) - rank(b))
      || (a.name.length - b.name.length)
      || cmp(a.name, b.name)
    ))
    .slice(0, Math.max(1, Math.trunc(Number(limit) || 50)))
    .map((row) => ({ ...row, score: Math.max(1, 100 - rank(row) * 10 - Math.min(50, row.name.length)) }));
}
