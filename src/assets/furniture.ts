// Furniture — the made things of a street and a beach, as recipe families
// (docs/ASSET_FOUNDRY.md §Furniture): mailboxes in several regional styles, beach umbrellas,
// chairs and towels, picnic tables, and the gear people strap to cars (roof racks, surfboards,
// kayaks, cargo boxes, bikes). Colours that should vary per placement are TINT (the instance
// colour paints them); everything else carries its own.
import * as THREE from 'three';
import { TINT, part, merge, box, limb, lathe, card, cached } from './core';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const WOOD = 0x7a5b46, POST = 0x6b5a48, BRICK = 0x9a4e3a, CREAM = 0xf2efe6;

// ---------------------------------------------------------------- mailboxes
export type MailboxStyle = 'post' | 'rural' | 'brick' | 'lantern' | 'newspaper';
export const MAILBOXES: MailboxStyle[] = ['post', 'rural', 'brick', 'lantern', 'newspaper'];
/** Curbside mailbox, door toward −z (the street). */
export function mailboxGeometry(style: MailboxStyle): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const barrel = (y: number, len = 0.48, w = 0.23) => {
    // the classic US rural box: a flat-bottomed tunnel (half-cylinder roof over a box)
    p.push(part(box(w, w * 0.55, len, 0, y + w * 0.275, 0), TINT));
    p.push(part(new THREE.CylinderGeometry(w / 2, w / 2, len, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, y + w * 0.55, 0), TINT));
    p.push(part(box(0.025, 0.12, 0.035, w / 2 + 0.015, y + 0.22, 0.12), 0xc2412f)); // the flag
    p.push(part(box(w * 0.9, w * 0.9, 0.012, 0, y + w * 0.5, -len / 2 - 0.004), 0x3a3b3f)); // door
  };
  if (style === 'post' || style === 'newspaper') {
    p.push(part(box(0.09, 1.05, 0.09, 0, 0.52, 0), POST));
    p.push(part(box(0.3, 0.05, 0.54, 0, 1.03, 0), POST));
    barrel(1.06);
    if (style === 'newspaper') p.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 8).rotateX(Math.PI / 2).translate(0, 0.78, 0.02), 0x2c3e5c));
  } else if (style === 'rural') {
    // a swing-arm post: upright + angled brace + an arm the box hangs from
    p.push(part(box(0.1, 1.1, 0.1, 0, 0.55, 0.25), POST));
    p.push(part(box(0.09, 0.09, 0.6, 0, 1.12, 0.02), POST));
    p.push(part(limb(V3(0, 0.75, 0.25), V3(0, 1.1, -0.05), 0.035, 0.035, 4), POST));
    barrel(1.17, 0.52, 0.25);
  } else if (style === 'brick') {
    p.push(part(box(0.5, 1.15, 0.6, 0, 0.575, 0.04), BRICK));
    p.push(part(box(0.56, 0.06, 0.66, 0, 1.18, 0.04), 0xd8d2c4));
    p.push(part(box(0.24, 0.24, 0.02, 0, 0.82, -0.265), 0x3a3b3f));
    p.push(part(box(0.12, 0.12, 0.02, 0, 0.45, -0.265), TINT)); // house numbers plaque
  } else if (style === 'lantern') {
    // painted post with a lamp on top and the box on a shelf
    p.push(part(lathe([[0.07, 0], [0.06, 0.1], [0.045, 0.2], [0.045, 1.25], [0.07, 1.3]], 8), TINT));
    p.push(part(box(0.14, 0.2, 0.14, 0, 1.4, 0), 0xf8e8b0, 3));
    p.push(part(new THREE.ConeGeometry(0.12, 0.1, 4).rotateY(Math.PI / 4).translate(0, 1.55, 0), 0x2a2c30));
    p.push(part(box(0.3, 0.04, 0.5, 0, 0.94, 0), POST));
    barrel(0.96);
  }
  return merge(p);
}
export const mailboxLib = (s: MailboxStyle) => cached(`mailbox:${s}`, () => mailboxGeometry(s));

