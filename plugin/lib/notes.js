/**
 * Notes: the cross-project reading knowledge base, its folders, the line-range
 * annotations, and the code anchors that keep both honest after the code moves.
 *
 * This is the one CodeSlice subsystem with no Host counterpart, and the reason
 * the plugin exists at all rather than being "a graph viewer". A note records
 * what the reader understood; an anchor records where that understanding came
 * from; drift detection is what stops a note from quietly becoming a lie.
 *
 * Ported from `backend/app/services/notegen.py` (the text layer only — the model
 * call is gone, and its documented fallback is what runs), `anchors.py`, and
 * `graph/notes.py`.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { collapseWhitespace } from './model.js';
import { cosineSimilarity, noteVectors } from './note-vectors.js';
import { stateDir } from './store.js';

/* ------------------------------------------------------------------ *
 * Ids and time                                                       *
 * ------------------------------------------------------------------ */

let counter = 0;

/**
 * A short, collision-resistant id. Not a UUID: these never leave the workspace,
 * and a 12-char base36 token keeps the JSON small.
 * @param prefix - 'n' note, 'f' folder, 'a' anchor, 'an' annotation.
 * @returns the id.
 */
function mintId(prefix) {
  counter = (counter + 1) % 1_000_000;
  const stamp = Date.now().toString(36);
  const noise = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${prefix}_${stamp}${noise}${counter.toString(36)}`;
}

/* ------------------------------------------------------------------ *
 * Anchors                                                            *
 * ------------------------------------------------------------------ */

/** The hash of a snippet, with line endings normalised so CRLF/LF agree. */
export function snippetHash(text) {
  return createHash('sha256').update(String(text ?? '').replace(/\r\n/gu, '\n'), 'utf8').digest('hex');
}

/**
 * Read one line range out of a file.
 *
 * Returns null when the file is gone, unreadable, or the range starts past its
 * end — every one of which means "this citation can no longer be shown", not
 * "throw".
 * @param root - absolute workspace root.
 * @param relPath - relative POSIX path.
 * @param startLine - 1-based inclusive.
 * @param endLine - 1-based inclusive.
 * @param maxLines - clip longer ranges (the note template caps at 40).
 * @returns the snippet, or null.
 */
export async function readRange(root, relPath, startLine, endLine, maxLines = 40) {
  const detailed = await readRangeDetailed(root, relPath, startLine, endLine, maxLines);
  return detailed === null ? null : detailed.text;
}

/**
 * Read one line range, reporting the **actual** clipped span that was read.
 *
 * The anchor records the range it really captured, not the requested one: when
 * a range is clipped to the line or character cap, storing the requested `endLine`
 * while the snippet holds only the clipped prefix makes the next drift check hash
 * a different span and report a false `moved 0` (INTERFACES-v3.md §3.5.2).
 *
 * @param root - absolute workspace root.
 * @param relPath - relative POSIX path.
 * @param startLine - 1-based inclusive.
 * @param endLine - 1-based inclusive.
 * @param maxLines - clip longer ranges.
 * @returns `{ text, startLine, endLine, truncated }`, or null when the file is
 *   gone, unreadable, or the range starts past its end.
 */
export async function readRangeDetailed(root, relPath, startLine, endLine, maxLines = 40) {
  const safe = safeJoin(root, relPath);
  if (safe === undefined) return null;
  let text;
  try {
    text = await fs.readFile(safe, 'utf8');
  } catch {
    return null;
  }
  const lines = text.split('\n');
  const start = Math.max(1, Math.trunc(Number(startLine) || 1));
  if (start > lines.length) return null;
  const requestedEnd = Math.max(start, Math.trunc(Number(endLine) || start));
  const end = Math.min(requestedEnd, start + maxLines - 1, lines.length);
  const clippedLines = end < requestedEnd;
  const raw = lines.slice(start - 1, end).join('\n');
  if (raw === '') return null;
  const charTruncated = raw.length > 1600;
  const snippet = charTruncated ? `${raw.slice(0, 1600)}\n…(已截断)` : raw;
  return { text: snippet, startLine: start, endLine: end, truncated: clippedLines || charTruncated };
}

/**
 * Move a corrupt state file aside as `<file>.corrupt-<ts>` instead of deleting it.
 *
 * Shared by the v3 state stores (projects / frames / prompts). The damaged
 * original is kept for diagnosis; the caller then reports a 400 rather than
 * reading the file back as an empty document.
 * @param file - absolute path to the corrupt document.
 * @returns the quarantine path.
 */
export async function quarantineCorrupt(file) {
  const stamp = Date.now().toString(36);
  const aside = `${file}.corrupt-${stamp}`;
  await fs.rename(file, aside);
  return aside;
}

/**
 * Ensure a state directory exists before an atomic write lands there.
 *
 * `store.writeJson` makes the *default* state dir; a store pointed at another
 * directory via `CODESLICE_STATE_DIR` has to create its own parent first.
 * @param dir - absolute state directory.
 */
export async function ensureStateDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Resolve a relative path inside a root, refusing anything that escapes it.
 *
 * A note is authored by a model as often as by a person, so a `../../` in a
 * citation must be refused rather than followed.
 * @param root - absolute workspace root.
 * @param relPath - the claimed relative path.
 * @returns the absolute path, or undefined when it escapes.
 */
export function safeJoin(root, relPath) {
  if (typeof relPath !== 'string' || relPath === '') return undefined;
  const normalised = relPath.replace(/\\/gu, '/').replace(/^\/+/u, '');
  const absolute = resolve(root, normalised);
  const base = resolve(root);
  if (absolute !== base && !absolute.startsWith(`${base}${sep}`)) return undefined;
  return absolute;
}

/**
 * Detect whether an anchor's snippet still matches the code it points at.
 *
 * The four outcomes mirror the desktop app's vocabulary, because a UI that says
 * "moved" must mean the same thing it meant there:
 *
 *   fresh    the same lines still hash to the recorded snippet
 *   moved    the same content was found elsewhere in the file (line shifted)
 *   drifted  the file exists but the content at that range changed
 *   missing  the file is gone
 *
 * @param root - absolute workspace root.
 * @param anchor - `{ path, startLine, endLine, hash, snippet }`.
 * @returns `{ status, startLine, endLine, shift }`.
 */
export async function checkAnchor(root, anchor) {
  const safe = safeJoin(root, anchor.path);
  if (safe === undefined) {
    return { status: 'missing', startLine: anchor.startLine, endLine: anchor.endLine, shift: 0 };
  }
  let text;
  try {
    text = await fs.readFile(safe, 'utf8');
  } catch {
    return { status: 'missing', startLine: anchor.startLine, endLine: anchor.endLine, shift: 0 };
  }

  const lines = text.split('\n');
  const start = Math.max(1, Math.trunc(Number(anchor.startLine) || 1));
  const end = Math.max(start, Math.trunc(Number(anchor.endLine) || start));

  if (anchor.hash !== undefined && anchor.hash !== null) {
    if (start <= lines.length) {
      const current = lines.slice(start - 1, Math.min(end, lines.length)).join('\n');
      if (current !== '' && snippetHash(current) === anchor.hash) {
        return { status: 'fresh', startLine: start, endLine: end, shift: 0 };
      }
    }

    // The same content may still be in the file, just at a different line — an
    // import added above it shifts every later range by one. Searching beats
    // reporting drift, because a note that still describes the code is not stale.
    const target = String(anchor.snippet ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    if (target.length > 0) {
      const trimmed = lines.map((line) => line.trim());
      const head = target[0];
      for (let index = 0; index + target.length <= trimmed.length; index += 1) {
        if (trimmed[index] !== head) continue;
        let matched = true;
        for (let offset = 1; offset < target.length; offset += 1) {
          if (trimmed[index + offset] !== target[offset]) {
            matched = false;
            break;
          }
        }
        if (!matched) continue;
        const foundStart = index + 1;
        return {
          status: 'moved',
          startLine: foundStart,
          endLine: foundStart + target.length - 1,
          shift: foundStart - start,
        };
      }
    }
  }

  return { status: 'drifted', startLine: start, endLine: end, shift: 0 };
}

/**
 * Re-check every anchor belonging to one document set and return the updated
 * rows plus per-status counts.
 * @param root - absolute workspace root.
 * @param anchors - the stored anchor rows.
 * @returns `{ anchors, counts }`.
 */
export async function refreshAnchors(root, anchors) {
  const counts = { fresh: 0, moved: 0, drifted: 0, missing: 0 };
  const updated = [];
  for (const anchor of anchors) {
    const result = await checkAnchor(root, anchor);
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    updated.push({
      ...anchor,
      startLine: result.startLine,
      endLine: result.endLine,
      status: result.status,
      shift: result.shift,
      checkedAt: Date.now(),
    });
  }
  return { anchors: updated, counts };
}

/* ------------------------------------------------------------------ *
 * The note template                                                 *
 * ------------------------------------------------------------------ */

/** Language name for a fence, from the path's extension. */
export function languageFor(path) {
  const ext = String(path ?? '').includes('.') ? String(path).slice(String(path).lastIndexOf('.') + 1).toLowerCase() : '';
  const table = {
    py: 'python', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp',
    json: 'json', md: 'markdown', sh: 'bash', yml: 'yaml', yaml: 'yaml',
    html: 'html', css: 'css', sql: 'sql', toml: 'toml',
  };
  return table[ext] ?? '';
}

/**
 * A fence that cannot be closed early by the code it wraps.
 *
 * A cited Markdown file contains fences of its own; three backticks would end the
 * block at the first one and dump the rest of the note into a code block. The
 * width is one more than the longest backtick run inside — seeded at **3**, so
 * the result is always at least 4 backticks even for code with none. That seed is
 * the original's behaviour (`notegen._fence_for`), and it is deliberately
 * different from the retrieval prompt renderer, which always uses exactly three.
 * @param code - the code to wrap.
 * @param language - the fence's language tag.
 * @returns `[opening, closing]`.
 */
export function fenceFor(code, language) {
  const longest = String(code ?? '').match(/`+/gu)?.reduce((most, run) => Math.max(most, run.length), 3) ?? 3;
  const width = Math.max(3, longest) + 1;
  const fence = '`'.repeat(width);
  return [`${fence}${language ?? ''}`, fence];
}

