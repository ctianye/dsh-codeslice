# CodeSlice × DSH 插件化：前端布局方案

> 前置阅读：[`INDEX.md`](INDEX.md)（项目上下文索引，续接入口） · [`CODESLICE-AUDIT.md`](CODESLICE-AUDIT.md)（架构审查与移植可行性）
> 本文回答两个问题：**布局怎么放**、**能和原来的 CodeSlice 共存复用多少**
> 结论基于对**本机当前 DSH profile 的实测**（槽位树、已装插件、右侧栏注册 API），不是推断

---

## 0. 结论先说

**能共存，而且不该重写编辑器。** 本机已装的 `dsh-better-sidebar`（v0.28.2）暴露了 `ctx.betterSidebar` 服务，明确面向第三方插件提供两个注册点：

```js
ctx.betterSidebar.registerTab(descriptor)        // 侧栏页面（标签）
ctx.betterSidebar.registerFileViewer(descriptor) // 文件查看器（按扩展名/内容嗅探）
```

它自己的 6 个内置标签 + 4 个内置查看器**用的就是同一个 API**。这意味着 CodeSlice 的编辑器、图谱画布、笔记阅读器都可以作为"标签"或"查看器"接进去，**复用它已有的 CodeMirror 编辑器、文件树、tab 管理、分屏、拖拽、快捷键**，而不是把 Monaco 和那 7,175 行 CSS 搬进来。

推荐布局：

| CodeSlice 原能力 | DSH 落位 | 复用方式 |
|---|---|---|
| 代码编辑器（Monaco） | **右侧栏 tag** `codeslice:reader` | 放弃 Monaco，改用 better-sidebar 已有的 CodeMirror |
| 图谱画布（vis-network） | **右侧栏 tag** `codeslice:graph` | 自渲染，复用 React + 主题令牌 |
| 笔记知识库 | **右侧栏 tag** `codeslice:notes` | 自渲染，纯展示组件几乎可整体搬 |
| 文件查看器增强 | **file viewer** `codeslice:annotated` | 包装现有 viewer，叠批注/锚点层 |
| 侧栏图标入口 | `sidebar.panellist` | 若要独立主面板 |
| 对话中的引用芯片 | `conversation.chat.node` | 引用行自渲染 |
| 输入框上方"当前选区" | `conversation.composer.dock` | 微小提示条 |
| 项目选择 / 设置 | **全部删除** | 用 DSH 的 workspace + settings |
| 终端 | **全部删除** | 用 DSH 的 `@deepseek-ai/dsh-client-ui-sidebar-terminal` |

---

## 1. 实测到的 DSH UI 结构

### 1.1 三栏骨架

```
┌─────────┬───────────────────────────────┬──────────────────┐
│ sidebar │           main                │    rightbar      │
│ (左列)  │  (中列，keyed by panel id)     │   (右列)          │
│         │                               │                  │
│ panellist│  默认 key = "conversation"    │  ┌─ tabs ─────┐  │
│  ○图标1 │  → main.conversation          │  │editor│git│ │  │
│  ○图标2 │     → conversation.session    │  │files │diff│ │  │
│         │        → conversation.view    │  └────────────┘  │
│         │           (list: chat /       │                  │
│         │            trajectory / ...)  │  sidebar.right.  │
│         │                               │  pane.tab (keyed)│
└─────────┴───────────────────────────────┴──────────────────┘
```

关键事实（`cordis_inspect_query` → `Slots.listSubTree` 实测）：

- `main` 是 **keyed**，当前只被 `conversation` 占用（另有 plugins / skill-mcp / schedules / dsh-context / mnemon 四个非会话面板）
- `sidebar.panellist` 是 **list**，现有 5 个入口：`plugins`(0)、`skill-mcp`(1)、`schedules`(10)、`dsh-context`(20)、`mnemon`(30)
- `rightbar` → `rightbar.session` → `sidebar.right.pane.tab` 是 **keyed**，注册"标签类型"
- `sidebar.right.pane.tab` 现有 18 个 occupant，其中 `dsh-better-sidebar:*` 占 5 个（editor / git / subagent / sidechat / diff / files）

