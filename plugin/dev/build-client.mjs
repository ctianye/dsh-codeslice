// Bundle the authored ES modules under `client/src/` into the single
// `window.__ModuleLoader__.load({...})` file a DSH web plugin must be.
//
//   node dev/build-client.mjs            # write plugin/client.js
//   node dev/build-client.mjs --check    # exit 1 if the committed file is stale
//
// Why a build step at all: `__ModuleLoader__` resolves only the shell instance
// and other *registered* modules, so a plugin cannot `require` its own
// sub-files at runtime. The authored sources are real ES modules with real
// imports; this script performs a deterministic inline concatenation — modules
// in dependency order, `import`/`export` statements elided, imported names
// resolved to the top-level bindings of the module that exports them.
//
// It is deliberately NOT a full bundler: no transforms, no minification, no
// source maps, no tree shaking. Every module body is emitted verbatim, so a
// stack trace and a source line stay one line apart. The only rewriting is:
//   - `import ... from './x.js'`  → elided (bindings already in scope)
//   - `import ... from 'react'`   → elided (the factory owns `React`)
//   - `export function f`         → `function f`
//   - `export const|let|class x`  → `const|let|class x`
//   - `export { a, b }`           → elided
//   - `export default X`          → elided, recorded as the module's default
//
// Any import that cannot be resolved is a hard error, because a silently
// missing binding produces a plugin that mounts and then throws on first use.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, '..');
const sourceDir = join(pluginDir, 'client', 'src');
const outputFile = join(pluginDir, 'client.js');

const PACKAGE_ID = 'dsh-codeslice';
const ENTRY = 'index.js';

/**
 * The React binding module is *virtual*: its exports are supplied by the factory
 * prelude, so its body is never emitted and its imports resolve to nothing.
 *
 * Without this, the emitted bundle would contain the shim's own
 * `const h = React.createElement` and collide with the prelude's identical
 * binding — a `SyntaxError: Identifier 'h' has already been declared`, in the one
 * module layer where a duplicate top-level name is fatal.
 */
const VIRTUAL_MODULES = new Set(['react.js']);

/**
 * Read every module once.
 *
 * Sub-directories are part of the graph too: the sidebar reader, the session
 * graph view and the workbench are their own areas, and keeping one area per
 * directory is what stops three parallel features from editing one file. A
 * module's key is its POSIX path relative to `client/src` (`sidebar/reader.js`),
 * which is exactly the string a sibling's `./reader.js` or `../api.js` resolves
 * against.
 * @returns a map of module key → source text.
 */
