/**
 * The build pipeline for one workspace root.
 *
 * walk → scan every file (pass 1) → resolve across the corpus (pass 2) → fold
 * into one document. This module owns the I/O and the ordering guarantees; the
 * algorithms live in `analyzer.js` (one file), `resolve.js` (the corpus) and
 * `cluster.js` (communities).
 *
 * Ordering is part of the contract, not an implementation detail: files are
 * collected sorted by relative path, because that order becomes the symbol
 * table's insertion order, which becomes the node order, which feeds both the
 * community detection's iteration order and the topology key. A build that
 * disagrees on order produces a graph that looks right and differs on every
 * diff.
 */

import { promises as fs } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { LANGUAGE_BY_EXT, looksGenerated, scanSource } from './analyzer.js';
import { resolveGraph } from './resolve.js';

/**
 * Directories never descended into.
 *
 * A superset of the original's list plus the ones a modern JS repo actually
 * creates (`.turbo`, `.next`, `dist`, `build`). Descending into `node_modules`
 * is the single most expensive mistake available here.
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.next', '.nuxt', '.turbo', '.cache', 'coverage', '.idea', '.vscode-test',
  'vendor', 'Pods', '.gradle', '.cargo', 'site-packages', '.dsh',
  '.ruff_cache', 'acl-recovery', 'packaging', 'THIRD_PARTY_LICENSES',
  '.shots', '.devdata', 'dsh-runtimes', 'dsham-move-backup',
]);

/** Files that are never source even when their extension looks like code. */
const SKIP_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'poetry.lock',
  'Cargo.lock', 'go.sum', 'uv.lock',
]);

const DEFAULTS = {
  maxFiles: 8000,
  maxFileBytes: 524288,
  maxDepth: 24,
  superclassJs: true,
};

/** Normalise a path to forward slashes for stable cross-platform keys. */
export function toPosix(path) {
  return path.split(sep).join('/');
}

/**
 * Walk `root` and return every source file worth scanning.
 *
 * Breadth-first with an explicit queue rather than `fs.readdir` recursion: a
 * pathological directory depth must not be able to blow the stack, and the depth
 * cap has to apply before the descent, not after.
 * @param root - absolute directory.
 * @param options - limits.
 * @returns `{ files, truncated, skippedLarge, skippedGenerated }`.
 */
async function collectFiles(root, options) {
  const found = [];
  const queue = [{ dir: root, depth: 0 }];
  let truncated = false;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (depth > options.maxDepth) continue;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // An unreadable directory is one hole in the map, not a failed build.
      continue;
    }

    for (const entry of entries) {
      if (found.length >= options.maxFiles) {
        truncated = true;
        break;
      }
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Dot-directories are build or tooling state, with one exception a
        // reader actually wants to see indexed.
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        queue.push({ dir: absolute, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) continue;
      // Type declaration files describe code that lives elsewhere; indexing
      // them doubles every symbol with a bodyless twin.
      if (entry.name.endsWith('.d.ts')) continue;

      const dot = entry.name.lastIndexOf('.');
      if (dot <= 0) continue;
      const ext = entry.name.slice(dot + 1).toLowerCase();
      if (LANGUAGE_BY_EXT[ext] === undefined) continue;

      found.push({ abs: absolute, rel: toPosix(relative(root, absolute)) });
    }
    if (truncated) break;
  }

  found.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { files: found, truncated };
}

/**
 * Read one file, refusing the two shapes that poison a graph: an oversized file
 * and a generated bundle.
 * @param file - `{ abs, rel }`.
 * @param options - limits.
 * @returns `{ text, language, bytes, lines }` or a skip marker.
 */
async function readOne(file, options) {
  let stat;
  try {
    stat = await fs.stat(file.abs);
  } catch {
    return { skipped: 'unreadable' };
  }
  if (stat.size > options.maxFileBytes) {
    return { skipped: 'large', bytes: stat.size, lines: 0 };
  }
  let text;
  try {
    text = await fs.readFile(file.abs, 'utf8');
  } catch {
    return { skipped: 'unreadable' };
  }
  // A NUL byte in the first block is the binary sniff every tool uses; without
  // it one stray image with a `.py` name becomes a thousand phantom symbols.
  if (text.includes('\u0000')) return { skipped: 'binary', bytes: stat.size, lines: 0 };
  if (looksGenerated(text)) return { skipped: 'generated', bytes: stat.size, lines: 0 };

  const ext = file.rel.slice(file.rel.lastIndexOf('.') + 1).toLowerCase();
  return {
    text,
    language: LANGUAGE_BY_EXT[ext],
    bytes: stat.size,
    lines: text.split('\n').length,
  };
}

