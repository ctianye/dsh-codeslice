# CodeSlice v3 — 冻结接口与文件所有权

> 本文件是并行执行的唯一契约来源。**先读它，再动手**。
> 任何与本文件冲突的实现都必须停下来问，不允许静默改契约。

## 0. 文件所有权（越界即失败）

| 区域 | 拥有者 | 只能改这些 |
|---|---|---|
| A 宿主 | Agent A | `lib/projects.js`(新) `lib/frames.js`(新) `lib/prompts.js`(新) `index.js` `lib/cluster.js` `lib/notes.js` `lib/query.js` `lib/notegen.js` `lib/answer.js` `dev/frames-probe.mjs`(新) `dev/projects-probe.mjs`(新) `dev/host-test.mjs` |
| B 侧栏 | Agent B | `client/src/sidebar/**`(新) `client/editor-src/entry.js` `client/editor.js`(重建) |
| C 图谱 | Agent C | `client/src/graph/**`(新) |
| D 工作台 | Agent D | `client/src/workbench/**`(新) |
| E 集成 | Agent E | `client/src/index.js` `client/src/session-view.js`(新) `client/src/workspace-panel.js` `dev/build-client.mjs` `dev/harness/run.mjs` `dev/compare/*`(新) |

禁止：任何人改动自己不拥有的文件。需要别人改一行时，写进交付说明交回编排者。
`client/src/{index,api,styles,i18n,icons,assets,markdown}.js`、`lib/{store,resolve,build,graphify,analyzer,...}.js` 一律只读（E 拥有 `client/src/index.js`）。

## 1. 构建与验证规则

- `dev/build-client.mjs` 现在递归读取 `client/src/**/*.js`，模块 key 是相对 `client/src` 的 POSIX 路径（`sidebar/reader.js`）。子目录 import 用普通相对路径（`../api.js`、`./tree.js`）。
- **单作用域**：所有模块拼接进同一个函数体，顶层 `const/let/class` 重名是**构建致命错误**。因此：
  - 每个区域的顶层声明一律加前缀：侧栏 `sb*`、图谱 `gr*`、工作台 `wb*`；
  - 导出的组件名唯一且语义化（见 §2），不得复用已有名字（`GraphCanvas` `GraphPanel` `CodePanel` `NotesPanel` `WorkspacePanel` 已被占用）。
  - 辅助函数尽量放进函数体内部，不要散布到顶层。
- A/B/C/D **不运行** `node dev/build-client.mjs`（会写 `client.js`，属 E）。自检只跑 `node --check <自己写的每个文件>`。
- E 在其它区域落地后统一生成 `client.js`、跑 harness。
- 不得新增运行时依赖。React 与 hooks 从 `../icons.js` 取（`h`, `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`）；不得 `import 'react'`（除 icons.js 自身）。
- 文案走 `t('key')`，key 由各区域自带 locale 字典（§2.4）合并；颜色只用宿主语义 token（`var(--dsw-alias-*)`）+ `color-mix`，不要硬编码色值（图谱的 Tableau-10 除外，那是数据色）。

## 2. 客户端模块契约

组件的 `props` 形状沿用现有侧栏标签约定（对照 `client/src/outline-panel.js` / `graph-panel.js`）：

```
props = { ctx, scope:{cwd?, sessionId?, ...}, tab?:{path?, id}, visible?, focusRequest?,
          onOpenFile?, onAsk?, onAskSelection?, onSelectionChange?, t, locale }
```

### 2.1 侧栏（Agent B）

| 文件 | 必须导出 |
|---|---|
| `client/src/sidebar/reader.js` | `export function SidebarReader(props)` — **唯一集成点** |
| `client/src/sidebar/tree.js` | `export function sbFileTree(props)`（内部），或任意 `sb*` 命名 |
| `client/src/sidebar/tabs.js` | 多标签条与活动标签状态 |
| `client/src/sidebar/editor.js` | CodeMirror 挂载/卸载 + 方框装饰 |
| `client/src/sidebar/frames.js` | 区间框数据 + 标题条（DOM 可断言） |
| `client/src/sidebar/style.js` | `export const SIDEBAR_CSS` |
| `client/src/sidebar/locale.js` | `export const SIDEBAR_LOCALE = { zh:{...}, en:{...} }` |

