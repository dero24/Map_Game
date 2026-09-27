// Decor — the furniture family for interiors (and café terraces outside). docs/ASSET_FOUNDRY.md.
//
// The interior builder used to stack boxes ("crates"). A room reads as lived-in from its
// silhouettes — soft cushions, tapered legs, a curved chair back, a lampshade — so every piece
// here is a small recipe of rounded parts. A piece is a list of parts, each with a material
// channel the interior shader understands (fabric weave, wood grain, metal, porcelain, glass)
// and a colour. Local frame: x across the width, y up from the floor, z depth with the BACK at
// +z (against the wall) and the front toward −z; centred on x and z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type DecorMat = 'fabric' | 'wood' | 'metal' | 'porcelain' | 'glass' | 'solid' | 'glow';
export interface DecorPart { g: THREE.BufferGeometry; mat: DecorMat; hex: number }
type Parts = DecorPart[];

// (RoundedBoxGeometry is already non-indexed: calling toNonIndexed() on it only floods the console)
const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const rbox = (w: number, h: number, d: number, r: number, x: number, y: number, z: number) =>
  ni(new RoundedBoxGeometry(Math.max(w, 2 * r + 0.001), Math.max(h, 2 * r + 0.001), Math.max(d, 2 * r + 0.001), 2, r)).translate(x, y + h / 2, z);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, segs = 8) => new THREE.CylinderGeometry(r1, r0, h, segs).toNonIndexed().translate(x, y + h / 2, z);
const lighten = (hex: number, t: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), t).getHex();
const darken = (hex: number, t: number) => new THREE.Color(hex).multiplyScalar(1 - t).getHex();
const P = (g: THREE.BufferGeometry, mat: DecorMat, hex: number): DecorPart => ({ g, mat, hex });

/** Tapered legs at the four corners of a w×d footprint (inset `i`), height h. */
function legs(w: number, d: number, h: number, i: number, r: number, hex: number, splay = 0): Parts {
  const out: Parts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = cyl(r * 0.7, r, h, 0, 0, 0, 6);
    if (splay) g.rotateZ(-sx * splay).rotateX(sz * splay);
    g.translate(sx * (w / 2 - i), 0, sz * (d / 2 - i));
    out.push(P(g, 'wood', hex));
  }
  return out;
}

export function sofa(w: number, d: number, fab: number, legHex = 0x3a2e24, cushionHex?: number): Parts {
  const cu = cushionHex ?? lighten(fab, 0.1);
  const out: Parts = [
    P(rbox(w, 0.3, d, 0.06, 0, 0.1, 0), 'fabric', fab), // base
    P(rbox(w, 0.52, 0.22, 0.08, 0, 0.36, d / 2 - 0.11), 'fabric', fab), // back
    P(rbox(0.2, 0.3, d, 0.08, -w / 2 + 0.1, 0.36, 0), 'fabric', fab), // arms
    P(rbox(0.2, 0.3, d, 0.08, w / 2 - 0.1, 0.36, 0), 'fabric', fab),
    ...legs(w, d, 0.1, 0.07, 0.03, legHex),
  ];
  const n = w > 1.8 ? 3 : 2, cw = (w - 0.4) / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.2 + cw * (i + 0.5);
    out.push(P(rbox(cw - 0.02, 0.13, d - 0.3, 0.06, x, 0.4, -0.08), 'fabric', cu)); // seat cushion
    const bk = rbox(cw - 0.04, 0.42, 0.16, 0.07, x, 0.5, d / 2 - 0.27);
    bk.rotateX(-0.12);
    out.push(P(bk, 'fabric', cu)); // back cushion, leaning back a touch
  }
  return out;
}

export function armchair(w: number, d: number, fab: number, legHex = 0x3a2e24): Parts {
  return [
    P(rbox(w, 0.28, d, 0.07, 0, 0.12, 0), 'fabric', fab),
    P(rbox(w, 0.55, 0.2, 0.09, 0, 0.35, d / 2 - 0.1), 'fabric', fab),
    P(rbox(0.16, 0.26, d, 0.07, -w / 2 + 0.08, 0.36, 0), 'fabric', fab),
    P(rbox(0.16, 0.26, d, 0.07, w / 2 - 0.08, 0.36, 0), 'fabric', fab),
    P(rbox(w - 0.34, 0.12, d - 0.26, 0.05, 0, 0.4, -0.06), 'fabric', lighten(fab, 0.1)),
    ...legs(w, d, 0.12, 0.06, 0.028, legHex, 0.08),
  ];
}

