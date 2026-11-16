/**
 * The panel's whole stylesheet, as one string.
 *
 * Rules that came from hard experience with a host page:
 *
 *   - Every selector starts with `cs-`. The host owns `button`, `input`, `a`,
 *     `code`, `::selection` and every scrollbar (`spec §10.5`); a bare element
 *     selector would restyle the conversation, not the panel.
 *   - No `:root`, no `body`, no `!important`, no scrollbar rules. Those are the
 *     four documented ways a panel leaks into its host.
 *   - No `@container` without a name: `note.css` shipped three unscoped ones
 *     (`spec §10.2`) that match whatever container happens to be nearest.
 *     Narrow/wide is measured in JS from the panel's own box instead, which is
 *     also what the interaction spec asks for.
 *   - Colours are only `--dsw-alias-*` / `--dsw-specific-sidebar-fill`, derived
 *     further with `color-mix` where a tint is needed. Sizes, spacing, radii and
 *     font sizes are plain values: the host declares no tokens for them.
 */

export const CSS = `
/* ---------------------------------------------------------------- *
 * Shell                                                            *
 * ---------------------------------------------------------------- */
.cs-root {
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
  box-sizing: border-box;
  font-family: inherit; font-size: 12px; line-height: 1.45;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
}
.cs-root *, .cs-root *::before, .cs-root *::after { box-sizing: border-box; }

.cs-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.cs-col { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.cs-grow { flex: 1 1 auto; min-width: 0; }
.cs-noshrink { flex: 0 0 auto; }
.cs-wrap { flex-wrap: wrap; }
.cs-mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
.cs-muted { color: var(--dsw-alias-label-secondary); }
.cs-dim { opacity: .62; }
.cs-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-tabular { font-variant-numeric: tabular-nums; }
.cs-hidden { display: none; }
.cs-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ---------------------------------------------------------------- *
 * Bars, buttons, inputs                                            *
 * ---------------------------------------------------------------- */
.cs-bar {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  flex: 0 0 auto; min-height: 34px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cs-bar.cs-flat { border-bottom: none; }
.cs-bar.cs-sub { min-height: 28px; padding: 4px 8px; background: var(--dsw-alias-bg-layer-1); }

.cs-iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; flex: 0 0 auto;
  border: 1px solid transparent; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary); font: inherit;
}
.cs-iconbtn:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.cs-iconbtn:active { background: var(--dsw-alias-bg-layer-2); }
.cs-iconbtn[disabled] { opacity: .42; cursor: default; background: transparent; }
.cs-iconbtn.cs-on { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-border-l2); }
.cs-iconbtn.cs-danger:hover { color: var(--dsw-alias-state-error-primary); }

.cs-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; line-height: 1.4; font: inherit; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
}
.cs-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.cs-btn[disabled] { opacity: .5; cursor: default; }
.cs-btn.cs-primary {
  border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.cs-btn.cs-primary:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.cs-btn.cs-small { padding: 1px 6px; font-size: 11px; }
.cs-btn.cs-on {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.cs-btn.cs-ghost {
  border-color: transparent; background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.cs-btn.cs-ghost:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }

.cs-iconbtn:focus-visible,
.cs-btn:focus-visible,
.cs-chip:focus-visible,
.cs-item:focus-visible,
.cs-input:focus-visible,
.cs-tab:focus-visible,
.cs-node:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
}

.cs-input {
  flex: 1 1 auto; min-width: 0;
  padding: 4px 8px; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
}
.cs-input::placeholder { color: var(--dsw-alias-label-secondary); }
.cs-input:focus {
  outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px;
  border-color: transparent;
}
.cs-input.cs-mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
.cs-textarea {
  width: 100%; min-height: 84px; resize: vertical;
  padding: 6px 8px; font: inherit; line-height: 1.6; color: inherit;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px; tab-size: 2;
}
.cs-textarea:focus { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.cs-select {
  font: inherit; color: inherit; padding: 2px 4px; max-width: 140px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px;
}

.cs-field { display: flex; flex-direction: column; gap: 3px; padding: 4px 8px; }
.cs-field > label {
  font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}

/* ---------------------------------------------------------------- *
 * Segmented control (graph scope)                                  *
 * ---------------------------------------------------------------- */
.cs-seg {
  display: inline-flex; flex: 0 0 auto; padding: 1px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
}
.cs-seg > button {
  font: inherit; font-size: 11px; padding: 2px 7px; cursor: pointer;
  border: none; border-radius: 5px; background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.cs-seg > button.cs-on { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.cs-seg > button[disabled] { opacity: .4; cursor: default; }

/* ---------------------------------------------------------------- *
 * Chips, tags, dots, banners                                       *
 * ---------------------------------------------------------------- */
.cs-chip {
  display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto;
  height: 22px; padding: 0 8px; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 11px; line-height: 1;
  border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.cs-chip:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.cs-chip[aria-pressed='true'] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.cs-chip[aria-pressed='false'] { text-decoration: line-through; opacity: .6; }
.cs-chip .cs-swatch { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 auto; }

.cs-legend {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 4px 8px; flex: 0 0 auto;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.cs-legend-label {
  font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); margin-right: 2px;
}

.cs-tag {
  flex: 0 0 auto; padding: 0 5px; font-size: 9.5px; line-height: 15px;
  border-radius: 4px; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.cs-tag.cs-accent { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.cs-tag.cs-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.cs-tag.cs-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.cs-tag.cs-bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }

.cs-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-state-idle-primary); }
.cs-dot.cs-ok { background: var(--dsw-alias-state-success-primary); }
.cs-dot.cs-busy { background: var(--dsw-alias-state-warn-primary); }
.cs-dot.cs-bad { background: var(--dsw-alias-state-error-primary); }
.cs-dot.cs-brand { background: var(--dsw-alias-brand-primary); }

.cs-banner {
  display: flex; align-items: flex-start; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; font-size: 11px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-state-error-primary);
}
.cs-banner.cs-warn { color: var(--dsw-alias-state-warn-primary); }
.cs-banner .cs-grow { color: var(--dsw-alias-label-secondary); }

.cs-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 22px 16px; text-align: center; height: 100%;
  color: var(--dsw-alias-label-secondary); font-size: 11.5px;
}
.cs-empty b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.cs-empty p { margin: 0; max-width: 42ch; }
.cs-empty svg { opacity: .5; }

/* ---------------------------------------------------------------- *
 * Graph layout: canvas + rail                                      *
 * ---------------------------------------------------------------- */
.cs-graph { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-graph-body {
  display: flex; flex: 1 1 auto; min-height: 0; min-width: 0;
  flex-direction: row;
}
.cs-graph-body.cs-narrow { flex-direction: column; }
.cs-graph-stage {
  position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}
.cs-graph-body.cs-narrow .cs-graph-stage { min-height: 140px; }
.cs-rail {
  flex: 0 0 300px; display: flex; flex-direction: column; min-height: 0; min-width: 0;
  border-left: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-specific-sidebar-fill);
}
.cs-graph-body.cs-narrow .cs-rail {
  flex: 0 0 auto; max-height: 52%; border-left: none;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.cs-rail-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.cs-rail-foot {
  flex: 0 0 auto; padding: 5px 8px; font-size: 10px; line-height: 1.5;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
}

.cs-search { position: relative; display: flex; align-items: center; flex: 1 1 auto; min-width: 0; }
.cs-search .cs-input { padding-left: 26px; padding-right: 26px; }
.cs-search-glyph {
  position: absolute; left: 7px; top: 50%; transform: translateY(-50%);
  display: flex; color: var(--dsw-alias-label-secondary); pointer-events: none;
}
.cs-search-clear {
  position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; border: none; border-radius: 4px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.cs-search-clear:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

.cs-section-head {
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.cs-item {
  display: flex; align-items: baseline; gap: 6px; width: 100%;
  padding: 3px 8px; min-height: 24px;
  border: none; background: transparent; cursor: pointer;
  text-align: left; font: inherit; color: inherit; min-width: 0;
}
.cs-item:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-item.cs-active { background: var(--dsw-alias-bg-layer-2); }
.cs-item .cs-name { font-weight: 600; flex: 0 1 auto; min-width: 0; }
.cs-item .cs-where {
  flex: 1 1 auto; min-width: 0; font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
  direction: rtl; text-align: left;
}
.cs-item .cs-meta { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

/* ---------------------------------------------------------------- *
 * Inspector                                                        *
 * ---------------------------------------------------------------- */
.cs-detail { display: flex; flex-direction: column; min-height: 0; }
.cs-detail-head { display: flex; align-items: flex-start; gap: 6px; padding: 8px; }
.cs-detail-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.cs-detail-title h2 {
  margin: 0; font-size: 13px; font-weight: 600; line-height: 1.3;
  overflow-wrap: anywhere; color: var(--dsw-alias-label-primary);
}
.cs-detail-meta { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.cs-detail-acts { display: flex; align-items: center; gap: 4px; padding: 0 8px 6px; flex-wrap: wrap; }

.cs-kind {
  display: inline-flex; align-items: center; height: 18px; padding: 0 6px;
  font-size: 10px; line-height: 1;
  border-radius: 4px; color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
}
.cs-kind.cs-k-class { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.cs-kind.cs-k-rationale { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); }
.cs-kind.cs-k-external { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }

.cs-rationale {
  margin: 0 8px 6px; padding: 6px 8px; font-size: 11px; line-height: 1.6;
  border-left: 2px solid var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.cs-rationale.cs-quiet { color: var(--dsw-alias-label-secondary); border-left-color: var(--dsw-alias-border-l2); }

.cs-group { border-top: 1px solid var(--dsw-alias-border-l1); }
.cs-group > summary {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; min-height: 24px; cursor: pointer; list-style: none;
  font-size: 11px; color: var(--dsw-alias-label-secondary);
}
.cs-group > summary::-webkit-details-marker { display: none; }
.cs-group > summary:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.cs-group > summary .cs-grow { font-weight: 600; color: var(--dsw-alias-label-primary); }
.cs-group > summary .cs-count { font-size: 9.5px; font-variant-numeric: tabular-nums; }
.cs-group > summary .cs-twist { display: flex; transition: transform .12s ease; }
.cs-group[open] > summary .cs-twist { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .cs-group > summary .cs-twist { transition: none; } }
.cs-group-list { padding-bottom: 3px; }
.cs-group-more {
  padding: 3px 8px 5px; font-size: 10px; color: var(--dsw-alias-label-secondary);
}

.cs-rel {
  display: flex; align-items: baseline; gap: 5px; width: 100%;
  padding: 2px 8px 2px 18px; min-height: 22px;
  border: none; background: transparent; cursor: pointer; text-align: left;
  font: inherit; color: inherit; min-width: 0;
}
.cs-rel:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-rel .cs-dir { flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.cs-rel .cs-dir[data-dir='out'] { color: var(--dsw-alias-brand-primary); }
.cs-rel .cs-rel-label { flex: 0 1 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.cs-rel .cs-loc {
  flex: 0 1 auto; max-width: 96px; font-size: 9.5px; direction: rtl;
  color: var(--dsw-alias-label-secondary); overflow: hidden; white-space: nowrap;
}
.cs-rel .cs-open {
  flex: 0 0 auto; display: flex; opacity: 0; margin-left: auto;
  color: var(--dsw-alias-label-secondary);
}
.cs-rel:hover .cs-open, .cs-rel:focus-within .cs-open { opacity: 1; }

.cs-comm {
  display: flex; align-items: center; gap: 6px; padding: 2px 8px; min-height: 26px;
  font-size: 11px;
}
.cs-comm:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-comm input { accent-color: var(--dsw-alias-brand-primary); width: 12px; height: 12px; margin: 0; flex: 0 0 auto; }
.cs-comm .cs-swatch { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
.cs-comm .cs-grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-comm .cs-count { flex: 0 0 auto; font-size: 9.5px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
.cs-comm.cs-off .cs-grow, .cs-comm.cs-off .cs-count { opacity: .5; text-decoration: line-through; }

/* ---------------------------------------------------------------- *
 * Canvas                                                           *
 * ---------------------------------------------------------------- */
.cs-canvas {
  position: relative; flex: 1 1 auto; min-height: 0; min-width: 0;
  background: var(--dsw-alias-bg-base); overflow: hidden;
}
.cs-canvas svg { display: block; width: 100%; height: 100%; touch-action: none; }
.cs-canvas[data-settling='true'] { cursor: progress; }
.cs-canvas .vis-network { outline: none; }
.cs-canvas .vis-network canvas { display: block; }
.cs-canvas .vis-tooltip {
  position: absolute; z-index: 5; pointer-events: none; white-space: pre-wrap;
  max-width: 300px; padding: 5px 8px; border-radius: 6px; font-size: 11px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  color: var(--dsw-alias-label-primary);
}
.cs-edge { fill: none; }
.cs-edge.cs-structural { stroke: var(--dsw-alias-label-secondary); }
.cs-edge.cs-dim { opacity: .06; }
.cs-edge.cs-hi { stroke-width: 2.2; opacity: .95; }
.cs-node { cursor: pointer; outline: none; }
.cs-node .cs-node-body { stroke-width: 1.5; }
.cs-node .cs-node-ring { fill: none; stroke: var(--dsw-alias-label-primary); stroke-width: 1.6; }
.cs-node.cs-dim { transition: opacity .12s ease; }
.cs-node:hover .cs-node-body { stroke: var(--dsw-alias-label-primary); }
.cs-node-label {
  font-size: 12px; font-weight: 500; pointer-events: none; user-select: none;
  paint-order: stroke; stroke-linejoin: round;
  fill: var(--dsw-alias-label-primary);
  stroke: var(--dsw-alias-bg-base);
}
.cs-node-label.cs-halo {
  paint-order: stroke; stroke-linejoin: round;
  stroke: var(--dsw-alias-bg-base);
}

.cs-canvas-tools {
  position: absolute; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 3px;
  padding: 3px; border-radius: 7px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent);
  border: 1px solid var(--dsw-alias-border-l1);
  backdrop-filter: blur(6px);
}
.cs-canvas-tools .cs-iconbtn { width: 26px; height: 26px; }
.cs-canvas-hint {
  position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 56px);
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  pointer-events: none; user-select: none;
}
.cs-canvas-pill {
  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 5px;
  padding: 2px 9px; border-radius: 999px; font-size: 10.5px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, transparent);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  backdrop-filter: blur(6px); pointer-events: none;
}
.cs-canvas-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 16px; text-align: center; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary); pointer-events: none;
}
.cs-canvas-cap {
  position: absolute; top: 8px; right: 8px; max-width: 62%;
  padding: 2px 7px; border-radius: 5px; font-size: 10px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-state-warn-primary);
  pointer-events: none;
}

.cs-tip {
  position: absolute; z-index: 4; pointer-events: none;
  max-width: 240px; padding: 4px 7px; border-radius: 6px; font-size: 11px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  color: var(--dsw-alias-label-primary); white-space: pre-wrap;
}
.cs-tip .cs-mono { display: block; font-size: 10px; color: var(--dsw-alias-label-secondary); }

.cs-spin { animation: cs-spin 1s linear infinite; transform-origin: 50% 50%; }
@keyframes cs-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cs-spin { animation: none; } }

/* ---------------------------------------------------------------- *
 * Notes                                                            *
 * ---------------------------------------------------------------- */
.cs-notes { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; flex-direction: row; }
.cs-notes.cs-narrow { flex-direction: column; }
.cs-notes-list {
  flex: 0 0 240px; display: flex; flex-direction: column; min-height: 0; min-width: 0;
  border-right: 1px solid var(--dsw-alias-border-l1);
}
.cs-notes.cs-narrow .cs-notes-list {
  flex: 0 0 auto; max-height: 46%; border-right: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
/* One note open: the reader owns the panel, the list comes back via its back arrow. */
.cs-notes.cs-focus .cs-notes-list { display: none; }
.cs-notes.cs-focus .cs-notes-reader { flex: 1 1 auto; }
.cs-notes-reader { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; min-width: 0; }

/* One list row: checkbox for batch export + the row button itself. */
.cs-note-item { display: flex; align-items: center; gap: 2px; min-width: 0; }
.cs-note-item.cs-active { background: var(--dsw-alias-bg-layer-2); }
.cs-note-item .cs-note-row { flex: 1 1 auto; min-width: 0; }
.cs-note-item .cs-note-row.cs-active { background: transparent; }
.cs-note-check {
  flex: 0 0 auto; margin: 0 0 0 6px; width: 12px; height: 12px;
  accent-color: var(--dsw-alias-brand-primary, #2f6fed); cursor: pointer;
}

/* Batch-export toolbar, shown only while a selection exists. */
.cs-bulk {
  display: flex; align-items: center; gap: 6px; padding: 3px 8px;
  font-size: 10.5px; color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}

.cs-folder {
  display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 2px 8px; min-height: 24px;
  border: none; background: transparent; cursor: pointer; text-align: left;
  font: inherit; font-size: 11.5px; color: inherit; min-width: 0;
}
.cs-folder:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-folder.cs-active { background: var(--dsw-alias-bg-layer-2); }
.cs-folder .cs-twist {
  display: flex; flex: 0 0 auto; width: 14px; justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.cs-folder .cs-twist[data-open='true'] { transform: rotate(90deg); }
.cs-folder .cs-grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-folder .cs-count { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.cs-folder .cs-folder-acts { display: flex; gap: 0; opacity: 0; flex: 0 0 auto; }
.cs-folder:hover .cs-folder-acts, .cs-folder:focus-within .cs-folder-acts { opacity: 1; }
.cs-folder-acts .cs-iconbtn { width: 18px; height: 18px; }
/* Folder rows carry hover actions beside the button, so a folder can be renamed
   or deleted without opening it. */
.cs-folder-row { display: flex; align-items: center; min-width: 0; }
.cs-folder-row .cs-folder { flex: 1 1 auto; width: auto; min-width: 0; }
/* The chevron is its own hit target: folding is a deliberate act, not something
   a click on the folder name should do by accident. */
.cs-chev {
  flex: 0 0 auto; width: 14px; height: 22px; display: flex; align-items: center;
  justify-content: center; padding: 0; border: none; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.cs-chev svg { transition: transform 0.12s ease; }
.cs-chev[data-open='true'] svg { transform: rotate(90deg); }
.cs-chev:hover { color: var(--dsw-alias-label-primary); }
.cs-folder-row .cs-folder-acts { display: flex; gap: 0; flex: 0 0 auto; opacity: 0; }
.cs-folder-row:hover .cs-folder-acts,
.cs-folder-row:focus-within .cs-folder-acts { opacity: 1; }
.cs-folder-row.cs-renaming,
.cs-folder-row.cs-confirming { gap: 4px; padding: 2px 8px; min-height: 24px; }
.cs-folder-row.cs-renaming .cs-grow { min-width: 0; }
.cs-folder-row.cs-confirming .cs-grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Nested folders: a child row exists only while its parent is open, and the
   guide line makes the level readable at a glance — the same shape a file
   manager gives a folder tree. */
.cs-folder-tree { display: flex; flex-direction: column; min-height: 0; }
.cs-folder-node { display: flex; flex-direction: column; min-width: 0; }
.cs-folder-children {
  display: flex; flex-direction: column; min-width: 0;
  margin-left: 9px; border-left: 1px solid var(--dsw-alias-border-l1);
}

/* Right-click menu on a note row. */
.cs-menu {
  z-index: 40; min-width: 152px; padding: 4px;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.cs-menu-title {
  padding: 2px 8px 4px; font-size: 10.5px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-menu-item {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 5px 8px; border: none; border-radius: 4px; background: transparent;
  font: inherit; font-size: 11.5px; text-align: left; cursor: pointer; color: inherit;
}
.cs-menu-item:hover { background: var(--dsw-alias-bg-layer-1); }

/* Folder picker for 移动到. */
.cs-modal-backdrop {
  position: fixed; inset: 0; z-index: 50; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.18);
}
.cs-modal {
  width: min(320px, 86vw); max-height: 70vh; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18); overflow: hidden;
}
.cs-modal-head { padding: 10px 12px 6px; font-size: 12px; font-weight: 600; }
.cs-modal-list { padding: 0 6px 6px; overflow: auto; min-height: 0; }
.cs-modal-item {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 6px 10px; border: none; border-radius: 4px; background: transparent;
  font: inherit; font-size: 11.5px; text-align: left; cursor: pointer; color: inherit;
}
.cs-modal-item:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-modal-item.cs-active { background: var(--dsw-alias-bg-layer-2); }
.cs-modal-foot {
  display: flex; justify-content: flex-end; gap: 6px; padding: 8px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.cs-note-row {
  display: flex; align-items: flex-start; gap: 5px; width: 100%;
  padding: 4px 8px; border: none; background: transparent; cursor: pointer;
  text-align: left; font: inherit; color: inherit; min-width: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cs-note-row:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-note-row.cs-active { background: var(--dsw-alias-bg-layer-2); }
.cs-note-row .cs-note-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.cs-note-row .cs-note-title { font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-note-row .cs-note-excerpt {
  font-size: 10.5px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.cs-note-row .cs-note-time { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

.cs-reader-head {
  display: flex; flex-direction: column; gap: 3px;
  padding: 8px; flex: 0 0 auto;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-reader-head h2 { margin: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.cs-reader-acts { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding-top: 2px; }
.cs-reader-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 10px 12px 24px; }
.cs-reader-doc { max-width: 78ch; margin: 0 auto; }

/* ---------------------------------------------------------------- *
 * Markdown subset                                                  *
 * ---------------------------------------------------------------- */
.cs-md { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.cs-md > :first-child { margin-top: 0; }
.cs-md h3 { margin: 14px 0 6px; font-size: 13px; font-weight: 650; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 3px; }
.cs-md h4 { margin: 11px 0 4px; font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cs-md h5 { margin: 9px 0 3px; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); opacity: .8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cs-md p { margin: 0 0 8px; }
.cs-md ul, .cs-md ol { margin: 0 0 8px; padding-left: 20px; }
.cs-md li { margin: 1px 0; }
.cs-md code {
  padding: 1px 4px; border-radius: 4px; font-size: 11px;
  background: var(--dsw-alias-bg-layer-2);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
.cs-md .cs-md-code {
  margin: 0 0 10px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-md .cs-md-code-head {
  display: flex; align-items: center; gap: 6px; padding: 2px 8px;
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cs-md .cs-md-code pre { margin: 0; padding: 7px 9px; overflow: auto; }
.cs-md .cs-md-code code { background: none; padding: 0; font-size: 11px; line-height: 1.6; }
.cs-md blockquote {
  margin: 0 0 8px; padding: 2px 0 2px 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.cs-md hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 12px 0; }
.cs-md a { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.cs-md a:hover { text-decoration: underline; }
.cs-md .cs-md-table { width: 100%; border-collapse: collapse; margin: 0 0 10px; font-size: 11px; }
.cs-md .cs-md-table th, .cs-md .cs-md-table td {
  border: 1px solid var(--dsw-alias-border-l1); padding: 3px 6px; text-align: left;
}
.cs-md .cs-md-table th { background: var(--dsw-alias-bg-layer-1); font-weight: 600; }

.cs-cite {
  display: inline-flex; align-items: center; gap: 3px; vertical-align: baseline;
  max-width: min(100%, 360px);
  padding: 0 5px; margin: 0 1px; height: 18px;
  border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 10px; line-height: 1;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-cite:hover {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
.cs-cite .cs-cite-sym {
  padding-left: 5px; margin-left: 1px; max-width: 46%;
  border-left: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---------------------------------------------------------------- *
 * Outline                                                          *
 * ---------------------------------------------------------------- */
.cs-outline { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; }
.cs-sym-row {
  display: flex; align-items: baseline; gap: 6px; width: 100%;
  padding: 2px 8px; min-height: 23px;
  border: none; background: transparent; cursor: pointer; text-align: left;
  font: inherit; color: inherit; min-width: 0;
}
.cs-sym-row:hover { background: var(--dsw-alias-bg-layer-1); }
.cs-sym-row .cs-sym-name { font-weight: 600; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-sym-row .cs-sym-sig {
  flex: 1 1 auto; min-width: 0; font-size: 10px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
.cs-sym-row .cs-sym-line { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

.cs-import-row {
  display: flex; align-items: baseline; gap: 6px; padding: 2px 8px; min-height: 21px;
  font-size: 11px; min-width: 0;
}
.cs-import-row .cs-imp-name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
.cs-import-row .cs-imp-line { flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }

/* ---------------------------------------------------------------- *
 * Annotated viewer                                                 *
 * ---------------------------------------------------------------- */
.cs-av { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base); }
.cs-av-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 5px 8px; flex: 0 0 auto; min-height: 32px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-av-path {
  flex: 1 1 auto; min-width: 0; font-size: 11px; direction: rtl; text-align: left;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
.cs-av-scroll {
  flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain;
  padding: 8px 0 32px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px; line-height: 21px;
}
.cs-av-line { display: flex; align-items: flex-start; min-height: 21px; }
.cs-av-gutter {
  flex: 0 0 auto; width: 46px; padding: 0 6px 0 0; text-align: right;
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  user-select: none; cursor: pointer; font-variant-numeric: tabular-nums;
}
.cs-av-gutter:hover { color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); }
.cs-av-text { flex: 1 1 auto; min-width: 0; white-space: pre; padding-right: 12px; }
.cs-av-line.cs-picked { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.cs-av-line.cs-picked .cs-av-gutter { color: var(--dsw-alias-brand-primary); }
.cs-av-line.cs-annotated { border-left: 2px solid var(--dsw-alias-state-success-primary); }
.cs-av-line.cs-flash { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.cs-av-note {
  display: flex; align-items: flex-start; gap: 6px;
  margin: 2px 12px 6px 46px; padding: 5px 7px; border-radius: 5px;
  font-family: inherit; font-size: 11px; line-height: 1.55;
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
  border-left: 2px solid var(--dsw-alias-state-success-primary);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.cs-av-note .cs-grow { color: var(--dsw-alias-label-primary); }
.cs-av-note b { display: block; font-size: 10.5px; font-weight: 600; }
.cs-av-form { margin: 4px 12px 10px 46px; display: flex; flex-direction: column; gap: 4px; }
.cs-av-form .cs-row { gap: 4px; }
.cs-av-large {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 32px 20px; text-align: center; height: 100%;
  color: var(--dsw-alias-label-secondary); font-size: 12px;
}
.cs-av-large b { color: var(--dsw-alias-label-primary); font-size: 13px; }
.cs-av-large p { margin: 0; max-width: 46ch; }

/* ---------------------------------------------------------------- *
 * Composer chip                                                    *
 * ---------------------------------------------------------------- */
.cs-chip-wrap { display: flex; align-items: center; justify-content: flex-end; padding: 2px 10px 0; gap: 6px; }
.cs-chip-wrap .cs-chip { max-width: min(100%, 360px); }
.cs-chip-wrap .cs-chip-copy { color: var(--dsw-alias-label-secondary); }
`;

