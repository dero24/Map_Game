// The Grow verb (docs/CONSTRUCTION.md stage 1): R plants a seed on open ground where you stand.
// It sprouts at once and grows while you walk — a plant reaches bloom in about twenty minutes of
// play — and keeps growing while you're away (a day away is a season). Your garden is saved with
// real lat/lon, so it waits for you in the real place. Species come from the region's garden mix;
// Shift+R picks the next seed in the packet.
import * as THREE from 'three';
import { openDB, type IDBPDatabase } from 'idb';
import type { GameCtx } from './ctx';
import type { WalkWorld } from '../player/collision';
import { plantMix, plantLib, stageOf, inBloom, SPECIES, type PlantSpecies } from '../assets/flora';
import { propMaterial } from '../render/propMaterial';
import { hashf } from '../assets/core';

export interface Planted { id: string; sp: PlantSpecies; seed: number; lat: number; lon: number; g: number; t: number; yaw: number }
const GROW_PER_SEC = 1 / (20 * 60); // twenty minutes of play to maturity
const GROW_PER_DAY_AWAY = 1;

export class Garden {
  readonly group = new THREE.Group();
  plants: Planted[] = [];
  private meshes = new Map<string, { mesh: THREE.Mesh; stage: number; bloom: boolean }>();
  private db: Promise<IDBPDatabase> | null = null;
  private mat = propMaterial({ wind: true });
  private saveT = 5;
  private packet = 0;
  private dirty = false;
  onBloom: ((p: Planted) => void) | null = null;
  /** a bed was dug: clear the wild grass around it (main → grass.invalidateBox) */
  onClear: ((x: number, z: number) => void) | null = null;
  private dug = new Set<string>();

  constructor(private g: GameCtx, private walk: WalkWorld, private climate: string, private eco = '') {
    this.group.name = 'garden';
    try { if (typeof indexedDB !== 'undefined') this.db = openDB('map-game-garden', 1, { upgrade: (d) => d.createObjectStore('plants', { keyPath: 'id' }) }); } catch { this.db = null; }
  }

  async load() {
    if (!this.db) return;
    try {
      this.plants = ((await (await this.db).getAll('plants')) ?? []) as Planted[];
      // growth while you were away
      const now = Date.now();
      for (const p of this.plants) p.g = Math.min(1, p.g + ((now - p.t) / 86400000) * GROW_PER_DAY_AWAY), (p.t = now);
      this.dirty = true;
    } catch { this.plants = []; }
  }

  /** The seed R would plant here. */
  get nextSpecies(): PlantSpecies {
    const mix = plantMix(this.climate, this.eco);
    return mix[this.packet % mix.length][0];
  }
  cycle() { this.packet++; this.g.toast(`seed packet: ${SPECIES[this.nextSpecies].label}`); }

