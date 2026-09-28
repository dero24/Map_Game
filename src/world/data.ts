// Baked world data: types, loader and CPU-side terrain sampling.
import { cachedFetch, cachedFetchJson, initCache, manifestFingerprint } from './cache';

export interface Box { x0: number; z0: number; x1: number; z1: number }
export interface GridHeader { x0: number; z0: number; cell: number; w: number; h: number }
export interface Chunk { offset: number; length: number; type: string }
export interface LayerLayout { grid: GridHeader; height: Chunk; sdf: Chunk; cover: Chunk; flags: Chunk; oceanD: Chunk }

// Owner-flagged entities only — margin context (own: 0) is emitted once by its owner tile.
export const prim = <T extends { own?: number }>(a: T[]) => a.filter((e) => e.own !== 0);

export type RoofKind = 'flat' | 'gable' | 'hip' | 'skillion' | 'tower';
export type BuildingKind = 'house' | 'shed' | 'commercial' | 'large' | 'church' | 'lighthouse';
export interface Building {
  r: number[]; // ring, 0.1 m ints
  h: number; // total height (m)
  k: BuildingKind;
  roof: RoofKind;
  s: number;
  lod?: 1;
  n?: string; // name (from OSM / a POI inside)
  u?: string; // what it's used for: the OSM amenity / shop / office / craft value (language-neutral, uses.ts)
  fc?: number; // real facade colour 0xRRGGBB (tags / materials)
  rc?: number; // real roof colour 0xRRGGBB (tags / materials / aerial imagery)
  fl?: number; // mapped number of floors
  mh?: number; // mapped min_height (m): the building stands on something (pilings)
  // Simple 3D Buildings (OSM building:part): a tower's setbacks, podium and crown are parts
  // inside one outline. The outline keeps the footprint, door and name; the parts are the shape.
  pt?: 1; // a building:part (no door or footprint of its own; drawn from lf up to lf + h)
  lf?: number; // lift: the part's bottom above the ground (m) — setbacks, overhangs, skybridges
  po?: number; // index of the outline this part belongs to (same tile) — shares its id and look
  hp?: 1; // an outline its parts fully draw: footprint, door and name only, no walls or roof
  gf?: 1; // a storefront street floor under apartments (a shop mapped inside, or a row on a main road)
  at?: 1; // a row building: party walls in a dense block (row house, walk-up, terrace)
  rt?: 1; // the roof shape was mapped (roof:shape) — style priors leave it alone
  hq?: 1; // h came from a mapped height tag (a survey), not floors or a prior
  ma?: string; // mapped facade material (building:material): glass, brick, stone, concrete…
  yr?: number; // construction year (start_date): era decides glass curtain wall vs masonry
  ad?: string; // street address
  own?: number; // tile tiles: 0 = margin context (a neighbour tile emits it)
  gen?: 'fill' | 'lidar'; // 'fill': hybrid-fill guess beside a real street (H3); 'lidar': unmapped, found in the survey
  eav?: number; // measured eave height above ground (m) — 3DEP LiDAR (lidar.ts); h is then the ridge
  ms?: 1; // h/roof/eav measured from LiDAR (not mapped priors)
}
export interface Road { p: number[]; c: string; w: number; n?: string; ref?: string; br?: 'yes' | 'movable'; l?: number; ow?: 1; sw?: 1; sv?: string; pk?: number; lod?: 1; own?: number } // pk: mapped street parking, left + 4·right (1 parallel, 2 angled)
export interface Area { c: string; o: number[][]; i: number[][]; n?: string; lod?: 1; own?: number }
/** `ft` (fences): 1 iron railing, 2 chain-link, 3 wood/picket — from OSM fence_type; absent = unknown. */
export interface Line { c: string; p: number[]; w?: number; br?: 1; own?: number; ft?: number }
export interface Point { c: string; x: number; z: number; own?: number }
export interface Poi { name: string; kind: string; x: number; z: number; slice: boolean }
export interface Landmark { id: string; name: string; x: number; z: number; h: number; ground: number }

