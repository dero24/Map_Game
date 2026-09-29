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
import { LocalPoly, wallWindows, type Plan, type Rect, type WinModel } from './plan';
import type { Layout, Room } from './layout';
import { Draw, Instancer, IP, WOOD, type LeafSpot, type Mesher, type P2 } from './mesh';

export interface Light { x: number; y: number; z: number; w: number }
/** [u, v, floor y, yaw, seat height (0: standing), staff (1: placed first)] */
export type NpcSpot = [number, number, number, number, number?, number?];
export const FABRIC = [0x5b7fa6, 0xa65a44, 0x6e8c5a, 0xd9c7a0, 0x7a5b8c, 0x3f6f78, 0xc9a24b, 0x8f8f96, 0xc97b6b, 0x4f6d8f];
const STOCK = [0xd9573f, 0xe0a33b, 0x6e8c5a, 0xf2efe6, 0x5b7fa6, 0xc9a24b, 0x8a4a3a];
const STAFF_AISLE = 0.9; // the working aisle behind a shop, café or bar counter

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
  readonly M: WinModel;
  lights: Light[] = [];
  npcs: NpcSpot[] = [];
  private claims: Rect[][];
  private keepOut: Rect[][];
  readonly use: ReturnType<typeof useOf>;
  readonly wood: number;
  readonly doorHex: number;
  constructor(readonly P: Plan, readonly fp: Footprint, readonly L: Layout, readonly m: Mesher, readonly inst: Instancer, readonly rng: Rng, leaves: LeafSpot[], readonly ceil: (k: number) => number) {
    this.d = new Draw(P, m);
    this.LP = new LocalPoly(P.loc);
    this.M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base };
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
    // doorways: a swing's worth either side, and the leaf standing open
    for (const dw of L.doors) {
      const z = dw.ax === 0 ? { u0: dw.t - dw.w / 2 - 0.15, u1: dw.t + dw.w / 2 + 0.15, v0: dw.c - 1.0, v1: dw.c + 1.0 } : { u0: dw.c - 1.0, u1: dw.c + 1.0, v0: dw.t - dw.w / 2 - 0.15, v1: dw.t + dw.w / 2 + 0.15 };
      this.keepOut[dw.level]?.push(z);
    }
    for (const lf of leaves) {
      const r = lf.ax === 0 ? { u0: lf.hinge - 0.06, u1: lf.hinge + 0.06, v0: Math.min(lf.c, lf.c + lf.side * (lf.w + 0.1)), v1: Math.max(lf.c, lf.c + lf.side * (lf.w + 0.1)) } : { u0: Math.min(lf.c, lf.c + lf.side * (lf.w + 0.1)), u1: Math.max(lf.c, lf.c + lf.side * (lf.w + 0.1)), v0: lf.hinge - 0.06, v1: lf.hinge + 0.06 };
      this.keepOut[lf.level]?.push(r);
    }
    // the front door's swing
    this.keepOut[0]?.push({ u0: P.ud - 0.2, u1: P.ud + 1.7, v0: P.vd - 1.2, v1: P.vd + 1.2 });
  }
  f(k: number) { return this.P.floor0 + k * this.P.floorH; }
  claim(k: number, r: Rect) { this.claims[k]?.push(r); }
  freeAt(k: number, r: Rect) {
    for (const K of this.keepOut[k] ?? []) if (hitR(K, r)) return false;
    for (const K of this.claims[k] ?? []) if (hitR(K, r)) return false;
    return true;
  }
  glow(u: number, v: number, y: number, w: number) { const p = this.d.W(u, v); this.lights.push({ x: p[0], y, z: p[1], w }); }
  pick<T>(a: readonly T[]) { return a[Math.floor(this.rng.float() * a.length)]; }
  /** The sides of a room: walls (with their doorways) from the layout, facade where it's outside. */
  sides(R: Room): Side[] {
    const P = this.P, out: Side[] = [];
    for (const key of ['u0', 'u1', 'v0', 'v1'] as SideKey[]) {
      const run: 0 | 1 = key[0] === 'v' ? 0 : 1;
      const at = R.r[key], o: -1 | 1 = key[1] === '1' ? 1 : -1;
      const lo = run === 0 ? R.r.u0 : R.r.v0, hi = run === 0 ? R.r.u1 : R.r.v1;
      const mid = (lo + hi) / 2;
      const ext = !this.LP.inside(run === 0 ? mid : at + o * 0.25, run === 0 ? at + o * 0.25 : mid);
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
    const h = this.LP.hit(u, v, S.run === 0 ? 0 : S.out, S.run === 0 ? S.out : 0);
    if (!h || h.t > 2) return false;
    const a = this.LP.p[h.i], b = this.LP.p[(h.i + 1) % this.LP.p.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const W = wallWindows(len, k, this.M);
    if (!W) return false;
    const along = h.s * len;
    for (let i = 0; i < W.n; i++) if (Math.abs(along - (i + 0.5) * W.cellW) < W.half + half + 0.08) return true;
    return false;
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
  /** A free spot `w` × `dep` (along u × along v) anywhere in the room, `m` clear of its walls. */
  anywhere(R: Room, w: number, dep: number, m = 0.45, tries = 12): Put | null {
    const r0 = R.r;
    for (let t = 0; t < tries; t++) {
      const u0 = r0.u0 + m + this.rng.float() * Math.max(0, r0.u1 - r0.u0 - w - 2 * m), v0 = r0.v0 + m + this.rng.float() * Math.max(0, r0.v1 - r0.v0 - dep - 2 * m);
      const r = { u0, u1: u0 + w, v0, v1: v0 + dep };
      if (!inside(r0, r, 0.1) || !this.LP.rectIn(r.u0, r.u1, r.v0, r.v1, 0.05) || !this.freeAt(R.level, r)) continue;
      return { r, uc: u0 + w / 2, vc: v0 + dep / 2, ax: [1, 0], s0: u0, s1: u0 + w };
    }
    return null;
  }
  /** A repeated piece (instanced), its x along ax. */
  put(key: string, make: () => D.DecorPart[], uc: number, vc: number, y: number, ax: P2, tint = 0xffffff) { this.inst.put(key, make, uc, vc, y, ax, tint); }
}
const inside = (outer: Rect, r: Rect, m = 0.02) => r.u0 >= outer.u0 - m && r.u1 <= outer.u1 + m && r.v0 >= outer.v0 - m && r.v1 <= outer.v1 + m;

// the yaw that turns a resident (front = local −z) to face (du, dv) in the u/v frame
const yawTo = (du: number, dv: number) => Math.atan2(-du, -dv);
const q = (x: number, s = 0.1) => Math.round(x / s) * s;

/** Furnish one room (a generator: yields between batches in a big one). */
export function* furnishRoom(F: Furnisher, R: Room): Generator<void, void, void> {
  const P = F.P, rng = F.rng, d = F.d, k = R.level;
  const y = F.f(k), cy = F.ceil(k);
  const S = F.sides(R);
  const area = (R.r.u1 - R.r.u0) * (R.r.v1 - R.r.v0);
  const fab = F.pick(FABRIC), wood = rng.float() < 0.5 ? F.wood : F.pick(WOOD);
  const homey = ['living', 'bed', 'dining', 'kitchen', 'study', 'great', 'hall', 'landing'].includes(R.type);
  const um = (R.r.u0 + R.r.u1) / 2, vm = (R.r.v0 + R.r.v1) / 2;
  const house = F.fp.kind === 'house';
  // ---- light: a ceiling fan in a beach house's rooms, else a glowing dish (none over the stairs) ----
  const lightAt = (u: number, v: number, fan: boolean, w = 1) => {
    if (P.holes.some((H) => H.level === k && hitR(grow(H, 0.3), { u0: u, u1: u, v0: v, v1: v })) || P.flights.some((G) => G.level === k && hitR(G, { u0: u, u1: u, v0: v, v1: v }))) return;
    if (fan) F.put(`fan:${WOOD.indexOf(F.wood)}`, () => D.ceilingFan(F.wood), u, v, cy - 0.45, [1, 0]);
    else F.put('dish', () => D.ceilingLight(0.4, 0.4, 0.1), u, v, cy - 0.12, [1, 0]);
    F.glow(u, v, cy - 0.35, w);
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
  const sofa = (p: Put) => {
    F.put('sofa', () => D.sofa(2.1, 0.92, 0xffffff), p.uc, p.vc, y, p.ax, fab);
    // on the cushion, hips forward of the back cushions (the seated pose's hips sit 0.45 up)
    const inw: P2 = [-p.ax[1] * -1, p.ax[0] * -1]; // −z of the piece: out of the wall
    F.npcs.push([p.uc + inw[0] * 0.08, p.vc + inw[1] * 0.08, y, yawTo(inw[0], inw[1]), 0.47]);
  };
  const out = (p: Put): P2 => [p.ax[1], -p.ax[0]]; // the direction a wall piece faces (into the room)
  const living = (withKitchen: boolean) => {
    const sp = F.against(R, S, 2.1, 0.95, { noExt: rng.float() < 0.5 });
    if (sp) {
      F.claim(k, sp.r);
      sofa(sp);
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
    const pl = F.anywhere(R, 0.5, 0.5, 0.2);
    if (pl) { F.claim(k, pl.r); plant(pl.uc, pl.vc, true); }
    const ac = F.anywhere(R, 0.85, 0.85, 0.5);
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
    const sideLen = Math.max(...S.flatMap((x) => x.solid.map(([a, b]) => b - a)), 0);
    const len = Math.min(3.9, Math.max(2.1, q(sideLen - 0.5, 0.3)));
    let kp: Put | null = null;
    for (const L of [len, len - 0.6, len - 1.2]) if (L >= 2.0 && (kp = F.against(R, S, L, 0.64, { tall: true }))) break;
    if (kp) {
      F.claim(k, kp.r);
      const L = q(kp.s1 - kp.s0);
      const cab = rng.float() < 0.6 ? 0xf2efe6 : F.pick([0x9fb3a5, 0x5f7a8c, 0xd9cbb0]);
      F.put(`kitchen:${L.toFixed(1)}`, () => D.kitchenRun(L), kp.uc, kp.vc, y, kp.ax, cab);
      const o = out(kp);
      F.npcs.push([kp.uc + o[0] * 0.42 - kp.ax[0] * 0.3 * (L / 3), kp.vc + o[1] * 0.42 - kp.ax[1] * 0.3 * (L / 3), y, yawTo(-o[0], -o[1])]);
      // (a clear stretch in front of the run)
      F.claim(k, F.wrect(kp.side!, kp.s0, kp.s1, 0.6, 1.5));
    }
    if (dining) diningSet(area > 12);
  };
  const diningSet = (big: boolean) => {
    const w = big ? 1.8 : 1.2, dd = 0.9;
    const tp = F.anywhere(R, w + 1.3, dd + 1.3, 0.25) ?? F.anywhere(R, w + 1.0, dd + 1.0, 0.1);
    if (!tp) return;
    F.claim(k, tp.r);
    const uc = tp.uc, vc = tp.vc;
    const tr = { u0: uc - w / 2, u1: uc + w / 2, v0: vc - dd / 2, v1: vc + dd / 2 };
    table(tr, 0.76, wood);
    const cc = rng.float() < 0.5 ? wood : 0xf1ede4;
    const n = big ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const uu = tr.u0 + (w * (i + 0.5)) / n;
      chair(uu, tr.v0 - 0.32, [0, 1], cc);
      chair(uu, tr.v1 + 0.32, [0, -1], cc);
    }
    if (big) { chair(tr.u0 - 0.34, vc, [1, 0], cc); chair(tr.u1 + 0.34, vc, [-1, 0], cc); }
    d.box(uc - 0.12, uc + 0.12, vc - 0.12, vc + 0.12, y + 0.76, y + 0.86, F.pick([0x7fa0b8, 0xe0a33b, 0xf1ede4]), IP.porcelain);
    F.npcs.push([tr.u0 + w / (2 * n), tr.v0 - 0.3, y, yawTo(0, 1), 0.465]);
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
  const hall = () => {
    // a runner down the hall's length, a console by the door, coats on a rail, a picture or two
    const along = R.r.u1 - R.r.u0 >= R.r.v1 - R.r.v0;
    const rr = along ? { u0: R.r.u0 + 0.5, u1: R.r.u1 - 0.5, v0: vm - 0.35, v1: vm + 0.35 } : { u0: um - 0.35, u1: um + 0.35, v0: R.r.v0 + 0.5, v1: R.r.v1 - 0.5 };
    if (rr.u1 - rr.u0 > 1 && rr.v1 - rr.v0 > 0.5 && F.freeAt(k, rr)) rug(rr);
    if (R.type === 'hall' && k === 0 && house) {
      const cp = F.against(R, S, 0.9, 0.36);
      if (cp) { F.claim(k, cp.r); table(cp.r, 0.8, wood); d.box(cp.uc - 0.1, cp.uc + 0.1, cp.vc - 0.08, cp.vc + 0.08, y + 0.8, y + 0.86, 0xc9a24b, IP.porcelain); }
      const hp = F.against(R, S, 0.9, 0.2);
      if (hp && hp.side) {
        F.claim(k, hp.r);
        F.wbox(hp.side, hp.s0, hp.s1, 0.0, 0.05, y + 1.62, y + 1.7, wood, IP.wood);
        for (let i = 0; i < 3; i++) if (rng.float() < 0.75) F.wbox(hp.side, hp.s0 + 0.1 + i * 0.28, hp.s0 + 0.32 + i * 0.28, 0.03, 0.18, y + 0.9, y + 1.62, F.pick(FABRIC), IP.fabric);
      }
    }
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
  const lobby = () => {
    if (F.fp.kind === 'large') {
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
        if (!F.freeAt(k, g) || !F.LP.rectIn(g.u0, g.u1, g.v0, g.v1, 0.1)) { run = 0; continue; }
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
  const church = () => {
    const dir = P.ud > um ? -1 : 1; // altar at the far end from the door
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
        if (!F.freeAt(k, pr) || !F.LP.rectIn(u, u + 0.45, v0, v1, 0.05)) continue;
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
    // big rooms get a light every ~5 m
    const nu = Math.max(1, Math.round((R.r.u1 - R.r.u0) / 5)), nv = Math.max(1, Math.round((R.r.v1 - R.r.v0) / 5));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) lightAt(R.r.u0 + ((R.r.u1 - R.r.u0) * (i + 0.5)) / nu, R.r.v0 + ((R.r.v1 - R.r.v0) * (j + 0.5)) / nv, fan && i + j === 0, nu * nv > 4 ? 0.8 : 1);
  }
  switch (R.type) {
    // (a flat without a kitchen of its own — a studio — has a kitchenette in the living room)
    case 'living': living(R.unit >= 0 && !F.L.rooms.some((q) => q.unit === R.unit && q.type === 'kitchen')); break;
    case 'great': living(true); diningSet(false); break;
    case 'kitchen': kitchen(true); wallArt(1); break;
    case 'dining': diningSet(true); wallArt(2); break;
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
