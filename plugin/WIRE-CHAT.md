# CodeSlice plugin — wire contract v2 (conversation · knowledge base · RAG)

This file **extends** `WIRE.md` (v1). Everything in v1 still holds. This adds the
conversation workbench: chat, note-from-chat, code reading with selection, RAG
configuration, and retrieval-backed citations.

Transport is unchanged: `POST /codeslice/api/<method>`, envelope
`{ok:true, value}` / `{ok:false, error:{code, message}}`. The one exception is
`ask`, which answers `text/event-stream` (see §13).

Every method still accepts `root` / `cwd`.

---

## 10. Knowledge base storage

The note library is **user data** and already lives in `<state>/<rootKey>.notes.json`
(`WIRE.md §6`). v2 adds two sibling documents, both per root:

| file | owner | contents |
|---|---|---|
| `<rootKey>.notes.json` | `lib/store.js` | folders, notes, annotations, anchors (v1) |
| `<rootKey>.chat.json` | `lib/chat.js` | conversations and their turns |
| `<rootKey>.rag.json` | `lib/rag.js` | retrieval budget settings (`topK`, `rrfK`, families, toggles) |
| `<rootKey>.vectors.json` | `lib/vectors.js` | vector manifest: model, dims, hash → offset |
| `<rootKey>.vectors-<nonce>.bin` | `lib/vectors.js` | packed Float32 vectors (one generation per manifest) |

Both new documents follow the **same durability rules** as notes: atomic temp +
fsync + rename, one write chain per file, and read-modify-write through a queue
(`updateChat` / `updateRag`). A corrupt file is moved aside and refused, never
read as empty.

### Conversation record

```json
{
  "id": "c_9f2c",
  "title": "社区检测为什么要固定随机种子",
  "mode": "snippet" | "project",
  "createdAt": 1794464941630,
  "updatedAt": 1794464941630,
  "path": "backend/app/graph/cluster.py",
  "startLine": 66,
  "endLine": 92,
  "selectedCode": "…the code as it read when the conversation was opened…",
  "graphAnchor": "…node id, when the question came from a graph node…"
}
```

### Turn record

A turn is one user question plus everything the assistant produced for it.

```json
{
  "id": "m_1a2b",
  "role": "user" | "assistant",
  "text": "为什么种子要固定？",
  "createdAt": 1794464941630,
  "retrieval": [
    {"path":"backend/app/graph/cluster.py","startLine":66,"endLine":92,
     "symbol":"detect_communities","kind":"function","score":0.71,"retriever":"keyword"}
  ],
  "citations": [
    {"path":"backend/app/graph/cluster.py","startLine":66,"endLine":92,
     "symbol":"detect_communities","hash":"…","status":"fresh"}
  ],
  "usage": {"inputTokens": 1234, "outputTokens": 260},
  "noteId": null,
  "error": null
}
```

`retrieval` is what the retriever returned (may be empty); `citations` is what the
answer actually referenced and what the note's 关联代码 section is built from.
`citations` is **never** invented by the model — the Host extracts them from the
retrieved set, so a note can never cite a line range that was not retrieved.

---

## 11. `chat`

`op` selects the operation. All ops take `root`.

| op | extra fields | returns |
|---|---|---|
| `list` | `query`, `limit` | `{conversations:[…]}` newest first |
| `read` | `id` | `{conversation:{…}, turns:[…]}` |
| `create` | `title`, `mode`, `path`, `startLine`, `endLine`, `selectedCode`, `graphAnchor` | `{conversation:{…}}` |
| `rename` | `id`, `title` | `{conversation:{…}}` |
| `delete` | `id` | `{deleted:true}` |
| `clear` | `id` | `{conversation:{…}}` — drops the turns, keeps the row |
| `appendTurn` | `id`, `turn` | `{turn:{…}}` — used by `ask`'s writer |

`list` returns rows without `turns`; `read` returns them. `limit` defaults to 50.

---

## 12. `code`

Read one file's lines for the code pane. Path traversal is refused (`safeJoin`).