/**
 * Render the `## 关联代码` section: one sub-heading per citation with its code.
 * @param refs - `[{ path, startLine, endLine, symbol, code }]`.
 * @returns the section body.
 */
export function renderCodeSection(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return '（这次讲解没有引用具体代码位置。）';
  const blocks = [];
  for (const ref of refs) {
    let heading = `### ${ref.path}:${ref.startLine}-${ref.endLine}`;
    if (ref.symbol !== undefined && ref.symbol !== null && ref.symbol !== '') heading += `（${ref.symbol}）`;
    if (typeof ref.code !== 'string' || ref.code === '') {
      blocks.push(`${heading}\n\n（引用位置的内容已读取不到，可能已被修改或删除。）`);
      continue;
    }
    const [open, close] = fenceFor(ref.code, languageFor(ref.path));
    blocks.push(`${heading}\n\n${open}\n${ref.code}\n${close}`);
  }
  return blocks.join('\n\n');
}

/**
 * Compose the note body.
 *
 * The four headings are fixed: a reader who has twenty of these can find the
 * "何时使用" of any of them without reading it. Missing sections get an explicit
 * marker rather than being silently dropped, so a skeleton note is visibly
 * skeletal.
 * @param title - the H1.
 * @param sections - `{ knowledge, keyPoints, when }`.
 * @param refs - the code references.
 * @returns the Markdown body.
 */
