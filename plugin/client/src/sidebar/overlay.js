/**
 * CodeSlice's layer on top of the vendored Better Sidebar editor.
 *
 * The upstream editor is used as-is (CodeMirror 6, its themes, its tabs, its
 * own "add to conversation" selection popup). This module adds the three
 * things CodeSlice needs without forking the editor:
 *
 *   1. a **range frame**: one accent box spanning the recorded line range,
 *      drawn as an absolutely positioned overlay over the editor's content;
 *   2. a **title bar** above the first visible line of that range — the
 *      "小标题条" — carrying the range label; clicking it opens the session
 *      that asked about the range;
 *   3. a **"添加到对话"** action next to a fresh selection, which creates a new
 *      conversation, inserts the quote chip into its composer, and records a
 *      frame for that conversation.
 *
 * Geometry comes from the editor's own DOM, not from a private view object:
 * CodeMirror renders one `.cm-line` per document line and a line-number gutter
 * whose elements share the line's exact `top`. That is enough to map a
 * document line to a pixel band for the visible viewport, and it survives
 * upstream upgrades because both nodes are public rendering, not internals.
 *
 * Everything is additive: no editor state is mutated, no DOM inside the
 * editor's own subtree is replaced, and removing the layer only removes nodes
 * this module created.
 */

import { api } from '../api.js';
import { revealCodeRange } from '../reveal-code.js';
import {
  getContextEnabled, setContextEnabled, setSelection,
} from '../selection-store.js';

const STYLE_ID = 'codeslice-overlay-style';const EDITOR_FLAG = 'data-codeslice-overlay';
const FRAME_REFRESH_MS = 1800;

const OVERLAY_CSS = `
.cs-frame-layer { position: absolute; inset: 0; pointer-events: none; z-index: 4; overflow: hidden; }
.cs-frame-box { position: absolute; border-top: 2px solid var(--cs-accent, #4f8cff); border-bottom: 2px solid var(--cs-accent, #4f8cff); background: color-mix(in srgb, var(--cs-accent, #4f8cff) 8%, transparent); pointer-events: none; }
.cs-frame-title { position: absolute; height: 19px; line-height: 19px; padding: 0 8px; box-sizing: border-box; border-radius: 4px 4px 0 0; background: var(--cs-accent, #4f8cff); color: #fff; font: 11px/19px var(--dsw-font-sans, system-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: auto; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.cs-frame-title:hover { filter: brightness(1.08); }
/* The upstream editor portals its own "添加到对话" popup to document.body.
   CodeSlice owns that gesture now (it has to create the conversation first),
   so the upstream button is hidden and this one takes its place. */
[class*="selectionPopup"] { display: none !important; }
.cs-add-chip { position: absolute; z-index: 6; pointer-events: auto; box-sizing: border-box; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1, #d0d0d0); border-radius: 6px; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff)); color: var(--dsw-alias-label-primary, #111); font: 11px/26px var(--dsw-font-sans, system-ui); white-space: nowrap; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
.cs-add-chip:hover { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover, #f2f2f2)); }
.cs-add-chip[hidden] { display: none !important; }
.cs-frame-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; margin-right: 4px; }
`;

/** Inject the layer stylesheet once. Returns the element this call created. */
function ensureStyle() {
  if (typeof document === 'undefined') return undefined;
  const existing = document.getElementById(STYLE_ID);
  if (existing !== null) return undefined;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.dataset.codeslice = 'overlay';
  style.textContent = OVERLAY_CSS;
  document.head.append(style);
  return style;
}

/** The document line number rendered by a `.cm-line`, from the gutter row at the same `top`. */
function lineNumberAt(line, gutterRows) {
  const top = line.getBoundingClientRect().top;
  let best;
  let distance = Infinity;
  for (const row of gutterRows) {
    const delta = Math.abs(row.top - top);
    if (delta < distance) {
      distance = delta;
      best = row;
    }
  }
  return distance <= 2 ? best.line : undefined;
}

