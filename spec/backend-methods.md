# CodeSlice backend — algorithm port specification

Target: re-implement CodeSlice's backend algorithms in **dependency-free JavaScript** in a Node plugin (no Python, no tree-sitter, no network, no numpy, no networkx, no SQLite). Source: `D:\CodeSplit\backend\app` (read-only) + `D:\CodeSplit\docs`. Refs are `path:line` relative to that app dir.

Lines are **1-based inclusive**; columns 1-based, an *end* column points one past the last char. `⚠` = quirk a port must not silently "fix" (§14).

## 0. Module map

`graph/__init__.py`(50) `SCHEMA_VERSION=5`; `ast/__init__.py`(168) vocabularies + `LanguageConfig` + `make_node_id`; `ast/languages.py`(350) per-language tables + import parsers; `ast/engine.py`(577) pass 1; `ast/resolve.py`(952) pass 2; `builder.py`(133) walking; `cluster.py`(192) Louvain + labels; `store.py`(729) persistence/epoch/layouts; `service.py`(167) façade; `query.py`(555) scoring/render; `symbols.py`(288) symbol index; `notes.py`(218) notes graph; `relationships.py`(149) evidence+LLM; `retrieval/tokenize.py`(70) bigrams; `retrieval/hybrid.py`(187) FTS+cosine+RRF; `indexing/languages.py`(144); `chunker.py`(348); `indexer.py`(442); `services/paths.py`(220) ignore lists; `anchors.py`(140); `notegen.py`(782); `notes_index.py`(232); `notes_export.py`(105); `api/navigation.py`(361); `api/graph_code.py`(343); `api/notes.py`(290); `api/graph_api.py`(82, **not** the code graph); `core/db.py`(444).

Two independent corpora: retrieval (`walk → language → chunk`, reads `chunks`) and graph (`pass1 → pass2 → cluster → persist → query`, re-parses source, never reads `chunks` — `builder.py:48-81`). Only ignore rules are shared (`builder.py:39-43`).

## 1. Graph model

### 1.1 Node kinds (`ast/__init__.py:52-57`)

| kind | producer | ref |
|---|---|---|
| `file` | engine, one per parsed file | `engine.py:353-366` |
| `class` | engine | `engine.py:408-454` |
| `function` | engine, **also methods** | `engine.py:456-489` |
| `rationale` | docstring / marker comment | `engine.py:369-386`, `549-553`, `559-574` |
| `external` | **resolve only** | `resolve.py:481-495`, `591-606` |
| `module` | **never** | `resolve.py:35` imports it only to exclude it from the name index |
| `note` | notes graph only | `notes.py:70-82` |

No `interface`/`struct`/`enum`/`trait` kinds — all map to `class` via `class_types`. No `variable` kind: module-level assignments never become nodes.

### 1.2 Node fields

All nodes: `id, label, kind, path, start_line, end_line, parent`.

```json
// file (engine.py:355-366)
{"id":"<path>::file::__file__::1","label":"<basename>","kind":"file","path":"<rel>","start_line":1,"start_col":1,"end_line":<newlines+1>,"end_col":1,"language":"<config.name>","parent":null}
// class | function (engine.py:414-427 | 464-477) — identical shape
{"id","label","kind","path","start_line","start_col","end_line","end_col","signature","language","parent"}
// rationale (engine.py:374-385)
{"id":"<path>::rationale::<text[:40]>::<line>","label":"<full text ≤400>","kind":"rationale","path","start_line":line,"end_line":line,"language","parent":"<owner id>","origin":"docstring"|"comment"}
// external (resolve.py:483-495, 591-606)
{"id":"<external>::external::<key>::1","label":key,"kind":"external","path":"","start_line":0,"end_line":0,"parent":null,"external":true}
// notes graph (notes.py:68-83)
{"id":"note://<id>","label":title,"kind":"note","path":"note://<id>","start_line":0,"end_line":0,"degree","community","community_label","note_id","content_md","project_name"}
```

File `end_line` = `source.count(b"\n")+1` after appending a trailing `\n` when absent (`engine.py:318-321`, `:354`). `signature` = first line of the declaration, stripped, ≤200 chars (`engine.py:90-93`).

A rationale id embeds `text[:40]` while `label` holds the whole text, so two rationales sharing a 40-char prefix on one line collide and the second is silently dropped by the engine's `seen` set (`engine.py:334-338`).

Added after resolve (`resolve.py:881-889`): `degree` = incident edge count, once per endpoint. After cluster (`cluster.py:180-191`): `community` int, `community_label` str.

External `key` = the raw module spec for imports (`module or "<unknown>"`) or the **last dotted segment** of a base class name. Both share one `external_seen` map, so `import os` and `class X(os.PathLike)` yield the same node only when the keys collide exactly.

### 1.3 Relations — the complete emitted set (`ast/__init__.py:32-43`)

| relation | src → tgt | conf | ref |
|---|---|---|---|
| `contains` | file→class, file→fn, class→nested class, fn→nested fn | EXTRACTED | `engine.py:428`, `481-482` |
| `method` | class → fn whose owner is a class | EXTRACTED | `engine.py:481-482` |
| `rationale_for` | rationale → owning node | EXTRACTED | `engine.py:386` |
| `imports` | file → file (plain `import x`) | EXTRACTED | `resolve.py:512-518` |
| `imports_from` | file → file (`from x import y`; also submodules) | EXTRACTED | `resolve.py:512-518`, `568` |
| `uses` | file → external node | EXTRACTED | `resolve.py:496` |
| `inherits` | class → class \| external | EXTRACTED | `resolve.py:607` |
| `calls` | caller → fn/class | EXTRACTED | `resolve.py:791`, `834` |
| `indirect_call` | caller → fn/class | **INFERRED** | `resolve.py:866` |

⚠ `references`, `implements`, `declares` are declared but **never emitted**; `KIND_MODULE` has no producer. Emitting them changes every `stats.by_relation` and every UI legend.

`uses` (not `imports`) is used for out-of-corpus modules on purpose (`resolve.py:474-477`): mixing "depends on fastapi" into `imports` makes the project's own dependency structure unreadable. `method` vs `contains` (`engine.py:478-482`): `contains` = lexically inside, `method` = this class owns this function; the resolver uses `method` to walk `Foo.bar()` → method node without scanning the tree.

Notes graph (`notes.py:98-120`): `same_folder`, `same_project`, `shared_reference`, all EXTRACTED, each carrying `evidence: []` (a field the code graph never has).

Edge shape: `{source, target, relation, confidence, line}`; `line` may be `null`.

### 1.4 Confidence vocabulary (`ast/__init__.py:45-48`)

`EXTRACTED`, `INFERRED`, `AMBIGUOUS`, `UNRESOLVED`.

- **Graph edges**: only EXTRACTED and INFERRED (INFERRED only on `indirect_call`).
- **`symbol_refs.confidence`**: all four. AMBIGUOUS = a symbol of that name exists but more
  than one; UNRESOLVED = nothing in the corpus has it. Both keep `target_node_id = NULL`
  (`resolve.py:774-789`, `821-832`).
- **Navigation API** uses a *third* vocabulary: `"EXACT"` (cursor on a definition,
  `navigation.py:194`), `"INFERRED"` (`:203`, `:207`), `"AMBIGUOUS"` (`:186`, `:207`), plus
  the raw ref confidence for resolved refs (`:173`). The frontend switches on these strings.

Weakest-link ranks (`query.py:481`): `{EXTRACTED:3, INFERRED:2, AMBIGUOUS:1}`, else 0.

### 1.5 Direction

`source → target` is an active verb. `rationale -rationale_for-> owner`: the rationale is the **source**, so "what explains X" is an *incoming* query on the owner (`service.py:150-163` filters `edge["target"] == anchor_id`). `inherits`: child → base. The renderer prints `-->` for outward and `<--` for inward traversal (`query.py:319-322`), so one edge can appear under both endpoints with opposite arrows.

### 1.6 Node ids (`ast/__init__.py:120-136`)

```js
const makeNodeId = (path, kind, name, line) =>
  `${path}::${kind}::${(name ?? "").trim() || "__file__"}::${Math.trunc(line)}`;
const fileNodeId = (path) => makeNodeId(path, "file", "__file__", 1);
```

The line number is part of identity, so two same-named methods in one file are two nodes; overloads never collapse. `path` is the **relative POSIX path** (`builder.py:66` `as_posix()`), also the join key to `symbol_defs.path`. `__file__` keeps a file node distinct from a symbol named like its file. Rationale ids are **not stable across edits** (they embed `text[:40]`). External ids embed the raw module spec, so `import a.b` and `import a.c` give two nodes.

### 1.7 Edge key

No persisted per-edge key. `resolve.add_edge` dedupes on `(source,target,relation)` (`resolve.py:368-383`):

```js
if (!existing) edges.set(key, {source, target, relation, confidence, line});
else if (confidence === "EXTRACTED" && existing.confidence !== "EXTRACTED")
  existing.confidence = "EXTRACTED";       // upgrade only, never downgrade
```

`line` is **first-writer-wins**. Final order: sort by `(source, target, relation)`, plain string comparison (`resolve.py:891`).

### 1.8 `topology_key` (`store.py:112-141`)

```js
h = sha256(); h.update("layout-v" + LAYOUT_VERSION /*3*/); h.update(0x00);
for (n of nodes.sort(by id))  { h.update(n.id); h.update(0x00); }
for (e of edges.sort(by (src,tgt,rel))) {
  h.update(e.source); h.update(0x01); h.update(e.target);
  h.update(0x01);     h.update(e.relation); h.update(0x00);
}
return hex(h).slice(0, 32);
```

Node ids contribute one trailing NUL each; edges use `0x01` between fields and `0x00` at the end. Community assignment, labels and note titles do **not** participate — recolouring does not invalidate a layout, adding one edge does. Same function for both graphs.

### 1.9 Freshness marker vs content fingerprint

`freshness_token` / `_token_from_excluded` (`store.py:265-277`, `337-342`) — **only from DB columns**: `"no-project"` when the project row is gone, else `gv{TOKEN_VERSION=1}:s{SCHEMA_VERSION=5}:x{sha256(str(excluded||"")).slice(0,16)}`.

`index_fingerprint` / `_sources_digest` (`:280-307`) — expensive, only for the one-time legacy upgrade: `sha256("schema:{SCHEMA_VERSION}\x00" + for each sorted (rel,data): rel,0x00,sha256(data))`.

## 2. Two-pass extraction

### 2.1 File collection (`builder.py:48-81`)

1. `os.walk(root)`, `onerror` ignored; prune dirs where `paths.is_ignored_dir` (§4.4).
2. Skip when the **lowercased suffix** ∈ `BINARY_SUFFIXES ∪ IGNORED_SUFFIXES`.
3. Skip when `config_for(rel) === null` — ⚠ no extractor ⇒ **no file node at all**
   (`:50-54`), so the graph is silently partial vs the retrieval index.
4. Skip `size > MAX_FILE_BYTES = 1_500_000`.
5. Skip when `paths.looks_binary(data)` = `b"\x00"` in `data[:8192]` (`paths.py:201-207`).
6. Sort by relative path → extraction order, hence symbol-table insertion order, is
   deterministic.

### 2.2 Pass 1 — per-file output

`Extraction` (`ast/__init__.py:141-167`): `{path, nodes, edges, raw_calls, raw_inherits, raw_imports, error}`.

```
raw_calls (engine.py:192-233, 494-502)
  {caller_id, caller_kind, caller_class (name|null), caller_class_id (id|null),
   callee, receiver ("" | "self"/"this"/"cls" | receiver text),
   receiver_type (null | "<self>" | "<CapitalisedReceiver>"), is_member_call,
   indirect (true only for the argument form),
   line,                                        // line of the call
   name_line, name_col, name_end_line, name_end_col}     // span of the callee identifier
raw_imports (languages.py:61-70, 78-87, 158-171)
  {kind:"from"|"plain", module, names:[original], aliases:{local→original}, reexport,
   line, column, end_line, end_column}           // statement-level span
raw_inherits (engine.py:441-452)
  {child_id, child_name, base, line, column, end_line, end_column, is_interface}
  // is_interface computed, NEVER read
```

Walk over named children (`engine.py:389-555`), in this order:

| # | condition | effect |
|---|---|---|
| 1 | `ctype ∈ import_types` | run `import_parser` → `raw_imports` with `source_id = fileNodeId`; **if `export_statement`, also recurse into it** (`:404-406`) |
| 2 | `ctype ∈ class_types` | emit class node, `contains` from owner, docstring rationale, superclass facts, recurse with `owner = class` |
| 3 | `ctype ∈ function_types` | name via `_function_name`; **if unnamed, recurse with the same owner** (`:458-463`); else emit, `method`/`contains`, docstring, recurse |
| 4 | `ctype ∈ call_types` | `_callee_facts` → `raw_calls`; scan arguments for bare identifiers → `indirect`; then **recurse** |
| 5 | `ctype ∈ comment_types` | `_marker_rationale` → rationale, `origin:"comment"`, on the current owner |
| 6 | else | recurse |

A call inside a function is reached by step 4's recursion **with the function as owner** — that is what makes `caller_id` correct.

**Callee shapes** (`engine.py:173-245`), in order:

1. **JSX** (`jsx_self_closing_element`, `jsx_opening_element`): name child must be
   `identifier` and **start uppercase**; lowercase = intrinsic HTML, skipped. Emits a
   bare-call fact. Closing tags are absent from `call_types` so a component is not counted
   twice (`:53-55`).
2. `func_node = child_by_field(call_function_field)`, else `"constructor"`, else `"name"`
   (`:202-206`) — `new Foo()` keeps it in `constructor`; Java's `method_invocation` names it
   in `name`.
3. If `func_node.type ∈ accessor_types` → member call; `attr` required; `receiver` = text of
   `accessor_object_field`. `receiver_type` = `"<self>"` iff receiver ∈ `{self,this,cls}`;
   else the receiver text iff its **first char is uppercase**; else null.
4. Otherwise the func node must match `^[A-Za-z_]\w*$`, else the call is dropped
   (`:236-237`).

**Name recovery for anonymous functions** (`:248-297`): field `name_field`; failing that, and **only if the node is not `arrow_function`**, the first child of type `identifier|property_identifier|name`. Else one wrapper level of parent binding: `variable_declarator|public_field_definition|field_definition` → its `name` field; `assignment_expression` → `left` (identifier/property_identifier) or `left.property` (member_expression); `call_expression|arguments` → if the wrapper call's `function` is an identifier named `memo|forwardRef|observer` **and** the call's parent is a `variable_declarator`, that declarator's `name`. Result must match `^[A-Za-z_$][\w$]*$`. Nothing deeper is attempted.

**Docstrings** (`:133-156`): the first *named* child of the body decides. If `expression_statement`, a child of type `string|string_literal|template_string` is the docstring and anything else means "none"; if the child itself is one of those types it is the docstring; otherwise none. `_strip_string_delimiters` (`:113-130`) strips a leading `[rRbBuUfF]{0,2}`, removes a matching `"""`/`'''`/`"`/`'`/`` ` `` pair, strips each line, joins non-empty lines with one space.

**Marker rationale** (`:159-170`): strip leading `#`, `//`, `/*`, `*`, `--` (all that apply, in that order), then trailing `*/`, then match the **uppercased** prefix against `RATIONALE_MARKERS` (`ast/__init__.py:63-77`): `NOTE:`, `WHY:`, `RATIONALE:`, `IMPORTANT:`, `WARNING:`, `HACK:`, `TODO:`, `FIXME:`, `XXX:`, `注意:`, `原因:`, `说明:`, `重要:`. Body = text after the marker, or null if empty.

Rationale body: whitespace collapsed (`" ".join(body.split())`), truncated to `MAX_RATIONALE_CHARS = 400`. **No distance check exists** — `MAX_RATIONALE_DISTANCE = 3` (`:51`) is never referenced (§14.1).

**File header block** (`:559-574`): scan the first **12** lines; skip leading blanks; while a line starts `#` and carries a marker, collect the marker body; stop at the first non-`#` line or at a blank line once ≥1 was collected. Join with spaces into one rationale owned by the file node at line 1.

### 2.3 Pass 2 — `resolve.resolve(extractions, with_index)` (`resolve.py:353-951`)

```
1 SymbolTable(extractions)                     :361, 187-235
2 carry over all nodes + edges                 :440-450
3 imports (creates externals + bindings)       :453-571
4 inheritance                                  :574-619
5 per-file local symbol index                  :676-691
6 calls                                        :726-848
7 indirect calls                               :859-878
8 degree, sort, stats, symbol index            :881-950
```

