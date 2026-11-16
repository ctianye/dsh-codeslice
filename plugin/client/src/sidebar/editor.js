/**
 * The CodeMirror host for the reader pane.
 *
 * Reuses the lazy editor chunk (`client/editor.js`, loaded through
 * `loadEditor`) rather than wrapping CodeMirror in another React root: the chunk
 * exposes an imperative `create(container, options)` handle, and this module
 * owns mounting, decoration updates and teardown.
 *
 * Decorations carried per window:
 *   - `symbols` / `annotations` / `notes` — from the `code` response;
 *   - `pick` — the current line selection;
 *   - `frames` — the registered ranges (top/bottom 2px borders + tint);
 *   - `flash` — a one-shot reveal highlight.
 *
 * The editor itself is read-only with line numbers and syntax highlighting;
 * both gestures (gutter number click, text drag) report the same line span.
 */

import { useState, useEffect, useRef, useCallback } from '../icons.js';
import { loadEditor } from '../assets.js';
import { Glyph, h } from '../icons.js';

/**
 * Normalise the active pick into the decoration shape the chunk expects.
 * @param pick - `{start, end}` or null/undefined.
 * @returns `{startLine, endLine}` or null.
 */
function sbPickSpec(pick) {
  if (pick === null || pick === undefined || pick.start === undefined) return null;
  const first = Math.min(Number(pick.start), Number(pick.end ?? pick.start));
  const last = Math.max(Number(pick.start), Number(pick.end ?? pick.start));
  return { startLine: first, endLine: last };
}

/**
 * Map the deduped frame records onto the chunk's frame decoration rows.
 * @param frames - deduped records for the active file.
 * @returns `[{startLine, endLine, status}]`.
 */
function sbFrameSpecs(frames) {
  return (Array.isArray(frames) ? frames : []).map((frame) => ({
    startLine: Number(frame.startLine),
    endLine: Number(frame.endLine ?? frame.startLine),
    status: frame.status ?? 'fresh',
  }));
}

/**
 * The editor host.
 *
 * @param props - `{ctx, file, pick, frames, flash, onSelection, onGutterPick, t}`.
 *   `file` is the `code` response; `pick` is the active tab's selection;
 *   `onSelection({startLine,endLine}|null)` reports text drags;
 *   `onGutterPick(line)` reports gutter clicks.
 * @returns the host node.
 */
export function SbEditorHost(props) {
  const { ctx, file, pick, frames, flash, onSelection, onGutterPick, t } = props;

  const hostRef = useRef(null);
  const handleRef = useRef(undefined);
  const [api, setApi] = useState(undefined);
  const [error, setError] = useState(undefined);
  const [nonce, setNonce] = useState(0);

  /* ---- load the lazy chunk once ------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    loadEditor(ctx).then((namespace) => {
      if (!cancelled) setApi(namespace);
    }).catch((caught) => {
      if (!cancelled) setError(caught && caught.message ? caught.message : String(caught));
    });
    return () => { cancelled = true; };
  }, [ctx, nonce]);

  /* ---- one handle per loaded window ---------------------------------- */

  const startLine = Number.isFinite(Number(file?.startLine)) ? Number(file.startLine) : 1;

  useEffect(() => {
    if (api === undefined || hostRef.current === null) return undefined;
    if (file === undefined || file.found === false) return undefined;

    const handle = api.create(hostRef.current, {
      doc: file.text ?? '',
      startLine,
      language: file.language ?? '',
      decorations: {
        symbols: file.symbols,
        annotations: file.annotations,
        notes: file.notes,
        pick: sbPickSpec(pick),
        frames: sbFrameSpecs(frames),
        flash,
      },
      onSelection,
      onGutterPick,
    });
    handleRef.current = handle;

    // Restore this tab's last selection once the window is up.
    const spec = sbPickSpec(pick);
    if (spec !== null) {
      handle.setSelection(spec.startLine, spec.endLine);
      handle.scrollToLine(spec.startLine);
    }
    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = undefined;
    };
  }, [api, file, startLine, pick, frames, flash, onSelection, onGutterPick]);

  /* ---- decorations follow selection / frames without a remount ------ */

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === undefined) return;
    const spec = sbPickSpec(pick);
    handle.setDecorations({
      symbols: file?.symbols,
      annotations: file?.annotations,
      notes: file?.notes,
      pick: spec,
      frames: sbFrameSpecs(frames),
      flash,
    });
    if (spec === null) handle.clearSelection?.();
  }, [file?.symbols, file?.annotations, file?.notes, pick, frames, flash]);

  const retry = useCallback(() => {
    setApi(undefined);
    setError(undefined);
    setNonce((current) => current + 1);
  }, []);

  return h('div', { className: 'cs-sb-editor-wrap', 'data-cs': 'editor' },
    h('div', { ref: hostRef, className: 'cs-sb-editor-host' }),
    api === undefined && error === undefined
      ? h('div', { className: 'cs-sb-editor-note' },
        h('span', { className: 'cs-spin' }, Glyph.spinner(11)),
        h('span', null, t('reader.editor.loading')))
      : null,
    error === undefined
      ? null
      : h('div', { className: 'cs-sb-editor-note' },
        h('span', null, t('reader.editor.failed')),
        h('button', { type: 'button', className: 'cs-btn cs-small', onClick: retry }, t('reader.tree.retry'))));
}
