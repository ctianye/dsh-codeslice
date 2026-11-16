/**
 * Host half of the CodeSlice bundle.
 *
 * Responsibilities, in order of importance:
 *   1. Own one lazily built, cached code graph per workspace root.
 *   2. Serve it to the browser half over `/codeslice/api/*` (see WIRE.md).
 *   3. Register the read-only analysis tools the model can call.
 *   4. Own the note knowledge base and its anchors.
 *
 * Deliberately absent, and this is the load-bearing design decision: file
 * writes, terminal access, command approval, an agent loop. The Harness owns all
 * of them and its own sandbox; a plugin that reimplemented them would be a
 * bypass, not a feature. Every tool here only reads source it was already
 * allowed to walk, and every write is to the plugin's own state directory.
 */

import { promises as fs } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndexGraph } from './lib/build.js';
import {
  DEFAULT_FAMILIES, KIND_FILE, KIND_RATIONALE, RELATION_IS_ACTIVE,
  baseOf, collapseWhitespace, dirOf,
} from './lib/model.js';
import { detectCommunities, applyCommunities, topologyKey } from './lib/cluster.js';
import {
  graphSlice, nodeContext, rationaleFor, shortestPathText, callersText,
  resolveAnchor, scoreNodes, pickSeeds, renderSubgraphText, expand,
} from './lib/query.js';
import { buildChunkIndex, CHUNKER, searchRecords } from './lib/retrieval.js';
import { definitionsAt, refsTo, definitionsByName, searchDefinitions } from './lib/resolve.js';
import { fromPersisted, toPersisted } from './lib/persist.js';
import {
  DEFAULT_CACHE_TTL_MS, clearIndex, loadIndex, loadLayout, loadNotes, readJson,
  saveIndex, saveLayout, saveNotes, stateDir, statePath, updateNotes,
} from './lib/store.js';
import {
  buildNotesGraph, composeNote, exportNote, exportNotes, fallbackSections, importTitle,
  readRangeDetailed, refreshAnchors, resolveTitle, safeJoin, sectionsFromText, snippetHash,
  splitSections, stripLeadingH1,
} from './lib/notes.js';
// v3: project registry, code frames, and the editable prompt templates.
import { listProjects, rememberProject, renameProject, forgetProject } from './lib/projects.js';
import { listFrames, createFrame, deleteFrame, updateFrameTitle } from './lib/frames.js';
import { showFileAtCommit } from './lib/git.js';
import { readPrompts, savePrompts, resetPrompts, promptsSummary, systemSectionText, setContextEnabled, getContextEnabled } from './lib/prompts.js';
import { generateFrameTitle } from './lib/frametitle.js';
import { createSidebarApi, createSidebarWrite } from './lib/sidebar-api.js';
// v2: the conversation workbench. Each module owns one concern; this file only
// composes them into the method table and the tools list (WIRE-CHAT.md).
import { chatApiMethods } from './lib/api-chat.js';
import { codeApiMethods } from './lib/api-chat.js';
import { ragApiMethods } from './lib/api-chat.js';
import { noteFromChatApiMethods } from './lib/api-chat.js';
import { askHandler } from './lib/api-chat.js';
import { chatToolDefinitions } from './lib/api-chat.js';
import { filesApiMethods, modelsApiMethods, noteFromSessionApiMethods } from './lib/api-chat.js';
import { countConversations } from './lib/chat.js';
import { graphifyGraph } from './lib/graphify.js';
import { readRagSettings } from './lib/rag.js';
import { headCommit } from './lib/git.js';
import { locateCitation } from './lib/locate.js';

/* ------------------------------------------------------------------ *
 * Configuration                                                      *
 * ------------------------------------------------------------------ */

/**
 * Defaults for the row config. No `Config` export on purpose: this bundle
 * declares no dependencies, so it must not require a schema library that
 * happens to live in the profile today. `apply` reads the row defensively, which
 * also keeps a hand-edited patch from failing to activate.
 */
const CONFIG_DEFAULTS = {
  maxFiles: 8000,
  maxFileBytes: 524288,
  maxDepth: 24,
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  /** Fixes the original's JS/TS superclass gap (DESIGN §5.3). */
  superclassJs: true,
  /** Nodes the canvas may receive in one slice. Above this, the slice is
   * aggregated to one node per community instead of being truncated. */
  maxGraphNodes: 5000,
  /** Nothing above this is scanned into chunks (retrieval is for humans, not builds). */
  maxChunkBytes: 262144,
  /** `builtin` keeps the zero-process analyzer; `auto`/`graphify` reuse graphify. */
  graphBackend: 'builtin',
  /** Executable name or absolute path; empty means `graphify` on PATH. */
  graphifyPath: '',
  graphifyTtlMs: 600000,
  graphifyTimeoutMs: 180000,
};

/* ------------------------------------------------------------------ *
 * Client assets                                                      *
 * ------------------------------------------------------------------ */

