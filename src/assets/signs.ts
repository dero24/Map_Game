// Signs of life (docs/regional-life/models.md, the `sign†` genome): what an animal builds and leaves in
// the land — the first, the osprey's nest: a great stick nest on a platform atop a pole where the shore
// meets the water (a marsh's, a river's, a lake's). The beaver's lodge and dam and the crawfish's
// chimneys follow on the same genome.
import * as THREE from 'three';
import { part, merge, blob, hashf } from './core';

/** The osprey's nest on its platform pole (local: the pole's foot at the origin, up +y): a weathered
 *  pole `h` metres tall, a square platform, the nest a broad flattened heap of sticks with sticks poking
 *  out of it every way; under 600 vertices. */
export function ospreyNestGeometry(h = 7.5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(new THREE.CylinderGeometry(0.1, 0.13, h, 6, 1, true).translate(0, h / 2, 0), 0x8a8070)); // (open: its ends under the platform and the water)
  parts.push(part(new THREE.BoxGeometry(1.3, 0.08, 1.3).translate(0, h + 0.04, 0), 0x7a7062));
  // the heap: wider than the platform, a shallow bowl's rim
  parts.push(part(blob(0.8, 51, { detail: 1, lump: 0.35 }).scale(1, 0.42, 1).translate(0, h + 0.3, 0), 0x6e5e48));
  parts.push(part(blob(0.62, 52, { detail: 0, lump: 0.2 }).scale(1, 0.2, 1).translate(0, h + 0.5, 0), 0x4e4234)); // (the cup)
  // the sticks: thin rods leaning out of the heap at every angle
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + hashf(i * 31 + 7) * 0.4, L = 0.7 + hashf(i * 17 + 3) * 0.6, tilt = 0.15 + hashf(i * 13 + 5) * 0.5;
    const rod = new THREE.CylinderGeometry(0.018, 0.022, L, 3, 1, true).rotateZ(Math.PI / 2 - tilt).rotateY(a);
    parts.push(part(rod.translate(Math.cos(a) * 0.62, h + 0.32 + hashf(i * 7 + 1) * 0.2, -Math.sin(a) * 0.62), i % 3 ? 0x7a6a52 : 0x5e5040));
  }
  return merge(parts);
}

/** Where the nests stand, in `zone`: one at most to a `cell` (m) of the survey grid, and in about `odds`
 *  of the cells that have shore — the cell's first spot at the water's edge (1 to 6 m out from the bank)
 *  on its own jittered `step` grid. A cell decides for itself, whichever tile asks (no nest doubled
 *  across a tile's edge where the ground reads the same); deterministic by place. `y`: the pole's foot (the bed under the water). */
export function ospreyNests(zone: { x0: number; z0: number; x1: number; z1: number }, sdfAt: (x: number, z: number) => number, heightAt: (x: number, z: number) => number, cell = 700, odds = 0.5, step = 24): { x: number; y: number; z: number; yaw: number }[] {
  const out: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let ci = Math.floor(zone.x0 / cell); ci * cell < zone.x1; ci++)
    for (let cj = Math.floor(zone.z0 / cell); cj * cell < zone.z1; cj++) {
      if (hashf(ci * 92821 + cj * 68917 + 601) > odds) continue;
      const n = Math.floor(cell / step);
      found: for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const gi = ci * n + i, gj = cj * n + j;
          const x = ci * cell + (i + 0.5 + (hashf(gi * 7919 + gj * 104729 + 607) - 0.5) * 0.8) * step;
          const z = cj * cell + (j + 0.5 + (hashf(gi * 104729 + gj * 7919 + 613) - 0.5) * 0.8) * step;
          const d = sdfAt(x, z);
          if (d > -1 || d < -6) continue;
          if (x >= zone.x0 && x < zone.x1 && z >= zone.z0 && z < zone.z1) out.push({ x, y: heightAt(x, z), z, yaw: hashf(gi * 2971 + gj * 31337 + 617) * Math.PI * 2 });
          break found;
        }
    }
  return out;
}
