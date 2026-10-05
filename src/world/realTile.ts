// OSM (Overpass) elements -> TileJson for streamed "world" tiles (Phase H1 real-lite).
// Shared by the Cloudflare tile worker (worker/src/index.js, bundled verbatim) and the
// client test-suite. Deliberately pure: no three.js, no DOM, runtime-free — only the
// local type imports below, which erase at build time.
//
// The tag tables (ROAD_W / ROOF_TAG / CLS_* / colour maps) mirror scripts/bake.mjs and
// scripts/lib/colour.mjs — keep them in sync when the bake's mappings change. Ownership
// semantics mirror scripts/lib/tiles.mjs partitionEntities: entities within the 48 m
// margin emit for context; `own: 0` marks the ones a neighbour cell owns.
import type { Area, Box, Building, Line, Point, Road, TileJson } from './data';
import { sportOf } from './sports';
import { inclineOf } from './grade';
import { worldRegion } from './styles';
import { overpassStatements } from './osmQuery';

export interface LatLon { lat: number; lon: number }
export interface OsmNode { lat: number; lon: number }
export interface OsmMember { type: string; ref: number; role?: string; geometry?: (OsmNode | null)[] }
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: (OsmNode | null)[];
  members?: OsmMember[];
}
export interface OsmDoc { elements?: OsmElement[]; osm3s?: { timestamp_osm_base?: string } }

// ---------------- projection (origin-parameterized port of scripts/lib/geo.mjs) ----------------

const KR = (Math.PI / 180) * 6378137;

export function makeProjector(origin: LatLon) {
  const COS0 = Math.cos((origin.lat * Math.PI) / 180);
  const project = (lat: number, lon: number): [number, number] => [(lon - origin.lon) * KR * COS0, -(lat - origin.lat) * KR];
  const unproject = (x: number, z: number): [number, number] => [origin.lat - z / KR, origin.lon + x / (KR * COS0)];
  const bboxToLocal = (b: { s: number; w: number; n: number; e: number }): Box => {
    const [x0, z0] = project(b.n, b.w);
    const [x1, z1] = project(b.s, b.e);
    return { x0, z0, x1, z1 };
  };
  const localToBbox = (b: Box) => {
    const [n, w] = unproject(b.x0, b.z0);
    const [s, e] = unproject(b.x1, b.z1);
    return { s, w, n, e };
  };
  return { project, unproject, bboxToLocal, localToBbox };
}

// ---------------- geometry helpers (ports; keep aligned with scripts/lib/geo.mjs) ----------------

type P2 = [number, number];

const ringArea = (r: P2[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
};
export const pointInRing = (x: number, z: number, r: P2[]) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
/** pointInRing — the same answers — for many points against one big ring: its edges bucketed by z
 *  band over the window [z0, z1], so a point tests only the edges crossing its own row. (A cell on
 *  a Great Lake carries the lake's whole outline, 47,000 vertices: tested once a ground quad, it cost
 *  a Chicago cell 8 s of its build.) A point outside the window takes the plain test. */
export function ringTester(r: P2[], z0: number, z1: number, band = 16): (x: number, z: number) => boolean {
  const n = Math.max(1, Math.ceil((z1 - z0) / band));
  const rows: number[][] = [];
  for (let k = 0; k < n; k++) rows.push([]);
  const row = (z: number) => Math.min(n - 1, Math.max(0, Math.floor((z - z0) / band)));
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const lo = Math.min(r[i][1], r[j][1]), hi = Math.max(r[i][1], r[j][1]);
    if (hi < z0 || lo > z1) continue;
    for (let k = row(lo), b = row(hi); k <= b; k++) rows[k].push(i, j);
  }
  return (x, z) => {
    if (!(z >= z0 && z <= z1)) return pointInRing(x, z, r);
    const es = rows[row(z)];
    let inside = false;
    for (let q = 0; q < es.length; q += 2) {
      const [xi, zi] = r[es[q]], [xj, zj] = r[es[q + 1]];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
}

// Drop closing duplicate and near-duplicate / collinear vertices.
function cleanRing(r: P2[], eps = 0.15): P2[] {
  let pts = r.slice();
  if (pts.length > 1 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]) pts.pop();
  const out: P2[] = [];
  for (const p of pts) {
    const q = out.at(-1);
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) <= eps) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.abs(cross) / Math.max(len, 1e-6) < 0.05) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

// Join way fragments into closed rings by matching endpoints (multipolygon assembly).
function assembleRings(parts: P2[][]): P2[][] {
  const key = (p: P2) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const pool = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const rings: P2[][] = [];
  while (pool.length) {
    let ring = pool.pop()!;
    let guard = 0;
    while (key(ring[0]) !== key(ring.at(-1)!) && guard++ < 10000) {
      const end = key(ring.at(-1)!);
      const i = pool.findIndex((p) => key(p[0]) === end || key(p.at(-1)!) === end);
      if (i < 0) break;
      const next = pool.splice(i, 1)[0];
      if (key(next[0]) !== end) next.reverse();
      ring = ring.concat(next.slice(1));
    }
    if (key(ring[0]) === key(ring.at(-1)!) && ring.length > 3) rings.push(ring);
  }
  return rings;
}

// Join fragments into (possibly open) chains — coastline ways connect end-to-end across ways.
function assembleChains(parts: P2[][]): P2[][] {
  const key = (p: P2) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const pool = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const out: P2[][] = [];
  while (pool.length) {
    let chain = pool.pop()!;
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 10000) {
      moved = false;
      const s = key(chain[0]), e = key(chain.at(-1)!);
      const i = pool.findIndex((p) => key(p[0]) === e || key(p.at(-1)!) === e || key(p[0]) === s || key(p.at(-1)!) === s);
      if (i < 0) break;
      const next = pool.splice(i, 1)[0];
      if (key(next[0]) === e) chain = chain.concat(next.slice(1));
      else if (key(next.at(-1)!) === e) chain = chain.concat(next.slice(0, -1).reverse());
      else if (key(next.at(-1)!) === s) chain = next.concat(chain.slice(1));
      else chain = next.slice(0, -1).reverse().concat(chain);
      moved = true;
    }
    out.push(chain);
  }
  return out;
}

const segDist2 = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ez = az + t * dz - pz;
  return ex * ex + ez * ez;
};
function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
      if (d > md) (md = d), (mi = i);
    }
    if (md > t2) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Oriented bounding box aligned to the polygon's best edge direction (roof priors use .wid).
function obb(r: P2[]) {
  let best: { area: number; ang: number; u0: number; u1: number; v0: number; v1: number } | null = null;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of r) {
      const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ang, u0, u1, v0, v1 };
  }
  return { ang: best!.ang, len: best!.u1 - best!.u0, wid: best!.v1 - best!.v0, area: best!.area };
}

/** A length tag in metres: "120", "120 m", "394 ft", "394'", "12'6\"". NaN when unreadable. */
export function parseLen(v: unknown): number {
  if (v == null) return NaN;
  const s = String(v).trim().toLowerCase().replace(',', '.');
  const ft = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"|''))?$/.exec(s);
  if (ft) return parseFloat(ft[1]) * 0.3048 + (ft[2] ? parseFloat(ft[2]) * 0.0254 : 0);
  const f = parseFloat(s);
  return isFinite(f) ? f : NaN;
}

/** Metres per storey: office and apartment towers have taller floors than houses. */
export const storeyH = (floors: number) => (floors > 10 ? 3.7 : 3.1);

/** A plausible height for a mapped building (keep in sync with scripts/bake.mjs). Real towers keep
 *  their height — Midtown's canyon is the point — but a unit slip (feet typed as metres) or a typo
 *  can't turn a shed into a skyscraper: the floor count wins when the two disagree wildly, and an
 *  unverified tower needs a tower's footprint. Parts (spires, crowns) are exempt from the footprint
 *  test. NaN `h` = no height tag. */
// `roofLv`: mapped roof:levels — storeys in the roof (attics with dormers, mansards), on top of the
// building:levels below it: each stands ~2.6 m of roof over the eave.
export function plausibleHeight(h: number, floors: number | null, area: number, part = false, roofLv = 0): number {
  if (floors && floors > 0) {
    const est = floors * storeyH(floors) + 1.5 + roofLv * 2.6;
    if (!isFinite(h) || h > est * 2 + 20 || h < floors * 1.8) h = est;
  } else if (isFinite(h) && h > 100 && area < 120 && !part) h = 40;
  return isFinite(h) ? Math.min(h, 830) : NaN;
}

/** The inward offset of a ring by d metres (mitred, capped): lets an outline sit just inside the
 *  parts that share its walls instead of z-fighting with them. */
