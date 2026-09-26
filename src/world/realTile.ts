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

// ---------------- tag tables (port of scripts/bake.mjs) ----------------

const ROAD_W: Record<string, number> = { motorway: 14, trunk: 12, primary: 11, primary_link: 6, secondary: 9, secondary_link: 6, tertiary: 8, tertiary_link: 5, residential: 6.5, unclassified: 6, living_street: 5, service: 4, pedestrian: 5, track: 3, footway: 1.8, path: 1.5, cycleway: 2, steps: 2, bridleway: 2, construction: 5 };
const ROOF_TAG: Record<string, Building['roof']> = { gabled: 'gable', gable: 'gable', hipped: 'hip', hip: 'hip', 'half-hipped': 'hip', side_hipped: 'hip', pyramidal: 'hip', flat: 'flat', skillion: 'skillion', lean_to: 'skillion', gambrel: 'gable', mansard: 'hip', saltbox: 'gable', dome: 'hip', round: 'hip', onion: 'hip', cone: 'hip', butterfly: 'flat', sawtooth: 'flat' };
const CLS_COMMERCIAL = new Set(['commercial', 'retail', 'office', 'hotel', 'civic', 'public', 'school', 'fire_station', 'government', 'hospital', 'supermarket', 'restaurant', 'kiosk', 'industrial', 'warehouse', 'college', 'university', 'train_station', 'transportation', 'clinic']);
const CLS_CHURCH = new Set(['church', 'chapel', 'cathedral', 'temple', 'mosque', 'synagogue', 'religious', 'shrine']);
const CLS_SHED = new Set(['garage', 'garages', 'shed', 'carport', 'hut', 'cabin', 'boathouse', 'outbuilding', 'roof']);

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

