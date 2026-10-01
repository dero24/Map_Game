// Interiors, Stage B — rooms, walls and doors (docs/INTERIORS_PLAN.md §3). A pure function of the
// Stage A plan, run on the main thread when a building activates. Every storey is tiled with
// rectangles by the building's family — a house's hall with living rooms and bedrooms off it, a
// block's corridor with flats (hall, bath and kitchen inboard, living room and bedrooms on the
// facade), an office's core with open plan round it, a shop's back of house. Walls go where two
// rooms of different spaces meet, and only reach the facade between windows; doors (0.9 m into a
// flat, 0.8 m inside, ≥ 0.3 m from corners) keep clear of the stairs; every room is reachable
// from the front door, and the collision world gets exactly the walls that are drawn.
import type { Footprint } from '../buildings';
import type { WalkWorld } from '../../player/collision';
import { makeRng, type Rng } from '../../core/rng';
import { useOf } from '../uses';
import { endOK, LocalPoly, rectArea, toW, unstack, plateAt, mainAt, liftCars, LIFT_DOOR, type Band, type Plan, type Rect, type WinModel } from './plan';

export type RoomType =
  | 'hall' | 'landing' | 'corridor' | 'lobby' | 'stair'
  | 'living' | 'kitchen' | 'dining' | 'wc' | 'bath' | 'bed' | 'study' | 'utility' | 'closet' | 'store'
  | 'open' | 'meeting' | 'lift' | 'shaft' | 'void'
  | 'shop' | 'stock' | 'cafe' | 'bar' | 'diner' | 'galley' | 'church' | 'great'
  // Slice 4's deeper archetypes: a hotel's guest rooms, a school's classrooms and hall, a staff room
  // or back office, a church's narthex, a mosque's prayer hall, and the public floors of a library,
  // a bank, a post office and a gym
  | 'guest' | 'classroom' | 'assembly' | 'staff' | 'narthex' | 'prayer' | 'library' | 'bank' | 'post' | 'gym';

export interface Room {
  id: number;
  r: Rect;
  type: RoomType;
  level: number;
  space: number; // rooms of one space have no walls between them (an open plan, a corridor and its lobby)
  unit: number; // the flat it belongs to (-1: none)
  bed?: 1 | 2; // single / double
}
/** A partition on storey `level`: along u (ax 0) at v = c, or along v (ax 1) at u = c, from a to b. */
export interface Wall { level: number; ax: 0 | 1; c: number; a: number; b: number; gaps: [number, number][]; rooms: [number, number] }
/** A doorway in a wall: centre t along it, width w. `front`: a flat's own front door. */
export interface Doorway { level: number; ax: 0 | 1; c: number; t: number; w: number; rooms: [number, number]; front?: boolean }
/** A workstation: its desk centre, facing (0 +u, 1 −u, 2 +v, 3 −v: the way the sitter looks). */
export interface Desk { u: number; v: number; level: number; face: 0 | 1 | 2 | 3 }
/** A fixture a big floor is planned round (Slice 4) — a supermarket's gondola runs, coolers,
 *  freezers, checkouts and produce stands, wall shelving, a pharmacy's dispensary counter, a church's
 *  pews and altar, a library's stacks — its footprint `r` on storey `level`, `face` the way its
 *  front looks (0 +u, 1 −u, 2 +v, 3 −v; a gondola's and a stack's either long side, a checkout's
 *  toward its lane, a pew's toward the altar), `n` modules along it. */
export type FixKind = 'gondola' | 'cooler' | 'freezer' | 'checkout' | 'produce' | 'shelf' | 'counter' | 'pew' | 'altar' | 'stack';
export interface Fixture { kind: FixKind; level: number; r: Rect; face: 0 | 1 | 2 | 3; n: number }
/** A raised floor you step up onto (a chancel's dais, a school hall's stage): `y` above its storey. */
export interface Dais { level: number; r: Rect; y: number }
export interface Layout { rooms: Room[]; walls: Wall[]; doors: Doorway[]; desks: Desk[]; fix: Fixture[]; dais: Dais[]; entry: number; trimmed: number }

const EPS = 1e-6;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
const hitR = (a: Rect, b: Rect, m = 0) => a.u0 < b.u1 + m && a.u1 > b.u0 - m && a.v0 < b.v1 + m && a.v1 > b.v0 - m;
const grow = (r: Rect, m: number): Rect => ({ u0: r.u0 - m, u1: r.u1 + m, v0: r.v0 - m, v1: r.v1 + m });
/** r minus s, as up to four rectangles. */
function minus(r: Rect, s: Rect): Rect[] {
  if (!hitR(r, s)) return [r];
  const out: Rect[] = [];
  if (s.u0 > r.u0 + EPS) out.push({ ...r, u1: s.u0 });
  if (s.u1 < r.u1 - EPS) out.push({ ...r, u0: s.u1 });
  const u0 = Math.max(r.u0, s.u0), u1 = Math.min(r.u1, s.u1);
  if (s.v0 > r.v0 + EPS) out.push({ u0, u1, v0: r.v0, v1: s.v0 });
  if (s.v1 < r.v1 - EPS) out.push({ u0, u1, v0: s.v1, v1: r.v1 });
  return out.filter((q) => q.u1 - q.u0 > 0.05 && q.v1 - q.v0 > 0.05);
}
/** A rect in (along s on axis ax, depth d on the other axis) coordinates. */
const RS = (ax: 0 | 1, s0: number, s1: number, d0: number, d1: number): Rect =>
  ax === 0 ? { u0: Math.min(s0, s1), u1: Math.max(s0, s1), v0: Math.min(d0, d1), v1: Math.max(d0, d1) } : { u0: Math.min(d0, d1), u1: Math.max(d0, d1), v0: Math.min(s0, s1), v1: Math.max(s0, s1) };

interface Link { a: number; b: number; w: number; pref?: number; front?: boolean; wide?: boolean }

class Builder {
  rooms: Room[] = [];
  links: Link[] = [];
  desks: Desk[] = [];
  fix: Fixture[] = [];
  dais: Dais[] = [];
  private sp = 0;
  private unitN = 0;
  private LP0: LocalPoly;
  private M0: WinModel;
  private plates: { LP: LocalPoly; M: WinModel }[];
  constructor(readonly P: Plan, readonly fp: Footprint, public rng: Rng) {
    this.LP0 = new LocalPoly(P.loc);
    this.M0 = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
    this.plates = (P.plates ?? []).map((p) => ({ LP: new LocalPoly(p.loc), M: { ...this.M0, eave: p.eave, glass: !!p.glass } }));
  }
  /** Storey k's outline and window model: the footprint's, or its tier's (a tower's storeys). */
  lp(k: number) { const i = this.plateIdx(k); return i < 0 ? this.LP0 : this.plates[i].LP; }
  wm(k: number) { const i = this.plateIdx(k); return i < 0 ? this.M0 : this.plates[i].M; }
  private plateIdx(k: number) { const pl = this.P.plates ?? []; let i = -1; for (let j = 0; j < pl.length; j++) if (pl[j].from <= k) i = j; return i; }
  space() { return ++this.sp; }
  unit() { return this.unitN++; }
  /** A room. (A lift's shaft is carved out of whatever room it stands in: the rest of that room is
   *  still the one room, its pieces one space; the id is its largest piece's.) */
  add(r: Rect, type: RoomType, level: number, o: { space?: number; unit?: number; bed?: 1 | 2 } = {}) {
    let parts = [r];
    if (type !== 'shaft') for (const L of this.P.lifts ?? []) parts = parts.flatMap((q) => minus(q, L.r));
    // (a sliver a lift or a core leaves is nobody's room: nothing could reach it)
    if (type !== 'shaft') parts = parts.filter((q) => Math.min(q.u1 - q.u0, q.v1 - q.v0) >= 0.35 && rectArea(q) >= 0.6);
    if (!parts.length) return -1;
    const space = o.space ?? this.space();
    let id = -1, best = -1;
    for (const q of parts) {
      const i = this.rooms.length;
      this.rooms.push({ id: i, r: { ...q }, type, level, space, unit: o.unit ?? -1, ...(o.bed ? { bed: o.bed } : {}) });
      if (rectArea(q) > best) (best = rectArea(q)), (id = i);
    }
    return id;
  }
  link(a: number, b: number, w = 0.8, o: { pref?: number; front?: boolean; wide?: boolean } = {}) {
    if (a < 0 || b < 0 || a === b) return;
    this.links.push({ a, b, w, ...o });
  }
  /** Stairs on storey k (flights, landings and the openings that arrive on it), grown by m. */
  keep(k: number, m = 0.1): Rect[] {
    const P = this.P, out: Rect[] = [];
    for (const F of P.flights) if (F.level === k) out.push(grow(F, m));
    for (const L of P.landings) if (L.level === k) out.push(grow(L, m));
    for (const H of P.holes) if (H.level === k) out.push(grow(H, m));
    return out;
  }
  /** A wall at `pos` on axis ax (so it runs along the other axis) ending at depth d heading dir:
   *  clear of the windows on storey k? */
  cutOK(k: number, ax: 0 | 1, pos: number, d: number, dir: -1 | 1) {
    return ax === 0 ? endOK(this.lp(k), this.wm(k), k, pos, d, 0, dir) : endOK(this.lp(k), this.wm(k), k, d, pos, dir, 0);
  }
  /** The position nearest `want` in [lo, hi] (steps of 0.05) where cutOK holds for every end. */
  cut(k: number, ax: 0 | 1, want: number, lo: number, hi: number, ends: [number, -1 | 1][]): number | null {
    if (lo > hi + EPS) return null;
    want = Math.max(lo, Math.min(hi, want));
    for (let o = 0; o <= hi - lo + 0.051; o += 0.05) {
      if (want + o <= hi + EPS && this.endsOK(k, ax, want + o, ends)) return want + o;
      if (o > 0 && want - o >= lo - EPS && this.endsOK(k, ax, want - o, ends)) return want - o;
    }
    return null;
  }
  private endsOK(k: number, ax: 0 | 1, p: number, ends: [number, -1 | 1][]) {
    for (const [d, dir] of ends) if (!this.cutOK(k, ax, p, d, dir)) return false;
    return true;
  }
  /** Is side (u0/u1/v0/v1) of rect r on the facade (of storey k)? */
  onFacade(r: Rect, side: 'u0' | 'u1' | 'v0' | 'v1', k = 0) {
    const m = 0.25;
    const [u, v] = side === 'u0' ? [r.u0 - m, (r.v0 + r.v1) / 2] : side === 'u1' ? [r.u1 + m, (r.v0 + r.v1) / 2] : side === 'v0' ? [(r.u0 + r.u1) / 2, r.v0 - m] : [(r.u0 + r.u1) / 2, r.v1 + m];
    return !this.lp(k).inside(u, v);
  }
}

// ---------------- houses ----------------
type Prog = 'living' | 'kitchen' | 'dining' | 'wc' | 'bath' | 'bed' | 'study' | 'utility' | 'closet';
const BED_D = { a: 11.5, w: 2.75 }, BED_S = { a: 7.5, w: 2.15 };
const minW = (r: Rect) => Math.min(r.u1 - r.u0, r.v1 - r.v0);

/** A living room's opening off the hall: at least this wide (a cased opening, no door) … */
export const LIVING_OPEN = 1.2;
/** … its middle within this angle of the front door's axis, seen from the door (deg): you see into it. */
export const LIVING_ANGLE = 30;
/** A cottage's strip is its living room at the front and its kitchen at the back (one space) when
 *  it's this deep (m); shallower, it's one great room with its kitchen along a wall. */
const GREAT_SPLIT = 6.4;

