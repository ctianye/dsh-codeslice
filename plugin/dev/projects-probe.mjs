// Project registry probe: remember / list / rename / forget, id stability, and
// per-root isolation.
//
// The registry is global, so `CODESLICE_STATE_DIR` is pointed at a throwaway
// directory before any store call; both the state dir and the scratch roots are
// removed at the end.
//
//   node dev/projects-probe.mjs
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { listProjects, rememberProject, renameProject, forgetProject, projectId } from '../lib/projects.js';

let passed = 0;
let failed = 0;

function statsMatch(actual, expected) {
  return ['files', 'lines', 'nodes', 'edges', 'communities']
    .every((key) => actual[key] === expected[key]);
}

const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}${detail === '' ? '' : ` — ${detail}`}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
  }
};

const stateDir = join(tmpdir(), `codeslice-projects-state-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`);
const rootA = join(tmpdir(), `codeslice-proj-a-${randomUUID().slice(0, 6)}`);
const rootB = join(tmpdir(), `codeslice-proj-b-${randomUUID().slice(0, 6)}`);
process.env.CODESLICE_STATE_DIR = stateDir;

function fakeDocument(root, stats) {
  return {
    root,
    builtAt: Date.now(),
    files: stats.files.map((path) => ({ path })),
    lineCount: stats.lines,
    nodes: Array.from({ length: stats.nodes }, () => ({})),
    edges: Array.from({ length: stats.edges }, () => ({})),
    communities: Array.from({ length: stats.communities }, () => ({})),
  };
}

async function main() {
  console.log('projects probe\n');
  await fs.mkdir(rootA, { recursive: true });
  await fs.mkdir(rootB, { recursive: true });

  /* ---- 1. remember + list ------------------------------------------- */
  const rowA = await rememberProject(fakeDocument(rootA, { files: ['a.js'], lines: 120, nodes: 30, edges: 18, communities: 4 }));
  check('remember returns a row', typeof rowA.id === 'string' && rowA.root === resolve(rootA));
  check('project id is 16 hex', /^[0-9a-f]{16}$/u.test(rowA.id), rowA.id);
  check('stats are projected', statsMatch(rowA.stats, { files: 1, lines: 120, nodes: 30, edges: 18, communities: 4 }),
    JSON.stringify(rowA.stats));
  check('default name is the basename', rowA.name === resolve(rootA).split(/[\\/]/u).pop());

  const rowB = await rememberProject(fakeDocument(rootB, { files: ['b.py'], lines: 80, nodes: 12, edges: 6, communities: 2 }));
  check('two roots get distinct ids', rowA.id !== rowB.id);

  let { projects } = await listProjects();
  check('list returns both rows', projects.length === 2, `${projects.length}`);
  check('list sorts newest build first', projects[0].id === rowB.id, projects.map((row) => row.id).join(','));

  /* ---- 2. id stability + refresh keeps the custom name -------------- */
  const refreshed = await rememberProject(fakeDocument(rootA, { files: ['a.js', 'a2.js'], lines: 140, nodes: 34, edges: 20, communities: 4 }));
  check('re-remember keeps the same id', refreshed.id === rowA.id);
  check('re-remember refreshes stats', refreshed.stats.files === 2 && refreshed.stats.lines === 140);
  check('projectId matches the registry id', projectId(rootA) === rowA.id);

  /* ---- 3. rename ------------------------------------------------------ */
  const renamed = await renameProject(rowA.id, '  我的实验项目  ');
  check('rename trims and stores the name', renamed.name === '我的实验项目');
  ({ projects } = await listProjects());
  check('rename persists in the registry', projects.find((row) => row.id === rowA.id)?.name === '我的实验项目');

  let renameMissing = false;
  try {
    await renameProject('nope_not_a_real_id', 'x');
  } catch {
    renameMissing = true;
  }
  check('renaming an unknown project throws', renameMissing);

  /* ---- 4. forget ------------------------------------------------------ */
  await forgetProject(rowB.id);
  ({ projects } = await listProjects());
  check('forget removes the row', projects.length === 1 && projects[0].id === rowA.id);

  let forgetMissing = false;
  try {
    await forgetProject(rowB.id);
  } catch {
    forgetMissing = true;
  }
  check('forgetting an unknown project throws', forgetMissing);

  console.log(`\n=== summary ===\n  ${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    failed += 1;
  })
  .finally(async () => {
    await fs.rm(rootA, { recursive: true, force: true });
    await fs.rm(rootB, { recursive: true, force: true });
    await fs.rm(stateDir, { recursive: true, force: true });
    if (failed > 0) process.exit(1);
  });
