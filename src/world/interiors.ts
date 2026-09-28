// Enterable buildings. Every building with a door gets a deterministic floor plan at startup (storeys, stair
// flights with real stairwell openings, partition walls with doorways) that works on any footprint shape, so
// collision is right everywhere; the actual interior meshes — walls with real window openings, floors,
// ceilings, stairs with treads/risers/balusters, furniture by room, lamps, residents — are generated on
// demand for the building you walk up to, and dropped when you leave.
import * as THREE from 'three';
import * as D from '../assets/decor';
import { useOf } from './uses';
import type { Footprint, Door } from './buildings';
import { activeBuilding, floorHeight, GLSL_WINDOWS, KIND } from './buildings';
import type { WalkWorld } from '../player/collision';
import { paintMaterial, lin, U, HOLE_MAX } from '../render/shared';
import { makeRng, type Rng } from '../core/rng';
import { pedGeo, creatureMaterial } from '../sim/life';

type P2 = [number, number];
export interface Flight { u0: number; u1: number; v0: number; v1: number; bottomU: number; topU: number; level: number }
export interface Plan {
  fp: string;
  door: Door;
  cx: number; cz: number; ux: number; uz: number; vx: number; vz: number; L: number; W: number;
  loc: P2[]; // the footprint in the local (u, v) frame
  floor0: number; floorH: number; levels: number; ceilTop: number;
  flights: Flight[];
  parts: { u: number; segs: { lo: number; hi: number; gap: number }[] }[]; // cross walls at u, a doorway per segment
  ud: number; vd: number; // door (wall centre) in local coords
}