function houseStorey(B: Builder, k: number) {
  const P = B.P, M = P.main, rng = B.rng;
  // (a cottage's strip is its living room downstairs; upstairs its landing is the stair's lane and
  // a passage beside it, the rest of the strip bedrooms)
  const S = k > 0 && P.land ? P.land : P.strip!;
  const great = !!P.cottage && k === 0;
  const n = P.levels;
  const lane = P.lane;
  const laneLow = lane ? lane.v0 + lane.v1 < S.v0 + S.v1 : true;
  const keep = B.keep(k, 0.12);
  // a wet room in the hall's back end, behind the stair (a WC under the landing, the bathroom
  // above it) — tight behind the stair, or a step further back so a room beside it has a door
  const sType: Prog = n === 1 ? 'bath' : k === 0 ? 'wc' : 'bath';
  const svcs: (Rect | null)[] = [null];
  if (lane) {
    const dog = P.flights.some((F) => F.lo !== undefined && F.lo > 0);
    const offs = k === 0 || dog ? [0.12, 1.3] : [1.0, 1.5];
    for (const off of offs) {
      let u0 = lane.u1 + off;
      // (with the hall against the outside wall, the wet room's front wall meets it: between windows)
      const extLo = S.v0 <= M.v0 + 0.01, extHi = S.v1 >= M.v1 - 0.01;
      if ((laneLow && extLo) || (!laneLow && extHi)) {
        const c = B.cut(k, 0, u0, u0, u0 + 1.2, [[laneLow ? M.v0 + 0.05 : M.v1 - 0.05, laneLow ? -1 : 1]]);
        if (c === null) continue;
        u0 = c;
      }
      const len = M.u1 - u0;
      if (len < (sType === 'wc' ? 1.45 : 2.0)) continue;
      // its long wall faces the passage: on the back wall's piers, the passage ≥ 0.9 wide
      const lo = S.v0 + (laneLow ? 0.95 : 0.9), hi = S.v1 - (laneLow ? 0.9 : 0.95);
      const want = laneLow ? lane.v1 + 0.05 : lane.v0 - 0.05;
      const x = B.cut(k, 1, want, lo, hi, [[M.u1 - 0.05, 1]]);
      if (x === null) continue;
      const r = laneLow ? { u0, u1: M.u1, v0: S.v0, v1: x } : { u0, u1: M.u1, v0: x, v1: S.v1 };
      if (rectArea(r) >= (sType === 'wc' ? 1.3 : 3.2) && minW(r) >= 0.95) svcs.push(r);
    }
  }
  if (lane) {
    // a hall grown wide over a sliver of side: the wet room along the passage, beside the stair
    // (not in a cottage's living room)
    const passW = laneLow ? S.v1 - lane.v1 : lane.v0 - S.v0;
    const need = sType === 'wc' ? 1.3 : 3.2;
    if (passW >= 2.05 && !great) {
      const d = Math.min(1.6, passW - 0.95);
      const len = Math.max(1.5, need / d);
      const u0 = lane.u0 + 0.4, u1 = Math.min(lane.u1 + 0.4, u0 + len);
      if (u1 - u0 >= 1.45 && (u1 - u0) * d >= need) svcs.push(laneLow ? { u0, u1, v0: S.v1 - d, v1: S.v1 } : { u0, u1, v0: S.v0, v1: S.v0 + d });
    }
  } else if (n === 1 && M.u1 - M.u0 > 6 && !great) {
    // a single storey: the bathroom closes the hall's far end (its wall between windows where the
    // hall runs along an outside wall) — a cottage's bathroom is beside its living room
    let u0: number | null = M.u1 - Math.max(2.2, 3.4 / Math.max(0.9, S.v1 - S.v0));
    const ends: [number, -1 | 1][] = [];
    if (S.v0 <= M.v0 + 0.01) ends.push([M.v0 + 0.05, -1]);
    if (S.v1 >= M.v1 - 0.01) ends.push([M.v1 - 0.05, 1]);
    if (ends.length) u0 = B.cut(k, 0, u0, u0 - 1.4, u0 + 0.4, ends);
    if (u0 !== null && u0 > M.u0 + 3 && M.u1 - u0 >= 1.8) svcs.push({ u0, u1: M.u1, v0: S.v0, v1: S.v1 });
  }
  // the sides of the hall, split into rooms at window-cell boundaries
  const sides: { r: Rect; low: boolean }[] = [];
  if (S.v0 - M.v0 > 0.5) sides.push({ r: { u0: M.u0, u1: M.u1, v0: M.v0, v1: S.v0 }, low: true });
  if (M.v1 - S.v1 > 0.5) sides.push({ r: { u0: M.u0, u1: M.u1, v0: S.v1, v1: M.v1 }, low: false });
  const splitsOf = (sd: { r: Rect; low: boolean }): Rect[][] => {
    const r = sd.r, d = sd.low ? M.v0 + 0.05 : M.v1 - 0.05, dir: -1 | 1 = sd.low ? -1 : 1;
    const len = r.u1 - r.u0;
    const out: Rect[][] = [[r]];
    const at = (x: number, lo: number, hi: number) => B.cut(k, 0, x, lo, hi, [[d, dir]]);
    const seen = new Set<string>();
    const push = (cs: number[]) => {
      const key = cs.map((c) => Math.round(c * 10)).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      const b = [r.u0, ...cs, r.u1];
      out.push(b.slice(0, -1).map((u0, i) => ({ ...r, u0, u1: b[i + 1] })));
    };
    for (const f of [0.5, 0.42, 0.58, 0.35, 0.65]) {
      const c = at(r.u0 + len * f, r.u0 + 2.2, r.u1 - 2.2);
      if (c !== null) push([c]);
    }
    if (len >= 6.0 && r.v1 - r.v0 >= 2.2) {
      // three rooms; the middle one may be a narrow wet room or study (≥ 1.6 m)
      for (const [f1, f2] of [[1 / 3, 2 / 3], [0.3, 0.62], [0.38, 0.7], [0.36, 0.6]]) {
        const c1 = at(r.u0 + len * f1, r.u0 + 2.2, r.u1 - 3.8);
        if (c1 === null) continue;
        const c2 = at(Math.max(c1 + 1.6, r.u0 + len * f2), c1 + 1.6, r.u1 - 2.2);
        if (c2 !== null) push([c1, c2]);
      }
    }
    return out;
  };
  const opts = sides.map(splitsOf);
  const combos: Rect[][][] = sides.length === 0 ? [[]] : sides.length === 1 ? opts[0].map((o) => [o]) : opts[0].flatMap((a) => opts[1].map((b) => [a, b]));
  type Cand = { rooms: { r: Rect; low: boolean; t: Prog; hall: number }[]; s: number; svc: Rect | null };
  let best: Cand | null = null;
  for (const svc of svcs) {
    const hallRects = svc ? minus(S, svc) : [S];
    // the hall's edge along a room where a door fits (not along the stair or the wet room)
    const free = (lowSide: boolean, r: Rect): number => {
      const v = lowSide ? S.v0 : S.v1;
      let most = 0;
      for (const h of hallRects) {
        if ((lowSide ? Math.abs(h.v0 - v) : Math.abs(h.v1 - v)) > 0.05) continue;
        let segs: [number, number][] = [[Math.max(h.u0, r.u0) + 0.3, Math.min(h.u1, r.u1) - 0.3]];
        for (const K of keep) {
          if (!(K.v0 < v + 0.75 && K.v1 > v - 0.75)) continue;
          segs = segs.flatMap(([s0, s1]) => (K.u1 <= s0 || K.u0 >= s1 ? [[s0, s1]] : [[s0, K.u0], [K.u1, s1]]) as [number, number][]);
        }
        for (const [s0, s1] of segs) most = Math.max(most, s1 - s0);
      }
      return most;
    };
    // (the same side rectangles recur across combinations: their door stretch once each)
    const seen = new Map<Rect, number>();
    const freeOf = (low: boolean, r: Rect) => {
      let x = seen.get(r);
      if (x === undefined) seen.set(r, (x = free(low, r)));
      return x;
    };
    // (a hall house's living room wants the passage side of the hall, where its wide opening fits:
    // the stair's side has room for a door before the stair at most)
    const passLow = lane ? !laneLow : null;
    // (a wet room along the passage stands where the living room's opening goes: it mustn't leave
    // the hall's wall on that side too short for an opening within 30° of the door's axis)
    const vp = laneLow ? S.v1 : S.v0;
    const blocksLiving = !!svc && !!lane && k === 0 && !great && (laneLow ? svc.v1 >= S.v1 - 0.01 && svc.v0 > S.v0 + 0.01 : svc.v0 <= S.v0 + 0.01 && svc.v1 < S.v1 - 0.01) && svc.u0 < P.ud + Math.abs(vp - P.vd) / Math.tan((LIVING_ANGLE * Math.PI) / 180) + LIVING_OPEN / 2 + 0.3;
    for (const combo of combos) {
      const rs = combo.flatMap((parts, si) => parts.map((r) => ({ r, low: sides[si].low, hall: freeOf(sides[si].low, r) })));
      const c = assign(rs, k, n, !!svc, great, passLow);
      const sc = c.s + rng.float() * 0.4 + (blocksLiving ? 4 : 0);
      if (!best || sc < best.s) best = { rooms: c.rooms, s: sc, svc };
    }
  }
  const svc = best?.svc ?? null;
  const hallSpace = B.space();
  // the hall — or a cottage's living room: at the front, its kitchen behind it in the same space
  // (no wall between) when the strip is deep enough, else one great room
  const stripRects = svc ? minus(S, svc) : [S];
  const hallParts: { r: Rect; t: RoomType }[] = [];
  let cutK: number | null = null;
  if (great) {
    const D = S.u1 - S.u0;
    cutK = D >= GREAT_SPLIT ? S.u1 - Math.max(2.8, Math.min(3.4, D * 0.4)) : null;
    for (const r of stripRects) {
      if (cutK === null) hallParts.push({ r, t: 'great' });
      else {
        if (r.u0 < cutK - 0.05) hallParts.push({ r: { ...r, u1: Math.min(r.u1, cutK) }, t: 'living' });
        if (r.u1 > cutK + 0.05) hallParts.push({ r: { ...r, u0: Math.max(r.u0, cutK) }, t: 'kitchen' });
      }
    }
  } else for (const r of stripRects) hallParts.push({ r, t: k === 0 ? 'hall' : 'landing' });
  const hallIds = hallParts.map((h) => B.add(h.r, h.t, k, { space: hallSpace }));
  /** The free stretches (u) of the hall's edge v along room r, clear of the stair: [hall id, s0, s1]. */
  const stretches = (low: boolean, r: Rect): [number, number, number][] => {
    const v = low ? S.v0 : S.v1, out: [number, number, number][] = [];
    hallIds.forEach((h) => {
      const hr = B.rooms[h]?.r;
      if (!hr || (low ? Math.abs(hr.v0 - v) : Math.abs(hr.v1 - v)) > 0.05) return;
      let segs: [number, number][] = [[Math.max(hr.u0, r.u0) + 0.3, Math.min(hr.u1, r.u1) - 0.3]];
      for (const K of keep) {
        if (!(K.v0 < v + 0.75 && K.v1 > v - 0.75)) continue;
        segs = segs.flatMap(([s0, s1]) => (K.u1 <= s0 || K.u0 >= s1 ? [[s0, s1]] : [[s0, K.u0], [K.u1, s1]]) as [number, number][]);
      }
      for (const [s0, s1] of segs) if (s1 > s0) out.push([h, s0, s1]);
    });
    return out;
  };
  let living = -1, kitchen = -1;
  for (const q of best?.rooms ?? []) {
    const bed = q.t === 'bed' ? (rectArea(q.r) >= BED_D.a && minW(q.r) >= BED_D.w ? 2 : 1) : undefined;
    const id = B.add(q.r, q.t, k, bed ? { bed } : {});
    if (q.t === 'living') living = id;
    if (q.t === 'kitchen') kitchen = id;
    if (q.hall < 0.8) continue;
    const w = q.t === 'living' || q.t === 'kitchen' || q.t === 'dining' ? 0.9 : 0.8;
    const st = stretches(q.low, q.r);
    if (q.t === 'living' && k === 0 && st.length) {
      // the living room opens off the hall through a cased opening (≥ 1.2 m, no door), its middle
      // within 30° of the front door's axis — far enough along the hall that you see into it as you
      // step in: t − ud ≥ |v − vd| · cot 30°
      // (and a few steps in, ~4 m, where it's still ahead of you once you're through the door)
      const v = q.low ? S.v0 : S.v1, near = P.ud + Math.abs(v - P.vd) / Math.tan((LIVING_ANGLE * Math.PI) / 180) + 0.05, want = Math.max(near, P.ud + 4.2);
      let pick: { h: number; w: number; t: number; s: number } | null = null;
      for (const [h, s0, s1] of st)
        for (const ow of [1.6, 1.4, LIVING_OPEN]) {
          if (s1 - s0 < ow) continue;
          const t = Math.max(s0 + ow / 2, Math.min(s1 - ow / 2, want));
          const s = (t < near - 0.01 ? 10 + near - t : 0) + (1.6 - ow) * 2 + Math.abs(t - want) * 0.3;
          if (!pick || s < pick.s) pick = { h, w: ow, t, s };
          break;
        }
      if (pick) { B.link(pick.h, id, pick.w, { pref: pick.t, wide: true }); continue; }
    }
    // (one doorway off the hall: from the part of it with the longest free stretch along the room. A
    // cottage's keep to the ends of its living room's walls and the front of its kitchen's — where the
    // two meet, or by the front wall — so the sofa and the kitchen's run each keep a long wall)
    let bh = -1, bl = 0, pref: number | undefined;
    for (const [h, s0, s1] of st) {
      const kit = great && B.rooms[h].type === 'kitchen';
      const len = s1 - s0 + (kit && s1 - s0 >= 0.8 ? 99 : 0);
      if (len > bl) (bl = len), (bh = h), (pref = !great ? undefined : kit ? s0 + 0.45 : cutK !== null && q.r.u1 >= cutK - 0.05 ? s1 - 0.45 : s0 + 0.45);
    }
    if (bh >= 0) B.link(bh, id, q.hall >= w ? w : 0.8, pref !== undefined ? { pref } : {});
  }
  if (svc) {
    const id = B.add(svc, sType, k);
    // (its door off the part of the hall it shares the most wall with)
    let bh = -1, bl = 0.05;
    for (const h of hallIds) { const e = id >= 0 && B.rooms[h] ? shared(B.rooms[h], B.rooms[id]) : null; if (e && e.b - e.a > bl) (bl = e.b - e.a), (bh = h); }
    if (bh >= 0) B.link(bh, id, 0.8);
  }
  // an open kitchen: a wide opening to the living room when they're side by side
  if (living >= 0 && kitchen >= 0 && rng.float() < 0.55) B.link(living, kitchen, 1.4, { wide: true });
  // (rooms the hall can't reach open off a neighbour: the reachability pass adds those doors)
}

type Slot = { r: Rect; low: boolean; hall: number; a: number };
/** The best-scoring slot that passes `pred`, taken out of `left`. */
function take(left: Slot[], pred: (q: Slot) => boolean, score: (q: Slot) => number): Slot | null {
  let bi = -1, bs = Infinity;
  for (let i = 0; i < left.length; i++) if (pred(left[i])) { const v = score(left[i]); if (v < bs) (bs = v), (bi = i); }
  return bi >= 0 ? left.splice(bi, 1)[0] : null;
}
const ratio = (r: Rect) => Math.max(r.u1 - r.u0, r.v1 - r.v0) / Math.max(0.1, minW(r));
const reach = (q: { hall: number }) => q.hall >= 0.8;

/** Give a storey's rooms their program, scored against real proportions. `great`: a cottage's ground
 *  storey, whose living room and kitchen are its strip (the side rooms are bedrooms, a bathroom, a
 *  study). `passLow`: the side of a hall house's hall away from its stair (its living room's). */
function assign(rs: { r: Rect; low: boolean; hall: number }[], k: number, n: number, service: boolean, great = false, passLow: boolean | null = null) {
  const out: { r: Rect; low: boolean; t: Prog; hall: number }[] = [];
  let s = 0;
  const left: Slot[] = rs.map((q) => ({ ...q, a: rectArea(q.r) })).sort((x, y) => y.a - x.a);
  if (great) {
    if (!service && n > 1) {
      const wc = take(left, (q) => q.a >= 1.3 && q.a <= 7 && reach(q), (q) => q.a);
      if (wc) out.push({ ...wc, t: 'wc' }); else s += 1.2;
    }
    if (n === 1 && !service) {
      const ba = take(left, (q) => q.a >= 3.2 && reach(q), (q) => Math.abs(q.a - 5.5));
      if (ba) out.push({ ...ba, t: 'bath' }); else s += 5;
    }
  } else if (k === 0 || n === 1) {
    // (in a small house, the best room there is — a tight living room beats none; a hall house's on
    // the passage side, where its wide opening fits)
    const side = (q: Slot) => (passLow !== null && q.low !== passLow ? 6 : 0);
    const liv = take(left, (q) => q.a >= 10 && minW(q.r) >= 2.9, (q) => -q.a * (reach(q) ? 1 : 0.6) + q.r.u0 * 0.4 + side(q)) ?? take(left, (q) => q.a >= 7 && minW(q.r) >= 2.3, (q) => -q.a * (reach(q) ? 1 : 0.6) + side(q));
    if (liv) {
      out.push({ ...liv, t: 'living' });
      s += liv.a > 42 ? (liv.a - 42) * 0.08 : 0;
      s += reach(liv) ? 0 : 1.5;
      if (liv.a < 10 || minW(liv.r) < 2.9) s += 3;
      if (passLow !== null && liv.low !== passLow) s += 1;
    } else s += 9;
    const kit = take(left, (q) => q.a >= 6 && minW(q.r) >= 2.2, (q) => -q.a - q.r.u1 * 0.3);
    if (kit) out.push({ ...kit, t: 'kitchen' }); else s += 5;
    if (!service) {
      if (n > 1) {
        // a WC in a small room off the hall, else none downstairs
        const wc = take(left, (q) => q.a >= 1.3 && q.a <= 7 && reach(q), (q) => q.a);
        if (wc) out.push({ ...wc, t: 'wc' }); else s += 1.2;
      }
      if (n === 1) {
        const ba = take(left, (q) => q.a >= 3.2 && q.a <= 9 && reach(q), (q) => q.a);
        if (ba) out.push({ ...ba, t: 'bath' }); else s += 5;
      }
    }
  }
  if (k > 0 || n === 1) {
    if (!service && k > 0) {
      const ba = take(left, (q) => q.a >= 3.2 && reach(q), (q) => q.a);
      if (ba) out.push({ ...ba, t: 'bath' }); else s += 5;
    }
    let beds = 0;
    for (;;) {
      const b = take(left, (q) => q.a >= BED_S.a && minW(q.r) >= BED_S.w, (q) => (reach(q) ? 0 : 50) - q.a);
      if (!b) break;
      out.push({ ...b, t: 'bed' });
      beds++;
      if (!reach(b)) s += 2.5;
    }
    if (k > 0 && beds === 0) s += 12;
    else if (k > 0 && beds === 1) s += 2;
    if (n === 1 && beds === 0) s += 8;
    else if (n === 1 && beds === 1 && rs.reduce((t, q) => t + rectArea(q.r), 0) > 70) s += 2.5;
  }
  // whatever's left: a dining room, a study, a guest bedroom, a utility room or a closet
  for (const q of left) {
    // (a cottage eats in its kitchen: a room beside it downstairs is a den or a guest bedroom)
    const t: Prog = k === 0 && n > 1 && !great && q.a >= 7 && !out.some((o) => o.t === 'dining') ? 'dining'
      : q.a >= 4.5 && !out.some((o) => o.t === 'study') ? 'study'
        : q.a >= BED_S.a && minW(q.r) >= BED_S.w ? 'bed'
          : q.a >= 2 ? 'utility' : 'closet';
    out.push({ ...q, t });
    if (t === 'closet') s += 0.5;
  }
  const count = out.length + (service ? 1 : 0) + (great ? 2 : 0);
  if (count < 3) s += 6 * (3 - count);
  if (count > 6) s += count - 6;
  for (const q of out) {
    const rr = ratio(q.r);
    if (rr > 2.4) s += (rr - 2.4) * 1.2;
    const qa = rectArea(q.r), lim = q.t === 'kitchen' ? 28 : 30;
    if (q.t !== 'living' && qa > lim) s += (qa - lim) * 0.12;
  }
  return { rooms: out, s };
}

