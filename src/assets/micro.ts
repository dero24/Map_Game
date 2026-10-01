// Micro things — the small made objects a lived-in place is full of: a household's trash and
// recycling carts at the kerb on collection day, a café's A-frame and planters, porch chairs and a
// flag by the door, a hoop at the end of the drive, a utility pedestal at the kerb, a cooler and
// towels on the beach, cleats and dock boxes along a pier, mooring balls and crab-pot floats on
// the water, channel markers — and the street furniture the map tags one by one (a picnic table,
// an information board, a street cabinet, a clock on its post).
//
// They're drawn by the micro layer (world/microLayer.ts): real 3D close up, an impostor card past
// a few dozen metres (render/impostor.ts), all of them in two draws. So a recipe here only has to
// read at a few metres; its silhouette and colour carry it further. Each stands on its own foot at
// the origin, front toward −z (the street, the sea, the path), TINT (white) wherever the instance
// colour paints it. A wall mount's origin is its bracket; a float's is the waterline.
import * as THREE from 'three';
import { TINT, part, merge, box, limb, lathe, cached } from './core';
import { umbrellaGeometry, beachChairGeometry, towelGeometry, picnicTableGeometry } from './furniture';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DARK = 0x2a2c2e, BLACK = 0x1d1e20, STEEL = 0x9aa0a3, WOOD = 0x7a5b46, WHITE = 0xf1eee6, CREAM = 0xe8e2d0;
const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y, z);
/** A disc facing −z (a clock face, a sign's roundel, a container's mouth). */
const disc = (r: number, t: number, seg: number, x: number, y: number, z: number) => new THREE.CylinderGeometry(r, r, t, seg).rotateX(Math.PI / 2).translate(x, y, z);
/** A double-sided flat quad from four corners (a flag's stripe). */
function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const g = new THREE.BufferGeometry();
  const f = [a, b, c, a, c, d, a, c, b, a, d, c].flatMap((v) => [v.x, v.y, v.z]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(f, 3));
  g.computeVertexNormals();
  return g;
}
/** Turn a part about the x axis round a pivot height (a leaning board, a tilted back). */
const tiltX = (g: THREE.BufferGeometry, a: number, py: number, pz = 0) => g.translate(0, -py, -pz).rotateX(a).translate(0, py, pz);

export type MicroId =
  | 'cart' | 'aframe' | 'planter' | 'newsbox' | 'pedestal' | 'adirondack' | 'grill' | 'cooler' | 'buoy' | 'potfloat'
  | 'cleat' | 'lifering' | 'hoop' | 'bike' | 'kayak' | 'flag' | 'yardsign' | 'salesign' | 'sign' | 'towel'
  | 'umbrella' | 'beachchair' | 'picnic' | 'info' | 'cabinet' | 'vending' | 'recycling' | 'clock' | 'firepit' | 'beacon'
  | 'nun' | 'can' | 'acunit' | 'birdbath' | 'dockbox' | 'trap' | 'surfboard';

export interface MicroKind {
  id: MicroId;
  geo: () => THREE.BufferGeometry;
  /** the box it must fit (w, h, d m) and its vertex budget (tests/foundry.test.ts) */
  box: [number, number, number];
  budget: number;
  /** a collider: half width, half depth (m) and height above its foot — the ones you walk round */
  solid?: [number, number, number];
  /** 'wall': hung on a wall, origin at its bracket; 'float': on the water, origin at the waterline */
  mount?: 'wall' | 'float';
}

// ---------------------------------------------------------------- the recipes

/** A wheeled trash (or recycling) cart: the body and lid take the paint, wheels and handle at the
 *  back (+z, toward the house), the lid's front to the street. */
