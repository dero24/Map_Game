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

/** `glow`: a lamp's shade or bulb, always lit; `lamp`: a ceiling light's glass, lit after dark only (a
 *  room with windows has its ceiling light off by day). */
export type DecorMat = 'fabric' | 'wood' | 'metal' | 'porcelain' | 'glass' | 'solid' | 'glow' | 'lamp';
export interface DecorPart { g: THREE.BufferGeometry; mat: DecorMat; hex: number }
type Parts = DecorPart[];

// (RoundedBoxGeometry is already non-indexed: calling toNonIndexed() on it only floods the console)
const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
// Rounded boxes cost 324 verts (one bevel segment); below ~1.5 cm the round never reads at
// room scale, so small parts (slats, stock on shelves, rails) are plain 36-vert boxes.
const rbox = (w: number, h: number, d: number, r: number, x: number, y: number, z: number) =>
  (r <= 0.015 ? ni(new THREE.BoxGeometry(w, h, d)) : ni(new RoundedBoxGeometry(Math.max(w, 2 * r + 0.001), Math.max(h, 2 * r + 0.001), Math.max(d, 2 * r + 0.001), 1, r))).translate(x, y + h / 2, z);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, segs = 8) => ni(new THREE.CylinderGeometry(r1, r0, h, segs)).translate(x, y + h / 2, z);
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
  const hoop = ni(new THREE.TorusGeometry(0.18, 0.012, 5, 12, Math.PI));
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
    const arm = ni(new THREE.BoxGeometry(0.03, 0.03, 0.28)).translate(0, 0.07, 0.14).rotateY(a);
    out.push(P(arm, 'metal', 0x2a2b2e));
    out.push(P(ni(new THREE.SphereGeometry(0.025, 5, 4)).translate(Math.sin(a) * 0.28, 0.025, Math.cos(a) * 0.28), 'metal', 0x1c1d20));
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
  const sh = ni(new THREE.LatheGeometry([new THREE.Vector2(floor ? 0.2 : 0.15, 0), new THREE.Vector2(floor ? 0.14 : 0.1, floor ? 0.3 : 0.2)], 12));
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
    for (let i = 0; i < 6; i++) out.push(P(ni(new THREE.SphereGeometry(0.055, 7, 5)).scale(1, 0.6, 1).translate(-w / 2 + 0.28 + i * (cw - 0.26) / 5, 1.07, -0.02 + ((i % 2) - 0.5) * 0.14), 'porcelain', [0xd9a45b, 0xc46a4a, 0xf1dcb0, 0x7a4a2e][i % 4]));
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
    P(ni(new THREE.SphereGeometry(0.075, 10, 6)).scale(1, 0.8, 1).translate(0, 0.08, 0), 'glow', 0xfff1d0),
  ];
  for (let k = 0; k < 5; k++) {
    const g = ni(new THREE.BoxGeometry(0.5, 0.012, 0.13)).rotateX(0.18).translate(0.36, 0.17, 0).rotateY((k / 5) * Math.PI * 2);
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
      const iw = Math.min(0.07 + rnd() * 0.12, w / 2 - 0.03 - x), ih = 0.12 + rnd() * 0.2; // never past the unit's end
      if (rnd() > 0.12) out.push(P(rbox(iw, ih, d * 0.7, 0.012, x + iw / 2, y + 0.025, -0.02), 'solid', stock[Math.floor(rnd() * stock.length)]));
      x += iw + 0.015;
    }
  }
  return out;
}

/** A potted plant: a turned pot and a few leafy masses. */
export function pottedPlant(big: boolean, leaf = 0x5f8a45, pot = 0xa86a4a): Parts {
  const r = big ? 0.2 : 0.12, h = big ? 0.38 : 0.2;
  const potG = ni(new THREE.LatheGeometry([new THREE.Vector2(r * 0.7, 0), new THREE.Vector2(r, h), new THREE.Vector2(r * 1.05, h)], 10));
  const out: Parts = [P(potG, 'porcelain', pot)];
  const n = big ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, rr = r * (big ? 1.5 : 1.2) * (0.8 + (i % 3) * 0.12);
    out.push(P(ni(new THREE.IcosahedronGeometry(rr, 1)).scale(1, 1.3, 1).translate(Math.cos(a) * r * 0.5, h + rr * (0.8 + i * (big ? 0.35 : 0.2)), Math.sin(a) * r * 0.5), 'fabric', i % 2 ? leaf : darken(leaf, 0.12)));
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
    const canopy = ni(new THREE.ConeGeometry(1.25, 0.42, 8, 1, true)).translate(0, 2.55, 0);
    out.push(P(canopy, 'fabric', parasol));
  }
  return out;
}

// ---- rooms, not halls: the pieces a planned interior repeats (docs/INTERIORS_PLAN.md, Slice 1) ----
// Each is a handful of plain boxes (36 verts) so a block of flats or an office floor can instance
// them by the hundred; parts painted white (0xffffff) take the instance's tint.
const T = 0xffffff;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => ni(new THREE.BoxGeometry(w, h, d)).translate(x, y + h / 2, z);

/** A home's fitted kitchen along one wall (review round 11: "the kitchen in view is a sink run, with
 *  no range, fridge or wall cabinets"). Everything in the piece's x, −len/2 … len/2: */
export interface KitchenSpec {
  len: number;
  /** the sink's middle (under the window, where the run has one) */
  sink: number;
  /** the cooker's middle — a range set into the run, its hood over it — or null: it stands on
   *  another wall of the room (`stove`) */
  range: number | null;
  /** the fridge at the run's left (−1) or right (+1) end, or on another wall (0: `fridge`) */
  fridge: -1 | 0 | 1;
  /** the stretches with a window over them: no wall cabinets there, a low upstand for the splash */
  gaps: [number, number][];
}
/** A fridge's width, a cooker's, a wall cabinet's door (m); the wall cabinets hang from WALL_Y. */
export const FRIDGE_W = 0.72, COOKER_W = 0.6, WALL_Y = 1.45;
const qk = (x: number) => (Math.round(x * 20) / 20).toFixed(2);
/** The piece key a kitchen spec draws as (everything that shapes it, to 5 cm). */
export const kitchenKey = (s: KitchenSpec) => `kitchen:${qk(s.len)}:${qk(s.sink)}:${s.range === null ? 'n' : qk(s.range)}:${s.fridge}:${s.gaps.map(([a, b]) => `${qk(a)}~${qk(b)}`).join(',')}`;
/** The stretches of [a, b] left once `cut` is taken out (each at least `min` long). */
function stretchesOf(a: number, b: number, cut: [number, number][], min: number): [number, number][] {
  let segs: [number, number][] = [[a, b]];
  for (const [c0, c1] of cut) segs = segs.flatMap(([s0, s1]) => (c1 <= s0 || c0 >= s1 ? [[s0, s1]] : [[s0, c0], [c1, s1]]) as [number, number][]);
  return segs.filter(([s0, s1]) => s1 - s0 >= min);
}
/** A run of doors `y0`–`y1` high on the front (z) of [a, b]: the joins between them, ~0.5–0.6 m apart. */
function joins(out: Parts, a: number, b: number, y0: number, y1: number, z: number) {
  const n = Math.max(1, Math.round((b - a) / 0.6));
  for (let i = 1; i < n; i++) out.push(P(box(0.012, y1 - y0, 0.01, a + ((b - a) * i) / n, y0, z), 'solid', 0x8d8a84));
}
/** The cooker: a range's oven and hob in steel, its glass door and handle, the knobs, four rings, the
 *  backguard; a chimney hood over it to the cabinet tops. x across, the back at +z. */