`SidebarReader` 行为（验收即按此逐条检查）：
1. 顶部**文件树**，数据来自 `POST /codeslice/api/tree`（§3.5）；目录可折叠，点文件在当前标签打开。
2. **多标签**：打开过的文件各占一个标签，可关闭、可切换；标签间保留各自滚动位置（至少保留选中区间）。
3. 编辑器用 `loadEditor(ctx)`（`client/editor.js` 的 `create(container, options)`）；只读 + 行号 + 语法高亮 + 行号/拖选两种选区手势。
4. **方框**：文件里每个已记录的区间画一个方框——区间首行上边 2px、末行下边 2px 边框，上方 19px 标题条，标题可点击（点击 → 切回该方框所属会话的「对话」视图并定位；实现见 §2.5 `onOpenSession`）。
5. **同一区间去重**：`path+startLine+endLine` 相同只画一个框，取最新记录。
6. 选中区间后写入当前会话输入框：`props.onAskSelection`（E 接到 `inputActions.insertQuote`）。
7. 框数据来自 `POST /codeslice/api/frames`（§3.2），创建走 `op=create`，`sessionId` 取 `props.scope.sessionId`。
8. 所有 DOM 元素带 `data-cs="..."` 标记（至少：`file-tree` `tab` `editor` `frame-strip`），harness 靠它断言。

`client/editor.js` 允许改造 `client/editor-src/entry.js` 后重建（`node dev/build-editor.mjs`，esbuild 在 `D:/CodeSplit/frontend/node_modules`，CodeMirror 在 `C:/Users/cheng/.dsh/profiles/desktop/node_modules`），但必须保持既有 handle 方法（`setDoc/setLanguage/setDecorations/setSelection/clearSelection/scrollToLine/focus/destroy`）不删不改语义，可新增（如 `coordsAtLine`）。重建后 `node dev/build-editor.mjs --check` 必须通过。

### 2.1.1 右栏挂载点：DSH 原生 Sidebar（不是 better-sidebar）

桌面 profile **没有加载** `dsh-better-sidebar` 的客户端服务：Cordis 对未声明的服务一律隔离，所以 `ctx.get('betterSidebar')` 恒为 `undefined`、`ctx.inject(['betterSidebar'])` 永不回调——这就是 `codeslice:reader` 从未出现在右栏的真正原因。把 `betterSidebar` 写进 `inject` 会让应用停在「Loading plugins…」（服务确实不存在）。

实际挂载面是 DSH 自带的右栏，三个服务都可用（已声明进 bundle 的 `inject`）：

| 服务 | 用途 | 用到的成员 |
|---|---|---|
| `sidebarRightTabs` | 标签类型注册表 | `register({ id, kind, multiple, priority, title, guide })`、`get(kind)` |
| `sidebarRight` | 导航控制器 | `openTab(kind, { params })`、`openResource`、`tabsIn`、`hide`、`registerCloseHandler` |
| `sessions` | 会话 cwd | `list.getSnapshot().byId[sessionId].cwd` |
| `uiConversation` | 会话视图切换 | `binding(sessionId).activate('chat')` |

注册约定（`client/src/index.js` 的 `ixReaderNativeProps` / `nativeKind`）：

- 类型：`id = kind = 'codeslice:reader'`、`multiple: false`、`priority: 'extension'`、`title: () => t('reader.tab.title')`、`guide` 一条（右栏「开始」页的入口卡）。
- 正文：`ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'codeslice:reader', inject: (sessionId) => ({ sessionId }) }, Body)`；Body 从槽位注入的 `useTabInfo().tab.navigation.params` 取 `{ path, startLine, endLine, nonce }`，并映射成 `SidebarReader` 的 `{ scope:{sessionId,cwd}, tab, visible, focusRequest, onOpenFile, onAskSelection, onOpenSession }`。
- 打开：`sidebarRight.openTab('codeslice:reader', { params })`；`betterSidebar` 仅作为其它 profile 的 fallback 保留。
- 视图回跳：`uiConversation.binding(sessionId).activate('chat')`，失败再退到 `layout.openView('chat')` / 点击可见的「对话」标签。

