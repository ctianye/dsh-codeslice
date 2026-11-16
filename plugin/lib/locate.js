/**
 * Resolve a note's citation to a readable code range — in the worktree first,
 * and in git history when the code it described is gone.
 *
 * Three outcomes, because the reader needs to be told which one they are
 * looking at:
 *
 *   worktree  the same code is still on disk; lines may have shifted
 *   history   the code no longer exists here, so this is the commit the note
 *             was written against
 *   missing   neither the worktree nor any reachable commit has the snippet
 *
 * The search is deliberately snippet-first rather than line-number-first:
 * line numbers are the least stable thing about a citation, and a hash of the
 * captured text is the most stable.
 */

import { promises as fs } from 'node:fs';

import { headCommit, pickaxeCommits, pickNeedle, showFileAtCommit, commitInfo } from './git.js';
import { languageFor, safeJoin, snippetHash } from './notes.js';

/** How many history commits are inspected before giving up. */
const HISTORY_TRIES = 4;

/** Context lines shown around a historical range, so the box has surroundings. */
const HISTORY_PAD = 3;

/** Longest text returned for a preview. */
const MAX_PREVIEW_LINES = 80;

/** Read one workspace file's lines, or null. */
async function readWorktreeLines(root, path) {
  const safe = safeJoin(root, path);
  if (safe === undefined) return null;
  try {
    return String(await fs.readFile(safe, 'utf8')).split('\n');
  } catch {
    return null;
  }
}

/**
 * Find a snippet inside a file's lines.
 *
 * Trimmed comparison ignores indentation churn, which is what a formatter pass
 * produces; the hash check in the caller still catches a real edit.
 * @param lines - the file's lines.
 * @param snippet - the captured text.
 * @param hintStart - the recorded 1-based line, used to prefer the nearest hit.
 * @returns `{ startLine, endLine }` or null.
 */
function findSnippet(lines, snippet, hintStart) {
  const target = String(snippet ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
  if (target.length === 0) return null;
  const trimmed = lines.map((line) => line.trim());
  const head = target[0];
  const hits = [];
  for (let index = 0; index + target.length <= trimmed.length; index += 1) {
    if (trimmed[index] !== head) continue;
    let matched = true;
    for (let offset = 1; offset < target.length; offset += 1) {
      if (trimmed[index + offset] !== target[offset]) { matched = false; break; }
    }
    if (matched) hits.push({ startLine: index + 1, endLine: index + target.length });
  }
  if (hits.length === 0) return null;
  const hint = Math.max(1, Math.trunc(Number(hintStart) || 1));
  hits.sort((a, b) => Math.abs(a.startLine - hint) - Math.abs(b.startLine - hint));
  return hits[0];
}

/** Exact hash match at the recorded range, if that range still holds the text. */
function hashAt(lines, startLine, endLine, hash) {
  if (typeof hash !== 'string' || hash === '') return false;
  const start = Math.max(1, Math.trunc(Number(startLine) || 1));
  const end = Math.max(start, Math.trunc(Number(endLine) || start));
  if (start > lines.length) return false;
  const current = lines.slice(start - 1, Math.min(end, lines.length)).join('\n');
  return current !== '' && snippetHash(current) === hash;
}

/** Build the slice a preview shows, keeping line numbers attached to their text. */
function preview(lines, startLine, endLine) {
  const from = Math.max(1, startLine - HISTORY_PAD);
  const to = Math.min(lines.length, endLine + HISTORY_PAD);
  const rows = [];
  for (let line = from; line <= to && rows.length < MAX_PREVIEW_LINES; line += 1) {
    rows.push({ line, text: lines[line - 1] ?? '' });
  }
  return { rows, from, to };
}

/**
 * Locate one citation.
 *
 * @param root - absolute workspace root.
 * @param citation - `{ path, startLine, endLine, snippet, hash, commit }`; start
 *   and end fall back to `line`/`endLine` as the note stores them.
 * @param options - `{ history: boolean }`; history defaults to true.
 * @returns `{ mode, path, startLine, endLine, rows, language, commit, note }`.
 */
export async function locateCitation(root, citation, options = {}) {
  const path = String(citation?.path ?? '').replace(/\\/gu, '/');
  const startLine = Math.max(1, Math.trunc(Number(citation?.startLine ?? citation?.line ?? 1)));
  const endLine = Math.max(startLine, Math.trunc(Number(citation?.endLine ?? citation?.line ?? startLine)));
  const snippet = String(citation?.snippet ?? '');
  const hash = typeof citation?.hash === 'string' ? citation.hash : '';
  const language = languageFor(path);
  const base = { path, startLine, endLine, language };

  if (path === '') return { ...base, mode: 'missing', rows: [], commit: null, reason: 'no-path' };

  const worktree = await readWorktreeLines(root, path);
  if (worktree !== null) {
    if (hashAt(worktree, startLine, endLine, hash)) {
      return {
        ...base,
        mode: 'worktree',
        status: 'fresh',
        ...preview(worktree, startLine, endLine),
        commit: null,
      };
    }
    const found = findSnippet(worktree, snippet, startLine);
    if (found !== null) {
      return {
        ...base,
        mode: 'worktree',
        status: 'moved',
        startLine: found.startLine,
        endLine: found.endLine,
        ...preview(worktree, found.startLine, found.endLine),
        commit: null,
      };
    }
  }

  if (options.history === false) {
    return {
      ...base, mode: 'missing', rows: [], commit: null, reason: worktree === null ? 'no-file' : 'content-changed',
    };
  }

  // History: the anchor's own commit is authoritative; without one (older notes
  // never recorded it), pickaxe finds where the text last appeared.
  const candidates = [];
  const anchored = String(citation?.commit ?? '').trim();
  if (/^[0-9a-fA-F]{4,64}$/u.test(anchored)) candidates.push({ commit: anchored });
  const needle = pickNeedle(snippet);
  if (needle !== '') {
    const picked = await pickaxeCommits(root, path, needle, HISTORY_TRIES);
    for (const row of picked) {
      if (!candidates.some((entry) => entry.commit === row.commit)) candidates.push(row);
    }
  }
  if (candidates.length === 0 && worktree !== null) {
    candidates.push({ commit: await headCommit(root) });
  }

  for (const candidate of candidates.slice(0, HISTORY_TRIES)) {
    if (!candidate?.commit) continue;
    const blob = await showFileAtCommit(root, candidate.commit, path);
    if (blob === null) continue;
    const lines = blob.split('\n');
    const info = (candidate.date !== undefined && candidate.subject !== undefined)
      ? candidate
      : (await commitInfo(root, candidate.commit)) ?? candidate;
    if (hashAt(lines, startLine, endLine, hash)) {
      return {
        ...base,
        mode: 'history',
        status: 'at-commit',
        ...preview(lines, startLine, endLine),
        commit: {
          sha: info.commit ?? candidate.commit,
          date: info.date ?? null,
          author: info.author ?? null,
          subject: info.subject ?? null,
        },
      };
    }
    const found = findSnippet(lines, snippet, startLine);
    if (found !== null) {
      return {
        ...base,
        mode: 'history',
        status: 'at-commit',
        startLine: found.startLine,
        endLine: found.endLine,
        ...preview(lines, found.startLine, found.endLine),
        commit: {
          sha: info.commit ?? candidate.commit,
          date: info.date ?? null,
          author: info.author ?? null,
          subject: info.subject ?? null,
        },
      };
    }
  }

  return {
    ...base,
    mode: 'missing',
    rows: [],
    commit: null,
    reason: worktree === null ? 'no-file' : 'content-changed',
  };
}
