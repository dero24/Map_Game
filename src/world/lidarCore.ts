// Pure half of the LiDAR pipeline (no network, no WASM) — unit-tested.
//
// The source is USGS 3DEP as Entwine Point Tiles (EPT): every 3DEP project, lower 48 and
// beyond, as a public LAZ octree in EPSG:3857. The tile worker (lidar.ts) picks candidate
// projects for a cell from lidar-index.json, reads the octree nodes that cover it and
// bins the points here into two 1 m grids — the surface (max of everything that isn't noise
// or water) and the bare earth (mean of ground-classified points, holes filled by pull-push).
// Their difference, height above ground, is what measure.ts fits roofs to.
import type { Box } from './data';
import { makeProjector } from './realTile';

type LatLon = { lat: number; lon: number };
const R = 6378137;
const D2R = Math.PI / 180;


// ---------- projections ----------
export const toMerc = (lat: number, lon: number): [number, number] => [R * lon * D2R, R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2))];
export const fromMerc = (X: number, Y: number): [number, number] => [(2 * Math.atan(Math.exp(Y / R)) - Math.PI / 2) / D2R, X / R / D2R];

// The game's local frame (+x east, +z south, equirectangular about `origin`).
const unproject = (o: LatLon, x: number, z: number) => makeProjector(o).unproject(x, z);
const project = (o: LatLon, lat: number, lon: number) => makeProjector(o).project(lat, lon);

// Mercator → local as an affine map fitted exactly at three corners of `box`. Over a 1 km
// cell the true map is affine to ~2 cm — far below the 1 m bins.
export interface Affine { a: number; b: number; c: number; d: number; e: number; f: number } // x = aX+bY+c, z = dX+eY+f
export function mercToLocal(origin: LatLon, box: Box): Affine {
  const P = [[box.x0, box.z0], [box.x1, box.z0], [box.x0, box.z1]].map(([x, z]) => {
    const [la, lo] = unproject(origin, x, z);
    return { x, z, M: toMerc(la, lo) };
  });
  // solve [X Y 1] * [a d; b e; c f] = [x z] for the three points
  const [p, q, r] = P;
  const X1 = q.M[0] - p.M[0], Y1 = q.M[1] - p.M[1], X2 = r.M[0] - p.M[0], Y2 = r.M[1] - p.M[1];
  const det = X1 * Y2 - X2 * Y1;
  const sol = (u1: number, u2: number) => [(u1 * Y2 - u2 * Y1) / det, (X1 * u2 - X2 * u1) / det];
  const [a, b] = sol(q.x - p.x, r.x - p.x);
  const [d, e] = sol(q.z - p.z, r.z - p.z);
  return { a, b, c: p.x - a * p.M[0] - b * p.M[1], d, e, f: p.z - d * p.M[0] - e * p.M[1] };
}
export function localToMercBox(origin: LatLon, box: Box, pad: number): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, z] of [[box.x0 - pad, box.z0 - pad], [box.x1 + pad, box.z0 - pad], [box.x0 - pad, box.z1 + pad], [box.x1 + pad, box.z1 + pad]]) {
    const [la, lo] = unproject(origin, x, z);
    const [X, Y] = toMerc(la, lo);
    (x0 = Math.min(x0, X)), (x1 = Math.max(x1, X)), (y0 = Math.min(y0, Y)), (y1 = Math.max(y1, Y));
  }
  return [x0, y0, x1, y1];
}
export const boxLatLon = (origin: LatLon, box: Box) => {
  const [n, w] = unproject(origin, box.x0, box.z0);
  const [s, e] = unproject(origin, box.x1, box.z1);
  return { s, w, n, e };
};
export { project as projectLocal, unproject as unprojectLocal };

// ---------- project index ----------
export interface LidarProject { n: string; y: number; b: [number, number, number, number]; r: number[][]; _rings?: Int32Array[] }
export interface LidarIndex { v: number; q: number; ept: string; p: LidarProject[] }