export function composeNote(title, sections, refs) {
  const knowledge = collapseWhitespace(sections.knowledge ?? '') === ''
    ? '（模型没有给出知识点小结。）' : String(sections.knowledge).trim();
  const keyPoints = collapseWhitespace(sections.keyPoints ?? '') === ''
    ? '- （模型没有给出要点。）' : String(sections.keyPoints).trim();
  const when = collapseWhitespace(sections.when ?? '') === ''
    ? '- （模型没有给出适用场景。）' : String(sections.when).trim();
  return [
    `# ${title}`,
    '',
    '## 知识点',
    knowledge,
    '',
    '## 关联代码',
    renderCodeSection(refs),
    '',
    '## 要点',
    keyPoints,
    '',
    '## 何时使用',
    when,
  ].join('\n');
}

/** Drop a leading H1 from model output, plus the blank lines under it. */
export function stripLeadingH1(text) {
  const lines = String(text ?? '').split('\n');
  if (lines.length > 0 && lines[0].startsWith('# ')) {
    lines.shift();
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  }
  return lines.join('\n');
}

/**
 * Split a Markdown document into its top-level headings.
 * @param text - the document.
 * @returns `{ [heading]: body }`, in document order.
 */
export function splitSections(text) {
  const sections = {};
  let current;
  let buffer = [];
  const flush = () => {
    if (current !== undefined) sections[current] = buffer.join('\n').trim();
    buffer = [];
  };
  for (const line of String(text ?? '').split('\n')) {
    const heading = /^#{1,6}\s*(.+?)\s*$/u.exec(line);
    if (heading !== null) {
      flush();
      current = heading[1].trim();
      continue;
    }
    if (current !== undefined) buffer.push(line);
  }
  flush();
  return sections;
}

/**
 * Turn a section map into the template slots, tolerating a model that
 * renamed them.
 *
 * `标题` and `文件名` are metadata, not body sections: the note's H1 and
 * filename come from them, while the body keeps the four fixed sections. They
 * must still survive the split — dropping them was why a note title fell back
 * to the first sentence of `## 知识点`.
 *
 * @param sections - the split map.
 * @param fallbackText - the whole answer, used when no slot matched.
 * @returns `{ title, fileName, knowledge, keyPoints, when }`.
 */
export function sectionsFromText(sections, fallbackText) {
  const pick = (...names) => {
    for (const name of names) {
      for (const [key, value] of Object.entries(sections)) {
        if (key.includes(name) && String(value).trim() !== '') return value;
      }
    }
    return '';
  };
  const title = pick('标题', 'Title');
  const fileName = pick('文件名', 'Filename', 'File name');
  const knowledge = pick('知识点', '小结', '概述', 'Knowledge', 'Summary');
  const keyPoints = pick('要点', '关键', 'Points', 'Takeaway');
  const when = pick('何时', '适用', '场景', 'When');
  if (knowledge === '' && keyPoints === '' && when === '') {
    return {
      title: stripLeadingH1(String(title ?? '')),
      fileName: stripLeadingH1(String(fileName ?? '')),
      knowledge: stripLeadingH1(String(fallbackText ?? '')),
      keyPoints: '',
      when: '',
    };
  }
  return {
    title: stripLeadingH1(String(title ?? '')),
    fileName: stripLeadingH1(String(fileName ?? '')),
    knowledge,
    keyPoints,
    when,
  };
}

/**
 * The documented no-model fallback: a complete, correctly-shaped note built from
 * the raw answer and its citations.
 * @param answer - the text to summarise.
 * @param refs - the code references.
 * @returns `{ knowledge, keyPoints, when }`.
 */
export function fallbackSections(answer, refs) {
  const points = (Array.isArray(refs) ? refs : [])
    .map((ref) => `- \`${ref.path}:${ref.startLine}-${ref.endLine}\``)
    .join('\n');
  return {
    knowledge: stripLeadingH1(String(answer ?? '')),
    keyPoints: points === '' ? '- （原回答未引用具体位置。）' : points,
    when: '- 这段内容来自原始回答，未能生成结构化小结，请结合上下文理解。',
  };
}

/* ------------------------------------------------------------------ *
 * Titles                                                             *
 * ------------------------------------------------------------------ */

/** A title that only names a location carries no meaning. */
const LOCATION_ONLY = /^(关于|about)?\s*[^\s]+\.[A-Za-z0-9]+\s*(第\s*)?\d+([-–~]\d+)?\s*行?/iu;

/**
 * Clean a candidate title: strip a location prefix, a Markdown heading marker,
 * and surrounding punctuation.
 * @param text - the raw title.
 * @returns the cleaned title, or '' when nothing usable remains.
 */
