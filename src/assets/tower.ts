// Towers — the tall made things a town is recognised by from miles off (docs/ASSET_FOUNDRY.md):
// a guyed lattice mast in its red-and-white obstruction bands (Queen Anne's TV masts), a small
// town's water tower on its legs, a brick or concrete chimney, a flagpole with its flag. Placed
// by props.ts at OSM `man_made=mast/tower/communications_tower/water_tower/chimney/flagpole`
// (realTile Point, with the mapped `height`), each built at unit height and scaled to it.
// Frame: origin at the foot, +y up; the geometry is 1 m tall where it scales (y ∈ [0, 1]).
import * as THREE from 'three';
import { TINT, part, merge, box, limb, cached } from './core';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RED = 0xc8472e, WHITE = 0xf1efe8, STEEL = 0x7b8084, BRICK = 0x94503c;

export type TowerKind = 'mast' | 'waterTower' | 'chimney' | 'flagpole';
export const TOWER_KINDS: TowerKind[] = ['mast', 'waterTower', 'chimney', 'flagpole'];
/** Default heights (m) when the map gives none. */
export const TOWER_H: Record<TowerKind, number> = { mast: 90, waterTower: 36, chimney: 45, flagpole: 12 };
/** …and for one mapped on a building, standing on its roof: an antenna mast, a city's rooftop
 *  water tank on its legs, a boiler chimney, a flag. */
export const ROOFTOP_H: Record<TowerKind, number> = { mast: 12, waterTower: 9, chimney: 7, flagpole: 6 };

/** A triangular lattice mast, 1 m tall (scaled to its height): three legs, a triangle of rails
 *  every segment, one diagonal brace a face a segment, segments banded red and white, a beacon. */
function mast(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const SEG = 12, R = 0.012; // the legs' circumradius (1.2 m on a 100 m mast)
  const leg = (a: number): [number, number] => [Math.cos(a) * R, Math.sin(a) * R];
  const L = [leg(0), leg((Math.PI * 2) / 3), leg((Math.PI * 4) / 3)];
  for (const [x, z] of L) p.push(part(box(0.0016, 1, 0.0016, x, 0.5, z), STEEL));
  for (let s = 0; s < SEG; s++) {
    const y0 = s / SEG, y1 = (s + 1) / SEG, c = s % 2 ? WHITE : RED;
    for (let f = 0; f < 3; f++) {
      const [ax, az] = L[f], [bx, bz] = L[(f + 1) % 3];
      p.push(part(limb(V3(ax, y1, az), V3(bx, y1, bz), 0.0006, 0.0006, 3), c)); // the rail
      p.push(part(limb(V3(ax, y0, az), V3(bx, y1, bz), 0.0005, 0.0005, 3), c)); // the brace
    }
  }
  p.push(part(new THREE.SphereGeometry(0.004, 6, 4).translate(0, 1.003, 0), 0xff3a1f, 3)); // beacon
  return merge(p);
}

/** A small town's water tower, 1 m to the top of its finial: legs braced to a riser, a round
 *  tank (TINT — the instance colour paints it) with a catwalk and a cone roof. */
function waterTower(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const legs = 6, rLeg = 0.2, tank0 = 0.62, tank1 = 0.86, rTank = 0.24;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2, b = ((i + 1) / legs) * Math.PI * 2;
    const x = Math.cos(a) * rLeg, z = Math.sin(a) * rLeg;
    p.push(part(limb(V3(x * 1.25, 0, z * 1.25), V3(x * 0.85, tank0, z * 0.85), 0.01, 0.009, 4), STEEL));
    // one ring of struts at mid height between neighbouring legs
    const y = tank0 * 0.45, k = 1.25 - 0.4 * 0.45;
    p.push(part(limb(V3(x * k, y, z * k), V3(Math.cos(b) * rLeg * k, y, Math.sin(b) * rLeg * k), 0.004, 0.004, 3), STEEL));
  }
  p.push(part(new THREE.CylinderGeometry(0.03, 0.03, tank0, 6).translate(0, tank0 / 2, 0), STEEL)); // the riser
  p.push(part(new THREE.CylinderGeometry(rTank, rTank * 0.7, 0.06, 16).translate(0, tank0 + 0.03, 0), TINT)); // bowl
  p.push(part(new THREE.CylinderGeometry(rTank, rTank, tank1 - tank0 - 0.06, 16).translate(0, (tank0 + 0.06 + tank1) / 2, 0), TINT));
  p.push(part(new THREE.CylinderGeometry(rTank + 0.02, rTank + 0.02, 0.008, 16).translate(0, tank0 + 0.08, 0), STEEL)); // catwalk
  p.push(part(new THREE.ConeGeometry(rTank * 1.02, 0.1, 16).translate(0, tank1 + 0.05, 0), TINT));
  p.push(part(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 5).translate(0, tank1 + 0.12, 0), STEEL)); // finial
  return merge(p);
}

/** An industrial chimney, 1 m tall: a tapering stack with a dark band at the lip. */
function chimney(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.026, 0.045, 0.96, 12, 1, true).translate(0, 0.48, 0), TINT),
    part(new THREE.CylinderGeometry(0.029, 0.027, 0.04, 12).translate(0, 0.98, 0), 0x3a3634),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12).translate(0, 0.005, 0), 0x8d8983),
  ]);
}

/** A flagpole, 1 m tall, its flag near the top: red and white stripes and a blue canton (the
 *  national flag, the commonest flag on an American pole). */
function flagpole(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(new THREE.CylinderGeometry(0.004, 0.007, 1, 6).translate(0, 0.5, 0), 0xd8d6cf));
  p.push(part(new THREE.SphereGeometry(0.009, 6, 4).translate(0, 1.006, 0), 0xd4b04a));
  const fw = 0.3, fh = 0.16, y0 = 0.96 - fh;
  for (let i = 0; i < 7; i++) p.push(part(box(fw, fh / 7, 0.003, fw / 2 + 0.007, y0 + (i + 0.5) * (fh / 7), 0), i % 2 ? WHITE : RED));
  p.push(part(box(fw * 0.4, fh * 0.54, 0.004, fw * 0.2 + 0.007, y0 + fh * 0.73, 0), 0x2b3a67));
  return merge(p);
}

export function towerGeometry(k: TowerKind): THREE.BufferGeometry {
  return k === 'mast' ? mast() : k === 'waterTower' ? waterTower() : k === 'chimney' ? chimney() : flagpole();
}
export const towerLib = (k: TowerKind) => cached(`tower:${k}`, () => towerGeometry(k));
/** The chimney's brick when the map gives no colour. */
export const CHIMNEY_BRICK = BRICK;