function rings(p: LidarProject): Int32Array[] {
  if (p._rings) return p._rings;
  return (p._rings = p.r.map((f) => {
    const a = new Int32Array(f.length);
    a[0] = f[0], a[1] = f[1];
    for (let i = 2; i < f.length; i += 2) (a[i] = a[i - 2] + f[i]), (a[i + 1] = a[i - 1] + f[i + 1]);
    return a;
  }));
}
function inRing(r: Int32Array, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Projects whose coverage outline touches the lat/lon box — newest survey first (then
// larger point budgets are not knowable here; the worker checks hierarchy counts).
// Outlines are simplified (≤ `tol` index units inward), so the cell is widened by that much
// before testing — a cell at a survey's edge must not be written off as uncovered.
export function candidates(idx: LidarIndex, bb: { s: number; w: number; n: number; e: number }, tol = 2.5): LidarProject[] {
  const q = idx.q, W = bb.w * q - tol, E = bb.e * q + tol, S = bb.s * q - tol, N = bb.n * q + tol;
  const out: LidarProject[] = [];
  for (const p of idx.p) {
    const [w, s, e, n] = p.b;
    if (e < W || w > E || n < S || s > N) continue;
    const rs = rings(p);
    let hit = false;
    for (let i = 0; i <= 4 && !hit; i++) for (let j = 0; j <= 4 && !hit; j++) {
      const x = W + ((E - W) * i) / 4, y = S + ((N - S) * j) / 4;
      hit = rs.some((r) => inRing(r, x, y));
    }
    // an outline vertex inside the cell (coverage clipping the corner)
    for (const r of rs) for (let i = 0; i < r.length && !hit; i += 2) hit = r[i] >= W && r[i] <= E && r[i + 1] >= S && r[i + 1] <= N;
    if (hit) out.push(p);
  }
  return out.sort((a, b) => b.y - a.y || a.n.localeCompare(b.n));
}

// ---------- EPT octree ----------
export interface EptInfo { bounds: number[]; span: number }
// Node keys "D-X-Y-Z" whose XY footprint meets the mercator box, down to `maxD`. The
// hierarchy map may contain -1 (= "counts live in a sub-file"); callers expand those.
export function nodeBox(ept: EptInfo, key: string): [number, number, number, number, number] {
  const [d, x, y] = key.split('-').map(Number);
  const w = (ept.bounds[3] - ept.bounds[0]) / 2 ** d;
  return [ept.bounds[0] + x * w, ept.bounds[1] + y * w, ept.bounds[0] + (x + 1) * w, ept.bounds[1] + (y + 1) * w, d];
}
export function nodesIn(ept: EptInfo, hier: Record<string, number>, mb: [number, number, number, number], maxD: number): string[] {
  const out: string[] = [];
  for (const k of Object.keys(hier)) {
    const [x0, y0, x1, y1, d] = nodeBox(ept, k);
    if (d > maxD || x1 < mb[0] || x0 > mb[2] || y1 < mb[1] || y0 > mb[3]) continue;
    out.push(k);
  }
  return out;
}
// Octree depth whose own point spacing (node width / span) reaches `target` ground metres —
// an upper bound for how deep the hierarchy needs expanding.
export function depthFor(ept: EptInfo, lat: number, target = 1.0): number {
  const W = (ept.bounds[3] - ept.bounds[0]) * Math.cos(lat * D2R); // mercator → ground metres
  return Math.max(0, Math.ceil(Math.log2(W / ept.span / target)));
}
// EPT is additive: reading depths 0..d gives the SUM of their densities. From the
// hierarchy counts of the nodes over the cell, the shallowest depth whose cumulative
// density reaches `perM2` points per ground m² (surveys differ 10× — a fixed depth reads
// 7 M points of a QL1 city survey where 2 M measure the same roofs). Nodes stacked in Z
// share a column: counts are summed per (d, x, y) column. -1 (unexpanded) counts are skipped.
export function depthForDensity(ept: EptInfo, hier: Record<string, number>, keys: string[], lat: number, perM2: number, cap: number): number {
  const W = (ept.bounds[3] - ept.bounds[0]) * Math.cos(lat * D2R);
  const cols = new Map<number, Map<string, number>>();
  for (const k of keys) {
    const c = hier[k];
    if (c < 0) continue;
    const [d, x, y] = k.split('-');
    let m = cols.get(+d);
    if (!m) cols.set(+d, (m = new Map()));
    const xy = x + '-' + y;
    m.set(xy, (m.get(xy) ?? 0) + c);
  }
  let cum = 0;
  for (let d = 0; d <= cap; d++) {
    const m = cols.get(d);
    if (!m || !m.size) continue;
    let s = 0;
    for (const v of m.values()) s += v;
    cum += s / m.size / (W / 2 ** d) ** 2;
    if (cum >= perM2) return d;
  }
  return cap;
}

// ---------- LAS point records ----------
export interface LasHeader { pf: number; len: number; sx: number; sy: number; sz: number; ox: number; oy: number; oz: number }
export function lasHeader(buf: Uint8Array): LasHeader {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    pf: dv.getUint8(104) & 0x3f, len: dv.getUint16(105, true),
    sx: dv.getFloat64(131, true), sy: dv.getFloat64(139, true), sz: dv.getFloat64(147, true),
    ox: dv.getFloat64(155, true), oy: dv.getFloat64(163, true), oz: dv.getFloat64(171, true),
  };
}
// Classification of one raw record (formats 0–5 keep it in the low 5 bits of byte 15;
// 6–10 in byte 16).
export const lasClass = (rec: Uint8Array, off: number, pf: number) => (pf >= 6 ? rec[off + 16] : rec[off + 15] & 31);
// ASPRS: 2 ground, 7 low noise, 9 water, 17 bridge deck, 18 high noise.
export const isGround = (c: number) => c === 2;
export const isSurface = (c: number) => c !== 7 && c !== 9 && c !== 17 && c !== 18;
export const isVeg = (c: number) => c >= 3 && c <= 5;

// ---------- grids ----------
export class LidarGrid {
  readonly w: number; readonly h: number;
  readonly top: Float32Array; // max surface Z per bin (−Inf = none) — canopy included
  readonly veg: Float32Array; // max vegetation-classified Z (ASPRS 3/4/5; −Inf = none)
  readonly any: Uint8Array; // bin saw any return at all (water and noise included) — coverage
  readonly gs: Float32Array; readonly gn: Uint16Array; // ground Z sum / count
  n = 0; vegN = 0;
  constructor(readonly x0: number, readonly z0: number, readonly res: number, x1: number, z1: number) {
    this.w = Math.ceil((x1 - x0) / res);
    this.h = Math.ceil((z1 - z0) / res);
    this.top = new Float32Array(this.w * this.h).fill(-Infinity);
    this.veg = new Float32Array(this.w * this.h).fill(-Infinity);
    this.any = new Uint8Array(this.w * this.h);
    this.gs = new Float32Array(this.w * this.h);
    this.gn = new Uint16Array(this.w * this.h);
  }
  add(x: number, z: number, y: number, cls: number) {
    const i = Math.floor((x - this.x0) / this.res), j = Math.floor((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return;
    const k = j * this.w + i;
    this.any[k] = 1;
    this.n++;
    if (isSurface(cls) && y > this.top[k]) this.top[k] = y;
    if (isGround(cls) && this.gn[k] < 65535) (this.gs[k] += y), this.gn[k]++;
    if (isVeg(cls)) {
      this.vegN++;
      if (y > this.veg[k]) this.veg[k] = y;
    }
  }
  // Does this survey classify vegetation? (Newer 3DEP QL1/QL2 deliveries do; older ones
  // leave everything above ground as 1 "unclassified".)
  vegClassified() {
    return this.vegN > this.n * 0.03;
  }
  // Holes in this grid take another survey's bins (older data only where newer has none —
  // never a mix inside one bin, so a rebuilt house doesn't average with its predecessor).
  fillFrom(o: LidarGrid) {
    for (let k = 0; k < this.top.length; k++) {
      if (this.top[k] === -Infinity && !this.gn[k]) (this.top[k] = o.top[k]), (this.veg[k] = o.veg[k]), (this.gs[k] = o.gs[k]), (this.gn[k] = o.gn[k]);
      this.any[k] |= o.any[k];
    }
  }
  groundFraction() {
    let n = 0;
    for (let k = 0; k < this.gn.length; k++) if (this.gn[k]) n++;
    return n / this.gn.length;
  }
  // Coverage: the fraction of 4×4 m blocks holding any return. (Per 1 m bin it would read
  // ~60 % on a perfectly complete 1 pt/m² survey.)
  surfaceFraction() {
    const B = 4, W = Math.floor(this.w / B), H = Math.floor(this.h / B);
    let n = 0;
    for (let J = 0; J < H; J++) for (let I = 0; I < W; I++) {
      let hit = false;
      for (let j = J * B; j < J * B + B && !hit; j++) for (let i = I * B; i < I * B + B; i++) if (this.top[j * this.w + i] > -Infinity) { hit = true; break; }
      if (hit) n++;
    }
    return n / Math.max(1, W * H);
  }
  // Height above ground. Ground under roofs (no ground returns) comes from pull-push —
  // a mip pyramid of the known bins pushed back down — so a 60 m warehouse still gets a
  // smooth floor from its surroundings. Single-bin surface holes (sparser survey) take
  // the mean of their 3×3 neighbours. NaN where neither exists. The surface is the highest
  // return — a roof, or a tree over it (measure.ts treats canopy as outliers; roofs lost
  // under dense canopy fail its confidence gate and keep their mapped priors). Tried: the
  // lowest non-ground return per bin (roof under leaf-off canopy) — noisier on the shore
  // survey (more low-confidence fits in every cell), so not used.
  hag(): Float32Array {
    return this.above(this.top, pullPush(this.gs, this.gn, this.w, this.h));
  }
  // Canopy height from vegetation-classified returns only (buildings, wires and poles can't
  // pose as trees) — null when the survey doesn't classify vegetation.
  canopy(): Float32Array | null {
    if (!this.vegClassified()) return null;
    return this.above(this.veg, pullPush(this.gs, this.gn, this.w, this.h), false);
  }
  // Which of `n`×`n` blocks over `box` saw any return (land, water, noise): where a survey
  // simply has no data, LiDAR can't be trusted to say "no tree here".
  coverage(box: Box, n = 16): Uint8Array {
    const out = new Uint8Array(n * n);
    const bw = (box.x1 - box.x0) / n, bh = (box.z1 - box.z0) / n;
    for (let J = 0; J < n; J++) for (let I = 0; I < n; I++) {
      const i0 = Math.floor((box.x0 + I * bw - this.x0) / this.res), i1 = Math.floor((box.x0 + (I + 1) * bw - this.x0) / this.res);
      const j0 = Math.floor((box.z0 + J * bh - this.z0) / this.res), j1 = Math.floor((box.z0 + (J + 1) * bh - this.z0) / this.res);
      let c = 0, t = 0;
      for (let j = Math.max(0, j0); j < Math.min(this.h, j1); j++) for (let i = Math.max(0, i0); i < Math.min(this.w, i1); i++) (t++), (c += this.any[j * this.w + i]);
      out[J * n + I] = t && c > t * 0.25 ? 1 : 0;
    }
    return out;
  }
  private above(S: Float32Array, g: Float32Array, fill = true): Float32Array {
    const { w, h } = this;
    const out = new Float32Array(w * h).fill(NaN);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let t = S[k];
      if (t === -Infinity && fill) {
        // the MEAN of known neighbours (the max would lift a sloped roof ~half a bin's rise)
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < w && jj < h && S[jj * w + ii] > -Infinity) (s += S[jj * w + ii]), n++;
        }
        if (n) t = s / n;
      }
      if (t > -Infinity && !Number.isNaN(g[k])) out[k] = Math.max(0, t - g[k]);
      else if (!fill && !Number.isNaN(g[k]) && this.any[k]) out[k] = 0; // seen, and not vegetation
    }
    return out;
  }

}

