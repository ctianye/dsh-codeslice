/**
 * Frames: the registered code ranges painted over the open file.
 *
 * A frame is one recorded interval `{id, path, startLine, endLine, sessionId,
 * messageId?, title, question, createdAt, status, actualStart?, actualEnd?}`.
 * The line borders themselves are CodeMirror decorations (see `editor.js` and
 * the editor chunk); this module owns the pure-DOM title strips, which the jsdom
 * harness can assert without a real CodeMirror instance.
 *
 * Dedup rule (contract §2.1.5): one box per `path + startLine + endLine`; when
 * the same interval was recorded twice, the newest record wins.
 */

import { h, Glyph } from '../icons.js';

/**
 * Stable dedup key for one record.
 * @param frame - a frames list row.
 * @returns `path:startLine:endLine`.
 */
export function sbFrameKey(frame) {
  return `${String(frame?.path ?? '')}:${Number(frame?.startLine)}:${Number(frame?.endLine)}`;
}

/**
 * Newest-wins dedup, sorted by file order.
 * @param rows - the raw `frames` list from the API.
 * @returns one record per distinct interval, latest first kept.
 */
export function sbDedupeFrames(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row === null || row === undefined) continue;
    const key = sbFrameKey(row);
    const stamp = Number(row.updatedAt ?? row.createdAt ?? 0) || 0;
    const prev = map.get(key);
    if (prev === undefined) {
      map.set(key, { row, stamp });
      continue;
    }
    if (stamp >= prev.stamp) map.set(key, { row, stamp });
  }
  return [...map.values()]
    .map((entry) => entry.row)
    .sort((a, b) => (Number(a.startLine) - Number(b.startLine)) || (Number(a.endLine) - Number(b.endLine)));
}

/**
 * The strip label: the record's title when it has one, otherwise the plain
 * `path:start-end` fallback the contract specifies.
 * @param frame - the record.
 * @returns the label string.
 */
export function sbFrameTitle(frame) {
  const titled = typeof frame?.title === 'string' ? frame.title.trim() : '';
  if (titled !== '') return titled;
  return `${frame.path}:${frame.startLine}-${frame.endLine}`;
}

/**
 * One 19px title strip above a framed range.
 *
 * `data-cs="frame-strip"` plus `data-path` / `data-start` / `data-end` are the
 * harness anchors; the strip is a plain DOM node and never depends on the
 * CodeMirror chunk being loaded.
 *
 * @param props - `{frame, t, onOpenSession, onDelete}`.
 *   `onOpenSession({sessionId, messageId, title, question})` hands the click up
 *   to the integration side, which switches back to the originating session.
 * @returns the strip node.
 */
export function SbFrameStrip(props) {
  const { frame, t, onOpenSession, onDelete } = props;
  const status = frame.status ?? 'fresh';
  const missing = status === 'missing';
  const moved = status === 'moved';
  const label = sbFrameTitle(frame);

  const tooltip = moved && Number.isFinite(Number(frame.actualStart))
    ? `${label} · ${t('reader.frame.movedRange', { start: frame.startLine, end: frame.endLine })} → ${frame.actualStart}-${frame.actualEnd}`
    : label;

  const open = () => {
    if (missing || typeof onOpenSession !== 'function') return;
    onOpenSession({
      sessionId: frame.sessionId,
      messageId: frame.messageId,
      title: typeof frame.title === 'string' ? frame.title : '',
      question: typeof frame.question === 'string' ? frame.question : '',
    });
  };

  const className = `cs-sb-strip${missing ? ' cs-missing' : ''}${moved ? ' cs-moved' : ''}`;

  return h('div', {
    className,
    'data-cs': 'frame-strip',
    'data-path': String(frame.path ?? ''),
    'data-start': String(frame.startLine ?? ''),
    'data-end': String(frame.endLine ?? ''),
    title: tooltip,
  },
    h('button', {
      type: 'button',
      className: 'cs-sb-strip-flag',
      onClick: open,
      disabled: missing,
      title: t('reader.frame.open'),
      'aria-label': t('reader.frame.open'),
    },
      h('span', { className: 'cs-sb-strip-title' }, label)),
    moved
      ? h('span', { className: 'cs-sb-badge cs-warn' },
        t('reader.frame.movedRange', { start: frame.startLine, end: frame.endLine }))
      : null,
    missing
      ? h('span', { className: 'cs-sb-badge cs-bad' }, t('reader.frame.missing'))
      : null,
    !missing && typeof onDelete === 'function'
      ? h('button', {
        type: 'button',
        className: 'cs-sb-strip-delete',
        title: t('reader.frame.delete'),
        'aria-label': t('reader.frame.delete'),
        onClick: () => onDelete(frame),
      }, Glyph.trash(11))
      : null);
}

/**
 * The rail listing every strip of the active file, top to bottom.
 * @param props - `{frames, t, onOpenSession, onDelete}`.
 * @returns the rail node.
 */
export function SbFrameRail(props) {
  const { frames, t, onOpenSession, onDelete } = props;
  if (!Array.isArray(frames) || frames.length === 0) {
    return h('div', { className: 'cs-sb-rail-empty' }, t('reader.frames.none'));
  }
  return h('div', { className: 'cs-sb-rail' },
    frames.map((frame) => h(SbFrameStrip, {
      key: frame.id ?? sbFrameKey(frame),
      frame, t, onOpenSession, onDelete,
    })));
}
