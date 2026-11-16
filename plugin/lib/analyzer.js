/**
 * Pass 1 — one source file becomes nodes, structural edges and *unresolved*
 * facts.
 *
 * The original (`backend/app/graph/ast/engine.py`) walks a tree-sitter tree.
 * There is no parser in this process, so the walk becomes a set of line- and
 * token-anchored regular expressions applied to a **masked** copy of the source:
 * every comment and every string body is replaced by spaces of equal length, so
 * a match offset still maps to the exact line and column of the original text.
 * Two masks are produced, because they answer different questions:
 *
 *   `code`      comments *and* strings blanked — declarations, calls, JSX, braces.
 *   `lit`       comments blanked, strings kept — import specifiers live in strings.
 *
 * A third, private mask (`opaque`) records which characters belong to a string or
 * a regex literal. File-wide import scanning needs it: a docstring or a template
 * literal may contain a line that *looks* like an import statement, and the
 * original never saw one because it only scanned real statement nodes.
 *
 * What this scanner deliberately does **not** do, exactly as in the Python:
 *
 * - JavaScript/TypeScript get no docstring rationale (there is no
 *   "first statement is a string" convention), so JSDoc is not invented — it
 *   would change node counts versus a Python build (`spec §15.2`).
 * - Go / Rust / Java / C / C++ emit **no** `raw_imports`. The original configures
 *   `import_parser = None` for them and consumes the statement, which is also why
 *   they stay out of the resolver's `_GATED_LANGUAGES` (§4.2, §15.2).
 * - Java emits no inheritance facts: its config has no `superclass_field`, so
 *   `class X extends Y` yields nothing (§15.2 — reproduced, not "fixed").
 *
 * The one deliberate deviation is JS/TS inheritance, which the original silently
 * drops because `_JS_COMMON` sets `superclass_field=None` (§4.2.1). It is enabled
 * by `options.superclassJs !== false`; see {@link scanSource}.
 */

import {
  CONF_EXTRACTED,
  FILE_HEADER_LINES,
  KIND_CLASS,
  KIND_FILE,
  KIND_FUNCTION,
  MAX_RATIONALE_CHARS,
  RATIONALE_MARKERS,
  REL_CONTAINS,
  REL_METHOD,
  REL_RATIONALE_FOR,
  makeDeclarationNode,
  makeEdge,
  makeFileNode,
  makeRationaleNode,
  signatureOf,
} from './model.js';

/* ------------------------------------------------------------------ *
 * Language table                                                     *
 * ------------------------------------------------------------------ */

/**
 * Lower-case extension (no dot) → scanner dialect.
 *
 * Modelled on `graph/ast/languages.py:318-349`. `.mts/.cts` are present because
 * the graph knew about them even though the retrieval index calls them `text`.
 * The entries past `cpp` (`csharp`, `kotlin`, `ruby`, `php`, `swift`, `scala`)
 * extend the original and are served by the generic brace/end scanners below.
 */
export const LANGUAGE_BY_EXT = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyi: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  scala: 'scala',
};

/** Extensions worth opening, derived from {@link LANGUAGE_BY_EXT}. */
export const CODE_EXTENSIONS = Object.keys(LANGUAGE_BY_EXT);

/** Languages spoken with `#` comments rather than `//`. */
const HASH_COMMENT = new Set(['python', 'ruby']);

/**
 * Languages whose block comments nest, so an inner open-comment token must
 * increment the depth rather than be read as content.
 */
const NESTED_COMMENT = new Set(['rust', 'kotlin', 'scala', 'swift']);

/** Languages that configure an accessor (`a.b`) in the original (§4.2). */
const ACCESSOR_LANGUAGES = new Set(['python', 'javascript', 'typescript']);

/** Languages whose imports the original actually parses (§3.11). */
const IMPORT_LANGUAGES = new Set(['python', 'javascript', 'typescript']);

/** Identifiers that can never be a call. */
const CALL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typedef',
  'typeof', 'instanceof', 'delete', 'void', 'in', 'of', 'do', 'else', 'case',
  'throw', 'await', 'yield', 'super', 'this', 'class', 'const', 'let', 'var',
  'import', 'export', 'default', 'extends', 'implements', 'interface', 'type',
  'enum', 'namespace', 'declare', 'abstract', 'async', 'static', 'get', 'set',
  'public', 'private', 'protected', 'readonly', 'override', 'with', 'debugger',
  'constructor', 'struct', 'union', 'record', 'trait', 'impl', 'fn', 'func',
  'def', 'lambda', 'match', 'when', 'elif', 'except', 'finally', 'try', 'raise',
  'assert', 'del', 'global', 'nonlocal', 'pass', 'break', 'continue', 'print',
  'new', 'sizeof', 'alignof', 'synchronized', 'native', 'sealed', 'satisfies',
]);

/** Words that, immediately before `name(`, prove the name is being *declared*. */
const DECLARATION_PREFIXES = new Set([
  'function', 'def', 'fn', 'func', 'class', 'interface', 'enum', 'struct',
  'trait', 'impl', 'type', 'namespace', 'record', 'union', 'module', 'operator',
  'fun', 'sub', 'proc',
]);

/** Keywords after which a `/` starts a regular-expression literal. */
const REGEX_PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

/* ------------------------------------------------------------------ *
 * Masking                                                            *
 * ------------------------------------------------------------------ */

/**
 * Blank every character in `[start, end)` of `chars`, preserving newlines so all
 * offsets stay identical to the original text.
 * @param chars - the character array to modify in place.
 * @param start - inclusive offset.
 * @param end - exclusive offset.
 */
function blank(chars, start, end) {
  for (let i = start; i < end && i < chars.length; i += 1) {
    const c = chars[i];
    if (c !== '\n' && c !== '\r') chars[i] = ' ';
  }
}

/** True when `ch` can end an expression, i.e. a following `/` means division. */
function endsExpression(ch) {
  return ch === ']' || ch === '}' || ch === '"' || ch === "'" || ch === '`'
    || /[A-Za-z0-9_$]/u.test(ch);
}

/**
 * Produce the masked views of one source file.
 *
 * A single left-to-right pass consumes whole lexical units (comments, strings,
 * template literals, regex literals), so a `//` inside a string or a quote inside
 * a comment can never be misread.
 *
 * @param source - the whole file as text.
 * @param language - scanner dialect name.
 * @returns `{ code, lit, opaque, comments }` where `code` has comments and
 *   strings blanked, `lit` has only comments blanked, `opaque` is a
 *   one-byte-per-character mask of string/regex characters, and `comments` lists
 *   `{ start, end }` for every comment.
 */
