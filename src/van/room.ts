// The room in the back of the van: its walls, floor and ceiling (the shell), the passage through
// the back wall (the tunnel), and what's in it — a bed, the map table, shelves, a little kitchen,
// an armchair under the empty wall where your first painting will hang. Built in the van's own
// frame (layout.ts), so the van's pose places it.
//
// Lit by itself: daylight from its windows and the open doorway, its lamps (warm, brighter after
// dark), never the sun's shadow map — the room is wherever the van is, and the world's shadows
// (the van's own among them) don't fall inside it. It writes alpha 0.75: "always painted" to the
// post (render/post.ts), so the town's pencil never reaches your home.
import * as THREE from 'three';
import { paintMaterial } from '../render/shared';
import * as D from '../assets/decor';
import type { VanLayout, Furn, Opening } from './layout';

/** The material channels (aMat): decor's, then the room's own surfaces. */
const MAT: Record<D.DecorMat, number> = { solid: 0, fabric: 1, wood: 2, metal: 3, porcelain: 4, glass: 5, glow: 6, lamp: 7 };
const WALL = 10, FLOOR = 11, CEIL = 12, TRIM = 13;

// the palette: honey wood, cream plaster, sage trim, a quilt and curtains in faded red and mustard
export const ROOM_COLORS = {
  plaster: 0xf1e8d6, wainscot: 0xb98b5c, trim: 0xa9b99a, floor: 0x9a6a42, ceiling: 0xe6d6b8, beam: 0x7a5636,
  wood: 0x9c6e45, quilt: 0xb3473d, curtain: 0xd8a640, chair: 0x6e8fa0, rug: 0x3f5f7a, rugBorder: 0xb3473d,
};

interface Built { pos: number[]; nor: number[]; col: number[]; mat: number[] }
const mk = (): Built => ({ pos: [], nor: [], col: [], mat: [] });

/** A flat quad p0→p1→p2→p3 facing n (the winding is fixed to face it). */
function quad(b: Built, p: [number, number, number][], n: [number, number, number], hex: number, m: number) {
  const c = new THREE.Color(hex);
  const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
  const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
  const tri = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
  for (const i of tri) {
    b.pos.push(...p[i]);
    b.nor.push(...n);
    b.col.push(c.r, c.g, c.b);
    b.mat.push(m);
  }
}

/** A rectangle less some rectangular holes, as non-overlapping rectangles: banded at every hole's
 *  sill and head, each band's solid runs between the holes that cross it. (u along, v up.) */
export function wallPieces(W: number, H: number, holes: { u0: number; u1: number; v0: number; v1: number }[]) {
  const vs = [...new Set([0, H, ...holes.flatMap((h) => [h.v0, h.v1])])].filter((v) => v >= 0 && v <= H).sort((a, b) => a - b);
  const out: { u0: number; u1: number; v0: number; v1: number }[] = [];
  for (let i = 0; i + 1 < vs.length; i++) {
    const v0 = vs[i], v1 = vs[i + 1], vm = (v0 + v1) / 2;
    const cut = holes.filter((h) => h.v0 < vm && h.v1 > vm).sort((a, b) => a.u0 - b.u0);
    let u = 0;
    for (const h of cut) { if (h.u0 > u) out.push({ u0: u, u1: h.u0, v0, v1 }); u = Math.max(u, h.u1); }
    if (u < W) out.push({ u0: u, u1: W, v0, v1 });
  }
  return out;
}

/** The decor piece (its back toward +z, on the floor) turned and stood where the layout says. */
function placeParts(b: Built, parts: D.DecorPart[], x: number, y: number, z: number, yaw: number, tint?: number) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const P = g.getAttribute('position'), N = g.getAttribute('normal');
    const c = new THREE.Color(p.hex === 0xffffff && tint !== undefined ? tint : p.hex);
    for (let i = 0; i < P.count; i++) {
      v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m);
      b.pos.push(v.x, v.y, v.z);
      v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
      b.nor.push(v.x, v.y, v.z);
      b.col.push(c.r, c.g, c.b);
      b.mat.push(MAT[p.mat]);
    }
  }
}
const part = (g: THREE.BufferGeometry, mat: D.DecorMat, hex: number): D.DecorPart => ({ g, mat, hex });
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y + h / 2, z);

