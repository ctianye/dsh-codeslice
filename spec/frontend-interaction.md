# CodeSlice frontend — interaction & rendering specification

Source of truth: `D:\CodeSplit\frontend\src` (React 18 + TypeScript, Vite, Monaco, vis-network).
Everything below is transcribed from that tree. **All `path:line` citations are relative to
`D:\CodeSplit\frontend\src`** unless the path starts with `frontend/`.

Target host: a plugin panel inside a web chat app, written with plain `React.createElement`,
themed only through CSS custom properties, with **no Monaco, no vis-network, no component
library, no icon package**. Sections that cannot survive that constraint are called out in
§11 instead of being quietly approximated.

Two facts that shape the whole port:

1. The app is an Electron desktop shell with a titlebar drag region, window controls and a
   terminal dock (`layout.css:14-141`, `TopBar.tsx:19-99`). The host already owns those.
2. Every colour resolves through a token declared in `base.css:7-114`; the graph canvas is the
   single exception because `<canvas>` cannot read custom properties, so it keeps its own
   palette in `graphTheme.ts:27-38`, `graphTheme.ts:102-119`.

---

## 0. Component / state map (orientation)

| Layer | File | What it owns |
| --- | --- | --- |
| Shell | `App.tsx:30-192` | pane widths, welcome/settings modals, snippet hand-off, sidebar remount epoch, terminal open flag |
| Global state | `state/AppState.tsx:185-613` | project, tabs, active tab, citation highlight, nav history, note view, graph focus/scope, theme, sidebar tab |
| Editor pane | `components/CodePane.tsx:57-1400` | file fetch, selection bar, line picking, annotations, doc editing, navigation, graph locate |
| Tab strip | `components/EditorTabs.tsx:21-177` | drag reorder, middle-click close, context menu |
| Graph | `components/graph/GraphView.tsx:50-419` | payload cache/refresh, filters, search, rail modes, header |
| Graph canvas | `components/graph/GraphCanvas.tsx:155-581` | vis-network instance, physics settle, labels, dimming, zoom/fit |
| Notes library | `components/NotesPanel.tsx:46-589` | folder tree, note list, move menu, create forms |
| Note reader | `components/NoteReader.tsx:20-287` | read/edit modes, retitle, export, move, delete |
| Markdown | `components/Markdown.tsx:35-537` | block+inline parser, citations inline, code copy |
| Citations | `components/CitationChip.tsx:21-52`, `lib/citations.ts:4-24` | chip rendering, `path:line` label |

The workspace is a **flex row of three panes joined by two 5 px splitters**
(`App.tsx:139-186`, `layout.css:145-158`, `layout.css:182-207`). All three panes are live at
once: file tree / conversations / notes in the left pane, code-or-note-or-graph in the middle,
chat on the right. Nothing is a modal except the nav picker, settings and the release notice.

---

## 1. Layout

### 1.1 Shell

```
.app-shell                     column: TopBar 46px / .workspace 1fr          (App.tsx:136, layout.css:5-10)
├─ header.topbar               46px, flex 0 0 46px, -webkit-app-region: drag (TopBar.tsx:20, layout.css:14-27)
└─ .workspace                  display:flex; min-height:0                   (layout.css:145-150)
   ├─ .pane                    flex: 0 0 <sidebarWidth>px                   (App.tsx:140)
   │  └─ <Sidebar>             tabs: 文件 / 对话 / 笔记                      (Sidebar.tsx:33-54)
   ├─ .splitter                flex 0 0 5px, cursor col-resize              (Splitter.tsx:55-69)
   ├─ .pane.editor-pane-host   flex: 1 1 auto                                (App.tsx:146)
   │  ├─ <EditorTabs>          42px strip                                   (tabs.css:20-29)
   │  ├─ .editor-pane-body     flex 1, holds graph | note | code             (App.tsx:150-164, tabs.css:12-18)
   │  └─ <TerminalPanel>       docked under the editor, 120–480px           (App.tsx:167-171)
   ├─ .splitter (invert)       right pane grows as the pointer moves right   (App.tsx:174-181)
   └─ .pane                    flex: 0 0 <chatWidth>px                      (App.tsx:183)
      └─ <ChatPane>
```

Persisted layout keys (localStorage, `hooks/useAsync.ts:7-34`):

| key | default | notes |
| --- | --- | --- |
| `codeslice.sidebarWidth` | `268` | `App.tsx:50` |
| `codeslice.chatWidth` | `430` | `App.tsx:51` |
| `codeslice.terminalOpen` | `false` | `App.tsx:48` |
| `codeslice.terminalHeight` | `220` (min 120, max 480) | `TerminalPanel.tsx:11-14` |
| `codeslice.graphRailPct` | `46` (min 20, max 72) | `GraphView.tsx:38-40`, `:64` |
| `codeslice.theme` | `'light'` | `AppState.tsx:196` |
| `codeslice.sidebarTab` | `'files'` | `AppState.tsx:197`, validated against `['files','chats','notes']` at `:203` |
| `codeslice.activeConversation` | `null` | `AppState.tsx:190-193` |
| `codeslice.lastProjectId` | — | `App.tsx:98`, restored at `App.tsx:62-92` |

### 1.2 Splitters — exact geometry and keyboard

`components/Splitter.tsx`:

* Pointer drag: `delta = (clientX − startX) × (invert ? −1 : 1)`; result is
  `clamp(startValue + delta)` where `clamp` is `Math.round(Math.min(max, Math.max(min, v)))`
  (`Splitter.tsx:23`, `:27-30`).
* Bounds per instance: sidebar `min=200 max=520` (`App.tsx:144`); chat `min=320 max=760`,
  `invert` (`App.tsx:174-181`); component defaults `160 / 900` (`Splitter.tsx:19`).
* While dragging: `document.body.style.cursor = 'col-resize'` and `userSelect = 'none'`,
  cleared on mouseup (`Splitter.tsx:32-41`).
* Keyboard: `ArrowLeft` / `ArrowRight`, step **10 px**, **40 px** with Shift; direction flips
  under `invert` (`Splitter.tsx:44-53`).
* Visual: 5 px track, `::after { inset: 0 2px; background: var(--border) }`, hover/drag/focus
  turns it `var(--accent)` (`layout.css:182-207`).
* A11y: `role="separator"`, `aria-orientation="vertical"`, `aria-label`, `aria-valuenow`
  (`Splitter.tsx:57-62`).

### 1.3 The middle pane is a three-way switch

`App.tsx:154-163` picks, in order:

1. `graphTabActive && activeGraphScope === 'code'` → `<GraphView>` keyed `${project.id}:code`,
   receiving `initialNodeId` and `focusNonce`.
2. `graphTabActive && activeGraphScope === 'notes'` → `<GraphView scope="notes">` keyed
   `${project.id}:notes` (so both graphs can be open as separate tabs, and switching scopes
   remounts the canvas).
3. `noteView` → `<NoteReader>`.
4. otherwise → `<CodePane>`.

The tab strip is always present, even with zero tabs (it then shows
`还没有打开的文件`, `EditorTabs.tsx:56`), so the editor body never gains/loses a row when the
first file opens.

### 1.4 Graph view internal layout

`graph.css:9-16` states the contract; the code matches it:

* `.graph-view` — column: header **48 px** / body `1fr`; `container-type: inline-size;
  container-name: graph` (`graph.css:19-31`).
* `.graph-body` — `display: grid; grid-template-columns: minmax(0, 1fr) 332px`
  (`graph.css:188-194`). Rail width is fixed at **332 px**; only the graph splitter is
  user-resizable, and only in narrow mode.
* Narrow mode (container ≤ **760 px**, `GraphView.tsx:37`, `graph.css:1298-1319`): rows become
  `minmax(0, 1fr) 7px minmax(0, <railPercent>%)`, computed in JS and applied inline
  (`GraphView.tsx:301-305`). First-paint CSS fallback is `46%` (`graph.css:1303`).
* Narrow detection is a `ResizeObserver` on `.graph-body`, threshold
  `body.clientWidth <= 760` (`GraphView.tsx:79-87`).
* Rail drag (narrow only): pointer capture on a 7 px `.graph-splitter`
  (`GraphView.tsx:325-370`); `railPercentAt = ((rect.bottom − clientY) / rect.height) × 100`,
  clamped to 20…72 (`GraphView.tsx:99-106`). Double-click or `Home` resets to 46; `ArrowUp` /
  `ArrowDown` nudge ±3 (Shift ±8) (`GraphView.tsx:357-369`). While dragging, the body gets
  `cursor: row-resize` and `user-select: none` (`GraphView.tsx:89-97`).
* Header contents, left→right: three stat pills (可见节点 / 关系 / 社区, `toLocaleString('zh-CN')`),
  an optional 更新中… spinner, four family chips (code scope only), then
  `重置筛选` (only when filters differ from default) and the rebuild button
  (`GraphView.tsx:279-297`). Stats hide at container ≤ 860 px; at ≤ 430 px the header wraps and
  the chips move to their own full-width row (`graph.css:1321-1364`).

---

## 2. Graph interaction model (full detail)

Library: **vis-network** (`GraphCanvas.tsx:18-19`, pinned `^10.1.5` in `frontend/package.json`).

### 2.1 Construction and the "settle once" contract

The `Network` is constructed **empty on purpose**; data arrives in a second effect
(`GraphCanvas.tsx:290`, `:404-499`). Options (`GraphCanvas.tsx:254-289`):

```js
physics: {
  enabled: !seedPositions,                 // false when a layout was restored
  solver: 'forceAtlas2Based',
  minVelocity: 0,                          // not vis's default 0.75 — see the comment at :258-262
  forceAtlas2Based: {
    gravitationalConstant: -60,
    centralGravity: 0.005,
    springLength: 120,
    springConstant: 0.08,
    damping: 0.4,
    avoidOverlap: 0.8,
  },
  stabilization: {
    enabled: true,
    iterations: stabilizationIterations(nodes.length),  // 200 if n > 1200 else 140
    updateInterval: 25,
    fit: false,
  },
},
layout: { improvedLayout: false, randomSeed: 42 },
interaction: { hover: true, tooltipDelay: 120, hideEdgesOnDrag: true, keyboard: false, multiselect: false },
nodes: { shape: 'dot', borderWidth: 1.5, chosen: { node: true, label: false } },
edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.15 }, selectionWidth: 3 },
```

Notable force decisions, all documented in-source:

* `stabilizationIterations`: **200** above 1200 nodes, **140** otherwise
  (`GraphCanvas.tsx:48-56`). The comment reports that 80 collapsed a ~2k-node graph into one
  ball.
* `minVelocity: 0` so the pass actually spends its iteration budget (`GraphCanvas.tsx:257-262`).
* `improvedLayout: false` + `randomSeed: 42` — deterministic starting cloud
  (`GraphCanvas.tsx:279`).
* After the pass: `physics.enabled = false` and positions are frozen
  (`GraphCanvas.tsx:324`); the settled coordinates are written to a module-level cache and to
  the backend (`GraphCanvas.tsx:330-333`, `GraphView.tsx:312-317`).
* Settle watchdog: idle timeout **15 000 ms** re-armed on every `stabilizationProgress`; hard
  deadline **120 000 ms** (`GraphCanvas.tsx:59-61`, `:205-218`). A settle only counts as
  complete when `stabilizationIterationsDone` fires *after* this component requested the pass
  (`GraphCanvas.tsx:352-361`); `stabilized` is deliberately not listened to (`:358-360`).
* If the window was hidden when the pass was requested, `visibilitychange` restarts physics and
  re-requests `stabilize()` (`GraphCanvas.tsx:366-380`).
* The pass is requested from a `setTimeout(…, 0)`, not `requestAnimationFrame`, because an
  occluded Electron window pauses rAF (`GraphCanvas.tsx:485-496`).

**Position cache** (`GraphCanvas.tsx:85-104`): `Map<layoutKey, Map<nodeId, {x,y}>>`, capacity
**4** entries, oldest evicted; a cache hit requires **≥ 80 %** of current node ids present.
The backend layout (`payload.layout`) uses the same 80 % rule (`GraphCanvas.tsx:240-247`).
`layoutKey` is `${cacheKey}:${payload.layout_key ?? 'legacy:<n>:<m>'}`
(`GraphView.tsx:273-275`).

**Payload cache** (`graphCache.ts`): memory-only, key `${projectId ?? 'none'}:${scope}`, stale
after **15 000 ms** (`graphCache.ts:23-27`). A cached payload is painted immediately and
revalidated in the background; `refreshing` drives the 更新中… pill
(`GraphView.tsx:116-143`, `:284`).

### 2.2 Pan / zoom

