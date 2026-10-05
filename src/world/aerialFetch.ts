// Real roof colours for streamed cells in the lower 48: the USDA NAIP orthophoto under each cell,
// read in the tile worker (the pure half — registration, sampling, the cast — is aerial.ts).
//
// Per real cell, before the builders run (after the LiDAR, so the survey's new buildings count):
//   1. is the cell inside NAIP's country? (the bundled 3DEP index answers "is this the US" for
//      free; the photo's own no-data answers the rest — Canada, the sea)
//   2. one exportImage from the USGS National Map's NAIP ImageServer — public domain, keyless —
//      the cell plus its 48 m margin in EPSG:4326 (so pixels map to the game's equirectangular
//      frame by an affine map), ~0.9 m a pixel, JPEG. Straight from the browser when the server
//      allows it (ArcGIS Server's CORS default), else through the tile service's /naip route
//   3. aerial.ts readCell: the cast from the cell's streets, footprints registered, each roof's
//      sunlit middle → Building.ar; cached per cell in IndexedDB (a few KB), so a revisit never
//      fetches the photo again
// Graceful by construction: no coverage, offline, a server that says no → today's palette roofs.
import type { Box, Building, TileJson } from './data';
import INDEX from './lidar-index.json';
import { kvGet, kvPut } from './cache';
import { boxLatLon, candidates, unprojectLocal, type LidarIndex } from './lidarCore';
import { makeProjector } from './realTile';
import { readCell, seeable, type Aerial } from './aerial';

type LatLon = { lat: number; lon: number };
// Cache key version: bump when sampling, registration or the cast fit changes (aerial.ts), or the
// request below does.
const VER = 'aerial|v1|';
export const NAIP_SERVICE = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
const PAD = 48; // the tile margin: context buildings sit on the photo too
const RES = 0.9; // metres a pixel north–south (NAIP is 0.6 m; a house is still ~150 pixels)

let on = false;
let origin: LatLon | null = null;
let proxy = ''; // the tile service, whose /naip route relays the same request with CORS headers
let direct: boolean | null = null; // does USGS answer this browser itself (CORS)? null: not asked yet
export function initAerial(o: LatLon, tilesBase?: string) {
  on = true;
  origin = o;
  proxy = tilesBase && /^https?:/.test(tilesBase) ? tilesBase.replace(/\/$/, '') : '';
  direct = null; // (whether this browser may read USGS directly: found out on the first photo)
}
export const aerialOn = () => on && !!origin;
let log: (msg: string) => void = (m) => console.info(m);
export function setAerialLog(fn: (msg: string) => void) { log = fn; }

/** The exportImage query for a cell, and where its pixels sit in the local frame. The image's
 *  aspect matches the bbox's in degrees, so the server returns exactly the bbox (it would widen
 *  one side to keep its pixels square in the output SR). */
export function naipRequest(o: LatLon, box: Box): { query: string; frame: Omit<Aerial, 'px' | 'ch'> } {
  const P = makeProjector(o);
  const pb = { x0: box.x0 - PAD, z0: box.z0 - PAD, x1: box.x1 + PAD, z1: box.z1 + PAD };
  const bb = P.localToBbox(pb);
  const H = Math.round((pb.z1 - pb.z0) / RES);
  const W = Math.round((H * (bb.e - bb.w)) / (bb.n - bb.s));
  const f = (v: number) => v.toFixed(7);
  const query = `bbox=${f(bb.w)},${f(bb.s)},${f(bb.e)},${f(bb.n)}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&compressionQuality=85&interpolation=RSP_BilinearInterpolation&f=image`;
  return { query, frame: { w: W, h: H, x0: pb.x0, z0: pb.z0, dx: (pb.x1 - pb.x0) / W, dz: (pb.z1 - pb.z0) / H } };
}

