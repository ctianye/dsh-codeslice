// Self-test for the v2 Host half. No Cordis, no HTTP, no network:
//   node plugin/dev/chat-probe.mjs
//
// Every case exercises a property the contract makes load-bearing, against the
// real modules with a fake LLM (an async generator), so a regression fails here
// rather than in the panel. The state directory is real — these are the same
// atomic-write paths production uses — and every scratch root is removed at the end.
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendTurn, clearConversation, countConversations, createConversation, deleteConversation,
  ensureConversation, listConversations, loadChat, readConversation,
  renameConversation, updateChat,
} from '../lib/chat.js';
import {
  RAG_DEFAULTS, loadRag, mergeRagConfig, normaliseRagConfig,
  readRagSettings, writeRagSettings,
} from '../lib/rag.js';
import {
  CONTEXT_HEADINGS, assembleContext, enclosingSymbol, extractCitations,
  runAsk, streamAnswer, selectNotes,
} from '../lib/answer.js';
import {
  NOTE_PROMPT, citationsOf, locationFor, noteFromConversation, resolveRefs,
  summarise, transcriptOf, turnsForNote,
} from '../lib/notegen.js';
import { statePath } from '../lib/store.js';
import { searchRecords } from '../lib/retrieval.js';
import { defaultModelSettings, mergeModelSettings } from '../lib/models.js';
import { adaptGraphifyGraph } from '../lib/graphify.js';
import {
  askHandler, chatApiMethods, chatToolDefinitions, codeApiMethods, filesApiMethods,
  noteFromChatApiMethods, noteFromSessionApiMethods, ragApiMethods,
} from '../lib/api-chat.js';

let passed = 0;
let failed = 0;
const failures = [];

/** Record one assertion. */
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
}

