# CodeSplit 只读审计报告：桌面壳 / 打包 / 测试 / 接口契约

- 审计对象：`D:\CodeSplit`（用户个人项目，**本次只读，未修改任何文件**）
- 审计范围：`desktop/**`（排除 `resources\backend\_internal`）、`packaging/**`、`scripts/dev.ps1`、`backend/tests/**`、`docs/API_CONTRACT.md`、`docs/release-notes-v0.1.0.md`、根目录杂项（`backend/pyproject.toml`、`backend/uv.lock`、`.gitignore`、`.devdata/`、`.codeslice/`、`acl-recovery/`）
- 审计方式：`read` / `grep` / `glob` 静态阅读；`pwsh` 在本会话因沙箱 ACL 不可用，**未执行任何构建或测试**，所有"实测"数字均标注来源
- 产品版本：**0.2.2**（`desktop/package.json:3`、`backend/app/core/config.py:16`、`frontend/package.json:4`、`backend/pyproject.toml:3` 四处一致）

---

## 0. 结论速览（TL;DR）

| # | 结论 | 证据 |
|---|---|---|
| 1 | 桌面壳是**"薄壳 + 强握手"**架构：Electron 只负责窗口 / 原生对话框 / 拉起后端，渲染层完全走 `http://127.0.0.1:<随机端口>`，不用 `file://` | `desktop/electron/main.ts:95-110, 277-284` |
| 2 | 端口/令牌协商靠 **stdout 单行协议** `CODESLICE_READY {"port":…,"token":…}`；开发态反过来靠 3 个环境变量"加入"已跑的后端 | `main.ts:33, 129-209, 117-121`；`packaging/entry_backend.py:181-232` |
| 3 | 安全设置基本到位（`contextIsolation:true` / `nodeIntegration:false` / `sandbox:true` / 无 `will-navigate` 拦截 / 无权限处理器），但**preload 暴露了会话令牌给页面 JS**，且**未拦截导航**是两处可加固点 | `main.ts:246-252`；`preload.ts:30-50` |
| 4 | 构建链路有**三处硬编码平台假设 + 一处版本号漂移风险**：`build_desktop.ps1` 里 `$appVersion='0.2.2'` 兜底常量、`rcedit` 依赖 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`、Linux 只能 `build_linux.sh` 在 Linux 上跑 | `build_desktop.ps1:463-474, 138-147`；`build_linux.sh:1-11`；`electron-builder-linux.yml:25` |
| 5 | 后端包体积已实测：**exe 24.73 MB / 整包 92.4 MB**（打包日志），后端进程冷启需占 ~90 MB 磁盘；安装器 121.2 MB | `.build-backend-022.log:43`；`.build-desktop.log:17,58` |
| 6 | 测试面很宽（23 个文件 / 约 381 个 `def test_`），但**桌面壳零测试、契约文档零自动化校验**，SSE 只有 5 个 HTTP 级用例 | `backend/tests/**`；`docs/API_CONTRACT.md` 无对应测试 |
| 7 | `API_CONTRACT.md` 与代码的一致性问题：**至少 8 条路由未进契约**（navigation 4 条、annotations 3 条、interrupt、ollama/pull GET、notes-graph 系列、graph/build 等），另有 3 处字段名/行为不符 | 见 §5 |

---

## 1. 桌面壳架构

### 1.1 文件清单与职责

| 文件 | 行数 | 职责 |
|---|---|---|
| `desktop/electron/main.ts` | 381 | 主进程：窗口生命周期、后端 spawn / 握手、IPC、单实例锁、退出回收 |
| `desktop/electron/preload.ts` | 52 | `contextBridge.exposeInMainWorld('codeslice', …)`，唯一的渲染层桥 |
| `desktop/electron/tsconfig.json` | 23 | `target ES2022` / `module commonjs` / `outDir build` / `strict` / 只 include 两个 .ts |
| `desktop/scripts/dev.mjs` | 137 | 开发启动器：起 Vite → 等端口 → `tsc` → 起 Electron |
| `desktop/scripts/copy-renderer.mjs` | 22 | `frontend/dist` → `desktop/dist`（asar 与 extraResources 共用同一份） |
| `desktop/package.json` | 24 | `main: electron/build/main.js`、`version 0.2.2`、4 个 npm script |
| `desktop/electron-builder.yml` | 58 | Windows NSIS 配置 |
| `desktop/electron-builder-linux.yml` | 51 | Linux AppImage/deb/rpm 配置 |
| `desktop/.gitignore` | 6 | 忽略 `node_modules/ dist/ release/ build/ electron/build/ *.log` |
| `desktop/build-assets/icon.{png,ico}` | — | 图标（`icon.png` 同时进 `extraResources` 供 Linux 与运行时用） |

> 注意：`desktop/electron/build/{main,preload}.js` **存在于工作区**（编译产物），但被 `.gitignore:5` 忽略，属于本地残留而非版本化文件。

### 1.2 打包态：如何找到并启动 Python 后端

```
main.ts:90-93   backendExecutable()
                name = win32 ? 'codeslice-backend.exe' : 'codeslice-backend'
                return join(process.resourcesPath, 'backend', name)
```

- **扁平布局假设**：exe 必须直接位于 `<resources>/backend/` 下，不带嵌套目录。这与 PyInstaller 默认的 `dist-backend/codeslice-backend/…` 冲突，靠 `build_backend.ps1:226-246` 的"压平"步骤弥合；`build_desktop.ps1:227-259` 还会在构建前**正则解析 `electron-builder.yml`** 校验 `from:` 指向扁平目录，不通过就 `FAIL`。这是一个设计得相当扎实的防呆（两侧互不修改对方文件）。
- **启动参数**（`main.ts:136-147`）：
  - `CODESLICE_PORT=0` → 让内核选空闲端口
  - `CODESLICE_DATA_DIR=app.getPath('userData')` → Windows 上即 `%APPDATA%\codeslice-desktop`（取自 `desktop/package.json` 的 `name`，见 `packaging/README.md:196-207`）
  - `CODESLICE_FRONTEND_DIST=<resources>/frontend`（**仅当** `hasBundledFrontend()` 为真时才设，`main.ts:141-143`）
  - `windowsHide: true`、`stdio: ['ignore','pipe','pipe']`
- **超时**：`BACKEND_BOOT_TIMEOUT_MS = 30_000`（`main.ts:34`），超时错误里会拼上 stderr 尾部（最多保留 8000 字符，`main.ts:197-201`）。

### 1.3 端口与令牌协商（核心协议）

**生产方向（后端 → Electron）**：

```
entry_backend.py:194-207   uvicorn.Config(app, host, port, …) → 线程启动
entry_backend.py:209-215   最多等 60s 直到 server.started
entry_backend.py:217-223   从 server.servers[0].sockets[0].getsockname()[1] 取真实端口
entry_backend.py:225       print(f"CODESLICE_READY {json.dumps({'port':…, 'token': token})}")
```

- Electron 侧（`main.ts:176-195`）按 `\n` 切行、只认 `CODESLICE_READY` 前缀、`JSON.parse` 后要求 `port` 是 number 且 `token` 是 string，才 `resolve`。
- 令牌来源：`backend/app/core/config.py:32,39-42` —— 环境变量 `CODESLICE_TOKEN` 优先，否则 `secrets.token_urlsafe(24)` 随机生成（**仅进程内存，不落盘**）。
- 后端还有第二条 `CODESLICE_ERROR` 前缀用于自检/启动失败（`entry_backend.py:39, 106, 214, 242`）。
- **双实现提醒**：`entry_backend.py:181-232`（PyInstaller 入口）和 `app/main.py:194-234`（`python -m` / `fastapi dev` 路径）各自实现了一遍 uvicorn 启动 + READY 行。两者字段基本一致，但 `main.py:229` 的公告多了 `version`，`entry_backend.py:225` 只有 `port`/`token`；Electron 只读前两个字段，所以不影响，但这是**同一契约两处维护**的隐患。

**开发方向（Electron → 已跑的后端）**：

```
main.ts:117-121  resolveDevBackend()
                 port  = Number(process.env.CODESLICE_PORT ?? 8000)
                 token = process.env.CODESLICE_SESSION_TOKEN ?? ''
```

- 注意环境变量名**不对称**：桌面壳读 `CODESLICE_SESSION_TOKEN`，后端读 `CODESLICE_TOKEN`。`scripts/dev.ps1:253-256` 明确注释了这点并**两个都设**，这个坑被文档化处理了。
- `dev.mjs:76-88` 只对 `127.0.0.1:8000` 做 TCP 探测，探测失败只 `console.warn` 不阻断（`dev.mjs:91-95`）。
- `main.ts:326`：开发态 `apiBase` 返回**空字符串**，让 Vite 的 `/api` proxy（`frontend/vite.config.ts:19-25`，target 默认 `http://127.0.0.1:8000`）转发，从而规避跨域。

### 1.4 如何注入 renderer（`window.codeslice`）

```
main.ts:322-330  ipcMain.on('codeslice:backend-info')  → event.returnValue = { apiBase, token, platform }
preload.ts:15-28 readBackendInfo() 用 ipcRenderer.sendSync 同步取
preload.ts:30-50 bridge = { apiBase, token, platform, pickFolder, openExternal,
                            minimize, toggleMaximize, closeWindow, isMaximized, onWindowState }
preload.ts:50    contextBridge.exposeInMainWorld('codeslice', bridge)
```

- 必须用 `sendSync` 是因为 preload 要在渲染层首个脚本前就建好对象（`main.ts:320-321` 有注释说明）。
- 渲染层消费：`frontend/src/bridge.ts:26-36`（`apiBase()` 去掉尾斜杠）、`getToken()` 三级回退（Electron 注入 → `VITE_SESSION_TOKEN` → `localStorage['codeslice.devToken']`，`bridge.ts:46-55`）。
- `bridge.ts:72-75`：非 Electron 环境 `pickFolder()` 直接 `Promise.resolve(null)`；`openExternal` 退回 `window.open`（`bridge.ts:77-83`）。

**安全评估（暴露面）**：

| 项 | 值 | 位置 | 评价 |
|---|---|---|---|
| `contextIsolation` | `true` | `main.ts:248` | ✅ |
| `nodeIntegration` | `false` | `main.ts:249` | ✅ |
| `sandbox` | `true` | `main.ts:250` | ✅ |
| `webSecurity` | `true` | `main.ts:251` | ✅ |
| `setWindowOpenHandler` | 仅 `https?://` 走 `shell.openExternal`，其余 `deny` | `main.ts:268-271` | ✅ 但见下 |
| **`will-navigate` 拦截** | **缺失** | grep 无命中 | ⚠️ 渲染层被 XSS 后可整页导航到远端（不过 `CSP` 与 `sandbox` 限制了脚本源） |
| **`session.setPermissionRequestHandler`** | **缺失** | grep 无命中 | ⚠️ 默认行为，建议显式 deny |
| **`token` 明文暴露给页面 JS** | `window.codeslice.token` | `preload.ts:31` | ⚠️ 设计取舍：前端需要它发 `X-Session-Token`。风险等价于"后端信任同源页面"，可接受但应与 CSP 一起看 |
| **`open-external` 的 IPC 参数校验** | `typeof url === 'string' && /^https?:\/\//i` | `main.ts:315-318` | ✅ 已做协议白名单 |
| **`pick-folder` 无速率/路径限制** | 返回绝对路径 | `main.ts:306-313` | 🟡 用户主动操作才弹窗，可接受 |

- **`frame: false`**（`main.ts:236`）→ 自绘标题栏，需要在 CSS 里 `-webkit-app-region: drag`（`frontend/src/styles/layout.css:25,32` 有），IPC 里对应 `window-minimize` / `toggle-maximize` / `close` / `is-maximized`（`main.ts:292-304`）。
- **CSP** 不在 Electron 层设置，而在 `frontend/index.html:8-11` 的 `<meta http-equiv>`：
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: http://127.0.0.1:*; font-src 'self' data:;
  connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://api.github.com;
  worker-src 'self' blob:;
  ```
  - ✅ 无 `unsafe-eval`、无远程脚本；`style-src` 允许 `unsafe-inline`（Monaco 需要）。
  - ✅ `connect-src` 只放行 loopback + `api.github.com`（更新检查）。
  - 🟡 `<meta>` CSP 无法使用 `frame-ancestors` / `report-uri`；且**后端没有回 `Content-Security-Policy` 响应头**（`main.py` grep 无 CSP），所以这层防护完全依赖 HTML 里那一行。

### 1.5 单实例 / 窗口生命周期 / 退出回收

```
main.ts:340-348   requestSingleInstanceLock()；失败即 app.quit()
                  second-instance → restore + focus
main.ts:350-367   whenReady → bootstrap()；失败 dialog.showErrorBox + quit
main.ts:369-371   window-all-closed → 非 darwin 就 quit
main.ts:373-380   before-quit 置 quitting=true；will-quit 若 quitting 则 stopBackend()
main.ts:211-220   stopBackend(): child.kill()（try/catch 吞异常）
```

- **窗口状态持久化**：`<userData>/window-state.json`，`loadBounds()` 有 `Math.max(900/600)` 下限钳制（`main.ts:55-57`），`saveBounds()` 在最大化时存 `getNormalBounds()`（`main.ts:71`）——这是个容易做错的细节，这里做对了。写失败静默（`main.ts:79-83`）。
- **`ready-to-show` 才 `show()`**（`main.ts:237, 257`）→ 避免白屏。
- **macOS `activate` 分支**（`main.ts:358-360`）会 `createWindow()`，但此时 `registerIpc` 已经在首次 bootstrap 时注册过；`createWindow()` 不重注册，逻辑正确。

**回收子进程的真实语义（重点风险）**：

- `stopBackend()` 只 `child.kill()`（POSIX 发 SIGTERM / Windows 走 `TerminateProcess` 语义的默认行为）。**没有进程组 kill、没有等待退出、没有 `tree-kill`**。
- Windows 上 `kill()` 对 `codeslice-backend.exe`（PyInstaller one-dir，`console=True`）通常能杀掉主进程，但**若后端 fork 了子进程（`services/terminal.py` 的 `Popen(shell=True)` 命令）**，这些孙进程不会被回收。
- `main.ts:377-380` 的 `if (!quitting) return` 意味着**非正常退出路径（崩溃、`app.exit()`）不会调 `stopBackend()`** → 后端可能变成孤儿进程，继续监听端口并持有 SQLite。
- **缓解机制存在但不在桌面层**：`repo.interrupt_stale_jobs()`（`backend/app/storage/repo.py:406-421`）会在下次启动时把 `pending/running` 的任务标记为 `error`，`main.py:79-84` 调用它。这解决"侧栏永远转圈"，但**不解决孤儿进程**。
- 🟡 建议：`spawn(..., { detached: false })` + Windows 上 `taskkill /T /F /PID`，或后端自己监听 stdin 关闭（`stdio[0]` 是 `'ignore'`，目前无法用父进程关闭检测自杀）。

### 1.6 自动更新 / 发布通告机制

**没有 electron-updater**（`desktop/package.json` devDependencies 只有 `@types/node`/`electron`/`electron-builder`/`typescript`，无 `electron-updater`）。采用的是**"检查 + 引导手动下载安装"**：

```
frontend/src/lib/releases.ts:4    RELEASE_API = https://api.github.com/repos/ctianye/CodeSlice/releases/latest
releases.ts:51-84                 checkForRelease(signal?)
  1. getHealth() 拿本地 health.version 作为 currentVersion（releases.ts:59）
  2. fetch GitHub latest（Accept: application/vnd.github+json，12000ms 超时）
  3. compareVersions(version, health.version) > 0 才算新版本（releases.ts:66）
  4. 且 !prerelease && !draft（releases.ts:73）
  5. installer = assets 里 /^CodeSlice-.*-Setup\.exe$/i 的第一个（releases.ts:69）
```

- `compareVersions`（`releases.ts:20-39`）是**手写的完整 SemVer 比较**（含 prerelease 数字/字母优先级），并且 `githubUrl()`（`releases.ts:41-49`）会校验 `origin === 'https://github.com'` 且 pathname 前缀匹配，**防 GitHub 返回的 URL 被导向任意域**——这一点做得比多数实现都好。
- UI：`frontend/src/components/ReleaseNotice.tsx`（37 行）是模态框，**没有"立即更新"按钮**，只有「下载 Windows 安装包」→ `openExternal`（`ReleaseNotice.tsx:13`）；正文明确写了"下载后请退出 CodeSlice，再运行安装包并覆盖原安装目录"。
- 触发点：`App.tsx:55`（启动时）与 `SettingsModal.tsx:465`（手动检查）。
- 🟡 **平台假设**：按钮文案硬编码"下载 Windows 安装包"（`ReleaseNotice.tsx:14`），而项目已支持 Linux（`electron-builder-linux.yml`）。Linux 用户看到的是 Windows exe 的名字，`installer` 正则也只会匹配 Setup.exe。
- 🟡 **隐私**：每次启动都会向 `api.github.com` 发一次请求（`App.tsx:55` 在挂载时触发），这是本地优先应用里唯一的外联，且未在 UI 里给开关。

### 1.7 桌面壳关键缺陷清单

| 严重度 | 问题 | 位置 |
|---|---|---|
| 中 | 非正常退出不 `stopBackend()`，可能留下孤儿后端 | `main.ts:377-380` |
| 中 | `child.kill()` 不杀孙进程（终端命令/PyInstaller 子进程） | `main.ts:211-220` |
| 中 | 缺 `will-navigate` 拦截 | `main.ts` 全文无 |
| 低 | 缺 `setPermissionRequestHandler` | 同上 |
| 低 | 更新通告文案与 installer 正则硬编码 Windows | `ReleaseNotice.tsx:14`、`releases.ts:69` |
| 低 | `isDev` 判定含 `!app.isPackaged`（`main.ts:41`），用 `electron .` 跑打包目录时会误判为 dev | `main.ts:41` |
| 低 | 无 macOS 打包配置，但 `window-all-closed` / `activate` / dock 相关分支都写了 | `main.ts:358-371` |

---

## 2. 构建与发布链路

### 2.1 全景

```
backend/  ──uv sync──▶ backend/.venv ──PyInstaller(spec)──▶ packaging/dist-backend/  (扁平: exe + _internal/)
                                                                        │
frontend/ ──npm run build (copy-monaco → tsc -b → vite build)──▶ frontend/dist/
                                                                        │
                                          desktop/scripts/copy-renderer.mjs
                                                                        ▼
                                                              desktop/dist/
                                                                        │
                                                    electron-builder (files: dist/**, electron/**)
                                                                        ▼
                                        desktop/release/CodeSlice-<ver>-Setup.exe + win-unpacked/
                                                                        │
                                          extraResources:  ../packaging/dist-backend → resources/backend
                                                           dist                      → resources/frontend
                                                           build-assets/icon.png     → resources/icon.png
```

### 2.2 后端 PyInstaller

**入口** `packaging/entry_backend.py`（243 行）：

| 函数 | 行 | 作用 |
|---|---|---|
| `_bootstrap_sys_path()` | 112-136 | 冻结态优先 `sys._MEIPASS`，再 `exe_dir/_internal`、`exe_dir`、`exe_dir.parent`；源码态把 `../backend` 与自身目录插到 `sys.path[0]` |
| `_load_app()` | 139-160 | `importlib.import_module("app.main")`，取 `app` 或 `create_app()` |
| `_read_settings()` | 163-178 | 环境变量 → 再被 `app.core.config.settings` 覆盖（`try/except` 包住，settings 可选） |
| `_selftest()` | 59-109 | **11 种语言逐个 `get_parser()` + `parser.parse(b"x = 1\n")`**，外加 `keyring.get_keyring()` 类名不能含 `fail`/`null` |
| `main()` | 181-232 | `multiprocessing.freeze_support()` → selftest 分支 → uvicorn 线程 → READY 行 |
| 顶层兜底 | 236-243 | 任何 `BaseException` 都先打 `CODESLICE_ERROR unhandled exception during start-up` 再 `exit 1`，保证**永远有一行可解析的失败信息** |

自检设计是这份代码里最亮的一处工程判断：`SELFTEST_LANGUAGES`（`entry_backend.py:53-56`）与 spec 的 `GRAMMAR_PACKAGES`（`spec:227-239`）必须同步，且注释明确写了"缺 grammar 不会崩，只会静默降级成纯文本分块"（`entry_backend.py:49-52`）。

**spec** `packaging/specs/codeslice-backend.spec`（386 行）：

- 布局：`EXE(exclude_binaries=True, console=True, upx=False)` + `COLLECT(name="codeslice-backend")` → one-dir（`spec:359-386`）。
  - `console=True` 是**硬约束**（READY 行走 stdout，`spec:369` 有注释）。
  - `upx=False` 是为躲 Windows 杀软启发式（`spec:368`）。
- 收集策略：
  - `collect_submodules("app")`（`spec:101`），失败时退回 6 个显式模块（`spec:104-111`）；日志行 `[spec] app modules collected: N`，README 说 N 应为 30+（`packaging/README.md:325-328`）。
  - 手工 `sys.path.insert` 先于 `Analysis`（`spec:97-99`）——因为 `collect_submodules` 在 spec 执行期就要 import，而 `pathex` 要到 `Analysis()` 才生效。**这是个真实的 PyInstaller 陷阱，处理正确。**
  - uvicorn 20+ 个 hidden import（`spec:118-141`）、fastapi/starlette/pydantic 动态部分（`spec:142-159`）、`langgraph.*` 18 条 + `langchain_core.*` + `langchain_openai` + `openai` + `anthropic`（`spec:181-214`）。
  - 11 个 `tree_sitter_*` 全部 `collect_all`（`spec:241-243`），外加 legacy `tree_sitter_language_pack` 与 `tree_sitter_languages` 的 `.dll` 兜底（`spec:247-254`）。
  - `copy_metadata("keyring")` + `copy_metadata("numpy")`（`spec:288-292`）——keyring 靠 entry points 发现后端，缺 metadata 会静默退化。
  - `docs/*.md` 打进 `_internal/docs/`（`spec:301-302`），实测产物里有 `docs/API_CONTRACT.md` 与 `docs/ARCHITECTURE.md`（`desktop/resources/backend/_internal/docs/`）。⚠️ **把内容过时的 API_CONTRACT.md 打进安装包**，用户/模型可读到，但它是 §5 里要指出的过期版本。
- `excludes`：`pytest/_pytest/ruff/mypy/PyInstaller/setuptools/pip/IPython/jupyter/matplotlib/scipy/pandas/PIL/PyQt*/tkinter/sphinx/docutils` 等（`spec:307-338`）。**注意 `sqlite_vec` 没有被 exclude**（`spec:265` 在 hiddenimports 里），但 `app/` 里 grep 不到任何 `sqlite_vec` 引用 → 白背一个包。同理 `tiktoken`、`sentry_sdk`、`opentelemetry*`、`httpx2`、`httpcore2` 都出现在产物里但 `app/` 无直接引用（见 §3）。
- 注释里提到 `collect_dynamic_libs`/`get_module_file_attribute` 等 import（`spec:31-38`），其中 `collect_dynamic_libs` 实际未被调用——`noUnusedLocals` 之类的检查对 Python 不适用，属无害冗余。

### 2.3 前端 Vite 构建

```
frontend/package.json:9-10  prebuild: node scripts/copy-monaco.mjs
                            build:    node scripts/copy-monaco.mjs && tsc -b && vite build
