/**
 * One-shot knowledge-point title for a code frame.
 *
 * The frame is created as soon as the reader adds a selection because the
 * composer must not wait for a model. This call then replaces the neutral
 * placeholder with a short noun phrase derived from the selected code. The note
 * generator reuses that exact string, so the box's title and the note's H1 are
 * the same title rather than two independent model guesses.
 *
 * Failure is non-fatal: the frame keeps its placeholder, and a later note
 * generation can fill it from the note model's `## 标题`.
 */

import { resolveLlm } from './answer.js';
import { DEFAULT_TITLE_PROMPT } from './prompts.js';
import { cleanTitle, clipTitle, readRangeDetailed } from './notes.js';

/** How many characters of selected code the title call sees. */
const MAX_TITLE_CODE_CHARS = 2400;

/** Output budget: a title is one short line. */
const TITLE_MAX_TOKENS = 256;

/**
 * Render the user message for the title call.
 * @param options - `{ path, startLine, endLine, code }`.
 * @returns the user text.
 */
function titleUserMessage(options = {}) {
  const path = String(options.path ?? '');
  const start = Math.max(1, Math.trunc(Number(options.startLine) || 1));
  const end = Math.max(start, Math.trunc(Number(options.endLine) || start));
  const code = String(options.code ?? '').slice(0, MAX_TITLE_CODE_CHARS);
  return [
    `文件：${path}`,
    `行范围：${start}-${end}`,
    '',
    '选中的代码：',
    '```',
    code,
    '```',
  ].join('\n');
}

/**
 * Ask the configured model for one title.
 *
 * @param ctx - the Cordis context, for the LLM and default-model services.
 * @param options - `{ root, path, startLine, endLine }`.
 * @returns `{ ok: true, title }` or `{ ok: false, error }`.
 */
export async function generateFrameTitle(ctx, options = {}) {
  const resolved = resolveLlm(ctx);
  if (!resolved.ok) return { ok: false, error: resolved.message };

  const path = String(options.path ?? '').replace(/\\/gu, '/').replace(/^\/+/u, '');
  if (path === '') return { ok: false, error: 'a frame path is required' };
  const start = Math.max(1, Math.trunc(Number(options.startLine) || 1));
  const end = Math.max(start, Math.trunc(Number(options.endLine) || start));
  const detailed = await readRangeDetailed(options.root, path, start, end, 40);
  if (detailed === null) return { ok: false, error: 'the selected range could not be read' };

  const user = titleUserMessage({ path, startLine: start, endLine: end, code: detailed.text });
  let error = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = [];
    let failed = null;
    try {
      const stream = resolved.llm.stream({
        provider: resolved.route.provider,
        model: resolved.route.model,
        ...(resolved.route.reasoningEffort === undefined
          ? {} : { reasoningEffort: resolved.route.reasoningEffort }),
        messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
        system: DEFAULT_TITLE_PROMPT,
        maxTokens: TITLE_MAX_TOKENS,
      });
      for await (const chunk of stream) {
        if (chunk === null || typeof chunk !== 'object') continue;
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') parts.push(chunk.text);
        else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
          failed = String(chunk.reason.failure?.message ?? 'the title model call failed');
        }
      }
    } catch (thrown) {
      failed = thrown instanceof Error ? thrown.message : String(thrown);
    }
    const text = parts.join('').trim();
    if (failed === null && text !== '') {
      const title = normaliseTitle(text);
      if (title !== '') return { ok: true, title };
    }
    error = failed ?? 'the model returned no usable title';
  }
  return { ok: false, error };
}

/** Turn the model's first line into a valid knowledge-point title, or ''. */
function normaliseTitle(text) {
  const first = String(text ?? '').split('\n').find((line) => line.trim() !== '') ?? '';
  let title = first.replace(/^[-*]\s*/u, '').replace(/^标题\s*[：:]\s*/u, '');
  title = cleanTitle(title);
  if (title === '') return '';
  // The prompt forbids locations; reject a title that is still only a path/range
  // rather than storing something the reader cannot use as a knowledge point.
  if (/^[^\s]+\.[A-Za-z0-9]+\s*(第\s*)?\d+([-–~]\d+)?\s*行?$/u.test(title)) return '';
  title = clipTitle(title, 22);
  return title.length >= 2 ? title : '';
}