export function cleanTitle(text) {
  let title = collapseWhitespace(text);
  if (title === '') return '';
  title = title.replace(/^#{1,6}\s*/u, '');
  if (LOCATION_ONLY.test(title)) {
    title = title.replace(LOCATION_ONLY, '').replace(/^[：:，,。.\s]+/u, '');
  }
  title = title.replace(/^关于\s*/u, '');
  title = title.replace(/^[：:，,、。.;；\s]+/u, '').replace(/[：:，,、。.;；\s]+$/u, '');
  if (title.startsWith('关于')) return '';
  return collapseWhitespace(title);
}

/**
 * Clip a title at a natural boundary.
 * @param title - the cleaned title.
 * @param limit - maximum characters (default 40).
 * @returns the clipped title.
 */
export function clipTitle(title, limit = 40) {
  const text = collapseWhitespace(title);
  if (text.length <= limit) return text;
  for (const breakpoint of [',', '，', ';', '；', '。', '、', ' ', ':', '：']) {
    const at = text.lastIndexOf(breakpoint, limit);
    if (at > limit * 0.4) return text.slice(0, at).trim();
  }
  return `${text.slice(0, limit - 1)}…`;
}

/** The first sentence of a paragraph, used when a note has no title at all. */
export function firstSentence(text, limit = 60) {
  const body = collapseWhitespace(stripLeadingH1(String(text ?? '')));
  if (body === '') return '';
  const cut = body.search(/[。！？.!?]/u);
  const sentence = cut > 0 ? body.slice(0, cut) : body;
  return sentence.length > limit ? `${sentence.slice(0, limit - 1)}…` : sentence;
}

/**
 * Choose a note title, preferring the structured summary over the raw answer.
 * @param sections - the summary sections.
 * @param answer - the original text.
 * @param fallback - a project or file name to fall back on.
 * @returns the title (never empty).
 */
export function resolveTitle(sections, answer, fallback = '') {
  const candidates = [
    sections?.title, sections?.标题, sections?.知识点,
    firstSentence(sections?.knowledge ?? ''),
    firstSentence(answer),
    fallback,
    '未命名笔记',
  ];
  for (const candidate of candidates) {
    const cleaned = cleanTitle(candidate ?? '');
    if (cleaned !== '' && cleaned.length >= 2) return clipTitle(cleaned);
  }
  return '未命名笔记';
}

/* ------------------------------------------------------------------ *
 * The note graph                                                     *
 * ------------------------------------------------------------------ */

/** Bumped when the graph model changes, so the wire payload is self-describing. */
export const NOTE_GRAPH_VERSION = 3;

/** Knowledge-point nodes kept per note. */
const TOPICS_PER_NOTE = 8;

/** Note↔note neighbours kept per note, best first. */
const SIMILAR_TOP_K = 3;

/** Cosine floor for embedding edges; below this the pair is noise. */
const EMBED_MIN_SCORE = 0.55;

/** Blended lexical floor (cosine + Jaccard); deliberately stricter than 0.2. */
const LEXICAL_MIN_SCORE = 0.28;

/** Every pair above this note count is skipped: O(n²) is not worth the latency. */
const MAX_PAIR_NOTES = 600;

/** Function words only. Domain terms (插件 / 注入 / 依赖) must survive. */
const STOP_ZH = new Set([
  '的', '了', '是', '在', '和', '与', '及', '或', '而', '但', '并', '就', '也', '都', '很', '更', '最',
  '这', '那', '个', '们', '为', '对', '从', '到', '把', '被', '让', '于', '以', '其', '该', '中', '上',
  '下', '内', '外', '可', '会', '能', '要', '需要', '一个', '一些', '这些', '那些', '什么', '如何',
  '哪些', '因为', '所以', '如果', '那么', '可以', '进行', '使用', '用于', '通过', '我们', '他们', '它',
  '你', '我', '他', '她', '不是', '没有', '还是', '已经', '之后', '之前', '其中', '同时', '例如', '比如',
  '一般', '通常', '主要', '相关', '对应', '当前', '具体', '以及', '并且', '或者', '但是', '而且', '然后',
  '因此', '由于', '关于', '对于', '根据', '按照', '除了', '时候', '这个', '那个', '这样', '那样', '是否',
]);

/** English function words plus JavaScript keywords: both are noise as topics. */
const STOP_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these', 'those', 'we', 'you',
  'they', 'he', 'she', 'not', 'no', 'if', 'then', 'than', 'so', 'such', 'can', 'could', 'should',
  'would', 'may', 'might', 'must', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'just', 'also',
  'but', 'more', 'most', 'other', 'into', 'over', 'under', 'about', 'after', 'before', 'between',
  'during', 'through', 'const', 'let', 'var', 'function', 'return', 'import', 'export', 'new', 'null',
  'true', 'false', 'undefined', 'async', 'await', 'type', 'interface', 'class', 'extends', 'default',
  'typeof', 'instanceof', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally',
]);

/** One `Intl.Segmenter` per process; word granularity is what we want for zh. */
let zhWordSegmenter;

/** The zh word segmenter, or null when the runtime lacks one. */
function wordSegmenter() {
  if (zhWordSegmenter !== undefined) return zhWordSegmenter;
  try {
    zhWordSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('zh', { granularity: 'word' })
      : null;
  } catch {
    zhWordSegmenter = null;
  }
  return zhWordSegmenter;
}

/** True when a term is a usable knowledge-point token. */
function isTopicTerm(term) {
  if (typeof term !== 'string') return false;
  const value = term.trim();
  if (value.length < 2 || value.length > 30) return false;
  if (/^[\d._\-/]+$/u.test(value)) return false;
  if (/^\p{P}+$/u.test(value)) return false;
  const lower = value.toLowerCase();
  if (STOP_ZH.has(value) || STOP_EN.has(lower)) return false;
  if (/^[\u3400-\u9fff]/u.test(value)) return value.length >= 2;
  return value.length >= 3;
}

