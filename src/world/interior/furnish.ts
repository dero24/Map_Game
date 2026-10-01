// Furnishing (docs/INTERIORS_PLAN.md §3 "Furniture and rendering"): every room by its type — a
// living room's sofa on a solid wall and its TV across from it, beds with their heads to a wall
// away from the door, the kitchen run and the bathroom's fittings on the walls, desks by the
// glass, gondolas down a shop — in the room's own rectangle, clear of its doors, the stairs and
// the windows (tall pieces). Repeated pieces go through the instancer; a room's one-offs (rugs,
// pictures, books on a shelf) are drawn into the merged mesh.
import * as D from '../../assets/decor';
import type { Footprint } from '../buildings';
import { useOf } from '../uses';
import type { Rng } from '../../core/rng';
import { LocalPoly, wallWindows, liftCars, rectArea, LIFT_DOOR, type Plan, type Rect, type WinModel } from './plan';
import type { Layout, Room } from './layout';
import { Draw, Instancer, IP, WOOD, type LeafSpot, type Mesher, type P2 } from './mesh';

/** A lamp's light: where, how strong; `n`: lit after dark only (a ceiling light in a room with windows). */
export interface Light { x: number; y: number; z: number; w: number; n?: 1 }
/** [u, v, floor y, yaw, seat height (0: standing), staff (1: placed first)] */
export type NpcSpot = [number, number, number, number, number?, number?];
export const FABRIC = [0x5b7fa6, 0xa65a44, 0x6e8c5a, 0xd9c7a0, 0x7a5b8c, 0x3f6f78, 0xc9a24b, 0x8f8f96, 0xc97b6b, 0x4f6d8f];
const STOCK = [0xd9573f, 0xe0a33b, 0x6e8c5a, 0xf2efe6, 0x5b7fa6, 0xc9a24b, 0x8a4a3a];
const STAFF_AISLE = 0.9; // the working aisle behind a shop, café or bar counter
/** A place at a dining table: at least this much of its edge (m; 0.6 is the least anyone lays a
 *  place in, 0.7 a comfortable one) … */
export const DINE_PLACE = 0.6;
/** … and a table this long or longer seats one at each end too, where the room behind allows. */
export const DINE_ENDS = 1.4;
/** Chairs along each long side of a table `w` long: a place per ~0.7 m of its edge, never less than
 *  DINE_PLACE each (1.2–2.0 m: two a side; 2.1 m: three). */
export const placesAlong = (w: number) => Math.max(1, Math.min(Math.floor(w / DINE_PLACE + 1e-6), Math.floor((w + 0.2) / 0.7 + 1e-6)));
/** A hall runner's colours: its border, its figure (pinstripe, diamonds), its field. */
const RUNNERS: [number, number, number][] = [[0x8c2f2a, 0xe9dcc0, 0xc9a27a], [0x2f4a6a, 0xe9dcc0, 0xb8c4c9], [0x3d5a46, 0xefe3c4, 0xc7b48a], [0x6a2a3a, 0xe0c9a0, 0xb48a6a], [0x34322f, 0xd9c7a0, 0x9fb3a5]];

type SideKey = 'u0' | 'u1' | 'v0' | 'v1';
/** One side of a room: its line, which way is out, the face furniture backs onto, and where along
 *  it there's solid wall (or facade) and where doorways. */
interface Side { key: SideKey; run: 0 | 1; at: number; out: -1 | 1; face: number; lo: number; hi: number; ext: boolean; solid: [number, number][]; doors: [number, number][] }
/** A placement: the piece's rect, its centre, its x axis (its back, +z, faces the wall it's on). */
export interface Put { r: Rect; uc: number; vc: number; ax: P2; side?: Side; s0: number; s1: number }

const hitR = (a: Rect, b: Rect) => a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
const grow = (r: Rect, m: number): Rect => ({ u0: r.u0 - m, u1: r.u1 + m, v0: r.v0 - m, v1: r.v1 + m });
/** The piece x axis for a piece backing onto a side (its +z toward the wall: a proper rotation). */
const axFor = (k: SideKey): P2 => (k === 'v1' ? [1, 0] : k === 'v0' ? [-1, 0] : k === 'u1' ? [0, -1] : [0, 1]);
/** The piece x axis for a piece whose front (−z) looks along `face`. */
export const axFacing = (face: P2): P2 => [-face[1], face[0]];

