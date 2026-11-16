// Build the lazy CodeMirror chunk (`client/editor.js`) from
// `client/editor-src/entry.js`.
//
//   node dev/build-editor.mjs           # write client/editor.js
//   node dev/build-editor.mjs --check   # exit 1 if the committed chunk is stale
//
// The plugin itself has no runtime dependencies and its main bundle is built by
// `build-client.mjs` (a deterministic concatenator, not a bundler). CodeMirror
// is the one dependency that genuinely needs a bundler, so it lives in its own
// chunk, is fetched only when a file is opened, and is produced by esbuild.
//
// Resolution: esbuild is not vendored in this repository. The script looks for
// it on PATH / in `node_modules/.bin` / in the DSH profile, and resolves the
// CodeMirror packages from the DSH profile's node_modules (where the sidebar
// plugin already installs them) or `CODESLICE_NODE_MODULES`. A release build
// only needs the committed `client/editor.js`; rebuilding it needs esbuild.
//
// Out-of-tree inputs are a developer-time dependency, never a runtime one: the
// emitted chunk is self-contained and shipped in `files`.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, '..');
const entry = join(pluginDir, 'client', 'editor-src', 'entry.js');
const output = join(pluginDir, 'client', 'editor.js');
const temp = join(pluginDir, 'client', 'editor.build.js');

/** First existing executable candidate, or an empty string. */
function findEsbuild() {
  const win = process.platform === 'win32';
  const candidates = [
    process.env.ESBUILD_BIN,
    win ? 'D:/CodeSplit/frontend/node_modules/@esbuild/win32-x64/esbuild.exe' : undefined,
    join(pluginDir, 'node_modules', '@esbuild', win ? 'win32-x64' : `${process.platform}-${process.arch}`, win ? 'esbuild.exe' : 'bin/esbuild'),
    join(pluginDir, 'node_modules', '.bin', win ? 'esbuild.cmd' : 'esbuild'),
    win ? 'D:/CodeSplit/frontend/node_modules/.bin/esbuild.cmd' : 'D:/CodeSplit/frontend/node_modules/.bin/esbuild',
  ].filter((candidate) => typeof candidate === 'string' && candidate !== '');
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

/** node_modules that already carries the CodeMirror packages. */
function findNodeModules() {
  const candidates = [
    process.env.CODESLICE_NODE_MODULES,
    'C:/Users/cheng/.dsh/profiles/desktop/node_modules',
    join(pluginDir, 'node_modules'),
  ].filter((candidate) => typeof candidate === 'string' && candidate !== '');
  for (const candidate of candidates) {
    if (existsSync(join(candidate, '@codemirror', 'state'))) return candidate;
  }
  return '';
}

const esbuild = findEsbuild();
if (esbuild === '') {
  console.error('build-editor: esbuild not found. Set ESBUILD_BIN to the esbuild executable.');
  process.exit(1);
}
const nodeModules = findNodeModules();
if (nodeModules === '') {
  console.error('build-editor: CodeMirror packages not found. Set CODESLICE_NODE_MODULES to a node_modules carrying @codemirror/*.');
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');
const target = checkOnly ? temp : output;
const banner = `/* CodeSlice editor chunk — CodeMirror 6 (MIT). Built by dev/build-editor.mjs; do not edit. */`;

const result = spawnSync(esbuild, [
  entry,
  '--bundle',
  '--format=iife',
  '--target=chrome110',
  '--platform=browser',
  '--legal-comments=eof',
  '--log-level=warning',
  `--banner:js=${banner}`,
  `--outfile=${target}`,
], {
  cwd: pluginDir,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NODE_PATH: nodeModules,
  },
});

if (result.error) {
  console.error(`build-editor: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const built = readFileSync(target, 'utf8');
if (!checkOnly) {
  console.log(`editor chunk: ${built.length} bytes, ${built.split('\n').length} lines`);
  process.exit(0);
}

const existing = (() => {
  try {
    return readFileSync(output, 'utf8');
  } catch {
    return '';
  }
})();
const digest = (text) => createHash('sha256').update(text).digest('hex');
if (digest(existing) !== digest(built)) {
  rmSync(temp, { force: true });
  console.error('editor chunk is stale; run `node dev/build-editor.mjs`');
  process.exit(1);
}
rmSync(temp, { force: true });
console.log('editor chunk is current');
