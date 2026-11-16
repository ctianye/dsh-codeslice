/**
 * Content retrieval: the CJK-bigram tokenizer plus a keyword index.
 *
 * Two things are ported exactly because a test pins them:
 *
 * 1. `retrieval/tokenize.py` in full (`spec §8.1`). SQLite's `unicode61`
 *    tokenizer treats a whole CJK run as one token, so `代码阅读` can never match
 *    `本地优先的代码阅读助手`. Overlapping bigrams on both sides fix that without
 *    a segmentation library.
 * 2. The keyword half of `hybrid.py` (`spec §8.3`–§8.5): the
 *    `max(limit*5, 40)` over-fetch and the `0.75·coverage + 0.25·bm25` blend.
 *
 * `bm25()` is the one thing that cannot be ported — it belongs to SQLite's FTS5
 * engine. As `spec §15.3` prescribes, it is replaced by a length-normalised
 * term-frequency score, so the blend keeps its shape (`0.75` coverage, `0.25`
 * frequency) while the ranking differs from a SQLite build. That substitution is
 * the documented degradation of DESIGN §5.1, not an accident.
 *
 * The vector half lives in `vectors.js`: it needs an embedding model, which is a
 * local Ollama call, while this module stays pure data so a build never waits on
 * the network. `rrfFuse` below is what joins the two ranked lists (the desktop's
 * `RRF_K = 60`), and a build without vectors is simply the single-retriever case
 * of `spec §8.6`.
 */

import { createHash } from 'node:crypto';

import { scanSource } from './analyzer.js';

/* ------------------------------------------------------------------ *
 * Tokenizer (port of retrieval/tokenize.py)                          *
 * ------------------------------------------------------------------ */

/** CJK ranges: Unified Ideographs plus Extension A (`tokenize.py:15`). */
const CJK = '\u4e00-\u9fff\u3400-\u4dbf';

/** An ASCII word or a run of CJK characters. */
const RUN_RE = new RegExp(`[A-Za-z_][A-Za-z0-9_]*|[${CJK}]+`, 'gu');

/** How many tokens one query may contribute to an FTS-style OR-query. */
export const MAX_QUERY_TOKENS = 24;

/**
 * Bumped whenever the tokenization scheme changes, so a persisted index knows to
 * rebuild. Mirrors `tokenize.INDEX_VERSION`; not used by this in-memory port
 * except as a stamp on {@link buildChunkIndex}'s result.
 */
export const INDEX_VERSION = 2;

/** Reciprocal-rank-fusion constant (`hybrid.py:17`). */
export const RRF_K = 60;

/** Line-band size when no structural chunk exists (`chunker.py:23`). */
export const FALLBACK_LINES = 60;

/** A chunk longer than this is split (`chunker.py:24`). */
export const MAX_CHUNK_LINES = 220;

/** Hard content cap per chunk — truncation, never splitting (`chunker.py:25`). */
export const MAX_CHUNK_CHARS = 8000;

/**
 * The chunker's fixed parameters.
 *
 * These are **not settings**. They are the desktop's `chunker.py` constants and
 * they define what "the same corpus" means: two readers opening one workspace
 * must get identical chunk spans, or citations and retrieval scores stop being
 * comparable. `topK`/`rrfK` remain per-root settings because they are prompt
 * budgets; banding is not.
 */
export const CHUNKER = Object.freeze({
  fallbackLines: FALLBACK_LINES,
  maxChunkLines: MAX_CHUNK_LINES,
  maxChunkChars: MAX_CHUNK_CHARS,
});

/**
 * Overlapping bigrams of one CJK run; a single character is its own token.
 * @param run - a run of CJK characters.
 * @returns the tokens, in text order.
 */
function cjkBigrams(run) {
  if (run.length === 1) return [run];
  const out = [];
  for (let i = 0; i < run.length - 1; i += 1) out.push(run.slice(i, i + 2));
  return out;
}

/** True when the first character of `run` is ASCII. */
function startsAscii(run) {
  return run.codePointAt(0) < 128;
}

/**
 * Split text into index tokens: ASCII words lower-cased, CJK bigrams.
 *
 * Dedup is global and order-preserving. The `limit` check happens **after** a
 * whole run has been expanded, so the loop may push up to `run.length - 1` tokens
 * past the limit before slicing — numerically harmless, and reproduced because
 * the returned list is what callers key on (`spec §8.1`).
 *
 * @param text - any text.
 * @param limit - maximum tokens to return, or null for no limit.
 * @returns the tokens, in first-occurrence order.
 *
 * @example
 * searchTokens('本地优先的代码阅读助手')
 * // ['本地','地优','优先','先的','代的','代码','码阅','阅读','读助','助手']
 */
