// The camper van — your home on the road (docs/agent/gameplay.md "The van"). A high-roof panel
// van fitted out as a camper: two-tone paint, a roof rack with a solar panel, a rolled awning,
// curtained windows along the back, an open cab (seats, dash, wheel) behind a curtain, and two
// barn doors at the back that swing right round against its sides.
//
// The back doorway is a real opening: what you see through it is the room (src/van/), which is
// bigger than the van — the doorway is the seam between the two. So the body is built as panels
// round the cargo box, not one closed extrusion, and the doors are their own geometry, turned on
// their hinges by the van (src/van/van.ts).
//
// Output contract (src/assets/core.ts): non-indexed geometry with `color` and `aPart` (0 body,
// 3 head lamps, 4 tail lamps); metres; y up; the front toward −z; the origin on the ground under
// the middle of the body.
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { part, merge, box, profile, validGeometry } from './core';

/** Lower-body paints, picked by seed: sea-foam, butter, burnt orange, sky, sage, cherry. */
export const CAMPER_PAINTS = [0x79aca6, 0xe3b552, 0xcf6a3c, 0x76a0cf, 0x7f9a6e, 0xa8443f] as const;

export interface CamperRecipe {
  seed: number;
  L: number; // body length
  W: number; // body width
  H: number; // roof height
  floor: number; // the cargo floor's height (the back doorway's sill)
  wheelR: number;
  belt: number; // the beltline: the bottom of the side windows
  doorW: number; // the back doorway's clear width…
  doorH: number; // …and height over the floor
  paint: number; // the lower body
  cream: number; // the upper body
}

export function camperRecipe(seed = 1): CamperRecipe {
  // the paint by seed, in order (your van, seed 1, the sea-foam one); its sizes breathe a little
  const r = makeRng(seed * 15485863 + 7);
  const paint = CAMPER_PAINTS[(Math.max(1, Math.floor(seed)) - 1) % CAMPER_PAINTS.length];
  const j = (v: number, a: number) => v * (1 + (r.float() * 2 - 1) * a);
  return validateCamper({ seed, L: seed === 1 ? 5.6 : j(5.6, 0.02), W: 2.02, H: 2.72, floor: 0.58, wheelR: 0.37, belt: 1.2, doorW: 1.5, doorH: 1.95, paint, cream: 0xf3ead6 });
}

/** The recipe's sizes kept to a van a person walks into: the doorway clears a walker's head
 *  (eye 1.65 m) by 0.3 m and leaves a post each side; the roof stands over the doorway. */
export function validateCamper(c: CamperRecipe): CamperRecipe {
  c.doorH = Math.max(1.95, Math.min(c.doorH, c.H - c.floor - 0.12));
  c.doorW = Math.max(1.0, Math.min(c.doorW, c.W - 0.4));
  return c;
}

/** Key heights and stations along the van (van-local metres), shared by the body, the room and
 *  the colliders so they agree to the centimetre. */
export function camperFrame(c: CamperRecipe) {
  const zf = -c.L / 2, zr = c.L / 2;
  return {
    zf, zr,
    zHood: zf + 0.72, // the windshield's foot
    zScreenTop: zf + 1.42, // the windshield's head
    zB: zf + 2.0, // the B-pillar: the cab ends, the cargo box begins (the curtain)
    axleF: zf + 0.95, axleR: zr - 1.25,
    hoodY: 1.2, screenTopY: 2.28,
    /** the steering wheel's hub (van-local), its column leaning back by `tilt` */
    steer: { x: -0.48, y: 1.24, z: zf + 0.72 + 0.5, tilt: -0.45 },
    doorTop: c.floor + c.doorH,
    post: (c.W - c.doorW) / 2, // each post's width beside the doorway
  };
}

export const CAMPER_BUDGET = 16000; // vertices: one van in the world, seen from two metres

/** The body (everything but the two back doors) and one door leaf. The leaf is built for the
 *  right-hand door: its hinge on the y axis at the origin, the leaf reaching toward −x, its outer
 *  face toward +z; the van mirrors it for the left. */
