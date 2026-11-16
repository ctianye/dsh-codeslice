# CODESLICE → DSH 插件：项目索引（续接入口）

> **这份文件是续接入口。** 对话被压缩后先读这份，再按需跳转到 §4 的详细文档。
> 更新：2026-11-12 ｜ 插件 v1.0.0（重构完成，已通过两半验证与独立审核）
>
> **2026-11-12 深夜架构调整**：插件不再自带右侧栏对话工作台。左侧新增 CodeSlice 主面板，
> 正常 DSH 对话的输入框上方注册引用条；「就这段提问/就此提问」通过 `inputActions` 写进宿主对话；
> 「生成笔记」走 `noteFromSession` + `ctx.sessionQuery`。图谱可选复用本机 `graphify`（`graphBackend: auto`），
> 检索设置新增 Ollama 检测与系统提示词。详见 `TODO-REPORT.md §六` 与 `plugin/WIRE-CHAT.md §17`。

---

## 1. 一句话现状

已把 `D:\CodeSplit`（**产品名 CodeSlice**，桌面版 0.2.x）的差异化能力重建成一个 DSH 插件
（`plugin/`，`dsh-codeslice` v1.0.0）。**v0.2.0 的旧实现已被完全重写**——它不是可以打补丁
的基础，而是一个残缺的近似品（无节点 id、无关系、无说明节点、无社区、无笔记、无检索）。

审查是纯只读的，`D:\CodeSplit` 下**未修改任何文件**，插件也**不 import 它**：移植的是算法与交互
模型，不是进程模型。

> 接手要点：先读 §11（插件现状/怎么跑/怎么验），再按需回看 §3 的审查结论与 §5 的取舍。

---

## 2. 关键事实速查

| 项 | 值 |
|---|---|
| 参考项目 | `D:\CodeSplit`（目录名 CodeSplit，**产品名 CodeSlice**） |
| 插件位置 | `D:\dsh-CodeSlice\plugin`，包名 `dsh-codeslice` v1.0.0（本地开发时 profile 仍可 `link:`） |
| DSH profile | `desktop` → `C:\Users\cheng\.dsh\profiles\desktop`（已 `link:` 引用并进 `bundles`） |
| 技术栈 | 纯 Node ESM，**零运行时依赖**；Host 半 + 浏览器半 |
| 工作目录（可写） | `D:\dsh-CodeSlice` |
| Web GUI | `http://127.0.0.1:50590` |

---

## 3. 核心结论（浓缩）

### 3.1 参考项目怎么样

完成度**明显高于个人练手项目**：分层严格、注释记录的是「从真实 bug 反推的原因」、可选子系统失败
不拖垮主流程。真正的差异化资产是四件套：AST 知识图谱、符号索引、混合检索、笔记知识库。
后端 413 个测试全绿，`tsc -b` 干净。

### 3.2 它的硬问题（重构时需要判断的）

**P0 安全**：终端接口 `POST /terminal/run` 无审批直接 `Popen(shell=True)`，而 Agent 的
`run_command` 要过审批 → 审批体系形同虚设；`POST /command-rules` 接受 `{"pattern":"*"}` 一键
关闭全部审批；黑名单 8 条子串匹配可轻易绕过。

**P1 正确性**：JS/TS 继承边**完全缺失**（`languages.py:205` 设 `superclass_field=None`，让
`engine.py:435` 的基类分支永不执行）；AST 被解析两遍；图谱零增量；`App.tsx:105` 的
`openFileList` 是空操作；SSE stage 枚举漂移；`API_CONTRACT.md` 74 个操作中 18 个未记录。

**其他**：`numpy` 声明了但后端零使用（实际是纯 Python 双循环算余弦）；向量检索每次全量载入内存；
前端 CSS 是插件化头号障碍（裸元素选择器 / `:root` / `body{overflow:hidden}` / `*` 上的 `!important`）。

### 3.3 DSH 化的核心判断

> **不能照搬，必须做减法。**

DSH 已自带文件读写、grep/glob、终端（`terminals`/`subprocess`）、工具审批（`approval`）、
会话持久化。CodeSlice 那套「终端 + 黑名单 + 规则表 + 审批」搬进去，等于**在本身有沙箱的宿主里
开一条绕过沙箱的旁路**——应删除而非移植。估算：约 55% 值得移植 / 30% 应删除 / 15% 需重写。