// Pull-push hole filling: average known values up a pyramid, then fill every unknown bin
// from the coarsest level that knows it (bilinear-free, nearest-parent — the ground is
// smooth at the scale of a roof and this stays O(n)).
export function pullPush(sum: Float32Array, cnt: Uint16Array, w: number, h: number): Float32Array {
  type L = { w: number; h: number; v: Float32Array; n: Float32Array };
  const lv: L[] = [];
  let cur: L = { w, h, v: new Float32Array(w * h), n: new Float32Array(w * h) };
  for (let k = 0; k < w * h; k++) if (cnt[k]) (cur.v[k] = sum[k] / cnt[k]), (cur.n[k] = 1);
  lv.push(cur);
  while (cur.w > 1 || cur.h > 1) {
    const W = Math.ceil(cur.w / 2), H = Math.ceil(cur.h / 2);
    const nx: L = { w: W, h: H, v: new Float32Array(W * H), n: new Float32Array(W * H) };
    for (let j = 0; j < cur.h; j++) for (let i = 0; i < cur.w; i++) {
      const k = j * cur.w + i;
      if (!cur.n[k]) continue;
      const K = (j >> 1) * W + (i >> 1);
      nx.v[K] += cur.v[k] * cur.n[k];
      nx.n[K] += cur.n[k];
    }
    for (let K = 0; K < W * H; K++) if (nx.n[K]) nx.v[K] /= nx.n[K];
    lv.push((cur = nx));
  }
  if (!lv[lv.length - 1].n[0]) return new Float32Array(w * h).fill(NaN); // no ground at all
  for (let l = lv.length - 2; l >= 0; l--) {
    const a = lv[l], b = lv[l + 1];
    for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) {
      const k = j * a.w + i;
      if (!a.n[k]) (a.v[k] = b.v[(j >> 1) * b.w + (i >> 1)]), (a.n[k] = 1e-6);
    }
  }
  return lv[0].v;
}