Imports come first because they *define the candidate set* for cross-file calls (`:16-18`).

### 2.4 The resolution ladder

**Bare call** — `resolve_bare` (`:693-724`):

| # | rule | condition | result |
|---|---|---|---|
| 1 | same-file definition | `local_counts[path][key] === 1` | `calls`/EXTRACTED |
| 2 | import-bound | among `import_bindings[path][callee]` files, the fn/class whose normalized label equals the **original** (de-aliased) name; only if exactly one distinct hit | `calls`/EXTRACTED |
| 3 | gated stop | caller language ∈ `{python, javascript, typescript}` → **null (drop)** | ref AMBIGUOUS/UNRESOLVED |
| 4 | global unique | else `unique(function,name) ?? unique(class,name)` | `calls`/EXTRACTED |

**Member call** (`:743-808`):

| # | receiver | rule |
|---|---|---|
| 1 | `receiver_type === "<self>"` | `class_id = caller_class_id` else `class_declared_in_file(path, caller_class)`; target = `method_of_class(class_id, callee)` |
| 2 | truthy `receiver_type` | gated: `class_visible_from`; else `unique(class, receiver_type)`; then `method_of_class` |
| 3 | fallback A | if `receiver` non-empty and not `self/this/cls`: `resolve_module_member(path, receiver, callee)` |
| 4 | fallback B | if still null and `receiver_type` truthy: `resolve_module_member` again |
| 5 | give up | edge dropped; ref with `target=null`, AMBIGUOUS if any fn/class of that name exists anywhere, else UNRESOLVED |

`resolve_module_member` (`:643-672`): (a) for each file in `import_bindings[path][receiver]`, return the **first** fn/class in `by_file[file]` whose normalized label matches — first match wins, not unique-only; (b) else over all `imported_modules[path]`, collect every hit and return it only if the deduped set has exactly one element.

### 2.5 Ambiguity policy

`SymbolTable.unique` (`:237-246`) returns null unless the candidate count is exactly 1, **including same-file duplicates** — "two `run` in one file means a bare `run()` cannot be attributed without type inference". On ambiguity the edge is **dropped** and a ref recorded (`builder.py:12-15`, `resolve.py:11-13`): a confidently wrong caller is read as fact; a missing one is only a gap.

`stats.calls_dropped` conflates two things (`:622-641`): untyped member calls on library values (correct to drop) and genuinely ambiguous bare names (a real miss). `stats.calls_project` is the denominator — calls whose callee *is* declared in the corpus — so `calls_extracted / calls_project` is the metric worth watching.

```json
stats (resolve.py:936-946)
{"files":n,"symbols":n,"rationale":n,"external":n,"edges":n,"extracted":n,"inferred":n,
 "by_relation":{"<rel>":n,...},        // sorted count desc
 "calls_extracted":n,"calls_inferred":0,"calls_dropped":n,"calls_project":n}
```

⚠ `calls_inferred` is initialised and never incremented, though `indirect_call` edges are INFERRED (`:636-641`, `:866`). Node order (`:889`): `(-degree, path ?? "", start_line ?? 0)`.

### 2.6 Degradation

No files → `nodes=[]`, `edges=[]`, zero stats; `service.py:54-55` returns `"项目还没有知识图谱（可能尚未建立索引）。"` A broken file yields an `Extraction` with `error` and no nodes (`engine.py:323-328`); `builder.extract_all` counts and logs `"graph: %d file(s) failed to parse"` (`builder.py:84-99`). A missing grammar sets `error = "<ts_module> not installed"` (`engine.py:323-325`) — one file's loss, never the run's.

## 3. `resolve.py` in detail

### 3.1 `SymbolTable` (`:184-350`)

| field | type | content |
|---|---|---|
| `by_name` | `{(kind, symbolKey): [id]}` | append order = extraction order, then node order in file |
| `by_file` | `{path: [id]}` | same |
| `nodes` | `{id: node}` | excludes `file`, `module`, `rationale` |
| `import_bindings` | `{path: {local: [targetPath]}}` | what a call may use as receiver / bare name |
| `import_originals` | `{path: {alias: original}}` | for `from x import y as z` |
| `imported_modules` | `{path: [targetPath]}` | duplicates allowed |
| `file_languages` | `{path: language}` | read off the **file node** the engine emitted |
| `class_members` | `{classId: [functionId]}` | fn whose `parent` is that exact class node |
| `files` | `Set<path>` | every extraction path |
| `suffix_index` | `{suffix: [path]}` | see below |

`suffix_index` (`:226-234`): for every corpus path split on `/`; for each cut index add `parts[cut:].join("/")`, and also that key with its final `.<ext>` stripped. So `app/core/db.py` ⇒ `app/core/db.py`, `app/core/db`, `core/db.py`, `core/db`, `db.py`, `db`.

### 3.2 Normalization (`:109-110`)

```js
const symbolKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]/g, "");
```

Duplicated verbatim in `symbols.py:27-31` and must stay identical, because `symbol_defs.normalized` is queried with it. `symbol_in_file` (`:424-437`) is the one **case-sensitive** lookup (raw `label === name`), so `from config import settings` cannot land on class `Settings`.

### 3.3 Module spec → file path

`_module_suffix_variants` (`:63-106`):

```
spec = module.trim().strip(quotes)
if (spec.startsWith(".")) spec = spec.replace(/^\.+/, "")
spec = spec.replace(/\\/g, "/")
base = spec.includes("/") ? spec : spec.replace(/\./g, "/")
for (cand of [spec, base]) { add(cand); add(cand + "/__init__"); add(cand + "/__init__.py"); }
if (include_short_tail) for (cand of [spec, base]) add(cand.split("/").pop());
// add() strips leading/trailing "/" and dedupes, preserving order
```

`resolve_module` (`:313-350`):

```
for (variant of variants /* most specific first */) {
  cands = suffix_index[variant];                      if (!cands.length) continue
  if (language) { cands = cands.filter(p => compatible(language, langOf(p)))
                  if (!cands.length) continue }
  uniq  = sorted(new Set(cands))
  if (uniq.length === 1) return [uniq[0]]
  exact = uniq.filter(c => c === variant || c.startsWith(variant + "/"))
  if (exact.length === 1) return [exact[0]]
  // ambiguous → try the NEXT variant
}
return []        // caller records an external node
```

`_compatible_language` (`:121-131`): empty either side → true; importer ∈ `{javascript, typescript}` → target must be JS/TS; else exact string equality. A Python `from types import …` can never claim `types.ts`.

`include_short_tail` is **disabled** for `_GATED_LANGUAGES = {python, javascript, typescript}` (`:116`, `:462-467`) — SCHEMA_VERSION 4's fix; previously `langgraph.types` resolved to any project `types.ts`.

### 3.4 Import binding names

`_import_local_names(fact)` (`:134-147`): `reexport → []`; let `aliased = new Set(Object.values(aliases))`; `names.filter(n => !aliased.has(n))` then push `Object.keys(aliases)`. So `from x import y as z` yields `["z"]` — `y` is **not** addressable here. `_import_original_name(fact, local)` = `aliases[local] ?? local`.

`_import_receiver_names(fact)` (`:154-181`) — what may appear as `name.attr()`: `kind === "plain"` → aliases present ? their keys only (`import a.b as p` → `["p"]`) : only the **first** dotted component (`import app.services.paths` → `["app"]`); binding the trailing component too made `paths.x()` resolve wrongly. `kind === "from"` → `_import_local_names(fact)`, never the module head. `reexport` → `[]`.

### 3.5 Import pass (`:453-571`)

```
importerLang = langOf(path)
targets = resolveModule(module, includeShortTail: importerLang not in GATED, lang: importerLang)

if (!targets.length) {                                        // external
  key = module || "<unknown>"
  extId = external_seen[key] ?? makeNodeId("<external>","external",key,1)
  addEdge(fileNode(path), extId, "uses", EXTRACTED, line)
  for (local of importReceiverNames(fact)) addRef(path, local, "import", extId, EXTRACTED, span)
  continue
}
relation = fact.kind === "from" ? "imports_from" : "imports"
for (local of importLocalNames(fact)) {
  const original = importOriginalName(fact, local)
  if (original && original !== local) import_originals[path][local] = original
}
for (targetFile of targets) {
  addEdge(fileNode(path), fileNode(targetFile), relation, EXTRACTED, line)
  for (name of importReceiverNames(fact)) {
    if (!import_bindings[path][name].includes(targetFile)) push(targetFile)
    const original = importOriginalName(fact, name)
    const target = (fact.kind === "from" ? symbol_in_file(targetFile, original) : null)
                   ?? fileNode(targetFile)
    addRef(path, name, "import", target, EXTRACTED, span)
  }
  imported_modules[path].push(targetFile)
  if (fact.kind === "from") {                                  // submodule rule
    const base = (fact.module || "").trim()
    for (local of importLocalNames(fact)) {
      const spec = (base && !base.startsWith("."))
                 ? `${base}.${importOriginalName(fact, local)}` : `${base}/${importOriginalName(fact, local)}`
      for (subFile of resolveModule(spec, ...)) {
        if (subFile === targetFile) continue
        addEdge(fileNode(path), fileNode(subFile), "imports_from", EXTRACTED, line)
        if (!import_bindings[path][local].includes(subFile)) push(subFile)
        imported_modules[path].push(subFile)
      }
    }
  }
}
```

The submodule rule exists because `from app.storage import repo` imports a *module*, not a symbol: the generic rule binds `repo` to `app/storage/__init__.py`, which declares nothing useful, so `repo.get_project()` would never resolve (`:549-554`).

### 3.6 Inheritance pass (`:574-619`)

```
head = fact.base.split(/[\[(<]/, 1)[0].trim()          // Generic[T] → Generic
if (!head) continue
target = unique("class", head)
if (!target) { key = head.split(".").pop(); target = externalNode(key) }   // shared map
addEdge(fact.child_id, target, "inherits", EXTRACTED, fact.line)
addRef(path, head, "base", from_node_id: fact.child_id, target, EXTRACTED, span)
```

Only the head before `[`, `(`, `<` is resolved. A base outside the corpus still produces an `inherits` edge to an `external` node, because it describes the shape of the project (pydantic model, TypedDict) — EXTRACTED, not INFERRED. Because `unique` requires exactly one, **two project classes named `Base` make every `class X(Base)` fall through to an external node named `Base`** — not a dropped edge. Reproduce as-is. `superclasses` children count only when their type ∈ `superclass_name_types` (`engine.py:435-452`).

### 3.7 Call pass (`:726-848`)

Preamble per fact: normalize `callee`; skip if empty; **skip if `callee ∈ _BORING_CALLEES`** (`:50-60`, the Python builtin/Exception list) — before any resolution, so a project function named `max` is never a target. `ref_line = fact.name_line || fact.line || 1`.

```
member, target null   → calls_dropped++
                        addRef(any candidate of that name ? AMBIGUOUS : UNRESOLVED); continue
member, target found  → addEdge(caller,target,"calls",EXTRACTED,line); addRef(EXTRACTED)
                        calls_extracted++; calls_project++
bare, target null     → calls_dropped++
                        ambiguous = any fn/class of that name; if (ambiguous) calls_project++
                        addRef(ambiguous ? AMBIGUOUS : UNRESOLVED); continue
bare, target found    → addEdge(caller,target,"calls",EXTRACTED,line); addRef(EXTRACTED)
                        calls_extracted++; calls_project++
```

### 3.8 Indirect calls (`:850-878`)

Produced by the engine when a **bare identifier sits in argument position** (`engine.py:503-543`): `map(handler)`, `Thread(target=run)`, `submit(process)`. For a `keyword_argument`/`pair` the value is the **last** named child. The identifier must match `^[A-Za-z_]\w*$`. Resolution reuses `resolve_bare` only; on success, when the target is not the caller: `addEdge(caller, target, "indirect_call", INFERRED, fact.line)` + `addRef(..., "ref", INFERRED)`. The docstring is explicit (`:851-858`) that this must **not** be inferred from "a call that failed to resolve".

### 3.9 Method vs function

No syntactic distinction — derived from the **owner kind at edge-creation time** (`engine.py:481-482`): `owner_kind === "class" ? "method" : "contains"`. Node kind is `function` either way. `Foo.bar()` needs no inference (`unique(class,"Foo")` then `method_of_class`); `self.bar()` uses `fact.caller_class_id` — the exact class **node** — so nested classes and shadowed names never cross-resolve (`:266-275`, `744-751`). `class_declared_in_file` (`:277-286`) is the fallback and requires exactly one local class of that name.

### 3.10 Every heuristic, enumerated

1. `self`/`this`/`cls` names the enclosing class (`engine.py:216-220`).
2. A **capitalised receiver** is a class reference — the one member-call shape resolvable
   without inference (`engine.py:222-225`).
3. A bare name prefers a **same-file** definition (`:674-676`, `704-705`).
4. A cross-file bare call needs an **import binding** in Python/JS/TS; global uniqueness is
   not evidence (`:693-700`, `722-724`).
5. Aliases are de-aliased before matching, because the declaration keeps the original label
   (`:709-710`).
6. `from pkg import submodule` is also tried as a module path (`:555-571`).
7. `import a.b` binds only `a` (`:171-175`).
8. Non-parsed languages (Go/Rust/Java/C/C++) fall back to global unique **and** use the short
   tail when matching modules (`:100-106`, `:465`).
9. Language compatibility gates module matching (`:121-131`).
10. `_BORING_CALLEES` are never targets (`:50-60`).
11. Only the head of a generic base is resolved (`:578`).
12. Unnamed functions inherit the enclosing scope (`engine.py:458-463`).
13. JSX lowercase tags are skipped (`engine.py:190-191`); closing tags are not calls.
14. JS/TS import regexes are **line-anchored** — an unanchored `from 'x'` matched JSX
    attributes, producing modules named `aria-label` and `button` (`languages.py:126-130`).
15. TS type aliases are deliberately not symbols: `type Block` + `function Block` made every
    call ambiguous (`languages.py:215-218`).
16. TS method *signatures* (bodiless) are still nodes (`languages.py:212-214`).

### 3.11 Import parsers, in full

Only Python and JS/TS configure one; everything else emits nothing.

**Python** — `_python_imports` (`languages.py:23-88`). `text` = the statement's exact source slice, `line = start_point[0]+1`, span = the whole statement.

`from` form — regex `/from\s+(\.*)([\w.]*)\s+import\s+(.+)/s` on the stripped text:

```
[dots, module, namesBlob] = groups
module = ".".repeat(dots.length) + module               // preserve relative depth
for (chunk of namesBlob.replace(/^[(\s]+|[)\s]+$/g,"").split(",")) {
  parts = chunk.trim().split(/\s+as\s+/)
  name = parts[0].trim();  if (!name || name === "*") continue
  names.push(name)
  if (parts.length > 1 && parts[1].trim()) aliases[parts[1].trim()] = name
}
emit {kind:"from", module: module.trim(), names, aliases, line, span}
```

A `*` import produces **no names** but still emits `kind:"from"` with `names: []` — the file edge is created while nothing is bound. Correct: `from x import *` makes nothing addressable by name.

Plain form — strip `import `, split on `,`:

```
for (chunk of stripped.slice("import ".length).split(",")) {
  parts = chunk.trim().split(/\s+as\s+/)
  module = parts[0].trim();  if (!module) continue
  alias  = parts.length > 1 ? parts[1].trim() : ""
  emit {kind:"plain", module, names: [], aliases: alias ? {[alias]: ""} : {}, line, span}
}
```

Asymmetry: for a plain import the alias maps to `""`, so `_import_original_name` returns `""` and no `import_originals` entry is made — right, because `import a.b as p` has no *symbol* name to restore; `_import_receiver_names` special-cases `plain` on aliases first, so `p` still binds. A parenthesised multi-line `from x import (a, b)` is **one** fact (regex is DOTALL); `import a, b` is two.

**JavaScript / TypeScript** — `_js_imports` (`languages.py:115-172`), one combined regex via `finditer`, each alternative line-anchored `(?:^|\n)\s*`:

```
#1  import [type] [Default,] [{Named}] [* as Ns] from 'mod'
#2  import 'mod'                                  (side-effect)
#3  (const|let|var) NAME = require('mod')
#4  export *|{...} from 'mod'                     (re-export)
```

Per match: `module = mod ?? bare ?? req ?? reexp`; `names` from `default`, then `ns`, then each `named` chunk split on `/\s+as\s+/` (the `as` target becomes an alias); `kind = names.length ? "from" : "plain"`; `reexport = reexp !== undefined`; the span is the **statement's**, shared by every fact from that statement. A multi-import statement therefore yields several facts sharing one `(line,column,end_line,end_column)`, which is why `refs_at` needs word-at-cursor disambiguation. `import type { X } from "y"` binds `X` as a value (the `type` keyword is consumed, not captured) — reproduce. `export_statement` is in `import_types` (`:189`), so it is both an import carrier **and** a wrapper the engine recurses into; do both.

