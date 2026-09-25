// Tile streaming: keeps a ring of neighbourhood tiles alive around the walker. Each tile is built with
// the same per-region builders (given a tile-scoped WorldJson), registers all its collision under one
// WalkWorld scope, and unloads cleanly — scene objects disposed, collision tombstoned, interiors dropped.
import * as THREE from 'three';
import { loadTile, loadTileTerrain, type AtlasManifest, type Box, type TileJson, type TileSpec, type Terrain, type TerrainLayer, type World, type WorldJson } from './data';
import { buildBuildings, type BuildingsResult, type Door, type Footprint } from './buildings';
import { buildStructures } from './structures';
import { buildProps } from './props';
import { buildSigns } from './signs';
import { planInterior, registerPlan, type Interiors, type Plan } from './interiors';
import type { WalkWorld } from '../player/collision';

const LOAD_R = 1500; // keep tiles this close (3×3 cells and then some)
const DROP_R = 2400; // drop tiles beyond this
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
  primRoads: TileJson['roads'];
}

interface Pending { spec: TileSpec; json: TileJson; terrain: TerrainLayer | null }

const boxDist2 = (b: Box, x: number, z: number) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx * dx + dz * dz;
};
const prim = <T extends { own?: number }>(a: T[]) => a.filter((e) => e.own !== 0);

export class TileStream {
  loaded = new Map<string, TileArt>();
  plans = new Map<string, Plan>();
  fpByKey = new Map<string, Footprint>();
  fpDoor = new Map<Footprint, Door>();
  private fetching = new Map<string, Promise<Pending | null>>();
  private failed = new Map<string, number>(); // tile -> last failure time (retry backoff)
  private buildQueue: Pending[] = [];
  private scopeSeq = 1;
  private dirty = true;
  private _fps: Footprint[] = [];
  private _doors: Door[] = [];
  private _poles: unknown[] = [];
  private _churches: [number, number][] = [];
  private _primRoads: TileJson['roads'] = [];
  onChange: (() => void) | null = null;
  onTile: ((a: TileArt) => void) | null = null; // fired after a tile mounts (walks -> ground paint)

  constructor(
    private base: string,
    private man: AtlasManifest,
    private terrain: Terrain,
    private walk: WalkWorld,
    private interiors: Interiors,
    private scene: THREE.Scene,
  ) {}

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
  get busy() { return this.fetching.size > 0 || this.buildQueue.length > 0; }
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

  // Per-frame: kick fetches for wanted tiles, build at most one fetched tile, drop far ones.
  update(x: number, z: number) {
    for (const t of this.man.tiles) {
      const d2 = boxDist2(t.box, x, z);
      if (d2 > DROP_R * DROP_R && this.loaded.has(t.id)) this.unload(t.id);
      else if (d2 < LOAD_R * LOAD_R && !this.loaded.has(t.id) && !this.fetching.has(t.id) && performance.now() - (this.failed.get(t.id) ?? -30000) > 10000) void this.fetch(t).then((p) => { if (p) this.buildQueue.push(p); });
    }
    if (this.buildQueue.length) {
      this.buildQueue.sort((a, b) => boxDist2(a.spec.box, x, z) - boxDist2(b.spec.box, x, z));
      const p = this.buildQueue.shift()!;
      if (boxDist2(p.spec.box, x, z) < DROP_R * DROP_R) this.mount(p);
    }
  }

  private fetch(t: TileSpec): Promise<Pending | null> {
    let p = this.fetching.get(t.id);
    if (!p) {
      p = Promise.all([loadTile(this.base, t), loadTileTerrain(this.base, t)])
        .then(([json, terrain]): Pending | null => ({ spec: t, json, terrain }))
        .catch((e) => { this.failed.set(t.id, performance.now()); console.warn('tile load failed', t.id, e); return null; })
        .finally(() => this.fetching.delete(t.id));
      this.fetching.set(t.id, p);
    }
    return p;
  }

