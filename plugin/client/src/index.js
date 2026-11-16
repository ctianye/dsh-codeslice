import { registerLocale, makeTranslator, mergeDict } from './i18n.js';
import { STYLE_MARKER, fullCss } from './styles.js';
import { Glyph, h } from './icons.js';
import { mountBetterSidebar } from './better-sidebar.js';
import { NotesPanel } from './notes-panel.js';
import { AnnotatedView } from './annotated-view.js';
import { CodeSliceBar } from './codeslice-bar.js';
import { SidebarReader } from './sidebar/reader.js';
import { startCodeSliceOverlay } from './sidebar/overlay.js';
import { SIDEBAR_LOCALE } from './sidebar/locale.js';
import { SIDEBAR_CSS } from './sidebar/style.js';
import { GRAPH_LOCALE } from './graph/locale.js';
import { GRAPH_CSS } from './graph/style.js';
import { WORKBENCH_LOCALE } from './workbench/locale.js';
import { WORKBENCH_CSS } from './workbench/style.js';
import { WorkbenchPage } from './workbench/pages.js';
import { ixRegisterConversationView } from './session-view.js';
import { setSelection, requestQuote, requestPrompt } from './selection-store.js';
import { revealCodeRange } from './reveal-code.js';
// Side-effect modules: they contribute copy and styles through the same
// registration seams the shell uses, so adding a feature never edits a file
// another feature is editing.
import './i18n-chat.js';
import './styles-chat.js';

/**
 * Browser half of the CodeSlice bundle.
 *
 * Registers the v3 surfaces, each independently optional:
 *
 *   `codeslice:reader`      a multi-tab read-only code reader (tree + editor + frames)
 *   `codeslice:knowledge`   a tab — the note knowledge base (folders, list, reader)
 *   `codeslice:annotated`  a file viewer for annotated read-only code
 *   `codeslice:bar`         a composer dock chip (selection reference + note action)
 *   `main`                  the workbench panel (notes / projects / note graph / settings)
 *   `conversation.view`     the session-scoped code graph, beside 对话 / 轨迹
 *
 * Degradation is explicit rather than defensive: a profile without
 * `dsh-better-sidebar` still gets the composer chip, and one without the slots
 * service still gets nothing that throws. Every registration goes through
 * `ctx.effect` so disposal is the host's problem, not a hand-written teardown.
 *
 * Locale and styles are bootstrapped unconditionally — a tab whose strings are
 * keys and whose layout is unstyled is worse than an absent tab.
 */

/** Tab order: the reader and notes in the right sidebar. */
const TAB_ORDER = { reader: 35, notes: 45 };

/** The horizontal main-panel key and the left-sidebar row id. */
const PANEL_ID = 'codeslice';

/**
 * Pending reader focus ranges, seeded by a graph/workbench opener before the
 * reader tab exists. Key is `sessionId::path`; the reader consumes and deletes
 * its own seed on first mount.
 * @type {Map<string, {path:string, startLine:number, endLine:number, nonce:number}>}
 */
const ixReaderSeed = new Map();

/** One-shot nonce shared by the reader seed and the graph-root seed. */
let ixSeedNonce = 0;

/** Copy owned by this integration shell; area keys live in their own modules. */
const IX_INDEX_LOCALE = {
  zh: {
    'reader.tab.title': '代码阅读',
    'reader.tab.desc': '文件树、多标签只读代码与关联区间',
  },
  en: {
    'reader.tab.title': 'Code reader',
    'reader.tab.desc': 'File tree, multi-tab read-only code and framed ranges',
  },
};

/**
 * Register the panel into the host.
 *
 * @param ctx - the Cordis client context. `ctx.get('betterSidebar')` is the tab
 *   service; `ctx.slots` is the slot registry; `ctx.inject(['locale'], …)` is
 *   used so a missing locale service does not throw on activation.
 */