export function maskSource(source, language) {
  const n = source.length;
  const code = source.split('');
  const lit = source.split('');
  const opaque = new Uint8Array(n);
  const comments = [];
  const hashComments = HASH_COMMENT.has(language);
  const slashComments = !hashComments;
  const nested = NESTED_COMMENT.has(language);
  const jsLike = language === 'javascript' || language === 'typescript';
  const python = language === 'python';

  const markOpaque = (start, end) => {
    for (let i = start; i < end && i < n; i += 1) opaque[i] = 1;
  };
  const blankBoth = (start, end) => {
    blank(code, start, end);
    blank(lit, start, end);
  };

  /** The word ending just before `p`, lower-cased. */
  const wordEndingAt = (p) => {
    let q = p;
    while (q >= 0 && /[A-Za-z0-9_$]/u.test(source[q])) q -= 1;
    return source.slice(q + 1, p + 1).toLowerCase();
  };

  /** Is a quote at `i` in expression position (rather than an apostrophe)? */
  const quoteAllowed = (i) => {
    let p = i - 1;
    while (p >= 0 && (source[p] === ' ' || source[p] === '\t')) p -= 1;
    if (p < 0) return true;
    const c = source[p];
    if (c === '\\' || c === '\n' || c === '\r') return true;
    if (!/[A-Za-z0-9_$]/u.test(c)) return c !== ')' && c !== ']' && c !== '}';
    const word = wordEndingAt(p);
    return REGEX_PREFIX_KEYWORDS.has(word) || word === 'from' || word === 'import';
  };

  /** Does a `/` at `i` start a regex literal rather than a division? */
  const regexAllowed = (i) => {
    let p = i - 1;
    while (p >= 0 && /\s/u.test(source[p])) p -= 1;
    if (p < 0) return true;
    const c = source[p];
    if (c === ')' || c === ']') return false;
    if (c === '}') return true;
    if (!endsExpression(c)) return true;
    if (!/[A-Za-z0-9_$]/u.test(c)) return false;
    return REGEX_PREFIX_KEYWORDS.has(wordEndingAt(p));
  };

  let i = 0;
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    // ---- line comments ------------------------------------------------
    if ((slashComments && c === '/' && d === '/') || (hashComments && c === '#')) {
      const start = i;
      while (i < n && source[i] !== '\n') i += 1;
      comments.push({ start, end: i });
      blankBoth(start, i);
      continue;
    }

    // ---- block comments (nesting for Rust/Kotlin/Scala/Swift) ----------
    if (slashComments && c === '/' && d === '*') {
      const start = i;
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (nested && source[i] === '/' && source[i + 1] === '*') {
          depth += 1;
          i += 2;
          continue;
        }
        if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1;
          i += 2;
          continue;
        }
        i += 1;
      }
      comments.push({ start, end: i });
      blankBoth(start, i);
      continue;
    }

    // ---- regex literal (JS/TS only) -----------------------------------
    if (jsLike && c === '/' && regexAllowed(i)) {
      const start = i;
      let j = i + 1;
      let inClass = false;
      let closed = -1;
      while (j < n) {
        const ch = source[j];
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '\n') break;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          closed = j;
          break;
        }
        j += 1;
      }
      if (closed < 0) {
        // Not a regex after all (a division or a stray slash): treat as code.
        i += 1;
        continue;
      }
      let end = closed + 1;
      while (end < n && /[a-z]/iu.test(source[end])) end += 1;
      blank(code, start, end);
      markOpaque(start, end);
      i = end;
      continue;
    }

    // ---- strings ------------------------------------------------------
    const isQuote = c === '"' || c === "'" || (c === '`' && jsLike);
    if (isQuote && (!jsLike || quoteAllowed(i))) {
      const triple = python && (c === '"' || c === "'") && source.startsWith(c.repeat(3), i);
      const fence = triple ? c.repeat(3) : c;
      const start = i;
      i += fence.length;
      while (i < n) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source.startsWith(fence, i)) {
          i += fence.length;
          break;
        }
        // Template-literal interpolation is skipped as a balanced brace region
        // so a quote inside `${…}` cannot terminate the literal early.
        if (c === '`' && source[i] === '$' && source[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            i += 1;
          }
          continue;
        }
        if (!triple && source[i] === '\n') break;
        i += 1;
      }
      blank(code, start, i);
      markOpaque(start, i);
      continue;
    }

    i += 1;
  }

  return { code: code.join(''), lit: lit.join(''), opaque, comments };
}

/**
 * Offset → 1-based line lookup.
 * @param text - the source text the offsets refer to.
 * @returns a function mapping a character offset to its 1-based line.
 */
export function makeLineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/* ------------------------------------------------------------------ *
 * Text helpers                                                       *
 * ------------------------------------------------------------------ */

/** 1-based column of an offset. */
function columnOf(text, offset) {
  return offset - text.lastIndexOf('\n', offset - 1);
}

/** Index just past the `}` matching the `{` at `open`, or `text.length`. */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/**
 * Offset of the first `{` at bracket depth 0 at or after `from`, stopping at a
 * `;` at depth 0 (a declaration without a body). Returns -1 when there is none.
 * @param text - masked source.
 * @param from - offset to start scanning from.
 * @param limit - optional hard stop.
 * @returns the offset of the opening brace, or -1.
 */
function headerBrace(text, from, limit) {
  let paren = 0;
  let angle = 0;
  const stop = Math.min(text.length, limit ?? text.length);
  for (let i = from; i < stop; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[') paren += 1;
    else if (c === ')' || c === ']') paren = Math.max(0, paren - 1);
    else if (c === '<' && paren === 0) angle += 1;
    else if (c === '>' && paren === 0 && angle > 0) angle -= 1;
    else if (c === '{' && paren === 0) return i;
    else if (c === ';' && paren === 0 && angle === 0) return -1;
  }
  return -1;
}

/** Index of the `)` matching the `(` at `open`, or -1. */
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index just past the `;` terminating a statement, or the end of the line. */
function statementEnd(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) return i + 1;
    else if (c === '\n' && depth === 0) return i;
  }
  return text.length;
}

/**
 * `_strip_string_delimiters` (`engine.py:113-130`): a string literal becomes the
 * sentence it contains.
 * @param raw - the literal *including* quotes and any `r`/`f`/`b` prefix.
 * @returns the de-quoted, line-joined, trimmed text.
 */
function stripStringDelimiters(raw) {
  let text = String(raw ?? '').trim();
  text = text.replace(/^[rRbBuUfF]{0,2}/u, '');
  for (const quote of ['"""', "'''", '"', "'", '`']) {
    if (text.startsWith(quote) && text.endsWith(quote) && text.length >= 2 * quote.length) {
      text = text.slice(quote.length, -quote.length);
      break;
    }
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ')
    .trim();
}

/**
 * `_marker_rationale` (`engine.py:159-170`): a comment carrying `NOTE:`/`WHY:`/…
 * becomes an explanation of the code it sits in.
 * @param raw - the raw comment text, prefixes included.
 * @returns the text after the marker, or null when there is none.
 */
function markerRationale(raw) {
  let text = String(raw ?? '').trim();
  for (const prefix of ['#', '//', '/*', '*', '--']) {
    if (text.startsWith(prefix)) text = text.slice(prefix.length).trim();
  }
  text = text.replace(/[*/\s]+$/u, '').trim();
  if (text === '') return null;
  const upper = text.toUpperCase();
  for (const marker of RATIONALE_MARKERS) {
    if (upper.startsWith(marker.toUpperCase())) {
      const body = text.slice(marker.length).trim();
      return body === '' ? null : body;
    }
  }
  return null;
}

/** Split on commas that are not inside brackets. */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '[' || c === '(' || c === '{') depth += 1;
    else if (c === ']' || c === ')' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/* ------------------------------------------------------------------ *
 * Declaration records                                                *
 * ------------------------------------------------------------------ */

/**
 * One declaration before it becomes a node.
 *
 * `headerEnd` bounds the signature and lets call scanning skip a declaration's
 * own parentheses; `end` is exclusive and defines containment, which is how the
 * parent/child scope tree is rebuilt without an AST.
 */
function declaration(name, kind, start, headerEnd, end) {
  return { name, kind, start, headerEnd, end };
}

/* ------------------------------------------------------------------ *
 * Python                                                             *
 * ------------------------------------------------------------------ */

/** Leading whitespace width of one line (a tab counts as one column). */
function indentOf(line) {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  return i;
}

/**
 * Last line index of a Python block opened on `startIndex` at `indent`.
 * Blank lines belong to the block; the first non-blank line at or below the
 * opening indent ends it.
 */
function pythonBlockEnd(codeLines, startIndex, indent) {
  let last = startIndex;
  for (let i = startIndex + 1; i < codeLines.length; i += 1) {
    const line = codeLines[i];
    if (line.trim() === '') continue;
    if (indentOf(line) <= indent) break;
    last = i;
  }
  return last;
}

/**
 * Offset of the `:` that ends a Python signature, at bracket depth 0.
 * @returns the colon's offset, or -1.
 */
function pythonHeaderEnd(code, from) {
  let depth = 0;
  const stop = Math.min(code.length, from + 8000);
  for (let i = from; i < stop; i += 1) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ':' && depth === 0) return i;
    else if (c === '\n' && depth === 0) return -1;
  }
  return -1;
}