```json
{
  "path": "backend/app/graph/cluster.py",
  "found": true,
  "language": "python",
  "lines": 729,
  "startLine": 60,
  "endLine": 100,
  "text": "def detect_communities(…)\n…",
  "symbols": [{"id":"…","name":"detect_communities","kind":"function","line":66,"endLine":92}],
  "annotations": [{"id":"an_1","startLine":60,"endLine":92,"title":"Louvain 调用","drift":{"status":"fresh","shift":0}}],
  "notes": [{"id":"n_9f2c","title":"…","startLine":66,"endLine":92}]
}
```

`startLine`/`endLine` are 1-based inclusive; omitted means the whole file, capped
at `maxLines` (default 2000). `symbols` are the declarations overlapping the
window, so the code pane can draw its outline gutter. `annotations` and `notes`
are the ones overlapping the window — this is what makes selection-aware
decoration possible without a second round trip.

---

## 13. `ask` — streaming

`POST /codeslice/api/ask` answers `text/event-stream`. It is the **only**
streaming method; a browser `EventSource` cannot POST, so the client reads the
body with `fetch` + a `ReadableStream` reader and splits on `\n\n`.

Request:

```json
{
  "root": "D:\\CodeSplit",
  "conversationId": "c_9f2c",
  "text": "为什么种子要固定？",
  "useContext": false,
  "graphAnchor": "…node id…",
  "title": "关于 cluster.py 第 66-92 行",
  "mode": "snippet",
  "path": "backend/app/graph/cluster.py",
  "startLine": 66,
  "endLine": 92,
  "selectedCode": "def detect_communities(…)\n…",
  "rag": {"topK": 8, "families": ["behaviour","dependency"], "chunkLines": 60}
}
```

When `conversationId` is absent the Host creates a conversation first and reports
it in the `meta` frame, so a first question works without a create round trip.

`mode` / `path` / `startLine` / `endLine` / `selectedCode` are **per turn** and
optional. They are what makes one dialog reusable across the workbench:

- when the conversation is created, they become its stored subject and its
  title is used verbatim (`title`, clipped only);
- when the conversation already exists, a complete snippet still overrides the
  context for **this turn** — the reader may keep one thread and ask about a
  different selection without discarding the history;
- a `mode: "snippet"` without code is ignored; it never creates an empty
  `## 选中代码` stage. The stored conversation keeps its own selection, which is
  the fallback for a continuation question sent with no selection;
- `graphAnchor` is likewise per turn: a graph node's questions share the same
  conversation, with that node's neighbourhood as context.

Frames, in order:

```
data: {"type":"meta","conversationId":"c_9f2c","turnId":"m_1a2b","model":"…"}

data: {"type":"retrieval","chunks":[{"path":"…","startLine":66,"endLine":92,
        "symbol":"detect_communities","kind":"function","score":0.71,"retriever":"keyword"}]}

data: {"type":"delta","text":"种子固定是因为"}

data: {"type":"citation","path":"…","startLine":66,"endLine":92,"symbol":"…"}

data: {"type":"done","assistantTurnId":"m_2c3d","usage":{"inputTokens":1234,"outputTokens":260}}
```

Error frame (terminal): `{"type":"error","message":"…","code":"…"}`. The stream
always ends after exactly one `done` or one `error`.

The Host persists the user turn before dispatch and the assistant turn on
completion, so a dropped connection loses at most the in-flight answer.

### Retrieval policy

`ask` assembles context in this order, and the order is the contract:

1. **The conversation's own selection** — when `mode: "snippet"`, the selected
   lines are the primary subject and are always included verbatim.
2. **The knowledge graph** — `graphAnchor` (a node id) contributes that node's
   neighbourhood via `nodeContext`; without an anchor the graph contributes the
   nodes named in the question (`scoreNodes`/`pickSeeds`).
3. **The knowledge base** — notes whose anchors overlap the selection or whose
   body matches the question, capped at 3 and rendered as `笔记「title」` blocks.
4. **RAG chunks** — keyword `searchRecords` and semantic `retrieveVectorRows`,
   fused with the graph seeds by `rrfFuse`. Chunking is the desktop's fixed
   banding (60/220/8000); `topK`/`rrfK` only budget the prompt. If no vector index
   exists (or Ollama is down, or the configured model changed) the vector list is
   empty and fusion degrades to keyword + graph, which is a working answer.

