/**
 * Stroke glyphs, 24×24, `currentColor`.
 *
 * Sized by the caller and never by CSS: the host asks a tab's `icon(size)` for
 * a node at a specific pixel size, and a glyph that silently ignores the
 * argument renders blurry at 14 px or huge at 20 px. Every function is
 * `(size) => node`.
 *
 * ---------------------------------------------------------------------------
 * Why this module also owns the React surface
 * ---------------------------------------------------------------------------
 * A DSH client bundle is exactly one `window.__ModuleLoader__.load({id,
 * factory(require)})` call, and `dev/build-client.mjs` concatenates every module
 * into that one factory body. Inside it, `React` exists
 * (`const React = require('react')`, emitted by the build) and `import … from
 * 'react'` lines are elided — with nothing declaring the imported names.
 *
 * So the bindings have to be declared exactly once, by a module that imports
 * nothing (any ordering hazard disappears), and imported by name from there.
 * This module is that owner: it has no imports, therefore the build always
 * emits it before anything that consumes it.
 *
 * Do not add a second `const h` / `const { useState } = React` anywhere: the
 * bundle is one scope, and a repeat is a redeclaration SyntaxError at load.
 * ---------------------------------------------------------------------------
 */

/** The one `React.createElement` alias in the bundle. */
const h = React.createElement;

/** The hooks every panel uses, bound once for the reason above. */
const {
  useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef,
} = React;

/**
 * Re-export the React surface so every panel imports its hooks from here.
 *
 * Deliberate: this module has no imports of its own, so the build emits it first
 * and the bindings exist before any consumer runs. That is why panels write
 * `import { useState } from './icons.js'` rather than from `'react'` — the
 * bundle is one scope, and a bare `'react'` import would have nothing to bind to.
 */

/** Width/height default, matching `Icon` sizes the reference app used (10–14). */
const ICON_PX = 14;

/**
 * One glyph frame.
 * @param size - pixel size for width and height.
 * @param children - the path nodes.
 * @returns an `<svg>` element.
 */
function frame(size, children) {
  const px = size === undefined || size === null ? ICON_PX : size;
  return h('svg', {
    width: px,
    height: px,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block', flex: '0 0 auto' },
  }, children);
}

/**
 * The glyph table. Each entry takes a pixel size.
 *
 * `key` props are set explicitly because these children are arrays, and a
 * missing key in a static array is still a React warning a host may surface in
 * its console.
 */
