/**
 * Graphify as an optional graph source.
 *
 * The plugin's own analyzer is a dependency-free fallback; graphify is the
 * richer AST extractor when it is installed. This module is deliberately the
 * only place that spawns a process:
 *
 *   - the executable is a single configured name, never a shell string;
 *   - arguments are a fixed array (`extract`, the resolved root, fixed flags);
 *   - cwd is the workspace root, stdio is captured, and a timeout kills the
 *     child;
 *   - output lands under the plugin state directory, never in the workspace.
 *
 * The adapted result uses the same node/edge vocabulary as `lib/model.js`, so
 * every existing graph API, the canvas and the conversation context keep
 * working without a second code path.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyCommunities, refineCommunities } from './cluster.js';

/** Default executable name; a profile may override it with `graphifyPath`. */
const DEFAULT_BINARY = 'graphify';

/** Default time a cached graphify output is trusted. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** Default child-process timeout. */
const DEFAULT_TIMEOUT_MS = 180 * 1000;

/** Stable per-root output directory under the plugin state directory. */
function outputDir(root) {
  const key = createHash('sha1').update(resolve(root).toLowerCase()).digest('hex').slice(0, 16);
  return join(tmpdir(), 'dsh-codeslice', 'graphify', key);
}

/**
 * Run one graphify command.
 * @param binary - executable name or absolute path.
 * @param args - argument array; never a shell string.
 * @param options - `{ cwd, timeoutMs }`.
 * @returns `{ stdout, stderr }`.
 */
function run(binary, args, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn(binary, args, {
        cwd: options.cwd,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => reject(error));
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`graphify ${args[0] ?? ''} exited with ${code ?? signal}: ${(stderr || stdout).trim().slice(-800)}`));
    });
  });
}

/** Parse `L123` into 123; 0 when absent. */
function lineOf(value) {
  const match = /(\d+)/u.exec(String(value ?? ''));
  return match === null ? 0 : Math.max(1, Number(match[1]));
}

/** Map graphify's `file_type`/label onto this plugin's node kinds. */
function kindOf(node) {
  if (node.file_type === 'concept') return 'rationale';
  if (node._callable_class === true) return 'class';
  const label = String(node.label ?? '');
  if (label.startsWith('.')) return 'method';
  if (label.endsWith('()')) return 'function';
  const source = String(node.source_file ?? '');
  if (source !== '' && (label === source || /\.[A-Za-z0-9]+$/u.test(label))) return 'file';
  return 'function';
}

/** Graphify relation → this plugin's relation vocabulary. */
const RELATION_MAP = {
  contains: 'contains',
  method: 'method',
  imports: 'imports',
  imports_from: 'imports_from',
  re_exports: 'imports_from',
  dynamic_import: 'imports',
  calls: 'calls',
  indirect_call: 'indirect_call',
  uses: 'uses',
  inherits: 'inherits',
  implements: 'inherits',
  declares: 'contains',
  explains: 'rationale_for',
};

/** Numeric confidence, kept compatible with the canvas drawer. */
function confidenceOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.9 ? 'EXTRACTED' : 'INFERRED';
  const text = String(value ?? '').toUpperCase();
  return text === 'EXTRACTED' ? 'EXTRACTED' : 'INFERRED';
}

/**
 * Adapt a graphify `graph.json` to this plugin's document vocabulary.
 * @param graph - the parsed graphify JSON.
 * @returns `{ nodes, edges, communities, stats }`.
 */