function rangeParts(out: Parts, x: number, hood = true) {
  const st = 0xb8bcbf;
  out.push(P(box(COOKER_W - 0.01, 0.9, 0.6, x, 0, 0), 'metal', st)); // the body
  out.push(P(box(COOKER_W - 0.03, 0.012, 0.52, x, 0.9, -0.03), 'solid', 0x222326)); // the hob
  for (const [dx, dz] of [[-0.14, -0.15], [0.14, -0.15], [-0.14, 0.1], [0.14, 0.1]]) out.push(P(box(0.17, 0.014, 0.17, x + dx, 0.905, dz), 'metal', 0x3a3b3e)); // the rings
  out.push(P(box(COOKER_W - 0.01, 0.13, 0.04, x, 0.9, 0.27), 'metal', 0xc8ccce)); // the backguard
  out.push(P(box(0.46, 0.38, 0.012, x, 0.2, -0.305), 'glass', 0x2a2b2e)); // the oven's door
  out.push(P(box(0.48, 0.024, 0.03, x, 0.64, -0.325), 'metal', 0x8a8e90)); // its handle
  out.push(P(box(0.5, 0.04, 0.02, x, 0.755, -0.305), 'solid', 0x2a2b2e)); // the knobs' strip
  if (!hood) return;
  out.push(P(box(COOKER_W + 0.02, 0.1, 0.5, x, 1.58, 0.05), 'metal', st)); // the hood's canopy
  out.push(P(box(0.3, 2.17 - 1.68, 0.26, x, 1.68, 0.17), 'metal', 0xc8ccce)); // its chimney, up to the cabinet tops
}
/** The fridge (a fixed off-white), its two doors and handles; `w` wide (a flat's slim one: 0.6 m). */
function fridgeParts(out: Parts, x: number, w = FRIDGE_W) {
  out.push(P(box(w - 0.02, 1.85, 0.64, x, 0, -0.01), 'porcelain', 0xe6e7e2));
  out.push(P(box(w - 0.04, 0.014, 0.01, x, 1.16, -0.335), 'solid', 0x8d8a84)); // the freezer's door below
  out.push(P(box(0.03, 0.55, 0.03, x + w / 2 - 0.09, 1.25, -0.345), 'metal', 0x8a8e90));
  out.push(P(box(0.03, 0.4, 0.03, x + w / 2 - 0.09, 0.62, -0.345), 'metal', 0x8a8e90));
}
/** A spec back from its key (tests, probes). */
export function kitchenSpecOf(key: string): KitchenSpec | null {
  const m = /^kitchen:([-\d.]+):([-\d.]+):(n|[-\d.]+):(-?\d):(.*)$/.exec(key);
  if (!m) return null;
  return { len: +m[1], sink: +m[2], range: m[3] === 'n' ? null : +m[3], fridge: +m[4] as -1 | 0 | 1, gaps: m[5] ? m[5].split(',').map((g) => g.split('~').map(Number) as [number, number]) : [] };
}
/** The base run's ends: the run less the fridge. */
const baseOf = (s: KitchenSpec): [number, number] => [s.fridge < 0 ? -s.len / 2 + FRIDGE_W + 0.02 : -s.len / 2, s.fridge > 0 ? s.len / 2 - FRIDGE_W - 0.02 : s.len / 2];
/** Where a kitchen's wall cabinets hang (x): over the base run where the wall is solid — not in a
 *  window's stretch, not over the cooker's hood — each stretch 30 cm or more; and the one over the
 *  fridge (`fridge` set). */
export function wallCabinets(s: KitchenSpec, fridge = false): [number, number][] {
  const [b0, b1] = baseOf(s);
  const cut: [number, number][] = s.gaps.map(([a, b]): [number, number] => [a - 0.02, b + 0.02]);
  if (s.range !== null) cut.push([s.range - COOKER_W / 2 - 0.02, s.range + COOKER_W / 2 + 0.02]);
  const out = stretchesOf(b0, b1, cut, 0.3);
  if (fridge && s.fridge) out.push(s.fridge < 0 ? [-s.len / 2, -s.len / 2 + FRIDGE_W] : [s.len / 2 - FRIDGE_W, s.len / 2]);
  return out;
}
/** A fitted kitchen (`KitchenSpec`): base units on a plinth with the worktop, the sink and its tap,
 *  the cooker set in with its hood, the fridge at an end with a cabinet over it, wall cabinets along
 *  the rest where the wall above is solid, a tiled splashback between (a low upstand under a window).
 *  Cabinet fronts take the tint. */
export function kitchen(s: KitchenSpec, top = 0x4a4540, splash = 0xe9eef0): Parts {
  const x0 = -s.len / 2, x1 = s.len / 2;
  const [b0, b1] = baseOf(s);
  const rg: [number, number] | null = s.range === null ? null : [s.range - COOKER_W / 2, s.range + COOKER_W / 2];
  const out: Parts = [];
  // the plinth, the carcass and the worktop either side of the cooker (it has its own top)
  for (const [a, b] of stretchesOf(b0, b1, rg ? [rg] : [], 0.05)) {
    out.push(P(box(b - a, 0.08, 0.56, (a + b) / 2, 0, 0.02), 'solid', 0x2e2a26));
    out.push(P(box(b - a, 0.8, 0.6, (a + b) / 2, 0.08, 0), 'solid', T));
    out.push(P(box(b - a + 0.01, 0.04, 0.64, (a + b) / 2, 0.88, -0.01), 'porcelain', top));
    joins(out, a, b, 0.14, 0.82, -0.305);
    out.push(P(box(b - a - 0.02, 0.01, 0.01, (a + b) / 2, 0.7, -0.305), 'solid', 0x8d8a84)); // the drawers' line
  }
  // the splashback: tiled up to the wall cabinets, a low upstand where a window's over the worktop
  const glass = s.gaps.map(([a, b]): [number, number] => [a - 0.02, b + 0.02]);
  for (const [a, b] of stretchesOf(b0, b1, glass, 0.05)) out.push(P(box(b - a, 0.53, 0.015, (a + b) / 2, 0.92, 0.3), 'porcelain', splash));
  for (const [a, b] of glass) { const c0 = Math.max(a, b0), c1 = Math.min(b, b1); if (c1 - c0 > 0.05) out.push(P(box(c1 - c0, 0.1, 0.015, (c0 + c1) / 2, 0.92, 0.3), 'porcelain', splash)); }
  // the sink, its tap and spout
  out.push(P(box(0.56, 0.06, 0.4, s.sink, 0.865, -0.02), 'porcelain', 0x8e969a));
  out.push(P(box(0.04, 0.3, 0.04, s.sink, 0.92, 0.2), 'porcelain', 0xc0c4c6));
  out.push(P(box(0.04, 0.03, 0.18, s.sink, 1.19, 0.12), 'porcelain', 0xc0c4c6));
  if (s.range !== null) rangeParts(out, s.range);
  // the wall cabinets: over the base run where the wall is solid, not over the cooker's hood
  for (const [a, b] of wallCabinets(s)) {
    out.push(P(box(b - a, 0.72, 0.34, (a + b) / 2, WALL_Y, 0.13), 'solid', T));
    joins(out, a, b, WALL_Y + 0.04, WALL_Y + 0.68, -0.042);
  }
  if (s.fridge) {
    const fx = s.fridge < 0 ? x0 + FRIDGE_W / 2 : x1 - FRIDGE_W / 2;
    fridgeParts(out, fx);
    out.push(P(box(FRIDGE_W, 0.3, 0.6, fx, 1.88, 0.0), 'solid', T)); // a cabinet over it
  }
  return out;
}
/** A cooker on a wall of its own (the run had no solid stretch for it): the range and its hood. */
export function stove(): Parts {
  const out: Parts = [];
  rangeParts(out, 0);
  return out;
}
/** A fridge on a wall of its own (`w`: a slim one where the wall is short). */
export function fridge(w = FRIDGE_W): Parts {
  const out: Parts = [];
  fridgeParts(out, 0, w);
  return out;
}

/** An office workstation: a 1.6 × 0.8 m desk, screen and keyboard, and its chair in front (−z).
 *  The chair's fabric takes the tint. */
export function workstation(): Parts {
  return [
    P(box(1.6, 0.03, 0.8, 0, 0.71, 0), 'wood', 0xd8d2c4),
    P(box(0.03, 0.71, 0.7, -0.77, 0, 0), 'metal', 0x8d9296),
    P(box(0.03, 0.71, 0.7, 0.77, 0, 0), 'metal', 0x8d9296),
    P(box(0.54, 0.32, 0.03, 0, 0.84, 0.2), 'glass', 0x22252a), // screen
    P(box(0.06, 0.1, 0.06, 0, 0.74, 0.2), 'metal', 0x3a3b3e),
    P(box(0.44, 0.02, 0.14, 0, 0.74, -0.15), 'solid', 0xe9e9e4), // keyboard
    P(box(0.48, 0.07, 0.46, 0, 0.44, -0.68), 'fabric', T), // chair: seat, back, stem, base
    P(box(0.44, 0.48, 0.07, 0, 0.52, -0.9), 'fabric', T),
    P(box(0.05, 0.4, 0.05, 0, 0.05, -0.68), 'metal', 0x2a2b2e),
    P(box(0.56, 0.04, 0.56, 0, 0.01, -0.68), 'metal', 0x2a2b2e),
  ];
}

