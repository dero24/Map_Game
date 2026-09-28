// Measured buildings for the lower 48: USGS 3DEP LiDAR, applied in the tile worker.
//
// Per real (OSM/Overture) tile, before the builders run:
//   1. candidate 3DEP projects for the cell from lidar-index.json (bundled), newest first
//   2. the LiDAR worker (lidar.worker.ts → lidarCell.ts) reads the survey's Entwine Point
//      Tile octree (public S3, CORS-open, EPSG:3857), LAZ-decoded by vendored laz-perf, into
//      1 m height-above-ground rasters (lidarCore.ts), fits each footprint's roof (measure.ts),
//      finds buildings the map doesn't have and the real trees
//   3. results land here: cached per cell in IndexedDB (a few KB) and written onto the tile's
//      Buildings (h, eav, roof), new Buildings and TileJson.trees — the builders build that
// Its own worker (spawned by the page, wired here by a MessageChannel) because the decode
// and raster passes take seconds per cell: on the tile worker they held every other build
// (placeholders, the coarse ring) behind them.
// Graceful by construction: no coverage / offline → the tile builds from its mapped priors.
import type { Box, Building, TileJson } from './data';
// The project index ships inside the worker bundle (≈100 KB gzipped): no request of its own
// to queue behind tile fetches, and every build sees the same snapshot. Regenerate with
// `node scripts/lidar-index.mjs`.
import INDEX from './lidar-index.json';
import { kvGet, kvPut } from './cache';
import { boxLatLon, candidates, projectLocal, unprojectLocal, type LidarIndex } from './lidarCore';
import { RS, type CellReq, type CellRes } from './lidarCell';

type LatLon = { lat: number; lon: number };
// Cache key version: bump when measure/raster/detection logic changes; the index snapshot
// date is part of the key too, so a regenerated index re-checks cells it once found uncovered.
const VER = `lidar|v7|${(INDEX as unknown as { made?: string }).made ?? ''}|`;

let on = false;
let origin: LatLon | null = null;
export function initLidar(o: LatLon) {
  on = true;
  origin = o;
}
export const lidarOn = () => on && !!origin;
// Where notes go (the tile worker forwards them to the page console).
let log: (msg: string) => void = (m) => console.info(m);
export function setLidarLog(fn: (msg: string) => void) { log = fn; }
const index = () => INDEX as unknown as LidarIndex;

// ---------- the LiDAR worker ----------
// The page spawns it next to the tile worker and hands us one end of a MessageChannel
// (no nested workers — not every engine has them). Without a port, the work runs inline.
let port: MessagePort | null = null, lseq = 0;
const ljobs = new Map<number, { res: (r: CellRes) => void; rej: (e: Error) => void }>();
export function setLidarPort(p: MessagePort) {
  port = p;
  port.onmessage = (e) => {
    const m = e.data;
    if (m.kind === 'log') return log(m.msg);
    const j = ljobs.get(m.id);
    if (!j) return;
    ljobs.delete(m.id);
    if (m.kind === 'done') j.res(m.res);
    else j.rej(new Error(m.message));
  };
}
function cellWork(q: CellReq): Promise<CellRes> {
  if (port) {
    const id = ++lseq;
    return new Promise((res, rej) => {
      ljobs.set(id, { res, rej });
      port!.postMessage({ kind: 'cell', id, q });
    });
  }
  return import('./lidarCell').then((m) => (m.setCellLog(log), m.measureCell(q)));
}

// ---------- per-tile enrichment ----------
interface Rec {
  src?: string; yr?: number; none?: 1;
  m: Record<string, number[]>; // building fits by centroid lat/lon: [h, eav, rs, q] or [] (unmeasurable)
  t?: number[]; // trees: [Δlat µdeg, Δlon µdeg, h dm, crown r dm]… from the cell-key centre
  tc?: number[]; // 16×16 coverage blocks (1 = the survey saw this ground)
  nb?: { r: number[]; m: number[] }[]; // unmapped buildings found in the survey: ring as µdeg offsets, fit [h, eav, rs, q]
}
const recMem = new Map<string, Rec>();

