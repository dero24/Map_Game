// The camper van — your home on the road (docs/agent/gameplay.md "The van"). A high-roof panel
// van fitted out as a camper: two-tone paint, a roof rack with a solar panel, a rolled awning,
// windows along the back with their curtains tied open, an open cab behind a curtain, and two barn
// doors at the back that swing right round against its sides. The cab is built to sit in and look
// round: captain's chairs (a blanket over the passenger's), the doors' vinyl cards, the dash with its
// binnacle and dials, vents, the radio, the glovebox, a nav screen on its mount (src/van/dashMap.ts
// draws on it), things on the dash, a charm under the mirror, and the room's red curtain behind.
//
// The back doorway is a real opening, and so are the windows along the back and in the doors: what
// you see through them is the room (src/van/), which is bigger than the van — the openings are the
// seam between the two. So the body is built as panels round the cargo box, not one closed
// extrusion, the windows holes right through (`win`; each with a pane that only casts the van's
// shadow), and the doors are their own geometry, turned on their hinges by the van (src/van/van.ts).
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
    zB: zf + 2.0, // the B-pillar: the cab's doors end, the cargo box begins
    zC: zf + 2.42, // the curtain to the back, a little way behind the seats (the room's way through)
    axleF: zf + 0.95, axleR: zr - 1.25,
    hoodY: 1.2, screenTopY: 2.28,
    /** the steering wheel's hub (van-local), its column leaning back by `tilt` */
    steer: { x: -0.48, y: 1.24, z: zf + 0.72 + 0.5, tilt: -0.45 },
    doorTop: c.floor + c.doorH,
    post: (c.W - c.doorW) / 2, // each post's width beside the doorway
    /** a panel's thickness (the cargo box's sides: the windows' faces stand at its inside) */
    panel: 0.05,
    /** the cargo box's side windows, the same each side: the clear opening along z and up y */
    win: { z0: zf + 2.55, z1: zr - 0.85, y0: 1.4, y1: 1.98 },
    /** the back doors' windows, in a leaf's own frame (camperGeometry's leaf: u along it from the
     *  hinge, toward −x; y up) */
    leafWin: { u0: -c.W / 4 - 0.04 - (c.W / 2 - 0.36) / 2, u1: -c.W / 4 - 0.04 + (c.W / 2 - 0.36) / 2, y0: 1.54, y1: 2.06 },
    /** the binnacle's face, before the wheel under its cowl (van-local middle, size), tilted back
     *  toward the driver by `tilt` (its up the face: (0, cos, −sin); out of it: (0, sin, cos)) */
    cluster: { x: -0.48, y: 1.025, z: zf + 0.72 + 0.34, w: 0.56, h: 0.148, tilt: 0.5 },
    /** its dials, along the face (du across, dv up it, radius): the speedometer and the rev counter
     *  (their needles live: van.ts), the fuel and the temperature */
    dials: [{ du: -0.095, dv: 0.004, r: 0.052 }, { du: 0.095, dv: 0.004, r: 0.052 }, { du: -0.225, dv: -0.012, r: 0.028 }, { du: 0.225, dv: -0.012, r: 0.028 }],
    /** the nav screen on its mount on the dash (van-local middle of its glass, size), turned to the
     *  driver: Euler 'YXZ' (tilt, yaw) — its glass faces (R · +z) */
    screen: { x: -0.1, y: 1.31, z: zf + 0.72 + 0.36, w: 0.26, h: 0.155, tilt: -0.4, yaw: -0.36 },
    /** where the charm under the rear-view mirror hangs from (it swings: van.ts) */
    charm: { x: 0, y: 2.085, z: zf + 1.42 + 0.08 },
  };
}

/** A rectangle [ua, ub] × [ya, yb] less a hole inside it, as four rectangles round the hole (below
 *  and above it the whole width, beside it the hole's height). */
export function around(ua: number, ub: number, ya: number, yb: number, h: { u0: number; u1: number; y0: number; y1: number }) {
  return [
    { u0: ua, u1: ub, y0: ya, y1: h.y0 }, { u0: ua, u1: ub, y0: h.y1, y1: yb },
    { u0: ua, u1: h.u0, y0: h.y0, y1: h.y1 }, { u0: h.u1, u1: ub, y0: h.y0, y1: h.y1 },
  ].filter((r) => r.u1 - r.u0 > 1e-4 && r.y1 - r.y0 > 1e-4);
}

export const CAMPER_BUDGET = 24000; // vertices: one van in the world, its cab seen from the seat
/** A live dial's sweep (rad): from its low end, down at the left, round over the top to its high end. */
export const DIAL_SWEEP = Math.PI * 1.5;

