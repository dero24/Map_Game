// Worker-side tile build: fetch + decode + mesh + collision for one tile, packed for transfer.
// Runs the same buildTile pipeline as the main-thread fallback — same output, off the main thread.
import { Terrain, TerrainLayer, type LayerLayout, type TileJson, type TileSpec } from './data';
import { cachedFetch, cachedFetchJson, initCache } from './cache';
import { buildTile } from './tileBuild';
import { packGroup, type BuiltTile } from './pack';
import { synthTile, realExtras } from './synth';
import { fetchDem, demLayer, setDemBase, raceNull } from './dem';
import type { SynthResult } from './synth';

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
const demCache = new Map<string, Promise<{ buf: ArrayBuffer; layout: LayerLayout } | null>>();

const loadBin = () => (binPromise ??= binInit ? Promise.resolve(binInit) : cachedFetch(base + 'terrain.bin'));

async function build(msg: { id: number; spec: TileSpec; idBase: number; lite?: boolean; terr?: { slice: LayerLayout; backdrop: LayerLayout } }): Promise<BuiltTile> {
  const spec = msg.spec;
  if (!terrain) {
    const lay = msg.terr;
    if (!lay) throw new Error('no terrain layout');
    const bin = await loadBin();
    terrain = new Terrain(new TerrainLayer(bin, lay.slice), new TerrainLayer(bin, lay.backdrop));
    terrain.patchCell = cell;
  }
  // H2: virtual cells get a real Terrarium patch — fetched per-cell (s/w twins share),
  // registered into this worker's terrain BEFORE synthTile/buildTile so ground mesh,
  // props and interiors all build on real heights. Placeholder tiles race the patch at
  // 4 s (they exist to be fast); real tiles await it — OSM is the slow pole anyway.
  const cellKey = spec.id.slice(1);
  let demP: Promise<{ buf: ArrayBuffer; layout: LayerLayout } | null> | null = null;
  if (demOn && origin && (spec.synth || spec.world)) {
    demP = demCache.get(cellKey) ?? null;
    if (!demP) {
      // Cache the UNTIMED grid — the s-twin races it at 4 s; when the w-twin lands later
      // it awaits the same promise and still gets the real heights.
      demP = fetchDem(spec.box, origin).then((d) => (d ? demLayer(d) : null));
      demCache.set(cellKey, demP);
    }
  }
  // OSM/tile fetch starts first (it's the slow pole); DEM resolves in parallel.
  const tjP: Promise<TileJson> | null = spec.synth
    ? null
    : spec.world
      ? (cachedFetchJson(spec.file) as Promise<TileJson>) // real-lite: absolute tile-service URL
      : (cachedFetchJson(base + spec.file) as Promise<TileJson>);
  const dem = demP ? (spec.synth ? await raceNull(demP, 4000) : await demP) : null;
  if (dem) {
    // The worker keeps its own view; a copy crosses to the main thread for the walker.
    // Registering BEFORE synthTile matters — placeholder lots must sit on real hills.
    terrain.registerPatch(cellKey, new TerrainLayer(dem.buf.slice(0), dem.layout));
  }
  const syn: SynthResult | null = spec.synth ? synthTile(spec, seed, terrain) : null;
  const tj = tjP ? await tjP : syn!.tj;
  const tbuf = spec.terrain && !msg.lite ? await cachedFetch(base + spec.terrain.file) : undefined;
  const tile = await buildTile(tj, terrain, spec, msg.idBase, !!msg.lite);
  if (syn) tile.objs.push(...packGroup(syn.extra));
  else if (spec.world) tile.objs.push(...packGroup(realExtras(tj, terrain))); // ground + real-street ribbons + water
  // A copy ships to the main thread for its patch registry; the worker keeps its own bytes.
  tile.terr = tbuf?.slice(0);
  // dem.buf is shared via demCache (the w-twin build will reuse it) — ship a copy, not
  // the cached buffer itself, or the transfer detaches it and the next twin reads zeros.
  if (dem) tile.dem = { buf: dem.buf.slice(0), layout: dem.layout };
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
    if (m.demBase) setDemBase(m.demBase);
    if (m.fp) initCache(base, m.fp); // same idb database as the page
    return;
  }
  if (m.kind !== 'build') return;
  build(m).then(
    (tile) => {
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
      if (tile.lamp) tr.push(tile.lamp);
      if (tile.terr) tr.push(tile.terr);
      if (tile.dem) tr.push(tile.dem.buf);
      ctx.postMessage({ kind: 'built', id: m.id, tile }, tr);
    },
    (e) => ctx.postMessage({ kind: 'error', id: m.id, message: String(e?.stack ?? e) }),
  );
};
