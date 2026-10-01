// People: one jointed body for every walker and resident, varied in the shader so a single
// instanced draw carries a whole crowd (see docs/ASSET_FOUNDRY.md, Families → People).
//
// The body is built once; what changes per person is chosen per instance on the GPU:
//   · skin, hair, trouser and shoe colours come from palettes (marker vertex colours below),
//   · one of five hairstyles (short, long, bun, cap, cropped) — the others collapse away,
//   · shorts or trousers, short or long sleeves — by the region's warmth (climate × season),
//   · the shirt is the instance colour (white = TINT), exactly like every other foundry asset.
//
// It holds up at arm's length (round 11): every limb is one smooth tube from the hip through the
// knee to the ankle (the shoulder through the elbow to the wrist), its vertices shared, so it shades
// round and bends at the joint instead of breaking there; the feet are shoes — a rounded upper on a
// sole, toes turned out a little — and the hands are rounded mittens with a thumb. Each limb vertex
// carries how much it follows the bone below (`aSkin`: 0 thigh … 1 shin … 2 foot; 0 upper arm …
// 1 forearm and hand), and the shader turns positions and normals about the joints from a handful
// of joint angles (`Pose`), the same maths as `skinPoint` here — so the lead's end is put in the
// hand on the CPU from exactly where the shader draws it.
//
// The body is indexed (unlike the foundry's other families): a smooth limb needs its rings shared
// across the joint, and sharing them cuts the vertex shader's work to about a fifth of the same
// triangles unshared. Joints: hips at 0.87 m, knees at 0.47, ankles at 0.085, shoulders at 1.39,
// elbows at 1.12. Front toward −z; origin on the ground.
import * as THREE from 'three';
import { TINT, cached, merge } from './core';

// Marker colours (linear, exact): the shader swaps them for a palette entry per person.
export const MARK = {
  skin: [1, 0, 1],
  hair: [0, 1, 1],
  pants: [1, 1, 0],
  thigh: [0, 1, 0], // trousers or shorts down to just above the knee (skin in swimwear)
  shin: [1, 0, 0], // trousers, or skin when wearing shorts
  forearm: [0, 0, 1], // the sleeve below mid upper-arm: shirt, or skin in short sleeves
  shoe: [1, 0.5, 0],
  sole: [0, 0.5, 1],
  chest: [0.5, 1, 0], // the shirt above a swimsuit top's edge (bare on the beach)
} as const;
// Parts: 0 body · 1/2 right/left leg · 5/6 right/left arm · 9 hair (short/long/bun) ·
// 10 long hair · 11 bun · 12 baseball cap · 13 cropped · 14 headphones. The shader collapses
// what isn't worn.
export const HAIRSTYLES = ['short', 'long', 'bun', 'cap', 'cropped'] as const;
const HAIR_PART0 = 9;
const PHONES = 14;

export const SKIN_TONES = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac, 0x5c3a21, 0xa86b3c, 0xeac096];
export const HAIR_COLOURS = [0x1c1612, 0x3b2a1e, 0x6a4a2c, 0xa8814f, 0x8a8a86, 0x2a1d17, 0xc9a36b, 0x4a3426];
export const TROUSERS = [0x2e3a52, 0x3b4454, 0x5a5e64, 0xc9b99a, 0x2a2c30, 0x6b5a45, 0x46566e, 0x8c7a5c];
// shoes: the upper and its sole — white sneakers, black trainers on white soles, brown and tan
// leather, navy, grey and red trainers, dark brown on a crepe sole (never a black block: the sole
// is the line that reads "shoe")
export const SHOES: [number, number][] = [
  [0xe6e1d6, 0xcfc8b8], [0x2e2c30, 0xeee9df], [0x5e3c26, 0x2e241c], [0x98704a, 0x3a2e24],
  [0x2e3c5c, 0xece6da], [0x86888c, 0xf0ece4], [0xa23e34, 0xf0ece4], [0x4a4038, 0x8c7a62],
];

// ---------------------------------------------------------------- the skeleton
/** The joints of the standing body (metres, front −z, right +x). */
export const JOINT = { hipX: 0.092, hipY: 0.87, kneeY: 0.47, ankleY: 0.085, shX: 0.2, shY: 1.39, elX: 0.235, elY: 1.12, elZ: 0.01, neckY: 1.47 } as const;
/** Where a hand grips (the right hand's palm, standing): the lead runs from here. */
export const GRIP: readonly [number, number, number] = [0.247, 0.815, -0.03];

type V3 = [number, number, number];
const lc = (hex: number): V3 => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// An indexed, welded body: each piece's own normals, a colour, a part and a skin weight per vertex.
class Body {
  P: number[] = []; N: number[] = []; C: number[] = []; A: number[] = []; W: number[] = []; I: number[] = [];
  vert(p: V3, n: V3, c: readonly number[], part: number, w: number) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(c[0], c[1], c[2]); this.A.push(part); this.W.push(w);
    return this.P.length / 3 - 1;
  }
  /** a triangle, wound to face the way its vertex normals do */
  tri(a: number, b: number, c: number) {
    const P = this.P, N = this.N;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const s = fx * (N[a * 3] + N[b * 3] + N[c * 3]) + fy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + fz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
    if (Math.abs(fx) + Math.abs(fy) + Math.abs(fz) < 1e-12) return; // (degenerate: a cap's pole)
    if (s >= 0) this.I.push(a, b, c); else this.I.push(a, c, b);
  }
  /** a three.js shape, welded (a sphere's seam and poles become one vertex), smooth-shaded */
  mesh(g: THREE.BufferGeometry, col: readonly number[], part: number, w: number, smooth = false) {
    const pos = g.getAttribute('position'), idx = g.index;
    const map = new Map<string, number>(), remap: number[] = [];
    if (smooth || !g.getAttribute('normal')) g.computeVertexNormals();
    const nrm = g.getAttribute('normal');
    // weld first (positions only), then average the normals of the welded vertices
    const acc: { p: V3; n: V3 }[] = [];
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
      let j = map.get(k);
      if (j === undefined) { j = acc.length; map.set(k, j); acc.push({ p: [pos.getX(i), pos.getY(i), pos.getZ(i)], n: [0, 0, 0] }); }
      const a = acc[j].n; a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
      remap.push(j);
    }
    const base = this.P.length / 3;
    for (const v of acc) { const L = Math.hypot(...v.n) || 1; this.vert(v.p, [v.n[0] / L, v.n[1] / L, v.n[2] / L], col, part, w); }
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = remap[idx ? idx.getX(t) : t], b = remap[idx ? idx.getX(t + 1) : t + 1], c = remap[idx ? idx.getX(t + 2) : t + 2];
      if (a !== b && b !== c && a !== c) this.tri(base + a, base + b, base + c);
    }
  }
  /** A smooth tube through rings (a limb, the torso): each ring an ellipse about its centre
   *  (rx across, rz front-to-back) with its own colour and skin weight. A ring marked `seam`
   *  repeats the one before it in a new colour — a crisp hem with no break in the shading. */
  tube(rings: { c: V3; rx: number; rz: number; col: readonly number[]; w: number; seam?: boolean }[], sides: number, part: number, caps: [boolean, boolean] = [false, false]) {
    const idx: number[][] = [];
    const real = rings.map((r, i) => (r.seam ? i - 1 : i)); // (a seam ring takes its twin's neighbours)
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      // the ring's frame: along the tube, across it (rx) and to the front (rz)
      let pi = real[i] - 1; while (pi >= 0 && rings[pi].seam) pi--;
      let ni = i + 1; while (ni < rings.length && rings[ni].seam) ni++;
      const a = rings[Math.max(0, pi)].c, b = rings[Math.min(rings.length - 1, ni)].c;
      const t = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const ref: V3 = Math.abs(t[2]) > 0.9 ? [0, 1, 0] : [0, 0, -1];
      const u = norm(cross(t, ref)), v = cross(u, t);
      const ra = rings[Math.max(0, pi)], rb = rings[Math.min(rings.length - 1, ni)], ds = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      const row: number[] = [];
      for (let k = 0; k < sides; k++) {
        const th = (k / sides) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        const p: V3 = [r.c[0] + u[0] * r.rx * cs + v[0] * r.rz * sn, r.c[1] + u[1] * r.rx * cs + v[1] * r.rz * sn, r.c[2] + u[2] * r.rx * cs + v[2] * r.rz * sn];
        // the ellipse's own normal, leaned along the tube where it tapers
        const g = norm([u[0] * cs / r.rx + v[0] * sn / r.rz, u[1] * cs / r.rx + v[1] * sn / r.rz, u[2] * cs / r.rx + v[2] * sn / r.rz]);
        const slope = (Math.hypot(rb.rx * cs, rb.rz * sn) - Math.hypot(ra.rx * cs, ra.rz * sn)) / ds;
        row.push(this.vert(p, norm([g[0] - t[0] * slope, g[1] - t[1] * slope, g[2] - t[2] * slope]), r.col, part, r.w));
      }
      idx.push(row);
      if (i > 0 && !r.seam) {
        const q = idx[i - 1];
        for (let k = 0; k < sides; k++) { const k1 = (k + 1) % sides; this.tri(q[k], row[k], row[k1]); this.tri(q[k], row[k1], q[k1]); }
      }
    }
    // caps: a centre vertex pushed out along the tube
    const cap = (i: number, dir: number) => {
      const r = rings[i], o = rings[i + (dir > 0 ? -1 : 1)];
      const t = norm([(r.c[0] - o.c[0]) , (r.c[1] - o.c[1]), (r.c[2] - o.c[2])]);
      const m = (r.rx + r.rz) * 0.25;
      const c = this.vert([r.c[0] + t[0] * m, r.c[1] + t[1] * m, r.c[2] + t[2] * m], t, r.col, part, r.w);
      const row = idx[i];
      for (let k = 0; k < sides; k++) this.tri(c, row[k], row[(k + 1) % sides]);
    };
    if (caps[0]) cap(0, -1);
    if (caps[1]) cap(rings.length - 1, 1);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.A, 1));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(this.W, 1));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}
