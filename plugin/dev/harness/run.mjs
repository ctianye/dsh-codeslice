/**
 * End-to-end client harness (v3).
 *
 * Loads the real client bundle in jsdom against the real Host route handler (no
 * network, no DSH): `fetch` is wired straight into the route `apply()` registered,
 * so a panel click exercises exactly the path it will in the app. Tree, frames,
 * projects and prompts are served by the real host methods; the harness does not
 * bypass them with synthetic data.
 *
 * Timing note: `act()` defers effects until its callback returns and the panel
 * debounces its search, so every assertion waits for a *condition* rather than for
 * a fixed sleep.
 *
 *   node run.mjs [root] [--wide]
 *
 * Assertions:
 *   1. registration shape: knowledge tab, legacy tabs gone, conversation.view
 *      third slot (order / label / children / inject), main, panellist row,
 *      composer dock;
 *   2. session GraphView renders canvas + inspector, parks and resumes without
 *      losing state, and hands a node to the vendored editor;
 *   3. knowledge tab mounts and asks the host for notes;
 *   4. legacy notes / outline tabs stay removed, composer chip still mounts;
 *   5. workbench: three nav pages switch, settings holds three prompt blocks,
 *      retrieval topK / RRF / family controls and the index status section;
 *   6. disposal removes registrations and the stylesheets.
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const wide = args.includes('--wide');
const root = args.find((value) => !value.startsWith('--')) ?? 'D:\\dsh-CodeSlice';

// Isolate host state before the host half is imported: notes, frames, projects,
// prompts and RAG settings all resolve the state dir at call time, so a fresh
// throwaway directory keeps this harness off the developer's real store.
process.env.CODESLICE_STATE_DIR = mkdtempSync(join(tmpdir(), 'cs-harness-'));

const clientSource = readFileSync(new URL('../../client.js', import.meta.url), 'utf8');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const box = wide ? { width: 1180, height: 340 } : { width: 420, height: 760 };

// The DOM must exist BEFORE react-dom is required: it snapshots `canUseDOM` and
// whether native `input` events are supported at module load, and a false
// snapshot sends every keystroke down the IE `propertychange` path, which both
// throws in jsdom and never reaches `onChange`.
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="host"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
Object.defineProperty(window.Document.prototype, 'oninput', {
  value: null, writable: true, configurable: true,
});

const React = require('react');
const { createRoot } = require('react-dom/client');

window.ResizeObserver = class {
  constructor(fn) { this.fn = fn; }
  observe(target) { setTimeout(() => this.fn([{ target, contentRect: box }]), 0); }
  unobserve() {}
  disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;

// --- the two lazy assets, stubbed --------------------------------------
//
// jsdom has no canvas and no script loader for the Host's asset route, so the
// real vis-network and CodeMirror chunks cannot execute here. The stubs keep the
// *contract* under test: the graph renders one focusable element per visible
// node and one marker per visible edge, and the editor exposes the imperative
// handle the reader calls. Real drawing/typing is a browser check.
class FakeDataSet {
  constructor(rows = []) {
    this.rows = new Map(rows.map((row) => [row.id, row]));
    this.onUpdate = undefined;
  }
  update(rows) {
    for (const row of rows) this.rows.set(row.id, { ...(this.rows.get(row.id) ?? {}), ...row });
    this.onUpdate?.();
  }
  get() { return [...this.rows.values()]; }
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
      marker.dataset.csEdge = String(edge.id);
      this.element.append(marker);
    }
  }
  on(event, handler) { this.handlers.set(event, handler); }
  once(event, handler) {
    if (event === 'stabilizationIterationsDone') setTimeout(handler, 0);
  }
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
window.vis = globalThis.vis;
globalThis.__codesliceEditor = {
  create(container, options) {
    const box = window.document.createElement('div');
    box.className = 'cm-editor fake';
    for (const [index, line] of String(options.doc ?? '').split('\n').entries()) {
      const row = window.document.createElement('div');
      row.className = 'cm-line';
      row.dataset.csLine = String(index + 1);
      const gutter = window.document.createElement('button');
      gutter.className = 'cm-gutterElement';
      gutter.textContent = String((options.startLine ?? 1) + index);
      gutter.addEventListener('click', () => options.onGutterPick?.(Number(gutter.textContent)));
      const text = window.document.createElement('span');
      text.textContent = line;
      row.append(gutter, text);
      box.append(row);
    }
    container.append(box);
    return {
      setDecorations() {},
      setSelection() {},
      clearSelection() {},
      scrollToLine() {},
      focus() {},
      destroy() { box.remove(); },
    };
  },
};
window.__codesliceEditor = globalThis.__codesliceEditor;

window.Element.prototype.getBoundingClientRect = function rect() {
  return {
    x: 0, y: 0, left: 0, top: 0, right: box.width, bottom: box.height,
    width: box.width, height: box.height, toJSON() { return this; },
  };
};

// --- the real Host half, behind a fake fetch -----------------------------
const { apply: applyHost } = await import('../../index.js');

const routes = [];
const hostCtx = {
  logger: { warn: (m) => console.warn('[host]', m), info: () => {} },
  get: (name) => {
    if (name === 'workingDirectory') return { defaultDirectory: root, get: () => root };
    if (name === 'webServer') return { register: (route) => { routes.push(route); return () => {}; } };
    if (name === 'connection') return { requestRejection: () => undefined };
    return undefined;
  },
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
  inject: (deps, cb) => { cb({ get: (name) => hostCtx.get(name) }); return { dispose() {} }; },
};
applyHost(hostCtx, { maxFiles: 8000 });
const route = routes.find((entry) => entry.path === '/codeslice/api');
if (route === undefined) throw new Error('the host half did not register /codeslice/api');

const callLog = [];
/** Bodies exactly as the client bundle sent them — before the Host-side `api`
 * helper adds its own root, so a missing `cwd` stays visible here. */