export function adaptGraphifyGraph(graph) {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  // `extract --no-cluster` writes `edges`; `cluster-only` rewrites the document
  // in NetworkX node-link form, which calls the same array `links`.
  const rawEdges = Array.isArray(graph?.edges)
    ? graph.edges
    : Array.isArray(graph?.links) ? graph.links : [];
  const degree = new Map();
  for (const edge of rawEdges) {
    const source = String(edge.source ?? '');
    const target = String(edge.target ?? '');
    if (source !== '') degree.set(source, (degree.get(source) ?? 0) + 1);
    if (target !== '') degree.set(target, (degree.get(target) ?? 0) + 1);
  }

  const nodes = rawNodes
    .filter((node) => node !== null && typeof node === 'object' && typeof node.id === 'string')
    .map((node) => {
      const line = lineOf(node.source_location);
      const community = Number.isFinite(Number(node.community)) ? Number(node.community) : 0;
      const label = String(node.community_name ?? '');
      return {
        id: node.id,
        label: String(node.label ?? node.id),
        kind: kindOf(node),
        path: String(node.source_file ?? ''),
        language: '',
        start_line: line,
        end_line: line,
        line,
        degree: degree.get(node.id) ?? 0,
        weight: degree.get(node.id) ?? 0,
        community,
        community_label: label,
        communityLabel: label,
        signature: '',
        origin: 'graphify',
        rationale: typeof node.metadata?.rationale === 'string' ? node.metadata.rationale : undefined,
      };
    });

  const ids = new Set(nodes.map((node) => node.id));
  const edges = rawEdges
    .filter((edge) => edge !== null && typeof edge === 'object'
      && ids.has(String(edge.source ?? '')) && ids.has(String(edge.target ?? '')))
    .map((edge) => {
      const relation = RELATION_MAP[edge.relation] ?? String(edge.relation ?? 'uses');
      return {
        source: String(edge.source),
        target: String(edge.target),
        relation,
        confidence: confidenceOf(edge.confidence),
        line: lineOf(edge.source_location) || null,
        weight: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : 1,
        origin: 'graphify',
      };
    });

  // Graphify's own `cluster-only` already assigned membership; the legend,
  // however, is the desktop's: pool singletons and zero-degree nodes into
  // 「未分类」, order by size, and name each community after its majority file.
  // Refining here (rather than in `index.js`) also covers the probes that adapt
  // a graph.json directly.
  const communities = refineCommunities(nodes, edges);
  applyCommunities(nodes, edges, communities);

  return {
    nodes,
    edges,
    communities,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      communities: communities.length,
      source: 'graphify',
    },
  };
}

/**
 * Build or refresh the graphify graph for one workspace.
 *
 * `extract --code-only` needs no API key and no LLM; `cluster-only --no-label`
 * adds the membership without names, and the adapter names each community from
 * its majority file (the desktop legend) — so the whole path works offline.
 *
 * @param root - absolute workspace root.
 * @param config - plugin config (`graphifyPath`, `graphifyTimeoutMs`, `graphifyTtlMs`).
 * @returns the adapted graph.
 */
export async function graphifyGraph(root, config = {}) {
  const absolute = resolve(root);
  const out = outputDir(absolute);
  const graphFile = join(out, 'graphify-out', 'graph.json');
  const binary = typeof config.graphifyPath === 'string' && config.graphifyPath.trim() !== ''
    ? config.graphifyPath.trim()
    : DEFAULT_BINARY;
  const ttl = Number.isFinite(Number(config.graphifyTtlMs)) ? Number(config.graphifyTtlMs) : DEFAULT_TTL_MS;
  const timeoutMs = Number.isFinite(Number(config.graphifyTimeoutMs))
    ? Number(config.graphifyTimeoutMs)
    : DEFAULT_TIMEOUT_MS;

  let fresh = false;
  try {
    const stat = await fs.stat(graphFile);
    fresh = Date.now() - stat.mtimeMs < ttl;
  } catch {
    fresh = false;
  }

  if (!fresh) {
    await run(binary, ['extract', absolute, '--code-only', '--no-cluster', '--out', out], {
      cwd: absolute,
      timeoutMs,
    });
    // Clustering is a second pass so a failure there still leaves a usable
    // unclustered graph rather than throwing the extraction away.
    try {
      await run(binary, ['cluster-only', out, '--no-label', '--no-viz'], {
        cwd: absolute,
        timeoutMs,
      });
    } catch {
      // Communities fall back to id 0; the graph is still valid.
    }
  }

  const raw = await fs.readFile(graphFile, 'utf8');
  const parsed = JSON.parse(raw);
  const adapted = adaptGraphifyGraph(parsed);
  adapted.builtAt = Date.now();
  adapted.cached = fresh;
  return adapted;
}