* Wheel zoom comes from vis: each notch multiplies scale by
  `1 ± zoomSpeed × 0.1`, with the default `zoomSpeed: 1` → **×1.1 / ÷1.1 per notch**, anchored
  at the pointer (`node_modules/vis-network/esnext/esm/vis-network.js:13707-13723`,
  and default at `:13185`). The app passes no `zoomSpeed`, so 1.1 is authoritative.
* Effective zoom clamp while wheeling is vis's own: `scale < 1e-5 → 1e-5`, `scale > 10 → 10`
  (`vis-network.js:13649-13657`). The app does **not** narrow this.
* The three on-canvas buttons use the app's own clamp **0.03 … 4**:
  `zoom(1.25)` / `zoom(0.8)` / `fit` (`GraphCanvas.tsx:544-554`, buttons at `:566-576`).
  So a wheel can reach 10× while the −/+ buttons can only pull back inside 0.03–4.
* Pan: vis's default `dragView: true` (not overridden). `hideEdgesOnDrag: true` hides edges
  while panning (`GraphCanvas.tsx:283`).
* Reset camera: the `fit` button calls `fitVisible`, which fits **only non-hidden nodes**
  (`GraphCanvas.tsx:225-229`); vis's plain `fit()` would frame hidden nodes too.
* Focus a node (search hit, citation focus, rebuild): `network.focus(id, { scale: 0.7,
  animation: false, locked: false })` — `FOCUS_SCALE = 0.7` (`GraphCanvas.tsx:45`, `:529`).
* Toolbar geometry: `.graph-canvas-tools` bottom-right, 28 × 28 px buttons, 4 px gap, blur
  backdrop (`graph.css:314-349`). The hint line (滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开代码/笔记)
  sits bottom-left, `font-size: 10.5px`, `pointer-events: none` (`GraphCanvas.tsx:577-579`,
  `graph.css:351-362`).
* While `data-settling="true"` the canvas has `pointer-events: none` so a click cannot poke the
  solver (`graph.css:280`).

### 2.3 Hover

* `interaction.hover: true`, `tooltipDelay: 120 ms` (`GraphCanvas.tsx:282`).
* Tooltip is a DOM node built per node, text = `label \n kindLabel \n path:start_line \n
  社区：<community_label> \n 连接：<degree>` (`GraphCanvas.tsx:418-425`). For edges:
  `relationLabel · confidenceLabel [· L<line>]` (`GraphCanvas.tsx:453-455`).
* vis's stock tooltip chrome is restyled to the app surface: `max-width: 340px`,
  `white-space: pre-wrap`, `var(--bg-elevated)`, `box-shadow: var(--shadow-2)`,
  `pointer-events: none`, `z-index: 4` (`graph.css:282-300`).
* Hover on a node does **not** dim the graph and does **not** open the rail. There is no
  hover-highlight of the neighbours; only selection does that (§2.5).
* The only other hover affordance is `.graph-rel-open` (the ↗ button in rail rows), which is
  `opacity: 0` until `.graph-rel-row:hover` or `:focus-within` (`graph.css:1036-1053`).

### 2.4 Click → selection

`network.on('click', e => selectRef.current(typeof e.nodes[0] === 'string' ? e.nodes[0] : null))`
(`GraphCanvas.tsx:312`). That reaches `GraphView`'s `onSelect` (`:318-321`):

```js
if (id) choose(id, false); else { setSelectedId(null); setFocus(null) }
```

`choose(id, zoom)` (`GraphView.tsx:157-172`):

1. Looks the node up in `byId`; unknown id is a no-op.
2. **Force-enables the family the node belongs to** — `rationale` nodes add `'meaning'`,
   `external` nodes add `'dependency'`.
3. **Un-hides the node's community** (`hiddenCommunities.delete(node.community)`).
4. `setSelectedId(id)`; `setQuery('')` (selection clears the rail search box).
5. `zoom === true` bumps `focus` with an incrementing nonce → camera moves to the node;
   clicking on the canvas passes `false`, so a canvas click never moves the camera.

Vis selection is driven explicitly: `network.selectNodes(active ? [active] : [], false)`
(`GraphCanvas.tsx:506`) — vis's own click selection is overridden by this effect so the dimming
and the ring can never disagree.

### 2.5 Selection dimming (one-hop neighbourhood)

Effect at `GraphCanvas.tsx:501-524`:

```js
const active = selectedId && datasets.nodes.get(selectedId) ? selectedId : null
const connected = new Set(active ? [active, ...network.getConnectedNodes(active).map(String)] : [])
nodes: opacity = (!active || node.hidden || connected.has(node.id)) ? 1 : 0.42
edges: opacity = !active ? undefined
       : (edge.from === active || edge.to === active) ? Math.max(base, 0.75) : 0.08
```

`base` is the edge's current opacity (`edgeStyle(...).opacity`, halved again for inferred).
So a selected node keeps itself and its direct neighbours at full ink; everything else drops to
**0.42** (nodes) / **0.08** (edges), and incident edges jump to at least **0.75**.

Selection ring: `color.highlight.background = vars.selectionFill = '#ffffff'`, border stays the
community colour (`GraphCanvas.tsx:436-439`, `graphTheme.ts:96`). For `light` theme the fill is
also `#ffffff` (`graphTheme.ts:116`), so the ring is effectively "white core, coloured rim" in
both themes.

### 2.6 Double click → activate

`network.on('doubleClick', … activateRef.current(id))` (`GraphCanvas.tsx:313-315`) →
`GraphView.openNode` (`:241-255`):

* `node.note_id !== undefined` → `GET /api/notes/:id` then `openNoteView(note)` (opens the note
  reader tab). Used by the notes graph.
* else `node.path` → `reveal(node.path, node.start_line, node.end_line)` — opens/reuses the
  file tab, highlights the range, and shows the citation ask bar (§7.3).
* Errors surface in the graph banner (`setError`).

### 2.7 Node drag

Nodes are **not pinned and not fixed**. No `fixed` option is ever set
(`GraphCanvas.tsx:416-446`), and physics is disabled after the settle, so a dragged node simply
stays where it is dropped. On `dragEnd` the whole position map is re-cached and persisted
(`GraphCanvas.tsx:381-385`), which means a manual arrangement survives a tab switch and a
restart (through `api.saveGraphLayout`, `GraphView.tsx:312-317`). Layout persistence is
best-effort: the promise rejection is swallowed (`GraphView.tsx:314-316`).

### 2.8 Node size, labels, ellipsis, collision

* **Radius**: `size = 7 + 17 * Math.sqrt(degree / maxDegree)` where `maxDegree =
  max(1, …degrees)` (`GraphCanvas.tsx:409`, `:433`). Range: 7 px (degree 0) → 24 px (max).
* **Label text** is truncated at **> 42 chars** to `slice(0, 41) + '…'`
  (`GraphCanvas.tsx:429`).
* **Label budget** by zoom (`GraphCanvas.tsx:76-83`):

  | scale | labels kept |
  | --- | --- |
  | ≥ 0.70 | 22 |
  | ≥ 0.45 | 26 |
  | ≥ 0.28 | 24 |
  | ≥ 0.15 | 16 |
  | ≥ 0.08 | 10 |
  | else | 6 |

* **Label selection** (`applyLabels`, `GraphCanvas.tsx:113-153`):
  1. `scale = max(getScale(), 0.01)`;
  2. viewport in graph coordinates is `halfW = (viewportW / scale / 2) * 1.2`,
     `halfH = (viewportH / scale / 2) * 1.2` (the 1.2 is a margin so a label near the edge still
     appears);
  3. candidates = non-hidden nodes inside that box;
  4. sort by `degree desc`, take `labelLimit(scale)`;
  5. **always add `selectedId`** even if it did not make the cut.
* **Constant on-screen size**: `fontPx = round((labelPx / scale) * 10) / 10` with
  `labelPx = 12`; halo `strokeWidth = round((1.1 / scale) * 10) / 10`; hidden labels get
  `size: 0` (`GraphCanvas.tsx:138-152`, `graphTheme.ts:102-119`).
* **Collision handling**: none in the app layer. Node overlap is reduced only by the physics
  `avoidOverlap: 0.8`; labels are suppressed rather than nudged. There is no label-repel loop and
  no "collision harness" (`GraphCanvas.tsx:254-289` has no such option).
* Label font stack: `system-ui, "Microsoft YaHei UI", "Segoe UI", sans-serif`
  (`GraphCanvas.tsx:63`).

### 2.9 Edges

Built in `GraphCanvas.tsx:447-472`:

| aspect | rule |
| --- | --- |
| curve | `smooth: { enabled: true, type: 'continuous', roundness: 0.15 }` (`:288`) |
| id | `'e' + index` — positional, rebuilt wholesale on every data effect (`datasets.edges.clear()` at `:448`) |
| arrow | only `arrows.to`, `scaleFactor: 0.45`, enabled iff relation is in `ARROWED` **and not** in `UNDIRECTED` (`:465-470`) |
| dashes | `dashes = isInferred(relation, confidence)` (`:462`) |
| width | `style.width`, **× 0.7** when inferred (`:463`) |
| opacity | `style.opacity`, **× 0.6** when inferred (`:464`) |
| colour | `edgeInk(theme, relation, sourceCommunity)`: structural relations use `fallbackEdge`; otherwise the **source node's community colour** (`:106-111`) |

`UNDIRECTED = {same_folder, same_project, shared_reference}` (`:66`).
`ARROWED = {calls, indirect_call, imports, imports_from, inherits, implements}` (`:67`).
Consequence: `contains`, `method`, `declares`, `rationale_for`, `uses`, `references` are drawn
**without arrowheads even though they are directed** — `references` and `uses` fall in neither
set.

Selection width: `edges.selectionWidth: 3` (`:288`), and `chosen.edge` is not disabled, so a
selected edge thickens to 3.

### 2.10 Node/edge cap and the visible subset

**There is no node cap.** The full payload is rendered. `filterGraph` marks items `hidden`;
vis keeps them in the DataSet so the layout never restarts (`graphFilter.ts:1-8`,
`GraphCanvas.tsx:1-15`). The subset is therefore chosen purely by:

1. **Relation family** — 4 chips in the header map to `behaviour / dependency / structure /
   meaning` (`GraphView.tsx:26-31`). Default set is
   `['behaviour','dependency','structure','other']` (`graphFilter.ts:26`), i.e. `meaning` is off.
2. **Community** — every community has a checkbox; hiding is a set of ids
   (`graphFilter.ts:19`, `GraphView.tsx:511-542`).
3. **Node-kind inheritance** — `rationale` nodes follow `meaning`; `external` nodes follow
   `dependency` (`graphFilter.ts:39-44`).
4. **Edge inheritance** — an edge is hidden if either endpoint is hidden **or** its family is
   disabled (`graphFilter.ts:56-60`).

Two quirks a re-implementer must decide about deliberately:

* `relationFamily('inherits' | 'implements') === 'hierarchy'` (`graphMeta.ts:111-113`) but
  `hierarchy` is in **no** default family and has **no** chip, so inheritance edges are hidden
  by default and cannot be enabled from the UI.
* The `other` family is enabled by default but never has a chip, so `same_folder`,
  `same_project`, `shared_reference` edges can never be turned off.

Counts shown in the header are the post-filter counts:
`visibleCount = nodes.reduce((c, n) => c + (n.hidden ? 0 : 1), 0)`, same for edges
(`GraphView.tsx:150-154`). The community count is `communities.length` (all communities,
ignoring the filter).

### 2.11 Community / group visual treatment

* Colour = `communityColor(theme, community) = COMMUNITY_PALETTE[((id % 10) + 10) % 10]`
  (`graphTheme.ts:126-130`), Tableau-10, same array in both themes.
* The colour is applied to node fill **and** border, to the edge ink of outbound edges from that
  community, to the rail's search-result dot, to the community checkbox swatch, and to the
  relation label of a neighbour row (`GraphCanvas.tsx:418`, `:452`, `:434-439`;
  `GraphView.tsx:387`, `:533`, `:500`).
* Selecting a community checkbox does not zoom or isolate; it only toggles `hidden`
  (`GraphView.tsx:217-229`). Hiding the community that contains the selected node clears the
  selection and the camera focus (`GraphView.tsx:225-228`).
* `全部隐藏 / 全部显示` toggles every community at once and also clears the selection
  (`GraphView.tsx:230-239`).

### 2.12 Legend / filter controls

* **Filter chips** (`graph.css:609-638`): 24 px tall (22 px in the header, `:86-90`), pill,
  `aria-pressed` drives state. Enabled = accent border + `--accent-soft`; **disabled =
  `text-decoration: line-through; opacity: 0.6`** — so the default 说明 chip renders struck
  through.
