/**
 * Community detection over the code graph.
 *
 * The original calls `networkx.community.louvain_communities(connected,
 * weight=None, seed=0)` (`cluster.py:66`). networkx cannot be a dependency here,
 * so Louvain is implemented below: local moving that maximises modularity on an
 * undirected **simple** (parallel edges collapsed) **unweighted** graph, then
 * aggregation, repeated until a pass stops gaining.
 *
 * Determinism is the hard requirement (DESIGN §5.2): the colours must not
 * reshuffle when an unchanged project is reindexed. Two things make that hold —
 * nodes are iterated in the insertion order the resolver produced
 * (`(-degree, path, start_line)`), and the only randomness (the visit order inside
 * a pass) comes from an LCG seeded with the caller's `seed`.
 *
 * Everything *after* the clustering is ported exactly, because it is observable:
 * the singleton pooling rule, the `(-size, min member id)` ordering, the
 * majority-file label, the `" · "` duplicate disambiguation, and
 * {@link applyCommunities}. Community **ids** may differ from a Python build; ids
 * are not a contract, labels and grouping are.
 */

import { createHash } from 'node:crypto';

/* ------------------------------------------------------------------ *
 * Constants                                                          *
 * ------------------------------------------------------------------ */

/** A singleton community is noise, not a grouping: pool it. */
export const MIN_COMMUNITY_SIZE = 2;

/**
 * Label for the pooled stragglers. Kept in Chinese because it is rendered as-is
 * in the legend; an English "Uncategorised" would read as a category name to a
 * user reading the rest of the interface in Chinese.
 */
export const POOLED_LABEL = '未分类';

/** `LAYOUT_VERSION` for {@link topologyKey} (`store.py:112-141`). */
export const LAYOUT_VERSION = 3;

/* ------------------------------------------------------------------ *
 * Deterministic PRNG                                                 *
 * ------------------------------------------------------------------ */

/**
 * A 32-bit linear congruential generator (Numerical Recipes constants).
 *
 * Used only to shuffle the node visit order inside a Louvain pass. It is a tiny,
 * fully specified generator on purpose: `Math.random` would make the build
 * non-reproducible, and a stronger PRNG buys nothing for a shuffle.
 *
 * @param seed - any integer; 0 is what the original passes.
 * @returns a function yielding floats in `[0, 1)`.
 */
