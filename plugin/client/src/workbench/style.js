/**
 * Styles for the CodeSlice workbench (Agent D surface).
 *
 * Only host semantic tokens are used (`--dsw-alias-*`) plus `color-mix`; no
 * hard-coded colors, and no indigo/violet unless they arrive as data colors.
 * E concatenates this after the shared stylesheet, so class names are `wb-*`
 * and never collide with the legacy `cs-*` surface.
 */

export const WORKBENCH_CSS = `
.wb-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font: inherit;
}

/* ---- navigation ------------------------------------------------------ */

.wb-nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  overflow-x: auto;
  scrollbar-width: thin;
  flex: 0 0 auto;
}

.wb-nav-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.wb-nav-item:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.wb-nav-item.wb-on {
  color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}

.wb-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wb-page {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wb-page[hidden] { display: none; }

.wb-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.wb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}

.wb-empty svg { opacity: .5; }

.wb-empty p { margin: 0; max-width: 42ch; }

.wb-empty b { color: var(--dsw-alias-label-primary); font-weight: 600; }

.wb-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11.5px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
}

.wb-banner.wb-bad { color: var(--dsw-alias-state-error-primary); }
.wb-banner.wb-ok { color: var(--dsw-alias-state-success-primary); }

/* ---- notes library --------------------------------------------------- */

.wb-notes-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.wb-notes-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}

.wb-notes-import {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.wb-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.wb-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.wb-btn:disabled { opacity: 0.55; cursor: default; }
.wb-btn.wb-on {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
}

.wb-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}

.wb-iconbtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

/* One row: batch-export checkbox beside the clickable note row. */
.wb-note-item { display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 30px; }
.wb-note-item .wb-note-row { flex: 1 1 auto; min-width: 0; }
.wb-note-item.wb-on { background: var(--dsw-alias-bg-layer-2); }
.wb-note-check {
  flex: 0 0 auto;
  margin: 0 0 0 6px;
  width: 12px;
  height: 12px;
  accent-color: var(--dsw-alias-brand-primary, #2f6fed);
  cursor: pointer;
}

/* A folder row in the tree: chevron to collapse, name to scope the list. */
.wb-folder-node { display: flex; align-items: center; gap: 2px; min-width: 0; }
.wb-folder-node .wb-folder-row { flex: 1 1 auto; min-width: 0; }
.wb-chevron {
  flex: 0 0 auto;
  width: 16px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 30px;
  cursor: pointer;
}

.wb-chevron:hover { color: var(--dsw-alias-label-primary); }

.wb-notes {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.wb-notes-side {
  flex: 0 0 230px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--dsw-alias-border-l1);
}

.wb-notes-side-head {
  flex: 0 0 auto;
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}

.wb-folder-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.wb-folder-row:hover { background: var(--dsw-alias-bg-layer-1); }
.wb-folder-row.wb-on { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }

/* Unfiled notes sit after the folder tree, matching the desktop library. */
.wb-notes-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 4px 2px;
  padding: 6px 4px 3px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}

.wb-note-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.wb-note-row:hover { background: var(--dsw-alias-bg-layer-1); }
.wb-note-row.wb-on { background: var(--dsw-alias-bg-layer-2); }
.wb-note-icon { flex: 0 0 auto; display: flex; color: var(--dsw-alias-label-secondary); }

.wb-note-title {
  font-size: 12px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-note-time {
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
}

.wb-reader {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.wb-reader-head {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.wb-reader-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.wb-reader-title h2 {
  margin: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-reader-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.wb-cite {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  cursor: pointer;
}

.wb-cite:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.wb-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
}

.wb-tag.wb-accent { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.wb-tag.wb-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.wb-tag.wb-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.wb-tag.wb-bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }

.wb-reader-doc {
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.6;
}

@media (max-width: 560px) {
  .wb-notes { flex-direction: column; }
  .wb-notes-side { flex: 0 0 42%; width: 100%; border-right: none; border-bottom: 1px solid var(--dsw-alias-border-l1); }
}

/* ---- project register ------------------------------------------------ */

.wb-proj-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.wb-proj-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.wb-proj-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.wb-proj-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-proj-root {
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-proj-stats {
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
}

.wb-proj-acts {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wb-proj-rename {
  flex: 1 1 auto;
  min-width: 120px;
}

/* ---- note graph ------------------------------------------------------- */

.wb-ng {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.wb-ng-side {
  flex: 0 0 220px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  overflow: auto;
  min-height: 0;
}

.wb-ng-node {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.wb-ng-node:hover { background: var(--dsw-alias-bg-layer-1); }
.wb-ng-node.wb-on { background: var(--dsw-alias-bg-layer-2); }

.wb-ng-node-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-ng-main {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-ng-neighbour {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
}

.wb-ng-neighbour-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.wb-ng-relation {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
}

/* ---- note reader: code peek ------------------------------------------- */

.wb-peek {
  margin: 8px 10px 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}

.wb-peek-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  min-width: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-size: 11.5px;
}

.wb-peek-path {
  min-width: 0;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-primary);
}

.wb-peek-tag {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}

.wb-peek-tag.wb-warn {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent);
  color: var(--dsw-alias-state-warn-primary);
}

.wb-peek-range {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}

.wb-peek-banner {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding: 5px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.wb-peek-sha {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  color: var(--dsw-alias-label-primary);
}

.wb-peek-gone { color: var(--dsw-alias-state-warn-primary); }

.wb-peek-code {
  max-height: 240px;
  overflow: auto;
  padding: 4px 0;
  background: var(--dsw-alias-bg-base);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.55;
}

.wb-peek-line {
  display: flex;
  gap: 10px;
  padding: 0 10px;
  white-space: pre;
}

.wb-peek-line.wb-on {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
  border-left: 2px solid var(--dsw-alias-brand-primary);
  padding-left: 8px;
}

.wb-peek-ln {
  flex: 0 0 auto;
  width: 34px;
  text-align: right;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.wb-peek-src { color: var(--dsw-alias-label-primary); }

.wb-peek-empty {
  padding: 10px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}

/* ---- settings --------------------------------------------------------- */

.wb-settings {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wb-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}

.wb-section-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.wb-section-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wb-section-head b { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }

.wb-section-desc {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
}

.wb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.wb-field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.wb-num { position: relative; display: block; }

.wb-num .cs-input {
  width: 100%;
  height: 32px;
  padding: 0 34px 0 10px;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.wb-unit {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  pointer-events: none;
}

.wb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 560px) {
  .wb-grid { grid-template-columns: 1fr; }
}

.wb-textarea {
  width: 100%;
  resize: vertical;
  min-height: 96px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  padding: 6px 8px;
}

.wb-textarea:focus {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}

/* ---- checkbox chips -------------------------------------------------- */

.wb-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.wb-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.wb-pill:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }

.wb-pill[data-on='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
  color: var(--dsw-alias-brand-primary);
}

.wb-pill-mark { display: inline-flex; align-items: center; justify-content: center; }
.wb-pill[data-on='true'] .wb-pill-mark { color: var(--dsw-alias-brand-primary); }

/* ---- switch rows ----------------------------------------------------- */

.wb-meta { display: flex; flex-direction: column; }

.wb-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
  min-width: 0;
}

.wb-meta:first-child .wb-meta-row:first-child { border-top: none; }

.wb-meta-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.wb-meta-label { font-size: 12px; color: var(--dsw-alias-label-primary); }
.wb-meta-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }

.wb-meta-value {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.wb-switch {
  flex: 0 0 auto;
  position: relative;
  width: 32px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.wb-switch[data-on='true'] {
  border-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 85%, transparent);
}

.wb-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--dsw-alias-label-secondary);
  transition: transform 0.14s ease, background 0.14s ease;
}

.wb-switch[data-on='true'] .wb-switch-knob {
  transform: translateX(14px);
  background: #fff;
}

.wb-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

/* ---- buttons / selects ----------------------------------------------- */

.wb-btn {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 7px;
}

.wb-settings .cs-btn.cs-primary {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary);
  color: #fff;
}

.wb-settings .cs-btn.cs-primary:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, #fff);
  color: #fff;
}

.wb-btn-sm { height: 24px; padding: 0 6px; }

.wb-select {
  flex: 0 0 auto;
  width: 170px;
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 7px;
}

/* ---- index meter ------------------------------------------------------ */

.wb-meter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
}

.wb-meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}

.wb-meter-pct {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}

.wb-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}

.wb-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  transition: width 0.2s ease;
}

.wb-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wb-notice {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
}

.wb-notice.wb-ok { color: var(--dsw-alias-state-success-primary); }
.wb-notice.wb-bad { color: var(--dsw-alias-state-error-primary); }

.wb-default-view {
  margin: 0;
  padding: 8px;
  max-height: 160px;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.wb-prompt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.wb-prompt-head > span { flex: 1 1 auto; }

/* The project graph page reuses GraphView; the wrapper only supplies the
   full height canvas and a compact back row above it. */
.wb-project-graph {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wb-graph-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.wb-graph-root {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}

.wb-project-graph > .cs-graph {
  flex: 1 1 auto;
  min-height: 0;
}

/* The notes graph page reuses the same GraphView canvas; only the wrapper
   height and the absence of a toolbar row are new. */
.wb-note-graph {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wb-note-graph > .gr-view {
  flex: 1 1 auto;
  min-height: 0;
}

/* The knowledge graph opened inside the library's reader area. */
.wb-reader-graph {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
`;