/** Deep equality on JSON-able values. */
function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A fake LLM whose stream yields the given text in pieces. */
function fakeLlm(text, options = {}) {
  const calls = [];
  const pieces = options.pieces ?? [text.slice(0, Math.max(1, Math.floor(text.length / 2))), text.slice(Math.max(1, Math.floor(text.length / 2)))];
  return {
    calls,
    async *stream(request) {
      calls.push(request);
      if (options.failWith !== undefined) {
        yield { type: 'finish', reason: { kind: 'error', failure: { message: options.failWith, code: 'X' } } };
        return;
      }
      for (const piece of pieces) {
        if (piece === '') continue;
        yield { type: 'text-delta', index: 0, text: piece };
      }
      if (options.usage !== false) yield { type: 'usage', usage: { inputTokens: 111, outputTokens: 22 } };
      yield { type: 'finish', reason: { kind: options.finishKind ?? 'stop' } };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Fixtures                                                           *
 * ------------------------------------------------------------------ */

const scratchRoots = [];

/** A scratch workspace with one small source file. */
async function makeWorkspace(tag) {
  const root = join(tmpdir(), `codeslice-probe-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  await fs.mkdir(join(root, 'pkg'), { recursive: true });
  const lines = [];
  for (let index = 1; index <= 120; index += 1) {
    if (index === 10) lines.push('def detect_communities(graph, seed=0):');
    else if (index === 11) lines.push('    """Detect communities with a fixed seed.');
    else if (index === 12) lines.push('    WHY: a fixed seed makes the partition reproducible.');
    else if (index >= 13 && index <= 40) lines.push(`    step_${index} = ${index} * seed`);
    else lines.push(`# filler line ${index}`);
  }
  await fs.writeFile(join(root, 'pkg', 'cluster.py'), lines.join('\n'), 'utf8');
  scratchRoots.push(root);
  return root;
}

/** The built-index shape the modules read, minimal but real. */
function fixtureDocument() {
  const nodes = [
    {
      id: 'pkg/cluster.py::file::__file__::1',
      label: 'cluster.py',
      kind: 'file',
      path: 'pkg/cluster.py',
      start_line: 1,
      end_line: 120,
      degree: 2,
    },
    {
      id: 'pkg/cluster.py::function::detect_communities::10',
      label: 'detect_communities',
      kind: 'function',
      path: 'pkg/cluster.py',
      start_line: 10,
      end_line: 40,
      signature: 'def detect_communities(graph, seed=0):',
      degree: 1,
      community: 1,
      community_label: 'cluster.py +1',
    },
  ];
  const edges = [
    {
      source: 'pkg/cluster.py::file::__file__::1',
      target: 'pkg/cluster.py::function::detect_communities::10',
      relation: 'contains',
      confidence: 'EXTRACTED',
      line: 10,
    },
  ];
  const chunks = {
    chunks: [
      {
        path: 'pkg/cluster.py',
        language: 'python',
        kind: 'function',
        symbol: 'detect_communities',
        parent_symbol: null,
        start_line: 10,
        end_line: 40,
        content: 'def detect_communities(graph, seed=0):\n    """Detect communities with a fixed seed."""',
        hash: 'x',
        tokens: 20,
        terms: { 'communities': 2, 'seed': 3, 'fixed': 1 },
        tokenCount: 20,
      },
    ],
    version: 2,
  };
  return { nodes, edges, files: [{ path: 'pkg/cluster.py', lines: 120, language: 'python' }], chunks };
}

/* ------------------------------------------------------------------ *
 * 1. chat storage round trip                                         *
 * ------------------------------------------------------------------ */

async function testChatRoundTrip() {
  const root = await makeWorkspace('roundtrip');
  const created = await createConversation(root, {
    title: '为什么种子要固定？',
    mode: 'snippet',
    path: 'pkg/cluster.py',
    startLine: 10,
    endLine: 15,
    selectedCode: 'def detect_communities(graph, seed=0):\n    ...',
    graphAnchor: 'pkg/cluster.py::function::detect_communities::10',
  });
  const id = created.conversation.id;
  check('create returns an id', typeof id === 'string' && id.startsWith('c_'));
  check('create keeps the selection', created.conversation.selectedCode.includes('detect_communities'));
  check('create keeps mode snippet', created.conversation.mode === 'snippet');
  check('create keeps the graph anchor', created.conversation.graphAnchor === 'pkg/cluster.py::function::detect_communities::10');
  check('create cleans the title', !created.conversation.title.includes('？') || created.conversation.title.length <= 72);

  const userTurn = await appendTurn(root, id, { role: 'user', text: '为什么种子要固定？' });
  check('appendTurn returns a turn id', typeof userTurn.turn.id === 'string' && userTurn.turn.id.startsWith('m_'));
  const assistantTurn = await appendTurn(root, id, {
    role: 'assistant',
    text: '因为固定种子让社区划分可复现。',
    retrieval: [{ path: 'pkg/cluster.py', line: 10, endLine: 40, symbol: 'detect_communities', kind: 'function', score: 0.71, retriever: 'keyword' }],
    citations: [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: 'detect_communities', hash: 'abc', status: 'fresh' }],
    usage: { inputTokens: 1234, outputTokens: 260 },
  });
  check('citations keep their shape', equal(assistantTurn.turn.citations[0], {
    path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: 'detect_communities', hash: 'abc', status: 'fresh',
  }));
  check('retrieval is camelCase on the wire', assistantTurn.turn.retrieval[0].startLine === 10
    && assistantTurn.turn.retrieval[0].line === undefined);
  check('usage survives', assistantTurn.turn.usage.inputTokens === 1234);

  const read = await readConversation(root, id);
  check('read returns both turns', read.turns.length === 2);
  check('read returns the conversation row', read.conversation.id === id);
  check('read row has turnCount', read.conversation.turnCount === 2);
  check('read row has an excerpt', typeof read.conversation.excerpt === 'string' && read.conversation.excerpt !== '');

  const listed = await listConversations(root, {});
  check('list has one conversation', listed.length === 1);
  check('list row carries no turns', listed[0].turns === undefined);
  check('list row carries the selection', listed[0].selectedCode.includes('detect_communities'));

  const found = await listConversations(root, { query: '可复现' });
  check('list query matches turn text', found.length === 1);
  const missed = await listConversations(root, { query: '不存在的关键词' });
  check('list query filters', missed.length === 0);

  const renamed = await renameConversation(root, id, '固定随机种子的意义');
  check('rename applies', renamed.conversation.title === '固定随机种子的意义');

  const cleared = await clearConversation(root, id);
  check('clear drops the turns', cleared.conversation.turns.length === 0);
  check('clear keeps the row', (await listConversations(root, {})).length === 1);
  check('clear keeps the selection', cleared.conversation.selectedCode.includes('detect_communities'));

  const deleted = await deleteConversation(root, id);
  check('delete reports deleted', deleted.deleted === true);
  check('delete removes the row', (await listConversations(root, {})).length === 0);

  // The document on disk is the source of truth, not the in-memory copy.
  const disk = JSON.parse(await fs.readFile(statePath(root, 'chat'), 'utf8'));
  check('disk document has conversations', Array.isArray(disk.conversations));
}

/* ------------------------------------------------------------------ *
 * 2. concurrent writes lose nothing                                  *
 * ------------------------------------------------------------------ */

async function testConcurrentWrites() {
  const root = await makeWorkspace('concurrent');
  const created = await createConversation(root, { title: '并发' });
  const id = created.conversation.id;

  // Twelve turns appended at once. Each appendTurn queues its own read-modify-write.
  await Promise.all(Array.from({ length: 12 }, (_, index) => appendTurn(root, id, {
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `turn-${index}`,
  })));

  const after = await readConversation(root, id);
  check('twelve concurrent appends all land', after.turns.length === 12,
    `got ${after.turns.length}`);
  const texts = new Set(after.turns.map((turn) => turn.text));
  check('no concurrent turn is lost', texts.size === 12, `distinct ${texts.size}`);

  // Interleaved creates: the queue is over the document, not just the bytes.
  await Promise.all(Array.from({ length: 8 }, (_, index) => createConversation(root, { title: `c${index}` })));
  const all = await listConversations(root, { limit: 200 });
  check('eight concurrent creates all land', all.length === 9, `got ${all.length}`);

  // A mutator that throws must not publish a partial document.
  const before = (await listConversations(root, { limit: 200 })).length;
  let threw = false;
  try {
    await updateChat(root, (document) => {
      document.conversations.length = 0;
      throw new Error('boom');
    });
  } catch {
    threw = true;
  }
  const afterThrow = (await listConversations(root, { limit: 200 })).length;
  check('a throwing mutator is refused', threw);
  check('a throwing mutator publishes nothing', afterThrow === before, `${before} -> ${afterThrow}`);

  // Idempotent append: the same turn id twice must not double the row.
  await appendTurn(root, id, { id: 'm_fixed', role: 'user', text: 'once' });
  await appendTurn(root, id, { id: 'm_fixed', role: 'user', text: 'once' });
  const dup = await readConversation(root, id);
  check('appendTurn is idempotent by id', dup.turns.filter((turn) => turn.id === 'm_fixed').length === 1);
}

/* ------------------------------------------------------------------ *
 * 3. a corrupt document is refused, not read as empty                *
 * ------------------------------------------------------------------ */

async function testCorruptRefused() {
  const root = await makeWorkspace('corrupt');
  await createConversation(root, { title: 'IRREPLACEABLE' });
  const file = statePath(root, 'chat');

  const good = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, good.slice(0, Math.max(10, Math.floor(good.length * 0.6))), 'utf8');

  let refused = false;
  let message = '';
  try {
    await loadChat(root);
  } catch (error) {
    refused = true;
    message = String(error.message);
  }
  check('a corrupt chat document is refused', refused);
  check('the refusal names the salvage path', message.includes('.corrupt-'), message.slice(0, 80));

  // A write must not be able to erase what is left. The first read already moved
  // the damaged file aside, so it is re-corrupted here: the point of the check is
  // that `updateChat` runs `loadChat` inside its cycle and therefore refuses,
  // rather than replacing the file with a fresh empty document.
  const second = await createConversation(root, { title: 'IRREPLACEABLE-2' });
  void second;
  const secondGood = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, secondGood.slice(0, Math.max(10, Math.floor(secondGood.length * 0.6))), 'utf8');
  let writeRefused = false;
  try {
    await createConversation(root, { title: 'should not silently replace' });
  } catch {
    writeRefused = true;
  }
  check('a write over a corrupt document is refused', writeRefused);

  const siblings = (await fs.readdir(statePath(root, 'x').replace(/[^\\/]+$/u, '')))
    .filter((name) => name.includes('.corrupt-'));
  let salvagedHistory = false;
  for (const name of siblings) {
    const body = await fs.readFile(join(statePath(root, 'x').replace(/[^\\/]+$/u, ''), name), 'utf8')
      .catch(() => '');
    if (body.includes('IRREPLACEABLE')) salvagedHistory = true;
  }
  check('the damaged file is kept', siblings.length > 0);
  check('the salvaged copy still holds the history', salvagedHistory);
  for (const name of siblings) {
    await fs.rm(join(statePath(root, 'x').replace(/[^\\/]+$/u, ''), name), { force: true });
  }

  // Same rule for the RAG document.
  const ragRoot = await makeWorkspace('corrupt-rag');
  await writeRagSettings(ragRoot, { topK: 5 }, undefined);
  const ragFile = statePath(ragRoot, 'rag');
  const ragGood = await fs.readFile(ragFile, 'utf8');
  await fs.writeFile(ragFile, ragGood.slice(0, Math.max(4, Math.floor(ragGood.length / 2))), 'utf8');
  let ragRefused = false;
  try {
    await loadRag(ragRoot);
  } catch {
    ragRefused = true;
  }
  check('a corrupt rag document is refused', ragRefused);
}

/* ------------------------------------------------------------------ *
 * 4. RAG clamping                                                    *
 * ------------------------------------------------------------------ */

