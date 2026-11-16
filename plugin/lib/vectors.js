/**
 * The embedding index: packed vectors, a background builder, and vector search.
 *
 * This is the plugin's port of the desktop's `indexer.py` + `hybrid.py` vector
 * half. The properties worth keeping are the desktop's, not invented here:
 *
 *   - **Chunks are the unit.** A vector belongs to one chunk record, keyed by its
 *     content hash, so a chunk that did not change is never re-embedded and the
 *     same text shared by two locations costs one vector.
 *   - **The model is part of the index identity.** Vectors from `bge-m3` are not
 *     comparable with vectors from `qwen3-embedding`; when the configured model
 *     changes, the old vectors are simply not used and the next build replaces
 *     them.
 *   - **Failure degrades, never blocks.** A missing Ollama, a rejected batch, or
 *     a corrupt binary all mean "keyword-only retrieval", which is a working
 *     product; they never make a question fail.
 *
 * Storage is two files under the plugin's state directory: a JSON manifest with
 * the hash → offset table, and a binary Float32 blob. The desktop stores packed
 * `array('f')` blobs in SQLite for the same reason — a JSON array of floats is
 * roughly ten times larger and slower to parse.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
  embedQuery, embedTexts, EMBED_BATCH_SIZE, MAX_EMBED_CHARS, readModelSettings,
} from './models.js';
import { readJson, stateDir, stateFile, writeJson } from './store.js';

/** Bumped when the manifest shape changes; a mismatch is a cold index. */
export const VECTOR_VERSION = 1;

/** The query-side candidate width. Deliberately wider than `topK`. */
const VECTOR_FETCH = 24;

/** Save partial progress this often, so a crash loses at most a few batches. */
const SAVE_EVERY_BATCHES = 4;

/** In-flight index jobs, keyed by lower-cased absolute root. */
const JOBS = new Map();

/** Roots whose build is still doing its async pre-flight (loading old vectors). */
const STARTING = new Set();

/** The per-root job key. */
function keyOf(root) {
  return String(resolve(root)).toLowerCase();
}

/** The manifest path for one root. */
function manifestPath(root) {
  return stateFile(root, 'vectors', 'json');
}

/**
 * Read and validate just the manifest (no binary).
 * @param root - absolute workspace root.
 * @returns the manifest, or undefined when absent/unusable/stale.
 */
export async function readVectorManifest(root) {
  const document = await readJson(manifestPath(root));
  if (document === undefined || document.storeVersion !== VECTOR_VERSION) return undefined;
  if (typeof document.model !== 'string' || document.model === '') return undefined;
  const dims = Math.trunc(Number(document.dims));
  if (!Number.isFinite(dims) || dims <= 0) return undefined;
  if (typeof document.bin !== 'string' || basename(document.bin) !== document.bin) return undefined;
  if (!Array.isArray(document.entries)) return undefined;
  return document;
}

/**
 * Load the full vector index, including the packed vectors.
 *
 * A manifest whose binary is missing or the wrong length is treated as absent:
 * a partial blob must answer "no vectors", never produce scores from shifted
 * bytes.
 * @param root - absolute workspace root.
 * @returns `{ model, dims, builtAt, byHash, norms }` or undefined.
 */
export async function loadVectorIndex(root) {
  const manifest = await readVectorManifest(root);
  if (manifest === undefined) return undefined;
  let buffer;
  try {
    buffer = await fs.readFile(join(stateDir(), manifest.bin));
  } catch {
    return undefined;
  }
  const dims = Math.trunc(manifest.dims);
  const entries = manifest.entries.filter((row) => typeof row?.hash === 'string' && row.hash !== '');
  if (buffer.length !== entries.length * dims * 4) return undefined;

  const byHash = new Map();
  const norms = new Map();
  entries.forEach((entry, index) => {
    const vector = new Float32Array(dims);
    const base = index * dims * 4;
    let norm = 0;
    for (let i = 0; i < dims; i += 1) {
      const value = buffer.readFloatLE(base + i * 4);
      vector[i] = value;
      norm += value * value;
    }
    byHash.set(entry.hash, vector);
    norms.set(entry.hash, Math.sqrt(norm) || 1);
  });
  return {
    model: manifest.model,
    dims,
    builtAt: Number(manifest.builtAt) || 0,
    byHash,
    norms,
  };
}

