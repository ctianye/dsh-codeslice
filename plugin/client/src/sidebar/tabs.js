/**
 * The multi-tab strip of the reader pane.
 *
 * One tab per open file; switching keeps each file's last selection in its tab
 * record (the reader restores it on activate). Every tab carries
 * `data-cs="tab"` so the harness can count and click them in jsdom.
 */

import { h, Glyph } from '../icons.js';

/**
 * The tab strip.
 *
 * @param props - `{tabs, activePath, onActivate(path), onClose(path), t}`.
 * @returns the strip node, or null when no file is open.
 */
export function SbTabBar(props) {
  const { tabs, activePath, onActivate, onClose, t } = props;
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  return h('div', { className: 'cs-sb-tabs', role: 'tablist' },
    tabs.map((tab) => h('div', {
      key: tab.path,
      'data-cs': 'tab',
      'data-path': tab.path,
      role: 'tab',
      'aria-selected': activePath === tab.path,
      className: `cs-sb-tab${activePath === tab.path ? ' cs-on' : ''}`,
      title: tab.path,
      onClick: () => onActivate(tab.path),
    },
      Glyph.file(12),
      h('span', { className: 'cs-sb-tab-label' }, tab.title),
      h('button', {
        type: 'button',
        className: 'cs-sb-tab-close',
        'aria-label': t('reader.tab.close'),
        title: t('reader.tab.close'),
        onClick: (event) => {
          event.stopPropagation();
          onClose(tab.path);
        },
      }, Glyph.close(11)))));
}