frontend/vite.config.ts:9   base: './'          ← 相对路径，为 file:// 兼容
vite.config.ts:17-18        port 3000, strictPort: true
vite.config.ts:19-25        proxy /api → VITE_API_TARGET || http://127.0.0.1:8000
vite.config.ts:28-32        outDir 'dist', emptyOutDir, sourcemap:false, chunkSizeWarningLimit:4096
```

- `copy-monaco.mjs`（29 行）把 `node_modules/monaco-editor/min/vs` 拷到 `frontend/public/monaco/vs`，**注释明确理由是"Electron 离线运行且 CSP 禁止远程脚本"**。`frontend/public/monaco/` 被 `.gitignore:47` 忽略。
- 🟡 **`base: './'` 与"由后端 HTTP 提供服务"存在张力**：生产态实际从 `http://127.0.0.1:<port>/` 加载（`main.ts:277-279`），相对路径仍然可用，但 `main.ts:283` 的 `file://` 回退分支才真正需要它。`vite.config.ts:5` 的注释("Renderer is loaded by Electron in production via file://")**已经与主流程不符**——这是文档漂移。

### 2.4 electron-builder 打包（Windows）

`desktop/electron-builder.yml`：

| 键 | 值 | 行 |
|---|---|---|
| `appId` | `com.codeslice.app` | 1 |
| `productName` | `CodeSlice` | 2 |
| `directories.output` | `release` | 6 |
| `directories.buildResources` | `build-assets` | 7 |
| `files` | `dist/**`, `electron/**`, `package.json`，排除 `electron/*.ts`、`tsconfig.json`、`**/*.map` | 10-16 |
| `extraResources` | icon.png→icon.png；`../packaging/dist-backend`→`backend`；`dist`→`frontend` | 20-34 |
| `win.target` | `nsis` / `x64` | 36-40 |
| `win.artifactName` | `${productName}-${version}-Setup.${ext}` | 42 |
| `win.signAndEditExecutable` | **`false`** | 44 |
| `nsis` | `oneClick:false`, `perMachine:false`, `allowToChangeInstallationDirectory:true`, 桌面+开始菜单快捷方式, `installerLanguages:[zh_CN]`, `language:'2052'`, `deleteAppDataOnUninstall:false` | 46-58 |

