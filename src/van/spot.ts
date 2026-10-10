// Where the van is parked when you wake (pure — callbacks for the world). The nearest car park to
// where you start, in one of its stalls' directions, its back toward the water if there's water
// about (step out and the shore is in front of you) — in a stall rather than across its aisles,
// clear of every wall, the ground behind its back door open to step down onto, no building where
// the room (which reaches past the van) stands. The parked cars where the van and its room go are
// moved on (they come and go anyway: kerbCars.keepOut), but none may stand behind its back door.
// From the map's own car parks, the same for every visitor — never a place's name or a spot
// written down per town.
import type { VanLayout, VanPose } from './layout';
import { toWorld } from './layout';

type P = [number, number];
export interface SpotEnv {
  /** the map's areas (paint.json / a tile's: `c` the kind, `o` outer rings in decimetres) */
  areas: { c: string; o: number[][]; lod?: number }[];
  oceanDist(x: number, z: number): number;
  height(x: number, z: number): number;
  building(x: number, z: number): boolean;
  blocked(x: number, z: number, r: number): boolean;
  /** a parked car about here (its walls aren't walls to the van: it moves on) */
  car?(x: number, z: number): boolean;
  /** a road's carriageway here (a car park's aisles among them: the van parks in a stall) */
  road?(x: number, z: number): boolean;
}

export function inRing(x: number, z: number, ring: P[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const unpack = (o: number[]): P[] => { const r: P[] = []; for (let i = 0; i + 1 < o.length; i += 2) r.push([o[i] / 10, o[i + 1] / 10]); return r; };

/** The best stall for the van near `from`, or null when there's no car park within `reach` m. */
export function findVanSpot(from: { x: number; z: number }, env: SpotEnv, L: VanLayout, reach = 700): VanPose | null {
  const lots = env.areas
    .filter((a) => a.c === 'parking' && !a.lod && a.o?.[0]?.length >= 6)
    .map((a) => {
      const ring = unpack(a.o[0]);
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      return { ring, cx, cz, d: Math.hypot(cx - from.x, cz - from.z) };
    })
    .filter((l) => l.d < reach)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const hw = L.recipe.W / 2 + 0.35, hl = L.recipe.L / 2 + 0.35;
  const R = L.room;
  let best = null as { pose: VanPose; score: number } | null;
  for (const lot of lots) {
    // the stalls' directions: along the lot's longest side, and across it
    let ax = 1, az = 0, longest = 0;
    for (let i = 0; i < lot.ring.length; i++) {
      const [x0, z0] = lot.ring[i], [x1, z1] = lot.ring[(i + 1) % lot.ring.length], l = Math.hypot(x1 - x0, z1 - z0);
      if (l > longest) (longest = l), (ax = (x1 - x0) / l), (az = (z1 - z0) / l);
    }
    const base = Math.atan2(ax, az);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of lot.ring) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    // (the stalls nearest the water and where you start first: a big lot has thousands)
    const pts: { x: number; z: number; k: number }[] = [];
    for (let x = x0 + 2; x <= x1 - 2; x += 1.5)
      for (let z = z0 + 2; z <= z1 - 2; z += 1.5) if (inRing(x, z, lot.ring)) pts.push({ x, z, k: env.oceanDist(x, z) + 0.2 * Math.hypot(x - from.x, z - from.z) });
    pts.sort((a, b) => a.k - b.k);
    for (const { x, z } of pts.slice(0, 200)) {
        for (let q = 0; q < 4; q++) {
          const pose: VanPose = { x, y: 0, z, yaw: base + (q * Math.PI) / 2 };
          const at = (lx: number, lz: number) => toWorld(pose, lx, lz);
          const car = (x: number, z: number) => !!env.car?.(x, z);
          const wall = (x: number, z: number, r: number) => env.blocked(x, z, r) && !car(x, z);
          // the van's own ground: inside the lot, clear of every wall (cars move on), best off the aisles
          let ok = true, cars = 0, aisle = 0;
          for (let u = -1; u <= 1 && ok; u += 0.5)
            for (let v = -1; v <= 1 && ok; v += 0.25) {
              const [px, pz] = at(u * hw, v * hl);
              if (!inRing(px, pz, lot.ring) || env.building(px, pz) || wall(px, pz, 0.25)) ok = false;
              else { if (car(px, pz)) cars++; if (env.road?.(px, pz)) aisle++; }
            }
          if (!ok) continue;
          // the ground behind its back door: open, dry land to step down onto — no car there
          for (let v = 0.5; v <= 3 && ok; v += 0.5)
            for (const u of [-0.6, 0, 0.6]) {
              const [px, pz] = at(u, L.frame.zr + v);
              if (env.building(px, pz) || env.blocked(px, pz, 0.2) || car(px, pz) || env.height(px, pz) < 0.1) { ok = false; break; }
            }
          if (!ok) continue;
          // where the room stands: no building, and best no wall either (it reaches past the van)
          let walls = 0;
          for (let u = R.x0; u <= R.x1 && ok; u += 0.8)
            for (let v = R.z0; v <= L.door.z; v += 0.8) {
              const [px, pz] = at(u, v);
              if (env.building(px, pz)) { ok = false; break; }
              if (wall(px, pz, 0.1)) walls++;
            }
          if (!ok) continue;
          const [bx, bz] = at(0, L.frame.zr + 6), [fx, fz] = at(0, L.frame.zf - 6);
          // back toward the water (the open sea's distance falls behind it) and close to it, near
          // where you start
          const behind = env.oceanDist(bx, bz), toSea = Math.max(-60, Math.min(60, behind - env.oceanDist(fx, fz)));
          const score = toSea * 2 + Math.min(behind, 500) * 0.25 + Math.hypot(x - from.x, z - from.z) * 0.2 + walls * 12 + cars * 1.5 + aisle * 4 + lot.d * 0.05;
          if (!best || score < best.score - 1e-6) best = { pose: { ...pose, y: env.height(x, z) }, score };
        }
      }
  }
  return best?.pose ?? null;
}
