// Scratch: prove the persisted document survives a JSON round trip with every
// derived lookup rebuilt. A cache that loads but answers nothing is the failure
// mode this file exists to catch.
//
//   node dev/cache-probe.mjs [root]
import { buildDocument, CONFIG_DEFAULTS, apiMethods } from '../index.js';
import { saveIndex, loadIndex, clearIndex } from '../lib/store.js';
import { fromPersisted, toPersisted } from '../lib/persist.js';
import { searchRecords } from '../lib/retrieval.js';
import { searchDefinitions, definitionsByName, rebuildSymbolIndex } from '../lib/resolve.js';

const root = process.argv[2] ?? 'D:/dsh-CodeSlice';
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

await clearIndex(root);

// --- build and persist ---------------------------------------------------
const built = await buildDocument(root, CONFIG_DEFAULTS);
const persisted = toPersisted(built);

const serialized = JSON.stringify(persisted);
record('persisted document is JSON-serialisable', typeof serialized === 'string', `${Math.round(serialized.length / 1024)} KB`);

// The two structures that must NOT survive as themselves.
record('persisted document carries no live symbol index', persisted.index === undefined);
record('persisted document carries no postings map', persisted.chunks?.postings === undefined);

await saveIndex(root, persisted);

// --- load and rebuild ----------------------------------------------------
const loaded = await loadIndex(root, { maxAgeMs: 10 * 60 * 1000 });
record('loadIndex returns the saved document', loaded !== undefined);
const document = fromPersisted(loaded.document);

record('symbol index rebuilt as Maps', document.index?.byNode instanceof Map);
record('symbol index has definitions', (document.index?.defs?.length ?? 0) > 0, `${document.index?.defs?.length} defs`);
record('symbol index has references', (document.index?.refs?.length ?? 0) > 0, `${document.index?.refs?.length} refs`);

// --- the four operations that read the rebuilt index ---------------------
// Pick a real declaration: `defs` also contains file nodes, and asking for a
// file node by *name* is supposed to return nothing (a file is not a symbol).
const sampleDef = document.index.defs.find((row) => row.kind === 'function' || row.kind === 'class');
record('definitionsByName works after load', definitionsByName(document.index, sampleDef.label).length > 0, sampleDef.label);

const searched = searchDefinitions(document.index, 'a', 5);
record('searchDefinitions works after load', searched.length > 0, `${searched.length} rows`);

const records = searchRecords(document.chunks, 'function', 3);
record('searchRecords works after load', records.length > 0, `${records.length} rows`);

const firstRef = document.index.refs.find((ref) => typeof ref.fromPath === 'string' && ref.fromPath !== '');
record('refs carry a source path after load', firstRef !== undefined, firstRef?.fromPath ?? '');

// --- the API surface must agree with the fresh build ---------------------
const methods = apiMethods({ config: CONFIG_DEFAULTS, defaultDir: root });
const loadedStatus = await methods.status({ root });
record('status on a loaded document reports counts', (loadedStatus.nodes ?? 0) > 0,
  `nodes=${loadedStatus.nodes} edges=${loadedStatus.edges}`);
record('status reports the same node count as the build', loadedStatus.nodes === built.nodes.length);

const slice = await methods.graph({ root, scope: 'workspace', limit: 100 });
record('graph slice on a loaded document has links', (slice.links ?? []).length > 0, `${(slice.links ?? []).length} links`);

const found = await methods.search({ root, query: 'function', limit: 5 });
record('search on a loaded document returns records', (found.records ?? []).length > 0);

// --- a second load must be byte-stable ----------------------------------
const again = fromPersisted((await loadIndex(root, { maxAgeMs: 10 * 60 * 1000 })).document);
record('a second load yields the same node count', again.nodes.length === document.nodes.length);
record('a second load rebuilds the index again', again.index?.byNode instanceof Map);

// --- rebuildSymbolIndex is idempotent ------------------------------------
const a = rebuildSymbolIndex(document.nodes, document.refs);
const b = rebuildSymbolIndex(document.nodes, document.refs);
record('rebuildSymbolIndex is deterministic', a.defs.length === b.defs.length && a.refs.length === b.refs.length,
  `${a.defs.length} defs / ${a.refs.length} refs`);

console.log(`\n${results.filter((row) => row.ok).length}/${results.length} cache probes passed`);
process.exit(results.some((row) => !row.ok) ? 1 : 0);