**`signAndEditExecutable: false` 引发的三步构建**（这是整条链路最"本地特化"的部分）：

`build_desktop.ps1:411-433` 的注释完整解释了原因：打开它 electron-builder 要解压 `winCodeSign-2.6.0.7z`，该包含 macOS 符号链接，需要 `SeCreateSymbolicLinkPrivilege`（非管理员没有），7-Zip 报 `Cannot create symbolic link`（exit 2），被 electron-builder 包装成 `cannot execute cause=exit status 2`。

于是：

```
Stage 1  electron-builder --win --dir              → release\win-unpacked\
Stage 2  <cache>\rcedit-x64.exe CodeSlice.exe      → 写 icon + VERSIONINFO
Stage 3  electron-builder --win nsis --prepackaged release\win-unpacked
```

- **顺序不可颠倒**：`README.md:154-157` 说明 rcedit 会保留 asar `INTEGRITY` 资源；先 rcedit 再让 builder 重写会丢 INTEGRITY 或图标。
- 图标校验用 `Icon.ExtractAssociatedIcon` + PNG 编码 + SHA256 前 16 hex（`build_desktop.ps1:105-129`），在 stage 2 与 stage 3 之后各比一次（`:523-530`、`:558-567`）。
- `rcedit` 定位靠 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 递归找 >100KB 的 `rcedit-x64.exe`（`:138-147`）——**纯路径假设 + 文件大小启发式**，是明显的环境耦合。

**其他值得记录的防呆**（都在 `build_desktop.ps1`）：

| 检查 | 行 | 说明 |
|---|---|---|
| Node ≥ 24 警告 | 185-194 | 低于 24 只 warn |
| `extraResources from:` 正则解析 | 227-259 | 正则 `(?ms)^\s*-\s*from:\s*(?<from>[^\r\n#]+)…to:\s*backend`，要求目录**直接**含 exe |
| 后端 bundle 存在 + 体积 | 266-277 | |
| `ELECTRON_MIRROR` 默认 npmmirror | 318-321 | 仅当未设置时注入 |
| `node_modules` 就绪探测 | 323-351 | >5 个条目即认为装好，除非 `-Clean` |
| 重新同步 `desktop/dist` | 387-400 | 注释解释了"否则会把上一代前端打进包"（`electron-builder` 不清 `extraResources` 残留） |
| 运行实例文件锁预检 | 154-162, 452-457 | `File.Open(..., 'ReadWrite','None')` 探测 |
| 版本号从 package.json 读 | 463-474 | 兜底常量 `'0.2.2'`，非四段则补 `.0` |
| 优先用本地 `electron-builder.cmd` 而非 `npx` | 482-486 | 避免联网解析 |
| 安装包 SHA256 打印 | 574-589 | 末尾双 `assets/index-*.js` 一致性比对 `:604-630` |

### 2.5 electron-builder 打包（Linux）差异

| 项 | Windows | Linux |
|---|---|---|
| 配置文件 | `electron-builder.yml` | `electron-builder-linux.yml` |
| 输出目录 | `release/` | `release-linux/`（注释：避开 Windows 在中断 linux-unpacked 构建时的文件锁，`-linux.yml:6-8`） |
| 后端源 | `../packaging/dist-backend` | `../packaging/dist-backend-linux`（`-linux.yml:25`） |
| target | `nsis` x64 | `AppImage` + `deb` + `rpm`，均 x64（`-linux.yml:35-45`） |
| artifactName | `${productName}-${version}-Setup.${ext}` | `${productName}-${version}-${arch}.${ext}`（`-linux.yml:51`） |
| 图标 | `build-assets/icon.ico` | `build-assets/icon.png`（`-linux.yml:46`） |
| 元数据 | `installerLanguages:[zh_CN]`, `language:'2052'` | `category: Development`, `maintainer: CodeSlice`, `synopsis`, `description` |
| 构建宿主 | Windows | **必须 Linux**（`build_linux.sh:1-7` 明确说明 Windows 上不可行） |

`build_linux.sh`（109 行）要点：

- `set -euo pipefail`；`--skip-backend` 复用已有产物。
- 用**一次性 venv** `packaging/build/linux-venv`（`:40`），注释说"不碰 Windows 的 backend/.venv"。
- Debian 无 `ensurepip` 时**手工引导 pip**：`python3 -m venv --without-pip` → 下载 `get-pip.py`（`:42-54`）。
- 平台化 `pip install -e "$BACKEND_DIR" -r requirements-packaging.txt`（`:56`）。
- 压平逻辑用 `mv` + `shopt -s dotglob`（`:69-75`），比 Windows 的 `Move-Item` 更易出错但写得更细（处理了点文件）。
- `chmod +x`（`:76`）+ `--selftest` 冒烟（`:79-88`）。
- 最后 `npm ci`（若 `node_modules` 不存在）+ `npm run build` + `copy-renderer.mjs` + `npx electron-builder --linux`（`:93-105`）。

🟡 **Linux 链路没有 Windows 那样的产物校验**：没有校验 `linux-unpacked/resources/backend/codeslice-backend` 是否存在，也没有图标/版本信息校验（Linux 无 rcedit 需求，可接受），也没有渲染层 hash 一致性比对。

### 2.6 CI（`.github/workflows/release.yml`）

