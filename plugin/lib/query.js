/**
 * Query layer over a built index.
 *
 * Every function here is pure and synchronous against an in-memory index
 * document — the async work (walking the tree, reading files) already
 * happened in `lib/indexer.js`. Keeping this layer sync means tool calls and
 * HTTP requests never block on I/O twice.
 */

const KIND_ORDER = { class: 0, interface: 1, type: 2, enum: 3, function: 4, method: 5, const: 6 };

/** Group symbol definitions by name. */
function symbolTable(index) {
  const table = new Map();
  for (const symbol of index.symbols) {
    const list = table.get(symbol.name);
    if (list === undefined) table.set(symbol.name, [symbol]);
    else list.push(symbol);
  }
  return table;
}

/** All edges leaving `path` of the given kinds. */
function edgesFrom(index, path, kinds) {
  return index.edges.filter((edge) => edge.from === path && kinds.includes(edge.kind));
}

/** All edges arriving at `path` of the given kinds. */
function edgesInto(index, path, kinds) {
  return index.edges.filter((edge) => edge.targetPath === path && kinds.includes(edge.kind));
}

/** Short human summary of an index, used by the status endpoint and tool. */
export function summarize(index) {
  return {
    root: index.root,
    builtAt: index.builtAt,
    buildMs: index.buildMs,
    files: index.fileCount,
    lines: index.lineCount,
    symbols: index.symbolCount,
    edges: index.edgeCount,
    resolvedCalls: index.resolvedCalls,
    truncated: index.truncated,
    skippedLarge: index.skippedLarge,
    skippedGenerated: index.skippedGenerated,
    languages: index.languages,
  };
}

/**
 * Find definitions by (fuzzy) name.
 * @param index - the built index.
 * @param query - exact name, or a fragment when `fuzzy`.
 * @param options - `{ fuzzy, kind, pathPrefix, limit }`.
 * @returns the matching symbol rows.
 */
export function findSymbols(index, query, options = {}) {
  const limit = options.limit ?? 50;
  const needle = query.trim();
  if (needle === '') return [];
  const lower = needle.toLowerCase();
  const fuzzy = options.fuzzy !== false;

  const matches = [];
  for (const symbol of index.symbols) {
    if (options.kind !== undefined && symbol.kind !== options.kind) continue;
    if (options.pathPrefix !== undefined && !symbol.path.startsWith(options.pathPrefix)) continue;

    let score = 0;
    if (symbol.name === needle) score = 100;
    else if (fuzzy && symbol.name.toLowerCase() === lower) score = 90;
    else if (fuzzy && symbol.name.startsWith(needle)) score = 70;
    else if (fuzzy && symbol.name.toLowerCase().endsWith(lower)) score = 50;
    else if (fuzzy && symbol.name.toLowerCase().includes(lower)) score = 30;
    else continue;

    // A definition in a shallower file is usually the "real" one.
    score += Math.max(0, 10 - symbol.path.split('/').length);
    matches.push({ ...symbol, score });
  }

  matches.sort((a, b) => b.score - a.score
    || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    || a.path.localeCompare(b.path)
    || a.line - b.line);
  return matches.slice(0, limit);
}

/**
 * Outline one file: its symbols in source order, plus resolved imports.
 * @param index - the built index.
 * @param path - index-relative path.
 * @returns `{ path, found, symbols, imports, importedBy }`.
 */
export function fileOutline(index, path) {
  const symbols = index.symbols
    .filter((symbol) => symbol.path === path)
    .sort((a, b) => a.line - b.line || a.column - b.column);

  const imports = index.edges
    .filter((edge) => edge.from === path && edge.kind === 'imports')
    .map((edge) => ({ to: edge.to, external: edge.external === true, line: edge.line }));

  const importedBy = index.edges
    .filter((edge) => edge.kind === 'imports' && edge.targetPath === path)
    .map((edge) => ({ from: edge.from, line: edge.line }));

  const stat = index.files.find((file) => file.path === path);

  return {
    path,
    found: stat !== undefined || symbols.length > 0,
    lines: stat?.lines ?? 0,
    language: stat?.language,
    symbols,
    imports,
    importedBy,
  };
}

/**
 * Who calls a symbol (callers) or what it calls (callees).
 * @param index - the built index.
 * @param name - symbol name.
 * @param direction - `'in'`, `'out'`, or `'both'`.
 * @returns `{ name, definitions, callers, callees }`.
 */