async function testRagClamping() {
  // The two ranges §15 still names. Chunking is no longer among them: the desktop
  // bands are constants, and a chunk knob sent by an old client must be dropped.
  const clamped = normaliseRagConfig({ topK: 10000, rrfK: 0, chunkLines: 5000, maxChunkChars: 1 });
  check('topK clamps high', clamped.topK === 24, String(clamped.topK));
  check('rrfK clamps low', clamped.rrfK === 1, String(clamped.rrfK));
  check('retired chunk fields are dropped', clamped.chunkLines === undefined
    && clamped.maxChunkLines === undefined && clamped.maxChunkChars === undefined,
  Object.keys(clamped).join(','));

  const low = normaliseRagConfig({ topK: 0, rrfK: 1000 });
  check('topK clamps low', low.topK === 1, String(low.topK));
  check('rrfK clamps high', low.rrfK === 100, String(low.rrfK));

  const junk = normaliseRagConfig({ topK: null, families: ['nope', 'behaviour'], includeNotes: 'yes' });
  check('null falls back to the default', junk.topK === RAG_DEFAULTS.topK);
  check('unknown families are dropped', equal(junk.families, ['behaviour']), JSON.stringify(junk.families));
  check('a non-boolean includeNotes keeps the default', junk.includeNotes === true);

  const empty = normaliseRagConfig({ families: ['nope'] });
  check('an all-unknown family list falls back to the defaults', equal(empty.families, RAG_DEFAULTS.families));

  const merged = mergeRagConfig({ ...RAG_DEFAULTS, families: ['behaviour'], topK: 4 }, { topK: 6 });
  check('merge keeps untouched fields', equal(merged.families, ['behaviour']));
  check('merge applies the patch', merged.topK === 6);
  const undefinedPatch = mergeRagConfig({ ...RAG_DEFAULTS, topK: 4 }, { topK: undefined });
  check('an undefined patch value keeps the base', undefinedPatch.topK === 4);

  // Round trip through disk.
  const root = await makeWorkspace('rag');
  const written = await writeRagSettings(root, { topK: 12, chunkLines: 90 });
  check('write stores the value', written.config.topK === 12);
  check('write drops a retired chunk field', written.config.chunkLines === undefined);
  const readBack = await readRagSettings(root);
  check('read returns the stored value', readBack.config.topK === 12);
  check('read no longer reports applied/pending chunk fields',
    readBack.config.appliedChunkLines === undefined && readBack.config.pendingRebuild === undefined);
}

/* ------------------------------------------------------------------ *
 * 5. the four context stages, in contract order                      *
 * ------------------------------------------------------------------ */

async function testContextOrder() {
  const root = await makeWorkspace('context');
  const document = fixtureDocument();
  const conversation = {
    id: 'c_1',
    mode: 'snippet',
    path: 'pkg/cluster.py',
    startLine: 10,
    endLine: 20,
    selectedCode: 'def detect_communities(graph, seed=0):\n    """Detect communities with a fixed seed."""',
  };
  const notes = [{
    id: 'n_1',
    title: '固定随机种子的意义',
    body: '固定种子让划分可复现。',
    updatedAt: Date.now(),
    codeRefs: [{ path: 'pkg/cluster.py', line: 10, endLine: 40 }],
    anchors: [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40 }],
  }];

  const context = await assembleContext({
    root,
    document,
    conversation,
    text: 'detect_communities 为什么固定 seed？',
    useContext: true,
    config: normaliseRagConfig({ includeNotes: true, includeGraph: true }),
    notes,
  });

  const order = context.blocks.map((block) => block.stage);
  check('context on contributes all four stages', equal(order, ['selection', 'graph', 'notes', 'retrieval']), JSON.stringify(order));
  check('stage 1 is the selection verbatim', context.blocks[0].text.includes('def detect_communities(graph, seed=0):'));
  check('stage 1 carries the location', context.blocks[0].text.includes('pkg/cluster.py:10-20'));
  check('stage 2 is the graph render', context.blocks[1].text.includes('Node: detect_communities'));
  check('stage 3 renders a note block', context.blocks[2].text.includes('笔记「固定随机种子的意义」'));
  check('stage 4 is the retrieved chunk', context.blocks[3].text.includes('pkg/cluster.py:10-40'));
  check('the headings are the contract', context.blocks[0].text.startsWith(CONTEXT_HEADINGS.selection)
    && context.blocks[1].text.startsWith(CONTEXT_HEADINGS.graph)
    && context.blocks[2].text.startsWith(CONTEXT_HEADINGS.notes)
    && context.blocks[3].text.startsWith(CONTEXT_HEADINGS.retrieval));
  check('retrieval reports the chunk rows', context.retrieval.length > 0
    && context.retrieval[0].startLine === 10);

  // `useContext: false` is snippet-only: no graph, notes or retrieval —
  // project relationships are the point of the switch, not an unconditional
  // background for every range question.
  const narrow = await assembleContext({
    root, document, conversation, text: 'seed', useContext: false,
    config: normaliseRagConfig({}), notes,
  });
  check('useContext false omits the enclosing symbol', !narrow.blocks[0].text.includes('选中代码所在的声明'));
  check('useContext false keeps only the selection stage',
    equal(narrow.blocks.map((block) => block.stage), ['selection']),
    JSON.stringify(narrow.blocks.map((block) => block.stage)));
  check('useContext false returns no retrieval candidates', narrow.retrieval.length === 0);

  const wide = await assembleContext({
    root, document, conversation, text: 'seed', useContext: true,
    config: normaliseRagConfig({}), notes,
  });
  check('useContext true adds the enclosing symbol', wide.blocks[0].text.includes('选中代码所在的声明'));
  check('useContext true still omits the rest of the file', !wide.blocks[0].text.includes('filler line 110'));
  check('useContext true returns to the project stages',
    equal(wide.blocks.map((block) => block.stage), ['selection', 'graph', 'notes', 'retrieval']),
    JSON.stringify(wide.blocks.map((block) => block.stage)));

  // `includeGraph: false` suppresses the block but not the retrieval fusion.
  const noGraph = await assembleContext({
    root, document, conversation, text: 'detect_communities', useContext: true,
    config: normaliseRagConfig({ includeGraph: false }), notes,
  });
  check('includeGraph false skips only the graph block',
    !noGraph.blocks.some((block) => block.stage === 'graph'));
  check('includeGraph false still yields retrieval', noGraph.retrieval.length > 0);

  const noNotes = await assembleContext({
    root, document, conversation, text: 'seed', useContext: true,
    config: normaliseRagConfig({ includeNotes: false }), notes,
  });
  check('includeNotes false skips the note block',
    !noNotes.blocks.some((block) => block.stage === 'notes'));

  // A project-mode conversation has no selection stage.
  const project = await assembleContext({
    root, document, conversation: { ...conversation, mode: 'project' }, text: 'detect_communities',
    useContext: false, config: normaliseRagConfig({}), notes,
  });
  check('project mode has no selection stage',
    !project.blocks.some((block) => block.stage === 'selection'));

  // The enclosing-symbol lookup picks the smallest containing span.
  const nested = [
    { id: 'f', label: 'outer', kind: 'function', path: 'a.py', start_line: 1, end_line: 100 },
    { id: 'g', label: 'inner', kind: 'function', path: 'a.py', start_line: 10, end_line: 20 },
  ];
  check('enclosingSymbol picks the innermost span', enclosingSymbol(nested, 'a.py', 15)?.label === 'inner');
  check('enclosingSymbol returns nothing outside a span', enclosingSymbol(nested, 'a.py', 200) === undefined);

  // Notes: anchored overlap ranks above a text match.
  const picked = selectNotes([
    { id: 'n_text', title: '无关标题', body: 'seed seed seed', anchors: [], updatedAt: 1 },
    { id: 'n_anchor', title: '锚定', body: '', anchors: [{ path: 'pkg/cluster.py', startLine: 30, endLine: 35 }], updatedAt: 2 },
  ], { path: 'pkg/cluster.py', startLine: 10, endLine: 40, question: 'seed', limit: 3 });
  check('an anchored note outranks a text match', picked[0].id === 'n_anchor', picked.map((note) => note.id).join(','));

  const capped = selectNotes(Array.from({ length: 10 }, (_, index) => ({
    id: `n${index}`, title: 'seed', body: 'seed', anchors: [], updatedAt: index,
  })), { question: 'seed', limit: 3 });
  check('notes are capped at three', capped.length === 3);
}

/* ------------------------------------------------------------------ *
 * 6. streaming, citations, and the whole ask                         *
 * ------------------------------------------------------------------ */

