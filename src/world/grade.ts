// Road grading: the ground a street runs on, conditioned the way a road engineer would. The DEM
// (Terrarium z14, 7–10 m) smears a bluff or a retaining wall into a slope and draped streets
// inherit it — a car on a 50% "ski slope" beside Pike Place Market, where the real street is a
// terrace. Each drivable way gets a smoothed longitudinal profile (a longer average where the
// short one is still too steep for its class, unless the map tags an `incline`), capped by its
// class. Ways are graded rank by rank, the greater first: ways of one rank meeting at a node agree
// on its height (a plateau, flat across the crossing street's carriageway), a lesser way ties into
// the greater one it meets (a driveway into its street, a street into the arterial: it takes the
// greater's surface across the greater's carriageway, and the greater keeps its own profile
// through). The ground under each street and its sidewalks is cut or filled to that profile — a
// way's own ground at least a grid pitch wide, the greater's where two overlap — blending back to
// the natural ground over a shoulder as wide as the cut is deep; every end, a dead end's too, is
// capped round, so a street's last metres are its own. Last, the surface actually written — a 4 m
// grid, read bilinearly — is walked along every way as the reviewer's audit walks it (8 m spans,
// every metre) and held to the way's limit wherever the grid's interpolation or a neighbour's
// corridor left it steeper than its profile.
//   Everything reaches a bounded distance — every filter 88 m along a way, a junction's partners
// 50 m, the last pass stays 48 m inside the grid — and a cell's DEM grid overhangs it by 96 m while
// a tile carries every way with a vertex within 48 m of it whole, so two cells grade a street that
// crosses their seam identically wherever what shapes it there lies within those 48 m. (Not where a
// way runs at its limit for longer than that: an untagged street up a sustained 26% hill, or one
// climbing out of an arterial's cut or a crossing's flat band where the ground is nearly as steep as
// it may be, carries its shortfall from a junction the neighbour's tile may not know — the seam can
// step there.)

import type { Road } from './data';

type P2 = [number, number];

/** Steepest grade a way of each class is built to (a tagged `incline` overrides). */
export const GRADE_MAX: Record<string, number> = {
  motorway: 0.06, motorway_link: 0.08, trunk: 0.07, trunk_link: 0.09, primary: 0.1, primary_link: 0.12,
  secondary: 0.14, secondary_link: 0.14, tertiary: 0.16, tertiary_link: 0.16,
  residential: 0.25, unclassified: 0.25, living_street: 0.25, service: 0.25,
};

/** The grade no stretch of a way may pass, whatever the DEM says (a tagged `incline` + 5 points
 *  overrides): past this a car climbs a wall. The class's GRADE_MAX is where smoothing starts. */
export const GRADE_HARD: Record<string, number> = {
  motorway: 0.08, motorway_link: 0.1, trunk: 0.1, trunk_link: 0.12, primary: 0.15, primary_link: 0.16,
  secondary: 0.21, secondary_link: 0.21, tertiary: 0.21, tertiary_link: 0.21,
  residential: 0.24, unclassified: 0.24, living_street: 0.24, service: 0.24,
};

/** Which way yields where two meet: the lesser ties into the greater (a driveway into its street,
 *  a street into the arterial it crosses). Links rank with the connectors — they tie into the roads
 *  at both their ends. Ways of one rank share a plateau. */
const RANK: Record<string, number> = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 2, unclassified: 2, living_street: 2, service: 1 };
const rankOf = (c: string) => RANK[c] ?? (c.endsWith('_link') ? 1.5 : 1);

/** A height grid in metres; node (i, j) sits at (x0 + (i + ½)·pitch, z0 + (j + ½)·pitch). */
export interface GradeGrid { x0: number; z0: number; pitch: number; nx: number; nz: number; heights: Float32Array }
/** `walls`: retaining walls where a street is cut into the hill, flat, 8 numbers a panel —
 *  x0, z0, x1, z1 (the foot line at the back of the sidewalk; the street lies toward
 *  (−(z1−z0), x1−x0), the direction turned a quarter left), then the foot and top heights at
 *  each end. `held`: grid nodes the last pass moved to hold a surface to its limit. */
export interface GradeReport { ways: number; nodes: number; maxShift: number; walls: number[]; held: number }
export interface GradeOpts {
  /** build retaining walls (detail builds) */
  walls?: boolean;
  /** ground a wall may not stand on (a building's footprint: its own wall is the wall) */
  blocked?: (x: number, z: number) => boolean;
}

const STEP = 4; // m between profile samples
const SPAN = 8; // m a grade is measured over — a car's length and a bit (the audit: 4 m samples, central differences)
const EASE = 20; // m a profile eases into a pinned height over
// (the last pass stays this far inside the grid: a tile carries every way within 48 m of its cell,
// and its grid overhangs the cell by 96 — past this a neighbour's ways may be missing)
const EDGE = 48;

interface Way {
  r: Road; p: P2[]; cum: number[]; L: number; gmax: number; hard: number; rank: number;
  // the profile, once built: samples every ≤ STEP m, and the grade it carries on at past each end
  n: number; xs: Float64Array; zs: Float64Array; ss: Float64Array; z: Float64Array; g0: number; g1: number;
}
interface Node { x: number; z: number; ways: number[]; arms: P2[][] }

