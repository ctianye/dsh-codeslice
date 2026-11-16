import { useState, useMemo, useCallback } from './icons.js';
import { communityColor, kindLabel } from './graph-tables.js';
import { Glyph } from './icons.js';

/**
 * In-graph search.
 *
 * The reference app's version is a plain substring filter with no keyboard
 * navigation at all (`GraphView.tsx:373-390`, `spec §4.2`): no arrows, no Enter,
 * rows are buttons and the query is cleared by clicking one. That is the one
 * place where "the rail search box replaces the rail body" cost the reader the
 * ability to walk a list — you have to move the mouse between the box and the
 * thirty rows it just produced.
 *
 * This module keeps the *matching* rules verbatim and adds the key map:
 *
 *   - match on `label + path + communityLabel`, lowercased, `.includes()`;
 *   - cap **30** results, in payload order, no ranking (a ranking would make the
 *     list jump between keystrokes);
 *   - ↑/↓ wrap around, Enter selects-and-centres, Esc clears.
 *
 * Enter *centres* (the camera moves) while a plain click does not — the same
 * split the reference uses for its result rows (`choose(id, true)`).
 */

/** Result cap, verbatim `GraphView.tsx:203-207`. */
const SEARCH_CAP = 30;

/**
 * Filter the slice's nodes.
 *
 * Exported so the panel can reuse the exact predicate for its own purposes
 * (e.g. deciding whether a scope switch has a target) without duplicating it.
 * @param nodes - the slice's nodes.
 * @param query - the raw input; trimmed and lowercased here.
 * @returns the matching nodes, capped, in payload order.
 */
export function filterNodes(nodes, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle === '') return [];
  const out = [];
  for (const node of nodes) {
    const haystack = `${node.label ?? ''} ${node.path ?? ''} ${node.communityLabel ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    out.push(node);
    if (out.length >= SEARCH_CAP) break;
  }
  return out;
}

/**
 * The search box and its results list.
 *
 * @param props - `{nodes, query, onQuery, onPick, onClear, selectedId, t, locale, inputRef}`:
 *   `nodes` is the current slice; `query`/`onQuery` is lifted state so the panel
 *   can decide which rail mode to show (search results outrank the inspector);
 *   `onPick(node)` selects **and** centres; `onClear()` empties the query;
 *   `inputRef` lets the panel's `/` shortcut focus the box.
 * @returns the box and the result rows.
 */
export function GraphSearch(props) {
  const {
    nodes, query, onQuery, onPick, onClear, selectedId, t, locale, inputRef,
  } = props;
  const [cursor, setCursor] = useState(0);

  const results = useMemo(() => filterNodes(nodes, query), [nodes, query]);
  const active = results.length === 0 ? -1 : Math.min(cursor, results.length - 1);

  /** Move the cursor with wraparound, per the nav-picker key map (§4.4). */
  const move = useCallback((delta, total) => {
    if (total === 0) return 0;
    return (delta + total) % total;
  }, []);

  const onKeyDown = useCallback((event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => move(current + 1, results.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => move(current - 1, results.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const node = results[active];
      if (node !== undefined) onPick?.(node);
      return;
    }
    if (event.key === 'Escape') {
      // Esc clears the text *and* the cursor. It deliberately does not bubble:
      // the panel also listens for Esc to clear the selection, and one keypress
      // should do one thing.
      event.preventDefault();
      event.stopPropagation();
      setCursor(0);
      onClear?.();
    }
  }, [results, active, onPick, onClear, move]);

  const typing = String(query ?? '').trim() !== '';

  return h('div', { className: 'cs-col' },
    h('div', { className: 'cs-bar cs-sub' },
      h('div', { className: 'cs-search' },
        h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
        h('input', {
          ref: inputRef,
          className: 'cs-input',
          type: 'search',
          value: query,
          placeholder: t('graph.search.placeholder'),
          'aria-label': t('graph.search.placeholder'),
          onChange: (event) => {
            setCursor(0);
            onQuery?.(event.target.value);
          },
          onKeyDown,
        }),
        typing ? h('button', {
          type: 'button',
          className: 'cs-search-clear',
          title: t('graph.search.clear'),
          'aria-label': t('graph.search.clear'),
          onClick: () => {
            setCursor(0);
            onClear?.();
          },
        }, Glyph.close(12)) : null)),

    typing
      ? h('div', { className: 'cs-rail-scroll' },
        results.length === 0
          ? h('div', { className: 'cs-empty', style: { height: 'auto', padding: '14px 10px' } }, t('graph.search.empty'))
          : results.map((node, index) => h('button', {
            key: node.id,
            type: 'button',
            className: `cs-item${node.id === selectedId ? ' cs-active' : ''}`,
            'aria-pressed': node.id === selectedId ? 'true' : 'false',
            title: node.path === undefined || node.path === '' ? node.label : node.path,
            onMouseEnter: () => setCursor(index),
            onClick: () => onPick?.(node),
          },
          h('span', {
            className: 'cs-dot',
            style: { background: communityColor(node.community ?? 0), alignSelf: 'center' },
          }),
          h('span', { className: 'cs-name cs-ellipsis' }, node.label),
          h('span', { className: 'cs-meta' }, kindLabel(node.kind, locale)))))
      : h('div', { className: 'cs-rail-foot' }, t('graph.search.hint')));
}
