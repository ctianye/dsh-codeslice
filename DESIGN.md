# CodeSlice × DSH — rebuild design & status (v1.0)

> Supersedes the v0.2.0 plugin in this repository.
> Behaviour authority: [`spec/backend-methods.md`](spec/backend-methods.md) (algorithms, 3.6k lines)
> and [`spec/frontend-interaction.md`](spec/frontend-interaction.md) (interaction, 1.6k lines).
> Wire contract: [`plugin/WIRE.md`](plugin/WIRE.md).

---

## 1. What was wrong with v0.2.0

The previous implementation was a thin, self-invented approximation. It was not a base to patch —
every layer below was rewritten. Concrete defects found in the audit:

| # | Defect | Evidence | Consequence |
|---|---|---|---|
| 1 | The graph model had **no node ids, no relations, no confidence** — only `{kind, from, to}` edges | old `lib/indexer.js:210-244` | The UI could only draw "a line", never say *what* the line means; no inheritance, no rationale, no `contains`/`method` split |
| 2 | **No `rationale` nodes at all** | old `lib/analyzer.js` had no marker-comment parser | CodeSlice's "why does this exist" — one of its four differentiating assets — was absent |
| 3 | Resolution ladder collapsed to 3 rules with **no language gating** | old `lib/indexer.js:275-304` | JS/TS bare calls were bound to a global unique name the original deliberately refuses; false edges read as fact |
| 4 | **No communities** | — | No clustering, no colour-by-community; the graph reads as noise above ~80 nodes |
| 5 | `annotations` / `anchors` / drift detection **not ported** | — | A note could not prove it still described the code it cited |
| 6 | **No retrieval index** | — | "Search" only matched declaration names; Chinese queries failed entirely |
| 7 | **No notes** | — | The largest single gap versus the desktop app |
| 8 | Graph panel was one flat list of 5 "screens" | old `client.js:1057-1490` | No inspector rail, no relation groups, no community list, no family filters — a different product |
| 9 | Force layout was a hand-rolled O(n²) loop run **synchronously on the main thread** | old `client.js:550-663` | ~12M pair updates per redraw at 240 nodes, per resize bucket |

Approach: **port CodeSlice's algorithms faithfully (JS, zero dependencies), delete what the host
already owns, and rebuild the panel against the host's own slot/service contracts.**

---

## 2. Division of responsibility

| CodeSlice subsystem | Decision | Reason |
|---|---|---|
| AST extraction, 2-pass resolve, communities, query/expand/render | **ported** | The differentiating asset |
| Symbol index + navigation (`definitionsAt`, `refsTo`) | **ported** | F12-class navigation the host lacks |
| Hybrid retrieval (FTS + RRF) | **ported, minus vectors** | No embedding service inside a plugin; keyword-only is the documented degradation |
| Notes + folders + anchors + drift | **ported** | No host equivalent |
| Terminal, command approval, `command_rules` | **deleted** | Host owns `terminal*`, `approval`; a plugin re-implementation is a sandbox bypass |
| Project picker, settings UI, session list, desktop IPC | **deleted** | Host owns `workspace*`, settings, sessions |
| Monaco, vis-network, 7k lines of CSS | **deleted** | Host owns the editor; the panel inherits `--dsw-alias-*` only |
| LangGraph agent loop | **deleted** | The host *is* the agent |
| LLM calls in `relationships.py` / `notegen.py` | **deleted** | The plugin performs no network I/O; the documented no-model fallbacks are ported instead |

---

## 3. Architecture

```
plugin/
  index.js              Host entry: one cached build per root, tools, /codeslice/api/*
  lib/
    model.js            node/edge/id/relation/confidence vocabulary + constructors
    analyzer.js         Scanner: one file → Extraction (nodes, edges, raw facts)
    resolve.js          SymbolTable, two-pass ladder, degree, sort, symbol index
    cluster.js          Louvain + community labels + topologyKey
    query.js            score/seed/expand/render/paths/neighbours/slices
    retrieval.js        CJK-bigram tokenizer + chunk index + record search
    notes.js            notes, folders, anchors, drift, note graph, export
    store.js            per-root JSON cache (index, notes, layouts)
    build.js            collect → scan → resolve → document
    persist.js          the JSON boundary: drop Maps, rebuild them on load
  client/
    src/*.js            authored ES modules (real imports)
  client.js             built bundle (one __ModuleLoader__.load factory, committed)
  dev/
    build-client.mjs    bundle client/src → client.js; --check fails when stale
    host-test.mjs       68 checks: build, vectors, tools, routes, cache
    harness/run.mjs     jsdom mounts the real bundle against the real routes
    mint-cookie.mjs     local GUI auth for DevTools verification
```

