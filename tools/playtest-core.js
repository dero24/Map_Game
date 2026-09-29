// The playtest's pure parts, shared by the page (tools/playtest.js), the Node runner
// (tools/playtest.mjs) and the unit tests (tests/playtest.test.ts): a seeded random stream, the
// road graph and seeded routes along it, a lattice path planner over a world described only by a
// step function (the page hands it the walker's own moves), frame-time statistics and budgets,
// and the report as text. No DOM, no game state. Types: playtest-core.d.ts.

/** Every check `__PLAYTEST__` knows, in the order it runs them. */
export const CHECKS = ['overlaps', 'doors', 'posts', 'flicker', 'altitude', 'frames', 'walkabout', 'drive', 'teleports', 'streaming'];

/** The checks that wait on the page's own frames (minutes on a software renderer). */
export const SLOW = ['flicker', 'altitude', 'frames', 'streaming'];

/** Which checks to run: `only` (array or comma list) narrows, `skip` removes, `quick` leaves out
 *  the SLOW ones, and a check's own key set to false drops it (`{ altitude: false }`). A number
 *  under a check's key is an option of the older checks (`frames: 3` is the flicker's frame
 *  count), not a switch. */
export function planChecks(opts = {}) {
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s) => String(s).trim()).filter(Boolean);
  const only = list(opts.only), skip = [...list(opts.skip), ...(opts.quick ? SLOW : [])];
  return CHECKS.filter((c) => (!only.length || only.includes(c)) && !skip.includes(c) && opts[c] !== false);
}

/** mulberry32: the same stream for the same seed, in any browser or Node. */
export function rng(seed = 1) {
  let a = Math.floor(seed) >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The yaw that faces along (dx, dz): the game's convention (yaw 0 looks north, −z; forward is
 *  (−sin yaw, −cos yaw)), shared by the walker and the rides. */
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
/** An angle folded into (−π, π]. */
export const wrapAngle = (a) => {
  a %= 2 * Math.PI;
  return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a;
};

// ---------------------------------------------------------------- frame times

/** The value below which a share `p` of the sorted values lies (linear between ranks). */
export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const k = (sorted.length - 1) * Math.min(1, Math.max(0, p)), i = Math.floor(k), f = k - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i];
}

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/** Frame intervals (ms, frame start to frame start) and, optionally, each frame's own work (ms,
 *  frame start to the end of its draw): pacing percentiles, fps and hitches. */
export function frameStats(intervals, work = []) {
  const s = intervals.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const w = work.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const total = s.reduce((a, b) => a + b, 0), min = total / 60000;
  const over = (t) => s.filter((v) => v > t).length;
  return {
    frames: s.length,
    seconds: r1(total / 1000),
    fps: total > 0 ? r1((s.length * 1000) / total) : null,
    p50: r1(percentile(s, 0.5)),
    p95: r1(percentile(s, 0.95)),
    p99: r1(percentile(s, 0.99)),
    max: r1(s.length ? s[s.length - 1] : NaN),
    hitch50: over(50),
    hitch100: over(100),
    perMin100: min > 0 ? r1(over(100) / min) : null,
    work: w.length ? { p50: r1(percentile(w, 0.5)), p95: r1(percentile(w, 0.95)), p99: r1(percentile(w, 0.99)), max: r1(w[w.length - 1]) } : null,
  };
}

/** Frame budgets (ms; hitches over 100 ms per minute). `soft` is software GL (SwiftShader,
 *  llvmpipe): seconds a frame is normal there — tens of seconds on a busy machine after a flight
 *  has loaded the far scenery — so only a page that has all but stopped fails it. */
export const FRAME_BUDGETS = {
  desktop: { p50: 20, p95: 34, p99: 50, perMin100: 2 },
  phone: { p50: 34, p95: 50, p99: 100, perMin100: 6 },
  soft: { p50: 60000, p95: null, p99: 120000, perMin100: null },
};

/** A GPU string that is software rendering. */
export const softGpu = (gpu) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gpu ?? ''));

/** Frame stats against a budget (a preset name or { p50, p95, p99, perMin100 }; a missing or
 *  null limit isn't judged). Too few frames to judge is a fail: nothing drew. */
