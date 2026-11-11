/**
 * Host half of the CodeSlice bundle.
 *
 * Responsibilities, in order of importance:
 *   1. Own one lazily built, cached source index per workspace root.
 *   2. Serve that index to the Client half over `/codeslice/api/*`.
 *   3. Register the read-only analysis tools the model can call.
 *
 * Deliberately absent: file writes, terminal access, command approval. The
 * Harness already owns those capabilities and its own sandbox; a plugin that
 * reimplemented them would be a bypass, not a feature. Every tool here only
 * reads source it was already allowed to walk.
 */

import { resolve } from 'node:path';

import { cachePathFor, loadOrBuildIndex, buildIndex } from './lib/indexer.js';
import {
  callGraph, callersAtDepth, fileOutline, findSymbols, graphSlice,
  inheritance, packageUsage, search, summarize,
} from './lib/query.js';

/**
 * Defaults for the row config. No `Config` export on purpose: this bundle
 * declares no dependencies, so it must not require a schema library that
 * happens to live in the profile today. `apply` reads the row defensively
 * instead, which also keeps a hand-edited patch from failing to activate.
 */
const CONFIG_DEFAULTS = {
  maxFiles: 8000,
  maxFileBytes: 524288,
  maxDepth: 24,
  cacheTtlMs: 600000,
};

/** Per-root index cache. Keys are lower-cased absolute paths. */
const caches = new Map();

/**
 * Get (or build) the index for one root, memoised in memory and on disk.
 * Concurrent callers for the same root share one build.
 * @param root - absolute directory.
 * @param options - index limits plus `force`.
 * @returns the index document.
 */
async function indexFor(root, options = {}) {
  const abs = resolve(root);
  const key = abs.toLowerCase();
  const existing = caches.get(key);
  const ttl = options.cacheTtlMs ?? CONFIG_DEFAULTS.cacheTtlMs;

  if (existing !== undefined && options.force !== true) {
    if (existing.pending !== undefined) return existing.pending;
    if (existing.root === abs && Date.now() - existing.builtAt < ttl) return existing;
  }

  const pending = loadOrBuildIndex(abs, {
    maxFiles: options.maxFiles,
    maxFileBytes: options.maxFileBytes,
    maxDepth: options.maxDepth,
    maxAgeMs: ttl,
    force: options.force === true,
  }).then(({ index, cached }) => {
    const document = Object.assign(index, {
      __cached: cached,
      __cachePath: cachePathFor(abs),
    });
    caches.set(key, document);
    return document;
  }).catch((error) => {
    caches.delete(key);
    throw error;
  });

  caches.set(key, { root: abs, builtAt: 0, pending });
  return pending;
}

/** Resolve the workspace root for one request, refusing an empty one. */
function resolveRoot(requested, fallback) {
  const candidate = typeof requested === 'string' && requested.trim() !== ''
    ? requested.trim()
    : fallback;
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error('no workspace directory is available; pass `root` explicitly');
  }
  return resolve(candidate);
}

/* ------------------------------------------------------------------ *
 * Tool definitions                                                   *
 * ------------------------------------------------------------------ */

