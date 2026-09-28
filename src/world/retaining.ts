// Retaining walls (grade.ts): where a street is cut into a hill the hill is held back by a wall at
// the back of the sidewalk — Seattle's cast-concrete walls in panels, stained darker at the foot
// where the rain runs off. The panels come from the grading (x0, z0, x1, z1, foot0, top0, foot1,
// top1, the street toward the direction turned a quarter left); a face toward the street and a
// cap along the top, 35 cm deep. Walkers and cars meet them as walls (tile.walls).
import * as THREE from 'three';
import { propMaterial } from '../render/propMaterial';

const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function retainingWalls(walls: number[]): THREE.Group {
  const g = new THREE.Group();
  if (walls.length < 8) return g;
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const T = 0.35;
  const quad = (p: number[][], n: number[], c: number[][]) => {
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) (pos.push(...p[i]), nrm.push(...n), col.push(...c[i]));
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (let i = 0; i + 7 < walls.length; i += 8) {
    const x0 = walls[i], z0 = walls[i + 1], x1 = walls[i + 2], z1 = walls[i + 3];
    const b0 = walls[i + 4], t0 = walls[i + 5], b1 = walls[i + 6], t1 = walls[i + 7];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L; // toward the street
    // a panel's own tone (poured on different days), the foot darker, the cap lightest
    const u = hash(Math.round(x0 * 3.1) * 7919 + Math.round(z0 * 3.1));
    const v = 0.56 + u * 0.08;
    const face = [v * 0.97, v * 0.95, v * 0.9], foot = [v * 0.78, v * 0.76, v * 0.72], cap = [v * 1.08, v * 1.06, v * 1.02];
    quad([[x0, b0, z0], [x1, b1, z1], [x1, t1, z1], [x0, t0, z0]], [sx, 0, sz], [foot, foot, face, face]);
    quad([[x0, t0, z0], [x1, t1, z1], [x1 - sx * T, t1, z1 - sz * T], [x0 - sx * T, t0, z0 - sz * T]], [0, 1, 0], [cap, cap, cap, cap]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, propMaterial());
  m.name = 'retaining-walls';
  g.add(m);
  return g;
}

/** The collider for each panel: a walker on the sidewalk meets it from the foot to 40 cm under
 *  its top (someone up on the hill steps off the top). */
export function retainingColliders(walls: number[]): [[number, number], [number, number], number, number][] {
  const out: [[number, number], [number, number], number, number][] = [];
  for (let i = 0; i + 7 < walls.length; i += 8)
    out.push([[walls[i], walls[i + 1]], [walls[i + 2], walls[i + 3]], Math.min(walls[i + 4], walls[i + 6]) - 1, Math.min(walls[i + 5], walls[i + 7]) - 0.4]);
  return out;
}