- 触发：`push tags 'v*'` 或 `workflow_dispatch`（`:9-13`）。
- `windows` job（`windows-2022`）：`setup-node@v4` **node 22**（`:26`）、`setup-python@v5` **3.11**；手工建 venv + `pip install -e backend -r requirements-packaging.txt`（`:39-41`），然后 `build_backend.ps1 -SkipInstall`（`:45`）与 `build_desktop.ps1`（`:49`）。
- `linux` job（`ubuntu-22.04`）：`apt-get install -y rpm`（`:77`），跑 `build_linux.sh`。
- `publish` job：合并 artifacts → `sha256sum` 生成 `SHA256SUMS-<tag>.txt` → `gh release create/upload --clobber`（`:93-115`）。
- 🟡 **CI 用 node 22，而 `packaging/README.md:19` 与 `build_desktop.ps1:192` 都说 Node 24 LTS** → 文档/CI 不一致（构建本身只 warn 不 fail，所以能过）。
- 🟡 **CI 不跑 pytest**：`release.yml` 全文无 `pytest` / `ruff`。也就是说发布构建不依赖测试通过。

### 2.7 产物目录形态（实测）

`desktop/release/`（工作区实际存在）：
```
desktop/release/
├── CodeSlice-0.2.2-Setup.exe
├── SHA256SUMS-v0.2.2.txt        → 含 Win + AppImage + deb + rpm 四个哈希
└── win-unpacked/resources/app.asar     （glob 只返回这一个文件；backend/、frontend/ 未列出）
```
> ⚠️ `glob desktop/release/win-unpacked/resources/*` **只返回 `app.asar`**，未见 `backend/` 与 `frontend/` 子目录。但这可能是 glob 只列文件不列目录所致（`release/win-unpacked/` 本身也是目录且未列出）——**未确认**，需 `ls` 才能定论。历史构建日志 `.build-desktop.log:58` 曾确认 `win-unpacked\resources\backend\codeslice-backend.exe` 存在。

`packaging/dist-backend/`（工作区）：
```
packaging/dist-backend/
└── _internal/base_library.zip     （glob 只返回 1 个文件；exe 与其余 _internal 内容未列出）
```
> ⚠️ 与上一节同理，`glob` 结果可能被目录过滤截断。历史日志 `.build-backend-022.log:43` 确认曾产出 `codeslice-backend.exe (24.73 MB, bundle 92.4 MB)`。

`desktop/resources/backend/`（385 条路径，最终进 `extraResources` 的**暂存副本**）：
```
desktop/resources/backend/
├── codeslice-backend.exe
└── _internal/
    ├── python311.dll / python3.dll / VCRUNTIME140*.dll / api-ms-win-*.dll (≈40 个)
    ├── libcrypto-1_1.dll / libssl-1_1.dll / libffi-8.dll / sqlite3.dll / ucrtbase.dll
    ├── numpy.libs/libscipy_openblas64_-<hash>.dll + msvcp140-<hash>.dll
    ├── tree_sitter{,_bash,_c,_cpp,_go,_java,_javascript,_json,_python,_rust,_typescript}/
    ├── numpy/{_core,fft,linalg,random}/**.pyd
    ├── {pydantic_core,orjson,ormsgpack,jiter,regex,tiktoken,markupsafe}/**.pyd
    ├── certifi/  docs/{API_CONTRACT.md,ARCHITECTURE.md}
    └── 26 个 dist-info/（click, email_validator, httpcore2, httpx2, importlib_metadata,
        keyring, markupsafe, numpy, opentelemetry_{api,exporter_otlp_proto_http,sdk},
        pydantic, sentry_sdk, tree_sitter*, urllib3, websockets）
```
> ⚠️ 因为没有 `ls`/`du`，`_internal/` 下的 `langchain*`/`fastapi`/`starlette`/`anthropic`/`openai` 等纯 Python 包**未在 glob 结果中出现**——它们大概率被收进 `base_library.zip` 或 `.pyz`（PyInstaller 默认 `noarchive=False`，`spec:353`），所以**看不到不代表没打进去**。此点标"**未确认**"。

### 2.8 版本号定义位置（4 处，需手工同步）

| 位置 | 行 | 值 |
|---|---|---|
| `desktop/package.json` | 3 | `"version": "0.2.2"` ← electron-builder 的 `${version}` 与 `build_desktop.ps1` 的 VERSIONINFO 都读这里 |
| `frontend/package.json` | 4 | `"version": "0.2.2"` |
| `backend/pyproject.toml` | 3 | `version = "0.2.2"` |
| `backend/app/core/config.py` | 16 | `VERSION = "0.2.2"` ← **`GET /api/health` 返回的就是它**，也是更新检查的 `currentVersion` |

🟡 这是**四源真相**，没有任何脚本做一致性校验。若只改 `desktop/package.json`，会出现"安装器叫 0.3.0、`/api/health` 说 0.2.2"→ 前端 `checkForRelease` 会永远认为有新版本（`releases.ts:66`）。`build_desktop.ps1:463` 的兜底常量 `'0.2.2'` 是第五处。

### 2.9 硬编码路径 / 平台假设汇总

| # | 位置 | 假设 | 风险 |
|---|---|---|---|
| 1 | `main.ts:91` | `win32` → `.exe`，其他 → 无后缀 | macOS 未验证 |
| 2 | `main.ts:92` | `<resourcesPath>/backend/<name>` 扁平布局 | 与 PyInstaller 默认嵌套冲突，靠脚本压平弥合 |
| 3 | `main.ts:283` | `file://` 回退路径 `__dirname/../../dist/index.html` | 打包后 `__dirname` 在 asar 内，路径可能不成立（未确认） |
| 4 | `main.ts:242` | 开发态图标 `<appPath>/build-assets/icon.png` | 依赖 cwd/appPath |
| 5 | `build_desktop.ps1:139` | `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 里有 rcedit | 换机器/换 electron-builder 版本会失效 |
| 6 | `build_desktop.ps1:319` | `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` | 硬编码国内镜像，海外用户会变慢 |
| 7 | `build_desktop.ps1:441` | 提示里的 `ELECTRON_BUILDER_BINARIES_MIRROR` 同域 | 同上 |
| 8 | `build_backend.ps1:78` | `backend\.venv\Scripts\python.exe` | 仅 Windows venv 布局 |
| 9 | `build_backend.ps1:103` | 提示 `uv venv --python 3.11` | Python 版本硬绑定 3.11（CI 也是 3.11） |
| 10 | `dev.ps1:78` / `dev.mjs:78` / `vite.config.ts:22` | `127.0.0.1:8000` 三处重复 | 改端口要改三处 |
| 11 | `dev.ps1:163` | `Start-Process powershell.exe`（非 pwsh） | 依赖 Windows PowerShell |
| 12 | `releases.ts:4` | 仓库 `ctianye/CodeSlice` 硬编码 | fork 后需手工改 |
| 13 | `ReleaseNotice.tsx:14` | "下载 Windows 安装包" | Linux 用户文案错误 |
| 14 | `spec:369` | `console=True` | 无控制台宿主（如 MSI 服务化）就无法工作 |
| 15 | `electron-builder.yml:57` | `language: '2052'`（LCID 十进制） | 仅简体中文安装界面 |

---

## 3. 后端依赖清单与体积风险

### 3.1 版本与解释器

- `requires-python = ">=3.11"`（`pyproject.toml:4`），但打包/CI 都固定在 **3.11**（`build_backend.ps1:103`、`release.yml:34`）。`uv.lock:4-9` 的 `resolution-markers` 覆盖 3.12 / 3.13 / 3.14 / `<3.12` 四档，也就是说 lock 里有**多份 numpy/networkx**（`uv.lock` 里 `numpy` 出现两次：2.4.6 与 2.5.4；`networkx` 也出现两次）。
- `uv.lock`：`version=1, revision=5`，共 **126 个 package**。

### 3.2 直接依赖（`pyproject.toml:5-29`，25 条）

| 类别 | 包 | 说明 |
|---|---|---|
| Web | `fastapi[standard]>=0.115` | `[standard]` 会带入 `fastapi-cli`、`fastapi-cloud-cli`、`httpx`、`jinja2`、`python-multipart`、`email-validator`、`uvicorn[standard]` → 实际拉入 `uvloop`/`httptools`/`websockets`/`watchfiles`/`python-dotenv`/`pyyaml` |
| 检索 | `tree-sitter>=0.23` + 11 个 `tree-sitter-*` | python/js/ts/go/rust/java/c/cpp/json/bash |
| Agent | `langgraph>=0.6`, `langgraph-checkpoint-sqlite>=2.0`, `langchain-core>=1.7.6`, `langchain-openai>=1.7.4`, `langchain-anthropic>=1.7.10` | |
| 存储 | `aiosqlite>=0.20` | |
| 数值 | `numpy>=1.26` | grep `app/` **只有一处 docstring 提及**（`retrieval/hybrid.py:4`），实际向量运算用纯 Python `math.sqrt` + `array`（`hybrid.py:42-54`、`models/embeddings.py:85-92`） |
| 图 | `networkx>=3.4` | 唯一真实用途：`graph/cluster.py:20` |
| HTTP/OS | `httpx>=0.27`, `keyring>=25.7.0`, `watchfiles>=1.3` | `watchfiles` 用于 `indexing/indexer.py:19` |

### 3.3 重量级传递依赖（`uv.lock` 实测 wheel 尺寸）

| 包 | 版本 | wheel 尺寸（win_amd64） | 是否被 `app/` 直接使用 |
|---|---|---|---|
| `numpy` | 2.4.6 / 2.5.4（双份 marker） | **12.6 MB / 12.3 MB**（sdist 20.7 MB） | ❌ 仅 docstring 提及 |
| `anthropic` | 2.5.0 | **2.45 MB** | ✅ 但仅 `config.py:251` 里 `from langchain_anthropic import ChatAnthropic`，直连 `anthropic` SDK 未用 |
| `openai` | — | — | 经 `langchain_openai` 间接使用 |
| `langgraph` | — | 含 prebuilt/sdk/checkpoint(×sqlite) | ✅ |
| `tree-sitter` 及各语言 | 0.26.0 等 | 单语言 80–230 KB（win_amd64），主包 129 KB | ✅ |
| `sqlite-vec` | — | — | ❌ **`app/` grep 零命中**，却在 `spec:265` hiddenimports 里 |
| `tiktoken` | — | 产物有 `tiktoken/_tiktoken.cp311-win_amd64.pyd` | 🟡 `config.py:292` 注释提到"默认会预分词并发送 token id"，属间接依赖 |
| `sentry_sdk` | 2.73.0 | 产物有 dist-info | ❌ `app/` 无引用（应是 `fastapi[standard]`→`fastapi-cloud-cli` 带入） |
| `opentelemetry-{api,sdk,exporter-otlp-proto-http}` | 1.45.2 | 产物有 3 个 dist-info | ❌ 同上传入 |
| `httpx2` / `httpcore2` | 2.16.0 | 产物有 dist-info | 🟡 `anthropic 2.5.0` 依赖 `httpx2`（`uv.lock:54`），是**新品牌包**，同时存在 `httpx` 与 `httpx2` 两套 |
| `websockets` | 17.4 | 产物有 dist-info | ✅ uvicorn WS |
| `pygments` / `rich` / `typer` / `rignore` | — | 在 `backend/.venv` 里（`fastapi-cli`/`fastapi-cloud-cli` 链） | 🟡 大部分在 spec 里没显式 exclude，但也没 hiddenimport |

**关键观察**：`fastapi[standard]` 的 `[standard]` extra 是体积的主要隐性来源。如果换成 `fastapi` + 显式 `uvicorn[standard]`，可以砍掉 `fastapi-cli`、`fastapi-cloud-cli`、`sentry-sdk`、`opentelemetry-*`、Typer/Rich 整条链。这是**性价比最高的一刀**。

### 3.4 打包后体积（实测数字，来自构建日志）

| 指标 | 数值 | 来源 |
|---|---|---|
| `codeslice-backend.exe` | **24.73 MB** | `.build-backend-022.log:43` |
| `dist-backend/` 整包 | **92.4 MB** | `.build-backend-022.log:43` |
| 早期版本 exe 所在 bundle | 90.6 MB | `.build-desktop.log:17`、`.build-desktop2.log:17` |
| 打包后 `resources/backend/codeslice-backend.exe` | 22.9 MB | `.build-desktop.log:58`、`.build-desktop2.log:58` |
| NSIS 安装器 | **121.2 MB** | `.build-desktop.log:56` |
| AppImage / deb / rpm | 未记录数值（只有哈希） | `desktop/release/SHA256SUMS-v0.2.2.txt` |

> 说明：exe 从 24.73 MB 降到安装后的 22.9 MB，应是 electron-builder 复制时的差异/或日志取自不同构建批次（两个日志分别是 `-022` 与早期），**未确认**原因。整体量级结论可靠：**后端 ~92 MB，安装器 ~121 MB**。

### 3.5 体积风险与可优化项

| 机会 | 估算收益 | 依据 |
|---|---|---|
| 去掉 `fastapi[standard]` 的 extra（改 `fastapi` + `uvicorn[standard]`） | 中（sentry/otel/typer/rich/cloud-cli） | §3.3 |
| `excludes` 里加 `sqlite_vec`、`sentry_sdk`、`opentelemetry`、`httpx2` | 小-中 | `spec:307-338` 现有列表未含 |
| `numpy` 若非必需（实际未用）→ 从 `pyproject.toml` 移除 | **大**（~12 MB wheel + 2 个 openblas DLL） | `hybrid.py` 纯 Python 实现 |
| `langchain-anthropic` 与 `anthropic` 是否必需（默认协议是 `openai-compatible`） | 中（2.45 MB + httpx2） | `config.py:250-251` 仅 `protocol=="anthropic"` 分支 |
| `upx=False` 是刻意选择（杀软），不应为了体积打开 | — | `spec:368` |

---

## 4. 测试现状

### 4.1 配置

`backend/pyproject.toml:53-56`：
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_default_fixture_loop_scope = "function"
filterwarnings = ["ignore::DeprecationWarning"]
```
- 无 `addopts`（无覆盖率门禁、无 `-x`、无 `-q`）。
- `[dependency-groups] dev = ["pytest>=8", "pytest-asyncio>=0.24", "ruff>=0.6"]`（`:31-32`）。
- **根目录没有 `pyproject.toml`**（只有 `backend/pyproject.toml`），所以 `pytest` 必须在 `backend/` 下跑（`config.py:3` 注释、`GRAPH_EXPLORER.md:44` 都这么说）。