// ---------------- flats ----------------
/** Fill a stretch [a, b] of band B with flats; returns their front doors' rooms. */
function fillBand(B: Builder, k: number, band: Band, a: number, b: number, corrIds: number[], typical: Map<string, number[]>, range?: [number, number]) {
  const P = B.P;
  const bd0 = band.ax ? band.r.u0 : band.r.v0, bd1 = band.ax ? band.r.u1 : band.r.v1;
  const facade = band.side < 0 ? bd1 - 0.05 : bd0 + 0.05, fdir: -1 | 1 = band.side < 0 ? 1 : -1;
  const s0 = band.ax ? band.r.v0 : band.r.u0, s1 = band.ax ? band.r.v1 : band.r.u1;
  // unit boundaries: a seeded mix of studios (5.0 m), one-beds (7.2) and two-beds (10.5), the
  // corner flats the largest, every party wall between windows. Typical storeys share them.
  const key = `${band.r.u0.toFixed(2)},${band.r.v0.toFixed(2)},${a.toFixed(2)},${b.toFixed(2)},${k === 0 ? 0 : 1}`;
  let cuts = typical.get(key);
  if (!cuts) {
    const rng = makeRng((P.seed ^ Math.round(a * 97) ^ Math.round(bd0 * 131)) >>> 0);
    cuts = [a];
    let x = a;
    const len = b - a;
    if (band.one || len < 9) cuts.push(b);
    else {
      for (let i = 0; x < b - 0.01; i++) {
        const corner = (x <= s0 + 0.1 && i === 0) || false;
        const r = rng.float();
        const w = corner ? 10.5 : r < 0.25 ? 5.0 : r < 0.7 ? 7.2 : 10.5;
        if (b - x < w + 4.2) { cuts.push(b); break; }
        const c = B.cut(k, band.ax, x + w, x + Math.max(3.6, w - 0.8), Math.min(b - 3.6, x + w + 0.8), [[facade, fdir]]);
        if (c === null) { cuts.push(b); break; }
        cuts.push(c);
        x = c;
      }
      // (the band's last flat is a corner one: grow it over a short neighbour)
      if (cuts.length > 2 && b >= s1 - 0.1 && cuts[cuts.length - 1] - cuts[cuts.length - 2] < 6) cuts.splice(cuts.length - 2, 1);
    }
    typical.set(key, cuts);
  }
  for (let i = 0; i + 1 < cuts.length; i++) {
    const r = RS(band.ax, cuts[i], cuts[i + 1], bd0, bd1);
    if ((cuts[i + 1] - cuts[i]) < 3.2) {
      // too narrow for a flat: a store off the corridor
      const id = B.add(r, 'store', k);
      for (const c of corrIds) B.link(c, id, 0.9);
      continue;
    }
    flat(B, k, r, band.ax, band.side, corrIds, range);
  }
}

/** A flat in rect r, entered from its `side` edge (on the axis across `ax`): hall, bath and kitchen
 *  inboard; the living room and bedrooms on the facade. `range`: where along the entry edge its
 *  front door can go (a walk-up's landing ends at the stair). */
function flat(B: Builder, k: number, r: Rect, ax: 0 | 1, side: -1 | 1, entry: number[], range?: [number, number]) {
  // (typical storeys share their walls: the same choices on every storey above the ground)
  const rng = makeRng((B.P.seed ^ Math.round(r.u0 * 131 + r.v0 * 71) ^ (k ? 0x9e37 : 0)) >>> 0);
  const U = B.unit();
  const s0 = ax ? r.v0 : r.u0, s1 = ax ? r.v1 : r.u1;
  const e = side < 0 ? (ax ? r.u0 : r.v0) : ax ? r.u1 : r.v1; // the entry edge (depth coordinate)
  const f = side < 0 ? (ax ? r.u1 : r.v1) : ax ? r.u0 : r.v0; // the facade edge
  const dsgn = (f > e ? 1 : -1) as -1 | 1; // depth grows from the entry toward the facade
  const dep = Math.abs(f - e), w = s1 - s0;
  const D = (d0: number, d1: number, a0: number, a1: number) => RS(ax, a0, a1, e + dsgn * d0, e + dsgn * d1);
  const cutOut = (want: number, lo: number, hi: number) => B.cut(k, ax, want, lo, hi, [[f - dsgn * 0.05, dsgn]]);
  const [ra, rb] = range ? [Math.max(s0, range[0]), Math.min(s1, range[1])] : [s0, s1];
  // the inboard band (entry side): deeper flats keep rooms within ~8.5 m of the glass
  // (facade rooms at most ~6.8 m deep: a deep flat's inboard band takes stores and the utility)
  let di = Math.max(2.4, Math.min(4.6, dep - 6.8, Math.max(dep * 0.34, 2.4)));
  if (dep - di > 6.8) di = Math.min(dep - 2.6, dep - 6.8);
  // at the building's ends the inboard wall meets the end facade: between its windows
  const ends: [number, -1 | 1][] = [];
  if (B.onFacade(r, ax ? 'v0' : 'u0', k)) ends.push([s0 + 0.05, -1]);
  if (B.onFacade(r, ax ? 'v1' : 'u1', k)) ends.push([s1 - 0.05, 1]);
  if (ends.length) {
    const oax: 0 | 1 = ax ? 0 : 1;
    const want = e + dsgn * di;
    const c = B.cut(k, oax, want, Math.min(want, e + dsgn * 2.2), Math.max(want, e + dsgn * 2.2), ends) ?? B.cut(k, oax, want, Math.min(want, e + dsgn * 3.6), Math.max(want, e + dsgn * 3.6), ends);
    if (c !== null) di = Math.abs(c - e);
  }
  const doDep = dep - di;
  if (w < 3.2 || dep < 4.5 || doDep < 2.4 || rb - ra < 1.5) {
    // a bedsit: one room
    const id = B.add(r, 'living', k, { unit: U });
    for (const c of entry) B.link(c, id, 0.9, { front: true, pref: (ra + rb) / 2 });
    return;
  }
  // facade rooms: the living room at one end, bedrooms (≥ 2.75 m: doubles) along the rest, each
  // wall between the facade's windows
  const nb = Math.max(0, Math.min(w < 5.6 ? 0 : w < 8.2 ? 1 : w < 11.2 ? 2 : 3, Math.floor((w - 3.4) / 2.8)));
  const livW = Math.max(3.4, Math.min(38 / doDep, w - nb * 2.8, w * (nb ? 0.42 : 1)));
  const livLow = rng.float() < 0.5;
  // (a bedroom is ≥ 2.3 m wide — a double once it's 2.75 — so a party wall can find a pier)
  const tw: number[] = nb ? (livLow ? [livW, ...Array(nb).fill((w - livW) / nb)] : [...Array(nb).fill((w - livW) / nb), livW]) : [w];
  const mins = nb ? (livLow ? [3.2, ...Array(nb).fill(2.3)] : [...Array(nb).fill(2.3), 3.2]) : [w];
  const bounds = [s0];
  let x = s0;
  for (let i = 0; i + 1 < tw.length; i++) {
    const restMin = mins.slice(i + 1).reduce((p, q) => p + q, 0);
    const lo = x + mins[i], hi = s1 - restMin;
    // near the target first, then anywhere it can go
    const c = lo <= hi ? cutOut(x + tw[i], Math.max(lo, x + tw[i] - 0.9), Math.min(hi, x + tw[i] + 0.9)) ?? cutOut(x + tw[i], lo, hi) : null;
    if (c === null) { tw[i + 1] += tw[i]; mins[i + 1] = Math.max(mins[i + 1], mins[i]); continue; } // (merged)
    bounds.push(c);
    x = c;
  }
  bounds.push(s1);
  {
    // a living room still over 38 m² gives a bedroom up at its far end
    const li = livLow ? 0 : bounds.length - 2;
    const lw0 = bounds[li + 1] - bounds[li];
    if (lw0 * doDep > 38 && lw0 >= 3.4 + 2.3) {
      const at = livLow ? cutOut(bounds[li] + Math.max(3.4, 30 / doDep), bounds[li] + 3.4, bounds[li + 1] - 2.3) : cutOut(bounds[li + 1] - Math.max(3.4, 30 / doDep), bounds[li] + 2.3, bounds[li + 1] - 3.4);
      if (at !== null) bounds.splice(li + 1, 0, at);
    }
  }
  const livIdx = livLow ? 0 : bounds.length - 2;
  const outs = bounds.slice(0, -1).map((b0, i) => ({ a0: b0, a1: bounds[i + 1], t: (i === livIdx ? 'living' : 'bed') as RoomType }));
  const liv = outs[livIdx];
  const bedOf = (q: { a0: number; a1: number }) => ((q.a1 - q.a0 >= 2.75 && (q.a1 - q.a0) * doDep >= 11.5 ? 2 : 1) as 1 | 2);
  const hw = 1.5;
  const idOf = new Map<{ a0: number; a1: number; t: RoomType }, number>();
  const want = Math.max(ra, Math.min(rb - hw, (Math.max(liv.a0, ra) + Math.min(liv.a1, rb)) / 2 - hw / 2));
  const h0 = Math.max(s0, Math.min(s1 - hw, want)), h1 = h0 + hw;
  const beds = outs.filter((o) => o !== liv);
  if (beds.length >= 2 && di >= 2.6) {
    // a flat with a hallway: the hall at the front door, a 1.1 m passage along the bedrooms, the
    // bath and stores between it and the corridor, the kitchen at the living room's end
    let sd = 1.1;
    if (ends.length) {
      const oax: 0 | 1 = ax ? 0 : 1;
      const c = B.cut(k, oax, e + dsgn * (di - 1.1), Math.min(e + dsgn * (di - 1.6), e + dsgn * (di - 0.95)), Math.max(e + dsgn * (di - 1.6), e + dsgn * (di - 0.95)), ends);
      if (c !== null) sd = di - Math.abs(c - e);
    }
    const d1 = di - sd;
    const towardHi = livLow; // the bedrooms lie toward s1 when the living room is at s0
    const far = towardHi ? s1 : s0;
    const hallSpace = B.space();
    const hall = B.add(D(0, di, h0, h1), 'hall', k, { unit: U, space: hallSpace });
    const pass = towardHi ? B.add(D(d1, di, h1, far), 'hall', k, { unit: U, space: hallSpace }) : B.add(D(d1, di, far, h0), 'hall', k, { unit: U, space: hallSpace });
    for (const c of entry) B.link(c, hall, 0.9, { front: true, pref: (Math.max(h0, ra) + Math.min(h1, rb)) / 2 });
    // the entry layer beyond the hall: bath, then utility and closets (≤ 2.6 m each)
    const layer: [number, number] = towardHi ? [h1, s1] : [s0, h0];
    const len = layer[1] - layer[0];
    const bathW = Math.min(2.4, Math.max(1.8, len));
    const pieces: { a0: number; a1: number; t: RoomType }[] = [];
    if (len >= 1.7) {
      const b0 = towardHi ? layer[0] : layer[1] - bathW;
      pieces.push({ a0: b0, a1: b0 + bathW, t: 'bath' });
      let x = towardHi ? b0 + bathW : b0;
      const rest = towardHi ? layer[1] - x : x - layer[0];
      const n = rest < 1.0 ? 0 : Math.max(1, Math.round(rest / 2.6));
      for (let i = 0; i < n; i++) {
        const wd = rest / n;
        const q = towardHi ? { a0: x, a1: x + wd, t: (wd >= 2.2 ? 'utility' : 'closet') as RoomType } : { a0: x - wd, a1: x, t: (wd >= 2.2 ? 'utility' : 'closet') as RoomType };
        pieces.push(q);
        x = towardHi ? x + wd : x - wd;
      }
      if (n === 0 && rest > 0.01) { const bq = pieces[0]; if (towardHi) bq.a1 = layer[1]; else bq.a0 = layer[0]; }
    }
    for (const q of pieces) {
      const id = B.add(D(0, d1, q.a0, q.a1), q.t, k, { unit: U });
      B.link(pass, id, 0.8);
      B.link(hall, id, 0.8);
    }
    // the kitchen: the inboard band at the living room's end, open to it
    const kit: [number, number] = towardHi ? [s0, h0] : [h1, s1];
    if (kit[1] - kit[0] >= 1.8) {
      const id = B.add(D(0, di, kit[0], kit[1]), 'kitchen', k, { unit: U });
      B.link(hall, id, 0.8);
      idOf.set(liv, -1);
      const lid = B.add(D(di, dep, liv.a0, liv.a1), 'living', k, { unit: U });
      idOf.set(liv, lid);
      B.link(lid, id, rng.float() < 0.6 ? 1.4 : 0.8, { wide: true });
    } else {
      // (no room for it: the hall takes that end, a kitchenette in the living room)
      if (kit[1] - kit[0] > 0.01) B.add(D(0, di, kit[0], kit[1]), 'hall', k, { unit: U, space: hallSpace });
      idOf.set(liv, B.add(D(di, dep, liv.a0, liv.a1), 'living', k, { unit: U }));
    }
    const lid = idOf.get(liv)!;
    B.link(hall, lid, 0.9);
    B.link(pass, lid, 0.9);
    for (const o of beds) {
      const id = B.add(D(di, dep, o.a0, o.a1), 'bed', k, { unit: U, bed: bedOf(o) });
      B.link(pass, id, 0.8);
      B.link(hall, id, 0.8);
    }
    return;
  }
  // a small flat: the hall under the living room (its door straight into it), the bath beside it,
  // the kitchen on its other side toward the living room's end — in a studio too narrow for both,
  // the hall at one end and the bath beside it (a kitchenette in the living room)
  const inb: { a0: number; a1: number; t: RoomType }[] = [];
  let [g0, g1] = [h0, h1];
  if (h0 - s0 < 1.7 && s1 - h1 < 1.7) {
    if (ra <= s0 + 0.01 && s1 - s0 - hw >= 1.7) [g0, g1] = [s0, s0 + hw];
    else if (rb >= s1 - 0.01 && s1 - s0 - hw >= 1.7) [g0, g1] = [s1 - hw, s1];
  }
  const lo = [s0, g0], hi = [g1, s1];
  const bathHi = hi[1] - hi[0] >= 1.7 && (lo[1] - lo[0] < 1.7 || (livLow ? true : hi[1] - hi[0] > lo[1] - lo[0] + 1));
  const bathPart = bathHi ? hi : lo, kitPart = bathHi ? lo : hi;
  let hallA0 = g0, hallA1 = g1;
  if (bathPart[1] - bathPart[0] >= 1.7) {
    const bw = Math.min(bathPart[1] - bathPart[0], 2.4);
    const b0 = bathHi ? bathPart[0] : bathPart[1] - bw, b1 = b0 + bw;
    inb.push({ a0: b0, a1: b1, t: 'bath' });
    const rest = bathHi ? [b1, bathPart[1]] : [bathPart[0], b0];
    if (rest[1] - rest[0] >= 1.2) inb.push({ a0: rest[0], a1: rest[1], t: rest[1] - rest[0] >= 2.6 ? 'utility' : 'closet' });
    else if (rest[1] - rest[0] > 0.01) { const bq = inb[inb.length - 1]; bq.a0 = Math.min(bq.a0, rest[0]); bq.a1 = Math.max(bq.a1, rest[1]); }
  } else if (bathHi) hallA1 = s1; else hallA0 = s0;
  if (kitPart[1] - kitPart[0] >= 1.8) inb.push({ a0: kitPart[0], a1: kitPart[1], t: 'kitchen' });
  else if (kitPart[1] - kitPart[0] > 0.01) { if (bathHi) hallA0 = s0; else hallA1 = s1; }
  const hallQ = { a0: hallA0, a1: hallA1, t: 'hall' as RoomType };
  inb.push(hallQ);
  for (const q of inb) idOf.set(q, B.add(D(0, di, q.a0, q.a1), q.t, k, { unit: U }));
  for (const q of outs) idOf.set(q, B.add(D(di, dep, q.a0, q.a1), q.t, k, { unit: U, ...(q.t === 'bed' ? { bed: bedOf(q) } : {}) }));
  const hall = idOf.get(hallQ)!;
  for (const c of entry) B.link(c, hall, 0.9, { front: true, pref: (Math.max(hallA0, ra) + Math.min(hallA1, rb)) / 2 });
  const livId = idOf.get(liv)!;
  // the hall opens into whichever facade room it's under (the living room when it can)
  for (const o of outs) if (overlap(o.a0, o.a1, hallA0, hallA1) >= 1.4) B.link(hall, idOf.get(o)!, 0.8);
  for (const q of inb) if (q !== hallQ) {
    const id = idOf.get(q)!;
    B.link(hall, id, 0.8);
    if (q.t === 'kitchen' && overlap(q.a0, q.a1, liv.a0, liv.a1) >= 1.5) B.link(livId, id, rng.float() < 0.6 ? 1.4 : 0.8, { wide: true });
    // a store or utility room opens off the bedroom behind it
    if (q.t === 'closet' || q.t === 'utility') for (const o of outs) if (o.t === 'bed' && overlap(o.a0, o.a1, q.a0, q.a1) >= 1.4) B.link(idOf.get(o)!, id, 0.8);
  }
  for (const o of outs) if (o !== liv) B.link(livId, idOf.get(o)!, 0.8);
}

