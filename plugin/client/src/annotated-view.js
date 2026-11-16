import { useState, useEffect, useRef, useMemo, useCallback } from './icons.js';
import { makeCaller } from './api.js';
import { Glyph } from './icons.js';
import { formatInt } from './i18n.js';

/**
 * `codeslice:annotated` — a read-only file viewer with annotations.
 *
 * Registered through `registerFileViewer({exts: [], priority: -200,
 * fetchStrategy: 'fsRead'})`, which means **the host reads the file** and hands
 * down `content` (or `largeFile: {size}` past its own threshold). The
 * consequence that shapes this module: line numbers here are real file lines,
 * and an annotation's anchor is checked against the same text the reader sees.
 *
 * Two rules the host imposes:
 *
 *   - a `largeFile` payload must be refused, not truncated: paging a file that
 *     the host already declined to read would duplicate the protection it just
 *     applied, at a worse fidelity;
 *   - `onLineConsumed()` must be called once the requested line has been scrolled
 *     to, or the host will re-apply the jump on every re-render.
 *
 * Annotations are line ranges, created by clicking a start line and then an end
 * line — the reference's gutter is a *picker*, not a selection
 * (`spec §8.5`, invariant 13), and text drags are meaningless in a read-only
 * view, so clicks are the only gesture here.
 */

/** Font/line contract; must match `.cs-av-line` in the stylesheet. */
const LINE_HEIGHT = 21;

/**
 * @param props - the host viewer's props:
 *   `{path, content, largeFile, line, onLineConsumed, scope, ctx, t, locale}`.
 *   `content` is the decoded file text; `largeFile` is `{size}` when the host
 *   refused to read it; `line` is the line to reveal; `onLineConsumed()` tells
 *   the host the jump was applied.
 * @returns the viewer.
 */
