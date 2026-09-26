// Building meshes from baked footprints. Walls follow the true footprint; pitched roofs are built on that
// same outline with a straight skeleton (hips, valleys, cross-gables), with overhangs, soffits, fascia and
// chimneys. Raised shore houses stand on pilings with a railed stair; some houses get a front porch.
// Windows, siding, shutters, trim and night glow are procedural in the shader from per-vertex wall UVs.
import * as THREE from 'three';
import earcut from 'earcut';
import { detailBox, type World, type Building } from './data';
import type { Deck } from '../player/collision';
import { paintMaterial, lin } from '../render/shared';
import { hash01 } from '../core/rng';
import { buildRoof, tidyRing, ringArea, offsetRing, type RoofGeom } from './roof';
import { recipeFor, SIDING, ROOFMAT, type Recipe } from './recipe';
import { activeStyle } from './styles';

type P2 = [number, number];
export interface Footprint {
  ring: P2[]; // true outline, CCW (math sense)
  base: number; // ground under the building
  top: number; // wall top (eave), absolute
  floor0: number; // ground-floor level, absolute
  raise: number; // height of the pilings (0 = on a foundation)
  name?: string;
  addr?: string;
  kind: string;
  eave: number; // eave - base (wall-UV space)
  seed: number;
  id: number; // unique per building (exact in float) — shaders key the visited building on it
  key?: string; // tile-streaming registry key ("tile:idx")
  door?: number;
  pitched?: boolean;
}

export const KIND = { house: 0, shed: 1, commercial: 2, large: 3, church: 4, lighthouse: 5 } as const;
export const PART = { wall: 0, roof: 1, trim: 2, glass: 3, lattice: 4, rail: 5 } as const;
export const floorHeight = (kind: string) => (kind === 'commercial' ? 3.8 : kind === 'large' ? 3.1 : 2.9);

// Facade/roof palettes live in styles.ts (per region); recipe.ts picks per building.
const DOOR_COLORS = [0x9b2f2a, 0x2c3e5c, 0xf2efe6, 0x3e5b45, 0x7a5236, 0x1f2a2e, 0x5c7f95, 0xd9b34a];
const TRIM = 0xf3f0e8;

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  wall: number[] = [];
  info: number[] = [];
  tan: number[] = [];
  private c = [1, 1, 1];
  private inf = [0, 0, 0, 0];
  private t = [0, 0];
  setColor(c: THREE.Color) { this.c = [c.r, c.g, c.b]; }
  setInfo(id: number, kind: number, part: number, fo: number) { this.inf = [id, kind, part, fo]; }
  part(p: number) { this.inf = [this.inf[0], this.inf[1], p, this.inf[3]]; }
  // Wall tangent (direction of increasing wall-u) for interior mapping.
  setTan(x: number, z: number) { this.t = [x, z]; }
  private v(p: THREE.Vector3, n: THREE.Vector3, w: number[]) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(this.c[0], this.c[1], this.c[2]);
    this.wall.push(w[0], w[1], w[2], w[3]);
    this.info.push(this.inf[0], this.inf[1], this.inf[2], this.inf[3]);
    this.tan.push(this.t[0], this.t[1]);
  }
  // Triangle with explicit desired facing n; flips winding if needed.
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, wa = Z4, wb = Z4, wc = Z4) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const d = (uy * vz - uz * vy) * n.x + (uz * vx - ux * vz) * n.y + (ux * vy - uy * vx) * n.z;
    if (d < 0) { this.v(a, n, wa); this.v(c, n, wc); this.v(b, n, wb); }
    else { this.v(a, n, wa); this.v(b, n, wb); this.v(c, n, wc); }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, wa = Z4, wb = Z4, wc = Z4, wd = Z4) {
    this.tri(a, b, c, n, wa, wb, wc);
    this.tri(a, c, d, n, wa, wc, wd);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWall', new THREE.Float32BufferAttribute(this.wall, 4));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(this.tan, 2));
    g.computeBoundingSphere();
    return g;
  }
}
const Z4 = [0, 0, 0, 0];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);

// Walls around a ring from y0 to top (a height or a function of position). Wall UV: u along the wall,
// v = y - base, plus (length, eave) so the shader can lay out windows per storey.
function walls(b: Builder, ring: P2[], base: number, y0: number, top: number | ((x: number, z: number) => number), eave: number) {
  const s = ringArea(ring) > 0 ? 1 : -1;
  const T = typeof top === 'number' ? () => top : top;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const n = V((dz / len) * s, 0, (-dx / len) * s);
    const tp = T(p[0], p[1]), tq = T(q[0], q[1]);
    b.setTan(dx / len, dz / len);
    b.quad(V(p[0], y0, p[1]), V(q[0], y0, q[1]), V(q[0], tq, q[1]), V(p[0], tp, p[1]), n, [0, y0 - base, len, eave], [len, y0 - base, len, eave], [len, tq - base, len, eave], [0, tp - base, len, eave]);
  }
  b.setTan(0, 0);
}

function flatCap(b: Builder, ring: P2[], y: number | ((x: number, z: number) => number), n = UP) {
  const flat: number[] = [];
  for (const p of ring) flat.push(p[0], p[1]);
  const idx = earcut(flat);
  const Y = typeof y === 'number' ? () => y : y;
  for (let i = 0; i < idx.length; i += 3) {
    const a = ring[idx[i]], c = ring[idx[i + 1]], d = ring[idx[i + 2]];
    b.tri(V(a[0], Y(a[0], a[1]), a[1]), V(c[0], Y(c[0], c[1]), c[1]), V(d[0], Y(d[0], d[1]), d[1]), n);
  }
}

function box(b: Builder, cx: number, cz: number, ang: number, l: number, w: number, y0: number, y1: number, bottom = false) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const r: P2[] = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]);
  walls(b, r, y0, y0, y1, y1 - y0);
  flatCap(b, r, y1);
  if (bottom) flatCap(b, r, y0, DOWN);
  return r;
}

// A square-section beam between two 3D points (stringers, rails, rafters).
function beam(b: Builder, a: THREE.Vector3, c: THREE.Vector3, w: number, h: number) {
  const d = c.clone().sub(a);
  const hl = Math.hypot(d.x, d.z) || 1;
  const px = (-d.z / hl) * (w / 2), pz = (d.x / hl) * (w / 2);
  const P = (o: THREE.Vector3, sx: number, sy: number) => V(o.x + px * sx, o.y + sy * (h / 2), o.z + pz * sx);
  const side = V(px, 0, pz).normalize();
  const top = new THREE.Vector3().crossVectors(d, side).normalize();
  if (top.y < 0) top.negate();
  b.quad(P(a, -1, 1), P(c, -1, 1), P(c, 1, 1), P(a, 1, 1), top);
  b.quad(P(a, -1, -1), P(c, -1, -1), P(c, 1, -1), P(a, 1, -1), top.clone().negate());
  b.quad(P(a, 1, -1), P(c, 1, -1), P(c, 1, 1), P(a, 1, 1), side);
  b.quad(P(a, -1, -1), P(c, -1, -1), P(c, -1, 1), P(a, -1, 1), side.clone().negate());
}

// Railing panel: a quad whose shader draws a top rail, bottom rail and balusters (holes discarded).
// Two-faced. a/c are the ends at the rail's bottom height; h its height.
function railPanel(b: Builder, a: THREE.Vector3, c: THREE.Vector3, h: number) {
  const L = Math.hypot(c.x - a.x, c.z - a.z);
  if (L < 0.1) return;
  const n = V(c.z - a.z, 0, -(c.x - a.x)).normalize();
  const w = (u: number, v: number) => [u, v, L, h];
  b.part(PART.rail);
  b.quad(a, c, V(c.x, c.y + h, c.z), V(a.x, a.y + h, a.z), n, w(0, 0), w(L, 0), w(L, h), w(0, h));
  b.quad(a, c, V(c.x, c.y + h, c.z), V(a.x, a.y + h, a.z), n.clone().negate(), w(0, 0), w(L, 0), w(L, h), w(0, h));
  b.part(PART.trim);
}

function prism(b: Builder, cx: number, cz: number, r: number, sides: number, y0: number, y1: number, rot = 0) {
  const ring: P2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  walls(b, ring, y0, y0, y1, y1 - y0);
  return ring;
}
function cone(b: Builder, cx: number, cz: number, r: number, sides: number, y0: number, y1: number, rot = 0) {
  for (let i = 0; i < sides; i++) {
    const a0 = rot + (i / sides) * Math.PI * 2, a1 = rot + ((i + 1) / sides) * Math.PI * 2;
    const p = V(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r), q = V(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r);
    const am = (a0 + a1) / 2;
    const n = V(Math.cos(am), r / Math.max(y1 - y0, 0.01), Math.sin(am)).normalize();
    b.tri(p, q, V(cx, y1, cz), n);
  }
}

function lighthouseTower(b: Builder, cx: number, cz: number, r: number, base: number, h: number, bodyCol: THREE.Color, id: number, sides = 8) {
  b.setInfo(id, KIND.lighthouse, PART.wall, 0);
  b.setColor(bodyCol);
  prism(b, cx, cz, r, sides, base, base + h, Math.PI / sides);
  b.setInfo(id, KIND.lighthouse, PART.trim, 0);
  b.setColor(lin(0x2f3336));
  flatCap(b, prism(b, cx, cz, r * 1.25, sides, base + h, base + h + 0.4), base + h + 0.4);
  b.setInfo(id, KIND.lighthouse, PART.glass, 0);
  b.setColor(lin(0xfff1c4));
  prism(b, cx, cz, r * 0.7, sides, base + h + 0.4, base + h + 2.6);
  b.setInfo(id, KIND.lighthouse, PART.trim, 0);
  b.setColor(lin(0x2f3336));
  cone(b, cx, cz, r * 0.85, sides, base + h + 2.6, base + h + 3.8);
}

// ---------------- streets ----------------
// Grid of street segments for "which wall faces the street?" queries.
class StreetIndex {
  private grid = new Map<number, number[]>();
  private segs: number[][] = [];
  readonly names: (string | undefined)[] = [];
  lastName: string | undefined;
  constructor(world: World) {
    for (const r of world.json.roads) {
      if (r.lod || !['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian', 'footway'].includes(r.c)) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const s = [r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10, r.c === 'service' || r.c === 'footway' ? 1 : 0, r.w];
        const id = this.segs.length;
        this.segs.push(s);
        this.names.push(r.c === 'service' || r.c === 'footway' ? undefined : r.n);
        for (let gx = Math.floor(Math.min(s[0], s[2]) / 25); gx <= Math.floor(Math.max(s[0], s[2]) / 25); gx++)
          for (let gz = Math.floor(Math.min(s[1], s[3]) / 25); gz <= Math.floor(Math.max(s[1], s[3]) / 25); gz++) {
            const k = gx * 92821 + gz;
            let l = this.grid.get(k);
            if (!l) this.grid.set(k, (l = []));
            l.push(id);
          }
      }
    }
  }
  // [x, z, score distance, width, is-minor]
  nearest(x: number, z: number, R = 50, majorOnly = false): [number, number, number, number, number] | null {
    let best: [number, number, number, number, number] | null = null;
    for (let gx = Math.floor((x - R) / 25); gx <= Math.floor((x + R) / 25); gx++)
      for (let gz = Math.floor((z - R) / 25); gz <= Math.floor((z + R) / 25); gz++)
        for (const id of this.grid.get(gx * 92821 + gz) ?? []) {
          const [ax, az, bx, bz, minor, w] = this.segs[id];
          if (majorOnly && minor) continue;
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
          const px = ax + dx * t, pz = az + dz * t;
          const d = Math.hypot(px - x, pz - z) + minor * 6; // prefer real streets over driveways
          if (d < R && (!best || d < best[2])) (best = [px, pz, d, w, minor]), (this.lastName = this.names[id]);
        }
    return best;
  }
}

// Coarse hash of footprints to keep porches and stairs out of the neighbours.
class RingGrid {
  private g = new Map<number, P2[][]>();
  add(r: P2[]) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    for (let i = Math.floor(x0 / 20); i <= Math.floor(x1 / 20); i++)
      for (let j = Math.floor(z0 / 20); j <= Math.floor(z1 / 20); j++) {
        const k = i * 92821 + j;
        let l = this.g.get(k);
        if (!l) this.g.set(k, (l = []));
        l.push(r);
      }
  }
  hit(x: number, z: number, self: P2[]) {
    for (const r of this.g.get(Math.floor(x / 20) * 92821 + Math.floor(z / 20)) ?? []) {
      if (r === self) continue;
      let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, zi] = r[i], [xj, zj] = r[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }
}

// ---------------- doors, steps, porches ----------------
// x,z,y: threshold just outside; wx,wz: centre of the opening in the wall; fx,fy,fz: foot of the steps.
export interface Door { x: number; z: number; y: number; nx: number; nz: number; fx: number; fz: number; fy: number; b: number; w: number; h: number; wx: number; wz: number; col: number; street?: string; porch?: boolean }
export interface Colliders { walls: [P2, P2, number, number][]; decks: Deck[] }
export interface SignSpec { x: number; z: number; y: number; tx: number; tz: number; nx: number; nz: number; w: number; h: number; text: string; style: 'shop' | 'number'; color: number }
export interface Mailbox { x: number; z: number; yaw: number }

interface Ctx {
  b: Builder;
  col: Colliders;
  streets: StreetIndex;
  rings: RingGrid;
  world: World;
  signs: SignSpec[];
  mail: Mailbox[];
  walks: number[];
}
interface BInfo { ring: P2[]; base: number; floor0: number; raise: number; eave: number; kind: string; seed: number; id: number; fo: number; roofCol: THREE.Color; roofMat?: number; addr?: string; name?: string; bi: number }

