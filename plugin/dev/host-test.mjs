// Host-half smoke test: indexes a real workspace and exercises every tool and
// every HTTP method without DSH. No dependencies.
//
//   node dev/host-test.mjs [root]        default root: the repo this plugin lives in
//   node dev/host-test.mjs --verbose
//
// Exit code 0 means every check passed. It prints a compact report so a
// regression (a tool that returns nothing, a route that 500s) is visible at a
// glance instead of buried in JSON.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { apply, toolDefinitions, apiMethods, buildDocument, CONFIG_DEFAULTS } from '../index.js';
import { tokenizeQuestion } from '../lib/query.js';
import { searchTokens } from '../lib/retrieval.js';
import { makeNodeId, familyOf, fileNodeId } from '../lib/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes('--verbose');
const root = resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? resolve(here, '../..'));

let failures = 0;
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}${detail === '' ? '' : ` — ${detail}`}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL ${name}${detail === '' ? '' : ` — ${detail}`}`);
  return false;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/**
 * Prove the rationale pipeline works without requiring the corpus to contain one.
 *
 * A repository that writes no `NOTE:`/`WHY:` comments and no docstrings should
 * report zero rationales, so asserting "the workspace has one" tests the fixture,
 * not the code. This builds the smallest input that must produce one.
 * @returns true when both a marker comment and a docstring became nodes.
 */
async function rationaleSmokeTest() {
  const { scanSource } = await import('../lib/analyzer.js');
  const python = 'def run():\n    """Why this exists."""\n    # NOTE: marker body\n    return 1\n';
  const extracted = scanSource(python, 'python', 'smoke.py', {});
  const rationales = extracted.nodes.filter((node) => node.kind === 'rationale');
  const docstring = rationales.some((node) => node.origin === 'docstring');
  const marker = rationales.some((node) => node.origin === 'comment');
  return rationales.length >= 2 && docstring && marker;
}

/** A fake Cordis context good enough to activate the plugin. */
function fakeContext() {
  const registered = { tools: [], routes: [] };
  const services = new Map();
  const ctx = {
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    get: (name) => services.get(name),
    provide: (name, value) => services.set(name, value),
    inject: (names, callback) => {
      if (names.every((name) => services.has(name))) callback(ctx);
    },
    effect: (factory) => {
      const dispose = factory();
      return typeof dispose === 'function' ? dispose : () => {};
    },
  };
  const toolsService = {
    register: (definition) => {
      registered.tools.push(definition);
      return () => {};
    },
  };
  const webServer = {
    register: (route) => {
      registered.routes.push(route);
      return () => {};
    },
  };
  services.set('tools', toolsService);
  services.set('webServer', webServer);
  services.set('workingDirectory', {
    defaultDirectory: root,
    get: () => root,
  });
  return { ctx, registered };
}

/** Invoke one registered route the way the HTTP carrier would. */
async function callRoute(route, method, body) {
  const url = new URL(`http://dsh.internal/codeslice/api/${method}`);
  const payload = Buffer.from(JSON.stringify(body ?? {}));
  const req = {
    method: 'POST',
    url: url.pathname,
    async *[Symbol.asyncIterator]() {
      yield payload;
    },
  };
  let status = 0;
  let text = '';
  const res = {
    writeHead: (code) => {
      status = code;
    },
    end: (value) => {
      text = value ?? '';
    },
  };
  await route.handler(req, res);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status, parsed };
}

/* ------------------------------------------------------------------ *
 * Spec test vectors (spec/backend-methods.md §15.7)
 * ------------------------------------------------------------------ */

