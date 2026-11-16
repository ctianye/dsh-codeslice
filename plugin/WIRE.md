# CodeSlice plugin — wire contract (v1)

Both halves are written against this file. The Host half (`index.js`, `lib/*`) owns it; the
browser half (`client/src/*`) consumes it. **Anything not listed here is not part of the
contract** and the client must not depend on it.

Transport: `POST /codeslice/api/<method>` with a JSON body, `content-type: application/json`.
Every response is `200 {ok:true, value}` or `4xx/5xx {ok:false, error:{code, message}}`.
`GET` with query parameters is accepted for the same methods so a method can be curled.

Every method accepts an optional `root` (absolute workspace directory) and an optional `cwd`
(the session's directory, used when `root` is absent). The Host resolves one workspace per
request and caches the build per root.

---

## 1. `status`

The panel's first call. Cheap when the index is warm.

```json
{
  "root": "D:\\CodeSplit",
  "builtAt": 1794464941630,
  "buildMs": 512,
  "cached": true,
  "schema": 1,
  "topologyKey": "9f2c…",
  "files": 197,
  "lines": 39132,
  "nodes": 2261,
  "edges": 13042,
  "symbols": 2008,
  "rationale": 96,
  "external": 157,
  "communities": 23,
  "languages": {"python": 119, "typescript": 59},
  "byRelation": {"calls": 2383, "contains": 2008},
  "callsExtracted": 2395,
  "callsDropped": 611,
  "callsProject": 3006,
  "truncated": false,
  "skippedLarge": 4,
  "skippedGenerated": 105,
  "notes": 12,
  "anchors": {"fresh": 8, "moved": 2, "drifted": 1, "missing": 1}
}
```

`refresh: true` forces a rebuild and reports `rebuilt: true` plus the fresh `buildMs`.

---

## 2. `graph`

A slice of the graph, already trimmed to what the canvas can draw.

```json
{
  "scope": "workspace" | "file" | "focus" | "search",
  "path": "backend/app/graph/store.py",
  "focus": "backend/app/graph/store.py::function::build::412",
  "nodes": [
    {
      "id": "…::function::build::412",
      "label": "build",
      "kind": "function",
      "path": "backend/app/graph/store.py",
      "line": 412,
      "endLine": 480,
      "degree": 37,
      "community": 4,
      "communityLabel": "store.py +6",
      "weight": 12.5,
      "memberCount": 37,
      "aggregated": true
    }
  ],
  "links": [
    {
      "id": "0",
      "source": "…",
      "target": "…",
      "relation": "calls" | "community",
      "family": "behaviour" | "dependency",
      "confidence": "EXTRACTED",
      "line": 431,
      "count": 9
    }
  ],
  "total": {"nodes": 2261, "edges": 13042},
  "truncated": true,
  "aggregated": true
}
```

* `scope: workspace` — the whole repository. Above `limit` nodes the Host does
  **not** drop the tail; it returns one meta-node per community (`kind:
  "community"`, `memberCount`, `aggregated: true`) and one `community` link per
  inter-community pair, which is graphify's own degradation. The panel then
  shows every community rather than the busiest corner.
* `scope: file` — that file's node + everything it contains/touches, one hop.
* `scope: focus` — the one-hop neighbourhood of `focus` (accepts a node id or a name).
* `scope: search` — nodes matching `query` and their one-hop neighbours.

`limit` defaults to 5000 (the Host config `maxGraphNodes`). `depth` applies to
`file`/`focus` (default 1, cap 3). `families` (array) filters by relation family;
omitted means `DEFAULT_FAMILIES`.

Community labels follow the desktop rule: the majority member file's basename,
`+N` when the community spans N further files, singleton/zero-degree nodes pooled
into `未分类`, and duplicate labels disambiguated with a representative symbol.
Graphify membership is kept; only ordering, pooling and names are rewritten.

---

## 3. `node`

The inspector for one node. Everything the rail shows, in one round trip.

```json
{
  "node": {"id":"…","label":"build","kind":"function","path":"…","line":412,"endLine":480,
           "language":"python","signature":"def build(self, root: Path) -> Graph:",
           "degree":37,"community":4,"communityLabel":"store.py +6","parent":null},
  "rationale": [{"text":"Community detection runs here because…","origin":"comment","line":405}],
  "groups": [
    {"key":"callers","label":"Callers","items":[
      {"id":"…","label":"store_graph","kind":"function","path":"…","line":88,
       "relation":"calls","confidence":"EXTRACTED","outgoing":false}
    ]},
    {"key":"calls","label":"Calls","items":[…]},
    {"key":"dependencies","label":"Dependencies","items":[…]},
    {"key":"structure","label":"Structure","items":[…]},
    {"key":"meaning","label":"Explains","items":[…]},
    {"key":"hierarchy","label":"Extends","items":[…]}
  ],
  "siblings": [{"id":"…","label":"load","kind":"function","line":300}],
  "context": "Node: build\n  Kind: function  Source: …:L412\n…"
}
```

`groups` is ordered callers → calls → dependencies → structure → meaning → hierarchy, and
empty groups are omitted. `context` is the model-facing text renderer's output for this node
(`graph_service.context_for_node`), reused so the panel and the model see the same words.

---

## 4. `search`

```json
{
  "query": "社区检测",
  "definitions": [{"id":"…","label":"detect_communities","kind":"function","path":"…",
                   "line":120,"signature":"def …","score":79}],
  "files": [{"path":"…","lines":729,"language":"python"}],
  "records": [{"path":"…","line":131,"endLine":160,"symbol":"detect_communities",
               "kind":"function","language":"python","signature":"def …",
               "snippet":"…","score":0.71,"retriever":"keyword"}],
  "total": {"definitions": 4, "files": 2, "records": 9}
}
```

`definitions` is the symbol index (names and paths). `files` is a *path* match list —
the files whose path contains the query — so it answers "which file is this", not
"which file is most relevant"; `lines` and `language` are the useful fields there.
`records` is content retrieval over the built chunks; when the query has no token
the array is empty rather than an error. `limit` defaults to 20 per group (cap 100).

---

## 5. `outline`

```json
{
  "path": "backend/app/graph/store.py",
  "found": true,
  "lines": 729,
  "language": "python",
  "symbols": [{"id":"…","name":"topology_key","kind":"function","line":112,
               "endLine":141,"signature":"def topology_key(graph: dict) -> str:"}],
  "imports": [{"module":"hashlib","names":["sha256"],"line":5,"resolved":null}],
  "importedBy": ["backend/app/graph/service.py"],
  "rationale": [{"text":"…","line":12,"origin":"comment","owner":"…"}]
}
```

`resolved` is the in-tree path an import lands on, or `null` for an out-of-corpus module.

---

## 6. `notes`

`op` selects the operation; every op takes `root`.

| op | extra fields | returns |
|---|---|---|
| `list` | `folder`, `query` | `{folders:[…], notes:[…]}` |
| `read` | `id` | `{note:{…}}` |
| `create` | `title`, `body`, `folderId`, `codeRefs`, `conversationId` | `{note:{…}}` |
| `update` | `id`, `title`, `body`, `folderId` | `{note:{…}}` |
| `delete` | `id` | `{deleted:true}` |
| `folders` | — | `{folders:[…]}` |
| `createFolder` | `name`, `parentId` | `{folder:{…}}` |
| `graph` | — | the notes graph, same node/link shape as `graph` |
| `export` | `id` | `{path:"…"}` — writes a Markdown file next to the workspace cache |

A note:

```json
{
  "id": "n_9f2c",
  "title": "社区检测为什么要固定随机种子",
  "folderId": "f_root",
  "body": "## 知识点\n…",
  "createdAt": 1794464941630,
  "updatedAt": 1794464941630,
  "codeRefs": [{"path":"backend/app/graph/cluster.py","line":66,"endLine":92,"symbol":"detect_communities"}],
  "anchors": [
    {
      "id": "a_1",
      "path": "backend/app/graph/cluster.py",
      "startLine": 66,
      "endLine": 92,
      "symbol": "detect_communities",
      "snippet": "…the code as it read when the anchor was taken…",
      "hash": "sha256 of the snippet",
      "status": "fresh",
      "shift": 0,
      "checkedAt": 1794464941630
    }
  ],
  "conversationId": null
}
```

`codeRefs` uses `line`/`endLine` (the citation shape a caller writes); `anchors` uses
`startLine`/`endLine` plus the captured `snippet` and `hash` — that pair is what lets a
later check distinguish *moved* (same code, new line) from *drifted* (the code changed).
`status ∈ {fresh, moved, drifted, missing}` and `shift` is the line delta when it moved.

---

## 7. `annotations`

Line-range notes attached to code. `op` selects the operation.

| op | extra fields | returns |
|---|---|---|
| `list` | `path` | `{annotations:[…]}` |
| `create` | `path`, `startLine`, `endLine`, `title`, `body` | `{annotation:{…}}` |
| `update` | `id`, `title`, `body` | `{annotation:{…}}` |
| `delete` | `id` | `{deleted:true}` |

```json
{"id":"an_1","path":"backend/app/graph/cluster.py","startLine":60,"endLine":92,
 "title":"Louvain 调用","body":"种子固定为 0…","createdAt":1794464941630,
 "drift":{"status":"fresh","shift":0}}
```

`drift.status ∈ {fresh, moved, drifted, missing}`; `shift` is the line delta when the anchor
moved (see `spec §10`).

---

## 8. `files`

A flat, filterable list for the outline tab's file picker.

```json
{"files":[{"path":"…","lines":729,"language":"python","symbols":31}],"total":197}
```

`query` filters by path substring; `limit` caps the returned rows (default 500, cap 2000).

---

## 9. Host tools

The model-facing surface. Each is registered with `ctx.tools.register`; all are read-only.

`codeslice_graph_query`, `codeslice_graph_node`, `codeslice_graph_path`,
`codeslice_graph_rationale`, `codeslice_search`, `codeslice_definition`, `codeslice_references`,
`codeslice_outline`, `codeslice_notes`, `codeslice_index`, plus the v0.2.0 aliases
(`codeslice_symbol`, `codeslice_callers`, `codeslice_inheritance`, `codeslice_explain`,
`codeslice_hot`) which map onto the new pipeline.

Tool results are `[{type:'text', text}]` with the CodeSlice renderer's layout preserved
(`spec backend §5.7`), because a model reading `Node: … / Kind: … / --> target [calls]
[EXTRACTED]` is the whole point of porting the renderer instead of inventing JSON.