// A finished HAG raster in the local frame; `at` is a nearest-bin lookup (roof edges must
// not blend with the ground beside them).
export interface Hag {
  x0: number; z0: number; res: number; w: number; h: number;
  v: Float32Array; // surface height above ground (roofs, canopy, everything)
  chm: Float32Array | null; // vegetation-only canopy height, when the survey classifies it
  cov: Uint8Array; // 16×16 coverage blocks over the cell box
  src: string; year: number;
}
export function hagAt(g: Hag, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.res), j = Math.floor((z - g.z0) / g.res);
  if (i < 0 || j < 0 || i >= g.w || j >= g.h) return NaN;
  return g.v[j * g.w + i];
}

// ---------- trees ----------
export interface TreeHit { x: number; z: number; h: number; r: number }
// Cells of the grid inside (or within `pad` m of) any ring — building footprints, so a roof
// peak is never read as a tree top.
export function ringMask(g: { x0: number; z0: number; res: number; w: number; h: number }, rings: [number, number][][], pad: number): Uint8Array {
  const m = new Uint8Array(g.w * g.h);
  for (const r of rings) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    const i0 = Math.max(0, Math.floor((x0 - pad - g.x0) / g.res)), i1 = Math.min(g.w - 1, Math.floor((x1 + pad - g.x0) / g.res));
    const j0 = Math.max(0, Math.floor((z0 - pad - g.z0) / g.res)), j1 = Math.min(g.h - 1, Math.floor((z1 + pad - g.z0) / g.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = g.x0 + (i + 0.5) * g.res, z = g.z0 + (j + 0.5) * g.res;
      let inside = false, d = Infinity;
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [xa, za] = r[a], [xb, zb] = r[b];
        if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
        if (pad > 0) {
          const dx = xb - xa, dz = zb - za, L2 = dx * dx + dz * dz || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - xa) * dx + (z - za) * dz) / L2));
          d = Math.min(d, Math.hypot(x - xa - t * dx, z - za - t * dz));
        }
      }
      if (inside || d <= pad) m[j * g.w + i] = 1;
    }
  }
  return m;
}

