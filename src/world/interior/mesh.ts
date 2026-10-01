// Interior geometry (docs/INTERIORS_PLAN.md §3, "Furniture and rendering"): a Float32 vertex stream in
// the interior material's layout (76 B a vertex), local-frame drawing helpers, the shell (outer
// walls, floors and ceilings with their stairwells, stairs, partitions with cased doorways and open
// door leaves), a shared cache of piece geometry with an instancer (a repeated piece is one
// InstancedMesh, tinted per instance), and the per-storey room map the shader paints rooms from.
import * as THREE from 'three';
import type * as D from '../../assets/decor';
import { toW, LocalPoly, type Plan, type Rect, type Flight } from './plan';
import type { Layout, Room } from './layout';

export type P2 = [number, number];
/** Part ids for the interior shader. (`night`: a ceiling light's glass, lit after dark only.) */
export const IP = { wall: 0, floor: 1, ceil: 2, solid: 3, glow: 4, art: 5, part: 6, fabric: 7, rug: 8, porcelain: 9, glass: 10, wood: 11, rail: 12, night: 13 } as const;
export const DM: Record<D.DecorMat, number> = { fabric: IP.fabric, wood: IP.wood, metal: IP.porcelain, porcelain: IP.porcelain, glass: IP.glass, solid: IP.solid, glow: IP.glow, lamp: IP.night };

const LIN = new Map<number, [number, number, number]>();
const tmpC = new THREE.Color();
/** A hex colour in linear RGB (cached). */
export const lin3 = (hex: number): [number, number, number] => {
  let c = LIN.get(hex);
  if (!c) { tmpC.set(hex); c = [tmpC.r, tmpC.g, tmpC.b]; if (LIN.size < 4096) LIN.set(hex, c); }
  return c;
};

/** Vertices in one draw: a big interior's mesh is several (a multiple of 3, so no triangle straddles
 *  two, and growing a stream never copies more than half of one). */
const CHUNK = 3 * 32768;
interface Streams { pos: Float32Array; nrm: Float32Array; col: Float32Array; wall: Float32Array; info: Float32Array; out: Float32Array; obj?: Float32Array; n: number }
/** (tools that count what a frame shows — cloud/home.mjs's id pass) With `__TAG_PIECES__` set on the
 *  page, each vertex of an interior's merged mesh carries the piece it belongs to in an `aObj`
 *  attribute (0: the building itself). Unset: no stream, no cost. */
const tagging = () => (globalThis as { __TAG_PIECES__?: boolean }).__TAG_PIECES__ === true;
/** Pieces that are the building's, not its furnishing (door casings and leaves, skirting, lift doors). */
export const ARCH_KEY = /^(frame:|leaf:|skirt|lift(Frame|Leaf|Button))/;

