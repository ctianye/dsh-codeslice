/**
 * `ask`: retrieval, context assembly, and one streamed model call.
 *
 * `WIRE-CHAT.md §13` fixes two things this module must not get creative about:
 *
 * 1. **The four context stages, in this order.** The order *is* the contract,
 *    because it encodes a priority claim: the reader's own selection outranks the
 *    graph, the graph outranks the note library, and retrieved chunks come last.
 *    A model that reads retrieved chunks before the selection it was asked about
 *    drifts to the most textually similar code instead of the code in front of the
 *    reader, which is the failure this ordering exists to prevent.
 * 2. **Citations are extracted, never invented.** The model's prose is scanned for
 *    `path:start-end` references, and each one is kept only when it corresponds to
 *    a row that retrieval actually produced. A model that names a line range it
 *    never saw is dropped, not recorded — a note can therefore never cite code
 *    that was not retrieved.
 *
 * Everything here is a plain function over plain data. The streaming half takes an
 * `llm` handle by argument rather than reaching for a Cordis context, which is what
 * lets `dev/chat-probe.mjs` drive the whole pipeline with a fake generator.
 */

import { loadNotes } from './store.js';
import { RELATION_FAMILY } from './model.js';
import {
  expand, nodeContext, pickSeeds, renderSubgraphText, scoreNodes,
} from './query.js';
import { searchRecords, rrfFuse } from './retrieval.js';
import { retrieveVectorRows } from './vectors.js';
import { readRange, snippetHash } from './notes.js';
import { retrievalRow } from './chat.js';
import { effectiveRagConfig } from './rag.js';
import { DEFAULT_QA_PROMPT, DEFAULT_SYSTEM_PROMPT, effectivePrompts } from './prompts.js';

/* ------------------------------------------------------------------ *
 * Bounds                                                             *
 * ------------------------------------------------------------------ */

/**
 * Output budget for one answer.
 *
 * Not a contract number. 2 048 tokens is roughly a page and a half of explanation,
 * which is the length a reading answer wants; a reasoning model that spends the
 * budget on hidden reasoning still leaves visible text because the stream reports
 * both, and the finish reason is surfaced rather than hidden when it does not.
 */
export const ASK_MAX_TOKENS = 2048;

/** How many retrieved rows are rendered into the prompt. */
export const CONTEXT_CHUNK_LIMIT = 8;

/** How many notes the knowledge-base stage contributes (`§13`: capped at 3). */
export const CONTEXT_NOTE_LIMIT = 3;

/** How many citations one answer may record. */
export const MAX_CITATIONS = 8;

/** Character budget for the retrieved-chunk block of the prompt. */
export const CONTEXT_BUDGET_CHARS = 12000;

/** Lines of the enclosing symbol added by `useContext: true`. */
export const ENCLOSING_SYMBOL_LINES = 200;

/* ------------------------------------------------------------------ *
 * The LLM service                                                    *
 * ------------------------------------------------------------------ */

/**
 * The streamed-call handle, or a described failure.
 *
 * `ctx.get('llm')` is absent in a trimmed profile — that is a supported
 * deployment, not a bug — so it produces a sentence a reader can act on instead of
 * an uncaught `TypeError` halfway through an event stream. The caller turns this
 * into the terminal `error` frame.
 *
 * @param ctx - the Cordis context, or anything with `get`.
 * @returns `{ ok: true, llm, route }` or `{ ok: false, message, code }`.
 */