  /** Where a seed would go (a step ahead), or why not. */
  site(): { x: number; z: number } | string {
    const w = this.g.walker;
    const x = w.x - Math.sin(w.yaw) * 1.6, z = w.z - Math.cos(w.yaw) * 1.6;
    const t = this.g.terrain;
    if (t.sdfAt(x, z) < 1) return 'too close to the water';
    if (this.walk.buildingAt(x, z) >= 0 || this.walk.blocked(x, z, 0.35)) return 'no room there';
    if (this.walk.deckAt(x, z) !== null && Math.abs((this.walk.deckAt(x, z) ?? 0) - t.heightAt(x, z)) > 0.2) return 'not on the boards';
    // paved: a mapped street right there
    for (const r of this.g.roads()) {
      if (r.lod || !r.w) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
        if (Math.min(ax, bx) - r.w > x || Math.max(ax, bx) + r.w < x || Math.min(az, bz) - r.w > z || Math.max(az, bz) + r.w < z) continue;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(ax + dx * k - x, az + dz * k - z) < r.w / 2 + 0.3) return 'that’s pavement';
      }
    }
    for (const p of this.plants) {
      const [px, pz] = this.g.fromLatLon(p.lat, p.lon);
      if (Math.hypot(px - x, pz - z) < Math.max(0.7, SPECIES[p.sp].w * 0.6)) return 'too close to another plant';
    }
    return { x, z };
  }

  plant() {
    const s = this.site();
    if (typeof s === 'string') { this.g.toast(`can’t plant here — ${s}`); return; }
    const [lat, lon] = this.g.toLatLon(s.x, s.z);
    const sp = this.nextSpecies;
    const p: Planted = { id: `pl-${Date.now().toString(36)}`, sp, seed: 1 + Math.floor(hashf(Date.now() & 0xffffff) * 9), lat, lon, g: 0.04, t: Date.now(), yaw: hashf(Date.now() >>> 3) * 6.28 };
    this.plants.push(p);
    this.dirty = true;
    this.g.sound('brush');
    this.g.toast(`planted ${SPECIES[sp].label} — it grows while you walk`);
  }

  /** Grow (dt s of play), keep meshes current near the walker. */
  update(dt: number, month: number, south: boolean) {
    const w = this.g.walker;
    for (const p of this.plants) {
      const before = p.g;
      p.g = Math.min(1, p.g + dt * GROW_PER_SEC);
      p.t = Date.now();
      if (before < 0.6 && p.g >= 0.6 && inBloom(p.sp, month, south)) this.onBloom?.(p);
      if (stageOf(before) !== stageOf(p.g)) this.dirty = true;
    }
    for (const p of this.plants) {
      const [x, z] = this.g.fromLatLon(p.lat, p.lon);
      const near = Math.hypot(x - w.x, z - w.z) < 400;
      const cur = this.meshes.get(p.id);
      if (!near) { if (cur) { this.group.remove(cur.mesh); this.meshes.delete(p.id); } continue; }
      const stage = stageOf(p.g), bloom = inBloom(p.sp, month, south);
      if (!this.dug.has(p.id)) {
        // a small dug bed: the plant is solid underfoot and the tall grass keeps its distance
        this.dug.add(p.id);
        const r = 0.22;
        this.walk.addLoop([[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]], -Infinity, Math.max(this.g.terrain.heightAt(x, z), 0) + SPECIES[p.sp].h);
        this.onClear?.(x, z);
      }
      if (cur && cur.stage === stage && cur.bloom === bloom) continue;
      if (cur) this.group.remove(cur.mesh);
      const mesh = new THREE.Mesh(this.leafy(p.sp, p.seed % 3, stage, bloom), this.mat);
      mesh.position.set(x, Math.max(this.g.terrain.heightAt(x, z), 0), z);
      mesh.rotation.y = p.yaw;
      mesh.name = `plant:${p.sp}`;
      mesh.layers.enable(1);
      this.group.add(mesh);
      this.meshes.set(p.id, { mesh, stage, bloom });
    }
    if ((this.saveT -= dt) <= 0 && this.dirty) { this.saveT = 5; this.dirty = false; void this.save(); }
  }
  private async save() {
    if (!this.db) return;
    try {
      const tx = (await this.db).transaction('plants', 'readwrite');
      for (const p of this.plants) void tx.store.put(p);
      await tx.done;
    } catch { /* ignore */ }
  }
  // your plants are single meshes (no instance colour), so their leaves are painted green here
  private tints = new Map<string, THREE.BufferGeometry>();
  private leafy(sp: PlantSpecies, v: number, stage: number, bloom: boolean) {
    const k = `${sp}:${v}:${stage}:${bloom}`;
    let g = this.tints.get(k);
    if (!g) {
      g = plantLib(sp, v, stage, bloom).clone();
      const c = new THREE.Color(0x5f8a3e), col = g.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.98 && col.getY(i) > 0.98 && col.getZ(i) > 0.98) col.setXYZ(i, c.r, c.g, c.b);
      this.tints.set(k, g);
    }
    return g;
  }
  /** Garden plants in world coords (map pins, butterflies). */
  positions() { return this.plants.map((p) => { const [x, z] = this.g.fromLatLon(p.lat, p.lon); return { x, z, sp: p.sp, g: p.g }; }); }
}
