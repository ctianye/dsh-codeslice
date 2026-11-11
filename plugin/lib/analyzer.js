/**
 * Source scanner for CodeSlice.
 *
 * Deliberately dependency-free: this runs inside the Harness host process,
 * where no tree-sitter / acorn / typescript parser is resolvable from a
 * profile-installed bundle. Every rule below is a line-anchored or word-
 * anchored regular expression applied to a *masked* copy of the source in
 * which comments and string bodies are replaced by spaces of the same
 * length, so match offsets — and therefore line numbers — stay exact.
 *
 * Two masks are produced:
 *   `code` — comments AND string bodies blanked; symbol/call detection.
 *   `lit`  — comments blanked, string literals kept; import-path extraction.
 *
 * What this finds: declarations (function/class/interface/type/enum/
 * method/const-arrow), imports, call sites and inheritance. What it does
 * not find: type-level flow, generics instantiation, macro expansion. That
 * is the documented trade for a zero-dependency scanner.
 */

/** Languages the scanner understands, keyed by lower-case extension (no dot). */
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
  cs: 'csharp',
  kt: 'java',
  kts: 'java',
  c: 'clike',
  h: 'clike',
  cc: 'clike',
  cpp: 'clike',
  cxx: 'clike',
  hpp: 'clike',
};

/** Extensions the indexer never even opens. */
export const CODE_EXTENSIONS = Object.keys(LANGUAGE_BY_EXT);

const JS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof',
  'instanceof', 'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'case',
  'throw', 'await', 'yield', 'super', 'this', 'class', 'const', 'let', 'var',
  'import', 'export', 'default', 'extends', 'implements', 'interface', 'type',
  'enum', 'namespace', 'declare', 'abstract', 'async', 'static', 'get', 'set',
  'public', 'private', 'protected', 'readonly', 'override', 'with', 'debugger',
]);

const PY_KEYWORDS = new Set([
  'if', 'elif', 'else', 'for', 'while', 'with', 'return', 'yield', 'assert',
  'del', 'raise', 'except', 'finally', 'try', 'lambda', 'class', 'def',
  'import', 'from', 'as', 'in', 'is', 'not', 'and', 'or', 'pass', 'global',
  'nonlocal', 'await', 'async', 'print',
]);

/** Replace every non-newline character in [start, end) with a space. */
function blank(chars, start, end) {
  for (let i = start; i < end && i < chars.length; i += 1) {
    if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  }
}

/**
 * Produce the two masked views of one source file.
 * @param source - the whole file as text.
 * @param language - one of the `LANGUAGE_BY_EXT` values.
 * @returns `{ code, lit }`, both the same length as `source`.
 */
export function maskSource(source, language) {
  const isPython = language === 'python';
  const chars = source.split('');
  const code = source.split('');
  const n = source.length;
  let i = 0;

  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    // Line comments: // … and Python's #.
    if ((c === '/' && d === '/') || (isPython && c === '#')) {
      const start = i;
      while (i < n && source[i] !== '\n') i += 1;
      blank(code, start, i);
      blank(chars, start, i);
      continue;
    }

    // Block comments: /* … */
    if (c === '/' && d === '*') {
      const start = i;
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      blank(code, start, i);
      blank(chars, start, i);
      continue;
    }

    // Python triple-quoted strings (docstrings included) behave like comments
    // for our purposes but may carry a rationale worth keeping out of `code`.
    if (isPython && (c === '"' || c === "'") && source.startsWith(c.repeat(3), i)) {
      const fence = c.repeat(3);
      const start = i;
      i += 3;
      while (i < n && !source.startsWith(fence, i)) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i = Math.min(n, i + 3);
      blank(code, start, i);
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = i;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        // Template-literal interpolation: skip the balanced ${…} so a quote
        // inside it cannot terminate the literal early.
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            i += 1;
          }
          continue;
        }
        if (quote !== '`' && (source[i] === '\n')) break;
        i += 1;
      }
      blank(code, start, i);
      continue;
    }

    i += 1;
  }

  return { code: code.join(''), lit: chars.join('') };
}

/** Precomputed newline offsets → 1-based line for any character offset. */
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

/** Offset of the first `{` at or after `from`, or -1. */
function braceAt(text, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '{') return i;
    if (text[i] === ';' || text[i] === '\n') {
      // A declaration header may wrap; keep scanning across newlines but stop
      // at a statement terminator.
      if (text[i] === ';') return -1;
    }
  }
  return -1;
}