export function judgeFrames(st, budget = 'desktop') {
  const b = typeof budget === 'string' ? FRAME_BUDGETS[budget] ?? FRAME_BUDGETS.desktop : budget ?? FRAME_BUDGETS.desktop;
  const over = [];
  if (!st || st.frames < 2) return { pass: false, over: ['no frames'] };
  for (const k of ['p50', 'p95', 'p99', 'perMin100']) {
    const lim = b[k], v = st[k];
    if (lim !== null && lim !== undefined && Number.isFinite(lim) && v !== null && v > lim) over.push(`${k} ${v} > ${lim}`);
  }
  return { pass: over.length === 0, over };
}

// ---------------------------------------------------------------- the lattice planner

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * A* over a square lattice anchored at the start (8 neighbours), through a world the caller
 * describes by `step(ax, az, af, bx, bz)`: the feet height after moving a → b from feet `af`, or
 * NaN when that move can't be made. With a goal, the search ends at the first node within `reach`
 * of it (and steps onto the goal itself when it can); without one it floods the `radius` round
 * the start. Always says how far from the start it got (`far`) — a walker that can't get 3 m
 * from where it stands is shut in.
 *
 * `layer` (metres): storeys. A lattice cell then holds a node per `layer` of feet height, so a
 * walk can pass under a landing and later cross over it (up a stair to the floor above); a goal
 * with `f` is reached only within `reachY` of that height.
 */
export function gridPath(o) {
  const { start, goal, step } = o;
  const cell = o.cell ?? 0.4, reach = o.reach ?? cell * 1.1, maxNodes = o.maxNodes ?? 60000;
  const margin = o.margin ?? 10, radius = o.radius ?? 12, layer = o.layer ?? 0, reachY = o.reachY ?? 0.5;
  const gx = goal ? goal.x : start.x, gz = goal ? goal.z : start.z, gf = goal && Number.isFinite(goal.f) ? goal.f : null;
  const lo = goal ? margin : radius;
  const iMin = Math.floor((Math.min(start.x, gx) - lo - start.x) / cell), iMax = Math.ceil((Math.max(start.x, gx) + lo - start.x) / cell);
  const jMin = Math.floor((Math.min(start.z, gz) - lo - start.z) / cell), jMax = Math.ceil((Math.max(start.z, gz) + lo - start.z) / cell);
  const J = jMax - jMin + 1, LAY = layer > 0 ? 64 : 1;
  const bin = (f) => (layer > 0 ? Math.max(0, Math.min(LAY - 1, Math.round((f - start.f) / layer) + 32)) : 0);
  const key = (i, j, f) => ((i - iMin) * J + (j - jMin)) * LAY + bin(f);
  const ij = (k) => { const c = Math.floor(k / LAY); return [Math.floor(c / J) + iMin, (c % J) + jMin]; };
  const pos = (i, j) => [start.x + i * cell, start.z + j * cell];
  const g = new Map(), feet = new Map(), came = new Map(), closed = new Set(), open = new Heap();
  const hOf = (i, j) => {
    if (!goal) return 0;
    const [x, z] = pos(i, j), dx = Math.abs(x - gx), dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const k0 = key(0, 0, start.f);
  g.set(k0, 0); feet.set(k0, start.f);
  open.push(hOf(0, 0), k0);
  let nodes = 0, far = 0, best = null, bestD = Infinity, endKey = -1;
  while (open.size && nodes < maxNodes) {
    const k = open.pop();
    if (closed.has(k)) continue;
    closed.add(k);
    nodes++;
    const [i, j] = ij(k), [x, z] = pos(i, j), f = feet.get(k);
    far = Math.max(far, Math.hypot(x - start.x, z - start.z));
    if (goal) {
      const dy = gf === null ? 0 : Math.abs(f - gf), d = Math.hypot(x - gx, z - gz);
      if (d + dy < bestD) (bestD = d + dy), (best = [x, z, f]);
      if (d <= reach && dy <= (gf === null ? Infinity : reachY)) { endKey = k; break; }
    } else if (Math.hypot(x - start.x, z - start.z) > radius) continue;
    for (const [di, dj] of NB) {
      const ni = i + di, nj = j + dj;
      if (ni < iMin || ni > iMax || nj < jMin || nj > jMax) continue;
      if (LAY === 1 && closed.has(key(ni, nj, 0))) continue; // (one surface a cell: no step to try)
      const [bx, bz] = pos(ni, nj);
      const nf = step(x, z, f, bx, bz);
      if (!Number.isFinite(nf)) continue;
      const nk = key(ni, nj, nf);
      if (closed.has(nk)) continue;
      const ng = g.get(k) + (di && dj ? Math.SQRT2 : 1) * cell;
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, ng); feet.set(nk, nf); came.set(nk, k);
      open.push(ng + hOf(ni, nj), nk);
    }
  }
  const out = { found: endKey >= 0, path: null, nodes, far: Math.round(far * 100) / 100, best };
  if (endKey < 0) return out;
  const path = [];
  for (let k = endKey; k !== undefined; k = came.get(k)) path.push([...pos(...ij(k)), feet.get(k)]);
  path.reverse();
  const last = path[path.length - 1], fz = step(last[0], last[1], last[2], gx, gz);
  if (Number.isFinite(fz) && Math.hypot(last[0] - gx, last[1] - gz) > 1e-6 && (gf === null || Math.abs(fz - gf) <= reachY)) path.push([gx, gz, fz]);
  out.path = path;
  return out;
}

