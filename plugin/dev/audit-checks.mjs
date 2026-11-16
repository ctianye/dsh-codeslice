// Scratch: the audit's own critical checks, run directly. Each one either passes
// or prints the exact counter-example, so a failure is actionable.
import { readFileSync, readdirSync } from 'node:fs';
import { buildDocument, CONFIG_DEFAULTS, apiMethods, toolDefinitions } from '../index.js';
import { renderSubgraphText, expand, tokenizeQuestion } from '../lib/query.js';
import { searchTokens } from '../lib/retrieval.js';
import { detectCommunities, applyCommunities, topologyKey } from '../lib/cluster.js';
import { scanSource } from '../lib/analyzer.js';
import { RELATIONS, CONF_EXTRACTED, CONF_INFERRED } from '../lib/model.js';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

const root = 'D:/dsh-CodeSlice';
const document = await buildDocument(root, CONFIG_DEFAULTS);

/* ---- A. vocabulary honesty -------------------------------------------- */
const emitted = new Set(document.edges.map((edge) => edge.relation));
const forbidden = ['references', 'implements', 'declares'].filter((relation) => emitted.has(relation));
check('never emits references/implements/declares', forbidden.length === 0, forbidden.join(','));
check('every emitted relation is declared', [...emitted].every((relation) => RELATIONS.includes(relation)),
  [...emitted].join(','));
check('every edge confidence is EXTRACTED or INFERRED',
  document.edges.every((edge) => edge.confidence === CONF_EXTRACTED || edge.confidence === CONF_INFERRED));

/* ---- A. renderer byte parity ------------------------------------------ */
{
  const nodes = [
    { id: 'n1', label: 'enrich', kind: 'function', path: 'app/services/ollama.py', start_line: 41, end_line: 50, degree: 1, community: 3, community_label: 'ollama.py +2' },
    { id: 'n2', label: '_request', kind: 'function', path: 'app/services/ollama.py', start_line: 12, end_line: 20, degree: 1, community: 3, community_label: 'ollama.py +2' },
  ];
  const edges = [{ source: 'n1', target: 'n2', relation: 'calls', confidence: 'EXTRACTED', line: 45 }];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const expanded = expand(byId, edges, ['n1'], 'bfs', 2);
  const text = renderSubgraphText(byId, edges, expanded, { seeds: ['n1'], scores: new Map([['n1', 4.62]]), tokenBudget: 2000 });
  const expected = 'Subgraph: 2 nodes, 1 edges (budget 2000 tokens)\nNode: enrich\n  Kind: function  Source: app/services/ollama.py:L41\n  Community: 3 (ollama.py +2)\n  Relevance: 4.62\n  Connections (1):\n    --> _request [calls] [EXTRACTED]\n\nNode: _request\n  Kind: function  Source: app/services/ollama.py:L12\n  Community: 3 (ollama.py +2)';
  check('renderer matches the spec byte for byte', text === expected);
}

/* ---- A. tokenizers ---------------------------------------------------- */
{
  const cjk = searchTokens('本地优先的代码阅读助手');
  check('CJK bigrams: 10, adjacent pairs', cjk.length === 10 && cjk[0] === '本地' && cjk[9] === '助手', cjk.join(' '));
  check('question tokenizer drops stopwords', JSON.stringify(tokenizeQuestion('How does the Agent call a tool')) === '["agent","call","tool"]');
  check('single ASCII chars dropped', JSON.stringify(searchTokens('a b ab')) === '["ab"]');
}

/* ---- A. language gate cannot be bypassed ------------------------------ */
{
  // A bare call in a gated language must NOT bind to a globally unique name in
  // another file when the name is not local and not import-bound.
  const caller = scanSource('export function go() { helper(); }\n', 'typescript', 'a.ts', {});
  const callee = scanSource('export function helper() { return 1; }\n', 'typescript', 'b.ts', {});
  const { resolveGraph } = await import('../lib/resolve.js');
  const resolved = resolveGraph([caller, callee], {});
  const callEdge = resolved.edges.find((edge) => edge.relation === 'calls' && edge.source.startsWith('a.ts'));
  check('gated language refuses a global-unique bare call', callEdge === undefined,
    callEdge === undefined ? 'dropped as designed' : `bound to ${callEdge.target}`);

  // The same shape in a non-gated language may bind.
  const goCaller = scanSource('package main\nfunc go2() { helper() }\n', 'go', 'a.go', {});
  const goCallee = scanSource('package main\nfunc helper() {}\n', 'go', 'b.go', {});
  const goResolved = resolveGraph([goCaller, goCallee], {});
  const goEdge = goResolved.edges.find((edge) => edge.relation === 'calls' && edge.source.startsWith('a.go'));
  check('non-gated language uses the unique-name rung', goEdge !== undefined, goEdge?.target ?? 'no edge');
}