const deckLine = (pts: P2[], hw: number, heightAt: (s: number) => number, profile?: Deck['profile']): Deck => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, halfWidth: hw, heightAt, profile };
};

// A straight exterior flight: treads, open risers, stringers, railings; walkable as a ramp deck with side walls.
// (x0,z0) = top of the flight on its centre line, (dx,dz) = unit direction going down.
function stairFlight(C: Ctx, x0: number, z0: number, dx: number, dz: number, sw: number, yTop: number, yBot: number, treadCol: THREE.Color, rails = true) {
  const b = C.b;
  const rise = yTop - yBot;
  const n = Math.max(1, Math.round(rise / 0.19));
  const rs = rise / n, run = 0.27, total = Math.max(0.3, (n - 1) * run);
  const px = -dz, pz = dx;
  const ang = Math.atan2(dz, dx);
  b.part(PART.trim);
  b.setColor(treadCol);
  for (let k = 1; k < n; k++) {
    const d = (k - 0.5) * run, y = yTop - k * rs;
    box(b, x0 + dx * d, z0 + dz * d, ang, run + 0.04, sw - 0.1, y - 0.05, y);
  }
  b.setColor(lin(TRIM));
  const foot = V(x0 + dx * total, yBot, z0 + dz * total);
  for (const s of [-1, 1]) {
    const ox = px * s * (sw / 2 - 0.04), oz = pz * s * (sw / 2 - 0.04);
    beam(b, V(x0 + ox, yTop - 0.12, z0 + oz), V(foot.x + ox, yBot + 0.02, foot.z + oz), 0.06, 0.26);
    if (!rails) continue;
    const ox2 = px * s * (sw / 2), oz2 = pz * s * (sw / 2);
    box(b, x0 + ox2, z0 + oz2, ang, 0.1, 0.1, yTop - 0.3, yTop + 0.95);
    box(b, foot.x + ox2 - dx * 0.05, foot.z + oz2 - dz * 0.05, ang, 0.1, 0.1, yBot, yBot + 1.0);
    beam(b, V(x0 + ox2, yTop + 0.92, z0 + oz2), V(foot.x + ox2, yBot + 0.95, foot.z + oz2), 0.07, 0.06);
    railPanel(b, V(x0 + ox2, yTop + 0.05, z0 + oz2), V(foot.x + ox2, yBot + 0.08, foot.z + oz2), 0.85);
  }
  C.col.decks.push(deckLine([[foot.x, foot.z], [x0, z0]], sw / 2 - 0.08, (s) => yBot + rise * Math.min(1, Math.max(0, s / total)), { k: 'ramp', y0: yBot, y1: yBot + rise, total }));
  for (const s of [-1, 1]) {
    const ox = px * s * (sw / 2), oz = pz * s * (sw / 2);
    C.col.walls.push([[x0 + ox, z0 + oz], [foot.x + ox, foot.z + oz], -Infinity, Infinity]);
  }
  return { fx: foot.x, fz: foot.z, total };
}

// Pick the wall that faces the street (or a mapped OSM entrance) for the front door.
function pickDoorWall(ring: P2[], seed: number, kind: string, streets: StreetIndex, entrances: P2[]) {
  let best: { i: number; score: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    if (len < 2.4) continue;
    const nx = dz / len, nz = -dx / len;
    for (const [ex, ez] of entrances) {
      const t = ((ex - p[0]) * dx + (ez - p[1]) * dz) / (len * len);
      const px = p[0] + dx * t, pz = p[1] + dz * t;
      if (t > 0.1 && t < 0.9 && Math.hypot(px - ex, pz - ez) < 2.5) return { i, u: t * len, len };
    }
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    const r = streets.nearest(mx + nx * 2, mz + nz * 2);
    let score = len > 4 ? -len * 0.05 : 0;
    if (r) {
      const ddx = r[0] - mx, ddz = r[1] - mz, dl = Math.hypot(ddx, ddz) || 1;
      score += r[2] - 14 * ((ddx * nx + ddz * nz) / dl);
    } else score += 60;
    if (!best || score < best.score) best = { i, score };
  }
  if (!best) return null;
  const p = ring[best.i], q = ring[(best.i + 1) % ring.length];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const u = kind === 'commercial' || kind === 'church' ? len / 2 : Math.max(1.1, Math.min(len - 1.1, len * (0.28 + 0.44 * hash01(seed ^ 0x9e37))));
  return { i: best.i, u, len };
}

function buildEntrance(C: Ctx, B: BInfo, wall: { i: number; u: number; len: number }, porch: boolean): Door {
  const { b, world } = C;
  const { terrain } = world;
  const p = B.ring[wall.i], q = B.ring[(wall.i + 1) % B.ring.length];
  const len = wall.len, u = wall.u;
  const tx = (q[0] - p[0]) / len, tz = (q[1] - p[1]) / len;
  const nx = tz, nz = -tx; // outward for a CCW ring
  const ang = Math.atan2(tz, tx);
  const at = (uu: number, out: number): P2 => [p[0] + tx * uu + nx * out, p[1] + tz * uu + nz * out];
  const kindI = KIND[B.kind as keyof typeof KIND] ?? 0;
  const floorY = B.floor0;
  const cx = p[0] + tx * u, cz = p[1] + tz * u;
  const wide = B.kind === 'commercial' ? 1.8 : B.kind === 'church' ? 2.2 : 1.0;
  const tall = B.kind === 'church' ? 2.8 : 2.15;
  const trim = lin(TRIM);
  const r = (k: number) => hash01(B.seed ^ k);

  // casing (two jambs + head), recessed door leaf, knob, porch light
  b.setInfo(B.id, kindI, PART.trim, B.fo);
  b.setColor(trim);
  for (const s of [-1, 1]) box(b, cx + tx * s * (wide / 2 + 0.07) + nx * 0.05, cz + tz * s * (wide / 2 + 0.07) + nz * 0.05, ang, 0.14, 0.1, floorY, floorY + tall + 0.1);
  box(b, cx + nx * 0.05, cz + nz * 0.05, ang, wide + 0.34, 0.12, floorY + tall, floorY + tall + 0.2);
  const n = V(nx, 0, nz);
  const face = (hw: number, y0: number, y1: number, off: number, du = 0) => {
    const ox = cx + nx * off + tx * du, oz = cz + nz * off + tz * du;
    b.quad(V(ox - tx * hw, y0, oz - tz * hw), V(ox + tx * hw, y0, oz + tz * hw), V(ox + tx * hw, y1, oz + tz * hw), V(ox - tx * hw, y1, oz - tz * hw), n);
  };
  const doorHex = B.kind === 'commercial' ? 0x26313b : DOOR_COLORS[Math.floor(r(0x51) * DOOR_COLORS.length)];
  const doorCol = lin(doorHex);
  b.setColor(doorCol);
  face(wide / 2, floorY, floorY + tall, 0.02);
  // raised panels on the leaf (a shade darker) / a glass lite on shop doors
  b.setColor(B.kind === 'commercial' ? lin(0x9fb3bf) : doorCol.clone().multiplyScalar(0.82));
  if (B.kind === 'commercial') face(wide / 2 - 0.12, floorY + 0.5, floorY + tall - 0.15, 0.035);
  else for (const s of [-1, 1]) for (const [y0, y1] of [[0.18, 0.95], [1.15, 1.95]]) face(wide / 4 - 0.1, floorY + y0, floorY + y1, 0.035, s * wide / 4);
  b.setColor(lin(0xc9a74a));
  const kx = cx + tx * (wide / 2 - 0.15) + nx * 0.07, kz = cz + tz * (wide / 2 - 0.15) + nz * 0.07;
  box(b, kx, kz, ang, 0.07, 0.07, floorY + 0.95, floorY + 1.02);
  b.setInfo(B.id, kindI, PART.glass, B.fo);
  b.setColor(lin(0xffe7b0));
  box(b, cx + tx * (wide / 2 + 0.42) + nx * 0.1, cz + tz * (wide / 2 + 0.42) + nz * 0.1, ang, 0.16, 0.16, floorY + 1.9, floorY + 2.2);
  b.setInfo(B.id, kindI, PART.trim, B.fo);

  let fx = cx + nx * 1.4, fz = cz + nz * 1.4, fy = floorY;
  const concrete = lin(0xc8c1b3), wood = lin(0xa8998a);
  const gAt = (out: number, du = 0) => terrain.heightAt(cx + nx * out + tx * du, cz + nz * out + tz * du);

  if (B.raise > 0.5) {
    // Raised on pilings: a landing at the door and a railed stair down to the ground.
    const g = gAt(3);
    const rise = floorY - g;
    const nSteps = Math.max(2, Math.round(rise / 0.19));
    const total = (nSteps - 1) * 0.27;
    const sw = 1.1, D = 1.35;
    const spaceR = len - (u + wide / 2 + 0.45), spaceL = u - wide / 2 - 0.45;
    const parallel = Math.max(spaceR, spaceL) >= total + 0.3;
    const dir = spaceR >= spaceL ? 1 : -1;
    let la: number, lb: number; // landing extent along the wall
    if (parallel) {
      la = u - dir * (wide / 2 + 0.45);
      lb = u + dir * (wide / 2 + 0.45);
    } else {
      la = u - (wide / 2 + 0.5);
      lb = u + (wide / 2 + 0.5);
    }
    const l0 = Math.min(la, lb), l1 = Math.max(la, lb);
    // landing deck on two posts
    const lr: P2[] = [at(l0, 0), at(l1, 0), at(l1, D), at(l0, D)];
    b.setColor(wood);
    walls(b, lr, floorY - 0.25, floorY - 0.25, floorY, 0.25);
    flatCap(b, lr, floorY);
    flatCap(b, lr, floorY - 0.25, DOWN);
    b.setColor(lin(0xb9ad9a));
    for (const uu of [l0 + 0.1, l1 - 0.1]) { const [x, z] = at(uu, D - 0.1); box(b, x, z, ang, 0.2, 0.2, g - 0.2, floorY - 0.25); }
    b.setColor(trim);
    let st;
    if (parallel) {
      const ue = lb, out = 0.08 + sw / 2;
      const [sx, sz] = at(ue, out);
      st = stairFlight(C, sx, sz, tx * dir, tz * dir, sw, floorY, g, wood);
      // rail along the landing's outer edge and far end
      const A = at(l0, D), Bp = at(l1, D), Cp = at(la, 0.05);
      const P3 = (pt: P2) => V(pt[0], floorY, pt[1]);
      railPanel(b, P3(A), P3(Bp), 0.95);
      railPanel(b, P3(Cp), P3(at(la, D)), 0.95);
      beam(b, V(A[0], floorY + 0.95, A[1]), V(Bp[0], floorY + 0.95, Bp[1]), 0.08, 0.06);
      C.col.walls.push([A, Bp, -Infinity, Infinity], [Cp, at(la, D), -Infinity, Infinity]);
      C.col.walls.push([at(lb, out + sw / 2), at(lb, D), -Infinity, Infinity]);
    } else {
      const [sx, sz] = at(u, D);
      st = stairFlight(C, sx, sz, nx, nz, sw, floorY, g, wood);
      const P3 = (pt: P2) => V(pt[0], floorY, pt[1]);
      railPanel(b, P3(at(l0, D)), P3(at(u - sw / 2, D)), 0.95);
      railPanel(b, P3(at(u + sw / 2, D)), P3(at(l1, D)), 0.95);
      railPanel(b, P3(at(l0, 0.05)), P3(at(l0, D)), 0.95);
      railPanel(b, P3(at(l1, 0.05)), P3(at(l1, D)), 0.95);
      C.col.walls.push([at(l0, D), at(u - sw / 2, D), -Infinity, Infinity], [at(u + sw / 2, D), at(l1, D), -Infinity, Infinity]);
      C.col.walls.push([at(l0, 0.05), at(l0, D), -Infinity, Infinity], [at(l1, 0.05), at(l1, D), -Infinity, Infinity]);
    }
    C.col.decks.push(deckLine([at(l0 + 0.2, D / 2), at(l1 - 0.2, D / 2)], D / 2 + 0.05, () => floorY, { k: 'const', y: floorY }));
    fx = st.fx; fz = st.fz; fy = g;
  } else if (porch) {
    // Front porch: deck, turned posts, railing, a shed roof; steps down in front of the door.
    const D = 2.1;
    const pw = Math.min(len - 0.3, 3.4 + r(0x77) * 3.2);
    const pu0 = Math.max(0.15, Math.min(len - 0.15 - pw, u - pw / 2)), pu1 = pu0 + pw;
    const gFront = gAt(D + 0.6);
    const deckY = floorY;
    const pr: P2[] = [at(pu0, 0), at(pu1, 0), at(pu1, D), at(pu0, D)];
    b.setColor(lin(0x9d8f7e));
    walls(b, pr, Math.min(gFront, deckY) - 0.2, Math.min(gFront, deckY) - 0.2, deckY, 0.5);
    b.setColor(wood);
    flatCap(b, pr, deckY);
    const yHi = Math.min(deckY + 2.75, B.eave - 0.08), yLo = yHi - 0.42;
    const nPost = Math.max(2, Math.ceil(pw / 2.4) + 1);
    b.setColor(trim);
    const posts: number[] = [];
    for (let k = 0; k < nPost; k++) posts.push(pu0 + 0.12 + ((pw - 0.24) * k) / (nPost - 1));
    for (const pu of posts) { const [x, z] = at(pu, D - 0.12); box(b, x, z, ang, 0.15, 0.15, deckY, yLo); }
    // shed roof (top + painted ceiling + fascia)
    const rr = (uu: number, out: number, y: number) => { const [x, z] = at(uu, out); return V(x, y, z); };
    const slope = (yHi - yLo) / (D + 0.25);
    const rn = V(nx * slope, 1, nz * slope).normalize();
    b.setInfo(B.id, kindI, PART.roof, B.roofMat ?? 0); // roof faces carry the material code, not fo
    b.setColor(B.roofCol);
    b.quad(rr(pu0 - 0.25, 0, yHi + 0.06), rr(pu1 + 0.25, 0, yHi + 0.06), rr(pu1 + 0.25, D + 0.25, yLo + 0.06), rr(pu0 - 0.25, D + 0.25, yLo + 0.06), rn);
    b.setInfo(B.id, kindI, PART.trim, B.fo);
    b.setColor(lin(r(0x33) < 0.4 ? 0xbcd7dc : TRIM));
    b.quad(rr(pu0 - 0.25, 0, yHi - 0.02), rr(pu1 + 0.25, 0, yHi - 0.02), rr(pu1 + 0.25, D + 0.25, yLo - 0.02), rr(pu0 - 0.25, D + 0.25, yLo - 0.02), DOWN);
    b.setColor(trim);
    b.quad(rr(pu0 - 0.25, D + 0.25, yLo - 0.2), rr(pu1 + 0.25, D + 0.25, yLo - 0.2), rr(pu1 + 0.25, D + 0.25, yLo + 0.06), rr(pu0 - 0.25, D + 0.25, yLo + 0.06), n);
    for (const uu of [pu0 - 0.25, pu1 + 0.25]) {
      const sn = V(tx * (uu < u ? -1 : 1), 0, tz * (uu < u ? -1 : 1));
      b.tri(rr(uu, 0, yHi + 0.06), rr(uu, D + 0.25, yLo + 0.06), rr(uu, D + 0.25, yLo - 0.2), sn);
    }
    // railing with a gap at the steps
    const gap0 = u - 0.75, gap1 = u + 0.75;
    const P3 = (pt: P2) => V(pt[0], deckY, pt[1]);
    const railSeg = (a: P2, c: P2) => {
      railPanel(b, P3(a), P3(c), 0.9);
      C.col.walls.push([a, c, -Infinity, Infinity]);
    };
    if (gap0 - pu0 > 0.3) railSeg(at(pu0 + 0.1, D - 0.12), at(gap0, D - 0.12));
    if (pu1 - gap1 > 0.3) railSeg(at(gap1, D - 0.12), at(pu1 - 0.1, D - 0.12));
    railSeg(at(pu0 + 0.1, 0.1), at(pu0 + 0.1, D - 0.12));
    railSeg(at(pu1 - 0.1, 0.1), at(pu1 - 0.1, D - 0.12));
    C.col.decks.push(deckLine([at(pu0 + 0.5, D / 2), at(pu1 - 0.5, D / 2)], D / 2, () => deckY, { k: 'const', y: deckY }));
    const rise = deckY - gFront;
    if (rise > 0.12) {
      const [sx, sz] = at(u, D);
      const st = stairFlight(C, sx, sz, nx, nz, 1.3, deckY, gFront, concrete, rise > 0.6);
      (fx = st.fx), (fz = st.fz), (fy = gFront);
    } else (fx = at(u, D + 0.8)[0]), (fz = at(u, D + 0.8)[1]), (fy = gFront);
  } else {
    // Stoop: a landing slab and steps down to the walk.
    const g = gAt(1.2);
    const rise = floorY - g;
    b.setColor(concrete);
    if (rise > 0.1) {
      const nS = Math.max(1, Math.ceil(rise / 0.18));
      const rs = rise / nS;
      box(b, cx + nx * 0.3, cz + nz * 0.3, ang, wide + 0.7, 0.6, g - 0.15, floorY);
      for (let k = 1; k < nS; k++) {
        const d = 0.6 + (k - 0.5) * 0.3;
        box(b, cx + nx * d, cz + nz * d, ang, wide + 0.5, 0.3, g - 0.15, floorY - k * rs);
      }
      const L1 = 0.6 + (nS - 1) * 0.3;
      fx = cx + nx * (L1 + 0.3); fz = cz + nz * (L1 + 0.3); fy = g;
      C.col.decks.push(deckLine([[fx, fz], [cx + nx * 0.25, cz + nz * 0.25]], wide / 2 + 0.2, (s) => g + rise * Math.min(1, s / Math.max(0.1, L1 + 0.05)), { k: 'ramp', y0: g, y1: g + rise, total: Math.max(0.1, L1 + 0.05) }));
    } else {
      box(b, cx + nx * 0.3, cz + nz * 0.3, ang, wide + 0.5, 0.6, floorY - 0.2, floorY + 0.02);
      fy = g;
    }
  }

  // Signs: shop name over the door, house number beside it.
  if (B.name && (B.kind === 'commercial' || B.kind === 'church')) {
    const sw = Math.min(len - 0.6, 1.1 + B.name.length * 0.21);
    if (sw > 1.2) C.signs.push({ x: cx + nx * 0.09, z: cz + nz * 0.09, y: floorY + tall + 0.62, tx, tz, nx, nz, w: sw, h: 0.62, text: B.name, style: 'shop', color: [0x2f4a3a, 0x3a2e46, 0x6b2b24, 0xf1ead8, 0x23364a][Math.floor(r(0x5151) * 5)] });
  }
  const num = B.addr?.match(/^\d+[A-Za-z]?/)?.[0];
  if (num) {
    const du = (wide / 2 + (B.kind === 'house' ? 0.45 : 0.7)) * (r(0x91) < 0.5 ? -1 : 1);
    C.signs.push({ x: cx + tx * du + nx * 0.07, z: cz + tz * du + nz * 0.07, y: floorY + 1.55, tx, tz, nx, nz, w: 0.16 + num.length * 0.1, h: 0.2, text: num, style: 'number', color: 0x2e2a2a });
  }
  // Front walk to the street + a mailbox at the curb for houses.
  const st = C.streets.nearest(fx, fz, 40, true);
  const street = st ? C.streets.lastName : undefined;
  if (st && B.kind !== 'shed') {
    const ddx = fx - st[0], ddz = fz - st[1], dl = Math.hypot(ddx, ddz);
    const edge = st[3] / 2 + 0.6;
    if (dl > edge + 1.5) {
      const ex = st[0] + (ddx / dl) * edge, ez = st[1] + (ddz / dl) * edge;
      C.walks.push(fx, fz, ex, ez, B.kind === 'commercial' ? 2.0 : 1.1);
      if (num && B.kind === 'house' && dl > edge + 3) {
        const mx = st[0] + (ddx / dl) * (edge + 0.5) + (-ddz / dl) * 0.9, mz = st[1] + (ddz / dl) * (edge + 0.5) + (ddx / dl) * 0.9;
        if (!C.rings.hit(mx, mz, B.ring)) C.mail.push({ x: mx, z: mz, yaw: Math.atan2(-ddx, -ddz) });
      }
    }
  }
  return { x: cx + nx * 0.2, z: cz + nz * 0.2, y: floorY, nx, nz, fx, fz, fy, b: B.bi, w: wide, h: tall, wx: cx, wz: cz, col: doorHex, street, porch: porch && B.raise <= 0.5 };
}

