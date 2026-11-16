/**
 * RAG settings: the knobs `ask` reads, stored per root.
 *
 * `WIRE-CHAT.md §15` adds a second sibling document, `<rootKey>.rag.json`. It is
 * small and it is *configuration*, but it is still user data — a reader who tuned
 * `topK` should not lose it because the process restarted — so it follows the
 * same durability rules as the note library (atomic write, one chain per file, the
 * whole read-modify-write queued) and a corrupt file is moved aside and refused
 * rather than replaced by defaults.
 *
 * **Chunking is not a setting.** The desktop's bands (`FALLBACK_LINES 60`,
 * `MAX_CHUNK_LINES 220`, `MAX_CHUNK_CHARS 8000`) are constants in `retrieval.js`,
 * because a chunk span is an indexing decision that must be identical for every
 * reader of the same corpus. `topK`/`rrfK` are budget knobs and stay configurable;
 * `chunkLines` sent by an older client is dropped by {@link normaliseRagConfig}
 * instead of being stored where a future build might read it.
 */

import { promises as fs } from 'node:fs';

import { ALL_FAMILIES, DEFAULT_FAMILIES } from './model.js';
import { RRF_K } from './retrieval.js';
import { STORE_VERSION, readJsonChecked, statePath, writeJson } from './store.js';

/** Bumped when the on-disk rag document shape changes. */
export const RAG_VERSION = 2;

/**
 * The defaults, verbatim from `WIRE-CHAT.md §15`.
 */
export const RAG_DEFAULTS = Object.freeze({
  topK: 8,
  rrfK: RRF_K,
  families: Object.freeze(DEFAULT_FAMILIES.slice()),
  includeNotes: true,
  includeGraph: true,
});

/** The clamp ranges the contract names. */
export const RAG_LIMITS = Object.freeze({
  topK: [1, 24],
  rrfK: [1, 100],
});

/** Clamp one number into `[min, max]`, falling back when it is not a number. */
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

/** Finite number check for a value a caller may not have sent at all. */
function isPresent(value) {
  return value !== undefined && value !== null;
}

/**
 * Turn any candidate into a valid configuration.
 *
 * Every field is clamped independently and unknown keys — including the retired
 * `chunkLines`/`maxChunkLines`/`maxChunkChars` — are dropped, so a client running
 * one version ahead cannot poison the stored document with fields this version
 * would later read back as `undefined`.
 *
 * @param candidate - a partial configuration, or nothing.
 * @returns a complete, validated configuration.
 */
export function normaliseRagConfig(candidate) {
  const input = candidate !== null && typeof candidate === 'object' ? candidate : {};
  const topK = clampNumber(
    isPresent(input.topK) ? input.topK : RAG_DEFAULTS.topK,
    RAG_LIMITS.topK[0], RAG_LIMITS.topK[1], RAG_DEFAULTS.topK,
  );
  const rrfK = clampNumber(
    isPresent(input.rrfK) ? input.rrfK : RAG_DEFAULTS.rrfK,
    RAG_LIMITS.rrfK[0], RAG_LIMITS.rrfK[1], RAG_DEFAULTS.rrfK,
  );

  let families = RAG_DEFAULTS.families.slice();
  if (Array.isArray(input.families)) {
    // A family name this build does not know is dropped rather than stored: it
    // would filter every edge out of the graph context and read as "the graph
    // contributed nothing" instead of "that family does not exist".
    const wanted = [...new Set(input.families.map((name) => String(name)).filter((name) => ALL_FAMILIES.includes(name)))];
    if (wanted.length > 0) families = wanted;
  } else if (typeof input.families === 'string' && ALL_FAMILIES.includes(input.families)) {
    families = [input.families];
  }

  return {
    topK,
    rrfK,
    families,
    includeNotes: typeof input.includeNotes === 'boolean' ? input.includeNotes : RAG_DEFAULTS.includeNotes,
    includeGraph: typeof input.includeGraph === 'boolean' ? input.includeGraph : RAG_DEFAULTS.includeGraph,
  };
}

/**
 * Merge a patch over a base configuration and validate the result.
 *
 * `undefined`/absent in the patch means "keep the base value", so a panel that
 * sends only `{ topK: 12 }` cannot silently reset `families` to the defaults.
 * `null` is treated as absent for the same reason: a form field that was left
 * empty sends nothing, not "delete".
 *
 * @param base - the current configuration.
 * @param patch - the requested changes.
 * @returns the merged, validated configuration.
 */