/** Index just past the `}` that closes the `{` at `open`, or text.length. */
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
 * Scan one file.
 * @param source - file text.
 * @param language - dialect key.
 * @param relPath - the path recorded on every finding.
 * @returns `{ symbols, imports, calls, inherits }` — flat, offset-annotated.
 */
export function scanSource(source, language, relPath) {
  const { code, lit } = maskSource(source, language);
  const lineOf = makeLineIndex(source);
  const symbols = [];
  const imports = [];
  const calls = [];
  const inherits = [];

  const push = (name, kind, offset, extra = {}) => {
    if (name === undefined || name === '' || JS_KEYWORDS.has(name)) return;
    symbols.push({
      name,
      kind,
      path: relPath,
      line: lineOf(offset),
      column: offset - (source.lastIndexOf('\n', offset) + 1) + 1,
      ...extra,
    });
  };

  if (language === 'javascript' || language === 'typescript') {
    scanJsLike(code, lit, relPath, push, imports, calls, inherits, lineOf);
  } else if (language === 'python') {
    scanPython(code, lit, relPath, push, imports, calls, inherits, lineOf);
  } else if (language === 'go') {
    scanGo(code, lit, relPath, push, imports, calls, inherits, lineOf);
  } else if (language === 'rust') {
    scanRust(code, lit, relPath, push, imports, calls, inherits, lineOf);
  } else if (language === 'java' || language === 'csharp' || language === 'clike') {
    scanDeclarative(code, lit, relPath, push, imports, calls, inherits, lineOf, language);
  }

  return { symbols, imports, calls, inherits };
}

/* ------------------------------------------------------------------ *
 * JavaScript / TypeScript                                            *
 * ------------------------------------------------------------------ */