function cart() {
  const p = [
    part(box(0.56, 0.86, 0.62, 0, 0.5, 0), TINT),
    part(box(0.6, 0.05, 0.69, 0, 0.955, 0.01), TINT),
    part(box(0.5, 0.04, 0.05, 0, 0.93, 0.37), DARK), // the handle
    part(box(0.5, 0.05, 0.05, 0, 0.1, 0.3), DARK), // the axle
  ];
  for (const x of [-0.25, 0.25]) p.push(part(cyl(0.1, 0.1, 0.06, 8, 0, 0, 0).rotateZ(Math.PI / 2).translate(x, 0.1, 0.3), BLACK));
  return merge(p);
}
/** A sidewalk A-frame: two chalkboards leaning together, the paint on their frames, a few lines of
 *  chalk on the face to the street. */
function aframe() {
  const p: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const lean = 0.2 * s;
    p.push(part(tiltX(box(0.6, 0.95, 0.03, 0, 0.475, 0), lean, 0.95), TINT));
    p.push(part(tiltX(box(0.48, 0.66, 0.012, 0, 0.5, -0.02 * s), lean, 0.95), 0x2b2f2c));
    if (s > 0) for (let k = 0; k < 3; k++) p.push(part(tiltX(box(0.34 - k * 0.06, 0.035, 0.008, 0, 0.7 - k * 0.14, -0.03), lean, 0.95), CREAM));
  }
  return merge(p);
}
/** A planter box at a shop's door: the painted box, its soil, a clipped green and a few flowers. */
function planter() {
  const p = [part(box(1.0, 0.42, 0.42, 0, 0.21, 0), TINT), part(box(1.06, 0.04, 0.48, 0, 0.43, 0), TINT), part(box(0.92, 0.02, 0.34, 0, 0.44, 0), 0x3b2f24)];
  for (const [x, r] of [[-0.3, 0.2], [0.02, 0.24], [0.32, 0.19]] as const) {
    const g = new THREE.IcosahedronGeometry(r, 0).scale(1, 0.85, 0.9).translate(x, 0.47 + r * 0.6, 0);
    p.push(part(g, 0x46703a));
  }
  for (const [x, y, z, c] of [[-0.38, 0.72, -0.1, 0xd8476a], [-0.12, 0.8, 0.06, 0xf2c23a], [0.14, 0.78, -0.12, 0xd8476a], [0.4, 0.7, 0.05, 0xf4f1ea], [0.0, 0.66, -0.17, 0xe06a3a]] as const)
    p.push(part(box(0.09, 0.07, 0.09, x, y, z), c));
  return merge(p);
}
/** A newspaper box: the painted body on its pedestal, the window on the paper. */
function newsbox() {
  return merge([
    part(box(0.46, 0.56, 0.4, 0, 0.62, 0), TINT),
    part(box(0.34, 0.2, 0.01, 0, 0.7, -0.205), 0x39464d),
    part(box(0.3, 0.05, 0.01, 0, 0.5, -0.205), DARK), // the door's lip
    part(box(0.3, 0.34, 0.26, 0, 0.17, 0), DARK),
    part(box(0.48, 0.03, 0.42, 0, 0.915, 0), TINT),
  ]);
}
/** A telephone / cable pedestal at a residential kerb: a box with a hipped cap. */
function pedestal() {
  return merge([part(box(0.28, 0.8, 0.28, 0, 0.4, 0), TINT), part(new THREE.ConeGeometry(0.21, 0.13, 4).rotateY(Math.PI / 4).translate(0, 0.865, 0), TINT)]);
}
/** An Adirondack chair: slatted seat sloping back, a fanned back, the wide flat arms. */
function adirondack() {
  const p: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) p.push(part(tiltX(box(0.1, 0.03, 0.52, -0.24 + k * 0.12, 0.36, 0), 0.14, 0.36), TINT));
  for (let k = 0; k < 5; k++) {
    const x = -0.22 + k * 0.11, b = box(0.09, 0.82, 0.025, x, 0.41, 0);
    b.rotateZ(-x * 0.35);
    p.push(part(tiltX(b, 0.42, 0).translate(0, 0.34, 0.26), TINT));
  }
  for (const s of [-1, 1]) {
    p.push(part(box(0.14, 0.025, 0.74, s * 0.34, 0.6, -0.04), TINT)); // the arm
    p.push(part(box(0.06, 0.6, 0.06, s * 0.34, 0.3, -0.33), TINT)); // a front leg
    p.push(part(box(0.05, 0.05, 0.84, s * 0.3, 0.32, 0.04), TINT)); // the side stringer
    p.push(part(box(0.05, 0.34, 0.05, s * 0.3, 0.17, 0.42), TINT)); // a back leg
  }
  return merge(p);
}
/** A kettle grill: the black bowl and lid on three legs. */
function grill() {
  const p = [
    part(new THREE.SphereGeometry(0.28, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.74, 0), BLACK),
    part(new THREE.SphereGeometry(0.285, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.74, 0), BLACK),
    part(box(0.14, 0.03, 0.04, 0, 0.99, 0), 0x6b5a48), // the lid's handle
  ];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    p.push(part(limb(V3(Math.cos(a) * 0.17, 0.62, Math.sin(a) * 0.17), V3(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), 0.012, 0.012, 4), STEEL));
  }
  return merge(p);
}
/** A beach cooler: the painted chest under a white lid. */
function cooler() {
  return merge([
    part(box(0.62, 0.32, 0.36, 0, 0.17, 0), TINT),
    part(box(0.64, 0.06, 0.38, 0, 0.36, 0), WHITE),
    part(box(0.05, 0.04, 0.14, -0.33, 0.27, 0), WHITE),
    part(box(0.05, 0.04, 0.14, 0.33, 0.27, 0), WHITE),
  ]);
}
/** A mooring ball: a white float with a painted band and its pickup stick. */
function buoy() {
  return merge([
    part(new THREE.SphereGeometry(0.32, 8, 5).translate(0, 0.1, 0), WHITE),
    part(cyl(0.326, 0.326, 0.1, 8, 0, 0.1, 0, true), TINT),
    part(limb(V3(0, 0.38, 0), V3(0.04, 0.85, 0), 0.015, 0.015, 4), 0xd8d4c8),
    part(cyl(0.05, 0.05, 0.1, 6, 0.04, 0.8, 0), TINT),
  ]);
}
/** A crab-pot float: a small painted foam float riding the water, a stick up through it. */
function potfloat() {
  return merge([part(cyl(0.075, 0.075, 0.22, 6, 0, 0.04, 0), TINT), part(limb(V3(0, 0.1, 0), V3(0.02, 0.55, 0), 0.01, 0.01, 4), 0xd8d4c8), part(box(0.1, 0.06, 0.006, 0.07, 0.5, 0), TINT)]);
}
/** A dock cleat: a plate, two posts and the horn the lines turn round. */
function cleat() {
  return merge([part(box(0.32, 0.025, 0.09, 0, 0.0125, 0), STEEL), part(box(0.05, 0.06, 0.05, -0.08, 0.05, 0), STEEL), part(box(0.05, 0.06, 0.05, 0.08, 0.05, 0), STEEL), part(box(0.36, 0.035, 0.06, 0, 0.095, 0), STEEL)]);
}
/** A life ring on its post at the head of a dock. */
function lifering() {
  const p = [part(box(0.1, 1.5, 0.1, 0, 0.75, 0), WOOD), part(box(0.14, 0.05, 0.14, 0, 1.52, 0), WOOD)];
  p.push(part(new THREE.TorusGeometry(0.3, 0.06, 4, 12).translate(0, 1.0, -0.11), TINT));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    p.push(part(box(0.07, 0.14, 0.14, Math.cos(a) * 0.3, 1.0 + Math.sin(a) * 0.3, -0.11), WHITE));
  }
  return merge(p);
}
/** A portable basketball hoop at the end of a drive: the weighted base behind, the pole, the
 *  backboard and orange rim over the drive (−z). */
