// Worker-side tile build: fetch + decode + mesh + collision for one tile, packed for transfer.
// Runs the same buildTile pipeline as the main-thread fallback — same output, off the main thread.
import { Terrain, TerrainLayer, type LayerLayout, type TileJson, type TileSpec } from './data';
import { cachedFetch, cachedFetchJson, initCache, kvGet, kvPut, FetchError } from './cache';
import { osmToTile, overpassQuery, makeProjector, type OsmDoc } from './realTile';
import { buildTile } from './tileBuild';
import { packGroup, type BuiltTile } from './pack';
import { synthTile, realExtras, waterSheets } from './synth';
import { fetchDem, demLayer, setDemBase, raceNull, waterPatch, waterLevel, type WaterBody } from './dem';
import { readMvt, ringArea } from './mvt';
import { vectorToOsm, clipPoly } from './vectorTile';
import { gradeRoads } from './grade';
import { retainingWalls, retainingColliders } from './retaining';
import { findPortals, portalMeshes } from './portals';
import { shoreGroup } from './shore';
import type { SynthResult } from './synth';
import { setActiveStyle, styleByKey } from './styles';
import { enrichTile, initLidar, lidarOn, setLidarLog, setLidarPort } from './lidar';

// First visit to a cell: how long a detail build waits for its LiDAR measurement before
// building from mapped priors (the measured rebuild then swaps in when it lands).
const LIDAR_WAIT = 3500;

interface TileWorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}
const ctx = self as unknown as TileWorkerScope;

let base = '';
let cell = 1024;
let seed = 0;
let terrain: Terrain | null = null;
let binInit: ArrayBuffer | null = null; // virtual-region terrain bytes (no terrain.bin exists)
let binPromise: Promise<ArrayBuffer> | null = null;
let origin: { lat: number; lon: number } | null = null;
let demOn = false; // H2: fetch Terrarium patches for virtual-region cells
let bakedCells: string[] = []; // manifest cell ids — never overridden by a neighbour's DEM overhang
const demCache = new Map<string, Promise<{ buf: ArrayBuffer; layout: LayerLayout } | null>>();
const realPatched = new Set<string>(); // cells whose real tile registered its ground in this worker
const realDem = new Map<string, { buf: ArrayBuffer; layout: LayerLayout }>(); // …and that ground

// ---- real-lite, direct: this browser → Overpass → the same osmToTile the tile service runs ----
// Used when `?tiles=direct` (no service at all) and as the fallback when the service is down or
// stalls — the player gets the real town either way, never a placeholder for want of a proxy.
// Results are cached per cell in IndexedDB (kvPut), so a revisit never re-queries Overpass.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const DIRECT_V = 22; // keep with the tile service's t/vN (realTile output version)
// Overpass rate-limits per IP and per server: one query at a time on each mirror, so the three
// mirrors carry three cells at once. A mirror that answers 429/504 cools down for its
// retry-after; a query that fails on one mirror moves on to the next free one.
const epBusy = new Set<string>(), epCool = new Map<string, number>();
const epWait: (() => void)[] = [];
async function takeEndpoint(): Promise<string> {
  for (;;) {
    const now = Date.now();
    // the main server grants each IP several slots (its /status says 4): use two there
    const free = [OVERPASS[0] + '#1', ...OVERPASS].find((e) => !epBusy.has(e) && now >= (epCool.get(e.split('#')[0]) ?? 0));
    if (free) { epBusy.add(free); return free; }
    await Promise.race([new Promise<void>((r) => epWait.push(r)), new Promise((r) => setTimeout(r, 1500))]);
  }
}
function releaseEndpoint(ep: string) {
  epBusy.delete(ep);
  epWait.shift()?.();
}
/** One Overpass query through the mirror slots: its JSON, or throw once `tries` attempts failed. */
async function overpass(body: string, tries = 6): Promise<OsmDoc> {
  let last = 'no endpoint';
  for (let attempt = 0; attempt < tries; attempt++) {
    const slot = await takeEndpoint(), ep = slot.split('#')[0];
    try {
      const r = await fetch(ep, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) {
        last = `${ep} ${r.status}`;
        if (r.status === 429 || r.status === 504) epCool.set(ep, Date.now() + Math.min(20, +(r.headers.get('retry-after') ?? 5) || 5) * 1000);
        continue;
      }
      const j = (await r.json()) as OsmDoc & { remark?: string };
      if (typeof j.remark === 'string' && /runtime error|timed out|out of memory|runtime limit/i.test(j.remark)) { last = j.remark; continue; }
      return j;
    } catch (e) {
      last = `${ep} ${(e as Error)?.message ?? e}`;
      epCool.set(ep, Date.now() + 5000);
    } finally {
      releaseEndpoint(slot);
    }
  }
  throw new FetchError('overpass unavailable: ' + last); // (the data's failure, not the worker's: the stream retries the cell)
}
const q = (bb: { s: number; w: number; n: number; e: number }) => 'data=' + encodeURIComponent(overpassQuery(bb));
async function directTile(spec: TileSpec): Promise<TileJson> {
  if (!origin) throw new Error('direct tiles need an origin');
  const [cx, cz] = spec.id.slice(1).split('_').map(Number);
  const key = `osm${DIRECT_V}|${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${cx}_${cz}`;
  const hit = await kvGet<TileJson>(key);
  if (hit) return hit;
  const say = (msg: string) => ctx.postMessage({ kind: 'log', msg: `[direct ${cx}_${cz}] ${msg}` });
  const M = 48, P = makeProjector(origin);
  const full = { x0: spec.box.x0 - M, z0: spec.box.z0 - M, x1: spec.box.x1 + M, z1: spec.box.z1 + M };
  let osm: OsmDoc;
  try {
    osm = await overpass(q(P.localToBbox(full)), 3);
  } catch (e) {
    // A dense downtown cell can outrun the server's time limit (504): ask for it in quarters and
    // merge — whole ways come back from each quarter they touch, so the union is the same answer.
    say(`${(e as Error).message} — asking in quarters`);
    const mx = (full.x0 + full.x1) / 2, mz = (full.z0 + full.z1) / 2;
    const parts = await Promise.all([[full.x0, full.z0, mx, mz], [mx, full.z0, full.x1, mz], [full.x0, mz, mx, full.z1], [mx, mz, full.x1, full.z1]]
      .map(([x0, z0, x1, z1]) => overpass(q(P.localToBbox({ x0, z0, x1, z1 })), 4)));
    const seen = new Set<string>(), elements: NonNullable<OsmDoc['elements']> = [];
    for (const d of parts) for (const el of d.elements ?? []) { const k = el.type + el.id; if (!seen.has(k)) (seen.add(k), elements.push(el)); }
    osm = { elements };
  }
  const tj = osmToTile(osm, { id: `${cx}_${cz}`, box: spec.box, origin });
  say(`ok b${tj.buildings.length} r${tj.roads.length} l${tj.lines.length}`);
  void kvPut(key, tj);
  return tj;
}