function flatsStorey(B: Builder, k: number, typical: Map<string, number[]>) {
  const P = B.P;
  const circ = B.space();
  const corr = (P.spine ?? []).map((r) => B.add(r, 'corridor', k, { space: circ }));
  const ground = k === 0;
  const walkup = (P.bands ?? []).some((b) => b.one);
  if (walkup) {
    // the slot at the front door: lobby (ground) / landing, the dogleg at its back
    const core = P.cores?.[0];
    const slot = core ? core.room : P.lobby!;
    corr.push(B.add(slot, ground ? 'lobby' : 'landing', k, { space: circ }));
  } else {
    // (over a shop the lobby slot is just part of its band)
    if (ground && P.lobby && P.arch === 'flats') corr.push(B.add(P.lobby, 'lobby', k, { space: circ }));
    for (const c of P.cores ?? []) {
      // (a tall block's core has its lift: the stair room is the lift lobby too)
      const id = B.add(c.room, P.lifts?.some((L) => hitR(L.r, c.room, -0.05)) ? 'lift' : 'stair', k);
      for (const q of corr) B.link(q, id, 0.9);
      // (the rest of its slot: a store off the stair room)
      if (c.slot) for (const r of minus(c.slot, c.room)) B.link(id, B.add(r, 'store', k), 0.8);
    }
  }
  if (P.core) {
    // the ring's core: stores between its stair rooms, ~6 m long, split down the middle when it's
    // deep (each half still on the ring)
    const rest = (P.cores ?? []).reduce<Rect[]>((acc, c) => acc.flatMap((r) => minus(r, c.room)), [P.core]);
    for (const r of rest) {
      const along = r.u1 - r.u0 >= r.v1 - r.v0 ? 0 : 1;
      const len = along ? r.v1 - r.v0 : r.u1 - r.u0, dep = along ? r.u1 - r.u0 : r.v1 - r.v0;
      const n = Math.max(1, Math.round(len / 6));
      for (let i = 0; i < n; i++) {
        const a0 = (along ? r.v0 : r.u0) + (len * i) / n, a1 = (along ? r.v0 : r.u0) + (len * (i + 1)) / n;
        const d0 = along ? r.u0 : r.v0, halves: [number, number][] = dep > 6 ? [[d0, d0 + dep / 2], [d0 + dep / 2, d0 + dep]] : [[d0, d0 + dep]];
        for (const [x0, x1] of halves) {
          const id = B.add(RS(along ? 1 : 0, a0, a1, x0, x1), 'store', k);
          for (const c of corr) B.link(c, id, 0.9);
        }
      }
    }
  }
  (P.bands ?? []).forEach((band) => {
    const s0 = band.ax ? band.r.v0 : band.r.u0, s1 = band.ax ? band.r.v1 : band.r.u1;
    // the band's stretches between the lobby and the stair cores
    let stretch: [number, number][] = [[s0, s1]];
    const cut = (r: Rect) => {
      if (!hitR(r, band.r, -0.05)) return;
      const a = band.ax ? r.v0 : r.u0, b = band.ax ? r.v1 : r.u1;
      stretch = stretch.flatMap(([x, y]) => (b <= x + EPS || a >= y - EPS ? [[x, y]] : [[x, a], [b, y]]) as [number, number][]).filter(([x, y]) => y - x > 0.3);
    };
    if (!walkup) {
      if (ground && P.lobby && P.arch === 'flats') cut(P.lobby);
      for (const c of P.cores ?? []) cut(c.slot ?? c.room);
    }
    for (const [a, b] of stretch) {
      if (b - a < 2.4) {
        const id = B.add(RS(band.ax, a, b, band.ax ? band.r.u0 : band.r.v0, band.ax ? band.r.u1 : band.r.v1), 'store', k);
        for (const c of corr) B.link(c, id, 0.8);
        continue;
      }
      // the lobby slot on the storeys above: a flat of its own
      // (a walk-up's flats open onto the landing in front of the stair)
      const st = walkup ? P.cores?.[0]?.stair : undefined;
      const slot = walkup ? (P.cores?.[0]?.room ?? P.lobby!) : undefined;
      fillBand(B, k, band, a, b, corr, typical, slot ? [slot.u0 + 0.1, (st ? st.u0 : slot.u1) - 0.25] : undefined);
    }
  });
}

// ---------------- hotels and schools (Slice 4) ----------------
/** A band's ends: its depth edges, the facade line its party walls meet and which way that is, the
 *  corridor edge and the way depth grows from it. */
function bandFrame(band: Band) {
  const bd0 = band.ax ? band.r.u0 : band.r.v0, bd1 = band.ax ? band.r.u1 : band.r.v1;
  const facade = band.side < 0 ? bd1 - 0.05 : bd0 + 0.05, fdir: -1 | 1 = band.side < 0 ? 1 : -1;
  const e = band.side < 0 ? bd0 : bd1, dsg: -1 | 1 = band.side < 0 ? 1 : -1;
  return { bd0, bd1, dep: bd1 - bd0, facade, fdir, e, dsg };
}
/** Cuts along a band's stretch [a, b] into rooms `want` wide (each lo–hi), every party wall meeting
 *  the facade between its windows — chosen together (a short-sighted pick lands a wall at a pier's
 *  far edge and the next room has nowhere to end): on a 5 cm grid, the walls whose rooms come out
 *  nearest the width wanted, a room outside lo–hi (a store, a bigger room) only where no pier
 *  allows better. `first`: [want, lo, hi] of a room at the start (a school's WCs). Typical storeys
 *  share them. */
function bandCuts(B: Builder, k: number, band: Band, a: number, b: number, typical: Map<string, number[]>, tag: string, lo: number, hi: number, want: number, first?: [number, number, number]) {
  const key = `${tag}${band.r.u0.toFixed(2)},${band.r.v0.toFixed(2)},${a.toFixed(2)},${b.toFixed(2)},${k === 0 ? 0 : 1}`;
  let cuts = typical.get(key);
  if (cuts) return cuts;
  const { facade, fdir } = bandFrame(band);
  const G = 0.1, N = Math.max(1, Math.round((b - a) / G));
  const x = (j: number) => (j === N ? b : a + j * G);
  const ok: number[] = []; // (the grid's wall positions, in order)
  for (let j = 0; j <= N; j++) if (j === 0 || j === N || B.cutOK(k, band.ax, x(j), facade, fdir)) ok.push(j);
  // (a room's cost: its miss from the width wanted; out of range — a store under it, a big room
  // over it — dearly)
  const cost = (w: number, i: number) => {
    if (i === 0 && first) return w >= first[1] - 1e-6 && w <= first[2] + 1e-6 ? (w - first[0]) ** 2 : Infinity;
    if (w >= lo - 1e-6 && w <= hi + 1e-6) return (w - want) ** 2;
    if (w < lo) return w < 1.2 ? Infinity : 6 + (lo - w) * 2;
    return w > hi + 2.5 ? Infinity : 6 + (w - hi) * 4;
  };
  const best = new Float64Array(N + 1).fill(Infinity), from = new Int32Array(N + 1).fill(-1), nth = new Int32Array(N + 1);
  best[0] = 0;
  const jmin = Math.max(1, Math.floor(1.2 / G)), jmax = Math.ceil((hi + 2.5) / G);
  let lo0 = 0;
  for (let q = 1; q < ok.length; q++) {
    const j = ok[q];
    while (ok[lo0] < j - jmax) lo0++;
    for (let p = lo0; p < q && ok[p] <= j - jmin; p++) {
      const i = ok[p];
      if (best[i] === Infinity) continue;
      const c = best[i] + cost(x(j) - x(i), nth[i]);
      if (c < best[j] - 1e-9) (best[j] = c), (from[j] = i), (nth[j] = nth[i] + 1);
    }
  }
  cuts = [b];
  if (best[N] < Infinity) for (let j = from[N]; j > 0; j = from[j]) cuts.push(x(j));
  cuts.push(a);
  cuts.reverse();
  typical.set(key, cuts);
  return cuts;
}

/** Hotel rooms along a band's stretch (§2: 25–35 m², a ~4 m bay off a 1.8 m corridor): the
 *  bathroom inboard by the corridor, the entry passage beside it open to the bedroom on the facade —
 *  in mirrored pairs, so two bathrooms share a wall. A sliver left over is a linen store. */
function guestRooms(B: Builder, k: number, band: Band, a: number, b: number, corr: number[], typical: Map<string, number[]>) {
  const { dep, e, dsg } = bandFrame(band);
  const lo = Math.max(3.0, 25 / dep), hi = Math.max(lo + 0.5, Math.min(5.8, 35 / dep)), want = Math.min(hi, Math.max(lo, 30 / dep));
  const cuts = bandCuts(B, k, band, a, b, typical, 'g', lo, hi, want);
  const D = (d0: number, d1: number, a0: number, a1: number) => RS(band.ax, a0, a1, e + dsg * d0, e + dsg * d1);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s0 = cuts[i], s1 = cuts[i + 1], w = s1 - s0;
    if (w < 2.8) {
      const id = B.add(D(0, dep, s0, s1), 'store', k);
      for (const c of corr) B.link(c, id, 0.8);
      continue;
    }
    const U = B.unit(), sp = B.space();
    // the bath 2.5 m deep, up to 2.3 m wide; the passage beside it ≥ 1.5 m (a door and its casings)
    const di = dep >= 6.4 ? 2.5 : Math.max(1.9, dep - 3.6), bw = Math.min(2.3, w - 1.5);
    if (dep - di < 2.6 || bw < 1.5) {
      const id = B.add(D(0, dep, s0, s1), 'guest', k, { unit: U, space: sp, bed: 2 });
      for (const c of corr) B.link(c, id, 0.9, { front: true });
      continue;
    }
    const high = i % 2 === 0; // (rooms 0 and 1 back their baths onto the wall between them)
    const [b0, b1] = high ? [s1 - bw, s1] : [s0, s0 + bw];
    const [p0, p1] = high ? [s0, s1 - bw] : [s0 + bw, s1];
    B.add(D(di, dep, s0, s1), 'guest', k, { unit: U, space: sp, bed: 2 });
    const entry = B.add(D(0, di, p0, p1), 'hall', k, { unit: U, space: sp });
    const bath = B.add(D(0, di, b0, b1), 'bath', k, { unit: U });
    for (const c of corr) B.link(c, entry, 0.9, { front: true, pref: (p0 + p1) / 2 });
    B.link(entry, bath, 0.8);
  }
}

/** Classrooms along a band's stretch (§2: 50–62 m² for 30 pupils, 50–65 here), each with its own
 *  door off the corridor; what's left between them is the pupils' WCs, a staff room or a store.
 *  `wc`: the stretch starts with a block of WCs. */
function classRooms(B: Builder, k: number, band: Band, a: number, b: number, corr: number[], typical: Map<string, number[]>, wc: boolean) {
  const { bd0, bd1, dep } = bandFrame(band);
  const lo = Math.max(5.6, 50 / dep), hi = Math.max(lo + 0.8, 65 / dep), want = Math.min(hi, Math.max(lo, 57 / dep));
  const cuts = bandCuts(B, k, band, a, b, typical, wc ? 'cw' : 'c', lo, hi, want, wc ? [3.2, 2.6, 4.4] : undefined);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s0 = cuts[i], s1 = cuts[i + 1], w = s1 - s0;
    const t: RoomType = wc && i === 0 && w < lo ? 'wc' : w >= lo - 0.01 ? 'classroom' : w * dep >= 14 ? 'staff' : w >= 2.4 ? 'wc' : 'store';
    const id = B.add(RS(band.ax, s0, s1, bd0, bd1), t, k);
    for (const c of corr) B.link(c, id, 0.9, t === 'classroom' ? { pref: s0 + 1.2 } : {});
  }
}

/** Beside a hotel's or a school's lobby (a ground storey that has one): a room of type t about
 *  `len` long at the stretch's end `at` (+1: its high end, −1: its low end), its wall meeting the
 *  facade between the windows — the whole stretch when that leaves too little. Returns what's left. */
function besideLobby(B: Builder, k: number, band: Band, a: number, b: number, at: -1 | 1, t: RoomType, len: number, lobby: number, corr: number[]): [number, number] {
  const { bd0, bd1, facade, fdir } = bandFrame(band);
  const wide = t === 'dining' || t === 'assembly';
  const room = (p: number, q: number) => {
    const id = B.add(RS(band.ax, p, q, bd0, bd1), t, k);
    B.link(lobby, id, wide ? 1.6 : 0.9, wide ? { wide: true } : {});
    for (const c of corr) if (c !== lobby) B.link(c, id, 0.9);
  };
  if (b - a < 2.4) return [a, b];
  if (b - a < len + 2.6) { room(a, b); return [b, b]; }
  const want = at > 0 ? b - len : a + len;
  const x = B.cut(k, band.ax, want, at > 0 ? Math.max(a + 2.6, want - 2) : Math.max(a + 2.4, want - 2), at > 0 ? Math.min(b - 2.4, want + 2) : Math.min(b - 2.6, want + 2), [[facade, fdir]]);
  if (x === null) return [a, b];
  if (at > 0) room(x, b); else room(a, x);
  return at > 0 ? [a, x] : [x, b];
}

/** A hotel's or a school's corridor storey: its corridors (the lobby at the door on a ground storey
 *  that has one), the stair cores, and bands of guest rooms or classrooms off them. */