/** The `data-codeslice` value on the injected `<style>` element. */
export const STYLE_MARKER = 'core';

/**
 * Stylesheet fragments contributed by the workbench's own modules.
 *
 * The panel's CSS is one template literal above, which means two authors adding
 * rules to it in parallel would conflict on every edit and one of them would lose
 * their block. Each feature module therefore owns a fragment and registers it
 * here at load time; `index.js` injects them after the base sheet, which is what
 * gives a feature the last word on a selector it shares with the shell.
 *
 * Fragments follow the same discipline as the base sheet and are checked by
 * `dev/audit-checks.mjs`: every selector starts with `cs-`, no `:root`, no
 * `body`, no `!important`, and colours come only from `--dsw-*` tokens.
 */
const FRAGMENTS = [];

/**
 * Register one CSS fragment.
 * @param css - the fragment's rules.
 * @returns a disposer, so a module reloaded in place cannot double its rules.
 */
export function registerStyles(css) {
  if (typeof css !== 'string' || css.trim() === '') return () => {};
  FRAGMENTS.push(css);
  return () => {
    const index = FRAGMENTS.indexOf(css);
    if (index >= 0) FRAGMENTS.splice(index, 1);
  };
}

/**
 * The complete sheet: the base rules, then every registered fragment in
 * registration order.
 * @returns the CSS text to inject.
 */
export function fullCss() {
  return FRAGMENTS.length === 0 ? CSS : `${CSS}\n${FRAGMENTS.join('\n')}`;
}