async function testStreamingAndCitations() {
  const root = await makeWorkspace('stream');
  const document = fixtureDocument();
  const notes = [{
    id: 'n_1',
    title: '固定随机种子的意义',
    body: '固定种子让社区划分可复现。',
    updatedAt: Date.now(),
    codeRefs: [{ path: 'pkg/cluster.py', line: 10, endLine: 40 }],
    anchors: [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40 }],
  }];

  // The fake LLM is a plain async generator: that is the whole contract.
  const llm = fakeLlm('固定种子让划分可复现，见 `pkg/cluster.py:10-40`。');
  const deltas = [];
  const result = await runAsk({
    root,
    document,
    conversation: {
      id: 'c_1', mode: 'snippet', path: 'pkg/cluster.py', startLine: 10, endLine: 40,
      selectedCode: 'def detect_communities(graph, seed=0):',
    },
    // The question must name something the graph and the chunk index know about:
    // a question made only of one-character CJK tokens matches no node label and
    // no indexed bigram, which is correct behaviour and a useless fixture.
    text: 'detect_communities 为什么固定 seed？',
    useContext: true,
    ragConfig: normaliseRagConfig({}),
    notes,
    llm,
    route: { provider: 'fake', model: 'fake-1' },
    emit: (frame) => {
      if (frame.type === 'delta') deltas.push(frame.text);
    },
  });
  check('the answer streams in more than one delta', deltas.length >= 2, `${deltas.length} deltas`);
  check('the deltas join to the answer', deltas.join('') === result.text);
  check('the answer carries no error', result.error === null);
  check('usage is reported', result.usage?.inputTokens === 111);
  check('citations come from the retrieved range', result.citations.length > 0
    && result.citations[0].path === 'pkg/cluster.py'
    && result.citations[0].startLine === 10
    && result.citations[0].endLine === 40,
  JSON.stringify(result.citations));
  check('a citation carries a hash and status', typeof result.citations[0].hash === 'string'
    && result.citations[0].status === 'fresh');
  check('the request used one user message', llm.calls[0].messages.length === 1
    && llm.calls[0].messages[0].role === 'user');
  check('the message content is a text part', llm.calls[0].messages[0].content[0].type === 'text');
  check('the transcript carries the four stages in order',
    stageOrderIn(llm.calls[0].messages[0].content[0].text) === 'selection,graph,notes,retrieval',
    stageOrderIn(llm.calls[0].messages[0].content[0].text));

  /* ---- a model that invents a range is not believed ---------------- */
  const invented = extractCitations(
    '这段逻辑在 `pkg/cluster.py:100-119` 和 `pkg/other.py:1-5` 里。',
    [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: 'detect_communities' }],
    { fallback: false },
  );
  check('an invented range outside retrieval is dropped', invented.length === 0,
    JSON.stringify(invented));

  const clamped = extractCitations(
    '`pkg/cluster.py:5-20` 说明了这一点。',
    [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: 'detect_communities' }],
  );
  check('a partially overlapping range is clamped to the retrieved span',
    clamped[0].startLine === 10 && clamped[0].endLine === 20, JSON.stringify(clamped));

  const bare = extractCitations(
    '见 pkg/cluster.py。',
    [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: 'detect_communities' }],
  );
  check('a bare path records the best candidate', bare.length === 1 && bare[0].startLine === 10);

  const fallback = extractCitations('没有引用。', [
    { path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: null },
    { path: 'pkg/other.py', startLine: 1, endLine: 5, symbol: null },
    { path: 'pkg/third.py', startLine: 1, endLine: 5, symbol: null },
    { path: 'pkg/fourth.py', startLine: 1, endLine: 5, symbol: null },
  ]);
  check('an uncited answer falls back to at most three candidates', fallback.length === 3,
    String(fallback.length));
  check('no citation is ever outside the candidate set', fallback.every((row) => row.path.startsWith('pkg/')));

  /* ---- a failing model still yields a terminal error ---------------- */
  const failing = fakeLlm('', { failWith: 'provider exploded' });
  const failed = await streamAnswer({
    llm: failing,
    route: { provider: 'fake', model: 'fake-1' },
    system: 's',
    transcript: 'q',
    onDelta: () => {},
  });
  check('a finish error becomes an error string', failed.error === 'provider exploded');
  check('a failing stream yields no text', failed.text === '');

  const partial = await streamAnswer({
    llm: {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: '前半段' };
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'cut off' } } };
      },
    },
    route: { provider: 'fake', model: 'fake-1' },
    system: 's',
    transcript: 'q',
  });
  check('a partial answer keeps its text', partial.text === '前半段');
  check('a partial answer reports the error', partial.error === 'cut off');

  /* ---- a question can carry its own selection ---------------------- */

  // The reader may keep one thread and pick a different range for the next
  // question. The turn's selection must win over the conversation's stored one,
  // and the stored one must not be rewritten by reading it.
  const overrideLlm = fakeLlm('见 `pkg/cluster.py:66-92`。');
  const override = await runAsk({
    root,
    document,
    conversation: { id: 'c_2', mode: 'project', path: '', selectedCode: '' },
    turnSelection: {
      mode: 'snippet',
      path: 'pkg/cluster.py',
      startLine: 66,
      endLine: 92,
      selectedCode: 'def detect_communities(graph, seed=0):\n    OVERRIDE_SELECTION',
    },
    text: 'detect_communities 为什么固定 seed？',
    ragConfig: normaliseRagConfig({}),
    notes: [],
    llm: overrideLlm,
    route: { provider: 'fake', model: 'fake-1' },
    emit: () => {},
  });
  const overrideText = overrideLlm.calls[0].messages[0].content[0].text;
  check('a project thread can answer about a turn selection',
    override.context.mode === 'snippet' && override.context.stages.selection === true);
  check('the turn selection is in the transcript verbatim',
    overrideText.includes('OVERRIDE_SELECTION'), overrideText.slice(0, 200));
  check('the effective selection is reported for the system prompt',
    override.context.selection.path === 'pkg/cluster.py'
    && override.context.selection.startLine === 66
    && override.context.selection.endLine === 92);
  check('asking about a selection does not mutate the conversation',
    override.citations.every((row) => row.path === 'pkg/cluster.py'));

  /* ---- ask with no LLM: an error, never an uncaught throw ----------- */
  const noLlm = await runAsk({
    root,
    document,
    conversation: { mode: 'project' },
    text: 'seed',
    ragConfig: normaliseRagConfig({}),
    notes: [],
    emit: () => {},
  });
  check('a missing LLM degrades to an error', typeof noLlm.error === 'string' && noLlm.error !== '');
  check('a missing LLM still returns retrieval', Array.isArray(noLlm.retrieval));
  check('a missing LLM cites nothing', noLlm.citations.length === 0);
}

/** The stage headings present in a transcript, in order. */
function stageOrderIn(text) {
  const order = [];
  for (const [stage, heading] of [
    ['selection', CONTEXT_HEADINGS.selection],
    ['graph', CONTEXT_HEADINGS.graph],
    ['notes', CONTEXT_HEADINGS.notes],
    ['retrieval', CONTEXT_HEADINGS.retrieval],
  ]) {
    if (String(text).includes(heading)) order.push(stage);
  }
  return order.join(',');
}

/* ------------------------------------------------------------------ *
 * 7. notegen: the template, and citations copied verbatim            *
 * ------------------------------------------------------------------ */

