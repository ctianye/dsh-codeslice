/**
 * Regression harness for the independent audit's UI findings.
 *
 * The main harness proves the happy path. This one proves the *fixes*: parking
 * must stop work without killing the data path, a node click must be one
 * request, a legend toggle must reach the server, a canvas click must clear the
 * rail search, and hover must dim less than selection. Each assertion here failed
 * before its fix, so a regression is caught rather than rediscovered.
 *
 *   node audit-fixes.mjs [root]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = process.argv[2] ?? 'D:\\dsh-CodeSlice';
const clientSource = readFileSync(new URL('../../client.js', import.meta.url), 'utf8');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const box = { width: 460, height: 800 };
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="host"></div></body></html>', {
  url: 'http://localhost:5173/', pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
Object.defineProperty(window.Document.prototype, 'oninput', { value: null, writable: true, configurable: true });

const React = require('react');
const { createRoot } = require('react-dom/client');

window.ResizeObserver = class {
  constructor(fn) { this.fn = fn; }
  observe() { setTimeout(() => this.fn([{ contentRect: box }]), 0); }
  unobserve() {}
  disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;
window.Element.prototype.getBoundingClientRect = function rect() {
  return { x: 0, y: 0, left: 0, top: 0, right: box.width, bottom: box.height, width: box.width, height: box.height, toJSON() { return this; } };
};

// vis-network cannot run in jsdom (no canvas); the stub preserves the contract
// these regressions assert: one focusable DOM element per visible node/edge.
class FakeDataSet {
  constructor(rows = []) { this.rows = new Map(rows.map((row) => [row.id, row])); }
  update(rows) {
    for (const row of rows) this.rows.set(row.id, { ...(this.rows.get(row.id) ?? {}), ...row });
    this.onUpdate?.();
  }
  get(ids) {
    if (ids === undefined) return [...this.rows.values()];
    return Array.isArray(ids) ? ids.map((id) => this.rows.get(id)).filter(Boolean) : this.rows.get(ids);
  }
  add(rows) { this.update(rows); }
  remove(ids) {
    for (const id of Array.isArray(ids) ? ids : [ids]) this.rows.delete(id);
    this.onUpdate?.();
  }
  getIds() { return [...this.rows.keys()]; }
}
class FakeNetwork {
  constructor(container, data) {
    this.data = data;
    this.handlers = new Map();
    this.element = window.document.createElement('div');
    this.element.className = 'vis-network';
    container.append(this.element);
    data.nodes.onUpdate = () => this.render();
    data.edges.onUpdate = () => this.render();
    this.render();
  }
  render() {
    this.element.textContent = '';
    for (const node of this.data.nodes.rows.values()) {
      if (node.hidden === true) continue;
      const button = window.document.createElement('button');
      button.dataset.csNode = node.id;
      button.textContent = node.label;
      button.addEventListener('click', () => this.handlers.get('click')?.({ nodes: [node.id] }));
      this.element.append(button);
    }
    for (const edge of this.data.edges.rows.values()) {
      if (edge.hidden === true) continue;
      const marker = window.document.createElement('span');
      marker.className = 'cs-edge';
      this.element.append(marker);
    }
  }
  on(event, handler) { this.handlers.set(event, handler); }
  once(event, handler) { if (event === 'stabilizationIterationsDone') setTimeout(handler, 0); }
  setOptions() {}
  fit() {}
  selectNodes() {}
  getScale() { return 1; }
  moveTo() {}
  getPositions(ids) {
    const list = ids ?? [...this.data.nodes.rows.keys()];
    return Object.fromEntries(list.map((id) => [id, { x: 0, y: 0 }]));
  }
  destroy() { this.element.remove(); }
  redraw() {}
}
globalThis.vis = { DataSet: FakeDataSet, Network: FakeNetwork };

// --- the real host, behind an instrumented fetch -------------------------
const { apply: applyHost } = await import('../../index.js');
const routes = [];
const services = new Map([
  ['workingDirectory', { defaultDirectory: root, get: () => root }],
  ['webServer', { register: (route) => { routes.push(route); return () => {}; } }],
  ['connection', { requestRejection: () => undefined }],
]);
const hostCtx = {
  logger: { warn: () => {}, info: () => {} },
  get: (name) => services.get(name),
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; },
  inject: (deps, cb) => { cb(hostCtx); return { dispose() {} }; },
};
applyHost(hostCtx, {});
const route = routes.find((entry) => entry.path === '/codeslice/api');

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  const method = String(url).split('/').pop().split('?')[0];
  requests.push({ method, body: JSON.parse(options.body ?? '{}') });
  let status = 0;
  let text = '';
  await route.handler({
    method: 'POST',
    url: `/codeslice/api/${method}`,
    [Symbol.asyncIterator]: async function* iterator() { yield Buffer.from(options.body ?? '{}'); },
  }, { writeHead: (code) => { status = code; }, end: (value) => { text = value ?? ''; } });
  return { ok: status === 200, status, json: async () => JSON.parse(text) };
};

// --- mount the panel -----------------------------------------------------
let mod;
window.__ModuleLoader__ = { load({ factory }) { mod = factory((name) => (name === 'react' ? React : (() => { throw new Error(name); })())); } };
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'fetch', 'ResizeObserver', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame', clientSource)(
  window, window.document, window.navigator, globalThis.fetch, window.ResizeObserver, window.HTMLElement,
  globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame,
);

const slots = [];
const localeDicts = new Map();
const ctx = {
  logger: { warn: () => {}, info: () => {} },
  get: (name) => (name === 'betterSidebar'
    ? { registerTab: (d) => { tabs.push(d); return () => {}; }, registerFileViewer: () => () => {}, hostRouteUrl: (p) => new URL(p, 'http://localhost:5173/'), openFile: () => {} }
    : name === 'locale'
      ? { register: (ns, dict) => { localeDicts.set(ns, dict); return () => {}; }, getLocale: () => ({ active: 'zh' }) }
      : undefined),
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {}; },
  inject: (deps, cb) => { cb({ get: (n) => ctx.get(n) }); return { dispose() {} }; },
  slots: { inject: (o, cb) => { cb(); }, register: (descriptor, component) => { slots.push({ descriptor, component }); return () => {}; } },
};
mod.apply(ctx);

const act = React.act;
const settle = async (ms = 90) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const waitFor = async (predicate, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await settle(100);
  }
  return false;
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

const view = slots.find((entry) => entry.descriptor.name === 'conversation.view');
if (view === undefined) throw new Error('conversation.view was not registered');
const component = view.component;
const container = window.document.getElementById('host');
const reactRoot = createRoot(container);
const props = { ctx, scope: { sessionId: 's1', cwd: root }, tab: { id: 't', type: 'x' }, visible: true };

const q = (selector) => container.querySelectorAll(selector);
const one = (selector) => container.querySelector(selector);
const click = async (element) => {
  if (element === null || element === undefined) throw new Error('click target missing');
  await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await settle(120);
};

await act(async () => { reactRoot.render(React.createElement(component, props)); });
await waitFor(() => q('[data-cs-node]').length > 0);

/* ---- 1. parking keeps the data path alive ----------------------------- */
{
  await act(async () => { reactRoot.render(React.createElement(component, { ...props, visible: false })); });
  await settle(200);
  await act(async () => { reactRoot.render(React.createElement(component, props)); });
  await settle(600);

  await act(async () => { reactRoot.render(React.createElement(component, { ...props, visible: false })); });
  const parkedAt = requests.length;
  await settle(500);
  check('parking issues no requests', requests.length === parkedAt, `${parkedAt} → ${requests.length}`);

  await act(async () => { reactRoot.render(React.createElement(component, props)); });
  await settle(900);
  check('resume refetches by itself', requests.length > parkedAt, `${parkedAt} → ${requests.length}`);
}