/** Vertex streams for the interior material: position, normal, colour, aWall, aInfo, aOut. */
export class Mesher {
  /** vertices so far (every chunk) */
  n = 0;
  private i0 = 0; // vertices in the sealed chunks
  private cap = 0;
  private sealed: Streams[] = [];
  pos = new Float32Array(0); nrm = new Float32Array(0); col = new Float32Array(0);
  wall = new Float32Array(0); info = new Float32Array(0); out = new Float32Array(0);
  private objS: Float32Array | null = null;
  /** The piece the next vertices belong to (0: the building), and whether the next primitive drawn
   *  starts a piece of its own (the furnishing: on while a build furnishes its rooms). */
  obj = 0;
  furn = false;
  private tagN = 0;
  private c: [number, number, number] = [1, 1, 1];
  private cs: [number, number, number] = [1, 1, 1]; // (colorLin's own: `c` may be a cached lin3 colour)
  private inf = [0, 0, IP.solid, 0];
  private o = [0, 0];
  constructor(cap = 8192) {
    let c = CHUNK;
    while (c / 2 >= cap && c > 96) c /= 2;
    if (tagging()) this.objS = new Float32Array(0);
    this.grow(c);
  }
  /** A new piece starts (while furnishing, a tagged build: see `tagging`). */
  next() { if (this.furn && this.objS) this.obj = ++this.tagN; }
  /** The next vertices are one piece of their own (`on`), or the building's. */
  piece(on: boolean) { if (this.objS) this.obj = on ? ++this.tagN : 0; }
  private grow(cap: number) {
    const used = this.n - this.i0;
    const g = (a: Float32Array, k: number) => { const b = new Float32Array(cap * k); b.set(a.subarray(0, used * k)); return b; };
    this.pos = g(this.pos, 3); this.nrm = g(this.nrm, 3); this.col = g(this.col, 3);
    this.wall = g(this.wall, 4); this.info = g(this.info, 4); this.out = g(this.out, 2);
    if (this.objS) this.objS = g(this.objS, 1);
    this.cap = cap;
  }
  private more() {
    if (this.cap < CHUNK) { this.grow(Math.min(CHUNK, this.cap * 2)); return; }
    // (a full chunk: sealed as it is, the next one starts empty — nothing is copied)
    this.sealed.push({ pos: this.pos, nrm: this.nrm, col: this.col, wall: this.wall, info: this.info, out: this.out, ...(this.objS ? { obj: this.objS } : {}), n: this.cap });
    this.i0 = this.n;
    this.pos = new Float32Array(0); this.nrm = new Float32Array(0); this.col = new Float32Array(0);
    this.wall = new Float32Array(0); this.info = new Float32Array(0); this.out = new Float32Array(0);
    if (this.objS) this.objS = new Float32Array(0);
    this.grow(CHUNK);
  }
  color(hex: number) { this.c = lin3(hex); return this; }
  colorLin(r: number, g: number, b: number) { const c = this.cs; c[0] = r; c[1] = g; c[2] = b; this.c = c; return this; }
  part(p: number) { this.inf[2] = p; return this; }
  setInfo(id: number, kind: number, fo: number) { this.inf[0] = id; this.inf[1] = kind; this.inf[3] = fo; }
  setOut(x: number, z: number) { this.o[0] = x; this.o[1] = z; }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, w?: ArrayLike<number>) {
    if (this.n - this.i0 >= this.cap) this.more();
    const i = this.n++ - this.i0;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
    this.col[i * 3] = this.c[0]; this.col[i * 3 + 1] = this.c[1]; this.col[i * 3 + 2] = this.c[2];
    if (w) { this.wall[i * 4] = w[0]; this.wall[i * 4 + 1] = w[1]; this.wall[i * 4 + 2] = w[2]; this.wall[i * 4 + 3] = w[3]; }
    else { this.wall[i * 4] = 0; this.wall[i * 4 + 1] = 0; this.wall[i * 4 + 2] = 0; this.wall[i * 4 + 3] = 0; }
    this.info[i * 4] = this.inf[0]; this.info[i * 4 + 1] = this.inf[1]; this.info[i * 4 + 2] = this.inf[2]; this.info[i * 4 + 3] = this.inf[3];
    this.out[i * 2] = this.o[0]; this.out[i * 2 + 1] = this.o[1];
    if (this.objS) this.objS[i] = this.obj;
  }
  /** A triangle facing n (the winding follows it). */
  tri(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, n: ArrayLike<number>, wa?: ArrayLike<number>, wb?: ArrayLike<number>, wc?: ArrayLike<number>) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    this.v(a[0], a[1], a[2], n[0], n[1], n[2], wa);
    if (d < 0) { this.v(c[0], c[1], c[2], n[0], n[1], n[2], wc); this.v(b[0], b[1], b[2], n[0], n[1], n[2], wb); }
    else { this.v(b[0], b[1], b[2], n[0], n[1], n[2], wb); this.v(c[0], c[1], c[2], n[0], n[1], n[2], wc); }
  }
  quad(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, d: ArrayLike<number>, n: ArrayLike<number>, w?: ArrayLike<number>[]) {
    this.tri(a, b, c, n, w?.[0], w?.[1], w?.[2]);
    this.tri(a, c, d, n, w?.[0], w?.[2], w?.[3]);
  }
  /** A planar quad from numbers (no allocation), wound to face (nx, ny, nz). */
  quadV(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, nx: number, ny: number, nz: number) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz >= 0) {
      this.v(ax, ay, az, nx, ny, nz); this.v(bx, by, bz, nx, ny, nz); this.v(cx, cy, cz, nx, ny, nz);
      this.v(ax, ay, az, nx, ny, nz); this.v(cx, cy, cz, nx, ny, nz); this.v(dx, dy, dz, nx, ny, nz);
    } else {
      this.v(ax, ay, az, nx, ny, nz); this.v(cx, cy, cz, nx, ny, nz); this.v(bx, by, bz, nx, ny, nz);
      this.v(ax, ay, az, nx, ny, nz); this.v(dx, dy, dz, nx, ny, nz); this.v(cx, cy, cz, nx, ny, nz);
    }
  }
  /** The streams as geometry: one per chunk (a piece or a small interior: just one). */
  geometries(): THREE.BufferGeometry[] {
    const cur: Streams = { pos: this.pos, nrm: this.nrm, col: this.col, wall: this.wall, info: this.info, out: this.out, ...(this.objS ? { obj: this.objS } : {}), n: this.n - this.i0 };
    return [...this.sealed, cur].filter((S) => S.n > 0 || !this.sealed.length).map((S) => {
      const g = new THREE.BufferGeometry(), n = S.n;
      g.setAttribute('position', new THREE.BufferAttribute(S.pos.subarray(0, n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(S.nrm.subarray(0, n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(S.col.subarray(0, n * 3), 3));
      g.setAttribute('aWall', new THREE.BufferAttribute(S.wall.subarray(0, n * 4), 4));
      g.setAttribute('aInfo', new THREE.BufferAttribute(S.info.subarray(0, n * 4), 4));
      g.setAttribute('aOut', new THREE.BufferAttribute(S.out.subarray(0, n * 2), 2));
      if (S.obj) g.setAttribute('aObj', new THREE.BufferAttribute(S.obj.subarray(0, n), 1));
      g.computeBoundingSphere();
      return g;
    });
  }
  /** A single geometry (a piece: never more than one chunk). */
  geometry() {
    if (this.sealed.length) throw new Error('Mesher.geometry: more than one chunk');
    return this.geometries()[0];
  }
}

/** Drawing in a plan's local (u, v) frame. */
export class Draw {
  constructor(readonly P: Plan, readonly m: Mesher) {}
  W(u: number, v: number) { return toW(this.P, u, v); }
  /** An axis-aligned box in the local frame (no bottom face unless asked). */
  box(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, hex: number, part: number = IP.solid, bottom = false) {
    this.m.next();
    if (u1 < u0) [u0, u1] = [u1, u0];
    if (v1 < v0) [v0, v1] = [v1, v0];
    const m = this.m, P = this.P;
    m.part(part).color(hex);
    const X = (u: number, v: number) => P.cx + P.ux * u + P.vx * v, Z = (u: number, v: number) => P.cz + P.uz * u + P.vz * v;
    const x0 = X(u0, v0), z0 = Z(u0, v0), x1 = X(u1, v0), z1 = Z(u1, v0), x2 = X(u1, v1), z2 = Z(u1, v1), x3 = X(u0, v1), z3 = Z(u0, v1);
    // sides (normals −v, +u, +v, −u in world), the top, maybe the bottom
    m.quadV(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, -P.vx, 0, -P.vz);
    m.quadV(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y1, z1, P.ux, 0, P.uz);
    m.quadV(x2, y0, z2, x3, y0, z3, x3, y1, z3, x2, y1, z2, P.vx, 0, P.vz);
    m.quadV(x3, y0, z3, x0, y0, z0, x0, y1, z0, x3, y1, z3, -P.ux, 0, -P.uz);
    m.quadV(x0, y1, z0, x1, y1, z1, x2, y1, z2, x3, y1, z3, 0, 1, 0);
    if (bottom) m.quadV(x0, y0, z0, x1, y0, z1, x2, y0, z2, x3, y0, z3, 0, -1, 0);
  }
  /** A partition slab along axis ax from a0 to a1, centred on c, `half` thick either side: its two
   *  faces (the top meets the ceiling), and an end cap only where asked (a free end). */
  slab(ax: 0 | 1, a0: number, a1: number, c: number, half: number, y0: number, y1: number, hex: number, part: number, capA: boolean, capB: boolean) {
    this.m.next();
    const m = this.m, P = this.P;
    m.part(part).color(hex);
    const X = (a: number, cc: number) => (ax === 0 ? P.cx + P.ux * a + P.vx * cc : P.cx + P.ux * cc + P.vx * a);
    const Z = (a: number, cc: number) => (ax === 0 ? P.cz + P.uz * a + P.vz * cc : P.cz + P.uz * cc + P.vz * a);
    // the across direction in world (+c) and along (+a)
    const cx = ax === 0 ? P.vx : P.ux, cz = ax === 0 ? P.vz : P.uz, ex = ax === 0 ? P.ux : P.vx, ez = ax === 0 ? P.uz : P.vz;
    for (const sg of [-1, 1]) {
      const cc = c + sg * half;
      const x0 = X(a0, cc), z0 = Z(a0, cc), x1 = X(a1, cc), z1 = Z(a1, cc);
      m.quadV(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, cx * sg, 0, cz * sg);
    }
    for (const [cap, a, sg] of [[capA, a0, -1], [capB, a1, 1]] as const) {
      if (!cap) continue;
      const x0 = X(a, c - half), z0 = Z(a, c - half), x1 = X(a, c + half), z1 = Z(a, c + half);
      m.quadV(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, ex * sg, 0, ez * sg);
    }
  }
  /** A box along an axis: `ax` 0 = along u. (a: along, c: across) */
  boxA(ax: 0 | 1, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number, hex: number, part: number = IP.solid, bottom = false) {
    if (ax === 0) this.box(a0, a1, c0, c1, y0, y1, hex, part, bottom); else this.box(c0, c1, a0, a1, y0, y1, hex, part, bottom);
  }
  /** A flat quad lying in the local frame with (s,t) texture coords in aWall (rugs). */
  flatQuad(u0: number, u1: number, v0: number, v1: number, y: number, hex: number, part: number, style: number) {
    this.m.next();
    this.m.part(part).color(hex);
    const c = [this.W(u0, v0), this.W(u1, v0), this.W(u1, v1), this.W(u0, v1)];
    const L = u1 - u0, Wd = v1 - v0;
    this.m.quad([c[0][0], y, c[0][1]], [c[1][0], y, c[1][1]], [c[2][0], y, c[2][1]], [c[3][0], y, c[3][1]], [0, 1, 0], [[0, 0, style, L], [1, 0, style, L], [1, 1, style, Wd], [0, 1, style, Wd]]);
  }
  /** A vertical panel from (ua, va) to (ub, vb), y0..y1 at a and yb0..yb1 at b, two-sided (both faces). */
  panel(ua: number, va: number, ub: number, vb: number, y0: number, y1: number, hex: number, part: number, yb0 = y0, yb1 = y1, twoSided = true) {
    this.m.next();
    const a = this.W(ua, va), b = this.W(ub, vb);
    const nx = b[1] - a[1], nz = -(b[0] - a[0]), l = Math.hypot(nx, nz) || 1;
    this.m.part(part).color(hex);
    this.m.quad([a[0], y0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], y1, a[1]], [nx / l, 0, nz / l]);
    if (twoSided) this.m.quad([a[0], y0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], y1, a[1]], [-nx / l, 0, -nz / l]);
  }
  /** A railing panel (balusters via the shader) between two local points, rising from y to yb. */
  rail(ua: number, va: number, ub: number, vb: number, y: number, h: number, yb = y) {
    this.m.next();
    const a = this.W(ua, va), b = this.W(ub, vb);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.05) return;
    const nx = b[1] - a[1], nz = -(b[0] - a[0]);
    this.m.part(IP.rail).color(0xf4f1ea);
    const w = (u: number, v: number) => [u, v, L, h];
    this.m.quad([a[0], y, a[1]], [b[0], yb, b[1]], [b[0], yb + h, b[1]], [a[0], y + h, a[1]], [nx / L, 0, nz / L], [w(0, 0), w(L, 0), w(L, h), w(0, h)]);
  }
}