/** A doorway's casing, w wide: two jambs and a head, straddling a 0.12 m wall. */
export function doorFrame(w: number): Parts {
  return [
    P(box(0.08, 2.18, 0.16, -w / 2 - 0.04, 0, 0), 'solid', 0xf4f1ea),
    P(box(0.08, 2.18, 0.16, w / 2 + 0.04, 0, 0), 'solid', 0xf4f1ea),
    P(box(w + 0.16, 0.1, 0.16, 0, 2.1, 0), 'solid', 0xf4f1ea),
  ];
}
/** A door leaf standing open, hinged at x = 0 and reaching to x = w (panels, a knob); the leaf
 *  takes the tint. */
export function doorLeaf(w: number): Parts {
  const out: Parts = [P(box(w - 0.02, 2.02, 0.04, w / 2, 0.02, 0), 'solid', T)];
  for (const [y0, y1] of [[0.18, 0.95], [1.15, 1.85]]) for (const s of [-1, 1]) out.push(P(box(w - 0.24, y1 - y0, 0.012, w / 2, y0, s * 0.024), 'solid', 0xe6e2da));
  for (const s of [-1, 1]) out.push(P(box(0.05, 0.05, 0.05, w - 0.1, 0.95, s * 0.045), 'metal', 0xc9a74a));
  return out;
}

/** WC pan with its cistern against the wall (+z). */
export function toilet(): Parts {
  return [
    P(rbox(0.38, 0.4, 0.5, 0.03, 0, 0, -0.07), 'porcelain', 0xf4f3ef),
    P(rbox(0.4, 0.04, 0.46, 0.015, 0, 0.4, -0.08), 'porcelain', 0xf4f3ef),
    P(box(0.42, 0.38, 0.18, 0, 0.42, 0.24), 'porcelain', 0xf4f3ef),
  ];
}
/** A vanity: a cabinet (tint) with a basin top and tap, a mirror above on the wall. */
export function vanity(w: number): Parts {
  return [
    P(box(w, 0.8, 0.48, 0, 0.02, 0), 'wood', T),
    P(box(w + 0.02, 0.04, 0.5, 0, 0.82, 0), 'porcelain', 0xe8e4da),
    P(box(0.44, 0.02, 0.32, 0, 0.855, -0.02), 'porcelain', 0xd6dde0),
    P(box(0.03, 0.2, 0.03, 0, 0.86, 0.19), 'porcelain', 0xc0c4c6),
    P(box(Math.max(0.4, w - 0.2), 0.7, 0.03, 0, 1.05, 0.225), 'glass', 0xc9d6dc),
  ];
}
/** A bathtub `len` long along the wall. */
export function bathtub(len: number): Parts {
  return [
    P(box(len, 0.56, 0.76, 0, 0, 0), 'porcelain', 0xf4f3ef),
    P(box(len - 0.16, 0.02, 0.6, 0, 0.545, 0), 'porcelain', 0xa9cad3),
    P(box(0.04, 0.44, 0.04, -len / 2 + 0.1, 0.56, 0.3), 'porcelain', 0xc0c4c6),
  ];
}
/** A wardrobe (tint), its doors' join and two handles. */
export function wardrobe(w: number): Parts {
  return [
    P(box(w, 2.02, 0.58, 0, 0.03, 0), 'wood', T),
    P(box(0.01, 1.9, 0.012, 0, 0.09, -0.295), 'wood', 0x5a4a3a),
    P(box(0.02, 0.3, 0.03, -0.06, 1.0, -0.305), 'metal', 0xc9a74a),
    P(box(0.02, 0.3, 0.03, 0.06, 1.0, -0.305), 'metal', 0xc9a74a),
  ];
}
/** A chest of drawers (tint) with handles and a mirror on the wall above. */
export function dresser(w: number): Parts {
  const out: Parts = [P(box(w, 0.8, 0.48, 0, 0.06, 0), 'wood', T), ...legs(w, 0.48, 0.06, 0.04, 0.02, 0x3a2e24)];
  for (let r = 0; r < 3; r++) {
    out.push(P(box(w - 0.08, 0.2, 0.01, 0, 0.1 + r * 0.25, -0.245), 'wood', 0xd9d0c0));
    out.push(P(box(0.12, 0.03, 0.02, 0, 0.19 + r * 0.25, -0.255), 'metal', 0xc9a74a));
  }
  out.push(P(box(w - 0.2, 0.75, 0.03, 0, 1.0, 0.225), 'wood', 0x5a4a3a), P(box(w - 0.3, 0.65, 0.01, 0, 1.05, 0.205), 'glass', 0xc9d6dc));
  return out;
}
/** A bookcase (tint) filled by seed. */
export function bookcase(w: number, seed: number, spines: number[]): Parts {
  const h = 1.9, d = 0.34;
  const out: Parts = [P(box(w, h, 0.02, 0, 0, d / 2 - 0.01), 'wood', T), P(box(0.03, h, d, -w / 2 + 0.015, 0, 0), 'wood', T), P(box(0.03, h, d, w / 2 - 0.015, 0, 0), 'wood', T)];
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  for (let r = 0; r < 5; r++) {
    const y = 0.02 + r * 0.42;
    out.push(P(box(w - 0.06, 0.025, d - 0.02, 0, y, 0), 'wood', T));
    if (r === 4) break;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.12) {
      const bw = 0.03 + rnd() * 0.05, bh = 0.2 + rnd() * 0.12;
      if (rnd() > 0.15) out.push(P(box(bw, bh, d - 0.08, x + bw / 2, y + 0.025, 0), 'fabric', spines[Math.floor(rnd() * spines.length)]));
      x += bw + 0.006;
    }
  }
  return out;
}
/** A supermarket gondola module `len` long: shelves both sides, stocked by seed. */
export function gondola(len: number, seed: number, stock: number[]): Parts {
  const out: Parts = [P(box(len, 0.1, 0.9, 0, 0, 0), 'solid', 0x9a9690), P(box(len, 1.6, 0.04, 0, 0.1, 0), 'solid', 0xd8d2c4)];
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  for (const side of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      const y = 0.12 + r * 0.4;
      out.push(P(box(len, 0.02, 0.4, 0, y, side * 0.22), 'solid', 0xcfc8b8));
      let x = -len / 2 + 0.03;
      while (x < len / 2 - 0.1) {
        const iw = Math.min(0.1 + rnd() * 0.16, len / 2 - 0.03 - x), ih = 0.14 + rnd() * 0.18;
        if (rnd() > 0.1) out.push(P(box(iw, ih, 0.3, x + iw / 2, y + 0.02, side * 0.24), 'solid', stock[Math.floor(rnd() * stock.length)]));
        x += iw + 0.02;
      }
    }
  }
  return out;
}
/** A washing machine. */
export function washer(): Parts {
  return [P(box(0.6, 0.85, 0.58, 0, 0, 0), 'porcelain', 0xeeeeea), P(box(0.36, 0.36, 0.02, 0, 0.3, -0.295), 'glass', 0x5a6a78), P(box(0.5, 0.06, 0.02, 0, 0.75, -0.295), 'solid', 0xb8bcbf)];
}
/** A bank of lift doors in their steel frame, with the floor indicator. */
export function liftDoors(): Parts {
  return [
    P(box(1.3, 2.3, 0.1, 0, 0, 0), 'metal', 0x8a8e90),
    P(box(0.54, 2.1, 0.02, -0.28, 0, -0.06), 'metal', 0xb8bcbf),
    P(box(0.54, 2.1, 0.02, 0.28, 0, -0.06), 'metal', 0xb8bcbf),
    P(box(0.3, 0.1, 0.02, 0, 2.35, -0.05), 'glow', 0xffb060),
  ];
}
/** A tall building's lift door on its landing (Slice 3): the steel frame round an opening `w` wide
 *  and 2.1 m high cut in the shaft's wall (jambs, head, a threshold plate), the floor indicator
 *  over it. The leaves are their own pieces (liftLeaf), sliding in the wall's plane 0.11 m behind the
 *  frame's centre (+z): a ride opens them. */
