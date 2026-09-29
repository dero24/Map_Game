// Interiors, Stage A — the shell (docs/INTERIORS_PLAN.md §3). A pure function of (footprint, door,
// seed), run in the tile worker for every enterable building: the frame, the rectangle the rooms
// fill, the building's family, its storeys, and everything collision needs before anyone walks in
// — stairs (straight or dogleg) with their stairwell openings — plus the circulation skeleton the
// rooms hang off: a house's hall, a block's corridor, lobby and stair cores, an office's core.
// Stage B (layout.ts) fills in rooms, walls and doors when the building activates.
import type { Footprint, Door } from '../buildings';
import { floorHeight, KIND } from '../buildings';
import type { WalkWorld } from '../../player/collision';
import { useOf } from '../uses';
import { makeRng, type Rng } from '../../core/rng';

export type P2 = [number, number];
export interface Rect { u0: number; u1: number; v0: number; v1: number }
/** A flight of stairs. Its footprint is the rect; it rises along u (or v with axis 1) from
 *  bottomU to topU (coordinates on that axis), from `lo` to `hi` of a storey (default 0 → 1). */
export interface Flight {
  u0: number; u1: number; v0: number; v1: number;
  bottomU: number; topU: number;
  level: number; // the storey it rises from
  axis?: 1;
  lo?: number; hi?: number;
  steps?: number; // risers
  open?: number; // the side open to the room (a banister): +1 the high cross edge, -1 the low one, 0 walled
}
/** A stair landing: a floor at `y` of a storey above `level`. */
export interface Landing extends Rect { level: number; y: number }
/** A stairwell: storey `level` has no floor here. */
export interface Opening extends Rect { level: number }
/** A row of rooms or flats along axis `ax` (0: along u, 1: along v), reached from its `side` edge
 *  on the other axis (-1: the low edge, +1: the high edge); the facade is the far edge. */
export interface Band { r: Rect; ax: 0 | 1; side: -1 | 1; one?: boolean }
/** A stair core: its room, and the dogleg against the room's far end. `slot`: the band slot it
 *  stands in when that's more than the room (over a shop: a store behind it upstairs). */
export interface Core { room: Rect; stair: Rect; slot?: Rect }

export type Arch = 'house' | 'flats' | 'office' | 'shop' | 'food' | 'church' | 'open';

export interface Plan {
  fp: string;
  door: Door;
  cx: number; cz: number; ux: number; uz: number; vx: number; vz: number; L: number; W: number;
  loc: P2[]; // the footprint in the local (u, v) frame: +u points in from the front door
  floor0: number; floorH: number; levels: number; ceilTop: number;
  flights: Flight[];
  ud: number; vd: number; // door (wall centre) in local coords
  arch: Arch; // the ground storey's family
  up: Arch; // the family of the storeys above it
  n: number; // storeys by height (levels: the ones built, ≤ 4)
  seed: number;
  kind: number; // KIND (the interior walls' window rule)
  main: Rect; // the rectangle the rooms fill
  annex: Rect[]; // the rest of the outline: rooms of their own
  holes: Opening[];
  landings: Landing[];
  cw: number[]; // stair collision walls, 6 per wall: u0 v0 u1 v1 y0 y1 (y above floor0)
  strip?: Rect; // house: the hall from the front door (stair and passage)
  lane?: Rect; // house: the stair's part of the hall (a straight flight or a dogleg core)
  spine?: Rect[]; // flats: corridors
  bands?: Band[]; // flats: rows of flats off the corridors (`one`: a single flat)
  lobby?: Rect; // flats: the entrance lobby (ground storey)
  cores?: Core[]; // stair cores (flats, offices, the stair up from a shop)
  core?: Rect; // an office's service core, or the core a ring corridor goes round
}