// ---------------------------------------------------------------- roads and routes

/** Road classes a car keeps off (place.ts NOT_FOR_CARS and the rest of the non-streets). */
export const NOT_FOR_CARS = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'construction', 'corridor', 'platform', 'elevator'];

/** The street network as a graph: nodes where the map's points are (ways meeting at a point
 *  share it — decimetre coordinates, as the tiles carry them), edges along each way. Far-detail
 *  (`lod`) and underground (`tu`) ways are left out; `car` also drops what cars don't drive on,
 *  `skip` any other classes (a drive's `service`: driveways, alleys, parking aisles). The same
 *  roads give the same graph whatever order they come in. */
export function roadGraph(roads, opts = {}) {
  const car = !!opts.car, skip = opts.skip ?? [];
  const keep = roads.filter((r) => r && !r.lod && !r.tu && Array.isArray(r.p) && r.p.length >= 4 && r.c !== 'construction' && !(car && NOT_FOR_CARS.includes(r.c)) && !skip.includes(r.c));
  keep.sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1] || a.p.length - b.p.length || a.p[a.p.length - 2] - b.p[b.p.length - 2] || a.p[a.p.length - 1] - b.p[b.p.length - 1]);
  const ids = new Map(), nodes = [], adj = [];
  const id = (px, pz) => {
    const k = `${Math.round(px)},${Math.round(pz)}`;
    let i = ids.get(k);
    if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push([Math.round(px) / 10, Math.round(pz) / 10]); adj.push([]); }
    return i;
  };
  for (const r of keep) {
    let prev = id(r.p[0], r.p[1]);
    for (let i = 2; i + 1 < r.p.length; i += 2) {
      const cur = id(r.p[i], r.p[i + 1]);
      if (cur === prev) continue;
      const [ax, az] = nodes[prev], [bx, bz] = nodes[cur], len = Math.hypot(bx - ax, bz - az);
      if (!adj[prev].some((e) => e.to === cur)) adj[prev].push({ to: cur, len, w: r.w ?? 6, c: r.c });
      if (!adj[cur].some((e) => e.to === prev)) adj[cur].push({ to: prev, len, w: r.w ?? 6, c: r.c });
      prev = cur;
    }
  }
  for (const l of adj) l.sort((a, b) => nodes[a.to][0] - nodes[b.to][0] || nodes[a.to][1] - nodes[b.to][1]);
  return { nodes, adj };
}

/** The graph node nearest (x, z) that has an edge (−1 on an empty graph). */
export function nearestNode(graph, x, z) {
  let best = -1, bd = Infinity;
  graph.nodes.forEach(([nx, nz], i) => {
    if (!graph.adj[i].length) return;
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bd) (bd = d), (best = i);
  });
  return best;
}

/** Does the way from node `from` to `to` run into a dead end (a spur: nothing but its own points
 *  until it stops)? Looks `max` points along it. */