export function callGraph(index, name, direction = 'both') {
  const table = symbolTable(index);
  const definitions = table.get(name) ?? [];

  // A definition owns the file region from its own line up to the next
  // top-level symbol in the SAME file — not the next same-named definition,
  // which would stretch the last definition of a file to EOF.
  const linesByPath = new Map();
  for (const symbol of index.symbols) {
    const list = linesByPath.get(symbol.path);
    if (list === undefined) linesByPath.set(symbol.path, [symbol.line]);
    else list.push(symbol.line);
  }
  for (const list of linesByPath.values()) list.sort((a, b) => a - b);

  const endOf = (path, line) => {
    const list = linesByPath.get(path) ?? [];
    for (const candidate of list) if (candidate > line) return candidate;
    return Number.MAX_SAFE_INTEGER;
  };

  const callers = [];
  const callees = [];

  // Outbound: call sites inside every defining file, narrowed to the symbol's
  // own line span.
  if (direction === 'out' || direction === 'both') {
    for (const definition of definitions) {
      const stop = endOf(definition.path, definition.line);
      for (const edge of index.edges) {
        if (edge.kind !== 'calls' || edge.from !== definition.path) continue;
        if (edge.line < definition.line || edge.line >= stop) continue;
        callees.push({
          name: edge.to,
          line: edge.line,
          from: definition.path,
          resolvedPath: edge.targetPath,
          resolvedLine: edge.targetLine,
        });
      }
    }
  }

  if (direction === 'in' || direction === 'both') {
    for (const edge of index.edges) {
      if (edge.kind !== 'calls' || edge.to !== name) continue;
      if (edge.targetPath === undefined) continue;
      callers.push({ from: edge.from, line: edge.line, targetPath: edge.targetPath, targetLine: edge.targetLine });
    }
  }

  return { name, definitions, callers, callees };
}

/**
 * Transitive callers, breadth-first, up to `depth` hops.
 * @param index - the built index.
 * @param name - starting symbol.
 * @param depth - hop limit (1–4).
 * @returns `{ name, depth, levels, total }` where `levels[i]` is hop i+1.
 */
export function callersAtDepth(index, name, depth = 2) {
  const hops = Math.max(1, Math.min(4, depth));
  const seen = new Set([name]);
  const levels = [];
  let frontier = [name];

  for (let hop = 0; hop < hops; hop += 1) {
    const next = [];
    for (const edge of index.edges) {
      if (edge.kind !== 'calls' || edge.targetPath === undefined) continue;
      if (!frontier.includes(edge.to)) continue;
      const defs = index.symbols.filter((symbol) => symbol.path === edge.from);
      // Attribute the call site to the smallest enclosing top-level symbol.
      let owner;
      for (const symbol of defs) {
        if (symbol.line <= edge.line) {
          if (owner === undefined || symbol.line > owner.line) owner = symbol;
        }
      }
      const ownerName = owner?.name ?? `<${edge.from}>`;
      if (seen.has(ownerName)) continue;
      seen.add(ownerName);
      next.push({ name: ownerName, path: edge.from, line: edge.line, calls: edge.to });
    }
    levels.push(next);
    frontier = next.map((row) => row.name);
    if (frontier.length === 0) break;
  }

  return { name, depth: hops, levels, total: seen.size - 1 };
}

/**
 * Inheritance chain for a class — parents upward, children downward.
 * @param index - the built index.
 * @param name - class name.
 * @returns `{ name, parents, children }` with one hop on each side.
 */
export function inheritance(index, name) {
  const parents = index.edges
    .filter((edge) => (edge.kind === 'extends' || edge.kind === 'implements') && edge.child === name)
    .map((edge) => ({
      name: edge.to,
      kind: edge.kind,
      from: edge.from,
      line: edge.line,
      resolvedPath: edge.targetPath,
      resolvedLine: edge.targetLine,
    }));

  const children = index.edges
    .filter((edge) => (edge.kind === 'extends' || edge.kind === 'implements') && edge.to === name)
    .map((edge) => ({
      name: edge.child,
      kind: edge.kind,
      from: edge.from,
      line: edge.line,
    }));

  return { name, parents, children };
}

/**
 * Packages this project depends on most, counted from resolved-failed imports.
 * @param index - the built index.
 * @param limit - how many rows.
 * @returns `[{ spec, files, example }]`, most used first.
 */