### 4.2 `conftest.py`（123 行）—— 环境隔离做得很好

- 模块级先设环境变量**再 import app**（`conftest.py:18-28`）：
  - `CODESLICE_DATA_DIR=<tmp>/data`
  - `CODESLICE_TOKEN=test-token`
  - `CODESLICE_KEY_SERVICE=codeslice-test` ← **防止测试写坏开发者真实 Windows 凭据管理器**（`:6-9` 有专门注释）
  - `CODESLICE_PORT=0`
- `_schema`（session/autouse）：`settings.ensure_dirs()` + `db.init_db()`。
- `conn_reset`：测试后逐个 `DELETE FROM` **15 张表**（含 `chunks_fts`、`graphs`、`graph_layouts`、`symbol_refs`、`symbol_defs`），注释解释了为什么必须连图谱缓存一起清（`:56-59`）。
- `project` fixture：造 `pkg/sample.py`（含 class/2 method/1 top function）+ `README.md` + `node_modules/skip.js`（验证忽略）。
- `client` fixture：`create_app()` + `TestClient`，headers 里塞 `X-Session-Token: test-token`。

### 4.3 用例清单（23 个文件，381 个 `def test_`）

| 文件 | 用例数 | 覆盖模块 |
|---|---|---|
| `test_graph_build.py` | **47** | AST 图谱构建：调用边解析、跨文件 import、JSX、继承、rationale 节点、external 节点、忽略规则 |
| `test_graph_cache.py` | **24** | 图谱 SQLite 缓存：命中/失效、零源码访问、schema 版本、索引联动、gzip、并发竞态、legacy `graph.json` 迁移 |
| `test_terminal.py` | **34** | 命令黑名单、`resolve_cwd`、`format_tail`、历史环形缓冲、SSE 帧序、超时、截断、HTTP 层 401/404/422 |
| `test_conversation_cards.py` | **30** | `include_others`、`by-file` 排序与鉴权、笔记生成/去重/fence 处理/重建索引/导出、`_clean_title` |
| `test_api.py` | **28** | health、鉴权、项目 CRUD、tree/file、binary 检测、git、索引生命周期、对话流、notes/rules/anchors/annotations、settings 不回明文 key、未知路由 404 |
| `test_knowledge_base.py` | **19** | 跨项目笔记、文件夹、`move` 语义、标题回填、空会话清理 |
| `test_graph_relationships.py` | **18** | 一跳邻域、252 邻点不切片、SSE 增量、失败可重试、413 超限、鉴权 |
| `test_node_config.py` | **25** | 节点默认值、部分 patch 合并、类型/范围校验（bool 不当数字）、stats、prompt 拼装 |
| `test_index_retrieval.py` | **24** | 增量索引、忽略/二进制、向量模型隔离、job 去重、watcher、FTS 特殊字符、中文检索、预算截断 |
| `test_ollama.py` | **13** | 预设模型、`openai_base_url`、探测、pull 流、后台 pull 重连 |
| `test_ollama_api.py` | **10** | HTTP 层：401、永远 200、未知模型 400 且不开流、SSE 帧、embedding 切换触发重建 |
| `test_file_write.py` | **12** | 写回、原样保留、404/400、路径穿越、超大、mtime 冲突、asset query token |
| `test_navigation.py` | **11** | go-to-definition、import alias、self method、ambiguous 候选、references、hover、symbols、穿越 |
| `test_tools.py` | **17** | `list_files`/`read_file`/`write_file`/`run_command`、黑名单、diff 预览、`match_command_rule`、schema |
| `test_sse_http.py` | **5** | SSE 可解析性、citation→anchor、approval 往返、deny 无副作用、模型错误成 error 事件 |
| `test_tokenize.py` | **10** | `search_tokens`/`index_text`/`fts_query` 的引号、去重、bigram、注入防护 |
| `test_anchors.py` | **9** | 快照+hash、不变/修改/移动/删除、去重、越界 |
| `test_chunker.py` | **8** | 语言识别、结构化分块、行号连续、fallback bands、markdown 标题、空文件、超大 |
| `test_paths.py` | **9** | `resolve_root`/`resolve_in_project`/穿越/忽略集/二进制探测 |
| `test_agent.py` | **13** | token 流、anchor 落库、prompt 携带选区、tool_call 引用、approval 四种决策、session/always 规则、模型错误 |
| `test_graph_api.py` | **16** | 图谱读取、layout roundtrip、node detail、locate、鉴权、工作流边 |
| `test_embeddings.py` | **3** | 发 text 而非 token_ids、单条超长不毁整批、缩前缀重试 |
| `test_upgrade.py` | **2** | 旧库升级后数据存活、旧 annotation 补 title |
| **合计** | **381** | |

**断言密度**：`grep "assert "` 命中 **1078** 处 / 381 个用例 ≈ **2.83 assert/用例**（分布不均：`test_terminal.py` 局部达 3–6/用例，`test_sse_http.py` 2–4/用例）。

### 4.4 明显没覆盖的关键路径（按风险排序）

| # | 缺口 | 说明 |
|---|---|---|
| 1 | **桌面壳零测试** | `desktop/` 下无任何测试文件、`package.json` 无 `test` script。`main.ts` 的握手解析、`stopBackend`、单实例锁、bounds 持久化全部无自动化 |
| 2 | **`entry_backend.py` 的 READY 握手无单元测试** | 只在 `build_backend.ps1:261-435` / `build_linux.sh:79-88` 里做**构建期冒烟**；`backend/tests/` grep `READY` **零命中**。`_bootstrap_sys_path`、`_load_app` 的 `create_app` fallback 分支均未测 |
| 3 | **`/api/docs` 之外的路由未被契约测试覆盖** | `docs/API_CONTRACT.md` 无对应测试文件；只靠 `backend/scripts/e2e_contract.py`（手工脚本，非 pytest，`grep test_` 无命中） |
| 4 | **`main.py` 的 lifespan 清理逻辑** | `interrupt_stale_jobs()` 只在 `test_knowledge_base.py:282` 间接测到 `purge_empty_conversations`；`notegen.backfill_conversation_titles()` 有测（`test_knowledge_base.py:298-360`），但 `init_db` 迁移 + `stop_project_watchers` 无集成测试 |
| 5 | **`_pick_port()` 未被测** | `backend/app/main.py:183-188`（`socket.bind(("127.0.0.1",0))`），grep 测试零命中 |
| 6 | **并发安全** | `test_graph_cache.py:483` 测了"重建与索引竞态"，但 `db.py` 的 `_write_lock`（`db.py:21`）、SQLite WAL 下的多线程写入无压测 |
| 7 | **`keyring` 真实后端** | `test_api.py:360` 只断言"测试不碰生产凭据库"；`entry_backend.py:92-103` 的 `WinVaultKeyring` 检查只在打包冒烟里 |
| 8 | **前端** | `frontend/package.json:12` 有 `test:graph`（`node --test tests/graph.test.mjs`），但 **`frontend/tests/` 目录不存在**（glob 零命中）→ **该 script 是死引用，跑了会失败** |
| 9 | **LLM 真实调用** | 全部用 `scripted` / `echo` / `fake_*` handler mock（各文件顶部 fixture），无真实 provider 集成测试（合理，但意味着协议适配层零真实验证） |
| 10 | **Windows/POSIX 差异** | `test_terminal.py` 用 `sh()` helper 生成命令，跨平台分支（`shell=True`、路径分隔符）未被 CI 矩阵覆盖（CI 只有 `ubuntu-22.04` 与 `windows-2022`，但**CI 不跑 pytest**） |