// ---------------- geometry ----------------
export const inPoly = (u: number, v: number, poly: P2[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > v !== zj > v && u < ((xj - xi) * (v - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const segX = (a: P2, b: P2, c: P2, d: P2) => {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
  const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
export const polyArea = (p: P2[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
};
export const rectArea = (r: Rect) => Math.max(0, r.u1 - r.u0) * Math.max(0, r.v1 - r.v0);

// Geometry queries on a local-frame polygon.
export class LocalPoly {
  constructor(readonly p: P2[]) {}
  inside(u: number, v: number) { return inPoly(u, v, this.p); }
  // v-intervals of the polygon along the line u = const
  spans(u: number): [number, number][] { return this.spansAt(0, u); }
  /** Intervals of the polygon along the line (axis 0: u = c, the intervals in v; axis 1: v = c, in u). */
  spansAt(axis: 0 | 1, c: number): [number, number][] {
    const xs: number[] = [];
    const p = this.p, a = axis, b = 1 - axis;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const pa = p[j][a], pb = p[j][b], qa = p[i][a], qb = p[i][b];
      if ((pa <= c) !== (qa <= c)) xs.push(pb + ((c - pa) / (qa - pa)) * (qb - pb));
    }
    xs.sort((x, y) => x - y);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
    return out;
  }
  // the interval containing vRef, intersected over u in [ua, ub]
  span(ua: number, ub: number, vRef: number): [number, number] | null {
    let lo = -Infinity, hi = Infinity;
    for (let k = 0; k <= 4; k++) {
      const u = ua + ((ub - ua) * k) / 4;
      const s = this.spans(u).find(([a, b]) => vRef >= a && vRef <= b);
      if (!s) return null;
      lo = Math.max(lo, s[0]);
      hi = Math.min(hi, s[1]);
    }
    return hi > lo ? [lo, hi] : null;
  }
  // axis-aligned rectangle fully inside (margin m from the outline)
  rectIn(u0: number, u1: number, v0: number, v1: number, m = 0.1) {
    u0 -= m; u1 += m; v0 -= m; v1 += m;
    const c: P2[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const q of c) if (!inPoly(q[0], q[1], this.p)) return false;
    if (!inPoly((u0 + u1) / 2, (v0 + v1) / 2, this.p)) return false;
    for (const q of this.p) if (q[0] > u0 && q[0] < u1 && q[1] > v0 && q[1] < v1) return false;
    for (let i = 0, j = this.p.length - 1; i < this.p.length; j = i++)
      for (let k = 0; k < 4; k++) if (segX(this.p[j], this.p[i], c[k], c[(k + 1) % 4])) return false;
    return true;
  }
  private readonly hitR = { i: 0, s: 0, t: 0 };
  /** Where a ray from (u, v) along (du, dv) first leaves through the outline: edge i, fraction s
   *  along it, distance t. (The result is reused by the next call: read it straight away.) */
  hit(u: number, v: number, du: number, dv: number): { i: number; s: number; t: number } | null {
    let bi = -1, bs = 0, bt = Infinity;
    const p = this.p;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const det = ex * dv - du * ey;
      if (Math.abs(det) < 1e-9) continue;
      const t = (ex * (a[1] - v) - ey * (a[0] - u)) / det;
      const s = (du * (a[1] - v) - dv * (a[0] - u)) / det;
      if (t < -1e-6 || s < -1e-6 || s > 1 + 1e-6) continue;
      if (t < bt) (bi = i), (bs = s), (bt = t);
    }
    if (bi < 0) return null;
    const h = this.hitR;
    h.i = bi; h.s = bs; h.t = bt;
    return h;
  }
}

// ---------------- the facade's windows (as the interior walls draw them) ----------------
export interface WinModel { kind: number; eave: number; fo: number }
/** Window cells on a wall of length `len` at storey fi — the interior walls' windowAt
 *  (buildings.ts GLSL_WINDOWS) with every cell glazed. null: no windows there on that storey. */
type Wins = { n: number; cellW: number; half: number } | null;
const WIN_MEMO = new WeakMap<WinModel, Map<number, Wins>>();
export function wallWindows(len: number, fi: number, M: WinModel): Wins {
  // (a building asks about the same few walls thousands of times)
  let memo = WIN_MEMO.get(M);
  if (!memo) WIN_MEMO.set(M, (memo = new Map()));
  const key = Math.round(len * 1000) * 64 + fi;
  let w = memo.get(key);
  if (w === undefined) memo.set(key, (w = windowsOf(len, fi, M)));
  return w;
}
function windowsOf(len: number, fi: number, M: WinModel): Wins {
  const k = M.kind;
  if (k > 4.5 || len <= 2) return null;
  const shop = k > 1.5 && k < 2.5, large = k > 2.5 && k < 3.5, church = k > 3.5;
  const fH = shop ? 3.8 : large ? 3.1 : church ? 60 : 2.9;
  const store = shop && fi === 0;
  const spacing = store ? 3.4 : large ? 2.2 : church ? 3.4 : 2.7;
  const n = Math.max(1, Math.floor((len - 0.6) / spacing));
  const cellW = len / n;
  const ww = store ? cellW * 0.78 : church ? Math.min(1.1, cellW * 0.4) : Math.min(1.0, cellW * 0.5);
  const sill = store ? 0.45 : 0.9;
  const wh = store ? 2.3 : church ? Math.max(1.2, Math.min(3.4, M.eave - M.fo - sill - 0.35)) : 1.35;
  if (!store && fi * fH + sill + wh > M.eave - M.fo - 0.12) return null;
  if (fi * fH >= M.eave - M.fo - 0.25) return null;
  return { n, cellW, half: ww / 2 + 0.04 };
}
/** Is `along` (m from the edge's start) within `m` of a window's frame? */
export function onWindow(W: { n: number; cellW: number; half: number }, along: number, m: number) {
  const ci = Math.floor(along / W.cellW);
  for (let k = ci - 1; k <= ci + 1; k++) if (k >= 0 && k < W.n && Math.abs(along - (k + 0.5) * W.cellW) < W.half + m) return true;
  return false;
}
/** Can a partition that ends at (u, v), heading out along (du, dv), meet the outline there on
 *  storey fi without landing on a window? (Walls only on window-cell boundaries.) True when it
 *  meets another room of the building (an annex) rather than the facade. */
export function endOK(LP: LocalPoly, M: WinModel, fi: number, u: number, v: number, du: number, dv: number, clear = 0.1) {
  if (LP.inside(u + du * 0.3, v + dv * 0.3)) return true;
  const h = LP.hit(u - du * 0.5, v - dv * 0.5, du, dv);
  if (!h || h.t > 1.5) return true;
  const a = LP.p[h.i], b = LP.p[(h.i + 1) % LP.p.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const W = wallWindows(len, fi, M);
  return !W || !onWindow(W, h.s * len, 0.06 + clear);
}

// ---------------- stairs ----------------
export interface StairSpec { n: number; rise: number; going: number; width: number; run: number }
/** Domestic stairs (IRC R311.7): riser ≤ 0.196 m, going 0.26 m; an office core stair (IBC 1011.5.2):
 *  riser ≤ 0.178 m, tread 0.28 m. */
export function stairSpec(fH: number, office: boolean): StairSpec {
  const rMax = office ? 0.178 : 0.196, going = office ? 0.28 : 0.26;
  const n = Math.max(2, Math.ceil(fH / rMax - 1e-9));
  return { n, rise: fH / n, going, width: office ? 1.1 : 0.95, run: (n - 1) * going };
}
/** A dogleg's footprint along its axis (both flights over the same run, then the half landing). */
export const doglegLen = (sp: StairSpec) => (Math.ceil(sp.n / 2) - 1) * sp.going + Math.max(1.0, sp.width);
export const doglegWide = (sp: StairSpec) => 2 * sp.width + 0.1;

interface Ctx {
  P: Plan;
  LP: LocalPoly;
  M: WinModel;
  rng: Rng;
  fH: number;
}
// (along a, cross c) on an axis → a local rect
const R = (ax: 0 | 1, a0: number, a1: number, c0: number, c1: number): Rect =>
  ax === 0 ? { u0: Math.min(a0, a1), u1: Math.max(a0, a1), v0: Math.min(c0, c1), v1: Math.max(c0, c1) } : { u0: Math.min(c0, c1), u1: Math.max(c0, c1), v0: Math.min(a0, a1), v1: Math.max(a0, a1) };
const pushWall = (cw: number[], ax: 0 | 1, a0: number, a1: number, c: number, y0: number, y1: number) => {
  if (ax === 0) cw.push(a0, c, a1, c, y0, y1);
  else cw.push(c, a0, c, a1, y0, y1);
};
const crossWall = (cw: number[], ax: 0 | 1, a: number, c0: number, c1: number, y0: number, y1: number) => {
  if (ax === 0) cw.push(a, c0, a, c1, y0, y1);
  else cw.push(c0, a, c1, a, y0, y1);
};

/** A straight flight from storey k: along axis ax, bottom at `a0`, rising in direction dir, across
 *  [c0, c1]; `open` = the side toward the room. The stairwell is the flight's footprint. */
function straight(C: Ctx, sp: StairSpec, ax: 0 | 1, a0: number, dir: 1 | -1, c0: number, c1: number, k: number, open: number) {
  const P = C.P, fH = C.fH;
  const a1 = a0 + dir * sp.run;
  const r = R(ax, a0, a1, c0, c1);
  P.flights.push({ ...r, bottomU: a0, topU: a1, level: k, ...(ax ? { axis: 1 as const } : {}), steps: sp.n, open });
  P.holes.push({ ...r, level: k + 1 });
  const base = k * fH, up = base + fH;
  // sides (banister + wall): block both the hall below and the landing above
  pushWall(P.cw, ax, a0, a1, c0, base - 0.4, up + 0.6);
  pushWall(P.cw, ax, a0, a1, c1, base - 0.4, up + 0.6);
  // bottom end: open below, a rail upstairs (don't fall into the stairwell)
  crossWall(P.cw, ax, a0, c0, c1, up - 0.4, up + 0.6);
  // top end: open upstairs, solid below (you can't walk under the high end)
  crossWall(P.cw, ax, a1, c0, c1, base - 0.4, base + 1.3);
}

/** A dogleg from storey k in `core` (along axis ax, entered at `front`, the far end `front + dir·len`):
 *  flight a up lane `laneA` (0: the low cross half) to the half landing at the far end, flight b
 *  back up the other lane, arriving at the front. `bottom`: no dogleg below this one (the space
 *  under flight b's top is walled off); `top`: none above (a rail across lane a's opening). */
function dogleg(C: Ctx, sp: StairSpec, ax: 0 | 1, front: number, dir: 1 | -1, c0: number, k: number, laneA: 0 | 1, bottom: boolean, top: boolean) {
  const P = C.P, fH = C.fH;
  const lw = sp.width, na = Math.ceil(sp.n / 2), nb = sp.n - na;
  const runA = (na - 1) * sp.going, len = doglegLen(sp), c1 = c0 + doglegWide(sp);
  const la: [number, number] = laneA === 0 ? [c0, c0 + lw] : [c1 - lw, c1];
  const lb: [number, number] = laneA === 0 ? [c1 - lw, c1] : [c0, c0 + lw];
  const mid = front + dir * runA, far = front + dir * len;
  const hA = na / sp.n;
  P.flights.push({ ...R(ax, front, mid, la[0], la[1]), bottomU: front, topU: mid, level: k, ...(ax ? { axis: 1 as const } : {}), lo: 0, hi: hA, steps: na, open: 0 });
  P.flights.push({ ...R(ax, front, mid, lb[0], lb[1]), bottomU: mid, topU: front, level: k, ...(ax ? { axis: 1 as const } : {}), lo: hA, hi: 1, steps: nb, open: 0 });
  P.landings.push({ ...R(ax, mid, far, c0, c1), level: k, y: hA });
  P.holes.push({ ...R(ax, front, far, c0, c1), level: k + 1 });
  const base = k * fH, up = base + fH;
  pushWall(P.cw, ax, front, far, c0, base - 0.4, up + 0.6);
  pushWall(P.cw, ax, front, far, c1, base - 0.4, up + 0.6);
  crossWall(P.cw, ax, far, c0, c1, base - 0.4, up + 0.6);
  pushWall(P.cw, ax, front, mid, (c0 + c1) / 2, base - 0.4, up + 0.6); // the spine wall between the flights
  if (bottom) crossWall(P.cw, ax, front, lb[0], lb[1], base - 0.4, base + 1.3);
  if (top) crossWall(P.cw, ax, front, la[0], la[1], up - 0.4, up + 0.6);
}

// ---------------- the plate: a rectangle the rooms fill, and the rest ----------------
function plateOf(LP: LocalPoly, L: number, W: number, ud: number, vd: number): { main: Rect; annex: Rect[] } {
  const area = Math.abs(polyArea(LP.p));
  const full = { u0: -L / 2, u1: L / 2, v0: -W / 2, v1: W / 2 };
  if (area >= 0.985 * L * W) return { main: full, annex: [] };
  const g = Math.max(0.25, Math.min(1, Math.max(L, W) / 90));
  const nu = Math.max(1, Math.round(L / g)), nv = Math.max(1, Math.round(W / g));
  const gu = L / nu, gv = W / nv;
  const inside = new Uint8Array(nu * nv);
  for (let i = 0; i < nu; i++) {
    const u = -L / 2 + (i + 0.5) * gu;
    for (const [a, b] of LP.spans(u)) {
      const j0 = Math.max(0, Math.ceil((a + W / 2) / gv - 0.5)), j1 = Math.min(nv - 1, Math.floor((b + W / 2) / gv - 0.5));
      for (let j = j0; j <= j1; j++) inside[i * nv + j] = 1;
    }
  }
  const cellRect = (i0: number, i1: number, j0: number, j1: number): Rect => ({ u0: -L / 2 + i0 * gu, u1: -L / 2 + (i1 + 1) * gu, v0: -W / 2 + j0 * gv, v1: -W / 2 + (j1 + 1) * gv });
  // the largest all-inside rectangle (histogram method); with `need`, one containing that cell
  const h = new Int32Array(nv);
  const maxRect = (need: [number, number] | null) => {
    h.fill(0);
    let best: [number, number, number, number] | null = null, ba = 0;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) h[j] = inside[i * nv + j] ? h[j] + 1 : 0;
      if (need) {
        if (i < need[0]) continue;
        // grow round the needed column, always toward the taller neighbour
        let l = need[1], r = need[1], t = h[need[1]];
        const minH = i - need[0] + 1;
        while (t >= minH) {
          const a = t * (r - l + 1);
          if (a > ba) (ba = a), (best = [i - t + 1, i, l, r]);
          const hl = l > 0 ? h[l - 1] : -1, hr = r < nv - 1 ? h[r + 1] : -1;
          if (hl < 0 && hr < 0) break;
          if (hl >= hr) { l--; t = Math.min(t, hl); } else { r++; t = Math.min(t, hr); }
        }
      } else {
        const st: number[] = [];
        for (let j = 0; j <= nv; j++) {
          const hj = j < nv ? h[j] : 0;
          while (st.length && h[st[st.length - 1]] >= hj) {
            const top = st.pop()!, ht = h[top];
            const l = st.length ? st[st.length - 1] + 1 : 0, a = ht * (j - l);
            if (ht > 0 && a > ba) (ba = a), (best = [i - ht + 1, i, l, j - 1]);
          }
          st.push(j);
        }
      }
    }
    return best;
  };
  // push each edge out to the true outline
  const refine = (r: Rect) => {
    const out = { ...r };
    const grow = (key: 'u0' | 'u1' | 'v0' | 'v1', sgn: number, step: number) => {
      let lo = 0, hi = step;
      const test = (e: number) => { const q = { ...out }; q[key] += sgn * e; return LP.rectIn(q.u0, q.u1, q.v0, q.v1, 0.005); };
      if (!test(0)) return;
      if (test(hi)) lo = hi;
      else for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; if (test(m)) lo = m; else hi = m; }
      out[key] += sgn * lo;
    };
    grow('u0', -1, gu); grow('u1', 1, gu); grow('v0', -1, gv); grow('v1', 1, gv);
    return out;
  };
  const di = Math.max(0, Math.min(nu - 1, Math.floor((ud + 0.4 + L / 2) / gu))), dj = Math.max(0, Math.min(nv - 1, Math.floor((vd + W / 2) / gv)));
  const any = maxRect(null);
  if (!any) return { main: full, annex: [] };
  const byDoor = inside[di * nv + dj] ? maxRect([di, dj]) : null;
  const areaOf = (q: [number, number, number, number]) => (q[1] - q[0] + 1) * (q[3] - q[2] + 1);
  const pick = byDoor && areaOf(byDoor) >= 0.55 * areaOf(any) ? byDoor : any;
  const main = refine(cellRect(pick[0], pick[1], pick[2], pick[3]));
  for (let i = pick[0]; i <= pick[1]; i++) for (let j = pick[2]; j <= pick[3]; j++) inside[i * nv + j] = 0;
  const annex: Rect[] = [];
  for (let t = 0; t < 4; t++) {
    const q = maxRect(null);
    if (!q) break;
    const r = cellRect(q[0], q[1], q[2], q[3]);
    if (rectArea(r) < 3 || Math.min(r.u1 - r.u0, r.v1 - r.v0) < 1.2) break;
    for (let i = q[0]; i <= q[1]; i++) for (let j = q[2]; j <= q[3]; j++) inside[i * nv + j] = 0;
    const a = refine(r);
    // (an annex never overlaps the main rectangle)
    if (a.u0 < main.u1 && a.u1 > main.u0 && a.v0 < main.v1 && a.v1 > main.v0) {
      if (r.u0 >= main.u1 - 1e-6) a.u0 = Math.max(a.u0, main.u1);
      else if (r.u1 <= main.u0 + 1e-6) a.u1 = Math.min(a.u1, main.u0);
      else if (r.v0 >= main.v1 - 1e-6) a.v0 = Math.max(a.v0, main.v1);
      else a.v1 = Math.min(a.v1, main.v0);
    }
    if (rectArea(a) >= 3) annex.push(a);
  }
  return { main, annex };
}

// ---------------- families ----------------
/** A house: a hall runs in from the front door with the stair up one side of it (a straight flight
 *  when the house is deep enough, else a dogleg); rooms either side. */
function planHouse(C: Ctx): boolean {
  const P = C.P, M = P.main, rng = C.rng;
  let n = P.levels;
  const sp = stairSpec(C.fH, false);
  const depth = M.u1 - M.u0;
  const lane = sp.width + 0.1; // a flight and its clearance to the walls
  const dog = doglegWide(sp) + 0.1;
  const straightFits = n === 2 && depth >= 0.28 + 1.2 + sp.run + 0.95;
  const dogFits = n > 1 && depth >= 0.28 + 1.2 + doglegLen(sp) + 0.2;
  if (n > 1 && !straightFits && !dogFits) n = P.levels = 1;
  const kind: 'straight' | 'dogleg' | null = n === 1 ? null : straightFits ? 'straight' : 'dogleg';
  const hw = P.door.w / 2 + 0.12;
  const need0 = Math.max(M.v0, P.vd - hw), need1 = Math.min(M.v1, P.vd + hw);
  const okAt = new Map<number, boolean>();
  const ok = (v: number) => {
    const key = Math.round(v * 20);
    let r = okAt.get(key);
    if (r === undefined) {
      r = true;
      for (let k = 0; k < n && r; k++) r = endOK(C.LP, C.M, k, M.u0 + 0.05, v, -1, 0) && endOK(C.LP, C.M, k, M.u1 - 0.05, v, 1, 0);
      okAt.set(key, r);
    }
    return r;
  };
  const swMin = kind === 'straight' ? lane + 0.95 : kind === 'dogleg' ? dog + 0.95 : 1.1;
  const swMax = swMin + 2.2;
  const sidePen = (w: number) => (w <= 1e-6 ? 0.35 : w < 2.2 ? 1.2 : w < 2.75 ? 0.8 : w > 6.5 ? (w - 6.5) * 0.25 : 0);
  // which side of a hall [a, b] the stair takes (below): the side with less to reach, against the
  // outside wall when the hall has taken that side — on a tie, the side away from the front door,
  // so the door opens onto the passage beside the stair rather than straight onto its foot
  const lw = kind === 'straight' ? lane : dog;
  const onPassage = (a: number, b: number, low: boolean) => (low ? P.vd >= a + lw + 0.35 && P.vd <= b - 0.35 : P.vd >= a + 0.35 && P.vd <= b - lw - 0.35);
  const lowOf = (a: number, b: number): boolean | null => {
    const wA = a - M.v0, wB = M.v1 - b;
    if (wA <= 1e-6) return true;
    if (wB <= 1e-6) return false;
    if (Math.abs(wA - wB) >= 0.3) return wA < wB;
    const lo = onPassage(a, b, true), hi = onPassage(a, b, false);
    return lo === hi ? null : lo;
  };
  let best: { a: number; b: number; s: number } | null = null;
  const as: number[] = [M.v0], bs: number[] = [M.v1];
  for (let v = M.v0 + 1.0; v <= need0 + 1e-6; v += 0.1) if (ok(v)) as.push(v);
  for (let v = M.v1 - 1.0; v >= need1 - 1e-6; v -= 0.1) if (ok(v)) bs.push(v);
  for (const a of as)
    for (const b of bs) {
      const w = b - a, wA = a - M.v0, wB = M.v1 - b;
      if (w < swMin - 1e-6) continue;
      if (w > swMax + (wA <= 1e-6 ? 2.3 : 0) + (wB <= 1e-6 ? 2.3 : 0)) continue;
      if ((wA > 1e-6 && wA < 1.0) || (wB > 1e-6 && wB < 1.0)) continue;
      let s = (w - swMin) * 0.6 + Math.max(0, w - swMin - 1.2) * 1.5 + sidePen(wA) + sidePen(wB) + (wA < 2.75 && wB < 2.75 ? 2.5 : 0) + rng.float() * 0.3;
      if (w > swMax) s += 0.8; // a hall grown over a sliver of side
      if (kind) { const lo = lowOf(a, b); if (lo === null ? !onPassage(a, b, true) && !onPassage(a, b, false) : !onPassage(a, b, lo)) s += 1.5; }
      if (!best || s < best.s) best = { a, b, s };
    }
  if (!best) {
    // nowhere between the windows: a hall of the minimum width round the door
    const a = Math.max(M.v0, Math.min(need0, P.vd - swMin / 2)), b = Math.min(M.v1, Math.max(need1, a + swMin));
    best = { a: b - a < swMin ? Math.max(M.v0, b - swMin) : a, b, s: 0 };
  }
  const strip = { u0: M.u0, u1: M.u1, v0: best.a, v1: best.b };
  P.strip = strip;
  if (!kind) return true;
  // the stair goes up the side of the hall with less to reach (see lowOf), so the bigger rooms
  // open straight off the passage
  const wA = strip.v0 - M.v0, wB = M.v1 - strip.v1;
  const low = lowOf(strip.v0, strip.v1) ?? rng.float() < 0.5;
  const inset = (edge: number, isExt: boolean) => (isExt ? 0.14 : 0.06) + 0.03 + (edge ? 0 : 0);
  const e0 = strip.v0 + inset(0, wA <= 1e-6), e1 = strip.v1 - inset(0, wB <= 1e-6);
  const roomsOnLane = low ? wA >= 2.2 : wB >= 2.2;
  const vest = roomsOnLane ? 1.5 : 1.2;
  const front = M.u0 + 0.14 + vest;
  if (kind === 'straight') {
    const c0 = low ? e0 : e1 - sp.width, c1 = c0 + sp.width;
    // (the vestibule shrinks before the stair won't fit)
    const f = Math.min(front, M.u1 - 0.14 - 0.95 - sp.run);
    straight(C, sp, 0, f, 1, c0, c1, 0, low ? 1 : -1);
    P.lane = { u0: f, u1: f + sp.run, v0: c0, v1: c1 };
  } else {
    const wide = doglegWide(sp), c0 = low ? e0 : e1 - wide;
    const f = Math.min(front, M.u1 - 0.14 - 0.2 - doglegLen(sp));
    for (let k = 0; k + 1 < n; k++) dogleg(C, sp, 0, f, 1, c0, k, low ? 1 : 0, k === 0, k + 2 === n);
    P.lane = { u0: f, u1: f + doglegLen(sp), v0: c0, v1: c0 + wide };
  }
  return true;
}

/** Search positions along a line for a wall: the one nearest `want` within [lo, hi] whose ends
 *  (at d0 heading dir0, at d1 heading dir1 on the other axis) miss the windows on every storey. */
function wallAt(C: Ctx, ax: 0 | 1, want: number, lo: number, hi: number, ends: [number, -1 | 1][], levels: number[], step = 0.05): number | null {
  const test = (a: number) => {
    for (const k of levels)
      for (const [d, dir] of ends) {
        const [u, v, du, dv] = ax === 0 ? [a, d, 0, dir] : [d, a, dir, 0];
        if (!endOK(C.LP, C.M, k, u, v, du, dv)) return false;
      }
    return true;
  };
  if (lo > hi) return null;
  want = Math.max(lo, Math.min(hi, want));
  for (let o = 0; o <= hi - lo + 1e-6; o += step) {
    if (want + o <= hi + 1e-6 && test(want + o)) return want + o;
    if (o > 0 && want - o >= lo - 1e-6 && test(want - o)) return want - o;
  }
  return null;
}

/** Flats (and the storeys over a shop): a corridor by the plate's depth — none in a narrow
 *  walk-up, single-loaded to 14 m, double-loaded on the centreline to 24 m, a ring round a core
 *  beyond — with bands of flats off it, the lobby at the front door and dogleg stair cores. */
function planFlats(C: Ctx, lobby: boolean): boolean {
  const P = C.P, M = P.main;
  const Lm = M.u1 - M.u0, Wm = M.v1 - M.v0;
  const ax: 0 | 1 = Wm >= Lm ? 1 : 0; // the long axis: flats line up along it
  const oax: 0 | 1 = ax ? 0 : 1;
  const A0 = ax ? M.v0 : M.u0, A1 = ax ? M.v1 : M.u1, D0 = ax ? M.u0 : M.v0, D1 = ax ? M.u1 : M.v1;
  const D = D1 - D0, len = A1 - A0;
  const sp = stairSpec(C.fH, false);
  const wide = doglegWide(sp), clen = doglegLen(sp), cwide = wide + 0.25;
  const levels = Array.from({ length: P.levels }, (_, k) => k);
  // over a shop the corridor starts a storey up (the storefront's windows don't count: the stair
  // room below keeps off the end walls, so no ground-storey wall takes the corridor's line)
  const upper = lobby ? levels : levels.slice(1);
  const da = ax ? P.vd : P.ud, dd = ax ? P.ud : P.vd; // the door (along, depth)
  const hw = P.door.w / 2 + 0.15;
  P.bands = [];
  P.spine = [];
  P.cores = [];
  // a wall across band B at `want` (on its axis), meeting the facade at the band's far edge
  const slotWall = (B: Band, want: number, lo: number, hi: number) => {
    const bd0 = B.ax ? B.r.u0 : B.r.v0, bd1 = B.ax ? B.r.u1 : B.r.v1;
    const end: [number, -1 | 1] = B.side < 0 ? [bd1 - 0.05, 1] : [bd0 + 0.05, -1];
    return wallAt(C, B.ax, want, lo, hi, [end], levels, 0.05);
  };
  // a corridor's long wall at depth `want`, meeting both end walls
  const corrWall = (want: number, lo: number, hi: number) => wallAt(C, oax, want, lo, hi, [[A0 + 0.05, -1], [A1 - 0.05, 1]], upper, 0.05);
  const band = (a0: number, a1: number, d0: number, d1: number, side: -1 | 1): Band => ({ r: R(ax, a0, a1, d0, d1), ax, side });
  // the dogleg in a core room, against the room's facade end, entered from the corridor side
  const coreIn = (room: Rect, bax: 0 | 1, side: -1 | 1) => {
    const bd0 = bax ? room.u0 : room.v0, bd1 = bax ? room.u1 : room.v1; // depth range across the band
    const s0 = bax ? room.v0 : room.u0, s1 = bax ? room.v1 : room.u1;
    const farEnd = side < 0 ? bd1 - 0.14 : bd0 + 0.14;
    const dir: 1 | -1 = side < 0 ? 1 : -1;
    const front = farEnd - dir * clen;
    const c0 = (s0 + s1) / 2 - wide / 2;
    const dax: 0 | 1 = bax ? 0 : 1;
    P.cores!.push({ room, stair: R(dax, front, farEnd, c0, c0 + wide) });
    for (let k = 0; k + 1 < P.levels; k++) dogleg(C, sp, dax, front, dir, c0, k, 0, k === 0, k + 2 === P.levels);
  };
  const fam = lobby && ax === 1 && D <= 9.1 && len <= 26 ? 'walkup' : D <= 14 ? 'single' : D <= 24 || len < 30 ? 'double' : 'ring';
  if (fam === 'walkup') {
    // one slot across the whole depth at the front door: the lobby and landings in front, the
    // dogleg against the back wall; a flat either side, its door on the landing
    const front: Band = { r: R(1, A0, A1, D0, D1), ax: 1, side: 1 };
    const back: Band = { r: R(1, A0, A1, D0, D1), ax: 1, side: -1 };
    const ok2 = (a: number) => slotWall(front, a, a, a) !== null && slotWall(back, a, a, a) !== null;
    let a0: number | null = null, a1: number | null = null;
    for (let x = da - hw - 0.05; x >= A0 + 2.4 && a0 === null; x -= 0.05) if (ok2(x)) a0 = x;
    if (a0 !== null) for (let x = Math.max(a0 + cwide + 0.2, da + hw + 0.05); x <= Math.min(a0 + cwide + 1.6, A1 - 2.4) && a1 === null; x += 0.05) if (ok2(x)) a1 = x;
    if (a0 !== null && a1 !== null) {
      const room = R(1, a0, a1, D0, D1);
      if (P.levels > 1) coreIn(room, 1, -1);
      const st = P.cores![0]?.stair;
      P.lobby = { ...room, u1: st ? st.u0 : room.u1 };
      if (!st) P.cores!.length = 0;
      P.bands.push({ r: R(1, A0, a0, D0, D1), ax: 0, side: 1, one: true }, { r: R(1, a1, A1, D0, D1), ax: 0, side: -1, one: true });
      if (!st) P.cores = [];
      return true;
    }
  }
  const cw0 = 1.5;
  if (fam === 'walkup' || fam === 'single' || D < 2 * 5.5 + cw0) {
    // the corridor along the back (for a door on an end wall, along the long side it's nearer)
    const back = ax === 1 ? 1 : dd > (D0 + D1) / 2 ? -1 : 1;
    const c = back > 0 ? corrWall(D1 - cw0, D1 - 1.8, D1 - 1.25) : corrWall(D0 + cw0, D0 + 1.25, D0 + 1.8);
    if (c === null) return false;
    P.spine.push(back > 0 ? R(ax, A0, A1, c, D1) : R(ax, A0, A1, D0, c));
    P.bands.push(back > 0 ? band(A0, A1, D0, c, 1) : band(A0, A1, c, D1, -1));
  } else if (fam === 'double') {
    const flats = (2 * len) / 7;
    const w = flats > 16 ? 1.8 : cw0;
    let mid = (D0 + D1) / 2;
    // (a door on an end wall opens straight into the corridor when it's near the middle)
    if (ax === 0 && Math.abs(dd - mid) < 2.2) mid = Math.max(dd - w / 2 + hw + 0.05, Math.min(dd + w / 2 - hw - 0.05, mid));
    let ok = false;
    for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0, 1.4, -1.4, 1.8, -1.8, 2.2, -2.2]) {
      const a = corrWall(mid - w / 2 + off, mid - w / 2 + off, mid - w / 2 + off);
      const b = a === null ? null : corrWall(a + w, a + w - 0.05, a + w + 0.45);
      if (a === null || b === null || a - D0 < 5 || D1 - b < 5) continue;
      P.spine.push(R(ax, A0, A1, a, b));
      P.bands.push(band(A0, A1, D0, a, 1), band(A0, A1, b, D1, -1));
      ok = true;
      break;
    }
    if (!ok) return false;
  } else {
    // a ring round a core: flats 7–9 m deep all round, the corridor inside them
    const ud = Math.min(9, Math.max(7, D * 0.3)), cw = 1.8;
    const a0 = A0 + ud, a1 = A1 - ud, d0 = D0 + ud, d1 = D1 - ud;
    P.spine.push(R(ax, a0, a1, d0, d0 + cw), R(ax, a0, a1, d1 - cw, d1), R(ax, a0, a0 + cw, d0 + cw, d1 - cw), R(ax, a1 - cw, a1, d0 + cw, d1 - cw));
    P.bands.push(band(A0, A1, D0, d0, 1), band(A0, A1, d1, D1, -1));
    P.bands.push({ r: R(ax, A0, a0, d0, d1), ax: oax, side: ax ? 1 : 1 }, { r: R(ax, a1, A1, d0, d1), ax: oax, side: -1 });
    // (the end bands are entered from their inner edge on the long axis)
    P.bands[2].side = 1;
    P.bands[3].side = -1;
    P.core = R(ax, a0 + cw, a1 - cw, d0 + cw, d1 - cw);
  }
  // the lobby: a slot through the band the front door opens into
  const bi = P.bands.findIndex((B) => inRect(B.r, P.ud + 0.3, P.vd));
  let near = da;
  if (lobby && bi >= 0) {
    const B = P.bands[bi];
    const s0 = B.ax ? B.r.v0 : B.r.u0, s1 = B.ax ? B.r.v1 : B.r.u1;
    const pos = B.ax === 1 ? P.vd : P.ud; // the door along the band
    const lw = 3.0;
    const l0 = pos - s0 < lw + 2 ? s0 : slotWall(B, pos - lw / 2, s0 + 2.4, pos - hw);
    const l1 = l0 === null ? null : s1 - pos < lw + 2 ? s1 : slotWall(B, Math.max(l0 + 2.6, pos + lw / 2), Math.max(l0 + 2.2, pos + hw), s1 - 2.4);
    if (l0 === null || l1 === null) return false;
    P.lobby = B.ax ? { ...B.r, v0: l0, v1: l1 } : { ...B.r, u0: l0, u1: l1 };
    near = (l0 + l1) / 2;
  } else if (lobby && !P.spine.some((r) => inRect(r, P.ud + 0.3, P.vd))) return false; // the door opens onto nothing planned
  if (P.levels < 2) return true;
  if (P.core) {
    // the ring's core: a stair room at each end, entered from the corridor across that end
    const core = P.core;
    const cs0 = ax ? core.v0 : core.u0, cs1 = ax ? core.v1 : core.u1, cd0 = ax ? core.u0 : core.v0, cd1 = ax ? core.u1 : core.v1;
    if (cs1 - cs0 < 2 * (clen + 1.4) + 1 || cd1 - cd0 < cwide) return false;
    const c0 = (cd0 + cd1) / 2 - wide / 2;
    for (const end of [-1, 1] as const) {
      const front = end < 0 ? cs0 + 1.4 : cs1 - 1.4, dir: 1 | -1 = end < 0 ? 1 : -1;
      const far = front + dir * clen;
      P.cores.push({ room: R(ax, end < 0 ? cs0 : far + 0.1, end < 0 ? far - 0.1 : cs1, cd0, cd1), stair: R(ax, front, far, c0, c0 + wide) });
      for (let k = 0; k + 1 < P.levels; k++) dogleg(C, sp, ax, front, dir, c0, k, 0, k === 0, k + 2 === P.levels);
    }
    return true;
  }
  // a core slot beside the lobby (or at a band's end), a second near the far end of a long corridor
  // (over a shop: the band farthest from the shop door, so the stair rises from the back)
  const far = (b: Band) => -Math.abs((b.r.u0 + b.r.u1) / 2 - P.ud) - Math.abs((b.r.v0 + b.r.v1) / 2 - P.vd) * 0.1;
  const order = lobby ? (bi >= 0 ? [bi, ...P.bands.map((_, i) => i).filter((i) => i !== bi)] : P.bands.map((_, i) => i)) : P.bands.map((_, i) => i).sort((x, y) => far(P.bands![x]) - far(P.bands![y]));
  const slotOf = (B: Band, t0: number): [number, number] | null => {
    const s0 = B.ax ? B.r.v0 : B.r.u0, s1 = B.ax ? B.r.v1 : B.r.u1;
    const c0 = t0 <= s0 + 0.3 ? s0 : slotWall(B, t0, Math.max(s0 + 2.4, t0 - 1.5), t0 + 1.5);
    if (c0 === null) return null;
    const c1 = c0 + cwide >= s1 - 2.4 ? s1 : slotWall(B, c0 + cwide, c0 + cwide, Math.min(s1 - 2.4, c0 + cwide + 2.2));
    if (c1 === null || c1 - c0 < cwide - 1e-6 || c1 > s1 + 1e-6) return null;
    return [c0, c1];
  };
  if (!lobby) {
    // over a shop: the stair room runs along the corridor side of a slot (a store behind it
    // upstairs), so on the shop floor its walls stay clear of the storefront glass
    const wide2 = wide + 0.3, slen = clen + 1.4;
    for (const b of order) {
      const B = P.bands[b];
      const s0 = B.ax ? B.r.v0 : B.r.u0, s1 = B.ax ? B.r.v1 : B.r.u1;
      const bd0 = B.ax ? B.r.u0 : B.r.v0, bd1 = B.ax ? B.r.u1 : B.r.v1;
      if (bd1 - bd0 < wide2 + 1.5 || s1 - s0 < slen + 5) continue;
      for (const t of [s1 - slen - 4.5, s0 + 4.5, s1 - slen - 7, s0 + 7, (s0 + s1) / 2 - slen / 2]) {
        if (t < s0 + 2.4 || t + slen > s1 - 2.4) continue;
        const c0 = wallAt(C, B.ax, t, t - 1.2, t + 1.2, [[B.side < 0 ? bd1 - 0.05 : bd0 + 0.05, B.side < 0 ? 1 : -1]], upper, 0.05);
        if (c0 === null) continue;
        const c1 = wallAt(C, B.ax, c0 + slen, c0 + slen, c0 + slen + 1.6, [[B.side < 0 ? bd1 - 0.05 : bd0 + 0.05, B.side < 0 ? 1 : -1]], upper, 0.05);
        if (c1 === null || c1 > s1 - 2.4) continue;
        const e0 = B.side < 0 ? bd0 : bd1 - wide2, e1 = e0 + wide2; // the corridor side of the band
        const room = B.ax ? { u0: e0, u1: e1, v0: c0, v1: c1 } : { u0: c0, u1: c1, v0: e0, v1: e1 };
        const slot = B.ax ? { u0: bd0, u1: bd1, v0: c0, v1: c1 } : { u0: c0, u1: c1, v0: bd0, v1: bd1 };
        const front = c0 + 1.4, cc = (e0 + e1) / 2 - wide / 2;
        P.cores.push({ room, stair: R(B.ax, front, front + clen, cc, cc + wide), slot });
        for (let k = 0; k + 1 < P.levels; k++) dogleg(C, sp, B.ax, front, 1, cc, k, 0, k === 0, k + 2 === P.levels);
        return true;
      }
    }
    return false;
  }
  for (const b of order) {
    const B = P.bands[b];
    const s0 = B.ax ? B.r.v0 : B.r.u0, s1 = B.ax ? B.r.v1 : B.r.u1;
    const bd = B.ax ? B.r.u1 - B.r.u0 : B.r.v1 - B.r.v0;
    if (bd < clen + 1.6 || s1 - s0 < cwide) continue;
    const lob = P.lobby && b === bi ? (B.ax ? [P.lobby.v0, P.lobby.v1] : [P.lobby.u0, P.lobby.u1]) : null;
    const tries = lob ? [lob[1], lob[0] - cwide] : lobby ? [near - cwide / 2, s0, s1 - cwide] : [s1 - cwide - 4.5, s0 + 4.5, s1 - cwide - 7, s0 + 7];
    let got: [number, number] | null = null;
    for (const t of tries) {
      if (t < s0 - 1e-6 || t + cwide > s1 + 1e-6) continue;
      const q = slotOf(B, t);
      if (q && (!lob || q[1] <= lob[0] + 1e-6 || q[0] >= lob[1] - 1e-6)) { got = q; break; }
    }
    if (!got) continue;
    const room = B.ax ? { ...B.r, v0: got[0], v1: got[1] } : { ...B.r, u0: got[0], u1: got[1] };
    coreIn(room, B.ax, B.side);
    if (len > 36) {
      const farT = Math.abs(s1 - got[1]) > Math.abs(got[0] - s0) ? s1 - cwide : s0;
      const q = slotOf(B, farT);
      if (q && (q[1] <= got[0] - 8 || q[0] >= got[1] + 8)) coreIn(B.ax ? { ...B.r, v0: q[0], v1: q[1] } : { ...B.r, u0: q[0], u1: q[1] }, B.ax, B.side);
    }
    return true;
  }
  return false;
}
const inRect = (r: Rect, u: number, v: number) => u >= r.u0 - 1e-6 && u <= r.u1 + 1e-6 && v >= r.v0 - 1e-6 && v <= r.v1 + 1e-6;

