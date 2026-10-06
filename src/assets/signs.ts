// Signs of life (docs/regional-life/models.md, the `sign†` genome): what an animal builds and leaves in
// the land — the osprey's nest, a great stick nest on a platform atop a pole where the shore meets the
// water; the beaver's lodge, a dome of sticks in a pond; the prairie dogs' town of mounds. The
// crawfish's chimneys follow on the same genome.
import * as THREE from 'three';
import { part, merge, blob, hashf } from './core';

/** The osprey's nest on its platform pole (local: the pole's foot at the origin, up +y): a weathered
 *  pole `h` metres tall, a square platform, the nest a broad flattened heap of sticks with sticks poking
 *  out of it every way; under 600 vertices. */
export function ospreyNestGeometry(h = 7.5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(new THREE.CylinderGeometry(0.1, 0.13, h, 6, 1, true).translate(0, h / 2, 0), 0x8a8070)); // (open: its ends under the platform and the water)
  parts.push(part(new THREE.BoxGeometry(1.3, 0.08, 1.3).translate(0, h + 0.04, 0), 0x7a7062));
  // the heap: wider than the platform, a shallow bowl's rim
  parts.push(part(blob(0.8, 51, { detail: 1, lump: 0.35 }).scale(1, 0.42, 1).translate(0, h + 0.3, 0), 0x6e5e48));
  parts.push(part(blob(0.62, 52, { detail: 0, lump: 0.2 }).scale(1, 0.2, 1).translate(0, h + 0.5, 0), 0x4e4234)); // (the cup)
  // the sticks: thin rods leaning out of the heap at every angle
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + hashf(i * 31 + 7) * 0.4, L = 0.7 + hashf(i * 17 + 3) * 0.6, tilt = 0.15 + hashf(i * 13 + 5) * 0.5;
    const rod = new THREE.CylinderGeometry(0.018, 0.022, L, 3, 1, true).rotateZ(Math.PI / 2 - tilt).rotateY(a);
    parts.push(part(rod.translate(Math.cos(a) * 0.62, h + 0.32 + hashf(i * 7 + 1) * 0.2, -Math.sin(a) * 0.62), i % 3 ? 0x7a6a52 : 0x5e5040));
  }
  return merge(parts);
}

/** Spots for a sign, in `zone`: one at most to a `cell` (m) of the survey grid, in about `odds` of the
 *  cells — the cell's first spot (on its own jittered `step` grid, in a fixed order) where `ok` holds. A
 *  cell decides for itself, whichever tile asks (no sign doubled across a tile's edge where the ground
 *  reads the same); deterministic by place. `y`: the ground (the bed, under water) at the spot. */
export function cellSpots(zone: { x0: number; z0: number; x1: number; z1: number }, ok: (x: number, z: number) => boolean, heightAt: (x: number, z: number) => number, cell: number, odds: number, step: number, salt: number): { x: number; y: number; z: number; yaw: number }[] {
  const out: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let ci = Math.floor(zone.x0 / cell); ci * cell < zone.x1; ci++)
    for (let cj = Math.floor(zone.z0 / cell); cj * cell < zone.z1; cj++) {
      if (hashf(ci * 92821 + cj * 68917 + salt) > odds) continue;
      const n = Math.floor(cell / step);
      found: for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const gi = ci * n + i, gj = cj * n + j;
          const x = ci * cell + (i + 0.5 + (hashf(gi * 7919 + gj * 104729 + salt + 6) - 0.5) * 0.8) * step;
          const z = cj * cell + (j + 0.5 + (hashf(gi * 104729 + gj * 7919 + salt + 12) - 0.5) * 0.8) * step;
          if (!ok(x, z)) continue;
          if (x >= zone.x0 && x < zone.x1 && z >= zone.z0 && z < zone.z1) out.push({ x, y: heightAt(x, z), z, yaw: hashf(gi * 2971 + gj * 31337 + salt + 16) * Math.PI * 2 });
          break found;
        }
    }
  return out;
}

