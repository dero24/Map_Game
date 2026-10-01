// Kerbside cars at city scale. A Manhattan tile has thousands of parked cars — far too many to draw
// in full, and a tile's InstancedMesh can't pick a level of detail per car. So props.ts hands the
// kerb and lot cars over as plain records (see KERB_STRIDE) and this one manager draws them all:
// every few metres walked it refills, per car type, a full-kit InstancedMesh with the handful of
// cars at arm's length (kit.ts carLib), a lite-kit one with the rest of the street (carLiteLib), and
// a single proxy InstancedMesh (carFarLib: two blocks, scaled to the type) with everything else out
// to FAR_R. Two dozen draw calls for every parked car in view.
// Taken cars (driven off by the player; vehicles.ts) are skipped by key.
// A car that comes and goes through the day (a beach lot's: calendar.ts) carries the hours it is
// parked for; it is drawn only then, and walled only then — its walls go in and out of the walk
// world as it arrives and leaves (its own collision scope), not with its tile. One due to arrive or
// leave in front of you waits until you look away (the clock jumping — a shot, the panel — doesn't
// wait), as the beach's people do (crowdLayer.ts).
import * as THREE from 'three';
import { CAR_TYPES, carFarLib, carFarScale, carLib, carLiteLib, carRecipe, type CarType } from '../assets/kit';
import { propMaterial } from '../render/propMaterial';
import { present } from './calendar';

/** Record layout, floats per car: x, y, z, yaw, type index, r, g, b, scale x, y, z, and the hours
 *  it is parked (arrive, leave — 0, 24: all day; leave before arrive: overnight). */
export const KERB_STRIDE = 13;
/** Is the car at record offset `i` parked at this hour? */
export const parkedAt = (d: Float32Array, i: number, hour: number) => present(hour, d[i + 11], d[i + 12]);
const allDay = (d: Float32Array, i: number) => d[i + 11] <= 0 && d[i + 12] >= 24;
/** The walls a car stands in (the outline props.ts gave it at build: its recipe's length and width). */
export function carCorners(x: number, z: number, yaw: number, type: CarType): [number, number][] {
  const rc = carRecipe(type, 1), hl = rc.L / 2, hw = rc.W / 2 + 0.05, cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [x + u * cy + v * sy, z - u * sy + v * cy] as [number, number]);
}
/** What KerbCars needs of the walk world to wall a car while it's there. */
export interface KerbWalls {
  withScope<T>(id: number, fn: () => T): T;
  addLoop(pts: [number, number][], y0?: number, y1?: number): void;
  removeScope(id: number, purge?: boolean | 'later'): void;
}
/** Collision scopes of the cars that come and go: one each, counting down from here (tiles count
 *  up from 0; an interior's are −7…−9). */
const SCOPE0 = -1_000_000;

const FULL_R = 30, NEAR_R = 110, FAR_R = 1400, FULL_CAP = 48, NEAR_CAP = 700, FAR_CAP = 16000;

export class KerbCars {
  readonly group = new THREE.Group();
  /** vehicles.ts: keys of cars the player drove off in */
  skip: (key: string) => boolean = () => false;
  /** main: the walk world, which walls the cars that come and go while they're parked */
  walls: KerbWalls | null = null;
  /** the world's hour the cars are parked for (update's), and where the camera is and looks */
  private hour = 12;
  private hourDrawn = NaN;
  private jump = true;
  private view: [number, number, number, number] | undefined;
  // the cars that come and go, by tile: which are parked as drawn (by record; 255 not yet), and the
  // collision scope of each while it's walled
  private comers = new Map<string, { k: number[]; on: Uint8Array; scope: Map<number, number> }>();
  private nextScope = SCOPE0;
  private tiles = new Map<string, Float32Array>();
  // the live ground under each far car, looked up once and kept until a tile mounts near it
  private hy = new Map<string, { h: Float32Array; box: [number, number, number, number] }>();
  private full: THREE.InstancedMesh[] = [];
  private near: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh;
  private lx = Infinity;
  private lz = Infinity;
  private dirty = true;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private farScale = CAR_TYPES.map((t) => carFarScale(t));
  /** the open-air surface at (x,z) nearest height y (main: WalkWorld.outdoorNear): the cars within
   *  NEAR_R stand on their four wheels on a hill — pitched up the grade, rolled to the camber —
   *  instead of level on the one spot under their middle */
  ground: ((x: number, z: number, y: number) => number) | null = null;
  /** the live ground height (main: Terrain.heightAt): the cars past NEAR_R stand on it too — a record's
   *  y is the ground its tile was built on, and a stand-in's DEM, a graded street or a later
   *  neighbour's patch can each have moved it (cars hung over downtown, or sank to the roof) */
  height: ((x: number, z: number) => number) | null = null;
  private tq = new THREE.Quaternion();
  private xAxis = new THREE.Vector3(1, 0, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);
  private pose(x: number, y: number, z: number, yaw: number, tilt: boolean, hy?: Float32Array, k = 0) {
    this.q.setFromAxisAngle(this.up, yaw);
    this.p.set(x, y, z);
    const g = this.ground;
    if (!g || !tilt) {
      if (this.height && hy) {
        if (Number.isNaN(hy[k])) hy[k] = this.height(x, z);
        this.p.y = hy[k] + 0.04;
      }
      return;
    }
    // wheels at ±1.4 m along, ±0.8 m across (the kit sedan's axles and track)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const yf = g(x + fx * 1.4, z + fz * 1.4, y), yb = g(x - fx * 1.4, z - fz * 1.4, y);
    const yr = g(x + rx * 0.8, z + rz * 0.8, y), yl = g(x - rx * 0.8, z - rz * 0.8, y);
    this.q.multiply(this.tq.setFromAxisAngle(this.zAxis, Math.atan2(yr - yl, 1.6)));
    this.q.multiply(this.tq.setFromAxisAngle(this.xAxis, Math.atan2(yf - yb, 2.8)));
    this.p.y = (yf + yb + yr + yl) / 4 + 0.04;
  }