---

## 4. 文档清单

| 文件 | 内容 |
|---|---|
| `DESIGN.md` | **重构设计**：v0.2.0 缺陷清单、架构、契约、**6 条刻意偏离**、验证状态 |
| `spec/backend-methods.md` | **算法端口规格**（3.6k 行）：图谱模型、两趟解析、resolve 阶梯、Louvain、query/render 精确文本、检索、笔记、锚点、§15 端口指引与测试向量 |
| `spec/frontend-interaction.md` | **交互端口规格**（1.6k 行）：布局、图谱交互 13 小节、纯函数表、搜索、检查器、笔记、引用芯片、装饰层、键盘、CSS 清单、重建指引 |
| `plugin/WIRE.md` | **两端接口契约**：11 个 HTTP 方法 + 工具面；两端都照它写 |
| `plugin/README.md` | 用户向说明：四个能力、工具表、界面落位、怎么跑/怎么验、已知限制 |
| `CODESLICE-AUDIT.md` | 原始全量架构审查（445 行） |
| `CODESLICE-DSH-LAYOUT.md` | 早期布局方案（317 行）；结论已被 DESIGN.md 吸收 |
| `audit/*.md` | 子系统详报（图谱/前端/桌面打包/后端服务），共 4 份 |

---

## 5. 与桌面版的关系（三种「共存」要分清）

| 形态 | 含义 | 现状 |
|---|---|---|
| 共存 1：代码复用 | 源码搬进插件，两套 UI 各自独立 | ✅ **本插件即此形态**：算法重写为 JS，不 import 原项目 |
| 共存 2：进程共存 | 同一 Python 后端既服务桌面版也服务 DSH | ❌ 不做。SQLite 单写者，共享只换来锁冲突 |
| 共存 3：UI 同屏 | 同一 DSH 窗口里并排显示 | ✅ 就是右侧栏方案 |

**六条刻意偏离**（DESIGN.md §5 有完整理由）：切分固定为桌面端参数（不开放自定义）；向量索引走回环 Ollama；自实现确定性 Louvain；
**修复 JS/TS 继承缺口**（`superclassJs` 开关，默认开）；批注不进编辑器装饰层；笔记库独立；
JSON 持久化而非 SQLite（`lib/persist.js` 负责 Map 边界）。

---

## 6. 安装与生效

```bash
# 已在 profile 里 link，无需重装。改完代码后：
#   Host 半（index.js / lib/*）      → 重启 DSH（Node 侧不热更）
#   Client 半（client/src/* 改完先构建）→ 浏览器硬刷新
cd D:/dsh-CodeSlice/plugin
node dev/build-client.mjs            # client/src → client.js（单文件 bundle）
```

索引缓存：`%TEMP%\dsh-codeslice\<sha1(root)>.index.json`（删掉即重建，或调 `/codeslice/api/rebuild`）。
**笔记库** `*.notes.json` 是**用户数据，别当缓存删**。

---

## 7. 验证（三道闸门，全绿）

```bash
cd D:/dsh-CodeSlice/plugin

# 1. 语法 + bundle 同步（--check 会先编译 factory body 再比对）
for f in index.js lib/*.js client.js; do node --check $f || exit 1; done
node dev/build-client.mjs --check

# 2. Host 半：真索引 + 全部工具 + 全部路由 + 缓存往返 + 健壮性 + 并发
node dev/host-test.mjs "D:/dsh-CodeSlice"     # 79/79
node dev/host-test.mjs "D:/CodeSplit"         # 79/79
node dev/audit-checks.mjs                     # 27/27（契约/语言闸门/渲染逐字节/安全面）
node dev/cache-probe.mjs                      # 18/18（Map 边界）
node dev/robustness.mjs                       # 22/22（空项目/坏输入/路径穿越/安全面）
node dev/workflow-probe.mjs                   # 19/19（笔记→锚点→文件夹→导出→批注）
node dev/concurrency-probe.mjs                # 并发写不丢数据 + 损坏文件不覆盖
node dev/tf-probe.mjs                         # 检索词频真的会变
node dev/generated-probe.mjs                  # 6/6（长字符串文件不被误判为生成物）

# 3. Client 半：jsdom 挂真实 bundle，fetch 直连真实 Host 路由
cd dev/harness && node run.mjs "D:/dsh-CodeSlice"          # 420x760
cd dev/harness && node run.mjs "D:/dsh-CodeSlice" --wide   # 1180x340
cd dev/harness && node audit-fixes.mjs "D:/dsh-CodeSlice"  # 9/9（审核发现的 UI 缺陷回归）
```

