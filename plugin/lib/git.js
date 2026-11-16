/**
 * Minimal Git plumbing for anchor history.
 *
 * The worktree check in `notes.js` can only answer "is this code still here
 * now". Once a note outlives the code it cites, the only honest answer lives in
 * history — the commit the anchor was captured against. This module wraps the
 * three read-only commands that answer that without touching the index or the
 * working tree:
 *
 *   head      the commit a fresh anchor records
 *   show      one file's blob at one commit
 *   pickaxe   the newest commits where a snippet appeared or disappeared
 *
 * Everything here is read-only, bounded by a timeout, and catches failure into
 * `null`. A machine without git, a directory that is not a repository, or a
 * submodule path must never stop a note from opening.
 */

import { execFile } from 'node:child_process';

/** Longest snippet line handed to `git log -S`; longer needles match nothing. */
const MAX_NEEDLE = 120;

/** How many commits pickaxe may return. */
const LOG_LIMIT = 6;

/** Run one git command in `root`, resolving stdout or null on any failure. */
function git(root, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd: root,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(String(stdout ?? ''));
    });
  });
}

/** Normalise a citation path into the POSIX form git stores. */
function gitPath(path) {
  return String(path ?? '').replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/^\/+/u, '');
}

/**
 * The current HEAD commit.
 * @param root - absolute workspace root.
 * @returns the 40-char sha, or null when this is not a git checkout.
 */
export async function headCommit(root) {
  const out = await git(root, ['rev-parse', 'HEAD'], 4000);
  const sha = out === null ? '' : out.trim();
  return /^[0-9a-f]{40}$/u.test(sha) ? sha : null;
}

/**
 * One file's content at one commit.
 *
 * `git show rev:path` is used rather than `git cat-file` because it resolves a
 * short sha as well and reports a clear failure for a path that did not exist
 * yet — both of which matter for anchors captured before a file existed.
 *
 * @param root - absolute workspace root.
 * @param commit - any revision git accepts.
 * @param path - workspace-relative POSIX path.
 * @returns the blob text, or null.
 */
export async function showFileAtCommit(root, commit, path) {
  const rev = String(commit ?? '').trim();
  const rel = gitPath(path);
  if (rev === '' || rel === '') return null;
  if (!/^[0-9a-fA-F]{4,64}$/u.test(rev)) return null;
  const out = await git(root, ['show', `${rev}:${rel}`]);
  return out === null ? null : out;
}

/** One commit's metadata, formatted with a unit separator. */
export async function commitInfo(root, commit) {
  const rev = String(commit ?? '').trim();
  if (!/^[0-9a-fA-F]{4,64}$/u.test(rev)) return null;
  const out = await git(root, ['show', '-s', '--format=%H%x1f%aI%x1f%an%x1f%s', rev], 4000);
  if (out === null || out.trim() === '') return null;
  const [sha, date, author, subject] = out.trim().split('\x1f');
  return { commit: sha, date: date ?? null, author: author ?? null, subject: subject ?? null };
}

/**
 * The most useful line of a snippet to search for.
 *
 * Blank lines and pure punctuation match half the repository, so the needle is
 * the longest distinctive line: trimmed, non-empty, not a lone brace.
 * @param snippet - the captured code text.
 * @returns a needle, or an empty string when nothing is distinctive.
 */
export function pickNeedle(snippet) {
  const lines = String(snippet ?? '').split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && !/^[{}()[\],;]+$/u.test(line));
  if (lines.length === 0) return '';
  const scored = lines
    .map((line) => ({ line, score: line.replace(/\s+/gu, '').length }))
    .sort((a, b) => b.score - a.score);
  return scored[0].line.slice(0, MAX_NEEDLE);
}

/**
 * Commits where the snippet appeared or disappeared, newest first.
 *
 * `-S` (pickaxe) is the only search that answers "when did this text change"
 * for a specific path. It is scoped to the citation path so an identical line in
 * an unrelated file cannot win.
 *
 * @param root - absolute workspace root.
 * @param path - workspace-relative POSIX path.
 * @param needle - the line to look for.
 * @param limit - how many commits to return.
 * @returns `[{ commit, date, subject }]`, possibly empty.
 */
export async function pickaxeCommits(root, path, needle, limit = LOG_LIMIT) {
  const rel = gitPath(path);
  const text = String(needle ?? '').trim();
  if (rel === '' || text === '') return [];
  const out = await git(root, [
    'log',
    `-n${Math.max(1, Math.trunc(Number(limit) || LOG_LIMIT))}`,
    '-S', text,
    '--format=%H%x1f%aI%x1f%s',
    '--', rel,
  ]);
  if (out === null) return [];
  return out.split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [commit, date, subject] = line.split('\x1f');
      return { commit, date: date ?? null, subject: subject ?? null };
    })
    .filter((row) => /^[0-9a-f]{40}$/u.test(String(row.commit ?? '')));
}

/**
 * The path a file had at one commit, following renames.
 *
 * A citation captured before a rename no longer resolves under its current
 * path. `--follow --name-status` walks the history and usually yields the old
 * name; a failure simply returns the path unchanged.
 * @param root - absolute workspace root.
 * @param commit - the anchor's commit.
 * @param path - the current path.
 * @returns the path to try at that commit.
 */
export async function pathAtCommit(root, commit, path) {
  const rel = gitPath(path);
  if (rel === '') return rel;
  const out = await git(root, [
    'log', '--follow', '--name-status', '--format=%H', '-n', '40', '--', rel,
  ]);
  if (out === null || out.trim() === '') return rel;
  const rev = String(commit ?? '').trim();
  let candidate = rel;
  let current = '';
  for (const raw of out.split('\n')) {
    const line = raw.trim();
    if (/^[0-9a-f]{40}$/u.test(line)) {
      current = line;
      continue;
    }
    const parts = line.split('\t');
    if (parts[0]?.startsWith('R') && parts.length >= 3 && current !== '') {
      // A rename row belongs to the commit above it; the old name is the path
      // this commit's ancestors used.
      if (rev !== '' && rev.startsWith(current.slice(0, current.length))) candidate = parts[1];
    }
  }
  if (candidate !== rel) {
    const probe = await showFileAtCommit(root, commit, candidate);
    if (probe !== null) return candidate;
  }
  return rel;
}

/** Whether `root` sits inside a git work tree. */
export async function isGitRepo(root) {
  const out = await git(root, ['rev-parse', '--is-inside-work-tree'], 4000);
  return out !== null && out.trim() === 'true';
}
