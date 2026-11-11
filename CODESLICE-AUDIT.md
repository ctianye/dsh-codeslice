# CodeSlice 全量架构审查报告

> **审查对象**：`D:\CodeSplit`（用户个人项目，本地优先的 AI 代码阅读桌面应用）
> **版本**：0.2.2 ｜ **分支**：`feat/code-navigation`（工作区有未提交改动：17 改 + 5 新增）
> **审查日期**：2026-11-11
> **审查方式**：静态通读全部源码 + **实际执行验证**（pytest / tsc / 路由表导出 / 行数统计）
> **红线**：本次为纯审查，**未修改 `D:\CodeSplit` 下任何文件**
> **续接入口**：[`INDEX.md`](INDEX.md) —— 对话压缩后从这里读起

---

## 0. 一页纸结论

CodeSlice 是一个完成度**明显高于个人练手项目**的本地桌面 Agent：分层清晰、注释记录了大量"从真实 bug 反推的原因"、错误处理哲学一致（可选子系统失败不得拖垮主流程）。它的核心差异点不是"又一个 AI 聊天框"，而是**代码知识图谱 + 符号级导航 + 混合检索 + 可追溯锚点**这四件套——这四件恰好是 DSH 目前没有的。

**但把它包成 DSH 插件，不能照搬，必须做减法。** 一半的代码（终端执行、命令审批、文件读写工具、桌面壳）在 DSH 里是**重复建设且有安全副作用**的，必须删掉让位给宿主；另一半（AST 图谱、符号索引、混合检索、笔记知识库）才是真正值得移植的资产。

| 维度 | 评估 |
|---|---|
| 架构清晰度 | ★★★★☆ 分层严格，依赖方向单向（api → services/agent/graph → core/storage） |
| 文档质量 | ★★★★☆ 注释极好；但 `API_CONTRACT.md` 已与代码脱钩（18 个接口未记录、SSE stage 枚举写错） |
| 后端测试 | ★★★★☆ 413 用例 / 1084 断言 / 38 秒全绿，覆盖广 |
| 前端测试 | ★☆☆☆☆ 仅 `tests/graph.test.mjs` 一个文件、5 个纯投影用例（实测 5 pass）；13,149 行 TS/TSX 无组件测试 |
| 安全边界 | ★★☆☆☆ `paths` 做得对；但终端接口绕过审批、黑名单可轻易绕过、规则接口可一键关闭审批 |
| DSH 可移植性 | ★★★☆☆ 约 55% 值得移植，30% 应删除，15% 需重写 |

---

## 1. 项目定位与规模

### 1.1 它是什么

本地优先的"边读代码边问"桌面应用。用户添加代码仓库 → 打开文件 → 选中几行 → 提问。回答带可点击的 `路径:行号` 引用；AI 要写文件或跑命令必须先经用户审批。

### 1.2 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Electron 33 + TypeScript | 只做窗口/原生对话框/拉起后端，渲染层完全走 HTTP |
| 渲染层 | React 18.3 + TypeScript 5.6（strict）+ Vite 5.4 | Monaco 0.52 编辑器 + vis-network 10 图谱 |
| 本机服务 | Python 3.11+ / FastAPI / uvicorn | 只监听 `127.0.0.1`，随机端口 + 会话令牌 |
| Agent | LangGraph 0.6 + LangChain（OpenAI/Anthropic 双协议） | 固定拓扑、节点参数可配、SQLite checkpoint |
| 存储 | SQLite（WAL）+ FTS5 + LangGraph checkpoints | 业务库与 checkpoint 库分离 |
| 解析 | Tree-sitter（10 种语言 grammar） | 数据驱动通用 walker，**无 `.scm` query 文件** |
| 打包 | PyInstaller + electron-builder | Win NSIS / Linux AppImage+deb+rpm |

### 1.3 真实规模（实测）

| 区域 | 文件数 | 行数 |
|---|---:|---:|
| `backend/app`（Python） | 59 | **13,637** |
| `backend/tests`（Python） | 25 | 6,194 |
| `backend/scripts`（诊断脚本） | 20 | 3,257 |
| `frontend/src`（TS/TSX） | 57 | **13,149** |
| `frontend/src`（CSS） | 13 | 7,175 |
| `desktop/electron`（TS） | 2 | 433 |
| `packaging`（构建脚本） | 6 | 1,833 |
| **核心源码合计** | **~180** | **≈ 41,000** |

> 注：不含 `node_modules`（~3 万文件）、`backend/.venv`、`desktop/resources/backend/_internal`（PyInstaller 产物）。

最大的 5 个源文件：`CodePane.tsx` 1331 行、`graph.css` 1189 行、`sidebar.css` 1019 行、`ast/resolve.py` 870 行、`chat.css` 795 行。

---

## 2. 完整架构

### 2.1 三层拓扑