export function deadEnd(graph, from, to, max = 400) {
  let prev = from, cur = to;
  for (let k = 0; k < max; k++) {
    const a = graph.adj[cur];
    if (a.length === 1) return true;
    if (a.length !== 2) return false;
    const next = a[0].to === prev ? a[1].to : a[0].to;
    (prev = cur), (cur = next);
  }
  return false;
}

/** A seeded wander along the graph from the node nearest (x, z): at each junction a random way
 *  on, never straight back unless it's a dead end, until `metres` are covered. `avoidDeadEnds`
 *  (a car: a spur means turning round in the street) keeps off spurs where there's another way.
 *  `heading` [dx, dz] (a car already moving): it starts from a node ahead, not much farther than
 *  the nearest, and leaves it going on the same way where it can. The points (with each one's
 *  road width) and the length. */
export function randomRoute(graph, x, z, rand, metres, opts = {}) {
  let n0 = nearestNode(graph, x, z);
  if (n0 < 0) return { pts: [], widths: [], len: 0 };
  const h = opts.heading, ahead = (fx, fz, tx, tz) => { const dx = tx - fx, dz = tz - fz, d = Math.hypot(dx, dz) || 1; return (dx * h[0] + dz * h[1]) / d; };
  if (h) {
    let best = -1, bd = Infinity;
    graph.nodes.forEach(([nx, nz], i) => { const d = Math.hypot(nx - x, nz - z); if (graph.adj[i].length && ahead(x, z, nx, nz) > 0.3 && d < bd) (bd = d), (best = i); });
    if (best >= 0 && bd < Math.hypot(graph.nodes[n0][0] - x, graph.nodes[n0][1] - z) + 40) n0 = best;
  }
  const pts = [graph.nodes[n0].slice()], widths = [];
  let cur = n0, prev = -1, len = 0;
  for (let k = 0; k < 20000 && len < metres; k++) {
    const all = graph.adj[cur];
    if (!all.length) break;
    let on = all.filter((e) => e.to !== prev);
    if (h && prev < 0) { const fwd = on.filter((e) => ahead(graph.nodes[cur][0], graph.nodes[cur][1], graph.nodes[e.to][0], graph.nodes[e.to][1]) > -0.2); if (fwd.length) on = fwd; } // (not back the way it came)
    const open = opts.avoidDeadEnds && on.length > 1 ? on.filter((e) => !deadEnd(graph, cur, e.to)) : on;
    const pool = open.length ? open : on.length ? on : all;
    const e = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    prev = cur;
    cur = e.to;
    len += e.len;
    pts.push(graph.nodes[cur].slice());
    widths.push(e.w);
  }
  return { pts, widths, len };
}

/** Cumulative length at each point of a polyline. */
export function cumLength(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}

/** The point `s` metres along a polyline (clamped to its ends). */
export function pointAlong(pts, cum, s) {
  if (!pts.length) return [NaN, NaN];
  if (s <= 0) return pts[0].slice(0, 2);
  const L = cum[cum.length - 1];
  if (s >= L) return pts[pts.length - 1].slice(0, 2);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}

/** The nearest point of the polyline to (x, z), searched over segments i0..i1: how far along it
 *  lies (`s`), how far off (`d`) and on which segment (`i`). */
export function closestAlong(pts, cum, x, z, i0 = 0, i1 = pts.length - 2) {
  let best = { s: 0, d: Infinity, i: 0 };
  for (let i = Math.max(0, i0); i <= Math.min(pts.length - 2, i1); i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    const d = Math.hypot(ax + ex * t - x, az + ez * t - z);
    if (d < best.d) best = { s: cum[i] + Math.sqrt(L2) * t, d, i };
  }
  return best;
}

/** A polyline moved `off` metres to its right (left when negative) — a street's centreline to
 *  the walk along one side of it. */
export function offsetPolyline(pts, off) {
  const n = pts.length;
  if (n < 2 || !off) return pts.map((p) => p.slice(0, 2));
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    return [p[0] - dz * off, p[1] + dx * off]; // right of travel: (−dz, dx) with +x east, +z south
  });
}