/** An office: a service core (a central one inset by the 12 m lease depth on a deep plate, a spine
 *  down the middle of a slim one) of 15–30% of the floor, open plan round it to the glass; the
 *  core's stair room at its end away from the front door. */
function planOffice(C: Ctx): boolean {
  const P = C.P, M = P.main;
  const Lm = M.u1 - M.u0, Wm = M.v1 - M.v0, area = Lm * Wm;
  const D = Math.min(Lm, Wm);
  if (area < 160 || D < 9) return false;
  const sp = stairSpec(C.fH, true);
  const slen = doglegLen(sp) + 1.8, swide = doglegWide(sp) + 0.3; // (the stair room: a 1.7 m landing band across the core, then the flights)
  const cu = (M.u0 + M.u1) / 2, cv = (M.v0 + M.v1) / 2;
  const fitCore = (lu: number, lv: number): Rect => ({ u0: cu - lu / 2, u1: cu + lu / 2, v0: cv - lv / 2, v1: cv + lv / 2 });
  let core: Rect;
  if (D > 24) {
    // inset by the 12 m lease depth along the plate; across it, as deep as ~19% of the floor needs
    const long = Math.max(Lm, Wm);
    const cl = Math.max(slen + 3, long - 24);
    const cd = Math.max(swide + 1, Math.min(D - 14, (0.19 * area) / cl));
    const frac0 = (cl * cd) / area;
    const k = frac0 > 0.29 ? Math.sqrt(0.26 / frac0) : 1;
    core = Lm >= Wm ? fitCore(cl * k, cd * k) : fitCore(cd * k, cl * k);
  } else {
    const cd = Math.max(swide + 0.6, Math.min(8, D * 0.32));
    const long = Math.max(Lm, Wm);
    const cl = Math.max(slen + 3, Math.min(long - 12, (0.2 * area) / cd));
    core = Lm >= Wm ? fitCore(cl, cd) : fitCore(cd, cl);
  }
  const frac = rectArea(core) / area;
  if (frac < 0.15 || frac > 0.3 || core.u0 < M.u0 + 3.5 || core.v0 < M.v0 + 3.5) return false;
  P.core = core;
  P.cores = [];
  if (P.levels > 1) {
    const along: 0 | 1 = core.u1 - core.u0 >= core.v1 - core.v0 ? 0 : 1;
    const A0 = along ? core.v0 : core.u0, A1 = along ? core.v1 : core.u1;
    const c0 = along ? core.u0 : core.v0, c1 = along ? core.u1 : core.v1;
    const doorA = along ? P.vd : P.ud;
    const far: 1 | -1 = Math.abs(A1 - doorA) >= Math.abs(A0 - doorA) ? 1 : -1;
    const room = far > 0 ? R(along, A1 - slen, A1, c0, c1) : R(along, A0, A0 + slen, c0, c1);
    const farEnd = far > 0 ? A1 - 0.1 : A0 + 0.1, dir: 1 | -1 = far > 0 ? 1 : -1;
    const front = farEnd - dir * doglegLen(sp);
    const wide = doglegWide(sp), cc = (c0 + c1) / 2 - wide / 2;
    P.cores.push({ room, stair: R(along, front, farEnd, cc, cc + wide) });
    for (let k = 0; k + 1 < P.levels; k++) dogleg(C, sp, along, front, dir, cc, k, 0, k === 0, k + 2 === P.levels);
  }
  return true;
}