/** The body (everything but the two back doors) and one door leaf. The leaf is built for the
 *  right-hand door: its hinge on the y axis at the origin, the leaf reaching toward −x, its outer
 *  face toward +z; the van mirrors it for the left. `panes` (both sides' windows) and `leafPane`
 *  fill the windows' holes for the sun's shadow alone (van.ts never draws them). */
export function camperGeometry(c: CamperRecipe): { body: THREE.BufferGeometry; left: THREE.BufferGeometry; right: THREE.BufferGeometry; rear: THREE.BufferGeometry; leaf: THREE.BufferGeometry; wheel: THREE.BufferGeometry; panes: THREE.BufferGeometry; leafPane: THREE.BufferGeometry; driverBack: THREE.BufferGeometry; needle: THREE.BufferGeometry; charm: THREE.BufferGeometry } {
  const F = camperFrame(c);
  const { W, H, floor, belt } = c;
  const { zf, zr, zHood, zScreenTop, zB } = F;
  const hw = W / 2, R = c.wheelR, T = F.panel; // T: a panel's thickness
  const P: THREE.BufferGeometry[] = [];
  const paint = c.paint, cream = c.cream;
  const trim = 0x2b2c30, dark = 0x1d1e21, chrome = 0xb9bcc0;
  const stripe = new THREE.Color(paint).multiplyScalar(0.72).getHex();
  const seat = 0x4a4f57, seatDark = 0x3d4148, dash = 0x3a3c40, vinyl = 0xbcae96, wood = 0xb48a5a;
  // the windows' curtains: the room's own mustard and red tie-backs (src/van/room.ts), so they read as
  // cloth against the cream, and the van looks like the room it holds
  const drape = 0xd8a640, drapeDark = new THREE.Color(drape).multiplyScalar(0.82).getHex(), tie = 0xa6382f;
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
  // faces toward the inside are left out: through the back doorway and the windows you see the
  // room, and through the room's windows (where the room shows nothing) the world beyond the van's
  // side — never the inside of its panels (src/van/van.ts, the portal)
  const wn = F.win, fw = 0.04; // (fw: the windows' rubber frame)
  const sideHole = { u0: wn.z0 - fw, u1: wn.z1 + fw, y0: wn.y0 - fw, y1: wn.y1 + fw };
  for (const s of [-1, 1]) {
    const x = s * (hw - T / 2), z0 = zB, z1 = zr - 0.02;
    const side: THREE.BufferGeometry[] = [];
    const sadd = (g: THREE.BufferGeometry, hex: number, id = 0) => side.push(part(g, hex, id));
    // (a rectangle on the side: u along z, y up, d deep across it)
    const slab = (r: { u0: number; u1: number; y0: number; y1: number }, d: number, hex: number) => sadd(box(d, r.y1 - r.y0, r.u1 - r.u0, x, (r.y0 + r.y1) / 2, (r.u0 + r.u1) / 2), hex);
    sadd(box(T, belt - sill, z1 - z0, x, (belt + sill) / 2, (z0 + z1) / 2), paint);
    sadd(box(T + 0.006, 0.07, z1 - z0, x, belt + 0.035, (z0 + z1) / 2), stripe);
    // the cream above, round the window: an opening right through it
    for (const r of around(z0, z1, belt + 0.07, H - 0.1, sideHole)) slab(r, T, cream);
    // the cab's pillars and roof rail above its open windows: A (along the windshield), B
    const aLen = Math.hypot(zScreenTop - zHood, F.screenTopY - F.hoodY);
    const aPillar = box(0.065, aLen, 0.075, 0, aLen / 2, 0); // (dark, like the windshield's surround: thin from the seat)
    aPillar.rotateX(Math.atan2(zScreenTop - zHood, F.screenTopY - F.hoodY)); // (its tip back toward +z)
    aPillar.translate(s * (hw - 0.04), F.hoodY, zHood);
    add(aPillar, trim);
    // the B-pillar (the cab's: seen from the seat too), its vinyl inside, the seat belt hung on it
    add(box(T, H - 0.1 - belt, 0.12, x, (H - 0.1 + belt) / 2, zB - 0.06), cream);
    add(box(0.024, H - 0.12 - belt, 0.14, s * (hw - T - 0.012), (H - 0.12 + belt) / 2, zB - 0.07), vinyl);
    add(box(0.008, 0.95, 0.05, s * (hw - T - 0.03), belt + 0.5, zB - 0.09), dark);
    add(box(T, H - 0.1 - (F.screenTopY - 0.08), zB - zScreenTop + 0.02, x, (H - 0.1 + F.screenTopY - 0.08) / 2, (zB + zScreenTop) / 2), cream); // over the door glass
    // the window along the back: its rubber frame lining the opening, and the curtains open,
    // gathered at its ends and tied back — standing in the opening, in front of what shows in it
    for (const r of around(wn.z0 - fw, wn.z1 + fw, wn.y0 - fw, wn.y1 + fw, { u0: wn.z0, u1: wn.z1, y0: wn.y0, y1: wn.y1 })) slab(r, T + 0.02, trim);
    for (const [e, dir] of [[wn.z0, 1], [wn.z1, -1]]) {
      for (let k = 0; k < 2; k++) sadd(box(0.02, wn.y1 - wn.y0 - 0.01, 0.085, s * (hw - T + 0.013), (wn.y0 + wn.y1) / 2, e + dir * (0.045 + k * 0.075)), k % 2 ? drape : drapeDark);
      sadd(box(0.03, 0.045, 0.19, s * (hw - T + 0.025), (wn.y0 + wn.y1) / 2 - 0.05, e + dir * 0.085), tie);
    }
    if (s > 0) {
      // the sliding door's seams on the kerb side (the back one through the window: a post there,
      // a pane each side of it), and its handle
      const zs = zB + 1.32;
      sadd(box(T + 0.008, H - 0.16 - sill, 0.012, x, (H - 0.16 + sill) / 2, zB + 0.08), trim);
      sadd(box(T + 0.008, wn.y0 - fw - sill, 0.012, x, (wn.y0 - fw + sill) / 2, zs), trim);
      sadd(box(T + 0.008, H - 0.16 - (wn.y1 + fw), 0.012, x, (H - 0.16 + wn.y1 + fw) / 2, zs), trim);
      slab({ u0: zs - fw / 2, u1: zs + fw / 2, y0: wn.y0, y1: wn.y1 }, T + 0.02, trim);
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
  // ---- the cab inside: you sit in it and look round it (src/van/van.ts seat) ----
  add(box(W - 0.12, 0.04, zB - zHood, 0, 0.52, (zB + zHood) / 2), dash); // the floor
  // the dash: its body, cut back on the driver's side where the binnacle sits; a padded top with a
  // rolled edge; the knee panel under it
  const cl = F.cluster, xCut = cl.x + cl.w / 2 + 0.02, xl = -hw + 0.07, xr = hw - 0.07, dz0 = zHood - 0.02;
  add(box(xCut - xl, 0.24, 0.31, (xCut + xl) / 2, 1.0, dz0 + 0.155), dash);
  add(box(xr - xCut, 0.24, 0.4, (xr + xCut) / 2, 1.0, dz0 + 0.2), dash);
  add(box(W - 0.16, 0.045, 0.42, 0, 1.1425, zHood + 0.19), 0x4a4c50);
  add(new THREE.CylinderGeometry(0.024, 0.024, W - 0.18, 8).rotateZ(Math.PI / 2).translate(0, 1.14, zHood + 0.4), 0x4a4c50);
  add(box(W - 0.3, 0.3, 0.1, 0, 0.73, zHood + 0.12), dash);
  // the binnacle: its face tilted back to you, four dials on it (the speedometer's and the rev
  // counter's needles are their own: they move — van.ts), a cowl over it
  const ct = cl.tilt, cu = [Math.cos(ct), -Math.sin(ct)], cn = [Math.sin(ct), Math.cos(ct)];
  const onFace = (g: THREE.BufferGeometry, du: number, dv: number, lift: number) => g.rotateX(-ct).translate(cl.x + du, cl.y + cu[0] * dv + cn[0] * lift, cl.z + cu[1] * dv + cn[1] * lift);
  add(onFace(box(cl.w, cl.h, 0.012, 0, 0, 0), 0, 0, -0.006), 0x232427);
  F.dials.forEach((d, i) => {
    add(onFace(new THREE.CylinderGeometry(d.r + 0.007, d.r + 0.007, 0.01, 18).rotateX(Math.PI / 2), d.du, d.dv, 0.002), chrome);
    add(onFace(new THREE.CylinderGeometry(d.r, d.r, 0.01, 18).rotateX(Math.PI / 2), d.du, d.dv, 0.004), 0xe8e1cc);
    const n = i < 2 ? 9 : 3, sweep = i < 2 ? DIAL_SWEEP : 1.6;
    for (let k = 0; k < n; k++) add(onFace(box(0.004, d.r * 0.22, 0.003, 0, d.r * 0.78, 0).rotateZ(sweep / 2 - (sweep * k) / (n - 1)), d.du, d.dv, 0.0105), 0x2b2c30);
    if (i >= 2) add(onFace(box(0.004, d.r * 0.8, 0.002, 0, d.r * 0.4, 0).rotateZ(i === 2 ? -0.62 : 0.05), d.du, d.dv, 0.012), 0xc23b2b); // (fuel: full; warm)
  });
  add(box(cl.w + 0.06, 0.05, 0.16, cl.x, 1.19, zHood + 0.26), 0x2b2c30);
  // (the column; the wheel itself is its own geometry: it turns with the road — van.ts)
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.36, 6).rotateX(-0.45 + Math.PI / 2).translate(F.steer.x, F.steer.y - 0.1, F.steer.z - 0.12), dark);
  // the middle of the dash: two round vents, the radio (its tape slot, its dial lit amber, two
  // knobs), the hazard switch, the heater's three knobs; a vent at each end; the glovebox
  const mx = 0.04, mz = zHood + 0.385;
  const vent = (x: number, y: number, z: number) => {
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12).rotateX(Math.PI / 2).translate(x, y, z), 0x1d1e21);
    add(new THREE.CylinderGeometry(0.029, 0.029, 0.022, 12).rotateX(Math.PI / 2).translate(x, y, z), 0x111214);
    for (const dy of [-0.012, 0.012]) add(box(0.054, 0.005, 0.01, x, y + dy, z + 0.008), 0x6a6c70);
  };
  add(box(0.32, 0.25, 0.015, mx, 0.985, mz), 0x2b2c30);
  for (const dx of [-0.08, 0.08]) vent(mx + dx, 1.07, mz + 0.01);
  vent(xl + 0.1, 1.04, dz0 + 0.31 + 0.01);
  vent(xr - 0.1, 1.04, dz0 + 0.4 + 0.01);
  add(box(0.22, 0.055, 0.02, mx, 0.99, mz + 0.012), 0x3a3c40);
  add(box(0.11, 0.008, 0.004, mx - 0.02, 1.0, mz + 0.023), 0x111214);
  add(box(0.05, 0.014, 0.003, mx + 0.06, 1.0, mz + 0.023), 0xe8a64a);
  for (const dx of [-0.09, 0.09]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8).rotateX(Math.PI / 2).translate(mx + dx, 0.99, mz + 0.028), chrome);
  add(box(0.028, 0.018, 0.012, mx, 1.033, mz + 0.012), 0xb8352a);
  for (const dx of [-0.08, 0, 0.08]) add(new THREE.CylinderGeometry(0.019, 0.019, 0.018, 10).rotateX(Math.PI / 2).translate(mx + dx, 0.905, mz + 0.016), 0x4a4c50);
  add(box(0.46, 0.15, 0.012, 0.52, 0.97, dz0 + 0.4 + 0.006), 0x45474b);
  add(box(0.07, 0.016, 0.012, 0.52, 1.02, dz0 + 0.4 + 0.014), chrome);
  // the nav screen on its mount (its glass is van.ts's: the live map, src/van/dashMap.ts) — the bezel
  // round it, a stalk down to the dash
  const sc = F.screen, onScreen = (g: THREE.BufferGeometry) => g.rotateX(sc.tilt).rotateY(sc.yaw).translate(sc.x, sc.y, sc.z);
  add(onScreen(box(sc.w + 0.026, sc.h + 0.026, 0.022, 0, 0, -0.0115)), 0x1d1e21);
  add(box(0.036, 0.13, 0.03, sc.x + 0.012, 1.225, sc.z - 0.035), 0x2b2c30);
  // on the dash: a succulent in its pot, a compass ball, a folded paper map
  {
    const px = 0.62, pz = zHood + 0.2;
    add(new THREE.CylinderGeometry(0.034, 0.027, 0.05, 8).translate(px, 1.19, pz), 0xb5653e);
    add(new THREE.CylinderGeometry(0.031, 0.031, 0.006, 8).translate(px, 1.213, pz), 0x4a3526);
    for (let k = 0; k < 7; k++) add(box(0.018, 0.008, 0.045, 0, 0, 0.02).rotateX(-0.5 - (k % 2) * 0.25).rotateY((k * Math.PI * 2) / 7).translate(px, 1.222, pz), k % 2 ? 0x7c9a6a : 0x6a8a5a);
    add(box(0.04, 0.012, 0.04, 0.22, 1.171, zHood + 0.08), 0x2b2c30);
    add(new THREE.SphereGeometry(0.024, 8, 6).translate(0.22, 1.2, zHood + 0.08), 0x1d1e21);
    const fold = (g: THREE.BufferGeometry) => g.rotateY(0.25).translate(0.4, 1.168, zHood + 0.3);
    add(fold(box(0.22, 0.006, 0.13, 0, 0, 0)), 0xeadfc4);
    add(fold(box(0.16, 0.002, 0.008, 0.01, 0.004, 0.02)), 0xa6382f);
    add(fold(box(0.05, 0.002, 0.12, 0.08, 0.004, 0)), 0x8fb3c8);
  }
  // the sun visors, the rear-view mirror on its stalk (the charm under it is its own: it swings)
  for (const s of [-1, 1]) add(box(0.55, 0.03, 0.22, s * 0.48, F.screenTopY - 0.1, zScreenTop + 0.12), 0x5a5c60);
  add(box(0.24, 0.07, 0.03, 0, F.screenTopY - 0.16, zScreenTop + 0.08), 0x2b2c30);
  add(box(0.22, 0.055, 0.004, 0, F.screenTopY - 0.16, zScreenTop + 0.097), 0x8fa3b5);
  add(box(0.016, 0.1, 0.016, 0, F.screenTopY - 0.08, zScreenTop + 0.06), 0x2b2c30);
  add(box(0.2, 0.025, 0.12, 0, H - 0.115, zB - 0.16), 0xfff3d6); // the dome light
  // the doors' insides: a vinyl card (carpet along its foot), the armrest and the pull, a window
  // winder, a map pocket, a speaker; the window's sill along its top
  for (const s of [-1, 1]) {
    const x = s * (hw - T - 0.012), z0 = zHood + 0.08, z1 = zB - 0.04, zm = (z0 + z1) / 2;
    add(box(0.024, 0.66, z1 - z0, x, 0.89, zm), vinyl);
    add(box(0.026, 0.26, z1 - z0, x - s * 0.001, 0.69, zm), 0x55504a);
    add(box(0.07, 0.045, 0.34, x - s * 0.045, 0.98, zB - 0.45), 0x8f846f);
    add(box(0.016, 0.03, 0.12, x - s * 0.013, 1.06, zB - 0.62), dark);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 8).rotateZ(Math.PI / 2).translate(x - s * 0.02, 1.1, zB - 0.25), chrome);
    add(box(0.012, 0.012, 0.07, x - s * 0.03, 1.1, zB - 0.22), chrome);
    add(box(0.03, 0.12, 0.42, x - s * 0.026, 0.66, zHood + 0.45), 0x4a463f);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12).rotateZ(Math.PI / 2).translate(x - s * 0.016, 0.72, zHood + 0.2), dark);
    add(box(0.05, 0.02, z1 - z0, s * (hw - 0.03), belt + 0.005, zm), dark);
  }
  // between the seats: a console, the gear stick at its front, a mug in its cup holder
  add(box(0.26, 0.3, 0.52, 0, 0.69, zB - 0.42), dark);
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6).translate(0, 0.94, zB - 0.64), chrome);
  add(new THREE.SphereGeometry(0.026, 8, 6).translate(0, 1.05, zB - 0.64), wood);
  for (const dz of [-0.3, -0.18]) add(new THREE.CylinderGeometry(0.042, 0.042, 0.006, 10).translate(0, 0.843, zB + dz), 0x111214);
  add(new THREE.CylinderGeometry(0.038, 0.034, 0.095, 10).translate(0, 0.89, zB - 0.18), 0x3f7f7a);
  add(box(0.012, 0.05, 0.03, 0.045, 0.9, zB - 0.18), 0x3f7f7a);
  // two captain's chairs on their pedestals: a cushion with bolsters, a back with its wings leaning
  // back, a headrest on its posts, an armrest inboard. The driver's back and headrest are their own
  // (`driverBack`: van.ts leaves them out from the driver's own eye — they're behind your head); a
  // striped blanket thrown over the passenger's
  const back: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * 0.48, z = zB - 0.36;
    const to = (g: THREE.BufferGeometry, hex: number) => (s < 0 ? back.push(part(g, hex)) : add(g, hex));
    const lean = (g: THREE.BufferGeometry) => g.rotateX(0.14).translate(x, 0.9, z + 0.22);
    add(box(0.36, 0.26, 0.36, x, 0.67, z - 0.02), dark);
    add(box(0.52, 0.11, 0.5, x, 0.855, z - 0.04), seat);
    for (const e of [-1, 1]) add(box(0.07, 0.05, 0.44, x + e * 0.225, 0.93, z - 0.04), seatDark);
    to(lean(box(0.5, 0.62, 0.12, 0, 0.33, 0)), seat);
    for (const e of [-1, 1]) to(lean(box(0.07, 0.5, 0.1, e * 0.225, 0.3, -0.05)), seatDark);
    to(box(0.27, 0.17, 0.1, x, 1.665, z + 0.33), seat);
    for (const e of [-1, 1]) to(box(0.012, 0.08, 0.012, x + e * 0.07, 1.555, z + 0.32), chrome);
    add(box(0.06, 0.05, 0.36, x - s * 0.29, 1.07, z - 0.02), seatDark);
    add(box(0.03, 0.18, 0.04, x - s * 0.29, 0.98, z + 0.14), dark);
    if (s > 0) {
      [drape, tie, cream, 0x3f7f7a, drape, tie].forEach((hex, i) => add(lean(box(0.53, 0.062, 0.01, 0, 0.29 + i * 0.062, -0.107)), hex));
      add(lean(box(0.53, 0.02, 0.23, 0, 0.64, -0.01)), drape);
      add(lean(box(0.53, 0.26, 0.01, 0, 0.51, 0.068)), tie);
    }
  }
  // behind the seats, a little hall: panelled walls (wood to the waist, cream over it), a rug, a
  // cooler; across its end a panelled partition with a doorway in it, framed in wood, the room's red
  // curtain drawn across it (src/van/room.ts hangs its other side) — beside it a jacket and a hat on
  // their hooks, on its other side a framed picture of the sea over a shelf with a lantern and a book,
  // a clock over the door
  const zC = F.zC, dx0 = -0.35, dx1 = 0.45, dTop = 2.2, dado = 1.24, iw = hw - T + 0.01, trimC = 0x8a6a4c;
  add(box(W - 0.12, 0.04, zC - zB + 0.06, 0, 0.52, (zB + zC + 0.06) / 2), dash);
  add(box(0.8, 0.012, 0.28, (dx0 + dx1) / 2, 0.546, zC - 0.16), 0xa6382f);
  for (const dz of [-0.1, 0.1]) add(box(0.8, 0.013, 0.03, (dx0 + dx1) / 2, 0.547, zC - 0.16 + dz), drape);
  add(box(0.36, 0.17, 0.24, 0.7, 0.625, zC - 0.15), 0x3f7f7a);
  add(box(0.38, 0.04, 0.26, 0.7, 0.73, zC - 0.15), 0xece6d8);
  for (const s of [-1, 1]) {
    const x = s * (hw - T - 0.012), zm = (zB + zC) / 2, len = zC - zB;
    add(box(0.024, dado - 0.54, len, x, (dado + 0.54) / 2, zm), wood);
    add(box(0.024, H - 0.1 - dado, len, x, (H - 0.1 + dado) / 2, zm), cream);
    add(box(0.03, 0.03, len, x - s * 0.003, dado + 0.015, zm), trimC);
  }
  const pz = zC + 0.02; // (the partition: its face toward the cab at zC)
  for (const [a, b] of [[-iw, dx0], [dx1, iw]]) {
    add(box(b - a, dado - 0.54, 0.04, (a + b) / 2, (dado + 0.54) / 2, pz), wood);
    add(box(b - a, H - 0.1 - dado, 0.04, (a + b) / 2, (H - 0.1 + dado) / 2, pz), cream);
    add(box(b - a, 0.03, 0.05, (a + b) / 2, dado + 0.015, pz - 0.005), trimC);
  }
  add(box(dx1 - dx0, H - 0.1 - dTop, 0.04, (dx0 + dx1) / 2, (H - 0.1 + dTop) / 2, pz), cream);
  for (const x of [dx0, dx1]) add(box(0.07, dTop - 0.54, 0.06, x, (dTop + 0.54) / 2, pz - 0.005), trimC);
  add(box(dx1 - dx0 + 0.14, 0.07, 0.06, (dx0 + dx1) / 2, dTop + 0.035, pz - 0.005), trimC);
  for (let k = 0; k < 7; k++) {
    const d = k % 3 === 1 ? 0 : k % 3 === 0 ? 1 : 2, fw = (dx1 - dx0) / 7, x = dx0 + fw * (k + 0.5), z = pz + 0.04 + d * 0.018;
    const shade = [1, 0.8, 0.9][d], hem = new THREE.Color(drape).multiplyScalar(shade).getHex();
    add(box(fw + 0.02, dTop - 0.6, 0.03, x, (dTop + 0.6) / 2 - 0.01, z), new THREE.Color(0x93453a).multiplyScalar(shade).getHex());
    add(box(fw + 0.02, 0.06, 0.032, x, 0.72, z), hem);
    add(box(fw + 0.02, 0.022, 0.032, x, 0.8, z), hem);
  }
  {
    // the jacket and the hat, on their rail
    const x = (-iw + dx0) / 2, z = zC;
    add(box(0.4, 0.05, 0.03, x, 1.8, z - 0.015), trimC);
    for (const dx of [-0.13, 0.13]) add(box(0.02, 0.02, 0.05, x + dx, 1.79, z - 0.03), chrome);
    add(box(0.22, 0.5, 0.09, x - 0.08, 1.5, z - 0.06), drape);
    add(box(0.24, 0.1, 0.08, x - 0.08, 1.76, z - 0.05), new THREE.Color(drape).multiplyScalar(0.8).getHex());
    for (const e of [-1, 1]) add(box(0.06, 0.42, 0.06, x - 0.08 + e * 0.13, 1.47, z - 0.07), new THREE.Color(drape).multiplyScalar(0.9).getHex());
    add(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 12).rotateX(Math.PI / 2).translate(x + 0.14, 1.68, z - 0.02), 0x9a7650);
    add(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 12).rotateX(Math.PI / 2).translate(x + 0.14, 1.68, z - 0.075), 0x9a7650);
    add(new THREE.CylinderGeometry(0.087, 0.087, 0.025, 12).rotateX(Math.PI / 2).translate(x + 0.14, 1.68, z - 0.04), tie);
  }
  {
    // the picture of the sea, the shelf under it with the lantern and the book
    const x = (dx1 + iw) / 2, z = zC;
    add(box(0.36, 0.3, 0.02, x, 1.8, z - 0.01), trimC);
    add(box(0.3, 0.12, 0.01, x, 1.88, z - 0.022), 0x8fb3c8);
    add(box(0.3, 0.07, 0.01, x, 1.785, z - 0.022), 0x5f8fae);
    add(box(0.3, 0.05, 0.01, x, 1.725, z - 0.022), 0xe3cf9e);
    add(box(0.34, 0.025, 0.14, x, 1.38, z - 0.07), trimC);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.13, 8).translate(x - 0.08, 1.46, z - 0.07), 0x2b2c30);
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 8).translate(x - 0.08, 1.46, z - 0.07), 0xf2d891);
    add(box(0.12, 0.03, 0.1, x + 0.08, 1.408, z - 0.07), 0x3f6f78);
  }
  // the clock over the door
  add(new THREE.CylinderGeometry(0.088, 0.088, 0.015, 16).rotateX(Math.PI / 2).translate((dx0 + dx1) / 2, 2.42, zC - 0.008), trimC);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.016, 16).rotateX(Math.PI / 2).translate((dx0 + dx1) / 2, 2.42, zC - 0.012), 0xf3ead6);
  add(box(0.006, 0.055, 0.004, (dx0 + dx1) / 2, 2.44, zC - 0.022), dark);
  add(box(0.04, 0.006, 0.004, (dx0 + dx1) / 2 + 0.018, 2.42, zC - 0.022), dark);
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

  // ---- a door leaf (the right-hand one): its outer skin two-tone like the van, a window in its
  // upper half (open right through: shut, the passage and the room show in it), its curtains tied
  // open, a handle by its free edge; its inner face plain wood-brown
  const lw = hw, lh = H - 0.06 - 0.42, LT = 0.06;
  const Lp: THREE.BufferGeometry[] = [];
  const la = (g: THREE.BufferGeometry, hex: number, id = 0) => Lp.push(part(g, hex, id));
  const y0 = 0.42, lf = 0.03; // (lf: its window's frame)
  const lwn = F.leafWin;
  const leafHole = { u0: lwn.u0 - lf, u1: lwn.u1 + lf, y0: lwn.y0 - lf, y1: lwn.y1 + lf };
  // (a rectangle on the leaf: u along x, y up, d deep, centred at z)
  const lslab = (r: { u0: number; u1: number; y0: number; y1: number }, d: number, z: number, hex: number) => la(box(r.u1 - r.u0, r.y1 - r.y0, d, (r.u0 + r.u1) / 2, (r.y0 + r.y1) / 2, z), hex);
  la(box(lw, belt - y0, LT, -lw / 2, (belt + y0) / 2, 0), paint);
  la(box(lw + 0.004, 0.07, LT + 0.006, -lw / 2, belt + 0.035, 0), stripe);
  for (const r of around(-lw, 0, belt + 0.07, y0 + lh, leafHole)) lslab(r, LT, 0, cream);
  for (const r of around(leafHole.u0, leafHole.u1, leafHole.y0, leafHole.y1, lwn)) lslab(r, LT + 0.02, 0, trim);
  for (const [e, dir] of [[lwn.u0, 1], [lwn.u1, -1]]) {
    for (let k = 0; k < 2; k++) la(box(0.06, lwn.y1 - lwn.y0 - 0.01, 0.02, e + dir * (0.03 + k * 0.05), (lwn.y0 + lwn.y1) / 2, -LT / 2 + 0.015), k % 2 ? drape : drapeDark);
    la(box(0.12, 0.04, 0.03, e + dir * 0.055, (lwn.y0 + lwn.y1) / 2 - 0.04, -LT / 2 + 0.018), tie);
  }
  la(box(0.18, 0.04, 0.04, -lw + 0.16, belt - 0.15, LT / 2 + 0.02), chrome);
  for (const r of around(-lw + 0.03, -0.03, y0 + 0.03, y0 + lh - 0.03, leafHole)) lslab(r, 0.012, -LT / 2 - 0.006, 0x8a6a4c); // the inner face
  for (const y of [y0 + 0.25, y0 + lh - 0.3]) la(box(0.05, 0.12, 0.08, -0.02, y, 0), trim); // hinges
  const leaf = merge(Lp);
  // the windows' panes, for the shadow alone (the van's shadow stays whole, as it was with glass)
  const panes = merge([-1, 1].map((s) => box(T, wn.y1 - wn.y0, wn.z1 - wn.z0, s * (hw - T / 2), (wn.y0 + wn.y1) / 2, (wn.z0 + wn.z1) / 2)));
  const leafPane = box(lwn.u1 - lwn.u0, lwn.y1 - lwn.y0, LT, (lwn.u0 + lwn.u1) / 2, (lwn.y0 + lwn.y1) / 2, 0);
  // the steering wheel, about its own hub (its axis along z): a rim, a hub and three spokes
  const Wp: THREE.BufferGeometry[] = [];
  Wp.push(part(new THREE.TorusGeometry(0.19, 0.024, 6, 20), 0x1d1e21));
  Wp.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateX(Math.PI / 2), 0x2b2c30));
  for (const a of [0, Math.PI, -Math.PI / 2]) Wp.push(part(box(0.17, 0.03, 0.02, 0.095, 0, 0).rotateZ(a), 0x2b2c30)); // (3, 9 and 6 o'clock: the dials show over the hub)
  const steering = merge(Wp);
  // a live dial's needle (the speedometer's, the rev counter's: van.ts turns them), in the dial's own
  // frame: the face the xy plane, out of it +z, the needle up +y from its hub
  const r0 = F.dials[0].r;
  const needle = merge([part(box(0.0045, r0 * 0.86, 0.002, 0, r0 * 0.36, 0.001), 0xc23b2b), part(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8).rotateX(Math.PI / 2), 0x1d1e21)]);
  // the charm under the mirror (van.ts swings it as the van brakes and turns): a cord, a little
  // dreamcatcher, its web and bead, two feathers — hanging from the origin, down −y
  const charm = merge([
    part(box(0.003, 0.11, 0.003, 0, -0.055, 0), 0x6a5a40),
    part(new THREE.TorusGeometry(0.028, 0.0035, 4, 14).translate(0, -0.138, 0), 0x9a7650),
    part(box(0.05, 0.0015, 0.0015, 0, -0.138, 0), 0xe8e1cc),
    part(box(0.0015, 0.05, 0.0015, 0, -0.138, 0), 0xe8e1cc),
    part(box(0.008, 0.008, 0.006, 0, -0.138, 0), 0xa6382f),
    part(box(0.012, 0.05, 0.002, -0.014, -0.19, 0).rotateZ(0.08), 0xe8e1cc),
    part(box(0.012, 0.05, 0.002, 0.014, -0.19, 0).rotateZ(-0.08), 0x3f7f7a),
  ]);
  return { body, left: sides[0], right: sides[1], rear, leaf, wheel: steering, panes, leafPane, driverBack: merge(back), needle, charm };
}