```
┌──────────────────── Windows / Linux 桌面 ────────────────────┐
│  Electron 主进程 (main.ts, 381 行)                            │
│    · 单实例锁 · 窗口 bounds 持久化 · 无边框窗口 IPC           │
│    · spawn 打包后端 → 读 stdout 一行 CODESLICE_READY {port,token}
│    · preload 用 contextBridge 注入 window.codeslice           │
│         ↓  loadURL(http://127.0.0.1:<随机端口>/)              │
│  Renderer: React + Monaco + vis-network（**同源**，无 CORS）   │
└──────────────────────────┬───────────────────────────────────┘
                           │  HTTP + SSE，头 X-Session-Token
┌──────────────────────────▼───────────────────────────────────┐
│  FastAPI (main.py)                                            │
│    · GZip(level=3) 在内层，CORS 在外层（顺序有意为之）         │
│    · 10 个 router 统一挂 /api 前缀                            │
│    · 若存在 frontend/dist 则 mount 为静态站点（生产态）        │
│  ┌────────────┬──────────────┬───────────────────────────┐   │
│  │ api/       │ services/    │ agent/                    │   │
│  │ 路由+校验  │ 路径/沙箱/   │ LangGraph 图 + 工具 + 审批 │   │
│  │            │ 终端/git/笔记│                           │   │
│  ├────────────┼──────────────┼───────────────────────────┤   │
│  │ indexing/  │ retrieval/   │ graph/                    │   │
│  │ 扫描+切片  │ FTS5+向量+RRF│ AST 图谱 + 符号索引 + 聚类│   │
│  └────────────┴──────────────┴───────────────────────────┘   │
│  storage/repo.py（薄 SQL）  core/db.py（唯一 schema）         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 启动握手协议（关键契约）

这是整个系统最重要的一条隐式协议，两处实现必须一致：

```
backend: settings.port=0（环境变量 CODESLICE_PORT）
       → 内核分配空闲端口
       → uvicorn 线程真正 started
       → print("CODESLICE_READY {\"port\":51234,\"token\":\"...\",\"version\":\"0.2.2\"}")
electron: 按 '\n' 切行，只认 CODESLICE_READY 前缀，JSON.parse 后校验
          port 是 number && token 是 string 才 resolve；30 秒超时
```

令牌来源：`CODESLICE_TOKEN` 环境变量优先，否则 `secrets.token_urlsafe(24)` 随机生成，**只存进程内存，不落盘**。

> ⚠️ 同一份契约实现了两遍：`packaging/entry_backend.py:181-232`（PyInstaller 入口）与 `app/main.py:194-234`（`python -m` 路径）。字段略有差异（前者只发 port/token，后者多 version），Electron 只读前两个所以不炸，但这是维护隐患。

### 2.3 数据模型（18 张表 + 1 个 FTS 虚拟表）

| 分组 | 表 | 要点 |
|---|---|---|
| 项目 | `projects` | `path` UNIQUE；`excluded` 存额外忽略 glob |
| 对话 | `conversations`、`messages` | 会话绑定 `mode`（snippet/project）+ 文件行范围 + `selected_code` 快照 |
| 索引 | `indexed_files`、`chunks`、`chunks_fts` | chunks 兼做向量存储（`vector` BLOB + `embed_model` 标签） |
| 锚点 | `code_anchors` | 记录 path/commit/symbol/行范围/snippet/hash/status |
| 笔记 | `notes`、`note_folders` | 自引用 `parent_id` 成树；笔记跨项目共享 |
| 批注 | `code_annotations` | 行范围内联批注，title 与 body 分离 |
| 审批 | `command_rules`、`approvals` | `scope`=once/session/always；`needs_confirm` 否定式 |
| 任务 | `jobs` | 索引进度轮询；启动时把残留 `running` 标为中断 |
| 图谱 | `graphs`、`graph_layouts`、`symbol_defs`、`symbol_refs` | `graphs.project_id=0` 表示全局笔记图谱 |
| 配置 | `settings` | KV，JSON value；`agent.node_config`、`graph_epoch:<id>` 都在这 |

设计亮点：
- `chunks_fts` 存的是 **token 袋**（`tokenize.index_text` 的输出）而非原文，配合 `INDEX_VERSION` 在启动时惰性重建——中英混排检索的关键补丁。
- `graphs` 无外键且允许 `project_id=0`，让"笔记图谱"能与项目图谱共表而不用假的 project 行。
- `bump_graph_epoch` + `_persist_if_current` 解决"构建图谱的几秒内索引变了"这个经典竞态。

### 2.4 三条主数据流

**① 索引流水线**（`indexing/`）

```
os.walk（剪枝忽略目录）
  → _iter_files：按后缀/大小(1.5MB)/skip_file 过滤
  → _read_text：NUL 字节检测 + 严格 UTF-8 解码，坏文件丢弃
  → chunk_file：Tree-sitter 结构切片（函数/类/方法），失败退化 60 行文本块
  → 单事务内：UPSERT indexed_files → 删旧 chunks+fts → 插新 chunks+fts
  → 收集待向量 chunks → 分批 embed（batch=32，失败逐条重试并降级截断）
  → notes_index.sync_project_notes（把笔记也塞进检索管线）
  → 仅当真有文件变化时 drop_graph_cache（关键：空跑不得丢图谱）
```

增量判据：`hash 前缀匹配 chunk-v2:` + `size 相同` + `mtime 差 < 1ms`，三者同时成立才跳过。

**② 图谱构建流水线**（`graph/`）

```
collect_sources（与索引器共用 paths.is_ignored_dir，保证语料一致）
  → Pass 1  extract_file：每文件产出 file/class/function 节点 + rationale 节点
              + **未解析**的 calls/imports/inherits 原始事实
  → Pass 2  resolve：全项目符号表在视野内，解析跨文件引用
              · 唯一名 / 显式类限定 → EXTRACTED
              · 启发式 → INFERRED；歧义 → **直接丢弃**（"宁缺毋错"）
              · import 先解析，因为它定义跨文件调用的候选集
  → detect_communities：NetworkX Louvain（seed 固定），单例社区合并
  → apply_communities：节点打上 community / community_label
  → _persist_if_current：epoch 没变才写 graphs 表
```

**③ Agent 单轮**（`agent/graph.py`，897 行，全后端最核心）

```
START → ensure_graph → prepare → agent ─┬─(全只读调用)→ run_readonly_batch ─┐
                                        ├─(有副作用)──→ run_one ────────────┤
                                        └─(最终回答)──→ finalize → END