/** A plain text content block. */
function text(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

/** Truncate a long list for a model-facing summary. */
function clip(rows, limit) {
  return rows.length <= limit ? rows : rows.slice(0, limit);
}

/** Shape every tool output the same way: a schema plus a text projection. */
function outputSchema(properties) {
  return {
    schema: { type: 'object', additionalProperties: true, properties },
    render: (_args, value) => text(value),
  };
}

/**
 * Build the tool set. Kept as a factory so a test can construct it without a
 * live Cordis context.
 * @param cwdOf - `(agent) => string`, the calling session's workspace directory.
 * @param config - resolved plugin config.
 * @returns the tool definitions to register.
 */
export function toolDefinitions(cwdOf, config) {
  const options = { ...CONFIG_DEFAULTS, ...config };

  // `exec` carries the calling agent, which is the only authority on which
  // workspace this call is about.
  const withIndex = async (args, exec, run) => {
    const root = resolveRoot(args.root, cwdOf(exec?.agent));
    const index = await indexFor(root, options);
    return run(index, root);
  };

  return [
    {
      name: 'codeslice_outline',
      description: 'List the declarations in one source file of the workspace: functions, classes, methods, types, and the imports that file makes. Use it to understand a file\'s shape before reading it in full.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Workspace-relative path, with forward slashes.' },
          root: { type: 'string', description: 'Optional absolute workspace root; defaults to the session directory.' },
        },
      },
      output: outputSchema({
        path: { type: 'string', required: true },
        found: { type: 'boolean', required: true },
        lines: { type: 'number', required: true },
      }),
      execute: async (args, exec) => withIndex(args, exec, (index) => {
        const outline = fileOutline(index, String(args.path).replace(/\\/g, '/'));
        return {
          path: outline.path,
          found: outline.found,
          lines: outline.lines,
          language: outline.language,
          symbols: clip(outline.symbols, 200),
          imports: clip(outline.imports, 120),
          importedBy: clip(outline.importedBy, 120),
        };
      }),
    },
    {
      name: 'codeslice_symbol',
      description: 'Find where a name is declared across the workspace. Returns definition sites with file, line, and enclosing scope, ordered by how likely each one is the canonical definition.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', required: true, description: 'Symbol name, or a fragment of one.' },
          kind: { type: 'string', description: 'Restrict to one kind: function, method, class, interface, type, enum, const.' },
          limit: { type: 'number', description: 'Maximum rows (default 20, cap 100).' },
          root: { type: 'string', description: 'Optional absolute workspace root.' },
        },
      },
      output: outputSchema({ count: { type: 'number', required: true } }),
      execute: async (args, exec) => withIndex(args, exec, (index) => {
        const limit = Math.max(1, Math.min(100, Number(args.limit ?? 20)));
        const rows = findSymbols(index, String(args.query), {
          ...(args.kind === undefined ? {} : { kind: String(args.kind) }),
          limit,
        });
        return { count: rows.length, definitions: rows };
      }),
    },
    {
      name: 'codeslice_callers',
      description: 'Show the call graph around one function: who calls it, and what it calls. Optionally walk N hops of callers to find the entry points that reach it.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true, description: 'The function or method name.' },
          depth: { type: 'number', description: 'Transitive caller hops, 1-4. Default 1 (direct callers only).' },
          root: { type: 'string', description: 'Optional absolute workspace root.' },
        },
      },
      output: outputSchema({ name: { type: 'string', required: true } }),
      execute: async (args, exec) => withIndex(args, exec, (index) => {
        const name = String(args.name);
        const depth = Math.max(1, Math.min(4, Number(args.depth ?? 1)));
        const graph = callGraph(index, name, 'both');
        if (depth === 1) return graph;
        return { ...graph, reachability: callersAtDepth(index, name, depth) };
      }),
    },
    {
      name: 'codeslice_inheritance',
      description: 'Show the class hierarchy around one type: which classes it extends or implements, and which classes extend it.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true, description: 'The class or interface name.' },
          root: { type: 'string', description: 'Optional absolute workspace root.' },
        },
      },
      output: outputSchema({ name: { type: 'string', required: true } }),
      execute: async (args, exec) => withIndex(args, exec, (index) => inheritance(index, String(args.name))),
    },
    {
      name: 'codeslice_search',
      description: 'Search the workspace by declaration name and by file path at the same time. More precise than a text grep when you are looking for the definition of something rather than every mention.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', required: true, description: 'Name fragment or path fragment.' },
          limit: { type: 'number', description: 'Maximum rows per group (default 20, cap 100).' },
          root: { type: 'string', description: 'Optional absolute workspace root.' },
        },
      },
      output: outputSchema({ symbols: { type: 'array', required: true } }),
      execute: async (args, exec) => withIndex(args, exec, (index) => {
        const limit = Math.max(1, Math.min(100, Number(args.limit ?? 20)));
        return search(index, String(args.query), limit);
      }),
    },
    {
      name: 'codeslice_index',
      description: 'Report the state of the workspace index: file and symbol counts, lines of code per language, the most used dependencies, and the most connected symbols. Rebuilds from disk when `refresh` is true.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          refresh: { type: 'boolean', description: 'Rebuild from disk instead of using the cached index.' },
          root: { type: 'string', description: 'Optional absolute workspace root.' },
        },
      },
      output: outputSchema({ root: { type: 'string', required: true } }),
      execute: async (args, exec) => withIndex(
        { ...args, force: args.refresh === true },
        exec,
        (index) => ({
          ...summarize(index),
          topDependencies: packageUsage(index, 15),
          largestDirectories: [...index.dirs].sort((a, b) => b.lines - a.lines).slice(0, 10),
        }),
      ),
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Plugin entry                                                       *
 * ------------------------------------------------------------------ */

/** Read a JSON request body, tolerating an empty one. */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

/** Write one JSON response. */
function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * Cordis plugin body.
 * @param ctx - host context (webServer, tools, workingDirectory, logger).
 * @param rowConfig - the row's config; unknown or missing fields take defaults.
 */