function hoop() {
  return merge([
    part(box(0.62, 0.28, 1.0, 0, 0.14, 0.32), DARK),
    part(limb(V3(0, 0.25, 0), V3(0, 3.0, -0.08), 0.05, 0.045, 6), STEEL),
    part(box(0.08, 0.08, 0.32, 0, 2.95, -0.22), STEEL),
    part(box(1.1, 0.72, 0.04, 0, 3.12, -0.4), WHITE),
    part(box(0.46, 0.36, 0.01, 0, 3.08, -0.425), 0xc2412f),
    part(box(0.4, 0.3, 0.012, 0, 3.08, -0.428), WHITE),
    part(new THREE.TorusGeometry(0.23, 0.018, 3, 12).rotateX(Math.PI / 2).translate(0, 2.92, -0.66), 0xe06a2a),
    part(cyl(0.22, 0.14, 0.38, 8, 0, 2.73, -0.66, true), WHITE),
  ]);
}
/** A bicycle on its kickstand: wheels, the frame's triangle (the paint), bars and saddle — leaning
 *  a touch. */
function bike() {
  const p: THREE.BufferGeometry[] = [];
  for (const z of [-0.52, 0.52]) p.push(part(new THREE.TorusGeometry(0.33, 0.022, 3, 10).rotateY(Math.PI / 2).translate(0, 0.35, z), BLACK));
  const tube = (a: THREE.Vector3, b: THREE.Vector3) => p.push(part(limb(a, b, 0.018, 0.018, 3), TINT));
  tube(V3(0, 0.35, 0.52), V3(0, 0.62, 0.12)); // seat stay
  tube(V3(0, 0.35, 0.52), V3(0, 0.36, 0.0)); // chain stay
  tube(V3(0, 0.36, 0.0), V3(0, 0.66, 0.1)); // seat tube
  tube(V3(0, 0.36, 0.0), V3(0, 0.7, -0.38)); // down tube
  tube(V3(0, 0.64, 0.1), V3(0, 0.72, -0.38)); // top tube
  tube(V3(0, 0.72, -0.38), V3(0, 0.35, -0.52)); // the fork
  p.push(part(box(0.44, 0.03, 0.03, 0, 0.86, -0.4), DARK));
  p.push(part(box(0.1, 0.05, 0.22, 0, 0.72, 0.14), BLACK));
  return merge(p).rotateZ(0.1).translate(0.035, 0, 0);
}
/** A kayak resting on the lawn, hull down, the cockpit open. */
function kayak() {
  const k = lathe([[0.001, -1.9], [0.18, -1.2], [0.3, 0], [0.18, 1.2], [0.001, 1.9]], 8).scale(1, 1, 0.5).rotateX(Math.PI / 2);
  k.translate(0, 0.15, 0);
  return merge([part(k, TINT), part(box(0.34, 0.03, 0.62, 0, 0.3, 0.1), BLACK)]);
}
/** A house flag on its bracket: the pole angled out from the wall (the plate at the origin, the
 *  wall behind at +z), the stars and stripes hanging from its outer part. */
