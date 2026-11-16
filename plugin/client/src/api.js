/**
 * Transport for the browser half.
 *
 * One method, one envelope, from `WIRE.md`: `POST /codeslice/api/<method>` with
 * a JSON body, answering `{ok:true, value}` or `{ok:false, error:{code,message}}`.
 * Nothing here invents a field or a second endpoint.
 *
 * Every call is abortable. That is not decoration: the graph tab is parked with
 * `visible: false` rather than unmounted, so a scope change mid-flight would
 * otherwise land a stale answer in a live panel, and the layout of a workspace
 * the reader has already left would paint over the current one.
 */

/**
 * Base URL of the Host half's routes.
 *
 * Resolved through the sidebar service when it is installed: it knows how to
 * keep the request inside a reverse-proxy prefix and inside the desktop shell's
 * `dsh-app://` origin, where a root-absolute path would miss the Host entirely.
 * The plain page-relative fallback is correct for a GUI served from its own
 * origin.
 * @param ctx - the client context.
 * @returns an absolute URL ending in a slash.
 */
export function apiBase(ctx) {
  const sidebar = ctx && typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined;
  if (sidebar && typeof sidebar.hostRouteUrl === 'function') {
    try {
      const url = sidebar.hostRouteUrl('codeslice/api/');
      if (url !== undefined && url !== null && typeof url.href === 'string') return url.href;
    } catch {
      // Fall through to page-relative resolution.
    }
  }
  return new URL('codeslice/api/', document.baseURI).href;
}

/**
 * The error an `api` rejection carries: the Host's own message plus its code,
 * because "HTTP 500" alone tells a reader nothing and the code is what the
 * panel switches on when it wants to offer a retry.
 */
export class ApiError extends Error {
  /**
   * @param message - the Host's message, or a transport description.
   * @param code - the wire `error.code`, or `'transport'`.
   * @param status - the HTTP status when there was a response.
   */
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Call one API method.
 *
 * @param ctx - the client context (used only to resolve the base URL).
 * @param method - one of `status|rebuild|graph|node|search|outline|files|notes|annotations|layout`.
 * @param payload - the method's parameters; `root`/`cwd` may be supplied by the caller.
 * @param signal - an `AbortSignal`; aborting rejects with an `AbortError`.
 * @returns the envelope's `value`.
 */
export async function api(ctx, method, payload, signal) {
  let response;
  try {
    response = await fetch(`${apiBase(ctx)}${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    const detail = error && error.message ? error.message : String(error);
    throw new ApiError(`network error (${detail})`, 'transport', 0);
  }

  const parsed = await response.json().catch(() => null);
  if (parsed === null || parsed.ok !== true) {
    const message = parsed && parsed.error && parsed.error.message
      ? parsed.error.message
      : `HTTP ${response.status}`;
    const code = parsed && parsed.error && parsed.error.code ? parsed.error.code : 'error';
    throw new ApiError(message, code, response.status);
  }
  return parsed.value;
}

/**
 * A per-panel request scope.
 *
 * Owns one `AbortController` per in-flight call and remembers the newest
 * sequence number, so a slow earlier response cannot overwrite a fast later
 * one. Two jobs, one object: cancelling and ordering are the same problem.
 */
export function makeRequestScope() {
  let controller;
  let sequence = 0;
  let disposed = false;

  return {
    /**
     * Run `task` with a fresh signal, superseding any call still in flight.
     * @param task - `(signal) => Promise<T>`.
     * @returns the task's value, or `undefined` when superseded/aborted.
     */
    async run(task) {
      if (disposed) return undefined;
      if (controller !== undefined) controller.abort();
      controller = new AbortController();
      const mine = ++sequence;
      try {
        const value = await task(controller.signal);
        return mine === sequence && !disposed ? value : undefined;
      } catch (error) {
        if (error && error.name === 'AbortError') return undefined;
        throw error;
      }
    },

    /**
     * Abort whatever is in flight, keeping the scope usable.
     *
     * This is what a *parked* panel needs: stop the work in progress, but stay
     * able to fetch again when the tab comes back. `dispose()` is the unmount
     * path and is deliberately terminal — using it for parking left every later
     * `run` returning `undefined`, so refresh and resume silently did nothing.
     */
    abort() {
      if (disposed) return;
      if (controller !== undefined) controller.abort();
      controller = undefined;
      // Bumping the sequence is what makes an already-resolved-but-unclaimed
      // answer get discarded rather than applied to a panel nobody is watching.
      sequence += 1;
    },

    /** Abort whatever is in flight; further `run` calls are no-ops. */
    dispose() {
      disposed = true;
      if (controller !== undefined) controller.abort();
      controller = undefined;
    },
  };
}

/**
 * Build a `(method, payload) => Promise<value>` bound to one workspace.
 *
 * `cwd` rides on every request so the Host never has to guess which workspace a
 * parked tab belongs to.
 * @param ctx - the client context.
 * @param cwd - the workspace directory from `scope.cwd`, or `undefined`.
 * @returns the bound caller.
 */
export function makeCaller(ctx, cwd) {
  return (method, payload, signal) => api(ctx, method, {
    ...(payload ?? {}),
    ...(cwd === undefined ? {} : { cwd }),
  }, signal);
}
