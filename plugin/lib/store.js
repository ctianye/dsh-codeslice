/**
 * Persistence for one workspace root.
 *
 * The plugin keeps three kinds of durable state, all of which must survive a
 * Harness restart so a first panel open is never a cold build:
 *
 *   index.json    the built code graph (nodes, edges, stats, chunk index)
 *   notes.json    the note knowledge base, its folders, annotations and anchors
 *   layouts.json  cached force-layout coordinates per `topology_key`
 *
 * Deliberately JSON files rather than SQLite: the Host half is single-threaded
 * for these writes, the documents are small (D:\CodeSplit is ~7 MB of graph), and
 * a corrupt file degrades to "rebuild" instead of to an unopenable database. The
 * layout cache is the one thing keyed by graph identity, so a rebuild that changes
 * topology drops it automatically.
 *
 * Everything here tolerates a missing or unreadable file: persistence failing
 * must never fail a request.
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Bumped when the on-disk document shape changes; a mismatch forces a rebuild. */
export const STORE_VERSION = 1;

/** How long a cached index is trusted before a rebuild, unless forced. */
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** The plugin's private state directory. */
export function stateDir() {
  return join(tmpdir(), 'dsh-codeslice');
}

/** Stable, filesystem-safe key for one absolute root. */
function rootKey(root) {
  return createHash('sha1').update(resolve(root).toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Absolute path of one root's state file.
 *
 * The extension is a parameter because the embedding vectors are packed binary
 * (`<rootKey>.vectors.<nonce>.bin`), not JSON. Everything that is a document keeps
 * the `.json` suffix a reader can open.
 * @param root - absolute workspace root.
 * @param name - the document name.
 * @param extension - the file extension, defaulting to `json`.
 * @returns the absolute path.
 */
export function stateFile(root, name, extension = 'json') {
  const suffix = extension === '' ? '' : `.${extension}`;
  return join(stateDir(), `${rootKey(root)}.${name}${suffix}`);
}

/** Absolute path of one root's JSON state document. */
export function statePath(root, name) {
  return stateFile(root, name, 'json');
}

/**
 * Read one JSON document, or `undefined` when it is absent or unusable.
 *
 * Tolerant by design: this is the shape the *cache* readers want, where a corrupt
 * file legitimately means "rebuild from disk". It must never be used for user
 * data — collapsing "absent" and "corrupt" into one answer is exactly how a
 * damaged note library gets silently replaced by an empty one. Use
 * {@link readJsonChecked} there.
 * @param file - absolute path.
 * @returns the parsed document, or undefined.
 */
export async function readJson(file) {
  const result = await readJsonChecked(file);
  return result.ok ? result.value : undefined;
}

/**
 * Read one JSON document, distinguishing *absent* from *corrupt*.
 *
 * The distinction is the whole point: an absent file is a new workspace and
 * writing a fresh document is correct; a corrupt file is damaged user data, and
 * writing over it destroys whatever a recovery could still have salvaged.
 * @param file - absolute path.
 * @returns `{ ok: true, value }` · `{ ok: false, reason: 'absent' }` ·
 *   `{ ok: false, reason: 'corrupt', detail }`.
 */
export async function readJsonChecked(file) {
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    // ENOENT is "absent"; any other read error is not something a write can fix.
    const reason = error !== null && typeof error === 'object' && error.code === 'ENOENT' ? 'absent' : 'corrupt';
    return { ok: false, reason, detail: String(error?.message ?? error) };
  }
  if (raw.trim() === '') return { ok: false, reason: 'corrupt', detail: 'empty file' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return { ok: false, reason: 'corrupt', detail: 'not a JSON object' };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, reason: 'corrupt', detail: String(error?.message ?? error) };
  }
}

/* ------------------------------------------------------------------ *
 * Writes                                                            *
 * ------------------------------------------------------------------ */

/**
 * One promise chain per file, so writes to the same document never overlap.
 *
 * This is the load-bearing half of the durability fix. A unique temp path stops
 * two writers from interleaving *bytes*, but it does not stop last-writer-wins
 * from publishing a document built on a stale read: two panels each load the
 * library, each append their own note, and the second rename drops the first
 * note. Serialising means the second writer's `loadNotes` sees the first's
 * result.
 */
const writeChains = new Map();

/**
 * Run `task` after every earlier write to `file` has settled.
 * @param file - the document's absolute path.
 * @param task - the write to perform.
 * @returns the task's value.
 */