export function liftFrame(w = 1.1): Parts {
  return [
    P(box(0.1, 2.2, 0.08, -w / 2 - 0.05, 0, 0), 'metal', 0x8a8e90),
    P(box(0.1, 2.2, 0.08, w / 2 + 0.05, 0, 0), 'metal', 0x8a8e90),
    P(box(w + 0.2, 0.12, 0.08, 0, 2.1, 0), 'metal', 0x8a8e90),
    P(box(w + 0.2, 0.012, 0.22, 0, 0, 0.03), 'metal', 0xa9adb0),
    P(box(0.34, 0.1, 0.02, 0, 2.34, -0.03), 'glow', 0xffb060),
  ];
}
/** One leaf of a lift door (brushed steel, a shade lighter at its meeting edge), w wide, 2.1 m. */
export function liftLeaf(w = 0.56): Parts {
  return [P(box(w, 2.1, 0.03, 0, 0, 0), 'metal', 0xb8bcbf), P(box(0.02, 2.1, 0.034, w / 2 - 0.012, 0, 0), 'metal', 0xd4d7d9)];
}
/** A lift car's inside, w × d inside and 2.4 m high, its doorway (1.1 m) on the front (−z): the
 *  floor, the walls (a steel lower half, a warm wood upper), the lit ceiling panel, a handrail round
 *  the back and sides, the button panel beside the door and the floor display over it. */
export function liftCar(w = 2.1, d = 1.6): Parts {
  const H = 2.4, t = 0.04, door = 1.1, out: Parts = [];
  out.push(P(box(w, 0.015, d, 0, 0, 0), 'solid', 0x5c5750)); // the floor
  for (const [x, z, sw, sd] of [[0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]] as const) {
    out.push(P(box(sw, 1.0, sd, x, 0, z), 'metal', 0x9ea3a6));
    out.push(P(box(sw, H - 1.0, sd, x, 1.0, z), 'wood', 0xa38b6d));
  }
  // the front, either side of the doorway, and over it
  const fw = (w - door) / 2;
  for (const s of [-1, 1]) out.push(P(box(fw, H, t, s * (door / 2 + fw / 2), 0, -d / 2), 'metal', 0x9ea3a6));
  out.push(P(box(door, H - 2.1, t, 0, 2.1, -d / 2), 'metal', 0x9ea3a6));
  out.push(P(box(w, 0.03, d, 0, H, 0), 'solid', 0xe8e4da)); // the ceiling
  out.push(P(box(w * 0.7, 0.02, d * 0.6, 0, H - 0.02, 0), 'glow', 0xfff3d8)); // its light panel
  // the handrail, 0.9 m up, round the back and the sides
  out.push(P(box(w - 0.2, 0.04, 0.04, 0, 0.88, d / 2 - 0.07), 'metal', 0xd4d7d9));
  for (const s of [-1, 1]) out.push(P(box(0.04, 0.04, d - 0.4, s * (w / 2 - 0.07), 0.88, 0.05), 'metal', 0xd4d7d9));
  // the button panel on the front wall's inside, the floor display over the door
  out.push(P(box(0.2, 0.5, 0.02, door / 2 + fw / 2, 0.95, -d / 2 + 0.03), 'metal', 0xc8ccce));
  for (let i = 0; i < 6; i++) out.push(P(box(0.035, 0.035, 0.01, door / 2 + fw / 2 + (i % 2 ? 0.04 : -0.04), 1.05 + Math.floor(i / 2) * 0.1, -d / 2 + 0.045), 'glow', 0xffd890));
  out.push(P(box(0.3, 0.09, 0.015, 0, 2.2, -d / 2 + 0.03), 'glow', 0xff9a50));
  return out;
}
/** A lift's call panel: a steel plate with its up and down buttons (they glow), on the wall at 1 m. */
export function liftButton(): Parts {
  return [P(box(0.12, 0.26, 0.02, 0, 1.0, 0), 'metal', 0xb8bcbf), P(box(0.04, 0.04, 0.012, 0, 1.16, -0.014), 'glow', 0xffd890), P(box(0.04, 0.04, 0.012, 0, 1.06, -0.014), 'glow', 0xffd890)];
}
/** A lobby turnstile: a waist-high steel cabinet with a glass wing (the gate) reaching across the
 *  lane to its right; lanes 0.9 m apart. Front toward −z (the way through is along z). */
export function turnstile(): Parts {
  return [
    P(box(0.22, 0.98, 1.2, -0.34, 0, 0), 'metal', 0xb8bcbf),
    P(box(0.26, 0.03, 1.24, -0.34, 0.98, 0), 'solid', 0x2c2e33), // the top, a reader glowing on it
    P(box(0.1, 0.012, 0.1, -0.34, 1.01, -0.4), 'glow', 0x9fd6b0),
    P(box(0.5, 0.62, 0.02, 0.02, 0.36, 0.1), 'glass', 0xc9d6dc), // the wing
  ];
}
/** A security desk: a long counter (tint), a darker top, a screen for the guard behind it (+z). */
export function securityDesk(w: number): Parts {
  return [
    P(box(w, 1.06, 0.62, 0, 0, 0), 'wood', T),
    P(box(w + 0.06, 0.04, 0.7, 0, 1.06, 0), 'solid', 0x2c2e33),
    P(box(w - 0.1, 0.72, 0.03, 0, 0.02, 0.2), 'solid', 0x8d9296), // (the low worktop's front, the guard's side)
    P(box(0.5, 0.32, 0.03, -w * 0.25, 1.1, 0.2), 'glass', 0x22252a),
  ];
}
/** A building's directory board on the wall: a dark panel of tenant lines under a lit head. */
export function directory(): Parts {
  const out: Parts = [P(box(1.1, 1.4, 0.05, 0, 0.9, 0), 'solid', 0x2a2d33), P(box(1.0, 0.12, 0.012, 0, 2.12, -0.03), 'glow', 0xfff1d0)];
  for (let r = 0; r < 8; r++) out.push(P(box(0.8 - (r % 3) * 0.14, 0.03, 0.01, -0.05, 1.0 + r * 0.14, -0.03), 'solid', 0xd8d2c4));
  return out;
}
/** A wall of mailboxes. */
export function mailboxes(w: number): Parts {
  const out: Parts = [P(box(w, 1.2, 0.3, 0, 0.6, 0), 'metal', 0x8a7f6a)];
  const n = Math.max(2, Math.floor(w / 0.32));
  for (let i = 0; i < n; i++) for (let r = 0; r < 4; r++) out.push(P(box(w / n - 0.03, 0.26, 0.01, -w / 2 + (i + 0.5) * (w / n), 0.64 + r * 0.29, -0.155), 'metal', 0xb8ad94));
  return out;
}
/** Steel storage racking for a stock room. */
export function rack(len: number): Parts {
  const out: Parts = [];
  for (const x of [-len / 2 + 0.03, len / 2 - 0.03]) out.push(P(box(0.05, 2.2, 0.6, x, 0, 0), 'metal', 0x3a5a8a));
  for (let r = 0; r < 4; r++) out.push(P(box(len, 0.04, 0.6, 0, 0.1 + r * 0.6, 0), 'metal', 0xb89468));
  for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor(len / 0.6); i++) out.push(P(box(0.45, 0.35, 0.45, -len / 2 + 0.35 + i * 0.6, 0.14 + r * 0.6, 0), 'solid', [0xc8a878, 0xb89460, 0xd8c098][(i + r) % 3]));
  return out;
}
/** A ceiling light: a glowing panel w × d, h deep, hanging from its top (y = h) to its face (y = 0). */
export function ceilingLight(w: number, d: number, h: number): Parts {
  return [P(box(w, h, d, 0, 0, 0), 'glow', 0xfff3d0)];
}
/** A commercial range: steel body, six burners, a steel splashback. */
export function range(): Parts {
  const out: Parts = [P(box(1.2, 0.9, 0.8, 0, 0, 0), 'metal', 0xb8bcbf), P(box(1.2, 0.5, 0.04, 0, 0.9, 0.38), 'metal', 0xc8ccce)];
  for (let i = 0; i < 6; i++) out.push(P(box(0.24, 0.02, 0.24, -0.4 + (i % 3) * 0.4, 0.9, -0.15 + Math.floor(i / 3) * 0.32), 'solid', 0x222326));
  return out;
}