export function bed(w: number, d: number, fab: number, wood: number, sheet = 0xf6f4ee): Parts {
  const out: Parts = [
    P(rbox(w, 0.22, d, 0.04, 0, 0.12, 0), 'wood', wood), // frame
    ...legs(w, d, 0.12, 0.05, 0.04, wood),
    P(rbox(w - 0.06, 0.22, d - 0.1, 0.07, 0, 0.32, -0.02), 'fabric', sheet), // mattress
    P(rbox(w + 0.02, 0.1, d * 0.66, 0.05, 0, 0.47, -d / 2 + d * 0.33 - 0.02), 'fabric', fab), // duvet
    P(rbox(w + 0.03, 0.05, 0.28, 0.025, 0, 0.55, -d / 2 + d * 0.66 - 0.16), 'fabric', lighten(fab, 0.3)), // folded edge
    P(rbox(w, 1.05, 0.08, 0.035, 0, 0.0, d / 2 - 0.04), 'wood', wood), // headboard
  ];
  const pw = (w - 0.24) / 2;
  for (const s of [-1, 1]) {
    const pl = rbox(pw, 0.14, 0.36, 0.06, s * (pw / 2 + 0.05), 0.54, d / 2 - 0.3);
    pl.rotateX(-0.25).translate(0, 0.08, -0.02);
    out.push(P(pl, 'fabric', 0xfbfaf6));
  }
  return out;
}

export function table(w: number, d: number, h: number, wood: number): Parts {
  return [
    P(rbox(w, 0.04, d, 0.015, 0, h - 0.04, 0), 'wood', wood),
    P(rbox(w - 0.14, 0.08, d - 0.14, 0.01, 0, h - 0.12, 0), 'wood', darken(wood, 0.08)), // apron
    ...legs(w, d, h - 0.04, 0.07, 0.03, wood),
  ];
}

export function roundTable(r: number, h: number, top: number, base = 0x3a3530): Parts {
  return [
    P(cyl(r, r, 0.035, 0, h - 0.035, 0, 16), 'wood', top),
    P(cyl(0.035, 0.03, h - 0.035, 0, 0, 0, 8), 'metal', base),
    P(cyl(0.22, 0.2, 0.03, 0, 0, 0, 12), 'metal', base),
  ];
}

/** A dining chair: splayed tapered legs, a seat with a rounded edge, posts + a curved top rail + slats. */
export function chair(hex: number, cushion?: number): Parts {
  const out: Parts = [
    P(rbox(0.42, 0.045, 0.42, 0.018, 0, 0.42, 0), 'wood', hex),
    ...legs(0.4, 0.4, 0.42, 0.04, 0.02, hex, 0.04),
  ];
  for (const s of [-1, 1]) out.push(P(cyl(0.017, 0.02, 0.5, s * 0.17, 0.46, 0.18, 6), 'wood', hex));
  const rail = rbox(0.4, 0.07, 0.03, 0.012, 0, 0.88, 0.2);
  rail.rotateX(-0.08);
  out.push(P(rail, 'wood', hex));
  for (const x of [-0.08, 0, 0.08]) out.push(P(rbox(0.035, 0.36, 0.018, 0.006, x, 0.5, 0.19), 'wood', hex));
  if (cushion !== undefined) out.push(P(rbox(0.38, 0.04, 0.38, 0.018, 0, 0.465, -0.01), 'fabric', cushion));
  return out;
}

/** A bistro chair: round seat, thin metal legs, a hooped back. */
export function bistroChair(hex: number): Parts {
  const out: Parts = [P(cyl(0.2, 0.2, 0.035, 0, 0.44, 0, 14), 'wood', hex)];
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) out.push(P(cyl(0.012, 0.012, 0.44, x, 0, z, 5), 'metal', 0x2e2c2a));
  const hoop = new THREE.TorusGeometry(0.18, 0.012, 5, 12, Math.PI).toNonIndexed();
  hoop.translate(0, 0.62, 0.17);
  out.push(P(hoop, 'metal', 0x2e2c2a));
  for (const s of [-1, 1]) out.push(P(cyl(0.012, 0.012, 0.2, s * 0.18, 0.46, 0.17, 5), 'metal', 0x2e2c2a));
  return out;
}

export function officeChair(fab: number): Parts {
  const out: Parts = [
    P(rbox(0.48, 0.08, 0.46, 0.035, 0, 0.44, 0), 'fabric', fab),
    P(rbox(0.44, 0.5, 0.07, 0.035, 0, 0.58, 0.22), 'fabric', fab),
    P(cyl(0.025, 0.025, 0.36, 0, 0.08, 0, 8), 'metal', 0x3a3b3e),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.BoxGeometry(0.03, 0.03, 0.28).toNonIndexed().translate(0, 0.07, 0.14).rotateY(a);
    out.push(P(arm, 'metal', 0x2a2b2e));
    out.push(P(new THREE.SphereGeometry(0.025, 5, 4).toNonIndexed().translate(Math.sin(a) * 0.28, 0.025, Math.cos(a) * 0.28), 'metal', 0x1c1d20));
  }
  return out;
}