function scanJsLike(code, lit, relPath, push, imports, calls, inherits, lineOf) {
  // Declarations.
  const decl = [
    [/\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g, 'function'],
    [/\b(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g, 'class'],
    [/\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g, 'interface'],
    [/\b(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/g, 'enum'],
    [/\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g, 'type'],
  ];
  for (const [re, kind] of decl) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const exported = /\bexport\b/.test(code.slice(Math.max(0, m.index - 40), m.index + m[0].length));
      push(m[1], kind, m.index, { exported });
    }
  }

  // Arrow-function / function-expression constants.
  const constFn = /\b(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]{0,80})[ \t]{0,8}(?::[^=\n]{0,120})?=[ \t]{0,8}(?:async[ \t]{0,4})?(?:function\b|\([^()\n]{0,200}\)[ \t]{0,8}(?::[^=\n]{0,120})?=>|[A-Za-z_$][\w$]{0,80}[ \t]{0,4}=>)/g;
  let cm;
  while ((cm = constFn.exec(code)) !== null) {
    const exported = /\bexport\b/.test(code.slice(Math.max(0, cm.index - 30), cm.index));
    push(cm[1], 'const', cm.index, { exported });
  }

  // Class bodies: record the range so methods can be attributed to a class.
  const classRanges = [];
  const classRe = /\bclass[ \t]+([A-Za-z_$][\w$]{0,80})[^{;]{0,300}\{/g;
  let cr;
  while ((cr = classRe.exec(code)) !== null) {
    const open = code.indexOf('{', cr.index);
    if (open < 0) continue;
    classRanges.push({ name: cr[1], start: open, end: matchBrace(code, open) });
  }

  const classOf = (offset) => {
    for (const range of classRanges) {
      if (offset > range.start && offset < range.end) return range;
    }
    return undefined;
  };

  // Methods inside class bodies. Every repetition is bounded: an unbounded
  // `(?:\w+\s+)+` followed by `[\w\s]+?` backtracks exponentially on a long
  // run of identifiers, which is exactly what a minified file looks like.
  const methodRe = /(?:^|[\n;{}])[ \t]{0,8}(?:(?:public|private|protected|static|async|readonly|abstract|override|declare|get|set)[ \t]+){0,6}\*?[ \t]{0,4}([A-Za-z_$][\w$]{0,80})[ \t]{0,4}(?:<[^<>{}]{0,80}>)?[ \t]{0,4}\([^()]{0,400}\)[ \t]{0,4}(?::[^{};\n]{0,200})?[ \t]{0,4}\{/g;
  let mm;
  while ((mm = methodRe.exec(code)) !== null) {
    const name = mm[1];
    if (JS_KEYWORDS.has(name)) continue;
    const owner = classOf(mm.index);
    if (owner === undefined) continue;
    push(name, 'method', mm.index, { container: owner.name });
  }

  // Imports / re-exports / requires — read off `lit` so the path survives.
  const importRes = [
    /\bimport[ \t]+(?:type[ \t]+)?([\w${}\s,:*]{0,400}?)[ \t]*from[ \t]*['"]([^'"\n]+)['"]/g,
    /\bexport[ \t]+(?:type[ \t]+)?[\w${}\s,:*]{0,400}?[ \t]*from[ \t]*['"]([^'"\n]+)['"]/g,
    /\brequire[ \t]*\([ \t]*['"]([^'"\n]+)['"][ \t]*\)/g,
    /\bimport[ \t]*['"]([^'"\n]+)['"]/g,
    /\bimport[ \t]*\([ \t]*['"]([^'"\n]+)['"][ \t]*\)/g,
  ];
  for (const re of importRes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(lit)) !== null) {
      const spec = m[2] ?? m[1];
      if (typeof spec !== 'string' || spec === '') continue;
      const clause = m.length > 2 ? (m[1] ?? '') : '';
      const named = [];
      const braceMatch = /\{([^}]*)\}/.exec(clause);
      if (braceMatch !== null) {
        for (const part of braceMatch[1].split(',')) {
          const cleaned = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
          if (cleaned !== '') named.push(cleaned);
        }
      }
      const defaultMatch = /^\s*([A-Za-z_$][\w$]*)/.exec(clause.replace(/\{[^}]*\}/, ''));
      imports.push({
        from: relPath,
        spec,
        line: lineOf(m.index),
        named,
        defaultName: defaultMatch?.[1],
      });
    }
  }

  // Inheritance.
  const extendsRe = /\bclass[ \t]+([A-Za-z_$][\w$]{0,80})[^{;]{0,300}?\bextends[ \t]+([A-Za-z_$][\w$.]{0,120})/g;
  let em;
  while ((em = extendsRe.exec(code)) !== null) {
    inherits.push({
      from: relPath,
      child: em[1],
      parent: em[2].split('.').pop(),
      line: lineOf(em.index),
      kind: 'extends',
    });
  }
  const implRe = /\bclass[ \t]+([A-Za-z_$][\w$]{0,80})[^{;]{0,300}?\bimplements[ \t]+([^{;\n]{1,200})/g;
  let im;
  while ((im = implRe.exec(code)) !== null) {
    for (const part of im[2].split(',')) {
      const name = part.trim().split('<')[0].split('.').pop();
      if (name === '') continue;
      inherits.push({
        from: relPath,
        child: im[1],
        parent: name,
        line: lineOf(im.index),
        kind: 'implements',
      });
    }
  }

  collectCalls(code, lineOf, relPath, calls, JS_KEYWORDS);
}

/* ------------------------------------------------------------------ *
 * Python                                                             *
 * ------------------------------------------------------------------ */

function scanPython(code, lit, relPath, push, imports, calls, inherits, lineOf) {
  const lines = code.split('\n');
  const classes = []; // { name, indent, line }

  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    const classMatch = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/.exec(trimmed);
    if (classMatch !== null) {
      push(classMatch[1], 'class', offset, { indent });
      if (classMatch[2] !== undefined && classMatch[2].trim() !== '') {
        for (const base of classMatch[2].split(',')) {
          const name = base.trim().split('=')[0].replace(/\[.*$/, '').trim();
          if (name === '' || name === 'object') continue;
          inherits.push({
            from: relPath,
            child: classMatch[1],
            parent: name.split('.').pop(),
            line: index + 1,
            kind: 'extends',
          });
        }
      }
      classes.push({ name: classMatch[1], indent, line: index + 1 });
    }

    const defMatch = /^(?:async\s+)?def\s+(\w+)\s*\(/.exec(trimmed);
    if (defMatch !== null) {
      // The enclosing class is the last one declared at a smaller indent.
      let owner;
      for (let c = classes.length - 1; c >= 0; c -= 1) {
        if (classes[c].indent < indent) {
          owner = classes[c].name;
          break;
        }
      }
      push(defMatch[1], owner === undefined ? 'function' : 'method', offset, {
        ...(owner === undefined ? {} : { container: owner }),
        indent,
      });
    }

    offset += line.length + 1;
  }

  const fromRe = /^[ \t]*from\s+([\w.]+)\s+import\s+(.+)$/gm;
  let fm;
  while ((fm = fromRe.exec(lit)) !== null) {
    const named = fm[2]
      .replace(/[()]/g, '')
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
      .filter((part) => part !== '' && part !== '*');
    imports.push({ from: relPath, spec: fm[1], line: lineOf(fm.index), named });
  }

  const importRe = /^[ \t]*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
  let im;
  while ((im = importRe.exec(lit)) !== null) {
    for (const part of im[1].split(',')) {
      const spec = part.trim();
      if (spec === '') continue;
      imports.push({ from: relPath, spec, line: lineOf(im.index), named: [] });
    }
  }

  collectCalls(code, lineOf, relPath, calls, PY_KEYWORDS, { decorate: true });
}

/* ------------------------------------------------------------------ *
 * Go                                                                 *
 * ------------------------------------------------------------------ */

function scanGo(code, lit, relPath, push, imports, calls, inherits, lineOf) {
  const fnRe = /^func\s+(?:\(\s*\w*\s*\*?(\w+)\s*\)\s*)?(\w+)\s*\(/gm;
  let m;
  while ((m = fnRe.exec(code)) !== null) {
    push(m[2], m[1] === undefined ? 'function' : 'method', m.index, {
      ...(m[1] === undefined ? {} : { container: m[1] }),
    });
  }

  const typeRe = /^type\s+(\w+)\s+(struct|interface)\b/gm;
  while ((m = typeRe.exec(code)) !== null) push(m[1], m[2] === 'struct' ? 'class' : 'interface', m.index);

  const singleImport = /^import\s+"([^"]+)"/gm;
  while ((m = singleImport.exec(lit)) !== null) {
    imports.push({ from: relPath, spec: m[1], line: lineOf(m.index), named: [] });
  }
  const blockImport = /^import[ \t]*\(([\s\S]{0,4000}?)\)/gm;
  while ((m = blockImport.exec(lit)) !== null) {
    const inner = m[1];
    const base = m.index;
    const re = /"([^"]+)"/g;
    let q;
    while ((q = re.exec(inner)) !== null) {
      imports.push({ from: relPath, spec: q[1], line: lineOf(base + q.index), named: [] });
    }
  }

  collectCalls(code, lineOf, relPath, calls, JS_KEYWORDS);
}