const rawBodies = [];
globalThis.fetch = async (url, options = {}) => {
  const method = String(url).split('/').pop().split('?')[0];
  callLog.push(method);
  try { rawBodies.push({ method, body: JSON.parse(String(options.body ?? '{}')) }); } catch { /* not json */ }
  let status = 0;
  let text = '';
  const req = {
    method: options.method ?? 'GET',
    url: `/codeslice/api/${method}`,
    [Symbol.asyncIterator]: async function* iterator() { yield Buffer.from(options.body ?? '{}'); },
  };
  await route.handler(req, {
    writeHead: (code) => { status = code; },
    end: (value) => { text = value ?? ''; },
  });
  return { ok: status === 200, status, json: async () => JSON.parse(text) };
};

const api = async (method, payload = {}) => {
  const res = await fetch(`codeslice/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cwd: root, ...payload }),
  });
  const body = await res.json();
  if (!res.ok || body.ok !== true) throw new Error(`${method} ${res.status}: ${JSON.stringify(body)}`);
  return body.value;
};

// --- load the client bundle ---------------------------------------------
let mod;
window.__ModuleLoader__ = {
  load({ id, factory }) {
    if (id !== 'dsh-codeslice') throw new Error(`unexpected module id ${id}`);
    mod = factory((name) => {
      if (name === 'react') return React;
      throw new Error(`unexpected import ${name}`);
    });
  },
};
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'fetch', 'ResizeObserver', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame', clientSource)(
  window, window.document, window.navigator, globalThis.fetch, window.ResizeObserver, window.HTMLElement,
  globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame,
);
if (mod === undefined) throw new Error('the bundle did not register itself');

// --- a context shaped like the one DSH hands a client plugin -------------
const tabs = [];
const viewers = [];
const slotEntries = [];
const effects = [];
const opened = [];
const openedTabs = [];
const openViewCalls = [];
const localeDicts = new Map();

const fakeLocale = {
  register(namespace, dict) { localeDicts.set(namespace, dict); return () => localeDicts.delete(namespace); },
  bind(namespace) {
    return (key) => {
      const dict = localeDicts.get(namespace);
      const table = dict && (window.document.documentElement.lang.startsWith('zh') ? dict.zh : dict.en);
      return table && table[key] !== undefined ? table[key] : key;
    };
  },
  getLocale: () => ({ active: 'zh' }),
};

const fakeSidebar = {
  version: '0.28.2',
  features: ['openFile', 'hostRouteUrl', 'targetedOpen'],
  registerTab(descriptor) { tabs.push(descriptor); return () => { tabs.splice(tabs.indexOf(descriptor), 1); }; },
  registerFileViewer(descriptor) { viewers.push(descriptor); return () => {}; },
  openFile(scope, path) { opened.push({ scope, path }); },
  openTab(seed, scope) { openedTabs.push({ seed, scope }); },
  hostRouteUrl(path) { return new URL(path, 'http://localhost:5173/'); },
};

// Probed by the integration bridges: `layout` first, then the `conversation`
// service. Recording the calls lets the harness prove the probe order without a
// real host layout service.
const fakeLayout = {
  selectPanel() {},
  openView: (viewName) => openViewCalls.push(['layout', viewName]),
};
const fakeConversation = {
  openView: (viewName) => openViewCalls.push(['conversation', viewName]),
};

const provides = new Map([
  ['locale', fakeLocale],
  ['betterSidebar', fakeSidebar],
  ['layout', fakeLayout],
  ['conversation', fakeConversation],
  ['slots', {
    inject(owner, callback) { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {}; },
    register(descriptor, component) {
      const entry = { descriptor, component };
      slotEntries.push(entry);
      return () => { slotEntries.splice(slotEntries.indexOf(entry), 1); };
    },
  }],
]);

const warns = [];

const ctx = {
  logger: {
    warn: (m) => { warns.push(String(m)); console.warn('[client]', m); },
    info: () => {},
  },
  get: (name) => provides.get(name),
  effect: (fn, label) => {
    const dispose = fn();
    const entry = { label, dispose: typeof dispose === 'function' ? dispose : () => {} };
    effects.push(entry);
    return () => entry.dispose();
  },
  inject: (deps, cb) => { cb({ get: (name) => provides.get(name) }); return { dispose() {} }; },
  slots: provides.get('slots'),
};

mod.apply(ctx);

console.log(`box ${box.width}x${box.height} · inject=${JSON.stringify(mod.inject)}`);
console.log(`tabs: ${tabs.map((tab) => tab.id).join(', ')} | viewers: ${viewers.map((v) => v.id).join(', ')} | slots: ${slotEntries.map((s) => s.descriptor.id ?? s.descriptor.name).join(', ')} | locale: ${[...localeDicts.keys()].join(',')}`);

// --- assertion helpers ----------------------------------------------------
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`   ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`   ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const container = window.document.getElementById('host');
const reactRoot = createRoot(container);
const act = React.act;

const settle = async (ms = 60) => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
};

const waitFor = async (label, predicate, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await settle(80);
  }
  console.log(`   !! timed out waiting for ${label}`);
  return false;
};

const click = async (element) => {
  if (element === undefined || element === null) throw new Error('click target missing');
  await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await settle(80);
};

const mountInto = async (component, props, parent = window.document.body) => {
  const box2 = window.document.createElement('div');
  parent.appendChild(box2);
  const root = createRoot(box2);
  await act(async () => { root.render(React.createElement(component, props)); });
  return { box: box2, root };
};

const baseProps = {
  ctx,
  scope: { sessionId: 'session-1', cwd: root },
  visible: true,
};

/* ----------------------------------------------------------------------- */
/* 1. Registration shape                                                   */
/* ----------------------------------------------------------------------- */
console.log('\n--- registration ---');

const tabIds = tabs.map((tab) => tab.id);
check('knowledge tab registered', tabIds.includes('codeslice:knowledge'), tabIds.join(','));
check('knowledge tab is single', tabs.find((entry) => entry.id === 'codeslice:knowledge')?.single === true);
check('legacy graph tab removed', !tabIds.includes('codeslice:graph'), tabIds.join(','));
check('native reader is opt-in only', !tabIds.includes('codeslice:reader'), tabIds.join(','));

const viewEntry = slotEntries.find((entry) => entry.descriptor.name === 'conversation.view');
check('conversation.view slot registered', viewEntry !== undefined);
if (viewEntry) {
  const vd = viewEntry.descriptor;
  check('view id codeslice:graph', vd.id === 'codeslice:graph', vd.id);
  check('view order 20 (after chat 0 / trajectory 10)', vd.order === 20, String(vd.order));
  const labelText = typeof vd.label === 'function' ? vd.label() : vd.label;
  check('view label() resolves to a non-empty string', typeof labelText === 'string' && labelText !== '', JSON.stringify(labelText));
  check('view locale codeslice', vd.locale === 'codeslice', String(vd.locale));
  const child = vd.children?.['codeslice.graph.view'];
  check('child slot single session scope', child?.kind === 'single' && child?.scope === 'session', JSON.stringify(child));
  const injected = typeof vd.inject === 'function' ? vd.inject('session-1') : undefined;
  check('inject(sessionId) passes the session id', injected?.sessionId === 'session-1', JSON.stringify(injected));
}

const mainEntry = slotEntries.find((entry) => entry.descriptor.name === 'main' && entry.descriptor.key === 'codeslice');
check('main workbench panel registered', mainEntry !== undefined);
const panelRow = slotEntries.find((entry) => entry.descriptor.name === 'sidebar.panellist' && entry.descriptor.id === 'codeslice');
check('sidebar panel row registered', panelRow !== undefined);
const barEntry = slotEntries.find((entry) => entry.descriptor.id === 'codeslice:bar');
check('composer dock chip registered', barEntry !== undefined);
check('annotated file viewer registered', viewers.some((v) => v.id === 'codeslice:annotated'));

/* ----------------------------------------------------------------------- */
/* 2. Session graph view (third conversation tab)                           */
/* ----------------------------------------------------------------------- */
console.log('\n--- session graph view ---');

let graphBox = null;
let graphRoot = null;
let nodePath = undefined;
let openButton = undefined;
let seedKey = undefined;
const readerSeed = ctx.__codesliceProbe?.readerSeed;
if (viewEntry) {
  const mounted = await mountInto(viewEntry.component, { ...baseProps });
  graphBox = mounted.box;
  graphRoot = mounted.root;

  await waitFor('graph canvas', () => graphBox.querySelector('[data-cs="graph-canvas"]') !== null, 30000);
  check('graph canvas renders', graphBox.querySelector('[data-cs="graph-canvas"]') !== null);
  check('graph inspector renders', graphBox.querySelector('[data-cs="graph-inspector"]') !== null);

  // Parked-but-mounted: visible:false must not throw or drop state.
  await act(async () => { graphRoot.render(React.createElement(viewEntry.component, { ...baseProps, visible: false })); });
  await settle(300);
  await act(async () => { graphRoot.render(React.createElement(viewEntry.component, baseProps)); });
  await waitFor('graph resume', () => graphBox.querySelector('[data-cs="graph-canvas"]') !== null, 30000);
  check('parked → resumed without losing the canvas', graphBox.querySelector('[data-cs="graph-canvas"]') !== null);

  /* ---- graph node → reader bridge ---------------------------------- */

  await waitFor('canvas node buttons', () => graphBox.querySelectorAll('[data-cs-node]').length > 0, 20000);
  const nodeButtons = [...graphBox.querySelectorAll('[data-cs-node]')];
  for (const button of nodeButtons) {
    await click(button);
    await waitFor('inspector detail title', () => graphBox.querySelector('.gr-detail-title') !== null, 5000);
    const meta = graphBox.querySelector('.gr-detail-meta[title]');
    const candidate = meta !== null ? String(meta.title).split(':')[0] : '';
    const primary = graphBox.querySelector('.gr-btn-primary');
    if (candidate !== '' && primary !== null) {
      nodePath = candidate;
      openButton = primary;
      break;
    }
  }
  check('a graph node carrying a file path is selectable', nodePath !== undefined, `${nodeButtons.length} nodes`);

  seedKey = `${baseProps.scope.sessionId}::${nodePath ?? ''}`;
  const openedBeforeOpen = opened.length;
  if (openButton !== undefined) {
    await click(openButton);
    await waitFor('editor opened from graph', () => opened.length > openedBeforeOpen, 5000);
  }
  const graphOpen = opened[opened.length - 1];
  check('graph node opens the vendored editor',
    typeof graphOpen?.path === 'string' && graphOpen.path.endsWith(nodePath ?? '\u0000'),
    JSON.stringify(graphOpen));
  check('reader tab carries the node path',
    String(graphOpen?.path ?? '').endsWith(String(nodePath ?? '\u0000')), graphOpen?.path ?? '');
  check('reader tab scope keeps the session id',
    graphOpen?.scope?.sessionId === baseProps.scope.sessionId, JSON.stringify(graphOpen?.scope));
  if (readerSeed !== undefined && nodePath !== undefined) {
    check('focus range seeded before reader mounts', readerSeed.has(seedKey), seedKey);
    const seed = readerSeed.get(seedKey);
    check('seed carries a line range',
      Number.isFinite(Number(seed?.startLine)) && Number(seed.startLine) > 0, JSON.stringify(seed));
  }

  // Drain the graph's pending layout/settle callbacks inside act so React does
  // not warn about updates flushed after the section left act scope.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
} else {
  check('session graph view mounted', false);
}

/* ----------------------------------------------------------------------- */
/* 2b. The tab resolves its own working directory                           */
/* ----------------------------------------------------------------------- */

// The shell renders `conversation.view` with `inspectCall / viewRequest /
// openView / completeViewRequest` only — there is no `scope` on those props.
// If the view does not resolve the session directory itself, every request
// falls back to the Host's `defaultDirectory` and the canvas draws the harness
// profile (~40 nodes) instead of the project (~900), which is the failure that
// shipped in v3. This mounts the tab with no `scope` and a session service, and
// asserts the graph request carries the session's cwd.
console.log('\n--- session view resolves its own cwd ---');
if (viewEntry) {
  rawBodies.length = 0;
  provides.set('sessions', {
    binding: () => ({
      session: {
        projections: {
          faceOf: (name) => ({ getSnapshot: () => (name === 'workingDirectory' ? root : undefined) }),
        },
      },
    }),
    list: { getSnapshot: () => ({ byId: { 'session-nocwd': { cwd: root } } }) },
  });
  const noScope = await mountInto(viewEntry.component, {
    ...baseProps,
    scope: undefined,
    sessionId: 'session-nocwd',
  });
  await waitFor('graph canvas without scope', () => noScope.box.querySelector('[data-cs="graph-canvas"]') !== null, 30000);
  await settle(400);
  const graphCall = rawBodies.find((entry) => entry.method === 'graph');
  check('graph request carries the session cwd', graphCall?.body?.cwd === root, JSON.stringify(graphCall?.body?.cwd));
  await act(async () => { noScope.root.unmount(); });
  noScope.box.remove();
  provides.delete('sessions');
} else {
  check('session view cwd resolution', false);
}

/* ----------------------------------------------------------------------- */
/* 3. Knowledge tab                                                         */
/* ----------------------------------------------------------------------- */
console.log('\n--- knowledge tab ---');

// The vendored Better Sidebar owns file reading now, so there is no plugin
// reader tab to mount here. What remains plugin-owned is the knowledge tab.
const treeValue = await api('tree', {});
const treeEntries = Array.isArray(treeValue?.entries) ? treeValue.entries : [];
check('host tree returned entries', treeEntries.length > 0, `${treeEntries.length} entries`);

const knowledgeEntry = tabs.find((entry) => entry.id === 'codeslice:knowledge');
check('knowledge component resolved', knowledgeEntry !== undefined);
if (knowledgeEntry !== undefined) {
  const mounted = await mountInto(knowledgeEntry.component, { ...baseProps, tab: { id: 'cs-knowledge' } });
  await waitFor('notes panel root', () => mounted.box.querySelector('.cs-root') !== null, 20000);
  check('notes panel mounts', mounted.box.querySelector('.cs-root') !== null);
  await waitFor('notes request', () => callLog.includes('notes'), 20000);
  check('notes panel asks the host for notes', callLog.includes('notes'));
  if (process.env.CS_HARNESS_DEBUG === '1') {
    console.log('   [debug] api call sequence:', callLog.join(', '));
  }
  await act(async () => { mounted.root.unmount(); });
  mounted.box.remove();
}

/* ----------------------------------------------------------------------- */
/* 4. legacy tabs removed, composer chip still mounts                        */
/* ----------------------------------------------------------------------- */
console.log('\n--- legacy surfaces ---');

for (const id of ['codeslice:notes', 'codeslice:outline']) {
  check(`${id} is no longer registered`, !tabs.some((entry) => entry.id === id));
}

if (barEntry !== undefined) {
  const mounted = await mountInto(barEntry.component, { ctx, scope: baseProps.scope });
  await settle(600);
  check('composer chip renders a button', mounted.box.querySelector('button') !== null);
  await act(async () => { mounted.root.unmount(); });
  mounted.box.remove();
} else {
  check('composer chip mounted', false);
}

/* ----------------------------------------------------------------------- */
/* 5. Workbench: four pages, settings controls                             */
/* ----------------------------------------------------------------------- */
console.log('\n--- workbench ---');

let workbenchBox = null;
let workbenchRoot = null;
if (mainEntry !== undefined) {
  const mounted = await mountInto(mainEntry.component, { ctx, scope: { cwd: root }, visible: true });
  workbenchBox = mounted.box;
  workbenchRoot = mounted.root;

  await waitFor('workbench nav', () => workbenchBox.querySelector('[data-cs="workbench-nav"]') !== null, 30000);
  const navButtons = [...workbenchBox.querySelectorAll('[data-cs="workbench-nav"] [data-tab]')];
  const navIds = navButtons.map((button) => button.dataset.tab);
  check('nav lists three pages', navIds.length === 3, navIds.join(','));
  check('nav order notes / projects / settings',
    JSON.stringify(navIds) === JSON.stringify(['notes', 'projects', 'settings']), navIds.join(','));

  const expectedPages = ['notes', 'projects', 'settings'];
  for (const pageId of expectedPages) {
    const button = navButtons.find((row) => row.dataset.tab === pageId);
    if (button === undefined) {
      check(`nav button for ${pageId}`, false);
      continue;
    }
    await click(button);
    const panel = workbenchBox.querySelector(`[data-cs="workbench-page"][data-page="${pageId}"]`);
    check(`page ${pageId} present`, panel !== undefined);
    check(`page ${pageId} active (not hidden)`, panel !== null && panel.hasAttribute('hidden') === false);
  }

  // Settings page controls: three prompt blocks (system / qa / note),
  // retrieval topK/RRF/family pills/source switches, index status.
  await waitFor('settings prompt section', () => workbenchBox.querySelector('[data-cs="prompt-settings"]') !== null, 20000);
  const promptBlocks = [...workbenchBox.querySelectorAll('[data-cs="prompt-block"]')];
  const promptWhich = promptBlocks.map((block) => block.dataset.which).sort();
  check('three prompt blocks (system + qa + note)', promptBlocks.length === 3, promptWhich.join(','));
  check('prompt blocks cover system, qa and note',
    JSON.stringify(promptWhich) === JSON.stringify(['note', 'qa', 'system']), promptWhich.join(','));

  const retrieval = workbenchBox.querySelector('[data-cs="retrieval-settings"]');
  check('retrieval section present', retrieval !== null);
  if (retrieval !== null) {
    const numberInputs = retrieval.querySelectorAll('input[type="number"]');
    check('topK and RRF number inputs', numberInputs.length === 2, String(numberInputs.length));
    const familyPills = retrieval.querySelectorAll('.wb-pill');
    check('five relation-family toggles present', familyPills.length === 5, String(familyPills.length));
    const sourceSwitches = retrieval.querySelectorAll('.wb-switch');
    check('note / graph source toggles present', sourceSwitches.length === 2, String(sourceSwitches.length));
  }

  const indexStatus = workbenchBox.querySelector('[data-cs="index-status"]');
  check('vector index status section present', indexStatus !== null);
  if (indexStatus !== null) {
    const tag = indexStatus.querySelector('.wb-tag');
    check('index status tag has text', tag !== null && (tag?.textContent ?? '') !== '', tag?.textContent);
  }
} else {
  check('workbench mounted', false);
}

/* ----------------------------------------------------------------------- */
/* 6. Disposal                                                              */
/* ----------------------------------------------------------------------- */
console.log('\n--- disposal ---');

for (const root2 of [graphRoot, workbenchRoot]) {
  if (root2 !== null && root2 !== undefined) {
    await act(async () => { root2.unmount(); });
  }
}
await act(async () => { reactRoot.unmount(); });
for (const effect of effects) effect.dispose();

check('registrations removed on dispose', tabs.length === 0 && slotEntries.length === 0,
  `tabs=${tabs.length} slots=${slotEntries.length}`);
check('stylesheet removed on dispose',
  window.document.querySelectorAll('style[data-codeslice]').length === 0);

console.log(`\nopened tabs: ${openedTabs.length}`);
for (const entry of openedTabs.slice(0, 6)) console.log(`  ${entry.seed?.type ?? '?'} ${entry.seed?.path ?? entry.seed?.title ?? ''}`);
console.log(`openView probes: ${openViewCalls.length}`);
for (const [service, viewName] of openViewCalls.slice(0, 6)) console.log(`  ${service}.openView(${viewName})`);

if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) failed:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('\nall harness assertions passed');