* `重置筛选` appears in the header only when `!isDefaultFilters(filters)`
  (`GraphView.tsx:292`, predicate at `graphFilter.ts:32-36`).
* The rail's bottom legend (`.graph-legend`, `.graph-legend-swatch`,
  `.graph-legend-swatch.graph-legend-dashed`, `.graph-foot-stats`, `.graph-rail-foot`) has CSS
  but **no JSX in this tree** — it is dead CSS (`graph.css:1195-1247`). Same for
  `.graph-filters`, `.graph-filters-label`, `.graph-tag.*`, `.graph-members`, `.graph-member*`,
  `.graph-detail-idle*`, `.graph-relations-head`. Do not port them as if they were live.
* No legend is rendered anywhere today. Colour meaning is explained only by the rail hint text
  (`GraphView.tsx:538-540`).

### 2.13 Empty / loading / error states

| state | trigger | render |
| --- | --- | --- |
| no project | `projectId === null` | `EmptyState icon="folder" title="还没有打开项目"` (`GraphView.tsx:268`) |
| first load | `loading && !payload` | `Loading text="正在加载图谱…"` (`:269`) |
| hard error | `error && !payload` | `ErrorNote` with 重试 → bumps `revision` (`:270`, retry at `:270`) |
| soft error | `error && payload` | `.graph-banner` strip above the body, same retry (`:299`) |
| empty graph | payload exists but `nodes.length === 0` | `GraphBlank` (`:307-308`, component `:545-557`): dashed 440 px box, refresh icon, 项目还没有代码图谱 / 还没有笔记 + one primary button (重建 / 刷新) |
| settling | first physics pass | `.graph-settling` pill top-centre 正在排布图谱… with 9 px spinner (`GraphCanvas.tsx:561`, `graph.css:366-394`) |
| filtered to nothing | `visibleCount === 0` | `.graph-canvas-empty` centred 当前筛选下没有可显示的节点 (`GraphCanvas.tsx:562-565`) |
| node id gone | `initialNodeId` not in payload | error banner 要定位的节点已不存在，请重建图谱或重新选择代码引用。 (`GraphView.tsx:183`) |

The rebuild button calls `api.rebuildGraph` (code scope only), clears the payload cache and
bumps `revision`; for the notes scope it just re-fetches (`GraphView.tsx:256-266`).

---

## 3. Pure modules — transcribe these tables verbatim

### 3.1 `components/graph/graphMeta.ts`

`RELATION_LABEL` (`graphMeta.ts:12-29`) — **verbatim**:

```ts
same_folder: '同一笔记目录',
same_project: '同项目未分类',
shared_reference: '共同引用文件',
community_member: '社区成员（布局索引）',
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
```

`KIND_LABEL` (`graphMeta.ts:32-41`) — **verbatim**:

```ts
community: '社区',
note: '笔记',
file: '文件',
class: '类',
function: '函数',
module: '模块',
rationale: '说明',
external: '外部',
```

`CONFIDENCE_LABEL` (`graphMeta.ts:43-47`) — **verbatim**:

```ts
EXTRACTED: '源码直读',
INFERRED: '推断',
AMBIGUOUS: '存疑',
```

Lookups fall back to the raw key: `RELATION_LABEL[r] ?? r`, `KIND_LABEL[k] ?? k`,
`CONFIDENCE_LABEL[c] ?? c` (`graphMeta.ts:68-78`).

`STRUCTURAL_RELATIONS` (`graphMeta.ts:56-66`) — **verbatim**:
`contains, method, imports, imports_from, inherits, implements, declares, rationale_for, uses`.

`isInferred(relation, confidence)` (`graphMeta.ts:81-85`):

```ts
if (confidence === 'INFERRED' || confidence === 'AMBIGUOUS') return true
return !STRUCTURAL_RELATIONS.has(relation) && confidence !== 'EXTRACTED'
```

So: any INFERRED/AMBIGUOUS edge is dotted; an untagged structural relation stays solid; an
untagged non-structural relation is treated as a deduction.

`relationFamily` (`graphMeta.ts:97-119`) — **verbatim**:

| relation | family |
| --- | --- |
| `contains`, `method`, `declares` | `structure` |
| `imports`, `imports_from`, `uses` | `dependency` |
| `calls`, `indirect_call`, `references` | `behaviour` |
| `inherits`, `implements` | `hierarchy` |
| `rationale_for` | `meaning` |
| everything else (incl. `same_folder`, `same_project`, `shared_reference`, `community_member`) | `other` |

`RelationFamily = 'structure' | 'dependency' | 'behaviour' | 'hierarchy' | 'meaning' | 'other'`
(`graphMeta.ts:95`).

### 3.2 `components/graph/graphFilter.ts`

```ts
export type VisibleNode = GraphNode & { hidden: boolean }
export type VisibleEdge = GraphEdge & { hidden: boolean }
export interface GraphFilters {
  families: ReadonlySet<RelationFamily>
  hiddenCommunities: ReadonlySet<number>
}
export const DEFAULT_FAMILIES = ['behaviour', 'dependency', 'structure', 'other']  // graphFilter.ts:26
defaultFilters()      -> { families: new Set(DEFAULT_FAMILIES), hiddenCommunities: new Set() }  // :28-30
isDefaultFilters(f)   -> hiddenCommunities.size === 0 && families.size === 4 && all four present  // :32-36
```

Predicates (`graphFilter.ts:39-61`) — **verbatim**:

```ts
function nodeHidden(node, filters) {
  if (filters.hiddenCommunities.has(node.community)) return true
  if (node.kind === 'rationale') return !filters.families.has('meaning')
  if (node.kind === 'external')  return !filters.families.has('dependency')
  return false
}

edge.hidden = Boolean(hidden[source] || hidden[target] || !families.has(relationFamily(edge.relation)))
```

Return value is always a fresh `{nodes, edges}` with the `hidden` flag merged in; input payload
is never mutated.

### 3.3 `components/graph/graphRelations.ts`

Relation buckets (`graphRelations.ts:19-22`) — **verbatim**:

```ts
CALL_RELATIONS       = {calls, indirect_call, references}
DEPENDENCY_RELATIONS = {imports, imports_from, uses, inherits, implements}
STRUCTURE_RELATIONS  = {contains, method, declares}
MEANING_RELATIONS    = {rationale_for}
```

`groupConnections(selectedId, edges, byId, scope)` (`:29-75`):

1. Skip edges that do not touch `selectedId`.
2. `outgoing = edge.source === selectedId`; `other` is the opposite endpoint; skip when `other`
   is missing or is the node itself (self-loop).
3. If `scope === 'notes'` → **everything** goes into `related` (no direction grouping).
4. Else, in this order: call relations → `calls` (outgoing) / `callers` (incoming);
   dependency → `dependencies`; structure → `structure`; meaning → `meaning`;
   **anything else (incl. `same_folder`, `same_project`, `shared_reference`,
   `community_member`) falls into `dependencies`** (`:54-56`).
5. Sort: `dependencies`, `structure`, `meaning`, `related` by
   `relation.localeCompare(relation) || other.label.localeCompare(label,'zh-CN')`;
   `callers`, `calls` by label only (`:58-64`).
6. Emit in fixed order, dropping empty groups (`:66-74`):

```ts
[
  { key: 'callers',      label: '调用者' },
  { key: 'calls',        label: '调用'   },
  { key: 'dependencies', label: '依赖'   },
  { key: 'structure',    label: '结构'   },
  { key: 'meaning',      label: '说明'   },
  { key: 'related',      label: '关联'   },
]
```

### 3.4 `components/graph/graphTheme.ts`

`COMMUNITY_PALETTE` (`graphTheme.ts:27-38`) — **verbatim, in order**:

```ts
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
```

`edgeStyle(relation)` (`graphTheme.ts:50-80`) — **verbatim weights**:

| relation(s) | width | opacity | constant |
| --- | --- | --- | --- |
| `calls`, `indirect_call`, `references` | **1.5** | **0.58** | `CALL_EDGE` |
| `imports`, `imports_from`, `uses` | **0.8** | **0.30** | `DEPENDENCY_EDGE` |
| `inherits`, `implements` | **0.9** | **0.38** | `HIERARCHY_EDGE` |
| `contains`, `method`, `declares` | **0.5** | **0.12** | `STRUCTURE_EDGE` |
| `rationale_for` | **0.5** | **0.12** | `MEANING_EDGE` |
| default | **0.8** | **0.28** | `DEFAULT_EDGE` |

`isStructuralRelation(r)` = `contains | method | declares | rationale_for`
(`graphTheme.ts:83-85`) — these use the neutral `fallbackEdge` ink instead of the community
colour.

`CANVAS_THEMES` (`graphTheme.ts:102-119`) — **verbatim**:

| token | dark | light |
| --- | --- | --- |
| `nodeColors` | `COMMUNITY_PALETTE` | `COMMUNITY_PALETTE` |
| `label` | `#ffffff` | `#222222` |
| `labelHalo` | `#0a0f16` | `#ffffff` |
| `selectionFill` | `#ffffff` | `#ffffff` |
| `fallbackEdge` | `#8794a6` | `#8794a6` |
| `labelPx` | `12` | `12` |

`communityColor(theme, community)` uses a **true modulo** so negative ids work:
`((community % len) + len) % len` (`graphTheme.ts:126-130`).

### 3.5 `components/graph/graphCache.ts`

`STALE_AFTER_MS = 15_000`; `graphCacheKey = \`${projectId ?? 'none'}:${scope}\``;
`isFresh = now − at < 15_000`; `clearGraphCache(key?)` deletes one entry or the whole map
(`graphCache.ts:20-50`).

---

## 4. Search UX

There are **two independent search surfaces** with completely different semantics. Do not merge
them in the port.

### 4.1 Project search (backend, left sidebar) — `components/FilePanel.tsx`

* Input placeholder `搜索代码，回车检索`; a 搜索 button sits beside it (`FilePanel.tsx:127-157`).
* **No debounce.** Typing only updates `query`. Work happens on `Enter`
  (`FilePanel.tsx:132-135`) or the button click.
* `Escape` clears **only when results are already showing** (`FilePanel.tsx:134`).
* Request: `api.searchProject(projectId, query.trim(), 8)` → `GET /api/projects/{id}/search?q=…&top_k=8`
  (`FilePanel.tsx:42`, `api.ts:215-223`). Top-k is fixed at **8**.
* While running: button text 检索中…, and a `Loading text="检索中…"` row replaces the tree
  (`FilePanel.tsx:156`, `:162`).
* Results replace the file tree entirely; a back row 命中 N 段 + 文件树 button returns
  (`FilePanel.tsx:281-291`).
* Each result row (`search-result`, `FilePanel.tsx:293-323`) shows, in order:
  1. `.sr-path` — icon + `笔记` for note hits, otherwise the raw project-relative path;
  2. `.sr-meta` — for notes a `知识库` tag, otherwise `L<start>-<end>`; then
     `chunk.symbol` (when present), `chunk.retriever` (`keyword|vector|hybrid`), and
     `chunk.score.toFixed(2)`;
  3. `<pre>` with the chunk body.
  There is **no re-ranking in the client** and no relevance bar — the number is the backend
  score to 2 decimals, in backend order.
* Opening a hit (`openChunk`, `FilePanel.tsx:58-67`):
  * `chunk.kind === 'note'` and `path` matches `note://<id>` with a positive integer →
    `focusNote(id)` (switches the sidebar to 笔记 and opens the note tab);
  * otherwise → `reveal(path, start_line, end_line)` → editor opens at that line range with the
    citation highlight and the 引用第 x–y 行 bar.
* Empty results: `没有命中` + 没有检索到相关代码，请尝试调整关键词。 (`FilePanel.tsx:262-278`).

### 4.2 Graph node search (client-side, graph rail) — `GraphView.tsx:373-390`

* Placeholder: `搜索函数 / 文件 / 社区` (code) or `搜索笔记 / 内容` (notes).
* **No debounce, no request.** Every keystroke recomputes in memory:
  `needle = query.trim().toLowerCase()`,
  match if `[label, path, content_md ?? ''].join(' ').toLowerCase().includes(needle)`,
  then `slice(0, 30)` (`GraphView.tsx:203-207`). **Cap = 30 results**, in payload order, no
  ranking.
* The search box replaces the whole rail body: results / inspector / community list are mutually
  exclusive (`GraphView.tsx:383-415`).
* Each row: community-coloured 7 px dot, label (ellipsised), `kindLabel(kind)`; `title` is the
  path or the first 120 chars of `content_md`; `aria-pressed` marks the current selection
  (`GraphView.tsx:385-390`).
* **Click** = `choose(id)` with zoom → the row disappears (query is cleared) and the inspector
  opens.
