# CodeSlice 插件 v2 工作台 — 任务完成度报告

> 生成时间：2026-11-12 21:55 ｜ 项目：`D:\dsh-CodeSlice` ｜ 分支：`master`
> 本轮目标：按你的六项需求把插件从「图谱查看器」升级为「代码阅读工作台」：
> 对话 / 一键成笔记 / 代码查看与选中 / 图谱与桌面端对齐 / 知识库存储 / 引用走知识库·图谱·RAG 切分。

---

## 一、总览：哪些已完成，哪些没有

| # | 你要求的能力 | 状态 | 说明 |
|---|---|---|---|
| 1 | 对话 | ✅ 已完成（代码层全验证） | 流式 SSE，四段上下文，Host + Client 全通 |
| 2 | 对话一键生成笔记 | ✅ 已完成 | 桌面端模板逐字对齐，探针 213 项含模板逐字断言 |
| 3 | 看见代码 + 选中代码 | ✅ 已完成 | 代码面板 + 行选中 + 与对话/图谱三方联动 |
| 4 | 图谱与桌面端一致（逻辑+展示） | ✅ 代码层完成，⚠️ 缺目视对比 | 交互常量逐字对齐桌面端源码；**未做像素级目视对比** |
| 5 | 知识库存储 | ✅ 已完成 | 会话/笔记/RAG 配置三种持久化，损坏隔离 |
| 6 | 引用调用知识库/图谱/RAG 切分 | ✅ 已完成（切分配置真生效） | citations 只从检索结果来；RAG `chunkLines` 已接入真实切分 |

**一句话结论：六项功能的代码全部落地且通过所有可自动运行的验证（约 400 项断言全绿）；
尚未完成的是两类「只能由人或真实环境完成」的验证：live GUI 目视验收、真实模型端到端。**

---

## 二、已完成并验证的部分（细节）

### 2.1 Host 半（6 个新文件 + 3 处改动）

| 文件 | 内容 | 验证 |
|---|---|---|
| `plugin/lib/chat.js` | 会话存储：自建写链串行化读-改-写整周期；损坏文件挪到 `.corrupt-<ts>` 后抛错（不读成空） | 探针：12 并发 append + 8 create 不丢数据；损坏拒绝+salvage |
| `plugin/lib/rag.js` | RAG 配置默认值、五处数值夹取、`appliedChunkLines`/`pendingRebuild` | 探针：夹取边界 |
| `plugin/lib/answer.js` | `ctx.llm` 流式问答：检索→图谱→知识库→RAG 四段上下文；citations 只从检索结果抽取（模型无法编造行号） | 探针：四段顺序、防编造 |
| `plugin/lib/notegen.js` | 对话→笔记。模板与桌面端 `notegen.py` **程序化 diff 全等**；模型失败时仍存原文 + `summaryFailed:true` | 探针：模板逐字、失败不丢 |
| `plugin/lib/api-chat.js` | 6 个 factory：`chatApiMethods/codeApiMethods/ragApiMethods/noteFromChatApiMethods/askHandler/chatToolDefinitions` | 探针：wire 形状、SSE 帧序 |
| `plugin/dev/chat-probe.mjs` | **213 项断言，10 组**，不依赖 Cordis、不联网、跑完自动清理 | 213/213 |

Host 侧改动（由 Lead 完成）：

- `index.js`：v2 方法表合并、SSE 路由特判、`status` 增加 conversations/rag 字段、v2 工具注册（每个工具按调用方会话解析工作区）。
- `lib/retrieval.js`：**让 RAG 切分配置真正生效**。原实现 `FALLBACK_LINES` 等是常量，设置面板显示的数字根本不影响切分。现改为 `buildChunkIndex(files, nodes, settings)` 按构建传参（两工作区并发重建互不干扰），并新增 `dev/rag-split-probe.mjs`（15 项断言：band 高度改变切分数、行号连续铺满、结构化分块仍优先、夹取边界、默认 60）。
- `buildDocument` 现在读取 RAG 设置并把 `chunkLines`/`chunkSettings` 戳进索引文档，`appliedChunkLines` 报告真实值。