// ---- deeper archetypes (docs/INTERIORS_PLAN.md, Slice 4): the pieces a supermarket, a hotel, a
// school, a church, a library, a bank, a post office and a gym repeat — plain boxes again, instanced
// by the dozen; white (0xffffff) parts take the instance's tint ----
/** A seeded stream (stock on shelves, books, produce): the same piece for the same seed. */
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
};
/** A supermarket checkout, `len` along x: the counter (tint), its belt at the entry end (−x), the
 *  scanner and the till's screen, the card reader on the customer's side (−z: the lane), the bagging
 *  shelf at the exit end (+x), the lane's numbered light on its pole. The cashier stands at +z. */
export function checkout(len = 4.2): Parts {
  const x0 = -len / 2;
  return [
    P(box(len, 0.08, 0.76, 0, 0, 0), 'solid', 0x2e2c2a),
    P(box(len, 0.8, 0.8, 0, 0.08, 0), 'solid', T),
    P(box(len + 0.02, 0.04, 0.84, 0, 0.88, 0), 'solid', 0x3a3b3e),
    P(box(len * 0.5, 0.025, 0.52, x0 + 0.15 + len * 0.25, 0.92, -0.06), 'solid', 0x1c1d20), // the belt
    P(box(0.36, 0.012, 0.36, x0 + len * 0.62, 0.92, -0.05), 'glass', 0x8fb0b8), // the scanner
    P(box(0.05, 0.34, 0.05, x0 + len * 0.62 + 0.3, 0.92, 0.3), 'metal', 0x3a3b3e),
    P(box(0.34, 0.24, 0.03, x0 + len * 0.62 + 0.3, 1.2, 0.26), 'glass', 0x22252a), // the till's screen
    P(box(0.1, 0.16, 0.08, x0 + len * 0.62 + 0.05, 0.92, -0.36), 'solid', 0x2c2e33), // card reader
    P(box(0.9, 0.035, 0.74, len / 2 - 0.47, 0.8, -0.02), 'metal', 0xb8bcbf), // bagging shelf, a step down
    P(box(0.05, 1.45, 0.05, x0 + 0.08, 0.92, 0.36), 'metal', 0x8a8e90), // the lane light
    P(box(0.3, 0.22, 0.08, x0 + 0.08, 2.37, 0.36), 'glow', 0xfff1d0),
  ];
}
/** A supermarket's refrigerated case `len` long, 1 m deep, backed onto a wall (+z): an open
 *  multi-deck (dairy, drinks) — or, with `doors`, a reach-in freezer behind glass doors — its decks
 *  stocked by seed, the canopy's light strip glowing. */
export function cooler(len: number, seed: number, stock: number[], doors = false): Parts {
  const d = 1.0, rnd = seeded(seed);
  const out: Parts = [
    P(box(len, 0.34, d - 0.05, 0, 0, 0.02), 'solid', 0x9a9690), // the plinth
    P(box(len, 1.92, 0.08, 0, 0.34, d / 2 - 0.04), 'metal', 0xdfe3e4), // the back
    P(box(len, 0.2, d * 0.62, 0, 2.06, d / 2 - d * 0.31), 'solid', T), // the canopy (tint)
    P(box(len - 0.1, 0.025, 0.08, 0, 2.03, -0.05), 'glow', 0xf4fbff),
  ];
  for (const s of [-1, 1]) out.push(P(box(0.05, 2.26, d, s * (len / 2 - 0.025), 0, 0), 'solid', T));
  for (let r = 0; r < 5; r++) {
    // decks, deeper toward the bottom (the bottom one is the well)
    const y = 0.34 + r * 0.36, dep = r === 0 ? 0.8 : 0.62 - r * 0.04, z = d / 2 - 0.08 - dep / 2;
    out.push(P(box(len - 0.12, 0.02, dep, 0, y, z), 'metal', 0xc8ccce));
    let x = -len / 2 + 0.08;
    while (x < len / 2 - 0.16) {
      const iw = Math.min(0.12 + rnd() * 0.16, len / 2 - 0.07 - x), ih = 0.12 + rnd() * 0.16;
      if (rnd() > 0.08) out.push(P(box(iw, Math.min(ih, 0.3), dep * 0.8, x + iw / 2, y + 0.02, z), 'solid', stock[Math.floor(rnd() * stock.length)]));
      x += iw + 0.02;
    }
  }
  if (doors) {
    out.push(P(box(len - 0.1, 1.64, 0.02, 0, 0.36, -d / 2 + 0.02), 'glass', 0xcfe0e4));
    for (let x = -len / 2 + 0.75; x < len / 2 - 0.2; x += 0.75) out.push(P(box(0.04, 1.64, 0.04, x, 0.36, -d / 2 + 0.03), 'metal', 0x8a8e90));
  } else out.push(P(box(len - 0.1, 0.12, 0.03, 0, 0.34, -d / 2 + 0.06), 'glass', 0xcfe0e4)); // the well's front lip
  return out;
}
/** A produce stand, w × d: a timber table (tint) tilted toward the customer (−z), crates of fruit
 *  and vegetables in rows on it, each heaped. */
export function produce(w: number, d: number, seed: number): Parts {
  const rnd = seeded(seed);
  const FRUIT = [0xc9412e, 0xe0a33b, 0x6e9c3a, 0xe8d05a, 0x8a3a5a, 0x4f7a2f, 0xd9733b];
  const out: Parts = [P(box(w, 0.62, d, 0, 0, 0), 'wood', T), P(box(w - 0.1, 0.05, d - 0.1, 0, 0.62, 0), 'wood', 0x7a5236)];
  const nx = Math.max(1, Math.floor(w / 0.55)), nz = Math.max(1, Math.floor(d / 0.45));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * (w / nx), z = -d / 2 + (j + 0.5) * (d / nz), y = 0.67 + (j / Math.max(1, nz - 1)) * 0.16;
      out.push(P(box(w / nx - 0.06, 0.1, d / nz - 0.06, x, y, z), 'wood', 0xb89468));
      const heap = ni(new THREE.IcosahedronGeometry(0.19, 0)).scale((w / nx - 0.1) / 0.38, 0.45, (d / nz - 0.1) / 0.38).translate(x, y + 0.13, z);
      out.push(P(heap, 'fabric', FRUIT[Math.floor(rnd() * FRUIT.length)]));
    }
  return out;
}
/** A pew `len` long (x), its back at +z: the seat, the back (a shade leaning), the carved ends, a
 *  hymnal shelf and the kneeler for the row behind. All tint: the church's wood. */
export function pew(len: number): Parts {
  const out: Parts = [
    P(box(len, 0.05, 0.42, 0, 0.4, -0.06), 'wood', T),
    P(box(len - 0.02, 0.1, 0.4, 0, 0.3, -0.06), 'wood', T), // the seat's apron
    P(box(len, 0.02, 0.1, 0, 0.8, 0.26), 'wood', T), // the hymnal shelf (the row behind's)
    P(box(len, 0.07, 0.14, 0, 0.1, 0.33), 'fabric', 0x8c2f2a), // the kneeler
  ];
  const back = box(len, 0.52, 0.045, 0, 0.44, 0.17);
  back.rotateX(-0.1);
  out.push(P(back, 'wood', T));
  for (const s of [-1, 1]) {
    out.push(P(box(0.07, 0.95, 0.6, s * (len / 2 - 0.035), 0, 0.0), 'wood', T));
    out.push(P(box(0.08, 0.06, 0.64, s * (len / 2 - 0.035), 0.95, 0.0), 'wood', T)); // its cap
  }
  if (len > 3.2) out.push(P(box(0.06, 0.3, 0.36, 0, 0.1, -0.06), 'wood', T));
  return out;
}
/** An altar w wide (its back at +z): a stone table under its cloth and frontal, a cross on a stand
 *  between two candles (they glow). */
