# CodeSlice 插件重构方案（v3）

> 依据：2026-11-13 与用户确认的四项决策
> 1A 完整搬入 better-sidebar 的编辑器 + 文件树（独立演进）
> 2A 代码图谱做成「对话 / 轨迹」并列的会话视图
> 3C 方框按代码区间去重，点标题回到发起它的会话
> 4A 每个项目根目录自动一份图谱，工作台统一列出、可命名/删除
> 另：工作台设置两套提示词（转笔记 / 知识点问答），检索设置沿用 topK / RRF / 族开关并显示向量索引状态。

---

## 1. 目标信息架构

```
左侧导航 (panellist)
  └ CodeSlice 工作台（main key = codeslice，不含代码）
        笔记库 / 图谱列表 / 笔记图谱 / 设置（提示词 + 检索）

会话视图（main key = conversation，宿主所有）
  对话 | 轨迹 | 代码图谱   ← 通过 conversation.view 列表槽位注册第三项
        代码图谱与对话同属一个 session：节点 ↔ 代码区间双向定位

右侧边栏（better-sidebar 的列，我们注册标签类型）
  codeslice:reader   文件树 + 多标签编辑器 + 行段选中 + 方框标题（含批注）
  codeslice:notes    笔记树 + 阅读器 + 锚点漂移
```

两条联动：
- 图谱节点 → `reader` 打开 `path` 并选中 `startLine..endLine`。
- `reader` 里选中区间 → 写入**当前会话**输入框（`inputActions.insertQuote`）；
  该区间出现方框与标题，标题点击 → 切回本会话的 `对话` 视图并定位到该问题。

## 2. 现状与目标差距

| 项 | 现状 | 目标 |
|---|---|---|
| 社区命名 | 与桌面端基本同规则，但标签分隔符/去重不完全一致 | 与 `D:\CodeSplit\backend\app\graph\cluster.py` 逐字一致 |
| 画布 | 参数大体移植，绘制与桌面端有差异 | 与 `GraphCanvas.tsx` / `graphTheme.ts` 完全一致 |
| 会话视图 | 无（曾尝试注册失败） | `conversation.view` 第三项 |
| 侧边栏代码 | 自研单文件 CodeMirror，无文件树/多标签 | 完整搬入 better-sidebar 的编辑器与文件树 |
| 方框 | 无 | 行区间框 + 19px 标题条，按区间去重 |
| 工作台 | 代码/图谱/笔记/检索四标签 | 笔记库/图谱列表/笔记图谱/设置（无代码） |
| 多图谱 | 仅当前 root 的缓存 | 项目图谱登记表，可命名/删除/查看统计 |

## 3. Host 侧改动（plugin/lib）

新增：
- `lib/projects.js` — 项目图谱登记表 `%TEMP%/dsh-codeslice/projects.json`
  `{ id(sha1(root)), root, name, builtAt, stats{files,lines,nodes,edges,communities}, labels? }`
  接口：`list / rename / forget / remember(document)`；构建成功后自动 remember。
- `lib/frames.js` — 代码方框存储 `%TEMP%/dsh-codeslice/<sha1(root)>.frames.json`
  记录 `{ id, path, startLine, endLine, sessionId, messageId?, title, question, createdAt }`；
  读时与 `readRange` 比对给 `fresh / moved / missing`；同一区间去重（保留最新）。
- `lib/prompts.js` — 两套默认提示词 `%TEMP%/dsh-codeslice/prompts.json`
  `{ note: {custom, default}, ask: {custom, default} }`，支持 read/save/reset；
  `notegen.js` 与 `answer.js` 取 custom ?? default。

修改：
- `index.js`：方法表加 `projects / frames / prompts / tree`；`status` 增 `projects / prompts` 字段；
  修复 `codeslice_references`（`refsTo` 返回对象被当数组 → TypeError）。
- `cluster.js`：标签规则对齐桌面端（`name` / `name +N` / `未分类` / 重名 `· representative`）。
- `notes.js`：锚点记录实际读取区间（修 40 行/1600 字符截断导致的假 `moved 0`）。
- `graphify.js`：可选后端失败回退不改。
- `query.js`：`codeslice_callers` 使用 `depth`（BFS），不再忽略参数。