```

四个设计决策值得单独记：

1. **`run_one` 每次只执行一个副作用调用**，且在碰文件系统**之前**调 `interrupt()`。因为 `interrupt()` 恢复时会从节点顶部重跑，一次一个才能保证"恢复后副作用恰好执行一次"。
2. **`run_readonly_batch` 一次跑完所有只读调用**。只读无副作用可重放，逐个跑等于每次查图谱都要一次完整模型往返。
3. **`_emitted_interrupts` 集合**记住已发出的审批请求，避免重跑时重复弹窗。
4. **拓扑固定、节点参数可配**：`node_config.NODES` 既是默认值表也是校验 schema，`GET /api/agent/graph` 直接序列化它，边从 `build_graph().get_graph()` 现读而非手写列表——不会出现"面板画的图和真跑的不一致"。

`prepare` 的上下文装配顺序：检索片段（top_k 可配）→ git 分支 → 图谱邻域（问题 seed 或 anchor）→ system prompt 拼接（自定义提示词 → 内置规则 → 工具说明 → 项目/分支 → 片段或项目模式 → 图谱上下文 → 额外要求放最后）。

### 2.5 Agent 工具全集（10 个）

| 工具 | 副作用 | 说明 |
|---|---|---|
| `list_files(path,depth)` | 否 | 深度 0-3，单层 200 条截断 |
| `read_file(path,start,end)` | 否 | 上限 400 行、2MB |
| `search_code(query,top_k)` | 否 | FTS5 + 向量 + RRF 融合 |
| `git_diff(path)` | 否 | 只读 git |
| `graph_query(question,mode,depth,budget)` | 否 | bfs 广域 / dfs 追链 |
| `graph_path(source,target,max_hops)` | 否 | 最短路径 + 逐跳关系 |
| `graph_neighbors(label,relation_filter)` | 否 | 直接邻居 |
| `graph_rationale(label)` | 否 | docstring / `# WHY:` 注释 |
| `write_file(path,content,reason)` | **是** | 审批门控，400KB 上限 |
| `run_command(command,cwd,reason)` | **是** | 审批门控，120s 超时 |

前 8 个进 `READONLY_TOOLS` 白名单，可批量执行。

---

## 3. 子系统逐个详解

### 3.1 `graph/` —— 最有价值也最复杂的部分（13 文件 / 4,503 行）

| 文件 | 行 | 职责 |
|---|---:|---|
| `ast/languages.py` | 317 | 10 种语言的 `LanguageConfig` 表（class/function/call/import 节点类型、字段名） |
| `ast/engine.py` | 506 | **唯一**的通用 AST walker，由配置驱动 |
| `ast/resolve.py` | 870 | 跨文件符号解析，全系统最复杂 |
| `builder.py` | 132 | 两趟流水线的编排 |
| `store.py` | 716 | SQLite 持久化 + 失效规则 + 布局 |
| `query.py` | 554 | 打分/选种子/BFS·DFS 扩展/渲染为文本 |
| `cluster.py` | 190 | Louvain 社区检测 |
| `symbols.py` | 250 | 符号定义/引用索引（F12 用） |
| `relationships.py` | ~150 | 邻居汇总 + 模型流式总结 |
| `notes.py` | 194 | 全局笔记图谱 |

**没有 `.scm` query 文件**——这是数据驱动的通用 walker，所有语言差异收敛在 `LanguageConfig` 里。这个设计很干净。

**失效规则**（`store.py` 头部注释写得极好，值得保留）：
1. `schema_version` 必须等于 `graph.SCHEMA_VERSION`（当前 5）——改规则即退役所有旧图谱
2. `built_hash` 必须等于 `freshness_token`（版本 + schema + 忽略 glob 摘要）——零源码读取
3. 索引器是"语料变了"的唯一权威——真改文件才 `drop_graph_cache`
4. epoch 在构建前采样、写入前复检
5. 显式 `POST /graph/build` 强制重建

热读路径 = **一条 SQL + 一次 json.loads**，`test_graph_cache.py` 用 monkeypatch 直接断言这点。

**代码导航**（新增的 `symbols.py` + `api/navigation.py`，未提交）：
- `symbol_defs` 主键 `(project_id, node_id)`，`symbol_refs` 按 (path,start_line,start_col) 建索引
- F12 解析顺序：光标处 ref → 唯一 target 直接跳 / 多 target 进选择器 / 无 ref 退回按名查找
- `_prefer()` 会折叠包导入产生的重复（`from app import service` 同时命中 `app/__init__.py` 和 `app/service.py`）

**已确认的缺陷**：

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| G1 | **AST 被完整解析两遍** | `store.py:507-508` | `build_graph` 与 `build_symbol_index` 各自跑 `extract_all`+`resolve`；而 `resolve(with_index=True)` 本可一趟出两者 → 构建耗时接近翻倍 |
| G2 | **图谱零增量** | `builder.py` / `store.py` | 改 1 个文件 → 全项目重解析 + 全量 Louvain。大仓库（数千文件）首开体验差 |
| G3 | **JS/TS 继承关系完全缺失** | `languages.py:205-206` `superclass_field=None` | `engine.py:435` 的基类分支永不执行 → `extends`/`implements` 不产生 `inherits` 边 |
| G4 | **`REL_IMPLEMENTS` 全系统从未发射** | `ast/__init__.py:39` 定义，零使用点 | 死常量 |
| G5 | `query.py` / `cluster.py` **零直接单测** | — | 而它们是 Agent 四个图工具的直接依赖；`test_tools.py` 只断言工具名存在 |
| G6 | 文档自相矛盾 | `graph/__init__.py:1-8` 仍称"从 chunks 推导"（早改成直读 AST）；`languages.py:316` 称"其他文件仍生成 file 节点"与 `builder.py:69-70` 相反 | 误导后来者 |