// Is there room for a porch on this wall (no neighbours, not onto the street)?
function porchFits(C: Ctx, B: BInfo, wall: { i: number; u: number; len: number }) {
  if (wall.len < 3.6) return false;
  const p = B.ring[wall.i], q = B.ring[(wall.i + 1) % B.ring.length];
  const tx = (q[0] - p[0]) / wall.len, tz = (q[1] - p[1]) / wall.len, nx = tz, nz = -tx;
  for (const [du, out] of [[-2, 1], [0, 1.2], [2, 1], [-2, 2.3], [0, 2.4], [2, 2.3], [0, 3.4]]) {
    const x = p[0] + tx * (wall.u + du) + nx * out, z = p[1] + tz * (wall.u + du) + nz * out;
    if (C.rings.hit(x, z, B.ring)) return false;
  }
  const x = p[0] + tx * wall.u + nx * 2.2, z = p[1] + tz * wall.u + nz * 2.2;
  const s = C.streets.nearest(x, z, 30, true);
  return !s || s[2] - s[3] / 2 > 3.2;
}

// ---------------- roof emission ----------------
function emitRoof(b: Builder, R: RoofGeom, eave: number, base: number, roofCol: THREE.Color, trimCol: THREE.Color, detail: boolean, wallFacade: THREE.Color, id: number, kindI: number, fo: number, roofMat = 0) {
  // gable walls: siding continues up; wall-UV continues above the eave for the attic window
  b.setInfo(id, kindI, PART.wall, fo);
  b.setColor(wallFacade);
  for (const g of R.gables) {
    const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
    const tx = (g.b[0] - g.a[0]) / len, tz = (g.b[1] - g.a[1]) / len;
    const ua = (g.apex[0] - g.a[0]) * tx + (g.apex[1] - g.a[1]) * tz;
    const n = V(tz, 0, -tx);
    const e = eave - base;
    b.setTan(tx, tz);
    b.tri(V(g.a[0], eave, g.a[1]), V(g.b[0], eave, g.b[1]), V(g.apex[0], eave + g.h, g.apex[1]), n, [0, e, len, e], [len, e, len, e], [ua, e + g.h, len, e]);
    b.setTan(0, 0);
  }
  b.setInfo(id, kindI, PART.roof, roofMat); // roof faces carry the material code where walls carry fo
  b.setColor(roofCol);
  for (const t of R.tris) {
    const [p0, p1, p2] = t.p;
    b.tri(V(p0[0], eave + p0[1], p0[2]), V(p1[0], eave + p1[1], p1[2]), V(p2[0], eave + p2[1], p2[2]), V(t.n[0], t.n[1], t.n[2]));
  }
  if (!detail) return;
  // soffits: the roof again, a hand's width lower, facing down; fascia boards and rake trim
  b.setInfo(id, kindI, PART.trim, fo);
  b.setColor(trimCol);
  for (const t of R.tris) {
    const [p0, p1, p2] = t.p;
    b.tri(V(p0[0], eave + p0[1] - 0.14, p0[2]), V(p1[0], eave + p1[1] - 0.14, p1[2]), V(p2[0], eave + p2[1] - 0.14, p2[2]), DOWN);
  }
  const lowY = eave + R.lowH;
  for (const [ax, az, bx, bz] of R.fascia) {
    const n = V(bz - az, 0, -(bx - ax)).normalize();
    b.quad(V(ax, lowY - 0.2, az), V(bx, lowY - 0.2, bz), V(bx, lowY + 0.03, bz), V(ax, lowY + 0.03, az), n);
  }
  for (const [ax, az, ah, bx, bz, bh] of R.rakes) {
    const n = V(bz - az, 0, -(bx - ax)).normalize();
    b.quad(V(ax, eave + ah - 0.2, az), V(bx, eave + bh - 0.2, bz), V(bx, eave + bh + 0.03, bz), V(ax, eave + ah + 0.03, az), n);
  }
}

// ---------------- house detail (J2): plinth, dormers, downspouts, side chimney, bays, cornices ----------------
// All geometry is decided by the recipe (pure f(bd.s)) and fitted to the real footprint/roof —
// nothing here moves a wall or a roof plane the data gave us; it only adds what real houses carry.
interface Deco {
  ring: P2[]; cx: number; cz: number; base: number; eave: number; fo: number; floor0: number; raise: number;
  id: number; kindS: number; roofMat: number; facade: THREE.Color; roofCol: THREE.Color; trim: THREE.Color;
  R: RoofGeom; rc: Recipe; seed: number; streets: StreetIndex; colliders: Colliders; rings: RingGrid;
}

const orient = (ring: P2[]) => (ringArea(ring) > 0 ? 1 : -1);
// outward unit normal of ring edge i (same convention walls() uses for its face normals)
function edgeFrame(ring: P2[], i: number) {
  const p = ring[i], q = ring[(i + 1) % ring.length];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const tx = (q[0] - p[0]) / len, tz = (q[1] - p[1]) / len, s = orient(ring);
  return { p, q, len, tx, tz, nx: tz * s, nz: -tx * s };
}

// A foundation plinth standing 5 cm proud of the siding with a little ledge on top: the wall's
// base gets a real shadow line instead of a painted band.
function plinth(b: Builder, ring: P2[], base: number, top: number, id: number, kindI: number, col: THREE.Color) {
  if (top - base < 0.22) return;
  const off = offsetRing(ring, 0.05);
  if (!off || off.length !== ring.length) return;
  b.setInfo(id, kindI, PART.trim, 0);
  b.setColor(col);
  walls(b, off, base, base, top, 1);
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    b.quad(V(ring[i][0], top, ring[i][1]), V(ring[j][0], top, ring[j][1]), V(off[j][0], top, off[j][1]), V(off[i][0], top, off[i][1]), UP);
  }
}

