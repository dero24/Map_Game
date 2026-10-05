// Where a teleport puts the walker (the atlas's "walk here", G search, an ?at= link): main.ts
// teleportLocal. Pure over the walk world, so tests can check it.
import type { WalkWorld } from './collision';
import type { Door } from '../world/buildings';

export interface Landing { x: number; z: number; y?: number; yaw?: number; door?: Door }

/** The nearest spot to (x, z) a walker can stand on and walk away from: walkable (not the water),
 *  outside every building, no wall within `clear` — rings out to 3 km, else (x, z) as given. */
export function openGround(walk: WalkWorld, x: number, z: number, clear = 0.45): [number, number] {
  const ok = (px: number, pz: number) => walk.walkable(px, pz) && !walk.blocked(px, pz, clear);
  if (ok(x, z)) return [x, z];
  for (let r = 2; r < 3000; r *= 1.15)
    for (let k = 0, n = Math.max(12, Math.ceil(r)); k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return [px, pz];
    }
  return [x, z];
}

/** Doorstep first: within 40 m of a front door whose outside is open (no building, no wall across
 *  it), just outside it — 1.2 m past the foot of its steps, on the ground, facing the door (2.2 m out
 *  from the door itself where that spot isn't open). Outside, never in: a link or a search lands you
 *  in front of a place, not in a stranger's living room or a restaurant's dining room (the audit,
 *  2026-10-03: Bar Harbor, Shrewsbury; docs/GAMEPLAY_VISION.md §8 "a public spot"). Otherwise the
 *  nearest open ground: the map can land you on the water, a roof or a hedge, where the walker
 *  couldn't take a step. (`yaw` is left to the caller there: it faces down the nearest street.) */
export function landingAt(walk: WalkWorld, doors: Iterable<Door>, x: number, z: number): Landing {
  let best: Door | null = null, bd = 40 * 40;
  for (const d of doors) {
    const dd = (d.wx - x) ** 2 + (d.wz - z) ** 2;
    // (never a door you couldn't step out of: its outside another building or a wall)
    if (dd < bd && walk.buildingAt(d.wx + d.nx * 0.8, d.wz + d.nz * 0.8) < 0 && !walk.touching(d.wx + d.nx * 0.8, d.wz + d.nz * 0.8, 0.32)) {
      bd = dd;
      best = d;
    }
  }
  if (best) {
    const ok = (px: number, pz: number) => walk.walkable(px, pz) && walk.buildingAt(px, pz) < 0 && !walk.blocked(px, pz, 0.45);
    const foot = [best.fx + best.nx * 1.2, best.fz + best.nz * 1.2], out = [best.wx + best.nx * 2.2, best.wz + best.nz * 2.2];
    const [px, pz] = ok(foot[0], foot[1]) ? foot : out;
    return { x: px, z: pz, yaw: Math.atan2(best.nx, best.nz), y: best.fy, door: best };
  }
  const [px, pz] = openGround(walk, x, z);
  return { x: px, z: pz };
}