/**
 * Write one complete vector generation.
 *
 * The binary name carries a nonce and the manifest points at it, so an interrupted
 * write can never leave an old manifest reading a new blob at the wrong offsets.
 * The previous generation is removed only after the new manifest has landed.
 *
 * @param root - absolute workspace root.
 * @param options - `{ model, entries: [{ hash, vector }] }`.
 * @returns `{ entries, dims, builtAt }`.
 */
export async function saveVectorIndex(root, options = {}) {
  const model = String(options.model ?? '').trim();
  const rows = (Array.isArray(options.entries) ? options.entries : [])
    .filter((row) => typeof row?.hash === 'string' && row.hash !== '' && row.vector?.length > 0);
  if (model === '' || rows.length === 0) return { entries: 0, dims: 0, builtAt: 0 };
  const dims = rows[0].vector.length;
  const usable = rows.filter((row) => row.vector.length === dims);

  const buffer = Buffer.alloc(usable.length * dims * 4);
  usable.forEach((row, index) => {
    const base = index * dims * 4;
    for (let i = 0; i < dims; i += 1) {
      buffer.writeFloatLE(Number(row.vector[i]) || 0, base + i * 4);
    }
  });

  const nonce = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const binPath = stateFile(root, `vectors-${nonce}`, 'bin');
  const temp = `${binPath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    await fs.mkdir(stateDir(), { recursive: true });
    handle = await fs.open(temp, 'wx');
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, binPath);
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // Already closed or never opened.
    }
    try {
      await fs.unlink(temp);
    } catch {
      // The temp file may never have existed.
    }
    throw error;
  }

  const previous = await readVectorManifest(root);
  const manifest = {
    storeVersion: VECTOR_VERSION,
    root: resolve(root),
    model,
    dims,
    bin: basename(binPath),
    builtAt: Date.now(),
    entries: usable.map((row, index) => ({ hash: row.hash, offset: index * dims })),
  };
  const saved = await writeJson(manifestPath(root), manifest);
  if (!saved) throw new Error('the vector manifest could not be written');
  if (previous?.bin !== undefined && previous.bin !== manifest.bin) {
    // Best effort: an orphaned old blob is harmless, and failing here would turn
    // a successful save into an error.
    await fs.unlink(join(stateDir(), previous.bin)).catch(() => {});
  }
  return { entries: usable.length, dims, builtAt: manifest.builtAt };
}

/**
 * Cosine search over the packed index.
 * @param index - the value from {@link loadVectorIndex}.
 * @param chunks - the document's chunk records.
 * @param queryVector - the embedded question.
 * @param limit - maximum hits.
 * @returns `[{ chunk, score }]`, best first.
 */
export function searchVectors(index, chunks, queryVector, limit = VECTOR_FETCH) {
  if (index === undefined || index === null || !Array.isArray(queryVector) || queryVector.length === 0) return [];
  if (queryVector.length !== index.dims) return [];
  let queryNorm = 0;
  for (const value of queryVector) queryNorm += value * value;
  queryNorm = Math.sqrt(queryNorm) || 1;

  const scored = [];
  for (const chunk of chunks ?? []) {
    if (typeof chunk?.hash !== 'string') continue;
    const vector = index.byHash.get(chunk.hash);
    if (vector === undefined || vector.length !== index.dims) continue;
    let dot = 0;
    for (let i = 0; i < vector.length; i += 1) dot += queryVector[i] * vector[i];
    scored.push({ chunk, score: dot / (queryNorm * (index.norms.get(chunk.hash) ?? 1)) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.trunc(Number(limit) || VECTOR_FETCH)));
}

/** Clip a snippet with the same marker retrieval uses. */
function truncate(text, limit) {
  const body = String(text ?? '');
  return body.length > limit ? `${body.slice(0, limit)}\n…(截断)` : body;
}

/**
 * Vector retrieval as `searchRecords`-shaped rows.
 *
 * Returns `[]` — never throws — for every "cannot answer" state: no index, a
 * model mismatch, Ollama down, a vector of the wrong width. The caller fuses
 * whatever rows exist and keyword search keeps working.
 *
 * @param root - absolute workspace root.
 * @param chunks - the document's chunk records.
 * @param question - the reader's question.
 * @param limit - maximum rows.
 * @returns `[{ path, line, endLine, symbol, kind, language, snippet, score, retriever }]`.
 */
export async function retrieveVectorRows(root, chunks, question, limit = 12) {
  if (typeof root !== 'string' || root === '' || !Array.isArray(chunks) || chunks.length === 0) return [];
  if (String(question ?? '').trim() === '') return [];
  let index;
  let settings;
  try {
    index = await loadVectorIndex(root);
    if (index === undefined) return [];
    settings = await readModelSettings(root);
  } catch {
    return [];
  }
  if (settings.embedding?.model !== index.model) return [];
  const queryVector = await embedQuery({
    base_url: settings.embedding.base_url,
    model: settings.embedding.model,
    text: String(question),
  });
  if (queryVector === null) return [];

  return searchVectors(index, chunks, queryVector, Math.max(1, Math.trunc(Number(limit) || 12))).map(({ chunk, score }) => ({
    path: chunk.path,
    line: chunk.start_line,
    endLine: chunk.end_line,
    symbol: chunk.symbol ?? null,
    kind: chunk.kind,
    language: chunk.language ?? '',
    snippet: truncate(chunk.content, 4000),
    score: Math.round(score * 1e5) / 1e5,
    retriever: 'vector',
  }));
}

/**
 * The index status the settings panel renders.
 * @param root - absolute workspace root.
 * @param document - the built document, or undefined.
 * @param embedding - the configured embedding settings (`{ model, base_url }`).
 * @returns a status object, never throwing.
 */
export async function vectorIndexStatus(root, document, embedding) {
  const chunks = Array.isArray(document?.chunks?.chunks)
    ? document.chunks.chunks
    : (Array.isArray(document?.chunks) ? document.chunks : []);
  let chunkCount = 0;
  for (const chunk of chunks) {
    if (typeof chunk?.hash !== 'string' || chunk.hash === '') continue;
    chunkCount += 1;
  }

  let manifest;
  try {
    manifest = await readVectorManifest(root);
  } catch {
    manifest = undefined;
  }
  const model = typeof embedding?.model === 'string' && embedding.model !== '' ? embedding.model : null;
  const job = JOBS.get(keyOf(root));
  const manifestHashes = manifest !== undefined && manifest.model === model
    ? new Set(manifest.entries.map((row) => row.hash))
    : null;
  const indexed = manifestHashes === null ? 0 : chunks.reduce(
    (count, chunk) => count + (typeof chunk?.hash === 'string' && manifestHashes.has(chunk.hash) ? 1 : 0),
    0,
  );
  const running = job?.state === 'running';
  const vectors = running ? Math.min(chunkCount, job.vectors ?? 0) : indexed;

  return {
    state: running ? 'running' : (vectors > 0 ? 'ready' : (job?.state === 'error' ? 'error' : 'idle')),
    chunks: chunkCount,
    vectors,
    missing: Math.max(0, chunkCount - vectors),
    model,
    indexedModel: manifest?.model ?? null,
    dims: running ? (job?.dims ?? manifest?.dims ?? 0) : (manifest?.dims ?? 0),
    builtAt: manifest?.builtAt ?? null,
    total: job?.total ?? 0,
    done: job?.done ?? 0,
    failed: job?.failed ?? 0,
    error: job?.error ?? null,
    startedAt: job?.startedAt ?? null,
    finishedAt: job?.finishedAt ?? null,
  };
}

/**
 * Start (or join) one background embedding build for a root.
 *
 * Incremental by default: every chunk whose hash already has a vector from the
 * same model is kept. `force` ignores the existing vectors but still reuses the
 * document's chunks — a rebuild is about the model, not about re-walking the repo.
 *
 * @param options - `{ root, document, embedding, force, timeout_ms }`.
 * @returns the current status immediately; the work continues in the background.
 * @throws when no embedding model is configured.
 */
export async function startVectorIndex(options = {}) {
  const { root, document, embedding, force = false } = options;
  const model = String(embedding?.model ?? '').trim();
  if (model === '') throw new Error('configure an embedding model before building the index');
  const key = keyOf(root);
  if (JOBS.get(key)?.state === 'running' || STARTING.has(key)) {
    return vectorIndexStatus(root, document, embedding);
  }
  // Set synchronously, before the first await, so two panels clicking "build"
  // cannot both start a job for the same root.
  STARTING.add(key);
  try {
    const chunks = Array.isArray(document?.chunks?.chunks)
      ? document.chunks.chunks
      : (Array.isArray(document?.chunks) ? document.chunks : []);
    const presentHashes = new Set();
    const byHash = new Map();
    for (const chunk of chunks) {
      if (typeof chunk?.hash !== 'string' || chunk.hash === '') continue;
      presentHashes.add(chunk.hash);
      if (!byHash.has(chunk.hash)) byHash.set(chunk.hash, String(chunk.content ?? '').slice(0, MAX_EMBED_CHARS));
    }

    const existing = new Map();
    if (!force) {
      let index;
      try {
        index = await loadVectorIndex(root);
      } catch {
        index = undefined;
      }
      if (index !== undefined && index.model === model) {
        for (const [hash, vector] of index.byHash) {
          if (presentHashes.has(hash)) existing.set(hash, vector);
        }
      }
    }

    const queue = [...byHash.entries()].filter(([hash]) => !existing.has(hash));
    const job = {
      state: 'running',
      model,
      total: queue.length,
      done: 0,
      failed: 0,
      vectors: existing.size,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
    JOBS.set(key, job);

    const save = async () => {
      const entries = [];
      for (const [hash, vector] of existing) {
        if (presentHashes.has(hash)) entries.push({ hash, vector });
      }
      if (entries.length === 0) return;
      await saveVectorIndex(root, { model, entries });
    };

    const run = async () => {
      try {
        let dimension = 0;
        for (let start = 0, batch = 0; start < queue.length; start += EMBED_BATCH_SIZE, batch += 1) {
          const slice = queue.slice(start, start + EMBED_BATCH_SIZE);
          const result = await embedTexts({
            base_url: embedding.base_url,
            model,
            texts: slice.map(([, text]) => text),
            batch_size: slice.length,
            ...(options.timeout_ms === undefined ? {} : { timeout_ms: options.timeout_ms }),
          });
          slice.forEach(([hash], index) => {
            const vector = result.vectors[index];
            if (Array.isArray(vector) && vector.length > 0) {
              existing.set(hash, vector);
              dimension = vector.length;
            } else {
              job.failed += 1;
            }
          });
          job.done = Math.min(job.total, start + slice.length);
          job.vectors = existing.size;
          if (result.error !== null) job.error = result.error;
          if (batch % SAVE_EVERY_BATCHES === SAVE_EVERY_BATCHES - 1) await save();
        }
        // Never destroy a usable generation because this run embedded nothing: a
        // model outage while the reader clicked "rebuild" must leave the old index
        // searchable rather than replace it with an empty one.
        if (existing.size > 0) await save();
        job.vectors = existing.size;
        job.finishedAt = Date.now();
        job.dims = dimension || undefined;
        if (job.failed > 0 && job.error === null) {
          job.error = `${job.failed}/${job.total} 段无法生成向量（可能超出模型上下文）`;
        }
        // Nothing embedded at all is a failure, not a completed empty index.
        job.state = existing.size === 0 && job.total > 0 ? 'error' : 'done';
        if (job.state === 'error' && job.error === null) {
          job.error = '没有生成任何向量，请确认 Ollama 与向量模型可用';
        }
      } catch (error) {
        job.state = 'error';
        job.error = error instanceof Error ? error.message : String(error);
        job.finishedAt = Date.now();
      }
    };

    void run();
  } finally {
    STARTING.delete(key);
  }
  return vectorIndexStatus(root, document, embedding);
}