**Everything else.** `import_types` is populated (Go `import_declaration`, Rust `use_declaration`, Java `import_declaration`, C/C++ `preproc_include`) but `import_parser` is `None`, and the engine gates on it (`engine.py:396-398`):

```python
if ctype in config.import_types:
    if config.import_parser:
        for fact in config.import_parser(child, source): ...
    continue        # the node is consumed either way
```

So those statements are **consumed and discarded**: no `raw_imports`, no edges, no bindings, and no recursion into the statement. This is the single biggest behavioural difference between the gated and non-gated families, and exactly why `_GATED_LANGUAGES` excludes them.

## 4. Language tables

### 4.1 `LanguageConfig` (`ast/__init__.py:80-114`)

| field | default | meaning |
|---|---|---|
| `name` | — | the `language` string on nodes; the gating key |
| `ts_module` | — | ignore in a port |
| `class_types` / `function_types` | `∅` | node types opening a class / function scope |
| `import_types` / `call_types` | `∅` | node types treated as imports / calls |
| `comment_types` | `{comment}` | may carry a rationale |
| `name_field` | `"name"` | declaration name field |
| `call_function_field` / `call_arguments_field` | `"function"` / `"arguments"` | |
| `accessor_types` | `∅` | node types for `a.b` |
| `accessor_object_field` / `accessor_attr_field` | `"object"` / `"attribute"` | |
| `function_body_field` | `"body"` | for docstring discovery |
| `superclass_field` | `"superclasses"` | field holding bases |
| `superclass_name_types` | `{identifier, attribute}` | which children are base names |
| `import_parser` | `null` | `(node, source) -> facts` |

### 4.2 The declaration field table

| language | `class_types` | `function_types` | `import_types` | `call_types` | `name_field` | `call_function_field` | accessor/obj/attr | `superclass_field` | parser |
|---|---|---|---|---|---|---|---|---|---|
| **python** | `class_definition` | `function_definition` | `import_statement`, `import_from_statement` | `call` | `name` | `function` | `attribute`/`object`/`attribute` | `superclasses` | `_python_imports` |
| **javascript** | `class_declaration`, `class` | `function_declaration`, `generator_function_declaration`, `method_definition`, `function_expression`, `arrow_function` | `import_statement`, `export_statement` | `call_expression`, `new_expression`, `jsx_self_closing_element`, `jsx_opening_element` | `name` | `function` | `member_expression`/`object`/`property` | **`None`** | `_js_imports` |
| **typescript** | `class_declaration`, `abstract_class_declaration`, `interface_declaration`, `enum_declaration` | JS set **+** `method_signature`, `abstract_method_signature` | = JS | = JS | `name` | `function` | = JS | **`None`** | `_js_imports` |
| **go** | `type_declaration`, `struct_type`, `interface_type` | `function_declaration`, `method_declaration` | `import_declaration` | `call_expression` | `name` | `function` | `∅` | default | none |
| **rust** | `struct_item`, `enum_item`, `trait_item`, `impl_item` | `function_item` | `use_declaration` | `call_expression` | `name` | `function` | `∅` | default | none |
| **java** | `class_declaration`, `interface_declaration`, `enum_declaration` | `method_declaration`, `constructor_declaration` | `import_declaration` | `method_invocation` | `name` | **`name`** | `∅` | default | none |
| **c** | `struct_specifier`, `union_specifier` | `function_definition` | `preproc_include` | `call_expression` | **`declarator`** | `function` | `∅` | default | none |
| **cpp** | `class_specifier`, `struct_specifier`, `namespace_definition` | `function_definition` | `preproc_include` | `call_expression` | **`declarator`** | `function` | `∅` | default | none |

Refs: `languages.py:91-109` (PYTHON), `178-208` (`_JS_COMMON`), `210` (JAVASCRIPT), `219-244` (TYPESCRIPT), `250-313` (GO/RUST/JAVA/C/CPP).

Behaviour-changing notes: **Go/Rust/Java/C/C++ emit zero `raw_imports`** (§3.11) ⇒ zero `imports`/`imports_from`/`uses` edges, empty `import_bindings`; they also have `accessor_types = ∅`, so every call is *bare* (`new Foo()` still works via the `"constructor"` fallback). Java uses `call_function_field="name"` with `call_types={method_invocation}`, so `obj.m()` arrives as a **bare** name `m` — resolved by same-file/global-unique only. C/C++ `name_field="declarator"` means the "name" of `int f(void)` is the whole declarator text, so `label`/`signature` are noisier than in Python (`chunker._node_name` tries `name` then `declarator`; the graph engine does **not** retry). Go `class_types` includes `struct_type`/`interface_type`, which are not named declarations; the fallback picks the first child of type `identifier|type_identifier|name`, so nested `struct_type` produces a second, probably duplicate, class node.

### 4.2.1 The JS/TS superclass gap — confirmed

`_JS_COMMON` (`languages.py:178-208`) sets `superclass_field=None` and `superclass_name_types=frozenset()`; `TYPESCRIPT` (`:219-244`) spreads `**_JS_COMMON` and overrides only `class_types`/`function_types`, so it inherits `None`. `engine.py:435` does `bases_node = _named_child(child, config.superclass_field)`, and `_named_child` (`engine.py:96-99`) returns `None` for a falsy field:

```python
def _named_child(node, field):
    if not field: return None
    return node.child_by_field_name(field)
```

**Therefore no `raw_inherits` fact is ever produced for JavaScript or TypeScript.** `class A extends B` yields no `inherits` edge, no `base` ref, no inheritance-derived `external` node. What survives: `method` edges (they depend on `owner_kind`, not `superclass_field`) and `self`/`this` resolution through `caller_class_id`. `implements` is never emitted by any language, so TS `implements` clauses are equally invisible.

Adding JS/TS superclass extraction is a **behaviour change**: it adds edges, changes `degree`, therefore changes `topology_key` (invalidating all cached layouts) and slightly reorders `pick_seeds` (the 0.25 degree bonus, §5.4) and community hub/label selection (`cluster.py:142`). Gate it behind a flag if done at all.

### 4.3 Suffix → config (`languages.py:318-349`)

`.py .pyi→python`; `.js .jsx .mjs .cjs→javascript`; `.ts .tsx .mts .cts→typescript`; `.go→go`; `.rs→rust`; `.java→java`; `.c .h→c`; `.cc .cpp .cxx .hpp .hh→cpp`. `config_for(path)` = lowercased suffix (text after the last `.`), null when unknown or when there is no dot. `by_suffix_config` is an alias.

⚠ `.json` and `.sh`/`.bash` are in the **indexer's** set (§4.5) but absent here, so they are indexed for retrieval and never graph sources. ⚠ `.mts`/`.cts` are here but absent there, so those files are graph sources while the index calls them `text`.

### 4.4 Ignore rules (`services/paths.py`) — shared by both pipelines

`DEFAULT_IGNORES` (`:12-61`), 40 exact names: `.git .hg .svn node_modules dist build out .venv venv env __pycache__ .mypy_cache .pytest_cache .ruff_cache .idea .vscode .next .nuxt target bin obj coverage .DS_Store .codeslice .devdata .shots .tmp-preview-data .acl-fix acl-recovery graphify-out monaco release win-unpacked release-linux release-clean dist-backend dist-backend-linux _internal site-packages vendor third_party third-party`

`IGNORED_DIR_PATTERNS` (`:69-82`), case-insensitive, **anchored at start only** (`pattern.match`):

```
^release(?:[-_.][a-z0-9]+)*[-_.]\d+$
^release[-_.](?:clean|unpacked|build|temp|test)$
^release[-_.](?:linux|win|win32|win64|mac|darwin|macos|arm64|x64|armv7l)(?:[-_.].*)?$
.*-unpacked$      ^unpacked$      ^dist-.*$
```

`IGNORED_FILENAMES` (`:85-99`): `package-lock.json yarn.lock pnpm-lock.yaml poetry.lock uv.lock Cargo.lock composer.lock Gemfile.lock go.sum RECORD METADATA .DS_Store thumbs.db`. `IGNORED_SUFFIXES` (`:102-115`): `.lock .map .pak .pem .crt .der .pfx .blockmap .log .snap .patch .diff`. `BINARY_SUFFIXES` (`:117-163`): `.png .jpg .jpeg .gif .webp .ico .bmp .pdf .zip .gz .7z .rar .exe .dll .so .dylib .pyc .class .jar .woff .woff2 .ttf .otf .mp3 .mp4 .wav .avi .mov .sqlite .db .bin .asar .dat .node .wasm .pdb .blob .snapshot .o .obj .a .lib`.

`skip_file(name)` (`:210-219`): `.env` / `.env.*`, any `IGNORED_FILENAMES` (case-insensitive), or a suffix in `IGNORED_SUFFIXES`. `is_ignored(name) = name in DEFAULT_IGNORES || any(pattern.match(name))` (`:189-193`); `is_ignored_dir` is the same (`:198`).

### 4.5 Indexer language map (`indexing/languages.py:14-64`)

`.py .pyi→python`; `.js .jsx .mjs .cjs→javascript`; `.ts→typescript`; `.tsx→tsx`; `.go→go`; `.rs→rust`; `.java→java`; `.c .h→c`; `.cc .cpp .cxx .hpp .hh→cpp`; `.json→json`; `.sh .bash→bash`; `.md .mdx→markdown`; `.css→css`; `.html→html`; `.yml .yaml→yaml`; `.toml→toml`; `.sql→sql`; `.lua→lua`; `.rb→ruby`; `.php→php`; `.kt→kotlin`; `.swift→swift`; `.cs→csharp`.

`detect_language(path, content)` (`:67-78`): suffix lookup; then `dockerfile|makefile|cmakelists.txt` → `"text"`; then a shebang in the first 80 chars containing `python` → `python` / `node` → `javascript`; else `"text"`. `TREE_SITTER_LANGUAGES` (`:52-64`): `python javascript typescript tsx go rust java c cpp json bash`; anything else → parser `None` → line-band chunks.

⚠ `.tsx` is `"tsx"` here and `"typescript"` in the graph config — both correct for their consumer (the chunker has a separate `tsx` key in its type tables); a merged table breaks one.

## 5. `query.py` in full

### 5.1 Constants (`:29-36`)

`DEFAULT_DEPTH = 3`, `DEFAULT_TOKEN_BUDGET = 2000`, `MAX_DEPTH = 6`, `CHARS_PER_TOKEN = 4` (deliberately conservative; overestimating only shortens output). The same defaults are in the agent tool schema (`agent/tools.py:259-261`).

### 5.2 Tokenization — a *different* tokenizer from `retrieval/tokenize.py`

```js
const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+|[\u4e00-\u9fff]/g;   // ONE CJK char, not a bigram
for (raw of TOKEN_RE.findAll(text || "")) {
  const term = raw.toLowerCase();
  if (STOPWORDS.has(term)) continue;
  if (isCJK(term)) { push(term); continue; }      // always 1 char here
  if (term.length >= 2) push(term);               // 1-char ASCII (letters AND digits) dropped
}
```

`isCJK(t)` = every char in `U+4E00..U+9FFF` (`:73-74`). Single ASCII characters are dropped because, with IDF, `x`/`i`/`e`/`5` match almost every node and outrank the identifier the user typed (`:56-58`).

`_STOPWORDS` (`:39-47`) verbatim: `the a an is are was were be been to of in on for and or not with this that these those how what why when where which who does do did can could should would it its as at by from into than then there their has have had will` plus `的 了 是 在 和 与 或 有 对 从 到 把 被 这 那 个 们 怎么 什么 如何 哪 里 吗 呢`.

Two classes behave differently: the 21 **single**-character CJK entries match a token exactly and are removed; the three multi-character entries (`怎么`, `什么`, `如何`) can never equal a 1-char token, so they are **dead** and those question words score as content. The stopword test runs **before** the CJK branch (`:63-66`).

### 5.3 Node text (`:94-104`)

```js
[String(label||""), String(path||""), String(kind||"")]
  .concat(parent ? [String(parent)] : []).join(" ").toLowerCase()
```