/** Points every `step` metres along a polyline, both ends kept. */
export function resample(pts, step) {
  if (pts.length < 2) return pts.map((p) => p.slice(0, 2));
  const cum = cumLength(pts), L = cum[cum.length - 1], out = [];
  const n = Math.max(1, Math.ceil(L / step));
  for (let k = 0; k <= n; k++) out.push(pointAlong(pts, cum, (L * k) / n));
  return out;
}

/** The carriageways as a lookup: every segment of the ways a car drives (decimetre points, as the
 *  tiles carry them), with its half width, in `cell`-metre buckets. Far-detail and underground ways
 *  are left out, and `skip` classes. */
export function roadIndex(roads, opts = {}) {
  const C = opts.cell ?? 24, skip = opts.skip ?? [], cells = new Map();
  for (const r of roads) {
    if (!r || r.lod || r.tu || !Array.isArray(r.p) || r.p.length < 4 || NOT_FOR_CARS.includes(r.c) || skip.includes(r.c)) continue;
    const hw = (r.w ?? 6) / 2;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const s = { ax: r.p[i] / 10, az: r.p[i + 1] / 10, bx: r.p[i + 2] / 10, bz: r.p[i + 3] / 10, hw, road: r.n ?? r.c };
      for (let u = Math.floor((Math.min(s.ax, s.bx) - hw) / C); u <= Math.floor((Math.max(s.ax, s.bx) + hw) / C); u++)
        for (let v = Math.floor((Math.min(s.az, s.bz) - hw) / C); v <= Math.floor((Math.max(s.az, s.bz) + hw) / C); v++) {
          const k = u + ',' + v;
          (cells.get(k) ?? cells.set(k, []).get(k)).push(s);
        }
    }
  }
  return { C, cells };
}

/** How far (x, z) stands outside the nearest carriageway (m past its edge; negative inside it),
 *  searching `R` metres round: { out, d (from the centreline), hw, road }. `out` is Infinity with no
 *  carriageway that near. */
export function roadDist(ix, x, z, R = 30) {
  const C = ix.C, seen = new Set();
  let best = { out: Infinity, d: Infinity, hw: 0, road: null };
  for (let u = Math.floor((x - R) / C); u <= Math.floor((x + R) / C); u++)
    for (let v = Math.floor((z - R) / C); v <= Math.floor((z + R) / C); v++)
      for (const s of ix.cells.get(u + ',' + v) ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / L2)) : 0;
        const d = Math.hypot(s.ax + ex * t - x, s.az + ez * t - z);
        if (d - s.hw < best.out) best = { out: d - s.hw, d, hw: s.hw, road: s.road };
      }
  return best;
}

// ---------------------------------------------------------------- the report as text

const num = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : String(v));

/** One line of a check's key numbers. */
export function summarize(name, r) {
  if (!r || typeof r !== 'object') return String(r);
  if (r.error) return `error: ${String(r.error).split('\n')[0]}`;
  if (r.skipped) return `skipped: ${r.skipped}`;
  const pick = {
    overlaps: ['buildings', 'touching', 'nested'],
    doors: [['real.tried', 'tried'], ['real.blocked', 'shut'], ['real.roundabout', 'roundabout'], ['standIn.tried', 'stand-in tried']],
    flicker: ['worstShare', 'pixels'],
    altitude: [],
    frames: ['budget', 'frames', 'fps', 'p50', 'p95', 'p99', 'max', 'hitch50', 'hitch100'],
    walkabout: ['seconds', 'metres', 'legs', 'doorsIn', 'upstairs', 'noUp', 'doorsOut', 'shut', 'noWay', 'stuck', 'trapped', 'noExit', 'stairs', 'wall', 'solid', 'under', 'floating', 'sunk', 'nan', 'settled'],
    posts: ['posts'],
    drive: ['source', 'model', 'seconds', 'metres', 'maxKmh', 'routes', 'stalls', 'blocked', 'turns', 'offRoad', 'offRoadMax', 'jumps', 'inside', 'clip', 'clipMax', 'underHouse', 'flying', 'sinking', 'nan', 'exits', 'exitFails'],
    teleports: ['n', 'bad', 'inRooms', 'meanMs', 'maxMs'],
    streaming: ['ring', 'covered', 'coverS', 'standIns', 'mounts', 'unloads', 'twice', 'ghosts', 'failures', 'workerErrors', 'pageErrors', 'frameErrors', 'hitch50', 'hitch100', 'worstMs', 'ownMissS', 'minCover'],
  }[name] ?? Object.keys(r).filter((k) => typeof r[k] === 'number');
  const get = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), r);
  const parts = [];
  for (const p of pick) {
    const [k, label] = Array.isArray(p) ? p : [p, p];
    const v = get(k);
    if (v === undefined || v === null || (typeof v === 'object' && !Array.isArray(v))) continue;
    parts.push(`${label} ${num(v)}`);
  }
  if (name === 'altitude' && Array.isArray(r.heights)) parts.push(r.heights.map((h) => `${h.h} m ${h.worstShare}`).join(', '));
  if (name === 'frames') for (const ph of ['stand', 'walk']) if (r[ph]?.frames) parts.push(`${ph} p50/p95/p99 ${num(r[ph].p50)}/${num(r[ph].p95)}/${num(r[ph].p99)} ms`);
  if (name === 'frames' && r.over?.length) parts.push(`over: ${r.over.join('; ')}`);
  return parts.join(' · ');
}

