// Market stalls — what makes a market hall or a covered arcade read as a market from the street:
// a trestle of goods under an awning, the vendor behind it (props.ts stands people there).
// Placed by props.ts along the street faces of a building the map says is a market
// (`amenity=marketplace` on the building, or a canopy against one), and round an open-air
// `amenity=marketplace` square. One family, five trades, each read from what's on the table:
//   produce — crates of apples, oranges, lemons, greens and aubergines on a tilted rack
//   flowers — buckets of bunches in every colour, taller at the back
//   fish    — a bed of crushed ice with whole fish laid across it, a bin at the front
//   bakery  — baskets of loaves and a tray of pastries
//   crafts  — a cloth-covered table of small bright things, a rack of hanging pieces
// Frame: origin on the ground at the table's front centre; the table runs along x (2.4 m); its
// back (the vendor's side) toward +z, the street toward −z; the awning (TINT: the instance colour
// paints it) slopes from 2.6 m at the back to 2.25 m over the front edge.
import * as THREE from 'three';
import { TINT, part, merge, box, hashf, cached } from './core';

export type StallKind = 'produce' | 'flowers' | 'fish' | 'bakery' | 'crafts';
export const STALL_KINDS: StallKind[] = ['produce', 'flowers', 'fish', 'bakery', 'crafts'];

const WOOD = 0x8a6a4a, DARK_WOOD = 0x5e4632, STEEL = 0x7b8084, CLOTH = 0xe8e2d4;
const FRUIT = [0xc0392b, 0xe67e22, 0xf1c40f, 0x6aa84f, 0x6c3a6e, 0xd35400, 0x9bbb59];
const BLOOM = [0xe74c3c, 0xf5b7b1, 0xf1c40f, 0xffffff, 0x8e44ad, 0xe67e22, 0xd98cb3];
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The trestle, posts and awning every stall shares. */
function frame(p: THREE.BufferGeometry[], u: number) {
  const W = 2.4, D = 0.9, H = 0.82;
  p.push(part(box(W, 0.05, D, 0, H, D / 2), WOOD)); // the top
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) for (const z of [0.06, D - 0.06]) p.push(part(box(0.05, H, 0.05, x, H / 2, z), DARK_WOOD));
  p.push(part(box(W - 0.1, 0.5, 0.02, 0, 0.45, 0.02), u < 0.5 ? CLOTH : WOOD)); // the skirt to the street
  // awning posts at the back, the canvas sloping out over the table
  const back = D + 0.55, top0 = 2.6, top1 = 2.25, out = -0.25;
  for (const x of [-W / 2 - 0.1, W / 2 + 0.1]) p.push(part(box(0.05, top0, 0.05, x, top0 / 2, back), STEEL));
  const canvas = new THREE.PlaneGeometry(W + 0.4, Math.hypot(back - out, top0 - top1), 1, 1);
  canvas.rotateX(-Math.PI / 2 - Math.atan2(top0 - top1, back - out)); // (its front edge the lower)
  canvas.translate(0, (top0 + top1) / 2, (back + out) / 2);
  p.push(part(canvas, TINT));
  // (the underside too — seen from the street the awning is its underside)
  const under = canvas.clone();
  under.scale(1, 1, 1);
  const idx = under.index!;
  const a = idx.array as Uint16Array;
  for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
  under.computeVertexNormals();
  p.push(part(under.translate(0, -0.01, 0), TINT));
  p.push(part(box(W + 0.4, 0.22, 0.02, 0, top1 - 0.11, out), TINT)); // the valance
}

function produce(p: THREE.BufferGeometry[], u: number) {
  // a tilted rack of crates, two rows, each a colour
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      const x = -0.87 + c * 0.58, z = 0.25 + r * 0.42, y = 0.87 + r * 0.14;
      p.push(part(box(0.52, 0.12, 0.38, x, y + 0.06, z), WOOD));
      const col = FRUIT[Math.floor(hashf(Math.floor(u * 1e4) + r * 7 + c * 13) * FRUIT.length)];
      // the fruit: a lumpy low heap proud of the crate
      const heap = new THREE.SphereGeometry(0.22, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      heap.scale(1.1, 0.35, 0.8).translate(x, y + 0.12, z);
      p.push(part(heap, col));
    }
}