A turn with `useContext: false` and a selection still gets (1); it does not get
the whole file. `useContext: true` adds the enclosing symbol.

---

## 14. `noteFromChat`

Turn a conversation into one note. Synchronous: one short model call, and the
caller only needs the finished note.

```json
{"conversationId":"c_9f2c", "messageId": null}
```

`messageId` absent means "the whole conversation"; present means "this answer".
Returns the note record exactly as `notes` `create` does (`WIRE.md §6`), plus:

```json
{"summaryFailed": false, "summaryError": null}
```

When the model call fails the Host still saves the raw answer as the note body and
reports `summaryFailed: true` — a failed summary must not lose the note.

The note template is the desktop app's, verbatim:

```
# <title>

## 知识点      what the code does, what the concept is
## 关联代码    the cited ranges, copied verbatim with their location
## 要点        load-bearing details, assumptions and edge cases
## 何时使用    when to reach for this approach (and when not to)
```

`## 关联代码` is assembled from the turn's `citations`, never from the model.

---

## 15. `rag`

`op` selects the operation.

| op | extra fields | returns |
|---|---|---|
| `read` | — | `{config, index}` |
| `write` | `config` | `{config, index}` — merged over the defaults, validated |
| `status` | — | `{config, index}` — polled while `index.state === "running"` |
| `index` | `force?: bool` | `{index}` — starts a background build, returns immediately |

```json
{
  "topK": 8,
  "rrfK": 60,
  "families": ["behaviour","dependency","structure","hierarchy"],
  "includeNotes": true,
  "includeGraph": true
}
```

**Chunking is not a setting.** The desktop's `FALLBACK_LINES 60`,
`MAX_CHUNK_LINES 220` and `MAX_CHUNK_CHARS 8000` are constants in
`lib/retrieval.js`. A client that still sends `chunkLines`/`maxChunkLines`/
`maxChunkChars` gets them dropped by `normaliseRagConfig` — an index must cut the
same code the same way for every reader. `topK` (1–24) and `rrfK` (1–100) stay
clamped because they only budget one prompt.

`index` describes the vector index:

```json
{
  "state": "idle" | "running" | "ready" | "error",
  "chunks": 420, "vectors": 420, "missing": 0,
  "model": "bge-m3", "indexedModel": "bge-m3", "dims": 1024,
  "builtAt": 1794497559309,
  "total": 0, "done": 0, "failed": 0,
  "error": null
}
```

The build is **incremental**: a chunk whose content hash already has a vector
from the configured model is not re-embedded. `force: true` ignores existing
vectors but still reuses the document's chunks. Vector storage is a JSON
manifest plus a packed Float32 binary; a truncated blob is treated as "no
vectors" rather than scored from shifted bytes. A failed batch is retried input
by input, so one over-long chunk degrades to a null vector instead of failing the
whole run. With no vectors, `ask` keeps working keyword-only.

---

## 16. Host tools (v2 additions)

| tool | purpose |
|---|---|
| `codeslice_ask` | Answer a question from the workspace with retrieval + graph context. Returns the answer plus its citations. |
| `codeslice_notes_search` | Search the note knowledge base by title/body, returning note ids and matched anchors. |
| `codeslice_note_create` | Write a note into the knowledge base (title, body, code refs). |
| `codeslice_rag_config` | Read or write the RAG settings. |

All other v1 tools are unchanged.

---

## 17. Workspace, models, and session notes (v2.1)

These three methods support the "workspace in the normal conversation" surface.

### `files`

`POST /codeslice/api/files` with `{root}` returns the indexed file list:

```json
{
  "files": [{"path":"plugin/lib/answer.js","lines":830,"bytes":31200,"language":"javascript"}],
  "dirs":  [{"path":"plugin/lib","files":12,"lines":9100}]
}
```

It reads the same built document `code` and `graph` read, so skipped bundles and
binaries are absent here too. Both arrays are sorted by path.

### `models`

`op` selects the operation. Settings live in `<state>/<rootKey>.models.json`.