/* ------------------------------------------------------------------ *
 * Rust                                                               *
 * ------------------------------------------------------------------ */

function scanRust(code, lit, relPath, push, imports, calls, inherits, lineOf) {
  let m;
  const fnRe = /^[ \t]*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+(\w+)/gm;
  while ((m = fnRe.exec(code)) !== null) push(m[1], 'function', m.index);

  const typeRe = /^[ \t]*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|union)\s+(\w+)/gm;
  while ((m = typeRe.exec(code)) !== null) push(m[1], 'class', m.index);

  const traitRe = /^[ \t]*(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)/gm;
  while ((m = traitRe.exec(code)) !== null) push(m[1], 'interface', m.index);

  const useRe = /^[ \t]*(?:pub\s+)?use\s+([\w:]+)/gm;
  while ((m = useRe.exec(lit)) !== null) {
    imports.push({ from: relPath, spec: m[1], line: lineOf(m.index), named: [] });
  }

  const implTrait = /^[ \t]*impl(?:\s*<[^>]*>)?\s+([\w:]+)\s+for\s+([\w:]+)/gm;
  while ((m = implTrait.exec(code)) !== null) {
    inherits.push({
      from: relPath,
      child: m[2].split('::').pop(),
      parent: m[1].split('::').pop(),
      line: lineOf(m.index),
      kind: 'implements',
    });
  }

  collectCalls(code, lineOf, relPath, calls, JS_KEYWORDS);
}

/* ------------------------------------------------------------------ *
 * Java / C# / C-family                                               *
 * ------------------------------------------------------------------ */