function flowers(p: THREE.BufferGeometry[], u: number) {
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 5; c++) {
      const x = -0.96 + c * 0.48, z = 0.22 + r * 0.45, h = 0.28 + r * 0.14;
      p.push(part(new THREE.CylinderGeometry(0.13, 0.11, 0.26, 6, 1, true).translate(x, 0.87 + 0.13, z), STEEL));
      const col = BLOOM[Math.floor(hashf(Math.floor(u * 1e4) + r * 5 + c * 11) * BLOOM.length)];
      const bunch = new THREE.IcosahedronGeometry(0.16, 0);
      bunch.scale(1, 0.8, 1).translate(x, 0.87 + 0.26 + h, z);
      p.push(part(bunch, col));
      p.push(part(box(0.03, h, 0.03, x, 0.87 + 0.26 + h / 2, z), 0x4a7a3a)); // the stems
    }
}

function fish(p: THREE.BufferGeometry[], u: number) {
  // a bed of crushed ice, whole fish laid across it, a lip of wood round it
  p.push(part(box(2.3, 0.1, 0.84, 0, 0.92, 0.45), 0xdfeaf0));
  p.push(part(box(2.34, 0.14, 0.04, 0, 0.93, 0.03), WOOD));
  for (let i = 0; i < 7; i++) {
    const x = -0.95 + i * 0.32 + (hashf(Math.floor(u * 1e4) + i) - 0.5) * 0.06, z = 0.45;
    const body = new THREE.SphereGeometry(0.075, 7, 4);
    body.scale(1, 0.55, 3.6).rotateY((hashf(Math.floor(u * 1e4) + i * 3) - 0.5) * 0.5).translate(x, 1.0, z);
    p.push(part(body, i % 3 === 0 ? 0xc96f59 : 0x9aa3a8));
  }
}

function bakery(p: THREE.BufferGeometry[], u: number) {
  for (let c = 0; c < 3; c++) {
    const x = -0.8 + c * 0.8;
    p.push(part(new THREE.CylinderGeometry(0.34, 0.28, 0.14, 10, 1, true).translate(x, 0.94, 0.45), 0xb08850)); // the basket
    for (let k = 0; k < 3; k++) {
      const loaf = new THREE.SphereGeometry(0.1, 5, 3);
      loaf.scale(1.8, 0.75, 1).rotateY(k * 1.1 + u * 3).translate(x + (k - 1) * 0.12, 1.02, 0.45 + (k % 2 ? 0.1 : -0.1));
      p.push(part(loaf, k % 2 ? 0xc68a45 : 0xa86a30));
    }
  }
  p.push(part(box(0.7, 0.03, 0.35, 0, 0.9, 0.12), 0xd8d2c4)); // a tray of pastries at the front
}

function crafts(p: THREE.BufferGeometry[], u: number) {
  p.push(part(box(2.42, 0.02, 0.94, 0, 0.88, 0.45), [0x6b2d2d, 0x2d4a6b, 0x3d5a46][Math.floor(u * 3)])); // the cloth
  for (let i = 0; i < 10; i++) {
    const x = -1.0 + (i % 5) * 0.5, z = 0.25 + Math.floor(i / 5) * 0.4, col = FRUIT[i % FRUIT.length];
    p.push(part(box(0.18, 0.08 + hashf(i + Math.floor(u * 97)) * 0.12, 0.14, x, 0.95, z), col));
  }
  // a rail at the back hung with scarves and prints
  p.push(part(box(2.2, 0.03, 0.03, 0, 1.9, 1.05), STEEL));
  for (let i = 0; i < 6; i++) p.push(part(box(0.26, 0.55, 0.01, -0.9 + i * 0.36, 1.6, 1.05), BLOOM[(i + 2) % BLOOM.length]));
}

export function stallGeometry(k: StallKind, v = 0): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [], u = hashf(v * 7919 + STALL_KINDS.indexOf(k) * 104729);
  frame(p, u);
  if (k === 'produce') produce(p, u);
  else if (k === 'flowers') flowers(p, u);
  else if (k === 'fish') fish(p, u);
  else if (k === 'bakery') bakery(p, u);
  else crafts(p, u);
  return merge(p);
}
export const STALL_VARIANTS = 3;
export const stallLib = (k: StallKind, v = 0) => cached(`stall:${k}:${v % STALL_VARIANTS}`, () => stallGeometry(k, v % STALL_VARIANTS));
/** Awning colours: market canvas — green, red and white, navy, ochre, striped by the instance. */
export const AWNING = [0x3d6b4a, 0xa33a2f, 0xf0ece2, 0x2f4a6a, 0xc9a04a, 0x6b3a5a];
/** Where a stall's vendor stands (behind the table, facing the street) and its table's footprint
 *  (for collision), in the stall's frame. */
export const STALL_VENDOR = V3(0, 0, 1.2);
export const STALL_FOOT: [number, number][] = [[-1.25, -0.05], [1.25, -0.05], [1.25, 0.95], [-1.25, 0.95]];