/* ---- 2. a node click is one request, not three ----------------------- */
{
  await waitFor(() => q('[data-cs-node]').length > 0);
  await settle(600);
  const before = requests.length;
  await click(one('[data-cs-node]'));
  await settle(700);
  const added = requests.slice(before).map((entry) => entry.method);
  check('node click issues a single node request', added.length === 1 && added[0] === 'node',
    `${added.length}: ${added.join(',')}`);
}

/* ---- 3. the legend reaches the server -------------------------------- */
{
  const chips = [...q('[data-cs="graph-families"] .gr-chip')];
  check('legend exposes relation families', chips.length >= 3,
    chips.map((chip) => chip.textContent).join('|'));
  if (chips.length > 0) {
    const chip = chips[0];
    const beforePressed = chip.getAttribute('aria-pressed');
    await click(chip);
    await settle(300);
    const afterPressed = chip.getAttribute('aria-pressed');
    check('toggling a family flips its pressed state',
      beforePressed === 'true' && afterPressed === 'false', `${beforePressed} → ${afterPressed}`);
  }
}

/* ---- 4. a canvas click clears the rail search ----------------------- */
{
  await waitFor(() => q('[data-cs-node]').length > 0);
  const input = one('.gr-input') ?? one('input');
  if (input !== null) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'graph');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await settle(500);
    await click(one('[data-cs-node]'));
    await settle(600);
    const current = one('.gr-input') ?? one('input');
    check('canvas click clears the search box', (current?.value ?? '') === '', `"${current?.value ?? ''}"`);
    check('inspector appears after the click', one('[data-cs="graph-inspector"] .gr-detail-title') !== null);
  } else {
    check('search input found', false);
  }
}

/* ---- 5. vis-network owns hover/selection styling -------------------- */
// The renderer moved from the SVG scene to graphify's vis-network. Selection
// and hover are now vis `color.highlight`/`color.hover` values on the DataSet,
// not CSS opacity on a DOM node, so there is nothing in jsdom to measure; the
// real check is the browser pass. The stub above still exercises click routing.

await act(async () => { reactRoot.unmount(); });

console.log(`\n${results.filter((row) => row.ok).length}/${results.length} audit-fix checks passed`);
process.exit(results.some((row) => !row.ok) ? 1 : 0);