// Region identity + spawn/anchor hints, baked from scripts/config.mjs REGIONS.
export interface SpawnSpec {
  on?: string; // road name to stand on
  near?: { road: string; bridge?: boolean; extreme?: 'e' | 'w' | 'n' | 's' };
  offset?: [number, number];
  toward?: 'north' | 'south' | 'east' | 'west';
  sidewalk?: number;
}
export interface RegionMeta {
  id: string; name: string; title: string; sub: string; tz: string;
  spawn: SpawnSpec | null;
  roads: { main?: string; bridge?: string };
  shoreLabel: string;
  style?: string; // styles.ts key (climate/family/L|R/region); absent → derived from the origin
}
export interface RegionEntry { id: string; name: string; title: string; sub: string; origin: { lat: number; lon: number } }

export interface WorldJson {
  version: number;
  meta?: RegionMeta;
  origin: { lat: number; lon: number };
  slice: Box;
  backdrop: Box;
  detail?: Box; // full-detail zone for builders (see detailBox)
  trees?: number[]; // see TileJson.trees
  treeCov?: number[];
  sources: Record<string, string | null>;
  terrain: { slice: LayerLayout; backdrop: LayerLayout };
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  lines: Line[];
  points: Point[];
  pois: Poi[];
  landmarks: Landmark[];
}

export class TerrainLayer {
  readonly g: GridHeader;
  readonly height: Int16Array | Float32Array; // cm — i16 baked packs, f32 DEM patches (real mountains exceed 327 m)
  readonly sdf: Int16Array; // dm, + land
  readonly cover: Uint8Array; // ESA WorldCover class
  readonly flags: Uint8Array; // bit0 water, bit1 ocean
  readonly oceanD: Uint8Array; // distance to ocean /2 m
  constructor(buf: ArrayBuffer, L: LayerLayout) {
    this.g = L.grid;
    this.height = L.height.type === 'f32' ? new Float32Array(buf, L.height.offset, L.height.length) : new Int16Array(buf, L.height.offset, L.height.length);
    this.sdf = new Int16Array(buf, L.sdf.offset, L.sdf.length);
    this.cover = new Uint8Array(buf, L.cover.offset, L.cover.length);
    this.flags = new Uint8Array(buf, L.flags.offset, L.flags.length);
    this.oceanD = new Uint8Array(buf, L.oceanD.offset, L.oceanD.length);
  }
  contains(x: number, z: number, margin = 0) {
    const g = this.g;
    return x >= g.x0 + margin && z >= g.z0 + margin && x <= g.x0 + g.w * g.cell - margin && z <= g.z0 + g.h * g.cell - margin;
  }
  private bil(arr: ArrayLike<number>, x: number, z: number) {
    const g = this.g;
    let fx = (x - g.x0) / g.cell - 0.5, fz = (z - g.z0) / g.cell - 0.5;
    fx = Math.max(0, Math.min(g.w - 1.001, fx));
    fz = Math.max(0, Math.min(g.h - 1.001, fz));
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    const c = j * g.w + i;
    return (arr[c] * (1 - ax) + arr[c + 1] * ax) * (1 - az) + (arr[c + g.w] * (1 - ax) + arr[c + g.w + 1] * ax) * az;
  }
  heightAt(x: number, z: number) { return this.bil(this.height, x, z) / 100; }
  sdfAt(x: number, z: number) { return this.bil(this.sdf, x, z) / 10; }
  oceanDistAt(x: number, z: number) { return this.bil(this.oceanD, x, z) * 2; }
  cell(arr: Uint8Array, x: number, z: number) {
    const g = this.g;
    const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.w || j >= g.h) return 0;
    return arr[j * g.w + i];
  }
  coverAt(x: number, z: number) { return this.cell(this.cover, x, z); }
  isOcean(x: number, z: number) { return (this.cell(this.flags, x, z) & 2) !== 0; }
}