export function searchTokens(text, limit = null) {
  const tokens = [];
  const seen = new Set();
  RUN_RE.lastIndex = 0;
  let match;
  while ((match = RUN_RE.exec(String(text ?? ''))) !== null) {
    const run = match[0];
    let parts;
    if (startsAscii(run)) {
      const token = run.toLowerCase();
      // Single ASCII characters are dropped: they match nearly every chunk and
      // carry no signal.
      if (token.length < 2) continue;
      parts = [token];
    } else {
      parts = cjkBigrams(run);
    }
    for (const part of parts) {
      if (seen.has(part)) continue;
      seen.add(part);
      tokens.push(part);
    }
    if (limit && tokens.length >= limit) return tokens.slice(0, limit);
  }
  return tokens;
}

/**
 * Tokenize *with* repetition, for term-frequency scoring.
 *
 * `searchTokens` dedupes because a stored searchable column is a set — but a set
 * cannot answer "how many times does this chunk say `louvain`", and that count is
 * the whole point of the frequency half of the score blend. Keeping a second view
 * that preserves every occurrence is what makes the 25 % term-frequency weight
 * mean something; deriving it from the deduped set made it a constant.
 *
 * Uses the same run and CJK-bigram rules as `searchTokens`, so both views agree on
 * what a token *is*.
 *
 * @param text - the text to tokenize.
 * @returns every token occurrence, in order.
 */