### 4.5 测试质量的正面观察

- **防御式测试做得好**：`test_tokenize.py:69-78` 专门测 FTS 注入（`fts_query("")==""`、单字母被过滤、`column:` 不出现在 query 里）；`test_navigation.py:127`、`test_anchors.py:95`、`test_file_write.py:72`、`test_tools.py:29,49` 都有路径穿越用例 —— 这是**四层独立的穿越防护测试**。
- **不变量测试**：`test_chunker.py:58-66` 用 `assert 1 <= start <= end <= len(lines)` + 逐行比对内容，而非只比数量。
- **"失败也要可用"**：`test_conversation_cards.py:407`（模型失败仍保留回答）、`:563`（retitle 失败保留旧标题）、`test_graph_relationships.py:139`（失败可重试）、`test_sse_http.py:248`（模型错误成 error 事件）—— 与代码里的降级设计一一对应。
- **安全回归**：`test_terminal.py:103` 断言 `tools._BLOCKED_COMMAND_FRAGMENTS is sandbox.BLOCKED_FRAGMENTS`（**同一对象**，防止两处黑名单漂移），这条测试质量很高。

---

## 5. `docs/API_CONTRACT.md` 接口契约完整度评估

契约文档 359 行、9 个章节。逐条比对 `backend/app/api/*.py` 后：

### 5.1 Router 前缀核对（`main.py:142-154` 统一挂 `/api`）

| 模块 | router 前缀/标签 | 定义位置 | 契约章节 |
|---|---|---|---|
| `system` | 无前缀 | `system.py:7` | §1 |
| `projects` | `/projects` | `projects.py:20` | §2 |
| `indexing` | 无前缀 | `indexing.py:17` | §3 |
| `settings` | `/settings` | `settings.py:20` | §4 |
| `conversations` | 无前缀 | `conversations.py:28` | §5、§6 部分 |
| `notes` | 无前缀 | `notes.py:16` | §6 |
| `terminal` | `/projects/{project_id}/terminal` | `terminal.py:27` | §7 |
| `graph_api` | `/agent/graph` | `graph_api.py:23` | §8 |
| `graph_code` | 无前缀 | `graph_code.py:33` | **仅一处外链到 `GRAPH_EXPLORER.md`** |
| `navigation` | 无前缀 | `navigation.py:22` | **完全没有** |

✅ 结论：`/api` 前缀、`X-Session-Token` 头、`401 {"detail":"invalid session token"}`、`{"detail": …}` 错误形状、422 走 FastAPI 默认 —— **这四点在 `deps.py:14-18` / `main.py:138-140` 里完全一致**，契约开头（`API_CONTRACT.md:1-10`）准确。

### 5.2 契约文档缺口清单

**A. 完全未记录的路由（12 条）**

| 路由 | 代码位置 | 严重度 |
|---|---|---|
| `GET /api/projects/{pid}/definition` | `navigation.py:211` | 高（前端 go-to-definition 主接口） |
| `GET /api/projects/{pid}/references` | `navigation.py:230` | 高 |
| `GET /api/projects/{pid}/hover` | `navigation.py:277` | 高 |
| `GET /api/projects/{pid}/symbols` | `navigation.py:331` | 中 |
| `GET /api/projects/{pid}/annotations` | `notes.py:54` | 中（`test_api.py:279` 有测） |
| `POST /api/projects/{pid}/annotations` | `notes.py:59` | 中 |
| `DELETE /api/annotations/{id}` | `notes.py:76` | 中 |
| `GET /api/conversations/{cid}/interrupt` | `conversations.py:236` | 中（`e2e_contract.py:287` 用到） |
| `GET /api/settings/ollama/pull` | `settings.py:109` | 中（重连取进度，契约只写了 POST） |
| `DELETE /api/settings/model/key` | `settings.py:82` | 中（`test_api.py:274` 有测） |
| `POST /api/projects/{pid}/open` | `projects.py:252` | **高**（契约 §3 只描述"由 open 触发索引"的行为，没把它列为接口） |
| `POST /api/projects/{pid}/graph/build` | `graph_code.py:207` | 中（`GRAPH_EXPLORER.md` 也未列） |

**B. graph_code 的 12 条路由只有 5 条进 `GRAPH_EXPLORER.md:34-38`**

未记录：`PUT /graphs/notes/layout`、`POST /graphs/notes/summary/stream`、`PUT /projects/{pid}/graph/layout`、`POST /projects/{pid}/graph/summary/stream`、`POST /projects/{pid}/graph/build`、`GET /projects/{pid}/graph/locate`、`GET /projects/{pid}/graph/node`。

**C. 字段/行为不一致（3 处，实测）**

| # | 契约写法 | 代码实际 | 影响 |
|---|---|---|---|
| 1 | `GET /api/health` → `{"status","version","data_dir"}`（`API_CONTRACT.md:15`） | 多一个 `"app": "CodeSlice"`（`system.py:12-17`） | 低（camel 客户端无影响，但契约不完整） |
| 2 | `GET /projects/{pid}/file` → `{path,language,content,size,mtime,truncated}`（`:40`） | 多 `"binary": bool`；二元文件时 `language="binary"`、`content=""`（`projects.py:126-144`） | 中（`test_api.py:69` 专门测了这个行为，契约没写） |
| 3 | `PUT /projects/{pid}/file` → "响应与 GET /file 同构（`truncated:false`）"（`:45-46`） | 实际还多 `"binary": False`（`projects.py:183-191`） | 低 |
| 4 | 契约未提 `POST messages` body 有 `graph_anchor`（`API_CONTRACT.md:182-186` 只写 `content`/`use_context`） | `MessageCreate.graph_anchor: str \| None`（`conversations.py:52-54`） | 中（图谱提问功能依赖它） |
| 5 | 契约列 `status.stage` 枚举 `classify\|retrieve\|plan\|execute\|verify\|summarize\|title`（`:189-190`） | 代码实际 emit `graph`/`retrieve`/`plan`/`execute`/`title`（`agent/graph.py:312,345,437,486,719`）——**无 `classify`/`verify`/`summarize`，多了 `graph`** | **高**（按契约写前端会等不到 `classify`，且不认 `graph`） |
| 6 | 契约 `GET /api/settings/model` → `{chat, embedding}`（`:98-101`） | 实际还有 `default_system_prompt`/`default_qa_prompt`/`default_note_prompt`（`models/config.py:219-225`） | 中 |
| 7 | 契约 `ChatBody` 未提 `system_prompt`/`qa_prompt`/`note_prompt`/`max_tokens`（`:103-105` 只写 5 字段） | `settings.py:29-38` 有全部 | 中（`test_api.py:310` 测了 32k + 自定义 prompt） |
| 8 | 契约 `GET /api/notes` → `Note` 无 `project_name` 之外的搜索参数；未提 `POST /notes/{id}/retitle` 的 `retitle_failed` 字段位置 | `notes.py:154-160` 返回 `Note & {retitle_failed}`；`notegen.py:677,683` 实现 | 中 |
| 9 | 契约说 §8 只有后端接口、前端**没有**流程图界面（`:310-311`） | `graph_api.py` 确实如此，但 `graph_code.py` 的图谱 UI 存在（`GRAPH_EXPLORER.md`）→ **§8 的表述容易误导**，读者会以为"图谱无 UI" | 中 |

**D. 覆盖良好、可信的部分**

- §2 项目/文件：`POST/GET/GET(id)/DELETE`、`tree`（depth 0-4、500 上限）、`file`（2MB 截断、越界 400）、`asset`（query token、8 后缀、8MB）、`git/status`、`git/diff`(200KB) —— 与 `projects.py:28-249` 逐条对得上，**包含"令牌走 query 参数"这个非显然决策的解释**（`:53-58`）。
- §3 索引/检索：`job` 形状、`index` 累积值 vs 最近增量的区分、`embed_models`/`active_embed_model`/`embedding_configured` 三者语义（`:79-87`）—— 与 `indexing.py:57-67` 完全一致，这段写得很好。
- §5 SSE 事件形状（`token/status/citation/tool_call/tool_result/approval_required/message/error/done`）与 `agent/graph.py` 的 19 处 `_emit` 一一对应（除 stage 枚举）。
- §7 终端的 `start→output→exit→done` / `start→error→done`（无 exit）双序、200KB 上限、300s 超时、非 PTY 说明（`:283-292`）—— 与 `services/sandbox.py` 实现一致。
- §9 事件/错误约定（SSE `data: {...}\n\n`、模型未配置 400 不进 SSE、ISO8601 UTC）—— 与 `conversations.py:30-34,216` 一致。

### 5.3 契约完整度打分（主观）

| 维度 | 评分 | 理由 |
|---|---|---|
| 鉴权/错误约定 | 9/10 | 准确、有例子 |
| 请求/响应字段精确度 | 6/10 | 9 处偏差，其中 stage 枚举是硬错 |
| 路由覆盖率 | **5/10** | 约 90 条路由里，契约（含 GRAPH_EXPLORER）覆盖约 70 条；navigation 4 条、annotations 3 条、graph_code 7 条完全无记录 |
| 行为语义（错误码/边界） | 8/10 | 400/401/404/422 边界写得很细 |
| 与实际代码的同步机制 | **0/10** | 无生成、无 schema 校验、无 CI 检查；`e2e_contract.py` 是手工脚本且不在 CI |
| **综合** | **约 6.5/10** | 手写质量高，但**靠人维护，已经开始腐化** |

### 5.4 建议（只读审计，不实施）

1. 用 FastAPI 自带 `app.openapi()` 生成 `openapi.json` 并在 CI 里 diff，把契约文档从"手写"变成"生成 + 手写补充"。
2. 优先补 3 处硬缺口：`status.stage` 枚举、`health.app` 字段、`MessageCreate.graph_anchor`。
3. 补 navigation 4 条 + annotations 3 条 —— 这些是有前端 UI 的主要功能。
4. `spec:301-302` 把 `docs/*.md` 打进安装包，意味着**过期契约会随安装器分发**；建议打包前用生成结果覆盖。

