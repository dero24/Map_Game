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
/** The stance that frames the room of storey k with the most glass facing east to south (null: no
 *  such glass). With the sun (`sun`: world direction toward it) — the stance in that room (on a 40 cm
 *  grid, or a step inside one of its doorways) that sees most of the sun's pools on its floor in the
 *  lens, a metre or more off, the windows in view too; with its furniture (`taken`: the floor it
 *  claims, furnish.ts) not stood in, and the pools behind a sofa or a bed out of sight. Without: in a
 *  doorway of the room, or at its far side, whichever stands farthest back from that glass, looking
 *  at the floor a stride in from the windows. The eye is pitched down enough for the pools and not so
 *  far the windows' heads leave the frame. */
export function sunRoomView(P: Plan, fp: Footprint, L: Layout, lo = 90, hi = 180, k = 0, sun?: [number, number, number], taken: readonly Rect[] = []): Stance | null {
  const g = sunniestRoom(P, fp, L, lo, hi, k, sun)?.g;
  if (!g) return null;
  const R = g.room.r, [nu, nv] = g.out;
  const pool = sun ? poolOn(P, fp, g.room, sun, k, taken) : [];
  if (pool.length >= 4) {
    const cand: P2[] = [];
    for (let u = R.u0 + 0.45; u <= R.u1 - 0.45 + 1e-6; u += 0.4) for (let v = R.v0 + 0.45; v <= R.v1 - 0.45 + 1e-6; v += 0.4) cand.push([u, v]);
    for (const d of L.doors) {
      if (d.level !== k || !d.rooms.includes(g.room.id)) continue;
      const [u, v] = d.ax === 0 ? [d.t, d.c] : [d.c, d.t];
      cand.push([u + (d.ax === 1 ? Math.sign((R.u0 + R.u1) / 2 - u) * 0.35 : 0), v + (d.ax === 0 ? Math.sign((R.v0 + R.v1) / 2 - v) * 0.35 : 0)]);
    }
    const H = (40 * Math.PI) / 180, V = (29 * Math.PI) / 180, eye = 1.6;
    // (a pool's out of sight where the line to it passes over furniture below sofa-back height: past
    // the middle of the way down from the eye)
    const hidden = (c: P2, p: P2) => taken.some((q) => [0.5, 0.6, 0.7, 0.8, 0.9].some((t) => inR(q, c[0] + (p[0] - c[0]) * t, c[1] + (p[1] - c[1]) * t)));
    let best: { c: P2; yaw: number; pitch: number; s: number; n: number } | null = null;
    for (const c of cand) {
      if (taken.some((q) => inR(q, c[0], c[1], 0.3))) continue; // (not standing in the furniture)
      const near = pool.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= 1.0);
      if (!near.length) continue;
      const fu = near.reduce((s, p) => s + p[0], 0) / near.length, fv = near.reduce((s, p) => s + p[1], 0) / near.length;
      const fd = Math.hypot(fu - c[0], fv - c[1]), ang = Math.atan2(fv - c[1], fu - c[0]);
      const pitch = -Math.max(0.18, Math.min(0.55, Math.atan2(eye, fd) * 0.8));
      let n = 0;
      for (const p of near) {
        const d = Math.hypot(p[0] - c[0], p[1] - c[1]), da = Math.abs(((Math.atan2(p[1] - c[1], p[0] - c[0]) - ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        if (da <= H && Math.abs(-Math.atan2(eye, d) - pitch) <= V && !hidden(c, p)) n++;
      }
      // (the windows the light comes through in the frame too: their middle within the lens)
      const wa = Math.abs(((Math.atan2(g.at[1] - c[1], g.at[0] - c[0]) - ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      const s = n + (wa <= H ? 6 : 0);
      if (!best || s > best.s + 1e-9) best = { c, yaw: 0, pitch, s, n };
      if (best.c === c) {
        const [x0, z0] = toW(P, c[0], c[1]), [x1, z1] = toW(P, fu, fv);
        best.yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
      }
    }
    if (best) {
      const [x, z] = toW(P, best.c[0], best.c[1]);
      return { x, z, yaw: best.yaw, pitch: best.pitch, feet: P.floor0 + k * P.floorH, room: g.room, glass: g.glass, pool: best.n / pool.length };
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