function flag() {
  const p: THREE.BufferGeometry[] = [part(box(0.08, 0.14, 0.03, 0, 0, 0.015), DARK)];
  const dir = V3(0, Math.sin(0.7), -Math.cos(0.7)), L = 1.5;
  p.push(part(limb(V3(0, 0, 0), dir.clone().multiplyScalar(L), 0.012, 0.012, 4), 0xc9b88a));
  const at = (t: number, drop: number) => dir.clone().multiplyScalar(t).add(V3(0, -drop, 0));
  const t0 = 0.48, t1 = 1.46, H = 0.62, S = 5;
  for (let k = 0; k < S; k++) {
    const d0 = (k / S) * H, d1 = ((k + 1) / S) * H;
    p.push(part(quad(at(t0, d0), at(t1, d0), at(t1, d1), at(t0, d1)), k % 2 ? WHITE : 0xb3261e));
  }
  const tc = t0 + (t1 - t0) * 0.42, dc = H * 0.54;
  for (const x of [-0.004, 0.004]) p.push(part(quad(at(t0, 0), at(tc, 0), at(tc, dc), at(t0, dc)).translate(x, 0, 0), 0x2b3a6b));
  return merge(p);
}
/** A lawn sign on its wire legs (a candidate, a school, a contractor): the painted board. */
function yardsign() {
  return merge([
    part(box(0.6, 0.42, 0.012, 0, 0.62, 0), TINT),
    part(box(0.48, 0.1, 0.004, 0, 0.66, -0.008), WHITE),
    part(limb(V3(-0.22, 0, 0), V3(-0.22, 0.45, 0), 0.006, 0.006, 3), STEEL),
    part(limb(V3(0.22, 0, 0), V3(0.22, 0.45, 0), 0.006, 0.006, 3), STEEL),
  ]);
}
/** A realtor's post sign: a white post, its arm and the painted board swinging under it. */
function salesign() {
  return merge([
    part(box(0.08, 1.4, 0.08, 0, 0.7, 0), WHITE),
    part(box(0.78, 0.06, 0.06, 0.38, 1.28, 0), WHITE),
    part(box(0.6, 0.42, 0.02, 0.44, 0.96, 0), TINT),
    part(box(0.5, 0.12, 0.006, 0.44, 0.92, -0.012), WHITE),
    part(box(0.5, 0.11, 0.02, 0.44, 1.21, 0), WHITE), // the rider on top
  ]);
}
/** A regulation sign on its channel post: a white plate, the painted roundel, two lines of text. */
function sign() {
  return merge([
    part(box(0.05, 2.25, 0.03, 0, 1.125, 0.02), STEEL),
    part(box(0.45, 0.6, 0.015, 0, 1.95, 0), WHITE),
    part(disc(0.15, 0.006, 10, 0, 2.05, -0.01), TINT),
    part(disc(0.11, 0.008, 10, 0, 2.05, -0.012), WHITE),
    part(box(0.3, 0.03, 0.006, 0, 1.8, -0.01), DARK),
    part(box(0.24, 0.03, 0.006, 0, 1.73, -0.01), DARK),
  ]);
}
/** An information board: two posts, the painted frame, the map, a little roof. */
function info() {
  return merge([
    part(box(0.1, 1.95, 0.1, -0.62, 0.975, 0), WOOD),
    part(box(0.1, 1.95, 0.1, 0.62, 0.975, 0), WOOD),
    part(box(1.2, 0.85, 0.06, 0, 1.3, 0), TINT),
    part(box(1.04, 0.7, 0.01, 0, 1.3, -0.035), CREAM),
    part(box(0.5, 0.3, 0.005, -0.2, 1.36, -0.041), 0x8fb07a),
    part(tiltX(box(1.46, 0.05, 0.42, 0, 1.98, 0), 0.25, 1.98), WOOD),
  ]);
}
/** A street cabinet (signals, telecoms, power): the painted box on its plinth, the door seams. */
function cabinet() {
  return merge([
    part(box(0.85, 1.18, 0.4, 0, 0.64, 0), TINT),
    part(box(0.88, 0.05, 0.43, 0, 0.025, 0), DARK),
    part(box(0.9, 0.04, 0.44, 0, 1.25, 0), TINT),
    part(box(0.012, 1.05, 0.005, 0, 0.64, -0.202), DARK),
    part(box(0.05, 0.08, 0.01, 0.08, 0.7, -0.205), STEEL),
  ]);
}
/** A vending machine: the painted cabinet, its window of drinks, the buttons, the lit header. */
function vending() {
  return merge([
    part(box(0.9, 1.8, 0.75, 0, 0.9, 0), TINT),
    part(box(0.56, 1.2, 0.01, -0.1, 1.0, -0.38), 0x2c3e50),
    part(box(0.16, 0.6, 0.01, 0.3, 1.1, -0.38), 0xd8d4c8),
    part(box(0.86, 0.18, 0.01, 0, 1.68, -0.38), WHITE),
    part(box(0.5, 0.12, 0.01, -0.1, 0.25, -0.38), DARK),
  ]);
}
/** A recycling container: a big painted box with its round mouths. */
function recycling() {
  return merge([
    part(box(1.5, 1.32, 1.1, 0, 0.74, 0), TINT),
    part(box(1.56, 0.06, 1.16, 0, 1.43, 0), TINT),
    part(disc(0.15, 0.02, 10, -0.38, 1.1, -0.55), BLACK),
    part(disc(0.15, 0.02, 10, 0.38, 1.1, -0.55), BLACK),
    part(box(1.3, 0.08, 0.9, 0, 0.04, 0), DARK),
  ]);
}
/** A street clock on its post: a turned column, the double-faced head, the hands. */
function clock() {
  const p = [
    part(lathe([[0.18, 0], [0.16, 0.25], [0.09, 0.38], [0.075, 2.8], [0.12, 2.92]], 8), TINT),
    part(disc(0.36, 0.2, 14, 0, 3.25, 0), TINT),
    part(disc(0.3, 0.21, 14, 0, 3.25, 0), CREAM),
    part(new THREE.ConeGeometry(0.08, 0.22, 6).translate(0, 3.72, 0), TINT),
  ];
  for (const z of [-0.106, 0.106]) {
    p.push(part(box(0.025, 0.2, 0.004, 0, 3.32, z), BLACK));
    p.push(part(box(0.14, 0.02, 0.004, 0.06, 3.25, z), BLACK));
  }
  return merge(p);
}
/** A fire ring of stones round a bed of ash. */
function firepit() {
  const p = [part(cyl(0.42, 0.42, 0.04, 10, 0, 0.02, 0), 0x3a3634)];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    p.push(part(box(0.3, 0.2 + (k % 3) * 0.03, 0.2, 0, 0.1, 0).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52), 0x8a8682));
  }
  return merge(p);
}
/** A channel marker: a pile driven into the bottom, its painted daymark and a small light. */
function beacon() {
  return merge([
    part(cyl(0.14, 0.16, 5.2, 6, 0, 0.6, 0), 0x4a4038),
    part(box(0.9, 0.9, 0.04, 0, 3.1, -0.17), TINT),
    part(box(0.6, 0.12, 0.045, 0, 3.1, -0.17), WHITE),
    part(box(0.16, 0.22, 0.16, 0, 3.32, 0), DARK),
  ]);
}
/** A red nun: the channel's red buoy, its cone on top. */
function nun() {
  return merge([part(cyl(0.34, 0.4, 0.8, 8, 0, 0.2, 0), TINT), part(new THREE.ConeGeometry(0.34, 0.62, 8).translate(0, 0.91, 0), TINT), part(cyl(0.341, 0.341, 0.08, 8, 0, 0.45, 0, true), WHITE)]);
}
/** A green can: the channel's green buoy, flat on top. */
function can() {
  return merge([part(cyl(0.35, 0.38, 1.2, 8, 0, 0.4, 0), TINT), part(cyl(0.36, 0.36, 0.05, 8, 0, 1.02, 0), DARK), part(cyl(0.351, 0.351, 0.08, 8, 0, 0.7, 0, true), WHITE)]);
}
/** A house's AC condenser on its pad beside the wall: the grey box, the fan grille on top. */
function acunit() {
  return merge([
    part(box(0.86, 0.06, 0.86, 0, 0.03, 0), 0xb8b4aa),
    part(box(0.74, 0.66, 0.74, 0, 0.39, 0), 0xc9cbc8),
    part(cyl(0.27, 0.27, 0.02, 10, 0, 0.735, 0), 0x3a3d40),
    part(box(0.76, 0.03, 0.76, 0, 0.72, 0), 0x9a9c98),
  ]);
}
/** A stone birdbath. */
function birdbath() {
  return merge([part(lathe([[0.18, 0], [0.14, 0.05], [0.07, 0.12], [0.06, 0.55], [0.09, 0.62], [0.3, 0.68], [0.32, 0.75], [0.28, 0.74]], 8), 0xb5b0a6), part(cyl(0.27, 0.27, 0.01, 8, 0, 0.73, 0), 0x8fb4c4)]);
}
/** A dock box: the white fibreglass chest on each slip. */
function dockbox() {
  return merge([part(box(1.25, 0.52, 0.6, 0, 0.27, 0), WHITE), part(box(1.3, 0.06, 0.65, 0, 0.56, 0), 0xe4e0d6), part(box(0.08, 0.1, 0.02, 0, 0.47, -0.31), STEEL)]);
}
/** A stack of crab traps: vinyl-coated wire boxes (the paint), their runners darker. */
function trap() {
  const p: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 2; k++) {
    const y = k * 0.4, a = k * 0.18;
    p.push(part(box(0.9, 0.38, 0.6, 0, y + 0.19, 0).rotateY(a), TINT));
    for (const z of [-0.2, 0.2]) p.push(part(box(0.92, 0.04, 0.04, 0, y + 0.02, z).rotateY(a), DARK));
  }
  return merge(p);
}
/** A surfboard stood on its tail against the wall behind (+z). */
function surfboard() {
  const b = lathe([[0.001, -1.0], [0.21, -0.72], [0.27, 0], [0.2, 0.74], [0.001, 1.0]], 8).scale(1, 1, 0.12);
  b.translate(0, 1.0, 0);
  tiltX(b, 0.2, 0);
  return merge([part(b, TINT)]);
}

