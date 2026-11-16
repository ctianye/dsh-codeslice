/**
 * A Markdown subset, rendered to React nodes.
 *
 * Scoped to what a *note* actually contains: headings, lists, fenced code,
 * inline code, emphasis, links, and `path:line` citations. Not a general
 * Markdown engine — raw HTML is deliberately not supported (no
 * `dangerouslySetInnerHTML` anywhere in this bundle), and nested blocks are not
 * attempted, which is exactly the original's contract
 * (`Markdown.tsx:8-26`, `spec §6.3`).
 *
 * Two details are load-bearing and were mined as-is:
 *
 *   1. A closing fence must be at least as long as its opener. Without that, a
 *      note that quotes a Markdown file inside a fence terminates its own code
 *      block early and the rest of the note renders as prose.
 *   2. `path:line` is recognised in *prose only*. Code spans are tokenized
 *      first, so `a.py:1` inside backticks stays literal text, and the boundary
 *      class means `（src/a.ts:12-30）` works while `Dockerfile:3` does not.
 */

/**
 * `path:line` in prose, verbatim from `Markdown.tsx:427`.
 *
 * The leading boundary is consumed by the match, which is why `pushPlain`
 * re-emits the chunk before `match.index` rather than from it.
 */
const CITE = /(^|[\s(（[`"'])([\w@./\\-]+\.[A-Za-z0-9]{1,8}):L?(\d+)(?:[-–](\d+))?(?=$|[\s),.;:，。；）\]`"'])/g;

/** Fence: three or more backticks or tildes, optional language (`Markdown.tsx:82`). */
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/u;
/** ATX heading: one to six `#`, a space, then text. */
const HEADING = /^(#{1,6})\s+(.*)$/u;
/** Horizontal rule: three or more of one marker, alone on a line. */
const HR = /^\s*([-*_])\1{2,}\s*$/u;
/** Unordered list item. */
const UL = /^\s{0,3}[-*+]\s+(.*)$/u;
/** Ordered list item. */
const OL = /^\s{0,3}(\d+)[.)]\s+(.*)$/u;
/** Blockquote. */
const QUOTE = /^\s{0,3}>\s?(.*)$/u;
/** Standalone image. */
const IMAGE = /^\s*!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)\s*$/u;
/** A pipe table's separator row. */
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/u;

/**
 * Split a table row on unescaped pipes outside backticks.
 *
 * `\|` is an escape, which is the only way to put a pipe in a cell
 * (`Markdown.tsx:95-119`).
 * @param line - the row.
 * @returns the cell texts, trimmed.
 */
function splitRow(line) {
  const text = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '\\' && text[index + 1] === '|') {
      cell += '|';
      index += 1;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Is a row a valid table separator, and what are the alignments?
 * @param line - the candidate row.
 * @returns `null` when it is not a separator, else one alignment per column.
 */
function tableAlignments(line) {
  if (!TABLE_SEP.test(line)) return null;
  return splitRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });
}

/**
 * Block-level parse.
 *
 * @param text - the Markdown source.
 * @returns an array of block descriptors; `renderBlocks` turns them into nodes.
 */
function parseBlocks(text) {
  const source = String(text ?? '').replace(/\r\n?/gu, '\n');
  const lines = source.split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = fence[2];
      const indent = fence[1].length;
      const body = [];
      index += 1;
      while (index < lines.length) {
        const closing = FENCE.exec(lines[index]);
        // Shorter or differently-marked fence does not close this block: that
        // is what keeps a quoted Markdown file from terminating the outer code.
        if (closing !== null && closing[2][0] === marker[0] && closing[2].length >= marker.length) {
          index += 1;
          break;
        }
        body.push(lines[index].slice(Math.min(indent, lines[index].length)));
        index += 1;
      }
      blocks.push({ type: 'code', lang: fence[3] ?? '', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|')) {
      const alignments = tableAlignments(lines[index + 1]);
      if (alignments !== null) {
        const header = splitRow(line);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
          rows.push(splitRow(lines[index]));
          index += 1;
        }
        blocks.push({ type: 'table', header, alignments, rows });
        continue;
      }
    }

    const image = IMAGE.exec(line);
    if (image !== null) {
      blocks.push({ type: 'image', alt: image[1], src: image[2], title: image[3] ?? '' });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted = [];
      while (index < lines.length) {
        const match = QUOTE.exec(lines[index]);
        if (match === null) break;
        quoted.push(match[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoted });
      continue;
    }

    if (UL.test(line)) {
      const items = [];
      while (index < lines.length) {
        const match = UL.exec(lines[index]);
        if (match === null) break;
        items.push(match[1]);
        index += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (OL.test(line)) {
      const items = [];
      let start = 1;
      while (index < lines.length) {
        const match = OL.exec(lines[index]);
        if (match === null) break;
        if (items.length === 0) start = Number(match[1]);
        items.push(match[2]);
        index += 1;
      }
      blocks.push({ type: 'ol', items, start });
      continue;
    }

    // Paragraph: consecutive non-blank, non-block-starting lines.
    const paragraph = [];
    while (index < lines.length) {
      const current = lines[index];
      if (current.trim() === '') break;
      if (FENCE.test(current) || HEADING.test(current) || HR.test(current)
        || UL.test(current) || OL.test(current) || QUOTE.test(current)
        || IMAGE.test(current)) break;
      if (index + 1 < lines.length && current.includes('|') && tableAlignments(lines[index + 1]) !== null) break;
      paragraph.push(current);
      index += 1;
    }
    if (paragraph.length === 0) {
      // A line that only looked like a block start but was not (e.g. `#` alone):
      // consume it so the loop cannot spin.
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

/**
 * Inline tokens, in the original's precedence order (`Markdown.tsx:442-443`):
 * code, image, link, bold, italic. Anything unmatched is literal text.
 *
 * Precedence matters: `**a `b` c**` has to keep the code span intact, so code is
 * matched before emphasis and its contents are never re-scanned.
 */
const INLINE = /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*]+?)\*|_([^_]+?)_/u;

/**
 * Tokenize one inline string into text / code / link / strong / em / cite.
 * @param text - the raw inline source.
 * @param keyBase - a prefix so React keys stay unique across siblings.
 * @returns tokens.
 */
function tokenizeInline(text, keyBase) {
  const tokens = [];
  let rest = String(text ?? '');
  let guard = 0;

  while (rest !== '' && guard < 4000) {
    guard += 1;
    const match = INLINE.exec(rest);
    if (match === null) {
      tokens.push({ type: 'text', text: rest });
      break;
    }
    if (match.index > 0) tokens.push({ type: 'text', text: rest.slice(0, match.index) });
    const whole = match[0];
    rest = rest.slice(match.index + whole.length);

    if (match[2] !== undefined) {
      tokens.push({ type: 'code', text: match[2].trim() === '' ? match[2] : match[2] });
    } else if (match[4] !== undefined) {
      tokens.push({
        type: 'image', alt: match[3] ?? '', src: match[4], title: match[5] ?? '',
      });
    } else if (match[7] !== undefined) {
      tokens.push({
        type: 'link', text: match[6] ?? '', href: match[7], title: match[8] ?? '',
      });
    } else if (match[9] !== undefined) {
      tokens.push({ type: 'strong', text: match[9] });
    } else if (match[10] !== undefined) {
      tokens.push({ type: 'strong', text: match[10] });
    } else if (match[11] !== undefined) {
      tokens.push({ type: 'em', text: match[11] });
    } else if (match[12] !== undefined) {
      tokens.push({ type: 'em', text: match[12] });
    }
  }

  return tokens.map((token, index) => ({ ...token, key: `${keyBase}-${index}` }));
}

/**
 * Split plain text into text runs and citation tokens.
 *
 * Verbatim algorithm from `Markdown.tsx:469-484`: emit the slice before the
 * match, then a cite token, and advance past `match[0]` (which swallows the
 * boundary character so it is not emitted twice).
 * @param text - a plain-text run (never inside a code span).
 * @param keyBase - a key prefix.
 * @param onOpen - `(path, start, end) => void`, invoked on click.
 * @param t - the translator.
 * @returns an array of nodes.
 */
function pushPlain(text, keyBase, onOpen, t) {
  if (text === '') return [];
  const CITE_NODE = [];
  CITE.lastIndex = 0;
  let last = 0;
  let index = 0;
  let match = CITE.exec(text);
  while (match !== null) {
    const path = match[2];
    const start = Number(match[3]);
    const end = match[4] === undefined ? start : Number(match[4]);
    const at = match.index + (match[1] === undefined ? 0 : match[1].length);
    if (at > last) CITE_NODE.push(text.slice(last, at));
    const label = match[4] === undefined ? `${path}:${start}` : `${path}:${start}-${end}`;
    CITE_NODE.push(h('button', {
      key: `${keyBase}-c${index}`,
      type: 'button',
      className: 'cs-cite',
      title: label,
      onClick: () => { if (typeof onOpen === 'function') onOpen(path, start, end); },
    }, h('span', null, label)));
    index += 1;
    last = match.index + match[0].length;
    match = CITE.exec(text);
  }
  if (last < text.length) CITE_NODE.push(text.slice(last));
  // Interleave: strings become text nodes, the injected nodes stay as they are.
  return CITE_NODE.map((piece, offset) => (
    typeof piece === 'string'
      ? piece
      : h('span', { key: `${keyBase}-cw${offset}`, className: 'cs-cite-wrap' }, piece)
  ));
}

/**
 * Render one inline string.
 * @param text - the source.
 * @param keyBase - a key prefix.
 * @param onOpen - `(path, start, end) => void`.
 * @param t - the translator (only used for fallbacks).
 * @returns nodes.
 */
function renderInline(text, keyBase, onOpen, t) {
  const tokens = tokenizeInline(text, keyBase);
  const out = [];
  for (const token of tokens) {
    if (token.type === 'text') {
      out.push(...pushPlain(token.text, token.key, onOpen, t));
      continue;
    }
    if (token.type === 'code') {
      out.push(h('code', { key: token.key }, token.text));
      continue;
    }
    if (token.type === 'strong') {
      out.push(h('strong', { key: token.key }, renderInline(token.text, token.key, onOpen, t)));
      continue;
    }
    if (token.type === 'em') {
      out.push(h('em', { key: token.key }, renderInline(token.text, token.key, onOpen, t)));
      continue;
    }
    if (token.type === 'link') {
      // `noopener noreferrer` and a new tab: a note may quote any URL, and the
      // panel must not become a navigation surface.
      out.push(h('a', {
        key: token.key,
        href: token.href,
        title: token.title === '' ? undefined : token.title,
        target: '_blank',
        rel: 'noreferrer noopener',
      }, renderInline(token.text, token.key, onOpen, t)));
      continue;
    }
    if (token.type === 'image') {
      // An image that cannot load degrades to its alt text rather than an icon.
      out.push(h('span', { key: token.key, className: 'cs-md-img-alt' }, token.alt === '' ? token.src : token.alt));
    }
  }
  return out;
}

/**
 * Render a Markdown document.
 *
 * @param props - `{text, onOpenCitation, t}`:
 *   `text` is the Markdown source; `onOpenCitation(path, start, end)` is called
 *   when a `path:line` chip or a `path:line`-bearing link is clicked; `t` is the
 *   translator (the copy button's two labels only).
 * @returns the rendered block list.
 */
export function Markdown(props) {
  const {
    text, onOpenCitation, t,
  } = props;
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const [copied, setCopied] = useState(-1);

  useEffect(() => {
    if (copied < 0) return undefined;
    const timer = setTimeout(() => setCopied(-1), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const open = typeof onOpenCitation === 'function' ? onOpenCitation : () => {};

  const nodes = blocks.map((block, index) => {
    const key = `b${index}`;
    if (block.type === 'heading') {
      // `#`/`##` become an h3: the reader already renders the note's title, so a
      // real h1 here would fight it (`spec §6.2`).
      const tag = block.level <= 2 ? 'h3' : block.level === 3 ? 'h4' : 'h5';
      return h(tag, { key }, renderInline(block.text, key, open, t));
    }
    if (block.type === 'code') {
      return h('div', { key, className: 'cs-md-code' },
        h('div', { className: 'cs-md-code-head' },
          h('span', { className: 'cs-grow cs-ellipsis' }, block.lang === '' ? 'text' : block.lang),
          h('button', {
            type: 'button',
            className: 'cs-btn cs-ghost cs-small',
            onClick: () => {
              const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
              if (clip === undefined || typeof clip.writeText !== 'function') return;
              clip.writeText(block.text).then(() => setCopied(index)).catch(() => {});
            },
          }, copied === index ? t('common.copied') : t('common.copy'))),
        h('pre', null, h('code', null, block.text)));
    }
    if (block.type === 'hr') return h('hr', { key, className: 'cs-md-hr' });
    if (block.type === 'quote') {
      return h('blockquote', { key }, block.lines.map((line, lineIndex) => (
        h('p', { key: `${key}-${lineIndex}` }, renderInline(line, `${key}-${lineIndex}`, open, t))
      )));
    }
    if (block.type === 'ul' || block.type === 'ol') {
      const tag = block.type === 'ul' ? 'ul' : 'ol';
      return h(tag, { key, ...(block.type === 'ol' && block.start !== 1 ? { start: block.start } : {}) },
        block.items.map((item, itemIndex) => (
          h('li', { key: `${key}-${itemIndex}` }, renderInline(item, `${key}-${itemIndex}`, open, t))
        )));
    }
    if (block.type === 'table') {
      const headCells = block.header.map((cell, cellIndex) => h('th', {
        key: cellIndex,
        style: block.alignments[cellIndex] === '' ? undefined : { textAlign: block.alignments[cellIndex] },
      }, renderInline(cell, `${key}-h${cellIndex}`, open, t)));

      const bodyRows = block.rows.map((row, rowIndex) => h('tr', { key: rowIndex },
        row.map((cell, cellIndex) => h('td', {
          key: cellIndex,
          style: block.alignments[cellIndex] === '' ? undefined : { textAlign: block.alignments[cellIndex] },
        }, renderInline(cell, `${key}-r${rowIndex}c${cellIndex}`, open, t)))));

      return h('div', { key, className: 'cs-md-table-wrap' },
        h('table', { className: 'cs-md-table' },
          h('thead', null, h('tr', null, headCells)),
          h('tbody', null, bodyRows)));
    }
    if (block.type === 'image') {
      return h('div', { key, className: 'cs-md-img' }, h('span', null, block.alt === '' ? block.src : block.alt));
    }
    return h('p', { key, className: 'cs-md-p' }, renderInline(block.text, key, open, t));
  });

  return h('div', { className: 'cs-md' }, nodes);
}

/**
 * Strip a leading `# Title` from a note body.
 *
 * The reader's title bar already shows it, so rendering it again reads like a
 * duplicate heading (`NoteReader.tsx:290-292`, `spec §12` invariant 12).
 * @param body - the note body.
 * @returns the body without its leading H1 and the blank lines after it.
 */
export function stripTitleLine(body) {
  return String(body ?? '').replace(/^#\s+.*(\r?\n)+/u, '');
}

/**
 * The list-row excerpt for a note.
 *
 * Verbatim rules from `NotesPanel.tsx:12-25`: strip the title, strip heading and
 * bullet markers, then drop a leading `知识点 | 要点 | 何时使用` label line.
 * @param body - the note body.
 * @param limit - maximum characters.
 * @returns a single-line excerpt.
 */
export function noteExcerpt(body, limit = 140) {
  const text = stripTitleLine(body)
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
    .replace(/^\s{0,3}[-*+]\s+/gmu, '')
    .trim();
  const labelled = text.replace(/^(知识点|要点|何时使用)[：:]\s*/u, '');
  const out = (labelled === '' ? text : labelled).replace(/\s+/gu, ' ');
  return out.length > limit ? `${out.slice(0, limit - 1)}…` : out;
}