export function packageUsage(index, limit = 30) {
  const counts = new Map();
  for (const edge of index.edges) {
    if (edge.kind !== 'imports' || edge.external !== true) continue;
    const spec = edge.to;
    if (spec.startsWith('.') || spec.startsWith('/')) continue;
    const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    const row = counts.get(root) ?? { spec: root, files: new Set(), example: edge.from };
    row.files.add(edge.from);
    counts.set(root, row);
  }
  return Array.from(counts.values())
    .map((row) => ({ spec: row.spec, files: row.files.size, example: row.example }))
    .sort((a, b) => b.files - a.files || a.spec.localeCompare(b.spec))
    .slice(0, limit);
}

/**
 * Symbol-level search across a codebase: name matches plus file-name matches.
 * @param index - the built index.
 * @param query - free text.
 * @param limit - row cap.
 * @returns `{ symbols, files }`.
 */
export function search(index, query, limit = 30) {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { symbols: [], files: [] };

  const symbols = findSymbols(index, query, { limit });

  const files = index.files
    .filter((file) => file.path.toLowerCase().includes(needle))
    .slice(0, limit)
    .map((file) => ({ path: file.path, lines: file.lines, language: file.language }));

  return { symbols, files };
}

/**
 * The compact graph payload the sidebar canvas renders.
 * @param index - the built index.
 * @param options - `{ scope: 'workspace'|'file', path, limit }`.
 * @returns `{ nodes, links }` with stable ids.
 */
export function graphSlice(index, options = {}) {
  const limit = Math.max(10, Math.min(600, options.limit ?? 240));
  const scope = options.scope ?? 'workspace';

  if (scope === 'file') {
    const path = options.path;
    if (path === undefined) return { nodes: [], links: [], scope };
    const outline = fileOutline(index, path);
    const nodes = [
      { id: `file:${path}`, label: path.split('/').pop(), kind: 'file', path, weight: 4 },
      ...outline.symbols.slice(0, 120).map((symbol) => ({
        id: `sym:${path}:${symbol.line}:${symbol.name}`,
        label: symbol.name,
        kind: symbol.kind,
        path,
        line: symbol.line,
        weight: 2,
      })),
      ...outline.imports.slice(0, 60).map((imp) => ({
        id: `ext:${imp.to}`,
        label: imp.to,
        kind: 'module',
        path: imp.to,
        weight: 1,
      })),
    ];
    const links = [];
    for (const symbol of outline.symbols.slice(0, 120)) {
      links.push({ source: `file:${path}`, target: `sym:${path}:${symbol.line}:${symbol.name}`, kind: 'contains' });
    }
    for (const imp of outline.imports.slice(0, 60)) {
      links.push({ source: `file:${path}`, target: `ext:${imp.to}`, kind: 'imports' });
    }
    return { nodes, links, scope };
  }

  // Workspace scope: the most connected symbols become the visual spine.
  const inbound = new Map();
  for (const edge of index.edges) {
    if (edge.kind !== 'calls' || edge.targetPath === undefined) continue;
    inbound.set(edge.to, (inbound.get(edge.to) ?? 0) + 1);
  }

  const ranked = index.symbols
    .filter((symbol) => (inbound.get(symbol.name) ?? 0) > 0)
    .sort((a, b) => (inbound.get(b.name) ?? 0) - (inbound.get(a.name) ?? 0))
    .slice(0, limit);

  const keep = new Set(ranked.map((symbol) => symbol.name));
  const nodes = ranked.map((symbol) => ({
    id: `sym:${symbol.name}:${symbol.path}:${symbol.line}`,
    label: symbol.name,
    kind: symbol.kind,
    path: symbol.path,
    line: symbol.line,
    weight: inbound.get(symbol.name) ?? 1,
  }));

  const nodeByKey = new Map();
  for (const node of nodes) {
    const key = `${node.label}|${node.path}`;
    if (!nodeByKey.has(key)) nodeByKey.set(key, node.id);
  }

  const links = [];
  for (const edge of index.edges) {
    if (edge.kind !== 'calls' || edge.targetPath === undefined) continue;
    if (!keep.has(edge.to)) continue;
    const defs = index.symbols.filter((symbol) => symbol.path === edge.from && keep.has(symbol.name));
    for (const def of defs) {
      const source = nodeByKey.get(`${def.name}|${def.path}`);
      const target = nodeByKey.get(`${edge.to}|${edge.targetPath}`);
      if (source === undefined || target === undefined || source === target) continue;
      links.push({ source, target, kind: 'calls' });
    }
    if (links.length > limit * 3) break;
  }

  return { nodes, links, scope };
}

export { edgesFrom, edgesInto, symbolTable };
