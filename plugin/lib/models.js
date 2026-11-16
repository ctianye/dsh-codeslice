/**
 * Local embedding model settings and an Ollama probe.
 *
 * Same product shape as the desktop app: two curated local presets, a status
 * probe for a running Ollama, and a custom system prompt. The one deliberate
 * safety rule is loopback-only: this module never talks to a remote host, so a
 * mis-typed base URL cannot turn a local reading aid into a network client.
 */

import { statePath, readJsonChecked, writeJson } from './store.js';

/** The only address the desktop app talks to by default. */
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

/** The two presets the desktop app offers, labels included. */
export const PRESETS = Object.freeze([
  {
    id: 'bge-m3',
    model: 'bge-m3',
    label: 'bge-m3',
    size: '1.2 GB',
    context: '8K',
    description: '中文与代码的综合表现最均衡，长文档召回稳，适合第一次配置。',
  },
  {
    id: 'qwen3-embedding:0.6b',
    model: 'qwen3-embedding:0.6b',
    label: 'qwen3-embedding 0.6B',
    size: '639 MB',
    context: '32K',
    description: '代码检索更强、上下文更长，体积只有 bge-m3 的一半。',
  },
]);

/** Settings used before the reader changes anything. */
export function defaultModelSettings() {
  return {
    embedding: {
      model: 'bge-m3',
      base_url: `${DEFAULT_BASE_URL}/v1`,
      api_key: 'ollama',
    },
    chat: {
      system_prompt: '',
    },
    updatedAt: 0,
  };
}

/** The settings file for one workspace. */
function settingsPath(root) {
  return statePath(root, 'models');
}