### 1.2 右侧栏标签是怎么注册的（从 `dsh-context` 反解的真实代码）

```js
// 极简后的真实形态（dsh-context/lib/client.js）
ctx.slots.inject('main', () =>
  ctx.slots.register({ name: 'main', key: 'dsh-context' }, Component)
)
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-context', order: 20, label: () => t('ov.title') },
    (props) => <Icon size={props.size} />)
)
```

要点：
- 两处注册**必须成对**——`main` 的 key 必须等于 `sidebar.panellist` 的 id，点击图标才会切到对应面板
- 注册包在 `ctx.slots.inject(key, callback)` 里，callback 返回注册的 disposer；面板折叠时自动撤、展开时自动装
- `label` 传**函数**则每次投影重读，能跟随 locale 切换

### 1.3 better-sidebar 的标签注册（CodeSlice 应该用这条）

**服务确实存在，已在真实代码里确认**：

```js
// dsh-better-sidebar/lib/client.js（压缩产物中的真实一行）
ctx.provide("betterSidebar", service);
```

所以 `inject = ['betterSidebar']` 是有效的硬依赖。用法：

```js
export const inject = ['betterSidebar']
export function apply(ctx) {
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'codeslice:graph',
    title: () => locale('tab.graph'),   // 函数形式，跟随语言
    description: () => locale('tab.graph.desc'),
    icon: (size) => <GraphIcon size={size} />,
    order: 40,
    single: true,                        // 单实例：再点聚焦已有标签
    component: ({ scope, visible }) => <GraphTab sessionId={scope.sessionId} visible={visible} />,
  }))
}
```

`TabDescriptor` 的能力（实测 `service.d.ts`）：

| 字段 | 用途 |
|---|---|
| `id` | 唯一 id，同时是 `SidebarTab.type` |
| `title` / `description` / `icon` | 支持 `string \| (() => string)`，跟随 locale |
| `order` | + 菜单排序，默认 100 |
| `single` / `dedupeKey` | 单实例 / 按路径去重（editor 用 `tab => tab.path`） |
| `createTab` | 自定义造 tab（sidechat 用它每线程一个） |
| `hidden` / `bottomOnly` | 隐藏 / 只在底部工作台 |
| `badge` | 标签上的徽标（数字或字符串） |
| `rightActions` | 标签条右端的工具区 |
| `onOpen` / `onActivate` / `onClose` | 生命周期 |
| `urlTarget` | 接管外部链接 |
| `settings` | 声明式设置项（switch / text / number / select / patterns），或 `render` 自定义面板 |
| `component` | 接收 `{ ctx, store, scope, tab, visible, onOpenFile, onOpenDiff, ... }` |

`visible` 很关键：标签切走后 `display:none` 但**仍然挂载**，所以图谱画布/轮询必须靠它暂停。

### 1.4 文件查看器注册

```js
ctx.betterSidebar.registerFileViewer({
  id: 'codeslice:annotated',
  title: 'CodeSlice 批注视图',
  exts: [],                    // [] = 兜底匹配任意扩展名
  priority: -200,              // 低于内置 code viewer(-100) 才不会全抢
  fetchStrategy: 'fsRead',     // 由宿主读文件，组件直接拿到 content
  component: ({ path, content, scope, line, onLineConsumed }) => (
    <AnnotatedView path={path} text={content ?? ''} scope={scope}
                   line={line} onLineConsumed={onLineConsumed} />
  ),
})
```

`fetchStrategy` 取值：`'none' | 'fsRead' | 'mediaUrl' | 'custom' | 'binary-download'`。`fsRead` 下宿主负责读盘与超限保护（超阈值时给你 `largeFile: {size}` 让你走分页只读预览）。

---

## 2. 推荐布局：三标签 + 一查看器

### 2.1 为什么放右侧栏而不是主面板