| op | extra fields | returns |
|---|---|---|
| `read` | — | `{settings, presets}` |
| `write` | `settings` | `{settings, presets}` |
| `status` | — | `{settings, presets, ollama}` |
| `test` | — | `{settings, result}` |

```json
{
  "embedding": {"model":"bge-m3","base_url":"http://127.0.0.1:11434/v1","api_key":"ollama"},
  "chat": {"system_prompt": ""}
}
```

`status` probes `GET <origin>/api/tags`; `test` calls `POST <origin>/api/embeddings`.
The same saved model/base URL drive the vector index (`rag` `index`): embedding
batches go to `<origin>/v1/embeddings` with a per-input fallback to
`<origin>/api/embeddings`, 32 inputs per request, 6000/3000/1500-character
shortening on context rejection.
**Only loopback base URLs are accepted** (`127.0.0.1`, `localhost`, `::1`); a
remote URL is refused with `remote-url-refused`, so a typo cannot turn this into
a network client. A failed probe is a value (`available:false, error`) rather
than a throw. `chat.system_prompt` is appended after CodeSlice's built-in rules
for every `ask` in that workspace; it cannot relax the citation rules.

### `noteFromSession`

Turn the **current DSH session** into one knowledge-base note.

```json
{"root":"…","sessionId":"session-…","title":"对话笔记",
 "path":"plugin/lib/answer.js","startLine":227,"endLine":240}
```

The Host reads the session surface through `ctx.sessionQuery.readSurface(sessionId)`
(the session log is the source of truth; the client sends only the identity),
projects user/assistant text, and runs the same `noteFromConversation` template
as `noteFromChat`. The optional `path/startLine/endLine` become the note's
`关联代码` anchor when the conversation was about a selection. An absent
`sessionQuery` reports `session-query-unavailable`; an empty surface reports
`empty-session`. The result is the `noteFromChat` shape (note + `summaryFailed`).

### Graph backend

Host row config gains:

```yaml
graphBackend: builtin   # builtin | auto | graphify
graphifyPath: ''        # empty = graphify on PATH
graphifyTtlMs: 600000
graphifyTimeoutMs: 180000
```

`auto`/`graphify` runs `graphify extract <root> --code-only --no-cluster --out <state>`
then `graphify cluster-only <state> --no-label --no-viz`, and adapts graph.json
(`nodes`/`edges` or NetworkX `links`) to this plugin's node/edge vocabulary.
Graphify's membership is kept, but the **legend** is the desktop's: singleton and
zero-degree nodes are pooled into `未分类`, communities are ordered by size, and
each is named after its majority member file (`api.ts +6`), with duplicate labels
disambiguated by a representative symbol. `builtin` keeps the zero-process
analyzer; any graphify failure falls back to it and records `graphifyError` on
the document. This is the only Host code allowed to spawn a process
(`shell:false`, fixed argv); network calls remain loopback-Ollama only.

### Graph size and aggregation

`maxGraphNodes` defaults to **5000**. `scope: workspace` returns the whole graph
up to that budget. Above it, the Host returns graphify's aggregated view: one
`kind:"community"` node per community (carrying `memberCount`) and one `community`
link per inter-community pair. The payload reports `aggregated:true`, and `total`
still describes the original graph, so the canvas caption can say "18 communities
of 866 nodes" instead of showing a silently truncated map.

## 18. Client assets

Two lazy scripts are served from the plugin directory:

```
GET /codeslice/assets/vis-network.min.js   # graphify's pinned renderer
GET /codeslice/assets/editor.js            # CodeMirror 6 chunk
```

Only GET is accepted, the file name is looked up in a fixed allow-list (never
joined from the request), and the same `connection.requestRejection` admission
check as `/codeslice/api` applies. The client resolves the URL through
`betterSidebar.hostRouteUrl('codeslice/assets/…')` so a reverse-proxied GUI and
the desktop shell's `dsh-app://` origin keep working.

`vis-network.min.js` is version **9.1.6**, the version graphify's HTML export
pins. `editor.js` is produced by `node dev/build-editor.mjs` (esbuild) and is
committed; rebuilding it is a developer step, never a runtime dependency.
