// Street furniture the map places one by one (realTile furnitureClass: `amenity=post_box`,
// `amenity=bicycle_parking`, `amenity=drinking_water`, `barrier=bollard`, a parking pay station
// `amenity=vending_machine` + `vending=parking_tickets`) — the small things that make a street
// read as surveyed. Each stands on its own foot at the origin; local +z faces the street (props.ts
// turns it there). TINT parts take the instance colour: a post box's paint, a bollard's band, a
// parked bike's frame.
import * as THREE from 'three';
import { TINT, part, merge, box, cached } from './core';

export type StreetKind = 'postbox' | 'pillarbox' | 'bikerack' | 'drinking' | 'bollard' | 'meter' | 'viewer';
export const STREET_KINDS: StreetKind[] = ['postbox', 'pillarbox', 'bikerack', 'drinking', 'bollard', 'meter', 'viewer'];
const STEEL = 0x8e9497, DARK = 0x2f3336, BLACK = 0x1e2022;
export const STREET_VARIANTS = 3;

/** The street's colours for each piece, by world region: the US Mail's blue box, the Royal Mail's
 *  red pillar, a pay station's grey. */
export function streetPaint(k: StreetKind, region: string, u = 0): number {
  if (k === 'postbox') return region === 'na' ? 0x2b4f8f : 0xc9a227;
  if (k === 'pillarbox') return 0xb3261e;
  if (k === 'bollard') return region === 'na' ? 0xd9a82a : 0x3a3f42;
  if (k === 'bikerack') return BIKES[Math.floor(u * BIKES.length) % BIKES.length]; // (the parked bikes' frames)
  if (k === 'viewer') return [0x2f5a3a, 0x2b4f8f, 0xd9a82a][Math.floor(u * 3) % 3]; // (park green, harbour blue, yellow)
  return 0x5c6468;
}
const BIKES = [0x2f6f8f, 0xb8392e, 0x2e2e30, 0x6b8f3a, 0xd8d4c8, 0xc98a2e, 0x5a3f6e];

function bike(p: THREE.BufferGeometry[], x: number) {
  // a bike parked against the hoop: two wheels, the frame's triangle, bars and saddle (TINT frame)
  for (const z of [-0.52, 0.52]) {
    const w = new THREE.TorusGeometry(0.33, 0.022, 3, 10);
    w.rotateY(Math.PI / 2).translate(x + 0.12, 0.35, z);
    p.push(part(w, BLACK));
  }
  const tube = (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a), L = d.length();
    const g = new THREE.BoxGeometry(0.035, L, 0.035);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    p.push(part(g, TINT));
  };
  const X = x + 0.12, V = (y: number, z: number) => new THREE.Vector3(X, y, z);
  tube(V(0.35, -0.52), V(0.62, -0.12)); // chain stay to the seat
  tube(V(0.35, -0.52), V(0.36, 0.0)); // to the crank
  tube(V(0.36, 0.0), V(0.62, -0.12)); // seat tube
  tube(V(0.36, 0.0), V(0.7, 0.38)); // down tube
  tube(V(0.62, -0.12), V(0.7, 0.38)); // top tube
  tube(V(0.7, 0.38), V(0.35, 0.52)); // the fork
  p.push(part(box(0.44, 0.03, 0.03, X, 0.86, 0.4), DARK)); // bars
  p.push(part(box(0.1, 0.05, 0.22, X, 0.7, -0.16), BLACK)); // saddle
}