export function resolveLlm(ctx) {
  const get = typeof ctx?.get === 'function' ? (name) => ctx.get(name) : () => undefined;
  let llm;
  try {
    llm = get('llm');
  } catch {
    llm = undefined;
  }
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    return {
      ok: false,
      code: 'llm-unavailable',
      message: 'this profile has no LLM service, so CodeSlice cannot answer questions; the graph, search, notes and code APIs still work',
    };
  }

  let selection;
  try {
    selection = get('agentDefaultModel')?.currentSelection?.();
  } catch {
    selection = undefined;
  }
  const provider = typeof selection?.provider === 'string' ? selection.provider : '';
  const model = typeof selection?.model === 'string' ? selection.model : '';
  if (provider === '' || model === '') {
    return {
      ok: false,
      code: 'no-model',
      message: 'no default model is configured for this session; choose a model and ask again',
    };
  }
  return {
    ok: true,
    llm,
    route: {
      provider,
      model,
      ...(selection?.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Prompt                                                             *
 * ------------------------------------------------------------------ */

/**
 * The system prompt.
 *
 * Two jobs, and the second one is the reason this is not a one-liner: the model
 * must cite by `path:start-end` (that is the only way the Host can *extract*
 * citations instead of trusting them), and it must treat the pasted code and notes
 * as material rather than as instructions — a note body is user data that may
 * contain anything, including text shaped like a prompt.
 *
 * @param options - `{ mode, path, startLine, endLine, allowGraph }`.
 * @returns the prompt text.
 */
export function systemPrompt(options = {}) {
  const mode = options.mode === 'snippet' ? 'snippet' : 'project';
  // The desktop assembles three parts: the reading-assistant persona, the QA
  // rules, and the mode-specific context. The plugin must not collapse the first
  // two into one configurable slot again: `system` and `qa` are separately
  // editable in Settings.
  const system = typeof options.system === 'string' && options.system.trim() !== ''
    ? options.system.trim()
    : DEFAULT_SYSTEM_PROMPT.trim();
  const qa = typeof options.qa === 'string' && options.qa.trim() !== ''
    ? options.qa.trim()
    : (typeof options.base === 'string' && options.base.trim() !== ''
      ? options.base.trim()
      : DEFAULT_QA_PROMPT.trim());
  const lines = [system, '', qa];
  if (mode === 'snippet') {
    lines.push('', '这次提问针对用户在代码面板中选中的代码片段，回答要以它为中心。');
    if (options.useContext === true) {
      lines.push('可以联系整个项目的调用方、被调用方、图谱邻居与相关笔记来补充说明，但必须始终以选中片段为主，不能用上下文取代它。');
    } else {
      lines.push('只解释选中片段本身，不要扩展到其它文件、调用方、被调用方或项目关系。');
    }
    if (typeof options.path === 'string' && options.path !== '') {
      const range = Number.isFinite(Number(options.startLine))
        ? `:${Number(options.startLine)}-${Number(options.endLine ?? options.startLine)}`
        : '';
      lines.push(`选中位置：${options.path}${range}`);
    }
  } else {
    lines.push('', '这次提问针对整个项目，回答要说明涉及哪些文件、它们如何协作。');
  }
  // A reader-supplied instruction is appended last, where a model reads it as the
  // most specific request. The citation rules above still win: the custom text
  // adds preference, it cannot license an invented line number.
  const custom = typeof options.custom === 'string' ? options.custom.trim() : '';
  if (custom !== '') {
    lines.push('', '## 读者自定义要求', custom);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Context assembly                                                   *
 * ------------------------------------------------------------------ */

/** The four stage headings, in contract order, used by the prompt and by tests. */
export const CONTEXT_HEADINGS = Object.freeze({
  selection: '## 1. 用户选中的代码（本次提问的首要对象）',
  graph: '## 2. 知识图谱上下文',
  notes: '## 3. 知识库笔记',
  retrieval: '## 4. 检索到的代码片段',
});

/** A fence that wraps code without being closed early by a backtick inside it. */
function safeFence(code, language) {
  const longest = String(code ?? '').match(/`+/gu)?.reduce((most, run) => Math.max(most, run.length), 3) ?? 3;
  const fence = '`'.repeat(Math.max(3, longest) + 1);
  return [`${fence}${language ?? ''}`, fence];
}

/** The language tag for a path, from its extension. */
function languageForPath(path) {
  const table = {
    py: 'python', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp',
    json: 'json', md: 'markdown', sh: 'bash', yml: 'yaml', yaml: 'yaml',
    html: 'html', css: 'css', sql: 'sql', toml: 'toml',
  };
  const text = String(path ?? '');
  if (!text.includes('.')) return '';
  return table[text.slice(text.lastIndexOf('.') + 1).toLowerCase()] ?? '';
}

/** Edges reduced to the requested relation families. */
function filterEdges(edges, families) {
  if (!Array.isArray(families) || families.length === 0) return edges ?? [];
  const allowed = new Set(families);
  return (edges ?? []).filter((edge) => allowed.has(RELATION_FAMILY[edge.relation] ?? 'other'));
}

/**
 * The enclosing declaration of a line range, from the built symbol index.
 *
 * Smallest containing span wins, so a method inside a class yields the method —
 * "the enclosing symbol" of a line inside `detect_communities` is that function,
 * not the module around it.
 * @param nodes - the graph nodes.
 * @param path - the workspace-relative path.
 * @param line - the 1-based line.
 * @returns the node, or undefined.
 */
export function enclosingSymbol(nodes, path, line) {
  const at = Math.trunc(Number(line) || 0);
  let best;
  for (const node of nodes ?? []) {
    if (node.path !== path) continue;
    if (node.kind !== 'function' && node.kind !== 'class') continue;
    const start = Number(node.start_line ?? 0);
    const end = Number(node.end_line ?? 0);
    if (start <= 0 || end < start) continue;
    if (at < start || at > end) continue;
    if (best === undefined || (end - start) < (best.end_line - best.start_line)) best = node;
  }
  return best;
}

/**
 * Notes that belong in the prompt: ones anchored to the selection, or ones whose
 * title/body matches the question.
 *
 * Overlap beats text match — a note anchored inside the selected lines is about
 * exactly this code — so anchored notes are ranked first and the cap applies after
 * both lists are merged, keeping order stable.
 * @param notes - the stored note rows.
 * @param options - `{ path, startLine, endLine, question, limit }`.
 * @returns the selected notes, best first.
 */
export function selectNotes(notes, options = {}) {
  const limit = Math.max(1, Math.trunc(Number(options.limit ?? CONTEXT_NOTE_LIMIT)));
  const path = String(options.path ?? '');
  const start = Math.trunc(Number(options.startLine) || 0);
  const end = Math.trunc(Number(options.endLine) || 0);
  const question = String(options.question ?? '').toLowerCase();
  const tokens = question.split(/[\s,，。.;；:：!！?？、()（）[\]「」]+/u).filter((token) => token.length >= 2);

  const scored = [];
  for (const note of notes ?? []) {
    let score = 0;
    if (path !== '' && start > 0) {
      for (const anchor of note.anchors ?? []) {
        if (anchor.path !== path) continue;
        const aStart = Number(anchor.startLine ?? 0);
        const aEnd = Number(anchor.endLine ?? aStart);
        // Overlap, not containment: a note anchored on lines 60-92 is relevant to a
        // selection of 66-70, and requiring containment would miss it.
        if (aEnd >= start && aStart <= end) score += 3;
      }
    }
    if (tokens.length > 0) {
      const haystack = `${note.title ?? ''}\n${note.body ?? ''}`.toLowerCase();
      for (const token of tokens) if (haystack.includes(token)) score += 1;
    }
    if (score > 0) scored.push({ score, note });
  }
  scored.sort((a, b) => (b.score - a.score) || ((b.note.updatedAt ?? 0) - (a.note.updatedAt ?? 0)));
  return scored.slice(0, limit).map((row) => row.note);
}

/**
 * Assemble the four-stage context and the citation candidate set.
 *
 * Pure with respect to the model: no `llm` is touched here, so the probe can call
 * it directly and a re-run costs one disk read of `notes.json`.
 *
 * @param options - see the destructuring below.
 * @returns `{ blocks, stages, retrieval, candidates, selection, question, mode }`.
 */
export async function assembleContext(options = {}) {
  const {
    root = '',
    document = {},
    conversation = {},
    text = '',
    useContext = false,
    graphAnchor = null,
    config = {},
    notes = undefined,
    turnSelection = undefined,
  } = options;

  const question = String(text ?? '').trim();
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const edges = Array.isArray(document.edges) ? document.edges : [];
  const families = Array.isArray(config.families) ? config.families : undefined;
  const graphEdges = filterEdges(edges, families);
  // A question may be about whatever the reader has selected *now*, even when the
  // conversation started somewhere else. The turn's own selection therefore wins
  // over the conversation's stored one; the stored one is only the fallback for a
  // continuation question sent without a selection.
  const override = turnSelection !== undefined && turnSelection !== null
    && turnSelection.mode === 'snippet'
    && typeof turnSelection.selectedCode === 'string'
    && turnSelection.selectedCode.trim() !== ''
    ? turnSelection
    : null;
  const subject = override ?? conversation;
  const mode = override !== null || conversation.mode === 'snippet' ? 'snippet' : 'project';
  const path = String(subject.path ?? '');
  const startLine = Math.trunc(Number(subject.startLine) || 0);
  const endLine = Math.trunc(Number(subject.endLine) || startLine);
  const selectedCode = typeof subject.selectedCode === 'string' ? subject.selectedCode : '';
  // "Contact context" is a snippet-mode switch: off means the answer may only
  // read the selected lines; on means project relations may join as supporting
  // material. A project-mode conversation has no snippet to focus on, so the
  // switch does not suppress its graph/notes/retrieval stages.
  const snippetOnly = mode === 'snippet' && useContext !== true;
  const enclosing = mode === 'snippet' && path !== ''
    ? enclosingSymbol(nodes, path, startLine)
    : undefined;

  const blocks = [];
  const stages = { selection: false, graph: false, notes: false, retrieval: false };

  /* ---- 1. the turn's selection (or the conversation's) ------------- */
  if (mode === 'snippet' && selectedCode.trim() !== '') {
    const [open, close] = safeFence(selectedCode, languageForPath(path));
    const where = path === '' ? '' : `（${path}${startLine > 0 ? `:${startLine}-${endLine}` : ''}）`;
    const parts = [`${CONTEXT_HEADINGS.selection}${where}`, `${open}\n${selectedCode}\n${close}`];
    if (useContext) {
      // "useContext: true adds the enclosing symbol" — and only the enclosing
      // symbol, never the whole file: the selection stays the subject.
      if (enclosing !== undefined) {
        const body = await readRange(root, path, enclosing.start_line, enclosing.end_line, ENCLOSING_SYMBOL_LINES);
        if (typeof body === 'string' && body !== '' && !selectedCode.includes(body)) {
          const [symbolOpen, symbolClose] = safeFence(body, languageForPath(path));
          parts.push(
            `选中代码所在的声明：${path}:${enclosing.start_line}-${enclosing.end_line}`
            + `${enclosing.label === undefined ? '' : `（${enclosing.kind} ${enclosing.label}）`}`,
            `${symbolOpen}\n${body}\n${symbolClose}`,
          );
        }
      }
    }
    blocks.push({ stage: 'selection', text: parts.join('\n\n') });
    stages.selection = true;
  }

  /* ---- 2. the knowledge graph ------------------------------------- */
  // Seeds are collected regardless of `includeGraph`, because stage 4 fuses the
  // graph seeds with the keyword hits. The contract makes the graph a *retrieval*
  // signal as well as a prompt block, so suppressing the block must not silently
  // also suppress the fusion.
  const scored = scoreNodes(nodes, question, graphEdges);
  const seeds = pickSeeds(nodes, question, graphEdges, 3);
  const requestedAnchor = typeof graphAnchor === 'string' && graphAnchor !== '' ? graphAnchor : null;
  // With the context switch on, the selected declaration is the graph anchor:
  // project relations are read outward from the snippet instead of from a
  // question-only seed, which is what keeps the snippet primary.
  const anchored = requestedAnchor !== null
    ? requestedAnchor
    : (useContext && mode === 'snippet' && enclosing !== undefined ? enclosing.id : null);

  if (!snippetOnly && config.includeGraph !== false) {
    let graphText = '';
    if (anchored !== null) {
      graphText = nodeContext({ nodes, edges: graphEdges }, anchored, 2, 1200);
    } else if (seeds.length > 0) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const scores = new Map(scored.map((row) => [row.node.id, row.score]));
      // `expand`/`renderSubgraphText` are the same renderer the `node`/`graph` API
      // uses, so the model and the panel read the same words for the same nodes.
      graphText = renderSubgraphText(
        byId,
        graphEdges,
        expand(byId, graphEdges, seeds, 'bfs', 2),
        { seeds, scores, tokenBudget: 1200 },
      );
    }
    if (graphText.trim() !== '') {
      blocks.push({ stage: 'graph', text: `${CONTEXT_HEADINGS.graph}\n${graphText}` });
      stages.graph = true;
    }
  }

  /* ---- 3. the knowledge base ------------------------------------- */
  let noteRows = notes;
  if (noteRows === undefined) {
    try {
      noteRows = (await loadNotes(root)).notes;
    } catch {
      // A damaged note library must not fail the question. Stage 3 is skipped and
      // the note API still reports the corruption to whoever asks about notes.
      noteRows = [];
    }
  }
  if (!snippetOnly && config.includeNotes !== false && Array.isArray(noteRows) && noteRows.length > 0) {
    const picked = selectNotes(noteRows, {
      path,
      startLine,
      endLine,
      question,
      limit: CONTEXT_NOTE_LIMIT,
    });
    if (picked.length > 0) {
      const rendered = picked.map((note) => {
        const refs = (note.codeRefs ?? [])
          .map((ref) => `  - ${ref.path}:${ref.line}-${ref.endLine ?? ref.line}`)
          .join('\n');
        return [
          `笔记「${note.title}」`,
          String(note.body ?? '').trim(),
          ...(refs === '' ? [] : ['引用位置：', refs]),
        ].join('\n');
      });
      blocks.push({ stage: 'notes', text: `${CONTEXT_HEADINGS.notes}\n${rendered.join('\n\n---\n\n')}` });
      stages.notes = true;
    }
  }

  /* ---- 4. RAG chunks --------------------------------------------- */
  let retrieval = [];
  if (!snippetOnly) {
    const topK = Math.max(1, Math.min(24, Math.trunc(Number(config.topK ?? 8))));
    const chunkIndex = document.chunks ?? { chunks: [] };
    const chunkRows = Array.isArray(chunkIndex.chunks) ? chunkIndex.chunks : [];
    const keywordRows = searchRecords(chunkIndex, question, Math.max(topK, 12));
    // Semantic hits are optional: `retrieveVectorRows` answers [] for a missing
    // index, a changed model, or an Ollama that is not running, and keyword search
    // keeps working. The query embedding is one short call, so this stays cheap on
    // the answer path.
    const vectorRows = await retrieveVectorRows(root, chunkRows, question, Math.max(topK, 12));

    // Graph seeds become retrieval rows so `rrfFuse` can rank them beside the
    // keyword hits: a symbol the question *names* is a strong hit even when its body
    // never repeats the question's words.
    const seedRows = [];
    for (const seed of seeds) {
      const node = nodes.find((row) => row.id === seed);
      if (node === undefined || node.path === '' || node.path === undefined) continue;
      if (node.kind === 'external' || node.kind === 'rationale') continue;
      seedRows.push({
        path: node.path,
        line: Number(node.start_line ?? 1),
        endLine: Number(node.end_line ?? node.start_line ?? 1),
        symbol: node.label ?? null,
        kind: node.kind ?? '',
        score: 0,
        retriever: 'graph',
      });
    }

    // The desktop fuses keyword + vector with RRF; this port adds graph seeds as a
    // third list. Fusing by rank means an empty list simply contributes nothing —
    // there is no weight to retune when one retriever is unavailable.
    const lists = [keywordRows, vectorRows, seedRows].filter((rows) => rows.length > 0);
    const fused = lists.length > 1
      ? rrfFuse(lists, topK)
      : (lists[0] ?? []).slice(0, topK);

    retrieval = fused.map(retrievalRow);
    if (retrieval.length > 0) {
      const rendered = contextBlocks(fused, CONTEXT_BUDGET_CHARS);
      if (rendered !== '') {
        blocks.push({ stage: 'retrieval', text: `${CONTEXT_HEADINGS.retrieval}\n${rendered}` });
        stages.retrieval = true;
      }
    }
  }

  /* ---- citations: the candidate set ------------------------------- */
  // Everything in the prompt is a legal citation target; nothing outside it is.
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (row) => {
    const key = `${row.path}:${row.startLine}-${row.endLine}`;
    if (row.path === '' || seen.has(key)) return;
    seen.add(key);
    candidates.push(row);
  };
  for (const row of retrieval) pushCandidate(row);
  if (mode === 'snippet' && path !== '' && startLine > 0) {
    pushCandidate({
      path,
      startLine,
      endLine: Math.max(startLine, endLine),
      symbol: enclosing?.label ?? null,
      kind: '',
      score: 0,
      retriever: 'selection',
    });
  }

  return {
    blocks,
    stages,
    retrieval,
    candidates,
    question,
    mode,
    selection: { mode, path, startLine, endLine },
  };
}

/**
 * Render retrieved rows as cited code blocks (`hybrid.context_for_prompt`).
 *
 * Reimplemented rather than imported because the imported one reads
 * `chunk.line`/`chunk.snippet` and this function receives `rrfFuse` output, whose
 * rows already carry `line`/`endLine` but whose `snippet` may be absent for a graph
 * seed. A missing snippet degrades to a "location only" block instead of the
 * literal `undefined` the shared renderer would print.
 *
 * @param rows - fused retrieval rows.
 * @param budgetChars - hard stop; a block that does not fit is not emitted.
 * @returns the joined blocks, or ''.
 */
function contextBlocks(rows, budgetChars) {
  const parts = [];
  let used = 0;
  for (const row of rows ?? []) {
    const startLine = Math.max(1, Math.trunc(Number(row.line ?? row.startLine ?? 1)));
    const endLine = Math.max(startLine, Math.trunc(Number(row.endLine ?? startLine)));
    const symbol = row.symbol === null || row.symbol === undefined || row.symbol === ''
      ? '' : ` (${row.kind ?? ''} ${row.symbol})`;
    const header = `### ${row.path}:${startLine}-${endLine}${symbol}`;
    const body = typeof row.snippet === 'string' && row.snippet !== ''
      ? row.snippet
      : '（这个位置由知识图谱引用，正文未取回；如需细节请读取该文件。）';
    const [open, close] = safeFence(body, row.language ?? '');
    const block = `${header}\n${open}\n${body}\n${close}`;
    if (used + block.length > budgetChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

/**
 * The model-facing transcript: the assembled context followed by the question.
 *
 * One user message carries all of it (`WIRE-CHAT.md §13` and the Harness note in
 * the plugin brief): constructing an assistant message would require a
 * provider/model/replayState `source` that this plugin cannot build correctly, and
 * a single user message is what the Harness itself does for auxiliary calls.
 *
 * @param blocks - the context blocks, in stage order.
 * @param question - the user's question.
 * @returns the transcript text.
 */
export function transcriptFor(blocks, question) {
  const context = (blocks ?? []).map((block) => block.text).join('\n\n---\n\n');
  if (context === '') return question;
  return `${context}\n\n---\n\n## 问题\n${question}`;
}

/* ------------------------------------------------------------------ *
 * Streaming                                                          *
 * ------------------------------------------------------------------ */

/**
 * Run one streamed completion, forwarding text deltas.
 *
 * The chunk protocol is the Harness's (`StreamChunk`): `text-delta` carries visible
 * text, `reasoning-delta` is hidden reasoning and is dropped, `usage` carries
 * `{ inputTokens, outputTokens }`, and a terminal `finish` carries
 * `reason.kind ∈ {stop, tool-calls, max-tokens, aborted, error}`.
 *
 * A `finish` with `kind: 'error'` is **not** thrown: the tokens already streamed
 * are a usable partial answer, and the caller decides whether to persist it with
 * its error. Only a thrown iterator (a broken stream, a consumer abort) escapes,
 * and even that is caught here so one failure cannot leave the event stream
 * without a terminal frame.
 *
 * @param options - `{ llm, route, system, transcript, maxTokens, signal, onDelta }`.
 * @returns `{ text, usage, finish, error }`.
 */
export async function streamAnswer(options = {}) {
  const {
    llm, route, system, transcript, maxTokens, signal, onDelta,
  } = options;
  const parts = [];
  let usage = null;
  let finish = null;
  let error = null;

  const messages = [{ role: 'user', content: [{ type: 'text', text: String(transcript ?? '') }] }];

  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      messages,
      system,
      maxTokens: Math.max(1, Math.trunc(Number(maxTokens ?? ASK_MAX_TOKENS))),
      signal,
    });
    for await (const chunk of stream) {
      if (chunk === null || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta') {
        const text = typeof chunk.text === 'string' ? chunk.text : '';
        if (text === '') continue;
        parts.push(text);
        if (typeof onDelta === 'function') onDelta(text);
        continue;
      }
      if (chunk.type === 'usage') {
        const reported = chunk.usage ?? chunk;
        const inputTokens = Math.trunc(Number(reported?.inputTokens));
        const outputTokens = Math.trunc(Number(reported?.outputTokens));
        if (Number.isFinite(inputTokens) || Number.isFinite(outputTokens)) {
          usage = {
            inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
            outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
          };
        }
        continue;
      }
      if (chunk.type === 'finish') {
        finish = chunk.reason ?? null;
        if (finish?.kind === 'error') {
          error = String(finish.failure?.message ?? 'the model call failed');
        } else if (finish?.kind === 'aborted') {
          error = 'the answer was stopped';
        }
      }
    }
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }

  const text = parts.join('');
  // A stream that ended without a finish chunk and without text is a failure, not
  // an empty answer: reporting success would store a blank turn.
  if (error === null && finish === null && text.trim() === '') {
    error = 'the model returned no content';
  }
  return { text, usage, finish, error };
}

/* ------------------------------------------------------------------ *
 * Citations                                                          *
 * ------------------------------------------------------------------ */

/** `path:12-30` or `path:12` inside prose. */
const CITATION_RE = /([\w@./\\-]+\.[A-Za-z0-9]{1,8})(?::(\d+)(?:\s*[-–~]\s*(\d+))?)?/gu;

/**
 * Extract the citations an answer actually made, keeping only retrieved ranges.
 *
 * Three rules, in order:
 *
 * 1. A `path:start-end` in the prose is a claim; it is kept only when it names a
 *    candidate row. A range that overlaps a candidate is clamped to the
 *    intersection, so the recorded citation is a subset of what was retrieved —
 *    "the model said 60-100, retrieval had 66-92" becomes 66-92.
 * 2. A bare `path` (no line numbers) matches every candidate in that file, and the
 *    best-scoring one is recorded. A file name alone is a weaker claim but still a
 *    real one.
 * 3. When nothing matched — a model that answers without citing — the fallback is
 *    the candidates that were placed in the prompt, capped at three. That keeps
 *    "关联代码" populated for a note without inventing a range: these are exactly
 *    the ranges the answer was written from.
 *
 * @param answerText - the streamed answer.
 * @param candidates - `[{ path, startLine, endLine, symbol, … }]`.
 * @param options - `{ limit, fallback }`.
 * @returns `[{ path, startLine, endLine, symbol }]`, best first, deduped.
 */
export function extractCitations(answerText, candidates, options = {}) {
  const limit = Math.max(1, Math.trunc(Number(options.limit ?? MAX_CITATIONS)));
  const rows = Array.isArray(candidates) ? candidates.filter((row) => row.path !== '') : [];
  const found = [];
  const seen = new Set();

  const add = (row) => {
    const key = `${row.path}:${row.startLine}-${row.endLine}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ path: row.path, startLine: row.startLine, endLine: row.endLine, symbol: row.symbol ?? null });
  };

  CITATION_RE.lastIndex = 0;
  let match;
  const text = String(answerText ?? '');
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (found.length >= limit) break;
    const mentionedPath = match[1].replace(/\\/gu, '/').replace(/^\.\//u, '');
    const start = Number(match[2]);
    const end = Number(match[3] ?? match[2]);
    const inFile = rows.filter((row) => row.path === mentionedPath
      || row.path.endsWith(`/${mentionedPath}`)
      || mentionedPath.endsWith(`/${row.path}`));
    if (inFile.length === 0) continue;
    if (!Number.isFinite(start) || start <= 0) {
      // Bare path: record the strongest candidate in that file.
      add(inFile[0]);
      continue;
    }
    const wantedEnd = Number.isFinite(end) && end >= start ? end : start;
    let best = null;
    let bestOverlap = 0;
    for (const row of inFile) {
      const overlap = Math.min(wantedEnd, row.endLine) - Math.max(start, row.startLine) + 1;
      if (overlap <= 0) continue;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = row;
      }
    }
    if (best === null) continue;
    // Clamp to the intersection: a citation may never point outside what was read.
    add({
      ...best,
      startLine: Math.max(best.startLine, start),
      endLine: Math.min(best.endLine, wantedEnd),
    });
  }

  if (found.length === 0 && options.fallback !== false) {
    for (const row of rows.slice(0, Math.min(3, limit))) add(row);
  }
  return found.slice(0, limit);
}

/**
 * Attach the freshness metadata a turn's citations carry (`§10`).
 *
 * The hash is taken from the code *as it reads now*, and the status is `fresh` or
 * `missing` — nothing else can be known at citation time. Drift is what a *later*
 * `notes read` computes against these hashes, which is why they are stored.
 *
 * @param root - absolute workspace root.
 * @param citations - rows from {@link extractCitations}.
 * @returns rows with `hash` and `status`.
 */
export async function stampCitations(root, citations) {
  const out = [];
  for (const citation of citations ?? []) {
    const snippet = await readRange(root, citation.path, citation.startLine, citation.endLine, 40);
    out.push({
      path: citation.path,
      startLine: citation.startLine,
      endLine: citation.endLine,
      symbol: citation.symbol ?? null,
      hash: snippet === null ? null : snippetHash(snippet),
      status: snippet === null ? 'missing' : 'fresh',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The whole ask                                                      *
 * ------------------------------------------------------------------ */

/**
 * Assemble, stream, and extract — the body of the `ask` method, minus transport.
 *
 * Written as a single async function that emits events through `emit`, so
 * `api-chat.js` only has to serialize them and the probe can collect them into an
 * array. No SSE, no HTTP, no Cordis.
 *
 * @param options - `{ root, document, conversation, text, useContext, graphAnchor,
 *   ragConfig, notes, llm, route, maxTokens, signal, emit, turnSelection }`.
 * @returns `{ text, usage, error, retrieval, citations, context }`.
 */
export async function runAsk(options = {}) {
  const {
    root = '',
    document = {},
    conversation = {},
    text = '',
    useContext = false,
    graphAnchor = null,
    ragConfig = undefined,
    notes = undefined,
    turnSelection = undefined,
    customSystemPrompt = '',
    llm,
    route,
    maxTokens = ASK_MAX_TOKENS,
    signal,
    emit = () => {},
  } = options;

  const config = ragConfig ?? await effectiveRagConfig(root, options.rag);
  const context = await assembleContext({
    root,
    document,
    conversation,
    text,
    useContext: useContext === true,
    graphAnchor: typeof graphAnchor === 'string' && graphAnchor !== '' ? graphAnchor : conversation.graphAnchor,
    config,
    notes,
    turnSelection,
  });

  emit({ type: 'retrieval', chunks: context.retrieval });

  if (llm === undefined || route === undefined || route === null) {
    return {
      text: '',
      usage: null,
      error: 'the LLM service is unavailable, so no answer could be produced',
      retrieval: context.retrieval,
      // No answer means no claim: there is nothing to cite.
      citations: [],
      context,
    };
  }

  const { system: effectiveSystemPrompt, qa: effectiveQaPrompt } = await effectivePrompts();

  const streamed = await streamAnswer({
    llm,
    route,
    system: systemPrompt({
      mode: context.selection.mode,
      path: context.selection.path,
      startLine: context.selection.startLine,
      endLine: context.selection.endLine,
      useContext: useContext === true,
      system: effectiveSystemPrompt,
      qa: effectiveQaPrompt,
      custom: customSystemPrompt,
    }),
    transcript: transcriptFor(context.blocks, context.question),
    maxTokens,
    signal,
    onDelta: (delta) => emit({ type: 'delta', text: delta }),
  });

  const citations = streamed.error !== null && streamed.text.trim() === ''
    // No answer means no claim: recording citations for a failed turn would let a
    // note's 关联代码 cite code the reader was never told about.
    ? []
    : await stampCitations(root, extractCitations(streamed.text, context.candidates));

  for (const citation of citations) {
    emit({
      type: 'citation',
      path: citation.path,
      startLine: citation.startLine,
      endLine: citation.endLine,
      symbol: citation.symbol,
    });
  }

  return {
    text: streamed.text,
    usage: streamed.usage,
    error: streamed.error,
    retrieval: context.retrieval,
    citations,
    context,
  };
}
