/**
 * Workspace indexer for CodeSlice.
 *
 * Walks a root directory once, scans every source file with
 * `lib/analyzer.js`, and folds the findings into one document that can be
 * memoised on disk. No native bindings, no parser dependency, no database —
 * the whole index is a plain object so it can be cached as JSON and loaded
 * in a few milliseconds.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

import {
  LANGUAGE_BY_EXT,
  looksGenerated,
  scanSource,
} from './analyzer.js';

/** Directories never descended into. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.next', '.nuxt', '.turbo', '.cache', 'coverage', '.idea', '.vscode-test',
  'vendor', 'Pods', '.gradle', '.cargo', 'site-packages', '.dsh',
]);

/** Files that are never source even when their extension looks like code. */
const SKIP_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'poetry.lock',
  'Cargo.lock', 'go.sum',
]);

const DEFAULT_OPTIONS = {
  maxFiles: 8000,
  maxFileBytes: 512 * 1024,
  maxDepth: 24,
};

/** sha1 of the absolute root — the cache key. */
function rootKey(root) {
  return createHash('sha1').update(resolve(root).toLowerCase()).digest('hex').slice(0, 16);
}

/** Where one root's cached index lives. */
export function cachePathFor(root) {
  return join(tmpdir(), 'dsh-codeslice', `${rootKey(root)}.json`);
}

/** Normalise a path to forward slashes for stable cross-platform keys. */
export function toPosix(p) {
  return p.split(sep).join('/');
}

/**
 * Walk `root` and return every source file worth scanning.
 * @param root - absolute directory.
 * @param options - limits (see {@link DEFAULT_OPTIONS}).
 * @returns `[{ abs, rel }]` with `rel` in posix form.
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
      continue;
    }

    for (const entry of entries) {
      if (found.length >= options.maxFiles) {
        truncated = true;
        break;
      }
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        queue.push({ dir: abs, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) continue;
      if (entry.name.endsWith('.d.ts')) continue;

      const dot = entry.name.lastIndexOf('.');
      if (dot <= 0) continue;
      const ext = entry.name.slice(dot + 1).toLowerCase();
      if (LANGUAGE_BY_EXT[ext] === undefined) continue;

      found.push({ abs, rel: toPosix(relative(root, abs)) });
    }
    if (truncated) break;
  }

  found.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { files: found, truncated };
}

/**
 * Resolve an import specifier to an indexed path, when it lands in-tree.
 *
 * Two shapes are handled:
 *   - relative (`./x`, `../y/z`) — JS/TS and Rust `use super::`;
 *   - dotted absolute (`app.storage`) — Python, which resolves against each
 *     ancestor directory of the importing file, since a Python source root is
 *     whatever directory sits on `sys.path`.
 */
