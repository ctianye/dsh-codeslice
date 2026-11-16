/**
 * Lazy client assets served by the Host half.
 *
 * The graph renderer (vis-network) and the code editor (CodeMirror) are too
 * heavy to inline into `client.js`, and neither is needed until its surface is
 * opened. Each is one same-origin classic script registered on a global; this
 * module owns the URL resolution, the one-in-flight-per-name cache and the
 * failed-load retry.
 *
 * URL resolution goes through the same `hostRouteUrl` seam the API uses: a
 * reverse-proxied GUI would otherwise request `/codeslice/assets/...` at the
 * origin root and 404, and the desktop shell's `dsh-app://` origin is not
 * reachable with a root-absolute path at all.
 */

const inFlight = new Map();

/**
 * Absolute URL of one allow-listed asset.
 * @param ctx - the client context.
 * @param name - the asset file name (`vis-network.min.js`, `editor.js`).
 * @returns the URL string.
 */
export function assetUrl(ctx, name) {
  const path = `codeslice/assets/${name}`;
  const sidebar = ctx && typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
  if (sidebar && typeof sidebar.hostRouteUrl === 'function') {
    try {
      const url = sidebar.hostRouteUrl(path);
      if (url !== undefined && url !== null && typeof url.href === 'string') return url.href;
    } catch {
      // Fall through to page-relative resolution.
    }
  }
  return new URL(path, document.baseURI).href;
}

/**
 * Load one classic script once, then resolve when its global is present.
 *
 * A failed load is not cached: the next caller retries, which is what makes a
 * Host that was restarting when the graph first opened recoverable without a
 * page reload.
 *
 * @param ctx - the client context.
 * @param name - the allow-listed file name.
 * @param ready - returns the injected global once the script has executed.
 * @returns the global, or a rejected promise.
 */
export function loadAsset(ctx, name, ready) {
  const current = ready();
  if (current !== undefined) return Promise.resolve(current);
  const existing = inFlight.get(name);
  if (existing !== undefined) return existing;

  const promise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document to load the asset into'));
      return;
    }
    const element = document.createElement('script');
    element.async = true;
    element.src = assetUrl(ctx, name);
    element.addEventListener('load', () => {
      element.remove();
      const value = ready();
      if (value === undefined) reject(new Error(`${name} loaded but registered nothing`));
      else resolve(value);
    }, { once: true });
    element.addEventListener('error', () => {
      element.remove();
      reject(new Error(`${name} failed to load`));
    }, { once: true });
    document.head.append(element);
  }).finally(() => {
    inFlight.delete(name);
  });

  inFlight.set(name, promise);
  return promise;
}

/**
 * vis-network, as graphify itself pins it.
 * @param ctx - the client context.
 * @returns the `vis` namespace.
 */
export function loadVis(ctx) {
  return loadAsset(ctx, 'vis-network.min.js', () => (
    typeof globalThis.vis?.Network === 'function' ? globalThis.vis : undefined
  ));
}

/**
 * The CodeMirror chunk.
 * @param ctx - the client context.
 * @returns `{create}` from `client/editor.js`.
 */
export function loadEditor(ctx) {
  return loadAsset(ctx, 'editor.js', () => (
    typeof globalThis.__codesliceEditor?.create === 'function' ? globalThis.__codesliceEditor : undefined
  ));
}
