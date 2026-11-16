/**
 * Legacy workspace panel — retained as a thin compatibility shim.
 *
 * v3 moved the main surface to the workbench (`workbench/pages.js`): its notes
 * library, project register, note graph and settings page live there. The code
 * pane, the graph tab and the hand-written settings form this file used to own
 * are gone; their replacements are the sidebar reader, the session graph view
 * and the workbench settings page.
 *
 * The export stays so any older reference still resolves, but no new surface
 * should be added here.
 */

import { h } from './icons.js';
import { WorkbenchPage } from './workbench/pages.js';

/**
 * Compat wrapper delegating to the v3 workbench page.
 * @param props - standard slot props plus `{ctx, t, locale, visible}`.
 * @returns the workbench node.
 */
export function WorkspacePanel(props) {
  return h(WorkbenchPage, props);
}
