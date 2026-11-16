/**
 * Resolve the workspace a CodeSlice surface belongs to.
 *
 * A right-sidebar tab gets `scope.cwd`; a global main panel does not receive a
 * workspace at all. The host's workspace model does: every item lists the
 * sessions bound to it, so the active session is the join key. Keeping this in
 * one module means the composer bar and the workspace panel cannot disagree
 * about which repository they are reading.
 */

/**
 * @param ctx - the client context.
 * @param props - slot props, optionally carrying `scope.cwd` or `sessionId`.
 * @returns an absolute directory, or undefined.
 */
export function resolveWorkspace(ctx, props) {
  const fromScope = props?.scope && typeof props.scope.cwd === 'string' ? props.scope.cwd : '';
  if (fromScope !== '') return fromScope;

  try {
    const sessionId = typeof props?.sessionId === 'string' && props.sessionId !== ''
      ? props.sessionId
      : (() => {
        const ui = typeof ctx?.get === 'function' ? ctx.get('uiSession') : undefined;
        const current = ui?.current?.value;
        return current?.props?.sessionId ?? current?.hooks?.session?.sessionId;
      })();
    // The session's own cwd is the authority (ui-conversation reads it too);
    // the workspace model below only exists to answer "which folder is this".
    if (typeof sessionId === 'string' && sessionId !== '') {
      const listed = typeof ctx?.get === 'function'
        ? ctx.get('sessions')?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
        : undefined;
      if (typeof listed === 'string' && listed !== '') return listed;
    }
    const model = typeof ctx?.get === 'function' ? ctx.get('workspaces')?.model : undefined;
    const items = Array.isArray(model?.items) ? model.items : [];
    if (typeof sessionId === 'string' && sessionId !== '') {
      const owner = items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId));
      const path = typeof owner?.path === 'string' ? owner.path : '';
      if (path !== '') return path;
    }
    if (items.length > 0 && typeof items[0]?.path === 'string' && items[0].path !== '') {
      return items[0].path;
    }
  } catch {
    // Fall through to the working-directory service.
  }

  const working = typeof ctx?.get === 'function' ? ctx.get('workingDirectory') : undefined;
  if (working === undefined || working === null) return undefined;
  if (typeof working.get === 'function') {
    const value = working.get();
    if (typeof value === 'string' && value !== '') return value;
  }
  if (typeof working.defaultDirectory === 'string' && working.defaultDirectory !== '') {
    return working.defaultDirectory;
  }
  return undefined;
}