function scanDeclarative(code, lit, relPath, push, imports, calls, inherits, lineOf, language) {
  let m;
  const typeRe = /\b(?:class|interface|enum|record|struct)\s+(\w+)/g;
  const kinds = { interface: 'interface', enum: 'enum', record: 'class', struct: 'class', class: 'class' };
  while ((m = typeRe.exec(code)) !== null) push(m[1], kinds[m[0].split(/\s+/)[0].replace(/^.*\b/, '')] ?? 'class', m.index);

  // Methods need at least one modifier to keep the false-positive rate sane.
  const methodRe = /^[ \t]{0,8}(?:@\w{1,60}(?:\([^)]{0,200}\))?[ \t]{0,4}){0,4}(?:(?:public|private|protected|internal|static|final|abstract|virtual|override|async|sealed|partial|extern|synchronized|native|default)[ \t]+){1,6}[\w<>\[\],.?]{1,120}?[ \t]+(\w{1,80})[ \t]*\([^;{]{0,400}\)[ \t]{0,4}(?:throws[ \t]+[\w,.\s]{1,200})?[ \t]{0,4}\{/gm;
  while ((m = methodRe.exec(code)) !== null) {
    if (JS_KEYWORDS.has(m[1])) continue;
    push(m[1], 'method', m.index);
  }

  const importRe = /\bimport\s+([\w\.\*]+)\s*;/g;
  while ((m = importRe.exec(lit)) !== null) {
    imports.push({ from: relPath, spec: m[1], line: lineOf(m.index), named: [] });
  }
  const usingRe = /\busing\s+([\w\.]+)\s*;/g;
  while ((m = usingRe.exec(lit)) !== null) {
    imports.push({ from: relPath, spec: m[1], line: lineOf(m.index), named: [] });
  }
  const includeRe = /^[ \t]*#include\s+["<]([^">]+)[">]/gm;
  while ((m = includeRe.exec(lit)) !== null) {
    imports.push({ from: relPath, spec: m[1], line: lineOf(m.index), named: [] });
  }

  const extRe = /\b(?:class|interface)[ \t]+(\w{1,80})[^{;]{0,200}?\bextends[ \t]+([\w.<>,\s]{1,200})/g;
  while ((m = extRe.exec(code)) !== null) {
    for (const part of m[2].split(',')) {
      const name = part.trim().split('<')[0].split('.').pop();
      if (name === '' || name === undefined) continue;
      inherits.push({ from: relPath, child: m[1], parent: name, line: lineOf(m.index), kind: 'extends' });
    }
  }
  const implRe = /\b(?:class|interface)[ \t]+(\w{1,80})[^{;]{0,200}?\bimplements[ \t]+([\w.<>,\s]{1,200})/g;
  while ((m = implRe.exec(code)) !== null) {
    for (const part of m[2].split(',')) {
      const name = part.trim().split('<')[0].split('.').pop();
      if (name === '' || name === undefined) continue;
      inherits.push({ from: relPath, child: m[1], parent: name, line: lineOf(m.index), kind: 'implements' });
    }
  }

  collectCalls(code, lineOf, relPath, calls, JS_KEYWORDS);
  void language;
}

/* ------------------------------------------------------------------ *
 * Call sites                                                         *
 * ------------------------------------------------------------------ */

/**
 * Record `name(` occurrences that are not control-flow keywords.
 * @param code - the masked source.
 * @param lineOf - offset → line.
 * @param relPath - file path stamped on each call.
 * @param out - accumulator.
 * @param keywords - the dialect's keyword set.
 * @param options - `decorate`: also capture Python's `@decorator` form.
 */
function collectCalls(code, lineOf, relPath, out, keywords, options = {}) {
  const re = /([A-Za-z_$][\w$]{0,80})[ \t]{0,4}(?:<[^<>()\n]{0,60}>)?[ \t]{0,4}\(/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    if (keywords.has(name)) continue;
    // Skip the declaration keyword itself (`function foo(`, `def foo(`).
    const before = code.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:function|def|fn|func)\s*$/.test(before)) continue;
    const chained = m.index > 0 && code[m.index - 1] === '.';
    out.push({ from: relPath, name, line: lineOf(m.index), chained });
  }

  if (options.decorate === true) {
    const dec = /^[ \t]*@([\w.]+)/gm;
    let d;
    while ((d = dec.exec(code)) !== null) {
      out.push({ from: relPath, name: d[1].split('.').pop(), line: lineOf(d.index), chained: false });
    }
  }
}

/** True when `text` looks like minified or generated output not worth indexing. */
export function looksGenerated(text) {
  if (text.length === 0) return true;
  const lines = text.split('\n');
  if (lines.length === 0) return true;
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return longest > 4000;
}

void braceAt;
