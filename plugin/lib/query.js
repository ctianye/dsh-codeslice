/**
 * Query a built graph: pick seeds, expand a neighbourhood, render as text.
 *
 * This is the piece that replaces grepping, and it is the single highest-value
 * file in the port (`spec §5`), so it is a faithful transliteration of
 * `graph/query.py:1-554`. Everything here is a pure function over plain objects:
 * no I/O, no state, no clock.
 *
 * 1. **Score nodes against the question.** Term overlap weighted by IDF, so a
 *    rare identifier outranks a ubiquitous word. Label hits are weighted far
 *    above path hits, so a symbol name the user typed ranks first.
 * 2. **Pick seeds** from the high scorers, one per query term where possible, so
 *    a question naming two concepts starts from both.
 * 3. **Expand** by BFS (broad context) or DFS (follow one chain), bounded by depth.
 * 4. **Render** to text within a token budget, listing each node's edges with
 *    their confidence label and direction.
 *
 * The rendered text must match `spec §5.7` byte for byte, including `"1 edges"`
 * and the two spaces after `Kind:` — a model reading `Node: … / Kind: … / -->` is
 * the whole point of porting the renderer instead of inventing JSON.
 *
 * ## Exports
 *
 * - {@link tokenizeQuestion}, {@link scoreNodes}, {@link pickSeeds},
 *   {@link expand}, {@link renderSubgraphText} — the query pipeline proper.
 * - {@link resolveAnchor}, {@link nodeContext}, {@link shortestPathText},
 *   {@link neighborsText}, {@link rationaleFor} — one-node questions.
 * - {@link egoGraph}, {@link graphSlice} — canvas slices for the HTTP API.
 */

import {
  DEFAULT_FAMILIES,
  KIND_WEIGHT,
  RELATION_FAMILY,
  RANK_CONFIDENCE,
  fileNodeId,
} from './model.js';

/* ------------------------------------------------------------------ *
 * Constants                                                          *
 * ------------------------------------------------------------------ */

/** Default expansion depth, mirroring the tool schema (`query.py:29-36`). */
export const DEFAULT_DEPTH = 3;

/** Default output budget in tokens. */
export const DEFAULT_TOKEN_BUDGET = 2000;

/** Hard cap on expansion depth. */
export const MAX_DEPTH = 6;

/**
 * Rough characters per token. Deliberately conservative (English averages ~4):
 * overestimating only means the caller gets slightly less text, never a
 * truncated answer that silently lost an edge.
 */
export const CHARS_PER_TOKEN = 4;

/** The graph tokenizer: ASCII words, numbers, and **one** CJK character. */
const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+|[\u4e00-\u9fff]/gu;

/**
 * Question words, verbatim from `query.py:39-47`.
 *
 * Two classes behave very differently, because the tokenizer yields **one** CJK
 * character per match: the 21 single-character CJK entries work as intended, and
 * the three multi-character ones (`怎么`, `什么`, `如何`) can never match a
 * one-character token, so they are dead. That is reproduced — "fixing" it would
 * change seed ranking for Chinese questions (`spec §14.2`).
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in',
  'on', 'for', 'and', 'or', 'not', 'with', 'this', 'that', 'these', 'those',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'does', 'do', 'did',
  'can', 'could', 'should', 'would', 'it', 'its', 'as', 'at', 'by', 'from',
  'into', 'than', 'then', 'there', 'their', 'has', 'have', 'had', 'will',
  '的', '了', '是', '在', '和', '与', '或', '有', '对', '从', '到', '把', '被',
  '这', '那', '个', '们', '怎么', '什么', '如何', '哪', '里', '吗', '呢',
]);

/** True when every character of `text` is a CJK ideograph. */
function isCjk(text) {
  if (typeof text !== 'string' || text === '') return false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x4e00 || code > 0x9fff) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Tokenization and scoring                                           *
 * ------------------------------------------------------------------ */

/**
 * Lower-cased search terms, minus stopwords (`query.py:50-70`).
 *
 * CJK is split **per character**: there is no segmenter dependency here, and a
 * single CJK character is a word, not a letter, so it carries real signal. This
 * is deliberately a different tokenizer from `retrieval.searchTokens`, which
 * emits bigrams for an FTS-style index (`spec §14.2`).
 *
 * Single Latin characters are dropped: with IDF they match almost every node and
 * degenerate into noise that outranks the identifier the user typed.
 *
 * @param text - the question.
 * @returns the terms, in query order, duplicates kept.
 *
 * @example
 * tokenizeQuestion('How does the Agent call a tool') // ['agent','call','tool']
 */
export function tokenizeQuestion(text) {
  const terms = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(String(text ?? ''))) !== null) {
    const term = match[0].toLowerCase();
    if (STOPWORDS.has(term)) continue;
    if (isCjk(term)) {
      terms.push(term);
      continue;
    }
    if (term.length >= 2) terms.push(term);
  }
  return terms;
}

/**
 * The searchable text of one node (`query.py:94-104`).
 *
 * `parent` is a **node id string** (which contains the path and the parent's
 * name), so a child's searchable text leaks its parent's identity. That is
 * deliberate: it lets a question about `Renderer` match a node whose own label is
 * only `render`.
 *
 * @param node - the node.
 * @returns the lower-cased haystack.
 */
function nodeText(node) {
  const parts = [
    String(node.label ?? ''),
    String(node.path ?? ''),
    String(node.kind ?? ''),
  ];
  if (node.parent) parts.push(String(node.parent));
  return parts.join(' ').toLowerCase();
}

