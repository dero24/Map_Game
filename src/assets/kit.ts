// Asset kit — recipe + seed → game-ready geometry (docs: 3d_asset_creator.md, ASSET_FIDELITY §4).
//
// Every asset is a pure function of a small, validated recipe: the same recipe always yields
// the same mesh, a new seed yields a sibling that still belongs to the family. Output is the
// game's own format — non-indexed BufferGeometry with `color` (white = tintable by instance
// colour) and `aPart` (0 body, 3 head/nav lights, 4 tail lights — the night glow channel the
// life material reads) — so it instances, packs and paints exactly like the hand-built props.
// Conventions: metres; y up; the front (nose, bow) toward −z; origin at ground / waterline.
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { TINT, part, merge, box, profile, cached } from './core';
import { gearGeometry, type CarGear } from './furniture';
export { TINT, part, merge } from './core';

const wheel = (r: number, w: number, x: number, z: number) => [
  part(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2).translate(x, r, z), 0x1d1e21),
  part(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10).rotateZ(Math.PI / 2).translate(x, r, z), 0x9a9da2),
];

// ---------------------------------------------------------------- cars
export type CarType = 'sedan' | 'hatch' | 'wagon' | 'suv' | 'pickup' | 'van' | 'coupe' | 'jeep';
export const CAR_TYPES: CarType[] = ['sedan', 'hatch', 'wagon', 'suv', 'pickup', 'van', 'coupe', 'jeep'];
export interface CarRecipe {
  type: CarType; seed: number;
  L: number; W: number; wheelR: number;
  belt: number; roof: number; // heights of the beltline and roof
  hood: number; windshield: number; // hood length, windshield run (slope)
  rear: 'trunk' | 'hatch' | 'box' | 'bed' | 'fastback';
  rearGlass: number; // run of the rear window
  deck: number; // trunk / bed length behind the cabin
}
const CAR_BASE: Record<CarType, Omit<CarRecipe, 'type' | 'seed'>> = {
  sedan: { L: 4.7, W: 1.82, wheelR: 0.33, belt: 0.95, roof: 1.45, hood: 1.25, windshield: 0.75, rear: 'trunk', rearGlass: 0.6, deck: 0.95 },
  hatch: { L: 4.1, W: 1.76, wheelR: 0.31, belt: 0.95, roof: 1.48, hood: 0.95, windshield: 0.7, rear: 'hatch', rearGlass: 0.35, deck: 0 },
  wagon: { L: 4.85, W: 1.82, wheelR: 0.33, belt: 0.95, roof: 1.5, hood: 1.15, windshield: 0.72, rear: 'hatch', rearGlass: 0.25, deck: 0 },
  suv: { L: 4.85, W: 1.95, wheelR: 0.39, belt: 1.15, roof: 1.8, hood: 1.15, windshield: 0.6, rear: 'box', rearGlass: 0.18, deck: 0 },
  pickup: { L: 5.7, W: 2.0, wheelR: 0.41, belt: 1.2, roof: 1.92, hood: 1.45, windshield: 0.55, rear: 'bed', rearGlass: 0.05, deck: 1.85 },
  van: { L: 5.15, W: 1.97, wheelR: 0.36, belt: 1.05, roof: 1.78, hood: 0.8, windshield: 0.85, rear: 'box', rearGlass: 0.15, deck: 0 },
  coupe: { L: 4.55, W: 1.84, wheelR: 0.34, belt: 0.88, roof: 1.3, hood: 1.5, windshield: 0.85, rear: 'fastback', rearGlass: 1.0, deck: 0.45 },
  jeep: { L: 4.3, W: 1.9, wheelR: 0.42, belt: 1.12, roof: 1.85, hood: 1.05, windshield: 0.2, rear: 'box', rearGlass: 0.05, deck: 0 },
};
// Recipe from type + seed: proportions breathe ±4 % so a street of sedans isn't clones.
export function carRecipe(type: CarType, seed = 1): CarRecipe {
  const r = makeRng(seed * 7919 + CAR_TYPES.indexOf(type) * 104729);
  const b = CAR_BASE[type];
  const j = (v: number, a = 0.04) => v * (1 + (r.float() * 2 - 1) * a);
  const L = j(b.L, 0.035);
  return validateCar({ ...b, type, seed, L, W: j(b.W, 0.02), roof: j(b.roof, 0.03), hood: j(b.hood), windshield: j(b.windshield, 0.08), deck: b.deck && j(b.deck, 0.06) });
}
function validateCar(c: CarRecipe): CarRecipe {
  const cabin = c.L - 0.35 - c.hood - c.deck - 0.25;
  if (cabin < c.windshield + c.rearGlass + 0.6) c.hood = Math.max(0.6, c.L - 0.6 - c.deck - c.windshield - c.rearGlass - 0.6);
  c.roof = Math.max(c.belt + 0.3, c.roof);
  return c;
}
export function carGeometry(c: CarRecipe): THREE.BufferGeometry {
  const { L, W, wheelR: R, belt, roof } = c;
  const zf = -L / 2, zr = L / 2; // bow −z
  const sill = R * 0.95;
  // lower body: bumpers, hood, beltline, deck / bed
  const noseY = belt - 0.12;
  const lower: [number, number][] = [
    [zf + 0.05, 0.28], [zf, 0.45], [zf + 0.02, noseY - 0.08], [zf + 0.25, noseY],
    [zf + c.hood, belt], [zr - 0.1, belt], [zr, belt - 0.12], [zr, 0.45], [zr - 0.05, 0.28],
  ];
  const parts: THREE.BufferGeometry[] = [part(profile(lower, W, 0.06), TINT)];
  // greenhouse: glass trapezoid from windshield base to the back of the cabin, roof slab on top
  const zw = zf + c.hood; // windshield base
  const zrear = c.rear === 'box' || c.rear === 'hatch' ? zr - 0.08 : zr - c.deck - 0.12;
  const zRoof0 = zw + c.windshield, zRoof1 = Math.max(zRoof0 + 0.4, zrear - c.rearGlass);
  const glass: [number, number][] = [[zw, belt - 0.02], [zRoof0, roof - 0.06], [zRoof1, roof - 0.06], [zrear, belt - 0.02]];
  parts.push(part(profile(glass, W - 0.16, 0.03), 0x2a3440));
  parts.push(part(profile([[zRoof0 - 0.05, roof - 0.07], [zRoof0 + 0.05, roof], [zRoof1 - 0.05, roof], [zRoof1 + 0.05, roof - 0.07]], W - 0.1, 0.03), TINT));
  // pillars between front and rear side windows (a B-pillar keeps it from reading as a bubble)
  const bz = (zRoof0 + zRoof1) / 2;
  parts.push(part(box(W - 0.1, roof - belt - 0.06, 0.12, 0, (roof + belt) / 2, bz), TINT));
  if (c.rear === 'bed') {
    // open bed: floor + sides + tailgate, below the belt
    const b0 = zr - c.deck - 0.05, bl = c.deck;
    parts.push(part(box(W - 0.2, 0.08, bl, 0, belt - 0.42, b0 + bl / 2), 0x3a3b3f));
    for (const s of [-1, 1]) parts.push(part(box(0.08, 0.45, bl, s * (W / 2 - 0.08), belt + 0.2, b0 + bl / 2), TINT));
    parts.push(part(box(W - 0.1, 0.45, 0.08, 0, belt + 0.2, zr - 0.06), TINT));
  }
  if (c.type === 'jeep') {
    parts.push(part(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12).rotateX(Math.PI / 2).translate(0, belt, zr + 0.15), 0x1d1e21)); // spare
    parts.push(part(box(W + 0.18, 0.08, 1.0, 0, sill + 0.35, zf + 0.6), 0x2c2d30)); // flared fenders
    parts.push(part(box(W + 0.18, 0.08, 1.0, 0, sill + 0.35, zr - 0.6), 0x2c2d30));
  }
  // bumpers, grille, lights, mirrors
  parts.push(part(box(W + 0.02, 0.2, 0.18, 0, 0.36, zf + 0.06), 0x2c2d30), part(box(W + 0.02, 0.2, 0.18, 0, 0.36, zr - 0.06), 0x2c2d30));
  parts.push(part(box(W * 0.46, 0.14, 0.04, 0, noseY - 0.2, zf - 0.005), 0x1f2226));
  for (const s of [-1, 1]) {
    parts.push(part(box(0.3, 0.12, 0.05, s * (W / 2 - 0.26), noseY - 0.14, zf - 0.01), 0xf6f1da, 3));
    parts.push(part(box(0.26, 0.12, 0.05, s * (W / 2 - 0.2), belt - 0.22, zr + 0.01), 0x9a1c1c, 4));
    parts.push(part(box(0.18, 0.1, 0.1, s * (W / 2 + 0.06), belt + 0.08, zw + 0.25), TINT));
  }
  // wheels at the axle positions implied by the overhangs
  const af = zf + Math.min(0.95, L * 0.19), ar = zr - Math.min(1.05, L * 0.21);
  for (const s of [-1, 1]) for (const z of [af, ar]) parts.push(...wheel(R, 0.24, s * (W / 2 - 0.12), z));
  return merge(parts);
}

