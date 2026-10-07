// Tile streaming: keeps a ring of neighbourhood tiles alive around the walker. Tiles are decoded
// and built in a worker (src/world/tile.worker.ts — same pipeline as the in-page fallback), then
// mounted cheaply: packed objects rebuilt into scene meshes, collision ops replayed inside a
// WalkWorld scope, interiors registered under "tile:idx" keys. Unload removes all three cleanly.
import * as THREE from 'three';
import { loadTile, loadTileTerrain, type Area, type AtlasManifest, type Box, type LayerLayout, type Road, type TileJson, type TileSpec, type Terrain, TerrainLayer } from './data';
import { seamDuplicates } from './seams';
import { fetchDem, demLayer, setDemBase, raceNull } from './dem';
import { cachedFetchJson, manifestFingerprint } from './cache';
import type { Door, Footprint } from './buildings';
import { wallTop } from './buildings';
import { buildTile } from './tileBuild';
import { buildObject, packGroup, replayOp, unpackDeck, type BuiltTile } from './pack';
import { synthTile, realExtras, regionSeed } from './synth';
import { haloPoints } from './props';
import { signTexture } from './signs';
import { registerPlan, type Interiors, type Plan } from './interiors';
import type { WalkWorld } from '../player/collision';
import { U } from '../render/shared';
import { POOL, poolStops } from '../render/nightLight';
import { activeStyle } from './styles';
import { roofSource } from './aerial';
import { admitCells, type BudgetCell } from './budget';
import type { ShaderWarm } from '../render/warm';

// The rings (m). A phone's quality tier (render/quality.ts) tightens them at boot: every detail
// tile is tens of MB of vertices and textures, and the silhouette ring to 8 km is hundreds of cells.
export const streamParams = {
  loadR: 1500, // keep tiles this close (3×3 cells and then some)
  dropR: 2400, // drop tiles beyond this
  coarseR: 8000, // silhouette ring: lite builds (meshes only) out to the horizon
  // (these four a phone's tier sets — a PC's: no budgets, four real builds and two reliefs at once)
  budgetMB: 0, // the detail tiles' vertex data kept at once, nearest first (world/budget.ts); 0: no cap
  realConc: 4, // real-lite (tile service) builds in flight at once (the service caches in R2; Overpass slots are per endpoint)
  reliefConc: 2, // relief rebuilds (a mounted cell's late LiDAR, roof colours, DEM) in flight at once
  coarseMB: 0, // the silhouette ring's vertex data kept at once (the farthest go first); 0: no cap
  // an unloaded tile's walls taken out of the walk world a slice a frame (WalkWorld.purgeSome), not
  // only marked dead: a long walk's walls would otherwise pile up for the whole session
  purge: true,
  // a tile's mount, a step at a time: the ms of a frame it may take (its collision is tens of
  // thousands of walls — a phone's 60–90 ms in one go); the spawn's own ground still mounts at once
  mountMs: 4,
  // a tile's small things (its mailboxes, hydrants, benches, gardens' plants, parked cars) not drawn
  // past this many times their own size (a 1 m mailbox past 200 m: two pixels): far tiles' draw calls,
  // a phone's CPU (its tier: 120). 0: all drawn.
  smallCull: 200,
};
// (what a detail tile weighs before its first build: a real city cell, a stand-in, a baked one)
const EST = { w: 60e6, s: 10e6, b: 20e6 };
const cellKey = (b: Box, c: number) => `${Math.floor((b.x0 + b.x1) / 2 / c)}_${Math.floor((b.z0 + b.z1) / 2 / c)}`;
/** An instanced mesh's size for smallCull: its model's radius at its largest instance's scale. */
export function spanOf(im: THREE.InstancedMesh) {
  const g = im.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const e = im.instanceMatrix.array as ArrayLike<number>;
  let s2 = 0;
  for (let i = 0; i + 15 < e.length; i += 16) s2 = Math.max(s2, e[i] * e[i] + e[i + 1] * e[i + 1] + e[i + 2] * e[i + 2], e[i + 4] * e[i + 4] + e[i + 5] * e[i + 5] + e[i + 6] * e[i + 6], e[i + 8] * e[i + 8] + e[i + 9] * e[i + 9] + e[i + 10] * e[i + 10]);
  return (g.boundingSphere?.radius ?? Infinity) * Math.sqrt(s2 || 1);
}
/** Grows a tile's extent (region coordinates, under its group) by an object's bounds: each mesh's bounding
 *  sphere — worked out now if three.js hasn't yet (it would the first frame the mesh is drawn) — placed by
 *  its matrices up to the tile's group. False for one it can't bound: that tile is never culled whole. */
function growBounds(box: THREE.Box3, root: THREE.Object3D, o: THREE.Object3D): boolean {
  let ok = true;
  o.traverse((m) => {
    const im = m as THREE.InstancedMesh, g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!ok || !g) return;
    let sp: THREE.Sphere | null;
    if (im.isInstancedMesh) {
      if (!im.count) return;
      if (!im.boundingSphere) im.computeBoundingSphere();
      sp = im.boundingSphere;
    } else {
      if (!g.attributes.position?.count) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      sp = g.boundingSphere;
    }
    if (!sp || !Number.isFinite(sp.radius) || sp.radius < 0) { ok = false; return; }
    _bs.copy(sp);
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) {
      if (p.matrixAutoUpdate) p.updateMatrix();
      _bs.applyMatrix4(p.matrix);
    }
    box.expandByPoint(_bv.set(_bs.center.x - _bs.radius, _bs.center.y - _bs.radius, _bs.center.z - _bs.radius));
    box.expandByPoint(_bv.set(_bs.center.x + _bs.radius, _bs.center.y + _bs.radius, _bs.center.z + _bs.radius));
  });
  return ok;
}
const _bs = new THREE.Sphere();
const _bv = new THREE.Vector3();
/** Vertex (and instance) data under a group, bytes — what it costs the GPU and the page, each. */
function vertexBytes(root: THREE.Object3D) {
  let n = 0;
  root.traverse((m) => {
    const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g?.attributes) {
      for (const k in g.attributes) n += (g.attributes[k] as THREE.BufferAttribute).array?.byteLength ?? 0;
      if (g.index) n += g.index.array.byteLength;
    }
    const im = m as THREE.InstancedMesh;
    if (im.isInstancedMesh) n += im.instanceMatrix.array.byteLength + (im.instanceColor?.array.byteLength ?? 0);
  });
  return n;
}
const LAMP_WIN = 2048; // m — the night light-map window around the walker
/** Repaint the lamp window now? At once when the walker nears its edge (`far`); for tiles' lamps
 *  coming and going (`dirty`), at most every 1.5 s — a flight mounts a tile every few seconds, and
 *  each repaint (a 1024² canvas and its upload) landed on top of the next mount's frame. */
export const lampRepaintDue = (now: number, last: number, dirty: boolean, far: boolean) => far || (dirty && now - last >= 1500);
const COARSE_BUDGET = 4; // max outstanding lite builds — they're lowest priority
const REVEAL_BYTES = 12e6; // vertex data a newly mounted tile shows (so uploads) per frame
const REVEAL_OBJS = 24; // …and meshes (each small one still costs its buffers and bindings)
const ID_STRIDE = 1 << 12; // building-id space per tile (window-fade keys, <2^24 total; synth cells raise the ord count)

export interface TileArt {
  spec: TileSpec;
  group: THREE.Group;
  scope: number;
  keys: string[]; // interior/plan keys
  fps: Footprint[];
  doors: Door[];
  walks: number[];
  poles: unknown[];
  churches: [number, number][];
  primRoads: Road[];
  tunnels?: Road[]; // underground roads (Road.tu) — the life sim's cars only
  areas: Area[];
  kerb?: Float32Array; // parked cars for kerbCars.ts
  micro?: Float32Array; // the small things, for the micro layer (world/microLayer.ts)
  crowd?: Float32Array; // the beach's people, for the crowd layer (world/crowdLayer.ts)
  junc?: Float32Array; // junction control for the life sim (src/sim/traffic.ts)
  flat?: boolean; // mounted without data still in flight (late DEM or LiDAR) — a relief rebuild will replace it
  vec?: boolean; // a stand-in built from the vector tiles: real streets and buildings (the skyline steps aside)
  xing?: number[]; // mapped crossings for the ground paint (kerbside.ts crossingPaint)
  bytes?: number; // its vertex data and sign atlas (a phone's budget: world/budget.ts)
  vp?: number[]; // viewpoints: x, z, bearing (−1 unknown)
  // a stand-in's footprints each in a collision scope of their own, so the copy of a real
  // neighbour's building can go on its own (seams.ts); and those gone so far
  fpScopes?: number[];
  hidden?: Set<number>;
}

// `replace`: a relief rebuild of an already-mounted flat cell — swapped in atomically.
interface Pending { spec: TileSpec; tile: BuiltTile; replace?: boolean; shaders?: string[] }

const boxDist2 = (b: Box, x: number, z: number) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx * dx + dz * dz;
};

type PavedItem = { ring: [number, number][] } | { seg: [number, number, number, number, number] };
type PavedIndex = Map<number, PavedItem[]>;
interface TileGrids { house: Map<number, number>; shop: Map<number, number>; city: Map<number, number>; paved: PavedIndex }
const UNPAVED = new Set(['footway', 'path', 'cycleway', 'steps', 'track', 'bridleway']);

const v3s = (flat: number[]) => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
  return out;
};