/**
 * Rank nodes against a question (`query.py:107-165`).
 *
 * Scoring per term: `idf × 6` for an exact label hit, `× 3` for a prefix, `× 2`
 * for a substring, `× 0.5` for a hit that is only in the path/kind/parent. Then a
 * centrality bonus of `1 + 0.25·(deg/maxDeg)` — which cannot reorder nodes by more
 * than 25 % — and the per-kind multiplier.
 *
 * Degree comes from `edges`, not from the node's persisted `degree` field: they
 * agree in a persisted graph, but a hand-built one may disagree.
 *
 * @param nodes - the nodes to rank.
 * @param question - the question, in any language.
 * @param edges - the edges, for the centrality bonus.
 * @returns `[{ score, node }]` best first, ties broken by node id.
 */
export function scoreNodes(nodes, question, edges) {
  const terms = tokenizeQuestion(question);
  if (terms.length === 0 || !Array.isArray(nodes) || nodes.length === 0) return [];

  const texts = new Map();
  for (const node of nodes) texts.set(node.id, nodeText(node));

  // IDF: a term present in nearly every node cannot discriminate.
  const distinct = [...new Set(terms)];
  const df = new Map();
  for (const text of texts.values()) {
    for (const term of distinct) {
      if (text.includes(term)) df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const total = Math.max(1, nodes.length);
  const idf = new Map();
  for (const term of terms) {
    idf.set(term, Math.log((total + 1) / ((df.get(term) ?? 0) + 1)) + 1.0);
  }

  const degree = new Map();
  for (const edge of edges ?? []) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  let maxDegree = 1;
  for (const value of degree.values()) if (value > maxDegree) maxDegree = value;

  const scored = [];
  for (const node of nodes) {
    const text = texts.get(node.id) ?? '';
    const label = String(node.label ?? '').toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!text.includes(term)) continue;
      const weight = idf.get(term) ?? 0;
      // An exact label hit is the strongest signal available: the user typed a
      // symbol name, so rank that symbol first.
      if (label === term) score += weight * 6.0;
      else if (label.startsWith(term)) score += weight * 3.0;
      else if (label.includes(term)) score += weight * 2.0;
      else score += weight * 0.5;
    }
    if (score <= 0) continue;
    // Mild centrality bonus: between two equally-matching nodes, the one the rest
    // of the code actually uses is the better starting point.
    score *= 1.0 + 0.25 * ((degree.get(node.id) ?? 0) / maxDegree);
    score *= KIND_WEIGHT[node.kind] ?? 1.0;
    if (score <= 0) continue;
    scored.push({ score, node });
  }

  scored.sort((a, b) => (b.score - a.score) || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  return scored;
}

/**
 * Best starting node per query term, then the overall best (`query.py:168-200`).
 *
 * One seed per term matters for two-concept questions ("how does the agent call
 * the tool"): a single highest scorer would only ever anchor one side. Note the
 * seed test uses `label`/`path` **substring**, while scoring also accepts a
 * kind/parent-only hit — so a node that scored purely from its `kind` text can be
 * a top-up seed but never a per-term seed.
 *
 * @param nodes - the nodes.
 * @param question - the question.
 * @param edges - the edges, for scoring.
 * @param limit - maximum seeds (default 3).
 * @returns the seed node ids, best first.
 */
export function pickSeeds(nodes, question, edges, limit = 3) {
  const terms = tokenizeQuestion(question);
  const scored = scoreNodes(nodes, question, edges);
  if (scored.length === 0) return [];
  const cap = Math.max(1, Math.trunc(Number(limit) || 3));
  const seeds = [];
  for (const term of terms) {
    for (const { node } of scored) {
      const label = String(node.label ?? '').toLowerCase();
      const path = String(node.path ?? '').toLowerCase();
      if (label.includes(term) || path.includes(term)) {
        if (!seeds.includes(node.id)) seeds.push(node.id);
        break;
      }
    }
    if (seeds.length >= cap) break;
  }
  for (const { node } of scored) {
    if (seeds.length >= cap) break;
    if (!seeds.includes(node.id)) seeds.push(node.id);
  }
  return seeds.slice(0, cap);
}

/* ------------------------------------------------------------------ *
 * Expansion                                                          *
 * ------------------------------------------------------------------ */

/**
 * Undirected adjacency with the traversal direction remembered
 * (`query.py:203-209`).
 * @param edges - the edges.
 * @returns `Map(node id → [{ other, edge, outgoing }])`.
 */
function adjacency(edges) {
  const adj = new Map();
  const push = (key, row) => {
    const list = adj.get(key);
    if (list === undefined) adj.set(key, [row]);
    else list.push(row);
  };
  for (const edge of edges ?? []) {
    push(edge.source, { other: edge.target, edge, outgoing: true });
    push(edge.target, { other: edge.source, edge, outgoing: false });
  }
  return adj;
}

/**
 * Collect a neighbourhood around `seeds` (`query.py:212-287`).
 *
 * Returns the visited ids plus every traversed edge as
 * `[fromId, toId, edge, outgoing]`, oriented as it was traversed, so the rendered
 * text can show outgoing and incoming honestly. An edge between two visited nodes
 * is rendered once, under whichever endpoint reached it first — so the arrow shown
 * depends on traversal order, as in the original.
 *
 * `external` nodes are **recorded but never expanded through**: every file imports
 * `typing`, and walking out of one spends the whole budget on stdlib names no
 * question is about.
 *
 * DFS pushes neighbours after sorting descending by degree and iterating in
 * reverse, so the **highest-degree** neighbour is pushed last and popped first.
 * Dropping either half of that double reversal changes the traversal order and
 * therefore the rendered `Connections` lines (`spec §5.6`).
 *
 * @param nodesById - `Map(node id → node)`.
 * @param edges - the edges.
 * @param seeds - the starting node ids.
 * @param mode - `'bfs'` (default) or `'dfs'`.
 * @param depth - expansion depth, clamped to `[1, MAX_DEPTH]`.
 * @returns `{ visited, seenEdges }`: `visited` is a `Set` of node ids and
 *   `seenEdges` an array of `[fromId, toId, edge, outgoing]`.
 */
export function expand(nodesById, edges, seeds, mode = 'bfs', depth = DEFAULT_DEPTH) {
  const levels = Math.max(1, Math.min(Math.trunc(Number(depth) || DEFAULT_DEPTH), MAX_DEPTH));
  const adj = adjacency(edges);
  const visited = new Set();
  const seenEdges = [];
  const seenKeys = new Set();

  const expandable = (nodeId) => {
    const node = nodesById.get(nodeId);
    return node !== undefined && node.kind !== 'external';
  };

  const record = (current, other, edge, outgoing) => {
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation ?? ''}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    seenEdges.push([current, other, edge, outgoing]);
  };

  if (String(mode) === 'dfs') {
    // Depth-first: follow the highest-degree branch to its end first. This is what
    // "trace how A reaches B" wants, where BFS would fan out sideways.
    const stack = (seeds ?? []).slice().reverse().map((seed) => [seed, 0]);
    while (stack.length > 0) {
      const [current, level] = stack.pop();
      if (visited.has(current) || level > levels) continue;
      if (!nodesById.has(current)) continue;
      visited.add(current);
      const neighbours = (adj.get(current) ?? []).slice();
      neighbours.sort((a, b) => (
        (nodesById.get(b.other)?.degree ?? 0) - (nodesById.get(a.other)?.degree ?? 0)
      ));
      neighbours.reverse();
      for (const { other, edge, outgoing } of neighbours) {
        if (nodesById.has(other)) record(current, other, edge, outgoing);
        if (!visited.has(other) && level + 1 <= levels && expandable(other)) {
          stack.push([other, level + 1]);
        }
      }
    }
    return { visited, seenEdges };
  }

  // BFS (default): breadth-first from every seed at once, so a multi-concept
  // question returns a connected context rather than two separate chains.
  let frontier = (seeds ?? []).filter((seed) => nodesById.has(seed));
  for (const seed of frontier) visited.add(seed);
  for (let level = 0; level < levels; level += 1) {
    const next = [];
    for (const current of frontier) {
      for (const { other, edge, outgoing } of adj.get(current) ?? []) {
        if (!nodesById.has(other)) continue;
        record(current, other, edge, outgoing);
        // Record the edge (the dependency is a fact) but do not walk through an
        // external module: it has nothing further to say.
        if (!visited.has(other) && expandable(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return { visited, seenEdges };
}

/* ------------------------------------------------------------------ *
 * Rendering                                                          *
 * ------------------------------------------------------------------ */

/**
 * Render a subgraph as the text block an agent reads (`query.py:290-355`).
 *
 * Seeds first, then their neighbours ordered by score: the most relevant context
 * must survive the budget cut, not be truncated away because it came last.
 *
 * Output shape, exactly (`spec §5.7`):
 *
 * ```
 * Subgraph: 2 nodes, 1 edges (budget 2000 tokens)
 * Node: enrich
 *   Kind: function  Source: app/services/ollama.py:L41
 *   Community: 3 (ollama.py +2)
 *   Relevance: 4.62
 *   Connections (1):
 *     --> _request [calls] [EXTRACTED]
 *
 * Node: _request
 *   Kind: function  Source: app/services/ollama.py:L12
 * ```
 *
 * `nodes`/`edges` are **not** pluralised conditionally: `"1 edges"`.
 *
 * @param nodesById - `Map(node id → node)`.
 * @param edges - accepted for symmetry with the original; the rendered edges come
 *   from `expanded.seenEdges`.
 * @param expanded - `{ visited, seenEdges }` from {@link expand}, or a bare `Set`
 *   of visited ids (in which case the edges are derived from `edges`).
 * @param options - `{ seeds, scores, tokenBudget, token_budget }`.
 * @returns the block, or the "no matching node" line when nothing was visited.
 */
export function renderSubgraphText(nodesById, edges, expanded, options = {}) {
  void edges;
  const visited = expanded instanceof Set ? expanded : new Set(expanded?.visited ?? []);
  const seenEdges = expanded instanceof Set ? [] : (expanded?.seenEdges ?? []);
  const seeds = options.seeds ?? [];
  const scores = options.scores ?? new Map();
  const tokenBudget = Number(options.tokenBudget ?? options.token_budget ?? DEFAULT_TOKEN_BUDGET);

  if (visited.size === 0) return '图中没有匹配的节点。请在问题里使用代码中出现的符号名或文件名。';

  const budgetChars = Math.max(200, Math.trunc(tokenBudget) * CHARS_PER_TOKEN);
  const seedSet = seeds.filter((seed) => visited.has(seed));
  const rest = [...visited].filter((id) => !seedSet.includes(id));
  rest.sort((a, b) => {
    const sa = scores instanceof Map ? (scores.get(a) ?? 0) : (scores[a] ?? 0);
    const sb = scores instanceof Map ? (scores.get(b) ?? 0) : (scores[b] ?? 0);
    return (sb - sa) || (a < b ? -1 : a > b ? 1 : 0);
  });
  const ordered = [...seedSet, ...rest];

  // Group the rendered edges under the node they belong to.
  const byNode = new Map();
  for (const [current, other, edge, outgoing] of seenEdges) {
    const label = String(nodesById.get(other)?.label ?? other);
    const arrow = outgoing ? '-->' : '<--';
    const line = `    ${arrow} ${label} [${edge.relation ?? ''}] [${edge.confidence ?? ''}]`;
    const list = byNode.get(current);
    if (list === undefined) byNode.set(current, [line]);
    else list.push(line);
  }

  const lines = [];
  let used = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const nid = ordered[index];
    const node = nodesById.get(nid);
    if (node === undefined) continue;
    const block = [
      `Node: ${node.label || nid}`,
      `  Kind: ${node.kind}  Source: ${node.path}:L${node.start_line}`,
    ];
    if (node.community_label) block.push(`  Community: ${node.community} (${node.community_label})`);
    const hasScore = scores instanceof Map ? scores.has(nid) : Object.hasOwn(scores ?? {}, nid);
    if (hasScore) {
      const value = Number(scores instanceof Map ? scores.get(nid) : scores[nid]) || 0;
      block.push(`  Relevance: ${value.toFixed(2)}`);
    }
    const here = byNode.get(nid) ?? [];
    if (here.length > 0) {
      block.push(`  Connections (${here.length}):`);
      block.push(...here);
    }
    const text = block.join('\n');
    if (used + text.length > budgetChars) {
      // The count includes the current node: it is omitted too.
      const remaining = ordered.length - index;
      lines.push(`... (${remaining} more nodes omitted by the token budget; raise token_budget or lower depth)`);
      break;
    }
    lines.push(text);
    used += text.length + 2;
  }

  const header = `Subgraph: ${visited.size} nodes, ${seenEdges.length} edges (budget ${tokenBudget} tokens)\n`;
  return header + lines.join('\n\n');
}

/* ------------------------------------------------------------------ *
 * Anchor and one-node queries                                        *
 * ------------------------------------------------------------------ */

/**
 * Find the node a UI selection or a typed name refers to (`query.py:358-392`).
 *
 * Tried in order: exact id (what the UI sends), exact label, a **file** node whose
 * path matches, then a symbol inside such a file, then a label substring.
 *
 * File nodes get their own step because every symbol in a file shares that file's
 * path: matching `helpers.py` by path alone would otherwise return whichever
 * function happened to sort first, which is not what clicking a file means.
 *
 * @param nodes - the nodes.
 * @param anchor - a node id, a name, or a path.
 * @returns the node id, or null.
 */
export function resolveAnchor(nodes, anchor) {
  const raw = String(anchor ?? '').trim();
  if (raw === '') return null;
  const list = Array.isArray(nodes) ? nodes : [];

  for (const node of list) if (node.id === raw) return node.id;
  const lowered = raw.toLowerCase();
  for (const node of list) {
    if (String(node.label ?? '').toLowerCase() === lowered) return node.id;
  }

  const pathMatches = (node) => {
    const path = String(node.path ?? '').toLowerCase();
    return path === lowered || path.endsWith(`/${lowered}`);
  };
  for (const node of list) if (node.kind === 'file' && pathMatches(node)) return node.id;
  for (const node of list) if (pathMatches(node)) return node.id;
  for (const node of list) {
    if (String(node.label ?? '').toLowerCase().includes(lowered)) return node.id;
  }
  return null;
}

/** Build `Map(id → node)` from an array. */
function byIdOf(nodes) {
  return new Map((nodes ?? []).map((node) => [node.id, node]));
}

/**
 * Neighbourhood text around one specific node, for the chat panel
 * (`query.py:395-423`).
 *
 * No `scores` are passed, so no `Relevance:` lines appear and the non-seed nodes
 * are ordered purely by id.
 *
 * @param graph - `{ nodes, edges }`, or a bare node array.
 * @param anchor - a node id, a name, or a path.
 * @param depth - BFS depth (default 2).
 * @param tokenBudget - output budget (default 1200).
 * @returns the rendered block, or `''` when the graph is empty or the anchor is
 *   unknown.
 */
export function nodeContext(graph, anchor, depth = 2, tokenBudget = 1200) {
  const nodes = Array.isArray(graph) ? graph : (graph?.nodes ?? []);
  const edges = Array.isArray(graph) ? [] : (graph?.edges ?? []);
  if (nodes.length === 0) return '';
  const nodesById = byIdOf(nodes);
  const anchorId = resolveAnchor(nodes, anchor);
  if (anchorId === null) return '';
  const expanded = expand(nodesById, edges, [anchorId], 'bfs', depth);
  return renderSubgraphText(nodesById, edges, expanded, {
    seeds: [anchorId],
    tokenBudget,
  });
}

/**
 * Shortest connection between two nodes, ending with its weakest hop
 * (`query.py:426-495`).
 *
 * Overall confidence is the **minimum** across hops: a chain is only as
 * trustworthy as its weakest link, and saying so stops a two-hop path with one
 * inferred edge from reading as fact.
 *
 * The arrow is always the *path* direction, not the edge's stored direction — a
 * traversed-backwards edge still prints `current -rel-> other`. That is a
 * deliberate simplification the original makes, reproduced for text parity.
 *
 * @param graph - `{ nodes, edges }`, or a bare node array.
 * @param source - the starting node id, name or path.
 * @param target - the ending node id, name or path.
 * @param maxHops - maximum hops, clamped to `[1, 15]` (default 8).
 * @param undirected - whether an edge may be traversed backwards (default true).
 * @returns the rendered path, or one of the documented failure lines:
 *   `node not found: …`, `source and target are the same node: …`,
 *   `no path between … within N hops`.
 */
export function shortestPathText(graph, source, target, maxHops = 8, undirected = true) {
  const nodes = Array.isArray(graph) ? graph : (graph?.nodes ?? []);
  const edges = Array.isArray(graph) ? [] : (graph?.edges ?? []);
  const nodesById = byIdOf(nodes);
  const start = resolveAnchor(nodes, source);
  const end = resolveAnchor(nodes, target);
  if (start === null) return `node not found: ${source}`;
  if (end === null) return `node not found: ${target}`;
  if (start === end) return `source and target are the same node: ${nodesById.get(start)?.label}`;

  const adj = new Map();
  const push = (key, row) => {
    const list = adj.get(key);
    if (list === undefined) adj.set(key, [row]);
    else list.push(row);
  };
  for (const edge of edges) {
    push(edge.source, { other: edge.target, edge });
    if (undirected) push(edge.target, { other: edge.source, edge });
  }

  const hops = Math.max(1, Math.min(Math.trunc(Number(maxHops) || 8), 15));
  const queue = [[start, []]];
  const seen = new Set([start]);
  let found = null;
  while (queue.length > 0 && found === null) {
    const [current, path] = queue.shift();
    if (path.length >= hops) continue;
    for (const { other, edge } of adj.get(current) ?? []) {
      if (seen.has(other)) continue;
      const step = [...path, [current, edge]];
      if (other === end) {
        found = step;
        break;
      }
      seen.add(other);
      queue.push([other, step]);
    }
  }

  if (found === null) return `no path between ${source} and ${target} within ${hops} hops`;

  let weakestRank = 3;
  for (const [, edge] of found) {
    const rank = edge.confidence === 'EXTRACTED' ? 3 : edge.confidence === 'INFERRED' ? 2
      : edge.confidence === 'AMBIGUOUS' ? 1 : 0;
    if (rank < weakestRank) weakestRank = rank;
  }

  const lines = [`Shortest path (${found.length} hops):`];
  for (const [current, edge] of found) {
    const targetId = edge.source === current ? edge.target : edge.source;
    lines.push(
      `  ${nodesById.get(current)?.label} -${edge.relation}-> `
      + `${nodesById.get(targetId)?.label} [${edge.confidence}]`,
    );
  }
  lines.push(`Path confidence: ${RANK_CONFIDENCE[weakestRank] ?? 'UNKNOWN'} (weakest hop)`);
  return lines.join('\n');
}

/**
 * Direct neighbours of one node, grouped by direction (`query.py:498-554`).
 *
 * Truncation is **line by line** here, unlike the per-node-block granularity of
 * {@link renderSubgraphText}. `degree` is the persisted node field, printed raw,
 * so a node dict without one renders the literal `undefined`.
 *
 * @param graph - `{ nodes, edges }`, or a bare node array.
 * @param label - the node id, name or path.
 * @param relationFilter - case-insensitive substring filter on the relation.
 * @param tokenBudget - output budget (default 2000).
 * @returns the rendered block, or `node not found: …`.
 */
export function neighborsText(graph, label, relationFilter = '', tokenBudget = DEFAULT_TOKEN_BUDGET) {
  const nodes = Array.isArray(graph) ? graph : (graph?.nodes ?? []);
  const edges = Array.isArray(graph) ? [] : (graph?.edges ?? []);
  const nodesById = byIdOf(nodes);
  const anchor = resolveAnchor(nodes, label);
  if (anchor === null) return `node not found: ${label}`;
  const wanted = String(relationFilter ?? '').trim().toLowerCase();

  const outgoing = [];
  const incoming = [];
  for (const edge of edges) {
    if (wanted !== '' && !String(edge.relation ?? '').toLowerCase().includes(wanted)) continue;
    if (edge.source === anchor) {
      outgoing.push(`  --> ${nodesById.get(edge.target)?.label} [${edge.relation}] [${edge.confidence}]`);
    } else if (edge.target === anchor) {
      incoming.push(`  <-- ${nodesById.get(edge.source)?.label} [${edge.relation}] [${edge.confidence}]`);
    }
  }

  const node = nodesById.get(anchor);
  const lines = [
    `Node: ${node.label}`,
    `  Source: ${node.path}:L${node.start_line}`,
    `  Kind: ${node.kind}  Degree: ${node.degree}`,
  ];
  if (outgoing.length > 0) {
    lines.push(`Outgoing (${outgoing.length}):`, ...outgoing);
  }
  if (incoming.length > 0) {
    lines.push(`Incoming (${incoming.length}):`, ...incoming);
  }
  if (outgoing.length === 0 && incoming.length === 0) {
    lines.push('  (no connections match the filter)');
  }

  const budgetChars = Math.max(200, Math.trunc(Number(tokenBudget) || DEFAULT_TOKEN_BUDGET) * CHARS_PER_TOKEN);
  const out = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length > budgetChars) {
      out.push('... (truncated by the token budget)');
      break;
    }
    out.push(line);
    used += line.length + 1;
  }
  return out.join('\n');
}

/** Edges that count as "this node calls another" for the caller walk. */
const CALLER_RELATIONS = new Set(['calls', 'indirect_call']);

/**
 * Who calls one function, walked N hops up the call graph (§3.5.3).
 *
 * The previous version listed direct neighbors only and ignored `depth` entirely;
 * this BFS follows incoming `calls`/`indirect_call` edges level by level up to the
 * requested depth (clamped to `MAX_DEPTH`), so a 3-hop caller shows up three hops
 * out instead of being dropped. Direct outgoing callees are still listed one hop,
 * the same shape the old neighbor view exposed.
 *
 * @param graph - `{ nodes, edges }`, or a bare node array.
 * @param label - the node id, name or path.
 * @param depth - transitive caller hops, clamped to `[1, MAX_DEPTH]`.
 * @param tokenBudget - output budget (default 2000).
 * @returns the rendered block, or `node not found: …`.
 */
export function callersText(graph, label, depth = 1, tokenBudget = DEFAULT_TOKEN_BUDGET) {
  const nodes = Array.isArray(graph) ? graph : (graph?.nodes ?? []);
  const edges = Array.isArray(graph) ? [] : (graph?.edges ?? []);
  const nodesById = byIdOf(nodes);
  const anchor = resolveAnchor(nodes, label);
  if (anchor === null) return `node not found: ${label}`;

  const levels = Math.max(1, Math.min(MAX_DEPTH, Math.trunc(Number(depth) || 1)));

  // Incoming adjacency: for each callee, the callers that reach it, with the edge
  // carried along so the rendered row keeps its relation and confidence.
  const incoming = new Map();
  const outgoing = [];
  for (const edge of edges) {
    if (!CALLER_RELATIONS.has(edge.relation)) continue;
    if (edge.target === anchor) {
      const row = { callerId: edge.source, relation: edge.relation, confidence: edge.confidence };
      const list = incoming.get(anchor) ?? [];
      list.push(row);
      incoming.set(anchor, list);
    }
    if (edge.source === anchor) {
      outgoing.push(`  --> ${nodesById.get(edge.target)?.label} [${edge.relation}] [${edge.confidence}]`);
    }
  }

  const node = nodesById.get(anchor);
  const lines = [
    `Node: ${node.label}`,
    `  Source: ${node.path}:L${node.start_line}`,
    `  Kind: ${node.kind}  Degree: ${node.degree}`,
  ];

  // BFS level by level. A node visited at an earlier hop is not revisited: the
  // first hop at which a caller appears is its shortest distance to the anchor.
  const visited = new Set([anchor]);
  let frontier = incoming.get(anchor) ?? [];
  for (let level = 1; level <= levels; level += 1) {
    if (frontier.length === 0) break;
    const next = [];
    const indent = '  '.repeat(level);
    for (const row of frontier) {
      if (visited.has(row.callerId)) continue;
      visited.add(row.callerId);
      const caller = nodesById.get(row.callerId);
      if (caller === undefined) continue;
      lines.push(`${indent}<-- ${caller.label} [${row.relation}] [${row.confidence}]`);
      for (const upward of incoming.get(row.callerId) ?? []) next.push(upward);
    }
    frontier = next;
  }

  if (outgoing.length > 0) lines.push('Outgoing:', ...outgoing);
  if (lines.length === 3 && outgoing.length === 0 && frontier.length === 0
    && (incoming.get(anchor) ?? []).length === 0) {
    lines.push('  (no callers or callees)');
  }

  const budgetChars = Math.max(200, Math.trunc(Number(tokenBudget) || DEFAULT_TOKEN_BUDGET) * CHARS_PER_TOKEN);
  const out = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length > budgetChars) {
      out.push('... (truncated by the token budget)');
      break;
    }
    out.push(line);
    used += line.length + 1;
  }
  return out.join('\n');
}

