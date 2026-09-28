// Kerbside cars at city scale. A Manhattan tile has thousands of parked cars — far too many to draw
// in full, and a tile's InstancedMesh can't pick a level of detail per car. So props.ts hands the
// kerb and lot cars over as plain records (see KERB_STRIDE) and this one manager draws them all:
// every few metres walked it refills, per car type, a full-kit InstancedMesh with the handful of
// cars at arm's length (kit.ts carLib), a lite-kit one with the rest of the street (carLiteLib), and
// a single proxy InstancedMesh (carFarLib: two blocks, scaled to the type) with everything else out
// to FAR_R. Two dozen draw calls for every parked car in view.
// Taken cars (driven off by the player; vehicles.ts) are skipped by key.
import * as THREE from 'three';
import { CAR_TYPES, carFarLib, carFarScale, carLib, carLiteLib, type CarType } from '../assets/kit';
import { propMaterial } from '../render/propMaterial';

/** Record layout, floats per car: x, y, z, yaw, type index, r, g, b, scale x, y, z. */
export const KERB_STRIDE = 11;

const FULL_R = 30, NEAR_R = 110, FAR_R = 1400, FULL_CAP = 48, NEAR_CAP = 700, FAR_CAP = 16000;

export class KerbCars {
  readonly group = new THREE.Group();
  /** vehicles.ts: keys of cars the player drove off in */
  skip: (key: string) => boolean = () => false;
  private tiles = new Map<string, Float32Array>();
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

  add(id: string, data: Float32Array | undefined) {
    if (!data || !data.length) return;
    this.tiles.set(id, data);
    this.dirty = true;
  }
  remove(id: string) {
    if (this.tiles.delete(id)) this.dirty = true;
  }
  refresh() { this.dirty = true; }

  /** Per frame: refill when the walker has moved a few metres (or the set changed). */
  update(x: number, z: number) {
    if (!this.dirty && Math.hypot(x - this.lx, z - this.lz) < 6) return;
    this.dirty = false;
    this.lx = x;
    this.lz = z;
    const fullN = this.full.map(() => 0), nearN = this.near.map(() => 0);
    let farN = 0;
    const U2 = FULL_R * FULL_R, N2 = NEAR_R * NEAR_R, F2 = FAR_R * FAR_R;
    for (const [id, d] of this.tiles) {
      for (let i = 0, k = 0; i + KERB_STRIDE <= d.length; i += KERB_STRIDE, k++) {
        const dx = d[i] - x, dz = d[i + 2] - z, r2 = dx * dx + dz * dz;
        if (r2 > F2) continue;
        const t = d[i + 4];
        if (this.skip(`${id}:kerb:${k}`)) continue;
        this.q.setFromAxisAngle(this.up, d[i + 3]);
        this.p.set(d[i], d[i + 1], d[i + 2]);
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
        if (this.skip(key)) continue;
        best = { key, x: d[i], z: d[i + 2], yaw: d[i + 3], color: this.c.setRGB(d[i + 5], d[i + 6], d[i + 7]).getHex(), model: CAR_TYPES[d[i + 4]], d: dist };
      }
    return best;
  }
}