function resolveSpecifier(spec, fromRel, knownPaths) {
  const suffixCandidates = (joined) => [
    joined,
    `${joined}.ts`, `${joined}.tsx`, `${joined}.js`, `${joined}.jsx`,
    `${joined}.mjs`, `${joined}.cjs`, `${joined}.py`, `${joined}.go`,
    `${joined}.rs`, `${joined}/index.ts`, `${joined}/index.tsx`,
    `${joined}/index.js`, `${joined}/index.jsx`, `${joined}/__init__.py`,
    `${joined}.pyi`,
  ];

  if (spec.startsWith('.')) {
    const base = fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/')) : '';
    const stack = base === '' ? [] : base.split('/');
    for (const part of spec.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    const joined = stack.join('/');
    for (const candidate of suffixCandidates(joined)) if (knownPaths.has(candidate)) return candidate;
    return undefined;
  }

  // Dotted absolute import: only attempt it for module-looking specifiers, so
  // a bare npm package name (`react`) is not mistaken for a Python module.
  if (!/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)+$/.test(spec)) return undefined;
  const modulePath = spec.split('.').join('/');

  const segments = fromRel.split('/');
  segments.pop(); // drop the file name
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const prefix = segments.slice(0, depth).join('/');
    const joined = prefix === '' ? modulePath : `${prefix}/${modulePath}`;
    for (const candidate of suffixCandidates(joined)) if (knownPaths.has(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Build a fresh index for one root.
 * @param root - absolute directory.
 * @param options - partial override of {@link DEFAULT_OPTIONS}.
 * @returns the index document.
 */
export async function buildIndex(root, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const started = Date.now();
  const { files, truncated } = await collectFiles(root, opts);
  const knownPaths = new Set(files.map((f) => f.rel));

  const symbols = [];
  const edges = [];
  const fileStats = [];
  let skippedLarge = 0;
  let skippedGenerated = 0;
  let bytesRead = 0;

  for (const file of files) {
    let text;
    try {
      const stat = await fs.stat(file.abs);
      if (stat.size > opts.maxFileBytes) {
        skippedLarge += 1;
        fileStats.push({ path: file.rel, lines: 0, bytes: stat.size, skipped: 'large' });
        continue;
      }
      text = await fs.readFile(file.abs, 'utf8');
    } catch {
      continue;
    }
    if (looksGenerated(text)) {
      skippedGenerated += 1;
      continue;
    }

    bytesRead += text.length;
    const language = LANGUAGE_BY_EXT[file.rel.slice(file.rel.lastIndexOf('.') + 1).toLowerCase()];
    const scanned = scanSource(text, language, file.rel);
    const lines = text.split('\n').length;
    fileStats.push({ path: file.rel, lines, bytes: text.length, language });

    for (const symbol of scanned.symbols) {
      symbols.push({ ...symbol, language });
    }

    // Import edges, resolved to in-tree paths where possible.
    for (const imp of scanned.imports) {
      const target = resolveSpecifier(imp.spec, file.rel, knownPaths);
      edges.push({
        kind: 'imports',
        from: file.rel,
        to: target ?? imp.spec,
        external: target === undefined,
        line: imp.line,
      });
    }

    // Call edges are resolved after every symbol name is known (below), so
    // only the raw call sites are kept here.
    for (const call of scanned.calls) {
      edges.push({
        kind: 'calls',
        from: file.rel,
        to: call.name,
        line: call.line,
        chained: call.chained === true,
        unresolved: true,
      });
    }

    for (const inh of scanned.inherits) {
      edges.push({
        kind: inh.kind,
        from: file.rel,
        to: inh.parent,
        child: inh.child,
        line: inh.line,
        unresolved: true,
      });
    }
  }

  // ---- Symbol table: name → definitions -----------------------------------
  const byName = new Map();
  for (const symbol of symbols) {
    const list = byName.get(symbol.name);
    if (list === undefined) byName.set(symbol.name, [symbol]);
    else list.push(symbol);
  }

  // Which in-tree files each file imports — the preference set for resolving
  // a bare call name. Without it, `x.add_node(...)` would bind to whichever
  // unrelated file happens to declare an `add_node`.
  const importedByFile = new Map();
  for (const edge of edges) {
    if (edge.kind !== 'imports' || edge.targetPath === undefined) continue;
    const set = importedByFile.get(edge.from) ?? new Set();
    set.add(edge.targetPath);
    importedByFile.set(edge.from, set);
  }

  // Resolve a call/inheritance edge to a definition, preferring locality:
  // same file first, then a file this one imports, then a unique global.
  // An ambiguous global is deliberately left unresolved rather than guessed.
  let resolvedCalls = 0;
  for (const edge of edges) {
    if (edge.kind !== 'calls' && edge.kind !== 'extends' && edge.kind !== 'implements') continue;
    const defs = byName.get(edge.to);
    if (defs === undefined || defs.length === 0) continue;

    const local = defs.find((d) => d.path === edge.from);
    // A chained call (`builder.add_node(...)`) names a METHOD of some object
    // we cannot type; binding it to an unrelated same-named free function in
    // an imported module would be a fabrication, so it stays unresolved
    // unless the name is defined in this very file.
    if (edge.chained === true) {
      if (local === undefined) continue;
      edge.targetPath = local.path;
      edge.targetLine = local.line;
      delete edge.unresolved;
      resolvedCalls += 1;
      continue;
    }

    const imports = importedByFile.get(edge.from);
    const fromImport = imports === undefined ? undefined : defs.find((d) => imports.has(d.path));
    const unique = defs.length === 1 ? defs[0] : undefined;
    const chosen = local ?? fromImport ?? unique;
    if (chosen === undefined) continue;

    edge.targetPath = chosen.path;
    edge.targetLine = chosen.line;
    delete edge.unresolved;
    if (edge.kind === 'calls') resolvedCalls += 1;
  }

  // ---- Directory rollup ---------------------------------------------------
  const dirs = new Map();
  for (const stat of fileStats) {
    const dir = stat.path.includes('/') ? stat.path.slice(0, stat.path.lastIndexOf('/')) : '.';
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

  return {
    version: 1,
    root: resolve(root),
    builtAt: Date.now(),
    buildMs: Date.now() - started,
    truncated,
    skippedLarge,
    skippedGenerated,
    bytesRead,
    fileCount: fileStats.length,
    lineCount: fileStats.reduce((sum, f) => sum + f.lines, 0),
    symbolCount: symbols.length,
    edgeCount: edges.length,
    resolvedCalls,
    languages,
    files: fileStats,
    dirs: Array.from(dirs.values()).sort((a, b) => (a.path < b.path ? -1 : 1)),
    symbols,
    edges,
  };
}

/** Load a cached index when it is still fresh, else rebuild and persist it. */
export async function loadOrBuildIndex(root, options = {}) {
  const cachePath = cachePathFor(root);
  const maxAgeMs = options.maxAgeMs ?? 10 * 60 * 1000;

  try {
    const raw = await fs.readFile(cachePath, 'utf8');
    const cached = JSON.parse(raw);
    if (
      cached.version === 1
      && cached.root === resolve(root)
      && typeof cached.builtAt === 'number'
      && Date.now() - cached.builtAt < maxAgeMs
      && options.force !== true
    ) {
      return { index: cached, cached: true, cachePath };
    }
  } catch {
    // Missing or unreadable cache: fall through to a rebuild.
  }

  const index = await buildIndex(root, options);
  try {
    await fs.mkdir(join(tmpdir(), 'dsh-codeslice'), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(index), 'utf8');
  } catch {
    // A cache write failure must never fail the request.
  }
  return { index, cached: false, cachePath };
}