/** A desk monitor + keyboard (sits on a desk top at y = 0). */
export function monitor(): Parts {
  return [
    P(rbox(0.56, 0.34, 0.03, 0.012, 0, 0.12, 0.05), 'glass', 0x1c1d22),
    P(cyl(0.02, 0.02, 0.12, 0, 0, 0.07, 6), 'metal', 0x3a3b3e),
    P(rbox(0.2, 0.012, 0.14, 0.005, 0, 0, 0.07), 'metal', 0x3a3b3e),
    P(rbox(0.42, 0.02, 0.14, 0.008, 0, 0, -0.22), 'solid', 0xe9e9e4),
  ];
}

/** A lamp with a turned shade. `floor` = a standard lamp, else a table lamp (sits at y = 0). */
export function lamp(floor: boolean, shade = 0xfff1d0): Parts {
  const h = floor ? 1.5 : 0.48;
  const sh = new THREE.LatheGeometry([new THREE.Vector2(floor ? 0.2 : 0.15, 0), new THREE.Vector2(floor ? 0.14 : 0.1, floor ? 0.3 : 0.2)], 12).toNonIndexed();
  sh.translate(0, h - (floor ? 0.3 : 0.2), 0);
  return [
    P(cyl(floor ? 0.14 : 0.08, floor ? 0.12 : 0.06, 0.03, 0, 0, 0, 12), 'metal', 0x3a3530),
    P(cyl(0.012, 0.012, h - 0.1, 0, 0.03, 0, 6), 'metal', 0x3a3530),
    P(sh, 'glow', shade),
  ];
}

/** A café / bakery counter with a curved glass pastry case and an espresso machine. */
export function counter(w: number, d: number, wood: number, withCase = true): Parts {
  const out: Parts = [
    P(rbox(w, 0.98, d, 0.03, 0, 0, 0), 'wood', wood),
    P(rbox(w + 0.06, 0.05, d + 0.06, 0.02, 0, 0.98, 0), 'solid', 0x3a3530),
    P(rbox(0.42, 0.42, 0.36, 0.05, w / 2 - 0.35, 1.03, 0.05), 'porcelain', 0xb8bcbf), // espresso machine
  ];
  if (withCase) {
    const cw = Math.min(1.4, w * 0.45);
    out.push(P(rbox(cw, 0.36, d * 0.8, 0.12, -w / 2 + cw / 2 + 0.15, 1.03, -0.02), 'glass', 0xcfe0e4));
    for (let i = 0; i < 6; i++) out.push(P(new THREE.SphereGeometry(0.055, 7, 5).toNonIndexed().scale(1, 0.6, 1).translate(-w / 2 + 0.28 + i * (cw - 0.26) / 5, 1.07, -0.02 + ((i % 2) - 0.5) * 0.14), 'porcelain', [0xd9a45b, 0xc46a4a, 0xf1dcb0, 0x7a4a2e][i % 4]));
  }
  return out;
}

/** A ceiling fan hanging from y = 0.45 (its top) down: downrod, motor housing, a glass light
 *  globe and five pitched blades (not two crossed planks). */
export function ceilingFan(blade: number, metal = 0xd8d2c4): Parts {
  const out: Parts = [
    P(cyl(0.015, 0.015, 0.22, 0, 0.23, 0, 6), 'metal', metal),
    P(cyl(0.06, 0.05, 0.03, 0, 0.42, 0, 10), 'metal', metal), // ceiling canopy
    P(cyl(0.11, 0.09, 0.1, 0, 0.13, 0, 12), 'metal', metal), // motor
    P(new THREE.SphereGeometry(0.075, 10, 6).toNonIndexed().scale(1, 0.8, 1).translate(0, 0.08, 0), 'glow', 0xfff1d0),
  ];
  for (let k = 0; k < 5; k++) {
    const g = ni(new RoundedBoxGeometry(0.5, 0.012, 0.13, 1, 0.005)).rotateX(0.18).translate(0.36, 0.17, 0).rotateY((k / 5) * Math.PI * 2);
    out.push(P(g, 'wood', blade));
  }
  return out;
}

