/**
 * The workbench's stylesheet fragment.
 *
 * Registered through `styles.js` rather than appended to its `CSS` literal, for
 * the same reason the dictionary is split: one literal with two authors is a
 * merge conflict on every edit, and the loser's block disappears silently.
 *
 * Same discipline as the shell sheet, checked by `dev/build-client.mjs`:
 *   - every selector starts with `cs-`;
 *   - no `:root`, `body`, `html`, `*`, `!important`, no bare element selector;
 *   - colours only `--dsw-alias-*` / `--dsw-specific-sidebar-fill`, derived with
 *     `color-mix` when a tint is needed — no literal colour values anywhere;
 *   - widths are measured in JS, never with `@container` (an unnamed container
 *     query matches whatever box happens to be nearest).
 */

import { registerStyles } from './styles.js';

const CHAT_CSS = `
/* ---------------------------------------------------------------- *
 * Workbench shell                                                  *
 * ---------------------------------------------------------------- */
.cs-wb {
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.cs-wb-bar {
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; min-height: 32px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cs-wb-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-wb-pane { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
/* A parked segment keeps its component mounted so the conversation's draft and
   its in-flight answer survive the switch; only its box goes away. */
.cs-wb-pane.cs-wb-hidden { display: none; }
.cs-wb-missing {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 24px 16px; text-align: center; flex: 1 1 auto;
  font-size: 11.5px; color: var(--dsw-alias-label-secondary);
}

/* ---------------------------------------------------------------- *
 * Left-sidebar entry and conversation composer bar                 *
 * ---------------------------------------------------------------- */
.cs-nav-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; color: currentColor;
}

/* The reference row sits immediately above the composer. It must read as part
   of the composer, not as another banner: one line, quiet, and only the range
   carries the brand tint. */
.cs-bar-wrap { padding: 0 2px; }
.cs-bar {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  padding: 2px 6px; font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
}
.cs-bar-ref {
  display: inline-flex; align-items: center; gap: 5px; min-width: 0;
  max-width: 60%; padding: 1px 4px; border: 0; border-radius: 4px;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.cs-bar .cs-bar-ref { flex: 0 1 auto; max-width: 46%; }
/* The right-hand actions are two compact pills; keeping them on one line is
   what stops 生成笔记 from wrapping to 生成笔/记 when a path is long. */
.cs-bar .cs-btn { flex: 0 0 auto; white-space: nowrap; }
.cs-bar-ref:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.cs-bar-ref:disabled { cursor: default; opacity: .72; }
.cs-bar.cs-bound .cs-bar-ref { color: var(--dsw-alias-brand-primary); }
.cs-bar-note { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 45%; }
.cs-bar-note.cs-ok { color: var(--dsw-alias-state-success-primary); }
.cs-bar-note.cs-warn { color: var(--dsw-alias-state-warn-primary); }
.cs-bar-note.cs-bad { color: var(--dsw-alias-state-error-primary); }

/* The context switch mirrors the desktop composer: a quiet outline when off,
   and a filled blue pill when the project's relationships are in play. */
.cs-btn.cs-ghost.cs-context {
  border-color: var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.cs-btn.cs-ghost.cs-context:hover {
  border-color: color-mix(in srgb, #2563eb 45%, var(--dsw-alias-border-l1));
  color: #2563eb;
}
.cs-btn.cs-ghost.cs-context.is-on {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.cs-btn.cs-ghost.cs-context.is-on:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #fff;
}
.cs-context[disabled] { opacity: .6; }

/* ---------------------------------------------------------------- *
 * CodeSlice workspace (main panel and conversation view)           *
 * ---------------------------------------------------------------- */
.cs-ws {
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.cs-ws-bar {
  display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
  padding: 6px 10px; min-height: 38px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cs-ws-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }
.cs-ws-tabs { display: inline-flex; align-items: center; gap: 2px; }
.cs-ws-tabs > button {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border: 1px solid transparent; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: 11.5px; cursor: pointer;
}
.cs-ws-tabs > button:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.cs-ws-tabs > button.cs-on {
  color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
.cs-ws-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-ws-split { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-ws-fill { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.cs-ws-code, .cs-ws-graph, .cs-ws-notes { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }

.cs-ws-files {
  display: flex; flex-direction: column; flex: 0 0 240px; min-width: 180px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-ws-files-head { display: flex; align-items: center; gap: 6px; padding: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.cs-ws-search { flex: 1 1 auto; min-width: 0; }
.cs-ws-file-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 3px; }
.cs-ws-file {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 3px 6px; border: 0; border-radius: 5px;
  background: transparent; color: inherit; font-size: 11px; text-align: left; cursor: pointer;
}
.cs-ws-file:hover { background: var(--dsw-alias-bg-layer-2); }
.cs-ws-file.cs-on { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }
.cs-ws-file > .cs-dim { margin-left: auto; font-size: 10px; }
.cs-ws-error {
  display: flex; align-items: center; gap: 5px; padding: 6px;
  font-size: 10.5px; color: var(--dsw-alias-state-error-primary);
}
.cs-ws-foot {
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  padding: 4px 8px; min-height: 30px; font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.cs-ws-settings { padding: 14px 16px; overflow: auto; }
.cs-ws-loading { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); }
.cs-ws-settings-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.cs-ws-settings-head b { font-size: 13px; }
.cs-ws-settings-head .cs-dim { font-size: 11px; }
.cs-ws-section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.cs-ws-section:last-child { border-bottom: 0; margin-bottom: 0; }
.cs-ws-prompt { min-height: 96px; resize: vertical; line-height: 1.5; }
.cs-ws-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 14px; }
.cs-ws-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
.cs-ws-field .cs-dim { font-size: 10px; }
.cs-ws-checks { display: flex; gap: 16px; margin-top: 14px; font-size: 11.5px; }
.cs-ws-check { display: inline-flex; align-items: center; gap: 6px; }
.cs-ws-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
.cs-ws-notice { margin-top: 12px; font-size: 11.5px; }
.cs-ws-notice.cs-ok { color: var(--dsw-alias-state-success-primary); }
.cs-ws-notice.cs-bad { color: var(--dsw-alias-state-error-primary); }

/* ---------------------------------------------------------------- *
 * Conversation                                                     *
 * ---------------------------------------------------------------- */
.cs-chat { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.cs-chat-bar {
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; min-height: 32px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-chat-heading {
  flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px;
}
.cs-chat-name {
  font-size: 11.5px; font-weight: 600; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-chat-sub {
  font-size: 10px; min-width: 0;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.cs-chat-scroll {
  display: flex; flex-direction: column; gap: 10px;
  flex: 1 1 auto; min-height: 0; min-width: 0;
  overflow: auto; overscroll-behavior: contain;
  padding: 10px 10px 14px;
}

.cs-chat-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; flex: 1 1 auto; padding: 22px 12px; text-align: center;
  color: var(--dsw-alias-label-secondary); font-size: 11.5px;
}
.cs-chat-empty b { color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; }
.cs-chat-empty p { margin: 0; max-width: 40ch; line-height: 1.6; }
.cs-chat-empty .cs-chat-spark { opacity: .55; }
.cs-chat-suggest {
  display: flex; flex-direction: column; gap: 5px; width: 100%; max-width: 420px;
  margin-top: 4px;
}
.cs-chat-suggest > button {
  display: flex; align-items: flex-start; gap: 6px; width: 100%;
  padding: 6px 9px; text-align: left; font: inherit; font-size: 11.5px; line-height: 1.5;
  cursor: pointer; color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
}
.cs-chat-suggest > button:hover {
  border-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
}
.cs-chat-suggest > button > span { flex: 0 0 auto; margin-top: 2px; color: var(--dsw-alias-label-secondary); }

/* ---- one message ------------------------------------------------- */
.cs-msg { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cs-msg-role {
  display: flex; align-items: center; gap: 4px;
  font-size: 9.5px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.cs-msg-role > span { display: flex; }
.cs-msg-body {
  padding: 6px 9px; border-radius: 8px; min-width: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  overflow-wrap: anywhere; font-size: 12px; line-height: 1.7;
}
.cs-msg.cs-user .cs-msg-body {
  white-space: pre-wrap;
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent);
}
.cs-msg.cs-assistant .cs-msg-body { background: transparent; }
.cs-msg.cs-assistant .cs-msg-body .cs-md { font-size: 12px; }
.cs-msg-failed {
  display: flex; align-items: flex-start; gap: 5px; padding: 5px 8px;
  border-radius: 6px; font-size: 11px; line-height: 1.55;
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
}
.cs-msg-failed > span { flex: 0 0 auto; display: flex; margin-top: 1px; }

.cs-chat-caret {
  display: inline-block; width: 2px; height: 12px; margin-left: 2px;
  vertical-align: -2px; background: var(--dsw-alias-brand-primary);
  animation: cs-chat-blink 1s step-end infinite;
}
@keyframes cs-chat-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cs-chat-caret { animation: none; } }

.cs-chat-cites {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding-top: 1px;
}
.cs-chat-actrow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }

.cs-chat-retrieval {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  font-size: 10px; color: var(--dsw-alias-label-secondary);
}
.cs-chat-retrieval > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- notices ------------------------------------------------------ */
.cs-chat-banner {
  display: flex; align-items: flex-start; gap: 6px; flex: 0 0 auto;
  padding: 5px 8px; font-size: 11px; line-height: 1.5;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-state-error-primary);
}
.cs-chat-banner.cs-ok { color: var(--dsw-alias-state-success-primary); }
.cs-chat-banner.cs-warn { color: var(--dsw-alias-state-warn-primary); }
.cs-chat-banner > span { flex: 1 1 auto; min-width: 0; }
.cs-chat-banner > svg { flex: 0 0 auto; margin-top: 1px; }

/* ---- composer ----------------------------------------------------- */
.cs-chat-composer {
  display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto;
  padding: 6px 8px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-chat-hint {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-chat-hint.cs-bound { color: var(--dsw-alias-brand-primary); }
.cs-chat-inputrow { display: flex; align-items: flex-end; gap: 5px; }
.cs-chat-input {
  flex: 1 1 auto; min-width: 0; min-height: 34px; max-height: 180px;
  padding: 6px 8px; resize: none; font: inherit; font-size: 12px; line-height: 1.55;
  color: inherit; background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
}
.cs-chat-input::placeholder { color: var(--dsw-alias-label-secondary); }
.cs-chat-input:focus {
  outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px;
  border-color: transparent;
}
.cs-chat-input[disabled] { opacity: .6; }
.cs-chat-keyhint {
  display: flex; align-items: center; gap: 4px;
  font-size: 9.5px; color: var(--dsw-alias-label-secondary);
}
.cs-chat-key {
  padding: 0 4px; border-radius: 3px; font-size: 9px; line-height: 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.cs-chat-stop {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
}

/* ---------------------------------------------------------------- *
 * Code pane                                                        *
 * ---------------------------------------------------------------- */
.cs-code { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.cs-code-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 0 0 auto;
  padding: 5px 8px; min-height: 32px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-code-path {
  flex: 1 1 auto; min-width: 0; font-size: 11px;
  direction: rtl; text-align: left;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* The CodeMirror host. CodeMirror owns the scroller and the theme; this box
   only decides how much room the reader gets. */
.cs-code-editor {
  flex: 1 1 auto; min-height: 0; min-width: 0; position: relative; overflow: hidden;
}
.cs-code-editor .cm-editor { height: 100%; }
.cs-code-editor .cm-scroller { overscroll-behavior: contain; }
.cs-code-loading {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 11.5px; color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, transparent);
}

/* the floating action bar under a selection */
.cs-code-sel {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap; flex: 0 0 auto;
  padding: 5px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1));
}
.cs-code-sel-label {
  flex: 1 1 auto; min-width: 0; font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-code-sel-label b { color: var(--dsw-alias-brand-primary); font-weight: 600; }

.cs-code-noteform {
  display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto;
  padding: 6px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.cs-code-noteform .cs-row { gap: 4px; }

.cs-code-hint {
  display: flex; align-items: center; gap: 5px; flex: 0 0 auto;
  padding: 3px 8px; font-size: 10px;
  color: var(--dsw-alias-label-secondary);
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.cs-code-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; flex: 1 1 auto; padding: 26px 18px; text-align: center;
  color: var(--dsw-alias-label-secondary); font-size: 11.5px;
}
.cs-code-empty b { color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; }
.cs-code-empty p { margin: 0; max-width: 42ch; line-height: 1.6; }
`;

registerStyles(CHAT_CSS);
