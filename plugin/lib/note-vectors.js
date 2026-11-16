/**
 * Note embeddings: a packed vector cache for the notes graph.
 *
 * The notes graph only needs *note↔note* similarity, so this cache is
 * deliberately separate from the code index in `vectors.js`:
 *
 *   - the unit is a **note**, keyed by the hash of its title+body, not a code
 *     chunk; mixing the two would make one model change invalidate the other;
 *   - a missing Ollama, a rejected batch or a corrupt blob all mean
 *     "lexical-only graph", which is a working product — never a failed
 *     `notes op=graph`;
 *   - the manifest names its binary, so an interrupted write can never read
 *     shifted bytes.
 *
 * Storage mirrors `vectors.js`: a JSON manifest plus one Float32 blob under the
 * plugin state directory.
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';

import { embedTexts, MAX_EMBED_CHARS, readModelSettings } from './models.js';
import {
  readJson, stateDir, stateFile, writeJson,
} from './store.js';

/** Bumped when the manifest shape changes; a mismatch is a cold cache. */
export const NOTE_VECTOR_VERSION = 1;

/** Notes beyond this count are not embedded inline; lexical edges are used. */
const MAX_NOTES = 400;

/** Inline budget for one `notes op=graph` request. */
const NOTE_EMBED_TIMEOUT_MS = 20000;

/** The manifest for one root. */
function manifestPath(root) {
  return stateFile(root, 'note-vectors', 'json');
}

/** The text one vector represents. Title first: it carries the topic. */
export function noteEmbedText(note) {
  const title = String(note?.title ?? '').trim();
  const body = String(note?.body ?? '').trim();
  return `${title}\n${body}`.slice(0, MAX_EMBED_CHARS);
}

/** Content hash of a note: the cache key, and the "did it change" test. */
export function noteEmbedHash(note) {
  return createHash('sha256')
    .update(noteEmbedText(note).replace(/\r\n/gu, '\n'), 'utf8')
    .digest('hex');
}

/**
 * Read and validate just the manifest.
 * @param root - absolute workspace root.
 * @returns the manifest, or undefined when absent/unusable.
 */
async function readNoteManifest(root) {
  const document = await readJson(manifestPath(root));
  if (document === undefined || document.storeVersion !== NOTE_VECTOR_VERSION) return undefined;
  if (typeof document.model !== 'string' || document.model === '') return undefined;
  const dims = Math.trunc(Number(document.dims));
  if (!Number.isFinite(dims) || dims <= 0) return undefined;
  if (typeof document.bin !== 'string' || basename(document.bin) !== document.bin) return undefined;
  if (!Array.isArray(document.entries)) return undefined;
  return document;
}

/**
 * Load the packed note vectors, or undefined when unusable.
 * @param root - absolute workspace root.
 * @returns `{ model, dims, byHash, norms }` or undefined.
 */
export async function loadNoteVectors(root) {
  const manifest = await readNoteManifest(root);
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
  return { model: manifest.model, dims, byHash, norms };
}

/**
 * Write one complete vector generation.
 * @param root - absolute workspace root.
 * @param options - `{ model, entries: [{ hash, vector }] }`.
 * @returns `{ entries, dims, builtAt }`.
 */
export async function saveNoteVectors(root, options = {}) {
  const model = String(options.model ?? '').trim();
  const rows = (Array.isArray(options.entries) ? options.entries : [])
    .filter((row) => typeof row?.hash === 'string' && row.hash !== '' && row.vector?.length > 0);
  if (model === '' || rows.length === 0) return { entries: 0, dims: 0, builtAt: 0 };
  const dims = rows[0].vector.length;
  const usable = rows.filter((row) => row.vector.length === dims);

  const buffer = Buffer.alloc(usable.length * dims * 4);
  usable.forEach((row, index) => {
    const base = index * dims * 4;
    for (let i = 0; i < dims; i += 1) buffer.writeFloatLE(Number(row.vector[i]) || 0, base + i * 4);
  });

  const nonce = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const binPath = stateFile(root, `note-vectors-${nonce}`, 'bin');
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
    try { await handle?.close(); } catch { /* already closed */ }
    try { await fs.unlink(temp); } catch { /* never created */ }
    throw error;
  }

  const previous = await readNoteManifest(root);
  const manifest = {
    storeVersion: NOTE_VECTOR_VERSION,
    root: String(root ?? ''),
    model,
    dims,
    bin: basename(binPath),
    builtAt: Date.now(),
    entries: usable.map((row) => ({ hash: row.hash })),
  };
  const saved = await writeJson(manifestPath(root), manifest);
  if (!saved) throw new Error('the note vector manifest could not be written');
  if (previous?.bin !== undefined && previous.bin !== manifest.bin) {
    await fs.unlink(join(stateDir(), previous.bin)).catch(() => {});
  }
  return { entries: usable.length, dims, builtAt: manifest.builtAt };
}