// ---- water from the map, for the placeholder while a real cell is on its way (or 504'd) ----
// A light query (coastline, lakes, riverbanks) — the one thing a stand-in must not guess from
// the DEM, which smears a shore into the sea (Elliott Bay became a lawn with trees). Cached per
// cell like the tiles; asked only where the DEM says the cell could hold water.
const waterInflight = new Map<string, Promise<TileJson | null>>();
function waterTile(spec: TileSpec): Promise<TileJson | null> {
  const k = spec.id.slice(1);
  let p = waterInflight.get(k);
  if (!p) {
    p = waterTileNow(spec);
    waterInflight.set(k, p);
    void p.then((r) => { if (!r) waterInflight.delete(k); }); // (a failure may be retried)
  }
  return p;
}
async function waterTileNow(spec: TileSpec): Promise<TileJson | null> {
  if (!origin) return null;
  const [cx, cz] = spec.id.slice(1).split('_').map(Number);
  const key = `wat${DIRECT_V}|${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${cx}_${cz}`;
  const hit = await kvGet<TileJson>(key);
  if (hit) return hit;
  const M = 48, bb = makeProjector(origin).localToBbox({ x0: spec.box.x0 - M, z0: spec.box.z0 - M, x1: spec.box.x1 + M, z1: spec.box.z1 + M });
  const body = 'data=' + encodeURIComponent(`[out:json][timeout:15][bbox:${bb.s.toFixed(7)},${bb.w.toFixed(7)},${bb.n.toFixed(7)},${bb.e.toFixed(7)}];(way["natural"="coastline"];way["natural"="water"];relation["natural"="water"];way["waterway"="riverbank"];relation["waterway"="riverbank"];);out geom qt;`);
  // its own lane (two at a time, the mirrors in turn): a light query mustn't queue behind the
  // heavy cells that hold the shared slots for tens of seconds
  while (waterBusy >= 2) await new Promise<void>((r) => waterWait.push(r));
  waterBusy++;
  try {
    let osm: OsmDoc | null = null;
    for (const ep of OVERPASS) {
      try {
        const r = await fetch(ep, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const j = (await r.json()) as OsmDoc & { remark?: string };
        if (typeof j.remark === 'string' && /runtime error|timed out|out of memory|runtime limit/i.test(j.remark)) continue;
        osm = j;
        break;
      } catch { /* the next mirror */ }
    }
    if (!osm) return null;
    const tj = osmToTile(osm, { id: `${cx}_${cz}`, box: spec.box, origin });
    const slim: TileJson = { ...tj, buildings: [], roads: [], lines: [], points: [], landmarks: [], areas: tj.areas.filter((a) => a.c === 'water') };
    void kvPut(key, slim);
    return slim;
  } catch {
    return null;
  } finally {
    waterBusy--;
    waterWait.shift()?.();
  }
}
let waterBusy = 0;
const waterWait: (() => void)[] = [];
/** Could this cell hold water? Low ground, or a dead-flat stretch (a DEM flattens lakes). */
function mayBeWet(dem: { buf: ArrayBuffer; layout: LayerLayout }) {
  const L = dem.layout, n = L.grid.w * L.grid.h, h = new Float32Array(dem.buf, L.height.offset, n);
  let lo = Infinity;
  for (let i = 0; i < n; i++) lo = Math.min(lo, h[i]);
  if (lo <= 3000) return true; // (cm) anything under 30 m
  let flat = 0;
  for (let i = 0; i < n; i++) if (h[i] - lo < 10) flat++;
  return flat > n * 0.08;
}
/** A tile's water as bodies (dem.ts): the sea from its coast, each lake, pond and river at the
 *  level the DEM gives its water, its islands left standing — only those that reach this grid. */
function waterBodies(dem: { buf: ArrayBuffer; layout: LayerLayout }, tj: TileJson, t: Terrain): WaterBody[] {
  const g = dem.layout.grid, X1 = g.x0 + g.w * g.cell, Z1 = g.z0 + g.h * g.cell;
  const unpack = (f: number[]) => { const o: [number, number][] = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
  const out: WaterBody[] = [];
  for (const a of tj.areas) {
    if (a.c !== 'water') continue;
    const holes = a.i.map(unpack).filter((r) => r.length >= 3);
    for (const f of a.o) {
      const ring = unpack(f);
      if (ring.length < 3) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of ring) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
      if (x1 < g.x0 || x0 > X1 || z1 < g.z0 || z0 > Z1) continue;
      const w: WaterBody = { ring, holes };
      if (a.k !== 'sea') w.level = waterLevel(dem, w, (x, z) => t.heightAt(x, z));
      out.push(w);
    }
  }
  return out;
}

// ---- water from OpenFreeMap's vector tiles: the stand-in's first source ----
// OpenFreeMap serves the OpenMapTiles planet (OSM's lakes, ponds and rivers, and the sea from the
// coastline's water polygons) from a CDN: a fifth of a second a tile, no key, no rate limit —
// where Overpass took 25 s and more for a four-line water query on a busy afternoon, and 504'd
// the very cell whose stand-in needed it. Overpass (waterTile) is the fallback. © OpenMapTiles,
// © OpenStreetMap contributors (the HUD credit).
const OFM = 'https://tiles.openfreemap.org/planet';
// (a CDN that stops answering is left alone for a minute — every stand-in otherwise waits out
// its own timeouts in turn)
let ofmTpl: Promise<string | null> | null = null, ofmDownUntil = 0, ofmStrikes = 0;
const ofmDown = () => Date.now() < ofmDownUntil;
const ofmFailed = () => { ofmDownUntil = Date.now() + 60000; };
function ofmTemplate(): Promise<string | null> {
  if (ofmDown()) return Promise.resolve(null);
  return (ofmTpl ??= fetch(OFM, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ tiles?: string[] }>) : null))
    .then((j) => j?.tiles?.[0] ?? null, () => null)
    .then((t) => { if (!t) (ofmTpl = null), ofmFailed(); return t; }));
}
/** A vector tile's bytes, shared by the water and the vector twin (the last 48 kept). */
const ofmRawTiles = new Map<string, Promise<ArrayBuffer | null>>();
function ofmRaw(tpl: string, z: number, tx: number, ty: number): Promise<ArrayBuffer | null> {
  const k = `${z}/${tx}/${ty}`;
  let p = ofmRawTiles.get(k);
  if (p) return p;
  if (ofmDown()) return Promise.resolve(null);
  // (an absent tile — 404/204 — is an empty one; three failures in a row trip the breaker)
  const q: Promise<ArrayBuffer | null> = fetch(tpl.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty)), { signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.arrayBuffer() : r.status === 404 || r.status === 204 ? new ArrayBuffer(0) : null))
    .catch(() => null);
  p = q;
  ofmRawTiles.set(k, q);
  void q.then((v) => {
    if (v) { ofmStrikes = 0; return; }
    if (ofmRawTiles.get(k) === q) ofmRawTiles.delete(k);
    if (++ofmStrikes >= 3) (ofmStrikes = 0), ofmFailed();
  });
  while (ofmRawTiles.size > 48) ofmRawTiles.delete(ofmRawTiles.keys().next().value!);
  return p;
}
/** The tiles (zoom z) covering a local box. */
function ofmTilesFor(box: TileSpec['box'], z = 14) {
  const bb = makeProjector(origin!).localToBbox(box), Z = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * Z);
  const ty = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Z); };
  const out: [number, number][] = [];
  for (let x = tx(bb.w); x <= tx(bb.e); x++) for (let y = ty(bb.n); y <= ty(bb.s); y++) out.push([x, y]);
  return { tiles: out, bb };
}
const inRing = (x: number, y: number, r: [number, number][]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
/** One vector tile's water: polygons in local metres (outer ring, then its holes), each clipped
 *  to the tile's own square — a lake over a tile edge is two pieces that meet, never two copies
 *  overlapping in the tiles' shared margin. The last 64 tiles kept. */
type WaterPoly = { sea: boolean; rings: [number, number][][] };
const mvtTiles = new Map<string, Promise<WaterPoly[] | null>>();
function mvtWaterTile(tpl: string, z: number, tx: number, ty: number): Promise<WaterPoly[] | null> {
  const k = `${z}/${tx}/${ty}`;
  let p = mvtTiles.get(k);
  if (p) return p;
  const q: Promise<WaterPoly[] | null> = (async () => {
    const raw = await ofmRaw(tpl, z, tx, ty);
    if (!raw) return null;
    const P = makeProjector(origin!), Z = 2 ** z, out: WaterPoly[] = [];
    for (const L of readMvt(raw, (n) => n === 'water')) {
      const E = L.extent;
      const local = ([gx, gy]: [number, number]): [number, number] => {
        const X = (tx + gx / E) / Z, Y = (ty + gy / E) / Z;
        return P.project((Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180) / Math.PI, X * 360 - 180);
      };
      for (const f of L.features) {
        const cls = String(f.tags.class ?? '');
        // (a pool is a building's; a seasonal pond is dry most of the year; a culvert is underground)
        if (f.type !== 3 || cls === 'swimming_pool' || +(f.tags.intermittent ?? 0) === 1 || f.tags.brunnel === 'tunnel') continue;
        const polys: { o: [number, number][]; h: [number, number][][] }[] = [];
        for (const ring of f.rings) {
          const a = ringArea(ring);
          if (a > 0) polys.push({ o: ring, h: [] });
          else if (a < 0 && polys.length) polys[polys.length - 1].h.push(ring);
        }
        for (const pl of polys) {
          // (its islands clipped to the same square: each piece of an island goes with the piece of
          // water round it — the point tests and the lake sheets' triangulation both hold)
          const holes = pl.h.flatMap((h) => clipPoly(h, 0, 0, E, E));
          for (const o of clipPoly(pl.o, 0, 0, E, E)) {
            const mine = holes.filter((h) => { let x = 0, y = 0; for (const [a, b] of h) (x += a), (y += b); return inRing(x / h.length, y / h.length, o); });
            out.push({ sea: cls === 'ocean', rings: [o.map(local), ...mine.map((h) => h.map(local))] });
          }
        }
      }
    }
    return out;
  })().catch(() => null);
  p = q;
  mvtTiles.set(k, q);
  void q.then((v) => { if (!v && mvtTiles.get(k) === q) mvtTiles.delete(k); }); // (a failure may be retried)
  while (mvtTiles.size > 64) mvtTiles.delete(mvtTiles.keys().next().value!);
  return p;
}
/** A cell's water from the vector tiles covering it, as a slim tile (areas only) — or null when
 *  the CDN can't be reached. Cached per cell like the others. A distant (lite) cell reads z12:
 *  four tiles for the whole ring, not seventy. */
async function mvtWater(spec: TileSpec, lite = false): Promise<TileJson | null> {
  if (!origin) return null;
  const [cx, cz] = spec.id.slice(1).split('_').map(Number), z = lite ? 12 : 14;
  const key = `mvw3.${z}|${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${cx}_${cz}`;
  const hit = await kvGet<TileJson>(key);
  if (hit) return hit;
  const tpl = await ofmTemplate();
  if (!tpl) return null;
  const M = 48, box = { x0: spec.box.x0 - M, z0: spec.box.z0 - M, x1: spec.box.x1 + M, z1: spec.box.z1 + M };
  const cover = ofmTilesFor(box, z).tiles;
  // (a tile the CDN has no bytes for is an unknown, not dry land: no answer, and nothing cached)
  const raws = await Promise.all(cover.map(([x, y]) => ofmRaw(tpl, z, x, y)));
  if (raws.some((r) => !r || !r.byteLength)) return null;
  const tiles = await Promise.all(cover.map(([x, y]) => mvtWaterTile(tpl, z, x, y)));
  if (tiles.some((t) => !t)) return null;
  const ints = (r: [number, number][]) => r.flatMap(([x, zz]) => [Math.round(x * 10), Math.round(zz * 10)]);
  const areas: TileJson['areas'] = [];
  for (const t of tiles)
    for (const w of t!) {
      const [o, ...holes] = w.rings;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, zz] of o) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, zz)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, zz));
      if (x1 < box.x0 || x0 > box.x1 || z1 < box.z0 || z0 > box.z1) continue; // (the tile's, not this cell's)
      areas.push({ c: 'water', o: [ints(o)], i: holes.map(ints), ...(w.sea ? { k: 'sea' } : {}) });
    }
  const slim: TileJson = { version: 1, id: `${cx}_${cz}`, lod: 0, box: spec.box, slice: box, backdrop: box, origin, buildings: [], roads: [], areas, lines: [], points: [], landmarks: [] };
  void kvPut(key, slim);
  return slim;
}

