// Frame store probe: create / dedup / fresh / moved / missing / clamp / delete.
//
// Runs entirely against a throwaway workspace and a throwaway state dir: the
// registry and frame documents are global state, so `CODESLICE_STATE_DIR` is
// pointed at a temp directory before the store is touched, and both scratch
// locations are removed at the end.
//
//   node dev/frames-probe.mjs
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { listFrames, createFrame, deleteFrame, frameId } from '../lib/frames.js';

let passed = 0;
let failed = 0;

const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}${detail === '' ? '' : ` — ${detail}`}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
  }
};

const scratchRoot = join(tmpdir(), `codeslice-frames-probe-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`);
const stateDir = join(tmpdir(), `codeslice-frames-state-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`);
process.env.CODESLICE_STATE_DIR = stateDir;

const SOURCE = Array.from({ length: 40 }, (_, index) => {
  if (index === 9) return 'def detect_communities(graph, seed=0):';
  if (index === 10) return '    """Detect communities with a fixed seed."""';
  if (index === 11) return '    WHY: a fixed seed makes the partition reproducible.';
  if (index >= 12 && index <= 14) return `    step_${index + 1} = ${index + 1} * seed`;
  return `# filler line ${index + 1}`;
}).join('\n');

async function writeSource(text) {
  await fs.mkdir(join(scratchRoot, 'pkg'), { recursive: true });
  await fs.writeFile(join(scratchRoot, 'pkg', 'cluster.py'), text, 'utf8');
}

async function main() {
  console.log('frames probe\n');
  await writeSource(SOURCE);

  /* ---- 1. create + fresh -------------------------------------------- */
  const created = await createFrame(scratchRoot, {
    path: 'pkg/cluster.py', startLine: 10, endLine: 15,
    sessionId: 's_probe', title: '社区划分', question: '为什么固定 seed？',
  });
  check('create returns a wire row', typeof created.id === 'string' && created.id.length === 16, created.id);
  check('create records the requested range', created.startLine === 10 && created.endLine === 15);
  check('create keeps session/title/question',
    created.sessionId === 's_probe' && created.title === '社区划分' && created.question === '为什么固定 seed？');

  let listed = await listFrames(scratchRoot, { sessionId: 's_probe' });
  check('list returns one fresh frame', listed.frames.length === 1, `${listed.frames.length}`);
  const fresh = listed.frames[0];
  check('fresh status on unchanged code', fresh.status === 'fresh', fresh.status);
  check('fresh reports actual span', fresh.actualStart === 10 && fresh.actualEnd === 15,
    `${fresh.actualStart}-${fresh.actualEnd}`);

  /* ---- 2. same-range create dedups, latest wins --------------------- */
  const firstCreatedAt = created.createdAt;
  await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  const again = await createFrame(scratchRoot, {
    path: 'pkg/cluster.py', startLine: 10, endLine: 15,
    sessionId: 's_probe', title: '社区划分（更新）', question: '为什么固定 seed？',
  });
  listed = await listFrames(scratchRoot, {});
  check('duplicate range does not append a row', listed.frames.length === 1, `${listed.frames.length}`);
  check('duplicate keeps the original createdAt', again.createdAt === firstCreatedAt,
    `${again.createdAt} vs ${firstCreatedAt}`);
  check('duplicate overwrites the title', listed.frames[0].title === '社区划分（更新）');
  check('frame id is stable for the same range', again.id === created.id);

  /* ---- 3. moved: the block shifts down three lines ------------------ */
  const shifted = [
    '# inserted line 1',
    '# inserted line 2',
    '# inserted line 3',
    ...SOURCE.split('\n'),
  ].join('\n');
  await writeSource(shifted);
  listed = await listFrames(scratchRoot, {});
  const moved = listed.frames[0];
  check('shifted block is reported moved', moved.status === 'moved', moved.status);
  check('moved reports the new span', moved.actualStart === 13 && moved.actualEnd === 18,
    `${moved.actualStart}-${moved.actualEnd}`);

  /* ---- 4. missing: the file is gone --------------------------------- */
  const gone = await createFrame(scratchRoot, {
    path: 'pkg/does-not-exist.py', startLine: 1, endLine: 3,
    sessionId: 's_probe', title: '不存在的文件', question: '它在哪？',
  });
  listed = await listFrames(scratchRoot, { path: 'pkg/does-not-exist.py' });
  check('missing file reports missing', listed.frames[0].status === 'missing', listed.frames[0].status);
  check('missing omits actual span', listed.frames[0].actualStart === undefined
    && listed.frames[0].actualEnd === undefined);

  /* ---- 5. clamp: range past EOF is clipped -------------------------- */
  const clamped = await createFrame(scratchRoot, {
    path: 'pkg/cluster.py', startLine: 50, endLine: 999,
    sessionId: 's_other', title: '越界区间', question: '末尾是什么？',
  });
  check('create accepts an out-of-range span', typeof clamped.id === 'string');
  listed = await listFrames(scratchRoot, { sessionId: 's_other' });
  const row = listed.frames[0];
  check('clamp keeps the requested stored range', row.startLine === 50 && row.endLine === 999);
  check('clamp reports the in-file actual end', row.actualEnd === shifted.split('\n').length,
    `${row.actualEnd}/${shifted.split('\n').length}`);

  /* ---- 6. filters ---------------------------------------------------- */
  const bySession = await listFrames(scratchRoot, { sessionId: 's_other' });
  check('sessionId filter isolates rows', bySession.frames.length === 1 && bySession.frames[0].id === clamped.id);
  const byPath = await listFrames(scratchRoot, { path: 'pkg/does-not-exist.py' });
  check('path filter isolates rows', byPath.frames.length === 1 && byPath.frames[0].id === gone.id);

  /* ---- 7. delete ----------------------------------------------------- */
  await deleteFrame(scratchRoot, created.id);
  listed = await listFrames(scratchRoot, { sessionId: 's_probe' });
  check('delete removes the row', listed.frames.length === 1, `${listed.frames.length}`);
  let deleteMissing = false;
  try {
    await deleteFrame(scratchRoot, created.id);
  } catch {
    deleteMissing = true;
  }
  check('deleting an unknown frame throws', deleteMissing);

  console.log(`\n=== summary ===\n  ${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    failed += 1;
  })
  .finally(async () => {
    await fs.rm(scratchRoot, { recursive: true, force: true });
    await fs.rm(stateDir, { recursive: true, force: true });
    if (failed > 0) process.exit(1);
  });
