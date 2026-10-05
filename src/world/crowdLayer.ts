// The beach's people on screen: every tile's crowd records (world/crowd.ts) drawn by one manager —
// the nearest in the full body, the rest of the beach in the lite one (people.ts personLiteGeometry),
// each posed in the shader (creature.ts BEACH), two draws for all of them. Only the people there at
// the world's hour are drawn (each record carries its hours: calendar.ts): the beach fills through
// the morning and empties into the evening. Someone due to come or go while you're looking at them
// waits until you look away (or until the clock jumps: a shot, the panel), so nobody pops in or out
// of view. A phone draws at most half as many people as the life sim may (protocol.ts CAPS.peds).
import * as THREE from 'three';
import { personLib, personLiteLib } from '../assets/people';
import { creatureMaterial } from '../render/creature';
import { CROWD_STRIDE, POSE } from './crowd';
import { present } from './calendar';
import type { Tier } from '../render/quality';

/** A tier's crowd: people in the full body within `nearR` (at most `full`), in the lite one out to
 *  `farR` (at most `lite`). `nearR` is for the walking lens: a longer lens (photo zoom, a 12° shot)
 *  draws people as large from further off, so it reaches further by as much as the lens magnifies —
 *  the full body is chosen by how big a person is on screen, not how far away they stand. */
export interface CrowdTier { full: number; lite: number; nearR: number; farR: number }
export const CROWD_TIERS: Record<Tier, CrowdTier> = {
  desktop: { full: 120, lite: 1400, nearR: 45, farR: 420 },
  phone: { full: 40, lite: 280, nearR: 30, farR: 240 },
  low: { full: 20, lite: 140, nearR: 20, farR: 150 },
};
/** Within this far, and in front of you, the crowd waits for you to look away before it changes. */
const HOLD_R = 140;

export class CrowdLayer {
  readonly group = new THREE.Group();
  private tiles = new Map<string, { d: Float32Array; shown: Uint8Array }>();
  private meshes: { im: THREE.InstancedMesh; pose: THREE.InstancedBufferAttribute; cap: number }[] = [];
  private lx = Infinity;
  private lz = Infinity;
  private hourDrawn = NaN;
  private lensDrawn = 1;
  private dirty = true;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  // candidates, nearest first: squared distance, tile, record
  private cd = new Float64Array(0);
  private ct: Float32Array[] = [];
  private ci = new Int32Array(0);
  private order = new Int32Array(0);
  /** How many are drawn (the tests' and the probes' count): full, lite. */
  readonly drawn = { full: 0, lite: 0 };

  constructor(readonly tier: CrowdTier = CROWD_TIERS.desktop) {
    this.group.name = 'beach-people';
    const mat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, BEACH: 1 });
    for (const [geo, cap, name] of [[personLib(), tier.full, 'beach-people'], [personLiteLib(), tier.lite, 'beach-people:lite']] as const) {
      const g = geo.clone();
      const pose = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      pose.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aPose', pose);
      const im = new THREE.InstancedMesh(g, mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      im.count = 0;
      im.frustumCulled = false; // (refilled round the walker: its bounds would always be stale)
      im.name = name;
      // (no shadow: the shadow pass draws the standing body — a lying one's would stand up off the towel)
      this.meshes.push({ im, pose, cap });
      this.group.add(im);
    }
  }

  add(id: string, data: Float32Array | undefined) {
    if (!data || data.length < CROWD_STRIDE) return;
    this.tiles.set(id, { d: data, shown: new Uint8Array(data.length / CROWD_STRIDE).fill(255) });
    this.dirty = true;
  }
  remove(id: string) { if (this.tiles.delete(id)) this.dirty = true; }

  /** Per frame: refill when the walker has moved a few metres, the set changed, the clock has
   *  moved on a minute or so, or the lens changed. `view`: where the camera is and looks (x, z,
   *  forward x, forward z). `lens`: how much the camera magnifies over the walking lens (1 at 62°;
   *  about 5.5 at 12°). */
  update(x: number, z: number, hour: number, view?: [number, number, number, number], lens = 1) {
    const dh = Math.abs(hour - this.hourDrawn), jump = !(dh < 0.25) && !(dh > 23.75);
    if (!(dh < 0.02)) this.dirty = true;
    lens = Math.max(1, lens);
    if (Math.abs(lens / this.lensDrawn - 1) > 0.1) { this.dirty = true; this.lensDrawn = lens; }
    if (!this.dirty && Math.hypot(x - this.lx, z - this.lz) < 4) return;
    this.dirty = false;
    this.hourDrawn = hour;
    this.lx = x;
    this.lz = z;
    const T = this.tier, F2 = T.farR * T.farR, N2 = (T.nearR * this.lensDrawn) ** 2;
    // who's here: present now — or, in front of you and near, as they were drawn
    let n = 0;
    for (const t of this.tiles.values()) n += t.shown.length;
    if (this.ci.length < n) { this.cd = new Float64Array(n); this.ci = new Int32Array(n); this.order = new Int32Array(n); this.ct = new Array(n); }
    let k = 0;
    for (const t of this.tiles.values()) {
      const d = t.d, S = t.shown;
      for (let i = 0, r = 0; i + CROWD_STRIDE <= d.length; i += CROWD_STRIDE, r++) {
        const dx = d[i] - x, dz = d[i + 2] - z, r2 = dx * dx + dz * dz;
        const want = present(hour, d[i + 9], d[i + 10]) ? 1 : 0;
        if (S[r] !== want) {
          const held = S[r] !== 255 && !jump && view && r2 < HOLD_R * HOLD_R && (d[i] - view[0]) * view[2] + (d[i + 2] - view[1]) * view[3] > -2;
          if (!held) S[r] = want;
        }
        if (!S[r] || r2 > F2) continue;
        this.cd[k] = r2;
        this.ct[k] = d;
        this.ci[k] = i;
        this.order[k] = k;
        k++;
      }
    }
    const ord = this.order.subarray(0, k).sort((a, b) => this.cd[a] - this.cd[b]);
    const [F, L] = this.meshes;
    let nf = 0, nl = 0;
    for (const o of ord) {
      const d = this.ct[o], i = this.ci[o];
      const near = this.cd[o] < N2 && nf < F.cap;
      if (!near && nl >= L.cap) break;
      const M = near ? F : L, j = near ? nf++ : nl++;
      this.q.setFromAxisAngle(this.up, d[i + 3]);
      this.p.set(d[i], d[i + 1], d[i + 2]);
      this.s.setScalar(d[i + 5]);
      M.im.setMatrixAt(j, this.m.compose(this.p, this.q, this.s));
      M.im.setColorAt(j, this.c.setRGB(d[i + 6], d[i + 7], d[i + 8]));
      M.pose.setX(j, d[i + 4]);
    }
    for (const [M, c] of [[F, nf], [L, nl]] as const) {
      M.im.count = c;
      M.im.instanceMatrix.needsUpdate = true;
      if (M.im.instanceColor) M.im.instanceColor.needsUpdate = true;
      M.pose.needsUpdate = true;
    }
    this.drawn.full = nf;
    this.drawn.lite = nl;
  }

  /** The people drawn now, for probes: world position and pose. */
  *people(): Generator<{ x: number; y: number; z: number; pose: number; lite: boolean }> {
    for (const [mi, M] of this.meshes.entries())
      for (let j = 0; j < M.im.count; j++) {
        M.im.getMatrixAt(j, this.m);
        this.p.setFromMatrixPosition(this.m);
        yield { x: this.p.x, y: this.p.y, z: this.p.z, pose: M.pose.getX(j), lite: mi === 1 };
      }
  }
}
export { POSE };
