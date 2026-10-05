// The front door of a house, as the review's round 10 must-fix 4 measures it (docs/earth/REVIEWER.md):
// seeded cottages and bigger houses, the room the door opens into, the stair seen from the door,
// and the living room's cased opening off the hall.
import type { Footprint, Door } from '../../src/world/buildings';
import type { Plan } from '../../src/world/interior/plan';
import type { Layout } from '../../src/world/interior/layout';
import { rect, fpOf, doorN } from './interiorCheck';

export interface HomeCase { name: string; fp: Footprint; door: Door; seed: number }
const cases = (sizes: [number, number][], tops: (i: number) => number, seed0: number): HomeCase[] =>
  Array.from({ length: 40 }, (_, i) => {
    const [L, W] = sizes[i % sizes.length], top = tops(i);
    // the door anywhere along the middle 40% of the front, seeds and the house's own seed apart
    const x = -L / 2 + L * (0.3 + (0.4 * ((i * 7) % 40)) / 39);
    return { name: `${L}×${W}/${top}/${i}`, fp: { ...fpOf(rect(L, W), 'house', top), seed: 0.17 + i / 97 }, door: doorN(W, x), seed: seed0 + i };
  });
/** 40 cottages of 56–106 m² a storey (width along the front × depth), half of them two storeys. */
export const cottageCases = () => cases([[8, 7], [9, 7], [10, 7.5], [11.1, 7.7], [12, 8], [9, 9], [10, 9.5], [8.5, 10], [7.5, 8], [11, 9.6]], (i) => (i % 4 < 2 ? 3.8 : 6.7), 2000);
/** 40 houses of 154–192 m² a storey, two storeys (every fourth three). */
export const bigHouseCases = () => cases([[14, 11], [15, 11], [16, 10], [13, 12.5], [12, 13], [15, 12], [16, 12], [17, 10], [14, 12], [18, 9]], (i) => (i % 4 === 3 ? 9.6 : 6.7), 3000);

/** The type of the room the front door opens into (the plan's, just inside its door). */
export const entryType = (P: Plan, L: Layout) => L.rooms.find((r) => r.level === 0 && P.ud + 0.35 >= r.r.u0 && P.ud + 0.35 <= r.r.u1 && P.vd >= r.r.v0 && P.vd <= r.r.v1)?.type ?? null;

type P2 = [number, number];
/** Does the segment a → b (local u, v) on storey k cross a wall of the layout (not through a doorway)? */
function blocked(L: Layout, k: number, a: P2, b: P2) {
  for (const w of L.walls) {
    if (w.level !== k) continue;
    // the wall's line: along u at v = c (ax 0) or along v at u = c (ax 1)
    const [ca, cb] = w.ax === 0 ? [a[1], b[1]] : [a[0], b[0]];
    if ((ca - w.c) * (cb - w.c) > 0) continue;
    const t = Math.abs(cb - ca) < 1e-9 ? 0 : (w.c - ca) / (cb - ca);
    const along = w.ax === 0 ? a[0] + (b[0] - a[0]) * t : a[1] + (b[1] - a[1]) * t;
    if (along < w.a || along > w.b) continue;
    if (w.gaps.some(([g0, g1]) => along > g0 + 0.02 && along < g1 - 0.02)) continue;
    return true;
  }
  return false;
}
/** The stair seen from the front door: its foot (the bottom step's front edge) within 5 m of the door,
 *  inside a 90° view along the door's axis, with no wall in between. */
export function stairInView(P: Plan, L: Layout, reach = 5, half = 45) {
  const F = P.flights.find((f) => f.level === 0 && !((f.lo ?? 0) > 0.01));
  if (!F) return { ok: false, why: 'no stair' };
  const dir = Math.sign(F.topU - F.bottomU) || 1, c0 = F.axis ? F.u0 : F.v0, c1 = F.axis ? F.u1 : F.v1;
  const door: P2 = [P.ud + 0.05, P.vd];
  let why = '';
  for (const c of [(c0 + c1) / 2, c0 + 0.1, c1 - 0.1]) {
    const p: P2 = F.axis ? [c, F.bottomU - dir * 0.05] : [F.bottomU - dir * 0.05, c];
    const du = p[0] - door[0], dv = p[1] - door[1], d = Math.hypot(du, dv), ang = (Math.atan2(Math.abs(dv), du) * 180) / Math.PI;
    if (d > reach) { why = `foot ${d.toFixed(1)} m away`; continue; }
    if (ang > half) { why = `foot ${ang.toFixed(0)}° off the axis`; continue; }
    if (blocked(L, 0, door, p)) { why = 'a wall between'; continue; }
    return { ok: true, why: '', d, ang };
  }
  return { ok: false, why };
}
/** The living room's opening off the hall: a doorway ≥ `w` wide whose middle is within `half`° of
 *  the door's axis, seen from the door. */
export function livingOpening(P: Plan, L: Layout, w = 1.2, half = 30) {
  const liv = L.rooms.filter((r) => r.level === 0 && r.type === 'living').map((r) => r.id);
  if (!liv.length) return { ok: false, why: 'no living room' };
  let why = 'not off the hall';
  for (const d of L.doors) {
    if (d.level !== 0) continue;
    const [a, b] = d.rooms;
    const other = liv.includes(a) ? b : liv.includes(b) ? a : -1;
    if (other < 0 || L.rooms[other].type !== 'hall') continue;
    const [u, v] = d.ax === 0 ? [d.t, d.c] : [d.c, d.t];
    const ang = (Math.atan2(Math.abs(v - P.vd), u - P.ud) * 180) / Math.PI;
    if (d.w < w - 1e-6) { why = `${d.w.toFixed(2)} m wide`; continue; }
    if (ang > half) { why = `${ang.toFixed(0)}° off the axis`; continue; }
    return { ok: true, why: '', w: d.w, ang };
  }
  return { ok: false, why };
}