export function streetGeometry(k: StreetKind, v = 0): THREE.BufferGeometry {
  v %= STREET_VARIANTS;
  const p: THREE.BufferGeometry[] = [];
  if (k === 'postbox') {
    // the blue collection box: a steel body on four legs, its domed top, the pull-down chute
    p.push(part(box(0.52, 0.86, 0.48, 0, 0.62, 0), TINT));
    const dome = new THREE.CylinderGeometry(0.26, 0.26, 0.52, 10, 1, false, 0, Math.PI);
    dome.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.45, 0.92).translate(0, 1.05, 0);
    p.push(part(dome, TINT));
    for (const x of [-0.22, 0.22]) for (const z of [-0.2, 0.2]) p.push(part(box(0.05, 0.2, 0.05, x, 0.1, z), DARK));
    p.push(part(box(0.34, 0.12, 0.04, 0, 0.9, 0.25), DARK)); // the chute handle
    p.push(part(box(0.3, 0.16, 0.01, 0, 0.62, 0.245), 0xe8e4da)); // the decal
  } else if (k === 'pillarbox') {
    p.push(part(new THREE.CylinderGeometry(0.24, 0.26, 1.25, 12).translate(0, 0.625, 0), TINT));
    p.push(part(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 12).translate(0, 1.29, 0), TINT));
    p.push(part(new THREE.SphereGeometry(0.26, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 1.33, 0), TINT));
    p.push(part(box(0.26, 0.05, 0.05, 0, 1.08, 0.24), BLACK)); // the aperture
    p.push(part(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 12).translate(0, 0.05, 0), BLACK)); // the base
  } else if (k === 'bikerack') {
    // three Sheffield hoops in a row along the kerb, square to it; a bike locked to one or two
    const bikes = [[], [-0.9], [0, 0.9]][v % STREET_VARIANTS];
    for (const x of [-0.9, 0, 0.9]) {
      const hoop = new THREE.TorusGeometry(0.34, 0.03, 3, 8, Math.PI);
      hoop.translate(0, 0.5, 0).rotateY(Math.PI / 2).translate(x, 0, 0);
      p.push(part(hoop, STEEL));
      for (const z of [-0.34, 0.34]) p.push(part(box(0.06, 0.5, 0.06, x, 0.25, z), STEEL));
      if (bikes.includes(x)) bike(p, x);
    }
  } else if (k === 'drinking') {
    // a pedestal fountain: a fluted column, a bowl, the spout
    p.push(part(new THREE.CylinderGeometry(0.13, 0.17, 0.82, 8).translate(0, 0.41, 0), 0x3d5a46));
    p.push(part(new THREE.CylinderGeometry(0.24, 0.16, 0.12, 10).translate(0, 0.88, 0), 0x3d5a46));
    p.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 10).translate(0, 0.935, 0), 0x8fa6b0));
    p.push(part(box(0.04, 0.08, 0.04, 0, 0.97, 0.1), STEEL));
    p.push(part(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 8).translate(0, 0.03, 0), 0x6a6d6c));
  } else if (k === 'bollard') {
    p.push(part(new THREE.CylinderGeometry(0.1, 0.11, 0.95, 8).translate(0, 0.475, 0), DARK));
    p.push(part(new THREE.CylinderGeometry(0.106, 0.106, 0.1, 8).translate(0, 0.78, 0), TINT)); // the reflective band
    p.push(part(new THREE.SphereGeometry(0.1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.95, 0), DARK));
  } else if (k === 'viewer') {
    // a coin-op viewer on its pedestal: the binocular head looking out along +z, its eyepieces
    // and coin box at the back where you stand
    p.push(part(new THREE.CylinderGeometry(0.16, 0.22, 0.12, 10).translate(0, 0.06, 0), DARK)); // the foot
    p.push(part(new THREE.CylinderGeometry(0.07, 0.09, 1.02, 8).translate(0, 0.62, 0), TINT)); // the column
    p.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8).translate(0, 1.16, 0), DARK)); // the swivel
    const head = new THREE.CylinderGeometry(0.17, 0.2, 0.42, 10);
    head.rotateX(Math.PI / 2).rotateX(-0.12).translate(0, 1.36, 0.02); // (tipped a touch toward the horizon)
    p.push(part(head, TINT));
    for (const x of [-0.08, 0.08]) {
      p.push(part(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8).rotateX(Math.PI / 2).translate(x, 1.39, -0.24), BLACK)); // eyepieces
      p.push(part(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 8).rotateX(Math.PI / 2).translate(x, 1.33, 0.235), 0x9fb8c4)); // the lenses
    }
    p.push(part(box(0.2, 0.14, 0.08, 0, 1.2, -0.14), DARK)); // the coin box
    p.push(part(box(0.1, 0.02, 0.2, 0.22, 1.36, 0), STEEL)); // a handle
    p.push(part(box(0.1, 0.02, 0.2, -0.22, 1.36, 0), STEEL));
  } else {
    // a pay station: a post, the cabinet with its screen and keypad facing the sidewalk (−z)
    p.push(part(box(0.1, 0.95, 0.1, 0, 0.475, 0), DARK));
    p.push(part(box(0.36, 0.62, 0.28, 0, 1.25, 0), TINT));
    p.push(part(box(0.24, 0.16, 0.01, 0, 1.4, -0.145), 0x3a6f7a)); // screen
    p.push(part(box(0.16, 0.14, 0.01, 0, 1.18, -0.145), 0x2a2d30)); // keypad
    p.push(part(box(0.38, 0.05, 0.3, 0, 1.585, 0), DARK)); // the hood
    p.push(part(box(0.2, 0.05, 0.2, 0, 0.025, 0), DARK)); // the foot
  }
  return merge(p);
}
export const streetLib = (k: StreetKind, v = 0) => cached(`street:${k}:${v % STREET_VARIANTS}`, () => streetGeometry(k, v));
