// Where to stand to see a room in its best light (tools/review-shots.js pose 19, "morning sun"): the
// room with the most glass facing east to south, seen from a doorway or its far side toward that
// glass, so the sun's pools on the floor lie between the lens and the windows. Pure: a plan, its
// footprint and its layout in; a stance (world x, z, yaw, pitch, feet) out.
import { wallWindows, polyArea, toW, type Plan } from './plan';
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

export interface Stance { x: number; z: number; yaw: number; pitch: number; feet: number; room: Room; glass: number }
/** The stance that frames the room of storey k with the most glass facing east to south (null: no
 *  such glass): in a doorway of the room, or at its far side, whichever stands farthest back from that
 *  glass (more floor in front of it), looking at the floor a stride in from the windows, the eye
 *  pitched down enough for the pools and not so far the windows' heads leave the frame. */
export function sunRoomView(P: Plan, fp: Footprint, L: Layout, lo = 90, hi = 180, k = 0): Stance | null {
  const g = glassFacing(P, fp, L, lo, hi, k).find((q) => SEEN.has(q.room.type));
  if (!g) return null;
  const R = g.room.r, [nu, nv] = g.out;
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
