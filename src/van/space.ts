// Walking inside the van (pure — no three.js). Once you're in, the walker moves through this
// instead of the world's WalkWorld: the room's walls and furniture in the van's own frame, its
// floor at the van's floor. The van can move under you (it drives itself), so positions are kept
// van-local and turned into the world through the van's pose.
import { toLocal, toWorld, type Seg, type VanPose } from './layout';

/** What the walker needs of the ground it walks on (WalkWorld has the same two). */
export interface WalkSpace {
  move(x: number, z: number, dx: number, dz: number, r?: number, feetY?: number): [number, number];
  surfaceAt(x: number, z: number, feetY?: number): number;
}

/** Push a circle (x, z, r) out of a wall segment; null when it's clear. */
function pushOut(nx: number, nz: number, r: number, s: Seg): [number, number] | null {
  const [ax, az, bx, bz] = s;
  const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((nx - ax) * sx + (nz - az) * sz) / l2)) : 0;
  const px = ax + sx * t, pz = az + sz * t, ex = nx - px, ez = nz - pz, d2 = ex * ex + ez * ez;
  if (d2 >= r * r || d2 < 1e-12) return null;
  const d = Math.sqrt(d2);
  return [px + (ex / d) * r, pz + (ez / d) * r];
}

/** Move a circle by (dx, dz) among walls, sliding along them; a long step goes in pieces of half
 *  its radius (no slipping through a wall on a slow frame), and no step goes further than 4 m (no
 *  frame walks that far). Van-local. */
export function moveAmong(segs: readonly Seg[], x: number, z: number, dx: number, dz: number, r: number): [number, number] {
  let L = Math.hypot(dx, dz);
  if (L > 4) { dx *= 4 / L; dz *= 4 / L; L = 4; }
  const n = Math.max(1, Math.ceil(L / (r * 0.5)));
  let px = x, pz = z;
  for (let k = 0; k < n; k++) {
    px += dx / n;
    pz += dz / n;
    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
      for (const s of segs) {
        const q = pushOut(px, pz, r, s);
        if (q) { px = q[0]; pz = q[1]; pushed = true; }
      }
      if (!pushed) break;
    }
  }
  return [px, pz];
}

/** The room as a place to walk: its walls (van-local) and floor, seen through the van's pose. */
export class VanSpace implements WalkSpace {
  /** The back doors' line, a wall while they're shut (the van on the move). */
  shut: Seg | null = null;
  closed = false;
  constructor(private segs: readonly Seg[], private floor: number, public pose: VanPose) {}
  move(x: number, z: number, dx: number, dz: number, r = 0.32): [number, number] {
    const [lx, lz] = toLocal(this.pose, x, z);
    const c = Math.cos(this.pose.yaw), s = Math.sin(this.pose.yaw);
    // the step turned into the van's frame (the inverse of toWorld's turn)
    const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
    const [mx, mz] = moveAmong(this.closed && this.shut ? [...this.segs, this.shut] : this.segs, lx, lz, ldx, ldz, r);
    return toWorld(this.pose, mx, mz);
  }
  /** The floor (world height): the same everywhere in the room. */
  surfaceAt(): number { return this.pose.y + this.floor; }
}