// ---------------- piece geometry: a shared LRU, and the instancer ----------------
const CACHE = new Map<string, THREE.BufferGeometry>();
const CACHE_MAX = 64;
// (counted: a tower's next build window takes the same pieces before the standing one lets go)
const inUse = new Map<string, number>();
/** Piece geometry in the interior layout (white parts take the instance tint), cached by key. */
export function pieceGeo(key: string, make: () => D.DecorPart[]): THREE.BufferGeometry {
  let g = CACHE.get(key);
  if (g) { CACHE.delete(key); CACHE.set(key, g); return g; }
  const m = new Mesher(1024);
  for (const p of make()) {
    m.part(DM[p.mat]).color(p.hex);
    const pos = p.g.getAttribute('position'), nrm = p.g.getAttribute('normal');
    const idx = p.g.index;
    const cnt = idx ? idx.count : pos.count;
    for (let i = 0; i < cnt; i++) {
      const k = idx ? idx.getX(i) : i;
      m.v(pos.getX(k), pos.getY(k), pos.getZ(k), nrm.getX(k), nrm.getY(k), nrm.getZ(k));
    }
  }
  g = m.geometry();
  g.userData.shared = true;
  CACHE.set(key, g);
  if (CACHE.size > CACHE_MAX) {
    for (const [k, old] of CACHE) {
      if (CACHE.size <= CACHE_MAX) break;
      if (inUse.has(k)) continue;
      CACHE.delete(k);
      old.dispose();
    }
  }
  return g;
}

