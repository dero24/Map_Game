// Where to stand to see a room in its best light (tools/review-shots.js pose 19, "morning sun"): the
// room with the most glass facing east to south, seen from a doorway or its far side toward that
// glass, so the sun's pools on the floor lie between the lens and the windows. Pure: a plan, its
// footprint and its layout in; a stance (world x, z, yaw, pitch, feet) out.
import { wallWindows, polyArea, toW, type Plan, type Rect } from './plan';
import { layoutInterior, type Layout, type Room } from './layout';
import type { Footprint } from '../buildings';

export { layoutInterior };
type P2 = [number, number];
/** A room's glass facing a span of compass bearings: m² of it, the middle of it (local u, v, on the
 *  wall) and the way it faces (a local unit vector out of the building). */
export interface RoomGlass { room: Room; glass: number; at: P2; out: P2 }
/** Window glass a house's sash pane holds (m: its height less its frame). */
const PANE_H = 1.35 - 0.16;

/** Each room's glass on storey k facing between compass bearings `lo` and `hi` (degrees from
 *  north, clockwise: east 90, south 180) — the facade's own window cells (plan.ts wallWindows) whose
 *  middles open onto that room. The local frame is the plan's; +x east, +z south in the world. */
export function glassFacing(P: Plan, fp: Footprint, L: Layout, lo = 90, hi = 180, k = 0): RoomGlass[] {
  const M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
  const loc = P.loc, ccw = polyArea(loc) > 0;
  const acc = new Map<number, { g: number; u: number; v: number; nu: number; nv: number }>();
  for (let i = 0; i < loc.length; i++) {
    const a = loc[i], b = loc[(i + 1) % loc.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const eu = (b[0] - a[0]) / len, ev = (b[1] - a[1]) / len;
    const nu = ccw ? ev : -ev, nv = ccw ? -eu : eu; // (out of the building)
    const wx = P.ux * nu + P.vx * nv, wz = P.uz * nu + P.vz * nv;
    const bearing = ((Math.atan2(wx, -wz) * 180) / Math.PI + 360) % 360;
    if (bearing < lo || bearing > hi) continue;
    const W = wallWindows(len, k, M);
    if (!W) continue;
    const pane = Math.max(0, 2 * (W.half - 0.04) - 0.16) * PANE_H;
    for (let j = 0; j < W.n; j++) {
      const s = (j + 0.5) * W.cellW, u = a[0] + eu * s - nu * 0.3, v = a[1] + ev * s - nv * 0.3;
      const R = L.rooms.find((r) => r.level === k && u >= r.r.u0 && u <= r.r.u1 && v >= r.r.v0 && v <= r.r.v1);
      if (!R) continue;
      const q = acc.get(R.id) ?? { g: 0, u: 0, v: 0, nu: 0, nv: 0 };
      q.g += pane; q.u += (u + nu * 0.3) * pane; q.v += (v + nv * 0.3) * pane; q.nu += nu * pane; q.nv += nv * pane;
      acc.set(R.id, q);
    }
  }
  const out: RoomGlass[] = [];
  for (const [id, q] of acc) {
    const l = Math.hypot(q.nu, q.nv) || 1;
    out.push({ room: L.rooms[id], glass: q.g, at: [q.u / q.g, q.v / q.g], out: [q.nu / l, q.nv / l] });
  }
  return out.sort((x, y) => y.glass - x.glass || x.room.id - y.room.id);
}

/** Rooms a morning's light is worth framing in (not a cupboard, a stair or a lift). */
const SEEN = new Set(['living', 'great', 'kitchen', 'dining', 'bed', 'study', 'guest', 'cafe', 'diner', 'bar', 'shop', 'library', 'classroom', 'lobby', 'open', 'hall', 'landing']);
/** Rooms the day is lived in: of two with as much glass, the morning is framed in one of these
 *  before a bedroom (whose bed lies across the light). */
const DAY = new Set(['living', 'great', 'kitchen', 'dining', 'study', 'cafe', 'diner', 'bar', 'shop', 'library', 'classroom', 'lobby', 'open']);
const inR = (r: Rect, u: number, v: number, m = 0) => u > r.u0 - m && u < r.u1 + m && v > r.v0 - m && v < r.v1 + m;

export interface Stance { x: number; z: number; yaw: number; pitch: number; feet: number; room: Room; glass: number; pool?: number }
/** Where the sun through a room's windows lands on its floor (local u, v points sampled over each
 *  window's patch of light), given `sun`, the world direction toward the sun: each pane of the
 *  facade's window cells in the room's facade sides, cast down along the light to the floor — not
 *  where furniture stands (`taken`: the floor it claims, furnish.ts), the light's on that instead. */
export function poolOn(P: Plan, fp: Footprint, R: Room, sun: [number, number, number], k = 0, taken: readonly Rect[] = []): P2[] {
  if (sun[1] < 0.05) return [];
  const M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
  const su = sun[0] * P.ux + sun[2] * P.uz, sv = sun[0] * P.vx + sun[2] * P.vz; // (toward the sun, local)
  const loc = P.loc, ccw = polyArea(loc) > 0, r = R.r, out: P2[] = [];
  for (let i = 0; i < loc.length; i++) {
    const a = loc[i], b = loc[(i + 1) % loc.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const eu = (b[0] - a[0]) / len, ev = (b[1] - a[1]) / len, nu = ccw ? ev : -ev, nv = ccw ? -eu : eu;
    if (su * nu + sv * nv <= 0.02) continue; // (the sun's on the other side of this wall)
    const W = wallWindows(len, k, M);
    if (!W) continue;
    const hw = Math.max(0.05, W.half - 0.12), y0 = 0.98, y1 = 2.17;
    for (let j = 0; j < W.n; j++) {
      const s = (j + 0.5) * W.cellW, cu = a[0] + eu * s - nu * 0.15, cv = a[1] + ev * s - nv * 0.15;
      // (the pane opens onto this room)
      if (cu < r.u0 - 0.05 || cu > r.u1 + 0.05 || cv < r.v0 - 0.05 || cv > r.v1 + 0.05) continue;
      for (let x = 0; x < 5; x++)
        for (let y = 0; y < 5; y++) {
          const t = -hw + (2 * hw * x) / 4, h = y0 + ((y1 - y0) * y) / 4;
          const pu = cu + eu * t - (su / sun[1]) * h, pv = cv + ev * t - (sv / sun[1]) * h;
          if (pu > r.u0 + 0.1 && pu < r.u1 - 0.1 && pv > r.v0 + 0.1 && pv < r.v1 - 0.1 && !taken.some((q) => inR(q, pu, pv))) out.push([pu, pv]);
        }
    }
  }
  return out;
}
/** The room of storey k a morning is framed in: the one with the most glass facing east to south;
 *  of rooms with as much, a room of the day before a bedroom, then the one whose bare floor takes
 *  more of the sun's pools (with `sun`), then the first laid out. Chosen from the plan alone — the
 *  same room whether or not its furniture stands yet. */
function sunniestRoom(P: Plan, fp: Footprint, L: Layout, lo: number, hi: number, k: number, sun?: [number, number, number]) {
  let best: { g: RoomGlass; key: number[] } | null = null;
  for (const g of glassFacing(P, fp, L, lo, hi, k)) {
    if (!SEEN.has(g.room.type)) continue;
    const key = [Math.round(g.glass * 20), DAY.has(g.room.type) ? 1 : 0, sun ? poolOn(P, fp, g.room, sun, k).length : 0];
    if (!best || ahead(key, best.key)) best = { g, key };
  }
  return best;
}
const ahead = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};
/** Of a few homes (each a plan, its footprint and its layout), the one holding the room a morning is
 *  framed in (sunniestRoom's order across them all; the first listed of equals): its index, −1 when
 *  none has glass facing east to south. */
export function sunniest(homes: readonly { P: Plan; fp: Footprint; L: Layout }[], lo = 90, hi = 180, k = 0, sun?: [number, number, number]): number {
  let at = -1, key: number[] | null = null;
  homes.forEach((h, i) => {
    const b = sunniestRoom(h.P, h.fp, h.L, lo, hi, k, sun);
    if (b && (!key || ahead(b.key, key))) (at = i), (key = b.key);
  });
  return at;
}
/** Whether a point of room R's floor (local u, v) lies in the sun: the shader's pools — from it toward
 *  the sun and out through a pane of one of the room's own facade window cells (the panes poolOn casts). */
function sunlit(P: Plan, fp: Footprint, R: Room, sun: [number, number, number], k: number) {
  const M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
  const su = sun[0] * P.ux + sun[2] * P.uz, sv = sun[0] * P.vx + sun[2] * P.vz, r = R.r;
  const loc = P.loc, ccw = polyArea(loc) > 0;
  const walls: { a: P2; eu: number; ev: number; nu: number; nv: number; len: number; toward: number; W: NonNullable<ReturnType<typeof wallWindows>> }[] = [];
  for (let i = 0; i < loc.length; i++) {
    const a = loc[i], b = loc[(i + 1) % loc.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const eu = (b[0] - a[0]) / len, ev = (b[1] - a[1]) / len, nu = ccw ? ev : -ev, nv = ccw ? -eu : eu, toward = su * nu + sv * nv;
    const W = toward > 0.02 && sun[1] >= 0.05 ? wallWindows(len, k, M) : null;
    if (W) walls.push({ a, eu, ev, nu, nv, len, toward, W });
  }
  return (u: number, v: number) => {
    for (const w of walls) {
      const din = (w.a[0] - u) * w.nu + (w.a[1] - v) * w.nv; // (how far in from that wall)
      if (din < 0) continue;
      const h = (din * sun[1]) / w.toward; // (the height the light comes in at)
      if (h < 0.98 || h > 2.17) continue;
      const s = (u + (su / sun[1]) * h - w.a[0]) * w.eu + (v + (sv / sun[1]) * h - w.a[1]) * w.ev, j = Math.floor(s / w.W.cellW), cs = (j + 0.5) * w.W.cellW;
      if (s < 0 || s > w.len || j >= w.W.n || Math.abs(s - cs) > Math.max(0.05, w.W.half - 0.12)) continue;
      const cu = w.a[0] + w.eu * cs - w.nu * 0.15, cv = w.a[1] + w.ev * cs - w.nv * 0.15;
      if (cu > r.u0 - 0.05 && cu < r.u1 + 0.05 && cv > r.v0 - 0.05 && cv < r.v1 + 0.05) return true;
    }
    return false;
  };
}
/** What the lens (62° high, 16:9) sees of room R from c (local), the eye 1.6 m up, looking along
 *  `dir` (a local unit vector) pitched by `pitch`: the shares of the frame on its bare floor, on its
 *  sunlit floor and on its biggest wall — the room as a box, its furniture (`taken`) as blocks the
 *  height of a sofa's back. */
function frameIn(R: Rect, c: P2, dir: P2, pitch: number, lit: (u: number, v: number) => boolean, taken: readonly Rect[], ceil: number) {
  const ty = Math.tan((31 * Math.PI) / 180), tx = (ty * 16) / 9, e = 1.6, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const NX = 16, NY = 9, wall = [0, 0, 0, 0];
  let floor = 0, sun = 0;
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const x = (-1 + (2 * i + 1) / NX) * tx, y = (-1 + (2 * j + 1) / NY) * ty;
      const du = dir[0] * (cp - sp * y) + dir[1] * x, dv = dir[1] * (cp - sp * y) - dir[0] * x, dy = sp + cp * y;
      let tw = Infinity, side = -1;
      if (du > 1e-9) (tw = (R.u1 - c[0]) / du), (side = 1);
      else if (du < -1e-9) (tw = (R.u0 - c[0]) / du), (side = 0);
      if (dv > 1e-9 && (R.v1 - c[1]) / dv < tw) (tw = (R.v1 - c[1]) / dv), (side = 3);
      else if (dv < -1e-9 && (R.v0 - c[1]) / dv < tw) (tw = (R.v0 - c[1]) / dv), (side = 2);
      const tf = dy < -1e-9 ? e / -dy : Infinity;
      if (tf < tw) {
        // (over a piece of furniture on the way down — below its back — the ray ends on that)
        const t85 = (e - 0.85) / -dy;
        if (taken.some((q) => [t85, (t85 + tf) / 2, tf * 0.999].some((t) => inR(q, c[0] + du * t, c[1] + dv * t)))) continue;
        floor++;
        if (lit(c[0] + du * tf, c[1] + dv * tf)) sun++;
      } else if (side >= 0) {
        const h = e + dy * tw;
        if (h >= 0 && h <= ceil) wall[side]++;
      }
    }
  const n = NX * NY;
  return { floor: floor / n, sun: sun / n, wall: Math.max(...wall) / n };
}
/** The stance that frames the room of storey k with the most glass facing east to south (null: no
 *  such glass). With the sun (`sun`: world direction toward it) — the stance in that room (on a 40 cm
 *  grid, or a step inside one of its doorways; turned toward its pools, a little either way, and
 *  pitched down 0.2–0.44) whose frame holds the most sunlit floor, while no bare floor or wall takes
 *  more than about a quarter of it and the light no more than half the floor in sight (`pool`: that
 *  sunlit share of the frame); with its furniture (`taken`: the floor it claims, furnish.ts) not stood
 *  in and seen as low blocks. Without: in a doorway of the room, or at its far side, whichever stands
 *  farthest back from that glass, looking at the floor a stride in from the windows. */
export function sunRoomView(P: Plan, fp: Footprint, L: Layout, lo = 90, hi = 180, k = 0, sun?: [number, number, number], taken: readonly Rect[] = []): Stance | null {
  const g = sunniestRoom(P, fp, L, lo, hi, k, sun)?.g;
  if (!g) return null;
  const R = g.room.r, [nu, nv] = g.out;
  const pool = sun ? poolOn(P, fp, g.room, sun, k, taken) : [];
  if (sun && pool.length >= 4) {
    const cand: P2[] = [];
    for (let u = R.u0 + 0.45; u <= R.u1 - 0.45 + 1e-6; u += 0.4) for (let v = R.v0 + 0.45; v <= R.v1 - 0.45 + 1e-6; v += 0.4) cand.push([u, v]);
    for (const d of L.doors) {
      if (d.level !== k || !d.rooms.includes(g.room.id)) continue;
      const [u, v] = d.ax === 0 ? [d.t, d.c] : [d.c, d.t];
      cand.push([u + (d.ax === 1 ? Math.sign((R.u0 + R.u1) / 2 - u) * 0.35 : 0), v + (d.ax === 0 ? Math.sign((R.v0 + R.v1) / 2 - v) * 0.35 : 0)]);
    }
    const lit = sunlit(P, fp, g.room, sun, k), ceil = P.floorH - 0.3;
    // (the lens sees past the room into the rest of its open plan: the space's extent)
    const box = L.rooms.filter((q) => q.level === k && q.space === g.room.space).reduce((b, q) => ({ u0: Math.min(b.u0, q.r.u0), u1: Math.max(b.u1, q.r.u1), v0: Math.min(b.v0, q.r.v0), v1: Math.max(b.v1, q.r.v1) }), { ...R });
    let best: { c: P2; ang: number; pitch: number; s: number; sun: number } | null = null;
    for (const c of cand) {
      if (taken.some((q) => inR(q, c[0], c[1], 0.3))) continue; // (not standing in the furniture)
      const near = pool.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= 1.4);
      if (!near.length) continue;
      const a0 = Math.atan2(near.reduce((s, p) => s + p[1], 0) / near.length - c[1], near.reduce((s, p) => s + p[0], 0) / near.length - c[0]);
      // (the windows the light comes through in the frame too: their middle within the lens)
      const wa = Math.atan2(g.at[1] - c[1], g.at[0] - c[0]);
      for (const da of [0, -0.2, 0.2, -0.4, 0.4])
        for (const pitch of [-0.2, -0.28, -0.36, -0.44]) {
          const ang = a0 + da, f = frameIn(box, c, [Math.cos(ang), Math.sin(ang)], pitch, lit, taken, ceil);
          const over = Math.max(0, f.floor - 0.22) + Math.max(0, f.wall - 0.24) + Math.max(0, f.sun - 0.45 * f.floor);
          const s = f.sun - 3 * over + (Math.abs(((wa - ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) <= 0.7 ? 0.004 : 0);
          if (!best || s > best.s + 1e-9) best = { c, ang, pitch, s, sun: f.sun };
        }
    }
    if (best) {
      const [x, z] = toW(P, best.c[0], best.c[1]), [x1, z1] = toW(P, best.c[0] + Math.cos(best.ang), best.c[1] + Math.sin(best.ang));
      return { x, z, yaw: Math.atan2(-(x1 - x), -(z1 - z)), pitch: best.pitch, feet: P.floor0 + k * P.floorH, room: g.room, glass: g.glass, pool: best.sun };
    }
  }
  // the floor a stride in from that glass: where the pools lie
  const f: P2 = [Math.max(R.u0 + 0.3, Math.min(R.u1 - 0.3, g.at[0] - nu * 1.8)), Math.max(R.v0 + 0.3, Math.min(R.v1 - 0.3, g.at[1] - nv * 1.8))];
  const back = (p: P2) => (g.at[0] - p[0]) * nu + (g.at[1] - p[1]) * nv; // how far back from the glass
  const cands: P2[] = [];
  // its doorways (a step inside the room: a doorway is clear of furniture)
  for (const d of L.doors) {
    if (d.level !== k || !d.rooms.includes(g.room.id)) continue;
    const [u, v] = d.ax === 0 ? [d.t, d.c] : [d.c, d.t];
    const inU = d.ax === 1 ? Math.sign((R.u0 + R.u1) / 2 - u) : 0, inV = d.ax === 0 ? Math.sign((R.v0 + R.v1) / 2 - v) : 0;
    cands.push([u + inU * 0.35, v + inV * 0.35]);
  }
  // its far side from the glass, half a metre off the walls
  const m = 0.5, cu = Math.max(R.u0 + m, Math.min(R.u1 - m, (R.u0 + R.u1) / 2 - nu * 99)), cv = Math.max(R.v0 + m, Math.min(R.v1 - m, (R.v0 + R.v1) / 2 - nv * 99));
  cands.push([cu, cv]);
  let best = cands[0], bs = -Infinity;
  for (const c of cands) {
    // (back from the glass, and seeing it square rather than along its wall)
    const d = Math.hypot(f[0] - c[0], f[1] - c[1]) || 1, square = ((f[0] - c[0]) * nu + (f[1] - c[1]) * nv) / d;
    const s = back(c) + square * 1.5;
    if (s > bs) (bs = s), (best = c);
  }
  const [x, z] = toW(P, best[0], best[1]), [fx, fz] = toW(P, f[0], f[1]);
  const dist = Math.hypot(fx - x, fz - z);
  return { x, z, yaw: Math.atan2(-(fx - x), -(fz - z)), pitch: -Math.max(0.2, Math.min(0.42, Math.atan2(1.5, dist + 1.2))), feet: P.floor0 + k * P.floorH, room: g.room, glass: g.glass };
}