export function insetRing(r: P2[], d: number): P2[] {
  const s = ringArea(r) > 0 ? 1 : -1;
  const n = r.length;
  return r.map((p, i) => {
    const a = r[(i + n - 1) % n], b = r[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    // inward normals (ringArea > 0 winding): (-dz, dx)·s points inside
    const n1 = [(-e1[1] / l1) * s, (e1[0] / l1) * s], n2 = [(-e2[1] / l2) * s, (e2[0] / l2) * s];
    const mx = n1[0] + n2[0], mz = n1[1] + n2[1], ml = Math.hypot(mx, mz);
    if (ml < 1e-6) return [p[0] + n1[0] * d, p[1] + n1[1] * d] as P2;
    const k = Math.min(3, 1 / Math.max(0.2, (mx * n1[0] + mz * n1[1]) / ml)); // miter length, capped
    return [p[0] + (mx / ml) * d * k, p[1] + (mz / ml) * d * k] as P2;
  });
}

/** Flags dense attached buildings `at: 1` (see osmToTile). Exported for tests. */
export function markRows(buildings: Building[]) {
  type E = { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; L: number; bi: number };
  const G = 20, grid = new Map<number, E[]>();
  const gk = (i: number, j: number) => i * 92821 + j;
  const cover = new Map<number, number>(); // 80 m cells: footprint area
  const edges: E[][] = buildings.map((b, bi) => {
    const out: E[] = [];
    if (b.gen || b.pt) return out;
    const n = b.r.length >> 1;
    let a = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = b.r[i * 2] / 10, az = b.r[i * 2 + 1] / 10, bx = b.r[j * 2] / 10, bz = b.r[j * 2 + 1] / 10;
      a += (ax - bx) * (az + bz);
      cx += ax;
      cz += az;
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1) continue;
      const e: E = { ax, az, bx, bz, dx: (bx - ax) / L, dz: (bz - az) / L, L, bi };
      out.push(e);
      for (let gi = Math.floor((Math.min(ax, bx) - 1) / G); gi <= Math.floor((Math.max(ax, bx) + 1) / G); gi++)
        for (let gj = Math.floor((Math.min(az, bz) - 1) / G); gj <= Math.floor((Math.max(az, bz) + 1) / G); gj++) {
          const l = grid.get(gk(gi, gj));
          if (l) l.push(e);
          else grid.set(gk(gi, gj), [e]);
        }
    }
    const ck = gk(Math.floor(cx / n / 80), Math.floor(cz / n / 80));
    cover.set(ck, (cover.get(ck) ?? 0) + Math.abs(a / 2));
    return out;
  });
  const dense = (x: number, z: number) => {
    const i = Math.floor(x / 80), j = Math.floor(z / 80);
    let A = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) A += cover.get(gk(i + di, j + dj)) ?? 0;
    return A / (9 * 6400) >= 0.4;
  };
  buildings.forEach((b, bi) => {
    const es = edges[bi];
    if (!es.length) return;
    let per = 0, shared = 0, cx = 0, cz = 0;
    for (const e of es) {
      per += e.L;
      cx += e.ax;
      cz += e.az;
      // sample the wall every metre: a neighbour's parallel wall within 0.6 m is a party wall
      for (let t = 0.5; t < e.L; t += 1) {
        const x = e.ax + e.dx * t, z = e.az + e.dz * t;
        const cand = grid.get(gk(Math.floor(x / G), Math.floor(z / G))) ?? [];
        if (cand.some((f) => f.bi !== bi && Math.abs(e.dx * f.dx + e.dz * f.dz) > 0.95 && segDist(x, z, f) < 0.6)) shared++;
      }
    }
    if (shared >= 6 && shared >= per * 0.2 && dense(cx / es.length, cz / es.length)) b.at = 1;
  });
}
function segDist(x: number, z: number, f: { ax: number; az: number; dx: number; dz: number; L: number }) {
  const t = Math.max(0, Math.min(f.L, (x - f.ax) * f.dx + (z - f.az) * f.dz));
  return Math.hypot(x - (f.ax + f.dx * t), z - (f.az + f.dz * t));
}

// Deterministic 32-bit hash (FNV-1a) — building seeds come from the OSM element id.
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) (h ^= s.charCodeAt(i)), (h = Math.imul(h, 16777619));
  return h >>> 0;
}

// ---------------- colour tables (port of scripts/lib/colour.mjs — keep in sync) ----------------

const NAMED: Record<string, number> = {
  white: 0xf2efe6, ivory: 0xf2ecd8, cream: 0xeee3c4, beige: 0xdccdb0, tan: 0xc8b08a, wheat: 0xe0cfa6, linen: 0xefe7d8,
  grey: 0x9a9a96, gray: 0x9a9a96, lightgrey: 0xc4c4c0, lightgray: 0xc4c4c0, silver: 0xbfc1c2, darkgrey: 0x5c5d5f, darkgray: 0x5c5d5f,
  black: 0x2f3032, charcoal: 0x3c3e41, slategray: 0x6e7880, slategrey: 0x6e7880,
  red: 0x9c4436, darkred: 0x6f2e28, maroon: 0x6a2f2a, brick: 0x9a5646, terracotta: 0xb4623f, orange: 0xc77a3e, salmon: 0xd9937c, pink: 0xe2b3ad,
  brown: 0x7a5a42, saddlebrown: 0x7c4f2e, sienna: 0x8f5a3c, chocolate: 0x7a4a2c, peru: 0xb98150,
  yellow: 0xe6cf7a, gold: 0xd9b54a, khaki: 0xcfc08a, olive: 0x7d7a48,
  green: 0x6b8a5a, darkgreen: 0x3f5a3a, lightgreen: 0xa9c79a, teal: 0x3f7f7a, turquoise: 0x6fb8b0,
  blue: 0x5a7fa6, lightblue: 0xaec6d8, navy: 0x2f3f5a, skyblue: 0x9cc2dc, steelblue: 0x5a7f9c, darkblue: 0x2c3e5c,
  purple: 0x6e5a82, lavender: 0xc9c0dc, copper: 0x5f8a7a,
};
function parseColour(v: unknown): number | null {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[\s_-]/g, '');
  const hex = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return parseInt(h, 16);
  }
  return NAMED[s] ?? null;
}
const FACADE_MAT: Record<string, number> = {
  brick: 0x9a5a48, stone: 0xb6ad9c, concrete: 0xbdb8ae, plaster: 0xe6dfd0, stucco: 0xe6dccb, wood: 0xb58e64, timber_framing: 0xe8dfcc,
  metal: 0xa9adb0, glass: 0x8fa5b2, sandstone: 0xd2b98e, limestone: 0xd9d0bb, vinyl: 0xe8e4da, cement_block: 0xb9b5ab, clay: 0xb87a55,
};
const materialColour = (v: unknown) => (v ? FACADE_MAT[String(v).toLowerCase().replace(/\s/g, '_')] ?? null : null);
const ROOF_MAT: Record<string, number> = {
  roof_tiles: 0xa85a3c, tile: 0xa85a3c, clay: 0xa85a3c, slate: 0x4f555c, metal: 0x8a9298, metal_sheet: 0x8a9298, copper: 0x5f8a7a,
  concrete: 0x9d9a92, asphalt_shingle: 0x5e5f61, asphalt: 0x5e5f61, tar_paper: 0x4a4b4d, wood: 0x7a6250, thatch: 0x9a8455,
  glass: 0x9ab3bf, stone: 0x77746e, gravel: 0x9a968c, grass: 0x6b7f4a, eternit: 0x8d8b86,
};
const roofMaterialColour = (v: unknown) => (v ? ROOF_MAT[String(v).toLowerCase().replace(/\s/g, '_')] ?? null : null);
/** Every roof colour a tag can resolve to by name or material — how a baked pack's mapped roof
 *  colours are told from its aerial samples (aerial.ts tileRoofs). */
export const TAG_ROOF_COLOURS: ReadonlySet<number> = new Set([...Object.values(NAMED), ...Object.values(ROOF_MAT)]);

// ---------------- tag tables (port of scripts/bake.mjs) ----------------

// (a motorway's or a trunk's ramps are its links — every interchange's on- and off-ramps)
const ROAD_W: Record<string, number> = { motorway: 14, motorway_link: 7, trunk: 12, trunk_link: 6.5, primary: 11, primary_link: 6, secondary: 9, secondary_link: 6, tertiary: 8, tertiary_link: 5, residential: 6.5, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, track: 3, footway: 1.8, path: 1.5, cycleway: 2, steps: 2, bridleway: 2, construction: 5 };
const PARK_DEFAULT = new Set(['residential', 'unclassified', 'tertiary', 'secondary']);
/** Tall structures built from the map's own point (props.ts, assets/tower.ts): a lattice mast (TV,
 *  radio, phone), a water tower, a chimney, a flagpole — trees never grow within 15 m of them
 *  (a LiDAR survey reads a mast as a 60 m tree). An observation or bell tower is a building. */
const STRUCT = (t: Record<string, string>): string | null =>
  t.man_made === 'mast' || t.man_made === 'communications_tower' || (t.man_made === 'tower' && /communication|transmission|radio|television|antenna|telecom/.test(t['tower:type'] ?? '')) ? 'mast'
  : t.man_made === 'water_tower' ? 'water_tower'
  : t.man_made === 'chimney' ? 'chimney'
  : t.man_made === 'flagpole' ? 'flagpole'
  : null;