function stripStorey(B: Builder, k: number, typical: Map<string, number[]>, fam: 'hotel' | 'school') {
  const P = B.P;
  const circ = B.space();
  const corr = (P.spine ?? []).map((r) => B.add(r, 'corridor', k, { space: circ }));
  const lobby = k === 0 && P.lobby ? B.add(P.lobby, 'lobby', k, { space: circ }) : -1;
  if (lobby >= 0) corr.push(lobby);
  for (const c of P.cores ?? []) {
    const id = B.add(c.room, P.lifts?.some((L) => hitR(L.r, c.room, -0.05)) ? 'lift' : 'stair', k);
    for (const q of corr) B.link(q, id, 0.9);
    if (c.slot) for (const r of minus(c.slot, c.room)) B.link(id, B.add(r, 'store', k), 0.8);
  }
  if (P.core) {
    // (a ring's core: stores and WCs between its stair rooms, off the ring)
    const rest = (P.cores ?? []).reduce<Rect[]>((acc, c) => acc.flatMap((r) => minus(r, c.room)), [P.core]);
    rest.forEach((r, i) => {
      const id = B.add(r, i % 2 ? 'store' : fam === 'school' ? 'wc' : 'store', k);
      for (const c of corr) B.link(c, id, 0.9);
    });
  }
  let wcDone = fam !== 'school';
  for (const band of P.bands ?? []) {
    const s0 = band.ax ? band.r.v0 : band.r.u0, s1 = band.ax ? band.r.v1 : band.r.u1;
    let stretch: [number, number][] = [[s0, s1]];
    const cut = (r: Rect) => {
      if (!hitR(r, band.r, -0.05)) return;
      const x = band.ax ? r.v0 : r.u0, y = band.ax ? r.v1 : r.u1;
      stretch = stretch.flatMap(([p, q]) => (y <= p + EPS || x >= q - EPS ? [[p, q]] : [[p, x], [y, q]]) as [number, number][]).filter(([p, q]) => q - p > 0.3);
    };
    const lob = lobby >= 0 && hitR(P.lobby!, band.r, -0.05) ? P.lobby! : null;
    if (lob) cut(lob);
    for (const c of P.cores ?? []) cut(c.slot ?? c.room);
    if (lob) {
      // the lobby's own rooms: the big one (a hotel's breakfast room, a school's hall: §3 "lobby and
      // bar / hall and office") on its longer side, the office on the other — both on the one side
      // there is, the office nearer
      const { dep } = bandFrame(band);
      const l0 = band.ax ? lob.v0 : lob.u0, l1 = band.ax ? lob.v1 : lob.u1;
      const before = stretch.findIndex(([, q]) => Math.abs(q - l0) < 0.05), after = stretch.findIndex(([p]) => Math.abs(p - l1) < 0.05);
      const len = (i: number) => (i >= 0 ? stretch[i][1] - stretch[i][0] : -1);
      const bigT: RoomType = fam === 'hotel' ? 'dining' : 'assembly', bigL = fam === 'hotel' ? Math.min(10, Math.max(6, 48 / dep)) : Math.max(9, 130 / dep);
      const smallL = fam === 'hotel' ? 3.6 : 4.2;
      const big = len(before) >= len(after) ? before : after, small = big === before ? after : before;
      const at = (i: number): -1 | 1 => (i === before ? 1 : -1);
      if (small >= 0) stretch[small] = besideLobby(B, k, band, ...stretch[small], at(small), 'staff', smallL, lobby, corr);
      else if (big >= 0) stretch[big] = besideLobby(B, k, band, ...stretch[big], at(big), 'staff', smallL, lobby, corr);
      if (big >= 0) stretch[big] = besideLobby(B, k, band, ...stretch[big], at(big), bigT, bigL, lobby, corr);
    }
    for (const [a, b] of stretch) {
      if (b - a < 0.3) continue;
      if (b - a < 2.4) {
        const id = B.add(RS(band.ax, a, b, band.ax ? band.r.u0 : band.r.v0, band.ax ? band.r.u1 : band.r.v1), 'store', k);
        for (const c of corr) B.link(c, id, 0.8);
        continue;
      }
      if (fam === 'hotel') guestRooms(B, k, band, a, b, corr, typical);
      else {
        // (every school storey has its WCs: the first long stretch starts with them)
        const wc = !wcDone && b - a >= 12;
        if (wc) wcDone = true;
        classRooms(B, k, band, a, b, corr, typical, wc);
      }
    }
  }
}

/** A hotel's or a school's ground storey on a storefront's glass (P.pub: no corridor will meet it):
 *  its public floor under the corridors — a hotel's lobby with its lounge bar and breakfast room, a
 *  school's entrance hall, its assembly hall and dining hall; the back of house along the back wall
 *  (an office, WCs, a school's kitchen). */
function pubStorey(B: Builder, k: number, fam: 'hotel' | 'school') {
  const P = B.P, M = P.main;
  const cores = (P.cores ?? []).map((c) => c.room);
  const coreIds = cores.map((r) => B.add(r, P.lifts?.some((L) => hitR(L.r, r, -0.05)) ? 'lift' : 'stair', k));
  const bk = M.u1 - M.u0 >= 9 && M.v1 - M.v0 >= 9 ? backStrip(B, k, 0.24, { min: 2.6, max: 7, endW: [1.8, 3.2], count: [true, true] }) : null;
  const front = bk ? bk.front : [{ ...M }];
  // the floor in three along v: the lobby at the door (its own space with what's open to it), the
  // rooms either side — a school's hall walled off where a wall can meet the glass between its windows
  const W = M.v1 - M.v0, lw = Math.max(5, Math.min(9, W * 0.3));
  const z0 = Math.max(M.v0 + 2.5, P.vd - lw / 2), z1 = Math.min(M.v1 - 2.5, P.vd + lw / 2);
  const hallLow = z0 - M.v0 >= M.v1 - z1;
  let hz: number | null = null;
  if (fam === 'school') {
    const want = hallLow ? z0 : z1;
    hz = B.cut(k, 1, want, hallLow ? want - 2.5 : want, hallLow ? want : want + 2.5, [[M.u0 + 0.05, -1]]);
  }
  const zs: [number, number, RoomType][] = hallLow
    ? [[M.v0, hz ?? z0, fam === 'hotel' ? 'bar' : 'assembly'], [hz ?? z0, z1, 'lobby'], [z1, M.v1, 'dining']]
    : [[M.v0, z0, 'dining'], [z0, hz ?? z1, 'lobby'], [hz ?? z1, M.v1, fam === 'hotel' ? 'bar' : 'assembly']];
  const fs = B.space(), hs = hz !== null ? B.space() : fs;
  const frontIds: number[] = [];
  for (const [v0, v1, t] of zs)
    for (const r of front) {
      const q = { ...r, v0: Math.max(r.v0, v0), v1: Math.min(r.v1, v1) };
      if (q.v1 - q.v0 < 0.3) continue;
      for (const pc of lessCores(cores, q)) pushId(frontIds, B.add(pc, t, k, { space: t === 'assembly' ? hs : fs }));
    }
  const backIds: number[] = [];
  if (bk) {
    for (const e of bk.ends) for (const r of lessCores(cores, e.r)) pushId(backIds, B.add(r, e.s < 0 ? 'wc' : 'store', k));
    // the strip between in rooms ~8 m across: the office, the kitchen (the breakfast room's, the
    // dining hall's), a store
    const kinds: RoomType[] = fam === 'hotel' ? ['staff', 'galley', 'store'] : ['galley', 'staff', 'store'];
    let q = bk.mid, i = 0;
    while (q.v1 - q.v0 > 11) {
      const pc = endPiece(B, k, q, true, 8, 5.5, Math.min(10, q.v1 - q.v0 - 4));
      if (!pc) break;
      for (const r of lessCores(cores, pc[0])) pushId(backIds, B.add(r, kinds[i % 3], k));
      q = pc[1];
      i++;
    }
    for (const r of lessCores(cores, q)) pushId(backIds, B.add(r, kinds[i % 3], k));
  }
  for (const f of frontIds) for (const b of backIds) B.link(f, b, 0.9);
  for (const a of backIds) for (const b of backIds) if (a < b) B.link(a, b, 0.8);
  if (hz !== null) for (const f of frontIds) for (const g of frontIds) if (f < g && B.rooms[f].space !== B.rooms[g].space) B.link(f, g, 1.6, { wide: true });
  for (const c of coreIds) {
    for (const f of frontIds) B.link(f, c, 0.9);
    for (const b of backIds) B.link(b, c, 0.9);
  }
}

// ---------------- offices ----------------
function officeStorey(B: Builder, k: number) {
  const P = B.P, M = mainAt(P, k), core = P.core!, rng = B.rng;
  const open = B.space();
  const keep = B.keep(k, 0.3);
  // a tower's core (Stage A: planOffice) — the lift bank, the lift lobby in front of its doors
  // open to the floor, the stair rising from the lobby's far side; no other lift lobbies
  const tall = !!P.lifts?.length;
  // the core: the stair room, then WCs, a lift lobby and stores along it
  const along: 0 | 1 = core.u1 - core.u0 >= core.v1 - core.v0 ? 0 : 1;
  let rest: Rect[] = [core];
  for (const c of P.cores ?? []) rest = rest.flatMap((r) => minus(r, c.room));
  for (const L of P.lifts ?? []) rest = rest.flatMap((r) => minus(r, L.r));
  const coreIds: number[] = [];
  for (const c of P.cores ?? []) {
    // the stair room: a landing band across the core, then the flights' own column — the pockets
    // either side of the flights are stores off the open plan
    const r = c.room, s = c.stair;
    const [ra0, ra1, rc0, rc1] = along ? [r.v0, r.v1, r.u0, r.u1] : [r.u0, r.u1, r.v0, r.v1];
    const [sa0, sa1, sc0, sc1] = along ? [s.v0, s.v1, s.u0, s.u1] : [s.u0, s.u1, s.v0, s.v1];
    const lowBand = sa0 - ra0 >= ra1 - sa1;
    const [b0, b1] = lowBand ? [ra0, sa0] : [sa1, ra1], [k0, k1] = lowBand ? [sa0, ra1] : [ra0, sa1];
    if (sc0 - 0.1 - rc0 >= 1.5 && rc1 - sc1 - 0.1 >= 1.5 && b1 - b0 >= 1.5) {
      // (a tower's: the band is the lift lobby and the stair opens off it, all one with the floor)
      const ss = tall ? open : B.space();
      const band = B.add(RS(along, b0, b1, rc0, rc1), tall ? 'lift' : 'stair', k, { space: ss });
      if (!tall) coreIds.push(band);
      B.add(RS(along, k0, k1, sc0 - 0.1, sc1 + 0.1), 'stair', k, { space: ss });
      coreIds.push(B.add(RS(along, k0, k1, rc0, sc0 - 0.1), 'store', k), B.add(RS(along, k0, k1, sc1 + 0.1, rc1), 'store', k));
    } else coreIds.push(B.add(r, tall ? 'lift' : 'stair', k, tall ? { space: open } : {}));
  }
  const cd0 = along ? core.u0 : core.v0, cd1 = along ? core.u1 : core.v1, cmid = (cd0 + cd1) / 2;
  // the rest of the core in 5–6 m pieces: a pair of WCs, a lift lobby, a store, in turn — a deep
  // core (a tower's) round a lift lobby down its middle, WCs and stores either side of it (a
  // tower's lifts are in its bank: its pieces are WCs and stores off a passage)
  const kinds: RoomType[] = tall ? ['wc', 'store', 'store', 'wc', 'store'] : ['wc', 'lift', 'store', 'lift', 'wc', 'store'];
  let ki = 0;
  const deep = cd1 - cd0 > 12;
  for (const r of rest) {
    const a0 = along ? r.v0 : r.u0, a1 = along ? r.v1 : r.u1;
    const n = Math.max(1, deep ? Math.ceil((a1 - a0) / 5.5) : Math.round((a1 - a0) / 5.5));
    if (deep) {
      const l0 = cmid - 1.2, l1 = cmid + 1.2;
      const lob = B.add(RS(along, a0, a1, l0, l1), tall ? 'corridor' : 'lift', k);
      coreIds.push(lob);
      for (let i = 0; i < n; i++) {
        const x0 = a0 + ((a1 - a0) * i) / n, x1 = a0 + ((a1 - a0) * (i + 1)) / n;
        for (const [d0, d1] of [[cd0, l0], [l1, cd1]]) {
          const id = B.add(RS(along, x0, x1, d0, d1), ki++ % 2 ? 'store' : 'wc', k);
          coreIds.push(id);
          B.link(lob, id, 0.9);
        }
      }
      continue;
    }
    for (let i = 0; i < n; i++) {
      const x0 = a0 + ((a1 - a0) * i) / n, x1 = a0 + ((a1 - a0) * (i + 1)) / n;
      const t = kinds[ki++ % kinds.length];
      // (a deep core's pieces are split across, each still reaching one of its faces)
      if (cd1 - cd0 > 4.5 && (t === 'wc' || cd1 - cd0 > 9)) {
        coreIds.push(B.add(RS(along, x0, x1, cd0, cmid), t, k));
        coreIds.push(B.add(RS(along, x0, x1, cmid, cd1), t === 'wc' ? 'wc' : t === 'lift' || tall ? 'store' : 'lift', k));
      } else coreIds.push(B.add(RS(along, x0, x1, cd0, cd1), t, k));
    }
  }
  // open plan round the core, less a meeting room or two against it
  let plan: Rect[] = [
    { u0: M.u0, u1: core.u0, v0: M.v0, v1: M.v1 },
    { u0: core.u1, u1: M.u1, v0: M.v0, v1: M.v1 },
    { u0: core.u0, u1: core.u1, v0: M.v0, v1: core.v0 },
    { u0: core.u0, u1: core.u1, v0: core.v1, v1: M.v1 },
  ].filter((r) => r.u1 - r.u0 > 0.3 && r.v1 - r.v0 > 0.3);
  // the lobby at the front door (the ground storey): part of the open plan, no desks
  let lobby: Rect | null = null;
  if (k === 0) {
    // (a tower's: all the way from the door to its core, and across the core's width — the
    // security desk, the turnstiles and the lifts beyond them; furnish.ts towerLobby)
    lobby = tall
      ? { u0: M.u0, u1: core.u0, v0: Math.max(M.v0, Math.min(P.vd - 4.5, core.v0)), v1: Math.min(M.v1, Math.max(P.vd + 4.5, core.v1)) }
      : { u0: M.u0, u1: Math.min(core.u0, M.u0 + 9), v0: Math.max(M.v0, P.vd - 4.5), v1: Math.min(M.v1, P.vd + 4.5) };
  }
  // (a tower's double-height lobby: storey 1's floor stops at its balustrade — the void is nobody's
  // room, painted as the lobby it rises from, with no desks, no meeting room near its rail)
  const atrium = k === 1 && P.atrium ? P.atrium : null;
  const meet: Rect[] = [];
  const nMeet = k === 0 ? 1 : 1 + (rng.float() < 0.5 ? 1 : 0);
  for (let i = 0; i < nMeet; i++) {
    // on a long face of the core, clear of its doors' approach
    const faceLow = rng.float() < 0.5;
    const d = 3.2, wl = 4.2;
    const alongC = along ? [core.v0, core.v1] : [core.u0, core.u1];
    const pos = alongC[0] + 1 + rng.float() * Math.max(0, alongC[1] - alongC[0] - wl - 2);
    const r = along
      ? { u0: faceLow ? core.u0 - d : core.u1, u1: faceLow ? core.u0 : core.u1 + d, v0: pos, v1: pos + wl }
      : { u0: pos, u1: pos + wl, v0: faceLow ? core.v0 - d : core.v1, v1: faceLow ? core.v0 : core.v1 + d };
    if (r.u0 < M.u0 + 3 || r.u1 > M.u1 - 3 || r.v0 < M.v0 + 3 || r.v1 > M.v1 - 3) continue;
    if (meet.some((m) => hitR(m, r, 1)) || keep.some((K) => hitR(K, r))) continue;
    if (P.lifts?.some((L) => hitR(grow(L.lobby, 2.5), r))) continue; // (the lift lobby opens to the floor at its ends)
    if (lobby && hitR(lobby, r)) continue; // (nor stands in the entrance lobby)
    if (atrium && hitR(grow(atrium, 1.5), r)) continue;
    if (k === 0 && Math.abs(r.v0 + r.v1 - 2 * P.vd) < wl + 3) continue;
    meet.push(r);
  }
  for (const m of meet) plan = plan.flatMap((r) => minus(r, m));
  if (lobby) plan = plan.flatMap((r) => minus(r, lobby!));
  if (atrium) plan = plan.flatMap((r) => minus(r, atrium));
  // (a library's ground storey is its reading room and stacks; a bank's or a post office's lobby is
  // its hall, the counter across it — not a tower's, whose lobby has its turnstiles)
  const books = k === 0 && P.place === 'library';
  const hallT: RoomType = k === 0 && !tall && (P.place === 'bank' || P.place === 'post') ? P.place : 'lobby';
  const planIds = plan.map((r) => B.add(r, books ? 'library' : 'open', k, { space: open }));
  if (atrium) B.add(atrium, 'void', k, { space: open });
  const lobbyId = lobby ? B.add(lobby, hallT, k, { space: open }) : -1;
  const openIds = lobbyId >= 0 ? [...planIds, lobbyId] : planIds;
  for (const m of meet) {
    const id = B.add(m, 'meeting', k);
    for (const o of openIds) B.link(o, id, 0.9);
  }
  for (const c of coreIds) if (c >= 0) for (const o of openIds) B.link(o, c, B.rooms[c].type === 'lift' ? 1.8 : 0.9, B.rooms[c].type === 'lift' ? { wide: true } : {});
  // desks: benches of back-to-back desks within the open plan, clear of the core's doors, an aisle
  // round the core and along the glass (and the lift lobby's ends)
  const clear = [...keep, ...meet.map((m) => grow(m, 0.9)), grow(core, 1.6), ...(lobby ? [grow(lobby, 0.5)] : []), ...(atrium ? [grow(atrium, 1.0)] : []), ...(P.lifts ?? []).map((L) => grow(L.lobby, 2.2))];
  if (!books) for (const r of plan) desksIn(B, r, k, clear, M);
}