interface Rec { key: string; geo: THREE.BufferGeometry; m: number[]; c: number[] }
/** Pieces that move once they're built (a lift's door leaves: a ride slides them open): always an
 *  InstancedMesh of their own, never baked into the merged mesh, so their instances can be moved. */
export const MOVING = new Set(['liftLeaf']);
/** Repeated pieces: one InstancedMesh per key (≥ 2 of them), a single one baked into the main mesh. */
export class Instancer {
  private recs = new Map<string, Rec>();
  constructor(readonly P: Plan) {}
  /** Put piece `key` at local (uc, vc), height y, its x axis along ax (its back, +z, turns with it),
   *  stretched `sx` times along x (a skirting board's metre to its wall's length). Returns its index
   *  among the pieces of that key (its instance, once instanced). */
  put(key: string, make: () => D.DecorPart[], uc: number, vc: number, y: number, ax: P2, tint = 0xffffff, sx = 1): number {
    let r = this.recs.get(key);
    if (!r) { r = { key, geo: pieceGeo(key, make), m: [], c: [] }; this.recs.set(key, r); inUse.set(key, (inUse.get(key) ?? 0) + 1); }
    const P = this.P;
    const [px, pz] = toW(P, uc, vc);
    // piece x → ax, piece z → (−ax.v, ax.u): a proper rotation about y
    const axw = [P.ux * ax[0] + P.vx * ax[1], P.uz * ax[0] + P.vz * ax[1]];
    const azw = [P.ux * -ax[1] + P.vx * ax[0], P.uz * -ax[1] + P.vz * ax[0]];
    r.m.push(axw[0] * sx, 0, axw[1] * sx, 0, 0, 1, 0, 0, azw[0], 0, azw[1], 0, px, y, pz, 1);
    const t = lin3(tint);
    r.c.push(t[0], t[1], t[2]);
    return r.m.length / 16 - 1;
  }
  /** Every piece put so far between heights y0 and y1: key, position (m, to the cm) and tint. */
  placements(y0 = -Infinity, y1 = Infinity): string[] {
    const out: string[] = [];
    const c = (x: number) => Math.round(x * 100);
    for (const r of this.recs.values())
      for (let i = 0; i < r.m.length; i += 16) {
        const y = r.m[i + 13];
        if (y >= y0 && y < y1) out.push(`${r.key} ${c(r.m[i + 12])} ${c(y)} ${c(r.m[i + 14])} ${c(r.m[i])} ${c(r.m[i + 2])} ${r.c.slice((i / 16) * 3, (i / 16) * 3 + 3).map((x) => x.toFixed(3)).join(',')}`);
      }
    return out.sort();
  }
  /** Vertices the pieces so far add (each piece once: an instanced one's are shared). */
  uniqueVerts() {
    let n = 0;
    for (const r of this.recs.values()) n += r.geo.getAttribute('position').count;
    return n;
  }
  /** Build the instanced meshes (a step at a time); singles (and the rarest keys past `maxDraws`)
   *  are baked into `main`. (y0, y1: the storeys built — a tower's window — else the building.) */
  *finishGen(main: Mesher, mat: THREE.Material, maxDraws: number, y0 = this.P.floor0, y1 = this.P.ceilTop): Generator<void, { meshes: THREE.InstancedMesh[]; verts: number }, void> {
    const recs = [...this.recs.values()].sort((a, b) => Number(MOVING.has(b.key)) - Number(MOVING.has(a.key)) || b.m.length - a.m.length);
    const meshes: THREE.InstancedMesh[] = [];
    let verts = 0, baked = 0, placed = 0;
    const m4 = new THREE.Matrix4();
    // (every piece is inside the storeys built: their bounding sphere does for each instanced mesh)
    const P = this.P, hh = (y1 - y0) / 2;
    const sphere = new THREE.Sphere(new THREE.Vector3(P.cx, y0 + hh, P.cz), Math.hypot(P.L / 2, P.W / 2, hh) + 1);
    for (const r of recs) {
      const n = r.m.length / 16;
      if (MOVING.has(r.key) || (n >= 2 && meshes.length < maxDraws)) {
        const im = new THREE.InstancedMesh(r.geo, mat, n);
        im.instanceMatrix.array.set(r.m);
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(r.c), 3);
        im.boundingSphere = sphere.clone();
        im.name = `interior:${r.key}`;
        meshes.push(im);
        verts += r.geo.getAttribute('position').count;
        if ((placed += n) > 3000) { placed = 0; yield; }
      } else for (let i = 0; i < n; i++) {
        main.piece(!ARCH_KEY.test(r.key)); // (a tagged build: each baked piece its own — the building's own as the building)
        bake(main, r.geo, m4.fromArray(r.m, i * 16), r.c[i * 3], r.c[i * 3 + 1], r.c[i * 3 + 2]);
        if ((baked += r.geo.getAttribute('position').count) > 12000) { baked = 0; yield; }
      }
    }
    return { meshes, verts };
  }
  /** Let the cache evict this interior's pieces again. */
  release() {
    for (const k of this.recs.keys()) {
      const n = (inUse.get(k) ?? 1) - 1;
      if (n > 0) inUse.set(k, n); else inUse.delete(k);
    }
    this.recs.clear();
  }
}
/** Copy a piece geometry into a mesher under matrix m4, tinting its white (and white-shaded grey) vertices. */
function bake(out: Mesher, g: THREE.BufferGeometry, m4: THREE.Matrix4, tr: number, tg: number, tb: number) {
  const pos = g.getAttribute('position').array as Float32Array, nrm = g.getAttribute('normal').array as Float32Array;
  const col = g.getAttribute('color').array as Float32Array, info = g.getAttribute('aInfo').array as Float32Array;
  const e = m4.elements;
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    const r = col[i * 3], gg = col[i * 3 + 1], b = col[i * 3 + 2];
    const tint = gg >= 0.25 && Math.abs(r - gg) + Math.abs(gg - b) <= 0.002; // (as the shader's instance tint)
    out.colorLin(tint ? r * tr : r, tint ? gg * tg : gg, tint ? b * tb : b).part(info[i * 4 + 2]);
    out.v(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], e[0] * nx + e[8] * nz, ny, e[2] * nx + e[10] * nz);
  }
}