### 3.2 `indexing/` + `retrieval/` —— 检索质量的关键补丁

`chunks_fts` 里存的是 token 袋而不是原文。原因：SQLite `unicode61` 把整段 CJK 当一个 token，`代码阅读` 匹配不到 `本地优先的代码阅读助手`。解法是**双向发射重叠 bigram**：

```
本地优先的代码阅读助手 → 本地 地优 优先 先的 的代 代码 码阅 阅读 读助 助手
查 "入口" → 命中任意相邻的两字
```

融合公式（RRF, k=60）：

```
keyword 侧：0.75 × 覆盖率 + 0.25 × bm25归一   （bm25 越低越好且为负，取 1/(1+max(0,-rank))）
final    ：Σ 1/(60 + rank)  跨两路结果集
```

**`numpy` 是幽灵依赖**：`pyproject.toml:12` 声明了它，`backend/app` 里只有一句 docstring 提到，实际余弦是**纯 Python 双循环**（`hybrid.py:42-54`）。它的 win_amd64 wheel 12.6 MB + 两个 openblas DLL，是 92 MB 包里最无痛可砍的一块。

性能量级：1 万 chunk × 768 维 = 每次查询约 768 万次 Python 乘法，且**全量向量读进内存**。这是全仓库最容易被误判为"已经用 numpy 优化过"的地方。

### 3.3 `agent/` —— LangGraph 编排（6 文件 / 1,780 行）

见 §2.4 ③。补充两点：

- **历史裁剪**：`MAX_HISTORY_MESSAGES=30`，超了直接切尾。
- **轮数上限**：`min(agent.max_tool_rounds, run_one.max_tool_rounds)`，两个节点都暴露该旋钮所以取严格者，避免任一面板值失效。

### 3.4 `services/` —— 边界与便利（10 文件 / 2,257 行）

| 模块 | 行 | 评价 |
|---|---:|---|
| `paths.py` | 219 | **全项目设计最正确的安全代码**：先 `resolve()` 再 `relative_to()`，符号链接/`..`/盘符/UNC 全被归一化后统一比对 |
| `sandbox.py` | 160 | 命令黑名单 + 进程内历史环形缓冲（**刻意不落盘**，因为命令行可能带 token） |
| `terminal.py` | 203 | `Popen(shell=True)` + 双读线程 + `queue` 的真流式；**不是 PTY** |
| `notegen.py` | 781 | 笔记/标题生成，最大单文件；固定五段模板，`关联代码` 由 citations 拼而非模型编 |
| `anchors.py` | 139 | 漂移检测 unchanged/modified/moved/deleted |
| `notes_index.py` | 231 | 把笔记作为 `note://<id>` chunk 塞进检索管线 |
| `ollama.py` | 322 | 本地嵌入运行时探测 + 模型拉取 SSE |

### 3.5 `api/` —— 74 个操作 / 58 条路径（实测导出）

> ⚠️ 注意：下表"操作数"按 **`@router` 装饰器个数**统计（74），与 §4 的 OpenAPI operations 数一致。`app.openapi()` 的 paths 数（58）更少，因为同一路径多个 method 合并计为一条。

| 模块 | 操作数 | 前缀 |
|---|---:|---|
| `notes.py` | 20 | 无前缀（notes / note-folders / annotations / anchors / command-rules） |
| `graph_code.py` | 12 | 无前缀 |
| `projects.py` | 11 | `/projects` |
| `conversations.py` | 10 | 无前缀 |
| `settings.py` | 7 | `/settings` |
| `indexing.py` | 4 | 无前缀 |
| `navigation.py` | 4 | 无前缀（**新增，未提交**） |
| `terminal.py` | 3 | `/projects/{id}/terminal` |
| `graph_api.py` | 2 | `/agent/graph` |
| `system.py` | 1 | 无前缀（`/health`，**唯一免令牌**） |

> ⚠️ **认知纠偏**：`graph_api.py` 不是代码图谱接口，它的 prefix 是 `/agent/graph`，返回的是 **LangGraph 工作流拓扑**。代码图谱全在 `graph_code.py`。

**6 条 SSE 流**：`conversations/{id}/messages`、`/resume`、`projects/{id}/terminal/run`、`projects/{id}/graph/summary/stream`、`graphs/notes/summary/stream`、`settings/ollama/pull`。

### 3.6 前端（约 20,300 行）

**入口链**：`main.tsx` → `StrictMode` → `AppProvider`（AppState）→ `App`。

**状态管理**：单一 React Context（`AppState.tsx` 596 行）全量广播，无 selector、无分片、无外部库。类型定义非常干净——**全文没有一个字面量 `any`**，`strict` + `noUnusedLocals` + `noUnusedParameters` 全开。

**多标签编辑器**：`tabs: EditorTab[]` + `activeTabIndex`，`openFile` / `noteView` 降级为 `activeTab` 的 `useMemo` 派生值——这样二十多处消费者不必知道标签的存在。`EditorTab` 是判别联合：`file` / `note` / `graph(code)` / `graph(notes)`。

**关键机制**：
- **流式聊天**：`useChatStream` 单个 hook 同时驱动"新提问"和"审批恢复"，保证两条路径渲染一致；乐观回显按内容匹配替换
- **引用芯片**：点击 → `reveal(path,start,end)` → 编辑器滚动 + 高亮；重复点同一处会重新触发（靠非零 nonce）
- **Markdown**：零依赖自研渲染器（`Markdown.tsx` 497 行），支持引用芯片、代码复制、图片走 `/asset?token=`
- **图谱**：vis-network 静态布局（无持续物理模拟），社区中心显示标签，支持筛选/搜索/聚焦/子树收起
- **编辑器装饰**：`decorations.ts`（行内卡片与锚点标记）、`frameZones.ts`（视口外渲染裁剪）、`gutterSelection.ts`（行号栏拖选）