入口：编辑器选区浮层的 **添加到对话**（唯一入口；自动新建 session 并插入引用 chip）；图谱节点「打开代码」。**多区间**仍是单区间模型：每个文件标签一个 `pick{start,end}`，多次添加在 `frames` 里累积多个方框，框标题点击回对应会话。


| 文件 | 必须导出 |
|---|---|
| `client/src/graph/view.js` | `export function GraphView(props)` — **唯一集成点** |
| `client/src/graph/canvas.js` | `export const GRAPH_CANVAS_PARAMS`（桌面端逐字参数）+ `export function grCreateStage(...)` |
| `client/src/graph/theme.js` | `export const GRAPH_PALETTE`（Tableau-10）+ `export function grCommunityColor(cid)` + 边分级 |
| `client/src/graph/relations.js` | 检查器分组（`export function grRelationGroups(...)`） |
| `client/src/graph/filter.js` | 族开关过滤（`export function grFilterGraph(...)`） |
| `client/src/graph/style.js` | `export const GRAPH_CSS` |
| `client/src/graph/locale.js` | `export const GRAPH_LOCALE` |

`GraphView` 行为：画布（vis-network）+ 右轨检查器（节点详情/关系/族过滤）；`props.focusRequest`（`{path?, nodeId?, startLine?, endLine?}`）定位节点并选中；节点→`props.onOpenFile({path,startLine,endLine,nodeId})`。会话视图里只显示**该 session 关联**的节点时用 `props.sessionId` 过滤（无关联则显示全图并提示）。`props.railCollapsible` 在窄容器下让社区列表收进「详情」抽屉，画布占满 `.gr-stage`；`canvas.fitVisible` 按可见节点 bbox + 96/72px 边距计算 scale（0.03–1.6），避免标签/光晕被裁。社区行点击时成员保持不透明、非成员与跨社区边降到 0.28/0.06，同时把相机聚焦到社区中度数最高的核心节点并给它白色选中环（`focus.hubId`），与点击单个节点同一套 `focusScale`；窄栏抽屉会自动收起让聚焦可见，重新开「详情」时选中行仍为蓝底。

**工作目录必须由视图自己解析**：`conversation.view` 的槽位属性只有 `{inspectCall, viewRequest, openView, completeViewRequest}`，没有 `scope`。不解析就直接发请求，Host 会退回 `workingDirectory.defaultDirectory`，画布上出现的是 DSH profile（`package.json` / `pnpm-workspace.yaml`，约 40 节点），不是当前项目。解析顺序：`scope.cwd` → `ctx.get('sessions').binding(sessionId).session.projections.faceOf('workingDirectory').getSnapshot()` → `ctx.get('sessions').list.getSnapshot().byId[sessionId].cwd` → `resolveWorkspace(ctx, {sessionId})`（与 composer chip 同一套 workspace 模型）。解析结果交给 `makeCaller(ctx, cwd)`，`graph/layout/node/search` 共用同一个 root。

