window.__ModuleLoader__.load({
  id: "dsh-codeslice",
  factory(require) {
    const React = require('react');

    /* ================================================================ *
     * icons.js
     * ================================================================ */
    /**
     * Stroke glyphs, 24×24, `currentColor`.
     *
     * Sized by the caller and never by CSS: the host asks a tab's `icon(size)` for
     * a node at a specific pixel size, and a glyph that silently ignores the
     * argument renders blurry at 14 px or huge at 20 px. Every function is
     * `(size) => node`.
     *
     * ---------------------------------------------------------------------------
     * Why this module also owns the React surface
     * ---------------------------------------------------------------------------
     * A DSH client bundle is exactly one `window.__ModuleLoader__.load({id,
     * factory(require)})` call, and `dev/build-client.mjs` concatenates every module
     * into that one factory body. Inside it, `React` exists
     * (`const React = require('react')`, emitted by the build) and `import … from
     * 'react'` lines are elided — with nothing declaring the imported names.
     *
     * So the bindings have to be declared exactly once, by a module that imports
     * nothing (any ordering hazard disappears), and imported by name from there.
     * This module is that owner: it has no imports, therefore the build always
     * emits it before anything that consumes it.
     *
     * Do not add a second `const h` / `const { useState } = React` anywhere: the
     * bundle is one scope, and a repeat is a redeclaration SyntaxError at load.
     * ---------------------------------------------------------------------------
     */

    /** The one `React.createElement` alias in the bundle. */
    const h = React.createElement;

    /** The hooks every panel uses, bound once for the reason above. */
    const {
      useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef,
    } = React;

    /**
     * Re-export the React surface so every panel imports its hooks from here.
     *
     * Deliberate: this module has no imports of its own, so the build emits it first
     * and the bindings exist before any consumer runs. That is why panels write
     * `import { useState } from './icons.js'` rather than from `'react'` — the
     * bundle is one scope, and a bare `'react'` import would have nothing to bind to.
     */

    /** Width/height default, matching `Icon` sizes the reference app used (10–14). */
    const ICON_PX = 14;

    /**
     * One glyph frame.
     * @param size - pixel size for width and height.
     * @param children - the path nodes.
     * @returns an `<svg>` element.
     */
    function frame(size, children) {
      const px = size === undefined || size === null ? ICON_PX : size;
      return h('svg', {
        width: px,
        height: px,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
        style: { display: 'block', flex: '0 0 auto' },
      }, children);
    }

    /**
     * The glyph table. Each entry takes a pixel size.
     *
     * `key` props are set explicitly because these children are arrays, and a
     * missing key in a static array is still a React warning a host may surface in
     * its console.
     */
    const Glyph = {
      graph: (size) => frame(size, [
        h('circle', { key: 'a', cx: 6, cy: 7, r: 2.4 }),
        h('circle', { key: 'b', cx: 18, cy: 7, r: 2.4 }),
        h('circle', { key: 'c', cx: 12, cy: 18, r: 2.4 }),
        h('path', { key: 'd', d: 'M6 7h12M7.4 9.1l3.4 6.6M16.6 9.1l-3.4 6.6' }),
      ]),
      notes: (size) => frame(size, [
        h('path', { key: 'a', d: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' }),
        h('path', { key: 'b', d: 'M14 4v5h5M8 13h8M8 17h5' }),
      ]),
      outline: (size) => frame(size, [
        h('path', { key: 'a', d: 'M5 6h14M5 12h9M5 18h11' }),
        h('circle', { key: 'b', cx: 18.5, cy: 12, r: 1.1 }),
      ]),
      search: (size) => frame(size, [
        h('circle', { key: 'a', cx: 11, cy: 11, r: 6.5 }),
        h('path', { key: 'b', d: 'M16 16l4.5 4.5' }),
      ]),
      close: (size) => frame(size, [h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })]),
      more: (size) => frame(size, [
        h('circle', { key: 'a', cx: 5, cy: 12, r: 1.4 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 1.4 }),
        h('circle', { key: 'c', cx: 19, cy: 12, r: 1.4 }),
      ]),
      refresh: (size) => frame(size, [
        h('path', { key: 'a', d: 'M20 12a8 8 0 1 1-2.6-5.9' }),
        h('path', { key: 'b', d: 'M20 4.5V10h-5.5' }),
      ]),
      rebuild: (size) => frame(size, [
        h('path', { key: 'a', d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z' }),
        h('path', { key: 'b', d: 'M12 12l8-4.5M12 12v9M12 12L4 7.5' }),
      ]),
      plus: (size) => frame(size, [h('path', { key: 'a', d: 'M12 6v12M6 12h12' })]),
      minus: (size) => frame(size, [h('path', { key: 'a', d: 'M6 12h12' })]),
      fit: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }),
      ]),
      chevronRight: (size) => frame(size, [h('path', { key: 'a', d: 'M9.5 5.5L16 12l-6.5 6.5' })]),
      chevronDown: (size) => frame(size, [h('path', { key: 'a', d: 'M5.5 9.5L12 16l6.5-6.5' })]),
      back: (size) => frame(size, [h('path', { key: 'a', d: 'M14.5 5.5L8 12l6.5 6.5' })]),
      folder: (size) => frame(size, [
        h('path', { key: 'a', d: 'M3.5 7.5a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-10z' }),
      ]),
      folderOpen: (size) => frame(size, [
        h('path', { key: 'a', d: 'M3.5 7.5a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1v2' }),
        h('path', { key: 'b', d: 'M3.5 9.5h16l-2 10h-14l-1.5-10z' }),
      ]),
      file: (size) => frame(size, [
        h('path', { key: 'a', d: 'M6 3.5h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z' }),
        h('path', { key: 'b', d: 'M14 3.5v5h5' }),
      ]),
      code: (size) => frame(size, [
        h('path', { key: 'a', d: 'M9 8l-4.5 4L9 16M15 8l4.5 4L15 16' }),
      ]),
      open: (size) => frame(size, [
        h('path', { key: 'a', d: 'M14 4h6v6' }),
        h('path', { key: 'b', d: 'M20 4l-8.5 8.5' }),
        h('path', { key: 'c', d: 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }),
      ]),
      target: (size) => frame(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 7 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 2 }),
        h('path', { key: 'c', d: 'M12 2v3M12 19v3M2 12h3M19 12h3' }),
      ]),
      trash: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13' }),
      ]),
      pencil: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4.5 19.5l4.2-1 10-10a2 2 0 0 0-2.8-2.8l-10 10-1.4 3.8z' }),
      ]),
      check: (size) => frame(size, [h('path', { key: 'a', d: 'M5 12.5l4.5 4.5L19 7.5' })]),
      alert: (size) => frame(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 8.5 }),
        h('path', { key: 'b', d: 'M12 7.5v5.5M12 16.4v.2' }),
      ]),
      spinner: (size) => frame(size, [h('path', { key: 'a', d: 'M12 3.5a8.5 8.5 0 1 1-8.5 8.5' })]),
      arrowRight: (size) => frame(size, [h('path', { key: 'a', d: 'M4 12h15M14 6.5L19.5 12 14 17.5' })]),
      arrowLeft: (size) => frame(size, [h('path', { key: 'a', d: 'M20 12H5M10 6.5L4.5 12 10 17.5' })]),
      dot: (size) => frame(size, [h('circle', {
        key: 'a', cx: 12, cy: 12, r: 3.2, fill: 'currentColor', stroke: 'none',
      })]),
      sparkle: (size) => frame(size, [
        h('path', { key: 'a', d: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5z' }),
      ]),
      layers: (size) => frame(size, [
        h('path', { key: 'a', d: 'M12 3.5l8 4-8 4-8-4 8-4z' }),
        h('path', { key: 'b', d: 'M4 12l8 4 8-4M4 16.5l8 4 8-4' }),
      ]),
      sidebar: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4 5.5h16v13H4z' }),
        h('path', { key: 'b', d: 'M14.5 5.5v13' }),
      ]),
      /* ---- conversation ------------------------------------------------ */
      chat: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4 5.5h16v10.5H9.5L5 20v-4H4z' }),
      ]),
      chatPlus: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4 5.5h16v10.5h-6.5L8 20v-4H4z' }),
        h('path', { key: 'b', d: 'M12 8.4v4.6M9.7 10.7h4.6' }),
      ]),
      send: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4 12l16-7-6.2 16-2.6-6.4L4 12z' }),
      ]),
      stop: (size) => frame(size, [
        h('rect', { key: 'a', x: 6.5, y: 6.5, width: 11, height: 11, rx: 2 }),
      ]),
      copy: (size) => frame(size, [
        h('rect', { key: 'a', x: 9, y: 9, width: 10.5, height: 10.5, rx: 1.8 }),
        h('path', { key: 'b', d: 'M15 6.5V5.5a1.5 1.5 0 0 0-1.5-1.5h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15h1' }),
      ]),
      quote: (size) => frame(size, [
        h('path', { key: 'a', d: 'M9.5 6.5C6.9 7.6 5.5 9.6 5.5 12v5.5h5V12H8c0-1.7.6-2.9 1.9-3.6z' }),
        h('path', { key: 'b', d: 'M18 6.5c-2.6 1.1-4 3.1-4 5.5v5.5h5V12h-2.5c0-1.7.6-2.9 1.9-3.6z' }),
      ]),
      /* ---- knowledge base --------------------------------------------- */
      note: (size) => frame(size, [
        h('path', { key: 'a', d: 'M6 4.5h8.5L19 9v10.5H6z' }),
        h('path', { key: 'b', d: 'M14 4.5V9h4.5' }),
        h('path', { key: 'c', d: 'M9 12.5h7M9 16h5' }),
      ]),
      noteAdd: (size) => frame(size, [
        h('path', { key: 'a', d: 'M6 4.5h8.5L19 9v10.5H6z' }),
        h('path', { key: 'b', d: 'M14 4.5V9h4.5' }),
        h('path', { key: 'c', d: 'M11.2 12.2v4.4M9 14.4h4.4' }),
      ]),
      /* ---- retrieval / citation ---------------------------------------- */
      citation: (size) => frame(size, [
        h('path', { key: 'a', d: 'M10.5 5.5H5v5.5M5 11a10 10 0 0 1 9 7' }),
        h('path', { key: 'b', d: 'M19 5.5h-5.5V11' }),
      ]),
      layers2: (size) => frame(size, [
        h('path', { key: 'a', d: 'M12 4l7.5 3.7L12 11.4 4.5 7.7 12 4z' }),
        h('path', { key: 'b', d: 'M4.5 12L12 15.7l7.5-3.7' }),
        h('path', { key: 'c', d: 'M4.5 16.3L12 20l7.5-3.7' }),
      ]),
      settings: (size) => frame(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 3 }),
        h('path', { key: 'b', d: 'M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1' }),
      ]),
      minimize: (size) => frame(size, [h('path', { key: 'a', d: 'M5 12h14' })]),
      panelLeft: (size) => frame(size, [
        h('path', { key: 'a', d: 'M4 5.5h16v13H4z' }),
        h('path', { key: 'b', d: 'M9.5 5.5v13' }),
      ]),
    };

    /**
     * Look one glyph up.
     * @param name - a key of the glyph table.
     * @param size - pixel size.
     * @returns the node, or a neutral dot so a missing name never blanks a button.
     */
    function icon(name, size) {
      const draw = Glyph[name];
      return draw === undefined ? Glyph.dot(size) : draw(size);
    }

    /* ================================================================ *
     * api.js
     * ================================================================ */
    /**
     * Transport for the browser half.
     *
     * One method, one envelope, from `WIRE.md`: `POST /codeslice/api/<method>` with
     * a JSON body, answering `{ok:true, value}` or `{ok:false, error:{code,message}}`.
     * Nothing here invents a field or a second endpoint.
     *
     * Every call is abortable. That is not decoration: the graph tab is parked with
     * `visible: false` rather than unmounted, so a scope change mid-flight would
     * otherwise land a stale answer in a live panel, and the layout of a workspace
     * the reader has already left would paint over the current one.
     */

    /**
     * Base URL of the Host half's routes.
     *
     * Resolved through the sidebar service when it is installed: it knows how to
     * keep the request inside a reverse-proxy prefix and inside the desktop shell's
     * `dsh-app://` origin, where a root-absolute path would miss the Host entirely.
     * The plain page-relative fallback is correct for a GUI served from its own
     * origin.
     * @param ctx - the client context.
     * @returns an absolute URL ending in a slash.
     */
    function apiBase(ctx) {
      const sidebar = ctx && typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
      if (sidebar && typeof sidebar.hostRouteUrl === 'function') {
        try {
          const url = sidebar.hostRouteUrl('codeslice/api/');
          if (url !== undefined && url !== null && typeof url.href === 'string') return url.href;
        } catch {
          // Fall through to page-relative resolution.
        }
      }
      return new URL('codeslice/api/', document.baseURI).href;
    }

    /**
     * The error an `api` rejection carries: the Host's own message plus its code,
     * because "HTTP 500" alone tells a reader nothing and the code is what the
     * panel switches on when it wants to offer a retry.
     */
    class ApiError extends Error {
      /**
       * @param message - the Host's message, or a transport description.
       * @param code - the wire `error.code`, or `'transport'`.
       * @param status - the HTTP status when there was a response.
       */
      constructor(message, code, status) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
      }
    }

    /**
     * Call one API method.
     *
     * @param ctx - the client context (used only to resolve the base URL).
     * @param method - one of `status|rebuild|graph|node|search|outline|files|notes|annotations|layout`.
     * @param payload - the method's parameters; `root`/`cwd` may be supplied by the caller.
     * @param signal - an `AbortSignal`; aborting rejects with an `AbortError`.
     * @returns the envelope's `value`.
     */
    async function api(ctx, method, payload, signal) {
      let response;
      try {
        response = await fetch(`${apiBase(ctx)}${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          signal,
        });
      } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        const detail = error && error.message ? error.message : String(error);
        throw new ApiError(`network error (${detail})`, 'transport', 0);
      }

      const parsed = await response.json().catch(() => null);
      if (parsed === null || parsed.ok !== true) {
        const message = parsed && parsed.error && parsed.error.message
          ? parsed.error.message
          : `HTTP ${response.status}`;
        const code = parsed && parsed.error && parsed.error.code ? parsed.error.code : 'error';
        throw new ApiError(message, code, response.status);
      }
      return parsed.value;
    }

    /**
     * A per-panel request scope.
     *
     * Owns one `AbortController` per in-flight call and remembers the newest
     * sequence number, so a slow earlier response cannot overwrite a fast later
     * one. Two jobs, one object: cancelling and ordering are the same problem.
     */
    function makeRequestScope() {
      let controller;
      let sequence = 0;
      let disposed = false;

      return {
        /**
         * Run `task` with a fresh signal, superseding any call still in flight.
         * @param task - `(signal) => Promise<T>`.
         * @returns the task's value, or `undefined` when superseded/aborted.
         */
        async run(task) {
          if (disposed) return undefined;
          if (controller !== undefined) controller.abort();
          controller = new AbortController();
          const mine = ++sequence;
          try {
            const value = await task(controller.signal);
            return mine === sequence && !disposed ? value : undefined;
          } catch (error) {
            if (error && error.name === 'AbortError') return undefined;
            throw error;
          }
        },

        /**
         * Abort whatever is in flight, keeping the scope usable.
         *
         * This is what a *parked* panel needs: stop the work in progress, but stay
         * able to fetch again when the tab comes back. `dispose()` is the unmount
         * path and is deliberately terminal — using it for parking left every later
         * `run` returning `undefined`, so refresh and resume silently did nothing.
         */
        abort() {
          if (disposed) return;
          if (controller !== undefined) controller.abort();
          controller = undefined;
          // Bumping the sequence is what makes an already-resolved-but-unclaimed
          // answer get discarded rather than applied to a panel nobody is watching.
          sequence += 1;
        },

        /** Abort whatever is in flight; further `run` calls are no-ops. */
        dispose() {
          disposed = true;
          if (controller !== undefined) controller.abort();
          controller = undefined;
        },
      };
    }

    /**
     * Build a `(method, payload) => Promise<value>` bound to one workspace.
     *
     * `cwd` rides on every request so the Host never has to guess which workspace a
     * parked tab belongs to.
     * @param ctx - the client context.
     * @param cwd - the workspace directory from `scope.cwd`, or `undefined`.
     * @returns the bound caller.
     */
    function makeCaller(ctx, cwd) {
      return (method, payload, signal) => api(ctx, method, {
        ...(payload ?? {}),
        ...(cwd === undefined ? {} : { cwd }),
      }, signal);
    }

    /* ================================================================ *
     * i18n.js
     * ================================================================ */
    /**
     * Copy for the browser half.
     *
     * Two complete tables, not one table plus fallbacks: a half-translated panel is
     * worse than an untranslated one, because mixed script signals "this string has
     * no owner" and readers stop trusting the labels. `zh` and `en` therefore carry
     * exactly the same key set, and the build of this file is the only place a new
     * key may be introduced.
     *
     * The host owns the language preference. This module asks the locale service
     * first and only falls back to its own table, which is also what has to answer
     * before the service reports anything (a plugin can be applied before the
     * locale service is up), hence the `<html lang>` probe.
     */

    const DICT = {
      zh: {
        /* ---- tabs ------------------------------------------------------- */
        'tab.workbench': '阅读工作台',
        'tab.workbench.desc': '对话、代码与图谱三合一：提问、选中代码、看图',
        'tab.graph': '代码图谱',
        'tab.graph.desc': '调用、继承与说明的图谱，和对话同屏',
        'tab.notes': '知识库',
        'tab.notes.desc': '带代码锚点与漂移检测的知识库',
        'tab.outline': '文件大纲',
        'tab.outline.desc': '一个文件的声明、导入与说明',
        'tab.annotated': 'CodeSlice 批注视图',
        'tab.annotated.desc': '只读代码，叠加上行内批注与锚点状态',

        /* ---- common ----------------------------------------------------- */
        'common.close': '关闭',
        'common.back': '返回',
        'common.retry': '重试',
        'common.loading': '正在加载…',
        'common.error': '加载失败',
        'common.delete': '删除',
        'common.edit': '编辑',
        'common.save': '保存',
        'common.saving': '保存中…',
        'common.cancel': '取消',
        'common.create': '新建',
        'common.refresh': '刷新',
        'common.open': '打开',
        'common.none': '无',
        'common.untitled': '无标题',
        'common.confirm': '确认',
        'common.more': '更多',
        'common.lines': '行',
        'common.symbols': '符号',
        'common.truncated': '已截断',
        'common.updated': '更新于 {time}',
        'common.copy': '复制',
        'common.copied': '已复制',

        /* ---- graph: toolbar --------------------------------------------- */
        'graph.scope.workspace': '工作区',
        'graph.scope.file': '文件',
        'graph.scope.focus': '聚焦',
        'graph.scope.hint.file': '先选中一个节点或文件，才能按文件看',
        'graph.scope.hint.focus': '先选中一个节点，才能聚焦它的一跳邻域',
        'graph.action.refresh': '刷新',
        'graph.action.rebuild': '重建索引',
        'graph.action.rebuild.hint': '从头扫描工作区并重建图谱',
        'graph.action.fit': '适应画布',
        'graph.status.summary': '{nodes} 节点 · {edges} 关系 · {communities} 社区',
        'graph.status.built': '{files} 文件 · {lines} 行 · 构建 {buildMs} ms',
        'graph.status.cached': '缓存命中',
        'graph.status.rebuilt': '已重建',
        'graph.status.truncated': '图谱已截断：只画了 {shown} / {total} 个节点',
        'graph.status.aggregated': '聚合视图：{communities} 个社区 / 共 {total} 个节点',
        'graph.status.aggregatedTitle': '节点超过上限，已按社区聚合；点击社区可查看名称',
        'graph.loading': '正在加载图谱…',
        'graph.laying': '正在排布图谱…',
        'graph.error.title': '图谱加载失败',
        'graph.empty.title': '还没有代码图谱',
        'graph.empty.body': '工作区里没有可索引的符号，重建一次试试。',
        'graph.empty.filtered': '当前筛选下没有可显示的节点。',
        'graph.zoom.in': '放大',
        'graph.zoom.out': '缩小',
        'graph.canvas.hint': '滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开代码',
        'graph.canvas.nodes': '{shown} / {total} 节点',

        /* ---- graph: legend / filters ------------------------------------ */
        'graph.legend.title': '关系类别',
        'family.behaviour': '行为',
        'family.dependency': '依赖',
        'family.structure': '结构',
        'family.hierarchy': '继承',
        'family.meaning': '说明',
        'family.other': '其他',

        /* ---- graph: search ---------------------------------------------- */
        'graph.search.placeholder': '搜索函数 / 文件 / 社区',
        'graph.search.empty': '没有匹配的节点。',
        'graph.search.hint': '↑ ↓ 选择 · Enter 定位 · Esc 清空',
        'graph.search.clear': '清空搜索',
        'graph.search.count': '{count} 项',

        /* ---- graph: inspector ------------------------------------------- */
        'graph.inspector.idle': '点击图谱里的一个节点，这里显示它的调用者、被调用者与说明。',
        'graph.inspector.back': '全部社区',
        'graph.inspector.open': '打开代码',
        'graph.inspector.ask': '就此提问',
        'graph.inspector.askHint': '把这个问题送进旁边的对话，并带上该节点的图谱邻域',
        'graph.inspector.rationale': '说明',
        'graph.inspector.siblings': '同文件中的其他声明',
        'graph.inspector.neighbours': '{count} 邻点',
        'graph.inspector.context': '上下文',
        'graph.rows.more': '还有 {count} 个关系；用搜索定位更具体。',
        'graph.group.callers': '调用者',
        'graph.group.calls': '调用',
        'graph.group.dependencies': '依赖',
        'graph.group.structure': '结构',
        'graph.group.meaning': '说明',
        'graph.group.hierarchy': '继承',
        'graph.group.related': '关联',

        /* ---- graph: communities ----------------------------------------- */
        'graph.communities.title': '社区',
        'graph.communities.hideAll': '全部隐藏',
        'graph.communities.showAll': '全部显示',
        'graph.communities.none': '还没有社区。',
        'graph.communities.unnamed': '社区 {id}',

        /* ---- graph: tooltip --------------------------------------------- */
        'graph.tooltip.community': '社区：{label}',
        'graph.tooltip.connections': '连接：{degree}',
        'graph.tooltip.line': '第 {line} 行',

        /* ---- composer chip ---------------------------------------------- */
        'chip.label': 'CodeSlice',
        'chip.hint': '打开 CodeSlice 图谱',
        'chip.selection': '选中 {path}:{line}',
        'chip.selectionRange': '选中 {path}:{start}-{end}',
        'chip.copy': '复制引用',
        'chip.failed': 'CodeSlice 不可用',

        /* ---- notes ------------------------------------------------------ */
        'notes.title': '知识库',
        'notes.newNote': '新建笔记',
        'notes.newFolder': '新建文件夹',
        'notes.search': '搜索标题或内容',
        'notes.empty': '这个工作区还没有笔记。',
        'notes.emptySearch': '没有匹配的笔记。',
        'notes.clearSearch': '清除搜索',
        'notes.root': '全部笔记',
        'notes.library': '知识库',
        'notes.more': '更多操作',
        'notes.count': '{count} 条',
        'notes.folder.name': '文件夹名称',
        'notes.folder.create': '创建',
        'notes.folder.empty': '空文件夹',
        'notes.folder.delete': '删除文件夹',
        'notes.folder.deleteConfirm': '删除这个文件夹？里面的笔记会回到未分类。',
        'notes.folder.rename': '重命名文件夹',
        'notes.folder.toggle': '展开或收起文件夹',
        'notes.folder.created': '已创建文件夹「{name}」',
        'notes.folder.renamed': '已重命名文件夹',
        'notes.folder.deleted': '已删除文件夹，{count} 篇笔记移到上一层',
        'notes.folder.unfiled': '未分类',
        'notes.move': '移动到',
        'notes.move.title': '移动到文件夹',
        'notes.move.hint': '选择目标文件夹',
        'notes.move.moved': '已移动笔记',
        'notes.menu.open': '打开笔记',
        'notes.list.empty': '这个文件夹里还没有笔记。',
        'notes.create.title': '标题',
        'notes.create.body': '内容（Markdown）',
        'notes.create.placeholder.title': '一句话说清这个知识点',
        'notes.create.placeholder.body': '## 知识点\n…\n\n## 关联代码\n### path:line',
        'notes.create.save': '保存笔记',
        'notes.reader.edit': '编辑',
        'notes.reader.save': '保存',
        'notes.reader.cancel': '取消',
        'notes.reader.delete': '删除笔记',
        'notes.reader.deleteConfirm': '删除这条笔记？',
        'notes.reader.export': '导出',
        'notes.reader.exported': '已导出到 {path}',
        'notes.back': '返回笔记列表',
        'notes.import': '导入',
        'notes.importPick': '选择 .md 文件',
        'notes.importPath': '或粘贴文件路径（可换行多条）',
        'notes.importRun': '导入',
        'notes.importEmpty': '没有读到 Markdown 内容。',
        'notes.imported': '已导入 {count} 篇笔记',
        'notes.select': '选中这条笔记',
        'notes.selected': '已选 {count} 篇',
        'notes.cancelSelect': '取消选择',
        'notes.exportSelected': '导出选中',
        'notes.export': '导出',
        'notes.exportAll': '全部导出',
        'notes.exportedMany': '已导出 {count} 篇到 {path}',
        'notes.reader.refs': '代码引用',
        'notes.reader.anchors': '锚点',
        'notes.reader.updated': '更新于 {time}',
        'notes.reader.bodyEmpty': '这条笔记还没有正文。',
        'notes.drift.fresh': '有效',
        'notes.drift.moved': '已移动',
        'notes.drift.drifted': '已漂移',
        'notes.drift.missing': '已失效',
        'notes.error.title': '笔记操作失败',

        /* ---- outline ---------------------------------------------------- */
        'outline.search': '按路径筛选文件',
        'outline.pick': '选择一个文件',
        'outline.declarations': '声明',
        'outline.imports': '导入',
        'outline.importedBy': '被导入',
        'outline.rationale': '说明',
        'outline.empty': '这个文件里没有声明。',
        'outline.notFound': '这个文件不在索引里。',
        'outline.hint': '点击一行在编辑器中打开',
        'outline.count': '{count} 项',
        'outline.loading': '正在读取大纲…',

        /* ---- annotated -------------------------------------------------- */
        'annotated.large.title': '这个文件太大，无法在此预览',
        'annotated.large.body': '文件大小 {size}，超过批注视图的上限。请在编辑器里打开它。',
        'annotated.annotation.new': '批注',
        'annotated.annotation.title': '批注标题',
        'annotated.annotation.body': '批注内容',
        'annotated.annotation.save': '保存批注',
        'annotated.annotation.delete': '删除批注',
        'annotated.annotation.empty': '这个文件还没有批注。',
        'annotated.annotation.hint': '点行号选起点，再点一次选终点，然后写批注。',
        'annotated.annotation.selected': '已选第 {start}-{end} 行',
        'annotated.annotation.none': '这一行没有批注。',
        'annotated.loading': '正在加载批注…',
      },

      en: {
        /* ---- tabs ------------------------------------------------------- */
        'tab.workbench': 'Reading workbench',
        'tab.workbench.desc': 'Ask, select code and read the graph in one pane',
        'tab.graph': 'Code graph',
        'tab.graph.desc': 'Calls, inheritance and rationale, beside the conversation',
        'tab.notes': 'Knowledge base',
        'tab.notes.desc': 'A note knowledge base with code anchors and drift detection',
        'tab.outline': 'Outline',
        'tab.outline.desc': 'Declarations, imports and rationale for one file',
        'tab.annotated': 'CodeSlice annotations',
        'tab.annotated.desc': 'Read-only code with inline annotations and anchor status',

        /* ---- common ----------------------------------------------------- */
        'common.close': 'Close',
        'common.back': 'Back',
        'common.retry': 'Retry',
        'common.loading': 'Loading…',
        'common.error': 'Could not load',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.save': 'Save',
        'common.saving': 'Saving…',
        'common.cancel': 'Cancel',
        'common.create': 'Create',
        'common.refresh': 'Refresh',
        'common.open': 'Open',
        'common.none': 'None',
        'common.untitled': 'Untitled',
        'common.confirm': 'Confirm',
        'common.more': 'More',
        'common.lines': 'lines',
        'common.symbols': 'symbols',
        'common.truncated': 'truncated',
        'common.updated': 'updated {time}',
        'common.copy': 'Copy',
        'common.copied': 'Copied',

        /* ---- graph: toolbar --------------------------------------------- */
        'graph.scope.workspace': 'Workspace',
        'graph.scope.file': 'File',
        'graph.scope.focus': 'Focus',
        'graph.scope.hint.file': 'Select a node or file first to view by file',
        'graph.scope.hint.focus': 'Select a node first to focus its one-hop neighbourhood',
        'graph.action.refresh': 'Refresh',
        'graph.action.rebuild': 'Rebuild index',
        'graph.action.rebuild.hint': 'Rescan the workspace and rebuild the graph',
        'graph.action.fit': 'Fit to canvas',
        'graph.status.summary': '{nodes} nodes · {edges} relations · {communities} communities',
        'graph.status.built': '{files} files · {lines} lines · built in {buildMs} ms',
        'graph.status.cached': 'cached',
        'graph.status.rebuilt': 'rebuilt',
        'graph.status.truncated': 'Graph truncated: drawing {shown} of {total} nodes',
        'graph.status.aggregated': 'Aggregated view: {communities} communities of {total} nodes',
        'graph.status.aggregatedTitle': 'Above the node budget; one node per community',
        'graph.loading': 'Loading graph…',
        'graph.laying': 'Laying out the graph…',
        'graph.error.title': 'Could not load the graph',
        'graph.empty.title': 'No code graph yet',
        'graph.empty.body': 'Nothing in this workspace could be indexed. Try rebuilding.',
        'graph.empty.filtered': 'No nodes are visible under the current filters.',
        'graph.zoom.in': 'Zoom in',
        'graph.zoom.out': 'Zoom out',
        'graph.canvas.hint': 'Wheel zooms · drag pans · click inspects · double-click opens code',
        'graph.canvas.nodes': '{shown} / {total} nodes',

        /* ---- graph: legend / filters ------------------------------------ */
        'graph.legend.title': 'Relation families',
        'family.behaviour': 'Behaviour',
        'family.dependency': 'Dependency',
        'family.structure': 'Structure',
        'family.hierarchy': 'Hierarchy',
        'family.meaning': 'Meaning',
        'family.other': 'Other',

        /* ---- graph: search ---------------------------------------------- */
        'graph.search.placeholder': 'Find a function / file / community',
        'graph.search.empty': 'No matching node.',
        'graph.search.hint': '↑ ↓ to move · Enter to centre · Esc to clear',
        'graph.search.clear': 'Clear the search',
        'graph.search.count': '{count} hits',

        /* ---- graph: inspector ------------------------------------------- */
        'graph.inspector.idle': 'Pick a node in the graph to see its callers, calls and rationale.',
        'graph.inspector.back': 'All communities',
        'graph.inspector.open': 'Open code',
        'graph.inspector.ask': 'Ask about this',
        'graph.inspector.askHint': 'Send this question to the conversation, with the node\'s graph neighbourhood',
        'graph.inspector.rationale': 'Rationale',
        'graph.inspector.siblings': 'Also in this file',
        'graph.inspector.neighbours': '{count} neighbours',
        'graph.inspector.context': 'Context',
        'graph.rows.more': '{count} more relations; use search to narrow down.',
        'graph.group.callers': 'Callers',
        'graph.group.calls': 'Calls',
        'graph.group.dependencies': 'Dependencies',
        'graph.group.structure': 'Structure',
        'graph.group.meaning': 'Explains',
        'graph.group.hierarchy': 'Extends',
        'graph.group.related': 'Related',

        /* ---- graph: communities ----------------------------------------- */
        'graph.communities.title': 'Communities',
        'graph.communities.hideAll': 'Hide all',
        'graph.communities.showAll': 'Show all',
        'graph.communities.none': 'No communities yet.',
        'graph.communities.unnamed': 'Community {id}',

        /* ---- graph: tooltip --------------------------------------------- */
        'graph.tooltip.community': 'Community: {label}',
        'graph.tooltip.connections': 'Connections: {degree}',
        'graph.tooltip.line': 'line {line}',

        /* ---- composer chip ---------------------------------------------- */
        'chip.label': 'CodeSlice',
        'chip.hint': 'Open the CodeSlice graph',
        'chip.selection': 'Selected {path}:{line}',
        'chip.selectionRange': 'Selected {path}:{start}-{end}',
        'chip.copy': 'Copy citation',
        'chip.failed': 'CodeSlice unavailable',

        /* ---- notes ------------------------------------------------------ */
        'notes.title': 'Knowledge base',
        'notes.newNote': 'New note',
        'notes.newFolder': 'New folder',
        'notes.search': 'Search titles and content',
        'notes.empty': 'This workspace has no notes yet.',
        'notes.emptySearch': 'No matching note.',
        'notes.clearSearch': 'Clear the search',
        'notes.root': 'All notes',
        'notes.library': 'Knowledge base',
        'notes.more': 'More actions',
        'notes.count': '{count}',
        'notes.folder.name': 'Folder name',
        'notes.folder.create': 'Create',
        'notes.folder.empty': 'Empty folder',
        'notes.folder.delete': 'Delete folder',
        'notes.folder.deleteConfirm': 'Delete this folder? Its notes move to unfiled.',
        'notes.folder.rename': 'Rename folder',
        'notes.folder.toggle': 'Expand or collapse folder',
        'notes.folder.created': 'Folder “{name}” created',
        'notes.folder.renamed': 'Folder renamed',
        'notes.folder.deleted': 'Folder deleted, {count} note(s) moved up one level',
        'notes.folder.unfiled': 'Unfiled',
        'notes.move': 'Move to',
        'notes.move.title': 'Move to folder',
        'notes.move.hint': 'Choose a destination folder',
        'notes.move.moved': 'Note moved',
        'notes.menu.open': 'Open note',
        'notes.list.empty': 'No notes in this folder yet.',
        'notes.create.title': 'Title',
        'notes.create.body': 'Body (Markdown)',
        'notes.create.placeholder.title': 'One line that states the point',
        'notes.create.placeholder.body': '## 知识点\n…\n\n## 关联代码\n### path:line',
        'notes.create.save': 'Save note',
        'notes.reader.edit': 'Edit',
        'notes.reader.save': 'Save',
        'notes.reader.cancel': 'Cancel',
        'notes.reader.delete': 'Delete note',
        'notes.reader.deleteConfirm': 'Delete this note?',
        'notes.reader.export': 'Export',
        'notes.reader.exported': 'Exported to {path}',
        'notes.back': 'Back to note list',
        'notes.import': 'Import',
        'notes.importPick': 'Choose .md files',
        'notes.importPath': 'or paste a file path (one per line)',
        'notes.importRun': 'Import',
        'notes.importEmpty': 'No Markdown content was read.',
        'notes.imported': 'Imported {count} note(s)',
        'notes.select': 'Select this note',
        'notes.selected': '{count} selected',
        'notes.cancelSelect': 'Clear selection',
        'notes.exportSelected': 'Export selected',
        'notes.export': 'Export',
        'notes.exportAll': 'Export all',
        'notes.exportedMany': 'Exported {count} note(s) to {path}',
        'notes.reader.refs': 'Code references',
        'notes.reader.anchors': 'Anchors',
        'notes.reader.updated': 'updated {time}',
        'notes.reader.bodyEmpty': 'This note has no body yet.',
        'notes.drift.fresh': 'fresh',
        'notes.drift.moved': 'moved',
        'notes.drift.drifted': 'drifted',
        'notes.drift.missing': 'missing',
        'notes.error.title': 'Note operation failed',

        /* ---- outline ---------------------------------------------------- */
        'outline.search': 'Filter files by path',
        'outline.pick': 'Pick a file',
        'outline.declarations': 'Declarations',
        'outline.imports': 'Imports',
        'outline.importedBy': 'Imported by',
        'outline.rationale': 'Rationale',
        'outline.empty': 'This file has no declarations.',
        'outline.notFound': 'This file is not in the index.',
        'outline.hint': 'Click a row to open it in the editor',
        'outline.count': '{count}',
        'outline.loading': 'Reading the outline…',

        /* ---- annotated -------------------------------------------------- */
        'annotated.large.title': 'This file is too large to preview here',
        'annotated.large.body': 'The file is {size}, over the annotation view limit. Open it in the editor instead.',
        'annotated.annotation.new': 'Annotate',
        'annotated.annotation.title': 'Annotation title',
        'annotated.annotation.body': 'Annotation body',
        'annotated.annotation.save': 'Save annotation',
        'annotated.annotation.delete': 'Delete annotation',
        'annotated.annotation.empty': 'No annotations on this file yet.',
        'annotated.annotation.hint': 'Click a line number for the start, again for the end, then write.',
        'annotated.annotation.selected': 'Lines {start}-{end} selected',
        'annotated.annotation.none': 'No annotation on this line.',
        'annotated.loading': 'Loading annotations…',
      },
    };

    /**
     * Merge one or more extra tables into the dictionary.
     *
     * The workbench's copy lives in its own modules (`i18n-chat.js`,
     * `i18n-workbench.js`) and calls this at load time. Splitting the table is not
     * cosmetic: `DICT` is one object literal, so two authors adding keys to it in
     * parallel would conflict on every edit, and a half-merged table would ship a
     * key that reads as its own name.
     *
     * A later table wins over an earlier one for the same key, and every table must
     * carry both languages — the completeness check below is what keeps a
     * half-translated panel from reaching a reader.
     *
     * @param extra - `{ zh: {...}, en: {...} }`.
     * @throws when a table is missing a language or a key exists in only one.
     */
    function mergeDict(extra) {
      for (const locale of ['zh', 'en']) {
        const rows = extra?.[locale];
        if (rows === undefined || rows === null) {
          throw new Error(`codeslice: merged dictionary is missing the "${locale}" table`);
        }
        for (const [key, value] of Object.entries(rows)) {
          if (typeof value !== 'string') {
            throw new Error(`codeslice: dictionary key "${key}" (${locale}) is not a string`);
          }
          // A key present in one language and absent in the other renders as the raw
          // key for exactly the readers of that language, which is the failure this
          // check exists to make impossible to ship.
          const hasZh = Object.hasOwn(extra.zh ?? {}, key);
          const hasEn = Object.hasOwn(extra.en ?? {}, key);
          if (hasZh !== hasEn) {
            throw new Error(`codeslice: dictionary key "${key}" exists in only one language`);
          }
        }
        DICT[locale] = { ...DICT[locale], ...rows };
      }
    }

    /**
     * Ask the host which language is active, without trusting any single source.
     *
     * Order: the locale service's active id → the document's `lang` → the browser's
     * preferred language. Any failure falls through, because a thrown error here
     * would blank every label in the panel.
     * @param ctx - the client context, or anything with a `get` method.
     * @returns `'zh'` or `'en'`.
     */
    function resolveLocale(ctx) {
      let active = '';
      try {
        const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
        active = String(locale?.getLocale?.().active ?? '');
      } catch {
        active = '';
      }
      if (active === '' && typeof document !== 'undefined') {
        active = String(document.documentElement?.lang ?? '');
      }
      if (active === '' && typeof navigator !== 'undefined') {
        active = String(navigator.language ?? '');
      }
      return active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    /**
     * Build the panel's translator.
     *
     * The returned function also carries the resolved locale as `.locale`, because
     * the pure data tables in `graph-tables.js` are bilingual objects rather than
     * dictionary keys — a relation label has to read "调用" in a tooltip and in the
     * rail, and routing it through the dictionary would split that single source.
     *
     * @param ctx - the client context.
     * @returns `(key, vars?) => string`, plus `.locale: 'zh' | 'en'`.
     */
    function makeTranslator(ctx) {
      let cachedLocale;
      let bound;
      let current = 'en';

      /** Re-resolve when the locale service handle or its active id changes. */
      const resolve = () => {
        const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
        if (locale === cachedLocale) return;
        cachedLocale = locale;
        try {
          bound = locale && typeof locale.bind === 'function' ? locale.bind('codeslice') : undefined;
        } catch {
          bound = undefined;
        }
        current = resolveLocale(ctx);
      };

      /**
       * @param key - dictionary key.
       * @param vars - `{name}` interpolations.
       * @returns the translated, interpolated string.
       */
      const translate = (key, vars) => {
        resolve();
        let text;
        if (bound !== undefined) {
          try {
            const value = bound(key);
            if (typeof value === 'string' && value !== '' && value !== key) text = value;
          } catch {
            // A locale failure must never blank the panel; the table below answers.
          }
        }
        if (text === undefined) {
          const table = DICT[current] ?? DICT.en;
          text = table[key] ?? DICT.en[key] ?? key;
        }
        if (vars === undefined) return text;
        return text.replace(/\{(\w+)\}/gu, (whole, name) => (
          Object.hasOwn(vars, name) ? String(vars[name]) : whole
        ));
      };

      Object.defineProperty(translate, 'locale', { get: () => { resolve(); return current; } });
      return translate;
    }

    /**
     * Register the dictionary with the host's locale service.
     *
     * Optional on purpose: a profile without the service still renders, because
     * `makeTranslator` never depends on this call succeeding.
     * @param ctx - the client context.
     */
    function registerLocale(ctx) {
      ctx.inject(['locale'], (inner) => {
        const locale = inner.get('locale') ?? ctx.get('locale');
        if (locale === undefined || typeof locale.register !== 'function') return;
        try {
          ctx.effect(() => locale.register('codeslice', DICT), 'codeslice: locale');
        } catch {
          // A namespace clash only costs the fallback table.
        }
      });
    }

    /**
     * `"3 minutes ago"` in the active language, without a dictionary entry per unit.
     * @param locale - `'zh'` or `'en'`.
     * @param timestamp - epoch milliseconds.
     * @param now - epoch milliseconds, injectable so a render is pure.
     * @returns a relative phrase, or `''` when there is no timestamp.
     */
    function formatRelative(locale, timestamp, now = Date.now()) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return '';
      const delta = timestamp - now;
      const abs = Math.abs(delta);
      const steps = [
        [60_000, 'second'],
        [3_600_000, 'minute'],
        [86_400_000, 'hour'],
        [2_592_000_000, 'day'],
        [31_536_000_000, 'month'],
      ];
      let unit = 'year';
      let divisor = 31_536_000_000;
      for (const [limit, name] of steps) {
        if (abs < limit) {
          unit = name;
          divisor = limit === 60_000 ? 1_000
            : limit === 3_600_000 ? 60_000
              : limit === 86_400_000 ? 3_600_000
                : limit === 2_592_000_000 ? 86_400_000 : 2_592_000_000;
          break;
        }
      }
      try {
        return new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' })
          .format(Math.round(delta / divisor), unit);
      } catch {
        return new Date(timestamp).toISOString().slice(0, 10);
      }
    }

    /**
     * Locale-correct thousands separators — the header counts are unreadable
     * without them once a graph passes a thousand nodes.
     * @param count - the number.
     * @param locale - `'zh'` or `'en'`.
     * @returns the formatted string.
     */
    function formatInt(count, locale) {
      const value = Number(count);
      if (!Number.isFinite(value)) return '0';
      try {
        return Math.trunc(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
      } catch {
        return String(Math.trunc(value));
      }
    }

    /* ================================================================ *
     * annotated-view.js
     * ================================================================ */





    /**
     * `codeslice:annotated` — a read-only file viewer with annotations.
     *
     * Registered through `registerFileViewer({exts: [], priority: -200,
     * fetchStrategy: 'fsRead'})`, which means **the host reads the file** and hands
     * down `content` (or `largeFile: {size}` past its own threshold). The
     * consequence that shapes this module: line numbers here are real file lines,
     * and an annotation's anchor is checked against the same text the reader sees.
     *
     * Two rules the host imposes:
     *
     *   - a `largeFile` payload must be refused, not truncated: paging a file that
     *     the host already declined to read would duplicate the protection it just
     *     applied, at a worse fidelity;
     *   - `onLineConsumed()` must be called once the requested line has been scrolled
     *     to, or the host will re-apply the jump on every re-render.
     *
     * Annotations are line ranges, created by clicking a start line and then an end
     * line — the reference's gutter is a *picker*, not a selection
     * (`spec §8.5`, invariant 13), and text drags are meaningless in a read-only
     * view, so clicks are the only gesture here.
     */

    /** Font/line contract; must match `.cs-av-line` in the stylesheet. */
    const LINE_HEIGHT = 21;

    /**
     * @param props - the host viewer's props:
     *   `{path, content, largeFile, line, onLineConsumed, scope, ctx, t, locale}`.
     *   `content` is the decoded file text; `largeFile` is `{size}` when the host
     *   refused to read it; `line` is the line to reveal; `onLineConsumed()` tells
     *   the host the jump was applied.
     * @returns the viewer.
     */
    function AnnotatedView(props) {
      const {
        path, content, largeFile, line, onLineConsumed, scope, ctx, t, locale,
      } = props;

      const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const [annotations, setAnnotations] = useState([]);
      const [error, setError] = useState(undefined);
      const [loading, setLoading] = useState(false);
      const [pick, setPick] = useState({ start: undefined, end: undefined });
      const [editing, setEditing] = useState(undefined);
      const [busy, setBusy] = useState(false);
      const scrollRef = useRef(null);
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      const refused = largeFile !== undefined && largeFile !== null;
      const text = typeof content === 'string' ? content : '';
      const lines = useMemo(() => (refused ? [] : text.split('\n')), [text, refused]);

      /* ---- annotations for this path ---- */

      const reload = useCallback(async () => {
        if (refused || typeof path !== 'string' || path === '') return;
        setLoading(true);
        try {
          const value = await call('annotations', { op: 'list', path });
          if (alive.current) setAnnotations(Array.isArray(value.annotations) ? value.annotations : []);
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setLoading(false);
        }
      }, [call, path, refused]);

      useEffect(() => {
        void reload();
      }, [reload]);

      /* ---- reveal the requested line, once ---- */

      const consumed = useRef(false);
      useEffect(() => {
        if (consumed.current || typeof line !== 'number' || line <= 0 || lines.length === 0) return;
        consumed.current = true;
        const host = scrollRef.current;
        if (host === null || host === undefined) return;
        host.scrollTop = Math.max(0, (line - 3) * LINE_HEIGHT);
        if (typeof onLineConsumed === 'function') onLineConsumed();
      }, [line, lines.length]);

      /** Annotations by first line, so a row can draw its frame without a scan. */
      const byLine = useMemo(() => {
        const map = new Map();
        for (const row of annotations) {
          for (let at = row.startLine; at <= Math.min(row.endLine, lines.length); at += 1) {
            map.set(at, row);
          }
        }
        return map;
      }, [annotations, lines.length]);

      const pickLine = useCallback((number) => {
        setPick((current) => {
          if (current.start === undefined) return { start: number, end: number };
          if (current.end === current.start) return { start: current.start, end: number };
          return { start: number, end: number };
        });
      }, []);

      const save = useCallback(async (title, body) => {
        if (pick.start === undefined) return;
        const startLine = Math.min(pick.start, pick.end ?? pick.start);
        const endLine = Math.max(pick.start, pick.end ?? pick.start);
        setBusy(true);
        try {
          if (editing === undefined) {
            await call('annotations', {
              op: 'create',
              path,
              startLine,
              endLine,
              title,
              body,
            });
          } else {
            await call('annotations', { op: 'update', id: editing.id, title, body });
          }
          if (!alive.current) return;
          setEditing(undefined);
          setPick({ start: undefined, end: undefined });
          await reload();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, editing, path, pick, reload]);

      const remove = useCallback(async (id) => {
        setBusy(true);
        try {
          await call('annotations', { op: 'delete', id });
          if (alive.current) await reload();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, reload]);

      /* ---- refused ---- */

      if (refused) {
        return h('div', { className: 'cs-av' },
          h('div', { className: 'cs-av-bar' },
            h('span', { className: 'cs-av-path', title: path }, path),
            h('span', { className: 'cs-tag cs-warn' }, t('annotated.large.title'))),
          h('div', { className: 'cs-av-large' },
            Glyph.alert(26),
            h('b', null, t('annotated.large.title')),
            h('p', null, t('annotated.large.body', { size: formatBytes(largeFile.size, locale) }))));
      }

      const selection = pick.start === undefined ? ''
        : t('annotated.annotation.selected', {
          start: Math.min(pick.start, pick.end ?? pick.start),
          end: Math.max(pick.start, pick.end ?? pick.start),
        });

      return h('div', { className: 'cs-av' },
        h('div', { className: 'cs-av-bar' },
          h('span', { className: 'cs-av-path', title: path }, path),
          h('span', { className: 'cs-tag cs-tabular' }, formatInt(lines.length, locale)),
          annotations.length === 0 ? null : h('span', { className: 'cs-tag' }, formatInt(annotations.length, locale)),
          loading ? h('span', { className: 'cs-spin' }, Glyph.spinner(11)) : null,
          selection === '' ? h('span', { className: 'cs-muted', style: { fontSize: '10px' } }, t('annotated.annotation.hint')) : null,
          selection === '' ? null : h('span', { className: 'cs-tag cs-accent' }, selection),
          selection === '' ? null : h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-primary',
            disabled: busy,
            onClick: () => setEditing({}),
          }, t('annotated.annotation.new')),
          selection === '' ? null : h('button', {
            type: 'button', className: 'cs-btn cs-small', onClick: () => setPick({ start: undefined, end: undefined }),
          }, t('common.cancel'))),

        error === undefined ? null : h('div', { className: 'cs-banner' },
          Glyph.alert(13),
          h('span', { className: 'cs-grow' }, error),
          h('button', {
            type: 'button', className: 'cs-iconbtn', onClick: () => setError(undefined),
          }, Glyph.close(11))),

        h('div', { className: 'cs-av-scroll', ref: scrollRef },
          lines.map((lineText, index) => {
            const number = index + 1;
            const annotation = byLine.get(number);
            const picked = pick.start !== undefined
              && number >= Math.min(pick.start, pick.end ?? pick.start)
              && number <= Math.max(pick.start, pick.end ?? pick.start);
            const classes = ['cs-av-line'];
            if (picked) classes.push('cs-picked');
            if (annotation !== undefined) classes.push('cs-annotated');
            if (typeof line === 'number' && number === line) classes.push('cs-flash');
            return h('div', { key: number, className: classes.join(' '), style: { minHeight: `${LINE_HEIGHT}px` } },
              h('span', {
                className: 'cs-av-gutter',
                role: 'button',
                tabIndex: 0,
                title: `L${number}`,
                onClick: () => pickLine(number),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pickLine(number);
                  }
                },
              }, number),
              h('span', { className: 'cs-av-text' }, lineText === '' ? ' ' : lineText));
          }),

          annotations.length === 0 && !loading
            ? h('div', { className: 'cs-av-large', style: { padding: '14px' } },
              h('p', null, t('annotated.annotation.empty')))
            : null,

          annotations.map((row) => h('div', { key: row.id, className: 'cs-av-note' },
            h('div', { className: 'cs-col cs-grow' },
              h('b', null, `${row.title} · L${row.startLine}-${row.endLine}`),
              row.body === '' ? null : h('span', null, row.body)),
            h('span', {
              className: `cs-tag ${row.drift?.status === 'fresh' ? 'cs-ok' : row.drift?.status === 'missing' ? 'cs-bad' : 'cs-warn'}`,
            }, t(`notes.drift.${row.drift?.status ?? 'fresh'}`)),
            h('button', {
              type: 'button',
              className: 'cs-iconbtn cs-danger',
              title: t('annotated.annotation.delete'),
              'aria-label': t('annotated.annotation.delete'),
              disabled: busy,
              onClick: () => { void remove(row.id); },
            }, Glyph.trash(12)))),

          editing === undefined
            ? null
            : h(AnnotationForm, {
              busy,
              initial: editing.title === undefined ? '' : editing.title,
              initialBody: editing.body === undefined ? '' : editing.body,
              onSave: (title, body) => { void save(title, body); },
              onCancel: () => setEditing(undefined),
              t,
            })));
    }

    /**
     * The annotation editor.
     *
     * Lives inline under the code rather than in a modal: the point of the view is
     * to keep the code visible while writing about it.
     * @param props - `{busy, initial, initialBody, onSave(title, body), onCancel, t}`.
     * @returns the form.
     */
    function AnnotationForm(props) {
      const {
        busy, initial, initialBody, onSave, onCancel, t,
      } = props;
      const [title, setTitle] = useState(initial);
      const [body, setBody] = useState(initialBody);
      return h('div', { className: 'cs-av-form' },
        h('div', { className: 'cs-row' },
          h('input', {
            className: 'cs-input',
            value: title,
            autoFocus: true,
            placeholder: t('annotated.annotation.title'),
            'aria-label': t('annotated.annotation.title'),
            onChange: (event) => setTitle(event.target.value),
          }),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-primary',
            disabled: busy,
            onClick: () => onSave?.(title.trim() === '' ? t('annotated.annotation.new') : title.trim(), body),
          }, t('annotated.annotation.save')),
          h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.() }, t('common.cancel'))),
        h('textarea', {
          className: 'cs-textarea',
          value: body,
          placeholder: t('annotated.annotation.body'),
          'aria-label': t('annotated.annotation.body'),
          onChange: (event) => setBody(event.target.value),
        }));
    }

    /**
     * `1.2 KB` in the active language.
     * @param size - bytes.
     * @param locale - `'zh' | 'en'`.
     * @returns a short human size.
     */
    function formatBytes(size, locale) {
      const value = Number(size);
      if (!Number.isFinite(value) || value <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let index = 0;
      let scaled = value;
      while (scaled >= 1024 && index < units.length - 1) {
        scaled /= 1024;
        index += 1;
      }
      const rounded = scaled >= 10 || index === 0 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
      return `${rounded} ${units[index]}`;
    }

    /* ================================================================ *
     * assets.js
     * ================================================================ */
    /**
     * Lazy client assets served by the Host half.
     *
     * The graph renderer (vis-network) and the code editor (CodeMirror) are too
     * heavy to inline into `client.js`, and neither is needed until its surface is
     * opened. Each is one same-origin classic script registered on a global; this
     * module owns the URL resolution, the one-in-flight-per-name cache and the
     * failed-load retry.
     *
     * URL resolution goes through the same `hostRouteUrl` seam the API uses: a
     * reverse-proxied GUI would otherwise request `/codeslice/assets/...` at the
     * origin root and 404, and the desktop shell's `dsh-app://` origin is not
     * reachable with a root-absolute path at all.
     */

    const inFlight = new Map();

    /**
     * Absolute URL of one allow-listed asset.
     * @param ctx - the client context.
     * @param name - the asset file name (`vis-network.min.js`, `editor.js`).
     * @returns the URL string.
     */
    function assetUrl(ctx, name) {
      const path = `codeslice/assets/${name}`;
      const sidebar = ctx && typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
      if (sidebar && typeof sidebar.hostRouteUrl === 'function') {
        try {
          const url = sidebar.hostRouteUrl(path);
          if (url !== undefined && url !== null && typeof url.href === 'string') return url.href;
        } catch {
          // Fall through to page-relative resolution.
        }
      }
      return new URL(path, document.baseURI).href;
    }

    /**
     * Load one classic script once, then resolve when its global is present.
     *
     * A failed load is not cached: the next caller retries, which is what makes a
     * Host that was restarting when the graph first opened recoverable without a
     * page reload.
     *
     * @param ctx - the client context.
     * @param name - the allow-listed file name.
     * @param ready - returns the injected global once the script has executed.
     * @returns the global, or a rejected promise.
     */
    function loadAsset(ctx, name, ready) {
      const current = ready();
      if (current !== undefined) return Promise.resolve(current);
      const existing = inFlight.get(name);
      if (existing !== undefined) return existing;

      const promise = new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
          reject(new Error('no document to load the asset into'));
          return;
        }
        const element = document.createElement('script');
        element.async = true;
        element.src = assetUrl(ctx, name);
        element.addEventListener('load', () => {
          element.remove();
          const value = ready();
          if (value === undefined) reject(new Error(`${name} loaded but registered nothing`));
          else resolve(value);
        }, { once: true });
        element.addEventListener('error', () => {
          element.remove();
          reject(new Error(`${name} failed to load`));
        }, { once: true });
        document.head.append(element);
      }).finally(() => {
        inFlight.delete(name);
      });

      inFlight.set(name, promise);
      return promise;
    }

    /**
     * vis-network, as graphify itself pins it.
     * @param ctx - the client context.
     * @returns the `vis` namespace.
     */
    function loadVis(ctx) {
      return loadAsset(ctx, 'vis-network.min.js', () => (
        typeof globalThis.vis?.Network === 'function' ? globalThis.vis : undefined
      ));
    }

    /**
     * The CodeMirror chunk.
     * @param ctx - the client context.
     * @returns `{create}` from `client/editor.js`.
     */
    function loadEditor(ctx) {
      return loadAsset(ctx, 'editor.js', () => (
        typeof globalThis.__codesliceEditor?.create === 'function' ? globalThis.__codesliceEditor : undefined
      ));
    }

    /* ================================================================ *
     * better-sidebar.js
     * ================================================================ */
    /**
     * The vendored Better Sidebar client.
     *
     * `D:\DSH-better-sidebar-main` is the upstream 0.28.2 source (MIT). Instead of
     * rebuilding its 184-file TypeScript tree, the plugin ships the **published
     * client bundle** byte-for-byte under `client/vendor/better-sidebar/` and
     * mounts it as a child Cordis plugin:
     *
     *   1. the bundle is a normal DSH client registration
     *      (`window.__ModuleLoader__.load({ id: 'dsh-better-sidebar', factory })`),
     *      served from this plugin's own asset route;
     *   2. a classic `<script>` executes it, so the module table owns its factory;
     *   3. the bundle's exports are required back and mounted with `ctx.plugin`,
     *      which gives it its own fiber, service injections and cleanup.
     *
     * Two adaptations are applied to the vendored copy (see `dev/vendor-better-sidebar.mjs`):
     *   - its lazy chunk base moves from the upstream `/sidebar/bundle/` route to
     *     `/codeslice/assets/better-sidebar/`, because this plugin owns that route;
     *   - `remote` / `remote.session` leave its inject list: the desktop profile
     *     has no Remote surface, and a required service that never appears would
     *     hold the child fiber forever (which is exactly how a bundle-level
     *     activation of this plugin wedges the whole boot screen). Every call site
     *     is already optional-chained.
     *
     * The mounted client owns the right Sidebar (explorer / editor tabs / diffs),
     * its CodeMirror editor, syntax themes and the floating "add to conversation"
     * selection popup. CodeSlice's own layer (range frames + title bars) observes
     * that editor from the outside — this module is only the loader.
     */

    /** Global status handle used by diagnostics and the reader fallback. */
    const STATE_KEY = '__codesliceBetterSidebar';

    function betterSidebarState() {
      return globalThis[STATE_KEY];
    }

    function mountState() {
      const current = globalThis[STATE_KEY];
      if (current !== undefined) return current;
      const created = { phase: 'idle', error: undefined, startedAt: 0, mountedAt: 0, fiber: undefined };
      globalThis[STATE_KEY] = created;
      return created;
    }

    /**
     * Absolute URL of the vendored core bundle.
     * @returns the URL string.
     */
    function betterSidebarBundleUrl() {
      return new URL('codeslice/assets/better-sidebar/client.js', document.baseURI).href;
    }

    /**
     * Execute one classic script and resolve when it has run.
     *
     * The bundle registers itself into the client module table; there is no
     * page global to poll, so the script's own `load` event is the signal.
     * @param url - absolute script URL.
     * @returns a promise that settles when the script executed or failed.
     */
    function runScript(url) {
      return new Promise((resolve, reject) => {
        const element = document.createElement('script');
        element.async = true;
        element.src = url;
        element.addEventListener('load', () => {
          element.remove();
          resolve();
        }, { once: true });
        element.addEventListener('error', () => {
          element.remove();
          reject(new Error(`better-sidebar bundle failed to load: ${url}`));
        }, { once: true });
        document.head.append(element);
      });
    }

    /** Wait until `probe()` returns a truthy value, or the deadline passes. */
    async function until(probe, timeoutMs, label) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = probe();
        if (value !== undefined && value !== null && value !== false) return value;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(`timed out waiting for ${label}`);
    }

    /**
     * Mount the vendored client once.
     *
     * @param ctx - this plugin's client context (the parent fiber).
     * @param requireFn - the client module table's require, captured inside the
     *   bundle factory (a bare `require` is not a page global).
     * @returns the status record; a failed mount is recorded, never thrown.
     */
    async function mountBetterSidebar(ctx, requireFn) {
      const current = mountState();
      if (current.phase === 'mounted') return current;
      if (current.phase === 'mounting') return current;

      current.phase = 'mounting';
      current.error = undefined;
      current.startedAt = Date.now();

      try {
        if (typeof requireFn !== 'function') throw new Error('client module table require is unavailable');

        // A page reload can execute this client bundle again while the renderer's
        // module table still owns the vendor factory from the previous mount.
        // Re-running its classic script in that state throws "duplicate factory
        // registration for dsh-better-sidebar" and takes the whole plugin boot
        // down with it. Reuse the registered factory when it is already there.
        let existing;
        try {
          existing = requireFn('dsh-better-sidebar');
        } catch {
          existing = undefined;
        }
        if (existing === undefined || existing === null) {
          await runScript(betterSidebarBundleUrl());
          existing = await until(() => {
            try {
              return requireFn('dsh-better-sidebar');
            } catch {
              return undefined;
            }
          }, 3000, 'dsh-better-sidebar module');
        }

        const module = existing;

        const plugin = {
          name: 'dsh-better-sidebar',
          inject: ['slots', 'sessions', 'locale', 'modules', 'connection'],
          apply: module.apply,
        };

        current.fiber = ctx.plugin(plugin);

        const service = await until(() => {
          try {
            return ctx.get('betterSidebar');
          } catch {
            return undefined;
          }
        }, 8000, 'betterSidebar service');

        current.phase = 'mounted';
        current.mountedAt = Date.now();
        current.version = service.version ?? module.version ?? '0.28.2';
        return current;
      } catch (error) {
        current.phase = 'failed';
        current.error = error instanceof Error ? error.message : String(error);
        return current;
      }
    }

    /* ================================================================ *
     * code-panel.js
     * ================================================================ */
    /**
     * `code-panel.js` — the read-only code reader.
     *
     * One `POST /codeslice/api/code` per open target (`WIRE-CHAT.md §12`), then
     * nothing: the response already carries everything the pane decorates with —
     * `symbols` overlapping the window, `annotations` and `notes` whose ranges
     * overlap it — so marking a range up costs no extra round trip.
     *
     * The window is rendered by the CodeMirror chunk (`client/editor.js`, lazily
     * fetched from the Host). It has real syntax highlighting and text selection,
     * while the desktop gesture is preserved: a line **number** is a picker — first
     * click sets the start, a second sets the end, a third starts over — and a text
     * drag reports the same line span. Every change is reported through
     * `onSelectionChange` so the conversation panel can bind the next question to it.
     *
     * Discipline borrowed from `graph-panel.js`:
     *   - `visible === false` means parked-but-mounted: abort the scope, fetch again
     *     on resume, never `dispose` (that is the unmount path and it is terminal).
     *   - Narrow/wide is measured from *this* element's box, never the viewport.
     *   - No polling. Mount, target change, resumed edge, explicit refresh.
     */







    /** Below this width the toolbar drops its secondary labels. */
    const CODE_NARROW_WIDTH = 340;

    /**
     * Read a `target` prop into the two fields that matter.
     *
     * Accepts `{path, line}` (a citation, a graph node) and `{path, startLine,
     * endLine}` (a range), because both arrive from the caller and the pane should
     * not depend on which one it got.
     * @param target - the prop.
     * @returns `{path, startLine, endLine}` with `startLine`/`endLine` optional.
     */
    function codeReadTarget(target) {
      if (target === undefined || target === null) return { path: '', };
      const path = typeof target.path === 'string' ? target.path : '';
      if (path === '') return { path: '' };
      // A single line means "reveal this line", not "show a one-line window": the
      // wire reads an omitted `endLine` as "from here to the end of the window". A
      // citation to a function therefore lands with the function visible.
      const single = Number(target.line ?? target.startLine);
      const startLine = Number.isFinite(single) && single > 0 ? Math.trunc(single) : undefined;
      const last = Number(target.endLine);
      const endLine = Number.isFinite(last) && last > 0 ? Math.trunc(last) : undefined;
      return endLine === undefined ? { path, startLine } : { path, startLine, endLine };
    }

    /**
     * The last path segment, for a header too narrow to show a directory.
     * @param path - a workspace-relative path.
     * @returns the basename.
     */
    function codeBaseName(path) {
      const text = String(path ?? '');
      const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
      return cut < 0 ? text : text.slice(cut + 1);
    }

    /**
     * The declaration rows that start inside the returned window.
     * @param symbols - the `code` response's symbols.
     * @param startLine - the window's first line.
     * @returns a map of 1-based line → symbol.
     */
    function codeSymbolLines(symbols, startLine) {
      const map = new Map();
      for (const row of Array.isArray(symbols) ? symbols : []) {
        const line = Number(row.line);
        if (!Number.isFinite(line) || line < startLine) continue;
        if (!map.has(line)) map.set(line, row);
      }
      return map;
    }

    /**
     * The code reader.
     *
     * @param props - `{ctx, cwd, t, locale, visible, target, onAskSelection,
     *   onSelectionChange}`:
     *   `target` is `{path, line}` or `{path, startLine, endLine}`;
     *   `onAskSelection(selection)` hands `{path, startLine, endLine, code}` up for
     *   the conversation panel; `onSelectionChange(selection | null)` keeps the
     *   workbench's shared selection in step on every change.
     * @returns the pane.
     */
    function CodePanel(props) {
      const {
        ctx, cwd, t, locale, visible, target, onAskSelection, onSelectionChange,
      } = props;
      const parked = visible === false;

      const workspace = typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
      const call = useMemo(() => makeCaller(ctx, workspace), [ctx, workspace]);
      const wanted = useMemo(() => codeReadTarget(target), [target]);

      const [file, setFile] = useState(undefined);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(undefined);
      const [pick, setPick] = useState({ start: undefined, end: undefined });
      const [narrow, setNarrow] = useState(false);
      const [notice, setNotice] = useState(undefined);
      const [copied, setCopied] = useState(false);
      const [noteOpen, setNoteOpen] = useState(false);

      const requests = useRef(undefined);
      const alive = useRef(true);
      const hostRef = useRef(null);
      const editorRef = useRef(null);
      const editorHandle = useRef(undefined);
      const [editorApi, setEditorApi] = useState(undefined);
      const [editorError, setEditorError] = useState(undefined);
      const [editorNonce, setEditorNonce] = useState(0);
      const [flash, setFlash] = useState(undefined);

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      /* ---- request scope --------------------------------------------- */

      useEffect(() => {
        const scope = makeRequestScope();
        requests.current = scope;
        return () => {
          scope.dispose();
          requests.current = undefined;
        };
      }, []);

      /* ---- measure this pane's own box -------------------------------- */

      useEffect(() => {
        const element = hostRef.current;
        if (element === null || element === undefined || parked) return undefined;
        const read = () => {
          setNarrow(element.getBoundingClientRect().width < CODE_NARROW_WIDTH);
        };
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(read);
        observer.observe(element);
        return () => observer.disconnect();
      }, [parked, file]);

      /* ---- fetch ------------------------------------------------------ */

      const load = useCallback(async () => {
        const scope = requests.current;
        if (scope === undefined) return;
        if (wanted.path === '') {
          setFile(undefined);
          setError(undefined);
          return;
        }
        setLoading(true);
        setError(undefined);
        try {
          const payload = { path: wanted.path };
          if (wanted.startLine !== undefined) payload.startLine = wanted.startLine;
          if (wanted.endLine !== undefined) payload.endLine = wanted.endLine;
          const value = await scope.run((signal) => call('code', payload, signal));
          if (value === undefined || !alive.current) return;
          setFile(value);
        } catch (caught) {
          if (caught && caught.name === 'AbortError') return;
          if (alive.current) {
            setFile(undefined);
            setError(caught && caught.message ? caught.message : String(caught));
          }
        } finally {
          if (alive.current) setLoading(false);
        }
      }, [call, wanted.path, wanted.startLine, wanted.endLine]);

      /* ---- first paint, target change, and every resume --------------- */

      const painted = useRef('');
      const wasParked = useRef(parked);
      const stamp = `${wanted.path}:${wanted.startLine ?? ''}:${wanted.endLine ?? ''}`;

      useEffect(() => {
        const resumed = wasParked.current && !parked;
        wasParked.current = parked;
        if (parked) {
          // Parking cancels rather than disposes: the scope has to survive until the
          // pane comes back, or every later `run` is a no-op.
          requests.current?.abort();
          return;
        }
        if (painted.current === stamp && !resumed) return;
        painted.current = stamp;
        void load();
      }, [parked, stamp, load]);

      // A new target is a new pair of endpoints: a half-finished pick from the last
      // file would otherwise silently bind the next question to the wrong lines.
      useEffect(() => {
        setPick({ start: undefined, end: undefined });
        setNoteOpen(false);
        setNotice(undefined);
        setFlash(undefined);
      }, [stamp]);

      /* ---- reveal the requested line, once per stamp ------------------ */

      const lines = useMemo(() => {
        const text = typeof file?.text === 'string' ? file.text : '';
        return text === '' ? [] : text.split('\n');
      }, [file?.text]);

      const startLine = Number.isFinite(Number(file?.startLine)) ? Number(file.startLine) : 1;

      /* ---- the CodeMirror chunk -------------------------------------- */

      useEffect(() => {
        if (parked || wanted.path === '' || file === undefined || file.found === false) return undefined;
        let cancelled = false;
        setEditorError(undefined);
        loadEditor(ctx).then((namespace) => {
          if (!cancelled) setEditorApi(namespace);
        }).catch((caught) => {
          if (!cancelled) setEditorError(caught && caught.message ? caught.message : String(caught));
        });
        return () => { cancelled = true; };
      }, [ctx, parked, wanted.path, file?.found, editorNonce]);

      const onEditorSelection = useCallback((range) => {
        if (range === null) {
          setPick({ start: undefined, end: undefined });
          return;
        }
        setPick({ start: range.startLine, end: range.endLine });
      }, []);

      const onGutterPick = useCallback((line) => {
        setNotice(undefined);
        setPick((current) => {
          if (current.start === undefined) return { start: line, end: line };
          if (current.start === line && current.end === line) return { start: undefined, end: undefined };
          return { start: current.start, end: line };
        });
      }, []);

      // One editor per loaded window. Recreating rather than `setDoc` keeps the
      // CodeMirror state (undo history, search, folds) from leaking across files.
      useEffect(() => {
        if (editorApi === undefined || editorRef.current === null) return undefined;
        if (file === undefined || file.found === false) return undefined;
        const handle = editorApi.create(editorRef.current, {
          doc: file.text ?? '',
          startLine,
          language: file.language ?? '',
          decorations: {
            symbols: file.symbols,
            annotations: file.annotations,
            notes: file.notes,
            pick: pick.start === undefined
              ? null
              : { startLine: Math.min(pick.start, pick.end ?? pick.start), endLine: Math.max(pick.start, pick.end ?? pick.start) },
            flash,
          },
          onSelection: onEditorSelection,
          onGutterPick,
        });
        editorHandle.current = handle;
        return () => {
          handle.destroy();
          if (editorHandle.current === handle) editorHandle.current = undefined;
        };
      }, [editorApi, file?.text, file?.language, file?.found, startLine]);

      /* ---- decorations follow the selection and the fetched marks ---- */

      useEffect(() => {
        const handle = editorHandle.current;
        if (handle === undefined) return;
        handle.setDecorations({
          symbols: file?.symbols,
          annotations: file?.annotations,
          notes: file?.notes,
          pick: pick.start === undefined
            ? null
            : { startLine: Math.min(pick.start, pick.end ?? pick.start), endLine: Math.max(pick.start, pick.end ?? pick.start) },
          flash,
        });
      }, [file?.symbols, file?.annotations, file?.notes, pick, flash]);

      useEffect(() => {
        if (flash === undefined) return undefined;
        const timer = setTimeout(() => setFlash(undefined), 1200);
        return () => clearTimeout(timer);
      }, [flash]);

      /* ---- reveal the requested line, once per stamp ------------------ */

      const revealed = useRef('');
      useEffect(() => {
        if (parked || file === undefined) return;
        const handle = editorHandle.current;
        if (handle === undefined) return;
        const wantedLine = wanted.startLine;
        const marker = `${stamp}:${wantedLine ?? ''}`;
        if (revealed.current === marker) return;
        revealed.current = marker;
        if (wantedLine === undefined) return;
        handle.scrollToLine(wantedLine);
        setFlash(wantedLine);
      }, [parked, file, stamp, wanted.startLine, editorApi, startLine]);

      /* ---- selection -------------------------------------------------- */

      const selection = useMemo(() => {
        if (pick.start === undefined) return null;
        const first = Math.min(pick.start, pick.end ?? pick.start);
        const last = Math.max(pick.start, pick.end ?? pick.start);
        const from = Math.max(0, first - startLine);
        const to = Math.max(from, last - startLine);
        const code = lines.slice(from, to + 1).join('\n');
        return {
          path: wanted.path, startLine: first, endLine: last, code,
        };
      }, [pick, lines, startLine, wanted.path]);

      // One effect for every change of the selection, so the workbench's copy and the
      // conversation panel's copy cannot disagree about what is selected.
      const selectionKey = selection === null ? '' : `${selection.path}:${selection.startLine}:${selection.endLine}`;
      const reportRef = useRef(onSelectionChange);
      reportRef.current = onSelectionChange;
      useEffect(() => {
        if (typeof reportRef.current !== 'function') return;
        reportRef.current(selection === null ? null : {
          path: selection.path,
          startLine: selection.startLine,
          endLine: selection.endLine,
          code: selection.code,
        });
        // `selection` is rebuilt every render, so the key is the dependency that
        // actually changes.
      }, [selectionKey]);

      const pickLine = useCallback((number) => {
        if (!Number.isFinite(number) || number <= 0) return;
        setNotice(undefined);
        setPick((current) => {
          if (current.start === undefined) return { start: number, end: number };
          // A second click on the start line clears the pick: the same click that
          // selected it is the obvious way to undo it.
          if (current.start === number && current.end === number) {
            return { start: undefined, end: undefined };
          }
          return { start: current.start, end: number };
        });
      }, []);

      const clearPick = useCallback(() => {
        setPick({ start: undefined, end: undefined });
        setNoteOpen(false);
        editorHandle.current?.clearSelection?.();
      }, []);

      /* ---- copy ------------------------------------------------------- */

      useEffect(() => {
        if (!copied) return undefined;
        const timer = setTimeout(() => setCopied(false), 1400);
        return () => clearTimeout(timer);
      }, [copied]);

      const copySelection = useCallback(() => {
        if (selection === null) return;
        const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (clip === undefined || typeof clip.writeText !== 'function') return;
        const text = `${wanted.path}:${selection.startLine}-${selection.endLine}\n${selection.code}`;
        clip.writeText(text).then(() => setCopied(true)).catch(() => {});
      }, [selection, wanted.path]);

      /* ---- ask / note ------------------------------------------------- */

      const ask = useCallback(() => {
        if (selection === null || typeof onAskSelection !== 'function') return;
        onAskSelection({
          path: selection.path,
          startLine: selection.startLine,
          endLine: selection.endLine,
          code: selection.code,
        });
      }, [selection, onAskSelection]);

      const saveNote = useCallback(async (title) => {
        if (selection === null) return;
        const cleanTitle = String(title ?? '').trim();
        if (cleanTitle === '') return;
        const scope = requests.current;
        if (scope === undefined) return;
        setNotice(undefined);
        try {
          const value = await scope.run((signal) => call('notes', {
            op: 'create',
            title: cleanTitle,
            body: `## 知识点\n\n## 关联代码\n`,
            codeRefs: [{
              path: selection.path,
              line: selection.startLine,
              endLine: selection.endLine,
              symbol: codeSymbolLines(file?.symbols, startLine).get(selection.startLine)?.name,
            }],
          }, signal));
          if (value === undefined || !alive.current) return;
          const note = value.note ?? value;
          setNoteOpen(false);
          setNotice({
            kind: 'ok',
            text: t('code.note.saved', { title: note?.title ?? cleanTitle }),
          });
        } catch (caught) {
          if (caught && caught.name === 'AbortError') return;
          if (alive.current) {
            setNotice({
              kind: 'bad',
              text: t('code.note.failed', {
                detail: caught && caught.message ? caught.message : String(caught),
              }),
            });
          }
        }
      }, [selection, call, file?.symbols, startLine, t]);

      /* ---- derived ---------------------------------------------------- */

      const found = file === undefined ? true : file.found !== false;

      /* ---- render: no target ------------------------------------------ */

      if (wanted.path === '') {
        return h('div', { className: 'cs-code', ref: hostRef },
          h('div', { className: 'cs-code-empty' },
            Glyph.code(24),
            h('b', null, t('code.empty.title')),
            h('p', null, t('code.empty.body'))));
      }

      /* ---- render: failure -------------------------------------------- */

      if (error !== undefined && file === undefined) {
        return h('div', { className: 'cs-code', ref: hostRef },
          h('div', { className: 'cs-code-bar' },
            h('span', { className: 'cs-code-path', title: wanted.path }, wanted.path)),
          h('div', { className: 'cs-code-empty' },
            Glyph.alert(24),
            h('b', null, t('code.error.title')),
            h('p', null, error),
            h('button', {
              type: 'button', className: 'cs-btn', onClick: () => { void load(); },
            }, Glyph.refresh(12), t('common.retry'))));
      }

      /* ---- render: the file is gone ----------------------------------- */

      if (file !== undefined && found === false) {
        return h('div', { className: 'cs-code', ref: hostRef },
          h('div', { className: 'cs-code-bar' },
            h('span', { className: 'cs-code-path', title: wanted.path }, wanted.path)),
          h('div', { className: 'cs-code-empty' },
            Glyph.file(24),
            h('b', null, t('code.notFound', { path: codeBaseName(wanted.path) })),
            h('p', null, wanted.path)));
      }

      /* ---- render: the file ------------------------------------------- */

      const header = h('div', { className: 'cs-code-bar' },
        h('span', { className: 'cs-code-path', title: wanted.path },
          narrow ? codeBaseName(wanted.path) : wanted.path),
        file?.language !== undefined && file.language !== ''
          ? h('span', { className: 'cs-tag cs-accent' }, file.language)
          : null,
        file?.lines !== undefined
          ? h('span', { className: 'cs-tag cs-tabular' }, t('code.lines', { count: formatInt(file.lines, locale) }))
          : null,
        narrow || file?.symbols === undefined
          ? null
          : h('span', { className: 'cs-tag cs-tabular' },
            t('code.symbols', { count: formatInt(file.symbols.length, locale) })),
        loading ? h('span', { className: 'cs-spin' }, Glyph.spinner(11)) : null,
        h('div', { className: 'cs-grow' }),
        h('button', {
          type: 'button',
          className: 'cs-iconbtn',
          title: t('code.refresh'),
          'aria-label': t('code.refresh'),
          disabled: loading,
          onClick: () => { void load(); },
        }, Glyph.refresh(13)));

      const truncated = (() => {
        const total = Number(file?.lines);
        const last = Number(file?.endLine);
        if (!Number.isFinite(total) || total <= 0) return false;
        if (!Number.isFinite(last)) return false;
        return startLine > 1 || last < total;
      })();

      return h('div', { className: 'cs-code', ref: hostRef },
        header,

        notice === undefined
          ? null
          : h('div', { className: `cs-chat-banner${notice.kind === 'ok' ? ' cs-ok' : ''}` },
            notice.kind === 'ok' ? Glyph.check(13) : Glyph.alert(13),
            h('span', null, notice.text),
            h('button', {
              type: 'button', className: 'cs-iconbtn', 'aria-label': t('common.close'), onClick: () => setNotice(undefined),
            }, Glyph.close(11))),

        truncated
          ? h('div', { className: 'cs-code-hint' },
            h('span', { className: 'cs-ellipsis' },
              t('code.truncated', {
                start: formatInt(startLine, locale),
                end: formatInt(file?.endLine ?? startLine, locale),
                lines: formatInt(file?.lines ?? 0, locale),
              })))
          : null,

        h('div', { className: 'cs-code-editor' },
          h('div', { ref: editorRef, style: { height: '100%' } }),
          editorApi === undefined && editorError === undefined
            ? h('div', { className: 'cs-code-loading' },
              h('span', { className: 'cs-spin' }, Glyph.spinner(11)),
              h('span', null, t('code.editor.loading')))
            : null,
          editorError === undefined
            ? null
            : h('div', { className: 'cs-code-loading' },
              h('span', null, t('code.editor.failed')),
              h('button', {
                type: 'button',
                className: 'cs-btn cs-small',
                onClick: () => {
                  setEditorApi(undefined);
                  setEditorError(undefined);
                  setEditorNonce((current) => current + 1);
                },
              }, t('common.retry')))),

        noteOpen && selection !== null
          ? h(CodeNoteForm, {
            path: selection.path,
            startLine: selection.startLine,
            endLine: selection.endLine,
            onCancel: () => setNoteOpen(false),
            onSave: (title) => { void saveNote(title); },
            t,
          })
          : null,

        selection === null
          ? h('div', { className: 'cs-code-hint' }, Glyph.target(11), h('span', { className: 'cs-ellipsis' }, t('code.hint')))
          : h('div', { className: 'cs-code-sel' },
            h('span', { className: 'cs-code-sel-label' },
              h('b', null, `${selection.startLine}-${selection.endLine}`),
              ' · ',
              t('code.selected', {
                start: formatInt(selection.startLine, locale),
                end: formatInt(selection.endLine, locale),
                count: formatInt(selection.endLine - selection.startLine + 1, locale),
              })),
            h('button', {
              type: 'button', className: 'cs-btn cs-small cs-primary', onClick: ask,
            }, Glyph.chatPlus(12), t('code.action.ask')),
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small',
              disabled: noteOpen,
              onClick: () => setNoteOpen(true),
            }, Glyph.noteAdd(12), t('code.action.note')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small cs-ghost', onClick: copySelection,
            }, Glyph.copy(12), copied ? t('code.copied') : t('code.action.copy')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small cs-ghost', onClick: clearPick,
            }, t('code.action.clear'))));
    }

    /**
     * The inline "save these lines as a note" form.
     *
     * Inline rather than a modal: the point of saving a selection as a note is to
     * keep looking at the code while naming it.
     * @param props - `{path, startLine, endLine, onSave(title), onCancel, t}`.
     * @returns the form.
     */
    function CodeNoteForm(props) {
      const {
        path, startLine, endLine, onSave, onCancel, t,
      } = props;
      const [title, setTitle] = useState(`${codeBaseName(path)} 第 ${startLine}-${endLine} 行`);
      return h('div', { className: 'cs-code-noteform' },
        h('div', { className: 'cs-row' },
          h('input', {
            className: 'cs-input',
            value: title,
            autoFocus: true,
            maxLength: 200,
            placeholder: t('code.note.title'),
            'aria-label': t('code.note.title'),
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSave?.(title);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancel?.();
              }
            },
          }),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-primary',
            disabled: title.trim() === '',
            onClick: () => onSave?.(title),
          }, t('code.note.save')),
          h('button', {
            type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.(),
          }, t('code.note.cancel'))));
    }

    /* ================================================================ *
     * selection-store.js
     * ================================================================ */
    /**
     * The selection each session's CodeSlice surfaces share.
     *
     * The code pane, the graph, the main panel and the composer bar are rendered by
     * different slot trees, so React context cannot reach from one to another. A
     * module-level store is the smallest thing that lets them agree on "this is the
     * code range the reader is looking at" without coupling any two of them:
     *
     *   - the code pane publishes a selection under its session id;
     *   - the composer bar reads the selection for the session it belongs to;
     *   - "添加到对话" pushes a one-shot quote request; the bar — which owns the
     *     host composer's `inputActions` — inserts it into the normal conversation.
     *
     * A selection is per-session. The host re-mounts the composer when the user
     * switches conversations, and a single global slot made a range picked in one
     * conversation disappear from that conversation (or worse, appear in another)
     * as soon as a different editor cleared it. Keeping one slot per session means
     * switching away and back restores the label and the range it points at.
     *
     * The store is intentionally tiny and synchronous. It is not persisted: a
     * selection is a reading gesture, not user data.
     */



    /** @type {{selections: Map<string, object>, contexts: Map<string, boolean>, pending: {selection?: object, text?: string, useContext?: boolean, sessionId: string, nonce: number}|null}} */
    let state = { selections: new Map(), contexts: new Map(), pending: null };
    let nonce = 0;
    const listeners = new Set();

    /** The map key for a session. An absent session is the legacy global slot. */
    function keyOf(sessionId) {
      return typeof sessionId === 'string' && sessionId.trim() !== '' ? sessionId : '';
    }

    function publish(next) {
      state = next;
      for (const listener of listeners) {
        try {
          listener(state);
        } catch {
          // One broken subscriber must not stop the others from seeing the change.
        }
      }
    }

    /** The current selection for one session, or null. */
    function getSelection(sessionId = '') {
      return state.selections.get(keyOf(sessionId)) ?? null;
    }

    /**
     * Whether a session's next question may use project context.
     *
     * Off by default, matching the desktop composer: a selected range is answered as
     * a range until the reader explicitly asks for the project's relationships.
     * @param sessionId - the session whose composer is asking.
     */
    function getContextEnabled(sessionId = '') {
      return state.contexts.get(keyOf(sessionId)) === true;
    }

    /**
     * Set one session's context preference.
     * @param enabled - true when project relationships may be used.
     * @param sessionId - the session that owns the composer toggle.
     */
    function setContextEnabled(enabled, sessionId = '') {
      const key = keyOf(sessionId);
      const next = enabled === true;
      if (state.contexts.get(key) === next) return;
      const contexts = new Map(state.contexts);
      contexts.set(key, next);
      publish({ ...state, contexts });
    }

    /**
     * Publish what the code pane has picked in one session.
     * @param selection - `{path, startLine, endLine, code}` or null.
     * @param sessionId - the session that owns the selection.
     */
    function setSelection(selection, sessionId = '') {
      const key = keyOf(sessionId);
      if (selection === null || selection === undefined) {
        // Clearing is explicit; an empty browser selection must not erase the
        // session's last range. `hideChip` already removes the in-editor action.
        if (!state.selections.has(key)) return;
        const selections = new Map(state.selections);
        selections.delete(key);
        publish({ ...state, selections });
        return;
      }
      const path = typeof selection.path === 'string' ? selection.path : '';
      if (path === '') return;
      const startLine = Math.max(1, Math.trunc(Number(selection.startLine ?? selection.line ?? 1)) || 1);
      const endLine = Math.max(startLine, Math.trunc(Number(selection.endLine ?? startLine)) || startLine);
      const selections = new Map(state.selections);
      selections.set(key, {
        path,
        startLine,
        endLine,
        code: typeof selection.code === 'string' ? selection.code : '',
      });
      publish({ ...state, selections });
    }

    /**
     * Ask for one quote to be inserted into one session's composer.
     *
     * The request is one-shot: the bar consumes it, so a remount does not paste the
     * same code twice.
     * @param selection - `{path, startLine, endLine, code}`.
     * @param sessionId - the target session; empty means the next bar to mount.
     */
    function requestQuote(selection, sessionId = '') {
      const path = typeof selection?.path === 'string' ? selection.path : '';
      if (path === '') return;
      const startLine = Math.max(1, Math.trunc(Number(selection.startLine ?? 1)) || 1);
      const endLine = Math.max(startLine, Math.trunc(Number(selection.endLine ?? startLine)) || startLine);
      nonce += 1;
      publish({
        ...state,
        pending: {
          selection: {
            path,
            startLine,
            endLine,
            code: typeof selection.code === 'string' ? selection.code : '',
          },
          useContext: getContextEnabled(sessionId),
          sessionId: keyOf(sessionId),
          nonce,
        },
      });
    }

    /**
     * Ask for one plain prompt to be inserted into one session's composer.
     *
     * The graph uses this for "ask about this node": there is no code range to
     * quote, but the question still belongs in the normal conversation.
     * @param text - the prompt.
     * @param sessionId - the target session; empty means the next bar to mount.
     */
    function requestPrompt(text, sessionId = '') {
      const body = String(text ?? '').trim();
      if (body === '') return;
      nonce += 1;
      publish({
        ...state,
        pending: { text: body, sessionId: keyOf(sessionId), nonce },
      });
    }

    /** Take the pending quote request for this session, if any. */
    function takePendingQuote(sessionId = '') {
      if (state.pending === null) return null;
      const target = state.pending.sessionId ?? '';
      const current = keyOf(sessionId);
      if (target !== '' && target !== current) return null;
      const pending = state.pending;
      publish({ ...state, pending: null });
      return pending;
    }

    /** Subscribe to every change; returns the disposer. */
    function subscribeSelection(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    /** A hook for consumers that only need the selection of one session. */
    function useSelection(sessionId = '') {
      const [value, setValue] = useState(() => getSelection(sessionId));
      useEffect(() => {
        setValue(getSelection(sessionId));
        return subscribeSelection(() => setValue(getSelection(sessionId)));
      }, [sessionId]);
      return value;
    }

    /** A hook for the bar: one session's selection, context mode and pending request. */
    function useSelectionState(sessionId = '') {
      const [value, setValue] = useState(() => ({
        selection: getSelection(sessionId),
        context: getContextEnabled(sessionId),
        pending: state.pending?.sessionId === keyOf(sessionId) || state.pending?.sessionId === ''
          ? state.pending
          : null,
      }));
      useEffect(() => {
        const read = () => ({
          selection: getSelection(sessionId),
          context: getContextEnabled(sessionId),
          pending: state.pending !== null
            && (state.pending.sessionId === '' || state.pending.sessionId === keyOf(sessionId))
            ? state.pending
            : null,
        });
        setValue(read());
        return subscribeSelection(() => setValue(read()));
      }, [sessionId]);
      return value;
    }

    /** The quote text the host composer receives. */
    function quoteText(selection) {
      if (selection === null || selection === undefined) return '';
      const range = selection.startLine === selection.endLine
        ? `${selection.startLine}`
        : `${selection.startLine}-${selection.endLine}`;
      const code = typeof selection.code === 'string' && selection.code.trim() !== ''
        ? selection.code
        : `（${selection.path}:${range}）`;
      return `关于 ${selection.path} 第 ${range} 行：\n${code}`;
    }

    /* ================================================================ *
     * workspace-resolve.js
     * ================================================================ */
    /**
     * Resolve the workspace a CodeSlice surface belongs to.
     *
     * A right-sidebar tab gets `scope.cwd`; a global main panel does not receive a
     * workspace at all. The host's workspace model does: every item lists the
     * sessions bound to it, so the active session is the join key. Keeping this in
     * one module means the composer bar and the workspace panel cannot disagree
     * about which repository they are reading.
     */

    /**
     * @param ctx - the client context.
     * @param props - slot props, optionally carrying `scope.cwd` or `sessionId`.
     * @returns an absolute directory, or undefined.
     */
    function resolveWorkspace(ctx, props) {
      const fromScope = props?.scope && typeof props.scope.cwd === 'string' ? props.scope.cwd : '';
      if (fromScope !== '') return fromScope;

      try {
        const sessionId = typeof props?.sessionId === 'string' && props.sessionId !== ''
          ? props.sessionId
          : (() => {
            const ui = typeof ctx?.get === 'function' ? ctx.get('uiSession') : undefined;
            const current = ui?.current?.value;
            return current?.props?.sessionId ?? current?.hooks?.session?.sessionId;
          })();
        // The session's own cwd is the authority (ui-conversation reads it too);
        // the workspace model below only exists to answer "which folder is this".
        if (typeof sessionId === 'string' && sessionId !== '') {
          const listed = typeof ctx?.get === 'function'
            ? ctx.get('sessions')?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
            : undefined;
          if (typeof listed === 'string' && listed !== '') return listed;
        }
        const model = typeof ctx?.get === 'function' ? ctx.get('workspaces')?.model : undefined;
        const items = Array.isArray(model?.items) ? model.items : [];
        if (typeof sessionId === 'string' && sessionId !== '') {
          const owner = items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId));
          const path = typeof owner?.path === 'string' ? owner.path : '';
          if (path !== '') return path;
        }
        if (items.length > 0 && typeof items[0]?.path === 'string' && items[0].path !== '') {
          return items[0].path;
        }
      } catch {
        // Fall through to the working-directory service.
      }

      const working = typeof ctx?.get === 'function' ? ctx.get('workingDirectory') : undefined;
      if (working === undefined || working === null) return undefined;
      if (typeof working.get === 'function') {
        const value = working.get();
        if (typeof value === 'string' && value !== '') return value;
      }
      if (typeof working.defaultDirectory === 'string' && working.defaultDirectory !== '') {
        return working.defaultDirectory;
      }
      return undefined;
    }

    /* ================================================================ *
     * reveal-code.js
     * ================================================================ */
    /**
     * Shared "take me back to this code range" behavior.
     *
     * The composer's range label and a note's code reference both need the same
     * result: expand the right sidebar, open the file in the tab owned by the
     * current session, and scroll the editor to the quoted lines. Keeping this in
     * one module means the two entry points cannot drift apart (one using
     * `openFile(path#Lx)` and the other using a real range, for example).
     */




    /** The path shown by the editor tab that owns one CodeMirror surface. */
    function editorPath(editor) {
      let ancestor = editor.parentElement;
      for (let depth = 0; ancestor !== null && depth < 6; depth += 1) {
        const input = ancestor.querySelector('input[class*="editorPathInput"]')
          ?? [...ancestor.querySelectorAll('input')].find((candidate) => candidate.value.includes('.'));
        if (input !== undefined && input !== null && input.value.trim() !== '') return input.value.trim();
        ancestor = ancestor.parentElement;
      }
      return '';
    }

    /** Turn a possibly absolute path into the workspace-relative form frames use. */
    function relativeTo(root, path) {
      const normalRoot = String(root ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '');
      const normalPath = String(path ?? '').replace(/\\/gu, '/');
      if (normalRoot !== '' && normalPath.toLowerCase().startsWith(`${normalRoot.toLowerCase()}/`)) {
        return normalPath.slice(normalRoot.length + 1);
      }
      return normalPath;
    }

    /** Read the line-number gutter row for one 1-based line, if it is rendered. */
    function findLineRow(editor, lineNumber) {
      const rows = [...editor.querySelectorAll('.cm-gutterElement')]
        .map((element) => ({ element, line: Number(element.textContent.trim()) }))
        .filter((row) => Number.isFinite(row.line) && row.line > 0);
      const gutters = rows.filter((row) => row.line === lineNumber);
      if (gutters.length === 0) return undefined;
      const editorRect = editor.getBoundingClientRect();
      // A wrapped line can expose more than one visual row; pick the one nearest
      // the editor viewport so a scroll lands predictably even when it is offscreen.
      return gutters.sort((a, b) => {
        const ar = a.element.getBoundingClientRect();
        const br = b.element.getBoundingClientRect();
        return Math.abs(ar.top - editorRect.top) - Math.abs(br.top - editorRect.top);
      })[0];
    }

    /** Scroll one open sidebar editor to the selected line. */
    function scrollEditorTo(selection) {
      const editors = [...document.querySelectorAll('.cm-editor')]
        .filter((editor) => editor.offsetParent !== null && editor.getBoundingClientRect().width > 0);
      const target = editors.find((editor) => {
        const path = editorPath(editor);
        if (path === '') return false;
        const a = path.replace(/\\/gu, '/');
        const b = selection.path.replace(/\\/gu, '/');
        return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
      }) ?? editors[0];
      if (target === undefined) return false;
      const scroller = target.querySelector('.cm-scroller');
      if (scroller === null) return false;
      const line = target.querySelector('.cm-line');
      const lineHeight = line === null ? 19 : Math.max(12, line.getBoundingClientRect().height);

      // The document can contain wrapped lines and folds, so multiplying a fixed
      // line height is not the same as the actual DOM top of line N. Scroll by the
      // measured delta when the line is rendered; the arithmetic remains only as a
      // fallback for a line CodeMirror has not materialized yet.
      const row = findLineRow(target, selection.startLine);
      if (row !== undefined) {
        const editorRect = target.getBoundingClientRect();
        const rowRect = row.element.getBoundingClientRect();
        const delta = rowRect.top - editorRect.top - 64;
        scroller.scrollTop = Math.max(0, Math.min(
          scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollTop + delta,
        ));
        return true;
      }
      scroller.scrollTop = Math.max(0, (selection.startLine - 3) * lineHeight);
      return true;
    }

    /** Resolve a frame's current anchored range before revealing it. */
    async function currentRange(ctx, selection, root, sessionId) {
      const relative = relativeTo(root, selection.path);
      try {
        const value = await api(ctx, 'frames', {
          op: 'list',
          root,
          path: relative,
          sessionId,
        });
        const frames = Array.isArray(value?.frames) ? value.frames : [];
        const frame = frames.find((row) => String(row.path).replace(/\\/gu, '/') === relative
          && Number(row.startLine) === Number(selection.startLine)
          && Number(row.endLine) === Number(selection.endLine));
        if (frame === undefined || frame === null) return selection;
        const startLine = Number(frame.actualStart ?? frame.startLine);
        const endLine = Number(frame.actualEnd ?? frame.endLine);
        if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return selection;
        return { ...selection, startLine, endLine };
      } catch {
        return selection;
      }
    }

    /**
     * Reveal a code range in the vendored sidebar.
     *
     * The editor is opened by path (one tab per file, Better Sidebar's VS Code
     * behavior) and scrolled to the range; the frame overlay then draws the box on
     * top. A failure returns `false` so the caller can decide not to navigate
     * somewhere else.
     *
     * @param ctx - the client context.
     * @param selection - `{path, startLine, endLine}` in workspace-relative form.
     * @param root - the workspace root, used to turn the relative path absolute.
     * @param sessionId - the session whose right sidebar owns the tab.
     * @returns whether an editor was found and scrolled.
     */
    function revealCodeRange(ctx, selection, root, sessionId) {
      if (selection === null || selection === undefined) return false;
      const sidebar = typeof ctx?.get === 'function' ? ctx.get('betterSidebar') : undefined;
      if (sidebar === undefined || sidebar === null || typeof sidebar.openFile !== 'function') return false;
      const raw = selection.path;
      const absolute = /^[A-Za-z]:[\\/]/u.test(raw) || raw.startsWith('/')
        ? raw
        : `${String(root ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '')}/${raw.replace(/^\.?\//u, '')}`;
      const base = typeof selection.title === 'string' && selection.title !== ''
        ? selection.title
        : (raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw);
      try {
        const right = ctx.get('sidebarRight');
        if (right !== undefined && right !== null && typeof right.isExpanded === 'function' && right.isExpanded() === false) {
          right.toggleExpanded?.();
        }
        right?.focus?.();
      } catch {
        // A collapsed sidebar still opens its tab; the panel toggle is best effort.
      }
      // Better Sidebar's `openFile` expects a plain SessionScope; the live
      // `sessions.scope()` value is a Cordis context whose properties are only
      // readable inside its own injection scope. Use the two fields the service
      // actually consumes instead of passing that context proxy through.
      const scope = { sessionId, cwd: root };
      try {
        sidebar.openFile(scope, absolute, base);
      } catch {
        return false;
      }

      const aligned = (range) => scrollEditorTo({ ...range, path: absolute });
      currentRange(ctx, selection, root, sessionId).then((range) => {
        // Keep the composer's label in sync with an anchor that moved; otherwise
        // the next click would scroll to the old number again.
        if (range.startLine !== selection.startLine || range.endLine !== selection.endLine) {
          setSelection({ path: selection.path, startLine: range.startLine, endLine: range.endLine, code: '' }, sessionId);
        }
        setTimeout(() => aligned(range), 350);
        setTimeout(() => aligned(range), 900);
      }).catch(() => {
        setTimeout(() => scrollEditorTo({ ...selection, path: absolute }), 350);
        setTimeout(() => scrollEditorTo({ ...selection, path: absolute }), 900);
      });
      return true;
    }

    /** The editor path helper, exported for callers that need to identify a tab. */

    /* ================================================================ *
     * codeslice-bar.js
     * ================================================================ */
    /**
     * The CodeSlice seat in the normal conversation composer.
     *
     * This is the bridge that lets the plugin live inside DSH's own dialog instead
     * of owning a second one:
     *
     *   - it shows the code range the reader last picked (`path:start-end`) above the
     *     input, so "what is this question about" is visible before sending;
     *   - "就这段提问" from any CodeSlice surface parks one quote request here, and
     *     this component inserts the quote through the host composer's own
     *     `inputActions` — the normal conversation, normal send, normal history;
     *   - "生成笔记" turns the *current DSH session* into a knowledge-base note, so
     *     the note is about the conversation the user actually had.
     */











    /** Prompt placed after the inserted code quote. */
    const ASK_PROMPT = '请解释这段代码在做什么，以及为什么这么写。';

    /**
     * @param props - the `conversation.input.dock` slot props, including
     *   `inputActions`, `sessionId`, `scope`, `t`.
     * @returns the bar.
     */
    function CodeSliceBar(props) {
      const {
        ctx, t, locale, scope, sessionId, inputActions,
      } = props;
      const workspace = resolveWorkspace(ctx, { ...props, scope });
      const call = useMemo(() => makeCaller(ctx, workspace), [ctx, workspace]);
      const state = useSelectionState(sessionId);
      const selection = state.selection;
      const contextOn = state.context === true;

      const [noteBusy, setNoteBusy] = useState(false);
      const [contextBusy, setContextBusy] = useState(false);
      const [notice, setNotice] = useState(undefined);
      const alive = useRef(true);
      const restoreTried = useRef('');

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      /* ---- one-shot quote requests from the code pane ------------------ */

      useEffect(() => {
        if (state.pending === null) return;
        const pending = takePendingQuote(sessionId);
        if (pending === null) return;
        const actions = inputActions;
        if (actions === undefined || actions === null) {
          setNotice({ kind: 'bad', text: t('bar.noComposer') });
          return;
        }
        // A graph node asks with plain text; a code range asks by quoting the code
        // and following it with the reading question.
        if (typeof pending.text === 'string' && pending.text !== '') {
          try {
            const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined;
            if (typeof actions.insertText === 'function' && span !== undefined) {
              actions.insertText(pending.text, span);
              return;
            }
          } catch {
            // Fall through to the quote path, which will report a missing composer.
          }
          setNotice({ kind: 'bad', text: t('bar.noComposer') });
          return;
        }
        const text = quoteText(pending.selection);
        if (text === '') return;
        if (typeof actions.insertQuote !== 'function') {
          setNotice({ kind: 'bad', text: t('bar.noComposer') });
          return;
        }
        actions.insertQuote(text);
        try {
          const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined;
          if (span !== undefined && typeof actions.insertText === 'function') {
            actions.insertText(ASK_PROMPT, span);
          }
        } catch {
          // The quote is already in; a prompt that could not be appended is not worth
          // an error banner.
        }
      }, [state, inputActions, sessionId, t]);

      /* ---- restore the last frame after a reload ------------------------- */

      useEffect(() => {
        if (selection !== null && selection !== undefined) {
          restoreTried.current = '';
          return undefined;
        }
        if (typeof sessionId !== 'string' || sessionId === '' || workspace === '') return undefined;
        if (restoreTried.current === sessionId) return undefined;
        restoreTried.current = sessionId;
        let live = true;
        call('frames', { op: 'list', root: workspace, sessionId })
          .then((value) => {
            if (!live) return;
            const frames = Array.isArray(value?.frames) ? value.frames : [];
            const latest = frames
              .slice()
              .sort((a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0))[0];
            if (latest === undefined) return;
            setSelection({
              path: latest.path,
              // A frame whose source shifted carries the anchored range; showing
              // the stored range would point at code that is no longer there.
              startLine: Number(latest.actualStart ?? latest.startLine),
              endLine: Number(latest.actualEnd ?? latest.endLine),
              code: '',
            }, sessionId);
          })
          .catch(() => {
            // No frame store or no frame: the label stays disabled, but a click can
            // never jump to the workbench or the notes page.
          });
        return () => { live = false; };
      }, [call, selection, sessionId, workspace]);

      /* ---- notes from the live DSH session ----------------------------- */

      const makeNote = useCallback(async () => {
        if (noteBusy) return;
        if (typeof sessionId !== 'string' || sessionId === '') {
          setNotice({ kind: 'bad', text: t('bar.noTurns') });
          return;
        }
        setNotice(undefined);
        setNoteBusy(true);
        try {
          // The transcript is read on the Host through `sessionQuery.readSurface`;
          // the client sends only the identity, so no Cordis reference objects cross
          // the wire and the session log stays the single source of truth.
          const value = await call('noteFromSession', {
            sessionId,
            title: t('bar.noteTitle'),
            path: selection?.path,
            startLine: selection?.startLine,
            endLine: selection?.endLine,
          });
          if (!alive.current) return;
          const title = value?.title ?? value?.note?.title ?? '';
          setNotice(value?.summaryFailed === true
            ? { kind: 'warn', text: t('bar.noteSavedRaw', { title }) }
            : { kind: 'ok', text: t('bar.noteSaved', { title }) });
        } catch (caught) {
          if (!alive.current) return;
          setNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setNoteBusy(false);
        }
      }, [call, noteBusy, selection, sessionId, t]);

      /**
       * Toggle whether the next question may use the project's relationships.
       *
       * The state is kept twice on purpose: this module store makes the bar's own
       * label immediate, while the Host copy feeds the dynamic `CodeSlice 联系上下文`
       * system-prompt section. A failed Host sync must not flip the button back —
       * the local session state remains authoritative for the UI.
       */
      const toggleContext = useCallback(async () => {
        if (selection === null || selection === undefined || contextBusy) return;
        const next = !contextOn;
        setContextEnabled(next, sessionId);
        setContextBusy(true);
        try {
          await call('context', { enabled: next, sessionId });
        } catch {
          // The local state + quote directive remain authoritative for this session.
        } finally {
          if (alive.current) setContextBusy(false);
        }
      }, [call, contextBusy, contextOn, selection, sessionId]);

      /* Keep the Host's prompt section in step with the bar when a session mounts
         or the selection changes. The Host state is process-wide, so a stale value
         from another conversation must not decide this one's answer. */
      useEffect(() => {
        if (selection === null || selection === undefined) return undefined;
        if (typeof sessionId !== 'string' || sessionId === '') return undefined;
        call('context', { enabled: contextOn, sessionId }).catch(() => {
          // A missing Host method only means the prompt section cannot be updated.
        });
        return undefined;
      }, [call, contextOn, selection, sessionId]);

      /**
       * Open the selected range in the sidebar editor.
       *
       * There is deliberately no fallback to the workbench: with no selection the
       * label is disabled, and a failed reveal is a failed reveal rather than a
       * surprising jump to the notes page.
       */
      const openSelection = useCallback(() => {
        if (selection === null || selection === undefined) return;
        revealCodeRange(ctx, selection, workspace, sessionId);
      }, [ctx, selection, sessionId, workspace]);

      const rangeLabel = selection === null
        ? t('bar.noSelection')
        : selection.startLine === selection.endLine
          ? `${selection.path}:${selection.startLine}`
          : `${selection.path}:${selection.startLine}-${selection.endLine}`;

      return h('div', { className: 'cs-bar-wrap' },
        h('div', { className: `cs-bar${selection === null ? '' : ' cs-bound'}` },
          h('button', {
            type: 'button',
            className: 'cs-bar-ref',
            disabled: selection === null,
            title: selection === null ? t('bar.noSelection') : `${selection.path}:${selection.startLine}-${selection.endLine} · 点击定位到代码`,
            onClick: openSelection,
          },
          h('span', { className: 'cs-dot' }),
          h('span', { className: 'cs-ellipsis' }, rangeLabel)),

          notice === undefined
            ? null
            : h('span', {
              className: `cs-bar-note${notice.kind === 'ok' ? ' cs-ok' : notice.kind === 'warn' ? ' cs-warn' : ' cs-bad'}`,
              title: notice.text,
            }, notice.kind === 'ok' ? Glyph.check(11) : Glyph.alert(11), h('span', { className: 'cs-ellipsis' }, notice.text)),

          h('span', { className: 'cs-grow' }),
          selection === null
            ? null
            : h('button', {
              type: 'button',
              className: `cs-btn cs-small cs-ghost cs-context${contextOn ? ' is-on' : ''}`,
              'aria-pressed': contextOn ? 'true' : 'false',
              title: contextOn ? t('bar.contextOnHint') : t('bar.contextOffHint'),
              disabled: contextBusy,
              onClick: () => { void toggleContext(); },
            }, Glyph.graph(11), t('bar.context')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-ghost',
            title: t('bar.noteHint'),
            disabled: noteBusy || typeof sessionId !== 'string' || sessionId === '',
            onClick: () => { void makeNote(); },
          }, Glyph.noteAdd(12), noteBusy ? t('bar.noteBusy') : t('bar.note'))));
    }

    /** Whether a surface can use the host composer. */
    function codeSliceBarAvailable(props) {
      return props !== null
        && props !== undefined
        && (typeof props.inputActions === 'object' || typeof props.useConversation === 'function');
    }

    /* ================================================================ *
     * graph-align.js
     * ================================================================ */
    /**
     * Canvas constants and pure predicates, transcribed from the desktop app.
     *
     * This module exists because the drawing vocabulary had drifted into two places:
     * `graph-tables.js` owned the edge weights while `graph-canvas.js` owned the
     * radius, the label budget, the arrow set and the dimming numbers. Every one of
     * those is a verbatim table in the reference tree, so they are collected here —
     * pure values and pure functions, no state, no React, no DOM — and both the
     * table module and the canvas read them from one place (spec §12 invariant 7:
     * the vocabulary is single-sourced).
     *
     * Nothing here imports anything. That is deliberate: the bundle is one factory
     * scope and this module must be emittable before any consumer, which is also why
     * every top-level name carries an `align` / `ALIGN` prefix (no collision with
     * `graph-tables.js`, `graph-canvas.js` or any other module in the bundle).
     *
     * Colour discipline: this file contains **no colour literals**. Any ink the
     * canvas needs is a `var(--dsw-alias-*)` token or a `color-mix` of one, taken
     * from `graph-tables.js`; a variant (a dimmer rim, a lighter core) is mixed here
     * at the call site rather than frozen into a hex value.
     */

    /* ------------------------------------------------------------------ *
     * Edge ink — `graphTheme.ts:45-80`, `GraphCanvas.tsx:462-464`        *
     * ------------------------------------------------------------------ */

    /**
     * Weight and alpha per relation, verbatim from `graphTheme.ts:50-55` and the
     * `edgeStyle()` switch at `:58-80`.
     *
     * Read it as loudness: a call is the evidence a reader came for, a containment
     * edge is scaffolding. The desktop draws both at one weight in the old canvas,
     * which is what turned a dense module into rope (`graphTheme.ts:40-44`).
     *
     * `default` is the fallback row for a relation this build has never heard of —
     * the desktop's `default: DEFAULT_EDGE` arm (`graphTheme.ts:77-78`), with the
     * same 0.8 / 0.28 weights (`graphTheme.ts:55`).
     */
    const ALIGN_EDGE_INK = {
      /* `CALL_EDGE` — `graphTheme.ts:50`, used by `:60-63`. */
      calls: { width: 1.5, opacity: 0.58 },
      indirect_call: { width: 1.5, opacity: 0.58 },
      references: { width: 1.5, opacity: 0.58 },
      /* `DEPENDENCY_EDGE` — `graphTheme.ts:51`, used by `:64-67`. */
      imports: { width: 0.8, opacity: 0.3 },
      imports_from: { width: 0.8, opacity: 0.3 },
      uses: { width: 0.8, opacity: 0.3 },
      /* `HIERARCHY_EDGE` — `graphTheme.ts:52`, used by `:68-70`. */
      inherits: { width: 0.9, opacity: 0.38 },
      implements: { width: 0.9, opacity: 0.38 },
      /* `STRUCTURE_EDGE` — `graphTheme.ts:53`, used by `:71-74`. */
      contains: { width: 0.5, opacity: 0.12 },
      method: { width: 0.5, opacity: 0.12 },
      declares: { width: 0.5, opacity: 0.12 },
      /* `MEANING_EDGE` — `graphTheme.ts:54`, used by `:75-76`. */
      rationale_for: { width: 0.5, opacity: 0.12 },
      /* `DEFAULT_EDGE` — `graphTheme.ts:55`, the `default` arm of the switch. */
      default: { width: 0.8, opacity: 0.28 },
    };

    /** The fallback row, named so callers need not know the `default` key. */
    const ALIGN_DEFAULT_EDGE_INK = ALIGN_EDGE_INK.default;

    /**
     * Inferred-width/opacity factors, verbatim `GraphCanvas.tsx:463-464`:
     * `width * 0.7`, `opacity * 0.6` (not a flat halving — see the note in
     * `graph-tables.js`: halving puts an inferred call edge at dependency ink).
     */
    const ALIGN_INFERRED_WIDTH = 0.7;
    const ALIGN_INFERRED_OPACITY = 0.6;

    /**
     * Resolve one edge's ink.
     *
     * Corresponds to `GraphCanvas.tsx:450-464`:
     *
     *   const style = edgeStyle(edge.relation)
     *   width:   inferred ? style.width * 0.7   : style.width
     *   color:   { opacity: inferred ? style.opacity * 0.6 : style.opacity }
     *
     * `inferred` is passed in rather than derived, because the decision is a
     * *confidence* question and stays single-sourced in
     * `graphMeta.ts:81-85` / `graph-tables.js#isInferred`.
     *
     * @param relation - the wire relation name.
     * @param options - `{inferred}`; anything else is ignored.
     * @returns `{width, opacity, inferred}` — the same shape `edgeInk()` returns, so
     *   the two can be swapped without touching a caller.
     */
    function alignEdgeInk(relation, options) {
      const row = ALIGN_EDGE_INK[String(relation)] ?? ALIGN_EDGE_INK.default;
      const inferred = options !== undefined && options !== null && options.inferred === true;
      return {
        width: inferred ? row.width * ALIGN_INFERRED_WIDTH : row.width,
        opacity: inferred ? row.opacity * ALIGN_INFERRED_OPACITY : row.opacity,
        inferred,
      };
    }

    /**
     * Structural scaffolding takes neutral ink instead of the source community's
     * colour — verbatim `graphTheme.ts:82-85`:
     * `contains | method | declares | rationale_for`.
     *
     * Note this is *not* the same set as `STRUCTURAL_RELATIONS` in `graphMeta.ts`
     * (which also lists imports/inherits/uses and answers a confidence question).
     * The desktop keeps both, and so does this port; conflating them makes imports
     * lose their community colour.
     *
     * @param relation - the wire relation name.
     * @returns whether the edge should be drawn in neutral ink.
     */
    function alignIsStructural(relation) {
      return relation === 'contains' || relation === 'method'
        || relation === 'declares' || relation === 'rationale_for';
    }

    /* ------------------------------------------------------------------ *
     * Arrows — `GraphCanvas.tsx:65-67`, `:465-470`                       *
     * ------------------------------------------------------------------ */

    /**
     * Relations that get an arrowhead.
     *
     * The desktop's set is `{calls, indirect_call, imports, imports_from, inherits,
     * implements}` (`GraphCanvas.tsx:67`). `references` and `uses` are added here:
     * both are directed, and the desktop draws them headless only because they fall
     * in neither of its two sets (`spec §2.9`, §11.4 flags it as a hole). Drawing
     * the arrow is the point of porting direction, so the hole is closed rather than
     * reproduced.
     */
    const ALIGN_ARROWED = new Set([
      'calls', 'indirect_call', 'imports', 'imports_from', 'inherits', 'implements', 'references', 'uses',
    ]);

    /**
     * Relations with no direction, verbatim `UNDIRECTED` (`GraphCanvas.tsx:66`).
     * An arrowhead here would claim a call that does not exist.
     */
    const ALIGN_UNDIRECTED = new Set(['same_folder', 'same_project', 'shared_reference']);

    /**
     * @param relation - the wire relation name.
     * @returns whether to draw an arrowhead at the target.
     */
    function alignArrowed(relation) {
      return ALIGN_ARROWED.has(relation) && !ALIGN_UNDIRECTED.has(relation);
    }

    /**
     * @param relation - the wire relation name.
     * @returns whether the relation is direction-free (`GraphCanvas.tsx:66`).
     */
    function alignUndirected(relation) {
      return ALIGN_UNDIRECTED.has(relation);
    }

    /* ------------------------------------------------------------------ *
     * Node geometry — `GraphCanvas.tsx:409`, `:433`                      *
     * ------------------------------------------------------------------ */

    /** Radius floor, verbatim `GraphCanvas.tsx:409` (7 px at degree 0). */
    const ALIGN_NODE_RADIUS_MIN = 7;

    /** Extra radius at the maximum degree, verbatim `GraphCanvas.tsx:409` (7 + 17). */
    const ALIGN_NODE_RADIUS_SPAN = 17;

    /**
     * Node radius from degree — verbatim `GraphCanvas.tsx:409`:
     *
     *   size: 7 + 17 * Math.sqrt(node.degree / maxDegree)
     *
     * with `maxDegree = Math.max(1, ...nodes.map(n => n.degree))` (`:409`). The
     * square root, not a linear ramp, is what keeps a 3-degree utility visible next
     * to a 200-degree hub instead of collapsing it to a pixel.
     *
     * @param degree - the node's incident edge count.
     * @param maxDegree - the largest degree in the slice; clamped to at least 1.
     * @returns the radius in graph units (7 … 24).
     */
    function alignNodeRadius(degree, maxDegree) {
      const ceiling = Math.max(1, Number(maxDegree) || 1);
      const value = Math.max(0, Number(degree) || 0);
      return ALIGN_NODE_RADIUS_MIN + ALIGN_NODE_RADIUS_SPAN * Math.sqrt(value / ceiling);
    }

    /* ------------------------------------------------------------------ *
     * Labels — `GraphCanvas.tsx:76-83`, `:113-153`                       *
     * ------------------------------------------------------------------ */

    /**
     * How many labels survive at a zoom level — verbatim `labelLimit`
     * (`GraphCanvas.tsx:76-83`).
     *
     * The non-monotonic shape (26 at 0.45, 24 at 0.28) is not a mistake: the
     * overview band holds more nodes on screen, so it gets fewer labels per node but
     * a similar total, which keeps the two zoom ranges looking equally dense.
     *
     * @param scale - the current zoom.
     * @returns the label budget for that band.
     */
    function alignLabelBudget(scale) {
      const value = Number(scale) || 0;
      if (value >= 0.7) return 22;
      if (value >= 0.45) return 26;
      if (value >= 0.28) return 24;
      if (value >= 0.15) return 16;
      if (value >= 0.08) return 10;
      return 6;
    }

    /** The 1.2 view margin that lets a label near the edge still appear (`:125-126`). */
    const ALIGN_LABEL_VIEW_MARGIN = 1.2;

    /**
     * Choose which nodes get a name at the current zoom — the SVG port of
     * `applyLabels()` (`GraphCanvas.tsx:113-153`).
     *
     * The desktop's steps, kept in order:
     *
     *   1. `scale = max(getScale(), 0.01)` — `:121`;
     *   2. the visible box in graph coordinates is
     *      `halfW = (viewportW / scale / 2) * 1.2`, same for height — `:125-127`;
     *   3. candidates are the non-hidden nodes inside that box — `:127-133`;
     *   4. sort by `degree` descending and take `limit` — `:134-135`;
     *   5. **the selected node is always added**, even when it did not make the cut
     *      — `:136`, invariant 4: a selection the reader cannot name is useless.
     *
     * One difference from the desktop: ties break on `id` so two equal-degree nodes
     * cannot swap places between renders. vis keeps insertion order, which is also
     * stable, but the SVG scene rebuilds its list per render and needs the tiebreak
     * to stay still.
     *
     * @param nodes - the slice's nodes; `{id, degree}` are read. `hidden: true` is
     *   skipped, so a caller may pass the unfiltered list.
     * @param positions - `Map<id, {x, y}>` in graph coordinates.
     * @param view - the camera centre in graph coordinates, i.e. what vis calls
     *   `network.getViewPosition()`.
     * @param scale - the current zoom.
     * @param viewport - `{width, height}` in CSS pixels.
     * @param limit - the label budget; `alignLabelBudget(scale)` is the usual value.
     * @param selectedId - optional; forced into the result when it has a position.
     * @returns a `Set` of node ids to label.
     */
    function alignPickLabels(nodes, positions, view, scale, viewport, limit, selectedId) {
      const safeScale = Math.max(Number(scale) || 0, 0.01);
      const width = Math.max(0, Number(viewport?.width ?? 0) || 0);
      const height = Math.max(0, Number(viewport?.height ?? 0) || 0);
      const halfWidth = (width / safeScale / 2) * ALIGN_LABEL_VIEW_MARGIN;
      const halfHeight = (height / safeScale / 2) * ALIGN_LABEL_VIEW_MARGIN;
      const centreX = Number(view?.x ?? 0) || 0;
      const centreY = Number(view?.y ?? 0) || 0;
      const budget = Math.max(0, Math.trunc(Number(limit) || 0));

      const picked = new Set();
      if (positions === undefined || positions === null) return picked;

      const candidates = [];
      for (const node of nodes ?? []) {
        if (node === undefined || node === null) continue;
        if (node.hidden === true) continue;
        const point = positions.get(node.id);
        if (point === undefined) continue;
        if (Math.abs(point.x - centreX) > halfWidth) continue;
        if (Math.abs(point.y - centreY) > halfHeight) continue;
        candidates.push(node);
      }

      candidates.sort((a, b) => (
        (Number(b.degree) || 0) - (Number(a.degree) || 0)
        || String(a.id).localeCompare(String(b.id))
      ));

      for (const node of candidates.slice(0, budget)) picked.add(node.id);

      if (selectedId !== undefined && selectedId !== null && typeof positions.has === 'function'
        && positions.has(selectedId)) {
        picked.add(selectedId);
      }
      return picked;
    }

    /* ------------------------------------------------------------------ *
     * Dimming — `GraphCanvas.tsx:501-524`, plus the hover variant        *
     * ------------------------------------------------------------------ */

    /**
     * The two dim tables.
     *
     * `select` is verbatim `GraphCanvas.tsx:508-521`:
     *
     *   nodes: opacity = (!active || node.hidden || connected) ? 1 : 0.42
     *   edges: opacity = !active ? base
     *          : (edge.from === active || edge.to === active) ? Math.max(base, 0.75)
     *          : 0.08
     *
     * `hover` is the port's addition: the desktop has no hover dimming at all
     * (`spec §2.3`), but this build asked for it, so the numbers are derived from the
     * same scale instead of being invented — three quarters of the way to full ink
     * for the faded nodes (`0.72`, the value the canvas already used), and incident
     * edges lifted only to `0.6` because a hover is a lighter claim than a click.
     */
    const ALIGN_DIM = {
      select: { node: 0.42, edge: 0.08, incidentEdgeMin: 0.75, hoverNode: 0.72 },
      hover: { node: 0.72, edge: 0.24, incidentEdgeMin: 0.6, hoverNode: 0.72 },
    };

    /**
     * The dim table for one focus kind.
     *
     * The returned object is shared and must not be mutated; `kind` is `'hover'` for
     * the lighter table and anything else (conventionally `'select'`) for the
     * desktop's selection table.
     *
     * @param kind - `'select'` or `'hover'`.
     * @returns `{node, edge, incidentEdgeMin, hoverNode}`.
     */
    function alignDimOpacity(kind) {
      return kind === 'hover' ? ALIGN_DIM.hover : ALIGN_DIM.select;
    }

    /**
     * Combine two dim candidates the way the canvas stacks them: the darker wins.
     *
     * The desktop only ever has one focus (the selection), so this rule only matters
     * in the port, where hover and selection can name two different nodes. Taking
     * the minimum is the only defensible composition: an element is dimmed if
     * *either* focus says it should be, so hovering elsewhere while something is
     * selected cannot brighten the graph.
     *
     * @param values - candidate opacities, already clamped to 0…1.
     * @returns the darkest one, or `1` when nothing was passed.
     */
    function alignDarker(values) {
      let result = 1;
      for (const value of values ?? []) {
        const number = Number(value);
        if (Number.isFinite(number) && number < result) result = number;
      }
      return result;
    }

    /**
     * Ink for a selected node's ring.
     *
     * The desktop paints the selected node with a *white* core
     * (`highlight.background = selectionFill`) and keeps the community colour as the
     * border (`GraphCanvas.tsx:436-439`, `graphTheme.ts:96`, §2.5: "white core,
     * coloured rim"). A plugin may not ship that literal — the gate scans the source
     * for colour values, and a frozen white would also be wrong on a light theme —
     * so the core is re-derived from the same `communityColor` the node already uses:
     * the host's base surface with a trace of the community colour mixed in, and the
     * rim is the colour itself.
     *
     * @param communityInk - a CSS colour, normally `communityColor(community)`.
     * @returns `{fill, stroke}` for the selection ring and the node body.
     */
    function alignSelectionRing(communityInk) {
      const ink = String(communityInk);
      return {
        fill: `color-mix(in srgb, ${ink} 10%, var(--dsw-alias-bg-base))`,
        stroke: ink,
      };
    }

    /**
     * The neutral ink for structural edges (`graphTheme.ts:107`: `fallbackEdge`).
     * A token rather than a frozen value, so the rim follows the host theme.
     */
    const ALIGN_STRUCTURAL_INK = 'var(--dsw-alias-label-secondary)';

    /* ================================================================ *
     * graph-tables.js
     * ================================================================ */






    /**
     * Every piece of graph vocabulary the canvas, the legend and the inspector read.
     *
     * Single-sourced on purpose (spec §12 invariant 7): a relation that renders
     * "调用" in the inspector must not read "calls" in a tooltip, and an inferred
     * edge must look inferred in the canvas, the legend and the row alike. That is
     * why labels live here as bilingual objects rather than as i18n keys — the
     * tables from `spec/frontend-interaction.md` §3 are the authority, and splitting
     * them across a dictionary would let one surface drift.
     *
     * The *drawing* tables — edge weight/alpha, radius, label budget, arrows, dim
     * strength — live in `graph-align.js` and are re-exported from here. They moved
     * because `graph-canvas.js` needs them and this module already imports nothing
     * but `graph-align.js`; keeping a second copy here is exactly the drift that
     * invariant 7 forbids. Everything below that is not a re-export is either a
     * label table or a confidence predicate.
     *
     * Colours are the one thing NOT transcribed verbatim from the desktop's CSS:
     * the graph is painted by vis-network on a canvas, which cannot parse a CSS
     * custom property or `color-mix()`. The palette below is therefore graphify's
     * own Tableau-10 hexadecimal array — the same values the desktop ships — so the
     * canvas, the rail swatches and the neighbour links cannot drift.
     */

    /* ------------------------------------------------------------------ *
     * Relations                                                          *
     * ------------------------------------------------------------------ */

    /**
     * Relation → bilingual label, verbatim from `graphMeta.ts:12-29`.
     *
     * All sixteen relations are present, including the three this build never emits
     * (`references`, `implements`, `declares`): they are in the desktop's vocabulary
     * and can arrive from a future scanner (`DESIGN §4.2`), so including them costs a
     * row and prevents an untranslated `implements` from reaching a tooltip. The
     * order also matches `graphMeta.ts` so the two tables diff cleanly.
     */
    const RELATION_LABEL = {
      same_folder: { zh: '同一笔记目录', en: 'Same note folder' },
      same_project: { zh: '同项目未分类', en: 'Same project, unfiled' },
      shared_reference: { zh: '共同引用文件', en: 'Shares a code reference' },
      community_member: { zh: '社区成员（布局索引）', en: 'Community member (layout index)' },
      contains: { zh: '包含', en: 'Contains' },
      imports: { zh: '导入模块', en: 'Imports module' },
      imports_from: { zh: '导入符号', en: 'Imports symbol' },
      calls: { zh: '调用', en: 'Calls' },
      indirect_call: { zh: '回调引用', en: 'Callback reference' },
      references: { zh: '引用', en: 'References' },
      inherits: { zh: '继承', en: 'Inherits' },
      implements: { zh: '实现', en: 'Implements' },
      method: { zh: '方法', en: 'Method' },
      declares: { zh: '声明', en: 'Declares' },
      rationale_for: { zh: '说明', en: 'Explains' },
      uses: { zh: '依赖', en: 'Uses' },
      community: { zh: '跨社区关联', en: 'Cross-community link' },
    };

    /**
     * Node kind → bilingual label, verbatim from `graphMeta.ts:32-41`.
     *
     * The eight kinds are the desktop's full set. `module` and `note` have no
     * producer in this build (`lib/model.js:32-34` keeps `module` for parity), which
     * is why they are carried rather than dropped: a kind the scanner cannot emit
     * today is still a kind the label table must be able to name.
     */
    const KIND_LABEL = {
      community: { zh: '社区', en: 'Community' },
      note: { zh: '笔记', en: 'Note' },
      file: { zh: '文件', en: 'File' },
      class: { zh: '类', en: 'Class' },
      function: { zh: '函数', en: 'Function' },
      module: { zh: '模块', en: 'Module' },
      rationale: { zh: '说明', en: 'Rationale' },
      external: { zh: '外部', en: 'External' },
    };

    /**
     * Confidence → bilingual label, verbatim from `graphMeta.ts:43-47` plus
     * `UNRESOLVED`.
     *
     * The desktop's `CONFIDENCE_LABEL` names only the three states its model uses.
     * `UNRESOLVED` exists in this build's model (`lib/model.js:100`) and in the wire
     * docs as a fourth state, so an untranslated one would otherwise reach a
     * tooltip as the raw enum — a row is cheaper than that bug.
     */
    const CONFIDENCE_LABEL = {
      EXTRACTED: { zh: '源码直读', en: 'Read from source' },
      INFERRED: { zh: '推断', en: 'Inferred' },
      AMBIGUOUS: { zh: '存疑', en: 'Ambiguous' },
      UNRESOLVED: { zh: '未解析', en: 'Unresolved' },
    };

    /* ------------------------------------------------------------------ *
     * Families                                                          *
     * ------------------------------------------------------------------ */

    /** Relation → family, verbatim from `graphMeta.ts:97-119`. */
    const RELATION_FAMILY = {
      contains: 'structure',
      method: 'structure',
      declares: 'structure',
      imports: 'dependency',
      imports_from: 'dependency',
      uses: 'dependency',
      calls: 'behaviour',
      indirect_call: 'behaviour',
      references: 'behaviour',
      inherits: 'hierarchy',
      implements: 'hierarchy',
      rationale_for: 'meaning',
      community: 'dependency',
    };

    /** Every family the legend offers, in legend order. */
    const FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy', 'meaning', 'other'];

    /**
     * Families visible on a cold start.
     *
     * Deviates from `graphFilter.ts:26` in one deliberate way: the desktop's default
     * set is `behaviour, dependency, structure, other`, which leaves the `hierarchy`
     * family out — and it had no chip either, so inheritance edges were hidden by
     * default *and* unreachable (`spec §2.10`, §11.4). Inheritance being invisible is
     * the exact gap this plugin exists to close (`DESIGN §5.3`), so `hierarchy` is on
     * by default and `other` — which this scanner never produces for code edges — is
     * off. Both remain toggleable from the legend.
     */
    const DEFAULT_FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy'];

    /**
     * Family of a relation.
     * @param relation - the wire relation name.
     * @returns one of `FAMILIES`; unknown relations land in `other`.
     */
    function relationFamily(relation) {
      return RELATION_FAMILY[relation] ?? 'other';
    }

    /**
     * Relations whose *confidence* can be read off the syntax.
     *
     * This is the desktop's `STRUCTURAL_RELATIONS` (`graphMeta.ts:56-66`) and it
     * answers a different question from `alignIsStructural` (which decides the ink
     * and lists only `contains/method/declares/rationale_for`, `graphTheme.ts:83-85`).
     * The two sets are deliberately distinct in the desktop and stay distinct here:
     * conflating them makes `imports` lose its community colour *and* makes an
     * untagged call edge render solid.
     */
    const STRUCTURAL_CONFIDENCE = new Set([
      'contains', 'method', 'imports', 'imports_from', 'inherits', 'implements', 'declares',
      'rationale_for', 'uses',
    ]);

    /* ------------------------------------------------------------------ *
     * Edge ink — re-exported from `graph-align.js`                       *
     * ------------------------------------------------------------------ */

    /**
     * Width + opacity per relation, verbatim `graphTheme.ts:50-80`.
     *
     * Re-exported rather than re-declared: `graph-canvas.js` reads the same object
     * through `alignEdgeInk`, and two literals would let a canvas edge and a legend
     * swatch disagree about how loud a call is.
     */
    const EDGE_INK = ALIGN_EDGE_INK;

    /** The neutral row for a relation with no table entry (`ALIGN_EDGE_INK.default`). */
    const DEFAULT_EDGE_INK = ALIGN_DEFAULT_EDGE_INK;

    /** Inferred-edge factors, verbatim `GraphCanvas.tsx:463-464` (`×0.7` / `×0.6`). */
    const INFERRED_WIDTH_FACTOR = ALIGN_INFERRED_WIDTH;
    const INFERRED_OPACITY_FACTOR = ALIGN_INFERRED_OPACITY;

    /** Radius floor and span, verbatim `GraphCanvas.tsx:409`. */
    const NODE_RADIUS_MIN = ALIGN_NODE_RADIUS_MIN;
    const NODE_RADIUS_MAX = ALIGN_NODE_RADIUS_MIN + ALIGN_NODE_RADIUS_SPAN;

    /** Neutral ink for structural edges; the alpha comes from the host theme. */
    const STRUCTURAL_EDGE_INK = ALIGN_STRUCTURAL_INK;

    /**
     * Relations that get an arrowhead.
     *
     * The set now lives in `graph-align.js` (`alignArrowed`), which is where the
     * canvas reads it; this wrapper exists so a caller holding the label tables does
     * not have to import two modules for one question.
     * @param relation - the wire relation name.
     * @returns whether to draw an arrowhead at the target.
     */
    function hasArrow(relation) {
      return alignArrowed(relation);
    }

    /**
     * Is this edge a deduction rather than a reading? Verbatim
     * `graphMeta.ts:81-85`, and the reason inferred edges are dotted everywhere.
     * @param relation - the wire relation name.
     * @param confidence - `EXTRACTED | INFERRED | AMBIGUOUS`, possibly absent.
     * @returns whether to render it as inferred.
     */
    function isInferred(relation, confidence) {
      if (confidence === 'INFERRED' || confidence === 'AMBIGUOUS') return true;
      return !STRUCTURAL_CONFIDENCE.has(relation) && confidence !== 'EXTRACTED';
    }

    /**
     * Resolve one edge's ink.
     *
     * A thin adapter over `alignEdgeInk` so the historical signature (relation +
     * confidence, rather than a precomputed `inferred` flag) keeps working: the
     * canvas knows the confidence and should not have to remember to call
     * `isInferred` first.
     * @param relation - the wire relation name.
     * @param confidence - the wire confidence, possibly absent.
     * @returns `{width, opacity, inferred}` with the inferred factors applied.
     */
    function edgeInk(relation, confidence) {
      return alignEdgeInk(relation, { inferred: isInferred(relation, confidence) });
    }

    /**
     * Should this edge take the community colour, or the neutral structural ink?
     *
     * Delegates to `alignIsStructural`, which is `graphTheme.ts:83-85`'s narrower set
     * (`contains/method/declares/rationale_for`). Note the name collision with
     * `STRUCTURAL_CONFIDENCE` above is *intentional and must stay*: the desktop has
     * two different notions of "structural" and merging them is a visible bug.
     * @param relation - the wire relation name.
     * @returns whether the edge is structural for ink purposes.
     */
    function isStructuralRelation(relation) {
      return alignIsStructural(relation);
    }

    /* ------------------------------------------------------------------ *
     * Node geometry — re-exported from `graph-align.js`                  *
     * ------------------------------------------------------------------ */

    /**
     * @param degree - the node's incident edge count.
     * @param maxDegree - the largest degree in the visible slice, at least 1.
     * @returns the radius in graph units.
     */
    function nodeRadius(degree, maxDegree) {
      return alignNodeRadius(degree, maxDegree);
    }

    /** Label truncation, verbatim `GraphCanvas.tsx:429`: 42 chars → 41 + ellipsis. */
    const LABEL_MAX_CHARS = 42;

    /**
     * @param label - the node's label.
     * @returns the label clipped to fit a 12 px glyph run.
     */
    function clipLabel(label) {
      const text = String(label ?? '');
      return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…` : text;
    }

    /**
     * How many labels this zoom level may draw, verbatim `GraphCanvas.tsx:76-83`.
     *
     * The non-monotonic shape is not a mistake to "fix": the overview range
     * (0.28–0.45) holds more nodes on screen than the 0.45–0.7 range, so it gets
     * fewer labels per node but a similar total, which is what keeps the two zoom
     * bands looking equally dense.
     * @param scale - the current zoom.
     * @returns the label budget.
     */
    function labelBudget(scale) {
      return alignLabelBudget(scale);
    }

    /* ------------------------------------------------------------------ *
     * Palette                                                            *
     * ------------------------------------------------------------------ */

    /**
     * Ten community inks, re-derived from the alias tokens.
     *
     * The desktop uses Tableau-10 (`graphTheme.ts:27-38`); a plugin must not ship
     * hex, so each entry is a `color-mix` between two host tokens at a ratio chosen
     * to keep consecutive communities separable in both themes. Order matters: the
     * first entry is the brand colour itself, so community 0 reads as "the accent".
     */
    /**
     * Community → ink.
     *
     * These are graphify's own Tableau-10 values (`exporters/base.py:11-14`), not
     * host tokens, because vis-network paints a canvas: a CSS custom property or a
     * `color-mix()` string cannot be parsed as a canvas fill. The rail swatches read
     * the same function, so a dot in the legend is byte-identical to the node.
     */
    const COMMUNITY_PALETTE = [
      '#4E79A7', // blue
      '#F28E2B', // orange
      '#E15759', // red
      '#76B7B2', // teal
      '#59A14F', // green
      '#EDC948', // yellow
      '#B07AA1', // purple
      '#FF9DA7', // pink
      '#9C755F', // brown
      '#BAB0AC', // grey
    ];

    /**
     * Community → ink, with a **true** modulo so a negative id works
     * (`graphTheme.ts:126-130`).
     * @param community - the numeric community id.
     * @returns a CSS colour string.
     */
    function communityColor(community) {
      const id = Number(community);
      const length = COMMUNITY_PALETTE.length;
      const slot = Number.isFinite(id) ? ((Math.trunc(id) % length) + length) % length : 0;
      return COMMUNITY_PALETTE[slot];
    }

    /* ------------------------------------------------------------------ *
     * Lookups                                                            *
     * ------------------------------------------------------------------ */

    /**
     * Read a bilingual cell, falling back to the raw key.
     * @param table - one of the label tables above.
     * @param key - the wire name.
     * @param locale - `'zh'` or `'en'`.
     * @returns the label, or `key` when the table has no row.
     */
    function labelOf(table, key, locale) {
      const row = table[key];
      if (row === undefined) return String(key ?? '');
      return locale === 'zh' ? row.zh : row.en;
    }

    /** @param relation - wire name. @param locale - `'zh' | 'en'`. */
    function relationLabel(relation, locale) {
      return labelOf(RELATION_LABEL, relation, locale);
    }

    /** @param kind - wire name. @param locale - `'zh' | 'en'`. */
    function kindLabel(kind, locale) {
      return labelOf(KIND_LABEL, kind, locale);
    }

    /** @param confidence - wire name. @param locale - `'zh' | 'en'`. */
    function confidenceLabel(confidence, locale) {
      return confidence === undefined || confidence === null
        ? ''
        : labelOf(CONFIDENCE_LABEL, confidence, locale);
    }

    /** @param family - one of `FAMILIES`. @param locale - `'zh' | 'en'`. */
    function familyLabel(family, locale) {
      const row = {
        behaviour: { zh: '行为', en: 'Behaviour' },
        dependency: { zh: '依赖', en: 'Dependency' },
        structure: { zh: '结构', en: 'Structure' },
        hierarchy: { zh: '继承', en: 'Hierarchy' },
        meaning: { zh: '说明', en: 'Meaning' },
        other: { zh: '其他', en: 'Other' },
      }[family];
      return row === undefined ? String(family ?? '') : (locale === 'zh' ? row.zh : row.en);
    }

    /**
     * The inspector's group order and labels.
     *
     * `key` matches the wire (`WIRE.md §3`) so the rail renders what the Host
     * grouped instead of re-deriving direction in the browser.
     */
    const GROUP_ORDER = [
      { key: 'callers', zh: '调用者', en: 'Callers' },
      { key: 'calls', zh: '调用', en: 'Calls' },
      { key: 'dependencies', zh: '依赖', en: 'Dependencies' },
      { key: 'structure', zh: '结构', en: 'Structure' },
      { key: 'meaning', zh: '说明', en: 'Explains' },
      { key: 'hierarchy', zh: '继承', en: 'Extends' },
      { key: 'related', zh: '关联', en: 'Related' },
    ];

    /**
     * @param key - a wire group key.
     * @param locale - `'zh' | 'en'`.
     * @returns the group's label, or the raw key.
     */
    function groupLabel(key, locale) {
      const row = GROUP_ORDER.find((entry) => entry.key === key);
      if (row === undefined) return String(key ?? '');
      return locale === 'zh' ? row.zh : row.en;
    }

    /**
     * The canvas corner's on-screen count — "已显示 N / 共 M".
     *
     * Bilingual here rather than in `i18n.js` for the same reason the relation
     * labels are: it is canvas vocabulary, and the canvas is the only surface that
     * renders it. It is deliberately *not* the same sentence as
     * `graph.status.truncated` ("图谱已截断：只画了 …"): that one is a warning about a
     * cap and belongs in a tooltip, while this one is a standing count that has to
     * fit a 60 px corner chip in both languages.
     *
     * The desktop shows the same pair as `.graph-head-stats` (`GraphView.tsx:281-283`,
     * "可见节点 / 关系 / 社区"), so the wording stays a count and never becomes advice.
     */
    const CANVAS_COUNT_LABEL = {
      zh: '已显示 {shown} / 共 {total}',
      en: 'Showing {shown} of {total}',
    };

    /**
     * @param shown - how many nodes the slice actually passes to the canvas.
     * @param total - how many the index holds, or `shown` when nothing was cut.
     * @param locale - `'zh' | 'en'`.
     * @returns the count phrase, interpolated.
     */
    function canvasCountLabel(shown, total, locale) {
      const row = CANVAS_COUNT_LABEL[locale] ?? CANVAS_COUNT_LABEL.en;
      return row
        .replace('{shown}', String(shown))
        .replace('{total}', String(total));
    }

    /* ================================================================ *
     * graph-canvas.js
     * ================================================================ */








    /**
     * The graph canvas, drawn by the renderer graphify itself ships.
     *
     * The previous SVG scene was a hand-reproduction: it could match the desktop's
     * *rules* (node radius, ink, label budgets) but not its feel, because the desktop
     * hands the picture to vis-network and lets physics settle it. This component
     * does the same. The options below are graphify's `graph.html` verbatim
     * (`graphify/exporters/html.py:225-268`): forceAtlas2Based at −60/0.005/120/
     * 0.08/0.4/0.8, 200 stabilization passes, dot nodes sized by degree, continuous
     * rounded edges with arrows, and physics switched off once the pass reports
     * completion.
     *
     * What is deliberately *not* copied from graphify: its sidebar. The rail here is
     * the desktop's (search, inspector, community checklist), and the community
     * names it lists come from the Host's desktop-rule labels (`api.ts +44`,
     * `未分类`). The canvas and the rail therefore describe the same communities.
     *
     * Degradation is explicit: vis-network is a lazy Host asset. Until it loads the
     * panel shows a loading pill; if the asset cannot be fetched it shows an error
     * with retry, rather than a blank rectangle.
     */

    /** vis-network's default edge grey, at graphify's two confidence alphas. */
    const GC_EDGE_INK = '#848484';

    /** Graphify paints the selected/hovered node with a white core. */
    const GC_HIGHLIGHT_FILL = '#ffffff';

    const GC_LABEL_FACE = 'system-ui, "Microsoft YaHei UI", "Segoe UI", sans-serif';

    /** Stop waiting for a stabilization pass that has gone silent. */
    const GC_SETTLE_TIMEOUT_MS = 25_000;

    /** Settled coordinates, keyed by topology; a tab switch must not shake the graph. */
    const GC_POSITIONS = new Map();
    const GC_POSITIONS_MAX = 4;

    /** The topology fingerprint: node and edge ids, nothing cosmetic. */
    function gcTopologyKey(nodes, links) {
      let hash = 2166136261;
      const mix = (text) => {
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
      };
      for (const node of nodes) {
        mix(String(node.id));
        mix('\u0000');
      }
      for (const link of links) {
        mix(String(link.source));
        mix('\u0001');
        mix(String(link.target));
        mix('\u0002');
      }
      return `${nodes.length}:${links.length}:${hash >>> 0}`;
    }

    function gcRememberPositions(key, network) {
      if (key === '') return;
      const positions = network.getPositions();
      const map = new Map();
      for (const [id, point] of Object.entries(positions)) {
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) map.set(id, point);
      }
      GC_POSITIONS.delete(key);
      GC_POSITIONS.set(key, map);
      while (GC_POSITIONS.size > GC_POSITIONS_MAX) {
        const oldest = GC_POSITIONS.keys().next().value;
        if (oldest === undefined) break;
        GC_POSITIONS.delete(oldest);
      }
    }

    function gcRecallPositions(key, ids) {
      const cached = GC_POSITIONS.get(key);
      if (cached === undefined) return undefined;
      const hits = ids.reduce((count, id) => count + (cached.has(id) ? 1 : 0), 0);
      return ids.length > 0 && hits / ids.length >= 0.8 ? cached : undefined;
    }

    /** Legend swatch ink: family identity in the same weight as the canvas edges. */
    function gcFamilySwatch(family) {
      return {
        behaviour: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, transparent)',
        dependency: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 46%, transparent)',
        structure: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 46%, transparent)',
        hierarchy: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 74%, transparent)',
        meaning: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 74%, transparent)',
        other: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 34%, transparent)',
      }[family] ?? 'color-mix(in srgb, var(--dsw-alias-label-secondary) 34%, transparent)';
    }

    /**
     * The label ink is whatever the host's surface uses; vis needs a real colour.
     */
    function gcLabelColor(host) {
      try {
        const color = getComputedStyle(host).color;
        if (typeof color === 'string' && color !== '' && color !== 'rgba(0, 0, 0, 0)') return color;
      } catch {
        // Detached node during teardown.
      }
      return '#e0e0e0';
    }

    /** Cross-file community labels are already short; clip the pathological ones. */
    function gcNodeLabel(node) {
      return clipLabel(node.label);
    }

    /**
     * Compute which nodes and links the filters hide.
     *
     * Filters set `hidden` on the DataSet rather than deleting rows: vis keeps the
     * coordinates of a hidden node, so re-enabling a family cannot restart the
     * layout (the same invariant the SVG canvas had).
     */
    function gcFilterModel(nodes, links, families, hiddenCommunities) {
      const familySet = families ?? new Set();
      const hiddenSet = hiddenCommunities ?? new Set();
      const nodeHidden = new Map();
      for (const node of nodes) {
        let hidden = hiddenSet.has(Number(node.community ?? 0));
        if (!hidden && node.kind === 'rationale') hidden = !familySet.has('meaning');
        if (!hidden && node.kind === 'external') hidden = !familySet.has('dependency');
        nodeHidden.set(node.id, hidden);
      }
      const linkHidden = new Map();
      for (const link of links) {
        const hidden = !familySet.has(link.family)
          || nodeHidden.get(link.source) === true
          || nodeHidden.get(link.target) === true;
        linkHidden.set(link.id, hidden);
      }
      return { nodeHidden, linkHidden };
    }

    /**
     * @param props - the panel's canvas contract:
     *   `{ctx, nodes, links, selectedId, onSelect, onOpen, families,
     *   onToggleFamily, hiddenCommunities, truncation, loading, error, onRetry,
     *   visible, t, locale, controller, aggregated}`.
     * @returns the canvas, its tools, the count caption and the family legend.
     */
    function GraphCanvas(props) {
      const {
        ctx, nodes, links, selectedId, onSelect, onOpen,
        families, onToggleFamily, hiddenCommunities,
        truncation, loading, error, onRetry, visible, t, locale, controller, aggregated,
      } = props;

      const hostRef = useRef(null);
      const mountRef = useRef(null);
      const networkRef = useRef(null);
      const setsRef = useRef(undefined);
      const settleTimer = useRef(0);

      const [vis, setVis] = useState(undefined);
      const [assetError, setAssetError] = useState(undefined);
      const [assetNonce, setAssetNonce] = useState(0);
      const [settling, setSettling] = useState(false);
      const [labelColor, setLabelColor] = useState('#e0e0e0');

      const parked = visible === false;
      const maxDegree = useMemo(() => {
        let max = 1;
        for (const node of nodes) {
          const degree = Number(node.degree ?? 0);
          if (degree > max) max = degree;
        }
        return max;
      }, [nodes]);
      const topologyKey = useMemo(() => gcTopologyKey(nodes, links), [nodes, links]);
      const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
      const filterModel = useMemo(
        () => gcFilterModel(nodes, links, families, hiddenCommunities),
        [nodes, links, families, hiddenCommunities],
      );
      const visibleCount = useMemo(() => {
        let count = 0;
        for (const node of nodes) if (filterModel.nodeHidden.get(node.id) !== true) count += 1;
        return count;
      }, [nodes, filterModel]);

      /* ---- label ink follows the host theme -------------------------- */

      useEffect(() => {
        if (parked) return undefined;
        const read = () => {
          const host = hostRef.current;
          if (host !== null && host !== undefined) setLabelColor(gcLabelColor(host));
        };
        read();
        const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(read);
        observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
        if (document.body) observer?.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
        const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
        media?.addEventListener?.('change', read);
        return () => {
          observer?.disconnect();
          media?.removeEventListener?.('change', read);
        };
      }, [parked]);

      /* ---- load the renderer ----------------------------------------- */

      useEffect(() => {
        if (parked) return undefined;
        let cancelled = false;
        setAssetError(undefined);
        loadVis(ctx).then((namespace) => {
          if (!cancelled) setVis(namespace);
        }).catch((caught) => {
          if (!cancelled) setAssetError(caught && caught.message ? caught.message : String(caught));
        });
        return () => { cancelled = true; };
      }, [ctx, parked, assetNonce]);

      /* ---- build / rebuild the network ------------------------------- */

      useEffect(() => {
        if (parked || vis === undefined || mountRef.current === null) return undefined;

        const cachedPositions = gcRecallPositions(topologyKey, nodes.map((node) => node.id));
        const nodeRows = nodes.map((node, index) => {
          const degree = Number(node.degree ?? 0);
          const color = communityColor(node.community ?? 0);
          const seed = { x: 30 * Math.sqrt(index) * Math.cos(index * 2.4), y: 30 * Math.sqrt(index) * Math.sin(index * 2.4) };
          const position = cachedPositions?.get(node.id) ?? seed;
          return {
            id: node.id,
            label: gcNodeLabel(node),
            title: `${node.label}\n${kindLabel(node.kind, locale)}${node.path ? `\n${node.path}${node.line ? `:${node.line}` : ''}` : ''}${node.communityLabel ? `\n${t('graph.tooltip.community', { label: node.communityLabel })}` : ''}\n${t('graph.tooltip.connections', { degree: node.memberCount ?? node.degree ?? 0 })}`,
            hidden: filterModel.nodeHidden.get(node.id) === true,
            shape: 'dot',
            size: 10 + 30 * (degree / maxDegree),
            color: {
              background: color,
              border: color,
              highlight: { background: GC_HIGHLIGHT_FILL, border: color },
              hover: { background: GC_HIGHLIGHT_FILL, border: color },
            },
            // Graphify shows names only on hubs at the overview (15% of the max
            // degree); the rest stay dots with a tooltip. Community meta-nodes are
            // all hubs by construction, so they always carry their name.
            font: {
              size: node.aggregated === true || degree >= maxDegree * 0.15 ? 12 : 0,
              color: labelColor,
              face: GC_LABEL_FACE,
            },
            x: position.x,
            y: position.y,
          };
        });

        const edgeRows = links.map((link, index) => {
          const extracted = link.confidence === 'EXTRACTED';
          return {
            id: link.id ?? `e${index}`,
            from: link.source,
            to: link.target,
            hidden: filterModel.linkHidden.get(link.id) === true,
            label: '',
            title: `${relationLabel(link.relation, locale)} · ${confidenceLabel(link.confidence, locale)}${link.line ? ` · L${link.line}` : ''}${link.count ? ` · ${link.count}` : ''}`,
            dashes: !extracted,
            width: extracted ? 2 : 1,
            color: { color: GC_EDGE_INK, opacity: extracted ? 0.7 : 0.35 },
            arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          };
        });

        const data = {
          nodes: new vis.DataSet(nodeRows),
          edges: new vis.DataSet(edgeRows),
        };
        setsRef.current = data;

        const options = {
          physics: {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
              gravitationalConstant: -60,
              centralGravity: 0.005,
              springLength: 120,
              springConstant: 0.08,
              damping: 0.4,
              avoidOverlap: 0.8,
            },
            stabilization: { iterations: 200, fit: true },
          },
          interaction: {
            hover: true,
            tooltipDelay: 100,
            hideEdgesOnDrag: true,
            navigationButtons: false,
            keyboard: false,
          },
          nodes: { shape: 'dot', borderWidth: 1.5 },
          edges: { smooth: { type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
        };

        const network = new vis.Network(mountRef.current, data, options);
        networkRef.current = network;
        setSettling(true);

        const fitVisible = () => {
          const ids = nodes.filter((node) => filterModel.nodeHidden.get(node.id) !== true).map((node) => node.id);
          network.fit(ids.length > 0 ? { nodes: ids, animation: false } : { animation: false });
        };

        const settle = () => {
          if (networkRef.current !== network) return;
          if (settleTimer.current !== 0) {
            clearTimeout(settleTimer.current);
            settleTimer.current = 0;
          }
          network.setOptions({ physics: { enabled: false } });
          setSettling(false);
          gcRememberPositions(topologyKey, network);
          fitVisible();
        };

        network.once('stabilizationIterationsDone', settle);
        settleTimer.current = setTimeout(settle, GC_SETTLE_TIMEOUT_MS);

        // A cached topology opens settled: physics off, camera on the picture. This
        // is the desktop's position cache, and it is why switching tabs does not
        // shake a graph the reader already oriented themselves in.
        if (gcRecallPositions(topologyKey, nodes.map((node) => node.id)) !== undefined) {      network.setOptions({ physics: { enabled: false } });
          setSettling(false);
          if (settleTimer.current !== 0) {
            clearTimeout(settleTimer.current);
            settleTimer.current = 0;
          }
          fitVisible();
        }

        network.on('click', (params) => {
          if (Array.isArray(params.nodes) && params.nodes.length > 0) onSelect?.(params.nodes[0]);
          else onSelect?.(undefined);
        });
        network.on('doubleClick', (params) => {
          const id = Array.isArray(params.nodes) ? params.nodes[0] : undefined;
          if (id !== undefined) onOpen?.(nodesById.get(id));
        });
        network.on('hoverNode', () => {
          if (mountRef.current !== null) mountRef.current.style.cursor = 'pointer';
        });
        network.on('blurNode', () => {
          if (mountRef.current !== null) mountRef.current.style.cursor = 'default';
        });
        network.on('dragEnd', () => gcRememberPositions(topologyKey, network));

        const observer = typeof ResizeObserver === 'undefined'
          ? undefined
          : new ResizeObserver(() => network.redraw());
        if (observer !== undefined && mountRef.current !== null) observer.observe(mountRef.current);

        return () => {
          observer?.disconnect();
          if (settleTimer.current !== 0) {
            clearTimeout(settleTimer.current);
            settleTimer.current = 0;
          }
          gcRememberPositions(topologyKey, network);
          network.destroy();
          networkRef.current = null;
          setsRef.current = undefined;
          setSettling(false);
        };
        // Rebuilt only when the topology or the renderer changes; filters, theme and
        // selection update the datasets in place so the camera never resets.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [vis, parked, topologyKey, nodesById, t, locale]);

      /* ---- update rows in place -------------------------------------- */

      useEffect(() => {
        const sets = setsRef.current;
        const network = networkRef.current;
        if (sets === undefined || network === null) return;

        sets.nodes.update(nodes.map((node) => {
          const degree = Number(node.degree ?? 0);
          const color = communityColor(node.community ?? 0);
          return {
            id: node.id,
            label: gcNodeLabel(node),
            hidden: filterModel.nodeHidden.get(node.id) === true,
            size: 10 + 30 * (degree / maxDegree),
            color: {
              background: color,
              border: color,
              highlight: { background: GC_HIGHLIGHT_FILL, border: color },
              hover: { background: GC_HIGHLIGHT_FILL, border: color },
            },
            font: {
              size: node.aggregated === true || degree >= maxDegree * 0.15 ? 12 : 0,
              color: labelColor,
              face: GC_LABEL_FACE,
            },
          };
        }));
        sets.edges.update(links.map((link, index) => {
          const extracted = link.confidence === 'EXTRACTED';
          return {
            id: link.id ?? `e${index}`,
            hidden: filterModel.linkHidden.get(link.id) === true,
            dashes: !extracted,
            width: extracted ? 2 : 1,
            color: { color: GC_EDGE_INK, opacity: extracted ? 0.7 : 0.35 },
          };
        }));
      }, [nodes, links, filterModel, maxDegree, labelColor]);

      /* ---- selection -------------------------------------------------- */

      useEffect(() => {
        const network = networkRef.current;
        if (network === null) return;
        network.selectNodes(selectedId === undefined || selectedId === null ? [] : [selectedId]);
      }, [selectedId, vis, topologyKey]);

      /* ---- imperative controls --------------------------------------- */

      useEffect(() => {
        if (controller === undefined || controller === null) return;
        controller.current = {
          zoomBy(factor) {
            const network = networkRef.current;
            if (network === null) return;
            const scale = Math.max(0.03, Math.min(4, network.getScale() * factor));
            network.moveTo({ scale, animation: false });
          },
          fit() {
            const network = networkRef.current;
            if (network === null) return;
            const ids = nodes.filter((node) => filterModel.nodeHidden.get(node.id) !== true).map((node) => node.id);
            network.fit(ids.length > 0 ? { nodes: ids, animation: false } : { animation: false });
          },
          centre(id) {
            const network = networkRef.current;
            if (network === null) return;
            const point = network.getPositions([id])[id];
            if (point === undefined) return;
            network.moveTo({ position: point, scale: network.getScale(), animation: false });
          },
        };
      }, [controller, nodes, filterModel]);

      /* ---- render ----------------------------------------------------- */

      const empty = nodes.length === 0 && loading !== true && (error === undefined || error === null);
      const shown = truncation !== undefined && truncation !== null ? Number(truncation.shown ?? nodes.length) : nodes.length;
      const total = truncation !== undefined && truncation !== null ? Number(truncation.total ?? shown) : shown;
      const capped = total > shown;

      return h('div', { className: 'cs-graph-stage' },
        h('div', { className: 'cs-canvas', ref: hostRef, 'data-settling': settling ? 'true' : undefined },
        h('div', { ref: mountRef, style: { position: 'absolute', inset: '0' } }),

        loading === true ? h('div', { className: 'cs-canvas-empty' },
          h('span', { className: 'cs-row' },
            h('span', { className: 'cs-spin' }, Glyph.spinner(12)),
            h('span', null, t('graph.loading')))) : null,

        loading !== true && assetError !== undefined ? h('div', { className: 'cs-canvas-empty' },
          h('div', { className: 'cs-col', style: { gap: '6px', alignItems: 'center' } },
            h('b', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('graph.error.title')),
            h('span', null, assetError),
            h('button', {
              type: 'button',
              className: 'cs-btn',
              onClick: () => {
                setVis(undefined);
                setAssetError(undefined);
                setAssetNonce((current) => current + 1);
              },
            }, t('common.retry')))) : null,

        loading !== true && assetError === undefined && error !== undefined && error !== null ? h('div', { className: 'cs-canvas-empty' },
          h('div', { className: 'cs-col', style: { gap: '6px', alignItems: 'center' } },
            h('b', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('graph.error.title')),
            h('span', null, error.message),
            h('button', { type: 'button', className: 'cs-btn', onClick: () => onRetry?.() }, t('common.retry')))) : null,

        empty ? h('div', { className: 'cs-canvas-empty' },
          h('div', { className: 'cs-col', style: { gap: '4px', alignItems: 'center' } },
            h('b', null, t('graph.empty.title')),
            h('span', null, t('graph.empty.body')))) : null,

        empty !== true && loading !== true && assetError === undefined && (error === undefined || error === null) && visibleCount === 0
          ? h('div', { className: 'cs-canvas-empty' }, t('graph.empty.filtered'))
          : null,

        settling ? h('div', { className: 'cs-canvas-pill' },
          h('span', { className: 'cs-spin' }, Glyph.spinner(11)),
          h('span', null, t('graph.laying'))) : null,

        capped || aggregated === true ? h('div', {
          className: 'cs-canvas-cap',
          title: aggregated === true
            ? t('graph.status.aggregatedTitle', { communities: shown, total })
            : t('graph.status.truncated', { shown, total }),
        }, aggregated === true
          ? t('graph.status.aggregated', { communities: shown, total })
          : canvasCountLabel(shown, total, locale)) : null,

        h('div', { className: 'cs-canvas-tools' },
          h('button', {
            type: 'button', className: 'cs-iconbtn', title: t('graph.zoom.in'), 'aria-label': t('graph.zoom.in'),
            onClick: () => controller?.current?.zoomBy(1.1),
          }, Glyph.plus(14)),
          h('button', {
            type: 'button', className: 'cs-iconbtn', title: t('graph.zoom.out'), 'aria-label': t('graph.zoom.out'),
            onClick: () => controller?.current?.zoomBy(1 / 1.1),
          }, Glyph.minus(14)),
          h('button', {
            type: 'button', className: 'cs-iconbtn', title: t('graph.action.fit'), 'aria-label': t('graph.action.fit'),
            onClick: () => controller?.current?.fit(),
          }, Glyph.fit(14))),

        h('div', { className: 'cs-canvas-hint' }, t('graph.canvas.hint'))),

      h('div', { className: 'cs-legend' },
        h('span', { className: 'cs-legend-label' }, t('graph.legend.title')),
        FAMILIES.map((family) => h('button', {
          key: family,
          type: 'button',
          className: 'cs-chip',
          'aria-pressed': families?.has(family) === true ? 'true' : 'false',
          title: familyLabel(family, locale),
          onClick: () => onToggleFamily?.(family),
        },
        h('span', {
          className: 'cs-swatch',
          style: { background: gcFamilySwatch(family), opacity: family === 'behaviour' ? '0.9' : '0.45' },
        }),
        h('span', null, familyLabel(family, locale))))));
    }

    /* ================================================================ *
     * graph-layout.js
     * ================================================================ */
    /**
     * Force layout, interruptible.
     *
     * The reference app hands a ~2,000-node graph to vis-network's force-atlas-2
     * solver and lets it run (`GraphCanvas.tsx:254-289`). That is not available
     * here, and a synchronous re-implementation would be worse than the problem it
     * solves: the old plugin ran its O(n²) pass inline on every resize bucket
     * (`DESIGN §1.9`, ~12M pair updates per redraw), which is exactly why the tab
     * felt dead while it dragged.
     *
     * So the loop is sliced. Each frame does as many iteration slices as fit in
     * `FRAME_BUDGET_MS`, reports progress, and yields. Three consequences that the
     * rest of the panel depends on:
     *
     *   1. A parked tab (`visible: false`) can cancel the run on the next frame
     *      boundary, so a hidden graph costs nothing.
     *   2. Physics never blocks the first paint — the caller paints the sunflower
     *      seed immediately and the picture settles in place.
     *   3. `stop()` is honoured between slices, not after the whole pass.
     *
     * The force model itself keeps the reference constants where they exist
     * (`-60 / 0.005 / 120 / 0.08 / 0.4 / 0.8`) and the original plugin's sunflower
     * seeding, which is what makes the first frame look like a picture instead of a
     * random cloud.
     */

    /** Iteration budget per frame. Above this a frame misses its 16 ms slot. */
    const FRAME_BUDGET_MS = 8;

    /** Hard cap on iterations, sized like the reference's 140/200 split. */
    const ITERATIONS_SMALL = 210;
    const ITERATIONS_LARGE = 140;
    const LARGE_GRAPH = 1200;

    /* Force-atlas-2-flavoured constants, from `GraphCanvas.tsx:254-289`. */
    const GRAVITATIONAL = -60;
    const CENTRAL_GRAVITY = 0.005;
    const SPRING_LENGTH = 120;
    const SPRING_CONSTANT = 0.08;
    const DAMPING = 0.4;
    const AVOID_OVERLAP = 0.8;

    /** Golden angle: the sunflower seed. */
    const GOLDEN_ANGLE = 2.399963229728653;

    /**
     * Seed positions on a sunflower spiral.
     *
     * A plain circle puts every node on one ring, so the first iterations fight
     * over equal radii and the early picture is a rotating annulus. The spiral
     * gives each node a distinct radial distance, which is why the first frame is
     * already readable.
     * @param count - how many nodes.
     * @param radius - spiral radius in graph units.
     * @returns `{xs, ys}` centred on the origin.
     */
    function seed(count, radius) {
      const xs = new Float64Array(count);
      const ys = new Float64Array(count);
      for (let index = 0; index < count; index += 1) {
        const angle = index * GOLDEN_ANGLE;
        const spread = Math.sqrt((index + 0.5) / count) * radius;
        xs[index] = Math.cos(angle) * spread;
        ys[index] = Math.sin(angle) * spread;
      }
      return { xs, ys };
    }

    /**
     * Fit a coordinate box into a canvas box, preserving aspect and clamping scale.
     * @param xs - x coordinates.
     * @param ys - y coordinates.
     * @param width - canvas width.
     * @param height - canvas height.
     * @param padding - inner margin in px.
     * @returns `{scale, dx, dy}` to apply as `x*scale + dx`.
     */
    function fitTransform(xs, ys, width, height, padding) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let index = 0; index < xs.length; index += 1) {
        if (xs[index] < minX) minX = xs[index];
        if (xs[index] > maxX) maxX = xs[index];
        if (ys[index] < minY) minY = ys[index];
        if (ys[index] > maxY) maxY = ys[index];
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
        return { scale: 1, dx: width / 2, dy: height / 2 };
      }
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const usableW = Math.max(40, width - padding * 2);
      const usableH = Math.max(40, height - padding * 2);
      // 1.4 is a ceiling: a two-node graph must not be blown up to fill a 900 px
      // canvas, because node radius is in graph units and would scale with it.
      const scale = Math.min(usableW / spanX, usableH / spanY, 1.4);
      const dx = (width - spanX * scale) / 2 - minX * scale;
      const dy = (height - spanY * scale) / 2 - minY * scale;
      return { scale, dx, dy };
    }

    /**
     * One force iteration over the whole graph.
     *
     * Repulsion is O(n²) on purpose: a Barnes-Hut tree would change the picture for
     * graphs of the size the Host caps at (600 nodes, `WIRE.md §2`), and the slicing
     * above is what actually buys the frame time back.
     * @param state - the mutable solver state.
     */
    function step(state) {
      const {
        count, xs, ys, vx, vy, pairs, ideal, cooling,
      } = state;

      for (let i = 0; i < count; i += 1) {
        const xi = xs[i];
        const yi = ys[i];
        let fx = 0;
        let fy = 0;
        for (let j = i + 1; j < count; j += 1) {
          let dx = xs[j] - xi;
          let dy = ys[j] - yi;
          let dist2 = dx * dx + dy * dy;
          if (dist2 < 0.01) {
            // Two nodes on top of each other: repel along a deterministic axis
            // instead of dividing by a near-zero distance (which produces NaN and
            // silently poisons every later coordinate).
            dx = ((i % 7) - 3) || 0.5;
            dy = ((j % 5) - 2) || 0.5;
            dist2 = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(dist2);
          // `avoidOverlap` widens the near field only, so the long-range shape is
          // untouched but dense clusters stop collapsing into one dot.
          const overlap = dist < ideal ? AVOID_OVERLAP * (1 - dist / ideal) : 0;
          const force = ((GRAVITATIONAL * (1 + overlap)) * cooling) / dist2;
          const ux = (dx / dist) * force;
          const uy = (dy / dist) * force;
          fx += ux;
          fy += uy;
          vx[j] -= ux;
          vy[j] -= uy;
        }
        vx[i] += fx;
        vy[i] += fy;
      }

      for (let k = 0; k < pairs.length; k += 2) {
        const a = pairs[k];
        const b = pairs[k + 1];
        const dx = xs[b] - xs[a];
        const dy = ys[b] - ys[a];
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // A spring pulls only when stretched: compressing a short edge would fight
        // the repulsion that just placed the two nodes apart.
        const strain = dist - SPRING_LENGTH;
        if (strain <= 0) continue;
        const force = strain * SPRING_CONSTANT * cooling;
        const ux = (dx / dist) * force;
        const uy = (dy / dist) * force;
        vx[a] += ux;
        vy[a] += uy;
        vx[b] -= ux;
        vy[b] -= uy;
      }

      for (let i = 0; i < count; i += 1) {
        vx[i] = (vx[i] + (0 - xs[i]) * CENTRAL_GRAVITY) * (1 - DAMPING * 0.6);
        vy[i] = (vy[i] + (0 - ys[i]) * CENTRAL_GRAVITY) * (1 - DAMPING * 0.6);
        xs[i] += vx[i];
        ys[i] += vy[i];
      }
    }

    /**
     * Run a layout, frame by frame, and report when it settles.
     *
     * The returned handle's `stop()` must be called on unmount or when the tab is
     * parked; a stopped run leaves the last coordinates readable through
     * `onFrame`, so parking mid-settle does not empty the canvas.
     *
     * @param options - `{nodes, links, width, height, onFrame, onDone}`.
     *   `nodes` is `{id, degree?, weight?}[]`; `links` is `{source, target}[]`.
     *   `onFrame(positions)` receives `Map<id, {x, y}>` immediately and after each
     *   slice; `onDone(positions)` fires once when the final fit has been applied.
     * @returns `{stop(): void, done: Promise<void>}`.
     */
    function runLayout(options) {
      const {
        nodes, links, width, height, onFrame, onDone,
      } = options;
      const count = nodes.length;
      const indexOf = new Map();
      nodes.forEach((node, index) => indexOf.set(node.id, index));

      let stopped = false;
      let frameHandle;
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });

      /** Emit the current map, fitted to the canvas. */
      const emit = (xs, ys) => {
        const { scale, dx, dy } = fitTransform(xs, ys, Math.max(120, width), Math.max(90, height), 24);
        const positions = new Map();
        for (let index = 0; index < count; index += 1) {
          positions.set(nodes[index].id, {
            x: xs[index] * scale + dx,
            y: ys[index] * scale + dy,
          });
        }
        if (typeof onFrame === 'function') onFrame(positions);
        return positions;
      };

      if (count === 0) {
        const positions = new Map();
        if (typeof onDone === 'function') onDone(positions);
        resolveDone();
        return { stop() {}, done };
      }

      if (count === 1) {
        // A single node still has to be centred: the fit transform over a
        // zero-span box divides by the 1-unit floor and lands off-canvas.
        const positions = new Map([[nodes[0].id, { x: width / 2, y: height / 2 }]]);
        if (typeof onFrame === 'function') onFrame(positions);
        if (typeof onDone === 'function') onDone(positions);
        resolveDone();
        return { stop() {}, done };
      }

      const radius = Math.min(Math.max(160, width), Math.max(160, height)) * 0.42;
      const { xs: px, ys: py } = seed(count, radius);
      const vx = new Float64Array(count);
      const vy = new Float64Array(count);

      const pairs = [];
      for (const link of links) {
        const a = indexOf.get(link.source);
        const b = indexOf.get(link.target);
        if (a === undefined || b === undefined || a === b) continue;
        pairs.push(a, b);
      }

      const iterations = count > LARGE_GRAPH ? ITERATIONS_LARGE : ITERATIONS_SMALL;
      const ideal = SPRING_LENGTH;
      const state = {
        count, xs: px, ys: py, vx, vy, pairs, ideal, cooling: 1,
      };

      // Paint the seed before any physics: the panel is supposed to show structure
      // the moment the payload lands, not after the settle.
      emit(px, py);

      let iteration = 0;
      const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(() => callback(Date.now()), 16);

      const tick = () => {
        if (stopped) return;
        const start = Date.now();
        while (iteration < iterations) {
          state.cooling = 1 - iteration / iterations;
          step(state);
          iteration += 1;
          // The budget is checked after at least one slice, so a slow machine still
          // makes progress instead of thrashing on the clock.
          if (Date.now() - start >= FRAME_BUDGET_MS) break;
        }
        if (iteration >= iterations) {
          const positions = emit(px, py);
          if (!stopped && typeof onDone === 'function') onDone(positions);
          resolveDone();
          return;
        }
        emit(px, py);
        frameHandle = raf(tick);
      };

      frameHandle = raf(tick);

      return {
        stop() {
          stopped = true;
          if (frameHandle !== undefined && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(frameHandle);
          }
          resolveDone();
        },
        done,
      };
    }

    /**
     * Trim a graph to `cap` nodes **without breaking it apart**.
     *
     * Slicing a ranked list is the obvious move and the wrong one: the top rows by
     * degree are usually leaves of different clusters, so a truncated slice renders
     * as isolated dots with no edges — a ranked cut is not a picture. Growing
     * outward from the heaviest node keeps the result one connected thing, which is
     * the only reason to draw it at all.
     *
     * A node with no edges anywhere is dropped deliberately: a lone dot on a graph
     * of relations says nothing, and keeping it would spend a slot that could hold a
     * neighbour.
     *
     * @param nodes - candidate nodes; each needs `id` and preferably `weight`.
     * @param links - the full link set; endpoints outside `nodes` are ignored.
     * @param cap - maximum nodes to keep.
     * @returns the kept nodes, in their original order.
     */
    function connectedSlice(nodes, links, cap) {
      const limit = Math.max(0, Math.trunc(Number(cap) || 0));
      if (limit === 0) return [];
      if (nodes.length <= limit) return nodes;

      const known = new Set(nodes.map((node) => node.id));
      const neighbours = new Map();
      for (const link of links) {
        if (!known.has(link.source) || !known.has(link.target)) continue;
        if (link.source === link.target) continue;
        const from = neighbours.get(link.source);
        if (from === undefined) neighbours.set(link.source, [link.target]);
        else from.push(link.target);
        const to = neighbours.get(link.target);
        if (to === undefined) neighbours.set(link.target, [link.source]);
        else to.push(link.source);
      }

      // Weight first (the Host's `weight` is the ranked importance), then degree,
      // then id so two equal-weight seeds still produce a deterministic slice.
      const order = [...nodes].sort((a, b) => (
        (b.weight ?? 0) - (a.weight ?? 0)
        || (b.degree ?? 0) - (a.degree ?? 0)
        || String(a.id).localeCompare(String(b.id))
      ));

      const kept = new Set();
      for (const seedNode of order) {
        if (kept.size >= limit) break;
        if (kept.has(seedNode.id)) continue;
        const queue = [seedNode.id];
        let head = 0;
        while (head < queue.length && kept.size < limit) {
          const id = queue[head];
          head += 1;
          if (kept.has(id)) continue;
          kept.add(id);
          for (const next of neighbours.get(id) ?? []) {
            if (!kept.has(next)) queue.push(next);
          }
        }
      }

      return nodes.filter((node) => kept.has(node.id));
    }

    /* ================================================================ *
     * graph-search.js
     * ================================================================ */




    /**
     * In-graph search.
     *
     * The reference app's version is a plain substring filter with no keyboard
     * navigation at all (`GraphView.tsx:373-390`, `spec §4.2`): no arrows, no Enter,
     * rows are buttons and the query is cleared by clicking one. That is the one
     * place where "the rail search box replaces the rail body" cost the reader the
     * ability to walk a list — you have to move the mouse between the box and the
     * thirty rows it just produced.
     *
     * This module keeps the *matching* rules verbatim and adds the key map:
     *
     *   - match on `label + path + communityLabel`, lowercased, `.includes()`;
     *   - cap **30** results, in payload order, no ranking (a ranking would make the
     *     list jump between keystrokes);
     *   - ↑/↓ wrap around, Enter selects-and-centres, Esc clears.
     *
     * Enter *centres* (the camera moves) while a plain click does not — the same
     * split the reference uses for its result rows (`choose(id, true)`).
     */

    /** Result cap, verbatim `GraphView.tsx:203-207`. */
    const SEARCH_CAP = 30;

    /**
     * Filter the slice's nodes.
     *
     * Exported so the panel can reuse the exact predicate for its own purposes
     * (e.g. deciding whether a scope switch has a target) without duplicating it.
     * @param nodes - the slice's nodes.
     * @param query - the raw input; trimmed and lowercased here.
     * @returns the matching nodes, capped, in payload order.
     */
    function filterNodes(nodes, query) {
      const needle = String(query ?? '').trim().toLowerCase();
      if (needle === '') return [];
      const out = [];
      for (const node of nodes) {
        const haystack = `${node.label ?? ''} ${node.path ?? ''} ${node.communityLabel ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
        out.push(node);
        if (out.length >= SEARCH_CAP) break;
      }
      return out;
    }

    /**
     * The search box and its results list.
     *
     * @param props - `{nodes, query, onQuery, onPick, onClear, selectedId, t, locale, inputRef}`:
     *   `nodes` is the current slice; `query`/`onQuery` is lifted state so the panel
     *   can decide which rail mode to show (search results outrank the inspector);
     *   `onPick(node)` selects **and** centres; `onClear()` empties the query;
     *   `inputRef` lets the panel's `/` shortcut focus the box.
     * @returns the box and the result rows.
     */
    function GraphSearch(props) {
      const {
        nodes, query, onQuery, onPick, onClear, selectedId, t, locale, inputRef,
      } = props;
      const [cursor, setCursor] = useState(0);

      const results = useMemo(() => filterNodes(nodes, query), [nodes, query]);
      const active = results.length === 0 ? -1 : Math.min(cursor, results.length - 1);

      /** Move the cursor with wraparound, per the nav-picker key map (§4.4). */
      const move = useCallback((delta, total) => {
        if (total === 0) return 0;
        return (delta + total) % total;
      }, []);

      const onKeyDown = useCallback((event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCursor((current) => move(current + 1, results.length));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCursor((current) => move(current - 1, results.length));
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          const node = results[active];
          if (node !== undefined) onPick?.(node);
          return;
        }
        if (event.key === 'Escape') {
          // Esc clears the text *and* the cursor. It deliberately does not bubble:
          // the panel also listens for Esc to clear the selection, and one keypress
          // should do one thing.
          event.preventDefault();
          event.stopPropagation();
          setCursor(0);
          onClear?.();
        }
      }, [results, active, onPick, onClear, move]);

      const typing = String(query ?? '').trim() !== '';

      return h('div', { className: 'cs-col' },
        h('div', { className: 'cs-bar cs-sub' },
          h('div', { className: 'cs-search' },
            h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
            h('input', {
              ref: inputRef,
              className: 'cs-input',
              type: 'search',
              value: query,
              placeholder: t('graph.search.placeholder'),
              'aria-label': t('graph.search.placeholder'),
              onChange: (event) => {
                setCursor(0);
                onQuery?.(event.target.value);
              },
              onKeyDown,
            }),
            typing ? h('button', {
              type: 'button',
              className: 'cs-search-clear',
              title: t('graph.search.clear'),
              'aria-label': t('graph.search.clear'),
              onClick: () => {
                setCursor(0);
                onClear?.();
              },
            }, Glyph.close(12)) : null)),

        typing
          ? h('div', { className: 'cs-rail-scroll' },
            results.length === 0
              ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '14px 10px' } }, t('graph.search.empty'))
              : results.map((node, index) => h('button', {
                key: node.id,
                type: 'button',
                className: `cs-item${node.id === selectedId ? ' cs-active' : ''}`,
                'aria-pressed': node.id === selectedId ? 'true' : 'false',
                title: node.path === undefined || node.path === '' ? node.label : node.path,
                onMouseEnter: () => setCursor(index),
                onClick: () => onPick?.(node),
              },
              h('span', {
                className: 'cs-dot',
                style: { background: communityColor(node.community ?? 0), alignSelf: 'center' },
              }),
              h('span', { className: 'cs-name cs-ellipsis' }, node.label),
              h('span', { className: 'cs-meta' }, kindLabel(node.kind, locale)))))
          : h('div', { className: 'cs-rail-foot' }, t('graph.search.hint')));
    }

    /* ================================================================ *
     * graph-panel.js
     * ================================================================ */













    /**
     * The `codeslice:graph` tab.
     *
     * Structure, and why each part is where it is:
     *
     *   toolbar   scope switch (workspace / file / focus), refresh, rebuild, and the
     *             status line. Scope is *state*, not three buttons that each fetch:
     *             switching to `file` with nothing selected has to be visibly
     *             disabled, which is what the reference gets wrong by hiding the
     *             chips for the notes scope only (`spec §6.6`).
     *   canvas    pan/zoom/select/double-click, family legend, truncation notice.
     *   rail      one mode at a time, in the reference's priority order (§5.1):
     *             search results → node inspector → community list.
     *
     * Fetch discipline: mount, explicit refresh, rebuild, scope change, and
     * `visible` turning true. No interval, no polling, no re-fetch on hover.
     *
     * Narrow/wide is measured from **this component's own box**, not the viewport
     * (`spec §1.4`): a 900 px window can hold a 320 px sidebar, and the panel has to
     * decide from what it was actually given.
     */

    /** Rail width below which the rail moves under the canvas, in px. */
    const NARROW_RAIL_WIDTH = 520;

    /** Node cap requested from the Host. Above this the Host returns one node per
     * community (graphify's aggregated view), so this is a rendering budget rather
     * than a truncation point. */
    const GRAPH_LIMIT = 5000;

    /**
     * @param props - `{ctx, store, scope, tab, visible, onOpenFile, onAsk, t, locale}`.
     *   `ctx` is the client context; `scope.cwd` is the workspace; `visible === false`
     *   means parked-but-mounted, so every heavy effect must stand down; `t` is the
     *   translator; `onOpenFile(path)` is the host's own fallback opener;
     *   `onAsk(node)` hands a node to the shared conversation (absent in the
     *   standalone graph tab, which has no conversation beside it).
     * @returns the panel.
     */
    function GraphPanel(props) {
      const {
        ctx, scope, visible, onOpenFile, onAsk, focusRequest, t, locale,
      } = props;
      const parked = visible === false;

      const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const [status, setStatus] = useState(undefined);
      const [graph, setGraph] = useState(undefined);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(undefined);
      const [busy, setBusy] = useState(false);
      const [scopeMode, setScopeMode] = useState('workspace');
      const [query, setQuery] = useState('');
      const [selectedId, setSelectedId] = useState(undefined);
      const [detail, setDetail] = useState(undefined);
      const [detailError, setDetailError] = useState(undefined);
      const [families, setFamilies] = useState(() => new Set(DEFAULT_FAMILIES));
      const [hiddenCommunities, setHiddenCommunities] = useState(() => new Set());
      const [narrow, setNarrow] = useState(false);
      const [revision, setRevision] = useState(0);

      const requests = useRef(undefined);
      const searchInput = useRef(null);
      const canvasController = useRef(undefined);
      const alive = useRef(true);
      const hostRef = useRef(null);

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      // A jump from the code pane ("show this file in the graph") arrives as a
      // one-shot query. It seeds the rail's search rather than a separate filter, so
      // the reader can refine it with the same controls they already know.
      const focusNonce = focusRequest !== null && focusRequest !== undefined ? focusRequest.nonce : undefined;
      useEffect(() => {
        if (focusNonce === undefined) return;
        if (typeof focusRequest?.text === 'string' && focusRequest.text !== '') {
          setQuery(focusRequest.text);
        }
      }, [focusNonce, focusRequest]);

      // One request scope for the whole tab. Disposing on unmount (and on every
      // `visible: false`) is what makes a parked tab stop costing network.
      useEffect(() => {
        const scopeHandle = makeRequestScope();
        requests.current = scopeHandle;
        return () => {
          scopeHandle.dispose();
          requests.current = undefined;
        };
      }, []);

      /* ---- measure this panel's own box ------------------------------ */

      useEffect(() => {
        const element = hostRef.current;
        if (element === null || element === undefined) return undefined;
        if (parked) return undefined;
        const read = () => {
          const rect = element.getBoundingClientRect();
          setNarrow(rect.width < NARROW_RAIL_WIDTH);
        };
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(read);
        observer.observe(element);
        return () => observer.disconnect();
      }, [parked, graph]);

      /* ---- fetch ----------------------------------------------------- */

      // `selectedId` is read through a ref rather than a dependency: it is only needed
      // when the scope is `focus`, and listing it made `load` change identity on
      // every selection, which re-ran the boot effect — so each node click refetched
      // status + graph, turning a one-request selection into three.
      const selectedIdRef = useRef(selectedId);
      selectedIdRef.current = selectedId;

      // The family filter is *state*: the legend can turn a relation family on that
      // the default set omits (`meaning` has no default), and the Host filters links
      // before sending, so a legend toggle the server never hears about is a no-op.
      const familiesRef = useRef(families);
      familiesRef.current = families;

      const load = useCallback(async (mode, options = {}) => {
        const requestScope = requests.current;
        if (requestScope === undefined) return;
        const focusId = options.focus ?? (mode === 'focus' ? selectedIdRef.current : undefined);
        if (mode === 'file' && (options.path === undefined || options.path === '')) return;
        if (mode === 'focus' && (focusId === undefined || focusId === null)) return;

        if (options.quiet !== true) setLoading(true);
        setError(undefined);
        try {
          const value = await requestScope.run((signal) => call('graph', {
            scope: mode,
            path: options.path,
            focus: focusId === undefined ? undefined : String(focusId),
            depth: options.depth ?? 1,
            limit: GRAPH_LIMIT,
            families: [...familiesRef.current],
          }, signal));
          if (value === undefined || !alive.current) return;
          setGraph(value);
          // Selection survives a refresh only when the node is still in the slice:
          // a stale inspector on a node the Host no longer returns would let the
          // reader open code that the graph says nothing about.
          setSelectedId((current) => {
            if (current === undefined || current === null) return current;
            return value.nodes.some((node) => node.id === current) ? current : undefined;
          });
        } catch (caught) {
          if (alive.current) setError({ message: caught && caught.message ? caught.message : String(caught) });
        } finally {
          if (alive.current && options.quiet !== true) setLoading(false);
        }
      }, [call, selectedId]);

      const loadStatus = useCallback(async (refresh) => {
        const requestScope = requests.current;
        if (requestScope === undefined) return;
        try {
          const value = await requestScope.run((signal) => call('status', refresh === true ? { refresh: true } : {}, signal));
          if (value !== undefined && alive.current) setStatus(value);
        } catch {
          // Status is cosmetic: a failure must not stop the graph from drawing.
        }
      }, [call]);

      /* ---- first paint, and every visible→true ----------------------- */

      const painted = useRef(false);
      const wasParked = useRef(parked);
      useEffect(() => {
        const resumed = wasParked.current && !parked;
        wasParked.current = parked;
        if (parked) return;

        // Fetch on mount, on an explicit revision bump, and on the parked → visible
        // edge. That last one is why `resumed` exists: without it a tab that was
        // hidden before its first paint would come back to an empty canvas, and a
        // tab that finished painting would never refresh what changed meanwhile.
        const firstPaint = !painted.current;
        if (!firstPaint && revision === 0 && !resumed) return;

        painted.current = true;
        void loadStatus(false);
        void load('workspace');
      }, [parked, loadStatus, load, revision]);

      // Parking must cancel in-flight work: an answer that lands while the tab is
      // hidden would paint a graph nobody is looking at and, worse, keep the
      // selected node's inspector fetch alive. `abort()` rather than `dispose()` —
      // the scope has to survive until the tab comes back.
      useEffect(() => {
        if (!parked) return;
        requests.current?.abort();
      }, [parked]);

      /* ---- the node inspector ---------------------------------------- */

      const nodeRequest = useRef(undefined);
      useEffect(() => {
        if (parked || selectedId === undefined || selectedId === null) {
          setDetail(undefined);
          setDetailError(undefined);
          return undefined;
        }
        if (nodeRequest.current !== undefined) nodeRequest.current.abort();
        const controller = new AbortController();
        nodeRequest.current = controller;
        let cancelled = false;
        (async () => {
          try {
            const value = await call('node', { id: selectedId }, controller.signal);
            if (!cancelled && alive.current) {
              setDetail(value);
              setDetailError(undefined);
            }
          } catch (caught) {
            if (cancelled || !alive.current) return;
            if (caught && caught.name === 'AbortError') return;
            setDetail(undefined);
            setDetailError(caught && caught.message ? caught.message : String(caught));
          }
        })();
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [selectedId, call, parked]);

      /* ---- actions --------------------------------------------------- */

      const rebuild = useCallback(async () => {
        setBusy(true);
        setError(undefined);
        try {
          const next = await call('rebuild', {});
          if (alive.current) setStatus(next);
          setSelectedId(undefined);
          setQuery('');
          painted.current = false;
          setRevision((current) => current + 1);
        } catch (caught) {
          if (alive.current) setError({ message: caught && caught.message ? caught.message : String(caught) });
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call]);

      const refresh = useCallback(async () => {
        setBusy(true);
        await Promise.all([loadStatus(false), load(scopeMode, { quiet: true, focus: scopeMode === 'focus' ? selectedId : undefined })]);
        if (alive.current) setBusy(false);
      }, [loadStatus, load, scopeMode, selectedId]);

      const choose = useCallback((id, centre) => {
        if (id === undefined || id === null) {
          setSelectedId(undefined);
          return;
        }
        const node = graph?.nodes.find((row) => row.id === id);
        // Selecting a node force-enables its family and community (§12 inv. 8):
        // otherwise a search hit inside a hidden community selects an invisible node
        // and the inspector describes something the canvas does not show.
        if (node !== undefined) {
          const wanted = node.kind === 'rationale' ? 'meaning'
            : node.kind === 'external' ? 'dependency'
              : undefined;
          if (wanted !== undefined) {
            setFamilies((current) => {
              if (current.has(wanted)) return current;
              const next = new Set(current);
              next.add(wanted);
              return next;
            });
          }
          const community = Number(node.community ?? 0);
          setHiddenCommunities((current) => {
            if (!current.has(community)) return current;
            const next = new Set(current);
            next.delete(community);
            return next;
          });
        }
        setSelectedId(id);
        // A canvas click means "show me this node", so the rail's search box must
        // clear: leaving a query typed keeps the rail in results mode and the
        // inspector never appears, which reads as the click having done nothing.
        setQuery('');
        if (centre === true) canvasController.current?.centre(id);
      }, [graph]);

      /**
       * Open a node's code through the vendored sidebar.
       *
       * `openFile` takes a session id and a path; `path#L<n>` is not a path and the
       * scope object is not a session id. The shared reveal helper resolves both and
       * keeps graph and note citations on the same line.
       */
      const openNode = useCallback((node) => {
        if (node === undefined || node === null) return;
        const path = typeof node.path === 'string' ? node.path : '';
        if (path === '') return;
        const start = Math.max(1, Math.trunc(Number(node.line) || 1));
        const end = Math.max(start, Math.trunc(Number(node.endLine) || start));
        const sessionId = typeof scope === 'string'
          ? scope
          : (typeof scope?.sessionId === 'string' ? scope.sessionId : '');
        if (revealCodeRange(ctx, { path, startLine: start, endLine: end }, cwd, sessionId)) return;
        if (typeof onOpenFile === 'function') onOpenFile(path);
      }, [ctx, cwd, scope, onOpenFile]);

      /**
       * Toggle one relation family.
       *
       * Refetches rather than only filtering locally: the Host prunes links by family
       * before sending (so a 600-node slice stays small), which means turning a family
       * *on* can reveal links the current payload never contained. Local filtering
       * alone would make the `meaning` chip a no-op forever. The refetch is quiet —
       * the canvas keeps its current picture until the new slice arrives.
       */
      const toggleFamily = useCallback((family) => {
        // Compute the next set *outside* the updater. The updater runs during render,
        // so writing `familiesRef` from inside it either happens too late for the
        // refetch below or twice under StrictMode's double-invoke.
        const next = new Set(familiesRef.current);
        if (next.has(family)) next.delete(family);
        else next.add(family);
        familiesRef.current = next;
        setFamilies(next);
        void load('workspace', { quiet: true });
      }, [load]);

      const toggleCommunity = useCallback((community) => {
        setHiddenCommunities((current) => {
          const next = new Set(current);
          if (next.has(community)) next.delete(community);
          else next.add(community);
          return next;
        });
        // Hiding the community of the selected node clears the selection, exactly as
        // the reference does (`GraphView.tsx:225-228`): an inspector on a node that
        // is no longer drawn is a lie about the current view.
        setSelectedId((current) => {
          if (current === undefined || current === null) return current;
          const node = graph?.nodes.find((row) => row.id === current);
          return node !== undefined && Number(node.community ?? 0) === community && !hiddenCommunities.has(community)
            ? undefined
            : current;
        });
      }, [graph, hiddenCommunities]);

      const allCommunities = useCallback((hide) => {
        const ids = [...new Set((graph?.nodes ?? []).map((node) => Number(node.community ?? 0)))];
        setHiddenCommunities(hide ? new Set(ids) : new Set());
        if (hide) setSelectedId(undefined);
      }, [graph]);

      /* ---- keyboard -------------------------------------------------- */

      /**
       * The panel's key map: `/` focuses the search, `Esc` clears, `f` fits,
       * `+`/`-` zoom.
       *
       * Two disciplines: never capture while a text field or a button has focus
       * (typing "f" in the search box must type, not zoom), and never capture a bare
       * key with modifiers. `Esc` is the exception — it is checked even inside the
       * box, because a search you cannot dismiss without the mouse is a trap.
       */
      useEffect(() => {
        if (parked) return undefined;
        const onKeyDown = (event) => {
          if (event.defaultPrevented) return;
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const target = event.target;
          const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
          const editable = tag === 'input' || tag === 'textarea' || tag === 'select'
            || target?.isContentEditable === true;
          if (event.key === 'Escape') {
            if (editable && target !== searchInput.current) return;
            setQuery('');
            setSelectedId(undefined);
            searchInput.current?.blur();
            return;
          }
          if (editable) return;
          if (event.key === '/') {
            event.preventDefault();
            searchInput.current?.focus();
            return;
          }
          if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            canvasController.current?.fit();
            return;
          }
          if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            canvasController.current?.zoomBy(1.1);
            return;
          }
          if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            canvasController.current?.zoomBy(1 / 1.1);
          }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [parked]);

      /* ---- derived --------------------------------------------------- */

      const rawNodes = graph?.nodes ?? [];
      const rawLinks = graph?.links ?? [];

      /**
       * The canvas keeps a *cap* of the slice, grown for connectivity.
       *
       * The Host already trims to `limit`, but its cap and the canvas's budget are
       * different questions (the Host answers "what is the graph", the canvas "what
       * can be drawn at 60 fps"), so the slice is applied again here. It is applied
       * to the *raw* payload so filtering by family cannot change which nodes exist.
       */
      const capped = useMemo(() => {
        if (rawNodes.length <= GRAPH_LIMIT) return rawNodes;
        return connectedSlice(rawNodes, rawLinks, GRAPH_LIMIT);
      }, [rawNodes, rawLinks]);

      const kept = useMemo(() => new Set(capped.map((node) => node.id)), [capped]);
      const links = useMemo(() => rawLinks.filter((link) => kept.has(link.source) && kept.has(link.target)), [rawLinks, kept]);

      const communities = useMemo(() => {
        const byId = new Map();
        for (const node of capped) {
          const id = Number(node.community ?? 0);
          const size = Number(node.memberCount ?? 1) || 1;
          const entry = byId.get(id);
          if (entry === undefined) {
            byId.set(id, {
              id,
              label: node.communityLabel ?? t('graph.communities.unnamed', { id }),
              size,
            });
          } else {
            entry.size += size;
          }
        }
        return [...byId.values()].sort((a, b) => b.size - a.size || a.id - b.id);
      }, [capped, t]);

      const selectedNode = selectedId === undefined ? undefined : capped.find((node) => node.id === selectedId);
      const searching = query.trim() !== '';

      const onSearchPick = useCallback((node) => {
        choose(node.id, true);
        setQuery('');
      }, [choose]);

      const scopeDisabled = (mode) => {
        if (mode === 'file') return selectedNode === undefined || selectedNode.path === undefined || selectedNode.path === '';
        if (mode === 'focus') return selectedId === undefined || selectedId === null;
        return false;
      };

      const changeScope = useCallback((mode) => {
        if (scopeDisabled(mode)) return;
        setScopeMode(mode);
        setQuery('');
        if (mode === 'file') {
          void load('file', { path: selectedNode.path });
          return;
        }
        if (mode === 'focus') {
          void load('focus', { focus: selectedId, depth: 1 });
          return;
        }
        void load('workspace');
      }, [load, selectedId, selectedNode, scopeDisabled]);

      /* ---- render ---------------------------------------------------- */

      if (error !== undefined && graph === undefined) {
        return h('div', { className: 'cs-root' },
          h('div', { className: 'cs-empty' },
            h(Glyph.alert, { size: 22 }),
            h('b', null, t('graph.error.title')),
            h('p', null, error.message),
            h('button', {
              type: 'button', className: 'cs-btn cs-primary', onClick: () => { void loadStatus(false); void load('workspace'); },
            }, t('common.retry'))));
      }

      return h('div', { className: 'cs-root', ref: hostRef },
        /* ---- toolbar ---- */
        h('div', { className: 'cs-bar cs-wrap' },
          h('div', { className: 'cs-seg', role: 'group', 'aria-label': t('graph.legend.title') },
            ['workspace', 'file', 'focus'].map((mode) => h('button', {
              key: mode,
              type: 'button',
              className: scopeMode === mode ? 'cs-on' : undefined,
              disabled: scopeDisabled(mode),
              title: scopeDisabled(mode)
                ? t(mode === 'file' ? 'graph.scope.hint.file' : 'graph.scope.hint.focus')
                : undefined,
              'aria-pressed': scopeMode === mode ? 'true' : 'false',
              onClick: () => changeScope(mode),
            }, t(`graph.scope.${mode}`)))),
          h('div', { className: 'cs-grow' }),
          busy || (loading && graph !== undefined)
            ? h('span', { className: 'cs-row cs-muted', style: { fontSize: '10px' } },
              h('span', { className: 'cs-spin' }, Glyph.spinner(11)))
            : null,
          h('button', {
            type: 'button',
            className: 'cs-iconbtn',
            title: t('graph.action.refresh'),
            'aria-label': t('graph.action.refresh'),
            disabled: busy,
            onClick: () => { void refresh(); },
          }, Glyph.refresh(14)),
          h('button', {
            type: 'button',
            className: 'cs-iconbtn',
            title: t('graph.action.rebuild.hint'),
            'aria-label': t('graph.action.rebuild'),
            disabled: busy,
            onClick: () => { void rebuild(); },
          }, Glyph.rebuild(14))),

        status !== undefined
          ? h('div', { className: 'cs-bar cs-sub cs-mono', style: { fontSize: '10.5px' } },
            h('span', { className: 'cs-ellipsis cs-grow' },
              t('graph.status.summary', {
                nodes: formatInt(status.nodes, locale),
                edges: formatInt(status.edges, locale),
                communities: formatInt(status.communities, locale),
              })),
            h('span', { className: 'cs-muted cs-noshrink' },
              t('graph.status.built', {
                files: formatInt(status.files, locale),
                lines: formatInt(status.lines, locale),
                buildMs: formatInt(status.buildMs, locale),
              })))
          : null,

        error !== undefined && graph !== undefined
          ? h('div', { className: 'cs-banner cs-warn' },
            h(Glyph.alert, { size: 13 }),
            h('span', { className: 'cs-grow' }, error.message),
            h('button', {
              type: 'button', className: 'cs-btn cs-small', onClick: () => { void load(scopeMode, { focus: selectedId }); },
            }, t('common.retry')))
          : null,

        /* ---- body: canvas + rail ---- */
        h('div', { className: `cs-graph-body${narrow ? ' cs-narrow' : ''}` },
          h(GraphCanvas, {
            ctx,
            nodes: capped,
            links,
            selectedId,
            onSelect: (id) => choose(id, false),
            onOpen: openNode,
            families,
            onToggleFamily: toggleFamily,
            hiddenCommunities,
            aggregated: graph?.aggregated === true,
            truncation: graph === undefined
              ? undefined
              : {
                shown: capped.length,
                total: Math.max(capped.length, Number(graph.total?.nodes ?? rawNodes.length)),
              },
            loading: loading && graph === undefined,
            error: graph === undefined ? error : undefined,
            onRetry: () => { void load('workspace'); },
            visible,
            t,
            locale,
            controller: canvasController,
          }),

          h('div', { className: 'cs-rail' },
            h(GraphSearch, {
              nodes: capped,
              query,
              onQuery: setQuery,
              onPick: onSearchPick,
              onClear: () => setQuery(''),
              selectedId,
              t,
              locale,
              inputRef: searchInput,
            }),

            // Rail modes, in the reference's priority order (§5.1): search results
            // outrank the inspector, the inspector outranks the community list.
            searching ? null : selectedNode !== undefined
              ? h(NodeInspector, {
                node: selectedNode,
                detail,
                detailError,
                onBack: () => setSelectedId(undefined),
                onOpen: openNode,
                onPick: (id) => choose(id, false),
                onAsk: typeof onAsk === 'function' ? onAsk : undefined,
                t,
                locale,
              })
              : h(CommunityList, {
                communities,
                hiddenCommunities,
                onToggle: toggleCommunity,
                onAll: allCommunities,
                t,
                locale,
              })),

            !searching && selectedNode === undefined
              ? h('div', { className: 'cs-rail-foot' }, t('graph.inspector.idle'))
              : null));
    }

    /**
     * The rail's node inspector.
     *
     * Order and content follow `spec §5.3-5.4`: back button, kind pill + community,
     * label, `path:line · N neighbours`, actions, rationale, then the relation
     * groups as `<details>` with the call groups expanded. `MAX_ROWS` is 60 and the
     * truncation note is a real string, not a silent cut.
     *
     * @param props - `{node, detail, detailError, onBack, onOpen, onPick, onAsk, t, locale}`:
     *   `node` is the slice row (available before `detail` lands, so the header
     *   renders instantly); `detail` is the `node` method's answer; `onPick(id)`
     *   selects a neighbour without moving the camera.
     * @returns the inspector.
     */
    function NodeInspector(props) {
      const {
        node, detail, detailError, onBack, onOpen, onPick, onAsk, t, locale,
      } = props;

      const groups = detail?.groups ?? [];
      const rationale = detail?.rationale ?? [];
      const siblings = detail?.siblings ?? [];
      const neighbours = detail?.node?.neighbourCount ?? node.degree ?? 0;
      const location = node.path === undefined || node.path === '' ? '' : `${node.path}:${node.line ?? 1}`;

      /** `callers`/`calls` open by default; otherwise the first group (spec §5.4). */
      const hasCalls = groups.some((group) => group.key === 'callers' || group.key === 'calls');

      return h('div', { className: 'cs-detail' },
        renderBackBar(onBack, t),
        renderHead(node, neighbours, location, onOpen, onAsk, t, locale),
        renderAlert(detailError),
        renderRationale(rationale),
        renderGroups(groups, hasCalls, { onPick, onOpen, t, locale }),
        renderSiblings(siblings, { onPick, onOpen, t, locale }),
      );
    }

    /** The inspector's back row. */
    function renderBackBar(onBack, t) {
      return h('div', { className: 'cs-bar cs-sub' },
        h('button', {
          type: 'button', className: 'cs-btn cs-ghost cs-small', onClick: () => onBack?.(),
        }, Glyph.back(12), t('graph.inspector.back')));
    }

    /** Kind pill, community tag, name, and the location/degree line. */
    function renderHead(node, neighbours, location, onOpen, onAsk, t, locale) {
      const hasCommunity = node.communityLabel !== undefined && node.communityLabel !== '';
      const communityTag = hasCommunity
        ? h('span', {
          className: 'cs-tag cs-ellipsis',
          style: { borderColor: communityColor(node.community ?? 0), color: communityColor(node.community ?? 0) },
        }, node.communityLabel)
        : null;

      const openButton = node.path === undefined || node.path === ''
        ? null
        : h('button', {
          type: 'button', className: 'cs-btn cs-small cs-primary', onClick: () => onOpen?.(node),
        }, Glyph.open(12), t('graph.inspector.open'));

      // "Ask about this node" goes into the workbench's shared conversation. The
      // standalone graph tab has no conversation beside it, so the host simply does
      // not pass `onAsk` and the button does not exist — a disabled button would
      // promise a panel that is not there.
      const askButton = typeof onAsk === 'function'
        ? h('button', {
          type: 'button', className: 'cs-btn cs-small cs-ghost', title: t('graph.inspector.askHint'),
          onClick: () => onAsk(node),
        }, Glyph.chat(12), t('graph.inspector.ask'))
        : null;

      return h('div', { className: 'cs-detail-head' },
        h('div', { className: 'cs-detail-title' },
          h('div', { className: 'cs-row' },
            h('span', { className: `cs-kind cs-k-${node.kind ?? 'function'}` }, kindLabel(node.kind, locale)),
            h('span', { className: 'cs-grow' }),
            communityTag),
          h('h2', { title: node.label }, node.label),
          h('div', { className: 'cs-detail-meta cs-mono cs-ellipsis' },
            location === '' ? t('common.none') : location,
            ' · ',
            t('graph.inspector.neighbours', { count: neighbours }))),
        h('div', { className: 'cs-detail-acts' }, askButton, openButton));
    }

    /** The failure banner, when the detail fetch failed. */
    function renderAlert(detailError) {
      if (detailError === undefined || detailError === null) return null;
      return h('div', { className: 'cs-banner cs-warn' },
        h(Glyph.alert, { size: 12 }),
        h('span', { className: 'cs-grow' }, detailError));
    }

    /**
     * The recorded reasons, above the relation groups.
     *
     * "Why does this exist" is the question the graph exists to answer, and burying
     * it under sixty relation rows loses it.
     */
    function renderRationale(rationale) {
      if (rationale.length === 0) return null;
      const rows = rationale.map((row, index) => h('div', {
        key: `r${index}`,
        className: `cs-rationale${row.origin === 'docstring' ? '' : ' cs-quiet'}`,
      }, row.text));
      return h('div', { className: 'cs-col', style: { gap: '4px', paddingBottom: '4px' } }, rows);
    }

    /** One relation row. */
    function renderConnectionRow(item, handlers, locale) {
      const { onPick, onOpen } = handlers;
      const title = [
        item.path,
        relationLabel(item.relation, locale),
        confidenceLabel(item.confidence, locale),
        item.line === undefined ? undefined : `L${item.line}`,
      ].filter((part) => part !== undefined && part !== '').join(' · ');

      const direction = h('span', {
        className: 'cs-dir',
        'data-dir': item.outgoing === true ? 'out' : 'in',
      }, item.outgoing === true ? '→' : '←');

      const location = item.path === undefined || item.path === ''
        ? null
        : h('span', { className: 'cs-loc' }, `${item.path}:${item.line ?? 1}`);

      const open = item.external === true || item.path === undefined
        ? null
        : h('span', { className: 'cs-open' }, Glyph.open(11));

      return h('button', {
        key: `${item.relation}:${item.id}`,
        type: 'button',
        className: 'cs-rel',
        title,
        onClick: () => onPick?.(item.id),
        onDoubleClick: () => onOpen?.(item),
      },
      direction,
      h('span', { className: 'cs-name cs-ellipsis' }, item.label),
      h('span', { className: 'cs-meta' }, kindLabel(item.kind, locale)),
      location,
      h('span', {
        className: 'cs-rel-label',
        style: { color: communityColor(item.community ?? 0) },
      }, relationLabel(item.relation, locale)),
      open);
    }

    /** One collapsible relation group. */
    function renderGroup(group, index, hasCalls, handlers, locale) {
      const { t, onPick, onOpen } = handlers;
      const visible = group.items.slice(0, 60);
      const rows = visible.map((item) => renderConnectionRow(item, { onPick, onOpen }, locale));
      const more = group.items.length > 60
        ? h('div', { className: 'cs-group-more' },
          t('graph.rows.more', { count: formatInt(group.items.length - 60, locale) }))
        : null;

      return h('details', {
        key: group.key,
        className: 'cs-group',
        open: group.key === 'callers' || group.key === 'calls' || (!hasCalls && index === 0),
      },
      h('summary', null,
        h('span', { className: 'cs-twist' }, Glyph.chevronRight(11)),
        h('span', { className: 'cs-grow' }, groupLabel(group.key, locale)),
        h('span', { className: 'cs-count' }, formatInt(group.items.length, locale))),
      h('div', { className: 'cs-group-list' }, rows, more));
    }

    /** The relation groups, or a loading line while they are still arriving. */
    function renderGroups(groups, hasCalls, handlers) {
      if (groups.length === 0) {
        return h('div', { className: 'cs-group-more' }, handlers.t('common.loading'));
      }
      return groups.map((group, index) => renderGroup(group, index, hasCalls, handlers, handlers.locale));
    }

    /** Same-file declarations that are not the selected node. */
    function renderSiblings(siblings, handlers) {
      if (siblings.length === 0) return null;
      const { t, locale, onPick, onOpen } = handlers;
      const rows = siblings.map((row) => h('button', {
        key: row.id,
        type: 'button',
        className: 'cs-rel',
        onClick: () => onPick?.(row.id),
        onDoubleClick: () => onOpen?.(row),
      },
      h('span', { className: 'cs-name cs-ellipsis' }, row.label),
      h('span', { className: 'cs-meta' }, kindLabel(row.kind, locale)),
      h('span', { className: 'cs-loc' }, `:${row.line ?? 1}`)));

      return h('details', { className: 'cs-group' },
        h('summary', null,
          h('span', { className: 'cs-twist' }, Glyph.chevronRight(11)),
          h('span', { className: 'cs-grow' }, t('graph.inspector.siblings')),
          h('span', { className: 'cs-count' }, formatInt(siblings.length, locale))),
        h('div', { className: 'cs-group-list' }, rows));
    }

    /**
     * The rail's community list.
     *
     * One row per community: checkbox, colour dot, label, size. "Hide all" also
     * clears the selection, because after it the canvas has nothing to select.
     * @param props - `{communities, hiddenCommunities, onToggle(id), onAll(hide), t, locale}`.
     * @returns the community section.
     */
    function CommunityList(props) {
      const {
        communities, hiddenCommunities, onToggle, onAll, t, locale,
      } = props;
      const allHidden = communities.length > 0 && communities.every((row) => hiddenCommunities.has(row.id));

      return h('div', { className: 'cs-col', style: { minHeight: 0 } },
        h('div', { className: 'cs-section-head' },
          h('span', { className: 'cs-grow' }, t('graph.communities.title')),
          h('span', { className: 'cs-muted cs-tabular' }, formatInt(communities.length, locale)),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-ghost cs-small',
            onClick: () => onAll?.(!allHidden),
          }, allHidden ? t('graph.communities.showAll') : t('graph.communities.hideAll'))),
        communities.length === 0
          ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '14px 10px' } }, t('graph.communities.none'))
          : h('div', { className: 'cs-rail-scroll' }, communities.map((row) => h('label', {
            key: row.id,
            className: `cs-comm${hiddenCommunities.has(row.id) ? ' cs-off' : ''}`,
          },
          h('input', {
            type: 'checkbox',
            checked: !hiddenCommunities.has(row.id),
            onChange: () => onToggle?.(row.id),
          }),
          h('span', { className: 'cs-swatch', style: { background: communityColor(row.id) } }),
          h('span', { className: 'cs-grow', title: row.label }, row.label),
          h('span', { className: 'cs-count' }, formatInt(row.size, locale))))));
    }

    /* ================================================================ *
     * graph/theme.js
     * ================================================================ */
    /**
     * Canvas vocabulary for the CodeSlice graph view (Agent C, §2.2).
     *
     * Ported verbatim from the desktop reference
     * `D:\CodeSplit\frontend\src\components\graph\graphTheme.ts`:
     * the Tableau-10 classification palette and the per-family edge weight/alpha
     * table. Community identity is a colour identity: the canvas dot, the legend
     * swatch and the inspector tag must read the same fill, so the palette lives
     * here once and every other module reads it back.
     *
     * Data colours (the palette) are the one exception to the host semantic-token
     * rule; everything else in the rail is styled through `var(--dsw-alias-*)`.
     */

    /**
     * Tableau 10, in the reference's order. Hue identity is the community's
     * identity: it must not drift between the canvas, the rail swatches and the
     * neighbour links.
     */
    const GRAPH_PALETTE = [
      '#4E79A7', // blue
      '#F28E2B', // orange
      '#E15759', // red
      '#76B7B2', // teal
      '#59A14F', // green
      '#EDC948', // yellow
      '#B07AA1', // purple
      '#FF9DA7', // pink
      '#9C755F', // brown
      '#BAB0AC', // grey
    ];

    /** Edge weight and alpha for one relation family (desktop `EdgeInk`). */
    const grCALL_EDGE = { width: 1.5, opacity: 0.58 };
    const grDEPENDENCY_EDGE = { width: 0.8, opacity: 0.3 };
    const grHIERARCHY_EDGE = { width: 0.9, opacity: 0.38 };
    const grSTRUCTURE_EDGE = { width: 0.5, opacity: 0.12 };
    const grMEANING_EDGE = { width: 0.5, opacity: 0.12 };
    const grDEFAULT_EDGE = { width: 0.8, opacity: 0.28 };

    /**
     * Weight and alpha for one edge; inferred edges are halved again by the
     * canvas (see `GRAPH_CANVAS_PARAMS.inferredWidthFactor / inferredOpacityFactor`).
     *
     * @param {string} relation - the wire relation kind.
     * @returns {{ width: number, opacity: number }}
     */
    function grEdgeStyle(relation) {
      switch (relation) {
        case 'calls':
        case 'indirect_call':
        case 'references':
          return grCALL_EDGE;
        case 'imports':
        case 'imports_from':
        case 'uses':
          return grDEPENDENCY_EDGE;
        case 'inherits':
        case 'implements':
          return grHIERARCHY_EDGE;
        case 'contains':
        case 'method':
        case 'declares':
          return grSTRUCTURE_EDGE;
        case 'rationale_for':
          return grMEANING_EDGE;
        default:
          return grDEFAULT_EDGE;
      }
    }

    /** Structural scaffolding gets neutral ink so call edges keep their colour signal. */
    function grIsStructuralRelation(relation) {
      return relation === 'contains'
        || relation === 'method'
        || relation === 'declares'
        || relation === 'rationale_for';
    }

    /**
     * Relation family, used to pick an edge colour and the family switch bar.
     * Grouped rather than one colour per relation: five families stay
     * distinguishable where a dozen per-kind palettes do not.
     *
     * @param {string} relation - the wire relation kind.
     * @returns {'structure'|'dependency'|'behaviour'|'hierarchy'|'meaning'|'other'}
     */
    function grRelationFamily(relation) {
      switch (relation) {
        case 'contains':
        case 'method':
        case 'declares':
        case 'mentions':
        case 'co_occurs':
        case 'shares_topic':
        case 'same_folder':
        case 'shared_reference':
          return 'structure';
        case 'imports':
        case 'imports_from':
        case 'uses':
          return 'dependency';
        case 'calls':
        case 'indirect_call':
        case 'references':
          return 'behaviour';
        case 'inherits':
        case 'implements':
          return 'hierarchy';
        case 'rationale_for':
        case 'similar':
          return 'meaning';
        default:
          return 'other';
      }
    }

    /** Fill for one community, tolerant of negative or huge ids. */
    function grCommunityColor(community) {
      const colors = GRAPH_PALETTE;
      const index = (((Number(community) || 0) % colors.length) + colors.length) % colors.length;
      return colors[index];
    }

    /** Relations with no direction; an arrowhead would imply a call that does not exist. */
    const GRAPH_UNDIRECTED = new Set([
      'same_folder', 'same_project', 'shared_reference', 'mentions', 'co_occurs', 'similar',
    ]);

    /** Relations that draw a `to` arrowhead. */
    const GRAPH_ARROWED = new Set([
      'calls', 'indirect_call', 'imports', 'imports_from', 'inherits', 'implements',
    ]);

    /* ================================================================ *
     * graph/relations.js
     * ================================================================ */
    /**
     * Inspector relation grouping (Agent C, §2.2).
     *
     * Ported from the desktop reference `graphRelations.ts`: a selected node's
     * edges are split into the buckets the inspector shows. Calls are split by
     * direction ("who calls this" vs "what this calls"); every other family reads
     * better grouped together with a per-row arrow.
     */

    const grCALL_RELATIONS = new Set(['calls', 'indirect_call', 'references']);
    const grDEPENDENCY_RELATIONS = new Set(['imports', 'imports_from', 'uses', 'inherits', 'implements']);
    const grSTRUCTURE_RELATIONS = new Set(['contains', 'method', 'declares']);
    const grMEANING_RELATIONS = new Set(['rationale_for']);

    /** Group keys in inspector order (desktop `RelationGroupKey`, plus `hierarchy`). */
    const GRAPH_GROUP_ORDER = [
      'callers', 'calls', 'dependencies', 'structure', 'meaning', 'hierarchy', 'related',
    ];

    /** Fallback Chinese labels; the rail normally routes through `t('gr.group.<key>')`. */
    const GRAPH_GROUP_LABELS = {
      callers: '调用者',
      calls: '调用',
      dependencies: '依赖',
      structure: '结构',
      meaning: '说明',
      hierarchy: '继承',
      related: '关联',
    };

    /* ---- display vocabulary (desktop `graphMeta.ts`) --------------------- */

    const grRELATION_LABEL = {
      shares_topic: '共同主题',
      same_folder: '同一笔记目录',
      same_project: '同项目未分类',
      shared_reference: '共同引用文件',
      community_member: '社区成员（布局索引）',
      mentions: '提及主题',
      co_occurs: '主题共现',
      similar: '内容相似',
      contains: '包含',
      imports: '导入模块',
      imports_from: '导入符号',
      calls: '调用',
      indirect_call: '回调引用',
      references: '引用',
      inherits: '继承',
      implements: '实现',
      method: '方法',
      declares: '声明',
      rationale_for: '说明',
      uses: '依赖',
    };

    const grKIND_LABEL = {
      community: '社区',
      note: '笔记',
      topic: '主题',
      file: '文件',
      class: '类',
      function: '函数',
      module: '模块',
      rationale: '说明',
      external: '外部',
    };

    const grCONFIDENCE_LABEL = {
      EXTRACTED: '源码直读',
      INFERRED: '推断',
      AMBIGUOUS: '存疑',
    };

    /** Chinese label for a relation kind; English falls back to the raw kind. */
    function grRelationLabel(relation, locale) {
      if (locale === 'en') return relation;
      return grRELATION_LABEL[relation] ?? relation;
    }

    /** Short label for a node kind. */
    function grKindLabel(kind, locale) {
      if (locale === 'en') return kind;
      return grKIND_LABEL[kind] ?? kind;
    }

    /** Confidence label. */
    function grConfidenceLabel(confidence, locale) {
      if (locale === 'en') {
        return { EXTRACTED: 'Extracted', INFERRED: 'Inferred', AMBIGUOUS: 'Ambiguous' }[confidence] ?? confidence;
      }
      return grCONFIDENCE_LABEL[confidence] ?? confidence;
    }

    /** Relations treated as solid even without an `EXTRACTED` confidence tag. */
    const grSTRUCTURAL_RELATIONS = new Set([
      'contains', 'method', 'imports', 'imports_from', 'inherits', 'implements',
      'declares', 'rationale_for', 'uses',
    ]);

    /** True when the edge should be drawn dotted (a deduction, not a reading). */
    function grIsInferred(relation, confidence) {
      if (confidence === 'INFERRED' || confidence === 'AMBIGUOUS') return true;
      return !grSTRUCTURAL_RELATIONS.has(relation) && confidence !== 'EXTRACTED';
    }

    /**
     * Group one node's edges into inspector buckets.
     *
     * @param {string} selectedId - the selected node id.
     * @param {Array<{source:string,target:string,relation:string,confidence?:string,line?:number}>} edges
     *   raw graph edges.
     * @param {ReadonlyMap<string, object>} byId - node id → node.
     * @param {'code'|'notes'} scope - notes scope folds everything into `related`.
     * @returns {Array<{key:string,label:string,items:Array<{edge:object,other:object,outgoing:boolean}>}>}
     *   non-empty groups only, in desktop order.
     */
    function grRelationGroups(selectedId, edges, byId, scope) {
      const groups = {
        callers: [], calls: [], dependencies: [], structure: [], meaning: [], hierarchy: [], related: [],
      };

      for (const edge of edges) {
        if (edge.source !== selectedId && edge.target !== selectedId) continue;
        const outgoing = edge.source === selectedId;
        const other = byId.get(outgoing ? edge.target : edge.source);
        if (!other || other.id === selectedId) continue;
        const connection = { edge, other, outgoing };

        if (scope === 'notes') {
          groups.related.push(connection);
        } else if (grCALL_RELATIONS.has(edge.relation)) {
          (outgoing ? groups.calls : groups.callers).push(connection);
        } else if (grDEPENDENCY_RELATIONS.has(edge.relation)) {
          groups.dependencies.push(connection);
        } else if (grSTRUCTURE_RELATIONS.has(edge.relation)) {
          groups.structure.push(connection);
        } else if (grMEANING_RELATIONS.has(edge.relation)) {
          groups.meaning.push(connection);
        } else if (edge.relation === 'inherits' || edge.relation === 'implements') {
          groups.hierarchy.push(connection);
        } else {
          groups.dependencies.push(connection);
        }
      }

      const byLabel = (a, b) => String(a.other.label ?? '').localeCompare(String(b.other.label ?? ''), 'zh-CN');
      const byRelation = (a, b) => (
        String(a.edge.relation ?? '').localeCompare(String(b.edge.relation ?? '')) || byLabel(a, b)
      );
      for (const key of ['dependencies', 'structure', 'meaning', 'hierarchy']) groups[key].sort(byRelation);
      groups.callers.sort(byLabel);
      groups.calls.sort(byLabel);
      groups.related.sort(byRelation);

      return GRAPH_GROUP_ORDER
        .filter((key) => groups[key].length > 0)
        .map((key) => ({ key, label: GRAPH_GROUP_LABELS[key], items: groups[key] }));
    }

    /* ================================================================ *
     * graph/canvas.js
     * ================================================================ */
    /**
     * Force-directed graph canvas for the CodeSlice graph view (Agent C, §2.2).
     *
     * Ported from the desktop reference `GraphCanvas.tsx`. The vis-network options
     * are mirrored verbatim in {@link GRAPH_CANVAS_PARAMS} so `dev/compare` can
     * diff them against the reference; the runtime here only expands that constant
     * into the Network options object.
     *
     * Three behaviours matter, same as the reference:
     * - Physics settles once, then switches off; settled coordinates are cached in
     *   memory and persisted through the `layout` API so a tab switch does not shake
     *   the graph again.
     * - Filters hide, never remove: rows stay in the DataSet with a `hidden` flag.
     * - Labels are earned by degree: high-degree anchors carry names at the
     *   overview zoom; the rest stay dots with a tooltip until the reader zooms in.
     *
     * vis-network is a lazy Host asset (`loadVis`); until it resolves the stage
     * shows a loading pill. All non-canvas UI lives in `view.js` as plain React DOM.
     */











    /**
     * Desktop canvas parameters, verbatim from `GraphCanvas.tsx`.
     *
     * `physics.forceAtlas2Based`, `physics.stabilization`, `layout`, `interaction`,
     * `nodes`, `edges` map 1:1 onto the vis `Options` object; the scalars below
     * back the settle watchdog, the label budget and the inferred-edge halving.
     */
    const GRAPH_CANVAS_PARAMS = {
      /** Zoom used when a search/locate request focuses one node. */
      focusScale: 0.7,
      /** A settle that keeps reporting progress is not stuck; only silence is. */
      settleIdleMs: 15_000,
      /** Hard ceiling so a runaway layout cannot spin forever. */
      settleHardMs: 120_000,
      labelFace: 'system-ui, "Microsoft YaHei UI", "Segoe UI", sans-serif',
      /** Label size in CSS pixels; labels keep it constant while zooming. */
      labelPx: 12,
      labelHaloDark: '#0a0f16',
      labelHaloLight: '#ffffff',
      /** Selection ring: white fill + community border, per the reference highlight. */
      selectionFill: '#ffffff',
      /** Fallback edge ink when no community colour applies. */
      fallbackEdge: '#8794a6',
      /** Viewport candidate margin when picking labelled nodes. */
      viewportMargin: 1.2,
      labelMaxChars: 42,
      seedRadius: 40,
      seedAngle: 2.4,
      /** Minimum id hit ratio to reuse a cached or persisted coordinate set. */
      seedRecallRatio: 0.8,
      positionCacheMax: 4,
      nodeSizeMin: 7,
      nodeSizeSpan: 17,
      nodeBorderWidth: 1.5,
      arrowScaleFactor: 0.45,
      inferredWidthFactor: 0.7,
      inferredOpacityFactor: 0.6,
      /** Label count at each zoom scale band (desktop `labelLimit`). */
      labelBudget: [
        { minScale: 0.7, limit: 22 },
        { minScale: 0.45, limit: 26 },
        { minScale: 0.28, limit: 24 },
        { minScale: 0.15, limit: 16 },
        { minScale: 0.08, limit: 10 },
        { minScale: 0, limit: 6 },
      ],
      physics: {
        solver: 'forceAtlas2Based',
        /** Tiny velocity threshold so the pass actually uses its iteration budget. */
        minVelocity: 0,
        forceAtlas2Based: {
          gravitationalConstant: -60,
          centralGravity: 0.005,
          springLength: 120,
          springConstant: 0.08,
          damping: 0.4,
          avoidOverlap: 0.8,
        },
        stabilization: {
          enabled: true,
          updateInterval: 25,
          fit: false,
          iterationsSmall: 140,
          iterationsLarge: 200,
          largeNodeThreshold: 1200,
        },
      },
      layout: { improvedLayout: false, randomSeed: 42 },
      interaction: {
        hover: true,
        tooltipDelay: 120,
        hideEdgesOnDrag: true,
        keyboard: false,
        multiselect: false,
      },
      nodes: { shape: 'dot', borderWidth: 1.5, chosen: { node: true, label: false } },
      edges: {
        smooth: { enabled: true, type: 'continuous', roundness: 0.15 },
        selectionWidth: 3,
      },
    };

    /** Stabilization passes before coordinates are frozen (desktop `stabilizationIterations`). */
    function grStabilizationIterations(nodeCount) {
      return nodeCount > GRAPH_CANVAS_PARAMS.physics.stabilization.largeNodeThreshold
        ? GRAPH_CANVAS_PARAMS.physics.stabilization.iterationsLarge
        : GRAPH_CANVAS_PARAMS.physics.stabilization.iterationsSmall;
    }

    /** How many node labels stay visible at the current viewport scale. */
    function grLabelLimit(scale) {
      for (const band of GRAPH_CANVAS_PARAMS.labelBudget) {
        if (scale >= band.minScale) return band.limit;
      }
      return GRAPH_CANVAS_PARAMS.labelBudget[GRAPH_CANVAS_PARAMS.labelBudget.length - 1].limit;
    }

    /** Settled positions per build, newest last. Reset by page reload. */
    const grPositionCache = new Map();

    function grRememberPositions(layoutKey, positions) {
      if (layoutKey === '') return;
      const map = new Map();
      for (const [id, point] of Object.entries(positions ?? {})) {
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) map.set(id, point);
      }
      grPositionCache.delete(layoutKey);
      grPositionCache.set(layoutKey, map);
      while (grPositionCache.size > GRAPH_CANVAS_PARAMS.positionCacheMax) {
        const oldest = grPositionCache.keys().next().value;
        if (oldest === undefined) break;
        grPositionCache.delete(oldest);
      }
    }

    function grRecallPositions(layoutKey, ids) {
      const cached = grPositionCache.get(layoutKey);
      if (cached === undefined) return undefined;
      const hits = ids.reduce((count, id) => count + (cached.has(id) ? 1 : 0), 0);
      return ids.length > 0 && hits / ids.length >= GRAPH_CANVAS_PARAMS.seedRecallRatio ? cached : undefined;
    }

    /** Label ink follows the host surface; vis needs a real colour. */
    function grReadLabelInk(host) {
      try {
        const color = host && typeof getComputedStyle === 'function' ? getComputedStyle(host).color : '';
        if (typeof color === 'string' && color !== '' && color !== 'rgba(0, 0, 0, 0)') return color;
      } catch {
        // Detached node during teardown.
      }
      return '#e0e0e0';
    }

    function grClipLabel(label) {
      const text = String(label ?? '');
      return text.length > GRAPH_CANVAS_PARAMS.labelMaxChars
        ? text.slice(0, GRAPH_CANVAS_PARAMS.labelMaxChars - 1) + '…'
        : text;
    }

    /* ---- DataSet access that tolerates the harness stub ------------------ */

    function grDsIds(ds) {
      if (typeof ds.getIds === 'function') return ds.getIds();
      return ds.rows ? [...ds.rows.keys()] : [];
    }

    function grDsRemove(ds, ids) {
      if (typeof ds.remove === 'function') { ds.remove(ids); return; }
      if (ds.rows) ids.forEach((id) => ds.rows.delete(id));
    }

    function grDsClear(ds) {
      if (typeof ds.clear === 'function') { ds.clear(); return; }
      if (ds.rows) ds.rows.clear();
    }

    function grDsAdd(ds, rows) {
      if (typeof ds.add === 'function') { ds.add(rows); return; }
      if (ds.rows) rows.forEach((row) => ds.rows.set(row.id, row));
    }

    function grDsGet(ds, id) {
      if (ds.rows && typeof ds.rows.get === 'function') return ds.rows.get(id);
      if (typeof ds.get === 'function') return ds.get(id);
      return undefined;
    }

    /**
     * Build the vis options object from the frozen parameter constant. Kept as a
     * pure function so the constant stays the single diffable source.
     */
    function grVisOptions(usePhysics, iterationCount) {
      return {
        physics: {
          enabled: usePhysics,
          solver: GRAPH_CANVAS_PARAMS.physics.solver,
          minVelocity: GRAPH_CANVAS_PARAMS.physics.minVelocity,
          forceAtlas2Based: { ...GRAPH_CANVAS_PARAMS.physics.forceAtlas2Based },
          stabilization: {
            enabled: GRAPH_CANVAS_PARAMS.physics.stabilization.enabled,
            iterations: iterationCount,
            updateInterval: GRAPH_CANVAS_PARAMS.physics.stabilization.updateInterval,
            fit: GRAPH_CANVAS_PARAMS.physics.stabilization.fit,
          },
        },
        layout: { ...GRAPH_CANVAS_PARAMS.layout },
        interaction: { ...GRAPH_CANVAS_PARAMS.interaction },
        nodes: { ...GRAPH_CANVAS_PARAMS.nodes },
        edges: { ...GRAPH_CANVAS_PARAMS.edges },
      };
    }

    /**
     * Low-level stage factory: construct the DataSets and the Network on one mount
     * element, attach the event handlers, and return a destroyable handle. The React
     * component {@link GraphStage} owns the lifecycle; this is the seam the contract
     * exposes for tests and for a future non-React host.
     *
     * @param {object} options
     * @param {HTMLElement} options.mount - vis container element.
     * @param {object} options.vis - the loaded `vis` namespace.
     * @param {{nodes: object[], edges: object[]}} options.rows - initial rows.
     * @param {object} options.visOptions - expanded vis options.
     * @param {object} options.handlers - `{onSelect, onActivate}`.
     * @returns {{ network: object, datasets: object, destroy: () => void }}
     */
    function grCreateStage(options) {
      const { mount, vis, rows, visOptions, handlers } = options;
      const datasets = {
        nodes: new vis.DataSet(rows.nodes),
        edges: new vis.DataSet(rows.edges),
      };
      const network = new vis.Network(mount, datasets, visOptions);

      network.on('click', (event) => {
        const id = Array.isArray(event.nodes) && typeof event.nodes[0] === 'string' ? event.nodes[0] : null;
        handlers.onSelect(id);
      });
      network.on('doubleClick', (event) => {
        const id = Array.isArray(event.nodes) && typeof event.nodes[0] === 'string' ? event.nodes[0] : null;
        if (id !== null) handlers.onActivate(id);
      });

      return {
        network,
        datasets,
        destroy() {
          try { network.destroy(); } catch { /* already torn down */ }
        },
      };
    }

    /**
     * React stage: canvas wrapper, vis mount point, tools and the settle pill.
     *
     * @param {object} props
     * @param {object} props.ctx - client context.
     * @param {Array<object>} props.nodes - filtered/annotated node rows.
     * @param {Array<object>} props.edges - filtered/annotated edge rows.
     * @param {string|null} props.selectedId - selected node id.
     * @param {{id:string,nonce:number,ids?:string[],hubId?:string}|null} props.focus - one-shot camera focus.
     *   `ids` fits a community region; `hubId` is the member that receives the
     *   white selection ring while the rail stays on the community list.
     * @param {string} props.layoutKey - topology key for the coordinate cache.
     * @param {Record<string,{x:number,y:number}>} [props.initialPositions]
     *   coordinates restored from the `layout` API.
     * @param {number} [props.activeCommunity] - highlighted community id, if any.
     * @param {boolean} props.visible - `false` means parked-but-mounted.
     * @param {(id:string|null)=>void} props.onSelect
     * @param {(id:string)=>void} props.onActivate
     * @param {(positions:Record<string,{x:number,y:number}>)=>void} [props.onSettled]
     * @param {(network:object)=>void} [props.controllerRef] - imperative handle.
     * @param {(key:string)=>string} props.t
     * @param {string} props.locale
     */
    function GraphStage(props) {
      const {
        ctx, nodes, edges, selectedId, focus, layoutKey, initialPositions,
        activeCommunity, visible, onSelect, onActivate, onSettled, controllerRef, t, locale,
        fitPad, hintKey, nodeScale,
      } = props;

      const hostRef = useRef(null);
      const mountRef = useRef(null);
      const stageRef = useRef(undefined);
      const datasetsRef = useRef(undefined);
      const networkRef = useRef(undefined);
      const selectedRef = useRef(selectedId);
      selectedRef.current = selectedId;
      const nodesRef = useRef(nodes);
      nodesRef.current = nodes;
      const edgesRef = useRef(edges);
      edgesRef.current = edges;
      const focusRef = useRef(focus);
      focusRef.current = focus;
      const activeCommunityRef = useRef(activeCommunity);
      activeCommunityRef.current = activeCommunity;
      const settledRef = useRef(onSettled);
      settledRef.current = onSettled;
      const handlersRef = useRef({ onSelect, onActivate });
      handlersRef.current = { onSelect, onActivate };

      const [vis, setVis] = useState(undefined);
      const [assetError, setAssetError] = useState(undefined);
      const [settling, setSettling] = useState(false);
      const [stageEpoch, setStageEpoch] = useState(0);
      const [labelInk, setLabelInk] = useState('#e0e0e0');

      const parked = visible === false;
      const maxDegree = useMemo(() => {
        let max = 1;
        for (const node of nodes) {
          const degree = Number(node.degree ?? 0);
          if (degree > max) max = degree;
        }
        return max;
      }, [nodes]);

      const persistedPositions = useMemo(
        () => new Map(Object.entries(initialPositions ?? {})),
        [initialPositions],
      );

      /* ---- load the renderer ------------------------------------------- */

      useEffect(() => {
        if (parked) return undefined;
        let cancelled = false;
        setAssetError(undefined);
        loadVis(ctx).then((namespace) => {
          if (!cancelled) setVis(namespace);
        }).catch((caught) => {
          if (!cancelled) setAssetError(caught && caught.message ? caught.message : String(caught));
        });
        return () => { cancelled = true; };
      }, [ctx, parked]);

      /* ---- label ink follows the host theme ---------------------------- */

      useEffect(() => {
        if (parked) return undefined;
        const read = () => {
          if (hostRef.current !== null) setLabelInk(grReadLabelInk(hostRef.current));
        };
        read();
        if (typeof MutationObserver === 'undefined') return undefined;
        const observer = new MutationObserver(read);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
        return () => observer.disconnect();
      }, [parked]);

      /* ---- build the network once per topology ------------------------- */

      const seedPositions = useRef(undefined);
      const seedApplied = useRef(false);
      const fitted = useRef(false);
      const settleDone = useRef(false);
      const settleCompleted = useRef(false);
      const settleTimer = useRef(0);
      const settleDeadline = useRef(0);
      const stabilizeRequested = useRef(false);
      const stabilizePending = useRef(false);
      const appliedFocus = useRef(null);
      const labelFrame = useRef(0);

      const viewport = () => ({
        width: hostRef.current?.clientWidth ?? 1200,
        height: hostRef.current?.clientHeight ?? 800,
      });

      const resolveSeed = () => {
        const ids = nodesRef.current.map((node) => node.id);
        const cached = grRecallPositions(layoutKey, ids);
        if (cached !== undefined) return cached;
        const hits = ids.reduce((count, id) => count + (persistedPositions.has(id) ? 1 : 0), 0);
        return ids.length > 0 && hits / ids.length >= GRAPH_CANVAS_PARAMS.seedRecallRatio
          ? persistedPositions
          : undefined;
      };

      const fitIds = (network, ids, padX = 96, padY = 72, maxScale = 1.6) => {
        if (ids.length === 0) {
          if (typeof network.fit === 'function') network.fit({ animation: false });
          return;
        }
        // `network.fit` fits the node centres, not their labels or halos; at the
        // overview zoom that leaves the top/right labels clipped in a dense graph.
        // Compute the bounding box ourselves and reserve a real pixel margin, then
        // centre it with `moveTo`. This is deterministic and survives
        // `ResizeObserver` calls that arrive before vis has updated its viewport.
        const positions = typeof network.getPositions === 'function' ? network.getPositions(ids) : {};
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const id of ids) {
          const point = positions[id];
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
          if (point.x < minX) minX = point.x;
          if (point.x > maxX) maxX = point.x;
          if (point.y < minY) minY = point.y;
          if (point.y > maxY) maxY = point.y;
        }
        const box = viewport();
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || box.width <= 0 || box.height <= 0) {
          if (typeof network.fit === 'function') network.fit({ nodes: ids, animation: false });
          return;
        }
        const spanX = Math.max(maxX - minX, 1);
        const spanY = Math.max(maxY - minY, 1);
        // Labels are drawn at a constant screen size, so reserve screen pixels
        // rather than graph units. 96/72 leaves room for the longest file labels.
        const usableWidth = Math.max(120, box.width - padX);
        const usableHeight = Math.max(100, box.height - padY);
        const scale = Math.max(0.03, Math.min(maxScale, Math.min(usableWidth / spanX, usableHeight / spanY)));
        if (typeof network.moveTo === 'function') {
          network.moveTo({
            position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
            scale,
            animation: false,
          });
        } else if (typeof network.fit === 'function') {
          network.fit({ nodes: ids, animation: false });
        }
      };

      const fitVisible = (network) => {
        // A sparse graph is magnified harder, so its node discs and labels need a
        // bigger screen margin than the dense project graph does.
        fitIds(
          network,
          nodesRef.current.filter((node) => !node.hidden).map((node) => node.id),
          fitPad?.x ?? 96,
          fitPad?.y ?? 72,
          fitPad?.maxScale ?? 1.6,
        );
      };

      const applyLabels = (network) => {
        const datasets = datasetsRef.current;
        if (datasets === undefined || network === undefined) return;
        const scale = Math.max(typeof network.getScale === 'function' ? network.getScale() : 1, 0.01);
        const limit = grLabelLimit(scale);
        const view = typeof network.getViewPosition === 'function' ? network.getViewPosition() : { x: 0, y: 0 };
        const positions = typeof network.getPositions === 'function' ? network.getPositions() : {};
        const box = viewport();
        const halfWidth = (box.width / scale / 2) * GRAPH_CANVAS_PARAMS.viewportMargin;
        const halfHeight = (box.height / scale / 2) * GRAPH_CANVAS_PARAMS.viewportMargin;

        const candidates = nodesRef.current.filter((node) => {
          if (node.hidden) return false;
          const position = positions[node.id];
          return Boolean(position)
            && Math.abs(position.x - view.x) <= halfWidth
            && Math.abs(position.y - view.y) <= halfHeight;
        });
        candidates.sort((a, b) => Number(b.degree ?? 0) - Number(a.degree ?? 0));
        const labelled = new Set(candidates.slice(0, limit).map((node) => node.id));
        if (selectedRef.current !== null && selectedRef.current !== undefined) labelled.add(selectedRef.current);

        const fontPx = Math.round((GRAPH_CANVAS_PARAMS.labelPx / scale) * 10) / 10;
        const halo = Math.round((1.1 / scale) * 10) / 10;
        datasets.nodes.update(nodesRef.current.map((node) => {
          const visible = !node.hidden && labelled.has(node.id);
          return {
            id: node.id,
            font: {
              size: visible ? fontPx : 0,
              color: labelInk,
              face: GRAPH_CANVAS_PARAMS.labelFace,
              strokeWidth: visible ? halo : 0,
              strokeColor: GRAPH_CANVAS_PARAMS.labelHaloDark,
            },
          };
        }));
      };

      useEffect(() => {
        if (parked || vis === undefined || mountRef.current === null) return undefined;

        seedPositions.current = resolveSeed();
        seedApplied.current = false;
        const usePhysics = seedPositions.current === undefined;
        const iterationCount = grStabilizationIterations(nodesRef.current.length);
        const stage = grCreateStage({
          mount: mountRef.current,
          vis,
          rows: { nodes: [], edges: [] },
          visOptions: grVisOptions(usePhysics, iterationCount),
          handlers: {
            onSelect: (id) => handlersRef.current.onSelect(id),
            onActivate: (id) => handlersRef.current.onActivate(id),
          },
        });
        stageRef.current = stage;
        datasetsRef.current = stage.datasets;
        networkRef.current = stage.network;
        settleDone.current = false;
        settleCompleted.current = false;
        stabilizeRequested.current = false;
        stabilizePending.current = usePhysics;
        appliedFocus.current = null;
        fitted.current = false;
        setSettling(usePhysics);
        // The stage can be created *after* the payload arrived (e.g. the view was
        // parked while another tab was active). Bump an epoch so the data effect
        // runs against the fresh datasets instead of leaving them empty.
        setStageEpoch((value) => value + 1);

        // vis only follows `window` resizes; this stage may change size when the
        // sidebar opens, the composer grows, or the container query flips from a
        // row to a stack. Keep the canvas bitmap in step with the mount box.
        let resizeObserver;
        let resizeFrame = 0;
        if (typeof window.ResizeObserver === 'function' && mountRef.current !== null) {
          resizeObserver = new window.ResizeObserver(() => {
            const width = mountRef.current?.clientWidth ?? 0;
            const height = mountRef.current?.clientHeight ?? 0;
            if (width > 0 && height > 0 && typeof networkRef.current?.setSize === 'function') {
              networkRef.current.setSize(`${width}px`, `${height}px`);
              if (typeof networkRef.current.redraw === 'function') networkRef.current.redraw();
              // vis keeps the old viewport centre after `setSize`, so a stage that
              // grows from 617 to 949 px leaves the graph parked in the left half.
              // Refit on the settled size; a short frame debounce avoids fighting
              // the rail-drawer animation.
              if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
              resizeFrame = window.requestAnimationFrame(() => {
                resizeFrame = 0;
                if (networkRef.current !== undefined) fitVisible(networkRef.current);
              });
            }
          });
          resizeObserver.observe(mountRef.current);
        }

        const armSettleTimer = (delay) => {
          if (settleTimer.current) window.clearTimeout(settleTimer.current);
          settleTimer.current = window.setTimeout(() => settle(), delay);
        };
        const settle = () => {
          if (settleDone.current) return;
          settleDone.current = true;
          stabilizePending.current = false;
          if (settleTimer.current) {
            window.clearTimeout(settleTimer.current);
            settleTimer.current = 0;
          }
          const network = networkRef.current;
          if (network !== undefined && typeof network.setOptions === 'function') {
            network.setOptions({ physics: { enabled: false } });
          }
          const positions = typeof network?.getPositions === 'function' ? network.getPositions() : {};
          if (settleCompleted.current) {
            grRememberPositions(layoutKey, positions);
            settledRef.current?.(positions);
          }
          setSettling(false);
          if (network !== undefined) fitVisible(network);
          const wanted = focusRef.current;
          if (wanted && grDsGet(datasetsRef.current?.nodes, wanted.id)) {
            if (typeof network?.focus === 'function') {
              network.focus(wanted.id, { scale: GRAPH_CANVAS_PARAMS.focusScale, animation: false, locked: false });
            }
            appliedFocus.current = wanted;
            if (network !== undefined) applyLabels(network);
          }
        };
        settleDeadline.current = Date.now() + GRAPH_CANVAS_PARAMS.settleHardMs;
        if (usePhysics) armSettleTimer(GRAPH_CANVAS_PARAMS.settleIdleMs);

        const noteProgress = (info) => {
          if (settleDone.current) return;
          if (info?.total && (info.iterations ?? 0) >= info.total) settleCompleted.current = true;
          const remaining = settleDeadline.current - Date.now();
          if (remaining <= 0) { settle(); return; }
          armSettleTimer(Math.min(GRAPH_CANVAS_PARAMS.settleIdleMs, remaining));
        };

        const completeSettle = () => {
          if (!stabilizeRequested.current) return;
          settleCompleted.current = true;
          settle();
        };

        const network = stage.network;
        network.once('stabilizationIterationsDone', completeSettle);
        network.on('stabilizationProgress', noteProgress);
        network.on('dragEnd', () => {
          const positions = typeof network.getPositions === 'function' ? network.getPositions() : {};
          grRememberPositions(layoutKey, positions);
          settledRef.current?.(positions);
        });
        network.on('zoom', () => {
          if (labelFrame.current) return;
          labelFrame.current = window.requestAnimationFrame(() => {
            labelFrame.current = 0;
            if (networkRef.current !== undefined) applyLabels(networkRef.current);
          });
        });

        if (controllerRef !== undefined) {
          controllerRef.current = {
            fit() { if (networkRef.current !== undefined) fitVisible(networkRef.current); },
            zoomBy(factor) {
              const n = networkRef.current;
              if (n === undefined || typeof n.moveTo !== 'function') return;
              const scale = Math.max(0.03, Math.min(4, n.getScale() * factor));
              n.moveTo({ scale, animation: false });
            },
            centre(id) {
              const n = networkRef.current;
              if (n === undefined) return;
              const point = typeof n.getPositions === 'function' ? n.getPositions([id])[id] : undefined;
              if (point !== undefined && typeof n.moveTo === 'function') {
                n.moveTo({ position: point, scale: n.getScale(), animation: false });
              }
            },
            focusNode(id) {
              const n = networkRef.current;
              if (n === undefined || typeof n.focus !== 'function') return;
              n.focus(id, { scale: GRAPH_CANVAS_PARAMS.focusScale, animation: false, locked: false });
            },
          };
        }

        return () => {
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
          if (resizeObserver !== undefined) resizeObserver.disconnect();
          if (labelFrame.current) window.cancelAnimationFrame(labelFrame.current);
          labelFrame.current = 0;
          if (settleTimer.current) {
            window.clearTimeout(settleTimer.current);
            settleTimer.current = 0;
          }
          settleDone.current = true;
          stabilizeRequested.current = false;
          stage.destroy();
          if (controllerRef !== undefined) controllerRef.current = undefined;
          stageRef.current = undefined;
          datasetsRef.current = undefined;
          networkRef.current = undefined;
        };
        // Rebuilt only for a different topology or renderer; data/filter/selection
        // changes update the datasets in place so the camera is never reset.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [vis, parked, layoutKey]);

      /* ---- push rows into the datasets in place ------------------------ */

      useEffect(() => {
        const datasets = datasetsRef.current;
        const network = networkRef.current;
        if (datasets === undefined || network === undefined) return;

        const ids = new Set(nodes.map((node) => node.id));
        const staleIds = grDsIds(datasets.nodes).filter((id) => !ids.has(String(id)));
        if (staleIds.length > 0) grDsRemove(datasets.nodes, staleIds);

        const positions = !seedApplied.current && seedPositions.current
          ? seedPositions.current
          : new Map(Object.entries(typeof network.getPositions === 'function' ? network.getPositions() : {}));
        seedApplied.current = true;

        datasets.nodes.update(nodes.map((node, index) => {
          const degree = Number(node.degree ?? 0);
          const color = grCommunityColor(node.community);
          const title = document.createElement('div');
          title.textContent = [
            node.label,
            grKindLabel(node.kind, locale),
            node.path ? `${node.path}:${node.line ?? ''}` : '',
            node.communityLabel ? `社区：${node.communityLabel}` : '',
            `连接：${node.memberCount ?? degree}`,
          ].filter(Boolean).join('\n');
          const position = positions.get(node.id);
          return {
            id: node.id,
            label: grClipLabel(node.label),
            title,
            hidden: node.hidden,
            shape: 'dot',
            // A sparse graph is magnified harder by the fit, so its discs must start
            // smaller to end up looking like the dense project graph's dots.
            size: (GRAPH_CANVAS_PARAMS.nodeSizeMin
              + GRAPH_CANVAS_PARAMS.nodeSizeSpan * Math.sqrt(degree / maxDegree)
              // A note is the anchor of its own sub-graph; the topics hang off it.
              + (node.kind === 'note' ? 4 : 0)) * (nodeScale ?? 1),
            color: {
              background: color,
              border: color,
              highlight: { background: GRAPH_CANVAS_PARAMS.selectionFill, border: color },
              hover: { background: GRAPH_CANVAS_PARAMS.selectionFill, border: color },
            },
            font: { size: 0, color: labelInk, face: GRAPH_CANVAS_PARAMS.labelFace },
            ...(position ?? {
              x: GRAPH_CANVAS_PARAMS.seedRadius * Math.sqrt(index) * Math.cos(index * GRAPH_CANVAS_PARAMS.seedAngle),
              y: GRAPH_CANVAS_PARAMS.seedRadius * Math.sqrt(index) * Math.sin(index * GRAPH_CANVAS_PARAMS.seedAngle),
            }),
          };
        }));

        const byId = new Map(nodes.map((node) => [node.id, node]));
        grDsClear(datasets.edges);
        grDsAdd(datasets.edges, edges.map((edge, index) => {
          const inferred = grIsInferred(edge.relation, edge.confidence);
          const style = grEdgeStyle(edge.relation);
          const source = byId.get(edge.source);
          const ink = grIsStructuralRelation(edge.relation) || source === undefined
            ? GRAPH_CANVAS_PARAMS.fallbackEdge
            : grCommunityColor(source.community);
          const title = document.createElement('div');
          title.textContent = grRelationLabel(edge.relation, locale)
            + ' · ' + grConfidenceLabel(edge.confidence, locale)
            + (edge.line ? ` · L${edge.line}` : '');
          return {
            id: edge.id ?? `e${index}`,
            from: edge.source,
            to: edge.target,
            hidden: edge.hidden,
            title,
            dashes: inferred,
            width: inferred ? style.width * GRAPH_CANVAS_PARAMS.inferredWidthFactor : style.width,
            color: { color: ink, opacity: inferred ? style.opacity * GRAPH_CANVAS_PARAMS.inferredOpacityFactor : style.opacity },
            arrows: {
              to: {
                enabled: !GRAPH_UNDIRECTED.has(edge.relation) && GRAPH_ARROWED.has(edge.relation),
                scaleFactor: GRAPH_CANVAS_PARAMS.arrowScaleFactor,
              },
            },
          };
        }));

        if (!fitted.current && nodes.some((node) => !node.hidden)) {
          fitVisible(network);
          fitted.current = true;
        }
        if (stabilizePending.current && nodes.length > 0) {
          stabilizePending.current = false;
          stabilizeRequested.current = true;
          settleDeadline.current = Date.now() + GRAPH_CANVAS_PARAMS.settleHardMs;
          const iterations = grStabilizationIterations(nodes.length);
          window.setTimeout(() => {
            if (!settleDone.current && typeof networkRef.current?.stabilize === 'function') {
              networkRef.current.stabilize(iterations);
            }
          }, 0);
        }
        applyLabels(network);
      }, [nodes, edges, maxDegree, labelInk, locale, stageEpoch]);

      /* ---- selection / community highlight dimming ---------------------- */

      useEffect(() => {
        const network = networkRef.current;
        if (network === undefined) return;
        const active = selectedRef.current && grDsGet(datasetsRef.current?.nodes, selectedRef.current)
          ? selectedRef.current
          : null;
        const community = activeCommunityRef.current;
        const punch = community !== undefined && focusRef.current?.hubId
          && grDsGet(datasetsRef.current?.nodes, focusRef.current.hubId)
          ? focusRef.current.hubId
          : null;
        if (typeof network.selectNodes === 'function') {
          network.selectNodes(active ? [active] : (punch ? [punch] : []), false);
        }

        const connected = new Set();
        if (active !== null) {
          connected.add(active);
          if (typeof network.getConnectedNodes === 'function') {
            for (const id of network.getConnectedNodes(active)) connected.add(String(id));
          }
        }
        const members = community === undefined
          ? null
          : new Set(nodesRef.current
            .filter((node) => !node.hidden && Number(node.community ?? 0) === community)
            .map((node) => node.id));
        datasetsRef.current?.nodes.update(nodesRef.current.map((node) => ({
          id: node.id,
          opacity: (!active && community === undefined) || node.hidden || connected.has(node.id)
            || (members !== null && members.has(node.id))
            ? 1
            : 0.28,
        })));
        datasetsRef.current?.edges.update((datasetsRef.current.edges.get() ?? []).map((edge) => {
          const base = typeof edge.color === 'object' && edge.color
            ? Number(edge.color.opacity ?? 0.6)
            : 0.6;
          // A node selection keeps only incident edges; a community selection keeps
          // only edges whose two ends are in the community. The old community path
          // left every edge at full opacity, so the dimmed nodes still sat in a
          // brightly coloured web and the focus read as "slightly grey", not focused.
          const inCommunity = members !== null && members.has(edge.from) && members.has(edge.to);
          const opacity = active !== null
            ? edge.from === active || edge.to === active ? Math.max(base, 0.75) : 0.08
            : community !== undefined
              ? inCommunity ? Math.max(base, 0.7) : 0.06
              : undefined;
          return {
            id: edge.id,
            color: {
              ...(typeof edge.color === 'object' ? edge.color : {}),
              opacity,
            },
          };
        }));
        if (networkRef.current !== undefined) applyLabels(networkRef.current);
      }, [selectedId, activeCommunity, nodes, edges]);

      /* ---- one-shot camera focus --------------------------------------- */

      useEffect(() => {
        const network = networkRef.current;
        if (!focus) { appliedFocus.current = null; return; }
        const requestedIds = Array.isArray(focus.ids) ? focus.ids : [focus.id];
        const ids = requestedIds.filter((id) => grDsGet(datasetsRef.current?.nodes, id) !== undefined);
        if (ids.length === 0) return;
        if (appliedFocus.current === focus) return;
        if (network !== undefined) {
          if (Array.isArray(focus.ids) && typeof network.getPositions === 'function') {
            // A community is a region, not one node: fit its members with a smaller
            // margin than the whole graph, then keep the hub ring from the selection
            // effect. `focusScale` is for a single node; using it here would crop
            // most of a large community.
            fitIds(network, ids, 40, 32, 1.25);
          } else if (typeof network.focus === 'function') {
            network.focus(focus.id, { scale: GRAPH_CANVAS_PARAMS.focusScale, animation: false, locked: false });
          }
        }
        appliedFocus.current = focus;
        if (network !== undefined) {
          applyLabels(network);
          window.requestAnimationFrame(() => {
            if (networkRef.current !== undefined) applyLabels(networkRef.current);
          });
        }
      }, [focus, nodes]);

      const empty = nodes.length === 0;
      const visibleCount = nodes.reduce((count, node) => count + (node.hidden ? 0 : 1), 0);

      return h('div', { className: 'gr-stage', 'data-cs': 'graph-canvas' },
        h('div', { className: 'gr-stage-host', ref: hostRef },
          h('div', { ref: mountRef, style: { position: 'absolute', inset: '0' } })),

        assetError !== undefined
          ? h('div', { className: 'gr-stage-empty' },
            h('b', null, t('gr.canvas.error')),
            h('span', null, assetError))
          : null,

        empty && !parked
          ? h('div', { className: 'gr-stage-empty' },
            h('b', null, t('gr.canvas.emptyTitle')),
            h('span', null, t('gr.canvas.emptyBody')))
          : null,

        !empty && visibleCount === 0
          ? h('div', { className: 'gr-stage-empty' }, t('gr.canvas.emptyFiltered'))
          : null,

        settling
          ? h('div', { className: 'gr-stage-pill' },
            h('span', { className: 'gr-spin' }),
            h('span', null, t('gr.canvas.laying')))
          : null,

        h('div', { className: 'gr-stage-tools', role: 'group', 'aria-label': t(hintKey ?? 'gr.canvas.hint') },
          h('button', {
            type: 'button', className: 'gr-iconbtn', title: t('gr.tool.fit'), 'aria-label': t('gr.tool.fit'),
            onClick: () => controllerRef?.current?.fit(),
          }, '⤢'),
          h('button', {
            type: 'button', className: 'gr-iconbtn', title: t('gr.tool.zoomIn'), 'aria-label': t('gr.tool.zoomIn'),
            onClick: () => controllerRef?.current?.zoomBy(1.25),
          }, '+'),
          h('button', {
            type: 'button', className: 'gr-iconbtn', title: t('gr.tool.zoomOut'), 'aria-label': t('gr.tool.zoomOut'),
            onClick: () => controllerRef?.current?.zoomBy(0.8),
          }, '−')),

        h('div', { className: 'gr-stage-hint' }, t(hintKey ?? 'gr.canvas.hint')));
    }

    /* ================================================================ *
     * graph/filter.js
     * ================================================================ */
    /**
     * Pure visibility projection for the graph canvas (Agent C, §2.2).
     *
     * Ported from the desktop reference `graphFilter.ts`. The canvas keeps every
     * node and edge in its DataSet with a `hidden` flag, so toggling a filter never
     * reassigns positions or restarts the layout. Re-adding a filtered node would
     * otherwise drop it at a new random position and shove the whole layout around
     * on every chip click.
     */



    /** Every family the filter semantics know about, in display order. */
    const GRAPH_FAMILY_LIST = [
      'behaviour', 'dependency', 'structure', 'hierarchy', 'meaning', 'other',
    ];

    /**
     * Families the switch bar renders (desktop `FAMILY_CHIPS`, verbatim order).
     * `hierarchy` and `other` still participate in filtering but have no chip.
     */
    const GRAPH_CHIP_FAMILIES = ['behaviour', 'dependency', 'structure', 'meaning'];

    /**
     * Everything except `meaning`: rationale nodes are commentary, and showing
     * hundreds of them by default turns the call graph into a wall of prose dots.
     * (Desktop `DEFAULT_FAMILIES`, verbatim.)
     */
    const GRAPH_DEFAULT_FAMILIES = ['behaviour', 'dependency', 'structure', 'other'];

    /**
     * @returns {{ families: Set<string>, hiddenCommunities: Set<number> }}
     *   the default filter state.
     */
    function grDefaultFilters() {
      return {
        families: new Set(GRAPH_DEFAULT_FAMILIES),
        hiddenCommunities: new Set(),
      };
    }

    /** Annotation nodes inherit visibility from the relation family they belong to. */
    function grNodeHidden(node, filters) {
      if (filters.hiddenCommunities.has(Number(node.community ?? 0))) return true;
      if (node.kind === 'rationale') return !filters.families.has('meaning');
      if (node.kind === 'external') return !filters.families.has('dependency');
      return false;
    }

    /**
     * Project a payload onto visible/hidden rows.
     *
     * @param {{ nodes?: object[], edges?: object[], links?: object[] }} payload
     *   raw graph slice (`links` accepted as the legacy edge key).
     * @param {{ families: Set<string>, hiddenCommunities: Set<number> }} filters
     * @returns {{ nodes: object[], edges: object[] }} rows annotated with `hidden`.
     */
    function grFilterGraph(payload, filters) {
      const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
      const rawEdges = Array.isArray(payload?.edges)
        ? payload.edges
        : (Array.isArray(payload?.links) ? payload.links : []);

      const hiddenById = new Map();
      const nodes = rawNodes.map((node) => {
        const hidden = grNodeHidden(node, filters);
        hiddenById.set(node.id, hidden);
        return { ...node, hidden };
      });

      const edges = rawEdges.map((edge) => ({
        ...edge,
        hidden: Boolean(
          hiddenById.get(edge.source)
          || hiddenById.get(edge.target)
          || !filters.families.has(String(edge.family ?? grRelationFamily(edge.relation))),
        ),
      }));

      return { nodes, edges };
    }

    /** Count visible rows after a filter projection. */
    function grVisibleCount(rows) {
      return rows.reduce((count, row) => count + (row.hidden ? 0 : 1), 0);
    }

    /* ================================================================ *
     * graph/locale.js
     * ================================================================ */
    /**
     * Copy for the CodeSlice graph view (Agent C, §2.2).
     *
     * Self-contained `gr.*` namespace so this module's keys cannot collide with
     * the core dictionary; E merges this through `mergeDict(ctx, GRAPH_LOCALE)`.
     * `zh` and `en` carry exactly the same key set.
     */

    const GRAPH_LOCALE = {
      zh: {
        /* ---- stats ---------------------------------------------------- */
        'gr.stats.nodes': '可见节点',
        'gr.stats.edges': '关系',
        'gr.stats.communities': '社区',

        /* ---- family switch bar ----------------------------------------- */
        'gr.family.behaviour': '调用',
        'gr.family.dependency': '依赖',
        'gr.family.structure': '结构',
        'gr.family.hierarchy': '继承',
        'gr.family.meaning': '说明',
        'gr.family.other': '其他',
        'gr.family.hint.behaviour': '显示调用与被调用关系',
        'gr.family.hint.dependency': '显示导入、外部依赖与继承关系',
        'gr.family.hint.structure': '显示包含与方法归属；关闭后画面更像调用图',
        'gr.family.hint.hierarchy': '显示继承与实现关系',
        'gr.family.hint.meaning': '显示文档字符串和注释说明节点',
        'gr.family.hint.other': '显示其他关系',

        /* ---- legend / communities -------------------------------------- */
        'gr.legend.title': '社区',
        'gr.legend.empty': '还没有社区。',
        'gr.legend.hint': '颜色代表社区；点击社区聚焦整组并定位到它的核心节点，点击节点查看调用者与被调用者，双击节点直接打开代码。',
        'gr.legend.hintNotes': '颜色代表社区；点击社区聚焦整组并定位到它的核心节点，点击笔记查看它关联的主题与相似笔记，双击笔记直接打开笔记。',

        /* ---- inspector ------------------------------------------------- */
        'gr.inspector.idle': '点击图谱里的一个节点，这里显示它的调用者、被调用者与说明。',
        'gr.inspector.back': '全部社区',
        'gr.rail.show': '详情',
        'gr.rail.hide': '收起详情',
        'gr.inspector.open': '打开代码',
        'gr.inspector.ask': '就此提问',
        'gr.inspector.neighbours': '{count} 邻点',
        'gr.inspector.noRelations': '此节点没有直接关联。',
        'gr.inspector.signature': '签名',
        'gr.inspector.siblings': '同文件中的其他声明',

        /* ---- relation groups ------------------------------------------- */
        'gr.group.callers': '调用者',
        'gr.group.calls': '调用',
        'gr.group.dependencies': '依赖',
        'gr.group.structure': '结构',
        'gr.group.meaning': '说明',
        'gr.group.hierarchy': '继承',
        'gr.group.related': '关联',
        'gr.rows.more': '还有 {count} 个关系；用搜索定位更具体。',

        /* ---- canvas ---------------------------------------------------- */
        'gr.canvas.hint': '滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开代码',
        'gr.canvas.hintNotes': '滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开笔记',
        'gr.canvas.laying': '正在排布图谱…',
        'gr.canvas.loading': '正在加载图谱…',
        'gr.canvas.error': '图谱加载失败',
        'gr.canvas.emptyTitle': '还没有代码图谱',
        'gr.canvas.emptyBody': '工作区里没有可索引的符号，重建一次试试。',
        'gr.canvas.emptyFiltered': '当前筛选下没有可显示的节点。',
        'gr.tool.fit': '适应窗口',
        'gr.tool.zoomIn': '放大',
        'gr.tool.zoomOut': '缩小',
        'gr.truncated': '图谱已截断：只画了 {shown} / {total} 个节点',

        /* ---- scope banner ---------------------------------------------- */
        'gr.scope.session': '会话关联节点',
        'gr.scope.all': '全图：当前会话暂无可定位的节点，展示整个工作区。',

        /* ---- search ----------------------------------------------------- */
        'gr.search.placeholder': '搜索函数 / 文件 / 社区',
        'gr.search.placeholderNotes': '搜索笔记 / 主题 / 社区',
        'gr.search.empty': '没有匹配的节点。',
      },

      en: {
        /* ---- stats ---------------------------------------------------- */
        'gr.stats.nodes': 'Visible nodes',
        'gr.stats.edges': 'Relations',
        'gr.stats.communities': 'Communities',

        /* ---- family switch bar ----------------------------------------- */
        'gr.family.behaviour': 'Calls',
        'gr.family.dependency': 'Dependency',
        'gr.family.structure': 'Structure',
        'gr.family.hierarchy': 'Hierarchy',
        'gr.family.meaning': 'Meaning',
        'gr.family.other': 'Other',
        'gr.family.hint.behaviour': 'Show call and caller relations',
        'gr.family.hint.dependency': 'Show imports, external deps and inheritance',
        'gr.family.hint.structure': 'Show containment and method ownership; closer to a call graph when off',
        'gr.family.hint.hierarchy': 'Show inheritance and implementation',
        'gr.family.hint.meaning': 'Show docstring and comment rationale nodes',
        'gr.family.hint.other': 'Show remaining relations',

        /* ---- legend / communities -------------------------------------- */
        'gr.legend.title': 'Communities',
        'gr.legend.empty': 'No communities yet.',
        'gr.legend.hint': 'Colour marks a community; click a community to focus and centre its members, click a node to see its callers and calls. Double-click to open the code.',
        'gr.legend.hintNotes': 'Colour marks a community; click a community to focus and centre its members, click a note to see its topics and similar notes. Double-click to open the note.',

        /* ---- inspector ------------------------------------------------- */
        'gr.inspector.idle': 'Pick a node in the graph to see its callers, calls and rationale.',
        'gr.inspector.back': 'All communities',
        'gr.rail.show': 'Details',
        'gr.rail.hide': 'Hide details',
        'gr.inspector.open': 'Open code',
        'gr.inspector.ask': 'Ask about this',
        'gr.inspector.neighbours': '{count} neighbours',
        'gr.inspector.noRelations': 'This node has no direct relations.',
        'gr.inspector.signature': 'Signature',
        'gr.inspector.siblings': 'Other declarations in this file',

        /* ---- relation groups ------------------------------------------- */
        'gr.group.callers': 'Callers',
        'gr.group.calls': 'Calls',
        'gr.group.dependencies': 'Dependencies',
        'gr.group.structure': 'Structure',
        'gr.group.meaning': 'Explains',
        'gr.group.hierarchy': 'Extends',
        'gr.group.related': 'Related',
        'gr.rows.more': '{count} more relations; use search to narrow down.',

        /* ---- canvas ---------------------------------------------------- */
        'gr.canvas.hint': 'Wheel zooms · drag pans · click inspects · double-click opens code',
        'gr.canvas.hintNotes': 'Wheel zooms · drag pans · click inspects · double-click opens the note',
        'gr.canvas.laying': 'Laying out the graph…',
        'gr.canvas.loading': 'Loading graph…',
        'gr.canvas.error': 'Could not load the graph',
        'gr.canvas.emptyTitle': 'No code graph yet',
        'gr.canvas.emptyBody': 'Nothing in this workspace could be indexed. Try rebuilding.',
        'gr.canvas.emptyFiltered': 'No nodes are visible under the current filters.',
        'gr.tool.fit': 'Fit to canvas',
        'gr.tool.zoomIn': 'Zoom in',
        'gr.tool.zoomOut': 'Zoom out',
        'gr.truncated': 'Graph truncated: drawing {shown} of {total} nodes',

        /* ---- scope banner ---------------------------------------------- */
        'gr.scope.session': 'Session-related nodes',
        'gr.scope.all': 'Whole graph: no locatable node for this session; showing the workspace.',

        /* ---- search ----------------------------------------------------- */
        'gr.search.placeholder': 'Find a function / file / community',
        'gr.search.placeholderNotes': 'Find a note / topic / community',
        'gr.search.empty': 'No matching node.',
      },
    };

    /* ================================================================ *
     * graph/style.js
     * ================================================================ */
    /**
     * Styles for the CodeSlice graph view (Agent C, §2.2).
     *
     * Chrome colours go through the host semantic tokens (`--dsw-alias-*`) and
     * `color-mix`; the Tableau-10 data colours live in `theme.js` and are applied
     * inline, which is the one colour exception the contract allows.
     *
     * E concatenates this into the sheet: `fullCss() + GRAPH_CSS + WORKBENCH_CSS`.
     */

    const GRAPH_CSS = `
    .gr-view {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      /* The conversation pane is resized independently of the window (opening the
       * reader narrows it), so the narrow layout must key off this box, not the
       * viewport — the desktop reference declares container-type: inline-size for
       * the same reason. */
      container-type: inline-size;
      container-name: gr;
      overflow: hidden;
    }

    /* ---- header: stats + family switch bar ----------------------------- */

    .gr-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }

    .gr-stats {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: var(--dsw-alias-label-secondary);
    }

    .gr-stat b {
      color: var(--dsw-alias-label-primary);
      font-weight: 600;
      margin-right: 3px;
    }

    .gr-family-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }

    .gr-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: transparent;
      color: var(--dsw-alias-label-secondary);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .gr-chip:hover {
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-primary);
    }

    .gr-chip[aria-pressed="true"] {
      border-color: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    }

    .gr-swatch {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--dsw-alias-brand-primary);
      flex: 0 0 auto;
    }

    .gr-banner-all {
      flex-basis: 100%;
      padding: 4px 8px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
      color: var(--dsw-alias-state-warn-primary);
      font-size: 12px;
    }

    /* ---- body: stage + rail -------------------------------------------- */

    .gr-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 332px;
      min-height: 0;
      flex: 1 1 auto;
    }

    /* Project canvas: the stage takes the whole main panel; the inspector is a
       drawer toggled by a single button, so 1k-node graphs are not squeezed into
       a 600 px column beside a permanently docked rail. */
    .gr-body-collapsible {
      position: relative;
      grid-template-columns: minmax(0, 1fr);
    }

    .gr-body-collapsible > .gr-rail {
      display: none;
    }

    .gr-rail-toggle {
      position: absolute;
      top: 9px;
      right: 44px; /* leave the stage's own fit / zoom toolbar at right:10px */
      z-index: 9;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 27px;
      padding: 0 10px;
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 6px;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font-size: 11.5px;
      cursor: pointer;
    }

    .gr-rail-toggle:hover {
      border-color: var(--dsw-alias-brand-primary);
    }

    .gr-body-collapsible > .gr-rail-drawer {
      display: flex;
      position: absolute;
      top: 44px;
      right: 8px;
      bottom: 8px;
      z-index: 8;
      width: 332px;
      max-width: calc(100% - 16px);
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 8px;
      background: var(--dsw-alias-bg-base);
      box-shadow: var(--dsw-alias-shadow-l2, 0 8px 24px rgba(0, 0, 0, .18));
      overflow: hidden;
    }

    .gr-body-collapsible > .gr-rail-drawer[hidden] {
      display: none;
    }

    @container gr (max-width: 760px) {
      .gr-body {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) minmax(0, 46%);
      }
      /* The drawer variant has no second column/row to give a share to: its rail
         is display:none until 详情 opens it as an overlay. Leaving the 46% row in
         place made the stage 206px tall even when the canvas had the full pane. */
      .gr-body-collapsible {
        grid-template-rows: minmax(0, 1fr);
      }
    }

    /* ---- canvas stage ---------------------------------------------------- */

    .gr-stage {
      position: relative;
      min-height: 0;
      min-width: 0;
    }

    .gr-stage-host {
      position: absolute;
      inset: 0;
    }

    .gr-stage-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 16px;
      color: var(--dsw-alias-label-secondary);
      font-size: 12.5px;
      text-align: center;
      pointer-events: none;
    }

    .gr-stage-empty b {
      color: var(--dsw-alias-label-primary);
    }

    .gr-stage-pill {
      position: absolute;
      left: 50%;
      bottom: 14px;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 14px;
      background: var(--dsw-alias-bg-layer-1);
      border: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
      font-size: 12px;
    }

    .gr-spin {
      width: 11px;
      height: 11px;
      border: 1.5px solid var(--dsw-alias-border-l2);
      border-top-color: var(--dsw-alias-brand-primary);
      border-radius: 50%;
      animation: gr-rotate 0.9s linear infinite;
      display: inline-block;
    }

    @keyframes gr-rotate {
      to { transform: rotate(360deg); }
    }

    .gr-stage-tools {
      position: absolute;
      right: 10px;
      top: 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .gr-iconbtn {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-secondary);
      cursor: pointer;
      font-size: 14px;
    }

    .gr-iconbtn:hover {
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
    }

    .gr-stage-hint {
      position: absolute;
      left: 10px;
      bottom: 8px;
      color: var(--dsw-alias-label-secondary);
      font-size: 11px;
      pointer-events: none;
    }

    /* ---- rail ------------------------------------------------------------ */

    .gr-rail {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow-y: auto;
      border-left: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-base);
    }

    @container gr (max-width: 760px) {
      .gr-rail {
        border-left: none;
        border-top: 1px solid var(--dsw-alias-border-l1);
      }
    }

    .gr-rail-search {
      padding: 8px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }

    .gr-input {
      width: 100%;
      padding: 5px 8px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12.5px;
    }

    .gr-input::placeholder {
      color: var(--dsw-alias-label-secondary);
    }

    .gr-rail-scroll {
      overflow-y: auto;
      min-height: 0;
      flex: 1 1 auto;
      padding: 8px 10px;
    }

    /* ---- legend: community list ----------------------------------------- */

    .gr-legend-head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--dsw-alias-label-secondary);
      margin-bottom: 6px;
    }

    .gr-legend-head .gr-grow { flex: 1 1 auto; }

    .gr-comm-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .gr-comm {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 4px 5px;
      border: 1px solid #171717;
      border-radius: 6px;
      background: #fff;
      color: #171717;
      cursor: pointer;
      font-size: 12.5px;
    }

    .gr-comm:hover { background: #f3f4f6; }

    /* Selected community is a solid blue pill: the old 10% brand tint was almost
       invisible against the rail's own surface, so "which community is filtered"
       could not be read without comparing two rows side by side. Unselected rows
       are deliberately white with a black hairline, matching the DSH chrome. */
    .gr-comm[aria-pressed="true"] {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
      box-shadow: 0 1px 4px rgba(37, 99, 235, .28);
    }
    .gr-comm[aria-pressed="true"] .gr-comm-label { font-weight: 600; }
    .gr-comm[aria-pressed="true"] .gr-count { color: rgba(255, 255, 255, .82); }
    .gr-comm[aria-pressed="true"]:hover { background: #1d4ed8; border-color: #1d4ed8; }

    .gr-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: 0 0 auto;
    }

    .gr-comm-label {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gr-count {
      color: var(--dsw-alias-label-secondary);
      font-size: 11.5px;
    }

    .gr-legend-hint {
      margin-top: 8px;
      color: var(--dsw-alias-label-secondary);
      font-size: 11.5px;
      line-height: 1.5;
    }

    /* ---- inspector ------------------------------------------------------- */

    .gr-detail-back {
      margin-bottom: 6px;
    }

    .gr-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: transparent;
      color: var(--dsw-alias-label-secondary);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .gr-btn:hover {
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-primary);
    }

    .gr-btn-primary {
      border-color: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    }

    .gr-detail-head {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 8px;
    }

    .gr-detail-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .gr-kind {
      padding: 1px 7px;
      border-radius: 5px;
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-secondary);
      font-size: 11px;
    }

    .gr-kind-note {
      color: var(--dsw-alias-label-secondary);
      font-size: 11.5px;
    }

    .gr-detail-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gr-detail-meta {
      color: var(--dsw-alias-label-secondary);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gr-detail-acts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 6px 0;
    }

    .gr-rationale {
      padding: 5px 8px;
      border-left: 2px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    /* ---- relation groups -------------------------------------------------- */

    .gr-rel-group {
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      margin-bottom: 6px;
      background: var(--dsw-alias-bg-base);
    }

    .gr-rel-group > summary {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12.5px;
      list-style: none;
    }

    .gr-rel-group > summary::-webkit-details-marker { display: none; }

    .gr-rel-group > summary .gr-grow { flex: 1 1 auto; }

    .gr-rel-count {
      color: var(--dsw-alias-label-secondary);
      font-size: 11.5px;
    }

    .gr-rel-list {
      display: flex;
      flex-direction: column;
      padding: 2px 6px 6px;
    }

    /* Rows are buttons, so the reset has to be explicit: without it the host's
       default button chrome turns every declaration into a raised grey card. DSH
       lists are flat white rows separated by a hairline. */
    .gr-rel-row {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 6px;
      border: none;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      border-radius: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12.5px;
      text-align: left;
      cursor: pointer;
    }

    .gr-rel-row:last-child { border-bottom: none; }

    .gr-rel-row:hover { background: var(--dsw-alias-bg-layer-1); }

    .gr-rel-row:hover .gr-rel-label { color: var(--dsw-alias-label-primary); }

    .gr-dir {
      color: var(--dsw-alias-label-secondary);
      flex: 0 0 auto;
    }

    .gr-rel-label {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gr-rel-kind {
      color: var(--dsw-alias-label-secondary);
      font-size: 11px;
      flex: 0 0 auto;
    }

    .gr-rel-loc {
      color: var(--dsw-alias-label-secondary);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 40%;
    }

    .gr-rel-open {
      flex: 0 0 auto;
      color: var(--dsw-alias-label-secondary);
    }

    .gr-rel-relation {
      flex: 0 0 auto;
      font-size: 11px;
    }

    .gr-group-more {
      padding: 6px 8px;
      color: var(--dsw-alias-label-secondary);
      font-size: 11.5px;
    }

    .gr-empty-line {
      padding: 10px 8px;
      color: var(--dsw-alias-label-secondary);
      font-size: 12px;
    }

    /* ---- search results ---------------------------------------------------- */

    .gr-results {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .gr-result {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 6px 8px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12.5px;
      cursor: pointer;
      text-align: left;
    }

    .gr-result:hover { background: var(--dsw-alias-bg-layer-1); }

    .gr-result-label {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gr-result-kind {
      color: var(--dsw-alias-label-secondary);
      font-size: 11px;
    }

    /* ---- shared bits -------------------------------------------------------- */

    .gr-col { display: flex; flex-direction: column; gap: 4px; }
    .gr-row { display: flex; align-items: center; gap: 6px; }
    .gr-grow { flex: 1 1 auto; }
    .gr-muted { color: var(--dsw-alias-label-secondary); }
    .gr-mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
    .gr-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;

    /* ================================================================ *
     * graph/view.js
     * ================================================================ */
    /**
     * Code graph view for the conversation session (Agent C, §2.2).
     *
     * This is the single integration point the session view registers beside
     * 对话 / 轨迹: a left vis-network stage and a right inspector rail. Behaviour
     * is aligned with the desktop reference `GraphView.tsx`:
     *
     * - Header stats recompute from the filtered projection, never the raw payload.
     * - Family chips toggle relation families locally; hidden rows stay in the
     *   DataSet so toggling back cannot restart the layout.
     * - The rail is one mode at a time: search results → node inspector → community
     *   legend.
     * - `focusRequest` lands here from the conversation: resolve the node by id or
     *   path, select it and centre the camera.
     * - A node opened (double-click / inspector button) hands `{path, startLine,
     *   endLine, nodeId, label}` to `props.onOpenFile`, which opens the reader.
     * - When `sessionId` is present the stage first asks for session-related nodes;
     *   if the host returns none, the whole workspace is shown behind a banner so
     *   the canvas is never blank.
     */














    /** Rows per relation group before the rail tells the reader how many it hid. */
    const GRAPH_MAX_ROWS = 60;

    /** Fingerprint a topology from its ids, for the coordinate cache key. */
    function grTopologyKey(payload) {
      let hash = 2166136261;
      const mix = (text) => {
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
      };
      for (const node of payload?.nodes ?? []) mix(String(node.id));
      for (const edge of payload?.edges ?? payload?.links ?? []) {
        mix(String(edge.source));
        mix('\u0001');
        mix(String(edge.target));
      }
      return `${(payload?.nodes ?? []).length}:${(payload?.edges ?? payload?.links ?? []).length}:${hash >>> 0}`;
    }

    /**
     * The graph session view.
     *
     * @param {object} props
     * @param {object} props.ctx - client context.
     * @param {{cwd?:string, sessionId?:string}} [props.scope]
     * @param {boolean} [props.visible] - `false` means parked-but-mounted.
     * @param {{path?:string,nodeId?:string,startLine?:number,endLine?:number,nonce?:number}} [props.focusRequest]
     * @param {(target:{path:string,startLine?:number,endLine?:number,nodeId:string,label:string})=>void} [props.onOpenFile]
     * @param {(node:object)=>void} [props.onAsk]
     * @param {boolean} [props.railCollapsible] - hide the inspector rail behind a
     *   toggle; used by the workbench project canvas so the graph gets the full
     *   main-panel width instead of a permanently docked rail.
     * @param {(key:string,vars?:object)=>string} props.t
     * @param {string} props.locale
     * @returns {object} the view element.
     */
    function GraphView(props) {
      const {
        ctx, scope, visible, focusRequest, onOpenFile, onAsk, t, locale, railCollapsible,
        loader, persistLayout, showFamilies, fetchDetail, relationScope, onActivateNode,
      } = props;

      const keepLayout = persistLayout !== false;
      const chips = showFamilies !== false;
      const wantDetail = fetchDetail !== false;
      const groupsScope = relationScope === 'notes' ? 'notes' : 'code';

      const parked = visible === false;
      const railToggle = railCollapsible === true;
      const [railOpen, setRailOpen] = useState(false);

      // A `conversation.view` registration receives shell props only — there is no
      // `scope` on them. Without resolving the session's own directory the request
      // carries no `cwd`, and the Host falls back to
      // `workingDirectory.defaultDirectory`: the canvas then draws the harness
      // profile (package.json / pnpm-workspace.yaml, ~40 nodes) instead of the
      // project the conversation belongs to (~900 nodes). Resolve it here so the
      // graph, its cached layout and every node lookup share one root.
      //
      // The shell's own path lookup (`sessionFilePath` in ui-conversation) reads
      // `sessions.binding(id).session.projections.faceOf('workingDirectory')` and
      // falls back to `sessions.list.byId[id].cwd`; `workspace-resolve.js` already
      // joins the workspace model on the session id for the composer bar, so this
      // view uses the same two sources rather than inventing a third.
      const cwd = useMemo(() => {
        if (scope && typeof scope.cwd === 'string' && scope.cwd !== '') return scope.cwd;
        const id = props.sessionId ?? (scope && typeof scope.sessionId === 'string' ? scope.sessionId : undefined);
        if (typeof id !== 'string' || id === '') return undefined;
        try {
          const sessions = typeof ctx?.get === 'function' ? ctx.get('sessions') : undefined;
          if (sessions !== undefined && sessions !== null) {
            const binding = typeof sessions.binding === 'function' ? sessions.binding(id) : undefined;
            const live = binding?.session?.projections?.faceOf?.('workingDirectory')?.getSnapshot?.();
            if (typeof live === 'string' && live !== '') return live;
            const listed = sessions.list?.getSnapshot?.()?.byId?.[id]?.cwd;
            if (typeof listed === 'string' && listed !== '') return listed;
          }
        } catch {
          // fall through to the workspace model
        }
        return resolveWorkspace(ctx, { sessionId: id });
      }, [ctx, scope, props.sessionId]);

      const sessionId = props.sessionId ?? (scope && typeof scope.sessionId === 'string' ? scope.sessionId : undefined);
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const [payload, setPayload] = useState(undefined);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(undefined);
      const [relatedEmpty, setRelatedEmpty] = useState(false);
      // A graph with no relation chips (the notes graph) must not gate its edges on
      // the code-graph default families: every family is visible when nothing can be
      // toggled.
      const [filters, setFilters] = useState(() => (chips && groupsScope !== 'notes'
        ? grDefaultFilters()
        : { families: new Set(GRAPH_FAMILY_LIST), hiddenCommunities: new Set() }));
      const [selectedId, setSelectedId] = useState(undefined);
      const [detail, setDetail] = useState(undefined);
      const [detailError, setDetailError] = useState(undefined);
      const [focus, setFocus] = useState(null);
      const [query, setQuery] = useState('');
      const [activeCommunity, setActiveCommunity] = useState(undefined);
      const [layoutKey, setLayoutKey] = useState('');
      const [initialPositions, setInitialPositions] = useState(undefined);

      const requests = useRef(undefined);
      const alive = useRef(true);
      const familiesRef = useRef(filters.families);
      familiesRef.current = filters.families;
      const focusNonce = useRef(0);
      const appliedFocusNonce = useRef(undefined);
      const controllerRef = useRef(undefined);
      // The workbench passes an inline loader; keeping it in a ref means a parent
      // re-render cannot restart the fetch (and the camera) every time.
      const loaderRef = useRef(loader);
      loaderRef.current = loader;

      useEffect(() => {
        alive.current = true;
        const scopeHandle = makeRequestScope();
        requests.current = scopeHandle;
        return () => {
          alive.current = false;
          scopeHandle.dispose();
          requests.current = undefined;
        };
      }, []);

      /* ---- data load: mount, resume from parking, explicit revision ------ */

      const load = useCallback(async () => {
        const scopeHandle = requests.current;
        if (scopeHandle === undefined) return;
        setLoading(true);
        setError(undefined);
        try {
          let value;
          if (typeof loaderRef.current === 'function') {
            value = await scopeHandle.run((signal) => loaderRef.current(call, signal));
          } else if (sessionId !== undefined && sessionId !== '') {
            value = await scopeHandle.run((signal) => call('graph', {
              sessionId, related: sessionId, families: [...familiesRef.current],
            }, signal));
            if (value !== undefined && (!Array.isArray(value.nodes) || value.nodes.length === 0)) {
              setRelatedEmpty(true);
              value = await scopeHandle.run((signal) => call('graph', {
                families: [...familiesRef.current],
              }, signal));
            } else {
              setRelatedEmpty(false);
            }
          } else {
            value = await scopeHandle.run((signal) => call('graph', {
              families: [...familiesRef.current],
            }, signal));
          }
          if (!alive.current || value === undefined) return;
          setPayload(value);
          const key = typeof value.topologyKey === 'string' && value.topologyKey !== ''
            ? value.topologyKey
            : grTopologyKey(value);
          setLayoutKey(key);
          // The notes graph has its own topology and no layout store entry; asking
          // for one would only add a round-trip and a stale-coordinate risk.
          if (!keepLayout) {
            setInitialPositions(undefined);
            return;
          }
          const layout = await scopeHandle.run((signal) => call('layout', { key }, signal));
          if (alive.current && layout !== undefined && layout.positions !== undefined) {
            setInitialPositions(layout.positions);
          }
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setLoading(false);
        }
      }, [call, sessionId, keepLayout]);

      useEffect(() => {
        if (parked) return undefined;
        void load();
        return undefined;
      }, [parked, load]);

      // Parking cancels in-flight work but keeps the scope usable on resume.
      useEffect(() => {
        if (parked) requests.current?.abort();
      }, [parked]);

      /* ---- derived graph model ------------------------------------------ */

      const byId = useMemo(() => new Map(
        (payload?.nodes ?? []).map((node) => [node.id, node]),
      ), [payload]);

      const view = useMemo(
        () => grFilterGraph(payload ?? { nodes: [], edges: [] }, filters),
        [payload, filters],
      );

      const visibleNodeCount = useMemo(() => grVisibleCount(view.nodes), [view.nodes]);
      const visibleEdgeCount = useMemo(() => grVisibleCount(view.edges), [view.edges]);

      const communities = useMemo(() => {
        const map = new Map();
        for (const node of view.nodes) {
          if (node.hidden) continue;
          const cid = Number(node.community ?? 0);
          const entry = map.get(cid) ?? { id: cid, label: node.communityLabel || `#${cid}`, size: 0 };
          entry.size += 1;
          map.set(cid, entry);
        }
        return [...map.values()].sort((a, b) => b.size - a.size || a.id - b.id);
      }, [view.nodes]);

      /* ---- selection ----------------------------------------------------- */

      const choose = useCallback((id, zoom = true) => {
        const node = byId.get(id);
        if (node === undefined) return;
        setFilters((current) => {
          const families = new Set(current.families);
          if (node.kind === 'rationale') families.add('meaning');
          if (node.kind === 'external') families.add('dependency');
          const hiddenCommunities = new Set(current.hiddenCommunities);
          hiddenCommunities.delete(Number(node.community ?? 0));
          return { families, hiddenCommunities };
        });
        setSelectedId(id);
        setQuery('');
        setActiveCommunity(undefined);
        if (zoom) setFocus({ id, nonce: ++focusNonce.current });
        else setFocus(null);
      }, [byId]);

      const handleSelect = useCallback((id) => {
        if (id === null || id === undefined) {
          setSelectedId(undefined);
          setActiveCommunity(undefined);
          setFocus(null);
          return;
        }
        choose(id, false);
      }, [choose]);

      const openNode = useCallback((node) => {
        if (node === undefined || node === null) return;
        // A notes-graph node is not a code location; the workbench decides what
        // activation means (open the note, or nothing for a topic label).
        if (typeof onActivateNode === 'function') {
          onActivateNode(node);
          return;
        }
        const path = typeof node.path === 'string' ? node.path : '';
        if (path === '') return;
        onOpenFile?.({
          path,
          startLine: node.line ?? node.start_line,
          endLine: node.endLine ?? node.end_line,
          nodeId: node.id,
          label: node.label,
        });
      }, [onOpenFile, onActivateNode]);

      const handleActivate = useCallback((id) => {
        const node = byId.get(id);
        if (node !== undefined) openNode(node);
      }, [byId, openNode]);

      /* ---- inspector detail --------------------------------------------- */

      useEffect(() => {
        if (!wantDetail || parked || selectedId === undefined || selectedId === null) {
          setDetail(undefined);
          setDetailError(undefined);
          return undefined;
        }
        let cancelled = false;
        (async () => {
          try {
            const value = await call('node', { id: selectedId });
            if (!cancelled) {
              setDetail(value);
              setDetailError(undefined);
            }
          } catch (caught) {
            if (cancelled) return;
            setDetail(undefined);
            setDetailError(caught && caught.message ? caught.message : String(caught));
          }
        })();
        return () => { cancelled = true; };
      }, [selectedId, call, parked, wantDetail]);

      /* ---- conversation → graph focus landing --------------------------- */

      useEffect(() => {
        const fr = focusRequest;
        if (fr === undefined || fr === null) return;
        if (appliedFocusNonce.current === fr.nonce) return;
        if (payload === undefined) return;
        let target = fr.nodeId !== undefined && fr.nodeId !== null
          ? byId.get(String(fr.nodeId))
          : undefined;
        if (target === undefined && typeof fr.path === 'string' && fr.path !== '') {
          target = (payload.nodes ?? []).find((node) => node.path === fr.path);
        }
        if (target !== undefined) {
          appliedFocusNonce.current = fr.nonce;
          choose(target.id, true);
        }
      }, [focusRequest, payload, byId, choose]);

      /* ---- filters -------------------------------------------------------- */

      const toggleFamily = useCallback((family) => {
        setFilters((current) => {
          const families = new Set(current.families);
          if (families.has(family)) families.delete(family);
          else families.add(family);
          return { ...current, families };
        });
      }, []);

      const toggleCommunityHighlight = useCallback((cid) => {
        if (activeCommunity === cid) {
          setActiveCommunity(undefined);
          setSelectedId(undefined);
          setFocus(null);
          return;
        }
        const members = view.nodes.filter((node) => !node.hidden
          && Number(node.community ?? 0) === cid);
        // The row is a region summary, but the canvas needs one concrete anchor for
        // the same white-ring focus a node click gets. Pick the community's most
        // connected member; it is usually the file that names the community in the
        // legend (`pages.js +28`, `api-chat.js +6`, …).
        const hub = members.reduce((best, node) => {
          if (best === undefined) return node;
          const a = Number(node.degree ?? node.memberCount ?? 0);
          const b = Number(best.degree ?? best.memberCount ?? 0);
          if (a > b) return node;
          if (a === b && String(node.label) < String(best.label)) return node;
          return best;
        }, undefined);
        setSelectedId(undefined);
        setActiveCommunity(cid);
        // Match a node click exactly: centre the community's hub with the same
        // `focusScale`, instead of fitting all 131 members. Fitting the region left
        // the hub's selection ring too small to read at the resulting zoom.
        setFocus(hub === undefined
          ? null
          : { id: hub.id, hubId: hub.id, nonce: ++focusNonce.current });
        // The drawer covers almost the whole 394px stage. Leaving it open after a
        // community click hides both the camera move and the hub ring, so collapse
        // it; `详情` reopens the list and the selected row is still blue.
        if (railToggle && railOpen) setRailOpen(false);
      }, [activeCommunity, view.nodes, railOpen, railToggle]);

      const handleSettled = useCallback((positions) => {
        if (layoutKey === '' || !keepLayout) return;
        call('layout', { key: layoutKey, positions }).catch(() => {
          /* layout persistence is best effort; the in-memory cache still works */
        });
      }, [call, layoutKey, keepLayout]);

      /* ---- search results ------------------------------------------------- */

      const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return [];
        return (payload?.nodes ?? []).filter((node) => [
          node.label, node.path ?? '', node.communityLabel ?? '',
        ].join(' ').toLowerCase().includes(needle)).slice(0, 30);
      }, [query, payload]);

      /* ---- inspector groups: host grouping first, local fallback ---------- */

      const selected = selectedId !== undefined && selectedId !== null ? byId.get(selectedId) ?? null : null;

      const inspectorGroups = useMemo(() => {
        if (selected === null) return [];
        if (Array.isArray(detail?.groups) && detail.groups.length > 0) return detail.groups;
        const raw = grRelationGroups(selected.id, payload?.links ?? payload?.edges ?? [], byId, groupsScope);
        return raw.map((group) => ({
          key: group.key,
          label: group.label,
          items: group.items.map((connection) => ({
            id: connection.other.id,
            label: connection.other.label,
            kind: connection.other.kind,
            path: connection.other.path,
            line: connection.other.line ?? connection.other.start_line,
            relation: connection.edge.relation,
            confidence: connection.edge.confidence,
            outgoing: connection.outgoing,
          })),
        }));
      }, [selected, detail, payload, byId, groupsScope]);

      const detailNode = detail?.node ?? selected;

      /* ---- height: the shell's view area is content-sized ------------------ */

      // `conversation.session` mounts this view in a `flex: 1 0 auto` area whose
      // height is whatever its children measure. The inspector's community list
      // therefore stretched the view to 5424px on a 609px pane and vis fitted the
      // graph into that strip (small dots, huge gaps, labels stacked). Pin the
      // height to the nearest scrolling ancestor — the conversation scroll body —
      // and keep it in sync when the sidebar opens or closes.
      const rootRef = useRef(undefined);
      useLayoutEffect(() => {
        const node = rootRef.current;
        if (node === undefined || node === null || typeof window === 'undefined') return undefined;
        let scroller = node.parentElement;
        while (scroller !== null && scroller !== undefined && scroller !== window.document.body) {
          const overflowY = window.getComputedStyle(scroller).overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.clientHeight > 0) break;
          scroller = scroller.parentElement;
        }
        if (scroller === null || scroller === undefined || scroller === window.document.body) return undefined;
        // The composer is sticky inside the same scroll body and paints over the
        // bottom of this view (the CodeSlice chip and the input box). Reserve its
        // height, otherwise the community list ends up underneath the input.
        const seatOf = () => {
          const seat = scroller.querySelector('[class*="_composerSeat"]');
          if (seat === null || seat === undefined) return 0;
          return Math.max(0, Math.round(seat.getBoundingClientRect().height));
        };
        const apply = () => {
          const height = scroller.clientHeight - seatOf();
          if (height > 0) node.style.height = `${height}px`;
        };
        apply();
        if (typeof window.ResizeObserver !== 'function') return undefined;
        const observer = new window.ResizeObserver(apply);
        observer.observe(scroller);
        const seat = scroller.querySelector('[class*="_composerSeat"]');
        if (seat !== null && seat !== undefined) observer.observe(seat);
        return () => observer.disconnect();
      }, []);

      /* ---- render ---------------------------------------------------------- */

      // Only the families this payload actually contains get a chip. The notes graph
      // has structure (mention/co-occurrence) and meaning (similarity) but no calls,
      // so offering a 「调用」 switch would be a lie.
      const chipFamilies = chips
        ? GRAPH_CHIP_FAMILIES.filter((family) => (payload?.links ?? payload?.edges ?? [])
          .some((edge) => String(edge.family ?? grRelationFamily(edge.relation)) === family))
        : [];

      const statRow = (label, count) => h('span', { className: 'gr-stat' },
        h('b', null, formatInt(count, locale)),
        h('span', null, label));

      return h('div', { className: 'gr-view', ref: rootRef },
        h('div', { className: 'gr-head' },
          h('div', { className: 'gr-stats', 'data-cs': 'graph-stats' },
            statRow(t('gr.stats.nodes'), visibleNodeCount),
            statRow(t('gr.stats.edges'), visibleEdgeCount),
            statRow(t('gr.stats.communities'), communities.length)),
          chipFamilies.length > 0
            ? h('div', { className: 'gr-family-bar', 'data-cs': 'graph-families' },
              chipFamilies.map((family) => h('button', {
                key: family,
                type: 'button',
                className: 'gr-chip',
                'aria-pressed': filters.families.has(family) ? 'true' : 'false',
                title: t(`gr.family.hint.${family}`),
                onClick: () => toggleFamily(family),
              },
                h('span', { className: 'gr-swatch' }),
                h('span', null, t(`gr.family.${family}`)))))
            : null),

        relatedEmpty
          ? h('div', { className: 'gr-banner-all' }, t('gr.scope.all'))
          : null,

        h('div', { className: `gr-body${railToggle ? ' gr-body-collapsible' : ''}` },
          h(GraphStage, {
            ctx,
            nodes: view.nodes,
            edges: view.edges,
            selectedId,
            focus,
            layoutKey,
            initialPositions,
            activeCommunity,
            visible,
            fitPad: groupsScope === 'notes' ? { x: 150, y: 200, maxScale: 1.6 } : undefined,
            nodeScale: groupsScope === 'notes' ? 0.55 : undefined,
            hintKey: groupsScope === 'notes' ? 'gr.canvas.hintNotes' : undefined,
            onSelect: handleSelect,
            onActivate: handleActivate,
            onSettled: handleSettled,
            controllerRef,
            t,
            locale,
          }),

          railToggle
            ? h('button', {
              type: 'button',
              className: 'gr-rail-toggle',
              'aria-expanded': railOpen ? 'true' : 'false',
              onClick: () => setRailOpen((open) => !open),
            }, railOpen ? t('gr.rail.hide') : t('gr.rail.show'))
            : null,

          h('aside', {
            className: `gr-rail${railToggle ? ' gr-rail-drawer' : ''}`,
            'data-cs': 'graph-inspector',
            hidden: railToggle && !railOpen,
          },
            h('div', { className: 'gr-rail-search' },
              h('input', {
                className: 'gr-input',
                value: query,
                placeholder: t(groupsScope === 'notes' ? 'gr.search.placeholderNotes' : 'gr.search.placeholder'),
                'aria-label': t(groupsScope === 'notes' ? 'gr.search.placeholderNotes' : 'gr.search.placeholder'),
                onChange: (event) => setQuery(event.target.value),
              })),

            query.trim() !== ''
              ? h('div', { className: 'gr-rail-scroll gr-results' },
                matches.length === 0
                  ? h('p', { className: 'gr-empty-line' }, t('gr.search.empty'))
                  : matches.map((node) => h('button', {
                    key: node.id,
                    type: 'button',
                    className: 'gr-result',
                    'aria-pressed': selectedId === node.id ? 'true' : 'false',
                    title: node.path ?? '',
                    onClick: () => choose(node.id),
                  },
                    h('span', { className: 'gr-dot', style: { background: grCommunityColor(node.community) } }),
                    h('span', { className: 'gr-result-label' }, node.label),
                    h('span', { className: 'gr-result-kind' }, grKindLabel(node.kind, locale)))))
              : detailNode !== null
                ? h(GrInspector, {
                  node: detailNode,
                  groups: inspectorGroups,
                  rationale: detail?.rationale ?? [],
                  siblings: detail?.siblings ?? [],
                  detailError,
                  onBack: () => { setSelectedId(undefined); setFocus(null); },
                  onSelect: choose,
                  onOpen: openNode,
                  onAsk: onAsk !== undefined ? () => onAsk(detailNode) : undefined,
                  t,
                  locale,
                })
                : h(GraphLegend, {
                  communities,
                  activeCommunity,
                  onToggle: toggleCommunityHighlight,
                  t,
                  locale,
                  scope: groupsScope,
                }))));
    }

    /* ---- legend: community list ------------------------------------------- */

    /**
     * One row per community: colour dot, label, size. Clicking a row focuses the
     * whole community on the canvas (members stay opaque, the rest dim), fits the
     * camera to its region, and puts the same white selection ring on its most
     * connected member; clicking again clears everything.
     */
    function GraphLegend(props) {
      const { communities, activeCommunity, onToggle, t, locale, scope = 'code' } = props;
      return h('section', { className: 'gr-rail-scroll', 'data-cs': 'graph-legend' },
        h('div', { className: 'gr-legend-head' },
          h('span', { className: 'gr-grow' }, t('gr.legend.title')),
          h('span', { className: 'gr-muted' }, formatInt(communities.length, locale))),
        communities.length === 0
          ? h('p', { className: 'gr-empty-line' }, t('gr.legend.empty'))
          : h('div', { className: 'gr-comm-list' },
            communities.map((community) => h('button', {
              key: community.id,
              type: 'button',
              className: 'gr-comm',
              'aria-pressed': activeCommunity === community.id ? 'true' : 'false',
              onClick: () => onToggle(community.id),
            },
              h('span', { className: 'gr-dot', style: { background: grCommunityColor(community.id) } }),
              h('span', { className: 'gr-comm-label' }, community.label),
              h('span', { className: 'gr-count' }, formatInt(community.size, locale))))),
        h('p', { className: 'gr-legend-hint' }, t(scope === 'notes' ? 'gr.legend.hintNotes' : 'gr.legend.hint')));
    }

    /* ---- inspector --------------------------------------------------------- */

    /**
     * Selected node detail: kind pill, community tag, name, location/degree,
     * action buttons, rationale rows, relation groups and same-file siblings.
     */
    function GrInspector(props) {
      const {
        node, groups, rationale, siblings, detailError,
        onBack, onSelect, onOpen, onAsk, t, locale,
      } = props;

      const location = node.path === undefined || node.path === ''
        ? ''
        : `${node.path}:${node.line ?? node.start_line ?? ''}`;
      const neighbourCount = Number(node.degree ?? node.memberCount ?? 0);
      const hasCalls = groups.some((group) => group.key === 'callers' || group.key === 'calls');

      return h('section', { className: 'gr-rail-scroll' },
        h('div', { className: 'gr-detail-back' },
          h('button', { type: 'button', className: 'gr-btn', onClick: onBack },
            '‹ ', t('gr.inspector.back'))),

        h('div', { className: 'gr-detail-head' },
          h('div', { className: 'gr-detail-row' },
            h('span', { className: 'gr-kind' }, grKindLabel(node.kind, locale)),
            node.communityLabel
              ? h('span', { className: 'gr-kind-note' }, node.communityLabel)
              : null,
            h('span', { className: 'gr-grow' })),
          h('h2', { className: 'gr-detail-title', title: node.label }, node.label),
          h('p', { className: 'gr-detail-meta gr-mono gr-ellipsis', title: location },
            location === '' ? (node.noteId !== undefined ? grKindLabel('note', locale) : t('common.none')) : location,
            ' · ',
            t('gr.inspector.neighbours', { count: formatInt(neighbourCount, locale) }))),

        node.signature
          ? h('p', { className: 'gr-detail-meta gr-mono gr-ellipsis', title: node.signature },
            t('gr.inspector.signature'), '：', node.signature)
          : null,

        h('div', { className: 'gr-detail-acts' },
          onAsk !== undefined
            ? h('button', { type: 'button', className: 'gr-btn', onClick: onAsk },
              t('gr.inspector.ask'))
            : null,
          (node.path !== undefined && node.path !== '') || node.noteId !== undefined
            ? h('button', { type: 'button', className: 'gr-btn gr-btn-primary', onClick: () => onOpen(node) },
              t(node.noteId !== undefined ? 'wb.ng.openNote' : 'gr.inspector.open'))
            : null),

        detailError !== undefined
          ? h('p', { className: 'gr-empty-line', role: 'alert' }, detailError)
          : null,

        rationale.map((row, index) => h('div', {
          key: `rationale-${index}`,
          className: 'gr-rationale',
        }, row.text)),

        groups.length === 0
          ? h('p', { className: 'gr-empty-line' }, t('gr.inspector.noRelations'))
          : groups.map((group, index) => h(GrRelationSection, {
            key: group.key,
            group,
            open: group.key === 'callers' || group.key === 'calls' || (!hasCalls && index === 0),
            onSelect,
            onOpen,
            t,
            locale,
          })),

        siblings.length > 0
          ? h('details', { className: 'gr-rel-group' },
            h('summary', null,
              h('span', { className: 'gr-grow' }, t('gr.inspector.siblings')),
              h('span', { className: 'gr-rel-count' }, formatInt(siblings.length, locale))),
            h('div', { className: 'gr-rel-list' },
              siblings.map((row) => h('button', {
                key: row.id,
                type: 'button',
                className: 'gr-rel-row',
                onClick: () => onSelect(row.id),
                onDoubleClick: () => onOpen(row),
              },
                h('span', { className: 'gr-rel-label' }, row.label),
                h('span', { className: 'gr-rel-kind' }, grKindLabel(row.kind, locale)),
                h('span', { className: 'gr-rel-loc' }, `:${row.line ?? 1}`)))))
          : null);
    }

    /** One collapsible relation group in the inspector rail. */
    function GrRelationSection(props) {
      const { group, open, onSelect, onOpen, t, locale } = props;
      const shown = group.items.slice(0, GRAPH_MAX_ROWS);
      const labelKey = `gr.group.${group.key}`;
      const groupLabel = t(labelKey) === labelKey ? group.label : t(labelKey);

      return h('details', { className: 'gr-rel-group', open },
        h('summary', null,
          h('span', { className: 'gr-grow' }, groupLabel),
          h('span', { className: 'gr-rel-count' }, formatInt(group.items.length, locale))),
        h('div', { className: 'gr-rel-list' },
          shown.map((item) => {
            const rowTitle = [
              item.path,
              grRelationLabel(item.relation, locale),
              grConfidenceLabel(item.confidence, locale),
              item.line === undefined ? undefined : `L${item.line}`,
            ].filter((part) => part !== undefined && part !== '').join(' · ');
            return h('div', {
              key: `${item.id}:${item.relation}:${group.key}`,
              className: 'gr-rel-row',
              role: 'button',
              tabIndex: 0,
              title: rowTitle,
              onClick: () => onSelect(item.id),
              onDoubleClick: () => onOpen(item),
              onKeyDown: (event) => { if (event.key === 'Enter') onSelect(item.id); },
            },
              h('span', { className: 'gr-dir', 'data-dir': item.outgoing === true ? 'out' : 'in' },
                item.outgoing === true ? '→' : '←'),
              h('span', { className: 'gr-rel-label' }, item.label),
              h('span', { className: 'gr-rel-kind' }, grKindLabel(item.kind, locale)),
              item.path
                ? h('span', { className: 'gr-rel-loc gr-mono' }, `${item.path}:${item.line ?? 1}`)
                : null,
              item.path
                ? h('button', {
                  type: 'button',
                  className: 'gr-rel-open',
                  title: t('gr.inspector.open'),
                  'aria-label': `${t('gr.inspector.open')} ${item.label}`,
                  onClick: (event) => { event.stopPropagation(); onOpen(item); },
                }, '↗')
                : null,
              h('span', { className: 'gr-rel-relation', style: { color: grCommunityColor(item.community) } },
                grRelationLabel(item.relation, locale)));
          }),
          group.items.length > shown.length
            ? h('p', { className: 'gr-group-more' },
              t('gr.rows.more', { count: formatInt(group.items.length - shown.length, locale) }))
            : null));
    }

    /* ================================================================ *
     * i18n-chat.js
     * ================================================================ */
    /**
     * Copy for the conversation workbench.
     *
     * Merged into `i18n.js`'s dictionary at load time rather than appended to
     * `DICT`: that object is one literal, so two authors adding keys to it in
     * parallel would conflict on every edit and the loser's keys would silently
     * read as their own names.
     *
     * Both languages are complete here and `mergeDict` checks the parity — a key in
     * `zh` without an `en` counterpart throws at load, which is the only failure
     * mode that is cheap enough to be fatal: a half-translated panel shipped behind
     * a "worked on my machine" is much worse than a plugin that refuses to boot.
     *
     * Key groups:
     *   `chat.*`  the conversation panel
     *   `code.*`  the read-only code pane
     *   `wb.*`    the segmented workbench shell around them
     */



    const CHAT_I18N = {
      zh: {
        /* ---- conversation ------------------------------------------------ */
        'chat.title': '对话',
        'chat.new': '新建对话',
        'chat.newHint': '清空当前对话；下一次提问会开一段新的',
        'chat.empty.title': '开始一次新的阅读对话',
        'chat.empty.hint': '在代码面板选中一段，点「就这段提问」；或者直接从下面这些问题开始。',
        'chat.suggest.1': '这个项目的入口在哪里，整体是怎么分层的？',
        'chat.suggest.2': '检索与索引部分用的是什么方案？',
        'chat.suggest.3': '这个仓库里最值得先读的三个函数是哪几个？',
        'chat.placeholder': '向 CodeSlice 提问',
        'chat.send': '发送',
        'chat.stop': '停止',
        'chat.busy': '正在生成回答…',
        'chat.loading': '正在加载对话…',
        'chat.mode.snippet': '片段',
        'chat.mode.project': '全项目',
        'chat.role.user': '你',
        'chat.role.assistant': 'CodeSlice',

        /* ---- notes out of a conversation --------------------------------- */
        'chat.note.make': '做成笔记',
        'chat.note.busy': '整理中…',
        'chat.note.whole': '整段整理成笔记',
        'chat.note.wholeBusy': '整理整段…',
        'chat.note.made': '已记入笔记',
        'chat.note.failed': '笔记已保存（{title}），但模型整理失败：{detail}',
        'chat.note.created': '已生成笔记：{title}',

        /* ---- failures ---------------------------------------------------- */
        'chat.error.load': '对话加载失败',
        'chat.error.create': '新建对话失败',
        'chat.error.aborted': '请求已取消',
        'chat.error.noteNoConversation': '还没有对话，无法生成笔记',
        'chat.error.streamEnded': '连接在回答中途断开了，已经收到的部分保留在上面。',

        /* ---- bound selection --------------------------------------------- */
        'chat.bound': '关于 {path} 第 {start}-{end} 行',
        'chat.bound.single': '关于 {path} 第 {line} 行',
        'chat.bound.graph': '图谱节点「{label}」· 追问会带上它的邻域',
        'chat.bound.none': '未选中代码 · 将以全项目模式提问',
        'chat.context.toggle': '联系上下文',
        'chat.context.on': '当前会读取同文件的其他片段作为背景；点击只看选中的代码',
        'chat.context.off': '当前只讲选中的这段代码；点击允许模型参考上下文',

        /* ---- answer chrome ------------------------------------------------ */
        'chat.retrieval': '检索到 {count} 段代码',
        'chat.citation': '{path} 第 {start}-{end} 行',
        'chat.stopped': '已停止生成',
        'chat.answer.empty': '（这条回答没有正文）',
        'chat.seed': '请解释 {path} 第 {start}-{end} 行这段代码在做什么，以及为什么这么写。',
        'chat.seed.single': '请解释 {path} 第 {line} 行这段代码在做什么，以及为什么这么写。',
        'chat.seed.graph': '请结合知识图谱说明「{label}」的作用、它与其他部分的联系，以及调用它的地方。',
        'chat.title.snippet': '关于 {path} 第 {start}-{end} 行',

        /* ---- code pane ---------------------------------------------------- */
        'code.title': '代码',
        'code.empty.title': '还没有打开代码',
        'code.empty.body': '从对话里的引用芯片，或图谱节点的「打开代码」，在这里打开一个文件。',
        'code.loading': '正在读取代码…',
        'code.error.title': '代码读取失败',
        'code.notFound': '这个文件不在工作区里：{path}',
        'code.selected': '已选第 {start}-{end} 行 · {count} 行',
        'code.hint': '点行号选起点，再点一行选终点；也可以直接拖选文本',
        'code.editor.loading': '正在加载编辑器…',
        'code.editor.failed': '编辑器加载失败',
        'code.action.ask': '就这段提问',
        'code.action.note': '存为笔记',
        'code.action.copy': '复制',
        'code.action.clear': '取消选择',
        'code.copied': '已复制',
        'code.refresh': '重新读取',
        'code.lines': '{count} 行',
        'code.symbols': '{count} 个符号',
        'code.truncated': '显示第 {start}-{end} 行，共 {lines} 行',
        'code.marker.annotation': '批注',
        'code.marker.note': '笔记',
        'code.note.title': '笔记标题',
        'code.note.save': '保存笔记',
        'code.note.cancel': '取消',
        'code.note.saved': '已存为笔记：{title}',
        'code.note.failed': '存笔记失败：{detail}',

        /* ---- workbench shell ---------------------------------------------- */
        'wb.chat': '对话',
        'wb.code': '代码',
        'wb.graph': '图谱',
        'wb.graph.missing': '图谱分段不可用：宿主没有提供渲染函数。',

        /* ---- composer bar (normal DSH conversation) ---------------------- */
        'bar.noSelection': 'CodeSlice · 未选代码',
        'bar.openHint': '打开 CodeSlice 工作台，选择一个代码范围',
        'bar.reader': '代码阅读',
        'bar.readerHint': '在右侧栏打开本项目的代码阅读器，可框选区间并带入对话',
        'bar.note': '生成笔记',
        'bar.noteBusy': '整理中…',
        'bar.noteHint': '把当前这段 DSH 对话整理成一条知识库笔记',
        'bar.context': '联系上下文',
        'bar.contextOnHint': '已联系整个项目：回答会参考调用关系、图谱邻居与相关笔记，但仍以选中片段为主；点击只看选中片段',
        'bar.contextOffHint': '当前只讲选中的这段代码；点击让回答联系整个项目的代码关系',
        'bar.contextBusy': '同步中…',
        'bar.noteTitle': '对话笔记',
        'bar.noteSaved': '已生成笔记：{title}',
        'bar.noteSavedRaw': '笔记已保存（{title}），但模型整理失败',
        'bar.noTurns': '这段对话还没有可整理的内容',
        'bar.noComposer': '当前输入框无法接收代码引用，请先打开一个会话',

        /* ---- CodeSlice workspace ----------------------------------------- */
        'ws.title': 'CodeSlice 工作台',
        'ws.tab.code': '代码',
        'ws.tab.graph': '图谱',
        'ws.tab.notes': '知识库',
        'ws.tab.settings': '检索设置',
        'ws.files.filter': '筛选文件',
        'ws.hint': '选中行号后可直接就这段提问，问题会进入旁边的正常对话',
        'ws.jump.graph': '在图谱中定位',
        'ws.jump.notes': '查看笔记',
        'ws.graph.askPrompt': '请结合知识图谱说明「{label}」的作用、它与其他部分的联系，以及调用它的地方。{where}',
        'ws.settings.title': '检索与 RAG',
        'ws.settings.topK': '检索条数',
        'ws.settings.rrfK': 'RRF 常数',
        'ws.settings.includeNotes': '上下文包含笔记',
        'ws.settings.includeGraph': '上下文包含图谱',
        'ws.settings.saved': '设置已保存',
        'ws.index.title': '向量索引（固定切分）',
        'ws.index.idle': '未建立',
        'ws.index.ready': '已建立',
        'ws.index.running': '构建中',
        'ws.index.error': '构建失败',
        'ws.index.status': '已索引 {vectors}/{chunks} 段 · {model} · {dims} 维',
        'ws.index.progress': '进度 {done}/{total} 段，失败 {failed} 段',
        'ws.index.build': '构建索引',
        'ws.index.rebuild': '强制重建',
        'ws.index.started': '索引任务已启动，后台继续生成向量',
        'ws.index.noModel': '先在上方配置向量模型，再构建索引',
        'ws.index.stale': '向量模型已变更，当前索引不再参与检索；点「强制重建」重新生成。',
        'ws.index.hint': '切分固定为桌面端参数（60 行/块，结构块上限 220 行 / 8000 字符），不提供自定义。',

        /* ---- local models / Ollama --------------------------------------- */
        'ws.models.title': '本地向量模型 / Ollama',
        'ws.models.available': 'Ollama 已连接',
        'ws.models.missing': '未检测到 Ollama',
        'ws.models.model': '向量模型',
        'ws.models.noneInstalled': '还没有安装本地模型',
        'ws.models.baseUrl': '接口地址',
        'ws.models.baseHint': '只允许 127.0.0.1 / localhost，避免误连远端',
        'ws.models.systemPrompt': '系统提示词',
        'ws.models.systemHint': '附加在 CodeSlice 内置规则之后；不能覆盖引用与事实约束',
        'ws.models.detect': '重新检测',
        'ws.models.test': '测试向量',
        'ws.models.testing': '测试中…',
        'ws.models.testOk': '{model} 可用，向量维度 {dims}',
        'ws.models.testFail': '向量测试失败：{detail}',
        'ws.models.saved': '模型设置已保存',
      },

      en: {
        /* ---- conversation ------------------------------------------------ */
        'chat.title': 'Conversation',
        'chat.new': 'New conversation',
        'chat.newHint': 'Clear this conversation; the next question starts a new one',
        'chat.empty.title': 'Start a reading conversation',
        'chat.empty.hint': 'Select code in the code pane and pick "Ask about this", or start from one of these.',
        'chat.suggest.1': 'Where does this project start, and how is it layered?',
        'chat.suggest.2': 'What approach do retrieval and indexing use?',
        'chat.suggest.3': 'Which three functions in this repo are worth reading first?',
        'chat.placeholder': 'Ask CodeSlice',
        'chat.send': 'Send',
        'chat.stop': 'Stop',
        'chat.busy': 'Generating an answer…',
        'chat.loading': 'Loading the conversation…',
        'chat.mode.snippet': 'Snippet',
        'chat.mode.project': 'Project',
        'chat.role.user': 'You',
        'chat.role.assistant': 'CodeSlice',

        /* ---- notes out of a conversation --------------------------------- */
        'chat.note.make': 'Make a note',
        'chat.note.busy': 'Summarising…',
        'chat.note.whole': 'Summarise the session',
        'chat.note.wholeBusy': 'Summarising…',
        'chat.note.made': 'Noted',
        'chat.note.failed': 'The note was saved ({title}), but the model failed to summarise it: {detail}',
        'chat.note.created': 'Note created: {title}',

        /* ---- failures ---------------------------------------------------- */
        'chat.error.load': 'Could not load the conversation',
        'chat.error.create': 'Could not create a conversation',
        'chat.error.aborted': 'The request was cancelled',
        'chat.error.noteNoConversation': 'There is no conversation to make a note from yet',
        'chat.error.streamEnded': 'The connection dropped mid-answer; what arrived is kept above.',

        /* ---- bound selection --------------------------------------------- */
        'chat.bound': 'About {path} lines {start}-{end}',
        'chat.bound.single': 'About {path} line {line}',
        'chat.bound.graph': 'Graph node "{label}" · follow-ups include its neighbourhood',
        'chat.bound.none': 'No selection · asking about the whole project',
        'chat.context.toggle': 'Use context',
        'chat.context.on': 'The rest of the file is read for background; click to see the selection alone',
        'chat.context.off': 'Only the selected lines are described; click to let the model read the context',

        /* ---- answer chrome ------------------------------------------------ */
        'chat.retrieval': '{count} code ranges retrieved',
        'chat.citation': '{path} lines {start}-{end}',
        'chat.stopped': 'Generation stopped',
        'chat.answer.empty': '(this answer has no body)',
        'chat.seed': 'Explain what {path} lines {start}-{end} do, and why it is written this way.',
        'chat.seed.single': 'Explain what {path} line {line} does, and why it is written this way.',
        'chat.seed.graph': 'Using the knowledge graph, explain what "{label}" does, how it connects to the rest, and where it is called.',
        'chat.title.snippet': 'About {path} lines {start}-{end}',

        /* ---- code pane ---------------------------------------------------- */
        'code.title': 'Code',
        'code.empty.title': 'No file open',
        'code.empty.body': 'Open one from a citation chip in the conversation, or from a graph node\'s "Open code".',
        'code.loading': 'Reading the code…',
        'code.error.title': 'Could not read the code',
        'code.notFound': 'That file is not in the workspace: {path}',
        'code.selected': 'Lines {start}-{end} selected · {count} lines',
        'code.hint': 'Click a line number for the start, another for the end — or drag text',
        'code.editor.loading': 'Loading editor…',
        'code.editor.failed': 'Editor failed to load',
        'code.action.ask': 'Ask about this',
        'code.action.note': 'Save as a note',
        'code.action.copy': 'Copy',
        'code.action.clear': 'Clear selection',
        'code.copied': 'Copied',
        'code.refresh': 'Read again',
        'code.lines': '{count} lines',
        'code.symbols': '{count} symbols',
        'code.truncated': 'Showing lines {start}-{end} of {lines}',
        'code.marker.annotation': 'Annotation',
        'code.marker.note': 'Note',
        'code.note.title': 'Note title',
        'code.note.save': 'Save note',
        'code.note.cancel': 'Cancel',
        'code.note.saved': 'Saved as a note: {title}',
        'code.note.failed': 'Could not save the note: {detail}',

        /* ---- workbench shell ---------------------------------------------- */
        'wb.chat': 'Chat',
        'wb.code': 'Code',
        'wb.graph': 'Graph',
        'wb.graph.missing': 'The graph segment is unavailable: the host supplied no render function.',

        /* ---- composer bar (normal DSH conversation) ---------------------- */
        'bar.noSelection': 'CodeSlice · no selection',
        'bar.openHint': 'Open the CodeSlice workspace and pick a code range',
        'bar.reader': 'Code reader',
        'bar.readerHint': 'Open this project in the right Sidebar and pick a range to quote',
        'bar.note': 'Make a note',
        'bar.noteBusy': 'Summarising…',
        'bar.noteHint': 'Turn this DSH conversation into a knowledge-base note',
        'bar.context': 'Use context',
        'bar.contextOnHint': 'Project context is on: answers may use callers, graph neighbours and related notes, but the selected snippet stays primary. Click to focus on the snippet alone',
        'bar.contextOffHint': 'Only the selected snippet is described. Click to let the answer use the whole project’s code relationships',
        'bar.contextBusy': 'Syncing…',
        'bar.noteTitle': 'Conversation note',
        'bar.noteSaved': 'Note created: {title}',
        'bar.noteSavedRaw': 'The note was saved ({title}), but the model failed to summarise it',
        'bar.noTurns': 'This conversation has nothing to summarise yet',
        'bar.noComposer': 'The composer cannot accept a code reference here; open a session first',

        /* ---- CodeSlice workspace ----------------------------------------- */
        'ws.title': 'CodeSlice workspace',
        'ws.tab.code': 'Code',
        'ws.tab.graph': 'Graph',
        'ws.tab.notes': 'Knowledge base',
        'ws.tab.settings': 'Retrieval',
        'ws.files.filter': 'Filter files',
        'ws.hint': 'Pick lines, then ask about them; the question goes to the normal conversation',
        'ws.jump.graph': 'Locate in graph',
        'ws.jump.notes': 'Open notes',
        'ws.graph.askPrompt': 'Using the knowledge graph, explain what "{label}" does, how it connects to the rest, and where it is called. {where}',
        'ws.settings.title': 'Retrieval and RAG',
        'ws.settings.topK': 'Chunks',
        'ws.settings.rrfK': 'RRF constant',
        'ws.settings.includeNotes': 'Include notes in context',
        'ws.settings.includeGraph': 'Include graph in context',
        'ws.settings.saved': 'Settings saved',
        'ws.index.title': 'Vector index (fixed chunking)',
        'ws.index.idle': 'Not built',
        'ws.index.ready': 'Ready',
        'ws.index.running': 'Building',
        'ws.index.error': 'Build failed',
        'ws.index.status': '{vectors}/{chunks} chunks indexed · {model} · {dims} dims',
        'ws.index.progress': '{done}/{total} chunks, {failed} failed',
        'ws.index.build': 'Build index',
        'ws.index.rebuild': 'Force rebuild',
        'ws.index.started': 'Indexing started; vectors are generated in the background',
        'ws.index.noModel': 'Configure an embedding model above before building the index',
        'ws.index.stale': 'The embedding model changed; this index no longer participates in retrieval. Click "Force rebuild" to regenerate it.',
        'ws.index.hint': 'Chunking is fixed to the desktop bands (60-line bands, 220-line / 8000-char structural cap) and is not configurable.',

        /* ---- local models / Ollama --------------------------------------- */
        'ws.models.title': 'Local embedding model / Ollama',
        'ws.models.available': 'Ollama connected',
        'ws.models.missing': 'Ollama not detected',
        'ws.models.model': 'Embedding model',
        'ws.models.noneInstalled': 'No local model installed yet',
        'ws.models.baseUrl': 'Endpoint',
        'ws.models.baseHint': '127.0.0.1 / localhost only, so a typo cannot reach a remote host',
        'ws.models.systemPrompt': 'System prompt',
        'ws.models.systemHint': 'Appended after CodeSlice rules; it cannot override citations or facts',
        'ws.models.detect': 'Detect again',
        'ws.models.test': 'Test embedding',
        'ws.models.testing': 'Testing…',
        'ws.models.testOk': '{model} works; {dims}-dimensional vector',
        'ws.models.testFail': 'Embedding test failed: {detail}',
        'ws.models.saved': 'Model settings saved',
      },
    };

    mergeDict(CHAT_I18N);

    /* ================================================================ *
     * styles.js
     * ================================================================ */
    /**
     * The panel's whole stylesheet, as one string.
     *
     * Rules that came from hard experience with a host page:
     *
     *   - Every selector starts with `cs-`. The host owns `button`, `input`, `a`,
     *     `code`, `::selection` and every scrollbar (`spec §10.5`); a bare element
     *     selector would restyle the conversation, not the panel.
     *   - No `:root`, no `body`, no `!important`, no scrollbar rules. Those are the
     *     four documented ways a panel leaks into its host.
     *   - No `@container` without a name: `note.css` shipped three unscoped ones
     *     (`spec §10.2`) that match whatever container happens to be nearest.
     *     Narrow/wide is measured in JS from the panel's own box instead, which is
     *     also what the interaction spec asks for.
     *   - Colours are only `--dsw-alias-*` / `--dsw-specific-sidebar-fill`, derived
     *     further with `color-mix` where a tint is needed. Sizes, spacing, radii and
     *     font sizes are plain values: the host declares no tokens for them.
     */

    const CSS = `
    /* ---------------------------------------------------------------- *
     * Shell                                                            *
     * ---------------------------------------------------------------- */
    .cs-root {
      display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
      box-sizing: border-box;
      font-family: inherit; font-size: 12px; line-height: 1.45;
      color: var(--dsw-alias-label-primary);
      background: var(--dsw-alias-bg-base);
    }
    .cs-root *, .cs-root *::before, .cs-root *::after { box-sizing: border-box; }

    .cs-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .cs-col { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .cs-grow { flex: 1 1 auto; min-width: 0; }
    .cs-noshrink { flex: 0 0 auto; }
    .cs-wrap { flex-wrap: wrap; }
    .cs-mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    .cs-muted { color: var(--dsw-alias-label-secondary); }
    .cs-dim { opacity: .62; }
    .cs-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cs-tabular { font-variant-numeric: tabular-nums; }
    .cs-hidden { display: none; }
    .cs-sr {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* ---------------------------------------------------------------- *
     * Bars, buttons, inputs                                            *
     * ---------------------------------------------------------------- */
    .cs-bar {
      display: flex; align-items: center; gap: 6px; padding: 6px 8px;
      flex: 0 0 auto; min-height: 34px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-bar.cs-flat { border-bottom: none; }
    .cs-bar.cs-sub { min-height: 28px; padding: 4px 8px; background: var(--dsw-alias-bg-layer-1); }

    .cs-iconbtn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; padding: 0; flex: 0 0 auto;
      border: 1px solid transparent; border-radius: 6px; cursor: pointer;
      background: transparent; color: var(--dsw-alias-label-secondary); font: inherit;
    }
    .cs-iconbtn:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
    .cs-iconbtn:active { background: var(--dsw-alias-bg-layer-2); }
    .cs-iconbtn[disabled] { opacity: .42; cursor: default; background: transparent; }
    .cs-iconbtn.cs-on { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-border-l2); }
    .cs-iconbtn.cs-danger:hover { color: var(--dsw-alias-state-error-primary); }

    .cs-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px; line-height: 1.4; font: inherit; cursor: pointer;
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
      background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
    }
    .cs-btn:hover { background: var(--dsw-alias-bg-layer-2); }
    .cs-btn[disabled] { opacity: .5; cursor: default; }
    .cs-btn.cs-primary {
      border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    }
    .cs-btn.cs-primary:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
    .cs-btn.cs-small { padding: 1px 6px; font-size: 11px; }
    .cs-btn.cs-on {
      border-color: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    }
    .cs-btn.cs-ghost {
      border-color: transparent; background: transparent;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-btn.cs-ghost:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }

    .cs-iconbtn:focus-visible,
    .cs-btn:focus-visible,
    .cs-chip:focus-visible,
    .cs-item:focus-visible,
    .cs-input:focus-visible,
    .cs-tab:focus-visible,
    .cs-node:focus-visible {
      outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
    }

    .cs-input {
      flex: 1 1 auto; min-width: 0;
      padding: 4px 8px; font: inherit; color: inherit;
      background: var(--dsw-alias-bg-layer-1);
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
    }
    .cs-input::placeholder { color: var(--dsw-alias-label-secondary); }
    .cs-input:focus {
      outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px;
      border-color: transparent;
    }
    .cs-input.cs-mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    .cs-textarea {
      width: 100%; min-height: 84px; resize: vertical;
      padding: 6px 8px; font: inherit; line-height: 1.6; color: inherit;
      background: var(--dsw-alias-bg-base);
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 11.5px; tab-size: 2;
    }
    .cs-textarea:focus { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
    .cs-select {
      font: inherit; color: inherit; padding: 2px 4px; max-width: 140px;
      background: var(--dsw-alias-bg-layer-1);
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px;
    }

    .cs-field { display: flex; flex-direction: column; gap: 3px; padding: 4px 8px; }
    .cs-field > label {
      font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--dsw-alias-label-secondary);
    }

    /* ---------------------------------------------------------------- *
     * Segmented control (graph scope)                                  *
     * ---------------------------------------------------------------- */
    .cs-seg {
      display: inline-flex; flex: 0 0 auto; padding: 1px;
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-seg > button {
      font: inherit; font-size: 11px; padding: 2px 7px; cursor: pointer;
      border: none; border-radius: 5px; background: transparent;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-seg > button.cs-on { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
    .cs-seg > button[disabled] { opacity: .4; cursor: default; }

    /* ---------------------------------------------------------------- *
     * Chips, tags, dots, banners                                       *
     * ---------------------------------------------------------------- */
    .cs-chip {
      display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto;
      height: 22px; padding: 0 8px; border-radius: 999px; cursor: pointer;
      font: inherit; font-size: 11px; line-height: 1;
      border: 1px solid var(--dsw-alias-border-l1);
      background: transparent; color: var(--dsw-alias-label-secondary);
    }
    .cs-chip:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
    .cs-chip[aria-pressed='true'] {
      border-color: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    }
    .cs-chip[aria-pressed='false'] { text-decoration: line-through; opacity: .6; }
    .cs-chip .cs-swatch { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 auto; }

    .cs-legend {
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
      padding: 4px 8px; flex: 0 0 auto;
      border-top: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-legend-label {
      font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--dsw-alias-label-secondary); margin-right: 2px;
    }

    .cs-tag {
      flex: 0 0 auto; padding: 0 5px; font-size: 9.5px; line-height: 15px;
      border-radius: 4px; border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
    }
    .cs-tag.cs-accent { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
    .cs-tag.cs-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
    .cs-tag.cs-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
    .cs-tag.cs-bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }

    .cs-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-state-idle-primary); }
    .cs-dot.cs-ok { background: var(--dsw-alias-state-success-primary); }
    .cs-dot.cs-busy { background: var(--dsw-alias-state-warn-primary); }
    .cs-dot.cs-bad { background: var(--dsw-alias-state-error-primary); }
    .cs-dot.cs-brand { background: var(--dsw-alias-brand-primary); }

    .cs-banner {
      display: flex; align-items: flex-start; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; font-size: 11px;
      background: var(--dsw-alias-bg-layer-1);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-state-error-primary);
    }
    .cs-banner.cs-warn { color: var(--dsw-alias-state-warn-primary); }
    .cs-banner .cs-grow { color: var(--dsw-alias-label-secondary); }

    .cs-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 22px 16px; text-align: center; height: 100%;
      color: var(--dsw-alias-label-secondary); font-size: 11.5px;
    }
    .cs-empty b { color: var(--dsw-alias-label-primary); font-weight: 600; }
    .cs-empty p { margin: 0; max-width: 42ch; }
    .cs-empty svg { opacity: .5; }

    /* ---------------------------------------------------------------- *
     * Graph layout: canvas + rail                                      *
     * ---------------------------------------------------------------- */
    .cs-graph { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-graph-body {
      display: flex; flex: 1 1 auto; min-height: 0; min-width: 0;
      flex-direction: row;
    }
    .cs-graph-body.cs-narrow { flex-direction: column; }
    .cs-graph-stage {
      position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .cs-graph-body.cs-narrow .cs-graph-stage { min-height: 140px; }
    .cs-rail {
      flex: 0 0 300px; display: flex; flex-direction: column; min-height: 0; min-width: 0;
      border-left: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-specific-sidebar-fill);
    }
    .cs-graph-body.cs-narrow .cs-rail {
      flex: 0 0 auto; max-height: 52%; border-left: none;
      border-top: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-rail-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
    .cs-rail-foot {
      flex: 0 0 auto; padding: 5px 8px; font-size: 10px; line-height: 1.5;
      border-top: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
    }

    .cs-search { position: relative; display: flex; align-items: center; flex: 1 1 auto; min-width: 0; }
    .cs-search .cs-input { padding-left: 26px; padding-right: 26px; }
    .cs-search-glyph {
      position: absolute; left: 7px; top: 50%; transform: translateY(-50%);
      display: flex; color: var(--dsw-alias-label-secondary); pointer-events: none;
    }
    .cs-search-clear {
      position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
      display: flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; padding: 0; border: none; border-radius: 4px;
      background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
    }
    .cs-search-clear:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

    .cs-section-head {
      display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--dsw-alias-label-secondary);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }

    .cs-item {
      display: flex; align-items: baseline; gap: 6px; width: 100%;
      padding: 3px 8px; min-height: 24px;
      border: none; background: transparent; cursor: pointer;
      text-align: left; font: inherit; color: inherit; min-width: 0;
    }
    .cs-item:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-item.cs-active { background: var(--dsw-alias-bg-layer-2); }
    .cs-item .cs-name { font-weight: 600; flex: 0 1 auto; min-width: 0; }
    .cs-item .cs-where {
      flex: 1 1 auto; min-width: 0; font-size: 10.5px;
      color: var(--dsw-alias-label-secondary);
      direction: rtl; text-align: left;
    }
    .cs-item .cs-meta { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

    /* ---------------------------------------------------------------- *
     * Inspector                                                        *
     * ---------------------------------------------------------------- */
    .cs-detail { display: flex; flex-direction: column; min-height: 0; }
    .cs-detail-head { display: flex; align-items: flex-start; gap: 6px; padding: 8px; }
    .cs-detail-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
    .cs-detail-title h2 {
      margin: 0; font-size: 13px; font-weight: 600; line-height: 1.3;
      overflow-wrap: anywhere; color: var(--dsw-alias-label-primary);
    }
    .cs-detail-meta { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
    .cs-detail-acts { display: flex; align-items: center; gap: 4px; padding: 0 8px 6px; flex-wrap: wrap; }

    .cs-kind {
      display: inline-flex; align-items: center; height: 18px; padding: 0 6px;
      font-size: 10px; line-height: 1;
      border-radius: 4px; color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
    }
    .cs-kind.cs-k-class { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
    .cs-kind.cs-k-rationale { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); }
    .cs-kind.cs-k-external { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }

    .cs-rationale {
      margin: 0 8px 6px; padding: 6px 8px; font-size: 11px; line-height: 1.6;
      border-left: 2px solid var(--dsw-alias-state-warn-primary);
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-primary);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .cs-rationale.cs-quiet { color: var(--dsw-alias-label-secondary); border-left-color: var(--dsw-alias-border-l2); }

    .cs-group { border-top: 1px solid var(--dsw-alias-border-l1); }
    .cs-group > summary {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 8px; min-height: 24px; cursor: pointer; list-style: none;
      font-size: 11px; color: var(--dsw-alias-label-secondary);
    }
    .cs-group > summary::-webkit-details-marker { display: none; }
    .cs-group > summary:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
    .cs-group > summary .cs-grow { font-weight: 600; color: var(--dsw-alias-label-primary); }
    .cs-group > summary .cs-count { font-size: 9.5px; font-variant-numeric: tabular-nums; }
    .cs-group > summary .cs-twist { display: flex; transition: transform .12s ease; }
    .cs-group[open] > summary .cs-twist { transform: rotate(90deg); }
    @media (prefers-reduced-motion: reduce) { .cs-group > summary .cs-twist { transition: none; } }
    .cs-group-list { padding-bottom: 3px; }
    .cs-group-more {
      padding: 3px 8px 5px; font-size: 10px; color: var(--dsw-alias-label-secondary);
    }

    .cs-rel {
      display: flex; align-items: baseline; gap: 5px; width: 100%;
      padding: 2px 8px 2px 18px; min-height: 22px;
      border: none; background: transparent; cursor: pointer; text-align: left;
      font: inherit; color: inherit; min-width: 0;
    }
    .cs-rel:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-rel .cs-dir { flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-secondary); }
    .cs-rel .cs-dir[data-dir='out'] { color: var(--dsw-alias-brand-primary); }
    .cs-rel .cs-rel-label { flex: 0 1 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
    .cs-rel .cs-loc {
      flex: 0 1 auto; max-width: 96px; font-size: 9.5px; direction: rtl;
      color: var(--dsw-alias-label-secondary); overflow: hidden; white-space: nowrap;
    }
    .cs-rel .cs-open {
      flex: 0 0 auto; display: flex; opacity: 0; margin-left: auto;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-rel:hover .cs-open, .cs-rel:focus-within .cs-open { opacity: 1; }

    .cs-comm {
      display: flex; align-items: center; gap: 6px; padding: 2px 8px; min-height: 26px;
      font-size: 11px;
    }
    .cs-comm:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-comm input { accent-color: var(--dsw-alias-brand-primary); width: 12px; height: 12px; margin: 0; flex: 0 0 auto; }
    .cs-comm .cs-swatch { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
    .cs-comm .cs-grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cs-comm .cs-count { flex: 0 0 auto; font-size: 9.5px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
    .cs-comm.cs-off .cs-grow, .cs-comm.cs-off .cs-count { opacity: .5; text-decoration: line-through; }

    /* ---------------------------------------------------------------- *
     * Canvas                                                           *
     * ---------------------------------------------------------------- */
    .cs-canvas {
      position: relative; flex: 1 1 auto; min-height: 0; min-width: 0;
      background: var(--dsw-alias-bg-base); overflow: hidden;
    }
    .cs-canvas svg { display: block; width: 100%; height: 100%; touch-action: none; }
    .cs-canvas[data-settling='true'] { cursor: progress; }
    .cs-canvas .vis-network { outline: none; }
    .cs-canvas .vis-network canvas { display: block; }
    .cs-canvas .vis-tooltip {
      position: absolute; z-index: 5; pointer-events: none; white-space: pre-wrap;
      max-width: 300px; padding: 5px 8px; border-radius: 6px; font-size: 11px;
      background: var(--dsw-alias-bg-overlay);
      border: 1px solid var(--dsw-alias-border-l1);
      box-shadow: 0 3px 10px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
      color: var(--dsw-alias-label-primary);
    }
    .cs-edge { fill: none; }
    .cs-edge.cs-structural { stroke: var(--dsw-alias-label-secondary); }
    .cs-edge.cs-dim { opacity: .06; }
    .cs-edge.cs-hi { stroke-width: 2.2; opacity: .95; }
    .cs-node { cursor: pointer; outline: none; }
    .cs-node .cs-node-body { stroke-width: 1.5; }
    .cs-node .cs-node-ring { fill: none; stroke: var(--dsw-alias-label-primary); stroke-width: 1.6; }
    .cs-node.cs-dim { transition: opacity .12s ease; }
    .cs-node:hover .cs-node-body { stroke: var(--dsw-alias-label-primary); }
    .cs-node-label {
      font-size: 12px; font-weight: 500; pointer-events: none; user-select: none;
      paint-order: stroke; stroke-linejoin: round;
      fill: var(--dsw-alias-label-primary);
      stroke: var(--dsw-alias-bg-base);
    }
    .cs-node-label.cs-halo {
      paint-order: stroke; stroke-linejoin: round;
      stroke: var(--dsw-alias-bg-base);
    }

    .cs-canvas-tools {
      position: absolute; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 3px;
      padding: 3px; border-radius: 7px;
      background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent);
      border: 1px solid var(--dsw-alias-border-l1);
      backdrop-filter: blur(6px);
    }
    .cs-canvas-tools .cs-iconbtn { width: 26px; height: 26px; }
    .cs-canvas-hint {
      position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 56px);
      font-size: 10px; color: var(--dsw-alias-label-secondary);
      pointer-events: none; user-select: none;
    }
    .cs-canvas-pill {
      position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 5px;
      padding: 2px 9px; border-radius: 999px; font-size: 10.5px;
      background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, transparent);
      border: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
      backdrop-filter: blur(6px); pointer-events: none;
    }
    .cs-canvas-empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      padding: 16px; text-align: center; font-size: 11.5px;
      color: var(--dsw-alias-label-secondary); pointer-events: none;
    }
    .cs-canvas-cap {
      position: absolute; top: 8px; right: 8px; max-width: 62%;
      padding: 2px 7px; border-radius: 5px; font-size: 10px;
      background: var(--dsw-alias-bg-overlay);
      border: 1px solid var(--dsw-alias-state-warn-primary);
      color: var(--dsw-alias-state-warn-primary);
      pointer-events: none;
    }

    .cs-tip {
      position: absolute; z-index: 4; pointer-events: none;
      max-width: 240px; padding: 4px 7px; border-radius: 6px; font-size: 11px;
      background: var(--dsw-alias-bg-overlay);
      border: 1px solid var(--dsw-alias-border-l1);
      box-shadow: 0 3px 10px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
      color: var(--dsw-alias-label-primary); white-space: pre-wrap;
    }
    .cs-tip .cs-mono { display: block; font-size: 10px; color: var(--dsw-alias-label-secondary); }

    .cs-spin { animation: cs-spin 1s linear infinite; transform-origin: 50% 50%; }
    @keyframes cs-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .cs-spin { animation: none; } }

    /* ---------------------------------------------------------------- *
     * Notes                                                            *
     * ---------------------------------------------------------------- */
    .cs-notes { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; flex-direction: row; }
    .cs-notes.cs-narrow { flex-direction: column; }
    .cs-notes-list {
      flex: 0 0 240px; display: flex; flex-direction: column; min-height: 0; min-width: 0;
      border-right: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-notes.cs-narrow .cs-notes-list {
      flex: 0 0 auto; max-height: 46%; border-right: none;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-notes-actions { padding-top: 0; padding-bottom: 3px; gap: 6px; }
    .cs-notes-actions .cs-btn { flex: 0 0 auto; }
    /* One note open: the reader owns the panel, the list comes back via its back arrow. */
    .cs-notes.cs-focus .cs-notes-list { display: none; }
    .cs-notes.cs-focus .cs-notes-reader { flex: 1 1 auto; }
    /* Browsing: the tree owns the whole panel. Leaving an empty reader underneath
       it clipped the list at 46% in a narrow rail and left a blank half-panel. */
    .cs-notes:not(.cs-focus) .cs-notes-list {
      flex: 1 1 auto; max-height: none; border-right: none; border-bottom: none;
    }
    .cs-notes:not(.cs-focus) .cs-notes-reader { display: none; }
    .cs-notes-reader { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; min-width: 0; }

    /* One list row: checkbox for batch export + the row button itself. */
    .cs-note-item { display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 30px; }
    .cs-note-item.cs-active { background: var(--dsw-alias-bg-layer-2); }
    .cs-note-item .cs-note-row { flex: 1 1 auto; min-width: 0; }
    .cs-note-item .cs-note-row.cs-active { background: transparent; }
    .cs-note-item .cs-note-more {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; padding: 0; border: none; border-radius: 4px;
      background: transparent; color: var(--dsw-alias-label-secondary);
      opacity: 0; cursor: pointer;
    }
    .cs-note-item:hover .cs-note-more,
    .cs-note-item:focus-within .cs-note-more { opacity: 1; }
    .cs-note-item .cs-note-more:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
    .cs-note-icon { flex: 0 0 auto; display: flex; padding-top: 1px; color: var(--dsw-alias-label-secondary); }
    .cs-tree-divider {
      display: flex; align-items: center; gap: 6px;
      margin: 6px 4px 2px; padding: 5px 4px 3px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      font-size: 10px; font-weight: 600; letter-spacing: .02em;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-tree-divider .cs-count { font-weight: 400; font-variant-numeric: tabular-nums; }
    .cs-note-check {
      flex: 0 0 auto; margin: 0 0 0 6px; width: 12px; height: 12px;
      accent-color: var(--dsw-alias-brand-primary, #2f6fed); cursor: pointer;
    }

    /* Batch-export toolbar, shown only while a selection exists. */
    .cs-bulk {
      display: flex; align-items: center; gap: 6px; padding: 3px 8px;
      font-size: 10.5px; color: var(--dsw-alias-label-secondary);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }

    .cs-folder {
      display: flex; align-items: center; gap: 5px; width: 100%;
      padding: 0 8px; min-height: 30px;
      border: none; background: transparent; cursor: pointer; text-align: left;
      font: inherit; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); min-width: 0;
    }
    .cs-folder:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-folder.cs-active { background: var(--dsw-alias-bg-layer-2); box-shadow: inset 2px 0 var(--dsw-alias-brand-primary); }
    .cs-folder .cs-twist {
      display: flex; flex: 0 0 auto; width: 14px; justify-content: center;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-folder .cs-twist[data-open='true'] { transform: rotate(90deg); }
    .cs-folder .cs-grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cs-folder .cs-count { flex: 0 0 auto; font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
    .cs-folder .cs-folder-acts { display: flex; gap: 0; opacity: 0; flex: 0 0 auto; }
    .cs-folder:hover .cs-folder-acts, .cs-folder:focus-within .cs-folder-acts { opacity: 1; }
    .cs-folder-acts .cs-iconbtn { width: 18px; height: 18px; }
    /* Folder rows carry hover actions beside the button, so a folder can be renamed
       or deleted without opening it. */
    .cs-folder-row { display: flex; align-items: center; min-width: 0; }
    .cs-folder-row .cs-folder { flex: 1 1 auto; width: auto; min-width: 0; }
    /* The chevron is its own hit target: folding is a deliberate act, not something
       a click on the folder name should do by accident. */
    .cs-chev {
      flex: 0 0 auto; width: 14px; height: 22px; display: flex; align-items: center;
      justify-content: center; padding: 0; border: none; background: transparent;
      color: var(--dsw-alias-label-secondary); cursor: pointer;
    }
    .cs-chev svg { transition: transform 0.12s ease; }
    .cs-chev[data-open='true'] svg { transform: rotate(90deg); }
    .cs-chev:hover { color: var(--dsw-alias-label-primary); }
    .cs-folder-row .cs-folder-acts { display: flex; gap: 0; flex: 0 0 auto; opacity: 0; }
    .cs-folder-row:hover .cs-folder-acts,
    .cs-folder-row:focus-within .cs-folder-acts { opacity: 1; }
    .cs-folder-row.cs-renaming,
    .cs-folder-row.cs-confirming { gap: 4px; padding: 2px 8px; min-height: 24px; }
    .cs-folder-row.cs-renaming .cs-grow { min-width: 0; }
    .cs-folder-row.cs-confirming .cs-grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Nested folders: a child row exists only while its parent is open, and the
       guide line makes the level readable at a glance — the same shape a file
       manager gives a folder tree. */
    .cs-folder-tree { display: flex; flex-direction: column; min-height: 0; }
    .cs-folder-node { display: flex; flex-direction: column; min-width: 0; }
    .cs-folder-children {
      display: flex; flex-direction: column; min-width: 0;
      margin-left: 9px; border-left: 1px solid var(--dsw-alias-border-l1);
    }

    /* Right-click menu on a note row. */
    .cs-menu {
      z-index: 40; min-width: 152px; padding: 4px;
      background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    }
    .cs-menu-title {
      padding: 2px 8px 4px; font-size: 10.5px; color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-menu-item {
      display: flex; align-items: center; gap: 6px; width: 100%;
      padding: 5px 8px; border: none; border-radius: 4px; background: transparent;
      font: inherit; font-size: 11.5px; text-align: left; cursor: pointer; color: inherit;
    }
    .cs-menu-item:hover { background: var(--dsw-alias-bg-layer-1); }

    /* Folder picker for 移动到. */
    .cs-modal-backdrop {
      position: fixed; inset: 0; z-index: 50; display: flex;
      align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.18);
    }
    .cs-modal {
      width: min(320px, 86vw); max-height: 70vh; display: flex; flex-direction: column;
      background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 8px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18); overflow: hidden;
    }
    .cs-modal-head { padding: 10px 12px 6px; font-size: 12px; font-weight: 600; }
    .cs-modal-list { padding: 0 6px 6px; overflow: auto; min-height: 0; }
    .cs-modal-item {
      display: flex; align-items: center; gap: 6px; width: 100%;
      padding: 6px 10px; border: none; border-radius: 4px; background: transparent;
      font: inherit; font-size: 11.5px; text-align: left; cursor: pointer; color: inherit;
    }
    .cs-modal-item:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-modal-item.cs-active { background: var(--dsw-alias-bg-layer-2); }
    .cs-modal-foot {
      display: flex; justify-content: flex-end; gap: 6px; padding: 8px 10px;
      border-top: 1px solid var(--dsw-alias-border-l1);
    }

    .cs-note-row {
      display: flex; align-items: center; gap: 7px; width: 100%;
      padding: 0 8px; min-height: 30px; border: none; background: transparent;
      cursor: pointer; text-align: left; font: inherit; font-size: 12px; color: inherit; min-width: 0;
    }
    .cs-note-row:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-note-row.cs-active { background: var(--dsw-alias-bg-layer-2); }
    .cs-note-row .cs-note-main { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
    .cs-note-row .cs-note-title {
      font-size: 12px; font-weight: 400; line-height: 1.4;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-note-item.cs-active .cs-note-title { font-weight: 600; }
    .cs-note-row .cs-note-time { flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-secondary); }

    .cs-reader-head {
      display: flex; flex-direction: column; gap: 3px;
      padding: 8px; flex: 0 0 auto;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-reader-head h2 { margin: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
    .cs-reader-acts { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding-top: 2px; }
    .cs-reader-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 10px 12px 24px; }
    .cs-reader-doc { max-width: 78ch; margin: 0 auto; }

    /* ---------------------------------------------------------------- *
     * Markdown subset                                                  *
     * ---------------------------------------------------------------- */
    .cs-md { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
    .cs-md > :first-child { margin-top: 0; }
    .cs-md h3 { margin: 14px 0 6px; font-size: 13px; font-weight: 650; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 3px; }
    .cs-md h4 { margin: 11px 0 4px; font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .cs-md h5 { margin: 9px 0 3px; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); opacity: .8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .cs-md p { margin: 0 0 8px; }
    .cs-md ul, .cs-md ol { margin: 0 0 8px; padding-left: 20px; }
    .cs-md li { margin: 1px 0; }
    .cs-md code {
      padding: 1px 4px; border-radius: 4px; font-size: 11px;
      background: var(--dsw-alias-bg-layer-2);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    }
    .cs-md .cs-md-code {
      margin: 0 0 10px; border-radius: 6px; overflow: hidden;
      border: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-md .cs-md-code-head {
      display: flex; align-items: center; gap: 6px; padding: 2px 8px;
      font-size: 10px; color: var(--dsw-alias-label-secondary);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-md .cs-md-code pre { margin: 0; padding: 7px 9px; overflow: auto; }
    .cs-md .cs-md-code code { background: none; padding: 0; font-size: 11px; line-height: 1.6; }
    .cs-md blockquote {
      margin: 0 0 8px; padding: 2px 0 2px 10px;
      border-left: 2px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
    }
    .cs-md hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 12px 0; }
    .cs-md a { color: var(--dsw-alias-brand-primary); text-decoration: none; }
    .cs-md a:hover { text-decoration: underline; }
    .cs-md .cs-md-table { width: 100%; border-collapse: collapse; margin: 0 0 10px; font-size: 11px; }
    .cs-md .cs-md-table th, .cs-md .cs-md-table td {
      border: 1px solid var(--dsw-alias-border-l1); padding: 3px 6px; text-align: left;
    }
    .cs-md .cs-md-table th { background: var(--dsw-alias-bg-layer-1); font-weight: 600; }

    .cs-cite {
      display: inline-flex; align-items: center; gap: 3px; vertical-align: baseline;
      max-width: min(100%, 360px);
      padding: 0 5px; margin: 0 1px; height: 18px;
      border-radius: 999px; cursor: pointer;
      font: inherit; font-size: 10px; line-height: 1;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      border: 1px solid var(--dsw-alias-border-l2);
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-cite:hover {
      border-color: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
    }
    .cs-cite .cs-cite-sym {
      padding-left: 5px; margin-left: 1px; max-width: 46%;
      border-left: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ---------------------------------------------------------------- *
     * Outline                                                          *
     * ---------------------------------------------------------------- */
    .cs-outline { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; }
    .cs-sym-row {
      display: flex; align-items: baseline; gap: 6px; width: 100%;
      padding: 2px 8px; min-height: 23px;
      border: none; background: transparent; cursor: pointer; text-align: left;
      font: inherit; color: inherit; min-width: 0;
    }
    .cs-sym-row:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-sym-row .cs-sym-name { font-weight: 600; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cs-sym-row .cs-sym-sig {
      flex: 1 1 auto; min-width: 0; font-size: 10px;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    }
    .cs-sym-row .cs-sym-line { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

    .cs-import-row {
      display: flex; align-items: baseline; gap: 6px; padding: 2px 8px; min-height: 21px;
      font-size: 11px; min-width: 0;
    }
    .cs-import-row .cs-imp-name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
    .cs-import-row .cs-imp-line { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

    /* ---------------------------------------------------------------- *
     * Annotated viewer                                                 *
     * ---------------------------------------------------------------- */
    .cs-av { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base); }
    .cs-av-bar {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 5px 8px; flex: 0 0 auto; min-height: 32px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-av-path {
      flex: 1 1 auto; min-width: 0; font-size: 11px; direction: rtl; text-align: left;
      color: var(--dsw-alias-label-secondary);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    }
    .cs-av-scroll {
      flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain;
      padding: 8px 0 32px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px; line-height: 21px;
    }
    .cs-av-line { display: flex; align-items: flex-start; min-height: 21px; }
    .cs-av-gutter {
      flex: 0 0 auto; width: 46px; padding: 0 6px 0 0; text-align: right;
      font-size: 10px; color: var(--dsw-alias-label-secondary);
      user-select: none; cursor: pointer; font-variant-numeric: tabular-nums;
    }
    .cs-av-gutter:hover { color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); }
    .cs-av-text { flex: 1 1 auto; min-width: 0; white-space: pre; padding-right: 12px; }
    .cs-av-line.cs-picked { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
    .cs-av-line.cs-picked .cs-av-gutter { color: var(--dsw-alias-brand-primary); }
    .cs-av-line.cs-annotated { border-left: 2px solid var(--dsw-alias-state-success-primary); }
    .cs-av-line.cs-flash { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
    .cs-av-note {
      display: flex; align-items: flex-start; gap: 6px;
      margin: 2px 12px 6px 46px; padding: 5px 7px; border-radius: 5px;
      font-family: inherit; font-size: 11px; line-height: 1.55;
      background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
      border-left: 2px solid var(--dsw-alias-state-success-primary);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .cs-av-note .cs-grow { color: var(--dsw-alias-label-primary); }
    .cs-av-note b { display: block; font-size: 10.5px; font-weight: 600; }
    .cs-av-form { margin: 4px 12px 10px 46px; display: flex; flex-direction: column; gap: 4px; }
    .cs-av-form .cs-row { gap: 4px; }
    .cs-av-large {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 32px 20px; text-align: center; height: 100%;
      color: var(--dsw-alias-label-secondary); font-size: 12px;
    }
    .cs-av-large b { color: var(--dsw-alias-label-primary); font-size: 13px; }
    .cs-av-large p { margin: 0; max-width: 46ch; }

    /* ---------------------------------------------------------------- *
     * Composer chip                                                    *
     * ---------------------------------------------------------------- */
    .cs-chip-wrap { display: flex; align-items: center; justify-content: flex-end; padding: 2px 10px 0; gap: 6px; }
    .cs-chip-wrap .cs-chip { max-width: min(100%, 360px); }
    .cs-chip-wrap .cs-chip-copy { color: var(--dsw-alias-label-secondary); }
    `;

    /** The `data-codeslice` value on the injected `<style>` element. */
    const STYLE_MARKER = 'core';

    /**
     * Stylesheet fragments contributed by the workbench's own modules.
     *
     * The panel's CSS is one template literal above, which means two authors adding
     * rules to it in parallel would conflict on every edit and one of them would lose
     * their block. Each feature module therefore owns a fragment and registers it
     * here at load time; `index.js` injects them after the base sheet, which is what
     * gives a feature the last word on a selector it shares with the shell.
     *
     * Fragments follow the same discipline as the base sheet and are checked by
     * `dev/audit-checks.mjs`: every selector starts with `cs-`, no `:root`, no
     * `body`, no `!important`, and colours come only from `--dsw-*` tokens.
     */
    const FRAGMENTS = [];

    /**
     * Register one CSS fragment.
     * @param css - the fragment's rules.
     * @returns a disposer, so a module reloaded in place cannot double its rules.
     */
    function registerStyles(css) {
      if (typeof css !== 'string' || css.trim() === '') return () => {};
      FRAGMENTS.push(css);
      return () => {
        const index = FRAGMENTS.indexOf(css);
        if (index >= 0) FRAGMENTS.splice(index, 1);
      };
    }

    /**
     * The complete sheet: the base rules, then every registered fragment in
     * registration order.
     * @returns the CSS text to inject.
     */
    function fullCss() {
      return FRAGMENTS.length === 0 ? CSS : `${CSS}\n${FRAGMENTS.join('\n')}`;
    }

    /* ================================================================ *
     * markdown.js
     * ================================================================ */
    /**
     * A Markdown subset, rendered to React nodes.
     *
     * Scoped to what a *note* actually contains: headings, lists, fenced code,
     * inline code, emphasis, links, and `path:line` citations. Not a general
     * Markdown engine — raw HTML is deliberately not supported (no
     * `dangerouslySetInnerHTML` anywhere in this bundle), and nested blocks are not
     * attempted, which is exactly the original's contract
     * (`Markdown.tsx:8-26`, `spec §6.3`).
     *
     * Two details are load-bearing and were mined as-is:
     *
     *   1. A closing fence must be at least as long as its opener. Without that, a
     *      note that quotes a Markdown file inside a fence terminates its own code
     *      block early and the rest of the note renders as prose.
     *   2. `path:line` is recognised in *prose only*. Code spans are tokenized
     *      first, so `a.py:1` inside backticks stays literal text, and the boundary
     *      class means `（src/a.ts:12-30）` works while `Dockerfile:3` does not.
     */

    /**
     * `path:line` in prose, verbatim from `Markdown.tsx:427`.
     *
     * The leading boundary is consumed by the match, which is why `pushPlain`
     * re-emits the chunk before `match.index` rather than from it.
     */
    const CITE = /(^|[\s(（[`"'])([\w@./\\-]+\.[A-Za-z0-9]{1,8}):L?(\d+)(?:[-–](\d+))?(?=$|[\s),.;:，。；）\]`"'])/g;

    /** Fence: three or more backticks or tildes, optional language (`Markdown.tsx:82`). */
    const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/u;
    /** ATX heading: one to six `#`, a space, then text. */
    const HEADING = /^(#{1,6})\s+(.*)$/u;
    /** Horizontal rule: three or more of one marker, alone on a line. */
    const HR = /^\s*([-*_])\1{2,}\s*$/u;
    /** Unordered list item. */
    const UL = /^\s{0,3}[-*+]\s+(.*)$/u;
    /** Ordered list item. */
    const OL = /^\s{0,3}(\d+)[.)]\s+(.*)$/u;
    /** Blockquote. */
    const QUOTE = /^\s{0,3}>\s?(.*)$/u;
    /** Standalone image. */
    const IMAGE = /^\s*!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)\s*$/u;
    /** A pipe table's separator row. */
    const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/u;

    /**
     * Split a table row on unescaped pipes outside backticks.
     *
     * `\|` is an escape, which is the only way to put a pipe in a cell
     * (`Markdown.tsx:95-119`).
     * @param line - the row.
     * @returns the cell texts, trimmed.
     */
    function splitRow(line) {
      const text = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
      const cells = [];
      let cell = '';
      let inCode = false;
      for (let index = 0; index < text.length; index += 1) {
        const ch = text[index];
        if (ch === '\\' && text[index + 1] === '|') {
          cell += '|';
          index += 1;
          continue;
        }
        if (ch === '`') inCode = !inCode;
        if (ch === '|' && !inCode) {
          cells.push(cell.trim());
          cell = '';
          continue;
        }
        cell += ch;
      }
      cells.push(cell.trim());
      return cells;
    }

    /**
     * Is a row a valid table separator, and what are the alignments?
     * @param line - the candidate row.
     * @returns `null` when it is not a separator, else one alignment per column.
     */
    function tableAlignments(line) {
      if (!TABLE_SEP.test(line)) return null;
      return splitRow(line).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
      });
    }

    /**
     * Block-level parse.
     *
     * @param text - the Markdown source.
     * @returns an array of block descriptors; `renderBlocks` turns them into nodes.
     */
    function parseBlocks(text) {
      const source = String(text ?? '').replace(/\r\n?/gu, '\n');
      const lines = source.split('\n');
      const blocks = [];
      let index = 0;

      while (index < lines.length) {
        const line = lines[index];

        if (line.trim() === '') {
          index += 1;
          continue;
        }

        const fence = FENCE.exec(line);
        if (fence !== null) {
          const marker = fence[2];
          const indent = fence[1].length;
          const body = [];
          index += 1;
          while (index < lines.length) {
            const closing = FENCE.exec(lines[index]);
            // Shorter or differently-marked fence does not close this block: that
            // is what keeps a quoted Markdown file from terminating the outer code.
            if (closing !== null && closing[2][0] === marker[0] && closing[2].length >= marker.length) {
              index += 1;
              break;
            }
            body.push(lines[index].slice(Math.min(indent, lines[index].length)));
            index += 1;
          }
          blocks.push({ type: 'code', lang: fence[3] ?? '', text: body.join('\n') });
          continue;
        }

        const heading = HEADING.exec(line);
        if (heading !== null) {
          blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
          index += 1;
          continue;
        }

        if (HR.test(line)) {
          blocks.push({ type: 'hr' });
          index += 1;
          continue;
        }

        if (index + 1 < lines.length && line.includes('|')) {
          const alignments = tableAlignments(lines[index + 1]);
          if (alignments !== null) {
            const header = splitRow(line);
            const rows = [];
            index += 2;
            while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
              rows.push(splitRow(lines[index]));
              index += 1;
            }
            blocks.push({ type: 'table', header, alignments, rows });
            continue;
          }
        }

        const image = IMAGE.exec(line);
        if (image !== null) {
          blocks.push({ type: 'image', alt: image[1], src: image[2], title: image[3] ?? '' });
          index += 1;
          continue;
        }

        if (QUOTE.test(line)) {
          const quoted = [];
          while (index < lines.length) {
            const match = QUOTE.exec(lines[index]);
            if (match === null) break;
            quoted.push(match[1]);
            index += 1;
          }
          blocks.push({ type: 'quote', lines: quoted });
          continue;
        }

        if (UL.test(line)) {
          const items = [];
          while (index < lines.length) {
            const match = UL.exec(lines[index]);
            if (match === null) break;
            items.push(match[1]);
            index += 1;
          }
          blocks.push({ type: 'ul', items });
          continue;
        }

        if (OL.test(line)) {
          const items = [];
          let start = 1;
          while (index < lines.length) {
            const match = OL.exec(lines[index]);
            if (match === null) break;
            if (items.length === 0) start = Number(match[1]);
            items.push(match[2]);
            index += 1;
          }
          blocks.push({ type: 'ol', items, start });
          continue;
        }

        // Paragraph: consecutive non-blank, non-block-starting lines.
        const paragraph = [];
        while (index < lines.length) {
          const current = lines[index];
          if (current.trim() === '') break;
          if (FENCE.test(current) || HEADING.test(current) || HR.test(current)
            || UL.test(current) || OL.test(current) || QUOTE.test(current)
            || IMAGE.test(current)) break;
          if (index + 1 < lines.length && current.includes('|') && tableAlignments(lines[index + 1]) !== null) break;
          paragraph.push(current);
          index += 1;
        }
        if (paragraph.length === 0) {
          // A line that only looked like a block start but was not (e.g. `#` alone):
          // consume it so the loop cannot spin.
          paragraph.push(lines[index]);
          index += 1;
        }
        blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
      }

      return blocks;
    }

    /**
     * Inline tokens, in the original's precedence order (`Markdown.tsx:442-443`):
     * code, image, link, bold, italic. Anything unmatched is literal text.
     *
     * Precedence matters: `**a `b` c**` has to keep the code span intact, so code is
     * matched before emphasis and its contents are never re-scanned.
     */
    const INLINE = /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*]+?)\*|_([^_]+?)_/u;

    /**
     * Tokenize one inline string into text / code / link / strong / em / cite.
     * @param text - the raw inline source.
     * @param keyBase - a prefix so React keys stay unique across siblings.
     * @returns tokens.
     */
    function tokenizeInline(text, keyBase) {
      const tokens = [];
      let rest = String(text ?? '');
      let guard = 0;

      while (rest !== '' && guard < 4000) {
        guard += 1;
        const match = INLINE.exec(rest);
        if (match === null) {
          tokens.push({ type: 'text', text: rest });
          break;
        }
        if (match.index > 0) tokens.push({ type: 'text', text: rest.slice(0, match.index) });
        const whole = match[0];
        rest = rest.slice(match.index + whole.length);

        if (match[2] !== undefined) {
          tokens.push({ type: 'code', text: match[2].trim() === '' ? match[2] : match[2] });
        } else if (match[4] !== undefined) {
          tokens.push({
            type: 'image', alt: match[3] ?? '', src: match[4], title: match[5] ?? '',
          });
        } else if (match[7] !== undefined) {
          tokens.push({
            type: 'link', text: match[6] ?? '', href: match[7], title: match[8] ?? '',
          });
        } else if (match[9] !== undefined) {
          tokens.push({ type: 'strong', text: match[9] });
        } else if (match[10] !== undefined) {
          tokens.push({ type: 'strong', text: match[10] });
        } else if (match[11] !== undefined) {
          tokens.push({ type: 'em', text: match[11] });
        } else if (match[12] !== undefined) {
          tokens.push({ type: 'em', text: match[12] });
        }
      }

      return tokens.map((token, index) => ({ ...token, key: `${keyBase}-${index}` }));
    }

    /**
     * Split plain text into text runs and citation tokens.
     *
     * Verbatim algorithm from `Markdown.tsx:469-484`: emit the slice before the
     * match, then a cite token, and advance past `match[0]` (which swallows the
     * boundary character so it is not emitted twice).
     * @param text - a plain-text run (never inside a code span).
     * @param keyBase - a key prefix.
     * @param onOpen - `(path, start, end) => void`, invoked on click.
     * @param t - the translator.
     * @returns an array of nodes.
     */
    function pushPlain(text, keyBase, onOpen, t) {
      if (text === '') return [];
      const CITE_NODE = [];
      CITE.lastIndex = 0;
      let last = 0;
      let index = 0;
      let match = CITE.exec(text);
      while (match !== null) {
        const path = match[2];
        const start = Number(match[3]);
        const end = match[4] === undefined ? start : Number(match[4]);
        const at = match.index + (match[1] === undefined ? 0 : match[1].length);
        if (at > last) CITE_NODE.push(text.slice(last, at));
        const label = match[4] === undefined ? `${path}:${start}` : `${path}:${start}-${end}`;
        CITE_NODE.push(h('button', {
          key: `${keyBase}-c${index}`,
          type: 'button',
          className: 'cs-cite',
          title: label,
          onClick: () => { if (typeof onOpen === 'function') onOpen(path, start, end); },
        }, h('span', null, label)));
        index += 1;
        last = match.index + match[0].length;
        match = CITE.exec(text);
      }
      if (last < text.length) CITE_NODE.push(text.slice(last));
      // Interleave: strings become text nodes, the injected nodes stay as they are.
      return CITE_NODE.map((piece, offset) => (
        typeof piece === 'string'
          ? piece
          : h('span', { key: `${keyBase}-cw${offset}`, className: 'cs-cite-wrap' }, piece)
      ));
    }

    /**
     * Render one inline string.
     * @param text - the source.
     * @param keyBase - a key prefix.
     * @param onOpen - `(path, start, end) => void`.
     * @param t - the translator (only used for fallbacks).
     * @returns nodes.
     */
    function renderInline(text, keyBase, onOpen, t) {
      const tokens = tokenizeInline(text, keyBase);
      const out = [];
      for (const token of tokens) {
        if (token.type === 'text') {
          out.push(...pushPlain(token.text, token.key, onOpen, t));
          continue;
        }
        if (token.type === 'code') {
          out.push(h('code', { key: token.key }, token.text));
          continue;
        }
        if (token.type === 'strong') {
          out.push(h('strong', { key: token.key }, renderInline(token.text, token.key, onOpen, t)));
          continue;
        }
        if (token.type === 'em') {
          out.push(h('em', { key: token.key }, renderInline(token.text, token.key, onOpen, t)));
          continue;
        }
        if (token.type === 'link') {
          // `noopener noreferrer` and a new tab: a note may quote any URL, and the
          // panel must not become a navigation surface.
          out.push(h('a', {
            key: token.key,
            href: token.href,
            title: token.title === '' ? undefined : token.title,
            target: '_blank',
            rel: 'noreferrer noopener',
          }, renderInline(token.text, token.key, onOpen, t)));
          continue;
        }
        if (token.type === 'image') {
          // An image that cannot load degrades to its alt text rather than an icon.
          out.push(h('span', { key: token.key, className: 'cs-md-img-alt' }, token.alt === '' ? token.src : token.alt));
        }
      }
      return out;
    }

    /**
     * Render a Markdown document.
     *
     * @param props - `{text, onOpenCitation, t}`:
     *   `text` is the Markdown source; `onOpenCitation(path, start, end)` is called
     *   when a `path:line` chip or a `path:line`-bearing link is clicked; `t` is the
     *   translator (the copy button's two labels only).
     * @returns the rendered block list.
     */
    function Markdown(props) {
      const {
        text, onOpenCitation, t,
      } = props;
      const blocks = useMemo(() => parseBlocks(text), [text]);
      const [copied, setCopied] = useState(-1);

      useEffect(() => {
        if (copied < 0) return undefined;
        const timer = setTimeout(() => setCopied(-1), 1400);
        return () => clearTimeout(timer);
      }, [copied]);

      const open = typeof onOpenCitation === 'function' ? onOpenCitation : () => {};

      const nodes = blocks.map((block, index) => {
        const key = `b${index}`;
        if (block.type === 'heading') {
          // `#`/`##` become an h3: the reader already renders the note's title, so a
          // real h1 here would fight it (`spec §6.2`).
          const tag = block.level <= 2 ? 'h3' : block.level === 3 ? 'h4' : 'h5';
          return h(tag, { key }, renderInline(block.text, key, open, t));
        }
        if (block.type === 'code') {
          return h('div', { key, className: 'cs-md-code' },
            h('div', { className: 'cs-md-code-head' },
              h('span', { className: 'cs-grow cs-ellipsis' }, block.lang === '' ? 'text' : block.lang),
              h('button', {
                type: 'button',
                className: 'cs-btn cs-ghost cs-small',
                onClick: () => {
                  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
                  if (clip === undefined || typeof clip.writeText !== 'function') return;
                  clip.writeText(block.text).then(() => setCopied(index)).catch(() => {});
                },
              }, copied === index ? t('common.copied') : t('common.copy'))),
            h('pre', null, h('code', null, block.text)));
        }
        if (block.type === 'hr') return h('hr', { key, className: 'cs-md-hr' });
        if (block.type === 'quote') {
          return h('blockquote', { key }, block.lines.map((line, lineIndex) => (
            h('p', { key: `${key}-${lineIndex}` }, renderInline(line, `${key}-${lineIndex}`, open, t))
          )));
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const tag = block.type === 'ul' ? 'ul' : 'ol';
          return h(tag, { key, ...(block.type === 'ol' && block.start !== 1 ? { start: block.start } : {}) },
            block.items.map((item, itemIndex) => (
              h('li', { key: `${key}-${itemIndex}` }, renderInline(item, `${key}-${itemIndex}`, open, t))
            )));
        }
        if (block.type === 'table') {
          const headCells = block.header.map((cell, cellIndex) => h('th', {
            key: cellIndex,
            style: block.alignments[cellIndex] === '' ? undefined : { textAlign: block.alignments[cellIndex] },
          }, renderInline(cell, `${key}-h${cellIndex}`, open, t)));

          const bodyRows = block.rows.map((row, rowIndex) => h('tr', { key: rowIndex },
            row.map((cell, cellIndex) => h('td', {
              key: cellIndex,
              style: block.alignments[cellIndex] === '' ? undefined : { textAlign: block.alignments[cellIndex] },
            }, renderInline(cell, `${key}-r${rowIndex}c${cellIndex}`, open, t)))));

          return h('div', { key, className: 'cs-md-table-wrap' },
            h('table', { className: 'cs-md-table' },
              h('thead', null, h('tr', null, headCells)),
              h('tbody', null, bodyRows)));
        }
        if (block.type === 'image') {
          return h('div', { key, className: 'cs-md-img' }, h('span', null, block.alt === '' ? block.src : block.alt));
        }
        return h('p', { key, className: 'cs-md-p' }, renderInline(block.text, key, open, t));
      });

      return h('div', { className: 'cs-md' }, nodes);
    }

    /**
     * Strip a leading `# Title` from a note body.
     *
     * The reader's title bar already shows it, so rendering it again reads like a
     * duplicate heading (`NoteReader.tsx:290-292`, `spec §12` invariant 12).
     * @param body - the note body.
     * @returns the body without its leading H1 and the blank lines after it.
     */
    function stripTitleLine(body) {
      return String(body ?? '').replace(/^#\s+.*(\r?\n)+/u, '');
    }

    /**
     * The list-row excerpt for a note.
     *
     * Verbatim rules from `NotesPanel.tsx:12-25`: strip the title, strip heading and
     * bullet markers, then drop a leading `知识点 | 要点 | 何时使用` label line.
     * @param body - the note body.
     * @param limit - maximum characters.
     * @returns a single-line excerpt.
     */
    function noteExcerpt(body, limit = 140) {
      const text = stripTitleLine(body)
        .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
        .replace(/^\s{0,3}[-*+]\s+/gmu, '')
        .trim();
      const labelled = text.replace(/^(知识点|要点|何时使用)[：:]\s*/u, '');
      const out = (labelled === '' ? text : labelled).replace(/\s+/gu, ' ');
      return out.length > limit ? `${out.slice(0, limit - 1)}…` : out;
    }

    /* ================================================================ *
     * notes-panel.js
     * ================================================================ */







    /**
     * The `codeslice:knowledge` tab.
     *
     * Three columns in one panel: folder tree, note list, reader. The reference
     * spreads these across a 268 px sidebar and a middle pane; here they share one
     * host tab, so the layout is measured (not queried) and folds into a stack when
     * the panel is narrower than `NARROW_STACK` — a folder tree that cannot show a
     * folder name is worse than no tree.
     *
     * Deliberate departures, all of them because the host owns what the desktop app
     * had to build:
     *
     *   - `window.prompt` / `window.confirm` are gone. Rename and delete happen
     *     inline: the host may replace `window` dialogs, and a `confirm()` inside a
     *     parked tab blocks the whole page.
     *   - No `move_folder` flag: that is a desktop-backend idempotence hack
     *     (`types.ts:604-611`); this wire takes `folderId` directly (`WIRE.md §6`).
     *   - The note body is rendered by `markdown.js`, so `### path:line` headings
     *     become clickable citations rather than plain text.
     */

    /** Below this width the three columns become one stack. */
    const NARROW_STACK = 560;

    /**
     * @param props - `{ctx, store, scope, tab, visible, onOpenFile, t, locale}`.
     *   `scope.cwd` scopes every request; `visible === false` stops all fetching;
     *   `onOpenFile(path)` is used only when the host sidebar cannot open files.
     * @returns the panel.
     */
    function NotesPanel(props) {
      const {
        ctx, scope, visible, onOpenFile, t, locale,
      } = props;
      const parked = visible === false;

      const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const [folders, setFolders] = useState([]);
      const [notes, setNotes] = useState([]);
      const [note, setNote] = useState(undefined);
      const [folderId, setFolderId] = useState(undefined);
      const [query, setQuery] = useState('');
      const [openFolders, setOpenFolders] = useState(() => new Set());
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(undefined);
      const [notice, setNotice] = useState(undefined);
      const [mode, setMode] = useState({ kind: 'idle' });
      const [narrow, setNarrow] = useState(false);
      const [selected, setSelected] = useState(() => new Set());
      // Checkboxes only exist while exporting: a checkbox on every row makes the list
      // look like a bulk tool instead of a shelf you read from.
      const [exportMode, setExportMode] = useState(false);
      const [renaming, setRenaming] = useState(undefined);
      const [confirming, setConfirming] = useState(undefined);
      const [importOpen, setImportOpen] = useState(false);
      const [importPath, setImportPath] = useState('');
      const [importBusy, setImportBusy] = useState(false);
      // Right-click on a note opens a small menu; only the actions that need a
      // second step (choosing a folder) open a dialog. The menu is `{x, y, id, title}`.
      const [menu, setMenu] = useState(undefined);
      const [moving, setMoving] = useState(undefined);
      const alive = useRef(true);
      const hostRef = useRef(null);
      const searchRef = useRef(null);
      const fileRef = useRef(null);

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      /* ---- measure ---- */
      useEffect(() => {
        const element = hostRef.current;
        if (element === null || element === undefined || parked) return undefined;
        const read = () => {
          const rect = element.getBoundingClientRect();
          setNarrow(rect.width < NARROW_STACK);
        };
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(read);
        observer.observe(element);
        return () => observer.disconnect();
      }, [parked, note]);

      /* ---- list ---- */

      const refresh = useCallback(async () => {
        setLoading(true);
        try {
          const value = await call('notes', { op: 'list' });
          if (!alive.current) return;
          setFolders(Array.isArray(value.folders) ? value.folders : []);
          setNotes(Array.isArray(value.notes) ? value.notes : []);
          setError(undefined);
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setLoading(false);
        }
      }, [call]);

      useEffect(() => {
        if (parked) return;
        void refresh();
      }, [parked, refresh]);

      /* ---- open ---- */

      const open = useCallback(async (id) => {
        setBusy(true);
        setError(undefined);
        try {
          const value = await call('notes', { op: 'read', id });
          if (alive.current) {
            setNote(value.note);
            setMode({ kind: 'read' });
          }
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call]);

      /* ---- mutations ---- */

      const createNote = useCallback(async (title, body) => {
        setBusy(true);
        try {
          const value = await call('notes', {
            op: 'create',
            title,
            body,
            folderId: folderId ?? undefined,
          });
          if (!alive.current) return;
          setNote(value.note);
          setMode({ kind: 'read' });
          setNotice(t('common.save'));
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, folderId, refresh, t]);

      const updateNote = useCallback(async (patch) => {
        if (note === undefined) return;
        setBusy(true);
        try {
          const value = await call('notes', { op: 'update', id: note.id, ...patch });
          if (!alive.current) return;
          setNote(value.note);
          setMode({ kind: 'read' });
          setNotice(t('common.save'));
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, note, refresh, t]);

      /**
       * Re-file any note, not only the one on screen: the right-click menu acts on
       * the row that was clicked, which may be a different note than the reader's.
       * Passing `null` sends it back to 未分类.
       */
      const moveNoteTo = useCallback(async (id, nextFolderId) => {
        setBusy(true);
        try {
          const value = await call('notes', {
            op: 'update',
            id,
            folderId: nextFolderId ?? null,
          });
          if (!alive.current) return;
          if (note !== undefined && note.id === id && value !== undefined && value.note !== undefined) {
            setNote(value.note);
          }
          // The destination folder collapses once the note lands in it — the tree
          // stays compact instead of unfolding a folder the user did not open.
          if (nextFolderId !== undefined && nextFolderId !== null) {
            setOpenFolders((current) => {
              const next = new Set(current);
              next.delete(nextFolderId);
              return next;
            });
          }
          setNotice(t('notes.move.moved'));
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, note, refresh, t]);

      const deleteNote = useCallback(async () => {
        if (note === undefined) return;
        setBusy(true);
        try {
          await call('notes', { op: 'delete', id: note.id });
          if (!alive.current) return;
          setNote(undefined);
          setMode({ kind: 'idle' });
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, note, refresh]);

      const createFolder = useCallback(async (name) => {
        setBusy(true);
        try {
          const value = await call('notes', { op: 'createFolder', name, parentId: folderId ?? undefined });
          if (!alive.current) return;
          // A created folder must hand the panel back to the list: staying in the form
          // is how nine folders named 目录 were made one click each.
          setMode({ kind: 'idle' });
          setNotice(t('notes.folder.created', { name: value?.folder?.name ?? name }));
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, folderId, refresh, t]);

      const renameFolder = useCallback(async (id, name) => {
        setBusy(true);
        try {
          await call('notes', { op: 'renameFolder', id, name });
          if (!alive.current) return;
          setRenaming(undefined);
          setNotice(t('notes.folder.renamed'));
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, refresh, t]);

      const deleteFolder = useCallback(async (id) => {
        setBusy(true);
        try {
          const value = await call('notes', { op: 'deleteFolder', id });
          if (!alive.current) return;
          setConfirming(undefined);
          if (folderId === id) setFolderId(undefined);
          setNotice(t('notes.folder.deleted', { count: value?.moved ?? 0 }));
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, folderId, refresh, t]);

      const exportNote = useCallback(async () => {
        if (note === undefined) return;
        try {
          const value = await call('notes', { op: 'export', id: note.id });
          if (alive.current) setNotice(t('notes.reader.exported', { path: value.path }));
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        }
      }, [call, note, t]);

      /* ---- import / batch export ---- */

      const runImport = useCallback(async (items, paths) => {
        setImportBusy(true);
        setError(undefined);
        try {
          const value = await call('notes', { op: 'import', items, paths });
          if (!alive.current) return;
          setNotice(t('notes.imported', { count: value.imported ?? 0 }));
          setImportOpen(false);
          setImportPath('');
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setImportBusy(false);
        }
      }, [call, refresh, t]);

      const importFromFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList ?? []);
        if (files.length === 0) return;
        const items = [];
        for (const file of files) {
          let body = '';
          try {
            body = await file.text();
          } catch {
            body = '';
          }
          if (body.trim() === '') continue;
          items.push({ title: '', name: file.name, body });
        }
        if (items.length === 0) {
          setError(t('notes.importEmpty'));
          return;
        }
        await runImport(items, undefined);
      }, [runImport, t]);

      const importFromPaths = useCallback(async () => {
        const paths = importPath.split(/[\n,;]/u).map((row) => row.trim()).filter((row) => row !== '');
        if (paths.length === 0) {
          setError(t('notes.importEmpty'));
          return;
        }
        await runImport(undefined, paths);
      }, [importPath, runImport, t]);

      const exportMany = useCallback(async (ids) => {
        setBusy(true);
        setError(undefined);
        try {
          const value = await call('notes', {
            op: 'exportMany',
            ...(Array.isArray(ids) ? { ids } : {}),
          });
          if (!alive.current) return;
          setNotice(t('notes.exportedMany', { count: value.count ?? 0, path: value.dir ?? '' }));
          if (Array.isArray(ids)) setSelected(new Set());
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, t]);

      const toggleSelected = useCallback((id) => {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const backToList = useCallback(() => {
        setNote(undefined);
        setMode({ kind: 'idle' });
      }, []);

      /* ---- keyboard: `/` and Esc, never while typing ---- */

      useEffect(() => {
        if (parked) return undefined;
        const onKeyDown = (event) => {
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
          const target = event.target;
          const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
          const editable = tag === 'input' || tag === 'textarea' || tag === 'select';
          if (event.key === 'Escape') {
            if (editable) { target.blur(); return; }
            setQuery('');
            setMode({ kind: 'idle' });
            setNote(undefined);
            setSelected(new Set());
            setExportMode(false);
            return;
          }
          if (editable) return;
          if (event.key === '/') {
            event.preventDefault();
            searchRef.current?.focus();
          }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [parked]);

      // A context menu or dialog closes on any click that is not part of it. The
      // listener waits a tick so the click that opened the menu does not close it.
      useEffect(() => {
        if (menu === undefined && moving === undefined) return undefined;
        const close = () => setMenu(undefined);
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          setMenu(undefined);
          setMoving(undefined);
        };
        const timer = setTimeout(() => {
          window.addEventListener('click', close);
          window.addEventListener('resize', close);
          window.addEventListener('keydown', onKey);
        }, 0);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('click', close);
          window.removeEventListener('resize', close);
          window.removeEventListener('keydown', onKey);
        };
      }, [menu, moving]);

      const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
      const searching = query.trim() !== '';
      // Search spans the whole library, the way a file tree's quick-open does; the
      // tree itself is the normal navigation surface and ignores the folder scope.
      const searchResults = useMemo(
        () => (searching ? filterNotes(notes, query, undefined) : []),
        [notes, query, searching],
      );
      const visibleNotes = searching ? searchResults : notes;
      const notesOf = useCallback(
        (id) => visibleNotes.filter((row) => (row.folderId ?? undefined) === id),
        [visibleNotes],
      );

      // Reading or editing one note takes the whole panel: a long list above a
      // half-height reader is unusable once the library grows, so the list is hidden
      // until the reader's back arrow brings it back.
      const focused = note !== undefined || mode.kind !== 'idle';

      /**
       * A note is a leaf in the tree: same row in a folder, under 全部笔记, or in a
       * search result — only its indent changes, exactly like a file in VS Code.
       */
      const renderNoteRow = (row, depth) => {
        const active = note !== undefined && note.id === row.id;
        return h('div', {
          key: row.id,
          className: `cs-note-item${active ? ' cs-active' : ''}`,
          style: { paddingLeft: `${2 + depth * 14}px` },
          onContextMenu: (event) => {
            event.preventDefault();
            setMenu({
              x: event.clientX, y: event.clientY, id: row.id, title: row.title,
            });
          },
        },
        exportMode ? h('input', {
          type: 'checkbox',
          className: 'cs-note-check',
          checked: selected.has(row.id),
          'aria-label': t('notes.select'),
          title: t('notes.select'),
          onChange: () => toggleSelected(row.id),
        }) : null,
        h('button', {
          type: 'button',
          className: `cs-note-row${active ? ' cs-active' : ''}`,
          title: row.title,
          onClick: () => { void open(row.id); },
        },
        h('span', { className: 'cs-note-icon' }, Glyph.notes(12)),
        h('span', { className: 'cs-note-main' },
          h('span', { className: 'cs-note-title' }, row.title))),
        // Desktop keeps per-row actions on hover; right-click stays as the fast path.
        h('button', {
          type: 'button',
          className: 'cs-note-more',
          title: t('notes.more'),
          'aria-label': t('notes.more'),
          onClick: (event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({
              x: Math.max(8, rect.right - 160),
              y: Math.min(rect.bottom + 2, Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 120)),
              id: row.id,
              title: row.title,
            });
          },
        }, Glyph.more(14)));
      };

      /**
       * Folder rows as a tree. Children render only while their parent is open, so a
       * collapsed folder is one line instead of dumping ten subfolders under it —
       * indentation (`6 + depth*14`) mirrors the reference's file-tree behaviour.
       */
      const renderFolders = (rows, depth) => (rows ?? []).map((folder) => {
        const kids = Array.isArray(folder.children) ? folder.children : [];
        const files = notesOf(folder.id);
        const childRows = renderFolders(kids, depth + 1);
        // Search keeps the tree instead of flattening it: a folder survives when it
        // has a matching note, a matching descendant, or a matching name.
        const nameHit = folder.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
        if (searching && childRows.length === 0 && files.length === 0 && !nameHit) return null;

        const isOpen = searching || openFolders.has(folder.id);
        const editing = renaming !== undefined && renaming.id === folder.id;
        const asking = confirming === folder.id;
        const indent = `${6 + depth * 14}px`;
        const toggle = () => setOpenFolders((current) => {
          const next = new Set(current);
          if (next.has(folder.id)) next.delete(folder.id);
          else next.add(folder.id);
          return next;
        });
        let row;
        if (editing) {
          row = h('div', { className: 'cs-folder-row cs-renaming', style: { paddingLeft: indent } },
            h('span', { className: 'cs-twist' }, Glyph.folder(12)),
            h('input', {
              className: 'cs-input cs-grow',
              style: { minWidth: '0' },
              value: renaming.name,
              autoFocus: true,
              'aria-label': t('notes.folder.rename'),
              onChange: (event) => setRenaming({ id: folder.id, name: event.target.value }),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && renaming.name.trim() !== '') {
                  event.preventDefault();
                  void renameFolder(folder.id, renaming.name.trim());
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setRenaming(undefined);
                }
              },
            }),
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small',
              disabled: busy || renaming.name.trim() === '',
              onClick: () => { void renameFolder(folder.id, renaming.name.trim()); },
            }, t('common.save')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small', onClick: () => setRenaming(undefined),
            }, t('common.cancel')));
        } else if (asking) {
          row = h('div', { className: 'cs-folder-row cs-confirming', style: { paddingLeft: indent } },
            h('span', { className: 'cs-grow', style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } },
              t('notes.folder.deleteConfirm')),
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small cs-primary',
              disabled: busy,
              onClick: () => { void deleteFolder(folder.id); },
            }, t('notes.folder.delete')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small', onClick: () => setConfirming(undefined),
            }, t('common.cancel')));
        } else {
          row = h('div', { className: 'cs-folder-row', style: { paddingLeft: indent } },
            // Explorer semantics: the chevron alone folds the node; the name selects
            // it and reveals it. One button for both made a click on the name look
            // like the folder had vanished.
            h('button', {
              type: 'button',
              className: 'cs-chev',
              'data-open': isOpen ? 'true' : 'false',
              title: t('notes.folder.toggle'),
              'aria-label': t('notes.folder.toggle'),
              onClick: toggle,
            }, Glyph.chevronRight(11)),
            h('button', {
              type: 'button',
              className: `cs-folder${folderId === folder.id ? ' cs-active' : ''}`,
              title: folder.name,
              onClick: () => {
                setFolderId(folder.id);
                setOpenFolders((current) => {
                  if (current.has(folder.id)) return current;
                  const next = new Set(current);
                  next.add(folder.id);
                  return next;
                });
              },
            },
            isOpen ? Glyph.folderOpen(12) : Glyph.folder(12),
            h('span', { className: 'cs-grow' }, folder.name),
            h('span', { className: 'cs-count' }, formatInt(folder.noteCount ?? folder.count ?? 0, locale))),
            h('div', { className: 'cs-folder-acts' },
              h('button', {
                type: 'button',
                className: 'cs-iconbtn',
                title: t('notes.folder.rename'),
                'aria-label': t('notes.folder.rename'),
                onClick: () => setRenaming({ id: folder.id, name: folder.name }),
              }, Glyph.pencil(11)),
              h('button', {
                type: 'button',
                className: 'cs-iconbtn cs-danger',
                title: t('notes.folder.delete'),
                'aria-label': t('notes.folder.delete'),
                onClick: () => setConfirming(folder.id),
              }, Glyph.trash(11))));
        }
        return h('div', { key: folder.id, className: 'cs-folder-node' },
          row,
          isOpen && (childRows.length > 0 || files.length > 0)
            ? h('div', { className: 'cs-folder-children' },
              childRows,
              files.map((item) => renderNoteRow(item, depth + 1)))
            : null);
      }).filter((node) => node !== null);

      const openCitation = useCallback((path, startLine, endLine) => {
        const start = Math.max(1, Math.trunc(Number(startLine) || 1));
        const end = Math.max(start, Math.trunc(Number(endLine) || start));
        const sessionId = typeof scope === 'string'
          ? scope
          : (typeof scope?.sessionId === 'string' ? scope.sessionId : '');
        if (path !== undefined && path !== null && path !== ''
          && revealCodeRange(ctx, { path, startLine: start, endLine: end }, cwd, sessionId)) {
          return;
        }
        if (typeof onOpenFile === 'function') onOpenFile(path);
      }, [ctx, cwd, scope, onOpenFile]);

      /* ---- render ---- */

      // Desktop order: folders first, unfiled notes last. Rendering the unfiled pile
      // above the folders made every note look detached from the tree.
      const folderRows = renderFolders(folders, 0);
      const unfiledRows = notesOf(undefined);

      return h('div', { className: 'cs-root', ref: hostRef },
        h('div', { className: 'cs-bar cs-wrap' },
          h('div', { className: 'cs-search' },
            h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
            h('input', {
              ref: searchRef,
              className: 'cs-input',
              type: 'search',
              value: query,
              placeholder: t('notes.search'),
              'aria-label': t('notes.search'),
              onChange: (event) => setQuery(event.target.value),
            }),
            searching ? h('button', {
              type: 'button',
              className: 'cs-search-clear',
              title: t('notes.clearSearch'),
              'aria-label': t('notes.clearSearch'),
              onClick: () => setQuery(''),
            }, Glyph.close(12)) : null),
          h('button', {
            type: 'button',
            className: 'cs-iconbtn',
            title: t('common.refresh'),
            'aria-label': t('common.refresh'),
            onClick: () => { void refresh(); },
          }, Glyph.refresh(14))),

        // Labels, not bare glyphs: the four file actions are not self-evident from
        // an icon alone, and this rail has enough width for one compact row.
        h('div', { className: 'cs-bar cs-wrap cs-notes-actions' },
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: busy,
            onClick: () => setMode({ kind: 'create' }),
          }, Glyph.plus(12), t('notes.newNote')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: busy,
            onClick: () => setMode({ kind: 'folder' }),
          }, Glyph.folder(12), t('notes.newFolder')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: busy || importBusy,
            onClick: () => setImportOpen((open) => !open),
          }, Glyph.file(12), t('notes.import')),
          h('button', {
            type: 'button',
            className: `cs-btn cs-small${exportMode ? ' cs-on' : ''}`,
            disabled: busy,
            'aria-pressed': exportMode ? 'true' : 'false',
            onClick: () => {
              setExportMode((open) => {
                if (open) setSelected(new Set());
                return !open;
              });
            },
          }, Glyph.open(12), t('notes.export')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: busy,
            onClick: () => { void exportMany(undefined); },
          }, Glyph.open(12), t('notes.exportAll'))),

        importOpen ? h('div', { className: 'cs-bar cs-wrap', style: { gap: '6px' } },
          h('input', {
            ref: fileRef,
            type: 'file',
            accept: '.md,.markdown,.txt,text/markdown',
            multiple: true,
            style: { display: 'none' },
            onChange: (event) => {
              const files = event.target.files;
              event.target.value = '';
              if (files !== null && files !== undefined && files.length > 0) void importFromFiles(files);
            },
          }),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: importBusy,
            onClick: () => fileRef.current?.click(),
          }, Glyph.file(11), t('notes.importPick')),
          h('input', {
            className: 'cs-input',
            style: { flex: '1 1 150px', minWidth: '100px' },
            value: importPath,
            placeholder: t('notes.importPath'),
            'aria-label': t('notes.importPath'),
            onChange: (event) => setImportPath(event.target.value),
          }),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: importBusy || importPath.trim() === '',
            onClick: () => { void importFromPaths(); },
          }, t('notes.importRun')),
          h('button', {
            type: 'button',
            className: 'cs-iconbtn',
            title: t('notes.reader.cancel'),
            'aria-label': t('notes.reader.cancel'),
            onClick: () => { setImportOpen(false); setImportPath(''); },
          }, Glyph.close(11))) : null,

        exportMode ? h('div', { className: 'cs-bulk' },
          h('span', { className: 'cs-grow' }, t('notes.selected', { count: selected.size })),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            disabled: busy || selected.size === 0,
            onClick: () => { void exportMany(Array.from(selected)); },
          }, Glyph.open(11), t('notes.exportSelected')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small',
            onClick: () => {
              setSelected(new Set());
              setExportMode(false);
            },
          }, t('notes.cancelSelect'))) : null,

        notice === undefined ? null : h('div', { className: 'cs-banner', style: { color: 'var(--dsw-alias-label-secondary)' } },
          Glyph.check(12),
          h('span', { className: 'cs-grow' }, notice),
          h('button', {
            type: 'button', className: 'cs-iconbtn', onClick: () => setNotice(undefined),
          }, Glyph.close(11))),

        error === undefined ? null : h('div', { className: 'cs-banner' },
          Glyph.alert(13),
          h('span', { className: 'cs-grow' }, error),
          h('button', {
            type: 'button', className: 'cs-iconbtn', onClick: () => setError(undefined),
          }, Glyph.close(11))),

        h('div', { className: `cs-notes${narrow ? ' cs-narrow' : ''}${focused ? ' cs-focus' : ''}` },
          /* ---- column 1: folders + list ---- */
          h('div', { className: 'cs-notes-list' },
            h('div', { className: 'cs-folder-row' },
              h('button', {
                type: 'button',
                className: `cs-folder${folderId === undefined ? ' cs-active' : ''}`,
                title: t('notes.library'),
                onClick: () => setFolderId(undefined),
              },
              h('span', { className: 'cs-twist' }, Glyph.layers(12)),
              h('span', { className: 'cs-grow' }, t('notes.library')),
              h('span', { className: 'cs-count' }, formatInt(notes.length, locale)))),

            // One tree, like a file explorer: folders first, each holding its
            // subfolders and notes; unfiled notes come last. Search filters the same
            // tree instead of flattening the hierarchy away.
            h('div', { className: 'cs-grow', style: { minHeight: 0, overflow: 'auto', marginTop: '2px', paddingBottom: '10px' } },
              loading && notes.length === 0
                ? h('div', { className: 'cs-empty' }, t('common.loading'))
                : searching
                  ? (folderRows.length === 0 && unfiledRows.length === 0
                    ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '16px 10px' } }, t('notes.emptySearch'))
                    : h('div', { className: 'cs-folder-tree', 'data-cs': 'notes-tree' },
                      folderRows,
                      unfiledRows.length === 0 ? null : h('div', { className: 'cs-tree-divider' },
                        h('span', { className: 'cs-grow' }, t('notes.folder.unfiled')),
                        h('span', { className: 'cs-count' }, formatInt(unfiledRows.length, locale))),
                      unfiledRows.map((row) => renderNoteRow(row, 0))))
                  : (notes.length === 0 && folders.length === 0
                    ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '16px 10px' } }, t('notes.empty'))
                    : h('div', { className: 'cs-folder-tree', 'data-cs': 'notes-tree' },
                      folderRows,
                      unfiledRows.length === 0 ? null : h('div', { className: 'cs-tree-divider' },
                        h('span', { className: 'cs-grow' }, t('notes.folder.unfiled')),
                        h('span', { className: 'cs-count' }, formatInt(unfiledRows.length, locale))),
                      unfiledRows.map((row) => renderNoteRow(row, 0)))))),

          /* ---- column 2: editor or reader ---- */
          h('div', { className: 'cs-notes-reader' },
            mode.kind === 'create'
              ? h(NoteEditor, {
                mode: 'create',
                initial: { title: '', body: '' },
                busy,
                onSave: (title, body) => { void createNote(title, body); },
                onCancel: () => setMode({ kind: 'idle' }),
                t,
              })
              : mode.kind === 'folder'
                ? h(FolderForm, {
                  busy,
                  onCreate: (name) => { void createFolder(name); },
                  onCancel: () => setMode({ kind: 'idle' }),
                  t,
                })
                : mode.kind === 'edit' && note !== undefined
                  ? h(NoteEditor, {
                    mode: 'edit',
                    initial: { title: note.title, body: stripTitleLine(note.body) },
                    busy,
                    onSave: (title, body) => { void updateNote({ title, body }); },
                    onCancel: () => setMode({ kind: 'read' }),
                    t,
                  })
                  : note === undefined
                    ? h('div', { className: 'cs-empty' })
                    : h(NoteReader, {
                      note,
                      busy,
                      onEdit: () => setMode({ kind: 'edit' }),
                      onDelete: () => { void deleteNote(); },
                      onExport: () => { void exportNote(); },
                      onBack: backToList,
                      onMove: () => setMoving(note.id),
                      onOpenCitation: openCitation,
                      onOpenFile,
                      t,
                      locale,
                    }))),

        // Right-click menu: the row's own actions, so 移动到 does not need the reader.
        menu === undefined ? null : h('div', {
          className: 'cs-menu',
          style: {
            position: 'fixed',
            left: `${Math.min(menu.x, Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 170))}px`,
            top: `${menu.y}px`,
          },
          onClick: (event) => event.stopPropagation(),
        },
        h('div', { className: 'cs-menu-title', title: menu.title }, menu.title),
        h('button', {
          type: 'button',
          className: 'cs-menu-item',
          onClick: () => {
            const id = menu.id;
            setMenu(undefined);
            void open(id);
          },
        }, Glyph.file(12), t('notes.menu.open')),
        h('button', {
          type: 'button',
          className: 'cs-menu-item',
          onClick: () => {
            const id = menu.id;
            setMenu(undefined);
            setMoving(id);
          },
        }, Glyph.folder(12), t('notes.move'))),

        // Folder picker. A dialog rather than a dropdown: the folder list can be long
        // and the reader column is too narrow for a `<select>` that shows its name.
        moving === undefined ? null : h('div', {
          className: 'cs-modal-backdrop',
          onClick: () => setMoving(undefined),
        },
        h('div', { className: 'cs-modal', onClick: (event) => event.stopPropagation() },
          h('div', { className: 'cs-modal-head' }, t('notes.move.title')),
          h('div', { className: 'cs-modal-list' },
            h('button', {
              type: 'button',
              className: 'cs-modal-item',
              onClick: () => {
                const id = moving;
                setMoving(undefined);
                void moveNoteTo(id, null);
              },
            }, Glyph.layers(12), h('span', { className: 'cs-grow' }, t('notes.folder.unfiled'))),
            flatFolders.length === 0 ? null : h('div', { className: 'cs-muted', style: { fontSize: '11px', padding: '6px 10px' } },
              t('notes.move.hint')),
            flatFolders.map((row) => {
              const current = notes.find((item) => item.id === moving);
              const active = current !== undefined && (current.folderId ?? undefined) === row.folder.id;
              return h('button', {
                key: row.folder.id,
                type: 'button',
                className: `cs-modal-item${active ? ' cs-active' : ''}`,
                style: { paddingLeft: `${10 + row.depth * 14}px` },
                onClick: () => {
                  const id = moving;
                  setMoving(undefined);
                  void moveNoteTo(id, row.folder.id);
                },
              }, Glyph.folder(12), h('span', { className: 'cs-grow' }, row.folder.name));
            })),
          h('div', { className: 'cs-modal-foot' },
            h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => setMoving(undefined) }, t('common.cancel'))))));
    }

    /**
     * Read a note, with its anchors and references.
     * @param props - `{note, busy, onEdit, onDelete, onExport, onMove, onOpenCitation, onOpenFile, t, locale}`.
     *   `note` is the `read` payload; `onMove()` opens the folder picker for this note;
     *   `onOpenCitation(path, line)` opens a `path:line` chip; `onOpenFile` is the
     *   host's fallback opener.
     * @returns the reader column.
     */
    function NoteReader(props) {
      const {
        note, busy, onEdit, onDelete, onExport, onBack, onMove, onOpenCitation, t, locale,
      } = props;
      const anchors = Array.isArray(note.anchors) ? note.anchors : [];
      const refs = Array.isArray(note.codeRefs) ? note.codeRefs : [];
      const scrollRef = useRef(null);

      // Every note opens at its own top, not wherever the previous one was scrolled.
      useEffect(() => {
        scrollRef.current?.scrollTo?.({ top: 0 });
      }, [note.id]);

      return h('div', { className: 'cs-col', style: { flex: '1 1 auto', minHeight: 0 } },
        h('div', { className: 'cs-reader-head' },
          h('div', { className: 'cs-row' },
            onBack === undefined ? null : h('button', {
              type: 'button',
              className: 'cs-iconbtn',
              title: t('notes.back'),
              'aria-label': t('notes.back'),
              onClick: () => onBack(),
            }, Glyph.back(14)),
            h('h2', { className: 'cs-grow', title: note.title }, note.title),
            h('span', { className: 'cs-tag' }, formatRelative(locale, note.updatedAt))),
          h('div', { className: 'cs-reader-acts' },
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small',
              title: t('notes.move'),
              disabled: busy,
              onClick: () => onMove?.(),
            }, Glyph.folder(11), t('notes.move')),
            h('button', { type: 'button', className: 'cs-btn cs-small', disabled: busy, onClick: () => onEdit?.() },
              Glyph.pencil(11), t('notes.reader.edit')),
            h('button', { type: 'button', className: 'cs-btn cs-small', disabled: busy, onClick: () => onExport?.() },
              Glyph.open(11), t('notes.reader.export')),
            h('span', { className: 'cs-grow' }),
            h('button', {
              type: 'button', className: 'cs-iconbtn cs-danger', title: t('notes.reader.delete'), 'aria-label': t('notes.reader.delete'), disabled: busy, onClick: () => onDelete?.(),
            }, Glyph.trash(13)))),

        refs.length === 0 && anchors.length === 0 ? null : h('div', { className: 'cs-bar cs-sub cs-wrap' },
          refs.length === 0 ? null : h('span', { className: 'cs-muted', style: { fontSize: '10px' } }, t('notes.reader.refs')),
          refs.map((ref, index) => {
            const start = Math.max(1, Math.trunc(Number(ref.line ?? ref.startLine ?? 1)) || 1);
            const end = Math.max(start, Math.trunc(Number(ref.endLine ?? start)) || start);
            const label = start === end ? `${ref.path}:${start}` : `${ref.path}:${start}-${end}`;
            return h('button', {
              key: `ref${index}`,
              type: 'button',
              className: 'cs-cite',
              title: label,
              onClick: () => onOpenCitation?.(ref.path, start, end),
            }, `${ref.symbol ?? ''}${ref.symbol === undefined ? '' : ' '}${label}`);
          }),
          anchors.length === 0 ? null : h('span', { className: 'cs-muted', style: { fontSize: '10px' } }, t('notes.reader.anchors')),
          anchors.map((anchor, index) => h('span', {
            key: `anchor${index}`,
            className: `cs-tag ${anchor.status === 'fresh' ? 'cs-ok' : anchor.status === 'missing' ? 'cs-bad' : 'cs-warn'}`,
            title: `${anchor.path}:${anchor.startLine ?? anchor.line ?? 1}`,
          }, t(`notes.drift.${anchor.status ?? 'fresh'}`)))),

        h('div', { className: 'cs-reader-scroll', ref: scrollRef },
          h('div', { className: 'cs-reader-doc' },
            stripTitleLine(note.body).trim() === ''
              ? h('p', { className: 'cs-muted' }, t('notes.reader.bodyEmpty'))
              : h(Markdown, { text: stripTitleLine(note.body), onOpenCitation, t }))));
    }

    /**
     * Create/edit form.
     * @param props - `{mode, initial, busy, onSave(title, body), onCancel, t}`.
     *   `mode` is `'create'` or `'edit'` (label differs, behaviour does not).
     * @returns the form column.
     */
    function NoteEditor(props) {
      const {
        mode, initial, busy, onSave, onCancel, t,
      } = props;
      const [title, setTitle] = useState(initial.title);
      const [body, setBody] = useState(initial.body);
      const titleRef = useRef(null);

      useEffect(() => {
        titleRef.current?.focus();
      }, []);

      // Ctrl/Cmd+S saves instead of the browser's dialog. Bound on the form, not the
      // window: two open panels must not both react to one keystroke.
      const onKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
          event.preventDefault();
          if (title.trim() !== '' && body.trim() !== '') onSave?.(title.trim(), body);
          return;
        }
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel?.();
        }
      };

      const ready = title.trim() !== '' && body.trim() !== '';

      return h('div', { className: 'cs-col', style: { flex: '1 1 auto', minHeight: 0 }, onKeyDown },
        h('div', { className: 'cs-bar cs-sub' },
          h('span', { className: 'cs-grow' }, t(mode === 'create' ? 'notes.newNote' : 'notes.reader.edit'))),
        h('div', { className: 'cs-field' },
          h('label', { htmlFor: 'cs-note-title' }, t('notes.create.title')),
          h('input', {
            id: 'cs-note-title',
            ref: titleRef,
            className: 'cs-input',
            value: title,
            placeholder: t('notes.create.placeholder.title'),
            onChange: (event) => setTitle(event.target.value),
          })),
        h('div', { className: 'cs-field cs-grow', style: { minHeight: 0 } },
          h('label', { htmlFor: 'cs-note-body' }, t('notes.create.body')),
          h('textarea', {
            id: 'cs-note-body',
            className: 'cs-textarea',
            style: { flex: '1 1 auto', minHeight: '140px' },
            value: body,
            placeholder: t('notes.create.placeholder.body'),
            onChange: (event) => setBody(event.target.value),
          })),
        h('div', { className: 'cs-bar cs-flat' },
          h('div', { className: 'cs-grow' }),
          h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.() }, t('common.cancel')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-primary',
            disabled: busy || !ready,
            onClick: () => onSave?.(title.trim(), body),
          }, t('notes.create.save'))));
    }

    /**
     * New-folder form.
     * @param props - `{busy, onCreate(name), onCancel, t}`.
     * @returns the form row.
     */
    function FolderForm(props) {
      const {
        busy, onCreate, onCancel, t,
      } = props;
      const [name, setName] = useState('');
      return h('div', { className: 'cs-bar cs-sub' },
        h('input', {
          className: 'cs-input',
          value: name,
          autoFocus: true,
          placeholder: t('notes.folder.name'),
          'aria-label': t('notes.folder.name'),
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && name.trim() !== '') onCreate?.(name.trim());
            if (event.key === 'Escape') onCancel?.();
          },
        }),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small cs-primary',
          disabled: busy || name.trim() === '',
          onClick: () => onCreate?.(name.trim()),
        }, t('notes.folder.create')),
        h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.() }, t('common.cancel')));
    }

    /**
     * Flatten the folder tree in tree order, carrying depth for the indent.
     *
     * The depth is applied as padding, mirroring the reference's `6 + depth*16`
     * (§6.1) — a flat list with no indent reads as a tag cloud, not a hierarchy.
     * @param folders - the tree from the `list` op.
     * @returns `[{folder, depth}]` in display order.
     */
    function flattenFolders(folders) {
      const out = [];
      const walk = (rows, depth) => {
        for (const folder of rows ?? []) {
          out.push({ folder, depth });
          if (Array.isArray(folder.children)) walk(folder.children, depth + 1);
        }
      };
      walk(folders, 0);
      return out;
    }

    /**
     * Apply the folder scope and the query to the note list.
     *
     * The reference filters titles, previews and project names as you type with no
     * debounce (§6.1); this panel filters the rows the Host already returned, so
     * typing never issues a request.
     * @param notes - the `list` rows.
     * @param query - the raw query.
     * @param folderId - the active folder, or `undefined` for all notes.
     * @returns the filtered rows.
     */
    function filterNotes(notes, query, folderId) {
      const needle = String(query ?? '').trim().toLowerCase();
      const scopeId = folderId ?? undefined;
      return (notes ?? []).filter((row) => {
        if (scopeId !== undefined && (row.folderId ?? undefined) !== scopeId) return false;
        if (needle === '') return true;
        const haystack = `${row.title ?? ''} ${row.excerpt ?? ''}`.toLowerCase();
        return haystack.includes(needle);
      });
    }

    /* ================================================================ *
     * sidebar/tree.js
     * ================================================================ */
    /**
     * The reader's file tree.
     *
     * The `tree` API returns a flat entry list (`{path, type, size}`); this module
     * projects it into a nested tree, keeps the expanded-directory set, and offers a
     * name filter. Rows are plain DOM (`data-cs="file-tree"` on the container) so
     * the jsdom harness can assert them without the CodeMirror chunk.
     */



    /** Split a workspace-relative path into non-empty segments. */
    function sbSplitPath(path) {
      return String(path ?? '').split('/').filter((part) => part !== '');
    }

    /**
     * Project the flat entry list into a tree.
     * @param entries - `{path, type:'dir'|'file', size?}[]`.
     * @returns a root dir node with nested `children`.
     */
    function sbBuildTree(entries) {
      const root = { name: '', path: '', type: 'dir', children: [] };
      const byPath = new Map([['', root]]);

      const ensureDir = (path, name) => {
        let node = byPath.get(path);
        if (node === undefined) {
          node = { name, path, type: 'dir', children: [] };
          byPath.set(path, node);
          const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
          const parent = byPath.get(parentPath) ?? root;
          parent.children.push(node);
        }
        return node;
      };

      for (const entry of Array.isArray(entries) ? entries : []) {
        const parts = sbSplitPath(entry.path);
        if (parts.length === 0) continue;
        if (entry.type === 'dir') {
          ensureDir(entry.path, parts[parts.length - 1]);
          continue;
        }
        let acc = '';
        for (let i = 0; i < parts.length - 1; i += 1) {
          acc = acc === '' ? parts[i] : `${acc}/${parts[i]}`;
          ensureDir(acc, parts[i]);
        }
        const parentPath = parts.slice(0, -1).join('/');
        const parent = byPath.get(parentPath) ?? root;
        parent.children.push({
          name: parts[parts.length - 1],
          path: entry.path,
          type: 'file',
          size: entry.size,
        });
      }

      const sortNode = (node) => {
        node.children.sort((a, b) => (
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
        ));
        for (const child of node.children) {
          if (child.type === 'dir') sortNode(child);
        }
      };
      sortNode(root);
      return root;
    }

    /**
     * Does this node (or any descendant) match the filter needle?
     * @param node - a tree node.
     * @param needle - lowercased substring.
     * @returns true when the node should stay visible.
     */
    function sbNodeMatches(node, needle) {
      if (needle === '') return true;
      if (node.type === 'file') return String(node.path).toLowerCase().includes(needle);
      return node.children.some((child) => sbNodeMatches(child, needle));
    }

    /**
     * The file tree panel.
     *
     * @param props - `{entries, activePath, expanded, onToggleDir, onOpenFile,
     *   filter, onFilterChange, loading, error, onRetry, t, locale}`.
     * @returns the tree node.
     */
    function SbFileTree(props) {
      const {
        entries, activePath, expanded, onToggleDir, onOpenFile,
        filter, onFilterChange, loading, error, onRetry, t,
      } = props;

      const root = useMemo(() => sbBuildTree(entries), [entries]);
      const needle = String(filter ?? '').trim().toLowerCase();
      const filtering = needle !== '';

      const renderNode = (node, depth) => {
        if (!sbNodeMatches(node, needle)) return null;
        const pad = { paddingLeft: `${8 + depth * 12}px` };

        if (node.type === 'dir') {
          const open = filtering || expanded.has(node.path);
          return h('div', { key: node.path },
            h('button', {
              type: 'button',
              className: 'cs-sb-tree-row cs-dir',
              style: pad,
              onClick: () => onToggleDir(node.path),
              title: node.path,
            },
              h('span', {
                className: 'cs-sb-tree-twist',
                'data-open': String(open),
              }, Glyph.chevronRight(11)),
              h('span', { className: 'cs-sb-tree-glyph' }, open ? Glyph.folderOpen(12) : Glyph.folder(12)),
              h('span', { className: 'cs-sb-tree-name' }, node.name)),
            open ? node.children.map((child) => renderNode(child, depth + 1)) : null);
        }

        const active = node.path === activePath;
        return h('button', {
          key: node.path,
          type: 'button',
          className: `cs-sb-tree-row${active ? ' cs-active' : ''}`,
          style: pad,
          title: node.path,
          onClick: () => onOpenFile(node.path),
        },
          h('span', { className: 'cs-sb-tree-twist' }),
          h('span', { className: 'cs-sb-tree-glyph' }, Glyph.file(12)),
          h('span', { className: 'cs-sb-tree-name' }, node.name),
          Number.isFinite(Number(node.size)) && Number(node.size) > 0
            ? h('span', { className: 'cs-sb-tree-meta' }, String(node.size))
            : null);
      };

      return h('div', { className: 'cs-sb-tree' },
        h('div', { className: 'cs-sb-tree-head' },
          h('div', { className: 'cs-search' },
            h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
            h('input', {
              className: 'cs-input',
              type: 'search',
              value: filter ?? '',
              placeholder: t('reader.tree.filter'),
              'aria-label': t('reader.tree.filter'),
              onChange: (event) => onFilterChange(event.target.value),
            }))),
        error === undefined
          ? null
          : h('div', { className: 'cs-sb-banner' },
            Glyph.alert(12),
            h('span', { className: 'cs-grow' }, error),
            h('button', {
              type: 'button', className: 'cs-iconbtn', 'aria-label': t('reader.tree.retry'),
              onClick: onRetry,
            }, Glyph.refresh(11))),
        h('div', { className: 'cs-sb-tree-list', 'data-cs': 'file-tree' },
          loading && root.children.length === 0
            ? h('div', { className: 'cs-sb-empty' }, h('span', { className: 'cs-spin' }, Glyph.spinner(11)), t('reader.tree.loading'))
            : root.children.length === 0
              ? h('div', { className: 'cs-sb-empty' }, t('reader.tree.empty'))
              : root.children.map((child) => renderNode(child, 0))));
    }

    /* ================================================================ *
     * sidebar/tabs.js
     * ================================================================ */
    /**
     * The multi-tab strip of the reader pane.
     *
     * One tab per open file; switching keeps each file's last selection in its tab
     * record (the reader restores it on activate). Every tab carries
     * `data-cs="tab"` so the harness can count and click them in jsdom.
     */



    /**
     * The tab strip.
     *
     * @param props - `{tabs, activePath, onActivate(path), onClose(path), t}`.
     * @returns the strip node, or null when no file is open.
     */
    function SbTabBar(props) {
      const { tabs, activePath, onActivate, onClose, t } = props;
      if (!Array.isArray(tabs) || tabs.length === 0) return null;

      return h('div', { className: 'cs-sb-tabs', role: 'tablist' },
        tabs.map((tab) => h('div', {
          key: tab.path,
          'data-cs': 'tab',
          'data-path': tab.path,
          role: 'tab',
          'aria-selected': activePath === tab.path,
          className: `cs-sb-tab${activePath === tab.path ? ' cs-on' : ''}`,
          title: tab.path,
          onClick: () => onActivate(tab.path),
        },
          Glyph.file(12),
          h('span', { className: 'cs-sb-tab-label' }, tab.title),
          h('button', {
            type: 'button',
            className: 'cs-sb-tab-close',
            'aria-label': t('reader.tab.close'),
            title: t('reader.tab.close'),
            onClick: (event) => {
              event.stopPropagation();
              onClose(tab.path);
            },
          }, Glyph.close(11)))));
    }

    /* ================================================================ *
     * sidebar/editor.js
     * ================================================================ */
    /**
     * The CodeMirror host for the reader pane.
     *
     * Reuses the lazy editor chunk (`client/editor.js`, loaded through
     * `loadEditor`) rather than wrapping CodeMirror in another React root: the chunk
     * exposes an imperative `create(container, options)` handle, and this module
     * owns mounting, decoration updates and teardown.
     *
     * Decorations carried per window:
     *   - `symbols` / `annotations` / `notes` — from the `code` response;
     *   - `pick` — the current line selection;
     *   - `frames` — the registered ranges (top/bottom 2px borders + tint);
     *   - `flash` — a one-shot reveal highlight.
     *
     * The editor itself is read-only with line numbers and syntax highlighting;
     * both gestures (gutter number click, text drag) report the same line span.
     */





    /**
     * Normalise the active pick into the decoration shape the chunk expects.
     * @param pick - `{start, end}` or null/undefined.
     * @returns `{startLine, endLine}` or null.
     */
    function sbPickSpec(pick) {
      if (pick === null || pick === undefined || pick.start === undefined) return null;
      const first = Math.min(Number(pick.start), Number(pick.end ?? pick.start));
      const last = Math.max(Number(pick.start), Number(pick.end ?? pick.start));
      return { startLine: first, endLine: last };
    }

    /**
     * Map the deduped frame records onto the chunk's frame decoration rows.
     * @param frames - deduped records for the active file.
     * @returns `[{startLine, endLine, status}]`.
     */
    function sbFrameSpecs(frames) {
      return (Array.isArray(frames) ? frames : []).map((frame) => ({
        startLine: Number(frame.startLine),
        endLine: Number(frame.endLine ?? frame.startLine),
        status: frame.status ?? 'fresh',
      }));
    }

    /**
     * The editor host.
     *
     * @param props - `{ctx, file, pick, frames, flash, onSelection, onGutterPick, t}`.
     *   `file` is the `code` response; `pick` is the active tab's selection;
     *   `onSelection({startLine,endLine}|null)` reports text drags;
     *   `onGutterPick(line)` reports gutter clicks.
     * @returns the host node.
     */
    function SbEditorHost(props) {
      const { ctx, file, pick, frames, flash, onSelection, onGutterPick, t } = props;

      const hostRef = useRef(null);
      const handleRef = useRef(undefined);
      const [api, setApi] = useState(undefined);
      const [error, setError] = useState(undefined);
      const [nonce, setNonce] = useState(0);

      /* ---- load the lazy chunk once ------------------------------------- */

      useEffect(() => {
        let cancelled = false;
        loadEditor(ctx).then((namespace) => {
          if (!cancelled) setApi(namespace);
        }).catch((caught) => {
          if (!cancelled) setError(caught && caught.message ? caught.message : String(caught));
        });
        return () => { cancelled = true; };
      }, [ctx, nonce]);

      /* ---- one handle per loaded window ---------------------------------- */

      const startLine = Number.isFinite(Number(file?.startLine)) ? Number(file.startLine) : 1;

      useEffect(() => {
        if (api === undefined || hostRef.current === null) return undefined;
        if (file === undefined || file.found === false) return undefined;

        const handle = api.create(hostRef.current, {
          doc: file.text ?? '',
          startLine,
          language: file.language ?? '',
          decorations: {
            symbols: file.symbols,
            annotations: file.annotations,
            notes: file.notes,
            pick: sbPickSpec(pick),
            frames: sbFrameSpecs(frames),
            flash,
          },
          onSelection,
          onGutterPick,
        });
        handleRef.current = handle;

        // Restore this tab's last selection once the window is up.
        const spec = sbPickSpec(pick);
        if (spec !== null) {
          handle.setSelection(spec.startLine, spec.endLine);
          handle.scrollToLine(spec.startLine);
        }
        return () => {
          handle.destroy();
          if (handleRef.current === handle) handleRef.current = undefined;
        };
      }, [api, file, startLine, pick, frames, flash, onSelection, onGutterPick]);

      /* ---- decorations follow selection / frames without a remount ------ */

      useEffect(() => {
        const handle = handleRef.current;
        if (handle === undefined) return;
        const spec = sbPickSpec(pick);
        handle.setDecorations({
          symbols: file?.symbols,
          annotations: file?.annotations,
          notes: file?.notes,
          pick: spec,
          frames: sbFrameSpecs(frames),
          flash,
        });
        if (spec === null) handle.clearSelection?.();
      }, [file?.symbols, file?.annotations, file?.notes, pick, frames, flash]);

      const retry = useCallback(() => {
        setApi(undefined);
        setError(undefined);
        setNonce((current) => current + 1);
      }, []);

      return h('div', { className: 'cs-sb-editor-wrap', 'data-cs': 'editor' },
        h('div', { ref: hostRef, className: 'cs-sb-editor-host' }),
        api === undefined && error === undefined
          ? h('div', { className: 'cs-sb-editor-note' },
            h('span', { className: 'cs-spin' }, Glyph.spinner(11)),
            h('span', null, t('reader.editor.loading')))
          : null,
        error === undefined
          ? null
          : h('div', { className: 'cs-sb-editor-note' },
            h('span', null, t('reader.editor.failed')),
            h('button', { type: 'button', className: 'cs-btn cs-small', onClick: retry }, t('reader.tree.retry'))));
    }

    /* ================================================================ *
     * sidebar/frames.js
     * ================================================================ */
    /**
     * Frames: the registered code ranges painted over the open file.
     *
     * A frame is one recorded interval `{id, path, startLine, endLine, sessionId,
     * messageId?, title, question, createdAt, status, actualStart?, actualEnd?}`.
     * The line borders themselves are CodeMirror decorations (see `editor.js` and
     * the editor chunk); this module owns the pure-DOM title strips, which the jsdom
     * harness can assert without a real CodeMirror instance.
     *
     * Dedup rule (contract §2.1.5): one box per `path + startLine + endLine`; when
     * the same interval was recorded twice, the newest record wins.
     */



    /**
     * Stable dedup key for one record.
     * @param frame - a frames list row.
     * @returns `path:startLine:endLine`.
     */
    function sbFrameKey(frame) {
      return `${String(frame?.path ?? '')}:${Number(frame?.startLine)}:${Number(frame?.endLine)}`;
    }

    /**
     * Newest-wins dedup, sorted by file order.
     * @param rows - the raw `frames` list from the API.
     * @returns one record per distinct interval, latest first kept.
     */
    function sbDedupeFrames(rows) {
      const map = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row === null || row === undefined) continue;
        const key = sbFrameKey(row);
        const stamp = Number(row.updatedAt ?? row.createdAt ?? 0) || 0;
        const prev = map.get(key);
        if (prev === undefined) {
          map.set(key, { row, stamp });
          continue;
        }
        if (stamp >= prev.stamp) map.set(key, { row, stamp });
      }
      return [...map.values()]
        .map((entry) => entry.row)
        .sort((a, b) => (Number(a.startLine) - Number(b.startLine)) || (Number(a.endLine) - Number(b.endLine)));
    }

    /**
     * The strip label: the record's title when it has one, otherwise the plain
     * `path:start-end` fallback the contract specifies.
     * @param frame - the record.
     * @returns the label string.
     */
    function sbFrameTitle(frame) {
      const titled = typeof frame?.title === 'string' ? frame.title.trim() : '';
      if (titled !== '') return titled;
      return `${frame.path}:${frame.startLine}-${frame.endLine}`;
    }

    /**
     * One 19px title strip above a framed range.
     *
     * `data-cs="frame-strip"` plus `data-path` / `data-start` / `data-end` are the
     * harness anchors; the strip is a plain DOM node and never depends on the
     * CodeMirror chunk being loaded.
     *
     * @param props - `{frame, t, onOpenSession, onDelete}`.
     *   `onOpenSession({sessionId, messageId, title, question})` hands the click up
     *   to the integration side, which switches back to the originating session.
     * @returns the strip node.
     */
    function SbFrameStrip(props) {
      const { frame, t, onOpenSession, onDelete } = props;
      const status = frame.status ?? 'fresh';
      const missing = status === 'missing';
      const moved = status === 'moved';
      const label = sbFrameTitle(frame);

      const tooltip = moved && Number.isFinite(Number(frame.actualStart))
        ? `${label} · ${t('reader.frame.movedRange', { start: frame.startLine, end: frame.endLine })} → ${frame.actualStart}-${frame.actualEnd}`
        : label;

      const open = () => {
        if (missing || typeof onOpenSession !== 'function') return;
        onOpenSession({
          sessionId: frame.sessionId,
          messageId: frame.messageId,
          title: typeof frame.title === 'string' ? frame.title : '',
          question: typeof frame.question === 'string' ? frame.question : '',
        });
      };

      const className = `cs-sb-strip${missing ? ' cs-missing' : ''}${moved ? ' cs-moved' : ''}`;

      return h('div', {
        className,
        'data-cs': 'frame-strip',
        'data-path': String(frame.path ?? ''),
        'data-start': String(frame.startLine ?? ''),
        'data-end': String(frame.endLine ?? ''),
        title: tooltip,
      },
        h('button', {
          type: 'button',
          className: 'cs-sb-strip-flag',
          onClick: open,
          disabled: missing,
          title: t('reader.frame.open'),
          'aria-label': t('reader.frame.open'),
        },
          h('span', { className: 'cs-sb-strip-title' }, label)),
        moved
          ? h('span', { className: 'cs-sb-badge cs-warn' },
            t('reader.frame.movedRange', { start: frame.startLine, end: frame.endLine }))
          : null,
        missing
          ? h('span', { className: 'cs-sb-badge cs-bad' }, t('reader.frame.missing'))
          : null,
        !missing && typeof onDelete === 'function'
          ? h('button', {
            type: 'button',
            className: 'cs-sb-strip-delete',
            title: t('reader.frame.delete'),
            'aria-label': t('reader.frame.delete'),
            onClick: () => onDelete(frame),
          }, Glyph.trash(11))
          : null);
    }

    /**
     * The rail listing every strip of the active file, top to bottom.
     * @param props - `{frames, t, onOpenSession, onDelete}`.
     * @returns the rail node.
     */
    function SbFrameRail(props) {
      const { frames, t, onOpenSession, onDelete } = props;
      if (!Array.isArray(frames) || frames.length === 0) {
        return h('div', { className: 'cs-sb-rail-empty' }, t('reader.frames.none'));
      }
      return h('div', { className: 'cs-sb-rail' },
        frames.map((frame) => h(SbFrameStrip, {
          key: frame.id ?? sbFrameKey(frame),
          frame, t, onOpenSession, onDelete,
        })));
    }

    /* ================================================================ *
     * sidebar/reader.js
     * ================================================================ */
    /**
     * The `codeslice:reader` tab — file tree + multi-tab read-only code editor +
     * framed ranges.
     *
     * This is the sidebar area's single integration point (contract §2.1): the
     * integration side registers one tab type and hands props in; everything below
     * the tree / tab bar / frame rail is owned here.
     *
     * Layout:
     *   ┌───────────────────────────────┐
     *   │ file tree (filterable, folds) │
     *   ├───────────────────────────────┤
     *   │ tab strip (close / switch)    │
     *   ├────────────────────────┬──────┤
     *   │ CodeMirror host         │ frame│
     *   │                         │ rail │
     *   ├────────────────────────┴──────┤
     *   │ selection picker bar          │
     *   └───────────────────────────────┘
     *
     * Discipline borrowed from the existing panels:
     *   - `visible === false` means parked-but-mounted: abort the request scope,
     *     keep state, refetch on resume; never `dispose` (that is terminal);
     *   - one `makeRequestScope` owns every in-flight call, so a stale answer can
     *     never paint over the resumed pane;
     *   - selection and frames live per tab / per file, so switching tabs restores
     *     what each file last had selected.
     */










    /** The last path segment, for a tab label too narrow to show a directory. */
    function sbBaseName(path) {
      const text = String(path ?? '');
      const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
      return cut < 0 ? text : text.slice(cut + 1);
    }

    /** First non-empty line, trimmed to a short frame title. */
    function sbFirstLine(text) {
      const line = String(text ?? '').split('\n').map((part) => part.trim()).find((part) => part !== '');
      if (line === undefined) return '';
      return line.length > 40 ? `${line.slice(0, 40)}…` : line;
    }

    /**
     * The reader panel.
     *
     * @param props - `{ctx, scope:{cwd?, sessionId?}, tab?:{path?,id}, visible?,
     *   focusRequest?, onOpenFile?, onAsk?, onAskSelection?, onSelectionChange?,
     *   onOpenSession?, t, locale}`.
     *   `onAskSelection({path,startLine,endLine,text})` hands the selection up to
     *   the conversation; `onOpenSession({sessionId,messageId?,title,question})`
     *   jumps back to the session that owns a frame.
     * @returns the panel.
     */
    function SidebarReader(props) {
      const {
        ctx, scope, tab, visible, focusRequest,
        onAskSelection, onSelectionChange, onOpenSession,
      } = props;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const parked = visible === false;

      const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
      const sessionId = scope && typeof scope.sessionId === 'string' && scope.sessionId !== ''
        ? scope.sessionId : undefined;
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      /* ---- tree state ---------------------------------------------------- */
      const [treeEntries, setTreeEntries] = useState([]);
      const [treeLoading, setTreeLoading] = useState(false);
      const [treeError, setTreeError] = useState(undefined);
      const [filter, setFilter] = useState('');
      const [expanded, setExpanded] = useState(() => new Set(['']));
      const [treeNonce, setTreeNonce] = useState(0);

      /* ---- tabs and active file ------------------------------------------ */
      const [tabs, setTabs] = useState([]);
      const [activePath, setActivePath] = useState(undefined);
      const [file, setFile] = useState(undefined);
      const [fileError, setFileError] = useState(undefined);
      const [frames, setFrames] = useState([]);
      const [framesNonce, setFramesNonce] = useState(0);

      /* ---- ui state ------------------------------------------------------- */
      const [notice, setNotice] = useState(undefined);
      const [noteOpen, setNoteOpen] = useState(false);
      const [copied, setCopied] = useState(false);

      // One request scope per request family. `makeRequestScope.run()` aborts the
      // previous controller and bumps the sequence, so two families sharing one
      // scope would silently supersede each other: the frames list firing right
      // after a code fetch would discard the file content (the editor never mounts).
      const treeScope = useRef(undefined);
      const codeScope = useRef(undefined);
      const framesScope = useRef(undefined);
      const notesScope = useRef(undefined);
      const alive = useRef(true);
      const fileCache = useRef(new Map());
      const pendingPick = useRef(undefined);
      const wasParked = useRef(parked);
      const activePathRef = useRef(activePath);

      const activeTab = useMemo(
        () => tabs.find((entry) => entry.path === activePath),
        [tabs, activePath],
      );

      /* ---- request scope + alive flag ------------------------------------- */

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      activePathRef.current = activePath;

      useEffect(() => {
        treeScope.current = makeRequestScope();
        codeScope.current = makeRequestScope();
        framesScope.current = makeRequestScope();
        notesScope.current = makeRequestScope();
        return () => {
          treeScope.current?.dispose();
          codeScope.current?.dispose();
          framesScope.current?.dispose();
          notesScope.current?.dispose();
          treeScope.current = undefined;
          codeScope.current = undefined;
          framesScope.current = undefined;
          notesScope.current = undefined;
        };
      }, []);

      /* ---- park / resume: abort in flight, refetch on wake ----------------- */

      useEffect(() => {
        const resumed = wasParked.current && !parked;
        wasParked.current = parked;
        if (parked) {
          treeScope.current?.abort();
          codeScope.current?.abort();
          framesScope.current?.abort();
          notesScope.current?.abort();
          return;
        }
        if (resumed) {
          setTreeNonce((n) => n + 1);
          setFramesNonce((n) => n + 1);
          fileCache.current.clear();
          setFile(undefined);
          setFileError(undefined);
          // The normal load effect refires on the `parked` transition and re-reads
          // the active file; no activePath change is needed to trigger it.
        }
      }, [parked]);

      /* ---- file tree ------------------------------------------------------- */

      useEffect(() => {
        if (parked) return undefined;
        let cancelled = false;
        setTreeLoading(true);
        setTreeError(undefined);
        treeScope.current?.run((signal) => call('tree', {}, signal)).then((value) => {
          if (cancelled || !alive.current) return;
          setTreeEntries(Array.isArray(value?.entries) ? value.entries : []);
        }).catch((caught) => {
          if (cancelled || !alive.current) return;
          if (caught && caught.name === 'AbortError') return;
          setTreeError(caught && caught.message ? caught.message : String(caught));
        }).finally(() => {
          if (alive.current) setTreeLoading(false);
        });
        return () => { cancelled = true; };
      }, [parked, call, treeNonce]);

      /* ---- open / close / activate tabs ----------------------------------- */

      const openFile = useCallback((path) => {
        if (typeof path !== 'string' || path === '') return;
        setTabs((current) => (
          current.some((tabEntry) => tabEntry.path === path)
            ? current
            : [...current, { path, title: sbBaseName(path), pick: null }]
        ));
        setActivePath(path);
      }, []);

      const activateTab = useCallback((path) => setActivePath(path), []);

      const closeTab = useCallback((path) => {
        const index = tabs.findIndex((entry) => entry.path === path);
        const next = tabs.filter((entry) => entry.path !== path);
        setTabs(next);
        if (path === activePath) {
          const neighbor = next[Math.min(Math.max(index, 0), next.length - 1)];
          setActivePath(neighbor === undefined ? undefined : neighbor.path);
        }
      }, [tabs, activePath]);

      const toggleDir = useCallback((dirPath) => {
        setExpanded((current) => {
          const next = new Set(current);
          if (next.has(dirPath)) next.delete(dirPath);
          else next.add(dirPath);
          return next;
        });
      }, []);

      // A pinned tab (`tab.path`) opens on first mount.
      useEffect(() => {
        const pinned = tab && typeof tab.path === 'string' && tab.path !== '' ? tab.path : undefined;
        if (pinned !== undefined) openFile(pinned);
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      // A focus request from the graph opens the file and stages its range.
      const focusNonce = focusRequest && typeof focusRequest === 'object' ? focusRequest.nonce : undefined;
      useEffect(() => {
        if (focusRequest === undefined || focusRequest === null) return;
        if (typeof focusRequest.path !== 'string' || focusRequest.path === '') return;
        openFile(focusRequest.path);
        const commit = typeof focusRequest.commit === 'string' ? focusRequest.commit : '';
        const box = focusRequest.box;
        if (commit !== '' || (box !== undefined && box !== null)) {
          setTabs((current) => current.map((entry) => (entry.path === focusRequest.path
            ? {
              ...entry,
              ...(commit === '' ? {} : { commit }),
              ...(box === undefined || box === null ? {} : { frame: { startLine: box.startLine, endLine: box.endLine } }),
              ...(commit === '' ? {} : { title: `${sbBaseName(focusRequest.path)} @ ${commit.slice(0, 7)}` }),
            }
            : entry)));
        }
        const startLine = Number(focusRequest.startLine);
        if (Number.isFinite(startLine) && startLine > 0) {
          pendingPick.current = {
            path: focusRequest.path,
            start: Math.trunc(startLine),
            end: Number.isFinite(Number(focusRequest.endLine)) && Number(focusRequest.endLine) > 0
              ? Math.trunc(Number(focusRequest.endLine))
              : Math.trunc(startLine),
          };
        }
      }, [focusNonce, focusRequest, openFile]);

      /* ---- active file content --------------------------------------------- */

      useEffect(() => {
        if (parked || activePath === undefined) return undefined;
        const commit = typeof activeTab?.commit === 'string' ? activeTab.commit : '';
        const cacheKey = `${activePath}::${commit}`;
        const cached = fileCache.current.get(cacheKey);
        const staged = pendingPick.current;
        if (cached !== undefined) {
          setFile(cached);
          setFileError(undefined);
          if (staged !== undefined && staged.path === activePath) {
            pendingPick.current = undefined;
            setTabs((current) => current.map((entry) => (
              entry.path === activePath ? { ...entry, pick: { start: staged.start, end: staged.end } } : entry
            )));
          }
          return undefined;
        }
        let cancelled = false;
        const wantedPath = activePath;
        setFileError(undefined);
        codeScope.current?.run((signal) => call('code', {
          path: wantedPath,
          ...(commit === '' ? {} : { commit }),
        }, signal)).then((value) => {
          // Stale responses must not paint over another file: scope sequence +
          // cancelled flag already guard, and the path check is the backstop.
          if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
          fileCache.current.set(cacheKey, value);
          setFile(value);
          if (staged !== undefined && staged.path === wantedPath) {
            pendingPick.current = undefined;
            setTabs((current) => current.map((entry) => (
              entry.path === wantedPath ? { ...entry, pick: { start: staged.start, end: staged.end } } : entry
            )));
          }
        }).catch((caught) => {
          if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
          if (caught && caught.name === 'AbortError') return;
          setFile(undefined);
          setFileError(caught && caught.message ? caught.message : String(caught));
        });
        return () => { cancelled = true; };
      }, [parked, activePath, call, activeTab?.commit]);

      /* ---- frames for the active file -------------------------------------- */

      useEffect(() => {
        if (parked || activePath === undefined) {
          setFrames([]);
          return undefined;
        }
        let cancelled = false;
        const wantedPath = activePath;
        framesScope.current?.run((signal) => call('frames', { op: 'list', path: wantedPath }, signal)).then((value) => {
          if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
          setFrames(Array.isArray(value?.frames) ? value.frames : []);
        }).catch((caught) => {
          if (cancelled || !alive.current || wantedPath !== activePathRef.current) return;
          if (caught && caught.name === 'AbortError') return;
          setFrames([]);
        });
        return () => { cancelled = true; };
      }, [parked, activePath, call, framesNonce]);

      const dedupedFrames = useMemo(() => {
        const rows = frames.filter((frame) => frame?.path === activePath);
        const box = activeTab?.frame;
        const local = box === undefined || box === null
          ? []
          : [{
            path: activePath,
            startLine: Number(box.startLine),
            endLine: Number(box.endLine ?? box.startLine),
            status: 'fresh',
            title: t('reader.frame.citation'),
          }];
        return sbDedupeFrames([...rows, ...local]);
      }, [frames, activePath, activeTab?.frame, t]);

      /* ---- selection -------------------------------------------------------- */

      const startLine = Number.isFinite(Number(file?.startLine)) ? Number(file.startLine) : 1;
      const lines = useMemo(() => {
        const text = typeof file?.text === 'string' ? file.text : '';
        return text === '' ? [] : text.split('\n');
      }, [file?.text]);

      const updateTabPick = useCallback((path, pick) => {
        setTabs((current) => current.map((entry) => (entry.path === path ? { ...entry, pick } : entry)));
      }, []);

      const onEditorSelection = useCallback((range) => {
        if (activePath === undefined) return;
        if (range === null) {
          updateTabPick(activePath, null);
          return;
        }
        updateTabPick(activePath, { start: range.startLine, end: range.endLine });
      }, [activePath, updateTabPick]);

      const onGutterPick = useCallback((line) => {
        if (activePath === undefined || !Number.isFinite(line) || line <= 0) return;
        setTabs((current) => current.map((entry) => {
          if (entry.path !== activePath) return entry;
          const pick = entry.pick;
          if (pick === null || pick.start === undefined) return { ...entry, pick: { start: line, end: line } };
          if (pick.start === line && pick.end === line) return { ...entry, pick: null };
          return { ...entry, pick: { start: pick.start, end: line } };
        }));
      }, [activePath]);

      const selection = useMemo(() => {
        if (activeTab === undefined || activeTab.pick === null || activeTab.pick.start === undefined) return null;
        if (file === undefined || file.found === false) return null;
        const first = Math.min(Number(activeTab.pick.start), Number(activeTab.pick.end ?? activeTab.pick.start));
        const last = Math.max(Number(activeTab.pick.start), Number(activeTab.pick.end ?? activeTab.pick.start));
        const from = Math.max(0, first - startLine);
        const to = Math.max(from, last - startLine);
        const text = lines.slice(from, to + 1).join('\n');
        return { path: activePath, startLine: first, endLine: last, text };
      }, [activeTab, file, lines, startLine, activePath]);

      // Publish the shared selection so the workbench / composer stay in step.
      const reportRef = useRef(onSelectionChange);
      reportRef.current = onSelectionChange;
      const selectionKey = selection === null ? '' : `${selection.path}:${selection.startLine}:${selection.endLine}`;
      useEffect(() => {
        if (typeof reportRef.current !== 'function') return;
        reportRef.current(selection === null ? null : {
          path: selection.path,
          startLine: selection.startLine,
          endLine: selection.endLine,
          code: selection.text,
        });
      }, [selectionKey]);

      /* ---- actions ---------------------------------------------------------- */

      const ask = useCallback(async () => {
        if (selection === null) return;
        if (typeof onAskSelection === 'function') {
          onAskSelection({
            path: selection.path,
            startLine: selection.startLine,
            endLine: selection.endLine,
            text: selection.text,
            code: selection.text,
          });
        }
        // Register the range as a frame in the current session so its box shows up.
        if (sessionId === undefined) return;
        try {
          await framesScope.current?.run((signal) => call('frames', {
            op: 'create',
            path: selection.path,
            startLine: selection.startLine,
            endLine: selection.endLine,
            sessionId,
            title: sbFirstLine(selection.text),
            question: selection.text,
          }, signal));
          if (alive.current) setFramesNonce((n) => n + 1);
        } catch {
          // The quote already went out; frame registration is best-effort.
        }
      }, [selection, onAskSelection, sessionId, call]);

      const openSession = useCallback((payload) => {
        if (typeof onOpenSession === 'function') onOpenSession(payload);
      }, [onOpenSession]);

      const deleteFrame = useCallback(async (frame) => {
        if (frame === undefined || frame.id === undefined) return;
        try {
          await framesScope.current?.run((signal) => call('frames', { op: 'delete', id: frame.id }, signal));
          if (alive.current) setFramesNonce((n) => n + 1);
        } catch {
          // A failed delete leaves the strip as-is; the next list refresh heals it.
        }
      }, [call]);

      const saveNote = useCallback(async (title) => {
        if (selection === null) return;
        const cleanTitle = String(title ?? '').trim();
        if (cleanTitle === '') return;
        try {
          const value = await notesScope.current?.run((signal) => call('notes', {
            op: 'create',
            title: cleanTitle,
            body: '## 知识点\n\n## 关联代码\n',
            codeRefs: [{
              path: selection.path,
              line: selection.startLine,
              endLine: selection.endLine,
            }],
          }, signal));
          if (!alive.current) return;
          const note = value?.note ?? value;
          setNoteOpen(false);
          setNotice({ kind: 'ok', text: t('reader.note.saved', { title: note?.title ?? cleanTitle }) });
        } catch (caught) {
          if (caught && caught.name === 'AbortError') return;
          if (alive.current) {
            setNotice({
              kind: 'bad',
              text: t('reader.note.failed', { detail: caught && caught.message ? caught.message : String(caught) }),
            });
          }
        }
      }, [selection, call, t]);

      const copySelection = useCallback(() => {
        if (selection === null) return;
        const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (clip === undefined || typeof clip.writeText !== 'function') return;
        const text = `${selection.path}:${selection.startLine}-${selection.endLine}\n${selection.text}`;
        clip.writeText(text).then(() => setCopied(true)).catch(() => {});
      }, [selection]);

      const clearPick = useCallback(() => {
        if (activePath === undefined) return;
        updateTabPick(activePath, null);
        setNoteOpen(false);
      }, [activePath, updateTabPick]);

      useEffect(() => {
        if (!copied) return undefined;
        const timer = setTimeout(() => setCopied(false), 1400);
        return () => clearTimeout(timer);
      }, [copied]);

      /* ---- render ------------------------------------------------------------ */

      const found = file === undefined ? true : file.found !== false;

      return h('div', { className: 'cs-root cs-sb-root' },
        h(SbFileTree, {
          entries: treeEntries,
          activePath,
          expanded,
          onToggleDir: toggleDir,
          onOpenFile: openFile,
          filter,
          onFilterChange: setFilter,
          loading: treeLoading,
          error: treeError,
          onRetry: () => setTreeNonce((n) => n + 1),
          t,
        }),

        h(SbTabBar, {
          tabs,
          activePath,
          onActivate: activateTab,
          onClose: closeTab,
          t,
        }),

        notice === undefined
          ? null
          : h('div', { className: `cs-sb-banner${notice.kind === 'ok' ? ' cs-ok' : ''}` },
            notice.kind === 'ok' ? Glyph.check(13) : Glyph.alert(13),
            h('span', { className: 'cs-grow' }, notice.text),
            h('button', {
              type: 'button', className: 'cs-iconbtn', 'aria-label': t('common.close'),
              onClick: () => setNotice(undefined),
            }, Glyph.close(11))),

        activePath === undefined
          ? h('div', { className: 'cs-sb-empty' },
            Glyph.code(24),
            h('b', null, t('reader.empty.title')),
            h('p', null, t('reader.empty.body')))
          : fileError !== undefined && file === undefined
            ? h('div', { className: 'cs-sb-empty' },
              Glyph.alert(24),
              h('b', null, t('reader.error.title')),
              h('p', null, fileError),
              h('button', {
                type: 'button', className: 'cs-btn',
                onClick: () => {
                  fileCache.current.delete(activePath);
                  setFile(undefined);
                  setFileError(undefined);
                  setFramesNonce((n) => n + 1);
                },
              }, Glyph.refresh(12), t('reader.tree.retry')))
            : file !== undefined && found === false
              ? h('div', { className: 'cs-sb-empty' },
                Glyph.file(24),
                h('b', null, t('reader.notFound', { path: activePath })),
                h('p', null, activePath))
              : h('div', { className: 'cs-sb-body' },
                file?.history !== undefined && file.history !== null
                  ? h('div', { className: 'cs-sb-history', 'data-cs': 'history-banner' },
                    Glyph.layers(12),
                    h('span', { className: 'cs-grow cs-ellipsis' },
                      t('reader.history.banner', {
                        sha: String(file.history.sha ?? '').slice(0, 7),
                        date: String(file.history.date ?? '').slice(0, 10),
                        subject: String(file.history.subject ?? ''),
                      })))
                  : null,
                h(SbEditorHost, {
                  ctx,
                  file,
                  pick: activeTab?.pick ?? null,
                  frames: dedupedFrames,
                  onSelection: onEditorSelection,
                  onGutterPick,
                  t,
                }),
                h(SbFrameRail, {
                  frames: dedupedFrames,
                  t,
                  onOpenSession: openSession,
                  onDelete: deleteFrame,
                })),

        noteOpen && selection !== null
          ? h(SbNoteForm, {
            path: selection.path,
            startLine: selection.startLine,
            endLine: selection.endLine,
            onCancel: () => setNoteOpen(false),
            onSave: (title) => { void saveNote(title); },
            t,
          })
          : null,

        selection === null
          ? activePath !== undefined && file !== undefined && found !== false
            ? h('div', { className: 'cs-sb-picker-bar' },
              Glyph.target(11),
              h('span', { className: 'cs-sb-picker-label cs-ellipsis' }, t('reader.hint')))
            : null
          : h('div', { className: 'cs-sb-picker-bar', 'data-cs': 'picker-bar' },
            h('span', { className: 'cs-sb-picker-label' },
              h('b', null, `${selection.startLine}-${selection.endLine}`),
              ' · ',
              t('reader.selected', {
                start: selection.startLine,
                end: selection.endLine,
                count: selection.endLine - selection.startLine + 1,
              })),
            h('button', {
              type: 'button', className: 'cs-btn cs-small cs-primary',
              onClick: () => { void ask(); },
            }, Glyph.chatPlus(12), t('reader.action.ask')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small',
              disabled: noteOpen,
              onClick: () => setNoteOpen(true),
            }, Glyph.noteAdd(12), t('reader.action.note')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small cs-ghost',
              onClick: copySelection,
            }, Glyph.copy(12), copied ? t('reader.copied') : t('reader.action.copy')),
            h('button', {
              type: 'button', className: 'cs-btn cs-small cs-ghost',
              onClick: clearPick,
            }, t('reader.action.clear'))));
    }

    /**
     * The inline "save these lines as a note" form.
     *
     * Inline rather than modal: the point is to keep looking at the code while
     * naming the note. Mirrors the existing code pane's form.
     *
     * @param props - `{path, startLine, endLine, onSave(title), onCancel, t}`.
     * @returns the form node.
     */
    function SbNoteForm(props) {
      const { path, startLine, endLine, onSave, onCancel, t } = props;
      const [title, setTitle] = useState(t('reader.note.defaultTitle', {
        file: sbBaseName(path), start: startLine, end: endLine,
      }));
      return h('div', { className: 'cs-sb-noteform' },
        h('div', { className: 'cs-row' },
          h('input', {
            className: 'cs-input',
            value: title,
            autoFocus: true,
            maxLength: 200,
            placeholder: t('reader.note.title'),
            'aria-label': t('reader.note.title'),
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSave?.(title);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancel?.();
              }
            },
          }),
          h('button', {
            type: 'button', className: 'cs-btn cs-small cs-primary',
            disabled: title.trim() === '',
            onClick: () => onSave?.(title),
          }, t('reader.note.save')),
          h('button', {
            type: 'button', className: 'cs-btn cs-small',
            onClick: () => onCancel?.(),
          }, t('reader.note.cancel'))));
    }

    /* ================================================================ *
     * sidebar/overlay.js
     * ================================================================ */
    /**
     * CodeSlice's layer on top of the vendored Better Sidebar editor.
     *
     * The upstream editor is used as-is (CodeMirror 6, its themes, its tabs, its
     * own "add to conversation" selection popup). This module adds the three
     * things CodeSlice needs without forking the editor:
     *
     *   1. a **range frame**: one accent box spanning the recorded line range,
     *      drawn as an absolutely positioned overlay over the editor's content;
     *   2. a **title bar** above the first visible line of that range — the
     *      "小标题条" — carrying the range label; clicking it opens the session
     *      that asked about the range;
     *   3. a **"添加到对话"** action next to a fresh selection, which creates a new
     *      conversation, inserts the quote chip into its composer, and records a
     *      frame for that conversation.
     *
     * Geometry comes from the editor's own DOM, not from a private view object:
     * CodeMirror renders one `.cm-line` per document line and a line-number gutter
     * whose elements share the line's exact `top`. That is enough to map a
     * document line to a pixel band for the visible viewport, and it survives
     * upstream upgrades because both nodes are public rendering, not internals.
     *
     * Everything is additive: no editor state is mutated, no DOM inside the
     * editor's own subtree is replaced, and removing the layer only removes nodes
     * this module created.
     */







    const STYLE_ID = 'codeslice-overlay-style';const EDITOR_FLAG = 'data-codeslice-overlay';
    const FRAME_REFRESH_MS = 1800;

    const OVERLAY_CSS = `
    .cs-frame-layer { position: absolute; inset: 0; pointer-events: none; z-index: 4; overflow: hidden; }
    .cs-frame-box { position: absolute; border-top: 2px solid var(--cs-accent, #4f8cff); border-bottom: 2px solid var(--cs-accent, #4f8cff); background: color-mix(in srgb, var(--cs-accent, #4f8cff) 8%, transparent); pointer-events: none; }
    .cs-frame-title { position: absolute; height: 19px; line-height: 19px; padding: 0 8px; box-sizing: border-box; border-radius: 4px 4px 0 0; background: var(--cs-accent, #4f8cff); color: #fff; font: 11px/19px var(--dsw-font-sans, system-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: auto; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    .cs-frame-title:hover { filter: brightness(1.08); }
    /* The upstream editor portals its own "添加到对话" popup to document.body.
       CodeSlice owns that gesture now (it has to create the conversation first),
       so the upstream button is hidden and this one takes its place. */
    [class*="selectionPopup"] { display: none !important; }
    .cs-add-chip { position: absolute; z-index: 6; pointer-events: auto; box-sizing: border-box; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1, #d0d0d0); border-radius: 6px; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff)); color: var(--dsw-alias-label-primary, #111); font: 11px/26px var(--dsw-font-sans, system-ui); white-space: nowrap; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
    .cs-add-chip:hover { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover, #f2f2f2)); }
    .cs-add-chip[hidden] { display: none !important; }
    .cs-frame-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; margin-right: 4px; }
    `;

    /** Inject the layer stylesheet once. Returns the element this call created. */
    function ensureStyle() {
      if (typeof document === 'undefined') return undefined;
      const existing = document.getElementById(STYLE_ID);
      if (existing !== null) return undefined;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.dataset.codeslice = 'overlay';
      style.textContent = OVERLAY_CSS;
      document.head.append(style);
      return style;
    }

    /** The document line number rendered by a `.cm-line`, from the gutter row at the same `top`. */
    function lineNumberAt(line, gutterRows) {
      const top = line.getBoundingClientRect().top;
      let best;
      let distance = Infinity;
      for (const row of gutterRows) {
        const delta = Math.abs(row.top - top);
        if (delta < distance) {
          distance = delta;
          best = row;
        }
      }
      return distance <= 2 ? best.line : undefined;
    }

    /** Read the visible line bands of one editor, keyed by document line. */
    function visibleLines(editor) {
      const editorRect = editor.getBoundingClientRect();
      const gutterRows = [...editor.querySelectorAll('.cm-gutterElement')]
        .map((element) => ({ top: element.getBoundingClientRect().top, line: Number(element.textContent.trim()) }))
        .filter((row) => Number.isFinite(row.line) && row.line > 0);
      const lines = [...editor.querySelectorAll('.cm-line')];
      const bands = new Map();
      let contentLeft = editorRect.width;
      let contentRight = 0;
      for (const line of lines) {
        const number = lineNumberAt(line, gutterRows);
        if (number === undefined) continue;
        const rect = line.getBoundingClientRect();
        bands.set(number, { top: rect.top - editorRect.top, bottom: rect.bottom - editorRect.top });
        contentLeft = Math.min(contentLeft, rect.left - editorRect.left);
        contentRight = Math.max(contentRight, rect.right - editorRect.left);
      }
      return { bands, editorRect, contentLeft, contentRight };
    }

    /** The file path shown by the editor tab that owns this editor. */
    function pathOf(editor) {
      let ancestor = editor.parentElement;
      for (let depth = 0; ancestor !== null && depth < 6; depth += 1) {
        const input = ancestor.querySelector('input[class*="editorPathInput"]')
          ?? [...ancestor.querySelectorAll('input')].find((candidate) => candidate.value.includes('.'));
        if (input !== undefined && input !== null && input.value.trim() !== '') return input.value.trim();
        ancestor = ancestor.parentElement;
      }
      return '';
    }

    /** Normalise a path to the POSIX relative form the frames store uses. */
    function relativeOf(root, path) {
      if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) return path.replace(/\\/gu, '/');
      const normalRoot = root.replace(/\\/gu, '/').replace(/\/+$/u, '');
      const normalPath = path.replace(/\\/gu, '/');
      if (normalPath.toLowerCase().startsWith(`${normalRoot.toLowerCase()}/`)) {
        return normalPath.slice(normalRoot.length + 1);
      }
      return normalPath;
    }

    /** The workspace root and session that own one editor path. */
    function scopeOf(ctx, path) {
      let sessions;
      try {
        sessions = ctx.get('sessions');
      } catch {
        sessions = undefined;
      }
      const byId = sessions?.list?.getSnapshot?.()?.byId ?? {};
      let ids = [];
      try {
        ids = [...(sessions?.scopes?.keys?.() ?? [])];
      } catch {
        ids = [];
      }
      const absolute = path.replace(/\\/gu, '/');
      for (const sessionId of ids) {
        const cwd = byId[sessionId]?.cwd;
        if (typeof cwd !== 'string' || cwd === '') continue;
        const normal = cwd.replace(/\\/gu, '/').replace(/\/+$/u, '');
        if (absolute.toLowerCase().startsWith(`${normal.toLowerCase()}/`)) return { sessionId, cwd };
      }
      for (const sessionId of ids) {
        const cwd = byId[sessionId]?.cwd;
        if (typeof cwd === 'string' && cwd !== '') return { sessionId, cwd };
      }
      return { sessionId: ids[0] ?? '', cwd: '' };
    }

    /**
     * One attached editor.
     *
     * Owns its own layer nodes and listeners; `dispose` removes exactly those.
     */
    class EditorOverlay {
      constructor(ctx, editor, handlers) {
        this.ctx = ctx;
        this.editor = editor;
        this.handlers = handlers;
        this.disposed = false;
        this.path = '';
        this.sessionId = '';
        this.titleAttempts = new Set();
        this.root = '';
        this.frames = [];
        this.lastSelection = null;
        this.layer = document.createElement('div');
        this.layer.className = 'cs-frame-layer';
        this.chip = document.createElement('button');
        this.chip.type = 'button';
        this.chip.className = 'cs-add-chip';
        this.chip.hidden = true;
        this.chip.textContent = '添加到对话';
        this.layer.append(this.chip);
        editor.append(this.layer);
        editor.setAttribute(EDITOR_FLAG, '1');

        this.onMouseUp = () => this.readSelection();
        this.onScroll = () => this.scheduleRender();
        this.onKeyUp = () => this.readSelection();
        this.onResize = () => this.scheduleRender();
        this.chip.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.addToConversation();
        });
        // The layer sits inside the editor, so a mousedown on the chip would bubble
        // and re-read the old selection — which would pop the chip back right after
        // it was used. Keep the chip's own gestures out of the editor's listeners.
        this.chip.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        this.chip.addEventListener('mouseup', (event) => event.stopPropagation());
        editor.addEventListener('mouseup', this.onMouseUp);
        editor.addEventListener('keyup', this.onKeyUp);
        this.scroller = editor.querySelector('.cm-scroller') ?? editor;
        this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
        this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.onResize) : undefined;
        this.resizeObserver?.observe(editor);
        this.timer = setInterval(() => this.refresh(), FRAME_REFRESH_MS);
        this.refresh();
      }

      /** Re-read the path, reload frames when it changed, and repaint. */
      refresh() {
        if (this.disposed) return;
        const path = pathOf(this.editor);
        if (path !== this.path) {
          this.path = path;
          const scope = path === '' ? { sessionId: '', cwd: '' } : scopeOf(this.ctx, path);
          this.sessionId = scope.sessionId;
          this.root = scope.cwd;
          this.frames = [];
          this.loadFrames();
        } else if (this.frames.length === 0) {
          // A citation records its frame right after the tab opens; without a second
          // look the overlay painted before the record existed and the box never
          // appeared. One extra read per tick is enough to pick it up.
          this.loadFrames();
        }
        this.render();
      }

      /** Load the frames for the current path, across sessions.
       *
       * A frame belongs to the session that asked the question, and every "添加到
       * 对话" opens a new one. If this list were filtered by the editor's current
       * session, a frame created in the new session would never be painted while
       * the user is still looking at the same file. The title carries the owning
       * session, so listing all ranges is enough.
       */
      /** Ask for titles for frames that still carry the old mechanical label. */
      refineLegacyTitles() {
        for (const frame of this.frames) {
          const title = typeof frame?.title === 'string' ? frame.title.trim() : '';
          const mechanical = /^关于\s+[^\s]+\s+第\s*\d+([-–~]\d+)?\s*行$/u.test(title);
          // Only upgrade the current session's frames. The file can be quoted by
          // many conversations; generating a title for every historical session
          // would spend a model call on labels the reader is not looking at.
          if (typeof frame?.sessionId === 'string' && frame.sessionId !== ''
            && frame.sessionId !== this.sessionId) continue;
          if (!mechanical || this.titleAttempts.has(frame.id)) continue;
          this.titleAttempts.add(frame.id);
          void this.refineFrameTitle({
            path: frame.path,
            startLine: frame.startLine,
            endLine: frame.endLine,
            root: this.root,
          }, frame.sessionId ?? this.sessionId, frame, title);
        }
      }

      async loadFrames() {
        if (this.disposed || this.path === '' || this.root === '') return;
        try {
          const value = await api(this.ctx, 'frames', {
            op: 'list',
            root: this.root,
            path: relativeOf(this.root, this.path),
          });
          if (this.disposed) return;
          this.frames = Array.isArray(value?.frames) ? value.frames : [];
          // Frames created before the AI-title change still carry the old
          // "关于 file 第 x-y 行" string. Upgrade them lazily on the next view so the
          // reader does not have to re-add the range to get a real title.
          this.refineLegacyTitles();
          this.render();
        } catch {
          // A missing store is an empty store; the editor keeps working.
        }
      }

      /** Repaint on the next frame, coalescing scroll bursts. */
      scheduleRender() {
        if (this.disposed) return;
        if (this.raf !== undefined) return;
        this.raf = requestAnimationFrame(() => {
          this.raf = undefined;
          this.render();
        });
      }

      /** Draw frames and the current selection chip. */
      render() {
        if (this.disposed) return;
        // Geometry comes from the editor's own DOM. Do not pad `.cm-line` rows: the
        // line-number gutter is laid out independently, and moving text without its
        // gutter row breaks the top-edge pairing this module uses to map line
        // numbers to pixel bands. The bar therefore floats in the row above the
        // range; a range at the very top of the viewport has no row above it, so its
        // bar is skipped rather than painted over the path header.
        const { bands, editorRect, contentLeft, contentRight } = visibleLines(this.editor);
        for (const node of [...this.layer.querySelectorAll('.cs-frame-box, .cs-frame-title')]) node.remove();
        if (bands.size === 0) return;
        const left = Math.max(0, contentLeft - 2);
        const width = Math.max(40, contentRight - contentLeft + 6);

        // Several sessions can quote the same range. Painted one box per range;
        // the newest frame's title (and therefore its session) is the one the
        // clickable title opens.
        const ranges = new Map();
        for (const frame of this.frames) {
          const start = Number(frame.actualStart ?? frame.startLine);
          const end = Number(frame.actualEnd ?? frame.endLine);
          if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
          ranges.set(`${start}:${end}`, frame);
        }

        for (const frame of ranges.values()) {
          const start = Number(frame.actualStart ?? frame.startLine);
          const end = Number(frame.actualEnd ?? frame.endLine);
          const visible = [...bands.entries()].filter(([line]) => line >= start && line <= end);
          if (visible.length === 0) continue;
          const first = visible[0][1];
          const last = visible[visible.length - 1][1];
          const box = document.createElement('div');
          box.className = 'cs-frame-box';
          box.style.left = `${left}px`;
          box.style.top = `${first.top}px`;
          box.style.width = `${width}px`;
          box.style.height = `${Math.max(2, last.bottom - first.top)}px`;
          this.layer.append(box);

          if (!bands.has(start) || first.top < 20) continue;
          const title = document.createElement('div');
          title.className = 'cs-frame-title';
          title.style.left = `${left}px`;
          title.style.maxWidth = `${width}px`;
          title.style.top = `${first.top - 19}px`;
          const label = frame.title || `关于 ${this.path} 第 ${start}-${end} 行`;
          title.textContent = label;
          title.title = `${label} · 点击回到发起它的会话`;
          title.addEventListener('mousedown', (event) => event.stopPropagation());
          title.addEventListener('mouseup', (event) => event.stopPropagation());
          title.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handlers.onOpenSession?.(frame, this.sessionId);
          });
          this.layer.append(title);
        }
      }

      /** Read the current selection and park the chip next to it. */
      readSelection() {
        if (this.disposed) return;
        const selection = window.getSelection();
        const text = selection?.toString() ?? '';
        if (text.trim() === '') {
          this.hideChip();
          // Keep the session's last published range. Switching conversations
          // unmounts the composer, and clearing on every empty mouseup made the
          // label say "未选代码" when the reader came back to the same code.
          return;
        }
        const editorRect = this.editor.getBoundingClientRect();
        const anchor = selection.anchorNode;
        const focus = selection.focusNode;
        const lineOf = (node) => {
          const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
          return element?.closest('.cm-line') ?? null;
        };
        const first = lineOf(anchor) ?? lineOf(focus);
        const last = lineOf(focus) ?? lineOf(anchor);
        if (first === null || last === null) {
          this.hideChip();
          return;
        }
        const { bands } = visibleLines(this.editor);
        const lineNumber = (line) => [...bands.entries()].find(([, band]) => {
          const rect = line.getBoundingClientRect();
          return Math.abs(band.top - (rect.top - editorRect.top)) < 2;
        })?.[0];
        // The band map is keyed by line; recover numbers from the gutter instead.
        const gutterRows = [...this.editor.querySelectorAll('.cm-gutterElement')]
          .map((element) => ({ top: element.getBoundingClientRect().top, line: Number(element.textContent.trim()) }))
          .filter((row) => Number.isFinite(row.line) && row.line > 0);
        const startLine = lineNumberAt(first, gutterRows);
        const endLine = lineNumberAt(last, gutterRows);
        if (startLine === undefined || endLine === undefined) {
          this.hideChip();
          return;
        }
        const start = Math.min(startLine, endLine);
        const end = Math.max(startLine, endLine);
        const range = selection.getRangeAt(0);
        const rangeRect = range.getBoundingClientRect();
        this.lastSelection = {
          path: this.path,
          startLine: start,
          endLine: end,
          code: text,
          sessionId: this.sessionId,
          root: this.root,
        };
        setSelection({
          path: this.path,
          startLine: start,
          endLine: end,
          code: text,
        }, this.sessionId);
        this.chip.hidden = false;
        this.chip.textContent = '添加到对话';
        this.chip.style.left = `${Math.max(4, rangeRect.left - editorRect.left)}px`;
        this.chip.style.top = `${Math.max(2, rangeRect.top - editorRect.top - 32)}px`;
      }

      /** Hide the chip without touching the editor's own selection. */
      hideChip() {
        this.chip.hidden = true;
        this.lastSelection = null;
      }

      /** Create a fresh conversation, put this selection in its composer, record the frame. */
      async addToConversation() {
        const selection = this.lastSelection;
        if (selection === null || selection === undefined) return;
        const useProjectContext = getContextEnabled(selection.sessionId);
        // The final title is a knowledge-point phrase produced by the Host from the
        // selected code. Keep a neutral placeholder while that call is in flight;
        // the old "关于 file 第 x-y 行" is a location, not a title.
        const label = '正在总结这个知识点…';
        this.hideChip();
        // The quote is about to move to a new composer; drop the editor's own selection
        // so a later click does not resurrect the old chip next to a range already used.
        window.getSelection()?.removeAllRanges();

        const sessions = this.ctx.get('sessions');
        const conversation = this.ctx.get('conversation');
        const workspaceService = this.ctx.get('uiWorkspace');
        const root = selection.root || sessions?.list?.getSnapshot?.()?.byId?.[selection.sessionId]?.cwd || '';
        const workspaceItems = workspaceService?.workspaces?.list?.getSnapshot?.()?.items ?? [];
        const normal = (value) => String(value ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase();
        const owner = workspaceItems.find((item) => normal(item?.path) === normal(root)
            && Array.isArray(item?.sessionIds) && item.sessionIds.includes(selection.sessionId))
          ?? workspaceItems.find((item) => normal(item?.path) === normal(root))
          ?? workspaceItems.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(selection.sessionId))
          ?? workspaceItems[0];

        if (sessions !== undefined && typeof sessions.create === 'function' && owner !== undefined) {
          try {
            const sessionId = await sessions.create({ workspaceId: owner.workspaceId });
            if (typeof sessionId === 'string' && sessionId !== '') {
              // The quote belongs to the new conversation's composer, so publish the
              // selection under that session too. The original session keeps its
              // own range; switching back to it must not show "未选代码".
              setSelection({
                path: selection.path,
                startLine: selection.startLine,
                endLine: selection.endLine,
                code: selection.code,
              }, sessionId);
              // The new composer inherits the switch the reader had set when they
              // hit "添加到对话"; otherwise the first question there would silently
              // fall back to snippet-only mode.
              setContextEnabled(useProjectContext, sessionId);
              try {
                workspaceService?.openSession?.(sessionId);
              } catch {
                // The new session still exists; the composer below may simply mount later.
              }
              // Better Sidebar's tabs are session-scoped: the new conversation starts
              // with an empty right pane. Let the host swap panes first, then reopen
              // the same file in the new session so the code and its frame stay
              // beside the composer.
              await new Promise((resolve) => setTimeout(resolve, 200));
              revealCodeRange(this.ctx, selection, root, sessionId);
              const input = await this.waitForComposer(sessions, conversation, sessionId);
              if (input !== undefined) {
                const header = `${relativeOf(root, selection.path)}:${selection.startLine}-${selection.endLine}`;
                const code = selection.code.length > 500 ? '' : selection.code;
                const text = code === '' ? header : `\`\`\`${header}\n${code}\n\`\`\``;
                try {
                  const snapshot = input.state.getSnapshot();
                  if (typeof input.insertReference === 'function' && snapshot.draftRev !== undefined) {
                    input.insertReference({
                      source: 'reference',
                      ref: text,
                      label: header,
                      clipboardText: header,
                    }, { draftRev: snapshot.draftRev, start: 0, end: 0 });
                  } else if (typeof input.setDraft === 'function') {
                    input.setDraft(text);
                  }
                } catch {
                  // The new session is open even if its composer refused the chip.
                }
              }
              const frame = await this.recordFrame(selection, sessionId, label);
              if (frame !== undefined) void this.refineFrameTitle(selection, sessionId, frame, label);
              return;
            }
          } catch (error) {
            this.ctx.logger?.warn?.(`codeslice: new conversation failed: ${String(error?.message ?? error)}`);
          }
        }

        // No session factory (or it failed): keep the old in-place quote so the
        // selection is not lost.
        this.handlers.onAsk?.({
          path: selection.path,
          startLine: selection.startLine,
          endLine: selection.endLine,
          code: selection.code,
        });
        const frame = await this.recordFrame(selection, selection.sessionId, label);
        if (frame !== undefined) void this.refineFrameTitle(selection, selection.sessionId, frame, label);
      }

      /** Wait until the newly opened session's composer exists. */
      async waitForComposer(sessions, conversation, sessionId) {
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
          try {
            const scope = sessions.scope?.(sessionId);
            if (scope !== undefined && scope !== null) {
              const input = conversation?.input?.for(scope);
              if (input?.state?.getSnapshot !== undefined) return input;
            }
          } catch {
            // The session scope is still materialising; retry on the next tick.
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return undefined;
      }

      /** Persist the range box for the session that owns the quote. */
      async recordFrame(selection, sessionId, label) {
        const root = selection.root || this.root;
        try {
          const value = await api(this.ctx, 'frames', {
            op: 'create',
            root,
            path: relativeOf(root, selection.path),
            startLine: selection.startLine,
            endLine: selection.endLine,
            sessionId,
            title: label,
            question: `${label}：请解释这段代码在做什么，以及为什么这么写。`,
          });
          await this.loadFrames();
          return value?.frame;
        } catch {
          // The quote already went into the composer; failing to record the box
          // must not cost the reader their question.
          return undefined;
        }
      }

      /** Ask the Host for the knowledge-point title and repaint when it lands. */
      async refineFrameTitle(selection, sessionId, frame, fallbackTitle) {
        if (frame === undefined || frame === null) return;
        const root = selection.root || this.root;
        try {
          await api(this.ctx, 'frames', {
            op: 'title',
            root,
            id: frame.id,
            sessionId,
            path: relativeOf(root, selection.path),
            startLine: selection.startLine,
            endLine: selection.endLine,
            fallbackTitle,
          });
          if (!this.disposed) await this.loadFrames();
        } catch {
          // A model failure leaves the neutral placeholder in place; the note
          // generator can still replace it with its own valid title later.
        }
      }

      /** Remove every node and listener this overlay owns. */
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        clearInterval(this.timer);
        if (this.raf !== undefined) cancelAnimationFrame(this.raf);
        this.editor.removeEventListener('mouseup', this.onMouseUp);
        this.editor.removeEventListener('keyup', this.onKeyUp);
        this.scroller.removeEventListener('scroll', this.onScroll);
        this.resizeObserver?.disconnect();
        this.layer.remove();
        this.editor.removeAttribute(EDITOR_FLAG);
      }
    }

    /**
     * Start the overlay manager.
     *
     * @param ctx - the client context.
     * @param handlers - `{ onAsk, onOpenSession }`; both receive the selection/frame.
     * @returns a disposer that removes every overlay and the observer.
     */
    function startCodeSliceOverlay(ctx, handlers = {}) {
      if (typeof document === 'undefined') return () => {};
      const ownedStyle = ensureStyle();
      /** @type {Map<HTMLElement, EditorOverlay>} */
      const attached = new Map();

      const scan = () => {
        for (const editor of document.querySelectorAll('.cm-editor')) {
          if (attached.has(editor)) continue;
          if (editor.closest('[data-codeslice-overlay]') !== null) continue;
          try {
            attached.set(editor, new EditorOverlay(ctx, editor, handlers));
          } catch {
            // A detached editor or an unsupported layout: leave it alone.
          }
        }
        for (const [editor, overlay] of attached) {
          if (!editor.isConnected) {
            overlay.dispose();
            attached.delete(editor);
          }
        }
      };

      scan();
      const observer = typeof MutationObserver === 'function'
        ? new MutationObserver(() => scan())
        : undefined;
      observer?.observe(document.body, { childList: true, subtree: true });
      const timer = setInterval(scan, 1000);

      return () => {
        clearInterval(timer);
        observer?.disconnect();
        for (const overlay of attached.values()) overlay.dispose();
        attached.clear();
        ownedStyle?.remove();
      };
    }

    /* ================================================================ *
     * sidebar/locale.js
     * ================================================================ */
    /**
     * Copy for the CodeSlice reader sidebar (`codeslice:reader`).
     *
     * Two complete tables, same key set, the discipline of `i18n.js`: a half
     * translated pane is worse than an untranslated one. The integration side
     * merges this dictionary into the bundle through `mergeDict(ctx, SIDEBAR_LOCALE)`,
     * so every key here is owned by the sidebar area alone.
     */

    const SIDEBAR_LOCALE = {
      zh: {
        /* ---- file tree ------------------------------------------------- */
        'reader.tree.filter': '按路径筛选文件',
        'reader.tree.loading': '正在读取文件树…',
        'reader.tree.empty': '工作区里没有文件',
        'reader.tree.error': '文件树加载失败',
        'reader.tree.retry': '重试',

        /* ---- tabs ------------------------------------------------------ */
        'reader.tab.close': '关闭标签',

        /* ---- editor / empty state -------------------------------------- */
        'reader.editor.loading': '正在加载编辑器…',
        'reader.editor.failed': '编辑器加载失败',
        'reader.error.title': '代码读取失败',
        'reader.empty.title': '还没有打开文件',
        'reader.empty.body': '从左侧文件树选择一个文件开始阅读。',
        'reader.notFound': '这个文件不在工作区里：{path}',
        'reader.refresh': '重新读取',
        'reader.lines': '{count} 行',

        /* ---- selection ------------------------------------------------- */
        'reader.selected': '已选第 {start}-{end} 行 · {count} 行',
        'reader.hint': '点行号选起点，再点一行选终点；也可以直接拖选文本',
        'reader.action.ask': '问 CodeSlice',
        'reader.action.note': '转笔记',
        'reader.action.copy': '复制',
        'reader.action.clear': '清除',
        'reader.copied': '已复制',

        /* ---- note form -------------------------------------------------- */
        'reader.note.title': '笔记标题',
        'reader.note.defaultTitle': '{file} 第 {start}-{end} 行',
        'reader.note.save': '保存笔记',
        'reader.note.cancel': '取消',
        'reader.note.saved': '已存为笔记：{title}',
        'reader.note.failed': '存笔记失败：{detail}',

        /* ---- frames ----------------------------------------------------- */
        'reader.frames.none': '这个文件还没有关联区间。',
        'reader.frame.moved': '已移动',
        'reader.frame.missing': '已失效',
        'reader.frame.movedRange': '原 {start}-{end}',
        'reader.frame.open': '打开对话定位',
        'reader.frame.delete': '删除区间',
        'reader.frame.citation': '笔记引用',
        'reader.history.banner': '历史版本 {sha} · {date} · {subject}（当前工作区已没有这段代码）',
      },

      en: {
        /* ---- file tree ------------------------------------------------- */
        'reader.tree.filter': 'Filter files by path',
        'reader.tree.loading': 'Reading the file tree…',
        'reader.tree.empty': 'No files in this workspace',
        'reader.tree.error': 'Could not load the file tree',
        'reader.tree.retry': 'Retry',

        /* ---- tabs ------------------------------------------------------ */
        'reader.tab.close': 'Close tab',

        /* ---- editor / empty state -------------------------------------- */
        'reader.editor.loading': 'Loading editor…',
        'reader.editor.failed': 'Editor failed to load',
        'reader.error.title': 'Could not read the code',
        'reader.empty.title': 'No file open',
        'reader.empty.body': 'Pick a file from the tree to start reading.',
        'reader.notFound': 'That file is not in the workspace: {path}',
        'reader.refresh': 'Read again',
        'reader.lines': '{count} lines',

        /* ---- selection ------------------------------------------------- */
        'reader.selected': 'Lines {start}-{end} selected · {count} lines',
        'reader.hint': 'Click a line number for the start, another for the end — or drag text',
        'reader.action.ask': 'Ask CodeSlice',
        'reader.action.note': 'Save as note',
        'reader.action.copy': 'Copy',
        'reader.action.clear': 'Clear selection',
        'reader.copied': 'Copied',

        /* ---- note form -------------------------------------------------- */
        'reader.note.title': 'Note title',
        'reader.note.defaultTitle': '{file} lines {start}-{end}',
        'reader.note.save': 'Save note',
        'reader.note.cancel': 'Cancel',
        'reader.note.saved': 'Note saved: {title}',
        'reader.note.failed': 'Could not save the note: {detail}',

        /* ---- frames ----------------------------------------------------- */
        'reader.frames.none': 'No framed range in this file yet.',
        'reader.frame.moved': 'Moved',
        'reader.frame.missing': 'Missing',
        'reader.frame.movedRange': 'was {start}-{end}',
        'reader.frame.open': 'Open the conversation',
        'reader.frame.delete': 'Delete range',
        'reader.frame.citation': 'Note citation',
        'reader.history.banner': 'History {sha} · {date} · {subject} (this code is gone from the worktree)',
      },
    };

    /* ================================================================ *
     * sidebar/style.js
     * ================================================================ */
    /**
     * Stylesheet fragment for the CodeSlice reader sidebar (`codeslice:reader`).
     *
     * Discipline matches the base sheet in `styles.js`:
     *   - every selector starts with `cs-sb-` (the `cs-` prefix the host owns);
     *   - colours come only from `--dsw-alias-*` tokens, derived with `color-mix`;
     *   - no `:root`, no `body`, no `!important`, no scrollbar rules;
     *   - sizes, spacing and radii are plain values (the host declares no tokens).
     *
     * The integration side appends this fragment after the base sheet, so a shared
     * selector this area owns gets the last word.
     */

    const SIDEBAR_CSS = `
    /* ---------------------------------------------------------------- *
     * Reader shell: tree on top, tabs, then editor + frame rail         *
     * ---------------------------------------------------------------- */
    .cs-sb-root {
      display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
      box-sizing: border-box;
    }
    .cs-sb-root *, .cs-sb-root *::before, .cs-sb-root *::after { box-sizing: border-box; }

    /* ---- file tree ---------------------------------------------------- */
    .cs-sb-tree {
      flex: 0 0 auto; display: flex; flex-direction: column;
      max-height: 42%; min-height: 0;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-sb-tree-head {
      display: flex; align-items: center; gap: 6px; padding: 5px 8px;
      flex: 0 0 auto;
    }
    .cs-sb-tree-list {
      flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain;
      padding: 2px 0 6px;
    }
    .cs-sb-tree-row {
      display: flex; align-items: center; gap: 4px; width: 100%;
      padding: 2px 8px 2px 0; min-height: 22px;
      border: none; background: transparent; cursor: pointer;
      text-align: left; font: inherit; color: inherit; min-width: 0;
    }
    .cs-sb-tree-row:hover { background: var(--dsw-alias-bg-layer-1); }
    .cs-sb-tree-row.cs-active { background: var(--dsw-alias-bg-layer-2); }
    .cs-sb-tree-row.cs-active .cs-sb-tree-name { color: var(--dsw-alias-brand-primary); font-weight: 600; }
    .cs-sb-tree-twist {
      display: flex; flex: 0 0 auto; width: 14px; justify-content: center;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-sb-tree-twist[data-open='true'] { transform: rotate(90deg); }
    .cs-sb-tree-glyph { display: flex; flex: 0 0 auto; color: var(--dsw-alias-label-secondary); }
    .cs-sb-tree-name {
      flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 11.5px;
    }
    .cs-sb-tree-row.cs-dir .cs-sb-tree-name { color: var(--dsw-alias-label-primary); }
    .cs-sb-tree-meta { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

    /* ---- tab strip ------------------------------------------------------ */
    .cs-sb-tabs {
      display: flex; align-items: stretch; gap: 2px;
      flex: 0 0 auto; min-height: 30px; padding: 3px 6px 0;
      overflow-x: auto; overflow-y: hidden;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-sb-tab {
      display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto;
      max-width: 150px; min-height: 24px; padding: 0 6px;
      border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 11px; cursor: pointer;
    }
    .cs-sb-tab.cs-on {
      background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
      border-color: var(--dsw-alias-border-l1);
    }
    .cs-sb-tab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cs-sb-tab-close {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; padding: 0; flex: 0 0 auto;
      border: none; border-radius: 4px; background: transparent;
      color: var(--dsw-alias-label-secondary); cursor: pointer;
    }
    .cs-sb-tab-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

    /* ---- body: editor + frame rail -------------------------------------- */
    .cs-sb-body { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-sb-editor-wrap {
      position: relative; flex: 1 1 auto; min-width: 0; min-height: 0;
      display: flex; flex-direction: column;
    }
    .cs-sb-editor-host { flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-sb-editor-note {
      display: flex; align-items: center; gap: 6px; padding: 6px 10px;
      font-size: 11px; color: var(--dsw-alias-label-secondary);
    }

    .cs-sb-rail {
      flex: 0 0 176px; display: flex; flex-direction: column; gap: 3px;
      min-height: 0; overflow: auto; overscroll-behavior: contain;
      padding: 5px 6px; border-left: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-sb-rail-empty {
      padding: 8px 6px; font-size: 10.5px; line-height: 1.5;
      color: var(--dsw-alias-label-secondary);
    }

    /* ---- frame strip: the 19px title bar above a framed range ----------- */
    .cs-sb-strip {
      display: flex; align-items: center; gap: 5px;
      height: 19px; flex: 0 0 auto; min-width: 0;
      padding: 0 4px; border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
    }
    .cs-sb-strip.cs-moved {
      border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 42%, transparent);
      background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);
    }
    .cs-sb-strip.cs-missing {
      opacity: .45; border-style: dashed;
      background: transparent;
    }
    .cs-sb-strip-flag {
      display: inline-flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0;
      height: 16px; padding: 0 6px; border: none; border-radius: 999px;
      background: transparent; color: var(--dsw-alias-label-primary);
      font: inherit; font-size: 10.5px; line-height: 14px; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cs-sb-strip-flag:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
    .cs-sb-strip-flag[disabled] { cursor: default; }
    .cs-sb-strip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cs-sb-badge {
      flex: 0 0 auto; padding: 0 5px; font-size: 9px; line-height: 14px; border-radius: 4px;
      border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary);
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .cs-sb-badge.cs-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
    .cs-sb-badge.cs-bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
    .cs-sb-strip-delete {
      display: inline-flex; align-items: center; justify-content: center;
      width: 15px; height: 15px; padding: 0; flex: 0 0 auto;
      border: none; border-radius: 4px; background: transparent;
      color: var(--dsw-alias-label-secondary); cursor: pointer; opacity: 0;
    }
    .cs-sb-strip:hover .cs-sb-strip-delete { opacity: 1; }
    .cs-sb-strip-delete:hover { color: var(--dsw-alias-state-error-primary); }

    /* ---- selection picker bar ------------------------------------------- */
    .cs-sb-picker-bar {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      flex: 0 0 auto; padding: 5px 8px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-sb-picker-label {
      flex: 1 1 auto; min-width: 0; font-size: 11px;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-sb-picker-label b { color: var(--dsw-alias-label-primary); }

    /* ---- note inline form ------------------------------------------------- */
    .cs-sb-noteform { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--dsw-alias-border-l1); }
    .cs-sb-noteform .cs-row { display: flex; align-items: center; gap: 4px; }

    /* ---- empty / error ---------------------------------------------------- */
    .cs-sb-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 22px 16px; text-align: center; height: 100%;
      color: var(--dsw-alias-label-secondary); font-size: 11.5px;
    }
    .cs-sb-empty b { color: var(--dsw-alias-label-primary); font-weight: 600; }
    .cs-sb-empty p { margin: 0; max-width: 42ch; }
    .cs-sb-banner {
      display: flex; align-items: flex-start; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; font-size: 11px;
      background: var(--dsw-alias-bg-layer-1);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-state-error-primary);
    }
    .cs-sb-banner.cs-ok { color: var(--dsw-alias-state-success-primary); }
    .cs-sb-banner .cs-grow { color: var(--dsw-alias-label-secondary); }
    .cs-sb-history {
      display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; font-size: 11px;
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
    }
    .cs-sb-history svg { color: var(--dsw-alias-brand-primary); }
    `;

    /* ================================================================ *
     * workbench/locale.js
     * ================================================================ */
    /**
     * Copy for the CodeSlice workbench (Agent D surface).
     *
     * Two complete tables, `zh` and `en`, with the same key set — `mergeDict`
     * throws when a key exists in only one language, so a half-translated panel
     * cannot ship. Existing stable keys (`common.*`, `family.*`, `notes.drift.*`)
     * are reused from the shared dictionary; everything new here lives under
     * `wb.nav.*`, `wb.projects.*`, `wb.ng.*`, `wb.notes.*`, `wb.settings.*`.
     */

    /**
     * Workbench copy. E merges this through `mergeDict(ctx, WORKBENCH_LOCALE)`.
     * @type {{ zh: Record<string, string>, en: Record<string, string> }}
     */
    const WORKBENCH_LOCALE = {
      zh: {
        /* ---- navigation ------------------------------------------------- */
        'wb.nav.title': 'CodeSlice 工作台',
        'wb.nav.notes': '知识库',
        'wb.nav.projects': '代码图谱',
        'wb.nav.noteGraph': '知识图谱',
        'wb.nav.settings': '设置',

        /* ---- notes library ---------------------------------------------- */
        'wb.notes.empty': '这个知识库还没有笔记。',
        'wb.notes.emptyHint': '在对话中生成笔记后，会在这里按文件夹列出。',
        'wb.notes.reader.empty': '选择一条笔记阅读。',
        'wb.notes.search': '搜索标题或内容',
        'wb.notes.root': '全部笔记',
        'wb.notes.loading': '正在读取笔记…',
        'wb.notes.error': '笔记读取失败',
        'wb.notes.back': '返回笔记列表',
        'wb.notes.import': '导入',
        'wb.notes.importPick': '选择 .md 文件',
        'wb.notes.importPath': '或粘贴文件路径（可换行多条）',
        'wb.notes.importRun': '导入',
        'wb.notes.importEmpty': '没有读到 Markdown 内容。',
        'wb.notes.imported': '已导入 {count} 篇笔记',
        'wb.notes.select': '选中这条笔记',
        'wb.notes.selected': '已选 {count} 篇',
        'wb.notes.cancelSelect': '取消选择',
        'wb.notes.export': '导出',
        'wb.notes.graph': '知识图谱',
        'wb.notes.folderToggle': '展开或收起文件夹',
        'wb.notes.exportSelected': '导出选中',
        'wb.notes.exportAll': '全部导出',
        'wb.notes.exportedMany': '已导出 {count} 篇到 {path}',

        /* ---- project graph register ------------------------------------- */
        'wb.projects.title': '项目图谱',
        'wb.projects.loading': '正在读取图谱登记…',
        'wb.projects.error': '读取图谱登记失败',
        'wb.projects.empty.title': '还没有已登记的图谱',
        'wb.projects.empty.body': '构建当前项目的代码图谱后，会登记在这里，可命名、查看统计与删除。',
        'wb.projects.rebuild': '立即构建当前项目图谱',
        'wb.projects.rebuilding': '构建中…',
        'wb.projects.rebuilt': '已触发重建，完成后会自动登记。',
        'wb.projects.open': '打开图谱',
        'wb.projects.rename': '重命名',
        'wb.projects.renamePlaceholder': '输入新名称',
        'wb.projects.delete': '删除',
        'wb.projects.deleteArm': '再次点击确认删除',
        'wb.projects.deleteConfirm': '删除这个项目图谱？登记记录会被移除，代码与笔记不受影响。',
        'wb.projects.unnamed': '未命名',
        'wb.projects.stats': '{files} 文件 · {lines} 行 · {nodes} 节点 · {edges} 边 · {communities} 社区',
        'wb.projects.builtAt': '构建于 {time}',
        'wb.projects.failed': '操作失败',

        /* ---- project graph canvas --------------------------------------- */
        'wb.canvas.back': '返回代码图谱',
        'wb.canvas.empty.title': '还没有打开图谱',
        'wb.canvas.empty.body': '在图谱列表中点击「打开图谱」，画布会填满这个区域。',

        /* ---- note graph -------------------------------------------------- */
        'wb.ng.title': '笔记 ↔ 代码锚点',
        'wb.ng.loading': '正在加载笔记图谱…',
        'wb.ng.error': '笔记图谱加载失败',
        'wb.ng.empty.title': '还没有可显示的关系',
        'wb.ng.empty.body': '笔记关联代码后，这里会画出笔记与锚点之间的连接。',
        'wb.ng.summary': '{count} 节点 · {edges} 连接',
        'wb.ng.openNote': '打开笔记',
        'wb.ng.openCode': '打开代码',
        'wb.ng.neighbours': '关联节点',
        'wb.ng.select': '选择一个节点查看关联。',
        'wb.ng.relation.same_folder': '同文件夹',
        'wb.ng.relation.shared_reference': '共用代码引用',
        'wb.ng.relation.anchor': '代码锚点',
        'wb.ng.kind.note': '笔记',
        'wb.ng.kind.code': '代码',

        /* ---- settings: prompts ------------------------------------------ */
        'wb.settings.prompts.title': '提示词',
        'wb.settings.prompts.system.label': '系统提示词（代码阅读规则）',
        'wb.settings.prompts.qa.label': '问答提示词',
        'wb.settings.prompts.note.label': '生成笔记提示词',
        'wb.settings.prompts.custom': '自定义',
        'wb.settings.prompts.default': '默认',
        'wb.settings.prompts.viewDefault': '查看默认提示词',
        'wb.settings.prompts.hideDefault': '收起默认提示词',
        'wb.settings.prompts.save': '保存提示词',
        'wb.settings.prompts.saved': '提示词已保存。',
        'wb.settings.prompts.reset': '恢复默认',
        'wb.settings.prompts.resetAll': '全部恢复默认',
        'wb.settings.prompts.resetArm': '确认恢复？',
        'wb.settings.prompts.resetConfirm': '恢复默认提示词？当前自定义内容将被清除。',
        'wb.settings.prompts.loadFailed': '提示词读取失败，可在下方继续编辑。',
        'wb.settings.prompts.empty': '（空）',

        /* ---- note reader: code peek -------------------------------------- */
        'wb.peek.loading': '正在定位…',
        'wb.peek.current': '当前工作区',
        'wb.peek.moved': '行号已更新',
        'wb.peek.history': '历史版本 · {sha}',
        'wb.peek.missing': '未找到',
        'wb.peek.open': '在侧栏打开',
        'wb.peek.close': '关闭',
        'wb.peek.gone': '当前工作区已没有这段代码',
        'wb.peek.noCode': '这段代码无法读取。',
        'wb.peek.missingHint': '当前工作区与 Git 历史里都找不到这段代码；笔记仍保留原始引用。',
        'wb.peek.failed': '定位失败：{error}',
        'wb.peek.citation': '笔记引用',

        /* ---- settings: retrieval ----------------------------------------- */
        'wb.settings.retrieval.title': '检索设置',
        'wb.settings.retrieval.desc': '决定一次检索召回多少条、以及哪些关系参与融合排序。',
        'wb.settings.retrieval.topK': '检索条数（topK）',
        'wb.settings.retrieval.topKUnit': '条',
        'wb.settings.retrieval.rrfK': 'RRF 常数（rrfK）',
        'wb.settings.retrieval.rrfKUnit': '',
        'wb.settings.retrieval.families': '参与检索的关系族',
        'wb.settings.retrieval.includeNotes': '上下文包含笔记',
        'wb.settings.retrieval.includeNotesHint': '把知识库笔记作为检索来源',
        'wb.settings.retrieval.includeGraph': '上下文包含图谱',
        'wb.settings.retrieval.includeGraphHint': '把代码图谱作为检索来源',
        'wb.settings.retrieval.save': '保存检索设置',
        'wb.settings.retrieval.saved': '检索设置已保存。',
        'wb.settings.retrieval.loadFailed': '检索设置读取失败，已按默认值打开。',

        /* ---- settings: local embedding model ----------------------------- */
        'wb.settings.models.title': '本地向量模型',
        'wb.settings.models.desc': '检索与笔记图谱的语义相似度都走本机 Ollama，不会把代码发到公网。',
        'wb.settings.models.checking': '检测中',
        'wb.settings.models.online': 'Ollama 已连接',
        'wb.settings.models.offline': '未检测到 Ollama',
        'wb.settings.models.recheck': '重新检测',
        'wb.settings.models.baseUrl': '服务地址',
        'wb.settings.models.loopbackOnly': '仅 127.0.0.1',
        'wb.settings.models.model': '嵌入模型',
        'wb.settings.models.found': '本机已安装 {n} 个模型',
        'wb.settings.models.foundNone': '本机未列出可用模型',
        'wb.settings.models.saved': '已切换到 {model}，索引需要重建才会生效。',
        'wb.settings.models.testing': '测试中',
        'wb.settings.models.test': '测试嵌入',
        'wb.settings.models.testOk': '嵌入正常：{model} · {dims} 维',
        'wb.settings.models.testBad': '嵌入失败：{error}',
        'wb.settings.models.noOllama': '没有检测到本机 Ollama（127.0.0.1:11434）。启动 Ollama 后点「重新检测」；此时检索与图谱会退回纯词法。',
        'wb.settings.models.offlineHint': '连接失败：{error}',

        /* ---- settings: vector index -------------------------------------- */
        'wb.settings.index.title': '向量索引',
        'wb.settings.index.desc': '代码片段被切块并向量化后，用于语义召回。',
        'wb.settings.index.ready': '已建索引',
        'wb.settings.index.idle': '未建',
        'wb.settings.index.running': '构建中',
        'wb.settings.index.error': '构建失败',
        'wb.settings.index.unknown': '未知',
        'wb.settings.index.summary': '{vectors} 向量 · {chunks} 片段 · 模型 {model}',
        'wb.settings.index.empty': '索引为空，{chunks} 个片段尚未向量化',
        'wb.settings.index.progress': '进度 {done}/{total}，失败 {failed}',
        'wb.settings.index.hint': '提示词与检索设置随工作区保存。',
        'wb.settings.index.rebuild': '重建索引',
        'wb.settings.index.rebuilding': '构建中…',
        'wb.settings.index.rebuildNoModel': '先连接 Ollama 才能重建索引',
      },

      en: {
        /* ---- navigation ------------------------------------------------- */
        'wb.nav.title': 'CodeSlice workbench',
        'wb.nav.notes': 'Knowledge base',
        'wb.nav.projects': 'Code graphs',
        'wb.nav.noteGraph': 'Knowledge graph',
        'wb.nav.settings': 'Settings',

        /* ---- notes library ---------------------------------------------- */
        'wb.notes.empty': 'This workspace has no notes yet.',
        'wb.notes.emptyHint': 'Notes generated in conversations are listed here by folder.',
        'wb.notes.reader.empty': 'Select a note to read.',
        'wb.notes.search': 'Search titles and content',
        'wb.notes.root': 'All notes',
        'wb.notes.loading': 'Loading notes…',
        'wb.notes.error': 'Could not load notes',
        'wb.notes.back': 'Back to note list',
        'wb.notes.import': 'Import',
        'wb.notes.importPick': 'Choose .md files',
        'wb.notes.importPath': 'or paste a file path (one per line)',
        'wb.notes.importRun': 'Import',
        'wb.notes.importEmpty': 'No Markdown content was read.',
        'wb.notes.imported': 'Imported {count} note(s)',
        'wb.notes.select': 'Select this note',
        'wb.notes.selected': '{count} selected',
        'wb.notes.cancelSelect': 'Clear selection',
        'wb.notes.export': 'Export',
        'wb.notes.graph': 'Knowledge graph',
        'wb.notes.folderToggle': 'Expand or collapse the folder',
        'wb.notes.exportSelected': 'Export selected',
        'wb.notes.exportAll': 'Export all',
        'wb.notes.exportedMany': 'Exported {count} note(s) to {path}',

        /* ---- project graph register ------------------------------------- */
        'wb.projects.title': 'Project graphs',
        'wb.projects.loading': 'Loading project register…',
        'wb.projects.error': 'Could not load the project register',
        'wb.projects.empty.title': 'No registered graph yet',
        'wb.projects.empty.body': 'Build the current project graph to register it here, where you can rename, inspect stats and remove it.',
        'wb.projects.rebuild': 'Build current project graph',
        'wb.projects.rebuilding': 'Building…',
        'wb.projects.rebuilt': 'Rebuild triggered; it registers automatically when finished.',
        'wb.projects.open': 'Open graph',
        'wb.projects.rename': 'Rename',
        'wb.projects.renamePlaceholder': 'New name',
        'wb.projects.delete': 'Delete',
        'wb.projects.deleteArm': 'Click again to confirm',
        'wb.projects.deleteConfirm': 'Delete this project graph? The registration is removed; code and notes stay.',
        'wb.projects.unnamed': 'Untitled',
        'wb.projects.stats': '{files} files · {lines} lines · {nodes} nodes · {edges} edges · {communities} communities',
        'wb.projects.builtAt': 'Built {time}',
        'wb.projects.failed': 'Operation failed',

        /* ---- project graph canvas --------------------------------------- */
        'wb.canvas.back': 'Back to code graphs',
        'wb.canvas.empty.title': 'No graph opened',
        'wb.canvas.empty.body': 'Choose “Open graph” in the graph list and the canvas fills this area.',

        /* ---- note graph -------------------------------------------------- */
        'wb.ng.title': 'Notes ↔ code anchors',
        'wb.ng.loading': 'Loading note graph…',
        'wb.ng.error': 'Could not load the note graph',
        'wb.ng.empty.title': 'No relations to show yet',
        'wb.ng.empty.body': 'Once notes cite code, their links to anchors appear here.',
        'wb.ng.summary': '{count} nodes · {edges} links',
        'wb.ng.openNote': 'Open note',
        'wb.ng.openCode': 'Open code',
        'wb.ng.neighbours': 'Related nodes',
        'wb.ng.select': 'Select a node to see its relations.',
        'wb.ng.relation.same_folder': 'Same folder',
        'wb.ng.relation.shared_reference': 'Shared reference',
        'wb.ng.relation.anchor': 'Code anchor',
        'wb.ng.kind.note': 'Note',
        'wb.ng.kind.code': 'Code',

        /* ---- settings: prompts ------------------------------------------ */
        'wb.settings.prompts.title': 'Prompts',
        'wb.settings.prompts.system.label': 'System prompt (code-reading rules)',
        'wb.settings.prompts.qa.label': 'Q&A prompt',
        'wb.settings.prompts.note.label': 'Note-generation prompt',
        'wb.settings.prompts.custom': 'Custom',
        'wb.settings.prompts.default': 'Default',
        'wb.settings.prompts.viewDefault': 'View default prompt',
        'wb.settings.prompts.hideDefault': 'Hide default prompt',
        'wb.settings.prompts.save': 'Save prompts',
        'wb.settings.prompts.saved': 'Prompts saved.',
        'wb.settings.prompts.reset': 'Reset to default',
        'wb.settings.prompts.resetAll': 'Reset all to default',
        'wb.settings.prompts.resetArm': 'Confirm reset?',
        'wb.settings.prompts.resetConfirm': 'Reset to the default prompt? Your custom text will be removed.',
        'wb.settings.prompts.loadFailed': 'Could not read prompts; you can still edit below.',
        'wb.settings.prompts.empty': '(empty)',

        /* ---- note reader: code peek -------------------------------------- */
        'wb.peek.loading': 'Locating…',
        'wb.peek.current': 'Current worktree',
        'wb.peek.moved': 'Lines updated',
        'wb.peek.history': 'History · {sha}',
        'wb.peek.missing': 'Not found',
        'wb.peek.open': 'Open in sidebar',
        'wb.peek.close': 'Close',
        'wb.peek.gone': 'this code is gone from the worktree',
        'wb.peek.noCode': 'This range could not be read.',
        'wb.peek.missingHint': 'Neither the worktree nor git history has this code; the note keeps its original citation.',
        'wb.peek.failed': 'Could not locate the citation: {error}',
        'wb.peek.citation': 'Note citation',

        /* ---- settings: retrieval ----------------------------------------- */
        'wb.settings.retrieval.title': 'Retrieval',
        'wb.settings.retrieval.desc': 'How many hits one search returns, and which relations take part in the fusion ranking.',
        'wb.settings.retrieval.topK': 'Top K (topK)',
        'wb.settings.retrieval.topKUnit': 'hits',
        'wb.settings.retrieval.rrfK': 'RRF constant (rrfK)',
        'wb.settings.retrieval.rrfKUnit': '',
        'wb.settings.retrieval.families': 'Relation families in retrieval',
        'wb.settings.retrieval.includeNotes': 'Include notes in context',
        'wb.settings.retrieval.includeNotesHint': 'Use knowledge-base notes as a retrieval source',
        'wb.settings.retrieval.includeGraph': 'Include graph in context',
        'wb.settings.retrieval.includeGraphHint': 'Use the code graph as a retrieval source',
        'wb.settings.retrieval.save': 'Save retrieval settings',
        'wb.settings.retrieval.saved': 'Retrieval settings saved.',
        'wb.settings.retrieval.loadFailed': 'Could not read retrieval settings; opened with defaults.',

        /* ---- settings: local embedding model ----------------------------- */
        'wb.settings.models.title': 'Local embedding model',
        'wb.settings.models.desc': 'Retrieval and note-graph similarity both run on the local Ollama; no code leaves this machine.',
        'wb.settings.models.checking': 'Checking',
        'wb.settings.models.online': 'Ollama connected',
        'wb.settings.models.offline': 'Ollama not detected',
        'wb.settings.models.recheck': 'Check again',
        'wb.settings.models.baseUrl': 'Service address',
        'wb.settings.models.loopbackOnly': 'loopback only',
        'wb.settings.models.model': 'Embedding model',
        'wb.settings.models.found': '{n} models installed locally',
        'wb.settings.models.foundNone': 'No models listed by the local service',
        'wb.settings.models.saved': 'Switched to {model}; rebuild the index for it to take effect.',
        'wb.settings.models.testing': 'Testing',
        'wb.settings.models.test': 'Test embedding',
        'wb.settings.models.testOk': 'Embedding works: {model} · {dims} dims',
        'wb.settings.models.testBad': 'Embedding failed: {error}',
        'wb.settings.models.noOllama': 'No local Ollama on 127.0.0.1:11434. Start it and press "Check again"; until then retrieval and the notes graph fall back to lexical matching.',
        'wb.settings.models.offlineHint': 'Connection failed: {error}',

        /* ---- settings: vector index -------------------------------------- */
        'wb.settings.index.title': 'Vector index',
        'wb.settings.index.desc': 'Code chunks are embedded so semantic recall has vectors to search.',
        'wb.settings.index.ready': 'Indexed',
        'wb.settings.index.idle': 'Not indexed',
        'wb.settings.index.running': 'Building',
        'wb.settings.index.error': 'Build failed',
        'wb.settings.index.unknown': 'Unknown',
        'wb.settings.index.summary': '{vectors} vectors · {chunks} chunks · model {model}',
        'wb.settings.index.empty': 'Index is empty: {chunks} chunks still need a vector',
        'wb.settings.index.progress': '{done}/{total} done, {failed} failed',
        'wb.settings.index.hint': 'Prompts and retrieval settings are saved per workspace.',
        'wb.settings.index.rebuild': 'Rebuild index',
        'wb.settings.index.rebuilding': 'Building…',
        'wb.settings.index.rebuildNoModel': 'Connect Ollama first',
      },
    };

    /* ================================================================ *
     * workbench/style.js
     * ================================================================ */
    /**
     * Styles for the CodeSlice workbench (Agent D surface).
     *
     * Only host semantic tokens are used (`--dsw-alias-*`) plus `color-mix`; no
     * hard-coded colors, and no indigo/violet unless they arrive as data colors.
     * E concatenates this after the shared stylesheet, so class names are `wb-*`
     * and never collide with the legacy `cs-*` surface.
     */

    const WORKBENCH_CSS = `
    .wb-root {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      color: var(--dsw-alias-label-primary);
      background: var(--dsw-alias-bg-base);
      font: inherit;
    }

    /* ---- navigation ------------------------------------------------------ */

    .wb-nav {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
      overflow-x: auto;
      scrollbar-width: thin;
      flex: 0 0 auto;
    }

    .wb-nav-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--dsw-alias-label-secondary);
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }

    .wb-nav-item:hover {
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
    }

    .wb-nav-item.wb-on {
      color: var(--dsw-alias-brand-primary);
      border-color: var(--dsw-alias-border-l2);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
    }

    .wb-body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .wb-page {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .wb-page[hidden] { display: none; }

    .wb-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }

    .wb-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-empty svg { opacity: .5; }

    .wb-empty p { margin: 0; max-width: 42ch; }

    .wb-empty b { color: var(--dsw-alias-label-primary); font-weight: 600; }

    .wb-banner {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      font-size: 11.5px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
    }

    .wb-banner.wb-bad { color: var(--dsw-alias-state-error-primary); }
    .wb-banner.wb-ok { color: var(--dsw-alias-state-success-primary); }

    /* ---- notes library --------------------------------------------------- */

    .wb-notes-wrap {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }

    .wb-notes-bar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }

    .wb-notes-import {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      padding: 6px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }

    .wb-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .wb-btn:hover { background: var(--dsw-alias-bg-layer-2); }
    .wb-btn:disabled { opacity: 0.55; cursor: default; }
    .wb-btn.wb-on {
      background: var(--dsw-alias-bg-layer-2);
      border-color: var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
    }

    .wb-iconbtn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: var(--dsw-alias-label-secondary);
      cursor: pointer;
    }

    .wb-iconbtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

    /* One row: batch-export checkbox beside the clickable note row. */
    .wb-note-item { display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 30px; }
    .wb-note-item .wb-note-row { flex: 1 1 auto; min-width: 0; }
    .wb-note-item.wb-on { background: var(--dsw-alias-bg-layer-2); }
    .wb-note-check {
      flex: 0 0 auto;
      margin: 0 0 0 6px;
      width: 12px;
      height: 12px;
      accent-color: var(--dsw-alias-brand-primary, #2f6fed);
      cursor: pointer;
    }

    /* A folder row in the tree: chevron to collapse, name to scope the list. */
    .wb-folder-node { display: flex; align-items: center; gap: 2px; min-width: 0; }
    .wb-folder-node .wb-folder-row { flex: 1 1 auto; min-width: 0; }
    .wb-chevron {
      flex: 0 0 auto;
      width: 16px;
      height: 30px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--dsw-alias-label-secondary);
      font-size: 10px;
      line-height: 30px;
      cursor: pointer;
    }

    .wb-chevron:hover { color: var(--dsw-alias-label-primary); }

    .wb-notes {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }

    .wb-notes-side {
      flex: 0 0 230px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid var(--dsw-alias-border-l1);
    }

    .wb-notes-side-head {
      flex: 0 0 auto;
      padding: 6px 8px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }

    .wb-folder-row {
      display: flex;
      align-items: center;
      gap: 5px;
      width: 100%;
      min-height: 30px;
      padding: 0 8px;
      border: none;
      background: transparent;
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }

    .wb-folder-row:hover { background: var(--dsw-alias-bg-layer-1); }
    .wb-folder-row.wb-on { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }

    /* Unfiled notes sit after the folder tree, matching the desktop library. */
    .wb-notes-divider {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 6px 4px 2px;
      padding: 6px 4px 3px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      font-size: 10.5px;
      font-weight: 600;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-note-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 7px;
      width: 100%;
      min-height: 30px;
      padding: 0 8px;
      border: none;
      background: transparent;
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }

    .wb-note-row:hover { background: var(--dsw-alias-bg-layer-1); }
    .wb-note-row.wb-on { background: var(--dsw-alias-bg-layer-2); }
    .wb-note-icon { flex: 0 0 auto; display: flex; color: var(--dsw-alias-label-secondary); }

    .wb-note-title {
      font-size: 12px;
      font-weight: 400;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-note-time {
      font-size: 10px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-reader {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .wb-reader-head {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }

    .wb-reader-title {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }

    .wb-reader-title h2 {
      margin: 0;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-reader-chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }

    .wb-cite {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 7px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 5px;
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-secondary);
      font-size: 10.5px;
      cursor: pointer;
    }

    .wb-cite:hover {
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
    }

    .wb-tag {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 5px;
      font-size: 10.5px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-tag.wb-accent { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
    .wb-tag.wb-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
    .wb-tag.wb-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
    .wb-tag.wb-bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }

    .wb-reader-doc {
      padding: 10px 12px;
      font-size: 12.5px;
      line-height: 1.6;
    }

    @media (max-width: 560px) {
      .wb-notes { flex-direction: column; }
      .wb-notes-side { flex: 0 0 42%; width: 100%; border-right: none; border-bottom: 1px solid var(--dsw-alias-border-l1); }
    }

    /* ---- project register ------------------------------------------------ */

    .wb-proj-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
    }

    .wb-proj-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 10px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 8px;
      background: var(--dsw-alias-bg-layer-1);
    }

    .wb-proj-top {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .wb-proj-name {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12.5px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-proj-root {
      font-size: 10.5px;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-proj-stats {
      font-size: 10.5px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-proj-acts {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .wb-proj-rename {
      flex: 1 1 auto;
      min-width: 120px;
    }

    /* ---- note graph ------------------------------------------------------- */

    .wb-ng {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }

    .wb-ng-side {
      flex: 0 0 220px;
      border-right: 1px solid var(--dsw-alias-border-l1);
      overflow: auto;
      min-height: 0;
    }

    .wb-ng-node {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 8px;
      border: none;
      border-top: 1px solid var(--dsw-alias-border-l1);
      background: transparent;
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }

    .wb-ng-node:hover { background: var(--dsw-alias-bg-layer-1); }
    .wb-ng-node.wb-on { background: var(--dsw-alias-bg-layer-2); }

    .wb-ng-node-label {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-ng-main {
      flex: 1 1 auto;
      min-width: 0;
      overflow: auto;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .wb-ng-neighbour {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: var(--dsw-alias-bg-layer-1);
    }

    .wb-ng-neighbour-label {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .wb-ng-relation {
      flex: 0 0 auto;
      font-size: 10px;
      color: var(--dsw-alias-label-secondary);
    }

    /* ---- note reader: code peek ------------------------------------------- */

    .wb-peek {
      margin: 8px 10px 0;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 8px;
      background: var(--dsw-alias-bg-layer-1);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
    }

    .wb-peek-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      min-width: 0;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      font-size: 11.5px;
    }

    .wb-peek-path {
      min-width: 0;
      max-width: 46%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 11px;
      color: var(--dsw-alias-label-primary);
    }

    .wb-peek-tag {
      flex: 0 0 auto;
      padding: 0 6px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 999px;
      font-size: 10.5px;
      line-height: 17px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-peek-tag.wb-warn {
      border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent);
      color: var(--dsw-alias-state-warn-primary);
    }

    .wb-peek-range {
      flex: 0 0 auto;
      font-size: 10.5px;
      font-variant-numeric: tabular-nums;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-peek-banner {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      padding: 5px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent);
      font-size: 11px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-peek-sha {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      color: var(--dsw-alias-label-primary);
    }

    .wb-peek-gone { color: var(--dsw-alias-state-warn-primary); }

    .wb-peek-code {
      max-height: 240px;
      overflow: auto;
      padding: 4px 0;
      background: var(--dsw-alias-bg-base);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 11.5px;
      line-height: 1.55;
    }

    .wb-peek-line {
      display: flex;
      gap: 10px;
      padding: 0 10px;
      white-space: pre;
    }

    .wb-peek-line.wb-on {
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
      border-left: 2px solid var(--dsw-alias-brand-primary);
      padding-left: 8px;
    }

    .wb-peek-ln {
      flex: 0 0 auto;
      width: 34px;
      text-align: right;
      color: var(--dsw-alias-label-secondary);
      font-variant-numeric: tabular-nums;
      user-select: none;
    }

    .wb-peek-src { color: var(--dsw-alias-label-primary); }

    .wb-peek-empty {
      padding: 10px;
      font-size: 11.5px;
      color: var(--dsw-alias-label-secondary);
    }

    /* ---- settings --------------------------------------------------------- */

    .wb-settings {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .wb-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 10px;
      background: var(--dsw-alias-bg-layer-1);
    }

    .wb-section-head {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
    }

    .wb-section-text {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .wb-section-head b { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }

    .wb-section-desc {
      font-size: 11.5px;
      line-height: 1.55;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .wb-field-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11.5px;
      font-weight: 500;
      color: var(--dsw-alias-label-primary);
    }

    .wb-num { position: relative; display: block; }

    .wb-num .cs-input {
      width: 100%;
      height: 32px;
      padding: 0 34px 0 10px;
      font-size: 12.5px;
      font-variant-numeric: tabular-nums;
    }

    .wb-unit {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 11px;
      color: var(--dsw-alias-label-secondary);
      pointer-events: none;
    }

    .wb-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    @media (max-width: 560px) {
      .wb-grid { grid-template-columns: 1fr; }
    }

    .wb-textarea {
      width: 100%;
      resize: vertical;
      min-height: 96px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 8px;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: 12px;
      padding: 6px 8px;
    }

    .wb-textarea:focus {
      outline: 1px solid var(--dsw-alias-brand-primary);
      outline-offset: -1px;
    }

    /* ---- checkbox chips -------------------------------------------------- */

    .wb-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .wb-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 999px;
      background: transparent;
      color: var(--dsw-alias-label-secondary);
      font: inherit;
      font-size: 11.5px;
      line-height: 1.4;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }

    .wb-pill:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }

    .wb-pill[data-on='true'] {
      border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
      color: var(--dsw-alias-brand-primary);
    }

    .wb-pill-mark { display: inline-flex; align-items: center; justify-content: center; }
    .wb-pill[data-on='true'] .wb-pill-mark { color: var(--dsw-alias-brand-primary); }

    /* ---- switch rows ----------------------------------------------------- */

    .wb-meta { display: flex; flex-direction: column; }

    .wb-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--dsw-alias-border-l1);
      min-width: 0;
    }

    .wb-meta:first-child .wb-meta-row:first-child { border-top: none; }

    .wb-meta-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .wb-meta-label { font-size: 12px; color: var(--dsw-alias-label-primary); }
    .wb-meta-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }

    .wb-meta-value {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-switch {
      flex: 0 0 auto;
      position: relative;
      width: 32px;
      height: 18px;
      padding: 0;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 999px;
      background: var(--dsw-alias-bg-base);
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease;
    }

    .wb-switch[data-on='true'] {
      border-color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 85%, transparent);
    }

    .wb-switch-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: var(--dsw-alias-label-secondary);
      transition: transform 0.14s ease, background 0.14s ease;
    }

    .wb-switch[data-on='true'] .wb-switch-knob {
      transform: translateX(14px);
      background: #fff;
    }

    .wb-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

    /* ---- buttons / selects ----------------------------------------------- */

    .wb-btn {
      height: 28px;
      padding: 0 12px;
      font-size: 12px;
      border-radius: 7px;
    }

    .wb-settings .cs-btn.cs-primary {
      border-color: transparent;
      background: var(--dsw-alias-brand-primary);
      color: #fff;
    }

    .wb-settings .cs-btn.cs-primary:hover {
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, #fff);
      color: #fff;
    }

    .wb-btn-sm { height: 24px; padding: 0 6px; }

    .wb-select {
      flex: 0 0 auto;
      width: 170px;
      height: 30px;
      padding: 0 8px;
      font-size: 12px;
      border-radius: 7px;
    }

    /* ---- index meter ------------------------------------------------------ */

    .wb-meter {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 8px;
      background: var(--dsw-alias-bg-base);
    }

    .wb-meter-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      font-size: 11.5px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-meter-pct {
      font-variant-numeric: tabular-nums;
      color: var(--dsw-alias-label-primary);
    }

    .wb-bar {
      height: 4px;
      border-radius: 999px;
      background: var(--dsw-alias-bg-layer-2);
      overflow: hidden;
    }

    .wb-bar-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: var(--dsw-alias-brand-primary);
      transition: width 0.2s ease;
    }

    .wb-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .wb-notice {
      font-size: 11.5px;
      line-height: 1.55;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-notice.wb-ok { color: var(--dsw-alias-state-success-primary); }
    .wb-notice.wb-bad { color: var(--dsw-alias-state-error-primary); }

    .wb-default-view {
      margin: 0;
      padding: 8px;
      max-height: 160px;
      overflow: auto;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 6px;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-secondary);
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .wb-prompt-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .wb-prompt-head > span { flex: 1 1 auto; }

    /* The project graph page reuses GraphView; the wrapper only supplies the
       full height canvas and a compact back row above it. */
    .wb-project-graph {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .wb-graph-bar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 7px 10px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }

    .wb-graph-root {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11.5px;
      color: var(--dsw-alias-label-secondary);
    }

    .wb-project-graph > .cs-graph {
      flex: 1 1 auto;
      min-height: 0;
    }

    /* The notes graph page reuses the same GraphView canvas; only the wrapper
       height and the absence of a toolbar row are new. */
    .wb-note-graph {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .wb-note-graph > .gr-view {
      flex: 1 1 auto;
      min-height: 0;
    }

    /* The knowledge graph opened inside the library's reader area. */
    .wb-reader-graph {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    `;

    /* ================================================================ *
     * workbench/settings.js
     * ================================================================ */
    /**
     * Workbench settings page (Agent D surface).
     *
     * Three blocks:
     *   1. Two prompts — note-generation and knowledge Q&A — edited in textareas,
     *      saved through `prompts op=save`, reset through `prompts op=reset`, with a
     *      custom/default badge and a read-only view of the shipped default.
     *   2. Retrieval settings — the legacy field names are kept on purpose:
     *      `topK`, `rrfK`, `families`, `includeNotes`, `includeGraph`, saved
     *      through the existing `rag op=write` channel.
     *   3. Vector index state — read from `status`, falling back to the `index`
     *      projection returned by `rag op=read`; a missing index renders "unknown"
     *      and never throws.
     *
     * Every Host method is optional in this build: a missing method or a missing
     * field degrades to an editable form / an unknown badge, not a crash.
     */







    /** Relation families, in the Host's own order (see `lib/model.js`). */
    const WB_FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy', 'meaning'];

    /** Fallback retrieval config when the `rag` method is absent or its read fails. */
    const WB_RAG_FALLBACK = Object.freeze({
      topK: 8,
      rrfK: 60,
      families: WB_FAMILIES.slice(),
      includeNotes: true,
      includeGraph: true,
    });

    /** A prompt pair counts as custom when a non-empty custom text is stored. */
    function wbPromptIsCustom(pair) {
      const custom = pair && pair.custom;
      return typeof custom === 'string' && custom.trim() !== '';
    }

    /** The text a freshly opened editor shows: custom override, else the default. */
    function wbPromptValue(pair) {
      if (pair === undefined || pair === null) return '';
      if (typeof pair.custom === 'string' && pair.custom.trim() !== '') return pair.custom;
      return typeof pair.effective === 'string' ? pair.effective : (typeof pair.default === 'string' ? pair.default : '');
    }

    /**
     * One prompt editor block: label, custom/default badge, textarea, default
     * viewer and reset action.
     * @param props - `{which, label, pair, draft, busy, resetArmed, showDefault,
     *   onDraft, onToggleDefault, onReset, t}`.
     * @returns the block.
     */
    function WbPromptBlock(props) {
      const {
        which, label, pair, draft, busy, resetArmed, showDefault,
        onDraft, onToggleDefault, onReset, t,
      } = props;
      const custom = wbPromptIsCustom(pair);
      const defaultValue = typeof pair?.default === 'string' ? pair.default : '';

      return h('div', { className: 'wb-field', 'data-cs': 'prompt-block', 'data-which': which },
        h('div', { className: 'wb-prompt-head' },
          h('span', null, label),
          h('span', { className: `wb-tag ${custom ? 'wb-accent' : ''}` },
            custom ? t('wb.settings.prompts.custom') : t('wb.settings.prompts.default')),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-ghost',
            onClick: onToggleDefault,
          }, showDefault ? t('wb.settings.prompts.hideDefault') : t('wb.settings.prompts.viewDefault')),
          h('button', {
            type: 'button',
            className: `cs-btn cs-small cs-ghost${resetArmed ? ' cs-danger' : ''}`,
            disabled: busy,
            title: t('wb.settings.prompts.resetConfirm'),
            onClick: onReset,
          }, resetArmed ? t('wb.settings.prompts.resetArm') : t('wb.settings.prompts.reset'))),
        h('textarea', {
          className: 'wb-textarea',
          rows: 6,
          value: draft,
          'aria-label': label,
          disabled: busy,
          placeholder: defaultValue === '' ? t('wb.settings.prompts.empty') : defaultValue,
          onChange: (event) => onDraft(event.target.value),
        }),
        showDefault
          ? h('pre', { className: 'wb-default-view' }, defaultValue === '' ? t('wb.settings.prompts.empty') : defaultValue)
          : null);
    }

    /**
     * The settings page.
     * @param props - `{ctx, scope, parked, t, locale}`.
     * @returns the settings page.
     */
    function SettingsPage(props) {
      const { ctx, scope, parked, t, locale } = props;
      const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      /* ---- prompts state ---------------------------------------------- */
      const [prompts, setPrompts] = useState(undefined);
      const [draft, setDraft] = useState({ system: '', qa: '', note: '' });
      const [promptsBusy, setPromptsBusy] = useState(false);
      const [promptsNotice, setPromptsNotice] = useState(undefined);
      const [resetArmed, setResetArmed] = useState(undefined);
      const [showDefault, setShowDefault] = useState({ system: false, qa: false, note: false });

      /* ---- retrieval state -------------------------------------------- */
      const [ragConfig, setRagConfig] = useState(undefined);
      const [draftRag, setDraftRag] = useState({ ...WB_RAG_FALLBACK, families: WB_FAMILIES.slice() });
      const [ragBusy, setRagBusy] = useState(false);
      const [ragNotice, setRagNotice] = useState(undefined);

      /* ---- vector index state ------------------------------------------ */
      const [indexStatus, setIndexStatus] = useState(undefined);

      /* ---- local model state ------------------------------------------- */
      // `models op=status` is the only call that reaches Ollama; keeping it here
      // means the page can say "not detected" instead of leaving the reader to
      // guess why the index is empty.
      const [modelInfo, setModelInfo] = useState(undefined);
      const [modelBusy, setModelBusy] = useState(false);
      const [modelNotice, setModelNotice] = useState(undefined);
      const [testResult, setTestResult] = useState(undefined);
      const [indexBusy, setIndexBusy] = useState(false);

      const alive = useRef(true);
      const requests = useRef(undefined);
      const pollTimer = useRef(undefined);

      useEffect(() => {
        alive.current = true;
        const scopeReq = makeRequestScope();
        requests.current = scopeReq;
        return () => {
          alive.current = false;
          scopeReq.dispose();
          requests.current = undefined;
        };
      }, []);

      /* ---- load --------------------------------------------------------- */

      useEffect(() => {
        if (parked) return undefined;

        // Each section needs its own request scope. `run` aborts the previous call
        // by design, so sharing one scope made the prompts read cancel itself as
        // soon as the rag/status reads started — the visible symptom was three
        // empty prompt textareas even though the API returned full defaults.
        const promptReq = makeRequestScope();
        const ragReq = makeRequestScope();
        const statusReq = makeRequestScope();
        const ragStatusReq = makeRequestScope();
        const modelsReq = makeRequestScope();

        // Local Ollama probe: status is a value, never a throw, so a machine without
        // Ollama still renders the whole card.
        modelsReq.run((signal) => call('models', { op: 'status' }, signal))
          .then((value) => {
            if (alive.current && value !== undefined) setModelInfo(value);
          })
          .catch(() => {
            if (alive.current) setModelInfo({ error: true });
          });

        // Prompts: read the three pairs; a missing method leaves the draft editable.
        promptReq.run((signal) => call('prompts', { op: 'read' }, signal))
          .then((value) => {
            if (!alive.current || value === undefined) return;
            setPrompts(value);
            setDraft({
              system: wbPromptValue(value.system),
              qa: wbPromptValue(value.qa),
              note: wbPromptValue(value.note),
            });
          })
          .catch(() => {
            if (alive.current) setPromptsNotice({ kind: 'bad', text: t('wb.settings.prompts.loadFailed') });
          });

        // Retrieval config + index projection from the existing `rag` channel.
        ragReq.run((signal) => call('rag', { op: 'read' }, signal))
          .then((value) => {
            if (!alive.current || value === undefined) return;
            if (value.config !== undefined) setRagConfig(value.config);
            if (value.index !== undefined) setIndexStatus(value.index);
          })
          .catch(() => {
            if (alive.current) setRagNotice({ kind: 'bad', text: t('wb.settings.retrieval.loadFailed') });
          });

        // Status: the contract adds `projects` / `prompts` summaries here, and the
        // vector index may ride along as `index`; read it best-effort and only
        // fill a gap the `rag` channel left empty.
        statusReq.run((signal) => call('status', {}, signal))
          .then((value) => {
            if (!alive.current || value === undefined) return;
            const fromStatus = value.index ?? (value.rag && value.rag.index);
            if (fromStatus !== undefined) setIndexStatus(fromStatus);
          })
          .catch(() => { /* unknown index state is acceptable */ });

        // Legacy rag status projection, matching the old workbench panel.
        ragStatusReq.run((signal) => call('rag', { op: 'status' }, signal))
          .then((value) => {
            if (!alive.current || value === undefined) return;
            if (value.index !== undefined) setIndexStatus(value.index);
          })
          .catch(() => { /* unknown index state is acceptable */ });

        return () => {
          promptReq.dispose();
          ragReq.dispose();
          statusReq.dispose();
          ragStatusReq.dispose();
          modelsReq.dispose();
        };
      }, [parked, call, t]);

      /* Sync the retrieval draft whenever a fresh config lands. */
      useEffect(() => {
        if (ragConfig === undefined) return;
        setDraftRag({
          topK: Number.isFinite(Number(ragConfig.topK)) ? Number(ragConfig.topK) : WB_RAG_FALLBACK.topK,
          rrfK: Number.isFinite(Number(ragConfig.rrfK)) ? Number(ragConfig.rrfK) : WB_RAG_FALLBACK.rrfK,
          families: Array.isArray(ragConfig.families) ? [...ragConfig.families] : WB_FAMILIES.slice(),
          includeNotes: ragConfig.includeNotes !== false,
          includeGraph: ragConfig.includeGraph !== false,
        });
      }, [ragConfig]);

      /* ---- prompt mutations -------------------------------------------- */

      const savePrompts = useCallback(async () => {
        setPromptsBusy(true);
        setPromptsNotice(undefined);
        try {
          const value = await requests.current.run((signal) => call('prompts', {
            op: 'save',
            system: draft.system.trim() === '' ? null : draft.system,
            qa: draft.qa.trim() === '' ? null : draft.qa,
            note: draft.note.trim() === '' ? null : draft.note,
          }, signal));
          if (!alive.current) return;
          if (value !== undefined) {
            setPrompts(value);
            setDraft({
              system: wbPromptValue(value.system),
              qa: wbPromptValue(value.qa),
              note: wbPromptValue(value.note),
            });
          }
          setPromptsNotice({ kind: 'ok', text: t('wb.settings.prompts.saved') });
        } catch (caught) {
          if (alive.current) setPromptsNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setPromptsBusy(false);
        }
      }, [call, draft, t]);

      const resetPrompts = useCallback(async (which) => {
        setPromptsBusy(true);
        setPromptsNotice(undefined);
        try {
          const value = await requests.current.run((signal) => call('prompts', { op: 'reset', which }, signal));
          if (!alive.current) return;
          if (value !== undefined) {
            setPrompts(value);
            setDraft({
              system: wbPromptValue(value.system),
              qa: wbPromptValue(value.qa),
              note: wbPromptValue(value.note),
            });
          }
          setPromptsNotice({ kind: 'ok', text: t('wb.settings.prompts.saved') });
        } catch (caught) {
          if (alive.current) setPromptsNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) {
            setPromptsBusy(false);
            setResetArmed(undefined);
          }
        }
      }, [call, t]);

      /* ---- retrieval mutations ----------------------------------------- */

      const patchRag = useCallback((key, value) => {
        setDraftRag((current) => ({ ...current, [key]: value }));
      }, []);

      const toggleFamily = useCallback((name) => {
        setDraftRag((current) => {
          const has = current.families.includes(name);
          return {
            ...current,
            families: has ? current.families.filter((row) => row !== name) : [...current.families, name],
          };
        });
      }, []);

      const saveRag = useCallback(async () => {
        setRagBusy(true);
        setRagNotice(undefined);
        try {
          const value = await requests.current.run((signal) => call('rag', {
            op: 'write',
            config: { ...draftRag },
          }, signal));
          if (!alive.current) return;
          if (value && value.config !== undefined) setRagConfig(value.config);
          setRagNotice({ kind: 'ok', text: t('wb.settings.retrieval.saved') });
        } catch (caught) {
          if (alive.current) setRagNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setRagBusy(false);
        }
      }, [call, draftRag, t]);

      /* ---- model + index actions ---------------------------------------- */

      const refreshModels = useCallback(async () => {
        setModelBusy(true);
        setModelNotice(undefined);
        try {
          const value = await requests.current.run((signal) => call('models', { op: 'status' }, signal));
          if (!alive.current) return;
          if (value !== undefined) setModelInfo(value);
        } catch (caught) {
          if (alive.current) setModelNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setModelBusy(false);
        }
      }, [call]);

      const pickModel = useCallback(async (model) => {
        if (model === '') return;
        setModelBusy(true);
        setModelNotice(undefined);
        setTestResult(undefined);
        try {
          const value = await requests.current.run((signal) => call('models', {
            op: 'write',
            settings: { embedding: { model } },
          }, signal));
          if (!alive.current) return;
          if (value?.settings !== undefined) {
            setModelInfo((current) => ({ ...(current ?? {}), ...value }));
          }
          setModelNotice({ kind: 'ok', text: t('wb.settings.models.saved', { model }) });
          const status = await requests.current.run((signal) => call('rag', { op: 'status' }, signal));
          if (alive.current && status?.index !== undefined) setIndexStatus(status.index);
        } catch (caught) {
          if (alive.current) setModelNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setModelBusy(false);
        }
      }, [call, t]);

      const testEmbedding = useCallback(async () => {
        setModelBusy(true);
        setModelNotice(undefined);
        setTestResult(undefined);
        try {
          const value = await requests.current.run((signal) => call('models', { op: 'test' }, signal));
          if (!alive.current) return;
          if (value?.result !== undefined) setTestResult(value.result);
        } catch (caught) {
          if (alive.current) setModelNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setModelBusy(false);
        }
      }, [call]);

      const rebuildIndex = useCallback(async () => {
        setIndexBusy(true);
        try {
          const value = await requests.current.run((signal) => call('rag', {
            op: 'index',
            force: true,
          }, signal));
          if (!alive.current) return;
          if (value?.index !== undefined) setIndexStatus(value.index);
        } catch (caught) {
          if (alive.current) setRagNotice({
            kind: 'bad',
            text: caught && caught.message ? caught.message : String(caught),
          });
        } finally {
          if (alive.current) setIndexBusy(false);
        }
      }, [call]);

      const refreshIndex = useCallback(async () => {
        try {
          const value = await requests.current.run((signal) => call('rag', { op: 'status' }, signal));
          if (alive.current && value?.index !== undefined) setIndexStatus(value.index);
        } catch { /* a probe interval may fail; the next tick retries */ }
      }, [call]);

      /* Poll while the Host is building: the index call returns immediately with
         state=running, and there is no push channel to learn it finished. */
      useEffect(() => {
        if (indexStatus?.state !== 'running') return undefined;
        const timer = setInterval(() => { void refreshIndex(); }, 1200);
        pollTimer.current = timer;
        return () => {
          clearInterval(timer);
          pollTimer.current = undefined;
        };
      }, [indexStatus?.state, refreshIndex]);

      /* ---- index projection --------------------------------------------- */

      const index = indexStatus ?? {};
      const indexState = typeof index.state === 'string' ? index.state : undefined;
      const indexTone = indexState === 'ready' ? 'wb-ok'
        : indexState === 'running' ? 'wb-warn'
          : indexState === 'error' ? 'wb-bad' : '';
      const indexLabel = indexState === undefined
        ? t('wb.settings.index.unknown')
        : t(`wb.settings.index.${indexState}`);
      const indexHasScale = Number(index.vectors) > 0 || Number(index.chunks) > 0
        || (typeof index.model === 'string' && index.model !== '');
      const indexTotal = Number(index.chunks ?? 0);
      const indexDone = Number(index.vectors ?? index.done ?? 0);
      const indexPercent = indexTotal > 0 ? Math.min(100, Math.round((indexDone / indexTotal) * 100)) : 0;

      const embedding = modelInfo?.settings?.embedding ?? {};
      const ollama = modelInfo?.ollama;
      const ollamaOnline = ollama?.available === true;
      const ollamaModels = Array.isArray(ollama?.models) ? ollama.models : [];
      const currentModel = typeof embedding.model === 'string' ? embedding.model : '';
      const modelOptions = [...new Set([currentModel, ...ollamaModels, 'bge-m3'].filter((row) => row !== ''))];
      const modelTone = modelInfo === undefined
        ? ''
        : ollamaOnline ? 'wb-ok' : 'wb-bad';
      const modelLabel = modelInfo === undefined
        ? t('wb.settings.models.checking')
        : ollamaOnline ? t('wb.settings.models.online') : t('wb.settings.models.offline');

      const numberField = (key, label, min, max, unit) => h('label', { className: 'wb-field', key },
        h('span', { className: 'wb-field-label' }, label),
        h('span', { className: 'wb-num' },
          h('input', {
            type: 'number',
            className: 'cs-input',
            min,
            max,
            value: draftRag[key],
            onChange: (event) => patchRag(key, Number(event.target.value)),
          }),
          h('span', { className: 'wb-unit' }, unit)));

      const familyPill = (name) => {
        const on = draftRag.families.includes(name);
        return h('button', {
          type: 'button',
          key: name,
          className: 'wb-pill',
          'data-on': on ? 'true' : 'false',
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => toggleFamily(name),
        }, h('span', { className: 'wb-pill-mark' }, on ? Glyph.check(10) : null),
        h('span', null, t(`family.${name}`)));
      };

      const switchRow = (label, key, hint) => h('div', { className: 'wb-meta-row' },
        h('div', { className: 'wb-meta-text' },
          h('span', { className: 'wb-meta-label' }, label),
          hint === undefined ? null : h('span', { className: 'wb-meta-hint' }, hint)),
        h('button', {
          type: 'button',
          className: 'wb-switch',
          'data-on': draftRag[key] ? 'true' : 'false',
          role: 'switch',
          'aria-checked': draftRag[key] ? 'true' : 'false',
          'aria-label': label,
          onClick: () => patchRag(key, !draftRag[key]),
        }, h('span', { className: 'wb-switch-knob' })));

      return h('div', { className: 'wb-settings' },

        /* ---- prompts -------------------------------------------------- */
        h('section', { className: 'wb-section', 'data-cs': 'prompt-settings' },
          h('div', { className: 'wb-section-head' },
            h('b', null, t('wb.settings.prompts.title'))),
          h(WbPromptBlock, {
            which: 'system',
            label: t('wb.settings.prompts.system.label'),
            pair: prompts?.system,
            draft: draft.system,
            busy: promptsBusy,
            resetArmed: resetArmed === 'system',
            showDefault: showDefault.system,
            onDraft: (value) => setDraft((current) => ({ ...current, system: value })),
            onToggleDefault: () => setShowDefault((current) => ({ ...current, system: !current.system })),
            onReset: () => {
              if (resetArmed === 'system') void resetPrompts('system');
              else setResetArmed('system');
            },
            t,
          }),
          h(WbPromptBlock, {
            which: 'qa',
            label: t('wb.settings.prompts.qa.label'),
            pair: prompts?.qa,
            draft: draft.qa,
            busy: promptsBusy,
            resetArmed: resetArmed === 'qa',
            showDefault: showDefault.qa,
            onDraft: (value) => setDraft((current) => ({ ...current, qa: value })),
            onToggleDefault: () => setShowDefault((current) => ({ ...current, qa: !current.qa })),
            onReset: () => {
              if (resetArmed === 'qa') void resetPrompts('qa');
              else setResetArmed('qa');
            },
            t,
          }),
          h(WbPromptBlock, {
            which: 'note',
            label: t('wb.settings.prompts.note.label'),
            pair: prompts?.note,
            draft: draft.note,
            busy: promptsBusy,
            resetArmed: resetArmed === 'note',
            showDefault: showDefault.note,
            onDraft: (value) => setDraft((current) => ({ ...current, note: value })),
            onToggleDefault: () => setShowDefault((current) => ({ ...current, note: !current.note })),
            onReset: () => {
              if (resetArmed === 'note') void resetPrompts('note');
              else setResetArmed('note');
            },
            t,
          }),
          promptsNotice === undefined
            ? null
            : h('div', { className: `wb-notice ${promptsNotice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
              h('span', null, promptsNotice.text)),
          h('div', { className: 'wb-actions' },
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small cs-ghost',
              disabled: promptsBusy,
              onClick: () => {
                if (resetArmed === 'all') void resetPrompts('all');
                else setResetArmed('all');
              },
            }, resetArmed === 'all' ? t('wb.settings.prompts.resetArm') : t('wb.settings.prompts.resetAll')),
            h('span', { className: 'cs-grow' }),
            h('button', {
              type: 'button',
              className: 'cs-btn cs-small cs-primary',
              disabled: promptsBusy,
              onClick: () => { void savePrompts(); },
            }, promptsBusy ? t('common.saving') : t('wb.settings.prompts.save')))),

        /* ---- retrieval ------------------------------------------------- */
        h('section', { className: 'wb-section', 'data-cs': 'retrieval-settings' },
          h('div', { className: 'wb-section-head' },
            h('div', { className: 'wb-section-text' },
              h('b', null, t('wb.settings.retrieval.title')),
              h('span', { className: 'wb-section-desc' }, t('wb.settings.retrieval.desc')))),
          h('div', { className: 'wb-grid' },
            numberField('topK', t('wb.settings.retrieval.topK'), 1, 24, t('wb.settings.retrieval.topKUnit')),
            numberField('rrfK', t('wb.settings.retrieval.rrfK'), 1, 100, t('wb.settings.retrieval.rrfKUnit'))),
          h('div', { className: 'wb-field' },
            h('span', { className: 'wb-field-label' }, t('wb.settings.retrieval.families')),
            h('div', { className: 'wb-pills' }, WB_FAMILIES.map(familyPill))),
          h('div', { className: 'wb-meta' },
            switchRow(t('wb.settings.retrieval.includeNotes'), 'includeNotes', t('wb.settings.retrieval.includeNotesHint')),
            switchRow(t('wb.settings.retrieval.includeGraph'), 'includeGraph', t('wb.settings.retrieval.includeGraphHint'))),
          ragNotice === undefined
            ? null
            : h('div', { className: `wb-notice ${ragNotice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
              h('span', null, ragNotice.text)),
          h('div', { className: 'wb-actions' },
            h('span', { className: 'cs-grow' }),
            h('button', {
              type: 'button',
              className: 'cs-btn cs-primary wb-btn',
              disabled: ragBusy,
              onClick: () => { void saveRag(); },
            }, ragBusy ? t('common.saving') : t('wb.settings.retrieval.save')))),

        /* ---- local embedding model ------------------------------------- */
        h('section', { className: 'wb-section', 'data-cs': 'model-settings' },
          h('div', { className: 'wb-section-head' },
            h('div', { className: 'wb-section-text' },
              h('b', null, t('wb.settings.models.title')),
              h('span', { className: 'wb-section-desc' }, t('wb.settings.models.desc'))),
            h('span', { className: `wb-tag ${modelTone}` }, modelLabel),
            h('button', {
              type: 'button',
              className: 'cs-btn cs-ghost wb-btn wb-btn-sm',
              disabled: modelBusy,
              title: t('wb.settings.models.recheck'),
              onClick: () => { void refreshModels(); },
            }, Glyph.refresh(12))),
          h('div', { className: 'wb-meta' },
            h('div', { className: 'wb-meta-row' },
              h('div', { className: 'wb-meta-text' },
                h('span', { className: 'wb-meta-label' }, t('wb.settings.models.baseUrl')),
                h('span', { className: 'wb-meta-hint' }, typeof embedding.base_url === 'string' && embedding.base_url !== ''
                  ? embedding.base_url
                  : 'http://127.0.0.1:11434/v1')),
              h('span', { className: 'wb-meta-value' }, t('wb.settings.models.loopbackOnly'))),
            h('div', { className: 'wb-meta-row' },
              h('div', { className: 'wb-meta-text' },
                h('span', { className: 'wb-meta-label' }, t('wb.settings.models.model')),
                h('span', { className: 'wb-meta-hint' }, ollamaModels.length > 0
                  ? t('wb.settings.models.found', { n: String(ollamaModels.length) })
                  : t('wb.settings.models.foundNone'))),
              h('select', {
                className: 'cs-input wb-select',
                value: currentModel,
                disabled: modelBusy,
                onChange: (event) => { void pickModel(event.target.value); },
              }, modelOptions.map((name) => h('option', { key: name, value: name }, name))))),
          modelNotice === undefined
            ? null
            : h('div', { className: `wb-notice ${modelNotice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
              h('span', null, modelNotice.text)),
          !ollamaOnline && modelInfo !== undefined
            ? h('div', { className: 'wb-notice wb-bad' },
              h('span', null, ollama?.error
                ? t('wb.settings.models.offlineHint', { error: String(ollama.error) })
                : t('wb.settings.models.noOllama')))
            : null,
          testResult === undefined
            ? null
            : h('div', { className: `wb-notice ${testResult.ok === true ? 'wb-ok' : 'wb-bad'}` },
              testResult.ok === true
                ? t('wb.settings.models.testOk', {
                  model: String(testResult.model ?? currentModel),
                  dims: formatInt(testResult.dims ?? 0, locale),
                })
                : t('wb.settings.models.testBad', { error: String(testResult.error ?? 'unknown') })),
          h('div', { className: 'wb-actions' },
            h('span', { className: 'cs-grow' }),
            h('button', {
              type: 'button',
              className: 'cs-btn wb-btn',
              disabled: modelBusy,
              onClick: () => { void testEmbedding(); },
            }, modelBusy ? t('wb.settings.models.testing') : t('wb.settings.models.test')))),

        /* ---- vector index ---------------------------------------------- */
        h('section', { className: 'wb-section', 'data-cs': 'index-status' },
          h('div', { className: 'wb-section-head' },
            h('div', { className: 'wb-section-text' },
              h('b', null, t('wb.settings.index.title')),
              h('span', { className: 'wb-section-desc' }, t('wb.settings.index.desc'))),
            h('span', { className: `wb-tag ${indexTone}` }, indexLabel)),
          h('div', { className: 'wb-meter' },
            h('div', { className: 'wb-meter-head' },
              h('span', null, indexHasScale
                ? t('wb.settings.index.summary', {
                  vectors: formatInt(index.vectors ?? 0, locale),
                  chunks: formatInt(index.chunks ?? 0, locale),
                  model: typeof index.model === 'string' && index.model !== '' ? index.model : '—',
                })
                : t('wb.settings.index.empty')),
              h('span', { className: 'wb-meter-pct' }, `${indexPercent}%`)),
            h('div', { className: 'wb-bar' },
              h('span', { className: 'wb-bar-fill', style: { width: `${indexPercent}%` } }))),
          indexState === 'running'
            ? h('div', { className: 'wb-notice' }, t('wb.settings.index.progress', {
              done: formatInt(index.done ?? 0, locale),
              total: formatInt(index.total ?? 0, locale),
              failed: formatInt(index.failed ?? 0, locale),
            }))
            : null,
          h('div', { className: 'wb-notice' }, t('wb.settings.index.hint')),
          h('div', { className: 'wb-actions' },
            h('span', { className: 'cs-grow' }),
            h('button', {
              type: 'button',
              className: 'cs-btn wb-btn',
              disabled: indexBusy || indexState === 'running' || !ollamaOnline,
              title: ollamaOnline ? t('wb.settings.index.rebuild') : t('wb.settings.index.rebuildNoModel'),
              onClick: () => { void rebuildIndex(); },
            }, indexBusy || indexState === 'running' ? t('wb.settings.index.rebuilding') : t('wb.settings.index.rebuild')))));
    }

    /* ================================================================ *
     * workbench/pages.js
     * ================================================================ */
    /**
     * Workbench main panel (Agent D surface): the left-nav workbench with three
     * reader pages plus the settings page. No code panel lives here — code opening
     * is handed back through `props.onOpenFile` / `props.onOpenGraph`.
     *
     * Scope rules:
     *   - Every top-level declaration is `wb`-prefixed; the whole client bundle is
     *     one function scope, so a reused top-level name is a fatal redeclaration.
     *   - React and hooks come from `../icons.js`; there is no `import 'react'`.
     *   - Every API call is wrapped so a missing Host method or a missing field
     *     degrades to a visible empty state instead of throwing.
     */











    /** The three workbench tabs, in navigation order. */
    const WB_TABS = [
      { id: 'notes', glyph: 'notes', label: 'wb.nav.notes' },
      { id: 'projects', glyph: 'layers', label: 'wb.nav.projects' },
      { id: 'settings', glyph: 'settings', label: 'wb.nav.settings' },
    ];

    /** Pull the workspace directory out of the scope, tolerating a missing scope. */
    function wbCwd(scope) {
      return scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
    }

    /** The active conversation id, when the main panel is opened beside one. */
    function wbSessionId(ctx, props, cwd) {
      const direct = props?.sessionId ?? props?.scope?.sessionId;
      if (typeof direct === 'string' && direct !== '') return direct;
      try {
        const ui = typeof ctx?.get === 'function' ? ctx.get('uiSession') : undefined;
        const current = ui?.current?.value;
        const nested = current?.props?.sessionId ?? current?.hooks?.session?.sessionId;
        if (typeof nested === 'string' && nested !== '') return nested;
      } catch {
        // fall through to the workspace model
      }
      if (typeof cwd === 'string' && cwd !== '') {
        const norm = (value) => String(value ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase();
        try {
          const model = typeof ctx?.get === 'function' ? ctx.get('workspaces')?.model : undefined;
          const items = Array.isArray(model?.items) ? model.items : [];
          const owner = items.find((item) => typeof item?.path === 'string' && norm(item.path) === norm(cwd));
          const first = Array.isArray(owner?.sessionIds) ? owner.sessionIds[0] : undefined;
          if (typeof first === 'string' && first !== '') return first;
        } catch {
          // try the sessions list next
        }
        try {
          const list = typeof ctx?.get === 'function' ? ctx.get('sessions')?.list?.getSnapshot?.() : undefined;
          const byId = list?.byId && typeof list.byId === 'object' ? list.byId : {};
          for (const [id, row] of Object.entries(byId)) {
            if (row && typeof row === 'object' && norm(row.cwd) === norm(cwd)) return id;
          }
        } catch {
          // no session id; the graph still renders project-level
        }
      }
      return undefined;
    }

    /** A note node when the id or kind marks it as a stored note. */
    function wbIsNoteNode(node) {
      if (node === null || node === undefined) return false;
      if (node.kind === 'note') return true;
      return String(node.id ?? node.path ?? '').startsWith('note://');
    }

    /** Apply the folder scope and the local query to the note list. */
    function wbFilterNotes(notes, query, folderId) {
      const needle = String(query ?? '').trim().toLowerCase();
      const scopeId = folderId ?? undefined;
      return (notes ?? []).filter((row) => {
        if (scopeId !== undefined && (row.folderId ?? undefined) !== scopeId) return false;
        if (needle === '') return true;
        return `${row.title ?? ''} ${row.excerpt ?? ''}`.toLowerCase().includes(needle);
      });
    }

    /**
     * Group notes under the folders they were filed in, newest first.
     *
     * The library has a real folder tree; a flat list hides it, which makes a
     * dozen notes look like a dozen unrelated files. Notes with no folder come
     * back separately so they can render at the top level.
     * @param folders - the folder tree rows.
     * @param notes - every note row.
     * @returns `{tree, loose}`.
     */
    function wbNoteGroups(folders, notes) {
      const byFolder = new Map();
      for (const note of notes ?? []) {
        const key = note.folderId ?? '';
        const list = byFolder.get(key) ?? [];
        list.push(note);
        byFolder.set(key, list);
      }
      const newestFirst = (list) => list.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
      const build = (rows) => (rows ?? []).map((folder) => ({
        folder,
        notes: newestFirst([...(byFolder.get(folder.id) ?? [])]),
        children: build(folder.children),
      }));
      return { tree: build(folders), loose: newestFirst([...(byFolder.get('') ?? [])]) };
    }

    /** Map an anchor drift status to a workbench tag tone. */
    function wbDriftClass(status) {
      if (status === 'fresh') return 'wb-ok';
      if (status === 'missing') return 'wb-bad';
      return 'wb-warn';
    }

    /**
     * The workbench shell: top tab strip shared by the three reader pages and the
     * settings page. Inactive pages stay in the DOM (hidden) so the harness can
     * assert every page container; only the active one fetches.
     *
     * @param props - `{ctx, scope, visible, t, locale, onOpenGraph, onOpenNote, onOpenFile}`.
     * @returns the shell.
     */
    function WorkbenchPage(props) {
      const { t, visible } = props;
      const panelParked = visible === false;
      const [tab, setTab] = useState('notes');
      const [graphRoot, setGraphRoot] = useState('');
      // Bumped on every visit back to the library so the list reloads: notes and
      // folders are also changed from the sidebar panel, which this page cannot see.
      const [refreshSeq, setRefreshSeq] = useState(0);

      // A global main-panel slot carries no conversation scope. Resolve the
      // workspace model once here so the note library and the note graph do not
      // each fail with "no workspace directory is available; pass root explicitly".
      const resolvedCwd = wbCwd(props.scope) ?? resolveWorkspace(props.ctx, props);
      const resolvedSessionId = wbSessionId(props.ctx, props, resolvedCwd);
      const pageScope = resolvedCwd !== undefined
        ? {
          ...(props.scope ?? {}),
          cwd: resolvedCwd,
          ...(resolvedSessionId === undefined ? {} : { sessionId: resolvedSessionId }),
        }
        : props.scope;

      const choose = useCallback((next) => {
        if (WB_TABS.some((row) => row.id === next)) {
          setTab(next);
          if (next === 'notes') setRefreshSeq((seq) => seq + 1);
        }
      }, []);

      const openGraph = useCallback((target) => {
        const root = typeof target?.root === 'string' ? target.root : '';
        if (root !== '') setGraphRoot(root);
        setTab('project-graph');
      }, []);

      return h('div', { className: 'wb-root', 'data-cs': 'workbench' },
        h('nav', {
          className: 'wb-nav',
          'data-cs': 'workbench-nav',
          role: 'tablist',
          'aria-label': t('wb.nav.title'),
        }, WB_TABS.map((row) => {
          const draw = Glyph[row.glyph];
          return h('button', {
            key: row.id,
            type: 'button',
            role: 'tab',
            className: `wb-nav-item${tab === row.id || (row.id === 'projects' && tab === 'project-graph') ? ' wb-on' : ''}`,
            'aria-pressed': tab === row.id ? 'true' : 'false',
            'data-tab': row.id,
            onClick: () => choose(row.id),
          }, draw === undefined ? t(row.label) : h('span', {
            style: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
          }, draw(12), t(row.label)));
        })),

        h('div', { className: 'wb-body' },
          h('div', {
            className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'notes',
            hidden: tab !== 'notes', role: 'tabpanel',
          }, h(WbNoteLibrary, {
            ...props, scope: pageScope, parked: panelParked || tab !== 'notes', refreshSeq,
          })),
          h('div', {
            className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'projects',
            hidden: tab !== 'projects', role: 'tabpanel',
          }, h(WbProjectList, {
            ...props,
            scope: pageScope,
            parked: panelParked || tab !== 'projects',
            onOpenGraph: openGraph,
          })),
          h('div', {
            className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'project-graph',
            hidden: tab !== 'project-graph', role: 'tabpanel',
          }, h(WbProjectGraph, {
            ...props,
            scope: pageScope,
            sessionId: resolvedSessionId,
            graphRoot,
            parked: panelParked || tab !== 'project-graph',
            onBack: () => setTab('projects'),
          })),
          h('div', {
            className: 'wb-page', 'data-cs': 'workbench-page', 'data-page': 'settings',
            hidden: tab !== 'settings', role: 'tabpanel',
          }, h(SettingsPage, { ...props, scope: pageScope, parked: panelParked || tab !== 'settings' }))));
    }

    /* ------------------------------------------------------------------ *
     * Page 1: notes library (read-only shell over the `notes` API)         *
     * ------------------------------------------------------------------ */

    /**
     * The code range a note points at, rendered where the note is read.
     *
     * A note outlives the code it quotes. Two cases matter and they must not look
     * alike: the same code still exists (lines may have shifted while it moved), and
     * the code is gone from today's tree — in which case the honest thing to show is
     * the commit the note was written against, not line 1 of whatever is there now.
     *
     * @param props - `{ peek, t, onOpen, onClose }`.
     * @returns the peek card, or null when nothing was requested.
     */
    function WbCodePeek(props) {
      const { peek, t, onOpen, onClose } = props;
      if (peek === undefined || peek === null) return null;
      if (peek.loading === true) {
        return h('div', { className: 'wb-peek', 'data-cs': 'code-peek' },
          h('div', { className: 'wb-peek-head' },
            h('span', { className: 'wb-peek-path' }, peek.path ?? ''),
            h('span', { className: 'wb-peek-tag' }, t('wb.peek.loading'))));
      }
      if (peek.error !== undefined) {
        return h('div', { className: 'wb-peek', 'data-cs': 'code-peek' },
          h('div', { className: 'wb-peek-head' },
            h('span', { className: 'wb-peek-path' }, peek.path ?? ''),
            h('button', {
              type: 'button', className: 'wb-iconbtn', title: t('wb.peek.close'),
              'aria-label': t('wb.peek.close'), onClick: onClose,
            }, Glyph.close(12))),
          h('div', { className: 'wb-peek-empty' }, t('wb.peek.failed', { error: peek.error })));
      }

      const data = peek.data ?? {};
      const mode = data.mode ?? 'missing';
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const sha = typeof data.commit?.sha === 'string' ? data.commit.sha.slice(0, 7) : '';
      const date = typeof data.commit?.date === 'string' ? data.commit.date.slice(0, 10) : '';
      const tag = mode === 'worktree'
        ? (data.status === 'moved' ? t('wb.peek.moved') : t('wb.peek.current'))
        : mode === 'history' ? t('wb.peek.history', { sha }) : t('wb.peek.missing');

      return h('div', { className: `wb-peek${mode === 'history' ? ' wb-peek-history' : ''}`, 'data-cs': 'code-peek', 'data-mode': mode },
        h('div', { className: 'wb-peek-head' },
          h('span', { className: 'wb-peek-path', title: data.path ?? '' }, data.path ?? ''),
          h('span', { className: `wb-peek-tag${mode === 'history' ? ' wb-warn' : ''}` }, tag),
          h('span', { className: 'wb-peek-range' }, `${data.startLine ?? '—'}–${data.endLine ?? '—'}`),
          h('span', { className: 'cs-grow' }),
          mode === 'worktree'
            ? h('button', {
              type: 'button', className: 'cs-btn cs-small wb-btn-sm',
              onClick: () => onOpen(data.path, data.startLine, data.endLine),
            }, t('wb.peek.open'))
            : null,
          h('button', {
            type: 'button', className: 'wb-iconbtn', title: t('wb.peek.close'),
            'aria-label': t('wb.peek.close'), onClick: onClose,
          }, Glyph.close(12))),

        mode === 'history'
          ? h('div', { className: 'wb-peek-banner' },
            h('span', { className: 'wb-peek-sha' }, sha),
            h('span', null, `${date} · ${String(data.commit?.subject ?? '')}`),
            h('span', { className: 'wb-peek-gone' }, t('wb.peek.gone')))
          : null,

        rows.length === 0
          ? h('div', { className: 'wb-peek-empty' }, t('wb.peek.noCode'))
          : h('div', { className: 'wb-peek-code' }, rows.map((row) => h('div', {
            key: `l${row.line}`,
            className: row.line >= (data.startLine ?? 0) && row.line <= (data.endLine ?? 0) ? 'wb-peek-line wb-on' : 'wb-peek-line',
          }, h('span', { className: 'wb-peek-ln' }, String(row.line)),
          h('span', { className: 'wb-peek-src' }, row.text === '' ? ' ' : row.text)))),

        mode === 'missing'
          ? h('div', { className: 'wb-peek-banner' }, t('wb.peek.missingHint'))
          : null);
    }

    /**
     * Folder tree + note list + reader. Read-only: creation and editing stay with
     * the dedicated notes sidebar; this shell lists notes, opens them, and shows
     * anchor drift.
     * @param props - `{ctx, scope, parked, t, locale, onOpenFile}`.
     * @returns the library page.
     */
    function WbNoteLibrary(props) {
      const { ctx, scope, parked, t, locale, onOpenFile, refreshSeq } = props;
      // The tab can be opened before any conversation exists; without the resolver
      // fallback the library asked a different root and showed an empty shelf next
      // to a sidebar that listed notes.
      const cwd = wbCwd(scope) ?? resolveWorkspace(ctx, props);
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const [folders, setFolders] = useState([]);
      const [notes, setNotes] = useState([]);
      const [note, setNote] = useState(undefined);
      const [folderId, setFolderId] = useState(undefined);
      const [query, setQuery] = useState('');
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(undefined);
      const [selected, setSelected] = useState(() => new Set());
      const [selecting, setSelecting] = useState(false);
      const [showGraph, setShowGraph] = useState(false);
      const [expanded, setExpanded] = useState(() => new Set());
      const [importOpen, setImportOpen] = useState(false);
      const [importPath, setImportPath] = useState('');
      const [importBusy, setImportBusy] = useState(false);
      const [notice, setNotice] = useState(undefined);
      /* The citation the reader just clicked: loading, then located worktree/history. */
      const [peek, setPeek] = useState(undefined);

      const alive = useRef(true);
      const requests = useRef(undefined);
      const fileRef = useRef(null);

      useEffect(() => {
        alive.current = true;
        const scopeReq = makeRequestScope();
        requests.current = scopeReq;
        return () => {
          alive.current = false;
          scopeReq.dispose();
          requests.current = undefined;
        };
      }, []);

      const refresh = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
          const value = await requests.current.run((signal) => call('notes', { op: 'list' }, signal));
          if (!alive.current || value === undefined) return;
          setFolders(Array.isArray(value.folders) ? value.folders : []);
          setNotes(Array.isArray(value.notes) ? value.notes : []);
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setLoading(false);
        }
      }, [call]);

      useEffect(() => {
        if (parked) return undefined;
        void refresh();
        return undefined;
      }, [parked, refresh, refreshSeq]);

      const open = useCallback(async (id) => {
        setBusy(true);
        setError(undefined);
        try {
          const value = await requests.current.run((signal) => call('notes', { op: 'read', id }, signal));
          if (alive.current && value !== undefined && value.note !== undefined) {
            setNote(value.note);
            setShowGraph(false);
          }
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call]);

      const openCitation = useCallback((path, startLine, endLine) => {
        if (typeof onOpenFile === 'function') {
          try {
            // `cwd` and `sessionId` ride along: the main-panel slot has no
            // conversation scope of its own, and without them the right sidebar
            // cannot resolve which session's tab to reuse.
            onOpenFile({
              path,
              startLine,
              endLine,
              cwd,
              ...(scope?.sessionId === undefined ? {} : { sessionId: scope.sessionId }),
            });
            return;
          } catch {
            // Fall through to the sidebar service grammar.
          }
        }
        const sidebar = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
        try {
          if (sidebar && typeof sidebar.openFile === 'function' && scope !== undefined) {
            sidebar.openFile(scope, `${path}#L${startLine ?? 1}`);
          }
        } catch {
          // Without any opener the reader still shows the citation text.
        }
      }, [ctx, scope, onOpenFile, cwd]);

      /**
       * Click handling for one citation.
       *
       * The note's stored line number is a snapshot, not an address: ask the Host
       * where the code is now, then hand the answer to the right sidebar rather than
       * drawing a second code pane here. Worktree hits open today's file at the new
       * range; a hit that survives only in history opens the blob from the note's
       * own commit, and both carry the note's range so the sidebar can box it.
       */
      const revealCitation = useCallback(async (path, startLine, endLine, index) => {
        let located;
        try {
          located = await call('notes', {
            op: 'locate',
            ...(note?.id === undefined ? {} : { noteId: note.id }),
            ...(index === undefined ? {} : { index }),
            path,
            startLine,
            endLine,
          });
        } catch (caught) {
          if (alive.current) {
            setPeek({ path, error: caught && caught.message ? caught.message : String(caught) });
          }
          return;
        }
        if (!alive.current || located === undefined) return;

        if (located.mode === 'worktree' || located.mode === 'history') {
          let target = located.path ?? path;
          let title;
          if (located.mode === 'history' && typeof located.commit?.sha === 'string') {
            // The worktree copy is gone, so the editor has nothing to open: the Host
            // mirrors the blob at the note's commit into `.codeslice/history/<sha>/`.
            const shadow = await call('notes', {
              op: 'materialize',
              path: target,
              commit: located.commit.sha,
            });
            if (!alive.current || shadow === undefined || typeof shadow.path !== 'string') {
              setPeek({ data: located, path });
              return;
            }
            target = shadow.path;
            title = `${path} @ ${located.commit.sha.slice(0, 7)}`;
          }

          const sessionId = typeof note?.conversationId === 'string' && note.conversationId !== ''
            ? note.conversationId
            : (typeof scope?.sessionId === 'string' && scope.sessionId !== '' ? scope.sessionId : undefined);
          const start = located.startLine ?? startLine;
          const end = located.endLine ?? endLine;
          if (sessionId !== undefined) {
            // Recording the range as a frame is what paints the box in the editor;
            // the same interval dedupes, so repeated clicks do not stack strips.
            try {
              await call('frames', {
                op: 'create',
                path: target,
                startLine: start,
                endLine: end,
                sessionId,
                title: note?.title ?? t('wb.peek.citation'),
                question: `${note?.title ?? t('wb.peek.citation')} · ${start}-${end}`,
              });
            } catch {
              // The jump still works without the box.
            }
          }
          if (typeof onOpenFile === 'function') {
            try {
              onOpenFile({
                path: target,
                title,
                startLine: start,
                endLine: end,
                box: { startLine: start, endLine: end },
                cwd,
                ...(sessionId === undefined ? {} : { sessionId, activateSession: sessionId }),
              });
              setPeek(undefined);
              // The Host rewrites the note's stored range when the snippet moved;
              // reload so the chip and the Markdown heading show today's numbers.
              void refresh();
              return;
            } catch {
              // Fall through to the inline answer below.
            }
          }
        }
        setPeek({ data: located, path });
      }, [call, cwd, note?.id, note?.conversationId, note?.title, onOpenFile, refresh, scope?.sessionId, t]);

      /* ---- import / export / selection ---- */

      const runImport = useCallback(async (items, paths) => {
        setImportBusy(true);
        setError(undefined);
        try {
          const value = await call('notes', { op: 'import', items, paths });
          if (!alive.current || value === undefined) return;
          setNotice(t('wb.notes.imported', { count: value.imported ?? 0 }));
          setImportOpen(false);
          setImportPath('');
          await refresh();
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setImportBusy(false);
        }
      }, [call, refresh, t]);

      const importFromFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList ?? []);
        if (files.length === 0) return;
        const items = [];
        for (const file of files) {
          let body = '';
          try {
            body = await file.text();
          } catch {
            body = '';
          }
          if (body.trim() === '') continue;
          items.push({ title: '', name: file.name, body });
        }
        if (items.length === 0) {
          setError(t('wb.notes.importEmpty'));
          return;
        }
        await runImport(items, undefined);
      }, [runImport, t]);

      const importFromPaths = useCallback(async () => {
        const paths = importPath.split(/[\n,;]/u).map((row) => row.trim()).filter((row) => row !== '');
        if (paths.length === 0) {
          setError(t('wb.notes.importEmpty'));
          return;
        }
        await runImport(undefined, paths);
      }, [importPath, runImport, t]);

      const exportMany = useCallback(async (ids) => {
        setBusy(true);
        setError(undefined);
        try {
          const value = await call('notes', {
            op: 'exportMany',
            ...(Array.isArray(ids) ? { ids } : {}),
          });
          if (!alive.current || value === undefined) return;
          setNotice(t('wb.notes.exportedMany', { count: value.count ?? 0, path: value.dir ?? '' }));
          if (Array.isArray(ids)) setSelected(new Set());
        } catch (caught) {
          if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [call, t]);

      const toggleSelected = useCallback((id) => {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const backToList = useCallback(() => { setNote(undefined); setShowGraph(false); }, []);

      const searching = query.trim() !== '';
      const visibleNotes = useMemo(
        () => wbFilterNotes(notes, query, undefined),
        [notes, query],
      );

      // Folders open by default — a collapsed tree on first paint hides the very
      // structure the list exists to show.
      useEffect(() => {
        if (folders.length === 0) return;
        setExpanded((current) => {
          if (current.size > 0) return current;
          const next = new Set();
          const walk = (rows) => {
            for (const row of rows ?? []) {
              next.add(row.id);
              walk(row.children);
            }
          };
          walk(folders);
          return next;
        });
      }, [folders]);

      const viewGroups = useMemo(() => wbNoteGroups(folders, visibleNotes), [folders, visibleNotes]);
      // Search keeps the folder tree and only drops folders with no surviving note,
      // matching the right-rail library and the desktop reference.
      const listRows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const buildRows = (nodes, depth) => {
          const rows = [];
          for (const node of nodes) {
            const childRows = buildRows(node.children, depth + 1);
            const nameHit = needle !== '' && node.folder.name.toLocaleLowerCase().includes(needle);
            if (needle !== '' && node.notes.length === 0 && childRows.length === 0 && !nameHit) continue;
            const open = searching || expanded.has(node.folder.id);
            rows.push({ kind: 'folder', folder: node.folder, depth, count: node.notes.length, open });
            if (!open) continue;
            rows.push(...childRows);
            for (const row of node.notes) rows.push({ kind: 'note', row, depth: depth + 1 });
          }
          return rows;
        };
        const rows = buildRows(viewGroups.tree, 0);
        if (viewGroups.loose.length > 0) {
          rows.push({ kind: 'divider', count: viewGroups.loose.length });
          for (const row of viewGroups.loose) rows.push({ kind: 'note', row, depth: 0 });
        }
        return rows;
      }, [viewGroups, expanded, searching, query]);

      const toggleExpanded = useCallback((id) => {
        setExpanded((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const anchors = note !== undefined && Array.isArray(note.anchors) ? note.anchors : [];
      const refs = note !== undefined && Array.isArray(note.codeRefs) ? note.codeRefs : [];

      return h('div', { className: 'wb-notes-wrap' },
        h('div', { className: 'wb-notes-bar' },
          h('button', {
            type: 'button',
            className: 'wb-btn',
            disabled: busy || importBusy,
            title: t('wb.notes.import'),
            onClick: () => setImportOpen((open) => !open),
          }, Glyph.file(12), h('span', null, t('wb.notes.import'))),
          h('button', {
            type: 'button',
            className: `wb-btn${selecting ? ' wb-on' : ''}`,
            disabled: busy,
            title: t('wb.notes.export'),
            onClick: () => {
              setSelecting((on) => {
                if (on) setSelected(new Set());
                return !on;
              });
            },
          }, Glyph.open(12), h('span', null, t('wb.notes.export'))),
          h('button', {
            type: 'button',
            className: `wb-btn${showGraph ? ' wb-on' : ''}`,
            disabled: notes.length === 0 && !showGraph,
            title: t('wb.notes.graph'),
            onClick: () => setShowGraph((on) => !on),
          }, Glyph.graph(12), h('span', null, t('wb.notes.graph'))),
          selecting ? h('span', { className: 'wb-note-time' },
            t('wb.notes.selected', { count: selected.size })) : null,
          selecting ? h('button', {
            type: 'button',
            className: 'wb-btn',
            disabled: busy || selected.size === 0,
            onClick: () => { void exportMany(Array.from(selected)); },
          }, Glyph.open(12), h('span', null, t('wb.notes.exportSelected'))) : null,
          selecting ? h('button', {
            type: 'button',
            className: 'wb-btn',
            disabled: busy,
            onClick: () => { void exportMany(undefined); },
          }, h('span', null, t('wb.notes.exportAll'))) : null,
          selecting ? h('button', {
            type: 'button',
            className: 'wb-btn',
            onClick: () => { setSelected(new Set()); setSelecting(false); },
          }, h('span', null, t('wb.notes.cancelSelect'))) : null,
          h('span', { style: { flex: '1 1 auto' } }),
          notice === undefined ? null : h('span', { className: 'wb-note-time', title: notice }, notice)),

        importOpen ? h('div', { className: 'wb-notes-import' },
          h('input', {
            ref: fileRef,
            type: 'file',
            accept: '.md,.markdown,.txt,text/markdown',
            multiple: true,
            style: { display: 'none' },
            onChange: (event) => {
              const files = event.target.files;
              event.target.value = '';
              if (files !== null && files !== undefined && files.length > 0) void importFromFiles(files);
            },
          }),
          h('button', {
            type: 'button',
            className: 'wb-btn',
            disabled: importBusy,
            onClick: () => fileRef.current?.click(),
          }, Glyph.file(12), h('span', null, t('wb.notes.importPick'))),
          h('input', {
            className: 'cs-input',
            style: { flex: '1 1 200px', maxWidth: '420px' },
            value: importPath,
            placeholder: t('wb.notes.importPath'),
            'aria-label': t('wb.notes.importPath'),
            onChange: (event) => setImportPath(event.target.value),
          }),
          h('button', {
            type: 'button',
            className: 'wb-btn',
            disabled: importBusy || importPath.trim() === '',
            onClick: () => { void importFromPaths(); },
          }, h('span', null, t('wb.notes.importRun'))),
          h('button', {
            type: 'button',
            className: 'wb-iconbtn',
            title: t('notes.reader.cancel'),
            'aria-label': t('notes.reader.cancel'),
            onClick: () => { setImportOpen(false); setImportPath(''); },
          }, Glyph.close(12))) : null,

        h('div', { className: 'wb-notes' },
        h('div', { className: 'wb-notes-side' },
          h('div', { className: 'wb-notes-side-head' },
            h('input', {
              className: 'cs-input',
              type: 'search',
              value: query,
              placeholder: t('wb.notes.search'),
              'aria-label': t('wb.notes.search'),
              onChange: (event) => setQuery(event.target.value),
            })),
          h('div', { className: 'wb-scroll' },
            h('button', {
              type: 'button',
              className: `wb-folder-row${folderId === undefined ? ' wb-on' : ''}`,
              onClick: () => setFolderId(undefined),
            }, Glyph.layers(12), h('span', { style: { flex: '1 1 auto' } }, t('notes.library')),
              h('span', { className: 'wb-note-time' }, formatInt(notes.length, locale))),
            loading && notes.length === 0
              ? h('div', { className: 'wb-empty' }, t('wb.notes.loading'))
              : listRows.length === 0
                ? h('div', { className: 'wb-empty' },
                  h('p', null, searching ? t('notes.emptySearch') : notes.length === 0 ? t('wb.notes.empty') : t('notes.list.empty')))
                : listRows.map((entry) => {
                  if (entry.kind === 'divider') {
                    return h('div', { key: 'divider', className: 'wb-notes-divider' },
                      h('span', { style: { flex: '1 1 auto' } }, t('notes.folder.unfiled')),
                      h('span', { className: 'wb-note-time' }, formatInt(entry.count, locale)));
                  }
                  if (entry.kind === 'folder') {
                    return h('div', {
                      key: `f-${entry.folder.id}`,
                      className: 'wb-folder-node',
                      style: { paddingLeft: `${6 + entry.depth * 14}px` },
                    },
                    h('button', {
                      type: 'button',
                      className: 'wb-chevron',
                      title: t('wb.notes.folderToggle'),
                      'aria-label': t('wb.notes.folderToggle'),
                      onClick: () => toggleExpanded(entry.folder.id),
                    }, h('span', null, entry.open ? '▾' : '▸')),
                    h('button', {
                      type: 'button',
                      className: `wb-folder-row${folderId === entry.folder.id ? ' wb-on' : ''}`,
                      title: entry.folder.name,
                      // Explorer semantics: the name selects the folder and reveals
                      // it; only the chevron folds it back up.
                      onClick: () => {
                        setFolderId(entry.folder.id);
                        setExpanded((current) => {
                          if (current.has(entry.folder.id)) return current;
                          const next = new Set(current);
                          next.add(entry.folder.id);
                          return next;
                        });
                      },
                    }, Glyph.folder(12), h('span', { style: { flex: '1 1 auto' } }, entry.folder.name),
                      h('span', { className: 'wb-note-time' }, formatInt(entry.count, locale))));
                  }
                  const row = entry.row;
                  const active = note !== undefined && note.id === row.id;
                  return h('div', {
                    key: row.id,
                    className: `wb-note-item${active ? ' wb-on' : ''}`,
                    style: { paddingLeft: `${entry.depth * 14}px` },
                  },
                  selecting ? h('input', {
                    type: 'checkbox',
                    className: 'wb-note-check',
                    checked: selected.has(row.id),
                    'aria-label': t('wb.notes.select'),
                    title: t('wb.notes.select'),
                    onChange: () => toggleSelected(row.id),
                  }) : null,
                  h('button', {
                    type: 'button',
                    className: `wb-note-row${active ? ' wb-on' : ''}`,
                    title: row.title,
                    onClick: () => { void open(row.id); },
                  },
                  h('span', { className: 'wb-note-icon' }, Glyph.notes(12)),
                  h('span', { className: 'wb-note-title' }, row.title)));
                }))),
        h('div', { className: 'wb-reader' },
          error === undefined ? null : h('div', { className: 'wb-banner wb-bad' },
            Glyph.alert(13), h('span', { style: { flex: '1 1 auto' } }, error)),
          showGraph
            ? h('div', { className: 'wb-reader-graph', 'data-cs': 'notes-graph' },
              h(WbNoteGraph, {
                ...props,
                scope,
                parked: false,
                onOpenNote: (target) => {
                  const id = target?.id ?? target?.noteId;
                  if (typeof id === 'string' && id !== '') void open(id);
                },
              }))
            : note === undefined
              ? h('div', { className: 'wb-empty' },
                Glyph.notes(24),
                h('p', null, t('wb.notes.reader.empty')))
              : h('div', { className: 'wb-reader-head' },
              h('div', { className: 'wb-reader-title' },
                h('button', {
                  type: 'button',
                  className: 'wb-iconbtn',
                  title: t('wb.notes.back'),
                  'aria-label': t('wb.notes.back'),
                  onClick: backToList,
                }, Glyph.back(14)),
                h('h2', { title: note.title }, note.title),
                h('span', { className: 'wb-note-time' }, formatRelative(locale, note.updatedAt))),
              refs.length === 0 && anchors.length === 0 ? null : h('div', { className: 'wb-reader-chips' },
                refs.map((ref, index) => {
                  const start = ref.line ?? 1;
                  const end = ref.endLine ?? ref.line ?? 1;
                  return h('button', {
                    key: `ref${index}`,
                    type: 'button',
                    className: 'wb-cite',
                    title: `${ref.path}:${start}-${end}`,
                    onClick: () => { void revealCitation(ref.path, start, end, index); },
                  }, [ref.symbol ?? '', ref.symbol === undefined ? '' : ' ', `${ref.path}:${start}${end === start ? '' : `-${end}`}`].join(''));
                }),
                anchors.map((anchor, index) => h('span', {
                  key: `anchor${index}`,
                  className: `wb-tag ${wbDriftClass(anchor.status)}`,
                  title: `${anchor.path}:${anchor.startLine ?? anchor.line ?? 1}`,
                }, t(`notes.drift.${anchor.status ?? 'fresh'}`)))),
              h(WbCodePeek, {
                peek,
                t,
                onOpen: (path, startLine, endLine) => openCitation(path, startLine, endLine),
                onClose: () => setPeek(undefined),
              }),
              h('div', { className: 'wb-scroll' },
                h('div', { className: 'wb-reader-doc' },
                  stripTitleLine(note.body ?? '').trim() === ''
                    ? h('p', { className: 'wb-note-time' }, t('notes.reader.bodyEmpty'))
                    : h(Markdown, {
                      text: stripTitleLine(note.body),
                      onOpenCitation: (path, line, endLine) => { void revealCitation(path, line ?? 1, endLine ?? line ?? 1); },
                      t,
                    })))))));
    }

    /* ------------------------------------------------------------------ *
     * Page 2: project graph register                                     *
     * ------------------------------------------------------------------ */

    /**
     * Registered project graphs: rename inline, inspect stats, open the graph in
     * the session view, or forget the registration. A missing `projects` method
     * renders the empty state with a rebuild button instead of throwing.
     * @param props - `{ctx, scope, parked, t, locale, onOpenGraph}`.
     * @returns the register page.
     */
    function WbProjectList(props) {
      const { ctx, scope, parked, t, locale, onOpenGraph } = props;
      const cwd = wbCwd(scope);
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const [projects, setProjects] = useState([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(undefined);
      const [busy, setBusy] = useState(false);
      const [rebuilding, setRebuilding] = useState(false);
      const [notice, setNotice] = useState(undefined);
      const [renamingId, setRenamingId] = useState(undefined);
      const [renameValue, setRenameValue] = useState('');
      const [armDeleteId, setArmDeleteId] = useState(undefined);

      const alive = useRef(true);
      const requests = useRef(undefined);

      useEffect(() => {
        alive.current = true;
        const scopeReq = makeRequestScope();
        requests.current = scopeReq;
        return () => {
          alive.current = false;
          scopeReq.dispose();
          requests.current = undefined;
        };
      }, []);

      const refresh = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
          const value = await requests.current.run((signal) => call('projects', { op: 'list' }, signal));
          if (!alive.current || value === undefined) return;
          setProjects(Array.isArray(value.projects) ? value.projects : []);
        } catch (caught) {
          if (!alive.current) return;
          setProjects([]);
          setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (alive.current) setLoading(false);
        }
      }, [call]);

      useEffect(() => {
        if (parked) return undefined;
        void refresh();
        return undefined;
      }, [parked, refresh]);

      const commitRename = useCallback(async (row) => {
        const name = renameValue.trim();
        if (name === '' || name === row.name) {
          setRenamingId(undefined);
          return;
        }
        setBusy(true);
        setNotice(undefined);
        try {
          const value = await requests.current.run((signal) => call('projects', { op: 'rename', id: row.id, name }, signal));
          if (!alive.current) return;
          const updated = value && value.project !== undefined ? value.project : { name };
          setProjects((rows) => rows.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
        } catch (caught) {
          if (alive.current) setNotice({ kind: 'bad', text: caught && caught.message ? caught.message : String(caught) });
        } finally {
          if (alive.current) {
            setBusy(false);
            setRenamingId(undefined);
          }
        }
      }, [call, renameValue]);

      const remove = useCallback(async (row) => {
        setBusy(true);
        setNotice(undefined);
        try {
          await requests.current.run((signal) => call('projects', { op: 'delete', id: row.id }, signal));
          if (!alive.current) return;
          setProjects((rows) => rows.filter((r) => r.id !== row.id));
        } catch (caught) {
          if (alive.current) setNotice({ kind: 'bad', text: caught && caught.message ? caught.message : String(caught) });
        } finally {
          if (alive.current) {
            setBusy(false);
            setArmDeleteId(undefined);
          }
        }
      }, [call]);

      const rebuild = useCallback(async () => {
        setRebuilding(true);
        setNotice(undefined);
        try {
          await requests.current.run((signal) => call('rebuild', {}, signal));
          if (alive.current) setNotice({ kind: 'ok', text: t('wb.projects.rebuilt') });
          await refresh();
        } catch (caught) {
          if (alive.current) setNotice({ kind: 'bad', text: caught && caught.message ? caught.message : String(caught) });
        } finally {
          if (alive.current) setRebuilding(false);
        }
      }, [call, refresh, t]);

      const statsText = (stats) => {
        const safe = stats ?? {};
        return t('wb.projects.stats', {
          files: formatInt(safe.files ?? 0, locale),
          lines: formatInt(safe.lines ?? 0, locale),
          nodes: formatInt(safe.nodes ?? 0, locale),
          edges: formatInt(safe.edges ?? 0, locale),
          communities: formatInt(safe.communities ?? 0, locale),
        });
      };

      return h('div', { className: 'wb-scroll' },
        error === undefined ? null : h('div', { className: 'wb-banner wb-bad' },
          Glyph.alert(13),
          h('span', { style: { flex: '1 1 auto' } }, error)),
        notice === undefined ? null : h('div', { className: `wb-banner ${notice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
          Glyph.check(12),
          h('span', { style: { flex: '1 1 auto' } }, notice.text)),

        loading && projects.length === 0
          ? h('div', { className: 'wb-empty' }, Glyph.spinner(14), h('span', null, t('wb.projects.loading')))
          : projects.length === 0
            ? h('div', { className: 'wb-empty' },
              Glyph.layers(24),
              h('b', null, t('wb.projects.empty.title')),
              h('p', null, t('wb.projects.empty.body')),
              h('button', {
                type: 'button',
                className: 'cs-btn cs-small cs-primary',
                disabled: rebuilding,
                onClick: () => { void rebuild(); },
              }, Glyph.rebuild(12), rebuilding ? t('wb.projects.rebuilding') : t('wb.projects.rebuild')))
            : h('div', { className: 'wb-proj-list' },
              projects.map((row) => {
                const stats = row.stats ?? {};
                const renaming = renamingId === row.id;
                const arming = armDeleteId === row.id;
                const name = row.name || t('wb.projects.unnamed');
                const builtAtText = formatRelative(locale, row.builtAt) === ''
                  ? ''
                  : t('wb.projects.builtAt', { time: formatRelative(locale, row.builtAt) });
                return h('div', {
                  key: row.id,
                  className: 'wb-proj-card',
                  'data-cs': 'project-row',
                  'data-root': row.root,
                },
                  h('div', { className: 'wb-proj-top' },
                    renaming
                      ? h('input', {
                        className: 'cs-input wb-proj-rename',
                        value: renameValue,
                        placeholder: t('wb.projects.renamePlaceholder'),
                        'aria-label': t('wb.projects.rename'),
                        onChange: (event) => setRenameValue(event.target.value),
                        onKeyDown: (event) => {
                          if (event.key === 'Enter') void commitRename(row);
                          if (event.key === 'Escape') setRenamingId(undefined);
                        },
                        onBlur: () => { if (renaming) void commitRename(row); },
                      })
                      : h('span', { className: 'wb-proj-name', title: name }, name),
                    h('div', { className: 'wb-proj-acts' },
                      h('button', {
                        type: 'button',
                        className: 'cs-btn cs-small cs-ghost',
                        title: t('wb.projects.open'),
                        onClick: () => { if (typeof onOpenGraph === 'function') onOpenGraph({ root: row.root }); },
                      }, Glyph.open(12), t('wb.projects.open')),
                      renaming ? null : h('button', {
                        type: 'button',
                        className: 'cs-iconbtn',
                        title: t('wb.projects.rename'),
                        'aria-label': t('wb.projects.rename'),
                        disabled: busy,
                        onClick: () => { setRenamingId(row.id); setRenameValue(row.name ?? ''); },
                      }, Glyph.pencil(12)),
                      h('button', {
                        type: 'button',
                        className: `cs-iconbtn cs-danger${arming ? ' wb-on' : ''}`,
                        title: arming ? t('wb.projects.deleteArm') : t('wb.projects.delete'),
                        'aria-label': arming ? t('wb.projects.deleteArm') : t('wb.projects.delete'),
                        disabled: busy,
                        onClick: () => {
                          if (arming) void remove(row);
                          else setArmDeleteId(row.id);
                        },
                      }, Glyph.trash(13)))),
                  h('div', { className: 'wb-proj-root', title: row.root }, row.root),
                  h('div', { className: 'wb-proj-stats' }, statsText(stats)),
                  h('div', { className: 'wb-proj-stats' }, builtAtText));
              }),
              h('div', { className: 'wb-proj-acts' },
                h('button', {
                  type: 'button',
                  className: 'cs-btn cs-small cs-ghost',
                  disabled: rebuilding,
                  onClick: () => { void rebuild(); },
                }, Glyph.refresh(12), rebuilding ? t('wb.projects.rebuilding') : t('common.refresh')))));
    }

    /* ------------------------------------------------------------------ *
     * Page 3: project code graph canvas                                  *
     * ------------------------------------------------------------------ */

    /**
     * A project graph opened from the register. The canvas itself is the same
     * `GraphView` the session tab uses; this page owns only the back button and the
     * explicit `scope.cwd`, because a workbench page has no conversation scope of
     * its own.
     *
     * @param props - `{ctx, graphRoot, parked, t, locale, onOpenFile, onBack}`.
     * @returns the graph page.
     */
    function WbProjectGraph(props) {
      const {
        ctx, graphRoot, parked, t, locale, onOpenFile, onBack, scope, sessionId,
      } = props;
      if (parked) return null;
      const activeSessionId = sessionId ?? scope?.sessionId;
      if (graphRoot === '') {
        return h('div', { className: 'wb-empty' },
          Glyph.graph(24),
          h('b', null, t('wb.canvas.empty.title')),
          h('p', null, t('wb.canvas.empty.body')));
      }
      return h('div', { className: 'wb-project-graph' },
        h('div', { className: 'wb-graph-bar' },
          h('button', {
            type: 'button',
            className: 'cs-btn cs-small cs-ghost',
            onClick: () => { if (typeof onBack === 'function') onBack(); },
          }, Glyph.back(12), t('wb.canvas.back')),
          h('span', { className: 'wb-graph-root', title: graphRoot }, graphRoot)),
        h(GraphView, {
          ctx,
          scope: { cwd: graphRoot },
          visible: true,
          railCollapsible: true,
          onOpenFile: (target) => {
            if (typeof onOpenFile !== 'function') return;
            onOpenFile({
              ...target,
              cwd: graphRoot,
              ...(activeSessionId === undefined ? {} : { sessionId: activeSessionId }),
            });
          },
          t,
          locale,
        }));
    }

    /* ------------------------------------------------------------------ *
     * Page 3: note knowledge graph canvas                                *
     * ------------------------------------------------------------------ */

    /**
     * The notes graph drawn on the same canvas as the project graph: the same
     * `GraphView` (vis-network stage, community legend, focus, inspector rail) over
     * a different payload. The Host builds a pure note layer — notes, the knowledge
     * points they mention, and note↔note similarity — so a single note still has
     * structure to show.
     *
     * Differences from the code graph are all props:
     *   - `loader` fetches `notes op=graph` instead of `graph`;
     *   - no layout cache (its topology is not the project graph's);
     *   - no relation chips (the note relations are not code families);
     *   - activating a node opens the note, not a file.
     *
     * @param props - `{ctx, scope, parked, t, locale, onOpenNote}`.
     * @returns the note graph page.
     */
    function WbNoteGraph(props) {
      const { ctx, scope, parked, t, locale, onOpenNote } = props;

      const loader = useCallback((call, signal) => call('notes', { op: 'graph' }, signal), []);

      const activate = useCallback((node) => {
        if (node === null || node === undefined) return;
        if (!wbIsNoteNode(node)) return;
        if (typeof onOpenNote !== 'function') return;
        try {
          onOpenNote({ id: node.noteId ?? node.id, noteId: node.noteId });
        } catch {
          /* an open failure must not take the canvas down */
        }
      }, [onOpenNote]);

      return h('div', { className: 'wb-note-graph' },
        h(GraphView, {
          ctx,
          scope,
          visible: parked !== true,
          railCollapsible: true,
          loader,
          persistLayout: false,
          showFamilies: true,
          fetchDetail: false,
          relationScope: 'notes',
          onActivateNode: activate,
          t,
          locale,
        }));
    }

    /* ================================================================ *
     * session-view.js
     * ================================================================ */
    /**
     * Session-scoped graph view: the third `conversation.view` slot, listed beside
     * the host's own 对话 (order 0) and 轨迹 (order 10).
     *
     * This module is the Agent E integration point (INTERFACES-v3 §2.5): the
     * GraphView itself lives in `graph/view.js`; here we own only the slot descriptor,
     * its one copy key and the registration boundary. A failed registration is
     * surfaced through `ctx.logger.warn` — it must not be swallowed silently.
     *
     * Discipline: every top-level binding carries the `ix` prefix, because the whole
     * client bundle is one function scope and a reused top-level name is a fatal
     * redeclaration. React/hooks come from `./icons.js`; no new dependency.
     */





    /**
     * Copy owned by this registration, merged into the shared dictionary at load
     * time. `view.graph` labels the session view slot itself (the host renders the
     * label next to 对话 / 轨迹), so it must resolve to a non-empty string.
     */
    const IX_VIEW_LOCALE = {
      zh: { 'view.graph': '代码图谱' },
      en: { 'view.graph': 'Code graph' },
    };
    mergeDict(IX_VIEW_LOCALE);

    /**
     * Register the `conversation.view` slot that renders the GraphView for one
     * session.
     *
     * Slot shape (frozen by INTERFACES-v3 §2.5):
     *   - `name: 'conversation.view'`, `id: 'codeslice:graph'`, `order: 20`;
     *   - `label: () => t('view.graph')` — a function, and it must resolve to a
     *     non-empty string, otherwise the host renders no tab at all;
     *   - `locale: 'codeslice'`;
     *   - `children: { 'codeslice.graph.view': { kind: 'single', scope: 'session' } }`;
     *   - `inject(sessionId)` hands the session id into the mounted view.
     *
     * @param ctx - the client context.
     * @param t - the bound translator, carrying `.locale`.
     * @param onOpenFile - bridge `(props, target)` handed to GraphView's
     *   `onOpenFile`; the integration side opens the reader tab.
     * @returns true when the slot was registered; false when the registry is
     *   unavailable or the registration threw (warned explicitly).
     */
    function ixRegisterConversationView(ctx, t, onOpenFile) {
      const slots = (ctx && typeof ctx.get === 'function' ? ctx.get('slots') : undefined) ?? ctx.slots;
      if (slots === undefined || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
        try { ctx?.logger?.warn?.('codeslice: conversation view slot is unavailable; the graph view is not registered'); } catch { /* noop */ }
        return false;
      }

      try {
        ctx.effect(() => slots.inject('conversation.view', () => slots.register({
          name: 'conversation.view',
          id: 'codeslice:graph',
          order: 20,
          label: () => t('view.graph'),
          locale: 'codeslice',
          children: {
            'codeslice.graph.view': { kind: 'single', scope: 'session' },
          },
          inject: (sessionId) => ({ sessionId }),
        }, (properties) => h(GraphView, {
          ...properties,
          ctx,
          t,
          locale: t.locale,
          // The session tab has the same squeeze as the workbench: a docked 332px
          // inspector plus the conversation's right sidebar leaves a ~400px stage.
          // Use the drawer variant there too, so the canvas gets the main panel's
          // full width and the community list stays one click away under 详情.
          railCollapsible: true,
          onOpenFile: (target) => { if (typeof onOpenFile === 'function') onOpenFile(properties, target); },
        }))), 'codeslice: session graph view');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try { ctx?.logger?.warn?.(`codeslice: session graph view registration failed: ${message}`); } catch { /* noop */ }
        return false;
      }
    }

    /* ================================================================ *
     * styles-chat.js
     * ================================================================ */
    /**
     * The workbench's stylesheet fragment.
     *
     * Registered through `styles.js` rather than appended to its `CSS` literal, for
     * the same reason the dictionary is split: one literal with two authors is a
     * merge conflict on every edit, and the loser's block disappears silently.
     *
     * Same discipline as the shell sheet, checked by `dev/build-client.mjs`:
     *   - every selector starts with `cs-`;
     *   - no `:root`, `body`, `html`, `*`, `!important`, no bare element selector;
     *   - colours only `--dsw-alias-*` / `--dsw-specific-sidebar-fill`, derived with
     *     `color-mix` when a tint is needed — no literal colour values anywhere;
     *   - widths are measured in JS, never with `@container` (an unnamed container
     *     query matches whatever box happens to be nearest).
     */



    const CHAT_CSS = `
    /* ---------------------------------------------------------------- *
     * Workbench shell                                                  *
     * ---------------------------------------------------------------- */
    .cs-wb {
      display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
      background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
    }
    .cs-wb-bar {
      display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; min-height: 32px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-wb-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-wb-pane { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    /* A parked segment keeps its component mounted so the conversation's draft and
       its in-flight answer survive the switch; only its box goes away. */
    .cs-wb-pane.cs-wb-hidden { display: none; }
    .cs-wb-missing {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; padding: 24px 16px; text-align: center; flex: 1 1 auto;
      font-size: 11.5px; color: var(--dsw-alias-label-secondary);
    }

    /* ---------------------------------------------------------------- *
     * Left-sidebar entry and conversation composer bar                 *
     * ---------------------------------------------------------------- */
    .cs-nav-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; color: currentColor;
    }

    /* The reference row sits immediately above the composer. It must read as part
       of the composer, not as another banner: one line, quiet, and only the range
       carries the brand tint. */
    .cs-bar-wrap { padding: 0 2px; }
    .cs-bar {
      display: flex; align-items: center; gap: 6px; min-width: 0;
      padding: 2px 6px; font-size: 10.5px;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-bar-ref {
      display: inline-flex; align-items: center; gap: 5px; min-width: 0;
      max-width: 60%; padding: 1px 4px; border: 0; border-radius: 4px;
      background: transparent; color: inherit; font: inherit; cursor: pointer;
    }
    .cs-bar .cs-bar-ref { flex: 0 1 auto; max-width: 46%; }
    /* The right-hand actions are two compact pills; keeping them on one line is
       what stops 生成笔记 from wrapping to 生成笔/记 when a path is long. */
    .cs-bar .cs-btn { flex: 0 0 auto; white-space: nowrap; }
    .cs-bar-ref:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
    .cs-bar-ref:disabled { cursor: default; opacity: .72; }
    .cs-bar.cs-bound .cs-bar-ref { color: var(--dsw-alias-brand-primary); }
    .cs-bar-note { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 45%; }
    .cs-bar-note.cs-ok { color: var(--dsw-alias-state-success-primary); }
    .cs-bar-note.cs-warn { color: var(--dsw-alias-state-warn-primary); }
    .cs-bar-note.cs-bad { color: var(--dsw-alias-state-error-primary); }

    /* The context switch mirrors the desktop composer: a quiet outline when off,
       and a filled blue pill when the project's relationships are in play. */
    .cs-btn.cs-ghost.cs-context {
      border-color: var(--dsw-alias-border-l1);
      color: var(--dsw-alias-label-secondary);
      white-space: nowrap;
    }
    .cs-btn.cs-ghost.cs-context:hover {
      border-color: color-mix(in srgb, #2563eb 45%, var(--dsw-alias-border-l1));
      color: #2563eb;
    }
    .cs-btn.cs-ghost.cs-context.is-on {
      border-color: #2563eb;
      background: #2563eb;
      color: #fff;
    }
    .cs-btn.cs-ghost.cs-context.is-on:hover {
      background: #1d4ed8;
      border-color: #1d4ed8;
      color: #fff;
    }
    .cs-context[disabled] { opacity: .6; }

    /* ---------------------------------------------------------------- *
     * CodeSlice workspace (main panel and conversation view)           *
     * ---------------------------------------------------------------- */
    .cs-ws {
      display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
      background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
    }
    .cs-ws-bar {
      display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
      padding: 6px 10px; min-height: 38px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-ws-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }
    .cs-ws-tabs { display: inline-flex; align-items: center; gap: 2px; }
    .cs-ws-tabs > button {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px; border: 1px solid transparent; border-radius: 6px;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font-size: 11.5px; cursor: pointer;
    }
    .cs-ws-tabs > button:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
    .cs-ws-tabs > button.cs-on {
      color: var(--dsw-alias-brand-primary);
      border-color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
    }
    .cs-ws-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-ws-split { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-ws-fill { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .cs-ws-code, .cs-ws-graph, .cs-ws-notes { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }

    .cs-ws-files {
      display: flex; flex-direction: column; flex: 0 0 240px; min-width: 180px;
      border-right: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-ws-files-head { display: flex; align-items: center; gap: 6px; padding: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
    .cs-ws-search { flex: 1 1 auto; min-width: 0; }
    .cs-ws-file-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 3px; }
    .cs-ws-file {
      display: flex; align-items: center; gap: 6px; width: 100%;
      padding: 3px 6px; border: 0; border-radius: 5px;
      background: transparent; color: inherit; font-size: 11px; text-align: left; cursor: pointer;
    }
    .cs-ws-file:hover { background: var(--dsw-alias-bg-layer-2); }
    .cs-ws-file.cs-on { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }
    .cs-ws-file > .cs-dim { margin-left: auto; font-size: 10px; }
    .cs-ws-error {
      display: flex; align-items: center; gap: 5px; padding: 6px;
      font-size: 10.5px; color: var(--dsw-alias-state-error-primary);
    }
    .cs-ws-foot {
      display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
      padding: 4px 8px; min-height: 30px; font-size: 10.5px;
      color: var(--dsw-alias-label-secondary);
      border-top: 1px solid var(--dsw-alias-border-l1);
    }
    .cs-ws-settings { padding: 14px 16px; overflow: auto; }
    .cs-ws-loading { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); }
    .cs-ws-settings-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
    .cs-ws-settings-head b { font-size: 13px; }
    .cs-ws-settings-head .cs-dim { font-size: 11px; }
    .cs-ws-section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
    .cs-ws-section:last-child { border-bottom: 0; margin-bottom: 0; }
    .cs-ws-prompt { min-height: 96px; resize: vertical; line-height: 1.5; }
    .cs-ws-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 14px; }
    .cs-ws-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
    .cs-ws-field .cs-dim { font-size: 10px; }
    .cs-ws-checks { display: flex; gap: 16px; margin-top: 14px; font-size: 11.5px; }
    .cs-ws-check { display: inline-flex; align-items: center; gap: 6px; }
    .cs-ws-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
    .cs-ws-notice { margin-top: 12px; font-size: 11.5px; }
    .cs-ws-notice.cs-ok { color: var(--dsw-alias-state-success-primary); }
    .cs-ws-notice.cs-bad { color: var(--dsw-alias-state-error-primary); }

    /* ---------------------------------------------------------------- *
     * Conversation                                                     *
     * ---------------------------------------------------------------- */
    .cs-chat { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
    .cs-chat-bar {
      display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; min-height: 32px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-chat-heading {
      flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px;
    }
    .cs-chat-name {
      font-size: 11.5px; font-weight: 600; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-chat-sub {
      font-size: 10px; min-width: 0;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .cs-chat-scroll {
      display: flex; flex-direction: column; gap: 10px;
      flex: 1 1 auto; min-height: 0; min-width: 0;
      overflow: auto; overscroll-behavior: contain;
      padding: 10px 10px 14px;
    }

    .cs-chat-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; flex: 1 1 auto; padding: 22px 12px; text-align: center;
      color: var(--dsw-alias-label-secondary); font-size: 11.5px;
    }
    .cs-chat-empty b { color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; }
    .cs-chat-empty p { margin: 0; max-width: 40ch; line-height: 1.6; }
    .cs-chat-empty .cs-chat-spark { opacity: .55; }
    .cs-chat-suggest {
      display: flex; flex-direction: column; gap: 5px; width: 100%; max-width: 420px;
      margin-top: 4px;
    }
    .cs-chat-suggest > button {
      display: flex; align-items: flex-start; gap: 6px; width: 100%;
      padding: 6px 9px; text-align: left; font: inherit; font-size: 11.5px; line-height: 1.5;
      cursor: pointer; color: var(--dsw-alias-label-primary);
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-chat-suggest > button:hover {
      border-color: var(--dsw-alias-brand-primary);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
    }
    .cs-chat-suggest > button > span { flex: 0 0 auto; margin-top: 2px; color: var(--dsw-alias-label-secondary); }

    /* ---- one message ------------------------------------------------- */
    .cs-msg { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .cs-msg-role {
      display: flex; align-items: center; gap: 4px;
      font-size: 9.5px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--dsw-alias-label-secondary);
    }
    .cs-msg-role > span { display: flex; }
    .cs-msg-body {
      padding: 6px 9px; border-radius: 8px; min-width: 0;
      border: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
      overflow-wrap: anywhere; font-size: 12px; line-height: 1.7;
    }
    .cs-msg.cs-user .cs-msg-body {
      white-space: pre-wrap;
      border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, var(--dsw-alias-border-l1));
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent);
    }
    .cs-msg.cs-assistant .cs-msg-body { background: transparent; }
    .cs-msg.cs-assistant .cs-msg-body .cs-md { font-size: 12px; }
    .cs-msg-failed {
      display: flex; align-items: flex-start; gap: 5px; padding: 5px 8px;
      border-radius: 6px; font-size: 11px; line-height: 1.55;
      color: var(--dsw-alias-state-error-primary);
      background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
    }
    .cs-msg-failed > span { flex: 0 0 auto; display: flex; margin-top: 1px; }

    .cs-chat-caret {
      display: inline-block; width: 2px; height: 12px; margin-left: 2px;
      vertical-align: -2px; background: var(--dsw-alias-brand-primary);
      animation: cs-chat-blink 1s step-end infinite;
    }
    @keyframes cs-chat-blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .cs-chat-caret { animation: none; } }

    .cs-chat-cites {
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding-top: 1px;
    }
    .cs-chat-actrow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }

    .cs-chat-retrieval {
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
      font-size: 10px; color: var(--dsw-alias-label-secondary);
    }
    .cs-chat-retrieval > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ---- notices ------------------------------------------------------ */
    .cs-chat-banner {
      display: flex; align-items: flex-start; gap: 6px; flex: 0 0 auto;
      padding: 5px 8px; font-size: 11px; line-height: 1.5;
      background: var(--dsw-alias-bg-layer-1);
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      color: var(--dsw-alias-state-error-primary);
    }
    .cs-chat-banner.cs-ok { color: var(--dsw-alias-state-success-primary); }
    .cs-chat-banner.cs-warn { color: var(--dsw-alias-state-warn-primary); }
    .cs-chat-banner > span { flex: 1 1 auto; min-width: 0; }
    .cs-chat-banner > svg { flex: 0 0 auto; margin-top: 1px; }

    /* ---- composer ----------------------------------------------------- */
    .cs-chat-composer {
      display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto;
      padding: 6px 8px 8px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-chat-hint {
      display: flex; align-items: center; gap: 5px;
      font-size: 10px; color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-chat-hint.cs-bound { color: var(--dsw-alias-brand-primary); }
    .cs-chat-inputrow { display: flex; align-items: flex-end; gap: 5px; }
    .cs-chat-input {
      flex: 1 1 auto; min-width: 0; min-height: 34px; max-height: 180px;
      padding: 6px 8px; resize: none; font: inherit; font-size: 12px; line-height: 1.55;
      color: inherit; background: var(--dsw-alias-bg-base);
      border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
    }
    .cs-chat-input::placeholder { color: var(--dsw-alias-label-secondary); }
    .cs-chat-input:focus {
      outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px;
      border-color: transparent;
    }
    .cs-chat-input[disabled] { opacity: .6; }
    .cs-chat-keyhint {
      display: flex; align-items: center; gap: 4px;
      font-size: 9.5px; color: var(--dsw-alias-label-secondary);
    }
    .cs-chat-key {
      padding: 0 4px; border-radius: 3px; font-size: 9px; line-height: 14px;
      border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
    }
    .cs-chat-stop {
      border-color: var(--dsw-alias-state-error-primary);
      color: var(--dsw-alias-state-error-primary);
      background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
    }

    /* ---------------------------------------------------------------- *
     * Code pane                                                        *
     * ---------------------------------------------------------------- */
    .cs-code { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
    .cs-code-bar {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 0 0 auto;
      padding: 5px 8px; min-height: 32px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-code-path {
      flex: 1 1 auto; min-width: 0; font-size: 11px;
      direction: rtl; text-align: left;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* The CodeMirror host. CodeMirror owns the scroller and the theme; this box
       only decides how much room the reader gets. */
    .cs-code-editor {
      flex: 1 1 auto; min-height: 0; min-width: 0; position: relative; overflow: hidden;
    }
    .cs-code-editor .cm-editor { height: 100%; }
    .cs-code-editor .cm-scroller { overscroll-behavior: contain; }
    .cs-code-loading {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      font-size: 11.5px; color: var(--dsw-alias-label-secondary);
      background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, transparent);
    }

    /* the floating action bar under a selection */
    .cs-code-sel {
      display: flex; align-items: center; gap: 5px; flex-wrap: wrap; flex: 0 0 auto;
      padding: 5px 8px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1));
    }
    .cs-code-sel-label {
      flex: 1 1 auto; min-width: 0; font-size: 10.5px;
      font-variant-numeric: tabular-nums;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cs-code-sel-label b { color: var(--dsw-alias-brand-primary); font-weight: 600; }

    .cs-code-noteform {
      display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto;
      padding: 6px 8px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .cs-code-noteform .cs-row { gap: 4px; }

    .cs-code-hint {
      display: flex; align-items: center; gap: 5px; flex: 0 0 auto;
      padding: 3px 8px; font-size: 10px;
      color: var(--dsw-alias-label-secondary);
      border-top: 1px solid var(--dsw-alias-border-l1);
    }

    .cs-code-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; flex: 1 1 auto; padding: 26px 18px; text-align: center;
      color: var(--dsw-alias-label-secondary); font-size: 11.5px;
    }
    .cs-code-empty b { color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; }
    .cs-code-empty p { margin: 0; max-width: 42ch; line-height: 1.6; }
    `;

    registerStyles(CHAT_CSS);

    /* ================================================================ *
     * index.js
     * ================================================================ */



















    // Side-effect modules: they contribute copy and styles through the same
    // registration seams the shell uses, so adding a feature never edits a file
    // another feature is editing.



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
    function __apply(ctx) {
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

    /* ================================================================ *
     * outline-panel.js
     * ================================================================ */







    /**
     * The `codeslice:outline` tab.
     *
     * One file at a time: declarations, imports, rationale, and what imports this
     * file. Clicking any row opens the file at its line through the host's own
     * `path#L<n>` grammar.
     *
     * The file picker is a *filtered list*, not a tree: the host already owns a file
     * tree, so duplicating it here would mean two navigation models for one
     * workspace. `files` is a flat, filterable projection by design (`WIRE.md §8`),
     * and that is exactly the shape a combobox needs.
     *
     * The tab is registered with `dedupeKey: tab => tab.path` (spec §7, the reference
     * uses the same trick for its editor tab), so two files means two tabs, each
     * pinned to its own path — which is why `path` is read from the tab descriptor
     * and never guessed.
     */

    /** Rows shown in the picker before it becomes a scroll problem. */
    const PICKER_LIMIT = 60;

    /**
     * @param props - `{ctx, store, scope, tab, visible, onOpenFile, t, locale}`.
     *   `tab.path` is the pinned file, when the host opened the tab for one;
     *   `visible === false` stops fetching; `onOpenFile(path)` is the fallback
     *   opener when the sidebar service is absent.
     * @returns the panel.
     */
    function OutlinePanel(props) {
      const {
        ctx, scope, tab, visible, onOpenFile, t, locale,
      } = props;
      const parked = visible === false;

      const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
      const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

      const pinned = tab && typeof tab.path === 'string' && tab.path !== '' ? tab.path : undefined;
      const [path, setPath] = useState(pinned);
      const [outline, setOutline] = useState(undefined);
      const [files, setFiles] = useState([]);
      const [pickerOpen, setPickerOpen] = useState(pinned === undefined);
      const [filter, setFilter] = useState('');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(undefined);
      const alive = useRef(true);
      const filterRef = useRef(null);

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      useEffect(() => {
        if (pinned !== undefined) setPath(pinned);
      }, [pinned]);

      /* ---- file list, only while the picker is needed ---- */

      useEffect(() => {
        if (parked || !pickerOpen || files.length > 0) return;
        let cancelled = false;
        (async () => {
          try {
            const value = await call('files', { limit: 800 });
            if (!cancelled && alive.current) setFiles(Array.isArray(value.files) ? value.files : []);
          } catch (caught) {
            if (!cancelled && alive.current) setError(caught && caught.message ? caught.message : String(caught));
          }
        })();
        return () => { cancelled = true; };
      }, [parked, pickerOpen, files.length, call]);

      /* ---- outline ---- */

      useEffect(() => {
        if (parked || path === undefined) {
          if (path === undefined) setOutline(undefined);
          return undefined;
        }
        let cancelled = false;
        const controller = new AbortController();
        setLoading(true);
        setError(undefined);
        (async () => {
          try {
            const value = await call('outline', { path }, controller.signal);
            if (!cancelled && alive.current) setOutline(value);
          } catch (caught) {
            if (cancelled || !alive.current) return;
            if (caught && caught.name === 'AbortError') return;
            setError(caught && caught.message ? caught.message : String(caught));
          } finally {
            if (!cancelled && alive.current) setLoading(false);
          }
        })();
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [parked, path, call]);

      const open = useCallback((target, line) => {
        if (typeof target !== 'string' || target === '') return;
        const sidebar = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
        const address = line === undefined || line === null ? target : `${target}#L${line}`;
        try {
          if (sidebar && typeof sidebar.openFile === 'function' && scope !== undefined) {
            sidebar.openFile(scope, address);
            return;
          }
        } catch {
          // Fall through.
        }
        if (typeof onOpenFile === 'function') onOpenFile(target);
      }, [ctx, scope, onOpenFile]);

      const pick = useCallback((next) => {
        setPath(next);
        setPickerOpen(false);
        setFilter('');
      }, []);

      const filtered = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        const rows = needle === '' ? files : files.filter((row) => String(row.path).toLowerCase().includes(needle));
        return rows.slice(0, PICKER_LIMIT);
      }, [files, filter]);

      /* ---- picker view ---- */

      if (path === undefined || pickerOpen) {
        return h('div', { className: 'cs-root' },
          h('div', { className: 'cs-bar' },
            h('div', { className: 'cs-search' },
              h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
              h('input', {
                ref: filterRef,
                className: 'cs-input',
                type: 'search',
                value: filter,
                autoFocus: pickerOpen && path === undefined ? true : undefined,
                placeholder: t('outline.search'),
                'aria-label': t('outline.search'),
                onChange: (event) => setFilter(event.target.value),
              })),
            path === undefined ? null : h('button', {
              type: 'button', className: 'cs-btn cs-small', onClick: () => setPickerOpen(false),
            }, t('common.cancel'))),
          error === undefined ? null : h('div', { className: 'cs-banner' },
            Glyph.alert(13),
            h('span', { className: 'cs-grow' }, error)),
          filtered.length === 0
            ? h('div', { className: 'cs-empty' }, t(files.length === 0 ? 'common.loading' : 'graph.search.empty'))
            : h('div', { className: 'cs-col', style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto' } },
              filtered.map((row) => h('button', {
                key: row.path,
                type: 'button',
                className: 'cs-item',
                title: row.path,
                onClick: () => pick(row.path),
              },
              Glyph.file(12),
              h('span', { className: 'cs-name cs-ellipsis' }, baseName(row.path)),
              h('span', { className: 'cs-where' }, row.path),
              h('span', { className: 'cs-meta' }, formatInt(row.symbols ?? 0, locale))))));
      }

      const symbols = outline?.symbols ?? [];
      const imports = outline?.imports ?? [];
      const importedBy = outline?.importedBy ?? [];
      const rationale = outline?.rationale ?? [];

      return h('div', { className: 'cs-root' },
        h('div', { className: 'cs-bar' },
          h('button', {
            type: 'button',
            className: 'cs-iconbtn',
            title: t('outline.pick'),
            'aria-label': t('outline.pick'),
            onClick: () => setPickerOpen(true),
          }, Glyph.back(14)),
          h('span', { className: 'cs-grow cs-mono cs-ellipsis', style: { fontSize: '11px' }, title: path }, path),
          h('span', { className: 'cs-tag' }, outline?.language ?? ''),
          symbols.length === 0 ? null : h('span', { className: 'cs-tag cs-tabular' }, formatInt(symbols.length, locale))),

        loading ? h('div', { className: 'cs-bar cs-sub' }, h('span', { className: 'cs-spin' }, Glyph.spinner(11)), t('outline.loading')) : null,

        error === undefined ? null : h('div', { className: 'cs-banner' },
          Glyph.alert(13),
          h('span', { className: 'cs-grow' }, error)),

        outline !== undefined && outline.found === false
          ? h('div', { className: 'cs-empty' }, h('b', null, t('outline.notFound')))
          : h('div', { className: 'cs-outline' },
            h('div', { className: 'cs-grow', style: { minHeight: 0, overflow: 'auto' } },
              h('div', { className: 'cs-section-head' },
                h('span', { className: 'cs-grow' }, t('outline.declarations')),
                h('span', { className: 'cs-muted' }, t('outline.hint'))),
              symbols.length === 0
                ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '14px 10px' } }, t('outline.empty'))
                : symbols.map((symbol, index) => h('button', {
                  key: symbol.id ?? `${index}`,
                  type: 'button',
                  className: 'cs-sym-row',
                  title: symbol.signature === undefined || symbol.signature === '' ? symbol.name : symbol.signature,
                  onClick: () => open(path, symbol.line),
                },
                h('span', { className: `cs-kind cs-k-${symbol.kind ?? 'function'}` }, kindLabel(symbol.kind, locale)),
                h('span', { className: 'cs-sym-name' }, symbol.name),
                h('span', { className: 'cs-sym-sig' }, symbol.signature ?? ''),
                h('span', { className: 'cs-sym-line' }, `L${symbol.line ?? 1}`))),

              imports.length === 0 ? null : h('div', null,
                h('div', { className: 'cs-section-head' }, h('span', { className: 'cs-grow' }, t('outline.imports'))),
                imports.map((row, index) => h('div', { key: `${row.module}:${index}`, className: 'cs-import-row' },
                  h('span', { className: 'cs-imp-name cs-ellipsis' }, row.module),
                  h('span', { className: 'cs-imp-line' }, row.line === undefined ? '' : `L${row.line}`),
                  h('span', { className: 'cs-grow' }),
                  row.resolved === null || row.resolved === undefined
                    ? h('span', { className: 'cs-tag' }, t('kind.module'))
                    : h('button', {
                      type: 'button',
                      className: 'cs-btn cs-ghost cs-small cs-ellipsis',
                      title: row.resolved,
                      onClick: () => open(row.resolved),
                    }, Glyph.open(11), baseName(row.resolved))))),

              importedBy.length === 0 ? null : h('div', null,
                h('div', { className: 'cs-section-head' }, h('span', { className: 'cs-grow' }, t('outline.importedBy'))),
                importedBy.map((row) => h('button', {
                  key: row,
                  type: 'button',
                  className: 'cs-sym-row',
                  title: row,
                  onClick: () => open(row),
                }, Glyph.file(12), h('span', { className: 'cs-sym-name cs-ellipsis' }, baseName(row)), h('span', { className: 'cs-sym-sig' }, row)))),

              rationale.length === 0 ? null : h('div', null,
                h('div', { className: 'cs-section-head' }, h('span', { className: 'cs-grow' }, t('outline.rationale'))),
                rationale.map((row, index) => h('div', {
                  key: `${row.line}:${index}`,
                  className: `cs-rationale${row.origin === 'docstring' ? '' : ' cs-quiet'}`,
                }, row.text))))));
    }

    /** The last path segment — what a narrow row can actually show. */
    function baseName(path) {
      const text = String(path ?? '');
      const cut = text.lastIndexOf('/');
      return cut < 0 ? text : text.slice(cut + 1);
    }

    /* ================================================================ *
     * workspace-panel.js
     * ================================================================ */
    /**
     * Legacy workspace panel — retained as a thin compatibility shim.
     *
     * v3 moved the main surface to the workbench (`workbench/pages.js`): its notes
     * library, project register, note graph and settings page live there. The code
     * pane, the graph tab and the hand-written settings form this file used to own
     * are gone; their replacements are the sidebar reader, the session graph view
     * and the workbench settings page.
     *
     * The export stays so any older reference still resolves, but no new surface
     * should be added here.
     */




    /**
     * Compat wrapper delegating to the v3 workbench page.
     * @param props - standard slot props plus `{ctx, t, locale, visible}`.
     * @returns the workbench node.
     */
    function WorkspacePanel(props) {
      return h(WorkbenchPage, props);
    }

    return {
      inject: ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) { return __apply(ctx); },
    };
  },
});
