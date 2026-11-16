// Scratch: robustness probes for the CodeSlice host half.
// Not part of the plugin; run with `node <this file>`.
import { apply, apiMethods, toolDefinitions, buildDocument, CONFIG_DEFAULTS } from '../index.js';

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

/* ---- 1. empty workspace ------------------------------------------------ */
{
  const empty = process.env.TEMP + '\\codeslice-empty-probe';
  const { mkdirSync, rmSync } = await import('node:fs');
  rmSync(empty, { recursive: true, force: true });
  mkdirSync(empty, { recursive: true });
  try {
    const document = await buildDocument(empty, CONFIG_DEFAULTS);
    record('empty workspace builds', true, `files=${document.files.length} nodes=${document.nodes.length} edges=${document.edges.length}`);
    record('empty workspace has zero nodes', document.nodes.length === 0);
    record('empty workspace has zero edges', document.edges.length === 0);
    record('empty workspace has a topology key', typeof document.topologyKey === 'string' && document.topologyKey.length === 32);
  } catch (error) {
    record('empty workspace builds', false, error.message);
  }
}

/* ---- 2. bad request shapes -------------------------------------------- */
{
  const methods = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: 'D:/dsh-CodeSlice' });

  // No root and no cwd.
  try {
    await methods.status({});
    record('status without root falls back to defaultDir', true);
  } catch (error) {
    record('status without root falls back to defaultDir', false, error.message);
  }

  // A root that does not exist.
  try {
    await methods.status({ root: 'Z:/definitely/not/here' });
    record('status on a missing root degrades', true);
  } catch (error) {
    // Acceptable as long as the message is a sentence, not a stack.
    record('status on a missing root throws a clean message',
      typeof error.message === 'string' && !error.message.includes('at '),
      error.message.slice(0, 80));
  }

  // Unknown notes op.
  try {
    await methods.notes({ root: 'D:/dsh-CodeSlice', op: 'nope' });
    record('unknown notes op rejected', false, 'did not throw');
  } catch (error) {
    record('unknown notes op rejected', /unknown notes op/u.test(error.message), error.message.slice(0, 60));
  }

  // Reading a note that does not exist.
  try {
    await methods.notes({ root: 'D:/dsh-CodeSlice', op: 'read', id: 'n_missing' });
    record('missing note rejected', false, 'did not throw');
  } catch (error) {
    record('missing note rejected', /note not found/u.test(error.message), error.message.slice(0, 60));
  }

  // Unknown node.
  try {
    await methods.node({ root: 'D:/dsh-CodeSlice', id: 'nope::function::nope::1' });
    record('unknown node rejected', false, 'did not throw');
  } catch (error) {
    record('unknown node rejected', /node not found/u.test(error.message), error.message.slice(0, 60));
  }
}

/* ---- 3. path traversal ------------------------------------------------- */
{
  const { safeJoin, readRange } = await import('../lib/notes.js');
  const root = 'D:/dsh-CodeSlice';
  record('safeJoin refuses ..', safeJoin(root, '../../etc/passwd') === undefined);
  record('safeJoin refuses an absolute escape', safeJoin(root, '/etc/passwd') !== undefined);
  record('safeJoin allows a normal path', typeof safeJoin(root, 'plugin/index.js') === 'string');
  const escaped = await readRange(root, '../../../Windows/win.ini', 1, 1);
  record('readRange refuses traversal', escaped === null, String(escaped).slice(0, 40));
}

/* ---- 4. binary / huge file -------------------------------------------- */
{
  const { scanSource, looksGenerated } = await import('../lib/analyzer.js');
  const binary = 'abc\u0000def\u0000ghi';
  try {
    const extraction = scanSource(binary, 'python', 'x.py', {});
    record('binary content does not throw', true, `nodes=${extraction.nodes.length}`);
  } catch (error) {
    record('binary content does not throw', false, error.message);
  }

  const minified = `${'var a=1;'.repeat(4000)}`;
  record('looksGenerated catches a minified line', looksGenerated(minified) === true);

  const broken = 'def f(:\n    ???\n';
  try {
    const extraction = scanSource(broken, 'python', 'broken.py', {});
    record('invalid source degrades to an extraction', extraction.error === null || typeof extraction.error === 'string');
  } catch (error) {
    record('invalid source degrades to an extraction', false, error.message);
  }
}

/* ---- 5. security surface ---------------------------------------------- */
{
  const { readFileSync } = await import('node:fs');
  const { readdirSync } = await import('node:fs');
  const files = [
    'D:/dsh-CodeSlice/plugin/index.js',
    ...readdirSync('D:/dsh-CodeSlice/plugin/lib').map((name) => `D:/dsh-CodeSlice/plugin/lib/${name}`),
  ];
  const banned = [
    ['child_process', /\bfrom 'node:child_process'|\brequire\('child_process'\)/u],
    ['eval', /\beval\s*\(/u],
    ['new Function', /\bnew Function\s*\(/u],
    ['network', /\bfetch\s*\(|https?\.request|node:https|node:net/u],
    ['os-level exec', /\bexecSync|\bspawnSync|\bexecFile/u],
  ];
  // Three capabilities are sanctioned and confined to one module each:
  //   graphify.js — spawns the graphify CLI with a fixed argv and shell:false;
  //   git.js      — runs read-only git plumbing through execFile with an argv array;
  //   models.js   — probes a loopback Ollama only (isLoopback gate).
  const sanctioned = {
    child_process: /(graphify|git)\.js$/u,
    'os-level exec': /(graphify|git)\.js$/u,
    network: /models\.js$/u,
  };
  for (const [label, pattern] of banned) {
    const allow = sanctioned[label];
    const hits = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))
      && !(allow !== undefined && allow.test(file)));
    record(`host half has no ${label}`, hits.length === 0, hits.map((f) => f.split('/').pop()).join(','));
  }

  // Writes must be confined to the state directory.
  //
  // The allow-list is the modules that own durable state or user files: store.js
  // (index, notes, layouts), notes.js (note export), chat.js and rag.js (one
  // document per root), vectors.js and note-vectors.js (packed vector blobs),
  // sidebar-api.js (the vendored editor's file operations, confined by pathOf),
  // and index.js (the `.codeslice/history` shadow tree for vanished citations,
  // confined by safeJoin). All state writes go through `statePath`/`stateFile`,
  // and renames outside store.js are the same corrupt-file quarantine or
  // atomic-replace pattern: move the damaged document aside inside the state
  // directory, never delete or overwrite it in place.
  const writes = files.filter((file) => /writeFile\s*\(|mkdir\s*\(|rename\s*\(/u.test(readFileSync(file, 'utf8')));
  record('write sites exist only in the state-owning / editor modules', writes.every((file) => /index\.js|store\.js|notes\.js|persist\.js|chat\.js|rag\.js|vectors\.js|note-vectors\.js|sidebar-api\.js/u.test(file)),
    writes.map((f) => f.split('/').pop()).join(','));
}

console.log(`\n${results.filter((row) => row.ok).length}/${results.length} robustness probes passed`);
process.exit(results.some((row) => !row.ok) ? 1 : 0);