// Flat roofs: a coping cap on the parapet, and a projecting cornice on main-street buildings.
function decorateFlat(b: Builder, ring: P2[], top: number, id: number, kindI: number, trim: THREE.Color, cornice: boolean) {
  const cop = offsetRing(ring, 0.04);
  if (!cop || cop.length !== ring.length) return;
  b.setInfo(id, kindI, PART.trim, 0);
  b.setColor(trim.clone().multiplyScalar(0.92));
  walls(b, cop, top, top + 0.38, top + 0.5, 1);
  flatCapRing(b, cop, ring, top + 0.5);
  if (!cornice) return;
  const cor = offsetRing(ring, 0.2);
  if (!cor || cor.length !== ring.length) return;
  b.setColor(trim);
  walls(b, cor, top, top - 0.05, top + 0.3, 1);
  flatCapRing(b, cor, ring, top + 0.3);
  flatCapRing(b, cor, ring, top - 0.05, DOWN);
}
// the band between an outer ring and the wall ring at height y (a ledge / cornice top)
function flatCapRing(b: Builder, outer: P2[], inner: P2[], y: number, n = UP) {
  for (let i = 0; i < inner.length; i++) {
    const j = (i + 1) % inner.length;
    b.quad(V(inner[i][0], y, inner[i][1]), V(inner[j][0], y, inner[j][1]), V(outer[j][0], y, outer[j][1]), V(outer[i][0], y, outer[i][1]), n);
  }
}

function pointInTri(x: number, z: number, a: number[], c: number[], d: number[]) {
  const s1 = (c[0] - a[0]) * (z - a[2]) - (c[2] - a[2]) * (x - a[0]);
  const s2 = (d[0] - c[0]) * (z - c[2]) - (d[2] - c[2]) * (x - c[0]);
  const s3 = (a[0] - d[0]) * (z - d[2]) - (a[2] - d[2]) * (x - d[0]);
  return (s1 >= -1e-6 && s2 >= -1e-6 && s3 >= -1e-6) || (s1 <= 1e-6 && s2 <= 1e-6 && s3 <= 1e-6);
}

function decorate(b: Builder, D: Deco, plan: DormerPlan | null) {
  if (plan) dormers(b, D, plan);
  if (D.rc.downspouts) downspouts(b, D);
}

// Gabled dormers set into the street-facing roof plane. Fitting is a pure pre-pass on the roof
// geometry (heights relative to the eave) so the builder can decide the massing first: a house
// only becomes 1½-storey (steep roof, storey in the roof) when at least one dormer really fits.
interface DormerPlan { ei: number; pitch: number; us: number[]; Wd: number }
function planDormers(R: RoofGeom, ring: P2[], streets: StreetIndex, cx: number, cz: number, seed: number, want: number): DormerPlan | null {
  const st = streets.nearest(cx, cz, 60, true) ?? streets.nearest(cx, cz, 60);
  let fx = 0, fz = 0;
  if (st) { fx = st[0] - cx; fz = st[1] - cz; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; }
  const planes = new Map<string, { n: [number, number, number]; tris: [number, number, number][][]; area: number }>();
  for (const t of R.tris) {
    const k = t.n.map((v) => v.toFixed(3)).join(',');
    let P = planes.get(k);
    if (!P) planes.set(k, (P = { n: t.n, tris: [], area: 0 }));
    P.tris.push(t.p);
    const [a, c, d] = t.p;
    P.area += Math.abs((c[0] - a[0]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[0] - a[0])) / 2;
  }
  let best: { n: [number, number, number]; tris: [number, number, number][][] } | null = null, score = -Infinity;
  for (const P of planes.values()) {
    const [nx, ny, nz] = P.n;
    if (ny < 0.45 || ny > 0.93 || P.area < 12) continue;
    const hl = Math.hypot(nx, nz);
    const sc = st ? (nx * fx + nz * fz) / hl + P.area * 0.002 : P.area;
    if (sc > score) (score = sc), (best = P);
  }
  if (!best || (st && score < 0.55)) return null;
  const [pnx, pny, pnz] = best.n;
  const hl = Math.hypot(pnx, pnz), hx = pnx / hl, hz = pnz / hl, pitch = hl / pny;
  let ei = -1, el = 0;
  for (let i = 0; i < ring.length; i++) {
    const f = edgeFrame(ring, i);
    if (f.nx * hx + f.nz * hz > 0.985 && f.len > el) (el = f.len), (ei = i);
  }
  if (ei < 0 || el < 4.5) return null;
  const E = edgeFrame(ring, ei);
  const onPlane = (x: number, z: number) => best!.tris.some((t) => pointInTri(x, z, t[0], t[1], t[2]));
  const Wd = 2.1 + hash01(seed ^ 0xd07) * 0.4, hw = Wd / 2;
  const n = Math.max(1, Math.min(want, Math.floor((el - 1.4) / (Wd + 1.4))));
  const { d0, Hd, dp } = DORMER;
  const rel = d0 * pitch + Hd + hw * dp; // dormer ridge above the eave
  if (rel > R.rise - 0.35) return null; // no room under the main ridge
  const dr = rel / pitch;
  const us: number[] = [];
  for (let k = 0; k < n; k++) {
    const u = (el * (k + 1)) / (n + 1);
    let fits = true;
    for (const x of [-hw - 0.2, 0, hw + 0.2]) for (const d of [d0 - 0.2, dr + 0.25]) {
      const px = E.p[0] + E.tx * (u + x) - E.nx * d, pz = E.p[1] + E.tz * (u + x) - E.nz * d;
      if (!onPlane(px, pz)) fits = false;
    }
    if (fits) us.push(u);
  }
  return us.length ? { ei, pitch, us, Wd } : null;
}
const DORMER = { d0: 0.35, Hd: 1.62, dp: 0.8, ov: 0.14 };

// Emit planned dormers. Front wall UV: len carries +1000 (the "dormer" flag windowAt reads, so
// the random blank-window drop never empties a dormer), v places one storey band's window.
function dormers(b: Builder, D: Deco, plan: DormerPlan) {
  const { eave } = D;
  const E = edgeFrame(D.ring, plan.ei);
  const inX = -E.nx, inZ = -E.nz, pitch = plan.pitch, Wd = plan.Wd, hw = Wd / 2;
  const { d0, Hd, dp, ov } = DORMER;
  const yb = eave + d0 * pitch, yw = yb + Hd, yr = yw + hw * dp;
  const dw = (yw - eave) / pitch, dr = (yr - eave) / pitch;
  const Ed = D.fo + 3.0; // wall-UV eave: one storey band, no attic window
  const P = (u: number, d: number, y: number) => V(E.p[0] + E.tx * u + inX * d, y, E.p[1] + E.tz * u + inZ * d);
  const out = V(E.nx, 0, E.nz);
  for (const u of plan.us) {
    const vy = (y: number) => D.fo + 0.75 + (y - yb);
    const wv = (x: number, y: number) => [x + hw, vy(y), Wd + 1000, Ed];
    b.setInfo(D.id, D.kindS, PART.wall, D.fo);
    b.setColor(D.facade);
    b.setTan(E.tx, E.tz);
    b.quad(P(u - hw, d0, yb - 0.12), P(u + hw, d0, yb - 0.12), P(u + hw, d0, yw), P(u - hw, d0, yw), out, wv(-hw, yb - 0.12), wv(hw, yb - 0.12), wv(hw, yw), wv(-hw, yw));
    b.tri(P(u - hw, d0, yw), P(u + hw, d0, yw), P(u, d0, yr), out, wv(-hw, yw), wv(hw, yw), wv(0, yr));
    b.setTan(0, 0);
    for (const s of [-1, 1]) {
      const cn = V(E.tx * s, 0, E.tz * s);
      const cv = (d: number, y: number) => [d, vy(y), 1, Ed];
      b.tri(P(u + s * hw, d0, yb - 0.12), P(u + s * hw, d0, yw), P(u + s * hw, dw, yw), cn, cv(d0, yb - 0.12), cv(d0, yw), cv(dw, yw));
    }
    b.setInfo(D.id, D.kindS, PART.roof, D.roofMat);
    b.setColor(D.roofCol);
    const ye = yw - ov * dp, de = (ye - eave) / pitch;
    for (const s of [-1, 1]) {
      const A = P(u + s * (hw + ov), d0 - 0.2, ye), Bq = P(u, d0 - 0.2, yr + 0.02), C = P(u, dr, yr + 0.02), Dq = P(u + s * (hw + ov), de, ye);
      const nrm = new THREE.Vector3().crossVectors(Bq.clone().sub(A), Dq.clone().sub(A)).normalize();
      if (nrm.y < 0) nrm.negate();
      b.quad(A, Bq, C, Dq, nrm);
    }
    b.setInfo(D.id, D.kindS, PART.trim, D.fo);
    b.setColor(D.trim);
    beam(b, P(u - hw - ov, d0 - 0.19, ye - 0.05), P(u, d0 - 0.19, yr - 0.03), 0.1, 0.16);
    beam(b, P(u + hw + ov, d0 - 0.19, ye - 0.05), P(u, d0 - 0.19, yr - 0.03), 0.1, 0.16);
  }
}

// Downspouts at two convex corners — thin, trim-coloured, eave to grade.
function downspouts(b: Builder, D: Deco) {
  const { ring } = D;
  const s = orient(ring);
  const cand: { i: number; h: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length], p = ring[i], c = ring[(i + 1) % ring.length];
    const cross = ((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) * s;
    if (cross > 0.5 && Math.hypot(p[0] - a[0], p[1] - a[1]) > 2.5 && Math.hypot(c[0] - p[0], c[1] - p[1]) > 2.5) cand.push({ i, h: hash01((D.seed ^ (i * 0x9e3779b1)) >>> 0) });
  }
  cand.sort((x, y) => x.h - y.h);
  b.setInfo(D.id, D.kindS, PART.trim, D.fo);
  b.setColor(D.trim.clone().multiplyScalar(0.95));
  for (const { i } of cand.slice(0, 2)) {
    const f0 = edgeFrame(ring, (i + ring.length - 1) % ring.length), f1 = edgeFrame(ring, i);
    const x = ring[i][0] + (f0.nx + f1.nx) * 0.08 - f1.tx * 0.12, z = ring[i][1] + (f0.nz + f1.nz) * 0.08 - f1.tz * 0.12;
    const top = D.eave + D.R.lowH - 0.06;
    box(b, x, z, Math.atan2(f1.tz, f1.tx), 0.075, 0.075, D.base + 0.08, top);
    // the kick-out at the foot
    box(b, x + f1.nx * 0.14, z + f1.nz * 0.14, Math.atan2(f1.nz, f1.nx), 0.3, 0.08, D.base + 0.04, D.base + 0.12);
  }
}

// An exterior chimney climbing a gable end: wide shoulder below the eave, stack above the apex.
// Door-aware: never the door wall, prefers the gable facing away from the street, and needs
// clear ground (no neighbour, no street) where the stack stands.
function sideChimney(b: Builder, D: Deco, doorWall: number) {
  const s = orient(D.ring);
  const st = D.streets.nearest(D.cx, D.cz, 60, true);
  let pick: { g: RoofGeom['gables'][number]; tx: number; tz: number; nx: number; nz: number } | null = null, best = Infinity;
  for (const g of D.R.gables) {
    if (g.edge === doorWall) continue;
    const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) || 1;
    const tx = (g.b[0] - g.a[0]) / len, tz = (g.b[1] - g.a[1]) / len, nx = tz * s, nz = -tx * s;
    const faceStreet = st ? (nx * (st[0] - D.cx) + nz * (st[1] - D.cz)) / (Math.hypot(st[0] - D.cx, st[1] - D.cz) || 1) : 0;
    const x = g.apex[0] + nx * 0.9, z = g.apex[1] + nz * 0.9;
    if (D.rings.hit(x, z, D.ring)) continue;
    const road = D.streets.nearest(x, z, 20, true);
    if (road && road[2] - road[3] / 2 < 2.0) continue;
    if (faceStreet < best) (best = faceStreet), (pick = { g, tx, tz, nx, nz });
  }
  if (!pick) return;
  const { g, tx, tz, nx, nz } = pick;
  const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
  const off = (hash01(D.seed ^ 0xc41c) - 0.5) * Math.min(1.2, len * 0.2);
  const cx = g.apex[0] + tx * off + nx * 0.42, cz = g.apex[1] + tz * off + nz * 0.42;
  const ang = Math.atan2(tz, tx);
  const topY = D.eave + g.h + 0.95;
  const brick = hash01(D.seed ^ 0x5eed) < 0.7;
  // brick-coded wall (siding 2) with fo = 0: no foundation band, and the <2 m faces carry no windows
  b.setInfo(D.id, KIND.house + SIDING.brick / 10, PART.wall, 0);
  b.setColor(lin(brick ? 0x8e5040 : 0x8d8780));
  const r1 = box(b, cx, cz, ang, 1.45, 0.8, D.base, D.eave - 0.2);
  box(b, cx, cz, ang, 0.95, 0.62, D.eave - 0.2, topY);
  b.setInfo(D.id, D.kindS, PART.trim, D.fo);
  b.setColor(lin(0x5a5550));
  box(b, cx, cz, ang, 1.05, 0.72, topY, topY + 0.12);
  for (let i = 0; i < 4; i++) D.colliders.walls.push([r1[i], r1[(i + 1) % 4], -Infinity, D.eave]);
}

