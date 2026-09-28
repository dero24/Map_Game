// Playground equipment: what a park's playground is made of, placed where the map puts each piece
// (`playground=swing/slide/structure/…`, props.ts) or, in a mapped playground the map left empty,
// a structure and a row of swings fitted into it. Steel in the park's colours (TINT: the instance
// colour paints the frames and the roofs), timber, rubber seats. Origin on the ground at the
// piece's middle; +z its front: where the slide lands, the way the swings swing.
import * as THREE from 'three';
import { TINT, part, merge, box, cached } from './core';

export type PlayKind = 'swing' | 'slide' | 'structure' | 'seesaw' | 'springy' | 'roundabout' | 'sandpit' | 'climbingframe';
export const PLAY_KINDS: PlayKind[] = ['swing', 'slide', 'structure', 'seesaw', 'springy', 'roundabout', 'sandpit', 'climbingframe'];
/** Park paint: the frames, roofs and chutes. */
export const PLAY_PAINT = [0x2f6f8f, 0xd9a82a, 0xb8392e, 0x3d7a4a, 0x6b3a7a, 0xe07a2a];
const STEEL = 0x8e9497, TIMBER = 0x8a6a4a, RUBBER = 0x2a2b2e, SAND = 0xd8c49a;

const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, hex: number) => {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 6, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return part(g, hex);
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function playGeometry(k: PlayKind): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  if (k === 'swing') {
    // an A-frame at each end, the beam over them, two seats on chains
    const W = 3.4, H = 2.35;
    for (const x of [-W / 2, W / 2]) for (const z of [-0.9, 0.9]) p.push(tube(V(x, 0, z), V(x, H, 0), 0.05, TINT));
    p.push(tube(V(-W / 2 - 0.1, H, 0), V(W / 2 + 0.1, H, 0), 0.06, TINT));
    for (const x of [-0.8, 0.8]) {
      for (const dx of [-0.2, 0.2]) p.push(tube(V(x + dx, H, 0), V(x + dx, 0.48, 0), 0.008, STEEL));
      p.push(part(box(0.48, 0.04, 0.2, x, 0.46, 0), RUBBER));
    }
  } else if (k === 'slide') {
    // the ladder up to a platform, the chute down to the front
    const top = 1.5;
    for (const x of [-0.28, 0.28]) p.push(tube(V(x, 0, -1.6), V(x, top + 0.9, -1.0), 0.03, STEEL));
    for (let r = 1; r <= 5; r++) { const t = r / 6; p.push(tube(V(-0.28, t * (top + 0.4), -1.6 + t * 0.6), V(0.28, t * (top + 0.4), -1.6 + t * 0.6), 0.02, STEEL)); }
    p.push(part(box(0.7, 0.08, 0.6, 0, top, -0.75), TIMBER));
    for (const x of [-0.33, 0.33]) p.push(tube(V(x, top, -0.45), V(x, top + 0.75, -0.45), 0.025, STEEL));
    // the chute: a bed and two sides from the platform to the ground, lipped at the foot
    const L = Math.hypot(2.6, top - 0.35), ang = Math.atan2(top - 0.35, 2.6);
    const chute = [box(0.5, 0.05, L, 0, 0, 0), box(0.04, 0.22, L, -0.25, 0.11, 0), box(0.04, 0.22, L, 0.25, 0.11, 0)];
    for (const c of chute) { c.rotateX(ang).translate(0, (top + 0.35) / 2 + 0.03, -0.45 + 1.3); p.push(part(c, TINT)); }
    p.push(part(box(0.5, 0.05, 0.45, 0, 0.33, 1.95), TINT));
  } else if (k === 'structure') {
    // a play tower: four posts, a deck at 1.2 m with rails, a pyramid roof, a slide off the front,
    // a climbing wall at the back
    const S = 1.8, D = 1.2;
    for (const x of [-S / 2, S / 2]) for (const z of [-S / 2, S / 2]) p.push(part(box(0.12, 3.1, 0.12, x, 1.55, z), TIMBER));
    p.push(part(box(S, 0.1, S, 0, D, 0), TIMBER));
    for (const x of [-S / 2, S / 2]) p.push(part(box(0.05, 0.05, S, x, D + 0.75, 0), STEEL));
    const roof = new THREE.ConeGeometry(S * 0.82, 0.9, 4, 1, true);
    roof.rotateY(Math.PI / 4).translate(0, 3.55, 0);
    p.push(part(roof, TINT));
    const L = Math.hypot(2.2, D - 0.3), ang = Math.atan2(D - 0.3, 2.2);
    for (const c of [box(0.5, 0.05, L, 0, 0, 0), box(0.04, 0.2, L, -0.25, 0.1, 0), box(0.04, 0.2, L, 0.25, 0.1, 0)]) { c.rotateX(ang).translate(0, (D + 0.3) / 2 + 0.03, S / 2 + 1.1); p.push(part(c, TINT)); }
    p.push(part(box(S * 0.9, D, 0.08, 0, D / 2, -S / 2 - 0.05), TINT)); // the climbing wall
    for (let i = 0; i < 6; i++) p.push(part(box(0.1, 0.08, 0.06, -0.55 + (i % 3) * 0.55, 0.3 + Math.floor(i / 3) * 0.45, -S / 2 - 0.12), [0xd9a82a, 0x3d7a4a, 0xb8392e][i % 3])); // holds
  } else if (k === 'seesaw') {
    p.push(part(box(0.25, 0.45, 0.3, 0, 0.225, 0), TINT));
    const plank = box(0.25, 0.06, 3.2, 0, 0, 0);
    plank.rotateX(0.18).translate(0, 0.5, 0);
    p.push(part(plank, TIMBER));
    for (const z of [-1.3, 1.3]) p.push(part(box(0.35, 0.04, 0.05, 0, 0.5 - Math.sin(0.18) * z + 0.25, z), STEEL)); // handles
  } else if (k === 'springy') {
    // a spring rider: a coil and a bright little beast on it
    p.push(part(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 8).translate(0, 0.02, 0), STEEL)); // the base plate
    for (let i = 0; i < 5; i++) p.push(part(new THREE.TorusGeometry(0.12, 0.02, 3, 8).rotateX(Math.PI / 2).translate(0, 0.1 + i * 0.07, 0), STEEL));
    p.push(part(new THREE.SphereGeometry(0.28, 7, 4).scale(0.8, 0.7, 1.4).translate(0, 0.62, 0), TINT));
    p.push(part(new THREE.SphereGeometry(0.16, 7, 4).translate(0, 0.86, 0.36), TINT));
    p.push(part(box(0.3, 0.03, 0.03, 0, 0.9, 0.22), STEEL));
  } else if (k === 'roundabout') {
    p.push(part(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 16).translate(0, 0.28, 0), TINT));
    p.push(part(new THREE.CylinderGeometry(0.08, 0.1, 0.28, 8).translate(0, 0.14, 0), STEEL));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2, x = Math.cos(a) * 0.75, z = Math.sin(a) * 0.75;
      p.push(tube(V(x, 0.32, z), V(x * 0.3, 0.95, z * 0.3), 0.025, STEEL));
    }
  } else if (k === 'sandpit') {
    const S = 3.0;
    for (const [w, d, x, z] of [[S, 0.15, 0, -S / 2], [S, 0.15, 0, S / 2], [0.15, S, -S / 2, 0], [0.15, S, S / 2, 0]] as const) p.push(part(box(w, 0.3, d, x, 0.15, z), TIMBER));
    p.push(part(box(S - 0.15, 0.05, S - 0.15, 0, 0.2, 0), SAND));
    p.push(part(box(0.25, 0.12, 0.18, 0.6, 0.28, 0.4), 0xd9573f)); // a forgotten bucket
  } else {
    // a climbing frame: a lattice box of bars, monkey bars across the top
    const W = 2.4, D = 1.6, H = 1.9;
    for (const x of [-W / 2, 0, W / 2]) for (const z of [-D / 2, D / 2]) p.push(tube(V(x, 0, z), V(x, H, z), 0.035, TINT));
    for (const y of [0.6, 1.25, H]) {
      for (const z of [-D / 2, D / 2]) p.push(tube(V(-W / 2, y, z), V(W / 2, y, z), 0.025, TINT));
      for (const x of [-W / 2, W / 2]) p.push(tube(V(x, y, -D / 2), V(x, y, D / 2), 0.025, TINT));
    }
    for (let i = 1; i < 6; i++) p.push(tube(V(-W / 2 + (i * W) / 6, H, -D / 2), V(-W / 2 + (i * W) / 6, H, D / 2), 0.02, STEEL));
  }
  // (centred on its footprint: a slide or a tower's chute runs out in front of it)
  const g = merge(p);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return g.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
}

/** How much ground a piece takes (half-extents x, z) — its collider and its fit in a playground. */
export const PLAY_FOOT: Record<PlayKind, [number, number]> = {
  swing: [1.85, 1.0], slide: [0.4, 2.0], structure: [1.1, 2.2], seesaw: [0.25, 1.65], springy: [0.25, 0.45], roundabout: [1.0, 1.0], sandpit: [1.55, 1.55], climbingframe: [1.25, 0.85],
};
export const playLib = (k: PlayKind) => cached(`play:${k}`, () => playGeometry(k));