// ---------------- the room map: which room each floor, wall and ceiling point is in ----------------
const WALL_PAINT = [0xefe6d2, 0xdfe8e4, 0xe9dccb, 0xd6e1ea, 0xf2ead9, 0xe6d5d2, 0xdde3cf, 0xf4f0e6, 0xcfe0dc, 0xe8dcc0, 0xd9d2e4];
export const WOOD = [0x8a6242, 0xa07a52, 0x6f4b33, 0xb89468, 0x9c7a5a];
const CARPET = [0xb9ae9a, 0x9aa3a0, 0xa89080, 0x8d9aa8, 0xc4b8a2];
/** Paint (wall colour + style) and floor (colour + finish) for a room type. Styles: 0 plain, 1
 *  wainscot, 2 stripes, 3 dots, 4 tile, 5 wood panelling; floors: 0 boards, 1 tile, 2 carpet, 3
 *  big tiles / lino. */
export function paintFor(type: Room['type'], rnd: () => number): { wall: number; style: number; floor: number; ft: number } {
  const wet = type === 'bath' || type === 'wc' || type === 'kitchen' || type === 'galley' || type === 'utility';
  const trade = type === 'shop' || type === 'cafe' || type === 'church' || type === 'bar' || type === 'diner' || type === 'library' || type === 'bank' || type === 'narthex';
  const plainT = type === 'corridor' || type === 'stair' || type === 'lobby' || type === 'open' || type === 'meeting' || type === 'lift' || type === 'store' || type === 'stock'
    || type === 'classroom' || type === 'assembly' || type === 'staff' || type === 'post' || type === 'gym' || type === 'prayer';
  const wall = WALL_PAINT[Math.floor(rnd() * WALL_PAINT.length)];
  const style = wet ? 4 : trade ? 5 : plainT ? (type === 'lobby' && rnd() < 0.5 ? 5 : 0) : [0, 1, 1, 2, 3][Math.floor(rnd() * 5)];
  // (a guest room's, a library's and a prayer hall's carpet; a classroom's lino, a school hall's
  // boards; a gym's dark rubber)
  const ft = wet ? 1 : type === 'shop' || type === 'lobby' || type === 'open' || type === 'stock' || type === 'store' || type === 'lift' || type === 'stair' || type === 'classroom' || type === 'staff' || type === 'post' || type === 'bank' || type === 'narthex' || type === 'gym' ? 3
    : type === 'corridor' || type === 'meeting' ? (rnd() < 0.6 ? 2 : 3) : (type === 'bed' && rnd() < 0.35) || type === 'guest' || type === 'library' || type === 'prayer' ? 2 : 0;
  const floor = type === 'gym' ? 0x5d6266 : type === 'prayer' ? [0x8c2f2a, 0x2f5a46, 0x6a2a3a][Math.floor(rnd() * 3)]
    : ft === 1 ? [0xe8e4da, 0xd9e2e4, 0xefe9dc][Math.floor(rnd() * 3)] : ft === 2 ? CARPET[Math.floor(rnd() * CARPET.length)] : ft === 3 ? [0xcfc8b8, 0xc2c6c4, 0xd8d0c0][Math.floor(rnd() * 3)] : WOOD[Math.floor(rnd() * WOOD.length)];
  return { wall, style, floor, ft };
}