/**
 * The two heavy browser assets, served from the plugin directory instead of
 * being inlined into `client.js`.
 *
 * The editor pulls CodeMirror and its language packages (megabytes), and
 * vis-network is the renderer graphify itself ships. Both are loaded only when
 * the surface that needs them is opened, and both are allow-listed here — the
 * route never joins a caller-supplied path onto the plugin directory.
 */
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_ASSETS = new Map([
  ['vis-network.min.js', { file: join('client', 'vendor', 'vis-network.min.js'), type: 'text/javascript; charset=utf-8' }],
  ['editor.js', { file: join('client', 'editor.js'), type: 'text/javascript; charset=utf-8' }],
  // The forked Better Sidebar client: the original 0.28.2 bundle plus the
  // lazy chunks it owns. They are served from this plugin's own asset route
  // because the vendored bundle resolves its chunks through it (the upstream
  // `/sidebar/bundle/` route does not exist here). Every name is allow-listed
  // — the route never joins a caller-supplied path onto the plugin directory.
  ['better-sidebar/client.js', { file: join('client', 'vendor', 'better-sidebar', 'client.js'), type: 'text/javascript; charset=utf-8' }],
  // Chunk names as the client asks for them (`editor`, `mermaid`, …); the
  // published files carry a `client-` prefix.
  ['better-sidebar/editor.js', { file: join('client', 'vendor', 'better-sidebar', 'client-editor.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/registry.js', { file: join('client', 'vendor', 'better-sidebar', 'client-registry.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/locale.js', { file: join('client', 'vendor', 'better-sidebar', 'client-locale.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/mermaid.js', { file: join('client', 'vendor', 'better-sidebar', 'client-mermaid.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/terminal.js', { file: join('client', 'vendor', 'better-sidebar', 'client-terminal.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/client-editor.js', { file: join('client', 'vendor', 'better-sidebar', 'client-editor.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/client-registry.js', { file: join('client', 'vendor', 'better-sidebar', 'client-registry.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/client-locale.js', { file: join('client', 'vendor', 'better-sidebar', 'client-locale.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/client-mermaid.js', { file: join('client', 'vendor', 'better-sidebar', 'client-mermaid.js'), type: 'text/javascript; charset=utf-8' }],
  ['better-sidebar/client-terminal.js', { file: join('client', 'vendor', 'better-sidebar', 'client-terminal.js'), type: 'text/javascript; charset=utf-8' }],
]);

/* ------------------------------------------------------------------ *
 * One build per root                                                 *
 * ------------------------------------------------------------------ */

/** Per-root built document, keyed by lower-cased absolute path. */
const builds = new Map();

/**
 * Fingerprint the settings that decide how a document is cut. The on-disk cache
 * is keyed by this too: a document built with a larger `maxFileBytes` parses
 * generated bundles (the client's 1.7 MB editor chunk alone contributes ~1470
 * nodes), and without the fingerprint lowering the limit would keep serving
 * that graph forever — the canvas then shows the bundle instead of the repo.
 * @param config - resolved plugin config.
 * @returns a stable JSON string.
 */
function buildKeyOf(config) {
  return JSON.stringify({
    v: 1,
    maxFiles: config.maxFiles ?? CONFIG_DEFAULTS.maxFiles,
    maxFileBytes: config.maxFileBytes ?? CONFIG_DEFAULTS.maxFileBytes,
    maxDepth: config.maxDepth ?? CONFIG_DEFAULTS.maxDepth,
    superclassJs: config.superclassJs !== false,
    graphBackend: config.graphBackend ?? CONFIG_DEFAULTS.graphBackend,
  });
}

/**
 * Get (or build) the workspace document for one root.
 *
 * Concurrent callers for the same root share one build; a failed build is
 * removed so the next call retries instead of caching the failure.
 * @param root - absolute directory.
 * @param config - resolved plugin config.
 * @param options - `{ force }`.
 * @returns the built document.
 */
async function documentFor(root, config, options = {}) {
  const absolute = resolve(root);
  const key = absolute.toLowerCase();
  const ttl = Number.isFinite(config.cacheTtlMs) ? config.cacheTtlMs : CONFIG_DEFAULTS.cacheTtlMs;
  const buildKey = buildKeyOf(config);

  const existing = builds.get(key);
  if (existing !== undefined && options.force !== true) {
    if (existing.pending !== undefined) return existing.pending;
    if (existing.root === absolute && existing.buildKey === buildKey && Date.now() - existing.builtAt < ttl) return existing;
  }

  const pending = (async () => {
    if (options.force !== true) {
      const cached = await loadIndex(absolute, { maxAgeMs: ttl });
      if (cached !== undefined && cached.document?.buildKey === buildKey) {
        // The persisted document carries only plain arrays; `index` is five Maps
        // and a JSON round trip turns each into `{}`. Rebuild them on load.
        return Object.assign(fromPersisted(cached.document), { __cached: true, __root: absolute });
      }
    }
    const started = Date.now();
    const document = await buildDocument(absolute, config);
    document.buildKey = buildKey;
    document.buildMs = Date.now() - started;
    document.__cached = false;
    document.__root = absolute;
    await saveIndex(absolute, toPersisted(document));
    return document;
  })().catch((error) => {
    builds.delete(key);
    throw error;
  });

  builds.set(key, { root: absolute, builtAt: 0, pending });
  const document = await pending;
  builds.set(key, Object.assign(document, { root: absolute }));
  // A successful build registers (or refreshes) the row in the global project
  // registry. This is bookkeeping, not part of the graph answer: a registry write
  // failure must not lose a build that already succeeded, so it is best-effort
  // here; the `projects` method surfaces registry write failures directly.
  try {
    await rememberProject(document);
  } catch (error) {
    console.warn?.(`codeslice: project registry update skipped: ${error?.message ?? error}`);
  }
  return document;
}

/**
 * Run the whole pipeline for one root: walk → scan → resolve → cluster →
 * chunk-index → topology key.
 * @param root - absolute directory.
 * @param config - resolved plugin config.
 * @returns the document.
 */
async function buildDocument(root, config) {
  const graph = await buildIndexGraph(root, {
    maxFiles: config.maxFiles,
    maxFileBytes: config.maxFileBytes,
    maxDepth: config.maxDepth,
    superclassJs: config.superclassJs !== false,
  });

  // Graphify is the richer AST extractor when the user asks for it. It is
  // optional on purpose: a missing Python toolchain must degrade to the built-in
  // analyzer, never fail the panel. The rest of the pipeline (chunks, retrieval,
  // notes) is shared, so only the node/edge vocabulary changes here.
  let external = null;
  if (config.graphBackend === 'graphify' || config.graphBackend === 'auto') {
    try {
      external = await graphifyGraph(root, config);
    } catch (error) {
      graph.graphifyError = String(error?.message ?? error).slice(0, 500);
    }
  }
  if (external !== null) {
    graph.nodes = external.nodes;
    graph.edges = external.edges;
    graph.communities = external.communities;
    graph.graphSource = 'graphify';
    graph.graphify = external.stats;
  } else {
    const communities = detectCommunities(graph.nodes, graph.edges);
    applyCommunities(graph.nodes, graph.edges, communities);
    graph.communities = communities;
    graph.graphSource = 'builtin';
  }

  const graphKey = topologyKey(graph.nodes, graph.edges);
  graph.topologyKey = graphKey;
  graph.schema = 1;

  // The retrieval corpus is built from the same walk, so "the file exists in the
  // graph" and "the file is searchable" can never disagree.
  //
  // The cut is the desktop chunker's fixed banding (60/220/8000). It is
  // deliberately NOT read from RAG settings: chunk spans are an index identity, so
  // every reader of this workspace must get the same chunks. `topK`/`rrfK` remain
  // per-root settings because they only budget the prompt.
  const sources = [];
  for (const file of graph.files) {
    if (file.skipped !== undefined) continue;
    if (file.bytes > config.maxChunkBytes) continue;
    sources.push({ path: file.path, language: file.language, source: file.source ?? '' });
  }
  const chunks = buildChunkIndex(sources, graph.nodes);
  // Stamped for diagnostics and for a future schema change; no setting is derived
  // from it, so a persisted document cannot alter how a rebuild cuts files.
  graph.chunker = { ...CHUNKER };
  // `postings` is a Map and `index` is five more, none of which survive JSON. Ship
  // the chunk array (plain objects) and rebuild both on load; see lib/persist.js.
  graph.chunks = { chunks: chunks.chunks, version: chunks.version };

  // `source` text is not persisted: it would triple the cache and the panel can
  // read any file it needs through the Host's own file service.
  for (const file of graph.files) delete file.source;
  return graph;
}

/* ------------------------------------------------------------------ *
 * Roots                                                              *
 * ------------------------------------------------------------------ */

/**
 * The calling session's workspace directory, as the Host resolved it.
 * @param ctx - host context.
 * @returns `(agent) => string`.
 */
function makeCwdResolver(ctx) {
  return (agent) => {
    const workingDirectory = ctx.get('workingDirectory');
    const session = agent?.session;
    if (session !== undefined) {
      const live = workingDirectory?.get?.(session);
      if (typeof live === 'string' && live !== '') return live;
      const header = session.header?.cwd;
      if (typeof header === 'string' && header !== '') return header;
    }
    const fallback = workingDirectory?.defaultDirectory;
    return typeof fallback === 'string' && fallback !== '' ? fallback : process.cwd();
  };
}

/** Resolve one request's root, refusing an empty one. */
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
 * Tool schema helpers                                                *
 * ------------------------------------------------------------------ */

/** A plain text content block. */
function text(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

/** Truncate a long list for a model-facing summary. */
function clip(rows, limit) {
  return rows.length <= limit ? rows : rows.slice(0, limit);
}

/**
 * Hoist property-level `required: true` markers onto the owning object.
 *
 * `required` is an object-level keyword only — a nested
 * `properties.x.required` is rejected by the upstream tool-schema validator, so
 * each property's `required: true` marker is hoisted before the schema is sent.
 * @param properties - the loose property map.
 * @returns `{ properties, required? }`.
 */
function hoistRequired(properties) {
  const required = [];
  const cleaned = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value.required === true) required.push(key);
    const { required: _omit, ...rest } = value;
    cleaned[key] = rest;
  }
  return { properties: cleaned, ...(required.length === 0 ? {} : { required }) };
}

/** Shape a tool's input `parameters` with the object-level `required` array. */
function inputSchema(properties) {
  return { type: 'object', additionalProperties: false, ...hoistRequired(properties) };
}

/* ------------------------------------------------------------------ *
 * Tool definitions                                                   *
 * ------------------------------------------------------------------ */

/** The `root` property every tool carries. */
const ROOT_PROP = {
  type: 'string',
  description: 'Optional absolute workspace root; defaults to the session directory.',
};

/**
 * Build the tool set. Kept as a factory so a test can construct it without a
 * live Cordis context.
 * @param cwdOf - `(agent) => string`, the calling session's workspace directory.
 * @param config - resolved plugin config.
 * @returns the tool definitions to register.
 */
export function toolDefinitions(cwdOf, config) {
  const options = { ...CONFIG_DEFAULTS, ...config };

  /** Load the document for one call, then run a projection over it. */
  const withGraph = async (args, exec, run) => {
    const root = resolveRoot(args.root, cwdOf(exec?.agent));
    const document = await documentFor(root, options, { force: args.refresh === true });
    return run(document, root);
  };

  /** Node map, rebuilt per call — the document is immutable, so this is cheap. */
  const nodesById = (document) => new Map(document.nodes.map((node) => [node.id, node]));

  return [
    {
      name: 'codeslice_graph_query',
      description: 'Answer a natural-language question about the codebase from its knowledge graph: scores every node against the question, picks seeds per query term, expands a bounded neighbourhood (BFS for breadth, DFS to follow one chain) and renders it as text with each node\'s edges, relation and confidence. Prefer this over grepping when the question is "how does X work" rather than "where is the string Y".',
      parameters: inputSchema({
        question: { type: 'string', required: true, description: 'The question, in any language. Identifier names and file names in the question score highest.' },
        mode: { type: 'string', description: 'Traversal mode: "bfs" for a broad neighbourhood (default) or "dfs" to follow one chain of calls.' },
        depth: { type: 'number', description: 'Expansion depth, 1-6. Default 3.' },
        tokenBudget: { type: 'number', description: 'Approximate output budget in tokens. Default 2000.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const byId = nodesById(document);
        const question = String(args.question ?? '');
        if (document.nodes.length === 0) return text('项目还没有知识图谱（可能尚未建立索引）。');
        const seeds = pickSeeds(document.nodes, question, document.edges, 3);
        if (seeds.length === 0) return text('图中没有匹配的节点。请使用代码中出现的符号名或文件名提问。');
        const mode = args.mode === 'dfs' ? 'dfs' : 'bfs';
        const depth = Math.max(1, Math.min(6, Number(args.depth ?? 3)));
        const budget = Math.max(200, Math.min(20000, Number(args.tokenBudget ?? 2000)));
        const expanded = expand(byId, document.edges, seeds, mode, depth);
        // `scoreNodes` returns `[{ score, node }]`; the renderer wants an id → score
        // map so it can print a `Relevance:` line per block.
        const scored = new Map(scoreNodes(document.nodes, question, document.edges).map((row) => [row.node.id, row.score]));
        return text(renderSubgraphText(byId, document.edges, expanded, { seeds, scores: scored, tokenBudget: budget }));
      }),
    },
    {
      name: 'codeslice_graph_node',
      description: 'Everything known about one symbol or file: where it is defined, its docstrings and marker comments (the "why"), and every incoming and outgoing relation grouped by kind, with the text render of its bounded neighbourhood. Use it when the question names a specific function, class or file.',
      parameters: inputSchema({
        name: { type: 'string', required: true, description: 'A node id, a symbol name, or a file path (a bare file name matches by suffix).' },
        depth: { type: 'number', description: 'Neighbourhood depth for the rendered context, 1-4. Default 2.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        // `resolveAnchor` returns an id (or null), so the tool that needs the
        // node record goes through `findNode`.
        const node = findNode(document, String(args.name ?? ''));
        if (node === undefined) return text(`node not found: ${String(args.name ?? '')}`);
        const depth = Math.max(1, Math.min(4, Number(args.depth ?? 2)));
        return text(nodeContext(document, node.id, depth, 1200));
      }),
    },
    {
      name: 'codeslice_graph_path',
      description: 'Shortest relation path between two symbols, with each hop\'s relation and confidence and the chain\'s weakest-hop confidence. Use it to explain how two parts of a codebase reach each other.',
      parameters: inputSchema({
        source: { type: 'string', required: true, description: 'Starting node id, symbol name, or file name.' },
        target: { type: 'string', required: true, description: 'Ending node id, symbol name, or file name.' },
        maxHops: { type: 'number', description: 'Maximum hops, 1-15. Default 8.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => text(
        shortestPathText(
          document,
          String(args.source ?? ''),
          String(args.target ?? ''),
          Number(args.maxHops ?? 8),
          true,
        ),
      )),
    },
    {
      name: 'codeslice_graph_rationale',
      description: 'The recorded reasons for a symbol: docstrings and the NOTE:/WHY:/TODO:-style marker comments attached to it. This is the closest thing to "why was this written this way" that a codebase contains.',
      parameters: inputSchema({
        name: { type: 'string', required: true, description: 'A node id, symbol name, or file name.' },
        limit: { type: 'number', description: 'How many explanations to return (default 8).' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => text(
        rationaleFor(nodesById(document), document.edges, String(args.name ?? ''), Math.max(1, Math.min(50, Number(args.limit ?? 8)))),
      )),
    },
    {
      name: 'codeslice_search',
      description: 'Search the workspace contents by keyword, not just by declaration name. Handles Chinese queries via overlapping CJK bigrams, ranks by query-coverage blended with term frequency, and returns file, line range, enclosing symbol and a snippet. Use it when you know roughly what the code says but not what it is called.',
      parameters: inputSchema({
        query: { type: 'string', required: true, description: 'Words, identifiers or Chinese terms; stopword-only queries return nothing.' },
        limit: { type: 'number', description: 'Maximum records (default 12, cap 60).' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const limit = Math.max(1, Math.min(60, Number(args.limit ?? 12)));
        const records = searchRecords(document.chunks, String(args.query ?? ''), limit);
        if (records.length === 0) return text('没有匹配的代码片段。');
        return text(records.map((record) => {
          const symbol = record.symbol === null || record.symbol === undefined ? '' : ` (${record.kind} ${record.symbol})`;
          const head = `### ${record.path}:${record.line}-${record.endLine}${symbol}`;
          const body = record.snippet.length > 1200 ? `${record.snippet.slice(0, 1200)}\n…(截断)` : record.snippet;
          return `${head}\n\`\`\`${record.language ?? ''}\n${body}\n\`\`\``;
        }).join('\n\n'));
      }),
    },
    {
      name: 'codeslice_definition',
      description: 'The declaration visible at one file position — the editor\'s "go to definition" asked as a question. Accepts a path and a line; returns the enclosing declaration, its signature, and its exact span.',
      parameters: inputSchema({
        path: { type: 'string', required: true, description: 'Workspace-relative path with forward slashes.' },
        line: { type: 'number', required: true, description: '1-based line inside the file.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const found = definitionsAt(document.index, String(args.path ?? '').replace(/\\/gu, '/'), Number(args.line ?? 1));
        if (found.length === 0) return text('这一行没有可见的声明。');
        return text(found.map((row) => `${row.label}  (${row.kind})  ${row.path}:L${row.line}${row.signature === undefined ? '' : `\n  ${row.signature}`}`).join('\n'));
      }),
    },
    {
      name: 'codeslice_references',
      description: 'The resolved call sites that reach one declaration — the incoming edges a text grep cannot distinguish from a same-named symbol elsewhere. Returns file, line and the caller.',
      parameters: inputSchema({
        name: { type: 'string', required: true, description: 'The declaration\'s name.' },
        limit: { type: 'number', description: 'Maximum rows (default 40, cap 200).' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const definitions = definitionsByName(document.index, String(args.name ?? ''));
        if (definitions.length === 0) return text(`nothing is declared as ${String(args.name ?? '')}`);
        const limit = Math.max(1, Math.min(200, Number(args.limit ?? 40)));
        const lines = [];
        for (const definition of definitions) {
          // `refsTo` returns `{ locations, truncated }`, not a plain array —
          // spreading/cliping the wrapper used to throw a TypeError (§3.5.1).
          const refs = refsTo(document.index, definition.id, limit);
          const locations = refs.locations;
          lines.push(`${definition.label}  ${definition.path}:L${definition.line}  (${locations.length} reference${locations.length === 1 ? '' : 's'}${refs.truncated ? ', truncated' : ''})`);
          for (const ref of locations) {
            const caller = ref.fromLabel === undefined ? '' : `  in ${ref.fromLabel}`;
            lines.push(`  ${ref.path}:L${ref.line}${caller}  [${ref.confidence}]`);
          }
        }
        return text(lines.join('\n'));
      }),
    },
    {
      name: 'codeslice_outline',
      description: 'List one file\'s declarations in source order — functions, classes, methods with their spans and signatures — plus the imports it makes and the files that import it. Use it to understand a file\'s shape before reading it in full.',
      parameters: inputSchema({
        path: { type: 'string', required: true, description: 'Workspace-relative path with forward slashes.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const path = String(args.path ?? '').replace(/\\/gu, '/');
        const file = document.files.find((entry) => entry.path === path);
        if (file === undefined) return text(`not indexed: ${path}`);
        const symbols = document.nodes
          .filter((node) => node.path === path && node.kind !== KIND_FILE && node.kind !== KIND_RATIONALE)
          .sort((a, b) => a.start_line - b.start_line);
        const imports = document.edges
          .filter((edge) => (edge.relation === 'imports' || edge.relation === 'imports_from'))
          .filter((edge) => edge.source === document.nodes.find((node) => node.path === path && node.kind === KIND_FILE)?.id);
        const lines = [`${path}  (${file.lines} lines, ${file.language ?? 'unknown'})`, ''];
        for (const node of symbols) {
          const indent = node.parent === null ? '' : '  ';
          lines.push(`${indent}${node.label}  ${node.kind}  L${node.start_line}-${node.end_line}${node.signature === undefined ? '' : `\n${indent}  ${node.signature}`}`);
        }
        if (imports.length > 0) {
          lines.push('', 'imports:');
          for (const edge of imports) lines.push(`  ${edge.relation === 'imports' ? '+ ' : '~ '}${baseOf(edge.target)}`);
        }
        return text(lines.join('\n'));
      }),
    },
    {
      name: 'codeslice_notes',
      description: 'The reader\'s own note knowledge base for this workspace: search notes by keyword, or read one by id. Notes record what was understood and cite the code positions they came from.',
      parameters: inputSchema({
        query: { type: 'string', description: 'Keyword to search note titles and bodies. Omit to list the most recent notes.' },
        id: { type: 'string', description: 'Read one note by id instead of searching.' },
        limit: { type: 'number', description: 'Maximum notes (default 5, cap 20).' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => {
        const root = resolveRoot(args.root, cwdOf(exec?.agent));
        const notes = await loadNotes(root);
        if (typeof args.id === 'string' && args.id !== '') {
          const note = notes.notes.find((row) => row.id === args.id);
          return text(note === undefined ? `note not found: ${args.id}` : `${note.title}\n\n${note.body}`);
        }
        const query = collapseWhitespace(args.query ?? '');
        const limit = Math.max(1, Math.min(20, Number(args.limit ?? 5)));
        const rows = notes.notes
          .filter((note) => query === ''
            || note.title.toLowerCase().includes(query.toLowerCase())
            || String(note.body ?? '').toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .slice(0, limit);
        if (rows.length === 0) return text(query === '' ? '还没有任何笔记。' : `没有匹配「${query}」的笔记。`);
        return text(rows.map((note) => `# ${note.title}\n  id: ${note.id}\n  ${(note.codeRefs ?? []).length} code reference(s)\n\n${String(note.body ?? '').slice(0, 1500)}`).join('\n\n---\n\n'));
      },
    },
    {
      name: 'codeslice_index',
      description: 'Report the state and health of the workspace index: file, line, node, edge and community counts, the relation breakdown, and the share of call sites the resolver could attribute. Use it to decide whether the graph is trustworthy enough to answer a question, or to diagnose why a question found nothing.',
      parameters: inputSchema({
        refresh: { type: 'boolean', description: 'Rebuild from disk instead of using the cached index.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const stats = document.stats ?? {};
        const extracted = Number(stats.calls_extracted ?? 0);
        const total = Number(stats.calls_project ?? 0);
        return text([
          `root: ${document.root}`,
          `files: ${document.files.length}   lines: ${document.lineCount ?? 0}`,
          `nodes: ${document.nodes.length}   edges: ${document.edges.length}`,
          `communities: ${(document.communities ?? []).length}`,
          `built in ${document.buildMs}ms (${document.__cached === true ? 'cached' : 'fresh'})`,
          '',
          'relations:',
          ...Object.entries(stats.by_relation ?? {}).map(([relation, count]) => `  ${relation}: ${count}`),
          '',
          `call resolution: ${extracted}/${total}${total === 0 ? '' : ` (${Math.round((extracted / total) * 100)}%)`}`,
          `dropped: ${Number(stats.calls_dropped ?? 0)}   inferred: ${Number(stats.calls_inferred ?? 0)}`,
        ].join('\n'));
      }),
    },

    /* ---- v0.2.0 compatibility aliases ------------------------------- *
     * These names shipped in the previous release and may appear in saved
     * prompts. They delegate rather than disappear, so an old prompt keeps
     * working against the new pipeline.                                  */

    {
      name: 'codeslice_symbol',
      description: 'Find where a name is declared across the workspace, ordered by how likely each site is the canonical definition.',
      parameters: inputSchema({
        query: { type: 'string', required: true, description: 'Symbol name, or a fragment of one.' },
        kind: { type: 'string', description: 'Restrict to one kind: function, method, class.' },
        limit: { type: 'number', description: 'Maximum rows (default 20, cap 100).' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => ({
        definitions: clip(
          searchDefinitions(document.index, String(args.query), Number(args.limit ?? 20))
            .filter((row) => args.kind === undefined || row.kind === String(args.kind)),
          Math.max(1, Math.min(100, Number(args.limit ?? 20))),
        ),
      })),
    },
    {
      name: 'codeslice_callers',
      description: 'The call graph around one function: who calls it and what it calls, optionally walking N hops of callers.',
      parameters: inputSchema({
        name: { type: 'string', required: true, description: 'The function or method name.' },
        depth: { type: 'number', description: 'Transitive caller hops, 1-4. Default 1.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const node = findNode(document, String(args.name));
        if (node === undefined) return text(`node not found: ${String(args.name)}`);
        const depth = Number(args.depth ?? 1);
        return text(callersText(document, node.id, depth, 2000));
      }),
    },
    {
      name: 'codeslice_inheritance',
      description: 'The class hierarchy around one type: what it extends and what extends it.',
      parameters: inputSchema({
        name: { type: 'string', required: true, description: 'The class name.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const byId = nodesById(document);
        const node = findNode(document, String(args.name));
        if (node === undefined) return text(`node not found: ${String(args.name)}`);
        const parents = document.edges.filter((edge) => edge.relation === 'inherits' && edge.source === node.id)
          .map((edge) => byId.get(edge.target)).filter((row) => row !== undefined);
        const children = document.edges.filter((edge) => edge.relation === 'inherits' && edge.target === node.id)
          .map((edge) => byId.get(edge.source)).filter((row) => row !== undefined);
        return {
          name: node.label,
          parents: parents.map((row) => ({ name: row.label, kind: row.kind, path: row.path, line: row.start_line })),
          children: children.map((row) => ({ name: row.label, kind: row.kind, path: row.path, line: row.start_line })),
        };
      }),
    },
    {
      name: 'codeslice_explain',
      description: 'One round trip that answers "what is this thing": where it is defined, what it calls, what calls it, its inheritance and its same-file neighbours.',
      parameters: inputSchema({
        name: { type: 'string', required: true, description: 'The function, method or class name.' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const node = findNode(document, String(args.name));
        if (node === undefined) return text(`node not found: ${String(args.name)}`);
        return text(nodeContext(document, node.id, 1, 1500));
      }),
    },
    {
      name: 'codeslice_hot',
      description: 'The most-connected declarations — where to start reading when you have no specific symbol in mind.',
      parameters: inputSchema({
        limit: { type: 'number', description: 'How many rows (default 20, cap 60).' },
        root: ROOT_PROP,
      }),
      execute: async (args, exec) => withGraph(args, exec, (document) => {
        const limit = Math.max(1, Math.min(60, Number(args.limit ?? 20)));
        const rows = [...document.nodes]
          .filter((node) => node.kind !== KIND_RATIONALE)
          .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
          .slice(0, limit)
          .map((node) => ({
            name: node.label, kind: node.kind, path: node.path, line: node.start_line, degree: node.degree ?? 0,
          }));
        return { symbols: rows };
      }),
    },
  ];
}

/* ------------------------------------------------------------------ *
 * HTTP body helpers                                                  *
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

/** Whether the connection service refuses this request. */
function isUnadmitted(ctx, req) {
  const connection = ctx.get('connection');
  return connection !== undefined && connection.requestRejection?.(req) !== undefined;
}

/* ------------------------------------------------------------------ *
 * The API methods                                                    *
 * ------------------------------------------------------------------ */

/**
 * How many conversations a root has, tolerating a missing or unreadable store.
 *
 * `status` is the panel's first call and its job is to describe the workspace,
 * not to succeed at everything: a corrupt chat document must surface as "0
 * conversations plus an error when you open the tab", never as a failed status
 * that leaves the whole panel blank.
 * @param root - absolute workspace root.
 * @returns the conversation count, or 0.
 */
async function countConversationsSafe(root) {
  try {
    return await countConversations(root);
  } catch {
    return 0;
  }
}

/**
 * Build the method table. Every entry is `(payload, context) => value`; a throw
 * becomes a 400 with the message, never a 500 with a stack.
 * @param options - `{ config, defaultDir }`.
 * @returns the method table.
 */
export function apiMethods(options) {
  const { config, defaultDir } = options;
  const rootOf = (payload) => resolveRoot(payload.root, payload.cwd ?? defaultDir);
  const load = (root, force) => documentFor(root, config, { force });

  /** The status projection the panel polls once. */
  const statusOf = async (document, root, extra = {}) => {
    // v3.5.5: one damaged substate must not take the whole status call down.
    // Notes and RAG settings are read independently; either corrupts, its field
    // degrades to `{ ok:false, reason }` while the rest of the projection still
    // answers 200.
    let notesDoc = null;
    let notesError = null;
    try {
      notesDoc = await loadNotes(root);
    } catch (error) {
      notesError = String(error?.message ?? error);
    }
    let counts = { fresh: 0, moved: 0, drifted: 0, missing: 0 };
    if (notesDoc !== null) {
      ({ counts } = await refreshAnchors(root, notesDoc.anchors ?? []));
    }
    // v2: the workbench's own counts, so the panel can show a real number on the
    // conversation tab without a second round trip. Both are cheap reads of the
    // per-root documents and both degrade to zero rather than failing status.
    const conversations = await countConversationsSafe(root);
    let rag;
    try {
      const ragSettings = await readRagSettings(root);
      rag = { topK: ragSettings.config.topK, rrfK: ragSettings.config.rrfK };
    } catch (error) {
      rag = { ok: false, reason: String(error?.message ?? error) };
    }
    let projects;
    try {
      projects = await listProjects();
    } catch (error) {
      projects = { ok: false, reason: String(error?.message ?? error) };
    }
    const prompts = await promptsSummary();
    return {
      root,
      builtAt: document.builtAt,
      buildMs: document.buildMs,
      cached: document.__cached === true,
      schema: document.schema ?? 1,
      topologyKey: document.topologyKey ?? '',
      files: document.files.length,
      lines: document.lineCount ?? 0,
      nodes: document.nodes.length,
      edges: document.edges.length,
      symbols: (document.nodes ?? []).filter((node) => node.kind === 'function' || node.kind === 'class').length,
      rationale: (document.nodes ?? []).filter((node) => node.kind === KIND_RATIONALE).length,
      external: (document.nodes ?? []).filter((node) => node.external === true).length,
      communities: (document.communities ?? []).length,
      languages: document.languages ?? {},
      byRelation: document.stats?.by_relation ?? {},
      callsExtracted: Number(document.stats?.calls_extracted ?? 0),
      callsDropped: Number(document.stats?.calls_dropped ?? 0),
      callsProject: Number(document.stats?.calls_project ?? 0),
      truncated: document.truncated === true,
      skippedLarge: document.skippedLarge ?? 0,
      skippedGenerated: document.skippedGenerated ?? 0,
      notes: notesError === null ? notesDoc.notes.length : { ok: false, reason: notesError },
      anchors: notesError === null ? counts : { ok: false, reason: notesError },
      /* ---- v2 ---------------------------------------------------- */
      conversations: conversations,
      rag,
      /* ---- v3 ---------------------------------------------------- */
      projects,
      prompts,
      ...extra,
    };
  };

  return {
    /* ---- status ---------------------------------------------------- */
    async status(payload) {
      const root = rootOf(payload);
      const document = await load(root, payload.refresh === true);
      return statusOf(document, root, payload.refresh === true ? { rebuilt: true } : {});
    },

    async rebuild(payload) {
      const root = rootOf(payload);
      await clearIndex(root);
      builds.delete(root.toLowerCase());
      const document = await load(root, true);
      return statusOf(document, root, { rebuilt: true });
    },

    /* ---- graph ----------------------------------------------------- */
    async graph(payload) {
      const root = rootOf(payload);
      const document = await load(root, false);
      const limit = Math.max(10, Math.min(
        Math.max(10, Number(config.maxGraphNodes ?? CONFIG_DEFAULTS.maxGraphNodes)),
        Number(payload.limit ?? config.maxGraphNodes ?? CONFIG_DEFAULTS.maxGraphNodes),
      ));
      return graphSlice(document, {
        scope: typeof payload.scope === 'string' ? payload.scope : 'workspace',
        path: typeof payload.path === 'string' ? payload.path.replace(/\\/gu, '/') : undefined,
        focus: typeof payload.focus === 'string' && payload.focus !== '' ? payload.focus : undefined,
        query: typeof payload.query === 'string' ? payload.query : undefined,
        depth: Number(payload.depth ?? 1),
        limit,
        families: Array.isArray(payload.families) ? payload.families.map(String) : DEFAULT_FAMILIES,
      });
    },

    async node(payload) {
      const root = rootOf(payload);
      const document = await load(root, false);
      const byId = new Map(document.nodes.map((node) => [node.id, node]));
      const requested = String(payload.id ?? payload.name ?? '');

      // The aggregated canvas has one node per community, and those ids do not
      // exist in the symbol graph. Describe the community from its summary
      // instead of answering "node not found" for a node the canvas just drew.
      if (requested.startsWith('community:')) {
        const cid = Number(requested.slice('community:'.length));
        const summary = (document.communities ?? []).find((row) => Number(row.id) === cid);
        const label = summary?.label ?? '其他社区';
        return {
          node: {
            id: requested,
            label,
            kind: 'community',
            path: '',
            line: 0,
            endLine: 0,
            language: '',
            signature: '',
            degree: summary?.size ?? 0,
            community: Number.isFinite(cid) ? cid : 0,
            communityLabel: label,
            parent: null,
            origin: '',
          },
          rationale: [],
          groups: [],
          siblings: [],
          context: '',
        };
      }

      const anchor = findNode(document, requested);
      if (anchor === undefined) throw new Error(`node not found: ${requested}`);

      const groups = groupConnections(anchor.id, document.edges, byId);
      const siblings = anchor.path === ''
        ? []
        : document.nodes
          .filter((node) => node.path === anchor.path && node.id !== anchor.id
            && node.kind !== KIND_FILE && node.kind !== KIND_RATIONALE)
          .sort((a, b) => a.start_line - b.start_line)
          .slice(0, 60)
          .map((node) => ({ id: node.id, label: node.label, kind: node.kind, line: node.start_line }));

      return {
        node: {
          id: anchor.id,
          label: anchor.label,
          kind: anchor.kind,
          path: anchor.path,
          line: anchor.start_line,
          endLine: anchor.end_line,
          language: anchor.language ?? '',
          signature: anchor.signature ?? '',
          degree: anchor.degree ?? 0,
          community: anchor.community ?? 0,
          communityLabel: anchor.community_label ?? '',
          parent: anchor.parent ?? null,
          origin: anchor.origin ?? '',
        },
        rationale: rationaleRows(document, byId, anchor.id),
        groups,
        siblings,
        context: nodeContext(document, anchor.id, 1, 1200),
      };
    },

    /* ---- search ---------------------------------------------------- */
    async search(payload) {
      const root = rootOf(payload);
      const document = await load(root, false);
      const query = String(payload.query ?? '');
      const limit = Math.max(1, Math.min(100, Number(payload.limit ?? 20)));
      const definitions = searchDefinitions(document.index, query, limit).map((row) => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        path: row.path,
        line: row.line,
        signature: row.signature ?? '',
        score: row.score ?? 0,
      }));
      const files = document.files
        .filter((file) => query !== '' && file.path.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((file) => ({ path: file.path, lines: file.lines, language: file.language ?? '' }));
      const records = searchRecords(document.chunks, query, limit);
      return {
        query,
        definitions,
        files,
        records,
        total: { definitions: definitions.length, files: files.length, records: records.length },
      };
    },

    /* ---- outline --------------------------------------------------- */
    async outline(payload) {
      const root = rootOf(payload);
      const document = await load(root, false);
      const path = String(payload.path ?? '').replace(/\\/gu, '/');
      const file = document.files.find((entry) => entry.path === path);
      if (file === undefined) return { path, found: false, lines: 0, symbols: [], imports: [], importedBy: [], rationale: [] };

      const fileId = document.nodes.find((node) => node.path === path && node.kind === KIND_FILE)?.id;
      const symbols = document.nodes
        .filter((node) => node.path === path && node.kind !== KIND_FILE && node.kind !== KIND_RATIONALE)
        .sort((a, b) => a.start_line - b.start_line)
        .map((node) => ({
          id: node.id,
          name: node.label,
          kind: node.kind,
          line: node.start_line,
          endLine: node.end_line,
          signature: node.signature ?? '',
        }));
      const byId = new Map(document.nodes.map((node) => [node.id, node]));
      const imports = document.edges
        .filter((edge) => edge.source === fileId && (edge.relation === 'imports' || edge.relation === 'imports_from'))
        .map((edge) => ({
          module: byId.get(edge.target)?.label ?? baseOf(edge.target),
          line: edge.line,
          resolved: byId.get(edge.target)?.external === true ? null : (byId.get(edge.target)?.path ?? null),
        }));
      const importedBy = [...new Set(document.edges
        .filter((edge) => edge.target === fileId && (edge.relation === 'imports' || edge.relation === 'imports_from'))
        .map((edge) => byId.get(edge.source)?.path)
        .filter((value) => typeof value === 'string' && value !== ''))];
      const rationale = document.nodes
        .filter((node) => node.path === path && node.kind === KIND_RATIONALE)
        .sort((a, b) => a.start_line - b.start_line)
        .map((node) => ({ text: node.label, line: node.start_line, origin: node.origin ?? 'comment', owner: node.parent ?? null }));

      return { path, found: true, lines: file.lines, language: file.language ?? '', symbols, imports, importedBy, rationale };
    },

    /* ---- notes ----------------------------------------------------- */
    async notes(payload) {
      const root = rootOf(payload);
      const op = typeof payload.op === 'string' ? payload.op : 'list';

      // Every mutating op runs load → mutate → save inside one queued cycle
      // (`updateNotes`), never as three separate steps: two panels saving at once
      // would otherwise each append to their own stale snapshot and the second
      // save would drop the first panel's note. Reads take the plain path because
      // a read that races a write only ever sees a whole document either side of
      // the rename.
      if (op === 'createFolder') {
        const result = await updateNotes(root, (document) => {
          const folder = {
            id: `f_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
            name: collapseWhitespace(payload.name ?? '') || '新文件夹',
            parentId: payload.parentId === undefined || payload.parentId === null || payload.parentId === '' ? null : String(payload.parentId),
            createdAt: Date.now(),
          };
          document.folders.push(folder);
          return { folder };
        });
        return persisted(result);
      }

      if (op === 'renameFolder') {
        const result = await updateNotes(root, (document) => {
          const folder = document.folders.find((row) => row.id === payload.id);
          if (folder === undefined) throw new Error(`folder not found: ${String(payload.id)}`);
          folder.name = collapseWhitespace(payload.name ?? '') || folder.name;
          return { folder };
        });
        return persisted(result);
      }

      // Deleting a folder never deletes content: its notes and sub-folders move
      // up to the deleted folder's own parent, so a mis-click cannot lose a note.
      if (op === 'deleteFolder') {
        const result = await updateNotes(root, (document) => {
          const index = document.folders.findIndex((row) => row.id === payload.id);
          if (index < 0) throw new Error(`folder not found: ${String(payload.id)}`);
          const [removed] = document.folders.splice(index, 1);
          const parentId = removed.parentId ?? null;
          for (const folder of document.folders) {
            if (folder.parentId === removed.id) folder.parentId = parentId;
          }
          let moved = 0;
          for (const note of document.notes) {
            if (note.folderId === removed.id) {
              note.folderId = parentId;
              moved += 1;
            }
          }
          return { deleted: true, moved };
        });
        return persisted(result);
      }

      if (op === 'create') {
        return updateNotes(root, async (document) => {
          const note = await makeNote(root, document, payload);
          document.notes.push(note);
          return { note };
        }).then(persisted);
      }

      // Resolve one citation to something readable: the same code in today's
      // worktree, or the commit the note was written against when that code is
      // gone. The client calls this before every jump, so a note written three
      // refactors ago still opens somewhere real instead of line 1 of a file
      // that no longer contains it.
      if (op === 'locate') {
        const document = await loadNotes(root);
        const note = Array.isArray(document.notes)
          ? document.notes.find((row) => row.id === payload.noteId)
          : undefined;
        const anchors = Array.isArray(note?.anchors) ? note.anchors : [];
        const wanted = Math.trunc(Number(payload.index));
        const normal = (value) => String(value ?? '').replace(/\\/gu, '/');
        let anchor = Number.isFinite(wanted) && wanted >= 0 ? anchors[wanted] : undefined;
        if (anchor === undefined && typeof payload.path === 'string' && payload.path !== '') {
          const samePath = anchors.filter((row) => normal(row.path) === normal(payload.path));
          const line = Math.trunc(Number(payload.startLine ?? payload.line) || 0);
          anchor = samePath.find((row) => Number(row.startLine) === line) ?? samePath[0];
        }
        const citation = anchor !== undefined && anchor !== null
          ? anchor
          : {
            path: payload.path,
            startLine: payload.startLine ?? payload.line,
            endLine: payload.endLine,
            snippet: payload.snippet,
            hash: payload.hash,
            commit: payload.commit,
          };
        const located = await locateCitation(root, citation);
        // A moved range means the note's own numbers are stale. Rewrite them in
        // the stored anchor, the codeRefs the panel renders, and the Markdown
        // heading an export shows, so the note keeps describing today's file.
        let synced;
        if (note !== undefined && located.mode === 'worktree' && located.status === 'moved') {
          const from = {
            startLine: Math.max(1, Math.trunc(Number(citation.startLine ?? citation.line) || 1)),
            endLine: Math.max(1, Math.trunc(Number(citation.endLine ?? citation.line) || 1)),
          };
          const to = { startLine: located.startLine, endLine: located.endLine };
          if (from.startLine !== to.startLine || from.endLine !== to.endLine) {
            const written = await updateNotes(root, (next) => {
              const row = next.notes.find((entry) => entry.id === note.id);
              if (row === undefined) return { changed: false };
              const path = normal(citation.path);
              const ranges = Array.isArray(row.anchors) ? row.anchors : [];
              for (const entry of ranges) {
                if (normal(entry.path) !== path) continue;
                if (Number(entry.startLine ?? entry.line) !== from.startLine) continue;
                entry.startLine = to.startLine;
                entry.endLine = to.endLine;
                entry.status = 'fresh';
              }
              const refs = Array.isArray(row.codeRefs) ? row.codeRefs : [];
              for (const ref of refs) {
                if (normal(ref.path) !== path) continue;
                if (Number(ref.line) !== from.startLine) continue;
                ref.line = to.startLine;
                ref.endLine = to.endLine;
              }
              row.body = syncBodyRange(String(row.body ?? ''), citation.path, to.startLine, to.endLine);
              row.updatedAt = Date.now();
              return { changed: true };
            });
            synced = { from, to, anchorId: anchor?.id ?? null, written };
          }
        }
        return {
          ...located,
          noteId: note?.id ?? null,
          anchorId: anchor?.id ?? null,
          ...(synced === undefined ? {} : { synced }),
        };
      }

      // A citation whose file is gone still has to be *readable in the editor*,
      // and the editor only opens real files. Copy the blob at the note's commit
      // into a git-ignored scratch tree so the right sidebar can open it, draw
      // the note's box over the real lines, and leave the user's tree untouched.
      if (op === 'materialize') {
        const commit = String(payload.commit ?? '').trim();
        const rel = String(payload.path ?? '').replace(/\\/gu, '/').replace(/^\.?\//u, '');
        if (rel === '' || !/^[0-9a-f]{4,64}$/iu.test(commit)) {
          throw new Error('materialize requires a hex `commit` and a `path`');
        }
        const blob = await showFileAtCommit(root, commit, rel);
        if (blob === null) throw new Error(`commit ${commit.slice(0, 7)} has no ${rel}`);
        const shadowRel = `.codeslice/history/${commit.slice(0, 7)}/${rel}`;
        const absolute = safeJoin(root, shadowRel);
        if (absolute === undefined) throw new Error(`refused: ${shadowRel} is outside the workspace`);
        await fs.mkdir(dirname(absolute), { recursive: true });
        await fs.writeFile(absolute, blob, 'utf8');
        const ignore = safeJoin(root, '.codeslice/.gitignore');
        if (ignore !== undefined) {
          try { await fs.access(ignore); } catch {
            await fs.mkdir(dirname(ignore), { recursive: true });
            await fs.writeFile(ignore, '*\n', 'utf8');
          }
        }
        return { path: shadowRel, commit };
      }

      if (op === 'update') {
        return updateNotes(root, (document) => {
          const note = document.notes.find((row) => row.id === payload.id);
          if (note === undefined) throw new Error(`note not found: ${String(payload.id)}`);
          if (payload.title !== undefined) note.title = collapseWhitespace(payload.title) || note.title;
          if (payload.body !== undefined) note.body = String(payload.body);
          if (payload.folderId !== undefined) {
            note.folderId = payload.folderId === null || payload.folderId === '' ? null : String(payload.folderId);
          }
          if (Array.isArray(payload.codeRefs)) note.codeRefs = payload.codeRefs;
          note.updatedAt = Date.now();
          return { note };
        }).then(persisted);
      }

      if (op === 'delete') {
        return updateNotes(root, (document) => {
          const index = document.notes.findIndex((row) => row.id === payload.id);
          if (index < 0) throw new Error(`note not found: ${String(payload.id)}`);
          const [removed] = document.notes.splice(index, 1);
          document.anchors = document.anchors.filter((anchor) => anchor.noteId !== removed.id);
          return { deleted: true };
        }).then(persisted);
      }

      // Import keeps the Markdown verbatim: an imported file is somebody's
      // document, not a note this plugin wrote, so it must not be re-composed
      // into the four-heading template on the way in.
      if (op === 'import') {
        return updateNotes(root, async (document) => {
          const items = [];
          for (const entry of Array.isArray(payload.items) ? payload.items : []) {
            if (entry === null || typeof entry !== 'object') continue;
            const body = typeof entry.body === 'string' ? entry.body : '';
            if (body.trim() === '') continue;
            items.push({
              title: typeof entry.title === 'string' ? entry.title.trim() : '',
              body,
              fallback: typeof entry.name === 'string' ? entry.name : '',
            });
          }
          for (const entry of Array.isArray(payload.paths) ? payload.paths : []) {
            if (typeof entry !== 'string' || entry.trim() === '') continue;
            const target = resolve(root, entry.trim());
            if (!/\.(md|markdown|txt)$/iu.test(target)) throw new Error(`不是 Markdown 文件: ${basename(target)}`);
            const text = await fs.readFile(target, 'utf8');
            if (text.trim() === '') continue;
            items.push({ title: '', body: text, fallback: basename(target) });
          }
          if (items.length === 0) throw new Error('没有可导入的 Markdown 内容');
          const created = [];
          for (const item of items) {
            const note = await makeNote(root, document, {
              title: item.title !== '' ? item.title : importTitle(item.body, item.fallback),
              body: item.body,
              folderId: payload.folderId,
            });
            document.notes.push(note);
            created.push({ id: note.id, title: note.title });
          }
          return { imported: created.length, notes: created };
        }).then(persisted);
      }

      const document = await loadNotes(root);

      if (op === 'read') {
        const note = document.notes.find((row) => row.id === payload.id);
        if (note === undefined) throw new Error(`note not found: ${String(payload.id)}`);
        return { note: await withAnchorStatus(root, note) };
      }

      if (op === 'list') {
        const folder = payload.folder === undefined || payload.folder === null || payload.folder === '' ? undefined : String(payload.folder);
        const query = collapseWhitespace(payload.query ?? '').toLowerCase();
        const notes = document.notes
          .filter((note) => folder === undefined || note.folderId === folder)
          .filter((note) => query === ''
            || note.title.toLowerCase().includes(query)
            || String(note.body ?? '').toLowerCase().includes(query))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .map((note) => ({
            id: note.id,
            title: note.title,
            folderId: note.folderId ?? null,
            updatedAt: note.updatedAt,
            refs: (note.codeRefs ?? []).length,
            excerpt: excerptOf(note.body),
          }));
        return { folders: folderTree(document.folders, document.notes), notes };
      }

      if (op === 'folders') return { folders: folderTree(document.folders, document.notes) };

      if (op === 'graph') {
        const graph = await buildNotesGraph(document.notes, document.folders, { root, embed: true });
        return {
          scope: 'notes',
          ...graph,
          total: { nodes: graph.nodes.length, edges: graph.links.length },
          truncated: false,
        };
      }

      if (op === 'export') {
        const note = document.notes.find((row) => row.id === payload.id);
        if (note === undefined) throw new Error(`note not found: ${String(payload.id)}`);
        const target = await exportNote(root, await withAnchorStatus(root, note), []);
        return { path: target };
      }

      // Batch export: the ids the panel has selected, or every note when no
      // selection is given. One file per note, inside `<root>/notes-export`,
      // with the library's folder tree mirrored as directories.
      if (op === 'exportMany') {
        const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : null;
        const rows = ids === null
          ? document.notes
          : document.notes.filter((row) => ids.includes(String(row.id)));
        if (rows.length === 0) throw new Error('没有可导出的笔记');
        const prepared = [];
        for (const row of rows) prepared.push(await withAnchorStatus(root, row));
        const segments = folderSegments(document.folders);
        const folderPaths = {};
        for (const row of prepared) {
          const folderId = row.folderId ?? null;
          if (typeof folderId === 'string' && folderId !== '') {
            folderPaths[row.id] = segments.byId(folderId);
          }
        }
        const result = await exportNotes(root, prepared, {
          folderPaths,
          // "Export all" also recreates the folders the user made but left empty.
          ensureFolders: ids === null ? segments.all : [],
        });
        return { dir: result.dir, count: result.files.length, files: result.files };
      }

      throw new Error(`unknown notes op: ${op}`);
    },

    /* ---- annotations ----------------------------------------------- */
    async annotations(payload) {
      const root = rootOf(payload);
      const op = typeof payload.op === 'string' ? payload.op : 'list';

      if (op === 'create') {
        const path = String(payload.path ?? '').replace(/\\/gu, '/');
        const startLine = Math.max(1, Math.trunc(Number(payload.startLine ?? 1)));
        const endLine = Math.max(startLine, Math.trunc(Number(payload.endLine ?? startLine)));
        // The snippet is the *code*, captured now: without it a later check can
        // only say "the file changed", never "the same code moved". The recorded
        // range is the clipped span actually read, not the requested one (§3.5.2).
        const detailed = await readRangeDetailed(root, path, startLine, endLine, 40);
        const snippet = detailed?.text ?? null;
        const actualStart = detailed?.startLine ?? startLine;
        const actualEnd = detailed?.endLine ?? endLine;
        return updateNotes(root, (document) => {
          const annotation = {
            id: `an_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
            path,
            startLine: actualStart,
            endLine: actualEnd,
            title: collapseWhitespace(payload.title ?? '') || `L${actualStart}-${actualEnd}`,
            body: String(payload.body ?? ''),
            snippet: snippet ?? '',
            hash: snippet === null ? null : snippetHash(snippet),
            createdAt: Date.now(),
          };
          document.annotations.push(annotation);
          return { annotation: { ...annotation, drift: { status: snippet === null ? 'missing' : 'fresh', shift: 0 } } };
        }).then(persisted);
      }

      if (op === 'update') {
        return updateNotes(root, (document) => {
          const annotation = document.annotations.find((row) => row.id === payload.id);
          if (annotation === undefined) throw new Error(`annotation not found: ${String(payload.id)}`);
          if (payload.title !== undefined) annotation.title = collapseWhitespace(payload.title) || annotation.title;
          if (payload.body !== undefined) annotation.body = String(payload.body);
          return { annotation };
        }).then(persisted);
      }

      if (op === 'delete') {
        return updateNotes(root, (document) => {
          const index = document.annotations.findIndex((row) => row.id === payload.id);
          if (index < 0) throw new Error(`annotation not found: ${String(payload.id)}`);
          document.annotations.splice(index, 1);
          return { deleted: true };
        }).then(persisted);
      }

      const document = await loadNotes(root);

      if (op === 'list') {
        const path = typeof payload.path === 'string' ? payload.path.replace(/\\/gu, '/') : undefined;
        const rows = document.annotations
          .filter((row) => path === undefined || row.path === path)
          .sort((a, b) => a.startLine - b.startLine);
        const checked = await refreshAnchors(root, rows.map((row) => ({
          id: row.id, path: row.path, startLine: row.startLine, endLine: row.endLine,
          hash: row.hash, snippet: row.snippet,
        })));
        const statusById = new Map(checked.anchors.map((row) => [row.id, row]));
        return {
          annotations: rows.map((row) => {
            const status = statusById.get(row.id);
            return {
              ...row,
              drift: { status: status?.status ?? 'fresh', shift: status?.shift ?? 0 },
            };
          }),
        };
      }

      throw new Error(`unknown annotations op: ${op}`);
    },

    /* ---- files ----------------------------------------------------- */
    async files(payload) {
      const root = rootOf(payload);
      const document = await load(root, false);
      const query = collapseWhitespace(payload.query ?? '').toLowerCase();
      const limit = Math.max(1, Math.min(2000, Number(payload.limit ?? 500)));
      const symbolCounts = new Map();
      for (const node of document.nodes) {
        if (node.kind === KIND_FILE || node.kind === KIND_RATIONALE || node.external === true) continue;
        symbolCounts.set(node.path, (symbolCounts.get(node.path) ?? 0) + 1);
      }
      const files = document.files
        .filter((file) => query === '' || file.path.toLowerCase().includes(query))
        .slice(0, limit)
        .map((file) => ({
          path: file.path,
          lines: file.lines,
          language: file.language ?? '',
          symbols: symbolCounts.get(file.path) ?? 0,
        }));
      return { files, total: document.files.length };
    },

    /* ---- layout ---------------------------------------------------- */
    async layout(payload) {
      const root = rootOf(payload);
      const document = await load(root, false);
      const key = String(payload.key ?? document.topologyKey ?? '');
      if (payload.positions !== undefined && payload.positions !== null) {
        await saveLayout(root, key, payload.positions);
        return { saved: true, key };
      }
      const entry = await loadLayout(root, key);
      return { key, positions: entry?.positions ?? entry ?? null };
    },

    /* ---- v3: tree, frames, prompts, projects (INTERFACES-v3.md §3.1–3.4) */

    async tree(payload) {
      const root = rootOf(payload);
      return walkTree(root);
    },

    async frames(payload, context = {}) {
      const root = rootOf(payload);
      const op = typeof payload.op === 'string' ? payload.op : 'list';
      if (op === 'list') {
        return listFrames(root, { sessionId: payload.sessionId, path: payload.path });
      }
      if (op === 'create') {
        const frame = await createFrame(root, payload);
        return { frame };
      }
      if (op === 'title') {
        const id = String(payload.id ?? '');
        if (id === '') throw new Error('a frame id is required');
        const path = String(payload.path ?? '').replace(/\\/gu, '/').replace(/^\/+/u, '');
        const startLine = Math.max(1, Math.trunc(Number(payload.startLine) || 1));
        const endLine = Math.max(startLine, Math.trunc(Number(payload.endLine) || startLine));
        const generated = await generateFrameTitle({ get: (name) => context.ctx?.get?.(name) }, {
          root, path, startLine, endLine,
        });
        if (!generated.ok) {
          // The placeholder is still better than a fabricated title. The note
          // generator can replace it from its own structured `## 标题` later.
          return { frame: null, title: null, error: generated.error };
        }
        const frame = await updateFrameTitle(root, id, generated.title, payload.sessionId);
        return { frame, title: generated.title };
      }
      if (op === 'delete') {
        const id = String(payload.id ?? '');
        if (id === '') throw new Error('a frame id is required');
        await deleteFrame(root, id);
        return { removed: true };
      }
      throw new Error(`unknown frames op: ${op}`);
    },

    async prompts(payload) {
      const op = typeof payload.op === 'string' ? payload.op : 'read';
      if (op === 'read') return readPrompts();
      if (op === 'save') {
        return savePrompts({
          system: payload.system,
          qa: payload.qa,
          note: payload.note,
          ...(payload.ask === undefined ? {} : { ask: payload.ask }),
        });
      }
      if (op === 'reset') {
        const which = typeof payload.which === 'string' ? payload.which : 'all';
        return resetPrompts(which);
      }
      throw new Error(`unknown prompts op: ${op}`);
    },

    /**
     * The composer's contact-context switch.
     *
     * Only the prompt section and the main conversation read this; graph/note
     * APIs keep their own settings. Payload: `{ enabled, sessionId? }`.
     */
    async context(payload = {}) {
      if (payload.enabled === undefined) return { enabled: getContextEnabled() };
      return setContextEnabled(payload.enabled === true);
    },

    async projects(payload) {
      const op = typeof payload.op === 'string' ? payload.op : 'list';
      if (op === 'list') return listProjects();
      if (op === 'rename') {
        const id = String(payload.id ?? '');
        if (id === '') throw new Error('a project id is required');
        const project = await renameProject(id, payload.name);
        return { project };
      }
      if (op === 'delete') {
        const id = String(payload.id ?? '');
        if (id === '') throw new Error('a project id is required');
        await forgetProject(id);
        return { removed: true };
      }
      throw new Error(`unknown projects op: ${op}`);
    },

    /* ---- v2: conversation, code, knowledge base (WIRE-CHAT.md) ------ */
    //
    // These are merged rather than reimplemented here: each lives in its own
    // module so the workbench can grow without this file becoming the second
    // implementation of everything it touches. They resolve the workspace from
    // `payload.root → payload.cwd → defaultDir`, the same precedence as `rootOf`
    // above, so a v1 and a v2 call from one panel cannot disagree about which
    // workspace they are talking to. `load` is handed over so `code`/`ask` reuse
    // this file's one cached build per root instead of rebuilding.
    ...chatApiMethods({ defaultDir, load }),
    ...codeApiMethods({ defaultDir, load }),
    ...filesApiMethods({ defaultDir, load }),
    ...modelsApiMethods({ defaultDir }),
    ...ragApiMethods({ defaultDir, load }),
    ...noteFromChatApiMethods({ defaultDir, load }),
    ...noteFromSessionApiMethods({ defaultDir, load }),
  };
}

/* ------------------------------------------------------------------ *
 * Projections used by the API methods                                *
 * ------------------------------------------------------------------ */

/**
 * Resolve anything a caller may pass — a node id, a symbol name, a file path, a
 * fragment — to the node itself.
 *
 * `resolveAnchor` deliberately returns an id rather than a node: it is used by
 * code that only needs an identity, and returning the node there would invite
 * callers to mutate a shared object. Everything that needs the record goes
 * through this one adapter, so the id/node distinction lives in a single place.
 *
 * @param document - the built document.
 * @param anchor - what the caller passed.
 * @returns the node, or undefined.
 */
function findNode(document, anchor) {
  const id = resolveAnchor(document.nodes, String(anchor ?? ''));
  if (id === null || id === undefined) return undefined;
  return document.nodes.find((node) => node.id === id);
}

/**
 * Group a node's edges into the buckets the inspector shows.
 *
 * Calls are split by direction because "who calls this" and "what this calls"
 * are different questions; every other family reads better grouped together with
 * a per-row arrow.
 * @param selectedId - the node in focus.
 * @param edges - every edge.
 * @param byId - node lookup.
 * @returns ordered non-empty groups.
 */
function groupConnections(selectedId, edges, byId) {
  const groups = {
    callers: [], calls: [], dependencies: [], structure: [], meaning: [], hierarchy: [],
  };

  for (const edge of edges) {
    if (edge.source !== selectedId && edge.target !== selectedId) continue;
    const outgoing = edge.source === selectedId;
    const other = byId.get(outgoing ? edge.target : edge.source);
    if (other === undefined || other.id === selectedId) continue;
    const row = {
      id: other.id,
      label: other.label,
      kind: other.kind,
      path: other.path,
      line: other.start_line,
      relation: edge.relation,
      confidence: edge.confidence,
      outgoing,
    };
    if (edge.relation === 'calls' || edge.relation === 'indirect_call') {
      (outgoing ? groups.calls : groups.callers).push(row);
    } else if (edge.relation === 'imports' || edge.relation === 'imports_from' || edge.relation === 'uses') {
      groups.dependencies.push(row);
    } else if (edge.relation === 'inherits') {
      groups.hierarchy.push(row);
    } else if (edge.relation === 'rationale_for') {
      groups.meaning.push(row);
    } else {
      groups.structure.push(row);
    }
  }

  const byLabel = (a, b) => a.label.localeCompare(b.label, 'zh-CN');
  const byRelation = (a, b) => a.relation.localeCompare(b.relation) || byLabel(a, b);
  for (const key of ['dependencies', 'structure', 'meaning', 'hierarchy']) groups[key].sort(byRelation);
  groups.callers.sort(byLabel);
  groups.calls.sort(byLabel);

  const labels = {
    callers: '调用者', calls: '调用', dependencies: '依赖', structure: '结构', meaning: '说明', hierarchy: '继承',
  };
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ key, label: labels[key], items: clip(items, 120) }));
}

/** The rationale rows attached to one node, newest-last. */
function rationaleRows(document, byId, nodeId) {
  return document.edges
    .filter((edge) => edge.relation === 'rationale_for' && edge.target === nodeId)
    .map((edge) => byId.get(edge.source))
    .filter((row) => row !== undefined && String(row.label ?? '') !== '')
    .sort((a, b) => a.start_line - b.start_line)
    .map((row) => ({ text: row.label, origin: row.origin ?? 'comment', line: row.start_line }));
}

/** A one-line excerpt of a note body, for the list. */
function excerptOf(body) {
  const text = String(body ?? '')
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s*/u, '').replace(/^[-*]\s*/u, '').trim())
    .filter((line) => line !== '' && !line.startsWith('```'))
    .slice(0, 2)
    .join(' ');
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

/**
 * The folder tree with direct note counts.
 *
 * Direct counts, not recursive: a folder that contains three subfolders of
 * twenty notes each showing "0" is honest — it holds no notes itself.
 * @param folders - the stored folder rows.
 * @param notes - the stored note rows.
 * @returns the tree, roots first.
 */
/**
 * The folder name path of every folder, outermost first.
 *
 * Exports mirror the library's folder tree onto disk, so the flat folder rows
 * have to be walked up to their root. A broken parent link (or a cycle) stops
 * the walk instead of hanging it.
 * @param folders - the stored folder rows.
 * @returns `{byId, all}` — id -> names, plus every folder's names.
 */
function folderSegments(folders) {
  const rows = Array.isArray(folders) ? folders : [];
  const byId = new Map();
  const parentOf = new Map();
  for (const folder of rows) {
    byId.set(folder.id, folder);
    parentOf.set(folder.id, folder.parentId ?? null);
  }
  const cache = new Map();
  const pathOf = (id) => {
    if (cache.has(id)) return cache.get(id);
    const names = [];
    const seen = new Set();
    let cursor = id;
    while (typeof cursor === 'string' && cursor !== '' && !seen.has(cursor)) {
      seen.add(cursor);
      const folder = byId.get(cursor);
      if (folder === undefined) break;
      names.unshift(String(folder.name ?? ''));
      cursor = parentOf.get(cursor) ?? null;
    }
    cache.set(id, names);
    return names;
  };
  const all = [];
  for (const folder of rows) all.push(pathOf(folder.id));
  return { byId: pathOf, all };
}

function folderTree(folders, notes) {
  const counts = new Map();
  for (const note of notes) {
    if (note.folderId === null || note.folderId === undefined) continue;
    counts.set(note.folderId, (counts.get(note.folderId) ?? 0) + 1);
  }
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parentId ?? '';
    const list = byParent.get(key) ?? [];
    list.push(folder);
    byParent.set(key, list);
  }
  const build = (parentId) => (byParent.get(parentId) ?? [])
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
      noteCount: counts.get(folder.id) ?? 0,
      children: build(folder.id),
    }));
  return build('');
}

/* ------------------------------------------------------------------ *
 * v3: file tree                                                      *
 * ------------------------------------------------------------------ */

/** Directories the tree walk never descends into (contract §3.1 subset). */
const TREE_SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', 'dist', 'build', 'out',
  'target', '__pycache__', '.next', '.nuxt', '.turbo', '.cache', 'coverage',
  'vendor', 'Pods', '.gradle', '.cargo', 'site-packages', '.dsh',
]);

/** Hard cap on one tree response; above it `truncated` is set. */
const TREE_ENTRY_CAP = 20000;

/** Directory depth cap, matching the build walk's own bound. */
const TREE_MAX_DEPTH = 24;

/** NUL-byte sniff: the first block of a binary file carries a NUL byte. */
async function looksBinary(absolute) {
  try {
    const handle = await fs.open(absolute, 'r');
    const block = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(block, 0, 4096, 0);
    await handle.close();
    return block.subarray(0, bytesRead).includes(0);
  } catch {
    return true;
  }
}

/**
 * Walk the workspace, returning a flat `{path,type,size?}` list.
 *
 * Directories are emitted before the files inside them; every path is POSIX and
 * relative to `root`. Binary files and the skipped tooling directories are left
 * out; a response above the entry cap is flagged `truncated` rather than silently
 * cut.
 * @param root - absolute workspace root.
 * @returns `{ root, entries, truncated }`.
 */
async function walkTree(root) {
  const entries = [];
  let truncated = false;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (depth > TREE_MAX_DEPTH) continue;
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    for (const entry of dirents) {
      if (entries.length >= TREE_ENTRY_CAP) { truncated = true; break; }
      const absolute = join(dir, entry.name);
      const rel = relative(root, absolute).split(sep).join('/');
      if (entry.isDirectory()) {
        if (TREE_SKIP_DIRS.has(entry.name)) continue;
        entries.push({ path: rel, type: 'dir' });
        queue.push({ dir: absolute, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (await looksBinary(absolute)) continue;
      let stat;
      try {
        stat = await fs.stat(absolute);
      } catch {
        continue;
      }
      entries.push({ path: rel, type: 'file', size: stat.size });
    }
    if (truncated) break;
  }
  return { root, entries, truncated };
}

/** Attach live drift status to a note's stored anchors. */
async function withAnchorStatus(root, note) {  const anchors = Array.isArray(note.anchors) ? note.anchors : [];
  if (anchors.length === 0) return note;
  const { anchors: refreshed } = await refreshAnchors(root, anchors);
  return { ...note, anchors: refreshed };
}

/**
 * Unwrap one `updateNotes` cycle, surfacing a failed disk write as an error.
 *
 * A write that failed used to be swallowed: the in-memory mutation was returned as
 * success while the document never landed on disk (§3.5.4). Every mutating notes
 * / annotations op goes through this so a persisted-state failure becomes a 400.
 * @param result - `{ value, saved }` from `updateNotes`.
 * @returns the stored value.
 */
function persisted(result) {
  if (result.saved === false) throw new Error('failed to persist notes state');
  return result.value;
}

/**
 * Rewrite the `### path:start-end` heading a note body carries after a range
 * moved. Only heading lines are touched: the same path can appear inside prose
 * or the quoted code itself, and those must stay byte-identical.
 *
 * @param body - the note Markdown.
 * @param path - citation path as the note stored it.
 * @param startLine - new 1-based start.
 * @param endLine - new 1-based end.
 * @returns the rewritten body (unchanged when no heading matches).
 */
function syncBodyRange(body, path, startLine, endLine) {
  const wanted = String(path ?? '').replace(/\\/gu, '/');
  if (wanted === '' || body === '') return body;
  const name = wanted.split('/').pop() ?? '';
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const range = `${startLine}-${endLine}`;
  const heading = new RegExp(`^(\\s{0,3}#{1,6}\\s+)(?:.*?/)?${escaped}:\\d+(?:-\\d+)?\\s*$`, 'u');
  return body.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed.includes(wanted) && !(name !== '' && trimmed.includes(name))) return line;
    if (!heading.test(trimmed)) return line;
    const prefix = trimmed.match(/^#{1,6}\s+/u)?.[0] ?? '### ';
    return `${prefix}${wanted}:${range}`;
    }).join('\n');
}

/**
 * Normalise one citation into the shape the composer, the renderer and the anchor
 * table all agree on.
 *
 * WIRE §6 documents `{path, line, symbol}`; the note template reads
 * `startLine`/`endLine`; the anchor row stores both. Normalising once here is what
 * stops a note from rendering `### mod.py:undefined-undefined` — the renderer and
 * the anchor check must agree on where the range starts.
 *
 * @param root - absolute workspace root, for reading the snippet.
 * @param ref - the citation as the caller sent it.
 * @returns `{ path, startLine, endLine, symbol, code }`.
 */
async function normaliseRef(root, ref) {
  const startLine = Math.max(1, Math.trunc(Number(ref.line ?? ref.startLine ?? 1)));
  const endLine = Math.max(startLine, Math.trunc(Number(ref.endLine ?? ref.line ?? ref.startLine ?? startLine)));
  // Record the range that was *actually* read, not the requested one: when the
  // snippet is clipped to the line/character cap, storing the requested endLine
  // makes the next drift check hash a different span and report a false moved 0
  // (§3.5.2).
  const detailed = await readRangeDetailed(root, ref.path, startLine, endLine, 40);
  if (detailed === null) {
    return { path: String(ref.path ?? ''), startLine, endLine, symbol: ref.symbol ?? null, code: undefined };
  }
  return {
    path: String(ref.path ?? ''),
    startLine: detailed.startLine,
    endLine: detailed.endLine,
    symbol: ref.symbol ?? null,
    code: detailed.text,
  };
}

/**
 * Assemble a new note row, either from an explicit body or from the documented
 * no-model template.
 *
 * Asynchronous because every citation becomes an anchor, and an anchor without
 * the code's *text* and *hash* cannot be checked later — it could only ever say
 * "the file exists", never "this is still the code the note describes". The same
 * resolved references feed the composed body, so the note shows the code it cites
 * instead of a placeholder.
 *
 * @param root - absolute workspace root.
 * @param document - the notes document.
 * @param payload - the request.
 * @returns the note row.
 */
async function makeNote(root, document, payload) {
  let title = collapseWhitespace(payload.title ?? '');
  let body = typeof payload.body === 'string' ? payload.body : '';
  const rawRefs = Array.isArray(payload.codeRefs) ? payload.codeRefs : [];

  // Resolve every citation once, then reuse the result for both the composed body
  // and the anchors. Doing it twice was how the body came out with
  // `undefined-undefined` while the anchor was correct.
  const refs = [];
  for (const ref of rawRefs) refs.push(await normaliseRef(root, ref));

  // A note created with only prose still gets the four-heading shape: a reader
  // who has twenty of these navigates by heading, and one odd note breaks that.
  if (body === '' || (payload.compose === true && !body.includes('## 知识点'))) {
    const sections = body === ''
      ? fallbackSections(payload.source ?? '', refs)
      : sectionsFromText(splitSections(stripLeadingH1(body)), body);
    if (title === '') title = resolveTitle(sections, body, basename(root));
    body = composeNote(title, sections, refs);
  }
  if (title === '') title = `笔记 ${new Date().toISOString().slice(0, 10)}`;

  const codeRefs = refs.map((ref) => ({
    path: ref.path,
    line: ref.startLine,
    endLine: ref.endLine,
    symbol: ref.symbol,
  }));

  // The commit is what makes the anchor answerable after the code is rewritten:
  // line numbers in a note are meaningless once the file moves on, but
  // `commit:path` is still the exact blob the reader was looking at.
  const commit = await headCommit(root);

  const note = {
    id: `n_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    title,
    folderId: payload.folderId === undefined || payload.folderId === null || payload.folderId === ''
      ? null : String(payload.folderId),
    body,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    codeRefs,
    anchors: [],
    conversationId: payload.conversationId ?? null,
  };

  // One anchor per citation, carrying the code as it read at this moment. A
  // citation to a file that is gone still gets an anchor — its `missing` status
  // is information the reader needs, not a reason to drop the reference.
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    const snippet = ref.code ?? null;
    note.anchors.push({
      id: `a_${index}_${Date.now().toString(36)}`,
      path: ref.path,
      startLine: ref.startLine,
      endLine: ref.endLine,
      symbol: ref.symbol,
      snippet: snippet ?? '',
      hash: snippet === null ? null : snippetHash(snippet),
      commit,
      status: snippet === null ? 'missing' : 'fresh',
    });
  }

  document.anchors.push(...note.anchors.map((anchor) => ({ ...anchor, noteId: note.id })));
  return note;
}

/* ------------------------------------------------------------------ *
 * Plugin entry                                                       *
 * ------------------------------------------------------------------ */

/**
 * Cordis plugin body.
 * @param ctx - host context (webServer, tools, workingDirectory, logger).
 * @param rowConfig - the row's config; unknown or missing fields take defaults.
 */
export function apply(ctx, rowConfig = {}) {
  const config = { ...CONFIG_DEFAULTS, ...(rowConfig ?? {}) };
  const cwdOf = makeCwdResolver(ctx);
  const defaultDir = ctx.get('workingDirectory')?.defaultDirectory;

  // ---- Main-conversation reading rules ---------------------------------
  //
  // The composer inserts a code reference, but DSH's own model sees the normal
  // conversation system prompt. A Host prompt section is the only supported way
  // to make those rules reach it. The section text is conditional on the
  // presence of a CodeSlice reference, so a normal conversation is untouched.
  void readPrompts().catch(() => {});
  ctx.inject(['systemPrompt'], (sctx) => {
    const service = sctx.get('systemPrompt') ?? ctx.get('systemPrompt');
    if (service === undefined || service === null || typeof service.section !== 'function') {
      ctx.logger?.warn?.('codeslice: the systemPrompt service is unavailable; main-conversation reading rules are not injected');
      return;
    }
    try {
      ctx.effect(() => service.section({
        name: 'codeslice-reading',
        order: 100,
        text: () => systemSectionText(),
      }), 'codeslice: system prompt section');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.warn?.(`codeslice: system prompt section failed: ${message}`);
    }
  });

  // ---- Analysis tools ---------------------------------------------------
  ctx.inject(['tools'], (tctx) => {
    const tools = tctx.get('tools') ?? ctx.get('tools');
    if (tools === undefined) {
      ctx.logger?.warn?.('codeslice: the tools service is unavailable; analysis tools are not registered');
      return;
    }
    for (const definition of toolDefinitions(cwdOf, config)) {
      try {
        ctx.effect(() => tools.register(definition), `codeslice: tool ${definition.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: registering ${definition.name} failed: ${message}`);
      }
    }
    // v2: the tools that answer from the workspace and write into the knowledge
    // base. Registered one at a time for the same reason as above — a single bad
    // schema must not cost the model every other tool.
    //
    // Their `defaultDir` is the CALLING agent's own workspace, not the plugin's
    // boot-time default: a model turn in another session must answer about that
    // session's project. `cwdOf(exec.agent)` is the only thing that knows it, so
    // the tools are built once with a resolver instead of a fixed directory.
    const chatTools = chatToolDefinitions({
      defaultDir: undefined,
      load: (root, force) => documentFor(root, config, { force }),
    });
    for (const definition of chatTools) {
      try {
        ctx.effect(() => tools.register({
          ...definition,
          // Wrap `execute` so each call resolves its own directory first. An
          // explicit `root` the model passed still wins; the spread order alone
          // would let an explicit `undefined` shadow the resolved directory, so
          // the fallback is applied only when the argument is genuinely absent.
          execute: (args, exec) => {
            const supplied = args !== null && typeof args === 'object' ? args.root : undefined;
            const root = typeof supplied === 'string' && supplied.trim() !== ''
              ? supplied
              : cwdOf(exec?.agent);
            return definition.execute({ ...(args ?? {}), root }, exec);
          },
        }), `codeslice: tool ${definition.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`codeslice: registering ${definition.name} failed: ${message}`);
      }
    }
  });

  // ---- HTTP API ---------------------------------------------------------
  const methods = apiMethods({ config, defaultDir });

  /**
   * The one streaming method.
   *
   * It is NOT in the method table because that table's contract is
   * "`(payload) => value`, answered as one JSON envelope". `ask` writes SSE
   * frames as they arrive (a buffered answer would defeat the point), so it
   * takes the response object and owns the whole lifecycle.
   *
   * Its signature is `(payload, context, res)`: called without `res` it collects
   * the frames and returns them, which is what makes the streaming path testable
   * without an HTTP server.
   */
  const streaming = {
    ask: askHandler({ defaultDir, load: (root, force) => documentFor(root, config, { force }) }),
  };

  // The vendored Better Sidebar client's own wire (`/sidebar/api`): file
  // browsing and editing only. It shares this plugin's admission fence and
  // session-root resolution with the CodeSlice API below.
  const sidebarApi = createSidebarApi(ctx, defaultDir);
  const sidebarWrite = createSidebarWrite(ctx, defaultDir);
  ctx.inject(['webServer'], (sctx) => {
    const webServer = sctx.get('webServer');
    if (webServer === undefined) return;
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/sidebar/api',
      handler: (req, res) => {
        if (isUnadmitted(ctx, req)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
          return;
        }
        return sidebarApi.handle(req, res);
      },
    }), 'codeslice: vendored sidebar api');
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/sidebar/write',
      handler: (req, res) => {
        if (isUnadmitted(ctx, req)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
          return;
        }
        return sidebarWrite.handle(req, res);
      },
    }), 'codeslice: vendored sidebar write');
  });

  ctx.inject(['webServer'], (sctx) => {
    const webServer = sctx.get('webServer');
    if (webServer === undefined) {
      ctx.logger?.warn?.('codeslice: the web server is unavailable; the panel cannot load data');
      return;
    }

    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/codeslice/api',
      handler: async (req, res) => {
        // The same admission test the harness uses for its own plugin routes: a
        // request from an unadmitted peer must not be able to read the index.
        //
        // Resolved PER REQUEST, not captured at inject time: the connection
        // service may be composed after this plugin activates, and a captured
        // `undefined` would then leave the route serving unadmitted forever.
        // Resolving late costs one map lookup and cannot go stale.
        const connection = ctx.get('connection');
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

        // ---- streaming methods -------------------------------------
        //
        // `req.method === 'POST'` only: an SSE answer is a side effect on the
        // conversation (it appends a turn), so it must not be reachable by a
        // bare GET that a browser could be talked into loading.
        if (Object.hasOwn(streaming, method)) {
          if (req.method !== 'POST') {
            writeJson(res, 405, {
              ok: false,
              error: { code: 'method-not-allowed', message: `${method} requires POST` },
            });
            return;
          }
          const payload = await readBody(req);
          try {
            await streaming[method](payload, { ctx }, res);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger?.warn?.(`codeslice: ${method} failed: ${message}`);
            // A stream may already be open; the handler owns its own frames from
            // the moment it writes headers. Only answer as JSON when it has not.
            if (!res.headersSent) {
              writeJson(res, 400, { ok: false, error: { code: 'analysis-error', message } });
            } else {
              try {
                res.end();
              } catch {
                // The peer is gone; nothing left to close.
              }
            }
          }
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
          writeJson(res, 200, { ok: true, value: await handler(payload, { ctx }) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger?.warn?.(`codeslice: ${method} failed: ${message}`);
          writeJson(res, 400, { ok: false, error: { code: 'analysis-error', message } });
        }
      },
    }), 'codeslice: /codeslice/api routes');

    // Lazy client chunks. Same admission fence as the API: these files contain
    // no workspace data, but an unadmitted peer should not get a plugin asset
    // either. The path is looked up in the allow-list, never resolved from the
    // request, so `../` cannot escape the plugin directory.
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/codeslice/assets',
      handler: async (req, res) => {
        const connection = ctx.get('connection');
        if (connection !== undefined && connection.requestRejection?.(req) !== undefined) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
          return;
        }
        if (req.method !== 'GET') {
          writeJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'assets require GET' } });
          return;
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal');
        const name = url.pathname.startsWith('/codeslice/assets/')
          ? url.pathname.slice('/codeslice/assets/'.length)
          : '';
        const asset = CLIENT_ASSETS.get(name);
        if (asset === undefined) {
          writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown asset' } });
          return;
        }
        try {
          const body = await fs.readFile(join(PLUGIN_DIR, asset.file));
          res.writeHead(200, {
            'content-type': asset.type,
            'content-length': body.length,
            // The URL is stable across plugin versions; ETag-free no-cache keeps
            // an upgraded chunk from being served out of a stale disk cache.
            'cache-control': 'no-cache',
          });
          res.end(body);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger?.warn?.(`codeslice: asset ${name} unavailable: ${message}`);
          writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'asset is missing' } });
        }
      },
    }), 'codeslice: client assets');
  });

  // Warm the default workspace in the background so a first panel open is not a
  // cold start. Unref'd: it must never hold the process open.
  if (typeof defaultDir === 'string' && defaultDir !== '') {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        documentFor(defaultDir, config).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger?.warn?.(`codeslice: warm-up indexing failed: ${message}`);
        });
      }, 1500);
      timer.unref?.();
      return () => clearTimeout(timer);
    }, 'codeslice: index warm-up');
  }
}

/** Exported for tests: build one document without a Cordis context. */
export { buildDocument, documentFor, CONFIG_DEFAULTS };