/** Legacy stairs for outlines the room planner doesn't take (and a church): a straight run hugging a
 *  long wall with a landing at each end, clear of the front door; storeys alternate two slots. */
function planOpen(C: Ctx) {
  const P = C.P, LP = C.LP, L = P.L, rng = C.rng;
  let levels = P.levels;
  const sp = stairSpec(C.fH, false);
  const run = sp.run, sw = sp.width;
  type SlotC = { u0: number; u1: number; v0: number; v1: number; bottomU: number; topU: number; score: number; open: number };
  const cands: SlotC[] = [];
  if (levels > 1) {
    for (let a = -L / 2 + 0.25; a + run <= L / 2 - 0.25; a += 0.3) {
      for (const [lo, hi] of LP.spans(a + run / 2)) {
        if (hi - lo < 2.6) continue;
        for (const side of [1, -1]) {
          const s = LP.span(a - 1.0, a + run + 1.0, (lo + hi) / 2);
          if (!s || s[1] - s[0] < 2.4) continue;
          const sv0 = side > 0 ? s[1] - 0.18 - sw : s[0] + 0.18, sv1 = sv0 + sw;
          if (!LP.rectIn(a - 1.0, a + run + 1.0, sv0, sv1, 0.02)) continue;
          if (a - 1.3 < P.ud + 1.2 && a + run + 1.3 > P.ud - 1.2 && sv0 - 0.5 < P.vd + 1.4 && sv1 + 0.5 > P.vd - 1.4) continue;
          for (const dir of [1, -1]) {
            const bottomU = dir > 0 ? a : a + run;
            const land = bottomU - dir * 0.6;
            const score = Math.abs(Math.hypot(land - P.ud, (sv0 + sv1) / 2 - P.vd) - 4) * 0.25 + rng.float() * 0.8;
            cands.push({ u0: a, u1: a + run, v0: sv0, v1: sv1, bottomU, topU: dir > 0 ? a + run : a, score, open: side > 0 ? -1 : 1 });
          }
        }
      }
    }
    cands.sort((x, y) => x.score - y.score);
  }
  const A = cands[0] ?? null;
  const B = A ? cands.find((c) => c.u0 > A.u1 + 0.8 || c.u1 < A.u0 - 0.8 || c.v0 > A.v1 + 0.8 || c.v1 < A.v0 - 0.8) ?? null : null;
  if (!A) levels = 1;
  else if (!B) levels = Math.min(levels, 2);
  P.levels = levels;
  for (let k = 0; k + 1 < levels; k++) {
    const s = (k % 2 ? B : A)!;
    straight(C, sp, 0, s.bottomU, s.topU > s.bottomU ? 1 : -1, s.v0, s.v1, k, s.open);
  }
}