const norm = (v: V3): V3 => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A shoe on the right (s = 1) or left foot: a lofted upper on a sole, heel to a rounded toe, its
 *  toes turned out 5°. 10 cm across, 26 cm long, the sole the line that makes it read as a shoe. */
function shoe(B: Body, s: number, part: number) {
  // stations heel → toe: z, width, height of the upper over the sole
  const ST: [number, number, number][] = [[0.078, 0.056, 0.068], [0.064, 0.076, 0.082], [0.028, 0.088, 0.094], [-0.032, 0.094, 0.086], [-0.09, 0.1, 0.066], [-0.134, 0.096, 0.054], [-0.162, 0.08, 0.044], [-0.18, 0.046, 0.03]];
  // the cross-section round the foot: [across (±1 of the half width), height, sole?] — a flat
  // sole 1.8 cm deep under a rounded upper
  const X: [number, number, boolean][] = [[0.9, 0, true], [1, 0.018, true], [0.96, 0.022, false], [0.9, 0.45, false], [0.45, 0.95, false], [-0.45, 0.95, false], [-0.9, 0.45, false], [-0.96, 0.022, false], [-1, 0.018, true], [-0.9, 0, true]];
  const turn = 0.09 * s, ct = Math.cos(turn), st = Math.sin(turn), x0 = JOINT.hipX * s;
  const at = (x: number, y: number, z: number): V3 => [x0 + x * ct + z * st, y, -x * st + z * ct];
  const sh = new THREE.BufferGeometry(), pos: number[] = [], cols: number[][] = [], tri: number[] = [];
  for (const [z, w, h] of ST)
    for (const [u, v, sole] of X) {
      const y = sole ? v : 0.022 + (v - 0.022) * (h - 0.022) / 0.93 + 0.0;
      pos.push(...at(u * w * 0.5, Math.max(0, Math.min(y, h)), z));
      cols.push(sole ? [...MARK.sole] : [...MARK.shoe]);
    }
  const n = X.length;
  for (let i = 0; i + 1 < ST.length; i++) for (let k = 0; k < n; k++) { const a = i * n + k, b = i * n + (k + 1) % n, c = a + n, d = b + n; tri.push(a, c, d, a, d, b); }
  // the heel and the toe closed round a centre each
  const hc = pos.length / 3; pos.push(...at(0, 0.03, 0.086)); cols.push([...MARK.shoe]);
  const tc = pos.length / 3; pos.push(...at(0, 0.014, -0.188)); cols.push([...MARK.shoe]);
  const last = (ST.length - 1) * n;
  for (let k = 0; k < n; k++) { tri.push(hc, k, (k + 1) % n); tri.push(tc, last + (k + 1) % n, last + k); }
  sh.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sh.setIndex(tri);
  sh.computeVertexNormals();
  // (one winding throughout, so the normals agree; turned outward if they came out inward)
  const nn = sh.getAttribute('normal');
  let cx = 0, cy = 0, cz = 0, out = 0;
  const nv = pos.length / 3;
  for (let i = 0; i < nv; i++) { cx += pos[i * 3] / nv; cy += pos[i * 3 + 1] / nv; cz += pos[i * 3 + 2] / nv; }
  for (let i = 0; i < nv; i++) out += nn.getX(i) * (pos[i * 3] - cx) + nn.getY(i) * (pos[i * 3 + 1] - cy) + nn.getZ(i) * (pos[i * 3 + 2] - cz);
  const sg = out < 0 ? -1 : 1;
  // (the colour isn't one per piece here: added vertex by vertex)
  const P0 = B.P.length / 3;
  for (let i = 0; i < nv; i++) B.vert([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], [nn.getX(i) * sg, nn.getY(i) * sg, nn.getZ(i) * sg], cols[i], part, 2);
  for (let t = 0; t < tri.length; t += 3) B.tri(P0 + tri[t], P0 + tri[t + 1], P0 + tri[t + 2]);
}

/** A rounded hand hanging from the wrist (palm in, fingers together, a thumb in front). */
function hand(B: Body, s: number, part: number) {
  const palm = new THREE.SphereGeometry(1, 8, 6).scale(0.023, 0.05, 0.037).translate(0.248 * s, 0.826, -0.024);
  B.mesh(palm, MARK.skin, part, 1);
  const thumb = new THREE.SphereGeometry(1, 6, 4).scale(0.012, 0.027, 0.012).rotateX(-0.35).rotateZ(0.25 * s).translate(0.236 * s, 0.846, -0.056);
  B.mesh(thumb, MARK.skin, part, 1);
}

/** The shared body (≈1.75 m), indexed and smooth, with skin weights for the joints. Built once
 *  (about 15 ms); every call returns its own copy, so a tile can transfer its buffers. */
