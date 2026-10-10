// The van drives itself (pure — no three.js): a route over the real roads, a path along its lane with
// the corners rounded, a speed for every metre of it (slower into the bends, easing off and on), and
// the van's pose as it goes. The roads are the map's own (the baked region's paint roads, the streamed
// cells' primary roads); the van's GPS is this. Or you drive it (`stepWheel`, at the bottom).
import type { Road } from '../world/data';

/** What the van will drive on, and how gladly (cost per metre: the main roads first). */
const CLASS_COST: Record<string, number> = {
  motorway: 0.8, trunk: 0.85, primary: 0.9, secondary: 0.95, tertiary: 1, motorway_link: 1, trunk_link: 1, primary_link: 1,
  secondary_link: 1, tertiary_link: 1, unclassified: 1.2, residential: 1.25, living_street: 2, service: 2.5,
};
/** Its speed by class (m/s): a town's 25 mph, a main road's 30, a car park's crawl. */
const CLASS_SPEED: Record<string, number> = {
  motorway: 24, trunk: 18, primary: 13.4, secondary: 13.4, tertiary: 12, unclassified: 11, residential: 11, living_street: 6,
  service: 5, motorway_link: 15, trunk_link: 13, primary_link: 11, secondary_link: 11, tertiary_link: 10,
};
export const drivable = (c: string) => c in CLASS_COST;

export interface Graph { x: Float64Array; z: Float64Array; adj: { to: number; len: number; cost: number; cls: string; w: number }[][] }

/** The road network as a graph: every road's points, joined where roads share a point (snapped to
 *  half a metre — the map's ways meet on shared nodes). Two-way. */
export function buildGraph(roads: readonly Road[]): Graph {
  const id = new Map<string, number>(), xs: number[] = [], zs: number[] = [], adj: Graph['adj'] = [];
  const node = (x: number, z: number) => {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let i = id.get(k);
    if (i === undefined) { i = xs.length; id.set(k, i); xs.push(x); zs.push(z); adj.push([]); }
    return i;
  };
  for (const r of roads) {
    if (!drivable(r.c) || r.lod || r.tu) continue;
    let prev = -1;
    for (let i = 0; i + 1 < r.p.length; i += 2) {
      const n = node(r.p[i] / 10, r.p[i + 1] / 10);
      if (prev >= 0 && prev !== n) {
        const len = Math.hypot(xs[n] - xs[prev], zs[n] - zs[prev]), cost = len * (CLASS_COST[r.c] ?? 2);
        adj[prev].push({ to: n, len, cost, cls: r.c, w: r.w });
        adj[n].push({ to: prev, len, cost, cls: r.c, w: r.w });
      }
      prev = n;
    }
  }
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), adj };
}

/** The point on the network nearest (x, z): its edge's two ends and how far along it. */
export function nearestOnGraph(g: Graph, x: number, z: number) {
  let best = { a: -1, b: -1, t: 0, d: Infinity, px: x, pz: z };
  for (let a = 0; a < g.adj.length; a++)
    for (const e of g.adj[a]) {
      if (e.to < a) continue;
      const ax = g.x[a], az = g.z[a], bx = g.x[e.to], bz = g.z[e.to], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < best.d) best = { a, b: e.to, t, d, px, pz };
    }
  return best;
}

/** A route between two points (the nearest points on the network to each): A* over the graph, its
 *  points with each one's road class and width; null when they aren't joined. */