async function testNotegenTemplate() {
  const root = await makeWorkspace('notegen');

  // The five headings are the contract's, word for word.
  check('the prompt names 知识点', NOTE_PROMPT.includes('## 知识点'));
  check('the prompt names 要点', NOTE_PROMPT.includes('## 要点'));
  check('the prompt names 何时使用', NOTE_PROMPT.includes('## 何时使用'));
  check('the prompt names 标题', NOTE_PROMPT.includes('## 标题'));
  check('the prompt fills its location slot', NOTE_PROMPT.includes('{location}'));

  const conversation = {
    id: 'c_note',
    title: '固定随机种子的意义',
    mode: 'snippet',
    path: 'pkg/cluster.py',
    startLine: 10,
    endLine: 40,
    selectedCode: 'def detect_communities(graph, seed=0):\n    """Detect communities with a fixed seed."""',
  };
  check('locationFor renders path:start-end', locationFor(conversation) === 'pkg/cluster.py:10-40');
  check('locationFor names a project question', locationFor({ path: '' }) === '整个项目（项目问答）');
  check('locationFor marks a transcript', locationFor(conversation, true).includes('整段会话'));

  const turns = [
    { id: 'm_u', role: 'user', text: '为什么种子要固定？' },
    {
      id: 'm_a',
      role: 'assistant',
      text: '固定种子让社区划分可复现。',
      citations: [{ path: 'pkg/cluster.py', startLine: 10, endLine: 40, symbol: 'detect_communities', hash: 'h', status: 'fresh' }],
    },
  ];
  check('transcriptOf uses 问/答 markers', transcriptOf(turns).startsWith('问：为什么种子要固定？'));
  check('citationsOf reads the assistant turn only', citationsOf(conversation, turns).length === 1);
  check('citationsOf dedupes', citationsOf(conversation, [...turns, turns[1]]).length === 1);
  check('citationsOf skips note:// paths',
    citationsOf(conversation, [{ role: 'assistant', citations: [{ path: 'note://n_1', startLine: 1, endLine: 1 }] }]).length === 1,
    'the selection fallback should be the only row');

  const refs = await resolveRefs(root, citationsOf(conversation, turns));
  check('resolveRefs reads the code', typeof refs[0].code === 'string' && refs[0].code.includes('detect_communities'));
  check('resolveRefs hashes the code', typeof refs[0].hash === 'string' && refs[0].hash.length === 64);

  const sections = {
    knowledge: '这段话解释了固定种子的作用。',
    keyPoints: '- 固定种子让结果可复现\n- 不固定则每次划分不同',
    when: '- 需要可复现的实验时使用',
  };
  // The model is asked for the prose; the code section is never its business.
  const llm = fakeLlm([
    '# 固定随机种子',
    '',
    '## 知识点',
    sections.knowledge,
    '',
    '## 要点',
    sections.keyPoints,
    '',
    '## 何时使用',
    sections.when,
  ].join('\n'));

  const note = await noteFromConversation({
    root,
    conversation,
    turns,
    llm,
    route: { provider: 'fake', model: 'fake-1' },
  });

  check('the note title is a knowledge point', typeof note.title === 'string' && note.title.length > 0, note.title);
  check('the note has the 知识点 heading', note.body.includes('## 知识点'));
  check('the note has the 关联代码 heading', note.body.includes('## 关联代码'));
  check('the note has the 要点 heading', note.body.includes('## 要点'));
  check('the note has the 何时使用 heading', note.body.includes('## 何时使用'));
  check('the note starts with an H1', note.body.startsWith('# '));
  check('the summary succeeded', note.summaryFailed === false);
  check('the note has no summary error', note.summaryError === null);

  // 关联代码 is the citation, copied verbatim — not anything the model wrote.
  check('关联代码 names the cited range', note.body.includes('### pkg/cluster.py:10-40'));
  check('关联代码 names the symbol', note.body.includes('（detect_communities）'));
  check('关联代码 copies the code verbatim', note.body.includes('def detect_communities(graph, seed=0):'));
  const codeSection = note.body.slice(note.body.indexOf('## 关联代码'), note.body.indexOf('## 要点'));
  check('the code section holds only the citation', codeSection.includes('pkg/cluster.py:10-40')
    && !codeSection.includes('固定种子让结果可复现'),
  codeSection.slice(0, 120));
  check('the model prose lives in 知识点, not 关联代码',
    note.body.includes(sections.knowledge)
    && !codeSection.includes(sections.knowledge));
  check('the note records the code ref', (note.codeRefs ?? []).length === 1);
  check('the note records an anchor', (note.anchors ?? []).length === 1);
  check('the anchor carries the hash', typeof note.anchors[0].hash === 'string');
  check('the note links its conversation', note.conversationId === 'c_note');

  // Stored, not just returned.
  const stored = JSON.parse(await fs.readFile(statePath(root, 'notes'), 'utf8'));
  check('the note is persisted', stored.notes.some((row) => row.id === note.id));
  check('the anchor is persisted', stored.anchors.some((row) => row.noteId === note.id));

  // A second save refreshes the same note rather than appending a duplicate.
  const again = await noteFromConversation({
    root, conversation, turns, llm, route: { provider: 'fake', model: 'fake-1' },
  });
  const after = JSON.parse(await fs.readFile(statePath(root, 'notes'), 'utf8'));
  check('a re-save reuses the conversation note', again.id === note.id, `${note.id} -> ${again.id}`);
  check('a re-save does not duplicate the row', after.notes.filter((row) => row.conversationId === 'c_note').length === 1);

  /* ---- a failed summary must still save the answer ------------------ */
  const failingRoot = await makeWorkspace('notegen-fail');
  const failing = fakeLlm('', { failWith: 'provider down' });
  const fallbackNote = await noteFromConversation({
    root: failingRoot,
    conversation,
    turns,
    llm: failing,
    route: { provider: 'fake', model: 'fake-1' },
  });
  check('a failed summary is reported', fallbackNote.summaryFailed === true);
  check('a failed summary reports why', typeof fallbackNote.summaryError === 'string'
    && fallbackNote.summaryError.includes('provider down'));
  check('a failed summary still saves the raw answer',
    fallbackNote.body.includes('固定种子让社区划分可复现。'));
  check('a failed summary keeps the 关联代码 section',
    fallbackNote.body.includes('### pkg/cluster.py:10-40'));
  check('a failed summary still has all four headings',
    fallbackNote.body.includes('## 知识点') && fallbackNote.body.includes('## 关联代码')
    && fallbackNote.body.includes('## 要点') && fallbackNote.body.includes('## 何时使用'));
  const failingStored = JSON.parse(await fs.readFile(statePath(failingRoot, 'notes'), 'utf8'));
  check('a failed summary is still persisted', failingStored.notes.length === 1);

  /* ---- a model with no LLM at all keeps the note ------------------- */
  const offlineNote = await noteFromConversation({
    root: failingRoot, conversation: { ...conversation, id: 'c_offline' }, turns,
  });
  check('no LLM still produces a note', offlineNote.summaryFailed === true
    && offlineNote.body.includes('## 关联代码'));

  /* ---- turn selection ---------------------------------------------- */
  check('turnsForNote covers the whole conversation by default', turnsForNote(turns, null).length === 2);
  check('turnsForNote pairs an answer with its question', turnsForNote(turns, 'm_a').length === 2);
  let refusedUserTurn = false;
  try {
    turnsForNote(turns, 'm_u');
  } catch {
    refusedUserTurn = true;
  }
  check('turnsForNote refuses a user turn', refusedUserTurn);

  /* ---- summarise degrades without a route -------------------------- */
  const noRoute = await summarise({ llm: fakeLlm('x'), route: undefined, conversation, transcript: 'q' });
  check('summarise without a route reports an error', noRoute.sections === null && typeof noRoute.error === 'string');
  const emptyReply = await summarise({
    llm: { async *stream() { yield { type: 'finish', reason: { kind: 'stop' } }; } },
    route: { provider: 'fake', model: 'm' },
    conversation,
    transcript: 'q',
  });
  check('summarise retries then reports an empty reply', emptyReply.sections === null
    && emptyReply.error.includes('no content'));
}