export function AnnotatedView(props) {
  const {
    path, content, largeFile, line, onLineConsumed, scope, ctx, t, locale,
  } = props;

  const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  const [annotations, setAnnotations] = useState([]);
  const [error, setError] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState({ start: undefined, end: undefined });
  const [editing, setEditing] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const refused = largeFile !== undefined && largeFile !== null;
  const text = typeof content === 'string' ? content : '';
  const lines = useMemo(() => (refused ? [] : text.split('\n')), [text, refused]);

  /* ---- annotations for this path ---- */

  const reload = useCallback(async () => {
    if (refused || typeof path !== 'string' || path === '') return;
    setLoading(true);
    try {
      const value = await call('annotations', { op: 'list', path });
      if (alive.current) setAnnotations(Array.isArray(value.annotations) ? value.annotations : []);
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call, path, refused]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ---- reveal the requested line, once ---- */

  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current || typeof line !== 'number' || line <= 0 || lines.length === 0) return;
    consumed.current = true;
    const host = scrollRef.current;
    if (host === null || host === undefined) return;
    host.scrollTop = Math.max(0, (line - 3) * LINE_HEIGHT);
    if (typeof onLineConsumed === 'function') onLineConsumed();
  }, [line, lines.length]);

  /** Annotations by first line, so a row can draw its frame without a scan. */
  const byLine = useMemo(() => {
    const map = new Map();
    for (const row of annotations) {
      for (let at = row.startLine; at <= Math.min(row.endLine, lines.length); at += 1) {
        map.set(at, row);
      }
    }
    return map;
  }, [annotations, lines.length]);

  const pickLine = useCallback((number) => {
    setPick((current) => {
      if (current.start === undefined) return { start: number, end: number };
      if (current.end === current.start) return { start: current.start, end: number };
      return { start: number, end: number };
    });
  }, []);

  const save = useCallback(async (title, body) => {
    if (pick.start === undefined) return;
    const startLine = Math.min(pick.start, pick.end ?? pick.start);
    const endLine = Math.max(pick.start, pick.end ?? pick.start);
    setBusy(true);
    try {
      if (editing === undefined) {
        await call('annotations', {
          op: 'create',
          path,
          startLine,
          endLine,
          title,
          body,
        });
      } else {
        await call('annotations', { op: 'update', id: editing.id, title, body });
      }
      if (!alive.current) return;
      setEditing(undefined);
      setPick({ start: undefined, end: undefined });
      await reload();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, editing, path, pick, reload]);

  const remove = useCallback(async (id) => {
    setBusy(true);
    try {
      await call('annotations', { op: 'delete', id });
      if (alive.current) await reload();
    } catch (caught) {
      if (alive.current) setError(caught && caught.message ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [call, reload]);

  /* ---- refused ---- */

  if (refused) {
    return h('div', { className: 'cs-av' },
      h('div', { className: 'cs-av-bar' },
        h('span', { className: 'cs-av-path', title: path }, path),
        h('span', { className: 'cs-tag cs-warn' }, t('annotated.large.title'))),
      h('div', { className: 'cs-av-large' },
        Glyph.alert(26),
        h('b', null, t('annotated.large.title')),
        h('p', null, t('annotated.large.body', { size: formatBytes(largeFile.size, locale) }))));
  }

  const selection = pick.start === undefined ? ''
    : t('annotated.annotation.selected', {
      start: Math.min(pick.start, pick.end ?? pick.start),
      end: Math.max(pick.start, pick.end ?? pick.start),
    });

  return h('div', { className: 'cs-av' },
    h('div', { className: 'cs-av-bar' },
      h('span', { className: 'cs-av-path', title: path }, path),
      h('span', { className: 'cs-tag cs-tabular' }, formatInt(lines.length, locale)),
      annotations.length === 0 ? null : h('span', { className: 'cs-tag' }, formatInt(annotations.length, locale)),
      loading ? h('span', { className: 'cs-spin' }, Glyph.spinner(11)) : null,
      selection === '' ? h('span', { className: 'cs-muted', style: { fontSize: '10px' } }, t('annotated.annotation.hint')) : null,
      selection === '' ? null : h('span', { className: 'cs-tag cs-accent' }, selection),
      selection === '' ? null : h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-primary',
        disabled: busy,
        onClick: () => setEditing({}),
      }, t('annotated.annotation.new')),
      selection === '' ? null : h('button', {
        type: 'button', className: 'cs-btn cs-small', onClick: () => setPick({ start: undefined, end: undefined }),
      }, t('common.cancel'))),

    error === undefined ? null : h('div', { className: 'cs-banner' },
      Glyph.alert(13),
      h('span', { className: 'cs-grow' }, error),
      h('button', {
        type: 'button', className: 'cs-iconbtn', onClick: () => setError(undefined),
      }, Glyph.close(11))),

    h('div', { className: 'cs-av-scroll', ref: scrollRef },
      lines.map((lineText, index) => {
        const number = index + 1;
        const annotation = byLine.get(number);
        const picked = pick.start !== undefined
          && number >= Math.min(pick.start, pick.end ?? pick.start)
          && number <= Math.max(pick.start, pick.end ?? pick.start);
        const classes = ['cs-av-line'];
        if (picked) classes.push('cs-picked');
        if (annotation !== undefined) classes.push('cs-annotated');
        if (typeof line === 'number' && number === line) classes.push('cs-flash');
        return h('div', { key: number, className: classes.join(' '), style: { minHeight: `${LINE_HEIGHT}px` } },
          h('span', {
            className: 'cs-av-gutter',
            role: 'button',
            tabIndex: 0,
            title: `L${number}`,
            onClick: () => pickLine(number),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                pickLine(number);
              }
            },
          }, number),
          h('span', { className: 'cs-av-text' }, lineText === '' ? ' ' : lineText));
      }),

      annotations.length === 0 && !loading
        ? h('div', { className: 'cs-av-large', style: { padding: '14px' } },
          h('p', null, t('annotated.annotation.empty')))
        : null,

      annotations.map((row) => h('div', { key: row.id, className: 'cs-av-note' },
        h('div', { className: 'cs-col cs-grow' },
          h('b', null, `${row.title} · L${row.startLine}-${row.endLine}`),
          row.body === '' ? null : h('span', null, row.body)),
        h('span', {
          className: `cs-tag ${row.drift?.status === 'fresh' ? 'cs-ok' : row.drift?.status === 'missing' ? 'cs-bad' : 'cs-warn'}`,
        }, t(`notes.drift.${row.drift?.status ?? 'fresh'}`)),
        h('button', {
          type: 'button',
          className: 'cs-iconbtn cs-danger',
          title: t('annotated.annotation.delete'),
          'aria-label': t('annotated.annotation.delete'),
          disabled: busy,
          onClick: () => { void remove(row.id); },
        }, Glyph.trash(12)))),

      editing === undefined
        ? null
        : h(AnnotationForm, {
          busy,
          initial: editing.title === undefined ? '' : editing.title,
          initialBody: editing.body === undefined ? '' : editing.body,
          onSave: (title, body) => { void save(title, body); },
          onCancel: () => setEditing(undefined),
          t,
        })));
}

/**
 * The annotation editor.
 *
 * Lives inline under the code rather than in a modal: the point of the view is
 * to keep the code visible while writing about it.
 * @param props - `{busy, initial, initialBody, onSave(title, body), onCancel, t}`.
 * @returns the form.
 */
function AnnotationForm(props) {
  const {
    busy, initial, initialBody, onSave, onCancel, t,
  } = props;
  const [title, setTitle] = useState(initial);
  const [body, setBody] = useState(initialBody);
  return h('div', { className: 'cs-av-form' },
    h('div', { className: 'cs-row' },
      h('input', {
        className: 'cs-input',
        value: title,
        autoFocus: true,
        placeholder: t('annotated.annotation.title'),
        'aria-label': t('annotated.annotation.title'),
        onChange: (event) => setTitle(event.target.value),
      }),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-primary',
        disabled: busy,
        onClick: () => onSave?.(title.trim() === '' ? t('annotated.annotation.new') : title.trim(), body),
      }, t('annotated.annotation.save')),
      h('button', { type: 'button', className: 'cs-btn cs-small', onClick: () => onCancel?.() }, t('common.cancel'))),
    h('textarea', {
      className: 'cs-textarea',
      value: body,
      placeholder: t('annotated.annotation.body'),
      'aria-label': t('annotated.annotation.body'),
      onChange: (event) => setBody(event.target.value),
    }));
}

/**
 * `1.2 KB` in the active language.
 * @param size - bytes.
 * @param locale - `'zh' | 'en'`.
 * @returns a short human size.
 */
export function formatBytes(size, locale) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let scaled = value;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  const rounded = scaled >= 10 || index === 0 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${units[index]}`;
}