// ---------------------------------------------------------------- boats
export type BoatType = 'skiff' | 'console' | 'cabin' | 'sail' | 'pontoon' | 'lobster';
export const BOAT_TYPES: BoatType[] = ['skiff', 'console', 'cabin', 'sail', 'pontoon', 'lobster'];
export interface BoatRecipe { type: BoatType; seed: number; L: number; B: number; free: number; draft: number; stripe: number }
const BOAT_BASE: Record<BoatType, { L: number; B: number; free: number; draft: number }> = {
  skiff: { L: 5, B: 1.9, free: 0.55, draft: 0.3 },
  console: { L: 7.2, B: 2.5, free: 0.8, draft: 0.45 },
  cabin: { L: 10.5, B: 3.4, free: 1.1, draft: 0.8 },
  sail: { L: 9.5, B: 3.0, free: 0.9, draft: 0.6 },
  pontoon: { L: 7.5, B: 2.6, free: 0.5, draft: 0.35 },
  lobster: { L: 11, B: 3.6, free: 1.2, draft: 1.0 },
};
export function boatRecipe(type: BoatType, seed = 1): BoatRecipe {
  const r = makeRng(seed * 6007 + BOAT_TYPES.indexOf(type) * 7919);
  const b = BOAT_BASE[type];
  const j = (v: number, a: number) => v * (1 + (r.float() * 2 - 1) * a);
  return { type, seed, L: j(b.L, 0.08), B: j(b.B, 0.05), free: j(b.free, 0.08), draft: b.draft, stripe: [0x2d4a6a, 0x9b3b32, 0x3d5a46, 0x2a2c30, 0x4a7fa6][Math.floor(r.float() * 5)] };
}
// Lofted V-hull: stations bow (−z) to transom, half-beam grows with a sine to amidships.
function hull(L: number, B: number, free: number, draft: number, color: number) {
  const N = 12, pos: number[] = [];
  const sec = (t: number) => {
    const z = -L / 2 + t * L;
    const w = (B / 2) * (t < 0.55 ? Math.sin((t / 0.55) * Math.PI / 2) ** 0.8 : 1 - 0.08 * ((t - 0.55) / 0.45));
    const sheerY = free + (t < 0.3 ? (0.3 - t) * 0.9 : 0); // the bow rises
    const keelY = -draft * (t < 0.15 ? t / 0.15 : 1);
    return [[0, keelY, z], [w * 0.85, keelY * 0.35, z], [w, sheerY, z]] as [number, number, number][];
  };
  const S = Array.from({ length: N + 1 }, (_, i) => sec(i / N));
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < N; i++) {
    const A = S[i], Bn = S[i + 1];
    for (const s of [-1, 1]) {
      const f = (p: number[]) => [p[0] * s, p[1], p[2]];
      for (let k = 0; k < 2; k++) {
        const a0 = f(A[k]), a1 = f(A[k + 1]), b0 = f(Bn[k]), b1 = f(Bn[k + 1]);
        if (s > 0) (tri(a0, b1, b0), tri(a0, a1, b1));
        else (tri(a0, b0, b1), tri(a0, b1, a1));
      }
    }
  }
  // transom
  const T = S[N];
  pos.push(-T[2][0], T[2][1], T[2][2], T[1][0], T[1][1], T[1][2], T[2][0], T[2][1], T[2][2]);
  pos.push(-T[2][0], T[2][1], T[2][2], -T[1][0], T[1][1], T[1][2], T[1][0], T[1][1], T[1][2]);
  pos.push(-T[1][0], T[1][1], T[1][2], T[0][0], T[0][1], T[0][2], T[1][0], T[1][1], T[1][2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const parts = [part(g, color)];
  // deck: a flat cap at the sheer (slightly inset)
  const deck = new THREE.Shape();
  // shape (x, −z) then rotateX(−90°): lands at y = 0 facing up with z restored
  S.forEach((s, i) => (i ? deck.lineTo(s[2][0] * 0.97, -s[2][2]) : deck.moveTo(s[2][0] * 0.97, -s[2][2])));
  for (let i = N; i >= 0; i--) deck.lineTo(-S[i][2][0] * 0.97, -S[i][2][2]);
  const dg = new THREE.ShapeGeometry(deck).rotateX(-Math.PI / 2).translate(0, free - 0.02, 0);
  parts.push(part(dg, 0xd9d2c2));
  return parts;
}
export function boatGeometry(b: BoatRecipe): THREE.BufferGeometry {
  const { L, B, free } = b;
  const parts: THREE.BufferGeometry[] = [];
  if (b.type === 'pontoon') {
    for (const s of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.32, 0.32, L - 0.4, 12).rotateX(Math.PI / 2).translate(s * (B / 2 - 0.4), 0.05, 0.1), 0xc9ccd0));
    for (const s of [-1, 1]) parts.push(part(new THREE.ConeGeometry(0.32, 0.6, 12).rotateX(-Math.PI / 2).translate(s * (B / 2 - 0.4), 0.05, -L / 2 + 0.1), 0xc9ccd0));
    parts.push(part(box(B, 0.12, L - 0.3, 0, 0.45, 0.15), 0xd9d2c2));
    for (const s of [-1, 1]) parts.push(part(box(0.06, 0.75, L - 1.4, s * (B / 2 - 0.05), 0.9, 0.5), TINT));
    parts.push(part(box(B - 0.3, 0.06, L * 0.45, 0, 2.2, 0.3), b.stripe)); // bimini
    for (const s of [-1, 1]) for (const z of [-L * 0.2, L * 0.4]) parts.push(part(box(0.04, 1.7, 0.04, s * (B / 2 - 0.2), 1.35, z), 0xb9bcc0));
    parts.push(part(box(0.5, 0.6, 0.5, 0, 0.3, L / 2 + 0.1), 0x2a2c30)); // outboard
    return merge(parts);
  }
  parts.push(...hull(L, B, free, b.draft, TINT));
  parts.push(part(box(B * 1.01, 0.12, L * 0.48, 0, free - 0.12, L * 0.25), b.stripe)); // sheer stripe (aft, where the hull is full beam)
  const bench = (z: number) => part(box(B * 0.7, 0.35, 0.4, 0, free + 0.05, z), 0xd9d2c2);
  if (b.type === 'skiff') {
    parts.push(bench(0), bench(L * 0.3));
    parts.push(part(box(0.35, 0.8, 0.35, 0, free + 0.1, L / 2 + 0.05), 0x2a2c30));
  } else if (b.type === 'console') {
    parts.push(part(box(0.9, 0.9, 0.8, 0, free + 0.45, 0), 0xeeeae0));
    parts.push(part(box(0.85, 0.35, 0.05, 0, free + 1.05, -0.35), 0x2a3440));
    parts.push(part(box(1.8, 0.06, 1.6, 0, free + 2.1, 0.1), 0xeeeae0)); // T-top
    for (const s of [-1, 1]) parts.push(part(box(0.05, 1.3, 0.05, s * 0.8, free + 1.45, 0.1), 0xb9bcc0));
    parts.push(part(box(0.45, 0.9, 0.45, 0, free + 0.1, L / 2 + 0.1), 0x2a2c30), bench(L * 0.3));
  } else if (b.type === 'cabin' || b.type === 'lobster') {
    const cz = b.type === 'lobster' ? -L * 0.18 : -L * 0.05, cl = L * (b.type === 'lobster' ? 0.3 : 0.42);
    parts.push(part(box(B * 0.72, 1.2, cl, 0, free + 0.6, cz), 0xf3f1ea));
    parts.push(part(box(B * 0.74, 0.35, cl * 0.8, 0, free + 0.95, cz), 0x2a3440));
    parts.push(part(box(B * 0.76, 0.08, cl + 0.1, 0, free + 1.25, cz), 0xe6e1d6));
    if (b.type === 'cabin') {
      parts.push(part(box(B * 0.55, 0.6, cl * 0.5, 0, free + 1.55, cz + cl * 0.1), 0xf3f1ea)); // flybridge
      parts.push(part(box(0.06, 1.2, 0.06, 0, free + 2.3, cz), 0xb9bcc0));
    } else {
      parts.push(part(box(0.1, 2.2, 0.1, 0, free + 2.2, cz + cl * 0.3), 0xb9bcc0)); // mast / davit
      parts.push(part(box(B * 0.6, 0.5, 0.8, 0, free + 0.25, L * 0.3), 0x9a8a6a)); // traps on deck
    }
    parts.push(part(box(0.2, 0.2, 0.2, 0, free + 1.45, cz - cl / 2), 0xfff4d6, 3));
  } else if (b.type === 'sail') {
    parts.push(part(box(B * 0.55, 0.5, L * 0.3, 0, free + 0.25, -L * 0.02), 0xf3f1ea));
    parts.push(part(box(B * 0.57, 0.14, L * 0.24, 0, free + 0.35, -L * 0.02), 0x2a3440));
    const mh = L * 1.25;
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.08, mh, 6).translate(0, free + mh / 2, -L * 0.12), 0xd8d8d4));
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, L * 0.42, 6).rotateX(Math.PI / 2).translate(0, free + 1.1, -L * 0.12 + L * 0.21), 0xd8d8d4)); // boom
    parts.push(part(new THREE.CylinderGeometry(0.16, 0.16, L * 0.4, 8).rotateX(Math.PI / 2).translate(0, free + 1.18, -L * 0.12 + L * 0.21), b.stripe)); // furled main
    parts.push(part(box(0.1, 0.1, 0.1, 0, free + mh, -L * 0.12), 0xfff4d6, 3));
  }
  return merge(parts);
}