export function route(g: Graph, from: { x: number; z: number }, to: { x: number; z: number }) {
  const s = nearestOnGraph(g, from.x, from.z), e = nearestOnGraph(g, to.x, to.z);
  if (s.a < 0 || e.a < 0) return null;
  const n = g.adj.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), prevE = new Array<Graph['adj'][number][number] | null>(n).fill(null);
  const h = (i: number) => Math.hypot(g.x[i] - e.px, g.z[i] - e.pz) * 0.8;
  const open: number[] = [];
  const push = (i: number) => { open.push(i); };
  for (const k of [s.a, s.b]) { dist[k] = Math.hypot(g.x[k] - s.px, g.z[k] - s.pz) * 1.5; push(k); }
  const goal = new Set([e.a, e.b]);
  let found = -1;
  while (open.length) {
    // (a plain array scan: a few thousand nodes for a drive across a town)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] + h(open[i]) < dist[open[bi]] + h(open[bi])) bi = i;
    const u = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (goal.has(u)) { found = u; break; }
    for (const ed of g.adj[u]) {
      const nd = dist[u] + ed.cost;
      if (nd < dist[ed.to]) {
        if (dist[ed.to] === Infinity) push(ed.to);
        dist[ed.to] = nd; prev[ed.to] = u; prevE[ed.to] = ed;
      }
    }
  }
  if (found < 0) return null;
  const pts: { x: number; z: number; cls: string; w: number }[] = [];
  for (let i = found; i >= 0; i = prev[i]) pts.push({ x: g.x[i], z: g.z[i], cls: prevE[i]?.cls ?? 'residential', w: prevE[i]?.w ?? 6 });
  pts.reverse();
  // the very start and end: the points on the roads nearest you and your goal
  pts.unshift({ x: s.px, z: s.pz, cls: pts[0]?.cls ?? 'service', w: pts[0]?.w ?? 6 });
  pts.push({ x: e.px, z: e.pz, cls: pts[pts.length - 1].cls, w: pts[pts.length - 1].w });
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.3);
}

export interface PathPt { x: number; z: number; s: number; v: number; cls: string }

/** The route as the van drives it: kept to its lane (right of the middle; left where they drive on
 *  the left), the corners rounded (a radius by the turn), a point every metre, and a speed for each —
 *  the road's own, no faster than the bend allows (2 m/s² sideways), easing on (1.4 m/s²) and off
 *  (2.2 m/s²), stopping at the end. `start`: where the van stands now and which way it faces, joined
 *  to the route by a gentle curve (out of its stall, onto its lane). `v0`: the speed it's doing there
 *  (a new destination picked on the move: it carries on, never stops to start again). */
