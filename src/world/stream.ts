// Tile streaming: keeps a ring of neighbourhood tiles alive around the walker. Tiles are decoded
// and built in a worker (src/world/tile.worker.ts — same pipeline as the in-page fallback), then
// mounted cheaply: packed objects rebuilt into scene meshes, collision ops replayed inside a
// WalkWorld scope, interiors registered under "tile:idx" keys. Unload removes all three cleanly.
import * as THREE from 'three';
import { loadTile, loadTileTerrain, type AtlasManifest, type Box, type Road, type TileSpec, type Terrain, TerrainLayer } from './data';
import { manifestFingerprint } from './cache';
import type { Door, Footprint } from './buildings';
import { buildTile } from './tileBuild';
import { buildObject, replayOps, unpackDeck, type BuiltTile } from './pack';
import { haloPoints } from './props';
import { signTexture } from './signs';
import { registerPlan, type Interiors, type Plan } from './interiors';
import type { WalkWorld } from '../player/collision';
import { U } from '../render/shared';

const LOAD_R = 1500; // keep tiles this close (3×3 cells and then some)
const DROP_R = 2400; // drop tiles beyond this
const COARSE_R = 8000; // silhouette ring: lite builds (meshes only) out to the horizon
const COARSE_BUDGET = 4; // max outstanding lite builds — they're lowest priority
const ID_STRIDE = 1 << 16; // building-id space per tile (window-fade keys, <2^24 total)

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
  // Night lamp light map: per-tile bitmaps composited over the slice box.
  private lampBits = new Map<string, ImageBitmap>();
  private lampCanvas: HTMLCanvasElement | null = null;
  private lampTex: THREE.CanvasTexture | null = null;
  onChange: (() => void) | null = null;
  onTile: ((a: TileArt) => void) | null = null; // fired after a tile mounts (walks -> ground paint)

  constructor(
    private base: string,
    private man: AtlasManifest,
    private terrain: Terrain,
    private walk: WalkWorld,
    private interiors: Interiors,
    private scene: THREE.Object3D, // the world root — tile groups join it under the floating origin
  ) {
    const S = man.slice;
    U.uLampBox.value.set(S.x0, S.z0, 1 / (S.x1 - S.x0), 1 / (S.z1 - S.z0));
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
  async ensureAround(x: number, z: number, r = LOAD_R) {
    const wanted = this.man.tiles.filter((t) => boxDist2(t.box, x, z) < r * r);
    const pends = await Promise.all(wanted.map((t) => this.fetch(t)));
    for (const p of pends) this.mount(p);
  }

  // Per-frame: kick fetches for wanted tiles (detail ring first, then the coarse silhouette
  // ring under a small budget), mount at most one finished tile of each tier, drop far ones.
  update(x: number, z: number) {
    const now = performance.now();
    for (const t of this.man.tiles) {
      const d2 = boxDist2(t.box, x, z);
      if (d2 < LOAD_R * LOAD_R) {
        // A coarse mount stays up until the detail mount swaps it — silhouette beats a hole.
        if (!this.loaded.has(t.id) && !this.fetching.has(t.id) && now - (this.failed.get(t.id) ?? -30000) > 10000) void this.fetch(t).then((p) => { if (p) this.buildQueue.push(p); });
      } else {
        if (d2 > DROP_R * DROP_R && this.loaded.has(t.id)) this.unload(t.id);
        if (d2 >= DROP_R * DROP_R && d2 < COARSE_R * COARSE_R) {
          if (!this.loaded.has(t.id) && !this.coarseLoaded.has(t.id) && !this.coarseFetching.has(t.id) && this.coarseFetching.size < COARSE_BUDGET && now - (this.failed.get('c' + t.id) ?? -30000) > 10000) void this.fetchCoarse(t).then((p) => { if (p) this.coarseQueue.push(p); });
        } else if (d2 >= COARSE_R * COARSE_R && this.coarseLoaded.has(t.id)) this.unloadCoarse(t.id);
      }
    }
    if (this.buildQueue.length) {
      this.buildQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const p = this.buildQueue.shift()!;
      if (boxDist2(p.spec.box, x, z) < DROP_R * DROP_R) this.mount(p);
    }
    if (this.coarseQueue.length) {
      this.coarseQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const p = this.coarseQueue.shift()!;
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
        if (m.kind === 'built') j.res(m.tile);
        else j.rej(new Error(m.message ?? 'tile build failed'));
      };
      // Worker fetches resolve against its own module URL — hand it an absolute base.
      w.postMessage({ kind: 'init', base: new URL(this.base, location.href).href, cell: this.man.cell, fp: manifestFingerprint(this.man) });
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
    return Promise.all([loadTile(this.base, t), lite ? Promise.resolve(null) : loadTileTerrain(this.base, t)]).then(([tj, tl]) => {
      const tile = buildTile(tj, this.terrain, t, ord * ID_STRIDE, lite);
      tile.terr = tl ? (tl.height.buffer as ArrayBuffer) : undefined;
      return tile;
    });
  }

  private fetch(t: TileSpec): Promise<Pending | null> {
    let p = this.fetching.get(t.id);
    if (!p) {
      p = this.build(t, this.man.tiles.indexOf(t))
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
      p = this.build(t, this.man.tiles.indexOf(t), true)
        .then((tile): Pending => ({ spec: t, tile }))
        .catch((e) => { this.failed.set('c' + t.id, performance.now()); console.warn('coarse tile load failed', t.id, e); return null; })
        .finally(() => this.coarseFetching.delete(t.id));
      this.coarseFetching.set(t.id, p);
    }
    return p;
  }

  private mount(p: Pending | null) {
    if (!p || this.loaded.has(p.spec.id)) return;
    this.unloadCoarse(p.spec.id); // seamless upgrade — the detail tile replaces its silhouette
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
