/**
 * Session-scoped graph view: the third `conversation.view` slot, listed beside
 * the host's own 对话 (order 0) and 轨迹 (order 10).
 *
 * This module is the Agent E integration point (INTERFACES-v3 §2.5): the
 * GraphView itself lives in `graph/view.js`; here we own only the slot descriptor,
 * its one copy key and the registration boundary. A failed registration is
 * surfaced through `ctx.logger.warn` — it must not be swallowed silently.
 *
 * Discipline: every top-level binding carries the `ix` prefix, because the whole
 * client bundle is one function scope and a reused top-level name is a fatal
 * redeclaration. React/hooks come from `./icons.js`; no new dependency.
 */

import { h } from './icons.js';
import { mergeDict } from './i18n.js';
import { GraphView } from './graph/view.js';

/**
 * Copy owned by this registration, merged into the shared dictionary at load
 * time. `view.graph` labels the session view slot itself (the host renders the
 * label next to 对话 / 轨迹), so it must resolve to a non-empty string.
 */
const IX_VIEW_LOCALE = {
  zh: { 'view.graph': '代码图谱' },
  en: { 'view.graph': 'Code graph' },
};
mergeDict(IX_VIEW_LOCALE);

/**
 * Register the `conversation.view` slot that renders the GraphView for one
 * session.
 *
 * Slot shape (frozen by INTERFACES-v3 §2.5):
 *   - `name: 'conversation.view'`, `id: 'codeslice:graph'`, `order: 20`;
 *   - `label: () => t('view.graph')` — a function, and it must resolve to a
 *     non-empty string, otherwise the host renders no tab at all;
 *   - `locale: 'codeslice'`;
 *   - `children: { 'codeslice.graph.view': { kind: 'single', scope: 'session' } }`;
 *   - `inject(sessionId)` hands the session id into the mounted view.
 *
 * @param ctx - the client context.
 * @param t - the bound translator, carrying `.locale`.
 * @param onOpenFile - bridge `(props, target)` handed to GraphView's
 *   `onOpenFile`; the integration side opens the reader tab.
 * @returns true when the slot was registered; false when the registry is
 *   unavailable or the registration threw (warned explicitly).
 */
export function ixRegisterConversationView(ctx, t, onOpenFile) {
  const slots = (ctx && typeof ctx.get === 'function' ? ctx.get('slots') : undefined) ?? ctx.slots;
  if (slots === undefined || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    try { ctx?.logger?.warn?.('codeslice: conversation view slot is unavailable; the graph view is not registered'); } catch { /* noop */ }
    return false;
  }

  try {
    ctx.effect(() => slots.inject('conversation.view', () => slots.register({
      name: 'conversation.view',
      id: 'codeslice:graph',
      order: 20,
      label: () => t('view.graph'),
      locale: 'codeslice',
      children: {
        'codeslice.graph.view': { kind: 'single', scope: 'session' },
      },
      inject: (sessionId) => ({ sessionId }),
    }, (properties) => h(GraphView, {
      ...properties,
      ctx,
      t,
      locale: t.locale,
      // The session tab has the same squeeze as the workbench: a docked 332px
      // inspector plus the conversation's right sidebar leaves a ~400px stage.
      // Use the drawer variant there too, so the canvas gets the main panel's
      // full width and the community list stays one click away under 详情.
      railCollapsible: true,
      onOpenFile: (target) => { if (typeof onOpenFile === 'function') onOpenFile(properties, target); },
    }))), 'codeslice: session graph view');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { ctx?.logger?.warn?.(`codeslice: session graph view registration failed: ${message}`); } catch { /* noop */ }
    return false;
  }
}