/* ------------------------------------------------------------------ *
 * 8. conversation lifecycle used by `ask`                            *
 * ------------------------------------------------------------------ */

async function testEnsureConversation() {
  const root = await makeWorkspace('ensure');
  const first = await ensureConversation(root, { title: '为什么种子要固定？' });
  check('ensure creates when no id is given', typeof first.conversation.id === 'string');
  check('ensure names the conversation from the question', first.conversation.title.length > 0);

  const second = await ensureConversation(root, { conversationId: first.conversation.id, title: 'ignored' });
  check('ensure reads an existing conversation', second.conversation.id === first.conversation.id);

  let refused = false;
  try {
    await ensureConversation(root, { conversationId: 'c_missing' });
  } catch (error) {
    refused = String(error.message).includes('conversation not found');
  }
  check('ensure refuses an unknown id instead of creating one', refused);

  // A snippet without the code cannot be the subject of anything.
  const degraded = await createConversation(root, { mode: 'snippet', path: 'pkg/cluster.py', title: 'x' });
  check('snippet mode without selected code degrades to project', degraded.conversation.mode === 'project');

  // The status line's conversation count must not be a display-limited list.
  const counted = await countConversations(root);
  check('countConversations counts every stored row', counted === 2, String(counted));
}

/* ------------------------------------------------------------------ *
 * 9. retrieval wiring is the v1 one                                  *
 * ------------------------------------------------------------------ */

async function testRetrievalWiring() {
  const document = fixtureDocument();
  const hits = searchRecords(document.chunks, '社区划分 seed', 5);
  check('searchRecords still answers over the fixture', hits.length > 0);
  check('searchRecords speaks line/endLine', hits[0].line === 10 && hits[0].endLine === 40);
}

/* ------------------------------------------------------------------ *
 * 10. the API layer: wire shapes, ask frames, tools                  *
 * ------------------------------------------------------------------ */