export interface RoomMap { map: THREE.DataTexture; pal: THREE.DataTexture; info: THREE.Vector4; dim: THREE.Vector4; texels: number }
/** Rasterize the layout's rooms per storey into a texture (a palette index per 0.1 m cell), and
 *  the palette (wall rgb + style, floor rgb + finish). Rooms of one space share their paint. Storeys
 *  k0 … k1 (a tower's build window: dim.z says which storey its first row is). `rnd(level)` draws
 *  the paint of a space first met on that storey (a tall building's: a stream per storey, so a
 *  storey is painted alike whichever window builds it). An atrium's void takes the paint of the
 *  lobby it rises from. */
export function* roomMapGen(P: Plan, L: Layout, rnd: (level: number) => number, k0 = 0, k1 = P.levels - 1): Generator<void, RoomMap, void> {
  let s = 0.1;
  const levels = Math.max(1, k1 - k0 + 1);
  // (at most ~0.6M cells: a vast plate gets coarser ones — while half a cell stays under the 0.18 m
  // a wall face's lookup reaches past the wall's line into its room, a face never reads its neighbour)
  while ((P.L / s) * (P.W / s) * levels > 6e5 || P.L / s > 2048 || (P.W / s) * levels > 4096) s *= 1.25;
  const nu = Math.max(1, Math.ceil(P.L / s)), nv = Math.max(1, Math.ceil(P.W / s));
  const data = new Uint8Array(nu * nv * levels);
  const pal = new Float32Array(256 * 2 * 4);
  const idx = new Map<number, number>();
  let next = 1, filled = 0;
  // (the lobby an atrium's void rises from: the void's walls are the lobby's, a storey up)
  const lobby = L.rooms.find((r) => r.type === 'lobby' && r.level === 0);
  for (const r of L.rooms) {
    let pi = r.type === 'void' && lobby ? idx.get(lobby.space) : idx.get(r.space);
    if (pi === undefined) {
      pi = ((next++ - 1) % 255) + 1;
      idx.set(r.space, pi);
      const p = paintFor(r.type, () => rnd(r.level));
      const w = lin3(p.wall), f = lin3(p.floor);
      pal.set([w[0], w[1], w[2], p.style], pi * 4);
      pal.set([f[0], f[1], f[2], p.ft], (256 + pi) * 4);
    }
    const u0 = -P.L / 2, v0 = -P.W / 2;
    const i0 = Math.max(0, Math.ceil((r.r.u0 - u0) / s - 0.5)), i1 = Math.min(nu - 1, Math.floor((r.r.u1 - u0) / s - 0.5));
    const j0 = Math.max(0, Math.ceil((r.r.v0 - v0) / s - 0.5)), j1 = Math.min(nv - 1, Math.floor((r.r.v1 - v0) / s - 0.5));
    if (r.level < k0 || r.level > k1) continue;
    const base = (r.level - k0) * nv;
    for (let j = j0; j <= j1; j++) data.fill(pi, (base + j) * nu + i0, (base + j) * nu + i1 + 1);
    if ((filled += Math.max(0, (i1 - i0 + 1) * (j1 - j0 + 1))) > 2e5) { filled = 0; yield; }
  }
  // cells the rooms don't cover (slivers of an outline): the nearest room along the row, then the column
  let bare = false;
  for (let i = 0; i < data.length && !bare; i += 7) if (!data[i]) bare = true;
  for (let k = 0; k < levels && bare; k++) {
    yield;
    for (let j = 0; j < nv; j++) {
      const row = (k * nv + j) * nu;
      let last = 0;
      for (let i = 0; i < nu; i++) { const x = data[row + i]; if (x) last = x; else if (last) data[row + i] = last; }
      last = 0;
      for (let i = nu - 1; i >= 0; i--) { const x = data[row + i]; if (x) last = x; else if (last) data[row + i] = last; }
    }
    for (let i = 0; i < nu; i++) {
      let last = 0;
      for (let j = 0; j < nv; j++) { const q = (k * nv + j) * nu + i; if (data[q]) last = data[q]; else if (last) data[q] = last; }
      last = 0;
      for (let j = nv - 1; j >= 0; j--) { const q = (k * nv + j) * nu + i; if (data[q]) last = data[q]; else if (last) data[q] = last; }
    }
  }
  const map = new THREE.DataTexture(data, nu, nv * levels, THREE.RedFormat, THREE.UnsignedByteType);
  map.minFilter = map.magFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  const palT = new THREE.DataTexture(pal, 256, 2, THREE.RGBAFormat, THREE.FloatType);
  palT.minFilter = palT.magFilter = THREE.NearestFilter;
  palT.generateMipmaps = false;
  palT.needsUpdate = true;
  return { map, pal: palT, info: new THREE.Vector4(-P.L / 2, -P.W / 2, 1 / s, nv), dim: new THREE.Vector4(nu, levels, k0, 0), texels: nu * nv * levels };
}

// ---------------- stairs ----------------
/** Treads, risers, closed strings, a handrail and balusters on an open side; for a dogleg, its
 *  landing slab and the spine wall between the flights; railings round the stairwells upstairs. */
