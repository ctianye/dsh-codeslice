/**
 * Shared "take me back to this code range" behavior.
 *
 * The composer's range label and a note's code reference both need the same
 * result: expand the right sidebar, open the file in the tab owned by the
 * current session, and scroll the editor to the quoted lines. Keeping this in
 * one module means the two entry points cannot drift apart (one using
 * `openFile(path#Lx)` and the other using a real range, for example).
 */

import { api } from './api.js';
import { setSelection } from './selection-store.js';

/** The path shown by the editor tab that owns one CodeMirror surface. */
function editorPath(editor) {
  let ancestor = editor.parentElement;
  for (let depth = 0; ancestor !== null && depth < 6; depth += 1) {
    const input = ancestor.querySelector('input[class*="editorPathInput"]')
      ?? [...ancestor.querySelectorAll('input')].find((candidate) => candidate.value.includes('.'));
    if (input !== undefined && input !== null && input.value.trim() !== '') return input.value.trim();
    ancestor = ancestor.parentElement;
  }
  return '';
}

/** Turn a possibly absolute path into the workspace-relative form frames use. */
function relativeTo(root, path) {
  const normalRoot = String(root ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '');
  const normalPath = String(path ?? '').replace(/\\/gu, '/');
  if (normalRoot !== '' && normalPath.toLowerCase().startsWith(`${normalRoot.toLowerCase()}/`)) {
    return normalPath.slice(normalRoot.length + 1);
  }
  return normalPath;
}

/** Read the line-number gutter row for one 1-based line, if it is rendered. */
function findLineRow(editor, lineNumber) {
  const rows = [...editor.querySelectorAll('.cm-gutterElement')]
    .map((element) => ({ element, line: Number(element.textContent.trim()) }))
    .filter((row) => Number.isFinite(row.line) && row.line > 0);
  const gutters = rows.filter((row) => row.line === lineNumber);
  if (gutters.length === 0) return undefined;
  const editorRect = editor.getBoundingClientRect();
  // A wrapped line can expose more than one visual row; pick the one nearest
  // the editor viewport so a scroll lands predictably even when it is offscreen.
  return gutters.sort((a, b) => {
    const ar = a.element.getBoundingClientRect();
    const br = b.element.getBoundingClientRect();
    return Math.abs(ar.top - editorRect.top) - Math.abs(br.top - editorRect.top);
  })[0];
}

/** Scroll one open sidebar editor to the selected line. */
function scrollEditorTo(selection) {
  const editors = [...document.querySelectorAll('.cm-editor')]
    .filter((editor) => editor.offsetParent !== null && editor.getBoundingClientRect().width > 0);
  const target = editors.find((editor) => {
    const path = editorPath(editor);
    if (path === '') return false;
    const a = path.replace(/\\/gu, '/');
    const b = selection.path.replace(/\\/gu, '/');
    return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
  }) ?? editors[0];
  if (target === undefined) return false;
  const scroller = target.querySelector('.cm-scroller');
  if (scroller === null) return false;
  const line = target.querySelector('.cm-line');
  const lineHeight = line === null ? 19 : Math.max(12, line.getBoundingClientRect().height);

  // The document can contain wrapped lines and folds, so multiplying a fixed
  // line height is not the same as the actual DOM top of line N. Scroll by the
  // measured delta when the line is rendered; the arithmetic remains only as a
  // fallback for a line CodeMirror has not materialized yet.
  const row = findLineRow(target, selection.startLine);
  if (row !== undefined) {
    const editorRect = target.getBoundingClientRect();
    const rowRect = row.element.getBoundingClientRect();
    const delta = rowRect.top - editorRect.top - 64;
    scroller.scrollTop = Math.max(0, Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      scroller.scrollTop + delta,
    ));
    return true;
  }
  scroller.scrollTop = Math.max(0, (selection.startLine - 3) * lineHeight);
  return true;
}

/** Resolve a frame's current anchored range before revealing it. */
async function currentRange(ctx, selection, root, sessionId) {
  const relative = relativeTo(root, selection.path);
  try {
    const value = await api(ctx, 'frames', {
      op: 'list',
      root,
      path: relative,
      sessionId,
    });
    const frames = Array.isArray(value?.frames) ? value.frames : [];
    const frame = frames.find((row) => String(row.path).replace(/\\/gu, '/') === relative
      && Number(row.startLine) === Number(selection.startLine)
      && Number(row.endLine) === Number(selection.endLine));
    if (frame === undefined || frame === null) return selection;
    const startLine = Number(frame.actualStart ?? frame.startLine);
    const endLine = Number(frame.actualEnd ?? frame.endLine);
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return selection;
    return { ...selection, startLine, endLine };
  } catch {
    return selection;
  }
}

/**
 * Reveal a code range in the vendored sidebar.
 *
 * The editor is opened by path (one tab per file, Better Sidebar's VS Code
 * behavior) and scrolled to the range; the frame overlay then draws the box on
 * top. A failure returns `false` so the caller can decide not to navigate
 * somewhere else.
 *
 * @param ctx - the client context.
 * @param selection - `{path, startLine, endLine}` in workspace-relative form.
 * @param root - the workspace root, used to turn the relative path absolute.
 * @param sessionId - the session whose right sidebar owns the tab.
 * @returns whether an editor was found and scrolled.
 */
export function revealCodeRange(ctx, selection, root, sessionId) {
  if (selection === null || selection === undefined) return false;
  const sidebar = typeof ctx?.get === 'function' ? ctx.get('betterSidebar') : undefined;
  if (sidebar === undefined || sidebar === null || typeof sidebar.openFile !== 'function') return false;
  const raw = selection.path;
  const absolute = /^[A-Za-z]:[\\/]/u.test(raw) || raw.startsWith('/')
    ? raw
    : `${String(root ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '')}/${raw.replace(/^\.?\//u, '')}`;
  const base = typeof selection.title === 'string' && selection.title !== ''
    ? selection.title
    : (raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw);
  try {
    const right = ctx.get('sidebarRight');
    if (right !== undefined && right !== null && typeof right.isExpanded === 'function' && right.isExpanded() === false) {
      right.toggleExpanded?.();
    }
    right?.focus?.();
  } catch {
    // A collapsed sidebar still opens its tab; the panel toggle is best effort.
  }
  // Better Sidebar's `openFile` expects a plain SessionScope; the live
  // `sessions.scope()` value is a Cordis context whose properties are only
  // readable inside its own injection scope. Use the two fields the service
  // actually consumes instead of passing that context proxy through.
  const scope = { sessionId, cwd: root };
  try {
    sidebar.openFile(scope, absolute, base);
  } catch {
    return false;
  }

  const aligned = (range) => scrollEditorTo({ ...range, path: absolute });
  currentRange(ctx, selection, root, sessionId).then((range) => {
    // Keep the composer's label in sync with an anchor that moved; otherwise
    // the next click would scroll to the old number again.
    if (range.startLine !== selection.startLine || range.endLine !== selection.endLine) {
      setSelection({ path: selection.path, startLine: range.startLine, endLine: range.endLine, code: '' }, sessionId);
    }
    setTimeout(() => aligned(range), 350);
    setTimeout(() => aligned(range), 900);
  }).catch(() => {
    setTimeout(() => scrollEditorTo({ ...selection, path: absolute }), 350);
    setTimeout(() => scrollEditorTo({ ...selection, path: absolute }), 900);
  });
  return true;
}

/** The editor path helper, exported for callers that need to identify a tab. */
export { editorPath };