---

## 6. 对"改造成 DSH 插件"的评估

### 6.1 现状与 DSH 的结构差异

| 层 | CodeSplit 现状 | DSH |
|---|---|---|
| 宿主 | Electron 主进程（`main.ts` 381 行） | 已有 Host 进程 + `apps/web` Web UI（浏览器访问） |
| UI | Vite + React 18 + Monaco，`window.codeslice` 桥 | 已有 Web UI + Cordis 插件 Slots（`cordis_inspect_query` 可查 `Slots.listSubTree`） |
| 后端 | 本机 Python FastAPI + uvicorn（PyInstaller 打包） | 无内建 Python 运行时；工具通过 Service/Tool 注册 |
| 通道 | HTTP + SSE，`X-Session-Token` | in-process Service 调用 + Event；MCP 可接外部进程 |
| 分发 | NSIS / AppImage / deb / rpm | npm bundle + `plugin_manager install_bundle` |

### 6.2 问题一：桌面壳还需要吗？

**结论：绝大部分不需要，建议整层废弃。**

| `main.ts` 能力 | DSH 里是否还需要 | 替代 |
|---|---|---|
| `BrowserWindow` + 自绘标题栏 + bounds 持久化（`:47-84, 226-265`） | ❌ 不需要 | 用户用浏览器；窗口状态由浏览器/OS 管 |
| IPC `pick-folder`（`:306-313`） | ⚠️ 需要但形态不同 | DSH Host 端做目录选择（原生对话框）或直接让用户填路径；也可用 `<input type="file" webkitdirectory>` |
| IPC `open-external`（`:315-318`） | ✅ 需要 | Host 侧一个 `shell` Service 或前端 `target="_blank"`（DSH 已有浏览器内导航策略） |
| `window-minimize/maximize/close`（`:292-304`） | ❌ 不需要 | 浏览器自带 |
| 后端 spawn + READY 握手（`:129-209`） | ⚠️ **核心决策点**，见 §6.3 | |
| 单实例锁（`:340-348`） | ❌ 不需要 | 浏览器可开多标签，Host 本身是单例 |
| 退出回收子进程（`:211-220, 377-380`） | ⚠️ 若仍 spawn Python，需要 | Host 进程退出钩子 |
| CSP（`frontend/index.html:9-11`） | ❌ 不需要 | 由 DSH Web UI 统一提供 |
| 更新检查（`releases.ts`） | ❌ 不需要 | 由 npm 包版本 + DSH 升级机制替代 |

**保留价值最高的两块**：
1. `bridge.ts` 抽象本身（`apiBase()`/`getToken()` 的三级回退）——这是一层很好的"有壳/无壳双模"设计，移植时改成"DSH Service 注入 baseUrl"即可。
2. `ReleaseNotice` 这种"发现新版本 → 跳转下载"的**纯前端**组件，可以直接变成插件里的一个 Slot 组件（几乎零改动）。

### 6.3 问题二：Python 后端如何被 DSH 拉起，还是改写成 TS？

三条路线，按推荐度排序：

**路线 A：Python 作为 MCP 子进程（推荐，改动最小）**

```
DSH Host ──stdio/HTTP──▶ CodeSplit Python (uvicorn)
              ↑ MCP server 形态
```
- 需要：给 `backend/app` 加一层 MCP server（或一个 `mcp` 适配器），把现有 90 条 REST 里**真正需要给 Agent 用的**（search / read file / definition / references / hover / graph / notes）暴露为 MCP Tools。
- 保留：Python 的 tree-sitter、langgraph、SQLite FTS5、向量检索 —— 这些是**重写成本最高**的部分（tree-sitter 11 种语法 + AST 图谱 + FTS tokenizer 中文 bigram，见 `retrieval/tokenize.py`）。
- 废弃：Electron 壳、NSIS 打包、令牌鉴权（MCP stdio 无需）。
- 分发：`uv` / `pipx` 安装，或 DSH bundle 里带一个 `postinstall` 拉取；不再需要 PyInstaller（**体积从 92 MB 降到依赖下载，且不再有 av 误报问题**）。
- 代价：用户需要 Python 3.11+（CodeSplit 现状是"装了 exe 就行"，这是**体验回退**）。

**路线 B：Python 保持独立进程 + DSH 插件只做 UI（兼容度最高）**

- 插件是一个纯 Client 插件：用 iframe 或 Slot 组件把 CodeSlice 的前端搬进 DSH Web UI，后端仍以 `http://127.0.0.1:<port>` 提供服务。
- 需要 Host 插件负责：spawn/停止 Python 进程（替代 `main.ts:129-220`）、把 `apiBase + token` 通过 Event/Service 传给 Client 插件（替代 `preload.ts`）。
- 优点：**前端 90% 代码可复用**（`frontend/src` 里的 `api.ts`/`apiTerminal.ts`/`bridge.ts` 接口不变）。
- 缺点：仍要打包 Python（除非改成路线 A 的依赖安装方式）；CSP 要由 DSH 放行 `http://127.0.0.1:*`（当前 DSH 的策略是 `default-src 'self'` 一类，需要确认 —— **未确认**）。

**路线 C：整体改写为 TypeScript（工作量最大，最"DSH 原生"）**

| 模块 | TS 可替代性 | 评估 |
|---|---|---|
| FastAPI 90 条路由 | ✅ 高 | DSH Host 已有 HTTP/Service 设施 |
| SQLite（`db.py` 443 行，含 FTS5 + 18 张表） | ✅ 高 | `better-sqlite3` 支持 FTS5 |
| tree-sitter 11 语言 + AST 图谱（`graph/ast/` + `graph/builder.py`） | 🟡 中 | `web-tree-sitter` 可行但**性能与 WASM 分发**是新风险；11 个 grammar 的 wasm 打包很重 |
| 中文 FTS tokenizer（`retrieval/tokenize.py`，bigram） | ✅ 高 | 纯逻辑，可直接翻译 |
| LangGraph 工作流（`agent/graph.py` 897 行，interrupt/resume/checkpoint） | ⚠️ **低** | `@langchain/langgraph` JS 版存在，但 checkpoint-sqlite、interrupt 语义需重验；这是**风险最高的一块** |
| keyring → Windows Credential Manager | ✅ 高 | `keytar`（已停止维护）/ 系统 `secret-tool`；DSH 是否有凭据 Service **未确认** |
| 终端 sandbox（`services/terminal.py` + `sandbox.py`） | ✅ 高 | `child_process` |
| 65 个 pytest 文件 / 381 个用例 | ❌ 需重写 | 这是**真正的成本**：重写要重跑全部行为测试 |

**推荐组合**：路线 A（Python 作为 MCP server）+ 少量路线 B（保留一个可选 Web UI 插件）。理由：
1. Python 侧的**技术资产密度极高**（381 个测试、11 种 tree-sitter、897 行 LangGraph 状态机、中文 FTS），重写风险 >> 保留成本。
2. DSH 的 MCP 支持（`references/mcp-bundle.md`）已经把"外部进程 → 工具"这条路铺好了。
3. 桌面壳的**全部价值**（窗口、标题栏、单实例、rcedit 图标、NSIS）在 DSH 里都是负担，属于"应该删掉的代码"。

### 6.4 问题三：打包/分发方式要变成什么样

| 现状 | DSH 插件形态 |
|---|---|
| PyInstaller one-dir 92 MB + electron-builder NSIS 121 MB | bundle（`package.json` + `cordis.patch.yml` + `index.js`/`client.js` + `locale/` + `icon.svg`），KB 级 |
| 4 处版本号手工同步 | npm `version` 单一真相 + DSH 的 `engines.dsh` |
| `win.signAndEditExecutable:false` + 三步 rcedit（`build_desktop.ps1:411-567`） | ❌ 全部消失 |
| 图标哈希校验（`Icon.ExtractAssociatedIcon`） | ❌ 消失；只需 `icon.svg` + `references/host-plugin.md` 的展示资源要求 |
| `extraResources` 三份拷贝（backend/frontend/icon） | ❌ 消失（Python 走 MCP spawn 而非随包携带） |
| GitHub Release 挂 4 个安装包 + SHA256SUMS | npm registry / 本地 bundle 目录；`plugin_manager install_bundle` |
| 杀软误报（`spec:368` upx 注释、`README.md:221-229`） | ❌ 消失 |

**代价与新增工作**：
- 需要给 Python 依赖一个**可复现安装路径**：`uv tool install codeslice-mcp` 或 bundle 内 `python -m venv`（后者会把 92 MB 问题重新引入，只是从"打包时"挪到"安装时"）。
- 需要处理**首次运行无 Python** 的降级（提示 + 引导），这是 CodeSlice 现状没有的用户体验问题。
- Linux 上 `keyring` 需要 `SecretService`/`kwallet`（`spec:270-277` 已有 hiddenimports），在 DSH 里要么复用 Host 的凭据能力，要么保留 keyring。

### 6.5 问题四：令牌鉴权机制在 DSH 内还需要吗？

**结论：MCP stdio 路线下不需要；HTTP 路线下强烈建议保留。**

现状机制（`deps.py:14-18` + `config.py:32,39-42`）的三层防护：
1. `host = 127.0.0.1`（`config.py:33`）—— 不监听外部网卡
2. 每次启动随机 `token_urlsafe(24)`（`config.py:42`）—— 仅内存
3. 除 `/api/health` 外全部走 `TokenDep`（83 处引用，`grep` 实测）

这三层合起来防的是：**本机上其他进程（包括浏览器里的任意网页）不能直接调这个本地 API**。这是"本地 HTTP 服务"这个形态**固有**的攻击面。

| 迁移形态 | 是否还需要 token |
|---|---|
| MCP stdio（Host 直接 spawn，管道通信） | ❌ 不需要。进程边界 + 父进程管道本身就是鉴权 |
| MCP over HTTP（127.0.0.1） | ✅ **需要**，且应保留"启动时随机 + 仅内存 + 单端点例外（health）"的现状 |
| 纯 in-process Service（路线 C 完成态） | ❌ 不需要 |
| 插件 iframe + 本地 HTTP（路线 B） | ✅ 需要，但注意 **CSP 已放行 `http://127.0.0.1:*`**（`frontend/index.html:10` 的 `connect-src`）→ 任何注入到该页面的脚本都能拿 token。这层防护在浏览器环境里比 Electron 里更弱 |