// ---- the vector twin: a stand-in built from the vector tiles' streets and buildings ----
// (vectorTile.ts) — real in a second whatever Overpass is doing; the full OSM tile replaces it.
const VEC_V = 3; // the translation's version (with DIRECT_V, osmToTile's, in the cache key)
let vecOn = true;
async function vectorCell(spec: TileSpec): Promise<TileJson | null> {
  if (!origin || !vecOn) return null;
  const [cx, cz] = spec.id.slice(1).split('_').map(Number);
  const key = `vec${VEC_V}.${DIRECT_V}|${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${cx}_${cz}`;
  const hit = await kvGet<TileJson>(key);
  if (hit) return hit;
  const tpl = await ofmTemplate();
  if (!tpl) return null;
  const M = 48, box = { x0: spec.box.x0 - M, z0: spec.box.z0 - M, x1: spec.box.x1 + M, z1: spec.box.z1 + M };
  const { tiles, bb } = ofmTilesFor(box);
  const raw = await Promise.all(tiles.map(([x, y]) => ofmRaw(tpl, 14, x, y)));
  if (raw.some((r) => !r)) return null;
  // the cell and its margin in global tile units (4096 a tile at z14)
  const N = 4096 * 2 ** 14, gx = (lon: number) => ((lon + 180) / 360) * N;
  const gy = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N; };
  const doc = vectorToOsm(tiles.map(([x, y], i) => ({ x, y, z: 14, data: raw[i]! })), { x0: gx(bb.w), y0: gy(bb.n), x1: gx(bb.e), y1: gy(bb.s) });
  const tj = osmToTile(doc, { id: `${cx}_${cz}`, box: spec.box, origin });
  tj.attribution = 'Map data © OpenStreetMap contributors, ODbL; vector tiles © OpenMapTiles, OpenFreeMap';
  ctx.postMessage({ kind: 'log', msg: `[vector ${cx}_${cz}] b${tj.buildings.length} r${tj.roads.length} a${tj.areas.length} from ${tiles.length} tiles` });
  void kvPut(key, tj);
  return tj;
}