const r = (f: () => THREE.BufferGeometry) => f;
/** The family, in a fixed order: a piece's index is what a tile's records carry (never reorder;
 *  add at the end). */
export const MICRO_KINDS: MicroKind[] = [
  { id: 'cart', geo: r(cart), box: [0.62, 1.0, 0.76], budget: 400, solid: [0.3, 0.36, 1.0] },
  { id: 'aframe', geo: r(aframe), box: [0.62, 0.97, 0.6], budget: 400, solid: [0.3, 0.26, 0.95] },
  { id: 'planter', geo: r(planter), box: [1.08, 1.0, 0.5], budget: 600, solid: [0.52, 0.24, 0.6] },
  { id: 'newsbox', geo: r(newsbox), box: [0.5, 0.95, 0.45], budget: 300, solid: [0.24, 0.22, 0.95] },
  { id: 'pedestal', geo: r(pedestal), box: [0.32, 0.95, 0.32], budget: 150, solid: [0.15, 0.15, 0.93] },
  { id: 'adirondack', geo: r(adirondack), box: [0.85, 1.16, 1.06], budget: 800, solid: [0.38, 0.42, 0.9] },
  { id: 'grill', geo: r(grill), box: [0.62, 1.02, 0.62], budget: 600, solid: [0.3, 0.3, 1.0] },
  { id: 'cooler', geo: r(cooler), box: [0.72, 0.4, 0.4], budget: 250 },
  { id: 'buoy', geo: r(buoy), box: [0.66, 1.2, 0.66], budget: 450, mount: 'float' },
  { id: 'potfloat', geo: r(potfloat), box: [0.2, 0.75, 0.16], budget: 200, mount: 'float' },
  { id: 'cleat', geo: r(cleat), box: [0.38, 0.12, 0.1], budget: 200 },
  { id: 'lifering', geo: r(lifering), box: [0.75, 1.56, 0.4], budget: 560, solid: [0.06, 0.06, 1.5] },
  { id: 'hoop', geo: r(hoop), box: [1.12, 3.52, 1.9], budget: 600, solid: [0.32, 0.5, 0.3] },
  { id: 'bike', geo: r(bike), box: [0.6, 0.95, 1.8], budget: 800 },
  { id: 'kayak', geo: r(kayak), box: [0.62, 0.35, 3.82], budget: 400 },
  { id: 'flag', geo: r(flag), box: [0.12, 1.4, 1.2], budget: 300, mount: 'wall' },
  { id: 'yardsign', geo: r(yardsign), box: [0.62, 0.85, 0.05], budget: 200 },
  { id: 'salesign', geo: r(salesign), box: [0.84, 1.42, 0.1], budget: 300, solid: [0.05, 0.05, 1.4] },
  { id: 'sign', geo: r(sign), box: [0.46, 2.3, 0.06], budget: 400, solid: [0.04, 0.03, 2.2] },
  { id: 'towel', geo: () => towelGeometry(), box: [0.82, 0.03, 1.72], budget: 120 },
  { id: 'umbrella', geo: () => umbrellaGeometry(1), box: [2.4, 2.5, 2.2], budget: 300 },
  { id: 'beachchair', geo: () => beachChairGeometry(), box: [0.7, 1.05, 1.0], budget: 400 },
  { id: 'picnic', geo: () => picnicTableGeometry(), box: [1.75, 0.85, 1.85], budget: 900, solid: [0.85, 0.92, 0.8] },
  { id: 'info', geo: r(info), box: [1.5, 2.1, 0.5], budget: 400, solid: [0.7, 0.1, 2.0] },
  { id: 'cabinet', geo: r(cabinet), box: [0.92, 1.3, 0.46], budget: 250, solid: [0.44, 0.22, 1.3] },
  { id: 'vending', geo: r(vending), box: [0.92, 1.82, 0.78], budget: 250, solid: [0.46, 0.38, 1.8] },
  { id: 'recycling', geo: r(recycling), box: [1.58, 1.48, 1.18], budget: 350, solid: [0.78, 0.58, 1.46] },
  { id: 'clock', geo: r(clock), box: [0.74, 3.86, 0.74], budget: 800, solid: [0.16, 0.16, 3.0] },
  { id: 'firepit', geo: r(firepit), box: [1.4, 0.3, 1.4], budget: 450 },
  { id: 'beacon', geo: r(beacon), box: [0.92, 5.7, 0.4], budget: 300, mount: 'float' },
  { id: 'nun', geo: r(nun), box: [0.82, 1.45, 0.82], budget: 300, mount: 'float' },
  { id: 'can', geo: r(can), box: [0.78, 1.25, 0.78], budget: 300, mount: 'float' },
  { id: 'acunit', geo: r(acunit), box: [0.88, 0.76, 0.88], budget: 250, solid: [0.4, 0.4, 0.75] },
  { id: 'birdbath', geo: r(birdbath), box: [0.66, 0.78, 0.66], budget: 500, solid: [0.16, 0.16, 0.75] },
  { id: 'dockbox', geo: r(dockbox), box: [1.32, 0.6, 0.68], budget: 200, solid: [0.64, 0.32, 0.6] },
  { id: 'trap', geo: r(trap), box: [1.1, 0.82, 1.0], budget: 350 },
  { id: 'surfboard', geo: r(surfboard), box: [0.56, 2.05, 0.6], budget: 300 },
];
/** A piece's index in the family (what a record carries), or −1. */
export const MICRO_INDEX: Record<string, number> = Object.fromEntries(MICRO_KINDS.map((k, i) => [k.id, i]));
/** The piece's model (cached; tile builders and the layer copy what they keep). Null if the
 *  recipe throws or comes out empty — the layer then just leaves that piece out. */
export function microLib(id: MicroId): THREE.BufferGeometry | null {
  const k = MICRO_KINDS[MICRO_INDEX[id]];
  if (!k) return null;
  try {
    const g = cached(`micro:${id}`, k.geo);
    return g.getAttribute('position')?.count ? g : null;
  } catch {
    return null;
  }
}
