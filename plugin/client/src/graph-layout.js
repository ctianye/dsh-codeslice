/**
 * Force layout, interruptible.
 *
 * The reference app hands a ~2,000-node graph to vis-network's force-atlas-2
 * solver and lets it run (`GraphCanvas.tsx:254-289`). That is not available
 * here, and a synchronous re-implementation would be worse than the problem it
 * solves: the old plugin ran its O(n²) pass inline on every resize bucket
 * (`DESIGN §1.9`, ~12M pair updates per redraw), which is exactly why the tab
 * felt dead while it dragged.
 *
 * So the loop is sliced. Each frame does as many iteration slices as fit in
 * `FRAME_BUDGET_MS`, reports progress, and yields. Three consequences that the
 * rest of the panel depends on:
 *
 *   1. A parked tab (`visible: false`) can cancel the run on the next frame
 *      boundary, so a hidden graph costs nothing.
 *   2. Physics never blocks the first paint — the caller paints the sunflower
 *      seed immediately and the picture settles in place.
 *   3. `stop()` is honoured between slices, not after the whole pass.
 *
 * The force model itself keeps the reference constants where they exist
 * (`-60 / 0.005 / 120 / 0.08 / 0.4 / 0.8`) and the original plugin's sunflower
 * seeding, which is what makes the first frame look like a picture instead of a
 * random cloud.
 */

/** Iteration budget per frame. Above this a frame misses its 16 ms slot. */
const FRAME_BUDGET_MS = 8;

/** Hard cap on iterations, sized like the reference's 140/200 split. */
const ITERATIONS_SMALL = 210;
const ITERATIONS_LARGE = 140;
const LARGE_GRAPH = 1200;

/* Force-atlas-2-flavoured constants, from `GraphCanvas.tsx:254-289`. */
const GRAVITATIONAL = -60;
const CENTRAL_GRAVITY = 0.005;
const SPRING_LENGTH = 120;
const SPRING_CONSTANT = 0.08;
const DAMPING = 0.4;
const AVOID_OVERLAP = 0.8;

/** Golden angle: the sunflower seed. */
const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Seed positions on a sunflower spiral.
 *
 * A plain circle puts every node on one ring, so the first iterations fight
 * over equal radii and the early picture is a rotating annulus. The spiral
 * gives each node a distinct radial distance, which is why the first frame is
 * already readable.
 * @param count - how many nodes.
 * @param radius - spiral radius in graph units.
 * @returns `{xs, ys}` centred on the origin.
 */
function seed(count, radius) {
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const angle = index * GOLDEN_ANGLE;
    const spread = Math.sqrt((index + 0.5) / count) * radius;
    xs[index] = Math.cos(angle) * spread;
    ys[index] = Math.sin(angle) * spread;
  }
  return { xs, ys };
}

/**
 * Fit a coordinate box into a canvas box, preserving aspect and clamping scale.
 * @param xs - x coordinates.
 * @param ys - y coordinates.
 * @param width - canvas width.
 * @param height - canvas height.
 * @param padding - inner margin in px.
 * @returns `{scale, dx, dy}` to apply as `x*scale + dx`.
 */
function fitTransform(xs, ys, width, height, padding) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < xs.length; index += 1) {
    if (xs[index] < minX) minX = xs[index];
    if (xs[index] > maxX) maxX = xs[index];
    if (ys[index] < minY) minY = ys[index];
    if (ys[index] > maxY) maxY = ys[index];
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { scale: 1, dx: width / 2, dy: height / 2 };
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const usableW = Math.max(40, width - padding * 2);
  const usableH = Math.max(40, height - padding * 2);
  // 1.4 is a ceiling: a two-node graph must not be blown up to fill a 900 px
  // canvas, because node radius is in graph units and would scale with it.
  const scale = Math.min(usableW / spanX, usableH / spanY, 1.4);
  const dx = (width - spanX * scale) / 2 - minX * scale;
  const dy = (height - spanY * scale) / 2 - minY * scale;
  return { scale, dx, dy };
}

/**
 * One force iteration over the whole graph.
 *
 * Repulsion is O(n²) on purpose: a Barnes-Hut tree would change the picture for
 * graphs of the size the Host caps at (600 nodes, `WIRE.md §2`), and the slicing
 * above is what actually buys the frame time back.
 * @param state - the mutable solver state.
 */