export class Terrain {
  // Per-tile detail packs, registered/removed with the tile stream — the same lifecycle and
  // ownership story as WalkWorld scopes. A pack covers tile∩slice on the shared lattice, so its
  // samples are identical to the slice layer's; the patch wins where present (it's the tile's own
  // data), then the region slice layer, then the always-resident backdrop.
  private patches = new Map<string, TerrainLayer>();
  patchCell = 1024;
  // Cells the bake owns ('cx_cz'): their heights come from the bake's own layers — a streamed
  // neighbour's DEM overhang must never reach in (bake-placed buildings would float or sink).
  baked: Set<string> | null = null;
  constructor(readonly slice: TerrainLayer, readonly backdrop: TerrainLayer) {}
  registerPatch(id: string, L: TerrainLayer) { this.patches.set(id, L); }
  removePatch(id: string) { this.patches.delete(id); }
  private patchFor(x: number, z: number) {
    if (!this.patches.size) return null;
    const cx = Math.floor(x / this.patchCell), cz = Math.floor(z / this.patchCell);
    const p = this.patches.get(`${cx}_${cz}`);
    if (p && p.contains(x, z)) return p;
    if (this.baked?.has(`${cx}_${cz}`)) return null;
    // DEM patches overhang their cell by up to one pitch — near an edge, check the
    // neighbours too, or a not-yet-loaded cell's rim reads as a flat shelf.
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        if (!ox && !oz) continue;
        const q = this.patches.get(`${cx + ox}_${cz + oz}`);
        if (q && q.contains(x, z)) return q;
      }
    return null;
  }
  layer(x: number, z: number) {
    return this.patchFor(x, z) ?? (this.slice.contains(x, z, 2) ? this.slice : this.backdrop);
  }
  heightAt(x: number, z: number) { return this.layer(x, z).heightAt(x, z); }
  sdfAt(x: number, z: number) { return this.layer(x, z).sdfAt(x, z); }
  coverAt(x: number, z: number) { return this.layer(x, z).coverAt(x, z); }
  oceanDistAt(x: number, z: number) { return this.layer(x, z).oceanDistAt(x, z); }
}

export interface World {
  json: WorldJson;
  terrain: Terrain;
}

// ---------------- atlas / tile streaming ----------------

export interface TileSpec { id: string; box: Box; lod: number; file: string; terrain?: { file: string; layout: LayerLayout }; synth?: 1; world?: 1 }

// Region manifest: identity + slim data (named roads, pois, landmarks) + the tile grid.
export interface AtlasManifest {
  version: number;
  id: string;
  meta?: RegionMeta;
  origin: { lat: number; lon: number };
  slice: Box;
  backdrop: Box;
  sources: Record<string, string | null>;
  cell: number;
  margin: number;
  terrain: { slice: LayerLayout; backdrop: LayerLayout }; // layout into terrain.bin
  roads: Road[]; // named roads only (labels, spawn anchors, HUD)
  pois: Poi[];
  landmarks: Landmark[];
  tiles: TileSpec[];
  tilesUrl?: string; // real-lite tile service base (worker); ?tiles= overrides
  bakeId?: string; // content hash of the baked tiles — part of the cache fingerprint
}

// One streamed tile: the same entity arrays as WorldJson, scoped to a cell (+ margin context).
// Where builders place full detail (doors, porches, interiors, props, street signs). Baked tiles
// carry `detail` (the backdrop since the one-world bake); synth/real-lite tiles set slice = their
// own box; old bakes fall back to the region slice. The slice itself keeps its other meanings:
// the fine terrain lattice and the lamp-map compositor box.
export const detailBox = (j: { slice: Box; detail?: Box }): Box => j.detail ?? j.slice;

