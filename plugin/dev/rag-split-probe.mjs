// Fixed chunking, the desktop's way.
//
// RAG cut spans are an index identity, not a preference: this probe pins the
// desktop's constants (60-line bands, 220-line / 8000-char structural cap) and
// proves that a settings-shaped third argument cannot change the result.
//
//   node dev/rag-split-probe.mjs
import {
  buildChunkIndex, CHUNKER, FALLBACK_LINES, MAX_CHUNK_LINES, MAX_CHUNK_CHARS,
} from '../lib/retrieval.js';

let passed = 0;
let failed = 0;

const check = (ok, label, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
};

// 120 pure-comment lines: no declarations, so the whole file is banded.
const banded = Array.from({ length: 120 }, (_, i) => `// filler line ${i + 1}`).join('\n');

// A 10-line function plus filler: structural chunking must keep the function as
// one chunk.
const structured = [
  'function small() {',
  '  return 1;',
  '}',
  ...Array.from({ length: 8 }, (_, i) => `// tail ${i + 1}`),
].join('\n');

const files = [
  { path: 'a/only-comments.js', language: 'javascript', source: banded },
  { path: 'a/small.mjs', language: 'javascript', source: structured },
];

const nodes = [{
  id: 'a/small.mjs::function::small::1',
  kind: 'function',
  label: 'small',
  path: 'a/small.mjs',
  start_line: 1,
  end_line: 3,
  parent: null,
}];

console.log('rag split probe\n');

/* ---- 1. the constants are the desktop's ----------------------------- */

check(FALLBACK_LINES === 60, 'FALLBACK_LINES is 60', String(FALLBACK_LINES));
check(MAX_CHUNK_LINES === 220, 'MAX_CHUNK_LINES is 220', String(MAX_CHUNK_LINES));
check(MAX_CHUNK_CHARS === 8000, 'MAX_CHUNK_CHARS is 8000', String(MAX_CHUNK_CHARS));
check(CHUNKER.fallbackLines === 60 && CHUNKER.maxChunkLines === 220 && CHUNKER.maxChunkChars === 8000,
  'CHUNKER exposes the same fixed triple');

/* ---- 2. the fixed band tiles the file ------------------------------- */

const index = buildChunkIndex(files, nodes);
const bands = index.chunks
  .filter((chunk) => chunk.path === 'a/only-comments.js')
  .sort((a, b) => a.start_line - b.start_line);

check(bands.length === 2, '120 lines at the fixed 60-line band → 2 chunks', `${bands.length}`);
check(bands[0]?.start_line === 1 && bands[0]?.end_line === 60, 'the first band is 1–60');
check(bands[1]?.start_line === 61 && bands[1]?.end_line === 120, 'the second band is 61–120');
check(bands.every((chunk, i) => i === 0 || chunk.start_line === bands[i - 1].end_line + 1),
  'the bands tile the file with no gap and no overlap');
check(bands.every((chunk) => Number.isInteger(chunk.start_line) && Number.isInteger(chunk.end_line)
  && chunk.start_line >= 1 && chunk.end_line >= chunk.start_line), 'every chunk has a usable 1-based span');

/* ---- 3. structural chunking still wins ------------------------------ */

const structural = index.chunks.filter((chunk) => chunk.path === 'a/small.mjs' && chunk.kind === 'function');
check(structural.length === 1, 'a 3-line function stays one chunk', `${structural.length}`);
check(structural[0]?.symbol === 'small', 'the structural chunk carries its symbol name');
check(structural[0]?.hash?.length === 64, 'every chunk carries a sha256 content hash');

/* ---- 4. a settings-shaped argument cannot change the cut ------------- */

const attempted = buildChunkIndex(files, nodes, {
  chunkLines: 20, maxChunkLines: 20, maxChunkChars: 100,
});
const attemptedBands = attempted.chunks.filter((chunk) => chunk.path === 'a/only-comments.js').length;
check(attemptedBands === 2, 'a chunkLines-shaped extra argument is ignored', `${attemptedBands}`);

console.log(`\n=== summary ===\n  ${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
