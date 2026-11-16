// The embedding index and vector retrieval, against a loopback fake provider.
//
// The fake speaks both wire shapes the desktop supports (OpenAI-compatible
// `/v1/embeddings` and Ollama-native `/api/embeddings`), so this probe exercises
// the real `fetch` path, batching, per-input fallback, persistence and the
// background builder without requiring Ollama.
//
//   node dev/rag-index-probe.mjs
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { promises as fs, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { embedQuery, embedTexts, writeModelSettings } from '../lib/models.js';
import { assembleContext } from '../lib/answer.js';
import {
  loadVectorIndex, retrieveVectorRows, startVectorIndex,
  vectorIndexStatus,
} from '../lib/vectors.js';
import { stateDir, statePath } from '../lib/store.js';

let passed = 0;
let failed = 0;
let probes = 0;

/** One assertion. */
const check = (ok, label, detail) => {
  probes += 1;
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
};

/** A deterministic 3-dimensional "semantic" vector. */
function vectorOf(text) {
  if (text.includes('alpha')) return [1, 0, 0];
  if (text.includes('beta')) return [0, 1, 0];
  return [0, 0, 1];
}

/** Read a JSON request body. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

let batchCalls = 0;
let fallbackCalls = 0;

const server = createServer(async (request, response) => {
  const url = request.url ?? '';
  const body = await readBody(request).catch(() => ({}));
  if (url.endsWith('/v1/embeddings')) {
    batchCalls += 1;
    const inputs = Array.isArray(body.input) ? body.input.map(String) : [String(body.input ?? '')];
    // A rejected batch, exactly like Ollama's context overflow: the whole request
    // dies even though only one input is bad.
    if (inputs.some((text) => text.includes('BAD-INSTRUCTION'))) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"error":"input too long"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      data: inputs.map((text, index) => ({ index, embedding: vectorOf(text) })),
    }));
    return;
  }
  if (url.endsWith('/api/embeddings')) {
    fallbackCalls += 1;
    const text = String(body.prompt ?? '');
    if (text.includes('BAD-INSTRUCTION')) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"error":"input too long"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ embedding: vectorOf(text) }));
    return;
  }
  response.writeHead(404);
  response.end();
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const embedding = { model: 'probe-embed', base_url: `${baseUrl}/v1`, api_key: 'ollama' };

const root = join(tmpdir(), `codeslice-rag-index-${process.pid}`);
rmSync(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });

/** SHA-256, the same hash the chunker stamps. */
const hashOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Wait until the background job leaves `running`. */
async function waitForIdle(document, settings, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    const status = await vectorIndexStatus(root, document, settings);
    if (status.state !== 'running') return status;
    if (Date.now() - started > timeoutMs) throw new Error('the index job did not finish');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

try {
  console.log('rag index probe\n');

  /* ---- 1. batch + per-input fallback ------------------------------- */
  const batch = await embedTexts({
    base_url: embedding.base_url,
    model: embedding.model,
    texts: ['alpha one', 'beta two', 'other three'],
  });
  check(batch.vectors.length === 3 && batch.failed === 0, 'a healthy batch embeds every input');
  check(JSON.stringify(batch.vectors[0]) === '[1,0,0]', 'the provider vector is parsed in order');
  check(batchCalls === 1, 'three texts use one batch request', String(batchCalls));

  const mixed = await embedTexts({
    base_url: embedding.base_url,
    model: embedding.model,
    texts: ['alpha good', 'BAD-INSTRUCTION here', 'beta good'],
  });
  check(mixed.vectors[0] !== null && mixed.vectors[2] !== null, 'the good inputs in a failed batch survive');
  check(mixed.vectors[1] === null, 'only the rejected input degrades to null');
  check(mixed.failed === 1, 'the failed count names one input', String(mixed.failed));
  check(fallbackCalls > 0, 'the native Ollama route was tried as a fallback', String(fallbackCalls));

  const query = await embedQuery({ base_url: embedding.base_url, model: embedding.model, text: 'alpha' });
  check(JSON.stringify(query) === '[1,0,0]', 'embedQuery returns the query vector');

  /* ---- 2. the background builder ---------------------------------- */
  await writeModelSettings(root, { embedding });
  const chunks = [
    { path: 'src/alpha.js', start_line: 1, end_line: 10, content: 'alpha code', hash: hashOf('alpha code') },
    { path: 'src/beta.js', start_line: 1, end_line: 10, content: 'beta code', hash: hashOf('beta code') },
    { path: 'src/other.js', start_line: 1, end_line: 10, content: 'other code', hash: hashOf('other code') },
    { path: 'src/more.js', start_line: 1, end_line: 10, content: 'more code', hash: hashOf('more code') },
  ].map((chunk) => ({ ...chunk, language: 'javascript', kind: 'block', symbol: null }));
  const document = { chunks: { chunks } };
  const before = batchCalls;

  const started = await startVectorIndex({ root, document, embedding });
  check(started.state === 'running', 'the build returns immediately as running', started.state);
  const done = await waitForIdle(document, embedding);
  check(done.state === 'ready', 'the background build reaches ready', done.state);
  check(done.vectors === 4 && done.missing === 0, 'every chunk has a vector', `${done.vectors}/${done.chunks}`);
  check(done.model === embedding.model && done.dims === 3, 'the status reports model and dimensions',
    `${done.model} ${done.dims}`);
  check(batchCalls === before + 1, 'four chunks use one embedding batch', `${batchCalls - before}`);

  /* ---- 3. vector retrieval ---------------------------------------- */
  const rows = await retrieveVectorRows(root, chunks, 'alpha', 3);
  check(rows.length === 3, 'vector retrieval returns rows', String(rows.length));
  check(rows[0]?.path === 'src/alpha.js', 'the semantically closest chunk ranks first', rows[0]?.path);
  check(rows[0]?.retriever === 'vector', 'rows name their retriever');
  check(rows[0]?.line === 1 && rows[0]?.endLine === 10 && rows[0]?.snippet === 'alpha code',
    'a vector row keeps its line span and snippet');

  const context = await assembleContext({
    root,
    document: { nodes: [], edges: [], chunks: { chunks } },
    text: 'alpha',
    config: { topK: 5, includeNotes: false, includeGraph: false },
  });
  check(context.retrieval.length > 0, 'assembleContext retrieves chunks');
  check(context.retrieval[0]?.path === 'src/alpha.js', 'the fused list keeps the semantic best hit first',
    context.retrieval[0]?.path);
  check(context.retrieval.some((row) => row.retriever === 'hybrid'),
    'keyword and vector hits are fused, not merely concatenated',
    context.retrieval.map((row) => row.retriever).join(','));

  /* ---- 4. the model is part of the index identity ------------------ */
  const mismatch = await vectorIndexStatus(root, document, { ...embedding, model: 'another-model' });
  check(mismatch.vectors === 0 && mismatch.missing === 4, 'a model change invalidates every vector',
    `${mismatch.vectors}/${mismatch.missing}`);
  const otherRows = await retrieveVectorRows(root, chunks, 'alpha', 3);
  // The saved model still matches the settings on disk, so retrieval works. The
  // mismatch above only describes what a rebuild with another model would see.
  check(otherRows.length === 3, 'retrieval keeps using the stored model');

  /* ---- 5. incremental rebuild ------------------------------------- */
  const callsBeforeIncremental = batchCalls;
  await startVectorIndex({ root, document, embedding });
  const unchanged = await waitForIdle(document, embedding);
  check(unchanged.vectors === 4, 'an unchanged corpus keeps four vectors');
  check(batchCalls === callsBeforeIncremental, 'an unchanged corpus embeds nothing',
    `${batchCalls - callsBeforeIncremental}`);

  const changedDocument = {
    chunks: {
      chunks: [
        ...chunks.slice(0, 3),
        { ...chunks[3], content: 'alpha changed', hash: hashOf('alpha changed') },
      ],
    },
  };
  await startVectorIndex({ root, document: changedDocument, embedding });
  const changed = await waitForIdle(changedDocument, embedding);
  check(changed.vectors === 4, 'a changed chunk is re-embedded');
  check(batchCalls === callsBeforeIncremental + 1, 'only the changed chunk is sent',
    `${batchCalls - callsBeforeIncremental}`);

  /* ---- 6. a damaged blob is "no vectors", never shifted scores ----- */
  const manifest = JSON.parse(await fs.readFile(statePath(root, 'vectors'), 'utf8'));
  await fs.writeFile(join(stateDir(), manifest.bin), Buffer.from([0, 1, 2]));
  const corrupt = await loadVectorIndex(root);
  check(corrupt === undefined, 'a truncated binary is treated as absent');
  const noRows = await retrieveVectorRows(root, chunks, 'alpha', 3);
  check(noRows.length === 0, 'retrieval degrades to no vector rows');
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
  const remaining = await fs.readFile(statePath(root, 'vectors'), 'utf8')
    .then((body) => JSON.parse(body)).catch(() => null);
  if (typeof remaining?.bin === 'string') {
    await fs.rm(join(stateDir(), remaining.bin), { force: true }).catch(() => {});
  }
  for (const name of ['vectors', 'models', 'rag']) {
    await fs.rm(statePath(root, name), { force: true }).catch(() => {});
  }
}

console.log(`\n=== summary ===\n  ${passed}/${probes} checks passed`);
if (failed > 0) process.exit(1);