const structPoint = (c: string, x: number, z: number, t: Record<string, string>, own: boolean): Point => {
  const p: Point = { c, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  if (!own) p.own = OWN_CTX;
  const h = parseLen(t.height);
  if (isFinite(h) && h > 2 && h < 700) p.h = Math.round(h * 10) / 10;
  return p;
};
// A mapped tree's kind (flora.ts TreeKind, `:v` a grown variant) from its genus — `genus`, the
// first word of `species`/`taxon`, else the common name — so a street of London planes, a row of
// red maples or a bigleaf maple in a ravine is that tree. `conifer`: needle-leaved, species unknown
// (the region's pine or fir).
const GENUS: Record<string, string> = {
  acer: 'maple', liquidambar: 'maple', quercus: 'oak', prunus: 'cherry', malus: 'cherry', pyrus: 'cherry', cercis: 'cherry',
  cornus: 'cherry', crataegus: 'cherry', amelanchier: 'cherry', sorbus: 'cherry', lagerstroemia: 'cherry', magnolia: 'magnolia',
  ulmus: 'elm', zelkova: 'elm', celtis: 'elm', populus: 'poplar', cupressus: 'poplar', salix: 'willow', betula: 'birch',
  alnus: 'birch', pinus: 'pine', picea: 'spruce', abies: 'spruce', pseudotsuga: 'spruce', tsuga: 'spruce', thuja: 'spruce',
  cedrus: 'spruce', sequoia: 'spruce', sequoiadendron: 'spruce', chamaecyparis: 'spruce', calocedrus: 'spruce', juniperus: 'shrub',
  washingtonia: 'fanpalm', sabal: 'palm', phoenix: 'palm', cocos: 'palm', syagrus: 'palm', roystonea: 'palm', prosopis: 'mesquite',
  parkinsonia: 'mesquite:2', olneya: 'mesquite', platanus: 'round', tilia: 'round', fraxinus: 'round', gleditsia: 'round',
  carpinus: 'round', fagus: 'round', aesculus: 'round', liriodendron: 'round', catalpa: 'round', gingko: 'round', ginkgo: 'round',
  arbutus: 'round', robinia: 'round', sophora: 'round', styphnolobium: 'round', nyssa: 'maple', pistacia: 'round', koelreuteria: 'round',
};
const COMMON: [RegExp, string][] = [
  [/bigleaf maple/, 'maple:2'], [/maple|sweetgum/, 'maple'], [/oak/, 'oak'], [/cherry|plum|crabapple|pear|redbud|dogwood|hawthorn|serviceberry|crape/, 'cherry'],
  [/magnolia/, 'magnolia'], [/elm|zelkova|hackberry/, 'elm'], [/poplar|cypress/, 'poplar'], [/willow/, 'willow'], [/birch|alder|aspen/, 'birch'],
  [/pine/, 'pine'], [/spruce|fir\b|hemlock|cedar|redwood|sequoia/, 'spruce'], [/palo verde/, 'mesquite:2'], [/mesquite/, 'mesquite'],
  [/fan palm|washingtonia/, 'fanpalm'], [/palm/, 'palm'], [/plane|linden|lime|ash|locust|beech|hornbeam|chestnut|tulip|ginkgo|madrone/, 'round'],
];
export function treeKindOf(t: Record<string, string>): string | null {
  const latin = (t.genus ?? (t.species ?? t.taxon ?? '').split(/\s+/)[0] ?? '').toLowerCase();
  const sp = `${t.species ?? t.taxon ?? ''}`.toLowerCase();
  if (sp.startsWith('acer macrophyllum')) return 'maple:2';
  if (GENUS[latin]) return GENUS[latin];
  const common = `${t['species:en'] ?? ''} ${t['taxon:en'] ?? ''} ${t['genus:en'] ?? ''}`.toLowerCase();
  for (const [re, k] of COMMON) if (re.test(common)) return k;
  if (t.leaf_type === 'needleleaved') return 'conifer';
  return null;
}

/** Street furniture mapped as a node → its Point class, or null. The small things that make a
 *  street read as surveyed rather than dressed, each where the map puts it (props.ts builds them;
 *  a crossing is also paint and a kerb kept clear):
 *    xing / xing_l / xing_u — a crossing: marked with ladder or zebra bars / with two lines / unmarked
 *    lamp · bin · postbox · bikerack · drinking · bollard · meter (a parking pay station) ·
 *    viewpoint (`tourism=viewpoint`: a coin-op viewer, and the game offers you the view) */
export function furnitureClass(t: Record<string, string>): string | null {
  if (t.highway === 'crossing') {
    const m = t['crossing:markings'], c = t.crossing;
    if (m ? m === 'no' : c === 'unmarked' || c === 'no' || c === 'informal') return 'xing_u';
    return m && /^(lines|dashes|dots)/.test(m) ? 'xing_l' : 'xing';
  }
  // (a lamp hung on a wire over the street or fixed to a wall is not a mast on the ground)
  if (t.highway === 'street_lamp') return /^(suspen|wire|catenary|wall|ceiling)/.test(t.support ?? t.lamp_mount ?? '') ? null : 'lamp';
  if (t.amenity === 'waste_basket') return 'bin';
  if (t.amenity === 'post_box') return 'postbox';
  if (t.amenity === 'bicycle_parking') return /^(shed|building|lockers|floor|informal)$/.test(t.bicycle_parking ?? '') || t.covered === 'yes' ? null : 'bikerack';
  if (t.amenity === 'drinking_water') return 'drinking';
  if (t.barrier === 'bollard') return 'bollard';
  if (t.amenity === 'vending_machine' && /parking_tickets/.test(t.vending ?? '')) return 'meter';
  if (t.tourism === 'viewpoint') return 'viewpoint';
  // the micro layer's (world/micro.ts): a picnic table, a fire ring, a public grill, a planter, an
  // information board or map, a recycling container, a street cabinet, a vending machine, a clock
  // on its post (one on a wall is the wall's)
  if (t.leisure === 'picnic_table') return 'picnic';
  if (t.leisure === 'firepit') return 'firepit';
  if (t.amenity === 'bbq') return 'bbq';
  if (t.amenity === 'planter' || t.man_made === 'planter') return 'planter';
  if (t.tourism === 'information' && /^(board|map)$/.test(t.information ?? '')) return 'info';
  if (t.amenity === 'recycling' && t.recycling_type !== 'centre') return 'recycling';
  if (t.man_made === 'street_cabinet') return 'cabinet';
  if (t.amenity === 'vending_machine') return 'vending';
  if (t.amenity === 'clock' && !/wall/.test(t.support ?? '')) return 'clock';
  return null;
}
/** A navigation mark on the water (OpenSeaMap `seamark:type`): a buoy (lateral, cardinal, special,
 *  a mooring) or a beacon on its pile → its Point class and `sp` = its shape and colour
 *  ('conical:red', 'can:green', 'mooring:white'), or null. */
export function seamarkOf(t: Record<string, string>): { c: 'buoy' | 'beacon'; sp: string } | null {
  const sm = t['seamark:type'];
  if (!sm || !/^(buoy_|beacon_|mooring$)/.test(sm)) return null;
  const shape = t[`seamark:${sm}:shape`] ?? (sm === 'mooring' ? 'mooring' : ''), colour = (t[`seamark:${sm}:colour`] ?? '').split(';')[0];
  return { c: sm.startsWith('beacon') ? 'beacon' : 'buoy', sp: `${shape}:${colour}`.slice(0, 32) };
}
/** A playground piece's kind (assets/play.ts PlayKind) from its OSM `playground=*` value. */
export function playKindOf(v: string | undefined): string | null {
  if (!v) return null;
  if (/^(swing|basketswing|baby_swing|tire_swing|tyre_swing|nest_swing)$/.test(v)) return 'swing';
  if (/^(slide|tube_slide)$/.test(v)) return 'slide';
  if (/^(structure|playhouse|tower|castle|ship|pirate_ship)$/.test(v)) return 'structure';
  if (/^(seesaw)$/.test(v)) return 'seesaw';
  if (/^(springy|spring_rider|springboard)$/.test(v)) return 'springy';
  if (/^(roundabout|merry_go_round|merrygoround|aerialrotator)$/.test(v)) return 'roundabout';
  if (/^(sandpit|sandbox|sand)$/.test(v)) return 'sandpit';
  if (/^(climbingframe|climbing_frame|climbingwall|climbing_wall|climbing_net|monkey_bars|horizontal_bar|dome)$/.test(v)) return 'climbingframe';
  return null;
}
const COMPASS: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
/** A viewpoint's `direction` as a compass bearing (degrees): a number, a cardinal point, or the middle
 *  of a range ("90-180", "NE-SE"); null when it doesn't say (or looks all round). */
export function viewBearing(v: string | undefined): number | null {
  if (!v) return null;
  const raw = (x: string) => { const q = x.trim().toUpperCase(); return q in COMPASS ? COMPASS[q] : /^-?\d+(\.\d+)?$/.test(q) ? parseFloat(q) : null; };
  const norm = (b: number) => ((b % 360) + 360) % 360;
  // (a range: "90-180", "NE-SE" — no lookbehind: older Safari can't parse one)
  const m = /^\s*(-?[\w.]+)\s*-\s*([\w.]+)\s*$/.exec(v);
  if (m) {
    const a = raw(m[1]), b = raw(m[2]);
    if (a === null || b === null) return null;
    let d = b - a;
    if (d <= 0) d += 360;
    return d >= 350 ? null : norm(a + d / 2); // (a range all the way round looks every way)
  }
  const one = raw(v);
  return one === null ? null : norm(one);
}
/** Below ground: tunnel=yes/culvert/flooded… (a building passage or an avalanche gallery is open air),
 *  or mapped location=underground. */
const UNDERGROUND = (t: Record<string, string>) =>
  (!!t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage' && t.tunnel !== 'avalanche_protector') || t.location === 'underground';
// OSM fence_type → Line.ft: 1 iron railing, 2 chain-link, 3 timber (picket, rail, board)
const FENCE_TYPE: Record<string, number> = {
  railing: 1, metal: 1, metal_bars: 1, bars: 1, wrought_iron: 1, guard_rail: 1, pole: 1,
  chain_link: 2, wire: 2, mesh: 2, barbed_wire: 2, electric: 2,
  wood: 3, picket: 3, split_rail: 3, board: 3, panel: 3, wattle: 3, hedge_bank: 3,
};
// Street parking on one side of a way, in either OSM scheme (`parking:<side>` + orientation, or
// the older `parking:lane:<side>`): 0 none / not on the carriageway, 1 parallel, 2 angled.
export function parkSide(t: Record<string, string>, s: 'left' | 'right'): 0 | 1 | 2 {
  const v = t[`parking:${s}`] ?? t['parking:both'];
  if (v) {
    if (v !== 'lane' && v !== 'street_side' && v !== 'half_on_kerb' && v !== 'yes') return 0;
    const o = t[`parking:${s}:orientation`] ?? t['parking:both:orientation'];
    return o === 'diagonal' || o === 'perpendicular' ? 2 : 1;
  }
  const l = t[`parking:lane:${s}`] ?? t['parking:lane:both'];
  return l === 'parallel' || l === 'marked' ? 1 : l === 'diagonal' || l === 'perpendicular' ? 2 : 0;
}
const ROOF_TAG: Record<string, Building['roof']> = { gabled: 'gable', gable: 'gable', hipped: 'hip', hip: 'hip', 'half-hipped': 'hip', side_hipped: 'hip', pyramidal: 'hip', flat: 'flat', skillion: 'skillion', lean_to: 'skillion', gambrel: 'gable', mansard: 'hip', saltbox: 'gable', dome: 'hip', round: 'hip', onion: 'hip', cone: 'hip', butterfly: 'flat', sawtooth: 'flat' };
const CLS_COMMERCIAL = new Set(['commercial', 'retail', 'office', 'hotel', 'civic', 'public', 'school', 'fire_station', 'government', 'hospital', 'supermarket', 'restaurant', 'kiosk', 'industrial', 'warehouse', 'college', 'university', 'train_station', 'transportation', 'clinic']);
const CLS_CHURCH = new Set(['church', 'chapel', 'cathedral', 'temple', 'mosque', 'synagogue', 'religious', 'shrine']);
const CLS_SHED = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'cabin', 'boathouse', 'outbuilding', 'roof']);