export class TileStream {
  loaded = new Map<string, TileArt>();
  plans = new Map<string, Plan>();
  fpByKey = new Map<string, Footprint>();
  fpDoor = new Map<Footprint, Door>();
  private fetching = new Map<string, Promise<Pending | null>>();
  private failed = new Map<string, number>(); // tile -> last failure time (retry backoff)
  private buildQueue: Pending[] = [];
  private mounting: Generator<void, void> | null = null; // a tile going in a step at a time (mountSteps)
  private mounted: (() => void) | null = null; // (a teleport waiting on its ground: told when `mounting` is done)
  private pin: { x: number; z: number } | null = null; // (a teleport's spot while its ground goes in: kept loaded)
  // Coarse tier: display-only tiles in [DROP_R, COARSE_R) — meshes rebuilt from lite builds,
  // no collision/interiors/plans. A tile entering the detail ring sheds its coarse mount.
  private coarseLoaded = new Map<string, { spec: TileSpec; group: THREE.Group; bytes: number }>();
  // the silhouette ring over its budget (streamParams.coarseMB): nothing past this is fetched until
  // the ring's back under ~70% of it (Midtown's stand-in towers were 175 MB of a phone's ring)
  private coarseCut = Infinity;
  private coarseBytes = 0;
  private px = 0;
  private pz = 0;
  private coarseFetching = new Map<string, Promise<Pending | null>>();
  private coarseQueue: Pending[] = [];
  private scopeSeq = 1;
  private dirty = true;
  private _fps: Footprint[] = [];
  private _doors: Door[] = [];
  private _poles: unknown[] = [];
  private _churches: [number, number][] = [];
  private _primRoads: Road[] = [];
  private _tunnels: Road[] = [];
  private _junc: Float32Array[] = [];
  // The tile worker: decode + mesh + collision run off-thread; jobs resolve with a BuiltTile.
  private worker: Worker | null = null;
  private workerDead = false;
  private seq = 0;
  private jobs = new Map<number, { res: (t: BuiltTile | null) => void; rej: (e: Error) => void }>();
  private jobFails = 0;
  // Night lamp light map: every mounted tile's lamp points painted into one window that
  // re-centres on the walker (LAMP_WIN m square), so pools light the streets everywhere.
  private lampPts = new Map<string, number[]>();
  private lampCx = Infinity;
  private lampCz = Infinity;
  private lampDirty = false;
  private lampAt = -Infinity; // when the window was last painted (performance.now)
  private lampCanvas: HTMLCanvasElement | null = null;
  private lampSprite: HTMLCanvasElement | null = null;
  private poolSprite: HTMLCanvasElement | null = null;
  // A new tile shows a few meshes a frame (REVEAL_BYTES): a downtown tile is ~100 MB of vertices,
  // and sending it all to the GPU in the frame it mounted stalled that frame 40–60 ms. What it
  // replaces (its stand-in, its silhouette, its flat first build) stays on screen until it's whole.
  private reveals: { group: THREE.Group; hidden: THREE.Object3D[]; retire: THREE.Group[] }[] = [];
  private sizes = new Map<string, number>(); // what each detail tile weighed when it was last built (the budget's estimates)
  private culled: THREE.Object3D[] = []; // frustum culling off for the frame they appear (see reveal)
  private culledPrev: THREE.Object3D[] = []; // …and back on a frame later: one mounted between frames is drawn too
  // a tile mounted whole (the spawn's own ground, a silhouette): its meshes drawn once each, a budget a
  // frame, so none waits to upload until the first time it comes into view (a turn of the head on
  // the shore was 265 meshes, 150 ms, at once)
  private uploadQ: THREE.Object3D[] = [];
  private mustDraw = new Set<THREE.Object3D>(); // (tiles with a mesh uploading this frame: never culled whole)
  private cullHidden: THREE.Object3D[] = [];
  private cullBox = new THREE.Box3();
  /** Where the last detail mount's time went, ms (tools/hitch-probe.js, soak). */
  lastMount: { id: string; collision: number; objects: number; retire: number; hooks: number } | null = null;
  private lampTex: THREE.CanvasTexture | null = null;
  private canyonCanvas: HTMLCanvasElement | null = null;
  private canyonBlur: HTMLCanvasElement | null = null;
  onChange: (() => void) | null = null;
  onTile: ((a: TileArt) => void) | null = null; // fired after a tile mounts (walks -> ground paint)
  onUnload: ((id: string) => void) | null = null; // fired after a detail tile unmounts

  /** Kill switch for the real-lite service (dead local worker → synth everywhere). */
  setTilesBase(v: string) { this.tilesBase = v; }
  /** Real tiles get LiDAR-measured buildings (lidar.ts) — this device reads the survey itself. Set before the first build. */
  lidar = true;
  /** Precomputed measurements apply (a baked pack's sidecar, the tile service's R2 records — it
   *  measures a streamed cell the first time anyone asks) — every tier. Set before the first build. */
  measured = true;
  /** Real US tiles get real roof colours off the NAIP aerial photo (aerialFetch.ts). Set before the first build. */
  aerial = true;
  /** A tile mounts once the shaders it draws with are built (render/warm.ts): a new variant compiled
   *  as it's first drawn froze the frame for a second or two on Windows. Null (the tests): at once. */
  warm: ShaderWarm | null = null;
  /** The far trees' detail the tile worker builds with (assets/flora.ts setFarDetail): a phone's −1. Set before the first build. */
  farDetail = 0;
  /** Recent tile-worker notes (LiDAR cells read/measured/failed) — also in the console. */
  readonly workerLog: string[] = [];

  // Manifest cells by cx_cz key + the procedural-cell cache: past the manifest's grid the
  // world is synthesised deterministically (synth.ts) — same BuiltTile pipeline after that.
  private byCell = new Map<string, TileSpec>();
  private synthSpecs = new Map<string, TileSpec>();
  private worldSpecs = new Map<string, TileSpec>(); // real-lite cells served by the tile worker
  private seed = 0;
  private synthOrd = 0; // fp-id base offset — starts at man.tiles.length so ids stay <2^24
  private queued = new Set<string>(); // ids sitting in buildQueue — gates the per-frame refetch
  // H2 DEM patches live per-CELL (s/w twins share identical bytes): keyed 'cx_cz' →
  // the mounted spec ids holding it, so the s→w swap can't yank terrain mid-stride.
  private demHolders = new Map<string, Set<string>>();
  private demCache = new Map<string, Promise<{ buf: ArrayBuffer; layout: LayerLayout } | null>>(); // main-thread fallback path only
  // Late-DEM relief: s-cells that mounted flat (4 s race lost) re-request a build that
  // awaits the real patch, then swap in place. id → attempts so far (bounded retries).
  private relief = new Map<string, number>();
  private reliefBusy = new Map<string, number>(); // id → when its rebuild was asked
  private reliefWant = new Map<string, TileSpec>(); // waiting for a slot (drainRelief)

  constructor(
    private base: string,
    private man: AtlasManifest,
    private terrain: Terrain,
    private walk: WalkWorld,
    private interiors: Interiors,
    private scene: THREE.Object3D, // the world root — tile groups join it under the floating origin
    private tilesBase = '', // real-lite tile service ('' = synth everywhere past the bake)
    private terrBin: ArrayBuffer | null = null, // terrain.bin bytes for virtual regions (no URL exists)
    private demEnabled = false, // H2: Terrarium patches for virtual cells (baked regions carry real terrain already)
  ) {
    const S = man.slice;
    void S;
    for (const t of man.tiles) this.byCell.set(t.id, t);
    terrain.baked = new Set(man.tiles.map((t) => t.id)); // baked cells never sample a neighbour's DEM overhang
    this.seed = regionSeed(man.id);
    this.synthOrd = man.tiles.length;
  }

  // The spec for cell (cx,cz): the baked tile if the manifest has it, else a real-lite
  // tile when a tile service is configured, else a synthetic one.
  private specAt(cx: number, cz: number): TileSpec {
    const key = `${cx}_${cz}`;
    const baked = this.byCell.get(key);
    if (baked) return baked;
    if (this.tilesBase) {
      let w = this.worldSpecs.get(key);
      if (!w) {
        const c = this.man.cell;
        // file is an absolute URL — the tile worker fetches it directly (no base prefix).
        // &v=25 — the edge Cache API keys on the full URL; bumping alongside the
        // worker's R2 key (t/v25) retires stale tile payloads.
        const file = this.tilesBase === 'direct' ? `direct:${key}` : `${this.tilesBase}/tile/${key}.json?olat=${this.man.origin.lat}&olon=${this.man.origin.lon}&v=25`;
        w = { id: 'w' + key, box: { x0: cx * c, z0: cz * c, x1: cx * c + c, z1: cz * c + c }, lod: 0, file, world: 1 };
        this.worldSpecs.set(key, w);
      }
      return w;
    }
    return this.synthSpec(cx, cz);
  }

  // The deterministic placeholder twin of a real-lite cell (or the whole world offline).
  private synthSpec(cx: number, cz: number): TileSpec {
    const key = `${cx}_${cz}`;
    let s = this.synthSpecs.get(key);
    if (!s) {
      const c = this.man.cell;
      s = { id: 's' + key, box: { x0: cx * c, z0: cz * c, x1: cx * c + c, z1: cz * c + c }, lod: 0, file: '', synth: 1 };
      this.synthSpecs.set(key, s);
    }
    return s;
  }

  private ordOf(t: TileSpec) {
    const i = this.man.tiles.indexOf(t);
    if (i >= 0) return i;
    // Cell-derived so ids are identical every session; hash collisions across synth cells
    // only ever share a window-pattern key — cosmetic, never structural.
    const c = this.man.cell, cx = Math.floor(t.box.x0 / c), cz = Math.floor(t.box.z0 / c);
    return this.synthOrd + ((Math.imul(cx, 331) ^ Math.imul(cz, 577)) >>> 0) % 2048;
  }

  private markDirty() {
    this.dirty = true;
    this.onChange?.();
  }