export function camperGeometry(c: CamperRecipe): { body: THREE.BufferGeometry; left: THREE.BufferGeometry; right: THREE.BufferGeometry; rear: THREE.BufferGeometry; leaf: THREE.BufferGeometry; wheel: THREE.BufferGeometry } {
  const F = camperFrame(c);
  const { W, H, floor, belt } = c;
  const { zf, zr, zHood, zScreenTop, zB } = F;
  const hw = W / 2, R = c.wheelR, T = 0.05; // T: a panel's thickness
  const P: THREE.BufferGeometry[] = [];
  const paint = c.paint, cream = c.cream;
  const trim = 0x2b2c30, dark = 0x1d1e21, chrome = 0xb9bcc0, glassDark = 0x334455;
  const stripe = new THREE.Color(paint).multiplyScalar(0.72).getHex();
  const curtain = 0xd9c7a3, seat = 0x4a4f57, dash = 0x3a3c40;
  const add = (g: THREE.BufferGeometry, hex: number, id = 0) => P.push(part(g, hex, id));
  const sill = 0.36; // the bottom of the bodywork over the road
  const sides: THREE.BufferGeometry[] = []; // the cargo box's two sides: their own geometry (van.ts draws each only from its own side)

  // ---- the floor pan and sills: closed under the whole cargo box and cab (its top 1.5 cm under the
  // floor: the doorway's passage (src/van/room.ts) has its own floor at the floor's height)
  add(box(W - 0.04, floor - 0.015 - sill, zr - (zf + 0.55), 0, (floor - 0.015 + sill) / 2, (zr + zf + 0.55) / 2), paint);
  // ---- the nose: bumper, grille and a short sloping hood (a profile across the width)
  const nose: [number, number][] = [[zf + 0.05, sill - 0.02], [zf, 0.5], [zf + 0.02, 0.92], [zf + 0.2, 1.04], [zHood, F.hoodY], [zHood + 0.06, F.hoodY - 0.04], [zHood + 0.06, sill - 0.02]];
  add(profile(nose, W, 0.08, 2), paint);
  // the cab's sides below the windows (the doors' outer skin), from the hood back to the B-pillar
  for (const s of [-1, 1]) add(box(T, belt - sill, zB - zHood, s * (hw - T / 2), (belt + sill) / 2, (zB + zHood) / 2), paint);
  // the cargo box's sides: the paint below the belt, the cream above, a stripe between. Their
  // faces toward the inside are left out: through the back doorway you see the room, and through
  // the room's windows (where the room shows nothing) the world beyond the van's side — never the
  // inside of its panels (src/van/van.ts, the portal)
  for (const s of [-1, 1]) {
    const x = s * (hw - T / 2), z0 = zB, z1 = zr - 0.02;
    const side: THREE.BufferGeometry[] = [];
    const sadd = (g: THREE.BufferGeometry, hex: number, id = 0) => side.push(part(g, hex, id));
    sadd(box(T, belt - sill, z1 - z0, x, (belt + sill) / 2, (z0 + z1) / 2), paint);
    sadd(box(T + 0.006, 0.07, z1 - z0, x, belt + 0.035, (z0 + z1) / 2), stripe);
    sadd(box(T, H - 0.1 - (belt + 0.07), z1 - z0, x, (H - 0.1 + belt + 0.07) / 2, (z0 + z1) / 2), cream);
    // the cab's pillars and roof rail above its open windows: A (along the windshield), B
    const aLen = Math.hypot(zScreenTop - zHood, F.screenTopY - F.hoodY);
    const aPillar = box(0.065, aLen, 0.075, 0, aLen / 2, 0); // (dark, like the windshield's surround: thin from the seat)
    aPillar.rotateX(Math.atan2(zScreenTop - zHood, F.screenTopY - F.hoodY)); // (its tip back toward +z)
    aPillar.translate(s * (hw - 0.04), F.hoodY, zHood);
    add(aPillar, trim);
    sadd(box(T, H - 0.1 - belt, 0.12, x, (H - 0.1 + belt) / 2, zB - 0.06), cream); // B-pillar
    add(box(T, H - 0.1 - (F.screenTopY - 0.08), zB - zScreenTop + 0.02, x, (H - 0.1 + F.screenTopY - 0.08) / 2, (zB + zScreenTop) / 2), cream); // over the door glass
    // a window along the back, curtained (closed from outside: you never see into the van)
    const wz0 = zB + 0.55, wz1 = zr - 0.85;
    sadd(box(T + 0.02, 0.66, wz1 - wz0 + 0.08, x, 1.69, (wz0 + wz1) / 2), trim); // its rubber frame
    sadd(box(T + 0.03, 0.58, wz1 - wz0, x, 1.69, (wz0 + wz1) / 2), glassDark);
    for (let k = 0; k < 7; k++) { // the curtain behind the glass, gathered in folds
      const z = wz0 + 0.06 + ((wz1 - wz0 - 0.12) * k) / 6;
      sadd(box(T + 0.035, 0.52, 0.09, x, 1.69, z), k % 2 ? curtain : new THREE.Color(curtain).multiplyScalar(0.88).getHex());
    }
    if (s > 0) {
      // the sliding door's seams on the kerb side, and its handle
      for (const z of [zB + 0.08, zB + 1.32]) sadd(box(T + 0.008, H - 0.16 - sill, 0.012, x, (H - 0.16 + sill) / 2, z), trim);
      sadd(box(T + 0.03, 0.035, 0.2, x, belt - 0.12, zB + 1.2), chrome);
    }
    sides.push(dropFacing(merge(side), -s, 0, 0));
    // the cab door's seam and handle
    add(box(T + 0.008, belt - sill - 0.08, 0.012, x, (belt + sill) / 2, zB - 0.02), trim);
    add(box(T + 0.03, 0.035, 0.16, x, belt - 0.1, zB - 0.22), chrome);
    // a big van mirror on an arm
    add(box(0.18, 0.03, 0.03, s * (hw + 0.09), 1.42, zHood + 0.2), trim);
    add(box(0.06, 0.32, 0.2, s * (hw + 0.2), 1.42, zHood + 0.2), trim);
    add(box(0.012, 0.28, 0.17, s * (hw + 0.2 - 0.035 * s), 1.42, zHood + 0.2), 0x8fa3b5);
  }
  // ---- the roof: the high roof over cab and box, its front cap rounded down to the windshield
  add(box(W, 0.1, zr - zScreenTop - 0.3, 0, H - 0.05, (zr + zScreenTop + 0.3) / 2), 0xf7f3ea);
  const cap: [number, number][] = [[zScreenTop - 0.06, F.screenTopY - 0.04], [zScreenTop + 0.02, F.screenTopY + 0.14], [zScreenTop + 0.12, H - 0.12], [zScreenTop + 0.26, H - 0.01], [zScreenTop + 0.36, H], [zScreenTop + 0.36, F.screenTopY - 0.04]];
  add(profile(cap, W, 0.06, 2), 0xf7f3ea);
  // the windshield's head rail and the dash's top under it
  add(box(W - 0.12, 0.07, 0.07, 0, F.screenTopY - 0.02, zScreenTop - 0.02), trim);
  // roof rack: two rails and crossbars, a solar panel between
  for (const s of [-1, 1]) add(box(0.04, 0.05, zr - zScreenTop - 0.7, s * (hw - 0.16), H + 0.08, (zr + zScreenTop + 0.4) / 2), trim);
  for (let z = zScreenTop + 0.6; z < zr - 0.2; z += 0.75) add(box(W - 0.3, 0.035, 0.04, 0, H + 0.115, z), trim);
  add(box(1.05, 0.035, 1.65, 0, H + 0.15, (zB + zr) / 2 - 0.2), 0x2e3f63);
  add(box(1.09, 0.02, 1.69, 0, H + 0.13, (zB + zr) / 2 - 0.2), chrome);
  // the rolled awning along the kerb side, under the roof's edge
  {
    const g = new THREE.CylinderGeometry(0.075, 0.075, zr - zB - 0.4, 10).rotateX(Math.PI / 2).translate(hw + 0.06, H - 0.2, (zr + zB) / 2);
    add(g, 0xece6d8);
    add(box(0.05, 0.06, zr - zB - 0.4, hw + 0.03, H - 0.12, (zr + zB) / 2), trim);
  }
  // ---- the back: two posts beside the doorway and the header over it (the doors are separate)
  // (a centimetre clear of the doorway's passage, whose faces stand at the opening's edges)
  for (const s of [-1, 1]) {
    const pw = F.post - 0.012, x = s * (hw - pw / 2);
    add(box(pw, H - 0.1 - sill, 0.08, x, (H - 0.1 + sill) / 2, zr - 0.04), cream);
    add(box(pw + 0.004, belt - sill - 0.02, 0.084, x, (belt + sill) / 2, zr - 0.04), paint);
    add(box(0.14, 0.42, 0.03, s * (hw - 0.09), 1.0, zr + 0.01), 0x9a1c1c, 4); // tail lamps, up the posts
    add(box(0.14, 0.08, 0.031, s * (hw - 0.09), 0.74, zr + 0.01), 0xd87a2a, 4);
  }
  add(box(c.doorW + 0.02, H - 0.1 - F.doorTop - 0.012, 0.08, 0, (H - 0.1 + F.doorTop + 0.012) / 2, zr - 0.04), cream);
  add(box(c.doorW + 0.04, 0.04, 0.05, 0, F.doorTop + 0.035, zr - 0.015), trim); // the door seal over the opening
  add(box(0.32, 0.04, 0.04, 0, H - 0.17, zr + 0.01), 0x9a1c1c, 4); // the high brake lamp
  // the rear bumper, and the step on it into the doorway: their own geometry (you see them from
  // inside, looking down out of the doorway, when the rest of the van isn't drawn)
  const Rp: THREE.BufferGeometry[] = [];
  Rp.push(part(box(W + 0.03, 0.2, 0.2, 0, 0.38, zr + 0.06), trim));
  Rp.push(part(box(c.doorW - 0.1, 0.045, 0.3, 0, 0.3, zr + 0.17), 0x5a5c60));
  for (let i = -3; i <= 3; i++) Rp.push(part(box(0.04, 0.012, 0.27, i * 0.18, 0.328, zr + 0.17), 0x3a3c40)); // its tread
  const rear = merge(Rp);
  // ---- the front: bumper, grille, lamps, the plate
  add(box(W + 0.03, 0.22, 0.2, 0, 0.42, zf + 0.05), trim);
  add(box(W * 0.6, 0.24, 0.04, 0, 0.78, zf + 0.012), dark);
  for (let i = 0; i < 3; i++) add(box(W * 0.58, 0.018, 0.045, 0, 0.7 + i * 0.075, zf + 0.004), chrome);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14).rotateX(Math.PI / 2).translate(s * (hw - 0.27), 0.86, zf + 0.03), 0xf6f1da, 3);
    add(new THREE.CylinderGeometry(0.135, 0.135, 0.035, 14).rotateX(Math.PI / 2).translate(s * (hw - 0.27), 0.86, zf + 0.045), chrome);
    add(box(0.12, 0.05, 0.04, s * (hw - 0.27), 0.68, zf + 0.02), 0xd87a2a, 3);
  }
  add(box(0.5, 0.11, 0.02, 0, 0.42, zf - 0.06), 0xf2efe6);
  // ---- the cab inside: floor, dash, wheel, two seats, the curtain behind them
  add(box(W - 0.12, 0.04, zB - zHood, 0, 0.52, (zB + zHood) / 2), dash);
  add(box(W - 0.14, 0.24, 0.4, 0, 1.0, zHood + 0.18), dash);
  add(box(W - 0.16, 0.05, 0.46, 0, 1.14, zHood + 0.22), 0x4a4c50);
  // (the column; the wheel itself is its own geometry: it turns with the road — van.ts)
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.36, 6).rotateX(-0.45 + Math.PI / 2).translate(F.steer.x, F.steer.y - 0.1, F.steer.z - 0.12), dark);
  // the dash's dials and the gear stick, the sun visors, the rear-view mirror
  for (const dx of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 14).rotateX(Math.PI / 2 - 0.5).translate(F.steer.x + dx, 1.12, zHood + 0.3), 0xd9d3c0); // (pale dials…)
  add(box(0.44, 0.07, 0.2, F.steer.x, 1.2, zHood + 0.26), 0x2b2c30); // (…under the binnacle's hood)
  add(box(0.05, 0.22, 0.05, 0, 0.95, zB - 0.62), dark);
  for (const s of [-1, 1]) add(box(0.55, 0.03, 0.22, s * 0.48, F.screenTopY - 0.1, zScreenTop + 0.12), 0x5a5c60);
  add(box(0.24, 0.07, 0.03, 0, F.screenTopY - 0.16, zScreenTop + 0.08), 0x2b2c30);
  for (const s of [-1, 1]) {
    const x = s * 0.48, z = zB - 0.36;
    add(box(0.5, 0.12, 0.5, x, 0.86, z - 0.04), seat);
    add(box(0.5, 0.42, 0.1, x, 0.78, z), dark); // the base
    const back = box(0.48, 0.72, 0.12, 0, 0.36, 0);
    back.rotateX(0.14).translate(x, 0.92, z + 0.24);
    add(back, seat);
    add(box(0.26, 0.18, 0.1, x, 1.68, z + 0.33), seat); // the headrest
  }
  // the curtain across the cab's back: gathered folds, floor to roof
  for (let k = 0; k < 11; k++) {
    const x = -hw + 0.1 + ((W - 0.2) * k) / 10;
    add(box(0.2, H - 0.62, 0.05, x, (H - 0.12 + 0.5) / 2, zB + 0.03 + (k % 2) * 0.03), k % 2 ? curtain : new THREE.Color(curtain).multiplyScalar(0.86).getHex());
  }
  // ---- the wheels, under dark arches
  const wheel = (x: number, z: number) => {
    const side = Math.sign(x);
    add(new THREE.CylinderGeometry(R, R, 0.24, 16, 1, true).rotateZ(Math.PI / 2).translate(x, R, z), dark);
    add(new THREE.RingGeometry(R * 0.6, R, 16, 1).rotateY((side * Math.PI) / 2).translate(x + (side * 0.24) / 2, R, z), 0x232427);
    add(new THREE.CircleGeometry(R * 0.6, 14).rotateY((side * Math.PI) / 2).translate(x + side * (0.12 - 0.03), R, z), 0xd9d6cc);
    add(new THREE.CircleGeometry(R * 0.2, 8).rotateY((side * Math.PI) / 2).translate(x + side * (0.12 - 0.02), R, z), 0x7a7d82);
    add(new THREE.CircleGeometry(R + 0.08, 12, 0, Math.PI).rotateY((side * Math.PI) / 2).translate(side * (hw + 0.004), R, z), 0x151618);
  };
  for (const s of [-1, 1]) for (const z of [F.axleF, F.axleR]) wheel(s * (hw - 0.13), z);
  const body = merge(P);

  // ---- a door leaf (the right-hand one): its outer skin two-tone like the van, a curtained
  // window in its upper half, a handle by its free edge; its inner face plain wood-brown
  const lw = hw, lh = H - 0.06 - 0.42, LT = 0.06;
  const Lp: THREE.BufferGeometry[] = [];
  const la = (g: THREE.BufferGeometry, hex: number, id = 0) => Lp.push(part(g, hex, id));
  const y0 = 0.42;
  la(box(lw, belt - y0, LT, -lw / 2, (belt + y0) / 2, 0), paint);
  la(box(lw + 0.004, 0.07, LT + 0.006, -lw / 2, belt + 0.035, 0), stripe);
  la(box(lw, y0 + lh - belt - 0.07, LT, -lw / 2, (y0 + lh + belt + 0.07) / 2, 0), cream);
  la(box(lw - 0.3, 0.6, LT + 0.02, -lw / 2 - 0.04, 1.8, 0), trim);
  la(box(lw - 0.36, 0.52, LT + 0.03, -lw / 2 - 0.04, 1.8, 0), glassDark);
  for (let k = 0; k < 4; k++) la(box(0.12, 0.46, LT + 0.034, -0.26 - k * 0.15, 1.8, 0), k % 2 ? curtain : new THREE.Color(curtain).multiplyScalar(0.88).getHex());
  la(box(0.18, 0.04, 0.04, -lw + 0.16, belt - 0.15, LT / 2 + 0.02), chrome);
  la(box(lw - 0.06, lh - 0.06, 0.012, -lw / 2, y0 + lh / 2, -LT / 2 - 0.006), 0x8a6a4c); // the inner face
  for (const y of [y0 + 0.25, y0 + lh - 0.3]) la(box(0.05, 0.12, 0.08, -0.02, y, 0), trim); // hinges
  const leaf = merge(Lp);
  // the steering wheel, about its own hub (its axis along z): a rim, a hub and three spokes
  const Wp: THREE.BufferGeometry[] = [];
  Wp.push(part(new THREE.TorusGeometry(0.19, 0.024, 6, 20), 0x1d1e21));
  Wp.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateX(Math.PI / 2), 0x2b2c30));
  for (const a of [Math.PI / 2, Math.PI * 1.17, -Math.PI * 0.17]) Wp.push(part(box(0.17, 0.03, 0.02, 0.095, 0, 0).rotateZ(a), 0x2b2c30));
  const steering = merge(Wp);
  return { body, left: sides[0], right: sides[1], rear, leaf, wheel: steering };
}