`parent` is a **node id string** (which contains the path and the parent's name), so a child's searchable text leaks its parent's identity — deliberate, so a node whose label is only `render` still matches `Renderer.render`.

### 5.4 IDF and the score formula (`:107-165`)

```
terms = tokenize(question);  if (!terms.length || !nodes.length) return []
texts[id] = nodeText(node)
df[t]  = nodes whose text contains t             // set(terms) iterated per node
total  = max(1, nodes.length)
idf[t] = ln((total + 1) / (df[t] + 1)) + 1.0
degree[id] = incident edge count (source +1, target +1)
maxDegree  = max(degree.values, default 1) || 1
for (node of nodes) {
  let score = 0;
  for (term of terms) {
    if (!texts[node.id].includes(term)) continue;
    const w = idf[term];
    if (label === term)              score += w * 6.0;
    else if (label.startsWith(term)) score += w * 3.0;
    else if (label.includes(term))   score += w * 2.0;
    else                             score += w * 0.5;
  }
  if (score <= 0) continue;
  score *= 1.0 + 0.25 * ((degree[node.id] || 0) / maxDegree);      // centrality
  score *= KIND_WEIGHT[node.kind] ?? 1.0;
  if (score <= 0) continue;
  push([score, node]);
}
sort by (-score, node.id)
```

Multiplier ladder **6 / 3 / 2 / 0.5** on the label, `×0.5` for a hit only in path/kind/parent. `label` is lowercased for the comparison. The centrality bonus ranges over `[1, 1.25]`, so it cannot reorder nodes by more than 25%. `_KIND_WEIGHT` (`:84-91`): `function 1.0 | class 1.0 | file 0.85 | rationale 0.6 | module 0.5 | external 0.05`, unknown → 1.0. `external` is suppressed because a dependency name is not an answer; `rationale` sits below real symbols but above `external` ("excellent supporting evidence, never the seed of a traversal").

Degree here comes from **`edges`**, not the persisted `degree` field — they agree in a persisted graph but a hand-built graph may disagree.

### 5.5 Seed selection (`:168-200`)

```
terms = tokenize(question); scored = scoreNodes(...); if (empty) return []
seeds = []
for (term of terms) {                          // term order = query order
  for ([, node] of scored) {                   // best first
    if (node.label.toLowerCase().includes(term) || node.path.toLowerCase().includes(term)) {
      if (!seeds.includes(node.id)) seeds.push(node.id); break;
    }
  }
  if (seeds.length >= limit) break;            // limit = 3
}
for ([, node] of scored) { if (seeds.length >= limit) break;
                           if (!seeds.includes(node.id)) seeds.push(node.id); }
return seeds.slice(0, Math.max(1, limit));
```

One seed per term matters for two-concept questions ("how does the agent call the tool"); a single top scorer would anchor only one side. The seed test uses `label`/`path` substring while scoring also accepts a kind/parent-only hit — so such a node can be a top-up seed but never a per-term seed.

### 5.6 Expansion (`:203-287`)

`_adjacency`: per edge push `(target, edge, true)` under `source` and `(source, edge, false)` under `target` — undirected traversal, direction remembered.

```
depth = max(1, min(int(depth || DEFAULT_DEPTH), MAX_DEPTH))
visited = Set(); seen_edges = []; seen_edge_keys = Set()
expandable(id) = nodesById[id] && nodesById[id].kind !== "external"
record(cur, other, edge, out):
  key = [edge.source, edge.target, edge.relation||""].join("\u0000")
  if (seen_edge_keys.has(key)) return
  seen_edge_keys.add(key); seen_edges.push([cur, other, edge, out])
```

**DFS** (`:248-266`):

```
stack = seeds reversed, each [seed, 0]
while (stack.length) {
  [current, level] = stack.pop()
  if (visited.has(current) || level > depth) continue
  if (!nodesById[current]) continue
  visited.add(current)
  neighbours = [...adjacency[current]]
  neighbours.sort((a,b) => (-(nodesById[a[0]]?.degree ?? 0)) - (-(nodesById[b[0]]?.degree ?? 0)))
  for ([other, edge, out] of neighbours.reverse()) {
    if (nodesById[other]) record(current, other, edge, out)
    if (!visited.has(other) && level + 1 <= depth && expandable(other))
      stack.push([other, level + 1])
  }
}
```

Two reversals: `neighbours` is sorted **ascending by `-degree`** (descending by degree), then iterated `reversed`, so the **highest-degree neighbour is pushed last and popped first**. Dropping either the sort or the `reverse()` changes traversal order, and therefore the order of `seen_edges` and of the rendered `Connections` lines.

**BFS** (default, `:268-287`):

```
frontier = seeds.filter(s => nodesById[s]); visited = Set(frontier)
for (level = 0; level < depth; level++) {
  next = []
  for (current of frontier)
    for ([other, edge, out] of adjacency[current]) {
      if (!nodesById[other]) continue
      record(current, other, edge, out)
      if (!visited.has(other) && expandable(other)) { visited.add(other); next.push(other) }
    }
  frontier = next; if (!frontier.length) break
}
```

`external` nodes are **recorded but never expanded through** (`:226-230`): every file imports `typing`, so walking out of one spends the whole budget on stdlib names. Because `record` dedupes on the *edge tuple*, an edge between two visited nodes is rendered once, under whichever endpoint encountered it first — so the arrow shown depends on traversal order.

### 5.7 `render_subgraph_text` — exact layout

Signature `(nodesById, edges, visited, seenEdges, {seeds, scores, tokenBudget})`. ⚠ `edges` is **never read** (`:292` vs `:290-355`); every edge line comes from `seenEdges`. Pass `[]`.

Empty: returns exactly `图中没有匹配的节点。请在问题里使用代码中出现的符号名或文件名。`

```
budgetChars = max(200, int(tokenBudget) * 4)
seedSet = seeds ∩ visited, in seeds order
rest    = visited \ seedSet, sorted by (-(scores[id] ?? 0), id)
ordered = seedSet ++ rest
```

Edge lines, grouped under the node they were recorded for (`:314-322`), **4 leading spaces**:

```
`    ${outgoing ? "-->" : "<--"} ${otherNode?.label ?? other} [${rel}] [${conf}]`
```

Per-node block (`:330-342`), **2 leading spaces** on indented lines, **two spaces** between `Kind:` and `Source:`:

```
Node: {label || nid}
  Kind: {kind}  Source: {path}:L{start_line}
  Community: {community} ({community_label})      ← only when community_label truthy
  Relevance: {score.toFixed(2)}                   ← only when nid in scores
  Connections ({n}):
{the edge lines above}
```

Budget cut (`:343-352`), block-granular:

```
if (used + text.length > budgetChars) {
  lines.push(`... (${ordered.length - index} more nodes omitted by the token budget; `
           + `raise token_budget or lower depth)`); break;
}
lines.push(text); used += text.length + 2;
```

Assembly (`:354-355`): `header = "Subgraph: {visited.size} nodes, {seenEdges.length} edges (budget {tokenBudget} tokens)\n"`; `return header + lines.join("\n\n")`.

Layout (values illustrative; punctuation, indentation, blank lines and pluralisation exact):

```
Subgraph: 2 nodes, 1 edges (budget 2000 tokens)
Node: enrich
  Kind: function  Source: app/services/ollama.py:L41
  Community: 3 (ollama.py +2)
  Relevance: 4.62
  Connections (1):
    --> _request [calls] [EXTRACTED]

Node: _request
  Kind: function  Source: app/services/ollama.py:L12
  Community: 3 (ollama.py +2)
```

`nodes`/`edges` are **not** pluralised conditionally (`"1 edges"`). A node with no `community_label` omits `Community:`; a node not in `scores` omits `Relevance:`; a node with no rendered edges omits `Connections` and its lines but keeps its `Node:`/`Kind:` block.

### 5.8 `resolve_anchor` (`:358-392`)

In order: (1) empty → null; (2) **exact id**; (3) **exact label**, case-insensitive; (4) **file node** whose path equals the lowered anchor or `endsWith("/" + lowered)`; (5) **any node** by the same path predicate; (6) **label substring**. Step 4 exists because every symbol in a file shares that file's path — matching `helpers.py` by path alone would otherwise return whichever function sorted first (`:362-365`).

### 5.9 `node_context` (`:395-423`)

`(graph, anchor, depth=2, tokenBudget=1200)`: no nodes → `""`; unresolved → `""`; else `expand(..., [anchorId], mode="bfs", depth)` then `render_subgraph_text` with `seeds=[anchorId]` and **no `scores`** — so no `Relevance:` lines and `rest` ordered purely by id. `service.py:73-87` calls it with those defaults and short-circuits `note://` to `relationships.context(notes.build(), anchor)`.

### 5.10 `shortest_path_text` (`:426-495`)

```
start = resolveAnchor(nodes, source); end = resolveAnchor(nodes, target)
!start → `node not found: ${source}`;   !end → `node not found: ${target}`
start === end → `source and target are the same node: ${label}`
maxHops = max(1, min(int(maxHops || 8), 15))
adjacency: source→(target,edge); if (undirected) also target→(source,edge)
queue = [[start, []]]; seen = {start}
while (queue.length && found === null) {
  [current, path] = queue.shift()
  if (path.length >= maxHops) continue
  for ([other, edge] of adjacency[current]) {
    if (seen.has(other)) continue
    step = path ++ [[current, edge]]
    if (other === end) { found = step; break }
    seen.add(other); queue.push([other, step])
  }
}
!found → `no path between ${source} and ${target} within ${maxHops} hops`
ranks = {EXTRACTED:3, INFERRED:2, AMBIGUOUS:1}          // unknown → 0
weakest = {3:"EXTRACTED",2:"INFERRED",1:"AMBIGUOUS",0:"UNKNOWN"}[min rank]
```

Render (`:485-494`):

```
Shortest path ({found.length} hops):
  {currentLabel} -{relation}-> {otherLabel} [{confidence}]
  ...
Path confidence: {weakest} (weakest hop)
```

Hop direction `target_id = edge.source === current ? edge.target : edge.source`, so a backwards-traversed edge is still printed `current -rel-> other` — the arrow is the *path* direction, not the edge's stored direction (`:487`). Must be reproduced for text parity.

### 5.11 `neighbors_text` (`:498-554`)

```
anchor = resolveAnchor(nodes, label);  !anchor → `node not found: ${label}`
wanted = (relationFilter||"").trim().toLowerCase()
for (edge of edges) {
  if (wanted && !String(edge.relation||"").toLowerCase().includes(wanted)) continue
  if (edge.source === anchor) outgoing.push(`  --> ${other.label} [${rel}] [${conf}]`)
  else if (edge.target === anchor) incoming.push(`  <-- ${other.label} [${rel}] [${conf}]`)
}
lines = [`Node: ${label}`, `  Source: ${path}:L${start_line}`,
         `  Kind: ${kind}  Degree: ${degree}`]         // degree raw, may be null
if (outgoing.length) lines.push(`Outgoing (${outgoing.length}):`, ...outgoing)
if (incoming.length) lines.push(`Incoming (${incoming.length}):`, ...incoming)
if (!outgoing.length && !incoming.length) lines.push("  (no connections match the filter)")
```

Truncation is **line-by-line** here, unlike §5.7's block granularity:

```
budgetChars = max(200, tokenBudget * 4)
for (line of lines) {
  if (used + line.length > budgetChars) { out.push("... (truncated by the token budget)"); break }
  out.push(line); used += line.length + 1;
}
```

### 5.12 `graph/service.py` wrappers

| function | defaults | degradation |
|---|---|---|
| `load` | — | cached graph, else `ensure_fresh` (`:23-29`) |
| `load_fresh` | — | always `ensure_fresh`, returns `(graph, rebuilt)` |
| `context_for_question` | `mode="bfs"`, `depth=3`, `token_budget=2000` | no nodes → `"项目还没有知识图谱（可能尚未建立索引）。"`; no seeds → `"图中没有匹配的节点。请使用代码中出现的符号名或文件名提问。"` |
| `context_for_node` | `depth=2`, `token_budget=1200` | `note://` → notes graph |
| `path_between` | `max_hops=8`, `undirected=true` | delegated |
| `neighbors` | `relation_filter=""`, `token_budget=2000` | delegated |
| `summary` | — | adds `communities` count, `built_hash`, `schema_version` to `stats` |
| `rationale_for` | `limit=8` | see below |

`rationale_for` (`:145-166`) prints `Node: {label}`, `  Source: {path}:L{start_line}`, then for each **incoming** `rationale_for` edge `  [{origin}] {label}` (origin defaults to `"comment"`; empty labels are skipped without counting toward `limit`), then `  （这个节点没有记录下来的说明）` when nothing was found.

## 6. `cluster.py`

### 6.1 Invocation (`:40-110`)

Called from `store.build_and_store` as `detect_communities(nodes, edges)` with **no seed** ⇒ `seed = 0` (`store.py:521`). `_to_nx` builds an **undirected simple graph** (`networkx.Graph`): `add_edge` on an existing pair merges parallel edges, so Louvain sees a simple graph even though the renderer sees a multigraph.

```python
nx.community.louvain_communities(connected, weight=None, seed=seed)
```

`weight=None` → every edge counts 1 regardless of relation or confidence. `seed=0` → deterministic given insertion order. Default resolution (1.0) and threshold are not overridden. **Louvain**, not Leiden (`:3-8`: Leiden needs `igraph`/`leidenalg` C extensions). Insertion order — which decides Louvain tie-breaks — is pass-2 node order, `(-degree, path, start_line)` (`resolve.py:889`).

### 6.2 Isolation split, singleton merge, ordering

```
connected = subgraph(nodes with degree > 0).copy()
isolated  = [n for n in graph.nodes() if degree(n) === 0]
if (connected.nodeCount() === 0) communities = []
else try  communities = louvain_communities(connected, weight=None, seed=seed).map(set)
     catch communities = [set(connected.nodes())]      // degenerate → one big community
MIN_COMMUNITY_SIZE = 2;  POOLED_LABEL = "未分类"
large  = communities.filter(g => g.size >= 2)
pooled = set(isolated); for (g of communities) if (g.size < 2) pooled |= g
ordered = large.sort(by (-size, min(member)))
for (cid, group of ordered) { assign every member cid; summaries.push(summarise(cid, group)) }
if (pooled.size) { cid = ordered.length; assign; summaries.push(summarise(cid, pooled, pooled=true)) }
```

The `catch` is deliberate: "self loops only, or a single node" must degrade to one community, never a 500. The pooled community exists only when non-empty, so 40 unrelated files produce one `未分类` row instead of 40 one-member rows.

### 6.3 Label derivation (`:113-177`)

```
members = sorted(group)
file_counts[path]++ for every member with a non-empty path
hubId = max(members, by (degree, id))                     // tie → larger id
label = POOLED_LABEL; kind = ""
if (!pooled && fileCounts.size) {
  bestPath = max(file_counts, by (count, path))            // tie → larger path string
  label = bestPath.split("/").pop()                        // basename
  if (fileCounts.size > 1) label = `${label} +${fileCounts.size - 1}`
  kind = "file"
  hubId = first member with kind==="file" && path===bestPath, if any
}
if (!kind) kind = graph.nodes[hubId].kind
symbols = members.filter(id => kind in ("function","class"))
representative = symbols.length ? label of max(symbols, by (degree,id)) : ""
return {id, label, size, hub: hubId, kind, pooled, representative}
```

Naming by **majority file** rather than most-connected node is deliberate: the hub of a storage cluster is often `NotFound` or `get_conn`, and the legend would end up labelled with an exception class (`:120-128`).

### 6.4 Duplicate-label disambiguation (`:95-108`)

Group summaries by `String(label)`; for any group of ≥2, replace each summary's label with `` `${label} · ${representative}` `` when its `representative` is non-empty and differs from the label. Separator is space + U+00B7 + space. This is why `representative` exists.

### 6.5 Applying (`:180-191`) and the persisted payload (`store.py:524-531`)

```js
const names = new Map(summaries.map(s => [s.id, s.label]));
nodes.map(n => ({...n, community: assignment[n.id] ?? 0,
                        community_label: names.get(assignment[n.id] ?? 0) ?? ""}))
```

Nodes with no assignment silently join community 0. The payload is `{schema_version:5, built_hash, nodes (clustered), edges, communities, stats}` where `stats` is the raw resolve stats **without** the community count; `service.summary` adds `communities = len(communities)`, `built_hash`, `schema_version`.

## 7. `chunker.py`

Constants (`:23-25`, `:66`): `FALLBACK_LINES = 60`, `MAX_CHUNK_LINES = 220`, `MAX_CHUNK_CHARS = 8000`, `DOC_TYPES = {comment, block_comment, line_comment}`.

Chunk record (`_make_chunk`, `:121-142`): `{path, language, kind, symbol, parent_symbol, start_line, end_line, content, hash = sha256(content utf-8, errors=replace), tokens = max(1, floor(len/4))}`. `kind` ∈ `class` (structural `CLASS_TYPES`), `function` (structural `FUNCTION_TYPES`), `module` (gap between covered ranges), `block` (line-band fallback), `doc` (`chunk_markdown`). `parent_symbol` = enclosing class name, or the nearest enclosing symbol when an over-long chunk is descended into.

Type tables (`:27-64`) — ⚠ **not** the graph's tables:

```
FUNCTION_TYPES  python: function_definition
  javascript: function_declaration, function_expression, method_definition, arrow_function,
              generator_function_declaration
  typescript: function_declaration, method_definition, function_expression, arrow_function,
              abstract_method_signature
  tsx:        function_declaration, method_definition, arrow_function, function_expression
  go:         function_declaration, method_declaration, func_literal
  rust:       function_item, function_signature_item
  java:       method_declaration, constructor_declaration
  c / cpp:    function_definition          bash: function_definition
CLASS_TYPES     python: class_definition
  javascript: class_declaration, class
  typescript / tsx: class_declaration, interface_declaration, class
  go:         type_declaration, struct_type
  rust:       struct_item, impl_item, trait_item, enum_item
  java:       class_declaration, interface_declaration, enum_declaration
  c:          struct_specifier, union_specifier
  cpp:        class_specifier, struct_specifier, namespace_definition
  json: ∅     bash: ∅
```

`typescript` here lacks `method_signature`/`abstract_class_declaration`/`enum_declaration`; `go` lacks `interface_type`; `python` has no `class` alias. Sharing one table with the graph changes chunk boundaries and therefore citation ranges.

Structural walk (`:246-298`):

```
walk(node, parentSymbol, depth):
  if (depth > 6) return
  for (child of node.children):                    // ALL children, not only named
    if (child.type in clsTypes) {
      name = nodeName(child); [start, end] = lines(child)
      if (end - start + 1 <= 220) { emit chunk("class", name, parentSymbol); covered.push(...) }
      walk(child, name || parentSymbol, depth + 1)          // ALWAYS descend
    } else if (child.type in fnTypes) {
      name = nodeName(child); [start, end] = lines(child)
      prev = child.prevSibling                              // attach preceding doc block
      while (prev && DOC_TYPES.has(prev.type) && start - lineNum(prev) <= 3) {
        start = lineNum(prev); prev = prev.prevSibling }
      if (end - start + 1 <= 220) { emit chunk("function", ...); covered.push(...) }
      else walk(child, name || parentSymbol, depth + 1)     // ONLY when too long
    } else walk(child, parentSymbol, depth + 1)
```

`nodeName` (`:77-88`): field `name`, then field `declarator`; strip, first 120 chars. If neither yields text, scan direct children for `identifier|type_identifier|property_identifier`. A class body is always walked even after the class chunk was emitted, so methods get their own chunk **in addition to** the class chunk (coverage overlaps; `covered` is only for module gaps). The doc attachment moves `start` upward, possibly before `parentSymbol`'s start. `depth > 6` silently drops deeper nesting.

Module gaps (`:300-338`):

```
if (!chunks.length) return _text_chunks(path, language, text)      // whole-file fallback
covered.sort(); cursor = 1
addModuleGap(first, last):
  trim leading/trailing blank lines from the range; if (first > last) return
  body = lines[first-1 .. last-1].join("\n");  if (body.length <= 40) return   // tiny = noise
  moduleChunks += _text_chunks(..., kind="module", start_line: first)
for ([start, end] of covered) { if (start > cursor) addModuleGap(cursor, start-1)
                                cursor = max(cursor, end + 1) }
if (cursor <= lines.length) addModuleGap(cursor, lines.length)
chunks += moduleChunks
chunks.sort(by (start_line, end_line, kind !== "module"))
```

The third key is `false`(0) for a module chunk, so module chunks sort **first** at equal `(start_line, end_line)` — which happens when a doc comment was attached upward onto a line a gap also starts on. The `<= 40` filter means short import headers vanish entirely.

Final guard (`:331-338`): any chunk with `end_line - start_line + 1 > 220` is re-split via `_text_chunks(chunk.path, language, chunk.content)` — **without `start_line`**, so replacement chunks report lines from 1 relative to the body. Reachable for `doc` chunks and for module gaps over 220 lines.

`chunk_markdown` (`:177-219`): a `#`-starting line while the buffer is non-empty flushes (`kind="doc"`, `language="markdown"`, `symbol = heading`, `start = bufStart+1`, `end = idx`, content ≤8000), then sets `bufStart = idx` and `heading = line.replace(/^#+/,"").trim()[0:120]`. Force-flush at 220 lines. Every `#` line starts a new chunk (including lines inside code fences), and `heading` carries the previous section's title into a section that has none.

Line-band fallback (`:145-174`):

```
for (start = 0; start < lines.length; start += 60) {
  end = min(lines.length, start + 60); content = lines.slice(start, end).join("\n")
  if (!content.trim()) continue
  emit chunk(kind /*default "block"*/, symbol=null, parent=null,
             start_line = startLine + start, end_line = startLine + end - 1,
             content.slice(0, 8000))
}
```

`startLine` (default 1) lets `chunk_code` band a **slice** with absolute numbering.

Dispatch (`:222-347`): `chunk_file` sends `markdown` to `chunk_markdown`; otherwise `chunk_code` = `get_parser(language)`; no parser (and not markdown) → `_text_chunks`; `root.has_error` → `_text_chunks` — **any** syntax error anywhere demotes the entire file.

Persistence per file in one `write_conn` (`indexer.py:192-257`): upsert `indexed_files` with `hash = "chunk-v2:" + sha256(text)`; read `file_id`; delete old `chunks_fts` rows by old chunk id; delete old `chunks`; insert each new chunk (`embed_model = NULL`) then `INSERT INTO chunks_fts(rowid, content, path, symbol)` with each column from `tokenize.index_text(...)`; queue for embedding if configured. Incremental skip needs **all four** (`:170-180`): row exists, `hash` starts `"chunk-v2:"`, `!force`, size equal, `abs(mtime diff) < 1e-3`. `_read_text` (`:83-107`) rejects binary (`\x00` in first 8 KiB) and text whose `U+FFFD` count exceeds `max(8, len/100)`.

## 8. `hybrid.py` + `tokenize.py`

**CJK bigrams** (`tokenize.py`): `_CJK = [\u4e00-\u9fff\u3400-\u4dbf]`, `_RUN = [A-Za-z_][A-Za-z0-9_]*|[CJK]+`, `MAX_QUERY_TOKENS = 24`, `INDEX_VERSION = 2` (bump ⇒ `core/db.py` rebuilds `chunks_fts`). Problem (`:1-9`): `unicode61` treats a whole CJK run as one token, so `代码阅读` cannot match `本地优先的代码阅读助手`.

`_cjk_bigrams(run)` (`:24-27`): `len === 1` → `[run]`; else every overlapping 2-gram, so `本地优先的代码阅读助手` → `本地 地优 优先 先的 的代 代码 码阅 阅读 读助 助手`.

```
search_tokens(text, limit=null):
  tokens = []; seen = Set()
  for (run of RUN.findAll(text || "")) {
    if (run[0] is ASCII) { t = run.toLowerCase(); if (t.length < 2) continue; parts = [t] }
    else parts = cjkBigrams(run)
    for (part of parts) if (!seen.has(part)) { seen.add(part); tokens.push(part) }
    if (limit && tokens.length >= limit) return tokens.slice(0, limit)   // check AFTER a run
  }
  return tokens
index_text(...parts)  → concatenate search_tokens over all parts, dedupe globally,
                        join with SINGLE SPACES   // an FTS column is a bag of tokens
fts_query(text, limit=24) → tokens ? 'OR'-join of `"token"` with double quotes : ""
```

Dedup is global and order-preserving; the `limit` check runs after a whole run is expanded, so the loop can push past the limit before slicing.

Keyword search (`hybrid.py:77-114`):

```
match = fts_query(query); tokens = search_tokens(query, limit=24)
if (!match || !tokens.length) return []
candidates = max(limit * 5, 40)
rows = SELECT c.*, bm25(chunks_fts) AS rank, chunks_fts.content/path/symbol AS fts_*
       FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
       WHERE chunks_fts MATCH ? AND c.project_id = ? ORDER BY rank LIMIT candidates
   // any exception → return []
for (row of rows) {
  rank = row.rank || 0.0
  haystack = ` ${row.fts_content} ${row.fts_path||""} ${row.fts_symbol||""} `
  coverage = tokens.filter(t => haystack.includes(` ${t} `)).length / tokens.length
  bm25part = 1.0 / (1.0 + Math.max(0.0, -rank))
  push({score: 0.75 * coverage + 0.25 * bm25part, row})
}
sort by -score (stable — ties keep the SQL ORDER BY rank order); slice(0, limit)
```

FTS5 `bm25()` returns a **negative** value where more negative is better, so `bm25part` maps `rank = -x` to `1/(1+x)` ∈ `(0,1]` (`rank = 0` → 1.0). The blend is **75 % coverage / 25 % normalised bm25**. The wide candidate set is deliberate ("bm25 alone ranks a long document that repeats one common token above a short chunk that covers the whole query", `:82-84`). The ` ${t} ` set test works because the columns already hold space-separated tokens.

Vector search (`:25-54`, `:117-134`): load `(id, unpack(vector))` filtered by `vector IS NOT NULL AND embed_model = <activeModel>`; brute-force cosine `dot / ((‖q‖||1) * (‖v‖||1))`, skipping vectors whose length differs; sort desc, slice; re-read `chunks` rows by id, map with `retriever:"vector"`. Vectors are `array('f')` float32 blobs (`models/embeddings.py:85-94`) ⇒ `Float32Array` in a port.

Record shape (`:62-74`): `{chunk_id, path, start_line, end_line, symbol, kind, language, content, score (5 dp), retriever: "keyword"|"vector"|"hybrid"}`.

RRF (`:137-155`), `RRF_K = 60`:

```
scores = {}; store = {}
for (results of [kw, vec])
  for (rank = 1; rank <= results.length; rank++) {
    cid = results[rank-1].chunk_id
    scores[cid] = (scores[cid] ?? 0) + 1.0 / (RRF_K + rank)
    if (!store[cid]) store[cid] = {...results[rank-1]}; else store[cid].retriever = "hybrid"
  }
for ([cid, fused] of sort(scores, desc).slice(0, limit))
  out.push({...store[cid], score: round(fused, 5), retriever: "hybrid"})
```

`search(project_id, query, top_k=8)` (`:158-169`): empty query → `[]`; `kw`/`vec` each with `limit = max(top_k, 12)`; `merged = (kw.length && vec.length) ? rrfFuse([kw,vec], top_k) : (kw.length ? kw : vec).slice(0, top_k)` — **if either side is empty there is no fusion at all**, the survivor keeps its own `score`/`retriever`. Then `delete item.chunk_id` and truncate `content` to 4000 + `"\n…(截断)"`. This is the normal state with embeddings unconfigured (`embed_query` → null → `vector_search` → `[]`).

`context_for_prompt(chunks, budget_chars=12000)` (`:172-186`): per chunk a header `### {path}:{start_line}-{end_line}` (+ ` ({kind} {symbol})` when present) then `` ```{language}\n{content}\n``` ``; **hard stop** (no partial block) when the next block would exceed the budget; blocks joined `\n\n`. Exactly three backticks — unlike §9.

## 9. `notegen.py`

**Note shape** (`api/notes.py:93-108`): `{id, project_id, project_name (<projects.name|null>), folder_id|null, conversation_id|null, title, file_name, content_md, created_at, updated_at, indexed: bool}`. `indexed` is computed per call from `notes_index.indexed_note_ids`, never stored. **One note per conversation**: `_store_note` (`:541-558`) updates `find_note_for_conversation` (newest by id, `repo.py:487-495`) else creates — so per-message and per-conversation generation share one row and one retrieval chunk.

**Folders**: `note_folders(id, parent_id, name, created_at)`, self-referencing, children `ON DELETE CASCADE`, `notes.folder_id ON DELETE SET NULL`. `list_note_folders` returns `note_count` = **direct** notes only, ordered `name COLLATE NOCASE ASC` (`repo.py:556-564`). Delete: `UPDATE notes SET folder_id = NULL WHERE folder_id = ?` then delete the folder — notes are never deleted (`:606-611`). Every mutation calls `drop_notes_graph_cache(conn)` **in the same transaction**.

**Template** (`compose`, `:416-433`), `\n`-joined:

```
# {title}

## 知识点
{knowledge || "（模型没有给出知识点小结。）"}

## 关联代码
{render_code_section(refs)}

## 要点
{key_points || "- （模型没有给出要点。）"}

## 何时使用
{when || "- （模型没有给出适用场景。）"}
```

`render_code_section` (`:400-413`): empty → `（这次讲解没有引用具体代码位置。）`; per ref a header `### {path}:{start_line}-{end_line}` (+ `（{symbol}）`), a blank line, then the fenced code — or `（引用位置的内容已读取不到，可能已被修改或删除。）` when the snippet could not be read; refs joined `\n\n`.

**Fence sizing** (`:386-397`) — the most commonly missed constant:

```python
longest = 3                                   # ← seeded at 3, NOT 0
for match in _FENCE_RUN_RE.finditer(code): longest = max(longest, len(match.group(0)))
ticks = "`" * (longest + 1)                   # ⇒ ALWAYS >= 4 backticks
return f"{ticks}{language}", ticks
```

Opening line = fence + language with **no** space between them; closing = the fence alone. A port emitting the conventional three backticks produces notes that differ from every note the Python build wrote. `_language_for(path)` (`:365-383`): `py→python ts→typescript tsx→tsx js→javascript jsx→jsx go→go rs→rust java→java c→c h→c cpp→cpp cs→csharp json→json md→markdown sh→bash`, else `""`.

**`generate(conversation_id, message_id)`** (`:561-597`), in order: get conversation (null ⇒ `NotFound("conversation not found")`); get message (null ⇒ `NotFound("message not found")`); `role !== "assistant"` ⇒ `InvalidInput("only assistant messages can be turned into a note")`; empty content ⇒ `InvalidInput("this message has no content to summarise")`; get project; `refs = _code_refs(...)`; `(sections, error) = _model_sections(body, conversation)`; `summary_failed = sections === null`; if null → `_fallback_sections(body, refs)`; `content_title = _resolve_title(...)`; `filename_title = _resolve_filename_title(...)`; `content = compose(...)`; `note = _store_note(...)`; `indexed = _index_note(note)`; return `{...note, summary_failed, summary_error: error, indexed, refs: refs.length}`. `generate_from_conversation` (`:614-650`) is identical except it builds a `问：/答：` transcript (`_transcript`, `:600-611`, joined turns truncated to 12000) and collects refs from all messages.

**Model call** (`_model_sections`, `:446-505`):

```
location = file_path ? (start&&end ? `${path}:${start}-${end}` : start ? `${path}:${start}` : path)
                     : "整个项目（项目问答）"
if (transcript) location += "（整段会话，包含多轮问答）"
prompt = (settings.chat.note_prompt.trim() || DEFAULT_NOTE_PROMPT).replace("{location}", location)
// ONLY {location} is templated

if (conversation.selected_code.trim()) {
  [opening, closing] = fenceFor(selected_code, languageFor(conversation.file_path))
  user = `用户明确选中的代码（本笔记的首要依据）：\n${opening}\n${selected_code}\n${closing}\n\n`
       + "对话回答及其中引用的其它代码（仅作辅助上下文，不得取代选中代码作为主题）：\n"
       + truncate(answer, 12000)
} else {
  user = "没有单独提供选中代码；请以本次讲解明确讨论的核心代码或机制为主题。"
       + "如回答中包含联系上下文的其它代码，只能用于辅助解释。\n\n" + truncate(answer, 12000)
}
for (budget of [4096, 8192]) {              // NOTE_MAX_TOKENS, NOTE_RETRY_MAX_TOKENS
  try { model = buildChatModel(temperature=0.2, max_tokens=budget) }
  catch (e) { return [null, String(e.detail ?? e).slice(0,300)] }
  try { reply = model.invoke([["system",prompt],["user",user]]) }
  catch (e) { return [null, `${e.name}: ${e}`.slice(0,300)] }
  content = reply.content; if (Array.isArray(content)) content = content.join("\n")
  const text = String(content).trim()
  if (text) {
    let sections = splitSections(stripLeadingH1(text))
    if (!["知识点","要点","何时使用"].some(k => sections[k])) sections = {"知识点": text}
    return [sections, null]                 // model ignored the template → keep prose
  }
  meta = reply.response_metadata || {}
  error = `模型没有返回内容（finish_reason=${meta.finish_reason}, `
        + `completion_tokens=${meta.token_usage?.completion_tokens}）`
}
return [null, error]
```

The retry fires only on an **empty** reply (the reasoning-model case); a provider error returns on the first iteration. `_truncate(text, limit=8000)` (`:139-142`) appends `"\n\n…（回答过长，后面部分已省略）"` when longer. `split_sections` (`:155-171`) splits on `^#{1,6}\s*(.+?)\s*$`, keys trimmed headings, values trimmed bodies, text before the first heading dropped. `_strip_leading_h1` (`:145-152`) drops a first `# ` line then following blanks.

`_fallback_sections` (`:436-443`): `知识点 = stripLeadingH1(answer)`; `要点 = refs.map(r => "- `{path}:{start}-{end}`").join("\n") || "- （原回答未引用具体位置。）"`; `何时使用 = "- 这段内容来自原始回答，未能生成结构化小结，请结合上下文理解。"`. A model failure therefore still yields a complete, correctly-shaped note.

**Citations → refs** (`:278-310`): skip citations with no path or whose path is `note://`; `start = int(start_line || 1)`, `end = int(end_line || start)`; dedupe on `(path,start,end)`; stop at `MAX_CODE_REFS = 4`; read the snippet and push `{path, start_line, end_line, symbol, code}`. `_code_refs` (`:313-325`) uses `message.citations` or a single synthesised one from the conversation's `(file_path, start_line||1, end_line||1)`; `_conversation_refs` (`:328-342`) does the same over **all** messages in order. `_read_range` (`:345-362`): `resolve_in_project` (any `AppError` → null), not a file → null, read with `errors="replace"` (OSError → null), `start > lines.length` → null, `end = min(max(end,start), start + MAX_REF_LINES(40) - 1, lines.length)`, truncate to `MAX_REF_CHARS = 1600` + `"\n…(已截断)"`.

**Title cleaning** (`_clean_title`, `:192-211`): first non-empty trimmed line; strip leading `#`s (`HEADING_RE`); strip `^(标题|title)\s*[：:]\s*`; strip `[#*`\>"'“”‘’]`; replace `_LOCATION_RE` with a space; collapse whitespace and trim ` -—:：·|/、,，.。`; reject empty or `startsWith("关于")`; then `_clip_title`.

```
_LOCATION_RE (:111-115)
  \S*\.[A-Za-z0-9]{1,8}:\d+(?:-\d+)?
  |\S*\.[A-Za-z0-9]{1,8}\s*第\s*\d+(?:\s*[-–~]\s*\d+)?\s*行
  |第\s*\d+(?:\s*[-–~]\s*\d+)?\s*行
```

`_clip_title(line, limit=30)` (`:174-189`): if `len <= 30` return; take `window = line[0:30]`; for `sep` in `["，",",","、","；",";","："," ","·"]` take `window.lastIndexOf(sep)`, first `cut >= 12` wins returning `window[0:cut]` trimmed of trailing punctuation; with no boundary walk `end` down from 30 while `window[end-1]` is ASCII alphanumeric and `end > 12`, then trim. `_usable_title` (`:217-225`): `6 <= len <= 30` **and** no `VAGUE_TITLE_RE` (`这段代码|代码讲解|实现分析|功能介绍|问题分析|对话总结|整理成笔记|用户问题|助手回答`) **and** none of `?？!！。` **and** none of `请问|我想|帮我` **and** not ending `怎么做|是什么|吗`.

`_resolve_title` (`:508-525`): (1) `_clean_title(sections["标题"])` if usable; (2) else `_clean_title(_first_sentence(sections["知识点"] || source))`; (3) else `` `${project.name || "项目"} · 阅读笔记` ``. The conversation title is deliberately **not** consulted — for a snippet it reads "关于 README.md 第 357-359 行", describing the selection (`:513-518`). `_first_sentence` (`:263-275`): collapse whitespace after `_strip_leading_h1`; strip turn markers `(?:^|\s)(?:问|答)\s*[：:]\s*`; the first of `。！？.!?` at `0 < cut <= 30` ends it; else `_clip_title(body)`. `_resolve_filename_title` (`:528-538`): `_clean_title(sections["文件名"])` if usable, else `content_title || _resolve_title(...)`.

**Title helpers.** `retitle(note_id)` (`:653-683`): one model call with `RETITLE_PROMPT` over `content_md[0:4000]`; on exception/empty → `{...note, retitle_failed: true}`; else `update_note(id, title, null)` + `_index_note` → `{...updated, retitle_failed: false, indexed}`. `is_auto_title` (`:694-703`): `^(?:新对话|项目问答|全项目对话|.* · 阅读笔记|关于\s*\S+\s*第\s*\d+(?:\s*[-–~]\s*\d+)?\s*行|\S+:\d+(?:\s*[-–~]\s*\d+)?)$`. `title_from_answer` (`:718-734`): per line strip markup+headings; skip `< 4` chars; skip lines starting `抱歉|对不起|不好意思` or matching `_NARRATION_RE` (`^(?:好的|好，|明白|当然|没问题|让我| 我先|我来|我已经|我看了|我看过|我查了|接下来|综上|总结一下|简单说)`); then `_clean_title`; first non-empty wins. `title_for_conversation` (`:228-260`): source = "用户问题：" + last **8** user turns (900 chars each) + "助手最新结论：" + latest answer (1800 chars); one call at `temperature=0, max_tokens=128`; clean + validate; any failure → `title_from_answer(latest)`. `backfill_conversation_titles` (`:737-766`) runs once at startup (`main.py:98-103`): for each conversation whose title `is_auto_title`, prefer `title_from_answer(last assistant)`, else `title_from_answer(first user)`; skip empty/unchanged; return the count.

**Export** (`notes_export.py`): `export_note` (`:76-101`) → `directory = data_dir/notes/ safeStem(project?.name ?? "project")`, `mkdir -p` (OSError → `InvalidInput`), target = `uniquePath(directory / (safeStem(file_name || title || "笔记") + ".md"))`, write UTF-8, return `{path, directory, filename, bytes}`. `_safe_stem` (`:26-31`): replace `[<>:"/\\|?*\x00-\x1f]` with `_`, trim, trim `.`, collapse whitespace, empty → `笔记`, cut to `MAX_STEM = 80`, trim, empty → `笔记`. `_unique_path` (`:39-49`): if it exists, insert `-YYYYmmdd-HHMMSS` (UTC) before the suffix, then `-2`, `-3`, … `render` (`:52-73`): `# {heading}` (the note's own H1 text, or the title), blank, `> 项目：{name}（{path}）` when a project exists, `> 导出时间：{YYYY-MM-DD HH:MM UTC}`, `> 来源：CodeSlice 对话生成的笔记` when `conversation_id` is set, blank, body or `_（这条笔记还没有内容。）_`, blank.

**Note indexing** (`notes_index.py`): one `chunks` row per note — `path = "note://<id>"`, `language = "markdown"`, `kind = "note"`, `symbol = title`, `parent_symbol = NULL`, `start_line = end_line = 0`, `file_id = NULL`. `note_text` (`:46-56`): `title = title || "未命名笔记"`; return `content_md` unchanged if it starts `# {title}`, else `"# " + title + "\n\n" + body` rstrip'd. `sync_note(note, embed=true)` (`:94-147`): `digest = sha256(text.replace(/\r\n/g,"\n"))`; `tokens = max(1, len/4)`; if the current row's hash matches **and** (`!embed` or no active model or matching `embed_model` with a vector) → return its id (no-op); else embed, delete FTS+chunks rows for the path, insert both. `sync_note_background` (`:150-190`): keyword sync first (`embed=false`), then a daemon thread embeds and patches `UPDATE chunks SET vector, embed_model WHERE path = ? AND hash = <digest>` — so a note edited during the embed never gets a stale vector; pending notes coalesce, one thread per note id. `_embed` (`:59-77`): 3 attempts, sleeping `1 + attempt*2` s, any failure → `(null,null)` so the note stays keyword-searchable. `remove_note_chunk` (`:88-91`); `sync_project_notes` (`:208-231`) re-syncs each note (one failure does not abort), then deletes rows whose `path LIKE 'note://%'` is not alive, returning `{notes, removed}`; `indexed_note_ids` (`:193-205`) parses ids from `chunks.path` where `kind='note'` (the UI badge).

⚠ A note is **not** a graph source: `indexer.py:335-342` invalidates the code graph only when files changed, and says note edits invalidate the *notes* graph instead (via `repo`).

## 10. `anchors.py`

Record: §12's `code_anchors`; API shape `{id, conversation_id, file_path, commit_sha|null, symbol|null, start_line, end_line, snippet|null, code_hash|null, status: "unchanged|modified|moved|deleted", checked_at|null, created_at}`.

**Hash** (`:22-23`): `sha256(text.replace(/\r\n/g,"\n") as UTF-8) → hex`. **Only CRLF is normalised** — a lone `\r` is not, and no other whitespace normalisation happens.

**Creation** (`:44-66`): `get_project` → null if missing; `root = project.path` (**not** `resolve_root`); `snippet = extract_snippet(...)`; `code_hash = snippet ? hash(snippet) : null`. `extract_snippet` (`:26-41`): `resolve_in_project` (InvalidInput → null), not a file → null, read with `errors="replace"` (OSError → null), `start = max(1,start_line)`, `end = min(lines.length, end_line)`, `start > lines.length` → null, return the joined slice. `repo.create_anchor` (`repo.py:734-786`) **upserts on the range**: an existing row with the same `(project_id, conversation_id, file_path, start_line, end_line)` is refreshed (`status='unchanged'`, `checked_at=now`, `snippet=snippet`) rather than duplicated, so repeat citations never accumulate.

**Drift detection** — `refresh(project_id)` (`:69-133`), per anchor in id order:

```
path = resolveInProject(root, rel)          // InvalidInput → null; here root IS resolveRoot
if (!path || !path.isFile()) {
  stats.deleted++
  if (anchor.status !== "deleted") update(status="deleted", checked_at=now)
  continue
}
lines = read_text(...).splitlines()         // OSError → continue (untouched, nothing counted)
start = anchor.start_line; end = anchor.end_line
current     = start <= lines.length ? lines.slice(start-1, min(end, lines.length)).join("\n") : ""
currentHash = current ? hash(current) : ""
if (anchor.code_hash && currentHash === anchor.code_hash) {
  stats.unchanged++                          // counted even when the status already matched
  if (anchor.status !== "unchanged") update(status="unchanged", checked_at=now)
  continue
}
normalized = lines.map(l => l.trim())
target     = (anchor.snippet || "").splitlines().map(l => l.trim()).filter(l => l)
foundAt = null
if (target.length) {
  const head = target[0]
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] !== head) continue
    const window = normalized.slice(i, i + target.length)
    if (window.length === target.length && window.every((l,k) => l === target[k])) {
      foundAt = i + 1; break
    }
  }
}
if (foundAt !== null && anchor.code_hash) {
  update(status="moved", start_line=foundAt, end_line=foundAt + target.length - 1, checked_at=now)
  stats.moved++
} else { update(status="modified", checked_at=now); stats.updated++ }
```

| status | condition | fields written |
|---|---|---|
| `unchanged` | file exists and `hash(currentRange) === code_hash` | `status`, `checked_at` |
| `moved` | hash differs **but** the snippet's non-blank trimmed lines appear contiguously elsewhere **and** `code_hash` is non-null | `status`, `start_line`, `end_line`, `checked_at` |
| `modified` | file exists, hash differs, and the snippet was not found **or** `code_hash` is null | `status`, `checked_at` |
| `deleted` | `resolve_in_project` threw, or the path is not a file | `status`, `checked_at`; `snippet` preserved |

Sharp edges: `moved` requires a truthy `code_hash` (`:121`), so an anchor created when the file was unreadable can only ever become `modified`. The search compares **trimmed** lines, so indentation changes still count as a move — but the new `end_line` uses the **non-blank** snippet line count, so internal blank lines shorten the range. `code_hash`/`snippet` are **not updated** on a move, so every later `refresh` re-fails the hash check and re-reports `moved` at the same position — permanently, until the file changes again. `stats.unchanged` counts every verified anchor (the UI shows "N 个锚点已核对"); `updated`/`deleted`/`moved` increment per pass regardless of the previous status. Returned keys are four — `{updated, deleted, moved, unchanged}` — though `docs/API_CONTRACT.md:261` documents three.

## 11. Navigation and graph read operations

All routes mount under `/api` (`main.py:143-156`) and require `X-Session-Token` (`api/deps.py:14-21`; mismatch → `401 {"detail":"invalid session token"}`). `ProjectDep` resolves the project row or raises `404 {"detail":"project not found"}`. Domain errors are `AppError` subclasses rendered `{"detail": ...}` with the class's status.

| method | path | shape |
|---|---|---|
| GET | `/projects/{id}/definition?path=&line=&column=` | `{targets, candidates, reason, word}` |
| GET | `/projects/{id}/references?path=&line=&column=` | `{target, locations, truncated, candidates, reason, word}` |
| GET | `/projects/{id}/hover?path=&line=&column=` | `{contents, range?, kind?, path?, line?, word}` |
| GET | `/projects/{id}/symbols?q=&limit=` | `{symbols}` |
| GET | `/graphs/notes` | notes graph + `layout_key`/`layout` |
| PUT | `/graphs/notes/layout` | `{ok:true}` |
| POST | `/graphs/notes/summary[/stream]` | summary / SSE |
| POST | `/projects/{id}/graph/summary[/stream]` | summary / SSE |
| GET | `/projects/{id}/graph` | graph + `stats.rebuilt` + layout |
| PUT | `/projects/{id}/graph/layout` | `{ok:true}` |
| POST | `/projects/{id}/graph/build` | `{nodes, edges, communities, rebuilt:true, stats}` |
| GET | `/projects/{id}/graph/locate?path=&line=` | `{node}` |
| GET | `/projects/{id}/graph/node?node_id=&depth=` | `{node, edges, neighbors}` |
| GET | `/conversations/{id}/graph-targets` | `{project_id, targets}` |

`definition`/`references`/`hover` call `_ensure(project)` first — resolve root then `symbols.ensure_index(project.id, root)` (`navigation.py:214-217`) — so the first F12 can pay for a full graph build. Constants `MAX_REFERENCES = 500`, `MAX_CANDIDATES = 12`, `_IDENTIFIER = /[A-Za-z_$][\w$]*/`. `Target` (`_payload`, `:62-76`): `{path, name, kind, node_id, line, column, end_line, end_column, signature, doc, confidence, language}`.

`references` short-circuits when `targets.length !== 1` with `{target:null, locations:[], truncated:false, candidates, reason: reason || (candidates.length ? "ambiguous" : "no_definition"), word}`. Locations come from `symbols.refs_to(..., limit=500)`, which LEFT JOINs `symbol_defs` on `from_node_id` for `from_name`/`from_kind`, orders `(path, start_line, start_col)` and fetches `limit+1` to set `truncated`.

`hover` contents: resolved → `**{kind}** \`{name}\`` (+ a fenced `signature` when present, + `doc`, + `` `{path}:{line}` ``), joined `\n\n`, plus `range` (`start_line`, `start_column`, `end_line`, `end_column`), `kind`, `path`, `line`, `word`. Ambiguous → `**多个同名定义** \`{word || candidates[0].name}\`` + blank + `按 **F12** 选择一个：` + up to 6 bullets `` - `{path}:{line}` · {kind} ``, `reason:"ambiguous"`. External → `**外部符号** \`{word || "symbol"}\`` + blank + `这个符号来自外部库，项目内没有可跳转的源码。`, `reason:"external"`. Otherwise `{"contents":null,"reason":reason,"word":word}`. `symbols` forces every target's `confidence` to `"EXTRACTED"`; `limit` is `1..200`, default 50.

**`_resolve`** — the algorithm behind all three (`:114-211`):

```
[rel, targetFile] = _canonical(root, path)
    // resolve_in_project; not a file → ([], [], "file_not_found", null)
    // else (relative_to(root).as_posix(), resolved)
refs = symbols.refs_at(project_id, rel, line, column)
word = null
if (refs.length !== 1) {
  word = _word_at(targetFile, line, column)
  if (word) { narrowed = refs_at(project_id, rel, line, word, column)
              if (narrowed.length) refs = narrowed }
}
if (!refs.length) {
  if (word === null) word = _word_at(...)
  if (word) refs = refs_at(project_id, rel, line, word)      // no column
}
if (refs.length) {
  best = refs[0];  if (word === null) word = best.name
  samePosition = refs.filter(r => r.name === best.name && r.start_line === best.start_line
                               && r.start_col === best.start_col)
  targets = []; external = false; unresolved = false
  for (item of samePosition) {
    if (!item.target_node_id) { unresolved = true; continue }
    if (String(item.target_node_id).startsWith("<external>")) { external = true; continue }
    const row = definition_by_node(project_id, item.target_node_id)
    if (row) targets.push(payload(row, item.confidence || "EXTRACTED"))
  }
  targets = _prefer(targets)
  if (targets.length) return [targets.slice(0,12), [], null, word]
  if (external && !unresolved) return [[], [], "external", word]
  const candidates = definitions_by_name(project_id, best.name)
  if (candidates.length) return [[], candidates.slice(0,12) as "AMBIGUOUS", "ambiguous", word]
  return [[], [], external ? "external" : unresolved ? "unresolved" : "no_definition", word]
}
const definitions = definitions_at(project_id, rel, line)      // cursor on a definition
if (definitions.length) return [_prefer(definitions).slice(0,12), [], null, word]
if (word === null) word = _word_at(...)
if (word) {
  const candidates = definitions_by_name(project_id, word)
  if (candidates.length === 1) return [[payload(candidates[0],"INFERRED")], [], null, word]
  if (candidates.length) return [[], candidates.slice(0,12) as "INFERRED", "ambiguous", word]
}
return [[], [], "no_definition", word]
```

`_word_at(file, line, column)` (`:39-59`): read at most `settings.max_file_bytes` (2 MiB), decode utf-8 with replacement, `splitlines`; line out of range → null; `offset = max(0, column-1)`; the first `_IDENTIFIER` match with `match.start() <= offset <= match.end()` wins — **inclusive on both ends**, so a caret immediately after the last char still resolves (`helper|()`).

`_prefer` (`:88-111`): dedupe by `node_id` first-wins; if >1 remains prefer non-`file` kinds, else prefer non-`__init__.py`; then sort by `(kind === "file", path endsWith "/__init__.py" || path === "__init__.py", path, line)`. This collapses the `from app import service` duplicate producing both `app/__init__.py` and `app/service.py`.

`symbols.refs_at` (`graph/symbols.py:157-192`): rows for `(project_id, path, start_line)` ordered `(COALESCE(end_col,start_col) - COALESCE(start_col,0)), id`; then `word` filters `r.name === word`; then `column` keeps only rows with `start_col !== null && start_col <= column <= (end_col ?? start_col)` — and when that set is **empty the result is emptied deliberately**, because returning an unrelated call on the same line would be a confident wrong jump when the cursor is on an un-indexed identifier such as a local variable (`:188-191`). `symbols.definitions_at` orders `(end_line-start_line), (end_col-start_col), start_col` — smallest span first, so a one-line class with a method resolves to the method. `definitions_by_name` tries **case-sensitive** `name = ?` first and only falls back to `normalized = ?` when that is empty; both restricted to `kind IN ('function','class')`, `ORDER BY path, start_line LIMIT 20` ("`settings` is not the class `Settings`"). `search_definitions`: `normalized LIKE %q%`, ordered `CASE normalized = q THEN 0 WHEN normalized LIKE q% THEN 1 ELSE 2 END, length(name), name`.

**Graph endpoints.** `GET .../graph` (`graph_code.py:182-198`) is the only one that validates freshness; it returns `{nodes, edges, communities, stats: {...resolve stats, communities: n, built_hash, schema_version, rebuilt: bool}, layout_key, layout}` where `layout` is `{node_id: {x,y}}`.

`GET .../graph/node` (`:274-342`): `depth` is `1..3`, default 1, and **never used** — always a depth-1 neighbourhood:

```
node = nodesById[node_id]
if (!node) { resolved = query.resolve_anchor(nodes, node_id)
             if (!resolved) return {node:null, edges:[], neighbors:[]}
             node_id = resolved; node = nodesById[node_id] }
related = []
for (edge of edges) {
  let other, direction
  if (edge.source === node_id) { other = edge.target; direction = "out" }
  else if (edge.target === node_id) { other = edge.source; direction = "in" }
  else continue
  const o = nodesById[other]; if (!o) continue
  related.push({direction, relation, confidence, id: other, label: o.label, kind: o.kind,
                path: o.path, start_line: o.start_line, community: o.community})
}
related.sort(by (order[direction] ?? 9, rank[confidence] ?? 9, label || ""))
    // order = {out:0, in:1};  rank = {EXTRACTED:0, INFERRED:1, AMBIGUOUS:2}
return {node, edges: related, neighbors: related}       // same array twice
```

`GET .../graph/locate` (`:258-271`) → `{node}` via `_location_node` (`:221-255`):

```
wanted = path.replaceAll("\\","/").replace(/^\.\//, "")
candidates = nodes.filter(n => n.path === wanted)
enclosing  = candidates.filter(n => n.kind !== "external"
        && n.start_line <= line && line <= n.end_line
        && !(n.kind === "rationale" && n.start_line !== line))
enclosing.sort(by (kindRank[kind] ?? 1, end_line - start_line, id))
    // kindRank = {function:0, class:0, file:2, rationale:3}
if (enclosing.length) return enclosing[0]
before = candidates.filter(n => kind not in {external,rationale} && n.start_line <= line)
                 .sort(by (-start_line, id))
return before[0] ?? candidates[0] ?? null
```

`GET /conversations/{id}/graph-targets` (`:131-171`): conversation/project missing → 404; `targets` is an insertion-ordered map. First, `messages` **reversed** (newest first) and each `message.meta.graph_anchor` present in the graph is `setdefault`-inserted. Then `locations` = the conversation itself (when it has a `file_path`) plus every citation of every message, newest message first; for each, normalise the path (`\`→`/`, strip a leading `./`), `line = start_line || 1`, take candidates with that path and kind not in `{external, rationale}`, keep those with `start_line <= line <= end_line`, sort by `(kind === "file", end_line - start_line, id)`, and `setdefault` the first — falling back to the first `file` candidate. Returns `{project_id, targets: [...values()]}`.

**Layout endpoints**: body `{layout_key: 1..128, positions: {id: {x,y}}}` → `{ok:true}`. `store.save_layout` (`store.py:182-212`): empty key/positions → no-op; each position must be a dict with finite `x`/`y` else dropped; hard cap `MAX_LAYOUT_POSITIONS = 50_000` (loop breaks, keeping the first N); serialised JSON `<= MAX_LAYOUT_BYTES = 8 MiB` else `ValueError`; then `DELETE ... WHERE layout_key <> ?` + upsert, so **only the newest topology is kept**. Reads drop invalid entries silently (`_valid_position`, `:144-154`).

**Notes/folders/annotations/anchors/rules.** `POST /projects/{id}/annotations` returns **422** `{"detail":"end_line must be greater than or equal to start_line"}` when `end_line < start_line`; the body must be non-blank (validator `notes.py:46-51`). `repo.create_annotation` (`repo.py:629-651`): `visible_title = title.trim() || body.trim().splitlines()[0].trim()`, truncated to 200. `GET /api/notes` (`notes.py:122-142`): with `project_id`, list that project (`ORDER BY updated_at DESC`) and filter Python-side by `folder_id`; without it, `unfiled` wins over `folder_id`, else `list_all_notes(folder_id?)` — all `ORDER BY n.updated_at DESC` with `projects.name AS project_name`. Every note gets `indexed = note.id ∈ union(indexed_note_ids)`. `PUT /api/notes/{id}`: `folder_id` only takes effect with `move_folder: true` (`repo.py:521-550`), because `None` already means "unchanged" for title/content; same for `PUT /api/note-folders/{id}` with `move`.

## 12. Schema

SQLite, WAL, `PRAGMA foreign_keys = ON` per connection, one process-wide write lock (`core/db.py:21`, `337-363`). `utcnow()` = ISO-8601 seconds with `+00:00` → `Z`.

**projects** `id INTEGER PK`, `name TEXT NOT NULL`, `path TEXT NOT NULL UNIQUE`, `excluded TEXT` (JSON glob list), `created_at TEXT NOT NULL`, `last_opened_at TEXT`, `indexed_at TEXT`.

**notes** `id INTEGER PK`, `project_id INTEGER NOT NULL → projects CASCADE`, `conversation_id TEXT` (no FK), `folder_id INTEGER → note_folders ON DELETE SET NULL`, `title TEXT NOT NULL`, `file_name TEXT`, `content_md TEXT NOT NULL DEFAULT ''`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`. Index `idx_notes_folder(folder_id)` created in `init_db`, not the DDL.

**note_folders** `id INTEGER PK`, `parent_id INTEGER → note_folders CASCADE`, `name TEXT NOT NULL`, `created_at TEXT NOT NULL`.

**code_annotations** `id INTEGER PK`, `project_id → projects CASCADE`, `file_path TEXT NOT NULL`, `start_line INTEGER NOT NULL`, `end_line INTEGER NOT NULL`, `selected_code TEXT NOT NULL DEFAULT ''`, `title TEXT NOT NULL DEFAULT ''`, `body TEXT NOT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`. Index `(project_id, file_path)`.

**code_anchors** `id INTEGER PK`, `project_id → projects CASCADE`, `conversation_id TEXT NOT NULL → conversations CASCADE`, `file_path TEXT NOT NULL`, `commit_sha TEXT`, `symbol TEXT`, `start_line INTEGER NOT NULL`, `end_line INTEGER NOT NULL`, `snippet TEXT`, `code_hash TEXT`, `status TEXT NOT NULL DEFAULT 'unchanged'`, `checked_at TEXT`, `created_at TEXT NOT NULL`. Index `(project_id)`.

**graphs** `project_id INTEGER NOT NULL DEFAULT 0`, `scope TEXT NOT NULL`, `payload TEXT NOT NULL` (JSON), `built_hash TEXT`, `schema_version INTEGER NOT NULL`, `node_count INTEGER NOT NULL DEFAULT 0`, `edge_count INTEGER NOT NULL DEFAULT 0`, `built_at TEXT NOT NULL`, **PK `(project_id, scope)`**. No FK on purpose: `project_id = 0` is the global notes graph.

**graph_layouts** `project_id INTEGER NOT NULL`, `scope TEXT NOT NULL`, `layout_key TEXT NOT NULL`, `positions TEXT NOT NULL`, `node_count INTEGER NOT NULL DEFAULT 0`, `updated_at TEXT NOT NULL`, **PK `(project_id, scope, layout_key)`**.

**symbol_defs** `project_id INTEGER NOT NULL`, `node_id TEXT NOT NULL`, `name TEXT NOT NULL`, `normalized TEXT NOT NULL`, `kind TEXT NOT NULL`, `path TEXT NOT NULL`, `start_line INTEGER NOT NULL`, `start_col INTEGER NOT NULL DEFAULT 1`, `end_line INTEGER NOT NULL`, `end_col INTEGER NOT NULL DEFAULT 1`, `parent_node_id TEXT`, `signature TEXT NOT NULL DEFAULT ''`, `doc TEXT NOT NULL DEFAULT ''`, `language TEXT NOT NULL DEFAULT ''`, **PK `(project_id, node_id)`**. Indexes `(project_id, path, start_line)`, `(project_id, normalized)`.

**symbol_refs** `id INTEGER PK AUTOINCREMENT`, `project_id INTEGER NOT NULL`, `path TEXT NOT NULL`, `start_line INTEGER NOT NULL`, `start_col INTEGER`, `end_line INTEGER`, `end_col INTEGER`, `name TEXT NOT NULL`, `normalized TEXT NOT NULL`, `kind TEXT NOT NULL`, `from_node_id TEXT`, `target_node_id TEXT`, `confidence TEXT NOT NULL DEFAULT 'EXTRACTED'`. Indexes `(project_id, path, start_line, start_col)`, `(project_id, target_node_id)`, `(project_id, normalized)`.

**chunks** `id INTEGER PK`, `project_id → projects CASCADE`, `file_id → indexed_files CASCADE`, `path TEXT NOT NULL`, `language TEXT`, `kind TEXT NOT NULL DEFAULT 'block'`, `symbol TEXT`, `parent_symbol TEXT`, `start_line INTEGER NOT NULL`, `end_line INTEGER NOT NULL`, `content TEXT NOT NULL`, `hash TEXT NOT NULL`, `tokens INTEGER NOT NULL DEFAULT 0`, `embed_model TEXT`, `vector BLOB`, `created_at TEXT NOT NULL`.

**chunks_fts** `CREATE VIRTUAL TABLE ... USING fts5(content, path, symbol, tokenize='unicode61')`. Not contentless — rows are inserted explicitly with `rowid = chunks.id` and deleted by rowid.

**indexed_files** `id INTEGER PK`, `project_id → projects CASCADE`, `path TEXT NOT NULL`, `language TEXT`, `size INTEGER NOT NULL DEFAULT 0`, `mtime REAL NOT NULL DEFAULT 0`, `hash TEXT`, `status TEXT NOT NULL DEFAULT 'indexed'`, `indexed_at TEXT`, **`UNIQUE(project_id, path)`**.

**settings** `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at TEXT NOT NULL`. Keys used here: `graph_epoch:<id>`, `symbol_index:<id>`, `fts_version`.

**conversations** / **messages** (only what this spec touches): `conversations(id TEXT PK, project_id, title, mode, file_path, start_line, end_line, selected_code, created_at, updated_at)`; `messages(id TEXT PK, conversation_id, role, content, citations TEXT JSON, meta TEXT JSON, created_at)`. `messages.meta.graph_anchor` is what `graph-targets` reads.

Scope constants (`db.py:265-274`): `GRAPH_SCOPE_CODE = "code"`, `GRAPH_SCOPE_NOTES = "notes"`, `NOTES_GRAPH_PROJECT_ID = 0`.

`drop_graph_cache(conn, project_id, scope)` (`:277-292`) is the single invalidation primitive, deleting **all five** in the caller's transaction:

```
DELETE FROM graphs WHERE project_id=? AND scope=?
DELETE FROM symbol_defs WHERE project_id=?
DELETE FROM symbol_refs WHERE project_id=?
DELETE FROM settings WHERE key='symbol_index:<id>'
bump_graph_epoch(conn, project_id)
```

It is called with `project_id = 0` from the notes path, harmlessly deleting an index the notes graph never had (`:286-289`). `bump_graph_epoch` (`:299-314`): upsert `settings['graph_epoch:<id>']` with `CAST(CAST(value AS INTEGER)+1 AS TEXT)`, first value `'1'`; `graph_epoch` reads it, `0` when absent/unparsable.

FTS migration (`:409-443`) runs every startup: if `settings['fts_version'] !== str(INDEX_VERSION)`, `DELETE FROM chunks_fts` and re-insert every chunk's `index_text(content|path|symbol)` in one `write_conn`, then store the version. Other `init_db` migrations are additive `ALTER TABLE` for `chunks.embed_model`/`vector`, `conversations.selected_code`, `notes.folder_id`/`file_name`, `code_annotations.title`, plus two data fixes (`file_name = title` where empty; annotation `title` from the body's first line).

## 13. Store lifecycle (`graph/store.py`)

```
ensure_fresh(project_id, root):
  with buildLock(project_id):
    row = _row_and_marker(project_id, "code")              // ONE joined query
    if (row && row.schema_version === SCHEMA_VERSION) {
      token   = _token_from_excluded(row.excluded, row.project_exists !== null)
      payload = _decode(row)
      if (payload) {
        stored = String(row.built_hash ?? "")
        if (stored === token) return [payload, false]                    // HIT
        if (stored && stored === index_fingerprint(project_id)) {
          _restamp(project_id, "code", token); return [payload, false]   // legacy HIT
        }
      }
    }
    token = freshness_token(project_id) ?? "no-project"
    if (row === null) {
      [imported, sources] = _import_legacy(project_id, root)
      if (imported) { retireLegacyFile(root); return [imported, false] }
      if (sources)  { const p = build_and_store(..., sources, token)
                      retireLegacyFile(root); return [p, true] }
    }
    const payload = build_and_store(project_id, root, token)
    retireLegacyFile(root); return [payload, true]

build_and_store(project_id, root, {sources, token}):
  epoch = _read_epoch_now(project_id)                      // BEFORE reading the tree
  if (!sources) sources = builder.collect_sources(root)
  graph = builder.build_graph(sources, root)               // pass 1 + pass 2
  index = builder.build_symbol_index(sources, root)        // pass 1 + pass 2, with_index
  [assignment, summaries] = detect_communities(nodes, edges)          // seed = 0
  nodes = apply_communities(...)
  payload = {schema_version, built_hash: token ?? freshness_token ?? "no-project",
             nodes, edges, communities, stats}
  _persist_if_current(project_id, payload, epoch, index.defs, index.refs)

_persist_if_current(...):
  with write_conn() as conn:
    if (expected_epoch !== null && _read_epoch(conn, id) !== expected_epoch) {
      log("discarding a graph built while project was re-indexed"); return false }
    _write_row(conn, id, "code", payload)                  // upsert
    symbols.replace_index(conn, id, defs, refs)            // SAME transaction
  return true
```

The epoch guard makes a build overlapping an index run *unpersistable*: the check happens **inside** the write transaction, so a concurrent invalidation cannot slip between check and insert (`:551-585`). `build_and_store` runs pass 1 **twice** (`build_graph` and `build_symbol_index` each call `extract_all(sources)`, `builder.py:102-132`) — a port should parse once and call `resolve` twice.

`_write_row` (`:601-624`) upserts on `(project_id, scope)` with `node_count`/`edge_count` from the payload lengths, `built_at = utcnow()`, `schema_version = 5`. `load_cached` (`:354-365`) never validates: null when the row is missing **or** `schema_version !== expected`, so a schema bump retires every stored graph. `save_cached` (`:368-384`) writes without consulting the epoch (fixtures only). Legacy upgrade (`:627-675`): `_import_legacy` reads `<root>/.codeslice/graph.json`; if it carries a `built_hash`, recompute `_sources_digest(collect_sources(root))` and refuse when it differs (returning the sources so the rebuild reuses them); otherwise stamp the current token, save, and retire the file by renaming to `graph.json.stale`.

**Notes graph** (`graph/notes.py`): same table, `project_id = 0`, `scope = "notes"`, `schema_version = NOTES_SCHEMA_VERSION = 2`, no `built_hash`, built inside `write_conn` so it serialises against the `repo` mutations that delete the row in their own transaction.

```
_REFERENCE = /[\w./\\-]+\.(?:tsx?|jsx?|py|rs|go|java|kt|swift|c|cpp|h|hpp|cs|vue|svelte|html|css|scss|json|ya?ml|toml|md|sql|sh|ps1|rb|php)\b/gi
notes = list_all_notes().sort(by id);  folders = {id: name}
groups = {};  references = {}
for (note of notes) {
  category = note.folder_id !== null ? `folder:${note.folder_id}` : `project:${note.project_id}`
  groups[category].push(note)
  for (path of new Set(REFERENCE.findAll(note.content_md))) {
    normalized = path.replaceAll("\\","/").replace(/^\.\//,"")
    references[[note.project_id, normalized]].push(note)
  }
}
for ([cid, [category, members]] of sorted(groups.entries())) {    // sorted by category string
  first = members[0]
  label = first.folder_id !== null ? (folders[first.folder_id] ?? "未分类")
                                   : `${first.project_name ?? "项目"} · 未分类`
  for (note of members) nodes.push({id:`note://${note.id}`, label: note.title, kind:"note",
      path:`note://${note.id}`, start_line:0, end_line:0, degree:0, community: cid,
      community_label: label, note_id: note.id, content_md: note.content_md,
      project_name: note.project_name})
  communities.push({id: cid, label, size: members.length, hub:`note://${first.id}`,
                    kind:"note", pooled:false, category})
}
links = {}                                    // keyed (source,target,relation)
connect(members, relation, evidence):
  for ([a, b] of consecutivePairs(sorted(uniqueIds(members)))) {    // CHAIN, not clique
    edge = links.setdefault([`note://${a}`,`note://${b}`,relation],
             {source, target, relation, confidence:"EXTRACTED", evidence: []})
    edge.evidence.push(evidence)
  }
