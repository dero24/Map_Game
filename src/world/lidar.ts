// Measured buildings for the lower 48: USGS 3DEP LiDAR, read and fitted in the tile worker.
//
// Per real (OSM/Overture) tile, before the builders run:
//   1. candidate 3DEP projects for the cell from lidar-index.json (bundled) (newest first)
//   2. that project's Entwine Point Tile octree (public S3, CORS-open, EPSG:3857): every node
//      over the cell down to ~1 m point spacing, LAZ-decoded by the vendored laz-perf WASM
//   3. points → 1 m surface / ground grids → height above ground (lidarCore.ts)
//   4. each footprint's roof fitted (measure.ts): true ridge, true eave, flat / hip / gable
//   5. written onto the Building (h, eav, roof) — buildings.ts builds exactly that
// Results are cached per cell in IndexedDB (a few KB), so a cell is only ever measured once
// per browser. Graceful by construction: no index / no coverage / offline → the tile builds
// from its mapped priors exactly as before. Deterministic for a given survey.
import createLazPerf, { type LazPerf } from '../vendor/laz-perf/laz-perf.js';
// The decoder's WASM rides in the worker chunk as base64 rather than a separate request:
// a same-origin fetch can queue for minutes behind slow tile-service calls (HTTP/1.1 dev).
import WASM_B64 from '../vendor/laz-perf/wasm-b64';
import type { Box, Building, TileJson } from './data';
// The project index ships inside the worker bundle (≈100 KB gzipped): no request of its own
// to queue behind tile fetches, and every build sees the same snapshot. Regenerate with
// `node scripts/lidar-index.mjs`.
import INDEX from './lidar-index.json';
import { kvGet, kvPut } from './cache';
import { measureFootprint, type RoofFit } from './measure';
import {
  LidarGrid, boxLatLon, candidates, depthFor, depthForDensity, detectTrees, hagAt, lasClass, lasHeader, localToMercBox, mercToLocal, nodesIn, projectLocal, ringMask, unprojectLocal,
  type EptInfo, type Hag, type LidarIndex, type LidarProject, type TreeHit,
} from './lidarCore';

type LatLon = { lat: number; lon: number };
// Cache key version: bump when measure.ts / the raster change; the index snapshot date is part
// of the key too, so a regenerated index re-checks cells it once found uncovered.
const VER = `lidar|v4|${(INDEX as unknown as { made?: string }).made ?? ''}|`;
const PAD = 12; // m of raster beyond the cell: footprints straddling the edge still measure
const MAX_PROJECTS = 3;
const MAX_POINTS = 4e6; // per cell per survey — whole octree levels are dropped to stay under it
const CONC = 6;
const FETCH_MS = 30000; // a stalled S3 read gives up rather than holding a cell slot

let on = false;
let origin: LatLon | null = null;
let lpP: Promise<LazPerf> | null = null;

export function initLidar(o: LatLon) {
  on = true;
  origin = o;
}
export const lidarOn = () => on && !!origin;
// Where notes go (the worker forwards them to the page console).
let log: (msg: string) => void = (m) => console.info(m);
export function setLidarLog(fn: (msg: string) => void) { log = fn; }