| 方案 | 优点 | 缺点 | 判断 |
|---|---|---|---|
| A. 占 `main` 新 key（像 dsh-context） | 空间最大，能做完整三栏 | 与对话面板互斥，**看代码时看不见对话**——恰好违背 CodeSlice 的产品前提 | ❌ |
| B. 做成右侧栏多标签 | 对话与代码**同屏**；复用 better-sidebar 的编辑器/tab/分屏 | 宽度受限（宿主 `canShow` 要求至少保留 300px 给右侧栏 + 400px 中间） | ✅ **推荐** |
| C. 独立 Web 页面 + iframe | 代码完全独立 | iframe 拿不到 `--dsw-alias-*` 主题令牌与 `ctx.locale`，浅深色切换会脱节 | ❌ |
| D. 只做工具，不做 UI | 最省事 | 失去"边读边问"的形态，退回普通 Agent | ⚠️ 仅 P0 验证阶段 |

**选 B。** CodeSlice 的灵魂是"选中一段代码 → 在旁边问"，这个形态在右侧栏里天然成立：左列是会话，右列是代码，中间不用切。

### 2.2 具体落位

```
┌────────────┬──────────────────────────┬─────────────────────────────┐
│ sidebar    │  main (conversation)      │  rightbar                    │
│            │                           │  ┌ editor │ graph │ notes ┐ │
│  ○ 插件    │  用户: 这个函数为什么…    │  │                              │
│  ○ Skill   │                           │  │  CodeSlice 图谱画布          │
│  ○ 计划    │  助手: 因为… [src/a.ts:42]│  │  ┌──┐   ┌──┐   ┌──┐         │
│  ○ Context │         ↑ 点击引用芯片     │  │  │fn│───│fn│───│fn│         │
│  ○ Mnemon  │           ↓               │  │  └──┘   └──┘   └──┘         │
│            │  ┌──────────────────────┐ │  │                              │
│            │  │ 输入框 + 工具栏       │ │  │  [搜索] [筛选] [社区]        │
│            │  │ ▸ 选区: a.ts:42-58   │ │  └──────────────────────────────┘
│            │  └──────────────────────┘ │  ↑ composer.dock 提示条
└────────────┴──────────────────────────┴─────────────────────────────┘
```

四个注册点：

**① 代码阅读标签** `codeslice:reader`
- `id: 'codeslice:reader'`，`single: false`，`dedupeKey: tab => tab.path`
- **不自带编辑器**：组件内只渲染"批注层 + 大纲 + 引用卡片"，代码文本交给宿主
- 若确实要独立只读视图：`fetchStrategy: 'fsRead'` 的 file viewer 更合适

**② 图谱标签** `codeslice:graph`
- `single: true`（一个项目一张图）
- 画布复用 CodeSlice 的 `GraphCanvas` 逻辑，但把渲染从 vis-network 换掉（原因见 §3.2）
- `visible === false` 时必须暂停布局与轮询

**③ 笔记标签** `codeslice:notes`
- `single: true`
- 复用 `NotesPanel` + `NoteReader`，几乎纯展示组件
- 这是**最省力、收益最高**的一块：CodeSlice 的笔记知识库在 DSH 里没有对应物

**④ 批注查看器** `codeslice:annotated`
- `exts: []` + `priority: -200`（低于内置 code viewer，避免全抢）
- `fetchStrategy: 'fsRead'`
- 叠加 CodeSlice 的 `code_annotations`（行内批注）与 `code_anchors`（漂移检测）

### 2.3 引用芯片与选区提示

**引用芯片**：注册 `conversation.chat.node` 的 `tool-call` 之外的自定义 kind 不行（那是固定 key 表），正确做法是用 `ctx.uiConversation.events.register()` 定义自己的事件类型 + 在 `conversation.chat.node` 注册对应视图。**但更省事的是**：让 CodeSlice 工具返回的 content 里带结构化引用，靠 `conversation.chat.assistant-actions` 加一个"在 CodeSlice 打开"按钮。

**选区提示条**：`conversation.composer.dock`

```js
ctx.slots.inject('conversation.composer.dock', () =>
  ctx.slots.register({ name: 'conversation.composer.dock', id: 'codeslice:selection', order: 10 },
    () => <SelectionHint />)  // 显示 "当前选区: pipeline.ts:42-58" + 一键提问
)
```