**Why a build step for the client half.** A DSH client bundle is exactly one
`window.__ModuleLoader__.load({ id, factory(require) })` call; the loader resolves only the shell
instance and other *registered* modules, so a plugin cannot `require` its own sub-files. A single
6,000-line file is not reviewable. `dev/build-client.mjs` performs a deterministic local
concatenation in dependency order — no transforms, no minification — and `--check` proves the
committed bundle matches its sources.

**The single-scope constraint.** The emitted factory body is one JavaScript scope, so the React
bindings (`h`, the hooks) must be declared exactly once. `client/src/icons.js` is that owner: it
imports nothing, so it always emits first, and every panel writes
`import { useState } from './icons.js'`. A second declaration anywhere is a load-time
`SyntaxError`, not a warning — which is why the build script verifies every imported name resolves.

---

## 4. Host contract (`lib/model.js`)

### 4.1 Node

```js
{ id,            // "<path>::<kind>::<name|__file__|rationale[:40]>::<line>"
  label, kind,   // file | class | function | rationale | external
  path, start_line, end_line, start_col, end_col,
  parent,        // owning node id, or null
  language, signature, origin,     // origin: docstring | comment (rationale only)
  degree, community, community_label, external }
```

### 4.2 Edge

```js
{ source, target, relation, confidence, line }
```

Emitted relations: `contains`, `method`, `rationale_for`, `imports`, `imports_from`, `uses`,
`inherits`, `calls`, `indirect_call`. Confidence is `EXTRACTED` or `INFERRED` (`indirect_call`
only).

`references`, `implements` and `declares` are **in the vocabulary but never emitted** — the
original never emits them either, and inventing them would change every legend and every count.

---

## 5. Deliberate deviations (each justified)

1. **Keyword-only retrieval.** `hybrid.py` fuses FTS5 + vectors with RRF. A plugin cannot call an
   embedding model, and the original already defines the fallback. `tokenize.py` is ported exactly
   (CJK bigrams are the load-bearing part for Chinese); `bm25()` is replaced by a
   length-normalised term-frequency score, as the port spec prescribes. The
   `0.75·coverage + 0.25·tf` blend and the `max(limit*5, 40)` over-fetch are kept.

2. **Deterministic Louvain instead of networkx's.** Same phase structure (local moving →
   aggregate → repeat), seeded LCG, node iteration in the resolver's order. Community *ids* may
   differ from a Python build; the label derivation, singleton pooling, ordering
   (`-size, min member id`) and majority-file naming are ported exactly.

3. **The JS/TS superclass gap is fixed, behind a flag defaulting to on.** The original configures
   `superclass_field=None` for JS/TS, so no `inherits` edge can ever be produced and a whole class
   hierarchy is invisible. That is a bug, not a design. Flag: `superclassJs: true` (set false for
   byte-parity with a Python build).

4. **Notes are stored, not rendered as editor decorations.** The host's CodeMirror belongs to
   `dsh-better-sidebar`; reaching into its decoration API couples two plugins across a version
   boundary. Annotations render in the panel's own reader, with drift status per anchor.

5. **One notes database per workspace root**, in the plugin's state directory — not shared with a
   desktop CodeSlice install (a SQLite single-writer conflict for zero benefit).

6. **Persisted as JSON, not SQLite.** The cache is `%TEMP%/dsh-codeslice/<sha1(root)>.{index,notes,layouts}.json`.
   `lib/persist.js` exists because `JSON.stringify` turns a `Map` into `{}` silently: the derived
   symbol index and the retrieval postings are dropped on write and rebuilt on read, so the cache
   stays a document a human can inspect.

---

## 6. Host tools (model-facing, read-only)

| tool | mirrors |
|---|---|
| `codeslice_graph_query` | `graph_query(question, mode, depth, token_budget)` |
| `codeslice_graph_node` | `graph_neighbors` + `node_context` |
| `codeslice_graph_path` | `graph_path(source, target, max_hops)` |
| `codeslice_graph_rationale` | `graph_rationale(label)` |
| `codeslice_search` | `search_code(query, top_k)` |
| `codeslice_definition` | `definition(path, line)` |
| `codeslice_references` | `references(symbol)` |
| `codeslice_outline` | file declarations + imports |
| `codeslice_notes` | notes search/read |
| `codeslice_index` | `summary` + call-resolution health |
| `codeslice_symbol` / `callers` / `inheritance` / `explain` / `hot` | v0.2.0 aliases, kept so old prompts still work |