export function gradeRoads(g: GradeGrid, roads: Road[], incline: (r: Road) => number | null = () => null, opts: GradeOpts = {}): GradeReport {
  const H0 = g.heights.slice();
  const X1 = g.x0 + g.nx * g.pitch, Z1 = g.z0 + g.nz * g.pitch;
  const h0 = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(g.nx - 1.001, (x - g.x0) / g.pitch - 0.5));
    const fz = Math.max(0, Math.min(g.nz - 1.001, (z - g.z0) / g.pitch - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * g.nx + i;
    return (H0[k] * (1 - u) + H0[k + 1] * u) * (1 - v) + (H0[k + g.nx] * (1 - u) + H0[k + g.nx + 1] * u) * v;
  };
  const inGrid = (x: number, z: number, m: number) => x > g.x0 - m && x < X1 + m && z > g.z0 - m && z < Z1 + m;
  const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
  // a way's own ground: its carriageway — and never narrower than the grid's reach round its
  // centreline (a 4 m alley's surface is read off nodes up to 4 m from it: they must be its own)
  const core = (w: Way) => Math.max(w.r.w / 2, g.pitch);

  // the drivable ways (no bridges — decks carry them — no tunnels)
  const ways: Way[] = [];
  for (const r of roads) {
    const gm = GRADE_MAX[r.c];
    if (gm === undefined || r.br || r.tu || r.lod) continue;
    const p: P2[] = [];
    for (let i = 0; i + 1 < r.p.length; i += 2) p.push([r.p[i] / 10, r.p[i + 1] / 10]);
    if (p.length < 2 || !p.some(([x, z]) => inGrid(x, z, 120))) continue;
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const t = incline(r), none = new Float64Array(0);
    ways.push({
      r, p, cum, L: cum[cum.length - 1], rank: rankOf(r.c),
      gmax: t !== null ? Math.max(gm, t + 0.03) : gm, hard: t !== null ? Math.max(0.25, t + 0.05) : GRADE_HARD[r.c],
      n: 0, xs: none, zs: none, ss: none, z: none, g0: 0, g1: 0,
    });
  }
  const ptAt = (w: Way, s: number): P2 => {
    const { p, cum } = w;
    let lo = 0, hi = cum.length - 1;
    if (s <= 0) return p[0];
    if (s >= cum[hi]) return p[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
    return [p[lo][0] + (p[hi][0] - p[lo][0]) * t, p[lo][1] + (p[hi][1] - p[lo][1]) * t];
  };

  // the nodes ways share: which ways, and the directions their arms leave in
  const nodes = new Map<string, Node>();
  ways.forEach((w, wi) => {
    const m = w.p.length;
    for (let i = 0; i < m; i++) {
      const [x, z] = w.p[i], k = key(x, z);
      let nd = nodes.get(k);
      if (!nd) nodes.set(k, (nd = { x, z, ways: [], arms: [] }));
      let a = nd.ways.indexOf(wi);
      if (a < 0) (a = nd.ways.push(wi) - 1), nd.arms.push([]);
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= m) continue;
        const dx = w.p[j][0] - x, dz = w.p[j][1] - z, l = Math.hypot(dx, dz);
        if (l > 1e-6) nd.arms[a].push([dx / l, dz / l]);
      }
    }
  });
  // A node where two or more ways of its top rank meet is a plateau: they agree on one height, the
  // mean ground round the node, each held flat across the others' carriageways — the ones that
  // cross it (a way carrying straight on is the same street split in two: one height, no band). A
  // lesser way at the node ties into the greater instead (below).
  interface Plateau { h: number; half: Map<number, number>; hw: number }
  const plateaus = new Map<string, Plateau>();
  for (const [k, nd] of nodes) {
    if (nd.ways.length < 2 || !inGrid(nd.x, nd.z, 100)) continue;
    const top = Math.max(...nd.ways.map((wi) => ways[wi].rank));
    const tops = nd.ways.map((wi, a) => ({ wi, a })).filter(({ wi }) => ways[wi].rank === top);
    if (tops.length < 2) continue;
    const half = new Map<number, number>();
    let hw = 0;
    for (const { wi, a } of tops) {
      hw = Math.max(hw, ways[wi].r.w / 2);
      let h = 0;
      for (const o of tops) {
        if (o.wi === wi) continue;
        // (crosses: an arm of the other way leaves neither along nor against one of this way's — and
        // its carriageway then covers this one for its width over the sine of the angle between
        // them: a street crossing at 30° is flat across twice its width)
        let sin = nd.arms[o.a].length ? 0 : 1;
        for (const [ox, oz] of nd.arms[o.a]) {
          const c = Math.max(0, ...nd.arms[a].map(([ax, az]) => Math.abs(ox * ax + oz * az)));
          if (c < 0.87) sin = Math.min(sin || 1, Math.sqrt(1 - c * c));
        }
        if (sin) h = Math.max(h, (ways[o.wi].r.w / 2 + 0.5) / sin);
      }
      half.set(wi, h);
    }
    const rj = Math.min(12, hw + 2);
    let s = h0(nd.x, nd.z), n = 1;
    for (let a = 0; a < 8; a++) (s += h0(nd.x + Math.cos(a * 0.785) * rj, nd.z + Math.sin(a * 0.785) * rj)), n++;
    plateaus.set(k, { h: s / n, half, hw });
  }

  // box filter (two passes make it a triangle) over a sample array
  const box = (z: Float64Array, R: number) => {
    const n = z.length, out = new Float64Array(n), c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + z[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - R), b = Math.min(n - 1, i + R); out[i] = (c[b + 1] - c[a]) / (b - a + 1); }
    return out;
  };
  const ease = (t: number) => t * t * (3 - 2 * t);

  // a way's height at a point projecting to parameter tr along its sample segment k: past either end
  // the profile carries on at its last grade (the grid's round caps do the same — see below)
  const along = (w: Way, k: number, tr: number) => {
    if (k === 0 && tr < 0) return w.z[0] + w.g0 * tr * Math.hypot(w.xs[1] - w.xs[0], w.zs[1] - w.zs[0]);
    if (k === w.n - 2 && tr > 1) return w.z[w.n - 1] + w.g1 * (tr - 1) * Math.hypot(w.xs[k + 1] - w.xs[k], w.zs[k + 1] - w.zs[k]);
    const t = Math.max(0, Math.min(1, tr));
    return w.z[k] + (w.z[k + 1] - w.z[k]) * t;
  };
  // the profiles built so far, for the lesser ways to tie into: segments in 16 m buckets. A lesser
  // way's sample on the greater's own ground (its core) is on its carriageway: tied hard, it takes
  // the greater's surface. One within a pitch past it — its surface is still read partly off the
  // greater's nodes — is tied soft: it starts from the greater's surface, but its own climb may
  // bend it away (a driveway running beside the arterial on a bank, a corner where two streets'
  // surfaces part: pinned to either, the climb out was squeezed into a few metres).
  const built = new Map<string, { w: Way; k: number; rad: number }[]>();
  const tieIn = (x: number, z: number, above: number) => {
    // (on a carriageway: that way's surface — the greatest rank's where two overlap, as the ground
    // is written below; beside ones only: the nearest carriageway's edge. Equals share, so the
    // answer is the same whatever order a tile lists its ways in)
    let best: { hard: boolean; rank: number; m: number; v: number; n: number } | null = null;
    for (const e of built.get(Math.floor(x / 16) + ',' + Math.floor(z / 16)) ?? []) {
      const w = e.w;
      if (w.rank <= above) continue;
      const ax = w.xs[e.k], az = w.zs[e.k], dx = w.xs[e.k + 1] - ax, dz = w.zs[e.k + 1] - az;
      const tr = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), t = Math.max(0, Math.min(1, tr));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d > e.rad) continue;
      const hard = d <= core(w), m = hard ? d : d - core(w), v = along(w, e.k, tr);
      let better = !best;
      if (best && hard !== best.hard) better = hard;
      else if (best) {
        const byRank = w.rank - best.rank, byDist = best.m - m;
        const c = hard ? byRank || (Math.abs(byDist) < 1e-6 ? 0 : byDist) : Math.abs(byDist) >= 1e-6 ? byDist : byRank;
        if (c === 0) { best.v += v; best.n++; continue; }
        better = c > 0;
      }
      if (better) best = { hard, rank: w.rank, m, v, n: 1 };
    }
    return best && { v: best.v / best.n, hard: best.hard };
  };

  // every mapped way but the sidewalks (a path, a flight of steps, a driveway leaving the street is
  // a gap in a retaining wall), in 24 m buckets
  const segs = new Map<string, { r: Road; ax: number; az: number; bx: number; bz: number }[]>();
  if (opts.walls)
    for (const r of roads) {
      if (r.sw || r.tu) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
        for (let u = Math.floor(Math.min(ax, bx) / 24); u <= Math.floor(Math.max(ax, bx) / 24); u++)
          for (let v = Math.floor(Math.min(az, bz) / 24); v <= Math.floor(Math.max(az, bz) / 24); v++)
            (segs.get(u + ',' + v) ?? segs.set(u + ',' + v, []).get(u + ',' + v)!).push({ r, ax, az, bx, bz });
      }
    }
  const nearOther = (x: number, z: number, self: Road) => {
    for (const q of segs.get(Math.floor(x / 24) + ',' + Math.floor(z / 24)) ?? []) {
      if (q.r === self) continue;
      const dx = q.bx - q.ax, dz = q.bz - q.az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - q.ax) * dx + (z - q.az) * dz) / l2));
      if (Math.hypot(q.ax + dx * t - x, q.az + dz * t - z) < q.r.w / 2 + 1.5) return true;
    }
    return false;
  };
  const walls: number[] = [];

  // ---- each way's profile, rank by rank, the greater first (the lesser tie into them) ----
  const publish = (w: Way) => {
    // (a lesser way's surface is read off nodes up to a pitch from its centreline: where any of
    // them is the greater's own ground, the lesser starts from the greater's height, or its climb
    // starts on a mix of the two and the knee is only moved out a few metres)
    const rad = core(w) + g.pitch + 0.5;
    for (let k = 0; k + 1 < w.n; k++) {
      const x0 = Math.min(w.xs[k], w.xs[k + 1]) - rad, x1 = Math.max(w.xs[k], w.xs[k + 1]) + rad;
      const z0 = Math.min(w.zs[k], w.zs[k + 1]) - rad, z1 = Math.max(w.zs[k], w.zs[k + 1]) + rad;
      for (let u = Math.floor(x0 / 16); u <= Math.floor(x1 / 16); u++)
        for (let v = Math.floor(z0 / 16); v <= Math.floor(z1 / 16); v++)
          (built.get(u + ',' + v) ?? built.set(u + ',' + v, []).get(u + ',' + v)!).push({ w, k, rad });
    }
  };
  interface Prof { n: number; ds: number; xs: Float64Array; zs: Float64Array; ss: Float64Array; raw: Float64Array; z: Float64Array; tie: Float64Array; hard: Uint8Array }
  // resampled every STEP m, and smoothed: a short average, and — where that is still too steep for
  // the class — a long one. Every filter reaches at most 88 m along the way (the long window; the
  // hand-over's own spread is kept inside it): a cell's grid overhangs it by 96 m, so a street that
  // crosses a seam is smoothed off the same ground in both cells. (The hand-over once reached 160 m:
  // past the overhang one cell saw a bluff the other read as the flat edge of its grid, and the
  // street stepped at the seam.)
  const smooth = (w: Way): Prof => {
    const L = w.L, n = Math.max(2, Math.ceil(L / STEP) + 1);
    const xs = new Float64Array(n), zs = new Float64Array(n), ss = new Float64Array(n), raw = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * L, [x, z] = ptAt(w, s);
      (xs[k] = x), (zs[k] = z), (ss[k] = s), (raw[k] = h0(x, z));
    }
    const ds = L / (n - 1);
    const rs = Math.max(1, Math.round(12 / ds)), rb = Math.max(1, Math.round(44 / ds)), rh = Math.max(1, Math.round(20 / ds));
    // the filters see the ground carrying on past each end (the next street, or the hill a dead
    // end climbs into) — a window cut short at an end would pull an honest hill's end level
    const pad = 2 * rb, m = n + 2 * pad, ext = new Float64Array(m);
    const e0x = xs[0] - xs[1], e0z = zs[0] - zs[1], e0 = Math.hypot(e0x, e0z) || 1;
    const e1x = xs[n - 1] - xs[n - 2], e1z = zs[n - 1] - zs[n - 2], e1 = Math.hypot(e1x, e1z) || 1;
    for (let q = 0; q < pad; q++) {
      const d = (pad - q) * ds;
      ext[q] = h0(xs[0] + (e0x / e0) * d, zs[0] + (e0z / e0) * d);
      ext[m - 1 - q] = h0(xs[n - 1] + (e1x / e1) * d, zs[n - 1] + (e1z / e1) * d);
    }
    ext.set(raw, pad);
    const smallE = box(box(ext, rs), rs), bigE = box(box(ext, rb), rb);
    // where the short average is still too steep for the class, the long one takes over — eased
    // along the way, so the hand-over is itself no step
    const want = new Float64Array(m);
    for (let q = 1; q + 1 < m; q++) {
      const gr = Math.abs(smallE[q + 1] - smallE[q - 1]) / (2 * ds);
      want[q] = ease(Math.max(0, Math.min(1, (gr - 0.8 * w.gmax) / (0.4 * w.gmax))));
    }
    // (a max-then-average: a steep stretch hands over fully, and its neighbours ease into it)
    const wide = new Float64Array(m);
    for (let q = 0; q < m; q++) { let mx = 0; for (let r = Math.max(0, q - rh); r <= Math.min(m - 1, q + rh); r++) mx = Math.max(mx, want[r]); wide[q] = mx; }
    const blend = box(box(wide, rh), rh);
    const z = new Float64Array(n);
    for (let k = 0; k < n; k++) z[k] = smallE[k + pad] + (bigE[k + pad] - smallE[k + pad]) * Math.min(1, blend[k + pad]);
    return { n, ds, xs, zs, ss, raw, z, tie: new Float64Array(n).fill(NaN), hard: new Uint8Array(n) };
  };

  const ranks = [...new Set(ways.map((w) => w.rank))].sort((a, b) => b - a);
  for (const rank of ranks) {
    const R: number[] = [];
    ways.forEach((w, wi) => { if (w.rank === rank && w.L >= 2) R.push(wi); });
    const prof = new Map<number, Prof>();
    for (const wi of R) {
      const P = smooth(ways[wi]);
      // …tied into every greater way whose carriageway it runs across or along (the greater ranks'
      // profiles are all built: a rank sees only those above it, so none depends on its peers)
      for (let k = 0; k < P.n; k++) {
        const t = tieIn(P.xs[k], P.zs[k], rank);
        if (t) (P.tie[k] = t.v), (P.hard[k] = t.hard ? 1 : 0);
      }
      prof.set(wi, P);
    }
    // Plateaus a short way apart that the DEM puts further apart in height than the way between them
    // can climb past their flat bands (a bluff smeared between Post Alley and Western Ave: 9 m in
    // 20 m) meet each other halfway; a plateau too far from the surface of a greater way that a way
    // through it is tied hard to (an alley's junction with a driveway a few metres short of the
    // street they come down to, at the mean ground two metres above the street's cut) goes the
    // whole way to it — that surface is the greater's own. One step, partners within 50 m along a
    // way, so the answer stays local (both sit inside every tile's grid that can see them) and a
    // seam grades the same twice.
    const moves = new Map<string, number[]>();
    const push = (k: string, d: number) => (moves.get(k) ?? moves.set(k, []).get(k)!).push(d);
    for (const wi of R) {
      const w = ways[wi], P = prof.get(wi)!;
      const seq: { s: number; half: number; k?: string; v: number }[] = [];
      for (let i = 0; i < w.p.length; i++) {
        const k = key(w.p[i][0], w.p[i][1]), pl = plateaus.get(k), half = pl?.half.get(wi);
        if (half !== undefined) seq.push({ s: w.cum[i], half, k, v: pl!.h });
      }
      if (!seq.length) continue;
      for (let k = 0; k < P.n; k++) if (P.hard[k]) seq.push({ s: P.ss[k], half: 0, v: P.tie[k] });
      seq.sort((a, b) => a.s - b.s);
      for (let q = 1; q < seq.length; q++) {
        const a = seq[q - 1], b = seq[q];
        if ((!a.k && !b.k) || a.k === b.k || b.s - a.s > 50) continue;
        const run = Math.max(2, b.s - a.s - a.half - b.half), ex = Math.abs(b.v - a.v) - w.hard * 0.9 * run;
        if (ex <= 0) continue;
        const d = Math.sign(b.v - a.v) * ex;
        if (a.k && b.k) push(a.k, d / 2), push(b.k, -d / 2);
        else if (a.k) push(a.k, d);
        else push(b.k!, -d);
      }
    }
    for (const [k, m] of moves) plateaus.get(k)!.h += m.reduce((a, b) => a + b, 0) / m.length;

    for (const wi of R) {
      const w = ways[wi], P = prof.get(wi)!, { n, ds, xs, zs, ss, raw, z, tie, hard } = P, L = w.L;
      const pins = new Map<number, number>();
      const easeTo = (s0: number, v: number) => {
        for (let k = 0; k < n; k++) {
          const d = Math.abs(ss[k] - s0);
          if (d < EASE) z[k] += (v - z[k]) * ease(1 - d / EASE);
        }
      };
      // Meet each plateau at its height, easing in over 20 m — and hold it flat across the band
      // the crossing ways' carriageways take on this one: the climb happens between the bands. A
      // profile climbing at its limit straight through a band had the crossing's flat ground under
      // it, and the ground caught up in the few metres past the band's edge (a 36–50% knee at every
      // crossing of a steep hill — the car on the grade pitched like a ski jump). The band is the
      // CROSSING's width: a driveway no longer flattens its street, a split no band at all.
      for (let i = 0; i < w.p.length; i++) {
        const pl = plateaus.get(key(w.p[i][0], w.p[i][1])), half = pl?.half.get(wi);
        if (half === undefined) continue;
        easeTo(w.cum[i], pl!.h);
        for (let k = 0; k < n; k++) if (Math.abs(ss[k] - w.cum[i]) <= half) pins.set(k, pl!.h);
        pins.set(Math.max(0, Math.min(n - 1, Math.round(w.cum[i] / ds))), pl!.h);
      }
      // …the greater ways' surfaces where it is tied: a run of tied samples eases in from its two
      // ends; a sample on the greater's carriageway is pinned there, one beside it only set (the
      // limits below may still bend it)
      for (let k = 0; k < n; k++) {
        if (Number.isNaN(tie[k])) continue;
        if (k === 0 || Number.isNaN(tie[k - 1]) || k === n - 1 || Number.isNaN(tie[k + 1])) easeTo(ss[k], tie[k]);
      }
      for (let k = 0; k < n; k++) if (!Number.isNaN(tie[k])) { if (hard[k]) pins.set(k, tie[k]); else z[k] = tie[k]; }
      // …and a dead end meets the ground it stops on (the hill it runs into, a garage's apron) as
      // near as its grade allows — the smoothing's view past the end is no reason to perch it on a
      // bank or sink it in a cut
      // (shifted there by what it misses by, fading over 20 m — its grade kept, not flattened; the
      // pinned and tied samples stay where they are: the limits below reconcile the two)
      for (const [i, k] of [[0, 0], [w.p.length - 1, n - 1]]) {
        const nd = nodes.get(key(w.p[i][0], w.p[i][1]));
        if (!nd || nd.ways.length !== 1 || pins.has(k) || !Number.isNaN(tie[k])) continue;
        const miss = raw[k] - z[k];
        for (let q = 0; q < n; q++) {
          const d = Math.abs(ss[q] - ss[k]);
          if (d < EASE && !pins.has(q) && Number.isNaN(tie[q])) z[q] += miss * ease(1 - d / EASE);
        }
      }
      // …and nowhere steeper than a car can climb. Each step's limit is the class's hard grade — or
      // less on a bend, where the 8 m a car spans cuts the corner (a grade is measured over the
      // chord); where two pins ask more than that allows, the even grade between them, so the passes
      // below spread the excess evenly instead of piling it into one step at the pin
      const G = w.hard, cap = new Float64Array(n - 1).fill(G);
      let bent = false;
      for (let i = 1; i + 1 < w.p.length && !bent; i++) {
        const ax = w.p[i][0] - w.p[i - 1][0], az = w.p[i][1] - w.p[i - 1][1], bx = w.p[i + 1][0] - w.p[i][0], bz = w.p[i + 1][1] - w.p[i][1];
        if (ax * bx + az * bz < 0.999 * Math.hypot(ax, az) * Math.hypot(bx, bz)) bent = true;
      }
      if (bent)
        for (let k = 0; k + 1 < n; k++) {
          let rho = 1;
          if (L <= SPAN) { const [ax, az] = w.p[0], [bx, bz] = w.p[w.p.length - 1]; rho = Math.hypot(bx - ax, bz - az) / L; }
          else {
            const lo = Math.max(0, ss[k + 1] - SPAN), hi = Math.min(ss[k], L - SPAN);
            for (let a = lo; ; a = Math.min(hi, a + 1)) {
              const [ax, az] = ptAt(w, a), [bx, bz] = ptAt(w, a + SPAN);
              rho = Math.min(rho, Math.hypot(bx - ax, bz - az) / SPAN);
              if (a >= hi) break;
            }
          }
          cap[k] = G * Math.max(0.2, rho);
        }
      const pk = [...pins.keys()].sort((a, b) => a - b);
      for (const [k, v] of pins) z[k] = v;
      for (let q = 0; q + 1 < pk.length; q++) {
        const a = pk[q], b = pk[q + 1];
        if (b - a < 1) continue;
        let room = 0;
        for (let k = a; k < b; k++) room += cap[k] * ds;
        const need = Math.abs(pins.get(b)! - pins.get(a)!);
        if (need > room) for (let k = a; k < b; k++) cap[k] *= (need / room) * 1.001;
      }
      // (the cone each pin allows, measured along the way's own limits)
      const C = new Float64Array(n);
      for (let k = 1; k < n; k++) C[k] = C[k - 1] + cap[k - 1] * ds;
      if (pk.length)
        for (let k = 0; k < n; k++) {
          if (pins.has(k)) continue;
          let lo = -Infinity, hi = Infinity;
          for (const q of pk) { const dz = Math.abs(C[k] - C[q]), v = pins.get(q)!; lo = Math.max(lo, v - dz); hi = Math.min(hi, v + dz); }
          if (lo <= hi) z[k] = Math.max(lo, Math.min(hi, z[k]));
          else {
            // bracketing pins: the even grade between them
            let a = pk[0], b = pk[pk.length - 1];
            for (const q of pk) { if (q < k) a = q; if (q > k) { b = q; break; } }
            const va = pins.get(a)!, vb = pins.get(b)!;
            z[k] = a === b ? va : va + ((vb - va) * (ss[k] - ss[a])) / (ss[b] - ss[a]);
          }
        }
      for (let it = 0; it < 3; it++) {
        for (let k = 1; k < n; k++) if (!pins.has(k)) z[k] = Math.max(z[k - 1] - cap[k - 1] * ds, Math.min(z[k - 1] + cap[k - 1] * ds, z[k]));
        for (let k = n - 2; k >= 0; k--) if (!pins.has(k)) z[k] = Math.max(z[k + 1] - cap[k] * ds, Math.min(z[k + 1] + cap[k] * ds, z[k]));
      }
      const ge = (a: number, b: number) => Math.max(-w.hard, Math.min(w.hard, (z[b] - z[a]) / ds));
      Object.assign(w, { n, xs, zs, ss, z, g0: ge(0, 1), g1: ge(n - 2, n - 1) });

      // Retaining walls: where the street is cut into the hill more than 0.6 m, a wall at the back of
      // the sidewalk holds the hill up (Seattle's concrete and rockery walls) — not across a crossing
      // street, a path or a driveway, not where a building stands (its own wall is the wall).
      const hw = w.r.w / 2 + 2.5;
      if (opts.walls && n >= 2) {
        const band: number[] = [];
        for (let i = 0; i < w.p.length; i++) {
          const nd = nodes.get(key(w.p[i][0], w.p[i][1]));
          if (nd && nd.ways.length > 1) band.push(w.cum[i], Math.max(...nd.ways.map((o) => ways[o].r.w / 2)) + 3);
        }
        for (const side of [-1, 1]) {
          let run: number[] | null = null;
          // (each panel wound so the street lies to its left: its face turned to the sidewalk)
          const flush = () => {
            if (run && run.length >= 8)
              for (let q = 0; q + 7 < run.length; q += 4)
                if (side < 0) walls.push(run[q], run[q + 1], run[q + 4], run[q + 5], run[q + 2], run[q + 3], run[q + 6], run[q + 7]);
                else walls.push(run[q + 4], run[q + 5], run[q], run[q + 1], run[q + 6], run[q + 7], run[q + 2], run[q + 3]);
            run = null;
          };
          for (let k = 0; k < n; k++) {
            const kk = Math.min(n - 2, k), dx = xs[kk + 1] - xs[kk], dz = zs[kk + 1] - zs[kk], l = Math.hypot(dx, dz) || 1;
            const nx = (-dz / l) * side, nz = (dx / l) * side;
            const ex = xs[k] + nx * hw, ez = zs[k] + nz * hw;
            let ok = inGrid(ex, ez, 0) && !band.some((c, q) => q % 2 === 0 && Math.abs(ss[k] - c) < band[q + 1]);
            const top = ok ? Math.max(h0(ex + nx * 2, ez + nz * 2), h0(ex + nx * 4, ez + nz * 4)) : 0;
            if (ok && (top - z[k] <= 0.6 || nearOther(ex, ez, w.r) || opts.blocked?.(ex, ez))) ok = false;
            if (!ok) { flush(); continue; }
            (run ??= []).push(ex, ez, z[k] - 0.3, Math.min(z[k] + 7, top + 0.2));
          }
          flush();
        }
      }
    }
    // (a rank's profiles become visible to the lesser ranks together)
    for (const wi of R) publish(ways[wi]);
  }

  // ---- the ground: the street and its sidewalks at the profile, shoulders easing back ----
  const N = g.nx * g.nz;
  const acc = new Float64Array(N), wsum = new Float64Array(N), wmax = new Float32Array(N);
  // A node inside a way's own ground (its core) takes that way's height: the greatest rank's where
  // cores overlap (a driveway's mouth is its street's), the nearest centreline's among equals. One
  // on a sidewalk takes the corridors' — a crossing street's sidewalk band or fading shoulder no
  // longer drags the next street's climb flat and piles the difference into a step past the crossing.
  const accK = new Float64Array(N), wK = new Float64Array(N), rankK = new Float32Array(N).fill(-1);
  const accC = new Float64Array(N), wsumC = new Float32Array(N);
  // per way, each node takes the target at its nearest point on the way (one answer a way, not
  // an average of every 4 m piece within reach — that smeared the profile's knees past its limit)
  const bestD = new Float32Array(N).fill(Infinity), bestT = new Float32Array(N);
  const touched: number[] = [];
  for (const w of ways) {
    const { n, xs, zs } = w;
    if (n < 2) continue;
    const cw = core(w), hw = Math.max(w.r.w / 2 + 2.5, cw), R = hw + 12;
    // (every end capped round, a dead end's too: the last metres of a street are its own ground,
    // not the hill's — a car at the end of a driveway climbing into the slope sat on a 50% ramp
    // the grid's interpolation built between the driveway's last node and the untouched hill. Past
    // an end the profile carries on at its last grade: an honest hill's end is left as it lies)
    for (let k = 0; k + 1 < n; k++) {
      const ax = xs[k], az = zs[k], bx = xs[k + 1], bz = zs[k + 1];
      if (!inGrid((ax + bx) / 2, (az + bz) / 2, R)) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - g.x0) / g.pitch - 0.5)), i1 = Math.min(g.nx - 1, Math.ceil((Math.max(ax, bx) + R - g.x0) / g.pitch - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - g.z0) / g.pitch - 0.5)), j1 = Math.min(g.nz - 1, Math.ceil((Math.max(az, bz) + R - g.z0) / g.pitch - 0.5));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = g.x0 + (i + 0.5) * g.pitch, zz = g.z0 + (j + 0.5) * g.pitch;
          const tr = ((x - ax) * dx + (zz - az) * dz) / l2, t = Math.max(0, Math.min(1, tr));
          const ex = ax + dx * t - x, ez = az + dz * t - zz, d = Math.sqrt(ex * ex + ez * ez);
          if (d > R) continue;
          const kk = j * g.nx + i;
          if (d >= bestD[kk]) continue;
          if (bestD[kk] === Infinity) touched.push(kk);
          bestD[kk] = d;
          bestT[kk] = along(w, k, tr);
        }
    }
    for (const kk of touched) {
      const d = bestD[kk], target = bestT[kk], nat = H0[kk];
      bestD[kk] = Infinity;
      const S = Math.max(2, Math.min(12, 1.5 * Math.abs(target - nat)));
      let wt = 1;
      if (d > hw) {
        if (d >= hw + S) continue;
        wt = ease(1 - (d - hw) / S);
      }
      // (cubed: a street's own corridor outranks a neighbour's shoulder — an alley a storey
      // below no longer drags the avenue's kerb down with it)
      const w3 = wt * wt * wt;
      acc[kk] += w3 * target;
      wsum[kk] += w3;
      if (d <= cw) {
        if (w.rank > rankK[kk]) (rankK[kk] = w.rank), (accK[kk] = 0), (wK[kk] = 0);
        if (w.rank === rankK[kk]) { const u = 1 / Math.max(0.25, d) ** 4; accK[kk] += u * target; wK[kk] += u; }
      } else if (wt >= 1) (accC[kk] += target), (wsumC[kk] += 1);
      if (wt > wmax[kk]) wmax[kk] = wt;
    }
    touched.length = 0;
  }
  let nodesSet = 0;
  for (let k = 0; k < N; k++) {
    if (!wsum[k]) continue;
    const t = wK[k] ? accK[k] / wK[k] : wsumC[k] ? accC[k] / wsumC[k] : acc[k] / wsum[k];
    g.heights[k] = H0[k] + (t - H0[k]) * wmax[k];
    nodesSet++;
  }

  const held = holdLimits(g, ways, rankK);
  let maxShift = 0;
  for (let k = 0; k < N; k++) maxShift = Math.max(maxShift, Math.abs(g.heights[k] - H0[k]));
  return { ways: ways.length, nodes: nodesSet, maxShift, walls, held };
}