function geometry(b: Built) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(b.mat, 1));
  g.computeBoundingSphere();
  return g;
}

/** The shell: floor, ceiling and four walls facing in, cut at the windows and the passage. Convex
 *  from inside: no face of it hides another, so it can be laid over the world without a depth
 *  test (van.ts) and the world shows only through its openings. */
export function shellGeometry(L: VanLayout) {
  const b = mk(), C = ROOM_COLORS;
  const { x0, x1, z0, z1, y0, y1 } = L.room, H = y1 - y0;
  quad(b, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, 1, 0], C.floor, FLOOR);
  quad(b, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, -1, 0], C.ceiling, CEIL);
  const holes = (wall: Opening['wall'], flipU: boolean, len: number) => L.windows.filter((w) => w.wall === wall).map((w) => {
    const c = flipU ? len - (w.c - (wall === 'front' ? x0 : z0)) : w.c - (wall === 'front' ? x0 : z0);
    return { u0: c - w.w / 2, u1: c + w.w / 2, v0: w.y0, v1: w.y1 };
  });
  const D_ = z1 - z0, W_ = x1 - x0;
  // left wall (x0, facing +x): u along +z from z0
  for (const r of wallPieces(D_, H, holes('left', false, D_))) quad(b, [[x0, y0 + r.v0, z0 + r.u0], [x0, y0 + r.v0, z0 + r.u1], [x0, y0 + r.v1, z0 + r.u1], [x0, y0 + r.v1, z0 + r.u0]], [1, 0, 0], C.plaster, WALL);
  for (const r of wallPieces(D_, H, holes('right', false, D_))) quad(b, [[x1, y0 + r.v0, z0 + r.u0], [x1, y0 + r.v0, z0 + r.u1], [x1, y0 + r.v1, z0 + r.u1], [x1, y0 + r.v1, z0 + r.u0]], [-1, 0, 0], C.plaster, WALL);
  for (const r of wallPieces(W_, H, holes('front', false, W_))) quad(b, [[x0 + r.u0, y0 + r.v0, z0], [x0 + r.u1, y0 + r.v0, z0], [x0 + r.u1, y0 + r.v1, z0], [x0 + r.u0, y0 + r.v1, z0]], [0, 0, 1], C.plaster, WALL);
  // the back wall, open at the passage
  const d = L.door;
  for (const r of wallPieces(W_, H, [{ u0: d.x0 - x0, u1: d.x1 - x0, v0: 0, v1: d.y1 - y0 }])) quad(b, [[x0 + r.u0, y0 + r.v0, z1], [x0 + r.u1, y0 + r.v0, z1], [x0 + r.u1, y0 + r.v1, z1], [x0 + r.u0, y0 + r.v1, z1]], [0, 0, -1], C.plaster, WALL);
  return geometry(b);
}

/** The passage's four faces (its sides, floor and head), as the portal box (van.ts) draws them —
 *  the same surfaces in and out, so the view through the doorway never changes as you step in. */
export function tunnelFaces(L: VanLayout): { p: [number, number, number][]; n: [number, number, number] }[] {
  const d = L.door, t = L.tunnel;
  return [
    { p: [[d.x0, d.y0, t.z0], [d.x0, d.y0, t.z1], [d.x0, d.y1, t.z1], [d.x0, d.y1, t.z0]], n: [1, 0, 0] },
    { p: [[d.x1, d.y0, t.z0], [d.x1, d.y0, t.z1], [d.x1, d.y1, t.z1], [d.x1, d.y1, t.z0]], n: [-1, 0, 0] },
    { p: [[d.x0, d.y0, t.z0], [d.x1, d.y0, t.z0], [d.x1, d.y0, t.z1], [d.x0, d.y0, t.z1]], n: [0, 1, 0] },
    { p: [[d.x0, d.y1, t.z0], [d.x1, d.y1, t.z0], [d.x1, d.y1, t.z1], [d.x0, d.y1, t.z1]], n: [0, -1, 0] },
  ];
}

export function tunnelGeometry(L: VanLayout) {
  const b = mk(), C = ROOM_COLORS;
  for (const f of tunnelFaces(L)) quad(b, f.p, f.n, f.n[1] > 0.5 ? C.floor : C.trim, f.n[1] > 0.5 ? FLOOR : TRIM);
  return geometry(b);
}

