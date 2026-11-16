/**
 * CodeMirror 6 editor chunk.
 *
 * Built separately from the plugin bundle (`dev/build-editor.mjs`) and fetched
 * only when a file is first opened. The plugin's React tree stays outside: this
 * chunk exposes an imperative `create(container, options)` handle, so CodeMirror
 * (which owns its DOM and its own rendering loop) never needs to be wrapped in
 * another React root.
 *
 * The surface is deliberately the reader's, not an IDE's:
 *   - read-only document, syntax highlighted, line numbers, wrapping;
 *   - line numbers are a picker (click start, click end) and text drags report
 *     the same line span, so "ask about this" works with either gesture;
 *   - line decorations carry symbols, annotations, notes, the current pick and
 *     a one-shot reveal;
 *   - the theme resolves through the host's CSS tokens, so light and dark need
 *     no second palette and no re-mount.
 *
 * The look follows the CodeMirror stack the right-side DSH editor uses
 * (`dsh-better-sidebar`'s `TextEditor`), reduced to the read-only features this
 * pane actually offers.
 */
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration, EditorView, crosshairCursor, drawSelection, dropCursor,
  highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  keymap, lineNumbers, rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  HighlightStyle, bracketMatching, defaultHighlightStyle, indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { xml } from '@codemirror/lang-xml';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { sql } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import { yaml } from '@codemirror/lang-yaml';
import { vue } from '@codemirror/lang-vue';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';

/* ------------------------------------------------------------------ *
 * Language selection                                                 *
 * ------------------------------------------------------------------ */

/**
 * One extension per Host language id (`lib/notes.js:languageFor`).
 *
 * A file with an unknown extension gets no parser: plain text in the same
 * theme, never an error or an empty editor.
 * @param id - the Host's language id.
 * @returns the language extension, or `[]`.
 */
function languageOf(id) {
  switch (String(id ?? '')) {
    case 'javascript': return javascript({ jsx: true });
    case 'jsx': return javascript({ jsx: true });
    case 'typescript': return javascript({ typescript: true });
    case 'tsx': return javascript({ typescript: true, jsx: true });
    case 'python': return python();
    case 'json': return json();
    case 'markdown': return markdown();
    case 'html': return html();
    case 'css': return css();
    case 'xml': return xml();
    case 'java': return java();
    case 'c':
    case 'cpp': return cpp();
    case 'rust': return rust();
    case 'go': return go();
    case 'sql': return sql();
    case 'php': return php();
    case 'yaml': return yaml();
    case 'vue': return vue();
    case 'bash':
    case 'sh':
    case 'shell': return StreamLanguage.define(shell);
    case 'toml': return StreamLanguage.define(toml);
    case 'csharp': return StreamLanguage.define(csharp);
    default: return [];
  }
}

/* ------------------------------------------------------------------ *
 * Theme                                                              *
 * ------------------------------------------------------------------ */

/** Syntax ink mapped onto the host's semantic tokens. */
const codesliceHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--dsw-alias-brand-primary)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--dsw-alias-state-success-primary)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--dsw-alias-state-warn-primary)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--dsw-alias-state-info-primary, var(--dsw-alias-brand-primary))' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--dsw-alias-label-primary)', fontWeight: '600' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--dsw-alias-label-primary)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--dsw-alias-label-secondary)' },
  { tag: [tags.tagName, tags.heading], color: 'var(--dsw-alias-brand-primary)', fontWeight: '600' },
  { tag: tags.link, color: 'var(--dsw-alias-brand-primary)', textDecoration: 'underline' },
  { tag: tags.invalid, color: 'var(--dsw-alias-state-error-primary)' },
]);

const codesliceTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, "Liberation Mono", monospace',
    lineHeight: '1.55',
    overflow: 'auto',
  },
  '.cm-content': { padding: '6px 0', caretColor: 'var(--dsw-alias-brand-primary)' },
  '.cm-line': { padding: '0 12px 0 8px' },
  '.cm-gutters': {
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-secondary)',
    borderRight: '1px solid var(--dsw-alias-border-l1)',
    userSelect: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 10px 0 10px',
    cursor: 'pointer',
    minWidth: '2.6em',
  },
  '.cm-lineNumbers .cm-gutterElement:hover': {
    color: 'var(--dsw-alias-label-primary)',
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent)' },
  '&.cm-focused .cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dsw-alias-brand-primary)' },
  '.cm-panels': {
    backgroundColor: 'var(--dsw-alias-bg-overlay)',
    color: 'var(--dsw-alias-label-primary)',
    borderColor: 'var(--dsw-alias-border-l1)',
  },
  '.cm-panels input': {
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 28%, transparent)' },
  '.cm-line.cs-cm-symbol': {
    boxShadow: 'inset 2px 0 0 var(--dsw-alias-brand-primary)',
  },
  '.cm-line.cs-cm-annotation': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent)',
  },
  '.cm-line.cs-cm-note': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent)',
  },
  '.cm-line.cs-cm-pick': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
  },
  '.cm-line.cs-cm-flash': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 22%, transparent)',
  },
  '.cm-line.cs-cm-frame': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent)',
    borderLeft: '2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)',
  },
  '.cm-line.cs-cm-frame-top': {
    borderTop: '2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent)',
    borderTopLeftRadius: '3px',
    borderTopRightRadius: '3px',
  },
  '.cm-line.cs-cm-frame-bottom': {
    borderBottom: '2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent)',
    borderBottomLeftRadius: '3px',
    borderBottomRightRadius: '3px',
  },
  '.cm-line.cs-cm-frame-moved': {
    borderLeft: '2px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent)',
  },
  '.cm-line.cs-cm-frame-missing': {
    backgroundColor: 'transparent',
    opacity: '.45',
  },
}, { dark: false });

/* ------------------------------------------------------------------ *
 * Line decorations                                                   *
 * ------------------------------------------------------------------ */

const setLineDecorations = StateEffect.define();

/** One combined class per line, so overlapping ranges do not stack N nodes. */
function buildLineDecorations(doc, startLine, spec) {
  const byLine = new Map();
  const add = (fileLine, className) => {
    const lineNumber = Number(fileLine);
    if (!Number.isFinite(lineNumber)) return;
    const index = Math.trunc(lineNumber) - startLine + 1;
    if (index < 1 || index > doc.lines) return;
    const current = byLine.get(index);
    byLine.set(index, current === undefined ? className : `${current} ${className}`);
  };
  for (const row of Array.isArray(spec?.symbols) ? spec.symbols : []) add(row.line ?? row.startLine, 'cs-cm-symbol');
  for (const row of Array.isArray(spec?.annotations) ? spec.annotations : []) {
    for (let line = Number(row.startLine); line <= Number(row.endLine ?? row.startLine); line += 1) add(line, 'cs-cm-annotation');
  }
  for (const row of Array.isArray(spec?.notes) ? spec.notes : []) {
    for (let line = Number(row.startLine); line <= Number(row.endLine ?? row.startLine); line += 1) add(line, 'cs-cm-note');
  }
  // Registered conversation frames: a tinted range with a 2px top border on
  // the first line and a 2px bottom border on the last. `missing` ranges dim
  // out; `moved` ranges take the warn rail.
  for (const row of Array.isArray(spec?.frames) ? spec.frames : []) {
    const first = Number(row.startLine);
    const last = Number(row.endLine ?? row.startLine);
    if (!Number.isFinite(first)) continue;
    const missing = row.status === 'missing';
    const moved = row.status === 'moved';
    const bodyClass = missing ? 'cs-cm-frame-missing' : 'cs-cm-frame';
    add(first, missing ? bodyClass : 'cs-cm-frame-top');
    for (let line = first; line <= last; line += 1) {
      add(line, bodyClass);
      if (moved) add(line, 'cs-cm-frame-moved');
    }
    add(last, missing ? bodyClass : 'cs-cm-frame-bottom');
  }
  if (spec?.pick !== null && spec?.pick !== undefined) {
    for (let line = Number(spec.pick.startLine); line <= Number(spec.pick.endLine ?? spec.pick.startLine); line += 1) add(line, 'cs-cm-pick');
  }
  if (spec?.flash !== null && spec?.flash !== undefined) add(spec.flash, 'cs-cm-flash');

  const builder = new RangeSetBuilder();
  for (const index of [...byLine.keys()].sort((a, b) => a - b)) {
    const line = doc.line(index);
    builder.add(line.from, line.from, Decoration.line({ class: byLine.get(index) }));
  }
  return builder.finish();
}