/** The last pass: the surface as the game reads it (the grid, bilinearly), walked along every way —
 *  a sample every metre, the grade over the chord between samples SPAN m apart along it, as the
 *  reviewer's audit and a car's wheels see it — and wherever that passes the way's limit, the grid
 *  nodes under the span are moved the least that brings it back (each span's excess projected out
 *  over its nodes; the requests of every span at a node averaged, all ways at once, so the answer
 *  is the same whatever order a tile lists its ways in). What it fixes is the grid's own doing:
 *  a 4 m lattice read bilinearly where a driveway leaves the arterial it ran beside, two ways'
 *  corridors meeting, a knee where two pins asked more than the class allows.
 *    A node on a greater way's carriageway (`owner`: the rank whose core holds each node, −1 none)
 *  is ten times stiffer to a lesser way's span for the first rounds: a driveway's excess comes out
 *  of its own ground, not the street's kerb. Where its own ground can't hold it — an alley between
 *  two streets further apart in height than it may climb — the streets it joins give too. Each
 *  round moves half again the averaged request (the excess of a steep block reaches its ends in
 *  fewer rounds). Returns the nodes moved. */
function holdLimits(g: GradeGrid, ways: Way[], owner: Float32Array): number {
  const H = g.heights, nx = g.nx;
  const lo = (v: number, v0: number, n: number) => v > v0 + EDGE && v < v0 + n * g.pitch - EDGE;
  // each way's samples: the four nodes under it and their bilinear weights
  interface Spans { k: Int32Array; wt: Float64Array; a: Int32Array; b: Int32Array; lim: Float64Array; rank: number }
  const all: Spans[] = [];
  for (const w of ways) {
    if (w.n < 2 || w.L < SPAN) continue;
    const F = Math.floor(w.L);
    const pos: number[] = [];
    for (let s = 0; s <= F; s++) pos.push(s);
    // (the far end too: the last span ends where the way does)
    const tail = w.L - F > 0.01;
    if (tail) pos.push(w.L - SPAN, w.L);
    const m = pos.length, k = new Int32Array(4 * m).fill(-1), wt = new Float64Array(4 * m);
    const xy: P2[] = [];
    for (let q = 0; q < m; q++) {
      const s = pos[q];
      let lo2 = 0, hi2 = w.cum.length - 1;
      while (hi2 - lo2 > 1) { const md = (lo2 + hi2) >> 1; if (w.cum[md] <= s) lo2 = md; else hi2 = md; }
      const t = Math.max(0, Math.min(1, (s - w.cum[lo2]) / Math.max(1e-9, w.cum[hi2] - w.cum[lo2])));
      const x = w.p[lo2][0] + (w.p[hi2][0] - w.p[lo2][0]) * t, z = w.p[lo2][1] + (w.p[hi2][1] - w.p[lo2][1]) * t;
      xy.push([x, z]);
      if (!lo(x, g.x0, g.nx) || !lo(z, g.z0, g.nz)) continue;
      const fx = (x - g.x0) / g.pitch - 0.5, fz = (z - g.z0) / g.pitch - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, c = j * nx + i;
      k.set([c, c + 1, c + nx, c + nx + 1], 4 * q);
      wt.set([(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v], 4 * q);
    }
    const A: number[] = [], B: number[] = [], lim: number[] = [];
    const span = (a: number, b: number) => {
      if (k[4 * a] < 0 || k[4 * b] < 0) return;
      A.push(a), B.push(b), lim.push(w.hard * Math.hypot(xy[b][0] - xy[a][0], xy[b][1] - xy[a][1]));
    };
    for (let q = 0; q + SPAN <= F; q++) span(q, q + SPAN);
    if (tail) span(m - 2, m - 1);
    if (A.length) all.push({ k, wt, a: Int32Array.from(A), b: Int32Array.from(B), lim: Float64Array.from(lim), rank: w.rank });
  }
  const moved = new Uint8Array(H.length);
  const corr = new Float64Array(H.length), cnt = new Float64Array(H.length);
  const touchedN: number[] = [];
  for (let it = 0; it < 250; it++) {
    let any = false;
    for (const sp of all) {
      const at = (q: number) => { let v = 0; for (let c = 4 * q; c < 4 * q + 4; c++) v += sp.wt[c] * H[sp.k[c]]; return v; };
      for (let e = 0; e < sp.a.length; e++) {
        const a = sp.a[e], b = sp.b[e], v = at(b) - at(a), L = sp.lim[e];
        if (Math.abs(v) <= L * 1.0005 + 1e-4) continue;
        any = true;
        // the least move that brings this span to 99% of its limit: along its gradient — the
        // far sample's weights less the near one's — each node's share scaled by its give
        const ex = (Math.abs(v) - 0.99 * L) * Math.sign(v);
        let nrm = 0;
        const ids: number[] = [], gs: number[] = [], mu: number[] = [];
        for (const [q, sg] of [[b, 1], [a, -1]] as const)
          for (let c = 4 * q; c < 4 * q + 4; c++) {
            const id = sp.k[c], gv = sg * sp.wt[c], at2 = ids.indexOf(id);
            if (at2 >= 0) gs[at2] += gv;
            else ids.push(id), gs.push(gv), mu.push(it < 30 && owner[id] > sp.rank ? 0.1 : 1);
          }
        for (let c = 0; c < gs.length; c++) nrm += mu[c] * gs[c] * gs[c];
        if (nrm < 1e-9) continue;
        for (let c = 0; c < ids.length; c++) {
          if (gs[c] === 0) continue;
          const id = ids[c];
          if (!cnt[id]) touchedN.push(id);
          corr[id] -= (ex * mu[c] * gs[c]) / nrm;
          cnt[id]++;
        }
      }
    }
    if (!any) break;
    for (const id of touchedN) { H[id] += (1.5 * corr[id]) / cnt[id]; corr[id] = 0; cnt[id] = 0; moved[id] = 1; }
    touchedN.length = 0;
  }
  let n = 0;
  for (let i = 0; i < moved.length; i++) n += moved[i];
  return n;
}

/** A way's tagged incline as a fraction (`incline=15%`, `incline=-8.5 %`), else null (up/down: null). */
export function inclineOf(tag: string | undefined): number | null {
  const m = /^\s*-?(\d+(?:\.\d+)?)\s*%\s*$/.exec(tag ?? '');
  return m ? +m[1] / 100 : null;
}