这是一个 list 槽，纯增量，不抢任何宿主 UI——**最适合作为第一个可交付物**。

---

## 3. 与旧 CodeSlice 的共存取舍

### 3.1 能直接复用的（估算 ~70% 前端）

| 模块 | 复用度 | 说明 |
|---|---|---|
| `Markdown.tsx` / `MarkdownDoc.tsx` 渲染器 | 95% | 零依赖自研，497 行；改 CSS 作用域即可 |
| `components/editor/decorations.ts` | 90% | Monaco 装饰 API——**若换 CodeMirror 需重写** |
| `graph/graphFilter.ts` / `graphRelations.ts` / `graphMeta.ts` | 95% | 纯函数，已有 5 个测试用例 |
| `graph/GraphView.tsx` 的交互逻辑 | 70% | 搜索/筛选/社区收起可留，渲染层要换 |
| `NotesPanel.tsx` / `NoteReader.tsx` | 85% | 纯展示 + API 调用 |
| `types.ts` | 90% | 零 `any`，删掉不再需要的会话/终端/审批类型 |
| `lib/citations.ts` / `lib/format.ts` | 100% | 纯函数 |
| `api.ts` 的数据获取层 | 60% | 换成 `ctx.betterSidebar.hostRouteUrl()` + Remote |

### 3.2 必须改的

| 项 | 原因 | 工作量 |
|---|---|---|
| **CSS 全部作用域化** | `base.css` 等有裸元素选择器（`button`/`input`/`a`/`code`）、`:root` 变量、`body{overflow:hidden}`、全局 `::-webkit-scrollbar`、`@media(prefers-reduced-motion)` 下的 `*,*::before,*::after{...!important}` → 直挂会污染宿主 | 大 |
| **Monaco → CodeMirror** | 若走 better-sidebar 的编辑器；Monaco 体积 ~5MB 且会抢全局快捷键 | 中 |
| **vis-network → 替代方案** | better-sidebar 已依赖 d3 + cytoscape（`d3-force` / `cytoscape-cose-bilkent` 都在 profile 里），复用它们比引入 vis-network 更省 | 中 |
| **`bridge.ts` → 宿主能力** | `window.codeslice` 的 8 个成员全部删除：`pickFolder` → `ctx.uiWorkspace.pickDirectory()`，`openExternal` → 宿主链接策略，窗口控制 → 无概念 | 小 |
| **`AppState.tsx`** | 596 行单 Context 全量广播；在插件里只需保留"当前项目 / 当前标签 / 选区"三个状态 | 中 |
| **`CodePane.tsx`** | 1331 行 7 类职责，拆分后才能塞进标签 | 大 |
| **`window.confirm`** | 换宿主 Modal | 小 |

### 3.3 必须删除的

| 项 | 行数 | 理由 |
|---|---|---|
| 终端面板 + `apiTerminal.ts` | ~625 | 宿主已有 terminal 标签 |
| 审批卡片 + `CommandRulesPanel` | ~300 | 宿主已有 `approval` 服务；保留 diff 文案生成逻辑即可 |
| 项目选择 / `WelcomePage` | ~190 | 宿主有 workspace |
| 设置弹窗 / `VectorModelsPanel` | ~872 | 宿主有 settings + credentials |
| 会话列表 / `ConversationList` | ~223 | 宿主有 session 列表 |
| 桌面壳 IPC | 433（TS） | 宿主是 Web |

### 3.4 视觉与主题

**硬约束**：不能用 `require('@deepseek-ai/dsh-client-ui-primitives')`，也不能 require 任何 `@deepseek-ai/dsh-client-*` 包。必须自己写控件、只用 `--dsw-alias-*` 令牌。

实测可用的令牌全集（`Theme.listTokens`，共 14 个，全部要求同时提供浅色/深色值）：