// A canted bay window beside the front door (ground floor), with a lean-to roof.
function bayWindow(C: Ctx, B: BInfo, wall: { i: number; u: number; len: number }, rc: Recipe, kindS: number, facade: THREE.Color, roofCol: THREE.Color, trim: THREE.Color) {
  const { b } = C;
  const p = B.ring[wall.i], q = B.ring[(wall.i + 1) % B.ring.length];
  const len = wall.len, tx = (q[0] - p[0]) / len, tz = (q[1] - p[1]) / len, nx = tz, nz = -tx;
  const left = wall.u - 0.95, right = len - wall.u - 0.95;
  const side = right >= left ? 1 : -1, room = Math.max(left, right);
  if (room < 3.4) return;
  const Wb = Math.min(3.0, room - 0.6), Dp = 0.72, cant = 0.4;
  const uc = wall.u + side * (0.95 + 0.3 + Wb / 2);
  const at = (u: number, d: number): P2 => [p[0] + tx * u + nx * d, p[1] + tz * u + nz * d];
  // clearance: nothing in front (neighbours, the street)
  for (const [du, dd] of [[0, Dp + 0.9], [-Wb / 2, Dp + 0.6], [Wb / 2, Dp + 0.6]]) {
    const [x, z] = at(uc + du, dd);
    if (C.rings.hit(x, z, B.ring)) return;
    const s = C.streets.nearest(x, z, 20, true);
    if (s && s[2] - s[3] / 2 < 1.5) return;
  }
  const yTop = Math.min(B.floor0 + 2.6, B.eave - 0.3);
  if (yTop - B.floor0 < 2.4) return;
  const ring: P2[] = [at(uc - Wb / 2, 0), at(uc + Wb / 2, 0), at(uc + Wb / 2 - cant, Dp), at(uc - Wb / 2 + cant, Dp)];
  const dOf = (x: number, z: number) => (x - p[0]) * nx + (z - p[1]) * nz;
  const roofY = (x: number, z: number) => yTop + 0.45 * (1 - Math.max(0, Math.min(1, dOf(x, z) / Dp)));
  b.setInfo(B.id, kindS, PART.wall, B.fo);
  b.setColor(facade);
  walls(b, ring, B.base, B.base, roofY, yTop - B.base + 0.3);
  // lean-to roof with a small overhang, fascia under its drip edge
  const over = offsetRing(ring, 0.1);
  b.setInfo(B.id, kindS, PART.roof, rc.roofMat === ROOFMAT.tile ? ROOFMAT.metal : rc.roofMat);
  b.setColor(roofCol);
  flatCap(b, over ?? ring, (x, z) => roofY(x, z) + 0.03);
  b.setInfo(B.id, kindS, PART.trim, B.fo);
  b.setColor(trim);
  if (over) flatCap(b, over, (x, z) => roofY(x, z) - 0.09, DOWN);
  for (let i = 1; i < 4; i++) C.col.walls.push([ring[i], ring[(i + 1) % 4], -Infinity, yTop]);
  C.col.walls.push([ring[0], ring[1], -Infinity, yTop]);
}

// ---------------- main ----------------
export interface BuildingsResult {
  group: THREE.Group;
  footprints: Footprint[];
  ctxRings: P2[][]; // tidy rings of margin-context buildings (own:0) — neighbour shapes for placement queries
  lanterns: THREE.Vector3[];
  material: THREE.ShaderMaterial;
  doors: Door[];
  colliders: Colliders;
  signs: SignSpec[];
  mailboxes: Mailbox[];
  walks: number[]; // x0 z0 x1 z1 width per front walk
  pilings: { x: number; z: number; ang: number }[];
}

// Convex hull (monotone chain), oriented like `like` so buildRoof sees the same winding.
function convexHull(pts: P2[], like: P2[] = pts): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], hi: P2[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const h = tidyRing([...lo.slice(0, -1), ...hi.slice(0, -1)], 0.3, 0.05);
  return Math.sign(ringArea(h)) === Math.sign(ringArea(like)) ? h : h.reverse();
}
// Distance inside a convex polygon to its nearest edge (negative outside).
function hullInset(h: P2[], x: number, z: number) {
  const s = orient(h);
  let d = Infinity;
  for (let i = 0; i < h.length; i++) {
    const p = h[i], q = h[(i + 1) % h.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const nx = ((q[1] - p[1]) / L) * s, nz = (-(q[0] - p[0]) / L) * s; // outward
    d = Math.min(d, -((x - p[0]) * nx + (z - p[1]) * nz));
  }
  return d;
}

export function buildBuildings(world: World, idBase = 0, lite = false): BuildingsResult {
  const { json, terrain } = world;
  const S = detailBox(json);
  const chunks = new Map<string, Builder>();
  const footprints: Footprint[] = [];
  const lanterns: THREE.Vector3[] = [];
  const streets = new StreetIndex(world);
  const entrances: P2[] = json.points.filter((p) => p.c === 'entrance').map((p) => [p.x, p.z]);
  const doors: Door[] = [];
  const colliders: Colliders = { walls: [], decks: [] };
  const rings = new RingGrid();
  const signs: SignSpec[] = [], mailboxes: Mailbox[] = [], walks: number[] = [], pilings: BuildingsResult['pilings'] = [];
  const near = (x: number, z: number, m: number) => x > S.x0 - m && x < S.x1 + m && z > S.z0 - m && z < S.z1 + m;

  // Unpack + tidy all outlines first (the porch/stair clearance test needs the neighbours).
  const tidy: (P2[] | null)[] = json.buildings.map((bd) => {
    const r: P2[] = [];
    for (let i = 0; i + 1 < bd.r.length; i += 2) r.push([bd.r[i] / 10, bd.r[i + 1] / 10]);
    if (r.length < 3) return null;
    let t = tidyRing(r, bd.lod ? 0.6 : 0.3, 0.05);
    // very detailed outlines can't carry a skeleton roof: coarsen houses so they keep a pitched roof
    if (bd.k === 'house' && bd.roof !== 'flat' && t.length > 40) t = tidyRing(r, 0.8, 0.1);
    return t.length >= 3 && ringArea(t) > 4 ? t : null;
  });
  tidy.forEach((r) => { if (r && near(r[0][0], r[0][1], 80)) rings.add(r); });
  // Margin-context buildings (own:0): neighbours' shapes, for scratch-walk seeds in the tile worker.
  const ctxRings: P2[][] = json.buildings.map((bd, bi) => (bd.own === 0 ? tidy[bi] : null)).filter((r): r is P2[] => !!r);

  json.buildings.forEach((bd: Building, bi: number) => {
    const ring = tidy[bi];
    if (!ring || bd.own === 0) return; // own:0 = margin context (a neighbour tile emits it)
    let cx = 0, cz = 0;
    for (const p of ring) (cx += p[0]), (cz += p[1]);
    cx /= ring.length;
    cz /= ring.length;
    const key = `${Math.floor(cx / 300)},${Math.floor(cz / 300)}`;
    if (!chunks.has(key)) chunks.set(key, new Builder());
    const b = chunks.get(key)!;
    let gmin = Infinity, gmax = -Infinity;
    for (const p of ring) {
      const h = terrain.heightAt(p[0], p[1]);
      gmin = Math.min(gmin, h);
      gmax = Math.max(gmax, h);
    }
    if (!isFinite(gmin)) return;
    const base = Math.max(gmin, 0.2) - 0.3;
    const seed = bd.s;
    const r1 = hash01(seed), r2 = hash01(seed ^ 0x5bd1e995), r3 = hash01(seed ^ 0x27d4eb2f), r5 = hash01(seed ^ 0x165667b1);
    const inSlice = !lite && near(cx, cz, 50); // lite (coarse ring) builds are silhouettes: no detail geometry
    const inZone = near(cx, cz, 270);
    const detail = inSlice && !bd.lod;
    // Every look decision comes from the recipe: pure f(bd.s, region style, real data).
    const rc = recipeFor(bd, activeStyle());
    const kindI = KIND[bd.k] ?? 0;
    const kindS = kindI + rc.siding / 10; // siding code rides in the fraction (the shader's kind tests use ±0.5 bands)
    const facade = lin(rc.facade);
    const roofCol = lin(rc.roof);
    const bTrim = lin(rc.trim);
    const id = idBase + bi;

    if (bd.roof === 'tower') {
      const r = Math.max(2.2, Math.sqrt(Math.abs(ringArea(ring)) / Math.PI));
      const sides = bd.n === 'North Tower' ? 8 : 4;
      lighthouseTower(b, cx, cz, r, base, bd.h, facade, id, sides);
      lanterns.push(V(cx, base + bd.h + 1.5, cz));
      footprints.push({ ring, base, top: base + bd.h, floor0: base + 0.3, raise: 0, name: bd.n, kind: bd.k, eave: bd.h, seed: r1, id });
      return;
    }

    // Raised on pilings: mapped min_height, else low-lying houses near the water, more likely the taller
    // they stand (a raised two-storey reads ~10 m in the height data, a slab one ~7–8 m).
    let raise = 0;
    if (bd.mh && bd.mh > 1) raise = Math.min(bd.mh, 4);
    else if (bd.k === 'house' && inZone && gmax < 3.2 && (terrain.oceanDistAt(cx, cz) < 450 || terrain.sdfAt(cx, cz) < 110)) {
      const p = bd.h >= 10 ? 0.8 : bd.h >= 8 ? 0.42 : bd.h >= 6.5 ? 0.12 : 0;
      if (r3 < p) raise = 2.3 + hash01(seed ^ 0x3c6ef372) * 1.1;
    }
    // Ground floor sits a little above the highest ground it covers (a foundation / crawlspace).
    const found = bd.k === 'commercial' || bd.k === 'large' ? 0.15 : bd.k === 'shed' ? 0.08 : 0.35 + r5 * 0.25;
    const floor0 = Math.min(gmax + found, base + 1.6) + raise;
    const fo = floor0 - base;
    // LiDAR heights stand on the footprint's MEAN ground; mapped ones on its lowest corner
    const top = base + 0.3 + bd.h + (bd.ms ? (gmax - gmin) / 2 : 0);
    const fH = floorHeight(bd.k);
    const pitched = bd.roof === 'gable' || bd.roof === 'hip';
    let eave = top, roofG: RoofGeom | null = null;
    let hullTop: ((x: number, z: number) => number) | null = null; // walls rising to meet a hull roof
    let dplan: DormerPlan | null = null;
    if (pitched) {
      // storeys first, the roof takes what's left (0.9–5.5 m)
      const room = top - floor0;
      const fullLv = Math.floor((room - 1.0) / fH);
      const ov = detail ? 0.4 : 0.3;
      const tryRoof = (half: boolean) => {
        // Dormered houses are 1½ storeys: the top floor lives in the roof (Cape Cod / bungalow),
        // so the roof gets the height a full storey would have taken.
        const lv = Math.max(1, bd.fl ?? (half && fullLv >= 2 ? fullLv - 1 : fullLv));
        // LiDAR-measured (lidar.ts): the rise IS ridge − eave; a steep nominal pitch lets the
        // skeleton reach it exactly (buildRoof caps pitch so inner·pitch = maxRise).
        const meas = bd.eav != null;
        const maxRise = meas ? Math.max(0.6, Math.min(12, bd.h - bd.eav!)) : Math.max(0.9, Math.min(bd.k === 'church' ? 10 : 5.5, room - lv * fH));
        const pitch = meas ? 3 : bd.k === 'church' ? 1.0 : bd.k === 'shed' ? 0.45 + r2 * 0.2 : half ? rc.pitch : rc.basePitch;
        let R = ring.length <= 40 ? buildRoof(ring, bd.roof as 'gable' | 'hip', pitch, ov, maxRise) : null;
        // skeleton failed on this outline? a house still gets a pitched roof: the other style, then a
        // hip over the convex hull (the true walls rise to meet it) before ever falling back to flat
        if (!R && bd.k === 'house' && ring.length <= 40) R = buildRoof(ring, bd.roof === 'gable' ? 'hip' : 'gable', pitch, ov, maxRise);
        let H: P2[] | null = null;
        if (!R && (bd.k === 'house' || bd.k === 'church')) {
          H = convexHull(ring);
          R = H.length >= 3 ? buildRoof(H, 'hip', pitch, ov, maxRise) : null;
          if (!R) H = null;
        }
        return { R, H, ov };
      };
      const half = rc.dormers > 0 && bd.k === 'house';
      let res = tryRoof(half);
      if (half) {
        dplan = res.R && !res.H ? planDormers(res.R, ring, streets, cx, cz, seed, rc.dormers) : null;
        if (!dplan) res = tryRoof(false); // promised dormers that don't fit → an honest full-storey house
      }
      roofG = res.R;
      if (roofG) eave = Math.max(top - roofG.rise, floor0 + 2.5);
      if (roofG && res.H) {
        const Hr = res.H, pe = -roofG.lowH / res.ov, rise = roofG.rise, e0 = eave;
        hullTop = (x, z) => e0 + Math.min(rise, Math.max(0, hullInset(Hr, x, z)) * pe);
      }
    }
    const skillion = bd.roof === 'skillion' && !roofG;
    let skTop: ((x: number, z: number) => number) | null = null;
    if (skillion) {
      // single slope falling away from the longest wall
      let bl = 0, bi2 = 0;
      for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) (bl = l), (bi2 = i); }
      const p = ring[bi2], q = ring[(bi2 + 1) % ring.length];
      const inx = -(q[1] - p[1]) / bl, inz = (q[0] - p[0]) / bl;
      let dmax = 0;
      for (const v of ring) dmax = Math.max(dmax, (v[0] - p[0]) * inx + (v[1] - p[1]) * inz);
      const s = Math.min(0.25, 1.4 / Math.max(dmax, 1));
      eave = Math.max(top - dmax * s, floor0 + 2.3);
      const e0 = eave;
      skTop = (x, z) => e0 + (dmax - ((x - p[0]) * inx + (z - p[1]) * inz)) * s;
    }

    // walls (above the pilings for raised houses)
    const wallY0 = raise > 0 ? floor0 - 0.3 : base;
    b.setInfo(id, kindS, PART.wall, fo);
    b.setColor(facade);
    let deco: Deco | null = null;
    if (roofG) {
      walls(b, ring, base, wallY0, hullTop ?? eave, eave - base);
      emitRoof(b, roofG, eave, base, roofCol, bTrim, detail, facade, id, kindS, fo, rc.roofMat);
      if (detail) decorate(b, (deco = { ring, cx, cz, base, eave, fo, floor0, raise, id, kindS, roofMat: rc.roofMat, facade, roofCol, trim: bTrim, R: roofG, rc, seed, streets, colliders, rings }), dplan);
      if (detail && (rc.chimney === 1 || (rc.chimney === 0 && bd.k !== 'house' && bd.k !== 'shed' && bd.k !== 'church' && r3 > 0.4) || (rc.chimney === 2 && !roofG.gables.length))) {
        // brick chimney near the ridge
        const [px, ph, pz] = roofG.peak;
        const e0 = ring[0], e1 = ring[1];
        const ang = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]);
        const ox = (cx - px) * 0.25, oz = (cz - pz) * 0.25;
        b.setInfo(id, kindI, PART.trim, fo);
        b.setColor(lin(r5 < 0.5 ? 0x8e5040 : 0x8d8780));
        box(b, px + ox, pz + oz, ang, 0.9, 0.62, eave - 0.5, eave + ph + 0.85);
        b.setColor(lin(0x5a5550));
        box(b, px + ox, pz + oz, ang, 1.0, 0.72, eave + ph + 0.85, eave + ph + 0.97);
      }
      if (bd.k === 'church') {
        // steeple: a square tower at one end of the ridge, capped with a green spire —
        // churches should read as churches from blocks away (and in the coarse ring)
        let bl = 0, bi2 = 0;
        for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) (bl = l), (bi2 = i); }
        const p = ring[bi2], q = ring[(bi2 + 1) % ring.length];
        const ax = (q[0] - p[0]) / bl, az = (q[1] - p[1]) / bl;
        let u1 = -Infinity, v1 = 0;
        for (const v of ring) {
          u1 = Math.max(u1, (v[0] - cx) * ax + (v[1] - cz) * az);
          v1 = Math.max(v1, Math.abs((v[0] - cx) * -az + (v[1] - cz) * ax));
        }
        const ts = Math.min(4.5, v1 * 2 * 0.55);
        const tcx = cx + ax * (u1 - ts / 2), tcz = cz + az * (u1 - ts / 2);
        const ang = Math.atan2(az, ax);
        b.setInfo(id, kindI, PART.wall, fo);
        b.setColor(facade);
        box(b, tcx, tcz, ang, ts, ts, base, eave + roofG.rise + 4);
        b.setInfo(id, kindI, PART.roof, ROOFMAT.metal); // weathered copper spire
        b.setColor(lin(0x5d6b58));
        cone(b, tcx, tcz, ts * 0.72, 4, eave + roofG.rise + 4, eave + roofG.rise + 12, ang + Math.PI / 4);
      }
    } else if (skTop) {
      walls(b, ring, base, wallY0, skTop, eave - base);
      b.setInfo(id, kindI, PART.roof, rc.roofMat === ROOFMAT.tile ? ROOFMAT.metal : rc.roofMat);
      b.setColor(roofCol);
      const st = skTop;
      flatCap(b, ring, (x, z) => st(x, z) + 0.02);
    } else {
      // Flat roof: walls rise a little past the roof deck to read as a parapet.
      walls(b, ring, base, wallY0, top + 0.45, top - base);
      b.setInfo(id, kindI, PART.roof, 0);
      b.setColor(roofCol);
      flatCap(b, ring, top);
      if (detail) decorateFlat(b, ring, top, id, kindI, bTrim, (bd.k === 'commercial' || bd.k === 'large') && hash01(seed ^ 0xc0c0) < 0.65);
      if (detail && (bd.k === 'large' || bd.k === 'commercial')) {
        const n = 1 + Math.floor(r3 * 3);
        b.setInfo(id, kindI, PART.trim, 0);
        b.setColor(lin(0xb5b3ad));
        for (let i = 0; i < n; i++) {
          const t = hash01(seed + i * 7919);
          const p = ring[Math.floor(t * ring.length)];
          box(b, cx + (p[0] - cx) * 0.4, cz + (p[1] - cz) * 0.4, 0, 1.6 + t, 1.2, top, top + 1.1);
        }
      }
    }
    const wallTop = roofG || skTop ? eave : top;
    // foundation plinth (not under pilings — those stand on their own posts)
    if (detail && raise === 0 && bd.k !== 'shed') plinth(b, ring, base, Math.min(floor0 - 0.03, base + 1.4), id, kindI, lin(rc.siding === SIDING.brick ? 0x8a6a5a : [0xb3aea3, 0xa8a398, 0x9c968b][Math.floor(r5 * 3)]));

    // pilings, floor underside, and sometimes a lattice skirt
    const lattice = raise > 0 && r5 < 0.3;
    if (raise > 0 && inZone) {
      b.setInfo(id, kindI, PART.trim, fo);
      b.setColor(lin(0x5f5448));
      flatCap(b, ring, floor0 - 0.3, DOWN);
      b.setColor(lin(0xb3a690));
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const k = Math.max(1, Math.ceil(L / 2.6));
        const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
        for (let j = 0; j < k; j++) {
          const t = j / k;
          const inx = -(q[1] - p[1]) / L * 0.12, inz = (q[0] - p[0]) / L * 0.12;
          const x = p[0] + (q[0] - p[0]) * t + inx, z = p[1] + (q[1] - p[1]) * t + inz;
          box(b, x, z, ang, 0.28, 0.28, base, floor0 - 0.3);
          if (detail) pilings.push({ x, z, ang });
        }
        if (lattice) {
          colliders.walls.push([p, q, -Infinity, floor0 - 0.6]);
          b.setInfo(id, kindI, PART.lattice, fo);
          b.setColor(lin(0xe8e2d4));
          const n = V((q[1] - p[1]) / L, 0, -(q[0] - p[0]) / L);
          b.quad(V(p[0], base, p[1]), V(q[0], base, q[1]), V(q[0], floor0 - 0.3, q[1]), V(p[0], floor0 - 0.3, p[1]), n, [0, 0, L, 1], [L, 0, L, 1], [L, fo, L, 1], [0, fo, L, 1]);
          b.setInfo(id, kindI, PART.trim, fo);
          b.setColor(lin(0xb3a690));
        }
      }
    }

    const fp: Footprint = { ring, base, top: wallTop, floor0, raise, name: bd.n, addr: bd.ad, kind: bd.k, eave: wallTop - base, seed: r1, id, pitched: !!roofG };
    if (inZone) footprints.push(fp);
    if (inSlice && !bd.lod && bd.k !== 'shed' && inZone) {
      const wall = pickDoorWall(ring, seed, bd.k, streets, entrances);
      if (wall) {
        const C: Ctx = { b, col: colliders, streets, rings, world, signs, mail: mailboxes, walks };
        const B: BInfo = { ring, base, floor0, raise, eave: wallTop, kind: bd.k, seed, id, fo, roofCol, roofMat: rc.roofMat === ROOFMAT.tile ? ROOFMAT.metal : rc.roofMat, addr: bd.ad, name: bd.n, bi: footprints.length - 1 };
        const porch = bd.k === 'house' && raise === 0 && r2 < 0.5 && porchFits(C, B, wall);
        const d = buildEntrance(C, B, wall, porch);
        if (deco && rc.chimney === 2) sideChimney(b, deco, wall.i);
        if (rc.bay && !porch && raise === 0) bayWindow(C, B, wall, rc, kindS, facade, roofCol, bTrim);
        fp.door = doors.length;
        doors.push(d);
      }
    }
  });

  // Lighthouses mapped only as points (e.g. Sandy Hook) + explicit skyline landmarks.
  const sh = new Builder();
  const haveLighthouse = (x: number, z: number) => json.buildings.some((bd) => bd.k === 'lighthouse' && Math.abs(bd.r[0] / 10 - x) < 150 && Math.abs(bd.r[1] / 10 - z) < 150);
  const pointLights = json.points.filter((p) => p.c === 'lighthouse' && p.own !== 0).map((p) => ({ x: p.x, z: p.z, h: 29 }));
  [...pointLights, ...(json.landmarks ?? []).map((l) => ({ x: l.x, z: l.z, h: l.h }))].forEach((lm, k) => {
    if (haveLighthouse(lm.x, lm.z)) return;
    const base = Math.max(terrain.heightAt(lm.x, lm.z), 2);
    lighthouseTower(sh, lm.x, lm.z, 3.5, base, lm.h, lin(0xf2efe8), 1e6 + k, 8);
    lanterns.push(V(lm.x, base + lm.h + 1.5, lm.z));
  });
  if (sh.pos.length) chunks.set('landmarks', sh);

  const material = buildingMaterial();
  const group = new THREE.Group();
  group.name = 'buildings';
  for (const b of chunks.values()) {
    if (!b.pos.length) continue;
    const m = new THREE.Mesh(b.geometry(), material);
    m.layers.enable(1);
    group.add(m);
  }
  return { group, footprints, ctxRings, lanterns, material, doors, colliders, signs, mailboxes, walks, pilings };
}