必须与 `D:\CodeSplit\frontend\src\components\graph\` 对齐：
- `GraphCanvas.tsx` 的 forceAtlas2Based 参数、stabilization、边样式、标签预算、坐标缓存；
- `graphTheme.ts` 的 Tableau-10 与族分级；
- `graphRelations.ts`、`graphFilter.ts`、`GraphView.tsx` 的交互。
把关键常量收进 `GRAPH_CANVAS_PARAMS`，便于 `dev/compare` 逐字 diff。

### 2.3 工作台（Agent D）

| 文件 | 必须导出 |
|---|---|
| `client/src/workbench/pages.js` | `export function WorkbenchPage(props)`（`{ctx, scope, t, locale}`） |
| `client/src/workbench/settings.js` | `export function SettingsPage(props)` |
| `client/src/workbench/style.js` | `export const WORKBENCH_CSS` |
| `client/src/workbench/locale.js` | `export const WORKBENCH_LOCALE` |

`WorkbenchPage` 三页（不含代码）：
1. **笔记库** — 笔记树 + 阅读器（可复用 `notes-panel.js` 的 `api('notes')` 语义，但不要 import 旧面板；自己实现薄壳即可）。
2. **图谱列表** — `projects op=list` 的登记表：名称（可重命名）、root、构建时间、统计（文件/行/节点/边/社区），可删除；空态引导「构建当前项目图谱」。
3. **笔记图谱** — 笔记与代码锚点的关系图（用 `notes op=graph` 现有契约）。
`SettingsPage`：
- 三套提示词：**主对话 system 提示词**、**知识点问答提示词**、**转笔记默认提示词**；可视化编辑（多行文本域）、保存、恢复默认、显示「自定义 / 默认」状态；数据走 `prompts`（§3.3），随工作区保存。主对话的 `联系上下文` 开关单独存 Host 状态，并在每次请求重建的 `CodeSlice 联系上下文` 段落中输出「当前开关：开启/关闭」。
- 检索设置：沿用现有 topK / RRF / 族开关（不要新增参数名），并显示**向量索引状态**（来自 `status` 的现有字段，读不到就显示未知）。

### 2.4 文案与样式合并（E 负责调用）

E 在 `client/src/index.js` 里：
```js
import { mergeDict } from './i18n.js';
mergeDict(ctx, SIDEBAR_LOCALE);   // 各区域同样调用
const css = fullCss() + SIDEBAR_CSS + GRAPH_CSS + WORKBENCH_CSS;
```
区域 locale 字典结构必须与 `client/src/i18n.js` 现有字典一致（`{ zh:{...}, en:{...} }`）。

### 2.5 会话视图（E）

```js
ctx.slots.inject('conversation.view', () => ctx.slots.register({
  name: 'conversation.view',
  id: 'codeslice:graph',
  order: 20,
  label: () => t('view.graph'),
  locale: 'codeslice',
  children: { 'codeslice.graph.view': { kind: 'single', scope: 'session' } },
  inject: (sessionId) => ({ sessionId }),
}, (props) => h(GraphView, { ...props, ctx, t, locale })));
```
- 第三项必须与「对话」(order 0)、「轨迹」(order 10) 并列；`label()` 必须有值（无值不渲染）。
- 会话视图内的图谱节点 ↔ 代码区间双向定位；`onOpenFile` → 打开侧栏 `codeslice:reader` 标签
  （`sidebar.openTab({ type:'codeslice:reader', path, title: baseName }, { sessionId })`）。
- 方框标题点击 → 回到发起会话：优先 `ctx.layout.openView?.('chat')` / `ctx.get('conversation')?.openView?.('chat')` 之一（探测式调用，两个都不存在时退化为 `sidebar.openTab` 打开该会话并提示），随后 `inputActions.insertQuote` 不可用则只做定位。

## 3. 宿主 API（Agent A 实现，其余人按此消费）

统一 `POST /codeslice/api/<method>`，body JSON，响应 `{ok:true, value}` / `{ok:false, error:{code,message}}`。
`cwd` / `root` 沿用现有解析（`resolveRoot`）。所有写盘用 `lib/store.js` 的原子写；损坏文件挪 `.corrupt-<ts>` 后回 400（`ApiError` `'corrupt-state'`），**不得读成空**。
三个新 store 的目录：`process.env.CODESLICE_STATE_DIR || stateDir()`，供探针隔离。

### 3.1 `tree`
`{}` → `{ root, entries:[{ path, type:'dir'|'file', size? }], truncated:boolean }`
顶层路径相对 root、正斜杠；跳过 `.git/node_modules/.venv` 与二进制；上限 20000 条后 `truncated:true`。

### 3.2 `frames`
存储 `%STATE%/<sha1(root)>.frames.json`，记录
`{ id, path, startLine, endLine, sessionId, messageId?, title, question, createdAt, updatedAt }`。
- `op=list` `{ sessionId?, path? }` → `{ frames:[{...record, status:'fresh'|'moved'|'missing', actualStart?, actualEnd?}] }`
- `op=create` `{ path, startLine, endLine, sessionId, title, question, messageId? }` → `{ frame }`
- `op=delete` `{ id }` → `{ removed:true }`
- **去重**：`id = sha1(root + ':' + path + ':' + startLine + ':' + endLine)` 前 16 位；同 id 再次 create 覆盖字段（最新胜），不新增记录。
- `status`：读文件对应行文本；同位置相同 → `fresh`；在 ±200 行内找到同样文本 → `moved` + `actualStart/actualEnd`；找不到或文件没了 → `missing`。`startLine` 越界夹取到 `[1, lines]`。

### 3.3 `prompts`
存储 `%STATE%/prompts.json`：`{ system:{custom,default}, qa:{custom,default}, note:{custom,default} }`，`default` 由代码常量提供（永远可就地恢复），`custom` 可为 `null`。旧 `{note,ask}` 文件在读取时迁移到 `qa`。
- `op=read` `{}` → `{ system:{custom,default,effective}, qa:{...}, note:{...} }`
- `op=save` `{ system?, qa?, note? }`（字符串或 `null`）→ 同上
- `op=reset` `{ which:'system'|'qa'|'note'|'all' }` → 同上
`lib/notegen.js` 与 `lib/answer.js` 取 `custom ?? default`（不要硬编码第二份提示词）。

### 3.3.1 `context`
进程级 `联系上下文` 开关，供 `lib/prompts.js` 的动态系统段落读取：
- `{}` → `{ enabled:boolean }`（读）
- `{ enabled:true|false, sessionId? }` → `{ enabled:boolean }`（写；`sessionId` 目前只用于客户端同会话同步，Host 保持最后一个值）
默认 `false`。关闭时 snippet 问答只保留 `selection` 阶段；开启时才允许 graph / notes / retrieval，并以选中声明作为图谱锚点。

### 3.4 `projects`
存储 `%STATE%/projects.json`：`{ projects:[{ id(sha1(root)前16), root, name, builtAt, stats{files,lines,nodes,edges,communities} }] }`
- `op=list` `{}` → `{ projects:[...] }`
- `op=rename` `{ id, name }` → `{ project }`
- `op=delete` `{ id }` → `{ removed:true }`
- 构建成功后自动 remember（`documentFor` 成功后），默认 `name = 末级目录名`。
- `status` 增字段 `projects`（同 list）与 `prompts`（同 read 的摘要：三套是否 custom）。

### 3.5 旧缺陷（同一批修掉，均要求探针/测试覆盖）
1. `codeslice_references`：`refsTo()` 返回 `{locations,truncated}`，`index.js:457` 当数组传给 `clip` → TypeError。改成 `refsTo(...).locations`，并且 `truncated` 要在文本里说明。
2. `lib/notes.js` 锚点：记录未截断的 `endLine`、片段却截到 40 行/1600 字符 → 一创建就 `moved 0`。锚点必须记录**实际读取区间**。
3. `codeslice_callers` 的 `depth` 参数被忽略 → BFS 真的按 depth 展开（上限沿用 `MAX_DEPTH`）。
4. `notes`/`annotations` 写盘失败被吞 → 冒泡成 400。
5. `status` 遇到损坏 `rag`/`notes` 会整体 400 → 该字段降级为 `{ ok:false, reason }`，其余字段照常 200。
6. `lib/cluster.js` 标签规则对齐桌面端 `D:\CodeSplit\backend\app\graph\cluster.py`：
   `成员最多文件名` / 跨文件 `name +N`（N=文件数-1）/ 孤立点并入 `未分类` / `MIN_COMMUNITY_SIZE=2` / 重名 `label · representative`（representative = 该社区内度数最高的 function|class 的 label）/ 排序 `(-size, min(id))` / 池化社区排最后。
   **另须导出纯标注函数** `summariseCommunities(nodes, edges, assignment)`，供 `dev/compare` 用桌面端 assignment 复算标签（比对靠它，不靠 Louvain 逐点一致）。

### 3.6 构建指纹（缓存不能跨设置复用）

`documentFor` 读盘上的 `index.json` 时必须校验 `document.buildKey === buildKeyOf(config)`，不一致就重建。`buildKey` 覆盖 `maxFiles / maxFileBytes / maxDepth / superclassJs / graphBackend`。

原因：一份用 4MB `maxFileBytes` 构建的缓存会把 1.7MB 的 `client/editor.js` 整包解析，单文件贡献约 1470 个节点（`client.js` 再加 223 个）；之后即使把上限调回 512KB，缓存仍会被直接复用，画布上画的是 CodeMirror 的内部符号，而不是仓库本身。桌面端同一仓库是 930 节点 / 18 社区，插件这边若不校验指纹会显示 2639 节点。

### 3.7 会话视图与桌面端对齐的三个硬约束

1. **`graphBackend` 必须是 `builtin`。** `auto` 会在 graphify 可用时把构建交给 CLI，词表变成 `文件 · 符号()`，而且不跳生成物：本仓库会解析 `plugin/client/editor.js`（1.7MB）与 `plugin/client/vis-network.min.js`，得到 2932 节点 / 161 社区；桌面端同一仓库是 930 节点 / 18 社区。`builtin` 是桌面 `backend/app/graph` 的移植，才对得上。
2. **`maxGraphNodes` 不能低于仓库的符号数。** 桌面端画全部节点，聚合只发生在图规模真的超过上限时。配置为 600 时，932 节点会被 `graphSlice` 按社区压成 20 个社区点与 447 条社区间关系，画布上只剩几团气泡；现为 5000。
3. **视图高度必须由视图自己量取。** `conversation.session` 的 `.viewArea` 是 `flex: 1 0 auto`、`min-height: auto`，高度等于内容高度。右轨社区列表有 161 行时，`.gr-view` 被撑到 5424px，而滚动容器只有 609px，vis 会把图 fit 进 394×5424 的竖条（小团 + 巨大空隙 + 标签堆叠）。`GraphView` 用 `useLayoutEffect` 找最近的 `overflow-y: auto|scroll` 祖先，把高度设为 `scroller.clientHeight - composerSeat.height`，并用 `ResizeObserver` 跟随侧栏开合与输入框增高；`.gr-rail` 自己滚动。

另：vis 只监听 `window.resize`，容器变宽/变窄（右栏开合、容器查询从并排切上下堆叠）不会自动重绘。`GraphStage` 的 `ResizeObserver` 必须 `network.setSize(w, h)` 之后显式 `network.redraw()`，否则画布会变成空白。舞台在数据到达之后才创建时（视图先处于 parked），数据集要由 `stageEpoch` 触发一次重放，不能留着空 DataSet。

## 4. 各区域自检（交付前必须自己跑过并把输出贴回）

| 区域 | 自检 |
|---|---|
| A | `node --check` 每个改动文件；`node dev/host-test.mjs "D:/dsh-CodeSlice"`（≥79 且含新断言）；同上 `"D:\CodeSplit"`；`node dev/frames-probe.mjs`；`node dev/projects-probe.mjs`；`node dev/chat-probe.mjs`；`node dev/audit-checks.mjs`；`node dev/robustness.mjs` |
| B | `node --check client/src/sidebar/*.js`；`node dev/build-editor.mjs --check`（若改过 entry 则先 rebuild） |
| C | `node --check client/src/graph/*.js` |
| D | `node --check client/src/workbench/*.js` |
| E | `node dev/build-client.mjs --check`；`node dev/harness/run.mjs`（窄 + `--wide`）；全闸门总跑 |

A 的 `dev/host-test.mjs` 只增不改既有断言，新增至少：`tree` 形状、`frames` create/list/delete + 区间去重 + moved/missing、`projects` list/rename/delete、`prompts` read/save/reset。

探针一律走 `CODESLICE_STATE_DIR` 指向临时目录，跑完清理，不污染真实 `%TEMP%/dsh-codeslice`（`projects` 是全局登记表，探针必须自带隔离目录）。

## 5. 桌面端参考（只读，逐项对齐）

- `D:\CodeSplit\backend\app\graph\cluster.py`
- `D:\CodeSplit\frontend\src\components\graph\{GraphCanvas.tsx,graphTheme.ts,graphRelations.ts,graphFilter.ts,GraphView.tsx,ConversationGraphLink.tsx}`
- `D:\CodeSplit\frontend\src\components\editor\{frameZones.ts,decorations.ts,gutterSelection.ts,codeNavigation.ts}` + `src/styles/editor.css`（区间上下 2px 边框 + 19px 标题条）
- 侧栏原版复用（MIT，源码 + 预构建客户端整包 vendor，不再自研）：`D:\DSH-better-sidebar-main\DSH-better-sidebar-main`，运行时副本 `plugin/client/vendor/better-sidebar/`（`client.js` / `client-editor.js` / `client-registry.js` / `client-locale.js` / `client-mermaid.js` / `client-terminal.js` / `LICENSE`）。

## 6. 复用的 Better Sidebar（vendor 原版）

### 6.1 加载链

1. Host 白名单：`plugin/index.js` 的 `CLIENT_ASSETS` 增加 `better-sidebar/<name>.js` 六项，路由仍是 `/codeslice/assets`。
2. 客户端 `startBetterSidebar`（`client/src/better-sidebar.js`）先 `import('codeslice/assets/better-sidebar/client.js')`，再在 `window.__ModuleLoader__.load({ id:'dsh-better-sidebar', factory })` 注册。
3. 预构建 bundle 内的分块地址由 `dev/vendor-better-sidebar.mjs` patch 为 `codeslice/assets/better-sidebar/<name>.js`（上游原为 `sidebar/bundle/<name>.js`）。
4. 注册后 `ctx.plugin(mounted)` 把它的服务挂到本插件的子 fiber；`ctx.get('betterSidebar')` 即原版公开服务（`openFile` / `openTab` / `activateTab` / `getSnapshot` / `nativePathTabs` 等）。

### 6.2 自有 host 协议

原版编辑器调 `sidebar/api`（`fs.tree` / `fs.read` / `session.cwd` / `changes.ops`）与 `sidebar/write`。CodeSlice 在 Host 补了同名路由（`lib/sidebar-api.js`）：

- `POST /sidebar/api`：body `{op,root|cwd,path,content?}`；`fs.tree`、`fs.read`、`session.cwd`、`changes.ops`。
- `POST /sidebar/write?sessionId&cwd&path&expectedMtimeMs`：body 为纯文本；写回时保留原文件 CRLF/BOM；`expectedMtimeMs` 不一致返回 `fs-conflict`。
- 未实现的媒体/终端 op 返回 `method-error`，编辑器对应按钮不可用，但打开/编辑/保存/文件树/多标签都可用。

### 6.3 CodeSlice 增强层（不改原版编辑器）

`client/src/sidebar/overlay.js` 扫描 DOM 上的 `.cm-editor` 并叠加：

- **区间方框**：读取 `.cm-line` 与行号槽 `.cm-gutterElement` 的可见行带，画 2px 上下边框 + 8% 填充。
- **小标题条**：在区间上方 19px，显示 frame 标题；点击先 `uiWorkspace.openSession(sessionId)` 切回发起会话，再 `uiConversation.binding(id).activate('chat')` + 点击 host 的“对话”tab。
- **添加到对话**：选区浮层只保留一个 `.cs-add-chip`（「添加到对话」，选区左上）。上游原生 `selectionPopup` 由 CSS `[class*="selectionPopup"] { display:none!important; }` 隐藏，因此一次选区只出现一个入口。
- **每次添加新开 session**：点击后 `sessions.create({workspaceId})` → `uiWorkspace.openSession(newId)`；等待 200ms 让 host 完成面板切换后，用 `revealCodeRange` 在**新 session** 的右侧栏重开同一文件（Better Sidebar 的 tab 是 session-scoped，不重开会得到空右栏），再 `conversation.input.for(scope).insertReference(...)` 插入可点击引用 chip，并 `POST frames create` 写 frame。composer 的 `CodeSlice · path:start-end` 条同步通过 `setSelection` 显示本次区间。
- **标签跳代码**：composer 左上 `cs-bar-ref` 点击走 `revealCodeRange(ctx, selection, root, sessionId)`，由 `betterSidebar.openFile` 打开并用 `.cm-scroller.scrollTop` 滚到对应行；无选区才回退工作台。
- **已删除入口**：右栏「文件大纲」（`codeslice:outline` 不再 `registerTab`）、composer 右上「代码阅读」按钮；原生 `codeslice:reader` 默认不注册（仅 `globalThis.__csUseNativeReader === true` 时 opt-in）。
- **frames 列表**：`op:'list'` 不按 sessionId 过滤，同一文件路径的所有 frame 都参与绘制；render 按 `start:end` 去重，同区间多 session 只画一个方框，最新 frame 的标题/会话生效。
- 约束：**不要给 `.cm-line` 加 padding**。行号槽与文本行的 top 必须相等，overlay 依赖这个配对映射行号；任何行内边距都会让行号与文本错位，并让 `visibleLines` 丢行。标题条只画在区间第一行上方有空间时；区间贴顶时跳过标题，保留方框。

### 6.4 验证记录（2026-11-13，真机 DSH）

- 启动：`D:\DeepSeek_harness\DeepSeek Harness.exe --remote-debugging-port=0` 读 `DevToolsActivePort` 取 CDP 端口。
- 打开 `plugin/index.js`：原版多标签（`index.js` / `client.js` / `文件` / 其他文件）可切换，语法高亮、文件树、保存按钮正常。
- 编辑测试文件 → `保存` 发出 `POST sidebar/write` 且磁盘内容更新。
- 选 17-18 行 → 浮层只有「添加到对话」→ 点击后新 session 创建（`session-d2788776…` → `session-c35d3e1f…`），右栏仍显示 `index.js`（`cm` 宽 548），frame 标题「关于 index.js 第 17-18 行」与方框正常，composer 出现 `@plugin/index.js:17-18`。
- 点击 composer 左上 `plugin/index.js:17-18`：右栏 `scrollTop` 0 → 254.72，跳到代码区间，未进入工作台。
- 切到另一 session 后点 frame 标题：当前 session 从 `session-d7822208…` 回到 `session-c35d3e1f…`，验证“点标题回对应会话”。
- 真实 AI 询问：composer 输入「请用两句话说明这两行导入分别做什么。」+ `@plugin/index.js:17-18`，提交后 AI 返回两行导入的逐项解释，draft 清空、消息落库。
- 已知边界：frame 起始行紧贴编辑器顶部时只画方框不画标题（避免盖住文件路径行）；未实现的媒体 op 不提供 UI。

### 6.5 清理与已知边界

- 测试会话通过 `uiWorkspace.archiveSession(id,{stopActivity:true})` 归档；frame 的 `sessionId` 若被测试覆盖，用 `POST /codeslice/api/frames {op:'create',...}` 重新指回原会话。
- 右栏 tab 条可能同时保留旧 session 的隐藏 `开始` / 文件名 tab；这是原版 keepMounted 行为，不影响当前会话可见面板。
- vendor 重做：`node D:\dsh-CodeSlice\plugin\dev\vendor-better-sidebar.mjs`（默认从已安装 profile 复制 6 个预构建分块并 patch 基址）。
