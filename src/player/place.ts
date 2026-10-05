// Where a painted thing goes (docs/GAME_DESIGN.md §5): you aim, the world snaps. Every family
// says what site it needs; these solvers find the nearest one to the point you aimed at, and a
// sensible facing — a boat on open water with its bow off the land, a car in the lane going the
// way you look. When nothing fits they say why, and where the nearest fit is.
//
// Pure functions over a small world interface, so the brush, the developer summons and the tests
// all share one set of rules.
import type { Road } from '../world/data';

export interface PlaceWorld {
  /** terrain height (m); water is below 0 */
  height(x: number, z: number): number;
  /** signed distance to the shore (m): negative on the water */
  sdf(x: number, z: number): number;
  /** ≥ 0 inside a building footprint */
  building(x: number, z: number): number;
  roads(): Road[];
  driveLeft: boolean;
  /** optional: false where something already stands (a moored boat, a parked car) */
  free?: (x: number, z: number) => boolean;
}
export interface Spot { x: number; z: number; yaw: number; d: number }
export type Placement = { ok: true; spot: Spot } | { ok: false; why: string };

/** Roads a car is never set down on. */
export const NOT_FOR_CARS = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'];

/** Open water, as the boats know it: deep enough (m below the surface) and off the shore. */
export const openWater = (w: PlaceWorld, x: number, z: number, depth = 0.45) => w.height(x, z) < -depth && w.sdf(x, z) < -1.2;
/** Room for a hull: open water here and r m to each side (the default fits most boats; a small
 *  one asks less — a skiff can lie near the bank where you can step aboard). */
export interface Hull { room: number; depth: number }
export const HULL: Hull = { room: 5, depth: 0.45 };
export const boatRoom = (w: PlaceWorld, x: number, z: number, r = HULL.room, depth = HULL.depth) =>
  openWater(w, x, z, depth) && openWater(w, x + r, z, depth) && openWater(w, x - r, z, depth) && openWater(w, x, z + r, depth) && openWater(w, x, z - r, depth);

/** Bow away from the land: down the terrain's falling slope (the facing you gave, on flat water). */
export function bowOffLand(w: PlaceWorld, x: number, z: number, facing: number) {
  const gx = w.height(x + 8, z) - w.height(x - 8, z), gz = w.height(x, z + 8) - w.height(x, z - 8);
  return Math.hypot(gx, gz) > 1e-3 ? Math.atan2(gx, gz) : facing;
}

const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** The compass word for a direction in the local frame (+x east, +z south). */
export const compass = (dx: number, dz: number) => WORDS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];
const dist = (d: number) => (d < 950 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);

/** Rings out from (ax, az), nearest first; each ring starts at `facing` and alternates either side. */
function* rings(ax: number, az: number, facing: number, r0: number, r1: number, step: number) {
  const fx = -Math.sin(facing), fz = -Math.cos(facing), a0 = Math.atan2(fx, fz);
  yield [ax, az, 0] as const;
  for (let r = Math.max(step, r0); r <= r1; r += step) {
    const n = Math.max(8, Math.floor((r * 2 * Math.PI) / step));
    for (let k = 0; k < n; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / n);
      yield [ax + Math.sin(a) * r, az + Math.cos(a) * r, r] as const;
    }
  }
}

/** A boat near where you aimed: the nearest spot with room for its hull, bow off the land. With
 *  none in reach, it looks out to `far` m to say where the water is (0: don't look). */
export function placeBoat(w: PlaceWorld, ax: number, az: number, facing: number, reach = 60, far = 1500, hull: Hull = HULL): Placement {
  for (const [x, z, d] of rings(ax, az, facing, 0, reach, 3))
    if (boatRoom(w, x, z, hull.room, hull.depth) && (!w.free || w.free(x, z))) return { ok: true, spot: { x, z, yaw: bowOffLand(w, x, z, facing), d } };
  if (far <= reach) return { ok: false, why: 'a boat needs open water' };
  // nothing in reach: say where the water is
  for (const [x, z, d] of rings(ax, az, facing, reach, far, 16))
    if (boatRoom(w, x, z)) return { ok: false, why: `a boat needs open water — the nearest is ${dist(d)} ${compass(x - ax, z - az)}` };
  return { ok: false, why: 'a boat needs open water — there is none nearby' };
}

