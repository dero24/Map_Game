// Tile streaming: keeps a ring of neighbourhood tiles alive around the walker. Tiles are decoded
// and built in a worker (src/world/tile.worker.ts — same pipeline as the in-page fallback), then
// mounted cheaply: packed objects rebuilt into scene meshes, collision ops replayed inside a
// WalkWorld scope, interiors registered under "tile:idx" keys. Unload removes all three cleanly.
import * as THREE from 'three';
import { loadTile, loadTileTerrain, type AtlasManifest, type Box, type Road, type TileJson, type TileSpec, type Terrain, TerrainLayer } from './data';
import { cachedFetchJson, manifestFingerprint } from './cache';
import type { Door, Footprint } from './buildings';
import { buildTile } from './tileBuild';
import { buildObject, packGroup, replayOps, unpackDeck, type BuiltTile } from './pack';
import { synthTile, realExtras, regionSeed } from './synth';
import { haloPoints } from './props';
import { signTexture } from './signs';
import { registerPlan, type Interiors, type Plan } from './interiors';
import type { WalkWorld } from '../player/collision';
import { U } from '../render/shared';

const LOAD_R = 1500; // keep tiles this close (3×3 cells and then some)
const DROP_R = 2400; // drop tiles beyond this
const COARSE_R = 8000; // silhouette ring: lite builds (meshes only) out to the horizon
const COARSE_BUDGET = 4; // max outstanding lite builds — they're lowest priority
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
}

interface Pending { spec: TileSpec; tile: BuiltTile }