function serialiseWrite(file, task) {
  const prior = writeChains.get(file) ?? Promise.resolve();
  // `then(task, task)` continues the chain even when the previous write failed;
  // one failed write must not wedge every later one for the process lifetime.
  const next = prior.then(task, task);
  // The chain stores a settled-safe tail; the caller still sees the real result.
  writeChains.set(file, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * Write one JSON document atomically and durably, without queueing.
 *
 * Callers must already hold the file's write chain (or be the only writer). Use
 * {@link writeJson} unless you are inside {@link updateNotes}; calling this
 * directly from two places reintroduces the interleaving it exists to prevent.
 *
 * Three properties, each earning its place:
 *   - **atomic** — write to a temp file, fsync it, then rename. A crash mid-write
 *     leaves the previous version intact rather than a truncated one.
 *   - **collision-free** — the temp name carries a random suffix, not just the
 *     pid. Two concurrent writes in one process are normal (two panels), and a
 *     shared temp path lets the second rename publish the first's half-written
 *     bytes.
 *   - **durable** — fsync before rename, so a rename cannot land before the
 *     bytes do.
 *
 * @param file - absolute target path.
 * @param value - the JSON-serialisable document.
 * @returns true when the write landed.
 */
async function writeJsonDirect(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    await fs.mkdir(stateDir(), { recursive: true });
    const body = JSON.stringify(value);
    handle = await fs.open(temp, 'wx');
    await handle.writeFile(body, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, file);
    return true;
  } catch {
    try {
      await handle?.close();
    } catch {
      // Already closed, or never opened.
    }
    try {
      await fs.unlink(temp);
    } catch {
      // The temp file may not exist; nothing to clean.
    }
    return false;
  }
}

/**
 * Write one JSON document atomically and durably, queued behind earlier writes.
 * @param file - absolute target path.
 * @param value - the JSON-serialisable document.
 * @returns true when the write landed.
 */
export async function writeJson(file, value) {
  return serialiseWrite(file, () => writeJsonDirect(file, value));
}

/**
 * Load a root's cached index when it is version-compatible and fresh enough.
 * @param root - absolute workspace root.
 * @param options - `{ maxAgeMs, force }`.
 * @returns `{ document, cached: true }` or `undefined`.
 */
export async function loadIndex(root, options = {}) {
  if (options.force === true) return undefined;
  const file = statePath(root, 'index');
  const document = await readJson(file);
  if (document === undefined) return undefined;
  if (document.storeVersion !== STORE_VERSION) return undefined;
  if (document.root !== resolve(root)) return undefined;
  if (typeof document.builtAt !== 'number') return undefined;
  const ttl = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_CACHE_TTL_MS;
  if (Date.now() - document.builtAt > ttl) return undefined;
  return { document, cached: true };
}

/** Persist one root's index. Never throws. */
export async function saveIndex(root, document) {
  return writeJson(statePath(root, 'index'), { ...document, storeVersion: STORE_VERSION });
}

/**
 * Read the note knowledge base for one root.
 *
 * This is **user data**, not cache, so a corrupt file is a hard failure rather
 * than an empty library. Reading it as empty and then writing would replace
 * months of notes with the one note the user just typed — the failure mode the
 * old implementation had. On corruption the damaged file is moved aside to a
 * `.corrupt-<timestamp>` sibling (so a later manual recovery is possible), and
 * the error surfaces to the API, which answers 500 instead of accepting a write.
 *
 * A *version* mismatch is treated as absent, because that is this plugin's own
 * schema moving forward, not the user's data being damaged.
 *
 * @param root - absolute workspace root.
 * @returns the document, always with all four arrays.
 * @throws when the stored file exists but cannot be parsed.
 */
export async function loadNotes(root) {
  const file = statePath(root, 'notes');
  let result = await readJsonChecked(file);

  // A missing document has been seen to cost the user every note at once. One
  // rolling `.bak` copy, restored here, turns that into a no-op instead of an
  // empty library.
  if (!result.ok && result.reason === 'absent') {
    const backup = await readJsonChecked(`${file}.bak`);
    if (backup.ok) {
      result = backup;
      await fs.copyFile(`${file}.bak`, file).catch(() => {});
    }
  }

  if (!result.ok) {
    if (result.reason === 'absent') {
      return { version: 1, folders: [], notes: [], annotations: [], anchors: [] };
    }
    const aside = `${file}.corrupt-${Date.now()}`;
    try {
      await fs.rename(file, aside);
    } catch {
      // If it cannot be moved, still refuse to overwrite it.
    }
    throw new Error(
      `notes library is unreadable (${result.detail ?? 'parse error'}); the damaged file was kept at ${aside}`,
    );
  }

  const document = result.value;
  if (document.storeVersion !== STORE_VERSION) {
    return { version: 1, folders: [], notes: [], annotations: [], anchors: [] };
  }
  return {
    version: 1,
    folders: Array.isArray(document.folders) ? document.folders : [],
    notes: Array.isArray(document.notes) ? document.notes : [],
    annotations: Array.isArray(document.annotations) ? document.annotations : [],
    anchors: Array.isArray(document.anchors) ? document.anchors : [],
  };
}

/** Persist the note knowledge base. Never throws. */
export async function saveNotes(root, document) {
  const saved = await writeJson(statePath(root, 'notes'), { ...document, storeVersion: STORE_VERSION });
  if (saved === true) await backupNotes(root);
  return saved;
}

/** Keep one rolling copy of the note document beside it. */
async function backupNotes(root) {
  const file = statePath(root, 'notes');
  await fs.copyFile(file, `${file}.bak`).catch(() => {});
}

/**
 * Read-modify-write the note knowledge base as one atomic operation.
 *
 * This is the only safe way to mutate user data. `loadNotes` → mutate →
 * `saveNotes` is a lost-update bug whenever two callers overlap: two panels each
 * load the library, each append their own row, and the second save publishes a
 * document that never contained the first row. Serialising the *writes* does not
 * fix it, because the stale read already happened.
 *
 * Queueing the whole cycle means the second caller's `loadNotes` observes the
 * first caller's write.
 *
 * @param root - absolute workspace root.
 * @param mutate - `(document) => value | Promise<value>`; may mutate in place.
 * @returns `{ value, saved }` — the mutator's result and whether the write landed.
 * @throws when the stored file is unreadable (see {@link loadNotes}).
 */
export async function updateNotes(root, mutate) {
  const file = statePath(root, 'notes');
  return serialiseWrite(file, async () => {
    const document = await loadNotes(root);
    const value = await mutate(document);
    // Direct write: this cycle already holds the chain, and queueing again would
    // deadlock on itself.
    const saved = await writeJsonDirect(file, { ...document, storeVersion: STORE_VERSION });
    if (saved === true) await backupNotes(root);
    return { value, saved };
  });
}

/**
 * The cached layout for one graph identity.
 *
 * Keyed by `topology_key`, so a rebuild that adds or removes a node/edge starts
 * from a fresh layout instead of drawing the new graph at the old coordinates.
 * @param root - absolute workspace root.
 * @param key - the topology key.
 * @returns `{ positions: { [id]: [x, y] } }` or undefined.
 */
export async function loadLayout(root, key) {
  if (typeof key !== 'string' || key === '') return undefined;
  const document = await readJson(statePath(root, 'layouts'));
  if (document === undefined) return undefined;
  const entry = document.layouts?.[key];
  if (entry === undefined || typeof entry !== 'object') return undefined;
  return entry;
}

/**
 * Remember the layout for one graph identity, keeping at most `MAX_LAYOUTS`
 * entries so the file cannot grow without bound.
 * @param root - absolute workspace root.
 * @param key - the topology key.
 * @param positions - `{ [id]: [x, y] }`.
 */
export async function saveLayout(root, key, positions) {
  if (typeof key !== 'string' || key === '') return false;
  const file = statePath(root, 'layouts');
  const document = (await readJson(file)) ?? { storeVersion: STORE_VERSION, layouts: {} };
  const layouts = document.layouts ?? {};
  layouts[key] = positions;
  const keys = Object.keys(layouts);
  if (keys.length > MAX_LAYOUTS) {
    for (const stale of keys.slice(0, keys.length - MAX_LAYOUTS)) delete layouts[stale];
  }
  return writeJson(file, { storeVersion: STORE_VERSION, layouts });
}

/** How many layouts one root keeps. Bounds a file the user never thinks about. */
export const MAX_LAYOUTS = 4;

/**
 * Drop every derived document for one root — the "rebuild from scratch" button.
 * @param root - absolute workspace root.
 */
export async function clearIndex(root) {
  for (const name of ['index', 'layouts']) {
    try {
      await fs.unlink(statePath(root, name));
    } catch {
      // Absent is the desired state.
    }
  }
}