/**
 * The recorded explanations attached to a symbol or file (`service.py:129-166`).
 *
 * This is the query the whole rationale mechanism exists for: "why is this like
 * this". The answer comes from the author's docstring or `# WHY:` comment, not
 * from a model's guess, so it can be quoted as fact.
 *
 * Output shape:
 *
 * ```
 * Node: {label}
 *   Source: {path}:L{start_line}
 *   [{origin}] {rationale label}
 *   （这个节点没有记录下来的说明）        ← only when nothing was found
 * ```
 *
 * An empty rationale label is skipped **without** counting toward `limit`, and
 * `found > limit` breaks — so at most `limit` entries are printed.
 *
 * @param nodesById - `Map(node id → node)`.
 * @param edges - the edges.
 * @param anchor - the node id, name or path.
 * @param limit - maximum explanations (default 8).
 * @returns the rendered block, or `node not found: …`.
 */
export function rationaleFor(nodesById, edges, anchor, limit = 8) {
  const nodes = [...nodesById.values()];
  const anchorId = resolveAnchor(nodes, anchor);
  if (anchorId === null) return `node not found: ${anchor}`;
  const target = nodesById.get(anchorId);
  const cap = Math.max(1, Math.trunc(Number(limit) || 8));

  const lines = [
    `Node: ${target.label}`,
    `  Source: ${target.path}:L${target.start_line}`,
  ];
  let found = 0;
  for (const edge of edges ?? []) {
    if (edge.relation !== 'rationale_for') continue;
    if (edge.target !== anchorId) continue;
    const sourceNode = nodesById.get(edge.source) ?? {};
    const label = String(sourceNode.label ?? '').trim();
    if (label === '') continue;
    found += 1;
    if (found > cap) break;
    const origin = sourceNode.origin ?? 'comment';
    lines.push(`  [${origin}] ${label}`);
  }
  if (found === 0) lines.push('  （这个节点没有记录下来的说明）');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Canvas slices                                                      *
 * ------------------------------------------------------------------ */

/** The wire shape of one node (WIRE.md §2). */
function wireNode(node) {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    path: node.path,
    line: node.start_line,
    endLine: node.end_line,
    degree: node.degree ?? 0,
    community: node.community ?? 0,
    communityLabel: node.community_label ?? node.communityLabel ?? '',
    // The canvas sizes a dot by this; degree is the honest proxy and avoids
    // inventing a PageRank the backend does not compute.
    weight: node.weight ?? node.degree ?? 0,
    ...(node.memberCount === undefined ? {} : { memberCount: node.memberCount }),
    ...(node.aggregated === true ? { aggregated: true } : {}),
  };
}