function cellKeyOf(box: Box) {
  const [lat, lon] = unprojectLocal(origin!, (box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2);
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
function bKey(b: Building) {
  let x = 0, z = 0;
  const n = b.r.length / 2;
  for (let i = 0; i < b.r.length; i += 2) (x += b.r[i]), (z += b.r[i + 1]);
  const [lat, lon] = unprojectLocal(origin!, x / n / 10, z / n / 10);
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}
// Trees ride in the record as lat/lon offsets (origin-independent), out to local ints on the tile.
function unpackTrees(ck: string, P: number[]): number[] {
  const [clat, clon] = ck.split(',').map(Number);
  const out: number[] = [];
  for (let i = 0; i + 3 < P.length; i += 4) {
    const [x, z] = projectLocal(origin!, clat + P[i] / 1e6, clon + P[i + 1] / 1e6);
    out.push(Math.round(x * 10), Math.round(z * 10), P[i + 2], P[i + 3]);
  }
  return out;
}
// Buildings the map doesn't have (detectBuildings) join the tile as real, measured
// footprints; the hybrid-fill guesses (seeded houses along real streets) retire wherever
// the survey saw the ground — the survey knows what's actually standing there.
const newApplied = new WeakSet<TileJson>();
function applyNew(tj: TileJson, box: Box, ck: string, rec: Rec) {
  if (!rec.nb || !rec.tc || newApplied.has(tj)) return;
  newApplied.add(tj);
  const tc = rec.tc;
  const covered = (x: number, z: number) => {
    const I = Math.floor(((x - box.x0) / (box.x1 - box.x0)) * 16), J = Math.floor(((z - box.z0) / (box.z1 - box.z0)) * 16);
    return I >= 0 && J >= 0 && I < 16 && J < 16 && tc[J * 16 + I] === 1;
  };
  tj.buildings = tj.buildings.filter((b) => {
    if (b.gen !== 'fill') return true;
    let x = 0, z = 0;
    for (let i = 0; i < b.r.length; i += 2) (x += b.r[i]), (z += b.r[i + 1]);
    return !covered(x / (b.r.length / 2) / 10, z / (b.r.length / 2) / 10);
  });
  const [clat, clon] = ck.split(',').map(Number);
  for (const nb of rec.nb) {
    const r: number[] = [];
    let sx = 0, sz = 0;
    for (let i = 0; i + 1 < nb.r.length; i += 2) {
      const [x, z] = projectLocal(origin!, clat + nb.r[i] / 1e6, clon + nb.r[i + 1] / 1e6);
      r.push(Math.round(x * 10), Math.round(z * 10));
      (sx += x), (sz += z);
    }
    const n = nb.r.length / 2;
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) area += (r[2 * j] / 10) * (r[2 * i + 1] / 10) - (r[2 * i] / 10) * (r[2 * j + 1] / 10);
    area = Math.abs(area) / 2;
    const [h] = nb.m;
    const b: Building = {
      r, h: Math.max(2.4, h), roof: 'gable', s: Math.floor(hash2(sx / n, sz / n) * 0x7fffffff),
      k: area < 45 ? 'shed' : h > 20 || area > 2500 ? 'large' : area < 260 ? 'house' : 'commercial',
      gen: 'lidar',
    };
    if (nb.m.length === 4 && nb.m[3] >= 0.35) apply(b, nb.m);
    else if (b.k === 'house' || b.k === 'shed') b.h = Math.max(3, h + 1); // no clean fit (canopy over it): the usual pitched house, ridge a little above the median roof height
    else apply(b, [h, h, 0, 1]); // a flat block at the measured height
    tj.buildings.push(b);
  }
}
const hash2 = (x: number, z: number) => {
  let hh = Math.imul(Math.round(x * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 10) | 0, 0x165667b1);
  hh = Math.imul(hh ^ (hh >>> 15), 0x85ebca6b);
  return ((hh ^ (hh >>> 13)) >>> 0) / 4294967296;
};
function applyTrees(tj: TileJson, ck: string, rec: Rec) {
  if (!rec.t || !rec.tc) return;
  tj.trees = unpackTrees(ck, rec.t);
  tj.treeCov = rec.tc;
}
// (building parts and the outlines they draw are mapped in 3D already — the survey's median
// over a stepped tower would flatten it)
const measurable = (b: Building) => b.own !== 0 && !b.gen && !b.pt && !b.hp && !b.lf && b.k !== 'lighthouse' && b.k !== 'church' && b.roof !== 'tower';

// Stored fit → Building. Flat: flat (a mapped skillion keeps its slope). Rectangles: the
// fitted style. Other outlines ('pitched'): the mapped gable/hip style keeps, with the
// measured eave and ridge; a mapped skillion keeps its shape and takes only the height.
function apply(b: Building, m: number[]) {
  if (m.length < 4 || m[3] < 0.35) return;
  const [h, eav, rs] = m;
  if (h > (b.k === 'house' || b.k === 'shed' ? 40 : 400)) return; // implausible: keep priors
  if (b.hq && b.h >= 20) return; // a mapped tower height beats a roof median (setbacks, spires)
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
// the caller rebuilds when it lands); null waits for it. `fetchOk: false` (lite/LOD builds)
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
  if (rec) applyNew(tj, box, ck, rec), applyTrees(tj, ck, rec);
  const missing = todo.map((b, i) => [b, keys[i]] as const).filter(([, k]) => !rec?.m[k]);
  if (rec?.t && rec.nb && (!missing.length || missing.length <= todo.length * 0.03)) return 'done';
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
  const q: CellReq = {
    ck, box, origin: origin!, cands: cands.map(({ n, y, b }) => ({ n, y, b, r: [] })), ept: index().ept,
    bld: missing.map(([b, k]) => ({ k, r: b.r, prior: b.roof === 'gable' || b.roof === 'hip' || b.roof === 'flat' ? b.roof : undefined, house: b.k === 'house', hm: b.hq ? b.h : undefined })),
    mapped: tj.buildings.filter((b) => b.gen !== 'fill').map((b) => b.r),
    wantNew: !rec?.nb, wantTrees: !rec?.t,
  };
  const job = cellWork(q);
  let res: CellRes | typeof LATE;
  try {
    res = wait == null ? await job : await Promise.race([job, new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), wait))]);
  } catch {
    return rec ? 'done' : 'none'; // network trouble: build from priors, try again another visit
  }
  if (res === LATE) {
    void job.then((r) => merge(ck, r), () => {}); // bank it for the relief rebuild
    return 'late';
  }
  rec = merge(ck, res);
  if (rec.none) return 'none';
  todo.forEach((b, i) => { const m = rec!.m[keys[i]]; if (m) apply(b, m); });
  applyNew(tj, box, ck, rec);
  applyTrees(tj, ck, rec);
  if (res.fits.length || res.nb || res.t) {
    const ok = Object.values(rec.m).filter((m) => m.length === 4 && m[3] >= 0.35).length;
    log(`lidar ${ck}: ${ok}/${Object.keys(rec.m).length} buildings measured, ${rec.nb?.length ?? 0} unmapped found, ${(rec.t?.length ?? 0) / 4} trees (${res.canopy ?? '?'} canopy) from ${rec.src}`);
  }
  return 'done';
}

// Fold a worker result into the cell record (and persist it).
function merge(ck: string, r: CellRes): Rec {
  const rec = recMem.get(ck) ?? { m: {} };
  if (r.none) {
    if (!Object.keys(rec.m).length && !rec.nb) rec.none = 1;
  } else {
    if (r.src) (rec.src = r.src), (rec.yr = r.year);
    for (const [k, m] of r.fits) rec.m[k] ??= m;
    if (r.nb && !rec.nb) rec.nb = r.nb;
    if (r.t && !rec.t) rec.t = r.t;
    if (r.tc) rec.tc ??= r.tc;
  }
  recMem.set(ck, rec);
  void kvPut(VER + ck, rec);
  return rec;
}