/** Read the visible line bands of one editor, keyed by document line. */
function visibleLines(editor) {
  const editorRect = editor.getBoundingClientRect();
  const gutterRows = [...editor.querySelectorAll('.cm-gutterElement')]
    .map((element) => ({ top: element.getBoundingClientRect().top, line: Number(element.textContent.trim()) }))
    .filter((row) => Number.isFinite(row.line) && row.line > 0);
  const lines = [...editor.querySelectorAll('.cm-line')];
  const bands = new Map();
  let contentLeft = editorRect.width;
  let contentRight = 0;
  for (const line of lines) {
    const number = lineNumberAt(line, gutterRows);
    if (number === undefined) continue;
    const rect = line.getBoundingClientRect();
    bands.set(number, { top: rect.top - editorRect.top, bottom: rect.bottom - editorRect.top });
    contentLeft = Math.min(contentLeft, rect.left - editorRect.left);
    contentRight = Math.max(contentRight, rect.right - editorRect.left);
  }
  return { bands, editorRect, contentLeft, contentRight };
}

/** The file path shown by the editor tab that owns this editor. */
function pathOf(editor) {
  let ancestor = editor.parentElement;
  for (let depth = 0; ancestor !== null && depth < 6; depth += 1) {
    const input = ancestor.querySelector('input[class*="editorPathInput"]')
      ?? [...ancestor.querySelectorAll('input')].find((candidate) => candidate.value.includes('.'));
    if (input !== undefined && input !== null && input.value.trim() !== '') return input.value.trim();
    ancestor = ancestor.parentElement;
  }
  return '';
}

/** Normalise a path to the POSIX relative form the frames store uses. */
function relativeOf(root, path) {
  if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) return path.replace(/\\/gu, '/');
  const normalRoot = root.replace(/\\/gu, '/').replace(/\/+$/u, '');
  const normalPath = path.replace(/\\/gu, '/');
  if (normalPath.toLowerCase().startsWith(`${normalRoot.toLowerCase()}/`)) {
    return normalPath.slice(normalRoot.length + 1);
  }
  return normalPath;
}

/** The workspace root and session that own one editor path. */
function scopeOf(ctx, path) {
  let sessions;
  try {
    sessions = ctx.get('sessions');
  } catch {
    sessions = undefined;
  }
  const byId = sessions?.list?.getSnapshot?.()?.byId ?? {};
  let ids = [];
  try {
    ids = [...(sessions?.scopes?.keys?.() ?? [])];
  } catch {
    ids = [];
  }
  const absolute = path.replace(/\\/gu, '/');
  for (const sessionId of ids) {
    const cwd = byId[sessionId]?.cwd;
    if (typeof cwd !== 'string' || cwd === '') continue;
    const normal = cwd.replace(/\\/gu, '/').replace(/\/+$/u, '');
    if (absolute.toLowerCase().startsWith(`${normal.toLowerCase()}/`)) return { sessionId, cwd };
  }
  for (const sessionId of ids) {
    const cwd = byId[sessionId]?.cwd;
    if (typeof cwd === 'string' && cwd !== '') return { sessionId, cwd };
  }
  return { sessionId: ids[0] ?? '', cwd: '' };
}

/**
 * One attached editor.
 *
 * Owns its own layer nodes and listeners; `dispose` removes exactly those.
 */
