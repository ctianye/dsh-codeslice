# CodeSlice 前端技术审计报告

> 审计对象：`D:\CodeSplit\frontend`（只读）
> 审计范围：`frontend/` 下除 `node_modules/`、`public/monaco/`（构建产物）以外的全部文件
> 审计方式：逐文件静态阅读（read / grep / glob），未运行应用、未启动后端、未执行构建
> 报告日期：2026-11-11

---

## 0. 结论速览

| 维度 | 结论 |
| --- | --- |
| 规模 | 70 个源文件，约 **20.3k 行**（TS/TSX 13.1k + CSS 7.2k） |
| 技术栈 | React 18.3 + TypeScript 5.6（strict）+ Vite 5.4 + Monaco 0.52 + vis-network 10 |
| 状态管理 | 单一 React Context（`AppState.tsx`，596 行）全量广播，无 selector、无分片、无外部库 |
| 数据流 | 组件 → `api.ts` / `apiTerminal.ts` → `fetch` → FastAPI（`X-Session-Token`） |
| 后端契约 | **66 个后端端点**（其中 6 条 SSE）+ 1 个外部 GitHub API |
| Electron 依赖 | 极窄：`bridge.ts` 仅 8 个成员，且代码已内建「非 Electron 降级路径」 |
| 类型安全 | 良好。**全文没有一个字面量 `any`**，`strict: true` + `noUnusedLocals` + `noUnusedParameters` |
| 测试 | **零**。`package.json` 声明了 `test:graph`，但 `tests/` 目录不存在 |
| 可迁移性 | 中高。UI 逻辑几乎可整体复用；主要障碍是**全局 CSS**、**窗口控制**、**跨源 CORS/token** |

**最重要的 5 个发现（摘要）**

1. `CodePane.tsx` 1396 行，单组件承担 Monaco 宿主、选区、批注、Markdown 草稿、IDE 导航、对话卡片、图谱定位 7 类职责，20 个 `useState` + 14 个 `useRef`——全项目最大的重构点。
2. `AppState` 有 **7 处「在 `setState` 的 updater 内部调用另一个 `setState`」**（`AppState.tsx:203-220, 231-246, 280-299, 342-354, 356-363, 365-380, 411-439, 460-480`），在 `StrictMode`（`main.tsx:26`）下会被双调用，属系统性 React 反模式。
3. **CSS 是 DSH 插件化的头号障碍**：`base.css` 用裸元素选择器（`button`、`input, textarea, select`、`a`、`code, pre, kbd`）、`:root` 变量、`body { overflow:hidden }`、全局 `::-webkit-scrollbar`，以及一条 `@media (prefers-reduced-motion) { *, *::before, *::after { ... !important } }`——嵌入宿主页面会污染宿主。
4. **流式渲染有三处 O(n) 每帧开销**：`Markdown` 每个 token 都全量重解析（`Markdown.tsx:40`）、`useChatStream` 每个 SSE token 一次 `setState`（`useChatStream.ts:120-127`）、`CodePane` 每次渲染对整文件 `split('\n')`（`CodePane.tsx:598-601`）。
5. `App.tsx:105-112` 的 `openFileList()` 只写 `localStorage` + 递增 `sidebarEpoch`，**没有调用 `setSidebarTab('files')`**，而 `Sidebar` 读的是 `AppState.sidebarTab`——该按钮在代码层面不产生可见效果（静态推断，未运行验证）。

---

## 1. 审计范围、方法与已知限制

### 1.1 文件清单

```
frontend/
├── package.json / vite.config.ts / tsconfig{,.app,.node}.json / index.html / .env.local
├── scripts/copy-monaco.mjs
├── public/monaco/vs/**            ← 构建产物（Monaco AMD 分发，104+ 文件），不计入统计
└── src/                           ← 70 个源文件
    ├── main.tsx, App.tsx, api.ts, apiTerminal.ts, bridge.ts, types.ts, vite-env.d.ts
    ├── state/AppState.tsx
    ├── hooks/{useAsync,useChatStream,useIndexJob}.ts
    ├── lib/{citations,format,releases,stages}.ts
    ├── components/                    （29 个 .tsx）
    ├── components/editor/             （4 个 .ts）
    ├── components/graph/              （9 个文件）
    └── styles/                        （13 个 .css，7,175 行）
```

### 1.2 行数统计

| 类别 | 文件数 | 行数 |
| --- | --- | --- |
| 根配置（package.json / vite.config.ts / tsconfig×3 / index.html / .env.local / copy-monaco.mjs） | 8 | ≈ 115 |
| TS / TSX（`src/**`） | 57 | **≈ 13,131** |
| CSS（`src/styles/**`） | 13 | **≈ 7,175** |
| **合计（src）** | **70** | **≈ 20,306** |

最大的 10 个源文件：

| 文件 | 行数 |
| --- | --- |
| `src/components/CodePane.tsx` | 1396 |
| `src/styles/graph.css` | 1364 |
| `src/styles/sidebar.css` | 1168 |
| `src/styles/chat.css` | 924 |
| `src/styles/editor.css` | 789 |
| `src/components/NotesPanel.tsx` | 733 |
| `src/types.ts` | 693 |
| `src/api.ts` | 680 |
| `src/styles/settings.css` | 667 |
| `src/state/AppState.tsx` | 596 |

### 1.3 方法与限制（重要）

- **已逐个读完**：全部 57 个 TS/TSX 文件（含 `CodePane.tsx` 分两段）、`base.css` 全文、`layout.css` 全文，以及 `editor.css` / `chat.css` / `graph.css` 的关键段落。
- **抽样阅读**：其余 CSS（`sidebar.css` 1168 行、`settings.css` 667 行、`doc.css` 311 行、`note.css` 269 行、`tabs.css` 223 行、`welcome.css` 220 行、`feedback.css` 176 行、`terminal.css` 262 行）只读了文件头与经 grep 定位的关键选择器块。**未逐行通读**，因此不排除这些文件里还有未发现的样式问题。
- **无法确认的事**：`desktop/electron/preload.ts` 的真实实现、后端 CORS 与鉴权细节、应用实际运行行为。凡属此类，报告中一律标 **「未确认」**。
- **本次未修改 `D:\CodeSplit` 下任何文件**（只读工具调用）。

---

## 2. 前端整体架构

### 2.1 构建与运行形态

`vite.config.ts` 三个关键点：

```ts
base: './',                                   // :9   —— 生产由 Electron 用 file:// 加载
server.proxy['/api'] → VITE_API_TARGET,       // :19-25 —— 仅 dev，浏览器模式下走同源代理
build.chunkSizeWarningLimit: 4096,            // :31  —— 默许超大 chunk（Monaco）
```

`base: './'` 是为了 `file://` 协议下的相对资源路径——这是「Electron 应用」而非「Web 应用」的直接证据。`.env.local` 里 `VITE_SESSION_TOKEN=dev-token`、`VITE_API_TARGET=http://127.0.0.1:8021` 说明默认后端端口 **8021**，而 `vite.config.ts:22` 的兜底是 **8000**（两处不一致，属配置漂移）。

`scripts/copy-monaco.mjs` 在 `build` 前把 `node_modules/monaco-editor/min/vs` 拷到 `public/monaco/vs`，配合 `CodeViewer.tsx:10` 的 `loader.config({ paths: { vs: './monaco/vs' } })`——**Monaco 完全本地化，零 CDN 依赖**。这是很好的离线设计，但也意味着构建产物里带 100+ 个 AMD 脚本文件。

CSP 定义在 `index.html:8-11`（**这是全项目唯一一处安全策略**）：

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: http://127.0.0.1:*; font-src 'self' data:;
connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://api.github.com;
worker-src 'self' blob:;
```

评估：`script-src 'self'`（无 `unsafe-eval`）配合 Monaco 的 `worker-src blob:` 是正确搭配；`style-src 'unsafe-inline'` 是 Monaco 的硬性需求，可接受。缺口：无 `object-src 'none'`、无 `frame-ancestors`、无 `base-uri`。是否在生产由主进程再加一层 CSP，**未确认**。

### 2.2 入口链

```
index.html
└── src/main.tsx            ← createRoot + <StrictMode> + <AppProvider>
    └── <AppProvider>AppState.tsx   ← 唯一全局状态源
        └── <App>  App.tsx
            ├── <TopBar>               项目胶囊 / 主题 / 窗口控制
            ├── <Sidebar>              FilePanel | ConversationList | NotesPanel（三选一）
            ├── <Splitter>             左右分栏拖拽
            ├── 编辑区
            │   ├── <EditorTabs>       标签条 + 终端开关
            │   ├── 三选一（App.tsx:154-163）
            │   │   ├── <GraphView scope="code">   (tab.kind==='graph' && scope==='code')
            │   │   ├── <GraphView scope="notes">
            │   │   ├── <NoteReader>
            │   │   └── <CodePane>                 ← 默认
            │   └── <TerminalPanel>    底部停靠
            └── <ChatPane>             消息流 / Composer
        ├── <SettingsModal>（条件）
        └── <ReleaseNotice>（条件）
```

`main.tsx:6-20` 一次性导入 13 个 CSS + `vis-network/styles/vis-network.min.css`。注意 `TerminalPanel.tsx:9` 又单独 `import '../styles/terminal.css'`——样式导入策略不统一（大部分在入口，一个在组件内）。

### 2.3 状态管理：`AppState` 是什么形态

**形态判定：单例 React Context + `useState` 群 + `useMemo` 全量打包，无 reducer、无 selector、无外部状态库。**

结构（`src/state/AppState.tsx`）：

```ts
const AppContext = createContext<AppState | null>(null)     // :174

export function AppProvider({ children }) {                  // :176
  const [projects, setProjects]           = useState<Project[]>([])          // :177
  const [project, setProjectState]        = useState<Project | null>(null)   // :178
  const [tabs, setTabs]                   = useState<EditorTab[]>([])         // :179
  const [activeTabIndex, setActiveTabIndex] = useState(0)                    // :180
  const [activeConversationId, ...] = usePersistedState(...)                 // :181
  const [refreshKey, ...]                     // :185
  const [conversationFocusNonce, ...]         // :186
  const [theme, setTheme] = usePersistedState('codeslice.theme','light')     // :187
  const [storedSidebarTab, ...]               // :188
  const [focusNoteId, ...]                    // :195
  const [navHistory, ...] / [navIndex, ...]   // :196-197
  const [citationHighlight, ...]              // :229
  const [graphAsk, ...]                       // :482
  // + 4 个 useRef（activeTabIndexRef / …）

  const activeTab = tabs[activeTabIndex] ?? null                              // :441
  const openFile  = useMemo(...)      // 派生投影：当前是文件 tab 才有值      // :442-448
  const noteView  = ...               // 派生投影：当前是笔记 tab             // :449
  const graphFocusNodeId / activeGraphScope                                   // :450-451

  const value = useMemo<AppState>(() => ({ /* 40 个字段 */ }), [/* 40 项依赖 */])  // :499-587
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>        // :589
}
```

**特征与问题：**

1. **`value` 的依赖数组有 40 项**（`:544-586`）。其中 `tabs`、`activeTabIndex`、`theme`、`project` 任一变化都会让 `value` 换新引用 → **所有 `useApp()` 消费者全部重渲染**。文件树、对话列表、笔记面板、编辑器、图谱无一幸免。没有 `useSyncExternalStore`、没有按域拆分 Context。
2. **三重投影**：`openFile` / `noteView` / `graphFocusNodeId` 都是从 `tabs[activeTabIndex]` 派生（`:442-451`），这是好设计——消费者不必理解 tab 模型。但 `EditorTab` 是判别联合（`:34-46`），投影后丢失了 kind 信息。
3. **`EditorTab` 判别联合设计得相当克制**（`:34-46`）：

   ```ts
   | { kind:'file';  path: string; highlight:{start,end}|null }
   | { kind:'note';  note: Note }                                  // 存整个 Note，改标题不必 refetch
   | { kind:'graph'; scope:'code';  focusNodeId: string|null; focusNonce?: number }
   | { kind:'graph'; scope:'notes'; focusNodeId: null }            // 每个 scope 单例
   ```
4. **反模式：在 updater 内调用别的 `setState`**（见 §6.2，最重要的问题）。
5. **持久化依靠 `usePersistedState`**（`hooks/useAsync.ts:7-34`），key 统一前缀 `codeslice.`：`activeConversation`、`theme`、`sidebarTab`、`graphRailPct`、`terminalOpen`、`sidebarWidth`、`chatWidth`、`terminalHeight`、`settingsTab`、`lastProjectId`（`App.tsx:98` 手写）。
6. **没有中间件、没有 devtools、没有 action 日志**。所有变更散落在 15 个 `useCallback` 里。

### 2.4 数据流

```
用户操作
  → 组件事件处理
    → 状态变更（AppState 或组件局部 state）
    → fetch（api.ts / apiTerminal.ts / lib/releases.ts）
      → `${apiBase()}${path}`，header 带 X-Session-Token
        → FastAPI（127.0.0.1:8021）
          → JSON 响应 或 text/event-stream
            → setState → 重渲染