/** A storage bench: a panelled wooden chest on short feet with a loose cushion (hall, bedroom foot). */
export function chestBench(w: number, d: number, wood: number, fab: number): Parts {
  return [
    P(rbox(w, 0.36, d, 0.025, 0, 0.06, 0), 'wood', wood),
    P(rbox(w + 0.03, 0.03, d + 0.03, 0.012, 0, 0.42, 0), 'wood', darken(wood, 0.12)),
    P(rbox(w - 0.1, 0.22, 0.01, 0.005, 0, 0.13, -d / 2 - 0.004), 'wood', darken(wood, 0.08)), // front panel
    ...legs(w - 0.06, d - 0.06, 0.06, 0, 0.025, darken(wood, 0.2)),
    P(rbox(w - 0.06, 0.07, d - 0.04, 0.03, 0, 0.45, 0), 'fabric', fab),
  ];
}

/** Diner booth: two high-backed benches facing across a table (x = along the table). */
export function booth(len: number, fab: number, top: number): Parts {
  const out: Parts = [...table(len, 0.72, 0.74, top)];
  for (const s of [-1, 1]) {
    out.push(P(rbox(len, 0.42, 0.5, 0.06, 0, 0.0, s * 0.72), 'fabric', fab));
    out.push(P(rbox(len, 0.72, 0.16, 0.07, 0, 0.42, s * 0.98), 'fabric', fab));
  }
  return out;
}

/** A shop shelving unit (the back wall of a shop), stocked by seed. */
export function shelves(w: number, d: number, h: number, wood: number, stock: number[], seed: number): Parts {
  const out: Parts = [P(rbox(w, h, 0.03, 0.01, 0, 0, d / 2 - 0.015), 'wood', wood)];
  const n = Math.max(3, Math.floor(h / 0.42));
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  for (let r = 0; r < n; r++) {
    const y = 0.12 + r * (h - 0.2) / n;
    out.push(P(rbox(w, 0.025, d, 0.008, 0, y, 0), 'wood', darken(wood, 0.1)));
    let x = -w / 2 + 0.04;
    while (x < w / 2 - 0.1) {
      const iw = 0.07 + rnd() * 0.12, ih = 0.12 + rnd() * 0.2;
      if (rnd() > 0.12) out.push(P(rbox(iw, ih, d * 0.7, 0.012, x + iw / 2, y + 0.025, -0.02), 'solid', stock[Math.floor(rnd() * stock.length)]));
      x += iw + 0.015;
    }
  }
  return out;
}

/** A potted plant: a turned pot and a few leafy masses. */
export function pottedPlant(big: boolean, leaf = 0x5f8a45, pot = 0xa86a4a): Parts {
  const r = big ? 0.2 : 0.12, h = big ? 0.38 : 0.2;
  const potG = new THREE.LatheGeometry([new THREE.Vector2(r * 0.7, 0), new THREE.Vector2(r, h), new THREE.Vector2(r * 1.05, h)], 10).toNonIndexed();
  const out: Parts = [P(potG, 'porcelain', pot)];
  const n = big ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, rr = r * (big ? 1.5 : 1.2) * (0.8 + (i % 3) * 0.12);
    out.push(P(new THREE.IcosahedronGeometry(rr, 1).toNonIndexed().scale(1, 1.3, 1).translate(Math.cos(a) * r * 0.5, h + rr * (0.8 + i * (big ? 0.35 : 0.2)), Math.sin(a) * r * 0.5), 'fabric', i % 2 ? leaf : darken(leaf, 0.12)));
  }
  return out;
}

/** An outdoor café set: a round table, two bistro chairs and (sometimes) a parasol. */
export function cafeSet(topHex: number, chairHex: number, parasol: number | null): Parts {
  const out: Parts = [...roundTable(0.36, 0.74, topHex)];
  for (const s of [-1, 1]) for (const p of bistroChair(chairHex)) {
    const g = p.g.clone().rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2).translate(s * 0.58, 0, 0); // both chairs face the table
    out.push({ ...p, g });
  }
  if (parasol !== null) {
    out.push(P(cyl(0.02, 0.02, 2.2, 0, 0.74, 0, 6), 'metal', 0xe9e4d6));
    const canopy = new THREE.ConeGeometry(1.25, 0.42, 8, 1, true).toNonIndexed().translate(0, 2.55, 0);
    out.push(P(canopy, 'fabric', parasol));
  }
  return out;
}

/** Merge a piece into one vertex-coloured geometry (for props outside: café terraces). */
export function mergeDecor(parts: Parts): THREE.BufferGeometry {
  const gs = parts.map((p) => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = new THREE.Color(p.hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  const out = new THREE.BufferGeometry();
  const cat = (k: string, n: number) => { const arrs = gs.map((g) => g.getAttribute(k).array as Float32Array); const len = arrs.reduce((s, a) => s + a.length, 0); const o = new Float32Array(len); let off = 0; for (const a of arrs) { o.set(a, off); off += a.length; } out.setAttribute(k, new THREE.BufferAttribute(o, n)); };
  cat('position', 3); cat('normal', 3); cat('color', 3);
  return out;
}