/** Strip fenced code out of prose, keeping it for the identifier pass. */
function splitCode(body) {
  const fences = [];
  const prose = String(body ?? '').replace(/```[\s\S]*?```/gu, (block) => {
    fences.push(block.replace(/^```[^\n]*\n/u, '').replace(/```$/u, ''));
    return ' ';
  });
  return { prose, code: fences.join('\n') };
}

/**
 * The note's own writing structure: title plus one block per Markdown heading.
 *
 * Sections matter because co-occurrence should mean "these two ideas are made
 * in the same paragraph of the note", not "they both appear somewhere". Without
 * that, every topic pairs with every other and community detection has nothing
 * real to partition.
 *
 * @param note - one stored note row.
 * @returns `[{ text, weight }]`, title first.
 */
function noteSections(note) {
  const title = String(note?.title ?? '');
  let body = String(note?.body ?? '');
  // The template repeats the title as an H1; counting it twice inflates it.
  body = body.replace(/^#\s+.*\n?/u, '');
  const blocks = body
    .split(/\n(?=#{1,6}\s)/u)
    .map((block) => block.replace(/^#{1,6}\s+.*\n?/u, '').trim())
    .filter((block) => block !== '');
  return [{ text: title, weight: 3 }, ...blocks.map((text) => ({ text, weight: 1 }))];
}

/** Count occurrences of the already-kept terms inside one section. */
function countKeptTerms(text, kept) {
  const counts = new Map();
  const bump = (raw) => {
    const key = String(raw ?? '').trim().toLowerCase();
    if (kept.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const match of String(text).matchAll(/[A-Za-z][A-Za-z0-9_$-]{2,}/gu)) bump(match[0]);
  const segmenter = wordSegmenter();
  if (segmenter === null) {
    for (const match of String(text).matchAll(/[\u3400-\u9fff]{2,3}/gu)) bump(match[0]);
  } else {
    for (const piece of segmenter.segment(String(text))) {
      if (piece.isWordLike === true) bump(piece.segment);
    }
  }
  return counts;
}

/**
 * The terms a note is about, with a weight that doubles as edge strength.
 *
 * Title terms weigh ×3 (the title is the author's own summary), prose ×1, fenced
 * code ×0.7 (identifiers are evidence, not topics). The result is the note's
 * link to the topic layer: without it a single-note graph has nothing to draw.
 *
 * @param note - one stored note row.
 * @returns `{ terms, bag, sections }`: `terms` sorted by weight, `bag` the
 *   lower-cased term → weight map, `sections` per-block term counts.
 */
export function noteTerms(note) {
  const title = String(note?.title ?? '');
  const { prose, code } = splitCode(note?.body ?? '');
  const bag = new Map();

  const add = (term, weight) => {
    const value = String(term ?? '').trim();
    if (!isTopicTerm(value)) return;
    const key = value.toLowerCase();
    bag.set(key, (bag.get(key) ?? 0) + weight);
  };

  const addLatin = (text, weight) => {
    for (const match of String(text).matchAll(/[A-Za-z][A-Za-z0-9_$-]{2,}/gu)) add(match[0], weight);
  };

  const segmenter = wordSegmenter();
  const addCjk = (text, weight) => {
    if (segmenter === null) {
      // No segmenter: 2–3 char CJK runs are the standard cheap fallback.
      for (const match of String(text).matchAll(/[\u3400-\u9fff]{2,3}/gu)) add(match[0], weight);
      return;
    }
    for (const piece of segmenter.segment(String(text))) {
      if (piece.isWordLike !== true) continue;
      add(piece.segment, weight);
    }
  };

  addCjk(title, 3);
  addLatin(title, 3);
  addCjk(prose, 1);
  addLatin(prose, 1);
  addLatin(code, 0.7);

  const terms = [...bag.entries()]
    .map(([term, weight]) => ({ term, weight: Math.round(weight * 100) / 100 }))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, TOPICS_PER_NOTE);

  const kept = new Map();
  for (const row of terms) kept.set(row.term, row.weight);
  const sections = noteSections(note).map((section) => ({
    weight: section.weight,
    counts: countKeptTerms(section.text, kept),
  }));
  return { terms, bag: kept, sections };
}

/**
 * Louvain community detection over a weighted undirected graph.
 *
 * One level is enough here: the notes graph is a few thousand nodes at worst and
 * the UI only needs stable, size-ordered regions. Community ids are renumbered
 * so id 0 is the largest region, which keeps the palette stable across reloads.
 *
 * @param nodes - rows with `id`.
 * @param links - rows with `source`, `target`, `weight`.
 * @returns `{ labels: Map<string, number>, sizes: number[] }`.
 */
export function detectNoteCommunities(nodes, links) {
  const ids = nodes.map((node) => String(node.id)).sort();
  const adjacency = new Map(ids.map((id) => [id, new Map()]));
  let total = 0;
  for (const link of links) {
    const source = adjacency.get(String(link.source));
    const target = adjacency.get(String(link.target));
    if (source === undefined || target === undefined) continue;
    const weight = Math.max(1e-6, Number(link.weight ?? 1) || 1);
    source.set(String(link.target), (source.get(String(link.target)) ?? 0) + weight);
    target.set(String(link.source), (target.get(String(link.source)) ?? 0) + weight);
    total += weight;
  }

  if (total === 0) {
    return { labels: new Map(ids.map((id, index) => [id, index])), sizes: ids.map(() => 1) };
  }

  const m2 = total * 2;
  const degree = new Map();
  for (const [id, neighbours] of adjacency) {
    let sum = 0;
    for (const weight of neighbours.values()) sum += weight;
    degree.set(id, sum);
  }

  const community = new Map(ids.map((id) => [id, id]));
  const totals = new Map(ids.map((id) => [id, degree.get(id) ?? 0]));
  const epsilon = 1e-12;

  for (let pass = 0; pass < 24; pass += 1) {
    let moved = false;
    for (const id of ids) {
      const neighbours = adjacency.get(id);
      if (neighbours === undefined || neighbours.size === 0) continue;
      const current = community.get(id);
      const weight = degree.get(id) ?? 0;
      const toCommunity = new Map();
      for (const [other, edgeWeight] of neighbours) {
        const target = community.get(other);
        toCommunity.set(target, (toCommunity.get(target) ?? 0) + edgeWeight);
      }
      totals.set(current, (totals.get(current) ?? 0) - weight);
      let best = current;
      let bestGain = 0;
      for (const [candidate, edgeWeight] of toCommunity) {
        const gain = edgeWeight - ((totals.get(candidate) ?? 0) * weight) / m2;
        if (gain > bestGain + epsilon) {
          bestGain = gain;
          best = candidate;
        }
      }
      totals.set(best, (totals.get(best) ?? 0) + weight);
      if (best !== current) {
        community.set(id, best);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const groups = new Map();
  for (const id of ids) {
    const key = community.get(id);
    const list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
  }
  const rows = [...groups.values()].sort((a, b) => b.length - a.length
    || String(a[0]).localeCompare(String(b[0])));
  const labels = new Map();
  rows.forEach((list, index) => list.forEach((id) => labels.set(id, index)));
  return { labels, sizes: rows.map((list) => list.length) };
}

/** TF-IDF cosine plus Jaccard over two term bags; `df` is the document frequency. */
function lexicalSimilarity(a, b, df, documentCount) {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  let shared = 0;
  for (const [term, weight] of a) {
    const idf = Math.log(1 + documentCount / Math.max(1, df.get(term) ?? 1));
    const value = weight * idf;
    na += value * value;
    const otherWeight = b.get(term);
    if (otherWeight !== undefined) {
      const otherValue = otherWeight * idf;
      dot += value * otherValue;
      nb += otherValue * otherValue;
      shared += 1;
    }
  }
  for (const [term, weight] of b) {
    if (a.has(term)) continue;
    const idf = Math.log(1 + documentCount / Math.max(1, df.get(term) ?? 1));
    const value = weight * idf;
    nb += value * value;
  }
  const cosine = na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
  const union = a.size + b.size - shared;
  const jaccard = union === 0 ? 0 : shared / union;
  return 0.65 * cosine + 0.35 * jaccard;
}

/**
 * Build the notes graph.
 *
 * One node per note, nothing else: the knowledge points a note talks about live
 * on its edges rather than as extra nodes, so a library of ten notes draws ten
 * dots. Code files are deliberately not nodes here (that is the project graph's
 * job); a note keeps its `refs` count so the inspector can still say how many
 * code ranges it cites.
 *
 * Edges:
 *   `shares_topic`      note ↔ note, weight = summed term evidence  (EXTRACTED)
 *   `same_folder`       sparse chain inside one folder             (EXTRACTED)
 *   `shared_reference`  sparse chain inside one cited range        (EXTRACTED)
 *   `similar`           note ↔ note, lexical or embedding score     (INFERRED)
 *
 * Sparse chains replace the old pairwise edges: n notes in one folder used to
 * cost n(n-1)/2 links and now cost n-1.
 *
 * @param notes - the stored note rows.
 * @param folders - the stored folder rows.
 * @param options - `{ root, embed }`; `embed` upgrades note↔note edges to cosine.
 * @returns a promise of `{ nodes, links, stats }`.
 */
export async function buildNotesGraph(notes, folders, options = {}) {
  const list = (Array.isArray(notes) ? notes : [])
    .filter((note) => note !== null && typeof note === 'object' && typeof note.id === 'string');
  const folderRows = Array.isArray(folders) ? folders : [];
  const nodes = [];
  const links = [];
  const byId = new Map();
  const termByNote = new Map();

  for (const note of list) {
    const refs = Array.isArray(note.codeRefs) ? note.codeRefs : [];
    const node = {
      id: `note://${note.id}`,
      label: String(note.title ?? '未命名笔记'),
      kind: 'note',
      path: '',
      line: 0,
      endLine: 0,
      degree: 0,
      noteId: note.id,
      folderId: note.folderId ?? null,
      refs: refs.length,
      updatedAt: note.updatedAt,
    };
    nodes.push(node);
    byId.set(node.id, node);

    termByNote.set(note.id, noteTerms(note));
  }

  // Shared vocabulary: one node per note means the topic layer has to live on the
  // edge instead of in extra nodes. Two notes that raise the same distinctive
  // terms are related even when their prose differs.
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const bagA = termByNote.get(a.id)?.bag ?? new Map();
      const bagB = termByNote.get(b.id)?.bag ?? new Map();
      let shared = 0;
      let weight = 0;
      const evidence = [];
      for (const [term, value] of bagA) {
        const other = bagB.get(term);
        if (other === undefined) continue;
        shared += 1;
        weight += Math.min(value, other);
        if (evidence.length < 5) evidence.push(term);
      }
      if (shared < 2) continue;
      links.push({
        id: String(links.length),
        source: `note://${a.id}`,
        target: `note://${b.id}`,
        relation: 'shares_topic',
        family: 'structure',
        confidence: 'EXTRACTED',
        weight: Math.round(weight * 100) / 100,
        evidence,
      });
    }
  }

  // Folder membership: a chain, not a clique.
  const folderMembers = new Map();
  for (const note of list) {
    if (note.folderId === null || note.folderId === undefined) continue;
    const members = folderMembers.get(note.folderId) ?? [];
    members.push(note);
    folderMembers.set(note.folderId, members);
  }
  for (const [folderId, members] of folderMembers) {
    members.sort((a, b) => Number(a.updatedAt ?? 0) - Number(b.updatedAt ?? 0)
      || String(a.id).localeCompare(String(b.id)));
    for (let i = 1; i < members.length; i += 1) {
      links.push({
        id: String(links.length),
        source: `note://${members[i - 1].id}`,
        target: `note://${members[i].id}`,
        relation: 'same_folder',
        family: 'structure',
        confidence: 'EXTRACTED',
        weight: 1,
        evidence: [String(folderId)],
      });
    }
  }

  // Shared code range: also a chain, one link per consecutive pair per group.
  const refMembers = new Map();
  for (const note of list) {
    for (const ref of note.codeRefs ?? []) {
      if (ref === null || typeof ref !== 'object' || typeof ref.path !== 'string') continue;
      const key = `${ref.path}#L${Number(ref.line ?? 0)}`;
      const members = refMembers.get(key) ?? [];
      members.push(note);
      refMembers.set(key, members);
    }
  }
  for (const [key, members] of refMembers) {
    members.sort((a, b) => Number(a.updatedAt ?? 0) - Number(b.updatedAt ?? 0)
      || String(a.id).localeCompare(String(b.id)));
    for (let i = 1; i < members.length; i += 1) {
      links.push({
        id: String(links.length),
        source: `note://${members[i - 1].id}`,
        target: `note://${members[i].id}`,
        relation: 'shared_reference',
        family: 'structure',
        confidence: 'EXTRACTED',
        weight: 1,
        evidence: [key],
      });
    }
  }

  // Note↔note similarity: embedding cosine when Ollama answers, else lexical.
  let method = 'lexical';
  let embedding = {
    available: false, model: null, dims: 0, error: null, reason: 'disabled',
  };
  let vectors;
  if (options.embed === true && typeof options.root === 'string' && options.root !== '') {
    try {
      vectors = await noteVectors(options.root, list);
      embedding = {
        available: vectors.available === true,
        model: vectors.model ?? null,
        dims: vectors.dims ?? 0,
        error: vectors.error ?? null,
        reason: vectors.reason ?? null,
      };
      if (vectors.available === true) method = 'embedding';
    } catch (error) {
      embedding = {
        available: false, model: null, dims: 0, error: String(error?.message ?? error), reason: 'exception',
      };
    }
  }

  if (list.length >= 2 && list.length <= MAX_PAIR_NOTES) {
    const df = new Map();
    for (const note of list) {
      for (const term of termByNote.get(note.id)?.bag.keys() ?? []) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
    const candidates = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        let score = 0;
        if (method === 'embedding') {
          score = cosineSimilarity(vectors?.byHash.get(a.id), vectors?.byHash.get(b.id));
          if (score < EMBED_MIN_SCORE) continue;
        } else {
          score = lexicalSimilarity(termByNote.get(a.id)?.bag ?? new Map(), termByNote.get(b.id)?.bag ?? new Map(), df, list.length);
          if (score < LEXICAL_MIN_SCORE) continue;
        }
        candidates.push({ a, b, score });
      }
    }
    // Top-k per note: a note should not become a hub just because it shares
    // boilerplate vocabulary with everything else.
    const kept = new Map();
    for (const row of candidates.sort((x, y) => y.score - x.score)) {
      const key = `${row.a.id}|${row.b.id}`;
      const countA = kept.get(row.a.id) ?? 0;
      const countB = kept.get(row.b.id) ?? 0;
      if (countA >= SIMILAR_TOP_K || countB >= SIMILAR_TOP_K) continue;
      kept.set(row.a.id, countA + 1);
      kept.set(row.b.id, countB + 1);
      links.push({
        id: String(links.length),
        source: `note://${row.a.id}`,
        target: `note://${row.b.id}`,
        relation: 'similar',
        family: 'meaning',
        confidence: 'INFERRED',
        weight: Math.round(row.score * 1000) / 1000,
        evidence: [method],
        score: Math.round(row.score * 1000) / 1000,
        method,
      });
    }
  }

  const degree = new Map();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }
  for (const node of nodes) node.degree = degree.get(node.id) ?? 0;

  const { labels, sizes } = detectNoteCommunities(nodes, links);
  const hubOf = new Map();
  for (const node of nodes) {
    const community = labels.get(node.id) ?? 0;
    const best = hubOf.get(community);
    if (best === undefined || Number(node.degree ?? 0) > Number(best.degree ?? 0)) hubOf.set(community, node);
  }
  for (const node of nodes) {
    const community = labels.get(node.id) ?? 0;
    node.community = community;
    node.communityLabel = hubOf.get(community)?.label ?? `#${community}`;
    node.memberCount = sizes[community] ?? 1;
  }

  let anchors = { fresh: 0, moved: 0, drifted: 0, missing: 0 };
  for (const note of list) {
    const rows = Array.isArray(note.anchors) ? note.anchors : [];
    anchors = { ...anchors };
    for (const anchor of rows) {
      const status = String(anchor?.status ?? '');
      if (status in anchors) anchors[status] += 1;
    }
  }

  return {
    nodes,
    links,
    stats: {
      version: NOTE_GRAPH_VERSION,
      notes: list.length,
      folders: folderRows.length,
      topics: [...termByNote.values()].reduce((sum, row) => sum + (row?.bag?.size ?? 0), 0),
      links: links.length,
      communities: sizes.filter((size) => size > 0).length,
      method,
      embedding,
      anchors,
      byRelation: links.reduce((counts, link) => {
        counts[link.relation] = (counts[link.relation] ?? 0) + 1;
        return counts;
      }, {}),
    },
  };
}


/* ------------------------------------------------------------------ *
 * Export                                                             *
 * ------------------------------------------------------------------ */

/** Characters Windows refuses in a file name, plus the reserved stems. */
const UNSAFE_STEM = /[<>:"/\\|?*\u0000-\u001f]/gu;
const RESERVED_STEMS = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * A file name that every supported OS accepts.
 * @param title - the note title.
 * @returns a safe stem, without an extension.
 */
export function safeStem(title) {
  let stem = String(title ?? '').replace(UNSAFE_STEM, ' ').replace(/\s+/gu, ' ').trim();
  stem = stem.replace(/^\.+/u, '').replace(/[. ]+$/u, '');
  if (stem === '') stem = 'note';
  if (RESERVED_STEMS.has(stem.toLowerCase())) stem = `${stem}_`;
  return stem.slice(0, 80);
}

/**
 * Pick a file name no note in this batch has used yet.
 * @param title - the note title.
 * @param taken - lower-cased names already claimed in this batch.
 * @returns a `.md` name.
 */
function claimName(title, taken) {
  const stem = safeStem(title);
  let name = `${stem}.md`;
  let suffix = 2;
  while (taken.has(name.toLowerCase())) {
    name = `${stem}-${suffix}.md`;
    suffix += 1;
  }
  taken.add(name.toLowerCase());
  return name;
}

/** The visible folder Markdown exports land in, relative to the workspace root. */
export const EXPORT_DIR_NAME = 'notes-export';

/**
 * Write a note to Markdown inside the workspace, where the reader can find it.
 *
 * Exported rather than left in memory because the point of a note is to outlive
 * the app that wrote it.
 * @param root - absolute workspace root.
 * @param note - the note row.
 * @param existing - file names already in the export directory.
 * @returns the absolute path written.
 */
export async function exportNote(root, note, existing = []) {
  const dir = join(root, EXPORT_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  const stem = safeStem(note.title);
  let name = `${stem}.md`;
  const taken = new Set(existing.map((entry) => entry.toLowerCase()));
  if (taken.has(name.toLowerCase())) {
    const stamp = new Date(note.updatedAt ?? Date.now()).toISOString().replace(/[:.]/gu, '-').slice(0, 19);
    name = `${stem}-${stamp}.md`;
  }
  const target = join(dir, name);
  await fs.writeFile(target, String(note.body ?? ''), 'utf8');
  return target;
}

/**
 * Export a whole batch of notes as one `.md` file each, side by side.
 *
 * Two notes may share a title (imported files often do), so names are claimed
 * against the batch as it is written instead of against the directory's prior
 * contents — re-exporting the same note then overwrites its own file rather
 * than piling up copies.
 *
 * The library's folder tree is mirrored into the export directory: a note in
 * `笔记/图谱` lands in `notes-export/笔记/图谱/`, because a folder structure
 * that only exists inside the app is not the structure the user can see.
 * @param root - absolute workspace root.
 * @param notes - the note rows to write.
 * @param options - `folderPaths` maps note id -> folder name segments;
 *   `ensureFolders` lists segments of folders to create even when empty.
 * @returns `{dir, files: [{id, title, path}]}`.
 */
export async function exportNotes(root, notes, options = {}) {
  const dir = join(root, EXPORT_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  const folderPaths = options.folderPaths ?? {};
  const takenByDir = new Map();
  const files = [];
  for (const note of notes) {
    const segments = folderSegmentsFor(folderPaths[note.id]);
    const noteDir = join(dir, ...segments);
    await fs.mkdir(noteDir, { recursive: true });
    const key = noteDir.toLowerCase();
    const taken = takenByDir.get(key) ?? new Set();
    takenByDir.set(key, taken);
    const name = claimName(note.title, taken);
    const target = join(noteDir, name);
    await fs.writeFile(target, String(note.body ?? ''), 'utf8');
    files.push({ id: note.id, title: note.title, path: target });
  }
  for (const row of options.ensureFolders ?? []) {
    const segments = folderSegmentsFor(row);
    if (segments.length > 0) await fs.mkdir(join(dir, ...segments), { recursive: true });
  }
  return { dir, files };
}

/**
 * Turn folder names into filesystem-safe path segments.
 * @param segments - the folder names, outermost first.
 * @returns segments that survive on every supported OS.
 */
function folderSegmentsFor(segments) {
  if (!Array.isArray(segments)) return [];
  const out = [];
  for (const segment of segments) {
    const text = String(segment ?? '').trim();
    if (text === '') continue;
    out.push(safeStem(text));
  }
  return out;
}

/**
 * The title an imported Markdown file should take.
 *
 * A `# H1` wins because that is what the file itself says it is called; the
 * file name is the fallback, and the body keeps its H1 either way — the reader
 * strips it when rendering, exactly like a note written in the app.
 * @param text - the Markdown source.
 * @param fallback - the file stem, when the file states no heading.
 * @returns a one-line title.
 */
export function importTitle(text, fallback = '') {
  const match = /^\s*#\s+(.+?)\s*$/mu.exec(String(text ?? ''));
  const title = match === null ? '' : match[1].trim();
  if (title !== '') return title.slice(0, 120);
  const stem = String(fallback ?? '').replace(/\.(md|markdown|txt)$/iu, '').trim();
  return stem === '' ? '导入的笔记' : stem.slice(0, 120);
}