/** The whole van in one geometry, its back doors shut — a card's picture, the brush's sketch of it
 *  (ui/brush.ts: you paint your van where you want it). */
export function camperPicture(c: CamperRecipe) {
  const g = camperGeometry(c), F = camperFrame(c), hw = c.W / 2;
  const right = g.leaf.clone().translate(hw, 0, F.zr + 0.03);
  const left = mirrorX(g.leaf.clone()).translate(-hw, 0, F.zr + 0.03); // (van.ts hangs it mirrored)
  return merge([g.body, g.left, g.right, g.rear, right, left, g.driverBack]);
}

/** A non-indexed geometry mirrored across x, its triangles rewound so they still face out. */
function mirrorX(g: THREE.BufferGeometry) {
  g.scale(-1, 1, 1);
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute, n = a.itemSize, arr = a.array;
    for (let t = 0; t + 2 < a.count; t += 3) for (let k = 0; k < n; k++) {
      const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k, v = arr[i1];
      arr[i1] = arr[i2];
      arr[i2] = v;
    }
  }
  return g;
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
  const { body, left, right, rear, leaf, driverBack } = camperGeometry(c);
  return validGeometry(body, { w: W_MAX, h: 3.0, d: 5.95 }) && [left, right].every((g) => validGeometry(g, { w: 1.2, h: 3.0, d: 4.0 }, 0.4)) && validGeometry(rear, { w: W_MAX, h: 0.6, d: 0.6 }, 0.4) && validGeometry(leaf, { w: 1.1, h: 3.0, d: 0.2 }, 3) && validGeometry(driverBack, { w: 0.6, h: 1.0, d: 0.4 }, 1.0) && camperVerts(c) <= CAMPER_BUDGET;
}
/** All its vertices: the body, the bumper and step, both doors, the panes, the driver's seat back, the
 *  two live needles, the charm. */
export function camperVerts(c: CamperRecipe) {
  const g = camperGeometry(c), n = (x: THREE.BufferGeometry) => x.getAttribute('position').count;
  return [g.body, g.left, g.right, g.rear, g.wheel, g.panes, g.driverBack, g.charm].reduce((k, x) => k + n(x), 0) + 2 * (n(g.leaf) + n(g.leafPane) + n(g.needle));
}
const W_MAX = 2.9;