const index = () => INDEX as unknown as LidarIndex;
const lazperf = () =>
  (lpP ??= (async () => {
    const bin = atob(WASM_B64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return createLazPerf({ wasmBinary: u8.buffer });
  })());

// ---------- EPT reads (session-cached) ----------
const eptP = new Map<string, Promise<EptInfo>>();
const hierP = new Map<string, Promise<Record<string, number>>>();
const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(FETCH_MS) }).then((r) => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r; });
const json = <T>(url: string) => get(url).then((r) => r.json() as Promise<T>);
function ept(base: string) {
  let p = eptP.get(base);
  if (!p) eptP.set(base, (p = json<EptInfo>(base + 'ept.json')));
  p.catch(() => eptP.delete(base));
  return p;
}
function hier(base: string, key: string) {
  const k = base + key;
  let p = hierP.get(k);
  if (!p) hierP.set(k, (p = json<Record<string, number>>(`${base}ept-hierarchy/${key}.json`)));
  p.catch(() => hierP.delete(k));
  return p;
}
// Nodes over the cell down to the depth that gives DENSITY points/m² (≈0.8 m spacing —
// a 10×12 m house gets ~180 returns); `cap` bounds the hierarchy walk. Whole levels are
// then dropped while the read would exceed MAX_POINTS, so what gets read never depends on
// network timing (the result is cached for good — it must be the same every time).
const DENSITY = 1.5;
async function nodesFor(base: string, E: EptInfo, mb: [number, number, number, number], lat: number) {
  const cap = depthFor(E, lat, 0.6);
  const H: Record<string, number> = { ...(await hier(base, '0-0-0-0')) };
  const seen = new Set<string>(['0-0-0-0']);
  for (;;) {
    const pend = nodesIn(E, H, mb, cap).filter((k) => H[k] === -1 && !seen.has(k));
    if (!pend.length) break;
    for (const k of pend) seen.add(k);
    const subs = await Promise.all(pend.map((k) => hier(base, k)));
    for (const s of subs) Object.assign(H, s);
  }
  const all = nodesIn(E, H, mb, cap).filter((k) => H[k] !== 0);
  let maxD = depthForDensity(E, H, all, lat, DENSITY, cap);
  const sum = (d: number) => all.reduce((a, k) => a + (+k.split('-')[0] <= d ? Math.max(0, H[k]) : 0), 0);
  while (maxD > 0 && sum(maxD) > MAX_POINTS) maxD--;
  const nodes = all.filter((k) => +k.split('-')[0] <= maxD).sort((a, b) => +a.split('-')[0] - +b.split('-')[0] || (a < b ? -1 : 1));
  return { maxD, nodes };
}

// Decoded shallow nodes are shared by every cell under them — keep a few.
interface Pts { X: Float64Array; Y: Float64Array; Z: Float32Array; C: Uint8Array }
const ptsCache = new Map<string, Promise<Pts>>();
function points(url: string, keep: boolean): Promise<Pts> {
  const hit = ptsCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    const [ab, LP] = await Promise.all([get(url).then((r) => r.arrayBuffer()), lazperf()]);
    const buf = new Uint8Array(ab);
    const hd = lasHeader(buf);
    const src = LP._malloc(buf.length);
    LP.HEAPU8.set(buf, src);
    const z = new LP.LASZip();
    try {
      z.open(src, buf.length);
      const n = z.getCount(), len = z.getPointLength(), pf = hd.pf; // header's id, compression bits masked
      const rec = LP._malloc(len);
      const out: Pts = { X: new Float64Array(n), Y: new Float64Array(n), Z: new Float32Array(n), C: new Uint8Array(n) };
      try {
        let H8 = LP.HEAPU8, dv = new DataView(H8.buffer, rec, len);
        for (let i = 0; i < n; i++) {
          z.getPoint(rec);
          if (LP.HEAPU8.buffer !== H8.buffer) (H8 = LP.HEAPU8), (dv = new DataView(H8.buffer, rec, len)); // wasm memory grew
          out.X[i] = dv.getInt32(0, true) * hd.sx + hd.ox;
          out.Y[i] = dv.getInt32(4, true) * hd.sy + hd.oy;
          out.Z[i] = dv.getInt32(8, true) * hd.sz + hd.oz;
          out.C[i] = lasClass(H8, rec, pf);
        }
      } finally {
        LP._free(rec);
      }
      return out;
    } finally {
      z.delete();
      LP._free(src);
    }
  })();
  if (keep) {
    ptsCache.set(url, p);
    p.catch(() => ptsCache.delete(url));
    while (ptsCache.size > 24) ptsCache.delete(ptsCache.keys().next().value!);
  }
  return p;
}

