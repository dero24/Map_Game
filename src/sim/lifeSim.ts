// Ambient life simulation: gulls, cars, pedestrians, boats. Structure-of-arrays typed stores, a seeded
// xorshift RNG and a fixed timestep, so a given seed + input sequence always yields the same town.
import { makeRng, type Rng } from '../core/rng';
import { CAPS, RANGES, S, type LifeInit } from './protocol';

export interface LifeEnv { playerX: number; playerZ: number; night: number; hour: number; density: number; wind: number }

const ST = { WALK: 0, PAUSE: 1, BEACH: 2, FLY: 3, STAND: 4, LAND: 5, TO_DOOR: 6, INSIDE: 7, FROM_DOOR: 8 } as const;
export const PED_STATE = ST;
const TAU = Math.PI * 2;
const angLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};

export class LifeSim {
  readonly n: number;
  tick = 0;
  private rng: Rng;
  private env: LifeEnv = { playerX: 0, playerZ: 0, night: 0, hour: 12, density: 1, wind: 0.5 };
  // pose
  x: Float32Array; y: Float32Array; z: Float32Array; yaw: Float32Array;
  px: Float32Array; py: Float32Array; pz: Float32Array; pyaw: Float32Array;
  // motion
  vx: Float32Array; vy: Float32Array; vz: Float32Array; speed: Float32Array;
  anim: Float32Array; amt: Float32Array; timer: Float32Array; dodge: Float32Array;
  tx: Float32Array; ty: Float32Array; tz: Float32Array; // targets / circle centres
  fx: Float32Array; fy: Float32Array; fz: Float32Array; // walk-from points (beach)
  s: Float32Array; phase: Float32Array; radius: Float32Array;
  edge: Int32Array;
  dir: Int8Array; side: Int8Array;
  state: Uint8Array; active: Uint8Array; variant: Uint8Array; lights: Uint8Array;
  door: Int32Array; leg: Uint8Array;
  // nearest car ahead, per (edge, direction) bucket — like the reference engine's neighbor grid, this is
  // what lets the sim scale: car-following is O(Σ bucket²) instead of O(cars²) per tick.
  lead: Int32Array; leadGap: Float32Array;
  private bHead: Int32Array; private bNext: Int32Array;
  private doorGrid = new Map<number, number[]>();
  private drivableLen = 0;
  visits = 0;

  constructor(private w: LifeInit) {
    const D = w.doors;
    for (let k = 0; k < D.length / 6; k++) {
      const g = Math.floor(D[k * 6 + 3] / 30) * 92821 + Math.floor(D[k * 6 + 5] / 30);
      let l = this.doorGrid.get(g);
      if (!l) this.doorGrid.set(g, (l = []));
      l.push(k);
    }
    this.rng = makeRng(w.seed);
    const n = (this.n = RANGES.boats[1]);
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.yaw = f();
    this.px = f(); this.py = f(); this.pz = f(); this.pyaw = f();
    this.vx = f(); this.vy = f(); this.vz = f(); this.speed = f();
    this.anim = f(); this.amt = f(); this.timer = f(); this.dodge = f();
    this.tx = f(); this.ty = f(); this.tz = f();
    this.fx = f(); this.fy = f(); this.fz = f();
    this.s = f(); this.phase = f(); this.radius = f();
    this.edge = new Int32Array(n).fill(-1);
    this.dir = new Int8Array(n); this.side = new Int8Array(n);
    this.state = new Uint8Array(n); this.active = new Uint8Array(n); this.variant = new Uint8Array(n); this.lights = new Uint8Array(n);
    this.door = new Int32Array(n).fill(-1); this.leg = new Uint8Array(n);
    this.lead = new Int32Array(n).fill(-1); this.leadGap = new Float32Array(n);
    this.bHead = new Int32Array(w.edgeLen.length * 2); this.bNext = new Int32Array(n);
    this.y.fill(-1000);
    // how many cars the network can hold in free flow (~25 m a car) — more than that is a traffic jam
    for (let e = 0; e < w.edgeLen.length; e++) if (this.drivable(e)) this.drivableLen += w.edgeLen[e];
    this.spawnAll();
    this.px.set(this.x); this.py.set(this.y); this.pz.set(this.z); this.pyaw.set(this.yaw);
  }

  setEnv(e: Partial<LifeEnv>) { Object.assign(this.env, e); }

