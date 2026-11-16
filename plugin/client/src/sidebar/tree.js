/**
 * The reader's file tree.
 *
 * The `tree` API returns a flat entry list (`{path, type, size}`); this module
 * projects it into a nested tree, keeps the expanded-directory set, and offers a
 * name filter. Rows are plain DOM (`data-cs="file-tree"` on the container) so
 * the jsdom harness can assert them without the CodeMirror chunk.
 */

import { h, useMemo, Glyph } from '../icons.js';

/** Split a workspace-relative path into non-empty segments. */
function sbSplitPath(path) {
  return String(path ?? '').split('/').filter((part) => part !== '');
}

/**
 * Project the flat entry list into a tree.
 * @param entries - `{path, type:'dir'|'file', size?}[]`.
 * @returns a root dir node with nested `children`.
 */
function sbBuildTree(entries) {
  const root = { name: '', path: '', type: 'dir', children: [] };
  const byPath = new Map([['', root]]);

  const ensureDir = (path, name) => {
    let node = byPath.get(path);
    if (node === undefined) {
      node = { name, path, type: 'dir', children: [] };
      byPath.set(path, node);
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const parent = byPath.get(parentPath) ?? root;
      parent.children.push(node);
    }
    return node;
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    const parts = sbSplitPath(entry.path);
    if (parts.length === 0) continue;
    if (entry.type === 'dir') {
      ensureDir(entry.path, parts[parts.length - 1]);
      continue;
    }
    let acc = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc === '' ? parts[i] : `${acc}/${parts[i]}`;
      ensureDir(acc, parts[i]);
    }
    const parentPath = parts.slice(0, -1).join('/');
    const parent = byPath.get(parentPath) ?? root;
    parent.children.push({
      name: parts[parts.length - 1],
      path: entry.path,
      type: 'file',
      size: entry.size,
    });
  }

  const sortNode = (node) => {
    node.children.sort((a, b) => (
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
    ));
    for (const child of node.children) {
      if (child.type === 'dir') sortNode(child);
    }
  };
  sortNode(root);
  return root;
}

/**
 * Does this node (or any descendant) match the filter needle?
 * @param node - a tree node.
 * @param needle - lowercased substring.
 * @returns true when the node should stay visible.
 */
function sbNodeMatches(node, needle) {
  if (needle === '') return true;
  if (node.type === 'file') return String(node.path).toLowerCase().includes(needle);
  return node.children.some((child) => sbNodeMatches(child, needle));
}

/**
 * The file tree panel.
 *
 * @param props - `{entries, activePath, expanded, onToggleDir, onOpenFile,
 *   filter, onFilterChange, loading, error, onRetry, t, locale}`.
 * @returns the tree node.
 */
export function SbFileTree(props) {
  const {
    entries, activePath, expanded, onToggleDir, onOpenFile,
    filter, onFilterChange, loading, error, onRetry, t,
  } = props;

  const root = useMemo(() => sbBuildTree(entries), [entries]);
  const needle = String(filter ?? '').trim().toLowerCase();
  const filtering = needle !== '';

  const renderNode = (node, depth) => {
    if (!sbNodeMatches(node, needle)) return null;
    const pad = { paddingLeft: `${8 + depth * 12}px` };

    if (node.type === 'dir') {
      const open = filtering || expanded.has(node.path);
      return h('div', { key: node.path },
        h('button', {
          type: 'button',
          className: 'cs-sb-tree-row cs-dir',
          style: pad,
          onClick: () => onToggleDir(node.path),
          title: node.path,
        },
          h('span', {
            className: 'cs-sb-tree-twist',
            'data-open': String(open),
          }, Glyph.chevronRight(11)),
          h('span', { className: 'cs-sb-tree-glyph' }, open ? Glyph.folderOpen(12) : Glyph.folder(12)),
          h('span', { className: 'cs-sb-tree-name' }, node.name)),
        open ? node.children.map((child) => renderNode(child, depth + 1)) : null);
    }

    const active = node.path === activePath;
    return h('button', {
      key: node.path,
      type: 'button',
      className: `cs-sb-tree-row${active ? ' cs-active' : ''}`,
      style: pad,
      title: node.path,
      onClick: () => onOpenFile(node.path),
    },
      h('span', { className: 'cs-sb-tree-twist' }),
      h('span', { className: 'cs-sb-tree-glyph' }, Glyph.file(12)),
      h('span', { className: 'cs-sb-tree-name' }, node.name),
      Number.isFinite(Number(node.size)) && Number(node.size) > 0
        ? h('span', { className: 'cs-sb-tree-meta' }, String(node.size))
        : null);
  };

  return h('div', { className: 'cs-sb-tree' },
    h('div', { className: 'cs-sb-tree-head' },
      h('div', { className: 'cs-search' },
        h('span', { className: 'cs-search-glyph' }, Glyph.search(13)),
        h('input', {
          className: 'cs-input',
          type: 'search',
          value: filter ?? '',
          placeholder: t('reader.tree.filter'),
          'aria-label': t('reader.tree.filter'),
          onChange: (event) => onFilterChange(event.target.value),
        }))),
    error === undefined
      ? null
      : h('div', { className: 'cs-sb-banner' },
        Glyph.alert(12),
        h('span', { className: 'cs-grow' }, error),
        h('button', {
          type: 'button', className: 'cs-iconbtn', 'aria-label': t('reader.tree.retry'),
          onClick: onRetry,
        }, Glyph.refresh(11))),
    h('div', { className: 'cs-sb-tree-list', 'data-cs': 'file-tree' },
      loading && root.children.length === 0
        ? h('div', { className: 'cs-sb-empty' }, h('span', { className: 'cs-spin' }, Glyph.spinner(11)), t('reader.tree.loading'))
        : root.children.length === 0
          ? h('div', { className: 'cs-sb-empty' }, t('reader.tree.empty'))
          : root.children.map((child) => renderNode(child, 0))));
}