/** A car near where you aimed: in the nearest lane of a street, pointing the way you look (right-
 *  hand traffic keeps right of the centreline, left-hand left). */
export function placeCar(w: PlaceWorld, ax: number, az: number, facing: number, reach = 25): Placement {
  const fx = -Math.sin(facing), fz = -Math.cos(facing);
  let best: Spot | null = null, near: { x: number; z: number; d: number } | null = null;
  for (const r of w.roads()) {
    if (r.lod || r.br || NOT_FOR_CARS.includes(r.c)) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const sx = r.p[i] / 10, sz = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
      const dx = bx - sx, dz = bz - sz, L2 = dx * dx + dz * dz;
      if (L2 < 4) continue;
      const L = Math.sqrt(L2), ux = dx / L, uz = dz / L, dir = ux * fx + uz * fz >= 0 ? 1 : -1;
      const lane = Math.min(2.2, r.w / 4) * (w.driveLeft ? -1 : 1);
      // the point of this stretch nearest your aim, then 4 m steps either side of it (a house
      // built right up to the kerb there shouldn't lose you the whole street)
      const s0 = Math.max(0, Math.min(L, (ax - sx) * ux + (az - sz) * uz));
      const d0 = Math.hypot(sx + ux * s0 - ax, sz + uz * s0 - az);
      if (!near || d0 < near.d) near = { x: sx + ux * s0, z: sz + uz * s0, d: d0 };
      if (d0 > reach) continue;
      for (let k = 0; k < 13; k++) {
        const s = s0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 4;
        if (s < 0 || s > L) continue;
        const px = sx + ux * s, pz = sz + uz * s, d = Math.hypot(px - ax, pz - az);
        if (d > reach || (best && d >= best.d)) continue;
        const x = px - uz * dir * lane, z = pz + ux * dir * lane;
        if (w.building(x, z) >= 0 || (w.free && !w.free(x, z))) continue;
        best = { x, z, yaw: Math.atan2(-ux * dir, -uz * dir), d };
      }
    }
  }
  if (best) return { ok: true, spot: best };
  return { ok: false, why: near && near.d < 3000 ? `a car needs a street — the nearest is ${dist(near.d)} ${compass(near.x - ax, near.z - az)}` : 'a car needs a street — there is none nearby' };
}

/** Open ground for a balloon: dry, level enough, off the roads, and clear of buildings for the
 *  envelope's width (it's ~17 m across when it's up). */
export function balloonRoom(w: PlaceWorld, x: number, z: number, room = 9) {
  const h = w.height(x, z);
  if (!(h > 0.3) || w.sdf(x, z) < 3 || w.building(x, z) >= 0) return false;
  for (let a = 0; a < 8; a++) {
    const qx = x + Math.sin((a / 8) * Math.PI * 2) * room, qz = z + Math.cos((a / 8) * Math.PI * 2) * room;
    if (w.building(qx, qz) >= 0 || Math.abs(w.height(qx, qz) - h) > 2.5) return false;
  }
  return true;
}
/** A balloon near where you aimed: the nearest open ground with room for it. */
export function placeBalloon(w: PlaceWorld, ax: number, az: number, facing: number, reach = 30): Placement {
  for (const [x, z, d] of rings(ax, az, facing, 0, reach, 3))
    if (balloonRoom(w, x, z) && (!w.free || w.free(x, z))) return { ok: true, spot: { x, z, yaw: facing, d } };
  return { ok: false, why: 'a balloon needs open ground — a field, a beach, a park' };
}
