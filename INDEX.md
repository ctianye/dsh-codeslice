# CODESLICE → DSH 插件化：项目上下文索引（压缩对话后可从此接续）

> **这份文件是续接入口。** 对话被压缩后，先读这份，再按需跳转到 §4 列出的详细文档。
> 生成日期：2026-11-11 ｜ 最后一次实测校验：同一天

---

## 1. 一句话现状

已对一个本地项目 `D:\CodeSplit`（产品名 **CodeSlice** 0.2.2）完成**全量架构审查**，并产出了**改造成 DSH 插件的前端布局方案**。审查是纯只读的，`D:\CodeSplit` 下未做任何修改。

---

## 2. 关键事实速查

| 项 | 值 |
|---|---|
| 项目路径 | `D:\CodeSplit`（注意：**目录名是 CodeSplit，产品名是 CodeSlice**） |
| 产品版本 | `0.2.2`（`desktop/package.json` / `frontend/package.json` / `core/config.py:16` / `pyproject.toml` 四处） |
| Git 分支 | `feat/code-navigation`，工作区 **17 改 + 5 新增**未提交 |
| 技术栈 | Electron 33 + React 18.3 + TS 5.6(strict) + Vite 5.4 + Monaco 0.52 + vis-network 10 ／ Python 3.11 + FastAPI + LangGraph 0.6 + Tree-sitter |
| 代码量 | 后端 `app` 59 文件 **13,637 行**；前端 TS/TSX 57 文件 **13,149 行** + CSS 13 文件 **7,175 行**；测试 25 文件 6,194 行；合计核心约 **4.1 万行** |
| 测试状态 | 后端 **413 passed / 38 秒**（实测 3 次稳定）；前端 `tsc -b` **exit 0**；前端测试仅 5 用例 |
| 接口规模 | OpenAPI 实测 **74 operations / 58 paths**，其中 6 条 SSE |
| DSH profile | `desktop` → `C:\Users\cheng\.dsh\profiles\desktop` |
| 工作目录（可写） | `D:\dsh-CodeSlice` |

---

## 3. 核心结论（浓缩版）

### 3.1 这个项目怎么样

完成度**明显高于个人练手项目**：分层严格、注释记录的是「从真实 bug 反推的原因」、可选子系统失败不拖垮主流程的哲学一致、后端测试覆盖广。

真正的差异化资产（DSH 目前没有的四件套）：
1. **AST 代码知识图谱**（calls / imports / contains / inherits / rationale + Louvain 社区）
2. **符号定义/引用索引**（F12 / hover / Ctrl+T）
3. **语义+关键词混合检索**（FTS5 + 向量 + RRF，含 CJK bigram 补丁）
4. **阅读笔记知识库**（跨项目、可被检索引用）
   (+ 附加：代码锚点漂移检测)

### 3.2 硬问题清单（按严重度）

**P0 安全**
- 终端接口 `POST /terminal/run` **无审批直接 `Popen(shell=True)`**，而 Agent 的 `run_command` 要过 LangGraph interrupt → 审批体系形同虚设
- `POST /command-rules` 接受 `{"pattern":"*","needs_confirm":false}` → 一键关闭全部审批
- 黑名单只有 8 条子串匹配，`rm  -rf /`（多空格）、`rm -fr /`、`Stop-Computer`、base64 管道全部通过

**P1 正确性**
- **JS/TS 继承边完全缺失**：`languages.py:205-206` 设 `superclass_field=None`，让 `engine.py:435` 的基类分支永不执行；`REL_IMPLEMENTS` 全系统零使用
- **AST 被完整解析两遍**：`store.py:507-508`，而 `resolve(with_index=True)` 本可一趟出两者
- **图谱零增量**：改 1 文件 → 全项目重解析 + 全量 Louvain
- **`App.tsx:105` 的 `openFileList` 是空操作**（已代码级验证：只写 localStorage + 递增 `sidebarEpoch`，但 `sidebarTab` 存在不重挂的 Provider 里）
- **SSE stage 枚举漂移**：`types.ts:305` 声明 `classify|retrieve|plan|execute|verify|summarize|title`，后端实际只发 `graph|retrieve|plan|execute|title`
- `API_CONTRACT.md` 已腐化：**74 个操作中 18 个未记录**

**其他值得记的**
- `numpy` 在 `pyproject.toml` 里声明，`backend/app` **零匹配**（实际是纯 Python 双循环做余弦）→ 打包体积白占 ~13MB
- 向量检索每次查询**全量载入内存** + 逐维 Python 循环
- 前端 CSS 是插件化头号障碍（裸元素选择器 / `:root` / `body{overflow:hidden}` / `*` 上的 `!important`）

### 3.3 DSH 化的核心判断（**这一条最反直觉，但最重要**）

> **不能照搬，必须做减法。**

DSH 已自带：文件读写、grep/glob、终端与子进程（`terminals`/`subprocess`）、工具审批（`approval`）、会话持久化。