// The building you're visiting: its door stands open and its windows become real openings (a short
// world-anchored wash driven by uOpenAmt once you're within ~8 m and its interior is built).
export const activeBuilding = {
  uActiveId: { value: -1 },
  uOpenAmt: { value: 0 },
  uOpenDoor: { value: new THREE.Vector4(0, -999, 0, 0) }, // wall centre x, sill y, z, half width
  uOpenDoorH: { value: 2.2 },
  // Region window vocabulary (styles.ts): x = code (0 N.American sash, 1 European casement,
  // 2 Mediterranean shuttered, 3 Nordic, 4 deep-set small), y = share of houses with shutters.
  uWinStyle: { value: new THREE.Vector4(0, 0.45, 0, 0) },
};

// Window layout shared by the facade and the interior walls so the openings line up exactly.
export const GLSL_WINDOWS = /* glsl */ `
struct Win { float cu, cy, ww, wh, cellW, floorH, fv, fi, h1, h2; bool store, ok, arch; };
Win windowAt(float u, float v, float len, float eave, float seed, float kind, float fo, vec3 N) {
  Win w;
  bool dorm = len > 500.0; // dormer fronts carry len + 1000: always glazed (no random blank)
  if (dorm) len -= 1000.0;
  bool shop = kind > 1.5 && kind < 2.5;
  bool church = kind > 3.5 && kind < 4.5; // tall round-headed lancets, one tier
  w.arch = church;
  w.floorH = shop ? 3.8 : (kind > 2.5 && kind < 3.5 ? 3.1 : church ? 60.0 : 2.9);
  float vf = v - fo;
  w.ok = kind < 4.5 && len > 2.0 && vf > 0.0 && v < eave - 0.25;
  w.fi = floor(max(vf, 0.0) / w.floorH);
  w.fv = vf - w.fi * w.floorH;
  w.store = shop && w.fi < 0.5;
  float spacing = w.store ? 3.4 : (kind > 2.5 && kind < 3.5 ? 2.2 : church ? 3.4 : 2.7);
  float nWin = max(1.0, floor((len - 0.6) / spacing));
  w.cellW = len / nWin;
  float ci = floor(u / w.cellW);
  w.cu = u - (ci + 0.5) * w.cellW;
  w.ww = w.store ? w.cellW * 0.78 : church ? min(1.1, w.cellW * 0.4) : min(1.0, w.cellW * 0.5);
  float sill = w.store ? 0.45 : 0.9;
  w.wh = w.store ? 2.3 : church ? clamp(eave - fo - sill - 0.35, 1.2, 3.4) : 1.35;
  w.cy = w.fv - (sill + w.wh * 0.5);
  vec2 qn = floor(N.xz * 8.0 + 0.5);
  w.h1 = hash12(vec2(ci * 1.37 + seed * 911.0 + qn.x * 7.0, w.fi * 3.1 + qn.y * 5.0));
  w.h2 = hash12(vec2(ci * 2.11 + seed * 173.0 - qn.y * 3.0, w.fi * 1.7 + qn.x * 11.0));
  if (!w.store && !dorm && w.h1 < 0.14) w.ok = false;
  if (!w.store && w.fi * w.floorH + sill + w.wh > eave - fo - 0.12) w.ok = false; // would cut the eave
  return w;
}
// Round-headed (church) windows: 1 inside the arch cap shrunk by inset, else 1 everywhere.
float archIn(Win w, float cu, float cy, float inset) {
  if (!w.arch) return 1.0;
  float r = w.ww * 0.5 - inset, c = w.wh * 0.5 - w.ww * 0.5;
  return cy <= c ? 1.0 : step(length(vec2(cu, cy - c)), r);
}
float seedOf(float id) { return hash12(vec2(id * 0.0137 + 0.31, id * 0.0071 + 7.7)); }
// anti-aliased box: 1 inside |x| < h, filtered over a pixel footprint w
float aab(float x, float h, float w) { return clamp((h - abs(x)) / max(w, 1e-4) + 0.5, 0.0, 1.0); }
`;

