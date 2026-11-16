/**
 * The persisted form of the built document.
 *
 * The built graph is a plain object *except* for two derived structures — the
 * symbol index (five `Map`s) and the retrieval `postings` map. `JSON.stringify`
 * turns a `Map` into `{}` silently, so a document saved straight to disk would
 * load with navigation and search both answering nothing, which looks like "the
 * feature is broken" rather than "the cache format is wrong".
 *
 * This module is the single place that knows the difference:
 *   `toPersisted(document)`    drops what cannot survive JSON
 *   `fromPersisted(document)`  rebuilds it from the arrays that did
 *
 * Keeping both directions in one file is deliberate: the alternative is every
 * caller remembering which fields are safe, and one of them forgetting.
 */

import { rebuildSymbolIndex } from './resolve.js';

/**
 * Fields that must never reach disk: derived `Map` structures and the
 * per-process bookkeeping a fresh build sets.
 */
const VOLATILE = ['index', '__cached', '__root'];

/**
 * Strip the live-only fields from a built document.
 * @param document - the built document.
 * @returns a JSON-safe copy.
 */
export function toPersisted(document) {
  const out = {};
  for (const [key, value] of Object.entries(document)) {
    if (VOLATILE.includes(key)) continue;
    out[key] = value;
  }
  // The chunk records stay; only the inverted index is derived. `searchRecords`
  // accepts a bare chunk array and rebuilds its own candidate set, so dropping
  // `postings` costs one pass over the tokens on load and saves the doubling.
  if (out.chunks !== undefined && out.chunks !== null) {
    out.chunks = {
      chunks: out.chunks.chunks ?? (Array.isArray(out.chunks) ? out.chunks : []),
      version: out.chunks.version,
    };
  }
  return out;
}

/**
 * Rebuild a loaded document's live structures.
 *
 * The symbol index is reconstructed from `nodes` + `refs` — the same two arrays
 * the resolver folded into it — so nothing derived is ever written to disk.
 * @param document - a document loaded from JSON.
 * @returns the same document with a live symbol index.
 */
export function fromPersisted(document) {
  if (document === null || typeof document !== 'object') return document;

  if (!(document.index?.byNode instanceof Map)) {
    document.index = rebuildSymbolIndex(document.nodes ?? [], document.refs ?? []);
  }
  return document;
}