export class Furnisher {
  readonly d: Draw;
  readonly LP: LocalPoly;
  private plates: { from: number; LP: LocalPoly; M: WinModel }[];
  readonly M: WinModel;
  lights: Light[] = [];
  npcs: NpcSpot[] = [];
  /** The spaces whose kitchen is fitted (one run a space). */
  readonly kitchens = new Set<number>();
  private claims: Rect[][];
  private keepOut: Rect[][];
  readonly use: ReturnType<typeof useOf>;
  readonly wood: number;
  readonly doorHex: number;
  /** (`rng`: a tall building's is reseeded room by room — interiors.ts — so each storey's
   *  furniture is its own, whichever storeys are built with it) */
  constructor(readonly P: Plan, readonly fp: Footprint, readonly L: Layout, readonly m: Mesher, readonly inst: Instancer, public rng: Rng, leaves: LeafSpot[], readonly ceil: (k: number) => number) {
    this.d = new Draw(P, m);
    this.LP = new LocalPoly(P.loc);
    this.M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
    this.plates = (P.plates ?? []).map((p) => ({ from: p.from, LP: new LocalPoly(p.loc), M: { ...this.M, eave: p.eave, glass: !!p.glass } }));
    this.use = fp.kind === 'commercial' ? useOf(fp.name, fp.use) : 'unknown';
    this.wood = WOOD[Math.floor(rng.float() * WOOD.length)];
    this.doorHex = rng.float() < 0.6 ? 0xf2efe6 : this.wood;
    this.claims = Array.from({ length: P.levels }, () => []);
    this.keepOut = Array.from({ length: P.levels }, () => []);
    for (const F of P.flights) {
      this.keepOut[F.level]?.push(grow(F, 0.25));
      if (F.level + 1 < P.levels) this.keepOut[F.level + 1].push(grow(F, 0.25));
      // the landing at a straight flight's head and the step off at its foot
      const dir = Math.sign(F.topU - F.bottomU) || 1;
      if (!F.lo && (F.hi ?? 1) > 0.99) {
        const foot = F.axis ? { ...F, v0: Math.min(F.bottomU, F.bottomU - dir * 1.0), v1: Math.max(F.bottomU, F.bottomU - dir * 1.0) } : { ...F, u0: Math.min(F.bottomU, F.bottomU - dir * 1.0), u1: Math.max(F.bottomU, F.bottomU - dir * 1.0) };
        this.keepOut[F.level].push(grow(foot, 0.1));
        if (F.level + 1 < P.levels) {
          const head = F.axis ? { ...F, v0: Math.min(F.topU, F.topU + dir * 1.0), v1: Math.max(F.topU, F.topU + dir * 1.0) } : { ...F, u0: Math.min(F.topU, F.topU + dir * 1.0), u1: Math.max(F.topU, F.topU + dir * 1.0) };
          this.keepOut[F.level + 1].push(grow(head, 0.1));
        }
      }
    }
    for (const Lg of P.landings) { this.keepOut[Lg.level]?.push(grow(Lg, 0.3)); if (Lg.level + 1 < P.levels) this.keepOut[Lg.level + 1].push(grow(Lg, 0.3)); }
    for (const H of P.holes) this.keepOut[H.level]?.push(grow(H, 0.3));
    // doorways: a swing's worth either side (a leaf's width and a hand), and the leaf standing open
    for (const dw of L.doors) {
      const sw = Math.min(1.0, Math.max(0.9, dw.w + 0.1));
      const z = dw.ax === 0 ? { u0: dw.t - dw.w / 2 - 0.15, u1: dw.t + dw.w / 2 + 0.15, v0: dw.c - sw, v1: dw.c + sw } : { u0: dw.c - sw, u1: dw.c + sw, v0: dw.t - dw.w / 2 - 0.15, v1: dw.t + dw.w / 2 + 0.15 };
      this.keepOut[dw.level]?.push(z);
    }
    for (const lf of leaves) {
      const r = lf.ax === 0 ? { u0: lf.hinge - 0.06, u1: lf.hinge + 0.06, v0: Math.min(lf.c, lf.c + lf.side * (lf.w + 0.1)), v1: Math.max(lf.c, lf.c + lf.side * (lf.w + 0.1)) } : { u0: Math.min(lf.c, lf.c + lf.side * (lf.w + 0.1)), u1: Math.max(lf.c, lf.c + lf.side * (lf.w + 0.1)), v0: lf.hinge - 0.06, v1: lf.hinge + 0.06 };
      this.keepOut[lf.level]?.push(r);
    }
    // the front door's swing, and the way in from it (where you stand as you step inside)
    this.keepOut[0]?.push({ u0: P.ud - 0.2, u1: P.ud + 1.7, v0: P.vd - 1.2, v1: P.vd + 1.2 }, { u0: P.ud, u1: P.ud + 2.8, v0: P.vd - 0.55, v1: P.vd + 0.55 });
  }
  f(k: number) { return this.P.floor0 + k * this.P.floorH; }
  /** Storey k's outline and window model: the footprint's, or its tier's (a tower's storeys). */
  lp(k: number) { let o = this.LP; for (const p of this.plates) if (p.from <= k) o = p.LP; return o; }
  wm(k: number) { let o = this.M; for (const p of this.plates) if (p.from <= k) o = p.M; return o; }
  claim(k: number, r: Rect) { this.claims[k]?.push(r); }
  /** The floor storey k's furniture stands on (all it claimed). */
  taken(k: number): readonly Rect[] { return this.claims[k] ?? []; }
  /** A tall building's lift doors on the storeys built: each car's two leaves, as instances of the
   *  'liftLeaf' piece (a ride slides them: interiors.ts liftDoor). */
  liftLeaves: { lift: number; car: number; level: number; side: -1 | 1; idx: number }[] = [];
  freeAt(k: number, r: Rect) {
    for (const K of this.keepOut[k] ?? []) if (hitR(K, r)) return false;
    for (const K of this.claims[k] ?? []) if (hitR(K, r)) return false;
    return true;
  }
  glow(u: number, v: number, y: number, w: number, night = false) { const p = this.d.W(u, v); this.lights.push({ x: p[0], y, z: p[1], w, ...(night ? { n: 1 as const } : {}) }); }
  pick<T>(a: readonly T[]) { return a[Math.floor(this.rng.float() * a.length)]; }
  private sideMemo = new Map<number, Side[]>();
  /** The sides of a room: walls (with their doorways) from the layout, facade where it's outside. */
  sides(R: Room): Side[] {
    let out = this.sideMemo.get(R.id);
    if (!out) this.sideMemo.set(R.id, (out = this.sidesOf(R)));
    return out;
  }
  /** Has the room a window (in a facade side of it, on its storey)? */
  windowed(R: Room) { return this.sides(R).some((S) => S.ext && this.onWindows(S, S.lo, S.hi, R.level)); }
  private sidesOf(R: Room): Side[] {
    const P = this.P, out: Side[] = [];
    for (const key of ['u0', 'u1', 'v0', 'v1'] as SideKey[]) {
      const run: 0 | 1 = key[0] === 'v' ? 0 : 1;
      const at = R.r[key], o: -1 | 1 = key[1] === '1' ? 1 : -1;
      const lo = run === 0 ? R.r.u0 : R.r.v0, hi = run === 0 ? R.r.u1 : R.r.v1;
      const mid = (lo + hi) / 2;
      const ext = !this.lp(R.level).inside(run === 0 ? mid : at + o * 0.25, run === 0 ? at + o * 0.25 : mid);
      const solid: [number, number][] = [], doors: [number, number][] = [];
      if (ext) {
        solid.push([lo, hi]);
        // the front door is on the facade
        if (R.level === 0) {
          const dAt = run === 0 ? P.vd : P.ud, dAlong = run === 0 ? P.ud : P.vd;
          if (Math.abs(dAt - at) < 0.3 && dAlong > lo && dAlong < hi) doors.push([dAlong - P.door.w / 2 - 0.2, dAlong + P.door.w / 2 + 0.2]);
        }
      } else {
        for (const w of this.L.walls) {
          if (w.level !== R.level || w.ax !== run || Math.abs(w.c - at) > 0.03 || !w.rooms.includes(R.id)) continue;
          let s = Math.max(lo, w.a);
          const e = Math.min(hi, w.b);
          for (const [g0, g1] of w.gaps) {
            if (g0 > s) solid.push([s, Math.min(g0, e)]);
            if (g1 > lo && g0 < hi) doors.push([g0, g1]);
            s = Math.max(s, g1);
          }
          if (e > s) solid.push([s, e]);
        }
      }
      // (one wall surface on this side, though rooms of two spaces may lie behind it: their stretches join)
      solid.sort((x, y) => x[0] - y[0]);
      for (let i = solid.length - 1; i > 0; i--) if (solid[i][0] - solid[i - 1][1] < 0.03) { solid[i - 1] = [solid[i - 1][0], Math.max(solid[i - 1][1], solid[i][1])]; solid.splice(i, 1); }
      out.push({ key, run, at, out: o, face: at - o * (ext ? 0.14 : 0.06), lo, hi, ext, solid: solid.filter(([a, b]) => b - a > 0.2), doors });
    }
    return out;
  }
  /** The rect of a piece on side S from s0 to s1 along it, reaching q out from its face. */
  wrect(S: Side, s0: number, s1: number, q0: number, q1: number): Rect {
    const a = S.face - S.out * q0, b = S.face - S.out * q1;
    return S.run === 0 ? { u0: s0, u1: s1, v0: Math.min(a, b), v1: Math.max(a, b) } : { u0: Math.min(a, b), u1: Math.max(a, b), v0: s0, v1: s1 };
  }
  /** A box on side S in its frame (along s, out from the face q). */
  wbox(S: Side, s0: number, s1: number, q0: number, q1: number, y0: number, y1: number, hex: number, part: number = IP.solid) {
    const r = this.wrect(S, s0, s1, q0, q1);
    this.d.box(r.u0, r.u1, r.v0, r.v1, y0, y1, hex, part);
  }
  /** Do the facade's windows overlap [s0, s1] along facade side S on storey k? */
  onWindows(S: Side, s0: number, s1: number, k: number) {
    if (!S.ext) return false;
    const mid = (s0 + s1) / 2, half = (s1 - s0) / 2;
    const [u, v] = S.run === 0 ? [mid, S.at - S.out * 0.5] : [S.at - S.out * 0.5, mid];
    const LP = this.lp(k);
    const h = LP.hit(u, v, S.run === 0 ? 0 : S.out, S.run === 0 ? S.out : 0);
    if (!h || h.t > 2) return false;
    const a = LP.p[h.i], b = LP.p[(h.i + 1) % LP.p.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const W = wallWindows(len, k, this.wm(k));
    if (!W) return false;
    const along = h.s * len;
    for (let i = 0; i < W.n; i++) if (Math.abs(along - (i + 0.5) * W.cellW) < W.half + half + 0.08) return true;
    return false;
  }
  private winMemo = new Map<Side, [number, number][]>();
  /** Where along facade side S (s) a window is, on storey k — each window's stretch with onWindows'
   *  own margin, so a piece clear of these is clear of the glass. An inside wall has none. */
  winsOf(S: Side, k: number): [number, number][] {
    let out = this.winMemo.get(S);
    if (out) return out;
    out = [];
    if (S.ext) {
      let start: number | null = null;
      for (let s = S.lo; s <= S.hi + 1e-6; s += 0.05) {
        const on = this.onWindows(S, s, s, k);
        if (on && start === null) start = s;
        if (!on && start !== null) { out.push([start, s]); start = null; }
      }
      if (start !== null) out.push([start, S.hi]);
    }
    this.winMemo.set(S, out);
    return out;
  }
  /** A spot `w` wide and `dep` deep against one of the room's walls (`sides`: which), clear of its
   *  doorways, the stairs and what's already there; `tall` ones between the windows. */
  against(R: Room, SS: Side[], w: number, dep: number, o: { keys?: SideKey[]; tall?: boolean; noExt?: boolean; tries?: number } = {}): Put | null {
    const cand = SS.filter((S) => (!o.keys || o.keys.includes(S.key)) && !(o.noExt && S.ext) && S.solid.some(([a, b]) => b - a >= w + 0.1));
    if (!cand.length) return null;
    for (let t = 0; t < (o.tries ?? 14); t++) {
      const S = cand[Math.floor(this.rng.float() * cand.length)];
      const ivs = S.solid.filter(([a, b]) => b - a >= w + 0.1);
      const [a, b] = ivs[Math.floor(this.rng.float() * ivs.length)];
      // (clear of the walls at its ends and the doorways' casings)
      const pl = SS.find((x) => x.run !== S.run && x.out < 0), ph = SS.find((x) => x.run !== S.run && x.out > 0);
      const lo = Math.max(a + 0.04, (pl ? pl.face : S.lo) + 0.03), hi = Math.min(b - 0.04, (ph ? ph.face : S.hi) - 0.03);
      if (hi - lo < w) continue;
      const s0 = lo + this.rng.float() * (hi - lo - w), s1 = s0 + w;
      if (S.doors.some(([g0, g1]) => s0 < g1 + 0.2 && s1 > g0 - 0.2)) continue;
      const r = this.wrect(S, s0, s1, 0.01, dep);
      if (!inside(R.r, r) || !this.freeAt(R.level, r)) continue;
      if (o.tall && this.onWindows(S, s0, s1, R.level)) continue;
      return { r, uc: (r.u0 + r.u1) / 2, vc: (r.v0 + r.v1) / 2, ax: axFor(S.key), side: S, s0, s1 };
    }
    return null;
  }
  /** The best spot by `score` (the least) `w` wide and `dep` deep against the room's walls — every
   *  10 cm along every stretch of solid wall — clear of its doorways, the stairs and what's there
   *  already; `tall` ones between the windows. (Where a piece belongs, not wherever it lands: the
   *  console along the hall ahead of the door, the coats beside it.) */
  bestAgainst(R: Room, SS: Side[], w: number, dep: number, score: (p: Put) => number, o: { keys?: SideKey[]; tall?: boolean; noExt?: boolean; off?: number } = {}): Put | null {
    let best: Put | null = null, bs = Infinity;
    for (const S of SS) {
      if ((o.keys && !o.keys.includes(S.key)) || (o.noExt && S.ext)) continue;
      const pl = SS.find((x) => x.run !== S.run && x.out < 0), ph = SS.find((x) => x.run !== S.run && x.out > 0);
      for (const [a, b] of S.solid) {
        const lo = Math.max(a + 0.04, (pl ? pl.face : S.lo) + 0.03), hi = Math.min(b - 0.04, (ph ? ph.face : S.hi) - 0.03);
        for (let s0 = lo; s0 + w <= hi + 1e-6; s0 += 0.1) {
          const s1 = s0 + w;
          if (S.doors.some(([g0, g1]) => s0 < g1 + 0.2 && s1 > g0 - 0.2)) continue;
          const r = this.wrect(S, s0, s1, o.off ?? 0.01, dep);
          if (!inside(R.r, r) || !this.freeAt(R.level, r) || (o.tall && this.onWindows(S, s0, s1, R.level))) continue;
          const p: Put = { r, uc: (r.u0 + r.u1) / 2, vc: (r.v0 + r.v1) / 2, ax: axFor(S.key), side: S, s0, s1 };
          const sc = score(p);
          if (sc < bs) (bs = sc), (best = p);
        }
      }
    }
    return best;
  }
  /** A free spot `w` × `dep` (along u × along v) anywhere in the room, `m` clear of its walls. */
  anywhere(R: Room, w: number, dep: number, m = 0.45, tries = 12): Put | null {
    const r0 = R.r;
    for (let t = 0; t < tries; t++) {
      const u0 = r0.u0 + m + this.rng.float() * Math.max(0, r0.u1 - r0.u0 - w - 2 * m), v0 = r0.v0 + m + this.rng.float() * Math.max(0, r0.v1 - r0.v0 - dep - 2 * m);
      const r = { u0, u1: u0 + w, v0, v1: v0 + dep };
      if (!inside(r0, r, 0.1) || !this.lp(R.level).rectIn(r.u0, r.u1, r.v0, r.v1, 0.05) || !this.freeAt(R.level, r)) continue;
      return { r, uc: u0 + w / 2, vc: v0 + dep / 2, ax: [1, 0], s0: u0, s1: u0 + w };
    }
    return null;
  }
  /** A repeated piece (instanced), its x along ax (stretched sx times along it). */
  put(key: string, make: () => D.DecorPart[], uc: number, vc: number, y: number, ax: P2, tint = 0xffffff, sx = 1) { return this.inst.put(key, make, uc, vc, y, ax, tint, sx); }
}
const inside = (outer: Rect, r: Rect, m = 0.02) => r.u0 >= outer.u0 - m && r.u1 <= outer.u1 + m && r.v0 >= outer.v0 - m && r.v1 <= outer.v1 + m;

/** A kitchen's run as planned: where it stands (the Put along its wall) and what's in it. */
export interface KitchenPlan { put: Put; spec: D.KitchenSpec; score: number }
/** What a run of length L holds, laid out in the piece's own x (−L/2 … L/2) round the windows over
 *  it (`gaps`, to 5 cm): the fridge at an end — a run without windows keeps it on its left, so a
 *  mirrored flat's kitchen is the same piece turned round — or none in it; the cooker on solid wall,
 *  the sink under a window where it fits beside the cooker; best first by score (the least), with
 *  the wall cabinets' metres. */
interface RunLayout { spec: D.KitchenSpec; score: number; wallM: number; under: boolean }
const RUN_MEMO = new Map<string, RunLayout[]>();
function runLayouts(L: number, gaps: [number, number][]): RunLayout[] {
  const key = `${L.toFixed(2)}|${gaps.map(([a, b]) => `${a.toFixed(2)}~${b.toFixed(2)}`).join(',')}`;
  let out = RUN_MEMO.get(key);
  if (out) return out;
  out = [];
  const FW = D.FRIDGE_W, CW = D.COOKER_W, x0 = -L / 2, x1 = L / 2;
  const clear = (a: number, b: number) => !gaps.some(([g0, g1]) => a < g1 && b > g0);
  const round = (x: number) => Math.round(x * 20) / 20;
  for (const fe of [-1, 1, 0] as const) {
    if (fe > 0 && !gaps.length) continue;
    if (fe && (L - FW < 1.3 || (fe < 0 ? !clear(x0, x0 + FW + 0.05) : !clear(x1 - FW - 0.05, x1)))) continue;
    const b0 = fe < 0 ? x0 + FW + 0.02 : x0, b1 = fe > 0 ? x1 - FW - 0.02 : x1;
    // the cooker: a 60 cm slot on solid wall, a worktop either side of it where it can (and between
    // it and the fridge: a small kitchen's may stand beside it)
    let rc: number | null = null, rs = Infinity, sink = (b0 + b1) / 2, under = false;
    for (let c = b0 + CW / 2; c <= b1 - CW / 2 + 1e-6; c += 0.05) {
      if (!clear(c - CW / 2 - 0.03, c + CW / 2 + 0.03)) continue;
      // the sink: under a window's middle where it fits beside the cooker, else across from it
      let sk = NaN, uw = false;
      for (const [w0, w1] of gaps) {
        const m = Math.max(b0 + 0.33, Math.min(b1 - 0.33, (Math.max(w0, b0) + Math.min(w1, b1)) / 2));
        if (Math.abs(m - c) >= CW / 2 + 0.28 + 0.15 && m - 0.28 < w1 && m + 0.28 > w0) { sk = m; uw = true; break; }
      }
      if (!uw) sk = c - b0 > b1 - c ? Math.max(b0 + 0.33, c - CW / 2 - 0.5) : Math.min(b1 - 0.33, c + CW / 2 + 0.5);
      if (Math.abs(sk - c) < CW / 2 + 0.28 + 0.05) continue;
      const side = Math.min(c - CW / 2 - b0, b1 - c - CW / 2), byFridge = (fe < 0 ? c - CW / 2 - b0 : fe > 0 ? b1 - c - CW / 2 : 1) < 0.3;
      const sc = (uw ? -0.6 : 0) + (side < 0.3 ? 0.6 : 0) + (byFridge ? 0.5 : 0) + (Math.abs(sk - c) - CW / 2 - 0.28 < 0.4 ? 0.4 : 0) + Math.abs(c - (b0 + b1) / 2) * 0.05;
      if (sc < rs - 1e-9) (rs = sc), (rc = c), (sink = sk), (under = uw);
    }
    if (rc === null) {
      // (no solid stretch for the cooker: it goes on a wall of its own; the sink under a window)
      rs = 3;
      const w = gaps.find(([w0, w1]) => w1 > b0 + 0.3 && w0 < b1 - 0.3);
      sink = w ? Math.max(b0 + 0.33, Math.min(b1 - 0.33, (w[0] + w[1]) / 2)) : (b0 + b1) / 2;
      under = !!w;
    }
    const spec: D.KitchenSpec = { len: round(L), sink: round(sink), range: rc === null ? null : round(rc), fridge: fe, gaps: gaps.map(([a, b]) => [round(a), round(b)]) };
    // the wall cabinets: over the base run's solid wall, less the hood; and the one over the fridge
    const wallM = D.wallCabinets(spec, true).reduce((t, [a, b]) => t + b - a, 0);
    const score = -L * 0.8 - Math.min(wallM, 2.4) * 0.5 + (fe ? 0 : 2.5) + rs + (wallM < 0.6 ? 3 : 0) + (under ? -0.3 : 0);
    out.push({ spec, score, wallM, under });
  }
  out.sort((a, b) => a.score - b.score);
  if (RUN_MEMO.size > 4096) RUN_MEMO.clear();
  RUN_MEMO.set(key, out);
  return out;
}
/** Where a home's kitchen goes (review round 11: "a sink run, with no range, fridge or wall
 *  cabinets"): along the wall that holds the most of a real one — a run of base units 1.5–3.9 m long
 *  with the fridge at one end and the cooker set in, both on solid wall (a tall fridge or a hood never
 *  stands in a window), the sink under the window where the run passes one, and wall cabinets over
 *  the rest of the solid wall (runLayouts). From each end of every stretch of wall and every 40 cm
 *  between, the longest run it takes and a few shorter; the best by its score (the least), the far
 *  end of the room from the door you come in by preferred. Null: no wall takes even a short run. */
function planKitchen(F: Furnisher, R: Room, SS: Side[], maxL: number, away: P2): KitchenPlan | null {
  const k = R.level;
  let best: KitchenPlan | null = null;
  for (const S of SS) {
    const pl = SS.find((x) => x.run !== S.run && x.out < 0), ph = SS.find((x) => x.run !== S.run && x.out > 0);
    const wins = F.winsOf(S, k), ax = axFor(S.key), dir = S.run === 0 ? ax[0] : ax[1];
    for (const [a, b] of S.solid) {
      const lo = Math.max(a + 0.04, (pl ? pl.face : S.lo) + 0.03), hi = Math.min(b - 0.04, (ph ? ph.face : S.hi) - 0.03);
      // (a house's run to its wall in 30 cm steps; a block's flats in 60 cm, so their kitchens are a
      // few pieces, instanced)
      const st = F.fp.kind === 'house' ? 0.3 : 0.6, top = Math.floor(Math.min(maxL, hi - lo) / st + 1e-6) * st;
      const Ls = [...new Set([top, top - st, top - 2 * st, 2.4, 1.8, 1.5].map((L) => Math.round(L * 10) / 10))].filter((L) => L <= top + 1e-6 && L >= 1.5 - 1e-6);
      for (const L of Ls) {
        // (no run this short can beat the best found: L's share of the score bounds it)
        if (best && -L * 0.8 - 1.2 - 0.6 - 0.3 - 0.4 >= best.score) continue;
        const starts = new Set([lo, hi - L]);
        for (let s = lo + 0.4; s < hi - L; s += 0.4) starts.add(s);
        for (const s0 of starts) {
          const s1 = s0 + L;
          if (S.doors.some(([g0, g1]) => s0 < g1 + 0.2 && s1 > g0 - 0.2)) continue;
          const r = F.wrect(S, s0, s1, 0.02, 0.64); // (a hair off the wall: what the stair keeps clear behind it may touch its face)
          if (!inside(R.r, r) || !F.freeAt(k, r)) continue;
          // the windows over this run, in its own x (to 5 cm, out)
          const sc0 = (s0 + s1) / 2, lx = (x: number) => dir * (x - sc0);
          const gaps = wins.filter(([w0, w1]) => w0 < s1 && w1 > s0).map(([w0, w1]): [number, number] => {
            const x0 = lx(Math.max(w0, s0)), x1 = lx(Math.min(w1, s1));
            return [Math.floor(Math.min(x0, x1) * 20) / 20, Math.ceil(Math.max(x0, x1) * 20) / 20];
          }).sort((p, q2) => p[0] - q2[0]);
          const lay = runLayouts(L, gaps)[0];
          if (!lay) continue;
          // (the kitchen at the room's far end from the door you came in by, as kitchens are)
          const far = Math.hypot((r.u0 + r.u1) / 2 - away[0], (r.v0 + r.v1) / 2 - away[1]);
          const score = lay.score - Math.min(far, 8) * 0.05;
          if (best && score >= best.score - 1e-9) continue;
          best = { put: { r, uc: (r.u0 + r.u1) / 2, vc: (r.v0 + r.v1) / 2, ax, side: S, s0, s1 }, spec: lay.spec, score };
        }
      }
    }
  }
  return best;
}

// the yaw that turns a resident (front = local −z) to face (du, dv) in the u/v frame
const yawTo = (du: number, dv: number) => Math.atan2(-du, -dv);
const q = (x: number, s = 0.1) => Math.round(x / s) * s;

/** A tall building's lifts on storey k: each car's landing doors in the opening in its shaft's
 *  face — the frame, and the two leaves (their own pieces: a ride slides them, and they're noted in
 *  F.liftLeaves) — the call panel beside them (the lobby in front is whichever room it is: a
 *  tower's lift lobby, a block's stair landing, the open floor). */
export function furnishLifts(F: Furnisher, k: number) {
  const P = F.P, y = F.f(k);
  (P.lifts ?? []).forEach((L, li) => {
    const { row, fc, out, along } = liftCars(L);
    // (the pieces' backs to the shaft: the wall on the lobby's side facing it)
    const ax = axFor(L.face === 0 ? 'u1' : L.face === 1 ? 'u0' : L.face === 2 ? 'v1' : 'v0');
    const at = (s: number, cc: number): P2 => (row ? [cc, s] : [s, cc]);
    along.forEach((s, i) => {
      const [u, v] = at(s, fc + out * 0.11);
      F.put('liftFrame', () => D.liftFrame(LIFT_DOOR), u, v, y, ax);
      for (const side of [-1, 1] as const) {
        const [lu, lv] = at(s + side * 0.28, fc);
        F.liftLeaves.push({ lift: li, car: i, level: k, side, idx: F.put('liftLeaf', () => D.liftLeaf(0.56), lu, lv, y, ax) });
      }
    });
    const a0 = row ? L.r.v0 : L.r.u0, a1 = row ? L.r.v1 : L.r.u1;
    const s0 = along[0] - 0.85, s1 = along[along.length - 1] + 0.85;
    const sb = s0 > a0 + 0.1 ? s0 : s1 < a1 - 0.1 ? s1 : along.length > 1 ? (along[0] + along[1]) / 2 : null;
    if (sb !== null) { const [u, v] = at(sb, fc + out * 0.07); F.put('liftButton', () => D.liftButton(), u, v, y, ax); }
    // (the way out of the doors stays clear)
    const c1 = fc + out * 1.4;
    F.claim(k, row ? { u0: Math.min(fc, c1), u1: Math.max(fc, c1), v0: a0, v1: a1 } : { u0: a0, u1: a1, v0: Math.min(fc, c1), v1: Math.max(fc, c1) });
  });
}

/** Skirting round a room: 12 cm of trim white along every stretch of its walls — the facade's inside
 *  and each face of its partitions — from wall to wall, stopping at its doorways (their casings
 *  take it). One stretched piece, instanced: a thousand rooms of it cost one draw. */
export function skirtRoom(F: Furnisher, R: Room) {
  if (R.type === 'shaft' || R.type === 'void') return;
  const y = F.f(R.level), SS = F.sides(R);
  for (const S of SS) {
    const pl = SS.find((x) => x.run !== S.run && x.out < 0), ph = SS.find((x) => x.run !== S.run && x.out > 0);
    const lo = pl ? pl.face : S.lo, hi = ph ? ph.face : S.hi;
    let segs: [number, number][] = S.solid.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]);
    for (const [g0, g1] of S.doors) segs = segs.flatMap(([a, b]) => (b <= g0 || a >= g1 ? [[a, b]] : [[a, g0], [g1, b]]) as [number, number][]);
    for (const [a, b] of segs) {
      if (b - a < 0.08) continue;
      const r = F.wrect(S, a, b, 0, 0.018);
      F.put('skirt', () => D.skirting(), (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, y, axFor(S.key), 0xffffff, b - a);
    }
  }
}