/* ---- A. communities --------------------------------------------------- */
{
  const nodes = [];
  const edges = [];
  for (let index = 0; index < 5; index += 1) {
    nodes.push({ id: `a${index}`, path: 'a.js' });
    nodes.push({ id: `b${index}`, path: 'b.js' });
  }
  for (let i = 0; i < 5; i += 1) {
    for (let j = i + 1; j < 5; j += 1) {
      edges.push({ source: `a${i}`, target: `a${j}` });
      edges.push({ source: `b${i}`, target: `b${j}` });
    }
  }
  const communities = detectCommunities(nodes, edges);
  check('two disjoint cliques → two communities', communities.length === 2, String(communities.length));
  check('community labels name the majority file', communities.every((row) => /\.js/u.test(row.label)),
    communities.map((row) => row.label).join(' | '));
}

/* ---- A. topology key -------------------------------------------------- */
{
  const nodes = document.nodes.slice(0, 50);
  const edges = document.edges.slice(0, 80);
  const key = topologyKey(nodes, edges);
  check('topologyKey is 32 hex chars', /^[0-9a-f]{32}$/u.test(key), key);
  check('topologyKey is stable', key === topologyKey(nodes, edges));
  check('topologyKey changes when an edge goes', key !== topologyKey(nodes, edges.slice(1)));
  // Recolouring must not change it: community assignment is not topology.
  const recoloured = nodes.map((node) => ({ ...node, community: 99, community_label: 'x' }));
  check('topologyKey ignores community assignment', key === topologyKey(recoloured, edges));
}