// The tile service, raced against a stall: after 25 s (or any failure) go direct.
// ?fail=cx_cz,… (a test hook): those real cells answer as a 504 would, so their stand-ins stay
const failCells = new Set<string>();
function worldTile(spec: TileSpec): Promise<TileJson> {
  if (failCells.has(spec.id.slice(1))) return Promise.reject(new FetchError('overpass unavailable: forced (?fail)'));
  if (spec.file.startsWith('direct:')) return directTile(spec);
  let timer = 0;
  const stall = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('tile service stalled')), 25000) as unknown as number; });
  return Promise.race([cachedFetchJson(spec.file) as Promise<TileJson>, stall])
    .catch(() => directTile(spec))
    .finally(() => clearTimeout(timer));
}

const loadBin = () => (binPromise ??= binInit ? Promise.resolve(binInit) : cachedFetch(base + 'terrain.bin'));

// DEM results are cached per cell for the session — but only successes: a null (fetch
// failure, worker hiccup) is forgotten once settled so the next build of that cell (the
// w-twin, or the main thread's relief rebuild) retries instead of inheriting it forever.
function demFor(cellKey: string, box: TileSpec['box'], pitch = 16) {
  const ck = pitch === 16 ? cellKey : `${cellKey}@${pitch}`;
  let p = demCache.get(ck);
  if (!p) {
    p = fetchDem(box, origin!, pitch).then((d) => (d ? demLayer(d) : null));
    demCache.set(ck, p);
    void p.then((d) => { if (!d && demCache.get(ck) === p) demCache.delete(ck); });
  }
  return p;
}
/** A real cell's streets graded into its ground (grade.ts) — a copy of the layer — and, for a
 *  detail build, the retaining walls its cuts need (not where a building stands). */