Rendered text preserves the original layout byte-for-byte (`Node: … / Kind: …  Source: … /
--> target [relation] [CONFIDENCE]`, including `"1 edges"` and the double space), because a model
reading that is the whole point of porting the renderer instead of inventing JSON.

---

## 7. Client panel

Registered into `dsh-better-sidebar`; degrades to `sidebar.panellist` when absent.

| registration | id | shape |
|---|---|---|
| `registerTab` | `codeslice:graph` | canvas + inspector rail (families, communities, search, relation groups) |
| `registerTab` | `codeslice:notes` | folder tree + note list + reader + anchor drift |
| `registerTab` | `codeslice:outline` | file picker + declarations + imports + rationale |
| `registerFileViewer` | `codeslice:annotated` | annotated read-only view (`fsRead`, priority −200) |
| `conversation.composer.dock` | `codeslice:selection` | selection chip |

Theme: only the 15 `--dsw-alias-*` / `--dsw-specific-sidebar-fill` tokens; every selector prefixed
`cs-`; no bare element selectors, no `:root`, no `!important`.

---

## 8. Verification status

| check | result |
|---|---|
| `node --check` on every host module and every client source | pass |
| `dev/build-client.mjs --check` | bundle current (15 modules, 5,995 lines) |
| `dev/host-test.mjs D:\dsh-CodeSlice` | **68/68** |
| `dev/host-test.mjs D:\CodeSplit` | **68/68** — 303 files, 39,042 lines, 2,655 nodes, 5,283 edges, 49 communities, 328 rationale nodes, 53 `inherits`, call resolution 2,395/2,960 (81 %) |
| `dev/cache-probe.mjs` (both roots) | **18/18** — build → persist → load → search/definition/references/slice all answer from the *loaded* document |
| `dev/robustness.mjs` | **22/22** — empty workspace, missing root, unknown ops, path traversal, binary content, minified files, invalid source, and the security surface (no `child_process`/`eval`/`new Function`/network) |
| `dev/workflow-probe.mjs` | **19/19** — note create → read → drift → folder → notes graph → export → annotation lifecycle → delete |
| `dev/audit-checks.mjs` | **27/27** — vocabulary honesty (never emits `references`/`implements`/`declares`), renderer byte parity, both tokenizers, the language gate (refused in TS, allowed in Go), community detection and labels, all four `topologyKey` properties, the security surface, 403 on an unadmitted peer, and contract drift against `WIRE.md` |
| `dev/harness/run.mjs` (420×760) | pass, exit 0 — first paint 236 ms, 240 nodes / 544 edges; node→inspector→neighbour→open-at-line; family filter 544→253 edges; scope switch 240→77 nodes; park/resume; all three tabs mount; chip renders; disposal removes styles |
| `dev/harness/run.mjs --wide` (1180×340) | pass, exit 0 |
| live GUI at `127.0.0.1:50590` | **requires a DSH restart** — the running Host process (started 14:29) still holds the pre-rebuild module, so `/codeslice/api/*` returns 405 from the SPA fallback and the row reports `inactive`. Verified independently that the route registers and every method answers through the profile's linked copy. |

### Defects found and fixed during verification

Found by my own gates before the independent audit:

| defect | how it surfaced | fix |
|---|---|---|
| A note's anchor stored no `snippet`/`hash`, so every anchor read back as `drifted` | `dev/workflow-probe.mjs` | `makeNote` captures the code text and hash at creation |
| Search truncated its candidate set to the first 40 chunks when no inverted index was present, making hits outside the first few files unfindable | `dev/cache-probe.mjs` | an exhaustive scan scores everything before any cap; only an index-backed candidate list may be capped early |
| `h(Glyph.alert(13))` passed a rendered node as a component type — `OutlinePanel` and `NotesPanel` crashed on error | panel mount probe | the node is passed directly (the glyph function returns an element) |
| Build-script gaps: export detection missed `export function`/`export const`, and a React prelude collided with the module owning those bindings | `dev/build-client.mjs` | declaration-form exports recorded; `icons.js` is the single owner of the React bindings |

### Found by the independent audit

The audit found a **P0 data-loss defect** that no gate of mine covered, because every
probe used one caller at a time.

