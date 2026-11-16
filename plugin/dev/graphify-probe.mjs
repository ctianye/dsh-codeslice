// Integration probe for the optional graphify source. It needs the `graphify`
// CLI on PATH; when it is absent the probe skips instead of failing, because the
// plugin's built-in analyzer is the supported fallback.
//
//   node dev/graphify-probe.mjs
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphifyGraph } from '../lib/graphify.js';

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`ok   ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

const root = await mkdtemp(join(tmpdir(), 'codeslice-graphify-'));
try {
  await writeFile(join(root, 'a.js'), [
    'export function alpha() { return beta() }',
    'export function beta() { return 1 }',
    'export const gamma = () => alpha()',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'b.js'), [
    'import { alpha } from "./a.js"',
    'export function run() { return alpha() }',
  ].join('\n'), 'utf8');

  let adapted;
  try {
    adapted = await graphifyGraph(root, { graphifyPath: 'graphify', graphifyTimeoutMs: 120000 });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.log('skip: graphify is not installed; the built-in analyzer remains the fallback');
      process.exit(0);
    }
    throw error;
  }

  check('graphify returns nodes', adapted.nodes.length > 0, String(adapted.nodes.length));
  check('graphify returns edges', adapted.edges.length > 0, String(adapted.edges.length));
  check('graphify nodes carry a path and line',
    adapted.nodes.every((node) => node.path !== '' && node.start_line >= 0));
  check('graphify has a call edge', adapted.edges.some((edge) => edge.relation === 'calls'));
  check('graphify adds communities', adapted.communities.length > 0, String(adapted.communities.length));
  check('graphify communities use desktop-style labels',
    adapted.communities.every((row) => typeof row.label === 'string' && row.label !== '')
      && adapted.nodes.every((node) => typeof node.communityLabel === 'string')
      && adapted.communities.some((row) => /\.\w+$/u.test(row.label) || row.label === '未分类'),
    adapted.communities.map((row) => row.label).join(', '));
  check('graphify maps a function', adapted.nodes.some((node) => node.kind === 'function' && node.label.includes('alpha')));
  check('graphify reports its source', adapted.stats.source === 'graphify');

  // A bad executable must reject rather than silently succeed; the build path
  // catches it and falls back to the built-in analyzer.
  let rejected = false;
  try {
    await graphifyGraph(root, { graphifyPath: 'definitely-not-a-real-binary-xyz', graphifyTtlMs: 0 });
  } catch {
    rejected = true;
  }
  check('a missing graphify binary rejects', rejected);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\ngraphify probe: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
