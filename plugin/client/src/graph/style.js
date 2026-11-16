/**
 * Styles for the CodeSlice graph view (Agent C, §2.2).
 *
 * Chrome colours go through the host semantic tokens (`--dsw-alias-*`) and
 * `color-mix`; the Tableau-10 data colours live in `theme.js` and are applied
 * inline, which is the one colour exception the contract allows.
 *
 * E concatenates this into the sheet: `fullCss() + GRAPH_CSS + WORKBENCH_CSS`.
 */

export const GRAPH_CSS = `
.gr-view {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  /* The conversation pane is resized independently of the window (opening the
   * reader narrows it), so the narrow layout must key off this box, not the
   * viewport — the desktop reference declares container-type: inline-size for
   * the same reason. */
  container-type: inline-size;
  container-name: gr;
  overflow: hidden;
}

/* ---- header: stats + family switch bar ----------------------------- */

.gr-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.gr-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}

.gr-stat b {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  margin-right: 3px;
}

.gr-family-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.gr-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.gr-chip:hover {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}

.gr-chip[aria-pressed="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}

.gr-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  flex: 0 0 auto;
}

.gr-banner-all {
  flex-basis: 100%;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
  color: var(--dsw-alias-state-warn-primary);
  font-size: 12px;
}

/* ---- body: stage + rail -------------------------------------------- */

.gr-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 332px;
  min-height: 0;
  flex: 1 1 auto;
}

/* Project canvas: the stage takes the whole main panel; the inspector is a
   drawer toggled by a single button, so 1k-node graphs are not squeezed into
   a 600 px column beside a permanently docked rail. */
.gr-body-collapsible {
  position: relative;
  grid-template-columns: minmax(0, 1fr);
}

.gr-body-collapsible > .gr-rail {
  display: none;
}

.gr-rail-toggle {
  position: absolute;
  top: 9px;
  right: 44px; /* leave the stage's own fit / zoom toolbar at right:10px */
  z-index: 9;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 27px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 11.5px;
  cursor: pointer;
}

.gr-rail-toggle:hover {
  border-color: var(--dsw-alias-brand-primary);
}

.gr-body-collapsible > .gr-rail-drawer {
  display: flex;
  position: absolute;
  top: 44px;
  right: 8px;
  bottom: 8px;
  z-index: 8;
  width: 332px;
  max-width: calc(100% - 16px);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  box-shadow: var(--dsw-alias-shadow-l2, 0 8px 24px rgba(0, 0, 0, .18));
  overflow: hidden;
}

.gr-body-collapsible > .gr-rail-drawer[hidden] {
  display: none;
}

@container gr (max-width: 760px) {
  .gr-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 46%);
  }
  /* The drawer variant has no second column/row to give a share to: its rail
     is display:none until 详情 opens it as an overlay. Leaving the 46% row in
     place made the stage 206px tall even when the canvas had the full pane. */
  .gr-body-collapsible {
    grid-template-rows: minmax(0, 1fr);
  }
}

/* ---- canvas stage ---------------------------------------------------- */

.gr-stage {
  position: relative;
  min-height: 0;
  min-width: 0;
}

.gr-stage-host {
  position: absolute;
  inset: 0;
}

.gr-stage-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12.5px;
  text-align: center;
  pointer-events: none;
}

.gr-stage-empty b {
  color: var(--dsw-alias-label-primary);
}

.gr-stage-pill {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.gr-spin {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary);
  border-radius: 50%;
  animation: gr-rotate 0.9s linear infinite;
  display: inline-block;
}

@keyframes gr-rotate {
  to { transform: rotate(360deg); }
}

.gr-stage-tools {
  position: absolute;
  right: 10px;
  top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gr-iconbtn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 14px;
}

.gr-iconbtn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.gr-stage-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  pointer-events: none;
}

/* ---- rail ------------------------------------------------------------ */

.gr-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
}

@container gr (max-width: 760px) {
  .gr-rail {
    border-left: none;
    border-top: 1px solid var(--dsw-alias-border-l1);
  }
}

.gr-rail-search {
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.gr-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
}

.gr-input::placeholder {
  color: var(--dsw-alias-label-secondary);
}

.gr-rail-scroll {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
  padding: 8px 10px;
}

/* ---- legend: community list ----------------------------------------- */

.gr-legend-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin-bottom: 6px;
}

.gr-legend-head .gr-grow { flex: 1 1 auto; }

.gr-comm-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gr-comm {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 5px;
  border: 1px solid #171717;
  border-radius: 6px;
  background: #fff;
  color: #171717;
  cursor: pointer;
  font-size: 12.5px;
}

.gr-comm:hover { background: #f3f4f6; }

/* Selected community is a solid blue pill: the old 10% brand tint was almost
   invisible against the rail's own surface, so "which community is filtered"
   could not be read without comparing two rows side by side. Unselected rows
   are deliberately white with a black hairline, matching the DSH chrome. */
.gr-comm[aria-pressed="true"] {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
  box-shadow: 0 1px 4px rgba(37, 99, 235, .28);
}
.gr-comm[aria-pressed="true"] .gr-comm-label { font-weight: 600; }
.gr-comm[aria-pressed="true"] .gr-count { color: rgba(255, 255, 255, .82); }
.gr-comm[aria-pressed="true"]:hover { background: #1d4ed8; border-color: #1d4ed8; }

.gr-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.gr-comm-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gr-count {
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.gr-legend-hint {
  margin-top: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
  line-height: 1.5;
}

/* ---- inspector ------------------------------------------------------- */

.gr-detail-back {
  margin-bottom: 6px;
}

.gr-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.gr-btn:hover {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}

.gr-btn-primary {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}

.gr-detail-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
}

.gr-detail-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gr-kind {
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.gr-kind-note {
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.gr-detail-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gr-detail-meta {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gr-detail-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}

.gr-rationale {
  padding: 5px 8px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}

/* ---- relation groups -------------------------------------------------- */

.gr-rel-group {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--dsw-alias-bg-base);
}

.gr-rel-group > summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12.5px;
  list-style: none;
}

.gr-rel-group > summary::-webkit-details-marker { display: none; }

.gr-rel-group > summary .gr-grow { flex: 1 1 auto; }

.gr-rel-count {
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.gr-rel-list {
  display: flex;
  flex-direction: column;
  padding: 2px 6px 6px;
}

/* Rows are buttons, so the reset has to be explicit: without it the host's
   default button chrome turns every declaration into a raised grey card. DSH
   lists are flat white rows separated by a hairline. */
.gr-rel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 6px;
  border: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.gr-rel-row:last-child { border-bottom: none; }

.gr-rel-row:hover { background: var(--dsw-alias-bg-layer-1); }

.gr-rel-row:hover .gr-rel-label { color: var(--dsw-alias-label-primary); }

.gr-dir {
  color: var(--dsw-alias-label-secondary);
  flex: 0 0 auto;
}

.gr-rel-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gr-rel-kind {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  flex: 0 0 auto;
}

.gr-rel-loc {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
}

.gr-rel-open {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
}

.gr-rel-relation {
  flex: 0 0 auto;
  font-size: 11px;
}

.gr-group-more {
  padding: 6px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.gr-empty-line {
  padding: 10px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

/* ---- search results ---------------------------------------------------- */

.gr-results {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gr-result {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}

.gr-result:hover { background: var(--dsw-alias-bg-layer-1); }

.gr-result-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gr-result-kind {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

/* ---- shared bits -------------------------------------------------------- */

.gr-col { display: flex; flex-direction: column; gap: 4px; }
.gr-row { display: flex; align-items: center; gap: 6px; }
.gr-grow { flex: 1 1 auto; }
.gr-muted { color: var(--dsw-alias-label-secondary); }
.gr-mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.gr-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