const inPoly = (u: number, v: number, poly: P2[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > v !== zj > v && u < ((xj - xi) * (v - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const segX = (a: P2, b: P2, c: P2, d: P2) => {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
  const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

// Geometry queries on a local-frame polygon.
export class LocalPoly {
  constructor(readonly p: P2[]) {}
  // v-intervals of the polygon along the line u = const
  spans(u: number): [number, number][] {
    const xs: number[] = [];
    const p = this.p;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [ua, va] = p[j], [ub, vb] = p[i];
      if ((ua <= u) !== (ub <= u)) xs.push(va + ((u - ua) / (ub - ua)) * (vb - va));
    }
    xs.sort((a, b) => a - b);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
    return out;
  }
  // the interval containing vRef, intersected over u in [ua, ub]
  span(ua: number, ub: number, vRef: number): [number, number] | null {
    let lo = -Infinity, hi = Infinity;
    for (let k = 0; k <= 4; k++) {
      const u = ua + ((ub - ua) * k) / 4;
      const s = this.spans(u).find(([a, b]) => vRef >= a && vRef <= b);
      if (!s) return null;
      lo = Math.max(lo, s[0]);
      hi = Math.min(hi, s[1]);
    }
    return hi > lo ? [lo, hi] : null;
  }
  // axis-aligned rectangle fully inside (margin m from the outline)
  rectIn(u0: number, u1: number, v0: number, v1: number, m = 0.1) {
    u0 -= m; u1 += m; v0 -= m; v1 += m;
    const c: P2[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const q of c) if (!inPoly(q[0], q[1], this.p)) return false;
    if (!inPoly((u0 + u1) / 2, (v0 + v1) / 2, this.p)) return false;
    for (const q of this.p) if (q[0] > u0 && q[0] < u1 && q[1] > v0 && q[1] < v1) return false;
    for (let i = 0, j = this.p.length - 1; i < this.p.length; j = i++)
      for (let k = 0; k < 4; k++) if (segX(this.p[j], this.p[i], c[k], c[(k + 1) % 4])) return false;
    return true;
  }
}

export function planInterior(fpKey: string, fp: Footprint, door: Door, seed: number): Plan {
  const ring = fp.ring;
  let bi = 0, bl = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l > bl) (bl = l), (bi = i);
  }
  const p = ring[bi], q = ring[(bi + 1) % ring.length];
  const ux = (q[0] - p[0]) / bl, uz = (q[1] - p[1]) / bl, vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const r of ring) {
    const u = (r[0] - p[0]) * ux + (r[1] - p[1]) * uz, v = (r[0] - p[0]) * vx + (r[1] - p[1]) * vz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const cx = p[0] + ux * um + vx * vm, cz = p[1] + uz * um + vz * vm;
  const L = u1 - u0, W = v1 - v0;
  const toL = (x: number, z: number): P2 => [(x - cx) * ux + (z - cz) * uz, (x - cx) * vx + (z - cz) * vz];
  const loc = ring.map(([x, z]) => toL(x, z));
  const LP = new LocalPoly(loc);
  const kind = fp.kind;
  const floorH = floorHeight(kind);
  const floor0 = fp.floor0;
  const topY = fp.top;
  // walk-up floors only: a tower's upper storeys are behind the lift doors (and would be a
  // hundred stair flights of geometry)
  let levels = kind === 'church' ? 1 : Math.max(1, Math.min(4, Math.floor((topY - floor0 + 0.2) / floorH)));
  const [ud, vd] = toL(door.wx, door.wz);
  const rng = makeRng(seed ^ 0x51ed);

  // Stair slots: straight runs hugging a long wall, with a landing at each end, clear of the front door.
  const run = floorH / 0.62, sw = 1.0;
  type Slot = { u0: number; u1: number; v0: number; v1: number; bottomU: number; topU: number; score: number };
  const cands: Slot[] = [];
  if (levels > 1) {
    for (let a = -L / 2 + 0.25; a + run <= L / 2 - 0.25; a += 0.3) {
      for (const [lo, hi] of LP.spans(a + run / 2)) {
        if (hi - lo < 2.6) continue;
        for (const side of [1, -1]) {
          const sp = LP.span(a - 1.0, a + run + 1.0, (lo + hi) / 2);
          if (!sp || sp[1] - sp[0] < 2.4) continue;
          const sv0 = side > 0 ? sp[1] - 0.18 - sw : sp[0] + 0.18, sv1 = sv0 + sw;
          if (!LP.rectIn(a - 1.0, a + run + 1.0, sv0, sv1, 0.02)) continue;
          if (a - 1.3 < ud + 1.2 && a + run + 1.3 > ud - 1.2 && sv0 - 0.5 < vd + 1.4 && sv1 + 0.5 > vd - 1.4) continue;
          for (const dir of [1, -1]) {
            const bottomU = dir > 0 ? a : a + run;
            const land = bottomU - dir * 0.6;
            const score = Math.abs(Math.hypot(land - ud, (sv0 + sv1) / 2 - vd) - 4) * 0.25 + rng.float() * 0.8;
            cands.push({ u0: a, u1: a + run, v0: sv0, v1: sv1, bottomU, topU: dir > 0 ? a + run : a, score });
          }
        }
      }
    }
    cands.sort((x, y) => x.score - y.score);
  }
  const A = cands[0] ?? null;
  const B = A ? cands.find((c) => c.u0 > A.u1 + 0.8 || c.u1 < A.u0 - 0.8 || c.v0 > A.v1 + 0.8 || c.v1 < A.v0 - 0.8) ?? null : null;
  if (!A) levels = 1;
  else if (!B) levels = Math.min(levels, 2);
  const flights: Flight[] = [];
  for (let k = 0; k + 1 < levels; k++) {
    const s = (k % 2 ? B : A)!;
    flights.push({ u0: s.u0, u1: s.u1, v0: s.v0, v1: s.v1, bottomU: s.bottomU, topU: s.topU, level: k });
  }
  const ceilTop = kind === 'church' ? topY - 0.1 : Math.min(topY - 0.05, floor0 + levels * floorH);

  // Cross walls with a doorway in each segment (none in shops' ground floor or the church). A
  // long bar, café or restaurant is a customer room with back-of-house behind a wall, not a
  // ballroom: over 20 m, one or two cross walls (the shader paints three rooms a storey at most).
  const parts: Plan['parts'] = [];
  const use0 = useOf(fp.name, fp.use);
  const foodDrink = kind === 'commercial' && /^(bar|cafe|restaurant|unknown)$/.test(use0);
  // A big floorplate is never one hall: an office, a civic building or an apartment block's
  // ground floor is a lobby at the door with rooms off it every ~10 m (a store stays an open
  // floor of shelving aisles; a bar or café a customer room with back-of-house behind it).
  const bigFloor = L > 22 && L * W > 450;
  const bays = Math.max(2, Math.min(7, Math.round(L / 10)));
  const n = kind === 'church' ? 1
    : kind === 'commercial' ? (foodDrink && L > 20 ? (L > 34 ? 3 : 2) : bigFloor && (use0 === 'office' || use0 === 'civic') ? bays : 1)
      : bigFloor ? Math.max(3, bays) : L > 13 ? 3 : L > 7.5 ? 2 : 1;
  if (n > 1) {
    const clear = (s: number) => !flights.some((f) => s > f.u0 - 1.2 && s < f.u1 + 1.2) && Math.abs(s - ud) >= 1.3;
    for (let j = 1; j < n; j++) {
      const s0 = -L / 2 + (j / n) * L + rng.range(-0.7, 0.7);
      // (a big floor's wall steps aside for the stairs or the door rather than leaving a hall)
      const s = bigFloor ? [0, 1.8, -1.8, 3.6, -3.6].map((o) => s0 + o).find((q) => clear(q) && Math.abs(q) < L / 2 - 2.5 && !parts.some((p) => Math.abs(p.u - q) < 3)) : clear(s0) ? s0 : undefined;
      if (s === undefined) continue;
      const segs: { lo: number; hi: number; gap: number }[] = [];
      for (const [lo, hi] of LP.spans(s)) if (hi - lo > 1.8) segs.push({ lo, hi, gap: rng.range(lo + 0.75, hi - 0.75) });
      if (segs.length) parts.push({ u: s, segs });
    }
  }
  return { fp: fpKey, door, cx, cz, ux, uz, vx, vz, L, W, loc, floor0, floorH, levels, ceilTop, flights, parts, ud, vd };
}

const toW = (P: Plan, u: number, v: number): P2 => [P.cx + P.ux * u + P.vx * v, P.cz + P.uz * u + P.vz * v];

// Permanent collision / walk surfaces for a plan: doorway, storeys with stairwell openings, partitions, stairs.
export function registerPlan(walk: WalkWorld, fp: Footprint, P: Plan) {
  const d = P.door;
  const f = (k: number) => P.floor0 + k * P.floorH;
  const holes = P.flights.map((F) => ({ level: F.level + 1, ring: [toW(P, F.u0, F.v0), toW(P, F.u1, F.v0), toW(P, F.u1, F.v1), toW(P, F.u0, F.v1)] }));
  const raised = fp.raise > 0.5;
  const pid = walk.addPolygon(fp.ring, { floor0: P.floor0, floorH: P.floorH, levels: P.levels, holes, ground: raised }, { x: d.wx, z: d.wz, w: d.w }, raised ? P.floor0 - 0.6 : -Infinity);
  const y0 = P.floor0 - 0.5;
  for (const pt of P.parts)
    for (const s of pt.segs) {
      walk.addWall(toW(P, pt.u, s.lo), toW(P, pt.u, s.gap - 0.5), y0);
      walk.addWall(toW(P, pt.u, s.gap + 0.5), toW(P, pt.u, s.hi), y0);
    }
  for (const F of P.flights) {
    const run = Math.abs(F.topU - F.bottomU), vc = (F.v0 + F.v1) / 2, base = f(F.level), up = f(F.level + 1);
    walk.addDeck({ pts: [toW(P, F.bottomU, vc), toW(P, F.topU, vc)], cum: [0, run], halfWidth: (F.v1 - F.v0) / 2 - 0.05, heightAt: (s) => base + (Math.min(run, Math.max(0, s)) / run) * P.floorH, profile: { k: 'ramp', y0: base, y1: base + P.floorH, total: run } });
    // sides (banister + wall): block both the hallway below and the landing above
    walk.addWall(toW(P, F.u0, F.v0), toW(P, F.u1, F.v0), base - 0.4, up + 0.6);
    walk.addWall(toW(P, F.u0, F.v1), toW(P, F.u1, F.v1), base - 0.4, up + 0.6);
    // bottom end: open below, a rail upstairs (don't fall into the stairwell)
    walk.addWall(toW(P, F.bottomU, F.v0), toW(P, F.bottomU, F.v1), up - 0.4, up + 0.6);
    // top end: open upstairs, solid below (you can't walk under the high end)
    walk.addWall(toW(P, F.topU, F.v0), toW(P, F.topU, F.v1), base - 0.4, base + 1.3);
  }
  return pid;
}

// ---------------- on-demand interior meshes ----------------
// part ids for the interior shader
const IP = { wall: 0, floor: 1, ceil: 2, solid: 3, glow: 4, art: 5, part: 6, fabric: 7, rug: 8, porcelain: 9, glass: 10, wood: 11, rail: 12 } as const;

class Mesher {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; wall: number[] = []; info: number[] = []; out: number[] = [];
  private c = [1, 1, 1];
  private inf = [0, 0, 3, 0];
  private o2 = [0, 0];
  color(hex: number | THREE.Color) { const c = typeof hex === 'number' ? new THREE.Color(hex) : hex; this.c = [c.r, c.g, c.b]; return this; }
  part(p: number) { this.inf = [this.inf[0], this.inf[1], p, this.inf[3]]; return this; }
  setInfo(id: number, kind: number, fo: number) { this.inf = [id, kind, this.inf[2], fo]; }
  private v(p: THREE.Vector3, n: THREE.Vector3, w: number[]) {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.col.push(this.c[0], this.c[1], this.c[2]);
    this.wall.push(w[0], w[1], w[2], w[3]); this.info.push(this.inf[0], this.inf[1], this.inf[2], this.inf[3]); this.out.push(this.o2[0], this.o2[1]);
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, wa = Z4, wb = Z4, wc = Z4) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const d = (uy * vz - uz * vy) * n.x + (uz * vx - ux * vz) * n.y + (ux * vy - uy * vx) * n.z;
    if (d < 0) { this.v(a, n, wa); this.v(c, n, wc); this.v(b, n, wb); } else { this.v(a, n, wa); this.v(b, n, wb); this.v(c, n, wc); }
  }
  /** A triangle with its own smooth vertex normals (foundry furniture). */
  triN(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = na.x + nb.x + nc.x, ny = na.y + nb.y + nc.y, nz = na.z + nb.z + nc.z;
    const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (d < 0) { this.v(a, na, Z4); this.v(c, nc, Z4); this.v(b, nb, Z4); } else { this.v(a, na, Z4); this.v(b, nb, Z4); this.v(c, nc, Z4); }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, w?: number[][]) {
    this.tri(a, b, c, n, w?.[0], w?.[1], w?.[2]);
    this.tri(a, c, d, n, w?.[0], w?.[2], w?.[3]);
  }
  setOut(x: number, z: number) { this.o2 = [x, z]; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWall', new THREE.Float32BufferAttribute(this.wall, 4));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setAttribute('aOut', new THREE.Float32BufferAttribute(this.out, 2));
    g.computeBoundingSphere();
    return g;
  }
}
const Z4 = [0, 0, 0, 0];

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const WALL_PAINT = [0xefe6d2, 0xdfe8e4, 0xe9dccb, 0xd6e1ea, 0xf2ead9, 0xe6d5d2, 0xdde3cf, 0xf4f0e6, 0xcfe0dc, 0xe8dcc0, 0xd9d2e4];
const WOOD = [0x8a6242, 0xa07a52, 0x6f4b33, 0xb89468, 0x9c7a5a];
const FABRIC = [0x5b7fa6, 0xa65a44, 0x6e8c5a, 0xd9c7a0, 0x7a5b8c, 0x3f6f78, 0xc9a24b, 0x8f8f96, 0xc97b6b, 0x4f6d8f];
const PORCELAIN = 0xf4f3ef;

interface Room { u0: number; u1: number; role: string; level: number; slab: number }
interface Light { x: number; y: number; z: number; w: number }

export class Interiors {
  readonly group = new THREE.Group();
  private active: string | null = null;
  private mesh: THREE.Object3D | null = null;
  private timer = 0;
  private doorGrid = new Map<number, string[]>();
  private plans = new Map<string, Plan>();
  private fps = new Map<string, Footprint>();
  readonly lightsU = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) };
  readonly frameU = { value: new THREE.Vector4() }; // cx, cz, ux, uz
  readonly levelsU = { value: new THREE.Vector4() }; // floor0, floorH, door x, door z
  readonly dimsU = { value: new THREE.Vector2(6, 4) }; // half length, half width of the footprint frame
  readonly doorU = { value: new THREE.Vector4() }; // door y, half width, height, -
  readonly cutsU = { value: new THREE.Vector4() }; // cuts 1–4 between a storey's rooms (along u)
  readonly cuts2U = { value: new THREE.Vector4() }; // cuts 5–6, the room count, -
  // (8 storeys × 7 rooms: a big floor is a lobby and rooms off it, each its own paint and floor)
  readonly roomAU = { value: Array.from({ length: 56 }, () => new THREE.Vector4(0.9, 0.88, 0.82, 0)) }; // wall rgb, style
  readonly roomBU = { value: Array.from({ length: 56 }, () => new THREE.Vector4(0.5, 0.36, 0.24, 0)) }; // floor rgb, type
  readonly fabU = { value: new THREE.Color() };
  private mat: THREE.ShaderMaterial;
  private npcMat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1 });
  // residents in chairs, on sofas, in booths and on bar stools sit (INDOOR: they don't leave at dusk)
  private npcSeatMat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, SEATED: 1, INDOOR: 1 });
  private npcGeo = pedGeo();
  private lights: Light[] = [];
  private failed = new Set<string>();
  private pending: { fi: string; gen: Generator<void, THREE.Object3D, void> } | null = null;
  private openAmt = 0;
  private opened = false; // hysteresis state for the facade openings (see update)
  indoors = false;
  onStairs = false;

  constructor(private walk: WalkWorld) {
    this.group.name = 'interiors';
    this.mat = interiorMaterial(this);
    this.npcGeo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(NPC_MAX * 3), 3));
  }

  // Tile streaming registers each enterable footprint under a unique key ("tile:idx"); unloading a tile
  // drops its plans without disturbing the rest of the world.
  register(key: string, fp: Footprint, plan: Plan, walkPid: number) {
    this.plans.set(key, plan);
    this.fps.set(key, fp);
    this.walkIds.set(key, walkPid);
    const k = Math.floor(plan.door.x / 25) * 92821 + Math.floor(plan.door.z / 25);
    let l = this.doorGrid.get(k);
    if (!l) this.doorGrid.set(k, (l = []));
    l.push(key);
  }
  unregister(keys: Iterable<string>) {
    for (const key of keys) {
      this.plans.delete(key);
      this.fps.delete(key);
      this.walkIds.delete(key);
      this.failed.delete(key);
    }
    for (const l of this.doorGrid.values()) {
      for (let i = l.length - 1; i >= 0; i--) if (!this.plans.has(l[i])) l.splice(i, 1);
    }
    if (this.active !== null && !this.plans.has(this.active)) this.activate(null);
  }

  update(x: number, z: number, dt: number, feet = 0) {
    this.pump();
    const inside = this.walk.interiorAt(x, z, feet);
    this.indoors = inside >= 0 && inside === this.walkId(this.active);
    // Windows + door become real openings as you come close. This used to track distance
    // continuously (7–14 m) — standing at mid range left the facade permanently half-cut
    // in a screen-space dither that crawled as you moved (the "sill/door flicker"), and it
    // opened onto nothing while the sliced interior build was still pending. Now: a
    // hysteresis switch (open < 8 m, close > 10 m), only once the interior mesh exists,
    // and a short time-based wash (~0.3 s, world-anchored noise in the facade shader).
    const afp = this.active !== null ? this.fps.get(this.active) : undefined;
    if (afp && !this.pending && this.mesh) {
      const d = this.indoors ? 0 : ringDist(afp.ring, x, z);
      this.opened = d < (this.opened ? 10 : 8);
    } else this.opened = false;
    const want = this.opened ? 1 : 0;
    this.openAmt += Math.max(-dt * 3.5, Math.min(dt * 3.5, want - this.openAmt));
    activeBuilding.uOpenAmt.value = this.openAmt < 0.02 ? 0 : this.openAmt > 0.98 ? 1 : this.openAmt;
    const P = this.active !== null ? this.plans.get(this.active) : undefined;
    if (P && this.indoors) {
      const lv = (feet - P.floor0) / P.floorH;
      this.onStairs = Math.abs(lv - Math.round(lv)) > 0.06;
    } else this.onStairs = false;
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.2;
    this.pickLights(x, feet + 1.4, z);
    let target: string | null = null;
    if (inside >= 0) {
      for (const [fi] of this.plans) if (this.walkId(fi) === inside) { target = fi; break; }
    }
    // An opened (or still-closing) house keeps the focus until its wash has run out —
    // switching mid-open used to snap its windows and door shut in one frame.
    if (target === null && this.active !== null && this.openAmt > 0.001) return;
    if (target === null) {
      let best = 16;
      const gx = Math.floor(x / 25), gz = Math.floor(z / 25);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const fi of this.doorGrid.get((gx + a) * 92821 + gz + b) ?? []) {
            const d = this.plans.get(fi)!.door;
            const dist = Math.hypot(d.x - x, d.z - z) - (fi === this.active ? 3 : 0);
            if (dist < best) (best = dist), (target = fi);
          }
    }
    if (target !== this.active && !(target !== null && this.failed.has(target))) this.activate(target);
  }

  get activeIndex() { return this.active; }
  get activePlan() { return this.active !== null ? this.plans.get(this.active) ?? null : null; }
  fpOf(key: string | null) { return key !== null ? this.fps.get(key) : undefined; }
  planOf(key: string | null) { return key !== null ? this.plans.get(key) : undefined; }
  private walkIds = new Map<string, number>();
  private walkId(fi: string | null) { return fi !== null ? this.walkIds.get(fi) ?? -2 : -2; }

  private pickLights(x: number, y: number, z: number) {
    const ls = this.lights.slice().sort((a, b) => (a.x - x) ** 2 + ((a.y - y) * 2.5) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + ((b.y - y) * 2.5) ** 2 + (b.z - z) ** 2));
    for (let i = 0; i < 8; i++) {
      const l = ls[i];
      this.lightsU.value[i].set(l?.x ?? 0, l?.y ?? -999, l?.z ?? 0, l?.w ?? 0);
    }
  }

  // Build (or drop) a building's interior right now — used to compile the interior shaders during loading.
  prime(fi: string | null) { this.activate(fi, true); }

  // Interior builds are sliced across frames: activation lands instantly (collision, door and
  // window uniforms go live, the old interior drops) while a pending generator assembles the
  // new mesh over ~3.5 ms/frame slices — the approach walk (target picks ~16 m out) hides it.
  private pump(budget = 3.5) {
    const p = this.pending;
    if (!p) return;
    const t0 = performance.now();
    try {
      let r = p.gen.next();
      while (!r.done && performance.now() - t0 < budget) r = p.gen.next();
      if (!r.done) return;
      this.mesh = r.value;
      this.group.add(this.mesh);
    } catch (e) {
      console.warn('interior build failed', p.fi, e);
      this.failed.add(p.fi);
      this.mesh = null;
      this.pending = null;
      this.activate(null); // restore terrain cut + door/active uniforms
      return;
    }
    this.pending = null;
  }

  // Drain any pending build right now — shots capture after the 0.2 s target loop and must
  // not fire while the interior is still assembling.
  flush() { while (this.pending) this.pump(Infinity); }

  private activate(fi: string | null, sync = false) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g && g !== this.npcGeo) g.dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      this.mesh = null;
    }
    this.pending = null;
    this.active = fi;
    this.lights = [];
    this.openAmt = 0;
    this.opened = false;
    U.uHoleInfo.value.z = 0;
    if (fi === null) {
      activeBuilding.uActiveId.value = -1;
      return;
    }
    const P = this.plans.get(fi), fp = this.fps.get(fi);
    if (!P || !fp) {
      this.failed.add(fi);
      this.activate(null);
      return;
    }
    if (fp.raise < 0.5) {
      // cut the terrain away inside the footprint (it may stand proud of the floor on a slope)
      const step = Math.ceil(fp.ring.length / HOLE_MAX);
      const pts = fp.ring.filter((_, i) => i % step === 0);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      pts.forEach(([x, z], i) => { U.uHolePts.value[i].set(x, z); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); });
      U.uHoleBox.value.set(x0, z0, x1, z1);
      U.uHoleInfo.value.set(pts.length, P.floor0 + 1.2, 1, 0);
    }
    activeBuilding.uActiveId.value = fp.id;
    activeBuilding.uOpenDoor.value.set(P.door.wx, P.door.y, P.door.wz, P.door.w / 2);
    activeBuilding.uOpenDoorH.value = P.door.h;
    try {
      if (sync) {
        this.mesh = this.build(P, fp);
        this.group.add(this.mesh);
      } else this.pending = { fi, gen: this.buildGen(P, fp) };
    } catch (e) {
      console.warn('interior build failed', fi, e);
      this.failed.add(fi);
      this.mesh = null;
    }
  }

  private build(P: Plan, fp: Footprint): THREE.Object3D {
    const g = this.buildGen(P, fp);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }

  private *buildGen(P: Plan, fp: Footprint): Generator<void, THREE.Object3D, void> {
    const rng = makeRng(Math.floor(fp.seed * 1e9) ^ 0x1234);
    const m = new Mesher();
    const kind = KIND[fp.kind as keyof typeof KIND] ?? 0;
    const fo = fp.floor0 - fp.base;
    m.setInfo(fp.id, kind, fo);
    const LP = new LocalPoly(P.loc);
    const ring = fp.ring;
    const s = ringSign(ring);
    const f0 = P.floor0, fH = P.floorH, top = P.ceilTop;
    const fl = (k: number) => f0 + k * fH;
    this.frameU.value.set(P.cx, P.cz, P.ux, P.uz);
    this.dimsU.value.set(P.L / 2, P.W / 2);
    this.levelsU.value.set(f0, P.levels > 1 ? fH : top - f0, P.door.wx, P.door.wz);
    this.doorU.value.set(P.door.y, P.door.w / 2, P.door.h, 0);
    this.fabU.value.set(FABRIC[Math.floor(rng.float() * FABRIC.length)]);

    // Walls: inner faces of the facade, inset a little; window panes are cut out in the shader.
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const on = V3((dz / len) * s, 0, (-dx / len) * s);
      const inn = on.clone().negate();
      const ins = 0.14;
      const a = V3(p[0] - on.x * ins, 0, p[1] - on.z * ins), b = V3(q[0] - on.x * ins, 0, q[1] - on.z * ins);
      m.setOut(on.x, on.z);
      m.part(IP.wall).color(0xffffff);
      const y0 = f0 - 0.02, y1 = top, eave = fp.eave, base = fp.base;
      m.quad(V3(a.x, y0, a.z), V3(b.x, y0, b.z), V3(b.x, y1, b.z), V3(a.x, y1, a.z), inn,
        [[0, y0 - base, len, eave], [len, y0 - base, len, eave], [len, y1 - base, len, eave], [0, y1 - base, len, eave]]);
    }
    m.setOut(0, 0);
    yield; // facade shell done

    // Floors and ceilings for each storey, with the stairwell openings cut out.
    const holeRing = (F: Flight) => [toW(P, F.u0, F.v0), toW(P, F.u1, F.v0), toW(P, F.u1, F.v1), toW(P, F.u0, F.v1)] as P2[];
    const ringFlat = (y: number, up: boolean, holes: P2[][], part: number) => {
      let idx: number[][];
      try {
        idx = THREE.ShapeUtils.triangulateShape(ring.map((r) => new THREE.Vector2(r[0], r[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
      } catch { idx = THREE.ShapeUtils.triangulateShape(ring.map((r) => new THREE.Vector2(r[0], r[1])), []); holes = []; }
      const pts = [...ring, ...holes.flat()];
      m.part(part).color(0xffffff);
      const n = V3(0, up ? 1 : -1, 0);
      for (const [i0, i1, i2] of idx) m.tri(V3(pts[i0][0], y, pts[i0][1]), V3(pts[i1][0], y, pts[i1][1]), V3(pts[i2][0], y, pts[i2][1]), n);
    };
    for (let k = 0; k < P.levels; k++) {
      ringFlat(fl(k) + 0.01, true, P.flights.filter((F) => F.level === k - 1).map(holeRing), IP.floor);
      const cy = k === P.levels - 1 ? top : fl(k + 1) - 0.02;
      ringFlat(cy, false, P.flights.filter((F) => F.level === k).map(holeRing), IP.ceil);
      yield; // one storey of slab+ceiling done
    }

    // Local-frame box (furniture, partitions, stairs).
    const box = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, hex: number | THREE.Color, part: number = IP.solid, bottom = false) => {
      if (u1 < u0) [u0, u1] = [u1, u0];
      if (v1 < v0) [v0, v1] = [v1, v0];
      m.part(part).color(hex);
      const c = [toW(P, u0, v0), toW(P, u1, v0), toW(P, u1, v1), toW(P, u0, v1)];
      const center = toW(P, (u0 + u1) / 2, (v0 + v1) / 2);
      for (let i = 0; i < 4; i++) {
        const A = c[i], B = c[(i + 1) % 4];
        const mid = V3((A[0] + B[0]) / 2 - center[0], 0, (A[1] + B[1]) / 2 - center[1]);
        m.quad(V3(A[0], y0, A[1]), V3(B[0], y0, B[1]), V3(B[0], y1, B[1]), V3(A[0], y1, A[1]), mid.normalize());
      }
      m.quad(V3(c[0][0], y1, c[0][1]), V3(c[1][0], y1, c[1][1]), V3(c[2][0], y1, c[2][1]), V3(c[3][0], y1, c[3][1]), V3(0, 1, 0));
      if (bottom) m.quad(V3(c[0][0], y0, c[0][1]), V3(c[1][0], y0, c[1][1]), V3(c[2][0], y0, c[2][1]), V3(c[3][0], y0, c[3][1]), V3(0, -1, 0));
    };
    // A flat quad lying in the local frame with (s,t) texture coords in aWall (rugs, art).
    const flatQuad = (u0: number, u1: number, v0: number, v1: number, y: number, hex: number, part: number, style: number) => {
      m.part(part).color(hex);
      const c = [toW(P, u0, v0), toW(P, u1, v0), toW(P, u1, v1), toW(P, u0, v1)];
      const L = u1 - u0, Wd = v1 - v0;
      m.quad(V3(c[0][0], y, c[0][1]), V3(c[1][0], y, c[1][1]), V3(c[2][0], y, c[2][1]), V3(c[3][0], y, c[3][1]), V3(0, 1, 0), [[0, 0, style, L], [1, 0, style, L], [1, 1, style, Wd], [0, 1, style, Wd]]);
    };
    // A picture on the wall at v = vw facing inward (side = which wall), centred at u, bottom y.
    const art = (u: number, vw: number, side: number, y: number, w: number, h: number, style: number) => {
      const frameC = rng.float() < 0.5 ? 0x3a2e24 : 0xe9e2d0;
      box(u - w / 2 - 0.05, u + w / 2 + 0.05, vw, vw - side * 0.035, y - 0.05, y + h + 0.05, frameC);
      const vv = vw - side * 0.04;
      const a = toW(P, u - w / 2, vv), b = toW(P, u + w / 2, vv);
      const n = V3(-side * P.vx, 0, -side * P.vz);
      m.part(IP.art).color(0xffffff);
      m.quad(V3(a[0], y, a[1]), V3(b[0], y, b[1]), V3(b[0], y + h, b[1]), V3(a[0], y + h, a[1]), n, [[0, 0, style, 1], [1, 0, style, 1], [1, 1, style, 1], [0, 1, style, 1]]);
    };
    // A railing panel (balusters via the shader) between two local points at height y.
    const rail = (ua: number, va: number, ub: number, vb: number, y: number, h: number, yb = y) => {
      const a = toW(P, ua, va), b = toW(P, ub, vb);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = V3(b[1] - a[1], 0, -(b[0] - a[0])).normalize();
      m.part(IP.rail).color(0xf4f1ea);
      const w = (u: number, v: number) => [u, v, L, h];
      m.quad(V3(a[0], y, a[1]), V3(b[0], yb, b[1]), V3(b[0], yb + h, b[1]), V3(a[0], y + h, a[1]), n, [w(0, 0), w(L, 0), w(L, h), w(0, h)]);
    };

    // ---- stairs: treads, risers, closed stringer panel, balusters + handrail; railing round the opening ----
    const treadC = WOOD[Math.floor(rng.float() * WOOD.length)];
    for (const F of P.flights) {
      const y = fl(F.level);
      const n = Math.round(fH / 0.19), rise = fH / n;
      const dir = Math.sign(F.topU - F.bottomU), run = Math.abs(F.topU - F.bottomU), tr = run / n;
      const open = F.v0 > 0 ? F.v0 : F.v1; // banister side (toward the room)
      const wallSide = F.v0 > 0 ? F.v1 : F.v0;
      for (let i = 0; i < n; i++) {
        const ua = F.bottomU + dir * i * tr, ub = ua + dir * tr;
        box(ua - dir * 0.03, ub, F.v0, F.v1, y + (i + 1) * rise - 0.045, y + (i + 1) * rise, treadC, IP.wood);
        box(ua, ua + dir * 0.025, F.v0 + 0.01, F.v1 - 0.01, y + i * rise, y + (i + 1) * rise - 0.045, 0xf2eee6);
      }
      // closed stringer panels down to the floor (the cupboard under the stairs)
      for (const vv of [open, wallSide]) {
        const a = toW(P, F.bottomU, vv), b = toW(P, F.topU, vv);
        const nn = V3(P.vx, 0, P.vz);
        m.part(IP.solid).color(0xefebe2);
        m.quad(V3(a[0], y, a[1]), V3(b[0], y, b[1]), V3(b[0], y + fH - 0.02, b[1]), V3(a[0], y + rise - 0.05, a[1]), nn);
        m.quad(V3(a[0], y, a[1]), V3(b[0], y, b[1]), V3(b[0], y + fH - 0.02, b[1]), V3(a[0], y + rise - 0.05, a[1]), nn.clone().negate());
      }
      // balusters + handrail on the open side, newel posts at both ends
      const ov = open + (F.v0 > 0 ? 0.04 : -0.04);
      for (let i = 0; i < n; i += 1) {
        const uc = F.bottomU + dir * (i + 0.5) * tr, yt = y + (i + 1) * rise;
        box(uc - 0.018, uc + 0.018, ov - 0.018, ov + 0.018, yt, yt + 0.86, 0xf4f1ea);
      }
      box(F.bottomU - 0.05, F.bottomU + 0.05, ov - 0.05, ov + 0.05, y, y + 1.05, treadC, IP.wood);
      box(F.topU - 0.05, F.topU + 0.05, ov - 0.05, ov + 0.05, y + fH - 0.1, y + fH + 1.0, treadC, IP.wood);
      {
        const a = toW(P, F.bottomU, ov), b = toW(P, F.topU, ov);
        const ya = y + rise + 0.88, yb = y + fH + 0.88;
        const d = V3(b[0] - a[0], yb - ya, b[1] - a[1]);
        const side = V3(-d.z, 0, d.x).normalize().multiplyScalar(0.035);
        const upn = new THREE.Vector3().crossVectors(d, side).normalize();
        if (upn.y < 0) upn.negate();
        m.part(IP.wood).color(treadC);
        m.quad(V3(a[0] - side.x, ya + 0.05, a[1] - side.z), V3(b[0] - side.x, yb + 0.05, b[1] - side.z), V3(b[0] + side.x, yb + 0.05, b[1] + side.z), V3(a[0] + side.x, ya + 0.05, a[1] + side.z), upn);
        for (const sg of [-1, 1]) m.quad(V3(a[0] + side.x * sg, ya - 0.02, a[1] + side.z * sg), V3(b[0] + side.x * sg, yb - 0.02, b[1] + side.z * sg), V3(b[0] + side.x * sg, yb + 0.05, b[1] + side.z * sg), V3(a[0] + side.x * sg, ya + 0.05, a[1] + side.z * sg), side.clone().multiplyScalar(sg).normalize());
      }
      // upstairs: a railing along the opening's open side and its bottom end
      const yu = fl(F.level + 1);
      rail(F.topU, ov, F.bottomU, ov, yu, 0.92);
      rail(F.bottomU, F.v0, F.bottomU, F.v1, yu, 0.92);
      box(F.bottomU - 0.05, F.bottomU + 0.05, ov - 0.05, ov + 0.05, yu, yu + 1.0, treadC, IP.wood);
      // stair-runner carpet on the treads (a strip of the room's fabric)
      if (rng.float() < 0.45) {
        const rc = FABRIC[Math.floor(rng.float() * FABRIC.length)];
        for (let i = 0; i < n; i++) {
          const ua = F.bottomU + dir * i * tr, ub = ua + dir * tr;
          const vm = (F.v0 + F.v1) / 2;
          box(ua - dir * 0.03, ub, vm - 0.33, vm + 0.33, y + (i + 1) * rise, y + (i + 1) * rise + 0.012, rc, IP.fabric);
        }
      }
      yield; // one staircase done
    }

    // ---- partitions with doorways, casings and a lintel, on every storey ----
    for (const pt of P.parts) {
      yield; // one partition wall's worth
      for (const sg of pt.segs)
        for (let k = 0; k < P.levels; k++) {
          const y = fl(k), yc = k === P.levels - 1 ? top : fl(k + 1);
          const lo = sg.lo + 0.1, hi = sg.hi - 0.1;
          box(pt.u - 0.06, pt.u + 0.06, lo, sg.gap - 0.5, y, yc, 0xffffff, IP.part);
          box(pt.u - 0.06, pt.u + 0.06, sg.gap + 0.5, hi, y, yc, 0xffffff, IP.part);
          box(pt.u - 0.06, pt.u + 0.06, sg.gap - 0.5, sg.gap + 0.5, y + 2.15, yc, 0xffffff, IP.part);
          box(pt.u - 0.08, pt.u + 0.08, sg.gap - 0.58, sg.gap - 0.5, y, y + 2.22, 0xf4f1ea);
          box(pt.u - 0.08, pt.u + 0.08, sg.gap + 0.5, sg.gap + 0.58, y, y + 2.22, 0xf4f1ea);
          box(pt.u - 0.08, pt.u + 0.08, sg.gap - 0.58, sg.gap + 0.58, y + 2.15, y + 2.25, 0xf4f1ea);
          box(pt.u - 0.08, pt.u + 0.08, lo, hi, y, y + 0.1, 0x7a6048); // baseboard
        }
    }

    // ---- the front door, standing open inward ----
    {
      const d = P.door;
      const tu = (d.wx - P.cx) * P.ux + (d.wz - P.cz) * P.uz, tv = (d.wx - P.cx) * P.vx + (d.wz - P.cz) * P.vz;
      // wall tangent in local coords: perpendicular to the door normal
      const nl: P2 = [d.nx * P.ux + d.nz * P.uz, d.nx * P.vx + d.nz * P.vz];
      const tl: P2 = [-nl[1], nl[0]];
      const hinge: P2 = [tu + tl[0] * (d.w / 2) - nl[0] * 0.16, tv + tl[1] * (d.w / 2) - nl[1] * 0.16];
      const tip: P2 = [hinge[0] - nl[0] * d.w, hinge[1] - nl[1] * d.w];
      const a = toW(P, hinge[0], hinge[1]), b = toW(P, tip[0], tip[1]);
      const nn = V3(b[1] - a[1], 0, -(b[0] - a[0])).normalize();
      m.part(IP.solid).color(d.col);
      for (const sg of [1, -1]) m.quad(V3(a[0], d.y, a[1]), V3(b[0], d.y, b[1]), V3(b[0], d.y + d.h - 0.02, b[1]), V3(a[0], d.y + d.h - 0.02, a[1]), nn.clone().multiplyScalar(sg));
      // the leaf reads as a door, not a slab: a shop door is mostly glass in a slim frame, any
      // other door has four raised panels a shade off its paint; a brass knob near the free edge
      const at = (s: number, y: number, off: number) => V3(a[0] + (b[0] - a[0]) * s + nn.x * off, y, a[1] + (b[1] - a[1]) * s + nn.z * off);
      const inset = (s0: number, s1: number, y0: number, y1: number, off: number) => {
        for (const sg of [1, -1]) m.quad(at(s0, y0, sg * off), at(s1, y0, sg * off), at(s1, y1, sg * off), at(s0, y1, sg * off), nn.clone().multiplyScalar(sg));
      };
      const fw = 0.1 / Math.max(0.5, d.w); // frame width as a fraction of the leaf
      if (d.kind === 'commercial') {
        m.part(IP.glass).color(0x9fb3bf);
        inset(fw, 1 - fw, d.y + 0.3, d.y + d.h - 0.14, 0.008);
        m.part(IP.solid).color(0xc9c4ba); // push bar across the glass
        inset(0.12, 0.88, d.y + 1.0, d.y + 1.05, 0.02);
      } else {
        m.part(IP.solid).color(new THREE.Color(d.col).multiplyScalar(0.68).getHex());
        for (const [s0, s1] of [[fw, 0.5 - fw / 2], [0.5 + fw / 2, 1 - fw]]) for (const [y0, y1] of [[0.18, 0.95], [1.15, d.h - 0.2]]) inset(s0, s1, d.y + y0, d.y + y1, 0.008);
        m.part(IP.solid).color(0xc9a74a);
        inset(0.86, 0.92, d.y + 0.95, d.y + 1.02, 0.03);
      }
      // doormat just inside
      const mat: P2 = [tu - nl[0] * 0.75, tv - nl[1] * 0.75];
      box(mat[0] - 0.4, mat[0] + 0.4, mat[1] - 0.3, mat[1] + 0.3, f0 + 0.01, f0 + 0.025, 0x6b5a45, IP.fabric);
    }

    // ---- rooms: slabs between the cross walls, roles by building type and storey ----
    const hl = P.L / 2 - 0.15;
    const cuts = [-hl, ...P.parts.map((p) => p.u).sort((a, b) => a - b), hl];
    const nSlab = cuts.length - 1;
    const rooms: Room[] = [];
    // the ground floor follows the business the map names (uses.ts); unnamed shops roll
    const use = fp.kind === 'commercial' ? useOf(fp.name, fp.use) : 'unknown';
    const ground = use === 'cafe' ? 'cafe' : use === 'bar' ? 'bar' : use === 'restaurant' ? 'diner' : use === 'office' || use === 'civic' ? 'office' : use === 'grocery' ? 'shop'
      : use === 'unknown' ? (rng.float() < 0.25 ? 'cafe' : rng.float() < 0.3 ? 'diner' : 'shop') : 'shop';
    const doorSlab = Math.max(0, cuts.findIndex((c, i) => i < nSlab && P.ud >= c - 0.6 && P.ud <= cuts[i + 1] + 0.6));
    for (let k = 0; k < P.levels; k++)
      for (let r = 0; r < nSlab; r++) {
        const u0 = cuts[r] + 0.1, u1 = cuts[r + 1] - 0.1;
        let role: string;
        const dist = Math.abs(r - doorSlab);
        if (fp.kind === 'church') role = 'church';
        else if (fp.kind === 'commercial') role = k === 0 ? (r === doorSlab ? (ground === 'office' && nSlab > 2 ? 'lobby' : ground) : dist === 1 && ground !== 'shop' && ground !== 'office' ? 'kitchen' : 'office') : rng.float() < 0.5 ? 'office' : 'living';
        // (an apartment block: the lobby at the door, flats off it and up the stairs)
        else if (fp.kind === 'large') role = k === 0 && (r === doorSlab || nSlab < 3) ? 'lobby' : ['living', 'bedroom', 'kitchen'][(r + k) % 3];
        else if (P.levels === 1) role = nSlab === 1 ? 'great' : r === doorSlab ? 'living' : ['kitchen', 'bedroom', 'bath', 'bedroom'][Math.min(3, dist - 1)];
        else if (k === 0) role = nSlab === 1 ? 'great' : r === doorSlab ? 'living' : dist === 1 ? 'kitchen' : 'dining';
        else role = r === nSlab - 1 && nSlab > 1 ? 'bath' : 'bedroom';
        rooms.push({ u0, u1, role, level: k, slab: r });
      }
    // per-room wall paint + wallpaper style and floor finish (the shader looks them up by slab and storey)
    this.cutsU.value.set(cuts[1] ?? 99, cuts[2] ?? 99, cuts[3] ?? 99, cuts[4] ?? 99);
    this.cuts2U.value.set(cuts[5] ?? 99, cuts[6] ?? 99, nSlab, 0);
    const col = new THREE.Color();
    for (const R of rooms) {
      const i = Math.min(7, R.level) * 7 + Math.min(6, R.slab);
      const paint = WALL_PAINT[Math.floor(rng.float() * WALL_PAINT.length)];
      const style = R.role === 'bath' || R.role === 'kitchen' ? 4 : R.role === 'church' || R.role === 'shop' || R.role === 'cafe' ? 5 : [0, 1, 1, 2, 3][Math.floor(rng.float() * 5)];
      col.set(paint);
      this.roomAU.value[i].set(col.r, col.g, col.b, style);
      const ft = R.role === 'bath' || R.role === 'kitchen' ? 1 : R.role === 'shop' || R.role === 'lobby' || R.role === 'office' ? 3 : R.role === 'bedroom' && rng.float() < 0.35 ? 2 : 0;
      const fc = ft === 1 ? [0xe8e4da, 0xd9e2e4, 0xefe9dc][Math.floor(rng.float() * 3)] : ft === 2 ? [0xb9ae9a, 0x9aa3a0, 0xa89080, 0x8d9aa8, 0xc4b8a2][Math.floor(rng.float() * 5)] : ft === 3 ? 0xcfc8b8 : WOOD[Math.floor(rng.float() * WOOD.length)];
      col.set(fc);
      this.roomBU.value[i].set(col.r, col.g, col.b, ft);
    }

    // Keep furniture off the stairs, out of doorways and the front door's swing.
    const blocked: [number, number, number, number, number][] = []; // u0 u1 v0 v1 level (-1 = all)
    for (const F of P.flights) {
      blocked.push([F.u0 - 0.3, F.u1 + 0.3, F.v0 - 0.3, F.v1 + 0.3, F.level]);
      blocked.push([F.u0 - 0.3, F.u1 + 0.3, F.v0 - 0.3, F.v1 + 0.3, F.level + 1]);
      const land = F.bottomU - Math.sign(F.topU - F.bottomU) * 0.6;
      blocked.push([land - 0.9, land + 0.9, F.v0 - 0.4, F.v1 + 0.4, F.level]);
      const landT = F.topU + Math.sign(F.topU - F.bottomU) * 0.6;
      blocked.push([landT - 0.9, landT + 0.9, F.v0 - 0.4, F.v1 + 0.4, F.level + 1]);
    }
    blocked.push([P.ud - 1.5, P.ud + 1.5, P.vd - 1.7, P.vd + 1.7, 0]);
    for (const pt of P.parts) for (const sg of pt.segs) blocked.push([pt.u - 1.0, pt.u + 1.0, sg.gap - 0.9, sg.gap + 0.9, -1]);
    const free = (u0: number, u1: number, v0: number, v1: number, level: number) => {
      if (!LP.rectIn(u0, u1, v0, v1, 0.1)) return false;
      for (const [a, b, c, d, l] of blocked) if ((l < 0 || l === level) && u0 < b && u1 > a && v0 < d && v1 > c) return false;
      return true;
    };
    const claim = (u0: number, u1: number, v0: number, v1: number, level: number) => blocked.push([u0, u1, v0, v1, level]);
    // The facade's window layout on the exterior wall behind (u0..u1, wallV): the same cell rule as the
    // shader (assuming every cell has a pane), so tall furniture, cabinets and pictures stay between windows.
    const winClear = (u0: number, u1: number, wallV: number) => {
      const a = toW(P, u0, wallV), b = toW(P, u1, wallV), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      let best = -1, bd = 0.6;
      for (let i = 0; i < ring.length; i++) {
        const [px, pz] = ring[i], [qx, qz] = ring[(i + 1) % ring.length];
        const dx = qx - px, dz = qz - pz, l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((mx - px) * dx + (mz - pz) * dz) / l2)) : 0;
        const d = Math.hypot(px + dx * t - mx, pz + dz * t - mz);
        if (d < bd) (bd = d), (best = i);
      }
      if (best < 0) return true;
      const [px, pz] = ring[best], [qx, qz] = ring[(best + 1) % ring.length];
      const len = Math.hypot(qx - px, qz - pz);
      if (len <= 2) return true;
      const ex = (qx - px) / len, ez = (qz - pz) / len;
      const e0 = Math.min((a[0] - px) * ex + (a[1] - pz) * ez, (b[0] - px) * ex + (b[1] - pz) * ez);
      const e1 = Math.max((a[0] - px) * ex + (a[1] - pz) * ez, (b[0] - px) * ex + (b[1] - pz) * ez);
      const nWin = Math.max(1, Math.floor((len - 0.6) / (fp.kind === 'large' ? 2.2 : 2.7)));
      const cellW = len / nWin, ww = Math.min(1.0, cellW * 0.5);
      for (let ci = 0; ci < nWin; ci++) {
        const wc = (ci + 0.5) * cellW;
        if (e0 < wc + ww / 2 + 0.1 && e1 > wc - ww / 2 - 0.1) return false;
      }
      return true;
    };
    // Against a long wall (side ±1 on v): returns the item rect and the wall's v. `tall` pieces avoid windows.
    type Put = (a: number, b: number, c: number, d: number, side: number, wallV: number) => void;
    const roomArea = (R: Room) => (R.u1 - R.u0) * LP.spans((R.u0 + R.u1) / 2).reduce((s, [a, b]) => s + b - a, 0);
    const place = (R: Room, lu: number, lv: number, side: number, rngl: Rng, fn: Put, tall = false) => {
      for (let t = 0; t < 12; t++) {
        const u = R.u0 + 0.2 + rngl.float() * Math.max(0, R.u1 - R.u0 - lu - 0.4);
        const s0 = LP.spans(u + lu / 2).find(([a, b]) => b - a > lv + 0.5);
        const sp = s0 ? LP.span(u, u + lu, (s0[0] + s0[1]) / 2) : null;
        if (sp) {
          const wallV = side > 0 ? sp[1] - 0.14 : sp[0] + 0.14;
          const v0 = side > 0 ? wallV - 0.04 - lv : wallV + 0.04;
          if (free(u, u + lu, v0, v0 + lv, R.level) && (!tall || winClear(u, u + lu, wallV))) {
            claim(u, u + lu, v0, v0 + lv, R.level);
            if (tall) tallSpots.push([u, u + lu, Math.min(v0, wallV), Math.max(v0 + lv, wallV), R.level]);
            fn(u, u + lu, v0, v0 + lv, side, wallV);
            return true;
          }
        }
        side = -side;
      }
      return false;
    };
    // Against one of the room's end walls (u0 or u1): the piece is `len` wide (along v) and `depth` deep.
    const placeEnd = (R: Room, len: number, depth: number, rngl: Rng, fn: (a: number, b: number, c: number, d: number, end: number) => void) => {
      for (let t = 0; t < 10; t++) {
        const end = rngl.float() < 0.5 ? -1 : 1;
        const a = end < 0 ? R.u0 + 0.06 : R.u1 - 0.06 - depth, b = a + depth;
        const spans = LP.spans((a + b) / 2).filter(([lo, hi]) => hi - lo > len + 0.6);
        if (!spans.length) continue;
        const [lo, hi] = spans[Math.floor(rngl.float() * spans.length)];
        const c = lo + 0.3 + rngl.float() * Math.max(0, hi - lo - len - 0.6);
        if (free(a, b, c, c + len, R.level)) { claim(a, b, c, c + len, R.level); fn(a, b, c, c + len, end); return true; }
      }
      return false;
    };
    const placeFree = (R: Room, lu: number, lv: number, rngl: Rng, fn: (a: number, b: number, c: number, d: number) => void) => {
      for (let t = 0; t < 12; t++) {
        const u = R.u0 + 0.3 + rngl.float() * Math.max(0, R.u1 - R.u0 - lu - 0.6);
        const spans = LP.spans(u + lu / 2).filter(([a, b]) => b - a > lv + 1.0);
        if (!spans.length) continue;
        const [lo, hi] = spans[Math.floor(rngl.float() * spans.length)];
        const v = lo + 0.5 + rngl.float() * Math.max(0, hi - lo - lv - 1.0);
        if (free(u, u + lu, v, v + lv, R.level)) { claim(u, u + lu, v, v + lv, R.level); fn(u, u + lu, v, v + lv); return true; }
      }
      return false;
    };

    // [u, v, floor y, yaw, seat surface height (0 = standing: at a counter, behind a bar, at the altar)]
    // (a 6th field of 1 marks staff — the shopkeeper, the barista, the bartender — who are placed first)
    const npcSpots: [number, number, number, number, number?, number?][] = [];
    // the yaw that turns a resident (front = local −z) to face (du, dv) in the plan's u/v frame
    const yawTo = (du: number, dv: number) => Math.atan2(-du, -dv);
    const lights: Light[] = [];
    const tallSpots: [number, number, number, number, number][] = []; // wall strips taken by tall pieces / art
    const glowAt = (u: number, v: number, y: number, w: number) => { const p = toW(P, u, v); lights.push({ x: p[0], y, z: p[1], w }); };

    // ---- the furniture kit (all in the local frame; side = which v-wall the piece backs onto) ----
    // Foundry pieces (src/assets/decor.ts): local x → ax, local z (back = +z) → az, y up.
    const DM: Record<D.DecorMat, number> = { fabric: IP.fabric, wood: IP.wood, metal: IP.porcelain, porcelain: IP.porcelain, glass: IP.glass, solid: IP.solid, glow: IP.glow };
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
    const piece = (parts: D.DecorPart[], uc: number, vc: number, y: number, ax: P2, az: P2) => {
      const wx = [P.ux * ax[0] + P.vx * ax[1], P.uz * ax[0] + P.vz * ax[1]], wz = [P.ux * az[0] + P.vx * az[1], P.uz * az[0] + P.vz * az[1]];
      for (const p of parts) {
        m.part(DM[p.mat]).color(p.hex);
        const pos = p.g.getAttribute('position'), nrm = p.g.getAttribute('normal');
        const W = (i: number, out: THREE.Vector3) => { const x = pos.getX(i), z = pos.getZ(i); const w = toW(P, uc + x * ax[0] + z * az[0], vc + x * ax[1] + z * az[1]); return out.set(w[0], y + pos.getY(i), w[1]); };
        const N = (i: number, out: THREE.Vector3) => { const x = nrm.getX(i), z = nrm.getZ(i); return out.set(x * wx[0] + z * wz[0], nrm.getY(i), x * wx[1] + z * wz[1]).normalize(); };
        for (let i = 0; i + 2 < pos.count; i += 3) m.triN(W(i, pa), W(i + 1, pb), W(i + 2, pc), N(i, na), N(i + 1, nb), N(i + 2, nc));
      }
    };
    const fit = (parts: D.DecorPart[], a: number, b: number, c: number, d: number, y: number, side: number) => piece(parts, (a + b) / 2, (c + d) / 2, y, [1, 0], [0, side]);
    const facing = (parts: D.DecorPart[], uc: number, vc: number, y: number, face: P2) => piece(parts, uc, vc, y, [face[1], -face[0]], [-face[0], -face[1]]);
    const legs = (a: number, b: number, c: number, d: number, y: number, h: number, hex: number, t = 0.05) => {
      for (const [uu, vv] of [[a, c], [b - t, c], [a, d - t], [b - t, d - t]]) box(uu, uu + t, vv, vv + t, y, y + h, hex, IP.wood);
    };
    const table = (a: number, b: number, c: number, d: number, y: number, h: number, hex: number) => piece(D.table(b - a, d - c, h, hex), (a + b) / 2, (c + d) / 2, y, [1, 0], [0, 1]);
    const chair = (uc: number, vc: number, face: P2, y: number, hex: number) => facing(D.chair(hex, rng.float() < 0.3 ? FABRIC[Math.floor(rng.float() * FABRIC.length)] : undefined), uc, vc, y, face);
    const lamp = (u: number, v: number, y: number, h: number) => {
      piece(D.lamp(h > 1), u, v, y, [1, 0], [0, 1]);
      glowAt(u, v, y + (h > 1 ? 1.35 : 0.4), 0.55);
    };
    const plant = (u: number, v: number, y: number, big: boolean) => piece(D.pottedPlant(big, [0x5f8a45, 0x4d7a3a, 0x6f9a50][Math.floor(rng.float() * 3)], [0xa86a4a, 0xe9e4d6, 0x5a6a78][Math.floor(rng.float() * 3)]), u, v, y, [1, 0], [0, 1]);
    const books = (a: number, b: number, c: number, d: number, y: number, shelves: number, gap = 0.42) => {
      for (let r = 0; r < shelves; r++) {
        let uu = a + 0.04;
        while (uu < b - 0.1) {
          const w = 0.03 + rng.float() * 0.05, h = 0.2 + rng.float() * 0.12;
          if (rng.float() > 0.12) box(uu, uu + w, c + 0.03, d - 0.03, y + 0.06 + r * gap, y + 0.06 + r * gap + h, FABRIC[Math.floor(rng.float() * FABRIC.length)]);
          uu += w + 0.005;
        }
      }
    };
    const sofa = (a: number, b: number, c: number, d: number, side: number, y: number, fab: number) => {
      fit(D.sofa(b - a, d - c, fab), a, b, c, d, y, side);
      // two throw pillows in a contrasting fabric, leaning into the corners
      const pc = FABRIC[Math.floor(rng.float() * FABRIC.length)];
      for (const s of [-1, 1]) {
        const pl = D.sofa(0.4, 0.2, pc).slice(0, 1).map((p) => ({ ...p, g: p.g.clone().scale(1, 0.9, 1).rotateX(-0.25).translate(s * ((b - a) / 2 - 0.42), 0.36, (d - c) / 2 - 0.34) }));
        fit(pl, a, b, c, d, y, side);
      }
    };
    const bed = (a: number, b: number, c: number, d: number, side: number, y: number, fab: number, wood: number) => fit(D.bed(b - a, d - c, fab, wood), a, b, c, d, y, side);
    const dresser = (a: number, b: number, c: number, d: number, side: number, wallV: number, y: number, wood: number, mirror: boolean) => {
      box(a, b, c, d, y + 0.06, y + 0.85, wood, IP.wood);
      legs(a, b, c, d, y, 0.06, wood);
      const front = side > 0 ? c - 0.005 : d + 0.005;
      for (let r = 0; r < 3; r++) {
        box(a + 0.04, b - 0.04, front, front + (side > 0 ? 0.01 : -0.01), y + 0.1 + r * 0.25, y + 0.3 + r * 0.25, new THREE.Color(wood).multiplyScalar(0.85), IP.wood);
        box((a + b) / 2 - 0.06, (a + b) / 2 + 0.06, front - (side > 0 ? 0.02 : -0.02), front, y + 0.19 + r * 0.25, y + 0.22 + r * 0.25, 0xc9a74a);
      }
      if (mirror) {
        box(a + 0.1, b - 0.1, wallV - side * 0.03, wallV, y + 1.0, y + 1.75, wood, IP.wood);
        box(a + 0.15, b - 0.15, wallV - side * 0.035, wallV - side * 0.03, y + 1.05, y + 1.7, 0xc9d6dc, IP.glass);
      }
    };
    const rug = (a: number, b: number, c: number, d: number, y: number) => {
      const style = Math.floor(rng.float() * 4) + 0.1 + Math.floor(rng.float() * FABRIC.length) * 10;
      flatQuad(a, b, c, d, y + 0.012, FABRIC[Math.floor(rng.float() * FABRIC.length)], IP.rug, style);
    };
    const ceilingLight = (R: Room, cy: number, fan: boolean) => {
      const um = (R.u0 + R.u1) / 2;
      const sp = LP.spans(um).sort((x, y2) => y2[1] - y2[0] - (x[1] - x[0]))[0];
      const vm = sp ? (sp[0] + sp[1]) / 2 : 0;
      if (fan) piece(D.ceilingFan(rng.float() < 0.5 ? 0xf1ede4 : 0x8a6242), um, vm, cy - 0.45, [1, 0], [0, 1]);
      else box(um - 0.2, um + 0.2, vm - 0.2, vm + 0.2, cy - 0.13, cy - 0.02, 0xfff3d0, IP.glow);
      glowAt(um, vm, cy - 0.35, fp.kind === 'church' ? 2.2 : 1);
      return vm;
    };
    const wallArt = (R: Room, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const w = 0.5 + rng.float() * 0.6, h = w * (0.6 + rng.float() * 0.4);
        for (let t = 0; t < 6; t++) {
          const u = R.u0 + 0.4 + w / 2 + rng.float() * Math.max(0, R.u1 - R.u0 - 0.8 - w);
          const side = rng.float() < 0.5 ? 1 : -1;
          const sp = LP.span(u - w / 2, u + w / 2, (LP.spans(u)[0] ?? [0, 0]).reduce((a, b) => (a + b) / 2));
          if (!sp) continue;
          const wallV = side > 0 ? sp[1] - 0.15 : sp[0] + 0.15;
          const vIn = wallV - side * 0.5;
          const u0 = u - w / 2, u1 = u + w / 2;
          // not across a window, not over the tall pieces
          if (!LP.rectIn(u0, u1, Math.min(wallV, vIn), Math.max(wallV, vIn), 0.02) || !winClear(u0, u1, wallV)) continue;
          if (tallSpots.some(([a, b, c, d, l]) => l === R.level && u0 < b && u1 > a && Math.min(wallV, vIn) < d && Math.max(wallV, vIn) > c)) continue;
          tallSpots.push([u0, u1, Math.min(wallV, vIn), Math.max(wallV, vIn), R.level]);
          art(u, wallV, side, y + 1.45, w, h, rng.float() * 0.999 + Math.floor(rng.float() * 5));
          break;
        }
      }
    };

    let podsLeft = 12; // (a building's open-plan desks, all storeys together)
    for (const R of rooms) {
      yield; // one room's furniture done
      const y = fl(R.level);
      const cy = R.level === P.levels - 1 ? top : fl(R.level + 1);
      const fab = FABRIC[Math.floor(rng.float() * FABRIC.length)];
      const wood = WOOD[Math.floor(rng.float() * WOOD.length)];
      const sideA = rng.float() < 0.5 ? 1 : -1;
      const beachy = fp.kind === 'house' && rng.float() < 0.6;
      ceilingLight(R, cy, beachy && (R.role === 'living' || R.role === 'bedroom' || R.role === 'great'));
      const living = (withKitchen: boolean) => {
        place(R, 2.1, 0.92, sideA, rng, (a, b, c, d, side) => {
          sofa(a, b, c, d, side, y, fab);
          // on the cushion (0.53 m, 6 cm of give), hips forward of the back cushions so the knees
          // clear the front edge and the shins hang in front of the base
          npcSpots.push([(a + b) / 2 + (rng.float() - 0.5) * 0.8, (c + d) / 2 - side * 0.08, y, yawTo(0, -side), 0.47]);
          const vt = side > 0 ? c - 1.35 : d + 0.85;
          if (free(a + 0.4, b - 0.4, vt, vt + 0.5, R.level)) {
            table(a + 0.45, b - 0.45, vt, vt + 0.5, y, 0.42, wood);
            box(a + 0.6, a + 0.85, vt + 0.1, vt + 0.28, y + 0.42, y + 0.47, FABRIC[3]);
            box(b - 0.75, b - 0.67, vt + 0.2, vt + 0.28, y + 0.42, y + 0.52, 0xf2efe6, IP.porcelain);
            claim(a + 0.4, b - 0.4, vt, vt + 0.5, R.level);
          }
          rug(a - 0.3, b + 0.3, side > 0 ? c - 1.9 : c + 0.1, side > 0 ? d - 0.1 : d + 1.9, y);
          if (free(b + 0.1, b + 0.55, c, c + 0.45, R.level)) { table(b + 0.1, b + 0.55, side > 0 ? d - 0.45 : c, side > 0 ? d : c + 0.45, y, 0.55, wood); lamp(b + 0.32, side > 0 ? d - 0.22 : c + 0.22, y + 0.55, 0.5); }
        });
        place(R, 1.5, 0.45, -sideA, rng, (a, b, c, d, side) => {
          box(a, b, c, d, y, y + 0.5, wood, IP.wood);
          const tv = side > 0 ? [d - 0.12, d - 0.06] : [c + 0.06, c + 0.12];
          box(a + 0.1, b - 0.1, tv[0], tv[1], y + 0.55, y + 1.15, 0x1c1d22, IP.glass);
          box((a + b) / 2 - 0.15, (a + b) / 2 + 0.15, c + 0.1, d - 0.1, y + 0.5, y + 0.55, 0x2a2b30);
        }, true);
        place(R, 1.0, 0.36, -sideA, rng, (a, b, c, d) => {
          box(a, b, c, d, y, y + 1.9, wood, IP.wood);
          for (let r = 0; r < 5; r++) box(a + 0.03, b - 0.03, c + 0.02, d - 0.02, y + 0.02 + r * 0.42, y + 0.05 + r * 0.42, new THREE.Color(wood).multiplyScalar(0.8), IP.wood);
          books(a, b, c, d, y, 4);
        }, true);
        placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, true));
        placeFree(R, 0.8, 0.8, rng, (a, b, c, d) => {
          // an armchair turned toward the room, a standard lamp at its shoulder
          facing(D.armchair(0.8, 0.8, FABRIC[(FABRIC.indexOf(fab) + 4) % FABRIC.length]), (a + b) / 2, (c + d) / 2, y, [1, 0]);
          lamp(b + 0.2, (c + d) / 2, y, 1.55);
          npcSpots.push([(a + b) / 2 + 0.04, (c + d) / 2, y, yawTo(1, 0), 0.47]);
        });
        if (withKitchen) kitchenRun(R, y, -sideA);
        wallArt(R, y, 2);
      };
      const kitchenRun = (Rm: Room, yy: number, side: number) => {
        const run = Math.min(Rm.u1 - Rm.u0 - 0.6, 3.8);
        return place(Rm, run, 0.62, side, rng, (a, b, c, d, sd, wallV) => {
          const cab = rng.float() < 0.6 ? 0xf2efe6 : [0x9fb3a5, 0x5f7a8c, 0xd9cbb0][Math.floor(rng.float() * 3)];
          box(a, b, c, d, yy + 0.08, yy + 0.88, cab, IP.solid);
          box(a, b, c + (sd > 0 ? 0.04 : 0), d - (sd > 0 ? 0 : 0.04), yy, yy + 0.08, 0x2e2a26);
          box(a - 0.02, b + 0.02, c - 0.02, d + 0.02, yy + 0.88, yy + 0.92, 0x4a4540, IP.porcelain);
          // cabinet doors, sink, stove, fridge, uppers, hood, backsplash
          const front = sd > 0 ? c - 0.006 : d + 0.006;
          for (let uu = a + 0.05; uu < b - 0.4; uu += 0.5) box(uu, uu + 0.44, front, front + (sd > 0 ? 0.01 : -0.01), yy + 0.14, yy + 0.8, new THREE.Color(cab).multiplyScalar(0.93));
          const sink = a + (b - a) * 0.35;
          box(sink - 0.3, sink + 0.3, c + 0.12, d - 0.12, yy + 0.86, yy + 0.925, 0x8e969a, IP.porcelain);
          const fv = sd > 0 ? d - 0.08 : c + 0.08;
          box(sink - 0.02, sink + 0.02, fv - 0.02, fv + 0.02, yy + 0.92, yy + 1.2, 0xc0c4c6, IP.porcelain);
          box(sink - 0.02, sink + 0.02, fv - (sd > 0 ? 0.18 : -0.18), fv, yy + 1.18, yy + 1.21, 0xc0c4c6, IP.porcelain);
          const stove = a + (b - a) * 0.72;
          box(stove - 0.32, stove + 0.32, c + 0.02, d - 0.02, yy + 0.92, yy + 0.93, 0x222326);
          for (const [du, dv] of [[-0.15, -0.13], [0.15, -0.13], [-0.15, 0.13], [0.15, 0.13]]) {
            const vc = (c + d) / 2 + dv;
            box(stove + du - 0.08, stove + du + 0.08, vc - 0.08, vc + 0.08, yy + 0.93, yy + 0.945, 0x3a3b3e);
          }
          box(stove - 0.3, stove + 0.3, front, front + (sd > 0 ? 0.012 : -0.012), yy + 0.15, yy + 0.75, 0x2a2b2e, IP.glass);
          box(b + 0.05, b + 0.85, c, d, yy, yy + 1.9, rng.float() < 0.5 ? 0xe9e9e4 : 0xb8bcbf, IP.porcelain);
          box(b + 0.7, b + 0.74, front - (sd > 0 ? 0.04 : -0.04), front, yy + 0.9, yy + 1.6, 0x8a8e90);
          claim(b + 0.05, b + 0.85, c, d, Rm.level);
          const wall = sd > 0 ? [wallV - 0.36, wallV] : [wallV, wallV + 0.36];
          box(a, b, wall[0], wall[1], yy + 1.45, yy + 2.2, cab, IP.solid);
          box(stove - 0.38, stove + 0.38, wall[0], wall[1], yy + 1.35, yy + 1.45, 0xb8bcbf, IP.porcelain);
          const bs = sd > 0 ? [wallV - 0.015, wallV] : [wallV, wallV + 0.015];
          box(a, b, bs[0], bs[1], yy + 0.92, yy + 1.45, [0xe9eef0, 0xdfe9e4, 0xf1e8d8][Math.floor(rng.float() * 3)], IP.porcelain);
          box(a + 0.3, a + 0.55, c + 0.15, c + 0.4, yy + 0.92, yy + 1.02, 0xc9a24b); // fruit bowl
          box(a + 0.33, a + 0.52, c + 0.18, c + 0.37, yy + 1.02, yy + 1.07, 0xd9573f);
          npcSpots.push([sink, sd > 0 ? c - 0.42 : d + 0.42, yy, yawTo(0, sd)]); // at the sink, facing the counter
        }, true);
      };
      const dining = (big: boolean) => {
        placeFree(R, big ? 1.9 : 1.3, 0.95, rng, (a, b, c, d) => {
          table(a, b, c, d, y, 0.76, wood);
          const cc = rng.float() < 0.5 ? wood : 0xf1ede4;
          const n = big ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const uc = a + (b - a) * ((i + 0.5) / n);
            chair(uc, c - 0.32, [0, 1], y, cc);
            chair(uc, d + 0.32, [0, -1], y, cc);
          }
          chair(a - 0.34, (c + d) / 2, [1, 0], y, cc);
          chair(b + 0.34, (c + d) / 2, [-1, 0], y, cc);
          box((a + b) / 2 - 0.12, (a + b) / 2 + 0.12, (c + d) / 2 - 0.12, (c + d) / 2 + 0.12, y + 0.76, y + 0.86, [0x7fa0b8, 0xe0a33b, 0xf1ede4][Math.floor(rng.float() * 3)], IP.porcelain);
          for (let i = 0; i < n; i++) box(a + (b - a) * ((i + 0.5) / n) - 0.12, a + (b - a) * ((i + 0.5) / n) + 0.12, c + 0.08, c + 0.3, y + 0.76, y + 0.77, 0xf6f4ee, IP.porcelain);
          claim(a - 0.6, b + 0.6, c - 0.6, d + 0.6, R.level);
          // in a chair on the near side, facing the table (a second diner across in a big room)
          npcSpots.push([a + (b - a) * (0.5 / n), c - 0.3, y, yawTo(0, 1), 0.465]);
          if (big) npcSpots.push([a + (b - a) * (1.5 / n), d + 0.3, y, yawTo(0, -1), 0.465]);
        });
      };
      switch (R.role) {
        case 'living':
          living(false);
          break;
        case 'great':
          living(true);
          dining(false);
          break;
        case 'kitchen':
          kitchenRun(R, y, sideA);
          dining(R.u1 - R.u0 > 3.5);
          placeFree(R, 0.3, 0.3, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, false));
          wallArt(R, y, 1);
          break;
        case 'dining':
          dining(true);
          place(R, 1.5, 0.48, sideA, rng, (a, b, c, d) => {
            box(a, b, c, d, y + 0.1, y + 0.9, wood, IP.wood);
            legs(a, b, c, d, y, 0.1, wood);
            lamp(a + 0.25, (c + d) / 2, y + 0.9, 0.45);
            box(b - 0.45, b - 0.2, c + 0.12, d - 0.12, y + 0.9, y + 1.1, 0x7fa0b8, IP.porcelain);
          }, true);
          wallArt(R, y, 2);
          break;
        case 'bedroom':
          place(R, 1.6, 2.05, sideA, rng, (a, b, c, d, side) => {
            bed(a, b, c, d, side, y, fab, wood);
            const hv = side > 0 ? [d - 0.45, d] : [c, c + 0.45];
            for (const uu of [a - 0.5, b + 0.05]) {
              if (!free(uu, uu + 0.45, hv[0], hv[1], R.level)) continue;
              box(uu, uu + 0.45, hv[0], hv[1], y + 0.06, y + 0.55, wood, IP.wood);
              legs(uu, uu + 0.45, hv[0], hv[1], y, 0.06, wood);
              lamp(uu + 0.22, (hv[0] + hv[1]) / 2, y + 0.55, 0.45);
              claim(uu, uu + 0.45, hv[0], hv[1], R.level);
            }
            rug(a - 0.4, b + 0.4, side > 0 ? c - 0.8 : d - 0.4, side > 0 ? c + 0.4 : d + 0.8, y);
            // perched on the foot of the bed, not sunk into the middle of it
            npcSpots.push([(a + b) / 2 + (rng.float() - 0.5) * 0.6, side > 0 ? c + 0.3 : d - 0.3, y, yawTo(0, -side), 0.52]);
          });
          place(R, 1.2, 0.5, -sideA, rng, (a, b, c, d, side, wallV) => dresser(a, b, c, d, side, wallV, y, wood, true), true);
          place(R, 1.1, 0.6, -sideA, rng, (a, b, c, d) => { box(a, b, c, d, y, y + 2.05, wood, IP.wood); box((a + b) / 2 - 0.005, (a + b) / 2 + 0.005, c - 0.005, d + 0.005, y + 0.1, y + 1.95, new THREE.Color(wood).multiplyScalar(0.7)); }, true);
          placeFree(R, 0.45, 0.45, rng, (a, b, c, d) => chair((a + b) / 2, (c + d) / 2, [1, 0], y, wood));
          wallArt(R, y, 2);
          break;
        case 'bath':
          place(R, 1.7, 0.78, sideA, rng, (a, b, c, d) => {
            box(a, b, c, d, y, y + 0.56, PORCELAIN, IP.porcelain);
            box(a + 0.08, b - 0.08, c + 0.08, d - 0.08, y + 0.3, y + 0.565, 0xa9cad3, IP.porcelain);
            box(a + 0.1, a + 0.14, (c + d) / 2 - 0.02, (c + d) / 2 + 0.02, y + 0.56, y + 1.0, 0xc0c4c6, IP.porcelain);
          });
          place(R, 0.45, 0.7, -sideA, rng, (a, b, c, d, side) => {
            const back = side > 0 ? [d - 0.2, d] : [c, c + 0.2];
            box(a + 0.04, b - 0.04, c + (side > 0 ? 0.1 : 0.3), d - (side > 0 ? 0.3 : 0.1), y, y + 0.38, PORCELAIN, IP.porcelain);
            box(a, b, side > 0 ? c + 0.05 : c + 0.25, side > 0 ? d - 0.25 : d - 0.05, y + 0.38, y + 0.42, PORCELAIN, IP.porcelain);
            box(a, b, back[0], back[1], y + 0.38, y + 0.8, PORCELAIN, IP.porcelain);
          });
          place(R, 0.9, 0.5, -sideA, rng, (a, b, c, d, side, wallV) => {
            box(a, b, c, d, y, y + 0.82, [0xf2efe6, 0x8a6242, 0x9fb3a5][Math.floor(rng.float() * 3)], IP.wood);
            box(a - 0.01, b + 0.01, c - 0.01, d + 0.01, y + 0.82, y + 0.86, 0xe8e4da, IP.porcelain);
            box((a + b) / 2 - 0.22, (a + b) / 2 + 0.22, c + 0.08, d - 0.08, y + 0.85, y + 0.87, 0xd6dde0, IP.porcelain);
            box(a + 0.1, b - 0.1, wallV - side * 0.03, wallV, y + 1.05, y + 1.75, 0xc9d6dc, IP.glass);
          }, true);
          placeFree(R, 0.8, 0.5, rng, (a, b, c, d) => flatQuad(a, b, c, d, y + 0.012, 0xe9e2d0, IP.rug, 1.1 + 10 * Math.floor(rng.float() * 10)));
          // towel bar with a towel
          place(R, 0.7, 0.06, sideA, rng, (a, b, c, d) => {
            box(a, b, c, d, y + 1.1, y + 1.13, 0xc0c4c6, IP.porcelain);
            box(a + 0.08, b - 0.08, c - 0.01, d + 0.01, y + 0.6, y + 1.13, FABRIC[Math.floor(rng.float() * FABRIC.length)], IP.fabric);
          }, true);
          break;
        case 'shop': {
          for (let u = R.u0 + 1.2; u < R.u1 - 1.2; u += 2.1) {
            const sp = LP.spans(u + 0.25).sort((x, y2) => y2[1] - y2[0] - (x[1] - x[0]))[0];
            if (!sp) continue;
            const v0 = sp[0] + (sp[1] - sp[0]) * 0.22, v1 = sp[1] - (sp[1] - sp[0]) * 0.22;
            if (!free(u, u + 0.5, v0, v1, 0)) continue;
            claim(u, u + 0.5, v0, v1, 0);
            // a gondola: two stocked faces back to back
            const stock = use === 'grocery' ? [0xd9573f, 0xe0a33b, 0x6e8c5a, 0xf2efe6, 0x5b7fa6, 0xc9a24b, 0x8a4a3a] : FABRIC;
            const seedS = Math.floor(rng.float() * 1e9);
            for (const s2 of [1, -1]) piece(D.shelves(v1 - v0, 0.25, 1.7, 0xd8d2c4, stock, seedS + s2), u + 0.25 + s2 * 0.125 * -1, (v0 + v1) / 2, y, [0, 1], [s2, 0]);
          }
          // the till counter stands off the wall with a staff aisle behind it: the shopkeeper
          // faces the floor, a customer waits at the till
          place(R, Math.min(2.4, (R.u1 - R.u0) * 0.4), 0.62 + STAFF_AISLE, sideA, rng, (a, b, c0, d0, side) => {
            const [c, d] = side > 0 ? [c0, c0 + 0.62] : [d0 - 0.62, d0];
            box(a, b, c, d, y, y + 1.0, wood, IP.wood);
            box(a - 0.03, b + 0.03, c - 0.03, d + 0.03, y + 1.0, y + 1.04, 0x3a3530);
            box(a + 0.3, a + 0.7, c + 0.1, d - 0.1, y + 1.04, y + 1.3, 0x2c2e33, IP.glass);
            npcSpots.push([a + 0.5, side > 0 ? d + 0.42 : c - 0.42, y, yawTo(0, -side), 0, 1]);
            npcSpots.push([a + 0.5 + (rng.float() - 0.5) * 0.4, side > 0 ? c - 0.45 : d + 0.45, y, yawTo(0, side)]);
          });
          placeFree(R, 1.2, 0.8, rng, (a, b, c, d) => {
            table(a, b, c, d, y, 0.8, wood);
            for (let i = 0; i < 5; i++) { const uu = a + 0.1 + rng.float() * (b - a - 0.3), vv = c + 0.1 + rng.float() * (d - c - 0.3); box(uu, uu + 0.18, vv, vv + 0.18, y + 0.8, y + 0.8 + 0.08 + rng.float() * 0.15, FABRIC[Math.floor(rng.float() * FABRIC.length)]); }
          });
          placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, true));
          break;
        }
        case 'cafe': {
          // Zoned like a real café: the counter (pastry case, espresso machine, menu board, a back
          // bar of cups) on the wall facing the way in so it's the first read; tables on a ~2.2 m
          // pitch filling the floor (2 or 4 chairs); a pendant over each table; art on the walls.
          const back = P.vd > 0 ? -1 : 1;
          // ~1 table per 7 m² (an open floor, a queue by the counter), never a banquet hall
          const nSets = Math.max(4, Math.min(16, Math.floor(roomArea(R) / 7)));
          const ceil = y + P.floorH - 0.14;
          const pendant = (u: number, v: number, k: number) => {
            box(u - 0.006, u + 0.006, v - 0.006, v + 0.006, ceil - 0.72, ceil, 0x2a2622);
            box(u - 0.15, u + 0.15, v - 0.15, v + 0.15, ceil - 0.86, ceil - 0.72, [0x2f4a3a, 0xb08a4a, 0xe9e4d6][k % 3], IP.porcelain);
            box(u - 0.07, u + 0.07, v - 0.07, v + 0.07, ceil - 0.89, ceil - 0.86, 0xffd890, IP.glow);
          };
          const counterAt = (a: number, b: number, c0: number, d0: number, side: number, wallV: number) => {
            // the counter stands off the back wall: baristas work the aisle between it and the back bar
            const [c, d] = side > 0 ? [c0, c0 + 0.65] : [d0 - 0.65, d0];
            fit(D.counter(b - a, d - c, wood), a, b, c, d, y, side);
            const vs = side > 0 ? c - 0.45 : d + 0.45;
            for (let uu = a + 0.3; uu < b - 0.2; uu += 0.7) piece(D.roundTable(0.17, 0.72, 0x3a3530), uu, vs, y, [1, 0], [0, 1]); // stools
            // the menu board and a back bar of cups — where the wall is solid (under a window: a
            // low shelf of cups on the sill line instead)
            const solid = winClear(a, b, wallV);
            if (solid) box(a + 0.3, b - 0.3, wallV - side * 0.03, wallV, y + 1.75, y + 2.35, 0x2a2e2b, IP.art); // menu board
            for (const sy of solid ? [1.25, 1.55] : [0.9]) {
              box(a + 0.2, b - 0.2, wallV - side * 0.22, wallV, y + sy, y + sy + 0.03, wood, IP.wood);
              for (let uu = a + 0.3; uu < b - 0.3; uu += 0.16 + rng.float() * 0.1)
                box(uu, uu + 0.07, wallV - side * 0.16, wallV - side * 0.08, y + sy + 0.03, y + sy + 0.12 + rng.float() * 0.08, [0xf6f4ee, 0xd9c7a8, 0x7fa0b8, 0xc46a4a][Math.floor(rng.float() * 4)], IP.porcelain);
            }
            pendant((a + b) / 2 - 0.6, side > 0 ? c - 0.2 : d + 0.2, 0); pendant((a + b) / 2 + 0.6, side > 0 ? c - 0.2 : d + 0.2, 0);
            glowAt((a + b) / 2, side > 0 ? c : d, ceil - 0.9, 0.9);
            const behind = side > 0 ? d + 0.42 : c - 0.42;
            npcSpots.push([b - 0.45, behind, y, yawTo(0, -side), 0, 1]); // at the espresso machine
            npcSpots.push([a + 0.6, behind, y, yawTo(0, -side)]); // at the pastry case
            npcSpots.push([a + 0.65, side > 0 ? c - 0.8 : d + 0.8, y, yawTo(0, side)]); // a customer waiting at the case, behind the stools
          };
          if (!place(R, Math.min(3.6, (R.u1 - R.u0) * 0.55), 0.65 + STAFF_AISLE, back, rng, counterAt)) place(R, Math.min(3.2, (R.u1 - R.u0) * 0.5), 0.65 + STAFF_AISLE, -back, rng, counterAt);
          let lit = 0;
          for (let t = 0; t < nSets; t++) {
            const four = rng.float() < 0.4;
            placeFree(R, four ? 1.1 : 0.7, four ? 1.1 : 0.7, rng, (a, b, c, d) => {
              const uc = (a + b) / 2, vc = (c + d) / 2;
              piece(D.roundTable(four ? 0.42 : 0.35, 0.74, [0xf1ede4, wood][t % 2]), uc, vc, y, [1, 0], [0, 1]);
              const r = four ? 0.62 : 0.55;
              facing(D.bistroChair(wood), uc - r, vc, y, [1, 0]);
              facing(D.bistroChair(wood), uc + r, vc, y, [-1, 0]);
              if (four) { facing(D.bistroChair(wood), uc, vc - r, y, [0, 1]); facing(D.bistroChair(wood), uc, vc + r, y, [0, -1]); }
              box(uc - 0.06, uc + 0.06, vc - 0.06, vc + 0.06, y + 0.75, y + 0.83, 0xf6f4ee, IP.porcelain);
              pendant(uc, vc, t);
              if (lit++ < 3) glowAt(uc, vc, ceil - 0.9, 0.6);
              claim(a - 0.8, b + 0.8, c - (four ? 0.8 : 0), d + (four ? 0.8 : 0), R.level);
              if (t < 4) npcSpots.push([uc - r, vc, y, yawTo(1, 0), 0.475]);
              if (t < 2 && four) npcSpots.push([uc + r, vc, y, yawTo(-1, 0), 0.475]); // company across the table
            });
          }
          wallArt(R, y, Math.max(2, Math.min(6, Math.floor((R.u1 - R.u0) / 3))));
          break;
        }
        case 'bar': {
          // a bar: the long counter on the back wall with a stool every 0.65 m, a back bar of
          // bottles on lit shelves, high-tops with two stools down the room, a warm low light
          const back = P.vd > 0 ? -1 : 1;
          const barArea = roomArea(R);
          place(R, Math.min(barArea > 90 ? 10 : 6, (R.u1 - R.u0) * 0.75), 0.7 + STAFF_AISLE, back, rng, (a, b, c0, d0, side, wallV) => {
            const [c, d] = side > 0 ? [c0, c0 + 0.7] : [d0 - 0.7, d0]; // the bartender's aisle behind
            fit(D.counter(b - a, d - c, 0x3a2a20, false), a, b, c, d, y, side);
            const vs = side > 0 ? c - 0.42 : d + 0.42;
            for (let uu = a + 0.35; uu < b - 0.25; uu += 0.65) piece(D.roundTable(0.18, 0.78, 0x2a2622), uu, vs, y, [1, 0], [0, 1]);
            // back bar: three lit shelves of bottles in amber, green and clear glass
            for (const sy of [1.05, 1.45, 1.85]) {
              box(a + 0.1, b - 0.1, wallV - side * 0.26, wallV, y + sy, y + sy + 0.03, 0x3a2a20, IP.wood);
              for (let uu = a + 0.2; uu < b - 0.2; uu += 0.09 + rng.float() * 0.06)
                box(uu, uu + 0.07, wallV - side * 0.2, wallV - side * 0.12, y + sy + 0.03, y + sy + 0.22 + rng.float() * 0.1, [0x8a5a2a, 0x3f6a3a, 0xd9d2c0, 0x6a3a2a][Math.floor(rng.float() * 4)], IP.porcelain);
            }
            glowAt((a + b) / 2, wallV - side * 0.3, y + 2.2, 1.0);
            npcSpots.push([(a + b) / 2, side > 0 ? d + 0.38 : c - 0.38, y, yawTo(0, -side), 0, 1]);
            // regulars on the stools, turned to the bar
            for (let uu = a + 0.35, k = 0; uu < b - 0.25 && k < 3; uu += 1.95, k++) npcSpots.push([uu, vs - side * 0.1, y, yawTo(0, side), 0.78]);
          }, true);
          // a pool table or two in a big room (felt, a dark rail, a hanging lamp over it)
          for (let t = 0; t < Math.min(2, Math.floor(barArea / 70)); t++)
            placeFree(R, 2.9, 1.9, rng, (a, b, c, d) => {
              const uc = (a + b) / 2, vc = (c + d) / 2;
              box(uc - 1.25, uc + 1.25, vc - 0.7, vc + 0.7, y + 0.66, y + 0.8, 0x3a2a20, IP.wood);
              box(uc - 1.12, uc + 1.12, vc - 0.57, vc + 0.57, y + 0.8, y + 0.815, 0x2f6a45, IP.fabric);
              for (const [du, dv] of [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]]) box(uc + du - 0.07, uc + du + 0.07, vc + dv - 0.07, vc + dv + 0.07, y, y + 0.66, 0x2a1e18, IP.wood);
              glowAt(uc, vc, y + 1.7, 0.8);
            });
          for (let t = 0; t < Math.max(2, Math.min(24, Math.floor(barArea / 9))); t++)
            placeFree(R, 1.3, 1.3, rng, (a, b, c, d) => {
              const uc = (a + b) / 2, vc = (c + d) / 2;
              piece(D.roundTable(0.36, 1.05, 0x3a2a20), uc, vc, y, [1, 0], [0, 1]);
              piece(D.roundTable(0.17, 0.76, 0x2a2622), uc - 0.55, vc, y, [1, 0], [0, 1]);
              piece(D.roundTable(0.17, 0.76, 0x2a2622), uc + 0.55, vc, y, [1, 0], [0, 1]);
              if (t < 4) npcSpots.push([uc - 0.55, vc, y, yawTo(1, 0), 0.76]);
              if (t < 2) npcSpots.push([uc + 0.55, vc, y, yawTo(-1, 0), 0.76]);
              if (t < 3) glowAt(uc, vc, y + 2.4, 0.4);
            });
          wallArt(R, y, 3);
          break;
        }
        case 'diner': {
          // booths down the long wall, a counter with stools, a pass-through to the kitchen
          const vinyl = [0x9c2a26, 0x2f4a6a, 0x3d5a46, 0xb5793a][Math.floor(rng.float() * 4)];
          const topC = [0xe9e2d0, 0x8a6242, 0xd9d2c0][Math.floor(rng.float() * 3)];
          const dArea = roomArea(R);
          // booths line ONE long wall (a few on the other in a big room); the floor between is
          // freestanding two- and four-tops in loose clusters — never rows of seats facing one way
          for (let t = 0; t < Math.max(3, Math.min(7, Math.floor(dArea / 18))); t++)
            place(R, 1.25, 2.1, t < 5 ? sideA : -sideA, rng, (a, b, c, d, side) => {
              piece(D.booth(b - a, vinyl, topC), (a + b) / 2, (c + d) / 2, y, [1, 0], [0, 1]);
              for (let i = 0; i < 2; i++) box((a + b) / 2 - 0.35 + i * 0.5, (a + b) / 2 - 0.15 + i * 0.5, (c + d) / 2 - 0.12, (c + d) / 2 + 0.08, y + 0.74, y + 0.76, 0xf6f4ee, IP.porcelain);
              if (t < 4) npcSpots.push([(a + b) / 2 + (rng.float() - 0.5) * 0.5, (c + d) / 2 + side * 0.72, y, yawTo(0, -side), 0.43]);
            });
          place(R, Math.min(3.4, (R.u1 - R.u0) * 0.5), 0.62, sideA, rng, (a, b, c, d, side, wallV) => {
            fit(D.counter(b - a, d - c, wood, false), a, b, c, d, y, side);
            const vs = side > 0 ? c - 0.42 : d + 0.42;
            for (let uu = a + 0.3; uu < b - 0.2; uu += 0.65) piece(D.roundTable(0.18, 0.74, vinyl), uu, vs, y, [1, 0], [0, 1]);
            box(a + 0.3, b - 0.3, wallV - side * 0.03, wallV, y + 1.6, y + 2.25, 0x2a2e2b, IP.art); // menu board
          }, true);
          for (let t = 0; t < Math.max(2, Math.min(14, Math.floor(dArea / 9))); t++) {
            const four = rng.float() < 0.55;
            placeFree(R, four ? 1.7 : 1.3, four ? 1.7 : 1.3, rng, (a, b, c, d) => {
              const uc = (a + b) / 2, vc = (c + d) / 2;
              table(uc - 0.4, uc + 0.4, vc - 0.4, vc + 0.4, y, 0.75, topC);
              chair(uc, vc - 0.62, [0, 1], y, 0x3a3530);
              chair(uc, vc + 0.62, [0, -1], y, 0x3a3530);
              if (four) { chair(uc - 0.62, vc, [1, 0], y, 0x3a3530); chair(uc + 0.62, vc, [-1, 0], y, 0x3a3530); }
            });
          }
          placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, true));
          wallArt(R, y, 2);
          break;
        }
        case 'office': {
          for (let t = 0; t < 3; t++)
            place(R, 1.4, 0.7, t % 2 ? sideA : -sideA, rng, (a, b, c, d, side) => {
              table(a, b, c, d, y, 0.75, wood);
              fit(D.monitor(), (a + b) / 2 - 0.3, (a + b) / 2 + 0.3, c + 0.1, d - 0.1, y + 0.75, side);
              facing(D.officeChair([0x3a3b3e, 0x2f4a5a, 0x5a3a3a][t % 3]), (a + b) / 2, side > 0 ? c - 0.35 : d + 0.35, y, [0, side > 0 ? 1 : -1]);
              if (t < 2) npcSpots.push([(a + b) / 2, side > 0 ? c - 0.35 : d + 0.35, y, yawTo(0, side), 0.5]);
            });
          // an open floor fills with pods of four desks (a big office is desks, not a dance floor) —
          // plain boxes, a few hundred vertices a pod, and a dozen pods a building at most
          const pods = Math.min(6, Math.floor(roomArea(R) / 28), podsLeft);
          for (let t = 0; t < pods; t++)
            placeFree(R, 2.9, 2.6, rng, (a, b, c, d) => {
              podsLeft--;
              const uc = (a + b) / 2, vc = (c + d) / 2;
              for (const [du, dv] of [[-0.72, -0.4], [0.72, -0.4], [-0.72, 0.4], [0.72, 0.4]]) {
                const out = dv > 0 ? 1 : -1, cv = vc + dv + out * 0.55, seat = [0x3a3b3e, 0x2f4a5a, 0x5a3a3a][(t + (du > 0 ? 1 : 0)) % 3];
                box(uc + du - 0.7, uc + du + 0.7, vc + dv - 0.35, vc + dv + 0.35, y + 0.71, y + 0.74, 0xd8d2c4, IP.wood); // the desk top
                box(uc + du - 0.68, uc + du - 0.64, vc + dv - 0.3, vc + dv + 0.3, y, y + 0.71, 0x8d9296); // its legs
                box(uc + du + 0.64, uc + du + 0.68, vc + dv - 0.3, vc + dv + 0.3, y, y + 0.71, 0x8d9296);
                box(uc + du - 0.26, uc + du + 0.26, vc + dv - out * 0.12 - 0.02, vc + dv - out * 0.12 + 0.02, y + 0.84, y + 1.14, 0x22252a, IP.glass); // the screen, facing its chair
                box(uc + du - 0.03, uc + du + 0.03, vc + dv - out * 0.12 - 0.02, vc + dv - out * 0.12 + 0.02, y + 0.74, y + 0.84, 0x3a3b3e); // its stand
                box(uc + du - 0.24, uc + du + 0.24, cv - 0.22, cv + 0.22, y + 0.44, y + 0.52, seat, IP.fabric); // the chair: seat, back, post
                box(uc + du - 0.22, uc + du + 0.22, cv + out * 0.2 - 0.03, cv + out * 0.2 + 0.03, y + 0.52, y + 1.0, seat, IP.fabric);
                box(uc + du - 0.03, uc + du + 0.03, cv - 0.03, cv + 0.03, y + 0.05, y + 0.44, 0x2a2b2e);
              }
              box(uc - 1.42, uc + 1.42, vc - 0.03, vc + 0.03, y + 0.74, y + 1.12, 0x9fb3a5, IP.fabric); // the low screen down the middle
              if (t < 3) npcSpots.push([uc - 0.72, vc - 0.95, y, yawTo(0, 1), 0.5]);
              claim(a - 0.6, b + 0.6, c - 0.9, d + 0.9, R.level);
            });
          place(R, 0.9, 0.5, sideA, rng, (a, b, c, d) => box(a, b, c, d, y, y + 1.3, 0x8d9296), true);
          placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, true));
          wallArt(R, y, 1);
          break;
        }
        case 'church': {
          const dir = P.ud > 0 ? -1 : 1; // altar at the far end from the door
          const alt = dir > 0 ? R.u1 - 1.5 : R.u0 + 0.5;
          box(alt, alt + 1.0, -1.1, 1.1, y, y + 1.0, 0xf4f1ea);
          box(alt - 0.02, alt + 1.02, -1.0, 1.0, y + 1.0, y + 1.02, 0xe9dfc4, IP.fabric);
          box(alt + 0.45, alt + 0.55, -0.05, 0.05, y + 1.02, y + 2.4, 0xc9a74a);
          box(alt + 0.45, alt + 0.55, -0.45, 0.45, y + 1.9, y + 2.0, 0xc9a74a);
          for (const vv of [-0.8, 0.8]) { box(alt + 0.45, alt + 0.55, vv - 0.04, vv + 0.04, y + 1.02, y + 1.35, 0xf6f1de); box(alt + 0.47, alt + 0.53, vv - 0.02, vv + 0.02, y + 1.35, y + 1.43, 0xffd890, IP.glow); glowAt(alt + 0.5, vv, y + 1.4, 0.35); }
          flatQuad(Math.min(alt, R.u0 + 0.5), Math.max(alt, R.u1 - 0.5), -0.55, 0.55, y, 0x8c2f2a, IP.rug, 2.1 + 10 * 1);
          for (let u = dir > 0 ? R.u0 + 1.5 : R.u0 + 3.0; dir > 0 ? u < alt - 1.5 : u < R.u1 - 1.0; u += 1.1) {
            for (const [lo, hi] of LP.spans(u + 0.2)) {
              for (const [v0, v1] of [[lo + 0.4, -0.7], [0.7, hi - 0.4]]) {
                if (v1 - v0 < 1 || !free(u, u + 0.45, v0, v1, 0)) continue;
                box(u, u + 0.45, v0, v1, y + 0.4, y + 0.46, 0x6f4b33, IP.wood);
                box(dir > 0 ? u : u + 0.37, dir > 0 ? u + 0.08 : u + 0.45, v0, v1, y, y + 0.95, 0x6f4b33, IP.wood);
                box(u + 0.05, u + 0.4, v0, v0 + 0.06, y, y + 0.46, 0x6f4b33, IP.wood);
                box(u + 0.05, u + 0.4, v1 - 0.06, v1, y, y + 0.46, 0x6f4b33, IP.wood);
              }
            }
          }
          npcSpots.push([alt - dir * 2.5, 0, y, dir > 0 ? -Math.PI / 2 : Math.PI / 2]);
          break;
        }
        case 'lobby':
          // a big lobby: seating groups round low tables and planters in proportion to its floor
          for (let t = 0; t < Math.min(4, Math.floor(roomArea(R) / 60)); t++)
            placeFree(R, 3.2, 2.6, rng, (a, b, c, d) => {
              const uc = (a + b) / 2, vc = (c + d) / 2;
              table(uc - 0.5, uc + 0.5, vc - 0.3, vc + 0.3, y, 0.42, wood);
              facing(D.armchair(0.8, 0.8, fab), uc - 1.05, vc, y, [1, 0]);
              facing(D.armchair(0.8, 0.8, fab), uc + 1.05, vc, y, [-1, 0]);
              plant(uc, vc - 1.0, y, true);
              if (t < 2) npcSpots.push([uc - 1.0, vc, y, yawTo(1, 0), 0.45]);
            });
          place(R, 2.1, 0.9, sideA, rng, (a, b, c, d, side) => sofa(a, b, c, d, side, y, fab));
          place(R, 1.8, 0.7, -sideA, rng, (a, b, c, d, side) => { box(a, b, c, d, y, y + 1.05, wood, IP.wood); box(a - 0.03, b + 0.03, c - 0.03, d + 0.03, y + 1.05, y + 1.09, 0x3a3530); npcSpots.push([(a + b) / 2, side > 0 ? c - 0.4 : d + 0.4, y, yawTo(0, side)]); });
          place(R, 1.4, 0.3, sideA, rng, (a, _b, c, d) => { for (let r = 0; r < 5; r++) for (let i = 0; i < 6; i++) box(a + i * 0.23 + 0.01, a + (i + 1) * 0.23 - 0.01, c, d, y + 0.8 + r * 0.22, y + 0.99 + r * 0.22, 0xb89468, IP.wood); }, true);
          for (let i = 0; i < 2; i++) placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, true));
          placeFree(R, 2.2, 1.4, rng, (a, b, c, d) => rug(a, b, c, d, y));
          wallArt(R, y, 2);
          break;
      }
      // an entry console with keys + coat hooks near the front door
      if (R.level === 0 && R.slab === doorSlab && fp.kind === 'house') {
        place(R, 0.9, 0.35, P.vd > 0 ? -1 : 1, rng, (a, b, c, d) => { table(a, b, c, d, y, 0.8, wood); box(a + 0.2, a + 0.4, c + 0.08, d - 0.08, y + 0.8, y + 0.86, 0xc9a24b, IP.porcelain); });
      }
      // Big rooms get lived-in clutter in proportion to their floor area.
      if (R.role === 'church') continue;
      const area = roomArea(R);
      const extra = Math.min(10, Math.floor(area / 8));
      const homey = R.role !== 'shop' && R.role !== 'cafe' && R.role !== 'office' && R.role !== 'diner' && R.role !== 'bar';
      // the end walls: a sideboard with things on it, a tall bookcase, a chest under a picture
      if (homey) {
        placeEnd(R, 1.4, 0.45, rng, (a, b, c, d) => {
          box(a, b, c, d, y + 0.08, y + 0.85, wood, IP.wood);
          legs(a, b, c, d, y, 0.08, wood);
          for (let i = 0; i < 3; i++) box(a + 0.1, b - 0.1, c + 0.15 + i * 0.4, c + 0.3 + i * 0.4, y + 0.85, y + 0.95 + rng.float() * 0.3, [0x7fa0b8, 0xe0a33b, 0xf1ede4, 0xa65a44][Math.floor(rng.float() * 4)], IP.porcelain);
          lamp((a + b) / 2, d - 0.2, y + 0.85, 0.45);
        });
        if (area > 14) placeEnd(R, 0.9, 0.36, rng, (a, b, c, d) => {
          box(a, b, c, d, y, y + 1.95, wood, IP.wood);
          for (let r = 0; r < 5; r++) box(a + 0.02, b - 0.02, c + 0.03, d - 0.03, y + 0.02 + r * 0.42, y + 0.05 + r * 0.42, new THREE.Color(wood).multiplyScalar(0.8), IP.wood);
          for (let r = 0; r < 4; r++) {
            let vv = c + 0.04;
            while (vv < d - 0.1) { const w = 0.03 + rng.float() * 0.05, h = 0.2 + rng.float() * 0.12; if (rng.float() > 0.12) box(a + 0.03, b - 0.03, vv, vv + w, y + 0.06 + r * 0.42, y + 0.06 + r * 0.42 + h, FABRIC[Math.floor(rng.float() * FABRIC.length)]); vv += w + 0.005; }
          }
        });
      }
      for (let k = 0; k < extra; k++) {
        const pick = rng.float();
        // businesses are furnished by their role above; the generic clutter is for homes
        if (!homey) { if (pick < 0.12) placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, true)); else if (pick > 0.9) wallArt(R, y, 1); continue; }
        if (pick < 0.2) placeFree(R, 0.5, 0.5, rng, (a, b, c, d) => plant((a + b) / 2, (c + d) / 2, y, rng.float() < 0.6));
        else if (pick < 0.35 && homey) place(R, 0.5, 0.5, rng.float() < 0.5 ? 1 : -1, rng, (a, b, c, d) => { table(a, b, c, d, y, 0.6, wood); lamp((a + b) / 2, (c + d) / 2, y + 0.6, 0.45); });
        else if (pick < 0.5 && homey) place(R, 1.2, 0.45, rng.float() < 0.5 ? 1 : -1, rng, (a, b, c, d) => {
          box(a, b, c, d, y + 0.08, y + 0.8, wood, IP.wood);
          legs(a, b, c, d, y, 0.08, wood);
          for (let i = 0; i < 3; i++) box(a + 0.15 + i * 0.35, a + 0.3 + i * 0.35, c + 0.1, d - 0.1, y + 0.8, y + 0.8 + 0.1 + rng.float() * 0.25, [0x7fa0b8, 0xe0a33b, 0xf1ede4, 0xa65a44][Math.floor(rng.float() * 4)], IP.porcelain);
        });
        else if (pick < 0.62 && homey) placeFree(R, 0.8, 0.8, rng, (a, b, c, d) => {
          // an armchair turned toward the room's middle
          const uc = (a + b) / 2, vc = (c + d) / 2, face: [number, number] = rng.float() < 0.5 ? [1, 0] : [-1, 0];
          facing(D.armchair(0.8, 0.8, FABRIC[Math.floor(rng.float() * FABRIC.length)]), uc, vc, y, face);
          npcSpots.push([uc + face[0] * 0.04, vc, y, yawTo(face[0], 0), 0.47]);
        });
        else if (pick < 0.72 && homey) place(R, 1.0, 0.4, rng.float() < 0.5 ? 1 : -1, rng, (a, b, c, d) => {
          box(a, b, c, d, y, y + 1.2, wood, IP.wood);
          for (let r = 0; r < 3; r++) box(a + 0.03, b - 0.03, c + 0.02, d - 0.02, y + 0.02 + r * 0.4, y + 0.05 + r * 0.4, new THREE.Color(wood).multiplyScalar(0.8), IP.wood);
          books(a, b, c, d, y, 3, 0.4);
        }, true);
        else if (pick < 0.82 && homey) placeFree(R, 1.8, 1.3, rng, (a, b, c, d) => rug(a, b, c, d, y));
        else if (pick < 0.9 && homey) place(R, 1.0, 0.42, rng.float() < 0.5 ? 1 : -1, rng, (a, b, c, d, side) => fit(D.chestBench(b - a, d - c, [wood, 0x6e5a48, 0xe9e2d0][Math.floor(rng.float() * 3)], FABRIC[Math.floor(rng.float() * FABRIC.length)]), a, b, c, d, y, side));
        else wallArt(R, y, 1);
      }
    }

    // Residents: a few people where people would be.
    yield; // all geometry accumulated — assemble
    const group = new THREE.Group();
    group.add(new THREE.Mesh(m.geometry(), this.mat));
    // how many: a few at home; a business has its staff and a room of customers
    const busy = fp.kind === 'commercial' || fp.kind === 'church';
    const n = Math.min(NPC_MAX, npcSpots.length, busy ? 2 + Math.floor(rng.float() * 6) : 1 + Math.floor(rng.float() * 3));
    if (n > 0) {
      const SH = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0xf2efe6, 0x3f6f78];
      const stand: [THREE.Matrix4, THREE.Color][] = [], sit: [THREE.Matrix4, THREE.Color][] = [];
      const used = new Set<number>();
      const ang = Math.atan2(P.uz, P.ux);
      const staff = npcSpots.map((s, k) => (s[5] ? k : -1)).filter((k) => k >= 0);
      for (let i = 0; i < n; i++) {
        // staff first (a shop is never unattended), then customers / residents at random
        let k = i < staff.length ? staff[i] : Math.floor(rng.float() * npcSpots.length);
        for (let t = 0; t < 8 && used.has(k); t++) k = Math.floor(rng.float() * npcSpots.length);
        if (used.has(k)) continue;
        used.add(k);
        const [u, v, y, yaw, seat] = npcSpots[k];
        const w = toW(P, u, v);
        const col = new THREE.Color(SH[Math.floor(rng.float() * SH.length)]);
        const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -ang + yaw + (seat ? rng.range(-0.15, 0.15) : rng.range(-0.4, 0.4)));
        // seated: the pose puts the hips 0.45 m up — raise it to the seat (a bar stool is 0.76)
        if (seat) sit.push([new THREE.Matrix4().compose(V3(w[0], y + seat - 0.45, w[1]), q, V3(1, 1, 1)), col]);
        else {
          stand.push([new THREE.Matrix4().compose(V3(w[0], y, w[1]), q, V3(1, 1, 1)), col]);
          // a standing resident at home often has company: a second person a step away facing
          // them (chatting) — or, when that's the counter, alongside them (cooking together)
          if (!busy && i === 0 && rng.float() < 0.5) {
            const level = Math.round((y - f0) / Math.max(0.1, fH));
            const fu = -Math.sin(yaw), fv = -Math.cos(yaw); // this resident's facing in u/v
            for (const [du, dv, turn] of [[fu * 1.05, fv * 1.05, Math.PI], [-fv * 0.65, fu * 0.65, 0], [fv * 0.65, -fu * 0.65, 0]] as const) {
              const u2 = u + du, v2 = v + dv;
              if (!free(u2 - 0.22, u2 + 0.22, v2 - 0.22, v2 + 0.22, level)) continue;
              const w2 = toW(P, u2, v2);
              const q2 = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -ang + yaw + turn + rng.range(-0.2, 0.2));
              stand.push([new THREE.Matrix4().compose(V3(w2[0], y, w2[1]), q2, V3(1, 1, 1)), new THREE.Color(SH[Math.floor(rng.float() * SH.length)])]);
              break;
            }
          }
        }
      }
      for (const [list, mat] of [[stand, this.npcMat], [sit, this.npcSeatMat]] as const) {
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(this.npcGeo, mat, Math.min(NPC_MAX, list.length));
        list.slice(0, NPC_MAX).forEach(([m4, c], i) => { im.setMatrixAt(i, m4); im.setColorAt(i, c); });
        im.frustumCulled = false;
        group.add(im);
      }
    }
    this.lights = lights;
    return group;
  }
}