/* ---- D. security surface --------------------------------------------- */
{
  // Client sources now live under `client/src/**` (sidebar/ graph/ workbench/),
  // so collect `.js` files recursively instead of reading one flat directory.
  const collectJs = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return collectJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
  const clients = collectJs('D:/dsh-CodeSlice/plugin/client/src');
  const hosts = ['D:/dsh-CodeSlice/plugin/index.js',
    ...readdirSync('D:/dsh-CodeSlice/plugin/lib', { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `D:/dsh-CodeSlice/plugin/lib/${entry.name}`)];
  const rules = [
    ['child_process', /\bchild_process\b/u],
    ['eval', /\beval\s*\(/u],
    ['new Function in host', /new Function\s*\(/u],
    ['network in host', /\bfetch\s*\(|node:https|node:net|node:dgram/u],
  ];
  // Three sanctioned host capabilities, each confined to one module:
  //   - graphify.js spawns the graphify CLI with a fixed argv and no shell;
  //   - git.js runs read-only git plumbing through execFile with an argv array;
  //   - models.js talks to a loopback Ollama only (see `isLoopback`).
  const sanctioned = {
    child_process: /(^|[\\/])(graphify|git)\.js$/u,
    'network in host': /(^|[\\/])models\.js$/u,
  };
  for (const [label, pattern] of rules) {
    const allow = sanctioned[label];
    const hits = hosts.filter((file) => pattern.test(readFileSync(file, 'utf8'))
      && !(allow !== undefined && allow.test(file)));
    check(`host half has no ${label}`, hits.length === 0, hits.map((file) => file.split('/').pop()).join(','));
  }
  const graphifySource = readFileSync('D:/dsh-CodeSlice/plugin/lib/graphify.js', 'utf8');
  check('graphify spawns without a shell', /shell:\s*false/u.test(graphifySource));
  check('graphify passes an argument array', /spawn\(binary,\s*args/u.test(graphifySource));
  const gitSource = readFileSync('D:/dsh-CodeSlice/plugin/lib/git.js', 'utf8');
  check('git plumbing runs a fixed binary with an argv array',
    /execFile\('git',\s*args/u.test(gitSource));
  const modelsSource = readFileSync('D:/dsh-CodeSlice/plugin/lib/models.js', 'utf8');
  check('models only talks to loopback', /function isLoopback|const isLoopback/u.test(modelsSource)
    && /isLoopback\(origin\)/u.test(modelsSource));
  // The one sanctioned `new Function` is the harness, which evaluates the bundle.
  const clientHits = clients.filter((file) => /\beval\s*\(|new Function\s*\(/u.test(readFileSync(file, 'utf8')));
  check('client sources have no eval/Function', clientHits.length === 0, clientHits.join(','));
  const writes = hosts.filter((file) => /writeFile\s*\(/u.test(readFileSync(file, 'utf8')));
  check('writes only from the state-owning / editor modules',
    writes.every((file) => /index\.js|store\.js|notes\.js|vectors\.js|note-vectors\.js|sidebar-api\.js/u.test(file)),
    writes.map((f) => f.split('/').pop()).join(','));
}

/* ---- D. route admission ---------------------------------------------- */
{
  const routes = [];
  const services = new Map([
    ['workingDirectory', { defaultDirectory: root, get: () => root }],
    ['webServer', { register: (route) => { routes.push(route); return () => {}; } }],
    // A connection service that REFUSES: the route must answer 403 without
    // touching the index.
    ['connection', { requestRejection: () => 403 }],
  ]);
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services.get(name),
    effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; },
    inject: (deps, cb) => { cb(ctx); return { dispose() {} }; },
  };
  const { apply } = await import('../index.js');
  apply(ctx, {});
  const byPath = (path) => routes.find((entry) => entry.path === path);
  const statusOf = async (path, url, method = 'POST') => {
    let status = 0;
    await byPath(path).handler({
      method,
      url,
      [Symbol.asyncIterator]: async function* () { yield Buffer.from('{}'); },
    }, { writeHead: (code) => { status = code; }, end: () => {} });
    return status;
  };
  check('api route refuses an unadmitted peer with 403',
    await statusOf('/codeslice/api', '/codeslice/api/status') === 403);
  check('assets route refuses an unadmitted peer with 403',
    await statusOf('/codeslice/assets', '/codeslice/assets/editor.js', 'GET') === 403);
  check('sidebar api route refuses an unadmitted peer with 403',
    await statusOf('/sidebar/api', '/sidebar/api/fs.tree') === 403);
  check('sidebar write route refuses an unadmitted peer with 403',
    await statusOf('/sidebar/write', '/sidebar/write') === 403);
}

/* ---- F. contract drift ------------------------------------------------ */
{
  const methods = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: root });
  const wired = ['status', 'rebuild', 'graph', 'node', 'search', 'outline', 'notes', 'annotations', 'files', 'layout'];
  const missing = wired.filter((name) => typeof methods[name] !== 'function');
  check('every WIRE.md method exists', missing.length === 0, missing.join(','));

  const graphs = await methods.graph({ root, scope: 'workspace', limit: 50 });
  const nodeFields = ['id', 'label', 'kind', 'path', 'line', 'endLine', 'degree', 'community', 'communityLabel', 'weight'];
  check('graph nodes carry every documented field',
    (graphs.nodes[0] === undefined) || nodeFields.every((field) => graphs.nodes[0][field] !== undefined),
    Object.keys(graphs.nodes[0] ?? {}).join(','));
  const linkFields = ['id', 'source', 'target', 'relation', 'family', 'confidence', 'line'];
  check('graph links carry every documented field',
    (graphs.links[0] === undefined) || linkFields.every((field) => graphs.links[0][field] !== undefined),
    Object.keys(graphs.links[0] ?? {}).join(','));

  const tools = toolDefinitions(() => root, CONFIG_DEFAULTS).map((definition) => definition.name);
  check('all documented tools registered', ['codeslice_graph_query', 'codeslice_graph_node', 'codeslice_graph_path',
    'codeslice_graph_rationale', 'codeslice_search', 'codeslice_definition', 'codeslice_references',
    'codeslice_outline', 'codeslice_notes', 'codeslice_index'].every((name) => tools.includes(name)),
    `${tools.length} tools`);
  check('v0.2.0 aliases still registered', ['codeslice_symbol', 'codeslice_callers', 'codeslice_inheritance',
    'codeslice_explain', 'codeslice_hot'].every((name) => tools.includes(name)));
}

console.log(`\n${results.filter((row) => row.ok).length}/${results.length} audit checks passed`);
process.exit(results.some((row) => !row.ok) ? 1 : 0);