/** True for loopback hosts only (`127.0.0.1`, `localhost`, `::1`). */
function isLoopback(url) {
  try {
    const parsed = new URL(String(url));
    const host = parsed.hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/** Clamp one string setting. */
function text(value, fallback, max = 20000) {
  const body = typeof value === 'string' ? value.trim() : '';
  return body === '' ? fallback : body.slice(0, max);
}

/** Merge a patch over the current settings without accepting remote URLs. */
export function mergeModelSettings(current, patch = {}) {
  const base = current !== null && typeof current === 'object' ? current : defaultModelSettings();
  const embedding = patch.embedding !== null && typeof patch.embedding === 'object' ? patch.embedding : {};
  const chat = patch.chat !== null && typeof patch.chat === 'object' ? patch.chat : {};
  const baseUrl = text(embedding.base_url, base.embedding?.base_url ?? `${DEFAULT_BASE_URL}/v1`, 500);
  if (!isLoopback(baseUrl)) {
    const error = new Error('the embedding base URL must point at 127.0.0.1 or localhost');
    error.code = 'remote-url-refused';
    throw error;
  }
  return {
    embedding: {
      model: text(embedding.model, base.embedding?.model ?? 'bge-m3', 200),
      base_url: baseUrl,
      api_key: text(embedding.api_key, base.embedding?.api_key ?? 'ollama', 500),
    },
    chat: {
      system_prompt: typeof chat.system_prompt === 'string'
        ? chat.system_prompt.slice(0, 20000)
        : String(base.chat?.system_prompt ?? ''),
    },
    updatedAt: Date.now(),
  };
}

/**
 * Read one workspace's model settings.
 * @param root - absolute workspace root.
 * @returns the settings (defaults when the file is absent).
 * @throws when the file exists but is corrupt — user config is never replaced.
 */
export async function readModelSettings(root) {
  const checked = await readJsonChecked(settingsPath(root));
  if (checked.ok) return { ...defaultModelSettings(), ...checked.value };
  if (checked.reason === 'absent') return defaultModelSettings();
  const error = new Error(`model settings are unreadable: ${checked.detail}`);
  error.code = 'models-corrupt';
  throw error;
}

/** Write one workspace's model settings atomically. */
export async function writeModelSettings(root, patch) {
  const current = await readModelSettings(root);
  const next = mergeModelSettings(current, patch);
  await writeJson(settingsPath(root), next);
  return next;
}

/**
 * Probe the local Ollama.
 *
 * A failed probe is an answer ("Ollama is not running"), not an exception: the
 * settings screen still has to render and explain what is missing.
 * @param baseUrl - the API origin (defaults to 127.0.0.1:11434).
 * @param timeoutMs - probe budget.
 * @returns `{ available, base_url, openai_base_url, models, presets, error }`.
 */
export async function ollamaStatus(baseUrl = DEFAULT_BASE_URL, timeoutMs = 2000) {
  const origin = String(baseUrl).replace(/\/v1\/?$/u, '').replace(/\/+$/u, '');
  if (!isLoopback(origin)) {
    return {
      available: false,
      base_url: origin,
      openai_base_url: `${origin}/v1`,
      models: [],
      presets: PRESETS,
      error: 'only a loopback Ollama address is allowed',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return {
        available: false,
        base_url: origin,
        openai_base_url: `${origin}/v1`,
        models: [],
        presets: PRESETS,
        error: `Ollama answered HTTP ${response.status}`,
      };
    }
    const body = await response.json();
    const models = (Array.isArray(body?.models) ? body.models : [])
      .map((row) => String(row?.name ?? row?.model ?? ''))
      .filter((name) => name !== '');
    return {
      available: true,
      base_url: origin,
      openai_base_url: `${origin}/v1`,
      models,
      presets: PRESETS,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      base_url: origin,
      openai_base_url: `${origin}/v1`,
      models: [],
      presets: PRESETS,
      error: controller.signal.aborted
        ? 'Ollama did not answer in time'
        : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Embeddings                                                         *
 * ------------------------------------------------------------------ */

/**
 * The desktop's embedding limits, verbatim (`models/embeddings.py`).
 *
 * `MAX_EMBED_CHARS` is a guard against pathological files, not an exact token
 * budget; the shortening ladder is what makes one over-long chunk degrade to a
 * shorter prefix instead of failing the whole batch.
 */
export const MAX_EMBED_CHARS = 6000;
const EMBED_FALLBACK_CHARS = [MAX_EMBED_CHARS, 3000, 1500];

/** One request carries this many chunks (`index_batch_size` default). */
export const EMBED_BATCH_SIZE = 32;

/** Index work is CPU-bound and may take minutes per batch; a query must not. */
const EMBED_TIMEOUT_MS = 120000;
const EMBED_QUERY_TIMEOUT_MS = 4000;

/** Split a stored base URL into the native and OpenAI-compatible prefixes. */
function endpointsOf(baseUrl) {
  const origin = String(baseUrl ?? `${DEFAULT_BASE_URL}/v1`)
    .replace(/\/v1\/?$/u, '')
    .replace(/\/+$/u, '');
  return { origin, openai: `${origin}/v1` };
}

/** POST JSON with a timeout, turning HTTP failures into an Error a caller can log. */
async function postJson(url, body, timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal !== undefined && signal !== null) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${detail === '' ? '' : `: ${detail.slice(0, 200)}`}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/** A finite float list, or null when the provider answered something else. */
function vectorOf(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const number = Number(value[index]);
    if (!Number.isFinite(number)) return null;
    out[index] = number;
  }
  return out;
}

/**
 * One text → one vector, shortening the input when the model rejects its length.
 *
 * Tries the OpenAI-compatible endpoint first (what the settings screen validates)
 * and falls back to Ollama's native one: the two are the same daemon but older
 * Ollama builds implement the native route more strictly, and a reader who
 * pointed the base URL at `/v1` should not get an empty index because of it.
 */
async function embedOne(endpoints, model, text, timeoutMs) {
  for (const limit of EMBED_FALLBACK_CHARS) {
    const body = String(text ?? '').slice(0, limit);
    if (body.trim() === '') continue;
    const attempts = [
      [`${endpoints.openai}/embeddings`, { model, input: [body] }, 'data'],
      [`${endpoints.origin}/api/embeddings`, { model, prompt: body }, 'embedding'],
    ];
    for (const [url, payload, shape] of attempts) {
      try {
        const parsed = await postJson(url, payload, timeoutMs);
        const vector = shape === 'data'
          ? vectorOf(parsed?.data?.[0]?.embedding)
          : vectorOf(parsed?.embedding);
        if (vector !== null) return vector;
      } catch {
        // Try the other route, then a shorter prefix.
      }
    }
  }
  return null;
}

/**
 * Embed a batch of texts, returning one vector (or null) per input.
 *
 * The all-or-nothing property of one HTTP batch is why a failed batch is retried
 * input by input: Ollama rejects the whole request when a single input exceeds
 * its context, and losing 31 good chunks to one bad one is how an index ends up
 * with no vectors at all.
 *
 * @param options - `{ base_url, model, texts, batch_size, timeout_ms, on_batch, signal }`.
 * @returns `{ vectors, failed, error }`; `vectors[i]` is null when that text failed.
 */
export async function embedTexts(options = {}) {
  const texts = Array.isArray(options.texts) ? options.texts : [];
  const baseUrl = String(options.base_url ?? `${DEFAULT_BASE_URL}/v1`);
  const model = String(options.model ?? '').trim();
  if (texts.length === 0) return { vectors: [], failed: 0, error: null };
  if (model === '' || !isLoopback(baseUrl)) {
    return {
      vectors: texts.map(() => null),
      failed: texts.length,
      error: model === '' ? 'no embedding model is configured' : 'the embedding endpoint must be loopback',
    };
  }

  const endpoints = endpointsOf(baseUrl);
  const batchSize = Math.max(1, Math.trunc(Number(options.batch_size ?? EMBED_BATCH_SIZE)));
  const timeoutMs = Number(options.timeout_ms ?? EMBED_TIMEOUT_MS);
  const onBatch = typeof options.on_batch === 'function' ? options.on_batch : undefined;
  const vectors = [];
  let failed = 0;
  let lastError = null;

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize)
      .map((text) => String(text ?? '').slice(0, MAX_EMBED_CHARS));
    let rows = null;
    try {
      // The batch wire format is OpenAI's; `input` may be an array of strings.
      const parsed = await postJson(`${endpoints.openai}/embeddings`, {
        model,
        input: batch,
      }, timeoutMs, options.signal);
      const data = Array.isArray(parsed?.data) ? parsed.data : [];
      rows = batch.map((_, index) => {
        const row = data.find((item) => Number(item?.index) === index) ?? data[index];
        return vectorOf(row?.embedding);
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      rows = null;
    }

    if (rows === null) {
      // Whole batch refused: isolate each input so only the offending one degrades.
      rows = [];
      for (const text of batch) rows.push(await embedOne(endpoints, model, text, timeoutMs));
    } else {
      // A provider may answer the batch but leave one row empty; retry just those.
      for (let index = 0; index < rows.length; index += 1) {
        if (rows[index] === null) {
          rows[index] = await embedOne(endpoints, model, batch[index], timeoutMs);
        }
      }
    }

    for (const vector of rows) {
      if (vector === null) failed += 1;
      vectors.push(vector);
    }
    if (onBatch !== undefined) onBatch(Math.min(start + batchSize, texts.length), texts.length);
  }

  return {
    vectors,
    failed,
    error: failed === texts.length && lastError !== null ? lastError : null,
  };
}

/**
 * Embed one query. Returns null rather than throwing, so retrieval can fall back
 * to keyword-only when Ollama is not running.
 * @param options - `{ base_url, model, text, timeout_ms }`.
 * @returns the vector, or null.
 */
export async function embedQuery(options = {}) {
  const baseUrl = String(options.base_url ?? `${DEFAULT_BASE_URL}/v1`);
  const model = String(options.model ?? '').trim();
  const text = String(options.text ?? '');
  if (model === '' || text.trim() === '' || !isLoopback(baseUrl)) return null;
  return embedOne(
    endpointsOf(baseUrl),
    model,
    text,
    Number(options.timeout_ms ?? EMBED_QUERY_TIMEOUT_MS),
  );
}

/**
 * Ask Ollama for one embedding, to verify the configured model actually works.
 * @param options - `{ base_url, model, text, timeout_ms }`.
 * @returns `{ ok, model, dims, base_url, error }`.
 */
export async function testEmbedding(options = {}) {
  const baseUrl = String(options.base_url ?? `${DEFAULT_BASE_URL}/v1`);
  if (!isLoopback(baseUrl)) {
    return { ok: false, base_url: baseUrl, model: options.model ?? '', dims: 0, error: 'loopback only' };
  }
  const origin = baseUrl.replace(/\/v1\/?$/u, '').replace(/\/+$/u, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeout_ms ?? 20000));
  try {
    const response = await fetch(`${origin}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: String(options.model ?? 'bge-m3'),
        prompt: String(options.text ?? 'codeslice embedding probe'),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        base_url: origin,
        model: String(options.model ?? ''),
        dims: 0,
        error: `Ollama answered HTTP ${response.status}`,
      };
    }
    const body = await response.json();
    const vector = Array.isArray(body?.embedding) ? body.embedding : [];
    return {
      ok: vector.length > 0,
      base_url: origin,
      model: String(options.model ?? ''),
      dims: vector.length,
      error: vector.length === 0 ? 'Ollama returned no embedding' : null,
    };
  } catch (error) {
    return {
      ok: false,
      base_url: origin,
      model: String(options.model ?? ''),
      dims: 0,
      error: controller.signal.aborted ? 'embedding timed out' : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}