/**
 * Build the whole graph document for one root.
 *
 * Never throws on a single bad file: a scan failure becomes an `extraction` with
 * `error` set and no nodes, which the resolver simply carries over. Losing the
 * entire build because one file has an unterminated string would make the whole
 * feature unreliable in exactly the repositories it is most useful for.
 * @param root - absolute directory.
 * @param options - partial override of the defaults.
 * @returns the document: nodes, edges, stats, files, dirs, index, languages.
 */
export async function buildIndexGraph(root, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const started = Date.now();
  const absolute = resolve(root);

  const { files, truncated } = await collectFiles(absolute, settings);

  const extractions = [];
  const fileStats = [];
  let skippedLarge = 0;
  let skippedGenerated = 0;
  let bytesRead = 0;

  for (const file of files) {
    const read = await readOne(file, settings);
    if (read.skipped !== undefined) {
      if (read.skipped === 'large') skippedLarge += 1;
      if (read.skipped === 'generated') skippedGenerated += 1;
      fileStats.push({ path: file.rel, lines: 0, bytes: read.bytes ?? 0, skipped: read.skipped });
      continue;
    }

    bytesRead += read.bytes;
    fileStats.push({
      path: file.rel,
      lines: read.lines,
      bytes: read.bytes,
      language: read.language,
    });

    let extraction;
    try {
      extraction = scanSource(read.text, read.language, file.rel, {
        superclassJs: settings.superclassJs !== false,
      });
    } catch (error) {
      extraction = {
        path: file.rel,
        nodes: [],
        edges: [],
        rawCalls: [],
        rawInherits: [],
        rawImports: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // The source text is kept only long enough for the chunk index; it is
    // stripped from the document before it is persisted.
    extraction.source = read.text;
    extraction.language = read.language;
    extractions.push(extraction);
  }

  // ---- Pass 2 ------------------------------------------------------------
  const resolved = resolveGraph(extractions, { root: absolute });

  // Chunking needs the source text, which lives on the extraction. Hand the
  // resolver's node list back so chunk records can name the symbol that owns a
  // span; `buildDocument` builds the chunk index from `files[].source`.
  const files_byPath = new Map();
  for (const extraction of extractions) {
    files_byPath.set(extraction.path, extraction);
  }
  for (const stat of fileStats) {
    const extraction = files_byPath.get(stat.path);
    if (extraction?.source !== undefined) {
      stat.source = extraction.source;
      stat.language = extraction.language ?? stat.language;
    }
  }

  // ---- Rollups -----------------------------------------------------------
  const dirs = new Map();
  for (const stat of fileStats) {
    const cut = stat.path.lastIndexOf('/');
    const dir = cut < 0 ? '.' : stat.path.slice(0, cut);
    const entry = dirs.get(dir) ?? { path: dir, files: 0, lines: 0 };
    entry.files += 1;
    entry.lines += stat.lines;
    dirs.set(dir, entry);
  }

  const languages = {};
  for (const stat of fileStats) {
    if (stat.language === undefined) continue;
    languages[stat.language] = (languages[stat.language] ?? 0) + 1;
  }

  const failed = extractions.filter((extraction) => extraction.error !== null && extraction.error !== undefined);
  if (failed.length > 0) {
    // Reported, never fatal: the graph is still useful without those files.
    console.warn?.(`codeslice: ${failed.length} file(s) failed to scan`);
  }

  // `index` holds Maps, which JSON turns into `{}`. The document is persisted, so
  // the derived index never leaves this process: its two plain inputs — `nodes`
  // and `refs` — are shipped instead, and `fromPersisted()` rebuilds the lookups
  // on load (lib/persist.js).
  const { index: derived, ...rest } = resolved;

  return {
    root: absolute,
    builtAt: Date.now(),
    scanMs: Date.now() - started,
    truncated,
    skippedLarge,
    skippedGenerated,
    bytesRead,
    fileCount: fileStats.length,
    lineCount: fileStats.reduce((sum, file) => sum + file.lines, 0),
    files: fileStats,
    dirs: [...dirs.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
    languages,
    scanErrors: failed.slice(0, 20).map((extraction) => ({
      path: extraction.path,
      error: String(extraction.error),
    })),
    ...rest,
    // The flat reference array the index was built from; a plain array of plain
    // objects, so it survives the cache round trip.
    refs: derived?.refs ?? [],
    index: derived,
  };
}