/** Rows of back-to-back desks (1.6 × 0.8 m each, chairs 0.9 m behind) across an open-plan rect
 *  (of the storey's rectangle M). */
function desksIn(B: Builder, r: Rect, k: number, clear: Rect[], M: Rect) {
  const inner = { u0: r.u0 + (Math.abs(r.u0 - M.u0) < 0.1 ? 0.5 : 0.3), u1: r.u1 - (Math.abs(r.u1 - M.u1) < 0.1 ? 0.5 : 0.3), v0: r.v0 + (Math.abs(r.v0 - M.v0) < 0.1 ? 0.5 : 0.3), v1: r.v1 - (Math.abs(r.v1 - M.v1) < 0.1 ? 0.5 : 0.3) };
  // benches run perpendicular to the nearest facade (daylight from the side)
  const du = inner.u1 - inner.u0, dv = inner.v1 - inner.v0;
  if (du < 2.5 || dv < 2.5) return;
  const facadeU = Math.min(Math.abs(r.u0 - M.u0), Math.abs(r.u1 - M.u1)) < 0.1, facadeV = Math.min(Math.abs(r.v0 - M.v0), Math.abs(r.v1 - M.v1)) < 0.1;
  // rows along `ra`: the bench's length axis
  const ra: 0 | 1 = facadeU && !facadeV ? 0 : facadeV && !facadeU ? 1 : du >= dv ? 0 : 1;
  const len0 = ra ? inner.v0 : inner.u0, len1 = ra ? inner.v1 : inner.u1;
  const x0 = ra ? inner.u0 : inner.v0, x1 = ra ? inner.u1 : inner.v1;
  const pitch = 1.6, rowW = 0.9 + 0.8 + 0.8 + 0.9, aisle = 1.2;
  for (let x = x0; x + rowW <= x1 + EPS; x += rowW + aisle) {
    const mid = x + rowW / 2;
    for (let a = len0; a + pitch <= len1 + EPS; a += pitch) {
      for (const s of [-1, 1] as const) {
        const cx = mid + s * 0.4, ca = a + pitch / 2;
        const box = ra ? { u0: Math.min(cx, cx + s * 1.3) - 0.4, u1: Math.max(cx, cx + s * 1.3) + 0.4, v0: ca - 0.8, v1: ca + 0.8 } : { u0: ca - 0.8, u1: ca + 0.8, v0: Math.min(cx, cx + s * 1.3) - 0.4, v1: Math.max(cx, cx + s * 1.3) + 0.4 };
        if (clear.some((c) => hitR(c, box))) continue;
        // the sitter looks across the bench (toward the desk's far edge)
        const face = (ra ? (s > 0 ? 1 : 0) : s > 0 ? 3 : 2) as 0 | 1 | 2 | 3;
        B.desks.push(ra ? { u: cx, v: ca, level: k, face } : { u: ca, v: cx, level: k, face });
      }
    }
  }
}

// ---------------- back of house on a big floor ----------------
interface Back { c: number; mid: Rect; ends: { r: Rect; s: -1 | 1 }[]; front: Rect[] }
/** The back of house along a floor's back wall (u1), `frac` of the floor (§3: 20–25% a big shop's,
 *  30–40% a kitchen's). A storefront's side walls are glass with narrow piers between, so one
 *  partition across rarely meets both of them near the depth wanted: then it stands at the depth
 *  that makes the area (across the middle it meets no facade) and, at each side wall, jogs to that
 *  wall's nearest pier — the corner between it and the back wall a room of the back, its own side
 *  wall meeting the back wall between the windows. `count`: which corners (v0 side, v1 side) the
 *  area counts. null: no partition can stand anywhere near. */
function backStrip(B: Builder, k: number, frac: number, o: { min: number; max: number; endW: [number, number]; count: [boolean, boolean]; jog?: boolean }): Back | null {
  const M = B.P.main, D = M.u1 - M.u0, W = M.v1 - M.v0;
  const want = M.u1 - Math.max(o.min, Math.min(o.max, D * frac));
  const both: [number, -1 | 1][] = [[M.v0 + 0.05, -1], [M.v1 - 0.05, 1]];
  const tol = Math.max(0.15, D * 0.02);
  // (`jog`: corners whatever — a kitchen's WC is one, so the area counts without it)
  const straight = o.jog && W >= 2 * o.endW[1] + 4 ? null : B.cut(k, 0, want, want - tol, want + tol, both);
  if (straight !== null) return { c: straight, mid: { ...M, u0: straight }, ends: [], front: [{ ...M, u1: straight }] };
  const [e0, e1] = o.endW;
  if (W >= 2 * e1 + 4) {
    const back: [number, -1 | 1][] = [[M.u1 - 0.05, 1]];
    const ends: { r: Rect; s: -1 | 1; p: number; w: number }[] = [];
    for (const s of [-1, 1] as const) {
      const side: [number, -1 | 1][] = [[s < 0 ? M.v0 + 0.05 : M.v1 - 0.05, s]];
      const p = B.cut(k, 0, want, Math.max(M.u0 + D * 0.4, want - 4), Math.min(M.u1 - o.min, want + 4), side);
      // (its side wall on the back wall's nearest pier past the width wanted: a storefront's cells
      // run to 5 m)
      const at = (lo: number, hi: number) => (s < 0 ? B.cut(k, 1, M.v0 + (e0 + e1) / 2, M.v0 + lo, M.v0 + hi, back) : B.cut(k, 1, M.v1 - (e0 + e1) / 2, M.v1 - hi, M.v1 - lo, back));
      const x = at(e0, e1) ?? at(e0, Math.min(e1 + 3, (W - 4) / 2));
      if (p === null || x === null) break;
      ends.push({ r: s < 0 ? { u0: p, u1: M.u1, v0: M.v0, v1: x } : { u0: p, u1: M.u1, v0: x, v1: M.v1 }, s, p, w: s < 0 ? x - M.v0 : M.v1 - x });
    }
    if (ends.length === 2) {
      const wm = W - ends[0].w - ends[1].w;
      const rest = (M.u1 - want) * W - ends.reduce((t, e, i) => t + (o.count[i] ? (M.u1 - e.p) * e.w : 0), 0);
      const c = Math.max(M.u0 + D * 0.5, Math.min(M.u1 - o.min, M.u1 - rest / wm));
      const mid = { u0: c, u1: M.u1, v0: ends[0].r.v1, v1: ends[1].r.v0 };
      return {
        c, mid, ends: ends.map(({ r, s }) => ({ r, s })),
        front: [{ u0: M.u0, u1: c, v0: mid.v0, v1: mid.v1 }, { u0: M.u0, u1: ends[0].p, v0: M.v0, v1: mid.v0 }, { u0: M.u0, u1: ends[1].p, v0: mid.v1, v1: M.v1 }],
      };
    }
  }
  // (a narrow floor: the partition straight across, as near the depth as the piers let it)
  const c = B.cut(k, 0, want, Math.max(M.u0 + D * 0.45, want - 2.6), Math.min(M.u1 - 2.2, want + 2.6), both);
  return c === null ? null : { c, mid: { ...M, u0: c }, ends: [], front: [{ ...M, u1: c }] };
}
/** Push a room's id (a sliver that made no room: none). */
const pushId = (ids: number[], id: number) => { if (id >= 0) ids.push(id); };
/** Rect r less the stair cores standing in it. */
const lessCores = (cores: Rect[], r: Rect) => cores.reduce<Rect[]>((acc, c) => acc.flatMap((q) => minus(q, c)), [r]);
/** Rect q of a back strip split along v: a piece `w` wide at its low (or high) end — its wall
 *  meeting the back wall between the windows — and the rest. */
function endPiece(B: Builder, k: number, q: Rect, low: boolean, w: number, lo: number, hi: number): [Rect, Rect] | null {
  const M = B.P.main;
  if (q.v1 - q.v0 < lo + 2.5) return null;
  // (as near the width as a pier allows: a storefront's cells run to 5 m)
  const at = (h: number) => B.cut(k, 1, low ? q.v0 + w : q.v1 - w, low ? q.v0 + lo : q.v1 - h, low ? q.v0 + h : q.v1 - lo, [[M.u1 - 0.05, 1]]);
  const x = at(Math.min(hi, q.v1 - q.v0 - 2.5)) ?? at(Math.min(hi + 3, q.v1 - q.v0 - 2.5));
  if (x === null) return null;
  return low ? [{ ...q, v1: x }, { ...q, v0: x }] : [{ ...q, v0: x }, { ...q, v1: x }];
}

// ---------------- a supermarket (Slice 4) ----------------
// (§2: main aisles 2.4–3.0 m, secondary 1.5–1.8 m; a gondola 0.9 m deep in 1.25 m modules — the
// shelves 0.4 m a side — at most 11 to a run, so a cross aisle comes every 13.75 m; a checkout
// 4.2 m long, lanes on a 2.5 m pitch; the cold cases 1.0 m deep)
const GOND = 1.25, GOND_D = 0.9, AISLE = 1.8, MAIN = 2.6, CROSS = 2.4, RUN_MAX = 11;
const CHECK_L = 4.2, CHECK_W = 0.84, CHECK_PITCH = 2.5, COLD_D = 1.0, COLD_L = 2.5;
export const MARKET = { GOND, GOND_D, AISLE, MAIN, CROSS, RUN_MAX, CHECK_L, CHECK_W, CHECK_PITCH, COLD_D, COLD_L };

/** A supermarket: the back of house along the back wall (20–25% — a staff room and a receiving
 *  bay at its ends, stock rooms and a WC between), the sales floor in front planned round its
 *  fixtures: the checkouts by the door, their lanes running toward it, produce on the door's other
 *  side, the main aisle behind them, gondola runs to the back with a cross aisle every 13.75 m, the
 *  chillers and freezers along the back partition. */
function marketStorey(B: Builder, k: number) {
  const P = B.P, M = P.main;
  const D = M.u1 - M.u0, W = M.v1 - M.v0;
  // (a corner grocery is a shop: a till by the door, its shelves)
  if (D < 14 || W < 10) { shopStorey(B, k, 'shop'); return; }
  const cores = (P.cores ?? []).map((c) => c.room);
  const coreIds = cores.map((r) => B.add(r, 'stair', k));
  const bk = backStrip(B, k, 0.225, { min: 3, max: 16, endW: [3.2, 5.6], count: [true, true] });
  const fs = B.space();
  const floorIds = (bk ? bk.front : [{ ...M }]).flatMap((r) => lessCores(cores, r)).map((r) => B.add(r, 'shop', k, { space: fs })).filter((id) => id >= 0);
  const backIds: number[] = [];
  if (bk) {
    for (const e of bk.ends) for (const r of lessCores(cores, e.r)) pushId(backIds, B.add(r, e.s < 0 ? 'staff' : 'stock', k));
    // the strip between: a WC at its staff-room end, then stock rooms ~10 m across
    let q = bk.mid;
    const wc = endPiece(B, k, q, true, 2.0, 1.6, 3.0);
    if (wc) { for (const r of lessCores(cores, wc[0])) pushId(backIds, B.add(r, 'wc', k)); q = wc[1]; }
    while (q.v1 - q.v0 > 13) {
      const pc = endPiece(B, k, q, true, 10, 7, Math.min(12, q.v1 - q.v0 - 4));
      if (!pc) break;
      for (const r of lessCores(cores, pc[0])) pushId(backIds, B.add(r, 'stock', k));
      q = pc[1];
    }
    for (const r of lessCores(cores, q)) pushId(backIds, B.add(r, 'stock', k));
  }
  // (double doors into the stock rooms, the WC and the staff room off the floor's back corners)
  for (const f of floorIds) for (const b of backIds) B.link(f, b, B.rooms[b].type === 'stock' ? 1.4 : 0.9);
  for (const a of backIds) for (const b of backIds) if (a < b) B.link(a, b, 0.9);
  for (const c of coreIds) {
    for (const f of floorIds) B.link(f, c, 0.9);
    for (const b of backIds) B.link(b, c, 0.9);
  }
  marketFixtures(B, k, bk, cores);
}