// ---------------------------------------------------------------- planes
export type PlaneType = 'highwing' | 'lowwing' | 'seaplane' | 'biplane';
export const PLANE_TYPES: PlaneType[] = ['highwing', 'lowwing', 'seaplane', 'biplane'];
export interface PlaneRecipe { type: PlaneType; seed: number; L: number; span: number; trim: number }
export function planeRecipe(type: PlaneType, seed = 1): PlaneRecipe {
  const r = makeRng(seed * 4099 + PLANE_TYPES.indexOf(type) * 131);
  const base = { highwing: [8.3, 11], lowwing: [7.3, 10.7], seaplane: [8.6, 11], biplane: [7.2, 9.2] }[type];
  return { type, seed, L: base[0] * (1 + (r.float() - 0.5) * 0.06), span: base[1] * (1 + (r.float() - 0.5) * 0.06), trim: [0x9c2a26, 0x2b3f63, 0x3d5a46, 0xc7902a, 0x2a2c30][Math.floor(r.float() * 5)] };
}
/** Plane geometry plus where the propeller disc sits (the rider spins it there). */
export function planeGeometry(p: PlaneRecipe): { geo: THREE.BufferGeometry; prop: THREE.Vector3; gearY: number } {
  const { L, span, trim } = p;
  const float = p.type === 'seaplane';
  const lift = float ? 1.0 : 0; // seaplanes ride on floats
  const fy = 1.05 + lift; // fuselage centre height
  const zn = -L / 2; // nose
  const parts: THREE.BufferGeometry[] = [];
  // fuselage: lofted sections, round-ish nose to a slim tail
  const secs: [number, number, number][] = [[0, 0.5, 0.55], [0.12, 0.62, 0.7], [0.45, 0.62, 0.72], [0.7, 0.38, 0.45], [1, 0.12, 0.2]]; // [t, halfW, halfH]
  const ring = 10, pos: number[] = [];
  const pt = (t: number, w: number, h: number, a: number): [number, number, number] => [Math.cos(a) * w, fy + Math.sin(a) * h + t * 0.35, zn + t * L * 0.98];
  for (let i = 0; i + 1 < secs.length; i++)
    for (let k = 0; k < ring; k++) {
      const a0 = (k / ring) * Math.PI * 2, a1 = ((k + 1) / ring) * Math.PI * 2;
      const [t0, w0, h0] = secs[i], [t1, w1, h1] = secs[i + 1];
      const A = pt(t0, w0, h0, a0), B = pt(t0, w0, h0, a1), C = pt(t1, w1, h1, a1), D = pt(t1, w1, h1, a0);
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fg.computeVertexNormals();
  parts.push(part(fg, TINT));
  parts.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 10).rotateX(Math.PI / 2).translate(0, fy, zn - 0.01), 0x3a3b3f));
  parts.push(part(new THREE.ConeGeometry(0.18, 0.4, 10).rotateX(-Math.PI / 2).translate(0, fy, zn - 0.22), trim));
  parts.push(part(box(1.14, 0.12, L * 0.62, 0, fy - 0.1, zn + L * 0.33), trim)); // cheat line
  // canopy / windows
  parts.push(part(box(1.0, 0.45, 1.3, 0, fy + 0.55, zn + L * 0.26), 0x2a3440));
  // wings
  const chord = span * 0.14;
  const wingZ = zn + L * 0.3;
  const high = p.type === 'highwing' || p.type === 'seaplane';
  const wy = high ? fy + 0.8 : fy - 0.45;
  const wing = (y: number, sp: number) => {
    parts.push(part(box(sp, 0.14, chord, 0, y, wingZ), 0xf4f1ea));
    for (const s of [-1, 1]) parts.push(part(box(0.7, 0.16, chord + 0.02, s * (sp / 2 - 0.35), y + 0.005, wingZ), trim));
  };
  wing(wy, span);
  if (p.type === 'biplane') {
    wing(fy + 1.2, span * 0.94);
    for (const s of [-1, 1]) for (const dz of [-0.4, 0.4]) parts.push(part(box(0.06, 1.65, 0.06, s * span * 0.32, fy + 0.38, wingZ + dz), 0x8d8a82));
  }
  if (high) for (const s of [-1, 1]) parts.push(part(box(0.07, 0.95, 0.07, s * 1.6, fy + 0.3, wingZ), 0x8d8a82));
  // tail
  parts.push(part(box(span * 0.33, 0.1, 1.0, 0, fy + 0.35, zn + L * 0.93), 0xf4f1ea));
  parts.push(part(box(0.1, 1.45, 1.15, 0, fy + 1.0, zn + L * 0.95), 0xf4f1ea), part(box(0.12, 0.5, 0.5, 0, fy + 1.5, zn + L * 0.99), trim));
  // gear: floats, or wheels
  if (float) {
    for (const s of [-1, 1]) {
      parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, L * 0.72, 10).rotateX(Math.PI / 2).translate(s * 1.3, 0.3, zn + L * 0.4), 0xe6e1d6));
      parts.push(part(new THREE.ConeGeometry(0.3, 0.7, 10).rotateX(-Math.PI / 2).translate(s * 1.3, 0.3, zn + L * 0.4 - L * 0.36 - 0.35), 0xe6e1d6));
      for (const dz of [-0.5, 0.9]) parts.push(part(box(0.06, 0.9, 0.06, s * 0.9, 0.85, wingZ + dz), 0x8d8a82));
    }
  } else {
    const wr = 0.26, gz = wingZ - 0.2;
    for (const s of [-1, 1]) {
      parts.push(part(new THREE.CylinderGeometry(wr, wr, 0.16, 10).rotateZ(Math.PI / 2).translate(s * 0.9, wr, gz), 0x1d1e21));
      parts.push(part(box(0.07, fy - 0.5, 0.07, s * 0.75, (fy - 0.5) / 2 + wr, gz), 0x5a5550));
    }
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10).rotateZ(Math.PI / 2).translate(0, 0.2, p.type === 'biplane' ? zn + L * 0.93 : zn + 0.7), 0x1d1e21));
  }
  parts.push(part(box(0.1, 0.1, 0.1, span / 2, wy, wingZ), 0xd83a2a, 3), part(box(0.1, 0.1, 0.1, -span / 2, wy, wingZ), 0x2ad85a, 3));
  return { geo: merge(parts), prop: new THREE.Vector3(0, fy, zn - 0.45), gearY: 0 };
}

