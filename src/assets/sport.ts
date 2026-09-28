// Sport — the kit of a court and a field (docs/ASSET_FOUNDRY.md): what makes a mapped pitch read as
// a game ground from across the park. A basketball hoop on its gooseneck post, a net between its
// posts (tennis, pickleball and volleyball — one recipe at their own widths and heights), a soccer
// goal (full size or a kids' one), a baseball backstop, the bases. props.ts places them on OSM
// leisure=pitch areas by their `sport` (realTile Area.k), squared to the court's long axis; the
// lines are ground paint (groundPaint.ts courtLines — the same fit).
// Frames: origin on the ground. A hoop and a goal stand on their end line facing +z (into the
// court); a net's posts are on ±x (it spans the court); the backstop curls round home plate at the
// origin with the diamond out along +z.
import * as THREE from 'three';
import { part, merge, box, limb, cached } from './core';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const STEEL = 0x6f7478, GALV = 0x9aa0a2, WHITE = 0xf1efe8, ORANGE = 0xd35f2a, NETC = 0x33373a;

export type SportPiece = 'hoop' | 'tennisNet' | 'pickleNet' | 'volleyNet' | 'goal' | 'kidsGoal' | 'backstop' | 'bases';
export const SPORT_PIECES: SportPiece[] = ['hoop', 'tennisNet', 'pickleNet', 'volleyNet', 'goal', 'kidsGoal', 'backstop', 'bases'];

/** A basketball hoop: the post a metre behind the baseline, a gooseneck out over it, the board
 *  1.2 m inside the line (its face), the rim 3.05 m up with its net. */
function hoop() {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(box(0.15, 3.3, 0.15, 0, 1.65, -1.0), STEEL));
  p.push(part(limb(V3(0, 3.25, -1.0), V3(0, 3.45, 1.12), 0.055, 0.05, 4), STEEL));
  p.push(part(limb(V3(0, 2.55, -1.0), V3(0, 3.2, 1.12), 0.035, 0.035, 4), STEEL));
  p.push(part(box(1.8, 1.05, 0.05, 0, 3.4, 1.18), WHITE)); // the board (bottom at 2.875 m)
  p.push(part(box(0.61, 0.46, 0.012, 0, 3.23, 1.21), ORANGE)); // the shooter's square…
  p.push(part(box(0.53, 0.38, 0.014, 0, 3.23, 1.211), WHITE)); // …as an outline
  p.push(part(box(1.8, 0.05, 0.014, 0, 3.9, 1.21), ORANGE)); // the board's rim band
  p.push(part(box(0.12, 0.05, 0.16, 0, 3.05, 1.29), ORANGE)); // the rim's bracket
  p.push(part(new THREE.TorusGeometry(0.23, 0.013, 4, 16).rotateX(Math.PI / 2).translate(0, 3.05, 1.6), ORANGE));
  p.push(part(new THREE.CylinderGeometry(0.225, 0.13, 0.42, 12, 1, true).translate(0, 2.83, 1.6), WHITE));
  p.push(part(box(0.5, 0.06, 0.5, 0, 0.03, -1.0), 0x8e908e)); // the footing
  return merge(p);
}

/** A net across a court: posts at ±w/2, the net `hTop` high at the posts (and a sag in the middle
 *  on a tennis net), a white tape along its top, and (volleyball) held `hBottom` off the ground. */
function net(w: number, hPost: number, hTop: number, hBottom: number, sag: number) {
  const p: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    p.push(part(new THREE.CylinderGeometry(0.04, 0.045, hPost, 8).translate((s * w) / 2, hPost / 2, 0), GALV));
    p.push(part(box(0.2, 0.04, 0.2, s * w / 2, 0.02, 0), 0x8e908e));
  }
  // the net in three panels so a tennis net dips to 0.914 m at the strap
  const k = 3;
  for (let i = 0; i < k; i++) {
    const x0 = -w / 2 + (w * i) / k, x1 = -w / 2 + (w * (i + 1)) / k;
    const y = (x: number) => hTop - sag * (1 - Math.abs((2 * x) / w));
    const g = new THREE.BufferGeometry();
    const a = [x0, hBottom, 0], b = [x1, hBottom, 0], c = [x1, y(x1), 0], d = [x0, y(x0), 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c], 3));
    g.computeVertexNormals();
    p.push(part(g, NETC));
    const tl = Math.hypot(x1 - x0, y(x1) - y(x0));
    p.push(part(box(tl, 0.06, 0.03, 0, 0, 0).rotateZ(Math.atan2(y(x1) - y(x0), x1 - x0)).translate((x0 + x1) / 2, (y(x0) + y(x1)) / 2, 0), WHITE));
  }
  if (sag > 0) p.push(part(box(0.05, hTop - sag, 0.035, 0, (hTop - sag) / 2, 0), WHITE)); // the centre strap
  if (hBottom > 0.3) p.push(part(box(w, 0.04, 0.03, 0, hBottom, 0), WHITE)); // volleyball: the bottom tape
  return merge(p);
}