function checkVectors() {
  section('spec test vectors');

  // The expectation is derived from the input rather than typed out, because a
  // pasted CJK literal is exactly the kind of thing an editor re-encodes. The
  // property under test is "every adjacent pair, in order" — that is the spec.
  const cjkSource = '本地优先的代码阅读助手';
  const bigrams = searchTokens(cjkSource);
  const expectedBigrams = [];
  for (let index = 0; index < cjkSource.length - 1; index += 1) {
    expectedBigrams.push(cjkSource.slice(index, index + 2));
  }
  check(
    'CJK bigram tokenizer',
    JSON.stringify(bigrams) === JSON.stringify(expectedBigrams),
    `${bigrams.length} tokens: ${bigrams.join(' ')}`,
  );
  check('CJK bigram count', bigrams.length === cjkSource.length - 1, `${bigrams.length}/${cjkSource.length - 1}`);

  const ascii = searchTokens('a b ab');
  check('single ASCII chars dropped', JSON.stringify(ascii) === JSON.stringify(['ab']), ascii.join(' '));

  const question = tokenizeQuestion('How does the Agent call a tool');
  check(
    'question tokenizer drops stopwords',
    JSON.stringify(question) === JSON.stringify(['agent', 'call', 'tool']),
    question.join(' '),
  );

  check('makeNodeId', makeNodeId('a/b.py', 'function', 'run', 12) === 'a/b.py::function::run::12');
  check('fileNodeId', fileNodeId('a/b.py') === 'a/b.py::file::__file__::1');
  check('familyOf(calls)', familyOf('calls') === 'behaviour');
  check('familyOf(inherits)', familyOf('inherits') === 'hierarchy');
  check('familyOf(unknown) falls back', familyOf('made_up') === 'other');
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

async function run() {
  console.log(`codeslice host test — root ${root}`);
  checkVectors();

  section('build');
  const started = Date.now();
  let document;
  try {
    document = await buildDocument(root, { ...CONFIG_DEFAULTS });
  } catch (error) {
    check('build completes', false, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
    process.exit(1);
  }
  const elapsed = Date.now() - started;
  check('build completes', true, `${elapsed}ms`);

  console.log(`  files=${document.files.length} lines=${document.lineCount} nodes=${document.nodes.length} edges=${document.edges.length}`);
  check('has files', document.files.length > 0);
  check('has nodes', document.nodes.length > 0);
  check('has edges', document.edges.length > 0);
  check('has communities', (document.communities ?? []).length > 0, `${(document.communities ?? []).length}`);
  check('has a topology key', typeof document.topologyKey === 'string' && document.topologyKey.length === 32, document.topologyKey);
  check('every node has an id and a kind', document.nodes.every((node) => typeof node.id === 'string' && typeof node.kind === 'string'));
  check(
    'every node id is unique',
    new Set(document.nodes.map((node) => node.id)).size === document.nodes.length,
  );
  check(
    'every edge endpoint exists',
    document.edges.every((edge) => document.nodes.some((node) => node.id === edge.source)
      && document.nodes.some((node) => node.id === edge.target)),
    (() => {
      const ids = new Set(document.nodes.map((node) => node.id));
      const bad = document.edges.filter((edge) => !ids.has(edge.source) || !ids.has(edge.target));
      return bad.length === 0 ? '' : `${bad.length} dangling (first: ${JSON.stringify(bad[0])})`;
    })(),
  );
  check(
    'every edge has a known relation',
    document.edges.every((edge) => typeof edge.relation === 'string' && edge.relation !== ''),
  );
  check(
    'every edge confidence is EXTRACTED or INFERRED',
    document.edges.every((edge) => edge.confidence === 'EXTRACTED' || edge.confidence === 'INFERRED'),
  );
  check('stats.by_relation is populated', Object.keys(document.stats?.by_relation ?? {}).length > 0,
    JSON.stringify(document.stats?.by_relation ?? {}));
  // Rationale nodes come from docstrings and marker comments. A workspace that
  // writes neither legitimately has zero, so the assertion is "the scanner can
  // produce one" (checked by scanning a synthetic file) plus "the corpus's own
  // count is reported" — not "this particular repo happens to have one".
  check('scanner emits rationale nodes', await rationaleSmokeTest(), 'synthetic NOTE:/WHY: file');
  check('rationale count is reported', typeof (document.stats?.rationale) === 'number',
    String(document.stats?.rationale ?? 0));
  check('resolved at least one inheritance edge', document.edges.some((edge) => edge.relation === 'inherits'),
    String(document.edges.filter((edge) => edge.relation === 'inherits').length));
  check('resolved at least one call edge', document.edges.some((edge) => edge.relation === 'calls'));

  if (verbose) {
    const kinds = document.nodes.reduce((counts, node) => {
      counts[node.kind] = (counts[node.kind] ?? 0) + 1;
      return counts;
    }, {});
    console.log(`  kinds: ${JSON.stringify(kinds)}`);
    console.log(`  scanErrors: ${JSON.stringify(document.scanErrors ?? [])}`);
  }

  /* ---- tools ---- */
  section('tools');
  // Pick the sample file from the index itself so this test works on any
  // workspace: a fixture that names a path only one repository has is a test
  // that fails for the wrong reason.
  const sampleFile = (() => {
    const withSymbols = document.nodes
      .filter((node) => node.kind === 'function' || node.kind === 'class')
      .reduce((counts, node) => {
        counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
        return counts;
      }, new Map());
    const ranked = [...withSymbols.entries()].sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] ?? document.files[0]?.path;
  })();
  const secondFile = (() => {
    const withSymbols = document.nodes
      .filter((node) => node.kind === 'function' || node.kind === 'class')
      .reduce((counts, node) => {
        counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
        return counts;
      }, new Map());
    const ranked = [...withSymbols.entries()].sort((a, b) => b[1] - a[1]);
    return ranked[1]?.[0] ?? sampleFile;
  })();
  console.log(`  sample: ${sampleFile}`);

  const cwdOf = () => root;
  const definitions = toolDefinitions(cwdOf, { ...CONFIG_DEFAULTS });
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  check('registered every documented tool', ['codeslice_graph_query', 'codeslice_graph_node', 'codeslice_graph_path',
    'codeslice_graph_rationale', 'codeslice_search', 'codeslice_definition', 'codeslice_references',
    'codeslice_outline', 'codeslice_notes', 'codeslice_index'].every((name) => byName.has(name)),
    String(definitions.length));

  const exec = { agent: { session: { header: { cwd: root } } } };
  const call = async (name, args) => {
    const definition = byName.get(name);
    if (definition === undefined) return { missing: true };
    try {
      return await definition.execute({ root, ...args }, exec);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
  const textOf = (value) => {
    if (Array.isArray(value)) return value.map((block) => block.text ?? '').join('\n');
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  };

  const hot = textOf(await call('codeslice_hot', { limit: 5 }));
  check('codeslice_hot returns rows', hot.includes('symbols') && hot.length > 40, `${hot.length}B`);

  const indexTextResult = textOf(await call('codeslice_index', {}));
  check('codeslice_index reports counts', indexTextResult.includes('nodes:') && indexTextResult.includes('call resolution'),
    indexTextResult.split('\n')[0] ?? '');

  const query = textOf(await call('codeslice_graph_query', { question: 'how does the graph get built' }));
  check('codeslice_graph_query renders a subgraph', /Subgraph: \d+ nodes?, \d+ edges?/u.test(query) || query.includes('没有匹配'),
    query.split('\n')[0] ?? '');

  const outline = textOf(await call('codeslice_outline', { path: sampleFile }));
  check('codeslice_outline finds a known file', outline.includes(sampleFile), outline.split('\n')[0] ?? '');

  const search = textOf(await call('codeslice_search', { query: 'community detection', limit: 3 }));
  // Assert the *shape* of a hit rather than the absence of a phrase: a snippet is
  // real source, and real source can contain the words "no match" in a string.
  check('codeslice_search returns records', /^### .+:\d+-\d+/mu.test(search), `${search.length}B`);

  const cjk = textOf(await call('codeslice_search', { query: '知识图谱', limit: 3 }));
  check('codeslice_search handles Chinese', cjk.length > 0, `${cjk.length}B`);

  const node = await call('codeslice_graph_node', { name: 'makeNodeId' });
  const nodeText = textOf(node);
  check('codeslice_graph_node resolves a symbol', nodeText.includes('makeNodeId'), nodeText.split('\n')[0] ?? '');

  const rationale = textOf(await call('codeslice_graph_rationale', { name: 'makeNodeId' }));
  check('codeslice_graph_rationale answers', rationale.length > 0, `${rationale.length}B`);

  const path = textOf(await call('codeslice_graph_path', { source: 'model.js', target: 'cluster.js' }));
  check('codeslice_graph_path answers', path.length > 0, path.split('\n')[0] ?? '');

  const refs = textOf(await call('codeslice_references', { name: 'makeNodeId' }));
  check('codeslice_references answers', refs.length > 0, refs.split('\n')[0] ?? '');

  const def = textOf(await call('codeslice_definition', { path: sampleFile, line: 1 }));
  check('codeslice_definition answers', def.length > 0, def.split('\n')[0] ?? '');

  const notes = textOf(await call('codeslice_notes', {}));
  check('codeslice_notes answers', notes.length > 0, notes.split('\n')[0] ?? '');

  /* ---- plugin entry through a fake context ---- */
  section('plugin entry');
  const { ctx, registered } = fakeContext();
  try {
    apply(ctx, {});
    check('apply does not throw', true);
  } catch (error) {
    check('apply does not throw', false, error instanceof Error ? error.message : String(error));
  }
  check('registered tools via ctx.inject', registered.tools.length >= 10, String(registered.tools.length));
  const apiRoute = registered.routes.find((entry) => entry.path === '/codeslice/api');
  const assetRoute = registered.routes.find((entry) => entry.path === '/codeslice/assets');
  check('registered the API route', apiRoute !== undefined);
  check('registered the client-asset route', assetRoute !== undefined);

  /* ---- routes ---- */
  section('routes');
  const route = apiRoute;
  const status = await callRoute(route, 'status', { root });
  check('status 200', status.status === 200 && status.parsed?.ok === true,
    status.parsed?.error?.message ?? '');
  const value = status.parsed?.value ?? {};
  check('status reports node counts', (value.nodes ?? 0) > 0, `nodes=${value.nodes} edges=${value.edges} communities=${value.communities}`);
  check('status reports call resolution', (value.callsProject ?? 0) > 0, `${value.callsExtracted}/${value.callsProject}`);

  const graph = await callRoute(route, 'graph', { root, scope: 'workspace', limit: 120 });
  check('graph 200', graph.status === 200 && Array.isArray(graph.parsed?.value?.nodes), graph.parsed?.error?.message ?? '');
  check('graph nodes carry community and degree',
    (graph.parsed?.value?.nodes ?? []).every((row) => typeof row.community === 'number' && typeof row.degree === 'number'));
  check('graph links carry relation and family',
    (graph.parsed?.value?.links ?? []).every((row) => typeof row.relation === 'string' && typeof row.family === 'string'));
  check('graph respects the limit', (graph.parsed?.value?.nodes ?? []).length <= 120,
    String((graph.parsed?.value?.nodes ?? []).length));

  const fullGraph = await callRoute(route, 'graph', { root, scope: 'workspace', limit: 5000 });
  const fullValue = fullGraph.parsed?.value ?? {};
  check('workspace graph returns the whole repository',
    Array.isArray(fullValue.nodes) && fullValue.nodes.length === fullValue.total?.nodes,
    `${fullValue.nodes?.length} / ${fullValue.total?.nodes}`);
  check('community labels follow the desktop rule',
    (fullValue.nodes ?? []).every((row) => typeof row.communityLabel === 'string' && row.communityLabel !== '')
      && (fullValue.nodes ?? []).some((row) => /^.+ \+\d+$/u.test(row.communityLabel) || row.communityLabel === '未分类'),
    (fullValue.nodes ?? []).find((row) => row.communityLabel)?.communityLabel ?? '');

  const aggregatedGraph = await callRoute(route, 'graph', { root, scope: 'workspace', limit: 20 });
  const aggregatedValue = aggregatedGraph.parsed?.value ?? {};
  check('oversized workspace graph aggregates by community',
    aggregatedValue.aggregated === true
      && (aggregatedValue.nodes ?? []).length <= 20
      && (aggregatedValue.nodes ?? []).every((row) => row.kind === 'community' && row.memberCount >= 1),
    `${aggregatedValue.nodes?.length} communities, aggregated=${aggregatedValue.aggregated}`);
  check('aggregation preserves the original total',
    aggregatedValue.total?.nodes === fullValue.total?.nodes,
    `${aggregatedValue.total?.nodes} / ${fullValue.total?.nodes}`);
  check('aggregated links use the community relation',
    (aggregatedValue.links ?? []).every((row) => row.relation === 'community' && row.family === 'dependency'));

  const communityNode = await callRoute(route, 'node', { root, id: 'community:0' });
  check('an aggregated community node resolves',
    communityNode.status === 200 && communityNode.parsed?.value?.node?.kind === 'community',
    communityNode.parsed?.error?.message ?? '');

  const focusId = graph.parsed?.value?.nodes?.[0]?.id;
  if (typeof focusId === 'string') {
    const focused = await callRoute(route, 'node', { root, id: focusId });
    check('node 200', focused.status === 200, focused.parsed?.error?.message ?? '');
    check('node returns groups and context', Array.isArray(focused.parsed?.value?.groups)
      && typeof focused.parsed?.value?.context === 'string');
  }

  const fileScope = await callRoute(route, 'graph', { root, scope: 'file', path: sampleFile, limit: 80 });
  check('graph scope=file 200', fileScope.status === 200 && (fileScope.parsed?.value?.nodes ?? []).length > 0,
    fileScope.parsed?.error?.message ?? '');

  const searchRoute = await callRoute(route, 'search', { root, query: 'node', limit: 10 });
  check('search 200', searchRoute.status === 200 && Array.isArray(searchRoute.parsed?.value?.definitions),
    searchRoute.parsed?.error?.message ?? '');

  const outlineRoute = await callRoute(route, 'outline', { root, path: sampleFile });
  check('outline 200', outlineRoute.status === 200 && outlineRoute.parsed?.value?.found === true,
    outlineRoute.parsed?.error?.message ?? '');

  const filesRoute = await callRoute(route, 'files', { root, limit: 20 });
  check('files 200', filesRoute.status === 200 && Array.isArray(filesRoute.parsed?.value?.files),
    filesRoute.parsed?.error?.message ?? '');

  const notesRoute = await callRoute(route, 'notes', { root, op: 'list' });
  check('notes list 200', notesRoute.status === 200 && Array.isArray(notesRoute.parsed?.value?.notes),
    notesRoute.parsed?.error?.message ?? '');

  const noteCreate = await callRoute(route, 'notes', {
    root, op: 'create', title: '测试笔记', body: '', source: '这是一次自检产生的笔记。',
    codeRefs: [{ path: sampleFile, line: 1, endLine: 5, symbol: 'model' }],
  });
  check('notes create 200', noteCreate.status === 200 && typeof noteCreate.parsed?.value?.note?.id === 'string',
    noteCreate.parsed?.error?.message ?? '');
  const createdNote = noteCreate.parsed?.value?.note;
  check('created note has the four fixed headings',
    typeof createdNote?.body === 'string' && createdNote.body.includes('## 知识点')
      && createdNote.body.includes('## 关联代码') && createdNote.body.includes('## 要点')
      && createdNote.body.includes('## 何时使用'));
  check('created note cites its code', (createdNote?.codeRefs ?? []).length === 1);

  const noteRead = await callRoute(route, 'notes', { root, op: 'read', id: createdNote?.id });
  check('notes read 200', noteRead.status === 200, noteRead.parsed?.error?.message ?? '');
  check('note anchors report drift', Array.isArray(noteRead.parsed?.value?.note?.anchors)
    && ['fresh', 'moved', 'drifted', 'missing'].includes(noteRead.parsed?.value?.note?.anchors?.[0]?.status),
    JSON.stringify(noteRead.parsed?.value?.note?.anchors?.[0]?.status));

  const folderCreate = await callRoute(route, 'notes', { root, op: 'createFolder', name: '自检目录' });
  check('folder create 200', folderCreate.status === 200 && typeof folderCreate.parsed?.value?.folder?.id === 'string',
    folderCreate.parsed?.error?.message ?? '');
  const folderId = folderCreate.parsed?.value?.folder?.id;
  const folderRename = await callRoute(route, 'notes', { root, op: 'renameFolder', id: folderId, name: '自检目录改' });
  check('folder rename 200', folderRename.status === 200 && folderRename.parsed?.value?.folder?.name === '自检目录改',
    folderRename.parsed?.value?.folder?.name ?? folderRename.parsed?.error?.message ?? '');
  const noteMove = await callRoute(route, 'notes', { root, op: 'update', id: createdNote?.id, folderId });
  check('note moves into a folder', noteMove.status === 200 && noteMove.parsed?.value?.note?.folderId === folderId,
    JSON.stringify(noteMove.parsed?.value?.note?.folderId));
  const folderDelete = await callRoute(route, 'notes', { root, op: 'deleteFolder', id: folderId });
  check('folder delete 200', folderDelete.status === 200 && folderDelete.parsed?.value?.deleted === true,
    folderDelete.parsed?.error?.message ?? '');
  check('folder delete keeps its notes', folderDelete.parsed?.value?.moved === 1,
    JSON.stringify(folderDelete.parsed?.value?.moved));
  const noteAfterFolderDelete = await callRoute(route, 'notes', { root, op: 'read', id: createdNote?.id });
  check('note falls back to the parent folder', noteAfterFolderDelete.parsed?.value?.note?.folderId === null,
    JSON.stringify(noteAfterFolderDelete.parsed?.value?.note?.folderId));

  const notesGraph = await callRoute(route, 'notes', { root, op: 'graph' });
  check('notes graph 200', notesGraph.status === 200 && Array.isArray(notesGraph.parsed?.value?.nodes),
    notesGraph.parsed?.error?.message ?? '');

  const noteDelete = await callRoute(route, 'notes', { root, op: 'delete', id: createdNote?.id });
  check('notes delete 200', noteDelete.status === 200 && noteDelete.parsed?.value?.deleted === true);

  const annotationCreate = await callRoute(route, 'annotations', {
    root, op: 'create', path: sampleFile, startLine: 1, endLine: 6,
    title: '自检批注', body: '这段代码定义了整个插件的词汇表。',
  });
  check('annotations create 200', annotationCreate.status === 200
    && annotationCreate.parsed?.value?.annotation?.drift?.status !== undefined,
    annotationCreate.parsed?.error?.message ?? '');
  const annotationId = annotationCreate.parsed?.value?.annotation?.id;
  const annotationList = await callRoute(route, 'annotations', { root, op: 'list', path: sampleFile });
  check('annotations list 200', annotationList.status === 200
    && (annotationList.parsed?.value?.annotations ?? []).length > 0);
  const annotationDelete = await callRoute(route, 'annotations', { root, op: 'delete', id: annotationId });
  check('annotations delete 200', annotationDelete.status === 200);

  const layoutSave = await callRoute(route, 'layout', { root, positions: { abc: [1, 2] } });
  check('layout save 200', layoutSave.status === 200, layoutSave.parsed?.error?.message ?? '');
  const layoutRead = await callRoute(route, 'layout', { root });
  check('layout read returns what was saved',
    JSON.stringify(layoutRead.parsed?.value?.positions ?? null).includes('abc'),
    JSON.stringify(layoutRead.parsed?.value?.positions ?? null).slice(0, 60));

  /* ---- v3: tree / frames / prompts / projects ---------------------- */
  section('v3 tree, frames, prompts, projects');

  const treeRoute = await callRoute(route, 'tree', { root });
  check('tree 200', treeRoute.status === 200 && Array.isArray(treeRoute.parsed?.value?.entries),
    treeRoute.parsed?.error?.message ?? '');
  const treeEntries = treeRoute.parsed?.value?.entries ?? [];
  check('tree entries carry path and type',
    treeEntries.every((entry) => typeof entry.path === 'string' && ['dir', 'file'].includes(entry.type)));
  check('tree lists the sample file', treeEntries.some((entry) => entry.type === 'file' && entry.path === sampleFile));
  check('tree reports a truncated flag', typeof treeRoute.parsed?.value?.truncated === 'boolean');

  const frameCreate = await callRoute(route, 'frames', {
    root, op: 'create', path: sampleFile, startLine: 1, endLine: 5,
    sessionId: 'host-test', title: '自检方框', question: '这段做什么',
  });
  check('frames create 200', frameCreate.status === 200 && typeof frameCreate.parsed?.value?.frame?.id === 'string',
    frameCreate.parsed?.error?.message ?? '');
  const frameRowId = frameCreate.parsed?.value?.frame?.id;

  const frameList = await callRoute(route, 'frames', { root, op: 'list', sessionId: 'host-test' });
  check('frames list 200', frameList.status === 200, frameList.parsed?.error?.message ?? '');
  const frameRow = (frameList.parsed?.value?.frames ?? []).find((frame) => frame.id === frameRowId);
  check('frame reports a fresh status', frameRow?.status === 'fresh', frameRow?.status ?? '');

  await callRoute(route, 'frames', {
    root, op: 'create', path: sampleFile, startLine: 1, endLine: 5,
    sessionId: 'host-test', title: '自检方框 更新', question: '这段做什么',
  });
  const frameList2 = await callRoute(route, 'frames', { root, op: 'list', sessionId: 'host-test' });
  check('same-range frame dedups to one row', (frameList2.parsed?.value?.frames ?? []).length === 1);
  check('duplicate create overwrites the title',
    frameList2.parsed?.value?.frames?.[0]?.title === '自检方框 更新');

  const frameDelete = await callRoute(route, 'frames', { root, op: 'delete', id: frameRowId });
  check('frames delete 200', frameDelete.status === 200 && frameDelete.parsed?.value?.removed === true);

  const promptsRead = await callRoute(route, 'prompts', { op: 'read' });
  check('prompts read 200', promptsRead.status === 200, promptsRead.parsed?.error?.message ?? '');
  const promptsValue = promptsRead.parsed?.value ?? {};
  check('prompts expose system/qa/note triples', ['system', 'qa', 'note'].every((slot) =>
    typeof promptsValue[slot]?.default === 'string' && typeof promptsValue[slot]?.effective === 'string'
      && promptsValue[slot]?.custom === null));

  const promptsSave = await callRoute(route, 'prompts', { op: 'save', note: '自检自定义笔记提示' });
  check('prompts save 200 and effective follows custom',
    promptsSave.status === 200 && promptsSave.parsed?.value?.note?.effective === '自检自定义笔记提示',
    promptsSave.parsed?.error?.message ?? '');
  const promptsReset = await callRoute(route, 'prompts', { op: 'reset', which: 'note' });
  check('prompts reset clears the note custom',
    promptsReset.status === 200 && promptsReset.parsed?.value?.note?.custom === null);

  const contextRead = await callRoute(route, 'context', {});
  check('context read 200', contextRead.status === 200
    && typeof contextRead.parsed?.value?.enabled === 'boolean',
  contextRead.parsed?.error?.message ?? '');
  const contextOn = await callRoute(route, 'context', { enabled: true });
  check('context on 200', contextOn.status === 200 && contextOn.parsed?.value?.enabled === true);
  const contextOff = await callRoute(route, 'context', { enabled: false });
  check('context off 200', contextOff.status === 200 && contextOff.parsed?.value?.enabled === false);

  const projectsList = await callRoute(route, 'projects', { op: 'list' });
  check('projects list 200', projectsList.status === 200 && Array.isArray(projectsList.parsed?.value?.projects),
    projectsList.parsed?.error?.message ?? '');
  const projectRow = (projectsList.parsed?.value?.projects ?? [])
    .find((project) => resolve(project.root) === root);
  check('current root is registered after the build', projectRow !== undefined);
  if (projectRow !== undefined) {
    const projectRename = await callRoute(route, 'projects', { op: 'rename', id: projectRow.id, name: 'host-test-renamed' });
    check('projects rename 200', projectRename.status === 200
      && projectRename.parsed?.value?.project?.name === 'host-test-renamed');
    const projectRenameBack = await callRoute(route, 'projects', { op: 'rename', id: projectRow.id, name: projectRow.name });
    check('projects rename restores the original name', projectRenameBack.status === 200);
    const projectForget = await callRoute(route, 'projects', { op: 'delete', id: projectRow.id });
    check('projects delete 200', projectForget.status === 200 && projectForget.parsed?.value?.removed === true);
    // Re-register so the registry is left as the next gate expects it.
    await callRoute(route, 'rebuild', { root });
  }

  const statusV3 = await callRoute(route, 'status', { root });
  const statusV3Value = statusV3.parsed?.value ?? {};
  check('status carries the projects summary',
    statusV3.status === 200 && Array.isArray(statusV3Value.projects?.projects));
  check('status carries the prompts summary',
    typeof statusV3Value.prompts?.system?.custom === 'boolean'
      && typeof statusV3Value.prompts?.qa?.custom === 'boolean'
      && typeof statusV3Value.prompts?.note?.custom === 'boolean');

  const refsResult = await call('codeslice_references', { name: 'makeNodeId' });
  check('codeslice_references does not throw a TypeError', refsResult?.error === undefined,
    refsResult?.error ?? '');

  const callersSymbol = (document.nodes.find((node) => node.kind === 'function' || node.kind === 'class')?.label)
    ?? document.nodes[0]?.label;
  const callersDepth1 = textOf(await call('codeslice_callers', { name: callersSymbol, depth: 1 }));
  const callersDepth3 = textOf(await call('codeslice_callers', { name: callersSymbol, depth: 3 }));
  check('codeslice_callers answers at depth 1', callersDepth1.includes('Node:'), callersDepth1.split('\n')[0] ?? '');
  check('codeslice_callers accepts depth 3', callersDepth3.includes('Node:'), callersDepth3.split('\n')[0] ?? '');

  const unknown = await callRoute(route, 'definitely-not-a-method', {});
  check('unknown method 404', unknown.status === 404);

  /* ---- client assets ---- */
  section('client assets');
  const callAsset = async (pathname) => {
    let status = 0;
    let text = '';
    let headers;
    const req = {
      method: 'GET',
      url: pathname,
      async *[Symbol.asyncIterator]() {},
    };
    await assetRoute.handler(req, {
      writeHead: (code, next) => { status = code; headers = next; },
      end: (value) => { text = value ?? ''; },
    });
    return { status, text: String(text), headers };
  };
  const visAsset = await callAsset('/codeslice/assets/vis-network.min.js');
  check('vis-network is served', visAsset.status === 200 && visAsset.text.includes('vis-network'), String(visAsset.status));
  check('vis-network is javascript', String(visAsset.headers?.['content-type'] ?? '').includes('javascript'));
  const editorAsset = await callAsset('/codeslice/assets/editor.js');
  check('editor chunk is served', editorAsset.status === 200 && editorAsset.text.includes('__codesliceEditor'), String(editorAsset.status));
  const missingAsset = await callAsset('/codeslice/assets/../index.js');
  check('asset traversal is refused', missingAsset.status === 404, String(missingAsset.status));

  /* ---- summary ---- */
  section('summary');
  console.log(`  ${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`  ${failures} FAILED`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
