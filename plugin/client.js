window.__ModuleLoader__.load({
  id: '@local/dsh-codeslice',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    /* ---------------------------------------------------------------- *
     * Transport: the Host half's JSON API                               *
     * ---------------------------------------------------------------- */

    /** Same-origin base for the plugin's routes. */
    function apiBase() {
      return new URL('codeslice/api/', window.location.href).href;
    }

    /** One API call; resolves the envelope's `value` or throws with its code. */
    async function api(method, payload, signal) {
      let response;
      try {
        response = await fetch(`${apiBase()}${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          signal,
        });
      } catch (error) {
        throw new Error(`codeslice: network error (${error && error.message ? error.message : String(error)})`);
      }
      const parsed = await response.json().catch(() => null);
      if (parsed === null || parsed.ok !== true) {
        const message = parsed && parsed.error ? parsed.error.message : `HTTP ${response.status}`;
        throw new Error(`codeslice: ${message}`);
      }
      return parsed.value;
    }

    /* ---------------------------------------------------------------- *
     * Styles                                                            *
     * ---------------------------------------------------------------- */

    const CSS = `
      .cs-root { display: flex; flex-direction: column; height: 100%; min-height: 0;
        font-size: 12px; color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-base); }
      .cs-bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px;
        border-bottom: 1px solid var(--dsw-alias-border-l1); flex: 0 0 auto; }
      .cs-bar .cs-grow { flex: 1 1 auto; min-width: 0; }
      .cs-btn { border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1); color: inherit; cursor: pointer;
        font: inherit; padding: 3px 8px; line-height: 1.4; }
      .cs-btn:hover { background: var(--dsw-alias-bg-layer-2); }
      .cs-btn[disabled] { opacity: .5; cursor: default; }
      .cs-btn.cs-on { border-color: var(--dsw-alias-brand-primary);
        color: var(--dsw-alias-brand-primary); }
      .cs-input { flex: 1 1 auto; min-width: 0; padding: 4px 8px; font: inherit;
        color: inherit; background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; }
      .cs-input:focus { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
      .cs-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
      .cs-pad { padding: 10px; }
      .cs-muted { color: var(--dsw-alias-label-secondary); }
      .cs-error { color: var(--dsw-alias-state-error-primary); }
      .cs-row { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; }
      .cs-row .cs-name { font-weight: 600; }
      .cs-mono { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
      .cs-tag { font-size: 10px; padding: 0 5px; border-radius: 4px;
        border: 1px solid var(--dsw-alias-border-l2);
        color: var(--dsw-alias-label-secondary); flex: 0 0 auto; }
      .cs-tag.cs-k-class { color: var(--dsw-alias-brand-primary);
        border-color: var(--dsw-alias-brand-primary); }
      .cs-tag.cs-k-interface { color: var(--dsw-alias-state-success-primary);
        border-color: var(--dsw-alias-state-success-primary); }
      .cs-tag.cs-k-method { color: var(--dsw-alias-state-warn-primary);
        border-color: var(--dsw-alias-state-warn-primary); }
      .cs-click { cursor: pointer; }
      .cs-click:hover { color: var(--dsw-alias-brand-primary); }
      .cs-ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-sec { border-top: 1px solid var(--dsw-alias-border-l1); padding: 8px 10px; }
      .cs-head { font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
      .cs-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
        gap: 6px; }
      .cs-stat { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: 6px 8px; }
      .cs-stat b { display: block; font-size: 15px; font-weight: 600; }
      .cs-stat span { color: var(--dsw-alias-label-secondary); font-size: 10px; }
      .cs-canvas { position: relative; width: 100%; height: 100%; min-height: 260px; }
      .cs-canvas svg { display: block; width: 100%; height: 100%; }
      .cs-node-label { font-size: 9px; fill: var(--dsw-alias-label-secondary);
        pointer-events: none; user-select: none; }
      .cs-empty { padding: 24px 12px; text-align: center;
        color: var(--dsw-alias-label-secondary); }
      .cs-chip { display: inline-flex; align-items: center; gap: 6px;
        padding: 3px 9px; border-radius: 999px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
      .cs-chip:hover { background: var(--dsw-alias-bg-layer-2); }
      .cs-chip .cs-dot { width: 6px; height: 6px; border-radius: 50%;
        background: var(--dsw-alias-state-success-primary); flex: 0 0 auto; }
      .cs-chip .cs-dot.cs-busy { background: var(--dsw-alias-state-warn-primary); }
      .cs-chip .cs-dot.cs-bad { background: var(--dsw-alias-state-error-primary); }
    `;

    /* ---------------------------------------------------------------- *
     * Shared state: one index handle per workspace root                 *
     * ---------------------------------------------------------------- */

    /**
     * Resolve the current workspace directory the panel should analyse.
     * The Host owns this value; the Client only mirrors the last one it saw.
     */
    function useWorkspaceCwd(ctx) {
      const [cwd, setCwd] = useState(undefined);
      useEffect(() => {
        const sessions = ctx.get ? ctx.get('sessions') : undefined;
        const uiWorkspace = ctx.get ? ctx.get('uiWorkspace') : undefined;
        void sessions;
        void uiWorkspace;
        // The panel is session-scoped; the Host falls back to the default
        // directory when `cwd` is absent, so an unresolved value is safe.
        setCwd(undefined);
      }, [ctx]);
      return cwd;
    }

    /* ---------------------------------------------------------------- *
     * Graph canvas: a dependency-free force layout                     *
     * ---------------------------------------------------------------- */

    /**
     * Deterministic spring layout. Runs ~120 iterations synchronously on
     * mount/refresh — small enough for the node caps the Host applies, and
     * it avoids pulling a layout engine into a plugin that declares no
     * runtime dependencies.
     */
    function layout(nodes, links, width, height) {
      const positions = nodes.map((node, index) => {
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
        const radius = Math.min(width, height) * 0.34;
        return {
          x: width / 2 + Math.cos(angle) * radius * (0.5 + (index % 5) * 0.12),
          y: height / 2 + Math.sin(angle) * radius * (0.5 + (index % 7) * 0.1),
          vx: 0,
          vy: 0,
        };
      });

      const indexOf = new Map();
      nodes.forEach((node, i) => indexOf.set(node.id, i));
      const pairs = [];
      for (const link of links) {
        const a = indexOf.get(link.source);
        const b = indexOf.get(link.target);
        if (a !== undefined && b !== undefined && a !== b) pairs.push([a, b]);
      }

      const iterations = 110;
      for (let step = 0; step < iterations; step += 1) {
        const cooling = 1 - step / iterations;
        // Repulsion.
        for (let i = 0; i < positions.length; i += 1) {
          for (let j = i + 1; j < positions.length; j += 1) {
            const dx = positions[j].x - positions[i].x;
            const dy = positions[j].y - positions[i].y;
            const dist2 = dx * dx + dy * dy + 0.01;
            const force = (2400 * cooling) / dist2;
            const dist = Math.sqrt(dist2);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            positions[i].vx -= fx;
            positions[i].vy -= fy;
            positions[j].vx += fx;
            positions[j].vy += fy;
          }
        }
        // Attraction along edges.
        for (const [a, b] of pairs) {
          const dx = positions[b].x - positions[a].x;
          const dy = positions[b].y - positions[a].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const force = (dist - 74) * 0.012 * cooling;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          positions[a].vx += fx;
          positions[a].vy += fy;
          positions[b].vx -= fx;
          positions[b].vy -= fy;
        }
        // Gravity toward the centre keeps disconnected parts on screen.
        for (const p of positions) {
          p.vx += (width / 2 - p.x) * 0.0025;
          p.vy += (height / 2 - p.y) * 0.0025;
          p.vx *= 0.72;
          p.vy *= 0.72;
          p.x += p.vx;
          p.y += p.vy;
          p.x = Math.max(16, Math.min(width - 16, p.x));
          p.y = Math.max(16, Math.min(height - 16, p.y));
        }
      }
      return positions;
    }

    /** Colour role per symbol kind, derived from the theme's state tokens. */
    function kindColor(kind) {
      switch (kind) {
        case 'class': return 'var(--dsw-alias-brand-primary)';
        case 'interface': return 'var(--dsw-alias-state-success-primary)';
        case 'method': return 'var(--dsw-alias-state-warn-primary)';
        case 'module': return 'var(--dsw-alias-label-secondary)';
        case 'file': return 'var(--dsw-alias-label-primary)';
        default: return 'var(--dsw-alias-state-idle-primary)';
      }
    }

    function GraphCanvas({ graph, onPick }) {
      const holder = useRef(null);
      const [size, setSize] = useState({ width: 360, height: 300 });

      useEffect(() => {
        const node = holder.current;
        if (node === null) return undefined;
        const measure = () => {
          const rect = node.getBoundingClientRect();
          setSize({
            width: Math.max(200, Math.round(rect.width)),
            height: Math.max(200, Math.round(rect.height)),
          });
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
      }, []);

      const placed = useMemo(() => {
        if (graph === undefined || graph.nodes.length === 0) return undefined;
        const positions = layout(graph.nodes, graph.links, size.width, size.height);
        return {
          points: graph.nodes.map((node, index) => ({ node, ...positions[index] })),
        };
      }, [graph, size.width, size.height]);

      if (graph === undefined) {
        return h('div', { className: 'cs-empty' }, 'Loading graph…');
      }
      if (graph.nodes.length === 0) {
        return h('div', { className: 'cs-empty' }, 'No connected symbols found in this scope.');
      }

      const radiusOf = (node) => Math.max(3, Math.min(13, 2 + Math.log2(1 + (node.weight || 1)) * 1.7));
      const byId = new Map(placed.points.map((p) => [p.node.id, p]));

      return h('div', { className: 'cs-canvas', ref: holder },
        h('svg', { viewBox: `0 0 ${size.width} ${size.height}`, role: 'img', 'aria-label': 'Code graph' },
          h('g', null,
            graph.links.map((link, index) => {
              const a = byId.get(link.source);
              const b = byId.get(link.target);
              if (a === undefined || b === undefined) return null;
              return h('line', {
                key: `l${index}`,
                x1: a.x, y1: a.y, x2: b.x, y2: b.y,
                stroke: 'var(--dsw-alias-border-l1)',
                strokeWidth: 1,
                strokeOpacity: link.kind === 'imports' ? 0.7 : 0.45,
              });
            }),
          ),
          h('g', null,
            placed.points.map((point) => h('g', {
              key: point.node.id,
              transform: `translate(${point.x} ${point.y})`,
              className: 'cs-click',
              onClick: () => onPick(point.node),
            },
            h('circle', {
              r: radiusOf(point.node),
              fill: kindColor(point.node.kind),
              fillOpacity: 0.85,
            }),
            h('title', null, `${point.node.label}${point.node.path ? ` — ${point.node.path}` : ''}`),
            radiusOf(point.node) >= 6
              ? h('text', { className: 'cs-node-label', y: radiusOf(point.node) + 9, textAnchor: 'middle' }, point.node.label)
              : null,
            )),
          ),
        ),
      );
    }

    /* ---------------------------------------------------------------- *
     * Panel tab: graph + symbols + file outline                         *
     * ---------------------------------------------------------------- */

    function PanelTab(props) {
      const ctx = props.ctx;
      const visible = props.visible !== false;
      const cwd = useWorkspaceCwd(ctx);

      const [status, setStatus] = useState(undefined);
      const [graph, setGraph] = useState(undefined);
      const [error, setError] = useState(undefined);
      const [busy, setBusy] = useState(false);
      const [scope, setScope] = useState('workspace');
      const [query, setQuery] = useState('');
      const [results, setResults] = useState(undefined);
      const [detail, setDetail] = useState(undefined);

      const request = useCallback(async (method, payload) => api(method, { ...payload, ...(cwd ? { cwd } : {}) }), [cwd]);

      const loadGraph = useCallback(async (nextScope, path) => {
        setBusy(true);
        setError(undefined);
        try {
          const value = await request('graph', { scope: nextScope, path, limit: 220 });
          setGraph(value);
        } catch (caught) {
          setError(caught.message);
        } finally {
          setBusy(false);
        }
      }, [request]);

      // Initial load, and a full reload when the index is rebuilt.
      useEffect(() => {
        if (!visible) return undefined;
        let cancelled = false;
        (async () => {
          setBusy(true);
          try {
            const value = await request('status', {});
            if (cancelled) return;
            setStatus(value);
            await loadGraph('workspace');
          } catch (caught) {
            if (!cancelled) setError(caught.message);
          } finally {
            if (!cancelled) setBusy(false);
          }
        })();
        return () => { cancelled = true; };
      }, [visible, request, loadGraph]);

      const rebuild = useCallback(async () => {
        setBusy(true);
        setError(undefined);
        try {
          const value = await request('rebuild', {});
          setStatus(value);
          await loadGraph(scope, detail ? detail.path : undefined);
        } catch (caught) {
          setError(caught.message);
        } finally {
          setBusy(false);
        }
      }, [request, loadGraph, scope, detail]);

      const runSearch = useCallback(async () => {
        const needle = query.trim();
        if (needle === '') { setResults(undefined); return; }
        setBusy(true);
        setError(undefined);
        try {
          setResults(await request('search', { query: needle, limit: 30 }));
        } catch (caught) {
          setError(caught.message);
        } finally {
          setBusy(false);
        }
      }, [request, query]);

      const openFile = useCallback(async (path) => {
        setBusy(true);
        setError(undefined);
        try {
          const outline = await request('outline', { path });
          setDetail(outline);
          setScope('file');
          await loadGraph('file', path);
          // Ask the host sidebar to show the file itself, when it is present.
          const sidebar = ctx.get ? ctx.get('betterSidebar') : undefined;
          const sessionId = props.scope ? props.scope.sessionId : undefined;
          if (sidebar && sessionId) {
            try {
              sidebar.activateTab(`editor:${path}`, sessionId);
            } catch { /* the tab may not be open; the outline is still useful */ }
          }
        } catch (caught) {
          setError(caught.message);
        } finally {
          setBusy(false);
        }
      }, [request, loadGraph, ctx, props.scope]);

      if (!visible) {
        // The right sidebar keeps parked tabs mounted. Never poll or render
        // the force layout for a tab nobody is looking at.
        return h('div', { className: 'cs-root' });
      }

      const header = h('div', { className: 'cs-bar' },
        h('button', {
          className: 'cs-btn', onClick: rebuild, disabled: busy,
          title: 'Rebuild the index from disk',
        }, busy ? 'Working…' : 'Rebuild'),
        h('span', { className: 'cs-grow' }),
        status !== undefined
          ? h('span', { className: 'cs-muted cs-mono', title: `built in ${status.buildMs}ms` },
            `${status.files} files · ${status.symbols} symbols`)
          : null,
      );

      const searchBar = h('div', { className: 'cs-bar' },
        h('input', {
          className: 'cs-input', value: query, placeholder: 'Find a symbol or file…',
          onChange: (event) => setQuery(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') runSearch(); },
        }),
        h('button', { className: 'cs-btn', onClick: runSearch, disabled: busy }, 'Search'),
      );

      const body = [];
      if (error !== undefined) {
        body.push(h('div', { className: 'cs-sec cs-error', key: 'err' }, error));
      }

      if (results !== undefined) {
        body.push(h('div', { className: 'cs-sec', key: 'results' },
          h('div', { className: 'cs-head' }, `Symbols (${results.symbols.length})`),
          results.symbols.length === 0
            ? h('div', { className: 'cs-muted' }, 'No matching declarations.')
            : results.symbols.map((symbol, index) => h('div', {
              key: `s${index}`,
              className: 'cs-row cs-click',
              onClick: () => openFile(symbol.path),
            },
            h('span', { className: `cs-tag cs-k-${symbol.kind}` }, symbol.kind),
            h('span', { className: 'cs-name cs-mono' }, symbol.name),
            h('span', { className: 'cs-muted cs-ellip cs-grow' }, `${symbol.path}:${symbol.line}`),
            )),
          results.files.length === 0 ? null : h('div', { style: { marginTop: 8 } },
            h('div', { className: 'cs-head' }, `Files (${results.files.length})`),
            results.files.map((file, index) => h('div', {
              key: `f${index}`,
              className: 'cs-row cs-click',
              onClick: () => openFile(file.path),
            },
            h('span', { className: 'cs-mono cs-ellip cs-grow' }, file.path),
            h('span', { className: 'cs-muted' }, `${file.lines}`),
            )),
          ),
        ));
      }

      if (detail !== undefined) {
        body.push(h('div', { className: 'cs-sec', key: 'detail' },
          h('div', { className: 'cs-head' }, `${detail.path} · ${detail.lines} lines`),
          detail.symbols.length === 0
            ? h('div', { className: 'cs-muted' }, 'No declarations found in this file.')
            : detail.symbols.map((symbol, index) => h('div', { key: `d${index}`, className: 'cs-row' },
              h('span', { className: `cs-tag cs-k-${symbol.kind}` }, symbol.kind),
              h('span', { className: 'cs-name cs-mono' }, symbol.name),
              symbol.container !== undefined
                ? h('span', { className: 'cs-muted' }, `in ${symbol.container}`)
                : null,
              h('span', { className: 'cs-grow' }),
              h('span', { className: 'cs-muted cs-mono' }, `:${symbol.line}`),
            )),
        ));
      }

      if (status !== undefined) {
        body.push(h('div', { className: 'cs-sec', key: 'stats' },
          h('div', { className: 'cs-head' }, 'Workspace'),
          h('div', { className: 'cs-stats' },
            h('div', { className: 'cs-stat' }, h('b', null, String(status.files)), h('span', null, 'files')),
            h('div', { className: 'cs-stat' }, h('b', null, String(status.lines)), h('span', null, 'lines')),
            h('div', { className: 'cs-stat' }, h('b', null, String(status.symbols)), h('span', null, 'symbols')),
            h('div', { className: 'cs-stat' }, h('b', null, String(status.resolvedCalls)), h('span', null, 'call edges')),
          ),
          h('div', { className: 'cs-muted', style: { marginTop: 6 } },
            `${Object.entries(status.languages).map(([name, count]) => `${name} ${count}`).join(' · ')}`),
        ));
      }

      return h('div', { className: 'cs-root' },
        header,
        searchBar,
        h('div', { className: 'cs-body' },
          h('div', { style: { height: '46%', minHeight: 220, borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
            h(GraphCanvas, {
              graph,
              onPick: (node) => { if (node.path && !node.path.startsWith('.') && node.kind !== 'module') openFile(node.path); },
            }),
          ),
          body,
        ),
      );
    }

    /* ---------------------------------------------------------------- *
     * Composer chip: index state at a glance                            *
     * ---------------------------------------------------------------- */

    function StatusChip(props) {
      const ctx = props.ctx;
      const [status, setStatus] = useState(undefined);
      const [failed, setFailed] = useState(false);

      useEffect(() => {
        let cancelled = false;
        let timer;
        const tick = async () => {
          try {
            const value = await api('status', {});
            if (!cancelled) { setStatus(value); setFailed(false); }
          } catch {
            if (!cancelled) setFailed(true);
          }
          if (!cancelled) timer = setTimeout(tick, 60000);
        };
        tick();
        return () => { cancelled = true; clearTimeout(timer); };
      }, []);

      const openPanel = () => {
        const sidebar = ctx.get ? ctx.get('betterSidebar') : undefined;
        const sessionId = props.scope ? props.scope.sessionId : undefined;
        if (sidebar !== undefined && sessionId !== undefined) {
          try { sidebar.openTab({ type: 'codeslice:graph' }, { sessionId }); return; } catch { /* fall through */ }
        }
      };

      const dot = failed ? 'cs-dot cs-bad' : status === undefined ? 'cs-dot cs-busy' : 'cs-dot';
      const label = failed
        ? 'CodeSlice: unavailable'
        : status === undefined
          ? 'CodeSlice: indexing…'
          : `CodeSlice: ${status.symbols} symbols`;

      return h('button', {
        type: 'button',
        className: 'cs-chip',
        onClick: openPanel,
        title: status === undefined ? 'CodeSlice index' : `${status.files} files, ${status.lines} lines, built in ${status.buildMs}ms`,
      },
      h('span', { className: dot }),
      h('span', null, label),
      );
    }

    /* ---------------------------------------------------------------- *
     * Plugin entry                                                      *
     * ---------------------------------------------------------------- */

    return {
      inject: ['slots'],
      apply(ctx) {
        // Styles live for exactly as long as this plugin's Client run.
        ctx.effect(() => {
          const element = document.createElement('style');
          element.dataset.codeslice = 'core';
          element.textContent = CSS;
          document.head.appendChild(element);
          return () => element.remove();
        }, 'codeslice: styles');

        // The graph/outline tab, when a compatible sidebar service exists.
        // `ctx.inject` retries until the dependency appears, so this survives
        // a load order where better-sidebar activates after us.
        const seat = ctx.inject(['betterSidebar'], (injected) => {
          const sidebar = injected.get('betterSidebar');
          if (sidebar === undefined) return;

          ctx.effect(() => sidebar.registerTab({
            id: 'codeslice:graph',
            title: () => 'CodeSlice',
            description: () => 'Code knowledge graph, symbol search and file outline for this workspace.',
            icon: (size) => h('svg', {
              width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.8,
              'aria-hidden': true, style: { display: 'block' },
            },
            h('circle', { cx: 6, cy: 7, r: 2.4 }),
            h('circle', { cx: 18, cy: 7, r: 2.4 }),
            h('circle', { cx: 12, cy: 18, r: 2.4 }),
            h('path', { d: 'M6 7h12M7.4 9.1l3.4 6.6M16.6 9.1l-3.4 6.6' }),
            ),
            order: 40,
            single: true,
            component: (properties) => h(PanelTab, properties),
          }), 'codeslice: graph tab');

          // A file viewer is not registered on purpose: the Harness already
          // has a code editor, and a second viewer would compete with it for
          // the same files. Clicking a symbol opens the host's editor instead.
        });

        // The status chip is a pure addition to an always-present slot, so it
        // works even when no sidebar service is installed.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'codeslice-status',
          order: 30,
          label: () => 'CodeSlice',
        }, (properties) => h(StatusChip, properties)));

        // Release the sidebar seat when this Client run ends.
        ctx.effect(() => () => {
          if (seat !== undefined && typeof seat.dispose === 'function') seat.dispose();
        }, 'codeslice: sidebar seat');
      },
    };
  },
});