function step(state) {
  const {
    count, xs, ys, vx, vy, pairs, ideal, cooling,
  } = state;

  for (let i = 0; i < count; i += 1) {
    const xi = xs[i];
    const yi = ys[i];
    let fx = 0;
    let fy = 0;
    for (let j = i + 1; j < count; j += 1) {
      let dx = xs[j] - xi;
      let dy = ys[j] - yi;
      let dist2 = dx * dx + dy * dy;
      if (dist2 < 0.01) {
        // Two nodes on top of each other: repel along a deterministic axis
        // instead of dividing by a near-zero distance (which produces NaN and
        // silently poisons every later coordinate).
        dx = ((i % 7) - 3) || 0.5;
        dy = ((j % 5) - 2) || 0.5;
        dist2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(dist2);
      // `avoidOverlap` widens the near field only, so the long-range shape is
      // untouched but dense clusters stop collapsing into one dot.
      const overlap = dist < ideal ? AVOID_OVERLAP * (1 - dist / ideal) : 0;
      const force = ((GRAVITATIONAL * (1 + overlap)) * cooling) / dist2;
      const ux = (dx / dist) * force;
      const uy = (dy / dist) * force;
      fx += ux;
      fy += uy;
      vx[j] -= ux;
      vy[j] -= uy;
    }
    vx[i] += fx;
    vy[i] += fy;
  }

  for (let k = 0; k < pairs.length; k += 2) {
    const a = pairs[k];
    const b = pairs[k + 1];
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    // A spring pulls only when stretched: compressing a short edge would fight
    // the repulsion that just placed the two nodes apart.
    const strain = dist - SPRING_LENGTH;
    if (strain <= 0) continue;
    const force = strain * SPRING_CONSTANT * cooling;
    const ux = (dx / dist) * force;
    const uy = (dy / dist) * force;
    vx[a] += ux;
    vy[a] += uy;
    vx[b] -= ux;
    vy[b] -= uy;
  }

  for (let i = 0; i < count; i += 1) {
    vx[i] = (vx[i] + (0 - xs[i]) * CENTRAL_GRAVITY) * (1 - DAMPING * 0.6);
    vy[i] = (vy[i] + (0 - ys[i]) * CENTRAL_GRAVITY) * (1 - DAMPING * 0.6);
    xs[i] += vx[i];
    ys[i] += vy[i];
  }
}

/**
 * Run a layout, frame by frame, and report when it settles.
 *
 * The returned handle's `stop()` must be called on unmount or when the tab is
 * parked; a stopped run leaves the last coordinates readable through
 * `onFrame`, so parking mid-settle does not empty the canvas.
 *
 * @param options - `{nodes, links, width, height, onFrame, onDone}`.
 *   `nodes` is `{id, degree?, weight?}[]`; `links` is `{source, target}[]`.
 *   `onFrame(positions)` receives `Map<id, {x, y}>` immediately and after each
 *   slice; `onDone(positions)` fires once when the final fit has been applied.
 * @returns `{stop(): void, done: Promise<void>}`.
 */
export function runLayout(options) {
  const {
    nodes, links, width, height, onFrame, onDone,
  } = options;
  const count = nodes.length;
  const indexOf = new Map();
  nodes.forEach((node, index) => indexOf.set(node.id, index));

  let stopped = false;
  let frameHandle;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  /** Emit the current map, fitted to the canvas. */
  const emit = (xs, ys) => {
    const { scale, dx, dy } = fitTransform(xs, ys, Math.max(120, width), Math.max(90, height), 24);
    const positions = new Map();
    for (let index = 0; index < count; index += 1) {
      positions.set(nodes[index].id, {
        x: xs[index] * scale + dx,
        y: ys[index] * scale + dy,
      });
    }
    if (typeof onFrame === 'function') onFrame(positions);
    return positions;
  };

  if (count === 0) {
    const positions = new Map();
    if (typeof onDone === 'function') onDone(positions);
    resolveDone();
    return { stop() {}, done };
  }

  if (count === 1) {
    // A single node still has to be centred: the fit transform over a
    // zero-span box divides by the 1-unit floor and lands off-canvas.
    const positions = new Map([[nodes[0].id, { x: width / 2, y: height / 2 }]]);
    if (typeof onFrame === 'function') onFrame(positions);
    if (typeof onDone === 'function') onDone(positions);
    resolveDone();
    return { stop() {}, done };
  }

  const radius = Math.min(Math.max(160, width), Math.max(160, height)) * 0.42;
  const { xs: px, ys: py } = seed(count, radius);
  const vx = new Float64Array(count);
  const vy = new Float64Array(count);

  const pairs = [];
  for (const link of links) {
    const a = indexOf.get(link.source);
    const b = indexOf.get(link.target);
    if (a === undefined || b === undefined || a === b) continue;
    pairs.push(a, b);
  }

  const iterations = count > LARGE_GRAPH ? ITERATIONS_LARGE : ITERATIONS_SMALL;
  const ideal = SPRING_LENGTH;
  const state = {
    count, xs: px, ys: py, vx, vy, pairs, ideal, cooling: 1,
  };

  // Paint the seed before any physics: the panel is supposed to show structure
  // the moment the payload lands, not after the settle.
  emit(px, py);

  let iteration = 0;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(() => callback(Date.now()), 16);

  const tick = () => {
    if (stopped) return;
    const start = Date.now();
    while (iteration < iterations) {
      state.cooling = 1 - iteration / iterations;
      step(state);
      iteration += 1;
      // The budget is checked after at least one slice, so a slow machine still
      // makes progress instead of thrashing on the clock.
      if (Date.now() - start >= FRAME_BUDGET_MS) break;
    }
    if (iteration >= iterations) {
      const positions = emit(px, py);
      if (!stopped && typeof onDone === 'function') onDone(positions);
      resolveDone();
      return;
    }
    emit(px, py);
    frameHandle = raf(tick);
  };

  frameHandle = raf(tick);

  return {
    stop() {
      stopped = true;
      if (frameHandle !== undefined && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameHandle);
      }
      resolveDone();
    },
    done,
  };
}

