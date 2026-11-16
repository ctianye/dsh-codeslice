/**
 * The vendored Better Sidebar client.
 *
 * `D:\DSH-better-sidebar-main` is the upstream 0.28.2 source (MIT). Instead of
 * rebuilding its 184-file TypeScript tree, the plugin ships the **published
 * client bundle** byte-for-byte under `client/vendor/better-sidebar/` and
 * mounts it as a child Cordis plugin:
 *
 *   1. the bundle is a normal DSH client registration
 *      (`window.__ModuleLoader__.load({ id: 'dsh-better-sidebar', factory })`),
 *      served from this plugin's own asset route;
 *   2. a classic `<script>` executes it, so the module table owns its factory;
 *   3. the bundle's exports are required back and mounted with `ctx.plugin`,
 *      which gives it its own fiber, service injections and cleanup.
 *
 * Two adaptations are applied to the vendored copy (see `dev/vendor-better-sidebar.mjs`):
 *   - its lazy chunk base moves from the upstream `/sidebar/bundle/` route to
 *     `/codeslice/assets/better-sidebar/`, because this plugin owns that route;
 *   - `remote` / `remote.session` leave its inject list: the desktop profile
 *     has no Remote surface, and a required service that never appears would
 *     hold the child fiber forever (which is exactly how a bundle-level
 *     activation of this plugin wedges the whole boot screen). Every call site
 *     is already optional-chained.
 *
 * The mounted client owns the right Sidebar (explorer / editor tabs / diffs),
 * its CodeMirror editor, syntax themes and the floating "add to conversation"
 * selection popup. CodeSlice's own layer (range frames + title bars) observes
 * that editor from the outside — this module is only the loader.
 */

/** Global status handle used by diagnostics and the reader fallback. */
const STATE_KEY = '__codesliceBetterSidebar';

export function betterSidebarState() {
  return globalThis[STATE_KEY];
}

function mountState() {
  const current = globalThis[STATE_KEY];
  if (current !== undefined) return current;
  const created = { phase: 'idle', error: undefined, startedAt: 0, mountedAt: 0, fiber: undefined };
  globalThis[STATE_KEY] = created;
  return created;
}

/**
 * Absolute URL of the vendored core bundle.
 * @returns the URL string.
 */
export function betterSidebarBundleUrl() {
  return new URL('codeslice/assets/better-sidebar/client.js', document.baseURI).href;
}

/**
 * Execute one classic script and resolve when it has run.
 *
 * The bundle registers itself into the client module table; there is no
 * page global to poll, so the script's own `load` event is the signal.
 * @param url - absolute script URL.
 * @returns a promise that settles when the script executed or failed.
 */
function runScript(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.async = true;
    element.src = url;
    element.addEventListener('load', () => {
      element.remove();
      resolve();
    }, { once: true });
    element.addEventListener('error', () => {
      element.remove();
      reject(new Error(`better-sidebar bundle failed to load: ${url}`));
    }, { once: true });
    document.head.append(element);
  });
}

/** Wait until `probe()` returns a truthy value, or the deadline passes. */
async function until(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined && value !== null && value !== false) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/**
 * Mount the vendored client once.
 *
 * @param ctx - this plugin's client context (the parent fiber).
 * @param requireFn - the client module table's require, captured inside the
 *   bundle factory (a bare `require` is not a page global).
 * @returns the status record; a failed mount is recorded, never thrown.
 */
export async function mountBetterSidebar(ctx, requireFn) {
  const current = mountState();
  if (current.phase === 'mounted') return current;
  if (current.phase === 'mounting') return current;

  current.phase = 'mounting';
  current.error = undefined;
  current.startedAt = Date.now();

  try {
    if (typeof requireFn !== 'function') throw new Error('client module table require is unavailable');

    // A page reload can execute this client bundle again while the renderer's
    // module table still owns the vendor factory from the previous mount.
    // Re-running its classic script in that state throws "duplicate factory
    // registration for dsh-better-sidebar" and takes the whole plugin boot
    // down with it. Reuse the registered factory when it is already there.
    let existing;
    try {
      existing = requireFn('dsh-better-sidebar');
    } catch {
      existing = undefined;
    }
    if (existing === undefined || existing === null) {
      await runScript(betterSidebarBundleUrl());
      existing = await until(() => {
        try {
          return requireFn('dsh-better-sidebar');
        } catch {
          return undefined;
        }
      }, 3000, 'dsh-better-sidebar module');
    }

    const module = existing;

    const plugin = {
      name: 'dsh-better-sidebar',
      inject: ['slots', 'sessions', 'locale', 'modules', 'connection'],
      apply: module.apply,
    };

    current.fiber = ctx.plugin(plugin);

    const service = await until(() => {
      try {
        return ctx.get('betterSidebar');
      } catch {
        return undefined;
      }
    }, 8000, 'betterSidebar service');

    current.phase = 'mounted';
    current.mountedAt = Date.now();
    current.version = service.version ?? module.version ?? '0.28.2';
    return current;
  } catch (error) {
    current.phase = 'failed';
    current.error = error instanceof Error ? error.message : String(error);
    return current;
  }
}