function marketFixtures(B: Builder, k: number, bk: Back | null, cores: Rect[]) {
  const P = B.P, M = P.main, LP = B.lp(k);
  const c = bk ? bk.c : M.u1;
  const stairs = [...B.keep(k, 0.6), ...cores.map((r) => grow(r, 1.4))];
  const block = [...stairs, ...(bk ? bk.ends.map((e) => grow(e.r, AISLE)) : [])];
  const free = (r: Rect, against = block) => !against.some((q) => hitR(q, r)) && LP.rectIn(r.u0, r.u1, r.v0, r.v1, 0.3);
  // the front end: a walk 2.4 m deep along the glass; the checkouts behind it, their lanes toward
  // the door, on the door's roomier side, 2 m clear of the way in
  const fe = M.u0 + 2.4, ce = fe + CHECK_L;
  const sales = (c - M.u0) * (M.v1 - M.v0);
  const s: -1 | 1 = M.v1 - P.vd >= P.vd - M.v0 ? 1 : -1;
  const lanes = Math.max(2, Math.min(14, Math.round(sales / 300)));
  for (let i = 0; i < lanes; i++) {
    // (a lane's unit, door side first: the cashier's place, the counter, the lane — on +v)
    const a = P.vd + s * (2.0 + i * CHECK_PITCH), v0 = s > 0 ? a : a - CHECK_PITCH;
    if (v0 < M.v0 + 1.8 || v0 + CHECK_PITCH > M.v1 - 1.8) break;
    const r = { u0: fe, u1: ce, v0: v0 + 0.75, v1: v0 + 0.75 + CHECK_W };
    if (free(grow(r, 0.3), stairs)) B.fix.push({ kind: 'checkout', level: k, r, face: 2, n: 1 });
  }
  // produce on the door's other side, the first thing a shopper comes to: stands 2.2 × 0.95 m in two
  // rows, 1.6 m between
  const pv0 = s > 0 ? M.v0 + 1.8 : P.vd + 2.0, pv1 = s > 0 ? P.vd - 2.0 : M.v1 - 1.8;
  const np = Math.floor((pv1 - pv0 + 1.6) / (2.2 + 1.6));
  for (let i = 0; i < np; i++)
    for (const row of [0, 1]) {
      const u0 = fe + 0.3 + row * (0.95 + 1.6), v0 = s > 0 ? pv1 - (i + 1) * 2.2 - i * 1.6 : pv0 + i * (2.2 + 1.6);
      const r = { u0, u1: u0 + 0.95, v0, v1: v0 + 2.2 };
      if (free(grow(r, 0.3), stairs)) B.fix.push({ kind: 'produce', level: k, r, face: row ? 0 : 1, n: 1 });
    }
  // gondola runs from the main aisle to the back aisle, a cross aisle between every RUN_MAX modules
  const fu0 = ce + MAIN, fu1 = c - (bk ? COLD_D + CROSS : CROSS), Lf = fu1 - fu0;
  const fv0 = M.v0 + 2.2, fv1 = M.v1 - 2.2;
  if (Lf >= 2 * GOND && fv1 - fv0 >= GOND_D) {
    const nSeg = Math.max(1, Math.ceil((Lf + CROSS) / (RUN_MAX * GOND + CROSS)));
    const m = Math.min(RUN_MAX, Math.floor((Lf - (nSeg - 1) * CROSS) / nSeg / GOND));
    const u0 = fu0 + (Lf - (nSeg * m * GOND + (nSeg - 1) * CROSS)) / 2;
    const nRows = Math.floor((fv1 - fv0 + AISLE) / (GOND_D + AISLE));
    const v00 = fv0 + (fv1 - fv0 - (nRows * GOND_D + (nRows - 1) * AISLE)) / 2;
    for (let i = 0; i < nRows; i++) {
      const v = v00 + i * (GOND_D + AISLE);
      for (let g = 0; g < nSeg; g++) {
        const s0 = u0 + g * (m * GOND + CROSS);
        let run = -1;
        for (let j = 0; j <= m; j++) {
          const ok = j < m && free({ u0: s0 + j * GOND, u1: s0 + (j + 1) * GOND, v0: v, v1: v + GOND_D });
          if (ok && run < 0) run = j;
          if (!ok && run >= 0) {
            B.fix.push({ kind: 'gondola', level: k, r: { u0: s0 + run * GOND, u1: s0 + j * GOND, v0: v, v1: v + GOND_D }, face: 2, n: j - run });
            run = -1;
          }
        }
      }
    }
  }
  // the cold cases along the back partition, facing the floor: open chillers, the freezers (glass
  // doors) at one end
  if (bk) {
    const a = bk.mid.v0 + 0.1, b = bk.mid.v1 - 0.1, n = Math.floor((b - a) / COLD_L);
    const off = a + (b - a - n * COLD_L) / 2, frzLow = ((P.seed >>> 3) & 1) === 0;
    for (let i = 0; i < n; i++) {
      const r = { u0: c - COLD_D, u1: c - 0.02, v0: off + i * COLD_L, v1: off + (i + 1) * COLD_L };
      if (!free(r, stairs)) continue;
      B.fix.push({ kind: (frzLow ? i < n * 0.4 : i >= n * 0.6) ? 'freezer' : 'cooler', level: k, r, face: 1, n: 1 });
    }
  }
}

// ---------------- shops, cafés, restaurants ----------------
/** What a shop-family floor is, when the building's data says (uses.ts placeOf): a library's
 *  stacks, a bank's hall, a post office's counters, a gym — and their back rooms. */
const PLACE_FLOOR: Partial<Record<string, RoomType>> = { library: 'library', bank: 'bank', post: 'post', gym: 'gym' };
const PLACE_BACK: Partial<Record<string, RoomType>> = { library: 'staff', bank: 'staff', gym: 'staff', post: 'stock', pharmacy: 'stock' };

/** A restaurant (§2: the kitchen 30–40% of the floor) — the kitchen across the back, a WC in one
 *  of its corners off the dining room. false: no room for one. */
function restaurantStorey(B: Builder, k: number, cores: Rect[], coreIds: number[]) {
  const rng = B.rng;
  const wcLow = rng.float() < 0.5;
  const bk = backStrip(B, k, 0.35, { min: 2.8, max: 12, endW: [1.8, 3.4], count: wcLow ? [false, true] : [true, false], jog: true });
  if (!bk) return false;
  const fs = B.space(), gs = B.space();
  const frontIds = bk.front.flatMap((r) => lessCores(cores, r)).map((r) => B.add(r, 'diner', k, { space: fs })).filter((id) => id >= 0);
  // (a strip straight across: the WC at one end of it)
  const pc = bk.ends.length ? null : endPiece(B, k, bk.mid, wcLow, 1.8, 1.4, 3.0);
  const wcs: Rect[] = pc ? [pc[0]] : [];
  const backIds = lessCores(cores, pc ? pc[1] : bk.mid).map((r) => B.add(r, 'galley', k, { space: gs })).filter((id) => id >= 0);
  for (const e of bk.ends) {
    if (e.s < 0 === wcLow) wcs.push(e.r);
    else for (const r of lessCores(cores, e.r)) pushId(backIds, B.add(r, 'galley', k, { space: gs }));
  }
  const wcIds = wcs.flatMap((q) => lessCores(cores, q)).map((r) => B.add(r, 'wc', k)).filter((id) => id >= 0);
  const wc = wcIds.length ? wcIds[0] : -1;
  for (const f of frontIds) {
    for (const b of backIds) B.link(f, b, 0.9);
    if (wc >= 0) B.link(f, wc, 0.8);
  }
  if (wc >= 0) for (const b of backIds) B.link(b, wc, 0.8);
  for (const c of coreIds) for (const id of [...frontIds, ...backIds]) B.link(id, c, 0.9);
  return true;
}

function shopStorey(B: Builder, k: number, kind: 'shop' | 'food') {
  const P = B.P, M = P.main, rng = B.rng;
  const use = useOf(B.fp.name, B.fp.use);
  const depth = M.u1 - M.u0, width = M.v1 - M.v0;
  const cores = (P.cores ?? []).map((c) => c.room);
  const coreIds = cores.map((r) => B.add(r, 'stair', k));
  if (kind === 'food' && use === 'restaurant' && depth >= 9 && width >= 7 && restaurantStorey(B, k, cores, coreIds)) return;
  // back of house along the back wall: 20–25% of a shop, 30–40% of a kitchen
  const frac = kind === 'food' ? 0.34 : 0.22;
  const want = M.u1 - Math.max(kind === 'food' ? 2.8 : 2.4, Math.min(kind === 'food' ? 9 : 8, depth * frac));
  const small = depth * width < (kind === 'food' ? 45 : 35) || depth < 6;
  let front: Rect = { ...M };
  const back: Rect[] = [];
  if (!small) {
    const c = B.cut(k, 0, want, Math.max(M.u0 + depth * 0.45, want - 2.6), Math.min(M.u1 - 2.2, want + 2.6), [[M.v0 + 0.05, -1], [M.v1 - 0.05, 1]]);
    if (c !== null) {
      front = { ...M, u1: c };
      const bk = { ...M, u0: c };
      // split the back: a WC at one end (1.6 m), the kitchen or the stock room the rest
      const wcW = 1.6;
      const lowWc = rng.float() < 0.5;
      const x = B.cut(k, 1, lowWc ? M.v0 + wcW : M.v1 - wcW, lowWc ? M.v0 + 1.2 : M.v1 - 4.2, lowWc ? M.v0 + 4.2 : M.v1 - 1.2, [[M.u1 - 0.05, 1]]);
      if (x !== null && width > 6) {
        back.push(lowWc ? { ...bk, v1: x } : { ...bk, v0: x });
        back.push(lowWc ? { ...bk, v0: x } : { ...bk, v1: x });
      } else back.push(bk);
    }
  }
  const frontRects = cores.reduce<Rect[]>((acc, c) => acc.flatMap((r) => minus(r, c)), [front]);
  const fs = B.space();
  const floorType: RoomType = kind === 'shop' ? (PLACE_FLOOR[P.place ?? ''] ?? 'shop') : use === 'cafe' ? 'cafe' : use === 'bar' ? 'bar' : use === 'restaurant' ? 'diner' : rng.float() < 0.45 ? 'cafe' : 'diner';
  const frontIds = frontRects.map((r) => B.add(r, floorType, k, { space: fs }));
  const backIds: number[] = [];
  back.forEach((r, i) => {
    const parts = cores.reduce<Rect[]>((acc, c) => acc.flatMap((q) => minus(q, c)), [r]);
    for (const q0 of parts) {
      const isWc = back.length > 1 && i === 0;
      // (a wide store's back of house: stock rooms ~10 m across, their walls between the back windows)
      const pieces: Rect[] = [];
      let q = q0;
      while (!isWc && q.v1 - q.v0 > 13) {
        const c = B.cut(k, 1, q.v0 + 10, q.v0 + 7, q.v1 - 4, [[M.u1 - 0.05, 1]]);
        if (c === null) break;
        pieces.push({ ...q, v1: c });
        q = { ...q, v0: c };
      }
      pieces.push(q);
      for (const pc of pieces) {
        const t: RoomType = isWc ? 'wc' : kind === 'food' ? 'galley' : PLACE_BACK[P.place ?? ''] ?? 'stock';
        const id = B.add(pc, t, k);
        backIds.push(id);
        for (const f of frontIds) B.link(f, id, isWc ? 0.8 : 0.9);
      }
    }
  });
  // the back rooms open onto each other too (the WC off the stock room or the kitchen)
  for (const a of backIds) for (const b of backIds) if (a < b) B.link(a, b, 0.8);
  for (const c of coreIds) {
    for (const f of frontIds) B.link(f, c, 0.9);
    for (const b of backIds) B.link(b, c, 0.9);
  }
}

// ---------------- churches and mosques ----------------
/** A church (§2: pews at 0.91 m pitch either side of a 1.5 m centre aisle): a narthex across its
 *  door end where a wall can meet the side walls between their windows, the nave, the altar at the
 *  far end before its chancel; a mosque's prayer hall has no pews (furnish.ts lays its carpet in
 *  rows toward the mihrab). */
function churchStorey(B: Builder, k: number) {
  const P = B.P, M = mainAt(P, k), LP = B.lp(k);
  const mosque = P.place === 'mosque';
  const D = M.u1 - M.u0, W = M.v1 - M.v0;
  // (a church that's a library now is its reading room and stacks)
  if (P.place === 'library') { B.add(M, 'library', k); return; }
  const t: RoomType = mosque ? 'prayer' : 'church';
  let nave: Rect = { ...M };
  const c = Math.abs(P.ud - M.u0) < 0.6 && D >= 12 && W >= 6 ? B.cut(k, 0, M.u0 + 3.0, M.u0 + 2.2, M.u0 + Math.min(4.4, D * 0.25), [[M.v0 + 0.05, -1], [M.v1 - 0.05, 1]]) : null;
  if (c !== null) {
    nave = { ...M, u0: c };
    const nx = B.add({ ...M, u1: c }, 'narthex', k);
    B.link(nx, B.add(nave, t, k), Math.min(2.4, W - 1.2), { pref: P.vd, wide: true });
  } else B.add(M, t, k);
  if (mosque || D < 6 || W < 4.5) return;
  // the altar 1 m before the far wall, facing the door; the chancel in front of it; pews from the
  // narthex (or a step in from the door) to the chancel, two blocks and their side aisles
  const vm = (M.v0 + M.v1) / 2, aw = Math.min(2.2, W * 0.3);
  B.fix.push({ kind: 'altar', level: k, r: { u0: M.u1 - 1.8, u1: M.u1 - 1.0, v0: vm - aw / 2, v1: vm + aw / 2 }, face: 1, n: 1 });
  const chancel = M.u1 - Math.max(3.4, Math.min(6, D * 0.2));
  const keep = B.keep(k, 0.3);
  const ca = 1.5, sa = W >= 10 ? 1.1 : 0.7;
  const blocks: [number, number][] = [[M.v0 + sa, vm - ca / 2], [vm + ca / 2, M.v1 - sa]];
  for (let u = nave.u0 + (c !== null ? 1.2 : 2.6); u + 0.62 <= chancel - 1.0; u += 0.91)
    for (const [v0, v1] of blocks) {
      if (v1 - v0 < 1.2) continue;
      const r = { u0: u, u1: u + 0.62, v0, v1 };
      if (!LP.rectIn(r.u0, r.u1, r.v0, r.v1, 0.05) || keep.some((q) => hitR(q, r))) continue;
      B.fix.push({ kind: 'pew', level: k, r, face: 0, n: 1 });
    }
}

// ---------------- the rest ----------------
function openStorey(B: Builder, k: number) {
  const P = B.P, fp = B.fp, M = mainAt(P, k);
  const t: RoomType = fp.kind === 'church' ? 'church'
    : fp.kind === 'house' || fp.kind === 'shed' ? (k === 0 ? 'great' : 'bed')
      : fp.kind === 'large' ? (k === 0 ? 'lobby' : 'living')
        : k === 0 ? (useOf(fp.name, fp.use) === 'office' ? 'open' : 'shop') : 'open';
  // the whole outline is one room: the main rectangle stands for it
  B.add(M, t, k, t === 'bed' ? { bed: 2 } : {});
}

// ---------------- walls, doors, reachability ----------------
interface Edge { ax: 0 | 1; c: number; a: number; b: number; i: number; j: number }
/** Where two rooms of one storey meet: the shared stretch of boundary. */
function shared(A: Room, Bm: Room): Edge | null {
  const a = A.r, b = Bm.r, t = 0.02;
  if (Math.abs(a.u1 - b.u0) < t || Math.abs(b.u1 - a.u0) < t) {
    const o0 = Math.max(a.v0, b.v0), o1 = Math.min(a.v1, b.v1);
    if (o1 - o0 > 0.05) return { ax: 1, c: Math.abs(a.u1 - b.u0) < t ? (a.u1 + b.u0) / 2 : (b.u1 + a.u0) / 2, a: o0, b: o1, i: A.id, j: Bm.id };
  }
  if (Math.abs(a.v1 - b.v0) < t || Math.abs(b.v1 - a.v0) < t) {
    const o0 = Math.max(a.u0, b.u0), o1 = Math.min(a.u1, b.u1);
    if (o1 - o0 > 0.05) return { ax: 0, c: Math.abs(a.v1 - b.v0) < t ? (a.v1 + b.v0) / 2 : (b.v1 + a.v0) / 2, a: o0, b: o1, i: A.id, j: Bm.id };
  }
  return null;
}

/** Can a doorway of width w centred at t on edge e go there: it and a step either side of it clear
 *  of the stairs (K) and of the doors already in that wall line (near)? */
function doorFits(K: Rect[], near: (Doorway[] | undefined)[], e: Edge, t: number, w: number) {
  const u0 = e.ax === 0 ? t - w / 2 : e.c - 0.75, u1 = e.ax === 0 ? t + w / 2 : e.c + 0.75;
  const v0 = e.ax === 0 ? e.c - 0.75 : t - w / 2, v1 = e.ax === 0 ? e.c + 0.75 : t + w / 2;
  for (const q of K) if (q.u0 < u1 && q.u1 > u0 && q.v0 < v1 && q.v1 > v0) return false;
  for (const ds of near) if (ds) for (const d of ds) if (Math.abs(d.c - e.c) < 0.05 && Math.abs(d.t - t) < (d.w + w) / 2 + 0.3) return false;
  return true;
}