// (bake.mjs AREA_CLASS, less the ones the query doesn't ask for; water, beach and wetland are WATER_CLASS)
const LAND_CLASS = (t: Record<string, string>): string | null => {
  if (t.building) return null;
  if ((t.amenity === 'parking' && !/^(multi-storey|underground|rooftop)$/.test(t.parking ?? '')) || t.parking === 'surface') return 'parking';
  if (t.leisure === 'swimming_pool') return 'pool';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'scrub';
  if (t.leisure === 'pitch' || t.leisure === 'playground') return 'pitch';
  if (t.leisure === 'golf_course') return 'golf';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.leisure === 'recreation_ground' || t.landuse === 'village_green' || t.landuse === 'meadow' || t.natural === 'grassland' || t.landuse === 'cemetery') return 'grass';
  if (t.leisure === 'marina') return 'marina';
  if (t.man_made === 'pier') return 'pier'; // a pier's deck mapped as an area (Seattle's are concrete, a boardwalk timber)
  if (t.area === 'yes' && t.highway === 'pedestrian') return 'plaza';
  return null;
};
const WATER_CLASS = (t: Record<string, string>) => {
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.water === 'river') return 'water';
  if (t.natural === 'beach' || t.natural === 'sand') return 'beach';
  if (t.natural === 'wetland') return 'wetland';
  return null;
};

// ---------------- the transform ----------------

export interface RealTileOpts {
  id: string;
  box: Box;
  origin: LatLon;
  margin?: number; // context ring around the cell (baked tiles use 48 m)
}

const OWN_CTX = 0;

/** The Overpass query for one cell (bbox in degrees): everything osmToTile reads. Shared by the
 *  Cloudflare tile service and the in-browser direct path (tile.worker.ts), so both feeders
 *  emit identical tiles. Keep in step with osmToTile when it learns a new tag. */
export function overpassQuery(bb: { s: number; w: number; n: number; e: number }): string {
  // (the statements are osmQuery.ts's — the same list our own extract selects with)
  return `[out:json][timeout:25][bbox:${bb.s.toFixed(7)},${bb.w.toFixed(7)},${bb.n.toFixed(7)},${bb.e.toFixed(7)}];(
${overpassStatements()}
);out geom qt;`;
}