  private rebuild() {
    const all = [...this.loaded.values()];
    this._fps = all.flatMap((a) => a.fps);
    this._doors = all.flatMap((a) => a.doors);
    this._poles = all.flatMap((a) => a.poles);
    this._churches = all.flatMap((a) => a.churches);
    this._primRoads = all.flatMap((a) => a.primRoads);
    this._tunnels = all.flatMap((a) => a.tunnels ?? []);
    this._junc = all.flatMap((a) => (a.junc ? [a.junc] : []));
    this.dirty = false;
  }
  private sync() { if (this.dirty) this.rebuild(); }
  get footprints() { this.sync(); return this._fps; }
  get doors() { this.sync(); return this._doors; }
  get poles() { this.sync(); return this._poles; }
  get churches() { this.sync(); return this._churches; }
  get primRoads() { this.sync(); return this._primRoads; }
  /** Every mounted tile's tunnels (Road.tu): the cars dive into them; nothing else sees them. */
  get tunnels() { this.sync(); return this._tunnels; }
  /** Every mounted tile's junction-control records (each junction ships with the tile that owns it). */
  get junctions() { this.sync(); return this._junc; }
  /** The coarse ring's mounted cells (display-only lite builds). */
  get coarseSpecs(): TileSpec[] { return [...this.coarseLoaded.values()].map((c) => c.spec); }
  get busy() { return this.fetching.size > 0 || this.buildQueue.length > 0 || this.coarseFetching.size > 0 || this.coarseQueue.length > 0 || !!this.mounting; }
  // Fired once a detail tile is fully mounted (visual + collision). main.ts uses it to
  // re-settle the walker when a real tile replaces the synth placeholder underfoot.
  onMount?: (spec: TileSpec | null) => void;
  // w-* cells still on the wire — drives the "the real streets are painting in" toast.
  get worldPending() {
    let n = 0;
    for (const id of this.fetching.keys()) if (id[0] === 'w') n++;
    for (const id of this.queued) if (id[0] === 'w') n++;
    return n;
  }
  doorOf(fp: Footprint) { return this.fpDoor.get(fp); }
  /** A detail tile stands under (x, z): its walls and footprints are in the walk world. Past the ring
   *  (a flight faster than a phone builds tiles) the buildings are silhouettes with neither. */
  solidAt(x: number, z: number) {
    for (const a of this.loaded.values()) { const b = a.spec.box; if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return true; }
    return false;
  }

