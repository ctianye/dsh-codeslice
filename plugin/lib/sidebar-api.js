/**
 * The `/sidebar/api` wire, reimplemented for the vendored Better Sidebar client.
 *
 * Upstream ships a 392 KB host half that pulls `@deepseek-ai/dsh-settings`,
 * `dsh-tools`, `dsh-llm`, `dsh-agent`, `dsh-subagent`, `ws` and `yaml` — a
 * dependency set this profile cannot resolve from a vendored directory. The
 * client only needs a small, read-mostly slice of that wire to browse and edit
 * code, so this module implements exactly those methods against CodeSlice's
 * own path handling:
 *
 *   fs.tree | fs.trees | fs.read | fs.readPage | fs.search
 *   fs.mkdir | fs.createFile | fs.rename | fs.remove
 *
 * Every other upstream method (git.*, sidechat.*, subagents.*, teams.*,
 * workflows.*) answers a structured `unsupported` error. The client renders
 * that error inside its own panel instead of blanking the page, and the tabs
 * that need Git or chat simply degrade.
 *
 * Wire shape (from `src/wire.ts` upstream):
 *   success 200 `{ ok: true, value: <result> }`
 *   failure 4xx/5xx `{ ok: false, error: { code, message } }`
 *
 * Every request carries `sessionId` and, while the session is still hydrating,
 * its `cwd`. Paths are resolved against that root and must stay inside it.
 */

import { promises as fs } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

/** Upstream's editable-file ceiling: above this the client pages the file. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
/** Bytes sniffed for binary detection / viewer detection. */
const HEAD_BYTES = 4096;
/** One explorer level's cap, matching upstream's truncation contract. */
const MAX_ENTRIES = 400;

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.pdf',
  '.zip', '.gz', '.tgz', '.7z', '.rar', '.exe', '.dll', '.so', '.dylib', '.class',
  '.jar', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.wav', '.webm',
]);

class SidebarError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** JSON response helper. */
function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value });
}

function writeError(res, error) {
  if (error instanceof SidebarError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } });
}

/** Read a JSON body with a size bound; a malformed body is a 400. */
function readJsonBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectBody(new SidebarError('payload-too-large', 'request body is too large', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        rejectBody(new SidebarError('bad-json', 'request body is not valid JSON', 400));
      }
    });
    req.on('error', rejectBody);
  });
}

function requireString(payload, key) {
  const value = payload?.[key];
  if (typeof value !== 'string' || value === '') {
    throw new SidebarError('bad-request', `"${key}" is required`, 400);
  }
  return value;
}

/**
 * Resolve one request's workspace root.
 *
 * Order: the host's own session record (authoritative), the client's summary
 * `cwd` (present only while the session is hydrating), then the plugin's
 * default workspace. A session that has no cwd is a client error, not a
 * fallback to the process cwd — silently reading another directory is worse
 * than an honest failure.
 */
function rootOf(ctx, payload, fallback) {
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
  let sessionCwd;
  try {
    const sessions = ctx.get('sessions');
    sessionCwd = sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd;
  } catch {
    sessionCwd = undefined;
  }
  const cwd = typeof sessionCwd === 'string' && sessionCwd !== ''
    ? sessionCwd
    : (typeof payload?.cwd === 'string' && payload.cwd !== '' ? payload.cwd : fallback);
  if (typeof cwd !== 'string' || cwd === '') {
    throw new SidebarError('no-root', 'no workspace directory is available', 400);
  }
  return resolve(cwd);
}