* A clear (×) button appears when the query is non-empty (`GraphView.tsx:378-379`).
* **Keyboard**: none. No arrow navigation, no Enter handling; rows are plain buttons.
* Empty: `没有匹配的节点。` (`GraphView.tsx:384`).

### 4.3 Notes search — `components/NotesPanel.tsx`

* Placeholder `搜索标题、内容或项目`; filters as you type, no debounce
  (`NotesPanel.tsx:239-247`).
* Match fields: `title`, `preview(content_md)`, `project_name`, compared with
  `toLocaleLowerCase().includes(...)`.
* Sorting is unchanged by the query: `compareTitle(title) || id`
  (`NotesPanel.tsx:246`, comparator `:31-36`: Latin initials first, then
  `Intl.Collator('zh-CN-u-co-pinyin', { numeric: true, sensitivity: 'base' })`).
* While a query is active the folder tree is pruned to folders that still contain a match, and
  **every surviving folder is force-opened** (`open = searching || openFolders[id]`,
  `NotesPanel.tsx:259-269`, `:647`).
* Empty state swaps to `没有匹配的笔记` with a 清除搜索 button (`NotesPanel.tsx:544-559`).

### 4.4 Nav picker (keyboard-driven, not a search field) — `components/NavPicker.tsx`

Used for ambiguous definitions and for the references list. Explicit keyboard map at
`NavPicker.tsx:37-68`:

| key | effect |
| --- | --- |
| `ArrowDown` | `index = (index + 1) % max(1, n)` |
| `ArrowUp` | `index = (index − 1 + n) % max(1, n)` |
| `Enter` | pick `items[index]` |
| `Escape` | close |

Rows: 3-column grid `minmax(90px, 0.9fr) minmax(0, 1.6fr) auto` — name (mono) / hint
(right-truncated path, `direction: rtl`) / meta (`badge` pill + kind)
(`editor.css:231-291`). Footer shows the key hints (`NavPicker.tsx:111-113`). Hovering a row
sets the index (`:98`), and the active row is scrolled into view and focused (`:64-68`).
Backdrop click closes; clicking inside does not (`:73-79`).

---

## 5. Symbol / neighbourhood panels

### 5.1 Rail modes

The rail is **one mode at a time** (`GraphView.tsx:383-415`):

| priority | mode | condition |
| --- | --- | --- |
| 1 | search results | `query.trim()` non-empty |
| 2 | node inspector | a node is selected |
| 3 | community list | otherwise |

### 5.2 Community list (`CommunityList`, `GraphView.tsx:511-542`)

* Section head: `社区` + total count + a `全部隐藏 / 全部显示` button.
* One row per community: checkbox (`accent-color: var(--accent)`), 7 px colour dot,
  `community.label` (ellipsised), `community.size` right-aligned tabular (`graph.css:754-761`).
* Hidden rows: label + count get `opacity: .5; text-decoration: line-through`
  (`graph.css:708-716`).
* Rows are `min-height: 28px`; the list scrolls independently (`graph.css:682-706`).
* Footer hint differs per scope: code = 颜色代表社区；点击节点查看调用者与被调用者。双击节点直接打开代码。;
  notes = 颜色代表笔记分组；点击笔记查看关联。双击笔记直接打开。 (`GraphView.tsx:538-540`).

### 5.3 Node inspector (`NodeInspector`, `GraphView.tsx:421-470`)

Vertical order and content:

1. Back button `← 全部社区` (clears selection and focus) (`:437-439`).
2. Head row: `.graph-kind` = `kindLabel(node.kind)` (accent pill, 18 px) and
   `.graph-kind-note` = `node.community_label`, right-aligned and ellipsised (`:440-443`).
3. `<h2 class="graph-detail-title">` = `node.label`, `title` attr = full label, `overflow-wrap:
   anywhere` (`:444`, `graph.css:838-846`).
4. `.graph-detail-meta.mono`: for code scope `path:start_line` (or `项目内节点` when no path);
   for notes scope `node.project_name`; then `· N 邻点`
   (`:445-448`). `neighborCount` is computed by de-duplicating the other endpoint of every
   incident edge (`:192-197`).
5. Actions: `继续提问` (primary, always) and `打开代码` / `打开笔记` (only when `node.path &&
   !node.external`) (`:449-455`). 继续提问 calls `askAboutNode({label, node_id, path,
   start_line, community_label})`, which the composer consumes.
6. Optional body preview: first **250 chars** of `content_md`, scroll-capped at 84 px
   (`:456`, `graph.css:903-913`).
7. Relation groups (§5.4).
8. `RelationshipSummary` keyed `node.id + ':' + revision` so switching nodes remounts it
   (`:467-468`, `RelationshipSummary.tsx:7-17`).

### 5.4 Relation groups and rows (`RelationSection`, `GraphView.tsx:472-509`)

* Native `<details>` per group, `open` prop computed as
  `key === 'callers' || key === 'calls' || (!hasCalls && index === 0)` (`:461`):
  the calls groups are expanded by default; if the node has no call edges, the first group is.
* Summary: group label + item count (`<small>`), custom ▸/▾ marker drawn in CSS
  (`graph.css:928-962`).
* **Row cap = 60** (`MAX_ROWS`, `GraphView.tsx:34`, `:479`). When truncated:
  `还有 N 个关系；用搜索定位更具体。` (`:504-506`).
* Row columns, left→right (`GraphView.tsx:486-503`):
  1. direction glyph — `→` when outgoing, `←` when incoming, `data-dir` drives the accent
     colour on outgoing (`graph.css:994-1003`);
  2. `other.label` (flex, ellipsised);
  3. `kindLabel(other.kind)` (9.5 px);
  4. `other.path + ':' + other.start_line` — mono, `max-width: 96px`, `direction: rtl` so the
     tail stays visible, hidden entirely when empty (`graph.css:1020-1034`);
  5. an ↗ open button, visible only on row hover/focus, hidden when `other.external` or no path
     (`:496-499`);
  6. `relationLabel(edge.relation)` coloured with `communityColor(theme, other.community)`
     (`:500-502`).
* Row `title` = `path · relation · confidence [· L<line>]` (`:488`).
* Row interaction: click = select the neighbour (`choose(other.id, false)` — no camera move);
  double-click = `onOpen` (open code/note); `Enter` = select (`:489-491`).

### 5.5 Relationship summary (`RelationshipSummary.tsx`)

* Button label cycles: `AI 解读关系` → `正在解读…` (busy) → `重试 AI 解读` (after an error) →
  `重新解读` (after text exists) (`:79-82`).
* While busy a `取消` button replaces the coverage caption; otherwise the caption is
  `覆盖全部 N 个直接邻点` (`:83-86`).
* Streaming: `api.streamGraphSummary(scope, projectId, nodeId, signal)` appends deltas as they
  arrive; a `done` frame sets the result and falls back to `event.summary` when no delta ever
  arrived; an `error` frame shows `role="alert"` text; a clean stream end with no `done` and no
  error produces `AI 解读流意外结束，请重试。` (`:49-69`).
* Placeholder hint: busy → `正在梳理这个节点与全部直接邻点的关联… <elapsed>s；首个片段到达后会立即显示。`
  (elapsed is a 1 s interval counter); idle → `只依据图谱里的直接关系解释，不会扩展到二跳节点。`
  (`:29-36`, `:90-94`).
* `aria-live` is `polite` only when idle, `aria-busy` while streaming (`:87`).

### 5.6 Definition / reference results

Definitions and references are **not** panels; they are the nav picker (§4.4) plus a transient
notice strip. Mapping into rows (`CodePane.tsx:1426-1450`):

* definition row: `label = target.name`, `hint = path:line`, `meta = kindLabel(kind)`,
  `badge = confidenceLabel(confidence)` where `INFERRED|AMBIGUOUS → 推断` else `精确`;
  jumping frames the **declaration line only** (`navigateTo(path, line, line)`), not the body
  (`CodePane.tsx:782-800`).
* reference row: `label = from_name ?? name`, `hint = path:line`, `meta = kindLabel(kind)`,
  no badge; jump uses `end_line` (`CodePane.tsx:869-884`).

Reason strings for a failed definition lookup (`CodePane.tsx:1452-1466`) — **verbatim**:

| reason | text |
| --- | --- |
| `external` | `“<word>”来自外部库，项目内没有可跳转的定义` |
| `ambiguous` | `“<word>”有多个同名定义，暂时无法确定是哪一个` |
| `unresolved` | `“<word>”没有解析到定义，可能是动态调用` |
| `file_not_found` | `文件已不存在，请重新打开后再试` |
| default | `“<word>”没有可跳转的定义` |

Notices self-dismiss after **4500 ms**; the picker never auto-closes
(`CodePane.tsx:904-910`).

---

## 6. Notes UX

### 6.1 Library panel — `components/NotesPanel.tsx`

Toolbar (`:404-432`), left→right: 笔记图谱 (network icon → `openGraph(null,'notes')`), 新建笔记
(disabled without a project or while saving), 新建文件夹 (toggles the folder form), a spacer, the
total note count as a `.tag`, and 刷新知识库.

Body order (`:434-583`): error note → transient notice → folder form (when creating) →
`知识库` root row (shows total count, is the active scope by default) → 新建位置 caption when a
folder is the active scope → search field → note create form → loading/error → empty state →
the tree.

**Tree model**

* Folders arrive flat (`NoteFolder.parent_id`) and are nested in `buildTree`
  (`NotesPanel.tsx:607-617`): every node is created first, then attached to its parent;
  roots are sorted with `compareTitle(name) || id` before attachment, so children inherit the
  sorted insertion order.
* `flattenFolders` gives the move menu `{folder, depth}` pairs in tree order (`:596-604`).
* Open/closed state is a local `Record<number, boolean>`; **default is collapsed**
  (`?? false`, `:647`).
* Row indentation: folder `paddingLeft = 6 + depth*16` (`:654`); note `marginLeft = depth*16`
  (`:275`); the 空文件夹 label uses `28 + depth*16` (`:730`); the move menu uses
  `8 + depth*14` (`:371`).
* Folder row: twisty (disabled when it has no children **and** no notes), folder / folder-open
  icon, name, `folder.note_count`, then hover-only rename (pencil) and delete (trash)
  (`:652-710`).
* Clicking the folder row both **selects it as the create target** and toggles it
  (`onPick`, `:574-577`); the twisty alone toggles (`:668-680`). Folder rows handle
  `Enter`/`Space` (`:656-662`).
* **Empty folders** render `空文件夹` when open with nothing inside (`:730`).

**Note creation**

* The inline form has three fields: 知识点标题 (autofocus), 导出文件名 (optional), and a 6-row
  Markdown textarea (`:501-538`).
* Save requires a project, non-empty title **and** non-empty content; `file_name` defaults to the
  title (`:113-136`). The new note is filed into the scope folder when the scope is a folder
  (`folder_id: scope.kind === 'folder' ? scope.id : null`) and attached to the currently active
  conversation (`conversation_id: activeConversationId`).
* After save: refresh both lists, open the note in the reader, expand the target folder.

**Folder CRUD**

* Create: name input with `Enter` → create; `parent_id` is the active folder scope (`:138-154`,
  `:443-470`).
* Rename: `window.prompt('文件夹名称', folder.name)` (`:156-165`).
* Delete: `window.confirm('删除文件夹「<name>」？里面的笔记会回到未分类，不会被删除。')`
  (`:167-176`); notes survive, unfiled.

**Note row + move menu**

* Row: notes icon, title, hover-only actions 移动到文件夹 / 重拟标题 / 导出 / 删除
  (`:284-341`). Row click opens the reader; `Enter` also opens (`:276-281`).
* `title` attribute concatenates `title \n project_name \n preview` (`:282`).
* Move menu (`:343-398`): `未分类` first (disabled when already unfiled), then every folder with
  its depth indent; the current folder is disabled and shows a `当前` pill; with no folders it
  shows `还没有文件夹` + 新建文件夹. `Escape` closes the menu (`:349-352`).
* Moving sends `updateNote(id, { folder_id, move_folder: true })` — `move_folder` is mandatory
  or the backend ignores the id (`types.ts:604-611`, `NotesPanel.tsx:226`).
* Deleting a note: `window.confirm('删除笔记「<title>」？')`; if it is the open note, the reader
  closes (`:178-189`).

**Preview text** (`preview`, `NotesPanel.tsx:12-25`) — used for the list card and search:

1. strip a leading `# Title` plus following newlines: `/^#\s+.*(\r?\n)+/`;
2. strip heading markers per line: `/^\s{0,3}#{1,6}\s+/gm`;
3. strip bullet markers per line: `/^\s{0,3}[-*+]\s+/gm`;
4. trim; then drop a leading `知识点 | 要点 | 何时使用` label line;
5. fall back to the stripped body, then the raw content.