/**
 * Declarations of one Python file.
 * @param code - masked source (comments and strings blanked).
 * @returns declaration records in source order.
 */
function scanPythonDecls(code) {
  const codeLines = code.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < code.length; i += 1) if (code[i] === '\n') lineStarts.push(i + 1);

  const out = [];
  for (let index = 0; index < codeLines.length; index += 1) {
    const text = codeLines[index];
    if (text.trim() === '') continue;
    const indent = indentOf(text);
    const trimmed = text.slice(indent);

    let name = null;
    let kind = null;
    let match = /^class[ \t]+([A-Za-z_]\w*)/u.exec(trimmed);
    if (match !== null) {
      name = match[1];
      kind = KIND_CLASS;
    } else {
      match = /^(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)/u.exec(trimmed);
      if (match !== null) {
        name = match[1];
        kind = KIND_FUNCTION;
      }
    }
    if (name === null) continue;

    const start = lineStarts[index] + indent;
    const colon = pythonHeaderEnd(code, start);
    const last = pythonBlockEnd(codeLines, index, indent);
    const end = lineStarts[last] + codeLines[last].length;
    out.push(declaration(name, kind, start, colon < 0 ? start + trimmed.length : colon + 1, end));
  }
  return out;
}

/**
 * The docstring of a Python definition, if its body opens with a bare string.
 *
 * Recognised as "the first statement of the body is a string expression", which
 * is the shape every Python docstring compiles to and which avoids mistaking a
 * string passed to a call for documentation.
 *
 * @param lit - masked source with strings intact.
 * @param headerEnd - offset just past the signature's `:`.
 * @returns the de-quoted text, or null.
 */
function pythonDocstring(lit, headerEnd) {
  let i = headerEnd;
  while (i < lit.length && /\s/u.test(lit[i])) i += 1;
  const c = lit[i];
  if (c !== '"' && c !== "'") return null;
  const triple = lit.startsWith(c.repeat(3), i);
  const fence = triple ? c.repeat(3) : c;
  const start = i;
  i += fence.length;
  while (i < lit.length) {
    if (lit[i] === '\\') {
      i += 2;
      continue;
    }
    if (lit.startsWith(fence, i)) {
      i += fence.length;
      break;
    }
    if (!triple && lit[i] === '\n') break;
    i += 1;
  }
  return stripStringDelimiters(lit.slice(start, i)) || null;
}

/**
 * Python base classes: `class X(A, B, metaclass=M)` → raw base texts.
 *
 * `superclass_name_types = {identifier, attribute}` in the original, so a
 * keyword argument never becomes a base; the generic head rule
 * (`resolve.py:578`) runs later, in the resolver.
 */
function pythonInherits(code, decls, lineOf, colOf) {
  const facts = [];
  for (const decl of decls) {
    if (decl.kind !== KIND_CLASS) continue;
    const header = code.slice(decl.start, decl.headerEnd);
    const match = /^[ \t]*class[ \t]+[A-Za-z_]\w*[ \t]*\(([\s\S]*?)\)/u.exec(header);
    if (match === null) continue;
    let cursor = decl.start + match[0].length - 1 - match[1].length;
    for (const raw of splitTopLevel(match[1])) {
      const piece = raw.trim();
      const at = cursor + raw.indexOf(piece);
      cursor += raw.length + 1;
      if (piece === '' || /^[A-Za-z_]\w*\s*=/u.test(piece)) continue;
      facts.push({
        child_name: decl.name,
        child_start: decl.start,
        base: piece,
        is_interface: false,
        line: lineOf(at),
        column: colOf(at),
        end_line: lineOf(at + piece.length),
        end_column: colOf(at + piece.length),
      });
    }
  }
  return facts;
}

/* ------------------------------------------------------------------ *
 * JavaScript / TypeScript                                            *
 * ------------------------------------------------------------------ */

