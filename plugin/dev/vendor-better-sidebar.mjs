/**
 * Copy Better Sidebar's prebuilt client into this plugin and re-point its lazy
 * chunk URLs at CodeSlice's own asset route.
 *
 * The upstream package ships `lib/client.js` plus five sibling chunks, all
 * loaded through DSH's client module loader. They are vendored byte-for-byte
 * except for one string: the lazy chunk base, which upstream serves from its
 * own host route (`sidebar/bundle/<name>.js`) and which this plugin serves from
 * `/codeslice/assets/better-sidebar/<name>.js`.
 *
 * Usage:
 *   node dev/vendor-better-sidebar.mjs
 *   node dev/vendor-better-sidebar.mjs --from "C:/other/node_modules/dsh-better-sidebar/lib"
 */

import {
  copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, '..');
const sourceDefault = join(
  process.env.USERPROFILE ?? 'C:/Users/cheng',
  '.dsh/profiles/desktop/node_modules/dsh-better-sidebar/lib',
);
const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const source = fromIndex >= 0 && args[fromIndex + 1] !== undefined
  ? resolve(args[fromIndex + 1])
  : sourceDefault;
const dest = join(pluginRoot, 'client/vendor/better-sidebar');

if (!existsSync(source)) {
  console.error(`vendor-better-sidebar: source lib not found: ${source}`);
  process.exit(1);
}

const chunks = [
  'client.js',
  'client-editor.js',
  'client-registry.js',
  'client-locale.js',
  'client-mermaid.js',
  'client-terminal.js',
];
const license = join(source, '..', 'LICENSE');
mkdirSync(dest, { recursive: true });

for (const name of chunks) {
  const file = join(source, name);
  if (!existsSync(file)) {
    console.error(`vendor-better-sidebar: missing ${file}`);
    process.exit(1);
  }
  copyFileSync(file, join(dest, name));
}

if (!existsSync(license)) {
  console.error(`vendor-better-sidebar: missing LICENSE next to ${source}`);
  process.exit(1);
}
copyFileSync(license, join(dest, 'LICENSE'));

const entry = join(dest, 'client.js');
const original = readFileSync(entry, 'utf8');
const before = 'sidebar/bundle/${name}.js';
const after = 'codeslice/assets/better-sidebar/${name}.js';
if (!original.includes(before)) {
  console.error(`vendor-better-sidebar: chunk base "${before}" not found in ${entry}`);
  process.exit(1);
}
const patched = original.split(before).join(after);
writeFileSync(entry, patched, 'utf8');

console.log(`vendor-better-sidebar: wrote ${chunks.length} chunks + LICENSE to ${dest}`);
console.log(`vendor-better-sidebar: chunk base ${before} -> ${after}`);