export function tokenStream(text) {
  const out = [];
  RUN_RE.lastIndex = 0;
  let match;
  while ((match = RUN_RE.exec(String(text ?? ''))) !== null) {
    const run = match[0];
    if (/^[A-Za-z_]/u.test(run)) {
      const token = run.toLowerCase();
      if (token.length >= 2) out.push(token);
      continue;
    }
    // CJK: every overlapping bigram, repeats included; a single char stands alone.
    if (run.length === 1) {
      out.push(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) out.push(run.slice(index, index + 2));
  }
  return out;
}

/**
 * The value stored in a searchable column: a bag of tokens, space separated.
 *
 * This is a token *bag*, not the original text — which is why coverage below is a
 * ` token ` set test rather than a substring test.
 *
 * @param parts - the strings to index (content, path, symbol…).
 * @returns the space-joined token bag.
 */
export function indexText(...parts) {
  const tokens = [];
  const seen = new Set();
  for (const part of parts) {
    for (const token of searchTokens(part ?? '')) {
      if (seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens.join(' ');
}

/**
 * Turn a question into a quoted OR-query, or `''` when it has no usable token.
 *
 * The shape mirrors `tokenize.fts_query` exactly (`"a" OR "b"`), even though this
 * port never hands the string to SQLite: the tool surface documents it and a
 * future index may.
 *
 * @param text - the user's query.
 * @param limit - maximum tokens (default {@link MAX_QUERY_TOKENS}).
 * @returns the query string, or `''`.
 */
export function ftsQuery(text, limit = MAX_QUERY_TOKENS) {
  const tokens = searchTokens(text, limit);
  if (tokens.length === 0) return '';
  return tokens.map((token) => `"${token}"`).join(' OR ');
}

/* ------------------------------------------------------------------ *
 * Chunking (port of indexing/chunker.py)                             *
 * ------------------------------------------------------------------ */

/** sha256 hex of a chunk's content. */
function hashOf(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/** `max(1, floor(len/4))`, the same token estimate the original stores. */
function estimateTokens(text) {
  return Math.max(1, Math.floor(String(text ?? '').length / 4));
}

/**
 * One chunk record (`chunker.py:121-142`).
 * @param path - corpus path.
 * @param language - language name.
 * @param kind - `class` | `function` | `module` | `block` | `doc`.
 * @param symbol - the declaration's name, or null.
 * @param parentSymbol - the enclosing class/symbol name, or null.
 * @param startLine - 1-based inclusive.
 * @param endLine - 1-based inclusive.
 * @param content - the chunk's text, already capped.
 * @returns the record.
 */
function makeChunk(path, language, kind, symbol, parentSymbol, startLine, endLine, content) {
  const body = String(content ?? '').slice(0, CHUNKER.maxChunkChars);
  return {
    path,
    language,
    kind,
    symbol: symbol === null || symbol === undefined || symbol === '' ? null : symbol,
    parent_symbol: parentSymbol === null || parentSymbol === undefined || parentSymbol === '' ? null : parentSymbol,
    start_line: Math.trunc(startLine),
    end_line: Math.trunc(endLine),
    content: body,
    hash: hashOf(body),
    tokens: estimateTokens(body),
  };
}

/**
 * Slice `lines[startLine-1 .. endLine-1]` back into text.
 * @param lines - the file's lines.
 * @param startLine - 1-based inclusive.
 * @param endLine - 1-based inclusive.
 * @returns the joined text.
 */
function sliceLines(lines, startLine, endLine) {
  return lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine)).join('\n');
}

/**
 * Line-band chunks (`chunker.py:145-174`).
 *
 * `startLine` is a parameter so a *slice* can be banded with absolute numbering —
 * that is how module gaps get correct line numbers.
 *
 * @param path - corpus path.
 * @param language - language name.
 * @param text - the text to band.
 * @param kind - the chunk kind (default `block`).
 * @param startLine - the 1-based line `text` starts on.
 * @returns the chunks.
 */
function textChunks(path, language, text, kind = 'block', startLine = 1) {
  const lines = String(text ?? '').split('\n');
  const chunks = [];
  const step = CHUNKER.fallbackLines;
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + step);
    const content = lines.slice(start, end).join('\n');
    if (content.trim() === '') continue;
    chunks.push(makeChunk(path, language, kind, null, null, startLine + start, startLine + end - 1, content));
  }
  return chunks;
}

/**
 * Split Markdown by headings (`chunker.py:177-219`).
 * @param path - corpus path.
 * @param text - the Markdown.
 * @returns the doc chunks.
 */
function chunkMarkdown(path, text) {
  const lines = String(text ?? '').split('\n');
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return [];
  const chunks = [];
  let bufStart = 0;
  let heading = null;
  let current = [];

  const flush = (endIndex) => {
    const content = current.join('\n').replace(/^\n+|\n+$/gu, '');
    if (content !== '') {
      chunks.push(makeChunk(path, 'markdown', 'doc', heading, null, bufStart + 1, endIndex, content));
    }
    current = [];
  };

  lines.forEach((line, index) => {
    if (line.startsWith('#') && current.length > 0) {
      flush(index);
      bufStart = index;
      heading = line.replace(/^#+/u, '').trim().slice(0, 120);
    }
    if (current.length === 0) bufStart = index;
    if (line.startsWith('#') && heading === null) heading = line.replace(/^#+/u, '').trim().slice(0, 120);
    current.push(line);
    if (current.length >= CHUNKER.maxChunkLines) {
      flush(index + 1);
      bufStart = index + 1;
    }
  });
  flush(lines.length);
  return chunks;
}

/**
 * Structural chunks for one file from its declarations.
 *
 * Mirrors `chunker.py:246-338`: a chunk per class and per function, the class body
 * still walked so methods get their own chunk in addition to the class chunk, and
 * the module-level gaps between covered ranges emitted as `module` chunks. A gap
 * shorter than 40 characters is dropped, which is why an import header usually
 * disappears into nothing.
 *
 * @param path - corpus path.
 * @param language - language name.
 * @param text - the file's text.
 * @param decls - `[{ name, kind, start_line, end_line }]` for this file.
 * @returns the chunks, or null when there is nothing structural to emit.
 */
function structuralChunks(path, language, text, decls) {
  const lines = text.split('\n');
  const chunks = [];
  const covered = [];

  const ordered = decls.slice().sort((a, b) => (a.start_line - b.start_line) || ((a.end_line - b.end_line)));
  for (const decl of ordered) {
    const end = Math.min(decl.end_line, lines.length);
    if (end < decl.start_line) continue;
    const body = sliceLines(lines, decl.start_line, end);
    chunks.push(makeChunk(
      path,
      language,
      decl.kind === 'class' ? 'class' : 'function',
      decl.name,
      decl.parent_name ?? null,
      decl.start_line,
      end,
      body,
    ));
    covered.push([decl.start_line, end]);
  }
  if (chunks.length === 0) return null;

  // ---- module gaps ------------------------------------------------------
  covered.sort((a, b) => a[0] - b[0]);
  let cursor = 1;
  const gaps = [];
  const addGap = (first, last) => {
    let start = first;
    let end = last;
    while (start <= end && (lines[start - 1] ?? '').trim() === '') start += 1;
    while (end >= start && (lines[end - 1] ?? '').trim() === '') end -= 1;
    if (start > end) return;
    const body = sliceLines(lines, start, end);
    if (body.length <= 40) return;
    gaps.push(...textChunks(path, language, body, 'module', start));
  };
  for (const [start, end] of covered) {
    if (start > cursor) addGap(cursor, start - 1);
    cursor = Math.max(cursor, end + 1);
  }
  if (cursor <= lines.length) addGap(cursor, lines.length);
  chunks.push(...gaps);

  // At equal spans a module chunk sorts first: `kind !== 'module'` is the third
  // key, and `false < true`.
  chunks.sort((a, b) => (a.start_line - b.start_line)
    || (a.end_line - b.end_line)
    || ((a.kind === 'module' ? 0 : 1) - (b.kind === 'module' ? 0 : 1)));
  return chunks;
}

/**
 * Chunks for one file: structural when possible, line bands otherwise.
 *
 * The `has_error` gate of `chunker.py:233` has no equivalent here — a regex
 * scanner cannot report a syntax error — so the fallback triggers on "no
 * declarations found" instead.
 *
 * @param file - `{ path, language, source }`.
 * @param decls - the declarations known for this file, or an empty array.
 * @returns the chunks.
 */
function chunkFile(file, decls) {
  const path = String(file.path ?? '');
  const language = String(file.language ?? '');
  const text = String(file.source ?? '');
  if (text === '') return [];
  if (language === 'markdown') return chunkMarkdown(path, text);

  const structural = decls.length > 0 ? structuralChunks(path, language, text, decls) : null;
  if (structural !== null) {
    // Guard against a single huge symbol, which the walk can leave behind when a
    // declaration spans more than the split threshold.
    const out = [];
    for (const chunk of structural) {
      if (chunk.end_line - chunk.start_line + 1 > CHUNKER.maxChunkLines) {
        out.push(...textChunks(chunk.path, chunk.language, chunk.content, 'block', 1));
      } else {
        out.push(chunk);
      }
    }
    return out;
  }
  return textChunks(path, language, text, 'block', 1);
}

/* ------------------------------------------------------------------ *
 * The index                                                          *
 * ------------------------------------------------------------------ */

/**
 * Build the searchable chunk index.
 *
 * Each chunk carries its own token bag and term frequencies; `postings` is the
 * inverted index the candidate scan uses, so a query costs
 * `O(postings of its rarest token)` rather than a scan of every chunk.
 *
 * @param files - `[{ path, language, source }]`, usually the same walk the graph
 *   used, so "the file exists in the graph" and "the file is searchable" cannot
 *   disagree.
 * @param nodes - optional graph nodes; their declarations give exact chunk spans
 *   without a re-scan. When absent or empty for a path, that file is re-scanned.
 * @returns `{ chunks, postings, version, paths }` where `postings` is
 *   `Map(token → number[])` of chunk indices.
 */
export function buildChunkIndex(files, nodes) {
  const declarationsByPath = new Map();
  for (const node of nodes ?? []) {
    if (node.kind !== 'class' && node.kind !== 'function') continue;
    if (node.path === undefined || node.path === '') continue;
    const list = declarationsByPath.get(node.path);
    const parent = node.parent === null || node.parent === undefined ? null : node.parent;
    const parentName = parent === null
      ? null
      : (String(parent).match(/::(?:class|function)::(.*?)::\d+$/u)?.[1] ?? null);
    const row = {
      name: String(node.label ?? ''),
      kind: node.kind,
      start_line: Math.trunc(Number(node.start_line) || 1),
      end_line: Math.trunc(Number(node.end_line) || Number(node.start_line) || 1),
      parent_name: parentName,
    };
    if (list === undefined) declarationsByPath.set(node.path, [row]);
    else list.push(row);
  }

  const chunks = [];
  for (const file of files ?? []) {
    const path = String(file.path ?? '');
    let decls = declarationsByPath.get(path) ?? [];
    if (decls.length === 0 && String(file.language ?? '') !== 'markdown') {
      // Re-scan; a scan failure yields no declarations and the file falls back
      // to line bands, which is still searchable. One bad file never throws here.
      const scanned = scanSource(String(file.source ?? ''), String(file.language ?? ''), path);
      if (scanned.error === null) {
        decls = scanned.nodes
          .filter((node) => node.kind === 'class' || node.kind === 'function')
          .map((node) => ({
            name: String(node.label ?? ''),
            kind: node.kind,
            start_line: node.start_line,
            end_line: node.end_line,
            parent_name: null,
          }));
      }
    }
    chunks.push(...chunkFile(file, decls));
  }

  // Index each chunk twice, for two different consumers:
  //   - `bag` is the *set* of tokens, which is what an FTS column stores and what
  //     the inverted index keys on. Counting occurrences from it is meaningless —
  //     `indexText` dedupes by design — so it is only used for membership.
  //   - `terms` is the real frequency map, built by re-tokenizing the raw content
  //     *without* dedupe. The scoring blend is 75 % coverage / 25 % term
  //     frequency, and a set-derived count silently degenerates the second half
  //     into a pure length penalty.
  const postings = new Map();
  chunks.forEach((chunk, index) => {
    const bag = indexText(chunk.content, chunk.path, chunk.symbol ?? '');
    const unique = bag === '' ? [] : bag.split(' ');

    const counts = new Map();
    let total = 0;
    for (const token of tokenStream(`${chunk.content} ${chunk.path} ${chunk.symbol ?? ''}`)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
      total += 1;
    }
    chunk.terms = counts;
    chunk.tokenCount = Math.max(total, unique.length);

    for (const token of unique) {
      const list = postings.get(token);
      if (list === undefined) postings.set(token, [index]);
      else list.push(index);
    }
  });

  return {
    version: INDEX_VERSION,
    chunks,
    postings,
    paths: [...new Set(chunks.map((chunk) => chunk.path))],
  };
}

/**
 * The length-normalised term-frequency score that replaces FTS5's `bm25()`.
 *
 * `spec §15.3` prescribes `1/(1 + ln(1 + docTokens/(tf+1)))`. It rises with the
 * term's frequency and falls with the document's length, and it lands in
 * `(0, 1]`, which is exactly the range the `bm25` substitution needs: the blend is
 * 75 % coverage and 25 % this, so the term's weight cannot dominate.
 *
 * @param tf - the term's count in this chunk (never 0).
 * @param docTokens - the chunk's token count.
 * @returns the score, in `(0, 1]`.
 */
function termFrequencyScore(tf, docTokens) {
  const denominator = 1 + Math.log(1 + docTokens / (tf + 1));
  return 1 / denominator;
}

/**
 * Search the chunk index by keyword.
 *
 * Port of `hybrid.py:77-114` minus the SQL: over-fetch `max(limit*5, 40)`
 * candidates, then score `0.75·coverage + 0.25·frequency` and cut to `limit`.
 * The over-fetch is deliberate — frequency alone ranks a long chunk that repeats
 * one common token above a short chunk covering the whole query.
 *
 * Ties keep candidate order, which is chunk order (path, then line), so the result
 * is stable across builds.
 *
 * @param index - the record from {@link buildChunkIndex}, or a bare chunk array.
 * @param query - the user's text.
 * @param limit - maximum records (default 12).
 * @returns `[{ path, line, endLine, symbol, kind, snippet, score, retriever }]`,
 *   best first. Empty when the query has no token or nothing matches.
 */
export function searchRecords(index, query, limit = 12) {
  const chunks = Array.isArray(index) ? index : (index?.chunks ?? []);
  const postings = Array.isArray(index) ? null : (index?.postings ?? null);
  const capped = Math.max(1, Math.trunc(Number(limit) || 12));

  const tokens = searchTokens(query, MAX_QUERY_TOKENS);
  if (tokens.length === 0 || chunks.length === 0) return [];

  // Candidate set: every chunk that contains at least one query token.
  //
  // Where an inverted index is available it is used, because scanning 700 chunks
  // per keystroke is wasteful. Where it is not (a document that arrived through
  // JSON), the scan is exhaustive — truncating to the first N chunks would make
  // every hit outside the first few files unfindable, which reads as "search is
  // broken" rather than "the index is cold".
  let candidates;
  if (postings !== null) {
    const set = new Set();
    for (const token of tokens) {
      for (const index_ of postings.get(token) ?? []) set.add(index_);
    }
    candidates = [...set].sort((a, b) => a - b);
    // Only an index-backed candidate list may be capped before scoring: it is
    // already the complete match set, so a cap is a ranking decision. An
    // exhaustive scan must score everything before any cap applies.
    const width = Math.max(capped * 5, 40);
    if (candidates.length > width) candidates = candidates.slice(0, width);
  } else {
    candidates = chunks.map((_, i) => i);
  }

  const scored = [];
  for (const index_ of candidates) {
    const chunk = chunks[index_];
    if (chunk === undefined) continue;
    const terms = chunk.terms instanceof Map
      ? chunk.terms
      // `terms` is a `Map` on a fresh build and a plain object after a JSON round
      // trip (JSON turns a Map into `{}`), so both shapes must score. Falling back
      // to re-tokenising `content` handles the `{}` case without a second pass
      // over the corpus at load time.
      : (chunk.terms !== null && typeof chunk.terms === 'object' && Object.keys(chunk.terms).length > 0
        ? new Map(Object.entries(chunk.terms))
        : new Map(indexText(chunk.content, chunk.path, chunk.symbol ?? '').split(' ').filter((t) => t !== '')
          .map((token) => [token, 1])));
    const docTokens = chunk.tokenCount ?? Math.max(1, [...terms.values()].reduce((sum, n) => sum + n, 0));

    let present = 0;
    let frequency = 0;
    for (const token of tokens) {
      const tf = terms.get(token) ?? 0;
      if (tf === 0) continue;
      present += 1;
      frequency += termFrequencyScore(tf, docTokens);
    }
    if (present === 0) continue;
    const coverage = present / tokens.length;
    const score = 0.75 * coverage + 0.25 * (frequency / tokens.length);
    scored.push({ score, chunk });
  }

  scored.sort((a, b) => (b.score - a.score));
  return scored.slice(0, capped).map(({ score, chunk }) => ({
    path: chunk.path,
    line: chunk.start_line,
    endLine: chunk.end_line,
    symbol: chunk.symbol ?? null,
    kind: chunk.kind,
    language: chunk.language ?? '',
    snippet: truncate(chunk.content, 4000),
    score: Math.round(score * 1e5) / 1e5,
    retriever: 'keyword',
  }));
}

/** Clip a snippet, with the original's marker. */
function truncate(text, limit) {
  const body = String(text ?? '');
  return body.length > limit ? `${body.slice(0, limit)}\n…(截断)` : body;
}

/**
 * Reciprocal-rank fusion of several result sets (`hybrid.py:137-155`).
 *
 * Used by `answer.js` to join keyword hits, vector hits and graph seeds. Fusion
 * by rank rather than by score is what lets three retrievers with incomparable
 * score scales contribute without a per-retriever weight to tune.
 *
 * @param resultSets - the ranked lists, each `[{ id, ... }]` with a stable `id`.
 * @param limit - maximum fused rows.
 * @param key - the property that identifies a row across lists (default `path`).
 * @returns the fused rows, best first, with `score` replaced by the RRF sum.
 */
export function rrfFuse(resultSets, limit, key = 'path') {
  const scores = new Map();
  const store = new Map();
  for (const results of resultSets) {
    results.forEach((item, index) => {
      const id = `${item[key] ?? ''}:${item.line ?? ''}`;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + index + 1));
      if (!store.has(id)) store.set(id, { ...item });
      else store.get(id).retriever = 'hybrid';
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Math.trunc(Number(limit) || 8)))
    .map(([id, fused]) => ({
      ...store.get(id),
      score: Math.round(fused * 1e5) / 1e5,
      retriever: 'hybrid',
    }));
}

/**
 * Render retrieved chunks as a cited context block (`hybrid.py:172-186`).
 *
 * The fence is always three backticks here, unlike the note template which sizes
 * it — this block is for a model, not for a Markdown document that gets re-read.
 *
 * @param chunks - the records from {@link searchRecords}.
 * @param budgetChars - hard stop; a block that does not fit is not emitted at all.
 * @returns the joined blocks, or `''`.
 */
export function contextForPrompt(chunks, budgetChars = 12000) {
  const parts = [];
  let used = 0;
  for (const chunk of chunks ?? []) {
    const symbol = chunk.symbol === null || chunk.symbol === undefined || chunk.symbol === ''
      ? ''
      : ` (${chunk.kind ?? ''} ${chunk.symbol})`;
    const header = `### ${chunk.path}:${chunk.line}-${chunk.endLine}${symbol}`;
    const block = `${header}\n\`\`\`${chunk.language ?? ''}\n${chunk.snippet ?? ''}\n\`\`\``;
    if (used + block.length > budgetChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}