export function buildingMaterial() {
  return paintMaterial({
    uniforms: { uWindowColor: { value: lin(0xffc27a) }, ...activeBuilding },
    vertex: /* glsl */ `
      attribute vec4 aWall;
      attribute vec4 aInfo;
      attribute vec3 color;
      attribute vec2 aTan;
      varying vec4 vWall;
      flat varying vec4 vInfo;
      varying vec3 vColor;
      flat varying vec2 vTan;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vWall = aWall; vInfo = aInfo; vColor = color; vTan = aTan;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uWindowColor;
      uniform float uActiveId, uOpenAmt, uOpenDoorH;
      uniform vec4 uWinStyle;
      uniform vec4 uOpenDoor;
      varying vec4 vWall;
      flat varying vec4 vInfo;
      varying vec3 vColor;
      flat varying vec2 vTan;
      ${GLSL_WINDOWS}

      // Interior mapping: ray-trace a box room behind each window pane (no geometry).
      // Room space: x along the wall (centred on the window cell), y up from the floor, z into the building.
      vec3 room(vec3 T, vec3 N, float cu, float fv, float cellW, float floorH, float rh, float rh2, float lit, bool store) {
        vec3 V = normalize(vWorldPos - (cameraPosition + uWorldOffset));
        vec3 d = vec3(dot(V, T), V.y, max(-dot(V, N), 0.04));
        float hw = cellW * 0.5;
        float depth = store ? 7.0 : 3.0 + rh * 2.5;
        vec3 o = vec3(cu, fv, 0.0);
        float dx = abs(d.x) > 1e-4 ? d.x : 1e-4;
        float tx = (sign(dx) * hw - o.x) / dx;
        float ty = d.y > 0.0 ? (floorH - o.y) / max(d.y, 1e-4) : -o.y / min(d.y, -1e-4);
        float tz = depth / d.z;
        float t = min(tx, min(ty, tz));
        vec3 p = o + d * t;
        vec3 wallC = mix(mix(vec3(0.88, 0.82, 0.7), vec3(0.64, 0.74, 0.76), step(0.5, rh)), vec3(0.8, 0.68, 0.66), step(0.8, rh));
        vec3 floorC = mix(vec3(0.46, 0.33, 0.22), vec3(0.62, 0.6, 0.56), step(0.6, rh2));
        vec3 c;
        if (t == tz) {
          c = wallC;
          if (store) {
            float row = fract(p.y / 0.55);
            vec3 goods = mix(vec3(0.75, 0.3, 0.25), vec3(0.3, 0.5, 0.7), hash12(floor(vec2(p.x * 2.5, p.y / 0.55))));
            if (p.y < 2.2) c = row < 0.12 ? vec3(0.35, 0.3, 0.26) : goods;
          } else {
            float fx = (rh - 0.5) * hw * 0.7;
            if (p.y < 0.85 && abs(p.x - fx) < hw * 0.55) c = mix(vec3(0.35, 0.42, 0.55), vec3(0.55, 0.38, 0.3), step(0.5, rh2)) * (p.y > 0.55 ? 1.0 : 0.8);
            if (p.y > 1.35 && p.y < 1.9 && abs(p.x + fx * 0.8) < 0.32) c = abs(p.x + fx * 0.8) > 0.26 || p.y < 1.4 || p.y > 1.85 ? vec3(0.25, 0.2, 0.15) : vec3(0.5, 0.65, 0.75);
          }
          float px = (rh2 - 0.5) * hw * 1.2;
          if (rh2 < 0.35 || (store && rh2 < 0.6)) {
            float body = step(abs(p.x - px), 0.2) * step(p.y, 1.42) * step(0.0, p.y);
            float head = step(length(vec2(p.x - px, p.y - 1.6)), 0.13);
            c = mix(c, vec3(0.16, 0.14, 0.16), max(body, head));
          }
        } else if (t == ty) c = d.y > 0.0 ? vec3(0.93, 0.91, 0.86) : floorC;
        else c = wallC * 0.8;
        float fall = 1.0 - clamp(p.z / depth, 0.0, 1.0) * 0.5;
        vec3 dayL = uAmbSky * 0.6 + uKeyColor * 0.1;
        float lampSpot = smoothstep(2.5, 0.0, length(vec2(p.x, p.z - depth * 0.4)));
        vec3 L = dayL * (1.0 - uNight * 0.9) + uWindowColor * lit * (1.1 + 0.9 * lampSpot);
        return c * L * fall;
      }

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 alb = vColor;
        float id = vInfo.x, kind = vInfo.y, part = vInfo.z, fo = vInfo.w;
        float seed = seedOf(id);
        float glow = 0.0;
        float ao = 1.0;
        float winMask = 0.0;
        vec3 winCol = vec3(0.0);
        bool visiting = abs(id - uActiveId) < 0.5;
        // World-anchored wash (not a screen-space dither): the opening dissolves like wet
        // paint lifting, and the pattern can't crawl as the camera moves. uOpenAmt only sits
        // between 0 and 1 for the ~0.3 s transition (interiors.update hysteresis).
        bool cut = visiting && uOpenAmt > 0.04 + 0.92 * vnoise3(vWorldPos * 2.2);
        if (cut && part < 2.5 && abs(N.y) < 0.5) {
          vec2 dd = vWorldPos.xz - uOpenDoor.xz;
          if (length(dd) < uOpenDoor.w + 0.03 && vWorldPos.y > uOpenDoor.y - 0.05 && vWorldPos.y < uOpenDoor.y + uOpenDoorH) discard;
        }
        vec3 trimCol = vec3(0.9, 0.88, 0.84);
        if (part < 0.5) {
          float u = vWall.x, v = vWall.y, lenRaw = vWall.z, eave = vWall.w;
          float len = lenRaw > 500.0 ? lenRaw - 1000.0 : lenRaw;
          vec2 fw = max(fwidth(vWall.xy), vec2(1e-4));
          float fine = 1.0 - smoothstep(0.04, 0.12, fw.y);
          ao = mix(0.62, 1.0, smoothstep(0.0, 2.2, v));
          bool tower = kind > 4.5;
          bool house = kind < 0.5;
          // siding material (recipe.ts SIDING, carried in the fraction of kind). Every pattern
          // fades to its average before it can alias — lines only where they span pixels.
          float sid = floor(fract(kind + 0.001) * 10.0 + 0.5);
          float fineX = 1.0 - smoothstep(0.04, 0.12, fw.x);
          if (sid < 0.5) {
            // clapboard: a shadow line under every lapped board, boards subtly unequal
            float bi = floor(v / 0.19), bf = fract(v / 0.19);
            alb *= 1.0 - 0.13 * (1.0 - smoothstep(0.0, 0.07, bf)) * fine;
            alb *= 1.0 + (hash12(vec2(bi, seed * 31.0)) - 0.5) * 0.05 * fine;
          } else if (sid < 1.5) {
            // cedar shingle: staggered courses, uneven widths, weathered tone per shingle
            float ci2 = floor(v / 0.15), cf = fract(v / 0.15);
            float xs = u / (0.2 + 0.1 * hash12(vec2(ci2, 3.1))) + hash12(vec2(ci2, 7.7)) * 5.0;
            float si = floor(xs);
            alb *= 1.0 + (hash12(vec2(si, ci2 + seed * 13.0)) - 0.5) * 0.16 * fine;
            alb *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.1, cf)) * fine;
            alb *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.06, fract(xs))) * fine * fineX;
          } else if (sid < 2.5) {
            // brick: running bond, mortar joints, per-brick tone; lighter average far away
            float fineB = 1.0 - smoothstep(0.012, 0.03, max(fw.x, fw.y));
            float row = floor(v / 0.075);
            float bx = u / 0.215 + 0.5 * mod(row, 2.0);
            float mortar = max(1.0 - smoothstep(0.0, 0.14, fract(v / 0.075)), 1.0 - smoothstep(0.0, 0.05, fract(bx)));
            alb *= 1.0 + (hash12(vec2(floor(bx), row + seed * 7.0)) - 0.5) * 0.2 * fineB;
            alb = mix(alb, vec3(0.72, 0.69, 0.64), mortar * 0.55 * fineB + 0.12 * (1.0 - fineB));
          } else if (sid < 3.5) {
            // stucco / render: soft trowel mottling, no lines
            alb *= 0.95 + 0.07 * vnoise(vec2(u, v) * 1.3) + 0.03 * vnoise(vec2(u, v) * 7.0) * fine;
          } else {
            // board and batten: raised battens every 0.42 m catch light on one edge
            float bb = fract(u / 0.42);
            float batten = aab(bb - 0.5, 0.045, fw.x / 0.42);
            alb *= 1.0 + 0.06 * batten * fineX - 0.07 * (1.0 - smoothstep(0.0, 0.03, abs(bb - 0.56))) * fineX;
            alb *= 1.0 + (hash12(vec2(floor(u / 0.42), seed)) - 0.5) * 0.04;
          }
          // foundation / rim band below the ground floor
          if (v < fo - 0.02 && !tower) {
            alb = mix(vec3(0.63, 0.61, 0.57), vec3(0.56, 0.51, 0.47), step(0.5, seed));
            float blk = max(step(0.93, fract(v / 0.2)), step(0.95, fract(u / 0.4 + step(0.5, fract(v / 0.4)) * 0.5)));
            alb *= 1.0 - 0.14 * blk * fine;
          }
          Win W = windowAt(u, v, lenRaw, eave, seed, kind, fo, N);
          if (W.ok) {
            // ---- the window asset (painted, low-frequency; details fade before they alias) ----
            float day = 1.0 - uNight;
            float lit = step(W.h2, W.store ? max(uWindowLit * 1.3, day * 0.85) : uWindowLit);
            float hw = W.ww * 0.5, hh = W.wh * 0.5;
            float gw = hw - 0.08, gh = hh - 0.08; // glass half-size — interiors cut this exact hole
            float lod = smoothstep(0.1, 0.4, max(fw.x, fw.y));
            float far = smoothstep(0.35 * W.cellW, 1.2 * W.cellW, fw.x);
            float nearW = 1.0 - far;
            float fineL = 1.0 - smoothstep(0.012, 0.03, max(fw.x, fw.y)); // thin bars: gone before they shimmer
            float frameM = aab(W.cu, hw, fw.x) * aab(W.cy, hh, fw.y) * archIn(W, W.cu, W.cy, 0.0);
            float innerM = aab(W.cu, gw, fw.x) * aab(W.cy, gh, fw.y) * archIn(W, W.cu, W.cy, 0.08);
            // head (drip cap wider than the casing) + sill (a ledge that catches light) + the
            // soft shadow the sill throws down the siding — the three strokes that make it read 3D
            float headM = W.arch ? 0.0 : aab(W.cu, hw + 0.07, fw.x) * aab(W.cy - hh - 0.055, 0.055, fw.y);
            float sillM = aab(W.cu, hw + 0.09, fw.x) * aab(W.cy + hh + 0.035, 0.035, fw.y);
            float sillSh = aab(W.cu, hw + 0.07, fw.x) * smoothstep(-hh - 0.36, -hh - 0.07, W.cy) * step(W.cy, -hh - 0.07);
            float headSh = aab(W.cu, hw + 0.05, fw.x) * smoothstep(hh + 0.02, hh - 0.14, W.cy) * step(hh - 0.14, W.cy) * (1.0 - headM);
            alb *= 1.0 - 0.2 * sillSh * nearW;
            float wcode = floor(uWinStyle.x + 0.5);
            if (house && seed < uWinStyle.y && !W.arch) {
              // panel shutters: flat colour + two recessed panels + a contact shadow on the wall
              float sw = min(hw * 0.62, 0.42);
              float sx = abs(W.cu) - (hw + 0.045 + sw * 0.5);
              float shm = aab(sx, sw * 0.5, fw.x) * aab(W.cy, hh, fw.y);
              float castM = aab(sx, sw * 0.5 + 0.05, fw.x) * aab(W.cy + 0.03, hh + 0.05, fw.y);
              float pan = aab(sx, sw * 0.5 - 0.065, fw.x) * (aab(W.cy - hh * 0.5, hh * 0.5 - 0.075, fw.y) + aab(W.cy + hh * 0.5, hh * 0.5 - 0.075, fw.y));
              vec3 shc = seed < 0.12 ? vec3(0.16, 0.26, 0.2) : seed < 0.22 ? vec3(0.17, 0.22, 0.34) : seed < 0.32 ? vec3(0.14, 0.14, 0.15) : seed < 0.38 ? vec3(0.46, 0.18, 0.15) : vec3(0.86, 0.86, 0.83);
              if (wcode > 1.5 && wcode < 2.5) { float q = fract(seed * 5.31); shc = q < 0.35 ? vec3(0.2, 0.36, 0.24) : q < 0.6 ? vec3(0.24, 0.36, 0.48) : q < 0.8 ? vec3(0.22, 0.4, 0.4) : vec3(0.42, 0.3, 0.2); }
              shc *= 1.0 - 0.14 * pan * smoothstep(0.0, 1.0, 1.0 - smoothstep(0.02, 0.05, fw.x));
              alb = mix(alb, alb * 0.8, max(castM - shm, 0.0) * nearW);
              alb = mix(alb, shc, shm * nearW);
            }
            alb = mix(alb, trimCol, (frameM - innerM) * nearW);
            alb = mix(alb, trimCol * 1.04, max(headM, sillM) * nearW);
            alb *= 1.0 - 0.18 * headSh * nearW * (1.0 - frameM + innerM);
            // sash bars: meeting rail + muntins by building style (6/6, 2/2, 1/1); storefronts get
            // a transom bar and mullions; church lancets get leading
            float ms = fract(seed * 7.13 + 0.3);
            // sash vocabulary by region: N.American double-hung (6/6, 2/2, 1/1); European and
            // Mediterranean casements (two leaves + a transom); Nordic 2×2 lights; deep-set plain
            float cols = W.store ? max(1.0, floor(2.0 * gw / 1.3 + 0.5)) : wcode > 3.5 ? 1.0 : wcode > 0.5 ? 2.0 : house ? (ms < 0.4 ? 3.0 : ms < 0.7 ? 2.0 : 1.0) : (ms < 0.5 ? 2.0 : 1.0);
            float rows = W.store ? 1.0 : wcode < 0.5 && house && ms < 0.4 ? 2.0 : 1.0;
            float cw = 2.0 * gw / cols;
            float px = (W.cu + gw) / cw, kx = floor(px + 0.5);
            float barX = step(0.5, kx) * step(kx, cols - 0.5) * aab((px - kx) * cw, W.store ? 0.03 : 0.016, fw.x);
            float sashH = gh / rows;
            float py = abs(W.cy) / sashH, ky = floor(py + 0.5);
            float barY = W.store ? 0.0 : step(0.5, ky) * step(ky, rows - 0.5) * aab((py - ky) * sashH, 0.016, fw.y);
            float rail = W.store ? aab(W.cy - (gh - 0.5), 0.03, fw.y) : W.arch ? aab(W.cy - (gh - gw), 0.02, fw.y)
              : wcode > 3.5 ? 0.0 : wcode > 0.5 && wcode < 2.5 ? aab(W.cy - gh * 0.42, 0.03, fw.y) : aab(W.cy, 0.028, fw.y);
            if (W.arch) barY = aab(fract((W.cy + gh) / 0.45) * 0.45 - 0.225, 0.012, fw.y) * 0.8;
            float barM = clamp(max(max(barX, barY) * (W.store ? 1.0 : fineL), rail * (1.0 - smoothstep(0.02, 0.06, fw.y))), 0.0, 1.0) * innerM;
            // the pulled-down shade (lived-in): top fraction of the glass, cream, glows at night
            float shadeF = (house || kind > 2.5) && !W.arch ? step(0.66, W.h1) * (0.14 + 0.36 * fract(W.h1 * 7.31)) : 0.0;
            float shadeM = shadeF > 0.0 ? clamp((W.cy - (gh - 2.0 * gh * shadeF)) / max(fw.y, 1e-4) + 0.5, 0.0, 1.0) * innerM * (1.0 - barM) : 0.0;
            vec3 shadeCol = mix(vec3(0.93, 0.9, 0.82), vec3(0.84, 0.86, 0.8), step(0.7, W.h2));
            alb = mix(alb, trimCol, barM * nearW);
            alb = mix(alb, shadeCol * (0.92 + 0.08 * step(0.02, fract(W.cy * 4.0)) * fineL), shadeM * nearW);
            glow += shadeM * lit * 0.55 * nearW;
            // Real room behind: see straight in through the sash bars — but only at the windows
            // you're actually near (per-window distance, washed edge). From the street the visited
            // house keeps its glass like its neighbours; from indoors the facade is back-facing
            // anyway, so the interior wall's own hole is what you look through.
            if (innerM > 0.5 && barM < 0.5 && cut) {
              float wd = 0.0;
              if (dot(vTan, vTan) > 0.5) {
                vec3 Tw = normalize(vec3(vTan.x, 0.0, vTan.y));
                vec3 wc = vWorldPos - Tw * W.cu - vec3(0.0, W.cy, 0.0);
                wd = length(wc - (cameraPosition + uWorldOffset));
              }
              if (wd < 4.2 + 1.6 * vnoise3(vWorldPos * 2.2)) discard;
            }
            float glassM = innerM * (1.0 - barM) * (1.0 - shadeM) * nearW;
            if (glassM > 0.001) {
              float gx = W.cu / max(gw, 0.05), gy = W.cy / max(gh, 0.05); // -1..1 across the pane
              vec3 V = normalize(vWorldPos - (cameraPosition + uWorldOffset));
              float fr = 0.22 + 0.55 * pow(1.0 - abs(dot(V, N)), 3.0);
              // deep blue-grey glass body; the room shows through it muted, only up close
              vec3 body = mix(vec3(0.1, 0.12, 0.17), vec3(0.14, 0.16, 0.21), W.h1);
              vec3 inside = body;
              if (lod < 0.999 && dot(vTan, vTan) > 0.5) {
                vec3 T = normalize(vec3(vTan.x, 0.0, vTan.y));
                float h3 = hash12(vec2(W.h1 * 31.0, W.h2 * 17.0));
                vec3 rc = room(T, N, W.cu, W.fv, W.cellW, W.floorH, W.h1, h3, lit, W.store);
                // rooms read darker than the street in daylight — that's what makes glass read as glass
                inside = mix(body, rc * mix(1.0, 0.5, day), (W.store ? 0.42 : 0.4) * (1.0 - lod));
              }
              // sky in the glass (darker overhead, paler low) + one soft diagonal sheen stroke
              vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(0.45 + 0.35 * gy, 0.0, 1.0));
              float sheen = smoothstep(0.32, 0.0, abs(gx * 0.75 + gy * 0.65 - 0.2 + (W.h2 - 0.5) * 0.5)) * (0.55 + 0.45 * fineL);
              vec3 glass = mix(inside, sky * 0.62, fr * (0.35 + 0.65 * day));
              glass += sheen * 0.07 * day * (0.4 + 0.6 * step(0.5, W.h2));
              if (W.arch) glass = mix(glass, mix(vec3(0.55, 0.2, 0.2), vec3(0.2, 0.32, 0.55), step(0.5, hash12(floor(vec2(W.cu / 0.3, W.cy / 0.45)) + seed))) * (0.4 + 0.6 * day), 0.45);
              // lamp light: a daytime shop's lights barely show through the glare; at night they carry
              glass += uWindowColor * lit * (0.05 + 1.15 * uNight) * (1.0 - fr * 0.4);
              // recess: the reveal shades the top and sides of the pane
              float rev = smoothstep(0.72, 1.0, gy) + 0.45 * smoothstep(0.84, 1.0, abs(gx));
              glass *= 1.0 - (wcode > 3.5 ? 0.55 : 0.32) * clamp(rev, 0.0, 1.0) * day;
              winCol = glass;
              winMask = glassM;
            }
            // far away: the cell's average instead of sub-pixel panes
            float cover = (W.ww * W.wh) / (W.cellW * W.floorH);
            alb = mix(alb, mix(alb, vec3(0.2, 0.22, 0.26), min(1.0, cover * 1.3)), far);
            glow += far * cover * mix(lit, uWindowLit * 0.86, smoothstep(1.2 * W.cellW, 3.0 * W.cellW, fw.x)) * 1.8;
            if (W.store && W.fv > 0.45 + W.wh + 0.15 && W.fv < 0.45 + W.wh + 0.75) {
              vec3 aw = mix(vec3(0.62, 0.16, 0.14), vec3(0.95, 0.93, 0.88), step(0.5, fract(u / 0.5)));
              if (seed > 0.5) aw = mix(vec3(0.12, 0.35, 0.42), vec3(0.95, 0.93, 0.88), step(0.5, fract(u / 0.5)));
              alb = mix(alb, aw, 1.0 - far * 0.5);
            }
          }
          // small attic window in the gable: casing, four lights, a sill
          if (!tower && v > eave + 0.4 && v < eave + 1.6) {
            float au = u - len * 0.5, av = v - (eave + 1.0);
            float fineA = 1.0 - smoothstep(0.012, 0.03, max(fw.x, fw.y));
            float aw = aab(au, 0.4, fw.x) * aab(av, 0.5, fw.y);
            float ai = aab(au, 0.31, fw.x) * aab(av, 0.41, fw.y);
            float asill = aab(au, 0.47, fw.x) * aab(av + 0.53, 0.035, fw.y);
            float abar = max(aab(au, 0.018, fw.x), aab(av, 0.018, fw.y)) * fineA * ai;
            alb = mix(alb, trimCol, max(max(aw - ai, asill), abar));
            vec3 ag = mix(vec3(0.14, 0.17, 0.22), mix(uSkyHorizon, uSkyZenith, 0.5) * 0.7, 0.35 * (1.0 - uNight));
            alb = mix(alb, ag, ai * (1.0 - abar));
            glow += ai * (1.0 - abar) * step(hash12(vec2(seed * 97.0, N.x)), uWindowLit * 0.6);
          }
          if (!tower) {
            float trim = max(aab(u - 0.09, 0.09, fw.x), aab(len - u - 0.09, 0.09, fw.x));
            alb = mix(alb, trimCol, trim);
            alb = mix(alb, trimCol, aab(v - (eave - 0.125), 0.125, fw.y)); // frieze board
          } else {
            alb *= 0.9 + 0.1 * step(0.5, fract(v / 0.6));
            float slit = step(abs(fract(u / max(len, 0.1)) - 0.5), 0.06) * step(0.6, fract(v / 5.0)) * step(fract(v / 5.0), 0.85);
            alb = mix(alb, vec3(0.1), slit);
          }
        } else if (part < 1.5) {
          // roof material (recipe.ts ROOFMAT, carried in vInfo.w on roof faces). Coordinates:
          // a runs along the eave, height y runs up the slope — courses are level lines.
          float rm = floor(fo + 0.5);
          vec2 ed = normalize(vec2(-N.z, N.x) + vec2(1e-5, 0.0));
          float a = dot(vWorldPos.xz, ed), y = vWorldPos.y;
          float fy = fwidth(y), fa = fwidth(a);
          float weather = 0.88 + 0.24 * fbm(vWorldPos.xz * 0.35);
          if (N.y > 0.96) {
            // flat roof: membrane seams + gravel speckle
            alb *= 0.93 + 0.08 * vnoise(vWorldPos.xz * 2.5) - 0.06 * (1.0 - smoothstep(0.0, 0.03, fract(dot(vWorldPos.xz, vec2(0.0, 1.0)) / 0.95))) * (1.0 - smoothstep(0.02, 0.06, fy + fa));
          } else if (rm < 0.5 || rm > 3.5) {
            // asphalt (or cedar shake when rm = 4): staggered courses, tab joints, tone per tab
            float ch = rm > 3.5 ? 0.2 : 0.145, tw = rm > 3.5 ? 0.25 : 0.34;
            float fineR = 1.0 - smoothstep(ch * 0.12, ch * 0.4, fy);
            float ci3 = floor(y / ch);
            float ta = a / tw + hash12(vec2(ci3, 1.7)) * 3.0;
            float shade = 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.16, fract(y / ch))) * fineR;
            shade *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.05, fract(ta))) * fineR * (1.0 - smoothstep(0.02, 0.08, fa));
            alb *= shade * (1.0 + (hash12(vec2(floor(ta), ci3)) - 0.5) * (rm > 3.5 ? 0.22 : 0.12) * fineR);
            alb *= weather;
          } else if (rm < 1.5) {
            // standing-seam metal: bright seam ribs every 0.45 m, low weathering
            float fineS = 1.0 - smoothstep(0.03, 0.1, fa);
            float rib = 1.0 - smoothstep(0.0, 0.035, abs(fract(a / 0.45) - 0.5) * 0.45);
            alb *= (1.0 + 0.14 * rib * fineS) * (0.95 + 0.1 * fbm(vWorldPos.xz * 0.2));
          } else if (rm < 2.5) {
            // clay barrel tile: rounded channels along the slope, course shadows, warm variation
            float fineT = 1.0 - smoothstep(0.03, 0.09, max(fa, fy));
            float ch2 = abs(sin(a / 0.26 * 3.14159));
            float ci4 = floor(y / 0.3);
            alb *= mix(1.0, 0.78 + 0.3 * ch2, fineT);
            alb *= 1.0 - 0.15 * (1.0 - smoothstep(0.0, 0.14, fract(y / 0.3))) * fineT;
            alb *= 1.0 + (hash12(vec2(floor(a / 0.26), ci4)) - 0.5) * 0.14 * fineT;
            alb *= 0.93 + 0.14 * fbm(vWorldPos.xz * 0.3);
          } else {
            // slate: small staggered courses, strong per-slate tone variation (blue-grey)
            float fineL2 = 1.0 - smoothstep(0.02, 0.07, max(fa, fy));
            float ci5 = floor(y / 0.17);
            float sa = a / 0.3 + 0.5 * mod(ci5, 2.0);
            alb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.15, fract(y / 0.17))) * fineL2;
            alb *= 1.0 + (hash12(vec2(floor(sa), ci5)) - 0.5) * 0.2 * fineL2;
            alb *= 0.95 + 0.1 * fbm(vWorldPos.xz * 0.3);
          }
        } else if (part < 2.5) {
          ao = 0.85;
        } else if (part < 3.5) {
          glow = 1.2 * uNight + 0.15;
        } else if (part < 4.5) {
          // lattice skirt under a raised house
          vec2 fw = fwidth(vWall.xy);
          float a = fract((vWall.x + vWall.y) * 2.6), b = fract((vWall.x - vWall.y) * 2.6);
          if (max(fw.x, fw.y) < 0.06 && a > 0.24 && b > 0.24) discard;
          ao = 0.8;
        } else {
          // railing: top rail, bottom rail, balusters
          float u = vWall.x, v = vWall.y, h = vWall.w;
          vec2 fw = fwidth(vWall.xy);
          bool solid = v > h - 0.08 || v < 0.07 || fract(u / 0.13) < 0.36;
          if (!solid && max(fw.x, fw.y) < 0.05) discard;
          if (!solid) alb *= 0.8;
        }
        alb = pigment(alb, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, sh, ao);
        col += glow * uWindowColor * (0.15 + 1.25 * uNight);
        col = mix(col, winCol, winMask);
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}