// ---------------------------------------------------------------- beach
/** A beach umbrella: striped canopy (TINT stripes alternate with cream) on a leaning pole. */
export function umbrellaGeometry(seed = 0): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const lean = 0.12 + (seed % 3) * 0.05;
  const top = V3(Math.sin(lean) * 2.1, Math.cos(lean) * 2.1, 0);
  p.push(part(limb(V3(0, -0.2, 0), top, 0.025, 0.022, 5), 0xe8e4da));
  const panels = 8, R = 1.05, drop = 0.35;
  for (let i = 0; i < panels; i++) {
    const a0 = (i / panels) * Math.PI * 2, a1 = ((i + 1) / panels) * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    const tip = [0, 0.18, 0], e0 = [Math.cos(a0) * R, -drop, Math.sin(a0) * R], e1 = [Math.cos(a1) * R, -drop, Math.sin(a1) * R];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...tip, ...e1, ...e0, ...tip, ...e0, ...e1], 3));
    g.computeVertexNormals();
    g.rotateZ(-lean).translate(top.x, top.y, top.z);
    p.push(part(g, i % 2 ? TINT : CREAM));
  }
  return merge(p);
}
export function beachChairGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(box(0.56, 0.04, 0.6, 0, 0.26, 0), TINT)); // seat sling
  p.push(part(box(0.56, 0.62, 0.04, 0, 0.5, 0.36).rotateX(-0.45).translate(0, 0.12, 0.05), TINT));
  for (const s of [-1, 1]) {
    p.push(part(limb(V3(s * 0.28, 0, -0.3), V3(s * 0.28, 0.3, 0.2), 0.012, 0.012, 4), 0xc9ccd0));
    p.push(part(limb(V3(s * 0.28, 0, 0.3), V3(s * 0.28, 0.75, 0.48), 0.012, 0.012, 4), 0xc9ccd0));
    p.push(part(box(0.04, 0.03, 0.5, s * 0.3, 0.46, 0.05), 0xc9ccd0));
  }
  return merge(p);
}
export const towelGeometry = () => merge([part(box(0.8, 0.012, 1.7, 0, 0.006, 0), TINT), part(box(0.8, 0.013, 0.12, 0, 0.006, -0.62), CREAM), part(box(0.8, 0.013, 0.12, 0, 0.006, 0.62), CREAM)]);
export function picnicTableGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) p.push(part(box(0.15, 0.05, 1.8, -0.32 + k * 0.16, 0.76, 0), TINT));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) p.push(part(box(0.15, 0.045, 1.8, s * (0.6 + k * 0.16), 0.45, 0), TINT));
    for (const z of [-0.65, 0.65]) {
      p.push(part(limb(V3(s * 0.75, 0, z), V3(s * 0.1, 0.74, z), 0.035, 0.035, 4), WOOD));
      p.push(part(box(1.6, 0.06, 0.06, 0, 0.42, z), WOOD));
    }
  }
  return merge(p);
}
export const beachLib = (k: 'umbrella' | 'chair' | 'towel' | 'picnic', v = 0) =>
  cached(`beach:${k}:${v}`, () => (k === 'umbrella' ? umbrellaGeometry(v) : k === 'chair' ? beachChairGeometry() : k === 'towel' ? towelGeometry() : picnicTableGeometry()));