## 4. Client 侧改动（plugin/client/src）

新增目录：
- `client/src/sidebar/` — 从 `dsh-better-sidebar` 搬入并适配：
  `tree.js`（文件树）、`tabs.js`（多标签）、`editor.js`（CodeMirror 6 + 语言包 + 装饰）、
  `frames.js`（区间框与标题条）、`reader.js`（组合壳）。
- `client/src/graph/` — 从 `D:\CodeSplit\frontend\src\components\graph` 移植：
  `canvas.js`（vis-network 参数逐字一致）、`theme.js`（Tableau-10 + 边分级）、
  `relations.js`（检查器分组）、`filter.js`（族过滤）、`view.js`（画布 + 右轨）。
- `client/src/workbench/` — `pages.js`（笔记库/图谱列表/笔记图谱）、`settings.js`（两套提示词 + 检索）。
- `client/src/session-view.js` — 注册 `conversation.view` 第三项：
  `{ name:'conversation.view', id:'codeslice:graph', order:20, label:()=>t('view.graph'), locale:'codeslice',
     children:{ 'codeslice.graph.view': { kind:'single', scope:'session' } }, inject(sessionId){...} }`

修改：
- `client/src/index.js`：注册 reader / notes 两个侧栏标签；工作台改为工作台页面；删除旧 graph 标签。
- `client/src/code-panel.js` → 被 `sidebar/reader.js` 取代（保留 `code` API 调用）。
- `client/src/graph-panel.js` → 被 `graph/view.js` 取代。
- 删除 `workspace-panel.js` 的代码/图谱段，改为工作台。

## 5. 契约（新增 API）

| method | 入参 | 出参 |
|---|---|---|
| `projects` op=list | `{}` | `{ projects: [{id, root, name, builtAt, stats}] }` |
| `projects` op=rename | `{ id, name }` | `{ project }` |
| `projects` op=delete | `{ id }` | `{ removed: true }` |
| `frames` op=list | `{ sessionId?, path? }` | `{ frames: [...] }` |
| `frames` op=create | `{ path, startLine, endLine, sessionId, title, question, messageId? }` | `{ frame }` |
| `frames` op=delete | `{ id }` | `{ removed: true }` |
| `prompts` op=read | `{}` | `{ note:{custom,default,effective}, ask:{...} }` |
| `prompts` op=save | `{ note?, ask? }` | 同上 |
| `prompts` op=reset | `{ which }` | 同上 |
| `tree` | `{}` | `{ root, entries:[{path,type,size}] }`（供文件树） |

所有写盘沿用 `updateJson` 的原子写；损坏文件挪 `.corrupt-<ts>` 并回 400，不读成空。

## 6. 验收闸门

1. `node --check` 全部 + `node dev/build-client.mjs --check`（bundle 与源码同步）
2. `node dev/host-test.mjs "D:/dsh-CodeSlice"` ≥ 79 全绿，且新增 frames/projects/prompts 断言
3. `node dev/chat-probe.mjs` 241 全绿；`audit-checks` 30 全绿；`robustness` 22 全绿；`rag-split-probe` 13 全绿
4. 新增 `dev/frames-probe.mjs`：区间去重、跨文件、越界夹取、删除、跳转所需的 sessionId 保留
5. 新增 `dev/projects-probe.mjs`：构建后登记、重命名、删除、多 root 隔离
6. jsdom harness：会话视图出现第三个 tab；侧栏文件树+编辑器可打开、选中产生方框；工作台三页可切换
7. 对照 `D:\CodeSplit`：同一仓库构建后，社区数量与标签逐条比对；画布参数逐字 diff

## 7. 风险

- `conversation.view` 是会话级列表槽位，`viewTabs()` 会过滤 `trajectory`（开发者工具开关），
  我们的 view 必须保证 `label()` 有值，否则不渲染。
- 搬入 better-sidebar 编辑器会引入 CodeMirror 语言包体量：按需懒加载，bundle 只保留核心。
- 方框依赖会话 id：宿主只在会话内给 `scope.sessionId`；跨会话跳转需 `openView('chat')` 后定位。
- 旧工具/别名与 WIRE 契约不能破：新增字段只加不改。