// Individual trees from a canopy height model: local maxima of the lightly smoothed CHM
// (window grows with height — big crowns have one top), crown radius from where the
// profile falls to ~half height in 8 directions, then tallest-first thinning so one crown
// never spawns two trees. `strict` (the survey doesn't classify vegetation, so the CHM is
// every non-ground return): also reject smooth tops (unmapped roofs, sheds) and pencil-thin
// peaks (poles, wires) — foliage is rough at 1 m, roofs are planes.
export function detectTrees(g: { x0: number; z0: number; res: number; w: number; h: number }, H: Float32Array, blocked: Uint8Array, box: Box, strict: boolean, cap = 12000): TreeHit[] {
  const { w, h } = g;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? NaN : H[j * w + i]);
  // 3×3 mean (NaN-aware)
  const S = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const v = at(i + di, j + dj);
      if (!Number.isNaN(v)) (s += v), n++;
    }
    S[j * w + i] = n ? s / n : 0;
  }
  const cand: TreeHit[] = [];
  const i0 = Math.max(0, Math.floor((box.x0 - g.x0) / g.res)), i1 = Math.min(w, Math.ceil((box.x1 - g.x0) / g.res));
  const j0 = Math.max(0, Math.floor((box.z0 - g.z0) / g.res)), j1 = Math.min(h, Math.ceil((box.z1 - g.z0) / g.res));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = j * w + i, s0 = S[k];
    if (s0 < 2.5 || blocked[k]) continue;
    const R = Math.max(2, Math.min(5, Math.round(1.2 + 0.12 * s0)));
    let peak = true;
    for (let dj = -R; dj <= R && peak; dj++) for (let di = -R; di <= R; di++) {
      if ((!di && !dj) || di * di + dj * dj > R * R) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const v = S[jj * w + ii];
      if (v > s0 || (v === s0 && jj * w + ii < k)) { peak = false; break; }
    }
    if (!peak) continue;
    // true top: the raw max around the smoothed peak
    let top = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = at(i + di, j + dj); if (v > top) top = v; }
    // crown radius
    let rs = 0;
    for (const [dx, dz] of DIRS) {
      let d = 1;
      for (; d <= 12; d++) {
        const v = at(Math.round(i + dx * d), Math.round(j + dz * d));
        if (Number.isNaN(v) || v < top * 0.5 || v > top + 0.5) break;
      }
      rs += d - 0.5;
    }
    const r = Math.max(1, (rs / DIRS.length) * g.res);
    if (strict) {
      if (r < 1.4 && top > 5) continue; // a pole or a wire span, not a crown
      // a plateau at the top (flat roof, deck, tank) — foliage never sits level to 25 cm
      let near = 0, all = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        if (di * di + dj * dj > 4) continue;
        const v = at(i + di, j + dj);
        if (Number.isNaN(v)) continue;
        all++;
        if (Math.abs(v - top) < 0.25) near++;
      }
      if (all && near / all >= 0.6) continue;
      // plane fit over 5×5: foliage leaves a rough residual, a roof (even a ridge) doesn't
      let n = 0, sx = 0, sz = 0, sv = 0, sxx = 0, szz = 0, sxv = 0, szv = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const v = at(i + di, j + dj);
        if (Number.isNaN(v)) continue;
        n++, (sx += di), (sz += dj), (sv += v), (sxx += di * di), (szz += dj * dj), (sxv += di * v), (szv += dj * v);
      }
      if (n >= 12) {
        const mx = sx / n, mz = sz / n, mv = sv / n;
        const bx = (sxv - n * mx * mv) / (sxx - n * mx * mx || 1), bz = (szv - n * mz * mv) / (szz - n * mz * mz || 1);
        let e = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const v = at(i + di, j + dj);
          if (Number.isNaN(v)) continue;
          const f = mv + bx * (di - mx) + bz * (dj - mz);
          e += (v - f) * (v - f);
        }
        if (Math.sqrt(e / n) < 0.3) continue;
      }
    }
    cand.push({ x: g.x0 + (i + 0.5) * g.res, z: g.z0 + (j + 0.5) * g.res, h: top, r: Math.min(r, 0.75 * top + 1) });
  }
  // tallest first; a tree claims its crown — later peaks inside it are the same tree
  cand.sort((a, b) => b.h - a.h || a.x - b.x || a.z - b.z);
  const cell = 8, grid = new Map<number, TreeHit[]>();
  const key = (cx: number, cz: number) => cx * 73856093 ^ cz * 19349663;
  const out: TreeHit[] = [];
  for (const t of cand) {
    if (out.length >= cap) break;
    const cx = Math.floor(t.x / cell), cz = Math.floor(t.z / cell);
    let ok = true;
    for (let a = -2; a <= 2 && ok; a++) for (let b = -2; b <= 2 && ok; b++) {
      for (const o of grid.get(key(cx + a, cz + b)) ?? []) if (Math.hypot(o.x - t.x, o.z - t.z) < Math.max(1.8, 0.7 * o.r)) { ok = false; break; }
    }
    if (!ok) continue;
    out.push(t);
    const kk = key(cx, cz);
    const l = grid.get(kk);
    if (l) l.push(t);
    else grid.set(kk, [t]);
  }
  return out;
}
