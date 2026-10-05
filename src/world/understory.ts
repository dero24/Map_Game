// The forest floor: a walker-centred field of the region's understory — under the westside
// Northwest's firs, knee-high fountains of sword fern, thickets of salal and Oregon grape; the East's and
// the North's ferns, bracken (copper in October, gone in the winter) and cinnamon fern (flora.ts
// understoryMix) — grown under a wood's canopy only, never under a lone yard tree, on open ground
// (never a road, a path, a building, a deck or water). Like the grass (grass.ts): cells built nearest
// first, a few a frame, each cell one merged mesh of foundry plants (flora.ts plantGeometry, the
// world's lite genome); deterministic per position, so a wood looks the same every visit.
import * as THREE from 'three';
import { plantLib, understoryMix, inBloom, inFall, isDormant, STAGES, type PlantSpecies } from '../assets/flora';
import { merge } from '../assets/core';
import { propMaterial } from '../render/propMaterial';
import { activeStyle, castOf, pickWeighted } from './styles';
import { worldDate } from './calendar';
import type { Terrain } from './data';
import type { WalkWorld } from '../player/collision';

const CELL = 16;
const PER_FRAME = 2;
/** A tree standing near the walker: its foot and its crown's reach (m). */
export interface Crown { x: number; z: number; r: number }

const hash = (x: number, z: number, k: number) => {
  let h = Math.imul(Math.floor(x * 5.71) ^ 0x7f4a7c15, 0x85ebca6b) ^ Math.imul(Math.floor(z * 3.97) + k * 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/** Is (x, z) under a wood's canopy: under a crown (not on a trunk's own foot), with three trees or
 *  more within 12 m — a wood, never a lone yard tree. (The forest floor grows here, and the grass
 *  mostly doesn't: grass.ts.) */
export function underWood(x: number, z: number, crowns: Crown[]) {
  let under = false, wood = 0;
  for (const c of crowns) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < c.r * 0.95 && d > 0.6) under = true;
    if (d < 12) wood++;
  }
  return under && wood >= 3;
}

/** Where the floor grows a plant, and which (pure: the field and the tests share it). A point under
 *  a crown, in a wood (three trees or more within 12 m), on open ground; then the region's mix by a
 *  hash of the place. Returns the species, its grown variant (0–1) and its scale, or null. */
export function floorAt(x: number, z: number, crowns: Crown[], mix: [PlantSpecies, number][], density: number, open: (x: number, z: number) => boolean): { sp: PlantSpecies; v: number; s: number } | null {
  if (!mix.length || hash(x, z, 1) > density || !underWood(x, z, crowns) || !open(x, z)) return null;
  return { sp: mix[pickWeighted(mix.map(([, w]) => w), hash(x, z, 2))][0], v: hash(x, z, 3) < 0.5 ? 0 : 1, s: 0.75 + hash(x, z, 4) * 0.5 };
}

export class UnderstoryField {
  readonly group = new THREE.Group();
  private mat = propMaterial({ wind: true });
  private cells = new Map<string, THREE.Mesh | null>();
  private queue: [number, number][] = [];
  enabled = true;
  /** metres round the walker (a phone's is shorter) */
  radius = 64;

  constructor(
    private terrain: Terrain,
    private walk: WalkWorld,
    /** the trees standing within r of (x, z) (NearTrees.crownsNear) */
    private crowns: (x: number, z: number, r: number) => Crown[],
    /** the painted ground's open land (GroundPaint.grassMask, as the grass reads it): never a road,
     *  a path, a drive or a footprint */
    private mask?: (x0: number, z0: number, size: number) => { res: number; data: Uint8Array },
  ) {
    this.group.name = 'understory';
  }

  invalidate() {
    for (const m of this.cells.values()) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.cells.clear();
  }
  /** Only the cells a freshly mounted (or dropped) tile touches: its trees came or went. */
  invalidateBox(b: { x0: number; z0: number; x1: number; z1: number }) {
    for (const [k, m] of this.cells) {
      const [cx, cz] = k.split('_').map(Number);
      const x0 = cx * CELL, z0 = cz * CELL;
      if (x0 + CELL < b.x0 - 20 || x0 > b.x1 + 20 || z0 + CELL < b.z0 - 20 || z0 > b.z1 + 20) continue;
      if (m) { this.group.remove(m); m.geometry.dispose(); }
      this.cells.delete(k);
    }
  }