### 2.2 Client 半（9 个新文件 + 4 处改动）

| 文件 | 内容 |
|---|---|
| `client/src/workbench.js` | 分段外壳：对话 / 代码 / 图谱三段；selection 与 target 是共享状态，所以「就这段提问」「点引用跳代码」天然联动 |
| `client/src/chat-panel.js` | 消息列表、流式气泡、引用芯片、每条回答「做成笔记」、整段「整理成笔记」、停止按钮、空状态建议 |
| `client/src/code-panel.js` | `code` API 取行渲染，点行号设起点/终点选中，选中浮出操作条（就这段提问 / 存为笔记 / 复制） |
| `client/src/use-chat.js` | SSE 消费：`fetch + ReadableStream + TextDecoder`，按 `\n\n` 切帧，真 abort（不是 EventSource——它不能 POST） |
| `client/src/graph-align.js` | 桌面端交互常量的单一来源：边样式分级（calls 1.5/0.58 … structural 0.5/0.12，inferred 再减半）、节点半径 7+17·√(deg/max)、标签预算表、视口内按 degree 选标签、变暗层级（悬停 0.72 / 选中 0.42 / 入射边 ≥0.75）、箭头规则 |
| `client/src/i18n-chat.js` / `styles-chat.js` | 文案（mergeDict 双语全键）与样式（registerStyles，`cs-` 前缀，仅 `--dsw-*` 令牌，扫描确认零十六进制色值） |
| `client/src/index.js`（改） | 注册 `codeslice:workbench` 标签（order 35，排最前）；样式注入改用 `fullCss()` |
| `icons.js` / `i18n.js` / `styles.js`（改） | 新增 16 个 glyph、`mergeDict`、`registerStyles`/`fullCss` 碎片机制 |
| `graph-canvas.js`（改） | 接入对齐逻辑；修复子代理遗留的 `visibleNodesRef`/`selectedIdRef` 重复声明（曾是 bundle 编译失败） |

### 2.3 验证矩阵（全部刚重跑过）

| 闸门 | 结果 | 覆盖 |
|---|---|---|
| `node --check`（全部 JS）+ `build-client.mjs --check` | ✅ exit 0 | 22 模块 9,519 行 bundle 可编译且与源同步 |
| `host-test.mjs`（两个根目录） | ✅ 68/68 ×2 | 全部 v1 工具/路由/缓存 |
| `cache-probe.mjs` | ✅ 18/18 ×2 | Map↔JSON 边界 |
| `robustness.mjs` | ✅ 22/22 | 空项目/坏输入/穿越/安全面（写点白名单已按 v2 更新并注明理由） |
| `workflow-probe.mjs` | ✅ 19/19 | 笔记→锚点→文件夹→导出→批注 |
| `audit-checks.mjs` | ✅ 27/27 | 契约/语言闸门/渲染逐字节/安全面 |
| `chat-probe.mjs` | ✅ 213/213 | v2 全部：存储/并发/损坏/RAG/四段顺序/防编造/模板/SSE |
| `rag-split-probe.mjs` | ✅ 15/15 | RAG 切分真实生效 |
| `generated-probe.mjs` / `concurrency-probe.mjs` / `tf-probe.mjs` | ✅ 6/6 / 不丢+隔离 / 词频真实 | |
| `dev/harness/run.mjs`（窄+宽） | ✅ exit 0 | jsdom 挂真实 bundle：4 个 tab、图谱 240 节点、点击/过滤/切换/挂起恢复 |
| `dev/harness/audit-fixes.mjs` | ✅ 9/9 | 审核修复回归（含悬停 0.72 < 选中 0.42） |

---

## 三、未完成的部分（按优先级）

### P0 — live GUI 目视验收（唯一挡在「用户可见」前面的）