**已确认的缺陷**：

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| F1 | **CSS 是插件化头号障碍** | `base.css` 等 | 裸元素选择器（`button`/`input`/`a`/`code`）、`:root` 变量、`body{overflow:hidden}`、`::-webkit-scrollbar` 全局、`@media (prefers-reduced-motion)` 下 `*,*::before,*::after{...!important}` → 直挂宿主必污染 |
| F2 | **7 处 setState updater 内再 setState** | `AppState.tsx` 多处 | `StrictMode` 下双调用，当前靠幂等侥幸存活；`tabs`/`navHistory` 应改 `useReducer` |
| F3 | **`CodePane.tsx` 1331 行** | — | 7 类职责 / 20 `useState` / 14 `useRef`，最大重构点 |
| F4 | **三处 O(n)/帧流式开销** | `Markdown.tsx:40`、`useChatStream.ts:120-127`、`CodePane.tsx:598-601` | 每个 token 一次 setState + Markdown 全量重解析 + 每次渲染 `split('\n')` 整文件 |
| F5 | **`openFileList` 是空操作**（已代码验证） | `App.tsx:105-112` | 只写 `localStorage` + 递增 `sidebarEpoch`（`Sidebar` 因此重挂载），但 `sidebarTab` 存在 `AppState` 的 `usePersistedState` 里、Provider 不重挂载 → 读到的仍是旧值。该按钮在代码层面不产生任何可见效果 |
| F6 | **前后端 stage 枚举漂移**（已验证） | `types.ts:305` vs `agent/graph.py` | 类型定义 `classify\|retrieve\|plan\|execute\|verify\|summarize\|title`，后端实际只发 `graph\|retrieve\|plan\|execute\|title`。`graph` 不在联合类型里，`STAGE_LABELS` 也无此键 → 用户看到英文 "graph"；`classify`/`verify`/`summarize` 永不触发 |
| F7 | 前端测试覆盖极低 | `tests/graph.test.mjs` | 仅 5 个纯投影用例（实测 5 pass / 0 fail），覆盖 `graphFilter`/`graphRelations`；13,149 行 TS/TSX 无任何组件或 hook 测试 |

### 3.7 桌面壳 + 打包

**安全设置**：`contextIsolation:true` / `nodeIntegration:false` / `sandbox:true` / `webSecurity:true`，preload 只暴露 8 个成员。这一层做得规范。

**已确认的缺陷**：

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| D1 | **退出回收有缺口** | `main.ts:211-220, 373-380` | `stopBackend()` 只 `child.kill()` 不杀进程树；`will-quit` 里 `if(!quitting) return` 使崩溃路径留下孤儿后端 |
| D2 | 未拦截 `will-navigate` | `main.ts` | 页面可被导航到任意地址 |
| D3 | **版本号 4 处真相** | `desktop/package.json`、`frontend/package.json`、`core/config.py:16`、`pyproject.toml` + `build_desktop.ps1:463` 兜底常量 | 无一致性校验 |
| D4 | 契约文档已腐化 | `docs/API_CONTRACT.md` | **18/74 个操作未记录**（navigation 4、annotations 3、graph 5、终端/设置若干），SSE stage 枚举写错 |
| D5 | 体积未优化 | — | exe 24.73MB / bundle 92.4MB / 安装器 121.2MB；`fastapi[standard]` 拉进 sentry/otel/typer 链，numpy 纯属浪费 |

### 3.8 安全边界（本次审查最需要提醒的部分）

**做对了**：`paths.resolve_in_project` 是全项目唯一设计正确的安全边界。

**做错了（三项，按严重度）**：

1. **终端接口绕过 Agent 审批**（高）
   `POST /api/projects/{id}/terminal/run` 无审批、无确认，直接 `Popen(shell=True)`。而 Agent 的 `run_command` 要过 LangGraph `interrupt()`。所谓"两者共用一套策略"，实际只有 `sandbox.py:29-39` 那 8 条子串黑名单。渲染进程本来就持有 token —— 绕过审批最省事的办法就是直接调终端接口。