export function altar(w = 2.0, frontal = 0x8c2f2a): Parts {
  return [
    P(box(w, 0.98, 0.8, 0, 0, 0), 'solid', 0xf2eee4),
    P(box(w + 0.04, 0.02, 0.84, 0, 0.98, 0), 'fabric', 0xf6f2e6),
    P(box(w * 0.6, 0.62, 0.012, 0, 0.3, -0.407), 'fabric', frontal),
    P(box(0.05, 0.62, 0.05, 0, 1.0, 0.2), 'metal', 0xc9a74a),
    P(box(0.34, 0.05, 0.05, 0, 1.44, 0.2), 'metal', 0xc9a74a),
    P(box(0.14, 0.03, 0.14, 0, 1.0, 0.2), 'metal', 0xc9a74a),
    ...[-0.6, 0.6].flatMap((x) => [P(box(0.06, 0.26, 0.06, x * (w / 2), 1.0, 0.15), 'porcelain', 0xf6f1de), P(box(0.03, 0.05, 0.03, x * (w / 2), 1.26, 0.15), 'glow', 0xffd890)]),
  ];
}
/** A lectern: a column on a foot, its reading desk sloping toward the reader (−z). */
export function lectern(wood = 0x6f4b33): Parts {
  const top = box(0.55, 0.04, 0.42, 0, 0, 0);
  top.rotateX(0.35).translate(0, 1.1, 0);
  return [P(box(0.5, 0.06, 0.4, 0, 0, 0), 'wood', wood), P(box(0.12, 1.06, 0.12, 0, 0.06, 0), 'wood', wood), P(top, 'wood', wood)];
}
/** A hotel room's bed wall: a double bed (its runner and cushions tint), the upholstered headboard
 *  (tint) wider than the bed, a nightstand and a lamp either side (the lamps glow). Its back (+z)
 *  on the wall; w: the bed's width. */
export function hotelBed(w = 1.6): Parts {
  const wood = 0x5a4232, L = 2.05;
  const out: Parts = [
    P(box(w, 0.3, L, 0, 0.05, -0.02), 'wood', wood),
    P(box(w - 0.04, 0.26, L - 0.08, 0, 0.35, -0.04), 'fabric', 0xf4f2ec), // the mattress, made up in white
    P(box(w + 0.03, 0.05, 0.62, 0, 0.6, -L / 2 + 0.55), 'fabric', T), // the runner across the foot
    P(box(w + 0.9, 1.2, 0.08, 0, 0.1, L / 2 + 0.02), 'fabric', T), // the headboard
  ];
  for (const s of [-1, 1]) {
    out.push(P(box(w / 2 - 0.14, 0.16, 0.34, s * (w / 4), 0.61, L / 2 - 0.3), 'fabric', 0xfbfaf6)); // pillows
    out.push(P(box(0.46, 0.55, 0.42, s * (w / 2 + 0.3), 0, L / 2 - 0.21), 'wood', wood)); // nightstand
    out.push(P(box(0.1, 0.3, 0.1, s * (w / 2 + 0.3), 0.55, L / 2 - 0.2), 'metal', 0x3a3530));
    out.push(P(box(0.26, 0.2, 0.26, s * (w / 2 + 0.3), 0.85, L / 2 - 0.2), 'glow', 0xfff1d0));
  }
  return out;
}
/** A hotel room's desk wall, `len` long (its back at +z): the long console (tint) with the desk at
 *  one end — its chair in front (−z) — the TV over the middle, the luggage rack at the other end. */
export function hotelDesk(len = 2.6): Parts {
  const x0 = -len / 2, dw = 1.1;
  return [
    P(box(len, 0.04, 0.5, 0, 0.74, 0), 'wood', T),
    P(box(0.04, 0.74, 0.46, x0 + 0.02, 0, 0), 'wood', T),
    P(box(0.04, 0.74, 0.46, len / 2 - 0.02, 0, 0), 'wood', T),
    P(box(len - dw - 0.1, 0.5, 0.46, x0 + dw + 0.05 + (len - dw - 0.1) / 2, 0.24, 0), 'wood', T), // the drawers under the TV
    P(box(1.0, 0.58, 0.04, 0.2, 1.1, 0.22), 'glass', 0x1c1d22), // the TV on the wall
    P(box(0.42, 0.04, 0.42, x0 + dw / 2, 0.44, -0.55), 'fabric', 0x3a3b3e), // the desk chair
    P(box(0.42, 0.42, 0.05, x0 + dw / 2, 0.48, -0.75), 'fabric', 0x3a3b3e),
    P(box(0.05, 0.44, 0.05, x0 + dw / 2 - 0.18, 0, -0.55), 'metal', 0x2a2b2e),
    P(box(0.05, 0.44, 0.05, x0 + dw / 2 + 0.18, 0, -0.55), 'metal', 0x2a2b2e),
    P(box(0.3, 0.3, 0.2, x0 + dw / 2 + 0.25, 0.78, 0.1), 'porcelain', 0xd8d2c4), // a lamp's base
    P(box(0.26, 0.18, 0.26, x0 + dw / 2 + 0.25, 1.08, 0.1), 'glow', 0xfff1d0),
  ];
}
/** A pupil's double desk (1.2 × 0.5 m laminate top on steel legs, a book rack under it) with its
 *  two chairs behind it (−z): the pupils look along +z, to the board. The chairs take the tint. */
export function schoolDesk(): Parts {
  const out: Parts = [P(box(1.2, 0.03, 0.5, 0, 0.7, 0), 'wood', 0xd9cbb0), P(box(1.1, 0.02, 0.36, 0, 0.56, 0.02), 'metal', 0x8d9296)];
  for (const [x, z] of [[-0.56, -0.21], [0.56, -0.21], [-0.56, 0.21], [0.56, 0.21]]) out.push(P(box(0.03, 0.7, 0.03, x, 0, z), 'metal', 0x6a6e72));
  for (const x of [-0.3, 0.3]) {
    out.push(P(box(0.38, 0.03, 0.36, x, 0.42, -0.5), 'solid', T));
    out.push(P(box(0.38, 0.28, 0.02, x, 0.56, -0.69), 'solid', T));
    for (const dx of [-0.17, 0.17]) out.push(P(box(0.02, 0.42, 0.34, x + dx, 0, -0.5), 'metal', 0x6a6e72));
  }
  return out;
}
/** A whiteboard w wide on the wall (its back at +z), in an aluminium frame with a pen tray. */
export function whiteboard(w = 3.0): Parts {
  return [
    P(box(w, 1.2, 0.02, 0, 0.9, 0.02), 'porcelain', 0xf6f7f4),
    P(box(w + 0.05, 0.03, 0.04, 0, 2.1, 0.01), 'metal', 0xb8bcbf),
    P(box(w + 0.05, 0.03, 0.04, 0, 0.87, 0.01), 'metal', 0xb8bcbf),
    P(box(0.03, 1.26, 0.04, -w / 2 - 0.01, 0.87, 0.01), 'metal', 0xb8bcbf),
    P(box(0.03, 1.26, 0.04, w / 2 + 0.01, 0.87, 0.01), 'metal', 0xb8bcbf),
    P(box(w * 0.6, 0.03, 0.08, 0, 0.87, -0.03), 'metal', 0xb8bcbf),
  ];
}
/** A library's double-sided stack `len` long (0.6 m deep, 1.9 m high): its panels (tint) and four
 *  shelves a side of books, filled by seed. */
export function bookStack(len: number, seed: number, spines: number[]): Parts {
  const rnd = seeded(seed), h = 1.9, d = 0.6;
  const out: Parts = [P(box(len, h, 0.03, 0, 0, 0), 'wood', T), P(box(0.035, h, d, -len / 2 + 0.0175, 0, 0), 'wood', T), P(box(0.035, h, d, len / 2 - 0.0175, 0, 0), 'wood', T), P(box(len, 0.03, d, 0, h - 0.03, 0), 'wood', T)];
  for (const side of [-1, 1])
    for (let r = 0; r < 4; r++) {
      const y = 0.08 + r * 0.44;
      out.push(P(box(len - 0.07, 0.02, d / 2 - 0.03, 0, y, side * (d / 4)), 'wood', T));
      let x = -len / 2 + 0.05;
      while (x < len / 2 - 0.12) {
        const bw = 0.035 + rnd() * 0.05, bh = 0.2 + rnd() * 0.13;
        if (rnd() > 0.15) out.push(P(box(bw, bh, d / 2 - 0.1, x + bw / 2, y + 0.02, side * (d / 4 + 0.02)), 'fabric', spines[Math.floor(rnd() * spines.length)]));
        x += bw + 0.008;
      }
    }
  return out;
}
/** A service counter `len` long — a bank's tellers, a post office's windows (its staff at +z): the
 *  counter (tint) under a stone top, a glass screen along it on posts, a window every ~1.5 m (its
 *  opening under the screen, the teller's screen behind). */