function readModules() {
  const modules = new Map();
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const key = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full, key);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      modules.set(key, readFileSync(full, 'utf8'));
    }
  };
  walk(sourceDir, '');
  return new Map([...modules.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Split one module into its imports and its body.
 * @param name - module file name.
 * @param source - its text.
 * @returns `{ imports, body, exports }`.
 */
function parseModule(name, source) {
  const imports = [];
  const exports = [];
  let body = source;

  // Static imports, possibly multi-line, with or without a named list.
  body = body.replace(
    /^import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gmu,
    (whole, clause, specifier) => {
      imports.push({ clause: (clause ?? '').trim(), specifier });
      // Keep the line count stable so a stack trace still points at the right
      // line in the authored file.
      return whole.replace(/[^\n]/gu, '');
    },
  );

  // `export { a, b as c }` — an explicit list. Recorded before the declaration
  // rewrite below, because that rewrite removes the keyword this pattern needs.
  body = body.replace(/^export\s+\{([^}]*)\};?[ \t]*$/gmu, (whole, list) => {
    for (const piece of list.split(',')) {
      const trimmed = piece.trim();
      if (trimmed === '') continue;
      const [local, alias] = trimmed.split(/\s+as\s+/u);
      exports.push({ local: local.trim(), exported: (alias ?? local).trim() });
    }
    return whole.replace(/[^\n]/gu, '');
  });

  body = body.replace(/^export\s+default\s+/gmu, 'const __default__ = ');

  // `export function f`, `export const x`, `export class C` — record the declared
  // name, then drop the keyword. Without recording here, an `import { f }` of a
  // declaration-shaped export looks unsatisfiable and the build fails on a module
  // that is perfectly correct.
  body = body.replace(
    /^(\s*)export\s+(async\s+function\*?|function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gmu,
    (whole, indent, keyword, declared) => {
      exports.push({ local: declared, exported: declared });
      return `${indent}${keyword} ${declared}`;
    },
  );

  return { imports, body, exports };
}

/** Normalise `./x.js` → `x.js` (the module's own key). */
function resolveSpecifier(fromName, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = posix.normalize(posix.join(posix.dirname(fromName), specifier));
  return resolved.startsWith('..') ? undefined : resolved;
}

/**
 * The exported names a module makes available to its importers.
 *
 * A virtual module's exports come from the factory prelude, so they are read
 * from the shim's own source (which is the single declaration of that shape)
 * rather than from the elided body.
 * @param name - module file name.
 * @param parsed - the parse result for that module.
 * @returns the exported names.
 */
function exportedNames(name, parsed) {
  return new Set((parsed.get(name)?.exports ?? []).map((row) => row.exported));
}

/** Topological order with a cycle guard that reports the cycle rather than hanging. */
function orderModules(modules, parsed) {
  const order = [];
  const state = new Map();

  const visit = (name, trail) => {
    const status = state.get(name);
    if (status === 'done') return;
    if (status === 'visiting') {
      throw new Error(`client build: import cycle ${[...trail, name].join(' → ')}`);
    }
    state.set(name, 'visiting');
    for (const entry of parsed.get(name).imports) {
      const target = resolveSpecifier(name, entry.specifier);
      if (target === undefined) {
        if (entry.specifier === 'react') continue;
        throw new Error(`client build: ${name} imports "${entry.specifier}", which is neither a local module nor the react shim`);
      }
      if (!modules.has(target)) {
        throw new Error(`client build: ${name} imports missing module "${target}"`);
      }
      visit(target, [...trail, name]);
    }
    state.set(name, 'done');
    order.push(name);
  };

  for (const name of modules.keys()) visit(name, []);
  return order;
}

/**
 * Verify that every imported binding is exported by the module it came from.
 *
 * This is the check that turns "the plugin mounts and throws on first render"
 * into a build error.
 * @param modules - module map.
 * @param parsed - parse results.
 * @param order - topological order.
 */
function verifyBindings(modules, parsed, order) {
  const problems = [];
  for (const name of order) {
    for (const entry of parsed.get(name).imports) {
      const target = resolveSpecifier(name, entry.specifier);
      if (target === undefined) continue; // the react shim
      const exported = new Set(parsed.get(target).exports.map((row) => row.exported));
      const clause = entry.clause;
      if (clause === '') continue; // side-effect import
      const named = /\{([^}]*)\}/u.exec(clause);
      if (named !== null) {
        for (const piece of named[1].split(',')) {
          const trimmed = piece.trim();
          if (trimmed === '') continue;
          const imported = trimmed.split(/\s+as\s+/u)[0].trim();
          if (!exported.has(imported)) {
            problems.push(`${name} imports {${imported}} from ${target}, which does not export it`);
          }
        }
      }
      const defaultImport = clause.replace(/\{[^}]*\}/u, '').replace(/,/gu, '').replace(/\*\s+as\s+\S+/u, '').trim();
      if (defaultImport !== '' && defaultImport !== '*') {
        if (!exported.has('default')) {
          problems.push(`${name} default-imports from ${target}, which has no default export`);
        }
      }
      if (/\*\s+as\s+/u.test(clause) && !exported.has('*')) {
        // A namespace import is satisfied by the module object; nothing to verify
        // beyond the module existing, which orderModules already did.
        continue;
      }
    }
  }
  if (problems.length > 0) throw new Error(`client build:\n  ${problems.join('\n  ')}`);
}