const JS_CLASS_RE = /\b(?:export[ \t]+)?(?:default[ \t]+)?(?:abstract[ \t]+)?(class)[ \t]+([A-Za-z_$][\w$]*)/gu;
const JS_INTERFACE_RE = /\b(?:export[ \t]+)?(?:default[ \t]+)?(interface)[ \t]+([A-Za-z_$][\w$]*)/gu;
const JS_ENUM_RE = /\b(?:export[ \t]+)?(?:const[ \t]+)?(enum)[ \t]+([A-Za-z_$][\w$]*)/gu;
const JS_FUNCTION_RE = /\b(?:export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?(function)[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*\(/gu;
const JS_ARROW_RE = /\b(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]{0,120})[ \t]*(?::[^=;\n]{0,200})?=[ \t]*(?:async[ \t]+)?(?:function\b|\([^()\n]{0,400}\)[ \t]*(?::[^=;\n]{0,200})?=>|[A-Za-z_$][\w$]{0,120}[ \t]*=>)/gu;

/** A member with a real body: `name(params): Type { … }`. */
const JS_METHOD_RE = /(?:^|[\n;{}])[ \t]{0,8}(?:(?:public|private|protected|static|async|readonly|abstract|override|declare|get|set|accessor)[ \t]+){0,6}\*?[ \t]{0,4}([A-Za-z_$][\w$]{0,80})[ \t]{0,4}(?:<[^<>{}]{0,80}>)?[ \t]{0,4}\([^()]{0,400}\)[ \t]{0,4}(?::[^{};\n]{0,200})?[ \t]{0,4}\{/gu;

/** A bodiless member: a TS method signature or an abstract method. */
const JS_SIGNATURE_RE = /(?:^|[\n;{}])[ \t]{0,8}(?:(?:public|private|protected|static|async|readonly|abstract|override|declare|get|set|accessor)[ \t]+){0,6}\*?[ \t]{0,4}([A-Za-z_$][\w$]{0,80})[ \t]{0,4}(?:<[^<>{}]{0,80}>)?[ \t]{0,4}\([^()]{0,400}\)[ \t]{0,4}(?::[^{};\n]{0,200})?[ \t]*;/gu;

/** A class field holding a function: `handler = () => { … }`. */
const JS_FIELD_FN_RE = /(?:^|[\n;{}])[ \t]{0,8}(?:(?:public|private|protected|static|readonly|override)[ \t]+){0,4}([A-Za-z_$][\w$]{0,80})[ \t]*(?::[^=;\n]{0,200})?=[ \t]*(?:async[ \t]+)?(?:function\b|\([^()\n]{0,400}\)[ \t]*(?::[^=;\n]{0,200})?=>|[A-Za-z_$][\w$]{0,120}[ \t]*=>)/gu;

/** Where a brace-bodied declaration ends, and where its body opens. */
function braceBodyEnd(code, from) {
  const open = headerBrace(code, from);
  if (open < 0) return { bodyOpen: -1, end: statementEnd(code, from) };
  return { bodyOpen: open, end: matchBrace(code, open) };
}

/**
 * Declarations of one JS/TS file.
 * @param code - masked source.
 * @returns declaration records in source order.
 */
function scanJsDecls(code) {
  const out = [];
  const classes = [];

  for (const [re, kind] of [
    [JS_CLASS_RE, KIND_CLASS],
    [JS_INTERFACE_RE, KIND_CLASS],
    [JS_ENUM_RE, KIND_CLASS],
  ]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const keywordAt = m.index + m[0].indexOf(m[1]);
      const nameAt = m.index + m[0].length - m[2].length;
      const { bodyOpen, end } = braceBodyEnd(code, nameAt);
      out.push(declaration(m[2], kind, keywordAt, bodyOpen < 0 ? nameAt + m[2].length : bodyOpen, end));
      if (kind === KIND_CLASS && bodyOpen >= 0) classes.push({ start: bodyOpen, end });
    }
  }

  // Members are scanned inside a class body only. Restricting the window is what
  // keeps an `if (x) {` inside a method from ever being read as a member.
  for (const body of classes) {
    for (const [re, needsBody] of [
      [JS_METHOD_RE, true],
      [JS_SIGNATURE_RE, false],
      [JS_FIELD_FN_RE, true],
    ]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        if (m.index >= body.end) break;
        if (m.index < body.start) continue;
        const name = m[1];
        if (name === undefined || CALL_KEYWORDS.has(name)) continue;
        const nameAt = m.index + m[0].lastIndexOf(name);
        const { bodyOpen, end } = braceBodyEnd(code, nameAt);
        if (needsBody && bodyOpen < 0) continue;
        if (!needsBody && bodyOpen >= 0) continue;
        if (end > body.end) continue;
        out.push(declaration(name, KIND_FUNCTION, nameAt, bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
      }
    }
  }

  for (const [re, group] of [
    [JS_FUNCTION_RE, 2],
    [JS_ARROW_RE, 1],
  ]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[group];
      if (name === undefined) continue;
      const nameAt = m.index + m[0].lastIndexOf(name);
      const { bodyOpen, end } = braceBodyEnd(code, nameAt);
      out.push(declaration(name, KIND_FUNCTION, m.index, bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
    }
  }

  return out;
}

/**
 * JS/TS inheritance — the deliberate deviation (DESIGN §5.3, `spec §4.2.1`).
 *
 * `_JS_COMMON` configures `superclass_field=None`, so `_named_child` returns null
 * and **no** `raw_inherits` fact is ever produced for JavaScript or TypeScript.
 * That is a bug, not a design: a JS class hierarchy being invisible is exactly
 * the gap this plugin exists to close. `implements` clauses become `inherits`
 * facts too, because the `implements` relation is declared but never emitted.
 */
function jsInherits(code, decls, lineOf, colOf) {
  const facts = [];
  for (const decl of decls) {
    if (decl.kind !== KIND_CLASS) continue;
    const header = code.slice(decl.start, Math.min(decl.headerEnd + 1, decl.start + 600));
    const ext = /\bextends[ \t]+([A-Za-z_$][\w$.]*)/u.exec(header);
    if (ext !== null) {
      const at = decl.start + ext.index + ext[0].lastIndexOf(ext[1]);
      facts.push({
        child_name: decl.name,
        child_start: decl.start,
        base: ext[1],
        is_interface: false,
        line: lineOf(at),
        column: colOf(at),
        end_line: lineOf(at + ext[1].length),
        end_column: colOf(at + ext[1].length),
      });
    }
    const impl = /\bimplements[ \t]+([^{;\n]+)/u.exec(header);
    if (impl === null) continue;
    let cursor = decl.start + impl.index + impl[0].length - impl[1].length;
    for (const raw of splitTopLevel(impl[1])) {
      const piece = raw.trim();
      const at = cursor + raw.indexOf(piece);
      cursor += raw.length + 1;
      if (piece === '') continue;
      facts.push({
        child_name: decl.name,
        child_start: decl.start,
        // The generic head (`Other<number>` → `Other`) is stripped by the
        // resolver's shared head rule, not here — one rule, one place.
        base: piece,
        is_interface: true,
        line: lineOf(at),
        column: colOf(at),
        end_line: lineOf(at + piece.length),
        end_column: colOf(at + piece.length),
      });
    }
  }
  return facts;
}

/* ------------------------------------------------------------------ *
 * Go                                                                 *
 * ------------------------------------------------------------------ */

/**
 * Declarations of one Go file.
 *
 * The original's `class_types` includes `struct_type`/`interface_type`, which are
 * not named declarations; its fallback then emits a second, duplicate class node
 * for every `type X struct`. Only the named `type_declaration` is emitted here —
 * a trim that is invisible except as fewer duplicate nodes.
 */
function scanGoDecls(code) {
  const out = [];
  let m;
  const fnRe = /^func[ \t]+(?:\([ \t]*\w*[ \t]*\*?(\w+)[ \t]*\)[ \t]*)?(\w+)[ \t]*\(/gmu;
  while ((m = fnRe.exec(code)) !== null) {
    const name = m[2];
    const nameAt = m.index + m[0].lastIndexOf(name);
    const { bodyOpen, end } = braceBodyEnd(code, nameAt);
    out.push(declaration(name, KIND_FUNCTION, m.index, bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
  }
  const typeRe = /^type[ \t]+(\w+)[ \t]+(?:struct|interface)\b/gmu;
  while ((m = typeRe.exec(code)) !== null) {
    const { bodyOpen, end } = braceBodyEnd(code, m.index + m[0].length);
    out.push(declaration(m[1], KIND_CLASS, m.index, bodyOpen < 0 ? m.index + m[0].length : bodyOpen, end));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rust                                                               *
 * ------------------------------------------------------------------ */

/** Declarations of one Rust file. */
function scanRustDecls(code) {
  const out = [];
  let m;
  const fnRe = /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:const[ \t]+)?(?:async[ \t]+)?(?:unsafe[ \t]+)?(?:extern[ \t]+"[^"]*"[ \t]+)?(fn)[ \t]+(\w+)/gmu;
  while ((m = fnRe.exec(code)) !== null) {
    const name = m[2];
    const nameAt = m.index + m[0].lastIndexOf(name);
    const { bodyOpen, end } = braceBodyEnd(code, nameAt);
    out.push(declaration(name, KIND_FUNCTION, m.index, bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
  }
  const typeRe = /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:struct|enum|trait|union)[ \t]+(\w+)/gmu;
  while ((m = typeRe.exec(code)) !== null) {
    const { bodyOpen, end } = braceBodyEnd(code, m.index + m[0].length);
    out.push(declaration(m[1], KIND_CLASS, m.index, bodyOpen < 0 ? m.index + m[0].length : bodyOpen, end));
  }
  const implRe = /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?impl(?:[ \t]*<[^>]*>)?[ \t]+(?:[\w:<>]+[ \t]+for[ \t]+)?(\w+)/gmu;
  while ((m = implRe.exec(code)) !== null) {
    const { bodyOpen, end } = braceBodyEnd(code, m.index + m[0].length);
    out.push(declaration(m[1], KIND_CLASS, m.index, bodyOpen < 0 ? m.index + m[0].length : bodyOpen, end));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Generic brace languages (Java, C#, Kotlin, Scala, Swift, C, C++, PHP)
 * ------------------------------------------------------------------ */

const GENERIC_TYPE_RE = /\b(class|interface|enum|struct|union|record|trait|object|namespace)[ \t]+([A-Za-z_$][\w$]*)/gu;

/** A C-style function definition: `TYPE name(args) {` at a line start. */
const GENERIC_FUNCTION_RE = /(?:^|\n)[ \t]*(?!(?:if|for|while|switch|catch|return|sizeof|do|else)\b)[A-Za-z_][\w:<>,*&[\]. \t]{0,140}?\b([A-Za-z_]\w*)[ \t]*\([^;{}]{0,600}\)[ \t]*(?:const[ \t]*)?(?:noexcept[ \t]*)?\{/gu;

/** `function NAME(`, `def NAME(`, `fun NAME(`, `sub NAME(`. */
const GENERIC_KEYWORD_FN_RE = /(?:^|[\s;{}])(?:function|def|fun|sub|proc)[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/gu;

/** A member with a body, at a member-start position. */
const GENERIC_MEMBER_RE = /(?:^|[\n;{}])[ \t]{0,8}(?:(?:public|private|protected|internal|static|final|abstract|virtual|override|async|sealed|partial|extern|synchronized|native|default|readonly|open|suspend|inline|operator)[ \t]+){1,6}[\w<>[\],.?*&:]{1,160}?[ \t]+([A-Za-z_$][\w$]{0,80})[ \t]*\([^;{}]{0,600}\)[ \t]*(?:(?:const|noexcept|override|final|throws[ \t]+[\w,.\s]{1,200})[ \t]*)?[{;]/gmu;

/**
 * Declarations of one brace-delimited file.
 *
 * These languages have no import parser and no per-language inheritance
 * configuration in the original either, so this single generic scanner is their
 * whole support. It is deliberately conservative: it prefers missing a
 * declaration to inventing one.
 */
function scanGenericDecls(code) {
  const out = [];
  const types = [];
  let m;

  GENERIC_TYPE_RE.lastIndex = 0;
  while ((m = GENERIC_TYPE_RE.exec(code)) !== null) {
    const name = m[2];
    const nameAt = m.index + m[0].length - name.length;
    const { bodyOpen, end } = braceBodyEnd(code, nameAt);
    out.push(declaration(name, KIND_CLASS, m.index + m[0].indexOf(m[1]), bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
    if (bodyOpen >= 0) types.push({ start: bodyOpen, end });
  }

  for (const body of types) {
    GENERIC_MEMBER_RE.lastIndex = 0;
    let mm;
    while ((mm = GENERIC_MEMBER_RE.exec(code)) !== null) {
      if (mm.index >= body.end) break;
      if (mm.index < body.start) continue;
      const name = mm[1];
      if (name === undefined || CALL_KEYWORDS.has(name)) continue;
      const nameAt = mm.index + mm[0].lastIndexOf(name);
      const { bodyOpen, end } = braceBodyEnd(code, nameAt);
      if (end > body.end) continue;
      out.push(declaration(name, KIND_FUNCTION, nameAt, bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
    }
  }

  GENERIC_FUNCTION_RE.lastIndex = 0;
  while ((m = GENERIC_FUNCTION_RE.exec(code)) !== null) {
    const name = m[1];
    if (name === undefined || CALL_KEYWORDS.has(name)) continue;
    const nameAt = m.index + m[0].lastIndexOf(name);
    const open = headerBrace(code, nameAt);
    if (open < 0) continue;
    out.push(declaration(name, KIND_FUNCTION, m.index + (m[0].startsWith('\n') ? 1 : 0), open, matchBrace(code, open)));
  }

  GENERIC_KEYWORD_FN_RE.lastIndex = 0;
  while ((m = GENERIC_KEYWORD_FN_RE.exec(code)) !== null) {
    const name = m[1];
    const nameAt = m.index + m[0].lastIndexOf(name);
    const { bodyOpen, end } = braceBodyEnd(code, nameAt);
    out.push(declaration(name, KIND_FUNCTION, m.index, bodyOpen < 0 ? nameAt + name.length : bodyOpen, end));
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Ruby (end-delimited)                                               *
 * ------------------------------------------------------------------ */

/** Declarations of one Ruby file, matched by `def`/`class`/`module` … `end`. */
function scanRubyDecls(code) {
  const codeLines = code.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < code.length; i += 1) if (code[i] === '\n') lineStarts.push(i + 1);

  const out = [];
  const stack = [];
  for (let index = 0; index < codeLines.length; index += 1) {
    const text = codeLines[index];
    const opened = /^[ \t]*(class|module|def)[ \t]+([A-Za-z_]\w*[?!=]?)/u.exec(text);
    if (opened !== null) {
      stack.push({
        name: opened[2],
        kind: opened[1] === 'def' ? KIND_FUNCTION : KIND_CLASS,
        start: lineStarts[index] + indentOf(text),
        headerEnd: lineStarts[index] + text.length,
      });
      continue;
    }
    if (/^[ \t]*end\b/u.test(text) && stack.length > 0) {
      const open = stack.pop();
      out.push(declaration(open.name, open.kind, open.start, open.headerEnd, lineStarts[index] + text.indexOf('end') + 3));
    }
  }
  for (const open of stack) {
    out.push(declaration(open.name, open.kind, open.start, open.headerEnd, code.length));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Imports                                                            *
 * ------------------------------------------------------------------ */

/**
 * The original's combined JS import regex (`languages.py:115-120`), anchored at
 * line starts. An unanchored `from 'x'` also matches JSX attributes and string
 * literals inside expressions, which is how a previous version ended up with
 * `aria-label` and `button` as imported modules.
 */
const JS_IMPORT_RE = /(?:^|\n)[ \t]*import[ \t]+(?:type[ \t]+)?(?:(?<def>[A-Za-z_$][\w$]*)[ \t]*,?[ \t]*)?(?:\{(?<named>[^}]*)\})?[ \t]*(?:\*[ \t]+as[ \t]+(?<ns>[A-Za-z_$][\w$]*))?[ \t]*from[ \t]*['"](?<mod>[^'"\n]+)['"]|(?:^|\n)[ \t]*import[ \t]*['"](?<bare>[^'"\n]+)['"]|(?:^|\n)[ \t]*(?:const|let|var)[ \t]+[A-Za-z_$][\w$]*[ \t]*=[ \t]*require\([ \t]*['"](?<req>[^'"\n]+)['"][ \t]*\)|(?:^|\n)[ \t]*export[ \t]+(?:\*|\{[^}]*\})[ \t]*from[ \t]*['"](?<reexp>[^'"\n]+)['"]/gu;

/**
 * Import facts from one JS/TS file.
 *
 * The pattern runs over `lit` (strings intact) but a match whose statement head
 * falls inside a string or template literal is discarded — the port of "only real
 * statement nodes were scanned", which keeps a docstring from inventing modules.
 *
 * @param lit - masked source with strings intact.
 * @param opaque - string/regex character mask.
 * @param lineOf - offset → 1-based line.
 * @param colOf - offset → 1-based column.
 * @returns raw import facts with a statement-level span.
 */
function scanJsImports(lit, opaque, lineOf, colOf) {
  const facts = [];
  JS_IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = JS_IMPORT_RE.exec(lit)) !== null) {
    const at = m.index + (m[0].length - m[0].trimStart().length);
    if (opaque[at] === 1) continue;
    const module = m.groups.mod ?? m.groups.bare ?? m.groups.req ?? m.groups.reexp;
    if (typeof module !== 'string' || module === '') continue;
    const names = [];
    const aliases = {};
    if (m.groups.def) names.push(m.groups.def);
    if (m.groups.ns) names.push(m.groups.ns);
    if (m.groups.named) {
      for (const chunk of m.groups.named.split(',')) {
        const parts = chunk.trim().split(/\s+as\s+/u);
        const name = (parts[0] ?? '').trim();
        if (name === '') continue;
        names.push(name);
        if (parts.length > 1 && (parts[1] ?? '').trim() !== '') aliases[parts[1].trim()] = name;
      }
    }
    const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
    const end = m.index + m[0].length;
    facts.push({
      kind: names.length > 0 ? 'from' : 'plain',
      module,
      names,
      aliases,
      // A re-export binds nothing in this file; it only records the dependency.
      reexport: m.groups.reexp !== undefined,
      line: lineOf(start),
      column: colOf(start),
      end_line: lineOf(end),
      end_column: colOf(end),
    });
  }
  return facts;
}

/**
 * Import facts from one Python file.
 *
 * A logical statement is sliced out (a parenthesised multi-line
 * `from x import (a, b)` is one statement) and handed to the same regex the
 * original uses, so `import a, b` yields two facts and `from x import *` yields
 * one fact with no names — the file edge exists, nothing is bound.
 */
function scanPythonImports(lit, opaque, lineOf, colOf) {
  const facts = [];
  const head = /^[ \t]*(?:from|import)[ \t]+/gmu;
  let m;
  while ((m = head.exec(lit)) !== null) {
    const at = m.index + (m[0].length - m[0].trimStart().length);
    if (opaque[at] === 1) continue;

    let depth = 0;
    let end = m.index;
    for (; end < lit.length; end += 1) {
      const c = lit[end];
      if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === '\\') end += 1;
      else if (c === '\n' && depth === 0) break;
    }
    const text = lit.slice(at, end).trim();
    head.lastIndex = Math.max(head.lastIndex, end + 1);
    const span = {
      line: lineOf(at),
      column: colOf(at),
      end_line: lineOf(end),
      end_column: colOf(end),
    };

    if (text.startsWith('from ')) {
      const match = /^from\s+(\.*)([\w.]*)\s+import\s+([\s\S]+)$/u.exec(text);
      if (match === null) continue;
      // Preserve relative depth: `from . import x` has module ".".
      const module = '.'.repeat(match[1].length) + match[2];
      const names = [];
      const aliases = {};
      const blob = match[3].replace(/^[(\s]+|[)\s]+$/gu, '');
      for (const chunk of blob.split(',')) {
        const parts = chunk.trim().split(/\s+as\s+/u);
        const name = (parts[0] ?? '').trim();
        if (name === '' || name === '*') continue;
        names.push(name);
        if (parts.length > 1 && (parts[1] ?? '').trim() !== '') aliases[parts[1].trim()] = name;
      }
      facts.push({ kind: 'from', module: module.trim(), names, aliases, ...span });
      continue;
    }

    for (const chunk of text.slice('import '.length).split(',')) {
      const parts = chunk.trim().split(/\s+as\s+/u);
      const module = (parts[0] ?? '').trim();
      if (module === '') continue;
      const alias = parts.length > 1 ? (parts[1] ?? '').trim() : '';
      facts.push({
        kind: 'plain',
        module,
        names: [],
        // A plain import's alias maps to "" — it names a module, not a symbol,
        // so `_import_original_name` returns "" and no alias entry is recorded.
        aliases: alias === '' ? {} : { [alias]: '' },
        ...span,
      });
    }
  }
  return facts;
}

/* ------------------------------------------------------------------ *
 * Calls                                                              *
 * ------------------------------------------------------------------ */

/** The word immediately before `offset` in `code`, or ''. */
function wordBefore(code, offset) {
  let p = offset - 1;
  while (p >= 0 && (code[p] === ' ' || code[p] === '\t')) p -= 1;
  if (p < 0) return '';
  let q = p;
  while (q >= 0 && /[A-Za-z0-9_$]/u.test(code[q])) q -= 1;
  return code.slice(q + 1, p + 1);
}

/** The dotted receiver of `name(` at `nameStart`, or null. Bounded look-behind. */
function receiverBefore(code, nameStart) {
  const from = Math.max(0, nameStart - 240);
  const window = code.slice(from, nameStart);
  const dotted = /([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)*)[ \t]*\.[ \t]*$/u.exec(window);
  if (dotted === null) return null;
  return dotted[1].replace(/[ \t]+/gu, '');
}

/**
 * Bare identifiers in argument position are *references* to a callable, not
 * calls: `map(handler)`, `Thread(target=run)`, `submit(process)`.
 *
 * The engine records this explicitly (`engine.py:503-543`) so the resolver can
 * emit `indirect_call` from evidence — never from a failed lookup, because an
 * unresolved ordinary call is usually a library method and labelling that
 * "indirect" would invent a relationship.
 *
 * @param code - masked source.
 * @param openParen - offset of the call's `(`.
 * @param out - accumulator.
 * @param lineOf - offset → line.
 * @param colOf - offset → column.
 */
function collectIndirect(code, openParen, out, lineOf, colOf) {
  const close = matchParen(code, openParen);
  if (close < 0 || close - openParen > 2000) return;
  const inner = code.slice(openParen + 1, close);
  if (inner.trim() === '') return;
  let base = openParen + 1;
  for (const raw of splitTopLevel(inner)) {
    const piece = raw.trim();
    const at = base + raw.indexOf(piece);
    base += raw.length + 1;
    if (piece === '') continue;
    let name = null;
    let nameAt = at;
    const bare = /^([A-Za-z_]\w*)$/u.exec(piece);
    if (bare !== null) {
      name = bare[1];
    } else {
      // `target=run`: for a keyword argument the *last* named child is the value.
      const keyword = /^[A-Za-z_]\w*\s*=\s*([A-Za-z_]\w*)$/u.exec(piece);
      if (keyword !== null) {
        name = keyword[1];
        nameAt = at + piece.lastIndexOf(keyword[1]);
      }
    }
    if (name === null || CALL_KEYWORDS.has(name)) continue;
    const line = lineOf(nameAt);
    out.push({
      callee: name,
      receiver: '',
      receiver_type: null,
      is_member_call: false,
      indirect: true,
      at: nameAt,
      line,
      name_line: line,
      name_col: colOf(nameAt),
      name_end_line: line,
      name_end_col: colOf(nameAt + name.length),
    });
  }
}

/** Words after which `<` opens a JSX element rather than a generic argument. */
const EXPRESSION_KEYWORDS = new Set([
  'return', 'yield', 'await', 'case', 'default', 'else', 'do', 'in', 'of',
  'typeof', 'void', 'delete', 'throw', 'new',
]);

/**
 * JSX component usages: **uppercase identifier only, never the closing tag**.
 *
 * Both rules are load-bearing. A lowercase tag is intrinsic HTML (`div`, `span`),
 * and the closing tag repeats the same name, so counting it would double every
 * JSX call (`engine.py:53-55`, `184-199`).
 */
function collectJsx(code, lineOf, colOf) {
  const facts = [];
  const re = /<([A-Z][A-Za-z0-9_$]*)(?=[\s/>])/gu;
  let m;
  while ((m = re.exec(code)) !== null) {
    // A `<` in expression position opens an element; after a value it is a
    // generic argument list or a comparison (`useState<Foo>(`, `a < B`).
    let p = m.index - 1;
    while (p >= 0 && /\s/u.test(code[p])) p -= 1;
    if (p >= 0) {
      const prev = code[p];
      if (prev === '>' || prev === ')' || prev === ']' || prev === '.') continue;
      if (/[A-Za-z0-9_$]/u.test(prev)) {
        let q = p;
        while (q >= 0 && /[A-Za-z0-9_$]/u.test(code[q])) q -= 1;
        if (!EXPRESSION_KEYWORDS.has(code.slice(q + 1, p + 1))) continue;
      }
    }
    const nameAt = m.index + 1;
    const line = lineOf(nameAt);
    facts.push({
      callee: m[1],
      receiver: '',
      receiver_type: null,
      is_member_call: false,
      at: nameAt,
      line,
      name_line: line,
      name_col: colOf(nameAt),
      name_end_line: line,
      name_end_col: colOf(nameAt + m[1].length),
    });
  }
  return facts;
}

/**
 * Call facts of one file.
 *
 * The original reads `call_types` from a syntax tree. Here every `name(` is a
 * candidate and the *shape* is reconstructed from the text immediately before
 * it, which reproduces the four cases the engine distinguishes
 * (`engine.py:173-245`):
 *
 * 1. `foo(`             → bare call.
 * 2. `Foo.bar(`         → member call; `receiver_type` is `<self>` for
 *    `self/this/cls`, otherwise the receiver when it starts uppercase.
 * 3. `obj.bar(`         → member call with no type; the resolver still keeps it
 *    as a navigable reference when it cannot attribute a target.
 * 4. `<Widget` (JSX)    → bare call, uppercase components only.
 *
 * Languages whose original config has no accessor (Go, Rust, C, C++, and the
 * generic brace languages) produce **no** fact for `x.y(` — tree-sitter hands
 * the walker a non-identifier node and `_callee_facts` returns None. Java is the
 * recorded exception (`call_function_field="name"`): `obj.m()` arrives as a
 * *bare* call named `m`, which §4.2 calls out explicitly.
 *
 * @param code - masked source.
 * @param language - scanner dialect.
 * @param decls - declaration records, whose headers are not call sites.
 * @param lineOf - offset → line.
 * @param colOf - offset → column.
 * @returns raw call facts, caller fields not yet filled in.
 */
function collectCalls(code, language, decls, lineOf, colOf) {
  const facts = [];
  const hasAccessor = ACCESSOR_LANGUAGES.has(language);
  const javaLike = language === 'java' || language === 'csharp';
  const jsLike = language === 'javascript' || language === 'typescript';

  // A declaration's own header is not a call site: `function foo(` / `int main(`.
  const headers = decls.map((d) => [d.start, d.headerEnd]).sort((a, b) => a[0] - b[0]);
  const inHeader = (offset) => {
    let lo = 0;
    let hi = headers.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offset < headers[mid][0]) hi = mid - 1;
      else if (offset >= headers[mid][1]) lo = mid + 1;
      else return true;
    }
    return false;
  };

  const re = /([A-Za-z_$][\w$]*)[ \t]*(?:<[^<>()\n]{0,80}>)?[ \t]*\(/gu;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    if (name === undefined || CALL_KEYWORDS.has(name)) continue;
    const nameAt = m.index;
    if (inHeader(nameAt)) continue;
    if (DECLARATION_PREFIXES.has(wordBefore(code, nameAt))) continue;

    const receiver = receiverBefore(code, nameAt);
    const isMember = receiver !== null;
    // `new Foo()` is a `new_expression`: in `call_types` for JS/TS only, so a
    // `new` in a language without one is not a call fact.
    if (!isMember && wordBefore(code, nameAt) === 'new' && !jsLike) continue;
    if (isMember && !hasAccessor && !javaLike) continue;

    let receiverType = null;
    if (isMember) {
      if (receiver === 'self' || receiver === 'this' || receiver === 'cls') receiverType = '<self>';
      else if (/^[A-Z]/u.test(receiver)) receiverType = receiver;
    }

    const line = lineOf(nameAt);
    const span = {
      at: nameAt,
      line,
      name_line: line,
      name_col: colOf(nameAt),
      name_end_line: line,
      name_end_col: colOf(nameAt + name.length),
    };

    if (isMember && javaLike) {
      facts.push({ callee: name, receiver: '', receiver_type: null, is_member_call: false, ...span });
    } else {
      facts.push({
        callee: name,
        receiver: isMember ? receiver : '',
        receiver_type: receiverType,
        is_member_call: isMember,
        ...span,
      });
    }

    collectIndirect(code, m.index + m[0].length - 1, facts, lineOf, colOf);
  }

  if (jsLike) facts.push(...collectJsx(code, lineOf, colOf));
  return facts;
}

/* ------------------------------------------------------------------ *
 * Assembly                                                           *
 * ------------------------------------------------------------------ */

/**
 * True when `text` looks like minified or generated output not worth indexing.
 *
 * Two signals, both about line shape rather than file name, because a vendor
 * bundle can live anywhere. A hand-written file practically never exceeds 240
 * characters per line across its whole length; a bundled one rarely dips below.
 * @param text - the file contents.
 * @returns whether to skip the file.
 */
export function looksGenerated(text) {
  if (typeof text !== 'string' || text.length === 0) return true;
  const lines = text.split('\n');
  let longest = 0;
  let total = 0;
  let longLines = 0;

  for (const line of lines) {
    if (line.length > longest) longest = line.length;
    // A single very long line is only *evidence* of minification, not proof: a
    // hand-maintained module can carry one 2 KB embedded SQL string or template.
    // So count how many lines are long and weigh the ratio, instead of rejecting
    // the file for one of them.
    if (line.length > 1600) longLines += 1;
    total += line.length;
  }

  const mean = lines.length === 0 ? 0 : total / lines.length;

  // Minified: one enormous line in a file of otherwise short ones.
  if (longest > 4000 && lines.length <= 3) return true;
  // Minified: most lines are enormous.
  if (longLines >= 3 && longLines >= lines.length * 0.3) return true;
  // Dense one-line-per-statement output (a generated bundle, a transpiled file).
  if (lines.length >= 8 && mean > 240) return true;
  return false;
}

/**
 * Scan one source file into an {@link Extraction}.
 *
 * Never throws. A scan failure becomes `{ error, nodes: [] }`, mirroring
 * `engine.extract_file`'s contract (`engine.py:300-328`): one bad file must never
 * lose the build.
 *
 * @param source - the file's text.
 * @param language - scanner dialect, a {@link LANGUAGE_BY_EXT} value.
 * @param relPath - relative POSIX path recorded on every node.
 * @param options - `{ superclassJs = true }`. Set `superclassJs: false` to
 *   reproduce the original's missing JS/TS `inherits` edges (DESIGN §5.3).
 * @returns `{ path, nodes, edges, rawCalls, rawInherits, rawImports, error }`.
 */
export function scanSource(source, language, relPath, options = {}) {
  const path = String(relPath ?? '');
  try {
    return scanUnsafe(
      typeof source === 'string' ? source : String(source ?? ''),
      typeof language === 'string' ? language : '',
      path,
      options ?? {},
    );
  } catch (error) {
    return {
      path,
      nodes: [],
      edges: [],
      rawCalls: [],
      rawInherits: [],
      rawImports: [],
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

/**
 * The scanner proper. Throwing is fine here — {@link scanSource} converts a
 * throw into an `error` Extraction.
 */
function scanUnsafe(source, language, path, options) {
  const superclassJs = options.superclassJs !== false;
  const nodes = [];
  const edges = [];
  const rawCalls = [];
  const rawInherits = [];
  const rawImports = [];
  const seen = new Set();

  const lineOf = makeLineIndex(source);
  const colOf = (offset) => columnOf(source, offset);

  // `end_line` is `source.count(b"\n") + 1` after a missing trailing newline is
  // appended (`engine.py:318-321`, `354`) — so a file with and without a final
  // newline reports the same line count.
  const newlines = source.split('\n').length - 1;
  const endLine = source.endsWith('\n') ? newlines + 1 : newlines + 2;

  const fileNode = makeFileNode(path, endLine, language);
  const fnode = fileNode.id;
  nodes.push(fileNode);
  seen.add(fnode);

  const { code, lit, opaque, comments } = maskSource(source, language);

  /** Add a node unless its id was already seen (the engine's `seen` set). */
  function addNode(node) {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    nodes.push(node);
    return true;
  }

  /** Add a structural edge. Self-edges are dropped, as `engine.add_edge` does. */
  function addEdge(sourceId, targetId, relation, line) {
    if (sourceId === targetId) return;
    edges.push(makeEdge(sourceId, targetId, relation, CONF_EXTRACTED, line));
  }

  /** A docstring or marker comment explaining `ownerId`, plus its edge. */
  function addRationale(text, ownerId, line, origin) {
    const body = String(text ?? '').replace(/\s+/gu, ' ').trim().slice(0, MAX_RATIONALE_CHARS);
    if (body === '') return;
    const node = makeRationaleNode({ path, text: body, line, parent: ownerId, language, origin });
    if (!addNode(node)) return;
    addEdge(node.id, ownerId, REL_RATIONALE_FOR, line);
  }

  // ---- declarations ---------------------------------------------------
  let decls = [];
  if (language === 'python') decls = scanPythonDecls(code);
  else if (language === 'javascript' || language === 'typescript') decls = scanJsDecls(code);
  else if (language === 'go') decls = scanGoDecls(code);
  else if (language === 'rust') decls = scanRustDecls(code);
  else if (language === 'ruby') decls = scanRubyDecls(code);
  else if (language !== '') decls = scanGenericDecls(code);

  // Sort so an enclosing declaration is always built before its children, and a
  // nested one (shorter span, later start) wins over its container.
  decls.sort((a, b) => (a.start - b.start) || (b.end - a.end));

  // ---- scopes: containment rebuilds the walk tree ----------------------
  const stack = [];
  for (const decl of decls) {
    while (stack.length > 0 && stack[stack.length - 1].end <= decl.start) stack.pop();
    const owner = stack.length > 0 ? stack[stack.length - 1] : null;
    decl.owner = owner;
    decl.startLine = lineOf(decl.start);
    decl.endLine = lineOf(Math.max(decl.start, decl.end - 1));
    decl.node = makeDeclarationNode({
      path,
      kind: decl.kind,
      name: decl.name,
      line: decl.startLine,
      endLine: decl.endLine,
      startCol: colOf(decl.start),
      endCol: colOf(Math.max(decl.start, decl.end - 1)),
      parent: owner === null ? fnode : owner.node.id,
      language,
      signature: signatureOf(source.slice(decl.start, Math.min(decl.end, decl.start + 400))),
    });
    stack.push(decl);
  }

  for (const decl of decls) {
    if (!addNode(decl.node)) continue;
    const ownerId = decl.owner === null ? fnode : decl.owner.node.id;
    const ownerKind = decl.owner === null ? KIND_FILE : decl.owner.kind;
    // `method` says "this class owns this function"; `contains` says "lexically
    // inside". Keeping them apart is what lets the resolver follow `Foo.bar()` to
    // a method without walking the file tree (`engine.py:478-482`).
    const relation = ownerKind === KIND_CLASS && decl.kind === KIND_FUNCTION ? REL_METHOD : REL_CONTAINS;
    addEdge(ownerId, decl.node.id, relation, decl.startLine);
  }

  /** Innermost declaration containing `offset`, or null at file scope. */
  const ownerAt = (offset) => {
    let best = null;
    for (const decl of decls) {
      if (decl.start <= offset && offset < decl.end) {
        if (best === null || decl.start >= best.start) best = decl;
      }
    }
    return best;
  };

  // ---- docstrings (Python only) ---------------------------------------
  if (language === 'python') {
    for (const decl of decls) {
      const doc = pythonDocstring(lit, decl.headerEnd);
      if (doc !== null) addRationale(doc, decl.node.id, decl.startLine, 'docstring');
    }
  }

  // ---- marker comments, attached to the current lexical owner ----------
  for (const comment of comments) {
    const body = markerRationale(source.slice(comment.start, comment.end));
    if (body === null) continue;
    const owner = ownerAt(comment.start);
    addRationale(body, owner === null ? fnode : owner.node.id, lineOf(comment.start), 'comment');
  }

  // ---- file-header block: the first 12 lines ---------------------------
  const headerBodies = [];
  for (const raw of source.split('\n').slice(0, FILE_HEADER_LINES)) {
    const stripped = raw.trim();
    if (stripped === '') {
      if (headerBodies.length > 0) break;
      continue;
    }
    if (!stripped.startsWith('#')) break;
    const body = markerRationale(stripped);
    if (body !== null) headerBodies.push(body);
  }
  if (headerBodies.length > 0) addRationale(headerBodies.join(' '), fnode, 1, 'comment');

  // ---- imports --------------------------------------------------------
  if (IMPORT_LANGUAGES.has(language)) {
    const facts = language === 'python'
      ? scanPythonImports(lit, opaque, lineOf, colOf)
      : scanJsImports(lit, opaque, lineOf, colOf);
    for (const fact of facts) rawImports.push({ ...fact, source_id: fnode });
  }

  // ---- inheritance ----------------------------------------------------
  if (language === 'python') {
    for (const fact of pythonInherits(code, decls, lineOf, colOf)) {
      const decl = decls.find((d) => d.start === fact.child_start);
      if (decl === undefined) continue;
      const { child_start: _drop, ...rest } = fact;
      rawInherits.push({ ...rest, child_id: decl.node.id });
    }
  } else if ((language === 'javascript' || language === 'typescript') && superclassJs) {
    for (const fact of jsInherits(code, decls, lineOf, colOf)) {
      const decl = decls.find((d) => d.start === fact.child_start);
      if (decl === undefined) continue;
      const { child_start: _drop, ...rest } = fact;
      rawInherits.push({ ...rest, child_id: decl.node.id });
    }
  }
  // Java is deliberately absent: its config has no `superclass_field`, so
  // `class X extends Y` yields no fact (`spec §15.2`).

  // ---- calls ----------------------------------------------------------
  for (const fact of collectCalls(code, language, decls, lineOf, colOf)) {
    const owner = ownerAt(fact.at);
    let classDecl = owner;
    while (classDecl !== null && classDecl.kind !== KIND_CLASS) classDecl = classDecl.owner;
    rawCalls.push({
      caller_id: owner === null ? fnode : owner.node.id,
      caller_kind: owner === null ? KIND_FILE : owner.kind,
      caller_class: classDecl === null ? null : classDecl.name,
      caller_class_id: classDecl === null ? null : classDecl.node.id,
      ...fact,
    });
  }

  return { path, nodes, edges, rawCalls, rawInherits, rawImports, error: null };
}