  // ---------------- road graph helpers ----------------
  private rank(e: number) { return this.w.edgeInfo[e * 4]; }
  private width(e: number) { return this.w.edgeInfo[e * 4 + 1]; }
  private oneway(e: number) { return this.w.edgeInfo[e * 4 + 2] > 0.5; }
  private walkable(e: number) { return this.w.edgeInfo[e * 4 + 3] > 0.5; }
  private drivable(e: number) { return this.rank(e) >= 2; }
  // Writes point + unit tangent at distance s along edge e into out[0..4].
  private sample(e: number, s: number, out: Float32Array) {
    const w = this.w;
    const cnt = w.edgeCount[e], L = w.edgeLen[e];
    const step = L / Math.max(1, cnt - 1);
    const f = Math.max(0, Math.min(cnt - 1.0001, s / step));
    const i = Math.floor(f), t = f - i;
    const a = (w.edgeStart[e] + i) * 3, b = a + 3;
    const P = w.edgePts;
    out[0] = P[a] + (P[b] - P[a]) * t;
    out[1] = P[a + 1] + (P[b + 1] - P[a + 1]) * t;
    out[2] = P[a + 2] + (P[b + 2] - P[a + 2]) * t;
    const dx = P[b] - P[a], dz = P[b + 2] - P[a + 2];
    const l = Math.hypot(dx, dz) || 1;
    out[3] = dx / l;
    out[4] = dz / l;
  }
  private tmp = new Float32Array(5);

  private pickEdge(filter: (e: number) => boolean, weight: (e: number) => number, farFrom?: [number, number], minDist = 0) {
    const E = this.w.edgeLen.length;
    for (let tries = 0; tries < 40; tries++) {
      // weighted by length * weight via rejection sampling
      const e = Math.floor(this.rng.float() * E);
      if (!filter(e)) continue;
      if (this.rng.float() > Math.min(1, (this.w.edgeLen[e] / 120) * weight(e))) continue;
      if (farFrom) {
        this.sample(e, this.w.edgeLen[e] * 0.5, this.tmp);
        if (Math.hypot(this.tmp[0] - farFrom[0], this.tmp[2] - farFrom[1]) < minDist) continue;
      }
      return e;
    }
    return -1;
  }

  // At the end of an edge, choose the next one leaving `node`.
  private nextEdge(node: number, from: number, car: boolean): [number, number] {
    const w = this.w;
    const a = w.nodeEdgeStart[node], b = w.nodeEdgeStart[node + 1];
    let total = 0;
    const cand: number[] = [];
    const wts: number[] = [];
    for (let k = a; k < b; k++) {
      const e = w.nodeEdges[k];
      if (e === from) continue;
      if (car && (!this.drivable(e) || (this.oneway(e) && w.edgeNodes[e * 2] !== node))) continue;
      if (!car && !this.walkable(e)) continue;
      const r = this.rank(e);
      const wt = car ? r * r : 1 + (r >= 2 ? 1 : 0);
      cand.push(e);
      wts.push(wt);
      total += wt;
    }
    if (!cand.length) return [from, w.edgeNodes[from * 2] === node ? 1 : -1];
    let r = this.rng.float() * total;
    let e = cand[cand.length - 1];
    for (let k = 0; k < cand.length; k++) if ((r -= wts[k]) <= 0) { e = cand[k]; break; }
    return [e, w.edgeNodes[e * 2] === node ? 1 : -1];
  }

  private placeOnEdge(i: number, e: number, dir: number, s: number) {
    this.edge[i] = e;
    this.dir[i] = dir;
    this.s[i] = s;
  }

  // ---------------- spawning ----------------
  private spawnAll() {
    const [g0, g1] = RANGES.gulls;
    for (let i = g0; i < g1; i++) this.spawnGull(i);
    const [c0, c1] = RANGES.cars;
    for (let i = c0; i < c1; i++) this.variant[i] = Math.floor(this.rng.float() * 8) + (this.rng.float() < 0.35 ? 10 : 0);
    const [p0, p1] = RANGES.peds;
    for (let i = p0; i < p1; i++) this.variant[i] = Math.floor(this.rng.float() * 10);
    const [b0, b1] = RANGES.boats;
    for (let i = b0; i < b1; i++) this.spawnBoat(i);
    // initial crowd, anywhere
    const cars = this.desired('car'), peds = this.desired('ped');
    for (let i = c0; i < c0 + cars; i++) this.spawnCar(i);
    for (let i = p0; i < p0 + peds; i++) this.spawnPed(i);
  }

  private beachPoint(out: number[], near?: [number, number], within = 1e9) {
    const B = this.w.beachPts;
    const n = B.length / 3;
    if (n < 1) return false;
    for (let t = 0; t < 30; t++) {
      const k = Math.floor(this.rng.float() * n) * 3;
      if (near && Math.hypot(B[k] - near[0], B[k + 2] - near[1]) > within) continue;
      out[0] = B[k]; out[1] = B[k + 1]; out[2] = B[k + 2];
      return true;
    }
    const k = Math.floor(this.rng.float() * n) * 3;
    out[0] = B[k]; out[1] = B[k + 1]; out[2] = B[k + 2];
    return false;
  }
  private bp: number[] = [0, 0, 0];