/** NAIP flies the lower 48; the 3DEP index says whether a cell is in the country at all. */
function covered(o: LatLon, box: Box) {
  const bb = boxLatLon(o, box);
  if (bb.n < 24.3 || bb.s > 49.5 || bb.e < -125 || bb.w > -66.8) return false;
  return candidates(INDEX as unknown as LidarIndex, bb).length > 0;
}

// ---------- IO (swappable: the tests hand in a photo) ----------
export interface Photo { w: number; h: number; px: Uint8Array | Uint8ClampedArray }
export interface AerialIO { image(url: string): Promise<Photo | null> }
async function browserImage(url: string): Promise<Photo | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`naip ${r.status}`);
  // (ArcGIS answers a bad request with a 200 and a JSON error)
  if (!/^image\//.test(r.headers.get('content-type') ?? '')) throw new Error(`naip answered ${r.headers.get('content-type')}`);
  const blob = await r.blob();
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  // the photo's own bytes, unmanaged — the same numbers on every screen
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const w = bmp.width, h = bmp.height;
  const g = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!g) return (bmp.close(), null);
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return { w, h, px: g.getImageData(0, 0, w, h).data };
}
let io: AerialIO = { image: browserImage };
export function setAerialIO(x: AerialIO | null) { io = x ?? { image: browserImage }; }

// Straight from the server while that works; once a browser refuses it (no CORS header), the
// tile service's relay for the rest of the session. (`direct` is declared with the session state.)
async function photo(query: string): Promise<Photo | null> {
  if (direct !== false) {
    try {
      const p = await io.image(`${NAIP_SERVICE}?${query}`);
      direct = true;
      return p;
    } catch (e) {
      if (direct === true || !proxy) throw e; // (it worked before: this is the server, not CORS)
      if (direct === null) log(`[aerial] direct NAIP read refused (${(e as Error)?.message ?? e}) — using the tile service's relay`);
      direct = false; // (the cells that asked at the same time fall through here too: one note)
    }
  }
  if (!proxy) return null;
  return io.image(`${proxy}/naip?${query}`);
}

// One photo per cell in flight; the last one kept decoded for a relief rebuild's new buildings.
const inflight = new Map<string, Promise<Aerial | null>>();
const kept: { ck: string; img: Aerial }[] = [];
function cellPhoto(ck: string, box: Box): Promise<Aerial | null> {
  const k = kept.find((e) => e.ck === ck);
  if (k) return Promise.resolve(k.img);
  let p = inflight.get(ck);
  if (!p) {
    const { query, frame } = naipRequest(origin!, box);
    p = photo(query).then((ph) => {
      if (!ph) return null;
      // (a server that answered another size: its pixels still span the bbox)
      const img: Aerial = { ...frame, w: ph.w, h: ph.h, dx: (frame.dx * frame.w) / ph.w, dz: (frame.dz * frame.h) / ph.h, px: ph.px, ch: 4 };
      if (ph.px.length === ph.w * ph.h * 3) img.ch = 3;
      kept.push({ ck, img });
      while (kept.length > 1) kept.shift(); // (a decoded cell is ~8 MB)
      return img;
    });
    inflight.set(ck, p);
    void p.finally(() => inflight.delete(ck)).catch(() => {});
  }
  return p;
}