class EditorOverlay {
  constructor(ctx, editor, handlers) {
    this.ctx = ctx;
    this.editor = editor;
    this.handlers = handlers;
    this.disposed = false;
    this.path = '';
    this.sessionId = '';
    this.titleAttempts = new Set();
    this.root = '';
    this.frames = [];
    this.lastSelection = null;
    this.layer = document.createElement('div');
    this.layer.className = 'cs-frame-layer';
    this.chip = document.createElement('button');
    this.chip.type = 'button';
    this.chip.className = 'cs-add-chip';
    this.chip.hidden = true;
    this.chip.textContent = '添加到对话';
    this.layer.append(this.chip);
    editor.append(this.layer);
    editor.setAttribute(EDITOR_FLAG, '1');

    this.onMouseUp = () => this.readSelection();
    this.onScroll = () => this.scheduleRender();
    this.onKeyUp = () => this.readSelection();
    this.onResize = () => this.scheduleRender();
    this.chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.addToConversation();
    });
    // The layer sits inside the editor, so a mousedown on the chip would bubble
    // and re-read the old selection — which would pop the chip back right after
    // it was used. Keep the chip's own gestures out of the editor's listeners.
    this.chip.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.chip.addEventListener('mouseup', (event) => event.stopPropagation());
    editor.addEventListener('mouseup', this.onMouseUp);
    editor.addEventListener('keyup', this.onKeyUp);
    this.scroller = editor.querySelector('.cm-scroller') ?? editor;
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.onResize) : undefined;
    this.resizeObserver?.observe(editor);
    this.timer = setInterval(() => this.refresh(), FRAME_REFRESH_MS);
    this.refresh();
  }

  /** Re-read the path, reload frames when it changed, and repaint. */
  refresh() {
    if (this.disposed) return;
    const path = pathOf(this.editor);
    if (path !== this.path) {
      this.path = path;
      const scope = path === '' ? { sessionId: '', cwd: '' } : scopeOf(this.ctx, path);
      this.sessionId = scope.sessionId;
      this.root = scope.cwd;
      this.frames = [];
      this.loadFrames();
    } else if (this.frames.length === 0) {
      // A citation records its frame right after the tab opens; without a second
      // look the overlay painted before the record existed and the box never
      // appeared. One extra read per tick is enough to pick it up.
      this.loadFrames();
    }
    this.render();
  }

  /** Load the frames for the current path, across sessions.
   *
   * A frame belongs to the session that asked the question, and every "添加到
   * 对话" opens a new one. If this list were filtered by the editor's current
   * session, a frame created in the new session would never be painted while
   * the user is still looking at the same file. The title carries the owning
   * session, so listing all ranges is enough.
   */
  /** Ask for titles for frames that still carry the old mechanical label. */
  refineLegacyTitles() {
    for (const frame of this.frames) {
      const title = typeof frame?.title === 'string' ? frame.title.trim() : '';
      const mechanical = /^关于\s+[^\s]+\s+第\s*\d+([-–~]\d+)?\s*行$/u.test(title);
      // Only upgrade the current session's frames. The file can be quoted by
      // many conversations; generating a title for every historical session
      // would spend a model call on labels the reader is not looking at.
      if (typeof frame?.sessionId === 'string' && frame.sessionId !== ''
        && frame.sessionId !== this.sessionId) continue;
      if (!mechanical || this.titleAttempts.has(frame.id)) continue;
      this.titleAttempts.add(frame.id);
      void this.refineFrameTitle({
        path: frame.path,
        startLine: frame.startLine,
        endLine: frame.endLine,
        root: this.root,
      }, frame.sessionId ?? this.sessionId, frame, title);
    }
  }

  async loadFrames() {
    if (this.disposed || this.path === '' || this.root === '') return;
    try {
      const value = await api(this.ctx, 'frames', {
        op: 'list',
        root: this.root,
        path: relativeOf(this.root, this.path),
      });
      if (this.disposed) return;
      this.frames = Array.isArray(value?.frames) ? value.frames : [];
      // Frames created before the AI-title change still carry the old
      // "关于 file 第 x-y 行" string. Upgrade them lazily on the next view so the
      // reader does not have to re-add the range to get a real title.
      this.refineLegacyTitles();
      this.render();
    } catch {
      // A missing store is an empty store; the editor keeps working.
    }
  }

  /** Repaint on the next frame, coalescing scroll bursts. */
  scheduleRender() {
    if (this.disposed) return;
    if (this.raf !== undefined) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = undefined;
      this.render();
    });
  }

  /** Draw frames and the current selection chip. */
  render() {
    if (this.disposed) return;
    // Geometry comes from the editor's own DOM. Do not pad `.cm-line` rows: the
    // line-number gutter is laid out independently, and moving text without its
    // gutter row breaks the top-edge pairing this module uses to map line
    // numbers to pixel bands. The bar therefore floats in the row above the
    // range; a range at the very top of the viewport has no row above it, so its
    // bar is skipped rather than painted over the path header.
    const { bands, editorRect, contentLeft, contentRight } = visibleLines(this.editor);
    for (const node of [...this.layer.querySelectorAll('.cs-frame-box, .cs-frame-title')]) node.remove();
    if (bands.size === 0) return;
    const left = Math.max(0, contentLeft - 2);
    const width = Math.max(40, contentRight - contentLeft + 6);

    // Several sessions can quote the same range. Painted one box per range;
    // the newest frame's title (and therefore its session) is the one the
    // clickable title opens.
    const ranges = new Map();
    for (const frame of this.frames) {
      const start = Number(frame.actualStart ?? frame.startLine);
      const end = Number(frame.actualEnd ?? frame.endLine);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      ranges.set(`${start}:${end}`, frame);
    }

    for (const frame of ranges.values()) {
      const start = Number(frame.actualStart ?? frame.startLine);
      const end = Number(frame.actualEnd ?? frame.endLine);
      const visible = [...bands.entries()].filter(([line]) => line >= start && line <= end);
      if (visible.length === 0) continue;
      const first = visible[0][1];
      const last = visible[visible.length - 1][1];
      const box = document.createElement('div');
      box.className = 'cs-frame-box';
      box.style.left = `${left}px`;
      box.style.top = `${first.top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${Math.max(2, last.bottom - first.top)}px`;
      this.layer.append(box);

      if (!bands.has(start) || first.top < 20) continue;
      const title = document.createElement('div');
      title.className = 'cs-frame-title';
      title.style.left = `${left}px`;
      title.style.maxWidth = `${width}px`;
      title.style.top = `${first.top - 19}px`;
      const label = frame.title || `关于 ${this.path} 第 ${start}-${end} 行`;
      title.textContent = label;
      title.title = `${label} · 点击回到发起它的会话`;
      title.addEventListener('mousedown', (event) => event.stopPropagation());
      title.addEventListener('mouseup', (event) => event.stopPropagation());
      title.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.handlers.onOpenSession?.(frame, this.sessionId);
      });
      this.layer.append(title);
    }
  }

  /** Read the current selection and park the chip next to it. */
  readSelection() {
    if (this.disposed) return;
    const selection = window.getSelection();
    const text = selection?.toString() ?? '';
    if (text.trim() === '') {
      this.hideChip();
      // Keep the session's last published range. Switching conversations
      // unmounts the composer, and clearing on every empty mouseup made the
      // label say "未选代码" when the reader came back to the same code.
      return;
    }
    const editorRect = this.editor.getBoundingClientRect();
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const lineOf = (node) => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return element?.closest('.cm-line') ?? null;
    };
    const first = lineOf(anchor) ?? lineOf(focus);
    const last = lineOf(focus) ?? lineOf(anchor);
    if (first === null || last === null) {
      this.hideChip();
      return;
    }
    const { bands } = visibleLines(this.editor);
    const lineNumber = (line) => [...bands.entries()].find(([, band]) => {
      const rect = line.getBoundingClientRect();
      return Math.abs(band.top - (rect.top - editorRect.top)) < 2;
    })?.[0];
    // The band map is keyed by line; recover numbers from the gutter instead.
    const gutterRows = [...this.editor.querySelectorAll('.cm-gutterElement')]
      .map((element) => ({ top: element.getBoundingClientRect().top, line: Number(element.textContent.trim()) }))
      .filter((row) => Number.isFinite(row.line) && row.line > 0);
    const startLine = lineNumberAt(first, gutterRows);
    const endLine = lineNumberAt(last, gutterRows);
    if (startLine === undefined || endLine === undefined) {
      this.hideChip();
      return;
    }
    const start = Math.min(startLine, endLine);
    const end = Math.max(startLine, endLine);
    const range = selection.getRangeAt(0);
    const rangeRect = range.getBoundingClientRect();
    this.lastSelection = {
      path: this.path,
      startLine: start,
      endLine: end,
      code: text,
      sessionId: this.sessionId,
      root: this.root,
    };
    setSelection({
      path: this.path,
      startLine: start,
      endLine: end,
      code: text,
    }, this.sessionId);
    this.chip.hidden = false;
    this.chip.textContent = '添加到对话';
    this.chip.style.left = `${Math.max(4, rangeRect.left - editorRect.left)}px`;
    this.chip.style.top = `${Math.max(2, rangeRect.top - editorRect.top - 32)}px`;
  }

  /** Hide the chip without touching the editor's own selection. */
  hideChip() {
    this.chip.hidden = true;
    this.lastSelection = null;
  }

  /** Create a fresh conversation, put this selection in its composer, record the frame. */
  async addToConversation() {
    const selection = this.lastSelection;
    if (selection === null || selection === undefined) return;
    const useProjectContext = getContextEnabled(selection.sessionId);
    // The final title is a knowledge-point phrase produced by the Host from the
    // selected code. Keep a neutral placeholder while that call is in flight;
    // the old "关于 file 第 x-y 行" is a location, not a title.
    const label = '正在总结这个知识点…';
    this.hideChip();
    // The quote is about to move to a new composer; drop the editor's own selection
    // so a later click does not resurrect the old chip next to a range already used.
    window.getSelection()?.removeAllRanges();

    const sessions = this.ctx.get('sessions');
    const conversation = this.ctx.get('conversation');
    const workspaceService = this.ctx.get('uiWorkspace');
    const root = selection.root || sessions?.list?.getSnapshot?.()?.byId?.[selection.sessionId]?.cwd || '';
    const workspaceItems = workspaceService?.workspaces?.list?.getSnapshot?.()?.items ?? [];
    const normal = (value) => String(value ?? '').replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase();
    const owner = workspaceItems.find((item) => normal(item?.path) === normal(root)
        && Array.isArray(item?.sessionIds) && item.sessionIds.includes(selection.sessionId))
      ?? workspaceItems.find((item) => normal(item?.path) === normal(root))
      ?? workspaceItems.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(selection.sessionId))
      ?? workspaceItems[0];

    if (sessions !== undefined && typeof sessions.create === 'function' && owner !== undefined) {
      try {
        const sessionId = await sessions.create({ workspaceId: owner.workspaceId });
        if (typeof sessionId === 'string' && sessionId !== '') {
          // The quote belongs to the new conversation's composer, so publish the
          // selection under that session too. The original session keeps its
          // own range; switching back to it must not show "未选代码".
          setSelection({
            path: selection.path,
            startLine: selection.startLine,
            endLine: selection.endLine,
            code: selection.code,
          }, sessionId);
          // The new composer inherits the switch the reader had set when they
          // hit "添加到对话"; otherwise the first question there would silently
          // fall back to snippet-only mode.
          setContextEnabled(useProjectContext, sessionId);
          try {
            workspaceService?.openSession?.(sessionId);
          } catch {
            // The new session still exists; the composer below may simply mount later.
          }
          // Better Sidebar's tabs are session-scoped: the new conversation starts
          // with an empty right pane. Let the host swap panes first, then reopen
          // the same file in the new session so the code and its frame stay
          // beside the composer.
          await new Promise((resolve) => setTimeout(resolve, 200));
          revealCodeRange(this.ctx, selection, root, sessionId);
          const input = await this.waitForComposer(sessions, conversation, sessionId);
          if (input !== undefined) {
            const header = `${relativeOf(root, selection.path)}:${selection.startLine}-${selection.endLine}`;
            const code = selection.code.length > 500 ? '' : selection.code;
            const text = code === '' ? header : `\`\`\`${header}\n${code}\n\`\`\``;
            try {
              const snapshot = input.state.getSnapshot();
              if (typeof input.insertReference === 'function' && snapshot.draftRev !== undefined) {
                input.insertReference({
                  source: 'reference',
                  ref: text,
                  label: header,
                  clipboardText: header,
                }, { draftRev: snapshot.draftRev, start: 0, end: 0 });
              } else if (typeof input.setDraft === 'function') {
                input.setDraft(text);
              }
            } catch {
              // The new session is open even if its composer refused the chip.
            }
          }
          const frame = await this.recordFrame(selection, sessionId, label);
          if (frame !== undefined) void this.refineFrameTitle(selection, sessionId, frame, label);
          return;
        }
      } catch (error) {
        this.ctx.logger?.warn?.(`codeslice: new conversation failed: ${String(error?.message ?? error)}`);
      }
    }

    // No session factory (or it failed): keep the old in-place quote so the
    // selection is not lost.
    this.handlers.onAsk?.({
      path: selection.path,
      startLine: selection.startLine,
      endLine: selection.endLine,
      code: selection.code,
    });
    const frame = await this.recordFrame(selection, selection.sessionId, label);
    if (frame !== undefined) void this.refineFrameTitle(selection, selection.sessionId, frame, label);
  }

  /** Wait until the newly opened session's composer exists. */
  async waitForComposer(sessions, conversation, sessionId) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      try {
        const scope = sessions.scope?.(sessionId);
        if (scope !== undefined && scope !== null) {
          const input = conversation?.input?.for(scope);
          if (input?.state?.getSnapshot !== undefined) return input;
        }
      } catch {
        // The session scope is still materialising; retry on the next tick.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  /** Persist the range box for the session that owns the quote. */
  async recordFrame(selection, sessionId, label) {
    const root = selection.root || this.root;
    try {
      const value = await api(this.ctx, 'frames', {
        op: 'create',
        root,
        path: relativeOf(root, selection.path),
        startLine: selection.startLine,
        endLine: selection.endLine,
        sessionId,
        title: label,
        question: `${label}：请解释这段代码在做什么，以及为什么这么写。`,
      });
      await this.loadFrames();
      return value?.frame;
    } catch {
      // The quote already went into the composer; failing to record the box
      // must not cost the reader their question.
      return undefined;
    }
  }

  /** Ask the Host for the knowledge-point title and repaint when it lands. */
  async refineFrameTitle(selection, sessionId, frame, fallbackTitle) {
    if (frame === undefined || frame === null) return;
    const root = selection.root || this.root;
    try {
      await api(this.ctx, 'frames', {
        op: 'title',
        root,
        id: frame.id,
        sessionId,
        path: relativeOf(root, selection.path),
        startLine: selection.startLine,
        endLine: selection.endLine,
        fallbackTitle,
      });
      if (!this.disposed) await this.loadFrames();
    } catch {
      // A model failure leaves the neutral placeholder in place; the note
      // generator can still replace it with its own valid title later.
    }
  }

  /** Remove every node and listener this overlay owns. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.editor.removeEventListener('mouseup', this.onMouseUp);
    this.editor.removeEventListener('keyup', this.onKeyUp);
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
    this.layer.remove();
    this.editor.removeAttribute(EDITOR_FLAG);
  }
}

/**
 * Start the overlay manager.
 *
 * @param ctx - the client context.
 * @param handlers - `{ onAsk, onOpenSession }`; both receive the selection/frame.
 * @returns a disposer that removes every overlay and the observer.
 */
export function startCodeSliceOverlay(ctx, handlers = {}) {
  if (typeof document === 'undefined') return () => {};
  const ownedStyle = ensureStyle();
  /** @type {Map<HTMLElement, EditorOverlay>} */
  const attached = new Map();

  const scan = () => {
    for (const editor of document.querySelectorAll('.cm-editor')) {
      if (attached.has(editor)) continue;
      if (editor.closest('[data-codeslice-overlay]') !== null) continue;
      try {
        attached.set(editor, new EditorOverlay(ctx, editor, handlers));
      } catch {
        // A detached editor or an unsupported layout: leave it alone.
      }
    }
    for (const [editor, overlay] of attached) {
      if (!editor.isConnected) {
        overlay.dispose();
        attached.delete(editor);
      }
    }
  };

  scan();
  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(() => scan())
    : undefined;
  observer?.observe(document.body, { childList: true, subtree: true });
  const timer = setInterval(scan, 1000);

  return () => {
    clearInterval(timer);
    observer?.disconnect();
    for (const overlay of attached.values()) overlay.dispose();
    attached.clear();
    ownedStyle?.remove();
  };
}