const Glyph = {
  graph: (size) => frame(size, [
    h('circle', { key: 'a', cx: 6, cy: 7, r: 2.4 }),
    h('circle', { key: 'b', cx: 18, cy: 7, r: 2.4 }),
    h('circle', { key: 'c', cx: 12, cy: 18, r: 2.4 }),
    h('path', { key: 'd', d: 'M6 7h12M7.4 9.1l3.4 6.6M16.6 9.1l-3.4 6.6' }),
  ]),
  notes: (size) => frame(size, [
    h('path', { key: 'a', d: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z' }),
    h('path', { key: 'b', d: 'M14 4v5h5M8 13h8M8 17h5' }),
  ]),
  outline: (size) => frame(size, [
    h('path', { key: 'a', d: 'M5 6h14M5 12h9M5 18h11' }),
    h('circle', { key: 'b', cx: 18.5, cy: 12, r: 1.1 }),
  ]),
  search: (size) => frame(size, [
    h('circle', { key: 'a', cx: 11, cy: 11, r: 6.5 }),
    h('path', { key: 'b', d: 'M16 16l4.5 4.5' }),
  ]),
  close: (size) => frame(size, [h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })]),
  more: (size) => frame(size, [
    h('circle', { key: 'a', cx: 5, cy: 12, r: 1.4 }),
    h('circle', { key: 'b', cx: 12, cy: 12, r: 1.4 }),
    h('circle', { key: 'c', cx: 19, cy: 12, r: 1.4 }),
  ]),
  refresh: (size) => frame(size, [
    h('path', { key: 'a', d: 'M20 12a8 8 0 1 1-2.6-5.9' }),
    h('path', { key: 'b', d: 'M20 4.5V10h-5.5' }),
  ]),
  rebuild: (size) => frame(size, [
    h('path', { key: 'a', d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z' }),
    h('path', { key: 'b', d: 'M12 12l8-4.5M12 12v9M12 12L4 7.5' }),
  ]),
  plus: (size) => frame(size, [h('path', { key: 'a', d: 'M12 6v12M6 12h12' })]),
  minus: (size) => frame(size, [h('path', { key: 'a', d: 'M6 12h12' })]),
  fit: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }),
  ]),
  chevronRight: (size) => frame(size, [h('path', { key: 'a', d: 'M9.5 5.5L16 12l-6.5 6.5' })]),
  chevronDown: (size) => frame(size, [h('path', { key: 'a', d: 'M5.5 9.5L12 16l6.5-6.5' })]),
  back: (size) => frame(size, [h('path', { key: 'a', d: 'M14.5 5.5L8 12l6.5 6.5' })]),
  folder: (size) => frame(size, [
    h('path', { key: 'a', d: 'M3.5 7.5a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-10z' }),
  ]),
  folderOpen: (size) => frame(size, [
    h('path', { key: 'a', d: 'M3.5 7.5a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1v2' }),
    h('path', { key: 'b', d: 'M3.5 9.5h16l-2 10h-14l-1.5-10z' }),
  ]),
  file: (size) => frame(size, [
    h('path', { key: 'a', d: 'M6 3.5h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z' }),
    h('path', { key: 'b', d: 'M14 3.5v5h5' }),
  ]),
  code: (size) => frame(size, [
    h('path', { key: 'a', d: 'M9 8l-4.5 4L9 16M15 8l4.5 4L15 16' }),
  ]),
  open: (size) => frame(size, [
    h('path', { key: 'a', d: 'M14 4h6v6' }),
    h('path', { key: 'b', d: 'M20 4l-8.5 8.5' }),
    h('path', { key: 'c', d: 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }),
  ]),
  target: (size) => frame(size, [
    h('circle', { key: 'a', cx: 12, cy: 12, r: 7 }),
    h('circle', { key: 'b', cx: 12, cy: 12, r: 2 }),
    h('path', { key: 'c', d: 'M12 2v3M12 19v3M2 12h3M19 12h3' }),
  ]),
  trash: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13' }),
  ]),
  pencil: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4.5 19.5l4.2-1 10-10a2 2 0 0 0-2.8-2.8l-10 10-1.4 3.8z' }),
  ]),
  check: (size) => frame(size, [h('path', { key: 'a', d: 'M5 12.5l4.5 4.5L19 7.5' })]),
  alert: (size) => frame(size, [
    h('circle', { key: 'a', cx: 12, cy: 12, r: 8.5 }),
    h('path', { key: 'b', d: 'M12 7.5v5.5M12 16.4v.2' }),
  ]),
  spinner: (size) => frame(size, [h('path', { key: 'a', d: 'M12 3.5a8.5 8.5 0 1 1-8.5 8.5' })]),
  arrowRight: (size) => frame(size, [h('path', { key: 'a', d: 'M4 12h15M14 6.5L19.5 12 14 17.5' })]),
  arrowLeft: (size) => frame(size, [h('path', { key: 'a', d: 'M20 12H5M10 6.5L4.5 12 10 17.5' })]),
  dot: (size) => frame(size, [h('circle', {
    key: 'a', cx: 12, cy: 12, r: 3.2, fill: 'currentColor', stroke: 'none',
  })]),
  sparkle: (size) => frame(size, [
    h('path', { key: 'a', d: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5z' }),
  ]),
  layers: (size) => frame(size, [
    h('path', { key: 'a', d: 'M12 3.5l8 4-8 4-8-4 8-4z' }),
    h('path', { key: 'b', d: 'M4 12l8 4 8-4M4 16.5l8 4 8-4' }),
  ]),
  sidebar: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4 5.5h16v13H4z' }),
    h('path', { key: 'b', d: 'M14.5 5.5v13' }),
  ]),
  /* ---- conversation ------------------------------------------------ */
  chat: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4 5.5h16v10.5H9.5L5 20v-4H4z' }),
  ]),
  chatPlus: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4 5.5h16v10.5h-6.5L8 20v-4H4z' }),
    h('path', { key: 'b', d: 'M12 8.4v4.6M9.7 10.7h4.6' }),
  ]),
  send: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4 12l16-7-6.2 16-2.6-6.4L4 12z' }),
  ]),
  stop: (size) => frame(size, [
    h('rect', { key: 'a', x: 6.5, y: 6.5, width: 11, height: 11, rx: 2 }),
  ]),
  copy: (size) => frame(size, [
    h('rect', { key: 'a', x: 9, y: 9, width: 10.5, height: 10.5, rx: 1.8 }),
    h('path', { key: 'b', d: 'M15 6.5V5.5a1.5 1.5 0 0 0-1.5-1.5h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15h1' }),
  ]),
  quote: (size) => frame(size, [
    h('path', { key: 'a', d: 'M9.5 6.5C6.9 7.6 5.5 9.6 5.5 12v5.5h5V12H8c0-1.7.6-2.9 1.9-3.6z' }),
    h('path', { key: 'b', d: 'M18 6.5c-2.6 1.1-4 3.1-4 5.5v5.5h5V12h-2.5c0-1.7.6-2.9 1.9-3.6z' }),
  ]),
  /* ---- knowledge base --------------------------------------------- */
  note: (size) => frame(size, [
    h('path', { key: 'a', d: 'M6 4.5h8.5L19 9v10.5H6z' }),
    h('path', { key: 'b', d: 'M14 4.5V9h4.5' }),
    h('path', { key: 'c', d: 'M9 12.5h7M9 16h5' }),
  ]),
  noteAdd: (size) => frame(size, [
    h('path', { key: 'a', d: 'M6 4.5h8.5L19 9v10.5H6z' }),
    h('path', { key: 'b', d: 'M14 4.5V9h4.5' }),
    h('path', { key: 'c', d: 'M11.2 12.2v4.4M9 14.4h4.4' }),
  ]),
  /* ---- retrieval / citation ---------------------------------------- */
  citation: (size) => frame(size, [
    h('path', { key: 'a', d: 'M10.5 5.5H5v5.5M5 11a10 10 0 0 1 9 7' }),
    h('path', { key: 'b', d: 'M19 5.5h-5.5V11' }),
  ]),
  layers2: (size) => frame(size, [
    h('path', { key: 'a', d: 'M12 4l7.5 3.7L12 11.4 4.5 7.7 12 4z' }),
    h('path', { key: 'b', d: 'M4.5 12L12 15.7l7.5-3.7' }),
    h('path', { key: 'c', d: 'M4.5 16.3L12 20l7.5-3.7' }),
  ]),
  settings: (size) => frame(size, [
    h('circle', { key: 'a', cx: 12, cy: 12, r: 3 }),
    h('path', { key: 'b', d: 'M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1' }),
  ]),
  minimize: (size) => frame(size, [h('path', { key: 'a', d: 'M5 12h14' })]),
  panelLeft: (size) => frame(size, [
    h('path', { key: 'a', d: 'M4 5.5h16v13H4z' }),
    h('path', { key: 'b', d: 'M9.5 5.5v13' }),
  ]),
};

/**
 * Look one glyph up.
 * @param name - a key of the glyph table.
 * @param size - pixel size.
 * @returns the node, or a neutral dot so a missing name never blanks a button.
 */
function icon(name, size) {
  const draw = Glyph[name];
  return draw === undefined ? Glyph.dot(size) : draw(size);
}

export {
  h, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, Glyph, icon, frame,
};
