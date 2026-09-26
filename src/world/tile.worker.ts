// Worker-side tile build: fetch + decode + mesh + collision for one tile, packed for transfer.
// Runs the same buildTile pipeline as the main-thread fallback — same output, off the main thread.
import { Terrain, TerrainLayer, type LayerLayout, type TileJson, type TileSpec } from './data';
import { cachedFetch, cachedFetchJson, initCache } from './cache';
import { buildTile } from './tileBuild';
import { packGroup, type BuiltTile } from './pack';
import { synthTile, realExtras } from './synth';
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
  let syn: SynthResult | null = null;
  const [tj, tbuf] = await Promise.all([
    spec.synth
      ? Promise.resolve((syn = synthTile(spec, seed, terrain)).tj)
      : spec.world
        ? (cachedFetchJson(spec.file) as Promise<TileJson>) // real-lite: absolute tile-service URL
        : (cachedFetchJson(base + spec.file) as Promise<TileJson>),
    spec.terrain && !msg.lite ? cachedFetch(base + spec.terrain.file) : Promise.resolve(undefined),
  ]);
  const tile = await buildTile(tj, terrain, spec, msg.idBase, !!msg.lite);
  if (syn) tile.objs.push(...packGroup(syn.extra));
  else if (spec.world) tile.objs.push(...packGroup(realExtras(tj, terrain))); // ground + real-street ribbons + water
  // A copy ships to the main thread for its patch registry; the worker keeps its own bytes.
  tile.terr = tbuf?.slice(0);
  return tile;
}

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.kind === 'init') {
    base = m.base;
    cell = m.cell;
    seed = m.seed ?? 0;
    if (m.bin) binInit = m.bin;
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
      ctx.postMessage({ kind: 'built', id: m.id, tile }, tr);
    },
    (e) => ctx.postMessage({ kind: 'error', id: m.id, message: String(e?.stack ?? e) }),
  );
};