// ---------------------------------------------------------------- rocks
export type RockType = 'boulder' | 'riprap' | 'stone';
// Displaced icosahedra: riprap is angular (low detail, flat faces kept), boulders rounded and
// squat, beach stones smooth and flat. Vertex colours carry lichen/wet patches.
export function rockGeometry(type: RockType, seed = 1): THREE.BufferGeometry {
  const r = makeRng(seed * 2654435761);
  const g = new THREE.IcosahedronGeometry(1, type === 'riprap' ? 0 : 1);
  const P = g.attributes.position;
  const dir = [r.float() - 0.5, r.float() - 0.5, r.float() - 0.5];
  const amp = type === 'riprap' ? 0.28 : type === 'boulder' ? 0.2 : 0.12;
  const squash = type === 'stone' ? 0.45 : type === 'boulder' ? 0.72 : 0.8;
  const stretch = 1 + r.float() * (type === 'riprap' ? 0.5 : 0.3);
  const seen = new Map<string, number>();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`; // shared corners move together (no cracks)
    let d = seen.get(k);
    if (d === undefined) {
      const n = Math.sin(x * 3.1 + dir[0] * 9) * Math.sin(y * 2.7 + dir[1] * 9) * Math.sin(z * 3.3 + dir[2] * 9);
      d = 1 + amp * (n + (r.float() - 0.5) * 0.8);
      seen.set(k, d);
    }
    P.setXYZ(i, x * d * stretch, Math.max(y * d * squash, -0.25), z * d);
  }
  g.computeVertexNormals();
  const geo = part(g, 0xffffff);
  // colour: base stone with darker undersides and a lichen/salt fleck by facet
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const PP = geo.getAttribute('position');
  const base = new THREE.Color(type === 'stone' ? 0x9a9186 : 0x847c71), lich = new THREE.Color(0x9aa07a), dark = new THREE.Color(0x5e5850);
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i += 3) {
    const y = (PP.getY(i) + PP.getY(i + 1) + PP.getY(i + 2)) / 3;
    c.copy(base).lerp(dark, Math.max(0, -y) * 0.9);
    if (r.float() < 0.12) c.lerp(lich, 0.45);
    for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
  }
  return geo;
}

// ---------------------------------------------------------------- libraries (cached)
// A handful of canonical variants per family — each one InstancedMesh in the world.
export const carLib = (type: CarType, gear?: CarGear | null) =>
  cached(`car:${type}:${gear ?? ''}`, () => {
    const r = carRecipe(type, 1);
    return gear ? merge([carGeometry(r), gearGeometry(gear, r.roof, r.L, r.W, type.length)]) : carGeometry(r);
  });
export const boatLib = (type: BoatType) => cached('boat:' + type, () => boatGeometry(boatRecipe(type, 1)));
export const rockLib = (type: RockType, v: number) => cached(`rock:${type}:${v}`, () => rockGeometry(type, v + 1));
// Street mix (weights). CAR_MIX is the US default; carMix() shifts it by region + climate so the
// same kit reads right anywhere: hatchbacks and wagons in Europe/Japan, pickups in the interior
// and the arid West, jeeps and SUVs where winters bite.
export const CAR_MIX: [CarType, number][] = [['sedan', 3], ['suv', 3.2], ['pickup', 1.6], ['hatch', 1], ['wagon', 0.5], ['van', 0.9], ['coupe', 0.4], ['jeep', 0.5]];
const MIX_CACHE = new Map<string, [CarType, number][]>();
export function carMix(region: string, climate: string): [CarType, number][] {
  const k = region + '/' + climate;
  let m = MIX_CACHE.get(k);
  if (m) return m;
  const mul: Partial<Record<CarType, number>> = {};
  const bump = (t: CarType, f: number) => (mul[t] = (mul[t] ?? 1) * f);
  if (region === 'eu' || region === 'easia' || region === 'oceania') (bump('hatch', 3.5), bump('wagon', 3), bump('pickup', 0.2), bump('suv', 0.6), bump('van', 1.5));
  if (region === 'latam' || region === 'seasia' || region === 'sasia' || region === 'africa' || region === 'mena') (bump('hatch', 2.5), bump('pickup', 1.4), bump('suv', 0.6), bump('coupe', 0.5));
  if (climate === 'arid' || climate === 'continental') (bump('pickup', 1.8), bump('jeep', 1.3));
  if (climate === 'boreal' || climate === 'polar') (bump('suv', 1.4), bump('pickup', 1.5), bump('jeep', 1.6), bump('coupe', 0.4));
  if (climate === 'tropical' || climate === 'mediterranean') (bump('jeep', 1.5), bump('coupe', 1.4));
  m = CAR_MIX.map(([t, w]) => [t, w * (mul[t] ?? 1)]);
  MIX_CACHE.set(k, m);
  return m;
}
// Moored / cruising boat mix: lobster boats up north, skiffs and center-consoles in warm water.
export function boatMix(climate: string): [BoatType, number][] {
  const cold = climate === 'boreal' || climate === 'polar' || climate === 'continental';
  const warm = climate === 'tropical' || climate === 'mediterranean' || climate === 'arid';
  return [['console', warm ? 4 : 3], ['skiff', warm ? 2.4 : 1.6], ['cabin', 2], ['sail', warm ? 2 : 1.6], ['pontoon', cold ? 1 : 1.4], ['lobster', cold ? 2.2 : 0.8]];
}
export const pickFrom = <T,>(mix: [T, number][], u: number): T => {
  const tot = mix.reduce((a, [, w]) => a + w, 0);
  let x = u * tot;
  for (const [t, w] of mix) if ((x -= w) <= 0) return t;
  return mix[mix.length - 1][0];
};