export function personGeometry() {
  built ??= buildPerson();
  return built.clone();
}
let built: THREE.BufferGeometry | null = null;
function buildPerson() {
  const B = new Body();
  const R = (c: V3, rx: number, rz: number, col: readonly number[], w: number, seam = false) => ({ c, rx, rz, col, w, seam });
  for (const s of [1, -1]) {
    const leg = s > 0 ? 1 : 2, arm = s > 0 ? 5 : 6, x = JOINT.hipX * s;
    // the leg, hip to ankle: trousers to 0.74, then the thigh (shorts end at 0.545), knee, calf
    B.tube([
      R([x, 0.95, 0.005], 0.084, 0.088, MARK.pants, 0),
      R([x, 0.82, 0.006], 0.08, 0.084, MARK.pants, 0),
      R([x, 0.74, 0.004], 0.075, 0.079, MARK.pants, 0),
      R([x, 0.74, 0.004], 0.075, 0.079, MARK.thigh, 0, true),
      R([x, 0.635, 0.0], 0.066, 0.07, MARK.thigh, 0),
      R([x, 0.545, -0.002], 0.059, 0.062, MARK.thigh, 0.05),
      R([x, 0.545, -0.002], 0.059, 0.062, MARK.shin, 0.05, true),
      // (the knee: the bend shared over five rings, so a fully bent knee stays round)
      R([x, 0.5, -0.004], 0.055, 0.058, MARK.shin, 0.2),
      R([x, 0.47, -0.004], 0.054, 0.057, MARK.shin, 0.4),
      R([x, 0.445, -0.003], 0.053, 0.057, MARK.shin, 0.6),
      R([x, 0.415, -0.001], 0.053, 0.057, MARK.shin, 0.8),
      R([x, 0.37, 0.002], 0.053, 0.058, MARK.shin, 1),
      R([x, 0.31, 0.007], 0.052, 0.06, MARK.shin, 1),
      R([x, 0.21, 0.004], 0.045, 0.049, MARK.shin, 1),
      R([x, 0.125, 0.0], 0.04, 0.042, MARK.shin, 1.3),
      R([x, 0.07, 0.0], 0.038, 0.04, MARK.shin, 1.8),
    ], 8, leg);
    shoe(B, s, leg);
    // the arm, shoulder to wrist: the shirt to mid upper-arm (a short sleeve's hem), then the
    // sleeve or bare arm through the elbow to the cuff
    // (its top ring inside the shoulder's round, so no rim shows above the shoulder)
    const ax = (y: number) => s * (0.192 + (1.38 - y) * 0.16);
    B.tube([
      R([ax(1.385), 1.385, 0.0], 0.047, 0.05, TINTC, 0),
      R([ax(1.34), 1.34, 0.0], 0.05, 0.054, TINTC, 0),
      R([ax(1.3), 1.3, 0.003], 0.048, 0.052, TINTC, 0),
      R([ax(1.3), 1.3, 0.003], 0.048, 0.052, MARK.forearm, 0, true),
      R([ax(1.2), 1.2, 0.008], 0.043, 0.047, MARK.forearm, 0.04),
      // (the elbow, likewise over five rings)
      R([s * 0.231, 1.16, 0.01], 0.041, 0.044, MARK.forearm, 0.2),
      R([s * 0.233, 1.135, 0.01], 0.04, 0.043, MARK.forearm, 0.4),
      R([s * 0.235, 1.11, 0.009], 0.039, 0.042, MARK.forearm, 0.6),
      R([s * 0.237, 1.08, 0.006], 0.039, 0.042, MARK.forearm, 0.8),
      R([s * 0.239, 1.04, 0.002], 0.038, 0.041, MARK.forearm, 1),
      R([s * 0.243, 0.96, -0.008], 0.033, 0.037, MARK.forearm, 1),
      R([s * 0.245, 0.89, -0.017], 0.027, 0.031, MARK.forearm, 1),
    ], 7, arm);
    // the shoulder's round (it turns in place about the joint, so the arm's top never shows)
    B.mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.058, 0.06, 0.06).translate(0.192 * s, 1.37, 0.0), TINTC, arm, 0);
    hand(B, s, arm);
  }
  // hips (trousers) and torso (shirt), crotch to the base of the neck
  B.tube([
    R([0, 0.795, 0.004], 0.05, 0.045, MARK.pants, 0),
    R([0, 0.83, 0.005], 0.148, 0.098, MARK.pants, 0),
    R([0, 0.88, 0.008], 0.172, 0.114, MARK.pants, 0),
    R([0, 0.95, 0.004], 0.168, 0.11, MARK.pants, 0),
    R([0, 0.975, 0.002], 0.162, 0.106, MARK.pants, 0),
    R([0, 0.975, 0.002], 0.162, 0.106, TINTC, 0, true),
    R([0, 1.05, -0.002], 0.153, 0.102, TINTC, 0),
    R([0, 1.15, -0.008], 0.165, 0.112, TINTC, 0),
    R([0, 1.25, -0.014], 0.182, 0.122, TINTC, 0),
    R([0, 1.3, -0.012], 0.19, 0.123, TINTC, 0),
    R([0, 1.3, -0.012], 0.19, 0.123, MARK.chest, 0, true),
    R([0, 1.34, -0.008], 0.194, 0.121, MARK.chest, 0),
    R([0, 1.38, 0.0], 0.19, 0.112, MARK.chest, 0),
    R([0, 1.425, 0.002], 0.145, 0.088, MARK.chest, 0),
    R([0, 1.455, 0.004], 0.075, 0.062, MARK.chest, 0),
  ], 12, 0, [true, true]);
  B.tube([R([0, 1.43, 0.004], 0.05, 0.048, MARK.skin, 0), R([0, 1.49, 0.006], 0.047, 0.046, MARK.skin, 0), R([0, 1.545, 0.006], 0.045, 0.044, MARK.skin, 0)], 8, 0);
  // the head: an egg, narrowing to the jaw, with a nose and ears
  const head = new THREE.SphereGeometry(1, 12, 9);
  { const p = head.getAttribute('position'); for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (y < 0 ? 1 + y * 0.16 : 1)); } }
  B.mesh(head.scale(0.097, 0.117, 0.106).translate(0, 1.6, 0.004), MARK.skin, 0, 0, true);
  B.mesh(new THREE.SphereGeometry(1, 6, 4).scale(0.016, 0.024, 0.02).translate(0, 1.583, -0.1), MARK.skin, 0, 0);
  for (const s of [1, -1]) B.mesh(new THREE.SphereGeometry(1, 6, 4).scale(0.013, 0.03, 0.021).translate(0.096 * s, 1.598, 0.01), MARK.skin, 0, 0);
  // a face: eyes, brows (in the hair colour) and a mouth — flat cards just proud of the head, so a
  // face reads up close (a café table, a doorway)
  const face = (w: number, h: number, x: number, y: number, z: number, col: readonly number[]) => B.mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI - Math.atan2(x, 0.1) * 0.8).translate(x, y, z), col, 0, 0);
  for (const s of [1, -1]) {
    face(0.024, 0.012, 0.035 * s, 1.617, -0.0935, lc(0xeee8de)); // the white of the eye
    face(0.012, 0.012, 0.034 * s, 1.617, -0.0942, lc(0x2a211c)); // iris (a dark dot, not a bar)
    face(0.034, 0.009, 0.036 * s, 1.643, -0.0895, MARK.hair); // brow
  }
  face(0.04, 0.011, 0, 1.553, -0.0945, lc(0x8a3f3a)); // mouth
  // hairstyles: a crown over the top, and the back and sides down to the nape — open at the front,
  // so the hairline sits above the brows instead of a helmet over the eyes
  const cap = (id: number, sy = 0.126, segs = 10) => {
    const crown = new THREE.SphereGeometry(1, segs, 3, 0, Math.PI * 2, 0, Math.PI * 0.34);
    const back = new THREE.SphereGeometry(1, segs, 2, Math.PI * 1.5 + 0.6, Math.PI * 2 - 1.2, Math.PI * 0.34, Math.PI * 0.22);
    B.mesh(merge([crown, back]).scale(0.106 * 1.06, sy * 1.04, 0.116 * 1.06).translate(0, 1.6, 0.012), MARK.hair, id, 0, true);
  };
  cap(HAIR_PART0); // shared by short, long and bun
  B.mesh(new THREE.SphereGeometry(1, 8, 5).scale(0.1, 0.17, 0.05).translate(0, 1.5, 0.078), MARK.hair, HAIR_PART0 + 1, 0); // long, down the back
  B.mesh(new THREE.SphereGeometry(0.052, 6, 4).translate(0, 1.672, 0.104), MARK.hair, HAIR_PART0 + 2, 0); // bun
  // cap (the shader tints it from the trouser palette so caps vary)
  B.mesh(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.111, 0.102, 0.12).translate(0, 1.625, 0.008), lc(0xf2efe6), HAIR_PART0 + 3, 0, true);
  B.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 10, 1, false, Math.PI * 0.5, Math.PI).scale(1, 1, 0.9).translate(0, 1.632, -0.085), lc(0xf2efe6), HAIR_PART0 + 3, 0);
  cap(HAIR_PART0 + 4, 0.108, 8); // cropped
  // headphones (worn by some — more of the joggers — per person in the shader): two cups over
  // the ears and the band over the crown
  for (const s of [1, -1]) {
    B.mesh(new THREE.SphereGeometry(1, 6, 4).scale(0.022, 0.038, 0.034).translate(0.112 * s, 1.575, 0.008), lc(0x26262a), PHONES, 0);
    B.mesh(new THREE.BoxGeometry(0.016, 0.1, 0.026).translate(0.108 * s, 1.648, 0.008), lc(0x3a3a40), PHONES, 0);
  }
  B.mesh(new THREE.BoxGeometry(0.21, 0.02, 0.03).translate(0, 1.73, 0.008), lc(0x3a3a40), PHONES, 0);
  return B.geometry();
}
const TINTC = lc(TINT);
export const personLib = () => cached('person', personGeometry);