/** True when `candidate` is the root or lives under it. */
function within(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`) && !/^[A-Za-z]:/.test(rel));
}

/**
 * Resolve one payload path under the request's root.
 *
 * The client sends absolute paths it received from the tree; a relative path
 * (a fresh editor tab) resolves against the root. Both must stay inside it.
 */
function pathOf(root, payload, key = 'path') {
  const raw = payload?.[key];
  if (typeof raw !== 'string' || raw === '') {
    throw new SidebarError('bad-request', `"${key}" is required`, 400);
  }
  const absolute = resolve(root, raw);
  if (!within(root, absolute)) {
    throw new SidebarError('forbidden-path', 'path escapes the workspace root', 403);
  }
  return absolute;
}

/** One explorer row. */
async function entryOf(root, parent, name) {
  const absolute = join(parent, name);
  if (!within(root, absolute)) return undefined;
  const path = absolute;
  let stat;
  try {
    stat = await fs.lstat(absolute);
  } catch {
    return { name, path, isDir: false, hidden: name.startsWith('.'), isSymlink: false, broken: true };
  }
  const isSymlink = stat.isSymbolicLink();
  let isDir = stat.isDirectory();
  let broken = false;
  if (isSymlink) {
    try {
      const target = await fs.stat(absolute);
      isDir = target.isDirectory();
    } catch {
      broken = true;
      isDir = false;
    }
  }
  return { name, path, isDir, hidden: name.startsWith('.'), isSymlink, broken };
}

/** One directory level, sorted folders-first then case-insensitive by name. */
async function listLevel(root, absolute) {
  const names = await fs.readdir(absolute);
  const entries = [];
  let truncated = false;
  for (const name of names) {
    if (entries.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    const entry = await entryOf(root, absolute, name);
    if (entry !== undefined) entries.push(entry);
  }
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.isDir ? -1 : 1));
  return { path: absolute, entries, truncated };
}

/** Decode one file: text, binary, or too-large, matching the client's union. */
async function readOne(root, absolute) {
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new SidebarError('not-a-file', 'the path is not a regular file', 400);
  const ext = extname(absolute).toLowerCase();
  const size = stat.size;
  const mtimeMs = stat.mtimeMs;
  if (BINARY_EXT.has(ext)) {
    const head = (await fs.readFile(absolute)).subarray(0, HEAD_BYTES).toString('base64');
    return { kind: 'binary', size, mtimeMs, head };
  }
  if (size > MAX_TEXT_BYTES) {
    const head = (await fs.readFile(absolute)).subarray(0, HEAD_BYTES).toString('base64');
    return { kind: 'too-large', size, mtimeMs, head };
  }
  const buffer = await fs.readFile(absolute);
  if (buffer.subarray(0, HEAD_BYTES).includes(0)) {
    return { kind: 'binary', size, mtimeMs, head: buffer.subarray(0, HEAD_BYTES).toString('base64') };
  }
  return { kind: 'text', content: buffer.toString('utf8'), size, mtimeMs };
}

/** Page one large text file from a byte offset, trimming to a line break. */
async function readPage(root, absolute, offset) {
  const stat = await fs.stat(absolute);
  const start = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0;
  const length = Math.min(256 * 1024, Math.max(0, stat.size - start));
  const handle = await fs.open(absolute, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    let text = buffer.toString('utf8');
    const eof = start + length >= stat.size;
    if (!eof) {
      const breakAt = text.lastIndexOf('\n');
      if (breakAt > 0) text = text.slice(0, breakAt + 1);
    }
    return {
      kind: 'text',
      text,
      offset: start,
      nextOffset: eof ? stat.size : start + Buffer.byteLength(text),
      eof,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      encoding: 'utf8',
    };
  } finally {
    await handle.close();
  }
}

/** Reject a name that is a path separator, a dot-entry, or empty. */
function safeName(name) {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new SidebarError('bad-name', 'the name is not a plain file name', 400);
  }
  return name;
}

/**
 * Filename search under the root (the explorer's quick-open).
 *
 * A breadth-first walk bounded by `limit` names and a wall clock; the client
 * asks for at most a few hundred matches and renders its own truncation flag.
 */
async function searchNames(root, query, limit) {
  const needle = query.toLowerCase();
  const matches = [];
  const dirs = [];
  let truncated = false;
  const deadline = Date.now() + 4000;
  const queue = [root];
  while (queue.length > 0) {
    if (Date.now() > deadline || matches.length >= limit) {
      truncated = true;
      break;
    }
    const dir = queue.shift();
    let names;
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === '.git' || name === 'node_modules') continue;
      const absolute = join(dir, name);
      const rel = relative(root, absolute).split(sep).join('/');
      let isDir = false;
      try {
        isDir = (await fs.stat(absolute)).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        dirs.push(rel);
        if (queue.length < 2000) queue.push(absolute);
      } else if (name.toLowerCase().includes(needle)) {
        matches.push(rel);
        if (matches.length >= limit) {
          truncated = true;
          break;
        }
      }
    }
  }
  return { matches, dirs: dirs.slice(0, 50), truncated };
}

/** Read a raw text body with a size bound. */
function readTextBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectBody(new SidebarError('payload-too-large', 'document is too large to save', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', rejectBody);
  });
}

/**
 * Save one document: the raw write route the editor's save button uses.
 *
 * `POST /sidebar/write?sessionId&path&cwd&expectedMtimeMs`, body is the
 * document with LF line endings. The file's own line ending and BOM are
 * restored, and an `expectedMtimeMs` mismatch refuses with `fs-conflict` so a
 * save cannot silently overwrite someone else's edit.
 */
async function writeDocument(ctx, req, fallbackRoot) {
  const url = new URL(req.url ?? '/', 'http://dsh.internal');
  const payload = {
    sessionId: url.searchParams.get('sessionId') ?? '',
    cwd: url.searchParams.get('cwd') ?? '',
    path: url.searchParams.get('path') ?? '',
  };
  const root = rootOf(ctx, payload, fallbackRoot);
  const absolute = pathOf(root, payload);
  const expected = Number(url.searchParams.get('expectedMtimeMs'));
  let current;
  try {
    current = await fs.stat(absolute);
  } catch {
    current = undefined;
  }
  if (Number.isFinite(expected) && expected > 0 && current !== undefined
    && Math.abs(current.mtimeMs - expected) > 2) {
    throw new SidebarError('fs-conflict', 'the file changed on disk since it was opened', 409);
  }
  const body = (await readTextBody(req)).toString('utf8');
  let existing = '';
  try {
    existing = (await fs.readFile(absolute, 'utf8')).slice(0, 20000);
  } catch {
    existing = '';
  }
  const crlf = existing.includes('\r\n');
  const bom = existing.charCodeAt(0) === 0xfeff;
  let text = body.replace(/\r\n/gu, '\n');
  if (crlf) text = text.replace(/\n/gu, '\r\n');
  if (bom && !text.startsWith('\uFEFF')) text = `\uFEFF${text}`;
  await fs.writeFile(absolute, text, 'utf8');
  const after = await fs.stat(absolute);
  return { ok: true, mtimeMs: after.mtimeMs };
}

/**
 * Build the dispatcher.
 *
 * @param ctx - host context with `sessions` and a default workspace.
 * @param fallbackRoot - the plugin's configured default directory.
 * @returns `{handleWrite}` for the `/sidebar/write` exact route.
 */
export function createSidebarWrite(ctx, fallbackRoot) {
  return {
    async handle(req, res) {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
        return;
      }
      try {
        const value = await writeDocument(ctx, req, fallbackRoot);
        writeOk(res, value);
      } catch (error) {
        writeError(res, error);
      }
    },
  };
}

/**
 * Build the dispatcher.
 *
 * @param ctx - host context with `sessions` and a default workspace.
 * @param fallbackRoot - the plugin's configured default directory.
 * @returns `{handle}` for the `/sidebar/api` prefix route.
 */
export function createSidebarApi(ctx, fallbackRoot) {
  const handlers = {
    'fs.tree': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const absolute = pathOf(root, payload, 'path');
      return listLevel(root, absolute);
    },
    'fs.trees': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const paths = Array.isArray(payload?.paths) ? payload.paths : [];
      const levels = [];
      for (const path of paths.slice(0, 32)) {
        try {
          const absolute = pathOf(root, { path }, 'path');
          levels.push(await listLevel(root, absolute));
        } catch (error) {
          levels.push({ path: path, entries: [], truncated: false, error: String(error?.message ?? error) });
        }
      }
      return { levels };
    },
    'fs.read': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      return readOne(root, pathOf(root, payload));
    },
    'fs.readPage': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      return readPage(root, pathOf(root, payload), Number(payload?.offset));
    },
    'fs.search': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const query = typeof payload?.query === 'string' ? payload.query : '';
      const limit = Number.isFinite(payload?.limit) ? Math.trunc(payload.limit) : 200;
      return searchNames(root, query, Math.max(10, Math.min(600, limit)));
    },
    'fs.mkdir': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const parent = pathOf(root, payload);
      safeName(requireString(payload, 'name'));
      const created = join(parent, payload.name);
      await fs.mkdir(created);
      return { path: created };
    },
    'fs.createFile': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const parent = pathOf(root, payload);
      safeName(requireString(payload, 'name'));
      const created = join(parent, payload.name);
      await fs.writeFile(created, '', { flag: 'wx' });
      return { path: created };
    },
    'fs.rename': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const from = pathOf(root, payload);
      safeName(requireString(payload, 'name'));
      const to = join(dirname(from), payload.name);
      await fs.rename(from, to);
      return { path: to };
    },
    'fs.remove': async (payload) => {
      const root = rootOf(ctx, payload, fallbackRoot);
      const target = pathOf(root, payload);
      if (target === root) throw new SidebarError('bad-request', 'refusing to remove the workspace root', 400);
      await fs.rm(target, { recursive: true, force: false });
      return { path: target };
    },
  };

  /**
   * One request. Only POST, only single-segment method names, only the
   * handlers above; everything else is a named, renderable failure.
   */
  async function handle(req, res) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://dsh.internal');
    const raw = url.pathname.startsWith('/sidebar/api/') ? url.pathname.slice('/sidebar/api/'.length) : '';
    if (raw === '' || raw.includes('/')) {
      writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown sidebar API method' } });
      return;
    }
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      writeError(res, error);
      return;
    }
    const handler = handlers[raw];
    if (handler === undefined) {
      writeJson(res, 200, {
        ok: false,
        error: {
          code: 'unsupported',
          message: `Method "${raw}" is not available in the vendored sidebar: only file browsing, reading and editing are wired up.`,
        },
      });
      return;
    }
    try {
      const value = await handler(payload);
      writeOk(res, value);
    } catch (error) {
      writeError(res, error);
    }
  }

  return { handle };
}

/** The methods this module answers; exported for tests and diagnostics. */
export const SIDEBAR_METHODS = [
  'fs.tree', 'fs.trees', 'fs.read', 'fs.readPage', 'fs.search',
  'fs.mkdir', 'fs.createFile', 'fs.rename', 'fs.remove',
];