| 令牌 | 用途 |
|---|---|
| `--dsw-alias-bg-base` | 应用底色 |
| `--dsw-alias-bg-layer-1` | 一级抬升面（卡片） |
| `--dsw-alias-bg-layer-2` | 二级嵌套面 |
| `--dsw-alias-bg-overlay` | 浮层 / 弹窗底 |
| `--dsw-alias-border-l1` | 主细边框 |
| `--dsw-alias-border-l2` | 次强边框 |
| `--dsw-alias-brand-primary` | 品牌强调色 |
| `--dsw-alias-label-primary` | 主文字 |
| `--dsw-alias-label-secondary` | 次文字 |
| `--dsw-alias-state-error-primary` | 错误态 |
| `--dsw-alias-state-idle-primary` | 非活跃态 |
| `--dsw-alias-state-success-primary` | 成功态 |
| `--dsw-alias-state-warn-primary` | 警告态 |
| `--dsw-specific-sidebar-fill` | 侧栏列与标题行底色 |

注意：**没有专门的 size / spacing / radius / font 令牌**——这些用固定值即可（与宿主字号由 `ui-theme` 的 `fontSize`/`codeFontSize` 配置驱动，不要再覆盖）。

```css
/* ✅ 可以 */
.cs-graph-toolbar {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
/* 图谱节点按类别着色时，用状态令牌 + 透明度叠出层次 */
.cs-node-fn   { fill: var(--dsw-alias-brand-primary); }
.cs-node-class{ fill: var(--dsw-alias-state-success-primary); }
/* ❌ 禁止 */
button { background: #f4f6f8; }
:root { --my-color: #333; }
body { overflow: hidden; }
```

### 3.5 和"旧 CodeSlice"共存的三种形态

这里"共存"有三种不同含义，需要分清：

| 形态 | 含义 | 可行性 |
|---|---|---|
| **共存 1：代码复用** | 把 CodeSlice 源码搬进插件，两套 UI 各自独立 | ✅ 推荐。但 CodeSlice 桌面版继续独立存在还是废弃，是产品决策 |
| **共存 2：进程共存** | CodeSlice 的 Python 后端既服务桌面版，也服务 DSH 插件 | ✅ 可行，见下 |
| **共存 3：UI 同屏** | 在同一个 DSH 窗口里同时显示 CodeSlice 和 DSH 原生界面 | ✅ 就是右侧栏方案 |

**共存 2 的具体做法**（推荐）：

```
CodeSlice 桌面版 ──HTTP──┐
                        ├─→ 同一个 Python sidecar（图谱 + 索引 + 检索）
DSH 插件 ────stdio──────┘
```

实现要点：
- Python 后端加两个入口：`app/main.py`（FastAPI，桌面版用）和 `app/mcp_server.py`（stdio MCP，DSH 用）
- 两者**共享** `graph/`、`retrieval/`、`indexing/` 与同一个 SQLite 数据库
- 但 SQLite 单写者：桌面版和 DSH 同时写会撞锁。解法：**只允许一方建索引**，另一方只读；或统一由 sidecar 持有写权，桌面版也改成只读客户端
- 更简单：DSH 插件用自己的数据目录，与桌面版**不共享数据库**，只共享代码

---

## 4. 分阶段实施

### P0：验证布局可行性（1-2 天）

只做一个最小可交付物，验证槽位挂载与主题：

1. 建 `@local/dsh-codeslice` 包，`package.json` 声明 `dsh.bundle.patch` + `dsh.client`
2. 在 `conversation.composer.dock` 注册一个"选区提示条"（纯增量槽，零风险）
3. 在 `sidebar.right.pane.tab` 注册一个空壳 `codeslice:graph` 标签，验证：
   - 右侧栏 + 菜单里出现图标与标题
   - 点击能打开空面板
   - 浅色/深色切换时颜色跟得上
   - `visible` 在切标签时正确变化

**验收标准**：能在右侧栏看到 CodeSlice 的空面板，且切换主题不穿帮。若这一步不通（比如 `betterSidebar` 服务拿不到），整个方案需要改走"独立主面板 + `sidebar.panellist`"——所以要最先做。

### P1：只读工具 + 最小 UI（5-8 天）