**现状**：路由是通的（上一代验证到 HTTP 200），但**新工作台标签页从未在真实窗口里打开看过**。
ksqlHTTP 探测返回 403 是因为非浏览器请求没有准入 cookie，`dev/mint-cookie.mjs` 可铸币，但目视只能由人或 DevTools MCP 完成。

**要做**（约 10 分钟）：
1. 重启 DSH（Host 半改了 `index.js`/`lib/*`，Node 侧不热更）。
2. 打开右侧栏 → 「阅读工作台」标签：确认三段切换、对话空状态、建议问题。
3. 发一条真实提问 → 看流式增量、引用芯片、停止按钮。
4. 「做成笔记」→ 切到笔记标签确认入库。
5. 代码段：选两行 → 「就这段提问」→ 确认对话带着片段上下文。
6. 图谱段：对照桌面端 `D:\CodeSplit` 跑起来的图谱，看布局/配色/悬停/选中变暗是否一致。
7. 浅色 + 深色主题各看一遍；把侧栏拖窄（<520px）看窄布局。

### P0 — 真实模型端到端（探针用的是假 llm）

**现状**：`chat-probe` 的流式断言用 async generator 模拟 `ctx.llm.stream`；**真实 DeepSeek 路由上没有跑过一次**。
`resolveLlm`/`agentDefaultModel.currentSelection()` 的接线是从 dsh-mnemon 的生产用法核对的，但「真调真回真落库」只差这一步。

**要做**：重启后在 GUI 里发一条真实提问即覆盖（与 P0-第 3 步同一次操作）。
若失败，最可能的落点是 `GenerateOptions` 的消息形状——届时把 `answer.js` 里 `messages` 的构造与 dsh-llm 的类型声明再对一遍即可，改动面只有一个函数。

### P1 — 子代理失败留下的收尾

两个后台子代理（client-workbench、graph-align）在收尾报告前断连，但**交付文件都在磁盘上且已通过全部闸门**。它们没做完的只剩：

1. **图谱与桌面端的目视对比**（并入 P0-第 6 步）。代码层常量已逐字对齐（边样式/半径/标签预算/变暗值都来自 `GraphCanvas.tsx` 与 `graphTheme.ts` 的原值），但「一致」最终要看图。
2. **`graph-tables.js` 的 label 表与桌面端 `graphMeta.ts` 的逐项核对**子代理没报完成状态。已抽查 `RELATION_LABEL`/`KIND_LABEL` 键集完整，未做逐项 diff。
3. `chat-panel.js` 里 `rag` 请求参数目前**没有**从面板传（用 Host 存的默认配置，这是合理默认）；若你要「每次提问时调 topK/深度」的 UI，是一个小增量（use-chat 的 send 已预留 `options`）。

### P2 — 可选增强（不影响验收）

| 项 | 说明 |
|---|---|
| RAG 设置 UI | Host 的 `rag` 读写 API 已通，面板还没有设置入口（当前改配置只能 curl）。一个简单的数字输入面板约 80 行 |
| `codeslice_rag_config` 工具 | 契约 §16 列了，`api-chat.js` 未实现（改 rag 不触发重建，模型侧价值低） |
| 增量索引 | INDEX.md §11.5 的老建议：现在改一个文件全量重建 |
| 会话标题自动生成 | 桌面端有 `SESSION_TITLE_PROMPT`，本版用首问截断（`titleFromQuestion`），已可用但不如模型起名 |

### P3 — 诚实声明的验证局限

- `superclassJs`/chunker 边界仍未与 tree-sitter 构建 diff（历史遗留，本轮未涉及）。
- 并发探针覆盖 chat 存储，但**两个工作区同时重建图谱 + 同时问答**的组合场景未压测（代码层已按参数传参规避了相互干扰，rag-split-probe 第 4 组验证了夹取）。
- 审核子智能体（你最初要求的独立审核）**尚未执行**——建议在 P0 目视验收通过后进行，让它看的是最终形态。

---

## 四、怎么继续（给下一次会话）