**另外两点现状问题值得在迁移时一并修掉**：
1. `/api/health` 无鉴权（`system.py:10-17`）—— 契约里明确是例外，但它返回 `data_dir` 绝对路径（`system.py:16`），**任何本地进程都能探测到用户目录**。建议去掉 `data_dir` 或也要求 token。
2. `asset` 端点把 token 放 query string（`projects.py:194-206`）—— 会进浏览器历史/日志。DSH 里如果前端仍用 `<img src>`，这是唯一可行方案，但可改用**短时效签名**替代长期会话令牌。

### 6.6 迁移路线建议（分阶段）

| 阶段 | 内容 | 产出 | 风险 |
|---|---|---|---|
| P0 | 给 `backend/app` 加 MCP server 适配层，暴露 8–10 个只读 Tool（search/read_file/definition/references/hover/graph/notes） | 一个可被 DSH 连上的 MCP server | 低（不改现有代码，只加一层） |
| P1 | 写一个最小 Host 插件：`mcp` bundle（按 `references/mcp-bundle.md`），配置指向 Python 进程 | DSH 里能用 CodeSplit 的检索能力 | 低 |
| P2 | 把 `frontend/src` 里**与壳无关**的组件（`ReleaseNotice`、`Markdown`、知识图谱可视化）移植成 Client 插件 Slot | 可视能力进 DSH Web UI | 中（CSP + Monaco 体积） |
| P3 | 决策：Python 依赖如何分发（uv / venv / 容器） | 安装文档 | **高**（这是唯一的真实体验回退点） |
| P4 | 废弃 `desktop/`、`packaging/`、`.github/workflows/release.yml` | 删代码 | 低（但需保留一个 release tag 作为历史） |

**不建议做的事**：
- 不要为了"DSH 原生"而重写 LangGraph 工作流到 TS（`agent/graph.py` 897 行 + `test_agent.py` 13 个用例 + `test_sse_http.py` 5 个用例 + `test_node_config.py` 25 个用例，全是行为契约）。
- 不要把 PyInstaller 换成"bundle 内嵌 Python 运行时"——那只是把 92 MB 从安装器挪到插件包里，还丢掉了 `console=True` 的 READY 握手优势。

---

## 7. 附录：根目录杂项说明

### 7.1 `.devdata/`（71 个条目）

本地开发/验证产生的数据目录，被 `.gitignore:70` 忽略。文件名形态可分四类：

| 形态 | 例子 | 用途 |
|---|---|---|
| **进程 stdout/stderr 快照** | `stdout.txt`, `stderr.txt`, `stdout2.txt`, `stderr2.txt`, `app.out.log`, `app.err.log`, `app2.*`, `e2.*`, `ui.out.log`, `ui.err.log`, `mock.out.log`, `packaged.out.log`, `packaged.err.log`, `backend.out.log`, `backend.err.log`, `ui-backend-v2.log`, `ui-electron-v2.log`, `ui-vite-v2.log`, `ui-backend-8021.log`, `ui-backend-mock.log`, `ui-backend-final.log`, `ui-mock-model.log`, `ui-mock-model-tool.log` | 手工起后端/Electron/Vite/mock 模型时重定向的日志；数字后缀表示多轮尝试 |
| **数据目录副本** | `packaged/`, `uismoke/`, `ollama-check/`, `ui-ollama/` — 每个含 `codeslice.db`, `logs/backend.log`, `checkpoints.db`(+`-shm`/`-wal`) | 用 `CODESLICE_DATA_DIR` 指向这些目录做隔离验证 |
| **导出产物** | `ui-ollama/notes/CodeSplit/*.md`（`e2e note v2.md`、`e2e note v2-20261105-160201.md`、`卡片检查·笔记.md` 等） | 笔记导出的重名时间戳验证 |
| **杂项** | `probe.json`、`secrets.json` | 探测结果 / 测试用假凭据 |

> 🟡 `secrets.json` 出现在 `.devdata/` 下 —— 需确认它不是真实 API Key（`.gitignore:80` 有 `secrets.local.*` 但**没有** `secrets.json` 规则；不过 `.devdata/` 整目录已忽略，所以不会入库）。**内容未读取**（按任务要求"不必读内容细节"）。

### 7.2 `.codeslice/`（1 个文件）

`graph.json.stale` —— 被 `.gitignore:69` 忽略。这是旧版图谱缓存的**淘汰标记**：`backend/app/graph/store.py` 在有 SQLite `graphs` 表后，把旧的 `graph.json` 重命名为 `.stale` 表示"已导入一次，不再重走源码树"。`test_graph_cache.py:253-310` 有两个用例专门验证这个迁移与"retired 后不再 re-walk"的行为（`test_legacy_file_is_retired_so_later_starts_never_re_walk`）。

所以这个文件的存在意义是：**历史遗留标记，可安全删除**（删除后只会多走一次源码树重建，不会丢数据）。

### 7.3 `acl-recovery/`（12 个文件）

被 `.gitignore:108` 忽略。**不属于 CodeSplit 项目代码**，是 DSH 沙箱 ACL 修复工具的运行产物：

- `acl-backup-<md5>.json` + 同名 `.json.ps1` —— ACL 备份（后者是 798 行的 `diagnose-windows-sandbox-acl` 脚本副本）
- `acl-report-<md5>.jsonl` —— 逐条 JSONL 报告（`{"kind":"invocation","operation":"repair","path":"D:\\CodeSplit","allowRoot":"D:\\CodeSplit",…}` 等 20 行）

说明：曾经（在 DSH 会话里）对 `D:\CodeSplit` 执行过 ACL 诊断/修复，因为沙箱无法写入该目录。**这与本次审计任务的前提（"pwsh 在本会话因沙箱 ACL 失败"）完全吻合** —— `acl-recovery/` 就是那次修复的痕迹。

> 建议：这个目录对项目无意义，可安全删除（`.gitignore:108` 已忽略）。

### 7.4 根目录构建日志

`.build-backend.log`（0 字节）、`.build-backend-022.log`、`.build-desktop.log`、`.build-desktop2.log`、`.build-backend.log`、`.ui-backend.log`、`.ui-backend.err.log` —— 均被 `.gitignore:99-103`（`*.log`, `/*.out`）忽略。本次审计的**体积与 PASS/FAIL 结论全部来自这些日志**（因为不能跑构建）。

### 7.5 根目录 `.gitignore`（113 行）

比 `desktop/.gitignore`（6 行）严谨得多，显式覆盖了：`.venv`、`packaging/build/`、`packaging/dist-backend/`、`desktop/dist/`、`desktop/release/`、`desktop/resources/backend/`（注释："staged copy of the PyInstaller bundle"）、`*.db*`、`.codeslice/`、`.devdata/`、`acl-recovery/`、`desktop/release-linux/`、`packaging/dist-backend-linux/`。

🟡 **一处遗漏**：`uv.lock` **没有被忽略**（正确，应入库），但 `backend/.venv/.lock` 是 uv 的锁文件（`backend/.venv/.lock`），已被 `.venv/` 规则覆盖。无问题。

🟡 **一处不一致**：`.gitignore:31` 忽略 `packaging/specs/*.spec.bak`，但 `spec` 文件本身是**入库的**（`:3-4` 注释明确"Do NOT ignore docs/ or packaging/specs/"）。这是刻意的，正确。

---

## 8. 未确认事项清单

| # | 事项 | 原因 |
|---|---|---|
| 1 | `desktop/release/win-unpacked/resources/` 下是否真有 `backend/` 与 `frontend/` 目录 | `glob` 只返回 `app.asar`，可能被目录过滤；历史日志曾确认存在 |
| 2 | `packaging/dist-backend/` 除 `_internal/base_library.zip` 外的实际内容 | 同上；历史日志确认 exe 24.73 MB / bundle 92.4 MB |
| 3 | `_internal/` 内 `langchain*`/`fastapi`/`starlette`/`anthropic`/`openai` 的落点 | glob 的 385 条只覆盖部分子目录，纯 Python 包可能在 `base_library.zip` 或 `.pyz` 内 |
| 4 | 92.4 MB → 22.9 MB（安装后 backend exe）的差异原因 | 两份日志属不同构建批次 |
| 5 | `main.ts:283` 的 `file://` 回退路径在打包后是否真的能加载 | 需运行时验证；`__dirname` 在 asar 内 |
| 6 | DSH Web UI 的 CSP 是否放行 `http://127.0.0.1:*`（影响路线 B） | 未在本会话内查询 DSH 的 CSP 配置 |
| 7 | `frontend/tests/graph.test.mjs` 是否曾存在 | `package.json:12` 引用它，但目录不存在 |
| 8 | `.devdata/secrets.json` 是否含真实凭据 | 按任务要求未读内容 |
| 9 | AppImage/deb/rpm 的实际体积 | 只有 SHA256，无体积记录 |
| 10 | Linux 产物是否存在（`release-linux/` 未在 glob 中出现） | 可能未在本机构建 |

---

## 9. 一页纸行动建议（若后续要改）

**立即可做（低风险、高收益）**
1. 把 `status.stage` 枚举与 `MessageCreate.graph_anchor` 补进 `API_CONTRACT.md` —— 这是**会直接导致前端 bug** 的契约错误（`agent/graph.py:312` vs `API_CONTRACT.md:189`）。
2. 把 `backend/pyproject.toml` 的 `numpy` 移除（实测零使用），`spec` 里 `excludes` 加 `sqlite_vec`/`sentry_sdk`/`opentelemetry*`/`httpx2`。
3. 把 `fastapi[standard]` 改成 `fastapi` + 显式 `uvicorn[standard]`，砍掉 cloud-cli/sentry/otel 链。
4. 版本号收敛为单一来源（生成 `frontend/package.json` 与 `config.py:VERSION`），或在 CI 里加一致性断言。
5. `ReleaseNotice.tsx:14` 按 `platform` 分支文案 + `releases.ts:69` 的 installer 正则按平台匹配。

**需要设计（中风险）**
6. `main.ts` 加 `will-navigate` 拦截 + `setPermissionRequestHandler`。
7. `stopBackend()` 改成进程树 kill；`app.on('quit')` 前加 `stopBackend()`（不只 `will-quit`+`quitting`）。
8. CI 加 `pytest` + `ruff`，`release.yml` 的 node 版本与文档对齐（22 vs 24）。
9. 用 `app.openapi()` 生成 schema 并在 CI diff，替代手写契约。

**战略（高风险，需产品决策）**
10. 桌面壳 → MCP 化的可行性验证（P0/P1 两阶段），先不删任何现有代码。
11. 决定 Python 分发方式（uv tool vs venv），这是"改造成 DSH 插件"唯一的真实体验回退点。