/** The whole report as lines of text: a verdict per check, its numbers, its first failures. */
export function formatReport(rep, opts = {}) {
  const top = opts.top ?? 4, lines = [];
  const head = [rep.place && `place ${rep.place}`, rep.at && `at ${rep.at.join(',')}`, rep.gpu && `gpu ${rep.gpu}`, Number.isFinite(rep.ms) && `${Math.round(rep.ms / 1000)} s`].filter(Boolean);
  lines.push(`playtest ${rep.pass ? 'PASS' : 'FAIL'}${head.length ? ' — ' + head.join(' · ') : ''}`);
  for (const c of CHECKS) {
    const r = rep[c];
    if (!r || typeof r !== 'object') continue;
    const verdict = r.error ? 'ERROR' : r.pass === false ? 'FAIL' : r.pass === true ? 'pass' : '—';
    lines.push(`  ${verdict.padEnd(5)} ${c.padEnd(10)} ${summarize(c, r)}${Number.isFinite(r.ms) ? `  (${Math.round(r.ms / 1000)} s)` : ''}`);
    const bad = r.fails ?? r.top ?? [];
    if (r.pass === false && Array.isArray(bad)) for (const f of bad.slice(0, top)) lines.push(`          · ${typeof f === 'string' ? f : JSON.stringify(f)}`);
  }
  const st = rep.selftest;
  if (st && typeof st === 'object') {
    lines.push(`  ${(st.pass ? 'pass' : 'FAIL').padEnd(5)} self-tests (each check has to catch the failures planted for it)`);
    for (const [name, s] of Object.entries(st)) {
      if (!s || typeof s !== 'object') continue;
      const det = s.detects && typeof s.detects === 'object' ? Object.entries(s.detects).map(([k, v]) => `${k} ${v === null ? 'n/a' : v ? 'caught' : 'MISSED'}`).join(' · ') : '';
      lines.push(`          ${(s.error ? 'ERROR' : s.pass ? 'pass' : 'FAIL').padEnd(5)} ${name.padEnd(10)} ${s.error ? String(s.error).split('\n')[0] : det}`);
    }
  }
  if (rep.errors) lines.push(`  frame errors: ${rep.errors}`);
  if (rep.pageErrors?.length) {
    lines.push(`  page errors (${rep.pageErrors.length}):`);
    for (const e of rep.pageErrors.slice(0, top)) lines.push(`          · ${e}`);
  }
  return lines.join('\n');
}

/** The verdict in a line: "PASS — 6 checks" or "FAIL — posts, drive (of 6 checks)". */
export function verdictLine(rep) {
  const ran = CHECKS.filter((c) => rep[c] && typeof rep[c] === 'object');
  const bad = ran.filter((c) => rep[c].error || rep[c].pass === false);
  if (rep.selftest && rep.selftest.pass === false) bad.push('self-tests');
  if (rep.pageErrors?.some((e) => String(e).startsWith('[pageerror]'))) bad.push('page errors');
  return bad.length ? `FAIL — ${bad.join(', ')} (of ${ran.length} checks)` : `PASS — ${ran.length} checks${rep.selftest ? ' and their self-tests' : ''}`;
}