// ---------- the cell raster ----------
// Surveys are tried newest first; a survey that fails (404 after an index refresh, S3
// hiccup) is skipped, not fatal. null = every candidate was read and none had ground
// returns here (safe to remember); a throw = nothing usable AND something failed (retry).
export async function hagFor(box: Box, cands: LidarProject[]): Promise<Hag | null> {
  const idx = index();
  if (!origin) throw new Error('lidar: no origin');
  const bb = boxLatLon(origin, box);
  const A = mercToLocal(origin, box);
  const mb = localToMercBox(origin, box, PAD);
  let grid: LidarGrid | null = null;
  let src = '', year = 0, failed: unknown = null;
  for (const c of cands.slice(0, MAX_PROJECTS)) {
    const base = `${idx.ept}${c.n}/`;
    let g: LidarGrid;
    try {
      const E = await ept(base);
      const { maxD, nodes } = await nodesFor(base, E, mb, (bb.s + bb.n) / 2);
      if (!nodes.length) continue;
      g = new LidarGrid(box.x0 - PAD, box.z0 - PAD, 1, box.x1 + PAD, box.z1 + PAD);
      let i = 0;
      const work = async () => {
        while (i < nodes.length) {
          const k = nodes[i++];
          const P = await points(`${base}ept-data/${k}.laz`, +k.split('-')[0] <= maxD - 2);
          for (let j = 0; j < P.X.length; j++) {
            const X = P.X[j], Y = P.Y[j];
            if (X < mb[0] || X > mb[2] || Y < mb[1] || Y > mb[3]) continue;
            g.add(A.a * X + A.b * Y + A.c, A.d * X + A.e * Y + A.f, P.Z[j], P.C[j]);
          }
        }
      };
      await Promise.all(Array.from({ length: CONC }, work));
    } catch (e) {
      failed = e;
      continue;
    }
    if (g.groundFraction() < 0.02) continue; // outline said yes, the survey says no (or unclassified)
    if (!grid) (grid = g), (src = c.n), (year = c.y);
    else grid.fillFrom(g);
    if (grid.surfaceFraction() > 0.9) break;
  }
  if (!grid) {
    if (failed) throw failed;
    return null;
  }
  return { x0: grid.x0, z0: grid.z0, res: grid.res, w: grid.w, h: grid.h, v: grid.hag(), chm: grid.canopy(), cov: grid.coverage(box, 16), src, year };
}

// ---------- per-tile enrichment ----------
interface Rec {
  src?: string; yr?: number; none?: 1;
  m: Record<string, number[]>; // building fits by centroid lat/lon: [h, eav, rs, q] or [] (unmeasurable)
  t?: number[]; // trees: [Δlat µdeg, Δlon µdeg, h dm, crown r dm]… from the cell-key centre
  tc?: number[]; // 16×16 coverage blocks (1 = the survey saw this ground)
}
const RS: RoofFit[] = ['flat', 'hip', 'gable', 'gableX', 'pitched'];
const recMem = new Map<string, Rec>();
const hagMem = new Map<string, Promise<Hag | null>>();
const hagDone = new Set<string>(); // settled entries — only these are evictable
// Cells read two at a time: six cells sharing the network finish together after 30 s;
// two at a time, the first lands in ~5 s and the rest follow. Newest request first — the
// player has moved on, and the cells asked for last are the ones around them now. A
// finishing read hands its slot straight to the next waiter (no window for a third).
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(f: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r));
  else running++;
  try {
    return await f();
  } finally {
    const next = waiting.pop();
    if (next) next();
    else running--;
  }
}