// ---------- per-cell record ----------
interface Rec { none?: 1; by?: string; m: Record<string, number> } // m: building key → 0xRRGGBB, or −1 (looked: no roof to see)
const recMem = new Map<string, Rec>();
const cellKeyOf = (box: Box) => {
  const [lat, lon] = unprojectLocal(origin!, (box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2);
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
};
function bKey(b: Building) {
  let x = 0, z = 0;
  const n = b.r.length / 2;
  for (let i = 0; i < b.r.length; i += 2) (x += b.r[i]), (z += b.r[i + 1]);
  const [lat, lon] = unprojectLocal(origin!, x / n / 10, z / n / 10);
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}
const visible = seeable; // (what the photo can read: aerial.ts)

function persist(ck: string, rec: Rec) {
  recMem.set(ck, rec);
  void kvPut(VER + ck, rec);
}
function apply(todo: Building[], keys: string[], rec: Rec) {
  todo.forEach((b, i) => {
    const v = rec.m[keys[i]];
    if (v != null && v >= 0 && b.rc == null) b.ar = v; // (a mapped roof:colour still wins)
  });
}
function read(ck: string, tj: TileJson, img: Aerial, rec: Rec | undefined): Rec {
  const out = readCell(img, tj);
  if (out.nodata) return { none: 1, m: {} };
  const r: Rec = rec && !rec.none ? { ...rec, m: { ...rec.m } } : { m: {} };
  r.by = out.by;
  tj.buildings.forEach((b, i) => { if (visible(b)) r.m[bKey(b)] = out.roofs.get(i) ?? -1; });
  const seen = [...out.roofs.keys()].length;
  log(`[aerial ${ck}] ${seen} roofs read off NAIP (cast from the ${out.by}, shift ${out.shift.join(',')} px)`);
  return r;
}

/** Start a real cell's photo while its map data is still on the way (the photo only needs the
 *  cell's box) — unless this browser already read the cell. */
export function prefetchAerial(box: Box) {
  if (!aerialOn() || !covered(origin!, box)) return;
  const ck = cellKeyOf(box);
  if (recMem.has(ck) || inflight.has(ck)) return;
  void kvGet<Rec>(VER + ck).then((r) => {
    if (r) recMem.set(ck, recMem.get(ck) ?? r);
    else void cellPhoto(ck, box).catch(() => {});
  });
}

export type AerialResult = 'done' | 'late' | 'none';
const LATE = Symbol('late');

/** Real roof colours onto a real cell's buildings (`ar`). `wait`: ms to wait for a first-time
 *  photo before building with palette roofs (→ 'late': the caller rebuilds when it lands); null
 *  waits for it. `fetchOk: false` (coarse silhouettes) only applies what's cached. */
export async function enrichAerial(tj: TileJson, box: Box, wait: number | null, fetchOk = true): Promise<AerialResult> {
  if (!aerialOn()) return 'none';
  const ck = cellKeyOf(box);
  let rec = recMem.get(ck);
  if (!rec) {
    const stored = await kvGet<Rec>(VER + ck);
    rec = recMem.get(ck) ?? stored;
    if (rec) recMem.set(ck, rec);
  }
  if (rec?.none) return 'none';
  const todo = tj.buildings.filter(visible), keys = todo.map(bKey);
  if (rec) apply(todo, keys, rec);
  const missing = keys.filter((k) => rec?.m[k] === undefined).length;
  if (rec && missing <= Math.max(2, todo.length * 0.03)) return 'done';
  if (!fetchOk) return rec ? 'done' : 'none';
  if (!todo.length) return 'none';
  if (!covered(origin!, box)) {
    persist(ck, { none: 1, m: {} });
    return 'none';
  }
  const job = cellPhoto(ck, box);
  let img: Aerial | null | typeof LATE;
  try {
    img = wait == null ? await job : await Promise.race([job, new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), wait))]);
  } catch (e) {
    log(`[aerial ${ck}] no photo: ${(e as Error)?.message ?? e}`);
    return rec ? 'done' : 'none'; // network trouble: palette roofs, try again another visit
  }
  if (img === LATE) {
    // bank it for the relief rebuild (read against this build's buildings)
    void job.then((im) => { if (im) persist(ck, read(ck, tj, im, recMem.get(ck))); }, () => {});
    return 'late';
  }
  if (!img) return rec ? 'done' : 'none'; // (a browser that can't decode in a worker)
  rec = read(ck, tj, img, recMem.get(ck));
  persist(ck, rec);
  if (rec.none) return 'none';
  apply(todo, keys, rec);
  return 'done';
}