export function tellerCounter(len = 4.5): Parts {
  const n = Math.max(1, Math.round(len / 1.5));
  const out: Parts = [
    P(box(len, 1.06, 0.66, 0, 0, 0), 'wood', T),
    P(box(len + 0.04, 0.04, 0.72, 0, 1.06, 0), 'solid', 0xd8d2c4),
    P(box(len, 0.62, 0.012, 0, 1.3, 0.02), 'glass', 0xcfe0e4),
  ];
  for (let i = 0; i <= n; i++) out.push(P(box(0.04, 0.9, 0.04, -len / 2 + (i * len) / n, 1.1, 0.02), 'metal', 0x8a8e90));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + ((i + 0.5) * len) / n;
    out.push(P(box(0.46, 0.3, 0.03, x, 1.12, 0.26), 'glass', 0x22252a));
    out.push(P(box(0.3, 0.14, 0.02, x, 1.94, 0.02), 'glow', 0xfff1d0)); // the window's number
  }
  return out;
}
/** Queue posts: stanchions every 1.4 m along `len` (x), a belt between each pair. */
export function queuePosts(len = 2.8): Parts {
  const n = Math.max(1, Math.round(len / 1.4)), out: Parts = [];
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i * len) / n;
    out.push(P(cyl(0.16, 0.16, 0.03, x, 0, 0, 10), 'metal', 0x3a3b3e), P(cyl(0.025, 0.025, 0.95, x, 0.03, 0, 6), 'metal', 0xb8bcbf));
    if (i < n) out.push(P(box(len / n - 0.06, 0.05, 0.01, x + len / (2 * n), 0.88, 0), 'fabric', 0x8c2f2a));
  }
  return out;
}
/** A cash machine set into the wall (its back at +z): the fascia, its lit screen and keypad. */
export function atm(): Parts {
  return [P(box(0.8, 1.75, 0.3, 0, 0, 0.05), 'metal', 0x6a7078), P(box(0.34, 0.26, 0.02, 0, 1.25, -0.11), 'glow', 0x9fd6ff), P(box(0.3, 0.02, 0.2, 0, 0.98, -0.18), 'solid', 0x2c2e33), P(box(0.7, 0.12, 0.02, 0, 1.6, -0.11), 'glow', 0xfff1d0)];
}
/** A treadmill: its deck and belt, the uprights and the lit console at the front (+z: the runner
 *  looks that way). */
export function treadmill(): Parts {
  return [
    P(box(0.78, 0.2, 1.9, 0, 0, -0.05), 'solid', 0x3a3b3e),
    P(box(0.54, 0.012, 1.62, 0, 0.2, -0.1), 'solid', 0x1c1d20),
    P(box(0.05, 1.12, 0.06, -0.34, 0.2, 0.84), 'metal', 0x8a8e90),
    P(box(0.05, 1.12, 0.06, 0.34, 0.2, 0.84), 'metal', 0x8a8e90),
    P(box(0.74, 0.26, 0.16, 0, 1.3, 0.82), 'solid', T),
    P(box(0.4, 0.16, 0.01, 0, 1.35, 0.735), 'glow', 0x9fd6ff),
    P(box(0.04, 0.04, 0.5, -0.36, 1.1, 0.55), 'metal', 0xb8bcbf),
    P(box(0.04, 0.04, 0.5, 0.36, 1.1, 0.55), 'metal', 0xb8bcbf),
  ];
}
/** A weight bench with its barbell racked (the bench along z, the bar across x). */
export function weightBench(): Parts {
  const bar = cyl(0.015, 0.015, 1.8, 0, -0.9, 0, 6).rotateZ(Math.PI / 2).translate(0, 1.12, 0.45);
  const plate = (x: number) => cyl(0.22, 0.22, 0.05, 0, -0.025, 0, 12).rotateZ(Math.PI / 2).translate(x, 1.12, 0.45);
  return [
    P(box(0.3, 0.1, 1.2, 0, 0.42, 0), 'fabric', T),
    P(box(0.06, 0.42, 0.06, 0, 0, -0.5), 'metal', 0x3a3b3e),
    P(box(0.06, 0.42, 0.06, 0, 0, 0.45), 'metal', 0x3a3b3e),
    P(box(0.5, 0.04, 0.3, 0, 0, 0.45), 'metal', 0x3a3b3e),
    P(box(0.05, 1.14, 0.05, -0.28, 0, 0.45), 'metal', 0x3a3b3e),
    P(box(0.05, 1.14, 0.05, 0.28, 0, 0.45), 'metal', 0x3a3b3e),
    P(bar, 'metal', 0xc8ccce),
    P(plate(-0.7), 'metal', 0x2a2b2e),
    P(plate(0.7), 'metal', 0x2a2b2e),
  ];
}
/** A dumbbell rack `len` long (its back at +z): two sloping tiers, a pair of dumbbells to a slot. */
export function dumbbellRack(len = 1.8): Parts {
  const out: Parts = [P(box(len, 0.06, 0.5, 0, 0.3, 0), 'metal', 0x3a3b3e), P(box(len, 0.06, 0.4, 0, 0.72, 0.05), 'metal', 0x3a3b3e)];
  for (const s of [-1, 1]) out.push(P(box(0.06, 0.78, 0.5, s * (len / 2 - 0.03), 0, 0), 'metal', 0x3a3b3e));
  const n = Math.max(2, Math.floor(len / 0.3));
  for (const [y, z] of [[0.36, -0.08], [0.78, 0.05]] as const)
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + 0.5) * (len / n), r = 0.05 + (i / n) * 0.05;
      out.push(P(box(0.24, 2 * r, 2 * r, x, y, z), 'solid', 0x1c1d20), P(box(0.12, 0.03, 0.03, x, y + r - 0.015, z), 'metal', 0xb8bcbf));
    }
  return out;
}
/** A bank of lockers `len` long (its back at +z), two tiers of doors (tint) with their vents. */
export function lockers(len = 1.8): Parts {
  const n = Math.max(1, Math.round(len / 0.4)), out: Parts = [P(box(len, 1.8, 0.45, 0, 0.08, 0), 'metal', T), P(box(len, 0.08, 0.4, 0, 0, 0.02), 'solid', 0x2e2c2a)];
  for (let i = 1; i < n; i++) out.push(P(box(0.012, 1.76, 0.01, -len / 2 + (i * len) / n, 0.1, -0.226), 'metal', 0x5a5e62));
  out.push(P(box(len - 0.02, 0.012, 0.01, 0, 0.98, -0.226), 'metal', 0x5a5e62));
  for (let i = 0; i < n; i++) for (const y of [0.8, 1.7]) out.push(P(box(0.14, 0.04, 0.01, -len / 2 + ((i + 0.5) * len) / n, y, -0.228), 'metal', 0x3a3b3e));
  return out;
}

// ---- the way in (review round 10, must-fix 4: "the front door opens on a home"): coats hanging on
// their rail, a bordered runner, the console with its lamp lit, a mirror over it, the skirting
// round every wall, a ceiling light's glass dome. Back at +z, as every wall piece ----
/** An open tube from y0 to y0 + h (a sleeve, a rod): no end caps — nobody looks up a sleeve. */
const tube = (r0: number, r1: number, h: number, segs = 6) => ni(new THREE.CylinderGeometry(r1, r0, h, segs, 1, true)).translate(0, h / 2, 0);
/** A turned shape from (radius, height) pairs. */
const turned = (pts: [number, number][], segs: number) => ni(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), segs));
/** Coats a hall's rail holds: navy, brick, mustard, olive, charcoal, rust, slate, oatmeal. */
export const COATS = [0x3f5a78, 0x8c3a2e, 0xc9a24b, 0x5f6e4a, 0x34322f, 0xb8604a, 0x6f7f8f, 0xd8cfb8];
/** One coat hanging from its peg, `len` long from the collar to the hem: a rounded body that narrows
 *  at the waist and flares a touch to the hem, sloping shoulders, its sleeves down its sides, a
 *  collar — flattened against the wall the way a coat hangs. Its middle at (x, z), its hem at y0. */