export function mergeRagConfig(base, patch) {
  const current = normaliseRagConfig(base);
  const changes = patch !== null && typeof patch === 'object' ? patch : {};
  const merged = { ...current };
  for (const key of Object.keys(RAG_DEFAULTS)) {
    if (!isPresent(changes[key])) continue;
    merged[key] = changes[key];
  }
  return normaliseRagConfig(merged);
}

/* ------------------------------------------------------------------ *
 * Storage                                                            *
 * ------------------------------------------------------------------ */

/** The chain of in-flight cycles per file — see `chat.js` for why the cycle, not the write. */
const writeChains = new Map();

/** Run `task` after every earlier cycle on `file` settles. */
function serialise(file, task) {
  const prior = writeChains.get(file) ?? Promise.resolve();
  const next = prior.then(task, task);
  writeChains.set(file, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * Read one root's RAG document.
 *
 * Same three-way decision as `store.loadNotes`: absent means "never configured, use
 * the defaults"; a version mismatch means this plugin's own schema moved and the
 * defaults are correct; anything else is a damaged file that is preserved and
 * refused.
 * @param root - absolute workspace root.
 * @returns the validated configuration.
 * @throws when the stored file exists but cannot be parsed.
 */
export async function loadRag(root) {
  const file = statePath(root, 'rag');
  const result = await readJsonChecked(file);
  if (!result.ok) {
    if (result.reason === 'absent') return normaliseRagConfig(undefined);
    const aside = `${file}.corrupt-${Date.now()}`;
    try {
      await fs.rename(file, aside);
    } catch {
      // If it cannot be moved aside, still refuse to overwrite it.
    }
    throw new Error(
      `RAG settings are unreadable (${result.detail ?? 'parse error'}); the damaged file was kept at ${aside}`,
    );
  }
  const document = result.value;
  if (document.storeVersion !== STORE_VERSION) return normaliseRagConfig(undefined);
  return normaliseRagConfig(document.config);
}

/**
 * Read-modify-write the RAG document as one queued cycle.
 * @param root - absolute workspace root.
 * @param mutate - `(config) => value`.
 * @returns the mutator's value.
 * @throws when the stored file is unreadable or the write does not land.
 */
export async function updateRag(root, mutate) {
  const file = statePath(root, 'rag');
  return serialise(file, async () => {
    const config = await loadRag(root);
    // The mutator's *return value* is the new configuration; it is not required to
    // mutate `config` in place, and `mergeRagConfig` deliberately does not. Writing
    // the loaded object instead of the result persisted the old settings and lost
    // every `rag write` — the bug this line exists to not repeat.
    const next = normaliseRagConfig(await mutate(config));
    const saved = await writeJson(file, { config: next, storeVersion: STORE_VERSION });
    if (!saved) throw new Error('the RAG settings could not be written (disk full or permission denied)');
    return next;
  });
}

/**
 * The `rag` read payload (`WIRE-CHAT.md §15`).
 * @param root - absolute workspace root.
 * @returns `{ config }`.
 */
export async function readRagSettings(root) {
  const config = await loadRag(root);
  return { config };
}

/**
 * The `rag` write payload: merge the patch, store it, report what was stored.
 * @param root - absolute workspace root.
 * @param patch - the requested configuration.
 * @returns `{ config }`.
 */
export async function writeRagSettings(root, patch) {
  const config = await updateRag(root, (current) => mergeRagConfig(current, patch));
  return { config };
}

/**
 * The `rag` settings `ask` should use for one request: the stored configuration,
 * overridden by the request's own `rag` object when it sent one.
 *
 * A per-request override is deliberately not persisted — the panel's "this one
 * question, deeper" toggle must not rewrite the saved settings.
 * @param root - absolute workspace root.
 * @param override - the request's `rag` field, or nothing.
 * @returns the effective configuration.
 */
export async function effectiveRagConfig(root, override) {
  const stored = await loadRag(root);
  if (override === null || override === undefined || typeof override !== 'object') return stored;
  return mergeRagConfig(stored, override);
}