/** Where the osprey's nests stand: one at most to a 700 m cell, in half the cells with shore, 1 to 6 m out
 *  from the bank. */
export function ospreyNests(zone: { x0: number; z0: number; x1: number; z1: number }, sdfAt: (x: number, z: number) => number, heightAt: (x: number, z: number) => number, cell = 700, odds = 0.5, step = 24) {
  return cellSpots(zone, (x, z) => { const d = sdfAt(x, z); return d <= -1 && d >= -6; }, heightAt, cell, odds, step, 601);
}

/** A beaver's lodge: a dome of sticks and mud rising from the pond's bed, peeled sticks laid over it
 *  every way (local: its foot at the origin; about 2.6 m to its crown, 4 m across); under 700 vertices. */
export function beaverLodgeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(blob(2, 81, { detail: 1, lump: 0.3 }).scale(1, 0.62, 1).translate(0, 1.35, 0), 0x6a5a46));
  parts.push(part(blob(1.4, 82, { detail: 0, lump: 0.25 }).scale(1, 0.55, 1).translate(0.3, 2.0, -0.2), 0x5a4c3c)); // (mud packed on top)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hashf(i * 37 + 3) * 0.5, up = 0.6 + hashf(i * 11 + 7) * 1.4, L = 1.2 + hashf(i * 19 + 5) * 1.0;
    const r = 1.95 * Math.sqrt(Math.max(0.05, 1 - ((up - 1.35) / 1.25) ** 2));
    const rod = new THREE.CylinderGeometry(0.03, 0.04, L, 3, 1, true).rotateZ(Math.PI / 2 - 0.5 - hashf(i * 13 + 1) * 0.6).rotateY(a + 1.2);
    parts.push(part(rod.translate(Math.cos(a) * r, up, -Math.sin(a) * r), i % 4 ? 0x8a7a62 : 0xc8b898)); // (a few freshly peeled, pale)
  }
  return merge(parts);
}

/** Where the beavers' lodges stand: in a pond or a lake (not the sea), 2 to 9 m out from the bank, one at
 *  most to a 900 m cell, in about a third of the cells with such water. */
export function beaverLodges(zone: { x0: number; z0: number; x1: number; z1: number }, sdfAt: (x: number, z: number) => number, oceanDistAt: (x: number, z: number) => number, heightAt: (x: number, z: number) => number) {
  return cellSpots(zone, (x, z) => { const d = sdfAt(x, z); return d <= -2 && d >= -9 && oceanDistAt(x, z) > 300; }, heightAt, 900, 0.35, 30, 701);
}

/** A prairie dog town, if (x, z) is in one: about a third of the 800 m cells of the survey grid hold a
 *  town, a circle 60–160 m across centred somewhere in the cell (the caller checks it's open grassland in
 *  prairie dog country). Pure: the props lay its mounds, the sim sets its prairie dogs in it. */
export function prairieTown(x: number, z: number): { x: number; z: number; r: number } | null {
  const C = 800, ci = Math.floor(x / C), cj = Math.floor(z / C);
  if (hashf(ci * 92821 + cj * 68917 + 801) > 0.33) return null;
  const tx = (ci + 0.2 + hashf(ci * 7919 + cj * 104729 + 803) * 0.6) * C, tz = (cj + 0.2 + hashf(ci * 104729 + cj * 7919 + 807) * 0.6) * C;
  const r = 30 + hashf(ci * 31337 + cj * 2971 + 809) * 50;
  return Math.hypot(x - tx, z - tz) < r ? { x: tx, z: tz, r } : null;
}