export function apply(ctx) {
  const t = makeTranslator(ctx);

  // The bundle is one `factory(require)` scope: `require` is declared by the
  // loader around this code even though no module imports it. Capture it here
  // so the vendored Better Sidebar client can be instantiated later (a bare
  // `require` is not a page global).
  const moduleRequire = typeof require === 'function' ? require : undefined;

  // Testability seam: the focus-range seed is module-private, so the harness
  // proves it lands before the reader mounts and is consumed afterwards through
  // this handle. A frozen/host context that rejects the property simply leaves
  // the probe unavailable; production behaviour is unchanged.
  try {
    if (ctx !== null && typeof ctx === 'object') {
      ctx.__codesliceProbe = { readerSeed: ixReaderSeed };
    }
  } catch { /* probe unavailable on a frozen context */ }

  // ---- copy ---------------------------------------------------------
  registerLocale(ctx);
  mergeDict(SIDEBAR_LOCALE);
  mergeDict(GRAPH_LOCALE);
  mergeDict(WORKBENCH_LOCALE);
  mergeDict(IX_INDEX_LOCALE);

  // ---- styles -------------------------------------------------------
  //
  // Injected once, marked with `data-codeslice`, and removed by the effect's
  // disposer. Removing on dispose (rather than leaving the sheet behind) matters
  // because a plugin can be disabled and re-enabled in one session; two sheets
  // would double every `color-mix` chain and drift the palette.
  ctx.effect(() => {
    if (typeof document === 'undefined') return undefined;
    const element = document.createElement('style');
    element.dataset.codeslice = STYLE_MARKER;
    element.textContent = `${fullCss()}\n${SIDEBAR_CSS}\n${GRAPH_CSS}\n${WORKBENCH_CSS}`;
    document.head.appendChild(element);
    return () => element.remove();
  }, 'codeslice: styles');

  // ---- integration bridges --------------------------------------------

  /** Seed map key: `sessionId::path` (an empty session id matches the global panel). */
  const ixSeedKey = (sessionId, path) => `${String(sessionId ?? '')}::${String(path ?? '')}`;

  /** Consume the pending focus range for the reader tab being mounted. */
  const ixReaderFocusFor = (properties) => {
    const sessionId = properties?.sessionId ?? properties?.scope?.sessionId;
    const path = properties?.tab?.path;
    if (typeof path !== 'string' || path === '') return undefined;
    const key = ixSeedKey(sessionId, path);
    const seed = ixReaderSeed.get(key);
    if (seed === undefined) return undefined;
    ixReaderSeed.delete(key);
    return seed;
  };

  /** Open a file in the reader, staging its line range behind the seed channel. */
  const ixOpenFileInReader = (properties, target) => {
    const path = typeof target?.path === 'string' ? target.path : '';
    if (path === '') return;
    const sessionId = properties?.sessionId ?? target?.sessionId ?? properties?.scope?.sessionId;
    const cwd = properties?.scope?.cwd ?? target?.cwd;
    const startLine = Number(target.startLine ?? target.line);
    const endLine = Number(target.endLine ?? target.end_line);
    const commit = typeof target.commit === 'string' ? target.commit : '';
    const boxStart = Number(target.box?.startLine ?? target.startLine ?? target.line);
    const boxEnd = Number(target.box?.endLine ?? target.endLine ?? target.end_line ?? boxStart);
    const seed = Number.isFinite(startLine) && startLine > 0
      ? {
        path,
        startLine: Math.trunc(startLine),
        endLine: Number.isFinite(endLine) && endLine > 0 ? Math.trunc(endLine) : Math.trunc(startLine),
        ...(commit === '' ? {} : { commit }),
        ...(Number.isFinite(boxStart) && boxStart > 0
          ? { boxStart: Math.trunc(boxStart), boxEnd: Number.isFinite(boxEnd) && boxEnd >= boxStart ? Math.trunc(boxEnd) : Math.trunc(boxStart) }
          : {}),
        nonce: (ixSeedNonce += 1),
      }
      : undefined;
    if (seed !== undefined) ixReaderSeed.set(ixSeedKey(sessionId, path), seed);

    // Switching the session is what makes the right sidebar visible at all: a
    // global main-panel tab (the workbench) hides it, so a citation opened there
    // stays invisible until the owning conversation is on screen.
    const activate = typeof target?.activateSession === 'string' && target.activateSession !== ''
      ? target.activateSession
      : '';
    const activateNow = () => {
      if (activate === '') return;
      setTimeout(() => {
        try {
          const workspace = ctx.get('uiWorkspace');
          if (workspace !== undefined && workspace !== null && typeof workspace.openSession === 'function') {
            workspace.openSession(activate);
          }
        } catch {
          // Without the navigation service the tab is still open behind the panel.
        }
      }, 150);
    };

    // A note citation owns a box: the shared reveal path opens the file in the
    // right sidebar, scrolls to the range, and the recorded frame paints it.
    if (seed !== undefined && target?.box !== undefined && revealCodeRange(ctx, {
      path,
      startLine: seed.startLine,
      endLine: seed.endLine,
      ...(typeof target?.title === 'string' && target.title !== '' ? { title: target.title } : {}),
    }, cwd, sessionId)) {
      activateNow();
      return;
    }

    // The graph's "open code" action carries real line numbers. Use the shared
    // reveal path so the right sidebar scrolls to the node instead of opening a
    // file tab parked at line 1; a missing better-sidebar falls through.
    if (seed !== undefined && target?.box === undefined && commit === '' && revealCodeRange(ctx, {
      path,
      startLine: seed.startLine,
      endLine: seed.endLine,
    }, cwd, sessionId)) {
      activateNow();
      return;
    }

    // DSH's own right Sidebar is the surface this profile actually mounts: a
    // file opens ONE tab and the reader's own tab strip owns the rest. The
    // optional better-sidebar registry stays as the fallback for profiles that
    // install that plugin instead.
    const nativeRight = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : undefined;
    const sidebar = ctx.get('betterSidebar');
    // Opening a file from the workbench graph happens outside a conversation;
    // unlike the composer bar there is no earlier reveal that expanded the
    // right column, so expand it here or the new tab is invisible.
    try {
      if (nativeRight !== undefined && nativeRight !== null && typeof nativeRight.isExpanded === 'function' && nativeRight.isExpanded() === false) {
        nativeRight.toggleExpanded?.();
      }
      nativeRight?.focus?.();
    } catch {
      // A collapsed sidebar can still accept the tab; expansion is best effort.
    }

    // The vendored Better Sidebar owns file opening when it is mounted: its
    // editor is the multi-tab surface the user asked for. Its `openFile` takes
    // (scope, path, title) and reuses one tab per path — the VS Code behaviour.
    if (seed === undefined && sidebar !== undefined && sidebar !== null && typeof sidebar.openFile === 'function') {
      const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      try {
        const opened = sidebar.openFile(sessionId ?? '', path, base);
        if (opened !== undefined && typeof opened.then === 'function') {
          opened.catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger?.warn?.(`codeslice: better-sidebar openFile failed: ${message}`);
          });
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: better-sidebar openFile failed: ${message}`);
      }
    }

    if (nativeRight !== undefined && nativeRight !== null && typeof nativeRight.openTab === 'function') {
      try {
        nativeRight.openTab('codeslice:reader', {
          params: seed === undefined ? { path } : { ...seed },
        });
        activateNow();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: native reader open failed: ${message}`);
      }
    }

    if (sidebar && typeof sidebar.openTab === 'function') {
      const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      sidebar.openTab(
        { type: 'codeslice:reader', path, title: base },
        {
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(cwd === undefined ? {} : { cwd }),
        },
      );
      activateNow();
    } else {
      ctx.logger?.warn?.('codeslice: sidebar service unavailable; the file cannot be opened in the reader');
    }
  };

  /**
   * Publish a picked range and park one quote request on the shared store. The
   * composer bar owns the host `inputActions` and consumes the one-shot request,
   * the same channel the old code pane used.
   */
  const ixAskSelection = (payload) => {
    if (payload === null || payload === undefined) return;
    const path = typeof payload.path === 'string' ? payload.path : '';
    if (path === '') return;
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const code = typeof payload.code === 'string' ? payload.code : payload.text;
    setSelection({
      path,
      startLine: payload.startLine,
      endLine: payload.endLine,
      code: typeof code === 'string' ? code : '',
    }, sessionId);
    requestQuote({
      path,
      startLine: payload.startLine,
      endLine: payload.endLine,
      code: typeof code === 'string' ? code : '',
    }, sessionId);
  };

  /**
   * Jump back to the originating session's 对话 view.
   *
   * The probe order is the host's own, narrowest first:
   *   1. `uiConversation.binding(sessionId).activate('chat')` — the native
   *      view binding chat itself uses (`activateView` in ui-conversation);
   *   2. `layout.openView('chat')` / `conversation.openView('chat')` — the
   *      optional layout plugin's surface, for profiles that mount it;
   *   3. the visible 对话 tab, clicked directly — a UI-level fallback that
   *      needs no service at all.
   */
  const ixOpenSession = (payload) => {
    if (payload === null || payload === undefined) return;

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    if (sessionId !== '') {
      // A frame can belong to a session that is not the one currently open
      // (every "添加到对话" creates a new session). `openSession` is the host's
      // own navigation call and switches the whole conversation view; the
      // binding below only knows about sessions that are already materialised.
      try {
        const workspace = ctx.get('uiWorkspace');
        if (workspace !== undefined && workspace !== null && typeof workspace.openSession === 'function') {
          workspace.openSession(sessionId);
        }
      } catch {
        // Fall through to the binding/tab fallbacks.
      }
      try {
        const ui = ctx.get('uiConversation');
        const binding = ui !== undefined && ui !== null && typeof ui.binding === 'function'
          ? ui.binding(sessionId)
          : undefined;
        if (binding !== undefined && binding !== null && typeof binding.activate === 'function') {
          binding.activate('chat');
          // `activate('chat')` scrolls the session to its chat target but does
          // not change which conversation view tab is showing. The tab strip is
          // host-owned DOM, so click the 对话 tab the user can see as well.
          const tabs = typeof document === 'undefined'
            ? []
            : [...document.querySelectorAll('[role="tab"]')];
          const chat = tabs.find((node) => String(node.textContent).trim() === t('chat.title'));
          if (chat !== undefined) {
            chat.click();
            return;
          }
          return;
        }
      } catch {
        // Fall through to the layout services.
      }
    }

    const tryView = (service, viewName) => {
      if (service === null || service === undefined || typeof service.openView !== 'function') return false;
      try {
        service.openView(viewName);
        return true;
      } catch {
        return false;
      }
    };

    if (tryView(ctx.get('layout'), 'chat')) return;
    if (tryView(ctx.get('conversation'), 'chat')) return;

    // Last resort: click the conversation tab the user can see. The host keeps
    // its tab strip in the document, and a programmatic click is a real user
    // gesture for React's synthetic handler.
    try {
      const tabs = typeof document === 'undefined'
        ? []
        : [...document.querySelectorAll('[role="tab"]')];
      const chat = tabs.find((node) => String(node.textContent).trim() === t('chat.title'));
      if (chat !== undefined) {
        chat.click();
        return;
      }
    } catch {
      // Nothing else to try; the question still lands in the composer below.
    }

    ctx.logger?.warn?.(`codeslice: no openView service; session ${sessionId} cannot be focused automatically`);
    const sidebar = ctx.get('betterSidebar');
    if (sidebar && typeof sidebar.openTab === 'function') {
      sidebar.openTab(
        { type: 'codeslice:reader', sessionId: payload.sessionId, title: payload.title ?? payload.sessionId },
        { sessionId: payload.sessionId },
      );
    }
    if (typeof payload.question === 'string' && payload.question !== '') {
      requestPrompt(payload.question, typeof payload.sessionId === 'string' ? payload.sessionId : '');
    }
  };

  /**
   * Move the workbench to the session graph view and point it at `root`. The
   * host has no cross-root switch in this build: both probe services are tried,
   * and when neither answers the gap is warned visibly instead of failing
   * silently.
   */
  const ixOpenGraph = (target) => {
    const root = typeof target?.root === 'string' ? target.root : '';
    const tryView = (service) => {
      if (service === null || service === undefined || typeof service.openView !== 'function') return false;
      try {
        service.openView('conversation');
        return true;
      } catch {
        return false;
      }
    };

    if (tryView(ctx.get('layout'))) return;
    if (tryView(ctx.get('conversation'))) return;

    ctx.logger?.warn?.(`codeslice: host exposes no cross-root view switch; graph for ${root} cannot be focused automatically`);
  };

  // ---- native right Sidebar -----------------------------------------
  //
  // The desktop profile mounts DSH's OWN right Sidebar (`ctx.sidebarRight` +
  // `ctx.sidebarRightTabs`); the optional better-sidebar plugin is absent and
  // sees `betterSidebar === undefined`, which is why the reader never opened.
  // The reader registers as a native tab type here, and the optional registry
  // below stays as the fallback for profiles that do install that plugin.
  const ixSessionCwd = (sessionId) => {
    try {
      const entry = ctx.get('sessions')?.list?.getSnapshot?.().byId?.[sessionId];
      return typeof entry?.cwd === 'string' && entry.cwd !== '' ? entry.cwd : undefined;
    } catch {
      return undefined;
    }
  };

  /** Map the native tab record onto the props `SidebarReader` already takes. */
  const ixReaderNativeProps = (properties) => {
    const info = typeof properties?.useTabInfo === 'function' ? properties.useTabInfo() : undefined;
    const tab = info?.tab;
    const params = tab?.navigation?.params ?? {};
    const sessionId = typeof properties?.sessionId === 'string' ? properties.sessionId : undefined;
    const cwd = ixSessionCwd(sessionId);
    const path = typeof params.path === 'string' ? params.path : '';
    const startLine = Number(params.startLine);
    const endLine = Number(params.endLine);
    const commit = typeof params.commit === 'string' ? params.commit : '';
    const boxStart = Number(params.boxStart);
    const boxEnd = Number(params.boxEnd);
    return {
      ctx,
      t,
      locale: t.locale,
      scope: {
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(cwd === undefined ? {} : { cwd }),
      },
      tab: {
        ...(path === '' ? {} : { path }),
        ...(tab?.id === undefined ? {} : { id: tab.id }),
      },
      visible: tab === undefined ? true : tab.visible !== false,
      focusRequest: path !== '' && Number.isFinite(startLine) && startLine > 0
        ? {
          path,
          startLine: Math.trunc(startLine),
          endLine: Number.isFinite(endLine) && endLine > 0 ? Math.trunc(endLine) : Math.trunc(startLine),
          nonce: Number(params.nonce) || 0,
          ...(commit === '' ? {} : { commit }),
          ...(Number.isFinite(boxStart) && boxStart > 0
            ? { box: { startLine: Math.trunc(boxStart), endLine: Number.isFinite(boxEnd) && boxEnd >= boxStart ? Math.trunc(boxEnd) : Math.trunc(boxStart) } }
            : {}),
        }
        : undefined,
      onOpenFile: (target) => ixOpenFileInReader({ sessionId, scope: { cwd } }, target),
      onAskSelection: ixAskSelection,
      onSelectionChange: (selection) => setSelection(selection, sessionId),
      onOpenSession: ixOpenSession,
    };
  };

  // The vendored Better Sidebar is the reader now: its tab strip and editor own
  // file opening, so this profile must not also register a native `代码阅读` tab
  // (that would put two readers in the same right rail). The native registration
  // stays below as an opt-in fallback for a profile where the vendored bundle
  // cannot start; set `__csUseNativeReader = true` before the plugin activates.
  const useNativeReader = typeof globalThis === 'object' && globalThis !== null
    && globalThis.__csUseNativeReader === true;
  if (useNativeReader && ctx.sidebarRightTabs !== undefined && ctx.sidebarRightTabs !== null
    && typeof ctx.sidebarRightTabs.register === 'function') {
    const nativeKind = 'codeslice:reader';
    const nativeStatus = { type: 'pending', body: 'pending', error: undefined };
    if (typeof globalThis === 'object' && globalThis !== null) globalThis.__csNative = nativeStatus;
    try {
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: nativeKind,
        kind: nativeKind,
        // One native tab per session; the reader's own strip switches files
        // inside it, so a per-file native tab would duplicate the chrome.
        multiple: false,
        priority: 'extension',
        title: () => t('reader.tab.title'),
        guide: [{
          id: nativeKind,
          order: TAB_ORDER.reader,
          title: () => t('reader.tab.title'),
          description: () => t('reader.tab.desc'),
          icon: (size) => Glyph.code(size ?? 16),
        }],
      }), 'codeslice: native reader type');
      nativeStatus.type = 'ok';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      nativeStatus.error = `type:${message}`;
      ctx.logger?.warn?.(`codeslice: native reader type failed: ${message}`);
    }
    nativeStatus.lookup = typeof ctx.sidebarRightTabs.get === 'function'
      ? (ctx.sidebarRightTabs.get(nativeKind) === undefined ? 'missing' : 'present')
      : 'no-get';

    if (typeof ctx.slots?.inject === 'function') {
      try {
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: nativeKind,
          locale: 'codeslice',
          inject: (sessionId) => ({ sessionId }),
        }, (properties) => h(SidebarReader, ixReaderNativeProps(properties)))), 'codeslice: native reader body');
        nativeStatus.body = 'ok';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nativeStatus.error = `body:${message}`;
        ctx.logger?.warn?.(`codeslice: native reader body failed: ${message}`);
      }
    }
  }

  // ---- tabs and viewer ----------------------------------------------
  //
  // `ctx.inject` keeps the service optional: a profile without better-sidebar
  // still activates, still registers the composer chip, and does not throw.
  ctx.inject(['betterSidebar'], (injected) => {
    const sidebar = injected.get('betterSidebar') ?? ctx.get('betterSidebar');
    if (sidebar === undefined || sidebar === null) return;

    // Read-only diagnostic surface. It answers the one question a browser
    // console cannot otherwise answer — which tab types this page actually
    // registered, and whether the host's settings filter drops them — without
    // touching the host's own services.
    if (typeof globalThis === 'object' && globalThis !== null) {
      globalThis.__codeslice = {
        sidebar,
        tabIds: () => (typeof sidebar.getTabs === 'function' ? sidebar.getTabs().map((entry) => entry.id) : []),
        enabled: (id) => (typeof sidebar.isTabEnabled === 'function' ? sidebar.isTabEnabled(id) : null),
        openReader: (path, title) => sidebar.openTab({ type: 'codeslice:reader', path, title }),
        openNotes: () => sidebar.openTab({ type: 'codeslice:knowledge', title: '知识库' }),
      };
    }

    const registerTab = (descriptor, component) => {
      if (typeof sidebar.registerTab !== 'function') return;
      try {
        ctx.effect(() => sidebar.registerTab({ ...descriptor, component }), `codeslice: ${descriptor.id}`);
      } catch (error) {
        // A duplicate id or a disabled type is the host's call; losing one tab
        // is not worth failing activation over, but the failure is logged.
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: tab ${descriptor.id} registration failed: ${message}`);
      }
    };

    /** Props every tab body receives, with the translator bound in. */
    const withCopy = (Component) => (properties) => h(Component, { ...properties, ctx, t, locale: t.locale });

    registerTab({
      id: 'codeslice:knowledge',
      title: () => t('tab.notes'),
      description: () => t('tab.notes.desc'),
      icon: (size) => Glyph.notes(size ?? 16),
      order: TAB_ORDER.notes,
      single: true,
    }, withCopy(NotesPanel));

    // The viewer. `exts: []` + a priority below the host's own code viewer means
    // it is available everywhere but never wins a file the host already renders
    // well (`CODESLICE-DSH-LAYOUT.md §1.4`).
    if (typeof sidebar.registerFileViewer === 'function') {
      try {
        ctx.effect(() => sidebar.registerFileViewer({
          id: 'codeslice:annotated',
          title: () => t('tab.annotated'),
          description: () => t('tab.annotated.desc'),
          exts: [],
          priority: -200,
          fetchStrategy: 'fsRead',
          component: (properties) => h(AnnotatedView, { ...properties, ctx, t, locale: t.locale }),
        }), 'codeslice: annotated viewer');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: annotated viewer registration failed: ${message}`);
      }
    }
  });

  // ---- the left-sidebar entry, main panel, dock and session view ------
  //
  // A global panel is two registrations with one id: the row in
  // `sidebar.panellist`, and the page under the layout's `main` keyed slot.
  if (ctx.slots !== undefined && typeof ctx.slots.inject === 'function' && typeof ctx.slots.register === 'function') {
    const mount = (owner, descriptor, component, label) => {
      try {
        ctx.effect(
          () => ctx.slots.inject(owner, () => ctx.slots.register(descriptor, component)),
          `codeslice: ${label}`,
        );
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: ${label} slot registration failed: ${message}`);
        return false;
      }
    };

    mount('main', {
      name: 'main',
      key: PANEL_ID,
      locale: 'codeslice',
    }, (properties) => h(WorkbenchPage, {
      ...properties,
      ctx,
      t,
      locale: t.locale,
      onOpenFile: (target) => ixOpenFileInReader(properties, target),
      onOpenGraph: ixOpenGraph,
    }), 'main panel');

    mount('sidebar.panellist', {
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 5,
      label: () => t('ws.title'),
      locale: 'codeslice',
    }, () => h('span', { className: 'cs-nav-icon' }, Glyph.code(16)), 'sidebar row');

    // The composer dock: selection reference + note action + the one-shot quote
    // insertion. It is a list slot immediately above the input; the composer bar
    // itself is a single slot owned by the host and must not be replaced.
    mount('conversation.input.dock', {
      name: 'conversation.input.dock',
      id: 'codeslice:bar',
      order: 40,
      locale: 'codeslice',
    }, (properties) => h(CodeSliceBar, {
      ...properties, ctx, t, locale: t.locale,
    }), 'composer dock');

    // The session-scoped graph view: third item beside 对话 / 轨迹. Failure to
    // register is warned explicitly by the module itself, never silently dropped.
    ixRegisterConversationView(ctx, t, (properties, target) => ixOpenFileInReader(properties, target));
  }

  // ---- CodeSlice's layer on the vendored editor ---------------------
  //
  // The editor itself stays upstream's: this only draws range frames, their
  // title bars, and the "问 CodeSlice" chip. It scans the DOM, so it attaches
  // to whichever editor tab is open now and to ones opened later.
  ctx.effect(() => startCodeSliceOverlay(ctx, {
    onAsk: ixAskSelection,
    onOpenSession: (frame, sessionId) => ixOpenSession({
      sessionId: typeof frame?.sessionId === 'string' && frame.sessionId !== '' ? frame.sessionId : sessionId,
      messageId: frame?.messageId,
    }),
  }), 'codeslice: sidebar overlay');

  // ---- the vendored Better Sidebar ----------------------------------
  //
  // Mounted as a child fiber, after this plugin's own surfaces are registered.
  // Its activation is asynchronous and non-blocking: a profile whose services
  // do not satisfy it leaves `__codesliceBetterSidebar.phase === 'failed'`
  // instead of holding the boot screen, and the native reader above keeps
  // working as the fallback.
  const arm = () => {
    mountBetterSidebar(ctx, moduleRequire).catch((error) => {
      ctx.logger?.warn?.(`codeslice: better-sidebar mount failed: ${String(error?.message ?? error)}`);
    });
  };
  // One idle turn: the shell has mounted its slots and service graph by then.
  setTimeout(arm, 1200);
}