/** Everything in the room, and its woodwork: window frames, curtains, beams, string lights,
 *  skirting, the door's frame, the furniture. */
export function contentsGeometry(L: VanLayout) {
  const b = mk(), C = ROOM_COLORS;
  const { x0, x1, z0, z1, y0, y1 } = L.room;
  const add = (parts: D.DecorPart[], x: number, z: number, yaw: number, y = y0, tint?: number) => placeParts(b, parts, x, y, z, yaw, tint);
  // windows: a frame round each, a cross of glazing bars, a sill, curtains tied back either side
  for (const w of L.windows) {
    const side = w.wall === 'left' ? 1 : w.wall === 'right' ? -1 : 0; // +1: the left wall, facing +x
    const wx = w.wall === 'left' ? x0 : w.wall === 'right' ? x1 : 0;
    const parts: D.DecorPart[] = [];
    const fw = 0.07, fd = 0.1, hh = w.y1 - w.y0;
    // built as decor is — its back (+z) on the wall, the room toward −z — then turned onto its wall
    parts.push(part(bx(w.w + 2 * fw, fw, fd, 0, w.y1, -fd / 2 + 0.01), 'wood', C.trim));
    parts.push(part(bx(w.w + 2 * fw + 0.08, 0.05, 0.16, 0, w.y0 - 0.05, -0.07), 'wood', C.trim)); // the sill
    for (const s of [-1, 1]) parts.push(part(bx(fw, hh, fd, s * (w.w / 2 + fw / 2), w.y0, -fd / 2 + 0.01), 'wood', C.trim));
    parts.push(part(bx(0.03, hh, 0.035, 0, w.y0, 0.01), 'wood', C.trim)); // the glazing bars, in the opening
    parts.push(part(bx(w.w, 0.03, 0.035, 0, w.y0 + hh * 0.55, 0.01), 'wood', C.trim));
    parts.push(part(bx(w.w + 0.9, 0.025, 0.025, 0, w.y1 + 0.16, -0.07), 'metal', 0x6a5a40)); // the rod
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const fold = k % 2 ? C.curtain : new THREE.Color(C.curtain).multiplyScalar(0.84).getHex();
      const len = hh + 0.42 - k * 0.02;
      parts.push(part(bx(0.09, len, 0.04, s * (w.w / 2 + 0.1 + k * 0.075), w.y1 + 0.16 - len, -0.09 - (k % 2) * 0.02), 'fabric', fold));
    }
    for (const s of [-1, 1]) parts.push(part(bx(0.36, 0.05, 0.07, s * (w.w / 2 + 0.2), w.y0 + hh * 0.45, -0.13), 'fabric', 0xa6382f)); // the tie-backs
    // onto the wall: the frame's back (+z) against it, its front toward the room
    if (side !== 0) add(parts, wx + side * 0.0, w.c, side > 0 ? -Math.PI / 2 : Math.PI / 2, y0);
    else add(parts, w.c, z0, Math.PI, y0);
  }
  // the door's frame on the room side, round the passage
  {
    const d = L.door, ft = 0.1, parts: D.DecorPart[] = [];
    parts.push(part(bx(d.x1 - d.x0 + 2 * ft, ft, 0.06, 0, d.y1 - y0, 0), 'wood', C.trim));
    for (const s of [-1, 1]) parts.push(part(bx(ft, d.y1 - d.y0, 0.06, s * ((d.x1 - d.x0) / 2 + ft / 2), 0, 0), 'wood', C.trim));
    add(parts, (d.x0 + d.x1) / 2, z1 - 0.03, 0, y0);
  }
  // skirting and a chair rail round the walls (stopping at the doorway)
  {
    const sk = 0.1, t = 0.025, parts: D.DecorPart[] = [];
    const run = (ax: number, az: number, bx_: number, bz: number, nx: number, nz: number) => {
      const len = Math.hypot(bx_ - ax, bz - az), yaw = Math.atan2(nx, nz);
      for (const [h, y] of [[sk, 0], [0.05, 0.95]] as const) {
        const g = new THREE.BoxGeometry(len, h, t).toNonIndexed().translate(0, y + h / 2, 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate((ax + bx_) / 2 + nx * t / 2, y0, (az + bz) / 2 + nz * t / 2);
        parts.push(part(g, 'wood', C.trim));
      }
    };
    run(x0, z0, x1, z0, 0, 1);
    run(x0, z0, x0, z1, 1, 0);
    run(x1, z0, x1, z1, -1, 0);
    run(x0, z1, L.door.x0 - 0.1, z1, 0, -1);
    run(L.door.x1 + 0.1, z1, x1, z1, 0, -1);
    placeParts(b, parts, 0, 0, 0, 0);
  }
  // beams across the ceiling, and a string of lights along the room, sagging between them
  for (let z = z0 + 0.8; z < z1 - 0.3; z += 1.2) placeParts(b, [part(bx(x1 - x0, 0.14, 0.13, 0, y1 - 0.14, z), 'wood', C.beam)], 0, 0, 0, 0);
  {
    const parts: D.DecorPart[] = [];
    for (const xs of [-0.9, 0.9]) {
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const t = i / n, z = z0 + 0.4 + t * (z1 - z0 - 0.8), sag = 0.18 * Math.sin(Math.PI * ((t * 5) % 1));
        const y = y1 - 0.2 - sag;
        parts.push(part(new THREE.SphereGeometry(0.028, 6, 4).toNonIndexed().translate(xs, y - 0.03, z), 'glow', 0xffe2a8));
        if (i < n) {
          const t2 = (i + 1) / n, z2 = z0 + 0.4 + t2 * (z1 - z0 - 0.8), y2 = y1 - 0.2 - 0.18 * Math.sin(Math.PI * ((t2 * 5) % 1));
          const seg = new THREE.CylinderGeometry(0.004, 0.004, Math.hypot(z2 - z, y2 - y), 3).toNonIndexed();
          seg.rotateX(Math.PI / 2 - Math.atan2(y2 - y, z2 - z)).translate(xs, (y + y2) / 2, (z + z2) / 2);
          parts.push(part(seg, 'metal', 0x3a3530));
        }
      }
    }
    placeParts(b, parts, 0, 0, 0, 0);
  }
  // the furniture
  for (const f of L.furniture) furnish(b, f, L);
  return geometry(b);
}