  private mount(p: Pending | null) {
    if (!p || this.loaded.has(p.spec.id)) return;
    const { spec, json: tj, terrain: tpack } = p;
    const ord = this.man.tiles.indexOf(spec);
    const scope = this.scopeSeq++;
    const w = this.walk;
    const keys: string[] = [], fpKeys: string[] = [], fpList: Footprint[] = [];
    if (tpack) this.terrain.registerPatch(spec.id, tpack);
    w.beginScope(scope);
    try {
      const shim: World = { json: tj as unknown as WorldJson, terrain: this.terrain };
      const bld = buildBuildings(shim, ord * ID_STRIDE);
      bld.footprints.forEach((f, i) => { f.key = `${spec.id}:${i}`; });
      // Only owner-flagged entities emit — margin context exists solely for builders that need it.
      const pj = { ...tj, roads: prim(tj.roads), areas: prim(tj.areas), lines: prim(tj.lines), points: prim(tj.points) } as unknown as WorldJson;
      const shim2: World = { json: pj, terrain: this.terrain };
      const structures = buildStructures(shim2, w);
      const signs = buildSigns(shim, bld.signs, w); // full json: intersection signs need context roads
      const props = buildProps(shim2, w, structures.pierSegs, { mailboxes: bld.mailboxes });

      const doors: Door[] = [];
      bld.footprints.forEach((f) => { fpKeys.push(f.key!); fpList.push(f);
        const key = f.key!;
        this.fpByKey.set(key, f);
        if (f.door === undefined || f.kind === 'lighthouse') {
          if (f.raise > 0.5) w.addPolygon(f.ring, { floor0: f.floor0, floorH: 3, levels: 1, ground: true }, null, f.floor0 - 0.6);
          else w.addPolygon(f.ring);
          return;
        }
        const door = bld.doors[f.door];
        this.fpDoor.set(f, door);
        doors.push(door);
        const plan = planInterior(key, f, door, Math.floor(f.seed * 4294967296));
        const pid = registerPlan(w, f, plan);
        this.plans.set(key, plan);
        this.interiors.register(key, f, plan, pid);
        keys.push(key);
      });
      for (const [a, b, y0, y1] of bld.colliders.walls) w.addWall(a, b, y0, y1);
      for (const d of bld.colliders.decks) w.addDeck(d);
      for (const pl of bld.pilings) {
        const c = Math.cos(pl.ang) * 0.17, s = Math.sin(pl.ang) * 0.17;
        w.addLoop([[pl.x - c + s, pl.z - s - c], [pl.x + c + s, pl.z + s - c], [pl.x + c - s, pl.z + s + c], [pl.x - c - s, pl.z - s + c]], -Infinity, 2.2 + Math.max(0, this.terrain.heightAt(pl.x, pl.z)));
      }
      w.endScope();

      const group = new THREE.Group();
      group.name = `tile:${spec.id}`;
      group.add(bld.group, structures.group, signs.mesh, props.group);
      group.add(props.halo(bld.lanterns, 7, new THREE.Color(1.0, 0.85, 0.55)));
      group.add(props.halo(structures.towers, 1.2, new THREE.Color(1.0, 0.75, 0.45)));
      this.scene.add(group);
      this.loaded.set(spec.id, {
        spec, group, scope, keys,
        fps: bld.footprints,
        doors,
        walks: bld.walks,
        poles: signs.poles,
        churches: bld.footprints.filter((f) => f.kind === 'church').map((f) => f.ring[0] as [number, number]),
        primRoads: pj.roads,
      });
      this.markDirty();
      this.onTile?.(this.loaded.get(spec.id)!);
    } catch (e) {
      w.endScope();
      w.removeScope(scope);
      if (tpack) this.terrain.removePatch(spec.id);
      // sweep any state the failed build registered part-way through
      if (keys.length) this.interiors.unregister(keys);
      for (const k of keys) this.plans.delete(k);
      for (const k of fpKeys) this.fpByKey.delete(k);
      for (const f of fpList) this.fpDoor.delete(f);
      const g = this.scene.getObjectByName(`tile:${spec.id}`);
      if (g) {
        this.scene.remove(g);
        g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
      }
      console.warn('tile build failed', spec.id, e);
    }
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
    this.loaded.delete(id);
    this.markDirty();
  }
}

// BuildingsResult type re-export for convenience.
export type { BuildingsResult };