function gradedDem(dem: { buf: ArrayBuffer; layout: LayerLayout }, tj: TileJson, say: (m: string) => void, walls: boolean) {
  const L = dem.layout, g = L.grid, n = g.w * g.h;
  const buf = dem.buf.slice(0), hc = new Float32Array(buf, L.height.offset, n), heights = new Float32Array(n);
  for (let i = 0; i < n; i++) heights[i] = hc[i] / 100;
  const rep = gradeRoads({ x0: g.x0, z0: g.z0, pitch: g.cell, nx: g.w, nz: g.h, heights }, tj.roads, (r) => r.ic ?? null, { walls, blocked: walls ? footprintTest(tj) : undefined });
  for (let i = 0; i < n; i++) hc[i] = heights[i] * 100;
  if (rep.ways) say(`graded ${rep.ways} streets (${rep.nodes} ground nodes, up to ${rep.maxShift.toFixed(1)} m of cut or fill, ${rep.walls.length / 8} wall panels)`);
  return { dem: { buf, layout: L }, walls: rep.walls };
}
/** Is (x, z) in or within a metre of one of the tile's building footprints (or by a mapped wall)? */
function footprintTest(tj: TileJson) {
  const B = new Map<string, { r: [number, number][]; bb: number[] }[]>();
  for (const b of tj.buildings) {
    const r: [number, number][] = [];
    for (let i = 0; i + 1 < b.r.length; i += 2) r.push([b.r[i] / 10, b.r[i + 1] / 10]);
    if (r.length < 3) continue;
    const bb = r.reduce((q, [x, z]) => [Math.min(q[0], x), Math.min(q[1], z), Math.max(q[2], x), Math.max(q[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
    for (let u = Math.floor((bb[0] - 1) / 32); u <= Math.floor((bb[2] + 1) / 32); u++)
      for (let v = Math.floor((bb[1] - 1) / 32); v <= Math.floor((bb[3] + 1) / 32); v++)
        (B.get(u + ',' + v) ?? B.set(u + ',' + v, []).get(u + ',' + v)!).push({ r, bb });
  }
  const pip = (x: number, z: number, r: [number, number][]) => {
    let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
    return ins;
  };
  // …or a wall the map already stands there (`barrier=wall/retaining_wall`, a seawall): the
  // grade's own panel would double it
  const W = new Map<string, number[][]>();
  for (const l of tj.lines) {
    if (l.c !== 'wall' && l.c !== 'seawall') continue;
    for (let i = 0; i + 3 < l.p.length; i += 2) {
      const sg = [l.p[i] / 10, l.p[i + 1] / 10, l.p[i + 2] / 10, l.p[i + 3] / 10];
      for (let u = Math.floor((Math.min(sg[0], sg[2]) - 2) / 32); u <= Math.floor((Math.max(sg[0], sg[2]) + 2) / 32); u++)
        for (let v = Math.floor((Math.min(sg[1], sg[3]) - 2) / 32); v <= Math.floor((Math.max(sg[1], sg[3]) + 2) / 32); v++)
          (W.get(u + ',' + v) ?? W.set(u + ',' + v, []).get(u + ',' + v)!).push(sg);
    }
  }
  const nearWall = (x: number, z: number) => {
    for (const [ax, az, bx, bz] of W.get(Math.floor(x / 32) + ',' + Math.floor(z / 32)) ?? []) {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < 1.5) return true;
    }
    return false;
  };
  return (x: number, z: number) => {
    for (const f of B.get(Math.floor(x / 32) + ',' + Math.floor(z / 32)) ?? []) {
      if (x < f.bb[0] - 1 || x > f.bb[2] + 1 || z < f.bb[1] - 1 || z > f.bb[3] + 1) continue;
      for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (pip(x + ox, z + oz, f.r)) return true;
    }
    return W.size > 0 && nearWall(x, z);
  };
}
/** How much the ground rises and falls in a cell (m) — a hilly cell's ground is built finer. */
function relief(dem: { buf: ArrayBuffer; layout: LayerLayout }) {
  const L = dem.layout, n = L.grid.w * L.grid.h, h = new Float32Array(dem.buf, L.height.offset, n);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) (lo = Math.min(lo, h[i])), (hi = Math.max(hi, h[i]));
  return (hi - lo) / 100;
}

// `relief`: the main thread already has this synth cell mounted FLAT (its 4 s DEM race
// lost). Await the untimed patch; no patch → null (nothing to swap), else a full rebuild
// on real heights that the stream swaps in place of the flat mount.
async function build(msg: { id: number; spec: TileSpec; idBase: number; lite?: boolean; relief?: boolean; terr?: { slice: LayerLayout; backdrop: LayerLayout } }): Promise<BuiltTile | null> {
  const spec = msg.spec;
  if (!terrain) {
    const lay = msg.terr;
    if (!lay) throw new Error('no terrain layout');
    const bin = await loadBin();
    terrain = new Terrain(new TerrainLayer(bin, lay.slice), new TerrainLayer(bin, lay.backdrop));
    terrain.patchCell = cell;
    terrain.baked = new Set(bakedCells);
  }
  // H2: virtual cells get a real Terrarium patch — fetched per-cell (s/w twins share),
  // registered into this worker's terrain BEFORE synthTile/buildTile so ground mesh,
  // props and interiors all build on real heights. Placeholder tiles race the patch at
  // 4 s (they exist to be fast); real tiles await it — OSM is the slow pole anyway.
  const cellKey = spec.id.slice(1);
  let demP: Promise<{ buf: ArrayBuffer; layout: LayerLayout } | null> | null = null;
  // Cache the UNTIMED grid — the s-twin races it at 4 s; when the w-twin (or a relief
  // rebuild) comes later it awaits the same promise and still gets the real heights.
  // (a real cell's grid is 4 m — fine enough to carry its graded streets; a placeholder's 16 m)
  if (demOn && origin && (spec.synth || spec.world)) demP = demFor(cellKey, spec.box, !msg.lite ? 4 : 16);
  // Relief rebuilds: a synth cell waits for its DEM, a real cell for its LiDAR (below).
  if (msg.relief && spec.synth) {
    const d = demP ? await demP : null;
    if (!d) return null;
  }
  // The map's water from the vector tiles (a fifth of a second — cached per cell): a stand-in's
  // only real knowledge of its shore, and a real cell's sea — OSM's coastline is a line, and a
  // cell wholly out on the bay has none to close a sea polygon from (Elliott Bay's south cell
  // was a DEM smear: a lawn under trees); the ocean polygons are the coastline already closed.
  const mvtP = origin && (spec.synth || spec.world) ? mvtWater(spec, !!msg.lite) : null;
  // OSM/tile fetch starts first (it's the slow pole); DEM resolves in parallel.
  const tjP: Promise<TileJson> | null = spec.synth
    ? null
    : spec.world
      ? worldTile(spec) // real-lite: the tile service, else straight from Overpass
      : (cachedFetchJson(base + spec.file) as Promise<TileJson>);
  // A stand-in for a real cell is the vector twin when the CDN answers — real streets and buildings,
  // built exactly as a real cell is from here on (its sea, its graded streets, its LiDAR).
  // Detail placeholders race the DEM (they exist to be fast; a late patch triggers a relief
  // rebuild). Coarse silhouettes wait up to 20 s: they're distant, never relieved, and a flat one
  // reads as buildings sunk into the hills around it. (The two races run side by side.)
  const vecP = spec.synth && origin && !msg.lite ? raceNull(vectorCell(spec), msg.relief ? 30000 : 6000) : null;
  const demR = demP ? (spec.synth && !msg.relief ? raceNull(demP, msg.lite ? 20000 : 4000) : demP) : null;
  const [vec, dem0] = await Promise.all([vecP, demR]);
  const realish = spec.world || !!vec;
  // (a DEM that landed while the vector race ran on still counts)
  let dem = dem0 ?? (demP ? await raceNull(demP, 0) : null);
  // (a stand-in never overwrites the ground its real twin registered in this worker)
  const mayRegister = spec.world || !realPatched.has(cellKey);
  let waterLate = false, water: WaterBody[] | undefined, walls: number[] = [];
  if (dem) {
    // The worker keeps its own view; a copy crosses to the main thread for the walker.
    // Registering BEFORE synthTile matters — placeholder lots must sit on real hills.
    if (mayRegister) terrain.registerPatch(cellKey, new TerrainLayer(dem.buf.slice(0), dem.layout));
    // a stand-in knows the map's water before it plants a street: the vector tiles' (a fifth of a
    // second), else — where the DEM says there could be water — Overpass'; a later answer comes
    // in with a relief rebuild, which waits for it
    if (spec.synth && !vec && mvtP) {
      const wet = mayBeWet(dem);
      let wt = await raceNull(mvtP, msg.relief ? 30000 : 5000);
      const complete = !!wt && !msg.lite; // (the vector tiles carry the ocean: their water is the whole answer — at z14; z12 drops the small harbours)
      if (!wt && wet) wt = await raceNull(waterTile(spec), msg.relief ? 45000 : 6000);
      if (wt) {
        water = waterBodies(dem, wt, terrain);
        if (water.length || complete) {
          dem = waterPatch(dem, water, complete);
          if (mayRegister) terrain.registerPatch(cellKey, new TerrainLayer(dem.buf.slice(0), dem.layout));
        }
      } else if (wet && !msg.relief) waterLate = true;
    }
  }
  const syn: SynthResult | null = spec.synth && !vec ? synthTile(spec, seed, terrain) : null;
  if (syn && water?.length) syn.extra.add(waterSheets(water, spec.box));
  let tj = vec ?? (tjP ? await tjP : syn!.tj);
  // a real cell's sea is the vector tiles' (the lakes stay its own OSM's, names and all) — for
  // the ground, the props, the paint and the walker alike
  let seaFromMap = false;
  if (realish && mvtP) {
    const mw = await raceNull(mvtP, msg.lite ? 3000 : 8000);
    if (mw) {
      tj = { ...tj, areas: [...tj.areas.filter((a) => a.k !== 'sea'), ...mw.areas.filter((a) => a.k === 'sea')] };
      seaFromMap = !msg.lite; // (z12's water, a distant cell's, leaves the small harbours out: not the whole answer)
    }
  }
  // a real cell's own water (its coast's sea, its lakes) goes into the ground under it: the sea
  // below the datum, lakes at their level — for the ground, the trees, the walker and the cars
  // …and its streets graded into it (grade.ts): no 50% ramp where the DEM smeared a wall
  if (dem && realish) {
    water = waterBodies(dem, tj, terrain);
    if (water.length || seaFromMap) dem = waterPatch(dem, water, seaFromMap);
    if (!msg.lite && dem.layout.grid.cell <= 4) {
      const gr = gradedDem(dem, tj, (m) => ctx.postMessage({ kind: 'log', msg: `[grade ${cellKey}] ${m}` }), true);
      dem = gr.dem;
      walls = gr.walls;
    }
    if (mayRegister) terrain.registerPatch(cellKey, new TerrainLayer(dem.buf.slice(0), dem.layout));
    if (spec.world && !msg.lite) {
      realPatched.add(cellKey);
      realDem.delete(cellKey);
      realDem.set(cellKey, { buf: dem.buf.slice(0), layout: dem.layout });
      // (the last 24 cells' ground kept; an older cell's stand-in builds on its own again)
      while (realDem.size > 24) { const k = realDem.keys().next().value!; realDem.delete(k); realPatched.delete(k); }
    }
  }
  // Measured buildings: real footprints get LiDAR ridge/eave/roof shape before the builders
  // run. Lite (LOD) builds only use what's already cached; detail builds wait briefly.
  let lidarLate = false;
  if (!syn && lidarOn()) {
    // (a vector twin is a stand-in: up now from priors, its measured rebuild later)
    const e = await enrichTile(tj, spec.box, msg.relief ? null : vec ? 0 : LIDAR_WAIT, !msg.lite);
    // (a real cell's relief rebuild is for its measurements: none, nothing to swap; a stand-in's
    // is for its ground, and is built whatever the survey says)
    if (msg.relief && spec.world && e !== 'done') return null;
    lidarLate = e === 'late';
  }
  const tbuf = spec.terrain && !msg.lite ? await cachedFetch(base + spec.terrain.file) : undefined;
  const tile = await buildTile(tj, terrain, spec, msg.idBase, !!msg.lite);
  if (syn) tile.objs.push(...packGroup(syn.extra));
  else if (realish) tile.objs.push(...packGroup(realExtras(tj, terrain, dem && dem.layout.grid.cell <= 4 && relief(dem) > 6 ? 4 : 8, dem ? water : undefined))); // ground + real-street ribbons + water
  if (vec) tile.vec = 1;
  // tunnel mouths: a headwall round a dark opening where a street goes underground
  if (realish && !msg.lite) {
    const ports = findPortals(tj.roads);
    if (ports.length) {
      const T = terrain;
      const pm = portalMeshes(ports, (x, z) => T.heightAt(x, z));
      tile.objs.push(...packGroup(pm.group));
      tile.walls.push(...pm.walls);
    }
  }
  // the coast's foam: a strip along the cell's own shore, from the sea pressed into its ground
  if (dem && !msg.lite && mayRegister && (realish || water?.length)) {
    const sg = shoreGroup(dem, spec.box);
    if (sg) tile.objs.push(...packGroup(sg));
  }
  // (only the panels this cell owns — a wall standing in the neighbour's box is the neighbour's;
  // none from a stand-in standing on its real twin's ground — the twin's own come back with it)
  if (walls.length && mayRegister) {
    const own: number[] = [], b = spec.box;
    for (let i = 0; i + 7 < walls.length; i += 8) {
      const mx = (walls[i] + walls[i + 2]) / 2, mz = (walls[i + 1] + walls[i + 3]) / 2;
      if (mx >= b.x0 && mx < b.x1 && mz >= b.z0 && mz < b.z1) own.push(...walls.slice(i, i + 8));
    }
    if (own.length) {
      tile.objs.push(...packGroup(retainingWalls(own)));
      tile.walls.push(...retainingColliders(own));
    }
  }
  // A copy ships to the main thread for its patch registry; the worker keeps its own bytes.
  tile.terr = tbuf?.slice(0);
  // dem.buf is shared via demCache (the w-twin build will reuse it) — ship a copy, not
  // the cached buffer itself, or the transfer detaches it and the next twin reads zeros.
  // (a stand-in built on its real twin's ground ships that ground: the walker's and the meshes' agree)
  const shipped = !mayRegister && !msg.lite ? realDem.get(cellKey) ?? dem : dem;
  if (shipped) tile.dem = { buf: shipped.buf.slice(0), layout: shipped.layout };
  // Built without data that's still coming (flat while a DEM was expected, or from priors
  // while the LiDAR read runs) — the stream asks for a relief rebuild and swaps it in.
  else if (demP && spec.synth && !msg.lite) tile.late = 1;
  if (lidarLate && !msg.lite) tile.late = 1;
  if (waterLate && !msg.lite) tile.late = 1; // (its water still on the way: rebuilt when it lands)
  return tile;
}

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.kind === 'init') {
    base = m.base;
    cell = m.cell;
    seed = m.seed ?? 0;
    if (m.bin) binInit = m.bin;
    if (m.origin) origin = m.origin;
    if (m.dem) demOn = true;
    if (m.baked) bakedCells = m.baked;
    for (const c of m.fail ?? []) failCells.add(c);
    if (m.vector === false) vecOn = false;
    if (m.demBase) setDemBase(m.demBase);
    if (m.lidar && m.origin) {
      setLidarLog((msg) => ctx.postMessage({ kind: 'log', msg }));
      if (m.lidarPort) setLidarPort(m.lidarPort);
      initLidar(m.origin);
    }
    if (m.fp) initCache(base, m.fp); // same idb database as the page
    const st = m.style ? styleByKey(m.style) : null;
    if (st) setActiveStyle(st); // Phase I: builders read the region's style (palettes, species, roof habits)
    return;
  }
  if (m.kind !== 'build') return;
  build(m).then(
    (tile) => {
      if (!tile) return ctx.postMessage({ kind: 'built', id: m.id, tile: null });
      const tr: Transferable[] = [];
      for (const o of tile.objs) {
        for (const a of Object.values(o.at)) tr.push(a.a.buffer);
        if (o.ix) tr.push(o.ix.buffer);
        if (o.im) tr.push(o.im.buffer);
        if (o.ic) tr.push(o.ic.buffer);
      }
      for (const d of tile.decks) if (d.h) tr.push(d.h.buffer);
      for (const op of tile.ops) if (op.o === 'd' && op.d.h) tr.push(op.d.h.buffer);
      if (tile.atlas) tr.push(tile.atlas);
      if (tile.terr) tr.push(tile.terr);
      if (tile.dem) tr.push(tile.dem.buf);
      ctx.postMessage({ kind: 'built', id: m.id, tile }, tr);
    },
    (e) => ctx.postMessage({ kind: 'error', id: m.id, message: String(e?.stack ?? e), net: e?.name === 'FetchError' ? 1 : 0 }),
  );
};