  private spawnGull(i: number) {
    if (!this.w.beachPts.length) { this.active[i] = 0; return; }
    this.active[i] = 1;
    this.beachPoint(this.bp);
    if (this.rng.float() < 0.45) {
      this.state[i] = ST.STAND;
      this.x[i] = this.bp[0] + this.rng.range(-3, 3);
      this.z[i] = this.bp[2] + this.rng.range(-3, 3);
      this.y[i] = this.bp[1];
      this.yaw[i] = this.rng.float() * TAU;
      this.timer[i] = this.rng.range(4, 40);
    } else {
      this.state[i] = ST.FLY;
      // circle over the surf, seaward of the sand
      const [ox, oz] = this.w.seaward, out = this.rng.range(20, 90), along = this.rng.range(-60, 60);
      this.tx[i] = this.bp[0] + ox * out - oz * along;
      this.tz[i] = this.bp[2] + oz * out + ox * along;
      this.ty[i] = this.rng.range(7, 26);
      this.radius[i] = this.rng.range(12, 45);
      this.phase[i] = this.rng.float() * TAU;
      this.x[i] = this.tx[i] + Math.cos(this.phase[i]) * this.radius[i];
      this.z[i] = this.tz[i] + Math.sin(this.phase[i]) * this.radius[i];
      this.y[i] = this.ty[i];
      this.speed[i] = this.rng.range(7, 10);
      this.timer[i] = this.rng.range(15, 60);
    }
    this.anim[i] = this.rng.float() * TAU;
  }

  private spawnCar(i: number, far = false) {
    // Never materialize on top of the walker: they need a braking distance in front of them.
    for (let t = 0; t < 6; t++) {
      const e = this.pickEdge((e) => this.drivable(e), (e) => this.rank(e) * this.rank(e) * 0.3, far ? [this.env.playerX, this.env.playerZ] : undefined, far ? 110 : 0);
      if (e < 0) return;
      const dir = this.oneway(e) ? 1 : this.rng.float() < 0.5 ? 1 : -1;
      this.placeOnEdge(i, e, dir, this.rng.float() * this.w.edgeLen[e]);
      this.updateCarPose(i, 1);
      if (Math.hypot(this.x[i] - this.env.playerX, this.z[i] - this.env.playerZ) > 9) break;
      if (t === 5) { this.active[i] = 0; return; }
    }
    this.speed[i] = 6;
    this.active[i] = 1;
    this.state[i] = ST.WALK;
    this.snapPrev(i);
  }

  private spawnPed(i: number, far = false) {
    const [dx0, dz0, dx1, dz1] = this.w.downtown;
    const beach = this.rng.float() < 0.3 && this.w.beachPts.length > 0;
    this.active[i] = 1;
    this.speed[i] = this.rng.range(1.0, 1.55);
    this.side[i] = this.rng.float() < 0.5 ? 1 : -1;
    this.anim[i] = this.rng.float() * TAU;
    if (beach) {
      for (let t = 0; t < 10; t++) {
        this.beachPoint(this.bp);
        if (!far || Math.hypot(this.bp[0] - this.env.playerX, this.bp[2] - this.env.playerZ) > 100) break;
      }
      this.state[i] = ST.BEACH;
      this.x[i] = this.fx[i] = this.bp[0];
      this.y[i] = this.fy[i] = this.bp[1];
      this.z[i] = this.fz[i] = this.bp[2];
      this.pickBeachTarget(i);
      this.snapPrev(i);
      return;
    }
    const inDown = (e: number) => {
      this.sample(e, 0, this.tmp);
      return this.tmp[0] > dx0 && this.tmp[0] < dx1 && this.tmp[2] > dz0 && this.tmp[2] < dz1;
    };
    const e = this.pickEdge((e) => this.walkable(e), (e) => (inDown(e) ? 3 : 0.35), far ? [this.env.playerX, this.env.playerZ] : undefined, far ? 90 : 0);
    if (e < 0) { this.active[i] = 0; return; }
    this.placeOnEdge(i, e, this.rng.float() < 0.5 ? 1 : -1, this.rng.float() * this.w.edgeLen[e]);
    this.state[i] = ST.WALK;
    this.updatePedPose(i, 1);
    this.snapPrev(i);
  }

  private pickBeachTarget(i: number) {
    this.beachPoint(this.bp, [this.x[i], this.z[i]], 160);
    this.fx[i] = this.x[i]; this.fy[i] = this.y[i]; this.fz[i] = this.z[i];
    this.tx[i] = this.bp[0] + this.rng.range(-4, 4);
    this.ty[i] = this.bp[1];
    this.tz[i] = this.bp[2] + this.rng.range(-4, 4);
  }