/** A prairie dog's mound: a low crater of bare earth round its burrow's mouth (about 1.2 m across). */
export function moundGeometry(): THREE.BufferGeometry {
  const rim = new THREE.CylinderGeometry(0.35, 0.6, 0.22, 7, 1, true).translate(0, 0.11, 0);
  const hole = new THREE.CircleGeometry(0.2, 6).rotateX(-Math.PI / 2).translate(0, 0.222, 0); // (the burrow's dark mouth, on top)
  return merge([part(rim, 0xa08a68), part(new THREE.CylinderGeometry(0.36, 0.36, 0.01, 7).translate(0, 0.21, 0), 0x8a7458), part(hole, 0x3a3026)]);
}

/** The mounds of the prairie dog towns in `zone`: one to a jittered 9 m grid inside each town where `ok`
 *  (open grassland) holds. */
export function prairieMounds(zone: { x0: number; z0: number; x1: number; z1: number }, ok: (x: number, z: number) => boolean, heightAt: (x: number, z: number) => number) {
  const out: { x: number; y: number; z: number; yaw: number }[] = [];
  const G = 9;
  for (let z = Math.floor(zone.z0 / G) * G; z < zone.z1; z += G)
    for (let x = Math.floor(zone.x0 / G) * G; x < zone.x1; x += G) {
      const i = Math.round(x / G), j = Math.round(z / G);
      const jx = x + (hashf(i * 7919 + j * 104729 + 811) - 0.5) * G * 0.7, jz = z + (hashf(i * 104729 + j * 7919 + 813) - 0.5) * G * 0.7;
      if (jx < zone.x0 || jx >= zone.x1 || jz < zone.z0 || jz >= zone.z1 || hashf(i * 31337 + j * 2971 + 817) > 0.6) continue;
      if (!prairieTown(jx, jz) || !ok(jx, jz)) continue;
      out.push({ x: jx, y: heightAt(jx, jz), z: jz, yaw: hashf(i * 2971 + j * 31337 + 819) * Math.PI * 2 });
    }
  return out;
}

/** A basking log: a fallen trunk lying out from the bank into the water, its bark, a broken-off limb or
 *  two, its cut end pale (local: along z, its middle at the origin, resting on y 0; 5 m long). */
export function baskingLogGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(new THREE.CylinderGeometry(0.26, 0.32, 5, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0.3, 0), 0x6a5e4e));
  parts.push(part(new THREE.CircleGeometry(0.26, 8).translate(0, 0.3, 2.5), 0xa8987a)); // (the broken end, out in the water)
  parts.push(part(new THREE.CircleGeometry(0.32, 8).rotateY(Math.PI).translate(0, 0.3, -2.5), 0x8a7a62));
  for (const [z, a] of [[-1.2, 0.6], [0.9, -0.8]]) parts.push(part(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 4, 1, true).rotateZ(a).translate(Math.sin(a) * -0.3, 0.55, z), 0x5e5244));
  return merge(parts);
}

/** Where the basking logs lie: at a pond's, a lake's or a river's edge (not the sea), one to a 300 m
 *  cell in about half the cells with such a shore, each lying square to the bank — its −z end on the
 *  bank, its +z end out in the water (`yaw` turns local +z down the water's slope). The sim lines its
 *  turtles up along it. */
export function baskingLogs(zone: { x0: number; z0: number; x1: number; z1: number }, sdfAt: (x: number, z: number) => number, oceanDistAt: (x: number, z: number) => number, heightAt: (x: number, z: number) => number) {
  return cellSpots(zone, (x, z) => { const d = sdfAt(x, z); return d <= 0.6 && d >= -0.6 && oceanDistAt(x, z) > 150; }, heightAt, 300, 0.5, 12, 901).map((l) => {
    const gx = sdfAt(l.x + 1, l.z) - sdfAt(l.x - 1, l.z), gz = sdfAt(l.x, l.z + 1) - sdfAt(l.x, l.z - 1);
    // (local +z down the slope, into the water: the yaw that turns (0, 0, 1) to −grad)
    return { ...l, yaw: Math.atan2(-gx, -gz) };
  });
}