### 6.2 Note reader — `components/NoteReader.tsx`

* Toolbar (`.note-reader-bar`, 38 px min height, `flex-wrap`): 22 px accent mark, a
  `知识点` overline + `<h2>` title (single-line ellipsis), then the meta cluster
  (project badge, `已入知识库` / `未入知识库`, relative time), then actions:
  folder `<select>` (only when folders exist), 来源对话 (only when `conversation_id`),
  编辑, 重拟标题, 导出, delete icon, close icon (`:150-232`).
* The note body is rendered through the **same Markdown pipeline as chat**
  (`<Markdown text={body}/>`) so `## 关联代码` headings become clickable citations
  (`NoteReader.tsx:15-18`, `:280-283`).
* The body is `content_md` with the leading `# …` title stripped
  (`stripTitleLine`, `:290-292`), because the title already lives in the bar.
* Reading measure: `.note-doc { max-width: 78ch; margin: 0 auto }`, 13 px / 1.72
  (`note.css:157-166`); scroll padding `22px 28px 40px` (`note.css:148-154`).
* Heading scale inside the reader (`note.css:172-206`): `level ≤ 2` → section heading 13.5 px
  with a bottom border; `level 3` → mono 11.5 px muted (this is the `path:line` label of a code
  block); deeper → mono 11.5 px dimmer.
* Edit mode: file-name input, title input (autofocus), mono textarea, then a footer hint
  `支持 Markdown；首行会自动作为标题` and 取消 / 保存. Save is disabled unless title, file name
  and content are all non-empty (`:55-56`, `:242-277`).
* Moving from the reader: `<select>` change immediately calls
  `updateNote({folder_id, move_folder:true})` and shows 已移出文件夹 / 已移到所选文件夹
  (`:136-147`).
* Retitle failure is not an error: `模型没能给出更好的标题，已保留原标题` (`:92-96`).
* `来源对话` sets `activeConversationId` — it does **not** switch the sidebar tab
  (`:131-134`).
* Transient success notice (`已保存`, `标题已更新为「…」`, `已导出到 <path>`) is a `.notice`
  row; errors go to `ErrorNote` (`:234-240`).

### 6.3 Markdown subset and rendering rules — `components/Markdown.tsx`

Supported blocks (`Markdown.tsx:8-26`, parser `:138-271`):

| block | pattern | render |
| --- | --- | --- |
| fenced code | `FENCE` = three-or-more backticks or tildes, optional language (`Markdown.tsx:82`) | `.md-code` with head (`lang` or `text`) + 复制 button, `<pre><code>` |
| ATX heading | `HEADING` = one-to-six `#`, space, text (`:85`) | level ≤ 2 → `<h3 class="md-h1">`, level 3 → `<h4 class="md-h2">`, else `<h5 class="md-h3">` |
| horizontal rule | `HR` = 3+ `-`, `*` or `_` alone on a line (`:89`) | `<hr class="md-hr">` |
| standalone image | `IMAGE` = whole-line `![alt](src)` with optional title (`:93`) | `.md-img` (or alt text when unresolved) |
| pipe table | first line contains a pipe **and** the next line is `TABLE_SEP` containing `-` (`:91`, `:121-125`) | `.md-table-wrap > table.md-table`, alignment from `:---:` |
| unordered list | `UL` = `-`, `*` or `+` + space (`:86`) | `<ul class="md-ul">` |
| ordered list | `OL` = digits then `.` or `)` + space (`:87`) | `<ol class="md-ol">` |
| blockquote | `QUOTE` = `>` + optional space (`:88`) | `<blockquote class="md-quote">` |
| paragraph | anything else | `<p class="md-p">` (keeps `white-space: pre-wrap` in chat) |

Deliberate limits: **no raw HTML**, **no nested block structures** (`Markdown.tsx:18-21`).
Closing fences must be at least as long as the opener so a Markdown file quoted inside a note
does not terminate the outer block early (`:163-173`). Table cells are split on unescaped `|`
outside backticks, `\|` is an escape (`:95-119`).

Inline tokens, tried in this order (`Markdown.tsx:442-443`): inline code, image, link, `**bold**`,
`__bold__`, `*italic*`, `_italic_`. Images inside prose collapse to their alt text when
unresolvable. Links open in a new tab with `rel="noreferrer noopener"`.

Code-block copy: `navigator.clipboard.writeText`, label flips to `已复制` for **1400 ms**
(`Markdown.tsx:395-422`).

### 6.4 Creating a note from code / from a conversation

Two different flows exist; only one produces a `Note`.

* **From a code selection** the action is *annotation*, not a note: the selection bar's
  `就这段批注` opens the annotation editor and saves via `createAnnotation`
  (`CodePane.tsx:1218-1224`, `:672-696`). Annotations are a separate store
  (`CodeAnnotation`) drawn as green frames + view zones (§8), never in the notes library.
* **From a conversation** the code card's sparkles button fetches the conversation, takes the
  **last assistant message** and calls `createNoteFromMessage`
  (`CodePane.tsx:985-1001`). The result is a `GeneratedNote` (`types.ts:581-586`) with
  `summary_failed`, `summary_error`, `refs`, `indexed`; the reader opens immediately.
* **From a message** the chat bubble offers `整理成笔记` (`MessageBubble.tsx:49-62`).

### 6.5 Citations inside notes

A note's `## 关联代码` section is written as `### path:line-line` headings. Because the renderer
maps `###` to `.md-h2` (mono, muted) those read as labels rather than headlines, and any
`path:line` occurrence in body text becomes an inline `.md-cite` button (§7.2)
(`note.css:188-198`, `Markdown.tsx:523-533`).

### 6.6 Note graph vs code graph

Same component, `scope="notes"` (`App.tsx:157-158`). Differences, exhaustively:

| aspect | code graph | notes graph |
| --- | --- | --- |
| payload | `GET /api/projects/{id}/graph` (`GraphView.tsx:129-131`) | `GET /api/graphs/notes` (`:131`) |
| family chips | rendered | **absent** (`:286`) |
| default family filter | still applied — so `filterGraph` also hides nodes in the notes scope | same |
| relation grouping | 6 buckets | everything in `related` (`graphRelations.ts:44-45`) |
| double-click | `reveal(path, start, end)` | `node.note_id` → `GET /api/notes/:id` → reader (`GraphView.tsx:241-251`) |
| inspector meta line | `path:start_line` | `project_name` (`:445-447`) |
| open button label/icon | 打开代码 / `file-code` | 打开笔记 / `notes` (`:451-454`) |
| search placeholder | 搜索函数 / 文件 / 社区 | 搜索笔记 / 内容 (`:377`) |
| rail hint | community/call explanation | note grouping explanation (`:538-540`) |
| rebuild action | `api.rebuildGraph` + cache clear | re-fetch only (`:256-266`) |
| tab title | 代码图谱 | 笔记图谱 (`EditorTabs.tsx:188`) |
| cache key | `<pid>:code` | `<pid>:notes` (`graphCache.ts:25-27`) |

---

## 7. Citations

### 7.1 The chip component — `components/CitationChip.tsx`

```jsx
<button type="button" className="citation-chip" title={`${path} 第 ${start}-${end} 行`}
        onClick={() => reveal(path, start, end)}>
  <Icon name="code" size={10} />
  <span className="lbl">{citationLabel(citation)}</span>
  {citation.symbol ? <span className="sym">{citation.symbol}</span> : null}
</button>
```

Special case: a `note://<id>` path renders `className="citation-chip note"`, a notes icon, the
literal label `笔记` (not the file label), the symbol if any, and `onClick={() => focusNote(id)}`
(`CitationChip.tsx:11-38`). `noteIdFromPath` accepts only a positive integer
(`:14-18`).

### 7.2 `path:line` parsed out of prose — `Markdown.tsx:426-484`

Regex (verbatim, `Markdown.tsx:427`):

```js
const CITE = /(^|[\s(（[`"'])([\w@./\\-]+\.[A-Za-z0-9]{1,8}):L?(\d+)(?:[-–](\d+))?(?=$|[\s),.;:，。；）\]`"'])/g
```

Algorithm (`pushPlain`, `:469-484`):

1. Run the regex over a plain-text chunk (never inside an inline code span — code is tokenized
   first and its contents are literal, `:441-442`).
2. `path = group 2`, `start = Number(group 3)`, `end = group 4 ? Number(group 4) : start`.
3. Emit the preceding slice as a text token, then a `cite` token with
   `text = \`${path}:${start}${group4 ? '-' + end : ''}\``.
4. `last = match.index + match[0].length` (so the leading boundary character is consumed and not
   re-emitted).

The boundary character class is why `（src/a.ts:12-30）` and `` `a.py:1` `` both work, and why a
bare `foo.ts:12` at the start of a line does too (`^` alternative). The extension must be
1–8 alphanumerics after the dot, so `Dockerfile:3` will **not** match; `x.md:3` will.

Click → `reveal(token.path, token.start, token.end)` (`Markdown.tsx:523-533`).

### 7.3 `reveal` semantics — `state/AppState.tsx:257-280`

```ts
hasRange = Boolean((start && start > 0) || (end && end > 0))
if (!hasRange) { openFileTab(path, null); setCitationHighlight(null); return }
from = start > 0 ? start : 1
to   = end >= from ? end : from
openFileTab(path, {start: from, end: to})
setCitationHighlight(prev =>
  prev && prev.path === path && prev.start_line === from && prev.end_line === to
    ? null                                            // second click on the same chip clears
    : { path, start_line: from, end_line: to, symbol: null, nonce: 0, source: 'citation' })
```

`openFileTab` reuses the tab for that path and never closes note tabs
(`AppState.tsx:240-255`). The highlight lives in global state on purpose: opening a note unmounts
the editor, and a local ref would be lost before the second click (`AppState.tsx:111-119`,
`:231-238`).

`navigateTo` is the IDE-style sibling: it always keeps the highlight (`source: 'navigation'`,
fresh `nonce`), pushes onto a **40-entry** back/forward stack (`MAX_NAV_HISTORY`,
`AppState.tsx:71`, `:301-320`), and de-duplicates consecutive identical entries.

### 7.4 Chip styling (`chat.css:312-378`)

21 px tall pill, mono 10 px, `max-width: min(100%, 360px)`, `text-overflow: ellipsis`; hover
swaps to accent border/background/text; the `.sym` segment is separated by a 1 px left border and
capped at 46 % of the chip; the note variant is permanently accent-tinted.

---

## 8. Editor decorations

Four independent decoration collections plus one view-zone layer, all created in `onMount`
(`CodePane.tsx:289-296`): citation, hover, frame, annotation, pick, nav-flash, ctrl-link.

### 8.1 Citation highlight

`className: 'citation-highlight'`, `inlineClassName: 'citation-line-flash'`, one whole-line
decoration spanning the clamped range; then `instance.revealLineInCenter(from)`
(`CodePane.tsx:492-516`). The range is clamped to `[1, maxLine]` and `to = max(from, min(end,
maxLine))`.

Visual: a thin left rail, deliberately **not** a tint block, so a whole-file citation does not
read as "the file is selected" (`editor.css:506-513`):

```css
background: color-mix(in srgb, var(--accent) 6%, transparent);
border-left: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
```

`citation-line-flash` runs `citation-flash` **1.5 s, 2 iterations** (`editor.css:522-524`,
keyframes `:847-855`).

The outlined range also feeds the ask bar as a pseudo-selection — see §8.5.

### 8.2 Conversation frames

`frameDecorations(model, spans, frameClass = 'range-frame')` (`editor/decorations.ts:19-59`):

* Clamp each span to the model; if `to − from > 400` (`MAX_FRAMED_LINES`) emit only two
  decorations (first and last line) so a huge range does not create thousands of decorations.
* Otherwise emit **one decoration per line**, whole-line, `startColumn: 1, endColumn: 1`.
* Track edges in a `Map<line, {top, bottom}>` with OR-merge so overlapping ranges share one top
  and one bottom edge; classes become `range-frame`, plus `range-frame-top` and/or
  `range-frame-bottom`.
* The per-line approach is what lets Monaco clip the box correctly when half the range is
  scrolled out (`decorations.ts:11-18`).

CSS (`editor.css:682-698`): `background: var(--frame-bg)`, `border-left: 2px solid
var(--frame-line)`, `border-right: 1px solid var(--frame-inner)`; top/bottom classes add a 2 px
accent-tinted border and 3 px corner radii. Frame tokens (`editor.css:835-845`):

| token | dark | light |
| --- | --- | --- |
| `--frame-bg` | `rgba(148,200,255,.07)` | `rgba(37,99,235,.045)` |
| `--frame-line` | `rgba(148,200,255,.32)` | `rgba(37,99,235,.3)` |
| `--frame-inner` | `rgba(148,200,255,.1)` | `rgba(37,99,235,.08)` |