2. **黑名单可轻易绕过**（高）
   纯子串匹配、不解析语法：`rm  -rf /`（多空格）、`rm -fr /`（参数换序）、`format.com C:`、`del /q /f /s C:\`、`rmdir /s /q C:\`、`Stop-Computer`、`python -c "shutil.rmtree('C:/')"`、base64 管道——全部通过。代码注释其实**诚实地写明了**"这不是安全边界"，问题在于 **API 层没有任何东西接住这个坦白**。

3. **规则接口可一键关闭审批**（高）
   `POST /api/projects/{id}/command-rules` 接受 `{"pattern":"*","needs_confirm":false}`，而 `match_rule` 用 `fnmatch(value, pattern+"*")` → 后续所有 `run_command` / `write_file` 自动放行。`scope` 字段无任何枚举校验。

**其他**：`terminal.run_stream` 在 `GeneratorExit` 分支只 `_kill` 不 `proc.wait()`（Windows 句柄泄漏）；`queue.Queue()` 无界（200KB 截断只作用于已 yield 部分，慢客户端 + 大量输出可打满内存）；`embed_texts` 静默把每条输入截到 6000 字符并降级到 3000/1500 前缀，而 `chunks.content` 是全文 → 向量与内容不对应。

---

## 4. 我实际执行了什么（验证证据）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 后端测试 | `backend/.venv/Scripts/python.exe -m pytest -q` | **413 passed in 38.84s**（连跑 3 次稳定） |
| 测试收集 | `pytest --collect-only -q` | 413 tests collected |
| 断言密度 | `Select-String '^\s+assert '` 递归全量 | 1,084 处 / 23 个 `test_*.py`（目录共 25 个 .py，含 `__init__` 与 `conftest`） |
| 前端类型检查 | `npx tsc -b` | **exit 0**，无错误 |
| 前端图谱测试 | `npm run test:graph` | **5 pass / 0 fail** |
| 路由表导出 | `create_app().openapi()` | **74 operations / 58 paths** |
| 契约缺口比对 | OpenAPI vs 三份文档全文 | **18 个操作未记录** |
| 行数统计 | PowerShell 递归计数 | 见 §1.3 |
| numpy 使用 | grep `numpy\|np\.` in `backend/app` | **零匹配**（仅 docstring 提及） |
| `REL_IMPLEMENTS` | grep 全仓库 | 仅 1 处定义，**零使用** |
| Git 状态 | `git status` | 分支 `feat/code-navigation`，17 改 + 5 新增未提交 |

---

## 5. 问题分级清单

### P0（阻断性 / 安全）

| # | 问题 | 影响 |
|---|---|---|
| P0-1 | 终端接口无审批执任意命令 | 审批体系形同虚设 |
| P0-2 | command-rules 可写入 `*` 通配规则关闭审批 | 一键解除所有保护 |
| P0-3 | `API_CONTRACT.md` 的 SSE stage 枚举与代码不一致 | 按契约写前端必挂 |

### P1（正确性）

| # | 问题 | 影响 |
|---|---|---|
| P1-1 | JS/TS 继承边完全缺失（`superclass_field=None`） | TS 项目图谱质量显著下降 |
| P1-2 | AST 被解析两遍 | 构建耗时接近翻倍 |
| P1-3 | 图谱零增量，改一文件全量重建 | 大仓库体验差 |
| P1-4 | `openFileList` 空操作 | 按钮无效 |
| P1-5 | `terminal.run_stream` GeneratorExit 路径句柄泄漏 | Windows 资源泄漏 |
| P1-6 | embedding 静默截断导致向量与内容不对应 | 长文件召回质量系统性下降 |
| P1-7 | 桌面壳退出回收缺口 | 孤儿后端进程 |

### P2（性能 / 可维护性）

| # | 问题 |
|---|---|
| P2-1 | 向量检索纯 Python 双循环 + 全量载入内存 |
| P2-2 | `numpy` 声明但未使用（打包体积浪费 ~13MB） |
| P2-3 | `CodePane.tsx` 1331 行 7 类职责 |
| P2-4 | 三处 O(n)/帧流式开销 |
| P2-5 | 7 处 setState updater 内再 setState |
| P2-6 | `query.py` / `cluster.py` 零直接单测 |
| P2-7 | 版本号 4 处手工同步 |
| P2-8 | 18 个接口未进契约文档 |
| P2-9 | 未拦截 `will-navigate` |

### P3（清理）

`REL_IMPLEMENTS` 死常量、`git_service.head_sha`/`file_at_head`、`ollama.preset_for`、`sandbox.clear_history`、`terminal.has_running` 均为死代码；`graph/__init__.py` 与 `languages.py:316` 的注释已与实现相反。

---

## 6. 值得保留的优点（重构时极易被误删）

1. **注释记录的是"从真实 bug 反推的原因"**，不是复述代码。例如 `indexer.py` 解释为何用 `os.walk` 而非 `rglob`（WinError 1920）、`main.py` 解释 GZip `compresslevel=3` 的实测依据（35ms/134KiB vs 6ms/165KiB）。
2. **"可选子系统失败不得拖垮主流程"的一致哲学**：git、keyring、vector store、graph、notes indexing 全部被 `try/except` 包裹并降级。
3. **`store.py` 的失效规则写成 5 条编号不变式**，每条都可单独验证。
4. **`resolve.py` 的"宁缺毋错"**：歧义边直接丢弃而非猜测——因为用户会把图谱当事实读。
5. **`conftest.py` 的环境隔离**：`CODESLICE_DATA_DIR` + `CODESLICE_TOKEN` + `CODESLICE_KEY_SERVICE` 三件套在 import 前设置，避免测试写坏开发者真实的 Windows 凭据管理器。
6. **前端零 `any`**。
7. **令牌不落盘、终端历史不落盘**——两处都基于"命令行可能含 token"的清醒判断。

---

## 7. 改造成 DSH 插件：可行性分析与路线

### 7.1 先问一个更根本的问题：CodeSlice 的差异化价值是什么？

DSH 已经自带：文件读写（`read`/`write`/`edit`）、字面搜索（`grep`/`glob`）、终端与子进程（`terminals`/`subprocess` 服务）、工具审批（`approval` 服务）、会话与工作区、子代理与团队、Web 搜索。

把 CodeSlice 整体搬过去，会出现**大面积的重复建设**——更糟的是，它自带的那套"审批 + 黑名单 + 规则表"会在一个**本身已有文件沙箱和工具审批**的宿主里，开出一条绕过宿主沙箱的旁路。这是本次审查最重要的结论。

**因此正确的问题是：CodeSlice 有哪些 DSH 没有的东西？**

| 能力 | DSH 有吗 | CodeSlice 的实现质量 | 结论 |
|---|---|---|---|
| AST 代码知识图谱（calls/imports/contains/rationale + 社区） | ❌ | ★★★★☆ | **核心资产，移植** |
| 符号定义/引用索引（F12 / hover / Ctrl+T） | ❌ | ★★★★☆ | **核心资产，移植** |
| 语义+关键词混合检索（含 CJK bigram 补丁） | ❌（`grep` 是字面） | ★★★☆☆ | **核心资产，移植** |
| 阅读笔记知识库（跨项目、可被检索引用） | ❌（有 memory 但语义不同） | ★★★★☆ | **值得移植** |
| 代码锚点漂移检测（读代码时可追溯） | ❌ | ★★★☆☆ | 可以移植 |
| 代码阅读 UI（Monaco + 引用芯片 + 图谱画布） | ❌ | ★★★★☆ | **需重写为 Client 插件** |
| 终端执行 | ✅ `terminals`/`subprocess` | ★★☆☆☆ | **删除** |
| 命令审批 / 规则表 | ✅ `approval` | ★★☆☆☆ | **删除** |
| 文件读写工具 | ✅ `read`/`write`/`edit` | ★★★☆☆ | **删除（保留"审批预览文案"生成）** |
| Electron 桌面壳 | ✅ Web GUI | ★★★★☆ | **删除** |
| 模型接入 / API Key | ✅ credentials + 多 provider | ★★★☆☆ | **删除** |
| 会话与消息持久化 | ✅ Session log | ★★★★☆ | **删除** |

**估算：约 55% 值得移植，30% 应删除，15% 需重写。**

### 7.2 三条路线对比

| 路线 | 做法 | 工作量 | 复用率 | 前端体验 | 风险 |
|---|---|---|---|---|---|
| **A. MCP 包装** | Python 后端加一个 MCP server 入口，用 DSH 的配置型 bundle（`@deepseek-ai/dsh-mcp-client`）接进来 | **2-4 人天** | 后端 100% | 无（纯工具） | 最低 |
| **B. TS 全量重写** | 用 TS 重写 AST 图谱 + 检索 + 索引，配 Client UI 插件 | 30-45 人天 | ~0 | 最好 | 高（Tree-sitter 绑定、图谱算法全重写） |
| **C. 混合（推荐）** | 保留 Python 作为 sidecar 进程，Host 插件用 `ctx.subprocess` 拉起并用 HTTP 通信；工具注册为 DSH Tool；UI 用 Client 插件 | **12-20 人天** | 后端 70% / 前端 70% | 好 | 中（进程管理 + 跨源） |

### 7.3 推荐路线：分三阶段 C

#### P0（先验证价值，2-4 人天）：MCP 包装

**目标**：用最低成本回答"这套图谱/检索在 DSH 里到底有没有用"。

做法：
1. 在 `backend/` 加 `app/mcp_server.py`，用 MCP SDK 暴露 8 个只读工具（`graph_query`、`graph_path`、`graph_neighbors`、`graph_rationale`、`search_code`、`definition`、`references`、`symbols`）。
2. **不暴露** `write_file` / `run_command` / 终端——这三类交给 DSH 自己的工具。
3. 写一个配置型 bundle（只需 `package.json` + `cordis.patch.yml` + `locale/` + `icon.svg`），用 `transport: stdio` 拉起 `python -m app.mcp_server`，`failOnStartupError: true`。
4. 用 `plugin_manager` 的 `action: install_bundle` 安装，然后调一个 `mcp__codeslice__graph_query` 验证。

> ✅ 这一步的关键是**先砍掉审批/终端**。只要它们还在，就是把宿主的沙箱架空。

P0 结束时应能回答：图谱工具在真实对话里被调用的频率、命中质量、是否值得继续投入。

#### P1（后端转 Host 插件，6-10 人天）

- 把 Python 降级为**无 HTTP 的 sidecar**：去掉 FastAPI，只留 `graph/` + `retrieval/` + `indexing/` + 一个 stdin/stdout JSON-RPC 循环。这一步顺带砍掉 `uvicorn`/`fastapi`/`starlette` 依赖链。
- DSH Host 插件（`index.js`）用 `ctx.subprocess.spawn()` 拉起 sidecar，`ctx.effect()` 保证卸载时 `terminate()`。
- 用 `ctx.tools.register()` 注册工具。`ToolDefinition` 需要 `name` / `description` / `parameters` / `output{schema,render}` / `execute` / 可选 `presentCall`/`presentResult` 与 `isConcurrencySafe`。
- **工具命名与去重**：`search_code` 改名 `codeslice_search`（保留语义检索差异），`read_file`/`list_files` 直接删除（用宿主的），图谱四件套保留原名。
- 用 `ctx.systemPrompt.section()` 注入"何时该用图谱工具"的说明，替代原 `TOOL_NOTE`。
- 索引用后台任务（配 `jobs` 语义的进度），首次打开项目时触发。

#### P2（Client UI 插件，6-10 人天）

DSH Client 插件的硬约束（已通过 `Slots.listSubTree` 核实）：
- 必须在 slot 里渲染 React 组件，**不允许** iframe 托管 HTML 页面（iframe 拿不到宿主主题令牌与 locale）
- **不能** `require` 任何 `@deepseek-ai/dsh-client-*` 包
- 样式只用 `--dsw-alias-*` 令牌

可用的 slot：

| Slot | 用途 |
|---|---|
| `main`（keyed，已被 `conversation` 占用） | 代码阅读主面板 —— **需确认能否新增 key** |
| `sidebar.panellist`（list） | 侧栏图标：文件树 / 图谱入口 |
| `sidebar.files.tree`（factory） | 已有宿主文件树，**不要覆盖** |
| `conversation.composer.dock`（list） | 输入框下方："当前选区"提示条 |
| `conversation.chat.node`（keyed） | 自定义引用芯片行（`tool-call` 已有宿主渲染，勿抢） |
| `shell.overlay`（list） | 悬浮层：图谱节点详情 |

**必须重写的部分**：
- CSS 全部作用域化（`F1`）——裸元素选择器、`:root`、`body` 规则、`*` 的 `!important` 动效重置全部要删
- `bridge.ts` → 换成 Client 侧的 `wire.view` / Remote 调用
- 窗口控制（最小化/关闭）——DSH Web GUI 没有这概念，直接删
- `window.confirm` → 宿主 Modal 组件
- `AppState` 拆分（`F2`）：`tabs`/`navHistory` 改 `useReducer`
- `CodePane.tsx` 拆解（`F3`）

**DSH 会话数据的正确接法**：不要自己维护消息列表。用 `ctx.uiConversation.events.register()` 注册事件定义 + 在 `conversation.chat.node` 注册视图；Host 侧用 `ctx.sessionProjections` 声明 `wire.view` 把"本条消息的引用列表"算好送到 Client，而不是 Client 自己折 session events。

**跨源问题（P0 就该验证）**：如果 P0 走 MCP over stdio，就不存在跨源。如果非要保留 HTTP 后端让 Client 直接 `fetch`，会撞上「跨源 + 令牌 + CSP」三连——**建议 P0 第一件事就是验证这条链，如果不通，整个"保留 HTTP 后端"的方案要改成 host 半反代**。

### 7.4 移植时的具体技术决策

| 决策点 | 建议 | 理由 |
|---|---|---|
| 语言 | **保留 Python 做 sidecar** | Tree-sitter 的 TS 绑定不如 Python 生态成熟；`networkx` 的 Louvain 无等价 TS 库；重写 `resolve.py`（870 行，全系统最复杂）风险过高 |
| 进程模型 | `ctx.subprocess.spawn` + JSON-RPC over stdio | 避免端口/令牌/CORS 全部问题 |
| 存储 | 用 DSH 的 `ctx.storageDomain.open(spec)` | 不要自建 SQLite 路径；让宿主管生命周期 |
| 索引触发 | `agent/created` 监听 → 后台建索引；`tools/pre-execute` 里检查新鲜度 | 对应原 `ensure_graph` 节点的语义 |
| 审批 | **全删**，改用 `ctx.approval.request()` | 若确有需要预览，只保留 `preview_for_approval()` 的 diff 生成逻辑 |
| 会话砍掉后 | 笔记的 `conversation_id` 外键需重新设计（改用 DSH 的 `SessionId`） | 这是移植中唯一需要改 schema 的地方 |
| 嵌入模型 | 复用 DSH 的 credentials + provider | 不要保留 `keyring` fallback |
| `numpy` | 直接删，或**真用起来**（向量检索改用 numpy 后预计快 10-50 倍） | 现状是声明了但纯 Python 实现 |

### 7.5 DSH 化的顺带收益

- 干掉 Electron 壳（433 行 + electron-builder 配置 + 121MB 安装器）
- 干掉 FastAPI/uvicorn/starlette 依赖链
- 干掉 4 处版本号同步
- 干掉 `terminal.py` + `sandbox.py` 那 363 行"假安全边界"
- 前端 CSS 从 7,175 行大幅缩减（宿主已有主题系统）

### 7.6 风险提示

| 风险 | 缓解 |
|---|---|
| Python 分发体验回退（用户需装 Python） | 打包成独立 sidecar 二进制（PyInstaller onedir），随插件分发；或首版要求用户自备 |
| Tree-sitter grammar 版本与 Python 3.13 兼容性 | 固定 `requires-python = ">=3.11,<3.13"`（当前已锁 3.11） |
| 图谱首次构建阻塞会话 | 首次构建放后台任务 + 明确的进度指示；`ensure_graph` 的"失败不拖垮本轮"语义要保留 |
| 笔记表与 DSH Session 概念错位 | 早做 schema 决策，不要拖到 P2 |
| P0 验证不通过（图谱工具没被调用 / 质量不够） | 这是**有价值的失败**，能省下 20+ 人天；所以 P0 要独立成阶段且设定明确验收标准 |

---

## 8. 如果只做一件事

**先做 §7.3 的 P0。** 用 2-4 人天做一个 MCP 包装（只暴露 8 个只读工具，砍掉终端与审批），装进当前 DSH profile 跑几次真实对话。这一步能同时验证三件事：图谱工具是否会被模型自然调用、检索质量在真实问题上是否够用、以及"保留 Python vs 重写"的选择是否成立。在这三条有答案之前，任何 P1/P2 的投入都是赌博。

---

## 附录 A：四份子系统详报

| 报告 | 内容 |
|---|---|
| [`audit/graph-index.md`](audit/graph-index.md) | 图谱/索引/检索子系统，391 行（含数据流 ASCII、关系类型全集、打分公式完整还原、接口契约表） |
| [`audit/frontend.md`](audit/frontend.md) | 前端 70 文件逐文件审计，1,097 行（含后端端点调用清单、组件职责表、9 大机制详解、问题优先级 P0×3/P1×6/P2×9/P3×12） |
| [`audit/desktop-packaging.md`](audit/desktop-packaging.md) | 桌面壳/打包/测试/契约，632 行（含握手协议、体积实测、CI 链路、契约完整度六维打分） |
| [`audit/backend-services.md`](audit/backend-services.md) | services/models/api 子系统，502 行（含安全边界深挖、黑名单绕过清单、DSH 映射表） |

## 附录 B：审查的局限

- 未运行应用本身（未启动 Electron、未起 Vite dev server、未做端到端点击测试）
- 未实测大仓库性能（无 1 万文件级项目可测），所有性能结论均标注为**由代码结构推断**
- 未验证真实模型调用的生成质量（本次全部为静态审查 + 单元测试）
- `frontend/src/styles` 的 13 个 CSS 文件中 8 个为抽样阅读，已在 `frontend.md` §1.3 明确标注
- 前端 `F5`（`openFileList` 空操作）为**代码级确认**（追踪了 `sidebarTab` 的实际数据源），但未做浏览器内点击验证