export function apply(ctx, rowConfig = {}) {
  const config = { ...CONFIG_DEFAULTS, ...(rowConfig ?? {}) };

  /** The calling session's workspace directory, as the Host resolved it. */
  const cwdOf = (agent) => {
    const workingDirectory = ctx.get('workingDirectory');
    const session = agent?.session;
    if (session !== undefined) {
      const live = workingDirectory?.get(session);
      if (typeof live === 'string' && live !== '') return live;
      const header = session.header?.cwd;
      if (typeof header === 'string' && header !== '') return header;
    }
    const fallback = workingDirectory?.defaultDirectory;
    return typeof fallback === 'string' && fallback !== '' ? fallback : process.cwd();
  };

  // ---- Analysis tools ----------------------------------------------------
  ctx.inject(['tools'], (tctx) => {
    const tools = tctx.get('tools');
    if (tools === undefined) {
      ctx.logger?.warn?.('codeslice: the tools service is unavailable; analysis tools are not registered');
      return;
    }
    for (const definition of toolDefinitions(cwdOf, config)) {
      ctx.effect(() => tools.register(definition), `codeslice: tool ${definition.name}`);
    }
  });

  // ---- HTTP API ----------------------------------------------------------
  /** One API method. Throws on failure; the route turns that into a 400. */
  const methods = {
    async status(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      return { ...summarize(index), cached: index.__cached === true, cachePath: index.__cachePath };
    },

    async rebuild(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const started = Date.now();
      const index = await indexFor(root, { ...config, force: true });
      return { ...summarize(index), elapsedMs: Date.now() - started };
    },

    async graph(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      return graphSlice(index, {
        scope: payload.scope === 'file' ? 'file' : 'workspace',
        path: typeof payload.path === 'string' ? payload.path.replace(/\\/g, '/') : undefined,
        limit: Number(payload.limit ?? 240),
      });
    },

    async outline(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      const outline = fileOutline(index, String(payload.path ?? '').replace(/\\/g, '/'));
      return { ...outline, symbols: clip(outline.symbols, 400) };
    },

    async search(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      return search(index, String(payload.query ?? ''), Number(payload.limit ?? 30));
    },

    async symbol(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      return {
        definitions: findSymbols(index, String(payload.query ?? ''), {
          ...(payload.kind === undefined ? {} : { kind: String(payload.kind) }),
          limit: Number(payload.limit ?? 30),
        }),
      };
    },

    async callers(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      const name = String(payload.name ?? '');
      const direction = String(payload.direction ?? 'both');
      const depth = Number(payload.depth ?? 1);
      const graph = callGraph(index, name, direction);
      if (depth <= 1) return graph;
      return { ...graph, reachability: callersAtDepth(index, name, depth) };
    },

    async inheritance(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      return inheritance(index, String(payload.name ?? ''));
    },

    async dependencies(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      return { dependencies: packageUsage(index, Number(payload.limit ?? 40)) };
    },

    async files(payload) {
      const root = resolveRoot(payload.root, payload.cwd ?? defaultDir);
      const index = await indexFor(root, config);
      const limit = Math.max(1, Math.min(2000, Number(payload.limit ?? 500)));
      return { files: clip(index.files, limit), total: index.files.length };
    },
  };

  const defaultDir = ctx.get('workingDirectory')?.defaultDirectory;

  ctx.inject(['webServer'], (sctx) => {
    const webServer = sctx.get('webServer');
    const connection = ctx.get('connection');
    if (webServer === undefined) {
      ctx.logger?.warn?.('codeslice: the web server is unavailable; the sidebar panel cannot load data');
      return;
    }

    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/codeslice/api',
      handler: async (req, res) => {
        // The same admission test the harness uses for its own plugin routes:
        // a request from an unadmitted peer must not be able to read the index.
        if (connection !== undefined && connection.requestRejection?.(req) !== undefined) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
          return;
        }

        const url = new URL(req.url ?? '/', 'http://dsh.internal');
        const method = url.pathname.startsWith('/codeslice/api/')
          ? url.pathname.slice('/codeslice/api/'.length)
          : '';

        if (method === '' || method.includes('/')) {
          writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown codeslice API method' } });
          return;
        }

        const handler = Object.hasOwn(methods, method) ? methods[method] : undefined;
        if (handler === undefined) {
          writeJson(res, 404, {
            ok: false,
            error: { code: 'not-found', message: `unknown codeslice API method "${method}"` },
          });
          return;
        }

        const payload = req.method === 'POST'
          ? await readBody(req)
          : Object.fromEntries(url.searchParams);

        try {
          writeJson(res, 200, { ok: true, value: await handler(payload) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger?.warn?.(`codeslice: ${method} failed: ${message}`);
          writeJson(res, 400, { ok: false, error: { code: 'analysis-error', message } });
        }
      },
    }), 'codeslice: /codeslice/api routes');
  });

  // Warm the default workspace in the background so a first panel open is not
  // a cold start. Unref'd: it must never hold the process open.
  if (typeof defaultDir === 'string' && defaultDir !== '') {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        indexFor(defaultDir, config).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger?.warn?.(`codeslice: warm-up indexing failed: ${message}`);
        });
      }, 1500);
      timer.unref?.();
      return () => clearTimeout(timer);
    }, 'codeslice: index warm-up');
  }
}

/** Exported for tests: build one index without a Cordis context. */
export { buildIndex, indexFor };