export function planInterior(fpKey: string, fp: Footprint, door: Door, seed: number): Plan {
  const ring = fp.ring;
  // the frame: the longest wall's direction, turned so +u points into the building from the door
  let bi = 0, bl = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l > bl) (bl = l), (bi = i);
  }
  const p0 = ring[bi], q0 = ring[(bi + 1) % ring.length];
  const ex = (q0[0] - p0[0]) / bl, ez = (q0[1] - p0[1]) / bl;
  const inx = -door.nx, inz = -door.nz;
  let ux = ex, uz = ez, bd = -Infinity;
  for (const [cx0, cz0] of [[ex, ez], [-ex, -ez], [-ez, ex], [ez, -ex]]) {
    const d = cx0 * inx + cz0 * inz;
    if (d > bd + 1e-9) (bd = d), (ux = cx0), (uz = cz0);
  }
  const vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const r of ring) {
    const u = (r[0] - p0[0]) * ux + (r[1] - p0[1]) * uz, v = (r[0] - p0[0]) * vx + (r[1] - p0[1]) * vz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const cx = p0[0] + ux * um + vx * vm, cz = p0[1] + uz * um + vz * vm;
  const L = u1 - u0, W = v1 - v0;
  const toL = (x: number, z: number): P2 => [(x - cx) * ux + (z - cz) * uz, (x - cx) * vx + (z - cz) * vz];
  const loc = ring.map(([x, z]) => toL(x, z));
  const LP = new LocalPoly(loc);
  const kindS = fp.kind;
  const floorH = floorHeight(kindS);
  const floor0 = fp.floor0;
  const topY = fp.top;
  const n = kindS === 'church' ? 1 : Math.max(1, Math.floor((topY - floor0 + 0.2) / floorH));
  // walk-up floors only: a tower's upper storeys are behind the lift doors (Slice 3) — and no more
  // than ~12,000 m² of floor in all (a vast plate builds fewer storeys: the vertex budget)
  const levels = Math.min(4, n, Math.max(1, Math.floor(12000 / Math.max(1, Math.abs(polyArea(loc))))));
  const [ud, vd] = toL(door.wx, door.wz);
  const rng = makeRng(seed ^ 0x51ed);
  const kind = KIND[kindS as keyof typeof KIND] ?? 0;
  const { main, annex } = plateOf(LP, L, W, ud, vd);
  const use = kindS === 'commercial' ? useOf(fp.name, fp.use) : 'unknown';
  const P: Plan = {
    fp: fpKey, door, cx, cz, ux, uz, vx, vz, L, W, loc, floor0, floorH, levels, ceilTop: 0, flights: [], ud, vd,
    arch: 'open', up: 'open', n, seed: seed >>> 0, kind, main, annex, holes: [], landings: [], cw: [],
  };
  const C: Ctx = { P, LP, M: { kind, eave: fp.eave, fo: fp.floor0 - fp.base }, rng, fH: floorH };
  // how much of the outline the rectangles cover; a ragged one keeps the open plan
  const cover = (rectArea(main) + annex.reduce((s, a) => s + rectArea(a), 0)) / Math.max(1, Math.abs(polyArea(loc)));
  const doorIn = Math.abs(ud - main.u0) < 0.6 && vd > main.v0 + 0.4 && vd < main.v1 - 0.4;
  const roomy = cover > 0.72 && ring.length <= 40 && doorIn;
  const reset = () => { P.flights.length = 0; P.holes.length = 0; P.landings.length = 0; P.cw.length = 0; P.levels = levels; P.cores = undefined; P.core = undefined; P.bands = undefined; P.spine = undefined; P.lobby = undefined; };
  if (kindS === 'church') P.arch = P.up = 'church';
  else if (roomy && (kindS === 'house' || kindS === 'shed')) {
    P.arch = P.up = 'house';
    planHouse(C);
  } else if (roomy && kindS === 'large') {
    P.arch = P.up = 'flats';
    if (!planFlats(C, true)) { reset(); P.arch = P.up = 'open'; }
  } else if (roomy && kindS === 'commercial') {
    P.arch = use === 'office' || use === 'civic' ? 'office' : use === 'cafe' || use === 'bar' || use === 'restaurant' ? 'food' : 'shop';
    if (P.arch === 'office') {
      P.up = 'office';
      if (!planOffice(C)) { reset(); P.arch = P.up = 'open'; }
    } else if (levels > 1) {
      // the storeys over a shop or a café: flats up a stair from the back of the shop, else offices
      P.up = 'flats';
      if (!planFlats(C, false)) {
        reset();
        P.up = 'office';
        if (!planOffice(C)) { reset(); P.up = 'open'; }
      }
    } else P.up = P.arch;
  }
  // an outline the room planner doesn't take (or storeys it found no stair for): the open plan,
  // with a straight stair along a wall
  if (P.arch === 'open' || (P.up === 'open' && P.levels > 1)) planOpen(C);
  P.ceilTop = kindS === 'church' ? topY - 0.1 : Math.min(topY - 0.05, floor0 + P.levels * floorH);
  return P;
}