```

**三条独立的数据通道：**

| 通道 | 实现 | 使用者 |
| --- | --- | --- |
| 普通 JSON 请求 | `api.ts:106-121` `request<T>()`，统一 `ApiError` | 绝大多数组件 |
| POST-SSE（手工解析） | `api.ts:448-510` `postJsonSse<T>()` → `postSse()` | 聊天、审批 resume、图谱关系总结、Ollama 拉取 |
| POST-SSE（另一份实现） | `apiTerminal.ts:175-261` `runTerminal()` | 终端面板 |

关键设计决策（值得肯定）：**SSE 的错误不抛异常，而是 yield 一个 `{type:'error', detail}` 事件**（`api.ts:461-475`, `499-502`）。调用方只需处理一个失败通道，`useChatStream.apply()` 的 `case 'error'` 就是唯一出口。这是很成熟的流式设计。

### 2.5 Electron bridge：作用与边界

`src/bridge.ts` 全文只有 83 行，暴露 8 个能力：

```ts
export interface CodesliceBridge {          // :7-18
  apiBase: string                            // 后端绝对 URL（生产由主进程注入）
  token: string                              // 会话令牌
  pickFolder: () => Promise<string | null>   // 系统目录选择器
  openExternal: (url: string) => Promise<void>
  platform: string
  minimize / toggleMaximize / closeWindow / isMaximized / onWindowState   // 自绘标题栏
}
export const bridge = typeof window !== 'undefined' ? window.codeslice : undefined  // :26-27
export const isDesktop = Boolean(bridge)                                            // :30
```

**边界非常干净**——整个 `src/` 里只有 5 个文件碰 bridge：

| 文件 | 用到什么 |
| --- | --- |
| `api.ts:1-4` | `apiBase()`、`getToken()` |
| `apiTerminal.ts:9` | `apiBase()`、`getToken()` |
| `bridge.ts` 自身 | — |
| `TopBar.tsx:3,15,17,24,74,83,92` | `isDesktop`、`isMaximized`、`onWindowState`、`toggleMaximize`、`minimize`、`closeWindow` |
| `WelcomePage.tsx:5,107,134,152` | `isDesktop`、`pickFolder`、`hasToken`、`setDevToken` |
| `SettingsModal.tsx:57,501` / `ReleaseNotice.tsx:13,16` / `VectorModelsPanel.tsx:239` | `openExternal`（有 `window.open` 降级，`bridge.ts:82`） |

**已经内建的三条降级路径**（这对 DSH 迁移极其有利）：

1. `apiBase()` 无 bridge 时返回 `''`（同源）→ 开发期走 Vite 代理（`bridge.ts:33-36`）。
2. `getToken()` 三级回退：bridge → `VITE_SESSION_TOKEN` → `localStorage['codeslice.devToken']`（`bridge.ts:46-55`）。
3. `pickFolder()` 无 bridge 时返回 `null`，`WelcomePage` 相应地隐藏「选择文件夹」按钮、改为手输路径（`WelcomePage.tsx:107-112`），并显示「浏览器模式下无法唤起系统目录选择器」的提示（`:126-128`）。

**令牌顺序带来的安全含义**：`VITE_SESSION_TOKEN` 会被 Vite 编译进 bundle（`import.meta.env` 静态替换）。生产构建若保留 `frontend/.env.local`，令牌会硬编码进 `dist/*.js`。当前 `.env.local` 里是 `dev-token`（占位值），但**文件存在本身就是风险**——`.gitignore` 是否覆盖它，未确认。

`assetUrl()`（`api.ts:183-188`）把令牌放进 **query string**：`/api/projects/{id}/asset?path=…&token=…`。原因在注释里说明了（`<img src>` 不能带自定义 header）。代价：令牌会进入 Chromium 的 URL 历史、可能的访问日志、以及任何错误堆栈。这是可接受但值得记录的已知风险。

---

## 3. 组件清单与职责表

### 3.1 顶层与容器

| 文件 | 行 | 职责 | 关键 props | 依赖的状态 / 接口 |
| --- | --- | --- | --- | --- |
| `main.tsx` | 31 | 挂载根、导入 13 个 CSS | — | — |
| `App.tsx` | 203 | 应用外壳：TopBar + 三栏 + Splitter + 路由式三分支 | — | `useApp()` 9 项；`listProjects` / `openProject`；`checkForRelease` |
| `state/AppState.tsx` | 596 | 全局状态与投影 | `{children}` | — |
| `TopBar.tsx` | 101 | 品牌、项目胶囊、主题切换、**窗口控制三键** | `onOpenSettings`、`onOpenWelcome` | `project`、`theme`、`setTheme`、`bridge` |
| `Sidebar.tsx` | 56 | 三 tab 的容器（files / chats / notes） | `onNewConversation` | `sidebarTab`、`setSidebarTab` |
| `Splitter.tsx` | 71 | 手写可拖拽分隔条，支持键盘 | `value`、`onChange`、`min`、`max`、`invert`、`label` | 无（纯受控） |
| `Feedback.tsx` | 57 | `EmptyState` / `Loading` / `ErrorNote` 三个原语 | 见文件 | `Icon` |

### 3.2 编辑区

| 文件 | 行 | 职责 | 关键 props | 依赖的状态 / 接口 |
| --- | --- | --- | --- | --- |
| `CodePane.tsx` | **1396** | **中心面板：**Monaco 宿主、选区/行号拾取、批注 CRUD、Markdown 阅读/编辑、F2 定义与引用、图谱定位、对话卡片、git 徽标 | `onAskSelection(sel)`、`onOpenFile()` | 16 项 `useApp()`；`getFile`/`getGitStatus`/`listConversationsByFile`/`listAnnotations`/`saveFile`/`createAnnotation`/`deleteAnnotation`/`getConversation`/`createNoteFromMessage`/`getNote`/`locateGraphNode`/`getDefinition`/`getReferences` |
| `CodeViewer.tsx` | 160 | **薄** Monaco 挂载层（`memo`），定义两个主题，注册导航 | `value`、`language`、`path`、`onMountEditor`、`readOnly`、`onChange` | `theme`（`useApp`）、`registerCodeNavigation` |
| `EditorTabs.tsx` | 202 | 标签条：点击/中键关闭/拖拽排序/右键菜单/滚轮横向滚动/终端开关 | `onToggleTerminal`、`terminalOpen` | `tabs`、`activeTabIndex`、`activateTab`、`closeTab`、`closeOtherTabs`、`moveTab` |
| `NoteReader.tsx` | 292 | 笔记全窗格阅读器 + 原地编辑 + 文件夹选择 + 重拟标题 + 导出 + 删除 | — | `noteView`、`openNoteView`、`bumpRefresh`、`setActiveConversationId`、`refreshKey`；`listNoteFolders`/`updateNote`/`retitleNote`/`exportNote`/`deleteNote` |
| `MarkdownDoc.tsx` | 87 | 文档级 Markdown 渲染，解析相对图片路径 → `/asset` URL | `path`、`projectId`、`text` | `Markdown`、`assetUrl` |
| `ConversationCards.tsx` | 174 | 文件级对话卡片条（按行范围分组，hover 时高亮对应行） | `cards`、`activeConversationId`、`noteBusyId`、`onOpen`、`onGenerateNote`、`onOpenNote`、`onHoverRange` | 纯展示 |
| `NavPicker.tsx` | 115 | 定义/引用候选的键盘优先选择器（内嵌于编辑区，非模态） | `title`、`subtitle`、`items`、`onPick`、`onClose` | 无 |

### 3.3 侧边栏

| 文件 | 行 | 职责 | 关键 props | 依赖的状态 / 接口 |
| --- | --- | --- | --- | --- |
| `FilePanel.tsx` | 327 | 文件树 + git 徽标 + 索引进度卡 + 项目内检索 | — | `project`、`reveal`、`refreshKey`、`focusNote`、`bumpRefresh`、`openGraph`；`getTree`/`getGitStatus`/`searchProject` |
| `FileTree.tsx` | 186 | 递归文件树，**目录按需懒加载**（API 只给两层） | `nodes`、`dirtyPaths` | `openFile`、`project`、`reveal`；`getTree` |
| `ConversationList.tsx` | 246 | 对话列表，分「本项目 / 其他项目」两组 | `onNewConversation` | `project`、`projects`、`activeConversationId`、`conversationFocusNonce`、`refreshKey`、`bumpRefresh`；`listConversations`/`deleteConversation` |
| `NotesPanel.tsx` | 733 | 知识库：文件夹树 + 拼音排序 + 全文过滤 + 新建/移动/导出/重拟标题/删除 | — | 10 项 `useApp()`；`listNoteFolders`/`listNotes`/`createNote`/`createNoteFolder`/`renameNoteFolder`/`deleteNoteFolder`/`deleteNote`/`exportNote`/`retitleNote`/`updateNote` |

### 3.4 对话

| 文件 | 行 | 职责 | 关键 props | 依赖的状态 / 接口 |
| --- | --- | --- | --- | --- |
| `ChatPane.tsx` | 389 | 对话容器：会话生命周期（含「空草稿自动删除」）、AI 回复流转笔记、整段对话转笔记、滚动跟随 | `snippet`、`onSnippetConsumed` | `project`、`activeConversationId`、`bumpRefresh`、`openNoteView`、`graphAsk`、`clearGraphAsk`；`createConversation`/`deleteConversation`/`createNoteFromMessage`/`createNoteFromConversation`；`useChatStream` |
| `MessageBubble.tsx` | 65 | 已落库消息（user/tool/assistant） | `message`、`onGenerateNote?`、`noteBusy?` | `Markdown`、`CitationChip` |
| `StreamingBubble.tsx` | 61 | 流式中的回答：activity 行 + 流式正文 + 引用 chips | `state: StreamState` | 纯展示 |
| `Composer.tsx` | 130 | 输入框：Enter 发送、Shift+Enter 换行、自动增高、外部 draft 注入 | `busy`、`disabled`、`selectionHint`、`contextToggle`、`useContext`、`onToggleContext`、`draft`、`onSend`、`onStop` | 无（全受控） |
| `ApprovalCard.tsx` | 131 | 审批门：4 个决策按钮 + diff 染色 + 命令预览 | `interrupt`、`busy`、`onDecide` | 无 |
| `CitationChip.tsx` | 52 | 引用芯片，点击跳编辑器或跳笔记 | `citation` | `reveal`、`focusNote` |
| `ConversationGraphLink.tsx` | 54 | 「定位到代码图谱」：解析对话关联节点，多选时下拉 | `conversationId` | `openConversationGraph`；`getConversationGraphTargets` |
| `RelationshipSummary.tsx` | 97 | 「AI 解读关系」：SSE 流式关系总结 | `scope`、`projectId`、`nodeId`、`neighborCount` | `streamGraphSummary` |

### 3.5 图谱（`components/graph/`）

| 文件 | 行 | 职责 | 关键 props | 依赖 |
| --- | --- | --- | --- | --- |
| `GraphView.tsx` | 558 | 图谱 tab 容器：拉取、缓存、筛选、搜索、社区过滤、检查器、可拖拽 rail、重建 | `scope`、`initialNodeId`、`focusNonce` | 6 项 `useApp()`；`getGraph`/`getNotesGraph`/`getNote`/`rebuildGraph`/`saveGraphLayout` |
| `GraphCanvas.tsx` | 490 | **vis-network 画布**：forceAtlas2 布局、标签按度数授与、选中调暗、focus 缩放、缩放工具 | `nodes`、`edges`、`theme`、`scope`、`selectedId`、`focus`、`layoutKey`、`initialPositions`、`onSettled`、`onSelect`、`onActivate` | `vis-network/standalone` |
| `graphFilter.ts` | 62 | 纯函数：`filterGraph(payload, filters) → {nodes:VisibleNode[], edges:VisibleEdge[]}`，**隐藏而非移除** | — | — |
| `graphTheme.ts` | 130 | 画布配色：Tableau-10 社区色板、按关系族决定边宽/透明度 | — | — |
| `graphMeta.ts` | 119 | 中文词表：关系名/节点类型/置信度；`relationFamily()` | — | — |
| `graphRelations.ts` | 75 | 把某节点的边分桶为 调用者/调用/依赖/结构/说明/关联 | — | — |
| `graphCache.ts` | 50 | 内存 stale-while-revalidate 缓存（TTL 15s） | — | — |
| `ConversationGraphLink.tsx` | 54 | 见 3.4 | — | — |
| `RelationshipSummary.tsx` | 97 | 见 3.4 | — | — |

### 3.6 设置与外围

| 文件 | 行 | 职责 | 依赖的接口 |
| --- | --- | --- | --- |
| `SettingsModal.tsx` | 543 | 四 tab 设置：模型 / 命令规则 / 外观 / 关于（含内嵌更新检查） | `getModelSettings`/`updateModelSettings`/`testModel`/`clearModelKey`/`getHealth`；`checkForRelease` |
| `VectorModelsPanel.tsx` | 412 | 本地 Ollama 向量模型：预设卡、一键拉取（SSE 进度）、切换、手动配置 | `getOllamaStatus`/`getOllamaPullStatus`/`pullOllamaModel`/`updateModelSettings` |
| `CommandRulesPanel.tsx` | 185 | 每项目命令审批规则的 CRUD | `listCommandRules`/`createCommandRule`/`updateCommandRule`/`deleteCommandRule` |
| `WelcomePage.tsx` | 213 | 首次运行：加项目、最近项目网格、**浏览器模式的令牌输入** | `listProjects`/`createProject`/`openProject`；`pickFolder`/`setDevToken`/`hasToken` |
| `TerminalPanel.tsx` | 367 | 终端停靠面板（见 §4.7） | `runTerminal`/`getTerminalHistory`/`cancelTerminal` |
| `ReleaseNotice.tsx` | 37 | 新版本弹窗 + `ReleaseDetails` 复用块 | `openExternal` |
| `Icon.tsx` | 353 | 手绘 SVG 图标集（55 个），无依赖 | — |

**组件层次小结**：容器组件（App / Sidebar / ChatPane / CodePane / GraphView / NotesPanel）持有数据获取与状态；展示组件（MessageBubble / StreamingBubble / ConversationCards / CitationChip / NavPicker / ApprovalCard / Feedback / Icon）基本纯受控。`ConversationCards` 的注释明确写出了这条原则：「Purely presentational: every piece of data arrives via props, which keeps the editor mount free of fetch logic」（`ConversationCards.tsx:36-38`）。

---

## 4. 关键机制细节

### 4.1 多标签编辑器（`tabs` / `activeTabIndex` / `docDraftsRef`）

**模型**：`tabs: EditorTab[]` + `activeTabIndex: number`，两者都在 `AppState`。所有增删改通过 6 个 `useCallback`：`activateTab`、`closeTab`、`closeOtherTabs`、`moveTab`、`openNoteView`、`openGraph`，加上内部的 `openFileTab`。

**去重策略**（这是设计得好的地方）：

```ts
// AppState.tsx:233-243  —— 同一路径只保留一个 tab，命中则「聚焦 + 更新高亮」
const existing = prev.findIndex(t => t.kind==='file' && t.path===path)
if (existing >= 0) { next[existing] = {kind:'file', path, highlight}; setActiveTabIndex(existing) }
else { setActiveTabIndex(prev.length); return [...prev, {kind:'file', path, highlight}] }
```
`openNoteView` 同理按 `note.id` 去重（`:427-436`）；`openGraph` 按 `scope` 去重（`:462-479`），因此代码图谱与笔记图谱**各最多一个 tab**，注释解释了理由（`:37-44`）。

**关闭时的邻居选择**（`AppState.tsx:342-354`）：中间关闭落在后一个，末尾关闭落在前一个：

```ts
if (index < current) return current - 1
if (index > current) return current
return Math.min(index, next.length - 1)
```

**`docDraftsRef` —— 跨 tab 的未保存草稿**（`CodePane.tsx:151`）：

```ts
const docDraftsRef = useRef<Map<string, string>>(new Map())   // path → 未保存文本
```

机制三步：

1. **写**：`updateDocDraft`（`:693-706`）每次按键都 `docDraftsRef.current.set(path, next)`；若文本回到与磁盘一致则 `delete`（避免记住 no-op 编辑）。
2. **读**：切回该文件的 effect（`:522-529`）在「path 是 markdown 且文件已加载」时，从 Map 取回并 `setDocDraft(kept); setDocEditing(true)`。
3. **删**：`saveDoc` 成功后 `docDraftsRef.current.delete(path)`（`:660`）；无改动时也 delete（`:651`）。

为什么必须放在 `ref` 而不是 `state`：tab 切换**不保留每文件的组件实例**——`CodePane` 是同一个组件，只是 `path` 变了。若用组件内 state，切走即丢。注释说得很清楚（`:144-150`）。

**配套的脏标记**：`docDirty = isDoc && docDraft !== null && docDraft !== content?.content`（`:584`），`docDraft === null` 表示「与磁盘一致」，因此脏判断是 O(1) 而非 O(n) 字符串比较——细节不错。

**切文件时的状态清理**（`:496-520`）一口气重置 13 项：5 个 decoration collection、view zones、selection、picked、hoverRange、annotation 草稿、`docEditing`/`docDraft`、notice/error、navPicker。注释点明了原因：「The document buffer belongs to the previous path; leaving it would offer to save one file's text into another」（`:513-514`）。

**Ctrl/Cmd+S 保存**：`window` 级 keydown 监听，仅在 `docEditing` 时挂载（`:674-684`），避免和 Monaco 自己的键位冲突。

**隐式耦合（值得注意）**：`saveDoc` → `file.reload()` + `git.reload()`（`:663-665`），即 CodePane 直接驱动它自己 `useAsync` 出来的两个数据源；而 `bumpRefresh` 才是跨组件刷新通道。两种刷新机制并存，容易漏一处。

### 4.2 代码选区与 code anchor

「code anchor」在本项目里有 **4 种不同来源**，必须区分：

| 来源 | 状态 | 产出 | 落点 |
| --- | --- | --- | --- |
| ① 文本拖选 | `selection`（`:124`） | `{start,end,code}` | 「就这段提问」→ `SnippetSelection` → 新会话 |
| ② 行号点击累积 | `picked`（`:126`）+ `pickedRef`（`:120`） | `{lines[],code}` | 同上，但行可以不连续 |
| ③ 引用高亮 | `AppState.citationHighlight`（`:229`） | `RevealTarget` | 「就这段提问」/「就这段批注」/「清除引用」 |
| ④ 图谱锚点 | `graphAsk`（`:482`） | `GraphAsk` | 注入 Composer 草稿 + `graph_anchor` 请求字段 |

**① 文本拖选**（`updateSelection`，`:181-209`）：
- 关键细节：`range.endColumn === 1 && endLine > startLine` 时 `endLine - 1`（`:189-192`）——选中到下一行行首不算包含下一行。这是很细的正确性处理。
- 性能：`setSelection(prev => ...)` 内部先比 `start/end`，相同时直接返回 `prev`（`:203`），避免拖动时每帧 `getValueInRange`。
- rAF 合帧 + `mouseSelectingRef` 抑制：`scheduleSelection`（`:263-273`）用单 rAF 句柄去重；`onMouseDownCapture`（`:290-303`）判断鼠标落点在 `CONTENT_TEXT/CONTENT_EMPTY/GUTTER_*` 时置 `mouseSelectingRef = true` 并取消待执行帧，`mouseup` 后才真正更新。注释解释了收益：「making selecting feel sticky once the file had conversations」（`:256-262`）。

**② 行号拾取**（`applyLinePick`，`:219-254`）：行号是**累积式选择器**，点击加入集合，再点移除。`pickedRef` 与 `picked` state 并存（ref 供同步路径读，state 供渲染）。把光标停在目标行而不建选区（`:250-251`），避免两个选区来源打架。为此 `CodeViewer` 必须关掉 `selectOnLineNumbers`（`CodeViewer.tsx:72`），注释给出了因果链（`:65-71`）。

**③ 引用高亮为什么在 AppState 而不在 CodePane**：`AppState.tsx:102-113` 的注释说，从笔记跳转会让编辑器**整体卸载重挂**，局部 ref 会被重置，于是「再点一次同一个 chip 取消高亮」永远失效。所以 `citationHighlight` 上提到全局，并在 `reveal()` 里做同范围切换（`:253-257`）：

```ts
const same = prev && prev.path===path && prev.start_line===from && prev.end_line===to
return same ? null : { path, start_line:from, end_line:to, symbol:null, nonce:0 }
```

这是一个从真实 bug 反推出来的架构决策，质量很高。

**④ 图谱锚点**：`askAboutNode(ask)` 只写 `graphAsk`；`ChatPane` 的 effect（`ChatPane.tsx:59-69`）把它变成一段自然语言草稿并记下 `pendingAnchorRef`；`sendMessage` 发送时取走 `anchor` → `chat.send(text, {graphAnchor})` → `streamChat` 的 body 带 `graph_anchor`（`api.ts:562`）。后端据此把该节点的邻域渲染进 prompt。**「请求锚点」与「文本」解耦**，用户中途改文案也不丢锚点——注释明确点出这一点（`ChatPane.tsx:56-58`）。

### 4.3 Markdown 渲染器

两个层次：

- `Markdown.tsx`（537 行）：**零依赖手写解析器**，块级 + 行内。
- `MarkdownDoc.tsx`（87 行）：文档级包装，注入图片解析器。

**为什么手写**（`Markdown.tsx:6-26` 注释）：不要依赖、不要 raw HTML、每条新规则都是「弄坏模型粘贴的 diff」的机会。除了 `dangerouslySetInnerHTML` 之外**全文没有任何 HTML 注入点**（grep 确认：`Markdown.tsx:18` 只有注释提到它）。安全性是干净的。

**支持的块**：标题、段落、无序/有序列表、引用、分隔线、围栏代码块（带语言标签 + 复制按钮）、管道表格（含对齐）、独立成行的图片。

**不支持的（刻意）**：嵌套块、raw HTML、脚注、定义列表。

**解析器结构**（`parseBlocks`，`:138-271`）：

```ts
type Block =
  | {kind:'p';       text}
  | {kind:'h';       level; text}
  | {kind:'ul'|'ol'; items: string[]}
  | {kind:'quote';   text}
  | {kind:'hr'}
  | {kind:'code';    lang; code}
  | {kind:'table';   head; align; rows}
  | {kind:'img';     alt; src}
```

几个值得记录的细节：

1. **围栏代码块的嵌套防护**（`:165-173`）：只有「同字符、长度 ≥ 开启符」的裸围栏才关闭内层，所以笔记里引用一段含 ``` 的 Markdown 不会提前截断。这是个真实的踩坑点。
2. **表格分隔符识别**（`TABLE_SEP`，`:91`）+ `isTableStart` 要求下一行含 `-`（`:121-125`），避免把普通含 `|` 的行当表格。
3. **`splitRow` 是手写 CSV 式扫描**（`:95-119`），处理 `\|` 转义和行内代码里的 `|`。正确性比正则切分好。
4. **标题降级映射**（`:286-290`）：

   ```tsx
   if (level <= 2) return <h3 className="md-h1">
   if (level === 3) return <h4 className="md-h2">
   return <h5 className="md-h3">
   ```
   即 **h1 → `<h3>`**。文档里不出现 `<h1>`，避免和页面大纲冲突（合理）。但 **class 名与标签号不一致**（`<h3 class="md-h1">`），后续维护容易误读。

**行内 tokenizer**（`:438-467`）：一个正则按优先级匹配——行内代码 → 图片 → 链接 → 粗体 → 斜体。注释说明顺序理由（`:440-442`）：代码优先（内容字面化），图片在链接前（`![a](b)` 也匹配链接模式）。

**引用自动识别**（`CITE`，`:427`）：

```ts
const CITE = /(^|[\s(（[`"'])([\w@./\\-]+\.[A-Za-z0-9]{1,8}):L?(\d+)(?:[-–](\d+))?(?=$|[\s),.;:，。；）\]`"'])/g
```
把 `path/to/file.py:12-30` 变成可点击 chip（`TokenNode` 的 `case 'cite'`，`:523-533`），点击调 `reveal(path,start,end)`。

**潜在隐患**：`CITE` 是**模块级带 `g` 标志的正则**，`pushPlain` 每次进入都 `CITE.lastIndex = 0`（`:472`）。同步循环内是安全的，但这是可变模块状态；如果将来把解析移进 `useMemo` 之外的并发路径（React 并发渲染 / Worker），会出现 `lastIndex` 串用。当前代码同步执行，**未观察到实际 bug**。

**流式性能问题**（重要）：`Markdown` 是 `memo` 的，但 `useMemo(() => parseBlocks(text), [text])`（`:40`）意味着**每个 token 到达都全量重解析整篇回答**。一个 3000 字的回答按 token 粒度约 600–1500 次全量 parse，每次 O(n) 行扫描 + 全量重渲染所有 block。这是本项目在长回答下最明确的性能瓶颈之一。缓解方式（增量解析、按块缓存、流式期间只渲染尾部）当前**没有采用**。

### 4.4 流式聊天（`useChatStream` + SSE 事件类型）

**Hook 契约**（`useChatStream.ts:30-42`）：

```ts
export interface ChatController {
  conversation: Conversation | null
  messages: Message[]
  interrupt: Interrupt | null      // 待审批的写文件/执行命令
  stream: StreamState | null       // 在飞的一轮
  busy: boolean
  loading: boolean
  loadError: string | null
  send(content, {useContext?, graphAnchor?}): void
  resume(decision: ApprovalDecision): void
  stop(): void
  reload(): void
}
export interface StreamState { text: string; citations: Citation[]; activity: ActivityItem[]; error: string|null }
export interface ActivityItem { id: string; label: string; detail: string|null; state: 'running'|'ok'|'err' }
```

**两个入口同一个渲染管线**（注释 `:65-69` 明说：审批前后外观一致）：

```
send()   → drive(signal => api.streamChat(...), optimisticMessage)
resume() → drive(signal => api.streamResume(...))
```

`drive`（`:216-239`）：

```ts
if (optimistic) setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), optimistic])
setBusy(true); setStream(prev => prev ?? 空)
for await (const event of factory(controller.signal)) apply(event)
finally { setBusy(false); 若 text 与 activity 均空则 setStream(null); settledRef.current?.() }
```

**SSE 事件类型全集**（`types.ts:303-373`）：

| `type` | 载荷 | 前端处理（`apply`） |
| --- | --- | --- |
| `token` | `delta: string` | 追加到 `stream.text` |
| `status` | `stage: AgentStage`, `detail?` | 上一批 running → ok，压入新 activity；**`stage==='title'` 时改 `conversation.title`** 并 break |
| `citation` | `path/start_line/end_line/symbol` | `mergeCitation` 去重追加 |
| `tool_call` | `name/args/call_id` | 记 `toolNames.current[call_id]`；activity 追加 `call:<id>`，detail 为 `JSON.stringify(args)` |
| `tool_result` | `call_id/ok/summary` | 把对应 activity 置 ok/err 并覆写 detail |
| `approval_required` | `id/kind/payload` | `setInterrupt(...)` → 渲染 `ApprovalCard` |
| `message` | `message: Message` | `upsertMessage`；若是 assistant 则 `setStream(null)` |
| `error` | `detail` | 写入 `stream.error` |
| `done` | — | 无操作（收尾靠 `drive` 的 finally） |
| `unknown` | `raw` | 落到 `default:` —— **静默丢弃** |

`AgentStage` 有 7 个值：`classify / retrieve / plan / execute / verify / summarize / title`。

**`upsertMessage` 的乐观回显替换**（`:52-63`）：本地消息 id 前缀 `local-`，服务端回来的 user 消息若 `content` 相同则替换掉本地回显。用「内容相等」而非 id 关联——因为没有客户端 id 传递机制。副作用：同一秒发两条完全相同的消息，替换会落到第一条上。属可接受的小瑕疵。

**值得注意的实现细节：**

- **`done` 事件被忽略**。语义上服务端用 `done` 表示结束，但前端不依赖它，而是依赖 generator 结束（`for await` 退出）+ HTTP body 关闭。这是健壮的（不依赖单一信号），但也意味着 `done` 的信息（若有载荷）被丢弃。
- **`title` 阶段的特殊处理**（`:129-138`）：`status` 事件在 `stage==='title'` 时携带新标题，直接改本地 `conversation.title` 而不 refetch。省一次请求，但会让「对话列表」里的标题短暂不一致，直到 `onSettled → bumpRefresh`。
- **`stop()` 只 abort，不清 `messages`**（`:283-287`）。`finally` 里若 text 非空则保留 `stream`，即停止后已生成的部分仍然可见——符合预期。
- **每个 token 一次 `setState`**（`:120-127`）。`for await` 循环里的 `await` 会打断 React 18 的自动批处理，因此**每个 SSE token 都是独立一次渲染**。对一个 20 token/s 的流，就是 20 次/秒的全组件树渲染（`ChatPane` + `MessageBubble` 列表 + `Markdown` 全量 parse）。这是本项目第二大性能问题。

**关于 `resume` 的一个未实现处**（`:266-281`）：

```ts
const body = {
  interrupt_id: interrupt.id,
  decision,
  remember_pattern: (decision==='approve_always'||decision==='approve_session')
    ? (interrupt.payload.command ?? interrupt.payload.path ?? null) : null,
}
```
`types.ts:296-301` 的 `ResumeBody` 还有 `note?: string`，但**从未被发送**——死字段。

### 4.5 审批卡片（`ApprovalCard`）交互

**触发链**：`approval_required` 事件 → `setInterrupt` → `ChatPane.tsx:367-373` 渲染 `<ApprovalCard interrupt busy onDecide={d => chat.resume(d)} />`。

**四个决策**（`ApprovalCard.tsx:24-33`），分两组呈现，**安全选项放在视觉上位**：

```ts
const PRIMARY = [
  { decision:'approve', label:'本次允许', description:'只放行这一次' },
  { decision:'deny',    label:'拒绝',     description:'阻止本次操作' },
]
const BROADER = [   // 视觉降级为 ghost 小按钮，"减少打扰"
  { decision:'approve_session', label:'本次会话允许', description:'本次对话内同模式不再询问' },
  { decision:'approve_always',  label:'总是允许',     description:'为该项目永久记住该模式' },
]
```

**载荷渲染**（`payload: InterruptPayload`）：`reason` 必显示；`path`（带 file 图标）、`cwd`（文件夹图标）、`diff`（`DiffBlock` 逐行染色：`+` 绿 / `-` 红 / `@@` hunk）、`command`（`$ ` 前缀的 `<pre>`）。`InterruptKind` 只有两种：`write_file` / `run_command`，标签映射在 `:12-15`。

**防重复提交**：`pending` state（`:37`）+ 所有按钮 `disabled={busy || pending !== null}`（`:84, :101`），被点的那个显示「处理中…」。这是**纯 UI 层**防抖——没有 id 级去重，若后端超时未回且 `busy` 已落回 false，理论上还能再点。风险低。

**与后端的耦合点**：`decide()` 只调 `onDecide`，卡片本身不发请求；真正的网络在 `useChatStream.resume()`。所以卡片是**完全受控/无副作用的**——这是好的边界。

**`approve_always` 的实际语义取决于后端**：`remember_pattern` 取 `command ?? path`（`useChatStream.ts:274`），前端不区分「模式」（pattern）与「具体实例」。所以「总是允许 `pytest *`」和「总是允许 `pytest tests/x.py`」在前端看起来是同一个动作。这个模式匹配的语义完全在后端，前端只透传。**是否与 `CommandRulesPanel` 里维护的 `pattern` 表共享存储**，未确认。

### 4.6 图谱视图

**架构分层（9 个文件，职责切得很清楚）：**

```
GraphView.tsx        容器：数据 + 筛选状态 + rail 交互 + 空态/错误
  ├── graphCache.ts       内存 SWR 缓存（key = `${projectId}:${scope}`，TTL 15s）
  ├── graphFilter.ts      纯投影：payload + filters → VisibleNode[]/VisibleEdge[]（打 hidden 标记）
  ├── graphRelations.ts   某节点的边 → 6 个分组
  ├── graphMeta.ts        中文词表 + relationFamily()
  ├── graphTheme.ts       Tableau-10 色板 + 边权重/透明度
  ├── GraphCanvas.tsx     vis-network 画布（唯一真正绘制的文件）
  ├── RelationshipSummary AI 关系总结（SSE）
  └── ConversationGraphLink 对话→图谱定位
```

**绘制技术：`vis-network` 的 canvas 渲染，不是 SVG，也不是自绘。**

```ts
// GraphCanvas.tsx:18-19
import { DataSet, Network } from 'vis-network/standalone'
import type { Edge, Node, Options } from 'vis-network'
```
`standalone` 版本打包了全部依赖，无外部 peer，这点对插件化有利。画布本身是 vis 内部创建的 `<canvas>`；工具提示用 `document.createElement('div')` 塞进 `title` 字段（`:329-336`, `:364-366`），由 vis 自己渲染成 tooltip。

**布局：forceAtlas2，只跑一次然后关掉物理**（`:212-233`）：

```ts
physics: { enabled: usePhysics, solver: 'forceAtlas2Based',
  forceAtlas2Based: { gravitationalConstant:-60, centralGravity:0.005, springLength:120,
                      springConstant:0.08, damping:0.4, avoidOverlap:0.8 },
  stabilization: { enabled:true, iterations: nodes.length > 1200 ? 80 : 140,
                   updateInterval:25, fit:false } },
layout: { improvedLayout:false, randomSeed:42 }
```

`usePhysics = !seed.current.positions`——**只有拿不到历史坐标才跑物理**。代码注释给出了实测数据：「200 iterations took ~20s on a 2k-node graph」（`:225-226`），所以 >1200 节点降到 80 轮。

**「稳定」被三重兜底**（这是本项目工程细致度的体现）：

1. `stabilizationIterationsDone` + `stabilized` 双事件（`:298-299`）
2. 构造时 15s 兜底定时器（`:255`）
3. 数据到达后主动 `stabilize(iterations)` + `min(30s, 8s + nodes*5)` 兜底（`:393-405`）

注释解释了为什么需要三重（`:293-297`）：「The network is constructed empty on purpose …, and `stabilize()` bails out on an empty body without emitting — which is exactly how the canvas used to spin forever」。

**坐标持久化三层**：

| 层 | 位置 | 生命周期 | 命中条件 |
| --- | --- | --- | --- |
| 模块级 `POSITION_CACHE` | `GraphCanvas.tsx:71-89`，最多 4 条 | 页面存活期 | 命中率 ≥ 80% |
| 后端 `payload.layout` | `GraphPayload.layout`，由 `PUT .../graph/layout` 写入 | 永久（SQLite） | 命中率 ≥ 80% |
| 前端 `graphCache` | `graphCache.ts`，payload 级 | 页面存活期，TTL 15s | 总是先画后刷 |

**标签按度数「赚取」**（`applyLabels`，`:98-138`）：每级缩放对应一个标签上限（`labelLimit`，`:61-68`，从 22 到 6），候选先裁到视口内再按 `degree` 排序取前 N。缩放时标签字号反比于 scale（`fontPx = labelPx/scale`），保证屏幕尺寸恒定。**性能隐患**：每次 zoom 的 rAF 里对**全部节点**执行 `dataset.update()`（`:125-137`），2000 节点即每帧 2000 次 item 更新。

**筛选是「隐藏」不是「移除」**（`graphFilter.ts:1-8` 注释）：`hidden` 标记保留在 DataSet 里，这样 vis 的 force 布局不会因为增删节点而重排。配套地，`fitVisible()`（`GraphCanvas.tsx:185-189`）只对可见节点 `fit`，因为 vis 自带的 `fit()` 会把隐藏节点也算进包围盒，导致画面缩成角落。

**默认不显示「说明」族**（`graphFilter.ts:22-26`）：`DEFAULT_FAMILIES = ['behaviour','dependency','structure','other']`，理由注释：「showing 270 of them by default turns the call graph into a wall of prose dots」。

**边样式编码了语义**（`graphTheme.ts:50-85`）：

| 关系族 | 宽度 | 透明度 |
| --- | --- | --- |
| 调用（`calls`/`indirect_call`/`references`） | 1.5 | 0.58 |
| 依赖（`imports`/`imports_from`/`uses`） | 0.8 | 0.30 |
| 层级（`inherits`/`implements`） | 0.9 | 0.38 |
| 结构（`contains`/`method`/`declares`） | 0.5 | 0.12 |
| 说明（`rationale_for`） | 0.5 | 0.12 |

推断出来的边（`INFERRED`/`AMBIGUOUS`）再乘 0.7 宽 / 0.6 透明度，并加 `dashes`（`:361-375`）。`isInferred`（`graphMeta.ts:81-85`）对结构性关系有兜底：无 confidence 时仍画实线。设计意图在 `types.ts:435-441` 有明确表述：「The UI must show the difference so a guess never reads as a fact」。

箭头有选择性地开（`UNDIRECTED` / `ARROWED` 两个集合，`GraphCanvas.tsx:51-52`）——无方向的关系（`same_folder`/`same_project`/`shared_reference`）不加箭头，避免暗示不存在的调用。

**选中的调暗**（`:411-433`）：选中节点及其一跳邻居 `opacity 1`，其余 0.42；非相邻边降到 0.08。用 `network.getConnectedNodes()` 而非自己算，省一次遍历。

**rail（检查器）的响应式**：`useLayoutEffect` + `ResizeObserver` 测 `clientWidth ≤ 760` 就切成底部抽屉（`GraphView.tsx:79-87`），`NARROW_GRAPH_WIDTH` 必须与 `graph.css:1298` 的 `@container graph (max-width: 760px)` 手工同步（注释 `:36` 明说「Keep in sync」）。**这是一处硬编码的双源真相**，容易漂移。

**GraphView 的取数行为**（`:116-143`）：每次 `projectId / scope / revision / refreshKey / cacheKey` 变化都**无条件重新 fetch**，即使缓存是新鲜的——`isFresh()` 只用来控制「更新中…」徽标（`:122`）。`refreshKey` 在每次聊天结束都会 `bumpRefresh()`（`ChatPane.tsx:48` 传 `onSettled`），所以**每轮对话结束后如果图谱 tab 还开着，会重新拉整个图谱 payload**。对 2k 节点项目是一次 MB 级传输。

**布局写放大**：`onSettled` 在「首次稳定」和「每次 `dragEnd`」都会触发 `saveGraphLayout`（`GraphView.tsx:312-317` → `GraphCanvas.tsx:300-304`）。用户拖动一个节点 = 一次全量坐标 PUT。

### 4.7 终端面板（`TerminalPanel.tsx`，367 行）

**定位**：停靠在**编辑区下方**而非整个应用下方，理由是「it is about the code the editor is showing」（`App.tsx:165-166`）。

**协议**：`POST /api/projects/{id}/terminal/run` 返回 `text/event-stream`，事件 5 种（`apiTerminal.ts:41-46`）：

```ts
type TerminalEvent =
  | {type:'start';  command; cwd}
  | {type:'output'; stream:'stdout'|'stderr'; text}
  | {type:'exit';   code; duration_ms; truncated}
  | {type:'error';  detail}
  | {type:'done'}
```

**渲染模型**（`:25-34`）：把事件归一为 `TerminalLine[]`，6 种 kind：`command / stdout / stderr / exit / error / notice`。上限 `MAX_LINES = 2000`（`:16`），超出丢最老的：

```ts
next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next     // :88
```

**为何不用 xterm.js**：因为它不是 PTY。后端是「执行一条命令、把 stdout/stderr 流回来」，没有交互式会话、没有 tty、没有 ANSI 解析需求（`output` 是纯文本）。所以自建行列表是**正确的最小方案**，省掉 ~300KB 依赖。

**历史导航**（`:214-241`）：`typedRef` 存本会话输入最多 100 条，`cursorRef` 记住位置；↑/↓ 循环，末端回到空串。这是浏览器 devtools 式行为（不是 bash 式）。

**滚动跟随**（`:134-139`）：只在「距底 < 60px」时贴底，用户翻上去读不会被抢焦点。这是正确实现。

**停止**（`:202-212`）：先 abort 流，再 `POST .../terminal/cancel` 兜底。注释解释了为什么两者都要（`:295-301`）：「the server kills the child when the generator is closed, but this also covers a panel that was closed before the disconnect was noticed」。

**双击命中**：`cwd` 永远传 `undefined`（`:178`），后端固定用项目根。所以终端不能 `cd`。头部的「./ 项目 #{projectId}」是硬编码文本（`:264-266`），不反映真实 cwd——轻微的 UI 误导。

**尺寸**：`usePersistedState('codeslice.terminalHeight', 220)`，clamp 到 120–480（`:36-38`），鼠标拖动改（`:141-158`）。

### 4.8 导航：`NavPicker` + `codeNavigation`

**职责切分**（这是本项目少见的、刻意收敛的架构决策，见 `codeNavigation.ts:5-12` 注释）：

> Monaco stays a dumb view: F12 / Ctrl+Click are handled by CodePane so the app's tab model (not Monaco's model swap) decides which file is open.

也就是说：**故意不注册 Monaco 的 definition provider**。因为 Monaco 的原生「转到定义」会直接替换 editor model，从而与应用的 tab 条脱节。取而代之：

**（a）键位注册在 CodePane 侧**（`CodePane.tsx:327-370`）：

| 动作 | 键位 | 行为 |
| --- | --- | --- |
| `codeslice.goToDefinition` | `Ctrl/Cmd+F12` | `navHandlersRef.current.goToDefinitionAt(pos)` |
| `codeslice.findReferences` | `Shift+F12` | `showReferencesAt(pos)` |
| `codeslice.navBack` | `Alt+←` | `goBack()` |
| `codeslice.navForward` | `Alt+→` | `goForward()` |
| Ctrl/Cmd+Click | 鼠标 | `onMouseDown` 拦 `CONTENT_TEXT`，`preventDefault + stopPropagation` 后转定义 |

**为什么用 `navHandlersRef`**（`:169-179`）：Monaco action 每个实例只注册一次，闭包会捕获旧 render 的 `projectId/path`。所以用 ref 中转，并在渲染体中每次赋值最新 handler（`:897-902`）。模式正确，但「渲染中写 ref」本身不是 React 官方推荐的写法。

**（b）只有 hover 走全局 provider**（`codeNavigation.ts:48-85`）：`registerCodeNavigation(monaco)` 有 `registered` 布尔守卫，只注册一次。否则每次编辑器挂载都会叠加一层 tooltip。

**hover 的三处防护**（质量很高）：

```ts
const modelPath = model.uri.path.replace(/^\/+/, '')
if (modelPath && modelPath !== path && !modelPath.endsWith(`/${path}`)) return null    // :59  防串文件
const key = `${projectId}:${path}:${line}:${col}`; hoverCache.get/set                 // :61-70  300 条 LRU
if (context.projectId !== projectId || context.path !== path) return null             // :72  防异步竞态
```
`context` 是**模块级可变单例**（`let context`，`:18`），由 `CodePane` 的 effect 设置/清空（`CodePane.tsx:906-909`）。同理 `hoverCache` 也是模块级。**这带来一个插件化隐患**：若同页面存在两个 CodeSlice 实例，hover 上下文会互相覆盖（见 §7.4）。

**（c）`NavPicker`**（115 行）：键盘优先（↑↓ 循环、Enter 跳转、Esc 关闭、鼠标 hover 换选中），`itemRefs` 在 index 变化时 `focus() + scrollIntoView`。内嵌于编辑区而非模态，注释理由：「the code behind it remains readable」（`:28-30`）。`NavChoice` 是 `{id,label,hint,meta?,badge?,path,line,end_line}`，由 `CodePane.tsx:1309-1332` 的两个构造函数把 `DefinitionTarget` / `ReferenceLocation` 映射过来。

**（d）导航历史**（`AppState.tsx:280-318`）：`navHistory: NavHistoryEntry[]` + `navIndex`。`navigateTo` 会**截断前进分支**（`prev.slice(0, navIndex+1)`）再追加；与末项相同时不重复入栈。`goBack/goForward` 移动索引并 `showNavEntry`（后者总是带新 `nonce: Date.now()`，让「跳同一个位置两次」仍然重绘闪烁）。

### 4.9 编辑器装饰（decorations / frameZones / gutterSelection）

这是全项目**最精致的部分**，三个文件各司其职。

#### `decorations.ts`（86 行）—— 5 个 decoration collection 的内容生成器

**为什么「每行一个 decoration」而不是「一个块」**（`:11-18` 注释）：逐行才能让 Monaco 在视口边缘正确裁剪，滚动时框不会错位。副作用是 decoration 数量 = 覆盖行数，所以设了上限：

```ts
const MAX_FRAMED_LINES = 400        // :4
if (to - from > MAX_FRAMED_LINES) { 只画首尾两行的边缘 }   // :34-40
```

**重叠矩形的并集**（`:26-45`）：多个对话覆盖同一行时，用 `Map<line,{top,bottom}>` 合并边缘，再对行号排序，保证不重复绘制。

**5 个 collection 的用途**（`CodePane.tsx:278-282` 创建）：

| ref | 内容 | CSS 类 | 触发 effect |
| --- | --- | --- | --- |
| `citationRef` | 引用行范围（整行高亮 + 闪烁） | `citation-highlight` / `citation-line-flash` | `:438-462` |
| `hoverRef` | 悬浮卡片覆盖的行（单 decoration） | `conversation-card-highlight` | `:487-493` |
| `frameRef` | 每个对话范围的持久边框 | `range-frame` + `-top`/`-bottom` | `:466-477` |
| `annotationRef` | 批注范围边框 | `annotation-frame` + 边缘类 | `:479-483` |
| `pickRef` | 行号拾取的行 | `pick-line` | `applyLinePick`（即时） |

用「多个独立 collection」而非一个大 collection，是为了**互不清除**——这点在 `:485-486` 有明确注释。

CSS 侧印证（`editor.css:605-625`）：`.range-frame` 只有左右边框，`.range-frame-top/-bottom` 补上下边 —— 正是「逐行绘制 + 首尾补边」的配合。

#### `frameZones.ts`（192 行）—— Monaco ViewZone 做标题条

**问题**：每个被框住的代码范围上方要显示一条对话标题。用绝对定位会盖住一行代码。

**方案**：Monaco 的 **ViewZone**（`:44-192`）——它参与正常布局、随文本滚动、不遮挡内容（注释 `:36-43`）。

**高度常量**（必须与 CSS 同步，`:29-34`）：

```ts
const ZONE_HEIGHT = 19                 // 普通标题条
const ANNOTATION_HEAD_HEIGHT = 24      // 批注折叠
const ANNOTATION_EXPANDED_HEIGHT = 104 // 批注展开
```
对应 `editor.css:635` 的 `.range-zone { height: 19px }`。**一处双源真相**，注释里标了「Must match」。

**增量更新机制**（`update`，`:142-181`）：

```ts
signatureFor(item) = JSON.stringify([label, active, annotation?.title, annotation?.body,
                                     expanded, Boolean(onDelete), zoneHeight(item)])   // :57-65
```
只有**可见文本或高度**变化才销毁重建该 zone（`:151-155`），否则复用。因此展开一个批注不会扰动其他 zone（注释 `:41-42`）。

**DOM 手工构建**（`buildConversation` / `buildAnnotation`，`:67-140`）：因为 ViewZone 需要真实 `HTMLElement`，不能用 React。因此所有 `addEventListener`、`aria-*`、`stopPropagation` 都要手写。**这是全项目唯一大量手写 DOM 的地方**，也意味着这块 UI 脱离 React 数据流（通过 `current` Map 保证点击时拿到最新 handler，`:49-50`）。

**已知取舍**：DOM 由命令式代码维护，将来做插件化（React 树移栽）时这块要么保留命令式、要么重写为 portal。

#### `gutterSelection.ts`（169 行）—— 行号栏的三种手势

**为什么不用 Monaco 的 `selectOnLineNumbers`**（`:20-24` 注释）：它只能选一行，且会在每次 gutter 点击时设置整行选区——而选区变化会**清空累积的拾取集合**，于是行号永远无法累积。所以关闭它（`CodeViewer.tsx:72`），自己监听 `.margin-view-overlays` 上的鼠标事件。

**三个手势**：

| 手势 | 判据 | 结果 |
| --- | --- | --- |
| 单击 | mousedown → mouseup 同行 | `onSelectLine(line, additive=true)` — 累积/移除 |
| Shift+Click | `event.shiftKey` | `select(anchor, line)` — 从当前光标位置扩展 |
| 拖拽 | mousemove 到**不同行号** | `onSelectRange` — 但 `CodePane` 传的是空实现（`:323`） |

**「按行号而非像素判断拖拽」**（`:26-32` 注释，很有价值）：

> A few pixels of travel during a click is normal, and treating that as a drag would replace the whole picked set with a one-line range — which made accumulating lines look like it silently stopped working.

即：`current === pressed.line` 时不算拖拽。这个细节是从「累积功能看起来时好时坏」的真实 bug 反推的。

**合帧**（`:48-50, :123-129`）：拖动时 `pending` + 单 rAF，每帧最多一次 `applyRange`。

**取行号的方式**（`:52-57`）：用 `editor.getTargetAtClientPoint(clientX, clientY)`，而不是「(y - top) / lineHeight」——注释说明 padding、折行、滚动都已由 Monaco 处理。

**清理**：返回 disposer，`CodePane` 在 `detachRef` 里调用（`:384`）。

---

## 5. 前端调用的后端接口全集

> 这是后续 DSH 插件对接的核心契约。**共 66 个后端端点（含 6 条 SSE）+ 1 个外部 GitHub API。**
> 「使用方」标 `—` 表示该函数已定义但**当前无任何调用点**（死代码 / 预留契约）。

### 5.1 通用约定

```
Base:      apiBase()  —— Electron 注入的绝对 URL；浏览器模式为空串（走 Vite 代理）
Auth:      header  X-Session-Token: <token>       （api.ts:92-97 / apiTerminal.ts:68-73）
          例外：/api/health 注释称免鉴权（api.ts:123）
Content:   header  Content-Type: application/json （仅当有 body，api.ts:110）
Accept:    text/event-stream                       （仅 SSE）
错误体:    {"detail": "..."}  或 422 的 {"detail":[{loc,msg},...]}（api.ts:58-90）
204/空体:  返回 undefined（api.ts:117-119）
资源:      GET /asset 用 ?token= 而非 header（img src 限制，api.ts:183-188）
```

### 5.2 健康检查

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/health` | — | `Health{status,version,data_dir,app?}` | `App`(无)、`SettingsModal` 关于页、`lib/releases` |

### 5.3 项目

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 2 | GET | `/api/projects` | — | `Project[]` | `App`、`WelcomePage` |
| 3 | POST | `/api/projects` | `{path, name?}` | `Project` | `WelcomePage` |
| 4 | GET | `/api/projects/{id}` | — | `Project` | — |
| 5 | POST | `/api/projects/{id}/open` | — | `Project` | `App`（恢复上次项目）、`WelcomePage` |
| 6 | DELETE | `/api/projects/{id}` | — | `{ok}` | — |
| 7 | GET | `/api/projects/{id}/tree?path&depth` | query `path`(默认'')、`depth`(默认 2) | `TreeNode[]` | `FilePanel`、`FileTree`（懒加载） |
| 8 | GET | `/api/projects/{id}/file?path` | query `path` | `FileContent{path,language,content,size,mtime,truncated,binary}` | `CodePane` |
| 9 | PUT | `/api/projects/{id}/file` | `{path, content, expected_mtime}` | `FileContent` | `CodePane.saveDoc` |
| 10 | GET | `/api/projects/{id}/asset?path&token` | query | 二进制流（`<img>` 直接用） | `MarkdownDoc.resolveImage` |
| 11 | GET | `/api/projects/{id}/git/status` | — | `GitStatus{is_repo,branch,head,dirty,staged,modified,untracked}` | `CodePane`、`FilePanel` |
| 12 | GET | `/api/projects/{id}/git/diff?path` | query `path?` | `GitDiff{path,diff}` | **—** |
| 13 | POST | `/api/projects/{id}/index` | — | `{job_id}` | **—** |
| 14 | GET | `/api/projects/{id}/index` | — | `IndexStatus{project,last_job,files,chunks,vectors,indexed_at,embed_models,active_embed_model,embedding_configured}` | `useIndexJob`（轮询） |
| 15 | GET | `/api/jobs/{job_id}` | — | `Job` | **—** |
| 16 | GET | `/api/projects/{id}/search?q&top_k` | query `q`、`top_k`(默认 8) | `RetrievedChunk[]` | `FilePanel` |
| 39 | GET | `/api/projects/{id}/conversations/by-file?path` | query `path` | `Conversation[]` | `CodePane`（卡片） |
| 45 | GET | `/api/projects/{id}/annotations?file_path` | query | `CodeAnnotation[]` | `CodePane` |
| 46 | POST | `/api/projects/{id}/annotations` | `{file_path,start_line,end_line,selected_code,title,body}` | `CodeAnnotation` | `CodePane` |
| 60 | GET | `/api/projects/{id}/command-rules` | — | `CommandRule[]` | `CommandRulesPanel` |
| 61 | POST | `/api/projects/{id}/command-rules` | `{pattern,scope,needs_confirm}` | `CommandRule` | `CommandRulesPanel` |
| 62 | PUT | `/api/projects/{id}/command-rules/{ruleId}` | `Partial<CommandRuleCreateBody>` | `CommandRule` | `CommandRulesPanel` |
| 63 | DELETE | `/api/projects/{id}/command-rules/{ruleId}` | — | `{ok}` | `CommandRulesPanel` |

### 5.4 图谱

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 17 | GET | `/api/projects/{id}/graph` | — | `GraphPayload{nodes,edges,communities,stats,layout_key?,layout?}` | `GraphView` |
| 18 | GET | `/api/graphs/notes` | — | `GraphPayload` | `GraphView(scope='notes')` |
| 19 | PUT | `/api/projects/{id}/graph/layout` | `{layout_key, positions}` | `{ok}` | `GraphCanvas.onSettled` |
| 20 | PUT | `/api/graphs/notes/layout` | `{layout_key, positions}` | `{ok}` | 同上（notes） |
| 21 | POST | `/api/projects/{id}/graph/summary/stream` | `{node_id}` → **SSE** | `{type:'delta',text}` / `{type:'done',...GraphSummary}` / `{type:'error',detail}` | `RelationshipSummary` |
| 22 | POST | `/api/graphs/notes/summary/stream` | `{node_id}` → **SSE** | 同上 | `RelationshipSummary` |
| 23 | GET | `/api/conversations/{id}/graph-targets` | — | `{project_id, targets: GraphNode[]}` | `ConversationGraphLink` |
| 24 | POST | `/api/projects/{id}/graph/build` | — | `{nodes,edges,communities,rebuilt}` | `GraphView.rebuild` |
| 25 | GET | `/api/projects/{id}/graph/node?node_id&depth` | query | `GraphNodeDetail{node,edges,neighbors}` | **—** |
| 26 | GET | `/api/projects/{id}/graph/locate?path&line` | query | `{node: GraphNode\|null}` | `CodePane.locateInGraph` |

### 5.5 编辑器导航

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 27 | GET | `/api/projects/{id}/definition?path&line&column` | query（1-based） | `DefinitionResult{targets,candidates,reason,word}` | `CodePane`、F12 |
| 28 | GET | `/api/projects/{id}/references?path&line&column` | query | `ReferencesResult{target,locations,truncated,candidates,reason,word}` | `CodePane`、Shift+F12 |
| 29 | GET | `/api/projects/{id}/hover?path&line&column` | query | `HoverResult{contents,range?,kind?,path?,line?,reason?}` | `codeNavigation` hover provider |

### 5.6 设置 / Ollama

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 30 | GET | `/api/settings/model` | — | `ModelSettings{chat,default_*_prompt,embedding}` | `SettingsModal` |
| 31 | PUT | `/api/settings/model` | `ModelSettingsUpdate{chat?,embedding?}`（`api_key` 只写不回显） | `ModelSettings` | `SettingsModal`、`VectorModelsPanel` |
| 32 | POST | `/api/settings/model/test` | — | `ModelTestResult{ok,latency_ms,detail}` | `SettingsModal` |
| 33 | DELETE | `/api/settings/model/key?slot=chat\|embedding` | query `slot` | `{ok}` | `SettingsModal` |
| 34 | GET | `/api/settings/ollama/status` | — | `OllamaStatus{installed,version,models,base_url,openai_base_url,presets,error}` | `VectorModelsPanel` |
| 35 | GET | `/api/settings/ollama/pull` | — | `OllamaPullStatus{state,model,percent,detail,total,completed,error}` | `VectorModelsPanel`（轮询 900ms） |
| 36 | POST | `/api/settings/ollama/pull` | `{model}` → **SSE** | `{type:'progress',percent,detail,status?}` / `{type:'error',detail}` / `{type:'done'}` | `VectorModelsPanel` |

### 5.7 对话

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 37 | POST | `/api/conversations` | `{project_id,title?,file_path?,start_line?,end_line?,selected_code?,mode}` | `Conversation` | `ChatPane` |
| 38 | GET | `/api/conversations?project_id&include_others` | query | `Conversation[]` | `ConversationList` |
| 40 | POST | `/api/conversations/{cid}/messages/{mid}/note` | — | `GeneratedNote` | `ChatPane`、`CodePane` |
| 41 | GET | `/api/conversations/{id}` | — | `ConversationDetail{conversation,messages,pending_interrupt}` | `useChatStream`、`CodePane` |
| 42 | DELETE | `/api/conversations/{id}` | — | `{ok}` | `ConversationList`、`ChatPane`（空草稿清理） |
| 43 | POST | `/api/conversations/{id}/messages` | `{content, use_context?, graph_anchor?}` → **SSE** | `AgentStreamEvent` 9 种（见 §4.4） | `useChatStream.send` |
| 44 | POST | `/api/conversations/{id}/resume` | `{interrupt_id, decision, remember_pattern?}` → **SSE** | `AgentStreamEvent` | `useChatStream.resume` |
| 55 | POST | `/api/conversations/{id}/note` | — | `GeneratedNote` | `ChatPane.generateWholeNote` |

### 5.8 笔记 / 批注 / 文件夹

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 47 | DELETE | `/api/annotations/{id}` | — | `{ok}` | `CodePane` |
| 48 | GET | `/api/notes?project_id&folder_id&unfiled` | 三者皆可选 | `Note[]` | `NotesPanel` |
| 49 | GET | `/api/note-folders` | — | `NoteFolder[]` | `NotesPanel`、`NoteReader` |
| 50 | POST | `/api/note-folders` | `{name,parent_id?}` | `NoteFolder` | `NotesPanel` |
| 51 | PUT | `/api/note-folders/{id}` | `{name?,parent_id?,move?}` | `NoteFolder` | `NotesPanel` |
| 52 | DELETE | `/api/note-folders/{id}` | — | `{ok}` | `NotesPanel` |
| 53 | POST | `/api/notes` | `{project_id,title,file_name?,content_md,conversation_id?,folder_id?}` | `Note` | `NotesPanel` |
| 54 | GET | `/api/notes/{id}` | — | `Note` | `CodePane`、`GraphView` |
| 56 | PUT | `/api/notes/{id}` | `{title?,file_name?,content_md?,folder_id?,move_folder?}` | `Note` | `NoteReader`、`NotesPanel` |
| 57 | DELETE | `/api/notes/{id}` | — | `{ok}` | `NoteReader`、`NotesPanel` |
| 58 | POST | `/api/notes/{id}/retitle` | — | `Note & {retitle_failed?}` | `NoteReader`、`NotesPanel` |
| 59 | POST | `/api/notes/{id}/export` | — | `NoteExport{path,directory,filename,bytes}` | `NoteReader`、`NotesPanel` |

### 5.9 终端（`apiTerminal.ts`）

| # | 方法 | 路径 | 请求 | 响应 | 使用方 |
| --- | --- | --- | --- | --- | --- |
| 64 | POST | `/api/projects/{id}/terminal/run` | `{command, cwd?}` → **SSE** | `start`/`output`/`exit`/`error`/`done` | `TerminalPanel` |
| 65 | GET | `/api/projects/{id}/terminal/history` | — | `{items: TerminalHistoryItem[]}` | `TerminalPanel` |
| 66 | POST | `/api/projects/{id}/terminal/cancel` | — | `{cancelled: number}` | `TerminalPanel.stop` |

### 5.10 外部

| # | 方法 | 路径 | 用途 |
| --- | --- | --- | --- |
| — | GET | `https://api.github.com/repos/ctianye/CodeSlice/releases/latest` | `lib/releases.ts:4` 检查更新（`Accept: application/vnd.github+json`，CSP `connect-src` 已放行） |

### 5.11 契约观察（对 DSH 对接有直接价值）

1. **SSE 帧格式是「自定义 JSON-in-data」**：`parseFrame`（`api.ts:525-545`）只认 `data:` 行，**完全忽略 `event:` 行**，事件类型由 JSON 体内的 `type` 字段决定。任何重写客户端必须照此实现，否则事件全丢。
2. **错误既可能是 HTTP 状态，也可能是 200 流里的 `error` 帧**。`postJsonSse` 把前者也转成后者（`api.ts:467-471`），所以**客户端只需一种失败处理**——这个语义必须在 DSH 插件里保留。
3. **6 条 SSE 全部是 `POST`**，因此都不能用 `EventSource`，必须 `fetch` + 手工读流。
4. **三份几乎相同的 SSE 解析实现**：`api.ts:448-545`、`apiTerminal.ts:141-261`。差异仅在事件联合类型和是否走 handlers 回调。
5. **`{ok: true}` / `{items: [...]}` 两种包裹风格并存**：删除类用前者，历史列表用后者，其余直接返回数组或对象。
6. **健康检查外的所有端点都要令牌**。令牌来源见 §2.5。
7. **`node://` 与 `note://` 两种伪 schema**：笔记在图谱/检索里用 `path = "note://<id>"`（`CitationChip.tsx:12-18`、`FilePanel.tsx:60`）。对接时必须实现这两个前缀的解析。

---

## 6. 代码质量与问题

### 6.1 类型安全：良好（推翻了「`any` 泛滥」的假设）

`tsconfig.app.json` 开启了 `strict`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`。

**grep 全文：没有任何 `: any`、`as any`、`<any>`、`any[]`。**（唯一命中的 `any` 都出现在英文注释里的单词 "any"。）

真正的类型逃生口是 `as unknown as T`，共 6 处，全部集中在 SSE 解析里：

| 位置 | 用途 |
| --- | --- |
| `api.ts:463` | 连接失败 → 伪造 `{type:'error'}` |
| `api.ts:469` | 非 2xx → 伪造 `{type:'error'}` |
| `api.ts:473` | 无 body → 伪造 `{type:'error'}` |
| `api.ts:501` | 读流异常 → 伪造 `{type:'error'}` |
| `api.ts:538` | 无 `type` 字段 → 伪造 `{type:'unknown'}` |
| `api.ts:541` | JSON 解析失败 → 伪造 `{type:'unknown', raw: payload}` |

**评价**：这 6 处是**不可避免**的（泛型 generator 需要把错误注入事件流），且全部集中在 60 行的单一函数里。这是可以用注释解释的、有边界的逃生口，不是「泛滥」。

**但存在类型退化（真正的可改进点）：**

| 位置 | 问题 |
| --- | --- |
| `types.ts:391` | `kind: GraphNodeKind \| string` —— 并上 `string` 后联合完全失效 |
| `types.ts:647` | `confidence: string`，注释说取值是 `EXTRACTED/INFERRED/AMBIGUOUS/EXACT`，但没建模成联合 |
| `types.ts:666,668` | `from_kind: string \| null`、`confidence: string \| null` |
| `graphMeta.ts:12,32,43` | 三个 `Record<string, string>` 词表，键不受 `GraphRelation` 约束 |
| `graphTheme.ts:58` | `edgeStyle(relation: string)` |
| `graphFilter.ts:39` | `nodeHidden(node: GraphNode, ...)` 靠 `kind === 'rationale'` 字符串比较 |

也就是说：`GraphRelation`/`GraphNodeKind`/`GraphConfidence` 这三个精心定义的联合（`types.ts:385-442`）**在运行时被 `| string` 削弱成纯文档**。这是个明确的、低成本的改进项（去掉 `| string` 后可让 TS 在 6 处暴露遗漏分支）。

### 6.2 架构级反模式：「在 updater 里调用 `setState`」

这是**全项目最系统性、也最值得优先修的问题**。`main.tsx:26` 用了 `<StrictMode>`，而 React 在开发模式下会**双调用 state updater 函数**以暴露副作用。

共 **7 处**：

| 位置 | 外层 updater | 内部调用的 setState |
| --- | --- | --- |
| `AppState.tsx:203-220` | `setProjectState` | `setActiveConversationIdState` / `setTabs` / `setActiveTabIndex` / `setCitationHighlight` / `setNavHistory` / `setNavIndex` |
| `:231-246` | `setTabs` | `setActiveTabIndex` |
| `:280-299` | `setNavHistory`（在 `navigateTo`） | `setNavIndex` |
| `:342-354` | `setTabs`（`closeTab`） | `setActiveTabIndex` |
| `:356-363` | `setTabs`（`closeOtherTabs`） | `setActiveTabIndex` |
| `:365-380` | `setTabs`（`moveTab`） | `setActiveTabIndex` |
| `:411-439` | `setTabs`（`openNoteView`） | `setActiveTabIndex` |
| `:460-480` | `setTabs`（`openGraph`） | `setActiveTabIndex` |

**为什么现在还没炸**：所有内部调用用的都是**常量或纯函数计算出的值**（`setActiveTabIndex(0)`、`setActiveTabIndex(existing)`），因此双调用是幂等的。

**风险**（三方面）：

1. **React 的官方约束**：updater 必须是纯函数。当前代码依赖「恰好幂等」而不是「设计上纯」。
2. **并发渲染**：这些 updater 可能在 render 阶段被调用（`setProjectState` 的 updater 尤其如此），此时内部的 `setTabs` 就成了「render 期间更新另一个 state」——React 只在同组件、确定性条件下容忍，一旦将来引入 `useTransition` / `startTransition` 就会产生难以定位的重渲染或撕裂。
3. **`navigateTo` 的闭包陷阱**（`:280-299`）：`navigateTo` 的 `useCallback` 依赖 `[navIndex, showNavEntry]`，而 updater 内部又用闭包里的 `navIndex` 计算 `base`，同时 `setNavIndex(...)` 传入基于同一闭包的 `base.length - 1`。快速连点前进/后退时，闭包 `navIndex` 可能已过期 → 历史索引错位。

**建议**：把这些操作改成 reducer（`useReducer` 管 `{tabs, activeTabIndex}` 与 `{navHistory, navIndex}` 两个原子状态），一次 dispatch 同时改两个字段。这是纯重构，对外 API 不变。

### 6.3 `App.tsx:105-112` 的疑似功能缺陷

```tsx
const openFileList = () => {
  try { localStorage.setItem('codeslice.sidebarTab', JSON.stringify('files')) } catch {}
  setSidebarEpoch(n => n + 1)      // 让 <Sidebar key={sidebarEpoch}> 重挂
}
```

问题链：

1. `Sidebar` 的当前 tab 来自 `useApp().sidebarTab`（`Sidebar.tsx:30`），即 `AppState` 里的 `storedSidebarTab` state。
2. `storedSidebarTab` 的初值由 `usePersistedState` 在 **`AppProvider` 首次挂载时**从 localStorage 读一次（`hooks/useAsync.ts:8-16`）。
3. 重挂 `<Sidebar>` **不会**重挂 `AppProvider`，所以 `storedSidebarTab` 保持旧值。
4. 结论：写 localStorage 对 UI 无效果，`setSidebarEpoch` 只是无谓地重挂文件树/对话列表（并丢掉它们的局部展开状态）。

**这段的意图注释写得很明确**（`:104`）：「Ask the sidebar to show the file tab again」，即应该是 `setSidebarTab('files')`。把它改成一行 `const { setSidebarTab } = useApp(); setSidebarTab('files')` 即可，同时可以删掉 `sidebarEpoch` 和 `key`。

**限制说明**：这是静态阅读推断，未运行应用验证。但状态流向是确定的，不存在运行时分支能改变结论。

### 6.4 重复代码

| 重复项 | 位置 | 说明 |
| --- | --- | --- |
| SSE 帧解析 | `api.ts:517-545` vs `apiTerminal.ts:141-165` | `findFrameEnd` / `parseFrame` 几乎逐字节相同 |
| 错误体解析 | `api.ts:58-90` vs `apiTerminal.ts:76-101` | 都在处理 FastAPI 的 `{detail: string \| array}` |
| 认证 header | `api.ts:92-97` vs `apiTerminal.ts:68-73` | 完全相同 |
| 阶段中文标签 | `useChatStream.ts:6-14` vs `lib/stages.ts:3-11` | 两份 `STAGE_LABELS`；**`lib/stages.ts` 完全未被引用**（`stageLabel` 零调用点） |
| 错误消息归一 | 20+ 处 `err instanceof Error ? err.message : String(err)` | 可提取 `errorText(err)` |
| 弹窗三件套 | `window.confirm`×5（`ConversationList:176`、`NotesPanel:168,179`、`NoteReader:120`、`CommandRulesPanel:71`、`SettingsModal:218`）、`window.alert`×1（`ConversationList:182`）、`window.prompt`×1（`NotesPanel:157`） | 无统一 Dialog 组件 |
| `baseName` 逻辑 | `lib/citations.ts:22-24` 与 `format.ts:85` 各自 `path.split(/[\\/]/).pop()` | 轻微 |

### 6.5 过大的文件与组件

| 文件 | 行数 | 症结 |
| --- | --- | --- |
| `CodePane.tsx` | 1396 | 单组件 7 类职责；20 `useState` + 14 `useRef`；10 个 `useEffect` |
| `styles/graph.css` | 1364 | 单图谱视图的样式，无拆分 |
| `styles/sidebar.css` | 1168 | 三个面板 + 树 + 卡片 + 搜索全在一处 |
| `styles/chat.css` | 924 | 包含 diff、approval、activity、citation、markdown 子样式 |
| `NotesPanel.tsx` | 733 | 知识库 + 文件夹 CRUD + 笔记 CRUD + 移动菜单 + 排序 + 过滤 |
| `SettingsModal.tsx` | 543 | 4 个 tab + 内嵌 `ModelSettingsForm`(312 行) + `AboutPanel`(108 行) |
| `Markdown.tsx` | 537 | 解析器 + 渲染器 + tokenizer 强行放一个文件（可拆 3 个） |

`CodePane` 的可拆建议（按内聚性）：

| 抽出模块 | 大致行数 | 边界 |
| --- | --- | --- |
| `useMonacoDecorations` | ~180 | 5 个 collection 的 effect + decoration 生成调用 |
| `useEditorSelection` | ~120 | `selection`/`picked`/`applyLinePick`/`scheduleSelection`/鼠标抑制 |
| `useDocDraft` | ~120 | `docEditing`/`docDraft`/`docDraftsRef`/`saveDoc`/Ctrl+S |
| `useCodeNavigation` | ~150 | `goToDefinitionAt`/`showReferencesAt`/`navPicker`/`navNotice`/`navBusyRef` |
| `useAnnotations` | ~120 | 批注草稿/保存/展开/删除 |
| `EditorToolbar` | ~120 | toolbar JSX |
| `SelectionBar` | ~120 | 三种 selection bar 的 JSX（内部已高度重复，见 §6.9） |

### 6.6 性能隐患（按影响排序）

| # | 问题 | 位置 | 影响 |
| --- | --- | --- | --- |
| 1 | **每个 SSE token 一次 `setState`**，`await` 打断 React 批处理 | `useChatStream.ts:120-127` | 20 tok/s → 20 次/秒整树渲染 |
| 2 | **Markdown 每次 text 变化全量重解析** | `Markdown.tsx:40` | 长回答 O(n²) 累计（n 次解析 × O(n) 扫描） |
| 3 | **`AppState` 单 Context 全量广播**（40 项依赖） | `AppState.tsx:499-587` | 改主题/宽度也会重渲染文件树与编辑区 |
| 4 | **GraphView 每次挂载无条件重拉整个图谱 payload** | `GraphView.tsx:116-143` | 2k 节点图每次切 tab 都重传；`refreshKey`（聊天结束即变）也会触发 |
| 5 | **`applyLabels` 每次 zoom 帧更新全部节点** | `GraphCanvas.tsx:125-137` | 2000 节点 = 每帧 2000 次 DataSet 更新 |
| 6 | **边数据每次筛选全量重建**，且每条边/节点都 `document.createElement` 做 tooltip | `GraphCanvas.tsx:329-383` | `edges.clear()` + `add()`；2000 节点 + 4000 边 = 6000 个 DOM 元素/次 |
| 7 | **`CodePane` 每次渲染 `content.split('\n')`** | `CodePane.tsx:598-601`、`:1384-1387` | 万行文件每次渲染生成万级数组 |
| 8 | **`saveGraphLayout` 在每个 `dragEnd` 触发** | `GraphCanvas.tsx:300-304` | 拖 N 个节点 = N 次全量坐标 PUT |
| 9 | **索引状态 5s 空转轮询** | `useIndexJob.ts:19,54` | 空闲时 12 req/min |
| 10 | **`frameDecorations` 每行一条 decoration** | `decorations.ts:41-45`（有 400 行上限兜底） | 400 行范围 = 400 条 decoration |

**已做的优化（值得肯定）**：

- `occurrencesHighlight: 'off'`、`selectionHighlight: false`、`matchBrackets: 'never'`（`CodeViewer.tsx:81-83`），注释说明这是拖动卡顿的根因。
- `minimap: {enabled:false}`、`scrollBeyondLastLine: false`、`hideEdgesOnDrag: true`。
- 选区更新 rAF 合帧 + `mouseSelectingRef` 抑制（`CodePane.tsx:263-311`）。
- `renderWhitespace: 'selection'`（而不是 `'all'`）。
- 图谱稳定后立即 `physics.enabled = false`（`GraphCanvas.tsx:276`）。
- 终端 `MAX_LINES = 2000` 上限。
- `ConversationCards` 每组最多 3 条（`MAX_VISIBLE`），`RelationSection` 每组最多 60 条（`MAX_ROWS`），搜索最多 30 条（`GraphView.tsx:206`）。

### 6.7 错误处理

**做得好的**：

- `ApiError` 是 class（`api.ts:45-55`），带 `status` + `detail`，可 `instanceof` 判断。
- 422 的数组型 detail 被拼成可读字符串（`api.ts:58-76`）。
- SSE 错误统一成事件，只留一个失败通道（见 §4.4）。
- `saveFile` 的冲突检测（`expected_mtime`）会在 UI 上翻译成中文（`CodePane.tsx:1350-1368`）。这是**竞态安全**的正确做法。
- `postJsonSse` / `runTerminal` 都正确处理了 `signal.aborted` 时不再 yield。

**缺口**：

1. **静默吞异常过多**。代表性几处：

   | 位置 | 吞掉的错误 |
   | --- | --- |
   | `CodePane.tsx:1389-1396` `getGitStatusSafe` | git 失败 → 返回 null，UI 上只是没有徽标 |
   | `GraphView.tsx:314-316` `saveGraphLayout` | 布局持久化失败完全无声 |
   | `NoteReader.tsx:44-46` `listNoteFolders` | 「the picker simply stays empty」 |
   | `TerminalPanel.tsx:96-98, 120-122` 历史 | 「the count is cosmetic」 |
   | `App.tsx:57, 85-87` | 更新检查 / 恢复项目失败静默 |
   | `bridge.ts:51-54, 59-62` | localStorage 不可用时静默 |

   其中**布局持久化静默失败**最值得改：用户会以为坐标保存了，实际每次都要重跑 20s 布局。
2. **`window.alert` 用在了删除对话失败上**（`ConversationList.tsx:182`），与其余地方的 `ErrorNote` 内联提示不一致。
3. **没有全局 error boundary**。任一组件 render 抛错会让整个应用白屏。`CodePane` 这种 1400 行组件里出错的风险不低。
4. **`useAsync` 的 error 是字符串**（`useAsync.ts:70`），丢失了 `ApiError.status`，无法做「401 → 提示填令牌」这类状态区分。

### 6.8 CSP 与安全

**结论：整体良好，有几个可记录的点。**

| 项 | 状态 |
| --- | --- |
| XSS 注入点 | **无**。全文无 `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `new Function`（grep 确认）。Markdown 是 React 元素构造，天然转义 |
| 外部链接 | `rel="noreferrer noopener"` + `target="_blank"`（`Markdown.tsx:519`）✓ |
| `openExternal` | Electron 走 shell；浏览器走 `window.open(url,'_blank','noopener,noreferrer')`（`bridge.ts:82`）✓ |
| 路径遍历 | `MarkdownDoc.resolveRelative`（`:67-87`）显式拒绝 `..` 越界、绝对 URL、协议相对 URL、data URI ✓ 这是写得很认真的一个函数 |
| 更新检查 URL 校验 | `githubUrl()`（`releases.ts:41-49`）校验 origin 必须是 `https://github.com` 且 pathname 有前缀 ✓ 防重定向注入 |
| CSP 缺口 | 无 `object-src 'none'`、无 `frame-ancestors 'none'`、无 `base-uri 'self'` |
| 令牌进 URL | `assetUrl` 把 token 放 query string（`api.ts:183-188`）—— 会进历史/日志 |
| 令牌进 bundle | `VITE_SESSION_TOKEN` 会被静态替换进产物（`bridge.ts:48`） |
| 令牌进 localStorage | `codeslice.devToken` 明文（`bridge.ts:38, 57-63`） |
| 本地服务鉴权模型 | 单令牌 header，无 CSRF 防护。对 `127.0.0.1` 绑定 + 令牌的本地服务，风险可接受；但**若浏览器本身可访问该端口，任意网页都能发请求**（CORS 是否限制，**未确认**，属后端） |

### 6.9 可维护性 / 一致性

1. **三种 selection bar 的 JSX 高度重复**（`CodePane.tsx:1081-1202`）：`picked` / `selection` / `citationRange` 三个分支各写了约 40 行几乎相同的按钮组（就这段提问 / 就这段批注 / 在图谱中定位 / 清除）。可合并为一个 `<SelectionBar label code onAsk onAnnotate onLocate onClear />`。
2. **无 ESLint**。`package.json` 的 devDependencies 里没有 eslint，仓库也没有 `.eslintrc*` / `eslint.config.*`。但代码里有 4 处 `// eslint-disable-next-line react-hooks/exhaustive-deps`（`useAsync.ts:74`、`App.tsx:91`、`ChatPane.tsx:106`、`GraphCanvas.tsx:317`）——**这些注释在没有任何 linter 的情况下是纯噪音**，且它们掩盖的正是最需要审查的依赖数组问题。建议：要么加 ESLint（`eslint-plugin-react-hooks`），要么删掉注释。
3. **`useAsync` 的 deps 用展开**（`useAsync.ts:75`：`}, [...deps, enabled, nonce])`）——依赖数组长度动态变化，违反 Hooks 规则的字面要求（React 只警告不报错）。这是 `eslint-disable` 的真实来源。
4. **裸元素 CSS 选择器与全局类名**（详见 §7.2）——这也是最大的可维护性问题：`.icon`、`.row`、`.title`、`.body`、`.label`、`.count`、`.path`、`.name`、`.meta`、`.actions`、`.spacer`、`.muted`、`.tag`、`.badge`、`.dot` 全都是**未加前缀的通用名**，在单应用内靠自觉避免冲突。
5. **硬编码的「双源真相」有 5 处**：
   - `ZONE_HEIGHT = 19`（`frameZones.ts:30`）↔ `.range-zone{height:19px}`（`editor.css:635`）
   - `NARROW_GRAPH_WIDTH = 760`（`GraphView.tsx:37`）↔ `@container graph (max-width:760px)`（`graph.css:1298`）
   - Monaco 主题色（`CodeViewer.tsx:113-154`）↔ CSS 变量（`base.css:7-73`）—— 注释明确承认「the two hex sets are kept in sync by hand」
   - `graph.css:10` 的注释图（`1fr canvas | 332px rail`）↔ `.graph-body{grid-template-columns: minmax(0,1fr) 332px}`
   - `lib/releases.ts` 的仓库 slug（`ctianye/CodeSlice`）↔ `package.json` 无对应字段
6. **样式导入策略不一致**：12 个在 `main.tsx`，`terminal.css` 在组件内（`TerminalPanel.tsx:9`）。
7. **注释质量很高**——这是本项目最突出的优点。几乎每个非显然的决策都有「为什么」而不只是「是什么」，且大量注释记录了**从真实 bug 反推出来的原因**（例如 `CodePane.tsx:256-262`、`gutterSelection.ts:26-32`、`GraphCanvas.tsx:293-297`）。这对后续维护价值极大，**迁移时应保留这些注释**。

### 6.10 可测试性

| 维度 | 现状 |
| --- | --- |
| 测试框架 | **无**。无 vitest / jest / playwright，无 `tests/` 目录（`package.json:12` 的 `test:graph` 指向不存在的路径） |
| 易测的纯函数 | 其实不少：`graphFilter.filterGraph`、`graphMeta.*`、`graphRelations.groupConnections`、`graphTheme.edgeStyle`、`Markdown.resolveRelative`、`lib/citations.*`、`lib/format.*`、`lib/releases.compareVersions`、`decorations.frameDecorations`、`codeNavigation` 的路径匹配 |
| 难测的部分 | 所有网络交互都**直接 `fetch`**，没有注入点。要测 `useChatStream` / `useAsync` 必须 mock 全局 `fetch` |
| 建议 | `api.ts` / `apiTerminal.ts` 抽出「transport」接口（`{request, stream}`），测试时注入 fake。这样 66 个端点的契约可以一次性用 mock 覆盖 |
| 最高价值的首批测试 | `compareVersions`（有 SemVer 边界）、`resolveRelative`（有安全边界）、`filterGraph`（纯函数 + 筛选正确性）、`frameDecorations`（重叠合并）、`groupConnections`（分桶正确性） |

---

## 7. 改造成 DSH Web 插件的前端可行性评估

### 7.0 前提与未确认项

本节基于以下理解：DSH（DeepSeek Harness）Web GUI 是 React 应用，插件分 client 半（浏览器内渲染，挂载到 slot）与 host 半（Node 侧，可访问本机进程）。**以下几点未确认，会显著影响结论：**

| # | 未确认项 | 影响 |
| --- | --- | --- |
| U1 | DSH Web 的 CSP 是否允许插件连 `http://127.0.0.1:<port>` | 若不允许，必须由 host 半反代（工作量 +1~2 天） |
| U2 | DSH 插件是否支持同一插件多实例/多面板 | 若支持，现有模块级单例会互相污染（见 §7.4） |
| U3 | 插件 UI 是 iframe 隔离还是同 DOM 直挂 | 同 DOM 则 §7.2 的 CSS 冲突是 P0；iframe 则可直接忽略 |
| U4 | 后端 FastAPI 是否已配置 CORS | 浏览器直连跨源必需；未配置则需前端或 host 侧代理 |
| U5 | DSH 是否提供「选择本地目录」能力 | 缺失则只能用 `WelcomePage` 已有的手输路径降级 |

### 7.1 可以直接复用的部分（约 70% 代码量）

**结论：UI 逻辑层几乎可整体搬移。** 依据：

1. **零 `any`、strict TS、显式类型契约**——迁到另一个 React+TS 工程不会有类型阻碍。
2. **Electron 接触面极窄（8 个成员 / 5 个文件）**，且已内建浏览器降级（§2.5）。`isDesktop === false` 的分支已经在开发中真实跑过（Vite dev 就是浏览器模式）。
3. **Monaco 与 vis-network 都是纯浏览器库**，不依赖 Node。

| 模块 | 迁移难度 | 说明 |
| --- | --- | --- |
| `Markdown.tsx` + `MarkdownDoc.tsx` | ★ 直接复用 | 零依赖手写解析器；只需把 `resolveImage` 的 `assetUrl` 换掉 |
| `decorations.ts` / `frameZones.ts` / `gutterSelection.ts` | ★ 直接复用 | 纯 Monaco API，与宿主无关（`frameZones` 的高度常量需与迁移后的 CSS 对齐） |
| `graph/*` 全部 9 个文件 | ★ 直接复用（除缓存单例） | `vis-network/standalone` 无外部依赖；`graphFilter`/`graphMeta`/`graphRelations`/`graphTheme` 是纯函数 |
| `types.ts`（693 行） | ★ 直接复用 | 就是契约文档，改造成插件 SDK 类型的基底 |
| `lib/*` 4 个文件 | ★ 直接复用 | 纯函数 |
| `Feedback` / `Icon` / `Splitter` / `NavPicker` / `ApprovalCard` / `CitationChip` / `MessageBubble` / `StreamingBubble` / `ConversationCards` / `Composer` | ★ 直接复用 | 全受控组件，只依赖 props |
| `useChatStream` / `useAsync` / `useIndexJob` | ☆ 小改 | 需替换 `fetch` 的 base URL 与 token 来源 |
| `AppState` | ◐ 中改 | 见 §7.5 |
| `CodePane` / `NotesPanel` / `SettingsModal` / `ChatPane` | ◐ 中改 | 需要拆解（§6.5），并替换 `window.confirm/prompt/alert` |
| `TopBar` | ✖ 重写 | 窗口控制与 `-webkit-app-region: drag` 无意义 |
| `bridge.ts` | ✖ 重写 | 换成插件 transport |
| 全部 13 个 CSS | ✖ 需大幅改造 | 见 §7.2 |

### 7.2 CSS：这是最大的迁移障碍（P0）

`styles/` 13 个文件 7,175 行，是**为「独占整个文档」的应用写的**，直接放进宿主页面会造成全局污染。

**具体污染清单：**

| 类型 | 位置 | 后果 |
| --- | --- | --- |
| 裸元素选择器 | `base.css:166-202` `button{}`、`:267-283` `input,textarea,select{}`、`:331-338` `a{}`、`:340-344` `code,pre,kbd{}` | **重设宿主所有按钮/输入框/链接** |
| `:root` 变量 | `base.css:7-73` 定义 40+ 变量（`--bg`、`--text`、`--accent`…）；`editor.css:449-463` 再次在 `:root` 上定义 `--selection-bg` 等 | 与宿主 token 冲突 |
| `:root` 属性选择器 | `base.css:75` `:root[data-theme='light']`；运行时由 `AppState.tsx:199-201` 写 `document.documentElement.dataset.theme` | **直接改写宿主的 `<html>` 属性** |
| `color-scheme` | `base.css:8,76` | 影响宿主原生控件主题 |
| `body` / `html` / `#root` | `base.css:122-138`：`height:100%`、`overflow:hidden`、`font-size:13px`、`body{background}` | **宿主滚动条消失** |
| 滚动条 | `base.css:364-384` `::-webkit-scrollbar` 全套 | 宿主全站滚动条被改 |
| 选区 | `base.css:139-142` `::selection` | 宿主全站选区色被改 |
| 焦点环 | `base.css:154-162` `:focus{}` + `:focus-visible{}` | 宿主全站焦点样式被改 |
| **全局动效重置** | `base.css:519-528` `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.001ms !important; transition-duration:.001ms !important } }` | **`!important` + 通用选择器，会杀死宿主所有动画** |
| 通用类名 | `.icon`、`.row`、`.title`、`.body`、`.label`、`.count`、`.path`、`.name`、`.meta`、`.actions`、`.spacer`、`.muted`、`.tag`、`.badge`、`.dot`、`.truncate`、`.mono`、`.small`、`.primary`、`.ghost`、`.danger`（`base.css:388-515` 等） | 与宿主/Monaco 自身类名碰撞 |

**三种改造方案：**

| 方案 | 做法 | 工作量 | 风险 |
| --- | --- | --- | --- |
| A. 作用域前缀 | 所有选择器加 `.codeslice-root` 前缀；删除 `html/body/#root`、`::selection`、`::-webkit-scrollbar`、`@media *` 重置；token 改名加前缀 `--cs-*`；主题从 `:root[data-theme]` 改为 `.codeslice-root[data-theme]` | **中（2-3 天，机械但量大）** | 低。可脚本化改写 + 目视回归 |
| B. CSS Modules | 每个组件配 `.module.css`，类名自动 hash | **大（5-8 天）** | 中。需要改 40+ 处 `className` 拼接逻辑 |
| C. iframe / Shadow DOM 隔离 | 把整个应用塞进 iframe 或 shadow root，CSS 原样不动 | **小（0.5-1 天）** | 高。iframe 下 `document`、焦点、`window.confirm`、Monaco 布局、拖拽全部受影响；Shadow DOM 下 Monaco 的 `fixedOverflowWidgets` 与 `ResizeObserver` 需验证（**未确认**） |

**推荐方案 A**。理由：本项目 CSS 已经是「token 化 + 语义类名」的结构（`base.css` 的注释就写着「Every colour is a semantic token so a component never hard-codes a hex value」），加前缀是低风险机械改造；而方案 C 会让 Monaco 这个已经调好一堆布局 hack 的组件（`CodePane.tsx:387-407` 的三次定时 layout + ResizeObserver）重新变得不可预测。

### 7.3 Monaco 与 DSH Web 的兼容性

| 关注点 | 结论 | 依据 |
| --- | --- | --- |
| 能否在浏览器里跑 | **能**，无 Node 依赖 | `monaco-editor@0.52.2` 是纯前端包 |
| 加载方式必须改 | **是**。现在靠 `public/monaco/vs` + AMD loader（`CodeViewer.tsx:10`、`copy-monaco.mjs`）——这是「Electron 内相对路径静态文件」的方案 | DSH 插件通常走构建工具打包，需要改成 `import * as monaco from 'monaco-editor'` + `vite-plugin-monaco-editor`，或 `@monaco-editor/react` 的 `loader.config({ monaco })` 直接注入 ESM 实例 |
| 与宿主是否可能双实例 | **存在风险**。Monaco 是全局单例（`loader`、`registerHoverProvider`、主题注册都挂在模块级） | 若 DSH 自身或其他插件也用 Monaco，会共享 `loader` 与语言注册表。`codeNavigation.ts:19` 的 `let registered = false` 是**模块级**，跨插件实例不共享 → 多实例会重复注册（或反过来被第一个实例的守卫挡住） |
| 主题 | **需要适配**。现在写死两套 hex（`CodeViewer.tsx:113-154`），由 `codeslice-dark` / `codeslice-light` 切换 | 建议改为从 DSH 主题 token 生成 `monaco.editor.defineTheme`，避免手抄两份颜色 |
| Worker | **需要 CSP 放行**。`index.html:10` 有 `worker-src 'self' blob:` | DSH 页面若无此指令，Monaco 的 ts/json/css worker 会失败并退化为同步（卡 UI） |
| 布局 hacks 可保留 | 是。`automaticLayout` + 三次定时 layout + `ResizeObserver`（`CodePane.tsx:387-407`）是为「面板尺寸在挂载时不稳定」写的，插件场景下同样需要 | — |
| 无需 Electron 特性 | 是。未用 `webview`、`ipc`、文件系统 API | — |

**判定：Monaco 完全可行，工作量集中在「加载方式 + 主题 + 语言注册单例」三点，约 1-2 天。**

### 7.4 必须重做的部分

| 项 | 现状 | 重做方案 | 工作量 |
| --- | --- | --- | --- |
| **窗口控制** | `TopBar.tsx:68-98` 自绘最小化/最大化/关闭；`layout.css:25,32` 用 `-webkit-app-region: drag` 做无边框拖拽 | 删除整个 `.window-controls` 块与 `-webkit-app-region`；TopBar 退化为普通工具条 | 0.5 天 |
| **`bridge.ts`** | 8 个成员 | 替换为插件 transport：`apiBase` 改为 host 半提供的基址（或同源反代路径）；`token` 由 host 半注入或用户手填（`WelcomePage` 的输入 UI 已在）；`pickFolder` 用 DSH 能力或保留手输；`openExternal` 用 `window.open`（已有降级） | 1 天 + U1/U5 待确认 |
| **`window.confirm` / `alert` / `prompt`** | 7 处 | 统一抽 `<ConfirmDialog>` / `<PromptDialog>`（或在 DSH 有对应 API 时用之）。**在 iframe 里 `window.confirm` 可能被沙箱屏蔽** | 0.5 天 |
| **主题注入方式** | 写 `document.documentElement.dataset.theme`（`AppState.tsx:199-201`） | 改为写容器元素 + CSS 变量前缀；或接 DSH 的 theme service | 0.5 天 |
| **`localStorage` key** | 10 个 `codeslice.*` 无实例隔离 | 加实例/工作区前缀，否则两个面板共享宽度/主题/当前对话 | 0.5 天 |
| **跨源 + CORS** | `apiBase()` 现在依赖同源或 Electron 注入 | 浏览器直连 `127.0.0.1:8021` 是跨源请求。选项：(a) 后端加 CORS（后端事）；(b) DSH host 半做反代，插件走同源相对路径（**推荐**，顺便解决令牌注入与 U3 里的 CSP） | 1-2 天 + U4 |
| **模块级单例** | `graphCache.ts:20`（Map）、`GraphCanvas.tsx:71`（POSITION_CACHE）、`codeNavigation.ts:18-22`（context/hoverCache/registered）、`useChatStream.ts:44`（activitySeq）、`EditorTabs` 的 `POSITION_CACHE_MAX` | 改成 per-instance（Context 或闭包工厂）。**若 U2 为「不支持多实例」则可降级为 P2** | 1 天 |

### 7.5 状态管理如何迁移

**现状**：单个 `AppProvider`（596 行，40 字段，全量广播）包住整个应用。

**推荐分三步，都是渐进式、可独立验证的：**

**步骤 1（必做，1 天）：把 `AppState` 拆成 4 个 Context**

| Context | 内容 | 变化频率 |
| --- | --- | --- |
| `WorkspaceContext` | `project`、`projects`、`setProject` | 低 |
| `TabsContext` | `tabs`、`activeTabIndex` + 6 个操作 + 3 个投影（`openFile`/`noteView`/`graphScope`） | 中 |
| `UiContext` | `theme`、`sidebarTab`、`focusNoteId`、`refreshKey`、`citationHighlight`、`navHistory/navIndex` | 中 |
| `ChatContext` | `activeConversationId`、`graphAsk`、`conversationFocusNonce` | 中 |

这一步**同时解决 §6.6 的第 3 条性能问题**，且对外 API 可保持不变（`useApp()` 内部合并四个 hook 返回值），改动面最小。

**步骤 2（建议，1 天）：把 `tabs` 与 `navHistory` 改成 `useReducer`**

一次 dispatch 同时改 `tabs + activeTabIndex`，彻底消除 §6.2 的 7 处「updater 内 setState」。reducer 是纯函数，还能直接单测（补上 §6.10 的测试缺口）。

**步骤 3（可选）：引入订阅式 store**

若 DSH 侧已有 zustand/jotai 之类的 store，可把上述 4 个 Context 换成一个 store + selector，获得按字段订阅。**但不要现在做**——第 1、2 步已经能拿到 90% 的收益，而 store 化会让 1400 行的 `CodePane` 需要大规模改写 `useApp()` 调用点。

**不要做的事**：不要试图把 `CodePane` 的 20 个 `useState` 搬进全局 store。它们绝大多数是**编辑器的局部 UI 状态**（`ready`、`hoverRange`、`navPicker`…），搬进全局只会让广播问题更严重。

### 7.6 后端对接在插件架构下的形态

当前前端与后端是「浏览器 ⇄ 本机 FastAPI」的直连。改造后有三种形态：

| 形态 | 数据路径 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A. host 半反代（推荐）** | 插件 client → DSH host → `127.0.0.1:8021` | 无 CORS 问题；令牌不落浏览器；可用 DSH 的鉴权；**SSE 需要 host 侧做流式透传**（Node 侧 `fetch` + 读流转发，可行） | host 半要写一层 66 端点的透明代理（或一个通配路由） |
| B. 浏览器直连 | 插件 client → `127.0.0.1:8021` | 最简单，`api.ts` 一行都不用改（只改 `apiBase()`） | 必须后端配 CORS 且放行 `X-Session-Token`；令牌下发要有机制；CSP 要放行（U1） |
| C. 迁进 host 半 | 插件 host → 直接调用后端的 Python 进程 / 或重写为 DSH tool | 最彻底，可去掉一层 HTTP | 工作量最大，且失去「本机 FastAPI 独立可跑」的价值 |

**推荐 A**，并把 `api.ts` 的 `apiBase()` 改为返回 host 提供的同源前缀（如 `/plugins/codeslice/api`）。这样 **`api.ts` 的 66 个端点定义、`postJsonSse` 的 60 行解析逻辑一行都不用改**——这是最高杠杆的单点改动。

**SSE 反代的关键约束**（写实现时必须注意）：

1. 必须**逐帧 flush**，不能缓冲整个响应（否则流式彻底失效）。
2. 必须透传 `Content-Type: text/event-stream` 且**禁用压缩**（gzip 缓冲会破坏流式）。
3. **客户端 abort 必须传导到上游**，否则后端 `runTerminal` 的「关流即杀子进程」语义（`apiTerminal.ts:295-301` 注释）会失效，命令继续跑。
4. 不能改写 `\n\n` 帧分隔（`api.ts:517-523` 容忍 CRLF，但反代不应引入额外换行）。

### 7.7 分阶段实施建议

| 阶段 | 内容 | 交付物 | 预估 |
| --- | --- | --- | --- |
| **P0 可行性验证**（必须先做） | 用一个最小插件挂载 `GraphCanvas`（vis-network）+ `CodeViewer`（Monaco），验证：CSP 放行本地端口、worker 可用、CSS 隔离方案选型、Monaco 不与宿主冲突 | 可运行 demo + 结论记录（解决 U1/U2/U3） | 2-3 天 |
| **P1 CSS 作用域化** | 方案 A：13 个 CSS 加 `.codeslice-root` 前缀、token 改名、删全局重置 | 可在宿主页面共存而不污染的样式 | 2-3 天 |
| **P2 transport 替换** | 新 `transport.ts` 取代 `bridge.ts`；`api.ts`/`apiTerminal.ts` 只改 base 与 header 来源；host 半反代（含 SSE 透传） | 66 端点全部连通 | 2-3 天 |
| **P3 状态拆分** | 4 Context + `useReducer`（§7.5 步骤 1-2） | 无 updater-副作用、广播面缩小 | 2 天 |
| **P4 拆 CodePane** | 按 §6.5 拆 7 个模块 + 复用 `SelectionBar` | 单文件 ≤ 300 行 | 3-4 天 |
| **P5 平台化收尾** | 删窗口控制、替换 `window.confirm/alert/prompt`、localStorage 前缀、主题接 DSH、模块单例 per-instance | 插件化完成 | 2 天 |
| **P6 测试补齐** | `compareVersions` / `resolveRelative` / `filterGraph` / `frameDecorations` / `groupConnections` 单测 + `useChatStream` 的 mock-transport 测试 | 有回归网 | 2-3 天 |
| **合计** | | | **约 15-20 人天**（不含后端 CORS/反代的后端侧工作） |

### 7.8 一句话结论

**这个前端可以迁移，但不能"搬过去就跑"。**

- **能直接搬的（约 70%）**：所有展示组件、Markdown 渲染器、三个 Monaco 装饰模块、整个图谱模块（除缓存单例）、全部类型定义与纯函数库。这些代码质量高于平均水平，注释尤其出色。
- **必须改的（约 30%）**：CSS 作用域（最大工作量）、`bridge` → transport、窗口控制删除、`window.*` 对话框替换、`AppState` 拆分为多 Context、`CodePane` 拆解。
- **最大的单点风险不是代码，而是「跨源 + 令牌 + CSP」这条链**（U1/U4）。建议 P0 阶段**第一件事就是打通「插件里 fetch 一次 127.0.0.1:8021 的 SSE」**——如果这条通不了，整个迁移方案要重新设计（改走 host 半）。

---

## 8. 问题优先级清单

| P | 问题 | 位置 | 建议 |
| --- | --- | --- | --- |
| **P0** | CSS 全局污染（裸元素选择器 / `:root` / `body` / `*` + `!important`） | `base.css:118-162, 166-344, 519-528`；`editor.css:449-463` | 加 `.codeslice-root` 作用域前缀，删全局重置 |
| **P0** | `openFileList()` 只写 localStorage，不调 `setSidebarTab` | `App.tsx:105-112` | 改为 `setSidebarTab('files')`，删 `sidebarEpoch` |
| **P0** | 7 处「updater 内 setState」+ StrictMode 双调用 | `AppState.tsx:203,231,280,342,356,365,411,460` | `tabs`/`navHistory` 改 `useReducer` |
| **P1** | 每个 SSE token 一次 setState（无批处理） | `useChatStream.ts:118-127` | 用 buffer + 16ms flush，或 `startTransition` |
| **P1** | Markdown 每 token 全量重解析 | `Markdown.tsx:40` | 流式期间只解析尾部块，或按块 memo |
| **P1** | AppState 40 项依赖全量广播 | `AppState.tsx:499-587` | 拆 4 个 Context |
| **P1** | GraphView 每次挂载无条件重拉全量 payload | `GraphView.tsx:116-143` | 缓存新鲜时跳过 fetch（当前 `isFresh` 只用于徽标） |
| **P1** | `saveGraphLayout` 每次 `dragEnd` 触发 | `GraphCanvas.tsx:300-304` | 防抖（如 800ms 静默后写一次） |
| **P1** | `CodePane` 1396 行 / 20 state / 14 ref | `CodePane.tsx` | 按 §6.5 拆 7 个模块 |
| **P2** | 无全局 error boundary | `main.tsx:25-31` | 加一层 `ErrorBoundary` 包 `<App>` |
| **P2** | 布局持久化静默失败 | `GraphView.tsx:314-316` | 至少 console.warn 或轻提示 |
| **P2** | 类型联合被 `\| string` 削弱 | `types.ts:391,647,666,668`；`graphMeta.ts:12,32,43` | 去掉 `\| string`，让 TS 暴露遗漏分支 |
| **P2** | 三份 SSE 解析实现重复 | `api.ts:448-545` vs `apiTerminal.ts:141-261` | 抽共用 `sseParser.ts` |
| **P2** | `lib/stages.ts` 死代码（`useChatStream` 有副本） | `stages.ts` 全文 | 删文件或统一引用 |
| **P2** | 4 处 `eslint-disable` 但无 ESLint | `useAsync.ts:74` 等 | 加 `eslint-plugin-react-hooks` 或删注释 |
| **P2** | `window.confirm/prompt/alert` 7 处 | 见 §6.4 | 统一 Dialog 组件 |
| **P2** | `.env.local` 含 `VITE_SESSION_TOKEN`，会被编译进 bundle | `.env.local:1`；`bridge.ts:48` | 确认 `.gitignore`；生产构建不应包含 |
| **P2** | 无任何测试 | 全局 | 先补 5 个纯函数的单测（§6.10） |
| **P3** | 三种 selection bar JSX 重复 ~40 行 × 3 | `CodePane.tsx:1081-1202` | 抽 `<SelectionBar>` |
| **P3** | 5 处硬编码「双源真相」（CSS↔TS 常量） | 见 §6.9 第 5 条 | 用 CSS 变量传递或构建期常量 |
| **P3** | 索引空闲 5s 轮询 | `useIndexJob.ts:19` | 空转可降到 30s |
| **P3** | `ResumeBody.note` 从未被发送 | `types.ts:300` | 删除死字段或实现 |
| **P3** | 4 个 API 函数无调用点 | `getGitDiff`/`startIndex`/`getJob`/`getGraphNode` | 确认是预留契约还是死代码 |
| **P3** | 标题映射 `<h1>` → `<h3 class="md-h1">` 命名不一致 | `Markdown.tsx:286-290` | 类名改 `md-h3` 等，或加注释 |
| **P3** | `.env.local` 后端端口 8021 vs vite 兜底 8000 不一致 | `.env.local:2` vs `vite.config.ts:22` | 统一 |
| **P3** | CSP 缺 `object-src` / `base-uri` / `frame-ancestors` | `index.html:10` | 补齐 |
| **P3** | `terminal` 头部硬编码 `./ 项目 #id` 而非真实 cwd | `TerminalPanel.tsx:264-266` | 改文案或接后端真实 cwd |
| **P3** | 渲染期间写 ref（`seed` / `navHandlersRef` / `varsRef`…） | `GraphCanvas.tsx:199-207`；`CodePane.tsx:897-902` | 幂等可接受，但建议移到 effect |

---

## 9. 值得保留的优点（迁移时不要丢）

1. **注释文化**。大量注释记录的是「为什么」和「曾经怎么坏过」，例如 `gutterSelection.ts:26-32`（为什么按行号而非像素判断拖拽）、`GraphCanvas.tsx:293-297`（为什么需要三重稳定兜底）、`CodeViewer.tsx:65-71`（为什么必须关 `selectOnLineNumbers`）。这些是**昂贵的历史信息**，重构时极易被删掉。
2. **SSE 错误单一通道设计**（`api.ts:436-447`）。所有失败（连接、HTTP、读流、帧解析）都是 `{type:'error'}` 事件，调用方只有一个出口。
3. **`expected_mtime` 乐观锁**（`api.ts:157-175` + `CodePane.tsx:647-671`）。写文件前校验 mtime，冲突时给中文提示。本地读写场景下的正确做法。
4. **纯函数化的图谱逻辑**（`graphFilter` / `graphMeta` / `graphRelations` / `graphTheme`）。canvas 只负责画，所有业务判定都在可测的纯函数里。
5. **`MarkdownDoc.resolveRelative` 的路径安全**（`:67-87`）。拒绝协议、拒绝 `//host`、拒绝 `..` 越界。写得很完整。
6. **零依赖图标集**（`Icon.tsx`，55 个手绘 SVG）。省 200KB，符合离线约束。
7. **Monaco 完全本地化**（`copy-monaco.mjs` + `loader.config`）。零 CDN，离线可用。
8. **`useAsync` / `usePersistedState` 的克制**（85 行）。没有引入 react-query/swr，两个小 hook 覆盖全部场景。
9. **`reveal` / `navigateTo` 的语义区分**（`AppState.tsx:81-87`）：前者是「去这里」（重复点击取消高亮），后者是「像 IDE 一样跳转」（重复点击保持高亮 + 入历史栈）。这个区分是对的，而且解释了为什么不能用同一个函数。

---

## 10. 未确认事项汇总

| # | 事项 | 为什么未确认 |
| --- | --- | --- |
| 1 | `desktop/electron/preload.ts` 的真实签名与 `apiBase/token` 的注入方式 | 不在本次审计范围（`desktop/` 属其他任务） |
| 2 | 生产环境是否由主进程追加第二层 CSP | 同上 |
| 3 | 后端 FastAPI 是否配置 CORS、`/api/health` 是否真的免鉴权 | 只读前端，未读后端 |
| 4 | `frontend/.env.local` 是否在 `.gitignore` 中 | 未审计仓库的 git 配置 |
| 5 | 应用运行时是否真的复现 `openFileList` 缺陷 | 未运行应用（只读静态分析）；状态流推断强烈指向缺陷 |
| 6 | `Markdown.tsx` 的 `CITE` 正则 `lastIndex` 竞争是否在并发渲染下实际发生 | 需要运行时验证；当前同步执行路径安全 |
| 7 | `approve_always` 的 `remember_pattern` 是否与 `CommandRulesPanel` 的规则表共用存储 | 语义在后端 |
| 8 | DSH Web 的 CSP / 插件隔离方式 / 多实例支持 | 未确认（U1/U2/U3），需 P0 阶段实测 |
| 9 | `sidebar.css`(1168) / `settings.css`(667) / `doc.css`(311) / `note.css`(269) / `tabs.css`(223) / `welcome.css`(220) / `feedback.css`(176) / `terminal.css`(262) 的完整内容 | 仅抽样阅读，未逐行通读 |
| 10 | `public/monaco/vs/**` 是否为构建产物而非源码 | 从 `copy-monaco.mjs` 与路径结构推断为产物；未比对 git 状态 |
