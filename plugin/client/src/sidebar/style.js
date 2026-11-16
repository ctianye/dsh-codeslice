/**
 * Stylesheet fragment for the CodeSlice reader sidebar (`codeslice:reader`).
 *
 * Discipline matches the base sheet in `styles.js`:
 *   - every selector starts with `cs-sb-` (the `cs-` prefix the host owns);
 *   - colours come only from `--dsw-alias-*` tokens, derived with `color-mix`;
 *   - no `:root`, no `body`, no `!important`, no scrollbar rules;
 *   - sizes, spacing and radii are plain values (the host declares no tokens).
 *
 * The integration side appends this fragment after the base sheet, so a shared
 * selector this area owns gets the last word.
 */

export const SIDEBAR_CSS = `
/* ---------------------------------------------------------------- *
 * Reader shell: tree on top, tabs, then editor + frame rail         *
 * ---------------------------------------------------------------- */
.cs-sb-root {
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
  box-sizing: border-box;
}
.cs-sb-root *, .cs-sb-root *::before, .cs-sb-root *::after { box-sizing: border-box; }

/* ---- file tree ---------------------------------------------------- */
.cs-sb-tree {
  flex: 0 0 auto; display: flex; flex-direction: column;
  max-height: 42%; min-height: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cs-sb-tree-head {
  display: flex; align-items: center; gap: 6px; padding: 5px 8px;
  flex: 0 0 auto;
}
.cs-sb-tree-list {
  flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain;
  padding: 2px 0 6px;
}
.cs-sb-tree-row {
  display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 2px 8px 2px 0; min-height: 22px;
  border: none; background: transparent; cursor: pointer;
  text-align: left; font: inherit; color: inherit; min-width: 0;
}
.cs-sb-tree-row:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-sb-tree-row.cs-active { background: var(--dsw-alias-bg-layer-2); }
.cs-sb-tree-row.cs-active .cs-sb-tree-name { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.cs-sb-tree-twist {
  display: flex; flex: 0 0 auto; width: 14px; justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.cs-sb-tree-twist[data-open='true'] { transform: rotate(90deg); }
.cs-sb-tree-glyph { display: flex; flex: 0 0 auto; color: var(--dsw-alias-label-secondary); }
.cs-sb-tree-name {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11.5px;
}
.cs-sb-tree-row.cs-dir .cs-sb-tree-name { color: var(--dsw-alias-label-primary); }
.cs-sb-tree-meta { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

/* ---- tab strip ------------------------------------------------------ */
.cs-sb-tabs {
  display: flex; align-items: stretch; gap: 2px;
  flex: 0 0 auto; min-height: 30px; padding: 3px 6px 0;
  overflow-x: auto; overflow-y: hidden;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-sb-tab {
  display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto;
  max-width: 150px; min-height: 24px; padding: 0 6px;
  border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; cursor: pointer;
}
.cs-sb-tab.cs-on {
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1);
}
.cs-sb-tab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-sb-tab-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0; flex: 0 0 auto;
  border: none; border-radius: 4px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.cs-sb-tab-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

/* ---- body: editor + frame rail -------------------------------------- */
.cs-sb-body { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-sb-editor-wrap {
  position: relative; flex: 1 1 auto; min-width: 0; min-height: 0;
  display: flex; flex-direction: column;
}
.cs-sb-editor-host { flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-sb-editor-note {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  font-size: 11px; color: var(--dsw-alias-label-secondary);
}

.cs-sb-rail {
  flex: 0 0 176px; display: flex; flex-direction: column; gap: 3px;
  min-height: 0; overflow: auto; overscroll-behavior: contain;
  padding: 5px 6px; border-left: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-sb-rail-empty {
  padding: 8px 6px; font-size: 10.5px; line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}

/* ---- frame strip: the 19px title bar above a framed range ----------- */
.cs-sb-strip {
  display: flex; align-items: center; gap: 5px;
  height: 19px; flex: 0 0 auto; min-width: 0;
  padding: 0 4px; border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
}
.cs-sb-strip.cs-moved {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 42%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);
}
.cs-sb-strip.cs-missing {
  opacity: .45; border-style: dashed;
  background: transparent;
}
.cs-sb-strip-flag {
  display: inline-flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0;
  height: 16px; padding: 0 6px; border: none; border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 10.5px; line-height: 14px; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cs-sb-strip-flag:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.cs-sb-strip-flag[disabled] { cursor: default; }
.cs-sb-strip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-sb-badge {
  flex: 0 0 auto; padding: 0 5px; font-size: 9px; line-height: 14px; border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.cs-sb-badge.cs-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.cs-sb-badge.cs-bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.cs-sb-strip-delete {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; padding: 0; flex: 0 0 auto;
  border: none; border-radius: 4px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; opacity: 0;
}
.cs-sb-strip:hover .cs-sb-strip-delete { opacity: 1; }
.cs-sb-strip-delete:hover { color: var(--dsw-alias-state-error-primary); }

/* ---- selection picker bar ------------------------------------------- */
.cs-sb-picker-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  flex: 0 0 auto; padding: 5px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-sb-picker-label {
  flex: 1 1 auto; min-width: 0; font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-sb-picker-label b { color: var(--dsw-alias-label-primary); }

/* ---- note inline form ------------------------------------------------- */
.cs-sb-noteform { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--dsw-alias-border-l1); }
.cs-sb-noteform .cs-row { display: flex; align-items: center; gap: 4px; }

/* ---- empty / error ---------------------------------------------------- */
.cs-sb-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 22px 16px; text-align: center; height: 100%;
  color: var(--dsw-alias-label-secondary); font-size: 11.5px;
}
.cs-sb-empty b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.cs-sb-empty p { margin: 0; max-width: 42ch; }
.cs-sb-banner {
  display: flex; align-items: flex-start; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; font-size: 11px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-state-error-primary);
}
.cs-sb-banner.cs-ok { color: var(--dsw-alias-state-success-primary); }
.cs-sb-banner .cs-grow { color: var(--dsw-alias-label-secondary); }
.cs-sb-history {
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; font-size: 11px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
}
.cs-sb-history svg { color: var(--dsw-alias-brand-primary); }
`;