/** The geometry less its triangles facing (nx, ny, nz) (flat-shaded boxes: each face's normal). */
function dropFacing(g: THREE.BufferGeometry, nx: number, ny: number, nz: number) {
  const nor = g.getAttribute('normal'), keep: number[] = [];
  for (let t = 0; t + 2 < nor.count; t += 3) if (nor.getX(t) * nx + nor.getY(t) * ny + nor.getZ(t) * nz < 0.5) keep.push(t, t + 1, t + 2);
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name), sz = a.itemSize, arr = new Float32Array(keep.length * sz);
    keep.forEach((v, i) => { for (let k = 0; k < sz; k++) arr[i * sz + k] = a.array[v * sz + k]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  return out;
}

/** Within its box (5.9 × 2.9 × 3.0 m, mirrors and rack included), grounded, finite. */
export function camperValid(c: CamperRecipe) {
  const { body, left, right, rear, leaf } = camperGeometry(c);
  return validGeometry(body, { w: W_MAX, h: 3.0, d: 5.95 }) && [left, right].every((g) => validGeometry(g, { w: 1.2, h: 3.0, d: 4.0 }, 0.4)) && validGeometry(rear, { w: W_MAX, h: 0.6, d: 0.6 }, 0.4) && validGeometry(leaf, { w: 1.1, h: 3.0, d: 0.2 }, 3) && camperVerts(c) <= CAMPER_BUDGET;
}
/** All its vertices: the body, the bumper and step, both doors. */
export function camperVerts(c: CamperRecipe) {
  const g = camperGeometry(c);
  return [g.body, g.left, g.right, g.rear, g.wheel].reduce((n, x) => n + x.getAttribute('position').count, 0) + 2 * g.leaf.getAttribute('position').count;
}
const W_MAX = 2.9;