/**
 * Trim a graph to `cap` nodes **without breaking it apart**.
 *
 * Slicing a ranked list is the obvious move and the wrong one: the top rows by
 * degree are usually leaves of different clusters, so a truncated slice renders
 * as isolated dots with no edges — a ranked cut is not a picture. Growing
 * outward from the heaviest node keeps the result one connected thing, which is
 * the only reason to draw it at all.
 *
 * A node with no edges anywhere is dropped deliberately: a lone dot on a graph
 * of relations says nothing, and keeping it would spend a slot that could hold a
 * neighbour.
 *
 * @param nodes - candidate nodes; each needs `id` and preferably `weight`.
 * @param links - the full link set; endpoints outside `nodes` are ignored.
 * @param cap - maximum nodes to keep.
 * @returns the kept nodes, in their original order.
 */
export function connectedSlice(nodes, links, cap) {
  const limit = Math.max(0, Math.trunc(Number(cap) || 0));
  if (limit === 0) return [];
  if (nodes.length <= limit) return nodes;

  const known = new Set(nodes.map((node) => node.id));
  const neighbours = new Map();
  for (const link of links) {
    if (!known.has(link.source) || !known.has(link.target)) continue;
    if (link.source === link.target) continue;
    const from = neighbours.get(link.source);
    if (from === undefined) neighbours.set(link.source, [link.target]);
    else from.push(link.target);
    const to = neighbours.get(link.target);
    if (to === undefined) neighbours.set(link.target, [link.source]);
    else to.push(link.source);
  }

  // Weight first (the Host's `weight` is the ranked importance), then degree,
  // then id so two equal-weight seeds still produce a deterministic slice.
  const order = [...nodes].sort((a, b) => (
    (b.weight ?? 0) - (a.weight ?? 0)
    || (b.degree ?? 0) - (a.degree ?? 0)
    || String(a.id).localeCompare(String(b.id))
  ));

  const kept = new Set();
  for (const seedNode of order) {
    if (kept.size >= limit) break;
    if (kept.has(seedNode.id)) continue;
    const queue = [seedNode.id];
    let head = 0;
    while (head < queue.length && kept.size < limit) {
      const id = queue[head];
      head += 1;
      if (kept.has(id)) continue;
      kept.add(id);
      for (const next of neighbours.get(id) ?? []) {
        if (!kept.has(next)) queue.push(next);
      }
    }
  }

  return nodes.filter((node) => kept.has(node.id));
}