  private water(x: number, z: number) {
    const [x0, z0, c, w, h] = this.w.waterG;
    const i = Math.floor((x - x0) / c), j = Math.floor((z - z0) / c);
    return i >= 0 && j >= 0 && i < w && j < h && this.w.waterGrid[j * w + i] === 1;
  }
  private randomWater(out: number[], near?: [number, number], within = 1e9) {
    const [x0, z0, c, w, h] = this.w.waterG;
    for (let t = 0; t < 200; t++) {
      const x = x0 + (this.rng.float() * w) * c, z = z0 + (this.rng.float() * h) * c;
      if (!this.water(x, z)) continue;
      if (near && Math.hypot(x - near[0], z - near[1]) > within) continue;
      out[0] = x; out[2] = z;
      return true;
    }
    return false;
  }
  private clearPath(ax: number, az: number, bx: number, bz: number) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 6);
    for (let k = 0; k <= n; k++) if (!this.water(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  }
  private spawnBoat(i: number) {
    if (!this.randomWater(this.bp)) return;
    this.active[i] = 1;
    this.x[i] = this.bp[0]; this.z[i] = this.bp[2]; this.y[i] = 0;
    this.variant[i] = Math.floor(this.rng.float() * 6);
    this.speed[i] = this.rng.range(2.5, 5.5);
    this.yaw[i] = this.rng.float() * TAU;
    this.newBoatTarget(i);
  }
  private newBoatTarget(i: number) {
    for (let t = 0; t < 25; t++) {
      if (!this.randomWater(this.bp, [this.x[i], this.z[i]], 700)) break;
      if (this.clearPath(this.x[i], this.z[i], this.bp[0], this.bp[2])) {
        this.tx[i] = this.bp[0]; this.tz[i] = this.bp[2];
        return;
      }
    }
    this.tx[i] = this.x[i]; this.tz[i] = this.z[i];
    this.timer[i] = 5;
  }

  private snapPrev(i: number) {
    this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.pz[i] = this.z[i]; this.pyaw[i] = this.yaw[i];
  }

  // ---------------- density by time of day ----------------
  private desired(kind: 'car' | 'ped') {
    const h = this.env.hour, d = this.env.density;
    // a shore town's day: pre-dawn trickle, morning rush, the beach crowd builds toward mid-afternoon,
    // dinner-and-stroll bump after eight, then the streets empty out
    const bell = (c: number, w: number) => Math.max(0, 1 - ((h - c) / w) ** 2);
    let f: number;
    if (kind === 'car') {
      f = 0.1 + 0.45 * bell(8.3, 2.2) + 0.55 * bell(15, 4.5) + 0.35 * bell(19, 2.5);
    } else {
      f = 0.04 + 0.3 * bell(8, 2.5) + 0.85 * bell(15.5, 4) + 0.3 * bell(20.5, 2.5);
    }
    f = Math.min(1, f);
    const cap = kind === 'car' ? Math.min(CAPS.cars, Math.floor(this.drivableLen / 25)) : CAPS.peds;
    return Math.min(cap, Math.round(cap * f * d * 0.9));
  }

  private manage(range: readonly [number, number], want: number, spawn: (i: number) => void, farDist: number) {
    let act = 0;
    for (let i = range[0]; i < range[1]; i++) act += this.active[i];
    const px = this.env.playerX, pz = this.env.playerZ;
    if (act < want) {
      // fill in quickly when the crowd slider jumps, a few per manage tick
      for (let i = range[0], k = 0; i < range[1] && k < 8; i++) if (!this.active[i]) { spawn(i); if (this.active[i]) k++; }
    } else if (act > want) {
      for (let i = range[1] - 1; i >= range[0]; i--)
        if (this.active[i] && Math.hypot(this.x[i] - px, this.z[i] - pz) > farDist) { this.active[i] = 0; this.y[i] = -1000; this.snapPrev(i); break; }
    }
  }

  // ---------------- per-kind updates ----------------
  private updateCarPose(i: number, dt: number) {
    const e = this.edge[i];
    this.sample(e, this.s[i], this.tmp);
    const d = this.dir[i];
    const tx = this.tmp[3] * d, tz = this.tmp[4] * d;
    const lane = this.oneway(e) ? 0 : Math.min(this.width(e) / 4 + 0.2, 2.0);
    // right-hand traffic: right of travel = (-tz, tx)
    this.x[i] = this.tmp[0] - tz * lane;
    this.z[i] = this.tmp[2] + tx * lane;
    this.y[i] = this.tmp[1];
    this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-tx, -tz), Math.min(1, dt * 6));
  }

  private stepCars(dt: number) {
    const [c0, c1] = RANGES.cars;
    const { playerX: px, playerZ: pz, night } = this.env;
    // bucket by (edge, direction) — a car only follows the car directly ahead of it in its own lane
    const H = this.bHead, N = this.bNext;
    H.fill(-1);
    for (let i = c0; i < c1; i++) {
      if (!this.active[i]) continue;
      const k = this.edge[i] * 2 + (this.dir[i] > 0 ? 1 : 0);
      N[i] = H[k]; H[k] = i;
    }
    for (let i = c0; i < c1; i++) {
      this.leadGap[i] = 1e9; this.lead[i] = -1;
      if (!this.active[i]) continue;
      for (let j = H[this.edge[i] * 2 + (this.dir[i] > 0 ? 1 : 0)]; j >= 0; j = N[j]) {
        if (j === i) continue;
        const ahead = (this.s[j] - this.s[i]) * this.dir[i];
        if (ahead > 0 && ahead < this.leadGap[i]) { this.leadGap[i] = ahead; this.lead[i] = j; }
      }
    }
    for (let i = c0; i < c1; i++) {
      if (!this.active[i]) continue;
      const e = this.edge[i];
      const r = this.rank(e);
      let target = (r >= 5 ? 12.5 : r >= 3 ? 10 : 7.5) * (0.88 + (this.variant[i] % 5) * 0.04);
      // follow the car ahead — brake with the real stopping distance (decel 7)
      const nearest = this.leadGap[i];
      if (nearest < 30) target = Math.min(target, Math.sqrt(2 * 7 * Math.max(0, nearest - 7.5)));
      // Stop for the walker, 4.5 m out, via the true braking curve. If the walker stepped into the road
      // and we're already inside that margin, inch past and clear the zone rather than parking on them.
      const fx = -Math.sin(this.yaw[i]), fz = -Math.cos(this.yaw[i]);
      const rx = px - this.x[i], rz = pz - this.z[i];
      const along = rx * fx + rz * fz, lat = Math.abs(rx * -fz + rz * fx);
      if (along > -1.5 && along < 20 && lat < 2.6) {
        if (along > 4.2) target = Math.min(target, Math.sqrt(2 * 7 * Math.max(0, along - 4.5)));
        else if (nearest > 3.2) target = Math.min(target, 1.6);
      }
      const acc = target > this.speed[i] ? 2.2 : 7;
      this.speed[i] += Math.max(-acc * dt, Math.min(acc * dt, target - this.speed[i]));
      this.s[i] += this.speed[i] * dt * this.dir[i];
      const L = this.w.edgeLen[e];
      if (this.s[i] > L || this.s[i] < 0) {
        const node = this.w.edgeNodes[e * 2 + (this.s[i] > L ? 1 : 0)];
        const over = this.s[i] > L ? this.s[i] - L : -this.s[i];
        const [ne, nd] = this.nextEdge(node, e, true);
        this.placeOnEdge(i, ne, nd, nd > 0 ? over : this.w.edgeLen[ne] - over);
      }
      this.updateCarPose(i, dt);
      this.anim[i] += this.speed[i] * dt / 0.33; // wheel roll
      this.amt[i] = this.speed[i];
      this.lights[i] = night > 0.35 ? 1 : 0;
    }
  }

  private updatePedPose(i: number, dt: number) {
    const e = this.edge[i];
    this.sample(e, this.s[i], this.tmp);
    const d = this.dir[i];
    const tx = this.tmp[3] * d, tz = this.tmp[4] * d;
    const r = this.rank(e);
    const off = (r >= 2 ? this.width(e) / 2 + (r >= 5 ? 3.0 : 1.7) : 0.3) * this.side[i] * d + this.dodge[i];
    this.x[i] = this.tmp[0] - tz * off;
    this.z[i] = this.tmp[2] + tx * off;
    this.y[i] = this.tmp[1] + 0.12;
    this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-tx, -tz), Math.min(1, dt * 5));
  }

  // Pick a door on this side of the street within a short walk, and head for it.
  private tryVisit(i: number) {
    const D = this.w.doors;
    if (!D.length || this.edge[i] < 0) return;
    this.sample(this.edge[i], this.s[i], this.tmp);
    const tx = this.tmp[3] * this.dir[i], tz = this.tmp[4] * this.dir[i];
    const side = Math.sign((this.x[i] - this.tmp[0]) * -tz + (this.z[i] - this.tmp[2]) * tx) || 1;
    let best = -1, bestScore = Infinity;
    const gx = Math.floor(this.x[i] / 30), gz = Math.floor(this.z[i] / 30);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const k of this.doorGrid.get((gx + a) * 92821 + gz + b) ?? []) {
          const fx = D[k * 6 + 3], fz = D[k * 6 + 5];
          const d = Math.hypot(fx - this.x[i], fz - this.z[i]);
          if (d > 26) continue;
          const lat = (fx - this.tmp[0]) * -tz + (fz - this.tmp[2]) * tx;
          if (Math.sign(lat) !== side) continue;
          const score = d + this.rng.float() * 12;
          if (score < bestScore) (bestScore = score), (best = k);
        }
    if (best < 0) return;
    this.door[i] = best;
    this.fx[i] = this.x[i]; this.fy[i] = this.y[i]; this.fz[i] = this.z[i];
    this.state[i] = ST.TO_DOOR;
    this.leg[i] = 0;
    this.dodge[i] = 0;
  }

  private walkTo(i: number, gx: number, gy: number, gz: number, dt: number) {
    const dx = gx - this.x[i], dz = gz - this.z[i];
    const l = Math.hypot(dx, dz);
    if (l < 0.3) { this.x[i] = gx; this.z[i] = gz; this.y[i] = gy + 0.05; return true; }
    const sp = Math.min(l, this.speed[i] * 0.9 * dt);
    this.x[i] += (dx / l) * sp;
    this.z[i] += (dz / l) * sp;
    this.y[i] += (gy + 0.05 - this.y[i]) * Math.min(1, sp / l);
    this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-dx, -dz), Math.min(1, dt * 6));
    return false;
  }

  private stepPeds(dt: number) {
    const [p0, p1] = RANGES.peds;
    const { playerX: px, playerZ: pz } = this.env;
    for (let i = p0; i < p1; i++) {
      if (!this.active[i]) continue;
      const st = this.state[i];
      // step aside for the walker
      const rx = px - this.x[i], rz = pz - this.z[i];
      const dist = Math.hypot(rx, rz);
      const fx = -Math.sin(this.yaw[i]), fz = -Math.cos(this.yaw[i]);
      if (dist < 3 && rx * fx + rz * fz > 0) this.dodge[i] += (rx * -fz + rz * fx > 0 ? -1 : 1) * dt * 1.6;
      else this.dodge[i] *= 1 - dt * 0.6;
      this.dodge[i] = Math.max(-1.4, Math.min(1.4, this.dodge[i]));
      let moving = 1;
      if (st === ST.PAUSE) {
        moving = 0;
        if ((this.timer[i] -= dt) <= 0) this.state[i] = this.edge[i] >= 0 ? ST.WALK : ST.BEACH;
      } else if (st === ST.WALK) {
        const e = this.edge[i];
        this.s[i] += this.speed[i] * dt * this.dir[i];
        const L = this.w.edgeLen[e];
        if (this.s[i] > L || this.s[i] < 0) {
          const node = this.w.edgeNodes[e * 2 + (this.s[i] > L ? 1 : 0)];
          const [ne, nd] = this.nextEdge(node, e, false);
          this.placeOnEdge(i, ne, nd, nd > 0 ? 0 : this.w.edgeLen[ne]);
        }
        this.updatePedPose(i, dt);
        if (this.rng.float() < dt * 0.02) { this.state[i] = ST.PAUSE; this.timer[i] = this.rng.range(2, 9); }
        else if (this.rng.float() < dt * 0.07) this.tryVisit(i);
      } else if (st === ST.TO_DOOR || st === ST.FROM_DOOR) {
        const o = this.door[i] * 6, D = this.w.doors;
        let gx: number, gy: number, gz: number;
        if (this.leg[i] === 0) { gx = D[o + 3]; gy = D[o + 4]; gz = D[o + 5]; }
        else if (st === ST.TO_DOOR) { gx = D[o]; gy = D[o + 1]; gz = D[o + 2]; }
        else { gx = this.fx[i]; gy = this.fy[i]; gz = this.fz[i]; }
        if (this.walkTo(i, gx, gy, gz, dt)) {
          if (this.leg[i] === 0) this.leg[i] = 1;
          else if (st === ST.TO_DOOR) {
            // step inside and close the door behind you
            this.state[i] = ST.INSIDE;
            this.timer[i] = this.rng.range(15, 110) * (this.env.night > 0.5 ? 4 : 1);
            this.y[i] = -1000;
            this.snapPrev(i);
            this.visits++;
          } else {
            this.state[i] = ST.WALK;
            this.door[i] = -1;
          }
        }
      } else if (st === ST.INSIDE) {
        moving = 0;
        this.y[i] = -1000;
        if ((this.timer[i] -= dt) <= 0) {
          const o = this.door[i] * 6, D = this.w.doors;
          this.x[i] = D[o]; this.y[i] = D[o + 1] + 0.05; this.z[i] = D[o + 2];
          this.yaw[i] = Math.atan2(-(D[o + 3] - D[o]), -(D[o + 5] - D[o + 2]));
          this.snapPrev(i);
          this.state[i] = ST.FROM_DOOR;
          this.leg[i] = 0;
        }
      } else if (st === ST.BEACH) {
        const dx = this.tx[i] - this.x[i], dz = this.tz[i] - this.z[i];
        const l = Math.hypot(dx, dz);
        if (l < 1) {
          this.pickBeachTarget(i);
          if (this.rng.float() < 0.4) { this.state[i] = ST.PAUSE; this.timer[i] = this.rng.range(4, 20); }
        } else {
          const sp = this.speed[i] * 0.85 * dt;
          const ox = -dz / l * this.dodge[i] * dt, oz = dx / l * this.dodge[i] * dt;
          this.x[i] += (dx / l) * sp + ox;
          this.z[i] += (dz / l) * sp + oz;
          const tot = Math.hypot(this.tx[i] - this.fx[i], this.tz[i] - this.fz[i]) || 1;
          const t = 1 - l / tot;
          this.y[i] = this.fy[i] + (this.ty[i] - this.fy[i]) * Math.max(0, Math.min(1, t)) + 0.05;
          this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-dx, -dz), Math.min(1, dt * 4));
        }
      }
      this.amt[i] = moving;
      this.anim[i] += moving * this.speed[i] * dt * 5.2;
    }
  }

  private stepGulls(dt: number) {
    const [g0, g1] = RANGES.gulls;
    const { playerX: px, playerZ: pz, night, wind } = this.env;
    for (let i = g0; i < g1; i++) {
      const st = this.state[i];
      const dp = Math.hypot(this.x[i] - px, this.z[i] - pz);
      if (st === ST.STAND) {
        this.amt[i] = -1;
        this.anim[i] += dt * (0.8 + (i % 3) * 0.3);
        this.timer[i] -= dt;
        if (this.rng.float() < dt * 0.15) this.yaw[i] += this.rng.range(-1, 1);
        if (dp < 7.5 || (this.timer[i] <= 0 && night < 0.5)) {
          // take off, away from whatever startled us
          this.state[i] = ST.FLY;
          this.ty[i] = this.rng.range(8, 24);
          this.radius[i] = this.rng.range(14, 40);
          const ax = this.x[i] - px, az = this.z[i] - pz, al = Math.hypot(ax, az) || 1;
          const sea = this.rng.range(-10, 30);
          this.tx[i] = this.x[i] + (ax / al) * 30 + this.w.seaward[0] * sea;
          this.tz[i] = this.z[i] + (az / al) * 30 + this.w.seaward[1] * sea;
          this.phase[i] = Math.atan2(this.z[i] - this.tz[i], this.x[i] - this.tx[i]);
          this.vy[i] = 3;
          this.speed[i] = 5;
          this.timer[i] = dp < 7.5 && night > 0.5 ? this.rng.range(8, 15) : this.rng.range(20, 70);
        }
        continue;
      }
      // flying / landing: steer toward a moving target on a circle (or the landing spot)
      let gx: number, gy: number, gz: number;
      if (st === ST.FLY) {
        const om = (this.speed[i] / this.radius[i]) * (i % 2 ? 1 : -1);
        this.phase[i] += om * dt;
        gx = this.tx[i] + Math.cos(this.phase[i] + om * 1.2) * this.radius[i];
        gz = this.tz[i] + Math.sin(this.phase[i] + om * 1.2) * this.radius[i];
        gy = this.ty[i] + Math.sin(this.phase[i] * 0.5) * 2;
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) {
          if (this.rng.float() < (night > 0.5 ? 0.9 : 0.45)) {
            this.state[i] = ST.LAND;
            this.beachPoint(this.bp, [this.x[i], this.z[i]], 250);
            this.tx[i] = this.bp[0] + this.rng.range(-4, 4);
            this.tz[i] = this.bp[2] + this.rng.range(-4, 4);
            this.ty[i] = this.bp[1];
          } else {
            // drift to a new patch of sky over the surf
            this.beachPoint(this.bp, [this.x[i], this.z[i]], 400);
            const [ox, oz] = this.w.seaward, out = this.rng.range(10, 80), along = this.rng.range(-40, 40);
            this.tx[i] = this.bp[0] + ox * out - oz * along;
            this.tz[i] = this.bp[2] + oz * out + ox * along;
            this.ty[i] = this.rng.range(7, 28);
            this.timer[i] = this.rng.range(20, 60);
          }
        }
      } else {
        gx = this.tx[i]; gz = this.tz[i];
        const hd = Math.hypot(gx - this.x[i], gz - this.z[i]);
        gy = this.ty[i] + Math.min(18, hd * 0.25);
        if (hd < 1.2 && this.y[i] - this.ty[i] < 0.6) {
          this.state[i] = ST.STAND;
          this.y[i] = this.ty[i];
          this.timer[i] = night > 0.5 ? 1e6 : this.rng.range(8, 60);
          this.vx[i] = this.vy[i] = this.vz[i] = 0;
          continue;
        }
      }
      const dx = gx - this.x[i], dy = gy - this.y[i], dz = gz - this.z[i];
      const dl = Math.hypot(dx, dz) || 1;
      const landing = st === ST.LAND;
      const want = landing ? Math.max(2, Math.min(9, dl * 0.5)) : 8.5;
      this.speed[i] += (want - this.speed[i]) * Math.min(1, dt * 1.5);
      const k = Math.min(1, dt * 2.2);
      this.vx[i] += ((dx / dl) * this.speed[i] - this.vx[i]) * k;
      this.vz[i] += ((dz / dl) * this.speed[i] - this.vz[i]) * k;
      this.vy[i] += (Math.max(-4, Math.min(4, dy * 0.8)) - this.vy[i]) * k;
      // a little wind drift + gust wobble
      this.vx[i] += Math.sin(this.tick * 0.05 + i) * wind * 0.6 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-this.vx[i], -this.vz[i]), Math.min(1, dt * 4));
      // flap when climbing or slow, glide otherwise
      const flap = this.vy[i] > 0.6 || this.speed[i] < 6 || landing ? 1 : 0.18 + 0.12 * Math.sin(this.tick * 0.02 + i);
      this.amt[i] += (flap - this.amt[i]) * Math.min(1, dt * 3);
      this.anim[i] += dt * (flap > 0.5 ? 15 : 5);
      const [bx0, bz0, bx1, bz1] = this.w.bounds;
      const [ox, oz] = this.w.seaward;
      if (this.x[i] < bx0 - 300 * Math.max(0, -ox) || this.x[i] > bx1 + 300 * Math.max(0, ox) || this.z[i] < bz0 - 300 * Math.max(0, -oz) || this.z[i] > bz1 + 300 * Math.max(0, oz)) {
        if (this.beachPoint(this.bp)) { this.tx[i] = this.bp[0] + ox * 60; this.tz[i] = this.bp[2] + oz * 60; }
        else { this.tx[i] = (bx0 + bx1) / 2; this.tz[i] = (bz0 + bz1) / 2; }
      }
    }
  }

  private stepBoats(dt: number) {
    const [b0, b1] = RANGES.boats;
    for (let i = b0; i < b1; i++) {
      if (!this.active[i]) continue;
      if (this.timer[i] > 0) { this.timer[i] -= dt; if (this.timer[i] <= 0) this.newBoatTarget(i); continue; }
      const dx = this.tx[i] - this.x[i], dz = this.tz[i] - this.z[i];
      const l = Math.hypot(dx, dz);
      if (l < 8) { this.timer[i] = this.rng.range(2, 20); continue; }
      this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-dx, -dz), Math.min(1, dt * 0.35));
      const fx = -Math.sin(this.yaw[i]), fz = -Math.cos(this.yaw[i]);
      const sp = this.speed[i] * dt;
      if (this.water(this.x[i] + fx * 10, this.z[i] + fz * 10)) {
        this.x[i] += fx * sp;
        this.z[i] += fz * sp;
      } else this.newBoatTarget(i);
      this.anim[i] += dt;
      this.amt[i] = this.speed[i];
      this.lights[i] = this.env.night > 0.4 ? 1 : 0;
    }
  }

  step(dt: number) {
    this.tick++;
    this.stepGulls(dt);
    this.stepCars(dt);
    this.stepPeds(dt);
    this.stepBoats(dt);
    if (this.tick % 10 === 0) {
      this.manage(RANGES.cars, this.desired('car'), (i) => this.spawnCar(i, true), 120);
      this.manage(RANGES.peds, this.desired('ped'), (i) => this.spawnPed(i, true), 100);
    }
  }

  // Write prev + current poses into a snapshot buffer, then roll current into prev.
  publish(out: Float32Array) {
    let active = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * S.STRIDE;
      out[o + S.PX] = this.px[i]; out[o + S.PY] = this.py[i]; out[o + S.PZ] = this.pz[i]; out[o + S.PYAW] = this.pyaw[i];
      out[o + S.X] = this.x[i]; out[o + S.Y] = this.y[i]; out[o + S.Z] = this.z[i]; out[o + S.YAW] = this.yaw[i];
      out[o + S.VARIANT] = this.variant[i];
      out[o + S.ANIM] = this.anim[i];
      out[o + S.AMT] = this.amt[i];
      out[o + S.FLAGS] = this.active[i] | (this.lights[i] << 1);
      active += this.active[i];
    }
    this.px.set(this.x); this.py.set(this.y); this.pz.set(this.z); this.pyaw.set(this.yaw);
    return active;
  }
}