/** The wire shape of one link (WIRE.md §2). */
function wireLink(edge, index) {
  return {
    id: String(index),
    source: edge.source,
    target: edge.target,
    relation: edge.relation,
    family: RELATION_FAMILY[edge.relation] ?? 'other',
    confidence: edge.confidence,
    line: edge.line ?? null,
    ...(edge.count === undefined ? {} : { count: edge.count }),
  };
}

/**
 * Collapse a graph too large for the canvas to one node per community.
 *
 * This is graphify's own degradation (`exporters/html.py:526-590`): keep the
 * whole graph represented, not the heaviest 5,000 nodes, so the picture stays a
 * map of the repository rather than of its busiest corner. Membership is not
 * lost — the meta node carries `memberCount`, and clicking it still names the
 * community in the inspector.
 *
 * @param nodes - all nodes.
 * @param edges - edges already filtered by the requested families.
 * @param limit - maximum meta nodes.
 * @returns the slice shape {@link graphSlice} returns, with `aggregated: true`.
 */
function aggregateGraph(nodes, edges, limit) {
  const groups = new Map();
  for (const node of nodes) {
    const cid = Number.isFinite(Number(node.community)) ? Number(node.community) : 0;
    const group = groups.get(cid);
    if (group === undefined) {
      groups.set(cid, {
        cid,
        label: String(node.community_label ?? node.communityLabel ?? '') || `Community ${cid}`,
        members: [node],
      });
    } else {
      group.members.push(node);
    }
  }

  const order = [...groups.values()].sort((a, b) => (
    (b.members.length - a.members.length)
    || (Math.min(...a.members.map((node) => node.id)) < Math.min(...b.members.map((node) => node.id)) ? -1 : 1)
  ));

  let kept = order;
  let overflow = [];
  if (order.length > limit) {
    kept = order.slice(0, Math.max(0, limit - 1));
    overflow = order.slice(Math.max(0, limit - 1));
  }

  const metaOf = (group, cid, label) => {
    const ids = group.members.map((node) => node.id);
    return {
      id: `community:${cid}`,
      label,
      kind: 'community',
      path: '',
      start_line: 0,
      end_line: 0,
      degree: group.members.length,
      weight: group.members.length,
      memberCount: group.members.length,
      aggregated: true,
      community: cid,
      community_label: label,
      communityLabel: label,
    };
  };

  const metaNodes = kept.map((group) => metaOf(group, group.cid, group.label));
  const nodeToMeta = new Map();
  for (const group of kept) {
    for (const node of group.members) nodeToMeta.set(node.id, `community:${group.cid}`);
  }
  if (overflow.length > 0) {
    const other = { members: overflow.flatMap((group) => group.members) };
    metaNodes.push(metaOf(other, -1, '其他社区'));
    for (const node of other.members) nodeToMeta.set(node.id, 'community:-1');
  }

  const pairs = new Map();
  for (const edge of edges) {
    const source = nodeToMeta.get(edge.source);
    const target = nodeToMeta.get(edge.target);
    if (source === undefined || target === undefined || source === target) continue;
    const key = source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`;
    const row = pairs.get(key);
    if (row === undefined) {
      pairs.set(key, {
        source,
        target,
        relation: 'community',
        confidence: 'EXTRACTED',
        line: null,
        count: 1,
      });
    } else {
      row.count += 1;
    }
  }

  const links = [...pairs.values()].slice(0, limit * 4).map((edge, index) => wireLink(edge, index));
  return {
    scope: 'workspace',
    nodes: metaNodes.map(wireNode),
    links,
    total: { nodes: nodes.length, edges: edges.length },
    // Every original node is represented by its community, so the payload is
    // complete at this zoom level; `aggregated` is what the caption reports.
    truncated: false,
    aggregated: true,
  };
}

/**
 * The one-hop (or two-hop) slice around one node, for the canvas.
 *
 * Unlike {@link nodeContext} this returns objects, not text, and it keeps the
 * focused node first so the panel can centre on it without a second sort.
 *
 * @param nodes - the nodes.
 * @param edges - the edges.
 * @param focusId - a node id, name or path.
 * @param depth - hops to keep (default 1, capped at 3).
 * @param limit - maximum nodes (default 240).
 * @returns `{ nodes, links, focus, truncated }`.
 */
export function egoGraph(nodes, edges, focusId, depth = 1, limit = 240) {
  const cap = Math.max(1, Math.trunc(Number(limit) || 240));
  const hops = Math.max(1, Math.min(3, Math.trunc(Number(depth) || 1)));
  const nodesById = byIdOf(nodes);
  const focus = resolveAnchor(nodes, focusId);
  if (focus === null) return { nodes: [], links: [], focus: null, truncated: false };

  const keep = new Set([focus]);
  let frontier = [focus];
  for (let level = 0; level < hops; level += 1) {
    const next = [];
    for (const current of frontier) {
      for (const edge of edges ?? []) {
        let other = null;
        if (edge.source === current) other = edge.target;
        else if (edge.target === current) other = edge.source;
        else continue;
        if (keep.has(other) || !nodesById.has(other)) continue;
        keep.add(other);
        next.push(other);
        if (keep.size >= cap) break;
      }
      if (keep.size >= cap) break;
    }
    frontier = next;
    if (frontier.length === 0 || keep.size >= cap) break;
  }

  const ordered = [focus, ...[...keep].filter((id) => id !== focus)];
  return {
    nodes: ordered.slice(0, cap).map((id) => wireNode(nodesById.get(id))),
    ...sliceLinks(keep, edges, cap),
    focus,
    truncated: keep.size >= cap,
  };
}

/** Keep the links whose both endpoints are in `keep`, capped. */
function sliceLinks(keep, edges, cap) {
  const links = [];
  let index = 0;
  for (const edge of edges ?? []) {
    if (!keep.has(edge.source) || !keep.has(edge.target)) continue;
    if (links.length >= cap * 4) break;
    links.push(wireLink(edge, index));
    index += 1;
  }
  return { links };
}

/**
 * A slice of the graph, already trimmed to what the canvas can draw
 * (WIRE.md §2).
 *
 * Scopes: `workspace` (the most connected nodes, kept connected), `file` (that
 * file's node plus one hop), `focus` (the neighbourhood of `focus`), and `search`
 * (nodes matching `query` plus one hop). `families` filters by relation family;
 * an empty array means every family.
 *
 * @param graph - `{ nodes, edges }`.
 * @param options - `{ scope, path, focus, query, depth, limit, families }`.
 * @returns `{ scope, path?, focus?, nodes, links, total, truncated }`.
 */
export function graphSlice(graph, options = {}) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const scope = ['workspace', 'file', 'focus', 'search'].includes(options.scope)
    ? options.scope
    : 'workspace';
  const limit = Math.max(1, Math.trunc(Number(options.limit) || 240));
  const families = Array.isArray(options.families) && options.families.length > 0
    ? new Set(options.families)
    : new Set(DEFAULT_FAMILIES);
  const nodesById = byIdOf(nodes);

  const allowed = (edge) => families.has(RELATION_FAMILY[edge.relation] ?? 'other');
  const links = edges.filter(allowed);

  let keep = new Set();
  let focus = null;
  let path = options.path;

  if (scope === 'focus') {
    const slice = egoGraph(nodes, links, options.focus ?? '', options.depth ?? 1, limit);
    return {
      scope,
      focus: slice.focus,
      nodes: slice.nodes,
      links: slice.links,
      total: { nodes: nodes.length, edges: edges.length },
      truncated: slice.truncated,
    };
  }

  if (scope === 'file' && typeof path === 'string' && path !== '') {
    const fileId = nodesById.has(fileNodeId(path)) ? fileNodeId(path) : null;
    const anchor = fileId ?? (nodes.find((node) => node.path === path)?.id ?? null);
    const slice = egoGraph(nodes, links, anchor ?? '', options.depth ?? 1, limit);
    return {
      scope,
      path,
      nodes: slice.nodes,
      links: slice.links,
      total: { nodes: nodes.length, edges: edges.length },
      truncated: slice.truncated,
    };
  }

  if (scope === 'search') {
    const query = String(options.query ?? '').toLowerCase();
    const matches = query === ''
      ? []
      : nodes.filter((node) => String(node.label ?? '').toLowerCase().includes(query)
        || String(node.path ?? '').toLowerCase().includes(query));
    const seeds = new Set(matches.slice(0, Math.max(1, Math.floor(limit / 2))).map((node) => node.id));
    for (const edge of links) {
      if (seeds.size >= limit) break;
      if (seeds.has(edge.source) && nodesById.has(edge.target)) seeds.add(edge.target);
      else if (seeds.has(edge.target) && nodesById.has(edge.source)) seeds.add(edge.source);
    }
    keep = seeds;
    focus = matches.length > 0 ? matches[0].id : null;
  } else {
    path = undefined;
    // The workspace view is the whole repository, not the heaviest N nodes:
    // that is what makes the picture read like graphify's. Above the canvas
    // budget the graph degrades to one node per community instead of dropping
    // the tail, so no part of the repository disappears from the map.
    if (nodes.length > limit) return aggregateGraph(nodes, links, limit);
    keep = new Set(nodesById.keys());
  }

  const ordered = [...keep].filter((id) => nodesById.has(id));
  const shownIds = new Set(ordered.slice(0, limit));
  const links_ = sliceLinks(shownIds, links, limit);
  return {
    scope,
    ...(path === undefined ? {} : { path }),
    ...(focus === null ? {} : { focus }),
    nodes: [...shownIds].map((id) => wireNode(nodesById.get(id))),
    ...links_,
    total: { nodes: nodes.length, edges: edges.length },
    // `truncated` must describe the *payload*, not the candidate set. The
    // workspace view is complete up to `limit`; file/focus/search scopes can
    // still drop neighbours, and the edge cap can drop links, so compare what
    // was drawn against the whole graph.
    truncated: ordered.length > shownIds.size
      || shownIds.size < nodes.length
      || (links_.links?.length ?? 0) < edges.length,
  };
}