**实测数字**（`D:\CodeSplit`，303 文件 / 39,405 行）：2,674 节点 / 5,308 边 / 2,395 of 2,960 调用解析。

---

## 8. 环境与工具坑（重开会话要注意）

| 坑 | 说明 |
|---|---|
| **Host 半必须重启 DSH** | Node 侧不热更。`/codeslice/api/*` 返回 405（空 body）就是「进程还拿着旧模块」的典型症状 |
| **PowerShell 相对路径** | `[System.IO.File]::ReadAllText('index.js')` 按**进程 cwd** 解析，不认 `cd`。用绝对路径或 `read`/`edit` 工具 |
| **PowerShell 内联 JS 引号** | `node -e "..."` 里的中文/反引号/引号会被 PS 吞掉。写临时 .mjs 文件跑，不要硬塞 inline |
| Client bundle 是**单作用域** | `h` 和 hooks 只能声明一次（`client/src/icons.js` 是唯一 owner）。重复声明 = 加载期 SyntaxError |
| `Map` 过不了 JSON | `JSON.stringify(new Map())` → `{}`。派生结构必须 `lib/persist.js` 里的 `toPersisted`/`fromPersisted` 处理 |
| 中文字面量 | 编辑器/工具链可能改写 CJK 字面量。测试向量从输入**推导**期望值，不要手抄 |
| glob 结果截断 | 默认 100 条，用更精确的 pattern |

---

## 9. 待决策 / 待确认

| # | 问题 | 影响 |
|---|---|---|
| 1 | 桌面版 CodeSlice 继续独立存在，还是废弃 | 决定是否要做「共存 2」 |
| 2 | 是否要加向量检索 | **已决**：已接入本地 Ollama 向量 + 关键词 RRF（固定切分），见 `plugin/lib/vectors.js` |
| 3 | 笔记是否要与 DSH memory / Notion 打通 | 现在笔记库独立在插件状态目录 |
| 4 | 代码窗用右侧 `dsh-better-sidebar` 还是搬进插件 | **已决（2026-11-13）**：右侧窗口来自 `dsh-better-sidebar`，按用户要求把 CodeMirror 实现并入插件，删除旧自绘行列表 |
| 5 | 图谱用自绘还是 graphify 的 vis-network | **已决（2026-11-13）**：打包 vis-network 9.1.6，按 graphify 参数渲染；全量 5000，超限按社区聚合 |

---

## 10. 审查的方法与局限（诚实交代）

**做过**：pytest 全量（413）／`tsc -b`／`npm run test:graph`／OpenAPI 路由导出／契约文档缺口比对／
行数统计／`numpy` 与 `REL_IMPLEMENTS` 的 grep 核验／git 状态；重构后跑完 §7 的三道闸门。

**没做**：未启动原桌面版 Electron 做端到端点击对照；未实测万文件级仓库性能（性能结论为结构推断）；
**live GUI 目视未完成**——见 §11.4。

---

## 11. 插件实现现状（接手必读）

### 11.1 与原方案的偏差

| 原方案 | 实际 | 原因 |
|---|---|---|
| Python sidecar + MCP over stdio | **纯 Node 插件，无独立进程** | 索引/解析用 JS 重写，宿主进程内直接跑。少一个进程、少一个分发问题 |
| 3 个右侧栏标签 | **3 个都做了**（graph / notes / outline）+ 1 个文件查看器 + 1 个输入框芯片 | 重构后不再是「屏幕切换」，而是各自独立的 tab |
| Python 后端共享 | **不共享** | 见 §5 |

### 11.2 文件