/** Furnish one room (a generator: yields between batches in a big one). */
export function* furnishRoom(F: Furnisher, R: Room): Generator<void, void, void> {
  const P = F.P, rng = F.rng, d = F.d, k = R.level, L0 = F.L;
  if (R.type === 'shaft') return; // (a lift's: nothing in it, nobody sees it)
  const y = F.f(k), cy = F.ceil(k);
  if (R.type === 'void') {
    // a tower's double-height lobby: big lamps hanging from storey 1's ceiling over the void, their
    // light down the lobby's upper walls and the atrium's (a lamp lights its own storey's height)
    const du = R.r.u1 - R.r.u0, dv = R.r.v1 - R.r.v0;
    const nu = Math.max(1, Math.min(3, Math.round(du / 7))), nv = Math.max(1, Math.min(3, Math.round(dv / 7)));
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const u = R.r.u0 + (du * (i + 0.5)) / nu, v = R.r.v0 + (dv * (j + 0.5)) / nv, hy = y + 1.9;
        F.put('pendant', () => D.ceilingLight(0.9, 0.9, 0.16), u, v, hy, [1, 0]);
        d.box(u - 0.012, u + 0.012, v - 0.012, v + 0.012, hy + 0.16, cy, 0x3a3a3c);
        F.glow(u, v, hy + 0.1, 1.6);
      }
    return;
  }
  const S = F.sides(R);
  const area = (R.r.u1 - R.r.u0) * (R.r.v1 - R.r.v0);
  const fab = F.pick(FABRIC), wood = rng.float() < 0.5 ? F.wood : F.pick(WOOD);
  const homey = ['living', 'bed', 'dining', 'kitchen', 'study', 'great', 'hall', 'landing', 'guest'].includes(R.type);
  const um = (R.r.u0 + R.r.u1) / 2, vm = (R.r.v0 + R.r.v1) / 2;
  const house = F.fp.kind === 'house';
  // ---- light: a ceiling fan in a beach house's rooms, else a glowing dish (none over the stairs). A
  // home's is a glass dome: lit after dark in a room with windows, all day in one without (a hall) ----
  const home = house || R.unit >= 0;
  const dark = home && !F.windowed(R); // (a windowless room keeps its light on)
  const lightAt = (u: number, v: number, fan: boolean, w = 1) => {
    if (P.holes.some((H) => H.level === k && hitR(grow(H, 0.3), { u0: u, u1: u, v0: v, v1: v })) || P.flights.some((G) => G.level === k && hitR(G, { u0: u, u1: u, v0: v, v1: v }))) return;
    if (k === 0 && P.atrium && hitR(grow(P.atrium, 0.3), { u0: u, u1: u, v0: v, v1: v })) return; // (the double-height lobby's own lamps hang from storey 1)
    if (fan) F.put(`fan:${WOOD.indexOf(F.wood)}`, () => D.ceilingFan(F.wood), u, v, cy - 0.45, [1, 0]);
    else if (home) F.put(dark ? 'dome' : 'dome:n', () => D.ceilingDome(0.17, dark ? 'glow' : 'lamp'), u, v, cy - 0.12, [1, 0]);
    else F.put('dish', () => D.ceilingLight(0.4, 0.4, 0.1), u, v, cy - 0.12, [1, 0]);
    F.glow(u, v, cy - 0.35, w, home && !dark);
  };
  /** A hall's (or a landing's) way along, beside its stair: where its lights hang and its runner lies. */
  const passage = (): Rect => {
    const ln = P.lane && (R.type === 'hall' || R.type === 'landing') && hitR(grow(P.lane, 0.05), R.r) ? P.lane : null;
    if (!ln) return R.r;
    return (ln.v0 + ln.v1) / 2 < vm ? { ...R.r, v0: Math.min(R.r.v1 - 0.6, Math.max(R.r.v0, ln.v1 + 0.05)) } : { ...R.r, v1: Math.max(R.r.v0 + 0.6, Math.min(R.r.v1, ln.v0 - 0.05)) };
  };
  const beachy = house && (F.fp.seed * 7.3) % 1 < 0.6;
  // ---- the kit ----
  const rug = (r: Rect) => {
    const style = Math.floor(rng.float() * 4) + 0.1 + Math.floor(rng.float() * FABRIC.length) * 10;
    d.flatQuad(r.u0, r.u1, r.v0, r.v1, y + 0.012, F.pick(FABRIC), IP.rug, style);
  };
  const lamp = (u: number, v: number, yy: number, floorLamp: boolean) => {
    F.put(floorLamp ? 'lampF' : 'lampT', () => D.lamp(floorLamp), u, v, yy, [1, 0]);
    F.glow(u, v, yy + (floorLamp ? 1.35 : 0.4), 0.55);
  };
  const plant = (u: number, v: number, big: boolean) => {
    const vi = Math.floor(rng.float() * 3);
    F.put(`plant:${big ? 1 : 0}:${vi}`, () => D.pottedPlant(big, [0x5f8a45, 0x4d7a3a, 0x6f9a50][vi], [0xa86a4a, 0xe9e4d6, 0x5a6a78][vi]), u, v, y, [1, 0]);
  };
  const art = (Sd: Side, s: number, yy: number, w: number, h: number) => {
    const frameC = rng.float() < 0.5 ? 0x3a2e24 : 0xe9e2d0;
    F.wbox(Sd, s - w / 2 - 0.05, s + w / 2 + 0.05, 0, 0.035, yy - 0.05, yy + h + 0.05, frameC);
    const r = F.wrect(Sd, s - w / 2, s + w / 2, 0.04, 0.04);
    const style = rng.float() * 0.999 + Math.floor(rng.float() * 5);
    const a = Sd.run === 0 ? d.W(r.u0, r.v0) : d.W(r.u0, r.v0), b = Sd.run === 0 ? d.W(r.u1, r.v0) : d.W(r.u0, r.v1);
    const n = Sd.run === 0 ? [-Sd.out * P.vx, 0, -Sd.out * P.vz] : [-Sd.out * P.ux, 0, -Sd.out * P.uz];
    F.m.part(IP.art).color(0xffffff);
    F.m.quad([a[0], yy, a[1]], [b[0], yy, b[1]], [b[0], yy + h, b[1]], [a[0], yy + h, a[1]], n, [[0, 0, style, 1], [1, 0, style, 1], [1, 1, style, 1], [0, 1, style, 1]]);
  };
  const wallArt = (n: number) => {
    for (let i = 0; i < n; i++) {
      const w = 0.5 + rng.float() * 0.6, h = w * (0.6 + rng.float() * 0.4);
      const p = F.against(R, S, w + 0.1, 0.4, { tall: true, tries: 6 });
      if (!p || !p.side) continue;
      art(p.side, (p.s0 + p.s1) / 2, y + 1.45, w, h);
      F.claim(k, grow(F.wrect(p.side, p.s0, p.s1, 0, 0.12), 0));
    }
  };
  const chair = (u: number, v: number, face: P2, hex: number) => F.put('chair', () => D.chair(0xffffff), u, v, y, axFacing(face), hex);
  const table = (r: Rect, h: number, hex: number) => {
    const w = q(r.u1 - r.u0), dd = q(r.v1 - r.v0);
    F.put(`table:${w.toFixed(1)}x${dd.toFixed(1)}x${h}`, () => D.table(w, dd, h, 0xffffff), (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, y, [1, 0], hex);
  };
  const sofa = (p: Put, w = 2.1) => {
    F.put(w > 2 ? 'sofa' : `sofa:${w}`, () => D.sofa(w, 0.92, 0xffffff), p.uc, p.vc, y, p.ax, fab);
    // on the cushion, hips forward of the back cushions (the seated pose's hips sit 0.45 up)
    const inw: P2 = [-p.ax[1] * -1, p.ax[0] * -1]; // −z of the piece: out of the wall
    F.npcs.push([p.uc + inw[0] * 0.08, p.vc + inw[1] * 0.08, y, yawTo(inw[0], inw[1]), 0.47]);
  };
  const out = (p: Put): P2 => [p.ax[1], -p.ax[0]]; // the direction a wall piece faces (into the room)
  const living = (withKitchen: boolean) => {
    // (a cottage's front door opens into this room: coats by the door, and the sofa along a side
    // wall a few steps in, where it's the first thing you see)
    const entry = k === 0 && R.r.u0 - 0.01 <= P.ud + 0.35 && R.r.u1 + 0.01 >= P.ud + 0.35 && R.r.v0 - 0.01 <= P.vd && R.r.v1 + 0.01 >= P.vd;
    // (a three-seater, else a loveseat where the walls between the doors are short; then the coats,
    // by the door, wherever the sofa left a wall)
    let sp: Put | null = null, sw = 2.1;
    for (const w of [2.1, 1.7, 1.5]) {
      sp = entry
        ? F.bestAgainst(R, S, w, 0.95, (p) => Math.abs(p.uc - P.ud - 3.6) + (p.side!.run === 0 ? 0 : 1.5) + (p.side!.ext ? 0.4 : 0))
        : F.against(R, S, w, 0.95, { noExt: rng.float() < 0.5 });
      if (sp) { sw = w; break; }
    }
    if (sp) F.claim(k, sp.r);
    if (entry) coats();
    if (sp) {
      sofa(sp, sw);
      const o = out(sp);
      // a coffee table in front, a rug under both, a lamp on a side table
      const tc: P2 = [sp.uc + o[0] * 0.95, sp.vc + o[1] * 0.95];
      const tr = Math.abs(o[0]) > 0.5 ? { u0: tc[0] - 0.25, u1: tc[0] + 0.25, v0: tc[1] - 0.6, v1: tc[1] + 0.6 } : { u0: tc[0] - 0.6, u1: tc[0] + 0.6, v0: tc[1] - 0.25, v1: tc[1] + 0.25 };
      if (F.freeAt(k, tr) && inside(R.r, tr)) { table(tr, 0.42, wood); F.claim(k, tr); }
      const rr = grow({ u0: Math.min(sp.r.u0, tr.u0), u1: Math.max(sp.r.u1, tr.u1), v0: Math.min(sp.r.v0, tr.v0), v1: Math.max(sp.r.v1, tr.v1) }, 0.25);
      if (inside(R.r, rr, -0.1)) rug(rr);
      const side = sp.side!;
      const s2 = sp.s1 + 0.1;
      if (s2 + 0.45 < side.hi - 0.1 && !side.doors.some(([g0, g1]) => s2 < g1 && s2 + 0.45 > g0)) {
        const r2 = F.wrect(side, s2, s2 + 0.45, 0.02, 0.47);
        if (F.freeAt(k, r2)) { table(r2, 0.55, wood); lamp((r2.u0 + r2.u1) / 2, (r2.v0 + r2.v1) / 2, y + 0.55, false); F.claim(k, r2); }
      }
      // the TV on the wall across
      const across = S.filter((x) => x.run === side.run && x.key !== side.key).map((x) => x.key);
      const tv = F.against(R, S, 1.5, 0.45, { keys: across, tall: true });
      if (tv && tv.side) {
        F.claim(k, tv.r);
        F.wbox(tv.side, tv.s0, tv.s1, 0.01, 0.45, y, y + 0.5, wood, IP.wood);
        F.wbox(tv.side, tv.s0 + 0.1, tv.s1 - 0.1, 0.06, 0.12, y + 0.55, y + 1.15, 0x1c1d22, IP.glass);
      }
    }
    const bc = F.against(R, S, 1.0, 0.36, { tall: true });
    if (bc) { const bi = rng.u32() % 3; F.claim(k, bc.r); F.put(`books:${bi}`, () => D.bookcase(1.0, 11 + bi, FABRIC), bc.uc, bc.vc, y, bc.ax, wood); }
    // (the room the front door opens on keeps the view through it: nothing free-standing on the line
    // from the door to its far end, where an armchair's back would hide the rest of the room)
    const through: Rect | null = entry ? { u0: P.ud, u1: R.r.u1, v0: P.vd - 0.6, v1: P.vd + 0.6 } : null;
    const free = (w: number, dep: number, m: number) => {
      for (let t = 0; t < (through ? 4 : 1); t++) {
        const c = F.anywhere(R, w, dep, m);
        if (c && !(through && hitR(through, c.r))) return c;
      }
      return null;
    };
    const pl = free(0.5, 0.5, 0.2);
    if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); }
    const ac = free(0.85, 0.85, 0.5);
    if (ac) {
      F.claim(k, grow(ac.r, 0.2));
      const face: P2 = [Math.sign(um - ac.uc) || 1, 0];
      F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), ac.uc, ac.vc, y, axFacing(face), F.pick(FABRIC));
      lamp(ac.uc - face[0] * 0.6, ac.vc + 0.35, y, true);
      F.npcs.push([ac.uc + face[0] * 0.04, ac.vc, y, yawTo(face[0], 0), 0.47]);
    }
    if (withKitchen) kitchen(false);
    wallArt(2);
  };
  const kitchen = (dining: boolean) => {
    // a fitted kitchen along the wall that holds the most of one (planKitchen): base units and the
    // worktop, the sink under the window, the cooker under its hood and the fridge on solid wall,
    // wall cabinets over the rest — and what the run couldn't hold on a wall of its own beside it.
    // One a space: a kitchen the stair's wet room cuts in two has it in its biggest part.
    const parts = L0.rooms.filter((x) => x.space === R.space && x.level === k && x.type === R.type);
    const host = parts.reduce((a, b) => (rectArea(b.r) > rectArea(a.r) + 1e-6 ? b : a), parts[0] ?? R);
    if (host.id !== R.id || F.kitchens.has(R.space)) { if (dining) diningSet(area > 12); return; }
    F.kitchens.add(R.space);
    const sideLen = Math.max(...S.flatMap((x) => x.solid.map(([a, b]) => b - a)), 0);
    const len = Math.min(3.9, Math.max(1.5, Math.floor((sideLen - 0.08) / 0.3 + 1e-6) * 0.3));
    const room = (r: Rect) => ({ u0: Math.max(R.r.u0, r.u0), u1: Math.min(R.r.u1, r.u1), v0: Math.max(R.r.v0, r.v0), v1: Math.min(R.r.v1, r.v1) });
    // (away from the door it's entered by: the front door, when it opens into this room's space —
    // a cottage's kitchen is the back of its living room — else the room's own doorway)
    const entryRoom = k === 0 ? L0.rooms.find((x) => x.level === 0 && x.r.u0 - 0.01 <= P.ud + 0.35 && x.r.u1 + 0.01 >= P.ud + 0.35 && x.r.v0 - 0.01 <= P.vd && x.r.v1 + 0.01 >= P.vd) : undefined;
    const dw = L0.doors.find((x) => x.level === k && x.rooms.includes(R.id));
    const from: P2 = entryRoom && entryRoom.space === R.space ? [P.ud, P.vd] : dw ? (dw.ax === 0 ? [dw.t, dw.c] : [dw.c, dw.t]) : [um, vm];
    const plan = planKitchen(F, R, S, len, from);
    const cab = rng.float() < 0.6 ? 0xf2efe6 : F.pick([0x9fb3a5, 0x5f7a8c, 0xd9cbb0]);
    let near: P2 = [um, vm];
    if (plan) {
      const kp = plan.put, sp = plan.spec;
      F.claim(k, kp.r);
      F.put(D.kitchenKey(sp), () => D.kitchen(sp), kp.uc, kp.vc, y, kp.ax, cab);
      near = [kp.uc, kp.vc];
      // the cook at the hob (or the sink)
      const o = out(kp), at = sp.range ?? sp.sink;
      F.npcs.push([kp.uc + o[0] * 0.42 + kp.ax[0] * at, kp.vc + o[1] * 0.42 + kp.ax[1] * at, y, yawTo(-o[0], -o[1])]);
      F.claim(k, room(F.wrect(kp.side!, kp.s0, kp.s1, 0.6, 1.0)));
    }
    // what the run couldn't hold, on solid wall as near it as it goes (round the corner from it,
    // where the floor in front of the run is: an L)
    const nearest = (p: Put) => Math.hypot(p.uc - near[0], p.vc - near[1]);
    const fronts: Rect[] = [];
    /** The best spot in the kitchen's space, as near the run as it goes: its own parts' walls, else
     *  the living room's it's the back of (by its kitchen end). */
    const spot = (w: number, dep: number) => {
      let best: [Put, Room, number] | null = null;
      for (const Q of L0.rooms.filter((x) => x.space === R.space && x.level === k)) {
        const pen = Q.type === R.type ? 0 : 1.5;
        const p = F.bestAgainst(Q, F.sides(Q), w, dep, (x) => nearest(x) + pen, { tall: true, off: 0.02 });
        if (p && (!best || nearest(p) + pen < best[2])) best = [p, Q, nearest(p) + pen];
      }
      return best;
    };
    const within = (Q: Room, r: Rect) => ({ u0: Math.max(Q.r.u0, r.u0), u1: Math.min(Q.r.u1, r.u1), v0: Math.max(Q.r.v0, r.v0), v1: Math.min(Q.r.v1, r.v1) });
    if (!plan || plan.spec.range === null) {
      // the cooker and its hood
      const sp = spot(D.COOKER_W + 0.04, 0.64);
      if (sp) { const [st, Q] = sp; F.claim(k, grow(st.r, 0.02)); fronts.push(within(Q, F.wrect(st.side!, st.s0, st.s1, 0.6, 1.4))); F.put('stove', () => D.stove(), st.uc, st.vc, y, st.ax); }
    }
    if (!plan || plan.spec.fridge === 0) {
      // (a full-size one, else a slim one: a small kitchen's 60 cm fridge)
      for (const fw of [D.FRIDGE_W, 0.6]) {
        const sp = spot(fw + 0.04, 0.68);
        if (!sp) continue;
        const [fr, Q] = sp;
        F.claim(k, grow(fr.r, 0.02));
        fronts.push(within(Q, F.wrect(fr.side!, fr.s0, fr.s1, 0.68, 1.3)));
        F.put(fw === D.FRIDGE_W ? 'fridge' : `fridge:${fw}`, () => D.fridge(fw), fr.uc, fr.vc, y, fr.ax);
        break;
      }
    }
    // (a clear stretch of floor in front of all of it)
    if (plan) F.claim(k, room(F.wrect(plan.put.side!, plan.put.s0, plan.put.s1, 0.6, 1.5)));
    for (const f of fronts) F.claim(k, f);
    if (dining) diningSet(area > 12);
  };
  const diningSet = (big: boolean) => {
    // (the table along the room's longer way where it fits, else across it; a smaller one, else none.
    // A cottage's kitchen eats into the living room in front of it — one space — when it's shallow)
    const open = L0.rooms.find((q) => q.id !== R.id && q.level === k && q.space === R.space && Math.abs(q.r.u1 - R.r.u0) < 0.02 && q.r.v0 <= R.r.v0 + 0.02 && q.r.v1 >= R.r.v1 - 0.02);
    const RD: Room = open ? { ...R, r: { ...R.r, u0: Math.max(open.r.u0, R.r.u0 - 1.6) } } : R;
    const alongU = RD.r.u1 - RD.r.u0 >= RD.r.v1 - RD.r.v0;
    let tp: Put | null = null, w = 1.2, rotU = true;
    // (first with room at its ends for a chair each and a hand behind it, then without)
    const L1 = big ? 1.8 : 1.2, endPad = L1 >= DINE_ENDS ? 1.72 : 1.3;
    for (const [bw, au, m, pa] of [[L1, alongU, 0.25, endPad], [L1, !alongU, 0.25, endPad], [L1, alongU, 0.25, 1.3], [L1, !alongU, 0.25, 1.3], [1.2, alongU, 0.1, 1.0], [1.2, !alongU, 0.1, 1.0]] as [number, boolean, number, number][]) {
      const pad = m > 0.2 ? 1.3 : 1.0;
      tp = au ? F.anywhere(RD, bw + pa, 0.9 + pad, m) : F.anywhere(RD, 0.9 + pad, bw + pa, m);
      if (tp) { w = bw; rotU = au; break; }
    }
    if (!tp) {
      // (no room for a table and its chairs round it: a little round one for two, under the window
      // or by the wall)
      const sp = F.anywhere(RD, 1.5, 0.8, 0.1, 16) ?? F.anywhere(RD, 0.8, 1.5, 0.1, 16);
      if (!sp) return;
      F.claim(k, sp.r);
      const au = sp.r.u1 - sp.r.u0 > sp.r.v1 - sp.r.v0, cc = rng.float() < 0.5 ? wood : 0xf1ede4;
      F.put('cafeTable:0', () => D.roundTable(0.35, 0.74, 0xffffff), sp.uc, sp.vc, y, [1, 0], wood);
      for (const s of [-1, 1]) chair(sp.uc + (au ? s * 0.5 : 0), sp.vc + (au ? 0 : s * 0.5), au ? [-s, 0] : [0, -s], cc);
      return;
    }
    const dd = 0.9, uc = tp.uc, vc = tp.vc;
    // (in the table's own frame: s along it, t across; mapped to u, v)
    const at = (s: number, t: number): [number, number] => (rotU ? [uc + s, vc + t] : [uc + t, vc + s]);
    const box = (s0: number, s1: number, t0: number, t1: number): Rect => { const [a0, c0] = at(Math.min(s0, s1), Math.min(t0, t1)), [a1, c1] = at(Math.max(s0, s1), Math.max(t0, t1)); return { u0: Math.min(a0, a1), u1: Math.max(a0, a1), v0: Math.min(c0, c1), v1: Math.max(c0, c1) }; };
    // the places round it (review round 11: "three chairs crowd one side of the table, backs
    // touching"): DINE_PLACE of edge or more each — two a side at 1.2–2.0 m, three from 2.1 m — and one
    // at each end of a long table where there's room behind it to draw the chair out (before the
    // table's own floor is claimed: that's what is round it)
    const n = placesAlong(w);
    const ends = w >= DINE_ENDS ? ([-1, 1] as const).filter((e) => { const r = box(e * (w / 2 + 0.1), e * (w / 2 + 0.34 + 0.22 + 0.3), -0.26, 0.26); return inside(RD.r, r, 0) && F.freeAt(k, r); }) : [];
    F.claim(k, tp.r);
    const tr = rotU ? { u0: uc - w / 2, u1: uc + w / 2, v0: vc - dd / 2, v1: vc + dd / 2 } : { u0: uc - dd / 2, u1: uc + dd / 2, v0: vc - w / 2, v1: vc + w / 2 };
    table(tr, 0.76, wood);
    const cc = rng.float() < 0.5 ? wood : 0xf1ede4;
    const face = (s: number, t: number): P2 => (rotU ? [s, t] : [t, s]);
    for (let i = 0; i < n; i++) {
      const s = -w / 2 + (w * (i + 0.5)) / n;
      chair(...at(s, -dd / 2 - 0.32), face(0, 1), cc);
      chair(...at(s, dd / 2 + 0.32), face(0, -1), cc);
    }
    for (const e of ends) { chair(...at(e * (w / 2 + 0.34), 0), face(-e, 0), cc); F.claim(k, box(e * (w / 2 + 0.1), e * (w / 2 + 0.6), -0.26, 0.26)); }
    d.box(uc - 0.12, uc + 0.12, vc - 0.12, vc + 0.12, y + 0.76, y + 0.86, F.pick([0x7fa0b8, 0xe0a33b, 0xf1ede4]), IP.porcelain);
    const sp = at(-w / 2 + w / (2 * n), -dd / 2 - 0.3), fc = face(0, 1);
    F.npcs.push([sp[0], sp[1], y, yawTo(fc[0], fc[1]), 0.465]);
  };
  const bedroom = () => {
    const dbl = R.bed !== 1;
    const bw = dbl ? 1.6 : 0.95, bl = dbl ? 2.05 : 2.0;
    // the head to a solid wall, ideally one without windows
    const bp = F.against(R, S, bw, bl, { noExt: true }) ?? F.against(R, S, bw, bl);
    if (bp) {
      F.claim(k, grow(bp.r, 0.05));
      // (the frame in the house's wood: one bed piece a building, its bedding tinted)
      const wi = WOOD.indexOf(F.wood);
      F.put(`bed${dbl ? 2 : 1}:${wi}`, () => D.bed(bw, bl, 0xffffff, F.wood), bp.uc, bp.vc, y, bp.ax, fab);
      const side = bp.side!;
      // nightstands and lamps either side of the head
      for (const [s0, s1] of [[bp.s0 - 0.5, bp.s0 - 0.05], [bp.s1 + 0.05, bp.s1 + 0.5]]) {
        if (s0 < side.lo + 0.08 || s1 > side.hi - 0.08 || side.doors.some(([g0, g1]) => s0 < g1 && s1 > g0)) continue;
        const r2 = F.wrect(side, s0, s1, 0.02, 0.47);
        if (!F.freeAt(k, r2)) continue;
        F.claim(k, r2);
        F.put('stand', () => D.table(0.45, 0.45, 0.55, 0xffffff), (r2.u0 + r2.u1) / 2, (r2.v0 + r2.v1) / 2, y, bp.ax, wood);
        lamp((r2.u0 + r2.u1) / 2, (r2.v0 + r2.v1) / 2, y + 0.55, false);
      }
      const o = out(bp);
      const foot: P2 = [bp.uc + o[0] * (bl / 2 - 0.3), bp.vc + o[1] * (bl / 2 - 0.3)];
      const rr = grow(bp.r, 0.4);
      if (inside(R.r, rr, -0.05)) rug(rr);
      F.npcs.push([foot[0], foot[1], y, yawTo(o[0], o[1]), 0.52]);
    }
    const dp = F.against(R, S, 1.1, 0.5, { tall: true });
    if (dp) { F.claim(k, dp.r); F.put('dresser', () => D.dresser(1.1), dp.uc, dp.vc, y, dp.ax, wood); }
    const wp = F.against(R, S, 1.1, 0.6, { tall: true, noExt: true });
    if (wp) { F.claim(k, wp.r); F.put('wardrobe', () => D.wardrobe(1.1), wp.uc, wp.vc, y, wp.ax, wood); }
    if (area > 11) {
      const cp = F.anywhere(R, 0.5, 0.5, 0.3);
      if (cp) { F.claim(k, cp.r); chair(cp.uc, cp.vc, [1, 0], wood); }
    }
    wallArt(area > 10 ? 2 : 1);
  };
  const bath = () => {
    const long = Math.max(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0);
    const tl = long >= 2.2 ? 1.7 : long >= 1.8 ? 1.5 : 0;
    if (tl) {
      const tp = F.against(R, S, tl, 0.78);
      if (tp) { F.claim(k, tp.r); F.put(`tub:${tl}`, () => D.bathtub(tl), tp.uc, tp.vc, y, tp.ax); }
    }
    const wc = F.against(R, S, 0.5, 0.72);
    if (wc) { F.claim(k, grow(wc.r, 0.1)); F.put('toilet', () => D.toilet(), wc.uc, wc.vc, y, wc.ax); }
    const vw = Math.min(0.9, Math.max(0.6, long * 0.3));
    const vp = F.against(R, S, vw, 0.5, { tall: true });
    if (vp) { F.claim(k, vp.r); F.put(`vanity:${q(vw).toFixed(1)}`, () => D.vanity(q(vw)), vp.uc, vp.vc, y, vp.ax, F.pick([0xffffff, 0x8a6242, 0x9fb3a5])); }
    const mp = F.anywhere(R, 0.8, 0.5, 0.3);
    if (mp) d.flatQuad(mp.r.u0, mp.r.u1, mp.r.v0, mp.r.v1, y + 0.012, 0xe9e2d0, IP.rug, 1.1 + 10 * Math.floor(rng.float() * 10));
  };
  const wcRoom = () => {
    const wc = F.against(R, S, 0.5, 0.72);
    if (wc) { F.claim(k, wc.r); F.put('toilet', () => D.toilet(), wc.uc, wc.vc, y, wc.ax); }
    const vp = F.against(R, S, 0.5, 0.4, { tall: true });
    if (vp) F.put('vanity:0.5', () => D.vanity(0.5), vp.uc, vp.vc, y, vp.ax, 0xf2efe6);
  };
  /** Coats on their rail by the front door (a house's hall, a cottage's living room): its middle
   *  about a metre and a half in, between the windows. */
  const coats = () => {
    // (a metre of rail, else 80 cm where the doorways leave less)
    for (const w of [1.0, 0.8]) {
      const co = F.bestAgainst(R, S, w, 0.3, (p) => Math.abs(Math.hypot(p.uc - P.ud, p.vc - P.vd) - 1.5) + (p.side!.ext ? 0.3 : 0), { tall: true });
      if (!co) continue;
      F.claim(k, grow(co.r, 0.05));
      const ci = Math.floor(F.fp.seed * 613) % 8;
      F.put(`coats:${ci}:${w}`, () => D.coatRail(w, 3 + (ci % 2), ci + 1), co.uc, co.vc, y, co.ax, wood);
      return;
    }
  };
  /** A house's hall, the way in: a bordered runner down its way along from the doormat, the console
   *  with its lamp lit and a mirror over it on a wall ahead of the door (where you see it as you
   *  come in), coats on their rail by the door, a picture. (Its ceiling light is on all day: a hall
   *  has no window.) */
  const wayIn = () => {
    const pa = passage();
    const rw = q(Math.min(0.9, pa.v1 - pa.v0 - 0.45)), r0 = Math.max(pa.u0 + 0.3, P.ud + 1.15), len = q(pa.u1 - 0.4 - r0);
    if (rw >= 0.5 && len >= 1.2) {
      const vc = (pa.v0 + pa.v1) / 2, pi = Math.floor(F.fp.seed * 977) % RUNNERS.length, [bd, fig, field] = RUNNERS[pi];
      F.put(`runner:${len.toFixed(1)}:${rw.toFixed(1)}:${pi}`, () => D.runner(len, rw, bd, fig), r0 + len / 2, vc, y + 0.011, [1, 0], field);
    }
    // (a metre long, else 80 cm between the doorways; ahead of the door, where you see it coming in)
    let cp: Put | null = null, cw = 1.0;
    for (const w of [1.0, 0.8]) if ((cp = F.bestAgainst(R, S, w, 0.34, (p) => Math.abs(p.uc - P.ud - 5.0) + (p.side!.ext ? 0.8 : 0), { keys: ['v0', 'v1'], tall: true }) ?? F.against(R, S, w, 0.34, { tall: true }))) { cw = w; break; }
    if (cp && cp.side) {
      F.claim(k, grow(cp.r, 0.05));
      const base = F.pick([0x7fa0b8, 0xe9e2d0, 0x3f6f78, 0xc96b4b]);
      F.put(`console:${cw}:${base}`, () => D.consoleLamp(cw, base), cp.uc, cp.vc, y, cp.ax, wood);
      // (the lamp at its left end, as you face it; its light on the wall and the runner)
      const lx = cw / 2 - 0.2;
      F.glow(cp.uc - cp.ax[0] * lx, cp.vc - cp.ax[1] * lx, y + 1.25, 0.7);
      const mw = cw - 0.25, mid = (cp.s0 + cp.s1) / 2, mr = F.wrect(cp.side, mid - mw / 2, mid + mw / 2, 0, 0.036);
      F.put(`mirror:${mw.toFixed(2)}`, () => D.mirror(mw, 0.9), (mr.u0 + mr.u1) / 2, (mr.v0 + mr.v1) / 2, y + 1.12, cp.ax, rng.float() < 0.5 ? 0xc9a74a : wood);
      F.claim(k, F.wrect(cp.side, cp.s0, cp.s1, 0, 0.12));
    }
    coats();
    wallArt(Math.min(2, Math.max(1, Math.floor(area / 6))));
  };
  const hall = () => {
    // (a hotel room's entry: the wardrobe and the luggage rack)
    if (R.unit >= 0 && (P.arch === 'hotel' || P.up === 'hotel')) {
      const wp = F.against(R, S, 1.1, 0.6, { tall: true });
      if (wp) { F.claim(k, wp.r); F.put('wardrobe', () => D.wardrobe(1.1), wp.uc, wp.vc, y, wp.ax, wood); }
    }
    // a house's hall at the front door: the way in
    if (R.type === 'hall' && k === 0 && house && R.r.u0 - 0.01 <= P.ud + 0.35 && R.r.u1 + 0.01 >= P.ud + 0.35 && R.r.v0 - 0.01 <= P.vd && R.r.v1 + 0.01 >= P.vd) { wayIn(); return; }
    // a runner down the hall's length (along its way past the stair), a picture or two
    const pa = passage(), along = pa.u1 - pa.u0 >= pa.v1 - pa.v0, pm = (pa.u0 + pa.u1) / 2, pv = (pa.v0 + pa.v1) / 2;
    const rr = along ? { u0: pa.u0 + 0.5, u1: pa.u1 - 0.5, v0: pv - 0.35, v1: pv + 0.35 } : { u0: pm - 0.35, u1: pm + 0.35, v0: pa.v0 + 0.5, v1: pa.v1 - 0.5 };
    if (rr.u1 - rr.u0 > 1 && rr.v1 - rr.v0 > 0.5 && pa.v1 - pa.v0 > 0.9 && pa.u1 - pa.u0 > 0.9) d.flatQuad(rr.u0, rr.u1, rr.v0, rr.v1, y + 0.012, F.pick(FABRIC), IP.rug, 0.1 + Math.floor(rng.float() * FABRIC.length) * 10); // (a border: style 0)
    wallArt(Math.min(2, Math.floor(area / 5)));
  };
  const corridor = () => {
    const along = R.r.u1 - R.r.u0 >= R.r.v1 - R.r.v0;
    const len = along ? R.r.u1 - R.r.u0 : R.r.v1 - R.r.v0;
    for (let t = 2; t < len - 1; t += 5) {
      const u = along ? R.r.u0 + t : um, v = along ? vm : R.r.v0 + t;
      F.put('panel', () => D.ceilingLight(0.6, 0.24, 0.05), u, v, cy - 0.06, along ? [1, 0] : [0, 1]);
      if (t < 12) F.glow(u, v, cy - 0.3, 0.7);
    }
    if (rng.float() < 0.5) wallArt(1);
  };
  const towerLobby = () => {
    // a tower's ground floor: a row of turnstiles 2.2 m out from its core, across the way to the
    // lift lobby, the security desk beside them facing the door, the directory on the core's face
    const core = P.core!, Lb = P.lifts![0].lobby;
    const face = core.u0, meets = Math.abs(Lb.u0 - core.u0) < 0.1;
    const cv = meets ? (Lb.v0 + Lb.v1) / 2 : (core.v0 + core.v1) / 2;
    const n = Math.max(2, Math.min(6, Math.round((meets ? Lb.v1 - Lb.v0 : 3.6) / 0.9)));
    const tu = face - 2.2;
    if (tu - 0.7 < R.r.u0 + 1.5) return false;
    const row = { u0: tu - 0.65, u1: tu + 0.65, v0: cv - (n * 0.9) / 2 - 0.1, v1: cv + (n * 0.9) / 2 + 0.1 };
    if (!inside(R.r, row)) return false;
    for (let i = 0; i < n; i++) F.put('turnstile', () => D.turnstile(), tu, cv + (i + 0.5 - n / 2) * 0.9, y, [0, -1]);
    F.claim(k, grow(row, 0.3));
    // (the desk on the side with more lobby, if there's room for it)
    for (const sg of [1, -1]) {
      const dv = sg > 0 ? row.v1 + 1.6 : row.v0 - 1.6;
      const dr = { u0: tu - 0.4, u1: tu + 0.4, v0: dv - 1.25, v1: dv + 1.25 };
      if (!inside(R.r, grow(dr, 0.2)) || !F.freeAt(k, dr)) continue;
      F.put('securityDesk', () => D.securityDesk(2.4), tu, dv, y, [0, -1], F.wood);
      F.claim(k, grow(dr, 0.3));
      F.npcs.push([tu + 0.75, dv, y, yawTo(-1, 0), 0, 1]);
      break;
    }
    const dp = F.against(R, S, 1.1, 0.08, { keys: ['u1'], tall: true });
    if (dp) { F.claim(k, dp.r); F.put('directory', () => D.directory(), dp.uc, dp.vc, y, dp.ax); }
    return true;
  };
  const lobby = () => {
    if (P.lifts?.length && P.core && k === 0 && towerLobby()) {
      for (let t = 0; t < Math.min(3, Math.floor(area / 60)); t++) {
        const gp = F.anywhere(R, 3.0, 1.2, 0.8);
        if (!gp) break;
        F.claim(k, gp.r);
        table({ u0: gp.uc - 0.5, u1: gp.uc + 0.5, v0: gp.vc - 0.3, v1: gp.vc + 0.3 }, 0.42, wood);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc - 1.05, gp.vc, y, axFacing([1, 0]), fab);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc + 1.05, gp.vc, y, axFacing([-1, 0]), fab);
        if (t === 0) F.npcs.push([gp.uc - 1.0, gp.vc, y, yawTo(1, 0), 0.45]);
      }
      for (let i = 0; i < 4; i++) { const pl = F.anywhere(R, 0.5, 0.5, 0.2); if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); } }
      return;
    }
    if (P.arch === 'hotel' || P.arch === 'school') {
      // a hotel's front desk (its key rack and clock behind it), a school's office window; seats
      const hotel = P.arch === 'hotel';
      const rp = F.against(R, S, hotel ? 3.0 : 2.0, 0.65 + STAFF_AISLE, { noExt: true, tries: 20 });
      if (rp && rp.side) {
        F.claim(k, grow(rp.r, 0.3));
        const cr = F.wrect(rp.side, rp.s0, rp.s1, STAFF_AISLE, STAFF_AISLE + 0.65), L = q(rp.s1 - rp.s0);
        F.put(`desk:${L.toFixed(1)}`, () => D.counter(L, 0.65, 0xffffff, false), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, rp.ax, hotel ? wood : 0xd8d2c4);
        if (hotel) {
          F.wbox(rp.side, rp.s0 + 0.3, rp.s1 - 0.3, 0, 0.04, y + 1.3, y + 2.1, F.wood, IP.wood);
          for (let i = 0; i < 3; i++) F.wbox(rp.side, rp.s0 + 0.5 + i * 0.7, rp.s0 + 0.8 + i * 0.7, 0.04, 0.05, y + 1.6, y + 1.9, 0xf2efe6, IP.porcelain);
        }
        const sm = (rp.s0 + rp.s1) / 2, st = F.wrect(rp.side, sm, sm, STAFF_AISLE * 0.5, STAFF_AISLE * 0.5);
        F.npcs.push([st.u0, st.v0, y, yawTo(...out(rp)), 0, 1]);
      }
      for (let t = 0; t < Math.max(1, Math.min(3, Math.floor(area / 40))); t++) {
        const gp = F.anywhere(R, 3.0, 1.2, 0.8);
        if (!gp) break;
        F.claim(k, gp.r);
        table({ u0: gp.uc - 0.5, u1: gp.uc + 0.5, v0: gp.vc - 0.3, v1: gp.vc + 0.3 }, 0.42, wood);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc - 1.05, gp.vc, y, axFacing([1, 0]), fab);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc + 1.05, gp.vc, y, axFacing([-1, 0]), fab);
        if (t === 0) F.npcs.push([gp.uc - 1.0, gp.vc, y, yawTo(1, 0), 0.45]);
      }
      const rr = { u0: um - 1.2, u1: um + 1.2, v0: vm - 0.9, v1: vm + 0.9 };
      if (hotel && inside(R.r, rr) && F.freeAt(k, rr)) rug(rr);
      for (let i = 0; i < 2; i++) { const pl = F.anywhere(R, 0.5, 0.5, 0.2); if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); } }
      wallArt(2);
    } else if (F.fp.kind === 'large') {
      const mp = F.against(R, S, 1.6, 0.32, { tall: true });
      if (mp) { F.claim(k, mp.r); F.put('mail', () => D.mailboxes(1.6), mp.uc, mp.vc, y, mp.ax); }
      const pl = F.anywhere(R, 0.5, 0.5, 0.2);
      if (pl) plant(pl.uc, pl.vc, true);
      const rr = { u0: um - 0.9, u1: um + 0.9, v0: vm - 0.6, v1: vm + 0.6 };
      if (inside(R.r, rr) && F.freeAt(k, rr)) rug(rr);
    } else {
      // an office lobby: a reception desk facing the door, a seating group, planters
      const rp = F.against(R, S, 2.4, 0.7 + STAFF_AISLE, { noExt: true }) ?? F.anywhere(R, 2.4, 1.6, 1.0);
      if (rp) {
        F.claim(k, rp.r);
        const r = rp.r;
        d.box(r.u0, r.u1, r.v0, r.v1, y, y + 1.05, wood, IP.wood);
        d.box(r.u0 - 0.03, r.u1 + 0.03, r.v0 - 0.03, r.v1 + 0.03, y + 1.05, y + 1.09, 0x3a3530);
        F.npcs.push([rp.uc, rp.vc, y, 0, 0, 1]);
      }
      for (let t = 0; t < Math.min(2, Math.floor(area / 30)); t++) {
        const gp = F.anywhere(R, 3.0, 1.2, 0.8);
        if (!gp) break;
        F.claim(k, gp.r);
        table({ u0: gp.uc - 0.5, u1: gp.uc + 0.5, v0: gp.vc - 0.3, v1: gp.vc + 0.3 }, 0.42, wood);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc - 1.05, gp.vc, y, axFacing([1, 0]), fab);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc + 1.05, gp.vc, y, axFacing([-1, 0]), fab);
        if (t === 0) F.npcs.push([gp.uc - 1.0, gp.vc, y, yawTo(1, 0), 0.45]);
      }
      for (let i = 0; i < 2; i++) { const pl = F.anywhere(R, 0.5, 0.5, 0.2); if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); } }
    }
  };
  const study = () => {
    const dp = F.against(R, S, 1.3, 0.65);
    if (dp) {
      F.claim(k, grow(dp.r, 0.05));
      table(dp.r, 0.75, wood);
      F.put('monitor', () => D.monitor(), dp.uc, dp.vc, y + 0.75, dp.ax);
      const o = out(dp);
      F.put('officeChair', () => D.officeChair(0xffffff), dp.uc + o[0] * 0.65, dp.vc + o[1] * 0.65, y, axFacing([-o[0], -o[1]]), F.pick([0x3a3b3e, 0x2f4a5a, 0x5a3a3a]));
      F.npcs.push([dp.uc + o[0] * 0.65, dp.vc + o[1] * 0.65, y, yawTo(-o[0], -o[1]), 0.5]);
    }
    const bc = F.against(R, S, 1.0, 0.36, { tall: true });
    if (bc) { const bi = rng.u32() % 3; F.claim(k, bc.r); F.put(`books:${bi}`, () => D.bookcase(1.0, 11 + bi, FABRIC), bc.uc, bc.vc, y, bc.ax, wood); }
  };
  const utility = () => {
    for (let i = 0; i < 2; i++) {
      const wp = F.against(R, S, 0.62, 0.6);
      if (!wp) break;
      F.claim(k, wp.r);
      F.put('washer', () => D.washer(), wp.uc, wp.vc, y, wp.ax);
    }
    const sp = F.against(R, S, 1.0, 0.35, { tall: true });
    if (sp && sp.side) { F.claim(k, sp.r); for (let r = 0; r < 3; r++) F.wbox(sp.side, sp.s0, sp.s1, 0.0, 0.33, y + 1.2 + r * 0.35, y + 1.23 + r * 0.35, wood, IP.wood); }
  };
  const store = () => {
    const along = Math.max(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0);
    const n = Math.min(3, Math.floor(along / 1.4));
    for (let i = 0; i < n; i++) {
      const rp = F.against(R, S, 1.2, 0.6, { tall: true });
      if (!rp) break;
      F.claim(k, rp.r);
      F.put('rack:1.2', () => D.rack(1.2), rp.uc, rp.vc, y, rp.ax);
    }
  };
  const meeting = () => {
    const w = Math.min(2.4, Math.max(1.2, Math.max(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0) - 1.8));
    const alongU = R.r.u1 - R.r.u0 >= R.r.v1 - R.r.v0;
    const tr = alongU ? { u0: um - w / 2, u1: um + w / 2, v0: vm - 0.5, v1: vm + 0.5 } : { u0: um - 0.5, u1: um + 0.5, v0: vm - w / 2, v1: vm + w / 2 };
    if (!inside(R.r, grow(tr, 0.4))) return;
    table(tr, 0.74, 0xd8d2c4);
    const n = Math.max(2, Math.floor(w / 0.7));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (alongU) {
        F.put('officeChair', () => D.officeChair(0xffffff), tr.u0 + w * t, tr.v0 - 0.4, y, axFacing([0, 1]), 0x3a3b3e);
        F.put('officeChair', () => D.officeChair(0xffffff), tr.u0 + w * t, tr.v1 + 0.4, y, axFacing([0, -1]), 0x3a3b3e);
      } else {
        F.put('officeChair', () => D.officeChair(0xffffff), tr.u0 - 0.4, tr.v0 + w * t, y, axFacing([1, 0]), 0x3a3b3e);
        F.put('officeChair', () => D.officeChair(0xffffff), tr.u1 + 0.4, tr.v0 + w * t, y, axFacing([-1, 0]), 0x3a3b3e);
      }
    }
    F.claim(k, grow(tr, 0.7));
    const sc = F.against(R, S, 1.4, 0.1, { tall: true, noExt: true });
    if (sc && sc.side) F.wbox(sc.side, sc.s0, sc.s1, 0.0, 0.05, y + 1.0, y + 1.8, 0x1c1d22, IP.glass);
  };
  const lift = () => {
    // (a tall building's lifts are real: furnishLifts puts their doors on their shafts)
    if (P.lifts?.length) return;
    // the lift doors on its back wall, facing the floor
    const lp = F.against(R, S, 1.3, 0.12, { noExt: true, tall: true });
    if (lp) F.put('lift', () => D.liftDoors(), lp.uc, lp.vc, y, lp.ax);
  };
  const open = function* () {
    // the layout's workstations (back-to-back benches by the glass), then a plant or two
    const desks = F.L.desks.filter((dk) => dk.level === k && dk.u >= R.r.u0 && dk.u <= R.r.u1 && dk.v >= R.r.v0 && dk.v <= R.r.v1);
    let i = 0;
    for (const dk of desks) {
      // the sitter looks along `face`: the chair (−z) is behind them, the desk's back (+z) ahead
      const fwd: P2 = dk.face === 0 ? [1, 0] : dk.face === 1 ? [-1, 0] : dk.face === 2 ? [0, 1] : [0, -1];
      F.put('desk', () => D.workstation(), dk.u, dk.v, y, [fwd[1], -fwd[0]], F.pick([0x3a3b3e, 0x2f4a5a, 0x5a3a3a]));
      if (i < 6 && rng.float() < 0.5) F.npcs.push([dk.u - fwd[0] * 0.68, dk.v - fwd[1] * 0.68, y, yawTo(fwd[0], fwd[1]), 0.5]);
      if (++i % 40 === 0) yield;
    }
    for (let t = 0; t < Math.min(4, Math.floor(area / 60)); t++) { const pl = F.anywhere(R, 0.5, 0.5, 0.3); if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); } }
  };
  const shop = function* () {
    // (a supermarket's floor is its layout's fixtures: a plant by the door)
    if (F.L.fix.some((fx) => fx.level === k)) {
      const pl = F.anywhere(R, 0.5, 0.5, 0.3);
      if (pl) plant(pl.uc, pl.vc, true);
      return;
    }
    // a pharmacy's dispensary: its counter on the back wall, the shelves of medicines behind it
    if (F.P.place === 'pharmacy') {
      const dw = Math.min(4.8, (R.r.v1 - R.r.v0) * 0.45);
      const dp = F.against(R, S, dw, 0.62 + 1.2, { keys: ['u1'], noExt: true }) ?? F.against(R, S, dw, 0.62 + 1.2, { noExt: true });
      if (dp && dp.side) {
        F.claim(k, grow(dp.r, 0.3));
        const cr = F.wrect(dp.side, dp.s0, dp.s1, 1.2, 1.82), L = q(dp.s1 - dp.s0);
        F.put(`dispensary:${L.toFixed(1)}`, () => D.counter(L, 0.62, 0xffffff, false), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, dp.ax, 0xf2efe6);
        F.put(`meds:${L.toFixed(1)}`, () => D.shelves(L, 0.35, 2.1, 0xf2efe6, [0xf2efe6, 0x5b7fa6, 0xd9573f, 0x6e8c5a, 0xe9e2d0], 77), dp.uc + out(dp)[0] * -0.7, dp.vc + out(dp)[1] * -0.7, y, dp.ax);
        const sm = (dp.s0 + dp.s1) / 2, st = F.wrect(dp.side, sm, sm, 0.75, 0.75);
        F.npcs.push([st.u0, st.v0, y, yawTo(...out(dp)), 0, 1]);
      }
    }
    // gondola runs from the front toward the back of house, a cross aisle every ~12 m, the till by the door
    const grocery = F.use === 'grocery';
    const stock = grocery ? STOCK : FABRIC;
    const r = R.r;
    const tp = F.against(R, S, Math.min(2.4, (r.v1 - r.v0) * 0.4), 0.62 + STAFF_AISLE, { keys: ['u0', 'v0', 'v1'] });
    if (tp && tp.side) {
      F.claim(k, grow(tp.r, 0.3));
      const Sd = tp.side;
      F.wbox(Sd, tp.s0, tp.s1, STAFF_AISLE, STAFF_AISLE + 0.62, y, y + 1.0, wood, IP.wood);
      F.wbox(Sd, tp.s0 - 0.03, tp.s1 + 0.03, STAFF_AISLE - 0.03, STAFF_AISLE + 0.65, y + 1.0, y + 1.04, 0x3a3530);
      F.wbox(Sd, tp.s0 + 0.3, tp.s0 + 0.7, STAFF_AISLE + 0.1, STAFF_AISLE + 0.5, y + 1.04, y + 1.3, 0x2c2e33, IP.glass);
      const o = out(tp);
      const mid = F.wrect(Sd, tp.s0 + 0.5, tp.s0 + 0.5, STAFF_AISLE * 0.5, STAFF_AISLE * 0.5);
      F.npcs.push([mid.u0, mid.v0, y, yawTo(o[0], o[1]), 0, 1]);
      const cust = F.wrect(Sd, tp.s0 + 0.6, tp.s0 + 0.6, STAFF_AISLE + 1.05, STAFF_AISLE + 1.05);
      F.npcs.push([cust.u0, cust.v0, y, yawTo(-o[0], -o[1])]);
    }
    const mod = 1.25, rowPitch = grocery ? 2.6 : 2.4;
    const u0 = r.u0 + (grocery ? 3.2 : 2.0), u1 = r.u1 - 1.6;
    let n = 0;
    for (let v = r.v0 + 1.8; v + 0.9 <= r.v1 - 1.6; v += rowPitch) {
      let run = 0;
      for (let u = u0; u + mod <= u1; u += mod) {
        // a cross aisle every ~12 m of run
        if (run >= 9) { run = 0; u += 1.6; if (u + mod > u1) break; }
        const g = { u0: u, u1: u + mod, v0: v - 0.05, v1: v + 0.95 };
        if (!F.freeAt(k, g) || !F.lp(k).rectIn(g.u0, g.u1, g.v0, g.v1, 0.1)) { run = 0; continue; }
        F.claim(k, g);
        const vi = (Math.floor(u * 3.1) + Math.floor(v * 1.7)) & 3;
        F.put(`gondola:${grocery ? 'g' : 's'}${vi}`, () => D.gondola(mod - 0.02, 101 + vi, stock), u + mod / 2, v + 0.45, y, [1, 0]);
        run++;
        if (++n % 30 === 0) yield;
      }
    }
    const pl = F.anywhere(R, 0.5, 0.5, 0.3);
    if (pl) plant(pl.uc, pl.vc, true);
  };
  const stockRoom = () => {
    const along = Math.max(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0);
    for (let i = 0; i < Math.min(8, Math.floor(along / 2)); i++) {
      const rp = F.against(R, S, 2.4, 0.62, { tall: true });
      if (!rp) break;
      F.claim(k, grow(rp.r, 0.1));
      F.put('rack:2.4', () => D.rack(2.4), rp.uc, rp.vc, y, rp.ax);
    }
    F.npcs.push([um, vm, y, rng.float() * 6.28]);
  };
  const galley = () => {
    // steel worktops round the walls, a range under its hood, a cook at the pass
    const n = Math.min(4, Math.floor(area / 8) + 1);
    for (let i = 0; i < n; i++) {
      const wp = F.against(R, S, 2.0, 0.7, { tall: i === 0 });
      if (!wp || !wp.side) break;
      F.claim(k, grow(wp.r, 0.05));
      if (i === 0) {
        F.put('range', () => D.range(), wp.uc, wp.vc, y, wp.ax);
        F.wbox(wp.side, wp.s0, wp.s1, 0.0, 0.7, y + 2.0, y + 2.4, 0xb8bcbf, IP.porcelain);
      } else {
        F.wbox(wp.side, wp.s0, wp.s1, 0.0, 0.68, y, y + 0.9, 0xb8bcbf, IP.porcelain);
        F.wbox(wp.side, wp.s0 - 0.01, wp.s1 + 0.01, 0.0, 0.7, y + 0.9, y + 0.93, 0xd0d4d6, IP.porcelain);
      }
      if (i === 0) { const o = out(wp); F.npcs.push([wp.uc + o[0] * 0.5, wp.vc + o[1] * 0.5, y, yawTo(-o[0], -o[1]), 0, 1]); }
    }
  };
  const cafe = () => {
    // the counter (pastry case, espresso machine, menu board, cups) on a wall away from the door,
    // tables on a ~2.2 m pitch, a pendant over each
    const ceilY = cy - 0.14;
    const pendant = (u: number, v: number, kk: number) => {
      d.box(u - 0.006, u + 0.006, v - 0.006, v + 0.006, ceilY - 0.72, ceilY, 0x2a2622);
      d.box(u - 0.15, u + 0.15, v - 0.15, v + 0.15, ceilY - 0.86, ceilY - 0.72, [0x2f4a3a, 0xb08a4a, 0xe9e4d6][kk % 3], IP.porcelain);
      d.box(u - 0.07, u + 0.07, v - 0.07, v + 0.07, ceilY - 0.89, ceilY - 0.86, 0xffd890, IP.glow);
    };
    const cw = Math.min(3.6, Math.max(2.0, Math.min(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0) * 0.5));
    const cp = F.against(R, S, cw, 0.65 + STAFF_AISLE, { keys: ['u1', 'v0', 'v1'], noExt: false });
    if (cp && cp.side) {
      F.claim(k, grow(cp.r, 0.2));
      const Sd = cp.side, o = out(cp);
      const cr = F.wrect(Sd, cp.s0, cp.s1, STAFF_AISLE, STAFF_AISLE + 0.65);
      F.put(`counter:${q(cw).toFixed(1)}`, () => D.counter(q(cw), 0.65, 0xffffff), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, cp.ax, wood);
      for (let s = cp.s0 + 0.3; s < cp.s1 - 0.2; s += 0.7) { const st = F.wrect(Sd, s, s, STAFF_AISLE + 1.1, STAFF_AISLE + 1.1); F.put('stool', () => D.roundTable(0.17, 0.72, 0x3a3530), st.u0, st.v0, y, [1, 0]); }
      if (!F.onWindows(Sd, cp.s0, cp.s1, k)) F.wbox(Sd, cp.s0 + 0.3, cp.s1 - 0.3, 0.0, 0.03, y + 1.75, y + 2.35, 0x2a2e2b, IP.art);
      const behind = F.wrect(Sd, cp.s1 - 0.45, cp.s1 - 0.45, STAFF_AISLE * 0.5, STAFF_AISLE * 0.5);
      F.npcs.push([behind.u0, behind.v0, y, yawTo(o[0], o[1]), 0, 1]);
      const cust = F.wrect(Sd, cp.s0 + 0.65, cp.s0 + 0.65, STAFF_AISLE + 1.5, STAFF_AISLE + 1.5);
      F.npcs.push([cust.u0, cust.v0, y, yawTo(-o[0], -o[1])]);
      const pc = F.wrect(Sd, (cp.s0 + cp.s1) / 2, (cp.s0 + cp.s1) / 2, STAFF_AISLE + 0.3, STAFF_AISLE + 0.3);
      pendant(pc.u0, pc.v0, 0);
      F.glow(pc.u0, pc.v0, ceilY - 0.9, 0.9);
    }
    const nSets = Math.max(3, Math.min(16, Math.floor(area / 7)));
    let lit = 0;
    for (let t = 0; t < nSets; t++) {
      const four = rng.float() < 0.4;
      const sp = F.anywhere(R, four ? 2.4 : 2.0, four ? 2.4 : 1.2, 0.3);
      if (!sp) continue;
      F.claim(k, sp.r);
      const uc = sp.uc, vc = sp.vc, rr = four ? 0.62 : 0.55;
      F.put(`cafeTable:${four ? 1 : 0}`, () => D.roundTable(four ? 0.42 : 0.35, 0.74, 0xffffff), uc, vc, y, [1, 0], t % 2 ? wood : 0xf1ede4);
      F.put('bistro', () => D.bistroChair(0xffffff), uc - rr, vc, y, axFacing([1, 0]), wood);
      F.put('bistro', () => D.bistroChair(0xffffff), uc + rr, vc, y, axFacing([-1, 0]), wood);
      if (four) { F.put('bistro', () => D.bistroChair(0xffffff), uc, vc - rr, y, axFacing([0, 1]), wood); F.put('bistro', () => D.bistroChair(0xffffff), uc, vc + rr, y, axFacing([0, -1]), wood); }
      pendant(uc, vc, t);
      if (lit++ < 3) F.glow(uc, vc, ceilY - 0.9, 0.6);
      if (t < 4) F.npcs.push([uc - rr, vc, y, yawTo(1, 0), 0.475]);
    }
    wallArt(Math.max(2, Math.min(5, Math.floor(Math.sqrt(area) / 2))));
  };
  const bar = () => {
    const bw = Math.min(area > 90 ? 9 : 6, Math.max(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0) * 0.7);
    const bp = F.against(R, S, bw, 0.7 + STAFF_AISLE, { tall: true });
    if (bp && bp.side) {
      F.claim(k, grow(bp.r, 0.3));
      const Sd = bp.side, o = out(bp);
      const cr = F.wrect(Sd, bp.s0, bp.s1, STAFF_AISLE, STAFF_AISLE + 0.7);
      F.put(`bar:${q(bw).toFixed(1)}`, () => D.counter(q(bw), 0.7, 0x3a2a20, false), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, bp.ax);
      for (let s = bp.s0 + 0.35; s < bp.s1 - 0.25; s += 0.65) { const st = F.wrect(Sd, s, s, STAFF_AISLE + 1.12, STAFF_AISLE + 1.12); F.put('barStool', () => D.roundTable(0.18, 0.78, 0x2a2622), st.u0, st.v0, y, [1, 0]); }
      // back bar: three lit shelves of bottles
      for (const sy of [1.05, 1.45, 1.85]) {
        F.wbox(Sd, bp.s0 + 0.1, bp.s1 - 0.1, 0.0, 0.26, y + sy, y + sy + 0.03, 0x3a2a20, IP.wood);
        for (let s = bp.s0 + 0.2; s < bp.s1 - 0.2; s += 0.12 + rng.float() * 0.08) F.wbox(Sd, s, s + 0.07, 0.08, 0.16, y + sy + 0.03, y + sy + 0.22 + rng.float() * 0.1, F.pick([0x8a5a2a, 0x3f6a3a, 0xd9d2c0, 0x6a3a2a]), IP.porcelain);
      }
      const mid = F.wrect(Sd, (bp.s0 + bp.s1) / 2, (bp.s0 + bp.s1) / 2, 0.5, 0.5);
      F.glow(mid.u0, mid.v0, y + 2.2, 1.0);
      const bt = F.wrect(Sd, (bp.s0 + bp.s1) / 2, (bp.s0 + bp.s1) / 2, STAFF_AISLE * 0.5, STAFF_AISLE * 0.5);
      F.npcs.push([bt.u0, bt.v0, y, yawTo(o[0], o[1]), 0, 1]);
      for (let s = bp.s0 + 0.35, c = 0; s < bp.s1 - 0.25 && c < 3; s += 1.95, c++) { const st = F.wrect(Sd, s, s, STAFF_AISLE + 1.12, STAFF_AISLE + 1.12); F.npcs.push([st.u0, st.v0, y, yawTo(-o[0], -o[1]), 0.78]); }
    }
    for (let t = 0; t < Math.max(2, Math.min(18, Math.floor(area / 9))); t++) {
      const sp = F.anywhere(R, 1.6, 1.3, 0.3);
      if (!sp) continue;
      F.claim(k, sp.r);
      F.put('highTop', () => D.roundTable(0.36, 1.05, 0x3a2a20), sp.uc, sp.vc, y, [1, 0]);
      F.put('barStool', () => D.roundTable(0.18, 0.78, 0x2a2622), sp.uc - 0.55, sp.vc, y, [1, 0]);
      F.put('barStool', () => D.roundTable(0.18, 0.78, 0x2a2622), sp.uc + 0.55, sp.vc, y, [1, 0]);
      if (t < 4) F.npcs.push([sp.uc - 0.55, sp.vc, y, yawTo(1, 0), 0.76]);
      if (t < 3) F.glow(sp.uc, sp.vc, y + 2.4, 0.4);
    }
    wallArt(3);
  };
  const diner = () => {
    const vinyl = F.pick([0x9c2a26, 0x2f4a6a, 0x3d5a46, 0xb5793a]), topC = F.pick([0xe9e2d0, 0x8a6242, 0xd9d2c0]);
    for (let t = 0; t < Math.max(3, Math.min(7, Math.floor(area / 18))); t++) {
      const bp = F.against(R, S, 1.25, 2.2);
      if (!bp) break;
      F.claim(k, bp.r);
      F.put(`booth:${vinyl}:${topC}`, () => D.booth(1.25, vinyl, topC), bp.uc, bp.vc, y, bp.ax);
      if (t < 4) F.npcs.push([bp.uc, bp.vc, y, 0, 0.43]);
    }
    const cp = F.against(R, S, Math.min(3.4, Math.max(R.r.u1 - R.r.u0, R.r.v1 - R.r.v0) * 0.5), 0.62, { tall: true });
    if (cp && cp.side) {
      F.claim(k, grow(cp.r, 0.5));
      F.put(`dinerCounter:${q(cp.s1 - cp.s0).toFixed(1)}`, () => D.counter(q(cp.s1 - cp.s0), 0.62, 0xffffff, false), cp.uc, cp.vc, y, cp.ax, wood);
      for (let s = cp.s0 + 0.3; s < cp.s1 - 0.2; s += 0.65) { const st = F.wrect(cp.side, s, s, 1.04, 1.04); F.put(`dinerStool:${vinyl}`, () => D.roundTable(0.18, 0.74, vinyl), st.u0, st.v0, y, [1, 0]); }
      if (!F.onWindows(cp.side, cp.s0, cp.s1, k)) F.wbox(cp.side, cp.s0 + 0.3, cp.s1 - 0.3, 0.0, 0.03, y + 1.6, y + 2.25, 0x2a2e2b, IP.art);
    }
    for (let t = 0; t < Math.max(2, Math.min(14, Math.floor(area / 9))); t++) {
      const four = rng.float() < 0.55;
      const sp = F.anywhere(R, four ? 1.8 : 1.4, four ? 1.8 : 1.4, 0.3);
      if (!sp) continue;
      F.claim(k, sp.r);
      table({ u0: sp.uc - 0.4, u1: sp.uc + 0.4, v0: sp.vc - 0.4, v1: sp.vc + 0.4 }, 0.75, topC);
      chair(sp.uc, sp.vc - 0.62, [0, 1], 0x3a3530);
      chair(sp.uc, sp.vc + 0.62, [0, -1], 0x3a3530);
      if (four) { chair(sp.uc - 0.62, sp.vc, [1, 0], 0x3a3530); chair(sp.uc + 0.62, sp.vc, [-1, 0], 0x3a3530); }
    }
    wallArt(2);
  };
  // ---- Slice 4: the fixtures a layout planned in this room, then its program's pieces ----
  const fixtures = () => {
    // (a building's own colours for its checkouts and its pews' wood: one pick each)
    const seedB = Math.floor(F.fp.seed * 9973);
    const counterHex = [0x2f4a5a, 0x8c2f2a, 0x3d5a46, 0xb5793a, 0x5b7fa6][seedB % 5];
    // (oak to walnut: under a nave's high lamps a darker wood reads as one black mass)
    const pewWood = [0xa07a52, 0xb89468, 0x8a6242, 0x9c7a5a][seedB % 4];
    let lane = 0;
    for (const fx of F.L.fix) {
      if (fx.level !== k) continue;
      const uc = (fx.r.u0 + fx.r.u1) / 2, vc = (fx.r.v0 + fx.r.v1) / 2;
      if (uc < R.r.u0 || uc > R.r.u1 || vc < R.r.v0 || vc > R.r.v1) continue;
      F.claim(k, fx.r);
      const fv: P2 = fx.face === 0 ? [1, 0] : fx.face === 1 ? [-1, 0] : fx.face === 2 ? [0, 1] : [0, -1];
      const ax = axFacing(fv), back: P2 = [-ax[1], ax[0]];
      const alongU = fx.r.u1 - fx.r.u0 >= fx.r.v1 - fx.r.v0, len = alongU ? fx.r.u1 - fx.r.u0 : fx.r.v1 - fx.r.v0;
      const vi = (Math.floor(uc * 3.1) + Math.floor(vc * 1.7)) & 3;
      switch (fx.kind) {
        case 'gondola': {
          const m = len / fx.n;
          for (let j = 0; j < fx.n; j++) {
            const t = -len / 2 + (j + 0.5) * m, u = alongU ? uc + t : uc, v = alongU ? vc : vc + t;
            const gi = (Math.floor(u * 3.1) + Math.floor(v * 1.7)) & 3;
            // (the same piece as a shop's own grocery gondolas: one key, one geometry)
            F.put(`gondola:g${gi}`, () => D.gondola(1.23, 101 + gi, STOCK), u, v, y, alongU ? [1, 0] : [0, 1]);
          }
          break;
        }
        case 'checkout': {
          F.put(`checkout:${q(len).toFixed(1)}`, () => D.checkout(q(len)), uc, vc, y, ax, counterHex);
          // the cashier on their side of it, facing the lane (the first few lanes open)
          if (lane++ < 4) F.npcs.push([uc + back[0] * 0.75 + ax[0] * 0.5, vc + back[1] * 0.75 + ax[1] * 0.5, y, yawTo(-back[0], -back[1]), 0, 1]);
          if (lane < 3) F.npcs.push([uc - back[0] * 0.85 - ax[0] * 0.6, vc - back[1] * 0.85 - ax[1] * 0.6, y, yawTo(back[0], back[1])]);
          break;
        }
        case 'cooler': case 'freezer': {
          const doors = fx.kind === 'freezer', ci = vi & 1;
          F.put(`cold:${doors ? 1 : 0}:${ci}:${q(len).toFixed(1)}`, () => D.cooler(q(len), 301 + ci, STOCK, doors), uc, vc, y, ax, doors ? 0xdfe3e4 : 0x3f6f78);
          F.glow(uc + fv[0] * 0.6, vc + fv[1] * 0.6, y + 1.9, 0.5);
          break;
        }
        case 'produce':
          F.put(`produce:${vi}:${q(len).toFixed(1)}`, () => D.produce(q(len), 0.9, 401 + vi), uc, vc, y, ax, F.wood);
          break;
        case 'pew':
          F.put(`pew:${q(len).toFixed(1)}`, () => D.pew(q(len)), uc, vc, y, ax, pewWood);
          if (rng.float() < 0.12) F.npcs.push([uc - fv[0] * 0.02 + ax[0] * (rng.float() - 0.5) * (len - 0.8), vc - fv[1] * 0.02 + ax[1] * (rng.float() - 0.5) * (len - 0.8), y, yawTo(fv[0], fv[1]), 0.45]);
          break;
        case 'altar': {
          F.put(`altar:${q(len).toFixed(1)}`, () => D.altar(q(len), 0x8c2f2a), uc, vc, y, ax);
          F.glow(uc, vc, y + 1.5, 0.5);
          // the lectern to one side, in front
          const lu = uc + fv[0] * 1.6 + ax[0] * (len / 2 + 0.6), lv = vc + fv[1] * 1.6 + ax[1] * (len / 2 + 0.6);
          if (F.freeAt(k, { u0: lu - 0.3, u1: lu + 0.3, v0: lv - 0.3, v1: lv + 0.3 })) F.put('lectern', () => D.lectern(0xffffff), lu, lv, y, ax, pewWood);
          break;
        }
        default: break;
      }
    }
  };
  /** Wall rects of the room's sides that run along `run` (0: along u), the facade's or not. */
  const sidesAlong = (ext: boolean) => S.filter((x) => x.ext === ext).map((x) => x.key);
  const guest = () => {
    // the bed's head on a party wall, the desk with its TV across from it, an armchair by the window
    const bp = F.against(R, S, 2.7, 2.15, { noExt: true, tries: 20 }) ?? F.against(R, S, 2.0, 2.1, { noExt: true });
    let across: SideKey[] | undefined;
    if (bp && bp.side) {
      F.claim(k, grow(bp.r, 0.05));
      F.put('hotelBed', () => D.hotelBed(1.6), bp.uc, bp.vc, y, bp.ax, F.pick([0x8c2f2a, 0x2f4a5a, 0x6e8c5a, 0xc9a24b, 0x7a5b8c]));
      const o = out(bp);
      F.glow(bp.uc - o[0] * 0.7, bp.vc - o[1] * 0.7, y + 1.0, 0.6);
      F.npcs.push([bp.uc + o[0] * 0.2, bp.vc + o[1] * 0.2, y, yawTo(o[0], o[1]), 0.52]);
      const side = bp.side;
      across = S.filter((x) => x.run === side.run && x.key !== side.key).map((x) => x.key);
      F.claim(k, F.wrect(side, bp.s0, bp.s1, 2.15, 2.75)); // (the walk past its foot)
    }
    const dp = F.against(R, S, 2.4, 0.5, { keys: across, noExt: true, tall: true }) ?? F.against(R, S, 1.8, 0.5, { noExt: true });
    if (dp) { F.claim(k, grow(dp.r, 0.1)); F.put(`hotelDesk:${q(dp.s1 - dp.s0).toFixed(1)}`, () => D.hotelDesk(q(dp.s1 - dp.s0)), dp.uc, dp.vc, y, dp.ax, wood); }
    const ac = F.against(R, S, 0.85, 0.85, { keys: sidesAlong(true) }) ?? F.anywhere(R, 0.85, 0.85, 0.4);
    if (ac) {
      F.claim(k, ac.r);
      const o: P2 = ac.side ? out(ac) : [Math.sign(um - ac.uc) || 1, 0];
      F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), ac.uc, ac.vc, y, axFacing(o), fab);
      lamp(ac.uc + ac.ax[0] * 0.6, ac.vc + ac.ax[1] * 0.6, y, true);
    }
    wallArt(1);
  };
  const classroom = () => {
    // the board on a solid end wall (the windows on the pupils' side), the teacher's desk before it,
    // double desks in rows facing it with a 0.6 m aisle down the side and between the pairs
    const ext = S.find((x) => x.ext);
    const ends = S.filter((x) => !x.ext && (!ext || x.run !== ext.run)).map((x) => x.key);
    const bp = F.against(R, S, 3.0, 0.08, { keys: ends.length ? ends : undefined, noExt: true, tall: true, tries: 24 }) ?? F.against(R, S, 2.4, 0.08, { noExt: true, tall: true });
    if (!bp || !bp.side) { wallArt(2); return; }
    const Sd = bp.side, o = out(bp);
    F.put(`whiteboard:${q(bp.s1 - bp.s0).toFixed(1)}`, () => D.whiteboard(q(bp.s1 - bp.s0) - 0.05), bp.uc, bp.vc, y, bp.ax);
    // (the depth of the room away from the board, and its length along it)
    const far = S.find((x) => x.run === Sd.run && x.key !== Sd.key)!;
    const depth = Math.abs(far.face - Sd.face), lo = Sd.lo + 0.15, hi = Sd.hi - 0.15;
    const mid = (bp.s0 + bp.s1) / 2;
    const tr = F.wrect(Sd, mid - 0.7, mid + 0.7, 1.0, 1.7);
    if (F.freeAt(k, tr)) {
      F.claim(k, grow(tr, 0.3));
      table(tr, 0.75, wood);
      const ch = F.wrect(Sd, mid, mid, 0.62, 0.62);
      F.put('officeChair', () => D.officeChair(0xffffff), ch.u0, ch.v0, y, axFacing(o), 0x3a3b3e);
      const tch = F.wrect(Sd, mid + 1.1, mid + 1.1, 0.9, 0.9);
      F.npcs.push([tch.u0, tch.v0, y, yawTo(o[0], o[1]), 0, 1]);
    }
    const chairHex = F.pick([0x5b7fa6, 0xd9573f, 0x6e8c5a, 0xe0a33b, 0x3f6f78]);
    let seated = 0;
    for (let dq = 2.8; dq + 1.1 <= depth - 0.5; dq += 1.4)
      for (let s = lo + 0.75; s + 0.75 <= hi; s += 1.8) {
        const r = F.wrect(Sd, s - 0.62, s + 0.62, dq - 0.27, dq + 0.95);
        if (!F.freeAt(k, r) || !inside(R.r, r)) continue;
        F.claim(k, r);
        const c = F.wrect(Sd, s, s, dq, dq);
        F.put('schoolDesk', () => D.schoolDesk(), c.u0, c.v0, y, axFacing(o), chairHex);
        if (seated < 6 && rng.float() < 0.45) {
          const sx = s + (rng.float() < 0.5 ? -0.3 : 0.3), sp = F.wrect(Sd, sx, sx, dq + 0.5, dq + 0.5);
          F.npcs.push([sp.u0, sp.v0, y, yawTo(-o[0], -o[1]), 0.44]);
          seated++;
        }
      }
    const bc = F.against(R, S, 1.0, 0.36, { keys: [far.key], tall: true });
    if (bc) { F.claim(k, bc.r); F.put('books:0', () => D.bookcase(1.0, 11, FABRIC), bc.uc, bc.vc, y, bc.ax, wood); }
    wallArt(3);
  };
  const assembly = () => {
    // a school hall: rows of chairs facing a lectern at one end, wall bars on a long wall
    const ends = S.filter((x) => !x.ext).map((x) => x.key);
    const lp = F.against(R, S, 3.0, 0.6, { keys: ends.length ? ends : undefined, tall: true, tries: 20 });
    if (lp && lp.side) {
      const o = out(lp), Sd = lp.side;
      F.put('lectern', () => D.lectern(0xffffff), lp.uc + o[0] * 1.2, lp.vc + o[1] * 1.2, y, axFacing([-o[0], -o[1]]), wood);
      F.claim(k, grow(F.wrect(Sd, lp.s0, lp.s1, 0, 2.2), 0.1));
      const far = S.find((x) => x.run === Sd.run && x.key !== Sd.key)!;
      const depth = Math.abs(far.face - Sd.face);
      for (let dq = 3.6; dq <= depth - 1.2; dq += 0.95)
        for (let s = Sd.lo + 1.0; s <= Sd.hi - 1.0; s += 0.55) {
          if (Math.abs(s - (Sd.lo + Sd.hi) / 2) < 0.7) continue; // (the aisle down the middle)
          const c = F.wrect(Sd, s, s, dq, dq);
          if (!F.freeAt(k, { u0: c.u0 - 0.24, u1: c.u0 + 0.24, v0: c.v0 - 0.24, v1: c.v0 + 0.24 })) continue;
          chair(c.u0, c.v0, [-o[0], -o[1]], 0x3f6f78);
        }
    }
    const wb = F.against(R, S, 2.4, 0.15, { noExt: true, tall: true });
    if (wb && wb.side) { F.claim(k, wb.r); for (let i = 0; i < 12; i++) F.wbox(wb.side, wb.s0, wb.s1, 0.05, 0.1, y + 0.2 + i * 0.2, y + 0.24 + i * 0.2, 0xb89468, IP.wood); for (let s = wb.s0; s <= wb.s1 + 0.01; s += 0.8) F.wbox(wb.side, s - 0.04, s + 0.04, 0, 0.12, y, y + 2.5, 0xa07a52, IP.wood); }
  };
  const staff = () => {
    // a gym's changing room: lockers round the walls, benches; else a staff room or back office:
    // a kitchenette, a table, lockers by the door
    if (F.P.place === 'gym') {
      for (let i = 0; i < 4; i++) { const lp = F.against(R, S, 1.8, 0.48, { tall: true }); if (!lp) break; F.claim(k, grow(lp.r, 0.05)); F.put('lockers:1.8', () => D.lockers(1.8), lp.uc, lp.vc, y, lp.ax, F.pick([0x5b7fa6, 0x8f8f96, 0x3f6f78])); }
      for (let i = 0; i < 2; i++) { const bp = F.anywhere(R, 1.6, 0.4, 0.9); if (!bp) break; F.claim(k, grow(bp.r, 0.3)); table(bp.r, 0.45, wood); }
      return;
    }
    if (area >= 12) kitchen(false);
    diningSet(area > 20);
    const lp = F.against(R, S, 1.2, 0.48, { tall: true, noExt: true });
    if (lp) { F.claim(k, lp.r); F.put('lockers:1.2', () => D.lockers(1.2), lp.uc, lp.vc, y, lp.ax, 0x8f8f96); }
    const nb = F.against(R, S, 1.2, 0.04, { tall: true });
    if (nb && nb.side) { F.claim(k, nb.r); F.wbox(nb.side, nb.s0, nb.s1, 0, 0.02, y + 1.1, y + 1.9, 0xb89468, IP.wood); for (let i = 0; i < 5; i++) F.wbox(nb.side, nb.s0 + 0.1 + i * 0.21, nb.s0 + 0.28 + i * 0.21, 0.02, 0.025, y + 1.3 + (i % 2) * 0.25, y + 1.55 + (i % 2) * 0.25, F.pick([0xf2efe6, 0xe0a33b, 0x9fd6ff]), IP.art); }
  };
  const narthex = () => {
    // the way in: a table of leaflets, a notice board, plants (a mosque's: racks for shoes)
    if (F.P.place === 'mosque') {
      for (let i = 0; i < 3; i++) { const rp = F.against(R, S, 1.2, 0.36); if (!rp || !rp.side) break; F.claim(k, rp.r); for (let r = 0; r < 4; r++) F.wbox(rp.side, rp.s0, rp.s1, 0, 0.34, y + 0.1 + r * 0.3, y + 0.13 + r * 0.3, wood, IP.wood); }
    } else {
      const tp = F.against(R, S, 1.2, 0.5);
      if (tp) { F.claim(k, tp.r); table(tp.r, 0.8, wood); }
      wallArt(2);
    }
    const pl = F.anywhere(R, 0.5, 0.5, 0.2);
    if (pl) plant(pl.uc, pl.vc, true);
  };
  const prayer = () => {
    // the carpet in rows toward the qibla wall (the far end), the mihrab's niche in it, the minbar's
    // steps beside it, lamps hung low
    const far = R.r.u1, vm2 = vm;
    const rowHex = F.pick([0x8c2f2a, 0x2f5a46, 0x6a2a3a, 0x2f4a6a]);
    for (let u = R.r.u0 + 1.2; u + 1.0 <= far - 1.2; u += 1.25) d.flatQuad(u, u + 1.1, R.r.v0 + 0.4, R.r.v1 - 0.4, y + 0.012, rowHex, IP.rug, 3.1 + 10 * Math.floor(rng.float() * 10));
    d.box(far - 0.12, far - 0.02, vm2 - 0.8, vm2 + 0.8, y, y + 2.6, 0xe9dfc4, IP.porcelain);
    d.box(far - 0.16, far - 0.12, vm2 - 0.55, vm2 + 0.55, y, y + 2.2, 0x2f5a46, IP.fabric);
    d.box(far - 0.2, far - 0.12, vm2 - 0.62, vm2 + 0.62, y + 2.2, y + 2.32, 0xc9a74a);
    for (let i = 0; i < 6; i++) d.box(far - 0.3 - i * 0.3, far - 0.02 - i * 0.3, vm2 + 1.1, vm2 + 1.9, y, y + 0.25 * (6 - i), 0x8a6242, IP.wood);
    for (let t = 2; t < R.r.u1 - R.r.u0 - 1; t += 4) for (const dv of [-2, 2]) { const u = R.r.u0 + t, v = vm2 + dv; F.put('pendant', () => D.ceilingLight(0.9, 0.9, 0.16), u, v, y + 2.6, [1, 0]); F.glow(u, v, y + 2.4, 0.9); }
    F.npcs.push([far - 3, vm2 - 1.2, y, yawTo(1, 0), 0.3]);
  };
  const library = () => {
    // the circulation desk by the door, reading tables in the front of the room, the stacks behind:
    // double-sided, 1.2 m apart, in runs of 2–3 with cross aisles
    const dk = F.against(R, S, 2.4, 0.66 + STAFF_AISLE, { noExt: true });
    if (dk && dk.side) {
      F.claim(k, grow(dk.r, 0.3));
      const cr = F.wrect(dk.side, dk.s0, dk.s1, STAFF_AISLE, STAFF_AISLE + 0.66);
      F.put('libDesk', () => D.counter(2.4, 0.66, 0xffffff, false), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, dk.ax, wood);
      const sm = (dk.s0 + dk.s1) / 2, st = F.wrect(dk.side, sm, sm, STAFF_AISLE * 0.5, STAFF_AISLE * 0.5);
      F.npcs.push([st.u0, st.v0, y, yawTo(...out(dk)), 0, 1]);
    }
    const front = R.r.u0 + Math.max(3.2, (R.r.u1 - R.r.u0) * 0.35);
    for (let t = 0; t < Math.min(6, Math.floor(area / 40)); t++) {
      const tp = F.anywhere(R, 2.4, 2.0, 0.6);
      if (!tp || tp.uc > front + 2) continue;
      F.claim(k, tp.r);
      table({ u0: tp.uc - 0.8, u1: tp.uc + 0.8, v0: tp.vc - 0.45, v1: tp.vc + 0.45 }, 0.75, wood);
      for (const s of [-1, 1]) for (const dv of [-0.45, 0.45]) chair(tp.uc + dv, tp.vc + s * 0.75, [0, -s], wood);
      F.glow(tp.uc, tp.vc, y + 1.2, 0.5);
      if (t < 3) F.npcs.push([tp.uc - 0.45, tp.vc - 0.72, y, yawTo(0, 1), 0.46]);
    }
    const spines = FABRIC;
    let n = 0;
    for (let v = R.r.v0 + 1.4; v + 0.6 <= R.r.v1 - 1.2; v += 1.8)
      for (let u = Math.max(front, R.r.u0 + 1.2); u + 1.8 <= R.r.u1 - 1.2; u += 1.8) {
        if ((++n % 4) === 0) { u += 1.2; continue; } // (a cross aisle every three)
        const r = { u0: u, u1: u + 1.8, v0: v, v1: v + 0.6 };
        if (!F.freeAt(k, grow(r, 0.2)) || !F.lp(k).rectIn(r.u0, r.u1, r.v0, r.v1, 0.2)) continue;
        F.claim(k, r);
        const si = (Math.floor(u * 2.3) + Math.floor(v * 1.3)) & 3;
        F.put(`stack:${si}`, () => D.bookStack(1.8, 211 + si, spines), u + 0.9, v + 0.3, y, [1, 0], wood);
      }
    wallArt(2);
  };
  const tellers = (post: boolean) => {
    // the counter across the back of the hall, its staff behind it, the queue's posts in front; a
    // bank's cash machines on a wall, a post office's boxes
    const len = Math.min(post ? 6 : 7.5, Math.max(R.r.v1 - R.r.v0, R.r.u1 - R.r.u0) * 0.6);
    const cp = F.against(R, S, len, 0.66 + 1.4, { noExt: true, tries: 20 }) ?? F.against(R, S, len * 0.7, 0.66 + 1.4, { tries: 20 });
    if (cp && cp.side) {
      const L = q(cp.s1 - cp.s0);
      F.claim(k, grow(cp.r, 0.3));
      const cr = F.wrect(cp.side, cp.s0, cp.s1, 1.4, 2.06);
      F.put(`teller:${L.toFixed(1)}`, () => D.tellerCounter(L), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, cp.ax, post ? 0xb5793a : wood);
      const n = Math.max(1, Math.round(L / 1.5)), o = out(cp);
      for (let i = 0; i < n; i++) {
        const s = cp.s0 + ((i + 0.5) * L) / n;
        if (i < 3) { const st = F.wrect(cp.side, s, s, 0.8, 0.8); F.npcs.push([st.u0, st.v0, y, yawTo(o[0], o[1]), i ? 0.5 : 0, 1]); }
      }
      const qp = F.wrect(cp.side, (cp.s0 + cp.s1) / 2 - 1.4, (cp.s0 + cp.s1) / 2 + 1.4, 3.6, 3.6);
      if (F.freeAt(k, grow(qp, 0.3))) { F.put('queue:2.8', () => D.queuePosts(2.8), (qp.u0 + qp.u1) / 2, (qp.v0 + qp.v1) / 2, y, cp.ax); F.claim(k, grow(qp, 0.3)); }
      const cs = cp.s0 + L / (2 * n), cust = F.wrect(cp.side, cs, cs, 2.7, 2.7);
      F.npcs.push([cust.u0, cust.v0, y, yawTo(-o[0], -o[1])]);
    }
    if (post) {
      const bp = F.against(R, S, 1.8, 0.46, { tall: true });
      if (bp) { F.claim(k, bp.r); F.put('lockers:1.8', () => D.lockers(1.8), bp.uc, bp.vc, y, bp.ax, 0xb08a4a); }
      const tp = F.against(R, S, 1.6, 0.6);
      if (tp) { F.claim(k, tp.r); table(tp.r, 0.95, wood); }
    } else {
      for (let i = 0; i < 2; i++) { const ap = F.against(R, S, 0.8, 0.35, { tall: true }); if (!ap) break; F.claim(k, grow(ap.r, 0.4)); F.put('atm', () => D.atm(), ap.uc, ap.vc, y, ap.ax); }
      const gp = F.anywhere(R, 3.0, 1.2, 0.8);
      if (gp) {
        F.claim(k, gp.r);
        table({ u0: gp.uc - 0.5, u1: gp.uc + 0.5, v0: gp.vc - 0.3, v1: gp.vc + 0.3 }, 0.42, wood);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc - 1.05, gp.vc, y, axFacing([1, 0]), fab);
        F.put('armchair', () => D.armchair(0.8, 0.8, 0xffffff), gp.uc + 1.05, gp.vc, y, axFacing([-1, 0]), fab);
      }
    }
    for (let i = 0; i < 2; i++) { const pl = F.anywhere(R, 0.5, 0.5, 0.2); if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); } }
    wallArt(2);
  };
  const gym = () => {
    // the front desk by the door; treadmills in a row along the glass looking out; benches, racks
    // of dumbbells along a solid wall under a mirror
    const dk = F.against(R, S, 2.0, 0.65 + STAFF_AISLE, { noExt: true });
    if (dk && dk.side) {
      F.claim(k, grow(dk.r, 0.3));
      const cr = F.wrect(dk.side, dk.s0, dk.s1, STAFF_AISLE, STAFF_AISLE + 0.65);
      F.put('gymDesk', () => D.counter(2.0, 0.65, 0xffffff, false), (cr.u0 + cr.u1) / 2, (cr.v0 + cr.v1) / 2, y, dk.ax, 0x3a3b3e);
      const sm = (dk.s0 + dk.s1) / 2, st = F.wrect(dk.side, sm, sm, STAFF_AISLE * 0.5, STAFF_AISLE * 0.5);
      F.npcs.push([st.u0, st.v0, y, yawTo(...out(dk)), 0, 1]);
    }
    const ext = S.filter((x) => x.ext);
    let n = 0;
    for (const Sd of ext)
      for (let s = Sd.lo + 0.8; s + 0.8 <= Sd.hi - 0.6 && n < 10; s += 1.1) {
        const r = F.wrect(Sd, s - 0.42, s + 0.42, 0.5, 2.5);
        if (!F.freeAt(k, grow(r, 0.1)) || !inside(R.r, r)) continue;
        F.claim(k, grow(r, 0.1));
        const c = F.wrect(Sd, s, s, 1.5, 1.5);
        F.put('treadmill', () => D.treadmill(), c.u0, c.v0, y, axFor(Sd.key), F.pick([0x3a3b3e, 0x8c2f2a, 0x2f4a5a]));
        // (a runner on it, looking out of the window)
        if (n++ < 3 && rng.float() < 0.6) F.npcs.push([c.u0, c.v0, y + 0.2, yawTo(Sd.run ? Sd.out : 0, Sd.run ? 0 : Sd.out)]);
      }
    const mp = F.against(R, S, 3.6, 0.6, { noExt: true, tall: true });
    if (mp && mp.side) {
      F.claim(k, mp.r);
      F.wbox(mp.side, mp.s0, mp.s1, 0, 0.02, y + 0.4, y + 2.2, 0xcfe0e4, IP.glass);
      F.put('dumbbells:1.8', () => D.dumbbellRack(1.8), mp.uc, mp.vc, y, mp.ax);
    }
    for (let i = 0; i < 3; i++) {
      const bp = F.anywhere(R, 1.8, 1.6, 0.8);
      if (!bp) break;
      F.claim(k, bp.r);
      F.put('weightBench', () => D.weightBench(), bp.uc, bp.vc, y, [0, 1], F.pick([0x3a3b3e, 0x8c2f2a]));
      if (i === 0) F.npcs.push([bp.uc + 0.6, bp.vc, y, yawTo(-1, 0)]);
    }
  };
  const church = () => {
    const dir = P.ud > um ? -1 : 1; // altar at the far end from the door
    // (a planned church: its pews and altar are the layout's fixtures; the runner up the aisle)
    if (F.L.fix.some((fx) => fx.level === k && fx.kind === 'pew')) {
      d.flatQuad(R.r.u0 + 0.4, R.r.u1 - 1.0, vm - 0.55, vm + 0.55, y + 0.012, 0x8c2f2a, IP.rug, 2.1 + 10);
      F.npcs.push([R.r.u1 - 3.5, vm + 1.2, y, -Math.PI / 2, 0, 1]);
      return;
    }
    const alt = dir > 0 ? R.r.u1 - 1.5 : R.r.u0 + 0.5;
    d.box(alt, alt + 1.0, vm - 1.1, vm + 1.1, y, y + 1.0, 0xf4f1ea);
    d.box(alt - 0.02, alt + 1.02, vm - 1.0, vm + 1.0, y + 1.0, y + 1.02, 0xe9dfc4, IP.fabric);
    d.box(alt + 0.45, alt + 0.55, vm - 0.05, vm + 0.05, y + 1.02, y + 2.4, 0xc9a74a);
    d.box(alt + 0.45, alt + 0.55, vm - 0.45, vm + 0.45, y + 1.9, y + 2.0, 0xc9a74a);
    for (const vv of [-0.8, 0.8]) { d.box(alt + 0.45, alt + 0.55, vm + vv - 0.04, vm + vv + 0.04, y + 1.02, y + 1.35, 0xf6f1de); F.glow(alt + 0.5, vm + vv, y + 1.4, 0.35); }
    d.flatQuad(Math.min(alt, R.r.u0 + 0.5), Math.max(alt, R.r.u1 - 0.5), vm - 0.55, vm + 0.55, y, 0x8c2f2a, IP.rug, 2.1 + 10);
    for (let u = dir > 0 ? R.r.u0 + 1.5 : R.r.u0 + 3.0; dir > 0 ? u < alt - 1.5 : u < R.r.u1 - 1.0; u += 1.1) {
      for (const [v0, v1] of [[R.r.v0 + 0.5, vm - 0.7], [vm + 0.7, R.r.v1 - 0.5]]) {
        if (v1 - v0 < 1) continue;
        const pr = { u0: u, u1: u + 0.45, v0, v1 };
        if (!F.freeAt(k, pr) || !F.lp(k).rectIn(u, u + 0.45, v0, v1, 0.05)) continue;
        d.box(u, u + 0.45, v0, v1, y + 0.4, y + 0.46, 0x6f4b33, IP.wood);
        d.box(dir > 0 ? u : u + 0.37, dir > 0 ? u + 0.08 : u + 0.45, v0, v1, y, y + 0.95, 0x6f4b33, IP.wood);
        d.box(u + 0.05, u + 0.4, v0, v0 + 0.06, y, y + 0.46, 0x6f4b33, IP.wood);
        d.box(u + 0.05, u + 0.4, v1 - 0.06, v1, y, y + 0.46, 0x6f4b33, IP.wood);
      }
    }
    F.npcs.push([alt - dir * 2.5, vm, y, dir > 0 ? -Math.PI / 2 : Math.PI / 2]);
  };
  // ---- the room ----
  const fan = beachy && (R.type === 'living' || R.type === 'bed' || R.type === 'great');
  if (R.type === 'corridor') corridor();
  else if (R.type === 'church') {
    for (let t = 2; t < R.r.u1 - R.r.u0 - 1; t += 6) { const u = R.r.u0 + t; F.put('dish', () => D.ceilingLight(0.4, 0.4, 0.1), u, vm, cy - 0.12, [1, 0]); F.glow(u, vm, cy - 0.35, 2.2); }
  } else {
    // big rooms get a light every ~5 m (a hall's down the middle of its way along, not over the stair)
    const lr = passage();
    const nu = Math.max(1, Math.round((lr.u1 - lr.u0) / 5)), nv = Math.max(1, Math.round((lr.v1 - lr.v0) / 5));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) lightAt(lr.u0 + ((lr.u1 - lr.u0) * (i + 0.5)) / nu, lr.v0 + ((lr.v1 - lr.v0) * (j + 0.5)) / nv, fan && i + j === 0, nu * nv > 4 ? 0.8 : 1);
  }
  fixtures();
  switch (R.type) {
    // (a flat without a kitchen of its own — a studio — has a kitchenette in the living room)
    case 'living': living(R.unit >= 0 && !F.L.rooms.some((q) => q.unit === R.unit && q.type === 'kitchen')); break;
    case 'great': living(true); diningSet(false); break;
    case 'kitchen': kitchen(true); wallArt(1); break;
    // (a hotel's breakfast room, a school's dining hall: a table every ~12 m²)
    case 'dining': for (let i = 0; i < (house || R.unit >= 0 ? 1 : Math.max(1, Math.min(14, Math.floor(area / 12)))); i++) diningSet(true); wallArt(2); break;
    case 'bed': bedroom(); break;
    case 'bath': bath(); break;
    case 'wc': wcRoom(); break;
    case 'hall': case 'landing': hall(); break;
    case 'lobby': lobby(); break;
    case 'study': study(); break;
    case 'utility': utility(); break;
    case 'closet': case 'store': store(); break;
    case 'meeting': meeting(); break;
    case 'lift': lift(); break;
    case 'open': yield* open(); break;
    case 'shop': yield* shop(); break;
    case 'stock': stockRoom(); break;
    case 'galley': galley(); break;
    case 'cafe': cafe(); break;
    case 'bar': bar(); break;
    case 'diner': diner(); break;
    case 'church': church(); break;
    case 'guest': guest(); break;
    case 'classroom': classroom(); break;
    case 'assembly': assembly(); break;
    case 'staff': staff(); break;
    case 'narthex': narthex(); break;
    case 'prayer': prayer(); break;
    case 'library': library(); break;
    case 'bank': tellers(false); break;
    case 'post': tellers(true); break;
    case 'gym': gym(); break;
    default: break;
  }
  // a lived-in room: a few things in proportion to its floor (fewer than it used to: rooms are real now)
  if (homey && R.type !== 'hall' && R.type !== 'landing') {
    for (let t = 0; t < Math.min(3, Math.floor(area / 10)); t++) {
      const pick = rng.float();
      if (pick < 0.3) { const pl = F.anywhere(R, 0.4, 0.4, 0.2); if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, rng.float() < 0.5); } }
      else if (pick < 0.55) {
        const sb = F.against(R, S, 1.2, 0.45, { tall: false });
        if (sb && sb.side) {
          F.claim(k, sb.r);
          F.put('sideboard', () => D.table(1.2, 0.45, 0.8, 0xffffff), sb.uc, sb.vc, y, sb.ax, wood);
          for (let i = 0; i < 3; i++) F.wbox(sb.side, sb.s0 + 0.15 + i * 0.35, sb.s0 + 0.3 + i * 0.35, 0.12, 0.3, y + 0.8, y + 0.9 + rng.float() * 0.25, F.pick([0x7fa0b8, 0xe0a33b, 0xf1ede4, 0xa65a44]), IP.porcelain);
        }
      } else if (pick < 0.75) {
        const cb = F.against(R, S, 1.0, 0.42);
        if (cb) { F.claim(k, cb.r); F.put(`bench:${WOOD.indexOf(F.wood)}`, () => D.chestBench(1.0, 0.42, F.wood, 0xffffff), cb.uc, cb.vc, y, cb.ax, F.pick(FABRIC)); }
      } else if (pick < 0.9) {
        const rr = F.anywhere(R, 1.8, 1.3, 0.4);
        if (rr) rug(rr.r);
      } else wallArt(1);
    }
  }
}