Annotations reuse the same function with `frameClass = 'annotation-frame'` and are tinted green
(`CodePane.tsx:533-537`, `editor.css:700-702`).

Hover tint: `hoverDecorations(model, span)` emits a single whole-line
`conversation-card-highlight` (`decorations.ts:72-86`) = `background: var(--card-range-bg);
box-shadow: inset 2px 0 0 var(--accent-line)` (`editor.css:672-676`), driven by card
`mouseenter/focus` (`ConversationCards.tsx:98-105`).

Gutter-picked lines: `pick-line`, one whole-line decoration per picked line, set by
`applyLinePick` (`CodePane.tsx:250-255`) = `background: var(--bg-active); border-left: 2px solid
var(--accent)` (`editor.css:517-520`).

### 8.3 View zones (title strips above ranges)

`editor/frameZones.ts` reserves a Monaco view zone above `start − 1` (line `0` allowed, so a
range starting at line 1 still gets its strip) with `suppressMouseDown: true`
(`frameZones.ts:162-170`).

Heights — **must match CSS** (`frameZones.ts:29-34`):

| kind | height |
| --- | --- |
| conversation strip `.range-zone` | **19 px** |
| annotation header | **24 px** |
| annotation expanded | **104 px** |

* A zone is rebuilt only when its JSON signature changes (label, active, annotation title/body,
  expanded flag, delete-availability, height) — expanding one annotation leaves the others alone
  (`frameZones.ts:57-65`, `:151-156`).
* Conversation strip: a 16 px pill `.range-flag` inside a 19 px row; `active` → accent
  (`editor.css:800-833`). Click focuses the conversation (`CodePane.tsx:598-605`).
* Annotation zone: 24 px header with chevron `▾/▸`, an `批注` pill, ellipsised title, a 删除
  button, and a scrollable body when expanded (`frameZones.ts:85-140`, `editor.css:717-798`).
* One strip per line range: duplicate ranges across conversations are collapsed
  (`CodePane.tsx:586-596`).
* DOM is built imperatively with `document.createElement` — no framework (`frameZones.ts:67-140`).

### 8.4 Transient marks

* Nav flash: `symbolHighlight` box around the declaration name for **450 ms**
  (`CodePane.tsx:915-940`); skipped when the name contains `/` or `\`; the column is found by
  `indexOf(name, column-1)` with a fallback to the whole line.
* Ctrl/Cmd-hover: `.ctrl-click-link` underline (pointer cursor, accent underline, 1 px,
  offset 2 px) on the word under the cursor while the modifier is held
  (`CodePane.tsx:352-378`, `editor.css:372-379`).
* Occurrence highlight: registered as a Monaco document-highlight provider for
  `python, typescript, javascript, go, rust, java, c, cpp, shell`; whole-word,
  case-sensitive, capped at **500** matches (`editor/codeNavigation.ts:43-77`).
* Hover card: `GET /api/projects/{id}/hover`, cached in a **300**-entry map keyed
  `projectId:path:line:column`, cleared on file change and on `refreshKey`
  (`codeNavigation.ts:21-41`, `CodePane.tsx:900-902`). Body appends
  `\n\n---\n*F12 / Ctrl+Click 转到定义 · Shift+F12 查找引用*` (`codeNavigation.ts:115-122`).

### 8.5 Gutter picking (`editor/gutterSelection.ts`)

* Line numbers are a **picker**, not a selection: every click toggles that line into/out of the
  set; there is no modifier requirement (`gutterSelection.ts:152-157`, `CodePane.tsx:230-265`).
* A press-move-release that reaches a **different line number** becomes a contiguous range sweep
  (measured in lines, never pixels — a shaky click must not wipe the set,
  `gutterSelection.ts:109-131`).
* Shift-click extends from the current selection anchor (`:98-104`).
* Dragging over text clears the picked set (`CodePane.tsx:206-210`).
* `selectOnLineNumbers` must stay **off** or Monaco's whole-line selection would clear the set
  before the handler runs (`CodeViewer.tsx:68-75`).
* Selection → bar: a selection ending at column 1 of a line does **not** include that line
  (`CodePane.tsx:199-203`). Updates are coalesced to one per animation frame and suppressed
  entirely while the mouse is down (`CodePane.tsx:274-284`, `:299-332`).

### 8.6 Selection bar (three mutually exclusive variants)

`picked` → `selection` → `citationRange`, else nothing (`CodePane.tsx:1198-1319`):

| variant | text | actions |
| --- | --- | --- |
| picked lines | `已选 N 行 · 1, 4, 9` | 就这些行提问 · 就这段批注 · 在图谱中定位 · 清除 |
| drag selection | `第 a–b 行 · N 行` | 就这段提问 · 就这段批注 · 在图谱中定位 · 取消选择 |
| citation range | `引用第 a–b 行 · N 行` | 就这段提问 · 就这段批注 · 在图谱中定位 · 清除引用 |

`citationRange` is `null` when `citationHighlight.source === 'navigation'`, so a go-to-definition
jump highlights the code without offering 引用第… 提问 (`CodePane.tsx:646-659`). The bar is styled
with `--accent-soft` background and a `--accent-line` top border, entering with `slide-up`
(`editor.css:450-502`).

### 8.7 Reproducing the visuals without Monaco

A read-only host can rebuild every effect above with a plain scroll container, provided it knows
the line box geometry. The original uses: `fontSize 12.5`, `lineHeight 21`, mono stack
`'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace`, `padding: {top: 12,
bottom: 24}`, `lineNumbersMinChars: 4`, no minimap, no glyph margin, no folding gutters on
(`CodeViewer.tsx:63-118`).

Recipe:

1. Render `<div class="code-scroll">` with one child `<div class="code-line">` per source line at
   a fixed **21 px** height, `padding-top: 12px`.
2. A left gutter of fixed width (~4ch + padding) with `L<n>` labels, `user-select: none`,
   `cursor: default`; clicking a gutter number toggles that line in a Set (the picker).
3. Decorations become absolutely-positioned siblings inside each line box, or a single overlay
   layer positioned with `top = (line−1)*21 + 12`:
   * frame: a 2 px left border + `--frame-bg` background per line, with extra top/bottom borders
     and 3 px radii on the first/last line of each merged span (the edge-merge algorithm in §8.2
     is ~30 lines and ports verbatim once you swap `IModelDeltaDecoration` for
     `{top, height, classes}`).
   * citation: 6 % accent tint + 2 px left rail; run the flash animation `1.5s 2`.
   * pick: `--bg-active` + 2 px accent left border.
   * hover: `--card-range-bg` + inset 2 px accent line.
4. View-zone strips cannot be expressed as in-flow elements without moving the line boxes; keep
   them as a positioned layer that *reserves* height by padding the line above (19/24/104 px),
   which reproduces the "never covers code" property the original got from Monaco for free.
5. The nav flash and the ctrl-hover underline need only `<span>` wrapping of the matched token
   range — both are pure text-span styling.

What cannot be reproduced exactly without Monaco: the 500-match occurrence highlighter's
debounce behaviour, `fixedOverflowWidgets`, and the hover widget chrome. All three are optional
polish.

---

## 9. Keyboard map

| Shortcut | Scope | Where bound | Effect |
| --- | --- | --- | --- |
| `Ctrl/Cmd + Click` | editor content | `CodePane.tsx:303-315` (native capture listener) | go to definition at the clicked position; suppressed for non-text targets |
| `Ctrl/Cmd + F12` | editor | `CodePane.tsx:387-395` | go to definition at the caret |
| `Shift + F12` | editor | `CodePane.tsx:396-404` | find references at the caret |
| `Alt + ←` | editor | `CodePane.tsx:405-410` | navigate back |
| `Alt + →` | editor | `CodePane.tsx:411-416` | navigate forward |
| `Ctrl/Cmd + S` | whole window, **only while a Markdown doc is in edit mode** | `CodePane.tsx:736-746` | save the document instead of the browser dialog |
| `Ctrl/Cmd + F` | editor | toolbar button `CodePane.tsx:1141-1149` (runs Monaco `actions.find`) | in-file find; **no keybinding is registered by the app**, it is Monaco's own |
| `Alt` (held) | editor | `CodeViewer.tsx:78` (`multiCursorModifier: 'alt'`) | multi-cursor modifier; Ctrl/Cmd is reserved for navigation |
| `↑` / `↓` / `Enter` / `Esc` | nav picker | `NavPicker.tsx:37-62` | move / jump / close |
| `←` / `→`, `Shift + ←/→` | any splitter | `Splitter.tsx:44-53` | resize 10 px / 40 px |
| `↑` / `↓`, `Shift + ↑/↓`, `Home` | graph rail splitter (narrow only) | `GraphView.tsx:358-369` | rail ±3 % / ±8 % / reset to 46 % |
| `Enter` | graph relation row | `GraphView.tsx:491` | select that neighbour |
| `Enter` | note row | `NotesPanel.tsx:277-279` | open the note |
| `Enter` / `Space` | folder row | `NotesPanel.tsx:656-662` | pick the folder as create target |
| `Enter` | folder name input | `NotesPanel.tsx:450-452` | create the folder |
| `Esc` | note move menu | `NotesPanel.tsx:349-352` | close the menu |
| `Enter` | project search input | `FilePanel.tsx:132-135` | run the search |
| `Esc` | project search input | `FilePanel.tsx:134` | clear results (only when results are showing) |
| `Enter` / `Space` | conversation card | `ConversationCards.tsx:92-97` | open that conversation |
| `Enter` (no Shift) | composer | `Composer.tsx:78-81` | send; `Shift+Enter` inserts a newline |
| `Esc` | settings / release notice | `SettingsModal.tsx:37`, `ReleaseNotice.tsx:24` | close |

Notable absences: there is **no global shortcut layer** — no command palette (the `--z-palette`
token at `base.css:72` is unused), no `Ctrl+W` to close a tab, no `Ctrl+P`, no arrow-key
navigation inside the graph search, and no focus trap anywhere. The tab strip is mouse-only.

Tab mouse gestures (`EditorTabs.tsx`): click to focus (`:101`), middle-click to close (`:85-91`),
`×` to close (`:107-118`), HTML5 drag to reorder (`:68-84`), right-click for the context menu
`关闭 / 关闭其他 / 复制路径|复制标题|复制名称` (`:119-158`). Wheel over the strip scrolls it
horizontally (`:45-51`).

---

## 10. CSS inventory

Token vocabulary (all from `base.css:7-114`; hex values are the dark theme, the light theme
overrides the same names at `:75-114`):

* surfaces `--bg #0b0f16`, `--bg-sunken #080b11`, `--bg-panel #0f151d`, `--bg-elevated #151d27`,
  `--bg-hover #1a2430`, `--bg-active #21324b`, `--bg-overlay rgba(6,9,14,.62)`
* lines `--border #1e2836`, `--border-strong #2c3949`, `--border-accent #2f5c9c`
* text `--text #e3eaf2`, `--text-dim #9aabbe`, `--text-faint #68788b`, `--text-inverse`
* accent `--accent #4c8dff`, `--accent-hover #6ba1ff`, `--accent-press #3a76e0`,
  `--accent-soft rgba(76,141,255,.14)`, `--accent-line rgba(76,141,255,.42)`, `--accent-dim`
* feedback `--ok #3fb950`, `--warn #d29922`, `--danger #f85149`, `--info #58a6ff` (+ `-soft`)
* radii `4 / 6 / 8 / 12 / 16 px`; shadows `--shadow-1/2/3`
* motion `--ease cubic-bezier(.22,.61,.36,1)`, `--dur-fast 120ms`, `--dur 180ms`
* type `--mono 'Cascadia Code','JetBrains Mono','Consolas','Courier New',monospace`,
  `--sans 'Segoe UI Variable Text','Segoe UI','Microsoft YaHei UI','Microsoft YaHei',system-ui,-apple-system,sans-serif`
* z-order `--z-splitter 5`, `--z-topbar 20`, `--z-status 20`, `--z-modal 50`, `--z-palette 70`,
  `--z-toast 80`

### 10.1 `styles/graph.css` (1364 lines)