  // The walker's neighbourhood grids (houses, shops, built volume, paved ground) are summed from
  // each tile's own, worked out once when the tile first counts: rebuilding them from every
  // footprint and street segment in the ring on each mount was 15–25 ms, several times a
  // minute on a drive (the Seattle hitch).
  private grids = new WeakMap<TileArt, TileGrids>();
  private gridsOf(a: TileArt): TileGrids {
    let g = this.grids.get(a);
    if (g) return g;
    const house = new Map<number, number>(), shop = new Map<number, number>(), city = new Map<number, number>();
    for (const f of a.fps) {
      const r = f.ring, k = Math.floor(r[0][0] / 80) * 92821 + Math.floor(r[0][1] / 80);
      if (f.kind === 'house') house.set(k, (house.get(k) ?? 0) + 1);
      if (f.kind === 'commercial') shop.set(k, (shop.get(k) ?? 0) + 1);
      let ar = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) ar += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
      city.set(k, (city.get(k) ?? 0) + Math.abs(ar / 2) * Math.max(0, f.top - f.base));
    }
    const paved: PavedIndex = new Map();
    const add = (x0: number, z0: number, x1: number, z1: number, it: PavedItem) => {
      for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++)
        for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
          const k = i * 92821 + j;
          (paved.get(k) ?? paved.set(k, []).get(k)!).push(it);
        }
    };
    for (const ar of a.areas) {
      if (ar.c !== 'parking' && ar.c !== 'plaza') continue;
      const o = ar.o[0];
      if (!o || o.length < 6) continue;
      const ring: [number, number][] = [];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i + 1 < o.length; i += 2) { const x = o[i] / 10, z = o[i + 1] / 10; ring.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      add(x0, z0, x1, z1, { ring });
    }
    for (const r of a.primRoads) {
      if (r.lod || !r.w || UNPAVED.has(r.c)) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, hw = r.w / 2 + 0.5;
        add(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, { seg: [ax, az, bx, bz, hw] });
      }
    }
    g = { house, shop, city, paved };
    this.grids.set(a, g);
    return g;
  }
  private sumGrid(pick: (g: TileGrids) => Map<number, number>) {
    const m = new Map<number, number>();
    for (const a of this.loaded.values()) for (const [k, v] of pick(this.gridsOf(a))) m.set(k, (m.get(k) ?? 0) + v);
    return m;
  }
  /** Houses per 80 m cell. */
  houseGrid() { return this.sumGrid((g) => g.house); }
  /** Shops and offices per 80 m cell — where a town's main street is. */
  shopGrid() { return this.sumGrid((g) => g.shop); }
  /** Paved open ground by 40 m cell: parking lots and plazas (rings) and carriageways (segments
   *  with their half width) — where wildlife doesn't graze. */
  pavedIndex() {
    const idx: PavedIndex = new Map();
    for (const a of this.loaded.values())
      for (const [k, l] of this.gridsOf(a).paved) {
        const into = idx.get(k);
        if (into) for (const it of l) into.push(it);
        else idx.set(k, l.slice());
      }
    return idx;
  }
  /** Built volume per 80 m cell (Σ footprint area × height) — how much city stands around you. */
  cityGrid() { return this.sumGrid((g) => g.city); }

  // Load every tile within r of (x,z) now — used during startup so the spawn area is solid.
  // Covers synthetic cells too, so a teleport/respawn past the bake isn't born in a void.
  /** The cells round (x, z) mounted — their stand-ins at least — before it resolves. `spread` (a teleport
   *  in the running game): they go in a step at a time, 20 ms a frame, while you're still where you were —
   *  all at once they were the frame you arrived in, 0.65 s of it on a phone (CPU 4×); the spot is kept
   *  loaded meanwhile. At boot (no frames yet) all at once. */
  async ensureAround(x: number, z: number, r = streamParams.loadR, spread = false) {
    this.pumpMount(Infinity); // (a tile part-way in finishes first: the spawn's own may be it)
    const c = this.man.cell;
    const wanted: TileSpec[] = [];
    for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++)
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        const t = this.specAt(cx, cz);
        if (boxDist2(t.box, x, z) < r * r) {
          wanted.push(t);
          if (t.world) wanted.push(this.synthSpec(cx, cz)); // placeholder twin — mounts now, upgrades later
        }
      }
    // Baked and synth tiles resolve instantly — the spawn waits on those. Real-lite cells
    // stream in behind their synth twins; blocking spawn on Overpass is exactly the
    // cold-remote-tile wait the placeholder exists to avoid.
    const pends = await Promise.all(wanted.map((t) => (t.world ? Promise.resolve(null) : this.fetch(t))));
    if (this.warm) await Promise.all(pends.map((p) => p && this.warm!.whenReady(p.tile.objs)));
    this.pumpMount(Infinity); // (one begun while we waited, whole first: it may be one of these)
    if (!spread) for (const p of pends) this.mount(p, false); // (the spawn's own ground: all at once)
    else {
      const pin = { x, z }, self = this;
      this.pin = pin;
      try {
        await new Promise<void>((done) => {
          this.mounting = (function* () { for (const p of pends) yield* self.mountSteps(p, false); })();
          this.mounted = done;
        });
        // …and their meshes on the GPU before you're stood among them (the upload budget doubled while
        // you wait): the frame you arrived in uploaded what the queue hadn't yet — 412 meshes, half a
        // second on a phone. At most 2.5 s more.
        const groups = new Set(pends.map((p) => (p ? this.loaded.get(p.spec.id)?.group : undefined)).filter((g): g is THREE.Group => !!g));
        const waiting = () => this.uploadQ.some((m) => { let g = m.parent; while (g && g.parent !== this.scene) g = g.parent; return !!g && groups.has(g as THREE.Group); });
        const t0 = performance.now();
        while (performance.now() - t0 < 2500 && waiting()) await new Promise((res) => requestAnimationFrame(() => res(null)));
      } finally {
        if (this.pin === pin) this.pin = null;
      }
    }
    // (a phone's budget leaves the real tiles to update(): nearest first, a couple at a time, only
    // those that fit — a teleport into Midtown had every cell of the ring built at once)
    if (!streamParams.budgetMB) for (const t of wanted) if (t.world) void this.fetch(t).then((p) => { if (p) { this.queued.add(t.id); this.buildQueue.push(p); } });
  }

  /** (a phone) The detail cells its budget keeps round (x, z), nearest first (world/budget.ts). */
  private admitted(x: number, z: number, R: number) {
    const c = this.man.cell;
    // what a tile not built yet will weigh: the mean of those built here, of its kind
    const sum = { w: 0, s: 0, b: 0 }, n = { w: 0, s: 0, b: 0 };
    for (const a of this.loaded.values()) {
      const k = a.spec.world ? 'w' : a.spec.synth ? 's' : 'b';
      if (a.bytes) (sum[k] += a.bytes), n[k]++;
    }
    const est = (k: 'w' | 's' | 'b') => (n[k] ? sum[k] / n[k] : EST[k]);
    const cells: BudgetCell[] = [];
    for (let cz = Math.floor((z - R) / c); cz <= Math.floor((z + R) / c); cz++)
      for (let cx = Math.floor((x - R) / c); cx <= Math.floor((x + R) / c); cx++) {
        const t = this.specAt(cx, cz), d2 = boxDist2(t.box, x, z);
        if (d2 >= R * R) continue;
        const a = this.loaded.get(t.id), twin = t.world ? 's' + t.id.slice(1) : '';
        // (a real cell weighs what its real tile will, whatever its stand-in does meanwhile)
        const bytes = a?.bytes ?? this.sizes.get(t.id) ?? est(t.world ? 'w' : t.synth ? 's' : 'b');
        const loaded = !!a || this.fetching.has(t.id) || this.queued.has(t.id) || (!!twin && this.loaded.has(twin));
        cells.push({ key: `${cx}_${cz}`, d: Math.sqrt(d2), bytes, loaded });
      }
    return admitCells(cells, streamParams.budgetMB * 1e6);
  }
  /** The detail tiles' vertex data now, bytes (the budget's measure; tools read it). */
  get detailBytes() { let n = 0; for (const a of this.loaded.values()) n += a.bytes ?? 0; return n; }

  // Per-frame: kick fetches for wanted tiles (detail ring first, then the coarse silhouette
  // ring under a small budget), mount at most one finished tile of each tier, drop far ones.
  update(x: number, z: number) {
    const { loadR: LOAD_R, dropR: DROP_R, coarseR: COARSE_R } = streamParams;
    this.px = x;
    this.pz = z;
    if (this.coarseCut < Infinity && this.coarseBytes < streamParams.coarseMB * 1e6 * 0.7) this.coarseCut = Infinity;
    this.reveal();
    this.cullSmall(x, z);
    this.walk.purgeSome(); // (unloaded tiles' walls, ~1.5 ms a frame until they're gone)
    this.freeTick(2); // (…and their meshes)
    const now = performance.now();
    const gy = Math.max(0, this.terrain.heightAt(x, z));
    if (Number.isFinite(gy)) U.uLampBaseY.value = Number.isFinite(U.uLampBaseY.value) ? U.uLampBaseY.value + (gy - U.uLampBaseY.value) * 0.05 : gy;
    if (this.lampPts.size && lampRepaintDue(now, this.lampAt, this.lampDirty, Math.hypot(x - this.lampCx, z - this.lampCz) > LAMP_WIN * 0.25)) {
      this.lampAt = now;
      this.repaintLamps(x, z);
    }
    // Cells in the coarse ring — manifest tiles where baked, synthetic where not. Iterating
    // cells rather than man.tiles is what makes the world continue past the bake.
    const c = this.man.cell;
    const cx0 = Math.floor((x - COARSE_R) / c), cx1 = Math.floor((x + COARSE_R) / c);
    const cz0 = Math.floor((z - COARSE_R) / c), cz1 = Math.floor((z + COARSE_R) / c);
    const wantW: [number, TileSpec][] = [];
    // (a phone: the detail cells its budget keeps — a PC keeps every cell of the ring)
    const admitted = streamParams.budgetMB > 0 ? this.admitted(x, z, LOAD_R) : null;
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const t = this.specAt(cx, cz);
        const d2 = boxDist2(t.box, x, z);
        if (d2 < LOAD_R * LOAD_R && (!admitted || admitted.has(`${cx}_${cz}`))) {
          // Real-lite cells stream their synth placeholder twin alongside — it mounts
          // instantly and the worker tile swaps in over it when it lands. Failed real
          // fetches just retry later under the same backoff while the synth holds.
          // Real cells queue by distance (below): the tile service fans out to Overpass,
          // which rate-limits per client — a dozen parallel cold cells all time out together.
          const specs = t.world ? (this.loaded.has(t.id) ? [] : [this.synthSpec(cx, cz)]) : [t];
          if (t.world && !this.loaded.has(t.id) && !this.fetching.has(t.id) && !this.queued.has(t.id) && now - (this.failed.get(t.id) ?? -30000) > 10000) wantW.push([d2, t]);
          for (const sp of specs)
            if (!this.loaded.has(sp.id) && !this.fetching.has(sp.id) && !this.queued.has(sp.id) && now - (this.failed.get(sp.id) ?? -30000) > 10000) void this.fetch(sp).then((p) => { if (p) { this.queued.add(sp.id); this.buildQueue.push(p); } });
        } else {
          // (a cell in the ring past a phone's budget goes back to its silhouette, stand-in and all)
          if (admitted && d2 < LOAD_R * LOAD_R) {
            if (this.loaded.has(t.id)) this.unload(t.id);
            if (t.world) { const sid = 's' + t.id.slice(1); if (this.loaded.has(sid)) this.unload(sid); }
          }
          if (d2 > DROP_R * DROP_R && this.loaded.has(t.id)) this.unload(t.id);
          if (t.world) { const sid = 's' + t.id.slice(1); if (d2 > DROP_R * DROP_R && this.loaded.has(sid)) this.unload(sid); }
          // Silhouettes fill the [LOAD_R, COARSE_R) band (and a phone's cells past its budget) —
          // without this, cells between LOAD_R and DROP_R were a dead zone that neither tier ever
          // fetched. They stay synth even under a tile service: cheap, local, and a distant cell
          // isn't worth an Overpass query.
          if (d2 < COARSE_R * COARSE_R && d2 < this.coarseCut * this.coarseCut) {
            const cs = t.world ? this.synthSpec(cx, cz) : t;
            if (!this.loaded.has(t.id) && !this.loaded.has(cs.id) && !this.coarseLoaded.has(cs.id) && !this.coarseFetching.has(cs.id) && !this.queued.has('c' + cs.id) && !this.queued.has(cs.id) && this.coarseFetching.size < COARSE_BUDGET && now - (this.failed.get('c' + cs.id) ?? -30000) > 10000) void this.fetchCoarse(cs).then((p) => { if (p) { this.queued.add('c' + cs.id); this.coarseQueue.push(p); } });
          } else if (d2 >= COARSE_R * COARSE_R) {
            if (this.coarseLoaded.has(t.id)) this.unloadCoarse(t.id);
            if (t.world) { const sid = 's' + t.id.slice(1); if (this.coarseLoaded.has(sid)) this.unloadCoarse(sid); }
          }
        }
      }
    // Real-lite cells: nearest first, a few at a time.
    if (wantW.length) {
      let inflight = 0;
      for (const id of this.fetching.keys()) if (id[0] === 'w') inflight++;
      wantW.sort((a, b) => a[0] - b[0]);
      for (const [, sp] of wantW) {
        if (inflight >= streamParams.realConc) break;
        inflight++;
        void this.fetch(sp).then((p) => { if (p) { this.queued.add(sp.id); this.buildQueue.push(p); } });
      }
    }
    this.drainRelief(x, z);
    // Cells outside the iteration window aren't visited above — sweep mounts so tiles left
    // behind the corner of the box unload the same way the old manifest-wide loop did.
    const pinned = (b: Box) => !!this.pin && boxDist2(b, this.pin.x, this.pin.z) <= DROP_R * DROP_R;
    // (a few a frame: after a teleport the whole of the old place — its ring and two hundred silhouettes —
    // went in the frame you arrived in, thousands of meshes freed at once)
    let drops = 3, coarseDrops = 12;
    for (const [id, a] of [...this.loaded]) if (drops > 0 && boxDist2(a.spec.box, x, z) > DROP_R * DROP_R && !pinned(a.spec.box)) this.unload(id), drops--;
    for (const [id, a] of [...this.coarseLoaded]) if (coarseDrops > 0 && boxDist2(a.spec.box, x, z) > COARSE_R * COARSE_R) this.unloadCoarse(id), coarseDrops--;
    // a tile part-way in: a few ms more of it (a teleport's ground, more), and nothing new until it's whole
    if (this.mounting) this.pumpMount(this.mounted ? 20 : streamParams.mountMs);
    else if (this.buildQueue.length) {
      this.buildQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const i = this.nextReady(this.buildQueue);
      if (i >= 0) {
        const p = this.buildQueue.splice(i, 1)[0];
        this.queued.delete(p.spec.id);
        if (boxDist2(p.spec.box, x, z) < DROP_R * DROP_R && (!admitted || admitted.has(cellKey(p.spec.box, c)))) {
          // (a relief swap unloads the flat copy first: it lands whole, in this frame)
          if (p.replace) this.mount(p);
          else { this.mounting = this.mountSteps(p); this.pumpMount(streamParams.mountMs); }
        }
      }
    }
    if (this.coarseQueue.length) {
      this.coarseQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const i = this.nextReady(this.coarseQueue);
      if (i >= 0) {
        const p = this.coarseQueue.splice(i, 1)[0];
        this.queued.delete('c' + p.spec.id);
        if (boxDist2(p.spec.box, x, z) < COARSE_R * COARSE_R) this.mountCoarse(p);
      }
    }
  }

  /** Each tile wholly outside a camera's frustum hidden for that one render (main.ts: the scene's
   *  onBeforeRender, `off` the world's offset) — three.js then never walks it object by object, a fifth
   *  of a city's frame for the shadow pass and the view each — and shown again after (uncullTiles). A tile
   *  with a mesh uploading this frame is drawn whatever (reveal). */
  cullTiles(frustum: THREE.Frustum, off: THREE.Vector3) {
    this.uncullTiles(); // (a render that threw never showed its own again)
    const test = (g: THREE.Group) => {
      const b = g.userData.bounds as THREE.Box3 | undefined;
      if (!b || !g.visible || this.mustDraw.has(g)) return;
      if (frustum.intersectsBox(this.cullBox.copy(b).translate(off))) return;
      g.visible = false;
      this.cullHidden.push(g);
    };
    for (const a of this.loaded.values()) test(a.group);
    for (const c of this.coarseLoaded.values()) test(c.group);
  }
  uncullTiles() {
    for (const g of this.cullHidden) g.visible = true;
    this.cullHidden.length = 0;
  }

  /** The far tiles' small things out of the frame (streamParams.smallCull): each instanced mesh past its
   *  own size × smallCull from you, by its tile's nearest edge, is on no layer (drawn by no camera);
   *  back as you come. A half-second's pass, or each 15 m walked. */
  private cullT = 0;
  private cullAt: [number, number] = [Infinity, Infinity];
  private cullSmall(x: number, z: number) {
    const now = performance.now();
    if (now - this.cullT < 500 && Math.hypot(x - this.cullAt[0], z - this.cullAt[1]) < 15) return;
    this.cullT = now;
    this.cullAt = [x, z];
    const k = streamParams.smallCull;
    for (const a of this.loaded.values()) {
      const d = Math.sqrt(boxDist2(a.spec.box, x, z));
      for (const o of a.group.children) {
        const span = o.userData.span as number | undefined;
        if (span === undefined) continue;
        const far = k > 0 && d > span * k;
        if (far === !!o.userData.culled) continue;
        if (far) (o.userData.mask = o.layers.mask), (o.layers.mask = 0);
        else o.layers.mask = o.userData.mask;
        o.userData.culled = far;
      }
    }
  }

  /** Runs the tile mounting for `ms` (Infinity: to the end). */
  private pumpMount(ms: number) {
    const t0 = performance.now();
    while (this.mounting) {
      if (this.mounting.next().done) {
        this.mounting = null;
        const m = this.mounted;
        this.mounted = null;
        m?.();
      } else if (performance.now() - t0 >= ms) return;
    }
  }

  /** The nearest queued tile whose shaders are built (render/warm.ts), or -1; the others' start
   *  compiling now, off the main thread, so they're ready by their turn. */
  private nextReady(q: Pending[]) {
    if (!this.warm) return 0;
    let pick = -1;
    for (let i = 0; i < q.length; i++) {
      const p = q[i];
      p.shaders = p.shaders ? this.warm.pending(p.shaders) : this.warm.prepare(p.tile.objs);
      if (pick < 0 && !p.shaders.length) pick = i;
    }
    return pick;
  }

  private spawn() {
    try {
      const w = new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const m = e.data;
        if (m.kind === 'log') {
          // worker-side notes (LiDAR reads): the page console + a short ring for tools/debug
          console.info(m.msg);
          this.workerLog.push(m.msg);
          if (this.workerLog.length > 400) this.workerLog.shift();
          return;
        }
        const j = this.jobs.get(m.id);
        if (!j) return;
        this.jobs.delete(m.id);
        if (m.kind === 'built') {
          this.jobFails = 0;
          j.res(m.tile);
        } else {
          j.rej(new Error(m.message ?? 'tile build failed'));
          // Repeated build failures mean the worker lacks a capability (e.g. OffscreenCanvas
          // on older iOS) — every tile would retry forever otherwise. Fall back to in-page.
          // Fetch failures (tile service down, rate-limited) aren't the worker's fault: the
          // in-page path would fetch the same URL — they retry via the failed-tile backoff.
          if (!m.net && ++this.jobFails >= 3 && !this.workerDead) {
            this.workerDead = true;
            this.worker?.terminate();
            this.worker = null;
            const rest = [...this.jobs.values()];
            this.jobs.clear();
            for (const jj of rest) jj.rej(new Error('tile worker disabled'));
            console.warn('tile worker builds keep failing; building in-page from now on');
          }
        }
      };
      w.onerror = (e) => {
        // Hard crash (OOM/uncaught): in-flight jobs would never resolve — reject them and
        // fall back to in-page builds so no tile load hangs forever.
        const jobs = [...this.jobs.values()];
        this.jobs.clear();
        for (const j of jobs) j.rej(new Error('tile worker died'));
        this.worker = null;
        this.workerDead = true;
        console.warn('tile worker failed; building in-page from now on', e.message);
      };
      // Worker fetches resolve against its own module URL — hand it an absolute base.
      // Virtual regions (the ?at= open world) carry their terrain bytes in-band: there is
      // no terrain.bin URL to fetch, so the same buffer the page uses is passed here.
      // LiDAR gets its own worker, wired straight to the tile worker (no main-thread hop).
      let lidarPort: MessagePort | undefined;
      if (this.lidar) {
        try {
          const lw = new Worker(new URL('./lidar.worker.ts', import.meta.url), { type: 'module' });
          const ch = new MessageChannel();
          lw.postMessage({ kind: 'port', port: ch.port2 }, [ch.port2]);
          lidarPort = ch.port1;
        } catch (e) {
          console.warn('lidar worker unavailable; measuring on the tile worker', e);
        }
      }
      w.postMessage({ kind: 'init', base: new URL(this.base, location.href).href, cell: this.man.cell, fp: manifestFingerprint(this.man), seed: this.seed, bin: this.terrBin, origin: this.man.origin, dem: this.demEnabled, demBase: this.tilesBase, style: activeStyle().key, baked: this.man.tiles.map((t) => t.id), lidar: this.lidar, measured: this.measured, farDetail: this.farDetail, measuredBase: this.tilesBase === 'direct' ? '' : this.tilesBase, lidarPort, fail: new URLSearchParams(location.search).get('fail')?.split(',') ?? [], vector: new URLSearchParams(location.search).get('vector') !== '0', date: new URLSearchParams(location.search).get('date') }, lidarPort ? [lidarPort] : []);
      // where roof colours come from (aerial.ts): the pack's aerial samples, the streamed cells' photos
      w.postMessage({ kind: 'roofs', painted: roofSource() === 'painted', aerial: this.aerial, relay: this.tilesBase });
      this.worker = w;
    } catch {
      this.workerDead = true;
    }
  }

  // null only for relief builds whose DEM never arrived (nothing to swap).
  private build(t: TileSpec, ord: number, lite = false, relief = false): Promise<BuiltTile | null> {
    if (!this.worker && !this.workerDead) this.spawn();
    if (this.worker) {
      const id = ++this.seq;
      return new Promise((res, rej) => {
        this.jobs.set(id, { res, rej });
        this.worker!.postMessage({ kind: 'build', id, spec: t, idBase: ord * ID_STRIDE, lite, relief, terr: this.man.terrain?.slice ? this.man.terrain : undefined });
      });
    }
    // No worker support: the same pipeline on the main thread.
    const cellKey = t.id.slice(1);
    if (this.demEnabled && this.tilesBase) setDemBase(this.tilesBase);
    let demP: Promise<{ buf: ArrayBuffer; layout: LayerLayout } | null> | null = null;
    if (this.demEnabled && (t.synth || t.world)) {
      demP = this.demCache.get(cellKey) ?? null;
      if (!demP) {
        const p = fetchDem(t.box, this.man.origin).then((d) => (d ? demLayer(d) : null));
        this.demCache.set(cellKey, (demP = p));
        void p.then((d) => { if (!d && this.demCache.get(cellKey) === p) this.demCache.delete(cellKey); }); // failures retry
      }
    }
    if (relief) {
      const dp = demP;
      return (dp ? dp : Promise.resolve(null)).then((d) => (d ? this.build(t, ord, lite, false).then((tile) => (tile && !tile.dem ? null : tile)) : null));
    }
    const src: Promise<TileJson | null> = t.synth
      ? Promise.resolve(null)
      : t.world
        ? (cachedFetchJson(t.file) as Promise<TileJson>)
        : loadTile(this.base, t);
    return src
      .then(async (tj0) => {
        const dem = demP ? (t.synth ? await raceNull(demP, lite ? 20000 : 4000) : await demP) : null;
        const late = !!(demP && !dem && t.synth && !lite);
        if (dem) this.terrain.registerPatch(cellKey, new TerrainLayer(dem.buf.slice(0), dem.layout));
        const syn = t.synth ? synthTile(t, this.seed, this.terrain) : null;
        const tj = tj0 ?? syn!.tj;
        const tl = lite || syn || t.world ? null : await loadTileTerrain(this.base, t);
        const tile = await buildTile(tj, this.terrain, t, ord * ID_STRIDE, lite);
        if (syn) tile.objs.push(...packGroup(syn.extra));
        else if (t.world) tile.objs.push(...packGroup(realExtras(tj, this.terrain)));
        tile.terr = tl ? (tl.height.buffer as ArrayBuffer) : undefined;
        tile.dem = dem ? { buf: dem.buf.slice(0), layout: dem.layout } : undefined; // cached buf is shared by twins — ship a copy
        if (late) tile.late = 1;
        return tile;
      });
  }

  private fetch(t: TileSpec): Promise<Pending | null> {
    let p = this.fetching.get(t.id);
    if (!p) {
      p = this.build(t, this.ordOf(t))
        .then((tile): Pending | null => (tile ? { spec: t, tile } : null))
        .catch((e) => { this.failed.set(t.id, performance.now()); console.warn('tile load failed', t.id, e); return null; })
        .finally(() => this.fetching.delete(t.id));
      this.fetching.set(t.id, p);
    }
    return p;
  }

  private fetchCoarse(t: TileSpec): Promise<Pending | null> {
    let p = this.coarseFetching.get(t.id);
    if (!p) {
      p = this.build(t, this.ordOf(t), true)
        .then((tile): Pending | null => (tile ? { spec: t, tile } : null))
        .catch((e) => { this.failed.set('c' + t.id, performance.now()); console.warn('coarse tile load failed', t.id, e); return null; })
        .finally(() => this.coarseFetching.delete(t.id));
      this.coarseFetching.set(t.id, p);
    }
    return p;
  }

  // Relief: a cell mounted without data still in flight asks the builder for the finished
  // version — a synth cell its DEM (real heights), a real cell its LiDAR measurement. The
  // worker awaits the untimed read (shared with twins via its caches); if none ever comes
  // the first mount simply stays, retried a couple of times with backoff.
  // A relief waits its turn (drainRelief): it is a whole rebuild of the cell, and a city's ring
  // asked for all fourteen at once — they shared the one builder with the cells not yet up at all,
  // so Chicago's last real cell came at 123 s, and reliefs ran 110 s and stalled out.
  private relieve(spec: TileSpec) {
    if (this.reliefBusy.has(spec.id) || (this.relief.get(spec.id) ?? 0) >= 3) return;
    this.reliefWant.set(spec.id, spec);
  }

  /** Per frame: start the waiting reliefs, nearest first, up to `reliefConc` at a time — a stand-in's
   *  ground (its DEM) whenever there's a slot, a real cell's measurements and roof colours only
   *  while no cell of the ring is still on its first build. (A rebuild stuck on a read for a
   *  minute keeps running but frees its slot.) */
  private drainRelief(x: number, z: number) {
    if (!this.reliefWant.size) return;
    const now = performance.now();
    let busy = 0;
    for (const t of this.reliefBusy.values()) if (now - t < 60000) busy++;
    if (busy >= streamParams.reliefConc) return;
    let firsts = this.buildQueue.some((p) => !p.replace);
    for (const id of this.fetching.keys()) if (id[0] === 'w' || id[0] === 's') firsts = true;
    const ready = [...this.reliefWant.values()]
      .filter((s) => { if (this.loaded.get(s.id)?.flat) return true; this.reliefWant.delete(s.id); return false; })
      .filter((s) => !s.world || !firsts)
      .sort((a, b) => boxDist2(a.box, x, z) - boxDist2(b.box, x, z));
    for (const s of ready.slice(0, streamParams.reliefConc - busy)) {
      this.reliefWant.delete(s.id);
      this.startRelief(s);
    }
  }

  private startRelief(spec: TileSpec) {
    const id = spec.id;
    const n = this.relief.get(id) ?? 0;
    this.relief.set(id, n + 1);
    this.reliefBusy.set(id, performance.now());
    this.build(spec, this.ordOf(spec), false, true)
      .then((tile) => {
        const cur = this.loaded.get(id);
        if (!cur?.flat) return; // unloaded, or its real twin already won the cell
        if (tile) {
          this.queued.add(id);
          this.buildQueue.push({ spec, tile, replace: true });
        } else setTimeout(() => { if (this.loaded.get(id)?.flat) this.relieve(spec); }, 12000 * (n + 1));
      })
      .catch((e) => {
        console.warn('relief build failed', id, e);
        setTimeout(() => { if (this.loaded.get(id)?.flat) this.relieve(spec); }, 12000 * (n + 1));
      })
      .finally(() => this.reliefBusy.delete(id));
  }

  private mount(p: Pending | null, staged = true) {
    const steps = this.mountSteps(p, staged);
    while (!steps.next().done);
  }
  /** A tile's mount a step at a time (update() pumps it a few ms a frame, render/quality.ts): its
   *  collision — some 20,000 walls a streamed cell, 60–90 ms on a phone in one go — then its meshes;
   *  then, in one step, it goes on screen and into the world's lists. */
  private *mountSteps(p: Pending | null, staged = true): Generator<void, void> {
    if (!p) return;
    if (p.spec.synth && this.loaded.has('w' + p.spec.id.slice(1))) return; // its real-lite twin already won the cell
    const retire: THREE.Group[] | undefined = staged ? [] : undefined; // what this tile replaces, on screen until it's whole
    if (p.replace) {
      // Relief swap: only while the flat version is still what's mounted. Unloading first
      // is required (fp/interior keys are `${id}:${i}` — identical across the two builds)
      // and safe: both happen inside this one synchronous call, so no frame ever renders
      // or collides against an empty cell.
      if (!this.loaded.get(p.spec.id)?.flat) return;
      this.unload(p.spec.id, retire);
    } else if (this.loaded.has(p.spec.id)) return;
    const { spec, tile } = p;
    const scope = this.scopeSeq++;
    const w = this.walk;
    const keys: string[] = [], fpKeys: string[] = [], fpList: Footprint[] = [], fpScopes: number[] = [];
    const tl = tile.terr && spec.terrain ? new TerrainLayer(tile.terr, spec.terrain.layout) : null;
    if (tl) this.terrain.registerPatch(spec.id, tl);
    if (tile.dem) {
      const cell = spec.id.slice(1); // strip the s/w prefix — DEM patches key on the cell
      let holders = this.demHolders.get(cell);
      // The real cell's ground always takes over from its stand-in's: 4 m, its streets graded, the
      // map's water pressed in — the stand-in's is a 16 m placeholder. (Kept, it left the walker and
      // the traffic on ungraded ground while the street you saw was cut into the hill beside them:
      // "the cars are going through the roads".) A stand-in arriving after its real twin leaves it.
      if (!holders || (spec.world && tile.dem.layout.grid.cell <= this.terrain.patchPitch(cell))) this.terrain.registerPatch(cell, new TerrainLayer(tile.dem.buf, tile.dem.layout));
      if (!holders) this.demHolders.set(cell, (holders = new Set()));
      holders.add(spec.id);
    }
    // the time each part took, not counting the frames between its steps
    const spent = { collision: 0, objects: 0 };
    let at = performance.now(), part: keyof typeof spent = 'collision';
    const lap = () => { const n = performance.now(); spent[part] += n - at; at = n; };
    // (the tile's scope closed between steps: whatever registers in the frames between — an
    // interior's partitions, a parked car driven off — never lands in it)
    const pause = function* () { w.endScope(); lap(); yield; at = performance.now(); w.beginScope(scope); };
    w.beginScope(scope);
    try {
      // Builder-emitted collision (bridge/pier decks, poles, fences, parked cars) replays first —
      // the same order the live build registered them in.
      for (let i = 0; i < tile.ops.length; i++) { replayOp(w, tile.ops[i], this.terrain); if (i % 512 === 511) yield* pause(); }
      const planByFp = new Map(tile.plans.map((pl) => [pl.i, pl.p]));
      const doors: Door[] = [];
      const standIn = !!spec.synth;
      for (let i = 0; i < tile.fps.length; i++) {
        const f = tile.fps[i];
        fpKeys.push((f.key = `${spec.id}:${i}`));
        fpList.push(f);
        const key = f.key!;
        this.fpByKey.set(key, f);
        const plan = planByFp.get(i);
        const reg = () => {
          if (!plan) {
            if (f.raise > 0.5) w.addPolygon(f.ring, { floor0: f.floor0, floorH: 3, levels: 1, ground: true }, null, f.floor0 - 0.6, wallTop(f));
            else w.addPolygon(f.ring, null, null, -Infinity, wallTop(f));
            return;
          }
          const door = tile.doors[f.door!];
          this.fpDoor.set(f, door);
          doors.push(door);
          const pid = registerPlan(w, f, plan);
          this.plans.set(key, plan);
          this.interiors.register(key, f, plan, pid);
          keys.push(key);
        };
        if (!standIn) reg();
        else { const fs = this.scopeSeq++; (fpScopes[i] = fs), w.withScope(fs, reg); }
        if (i % 64 === 63) yield* pause();
      }
      for (let i = 0; i < tile.walls.length; i++) {
        const [a, b, y0, y1] = tile.walls[i];
        w.addWall(a, b, y0, y1);
        if (i % 2048 === 2047) yield* pause();
      }
      for (let i = 0; i < tile.decks.length; i++) { w.addDeck(unpackDeck(tile.decks[i])); if (i % 512 === 511) yield* pause(); }
      for (let i = 0; i < tile.pilings.length; i++) {
        const pl = tile.pilings[i], c = Math.cos(pl.ang) * 0.17, s = Math.sin(pl.ang) * 0.17;
        w.addLoop([[pl.x - c + s, pl.z - s - c], [pl.x + c + s, pl.z + s - c], [pl.x + c - s, pl.z + s + c], [pl.x - c - s, pl.z - s + c]], -Infinity, 2.2 + Math.max(0, this.terrain.heightAt(pl.x, pl.z)));
        if (i % 512 === 511) yield* pause();
      }
      w.endScope();
      lap();
      yield;
      at = performance.now();
      part = 'objects';

      const group = new THREE.Group();
      group.name = `tile:${spec.id}`;
      group.matrixAutoUpdate = false; // (never moves: see pack.ts buildObject)
      group.matrixWorldNeedsUpdate = true; // (worked out once, under the world's offset, and its objects with it)
      const atlasTex = tile.atlas ? signTexture(tile.atlas) : undefined;
      group.userData.atlas = atlasTex; // (freed with the tile: dispose)
      const bounds = new THREE.Box3();
      let bounded = true;
      for (let i = 0; i < tile.objs.length; i++) {
        const o = buildObject(tile.objs[i], atlasTex);
        if ((o as THREE.InstancedMesh).isInstancedMesh) o.userData.span = spanOf(o as THREE.InstancedMesh); // (smallCull)
        group.add(o);
        bounded = growBounds(bounds, group, o) && bounded; // (cullTiles)
        if (i % 48 === 47) { lap(); yield; at = performance.now(); }
      }
      // (none for a tile without lanterns or towers: an empty one was a draw's setup in view)
      for (const h of [tile.lanterns.length ? haloPoints(v3s(tile.lanterns), 7, new THREE.Color(1.0, 0.85, 0.55)) : null, tile.towers.length ? haloPoints(v3s(tile.towers), 1.2, new THREE.Color(1.0, 0.75, 0.45)) : null]) {
        if (!h) continue;
        group.add(h);
        bounded = growBounds(bounds, group, h) && bounded;
      }
      if (bounded && !bounds.isEmpty()) group.userData.bounds = bounds;
      const bytes = vertexBytes(group) + (tile.atlas ? tile.atlas.width * tile.atlas.height * 4 * 1.33 : 0); // (a phone's budget)
      this.sizes.set(spec.id, bytes);
      this.unloadCoarse(spec.id, retire); // seamless upgrade — detail replaces the silhouette only once ready
      if (spec.world) {
        // The real tile lands: its synth placeholder (detail or silhouette) retires now.
        this.unload('s' + spec.id.slice(1), retire);
        this.unloadCoarse('s' + spec.id.slice(1), retire);
      }
      lap();
      const t2 = performance.now();
      const hidden = retire ? group.children.filter((c) => c.visible) : [];
      for (const c of hidden) c.visible = false;
      this.scene.add(group);
      if (hidden.length) this.reveals.push({ group, hidden, retire: retire! });
      else for (const g of retire ?? []) this.dispose(g);
      if (!retire) this.uploadSoon(group);
      if (tile.lampPts?.length) {
        this.lampPts.set(spec.id, tile.lampPts);
        this.lampDirty = true;
      }
      this.loaded.set(spec.id, {
        spec, group, scope, keys,
        fps: tile.fps,
        doors,
        walks: tile.walks,
        poles: tile.poles,
        churches: tile.fps.filter((f) => f.kind === 'church').map((f) => f.ring[0] as [number, number]),
        primRoads: tile.roads,
        tunnels: tile.tun,
        areas: tile.areas ?? [],
        kerb: tile.kerb,
        micro: tile.micro,
        crowd: tile.crowd,
        junc: tile.junc,
        flat: !!tile.late,
        vec: !!tile.vec,
        xing: tile.xing,
        vp: tile.vp,
        bytes,
        ...(spec.synth ? { fpScopes, hidden: new Set<number>() } : {}),
      });
      this.reconcileSeams();
      if (tile.late) this.relieve(spec);
      else this.relief.delete(spec.id);
      const t3 = performance.now();
      this.markDirty();
      this.onTile?.(this.loaded.get(spec.id)!);
      this.onMount?.(spec);
      const t4 = performance.now();
      this.lastMount = { id: spec.id, collision: spent.collision, objects: spent.objects, retire: t3 - t2, hooks: t4 - t3 };
    } catch (e) {
      w.endScope();
      w.removeScope(scope);
      for (const fs of fpScopes) if (fs !== undefined) w.removeScope(fs);
      if (tl) this.terrain.removePatch(spec.id);
      if (tile.dem) {
        const cell = spec.id.slice(1);
        const h = this.demHolders.get(cell);
        if (h && (h.delete(spec.id), !h.size)) { this.demHolders.delete(cell); this.terrain.removePatch(cell); }
      }
      // sweep any state the failed mount registered part-way through
      if (keys.length) this.interiors.unregister(keys);
      for (const k of keys) this.plans.delete(k);
      for (const k of fpKeys) this.fpByKey.delete(k);
      for (const f of fpList) this.fpDoor.delete(f);
      const g = this.scene.getObjectByName(`tile:${spec.id}`);
      if (g) {
        this.scene.remove(g);
        g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
        (g.userData.atlas as THREE.Texture | undefined)?.dispose();
        const i = this.reveals.findIndex((r) => r.group === g);
        if (i >= 0) this.reveals.splice(i, 1);
      }
      for (const r of retire ?? []) this.dispose(r);
      console.warn('tile mount failed', spec.id, e);
      this.failed.set(spec.id, performance.now()); // back off — a deterministic failure would otherwise refetch every frame
    }
  }

  // Paint the lamp window around (x,z), ~2 m/px over 2 km, one sprite stamped per lamp and added up.
  // R: the pools' light — each lamp's own fall-off out to POOL.reach (22 m), added up as light adds
  // and held at 1/POOL.headroom of a heart (nightLight.ts poolStamp); the shaders read it straight
  // back (shared.ts lampField). G: the canyon field, over each lamp's old 13 m gradient. (The pools
  // were once white gradients added up: two stops of amber wash ~26 m across round every lamp; then a
  // cone of distance shaped into a flat-topped heart with a cliff at 9 m. That old gradient's trace
  // in G dims the sky's light under every lamp, by day too, and the day look has been made with it
  // there: it stays until that look is judged without it.)
  private repaintLamps(x: number, z: number) {
    const R = 1024, size = LAMP_WIN;
    this.lampCx = Math.round(x / 50) * 50;
    this.lampCz = Math.round(z / 50) * 50;
    this.lampDirty = false;
    const x0 = this.lampCx - size / 2, z0 = this.lampCz - size / 2, k = R / size;
    if (!this.lampCanvas) {
      this.lampCanvas = document.createElement('canvas');
      this.lampCanvas.width = this.lampCanvas.height = R;
    }
    const ctx = this.lampCanvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, R, R);
    ctx.globalCompositeOperation = 'lighter';
    // two sprites, each painted once and stamped at every lamp (a gradient object per lamp — a city
    // ring has thousands — made this repaint a 10–14 ms stall on every mount): the old 13 m one for G
    // exactly as it always was (the day's look has it), and the pool, out to its reach, for R. Each
    // adds only to its own channel.
    const r = 13 * k, S = Math.ceil(r * 2);
    if (!this.lampSprite || this.lampSprite.width !== S) {
      const sp = (this.lampSprite = document.createElement('canvas'));
      sp.width = sp.height = S;
      const sc = sp.getContext('2d')!, c = S / 2;
      sc.fillStyle = '#000';
      sc.fillRect(0, 0, S, S);
      sc.globalCompositeOperation = 'lighter';
      const old = sc.createRadialGradient(c, c, 0, c, c, c);
      old.addColorStop(0, 'rgb(0,255,0)');
      old.addColorStop(0.35, 'rgb(0,128,0)');
      old.addColorStop(1, 'rgb(0,0,0)');
      sc.fillStyle = old;
      sc.fillRect(0, 0, S, S);
    }
    const rp = POOL.reach * k, SP = 2 * Math.ceil(rp) + 1; // (odd: the lamp's foot mid-pixel)
    if (!this.poolSprite || this.poolSprite.width !== SP) {
      const sp = (this.poolSprite = document.createElement('canvas'));
      sp.width = sp.height = SP;
      const sc = sp.getContext('2d')!, c = SP / 2;
      sc.fillStyle = '#000';
      sc.fillRect(0, 0, SP, SP);
      const pool = sc.createRadialGradient(c, c, 0, c, c, rp); // (a radial gradient runs linearly in distance between stops)
      for (const [t, v] of poolStops()) pool.addColorStop(t, `rgb(${Math.round(v * 255)},0,0)`);
      sc.fillStyle = pool;
      sc.fillRect(0, 0, SP, SP);
    }
    for (const pts of this.lampPts.values())
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const px = (pts[i] - x0) * k, pz = (pts[i + 1] - z0) * k;
        if (px < -rp || pz < -rp || px > R + rp || pz > R + rp) continue;
        ctx.drawImage(this.poolSprite, px - SP / 2, pz - SP / 2);
        if (px < -r || pz < -r || px > R + r || pz > R + r) continue;
        ctx.drawImage(this.lampSprite, px - S / 2, pz - S / 2);
      }
    // G: the canyon field — footprints weighted by how tall they stand (40 m = full), blurred
    // to ~25 m: how much sky a street between them loses. paintLight dims the sky fill with it
    // near the ground (shared.ts canyonAt), so a Midtown street sits in deep shade under a
    // bright slot of sky while a shore town's stays open.
    {
      const cv = (this.canyonCanvas ??= document.createElement('canvas'));
      cv.width = cv.height = R / 4;
      const cc = cv.getContext('2d')!;
      cc.fillStyle = '#000';
      cc.fillRect(0, 0, R / 4, R / 4);
      const kk = k / 4;
      for (const f of this.footprints) {
        const hgt = f.top - f.base;
        if (hgt < 9) continue;
        const r0 = f.ring[0];
        if (r0[0] < x0 - 100 || r0[1] < z0 - 100 || r0[0] > x0 + size + 100 || r0[1] > z0 + size + 100) continue;
        cc.fillStyle = `rgb(0,${Math.round(255 * Math.min(1, hgt / 40))},0)`;
        cc.beginPath();
        f.ring.forEach(([px, pz], i) => (i ? cc.lineTo((px - x0) * kk, (pz - z0) * kk) : cc.moveTo((px - x0) * kk, (pz - z0) * kk)));
        cc.closePath();
        cc.fill();
      }
      // blurred at its own quarter size (3 px there is the 12 px it was blurred by once drawn up,
      // ~25 m), then drawn up: a sixteenth of the pixels through the blur, which was most of the
      // repaint (0.1–0.25 s on a canvas the CPU rasters)
      const bv = (this.canyonBlur ??= document.createElement('canvas'));
      bv.width = bv.height = R / 4; // (and cleared)
      const bc = bv.getContext('2d')!;
      bc.filter = 'blur(3px)';
      bc.drawImage(cv, 0, 0);
      bc.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bv, 0, 0, R, R);
    }
    if (!this.lampTex) {
      this.lampTex = new THREE.CanvasTexture(this.lampCanvas);
      this.lampTex.flipY = false;
      this.lampTex.minFilter = THREE.LinearFilter;
      this.lampTex.generateMipmaps = false;
      U.uLampMap.value = this.lampTex;
    } else this.lampTex.needsUpdate = true;
    U.uLampBox.value.set(x0, z0, 1 / size, 1 / size);
  }

  /** A stand-in beside a real cell: its copies of the real cell's buildings go — their collision
   *  (each footprint's own scope), their interiors and doors, and their walls and roofs (the
   *  vertices of those building ids pulled out of sight). See seams.ts. */
  private reconcileSeams() {
    const reals = [...this.loaded.values()].filter((t) => t.spec.world);
    if (!reals.length) return;
    for (const S of this.loaded.values()) {
      if (!S.spec.synth || !S.fpScopes || !S.hidden) continue;
      const gone = new Set<number>();
      for (const R of reals) {
        const b = S.spec.box, r = R.spec.box;
        if (b.x0 > r.x1 + 60 || r.x0 > b.x1 + 60 || b.z0 > r.z1 + 60 || r.z0 > b.z1 + 60) continue;
        const live = S.fps.map((f, i) => ({ f, i })).filter(({ i }) => !S.hidden!.has(i));
        for (const k of seamDuplicates(live.map(({ f }) => f), R.fps, r)) gone.add(live[k].i);
      }
      if (!gone.size) continue;
      const ids = new Set<number>();
      for (const i of gone) {
        const f = S.fps[i];
        S.hidden.add(i);
        ids.add(f.id);
        const fs = S.fpScopes[i];
        if (fs !== undefined) this.walk.removeScope(fs);
        if (f.key) {
          this.interiors.unregister([f.key]);
          this.plans.delete(f.key);
          this.fpByKey.delete(f.key);
          const k = S.keys.indexOf(f.key);
          if (k >= 0) S.keys.splice(k, 1);
        }
        const d = this.fpDoor.get(f);
        if (d) {
          this.fpDoor.delete(f);
          const k = S.doors.indexOf(d);
          if (k >= 0) S.doors.splice(k, 1);
        }
      }
      S.group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        const info = g?.getAttribute?.('aInfo') as THREE.BufferAttribute | undefined, pos = g?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
        if (!info || !pos) return;
        let hit = false;
        for (let v = 0; v < info.count; v++) if (ids.has(info.getX(v))) (pos.setXYZ(v, 0, -1e5, 0), (hit = true));
        if (hit) pos.needsUpdate = true;
      });
      this.markDirty();
    }
  }

  /** `retire`: leave the tile's meshes on screen and hand them over — a tile taking its place
   *  removes them once it's all showing (reveal). */
  unload(id: string, retire?: THREE.Group[]) {
    const a = this.loaded.get(id);
    if (!a) return;
    const purge = streamParams.purge && 'later';
    this.walk.removeScope(a.scope, purge);
    for (const fs of a.fpScopes ?? []) if (fs !== undefined) this.walk.removeScope(fs, purge);
    this.terrain.removePatch(id);
    // DEM patch bookkeeping: the patch belongs to the CELL; retire it only when the
    // last mounted twin leaves (an s-unload mid-swap mustn't drop the w-twin's terrain).
    const cell = /^[sw]/.test(id) ? id.slice(1) : null;
    if (cell) {
      const holders = this.demHolders.get(cell);
      if (holders && (holders.delete(id), !holders.size)) {
        this.demHolders.delete(cell);
        this.terrain.removePatch(cell);
      }
    }
    this.interiors.unregister(a.keys);
    for (const k of a.keys) this.plans.delete(k);
    for (const f of a.fps) { this.fpByKey.delete(f.key!); this.fpDoor.delete(f); }
    this.retireGroup(a.group, retire);
    if (this.lampPts.delete(id)) this.lampDirty = true;
    this.loaded.delete(id);
    this.onUnload?.(id);
    this.markDirty();
  }

  // Coarse tier: display geometry only — objects + halo points, no collision, interiors,
  // plans, lamp pools or terrain patch. Swapped for the detail mount on approach.
  private mountCoarse(p: Pending | null) {
    if (!p || this.coarseLoaded.has(p.spec.id) || this.loaded.has(p.spec.id)) return;
    if (p.spec.synth && this.loaded.has('w' + p.spec.id.slice(1))) return; // real tile owns this cell already
    const { spec, tile } = p;
    try {
      const group = new THREE.Group();
      group.name = `ctile:${spec.id}`;
      group.matrixAutoUpdate = false;
      group.matrixWorldNeedsUpdate = true;
      const atlasTex = tile.atlas ? signTexture(tile.atlas) : undefined;
      group.userData.atlas = atlasTex;
      for (const o of tile.objs) group.add(buildObject(o, atlasTex));
      if (tile.lanterns.length) group.add(haloPoints(v3s(tile.lanterns), 7, new THREE.Color(1.0, 0.85, 0.55)));
      if (tile.towers.length) group.add(haloPoints(v3s(tile.towers), 1.2, new THREE.Color(1.0, 0.75, 0.45)));
      const bounds = new THREE.Box3();
      if (growBounds(bounds, group, group) && !bounds.isEmpty()) group.userData.bounds = bounds; // (cullTiles)
      this.scene.add(group);
      this.uploadSoon(group);
      const bytes = streamParams.coarseMB > 0 ? vertexBytes(group) : 0;
      this.coarseLoaded.set(spec.id, { spec, group, bytes });
      this.coarseBytes += bytes;
      // over the ring's budget: the farthest silhouettes go, and nothing that far is fetched again
      // until there's room
      if (streamParams.coarseMB > 0 && this.coarseBytes > streamParams.coarseMB * 1e6) {
        const far = [...this.coarseLoaded].map(([id, a]) => [id, boxDist2(a.spec.box, this.px, this.pz)] as const).sort((a, b) => b[1] - a[1]);
        for (const [id, d2] of far) {
          if (this.coarseBytes <= streamParams.coarseMB * 1e6) break;
          this.unloadCoarse(id);
          this.coarseCut = Math.min(this.coarseCut, Math.sqrt(d2));
        }
      }
    } catch (e) {
      console.warn('coarse mount failed', spec.id, e);
    }
  }

  private unloadCoarse(id: string, retire?: THREE.Group[]) {
    const a = this.coarseLoaded.get(id);
    if (!a) return;
    this.retireGroup(a.group, retire);
    this.coarseBytes -= a.bytes;
    this.coarseLoaded.delete(id);
  }

  // A tile's meshes go now, or (`retire`) wait for the tile replacing them. One still revealing
  // stops: what it was waiting to replace goes with it.
  private retireGroup(g: THREE.Group, retire?: THREE.Group[]) {
    const i = this.reveals.findIndex((r) => r.group === g);
    if (i >= 0) for (const old of this.reveals.splice(i, 1)[0].retire) retire ? retire.push(old) : this.dispose(old);
    if (retire) retire.push(g);
    else this.dispose(g);
  }
  private dispose(g: THREE.Group) {
    this.scene.remove(g);
    // (its meshes freed a few ms a frame — freeTick: three.js walks every program's bindings for each
    // geometry it lets go, and a teleport's whole old place at once was a third of a second on a phone)
    g.traverse((o) => { if ((o as THREE.Mesh).geometry || (o as unknown as THREE.InstancedMesh).isInstancedMesh) this.freeQ.push(o); });
    // …and its street-sign atlas: the one texture a tile owns. Left, every tile ever passed kept its
    // signs in video memory (a phone's, a few round trips into a town, then the city)
    (g.userData.atlas as THREE.Texture | undefined)?.dispose();
  }
  private freeQ: THREE.Object3D[] = [];
  /** Frees retired tiles' meshes, `ms` of them a frame (update). */
  private freeTick(ms: number) {
    const t0 = performance.now();
    while (this.freeQ.length && performance.now() - t0 < ms) {
      const m = this.freeQ.pop() as THREE.Mesh;
      m.geometry?.dispose?.();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
    }
  }
  // Show the oldest revealing tile's next meshes (REVEAL_BYTES / REVEAL_OBJS of them), each drawn this frame
  // whether it's in view or not, so its buffers go up now rather than when you turn round; when
  // it's all showing, what it replaced goes.
  /** (a page that frees its uploaded vertex data, pack.ts) A tile mounted whole — the arrival's ring, a
   *  silhouette — is drawn its first frame whether or not it's in view, as a revealed one is: uploaded
   *  now, its CPU copy let go now, not whenever you first turn round to it. */
  private uploadSoon(root: THREE.Object3D) {
    root.traverse((m) => { if (m.frustumCulled && (m as THREE.Mesh).geometry) this.uploadQ.push(m); });
  }

  private reveal() {
    for (const o of this.culledPrev) o.frustumCulled = true;
    this.culledPrev = this.culled;
    this.culled = [];
    // (doubled while a teleport waits on its ground: you're not looking at it yet)
    let budget = REVEAL_BYTES * (this.pin ? 2 : 1), n = 0;
    const objs = REVEAL_OBJS * (this.pin ? 2 : 1);
    const weigh = (m: THREE.Object3D) => {
      const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g?.attributes) {
        for (const k in g.attributes) budget -= (g.attributes[k] as THREE.BufferAttribute).array?.byteLength ?? 0;
        if (g.index) budget -= g.index.array?.byteLength ?? 0;
      }
      if ((m as THREE.InstancedMesh).isInstancedMesh) budget -= (m as THREE.InstancedMesh).instanceMatrix.array?.byteLength ?? 0;
    };
    // (one unloaded since is out of the scene: drawn or not, it costs nothing)
    while (this.uploadQ.length && budget > 0 && n++ < objs) {
      const m = this.uploadQ.shift()!;
      weigh(m);
      if (m.frustumCulled) { m.frustumCulled = false; this.culled.push(m); }
    }
    // (their tiles drawn whole this frame, wherever the camera looks: cullTiles)
    this.mustDraw.clear();
    for (const m of this.culled) { let p = m.parent; while (p && p.parent !== this.scene) p = p.parent; if (p) this.mustDraw.add(p); }
    const r = this.reveals[0];
    if (!r) return;
    while (r.hidden.length && budget > 0 && n++ < objs) {
      const o = r.hidden.shift()!;
      o.visible = true;
      o.traverse((m) => {
        weigh(m);
        if (m.frustumCulled) { m.frustumCulled = false; this.culled.push(m); }
      });
    }
    if (r.hidden.length) return;
    this.reveals.shift();
    for (const g of r.retire) this.dispose(g);
  }
}
