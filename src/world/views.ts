// Viewpoints (`tourism=viewpoint`): which way the view is, and the cone in front of each kept open.
// A pure function of the map's point and the ground, so the coin-op viewer that stands there and
// the trees cut back in front of it agree, tile by tile.
import type { Point } from './data';

type H = (x: number, z: number) => number;
const DEG = Math.PI / 180;

/** The way a viewpoint looks, as a unit (dx, dz): its mapped `direction` (compass degrees), else
 *  down its slope — the steepest fall of the ground over the next 10–20 m. Null on flat ground
 *  with no direction (a rooftop terrace, a lookout tower: it looks every way). */
export function viewDir(p: Point, heightAt: H): [number, number] | null {
  if (p.d !== undefined && p.d >= 0) return [Math.sin(p.d * DEG), -Math.cos(p.d * DEG)];
  const g0 = heightAt(p.x, p.z);
  let best: [number, number] | null = null, fall = 0.8; // (at least ~a metre's fall to call it a slope)
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, dx = Math.sin(a), dz = -Math.cos(a);
    const f = g0 - (heightAt(p.x + dx * 10, p.z + dz * 10) + heightAt(p.x + dx * 20, p.z + dz * 20)) / 2;
    if (f > fall + 1e-6) (fall = f), (best = [dx, dz]);
  }
  return best;
}

export interface ViewCone {
  x: number; z: number; dir: [number, number];
  /** The tallest a tree standing at (x, z) on ground `gy` may be (Infinity outside the cone). */
  allow: (x: number, z: number, gy: number) => number;
}
/** The view kept open in front of each viewpoint: out to 110 m, 55° either side of the way it
 *  looks, the sightline from an eye 1.6 m over it dipping 3° toward the view; a crown stays 0.6 m
 *  under that line. */
export function viewCones(points: readonly Point[], heightAt: H): ViewCone[] {
  const out: ViewCone[] = [];
  const R = 110, COS = Math.cos(55 * DEG), DIP = Math.tan(3 * DEG);
  for (const p of points) {
    if (p.c !== 'viewpoint') continue;
    const dir = viewDir(p, heightAt);
    if (!dir) continue;
    const eye = heightAt(p.x, p.z) + 1.6, [dx, dz] = dir;
    out.push({
      x: p.x, z: p.z, dir,
      allow: (x, z, gy) => {
        const vx = x - p.x, vz = z - p.z, d = Math.hypot(vx, vz);
        if (d > R || d < 1 || (vx * dx + vz * dz) / d < COS) return Infinity;
        return eye - d * DIP - 0.6 - gy;
      },
    });
  }
  return out;
}