| block | purpose | tokens / metrics |
| --- | --- | --- |
| `.graph-view` | root, container query host | `--bg`, `--text`; `container-type: inline-size` |
| `.graph-head` | 48 px header | `--border`, `--bg-panel`/`--bg` mix |
| `.graph-syncing` / `.spinner` / `@keyframes graph-spin` | refresh pill | `--text-faint`, `--border-strong`, `--accent`; 9 px spinner, 0.8 s |
| `.graph-head-filters` | chip scroller, hidden scrollbar | gap 4 |
| `.graph-head-stats`, `.graph-stat`, `.graph-stat b` | 20 px stat pills | `--border`, `--bg-elevated`, `--text-faint`, `--text-dim`; tabular nums |
| `.graph-head-acts`, `.graph-act`, `.graph-act.primary`, `:focus-visible` | action buttons 26 px | `--radius-sm`, `--bg-hover`, `--accent`, `--accent-soft`, `--accent-line` |
| `.graph-banner` | inline error strip | — |
| `.graph-body` | `1fr / 332px` grid | — |
| `.graph-splitter`, `::after`, `.dragging`, `[data-dragging]` | 7 px horizontal rail handle | `--bg-sunken`, `--border-strong`, `--accent`; 34×3 px grip |
| `.graph-stage`, `.graph-canvas-wrap`, `.graph-canvas-wrap[data-graph-theme]` (dark / light variants) | canvas host + radial vignette | `--bg-sunken`; `#131c28→#0a0f16` / `#fff→#f2f5f9` |
| `.graph-canvas`, `[data-settling='true']` | 100 % fill, pointer-events off while settling | `outline: none` |
| `.graph-canvas .vis-tooltip` | restyled vis tooltip | `--bg-elevated`, `--border-strong`, `--shadow-2`, `--sans`; 11.5 px, max 340 px, `pre-wrap`, `z-index: 4` |
| `.graph-canvas-empty` | centred filter-empty text | `--text-faint`, 11.5 px |
| `.graph-canvas-tools`, `.graph-tool-btn` | 28 px zoom column, bottom-right 10 px | `--border`, `--bg-panel` mix, `backdrop-filter: blur(6px)` |
| `.graph-canvas-hint` | bottom-left hint | `--text-faint`, 10.5 px, `pointer-events: none`, `z-index: 2` |
| `.graph-settling` | top-centre pill | `--bg-panel` mix, 999 px radius, blur, `z-index: 3` |
| `.graph-blank*` | dashed empty card | `--border-strong` dashed, 440 px cap, `--radius`; icon tile 30 px |
| `.graph-rail` | 332 px column | `--border`, `--bg-panel` |
| `.graph-search`, `input`, `:focus-within`, `.graph-search-clear` | 30 px search field | `--border-strong`, `--bg-sunken`, focus → `--accent` + 3 px `--accent-soft` ring |
| `.graph-results`, `.graph-results.graph-rail-scroll` | results list | `max-height: 192px` (overridden to flex fill) |
| `.graph-result`, `[aria-pressed='true']`, `-label`, `-kind` | result row | 26 px min height, `--bg-hover`, `--accent-soft` + `--accent` |
| `.graph-dot` | 7 px community swatch | — |
| `.graph-hint`, `.graph-empty-line` | muted copy | `--text-faint`, 11 px |
| `.graph-filters*` | **unused** | — |
| `.graph-chip`, `[aria-pressed='true']`, `[aria-pressed='false']` | filter pill, 24 px / 22 px in header | `--border`, `--accent-*`; disabled = line-through + opacity .6 |
| `.graph-section`, `.graph-section-head`, `.graph-comm-list`, `.graph-comm`, `[data-hidden]`, `.graph-comm-label`, `.graph-comm-all`, `.graph-count` | community list | 28 px rows, 13 px checkbox `accent-color: var(--accent)`, `--radius-xs` |
| `.graph-rail-scroll` | `flex: 1 1 auto; min-height: 110px; overflow: hidden` | — |
| `.graph-detail`, `-back`, `-head`, `-title`, `-meta`, `-acts`, `-idle*`, `.graph-kind`, `.graph-kind-note` | inspector | `--accent-soft` kind pill (18 px), 13 px title, 10.5 px meta |
| `.graph-note-body` | 84 px note preview | `pre-wrap`, `--text-faint` |
| `.graph-tag.extracted/.inferred/.ambiguous` | **unused** confidence chips | `--ok` / `--warn` / `--danger` + `-soft` |
| `.graph-rel-group`, `> summary`, `::before`, `[open]`, `small` | `<details>` groups | 24 px summary, ▸/▾ drawn in CSS, `list-style: none` |
| `.graph-rel-list`, `.graph-rel-row`, `:hover`, `:focus-visible` | relation rows | 26 px min, `max-height: 280px`, `--radius-xs` |
| `.graph-relation-dir[data-dir='out']`, `-label`, `-kind`, `-loc`, `-rel`, `.graph-rel-open` | row cells | `-dir` 10 px accent when out; `-loc` `direction: rtl`, 96 px cap; `-rel` 9.5 px |
| `.graph-members`, `.graph-member*` | **unused** | — |
| `.graph-summary*` | AI summary | `--bg-sunken` box, `--border`, 11.5 px/1.65 |
| `.graph-rail-foot`, `.graph-legend*`, `.graph-foot-stats` | **unused** legend/footer | `--text-faint`; dashed swatch uses `border-top: 2px dashed` |
| `.conversation-graph-link`, `.conversation-graph-choices` | locate-in-graph strip | `--border`, 11 px |
| `@container graph (max-width: 760px / 860px / 560px / 430px)` | responsive graph | rail to bottom; stats hidden; tighter chips; header wraps |

### 10.2 `styles/note.css` (269 lines)

| block | purpose | tokens / metrics |
| --- | --- | --- |
| `.note-reader` | root, `container-type: inline-size` | `--bg-panel` |
| `.note-reader-bar` | wrap toolbar, min 38 px | `--border`, `--bg-elevated`; gap 4/9 |
| `.note-reader-mark` | 22 px accent tile | `--accent-soft`, `--accent`, `--radius-sm` |
| `.note-reader-title`, `.label`, `h2` | title stack | `.label` 9.5 px uppercase `--text-faint`; `h2` 13 px, ellipsis |
| `.note-reader-meta` | project/indexed/time | `--text-faint`, 10.5 px; hides the timestamp under 620 px |
| `.note-reader-actions`, `.ghost.small` | 23 px action buttons | `--text-dim` → `--text` on hover; labels collapse to icons ≤ 560 px (container) and ≤ 720 px (media) |
| `.note-reader-folder` | folder select, max 108 px (76 px ≤ 560) | `--border-strong`, `--bg-panel` |
| `.note-reader > .error-note / .notice` | inline banners | `--` |
| `.note-reader-scroll` | scroller | padding `22px 28px 40px` |
| `.note-doc` | reading measure | `max-width: 78ch; margin: auto` |
| `.note-doc .md`, `.md > :first-child` | body | 13 px / 1.72, `--text` |
| `.note-doc .md-h1 / .md-h1:first-child / .md-h2 / .md-h3 / .md-code` | heading scale | `.md-h1` 13.5 px/650 + `--border` underline; `.md-h2`, `.md-h3` mono 11.5 px muted |
| `.note-reader-edit`, `-input`, `-textarea`, `:focus`, `-edit-actions` | edit mode | inputs `--border-strong`/`--bg`; textarea mono 12.5 px/1.68, `tab-size: 2`, `resize: none`; focus = `--accent` + 3 px `--accent-soft` ring |

Pollution notes: `note.css:82`, `:110`, `:118` are **unscoped `@container` queries** (no container
name) — pasted into a host they will match whatever container is nearest, and `note.css:124` is an
unscoped `@media (max-width: 720px)`.

### 10.3 `styles/editor.css` (866 lines)

| block | purpose | tokens / metrics |
| --- | --- | --- |
| `.editor-pane` | root, `container-type: inline-size; container-name: editor-pane` | `--bg`; `position: relative` for the picker |
| `.editor-toolbar`, `.file-path`, `.tag`, `.tag.branch`, `.tag.dirty`, `.toolbar-actions` | 36 px toolbar | `--bg-panel`, `--border`, `--text-dim`; file path `direction: rtl`, min 72 px; tags capped 132 px; branch min 46 px |
| `.tag.nav-busy`, `.nav-busy .spinner` | 定位中… pill | `--accent`, `--accent-line`, `--accent-soft`; 9 px spinner 0.75 s |
| `.nav-notice`, `.success`, `.error`, `-text`, `-close` | transient notice | `--border`, `--bg-panel`, `--ok`/`--danger` mixes; `slide-up` |
| `.nav-picker-backdrop` | fills the **pane**, `z-index: var(--z-modal)`, `padding-top: 54px` | `--bg-overlay` |
| `.nav-picker` | 580 px cap, `max-height: calc(100% − 82px)` | `--border-strong`, `--radius-lg`, `--shadow-3` |
| `.nav-picker-head`, `-titles`, `-count` | header | 12 px strong / 10.5 px sub |
| `.nav-picker-list`, `-item`, `:hover`, `.active`, `:focus-visible` | rows | grid `minmax(90px,.9fr) minmax(0,1.6fr) auto`, gap 10, `--radius-sm` |
| `.nav-picker-name`, `-hint`, `-meta`, `-meta em`, `-foot`, `-foot kbd` | cells + footer | mono 11.5/10.5 px; hint `direction: rtl` |
| `.monaco-editor` (`--vscode-*` block) | fills VS Code highlight variables | hard-coded `rgba(76,141,255,…)` values |
| `:root[data-theme='light'] .monaco-editor` | light overrides | `rgba(37,99,235,…)` |
| `.monaco-editor .wordHighlight…` | 2 px radius on VS Code boxes | — |
| `.monaco-editor .ctrl-click-link` | modifier-hover underline | `--accent` |
| `.monaco-editor .monaco-hover.monaco-hover` | hover card chrome | `--shadow-3`, 8 px radius, 640 px cap |
| `.editor-mount`, `.editor-placeholder*` | mount + empty states | `--bg-panel`, `--radius-lg`; 46 px icon tile; `max-width: 42ch` copy |
| `.selection-bar`, `.lines`, `.lines .dot` | ask bar | `--accent-soft` bg + `--accent-line` top border; mono 11 px tabular |
| `.annotation-action`, `.annotation-editor*` | green annotation editor | `--ok` + `--ok` mixes; title input 25 px; textarea min 54 px |
| `.citation-highlight` | 6 % accent tint + 2 px left rail | `--accent` mixes |
| `.pick-line` | picked gutter lines | `--bg-active` + 2 px `--accent` |
| `.citation-line-flash`, `@keyframes citation-flash` | 1.5 s × 2 flash | `--selection-line` |
| `:root { --selection-bg, --selection-border, --selection-text, --selection-line, --card-range-bg }` (`:526-532`) and light override (`:534-540`) | extra tokens | `rgba(76,141,255,…)` / `rgba(37,99,235,…)` |
| `.code-cards`, `-label`, `-list`, `-group`, `-range`, `.code-card`, `.active`, `-title`, `-kind`, `.icon.note`, `.more` | conversation card strip | `--bg-panel`, `--bg-elevated`, 999 px pills, max 260 px, 9 px kind pill |
| `.conversation-card-highlight` | hovered card tint | `--card-range-bg` + inset 2 px `--accent-line` |
| `.range-frame`, `-top`, `-bottom`, `.annotation-frame*` | per-line frame boxes | `--frame-*` / `--ok` mixes; 2 px borders, 3 px radii |
| `.range-zone`, `.annotation-zone`, `-head`, `-toggle`, `-chevron`, `-kind`, `-title`, `-delete`, `-zone-body` | view-zone strips | 19 px / 24 px / 104 px; `--ok` mixes; body `pre-wrap`, `user-select: text` |
| `.range-flag`, `:hover`, `.active` | conversation strip pill | 16 px, `--frame-line`, `--bg-elevated`; active = `--accent` |
| `:root { --frame-bg, --frame-line, --frame-inner }` (`:835-839`) + light (`:841-845`) | frame tokens | rgba pairs |
| `@keyframes citation-flash`, `@keyframes slide-up` | motion | — |

Pollution notes: two **bare `:root` blocks** (`editor.css:526`, `:835`) that declare tokens on the
document root, plus `:root[data-theme='light']` selectors (`:341`, `:534`, `:841`), plus the
`.monaco-editor` variable blocks (`:320-360`) — all of them are global-scope writes. The
`.monaco-editor` blocks are irrelevant without Monaco but must not be pasted as-is.

### 10.4 `styles/tabs.css` (223 lines)