const lineDecorationField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = transaction.docChanged ? decorations.map(transaction.changes) : decorations;
    for (const effect of transaction.effects) {
      if (effect.is(setLineDecorations)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/* ------------------------------------------------------------------ *
 * Editor handle                                                      *
 * ------------------------------------------------------------------ */

/**
 * Build one editor.
 * @param container - the element CodeMirror mounts into.
 * @param options - `{doc, startLine, language, decorations, onSelection, onGutterPick}`.
 * @returns the imperative handle the React pane uses.
 */
function create(container, options = {}) {
  const language = new Compartment();
  let startLine = Number.isFinite(Number(options.startLine)) ? Math.max(1, Math.trunc(Number(options.startLine))) : 1;
  let decorations = options.decorations ?? {};
  let view;

  const fileLineOf = (docLine) => docLine + startLine - 1;
  const docLineOf = (fileLine) => Math.trunc(Number(fileLine)) - startLine + 1;

  const reportSelection = (state) => {
    if (typeof options.onSelection !== 'function') return;
    const range = state.selection.main;
    if (range.empty) {
      options.onSelection(null);
      return;
    }
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    options.onSelection({ startLine: fileLineOf(from), endLine: fileLineOf(to) });
  };

  const makeState = () => EditorState.create({
    doc: String(options.doc ?? ''),
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorState.tabSize.of(2),
      lineNumbers({
        // The document is a window into the file, so the gutter must speak file
        // line numbers. A reader who asks "what is on line 1261" must see 1261,
        // not the window-relative 41.
        formatNumber: (lineNumber) => String(lineNumber + startLine - 1),
      }),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(false),
      indentOnInput(),
      bracketMatching(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap]),
      syntaxHighlighting(codesliceHighlight),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      language.of(languageOf(options.language)),
      lineDecorationField,
      EditorView.lineWrapping,
      codesliceTheme,
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) reportSelection(update.state);
      }),
    ],
  });

  view = new EditorView({ parent: container, state: makeState() });

  // Gutters live OUTSIDE CodeMirror's content DOM, so `EditorView.domEventHandlers`
  // never sees them. Bind on the editor root instead; the gutter's text is the
  // file line number (`formatNumber`), which is what the picker reports.
  const onGutterMouse = (event) => {
    if (event.button !== 0) return;
    if (typeof event.target?.closest !== 'function' || event.target.closest('.cm-gutters') === null) return;
    if (typeof options.onGutterPick !== 'function') return;
    const gutter = event.target.closest('.cm-gutterElement');
    const label = gutter === null ? NaN : Number(String(gutter.textContent).replace(/[^\d]/gu, ''));
    if (!Number.isFinite(label) || label <= 0) return;
    event.preventDefault();
    options.onGutterPick(label);
  };
  view.dom.addEventListener('mousedown', onGutterMouse);

  view.dispatch({ effects: setLineDecorations.of(buildLineDecorations(view.state.doc, startLine, decorations)) });

  return {
    setDoc(text, firstLine) {
      startLine = Number.isFinite(Number(firstLine)) ? Math.max(1, Math.trunc(Number(firstLine))) : 1;
      view.setState(makeState());
      view.dispatch({ effects: setLineDecorations.of(buildLineDecorations(view.state.doc, startLine, decorations)) });
    },
    setLanguage(id) {
      view.dispatch({ effects: language.reconfigure(languageOf(id)) });
    },
    setDecorations(next) {
      decorations = next ?? {};
      view.dispatch({ effects: setLineDecorations.of(buildLineDecorations(view.state.doc, startLine, decorations)) });
    },
    setSelection(start, end) {
      const from = docLineOf(start);
      const to = docLineOf(end ?? start);
      if (from < 1 || from > view.state.doc.lines) return;
      const anchor = view.state.doc.line(from).from;
      const head = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, to))).to;
      view.dispatch({ selection: { anchor, head }, scrollIntoView: false });
    },
    clearSelection() {
      const head = view.state.selection.main.head;
      view.dispatch({ selection: { anchor: head } });
    },
    scrollToLine(fileLine) {
      const index = docLineOf(fileLine);
      if (index < 1 || index > view.state.doc.lines) return;
      const line = view.state.doc.line(index);
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 8 }) });
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.dom.removeEventListener('mousedown', onGutterMouse);
      view.destroy();
    },
  };
}

globalThis.__codesliceEditor = globalThis.__codesliceEditor || {};
globalThis.__codesliceEditor.create = create;