- Python sidecar 以 MCP over stdio 接入（`@deepseek-ai/dsh-mcp-client`，`transport: stdio`）
- 暴露 8 个只读工具：`graph_query` / `graph_path` / `graph_neighbors` / `graph_rationale` / `search_code` / `definition` / `references` / `symbols`
- 右侧栏 `codeslice:graph` 标签接上真实的图数据
- 引用芯片：工具返回结构化引用，`assistant-actions` 加"在图谱中定位"

### P2：编辑器与批注融合（8-12 天）

- `codeslice:annotated` 文件查看器（`fsRead`，`priority: -200`）
- 复用 better-sidebar 的 CodeMirror，把 CodeSlice 的 `code_annotations` 渲染成行内装饰
- 锚点漂移检测接入 `workspaceChanges`
- `codeslice:notes` 笔记标签

### P3：打磨（可选）

- 图谱画布改用 d3-force / cytoscape（复用 profile 已有依赖）
- 笔记与 DSH memory 打通
- 支持 `urlTarget` 接管 GitHub 链接

---

## 5. 风险与未决问题

| 风险 | 说明 | 缓解 |
|---|---|---|
| **`betterSidebar` 是第三方插件** | 依赖它的 API 意味着依赖别人的版本节奏（当前 0.28.2，`SIDEBAR_SERVICE_VERSION` 与 npm 同步） | 用 `service.features` 做能力门控；做好"服务不存在就降级到 `sidebar.panellist` 独立面板" |
| **右侧栏宽度受限** | 宿主 `canShow` 要求右侧栏至少 300px 且中间留 400px；窄屏会被折叠 | 设计响应式：窄时图谱只显示社区总览 |
| **Monaco 换 CodeMirror** | 装饰 API 不兼容，`decorations.ts` / `frameZones.ts` / `gutterSelection.ts` 需重写 | 也可坚持用 Monaco，但要隔离其全局快捷键与 CSS |
| **主题令牌** | 只有 14 个 alias 令牌，没有 size/spacing 令牌；节点分类着色要自己叠透明度 | 严格只用令牌，artwork 除外 |
| **`visible` 语义** | 标签切走后仍挂载，忘了暂停会导致后台跑布局/轮询 | 所有重型组件第一件事就是判断 `visible` |
| **主题令牌清单未拉取** | 已在 §3.4 补全（14 个 `--dsw-alias-*` + 1 个 sidebar 专用） | ✅ 已解决 |
| **共存 2 的 SQLite 单写者** | 两进程同时写索引会撞锁 | 见 §3.5，建议不共享数据库 |

---

## 6. 一句话总结

**布局放右侧栏多标签，编辑器用 `dsh-better-sidebar` 已有的，CodeSlice 只贡献它在 DSH 里没有的东西（图谱、笔记、批注、语义检索）。** 不要搬 Monaco + vis-network + 7,175 行 CSS，那是把两个成熟系统的重复部分叠加，而不是互补。

三个标签（reader / graph / notes）+ 一个查看器（annotated）+ 一个 composer 提示条，就是完整形态。

---

## 附录：本次实测依据

| 结论 | 来源 |
|---|---|
| `main` 是 keyed、现有 occupant 列表 | `cordis_inspect_query` Client `Slots.listSubTree` root=`main` |
| `sidebar.panellist` 是 list，5 个现有入口 | 同上，root=`sidebar.panellist` |
| `sidebar.right.pane.tab` 是 keyed，18 个 occupant | 同上，root=`sidebar.right.pane.tab` |
| better-sidebar 暴露 `ctx.betterSidebar` | 该包 `package.json` description + `README.md:127-137` + **`lib/client.js` 里的 `ctx.provide("betterSidebar", service)`** |
| `registerTab` / `registerFileViewer` 完整签名 | `lib/types/client/service.d.ts`（841 行，逐字段读完） |
| `dsh-context` 的 `main` + `panellist` 成对注册法 | `dsh-context/lib/client.js` 反解出的 `iu()` 函数 |
| profile 已装 d3 / cytoscape 系依赖 | `$DSH_PROFILE_DIR/node_modules` 目录列表 |
| profile 配置中 better-sidebar 已启用 | `$DSH_PROFILE_DIR/cordis.patch.yml` 的 `id: better-sidebar` 行 |