| block | purpose | tokens / metrics |
| --- | --- | --- |
| `.editor-pane-host` | column, `min-*: 0` | — |
| `.editor-pane-body` | `flex: 1`, column | — |
| `.editor-tabs` | 42 px strip | `--bg-panel`/`--bg` mix, `--border`, `user-select: none` |
| `.editor-tabs-strip` | horizontal scroller | `scrollbar-width: thin`, `scrollbar-color: var(--border-strong) var(--bg-panel)` |
| `.editor-tabs-strip::-webkit-scrollbar*` | 8 px custom scrollbar, 4 px radius | `--border-strong`, `--text-faint` |
| `.editor-tabs-hint` | 还没有打开的文件 | `--text-dim`, 11.5 px, opacity .75 |
| `.editor-tabs-spacer`, `.editor-tabs-action`, `:hover`, `.on` | terminal toggle at the right end | 6 px radius; `.on` = `--accent-soft` + `--accent` |
| `.editor-tab`, `:hover`, `.active`, `.active::before`, `.dragging` | tab | `min-width: 92px; max-width: 210px`; active gets a 2 px top accent line and `--bg`; dragging `opacity: .5` |
| `.editor-tab-label`, `-title`, `-close` | tab internals | close is 18 px and `opacity: 0` until hover/active |
| `.editor-tab-menu`, `button`, `:hover`, `:disabled` | right-click menu | `--bg-panel`, `--shadow-pop`, `z-index: var(--z-popover)`, 132 px min |

Pollution notes: `--shadow-pop` and `--z-popover` are used here but **declared nowhere** in
`base.css` (which defines `--shadow-1/2/3` and `--z-*` without `popover`), so both properties
silently fall back to `none`/`auto` — reproduce that or fix it deliberately. The custom scrollbar
rules are element-scoped but vendor-global in effect.

### 10.5 Global CSS that must not be pasted into a host page

From `base.css` (skimmed, but these are the offenders):

| selector | line | why it is dangerous |
| --- | --- | --- |
| `:root`, `:root[data-theme='light']` | `7`, `75` | rewrites ~40 token names document-wide |
| `*` | `118` | `box-sizing: border-box` globally |
| `html, body, #root` | `122-127` | `height: 100%` |
| `body` | `129-138` | background, colour, font, `overflow: hidden` |
| `::selection` | `140` | selection colour |
| `h1..h4` | `144-150` | heading weight/letter-spacing |
| `:focus`, `:focus-visible` | `154-162` | removes the default focus ring everywhere |
| `button`, `button.primary/.ghost/.danger/.small/.icon` (+hover/active/disabled) | `166-263` | restyles **every** button in the host |
| `input, textarea, select` (+hover/focus/placeholder/checkbox/number) | `267-329` | restyles every form control; `select` gets a drawn arrow |
| `a`, `a:hover` | `331-338` | every link |
| `code, pre, kbd` | `340-360` | mono font + `kbd` chrome |
| `::-webkit-scrollbar*` | `364-384` | every scrollbar in the document |
| `@media (prefers-reduced-motion: reduce)` with `*` + `!important` | `519-528` | `!important` on animation/transition durations for **all** elements |

`editor.css` additionally writes `:root` tokens (`:526-540`, `:835-845`) and `graph.css` /
`tabs.css` rely on `@keyframes graph-spin` / `spin` living in global scope. None of the four
files contains `!important` except `base.css:523-526`.

Practical rule for the port: **re-emit every rule with the host's variables and namespace the
component selectors** (e.g. `.cs-graph-*`), and drop `base.css` entirely — the host owns the
reset, buttons, inputs, scrollbars and focus rings.

---

## 11. Rebuild guidance

Legend: **exact** = port the maths and the CSS nearly verbatim; **approximate** = keep the
behaviour, accept different visuals; **drop** = the host already provides it, or it cannot work
without the original runtime.

### 11.1 Keep — exact

| feature | why it ports cleanly | anchors |
| --- | --- | --- |
| Filter/relations/meta/theme tables | pure data + pure functions, no DOM | §3 |
| `filterGraph` hidden-flag projection | 30 lines, plain objects | `graphFilter.ts:46-61` |
| Graph header, stat pills, family chips, reset button | plain buttons + CSS | `GraphView.tsx:279-297` |
| Graph rail (search / inspector / communities) | plain lists and `<details>` | `GraphView.tsx:373-415` |
| Rail drag + keyboard (narrow mode) | pointer capture + 3 keys | `GraphView.tsx:325-370` |
| Relation row table + `MAX_ROWS = 60` truncation note | markup only | `GraphView.tsx:472-509` |
| Citation chip + `citationLabel` + `note://` branch | 50 lines, no deps | `CitationChip.tsx`, `lib/citations.ts` |
| `CITE` regex and the `pushPlain` tokenizer | pure string work | `Markdown.tsx:426-484` |
| Markdown block/inline parser and its `.md-*` classes | 500 lines, zero deps, no `dangerouslySetInnerHTML` | `Markdown.tsx:82-537` |
| Note preview stripping + pinyin sort | regexes + `Intl.Collator` | `NotesPanel.tsx:12-36` |
| Folder tree build/flatten/indent maths | 8 + 6 + spacing constants | `NotesPanel.tsx:596-617` |
| `stripTitleLine`, `formatRelative`, `formatBytes`, `shortenPath`, `languageFromPath` | pure | `NoteReader.tsx:290-292`, `lib/format.ts` |
| Splitter geometry + keyboard | 70 lines | `Splitter.tsx` |
| Frame-merge decoration algorithm | data in, `{line, classes}` out | `decorations.ts:19-69` |
| Keyboard map (§9) | host-level bindings | — |

### 11.2 Approximate — same behaviour, different engine

| feature | what must change | risk |
| --- | --- | --- |
| **Force layout** | No vis-network. Either (a) implement a small force-atlas-2 loop over the same constants (`-60 / 0.005 / 120 / 0.08 / 0.4 / 0.8`, 140/200 iterations, `minVelocity 0`), or (b) use the persisted `payload.layout` and skip physics entirely. | A hand-rolled loop will not reproduce vis's exact positions; the *look* (community separation, hub size) is reproducible. |
| **Canvas rendering** | Replace the vis canvas with SVG or a 2D canvas of your own. Node radius `7 + 17·√(degree/maxDegree)`, community fill, 1.5 px border, 12 px label with halo, `strokeWidth = 1.1/scale`. | Text metrics differ; the label budget table still gives the right density. |
| **Wheel zoom** | Emit `scale *= 1.1` per notch about the pointer, clamp to `[0.03, 4]` (recommended: adopt the button clamp for the wheel too — the original's `1e-5…10` is an accident of vis). | The 0.03/4 clamp is *better* than the original; state the deviation. |
| **Label budget / constant-size labels** | Same table; set `font-size: 12/scale` px in the DOM/SVG. | Sub-pixel rounding differs from `round(…*10)/10`. |
| **Selection dimming** | Same numbers (0.42 / 0.08 / ≥0.75) applied as `opacity` on elements. | Group opacity requires per-element styling, not a parent filter. |
| **Double-click to open** | Bind `dblclick` on the node element instead of vis's event. | Must suppress the single-click selection that fires first (or accept both, as the original does). |
| **Drag to pin** | Pointer events + persist the new position map. | The original does not pin; it just stops physics. |
| **Tooltips** | `title` attribute or a positioned div after 120 ms. | Native tooltips ignore the 120 ms delay and the 340 px cap. |
| **Editor decorations** | §8.7 recipe. | Needs a line-height contract (21 px / 12.5 px font) to line up exactly. |
| **View zones** | Reserve height + absolutely position the strip. | Cannot get Monaco's clipping for free; use `overflow: hidden` per line band. |
| **Nav picker** | Re-implement as a positioned list; keep the exact key map and grid columns. | The host may already have a command palette — prefer that. |
| **Relationship summary** | Keep the SSE contract (`delta` / `done` / `error`), the label cycle and the elapsed counter. | Purely additive; safe. |

### 11.3 Drop — the host already owns it

| feature | reason |
| --- | --- |
| `TopBar` (brand, project chip, theme toggle, window controls) | Electron titlebar + host chrome (`layout.css:14-141`, `TopBar.tsx`) |
| Pane splitters and the three-pane shell | the plugin panel has its own geometry; only the *rail* splitter inside the graph still matters |
| `FilePanel` + `FileTree` (tree, git badge, index card, project search) | host file tree + search (`FilePanel.tsx`, `FileTree.tsx`) — keep only the **result row shape** and the `reveal(path, start, end)` contract if the host search can hand you a range |
| `CodePane`'s Monaco mount, `CodeViewer`, `EditorTabs` | host editor and tabs (`CodeViewer.tsx`, `EditorTabs.tsx`) — keep the tab **semantics** (`file`/`note`/`graph` kinds, reuse-by-path, close-neighbour rule at `AppState.tsx:363-375`) only if you render your own strip |
| Terminal dock | host terminal (`TerminalPanel.tsx`) |
| Approval cards, composer, streaming bubbles, chat list | host chat |
| Settings modal, Ollama/vector panels, release notice | host settings |
| Document (`*.md`) read/edit mode with `Ctrl+S` and mtime conflict handling | host editor (`CodePane.tsx:709-753`) — unless the host cannot render Markdown, in which case port `MarkdownDoc` + `Markdown` |
| Welcome page / project picker | host |
| `Icon` component (57 hand-drawn paths) | the host has its own icon set; substitute glyphs, keep the **sizes** (10/11/12/13/14 px) and the meaning (network = graph, sparkles = AI, notes = knowledge point) |
| Dead CSS (`graph-legend*`, `graph-tag*`, `graph-members*`, `graph-detail-idle*`, `graph-filters*`) | never rendered |

### 11.4 Feature-by-feature verdict for the graph panel

| sub-feature | verdict |
| --- | --- |
| Stale-while-revalidate payload cache (15 s) | **exact** — 20 lines, worth keeping |
| Layout persistence + 80 % seed reuse | **exact** if the host can store a JSON blob; otherwise **drop** and re-run physics |
| Settle watchdog (15 s idle / 120 s hard) | **approximate** — only needed because vis can silently stall; a deterministic loop needs a simple iteration cap instead |
| `applyLabels` viewport clipping | **exact** — it is the feature that makes the overview readable |
| Node size by degree | **exact** |
| Edge ink by source community + width/opacity table | **exact** |
| Arrowhead whitelist / blacklist | **exact** (and consider fixing `references`/`uses`, which currently get no arrow) |
| Hover dimming | **drop** — the original has none |
| Click dimming + white selection core | **exact** |
| Double-click open | **exact** |
| Search cap 30, substring over label/path/content | **exact** |
| Community checkboxes + "hide all" | **exact** |
| Family chips (with the `hierarchy` / `other` holes documented) | **exact, but fix or document the two holes** |
| AI relationship summary | **exact** if the host can stream; else **drop** the component and keep the neighbour table |

---

## 12. Invariants a re-implementer must not break

1. **Filters hide, they never remove.** Re-adding a filtered node would drop it at a random
   position and shove the layout (`graphFilter.ts:1-8`, `GraphCanvas.tsx:1-15`).
2. **A settle is persisted once, and only when it actually ran.** A watchdog that fires before
   the first physics tick must **not** save the seed (`GraphCanvas.tsx:326-333`).
3. **`fit` frames visible nodes only** (`GraphCanvas.tsx:225-229`).
4. **Labels keep a constant on-screen size**, ranked by degree inside the viewport, and the
   selected node is always labelled (`GraphCanvas.tsx:113-153`).
5. **Edge colour comes from the source community**, structural edges use neutral ink
   (`GraphCanvas.tsx:106-111`).
6. **Inferred edges are dotted, thinner and fainter** — never the same as extracted ones
   (`graphMeta.ts:81-85`, `GraphCanvas.tsx:462-464`).
7. **The relation vocabulary is single-sourced**; a relation that reads 调用 in the rail must not
   read `calls` in a tooltip (`graphMeta.ts:1-7`).
8. **Selecting a node force-enables its family and community** (`GraphView.tsx:160-167`).
9. **The citation highlight lives outside the editor**, and a second click on the same chip
   clears it (`AppState.tsx:231-238`, `:257-280`).
10. **Navigation jumps do not offer the ask bar** (`source: 'navigation'`,
    `CodePane.tsx:646-659`).
11. **A note tab survives a jump into code** (`AppState.tsx:86-89`, `:240-255`).
12. **The note body's `# Title` is stripped** before rendering, because the reader bar shows it
    (`NoteReader.tsx:290-292`).
13. **Gutter clicks are a picker**, not a selection, and text drags clear the picks
    (`CodePane.tsx:230-265`).
14. **The middleware of the tab strip is the state, not the DOM**: `openFile`/`noteView`/
    `graphFocusNodeId` are all projections of `tabs[activeTabIndex]`
    (`AppState.tsx:462-472`).
15. **`move_folder: true` is mandatory** when changing a note's folder, or the backend ignores
    the id (`types.ts:604-611`).
16. **Every fetch is abortable and guarded by `signal.aborted`**, including the streaming
    summary, which is also the stale-response guard (`RelationshipSummary.tsx:12-17`,
    `:49-69`).