export interface TileJson {
  version: number;
  id: string;
  lod: number;
  box: Box;
  origin: { lat: number; lon: number };
  slice: Box;
  backdrop: Box;
  detail?: Box; // full-detail zone (bake: backdrop); absent on old bakes → slice
  landmarks?: Landmark[];
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  lines: Line[];
  points: Point[];
  // LiDAR trees (lidar.ts, added in the worker): [x dm, z dm, height dm, crown radius dm]…
  // local frame; treeCov = 16×16 blocks over `box` the survey covered (elsewhere props falls
  // back to the WorldCover scan).
  trees?: number[];
  treeCov?: number[];
  // Real-lite (worker-served) tiles carry provenance; baked tiles don't emit these.
  attribution?: string;
  osmBase?: string | null;
}

// A WorldJson-shaped view of a manifest for consumers that only need region-level data.
export function manifestAsWorldJson(m: AtlasManifest): WorldJson {
  return {
    version: m.version,
    meta: m.meta,
    origin: m.origin,
    slice: m.slice,
    backdrop: m.backdrop,
    sources: m.sources,
    terrain: { slice: null!, backdrop: null! },
    buildings: [],
    roads: m.roads,
    areas: [],
    lines: [],
    points: [],
    pois: m.pois,
    landmarks: m.landmarks,
  };
}

export async function loadAtlas(base: string): Promise<{ manifest: AtlasManifest; terrain: Terrain } | null> {
  const r = await fetch(base + 'manifest.json');
  if (!r.ok) return null;
  const manifest = (await r.json()) as AtlasManifest;
  initCache(base, manifestFingerprint(manifest)); // everything else in this bake goes through idb
  const bin = await cachedFetch(base + 'terrain.bin');
  const terrain = new Terrain(new TerrainLayer(bin, manifest.terrain.slice), new TerrainLayer(bin, manifest.terrain.backdrop));
  return { manifest, terrain };
}

export async function loadTile(base: string, spec: TileSpec): Promise<TileJson> {
  return (await cachedFetchJson(base + spec.file)) as TileJson;
}

// A tile's slice-resolution terrain pack (lod-0 tiles only; null when the tile has none).
export async function loadTileTerrain(base: string, spec: TileSpec): Promise<TerrainLayer | null> {
  if (!spec.terrain) return null;
  return new TerrainLayer(await cachedFetch(base + spec.terrain.file), spec.terrain.layout);
}

export async function loadWorld(base = './data/', onProgress?: (msg: string) => void): Promise<World> {
  onProgress?.('unrolling the map…');
  let wj = await fetch(base + 'world.json');
  if (!wj.ok && base !== './data/') wj = await fetch('./data/world.json'); // legacy single-region layout
  if (!wj.ok) throw new Error(`no world data at ${base} (run npm run bake)`);
  const json = (await wj.json()) as WorldJson;
  let tb = await fetch(base + 'terrain.bin');
  if (!tb.ok && base !== './data/') tb = await fetch('./data/terrain.bin');
  const bin = await tb.arrayBuffer();
  const terrain = new Terrain(new TerrainLayer(bin, json.terrain.slice), new TerrainLayer(bin, json.terrain.backdrop));
  return { json, terrain };
}

// Regions manifest written by bake.mjs. null when only one region has ever been baked.
export async function loadRegions(): Promise<RegionEntry[] | null> {
  try {
    const r = await fetch('./data/regions.json');
    if (!r.ok) return null;
    return (await r.json()) as RegionEntry[];
  } catch {
    return null;
  }
}

// Unpack 0.1 m flat int arrays into [x,z] pairs.
export function unpack(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i] / 10, flat[i + 1] / 10]);
  return out;
}

const K = (Math.PI / 180) * 6378137;
export function toLatLon(origin: { lat: number; lon: number }, x: number, z: number): [number, number] {
  return [origin.lat - z / K, origin.lon + x / (K * Math.cos((origin.lat * Math.PI) / 180))];
}
export function fromLatLon(origin: { lat: number; lon: number }, lat: number, lon: number): [number, number] {
  return [(lon - origin.lon) * K * Math.cos((origin.lat * Math.PI) / 180), (origin.lat - lat) * K];
}