  constructor() {
    this.group.name = 'kerb-cars';
    const mat = propMaterial();
    for (const t of CAR_TYPES) {
      const fm = new THREE.InstancedMesh(carLib(t as CarType).clone(), mat, FULL_CAP);
      fm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FULL_CAP * 3), 3);
      fm.count = 0;
      fm.frustumCulled = false;
      fm.layers.enable(1);
      fm.name = `kerb-cars:${t}:full`;
      this.full.push(fm);
      this.group.add(fm);
      const im = new THREE.InstancedMesh(carLiteLib(t as CarType).clone(), mat, NEAR_CAP);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_CAP * 3), 3);
      im.count = 0;
      im.frustumCulled = false; // refilled around the walker; its bounds would always be stale
      im.layers.enable(1); // near cars cast shadows
      im.name = `kerb-cars:${t}`;
      this.near.push(im);
      this.group.add(im);
    }
    this.far = new THREE.InstancedMesh(carFarLib().clone(), mat, FAR_CAP);
    this.far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FAR_CAP * 3), 3);
    this.far.count = 0;
    this.far.frustumCulled = false;
    this.far.name = 'kerb-cars:far';
    this.group.add(this.far);
  }

  /** A tile's cars; `box` (x0, z0, x1, z1) is the ground it mounted — the far cars standing on or
   *  near it look their ground up again (a real cell's graded ground replacing a stand-in's). */
  add(id: string, data: Float32Array | undefined, box?: [number, number, number, number]) {
    if (box) for (const e of this.hy.values()) if (e.box[0] < box[2] + 64 && e.box[2] > box[0] - 64 && e.box[1] < box[3] + 64 && e.box[3] > box[1] - 64) e.h.fill(NaN);
    if (!data || !data.length) return;
    this.tiles.set(id, data);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const k: number[] = [];
    for (let i = 0, r = 0; i + KERB_STRIDE <= data.length; i += KERB_STRIDE, r++) {
      (x0 = Math.min(x0, data[i])), (x1 = Math.max(x1, data[i])), (z0 = Math.min(z0, data[i + 2])), (z1 = Math.max(z1, data[i + 2]));
      if (!allDay(data, i)) k.push(r);
    }
    this.hy.set(id, { h: new Float32Array(data.length / KERB_STRIDE).fill(NaN), box: [x0, z0, x1, z1] });
    if (k.length) {
      this.comers.set(id, { k, on: new Uint8Array(data.length / KERB_STRIDE).fill(255), scope: new Map() });
      this.syncComers(id);
    }
    this.dirty = true;
  }
  remove(id: string) {
    this.hy.delete(id);
    const c = this.comers.get(id);
    if (c && this.walls) for (const s of c.scope.values()) this.walls.removeScope(s, true);
    this.comers.delete(id);
    if (this.tiles.delete(id)) this.dirty = true;
  }
  refresh() { this.dirty = true; for (const id of this.comers.keys()) this.syncComers(id); }

  /** The tile's comers: parked or gone by the hour (a taken one gone at once; one in front of you
   *  waits for you to look away), and walled while they're parked. */
  private syncComers(id: string) {
    const c = this.comers.get(id), d = this.tiles.get(id), W = this.walls, V = this.view;
    if (!c || !d) return;
    for (const r of c.k) {
      const i = r * KERB_STRIDE, taken = this.skip(`${id}:kerb:${r}`), want = parkedAt(d, i, this.hour) && !taken ? 1 : 0;
      if (c.on[r] !== want) {
        const dx = d[i] - (V?.[0] ?? 0), dz = d[i + 2] - (V?.[1] ?? 0);
        const held = c.on[r] !== 255 && !taken && !this.jump && V && dx * dx + dz * dz < 140 * 140 && dx * V[2] + dz * V[3] > -3;
        if (!held) c.on[r] = want;
      }
      if (!W) continue;
      const s = c.scope.get(r);
      if (c.on[r] === 1 && s === undefined) {
        const scope = this.nextScope--;
        W.withScope(scope, () => W.addLoop(carCorners(d[i], d[i + 2], d[i + 3], CAR_TYPES[d[i + 4]] as CarType)));
        c.scope.set(r, scope);
      } else if (c.on[r] !== 1 && s !== undefined) {
        W.removeScope(s, true);
        c.scope.delete(r);
      }
    }
  }
  /** Is the car at record `r` (offset i) of tile `id` drawn now? */
  private parked(id: string, d: Float32Array, i: number, r: number) { return allDay(d, i) || this.comers.get(id)?.on[r] === 1; }

  /** Per frame: refill when the walker has moved a few metres, the set changed, or the world's
   *  clock has moved on (a few minutes: the beach lots fill and empty through the day). `view`:
   *  where the camera is and looks (x, z, forward x, forward z). */
  update(x: number, z: number, hour = this.hour, view?: [number, number, number, number]) {
    this.hour = hour;
    this.view = view;
    if (!(Math.abs(hour - this.hourDrawn) < 0.05)) {
      const dh = Math.abs(hour - this.hourDrawn);
      this.jump = !(dh < 0.25) && !(dh > 23.75);
      this.hourDrawn = hour;
      for (const id of this.comers.keys()) this.syncComers(id);
      this.jump = false;
      this.dirty = true;
    }
    if (!this.dirty && Math.hypot(x - this.lx, z - this.lz) < 6) return;
    this.dirty = false;
    this.lx = x;
    this.lz = z;
    const fullN = this.full.map(() => 0), nearN = this.near.map(() => 0);
    let farN = 0;
    const U2 = FULL_R * FULL_R, N2 = NEAR_R * NEAR_R, F2 = FAR_R * FAR_R;
    for (const [id, d] of this.tiles) {
      const hy = this.hy.get(id)?.h;
      for (let i = 0, k = 0; i + KERB_STRIDE <= d.length; i += KERB_STRIDE, k++) {
        const dx = d[i] - x, dz = d[i + 2] - z, r2 = dx * dx + dz * dz;
        if (r2 > F2) continue;
        const t = d[i + 4];
        // (only a car that will be drawn is posed: the far ring holds tens of thousands)
        if (!(r2 < U2 && fullN[t] < FULL_CAP) && !(r2 < N2 && nearN[t] < NEAR_CAP) && farN >= FAR_CAP) continue;
        if (!this.parked(id, d, i, k) || this.skip(`${id}:kerb:${k}`)) continue;
        this.pose(d[i], d[i + 1], d[i + 2], d[i + 3], r2 < N2, hy, k);
        this.c.setRGB(d[i + 5], d[i + 6], d[i + 7]);
        if (r2 < U2 && fullN[t] < FULL_CAP) {
          this.s.set(d[i + 8], d[i + 9], d[i + 10]);
          const im = this.full[t];
          im.setMatrixAt(fullN[t], this.m.compose(this.p, this.q, this.s));
          im.setColorAt(fullN[t]++, this.c);
        } else if (r2 < N2 && nearN[t] < NEAR_CAP) {
          this.s.set(d[i + 8], d[i + 9], d[i + 10]);
          const im = this.near[t];
          im.setMatrixAt(nearN[t], this.m.compose(this.p, this.q, this.s));
          im.setColorAt(nearN[t]++, this.c);
        } else if (farN < FAR_CAP) {
          const fs = this.farScale[t];
          this.s.set(fs[0] * d[i + 8], fs[1] * d[i + 9], fs[2] * d[i + 10]);
          this.far.setMatrixAt(farN, this.m.compose(this.p, this.q, this.s));
          this.far.setColorAt(farN++, this.c);
        }
      }
    }
    this.full.forEach((im, t) => {
      im.count = fullN[t];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
    this.near.forEach((im, t) => {
      im.count = nearN[t];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
    this.far.count = farN;
    this.far.instanceMatrix.needsUpdate = true;
    if (this.far.instanceColor) this.far.instanceColor.needsUpdate = true;
  }

  /** The kerb car nearest (x, z) within r, for the player to drive off in. */
  find(x: number, z: number, r: number) {
    let best: { key: string; x: number; z: number; yaw: number; color: number; model: string; d: number } | null = null;
    for (const [id, d] of this.tiles)
      for (let i = 0, k = 0; i + KERB_STRIDE <= d.length; i += KERB_STRIDE, k++) {
        const dist = Math.hypot(d[i] - x, d[i + 2] - z);
        if (dist >= r || (best && dist >= best.d)) continue;
        const key = `${id}:kerb:${k}`;
        if (!this.parked(id, d, i, k) || this.skip(key)) continue;
        best = { key, x: d[i], z: d[i + 2], yaw: d[i + 3], color: this.c.setRGB(d[i + 5], d[i + 6], d[i + 7]).getHex(), model: CAR_TYPES[d[i + 4]], d: dist };
      }
    return best;
  }
}