async function testApiLayer() {
  const root = await makeWorkspace('api');
  const document = fixtureDocument();
  const load = async () => document;
  const options = { defaultDir: root, load };

  const chat = chatApiMethods(options);
  const created = await chat.chat({ op: 'create', title: '种子为什么固定', path: 'pkg/cluster.py' });
  check('chat create answers {conversation}', created.conversation !== undefined);
  const id = created.conversation.id;

  const listed = await chat.chat({ op: 'list' });
  check('chat list answers {conversations}', Array.isArray(listed.conversations));
  check('chat list is newest first', listed.conversations[0].id === id);

  // `cwd` is honoured when `root` is absent — a parked panel replays it.
  const byCwd = await chat.chat({ op: 'list', cwd: root });
  check('chat list accepts cwd as the root', byCwd.conversations.length === 1);

  let unknownOp = false;
  try {
    await chat.chat({ op: 'nope' });
  } catch (error) {
    unknownOp = error.code === 'unknown-op';
  }
  check('an unknown chat op carries a code', unknownOp);

  /* ---- code ------------------------------------------------------- */
  const codeMethods = codeApiMethods(options);
  const window = await codeMethods.code({ path: 'pkg/cluster.py', startLine: 10, endLine: 20 });
  check('code reports found', window.found === true);
  check('code reports camelCase fields', window.startLine === 10 && window.endLine === 20);
  check('code returns the window text', window.text.includes('def detect_communities'));
  check('code reports the file length', window.lines === 120, String(window.lines));
  check('code names the language', window.language === 'python');
  check('code lists the overlapping symbol', window.symbols.some((row) => row.name === 'detect_communities'));
  check('code symbols are camelCase', window.symbols[0].endLine === 40 && window.symbols[0].start_line === undefined);

  const wholeFile = await codeMethods.code({ path: 'pkg/cluster.py' });
  check('code with no range reports the whole file span', wholeFile.startLine === 1 && wholeFile.endLine === 120);

  const missing = await codeMethods.code({ path: 'pkg/gone.py' });
  check('code reports found:false for a missing file', missing.found === false);

  let traversalRefused = false;
  try {
    await codeMethods.code({ path: '../../../etc/passwd' });
  } catch (error) {
    traversalRefused = error.code === 'outside-root';
  }
  check('code refuses path traversal', traversalRefused);

  /* ---- files ------------------------------------------------------ */
  const filesMethods = filesApiMethods({ defaultDir: root, load: async () => ({
    files: [
      { path: 'z.py', lines: 3, bytes: 10, language: 'python' },
      { path: 'a.js', lines: 2, bytes: 8, language: 'javascript' },
      { path: '', lines: 0 },
    ],
    dirs: [{ path: 'pkg', files: 1, lines: 3 }],
  }) });
  const listedFiles = await filesMethods.files({});
  check('files answers {files, dirs}', Array.isArray(listedFiles.files) && Array.isArray(listedFiles.dirs));
  check('files is sorted by path', listedFiles.files.map((row) => row.path).join(',') === 'a.js,z.py',
    listedFiles.files.map((row) => row.path).join(','));
  check('files drops empty paths', listedFiles.files.every((row) => row.path !== ''));
  check('files carries the line count', listedFiles.files[0].lines === 2);

  /* ---- model settings and graphify adaptation --------------------- */
  {
    let remoteRefused = false;
    try {
      mergeModelSettings(defaultModelSettings(), {
        embedding: { model: 'bge-m3', base_url: 'https://example.com/v1' },
      });
    } catch (error) {
      remoteRefused = error.code === 'remote-url-refused';
    }
    check('model settings refuse a remote embedding URL', remoteRefused);

    const local = mergeModelSettings(defaultModelSettings(), {
      embedding: { model: 'qwen3-embedding:0.6b', base_url: 'http://127.0.0.1:11434/v1' },
      chat: { system_prompt: '请先给结论。' },
    });
    check('model settings keep a loopback URL', local.embedding.base_url.startsWith('http://127.0.0.1'));
    check('model settings keep the custom system prompt', local.chat.system_prompt === '请先给结论。');
    check('model settings keep the chosen model', local.embedding.model === 'qwen3-embedding:0.6b');

    const adapted = adaptGraphifyGraph({
      nodes: [
        { id: 'src_a', label: 'src/a.js', file_type: 'code', source_file: 'src/a.js', source_location: 'L1', community: 2, community_name: 'Community 2' },
        { id: 'src_a_run', label: 'run()', file_type: 'code', source_file: 'src/a.js', source_location: 'L3', community: 2, community_name: 'Community 2' },
        { id: 'src_b', label: '.stop()', file_type: 'code', source_file: 'src/b.js', source_location: 'L5', community: 3, community_name: 'Community 3' },
      ],
      edges: [
        { source: 'src_a', target: 'src_a_run', relation: 'contains', confidence: 'EXTRACTED', source_location: 'L3' },
        { source: 'src_a_run', target: 'src_b', relation: 'calls', confidence: 'INFERRED', source_location: 'L4' },
      ],
    });
    const byId = new Map(adapted.nodes.map((node) => [node.id, node]));
    check('graphify maps a file node', byId.get('src_a').kind === 'file'
      && byId.get('src_a').path === 'src/a.js' && byId.get('src_a').start_line === 1);
    check('graphify maps a method and a function', byId.get('src_b').kind === 'method'
      && byId.get('src_a_run').kind === 'function');
    check('graphify maps relations and confidence', adapted.edges[1].relation === 'calls'
      && adapted.edges[1].confidence === 'INFERRED');
    check('graphify relabels communities like the desktop', adapted.communities.length === 2
      && adapted.communities[0].label === 'a.js'
      && adapted.communities.some((row) => row.label === '未分类'));
    check('graphify computes degree', byId.get('src_a_run').degree === 2);
  }

  /* ---- noteFromSession -------------------------------------------- */
  const sessionLlm = fakeLlm('## 知识点\n固定种子让社区划分可复现。\n\n## 关联代码\n- pkg/cluster.py:10-40\n\n## 要点\n- 种子固定\n\n## 何时使用\n- 需要可复现时');
  const sessionQuery = {
    async readSurface(id) {
      check('noteFromSession reads the requested session', id === 'session-1');
      return {
        messages: [
          { role: 'system', content: 'ignored' },
          { role: 'user', content: [{ type: 'text', text: '为什么固定随机种子？' }] },
          { role: 'assistant', content: [{ type: 'text', text: '固定种子让社区划分可复现。' }] },
          { role: 'assistant', content: [{ type: 'tool_use', name: 'x' }] },
        ],
      };
    },
  };
  const noteSession = noteFromSessionApiMethods(options);
  const sessionNote = await noteSession.noteFromSession({
    sessionId: 'session-1',
    title: '会话笔记',
    path: 'pkg/cluster.py',
    startLine: 10,
    endLine: 40,
  }, {
    ctx: {
      get: (name) => {
        if (name === 'llm') return sessionLlm;
        if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-1' }) };
        if (name === 'sessionQuery') return sessionQuery;
        return undefined;
      },
    },
  });
  check('noteFromSession returns a note', sessionNote.note !== undefined && sessionNote.note.id !== undefined);
  check('noteFromSession reports summary success', sessionNote.summaryFailed === false);
  check('noteFromSession sends the session transcript to the model',
    sessionLlm.calls[0].messages[0].content[0].text.includes('固定种子让社区划分可复现'));
  check('noteFromSession skips system and tool rows',
    !sessionLlm.calls[0].messages[0].content[0].text.includes('ignored'));
  check('noteFromSession anchors the note to the selection',
    sessionNote.note.anchors.some((anchor) => anchor.path === 'pkg/cluster.py'
      && anchor.startLine === 10 && anchor.endLine === 40),
    JSON.stringify(sessionNote.note.anchors));

  let unavailable = false;
  try {
    await noteSession.noteFromSession({ sessionId: 'session-1' }, { ctx: { get: () => undefined } });
  } catch (error) {
    unavailable = error.code === 'session-query-unavailable';
  }
  check('noteFromSession names a missing session query service', unavailable);

  let emptySession = false;
  try {
    await noteSession.noteFromSession({ sessionId: 'session-1' }, {
      ctx: { get: (name) => (name === 'sessionQuery' ? { async readSurface() { return []; } } : undefined) },
    });
  } catch (error) {
    emptySession = error.code === 'empty-session';
  }
  check('noteFromSession refuses an empty session', emptySession);

  /* ---- rag -------------------------------------------------------- */
  const ragMethods = ragApiMethods(options);
  const ragRead = await ragMethods.rag({ op: 'read' });
  check('rag read answers {config}', ragRead.config.topK === 8);
  check('rag read reports index status', ragRead.index !== undefined && ragRead.index.state === 'idle',
    JSON.stringify(ragRead.index));
  const ragWrite = await ragMethods.rag({ op: 'write', config: { topK: 11 } });
  check('rag write answers the merged config', ragWrite.config.topK === 11);
  check('rag write is persisted', (await ragMethods.rag({ op: 'read' })).config.topK === 11);

  /* ---- ask: the frames, in order ---------------------------------- */
  const ask = askHandler(options);
  const llm = fakeLlm('固定种子让划分可复现，见 `pkg/cluster.py:10-40`。');
  const frames = await ask({
    text: 'detect_communities 为什么固定 seed？',
    conversationId: id,
    rag: { topK: 4 },
    useContext: false,
  }, { ctx: { get: (name) => (name === 'llm' ? llm : name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'fake', model: 'fake-1' }) } : undefined) } });

  const types = frames.map((frame) => frame.type);
  check('ask starts with meta', types[0] === 'meta', types.join(','));
  check('ask reports retrieval after meta', types[1] === 'retrieval', types.join(','));
  check('ask streams at least one delta', types.includes('delta'));
  check('ask records citations', types.includes('citation'));
  check('ask ends with exactly one done', types[types.length - 1] === 'done'
    && types.filter((type) => type === 'done').length === 1, types.join(','));
  check('ask never emits two terminal frames',
    types.filter((type) => type === 'done' || type === 'error').length === 1, types.join(','));
  const meta = frames[0];
  check('meta carries the conversation id', meta.conversationId === id);
  check('meta carries the user turn id', typeof meta.turnId === 'string' && meta.turnId.startsWith('m_'));
  check('meta carries the model', meta.model === 'fake-1');
  const done = frames[frames.length - 1];
  check('done carries the assistant turn id', typeof done.assistantTurnId === 'string');
  check('done carries usage', done.usage?.inputTokens === 111);
  check('ask made no LLM call without a route',
    (await ask({ text: 'x', conversationId: id }, { ctx: { get: () => undefined } }))
      .every((frame) => frame.type !== 'done'));

  // Both turns are persisted: the question before dispatch, the answer on done.
  const after = await (chatApiMethods(options)).chat({ op: 'read', id });
  check('ask persists the user turn', after.turns.some((turn) => turn.role === 'user'));
  check('ask persists the assistant turn', after.turns.some((turn) => turn.role === 'assistant'));
  check('the assistant turn carries its citations',
    after.turns.find((turn) => turn.role === 'assistant').citations.length > 0);

  /* ---- ask: a first question creates the conversation -------------- */
  const firstFrames = await ask({ text: 'detect_communities 是什么？' }, {
    ctx: { get: (name) => (name === 'llm' ? fakeLlm('它是社区检测函数。') : name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'fake', model: 'fake-1' }) } : undefined) },
  });
  check('a first question creates a conversation', typeof firstFrames[0].conversationId === 'string');
  check('a first question still ends with done', firstFrames[firstFrames.length - 1].type === 'done');

  /* ---- ask: a snippet question stores the code and its title ------- */
  const snippetLlm = fakeLlm('这段代码检测社区。');
  const snippetFrames = await ask({
    text: '这段代码在做什么？',
    title: '关于 cluster.py 第 10-40 行',
    mode: 'snippet',
    path: 'pkg/cluster.py',
    startLine: 10,
    endLine: 40,
    selectedCode: 'def detect_communities(graph, seed=0):\n    SNIPPET_STORED',
  }, {
    ctx: { get: (name) => (name === 'llm' ? snippetLlm : name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'fake', model: 'fake-1' }) } : undefined) },
  });
  const snippetId = snippetFrames[0].conversationId;
  const snippetRead = await (chatApiMethods(options)).chat({ op: 'read', id: snippetId });
  check('a snippet ask honours the client title',
    snippetRead.conversation.title === '关于 cluster.py 第 10-40 行', snippetRead.conversation.title);
  check('a snippet ask stores mode and code',
    snippetRead.conversation.mode === 'snippet'
    && snippetRead.conversation.selectedCode.includes('SNIPPET_STORED'));
  check('a snippet ask puts the code in the transcript',
    snippetLlm.calls[0].messages[0].content[0].text.includes('SNIPPET_STORED'));

  /* ---- ask: a turn selection overrides an existing thread ---------- */
  const turnLlm = fakeLlm('见 `pkg/cluster.py:10-40`。');
  const turnFrames = await ask({
    text: '换个角度，这一段呢？',
    conversationId: id,
    mode: 'snippet',
    path: 'pkg/cluster.py',
    startLine: 10,
    endLine: 40,
    selectedCode: 'def detect_communities(graph, seed=0):\n    TURN_OVERRIDE',
  }, {
    ctx: { get: (name) => (name === 'llm' ? turnLlm : name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'fake', model: 'fake-1' }) } : undefined) },
  });
  check('a turn selection reaches the model in an existing thread',
    turnLlm.calls[0].messages[0].content[0].text.includes('TURN_OVERRIDE'));
  check('a turn selection keeps the conversation id', turnFrames[0].conversationId === id);
  const afterTurn = await (chatApiMethods(options)).chat({ op: 'read', id });
  check('a turn selection is a turn fact, not a conversation rewrite',
    afterTurn.conversation.selectedCode === undefined
    || afterTurn.conversation.selectedCode === '',
  JSON.stringify(afterTurn.conversation));

  /* ---- ask: an empty question is a terminal error ------------------- */
  const emptyFrames = await ask({ text: '   ' }, { ctx: { get: () => undefined } });
  check('an empty question is one error frame', emptyFrames.length === 1 && emptyFrames[0].type === 'error');

  /* ---- ask: no LLM is an error frame, not a hang -------------------- */
  const noLlmFrames = await ask({ text: 'detect_communities', conversationId: id }, { ctx: { get: () => undefined } });
  check('no LLM ends with an error frame', noLlmFrames[noLlmFrames.length - 1].type === 'error');
  check('the error names the code', noLlmFrames[noLlmFrames.length - 1].code === 'llm-unavailable');

  /* ---- noteFromChat ----------------------------------------------- */
  const noteMethods = noteFromChatApiMethods(options);
  const read = await (chatApiMethods(options)).chat({ op: 'read', id });
  const answerTurn = read.turns.find((turn) => turn.role === 'assistant');
  const note = await noteMethods.noteFromChat({ conversationId: id, messageId: answerTurn.id }, {
    ctx: { get: (name) => (name === 'llm' ? fakeLlm('## 知识点\n知识。\n\n## 要点\n- 要点\n\n## 何时使用\n- 场景') : name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'fake', model: 'fake-1' }) } : undefined) },
  });
  check('noteFromChat answers {note, summaryFailed}', note.note !== undefined && note.summaryFailed !== undefined);
  check('noteFromChat reports success', note.summaryFailed === false);
  check('noteFromChat reports a null error', note.summaryError === null);
  check('noteFromChat keeps the four headings',
    note.note.body.includes('## 知识点') && note.note.body.includes('## 关联代码')
    && note.note.body.includes('## 要点') && note.note.body.includes('## 何时使用'));
  check('noteFromChat links the conversation', note.note.conversationId === id);

  /* ---- tools ------------------------------------------------------ */
  const tools = chatToolDefinitions(options);
  check('four v2 tools are defined', tools.length === 4, tools.map((tool) => tool.name).join(','));
  check('the tool names are the contract\'s',
    equal(tools.map((tool) => tool.name).sort(), [
      'codeslice_ask', 'codeslice_note_create', 'codeslice_notes_search', 'codeslice_rag_config',
    ]));
  for (const tool of tools) {
    check(`${tool.name} has an object schema`, tool.parameters.type === 'object'
      && tool.parameters.properties !== undefined);
    // `required` is an object-level keyword only, and a tool whose every field is
    // optional legitimately has no such array.
    check(`${tool.name} has no nested required`, Object.values(tool.parameters.properties)
      .every((property) => property.required === undefined));
    check(`${tool.name} declares an object-level required array or none`,
      tool.parameters.required === undefined || Array.isArray(tool.parameters.required));
  }
  const askToolSchema = tools.find((tool) => tool.name === 'codeslice_ask').parameters;
  check('required fields are hoisted to the object', equal(askToolSchema.required, ['question']),
    JSON.stringify(askToolSchema.required));
  const searchTool = tools.find((tool) => tool.name === 'codeslice_notes_search');
  const found = await searchTool.execute({ query: '种子' }, {});
  check('notes_search finds the generated note', Array.isArray(found) && found[0].text.includes('种子'));
  const ragTool = tools.find((tool) => tool.name === 'codeslice_rag_config');
  check('rag_config reads without a patch', (await ragTool.execute({}, {}))[0].text.includes('topK'));
  const askTool = tools.find((tool) => tool.name === 'codeslice_ask');
  const offlineTool = await askTool.execute({ question: 'x' }, { ctx: { get: () => undefined } });
  check('codeslice_ask degrades without an LLM', offlineTool[0].text.includes('LLM'));
}

