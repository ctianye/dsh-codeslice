/**
 * Project registry (INTERFACES-v3.md §3.4).
 *
 * A small global ledger of the workspaces CodeSlice has built: one row per root,
 * keyed by a 16-char sha1 of the resolved root. The panel lists recent projects
 * from here instead of scanning the disk; a successful build re-registers the row
 * so its stats and `builtAt` stay current.
 *
 * State location: `%CODESLICE_STATE_DIR%/projects.json`, or the default state dir
 * when the env var is unset. The directory is resolved at call time so the dev
 * probes can isolate the registry in a throwaway temp dir — this file is global,
 * never per-root, so a probe that wrote the real registry would pollute it.
 *
 * Corrupt file rule: a damaged document is quarantined to `<file>.corrupt-<ts>`
 * and the read throws; it is never read back as an empty registry.
 */

import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

import { stateDir, readJsonChecked, writeJson } from './store.js';
import { quarantineCorrupt, ensureStateDir } from './notes.js';

/** Persisted document version, bumped if the shape ever changes. */
const STORE_VERSION = 1;

/** Longest custom display name kept on a row. */
const MAX_NAME_LENGTH = 80;

/** State directory, honouring the probe isolation env var at call time. */
function stateDirFor() {
  return process.env.CODESLICE_STATE_DIR || stateDir();
}

/** Absolute path to the global registry document. */
function registryFile() {
  return join(stateDirFor(), 'projects.json');
}

/**
 * Stable id for one root: sha1 of the resolved, lower-cased root, first 16 hex.
 *
 * Mirrors `store.rootKey` so per-root state files and this registry agree on the
 * same identity.
 * @param root - absolute directory.
 * @returns the 16-char id.
 */
export function projectId(root) {
  return createHash('sha1').update(resolve(root).toLowerCase()).digest('hex').slice(0, 16);
}

/** Default display name: the root's last path segment. */
function defaultName(root) {
  return basename(resolve(root)) || resolve(root);
}

/**
 * Read the whole registry.
 * @returns `{ projects: [...] }`, newest build first.
 */
export async function listProjects() {
  const file = registryFile();
  const checked = await readJsonChecked(file);
  if (!checked.ok) {
    if (checked.reason === 'absent') return { projects: [] };
    await quarantineCorrupt(file);
    throw new Error(`projects state is corrupt: ${checked.detail ?? 'unknown'}`);
  }
  const rows = Array.isArray(checked.value?.projects) ? checked.value.projects : [];
  const projects = rows
    .filter((row) => row !== null && typeof row === 'object' && typeof row.root === 'string')
    .slice()
    .sort((a, b) => Number(b.builtAt ?? 0) - Number(a.builtAt ?? 0));
  return { projects };
}

/**
 * Register (or refresh) one built document.
 *
 * Called after a successful `documentFor` build. An existing row keeps its custom
 * display name; a new row takes the root basename.
 * @param document - a built graph document (`{ root, builtAt, files, lineCount,
 *   nodes, edges, communities }`).
 * @returns the stored row.
 */
export async function rememberProject(document) {
  const root = resolve(document?.root ?? '');
  if (root === '' || root === '.') throw new Error('a workspace root is required');
  const id = projectId(root);
  const now = Date.now();
  const stats = {
    files: document.files?.length ?? 0,
    lines: Number(document.lineCount ?? 0),
    nodes: document.nodes?.length ?? 0,
    edges: document.edges?.length ?? 0,
    communities: document.communities?.length ?? 0,
  };

  const { projects } = await listProjects();
  const existing = projects.find((row) => row.id === id);
  const row = existing === undefined
    ? { id, root, name: defaultName(root), builtAt: document.builtAt ?? now, stats }
    : { ...existing, root, builtAt: document.builtAt ?? now, stats };

  await ensureStateDir(stateDirFor());
  const ok = await writeJson(registryFile(), { storeVersion: STORE_VERSION, projects: [row,
    ...projects.filter((candidate) => candidate.id !== id),
  ] });
  if (ok !== true) throw new Error('failed to persist projects state');
  return row;
}

/**
 * Rename a registered project's display name.
 * @param id - the 16-char project id.
 * @param name - the new display name.
 * @returns the updated row.
 */
export async function renameProject(id, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') throw new Error('a non-empty display name is required');
  const file = registryFile();
  const { projects } = await listProjects();
  const target = projects.find((row) => row.id === id);
  if (target === undefined) throw new Error('project not found');

  target.name = trimmed.slice(0, MAX_NAME_LENGTH);
  await ensureStateDir(stateDirFor());
  const ok = await writeJson(file, { storeVersion: STORE_VERSION, projects });
  if (ok !== true) throw new Error('failed to persist projects state');
  return target;
}

/**
 * Forget a registered project. The workspace on disk is untouched.
 * @param id - the 16-char project id.
 */
export async function forgetProject(id) {
  const file = registryFile();
  const { projects } = await listProjects();
  const remaining = projects.filter((row) => row.id !== id);
  if (remaining.length === projects.length) throw new Error('project not found');
  await ensureStateDir(stateDirFor());
  const ok = await writeJson(file, { storeVersion: STORE_VERSION, projects: remaining });
  if (ok !== true) throw new Error('failed to persist projects state');
}