  update(x: number, z: number) {
    if (!this.enabled || !understoryMix(castOf(activeStyle())).mix.length) { if (this.cells.size) this.invalidate(); return; }
    const R = this.radius;
    const want = new Set<string>();
    this.queue.length = 0;
    for (let cz = Math.floor((z - R) / CELL); cz <= Math.floor((z + R) / CELL); cz++)
      for (let cx = Math.floor((x - R) / CELL); cx <= Math.floor((x + R) / CELL); cx++) {
        if (Math.hypot((cx + 0.5) * CELL - x, (cz + 0.5) * CELL - z) > R + CELL * 0.72) continue;
        const k = `${cx}_${cz}`;
        want.add(k);
        if (!this.cells.has(k)) this.queue.push([cx, cz]);
      }
    for (const [k, m] of this.cells) if (!want.has(k)) { if (m) { this.group.remove(m); m.geometry.dispose(); } this.cells.delete(k); }
    this.queue.sort((a, b) => Math.hypot((a[0] + 0.5) * CELL - x, (a[1] + 0.5) * CELL - z) - Math.hypot((b[0] + 0.5) * CELL - x, (b[1] + 0.5) * CELL - z));
    const t0 = performance.now();
    for (let i = 0; i < Math.min(PER_FRAME, this.queue.length); i++) {
      const [cx, cz] = this.queue[i];
      const m = this.build(cx, cz);
      this.cells.set(`${cx}_${cz}`, m);
      if (m) this.group.add(m);
      if (performance.now() - t0 > 3) break;
    }
  }

  private build(cx: number, cz: number): THREE.Mesh | null {
    const { mix, density } = understoryMix(castOf(activeStyle()));
    const x0 = cx * CELL, z0 = cz * CELL;
    const crowns = this.crowns(x0 + CELL / 2, z0 + CELL / 2, CELL * 0.75 + 30);
    if (crowns.length < 3) return null;
    const t = this.terrain, walk = this.walk;
    const month = worldDate().getUTCMonth() + 1;
    const M = this.mask?.(x0, z0, CELL);
    const painted = (x: number, z: number) => {
      if (!M) return true;
      const i = Math.min(M.res - 1, Math.max(0, Math.floor(((x - x0) / CELL) * M.res))), j = Math.min(M.res - 1, Math.max(0, Math.floor(((z - z0) / CELL) * M.res)));
      return M.data[j * M.res + i] === 1;
    };
    // (open land: not the water, a road or path, a building, a deck, a trunk)
    const open = (x: number, z: number) => painted(x, z) && t.sdfAt(x, z) > 2 && walk.buildingAt(x, z) < 0 && walk.deckAt(x, z) === null && !walk.blocked(x, z, 0.5);
    const parts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    const step = 1.8;
    for (let gz = z0; gz < z0 + CELL; gz += step)
      for (let gx = x0; gx < x0 + CELL; gx += step) {
        const x = gx + hash(gx, gz, 7) * step, z = gz + hash(gx, gz, 8) * step;
        const f = floorAt(x, z, crowns, mix, density, open);
        if (!f || isDormant(f.sp, month)) continue; // (bracken dead and flat through the winter)
        const g = plantLib(f.sp, f.v, STAGES - 1, inBloom(f.sp, month), true, inFall(f.sp, month)).clone(); // (copper in October)
        g.applyMatrix4(m.compose(p.set(x, t.heightAt(x, z) - 0.05, z), q.setFromAxisAngle(up, hash(x, z, 5) * 6.283), s.set(f.s, f.s * (0.85 + hash(x, z, 6) * 0.3), f.s)));
        parts.push(g);
      }
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(merge(parts), this.mat);
    for (const g of parts) g.dispose();
    mesh.name = 'understory:cell';
    return mesh;
  }
}