CodeSlice 那套「终端 + 黑名单 + 规则表 + 审批」搬进去，等于**在本身有沙箱的宿主里开一条绕过沙箱的旁路**——应**删除**而非移植。

估算：**约 55% 值得移植 / 30% 应删除 / 15% 需重写**。

---

## 4. 文档清单

| 文件 | 行数 | 内容 |
|---|---:|---|
| `CODESLICE-AUDIT.md` | 445 | **主报告**：架构、子系统、问题分级、DSH 路线 |
| `CODESLICE-DSH-LAYOUT.md` | 317 | **布局方案**：右侧栏多标签、共存取舍、分阶段实施 |
| `audit/graph-index.md` | 391 | 图谱/索引/检索子系统详报 |
| `audit/frontend.md` | 1,097 | 前端 70 文件逐文件审计 |
| `audit/desktop-packaging.md` | 632 | 桌面壳/打包/测试/接口契约 |
| `audit/backend-services.md` | 502 | services/api/安全边界深挖 |

---

## 5. 布局方案要点（细节见 `CODESLICE-DSH-LAYOUT.md`）

### 5.1 决定性发现：不用重写编辑器

当前 profile 已装 **`dsh-better-sidebar` v0.28.2**，它在 `lib/client.js` 里执行 `ctx.provide("betterSidebar", service)`，明确向第三方插件开放两个注册点：

```js
ctx.betterSidebar.registerTab(descriptor)          // 侧栏标签页
ctx.betterSidebar.registerFileViewer(descriptor)   // 文件查看器
```

**它自己的 6 个内置标签 + 4 个内置查看器用的就是同一个 API。**

→ 编辑器、文件树、tab 管理、分屏拖拽、快捷键**全部复用**。这也修正了「前端 70% 可复用」的直觉：复用度确实约 70%，但**要写的代码远少于原估**，因为最重的那部分（Monaco 宿主、1331 行的 `CodePane`）根本不用搬。

### 5.2 推荐布局

```
┌─────────┬──────────────────────────┬────────────────────────┐
│ sidebar │  main (对话)              │  rightbar              │
│         │                          │  ┌editor│graph│notes┐ │
│ ○ 插件  │  用户: 这个函数为什么…    │  │  CodeSlice 图谱      │ │
│ ○ Skill │  助手: 因为… [a.ts:42]   │  │  ○──○──○            │ │
│ ○ 计划  │         ↑ 引用芯片        │  │  [搜索][筛选][社区]  │ │
│ ○ Ctx   │  ┌────────────────────┐  │  └─────────────────────┘
│ ○ Mnemon│  │ ▸ 选区: a.ts:42-58 │  │  ← composer.dock 提示条
│         │  └────────────────────┘  │
└─────────┴──────────────────────────┴────────────────────────┘
```

**为什么是右侧栏不是主面板**：`main` 槽空间更大（`dsh-context` 占了一个 key），但它与对话面板**互斥**——看代码时看不见对话，恰好违背 CodeSlice「边读边问」的前提。右侧栏天然同屏。

### 5.3 四个注册点

| id | 槽位 | 说明 |
|---|---|---|
| `codeslice:reader` | `registerTab` | 批注层 + 大纲，`dedupeKey: tab => tab.path` |
| `codeslice:graph` | `registerTab` | 图谱画布，`single: true` |
| `codeslice:notes` | `registerTab` | 笔记知识库，`single: true`（**最省力、收益最高**） |
| `codeslice:annotated` | `registerFileViewer` | `exts: []`, `priority: -200`, `fetchStrategy: 'fsRead'` |
| `codeslice:selection` | `conversation.composer.dock` | 选区提示条（纯增量，**P0 首选**） |

### 5.4 主题只有 14 个令牌（实测 `Theme.listTokens`）

`--dsw-alias-bg-base` / `-bg-layer-1` / `-bg-layer-2` / `-bg-overlay` / `-border-l1` / `-border-l2` / `-brand-primary` / `-label-primary` / `-label-secondary` / `-state-error-primary` / `-state-idle-primary` / `-state-success-primary` / `-state-warn-primary` / `--dsw-specific-sidebar-fill`

**没有 size/spacing/radius/font 令牌**——这些用固定值。图谱节点着色靠状态令牌叠透明度。

### 5.5 关键实现坑

- 右侧栏标签切走后是 `display:none` 但**仍然挂载** → 图谱画布/轮询必须靠 `visible` 属性暂停
- 不能 `require` 任何 `@deepseek-ai/dsh-client-*` 包（会随版本变化，且抛错会清空槽位）
- `main` 注册的 key 必须等于 `sidebar.panellist` 的 id（若要独立主面板的话）
- `label` / `title` 传**函数**才能跟随 locale 切换

---

## 6. 分阶段路线

