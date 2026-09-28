// Worker-side tile build: fetch + decode + mesh + collision for one tile, packed for transfer.
// Runs the same buildTile pipeline as the main-thread fallback — same output, off the main thread.
import { Terrain, TerrainLayer, type LayerLayout, type TileJson, type TileSpec } from './data';
import { cachedFetch, cachedFetchJson, initCache, kvGet, kvPut } from './cache';
import { osmToTile, overpassQuery, makeProjector, type OsmDoc } from './realTile';
import { buildTile } from './tileBuild';
import { packGroup, type BuiltTile } from './pack';
import { synthTile, realExtras } from './synth';
import { fetchDem, demLayer, setDemBase, raceNull } from './dem';
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

// ---- real-lite, direct: this browser → Overpass → the same osmToTile the tile service runs ----
// Used when `?tiles=direct` (no service at all) and as the fallback when the service is down or
// stalls — the player gets the real town either way, never a placeholder for want of a proxy.
// Results are cached per cell in IndexedDB (kvPut), so a revisit never re-queries Overpass.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const DIRECT_V = 7; // keep with the tile service's t/vN (realTile output version)
let opSlots = 1; // Overpass rate-limits per IP: one query at a time from a browser (429s otherwise)
const opWait: (() => void)[] = [];
async function directTile(spec: TileSpec): Promise<TileJson> {
  if (!origin) throw new Error('direct tiles need an origin');
  const [cx, cz] = spec.id.slice(1).split('_').map(Number);
  const key = `osm${DIRECT_V}|${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${cx}_${cz}`;
  const hit = await kvGet<TileJson>(key);
  if (hit) return hit;
  const say = (msg: string) => ctx.postMessage({ kind: 'log', msg: `[direct ${cx}_${cz}] ${msg}` });
  if (opSlots <= 0) await new Promise<void>((r) => opWait.push(r));
  else opSlots--;
  try {
    const M = 48;
    const bb = makeProjector(origin).localToBbox({ x0: spec.box.x0 - M, z0: spec.box.z0 - M, x1: spec.box.x1 + M, z1: spec.box.z1 + M });
    const body = 'data=' + encodeURIComponent(overpassQuery(bb));
    let last = 'no endpoint';
    for (const ep of [OVERPASS[0], OVERPASS[0], ...OVERPASS.slice(1), OVERPASS[0]]) {
      try {
        const r = await fetch(ep, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(45000) });
        if (!r.ok) {
          last = `${ep} ${r.status}`;
          // 429: our slot isn't free yet — wait as asked (the main server is worth waiting for)
          if (r.status === 429 || r.status === 504) await new Promise((res) => setTimeout(res, Math.min(15, +(r.headers.get('retry-after') ?? 4) || 4) * 1000));
          continue;
        }
        const j = (await r.json()) as OsmDoc & { remark?: string };
        if (typeof j.remark === 'string' && /runtime error|timed out|out of memory|runtime limit/i.test(j.remark)) { last = j.remark; continue; }
        const tj = osmToTile(j, { id: `${cx}_${cz}`, box: spec.box, origin });
        say(`ok b${tj.buildings.length} r${tj.roads.length} l${tj.lines.length}`);
        void kvPut(key, tj);
        return tj;
      } catch (e) {
        last = `${ep} ${(e as Error)?.message ?? e}`;
      }
    }
    throw new Error('overpass unavailable: ' + last);
  } finally {
    const next = opWait.shift();
    if (next) next();
    else opSlots++;
  }
}
// The tile service, raced against a stall: after 25 s (or any failure) go direct.
function worldTile(spec: TileSpec): Promise<TileJson> {
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
function demFor(cellKey: string, box: TileSpec['box']) {
  let p = demCache.get(cellKey);
  if (!p) {
    p = fetchDem(box, origin!).then((d) => (d ? demLayer(d) : null));
    demCache.set(cellKey, p);
    void p.then((d) => { if (!d && demCache.get(cellKey) === p) demCache.delete(cellKey); });
  }
  return p;
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
  if (demOn && origin && (spec.synth || spec.world)) demP = demFor(cellKey, spec.box);
  // Relief rebuilds: a synth cell waits for its DEM, a real cell for its LiDAR (below).
  if (msg.relief && spec.synth) {
    const d = demP ? await demP : null;
    if (!d) return null;
  }
  // OSM/tile fetch starts first (it's the slow pole); DEM resolves in parallel.
  const tjP: Promise<TileJson> | null = spec.synth
    ? null
    : spec.world
      ? worldTile(spec) // real-lite: the tile service, else straight from Overpass
      : (cachedFetchJson(base + spec.file) as Promise<TileJson>);
  // Detail placeholders race the DEM (they exist to be fast; a late patch triggers a relief
  // rebuild). Coarse silhouettes wait up to 20 s: they're distant, never relieved, and a flat one
  // reads as buildings sunk into the hills around it.
  const dem = demP ? (spec.synth && !msg.relief ? await raceNull(demP, msg.lite ? 20000 : 4000) : await demP) : null;
  if (dem) {
    // The worker keeps its own view; a copy crosses to the main thread for the walker.
    // Registering BEFORE synthTile matters — placeholder lots must sit on real hills.
    terrain.registerPatch(cellKey, new TerrainLayer(dem.buf.slice(0), dem.layout));
  }
  const syn: SynthResult | null = spec.synth ? synthTile(spec, seed, terrain) : null;
  const tj = tjP ? await tjP : syn!.tj;
  // Measured buildings: real footprints get LiDAR ridge/eave/roof shape before the builders
  // run. Lite (LOD) builds only use what's already cached; detail builds wait briefly.
  let lidarLate = false;
  if (!syn && lidarOn()) {
    const e = await enrichTile(tj, spec.box, msg.relief ? null : LIDAR_WAIT, !msg.lite);
    if (msg.relief && e !== 'done') return null;
    lidarLate = e === 'late';
  }
  const tbuf = spec.terrain && !msg.lite ? await cachedFetch(base + spec.terrain.file) : undefined;
  const tile = await buildTile(tj, terrain, spec, msg.idBase, !!msg.lite);
  if (syn) tile.objs.push(...packGroup(syn.extra));
  else if (spec.world) tile.objs.push(...packGroup(realExtras(tj, terrain))); // ground + real-street ribbons + water
  // A copy ships to the main thread for its patch registry; the worker keeps its own bytes.
  tile.terr = tbuf?.slice(0);
  // dem.buf is shared via demCache (the w-twin build will reuse it) — ship a copy, not
  // the cached buffer itself, or the transfer detaches it and the next twin reads zeros.
  if (dem) tile.dem = { buf: dem.buf.slice(0), layout: dem.layout };
  // Built without data that's still coming (flat while a DEM was expected, or from priors
  // while the LiDAR read runs) — the stream asks for a relief rebuild and swaps it in.
  else if (demP && spec.synth && !msg.lite) tile.late = 1;
  if (lidarLate && !msg.lite) tile.late = 1;
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
