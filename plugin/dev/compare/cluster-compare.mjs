/**
 * Community comparison against the desktop app.
 *
 *   node dev/compare/cluster-compare.mjs [root ...]
 *
 * Two questions, deliberately kept apart, because they have different answers:
 *
 *   1. **Do the naming rules agree?** Feed the desktop's own community
 *      `assignment` into our `summariseCommunities` and compare the resulting
 *      summaries record by record. Any difference here is a bug in our port —
 *      the input is byte-identical, so nothing about Louvain can excuse it.
 *
 *   2. **Do the partitions agree?** Compare our own Louvain result with the
 *      desktop's. Two independent Louvain implementations (networkx in C-backed
 *      Python vs ours in JS) are allowed to disagree on which node lands where;
 *      what must not differ is the *shape* (how many communities, what the
 *      singleton pooling did). Reported as informational, not pass/fail.
 *
 * Exits 1 only when (1) fails. Run it with the desktop backend's venv, which is
 * the only interpreter carrying networkx:
 *
 *   set PYTHONPATH=D:\CodeSplit\backend
 *   node dev/compare/cluster-compare.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDocument, CONFIG_DEFAULTS } from '../../index.js';
import { detectCommunities, summariseCommunities } from '../../lib/cluster.js';

const here = dirname(fileURLToPath(import.meta.url));
const python = resolve('D:/CodeSplit/backend/.venv/Scripts/python.exe');
const backend = resolve('D:/CodeSplit/backend');
const driver = join(here, 'cluster-desktop.py');

const roots = process.argv.slice(2).filter((value) => !value.startsWith('--'));
if (roots.length === 0) roots.push('D:/dsh-CodeSlice');

if (!existsSync(python)) {
  console.error(`cluster-compare: desktop venv not found at ${python}`);
  process.exit(1);
}
if (typeof summariseCommunities !== 'function') {
  console.error('cluster-compare: lib/cluster.js does not export summariseCommunities (see INTERFACES-v3.md §3.5.6)');
  process.exit(1);
}

let failures = 0;
const log = (line) => console.log(line);

/** The desktop's own answer, computed by the desktop's own code. */
function desktopCluster(nodes, edges) {
  const payload = JSON.stringify({
    nodes: nodes.map((node) => ({
      id: node.id, path: node.path, kind: node.kind, label: node.label,
    })),
    edges: edges.map((edge) => ({
      source: edge.source, target: edge.target, relation: edge.relation,
    })),
  });
  const run = spawnSync(python, [driver], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: backend },
    cwd: backend,
  });
  if (run.error !== undefined && run.error !== null) throw run.error;
  if (run.status !== 0) throw new Error(`desktop cluster failed (${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout);
}

/** A comparable projection of one summary list. */
function rows(summaries) {
  return summaries
    .slice()
    .sort((a, b) => (Number(a.id) - Number(b.id)))
    .map((row) => ({
      id: Number(row.id),
      label: String(row.label),
      size: Number(row.size),
      kind: String(row.kind ?? ''),
      pooled: row.pooled === true,
      representative: String(row.representative ?? ''),
    }));
}

for (const root of roots) {
  log(`\n=== ${root} ===`);
  const document = await buildDocument(resolve(root), { ...CONFIG_DEFAULTS });
  const nodes = document.nodes;
  const edges = document.edges;
  log(`graph: ${nodes.length} nodes, ${edges.length} edges`);

  const theirs = desktopCluster(nodes, edges);
  log(`desktop: ${theirs.summaries.length} communities (louvain + summarize)`);

  // ---- 1. naming rules, on identical input ----------------------------
  const oursFromTheirAssignment = summariseCommunities(nodes, edges, theirs.assignment);
  const a = rows(theirs.summaries);
  const b = rows(oursFromTheirAssignment);
  const mismatches = [];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined || right === undefined) {
      mismatches.push(`row ${index}: desktop=${JSON.stringify(left)} ours=${JSON.stringify(right)}`);
      continue;
    }
    for (const field of ['label', 'size', 'kind', 'pooled', 'representative']) {
      if (left[field] !== right[field]) {
        mismatches.push(`#${left.id} ${field}: desktop=${JSON.stringify(left[field])} ours=${JSON.stringify(right[field])}`);
      }
    }
  }
  if (mismatches.length === 0) {
    log(`naming rules: identical on ${a.length} communities (label/size/kind/pooled/representative)`);
  } else {
    log(`naming rules: ${mismatches.length} difference(s) on identical input`);
    for (const line of mismatches.slice(0, 20)) log(`  ${line}`);
    failures += 1;
  }

  // ---- 2. partitions, informational -----------------------------------
  const oursOwnSummaries = detectCommunities(nodes, edges, 0);
  log(`ours:    ${oursOwnSummaries.length} communities (our louvain)`);
  const oursRows = rows(oursOwnSummaries);
  const shapeMatch = oursRows.length === a.length;
  const labelOverlap = new Set(a.map((row) => row.label));
  const shared = oursRows.filter((row) => labelOverlap.has(row.label)).length;
  log(`partition shape: ${shapeMatch ? 'same community count' : `count differs (${a.length} vs ${oursRows.length}) — informational`}`);
  log(`label overlap: ${shared}/${oursRows.length} of our labels also appear on the desktop side`);
  const pooledOurs = oursRows.filter((row) => row.pooled).length;
  const pooledTheirs = a.filter((row) => row.pooled).length;
  log(`pooled bucket: desktop=${pooledTheirs} ours=${pooledOurs}`);
  log('--- desktop labels ---');
  for (const row of a) log(`  ${row.id}\t${row.size}\t${row.label}${row.pooled ? '  (pooled)' : ''}`);
  log('--- our labels (our louvain) ---');
  for (const row of oursRows) log(`  ${row.id}\t${row.size}\t${row.label}${row.pooled ? '  (pooled)' : ''}`);
}

log(`\ncluster-compare: ${failures === 0 ? 'naming rules match' : `${failures} root(s) differ`}`);
process.exit(failures === 0 ? 0 : 1);