// ---------------------------------------------------------------- car gear
export type CarGear = 'rack' | 'surf' | 'kayak' | 'cargo' | 'bike';
export const CAR_GEAR: CarGear[] = ['rack', 'surf', 'kayak', 'cargo', 'bike'];
export const GEAR_NAME: Record<CarGear, string> = { rack: 'a roof rack', surf: 'a surfboard', kayak: 'a kayak', cargo: 'a roof box', bike: 'a bike on the back' };
/** Gear for a car whose roof is `roof` m high, body `L` long, `W` wide (car origin, front −z). */
export function gearGeometry(g: CarGear, roof: number, L: number, W: number, seed = 0): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const bars = () => {
    for (const z of [-0.45, 0.45]) p.push(part(box(W * 0.86, 0.04, 0.05, 0, roof + 0.06, z), 0x2a2c30));
    for (const s of [-1, 1]) p.push(part(box(0.04, 0.05, 1.1, s * W * 0.4, roof + 0.02, 0), 0x2a2c30));
  };
  const SURF = [0xf2efe6, 0x5aa4c8, 0xf2c23a, 0xe0705a][seed % 4];
  const KAYAK = [0xe8622a, 0xf2c23a, 0x3a8ac0, 0x6aa84a][seed % 4];
  if (g === 'rack') bars();
  else if (g === 'surf') {
    bars();
    const b = lathe([[0.001, -1.1], [0.2, -0.8], [0.27, 0], [0.22, 0.8], [0.001, 1.1]], 8).scale(1, 1, 0.12).rotateX(Math.PI / 2);
    p.push(part(b.translate(0, roof + 0.12, 0.05), SURF));
    p.push(part(box(0.02, 0.02, 2.0, 0, roof + 0.13, 0.05), 0x6a5a48)); // stringer
  } else if (g === 'kayak') {
    bars();
    const k = lathe([[0.001, -1.9], [0.18, -1.2], [0.3, 0], [0.18, 1.2], [0.001, 1.9]], 8).scale(1, 1, 0.5).rotateX(Math.PI / 2);
    p.push(part(k.translate(0, roof + 0.22, 0), KAYAK));
    p.push(part(box(0.34, 0.04, 0.5, 0, roof + 0.36, 0.1), 0x2a2c30)); // cockpit
  } else if (g === 'cargo') {
    bars();
    p.push(part(lathe([[0.001, 0], [0.32, 0.03], [0.36, 0.14], [0.26, 0.3], [0.001, 0.33]], 10).scale(1.2, 1, 2.6).translate(0, roof + 0.08, 0.05), 0x2a2c30));
  } else if (g === 'bike') {
    // a bike on a hitch rack at the back
    const z = L / 2 + 0.3, y = 0.55;
    p.push(part(box(0.06, 0.06, 0.4, 0, 0.45, L / 2 + 0.1), 0x2a2c30));
    for (const x of [-0.5, 0.5]) p.push(part(new THREE.TorusGeometry(0.33, 0.025, 4, 14).translate(x, y + 0.2, z), 0x1d1e21));
    p.push(part(limb(V3(-0.5, y + 0.2, z), V3(0.05, y + 0.55, z), 0.02, 0.02, 4), SURF));
    p.push(part(limb(V3(0.05, y + 0.55, z), V3(0.5, y + 0.2, z), 0.02, 0.02, 4), SURF));
    p.push(part(limb(V3(-0.2, y + 0.6, z), V3(0.3, y + 0.62, z), 0.02, 0.02, 4), SURF));
    p.push(part(card(0.1, 0.22, 0, 1).rotateY(Math.PI / 2).translate(-0.12, y + 0.72, z), 0x2a2c30)); // saddle
  }
  return merge(p);
}

/** Which gear (if any) a car carries: position-hashed dice u, near the coast or not. */
export function gearFor(u: number, coastal: boolean): CarGear | null {
  const table: [CarGear, number][] = coastal ? [['surf', 0.09], ['rack', 0.07], ['kayak', 0.04], ['cargo', 0.04], ['bike', 0.04]] : [['rack', 0.08], ['cargo', 0.05], ['bike', 0.05], ['kayak', 0.02]];
  let x = u;
  for (const [g, w] of table) if ((x -= w) < 0) return g;
  return null;
}