/** A goal on its line facing +z: posts and crossbar, the net's frame raked back behind it. */
function goal(w: number, h: number, depth: number) {
  const p: THREE.BufferGeometry[] = [];
  const r = w > 6 ? 0.06 : 0.045;
  for (const s of [-1, 1]) {
    p.push(part(new THREE.CylinderGeometry(r, r, h, 8).translate((s * w) / 2, h / 2, 0), WHITE));
    // the back frame: a stay down from the crossbar corner to the ground behind
    p.push(part(limb(V3((s * w) / 2, h, 0), V3((s * w) / 2, 0, -depth), 0.02, 0.02, 4), GALV));
    p.push(part(limb(V3((s * w) / 2, 0.02, 0), V3((s * w) / 2, 0.02, -depth), 0.02, 0.02, 4), GALV));
  }
  p.push(part(new THREE.CylinderGeometry(r, r, w + 2 * r, 8).rotateZ(Math.PI / 2).translate(0, h, 0), WHITE));
  p.push(part(limb(V3(-w / 2, 0.02, -depth), V3(w / 2, 0.02, -depth), 0.02, 0.02, 4), GALV));
  // the net: back and roof as dark panels, sides as triangles (read as mesh at a distance)
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c], 3));
    g.computeVertexNormals();
    return part(g, 0xd8d6cf);
  };
  p.push(quad([-w / 2, h, -0.02], [w / 2, h, -0.02], [w / 2, 0, -depth], [-w / 2, 0, -depth]));
  for (const s of [-1, 1]) p.push(quad([(s * w) / 2, h, -0.02], [(s * w) / 2, 0, -depth], [(s * w) / 2, 0, -0.02], [(s * w) / 2, 0, -0.02]));
  return merge(p);
}

/** A baseball backstop: chain-link panels round home plate on posts, a hood leaning over the top,
 *  and the plate itself. Home at the origin, the diamond out along +z. */
function backstop() {
  const p: THREE.BufferGeometry[] = [];
  const R = 8, H = 5.5, n = 5, span = Math.PI * 0.62; // a polygonal arc behind the plate
  let prev: [number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n - 0.5) * span;
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    p.push(part(new THREE.CylinderGeometry(0.05, 0.05, H + 0.1, 6).translate(x, (H + 0.1) / 2, z), GALV));
    if (prev) {
      const [px, pz] = prev, L = Math.hypot(x - px, z - pz), ang = Math.atan2(z - pz, x - px);
      for (const y of [0.1, 1.9, 3.7, H]) p.push(part(box(L, 0.035, 0.035, 0, 0, 0).rotateY(-ang).translate((x + px) / 2, y, (z + pz) / 2), GALV));
      // the chain-link: a grey wash between the rails (the eye reads it as mesh at a distance)
      p.push(part(box(L, H - 0.2, 0.012, 0, 0, 0).rotateY(-ang).translate((x + px) / 2, H / 2 + 0.05, (z + pz) / 2), 0xb7bbbc));
      // the hood leaning in over the catcher
      const ix = Math.sin(a) * (R - 1.6), iz = Math.cos(a) * (R - 1.6), jx = Math.sin(a - span / n) * (R - 1.6), jz = Math.cos(a - span / n) * (R - 1.6);
      const g = new THREE.BufferGeometry();
      const A = [px, H, pz], B = [x, H, z], C = [ix, H + 0.9, iz], D = [jx, H + 0.9, jz];
      g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C], 3));
      g.computeVertexNormals();
      p.push(part(g, 0xb7bbbc));
    }
    prev = [x, z];
  }
  // home plate: a white pentagon, point toward the catcher
  const s = 0.215;
  const shape = new THREE.Shape([new THREE.Vector2(-s, 0), new THREE.Vector2(s, 0), new THREE.Vector2(s, -s), new THREE.Vector2(0, -2 * s), new THREE.Vector2(-s, -s)]);
  p.push(part(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2).translate(0, 0.015, 0), WHITE));
  return merge(p);
}

/** First, second and third base on a diamond of `side` metres (home at the origin, +z out). */
function bases(side: number) {
  const p: THREE.BufferGeometry[] = [];
  const d = side / Math.SQRT2;
  for (const [x, z] of [[d, d], [0, 2 * d], [-d, d]]) p.push(part(box(0.38, 0.07, 0.38, 0, 0, 0).rotateY(Math.PI / 4).translate(x, 0.035, z), WHITE));
  p.push(part(new THREE.CylinderGeometry(0.3, 0.45, 0.25, 10).translate(0, 0.125, (2 * d) * 0.45), 0xb07a52)); // the mound
  p.push(part(box(0.6, 0.02, 0.15, 0, 0.26, (2 * d) * 0.45), WHITE)); // the rubber
  return merge(p);
}

export function sportGeometry(k: SportPiece, v = 0): THREE.BufferGeometry {
  switch (k) {
    case 'hoop': return hoop();
    case 'tennisNet': return net(12.8, 1.07, 1.07, 0.02, 0.156);
    case 'pickleNet': return net(6.7, 0.914, 0.914, 0.02, 0.05);
    case 'volleyNet': return net(10, 2.55, 2.43, 1.43, 0);
    case 'goal': return goal(7.32, 2.44, 2.0);
    case 'kidsGoal': return goal(5.5, 2.0, 1.5);
    case 'backstop': return backstop();
    case 'bases': return bases(v === 1 ? 18.3 : 27.43); // v 1: softball / little league (60 ft), else 90 ft
  }
}
export const sportLib = (k: SportPiece, v = 0) => cached(`sport:${k}:${v}`, () => sportGeometry(k, v));
