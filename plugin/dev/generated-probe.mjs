// Scratch: verify `looksGenerated` keeps hand-written files with one long string,
// while still rejecting genuinely minified bundles.
import { looksGenerated } from '../lib/analyzer.js';

const cases = [
  ['a real module with one long SQL string', [
    'const QUERY = \'SELECT a, b, c FROM t WHERE a = 1 AND b = 2 -- ' + 'x'.repeat(1700) + '\';',
    '',
    'export function run(db) {',
    '  return db.all(QUERY);',
    '}',
    '',
    'export function other() {',
    '  return 1;',
    '}',
  ].join('\n'), false],

  ['a real module with one long template', [
    'const HTML = `',
    '<div>' + 'y'.repeat(1800) + '</div>',
    '`;',
    '',
    'export function render() { return HTML; }',
    'export const NAME = "x";',
    '',
    '// a normal comment',
    'export const OTHER = 2;',
  ].join('\n'), false],

  ['a minified bundle: mostly enormous lines', [
    'var a=1;' .repeat(400),
    'var b=2;'.repeat(400),
    'var c=3;'.repeat(400),
    'var d=4;'.repeat(400),
  ].join('\n'), true],

  ['a single-line minified blob', `var x=${'1,'.repeat(4000)}1;`, true],

  ['normal source', 'export function a() {\n  return 1;\n}\n', false],
  ['empty file', '', true],
];

let failures = 0;
for (const [name, text, expected] of cases) {
  const actual = looksGenerated(text);
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: looksGenerated=${actual} expected=${expected}`);
}

console.log(`\n${cases.length - failures}/${cases.length} looksGenerated cases passed`);
process.exit(failures === 0 ? 0 : 1);
