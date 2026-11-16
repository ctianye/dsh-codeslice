// Scratch: end-to-end workflow probe — note lifecycle, anchor drift, annotation
// drift, and export. Exercises the paths a reader actually uses, not just the
// route shapes.
//
//   node dev/workflow-probe.mjs [root]
import { promises as fs } from 'node:fs';
import { apiMethods, CONFIG_DEFAULTS } from '../index.js';
import { statePath } from '../lib/store.js';

const root = process.argv[2] ?? 'D:/dsh-CodeSlice';
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

const methods = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: root });

// Start from a clean note store so the probe is repeatable.
await fs.rm(statePath(root, 'notes'), { force: true });

/* ---- 1. a note about real code, created from a citation ---------------- */
const target = await methods.outline({ root, path: 'plugin/lib/model.js' });
const symbol = target.symbols[0];
record('found a real symbol to cite', symbol !== undefined, symbol?.name);

const created = await methods.notes({
  root,
  op: 'create',
  title: '为什么节点 id 里带行号',
  body: '',
  source: 'makeNodeId 把行号放进 id，所以同名方法在同一文件里不会合并成一个节点。',
  codeRefs: [{ path: 'plugin/lib/model.js', line: symbol.line, endLine: symbol.endLine, symbol: symbol.name }],
});
const note = created.note;
record('note created', typeof note?.id === 'string');
record('note body has the four fixed headings', ['## 知识点', '## 关联代码', '## 要点', '## 何时使用']
  .every((heading) => note.body.includes(heading)));
record('note cites the code', (note.codeRefs ?? []).length === 1);
record('note anchor starts fresh', note.anchors?.[0]?.status === 'fresh', note.anchors?.[0]?.status);

/* ---- 2. the citation is real: the anchored range has content ---------- */
const read = await methods.notes({ root, op: 'read', id: note.id });
record('reading the note re-checks its anchor', read.note.anchors[0].status === 'fresh');

/* ---- 3. a note whose file does not exist reports drift, not a crash ---- */
const orphan = await methods.notes({
  root,
  op: 'create',
  title: '引用了不存在的文件',
  body: '',
  source: '这一条故意引用一个不存在的路径。',
  codeRefs: [{ path: 'plugin/lib/does-not-exist.js', line: 1, endLine: 2, symbol: 'ghost' }],
});
record('orphan note created', typeof orphan.note?.id === 'string');
const orphanRead = await methods.notes({ root, op: 'read', id: orphan.note.id });
record('orphan anchor reports missing', orphanRead.note.anchors[0].status === 'missing', orphanRead.note.anchors[0].status);
record('orphan note still renders its code section', orphanRead.note.body.includes('（引用位置的内容已读取不到'));

/* ---- 4. folder tree and note counts ----------------------------------- */
const folder = await methods.notes({ root, op: 'createFolder', name: '图谱设计' });
record('folder created', typeof folder.folder?.id === 'string');
await methods.notes({ root, op: 'update', id: note.id, folderId: folder.folder.id });
const listed = await methods.notes({ root, op: 'list' });
const stored = listed.folders.find((row) => row.id === folder.folder.id);
record('folder reports its direct note count', stored?.noteCount === 1, String(stored?.noteCount));

/* ---- 5. the notes graph connects notes by shared code ---------------- */
const second = await methods.notes({
  root,
  op: 'create',
  title: '同一处代码的第二条笔记',
  body: '',
  source: '两条笔记引用同一行，应该在笔记图里相连。',
  codeRefs: [{ path: 'plugin/lib/model.js', line: symbol.line, endLine: symbol.endLine, symbol: symbol.name }],
});
const graph = await methods.notes({ root, op: 'graph' });
const linked = (graph.links ?? []).some((link) => (link.source === `note://${note.id}` && link.target === `note://${second.note.id}`)
  || (link.source === `note://${second.note.id}` && link.target === `note://${note.id}`));
record('notes graph links notes sharing a reference', linked, `${graph.nodes.length} nodes / ${graph.links.length} links`);

/* ---- 6. export writes a Markdown file --------------------------------- */
const exported = await methods.notes({ root, op: 'export', id: note.id });
const exportedText = await fs.readFile(exported.path, 'utf8').catch(() => '');
record('export wrote a file', exportedText.length > 0, exported.path);
record('exported file is the note body', exportedText.includes('## 知识点'));

/* ---- 7. annotation lifecycle and drift -------------------------------- */
const annotation = await methods.annotations({
  root, op: 'create', path: 'plugin/lib/model.js', startLine: 1, endLine: 4,
  title: '词汇表开头', body: '这一段定义了整个插件的命名。',
});
record('annotation created', annotation.annotation?.drift?.status === 'fresh', annotation.annotation?.drift?.status);

const annotationList = await methods.annotations({ root, op: 'list', path: 'plugin/lib/model.js' });
record('annotation listed with drift', (annotationList.annotations ?? []).length === 1);

await methods.annotations({ root, op: 'update', id: annotation.annotation.id, body: '改过的批注。' });
const updatedList = await methods.annotations({ root, op: 'list', path: 'plugin/lib/model.js' });
record('annotation update persisted', updatedList.annotations[0].body === '改过的批注。');

await methods.annotations({ root, op: 'delete', id: annotation.annotation.id });
const afterDelete = await methods.annotations({ root, op: 'list', path: 'plugin/lib/model.js' });
record('annotation delete persisted', (afterDelete.annotations ?? []).length === 0);

/* ---- 8. deleting a note removes its anchors --------------------------- */
await methods.notes({ root, op: 'delete', id: note.id });
const afterNoteDelete = await methods.notes({ root, op: 'read', id: note.id }).catch((error) => ({ error: error.message }));
record('deleted note is gone', /note not found/u.test(afterNoteDelete.error ?? ''));

/* ---- cleanup ---------------------------------------------------------- */
await fs.rm(statePath(root, 'notes'), { force: true });
await fs.rm(exported.path, { force: true });

console.log(`\n${results.filter((row) => row.ok).length}/${results.length} workflow probes passed`);
process.exit(results.some((row) => !row.ok) ? 1 : 0);