/**
 * Ensure every note has a vector for the configured model.
 *
 * Incremental by content hash: an unchanged note is never re-embedded. A note
 * that fails (too long, model missing, Ollama down) simply has no vector, and
 * the caller drops back to lexical edges for it.
 *
 * @param root - absolute workspace root.
 * @param notes - the stored note rows.
 * @returns `{ available, model, dims, byHash, embedded, failed, error, reason }`.
 */
export async function noteVectors(root, notes) {
  const list = (Array.isArray(notes) ? notes : []).filter((note) => note !== null && typeof note === 'object');
  const empty = { available: false, model: null, dims: 0, byHash: new Map(), embedded: 0, failed: 0, error: null, reason: 'no-notes' };
  if (list.length === 0) return empty;
  if (list.length > MAX_NOTES) return { ...empty, reason: 'too-many-notes' };

  let settings;
  try {
    settings = await readModelSettings(root);
  } catch {
    return { ...empty, reason: 'settings-unreadable' };
  }
  const model = String(settings?.embedding?.model ?? '').trim();
  const baseUrl = String(settings?.embedding?.base_url ?? '').trim();
  if (model === '' || baseUrl === '') return { ...empty, reason: 'no-model' };

  let index;
  try {
    index = await loadNoteVectors(root);
  } catch {
    index = undefined;
  }

  const hashById = new Map();
  const textByHash = new Map();
  for (const note of list) {
    if (typeof note?.id !== 'string' || note.id === '') continue;
    const hash = noteEmbedHash(note);
    hashById.set(note.id, hash);
    if (!textByHash.has(hash)) textByHash.set(hash, noteEmbedText(note));
  }

  const existing = new Map();
  if (index !== undefined && index.model === model) {
    for (const [hash, vector] of index.byHash) {
      if (textByHash.has(hash)) existing.set(hash, vector);
    }
  }

  const missing = [...textByHash.keys()].filter((hash) => !existing.has(hash));
  let failed = 0;
  let error = null;
  let dims = index?.model === model ? index.dims : 0;

  if (missing.length > 0) {
    const result = await embedTexts({
      base_url: baseUrl,
      model,
      texts: missing.map((hash) => textByHash.get(hash)),
      batch_size: 8,
      timeout_ms: NOTE_EMBED_TIMEOUT_MS,
    }).catch((caught) => ({ vectors: [], failed: missing.length, error: String(caught?.message ?? caught) }));
    const before = existing.size;
    missing.forEach((hash, position) => {
      const vector = result.vectors?.[position];
      if (Array.isArray(vector) && vector.length > 0) {
        existing.set(hash, vector);
        dims = vector.length;
      }
    });
    failed = missing.length - (existing.size - before);
    error = result.error ?? null;
    if (existing.size > 0) {
      try {
        await saveNoteVectors(root, {
          model,
          entries: [...existing.entries()].map(([hash, vector]) => ({ hash, vector })),
        });
      } catch (caught) {
        error = error ?? String(caught?.message ?? caught);
      }
    }
  }

  const usable = new Map();
  for (const [id, hash] of hashById) {
    const vector = existing.get(hash);
    if (vector !== undefined) usable.set(id, vector);
  }
  if (usable.size === 0) {
    return {
      available: false, model, dims: 0, byHash: new Map(), embedded: 0, failed, error, reason: 'embed-failed',
    };
  }
  return {
    available: true,
    model,
    dims,
    byHash: usable,
    embedded: missing.length - failed,
    failed,
    error,
    reason: null,
  };
}

/**
 * Cosine similarity of two vectors, tolerant of mismatched widths.
 * @returns a number in `[-1, 1]`, or 0 when the vectors cannot be compared.
 */
export function cosineSimilarity(a, b) {
  if (a === undefined || b === undefined || a.length === 0) return 0;
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