function furnish(b: Built, f: Furn, L: VanLayout) {
  const C = ROOM_COLORS, y0 = L.room.y0;
  const add = (parts: D.DecorPart[], dx = 0, dz = 0, y = y0, tint?: number) => {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    placeParts(b, parts, f.x + dx * c + dz * s, y, f.z - dx * s + dz * c, f.yaw, tint);
  };
  switch (f.kind) {
    case 'bed': {
      add(D.bed(f.hx * 2, f.hz * 2, C.quilt, C.wood));
      add([part(bx(f.hx * 2 + 0.04, 0.03, 0.5, 0, 0.58, f.hz - 0.95), 'fabric', 0xe9dcbc)]); // a folded blanket
      break;
    }
    case 'nightstand': {
      add([part(bx(0.42, 0.52, 0.38, 0, 0, 0), 'wood', C.wood), part(bx(0.36, 0.012, 0.012, 0, 0.36, -0.195), 'metal', 0x3a3530)]);
      add(D.lamp(false), 0, 0, y0 + 0.52);
      add([part(bx(0.16, 0.035, 0.22, 0.1, 0.52, 0.04), 'solid', 0x7a3a2e), part(bx(0.15, 0.03, 0.21, 0.1, 0.555, 0.04), 'solid', 0x35506a)]); // books
      break;
    }
    case 'floorlamp': add(D.lamp(true)); break;
    case 'maptable': {
      add(D.table(f.hx * 2, f.hz * 2, 0.76, C.wood));
      // a mug, a pencil, a book: the map itself is its own mesh (van.ts: a picture on it)
      add([part(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10).toNonIndexed().translate(0.48, 0.81, -0.22), 'porcelain', 0xe9e4d6)]);
      add([part(bx(0.17, 0.01, 0.012, -0.3, 0.765, 0.25), 'wood', 0xd8a640)]);
      add([part(bx(0.2, 0.05, 0.27, 0.55, 0.76, 0.2), 'solid', 0x2f5a46)]);
      break;
    }
    case 'chair': add(D.chair(C.chair, 0xd9c7a3)); break;
    case 'rug': add(D.runner(f.hx * 2, f.hz * 2, C.rugBorder, 0xe9dcc0), 0, 0, y0 + 0.004, C.rug); break;
    case 'shelves': add(D.shelves(f.hx * 2, f.hz * 2, 1.95, C.wood, [0x7a3a2e, 0x35506a, 0xd8a640, 0x4f6b4a, 0xe9dcbc, 0x8a6a4c], 7)); break;
    case 'kitchen': {
      const w = f.hx * 2, d = f.hz * 2;
      const parts: D.DecorPart[] = [
        part(bx(w, 0.86, d, 0, 0, 0), 'wood', 0x8fa58a),
        part(bx(w + 0.04, 0.04, d + 0.03, 0, 0.86, -0.01), 'wood', C.wood),
        part(bx(0.5, 0.02, 0.4, -w / 2 + 0.36, 0.9, -0.02), 'metal', 0x2e2e30), // the stove top
        part(bx(0.34, 0.012, 0.3, w / 2 - 0.3, 0.9, -0.03), 'metal', 0x9aa0a4), // the sink
        part(bx(w - 0.1, 0.03, 0.22, 0, 1.55, d / 2 - 0.11), 'wood', C.wood), // a shelf over it
      ];
      for (const s of [-1, 1]) parts.push(part(new THREE.TorusGeometry(0.075, 0.012, 4, 14).toNonIndexed().rotateX(Math.PI / 2).translate(-w / 2 + 0.36 + s * 0.12, 0.925, -0.02), 'metal', 0x1c1c1e));
      for (let k = -2; k <= 2; k++) parts.push(part(bx(0.01, 0.6, 0.012, k * (w / 5), 0.12, -d / 2 - 0.006), 'wood', 0x6f866c)); // the cupboard doors' seams
      const kettle = new THREE.LatheGeometry([new THREE.Vector2(0.08, 0), new THREE.Vector2(0.095, 0.08), new THREE.Vector2(0.06, 0.17), new THREE.Vector2(0.025, 0.2), new THREE.Vector2(0.001, 0.205)], 12).toNonIndexed();
      parts.push(part(kettle.translate(-w / 2 + 0.24, 0.92, -0.02), 'metal', 0xb3473d));
      for (let k = 0; k < 4; k++) parts.push(part(new THREE.CylinderGeometry(0.045, 0.04, 0.16 + (k % 2) * 0.05, 10).toNonIndexed().translate(-w / 2 + 0.25 + k * 0.28, 1.58 + (0.16 + (k % 2) * 0.05) / 2, d / 2 - 0.12), 'glass', [0xd9c7a3, 0xe0b24a, 0xc9d6d0, 0xb98b5c][k]));
      add(parts);
      break;
    }
    case 'plant': add(D.pottedPlant(true)); break;
    case 'coats': add(D.coatRail(f.hx * 2, 3, 11), 0, 0, y0, C.wood); break;
    case 'armchair': add(D.armchair(f.hx * 2, f.hz * 2, 0x6f7f5a)); break;
    case 'picturerail': {
      // the empty wall: a picture rail along it and two brass hooks waiting for a painting
      const parts: D.DecorPart[] = [part(bx(f.hx * 2, 0.04, 0.03, 0, 2.25, 0), 'wood', C.trim)];
      for (const s of [-1, 1]) parts.push(part(bx(0.02, 0.06, 0.03, s * 0.35, 2.19, -0.02), 'metal', 0xc9a74a));
      add(parts);
      break;
    }
    case 'doormat': add([part(bx(f.hx * 2, 0.012, f.hz * 2, 0, 0.002, 0), 'fabric', 0xb08a52)]); break;
    case 'cabcurtain': {
      // a doorway's frame on the front wall and a heavy curtain drawn across it: through it, the cab
      const w = f.hx * 2, h = 2.05, parts: D.DecorPart[] = [];
      parts.push(part(bx(w + 0.2, 0.1, 0.06, 0, h, 0.03), 'wood', C.trim));
      for (const s of [-1, 1]) parts.push(part(bx(0.1, h, 0.06, s * (w / 2 + 0.05), 0, 0.03), 'wood', C.trim));
      parts.push(part(bx(w, h, 0.02, 0, 0, 0.05), 'fabric', 0x7a3f36)); // (its lining: nothing shows through)
      for (let k = 0; k < 9; k++) {
        const fold = k % 2 ? 0xa64b3f : new THREE.Color(0xa64b3f).multiplyScalar(0.8).getHex();
        parts.push(part(bx(w / 9 + 0.02, h - 0.04, 0.05, -w / 2 + (k + 0.5) * (w / 9), 0.02, -0.01 - (k % 2) * 0.025), 'fabric', fold));
      }
      parts.push(part(bx(w + 0.3, 0.025, 0.025, 0, h - 0.03, -0.04), 'metal', 0x6a5a40)); // its rod
      add(parts);
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The room's light: a soft area light at each window and the doorway (the sky's colour, the day's
// brightness), its lamps, its glowing bulbs. In the room's own frame (the van-local positions the
// layout gives), so the van can drive with its lights going along.
export interface RoomLights { win: THREE.Vector4[]; winN: THREE.Vector3[]; lamp: THREE.Vector4[] }
export function roomLights(L: VanLayout): RoomLights {
  const win: THREE.Vector4[] = [], winN: THREE.Vector3[] = [];
  const mid = (w: Opening) => L.room.y0 + (w.y0 + w.y1) / 2;
  for (const w of L.windows) {
    const area = w.w * (w.y1 - w.y0);
    if (w.wall === 'left') { win.push(new THREE.Vector4(L.room.x0, mid(w), w.c, area)); winN.push(new THREE.Vector3(1, 0, 0)); }
    else if (w.wall === 'right') { win.push(new THREE.Vector4(L.room.x1, mid(w), w.c, area)); winN.push(new THREE.Vector3(-1, 0, 0)); }
    else { win.push(new THREE.Vector4(w.c, mid(w), L.room.z0, area)); winN.push(new THREE.Vector3(0, 0, 1)); }
  }
  const d = L.door;
  win.push(new THREE.Vector4((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, L.room.z1, (d.x1 - d.x0) * (d.y1 - d.y0) * 0.8));
  winN.push(new THREE.Vector3(0, 0, -1));
  while (win.length < 6) { win.push(new THREE.Vector4(0, 0, 0, 0)); winN.push(new THREE.Vector3(0, 1, 0)); }
  const at = (k: Furn['kind'], dy: number) => { const f = L.furniture.find((q) => q.kind === k)!; return new THREE.Vector4(f.x, L.room.y0 + dy, f.z, 1); };
  const lamp = [at('floorlamp', 1.35), at('nightstand', 0.9), new THREE.Vector4(0, L.room.y1 - 0.3, (L.room.z0 + L.room.z1) / 2 - 1.2, 0.8), new THREE.Vector4(0, L.room.y1 - 0.3, (L.room.z0 + L.room.z1) / 2 + 1.5, 0.8)];
  lamp[0].w = 1.1;
  lamp[1].w = 0.7;
  return { win: win.slice(0, 6), winN: winN.slice(0, 6), lamp };
}

const GLSL_ROOM_LIGHT = /* glsl */ `
  uniform vec4 uWin[6];
  uniform vec3 uWinN[6];
  uniform vec4 uLamp[4];
  uniform vec4 uRoomBox; // x0 x1 z0 z1 (van-local)
  uniform vec2 uRoomY; // floor, ceiling
  // daylight through the openings + the lamps, at a van-local point
  vec3 roomLight(vec3 P, vec3 N) {
    float day = 1.0 - uNight;
    vec3 sky = mix(uAmbSky, vec3(1.0, 0.96, 0.88), 0.45) * (0.08 + 0.92 * day);
    vec3 warm = vec3(1.0, 0.74, 0.45);
    vec3 L = mix(vec3(0.42, 0.37, 0.33), sky, 0.5) * (0.2 + 0.42 * day);
    for (int i = 0; i < 6; i++) {
      vec4 W = uWin[i];
      if (W.w <= 0.0) continue;
      vec3 d = W.xyz - P;
      float dd = max(dot(d, d), 0.05);
      vec3 ld = d * inversesqrt(dd);
      float front = max(dot(-ld, uWinN[i]), 0.0);
      L += sky * W.w * max(dot(N, ld) * 0.85 + 0.15, 0.0) * front * 1.25 / (1.0 + dd * 0.45);
    }
    float on = 0.35 + 0.65 * smoothstep(0.15, 0.7, uNight);
    for (int i = 0; i < 4; i++) {
      vec4 Lp = uLamp[i];
      vec3 d = Lp.xyz - P;
      float dd = max(dot(d, d), 0.04);
      L += warm * Lp.w * on * max(dot(N, d * inversesqrt(dd)) * 0.7 + 0.3, 0.0) / (1.0 + dd * 0.55) * 0.9;
    }
    // the corners sit darker: along the floor, under the ceiling, into the walls
    float yl = P.y - uRoomY.x, top = uRoomY.y - P.y;
    float dw = min(min(P.x - uRoomBox.x, uRoomBox.y - P.x), min(P.z - uRoomBox.z, uRoomBox.w - P.z));
    float ao = mix(0.72, 1.0, smoothstep(0.0, 0.4, yl)) * mix(0.8, 1.0, smoothstep(0.0, 0.35, top)) * mix(0.82, 1.0, smoothstep(0.0, 0.3, dw));
    return L * ao;
  }
`;

/** The room's painted material: vertex colour by channel (aMat) — plaster over wainscot, planks,
 *  boards, wood grain, a fabric's weave, glowing bulbs — lit by roomLight; alpha 0.75. */
export function roomMaterial(L: VanLayout, lights: RoomLights) {
  return paintMaterial({
    uniforms: roomUniforms(L, lights),
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aMat;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying vec3 vNormalL;
      flat varying float vMat;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vLocal = position;
        vNormalL = normal;
        vColor = color;
        vMat = aMat;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      ${GLSL_ROOM_LIGHT}
      varying vec3 vColor;
      varying vec3 vLocal;
      varying vec3 vNormalL;
      flat varying float vMat;
      void main() {
        vec3 N = normalize(vNormalL);
        if (!gl_FrontFacing) N = -N;
        vec3 alb = vColor;
        float m = vMat, emis = 0.0, gloss = 0.0;
        float yl = vLocal.y - uRoomY.x;
        if (m > 9.5 && m < 10.5) {
          // a wall: tongue-and-groove wainscot to a chair rail, plaster above
          float u = abs(N.x) > 0.5 ? vLocal.z : vLocal.x;
          if (yl < 0.95) {
            float b = floor(u / 0.105);
            alb = vec3(0.725, 0.545, 0.36) * (0.9 + 0.14 * hash12(vec2(b, 7.0)));
            alb *= 1.0 - 0.3 * step(fract(u / 0.105), 0.07);
            alb *= 0.94 + 0.08 * vnoise(vec2(u * 3.0, yl * 40.0));
          } else alb *= 0.95 + 0.07 * vnoise(vec2(u, yl) * 4.0);
        } else if (m > 10.5 && m < 11.5) {
          // planks along the room
          float pl = floor(vLocal.x / 0.14);
          float joint = floor((vLocal.z + hash12(vec2(pl, 3.0)) * 2.2) / 1.6);
          alb *= 0.8 + 0.3 * hash12(vec2(pl, joint));
          alb *= 1.0 - 0.32 * step(fract(vLocal.x / 0.14), 0.05);
          alb *= 0.93 + 0.1 * vnoise(vec2(vLocal.x * 30.0, vLocal.z * 2.0));
          gloss = 0.15;
        } else if (m > 11.5 && m < 12.5) {
          alb *= 1.0 - 0.18 * step(fract(vLocal.x / 0.2), 0.04);
        } else if (m > 1.5 && m < 2.5) {
          alb *= 0.9 + 0.16 * vnoise(vec2(dot(vLocal.xz, vec2(0.7, 0.7)) * 3.0, vLocal.y * 26.0));
          gloss = 0.08;
        } else if (m > 0.5 && m < 1.5) {
          alb *= 0.92 + 0.1 * vnoise(vLocal.xz * 90.0 + vLocal.y * 90.0);
        } else if (m > 2.5 && m < 3.5) gloss = 0.4;
        else if (m > 3.5 && m < 4.5) gloss = 0.5;
        else if (m > 5.5 && m < 7.5) emis = 1.0;
        alb = pigment(alb, vWorldPos);
        vec3 col = alb * roomLight(vLocal, N);
        col += vec3(1.0, 0.78, 0.5) * emis * (1.2 + 1.4 * uNight);
        col += vec3(1.0, 0.9, 0.75) * gloss * 0.06;
        gl_FragColor = vec4(col, 0.75);
      }`,
    side: THREE.DoubleSide,
  });
}

export function roomUniforms(L: VanLayout, lights: RoomLights) {
  return {
    uWin: { value: lights.win },
    uWinN: { value: lights.winN },
    uLamp: { value: lights.lamp },
    uRoomBox: { value: new THREE.Vector4(L.room.x0, L.room.x1, L.room.z0, L.room.z1) },
    uRoomY: { value: new THREE.Vector2(L.room.y0, L.room.y1) },
  };
}

/** The map on the table: a picture (a canvas) lit like the room. */
export function mapMaterial(L: VanLayout, lights: RoomLights, tex: THREE.Texture) {
  return paintMaterial({
    uniforms: { ...roomUniforms(L, lights), tMap: { value: tex } },
    vertex: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vLocal;
      varying vec3 vNormalL;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vUv = uv;
        vLocal = position;
        vNormalL = normal;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      ${GLSL_ROOM_LIGHT}
      uniform sampler2D tMap;
      varying vec2 vUv;
      varying vec3 vLocal;
      varying vec3 vNormalL;
      void main() {
        vec3 alb = texture2D(tMap, vUv).rgb;
        alb = alb * alb; // (the canvas is sRGB: lit in linear)
        gl_FragColor = vec4(alb * roomLight(vLocal, normalize(vNormalL)), 0.75);
      }`,
  });
}

/** A hand-drawn chart for the map table: parchment, a coast with the sea washed in, roads, a
 *  compass rose, a dotted route. (The real map comes with the map table's use.) */
export function chartCanvas(seed = 3): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 320;
  const g = cv.getContext('2d');
  if (!g) return null;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#efe2c2';
  g.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,110,60,${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * 512, rnd() * 320, 2 + rnd() * 6, 2 + rnd() * 6); }
  // the sea along the right, its coast wavering
  g.beginPath();
  g.moveTo(512, 0);
  let x = 360;
  for (let y = 0; y <= 320; y += 16) { x += (rnd() - 0.5) * 22; g.lineTo(x, y); }
  g.lineTo(512, 320);
  g.closePath();
  g.fillStyle = 'rgba(80,140,170,0.55)';
  g.fill();
  g.strokeStyle = 'rgba(40,70,90,0.7)';
  g.lineWidth = 2;
  g.stroke();
  // roads
  g.strokeStyle = 'rgba(120,70,40,0.75)';
  g.lineWidth = 2.5;
  for (let k = 0; k < 6; k++) { g.beginPath(); let px = rnd() * 330, py = 0; g.moveTo(px, py); for (let t = 0; t < 8; t++) { px += (rnd() - 0.5) * 60; py += 45; g.lineTo(px, py); } g.stroke(); }
  g.lineWidth = 1.2;
  for (let k = 0; k < 9; k++) { g.beginPath(); const y = rnd() * 320; g.moveTo(0, y); g.bezierCurveTo(120, y + (rnd() - 0.5) * 80, 220, y + (rnd() - 0.5) * 80, 340, y + (rnd() - 0.5) * 60); g.stroke(); }
  // the dotted route, and a cross where you are
  g.setLineDash([5, 6]);
  g.strokeStyle = 'rgba(170,50,40,0.85)';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(330, 280); g.bezierCurveTo(300, 200, 340, 120, 320, 40); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.moveTo(322, 270); g.lineTo(338, 290); g.moveTo(338, 270); g.lineTo(322, 290); g.stroke();
  // a compass rose
  g.save(); g.translate(70, 250); g.strokeStyle = 'rgba(60,40,30,0.8)'; g.fillStyle = 'rgba(60,40,30,0.75)';
  g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.lineWidth = 1.2; g.stroke();
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -34); g.lineTo(6, 0); g.lineTo(-6, 0); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(60,40,30,0.8)'; g.font = 'italic 16px Georgia, serif'; g.fillText('N', 64, 206);
  return cv;
}