/* ------------------------------------------------------------------ *
 * Run                                                                *
 * ------------------------------------------------------------------ */

async function main() {
  const cases = [
    ['chat storage round trip', testChatRoundTrip],
    ['concurrent writes', testConcurrentWrites],
    ['corrupt documents are refused', testCorruptRefused],
    ['rag clamping', testRagClamping],
    ['four-stage context order', testContextOrder],
    ['streaming and citations', testStreamingAndCitations],
    ['notegen template', testNotegenTemplate],
    ['conversation lifecycle', testEnsureConversation],
    ['retrieval wiring', testRetrievalWiring],
    ['API layer', testApiLayer],
  ];

  for (const [name, run] of cases) {
    const before = failed;
    try {
      await run();
    } catch (error) {
      failed += 1;
      failures.push(`${name} threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
    const status = failed === before ? 'ok  ' : 'FAIL';
    console.log(`${status} ${name}`);
  }

  // Clean only what this run created. The state directory is shared with every
  // other probe and with the live plugin, so a broad `.corrupt-` sweep would delete
  // another test's salvage copies — and the corrupt-file case exists precisely to
  // prove those copies survive.
  for (const root of scratchRoots) {
    for (const name of ['chat', 'rag', 'notes']) {
      const file = statePath(root, name);
      // Salvage siblings are `${file}.corrupt-<ts>`; match that prefix exactly.
      const dir = file.replace(/[^\\/]+$/u, '');
      const base = file.slice(dir.length);
      try {
        for (const entry of await fs.readdir(dir)) {
          if (entry.startsWith(`${base}.corrupt-`)) await fs.rm(join(dir, entry), { force: true });
        }
      } catch {
        // The state directory may not exist when every case failed before a write.
      }
      await fs.rm(file, { force: true });
    }
    await fs.rm(root, { force: true, recursive: true });
  }

  console.log('');
  if (failed === 0) {
    console.log(`chat-probe: ${passed} passed, 0 failed`);
    return 0;
  }
  console.log(`chat-probe: ${passed} passed, ${failed} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  return 1;
}

process.exitCode = await main();