export function drawStairs(d: Draw, P: Plan, treadC: number, runner: number | null, k0 = 0, k1 = P.levels - 1) {
  const f = (k: number) => P.floor0 + k * P.floorH;
  const fH = P.floorH;
  // (a tower's: the storeys built — its flights up from each, its landings)
  const out: Flight[] = P.flights.filter((F) => F.level >= k0 && F.level <= k1);
  for (const F of out) {
    const ax: 0 | 1 = F.axis ? 1 : 0;
    const c0 = ax ? F.u0 : F.v0, c1 = ax ? F.u1 : F.v1;
    const lo = F.lo ?? 0, hi = F.hi ?? 1;
    const y = f(F.level) + lo * fH, rise = ((hi - lo) * fH) / Math.max(1, F.steps ?? 15);
    const n = Math.max(1, F.steps ?? Math.round(((hi - lo) * fH) / 0.19));
    const dir = Math.sign(F.topU - F.bottomU) || 1, run = Math.abs(F.topU - F.bottomU);
    const tr = run / Math.max(1, n - 1);
    // n risers, n − 1 treads; the last riser meets the floor (or landing) at the top
    for (let i = 0; i < n; i++) {
      const a = F.bottomU + dir * i * tr;
      if (i < n - 1) d.boxA(ax, a - dir * 0.03, a + dir * tr, c0, c1, y + (i + 1) * rise - 0.045, y + (i + 1) * rise, treadC, IP.wood);
      d.boxA(ax, a, a + dir * 0.025, c0 + 0.01, c1 - 0.01, y + i * rise, y + (i + 1) * rise - 0.045, 0xf2eee6);
      if (runner !== null && i < n - 1) { const cm = (c0 + c1) / 2; d.boxA(ax, a - dir * 0.03, a + dir * tr, cm - 0.33, cm + 0.33, y + (i + 1) * rise, y + (i + 1) * rise + 0.012, runner, IP.fabric); }
    }
    // closed strings down to the floor (the cupboard under the stairs)
    const yTop = y + (n - 1) * rise;
    for (const c of [c0, c1]) {
      const [ua, va] = ax ? [c, F.bottomU] : [F.bottomU, c], [ub, vb] = ax ? [c, F.topU] : [F.topU, c];
      d.panel(ua, va, ub, vb, f(F.level) + lo * fH, y + rise - 0.05, 0xefebe2, IP.solid, f(F.level) + lo * fH, yTop - 0.02);
    }
    if (F.open) {
      // balusters + a handrail on the open side, newels at both ends
      const ov = (F.open > 0 ? c1 : c0) + (F.open > 0 ? -0.04 : 0.04);
      for (let i = 0; i < n - 1; i++) {
        const a = F.bottomU + dir * (i + 0.5) * tr, yt = y + (i + 1) * rise;
        d.boxA(ax, a - 0.018, a + 0.018, ov - 0.018, ov + 0.018, yt, yt + 0.86, 0xf4f1ea);
      }
      d.boxA(ax, F.bottomU - 0.05, F.bottomU + 0.05, ov - 0.05, ov + 0.05, y, y + 1.05, treadC, IP.wood);
      d.boxA(ax, F.topU - 0.05, F.topU + 0.05, ov - 0.05, ov + 0.05, yTop - 0.1, yTop + rise + 1.0, treadC, IP.wood);
      const [ua, va] = ax ? [ov, F.bottomU] : [F.bottomU, ov], [ub, vb] = ax ? [ov, F.topU] : [F.topU, ov];
      d.panel(ua, va, ub, vb, y + rise + 0.84, y + rise + 0.93, treadC, IP.wood, yTop + rise + 0.84, yTop + rise + 0.93);
      // upstairs: a railing along the stairwell's open side and across its bottom end
      if (hi > 0.99) {
        const yu = f(F.level + 1);
        const [pa, pb] = ax ? [[ov, F.topU], [ov, F.bottomU]] : [[F.topU, ov], [F.bottomU, ov]];
        d.rail(pa[0], pa[1], pb[0], pb[1], yu, 0.92);
        const [qa, qb] = ax ? [[c0, F.bottomU], [c1, F.bottomU]] : [[F.bottomU, c0], [F.bottomU, c1]];
        d.rail(qa[0], qa[1], qb[0], qb[1], yu, 0.92);
      }
    }
  }
  // dogleg landings, the spine wall between their flights, a rail across the top storey's opening
  for (const Lg of P.landings) {
    if (Lg.level < k0 || Lg.level > k1) continue;
    const y = f(Lg.level) + Lg.y * fH;
    d.box(Lg.u0, Lg.u1, Lg.v0, Lg.v1, y - 0.2, y, treadC, IP.wood, true);
    const fl = P.flights.filter((F) => F.level === Lg.level && (F.lo ?? 0) < 0.01 && (F.hi ?? 1) < 0.99 && hitR(F, grow(Lg, 0.05)));
    for (const F of fl) {
      const ax: 0 | 1 = F.axis ? 1 : 0;
      const b = P.flights.find((G) => G !== F && G.level === F.level && (G.lo ?? 0) > 0.01 && hitR(G, grow(Lg, 0.05)));
      if (!b) continue;
      const cmid = ax ? ((F.u0 + F.u1) / 2 + (b.u0 + b.u1) / 2) / 2 : ((F.v0 + F.v1) / 2 + (b.v0 + b.v1) / 2) / 2;
      d.boxA(ax, Math.min(F.bottomU, F.topU), Math.max(F.bottomU, F.topU), cmid - 0.05, cmid + 0.05, f(F.level), f(F.level + 1) + 0.9, 0xf2eee6, IP.part);
      // on the top storey, lane a's opening gets a rail
      if (F.level + 2 === P.levels) {
        const c0 = ax ? F.u0 : F.v0, c1 = ax ? F.u1 : F.v1;
        const [qa, qb] = ax ? [[c0, F.bottomU], [c1, F.bottomU]] : [[F.bottomU, c0], [F.bottomU, c1]];
        d.rail(qa[0], qa[1], qb[0], qb[1], f(F.level + 1), 0.92);
      }
    }
  }
}
const hitR = (a: Rect, b: Rect) => a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
const grow = (r: Rect, m: number): Rect => ({ u0: r.u0 - m, u1: r.u1 + m, v0: r.v0 - m, v1: r.v1 + m });