export function osmToTile(osm: OsmDoc, opts: RealTileOpts): TileJson {
  const margin = opts.margin ?? 48;
  const box = opts.box;
  const P = makeProjector(opts.origin);
  const S: Box = { x0: box.x0 - margin, z0: box.z0 - margin, x1: box.x1 + margin, z1: box.z1 + margin };
  const inB = (x: number, z: number, m = 0) => x >= box.x0 - m && x <= box.x1 + m && z >= box.z0 - m && z <= box.z1 + m;
  const els = (osm.elements ?? []).slice().sort((a, b) => a.id - b.id); // stable output regardless of server ordering

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
  const roads: Road[] = [];
  const areas: Area[] = [];
  const lines: Line[] = [];
  const points: Point[] = [];

  for (const e of els) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      // Point furniture — same tag→class the bake emits; props.ts consumes these.
      const pc = t.natural === 'tree' ? 'tree' : t.amenity === 'bench' ? 'bench' : null;
      if (pc && e.lat != null && e.lon != null) {
        const [x, z] = P.project(e.lat, e.lon);
        if (inB(x, z, margin))
          points.push({ c: pc, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, own: inB(x, z) ? undefined : OWN_CTX });
      }
      continue;
    }
    if (e.type === 'way' && t.highway && t.highway in ROAD_W) {
      const pts = wayPts(e);
      if (pts.length < 2) continue;
      let w = parseFloat(t.width) || ROAD_W[t.highway];
      if (t.highway === 'primary' && t.lanes) w = Math.max(w, parseInt(t.lanes) * 3.4 + 1.5);
      if (t.footway === 'sidewalk') w = 1.6;
      const p = flat(pts);
      if (!anyVertex(p, margin)) continue;
      const r: Road = { p, c: t.highway, w: +w.toFixed(1), own: ownV(p) };
      if (t.name) r.n = t.name;
      if (t.ref) r.ref = t.ref;
      if (t.bridge && t.bridge !== 'no') r.br = t['bridge:movable'] || t.bridge === 'movable' ? 'movable' : 'yes';
      if (t.layer) r.l = parseInt(t.layer) || 0;
      if (t.oneway === 'yes') r.ow = 1;
      if (t.footway === 'sidewalk') r.sw = 1;
      if (t.service) r.sv = t.service;
      roads.push(r);
      continue;
    }
    if (t.building) {
      const rings = areaRings(e);
      if (!rings) continue;
      const seed = hashStr(`${e.type}/${e.id}`);
      for (const raw of rings.outer) {
        let ring = cleanRing(raw);
        if (ring.length < 3) continue;
        const area = Math.abs(ringArea(ring));
        if (area < 6) continue;
        if (ringArea(ring) < 0) ring.reverse();
        const p = flat(ring);
        if (!anyVertex(p, margin)) continue;
        const o = obb(ring);
        const kind: Building['k'] =
          t.man_made === 'lighthouse' ? 'lighthouse'
          : CLS_CHURCH.has(t.building) || t.amenity === 'place_of_worship' ? 'church'
          : CLS_COMMERCIAL.has(t.building) || t.shop || t.office ? 'commercial'
          : t.building === 'apartments' || area > 700 ? 'large'
          : area < 32 || CLS_SHED.has(t.building) ? 'shed'
          : 'house';
        let h = t.height ? parseFloat(t.height) : null;
        const floors = t['building:levels'] ? parseFloat(t['building:levels']) : null;
        if (h == null && floors) h = floors * 3.1 + 1.5;
        if (h == null || !isFinite(h)) {
          const r = (seed % 1000) / 1000;
          h = kind === 'shed' ? 3 + r : kind === 'large' ? 8 + r * 5 : kind === 'commercial' ? 5.5 + r * 3 : 6.5 + r * 3;
        }
        if (kind === 'lighthouse') h = 21;
        h = Math.max(kind === 'shed' ? 2.6 : 3.2, Math.min(40, h));
        const tagRoof = ROOF_TAG[String(t['roof:shape'] ?? '').toLowerCase()];
        const r4 = (seed >>> 8) % 100;
        const roof: Building['roof'] =
          kind === 'lighthouse' ? 'tower'
          : tagRoof ?? (kind === 'church' ? 'gable'
          : kind === 'house' ? (o.wid > 18 || ring.length > 40 ? 'flat' : r4 < 58 ? 'gable' : r4 < 92 ? 'hip' : 'flat')
          : kind === 'shed' ? (r4 < 50 ? 'gable' : r4 < 75 ? 'skillion' : r4 < 85 ? 'hip' : 'flat')
          : kind === 'commercial' ? (o.wid < 13 && area < 400 && r4 < 45 ? (r4 < 30 ? 'gable' : 'hip') : 'flat')
          : kind === 'large' ? (o.wid < 16 && r4 < 25 ? 'hip' : 'flat')
          : 'flat');
        const b: Building = { r: p, h: +h.toFixed(1), k: kind, roof, s: seed, own: ownC(p) };
        const fc = parseColour(t['building:colour']) ?? materialColour(t['building:material']);
        if (fc != null) b.fc = fc;
        const rc = parseColour(t['roof:colour']) ?? roofMaterialColour(t['roof:material']);
        if (rc != null) b.rc = rc;
        if (floors && isFinite(floors)) b.fl = Math.round(floors);
        const minH = t.min_height ? parseFloat(t.min_height) : t['building:min_level'] ? parseFloat(t['building:min_level']) * 3 : null;
        if (minH && isFinite(minH)) b.mh = +minH.toFixed(1);
        if (t.name) b.n = t.name;
        if (t['addr:housenumber'] && t['addr:street']) b.ad = `${t['addr:housenumber']} ${t['addr:street']}`;
        buildings.push(b);
      }
      continue;
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
    for (const chain of assembleChains(parts)) {
      // Keep only the sub-chains inside the boundary (coast ways can run for many km),
      // recording whether each end is a real boundary crossing or just the way's end.
      const runs: { frag: P2[]; startOpen: boolean; endOpen: boolean }[] = [];
      let run: P2[] = [];
      let startOpen = false;
      for (let i = 0; i < chain.length; i++) {
        const p = chain[i];
        if (inB(p[0], p[1], margin)) {
          if (!run.length) startOpen = i > 0;
          run.push(p);
        } else if (run.length) {
          runs.push({ frag: run, startOpen, endOpen: true });
          run = [];
        }
      }
      if (run.length) runs.push({ frag: run, startOpen, endOpen: false });
      for (const { frag, startOpen: so, endOpen: eo } of runs) {
        if (frag.length < 2 || !so || !eo) continue;
        // A closed loop inside the box is an island (land, not water) — skip it.
        if (Math.hypot(frag[0][0] - frag.at(-1)![0], frag[0][1] - frag.at(-1)![1]) < 1) continue;
        // Both ends crossed the boundary — project them onto the nearest edge.
        const snap = (p: P2): P2 => [Math.max(cb.x0, Math.min(cb.x1, p[0])), Math.max(cb.z0, Math.min(cb.z1, p[1]))];
        const a = snap(frag[0]), b = snap(frag.at(-1)!);
        const body: P2[] = [a, ...frag.slice(1, -1), b];
        // Water sits right of the direction of travel: a probe just right of the mid
        // segment decides which of the two boundary arcs closes over the sea.
        const mi = Math.max(0, Math.floor(body.length / 2) - 1);
        const dx = body[mi + 1][0] - body[mi][0], dz = body[mi + 1][1] - body[mi][1];
        const dl = Math.hypot(dx, dz) || 1;
        const probe: P2 = [
          Math.max(cb.x0 + 1, Math.min(cb.x1 - 1, (body[mi][0] + body[mi + 1][0]) / 2 + (-dz / dl) * 15)),
          Math.max(cb.z0 + 1, Math.min(cb.z1 - 1, (body[mi][1] + body[mi + 1][1]) / 2 + (dx / dl) * 15)),
        ];
        const ta = tau(a), tb = tau(b);
        const ringF: P2[] = [...body, ...arc(tb, ta, 1)];
        const ringB: P2[] = [...body, ...arc(tb, ta, -1)];
        const ring = pointInRing(probe[0], probe[1], ringF) ? ringF : ringB;
        const f = flat(simplify(cleanRing(ring), 0.25));
        if (f.length >= 6 && anyVertex(f, margin)) areas.push({ c: 'water', o: [f], i: [], own: ownV(f) });
      }
    }
  }

  // ---- hybrid fill (H3-lite): sparse cells grow houses along their real streets ----
  // OSM building coverage is patchy outside cities — a mapped street with two barns
  // shouldn't read as empty. When owner building density is very low relative to
  // fillable road mileage, seed deterministic lots beside those roads. They're real
  // content for the tile (cached in R2): every visitor sees the same fill.
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
      let rs = hashStr('fill:' + opts.id);
      const rng = () => ((rs = (rs * 1664525 + 1013904223) >>> 0), rs / 4294967296);
      const unflat = (f: number[]): P2[] => { const o: P2[] = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
      const rings = buildings.map((b) => unflat(b.r)); // existing footprints, metres
      const waterO = areas.flatMap((a) => a.o.map(unflat));
      const waterI = areas.flatMap((a) => a.i.map(unflat));
      const inWater = (x: number, z: number) => waterO.some((o) => pointInRing(x, z, o) && !waterI.some((i) => pointInRing(x, z, i)));
      const inBuilding = (x: number, z: number) => rings.some((r) => pointInRing(x, z, r));
      const buckets = new Set<string>(); // 18 m lot buckets so fills don't pile up
      const bkey = (x: number, z: number) => `${Math.floor(x / 18)}_${Math.floor(z / 18)}`;
      let emitted = 0;
      for (const r of roads) {
        if (emitted >= 90 || r.own === 0 || !FILLABLE.has(r.c)) continue;
        let side = hashStr(`${opts.id}/${r.p[0]}`) & 1 ? 1 : -1;
        let carry = 0;
        for (let i = 0; i + 3 < r.p.length && emitted < 90; i += 2) {
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
            if (!inB(cx, cz, margin)) continue;
            const ring: P2[] = [
              [cx - dx * (wid / 2) + dz * (depth / 2), cz - dz * (wid / 2) - dx * (depth / 2)],
              [cx + dx * (wid / 2) + dz * (depth / 2), cz + dz * (wid / 2) - dx * (depth / 2)],
              [cx + dx * (wid / 2) - dz * (depth / 2), cz + dz * (wid / 2) + dx * (depth / 2)],
              [cx - dx * (wid / 2) - dz * (depth / 2), cz - dz * (wid / 2) + dx * (depth / 2)],
            ];
            if (ring.some(([x, z]) => inWater(x, z) || inBuilding(x, z))) continue;
            const bk = bkey(cx, cz);
            if (buckets.has(bk) || buckets.has(bkey(cx + 18, cz)) || buckets.has(bkey(cx - 18, cz)) || buckets.has(bkey(cx, cz + 18)) || buckets.has(bkey(cx, cz - 18))) continue;
            buckets.add(bk);
            const seed = hashStr(`fill/${opts.id}/${emitted}`);
            const f = flat(ring);
            const r4 = (seed >>> 8) % 100;
            // Fills emit as own even when their centroid lands in the margin: the road's
            // owner cell is the only emitter — a context flag would drop it for everyone.
            buildings.push({
              r: f, h: +(6.5 + rng() * 3).toFixed(1), k: 'house', s: seed,
              roof: r4 < 62 ? 'gable' : r4 < 94 ? 'hip' : 'flat',
              own: undefined, gen: 'fill',
            });
            rings.push(ring);
            emitted++;
          }
          carry = Math.max(0, t - len); // leftover pitch carries into the next segment
        }
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