function makeRandom(seed) {
  let state = (Math.trunc(Number(seed) || 0) >>> 0) || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/* ------------------------------------------------------------------ *
 * Graph representation                                               *
 * ------------------------------------------------------------------ */

/**
 * A weighted undirected graph as adjacency maps.
 *
 * Conventions that keep the modularity arithmetic honest:
 * - a self-loop of weight `w` is stored as `w` and counts **twice** toward the
 *   node's strength, matching `networkx`'s degree definition;
 * - therefore `2m` (the modularity denominator) is the sum of all strengths.
 *
 * @param size - number of nodes.
 * @param triples - `[source, target, weight]` in index space.
 * @returns `{ neighbours, strength }` where `neighbours[i]` is `Map(j → weight)`.
 */
function makeGraph(size, triples) {
  const neighbours = Array.from({ length: size }, () => new Map());
  const add = (a, b, weight) => {
    neighbours[a].set(b, (neighbours[a].get(b) ?? 0) + weight);
  };
  for (const [a, b, weight] of triples) {
    if (a === b) {
      add(a, a, weight * 2);
    } else {
      add(a, b, weight);
      add(b, a, weight);
    }
  }
  const strength = neighbours.map((row) => {
    let total = 0;
    for (const weight of row.values()) total += weight;
    return total;
  });
  return { neighbours, strength };
}

/**
 * Collapse parallel edges, which is what `networkx.Graph` does for the original.
 *
 * Two files that both import **and** call each other must count once, or that
 * pair would look twice as tightly bound as one that only imports.
 *
 * @param size - number of nodes.
 * @param pairs - `[{ source, target }]` index pairs, duplicates allowed.
 * @returns `{ neighbours, strength }` with every weight 1.
 */
function simpleGraph(size, pairs) {
  const seen = new Set();
  const triples = [];
  for (const pair of pairs) {
    const a = Math.min(pair.source, pair.target);
    const b = Math.max(pair.source, pair.target);
    const key = `${a}\u0000${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    triples.push([a, b, 1]);
  }
  return makeGraph(size, triples);
}

/**
 * networkx simple-graph degree: distinct undirected neighbors, a self-loop counts
 * twice.
 *
 * `nx.Graph` collapses parallel edges — one endpoint pair keeps a single adjacency
 * — so two relation edges between the same pair (e.g. a `calls` and an `imports`)
 * count once toward degree, not twice. `a→b` and `b→a` are the same undirected
 * pair. A self-loop still contributes 2, matching `graph.degree()`.
 *
 * @param nodeList - ordered nodes.
 * @param edgeList - edge records `{ source, target }`.
 * @returns `Map(nodeId → degree)`.
 */
function simpleDegree(nodeList, edgeList) {
  const degreeOf = new Map(nodeList.map((node) => [node.id, 0]));
  const neighbours = new Map(nodeList.map((node) => [node.id, new Set()]));
  const selfLoops = new Set();
  for (const edge of Array.isArray(edgeList) ? edgeList : []) {
    const source = String(edge?.source ?? '');
    const target = String(edge?.target ?? '');
    if (!degreeOf.has(source) || !degreeOf.has(target)) continue;
    if (source === target) {
      selfLoops.add(source);
      continue;
    }
    neighbours.get(source).add(target);
    neighbours.get(target).add(source);
  }
  for (const node of nodeList) {
    let degree = neighbours.get(node.id).size;
    if (selfLoops.has(node.id)) degree += 2;
    degreeOf.set(node.id, degree);
  }
  return degreeOf;
}

/* ------------------------------------------------------------------ *
 * Louvain                                                            *
 * ------------------------------------------------------------------ */

/**
 * One local-moving sweep (`cluster.py`'s `louvain_communities` inner loop).
 *
 * Each node is moved to the neighbouring community with the largest modularity
 * gain, repeatedly, until a full pass changes nothing. A move is accepted only on
 * a strict gain, with ties broken toward the smaller community id so the result
 * cannot depend on `Map` iteration order.
 *
 * @param graph - `{ neighbours, strength }`.
 * @param resolution - modularity resolution (1.0, the networkx default).
 * @param random - seeded PRNG supplying the visit order.
 * @returns `{ assignment, moved }` where `assignment[i]` is node `i`'s community.
 */
function localMoving(graph, resolution, random) {
  const { neighbours, strength } = graph;
  const size = neighbours.length;
  const assignment = new Int32Array(size);
  const communityStrength = new Float64Array(size);
  let twoM = 0;
  for (let i = 0; i < size; i += 1) {
    assignment[i] = i;
    communityStrength[i] = strength[i];
    twoM += strength[i];
  }
  if (twoM === 0) return { assignment, moved: false };

  const order = new Int32Array(size);
  for (let i = 0; i < size; i += 1) order[i] = i;
  for (let i = size - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }

  let moved = false;
  let improved = true;
  let rounds = 0;
  const maxRounds = 100;

  while (improved && rounds < maxRounds) {
    improved = false;
    rounds += 1;
    for (let k = 0; k < size; k += 1) {
      const node = order[k];
      const own = assignment[node];
      const ownStrength = communityStrength[own];
      const nodeStrength = strength[node];

      /** Weight of this node's edges into each neighbouring community. */
      const into = new Map();
      for (const [other, weight] of neighbours[node]) {
        const target = assignment[other];
        into.set(target, (into.get(target) ?? 0) + weight);
      }

      // Gain of staying: only the links to the rest of the own community matter,
      // because the node's own strength is present on both sides of the formula.
      const weightIntoOwn = into.get(own) ?? 0;
      const selfLoop = neighbours[node].get(node) ?? 0;
      const baseGain = (weightIntoOwn - selfLoop)
        - (resolution * nodeStrength * (ownStrength - nodeStrength)) / twoM;

      let best = own;
      let bestGain = baseGain;
      for (const [community, weight] of into) {
        if (community === own) continue;
        const gain = weight
          - (resolution * nodeStrength * communityStrength[community]) / twoM;
        if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && community < best)) {
          best = community;
          bestGain = gain;
        }
      }

      if (best !== own) {
        communityStrength[own] -= nodeStrength;
        communityStrength[best] += nodeStrength;
        assignment[node] = best;
        moved = true;
        improved = true;
      }
    }
  }

  return { assignment, moved };
}

/**
 * Louvain community detection: local moving, aggregate, repeat until no gain.
 *
 * @param size - number of nodes, in insertion order.
 * @param pairs - `[{ source, target }]` index pairs (duplicates collapse).
 * @param seed - PRNG seed; the original passes 0.
 * @returns an `Int32Array` of community labels, one per node, dense from 0.
 */
function louvain(size, pairs, seed) {
  const random = makeRandom(seed);
  if (size === 0) return new Int32Array(0);

  let graph = simpleGraph(size, pairs);
  /** `origin[i]` = original node indices represented by current node `i`. */
  let origin = Array.from({ length: size }, (_, index) => [index]);
  let membership = new Int32Array(size);
  for (let i = 0; i < size; i += 1) membership[i] = i;

  for (let level = 0; level < 20; level += 1) {
    const { assignment, moved } = localMoving(graph, 1.0, random);
    if (!moved) break;

    // Renumber densely in ascending first-member order, so the aggregate is
    // deterministic even though communities are discovered in visit order.
    const remap = new Map();
    for (let i = 0; i < graph.neighbours.length; i += 1) {
      if (!remap.has(assignment[i])) remap.set(assignment[i], remap.size);
    }
    const nextSize = remap.size;
    if (nextSize === graph.neighbours.length) break;

    // Aggregate: weight between two communities is half the ordered-pair sum,
    // because the adjacency stores both directions for a non-self edge.
    const weights = new Map();
    for (let i = 0; i < graph.neighbours.length; i += 1) {
      const from = remap.get(assignment[i]);
      for (const [other, weight] of graph.neighbours[i]) {
        const to = remap.get(assignment[other]);
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const key = `${lo}\u0000${hi}`;
        weights.set(key, (weights.get(key) ?? 0) + weight / 2);
      }
    }
    const triples = [];
    const nextOrigin = Array.from({ length: nextSize }, () => []);
    for (let i = 0; i < graph.neighbours.length; i += 1) {
      const group = remap.get(assignment[i]);
      for (const original of origin[i]) nextOrigin[group].push(original);
    }
    for (const [key, weight] of weights) {
      const [lo, hi] = key.split('\u0000').map(Number);
      triples.push([lo, hi, weight]);
    }

    // Compose this level's labels onto the original nodes.
    for (let i = 0; i < graph.neighbours.length; i += 1) {
      const group = remap.get(assignment[i]);
      for (const original of origin[i]) membership[original] = group;
    }

    graph = makeGraph(nextSize, triples);
    origin = nextOrigin;
    if (nextSize <= 1) break;
  }

  return membership;
}

/* ------------------------------------------------------------------ *
 * Community detection                                                *
 * ------------------------------------------------------------------ */

/**
 * Assign every node a community and summarise each community
 * (`cluster.py:40-110`).
 *
 * Steps, in order:
 * 1. Nodes with no incident edge are separated out first — a project with many
 *    standalone config files must not report forty one-member communities.
 * 2. Louvain runs on the connected remainder.
 * 3. Every group smaller than {@link MIN_COMMUNITY_SIZE} is pooled with the
 *    isolated nodes into one explicitly-labelled community.
 * 4. Groups are ordered `(-size, min member id)`, so ids are stable for an
 *    unchanged graph; the pooled group is always last.
 * 5. Duplicate labels are disambiguated with a representative symbol.
 *
 * @param nodes - the resolver's ordered nodes.
 * @param edges - the resolver's edges.
 * @param seed - PRNG seed; 0 matches the original.
 * @returns `[{ id, label, size, hub, kind, pooled, representative, members }]`,
 *   in community-id order. `members` is what {@link applyCommunities} consumes;
 *   the original carried the assignment in a parallel map.
 */
export function detectCommunities(nodes, edges, seed = 0) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  if (nodeList.length === 0) return [];

  const indexOf = new Map();
  nodeList.forEach((node, index) => indexOf.set(node.id, index));

  // networkx simple-graph degree: parallel endpoint pairs collapse, self-loop ×2.
  const degreeOf = simpleDegree(nodeList, edgeList);
  const pairs = [];
  for (const edge of edgeList) {
    const source = indexOf.get(edge.source);
    const target = indexOf.get(edge.target);
    if (source === undefined || target === undefined) continue;
    pairs.push({ source, target });
  }

  const connected = [];
  const isolated = [];
  for (let i = 0; i < nodeList.length; i += 1) {
    if ((degreeOf.get(nodeList[i].id) ?? 0) > 0) connected.push(i);
    else isolated.push(nodeList[i].id);
  }

  /** Louvain groups, as arrays of node ids. */
  let groups = [];
  if (connected.length > 0) {
    try {
      const localIndex = new Map();
      connected.forEach((original, index) => localIndex.set(original, index));
      const localPairs = pairs
        .filter((pair) => localIndex.has(pair.source) && localIndex.has(pair.target))
        .map((pair) => ({ source: localIndex.get(pair.source), target: localIndex.get(pair.target) }));
      const membership = louvain(connected.length, localPairs, seed);
      const byCommunity = new Map();
      for (let i = 0; i < connected.length; i += 1) {
        const id = membership[i];
        const list = byCommunity.get(id);
        if (list === undefined) byCommunity.set(id, [nodeList[connected[i]].id]);
        else list.push(nodeList[connected[i]].id);
      }
      groups = [...byCommunity.values()];
    } catch {
      // A degenerate graph (self loops only, or one node) degrades to one big
      // community, never a failed build (`cluster.py:68-72`).
      groups = [connected.map((index) => nodeList[index].id)];
    }
  }

  const nodeById = new Map(nodeList.map((node) => [node.id, node]));
  return finaliseCommunities(groups, isolated, nodeById, degreeOf);
}

/**
 * Re-apply the desktop's community rules to an assignment that already exists.
 *
 * `graphify` names and pools communities its own way. The panel's legend is the
 * desktop's, so the grouping it shows must follow the same observable rules:
 * zero-degree nodes are pooled into {@link POOLED_LABEL}, communities smaller
 * than {@link MIN_COMMUNITY_SIZE} join them, ids are reassigned by
 * `(-size, min member id)`, and names come from the majority file. Graphify's
 * *membership* is kept — only ordering, pooling and labels are rewritten — so
 * the canvas still clusters the way the extractor found the code.
 *
 * @param nodes - nodes carrying a `community` id (mutated only via {@link applyCommunities}).
 * @param edges - the edge list, used for degree and isolated-node detection.
 * @returns summaries shaped like {@link detectCommunities}'.
 */
export function refineCommunities(nodes, edges) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  if (nodeList.length === 0) return [];

  const nodeById = new Map(nodeList.map((node) => [node.id, node]));
  const degreeOf = simpleDegree(nodeList, edges);

  const byCommunity = new Map();
  const isolated = [];
  for (const node of nodeList) {
    if ((degreeOf.get(node.id) ?? 0) === 0) {
      isolated.push(node.id);
      continue;
    }
    const cid = Number.isFinite(Number(node.community)) ? Number(node.community) : 0;
    const group = byCommunity.get(cid);
    if (group === undefined) byCommunity.set(cid, [node.id]);
    else group.push(node.id);
  }
  return finaliseCommunities([...byCommunity.values()], isolated, nodeById, degreeOf);
}

/**
 * Pure labelling over an existing assignment (INTERFACES-v3.md §3.5.6).
 *
 * This is the comparison half of the desktop parity check: the desktop's own
 * networkx Louvain `assignment` (`{nodeId: cid}`) is fed back in, and this
 * recomputes the summaries with the same pooling / ordering / naming rules as
 * {@link detectCommunities}. It deliberately does **not** run Louvain: the
 * contract compares labels on identical input, not the two partitions point by
 * point.
 *
 * @param nodes - the resolver's nodes.
 * @param edges - the edge list, used for degree and isolated-node detection.
 * @param assignment - `{ nodeId: communityId }` from another implementation.
 * @returns summaries shaped like {@link detectCommunities}'.
 */
export function summariseCommunities(nodes, edges, assignment) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  if (nodeList.length === 0) return [];

  const nodeById = new Map(nodeList.map((node) => [node.id, node]));
  const degreeOf = simpleDegree(nodeList, edges);

  const assignmentMap = assignment !== null && typeof assignment === 'object' ? assignment : {};
  const byCommunity = new Map();
  const isolated = [];
  for (const node of nodeList) {
    if ((degreeOf.get(node.id) ?? 0) === 0) {
      isolated.push(node.id);
      continue;
    }
    const cid = Object.prototype.hasOwnProperty.call(assignmentMap, node.id) ? assignmentMap[node.id] : 0;
    const key = String(cid);
    const group = byCommunity.get(key);
    if (group === undefined) byCommunity.set(key, [node.id]);
    else group.push(node.id);
  }
  return finaliseCommunities([...byCommunity.values()], isolated, nodeById, degreeOf);
}

/**
 * Pool, order, name and de-duplicate communities.
 *
 * Shared by {@link detectCommunities} (groups it just found) and
 * {@link refineCommunities} (groups an extractor supplied), so the two backends
 * cannot drift into two legends.
 *
 * @param groups - arrays of member ids.
 * @param isolated - zero-degree member ids, pooled regardless of their group.
 * @param nodeById - `node id → node`.
 * @param degreeOf - `node id → degree`.
 * @returns the summaries.
 */
function finaliseCommunities(groups, isolated, nodeById, degreeOf) {
  // ---- singleton pooling ------------------------------------------------
  const large = groups.filter((group) => group.length >= MIN_COMMUNITY_SIZE);
  const pooled = new Set(isolated);
  for (const group of groups) {
    if (group.length < MIN_COMMUNITY_SIZE) for (const id of group) pooled.add(id);
  }

  // ---- ordering and id assignment ---------------------------------------
  const ordered = large.slice().sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const minA = a.slice().sort()[0] ?? '';
    const minB = b.slice().sort()[0] ?? '';
    return minA < minB ? -1 : minA > minB ? 1 : 0;
  });

  const summaries = [];
  ordered.forEach((group, cid) => summaries.push(summarise(cid, group, nodeById, degreeOf, false)));
  if (pooled.size > 0) {
    summaries.push(summarise(ordered.length, [...pooled], nodeById, degreeOf, true));
  }

  // ---- duplicate-label disambiguation -----------------------------------
  // Two communities can be named after the same dominant file (one large cluster
  // and one small satellite in the same module). Two identical legend rows in
  // different colours read as a bug, so each duplicate gets a representative.
  const byLabel = new Map();
  for (const summary of summaries) {
    const list = byLabel.get(summary.label);
    if (list === undefined) byLabel.set(summary.label, [summary]);
    else list.push(summary);
  }
  for (const [label, duplicates] of byLabel) {
    if (duplicates.length < 2) continue;
    for (const summary of duplicates) {
      if (summary.representative !== '' && summary.representative !== label) {
        summary.label = `${label} · ${summary.representative}`;
      }
    }
  }

  return summaries;
}

/**
 * Name a community after the file most of its members live in
 * (`cluster.py:113-177`).
 *
 * Naming it after the most-connected *node* reads badly: the hub of a storage
 * cluster is often `NotFound` or `get_conn`, so the legend would be labelled with
 * an exception class. The file that owns the majority of the members is what the
 * user recognises as the subsystem.
 *
 * The tie-breaks are ported exactly, because they decide the label: majority file
 * by `(count, path)` with the **larger** path string winning, and hub by
 * `(degree, id)` with the **larger** id winning.
 *
 * @param cid - the community id.
 * @param members - its member node ids.
 * @param nodeById - `node id → node`.
 * @param degreeOf - `node id → degree`.
 * @param pooled - whether this is the pooled straggler group.
 * @returns the summary record.
 */
function summarise(cid, members, nodeById, degreeOf, pooled) {
  const sorted = members.slice().sort();

  const fileCounts = new Map();
  for (const id of sorted) {
    const path = String(nodeById.get(id)?.path ?? '').trim();
    if (path === '') continue;
    fileCounts.set(path, (fileCounts.get(path) ?? 0) + 1);
  }

  /** `max(key=(degree, id))`: the larger id wins a degree tie. */
  const maxByDegree = (ids) => {
    let best = ids[0];
    for (const id of ids) {
      const a = degreeOf.get(id) ?? 0;
      const b = degreeOf.get(best) ?? 0;
      if (a > b || (a === b && id > best)) best = id;
    }
    return best;
  };

  let label = POOLED_LABEL;
  let kind = '';
  let hub = maxByDegree(sorted);

  if (!pooled && fileCounts.size > 0) {
    let bestPath = null;
    let bestCount = -1;
    for (const [path, count] of fileCounts) {
      if (count > bestCount || (count === bestCount && (bestPath === null || path > bestPath))) {
        bestPath = path;
        bestCount = count;
      }
    }
    label = bestPath.slice(bestPath.lastIndexOf('/') + 1);
    // Cross-file community: saying so avoids the impression that this is one
    // file's internals.
    if (fileCounts.size > 1) label = `${label} +${fileCounts.size - 1}`;
    kind = 'file';
    // Anchor on that file's own node when it has one, so selecting the community
    // lands somewhere meaningful.
    const fileNode = sorted.find((id) => nodeById.get(id)?.kind === 'file'
      && String(nodeById.get(id)?.path ?? '') === bestPath);
    if (fileNode !== undefined) hub = fileNode;
  }
  if (kind === '') kind = String(nodeById.get(hub)?.kind ?? '');

  // Highest-degree real symbol, used only to disambiguate duplicate labels.
  const symbols = sorted.filter((id) => {
    const nodeKind = nodeById.get(id)?.kind;
    return nodeKind === 'function' || nodeKind === 'class';
  });
  const representative = symbols.length > 0
    ? String(nodeById.get(maxByDegree(symbols))?.label ?? '')
    : '';

  return { id: cid, label, size: sorted.length, hub, kind, pooled, representative, members: sorted };
}

/**
 * Copy `community` and `community_label` onto every node (`cluster.py:180-191`).
 *
 * Mutates the node objects **and** returns the array, because the original
 * mutates in place while returning a new list, and both call styles are in use.
 * A node with no assignment silently joins community 0, as in the original.
 *
 * @param nodes - the resolver's nodes.
 * @param edges - accepted for symmetry with the original; never modified.
 * @param communities - the summaries from {@link detectCommunities}.
 * @returns the same node array, with the community fields filled in.
 */
export function applyCommunities(nodes, edges, communities) {
  void edges;
  const labels = new Map((communities ?? []).map((summary) => [summary.id, summary.label]));
  const assignment = new Map();
  for (const summary of communities ?? []) {
    for (const id of summary.members ?? []) assignment.set(id, summary.id);
  }
  for (const node of nodes ?? []) {
    const cid = assignment.get(node.id) ?? 0;
    node.community = cid;
    node.community_label = labels.get(cid) ?? '';
    // The wire shape (WIRE.md §2) spells it camelCase; both are carried so the
    // panel and the tool renderer never disagree.
    node.communityLabel = node.community_label;
  }
  return nodes ?? [];
}

/* ------------------------------------------------------------------ *
 * Topology key                                                       *
 * ------------------------------------------------------------------ */

/**
 * A 32-hex-character fingerprint of the graph's *shape* (`store.py:112-141`).
 *
 * Lets the browser cache force-layout coordinates: recolouring does not
 * invalidate a layout, adding one edge does. Community assignment, labels and note
 * titles deliberately do not participate.
 *
 * Exact algorithm — byte-for-byte what the Python writes, so one cached layout
 * stays valid across both implementations:
 *
 * ```
 * h = sha256("layout-v3" + 0x00)
 * for node in nodes sorted by id:          h += id + 0x00
 * for edge in edges sorted by (source, target, relation):
 *                                          h += source + 0x01 + target + 0x01
 *                                             + relation + 0x00
 * return hex(h) sliced to 32 characters
 * ```
 *
 * @param nodes - the nodes; only `id` participates.
 * @param edges - the edges; only `source`, `target` and `relation` participate.
 * @returns the first 32 hex characters of the digest.
 */
export function topologyKey(nodes, edges) {
  const hash = createHash('sha256');
  hash.update(`layout-v${LAYOUT_VERSION}`);
  hash.update(Buffer.from([0x00]));

  const ids = (nodes ?? []).map((node) => String(node.id ?? '')).sort();
  for (const id of ids) {
    hash.update(id, 'utf8');
    hash.update(Buffer.from([0x00]));
  }

  const rows = (edges ?? [])
    .map((edge) => [String(edge.source ?? ''), String(edge.target ?? ''), String(edge.relation ?? '')])
    .sort((a, b) => {
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
      if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
      return 0;
    });
  for (const [source, target, relation] of rows) {
    hash.update(source, 'utf8');
    hash.update(Buffer.from([0x01]));
    hash.update(target, 'utf8');
    hash.update(Buffer.from([0x01]));
    hash.update(relation, 'utf8');
    hash.update(Buffer.from([0x00]));
  }

  return hash.digest('hex').slice(0, 32);
}