function cellKeyOf(box: Box) {
  const [lat, lon] = unprojectLocal(origin!, (box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2);
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
function ringOf(b: Building): [number, number][] {
  const r: [number, number][] = [];
  for (let i = 0; i < b.r.length; i += 2) r.push([b.r[i] / 10, b.r[i + 1] / 10]);
  return r;
}
function bKey(b: Building) {
  let x = 0, z = 0;
  const n = b.r.length / 2;
  for (let i = 0; i < b.r.length; i += 2) (x += b.r[i]), (z += b.r[i + 1]);
  const [lat, lon] = unprojectLocal(origin!, x / n / 10, z / n / 10);
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}
// Trees ride in the record as lat/lon offsets (origin-independent), out to local ints on the tile.
function packTrees(ck: string, T: TreeHit[]): number[] {
  const [clat, clon] = ck.split(',').map(Number);
  const out: number[] = [];
  for (const t of T) {
    const [lat, lon] = unprojectLocal(origin!, t.x, t.z);
    out.push(Math.round((lat - clat) * 1e6), Math.round((lon - clon) * 1e6), Math.round(t.h * 10), Math.round(t.r * 10));
  }
  return out;
}
function unpackTrees(ck: string, P: number[]): number[] {
  const [clat, clon] = ck.split(',').map(Number);
  const out: number[] = [];
  for (let i = 0; i + 3 < P.length; i += 4) {
    const [x, z] = projectLocal(origin!, clat + P[i] / 1e6, clon + P[i + 1] / 1e6);
    out.push(Math.round(x * 10), Math.round(z * 10), P[i + 2], P[i + 3]);
  }
  return out;
}
function applyTrees(tj: TileJson, ck: string, rec: Rec) {
  if (!rec.t || !rec.tc) return;
  tj.trees = unpackTrees(ck, rec.t);
  tj.treeCov = rec.tc;
}
const measurable = (b: Building) => b.own !== 0 && !b.gen && b.k !== 'lighthouse' && b.k !== 'church' && b.roof !== 'tower';

// Stored fit → Building. Flat: flat (a mapped skillion keeps its slope). Rectangles: the
// fitted style. Other outlines ('pitched'): the mapped gable/hip style keeps, with the
// measured eave and ridge; a mapped skillion keeps its shape and takes only the height.
function apply(b: Building, m: number[]) {
  if (m.length < 4 || m[3] < 0.35) return;
  const [h, eav, rs] = m;
  if (h > (b.k === 'house' || b.k === 'shed' ? 40 : 400)) return; // implausible: keep priors
  b.h = Math.max(2.4, h);
  b.ms = 1;
  if (rs === 0 || b.roof === 'skillion') {
    if (rs === 0 && b.roof !== 'skillion') b.roof = 'flat';
    delete b.eav;
    return;
  }
  if (RS[rs] === 'pitched') b.roof = b.roof === 'gable' || b.roof === 'hip' ? b.roof : 'hip';
  else b.roof = RS[rs] === 'hip' ? 'hip' : 'gable';
  b.eav = Math.max(2.2, Math.min(eav, b.h - 0.6));
}

export type Enrich = 'done' | 'late' | 'none';
const LATE = Symbol('late');

// `wait`: ms to wait for a first-time measurement before building from priors (→ 'late':
// the caller rebuilds when it lands); null waits for it. `fetch: false` (lite/LOD builds)
// only applies what the cache already knows.
export async function enrichTile(tj: TileJson, box: Box, wait: number | null, fetchOk = true): Promise<Enrich> {
  if (!lidarOn()) return 'none';
  const todo = tj.buildings.filter(measurable);
  const ck = cellKeyOf(box);
  let rec = recMem.get(ck);
  if (!rec) {
    const stored = await kvGet<Rec>(VER + ck);
    rec = recMem.get(ck) ?? stored; // another build may have filled it during the await
    if (rec) recMem.set(ck, rec);
  }
  if (rec?.none) return 'none';
  const keys = todo.map(bKey);
  if (rec) todo.forEach((b, i) => { const m = rec!.m[keys[i]]; if (m) apply(b, m); });
  if (rec) applyTrees(tj, ck, rec);
  const missing = todo.filter((_, i) => !rec?.m[keys[i]]);
  if (rec?.t && (!missing.length || missing.length <= todo.length * 0.03)) return 'done';
  if (!fetchOk) return rec ? 'done' : 'none';
  // No survey near this cell at all (outside the US, open ocean): settle it now, before
  // queueing behind other cells' reads or racing a timer into a pointless rebuild.
  const cands = candidates(index(), boxLatLon(origin!, box));
  if (!cands.length) {
    rec = { none: 1, m: {} };
    recMem.set(ck, rec);
    void kvPut(VER + ck, rec);
    return 'none';
  }

  let gp = hagMem.get(ck);
  if (!gp) {
    const t0 = performance.now();
    log(`lidar ${ck}: reading for ${missing.length} footprints${rec?.t ? '' : ' + trees'}`);
    hagMem.set(ck, (gp = limited(() => hagFor(box, cands))));
    void gp.then(() => hagDone.add(ck), () => {});
    void gp.then((g) => log(g ? `lidar ${ck}: ${g.src} read in ${((performance.now() - t0) / 1000).toFixed(1)} s` : `lidar ${ck}: no survey covers this cell`), () => {});
    gp.catch((e) => { log(`lidar ${ck}: unavailable (${e?.message ?? e})`); hagMem.delete(ck); });
    for (const k of hagMem.keys()) {
      if (hagMem.size <= 4) break;
      if (hagDone.has(k)) hagMem.delete(k), hagDone.delete(k);
    }
  }
  let g: Hag | null | typeof LATE;
  try {
    g = wait == null ? await gp : await Promise.race([gp, new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), wait))]);
  } catch {
    return rec ? 'done' : 'none'; // network trouble: build from priors, try again another visit
  }
  if (g === LATE) return 'late';
  rec = recMem.get(ck) ?? rec ?? { m: {} };
  if (!g) {
    if (!Object.keys(rec.m).length) (rec.none = 1), recMem.set(ck, rec), void kvPut(VER + ck, rec);
    return 'none';
  }
  const G = g;
  rec.src = G.src;
  rec.yr = G.year;
  const fresh: [Building, string, number[]][] = [];
  todo.forEach((b, i) => {
    const k = keys[i];
    if (rec!.m[k]) return;
    const prior = b.roof === 'gable' || b.roof === 'hip' || b.roof === 'flat' ? b.roof : undefined;
    const m = measureFootprint(ringOf(b), (x, z) => hagAt(G, x, z), prior);
    fresh.push([b, k, m ? [m.h, m.eav, RS.indexOf(m.rs), m.q] : []]);
  });
  // Vertical units: EPT keeps each survey's Z units, and some 3DEP deliveries are in US
  // survey feet (the index doesn't say). Houses standing ~25 m tall on median is feet.
  const hs = fresh.filter(([b, , m]) => b.k === 'house' && m.length && m[3] >= 0.35).map(([, , m]) => m[0]).sort((a, b) => a - b);
  const feet = hs.length >= 8 && hs[hs.length >> 1] > 14;
  if (feet) log(`lidar ${ck}: ${G.src} reads as feet (median house ${hs[hs.length >> 1].toFixed(1)}) — scaling`);
  for (const [b, k, m] of fresh) {
    if (m.length && feet) (m[0] *= 0.3048006), (m[1] *= 0.3048006);
    rec.m[k] = m.length ? [+m[0].toFixed(2), +m[1].toFixed(2), m[2], +m[3].toFixed(2)] : [];
    apply(b, rec.m[k]);
  }
  recMem.set(ck, rec);
  void kvPut(VER + ck, rec);
  if (!rec.t) {
    // Trees: the vegetation-classified canopy when the survey has one, else every
    // non-ground return with roofs (mapped footprints + 1 m) masked and smooth tops rejected.
    const blocked = ringMask(G, tj.buildings.map(ringOf), 1.0);
    const T = detectTrees(G, G.chm ?? G.v, blocked, box, !G.chm);
    rec.t = packTrees(ck, T);
    rec.tc = Array.from(G.cov);
  }
  applyTrees(tj, ck, rec);
  const ok = Object.values(rec.m).filter((m) => m.length === 4 && m[3] >= 0.35).length;
  log(`lidar ${ck}: ${ok}/${Object.keys(rec.m).length} buildings measured, ${rec.t.length / 4} trees (${G.chm ? 'classified' : 'unclassified'} canopy) from ${G.src}`);
  return 'done';
}