function coat(len: number, hex: number, x: number, z: number, y0: number): Parts {
  const L = len, body = turned([[0.225, 0], [0.215, 0.14 * L], [0.188, 0.46 * L], [0.205, 0.72 * L], [0.192, 0.86 * L], [0.12, 0.95 * L], [0.045, L]], 8).scale(1, 1, 0.5);
  const out: Parts = [P(body.translate(x, y0, z), 'fabric', hex)];
  for (const s of [-1, 1]) {
    const sl = tube(0.056, 0.05, 0.6 * L).rotateZ(s * 0.07).translate(x + s * 0.2, y0 + 0.28 * L, z - 0.015);
    out.push(P(sl, 'fabric', darken(hex, 0.08)));
  }
  out.push(P(box(0.17, 0.07, 0.1, x, y0 + L - 0.1, z - 0.02), 'fabric', darken(hex, 0.15))); // the collar
  return out;
}
/** A coat rail by the front door, `w` wide, its back on the wall at 1.66 m: the board and its pegs,
 *  a hat shelf over it with a hat on it, and `n` coats (≥ 3) of 0.9–1.1 m hanging from the pegs, in
 *  colours and lengths by `seed`. 0.3 m deep. */
export function coatRail(w = 1.0, n = 3, seed = 1): Parts {
  const rnd = seeded(seed), zw = 0.15;
  const out: Parts = [
    P(box(w, 0.1, 0.025, 0, 1.62, zw - 0.0125), 'wood', T),
    P(box(w + 0.06, 0.025, 0.24, 0, 1.86, zw - 0.12), 'wood', T), // the hat shelf
  ];
  for (const s of [-1, 1]) out.push(P(box(0.025, 0.14, 0.2, s * (w / 2 - 0.06), 1.72, zw - 0.1), 'wood', T)); // its brackets
  // (crowded the way a rail is: each coat half over the next, every other one a little proud of it)
  const pitch = (w - 0.5) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.25 + i * pitch, len = 0.9 + rnd() * 0.2;
    out.push(P(box(0.024, 0.024, 0.07, x, 1.655, zw - 0.06), 'metal', 0xc9a74a)); // the peg
    out.push(...coat(len, COATS[Math.floor(rnd() * COATS.length)], x + (rnd() - 0.5) * 0.02, zw - 0.135 - (i % 2) * 0.02, 1.69 - len));
  }
  // a hat on the shelf
  const hx = (rnd() - 0.5) * (w - 0.4);
  out.push(P(turned([[0.17, 0], [0.17, 0.012], [0.1, 0.02], [0.096, 0.1], [0.07, 0.12], [0.001, 0.125]], 10).scale(1, 1, 0.9).translate(hx, 1.885, zw - 0.12), 'fabric', COATS[Math.floor(rnd() * COATS.length)]));
  return out;
}
/** A hall runner `len` × `w` lying on the floor (x along it): its field (tint), a border round it, a
 *  pale pinstripe inside the border, diamonds down the middle, a fringe at each end. */
export function runner(len: number, w = 0.8, border = 0x8c2f2a, figure = 0xe9dcc0): Parts {
  const t = 0.008, b = Math.min(0.12, w * 0.16), fl = len - 2 * b, fw = w - 2 * b;
  const out: Parts = [
    P(box(fl, t, fw, 0, 0, 0), 'fabric', T),
    P(box(len, t, b, 0, 0, -w / 2 + b / 2), 'fabric', border), P(box(len, t, b, 0, 0, w / 2 - b / 2), 'fabric', border),
    P(box(b, t, fw, -len / 2 + b / 2, 0, 0), 'fabric', border), P(box(b, t, fw, len / 2 - b / 2, 0, 0), 'fabric', border),
  ];
  for (const s of [-1, 1]) {
    out.push(P(box(fl - 0.06, 0.002, 0.022, 0, t, s * (fw / 2 - 0.045)), 'fabric', figure)); // the pinstripe
    out.push(P(box(0.06, 0.003, w - 0.06, s * (len / 2 + 0.03), 0, 0), 'fabric', 0xefe8d8)); // the fringe
  }
  const nd = Math.max(1, Math.min(7, Math.floor(fl / 0.62)));
  for (let i = 0; i < nd; i++) {
    const d = Math.min(0.3, fw * 0.55) / Math.SQRT2;
    out.push(P(box(d, 0.002, d, 0, t, 0).rotateY(Math.PI / 4).translate(-fl / 2 + (i + 0.5) * (fl / nd), 0, 0), 'fabric', i % 2 ? figure : border));
  }
  return out;
}
/** A hall console `w` wide, 0.32 m deep, 0.8 m high (its wood the tint): top, an apron with a drawer,
 *  a shelf low down with books on it, slim legs — its table lamp lit at one end (a turned ceramic
 *  base, a drum shade), a bowl for the keys at the other. */
export function consoleLamp(w = 1.0, base = 0x7fa0b8, shade = 0xfff1d0): Parts {
  const d = 0.32, h = 0.8, lx = -w / 2 + 0.2;
  const out: Parts = [
    P(box(w, 0.03, d, 0, h - 0.03, 0), 'wood', T),
    P(box(w - 0.07, 0.1, d - 0.05, 0, h - 0.13, 0), 'wood', T),
    P(box(0.12, 0.02, 0.012, 0, h - 0.09, -d / 2 + 0.02), 'metal', 0xc9a74a), // the drawer's pull
    P(box(w - 0.08, 0.02, d - 0.07, 0, 0.16, 0), 'wood', T),
    P(box(0.24, 0.045, 0.17, w / 2 - 0.2, 0.18, 0), 'fabric', 0x8c3a2e), P(box(0.21, 0.04, 0.16, w / 2 - 0.21, 0.225, 0.005), 'fabric', 0x3f5a78),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(P(cyl(0.015, 0.02, h - 0.03, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 6), 'wood', T));
  out.push(P(turned([[0.03, 0], [0.075, 0.04], [0.085, 0.13], [0.05, 0.24], [0.02, 0.27]], 10).translate(lx, h, 0.02), 'porcelain', base));
  out.push(P(cyl(0.008, 0.008, 0.08, lx, h + 0.27, 0.02, 5), 'metal', 0xc9a74a));
  out.push(P(turned([[0.15, 0], [0.12, 0.2]], 12).translate(lx, h + 0.33, 0.02), 'glow', shade));
  out.push(P(turned([[0.001, 0], [0.08, 0.005], [0.12, 0.05]], 10).translate(w / 2 - 0.22, h, 0), 'porcelain', 0xe9e2d0)); // the bowl
  return out;
}
/** A mirror `w` × `h` hung on the wall (its bottom at y = 0): a moulded frame (tint) round the glass. */
export function mirror(w = 0.7, h = 0.9): Parts {
  const t = 0.055, d = 0.035;
  return [
    P(box(w, t, d, 0, 0, 0), 'wood', T), P(box(w + 0.03, t, d + 0.006, 0, h - t, 0), 'wood', T),
    P(box(t, h - 2 * t, d, -w / 2 + t / 2, t, 0), 'wood', T), P(box(t, h - 2 * t, d, w / 2 - t / 2, t, 0), 'wood', T),
    P(box(w - 2 * t + 0.01, h - 2 * t + 0.01, 0.006, 0, t - 0.005, 0.006), 'glass', 0xd6e0e4),
  ];
}
/** Skirting a metre long — its instances stretch it along x to each wall's length — 12 cm high, its
 *  back on the wall: the board and a moulded top, trim white. */
export const SKIRT_H = 0.12;
export function skirting(hex = 0xf4f1ea): Parts {
  return [P(box(1, 0.104, 0.013, 0, 0, 0.0025), 'solid', hex), P(box(1, 0.016, 0.018, 0, 0.104, 0), 'solid', hex)];
}
/** A ceiling light's glass dome under a brass rim, hanging from its top (y = 0.12): `lamp` lit only
 *  after dark (a room with windows), `glow` always (a hall without one). */
export function ceilingDome(r = 0.17, mat: 'glow' | 'lamp' = 'glow'): Parts {
  const h = 0.12;
  return [
    P(cyl(r + 0.025, r + 0.025, 0.02, 0, h - 0.02, 0, 14), 'metal', 0xc9a74a),
    P(turned([[0.001, 0], [r * 0.55, 0.012], [r * 0.88, h * 0.4], [r, h - 0.02]], 14), mat, 0xfff3d8),
  ];
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