export const toW = (P: Plan, u: number, v: number): P2 => [P.cx + P.ux * u + P.vx * v, P.cz + P.uz * u + P.vz * v];

// Permanent collision / walk surfaces for a plan: the doorway, the storeys with their stairwell
// openings, and the stairs (decks, sides, rails). The rooms' walls come with the layout (Stage B).
export function registerPlan(walk: WalkWorld, fp: Footprint, P: Plan) {
  const d = P.door;
  const f = (k: number) => P.floor0 + k * P.floorH;
  const rw = (r: Rect) => [toW(P, r.u0, r.v0), toW(P, r.u1, r.v0), toW(P, r.u1, r.v1), toW(P, r.u0, r.v1)];
  const holes = P.holes.filter((h) => h.level < P.levels).map((h) => ({ level: h.level, ring: rw(h) }));
  const raised = fp.raise > 0.5;
  const pid = walk.addPolygon(fp.ring, { floor0: P.floor0, floorH: P.floorH, levels: P.levels, holes, ground: raised }, { x: d.wx, z: d.wz, w: d.w }, raised ? P.floor0 - 0.6 : -Infinity);
  for (const F of P.flights) {
    const run = Math.abs(F.topU - F.bottomU);
    const lo = F.lo ?? 0, hi = F.hi ?? 1;
    const base = f(F.level) + lo * P.floorH, rise = (hi - lo) * P.floorH;
    const c = F.axis ? (F.u0 + F.u1) / 2 : (F.v0 + F.v1) / 2, half = (F.axis ? F.u1 - F.u0 : F.v1 - F.v0) / 2 - 0.05;
    const A = F.axis ? toW(P, c, F.bottomU) : toW(P, F.bottomU, c), B = F.axis ? toW(P, c, F.topU) : toW(P, F.topU, c);
    walk.addDeck({ pts: [A, B], cum: [0, run], halfWidth: half, heightAt: (s) => base + (Math.min(run, Math.max(0, s)) / run) * rise, profile: { k: 'ramp', y0: base, y1: base + rise, total: run } });
  }
  for (const Lg of P.landings) {
    // (a deck is a capsule round its line: the line stops half its width short of each end)
    const y = f(Lg.level) + Lg.y * P.floorH;
    const along = Lg.u1 - Lg.u0 >= Lg.v1 - Lg.v0;
    const c = along ? (Lg.v0 + Lg.v1) / 2 : (Lg.u0 + Lg.u1) / 2, half = (along ? Lg.v1 - Lg.v0 : Lg.u1 - Lg.u0) / 2 - 0.02;
    const a0 = (along ? Lg.u0 : Lg.v0) + half, a1 = Math.max(a0 + 0.01, (along ? Lg.u1 : Lg.v1) - half);
    const A = along ? toW(P, a0, c) : toW(P, c, a0), B = along ? toW(P, a1, c) : toW(P, c, a1);
    const l = Math.hypot(B[0] - A[0], B[1] - A[1]);
    walk.addDeck({ pts: [A, B], cum: [0, l], halfWidth: half, heightAt: () => y, profile: { k: 'const', y } });
  }
  const cw = P.cw;
  for (let i = 0; i + 5 < cw.length; i += 6) walk.addWall(toW(P, cw[i], cw[i + 1]), toW(P, cw[i + 2], cw[i + 3]), P.floor0 + cw[i + 4], P.floor0 + cw[i + 5]);
  return pid;
}