// ---------------- partitions and doorways ----------------
export const DOOR_H = 2.1;
/** Where a doorway's leaf stands open: into the room it serves (not the hall or corridor it opens
 *  from), hinged at the jamb nearer that room's corner. */
export interface LeafSpot { level: number; ax: 0 | 1; c: number; hinge: number; side: -1 | 1; w: number }
export function* drawPartitionsGen(d: Draw, P: Plan, L: Layout, ceil: (k: number) => number, wallHex = 0xffffff): Generator<void, { leaves: LeafSpot[] }, void> {
  const f = (k: number) => P.floor0 + k * P.floorH;
  const M = P.main;
  const leaves: LeafSpot[] = [];
  const circ = new Set(['hall', 'landing', 'corridor', 'lobby', 'open', 'shop', 'cafe', 'bar', 'diner', 'stair', 'narthex', 'library', 'bank', 'post', 'gym', 'assembly', 'prayer']);
  const LP = new LocalPoly(P.loc);
  // (the walls by storey, axis and line, to a decimetre)
  const lines = new Map<number, Layout['walls']>();
  const lineKey = (k: number, ax: number, c: number) => (k * 2 + ax) * 1e6 + Math.round(c * 10) + 5e5;
  for (const w of L.walls) {
    const key = lineKey(w.level, w.ax, w.c), l = lines.get(key);
    if (l) l.push(w); else lines.set(key, [w]);
  }
  // a wall end is free (it shows its end) unless it meets the facade or another wall there
  const free = (w: Layout['walls'][number], at: number, dir: -1 | 1) => {
    const [u, v] = w.ax === 0 ? [at + dir * 0.2, w.c] : [w.c, at + dir * 0.2];
    if (!LP.inside(u, v)) return false;
    for (let dk = -1; dk <= 1; dk++) {
      for (const o of lines.get(lineKey(w.level, 1 - w.ax, at) + dk) ?? []) if (Math.abs(o.c - at) < 0.08 && w.c > o.a - 0.08 && w.c < o.b + 0.08) return false;
      for (const o of lines.get(lineKey(w.level, w.ax, w.c) + dk) ?? []) if (o !== w && Math.abs(o.c - w.c) < 0.02 && (Math.abs(o.a - at) < 0.02 || Math.abs(o.b - at) < 0.02)) return false;
    }
    return true;
  };
  let nw = 0;
  for (const w of L.walls) {
    if (++nw % 150 === 0) yield;
    const y0 = f(w.level), y1 = ceil(w.level);
    // (ends on the facade tuck into the outer wall's thickness; a doorway's jambs are under its casing)
    const lo = w.ax === 0 ? M.u0 : M.v0, hi = w.ax === 0 ? M.u1 : M.v1;
    const a = Math.abs(w.a - lo) < 0.02 ? w.a + 0.03 : w.a, b = Math.abs(w.b - hi) < 0.02 ? w.b - 0.03 : w.b;
    const capA = free(w, w.a, -1), capB = free(w, w.b, 1);
    let s = a, first = true;
    for (const [g0, g1] of w.gaps) {
      if (g0 > s + 0.005) d.slab(w.ax, s, Math.min(g0, b), w.c, 0.06, y0, y1, wallHex, IP.part, first && capA, false);
      d.slab(w.ax, g0, g1, w.c, 0.06, y0 + DOOR_H, y1, wallHex, IP.part, false, false); // the lintel
      s = Math.max(s, g1);
      first = false;
    }
    if (b > s + 0.005) d.slab(w.ax, s, b, w.c, 0.06, y0, y1, wallHex, IP.part, first && capA, capB);
  }
  for (const dw of L.doors) {
    if (dw.w > 1.15) continue; // a wide opening: cased, no leaf
    const [ra, rb] = dw.rooms.map((i) => L.rooms[i]);
    // the leaf swings into the room that isn't circulation (a flat's own door: into the flat)
    const into = circ.has(ra.type) && !circ.has(rb.type) ? rb : circ.has(rb.type) && !circ.has(ra.type) ? ra : (ra.r.u1 - ra.r.u0) * (ra.r.v1 - ra.r.v0) < (rb.r.u1 - rb.r.u0) * (rb.r.v1 - rb.r.v0) ? ra : rb;
    const side: -1 | 1 = (dw.ax === 0 ? (into.r.v0 + into.r.v1) / 2 : (into.r.u0 + into.r.u1) / 2) > dw.c ? 1 : -1;
    // hinge on the jamb nearer the room's own corner, so the leaf lies back along its wall
    const rm = dw.ax === 0 ? (into.r.u0 + into.r.u1) / 2 : (into.r.v0 + into.r.v1) / 2;
    const hinge = dw.t > rm ? dw.t + dw.w / 2 : dw.t - dw.w / 2;
    leaves.push({ level: dw.level, ax: dw.ax, c: dw.c, hinge, side, w: dw.w });
  }
  return { leaves };
}