const boxDist2 = (b: Box, x: number, z: number) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx * dx + dz * dz;
};

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
  // Coarse tier: display-only tiles in [DROP_R, COARSE_R) — meshes rebuilt from lite builds,
  // no collision/interiors/plans. A tile entering the detail ring sheds its coarse mount.
  private coarseLoaded = new Map<string, { spec: TileSpec; group: THREE.Group }>();
  private coarseFetching = new Map<string, Promise<Pending | null>>();
  private coarseQueue: Pending[] = [];
  private scopeSeq = 1;
  private dirty = true;
  private _fps: Footprint[] = [];
  private _doors: Door[] = [];
  private _poles: unknown[] = [];
  private _churches: [number, number][] = [];
  private _primRoads: Road[] = [];
  // The tile worker: decode + mesh + collision run off-thread; jobs resolve with a BuiltTile.
  private worker: Worker | null = null;
  private workerDead = false;
  private seq = 0;
  private jobs = new Map<number, { res: (t: BuiltTile) => void; rej: (e: Error) => void }>();
  private jobFails = 0;
  // Night lamp light map: per-tile bitmaps composited over the slice box.
  private lampBits = new Map<string, ImageBitmap>();
  private lampCanvas: HTMLCanvasElement | null = null;
  private lampTex: THREE.CanvasTexture | null = null;
  onChange: (() => void) | null = null;
  onTile: ((a: TileArt) => void) | null = null; // fired after a tile mounts (walks -> ground paint)

  // Manifest cells by cx_cz key + the procedural-cell cache: past the manifest's grid the
  // world is synthesised deterministically (synth.ts) — same BuiltTile pipeline after that.
  private byCell = new Map<string, TileSpec>();
  private synthSpecs = new Map<string, TileSpec>();
  private worldSpecs = new Map<string, TileSpec>(); // real-lite cells served by the tile worker
  private seed = 0;
  private synthOrd = 0; // fp-id base offset — starts at man.tiles.length so ids stay <2^24
  private queued = new Set<string>(); // ids sitting in buildQueue — gates the per-frame refetch

  constructor(
    private base: string,
    private man: AtlasManifest,
    private terrain: Terrain,
    private walk: WalkWorld,
    private interiors: Interiors,
    private scene: THREE.Object3D, // the world root — tile groups join it under the floating origin
    private tilesBase = '', // real-lite tile service ('' = synth everywhere past the bake)
    private terrBin: ArrayBuffer | null = null, // terrain.bin bytes for virtual regions (no URL exists)
  ) {
    const S = man.slice;
    U.uLampBox.value.set(S.x0, S.z0, 1 / (S.x1 - S.x0), 1 / (S.z1 - S.z0));
    for (const t of man.tiles) this.byCell.set(t.id, t);
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
        // &v=3 — the edge Cache API keys on the full URL; bumping alongside the
        // worker's R2 key (t/v3) retires stale tile payloads.
        const file = `${this.tilesBase}/tile/${key}.json?olat=${this.man.origin.lat}&olon=${this.man.origin.lon}&v=3`;
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
    this.dirty = false;
  }
  private sync() { if (this.dirty) this.rebuild(); }
  get footprints() { this.sync(); return this._fps; }
  get doors() { this.sync(); return this._doors; }
  get poles() { this.sync(); return this._poles; }
  get churches() { this.sync(); return this._churches; }
  get primRoads() { this.sync(); return this._primRoads; }
  get busy() { return this.fetching.size > 0 || this.buildQueue.length > 0 || this.coarseFetching.size > 0 || this.coarseQueue.length > 0; }
  // Fired once a detail tile is fully mounted (visual + collision). main.ts uses it to
  // re-settle the walker when a real tile replaces the synth placeholder underfoot.
  onMount?: (spec: TileSpec) => void;
  // w-* cells still on the wire — drives the "the real streets are painting in" toast.
  get worldPending() {
    let n = 0;
    for (const id of this.fetching.keys()) if (id[0] === 'w') n++;
    for (const id of this.queued) if (id[0] === 'w') n++;
    return n;
  }
  doorOf(fp: Footprint) { return this.fpDoor.get(fp); }

  houseGrid() {
    const m = new Map<number, number>();
    for (const f of this.footprints)
      if (f.kind === 'house') {
        const k = Math.floor(f.ring[0][0] / 80) * 92821 + Math.floor(f.ring[0][1] / 80);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    return m;
  }

  // Load every tile within r of (x,z) now — used during startup so the spawn area is solid.
  // Covers synthetic cells too, so a teleport/respawn past the bake isn't born in a void.
  async ensureAround(x: number, z: number, r = LOAD_R) {
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
    for (const p of pends) this.mount(p);
    for (const t of wanted) if (t.world) void this.fetch(t).then((p) => { if (p) { this.queued.add(t.id); this.buildQueue.push(p); } });
  }

  // Per-frame: kick fetches for wanted tiles (detail ring first, then the coarse silhouette
  // ring under a small budget), mount at most one finished tile of each tier, drop far ones.
  update(x: number, z: number) {
    const now = performance.now();
    // Cells in the coarse ring — manifest tiles where baked, synthetic where not. Iterating
    // cells rather than man.tiles is what makes the world continue past the bake.
    const c = this.man.cell;
    const cx0 = Math.floor((x - COARSE_R) / c), cx1 = Math.floor((x + COARSE_R) / c);
    const cz0 = Math.floor((z - COARSE_R) / c), cz1 = Math.floor((z + COARSE_R) / c);
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const t = this.specAt(cx, cz);
        const d2 = boxDist2(t.box, x, z);
        if (d2 < LOAD_R * LOAD_R) {
          // Real-lite cells stream their synth placeholder twin alongside — it mounts
          // instantly and the worker tile swaps in over it when it lands. Failed real
          // fetches just retry later under the same backoff while the synth holds.
          const specs = t.world ? [t, this.synthSpec(cx, cz)] : [t];
          for (const sp of specs)
            if (!this.loaded.has(sp.id) && !this.fetching.has(sp.id) && !this.queued.has(sp.id) && now - (this.failed.get(sp.id) ?? -30000) > 10000) void this.fetch(sp).then((p) => { if (p) { this.queued.add(sp.id); this.buildQueue.push(p); } });
        } else {
          if (d2 > DROP_R * DROP_R && this.loaded.has(t.id)) this.unload(t.id);
          if (t.world) { const sid = 's' + t.id.slice(1); if (d2 > DROP_R * DROP_R && this.loaded.has(sid)) this.unload(sid); }
          // Silhouettes fill the [LOAD_R, COARSE_R) band — without this, cells between
          // LOAD_R and DROP_R were a dead zone that neither tier ever fetched. They stay
          // synth even under a tile service: cheap, local, and a distant cell isn't worth
          // an Overpass query.
          if (d2 >= LOAD_R * LOAD_R && d2 < COARSE_R * COARSE_R) {
            const cs = t.world ? this.synthSpec(cx, cz) : t;
            if (!this.loaded.has(t.id) && !this.loaded.has(cs.id) && !this.coarseLoaded.has(cs.id) && !this.coarseFetching.has(cs.id) && !this.queued.has('c' + cs.id) && !this.queued.has(cs.id) && this.coarseFetching.size < COARSE_BUDGET && now - (this.failed.get('c' + cs.id) ?? -30000) > 10000) void this.fetchCoarse(cs).then((p) => { if (p) { this.queued.add('c' + cs.id); this.coarseQueue.push(p); } });
          } else if (d2 >= COARSE_R * COARSE_R) {
            if (this.coarseLoaded.has(t.id)) this.unloadCoarse(t.id);
            if (t.world) { const sid = 's' + t.id.slice(1); if (this.coarseLoaded.has(sid)) this.unloadCoarse(sid); }
          }
        }
      }
    // Cells outside the iteration window aren't visited above — sweep mounts so tiles left
    // behind the corner of the box unload the same way the old manifest-wide loop did.
    for (const [id, a] of [...this.loaded]) if (boxDist2(a.spec.box, x, z) > DROP_R * DROP_R) this.unload(id);
    for (const [id, a] of [...this.coarseLoaded]) if (boxDist2(a.spec.box, x, z) > COARSE_R * COARSE_R) this.unloadCoarse(id);
    if (this.buildQueue.length) {
      this.buildQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const p = this.buildQueue.shift()!;
      this.queued.delete(p.spec.id);
      if (boxDist2(p.spec.box, x, z) < DROP_R * DROP_R) this.mount(p);
    }
    if (this.coarseQueue.length) {
      this.coarseQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const p = this.coarseQueue.shift()!;
      this.queued.delete('c' + p.spec.id);
      if (boxDist2(p.spec.box, x, z) < COARSE_R * COARSE_R) this.mountCoarse(p);
    }
  }

  private spawn() {
    try {
      const w = new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const m = e.data;
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
          if (++this.jobFails >= 3 && !this.workerDead) {
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
      w.postMessage({ kind: 'init', base: new URL(this.base, location.href).href, cell: this.man.cell, fp: manifestFingerprint(this.man), seed: this.seed, bin: this.terrBin });
      this.worker = w;
    } catch {
      this.workerDead = true;
    }
  }

  private build(t: TileSpec, ord: number, lite = false): Promise<BuiltTile> {
    if (!this.worker && !this.workerDead) this.spawn();
    if (this.worker) {
      const id = ++this.seq;
      return new Promise((res, rej) => {
        this.jobs.set(id, { res, rej });
        this.worker!.postMessage({ kind: 'build', id, spec: t, idBase: ord * ID_STRIDE, lite, terr: this.man.terrain?.slice ? this.man.terrain : undefined });
      });
    }
    // No worker support: the same pipeline on the main thread.
    const syn = t.synth ? synthTile(t, this.seed, this.terrain) : null;
    const src: Promise<TileJson> = syn ? Promise.resolve(syn.tj) : t.world ? (cachedFetchJson(t.file) as Promise<TileJson>) : loadTile(this.base, t);
    return Promise.all([src, lite || syn || t.world ? Promise.resolve(null) : loadTileTerrain(this.base, t)]).then(async ([tj, tl]) => {
      const tile = await buildTile(tj, this.terrain, t, ord * ID_STRIDE, lite);
      if (syn) tile.objs.push(...packGroup(syn.extra));
      else if (t.world) tile.objs.push(...packGroup(realExtras(tj, this.terrain)));
      tile.terr = tl ? (tl.height.buffer as ArrayBuffer) : undefined;
      return tile;
    });
  }

  private fetch(t: TileSpec): Promise<Pending | null> {
    let p = this.fetching.get(t.id);
    if (!p) {
      p = this.build(t, this.ordOf(t))
        .then((tile): Pending => ({ spec: t, tile }))
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
        .then((tile): Pending => ({ spec: t, tile }))
        .catch((e) => { this.failed.set('c' + t.id, performance.now()); console.warn('coarse tile load failed', t.id, e); return null; })
        .finally(() => this.coarseFetching.delete(t.id));
      this.coarseFetching.set(t.id, p);
    }
    return p;
  }

  private mount(p: Pending | null) {
    if (!p || this.loaded.has(p.spec.id)) return;
    if (p.spec.synth && this.loaded.has('w' + p.spec.id.slice(1))) return; // its real-lite twin already won the cell
    const { spec, tile } = p;
    const scope = this.scopeSeq++;
    const w = this.walk;
    const keys: string[] = [], fpKeys: string[] = [], fpList: Footprint[] = [];
    const tl = tile.terr && spec.terrain ? new TerrainLayer(tile.terr, spec.terrain.layout) : null;
    if (tl) this.terrain.registerPatch(spec.id, tl);
    w.beginScope(scope);
    try {
      // Builder-emitted collision (bridge/pier decks, poles, fences, parked cars) replays first —
      // the same order the live build registered them in.
      replayOps(w, tile.ops);
      const planByFp = new Map(tile.plans.map((pl) => [pl.i, pl.p]));
      const doors: Door[] = [];
      tile.fps.forEach((f, i) => {
        fpKeys.push((f.key = `${spec.id}:${i}`));
        fpList.push(f);
        const key = f.key!;
        this.fpByKey.set(key, f);
        const plan = planByFp.get(i);
        if (!plan) {
          if (f.raise > 0.5) w.addPolygon(f.ring, { floor0: f.floor0, floorH: 3, levels: 1, ground: true }, null, f.floor0 - 0.6);
          else w.addPolygon(f.ring);
          return;
        }
        const door = tile.doors[f.door!];
        this.fpDoor.set(f, door);
        doors.push(door);
        const pid = registerPlan(w, f, plan);
        this.plans.set(key, plan);
        this.interiors.register(key, f, plan, pid);
        keys.push(key);
      });
      for (const [a, b, y0, y1] of tile.walls) w.addWall(a, b, y0, y1);
      for (const d of tile.decks) w.addDeck(unpackDeck(d));
      for (const pl of tile.pilings) {
        const c = Math.cos(pl.ang) * 0.17, s = Math.sin(pl.ang) * 0.17;
        w.addLoop([[pl.x - c + s, pl.z - s - c], [pl.x + c + s, pl.z + s - c], [pl.x + c - s, pl.z + s + c], [pl.x - c - s, pl.z - s + c]], -Infinity, 2.2 + Math.max(0, this.terrain.heightAt(pl.x, pl.z)));
      }
      w.endScope();

      const group = new THREE.Group();
      group.name = `tile:${spec.id}`;
      const atlasTex = tile.atlas ? signTexture(tile.atlas) : undefined;
      for (const o of tile.objs) group.add(buildObject(o, atlasTex));
      group.add(haloPoints(v3s(tile.lanterns), 7, new THREE.Color(1.0, 0.85, 0.55)));
      group.add(haloPoints(v3s(tile.towers), 1.2, new THREE.Color(1.0, 0.75, 0.45)));
      this.unloadCoarse(spec.id); // seamless upgrade — detail replaces the silhouette only once ready
      if (spec.world) {
        // The real tile lands: its synth placeholder (detail or silhouette) retires now.
        this.unload('s' + spec.id.slice(1));
        this.unloadCoarse('s' + spec.id.slice(1));
      }
      this.scene.add(group);
      if (tile.lamp) {
        this.lampBits.set(spec.id, tile.lamp);
        this.repaintLamps();
      }
      this.loaded.set(spec.id, {
        spec, group, scope, keys,
        fps: tile.fps,
        doors,
        walks: tile.walks,
        poles: tile.poles,
        churches: tile.fps.filter((f) => f.kind === 'church').map((f) => f.ring[0] as [number, number]),
        primRoads: tile.roads,
      });
      this.markDirty();
      this.onTile?.(this.loaded.get(spec.id)!);
      this.onMount?.(spec);
    } catch (e) {
      w.endScope();
      w.removeScope(scope);
      if (tl) this.terrain.removePatch(spec.id);
      // sweep any state the failed mount registered part-way through
      if (keys.length) this.interiors.unregister(keys);
      for (const k of keys) this.plans.delete(k);
      for (const k of fpKeys) this.fpByKey.delete(k);
      for (const f of fpList) this.fpDoor.delete(f);
      const g = this.scene.getObjectByName(`tile:${spec.id}`);
      if (g) {
        this.scene.remove(g);
        g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
      }
      console.warn('tile mount failed', spec.id, e);
      this.failed.set(spec.id, performance.now()); // back off — a deterministic failure would otherwise refetch every frame
    }
  }

  // Composite every mounted tile's lamp bitmap over the slice box — additive pools.
  private repaintLamps() {
    const any = [...this.lampBits.values()];
    const W = any[0]?.width ?? 0, H = any[0]?.height ?? 0;
    if (!W || !H) return;
    if (!this.lampCanvas) {
      this.lampCanvas = document.createElement('canvas');
      this.lampCanvas.width = W;
      this.lampCanvas.height = H;
    }
    const ctx = this.lampCanvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of any) ctx.drawImage(b, 0, 0, W, H);
    if (!this.lampTex) {
      this.lampTex = new THREE.CanvasTexture(this.lampCanvas);
      this.lampTex.flipY = false;
      this.lampTex.minFilter = THREE.LinearFilter;
      this.lampTex.generateMipmaps = false;
      U.uLampMap.value = this.lampTex;
    } else this.lampTex.needsUpdate = true;
  }

  unload(id: string) {
    const a = this.loaded.get(id);
    if (!a) return;
    this.walk.removeScope(a.scope);
    this.terrain.removePatch(id);
    this.interiors.unregister(a.keys);
    for (const k of a.keys) this.plans.delete(k);
    for (const f of a.fps) { this.fpByKey.delete(f.key!); this.fpDoor.delete(f); }
    this.scene.remove(a.group);
    a.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    const bmp = this.lampBits.get(id);
    if (bmp) {
      this.lampBits.delete(id);
      bmp.close();
      this.repaintLamps();
    }
    this.loaded.delete(id);
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
      const atlasTex = tile.atlas ? signTexture(tile.atlas) : undefined;
      for (const o of tile.objs) group.add(buildObject(o, atlasTex));
      group.add(haloPoints(v3s(tile.lanterns), 7, new THREE.Color(1.0, 0.85, 0.55)));
      group.add(haloPoints(v3s(tile.towers), 1.2, new THREE.Color(1.0, 0.75, 0.45)));
      this.scene.add(group);
      this.coarseLoaded.set(spec.id, { spec, group });
    } catch (e) {
      console.warn('coarse mount failed', spec.id, e);
    }
  }

  private unloadCoarse(id: string) {
    const a = this.coarseLoaded.get(id);
    if (!a) return;
    this.scene.remove(a.group);
    a.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    this.coarseLoaded.delete(id);
  }
}