function* finish(B: Builder, k0 = 0): Generator<void, Layout, void> {
  const P = B.P, rooms = B.rooms, N = rooms.length;
  const byLevel: Room[][] = Array.from({ length: P.levels }, () => []);
  for (const r of rooms) byLevel[r.level]?.push(r);
  // every pair of rooms that meet
  const edges = new Map<number, Edge>();
  const key = (i: number, j: number) => (i < j ? i * N + j : j * N + i);
  for (const lv of byLevel)
    for (let x = 0; x < lv.length; x++)
      for (let y = x + 1; y < lv.length; y++) {
        const e = shared(lv[x], lv[y]);
        if (e) edges.set(key(e.i, e.j), e);
      }
  // doorways, indexed by the wall line they're in (storey, axis, position to 5 cm)
  const doors: Doorway[] = [];
  const lines = new Map<number, Doorway[]>();
  const lineOf = (k: number, ax: 0 | 1, c: number) => (k * 2 + ax) * 1e6 + Math.round(c * 20) + 5e5;
  const keeps = Array.from({ length: P.levels }, (_, k) => B.keep(k, 0.1));
  const place = (L: Link): boolean => {
    const e = edges.get(key(L.a, L.b));
    if (!e) return false;
    const A = rooms[L.a], Bm = rooms[L.b];
    if (A.space === Bm.space) return true; // open to each other
    const k = A.level, w = L.w;
    const lo = e.a + 0.3 + w / 2, hi = e.b - 0.3 - w / 2;
    if (hi < lo - EPS) return false;
    const want = Math.max(lo, Math.min(hi, L.pref ?? (lo + hi) / 2));
    const lk = lineOf(k, e.ax, e.c);
    const near = [lines.get(lk - 1), lines.get(lk), lines.get(lk + 1)];
    for (let o = 0; o <= hi - lo + 0.051; o += 0.05)
      for (let sg = 0; sg < (o === 0 ? 1 : 2); sg++) {
        const t = sg ? want - o : want + o;
        if (t < lo - EPS || t > hi + EPS || !doorFits(keeps[k], near, e, t, w)) continue;
        const d: Doorway = { level: k, ax: e.ax, c: e.c, t, w, rooms: [L.a, L.b], ...(L.front ? { front: true } : {}) };
        doors.push(d);
        const ln = lines.get(lk);
        if (ln) ln.push(d); else lines.set(lk, [d]);
        return true;
      }
    return false;
  };
  const linked = new Set<number>();
  for (const L of B.links) {
    const kk = key(L.a, L.b);
    if (linked.has(kk)) continue;
    if (place(L)) linked.add(kk);
  }
  yield;
  // reachability: from the room the front door opens into, through doors, open spaces and stairs
  // (a build window above the ground: from where its stairs arrive from below, and its lift lobbies)
  const entry = k0 > 0 ? -1 : rooms.find((r) => r.level === 0 && r.r.u0 - 0.01 <= P.ud + 0.35 && r.r.u1 + 0.01 >= P.ud + 0.35 && r.r.v0 - 0.01 <= P.vd && r.r.v1 + 0.01 >= P.vd)?.id ?? rooms.findIndex((r) => r.level === 0);
  const roomAt = (k: number, u: number, v: number) => byLevel[k]?.find((r) => u >= r.r.u0 - 0.01 && u <= r.r.u1 + 0.01 && v >= r.r.v0 - 0.01 && v <= r.r.v1 + 0.01)?.id ?? -1;
  // (the stairs: the room at a flight's foot and the one at its head — a dogleg's halves both
  // live in their storeys' core rooms)
  const climbs: [number, number][] = [];
  for (const F of P.flights) {
    const dir = Math.sign(F.topU - F.bottomU) || 1;
    const c = F.axis ? (F.u0 + F.u1) / 2 : (F.v0 + F.v1) / 2;
    const foot = F.bottomU - dir * 0.3, head = F.topU + dir * 0.3;
    const lo = F.lo ?? 0, hi = F.hi ?? 1;
    if (lo > 0.01 || hi < 0.99) {
      if (lo < 0.01) climbs.push(F.axis ? [roomAt(F.level, c, foot), roomAt(F.level + 1, c, foot)] : [roomAt(F.level, foot, c), roomAt(F.level + 1, foot, c)]);
      continue;
    }
    climbs.push(F.axis ? [roomAt(F.level, c, foot), roomAt(F.level + 1, c, head)] : [roomAt(F.level, foot, c), roomAt(F.level + 1, head, c)]);
  }
  const seeds = entry >= 0 ? [entry] : [];
  if (P.tall) {
    for (const [a, b] of climbs) if (a < 0 && b >= 0) seeds.push(b);
    for (const r of rooms) if (r.type === 'lift') seeds.push(r.id);
  }
  for (let pass = 0; pass < 6; pass++) {
    const g: number[][] = Array.from({ length: N }, () => []);
    for (const d of doors) { g[d.rooms[0]].push(d.rooms[1]); g[d.rooms[1]].push(d.rooms[0]); }
    for (const e of edges.values()) if (rooms[e.i].space === rooms[e.j].space) { g[e.i].push(e.j); g[e.j].push(e.i); }
    for (const [a, b] of climbs) if (a >= 0 && b >= 0) { g[a].push(b); g[b].push(a); }
    const seen = new Uint8Array(N);
    for (const s of seeds) seen[s] = 1;
    const q = [...seeds];
    while (q.length) { const x = q.pop()!; for (const y of g[x]) if (!seen[y]) { seen[y] = 1; q.push(y); } }
    // (a lift's shaft is nobody's room: walled all round, never a door)
    const lost = rooms.filter((r) => !seen[r.id] && r.type !== 'shaft');
    if (!lost.length) break;
    let fixed = false;
    for (const r of lost) {
      // a door to any reachable neighbour, the narrowest first, then the widest stretch
      const nb = [...edges.values()].filter((e) => (e.i === r.id && seen[e.j]) || (e.j === r.id && seen[e.i])).sort((x, y) => y.b - y.a - (x.b - x.a));
      for (const e of nb) {
        const other = e.i === r.id ? e.j : e.i;
        for (const w of [0.8, 0.7]) if (place({ a: other, b: r.id, w })) { fixed = true; break; }
        if (fixed) break;
      }
    }
    if (!fixed) {
      // nothing to open onto: fold the room into a reachable neighbour's space (no wall between) —
      // the one it shares the most wall with away from the stairs
      for (const r of lost) {
        let best: Edge | null = null, bl = 0.3;
        for (const e of edges.values()) {
          if (!((e.i === r.id && seen[e.j]) || (e.j === r.id && seen[e.i]))) continue;
          let segs: [number, number][] = [[e.a, e.b]];
          for (const K of keeps[r.level]) {
            const [k0, k1, c0, c1] = e.ax === 0 ? [K.u0, K.u1, K.v0, K.v1] : [K.v0, K.v1, K.u0, K.u1];
            if (c0 > e.c + 0.4 || c1 < e.c - 0.4) continue;
            segs = segs.flatMap(([a, b]) => (k1 <= a || k0 >= b ? [[a, b]] : [[a, k0], [k1, b]]) as [number, number][]);
          }
          const l = Math.max(0, ...segs.map(([a, b]) => b - a));
          if (l > bl) (bl = l), (best = e);
        }
        if (best) { r.space = rooms[best.i === r.id ? best.j : best.i].space; fixed = true; }
      }
      if (!fixed) break;
    }
  }
  // walls: every meeting of rooms in different spaces, with its doorways
  const gapsOf = new Map<number, [number, number][]>();
  for (const d of doors) {
    const kk = key(d.rooms[0], d.rooms[1]), gp: [number, number] = [d.t - d.w / 2, d.t + d.w / 2];
    const gs = gapsOf.get(kk);
    if (gs) gs.push(gp); else gapsOf.set(kk, [gp]);
  }
  const walls: Wall[] = [];
  // (a lift shaft's face: an opening for each car's landing doors — its frame and leaves close it,
  // the shaft's own walls in the collision world keep it shut: Stage A)
  const carGaps = (A: Room, Bm: Room, e: Edge): [number, number][] => {
    const S = A.type === 'shaft' ? A : Bm.type === 'shaft' ? Bm : null;
    const L = S && P.lifts?.find((q) => Math.abs(q.r.u0 - S.r.u0) < 0.01 && Math.abs(q.r.v0 - S.r.v0) < 0.01 && Math.abs(q.r.u1 - S.r.u1) < 0.01 && Math.abs(q.r.v1 - S.r.v1) < 0.01);
    if (!L) return [];
    const cars = liftCars(L);
    if (e.ax !== cars.row || Math.abs(e.c - cars.fc) > 0.03) return [];
    return cars.along.filter((t) => t - LIFT_DOOR / 2 >= e.a - 0.01 && t + LIFT_DOOR / 2 <= e.b + 0.01).map((t) => [t - LIFT_DOOR / 2, t + LIFT_DOOR / 2] as [number, number]);
  };
  for (const [kk, e] of edges) {
    const A = rooms[e.i], Bm = rooms[e.j];
    if (A.space === Bm.space) continue;
    const gaps = [...(gapsOf.get(kk) ?? []), ...carGaps(A, Bm, e)].sort((x, y) => x[0] - y[0]);
    walls.push({ level: A.level, ax: e.ax, c: e.c, a: e.a, b: e.b, gaps, rooms: [e.i, e.j] });
  }
  // the last word on windows: a wall end still landing on one stops short of the glass
  let trimmed = 0;
  for (const wl of walls)
    for (const end of [0, 1] as const) {
      const at = end ? wl.b : wl.a, dir = end ? 1 : -1;
      const ok = wl.ax === 0 ? endOK(B.lp(wl.level), B.wm(wl.level), wl.level, at, wl.c, dir, 0, 0) : endOK(B.lp(wl.level), B.wm(wl.level), wl.level, wl.c, at, 0, dir, 0);
      if (ok) continue;
      if (end) wl.b -= 0.4; else wl.a += 0.4;
      trimmed++;
    }
  const open = doors.filter((d) => rooms[d.rooms[0]].space !== rooms[d.rooms[1]].space);
  // (a fixture never stands in a doorway's way: one a door came to land by goes)
  const clearOf = (f: Fixture) => !open.some((d) => {
    if (d.level !== f.level) return false;
    const z = d.ax === 0 ? { u0: d.t - d.w / 2 - 0.3, u1: d.t + d.w / 2 + 0.3, v0: d.c - 1.1, v1: d.c + 1.1 } : { u0: d.c - 1.1, u1: d.c + 1.1, v0: d.t - d.w / 2 - 0.3, v1: d.t + d.w / 2 + 0.3 };
    return hitR(z, f.r);
  });
  return { rooms, walls: walls.filter((w) => w.b - w.a > 0.1), doors: open, desks: B.desks, fix: B.fix.filter(clearOf), dais: B.dais, entry, trimmed };
}

// ---------------- annexes: the outline beyond the main rectangle ----------------
function annexRooms(B: Builder, k: number) {
  const P = B.P;
  for (const a of plateAt(P, k)?.annex ?? P.annex) {
    const area = rectArea(a);
    const fam = k === 0 ? P.arch : P.up;
    // (a church's transept or apse is part of it: no wall between)
    const holy = fam === 'church';
    const t: RoomType = fam === 'house' ? (k === 0 ? (area >= 9 ? 'dining' : 'utility') : area >= BED_S.a && minW(a) >= BED_S.w ? 'bed' : 'closet')
      : fam === 'flats' ? 'store' : fam === 'office' ? 'meeting' : fam === 'shop' || fam === 'market' ? 'stock' : fam === 'food' ? 'galley'
        : holy ? (P.place === 'mosque' ? 'prayer' : P.place === 'library' ? 'library' : 'church') : 'store';
    const id = B.add(a, t, k, t === 'bed' ? { bed: area >= BED_D.a && minW(a) >= BED_D.w ? 2 : 1 } : {});
    // it opens off whichever main room it shares the most wall with
    let best = -1, bl = 0;
    for (const r of B.rooms) {
      if (r.level !== k || r.id === id) continue;
      const e = shared(r, B.rooms[id]);
      if (e && e.b - e.a > bl && r.type !== 'stair' && r.type !== 'wc' && r.type !== 'bath' && (!holy || r.type !== 'narthex')) (bl = e.b - e.a), (best = r.id);
    }
    if (best >= 0 && holy && id >= 0) B.rooms[id].space = B.rooms[best].space;
    else if (best >= 0) B.link(best, id, bl > 2.5 ? 1.2 : 0.8);
  }
}

/** Stage B as steps — a storey at a time, then the walls and doors — so an activation can slice it
 *  across frames. */
export function* layoutSteps(P0: Plan, fp: Footprint, win?: [number, number]): Generator<void, Layout, void> {
  // (a tall building's storeys k0 … k1 — its build window — with its stairs laid out storey by storey)
  const [k0, k1] = win ?? [0, P0.levels - 1];
  const P = unstack(P0, k0, k1);
  const B = new Builder(P, fp, makeRng((P.seed ^ 0x9b1d) >>> 0));
  const typical = new Map<string, number[]>();
  for (let k = k0; k <= k1; k++) {
    // (a tall building's storeys are laid out a few at a time, whichever few: each its own seed)
    if (P.tall) B.rng = makeRng((P.seed ^ 0x9b1d ^ Math.imul(k + 1, 0x2c1b3c6d)) >>> 0);
    const fam = k === 0 ? P.arch : P.up;
    if (fam === 'house' && P.strip) houseStorey(B, k);
    else if (fam === 'flats' && P.bands) flatsStorey(B, k, typical);
    else if ((fam === 'hotel' || fam === 'school') && k === 0 && P.pub) pubStorey(B, k, fam);
    else if ((fam === 'hotel' || fam === 'school') && P.bands) stripStorey(B, k, typical, fam);
    else if (fam === 'office' && P.core) officeStorey(B, k);
    else if (fam === 'market') marketStorey(B, k);
    else if (fam === 'shop' || fam === 'food') shopStorey(B, k, fam);
    else if (fam === 'church') churchStorey(B, k);
    else openStorey(B, k);
    for (const L of P.lifts ?? []) B.add(L.r, 'shaft', k);
    annexRooms(B, k);
    yield;
  }
  return yield* finish(B, k0);
}
/** Stage B: rooms, walls and doors for every storey of a plan (or for storeys k0 … k1 of it). */
export function layoutInterior(P: Plan, fp: Footprint, win?: [number, number]): Layout {
  const g = layoutSteps(P, fp, win);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ---------------- collision ----------------
/** The layout's walls into the collision world, each on its own storey's height band. `at`: a
 *  walker already inside — no wall lands on them (one within reach gets a doorway where they
 *  stand instead). */
export function registerLayout(walk: WalkWorld, P: Plan, L: Layout, at?: { x: number; z: number; feet: number }) {
  const f = (k: number) => P.floor0 + k * P.floorH;
  let atU = 0, atV = 0;
  if (at) {
    atU = (at.x - P.cx) * P.ux + (at.z - P.cz) * P.uz;
    atV = (at.x - P.cx) * P.vx + (at.z - P.cz) * P.vz;
  }
  for (const w of L.walls) {
    const y0 = f(w.level) - 0.5, y1 = f(w.level) + P.floorH - 0.5;
    let gaps = w.gaps.slice();
    if (at && at.feet >= y0 && at.feet <= y1) {
      const along = w.ax === 0 ? atU : atV, across = w.ax === 0 ? atV : atU;
      if (Math.abs(across - w.c) < 0.45 && along > w.a - 0.45 && along < w.b + 0.45) gaps = [...gaps, [along - 0.55, along + 0.55] as [number, number]].sort((x, y) => x[0] - y[0]);
    }
    let s = w.a;
    const seg = (a: number, b: number) => {
      if (b - a < 0.02) return;
      const A = w.ax === 0 ? toW(P, a, w.c) : toW(P, w.c, a), Bp = w.ax === 0 ? toW(P, b, w.c) : toW(P, w.c, b);
      walk.addWall(A, Bp, y0, y1);
    };
    for (const [g0, g1] of gaps) { seg(s, Math.min(w.b, Math.max(s, g0))); s = Math.max(s, g1); }
    seg(s, w.b);
  }
}