export function lanePath(pts: { x: number; z: number; cls: string; w: number }[], opts: { driveLeft?: boolean; start?: { x: number; z: number; yaw: number }; v0?: number } = {}): PathPt[] {
  if (pts.length < 2) return [];
  const side = opts.driveLeft ? -1 : 1;
  // offset each point to its lane: half a lane right of the road's middle (a narrow one: its middle)
  const lane = (w: number) => (w >= 7 ? Math.min(1.9, w / 4) : w >= 5 ? w / 5 : 0);
  // (the last 30 m pull over to the kerb: the van parks at its side of the road, not in its lane)
  const left = new Float64Array(pts.length);
  for (let i = pts.length - 2; i >= 0; i--) left[i] = left[i + 1] + Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  const off: { x: number; z: number; cls: string }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // (right of the heading: the heading (dx, dz) turned −90° about y, with −z north: (−dz, dx))
    const kerb = Math.max(lane(pts[i].w), pts[i].w / 2 - 1.25), pull = 1 - Math.min(1, left[i] / 30);
    const o = (lane(pts[i].w) + (kerb - lane(pts[i].w)) * pull * pull * (3 - 2 * pull)) * side;
    off.push({ x: pts[i].x - dz * o, z: pts[i].z + dx * o, cls: pts[i].cls });
  }
  // out of the stall: from where the van stands, along its nose, curving onto its lane a van's turn
  // away (it joins the route at its first point 9 m or more off — a 6 m turning circle, not a pivot)
  let poly = off;
  if (opts.start) {
    const { x, z, yaw } = opts.start, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let j = 0;
    while (j + 1 < off.length - 1 && Math.hypot(off[j].x - x, off[j].z - z) < 9) j++;
    if (j > 0) off.splice(0, j);
    const p0 = off[0], d = Math.hypot(p0.x - x, p0.z - z), rolling = (opts.v0 ?? 0) > 1; // (on the move: onto the road at its own speed, not a car park's crawl)
    if (d > 1) {
      const c1 = { x: x + fx * d * 0.55, z: z + fz * d * 0.55 };
      const n1 = off[Math.min(1, off.length - 1)], tx = n1.x - p0.x, tz = n1.z - p0.z, tl = Math.hypot(tx, tz) || 1;
      const c2 = { x: p0.x - (tx / tl) * d * 0.45, z: p0.z - (tz / tl) * d * 0.45 };
      const lead: { x: number; z: number; cls: string }[] = [];
      const n = Math.max(2, Math.ceil(d / 1.5));
      for (let k = 0; k < n; k++) {
        const t = k / n, u = 1 - t;
        lead.push({ x: u * u * u * x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p0.x, z: u * u * u * z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t * t * t * p0.z, cls: rolling ? p0.cls : 'service' });
      }
      poly = [...lead, ...off];
    }
  }
  // round the corners: each corner's arc tangent to its two legs (a radius by the turn and the legs' room)
  const round: { x: number; z: number; cls: string }[] = [poly[0]];
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], c = poly[i + 1];
    const ux = b.x - a.x, uz = b.z - a.z, vx = c.x - b.x, vz = c.z - b.z, lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv))));
    if (turn < 0.05) { round.push(b); continue; }
    const R = Math.min(9, 4 + 6 * (1 - turn / Math.PI)), cut = Math.min(R * Math.tan(turn / 2), lu * 0.5, lv * 0.5);
    const p = { x: b.x - (ux / lu) * cut, z: b.z - (uz / lu) * cut }, q = { x: b.x + (vx / lv) * cut, z: b.z + (vz / lv) * cut };
    const n = Math.max(2, Math.ceil(turn / 0.12));
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t; // a quadratic Bézier through the corner: tangent to both legs
      round.push({ x: u * u * p.x + 2 * u * t * b.x + t * t * q.x, z: u * u * p.z + 2 * u * t * b.z + t * t * q.z, cls: b.cls });
    }
  }
  round.push(poly[poly.length - 1]);
  // a point every metre
  const cum = [0];
  for (let i = 1; i < round.length; i++) cum.push(cum[i - 1] + Math.hypot(round[i].x - round[i - 1].x, round[i].z - round[i - 1].z));
  const total = cum[cum.length - 1], out: PathPt[] = [];
  for (let s = 0, j = 1; ; s = Math.min(total, s + 1)) {
    while (j < round.length - 1 && cum[j] < s) j++;
    const a = round[j - 1], b = round[j], L = cum[j] - cum[j - 1], t = L > 1e-9 ? (s - cum[j - 1]) / L : 0;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s, v: 0, cls: b.cls });
    if (s >= total) break;
  }
  // speeds: the road's, the bend's limit, then easing on from the start and off to the stop
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const a = out[Math.max(0, i - 3)], b = out[i], c = out[Math.min(n - 1, i + 3)];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    const dh = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))), ds = Math.max(1, c.s - a.s);
    const k = dh / ds; // curvature (1/m)
    b.v = Math.min(CLASS_SPEED[b.cls] ?? 10, k > 1e-4 ? Math.sqrt(2 / k) : Infinity);
  }
  out[0].v = Math.max(0, opts.v0 ?? 0);
  out[n - 1].v = 0;
  for (let i = 1; i < n; i++) out[i].v = Math.min(out[i].v, Math.sqrt(out[i - 1].v ** 2 + 2 * 1.4 * (out[i].s - out[i - 1].s)));
  for (let i = n - 2; i >= 0; i--) out[i].v = Math.min(out[i].v, Math.sqrt(out[i + 1].v ** 2 + 2 * 2.2 * (out[i + 1].s - out[i].s)));
  return out;
}

/** Where along a path at distance s: the point, and the heading (yaw as three.js turns the van,
 *  whose nose is −z) from a few metres either side, so it never twitches on a short leg. */
export function poseAt(path: PathPt[], s: number) {
  const n = path.length;
  if (!n) return { x: 0, z: 0, yaw: 0, v: 0 };
  s = Math.max(0, Math.min(path[n - 1].s, s));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].s <= s) lo = m; else hi = m; }
  const a = path[lo], b = path[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, v = a.v + (b.v - a.v) * t;
  const back = path[Math.max(0, lo - 2)], fwd = path[Math.min(n - 1, hi + 2)];
  const yaw = Math.atan2(-(fwd.x - back.x), -(fwd.z - back.z)); // (the nose, −z, along the way ahead)
  return { x, z, yaw, v };
}