| sev | defect | fix |
|---|---|---|
| **P0** | `writeJson`'s temp path was `${file}.${pid}.tmp` — per *process*, not per *write*. Two concurrent saves (two panels) shared one temp file and the second `rename` could publish a half-written body. Reproduced at **40/40** runs losing data. | unique temp path (`randomUUID`), `wx` open, **fsync before rename**, and one promise chain per file so writes to the same document queue. |
| **P0** | Even with unique temps, save was a lost update: both callers loaded, both appended, last writer won. Serialising writes alone did not fix it (verified still 40/40). | `updateNotes(root, mutate)` queues the **whole load → mutate → save cycle**, and every mutating notes/annotation op uses it. Now **0/40**. |
| P1 | `readJson` collapsed *absent* and *corrupt*; `loadNotes` returned an empty library for both, so a damaged file was silently replaced by the next write. | `readJsonChecked` separates the cases; on corruption `loadNotes` moves the file to `.corrupt-<ts>` and throws, so the API answers an error instead of accepting a write. |
| P1 | Parking the tab called `scope.dispose()`, permanently killing the request scope, so refresh and resume were dead forever. | added `scope.abort()` (cancels in-flight, stays usable); parking calls `abort()`. |
| P1 | The boot effect never refetched on the parked→visible edge. | track the previous `visible` and refetch on the false→true transition. |
| P1 | `load` depended on `selectedId`, so after a rebuild **every node click refetched status + graph** — a 3-request selection. | read the selection through a ref instead of the dependency list. |
| P1 | Composed notes rendered `### path:undefined-undefined` with a "content unavailable" line, because the composer reads `startLine` while citations use `line`. | `normaliseRef` resolves every citation once (accepting `line` **or** `startLine`), attaches the code, and the same resolved refs feed both the body and the anchors. |
| P1 | `graphSlice` computed `truncated: ordered.length > limit`, but `connectedSlice` already capped at `limit`, so it was **always false** — the canvas never told the reader it was showing a slice. | compare the drawn payload against the whole graph. |
| P1 | The retrieval "term frequency" half was **always 1**: `indexText` returns a token *set* (it must — it is the searchable column), so counting from it can only yield 1. The 75/25 blend degenerated to coverage plus a length tiebreak. | added `tokenStream()` (same rules, repetition preserved) to build a real frequency map, keeping the set for the inverted index. Verified: 60 vs 1. |
| P2 | `dimNode` was computed and never used, so hover dimmed exactly as much as selection (0.42 vs 0.42). | the node's opacity comes from `dimNode` (0.72 hover / 0.42 selection); the CSS class now only carries the transition. |
| P2 | A canvas click did not clear the rail search, so with a query typed the inspector never appeared. | `choose()` calls `setQuery('')`. |
| P2 | The `meaning` family could never be shown: the client always sent `DEFAULT_FAMILIES` and the server prunes links by family, so the legend chip was a no-op. | the current family set is sent with every `graph` call, and toggling refetches. |
| P2 | `notes-panel` read `anchor.line`, but the Host sends `startLine`; every anchor tooltip said `:1`. | read `startLine`, falling back to `line`. |
| P2 | `looksGenerated` discarded any file with one line over 1600 chars, so a hand-written module with one long SQL string vanished from the graph *and* retrieval. | weigh long-line *ratio* and mean width; a lone long literal is no longer fatal. Verified across 6 cases. |
| P2 | `WIRE.md` documented `search.files` as `{path, score, hits}` and anchors as `{line}`; the Host sends `{path, lines, language}` and `{startLine, endLine, snippet, hash}`. | WIRE corrected to the shipped shapes, with the `codeRefs` vs `anchors` distinction spelled out. |
| P2 | The truncation notice used the sliced length as its total. | uses `graph.total.nodes` from the Host. |
| P3 | Two modules declared the same top-level `baseName` — legal for `function` (last wins) but the same mistake with `const` is a fatal load-time SyntaxError, and nothing enforced it. | one copy renamed; `build-client.mjs` now fails on duplicate `const`/`let`/`class` top-level bindings and warns on duplicate functions. |
| P3 | `--check` only compared text, so a broken source that was regenerated still passed. | `--check` compiles the factory body with `new Function` before comparing. |
| P3 | `connection` was captured at inject time; had it not been composed yet, the route would have served unadmitted. | resolved per request. |
| P3 | README claimed 15 theme tokens; there are 14 (13 alias + `--dsw-specific-sidebar-fill`), and zero hex literals. | README corrected. |

Note on the audit's own reliability: it also reported the notes corruption as
"15/40 invalid JSON". That figure came from the shared-temp collision, which the fix
removes entirely; the current probe reports 0/40 in both categories.

### Known limits

- The scanner is regex + masking, not tree-sitter: type flow, generic instantiation and macro
  expansion are invisible. That is the price of zero runtime dependencies.
- The resolver refuses to guess: cross-file calls bind only through same-file → import-bound →
  globally-unique. `calls_dropped` is therefore non-zero by design; read
  `calls_extracted / calls_project` for the resolution rate.
- No embeddings, so "same meaning, different words" queries find nothing. Chinese works through
  bigrams, not semantics.