### P0：验证布局可行性（1-2 天）← **下一步就是这里**
1. 建 `@local/dsh-codeslice` 包（`dsh.bundle.patch` + `dsh.client`）
2. `conversation.composer.dock` 注册选区提示条（纯增量槽，零风险）
3. `sidebar.right.pane.tab` 注册空壳 `codeslice:graph` 标签

**验收**：右侧栏能看到空面板 → 亮/暗主题切换不穿帮。
**若不通**（比如拿不到 `betterSidebar` 服务）→ 整个方案退回「独立主面板 + `sidebar.panellist`」，**所以必须最先做**。

### P1：只读工具 + 最小 UI（5-8 天）
- Python sidecar 以 **MCP over stdio** 接入（`@deepseek-ai/dsh-mcp-client`, `transport: stdio`）
- 暴露 8 个只读工具：`graph_query` / `graph_path` / `graph_neighbors` / `graph_rationale` / `search_code` / `definition` / `references` / `symbols`
- **不暴露** `write_file` / `run_command` / 终端

### P2：编辑器与批注融合（8-12 天）
`codeslice:annotated` 查看器 + CodeMirror 装饰 + 锚点漂移 + `codeslice:notes`

### P3：打磨
图谱改用 d3-force/cytoscape（profile 已有）／笔记与 DSH memory 打通／`urlTarget` 接管 GitHub 链接

---

## 7. 共存的三层含义（易混淆，特此区分）

| 形态 | 含义 | 可行性 |
|---|---|---|
| 共存 1：代码复用 | 源码搬进插件，两套 UI 各自独立 | ✅ 推荐 |
| 共存 2：进程共存 | 同一 Python 后端既服务桌面版也服务 DSH | ✅ 可行（见下） |
| 共存 3：UI 同屏 | 同一 DSH 窗口里并排显示 | ✅ 就是右侧栏方案 |

**共存 2 做法**：`app/main.py`（FastAPI，桌面版）+ `app/mcp_server.py`（stdio MCP，DSH），共享 `graph/`、`retrieval/`、`indexing/`。
**坑**：SQLite 单写者，两进程同时建索引会撞锁 → 建议**不共享数据库**，只共享代码。

---

## 8. 环境与工具坑（重开会话要注意）

| 坑 | 说明 |
|---|---|
| **pwsh 曾在会话早期失败** | 报 `SetNamedSecurityInfoW failed (Win32 5): grantWrite(D:\dsh-CodeSlice)`。**后来把权限策略切到 danger-full-access 后恢复正常**。若再遇到，用 `read`/`grep`/`glob` 或先申请权限 |
| `D:\CodeSplit\acl-recovery\` | 上述 ACL 失败的历史修复痕迹（JSONL 里记录了 `"operation":"repair","path":"D:\\CodeSplit"`） |
| glob 结果截断 | 默认只返回 100 条，用更精确的 pattern 缩小范围 |
| PowerShell 无 `-Recurse` | `Select-String` / `Get-Content` 不支持 `-Recurse`，用 `Get-ChildItem -Recurse -Include` 管道 |
| 中文编码 | 部分子报告用 `Get-Content -Raw` 读会乱码，用 `read` 工具读正常 |

**运行测试**：
```
cd D:\CodeSplit\backend
.venv\Scripts\python.exe -m pytest -q
```
（注意：`--timeout` 参数未安装，会报 unrecognized arguments）

**前端类型检查**：
```
cd D:\CodeSplit\frontend
npx tsc -b          # exit 0
npm run test:graph  # 5 pass
```

---

## 9. 待决策 / 待确认

| # | 问题 | 影响 |
|---|---|---|
| 1 | **P0 能否拿到 `betterSidebar` 服务** | 决定走右侧栏还是独立主面板（**最关键**） |
| 2 | 桌面版 CodeSlice 继续独立存在，还是废弃 | 决定「共存 2」要不要做 |
| 3 | 编辑器用 Monaco 还是换 CodeMirror | 换则 `decorations.ts`/`frameZones.ts`/`gutterSelection.ts` 需重写 |
| 4 | 笔记表的 `conversation_id` 外键如何映射到 DSH `SessionId` | 移植中唯一需改 schema 的地方 |
| 5 | Python sidecar 分发方式（用户装 Python vs 打包二进制） | 影响首次使用体验 |

---

## 10. 审查的方法与局限（诚实交代）

**实际执行过**：pytest 全量（413）／`tsc -b`／`npm run test:graph`／OpenAPI 路由导出／契约文档缺口比对／行数统计／`numpy` 与 `REL_IMPLEMENTS` 的 grep 核验／git 状态

**没做**：未启动 Electron 或 Vite 跑端到端点击测试；未实测大仓库性能（无万文件级项目），性能结论均为**代码结构推断**；13 个 CSS 文件中 8 个为抽样阅读（已在 `audit/frontend.md` §1.3 标注）

**已修正的错误**：初稿说「16 改」实为 **17 改**；`audit/frontend.md` 提到的「`test:graph` 指向不存在目录」经实测**目录已存在且 5 用例通过**，已在主报告改正。