/** The same body for a crowd seen small (the beach's people far off: world/crowdLayer.ts): the
 *  full body's shape in a sketch — four- and six-sided smooth tubes for the limbs and torso, a
 *  round head under a cap of hair, mitten hands and a shoe — under 200 vertices, indexed and
 *  smooth like the full body (the old one was boxes and an octahedron: a faceted mannequin as soon
 *  as a long lens enlarged it). Its joints, parts, skin weights and markers are the full body's,
 *  so every pose and the per-person look in the shader (PEOPLE, BEACH) work on it unchanged. */
export function personLiteGeometry() {
  const B = new Body();
  const R = (c: V3, rx: number, rz: number, col: readonly number[], w: number) => ({ c, rx, rz, col, w });
  for (const s of [1, -1]) {
    const leg = s > 0 ? 1 : 2, arm = s > 0 ? 5 : 6, x = JOINT.hipX * s;
    B.tube([R([x, 0.93, 0.004], 0.085, 0.088, MARK.pants, 0), R([x, 0.76, 0.004], 0.075, 0.079, MARK.pants, 0), R([x, 0.6, 0.0], 0.064, 0.068, MARK.thigh, 0), R([x, 0.47, -0.004], 0.054, 0.057, MARK.shin, 0.5), R([x, 0.3, 0.006], 0.052, 0.058, MARK.shin, 1), R([x, 0.07, 0.0], 0.038, 0.04, MARK.shin, 1.8)], 4, leg);
    B.mesh(new THREE.BoxGeometry(0.09, 0.075, 0.25).translate(x, 0.0375, -0.05), MARK.shoe, leg, 2, true);
    B.tube([R([s * 0.19, 1.42, 0.0], 0.055, 0.058, TINTC, 0), R([s * 0.212, 1.28, 0.004], 0.047, 0.051, MARK.forearm, 0), R([s * 0.235, 1.12, 0.01], 0.04, 0.043, MARK.forearm, 0.5), R([s * 0.244, 0.9, -0.016], 0.029, 0.033, MARK.forearm, 1)], 4, arm);
    B.mesh(new THREE.SphereGeometry(1, 4, 3).scale(0.026, 0.052, 0.038).translate(0.248 * s, 0.826, -0.024), MARK.skin, arm, 1);
  }
  B.tube([
    R([0, 0.795, 0.004], 0.05, 0.045, MARK.pants, 0), R([0, 0.88, 0.008], 0.172, 0.114, MARK.pants, 0), R([0, 0.97, 0.002], 0.162, 0.106, MARK.pants, 0),
    R([0, 0.985, 0.0], 0.16, 0.105, TINTC, 0), R([0, 1.25, -0.014], 0.182, 0.122, TINTC, 0), R([0, 1.38, 0.0], 0.19, 0.112, MARK.chest, 0), R([0, 1.45, 0.004], 0.08, 0.065, MARK.chest, 0),
  ], 6, 0, [true, true]);
  B.mesh(new THREE.SphereGeometry(1, 6, 4).scale(0.097, 0.118, 0.106).translate(0, 1.58, 0.004), MARK.skin, 0, 0, true);
  B.mesh(new THREE.SphereGeometry(1, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(0.106, 0.13, 0.116).translate(0, 1.6, 0.012), MARK.hair, HAIR_PART0, 0, true);
  return B.geometry();
}
export const personLiteLib = () => cached('person:lite', personLiteGeometry);

// ---------------------------------------------------------------- the pose maths
// A pose is a handful of joint angles (radians). Pitches turn about x: + swings a hanging limb
// forward (toward −z); absolute, measured from hanging straight down. The leg's roll turns it
// about z at the hip (+ carries the foot to +x); an arm's abduction lifts it out to its own side.
/** lr/ll: thigh, shin, foot, roll · ar/al: upper arm, forearm, abduction, – · tk: trunk lean (+
 *  back), trunk roll, head yaw, head nod · rt: where the hip centre goes (x, y, z) and the whole
 *  body's pitch about it (lying down). */
export interface Pose { lr: number[]; ll: number[]; ar: number[]; al: number[]; tk: number[]; rt: number[] }
const { hipX: HX, hipY: HY, kneeY: KY, ankleY: AY } = JOINT;
const rX = (v: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const rZ = (v: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
const rY = (v: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// (the heel's and the toe's undersides, from the ankle)
const HEEL: V3 = [0, -AY, 0.082], TOE: V3 = [0, -AY, -0.182];

/** How low a foot's sole reaches in a pose (the heel or the toe, whichever is lower). */
export function soleLow(sd: number, L: number[]) {
  const J: V3 = [sd * HX, HY, 0];
  const a = add(add(J, rX([0, KY - HY, 0], L[0])), rX([0, AY - KY, 0], L[1]));
  const heel = add(J, rZ(sub(add(a, rX(HEEL, L[2])), J), L[3])), toe = add(J, rZ(sub(add(a, rX(TOE, L[2])), J), L[3]));
  return Math.min(heel[1], toe[1]);
}

/** A walker or resident on its feet: the gait at phase `ph` (radians, 5.2 a metre) and amount
 *  `amt` (0 standing, 1 walking, 1.5 running), the standing idles (`still` 1 mutes them), talking
 *  hands (`talk` 0–1), and a dog's lead in the right hand (`lead`: 0 none, else 1 + how far the
 *  dog has wandered sideways, ±0.25). The planted foot stands on the ground: the hips ride as high
 *  as the lower sole allows. Mirrored line for line by POSE_GLSL's walkPose. */
export function walkPose(ph: number, amt: number, t: number, seed: number, still = 0, talk = 0, lead = 0): Pose {
  const walk = clamp(amt, 0, 1), run = clamp((amt - 1) * 2, 0, 1);
  const idle = (1 - clamp(amt * 4, 0, 1)) * (1 - still);
  const A = 0.36 * walk + 0.14 * run;
  // the weight on one leg, then the other (held ten seconds or so, then shifted): the hips over it,
  // the other knee easy
  const ws = clamp(Math.sin(t * 0.26 + seed * 2.3) * 2.6, -1, 1) * idle, dx = 0.035 * ws;
  const leg = (sd: number) => {
    // (the knee starts to fold before the toe leaves the ground and is straight again before the
    // heel lands: its curve runs half a radian ahead of the thigh's)
    const phi = ph + (sd < 0 ? Math.PI : 0), sn = Math.sin(phi), cs = -Math.cos(phi + 0.5), sw = Math.max(0, cs);
    let T = -A * sn + 0.05 * walk;
    const k = walk * (1.05 * sw * Math.sqrt(sw) + 0.06) + run * 0.5 * sw;
    let S = T - k;
    const b = smooth(0, 0.35, cs);
    // (in stance the foot lands on its heel, lies flat, then rolls up onto its toes)
    let F = walk * (0.3 * Math.max(0, -sn) ** 2 - 0.36 * Math.max(0, sn) ** 3) * (1 - b) + (S + 0.45 * walk) * b;
    const free = Math.max(0, -ws * sd);
    // (the free knee comes forward and the shin back under it: the foot stays where it stood)
    T += 0.12 * free; S += -0.125 * free; F += -0.03 * free;
    return [T, S, F, -dx / 0.79];
  };
  const lr = leg(1), ll = leg(-1);
  const arm = (sd: number) => {
    let U = 0.32 * walk * Math.sin(ph) * sd + 0.04 * walk;
    U += 0.045 * Math.sin(t * 1.1 + seed + sd) * idle;
    const g = talk * (sd > 0 ? 1 : 0.35 + 0.35 * Math.sin(seed)) * (0.75 + 0.25 * Math.sin(t * 3.1 + seed));
    U += 0.2 * g;
    return [U, U + 0.16 + 0.35 * Math.max(0, U) * walk + 1.35 * run + 1.3 * g, 0, 0];
  };
  const ar = arm(1), al = arm(-1);
  if (lead > 0.5) {
    const U = 0.12 + 0.14 * walk + 0.03 * walk * Math.sin(ph);
    // (the forearm lies along the lead: out in front at the hip and a little up, angled down to the dog)
    ar[0] = U; ar[1] = U + 0.7 + 0.15 * walk; ar[2] = 0.14 + 0.3 * (lead - 1);
  }
  const tk = [-0.03 * walk - 0.12 * run, 0.03 * ws, 0.3 * Math.sin(t * 0.21 + seed * 3.7) * idle, 0.07 * talk * Math.sin(t * 2.3 + seed)];
  const rt = [dx, HY - Math.min(soleLow(1, lr), soleLow(-1, ll)), 0, 0];
  return { lr, ll, ar, al, tk, rt };
}
/** Sitting on a 0.45 m seat (a café chair, a sofa): the seat of the trousers on it, the shoes on
 *  the floor, forearms level, leaning back a little; talking hands as a resident's. */
export function seatPose(t: number, seed: number, talk = 0): Pose {
  const P = walkPose(0, 0, t, seed, 1, talk, 0);
  P.lr = [1.447, 0.217, 0, 0]; P.ll = [1.447, 0.217, 0, 0];
  for (const a of [P.ar, P.al]) { a[1] = Math.max(a[1], 1.46); }
  P.tk[0] = 0.1; P.tk[1] = 0;
  P.rt = [0, 0.52, 0, 0];
  return P;
}
/** Knocked down by a car (life.ts tips them onto their back): −1…−1.9 sprawled, knees drawn up,
 *  one arm flung wide, the other across the chest; −2.5 sitting up on the ground, legs out in
 *  front, leaning back on the hands. */
export function downPose(amt: number): Pose {
  const P: Pose = { lr: [0.75, -0.75, 0, 0], ll: [0.3, -0.3, 0, 0], ar: [0.15, 0.45, 1.35, 0], al: [0.75, 1.75, -0.35, 0], tk: [0, 0, 0, 0], rt: [0, HY, 0, 0] };
  if (amt < -1.999) { P.lr = [1.53, 1.53, 1.3, 0]; P.ll = [1.5, 1.5, 1.5, 0]; P.ar = [-0.6, -0.5, 0.15, 0]; P.al = [-0.6, -0.5, 0.15, 0]; P.tk = [0.25, 0, 0, 0]; P.rt = [0, 0.148, 0, 0]; }
  return P;
}
/** The beach's poses (world/crowd.ts POSE): 0 a beach chair, 1 lying on a towel, 2 sitting on the
 *  sand, 3 standing (the standing idles), 4 a kid jumping the waves, 5 the lifeguard up on the
 *  stand's seat. `sd` is the person's own hash (one knee up, which leg folds). */
export function beachPose(pose: number, t: number, seed: number, sd: number): Pose {
  if (pose > 2.5 && pose < 3.5) return walkPose(0, 0, t, seed, 0, 0, 0);
  const P: Pose = { lr: [0, 0, 0, 0], ll: [0, 0, 0, 0], ar: [0, 0.1, 0, 0], al: [0, 0.1, 0, 0], tk: [0, 0, 0, 0], rt: [0, HY, 0, 0] };
  if (pose < 0.5) { P.lr = [1.75, 0.75, 0.4, 0]; P.ll = [1.75, 0.75, 0.4, 0]; P.ar = [0.35, 0.6, 0.06, 0]; P.al = [0.35, 0.6, 0.06, 0]; P.tk[0] = 0.5; P.rt[1] = 0.32; }
  else if (pose < 1.5) {
    if (sd < 0.4) P.lr = [0.85, -0.7, -0.4, 0];
    else P.lr = [0, 0, -0.6, 0.04];
    P.ll = [0, 0, -0.6, -0.04];
    P.rt = [0, 0.14, 0, Math.PI / 2];
  } else if (pose < 2.5) {
    // (the shin set so the heel rests on the sand whatever the thigh's angle)
    const sh = (T: number) => Math.acos(clamp((0.025 - 0.4 * Math.cos(T)) / 0.385, -1, 1)), k = 1.75 + sd * 0.35;
    P.lr = [2.0, sh(2.0), sh(2.0) - 0.5, 0]; P.ll = [k, sh(k), sh(k) - 0.5, 0]; P.ar = [-0.6, -0.5, 0.15, 0]; P.al = [-0.6, -0.5, 0.15, 0]; P.tk[0] = 0.45; P.rt[1] = 0.14;
  } else if (pose < 4.5) {
    const air = Math.max(0, Math.sin(t * (2.6 + sd) + seed));
    P.lr = [0.7 * air, -0.5 * air, -0.4 * air, 0]; P.ll = [0.7 * air, -0.5 * air, -0.4 * air, 0];
    P.ar = [2.4 * air, 2.4 * air + 0.1, 0.3 * air, 0]; P.al = [2.4 * air, 2.4 * air + 0.1, 0.3 * air, 0];
    P.rt[1] = HY + air * air * 0.28;
  } else { P.lr = [1.57, 0.05, 0, 0]; P.ll = [1.57, 0.05, 0, 0]; P.ar = [0.7, 1.2, 0.05, 0]; P.al = [0.7, 1.2, 0.05, 0]; P.tk[0] = -0.05; P.rt[1] = 0.52; }
  return P;
}

/** Where a vertex of the standing body goes in a pose, and its normal: `part` and `w` are its
 *  aPart and aSkin. Mirrored by POSE_GLSL's skinPerson. */
export function skinPoint(p: V3, n: V3, part: number, w: number, P: Pose): [V3, V3] {
  let q: V3 = [...p], m: V3 = [...n];
  const ry = p[1];
  if (part > 0.5 && part < 2.5) {
    const sd = part < 1.5 ? 1 : -1, L = sd > 0 ? P.lr : P.ll;
    const J: V3 = [sd * HX, HY, 0], K: V3 = [sd * HX, KY, 0], A: V3 = [sd * HX, AY, 0];
    // (a hinge: each ring turns about the joint by its share of the bend — a blend of the two
    // bones' transforms would crowd a deep bend into the middle rings and crease the knee)
    const k1 = add(J, rX(sub(K, J), L[0])), a2 = add(k1, rX(sub(A, K), L[1]));
    const a = w < 1 ? L[0] + (L[1] - L[0]) * w : L[1] + (L[2] - L[1]) * (w - 1);
    q = w < 1 ? add(k1, rX(sub(q, K), a)) : add(a2, rX(sub(q, A), a)); m = rX(m, a);
    q = add(J, rZ(sub(q, J), L[3])); m = rZ(m, L[3]);
  } else {
    if (part > 4.5 && part < 6.5) {
      const sd = part < 5.5 ? 1 : -1, Ar = sd > 0 ? P.ar : P.al;
      const S: V3 = [sd * JOINT.shX, JOINT.shY, 0], E: V3 = [sd * JOINT.elX, JOINT.elY, JOINT.elZ];
      const e1 = add(S, rX(sub(E, S), Ar[0])), a = Ar[0] + (Ar[1] - Ar[0]) * clamp(w, 0, 1);
      q = add(e1, rX(sub(q, E), a)); m = rX(m, a);
      q = add(S, rZ(sub(q, S), sd * Ar[2])); m = rZ(m, sd * Ar[2]);
    } else {
      const hw = part > 8.5 ? 1 : smooth(1.45, 1.53, ry), NK: V3 = [0, JOINT.neckY, 0];
      q = add(NK, rY(rX(sub(q, NK), P.tk[3] * hw), P.tk[2] * hw)); m = rY(rX(m, P.tk[3] * hw), P.tk[2] * hw);
    }
    const tw = part > 4.5 ? 1 : smooth(0.9, 1.06, ry), HC: V3 = [0, HY, 0];
    q = add(HC, rZ(rX(sub(q, HC), P.tk[0] * tw), P.tk[1] * tw)); m = rZ(rX(m, P.tk[0] * tw), P.tk[1] * tw);
  }
  q = add([P.rt[0], P.rt[1], P.rt[2]], rX(sub(q, [0, HY, 0]), P.rt[3])); m = rX(m, P.rt[3]);
  return [q, m];
}
/** A point in a person's own frame (`l`) placed in the world: the person stands at (x, y, z)
 *  turned `yaw` about up (front −z) — the instance matrix's own turn. */
export const atWorld = (x: number, y: number, z: number, yaw: number, l: readonly number[]): V3 => [x + Math.cos(yaw) * l[0] + Math.sin(yaw) * l[2], y + l[1], z - Math.sin(yaw) * l[0] + Math.cos(yaw) * l[2]];
/** Where a dog walker's right hand grips the lead (the person's own frame, metres), from the same
 *  pose the shader draws: life.ts runs the lead from here to the dog's collar. */
export function leadHand(ph: number, amt: number, t: number, seed: number, lead: number): V3 {
  return skinPoint([...GRIP], [0, 1, 0], 5, 1, walkPose(ph, amt, t, seed, 0, 0, lead))[0];
}

// The same maths for the GPU. `Pose` packs into six vec4s; every function mirrors its TypeScript
// twin above line for line (tests/people.test.ts checks the TypeScript; the lead and the shoes
// depend on the two agreeing).
const f = (x: number) => x.toFixed(4);
export const POSE_GLSL = /* glsl */ `
  struct Pose { vec4 lr; vec4 ll; vec4 ar; vec4 al; vec4 tk; vec4 rt; };
  const float HX = ${f(HX)}, HY = ${f(HY)}, KY = ${f(KY)}, AY = ${f(AY)}, NECKY = ${f(JOINT.neckY)};
  const vec3 SHJ = vec3(${f(JOINT.shX)}, ${f(JOINT.shY)}, 0.0), ELJ = vec3(${f(JOINT.elX)}, ${f(JOINT.elY)}, ${f(JOINT.elZ)});
  vec3 rX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
  vec3 rZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
  vec3 rY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
  float soleLow(float sd, vec4 L) {
    vec3 J = vec3(sd * HX, HY, 0.0);
    vec3 a = J + rX(vec3(0.0, KY - HY, 0.0), L.x) + rX(vec3(0.0, AY - KY, 0.0), L.y);
    vec3 heel = J + rZ(a + rX(vec3(0.0, -AY, 0.082), L.z) - J, L.w), toe = J + rZ(a + rX(vec3(0.0, -AY, -0.182), L.z) - J, L.w);
    return min(heel.y, toe.y);
  }
  vec4 pLeg(float sd, float ph, float A, float walk, float run, float ws, float dx) {
    float phi = ph + (sd < 0.0 ? 3.14159265 : 0.0), sn = sin(phi), cs = -cos(phi + 0.5), sw = max(0.0, cs);
    float T = -A * sn + 0.05 * walk;
    float k = walk * (1.05 * sw * sqrt(sw) + 0.06) + run * 0.5 * sw;
    float S = T - k;
    float b = smoothstep(0.0, 0.35, cs);
    float F = walk * (0.3 * pow(max(0.0, -sn), 2.0) - 0.36 * pow(max(0.0, sn), 3.0)) * (1.0 - b) + (S + 0.45 * walk) * b;
    float fr = max(0.0, -ws * sd);
    T += 0.12 * fr; S += -0.125 * fr; F += -0.03 * fr;
    return vec4(T, S, F, -dx / 0.79);
  }
  vec4 pArm(float sd, float ph, float walk, float run, float idle, float t, float seed, float talk) {
    float U = 0.32 * walk * sin(ph) * sd + 0.04 * walk;
    U += 0.045 * sin(t * 1.1 + seed + sd) * idle;
    float g = talk * (sd > 0.0 ? 1.0 : 0.35 + 0.35 * sin(seed)) * (0.75 + 0.25 * sin(t * 3.1 + seed));
    U += 0.2 * g;
    return vec4(U, U + 0.16 + 0.35 * max(0.0, U) * walk + 1.35 * run + 1.3 * g, 0.0, 0.0);
  }
  Pose walkPose(float ph, float amt, float t, float seed, float still, float talk, float lead) {
    Pose P;
    float walk = clamp(amt, 0.0, 1.0), run = clamp((amt - 1.0) * 2.0, 0.0, 1.0);
    float idle = (1.0 - clamp(amt * 4.0, 0.0, 1.0)) * (1.0 - still);
    float A = 0.36 * walk + 0.14 * run;
    float ws = clamp(sin(t * 0.26 + seed * 2.3) * 2.6, -1.0, 1.0) * idle, dx = 0.035 * ws;
    P.lr = pLeg(1.0, ph, A, walk, run, ws, dx); P.ll = pLeg(-1.0, ph, A, walk, run, ws, dx);
    P.ar = pArm(1.0, ph, walk, run, idle, t, seed, talk); P.al = pArm(-1.0, ph, walk, run, idle, t, seed, talk);
    if (lead > 0.5) {
      float U = 0.12 + 0.14 * walk + 0.03 * walk * sin(ph);
      P.ar = vec4(U, U + 0.7 + 0.15 * walk, 0.14 + 0.3 * (lead - 1.0), 0.0);
    }
    P.tk = vec4(-0.03 * walk - 0.12 * run, 0.03 * ws, 0.3 * sin(t * 0.21 + seed * 3.7) * idle, 0.07 * talk * sin(t * 2.3 + seed));
    P.rt = vec4(dx, HY - min(soleLow(1.0, P.lr), soleLow(-1.0, P.ll)), 0.0, 0.0);
    return P;
  }
  Pose seatPose(float t, float seed, float talk) {
    Pose P = walkPose(0.0, 0.0, t, seed, 1.0, talk, 0.0);
    P.lr = vec4(1.447, 0.217, 0.0, 0.0); P.ll = P.lr;
    P.ar.y = max(P.ar.y, 1.46); P.al.y = max(P.al.y, 1.46);
    P.tk.x = 0.1; P.tk.y = 0.0;
    P.rt = vec4(0.0, 0.52, 0.0, 0.0);
    return P;
  }
  Pose downPose(float amt) {
    Pose P;
    P.lr = vec4(0.75, -0.75, 0.0, 0.0); P.ll = vec4(0.3, -0.3, 0.0, 0.0); P.ar = vec4(0.15, 0.45, 1.35, 0.0); P.al = vec4(0.75, 1.75, -0.35, 0.0); P.tk = vec4(0.0); P.rt = vec4(0.0, HY, 0.0, 0.0);
    if (amt < -1.999) { P.lr = vec4(1.53, 1.53, 1.3, 0.0); P.ll = vec4(1.5, 1.5, 1.5, 0.0); P.ar = vec4(-0.6, -0.5, 0.15, 0.0); P.al = P.ar; P.tk = vec4(0.25, 0.0, 0.0, 0.0); P.rt = vec4(0.0, 0.148, 0.0, 0.0); }
    return P;
  }
  Pose beachPose(float pose, float t, float seed, float sd) {
    if (pose > 2.5 && pose < 3.5) return walkPose(0.0, 0.0, t, seed, 0.0, 0.0, 0.0);
    Pose P;
    P.lr = vec4(0.0); P.ll = vec4(0.0); P.ar = vec4(0.0, 0.1, 0.0, 0.0); P.al = P.ar; P.tk = vec4(0.0); P.rt = vec4(0.0, HY, 0.0, 0.0);
    if (pose < 0.5) { P.lr = vec4(1.75, 0.75, 0.4, 0.0); P.ll = P.lr; P.ar = vec4(0.35, 0.6, 0.06, 0.0); P.al = P.ar; P.tk.x = 0.5; P.rt.y = 0.32; }
    else if (pose < 1.5) {
      P.lr = sd < 0.4 ? vec4(0.85, -0.7, -0.4, 0.0) : vec4(0.0, 0.0, -0.6, 0.04);
      P.ll = vec4(0.0, 0.0, -0.6, -0.04);
      P.rt = vec4(0.0, 0.14, 0.0, 1.5707963);
    } else if (pose < 2.5) {
      float k = 1.75 + sd * 0.35, s0 = acos(clamp((0.025 - 0.4 * cos(2.0)) / 0.385, -1.0, 1.0)), s1 = acos(clamp((0.025 - 0.4 * cos(k)) / 0.385, -1.0, 1.0));
      P.lr = vec4(2.0, s0, s0 - 0.5, 0.0); P.ll = vec4(k, s1, s1 - 0.5, 0.0); P.ar = vec4(-0.6, -0.5, 0.15, 0.0); P.al = P.ar; P.tk.x = 0.45; P.rt.y = 0.14;
    } else if (pose < 4.5) {
      float air = max(0.0, sin(t * (2.6 + sd) + seed));
      P.lr = vec4(0.7 * air, -0.5 * air, -0.4 * air, 0.0); P.ll = P.lr;
      P.ar = vec4(2.4 * air, 2.4 * air + 0.1, 0.3 * air, 0.0); P.al = P.ar;
      P.rt.y = HY + air * air * 0.28;
    } else { P.lr = vec4(1.57, 0.05, 0.0, 0.0); P.ll = P.lr; P.ar = vec4(0.7, 1.2, 0.05, 0.0); P.al = P.ar; P.tk.x = -0.05; P.rt.y = 0.52; }
    return P;
  }
  vec3 skinPerson(vec3 q, inout vec3 m, float part, float w, Pose P) {
    float ry = q.y;
    if (part > 0.5 && part < 2.5) {
      float sd = part < 1.5 ? 1.0 : -1.0; vec4 L = sd > 0.0 ? P.lr : P.ll;
      vec3 J = vec3(sd * HX, HY, 0.0), K = vec3(sd * HX, KY, 0.0), A = vec3(sd * HX, AY, 0.0);
      vec3 k1 = J + rX(K - J, L.x), a2 = k1 + rX(A - K, L.y);
      float a = w < 1.0 ? mix(L.x, L.y, w) : mix(L.y, L.z, w - 1.0);
      q = w < 1.0 ? k1 + rX(q - K, a) : a2 + rX(q - A, a); m = rX(m, a);
      q = J + rZ(q - J, L.w); m = rZ(m, L.w);
    } else {
      if (part > 4.5 && part < 6.5) {
        float sd = part < 5.5 ? 1.0 : -1.0; vec4 Ar = sd > 0.0 ? P.ar : P.al;
        vec3 S = vec3(sd * SHJ.x, SHJ.y, 0.0), E = vec3(sd * ELJ.x, ELJ.y, ELJ.z);
        vec3 e1 = S + rX(E - S, Ar.x); float a = mix(Ar.x, Ar.y, clamp(w, 0.0, 1.0));
        q = e1 + rX(q - E, a); m = rX(m, a);
        q = S + rZ(q - S, sd * Ar.z); m = rZ(m, sd * Ar.z);
      } else {
        float hw = part > 8.5 ? 1.0 : smoothstep(1.45, 1.53, ry); vec3 NK = vec3(0.0, NECKY, 0.0);
        q = NK + rY(rX(q - NK, P.tk.w * hw), P.tk.z * hw); m = rY(rX(m, P.tk.w * hw), P.tk.z * hw);
      }
      float tw = part > 4.5 ? 1.0 : smoothstep(0.9, 1.06, ry); vec3 HC = vec3(0.0, HY, 0.0);
      q = HC + rZ(rX(q - HC, P.tk.x * tw), P.tk.y * tw); m = rZ(rX(m, P.tk.x * tw), P.tk.y * tw);
    }
    q = P.rt.xyz + rX(q - vec3(0.0, HY, 0.0), P.rt.w); m = rX(m, P.rt.w);
    return q;
  }
`;

/** The body baked into one pose with one look (the helm's skipper: player/vehicles.ts): the short
 *  hair, the rest of the wardrobe dropped, the markers painted. Indexed, smooth. */
export function posedPerson(P: Pose, look: [readonly number[], number][]) {
  const src = personLib(), pos = src.getAttribute('position'), nrm = src.getAttribute('normal'), col = src.getAttribute('color'), part = src.getAttribute('aPart'), sk = src.getAttribute('aSkin'), idx = src.index!;
  const keep = new Int32Array(pos.count).fill(-1), Po: number[] = [], No: number[] = [], Co: number[] = [], Io: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    if (part.getX(i) >= HAIR_PART0 + 0.5) continue; // (the other hairstyles, the cap, the headphones)
    const [q, m] = skinPoint([pos.getX(i), pos.getY(i), pos.getZ(i)], [nrm.getX(i), nrm.getY(i), nrm.getZ(i)], part.getX(i), sk.getX(i), P);
    keep[i] = Po.length / 3;
    Po.push(...q); No.push(...norm(m));
    let r = col.getX(i), g = col.getY(i), b = col.getZ(i);
    for (const [mk, hex] of look) if (Math.abs(r - mk[0]) < 0.01 && Math.abs(g - mk[1]) < 0.01 && Math.abs(b - mk[2]) < 0.01) { [r, g, b] = lc(hex); break; }
    Co.push(r, g, b);
  }
  for (let t = 0; t < idx.count; t += 3) { const a = keep[idx.getX(t)], b = keep[idx.getX(t + 1)], c = keep[idx.getX(t + 2)]; if (a >= 0 && b >= 0 && c >= 0) Io.push(a, b, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Po, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(No, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Co, 3));
  g.setIndex(Io);
  g.computeBoundingSphere();
  return g;
}

// sat < 1 calms a palette in the painted world (skin at full chroma read as orange)
const lin = (hex: number, sat = 1) => { const c = new THREE.Color(hex), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * sat, hsl.l); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const arr = (name: string, hexes: number[], sat = 1) => `const vec3 ${name}[${hexes.length}] = vec3[${hexes.length}](${hexes.map((h) => lin(h, sat)).join(', ')});`;
const mk = (m: readonly number[]) => `vec3(${m.map((v) => v.toFixed(1)).join(', ')})`;

/** Vertex-shader chunk (inside main, after `vec3 p = position;`, before the pose): picks this
 *  person's look and rewrites `p` (hairstyle) and `pc` (the vertex colour to use). Needs
 *  `uniform float uWarmth;` and the arrays from PEOPLE_GLSL_DECL. `seed` is a float per person. */
export const PEOPLE_GLSL_DECL = /* glsl */ `
uniform float uWarmth;
attribute float aSkin;
${arr('SKIN', SKIN_TONES, 0.72)}
${arr('HAIRC', HAIR_COLOURS)}
${arr('PANTS', TROUSERS)}
${arr('SHOEC', SHOES.map((s) => s[0]), 0.85)}
${arr('SOLEC', SHOES.map((s) => s[1]))}
float pHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
bool isMark(vec3 c, vec3 m) { return all(lessThan(abs(c - m), vec3(0.01))); }
${POSE_GLSL}
`;
export const PEOPLE_GLSL_MAIN = /* glsl */ `
  {
    float r1 = pHash(seed), r2 = pHash(seed + 1.7), r3 = pHash(seed + 3.1), r4 = pHash(seed + 5.3), r5 = pHash(seed + 7.9);
    float style = floor(r2 * ${HAIRSTYLES.length}.0);
    // hair parts: 9 base (styles 0–2) · 10 long (1) · 11 bun (2) · 12 cap (3) · 13 cropped (4)
    if (aPart > ${PHONES - 0.5}) {
      // headphones: one in seven, over half the joggers (a runner's amount is > 1)
      if (pHash(seed + 11.3) > (amt > 1.2 ? 0.55 : 0.14)) p = vec3(0.0, 1.58, 0.0);
    } else if (aPart > ${HAIR_PART0 - 0.5}) {
      float hp = aPart - ${HAIR_PART0}.0;
      bool worn = hp < 0.5 ? style < 2.5 : abs(hp - style) < 0.5;
      if (!worn) p = vec3(0.0, 1.58, 0.0);
    }
    vec3 skin = SKIN[int(r1 * ${SKIN_TONES.length}.0)];
    vec3 hair = HAIRC[int(r3 * ${HAIR_COLOURS.length}.0)];
    vec3 pants = PANTS[int(r4 * ${TROUSERS.length}.0)];
    int sh = int(pHash(seed + 9.1) * ${SHOES.length}.0);
    bool shorts = r5 < uWarmth * 0.75;
    bool shortSleeves = fract(r5 * 7.13) < uWarmth;
    if (isMark(pc, ${mk(MARK.skin)})) pc = skin;
    else if (isMark(pc, ${mk(MARK.hair)})) pc = hair;
    else if (isMark(pc, ${mk(MARK.pants)}) || isMark(pc, ${mk(MARK.thigh)})) pc = pants;
    else if (isMark(pc, ${mk(MARK.shin)})) pc = shorts ? skin : pants;
    else if (isMark(pc, ${mk(MARK.forearm)})) pc = shortSleeves ? skin : vec3(1.0);
    else if (isMark(pc, ${mk(MARK.shoe)})) pc = SHOEC[sh];
    else if (isMark(pc, ${mk(MARK.sole)})) pc = SOLEC[sh];
    else if (isMark(pc, ${mk(MARK.chest)})) pc = vec3(1.0);
    else if (aPart > ${HAIR_PART0 + 2.5} && aPart < ${HAIR_PART0 + 3.5}) pc = PANTS[int(fract(r4 * 3.7) * ${TROUSERS.length}.0)] * 1.4;
  }
`;

/** How warmly a region dresses right now: 0 (winter coats) … 1 (beach). */
export function warmthFor(climate: string, month: number, south = false) {
  const base: Record<string, number> = { tropical: 0.9, arid: 0.65, mediterranean: 0.6, temperate: 0.45, continental: 0.38, boreal: 0.25, polar: 0.08 };
  const m = south ? ((month + 5) % 12) + 1 : month;
  const summer = 0.5 - 0.5 * Math.cos(((m - 1.5) / 12) * Math.PI * 2); // 0 mid-Jan … 1 mid-Jul
  return Math.max(0, Math.min(1, (base[climate] ?? 0.45) + (summer - 0.5) * 0.7));
}