```bash
# 1. 重启 DSH（Host 半必须；Node 不热更）
# 2. 硬刷新 GUI（Ctrl+Shift+R），右侧栏应出现「阅读工作台」标签
# 3. 验收顺序 = 本文档 P0 清单的 7 步
# 4. 全绿后跑独立审核子智能体（可让它先读 DESIGN.md 与本文件）

# 任何代码改动后的常规验证：
cd D:\dsh-CodeSlice\plugin
node --check index.js && node dev\build-client.mjs --check   # 两半语法+同步
node dev\chat-probe.mjs                                      # v2: 213 断言
node dev\rag-split-probe.mjs                                 # v2: RAG 切分 15 断言
node dev\host-test.mjs "D:/dsh-CodeSlice"                    # v1: 68 断言
node dev\robustness.mjs && node dev\audit-checks.mjs          # 22 + 27
cd dev\harness && node run.mjs "D:/dsh-CodeSlice" --wide     # client: jsdom 全链路
```

**关键契约文件**：`plugin/WIRE-CHAT.md`（v2 全部 6 个新方法 + SSE 帧序 + 四段上下文顺序）。
**状态目录**：`%TEMP%\dsh-codeslice\`——`*.notes.json` 是用户数据别删；`*.chat.json` / `*.rag.json` 同理。

---

## 五、本轮增量（2026-11-12 晚，接手后修复）

对照桌面版 `App.tsx` / `ChatPane.tsx` 复核时发现并修掉三处真实断点：

| # | 问题 | 修复 | 验证 |
|---|---|---|---|
| 1 | **选中代码从未发给模型**：`useChat.send` 只发 `text`，Host 的 `ask` 虽支持 `mode/path/selectedCode`，但客户端不传；对话记录里也没有 snippet | 请求补 `mode/path/startLine/endLine/selectedCode/title`；Host 支持**逐轮选区**（已有会话里换一段追问也不用重开） | `chat-probe` 新增 10 项；`workbench.mjs` 断言请求体与模型 transcript |
| 2 | **图谱提问是空实现**：`NodeInspector` 的 `onAsk` 恒为 `() => {}`，也没有按钮 | 检查器新增「就此提问」；节点交给 Workbench 的同一个对话，填草稿并带 `graphAnchor`；独立图谱标签没有对话时不显示该按钮 | `workbench.mjs` 断言切段、草稿、请求体 `graphAnchor` |
| 3 | **切段会卸载对话**：切到代码/图谱时 `ChatPanel` 被卸载，草稿丢失、正在流式的回答被 abort；恢复时重读又会中止流 | 三段全部挂载、只切可见性；对话恢复不再重读；「就这段提问」不再改动代码目标（否则会清掉选区） | `workbench.mjs` 断言只有一个 `.cs-chat`、草稿跨段保留 |

附带修复：单行目标（引用芯片、图谱「打开代码」）此前会被当成"只显示 1 行窗口"，
与 `WIRE-CHAT.md §12` 的"省略 `endLine` 表示到窗口末尾"相悖；现在显示该行到文件末尾。

**本轮闸门**：build `--check` 通过；`chat-probe` 223/223；`host-test` 68/68 ×2；
`audit-checks` 27/27；`robustness` 22/22；`workflow-probe` 19/19；`cache-probe` 18/18；
`rag-split-probe` 15/15；`run.mjs` 窄/宽；`audit-fixes` 9/9；新增 `workbench.mjs` 25/25。

**仍未做**：真实 DSH 窗口里的目视验收与真实模型端到端（需要重启 DSH，Host 半不热更）。

---

## 六、2026-11-12 深夜：工作台并入主对话（架构调整）

按最新要求，把"插件自己的聊天框"删掉，改为复用 DSH 正常对话：

| 能力 | 实现 |
|---|---|
| 左侧入口 | `sidebar.panellist` + layout `main` 键 `codeslice`；打开 CodeSlice 工作台（文件列表 / 代码 / 图谱 / 笔记 / 检索设置） |
| 正常对话集成 | `conversation.input.dock` 注册引用条：显示当前 `path:start-end`，提供「生成笔记」 |
| 就这段提问 | 代码选中 → `requestQuote` → 切回对话 → `inputActions.insertQuote` 把代码引用 + 问题写进宿主输入框（不再有第二个对话） |
| 图谱提问 | 检查器「就此提问」→ `requestPrompt` → 同一个宿主输入框 |
| 对话成笔记 | 新 Host 方法 `noteFromSession`：用 `ctx.sessionQuery.readSurface(sessionId)` 读会话日志，按桌面端模板落库 |
| 图谱复用 graphify | 新 `lib/graphify.js`：`extract --code-only --no-cluster` + `cluster-only --no-label --no-viz`，适配成现有 node/edge 词汇；失败回退内置分析器。配置 `graphBackend: builtin|auto|graphify` |
| RAG / Ollama | 新 `lib/models.js` + `models` API：bge-m3 / qwen3-embedding 预设、`/api/tags` 检测、`/api/embeddings` 测试、自定义系统提示词；只允许回环地址 |
| 清理 | 删除 `chat-panel.js` / `use-chat.js` / `workbench.js` / `selection-chip.js`（不再注册的独立聊天） |

**已验证**：真机里「代码选中 → 就这段提问」会把引用 + 问题写进正常对话输入框；左侧工作台文件列表/代码查看正常。
`chat-probe` 245、`graphify-probe` 8、`audit-checks` 30、`robustness` 22、`host-test` 68×2、harness 窄/宽与 audit-fixes 全绿。
`graphify` 在本仓库产出 1190 节点 / 2738 边 / 56 社区（二次构建约 6.6s）。

**需要重启 DSH 才能生效**：`files` 已被热加载，但 `models` / `noteFromSession` / graphify 图源尚未进入当前进程。
重启后依次验证：左侧 CodeSlice → 检索设置（Ollama 检测/系统提示词）→ 图谱（graphify）→ 正常对话「生成笔记」。

**本轮未做**：`conversation.view` 标签注册在已安装 shell 里不生效，改用左侧主面板；
图谱与桌面端的像素级目视对比；图谱/关键词索引仍是全量重建（向量索引已增量）。

---

## 七、2026-11-12：索引与 RAG 接入（照桌面端）

按最新要求，参考 `D:\CodeSplit` 的 `indexing/`、`models/embeddings.py`、`retrieval/hybrid.py`
补上真正的向量索引，并**取消用户对 RAG 切分的自定义**。

| 能力 | 实现 |
|---|---|
| 固定切分 | `lib/retrieval.js`：结构块（函数/类）优先，其余按 `FALLBACK_LINES=60` 行带；`MAX_CHUNK_LINES=220`、`MAX_CHUNK_CHARS=8000` 为常量。`buildChunkIndex(files, nodes)` 不再接受切分参数 |
| RAG 设置 | `lib/rag.js` 只保留 `topK`/`rrfK`/`families`/`includeNotes`/`includeGraph`；旧的 `chunkLines` 等字段在归一化时丢弃 |
| 批量向量 | `lib/models.js`：`/v1/embeddings` 批量（32 条/批），整批失败逐条重试，超长按 6000/3000/1500 字符降级；只允许回环地址 |
| 向量持久化 | 新 `lib/vectors.js`：`<rootKey>.vectors.json` manifest + `<rootKey>.vectors-<nonce>.bin` Float32；按内容 hash 去重、按模型隔离，截断的 bin 视为无向量 |
| 后台建索引 | `rag {op:"index"}` 立即返回，后台增量生成；`rag {op:"status"}` 轮询 `{state, chunks, vectors, missing, model, dims, total, done, failed, error}`；`force` 忽略旧向量 |
| 混合检索 | `lib/answer.js`：关键词 + 向量 + 图谱种子三路 `rrfFuse`；无索引/Ollama 不在/模型变更时向量列表为空，自动退回关键词+图谱 |
| 设置界面 | 检索设置新增「向量索引（固定切分）」：状态、进度、构建/强制重建；删除切分高度/单块上限输入 |

**验证**：新增 `dev/rag-index-probe.mjs` 28 项（含真实 loopback HTTP 假 provider），
`rag-split-probe` 改为固定切分 13 项；`chat-probe` 241、`audit-checks` 30、`robustness` 22、
`cache-probe` 18、`workflow-probe` 19、`host-test` 68×2、harness 窄/宽全绿。

**仍需要注意**：向量索引需要本机 Ollama 与已下载模型；首次构建在后台进行，构建完成前提问走关键词检索。


---

## 八、2026-11-13：代码窗并入 CodeMirror、图谱换回 vis-network

用户指认右侧文件窗口并不是 DSH 自带，而是已安装的 `dsh-better-sidebar`（CodeMirror 编辑器 +
文件树）。按拍板结果：**把原版编辑器实现并入插件**，删除旧的自绘行列表；**图谱直接复用
graphify 的 vis-network**；工作区图谱**全量**，超过上限按社区聚合。

| 能力 | 实现 |
|---|---|
| 代码窗 | 新 `client/editor-src/entry.js` → esbuild 产物 `client/editor.js`（CodeMirror 6，只读）；语法高亮、行号、文本拖选、点行号选起点/终点、符号/批注/笔记/选区行装饰、定位闪烁。旧 `.cs-code-line` 渲染删除 |
| 懒加载 | 新 Host 路由 `GET /codeslice/assets/<name>`，只服务白名单 `vis-network.min.js` / `editor.js`；同一 `connection.requestRejection` 准入，路径不拼接请求 |
| 图谱渲染 | `client/vendor/vis-network.min.js` = graphify 固定的 **9.1.6**；`graph-canvas.js` 按 graphify 的 forceAtlas2Based 参数（−60/0.005/120/0.08/0.4/0.8、200 次稳定化）重写，物理稳定后关闭并缓存坐标 |
| 全量图谱 | Host `maxGraphNodes` 240/600 → **5000**；`graphSlice` workspace 返回全图；超过上限返回社区 meta 节点（`kind:"community"`、`memberCount`、`aggregated:true`）与 `community` 跨社区边 |
| 社区命名 | `refineCommunities` 复用桌面规则：孤立/单例归入「未分类」，按 `(-size, min id)` 排序，成员最多文件名 + `+N`，重名用代表符号消歧。graphify 的成员关系保留 |
| 聚合节点检查器 | `node {id:"community:N"}` 返回社区摘要，不再报 `node not found` |
| 许可 | `client/vendor/vis-network.LICENSE-*` + `CODEMIRROR-NOTICE.txt`；产物随包发布 |

**验证**：
- `host-test` 79/79（含全量 881/881、社区命名、20 上限聚合、聚合节点详情、资产路由与穿越拒绝）
- `chat-probe` 241/241（graphify 社区标签改为桌面规则）、`graphify-probe` 9/9
- `audit-checks` 30/30、`robustness` 22/22、`cache-probe` 18、`workflow-probe` 19
- `harness/run.mjs` 窄/宽：图谱 881 节点 / 2261 边；代码 tab 渲染编辑器、双击行号产生选择
- `harness/audit-fixes.mjs` 7/7；`build-client --check` / `build-editor --check` 均 current
- vis-network 独立页面截图确认布局/配色/边样式与 graphify 一致（`.scratch/vis-test`，未入库）

**需要重启 DSH 后目视验收**：
1. 左侧 CodeSlice → 代码：语法高亮、行号点击、批注/笔记行底色、定位闪烁；
2. 图谱：881 节点的力导向布局、社区颜色/名称、筛选、双击打开；
3. 浅色主题下的标签颜色与图谱边对比度；
4. 5000 节点以上的聚合提示与性能。

**已知取舍**：编辑器为只读，保存/dirty/git gutter 仍归 `better-sidebar`；vis-network 的
Tableau-10 色值是画布要求（canvas 不解析 CSS 变量），所以图谱节点不再走 host 令牌。