export function osmToTile(osm: OsmDoc, opts: RealTileOpts): TileJson {
  const margin = opts.margin ?? 48;
  const box = opts.box;
  const P = makeProjector(opts.origin);
  const S: Box = { x0: box.x0 - margin, z0: box.z0 - margin, x1: box.x1 + margin, z1: box.z1 + margin };
  const inB = (x: number, z: number, m = 0) => x >= box.x0 - m && x <= box.x1 + m && z >= box.z0 - m && z <= box.z1 + m;
  const els = (osm.elements ?? []).slice().sort((a, b) => a.id - b.id); // stable output regardless of server ordering
  // North American town streets park both kerbs unless mapped otherwise (a 30–36 ft street is a
  // lane each way between two parked lanes); elsewhere only mapped parking counts
  const parkByDefault = worldRegion(...P.unproject((box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2)) === 'na';

  const q = (v: number) => Math.round(v * 10); // 0.1 m quantization, as baked
  const flat = (pts: P2[]) => pts.flatMap(([x, z]) => [q(x), q(z)]);
  const wayPts = (e: OsmElement): P2[] => (e.geometry ?? []).filter((p): p is OsmNode => !!p).map((p) => P.project(p.lat, p.lon));
  const isClosed = (e: OsmElement) =>
    !!e.geometry && e.geometry.length > 3 && e.geometry[0]!.lat === e.geometry.at(-1)!.lat && e.geometry[0]!.lon === e.geometry.at(-1)!.lon;
  const areaRings = (e: OsmElement): { outer: P2[][]; inner: P2[][] } | null => {
    if (e.type === 'way') return isClosed(e) ? { outer: [wayPts(e)], inner: [] } : null;
    if (e.type === 'relation' && e.members) {
      const part = (role: string) =>
        e.members!.filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map((m) => m.geometry!.filter((p): p is OsmNode => !!p).map((p) => P.project(p.lat, p.lon)));
      const outer = assembleRings(part('outer'));
      return outer.length ? { outer, inner: assembleRings(part('inner')) } : null;
    }
    return null;
  };

  // Ownership mirrors partitionEntities: included when any vertex lands in box+margin;
  // own unless the representative point (centroid / first vertex / point) is inside the cell.
  const anyVertex = (f: number[], m: number) => {
    for (let i = 0; i + 1 < f.length; i += 2) if (inB(f[i] / 10, f[i + 1] / 10, m)) return true;
    return false;
  };
  const firstVertex = (f: number[]) => f.length >= 2 && inB(f[0] / 10, f[1] / 10);
  const centroidIn = (f: number[]) => {
    let x = 0, z = 0, n = 0;
    for (let i = 0; i + 1 < f.length; i += 2) (x += f[i]), (z += f[i + 1]), n++;
    return n > 0 && inB(x / n / 10, z / n / 10);
  };
  const ownV = (f: number[]) => (firstVertex(f) ? undefined : OWN_CTX);
  const ownC = (f: number[]) => (centroidIn(f) ? undefined : OWN_CTX);

  const buildings: Building[] = [];
  const parts: { b: Building; ring: P2[]; area: number }[] = []; // building:part pieces, joined to outlines below
  const roads: Road[] = [];
  const areas: Area[] = [];
  const lines: Line[] = [];
  const points: Point[] = [];
  const blockO: P2[][] = []; // landuse/leisure rings fills must not plant on (not rendered — reject masks)
  const blockI: P2[][] = [];
  const BLOCK = (t: Record<string, string>) =>
    t.amenity === 'parking' ||
    (t.leisure && /^(park|pitch|playground|garden|recreation_ground)$/.test(t.leisure)) ||
    (t.landuse && /^(forest|farmland|meadow|reservoir|cemetery|basin|quarry|landfill|grass)$/.test(t.landuse));

  // Named businesses mapped as nodes inside a building outline (the usual OSM way to map a shop):
  // they name the building and say what it's used for, in OSM's own language-neutral values.
  const poiNodes: { x: number; z: number; name: string; use: string }[] = [];
  const useTag = (t: Record<string, string>) => {
    const u = t.amenity ?? t.shop ?? t.office ?? t.craft;
    return u && u !== 'yes' && u !== 'bench' && u !== 'place_of_worship' ? u : undefined;
  };
  for (const e of els) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      const use = t.name ? useTag(t) : undefined;
      if (use && e.lat != null && e.lon != null) {
        const [x, z] = P.project(e.lat, e.lon);
        if (inB(x, z, margin)) poiNodes.push({ x, z, name: t.name, use });
      }
      // Point furniture — same tag→class the bake emits; props.ts consumes these.
      const pc = t.natural === 'tree' ? 'tree' : t.amenity === 'bench' ? 'bench'
        : t.highway === 'traffic_signals' ? 'signal' : t.emergency === 'fire_hydrant' ? 'hydrant'
        : t.highway === 'stop' ? (t.stop === 'all' ? 'stop_all' : 'stop') : t.highway === 'give_way' ? 'yield'
        : t.railway === 'subway_entrance' || (t.railway === 'train_station_entrance' && t.subway === 'yes') ? 'subway'
        : t.highway === 'bus_stop' ? (t.shelter === 'yes' ? 'bus_shelter' : 'bus') : furnitureClass(t);
      if (pc && e.lat != null && e.lon != null) {
        const [x, z] = P.project(e.lat, e.lon);
        if (inB(x, z, margin)) {
          const pt: Point = { c: pc, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, own: inB(x, z) ? undefined : OWN_CTX };
          if (pc === 'viewpoint') {
            const b = viewBearing(t.direction);
            if (b !== null) pt.d = b;
          }
          if (pc === 'tree') {
            // (its species, and its mapped height where it has one)
            const k = treeKindOf(t), th = parseLen(t.height);
            if (k) pt.sp = k;
            if (isFinite(th) && th >= 2 && th <= 70) pt.h = Math.round(th * 10) / 10;
          }
          points.push(pt);
        }
      }
      const mark = seamarkOf(t);
      if (mark && e.lat != null && e.lon != null) {
        const [x, z] = P.project(e.lat, e.lon);
        if (inB(x, z, margin)) points.push({ c: mark.c, sp: mark.sp, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, own: inB(x, z) ? undefined : OWN_CTX });
      }
      const sc = STRUCT(t);
      if (sc && e.lat != null && e.lon != null) {
        const [x, z] = P.project(e.lat, e.lon);
        if (inB(x, z, margin)) points.push(structPoint(sc, x, z, t, inB(x, z)));
      }
      const pk = playKindOf(t.playground);
      if (pk && e.lat != null && e.lon != null) {
        const [x, z] = P.project(e.lat, e.lon);
        if (inB(x, z, margin)) points.push({ c: 'play', sp: pk, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, own: inB(x, z) ? undefined : OWN_CTX });
      }
      continue;
    }
    // a playground piece mapped as a way (a slide drawn down its chute, a sandpit's outline): a
    // point at its middle, turned along its longest side
    if (e.type === 'way' && t.playground && !t.highway && !t.building) {
      const pk = playKindOf(t.playground), pts = wayPts(e);
      if (pk && pts.length >= 2) {
        const closed = isClosed(e), q = closed ? pts.slice(0, -1) : pts;
        const x = q.reduce((a, p) => a + p[0], 0) / q.length, z = q.reduce((a, p) => a + p[1], 0) / q.length;
        let bl = 0, d = 0;
        for (let i = 0; i + 1 < pts.length; i++) {
          const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz);
          if (l > bl) (bl = l), (d = (((Math.atan2(dx, -dz) * 180) / Math.PI) + 360) % 360);
        }
        if (inB(x, z, margin)) points.push({ c: 'play', sp: pk, d: Math.round(d), x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, own: inB(x, z) ? undefined : OWN_CTX });
      }
      if (!t.leisure && !t.landuse && !t.natural && !t.amenity) continue; // (a mapped sandpit's sand is still painted)
    }
    if (e.type === 'way' && t.highway && t.highway in ROAD_W) {
      // indoor corridors mapped as footways (a mall, a market arcade) are the building's inside
      if (t.indoor === 'yes' || t.indoor === 'corridor') continue;
      const pts = wayPts(e);
      if (pts.length < 2) continue;
      let w = parseFloat(t.width) || ROAD_W[t.highway];
      // mapped lanes set the carriageway (3.2 m a lane, a metre of gutter) when no width is tagged
      const lanes = parseInt(t.lanes);
      if (!t.width && lanes > 0 && ROAD_W[t.highway] >= 6) w = Math.max(w, lanes * 3.2 + 1);
      if (t.footway === 'sidewalk') w = 1.6;
      // mapped street parking widens the carriageway when no width is tagged (a parked lane is
      // 2.2 m, angled bays 4.8 m) and lets props line that kerb with cars
      let pl = parkSide(t, 'left'), pr = parkSide(t, 'right');
      if (parkByDefault && PARK_DEFAULT.has(t.highway) && !Object.keys(t).some((k) => k.startsWith('parking')) && !t.width && t.bridge !== 'yes' && t.tunnel !== 'yes' && t.area !== 'yes') pl = pr = 1;
      if (!t.width && ROAD_W[t.highway] >= 5) w += [0, 2.2, 4.8][pl] + [0, 2.2, 4.8][pr];
      const p = flat(pts);
      if (!anyVertex(p, margin)) continue;
      const r: Road = { p, c: t.highway, w: +w.toFixed(1), own: ownV(p) };
      if (t.name) r.n = t.name;
      if (t.ref) r.ref = t.ref;
      if (t.bridge && t.bridge !== 'no') r.br = t['bridge:movable'] || t.bridge === 'movable' ? 'movable' : 'yes';
      if (r.br && t['bridge:structure']) r.bs = String(t['bridge:structure']).toLowerCase().slice(0, 24);
      if (r.br === 'movable' && t['bridge:movable']) r.bm = String(t['bridge:movable']).toLowerCase().slice(0, 16);
      if (t.layer) r.l = parseInt(t.layer) || 0;
      // underground (Seattle's SR 99 bored tunnel, Boston's Big Dig, the Hudson crossings): not a
      // street across the blocks above — cars dive into the portal and out of sight. A building
      // passage (an alley under an arcade) is a street at ground level and stays one.
      if (UNDERGROUND(t)) r.tu = 1;
      const ic = inclineOf(t.incline);
      if (ic !== null) r.ic = ic;
      if (t.oneway === 'yes') r.ow = 1;
      if (t.footway === 'sidewalk') r.sw = 1;
      if (t.service) r.sv = t.service;
      if (pl || pr) r.pk = pl + 4 * pr;
      // (a street paved other than in asphalt: Pike Place's bricks, Boston's cobbles, a gravel lane)
      const sf = String(t.surface ?? '').toLowerCase();
      if (sf && !/^(asphalt|paved)$/.test(sf)) r.sf = sf.slice(0, 20);
      // (a flight of steps: how many, where the map counted them)
      const sc = parseInt(t.step_count);
      if (t.highway === 'steps' && sc >= 2 && sc < 400) r.sc = sc;
      roads.push(r);
      // trolleybus wires hang over the road itself (Seattle, San Francisco, Dayton)
      if (t.trolley_wire === 'yes' || t['trolley_wire:forward'] === 'yes' || t['trolley_wire:backward'] === 'yes') lines.push({ c: 'trolley', p, w: r.w, own: r.own });
      continue;
    }
    // Linear structures — the same classes the bake emits (structures.ts / props.ts consume them):
    // seawalls and jetties, piers, fences and walls, power lines, rail. A hometown is its
    // seawall, its overhead wires and its back-yard fences as much as its buildings.
    if (e.type === 'way' && !t.building) {
      const lc = t.wall === 'seawall' || /seawall/i.test(t.name ?? '') ? 'seawall'
        : t.man_made === 'groyne' || t.man_made === 'breakwater' ? 'groyne'
        : t.man_made === 'pier' && !isClosed(e) ? 'pier'
        : t.barrier === 'fence' ? 'fence'
        : t.barrier === 'wall' || t.barrier === 'retaining_wall' ? 'wall'
        : t.power === 'line' ? 'power' // transmission: its own tall poles (props.ts); minor lines are the street poles
        : t.railway === 'rail' && !UNDERGROUND(t) ? 'rail'
        : (t.railway === 'tram' || t.railway === 'light_rail') && t.tunnel !== 'yes' && t.layer !== '-1' ? 'tram'
        : null;
      if (lc) {
        const pts = wayPts(e);
        if (pts.length >= 2) {
          const p = flat(pts);
          if (anyVertex(p, margin)) {
            const l: Line = { c: lc, p, own: ownV(p) };
            if (t.width && isFinite(parseFloat(t.width))) l.w = parseFloat(t.width);
            if (t.bridge && t.bridge !== 'no') l.br = 1;
            if (lc === 'fence') {
              const ft = FENCE_TYPE[t.fence_type ?? ''];
              if (ft) l.ft = ft;
            }
            lines.push(l);
          }
        }
        if (lc !== 'wall' && lc !== 'fence') continue; // a walled yard can also be a landuse area
      }
    }
    // tall structures mapped as an outline (a water tower's legs, a mast's footprint): the tower
    // is built at its centre (props.ts), not extruded as a building
    const scw = e.type === 'way' ? STRUCT(t) : null;
    if (scw && scw !== 'flagpole') {
      const pts = wayPts(e);
      if (isClosed(e)) pts.pop(); // (the closing vertex would count twice)
      if (pts.length >= 3) {
        let x = 0, z = 0;
        for (const [px, pz] of pts) (x += px), (z += pz);
        x /= pts.length; z /= pts.length;
        if (inB(x, z, margin)) points.push(structPoint(scw, x, z, t, inB(x, z)));
        continue;
      }
    }
    const isPart = !!t['building:part'] && t['building:part'] !== 'no';
    if (t.building || isPart) {
      const rings = areaRings(e);
      if (!rings) continue;
      const seed = hashStr(`${e.type}/${e.id}`);
      for (const raw of rings.outer) {
        let ring = cleanRing(raw);
        if (ring.length < 3) continue;
        const area = Math.abs(ringArea(ring));
        if (area < (isPart ? 2 : 6)) continue;
        if (ringArea(ring) < 0) ring.reverse();
        const p = flat(ring);
        if (!anyVertex(p, margin)) continue;
        const o = obb(ring);
        const bt = t.building ?? '';
        let kind: Building['k'] =
          t.man_made === 'lighthouse' ? 'lighthouse'
          : CLS_CHURCH.has(bt) || t.amenity === 'place_of_worship' ? 'church'
          : CLS_COMMERCIAL.has(bt) || t.shop || t.office ? 'commercial'
          : bt === 'apartments' || area > 700 ? 'large'
          : area < 32 || CLS_SHED.has(bt) ? 'shed'
          : 'house';
        const lv = parseFloat(t['building:levels']);
        const floors = isFinite(lv) && lv > 0 ? lv : null;
        const tagH = parseLen(t.height);
        const rlv = parseFloat(t['roof:levels']);
        const roofLv = isFinite(rlv) && rlv > 0 ? Math.min(rlv, 3) : 0;
        let h = plausibleHeight(tagH, floors, area, isPart, roofLv);
        // bottom of the building above ground (parts: setbacks and overhangs; else pilings)
        const minLv = parseFloat(t['building:min_level']);
        let minH = parseLen(t.min_height);
        if (!isFinite(minH) && isFinite(minLv) && minLv > 0) minH = minLv * storeyH(floors ?? minLv);
        if (!isFinite(minH) || minH < 0) minH = 0;
        if (!isFinite(h)) {
          const r = (seed % 1000) / 1000;
          h = kind === 'shed' ? 3 + r : kind === 'large' ? 8 + r * 5 : kind === 'commercial' ? 5.5 + r * 3 : 6.5 + r * 3;
          if (isPart) h += minH; // an untagged part stands a storey or two above its base
          h += roofLv * 2.6; // (a roof the map says has storeys in it)
        }
        if (kind === 'lighthouse') h = 21;
        // four-plus storeys isn't a house or a shed whatever the tag says (towers mapped building=yes)
        if ((kind === 'house' || kind === 'shed') && (h >= 15 || (floors ?? 0) >= 4)) kind = 'large';
        h = Math.max(kind === 'shed' ? 2.6 : 3.2, h);
        const tagRoof = ROOF_TAG[String(t['roof:shape'] ?? '').toLowerCase()];
        const r4 = (seed >>> 8) % 100;
        const roof: Building['roof'] =
          kind === 'lighthouse' ? 'tower'
          : isPart ? tagRoof ?? 'flat'
          : tagRoof ?? (kind === 'church' ? 'gable'
          : kind === 'house' ? (ring.length > 60 ? 'flat' : o.wid > 18 ? (r4 < 85 ? 'hip' : 'flat') : r4 < 55 ? 'gable' : r4 < 97 ? 'hip' : 'flat') // keep in sync with bake.mjs
          : kind === 'shed' ? (r4 < 50 ? 'gable' : r4 < 75 ? 'skillion' : r4 < 85 ? 'hip' : 'flat')
          : kind === 'commercial' ? (o.wid < 13 && area < 400 && r4 < 45 ? (r4 < 30 ? 'gable' : 'hip') : 'flat')
          : kind === 'large' ? (o.wid < 16 && r4 < 25 && h < 20 ? 'hip' : 'flat')
          : 'flat');
        const b: Building = { r: p, h: +h.toFixed(1), k: kind, roof, s: seed, own: ownC(p) };
        const fc = parseColour(t['building:colour']) ?? materialColour(t['building:material']);
        if (fc != null) b.fc = fc;
        const rc = parseColour(t['roof:colour']) ?? roofMaterialColour(t['roof:material']);
        if (rc != null) b.rc = rc;
        if (floors) b.fl = Math.round(floors);
        if (roofLv) b.rl = roofLv;
        if (tagRoof) b.rt = 1;
        if (isFinite(tagH) && Math.abs(tagH - h) < 0.5) b.hq = 1;
        if (t['building:material']) b.ma = String(t['building:material']).toLowerCase().slice(0, 16);
        const yr = /(\d{4})/.exec(t.start_date ?? t['building:start_date'] ?? '');
        if (yr && +yr[1] > 1000 && +yr[1] < 2100) b.yr = +yr[1];
        if (isPart) {
          // parts carry heights from the ground: the part itself is min_height..height
          b.pt = 1;
          if (minH > 0.5) (b.lf = +minH.toFixed(1)), (b.h = +Math.max(1, h - minH).toFixed(1));
          parts.push({ b, ring, area });
          continue;
        }
        // a building standing well clear of the ground (a skybridge, a canopy over a plaza) floats;
        // a low min_height is pilings
        if (minH > 6) (b.lf = +minH.toFixed(1)), (b.h = +Math.max(1, h - minH).toFixed(1));
        else if (minH > 0.5) b.mh = +minH.toFixed(1);
        // a canopy — a filling station's, a market's covered walk, a carport — is an open roof on
        // posts, not a shed standing in the street: its underside at the mapped min_height (or a
        // little under the mapped height), else a big one at a lorry's clearance, a small one lower
        if (bt === 'roof' || bt === 'carport') {
          const clear = minH > 0.5 ? minH : isFinite(tagH) && tagH > 2.6 ? Math.max(2.4, tagH - 0.6) : bt === 'carport' ? 2.4 : area > 120 ? 4.4 : 3.0;
          b.lf = +clear.toFixed(1);
          b.h = 0.6;
          b.cn = 1;
          b.roof = 'flat';
          delete b.mh;
          if (b.fc == null) b.fc = 0xe9e6df;
        }
        if (t.name) b.n = t.name;
        const use = useTag(t);
        if (use) b.u = use;
        if (t['addr:housenumber'] && t['addr:street']) b.ad = `${t['addr:housenumber']} ${t['addr:street']}`;
        buildings.push(b);
      }
      continue;
    }
    if (BLOCK(t)) {
      const rings = areaRings(e);
      if (rings) {
        for (const ring of rings.outer) { const r = cleanRing(ring); if (r.length >= 3 && anyVertex(flat(r), margin)) blockO.push(r); }
        for (const ring of rings.inner) { const r = cleanRing(ring); if (r.length >= 3) blockI.push(r); }
      }
      // not `continue` — a way can carry both landuse and building tags; fall through.
    }
    const wc = WATER_CLASS(t);
    if (wc) {
      const rings = areaRings(e);
      if (!rings) continue;
      const o = rings.outer.map((ring) => flat(simplify(cleanRing(ring), 0.25))).filter((f) => f.length >= 6);
      if (!o.length || !o.some((ring) => anyVertex(ring, margin))) continue;
      const a: Area = { c: wc, o, i: rings.inner.map((ring) => flat(simplify(cleanRing(ring), 0.25))).filter((f) => f.length >= 6), own: ownV(o[0]) };
      if (t.name) a.n = t.name;
      areas.push(a);
      continue;
    }
    // Land areas the ground paints (the bake's classes): parks and lawns, woods and scrub, pitches
    // and playgrounds, pools, golf, marinas, pedestrian plazas — and surface parking lots, which
    // props.ts stripes and fills with cars (lots.ts)
    const la = LAND_CLASS(t);
    if (la) {
      const rings = areaRings(e);
      if (!rings) continue;
      const o = rings.outer.map((ring) => flat(simplify(cleanRing(ring), 0.25))).filter((f) => f.length >= 6);
      if (!o.length || !o.some((ring) => anyVertex(ring, margin))) continue;
      const a: Area = { c: la, o, i: rings.inner.map((ring) => flat(simplify(cleanRing(ring), 0.25))).filter((f) => f.length >= 6), own: ownV(o[0]) };
      if (t.name) a.n = t.name;
      // a pitch says what it's for (a basketball court, a block of tennis courts, a diamond) and
      // what it's surfaced with — the paint draws its lines, props.ts its hoops, nets and goals
      if (la === 'pitch') {
        const sp = t.leisure === 'playground' ? 'playground' : sportOf(t.sport);
        if (sp) a.k = sp;
      }
      if ((la === 'pitch' || la === 'pier') && t.surface) a.sf = String(t.surface).slice(0, 16);
      areas.push(a);
    }
  }

  // Coastline: open ways whose wet side (OSM: water on the RIGHT of way direction) is the sea.
  // Closing each in-box fragment against the cell boundary makes a water Area — seaside
  // tiles get a real shore instead of a void.
  {
    const cb = S; // closing boundary = cell + margin
    const parts: P2[][] = [];
    for (const e of els) {
      if (e.type !== 'way' || e.tags?.natural !== 'coastline') continue;
      const pts = wayPts(e);
      if (pts.length > 1) parts.push(pts);
    }
    // Boundary loop coordinate τ ∈ [0,4): top → right → bottom → left. Corners are the integers.
    const CORNER: P2[] = [[cb.x0, cb.z0], [cb.x1, cb.z0], [cb.x1, cb.z1], [cb.x0, cb.z1]];
    const tau = (p: P2) => {
      if (Math.abs(p[1] - cb.z0) < 0.01) return ((p[0] - cb.x0) / (cb.x1 - cb.x0)) % 4;
      if (Math.abs(p[0] - cb.x1) < 0.01) return 1 + (p[1] - cb.z0) / (cb.z1 - cb.z0);
      if (Math.abs(p[1] - cb.z1) < 0.01) return 2 + (cb.x1 - p[0]) / (cb.x1 - cb.x0);
      return 3 + (cb.z1 - p[1]) / (cb.z1 - cb.z0);
    };
    // Corners on the boundary walk from `from` back to `to`; dir=+1 follows the τ order.
    const arc = (from: number, to: number, dir: 1 | -1): P2[] => {
      const out: P2[] = [];
      if (dir === 1) {
        const end = to <= from ? to + 4 : to;
        for (let k = Math.floor(from) + 1; k < end + 0.001; k++) out.push(CORNER[k % 4]);
      } else {
        const end = to >= from ? to - 4 : to;
        for (let k = Math.ceil(from) - 1; k > end - 0.001; k--) out.push(CORNER[((k % 4) + 4) % 4]);
      }
      return out;
    };
    // Where the segment from inside point P to outside point Q crosses the boundary — exactly on
    // an edge (τ reads the edge from the coordinate).
    const cross = (P: P2, Q: P2): P2 => {
      const dx = Q[0] - P[0], dz = Q[1] - P[1];
      let t = 1;
      if (Q[0] > cb.x1) t = Math.min(t, (cb.x1 - P[0]) / dx);
      if (Q[0] < cb.x0) t = Math.min(t, (cb.x0 - P[0]) / dx);
      if (Q[1] > cb.z1) t = Math.min(t, (cb.z1 - P[1]) / dz);
      if (Q[1] < cb.z0) t = Math.min(t, (cb.z0 - P[1]) / dz);
      t = Math.max(0, Math.min(1, t));
      let x = Math.max(cb.x0, Math.min(cb.x1, P[0] + dx * t)), z = Math.max(cb.z0, Math.min(cb.z1, P[1] + dz * t));
      const gap = [x - cb.x0, cb.x1 - x, z - cb.z0, cb.z1 - z], m = gap.indexOf(Math.min(...gap));
      if (m === 0) x = cb.x0;
      else if (m === 1) x = cb.x1;
      else if (m === 2) z = cb.z0;
      else z = cb.z1;
      return [x, z];
    };
    // Every stretch of coast through the cell, from the point it comes in over the boundary to the
    // point it leaves (a way's end inside the cell is an unfinished coast: skipped). Overpass
    // hands whole ways, so the neighbours outside are there to cross against.
    const runs: { body: P2[]; ta: number; tb: number }[] = [];
    for (const chain of assembleChains(parts)) {
      let run: P2[] = [];
      let entry: P2 | null = null;
      for (let i = 0; i < chain.length; i++) {
        const p = chain[i];
        if (inB(p[0], p[1], margin)) {
          if (!run.length) entry = i > 0 ? cross(p, chain[i - 1]) : null;
          run.push(p);
        } else if (run.length) {
          if (entry) {
            const exit = cross(run[run.length - 1], p);
            runs.push({ body: [entry, ...run, exit], ta: tau(entry), tb: tau(exit) });
          }
          run = [];
        }
      }
    }
    // Water lies right of the coast's direction, and the boundary walked in rising τ (clockwise on
    // a north-up map) keeps it on the right too: from each stretch's exit, walk on to the next
    // stretch's entry, follow that, … until back at the start — one sea polygon, with every
    // headland and pier the coast wraps left out of it. (Closing each stretch on its own flooded
    // Pike Place Market: a pier's outline poking into the cell claimed the whole cell as bay.)
    const used = new Set<number>();
    for (let s0 = 0; s0 < runs.length; s0++) {
      if (used.has(s0)) continue;
      const ring: P2[] = [];
      let cur = s0, closed = false;
      for (let guard = 0; guard <= runs.length; guard++) {
        used.add(cur);
        ring.push(...runs[cur].body);
        // the next boundary point clockwise from this exit must be an entry (else the coast is broken)
        let next = -1, best = Infinity, exitFirst = false;
        for (let j = 0; j < runs.length; j++) {
          let d = runs[j].ta - runs[cur].tb;
          if (d < 0) d += 4;
          if (d < best) (best = d), (next = j);
        }
        for (let j = 0; j < runs.length; j++) {
          if (j === cur) continue;
          let d = runs[j].tb - runs[cur].tb;
          if (d < 0) d += 4;
          if (d > 1e-9 && d < best) exitFirst = true;
        }
        if (next < 0 || exitFirst) break;
        ring.push(...arc(runs[cur].tb, runs[next].ta, 1));
        if (next === s0) { closed = true; break; }
        if (used.has(next)) break;
        cur = next;
      }
      if (!closed) continue;
      const f = flat(simplify(cleanRing(ring), 0.25));
      // (k 'sea': no sheet of its own — the ocean plane at sea level shows through; realExtras)
      if (f.length >= 6 && anyVertex(f, margin)) areas.push({ c: 'water', o: [f], i: [], own: ownV(f), k: 'sea' });
    }
  }

  // ---- hybrid fill (H3-lite): sparse cells grow houses along their real streets ----
  // OSM building coverage is patchy outside cities — a mapped street with two barns
  // shouldn't read as empty. When owner building density is very low relative to
  // fillable road mileage, seed deterministic lots beside those roads. They're real
  // content for the tile (cached in R2): every visitor sees the same fill.
  // join the business nodes to the building they sit in (first one wins — but a market is the
  // whole building, over the stalls, bars and diners mapped inside it; a shop in a house footprint
  // makes it a storefront)
  if (poiNodes.length) {
    const boxes = buildings.map((b) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i + 1 < b.r.length; i += 2) { x0 = Math.min(x0, b.r[i]); x1 = Math.max(x1, b.r[i]); z0 = Math.min(z0, b.r[i + 1]); z1 = Math.max(z1, b.r[i + 1]); }
      return [x0 / 10, z0 / 10, x1 / 10, z1 / 10];
    });
    for (const n of poiNodes) {
      for (let i = 0; i < buildings.length; i++) {
        const [x0, z0, x1, z1] = boxes[i], b = buildings[i];
        if (n.x < x0 || n.x > x1 || n.z < z0 || n.z > z1) continue;
        const ring: P2[] = [];
        for (let k = 0; k + 1 < b.r.length; k += 2) ring.push([b.r[k] / 10, b.r[k + 1] / 10]);
        if (!pointInRing(n.x, n.z, ring)) continue;
        const hall = n.use === 'marketplace' && b.u !== 'marketplace';
        if (!b.u || hall) b.u = n.use;
        if (!b.n || hall) b.n = n.name;
        if (b.k === 'house') b.k = 'commercial';
        else if (b.k === 'large') b.gf = 1; // apartments over a shop: the street floor is a storefront
        break;
      }
    }
  }
  // ---- row buildings: party walls in a dense block ----
  // A footprint sharing a fifth of its perimeter with neighbours, in a block the buildings
  // cover 40 %+ of, is a row house / walk-up / terrace. The region decides what that means
  // (brick and flat roofs in a North American city; buildings.ts + recipe.ts); a townhouse
  // court among lawns stays itself.
  markRows(buildings);
  // Row buildings on a main road (secondary and up) keep shops on the street floor — an avenue of
  // walk-ups is an unbroken run of storefronts even where the map names none of them.
  {
    const MAIN = new Set(['primary', 'secondary', 'trunk']);
    const segs: number[][] = [];
    for (const r of roads) if (MAIN.has(r.c)) for (let i = 0; i + 3 < r.p.length; i += 2) segs.push([r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10, r.w]);
    if (segs.length)
      for (const b of buildings) {
        if (!b.at || b.gf || (b.k !== 'large' && b.k !== 'house') || (b.s >>> 4) % 100 >= 88) continue;
        let cx = 0, cz = 0;
        const n = b.r.length >> 1;
        for (let i = 0; i < n; i++) (cx += b.r[i * 2] / 10), (cz += b.r[i * 2 + 1] / 10);
        cx /= n;
        cz /= n;
        if (segs.some(([ax, az, bx, bz, w]) => segDist(cx, cz, { ax, az, dx: (bx - ax) / (Math.hypot(bx - ax, bz - az) || 1), dz: (bz - az) / (Math.hypot(bx - ax, bz - az) || 1), L: Math.hypot(bx - ax, bz - az) }) < w / 2 + 22)) b.gf = 1;
      }
  }

  // ---- building parts (Simple 3D Buildings) ----
  // Each part joins the smallest outline holding its centre: it takes that building's seed (one
  // look for the whole tower), kind and colours unless it maps its own. An outline whose parts
  // cover its ground is drawn by them (hp: footprint, door and name only) — and so is one a
  // lifted part overhangs (the outline is that part's shadow: the Space Needle's saucer over its
  // legs, a block on pilotis), as long as something stands on the ground under it. One its parts
  // only partly cover (a tower part on an unmapped podium) stays as the podium, capped under the
  // lifted parts and pulled a hand's width inside the walls it shares with them. (The Needle's
  // saucer-wide outline was kept as a "podium" 140 m tall: the plain cylinder Robby saw.)
  if (parts.length) {
    const unflat = (f: number[]): P2[] => { const o: P2[] = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
    const hosts = buildings.map((b) => {
      const r = unflat(b.r);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of r) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
      return { r, x0, z0, x1, z1, a: Math.abs(ringArea(r)), ground: 0, big: 0, top: 0, lift: Infinity };
    });
    for (const P of parts) {
      let cx = 0, cz = 0;
      for (const [x, z] of P.ring) (cx += x), (cz += z);
      cx /= P.ring.length;
      cz /= P.ring.length;
      let hi = -1;
      for (let i = 0; i < hosts.length; i++) {
        const H = hosts[i];
        if (cx < H.x0 || cx > H.x1 || cz < H.z0 || cz > H.z1 || buildings[i].gen || (hi >= 0 && H.a >= hosts[hi].a)) continue;
        if (pointInRing(cx, cz, H.r)) hi = i;
      }
      const b = P.b;
      if (hi >= 0) {
        const host = buildings[hi], H = hosts[hi];
        b.po = hi;
        // a part belongs to the tile that owns its outline: a tower straddling a cell edge is
        // drawn whole by one tile (its shaft on the neighbour's side was missing until that tile
        // streamed in — and the skyline had already handed the tower off)
        if (host.own !== b.own) { if (host.own === undefined) delete b.own; else b.own = host.own; }
        b.s = host.s;
        b.k = host.k === 'house' || host.k === 'shed' ? 'large' : host.k;
        if (b.fc == null && host.fc != null) b.fc = host.fc;
        if (b.rc == null && host.rc != null) b.rc = host.rc;
        if (b.ma == null && host.ma != null) b.ma = host.ma;
        if (b.yr == null && host.yr != null) b.yr = host.yr;
        if (host.at) b.at = 1;
        if (host.gf && !b.lf) b.gf = 1;
        const lift = b.lf ?? 0;
        H.big = Math.max(H.big, P.area);
        if (lift <= 1.5) H.ground += P.area;
        else H.lift = Math.min(H.lift, lift);
        H.top = Math.max(H.top, lift + b.h);
      }
      buildings.push(b);
    }
    hosts.forEach((H, i) => {
      if (!H.top) return;
      const host = buildings[i];
      if (H.ground >= H.a * 0.6 || (H.ground > 0 && H.big >= H.a * 0.6)) host.hp = 1;
      else {
        // the outline usually carries the whole tower's height: as a podium it stops under the
        // lifted parts (or at four storeys when every part stands on the ground)
        if (host.h >= H.top * 0.8) host.h = +Math.max(3.2, Math.min(host.h, isFinite(H.lift) ? H.lift : 15)).toFixed(1);
        if (host.roof !== 'flat') host.roof = 'flat';
        host.r = flat(insetRing(H.r, 0.12));
      }
    });
  }

  {
    const FILLABLE = new Set(['residential', 'unclassified', 'tertiary', 'secondary', 'living_street']);
    let ownRoadM = 0;
    for (const r of roads) {
      if (r.own === 0 || !FILLABLE.has(r.c)) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) ownRoadM += Math.hypot((r.p[i + 2] - r.p[i]) / 10, (r.p[i + 3] - r.p[i + 1]) / 10);
    }
    const ownBldgs = buildings.reduce((n, b) => n + (b.own === 0 ? 0 : 1), 0);
    // <20 buildings per km of street = clearly sparse (a packed village core is ~60/km,
    // suburbia 30+). No absolute cap: sparse country roads stay sparse-looking even when
    // a hamlet pushes the cell's raw count up.
    const sparse = ownRoadM >= 200 && ownBldgs < (ownRoadM / 1000) * 20;
    if (sparse) {
      const mkRng = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296); };
      const unflat = (f: number[]): P2[] => { const o: P2[] = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
      const rings = buildings.map((b) => unflat(b.r)); // existing footprints, metres
      const inRing = (xs: P2[][], ys: P2[][]) => (x: number, z: number) => xs.some((o) => pointInRing(x, z, o) && !ys.some((i) => pointInRing(x, z, i)));
      const inWater = inRing(areas.flatMap((a) => a.o.map(unflat)), areas.flatMap((a) => a.i.map(unflat)));
      const inBlock = inRing(blockO, blockI); // landuse/leisure masks — already metres
      const inBuilding = (x: number, z: number) => rings.some((r) => pointInRing(x, z, r));
      const buckets = new Set<string>(); // 18 m lot buckets — keeps rows + mapped buildings clear
      const bkey = (x: number, z: number) => `${Math.floor(x / 18)}_${Math.floor(z / 18)}`;
      for (const b of buildings) { const u = unflat(b.r); let cx = 0, cz = 0; for (const [x, z] of u) (cx += x), (cz += z); if (u.length) buckets.add(bkey(cx / u.length, cz / u.length)); }
      const taken = (x: number, z: number) => {
        for (let ox = -18; ox <= 18; ox += 18) for (let oz = -18; oz <= 18; oz += 18) if (buckets.has(bkey(x + ox, z + oz))) return true;
        return false;
      };
      // Collect candidate sites per road first, then emit round-robin — an element-order
      // cap otherwise front-loads the first-listed streets and leaves later ones bare.
      const siteLists: { ring: P2[]; cx: number; cz: number }[][] = [];
      for (const r of roads) {
        if (r.own === 0 || !FILLABLE.has(r.c)) continue;
        // Per-road stream seeded by the road's own first vertex — an Overpass mirror
        // serving elements in a different order can no longer perturb other roads' lots.
        const rng = mkRng(hashStr(`fill/${opts.id}/r${r.p[0]}_${r.p[1]}`));
        const sites: { ring: P2[]; cx: number; cz: number }[] = [];
        let side = hashStr(`${opts.id}/${r.p[0]}`) & 1 ? 1 : -1;
        let carry = 0;
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 1) continue;
          const dx = (bx - ax) / len, dz = (bz - az) / len;
          let t = carry;
          for (; t < len; t += 22 + rng() * 10) {
            side = -side;
            if (rng() < 0.28) continue; // gaps in the row keep it from reading like a comb
            const depth = 9 + rng() * 4, wid = 11 + rng() * 7;
            const off = r.w / 2 + 5.5 + rng() * 3.5 + depth / 2;
            const cx = ax + dx * t + -dz * side * off, cz = az + dz * t + dx * side * off;
            if (!inB(cx, cz)) continue; // interior-only: margin fills could stack against a neighbour's
            sites.push({
              cx, cz,
              ring: [
                [cx - dx * (wid / 2) + dz * (depth / 2), cz - dz * (wid / 2) - dx * (depth / 2)],
                [cx + dx * (wid / 2) + dz * (depth / 2), cz + dz * (wid / 2) - dx * (depth / 2)],
                [cx + dx * (wid / 2) - dz * (depth / 2), cz + dz * (wid / 2) + dx * (depth / 2)],
                [cx - dx * (wid / 2) - dz * (depth / 2), cz - dz * (wid / 2) + dx * (depth / 2)],
              ],
            });
          }
          carry = Math.max(0, t - len); // leftover pitch carries into the next segment
        }
        if (sites.length) siteLists.push(sites);
      }
      let emitted = 0;
      for (let i = 0; emitted < 90; i++) {
        let any = false;
        for (const sites of siteLists) {
          if (i >= sites.length) continue;
          any = true;
          const { ring, cx, cz } = sites[i];
          if (ring.some(([x, z]) => inWater(x, z) || inBlock(x, z) || inBuilding(x, z)) || taken(cx, cz)) continue;
          buckets.add(bkey(cx, cz));
          // Position-seeded: a mirror serving elements in a different order still produces
          // the same building seed for the same lot.
          const seed = hashStr(`fill/${opts.id}/${Math.round(cx * 10)}_${Math.round(cz * 10)}`);
          const r4 = (seed >>> 8) % 100;
          buildings.push({
            r: flat(ring), h: +(6.5 + ((seed % 1000) / 1000) * 3).toFixed(1), k: 'house', s: seed,
            roof: r4 < 62 ? 'gable' : r4 < 94 ? 'hip' : 'flat',
            own: undefined, gen: 'fill',
          });
          rings.push(ring);
          if (++emitted >= 90) break;
        }
        if (!any) break;
      }
    }
  }

  return {
    version: 1,
    id: opts.id,
    lod: 0,
    box,
    origin: opts.origin,
    slice: S,
    backdrop: S,
    buildings,
    roads,
    areas,
    lines,
    points,
    attribution: 'Map data © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright',
    osmBase: osm.osm3s?.timestamp_osm_base ?? null,
  };
}