for ([category, members] of groups)
  connect(members, category.startsWith("folder:") ? "same_folder" : "same_project", category)
for ([[pid, path], members] of references) connect(members, "shared_reference", path)
for (edge of links.values()) { byId[edge.source].degree++; byId[edge.target].degree++ }
return {nodes, edges: [...links.values()], communities,
        stats: {files:0, symbols: nodes.length, edges: links.size, extracted: links.size,
                inferred: 0, communities: communities.length}}
```

The chain (`zip(unique, unique[1:])`) is deliberate: "one link records a shared folder/file, not a claim of semantic similarity between every pair" (`:96-97`). `pooled` is `false` for every notes community — the notes graph never merges singletons.

## 14. Corrections

### 14.1 Dead code and unused constants

| item | at | reality |
|---|---|---|
| `MAX_RATIONALE_DISTANCE = 3` | `engine.py:51` | **never referenced.** No distance check exists; the "≤ 3 lines above" rule lives only in `chunker.py:275` (hard-coded) and is a different mechanism. |
| `_walk_descendants` | `engine.py:102-110` | never called; `walk` uses `for child in node.children`. |
| `STRUCT_CONTROL` | named in `chunker.py:6` docstring | **does not exist.** The described merge rule is unimplemented. |
| `_enclosing_class` | `chunker.py:91-110` | **always returns `None`** (computes a name then `return None` with a "placeholder" comment). Never called. |
| `_IMPORT_RE` | `chunker.py:341` | compiled, never used. |
| `KIND_MODULE` | `ast/__init__.py:55` | no producer; only a filter in `resolve.py:210`. |
| `REL_REFERENCES`, `REL_IMPLEMENTS`, `REL_DECLARES` | `ast/__init__.py:37,39,41` | never emitted. |
| `is_interface` | `engine.py:450` | computed on every `raw_inherits`, **never read**; always `false` for the configured languages because `superclass_name_types = {identifier, attribute}` excludes `generic_name`/`subscript`. |
| `stats["calls_inferred"]` | `resolve.py:636` | initialised to 0, **never incremented**, though `indirect_call` edges are INFERRED (`:866`). `stats.inferred` (edges) and `calls_inferred` disagree for any project with indirect calls. |
| `depth` on `GET .../graph/node` | `graph_code.py:279` | validated `1..3`, default 1, **never passed anywhere**; the handler always builds depth-1. |

### 14.2 Behavioural contradictions

**`graph/__init__.py:16-17` vs `store.py:3-7`.** The package docstring says "The graph lives on disk as JSON"; the store says SQLite is primary and `graph.json` is legacy. **The store is authoritative**; the package docstring is stale.

**`docs/API_CONTRACT.md:261` documents three anchor-refresh keys; the code returns four** (`updated, deleted, moved, unchanged` — `anchors.py:74`, `:101`). The docstring explains `unchanged` exists for the "N 个锚点已核对" UI count.

**`GET /api/notes?project_id=…&unfiled=true` silently ignores `unfiled`.** With `project_id` the split runs in Python and only `folder_id` is honoured (`notes.py:136-141`). `docs/API_CONTRACT.md:216` says `unfiled` wins — true only without `project_id`.

**Chunk citations after the long-chunk guard.** `chunker.py:333-337` re-splits an over-long chunk without `start_line`, so replacement chunks report lines from 1 relative to the body — contradicting `chunker.py:9`'s promise that line ranges are preserved "so citations still work".

**`moved` anchors never re-converge.** `anchors.py:121-129` writes `status`/`start_line`/`end_line` but **not** `code_hash`/`snippet`, so every later `refresh` re-fails the hash check and re-reports `moved` permanently. `docs/ARCHITECTURE.md:58` implies it converges to `unchanged`; it does not. The new `end_line` also uses the **non-blank** snippet line count.

**Three CJK stopwords are dead in `graph/query.py`.** `_STOPWORDS` contains `怎么`, `什么`, `如何` (`:46`) but `_TOKEN_RE` (`:38`) yields **one** CJK character per match, so those terms never match and score as content. The 21 single-character CJK stopwords do work. Fixing it changes seed ranking for Chinese questions.

**The two CJK tokenizers differ on purpose.** `query.py:38` emits single characters; `tokenize.py:16,24-27` emits overlapping bigrams. Different index structures (in-memory scoring vs FTS5 `unicode61`). Do not unify.

**`hybrid.py`'s "keyword-only fallback" is actually symmetric.** `:1-3` and `:163` describe falling back when no vectors exist, but the condition is `kw && vec` — if keyword search is empty and vectors exist, the result is **vector-only**.

**`tokenize.search_tokens` overshoots its `limit` before slicing** (`:47-48`): the check runs after a whole run is expanded. The returned list is correct; the loop computes up to `run.length - 1` extra tokens.

**`_js_imports` gives re-exports the wrong relation.** `export * from './x'` matches only the `reexport` alternative, so `names` is empty and `kind` becomes `"plain"` — thus the edge is `imports`, not `imports_from` (`languages.py:160-169`). Only `stats.by_relation` is affected, because both binding helpers short-circuit on `reexport`.

**Notes always use ≥ 4 backticks** (§9): `_fence_for` seeds `longest = 3`. `hybrid.context_for_prompt` always uses exactly three — the two renderers are deliberately not shared.

**`render_subgraph_text` ignores its `edges` parameter** (`query.py:292` vs `:290-355`); every edge line comes from `seen_edges`. Pass `[]`. It also under-counts its budget: `:352` adds `len(text)+2` per block but the **header** is never counted, and `budget_chars` is floored at 200, so `token_budget=1` still yields 200 chars.

**`neighbors_text` prints `degree` raw** (`query.py:534`), so a node dict lacking it renders the literal `None`.

**`resolve.add_edge` keeps the first `line`** on a merge (`:368-383`), so a merged edge's line may come from the inferred writer even though the confidence was upgraded.

**`docs/ARCHITECTURE.md:58` omits `unchanged`** from the anchor statuses; it is the schema default and the fourth real status (`db.py:114`, `anchors.py:102`).

**`indexer.py:5-8` describes the skip rule incompletely.** It says "size + mtime unchanged"; the real condition also requires the stored hash to start with `"chunk-v2:"` (`:170-176`).

**`_python_imports` records statement-level spans only** (`languages.py:33-40`). Do not compute per-name columns for Python imports; `refs_at` with `word=` is the designed path.

## 15. Porting notes for a zero-dependency Node implementation

### 15.1 Ports exactly (pure functions over plain objects)

Transliterate line for line; this is the core and the highest-value work:

1. `make_node_id` / `file_node_id` (`ast/__init__.py:120-136`).
2. **`graph/query.py` in full** — no dependency beyond `Math.log`.
3. `retrieval/tokenize.py` in full.
4. `cluster.py`'s label derivation, singleton merging, ordering, duplicate disambiguation and
   `apply_communities` (`:113-191`). Only the Louvain call is external.
5. `anchors.py`'s drift algorithm (`:94-132`) minus SHA-256.
6. `notegen.py`'s text layer: `split_sections`, `_strip_leading_h1`, `_clean_title`,
   `_clip_title`, `_usable_title`, `_first_sentence`, `render_code_section`, `_fence_for`,
   `compose`, `_fallback_sections`, `is_auto_title`, `title_from_answer` (`:107-225`, `:263-275`,
   `:386-443`, `:686-766`).
7. `notes_export.py`'s `_safe_stem`, `_unique_path`, `render` (`:26-73`).
8. `store.topology_key` (`:112-141`).
9. `notes.py`'s `_compose` topology rules (`:45-137`).
10. `resolve.py`'s decision logic: the ladder, the ambiguity policy, `_module_suffix_variants`,
    `_import_local_names`, `_import_receiver_names`, `_compatible_language`, `symbol_in_file` —
    all string manipulation over a `SymbolTable` you build.

### 15.2 Must be approximated (no tree-sitter)

| capability | strategy |
|---|---|
| exact spans | Brace/indent scanner with a `{}`/`()`/`[]` depth counter plus quote/template/regex-literal state; a declaration spans from its first token to the matching close, or to the block's last non-blank line for Python. Column-1 starts are exact; emit `start_col = 1` when unsure (`symbol_refs.start_col` is nullable and `definitions_at` only uses spans for tie-breaking). |
| class / fn / method | Keyword + context. JS/TS: `class X`, `interface X`, `enum X`, `function X`, `X(...) {` inside a class body, `const X = (…) =>`, `const X = function`; `type X =` is **not** a node. Python: `class X`, `def X`, method iff the indentation stack says the enclosing scope is a class. Go `func X` / `func (r T) X` / `type X struct`. Rust `fn`/`struct`/`enum`/`trait`/`impl`. Java `class/interface/enum`, `T x(...)`. C/C++ a declarator followed by `{` at file scope. |
| docstrings | **Portable with a regex.** Python: the first non-blank line after the `:` of `def`/`class` matching `^\s*("""|'''|"|')`, then `_strip_string_delimiters`. JS/TS has no grammar-level docstring: the Python code would also return `None` there, so **do not add JSDoc support** — it changes node counts. |
| marker comments | **Exact.** Line-oriented: strip each comment prefix, match the uppercase marker list, attach to the current lexical owner; plus the "file header = first 12 lines" rule. |
| JSX calls | `<([A-Z][A-Za-z0-9_$]*)\b` outside strings/comments. Lowercase and closing tags excluded — both rules load-bearing. |
| calls | `\b([A-Za-z_$][\w$]*)\s*\(` for bare, `\.\s*([A-Za-z_$][\w$]*)\s*\(` for member, `\bnew\s+([A-Za-z_$][\w$]*)` for constructors; compute `receiver` from the text before the dot and `receiver_type` by the `self/this/cls` then capitalisation rule. **Guard strings/comments/regex literals** — that guard is the main source of false `calls` edges. |
| inheritance | Python `class X\(([^)]*)\)`, split top-level commas, take the head before `[`/`(`/`<`. **JS/TS: none** (§4.2.1). Java `extends` is not configured in the original either — decide explicitly. |
| Go/Rust/Java/C/C++ imports | **Nothing to approximate** — they emit zero `raw_imports` in the original. Adding them changes that whole language family's behaviour (§3.11). |

**Fallback on a failed scan**: mirror `extract_file` — return an `Extraction` with `error` and **no** nodes rather than throwing (`engine.py:300-328`); `extract_all` counts and continues (`builder.py:84-99`). Keep `LanguageConfig` as data, and keep the chunker tables separate from the graph tables (§7 vs §4.2).

### 15.3 Must be dropped or replaced

| dependency | replacement |
|---|---|
| `sqlite3` + FTS5 `bm25` | Any KV/JSON store. **BM25 must be replaced**: keep `coverage` exactly (0.75) and substitute a length-normalised TF score for `bm25_part`, e.g. `1/(1 + ln(1 + docTokens/(tf+1)))`. The 0.75/0.25 blend and `max(limit*5,40)` over-fetch are load-bearing; the exact bm25 shape is not, because it is squashed to `(0,1]` before blending. Document it — keyword ranking will differ. |
| `numpy` | nothing here (vectors are `array('f')` + a Python loop). |
| `networkx.community.louvain_communities` | Implement Louvain (~80 lines): local-moving phase maximising modularity with `weight=None`, aggregate, repeat. `seed=0` determinism matters — deterministic PRNG seeded at 0, nodes in insertion order (`(-degree, path, start_line)`). Preserve: undirected simple graph (parallel edges collapse), unweighted, community order `(-size, min member)`, singleton pooling, majority-file labelling. Easier deterministic fallback: connected components, then split large ones by label propagation. Community ids may differ from a Python build. |
| `hashlib.sha256` | `crypto.subtle.digest('SHA-256', …)` or a synchronous ~60-line SHA-256. Digests are compared against values a Python build wrote, so reuse of an existing DB or `graph.json` needs a **real** SHA-256. Keep the truncations: `topology_key` → 32 hex chars; `excluded` digest → 16 (`store.py:341`). |
| `tree_sitter` | §15.2. Chunking also needs the fallback: `chunker.py:222-235` demotes any file whose parse reports an error; a regex parser has no error signal, so decide per file (e.g. brace-balance failure → fallback). |
| `watchfiles` | `fs.watch` with the same debounce (1200 ms) and coalescing: a change queues a re-index **after** the current job (`queue_after_current`); never concurrent for the same project. |
| LLM calls | Out of scope with no network. **Everything degrades cleanly**: `relationships.summarize` → 502; `_model_sections` → null → `_fallback_sections` still gives a complete note with `summary_failed: true`; `retitle` → `retitle_failed: true`; `title_for_conversation` → `title_from_answer`. |
| embeddings | Drop. `search` becomes keyword-only (§8) and notes stay keyword-searchable — both paths already handle it. |

### 15.4 Determinism checklist

1. Sort `collectSources` by relative path (`builder.py:80`).
2. Node insertion order: pass-1 order, then `nodes.setdefault` on merge.
3. Resolve imports → inheritance → calls (`resolve.py:453-878`).
4. Sort nodes by `(-degree, path, start_line)` — feeds both `topology_key` and Louvain insertion
   order.
5. Sort edges by `(source, target, relation)`.
6. `add_edge` first-writer-wins for `line`, upgrade-only for confidence.
7. `add_ref` dedupes on `(path, line, column, name, kind, target, from_node_id)`.
8. `external_seen` is a **single** map shared by import- and inheritance-externals.
9. `import_bindings` push is "if not already present" — first target wins.
10. `imported_modules` appends duplicates freely; the unique-hit test dedupes.
11. Louvain `seed = 0`, `weight = None`, undirected simple graph.
12. Community order `(-size, min member id)`; pooled always last.
13. `render_subgraph_text`: seeds in seed order, then rest by `(-score, id)`.
14. `expand` DFS: ascending sort by `-degree` **then** `reverse()` — copy both or traversal order
    changes.

### 15.5 Do not reproduce

- **The SQLite schema as a migration target.** §12 is a field-name/nullability reference. Keep only
  the slot concept: scope strings `"code"`/`"notes"` with sentinel project id `0` for the global
  notes graph.
- **The epoch/transaction dance** (`store.py:551-599`) — it exists because the Python service writes
  from multiple threads. A single-threaded plugin needs only "if the corpus changed, drop the payload
  before reading it". Keep the principle, not the mechanism.
- **`MAX_LAYOUT_BYTES`/`MAX_LAYOUT_POSITIONS`** unless you persist layouts; if you do, keep both caps
  and the "delete all other keys for this `(project, scope)`" rule.
- **The legacy `graph.json` import** (`store.py:627-675`) unless reading an existing install. Its
  rule is `built_hash === _sources_digest(sources)`.
- **`api/graph_api.py`** (the LangGraph workflow panel) and **the session-token middleware** (the
  plugin host provides its own auth boundary).

### 15.6 Recommended order

1. `tokenize` + `query` (pure, highest value, testable with fixtures).
2. `make_node_id`, the `LanguageConfig` tables, the ignore lists.
3. The per-language scanner emitting `Extraction`-shaped objects; validate against a Python dump of
   `nodes`/`edges` for a small repo.
4. `resolve` — expect the largest diff; assert `stats.by_relation` against the Python build.
5. `cluster` (labels/pooling first; Louvain last, noting ids may differ).
6. `topology_key`, persistence, `apply_communities`.
7. The symbol index (`definitions_at`, `refs_at`, `refs_to`, `definitions_by_name`,
   `search_definitions`) then `navigation._resolve` — reproduce `_prefer` and the reason strings
   exactly; the UI branches on `reason` and `confidence`.
8. Notes graph, anchors, notegen's text layer, notes_export.
9. Only then persistence, embedding, HTTP.

### 15.7 Test vectors worth pinning

- `search_tokens("本地优先的代码阅读助手")` → `本地 地优 优先 先的 的代 代码 码阅 阅读 读助 助手`
  (10 tokens, order preserved). `search_tokens("a b ab")` → `["ab"]`.
- `graph/query.tokenize("How does the Agent call a tool")` → `["agent","call","tool"]`.
- `makeNodeId("a/b.py","function","run",12)` → `"a/b.py::function::run::12"`.
- `_symbol_key("MyClass")` → `"myclass"`; `_symbol_key("a-b.c")` → `"abc"`.
- `_module_suffix_variants("app.core.db")` → `app.core.db`, `app.core.db/__init__`, `app/core/db`,
  `app/core/db/__init__`, `app/core/db/__init__.py`, `db` (deduped) — note `app.core.db/__init__`
  is present and noisy, which is why `spec` is tried before `base`.
- `render_subgraph_text` of a two-node one-edge graph must byte-match §5.7, including `"1 edges"`
  and the two spaces after `Kind:`.
- `_clean_title("关于 README.md 第 357-359 行")` → `""` (location stripped, then
  `startsWith("关于")` rejected).
- `_fence_for("x","python")` → **4** backticks (`longest` seeded at 3) — the most commonly missed
  constant in this spec.
- `sha256("a\r\nb")` normalised → same digest as `sha256("a\nb")`.
- `topology_key` of an empty graph → `sha256("layout-v3" + 0x00)` first 32 hex chars.

---

*Source read: `D:\CodeSplit\backend\app` (28 files) plus `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/GRAPH_EXPLORER.md`.*