| 文件 | 行数量级 | 职责 |
|---|---:|---|
| `index.js` | ~1.3k | Host 入口：每 root 一份缓存构建、15 个工具、11 个 HTTP 方法 |
| `lib/model.js` | ~430 | 词汇表：kind/relation/confidence/id 构造 + 权重表 |
| `lib/analyzer.js` | ~1.6k | 扫描器：单文件 → Extraction（掩码正则，零依赖） |
| `lib/resolve.js` | ~1.1k | 两趟解析：符号表、优先级阶梯、语言闸门、符号索引 |
| `lib/cluster.js` | ~600 | Louvain + 社区命名 + `topologyKey` |
| `lib/query.js` | ~1.0k | 打分/选种/扩展/文本渲染/路径/邻居/画布切片 |
| `lib/retrieval.js` | ~700 | CJK 二元组分词 + 分块索引 + 记录检索 |
| `lib/notes.js` | ~600 | 笔记/文件夹/锚点/漂移/笔记图谱/导出 |
| `lib/store.js` | ~200 | 每 root 的 JSON 缓存 |
| `lib/build.js` | ~300 | 收集 → 扫描 → 解析 → 文档 |
| `lib/persist.js` | ~90 | JSON 边界：丢 Map、加载时重建 |
| `client/src/*.js` | 21 个模块 | 面板 UI（真实 ES 模块）+ 两个懒加载资产 |
| `client/editor.js` | 1.7MB（生成） | CodeMirror 6 只读编辑器块，**committed** |
| `client/vendor/vis-network.min.js` | 700KB | graphify 固定的 9.1.6，**committed** |
| `client.js` | ~390KB（生成） | 单文件 bundle，**committed** |

### 11.3 怎么跑

见 §7。`dev/` 不参与发布（`package.json.files` 不含 `dev/`）。

### 11.4 已验证 / 未验证

**已验证**（可复现）：§7 的三道闸门全绿；规格文本向量**逐字节**匹配
（`Subgraph: 2 nodes, 1 edges (budget 2000 tokens)`、`Kind:` 后两个空格）；CJK 分词 10 个 token；
问题分词 `['agent','call','tool']`；缓存往返 18/18；健壮性 22/22。

**未验证**：**live GUI 目视**。原因是 Host 进程（14:29 启动）早于我写的文件，Node 侧不热更，
所以 `/codeslice/api/*` 目前返回 405。**重启 DSH 后**才能在真实窗口里看到面板。
截至本文件写入，`cordis_inspect_query` 里该行状态是 `inactive`（旧一代模块的残留）。
已独立验证：路由能注册、每个方法都能通过 profile 的 link 副本正常应答。

### 11.5 下一步最值得做的三件

1. **重启 DSH 后目视验收**：左侧工作台 + 正常对话引用条，重点看检索设置里的向量索引状态
2. **向量索引已完成**：`lib/vectors.js`（固定切分 + Float32 持久化 + 增量构建），
   `ask` 走关键词/向量/图谱三路 RRF；没有 Ollama 时自动退回关键词
3. **图谱/关键词索引仍是全量重建**：改一个文件仍会重走扫描；可比照桌面端 mtime + `fs.watch`

### 11.6 2026-11-13：原版编辑器 + 原版图谱

- 右侧代码窗确认来自 `dsh-better-sidebar`（不是 DSH 自带）。旧的自绘代码行已删除，
  改为 CodeMirror 6 懒加载块（`client/editor.js`，`dev/build-editor.mjs` 生成），保留行号选择、
  文本拖选、批注/笔记装饰和「就这段提问」。
- 图谱从自绘 SVG 换回 graphify 的 vis-network 9.1.6（本地打包，离线），物理参数/节点大小/
  标签阈值/边样式照 `exporters/html.py`；稳定后关闭物理并缓存坐标。
- 工作区图谱全量 5000 节点；超过按社区聚合成 meta 节点，`total` 保留原始规模。
- 社区名照桌面端：多数文件名 + `+N`、孤立节点「未分类」、重名消歧；graphify 的成员关系保留。
- 新资产路由 `GET /codeslice/assets/<name>`（白名单 + 准入检查）。
- 闸门：`host-test` 79、`chat-probe` 241、`graphify-probe` 9、`audit-checks` 30、`robustness` 22、
  harness 窄/宽与 `audit-fixes` 7/7；`build-client --check` / `build-editor --check` current。
- 遗留：真机重启后的视觉验收（浅色主题、超大图性能）。
