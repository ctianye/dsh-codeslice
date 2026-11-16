// Scratch: reproduce the audit's P0 — concurrent writes colliding on one temp
// path, losing user notes. Run BEFORE and AFTER the fix.
import { promises as fs } from 'node:fs';
import { apiMethods, CONFIG_DEFAULTS } from '../index.js';
import { statePath } from '../lib/store.js';

const root = 'D:/dsh-CodeSlice';
const notesFile = statePath(root, 'notes');

let lost = 0;
let corrupt = 0;
const ITERATIONS = 40;

for (let run = 0; run < ITERATIONS; run += 1) {
  await fs.rm(notesFile, { force: true });
  const methods = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: root });

  // Two panels saving at once: a note and an annotation. This is a normal user
  // action, not a stress test.
  await Promise.all([
    methods.notes({ root, op: 'create', title: `note-${run}`, body: 'x', source: 'body' }),
    methods.annotations({ root, op: 'create', path: 'plugin/lib/model.js', startLine: 1, endLine: 2, title: `an-${run}`, body: 'y' }),
  ]);

  let text;
  try {
    text = await fs.readFile(notesFile, 'utf8');
  } catch {
    lost += 1;
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    corrupt += 1;
    lost += 1;
    continue;
  }
  const noteCount = Array.isArray(parsed.notes) ? parsed.notes.length : 0;
  const annotationCount = Array.isArray(parsed.annotations) ? parsed.annotations.length : 0;
  if (noteCount !== 1 || annotationCount !== 1) lost += 1;
}

console.log(`concurrent note+annotation writes: ${ITERATIONS} runs`);
console.log(`  data lost:        ${lost}/${ITERATIONS}`);
console.log(`  invalid JSON:     ${corrupt}/${ITERATIONS}`);

/* ---- second scenario: is a corrupt file overwritten, losing history? ---- */
await fs.rm(notesFile, { force: true });
const seed = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: root });
await seed.notes({ root, op: 'create', title: 'IRREPLACEABLE', body: '# keep me', source: 'important' });

// Corrupt it the way a torn write does: truncate the good file mid-document, so
// the seeded note's bytes are still in the prefix. (Overwriting with fresh
// garbage would destroy the content regardless of what the code does, which
// tests nothing.)
const good = await fs.readFile(notesFile, 'utf8');
await fs.writeFile(notesFile, good.slice(0, Math.floor(good.length * 0.6)), 'utf8');
const afterCorruption = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: root });

// Reading must now fail loudly rather than report an empty library.
let refusedRead = false;
let readError = '';
try {
  await afterCorruption.notes({ root, op: 'list' });
} catch (error) {
  refusedRead = true;
  readError = String(error.message).slice(0, 90);
}

// A write must not be able to erase what is left. The first read moves the
// damaged file aside; a subsequent write then legitimately starts a fresh
// library — the salvage copy is what protects the history, so the check is that
// the original bytes still exist and are recoverable.
let refusedSomewhere = false;
try {
  await afterCorruption.notes({ root, op: 'create', title: 'new note', body: 'z', source: 'z' });
} catch {
  refusedSomewhere = true;
}

// The damaged bytes must still exist, and must still contain the seeded note's
// text, so a human or a repair script can recover it.
const siblings = (await fs.readdir(stateDirName())).filter((name) => name.includes('.corrupt-'));
const salvaged = siblings.length > 0;
let salvageHasHistory = false;
for (const name of siblings) {
  const body = await fs.readFile(`${stateDirName()}/${name}`, 'utf8').catch(() => '');
  if (body.includes('IRREPLACEABLE')) salvageHasHistory = true;
}

console.log('\ncorruption handling:');
console.log(`  read refused instead of reporting empty: ${refusedRead} ${refusedRead ? `(${readError}…)` : ''}`);
console.log(`  damaged file kept for recovery:          ${salvaged}`);
console.log(`  salvaged copy still holds the history:   ${salvageHasHistory}`);

for (const name of siblings) await fs.rm(`${stateDirName()}/${name}`, { force: true });
await fs.rm(notesFile, { force: true });

process.exit((lost === 0 && refusedRead && salvaged && salvageHasHistory) ? 0 : 1);

/** The plugin's state directory, for the salvage check. */
function stateDirName() {
  return statePath(root, 'x').replace(/[^\\/]+$/u, '');
}