/** The seconds from each point of a path to its end, at the path's speeds (the nav screen's minutes). */
export function timeLeft(path: readonly PathPt[]): Float32Array {
  const out = new Float32Array(path.length);
  for (let i = path.length - 2; i >= 0; i--) out[i] = out[i + 1] + (path[i + 1].s - path[i].s) / Math.max(1.5, (path[i].v + path[i + 1].v) / 2);
  return out;
}

/** Driving a path: the speed follows the path's (no faster than it allows, eased), the van rolls on —
 *  from `v0` (a new destination picked on the move). */
export class Drive {
  s = 0;
  v = 0;
  done = false;
  constructor(readonly path: PathPt[], v0 = 0) { this.done = path.length < 2; this.v = Math.max(0, v0); }
  get length() { return this.path.length ? this.path[this.path.length - 1].s : 0; }
  step(dt: number) {
    if (this.done) return poseAt(this.path, this.s);
    // the path's speed here, never under a creep (it would stall short of the end), eased toward
    const want = Math.max(0.35, poseAt(this.path, this.s).v);
    this.v = want > this.v ? Math.min(want, this.v + 1.4 * dt) : Math.max(want, this.v - 2.6 * dt);
    this.s += this.v * dt;
    if (this.s >= this.length - 0.05) { this.s = this.length; this.v = 0; this.done = true; }
    return poseAt(this.path, this.s);
  }
}

// ---------------- driven by hand (W/S and A/D at the wheel; a phone's stick) ----------------
/** How the van handles: its top speed and pull (the pull fading toward the top), its brakes, reverse,
 *  how it coasts, its wheelbase and the wheel's lock — and never more sideways pull than `grip` (m/s²:
 *  at speed the wheel turns it gently, so the view from the seat never swings hard). */
export const HANDLING = { vmax: 22, accel: 3.4, brake: 9, reverse: 5, revAccel: 2.5, coast: 0.9, drag: 0.035, wheelbase: 3.4, lock: 0.6, grip: 7, steerRate: 4, hold: 6 };
export interface Wheel { v: number; steer: number; yaw: number }
/** The wheel's turn at speed v: full lock while slow, then no more than the grip allows. */
export function wheelLock(v: number, H = HANDLING) {
  const a = Math.abs(v);
  return a < 0.5 ? H.lock : Math.min(H.lock, Math.atan((H.grip * H.wheelbase) / (a * a)));
}
/** One step of the van by hand: `thr` −1…1 (on; brake, then back), `steer` −1…1 (+ left). With no one at
 *  the wheel (`hold`) it brakes to a stop and stays there. Turns `s` (v m/s along its nose, the wheel's
 *  eased turn, yaw as three.js turns it) and returns how far it went along its nose. */
export function stepWheel(s: Wheel, thr: number, steer: number, dt: number, hold = false, H = HANDLING): number {
  if (hold) s.v -= Math.sign(s.v) * Math.min(Math.abs(s.v), H.hold * dt);
  else if (thr > 0) {
    if (s.v < -0.3) s.v = Math.min(0, s.v + H.brake * thr * dt); // (rolling back: the brakes first)
    else if (thr >= 1 || s.v < H.vmax * thr) s.v += H.accel * thr * Math.max(0.3, 1 - Math.max(0, s.v) / (H.vmax * 1.25)) * dt;
  } else if (thr < 0) {
    if (s.v > 0.3) s.v = Math.max(0, s.v + H.brake * thr * dt); // (on the brakes: down to a stop, not past it)
    else s.v += H.revAccel * thr * dt;
  } else s.v -= Math.sign(s.v) * Math.min(Math.abs(s.v), (H.coast + Math.abs(s.v) * H.drag) * dt);
  s.v = Math.max(-H.reverse, Math.min(H.vmax, s.v));
  s.steer += ((hold ? 0 : steer) - s.steer) * Math.min(1, dt * H.steerRate);
  s.yaw += (s.v / H.wheelbase) * Math.tan(s.steer * wheelLock(s.v, H)) * dt;
  return s.v * dt;
}