/**
 * Collect each module's top-level declared names.
 *
 * The emitted factory body is ONE JavaScript scope, so two modules declaring the
 * same top-level `const`/`let`/`class`/`function` is a load-time SyntaxError. That
 * is the documented invariant in DESIGN §3 and until now nothing enforced it: a
 * silent duplicate `function` happened to be legal (last wins) which made the
 * hazard invisible until the same collision occurred with a `const`.
 * @param body - the module body after the export rewrite.
 * @returns `[{ kind, name }]`.
 */
function topLevelDeclarations(body) {
  const out = [];
  const seen = new Set();
  // Top-level means column 0 — the modules are authored with two-space
  // indentation inside functions, so an indented declaration is not a scope
  // collision. The terminator matters too: `const en = {` (an object literal
  // continued on later lines) and `const x = 1;` are both declarations, but a
  // property line like `  en: {` inside a literal must never match — it starts
  // with whitespace, which the `^` anchor already rejects.
  const patterns = [
    [/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?:=|;)/gmu, 'binding'],
    [/^(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\s*\(/gmu, 'function'],
    [/^class\s+([A-Za-z_$][\w$]*)\s*(?:extends\b|\{)/gmu, 'class'],
  ];
  for (const [pattern, kind] of patterns) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      out.push({ kind, name: match[1] });
    }
  }
  // `const a = 1, b = 2;` declares `b` as well.
  const multi = /^(?:const|let|var)\s+([^;\n]+);/gmu;
  let match;
  while ((match = multi.exec(body)) !== null) {
    // Only a comma at depth 0 separates declarators; `{a: 1, b: 2}` does not.
    let depth = 0;
    let current = '';
    const pieces = [];
    for (const char of match[1]) {
      if (char === '{' || char === '[' || char === '(') depth += 1;
      else if (char === '}' || char === ']' || char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        pieces.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    pieces.push(current);
    for (const piece of pieces.slice(1)) {
      const name = /^\s*([A-Za-z_$][\w$]*)\s*=/u.exec(piece);
      if (name === null || seen.has(name[1])) continue;
      seen.add(name[1]);
      out.push({ kind: 'binding', name: name[1] });
    }
  }
  return out;
}

/**
 * Reject two modules that declare the same top-level name.
 *
 * A repeated `const`/`let`/`class` is a load-time `SyntaxError` and must fail the
 * build. A repeated `function` declaration is legal (the later one wins) and the
 * modules are only concatenated, so it does not break anything — but it is still
 * worth surfacing, because the same authoring mistake with a `const` is what
 * actually breaks the bundle. Fatal and advisory are reported separately so a
 * harmless duplicate cannot mask a real one.
 * @param parsed - parse results per module.
 * @param order - emission order.
 */
function verifyUniqueBindings(parsed, order) {
  const owners = new Map();
  const fatal = [];
  const advisory = [];

  for (const name of order) {
    if (VIRTUAL_MODULES.has(name)) continue;
    for (const declared of topLevelDeclarations(parsed.get(name).body)) {
      const prior = owners.get(declared.name);
      if (prior === undefined) {
        owners.set(declared.name, { module: name, kind: declared.kind });
        continue;
      }
      const record = { name: declared.name, kind: declared.kind, first: prior.module, second: name };
      // Two function declarations are the only legal repetition in one scope.
      if (declared.kind === 'function' && prior.kind === 'function') advisory.push(record);
      else fatal.push(record);
    }
  }

  for (const row of advisory) {
    console.warn(
      `client build: warning — ${row.name}() is declared in both ${row.first} and ${row.second}; `
      + 'legal (the later wins) but only one is reachable.',
    );
  }

  if (fatal.length === 0) return;
  const detail = fatal
    .map((row) => `${row.name} (${row.kind}) declared in both ${row.first} and ${row.second}`)
    .join('\n  ');
  throw new Error(
    'client build: duplicate top-level binding in the single factory scope —\n  '
    + `${detail}\n  Rename one, or move it inside the function that uses it.`,
  );
}

/** Assemble the bundle text. */
function emit(modules, parsed, order) {
  const chunks = [];
  chunks.push('window.__ModuleLoader__.load({');
  chunks.push(`  id: ${JSON.stringify(PACKAGE_ID)},`);
  chunks.push('  factory(require) {');
  // `React` and nothing else: the authored modules bind `h` and the hooks once,
  // in `icons.js`, which has no imports and therefore always emits first. A
  // prelude here would be a second declaration of every one of them, and the
  // bundle is a single scope — that is a load-time SyntaxError, not a warning.
  chunks.push('    const React = require(\'react\');');
  chunks.push('');

  for (const name of order) {
    const mod = parsed.get(name);
    chunks.push('    /* ================================================================ *');
    chunks.push(`     * ${name}`);
    chunks.push('     * ================================================================ */');
    // Emit the body with a stable two-space tail so the emitted indent matches
    // the rest of the bundle. Line-count stability inside a module is preserved
    // by the elision step above, so authored line N is emitted line N+offset.
    const lines = mod.body.replace(/\s+$/u, '').split('\n');
    for (const line of lines) chunks.push(line === '' ? '' : `    ${line}`);
    if (mod.exports.some((row) => row.exported === 'default')) {
      chunks.push(`    const ${name.replace(/\.js$/u, '')}__default = __default__;`);
    }
    chunks.push('');
  }

  chunks.push('    return {');
  // Cordis hides every service a plugin did not declare — an undeclared
  // `ctx.get(...)` reads as `undefined` and `ctx.inject` never fires. The
  // reader registers on DSH's OWN right Sidebar (`ctx.sidebarRight`), not the
  // optional better-sidebar plugin: the native surface is what the desktop
  // profile actually mounts.
  chunks.push('      inject: [\'slots\', \'sessions\', \'sidebarRight\', \'sidebarRightTabs\'],');
  chunks.push('      apply(ctx) { return __apply(ctx); },');
  chunks.push('    };');
  chunks.push('  },');
  chunks.push('});');
  return `${chunks.join('\n')}\n`;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const modules = readModules();
  if (modules.size === 0) throw new Error(`client build: no modules under ${sourceDir}`);
  if (!modules.has(ENTRY)) throw new Error(`client build: ${ENTRY} is missing`);

  const parsed = new Map();
  for (const [name, source] of modules) parsed.set(name, parseModule(name, source));
  const order = orderModules(modules, parsed);
  verifyBindings(modules, parsed, order);
  verifyUniqueBindings(parsed, order);

  // The entry's `apply` is what the module loader calls; rename it on the way
  // out so no other module can shadow it.
  const entry = parsed.get(ENTRY);
  entry.body = entry.body.replace(/^(\s*)function apply\s*\(/gmu, '$1function __apply(')
    .replace(/^(\s*)const apply\s*=/gmu, '$1const __apply =');

  const bundle = emit(modules, parsed, order);
  const existing = (() => {
    try {
      return readFileSync(outputFile, 'utf8');
    } catch {
      return '';
    }
  })();

  if (checkOnly) {
    // Compile the factory body as well as compare it: a source change that breaks
    // the bundle would otherwise pass this gate as long as `client.js` had been
    // regenerated from that broken source.
    try {
      // eslint-disable-next-line no-new-func
      new Function(bundle);
    } catch (error) {
      console.error(`client build: client.js does not compile — ${error.message}`);
      process.exit(1);
    }
    if (existing !== bundle) {
      console.error('client build: client.js is stale — run `node dev/build-client.mjs`');
      process.exit(1);
    }
    console.log(`client build: client.js is current and compiles (${order.length} modules, ${bundle.split('\n').length} lines)`);
    return;
  }

  writeFileSync(outputFile, bundle, 'utf8');
  const bytes = Buffer.byteLength(bundle);
  console.log(`client build: wrote client.js (${order.length} modules, ${bundle.split('\n').length} lines, ${bytes} bytes)`);
  console.log(`  order: ${order.join(' → ')}`);
}

main();
