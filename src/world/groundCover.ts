// The ground you walk on, as the paint lays it out (groundPaint.ts) and as everything set down on it
// has to respect it (micro.ts): how wide a street's sidewalk runs, where its kerb and gutter are,
// how the flags are scored, what a house's yard is, and what counts as paved.
//
// A North American street, kerb to kerb: the asphalt, a 0.6 m concrete gutter pan along each kerb,
// the kerb's 15 cm face (a shadow line seen from the walk), then the sidewalk in 1.5 m flags (a
// centre joint where it's 3 m wide or more) out to the yards. Driveways cross the walk on an apron
// of their own, the kerb cut down to the gutter. Pure and deterministic: the same street and the
// same house give the same ground on every visit, in every slice of the paint.
import type { HoodClass } from './hood';

/** The sidewalk band beyond the carriageway's edge (m), by the street's rank (roadPalette ROAD_RANK):
 *  the main roads' wide shop walks, a residential street's 1.5 m, none on a service way or path. */
export const sidewalkBand = (rank: number) => (rank >= 5 ? 3.5 : rank >= 2 ? 1.5 : 0);
/** The kerb: its face (the shadow line from the walk) and the gutter pan inside it. */
export const KERB = { face: 0.15, gutter: 0.6 };
/** Sidewalk flags: scored every 1.5 m along the walk, with a centre joint on walks 3 m wide or more. */
export const FLAG = 1.5, CENTRE_JOINT = 3;
/** How far a house's yard runs round it (m): the walks, drives and streets are laid over it. */
export const YARD = 5;
/** A walk within this of a beach takes the sand the wind blows off it. */
export const DRIFT_REACH = 60;

/** A small integer hash in [0, 1). */
export function hash2(x: number, z: number, salt = 0) {
  let h = (Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export type Yard = 'lawn' | 'gravel' | 'shell';
export const YARDS: Yard[] = ['lawn', 'gravel', 'shell'];
/** A house's yard, by the neighbourhood and the coast (never by the town's name): the old shore
 *  grids are half stone — white gravel, crushed shell from the bay — where the salt and the sand
 *  make a lawn hard work; a suburb is mostly lawn, a tract or an estate nearly all; a dry climate's
 *  yards are gravel. (x, z): the house's middle; `sea`: metres to the ocean (Terrain.oceanDistAt). */
export function yardOf(x: number, z: number, hood: HoodClass, sea: number, arid = false): Yard {
  const u = hash2(x * 0.5, z * 0.5, 17);
  const coast = sea < 500; // (the terrain's ocean distance tops out at 510 m)
  if (arid) return u < 0.65 ? 'gravel' : 'lawn';
  const [lawn, gravel] = hood === 'grid' ? (coast ? [0.4, 0.68] : [0.72, 1])
    : hood === 'suburb' ? (coast ? [0.62, 0.8] : [0.86, 1])
    : hood === 'tract' ? [0.92, 1]
    : [0.95, 1];
  return u < lawn ? 'lawn' : u < gravel ? 'gravel' : coast ? 'shell' : 'gravel';
}

type P = [number, number];

/** The paving round buildings where a block is dense (groundPaint.ts Painter.paint's census, the
 *  same sums): each footprint's weighted area (a house or a shed on its lot 0.45, any other 1) in
 *  40 m cells; a building whose ground within 60 m is a quarter built on — or one big building on
 *  its own — stands in concrete out to 8, 11 or 14 m. `rings` in metres. */
export function pavedAprons(foot: { ring: P[]; weight: number }[]): { ring: P[]; band: number }[] {
  const C = 40, R = 60, cells = new Map<string, [number, number, number][]>(), at: [number, number, number][] = [];
  for (const f of foot) {
    const r = f.ring;
    let a = 0, cx = 0, cz = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) (a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])), (cx += r[i][0]), (cz += r[i][1]);
    cx /= r.length;
    cz /= r.length;
    const k = `${Math.floor(cx / C)},${Math.floor(cz / C)}`, e: [number, number, number] = [cx, cz, Math.abs(a / 2) * f.weight];
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(e);
    at.push(e);
  }
  const out: { ring: P[]; band: number }[] = [];
  foot.forEach((f, i) => {
    const [cx, cz, own] = at[i];
    let n = 0;
    for (let a = Math.floor((cx - R) / C); a <= Math.floor((cx + R) / C); a++)
      for (let b = Math.floor((cz - R) / C); b <= Math.floor((cz + R) / C); b++)
        for (const [bx, bz, ba] of cells.get(`${a},${b}`) ?? []) if ((bx - cx) ** 2 + (bz - cz) ** 2 < R * R) n += ba;
    const d = Math.max(n / (Math.PI * R * R * 0.25), own / 900);
    if (d >= 1) out.push({ ring: f.ring, band: 8 + 3 * (d < 1.3 ? 0 : d < 1.7 ? 1 : 2) });
  });
  return out;
}
/** A storefront's sidewalk, up to the glass (groundPaint.ts: a shop's frontage is paved). */
export const SHOPFRONT = 3.5;
/** Mapped areas the paint lays paved (or wet): a lot, a plaza, a pier, a marina's hard standing. */
export const PAVED_AREA = new Set(['parking', 'plaza', 'pier', 'marina', 'commercial', 'pool']);

/** Distance from (x, z) to segment a–b. */
export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
/** Inside a ring (even-odd). */
export function inRing(x: number, z: number, r: P[]) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
}
/** Distance from (x, z) to a ring's edge (0 inside). */
export function ringDist(x: number, z: number, r: P[]) {
  if (r.length > 2 && inRing(x, z, r)) return 0;
  let d = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, segDist(x, z, r[j][0], r[j][1], r[i][0], r[i][1]));
  return d;
}