const NPC_MAX = 12; // residents an interior shows at once (the shared ped geometry's aAnim covers this many)
const STAFF_AISLE = 0.9; // the working aisle behind a shop, café or bar counter
const ringSign = (r: P2[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a > 0 ? 1 : -1;
};
function ringDist(r: P2[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

function interiorMaterial(I: Interiors) {
  return paintMaterial({
    uniforms: {
      uLights: I.lightsU, uFrame: I.frameU, uDims: I.dimsU, uLevels: I.levelsU, uDoor: I.doorU, uCuts: I.cutsU, uCuts2: I.cuts2U,
      uRoomA: I.roomAU, uRoomB: I.roomBU, uFab: I.fabU, uWindowColor: { value: lin(0xffc27a) },
    },
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute vec4 aWall;
      attribute vec4 aInfo;
      attribute vec2 aOut;
      varying vec3 vColor;
      varying vec4 vWall;
      flat varying vec4 vInfo;
      flat varying vec2 vOut;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vColor = color; vWall = aWall; vInfo = aInfo; vOut = aOut;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform vec4 uLights[8];
      uniform vec4 uFrame, uLevels, uDoor, uCuts, uCuts2;
      uniform vec2 uDims;
      uniform vec4 uRoomA[56], uRoomB[56];
      uniform vec3 uWindowColor, uFab;
      varying vec3 vColor;
      varying vec4 vWall;
      flat varying vec4 vInfo;
      flat varying vec2 vOut;
      ${GLSL_WINDOWS}

      // a little watercolour on the wall: sea, sky, dune — or a sailboat, or a bunch of washes
      vec3 painting(vec2 st, float style) {
        float k = floor(style), h = fract(style);
        float hz = 0.42 + 0.2 * h;
        vec3 sky = mix(vec3(0.95, 0.85, 0.7), vec3(0.55, 0.72, 0.86), st.y);
        vec3 sea = mix(vec3(0.2, 0.42, 0.55), vec3(0.35, 0.58, 0.66), st.y / hz);
        vec3 c = st.y > hz ? sky : sea;
        if (st.y < hz * 0.45 + 0.05 * sin(st.x * 9.0 + h * 6.0)) c = vec3(0.88, 0.8, 0.62);
        if (k > 0.5 && k < 1.5) { vec2 b = st - vec2(0.3 + h * 0.4, hz); if (b.y > 0.0 && b.y < 0.28 && abs(b.x) < b.y * 0.6) c = vec3(0.97, 0.95, 0.9); }
        if (k > 1.5 && k < 2.5) c = mix(vec3(0.85, 0.62, 0.45), vec3(0.4, 0.55, 0.7), smoothstep(0.2, 0.8, st.x + 0.3 * sin(st.y * 5.0 + h * 9.0)));
        if (k > 2.5 && k < 3.5) { float r = length(st - vec2(0.5, 0.55)); c = mix(vec3(0.95, 0.9, 0.8), vec3(0.85, 0.35, 0.3), smoothstep(0.25, 0.2, r)); c = mix(c, vec3(0.35, 0.55, 0.3), step(r, 0.08)); }
        if (k > 3.5) c = mix(vec3(0.96, 0.94, 0.88), vec3(0.2, 0.3, 0.45), step(0.5, fract((st.x + st.y) * 3.0 + h)) * 0.25);
        return c * (0.92 + 0.12 * vnoise(st * 14.0));
      }

      void main() {
        vec3 N = normalize(vNormalW);
        if (!gl_FrontFacing) N = -N;
        vec3 alb = vColor;
        float part = vInfo.z;
        float emis = 0.0, gloss = 0.0;
        float f0 = uLevels.x, fH = uLevels.y;
        float yl = mod(vWorldPos.y - f0, fH);
        vec2 rel = vWorldPos.xz - uFrame.xy;
        vec2 ua = uFrame.zw, va = vec2(-uFrame.w, uFrame.z);
        float pu = dot(rel, ua), pv = dot(rel, va);
        // which room am I in? (faces sample a hand's width into the room they look at)
        float pus = pu + dot(N.xz, ua) * 0.12;
        float slab = 0.0, nr = uCuts2.z; // (the cuts are in order: the last one passed is the room)
        if (nr > 1.5 && pus >= uCuts.x) slab = 1.0;
        if (nr > 2.5 && pus >= uCuts.y) slab = 2.0;
        if (nr > 3.5 && pus >= uCuts.z) slab = 3.0;
        if (nr > 4.5 && pus >= uCuts.w) slab = 4.0;
        if (nr > 5.5 && pus >= uCuts2.x) slab = 5.0;
        if (nr > 6.5 && pus >= uCuts2.y) slab = 6.0;
        float lvl = clamp(floor((vWorldPos.y - f0 + 0.05) / fH), 0.0, 7.0);
        int ri = int(lvl * 7.0 + slab);
        vec4 RA = uRoomA[ri], RB = uRoomB[ri];
        if (part < 0.5 || (part > 5.5 && part < 6.5)) {
          alb = RA.rgb;
          float style = RA.w;
          if (part < 0.5) {
            vec3 NO = normalize(vec3(vOut.x, 0.0, vOut.y));
            Win W = windowAt(vWall.x, vWall.y, vWall.z, vWall.w, seedOf(vInfo.x), vInfo.y, vInfo.w, NO);
            if (W.ok) {
              float inner = step(abs(W.cu), W.ww * 0.5 - 0.08) * step(abs(W.cy), W.wh * 0.5 - 0.08) * archIn(W, W.cu, W.cy, 0.08);
              if (inner > 0.5) discard;
              float frame = step(abs(W.cu), W.ww * 0.5 + 0.04) * step(abs(W.cy), W.wh * 0.5 + 0.06);
              // curtains + a valance, pulled to the sides
              if (!W.store && vInfo.y < 3.5) {
                float side = step(W.ww * 0.5 + 0.04, abs(W.cu)) * step(abs(W.cu), W.ww * 0.5 + 0.34) * step(-W.wh * 0.5 - 0.2, W.cy) * step(W.cy, W.wh * 0.5 + 0.28);
                float val = step(abs(W.cu), W.ww * 0.5 + 0.34) * step(W.wh * 0.5 + 0.08, W.cy) * step(W.cy, W.wh * 0.5 + 0.3);
                float fold = 0.85 + 0.15 * sin(W.cu * 40.0);
                alb = mix(alb, uFab * fold, max(side, val) * step(0.3, fract(seedOf(vInfo.x) * 7.0)));
                if (frame > 0.5 && max(side, val) < 0.5) alb = vec3(0.95, 0.94, 0.9);
              } else if (frame > 0.5) alb = vec3(0.95, 0.94, 0.9);
            }
            // front doorway
            vec2 dd = vWorldPos.xz - uLevels.zw;
            if (length(dd) < uDoor.y + 0.03 && vWorldPos.y > uDoor.x - 0.05 && vWorldPos.y < uDoor.x + uDoor.z) discard;
          }
          // wallpaper / wainscot / tile by room
          if (style > 0.5 && style < 1.5) { if (yl < 0.9) alb = vec3(0.94, 0.93, 0.89) * (0.94 + 0.06 * step(0.5, fract(dot(vWorldPos.xz, va) * 3.0 + dot(vWorldPos.xz, ua) * 3.0))); if (abs(yl - 0.9) < 0.03) alb = vec3(0.85, 0.82, 0.76); }
          else if (style > 1.5 && style < 2.5) alb *= 0.9 + 0.1 * step(0.5, fract((dot(vWorldPos.xz, ua) + dot(vWorldPos.xz, va)) / 0.12));
          else if (style > 2.5 && style < 3.5) { vec2 g = fract(vec2(dot(vWorldPos.xz, ua) + dot(vWorldPos.xz, va), vWorldPos.y) / 0.18) - 0.5; alb = mix(alb, alb * 0.72, step(length(g), 0.12)); }
          else if (style > 3.5 && style < 4.5 && yl < 1.3) { vec2 g = fract(vec2(dot(vWorldPos.xz, ua) + dot(vWorldPos.xz, va), vWorldPos.y) / 0.15); alb = mix(vec3(0.95, 0.96, 0.95), vec3(0.78, 0.8, 0.8), step(0.93, max(g.x, g.y))); gloss = 0.25; }
          else if (style > 4.5 && yl < 1.1) alb = mix(vec3(0.55, 0.4, 0.28), vec3(0.62, 0.46, 0.32), step(0.5, fract(dot(vWorldPos.xz, ua + va) / 0.6)));
          if (yl < 0.12) alb = vec3(0.45, 0.36, 0.28); // baseboard
          alb *= 0.96 + 0.06 * vnoise(vWorldPos.xz * 3.0 + vWorldPos.y * 2.0);
        } else if (part < 1.5) {
          alb = RB.rgb;
          float ft = RB.w;
          if (ft < 0.5) {
            float plank = floor(pv / 0.16);
            float joint = floor((pu + hash12(vec2(plank, 3.0)) * 2.0) / 1.4);
            alb *= 0.82 + 0.26 * hash12(vec2(plank, joint));
            alb *= 1.0 - 0.35 * step(fract(pv / 0.16), 0.06);
            gloss = 0.12;
          } else if (ft < 1.5) {
            vec2 g = fract(vec2(pu, pv) / 0.3);
            alb *= 0.93 + 0.1 * step(0.5, mod(floor(pu / 0.3) + floor(pv / 0.3), 2.0));
            alb = mix(alb, vec3(0.7, 0.7, 0.68), step(0.95, max(g.x, g.y)));
            gloss = 0.2;
          } else if (ft < 2.5) alb *= 0.95 + 0.06 * vnoise(vec2(pu, pv) * 6.0);
          else { vec2 g = fract(vec2(pu, pv) / 0.6); alb *= 0.95 + 0.07 * step(0.5, mod(floor(pu / 0.6) + floor(pv / 0.6), 2.0)); alb = mix(alb, alb * 0.85, step(0.97, max(g.x, g.y))); gloss = 0.15; }
        } else if (part < 2.5) {
          alb *= 0.97;
        } else if (part > 3.5 && part < 4.5) {
          emis = 1.0;
        } else if (part > 4.5 && part < 5.5) {
          alb = painting(vWall.xy, vWall.z);
        } else if (part > 6.5 && part < 7.5) {
          alb *= 0.88 + 0.2 * vnoise(vWorldPos.xz * 30.0 + vWorldPos.y * 30.0);
        } else if (part > 7.5 && part < 8.5) {
          // rug: border, field and a pattern
          vec2 st = vWall.xy;
          float style = vWall.z, k = mod(floor(style), 10.0);
          vec3 c2 = mix(vec3(0.93, 0.9, 0.82), vec3(0.3, 0.35, 0.45), step(0.5, fract(floor(style / 10.0) * 0.37)));
          vec2 e = min(st, 1.0 - st) * vec2(vWall.w, vWall.w);
          float border = step(min(e.x, e.y), 0.12);
          if (k < 0.5) alb = mix(alb, c2, border);
          else if (k < 1.5) alb = mix(alb, c2, step(0.5, fract(st.x * 7.0)) * 0.6);
          else if (k < 2.5) alb = mix(alb, c2, border + step(abs(st.y - 0.5), 0.04) * 0.8);
          else { vec2 g = abs(fract(st * vec2(4.0, 3.0)) - 0.5); alb = mix(alb, c2, step(g.x + g.y, 0.25) + border); }
          alb *= 0.88 + 0.2 * vnoise(vWorldPos.xz * 25.0);
        } else if (part > 8.5 && part < 9.5) {
          gloss = 0.45;
        } else if (part > 9.5 && part < 10.5) {
          vec3 V = normalize(vWorldPos - (cameraPosition + uWorldOffset));
          alb = mix(alb, mix(uSkyHorizon, vec3(0.9, 0.88, 0.84), 0.5), 0.35 + 0.3 * pow(1.0 - abs(dot(V, N)), 2.0));
          gloss = 0.6;
        } else if (part > 10.5 && part < 11.5) {
          float g = vnoise(vec2(dot(vWorldPos.xz, ua) * 1.5 + vWorldPos.y * 1.5, dot(vWorldPos.xz, va) * 20.0 + vWorldPos.y * 20.0));
          alb *= 0.88 + 0.22 * g;
          gloss = 0.1;
        } else if (part > 11.5) {
          // railing panel: top rail, bottom rail, balusters
          float u = vWall.x, v = vWall.y, h = vWall.w;
          bool solid = v > h - 0.07 || v < 0.06 || fract(u / 0.12) < 0.3;
          if (!solid) discard;
        }
        alb = pigment(alb, vWorldPos);
        // daylight spilling in from the windows + warm lamps (lamps light only their own storey)
        vec3 amb = mix(vec3(0.5, 0.46, 0.42), uAmbSky * 1.5, 0.5) * (0.12 + 0.55 * (1.0 - uNight));
        // daylight falls off away from the outer walls (where the windows are), and the room's
        // edges — along the floor and under the ceiling — sit a little darker
        float dW = min(uDims.x - abs(pu), uDims.y - abs(pv));
        amb *= mix(mix(1.25, 0.72, smoothstep(0.5, 4.0, dW)), 1.0, uNight);
        amb *= mix(0.78, 1.0, smoothstep(0.0, 0.35, yl) * smoothstep(0.0, 0.45, fH - yl));
        vec3 lamp = vec3(0.0);
        vec3 V = normalize((cameraPosition + uWorldOffset) - vWorldPos);
        float spec = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 L = uLights[i];
          if (L.w <= 0.0) continue;
          vec3 d = L.xyz - vWorldPos;
          float same = step(L.y - fH + 0.05, vWorldPos.y) * step(vWorldPos.y, L.y + 0.4);
          float att = L.w / (1.0 + dot(d, d) * 0.22);
          vec3 ld = normalize(d);
          lamp += uWindowColor * att * same * (0.35 + 0.65 * max(dot(N, ld), 0.0));
          spec += att * same * pow(max(dot(reflect(-ld, N), V), 0.0), 24.0);
        }
        vec3 col = alb * (amb + lamp * (0.55 + 0.6 * uNight));
        // Sun through the windows: follow the ray toward the sun to the outer wall it leaves by,
        // and light this point if it passes through a pane (house windows: 0.9–2.25 m above the
        // floor, one per ~2.7 m of wall). Warm pools on the floorboards, slanting up the walls.
        if (uKeyDir.y > 0.04 && uNight < 0.5) {
          vec2 sd = vec2(dot(uKeyDir.xz, ua), dot(uKeyDir.xz, va));
          float hl = length(sd);
          if (hl > 1e-3) {
            vec2 hd = sd / hl;
            float tu = hd.x > 0.0 ? (uDims.x - pu) / hd.x : hd.x < 0.0 ? (-uDims.x - pu) / hd.x : 1e9;
            float tv = hd.y > 0.0 ? (uDims.y - pv) / hd.y : hd.y < 0.0 ? (-uDims.y - pv) / hd.y : 1e9;
            float t = min(tu, tv);
            float hitY = yl + t * uKeyDir.y / hl;
            float along = tu < tv ? pv + t * hd.y : pu + t * hd.x;
            float cellW = 2.7, cu = (fract(along / cellW) - 0.5) * cellW;
            // a crisp window shape with its muntin cross (sash bars) printed in the light
            float pane = (1.0 - smoothstep(0.455, 0.475, abs(cu))) * smoothstep(0.9, 0.92, hitY) * (1.0 - smoothstep(2.23, 2.25, hitY));
            pane *= smoothstep(0.018, 0.03, abs(cu)) * smoothstep(0.018, 0.03, abs(hitY - 1.575));
            float sun = pane * step(t, 7.0) * max(dot(N, uKeyDir), 0.0) * (1.0 - smoothstep(0.2, 0.5, uNight));
            col += alb * uKeyColor * sun * 1.5;
          }
        }
        col += uWindowColor * spec * gloss * 0.6;
        col += uWindowColor * emis * 2.2;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
