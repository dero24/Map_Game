// Ambient life simulation: gulls, cars, pedestrians, boats. Structure-of-arrays typed stores, a seeded
// xorshift RNG and a fixed timestep, so a given seed + input sequence always yields the same town.
import { makeRng, type Rng } from '../core/rng';
import { CAPS, RANGES, S, type LifeInit } from './protocol';
import { CTL, STOP_BACK, signalState } from './traffic';

export interface LifeEnv { playerX: number; playerZ: number; night: number; hour: number; density: number; wind: number; clock: number; playerYaw?: number }

const ST = { WALK: 0, PAUSE: 1, BEACH: 2, FLY: 3, STAND: 4, LAND: 5, TO_DOOR: 6, INSIDE: 7, FROM_DOOR: 8, DOWN: 9, CHAT: 10, CROSS: 11 } as const;
/** The renderer's `amt` for a walker stopped to talk (creature.ts: the talking gesture). */
export const AMT_CHAT = -4;
/** A walker's kind, in its `lights` slot (published in FLAGS bits 1+): life.ts draws the dog. */
export const PED = { DOG: 1, JOG: 2 } as const;
/** The renderer's `amt` for a jogger in stride (creature.ts: the running pose). */
export const AMT_RUN = 1.5;
export const PED_STATE = ST;
const TAU = Math.PI * 2;
export { STOP_BACK };
/** The crosswalk over an arm runs across it this far past the setback (groundPaint's ladder). */
const CROSSWALK = 1.2;
const angLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};

export class LifeSim {
  readonly n: number;
  tick = 0;
  private rng: Rng;
  private env: LifeEnv = { playerX: 0, playerZ: 0, night: 0, hour: 12, density: 1, wind: 0.5, clock: 0 };
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
  // junctions: the edge a car will take next (chosen on the approach so it can look across), the
  // node whose stop sign it has already stopped at, how long it has waited; who is in each box
  nxtE: Int32Array; private nxtD: Int8Array; private stopDone: Int32Array; private waitT: Float32Array; private holdT: Float32Array;
  private claim: Int32Array; private claimT: Float32Array; private claimAt: Int32Array; 
  private jroot: Int32Array; private jspan: Float32Array; // junction clusters (a jog: one box)
  // crossings: a walker at a corner plans its way over (kerb to kerb, the target in tx/ty/tz) and
  // which of the junction's arms that line crosses (bit k = the node's k-th edge); who is crossing
  // at each node, so the cars on those arms wait for them
  private xmask: Int32Array; private xHead: Int32Array; private xNext: Int32Array;
  /** The crosswalk's two ends (x, z, x, z) for a walker crossing one street: kerb → kerb. */
  private xp: Float32Array;
  private doorGrid = new Map<number, number[]>();
  private drivableLen = 0;
  visits = 0;

  /** `prev`: the sim on the previous road graph. Its agents carry over (snapped onto the new
   *  graph by position), so streaming tiles in never resets the town — the same cars keep
   *  driving and the same people keep walking. */
  constructor(private w: LifeInit, prev?: LifeSim) {
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
    this.nxtE = new Int32Array(n).fill(-1); this.nxtD = new Int8Array(n); this.stopDone = new Int32Array(n); this.waitT = new Float32Array(n); this.holdT = new Float32Array(n);
    const nNodes = w.nodeEdgeStart.length - 1;
    this.claim = new Int32Array(Math.max(0, nNodes)).fill(-1); this.claimT = new Float32Array(Math.max(0, nNodes)); this.claimAt = new Int32Array(Math.max(0, nNodes));
    // junctions a short link apart (a jog, a divided road's two carriageways) are one box: a car
    // in either holds both — as two separate stops they let two cars into the same few metres
    this.jroot = new Int32Array(Math.max(0, nNodes)); this.jspan = new Float32Array(Math.max(0, nNodes));
    for (let n = 0; n < nNodes; n++) this.jroot[n] = n;
    if (w.nodeSet) {
      const find = (a: number) => { while (this.jroot[a] !== a) a = this.jroot[a] = this.jroot[this.jroot[a]]; return a; };
      const link = (e: number) => { const a = w.edgeNodes[e * 2], b = w.edgeNodes[e * 2 + 1]; return this.drivable(e) && w.nodeSet![a] > 0 && w.nodeSet![b] > 0 && w.edgeLen[e] < w.nodeSet![a] + w.nodeSet![b] + 2; };
      for (let e = 0; e < w.edgeLen.length; e++) if (link(e)) { const ra = find(w.edgeNodes[e * 2]), rb = find(w.edgeNodes[e * 2 + 1]); if (ra !== rb) this.jroot[rb] = ra; }
      for (let n = 0; n < nNodes; n++) this.jroot[n] = find(n);
      for (let e = 0; e < w.edgeLen.length; e++) if (link(e)) { const r = this.jroot[w.edgeNodes[e * 2]]; this.jspan[r] = Math.max(this.jspan[r], w.edgeLen[e]); }
    }
    this.xmask = new Int32Array(n); this.xHead = new Int32Array(Math.max(0, nNodes)).fill(-1); this.xNext = new Int32Array(n); this.xp = new Float32Array(n * 4);
    this.bHead = new Int32Array(w.edgeLen.length * 2); this.bNext = new Int32Array(n);
    this.y.fill(-1000);
    // how many cars the network can hold in free flow (~25 m a car) — more than that is a traffic jam
    for (let e = 0; e < w.edgeLen.length; e++) if (this.drivable(e)) this.drivableLen += w.edgeLen[e];
    if (prev) this.adopt(prev);
    else this.spawnAll();
    this.px.set(this.x); this.py.set(this.y); this.pz.set(this.z); this.pyaw.set(this.yaw);
  }

  // ---------------- persistence across road-graph rebuilds ----------------
  private edgeGrid: Map<number, number[]> | null = null;
  /** Edges by 16 m cell (built on first use). */
  private grid() {
    if (this.edgeGrid) return this.edgeGrid;
    const w = this.w, P = w.edgePts;
    this.edgeGrid = new Map();
    for (let e = 0; e < w.edgeLen.length; e++)
      for (let k = 0; k < w.edgeCount[e]; k++) {
        const a = (w.edgeStart[e] + k) * 3;
        const key = Math.floor(P[a] / 16) * 92821 + Math.floor(P[a + 2] / 16);
        let l = this.edgeGrid.get(key);
        if (!l) this.edgeGrid.set(key, (l = []));
        if (l[l.length - 1] !== e) l.push(e);
      }
    return this.edgeGrid;
  }
  /** Nearest point on an edge passing `ok`, within maxD: [edge, s, tangent x, tangent z] or null. */
  nearestEdge(x: number, z: number, ok: (e: number) => boolean, maxD = 6): [number, number, number, number] | null {
    const w = this.w, P = w.edgePts;
    this.grid();
    let best: [number, number, number, number] | null = null, bd = maxD;
    const gx = Math.floor(x / 16), gz = Math.floor(z / 16), seen = new Set<number>();
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const e of this.edgeGrid!.get((gx + a) * 92821 + gz + b) ?? []) {
          if (seen.has(e) || !ok(e)) continue;
          seen.add(e);
          const cnt = w.edgeCount[e], step = w.edgeLen[e] / Math.max(1, cnt - 1);
          for (let k = 0; k + 1 < cnt; k++) {
            const i0 = (w.edgeStart[e] + k) * 3, i1 = i0 + 3;
            const dx = P[i1] - P[i0], dz = P[i1 + 2] - P[i0 + 2], L2 = dx * dx + dz * dz || 1;
            const t = Math.max(0, Math.min(1, ((x - P[i0]) * dx + (z - P[i0 + 2]) * dz) / L2));
            const d = Math.hypot(P[i0] + dx * t - x, P[i0 + 2] + dz * t - z);
            if (d < bd) { const l = Math.sqrt(L2); bd = d; best = [e, (k + t) * step, dx / l, dz / l]; }
          }
        }
    return best;
  }
  private findDoor(x: number, z: number) {
    const D = this.w.doors;
    for (const k of this.doorGrid.get(Math.floor(x / 30) * 92821 + Math.floor(z / 30)) ?? [])
      if (Math.abs(D[k * 6] - x) < 0.3 && Math.abs(D[k * 6 + 2] - z) < 0.3) return k;
    return -1;
  }
  private adopt(o: LifeSim) {
    this.tick = o.tick;
    this.rng = makeRng((this.w.seed ^ (o.tick * 2654435761)) >>> 0);
    const copy = (i: number) => {
      for (const k of ['x', 'y', 'z', 'yaw', 'vx', 'vy', 'vz', 'speed', 'anim', 'amt', 'timer', 'dodge', 'tx', 'ty', 'tz', 'fx', 'fy', 'fz', 's', 'phase', 'radius'] as const) this[k][i] = o[k][i];
      this.side[i] = o.side[i]; this.state[i] = o.state[i]; this.variant[i] = o.variant[i]; this.lights[i] = o.lights[i]; this.leg[i] = o.leg[i];
      this.active[i] = o.active[i];
    };
    // gulls and boats don't ride the road graph: they carry over as they are
    for (const [a, b] of [RANGES.gulls, RANGES.boats]) for (let i = a; i < b; i++) copy(i);
    // cars and walkers: keep their variants always (a slot is a person/car), their pose when a
    // road of the right kind is still under them
    for (const [a, b, car] of [[RANGES.cars[0], RANGES.cars[1], true], [RANGES.peds[0], RANGES.peds[1], false]] as const)
      for (let i = a; i < b; i++) {
        this.variant[i] = o.variant[i];
        if (!o.active[i]) continue;
        copy(i);
        const st = o.state[i];
        // on the sand, no road needed (walking, or stopped a while to look at the sea)
        if (!car && (st === ST.BEACH || ((st === ST.PAUSE || st === ST.CHAT) && o.edge[i] < 0))) continue;
        if (!car && (st === ST.TO_DOOR || st === ST.FROM_DOOR || st === ST.INSIDE)) {
          const od = o.door[i], d = od >= 0 ? this.findDoor(o.w.doors[od * 6], o.w.doors[od * 6 + 2]) : -1;
          if (d >= 0) { this.door[i] = d; continue; }
          if (st === ST.INSIDE) { this.active[i] = 0; this.y[i] = -1000; continue; } // unseen either way
          if (st === ST.FROM_DOOR) { this.leg[i] = 1; continue; } // straight back to the pavement
          this.state[i] = ST.WALK; // TO_DOOR lost its door: carry on down the street
        }
        const ne = this.nearestEdge(o.x[i], o.z[i], car ? (e) => this.drivable(e) : (e) => this.walkable(e), car ? 6 : 16); // walkers keep to the sidewalk, well off the centre line
        if (!ne) {
          // the road it was on is gone (a tile unloaded far away) — only then does it leave
          this.active[i] = 0; this.y[i] = -1000; continue;
        }
        const [e, sAlong, tx, tz] = ne;
        const fx = -Math.sin(o.yaw[i]), fz = -Math.cos(o.yaw[i]);
        let dir = fx * tx + fz * tz >= 0 ? 1 : -1;
        if (car && this.oneway(e)) dir = 1;
        this.placeOnEdge(i, e, dir, sAlong);
        if ((st === ST.PAUSE || st === ST.CHAT) && !car) this.state[i] = ST.PAUSE;
        if (st === ST.CROSS && !car) this.state[i] = ST.WALK; // (its plan was on the old graph: plan again at the corner)
      }
  }

  setEnv(e: Partial<LifeEnv>) { Object.assign(this.env, e); }

  /** A car (the player's) at (x,z) moving (vx,vz): walkers it catches are knocked down — thrown
   *  along with the car, they tumble, lie a moment, get up and walk off. Returns how many. */
  bump(x: number, z: number, vx: number, vz: number) {
    const sp = Math.hypot(vx, vz);
    if (sp < 2.5) return 0;
    const fx = vx / sp, fz = vz / sp;
    let n = 0;
    for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
      if (!this.active[i] || this.state[i] === ST.INSIDE || this.state[i] === ST.DOWN) continue;
      const dx = this.x[i] - x, dz = this.z[i] - z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      if (ahead < -1.2 || ahead > 2.8 || side > 1.3) continue;
      const kick = Math.min(9, sp * 0.65);
      const lat = (dx * -fz + dz * fx >= 0 ? 1 : -1) * sp * 0.25;
      this.vx[i] = fx * kick - fz * lat; this.vz[i] = fz * kick + fx * lat;
      this.vy[i] = Math.min(4, sp * 0.18);
      this.ty[i] = this.y[i]; // the ground they were walking on
      this.state[i] = ST.DOWN;
      this.timer[i] = 2.6 + this.rng.float() * 0.4; // ~1.5 s sprawled, ~1 s sitting up, then up and off
      n++;
    }
    return n;
  }

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

  // `maxDist`: prefer edges within this range of farFrom (the life bubble round the walker); after
  // 60 misses any distance will do, so a sparse map still fills.
  private pickEdge(filter: (e: number) => boolean, weight: (e: number) => number, farFrom?: [number, number], minDist = 0, maxDist = Infinity) {
    const E = this.w.edgeLen.length;
    if (farFrom && Number.isFinite(maxDist)) {
      // sample the ring itself (a random spot in it, then an edge through that spot's cell) — a
      // uniform draw over a city's whole graph almost never lands in a few-hundred-metre ring
      const G = this.grid();
      for (let tries = 0; tries < 60; tries++) {
        const r = Math.sqrt(minDist * minDist + this.rng.float() * (maxDist * maxDist - minDist * minDist)), a = this.rng.float() * TAU;
        const l = G.get(Math.floor((farFrom[0] + Math.cos(a) * r) / 16) * 92821 + Math.floor((farFrom[1] + Math.sin(a) * r) / 16));
        if (!l) continue;
        const e = l[Math.floor(this.rng.float() * l.length)];
        if (!filter(e) || this.rng.float() > Math.min(1, weight(e) * 0.5)) continue;
        return e;
      }
    }
    for (let tries = 0; tries < 100; tries++) {
      // weighted by length * weight via rejection sampling
      const e = Math.floor(this.rng.float() * E);
      if (!filter(e)) continue;
      if (this.rng.float() > Math.min(1, (this.w.edgeLen[e] / 120) * weight(e))) continue;
      if (farFrom) {
        this.sample(e, this.w.edgeLen[e] * 0.5, this.tmp);
        const d = Math.hypot(this.tmp[0] - farFrom[0], this.tmp[2] - farFrom[1]);
        if (d < minDist || (tries < 60 && d > maxDist)) continue;
      }
      return e;
    }
    return -1;
  }
  // The life bubble: walkers and cars far from the player are recycled a few per tick into the
  // ring just out of sight (they respawn 60–260 m / 100–450 m away), so the crowd a city's cap
  // allows is where the player is, not spread thin over every mounted street — past ~300 m a
  // walker is a few pixels behind a street's worth of buildings anyway.
  // The bubble's size follows the street density round the walker: the cap fills a Midtown block
  // radius (~250 m) nose to tail, and a beach town's half-kilometre at its own pace.
  private bubble = { car: 600, ped: 330 };
  private mids: Float32Array | null = null;
  private sizeBubble() {
    const w = this.w, E = w.edgeLen.length, px = this.env.playerX, pz = this.env.playerZ;
    if (!this.mids) {
      this.mids = new Float32Array(E * 2);
      for (let e = 0; e < E; e++) { this.sample(e, w.edgeLen[e] * 0.5, this.tmp); this.mids[e * 2] = this.tmp[0]; this.mids[e * 2 + 1] = this.tmp[2]; }
    }
    const R = 350;
    let len = 0;
    for (let e = 0; e < E; e++) if (this.drivable(e) && Math.abs(this.mids[e * 2] - px) < R && Math.abs(this.mids[e * 2 + 1] - pz) < R && Math.hypot(this.mids[e * 2] - px, this.mids[e * 2 + 1] - pz) < R) len += w.edgeLen[e];
    const rho = Math.max(1e-4, len / (Math.PI * R * R)); // metres of street per m²
    const r = (n: number, per: number) => Math.sqrt((n * per) / (Math.PI * rho));
    this.bubble.car = Math.max(200, Math.min(600, r(this.desired('car'), 25)));
    this.bubble.ped = Math.max(140, Math.min(330, r(this.desired('ped'), 10)));
  }
  private recycle(range: readonly [number, number], far: number, n: number) {
    const px = this.env.playerX, pz = this.env.playerZ, car = range[0] === RANGES.cars[0];
    for (let i = range[0], k = 0; i < range[1] && k < n; i++)
      if (this.active[i] && this.state[i] !== ST.CHAT && Math.hypot(this.x[i] - px, this.z[i] - pz) > far && !(car && this.inView(this.x[i], this.z[i]))) { this.active[i] = 0; this.y[i] = -1000; this.snapPrev(i); k++; }
  }
  /** In front of the walker and near enough to see a car appear or vanish there (a street's
   *  length): within ~65° of where they face, 260 m. */
  private inView(x: number, z: number) {
    const yaw = this.env.playerYaw;
    if (yaw === undefined) return false;
    const dx = x - this.env.playerX, dz = z - this.env.playerZ, d = Math.hypot(dx, dz);
    return d < 260 && d > 1 && (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d > 0.42;
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
    this.nxtE[i] = -1;
    this.waitT[i] = 0;
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
    // the initial crowd, in the bubble round the walker (a city is busy the moment you arrive)
    this.sizeBubble();
    const cars = this.desired('car'), peds = this.desired('ped');
    for (let i = c0; i < c0 + cars; i++) this.spawnCar(i, 'init');
    for (let i = p0; i < p0 + peds; i++) this.spawnPed(i, 'init');
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

  /** Another active car within r of car i. */
  private carNear(i: number, r: number) {
    for (let j = RANGES.cars[0]; j < RANGES.cars[1]; j++) if (j !== i && this.active[j] && Math.abs(this.x[j] - this.x[i]) < r && Math.abs(this.z[j] - this.z[i]) < r && Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]) < r) return true;
    return false;
  }
  /** A car in our lane behind us that couldn't stop short of us if we stopped now (a car spawned
   *  ten metres in front of one doing 12 m/s was rear-ended the moment the queue ahead held it). */
  private tailgated(i: number) {
    for (let j = RANGES.cars[0]; j < RANGES.cars[1]; j++) {
      if (j === i || !this.active[j] || this.edge[j] !== this.edge[i] || this.dir[j] !== this.dir[i] || this.laneOf(j, this.edge[j]) !== this.laneOf(i, this.edge[i])) continue;
      const behind = (this.s[i] - this.s[j]) * this.dir[i];
      if (behind > 0 && behind < 7.5 + (this.speed[j] * this.speed[j]) / 14 + 4) return true;
    }
    return false;
  }
  private spawnCar(i: number, far: boolean | 'init' = false) {
    // Never materialize on top of the walker: they need a braking distance in front of them.
    for (let t = 0; t < 6; t++) {
      const e = this.pickEdge((e) => this.drivable(e), (e) => this.rank(e) * this.rank(e) * 0.3, far ? [this.env.playerX, this.env.playerZ] : undefined, far === true ? Math.min(100, this.bubble.car * 0.25) : 0, far ? this.bubble.car * (far === true ? 0.75 : 1) : Infinity);
      if (e < 0) return;
      const dir = this.oneway(e) ? 1 : this.rng.float() < 0.5 ? 1 : -1;
      // not in a junction's box or on its crosswalks: between the stop lines, with room to brake
      // for the one ahead (it arrives at 6 m/s)
      const NS = this.w.nodeSet, L = this.w.edgeLen[e];
      const a = NS && NS[this.w.edgeNodes[e * 2]] > 0 ? NS[this.w.edgeNodes[e * 2]] + STOP_BACK + 6 : 0;
      const b = NS && NS[this.w.edgeNodes[e * 2 + 1]] > 0 ? NS[this.w.edgeNodes[e * 2 + 1]] + STOP_BACK + 6 : 0;
      if (L - a - b < 4) { if (t === 5) { this.active[i] = 0; return; } continue; }
      this.placeOnEdge(i, e, dir, a + this.rng.float() * (L - a - b));
      this.updateCarPose(i, 1);
      // and never on top of another car (two cars at the same spot never see each other as
      // "ahead" and drive through the town fused together, four wheels doubled)
      if (Math.hypot(this.x[i] - this.env.playerX, this.z[i] - this.env.playerZ) > 9 && !this.carNear(i, 9) && !this.tailgated(i) && !(far === true && this.inView(this.x[i], this.z[i]))) break;
      if (t === 5) { this.active[i] = 0; return; }
    }
    this.speed[i] = 6;
    this.active[i] = 1;
    this.state[i] = ST.WALK;
    this.snapPrev(i);
  }

  private spawnPed(i: number, far: boolean | 'init' = false) {
    const [dx0, dz0, dx1, dz1] = this.w.downtown;
    const beach = this.rng.float() < 0.3 && this.w.beachPts.length > 0;
    this.active[i] = 1;
    // who they are, not just where: a jogger (fast, never stops), a dog walker (the dog trots on a
    // lead ahead of them — life.ts draws it), or out for a walk
    const who = this.rng.float();
    this.lights[i] = who < 0.07 ? PED.JOG : who < 0.16 ? PED.DOG : 0;
    this.speed[i] = this.lights[i] & PED.JOG ? this.rng.range(2.6, 3.4) : this.rng.range(1.0, 1.55);
    this.side[i] = this.rng.float() < 0.5 ? 1 : -1;
    this.anim[i] = this.rng.float() * TAU;
    if (beach) {
      for (let t = 0; t < 10; t++) {
        this.beachPoint(this.bp);
        if (far !== true || Math.hypot(this.bp[0] - this.env.playerX, this.bp[2] - this.env.playerZ) > 100) break;
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
    const shops = this.w.edgeShops;
    const e = this.pickEdge((e) => this.walkable(e), (e) => Math.max(inDown(e) ? 6 : 0.35, shops ? Math.min(9, 0.35 + shops[e] * 0.9) : 0), far ? [this.env.playerX, this.env.playerZ] : undefined, far === true ? Math.min(60, this.bubble.ped * 0.3) : 0, far ? this.bubble.ped * (far === true ? 0.8 : 1) : Infinity);
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
    // the place's day (protocol.ts Rhythm). A shore town: pre-dawn trickle, morning rush, the beach
    // crowd builds toward mid-afternoon, dinner-and-stroll bump after eight, then the streets empty
    const bell = (c: number, w: number) => Math.max(0, 1 - ((h - c) / w) ** 2);
    let f: number;
    const rhythm = this.w.rhythm ?? 'shore';
    if (rhythm === 'town') {
      // commute, lunch, errands after work, an evening stroll
      f = kind === 'car'
        ? 0.1 + 0.25 * bell(13.5, 6.5) + 0.5 * bell(8, 1.6) + 0.3 * bell(12.5, 2) + 0.55 * bell(17.3, 2) + 0.2 * bell(20, 2)
        : 0.06 + 0.3 * bell(13.5, 6.5) + 0.35 * bell(8.2, 1.8) + 0.4 * bell(12.5, 1.8) + 0.45 * bell(16.5, 2.5) + 0.3 * bell(19.5, 2);
    } else if (rhythm === 'desert') {
      // busy in the cool of the morning and after sunset, a midday lull in the heat
      f = kind === 'car'
        ? 0.1 + 0.2 * bell(13.5, 6.5) + 0.5 * bell(7.8, 1.8) + 0.5 * bell(17.5, 2) + 0.35 * bell(20.5, 2)
        : 0.05 + 0.12 * bell(13.5, 6.5) + 0.55 * bell(7.8, 2) + 0.7 * bell(19.8, 2.2);
    } else if (kind === 'car') {
      f = 0.1 + 0.45 * bell(8.3, 2.2) + 0.55 * bell(15, 4.5) + 0.35 * bell(19, 2.5);
    } else {
      // (+ a coffee-run morning and a lunch hour: downtown is never empty 8 am – 8 pm)
      f = 0.06 + 0.5 * bell(8.5, 2.5) + 0.35 * bell(12.5, 2.5) + 0.85 * bell(15.5, 4) + 0.3 * bell(20.5, 2.5);
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
      const car = range[0] === RANGES.cars[0];
      for (let i = range[1] - 1; i >= range[0]; i--)
        if (this.active[i] && this.state[i] !== ST.CHAT && Math.hypot(this.x[i] - px, this.z[i] - pz) > farDist && !(car && this.inView(this.x[i], this.z[i]))) { this.active[i] = 0; this.y[i] = -1000; this.snapPrev(i); break; }
    }
  }

  // ---------------- per-kind updates ----------------
  // A wide one-way (an avenue) has lanes: a car keeps to one, and only follows cars in it.
  private laneOf(i: number, e: number) { return this.oneway(e) && this.width(e) >= 7 ? this.variant[i] & 1 : 0; }
  private updateCarPose(i: number, dt: number) {
    const e = this.edge[i];
    this.sample(e, this.s[i], this.tmp);
    const d = this.dir[i];
    const tx = this.tmp[3] * d, tz = this.tmp[4] * d;
    const lane = this.oneway(e) ? (this.width(e) >= 7 ? (this.laneOf(i, e) ? 1 : -1) * this.width(e) / 4 : 0) : Math.min(this.width(e) / 4 + 0.2, 2.0);
    // right-hand traffic: right of travel = (-tz, tx)
    this.x[i] = this.tmp[0] - tz * lane;
    this.z[i] = this.tmp[2] + tx * lane;
    this.y[i] = this.tmp[1];
    this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-tx, -tz), Math.min(1, dt * 6));
  }

  /** Is car i's planned move at this junction a left turn (across the oncoming lane)? */
  private leftTurn(i: number, e: number, d: number, node: number) {
    this.sample(e, d > 0 ? this.w.edgeLen[e] : 0, this.tmp);
    const ax = this.tmp[3] * d, az = this.tmp[4] * d;
    const ne = this.nxtE[i], nd = this.nxtD[i];
    if (ne === e) return false; // a dead end's U-turn
    this.sample(ne, nd > 0 ? 0 : this.w.edgeLen[ne], this.tmp);
    const bx = this.tmp[3] * nd, bz = this.tmp[4] * nd;
    const dot = ax * bx + az * bz, cross = ax * bz - az * bx; // +x east, +z south: a left turn is cross < 0
    return dot < 0.8 && cross < -0.35 && node >= 0;
  }
  /** Cars coming the other way into this junction, close enough that turning across them isn't safe. */
  private oncoming(i: number, e: number, d: number, node: number) {
    const W = this.w, H = this.bHead, N = this.bNext;
    this.sample(e, d > 0 ? W.edgeLen[e] : 0, this.tmp);
    const ax = this.tmp[3] * d, az = this.tmp[4] * d; // our heading into the junction
    for (let k = W.nodeEdgeStart[node]; k < W.nodeEdgeStart[node + 1]; k++) {
      const e2 = W.nodeEdges[k];
      if (e2 === e || !this.drivable(e2)) continue;
      for (const end2 of [0, 1]) {
        if (W.edgeNodes[e2 * 2 + end2] !== node) continue;
        const L2 = W.edgeLen[e2];
        this.sample(e2, end2 ? L2 : 0, this.tmp);
        const hx = this.tmp[3] * (end2 ? 1 : -1), hz = this.tmp[4] * (end2 ? 1 : -1); // its heading into the junction
        if (ax * hx + az * hz > -0.7) continue; // not the opposite approach
        for (let j = H[e2 * 2 + end2]; j >= 0; j = N[j]) {
          if (j === i) continue;
          const dj = end2 === 1 ? L2 - this.s[j] : this.s[j];
          // (in the box, or near enough to reach it before we're across — the box runs from our
          // stop line, well back from the corner, so the turn takes ~3 s — or at its line with its
          // way clear to go: the queue facing us at a green goes first, unless we've waited a
          // whole red for it, in which case we take the box and it waits: boxBusy)
          const sbN = W.nodeSet ? W.nodeSet[node] : 0;
          const c2 = W.armCtl ? W.armCtl[e2 * 2 + end2] : CTL.GO;
          const go2 = c2 === CTL.GO || ((c2 === CTL.SIG_A || c2 === CTL.SIG_B) && signalState(c2 - CTL.SIG_A, this.env.clock, W.nodeKey![node]) !== 2);
          const queued = go2 && this.holdT[i] < 12 && dj < sbN + STOP_BACK + 1.5;
          if (!(dj < sbN + 3 || queued || (dj < 60 && dj < this.speed[j] * 4.2 + sbN + STOP_BACK && this.speed[j] > 0.5))) continue;
          // two left turns from opposite sides pass in front of each other: no conflict
          if (this.nxtE[j] >= 0 && this.leftTurn(j, e2, end2 === 1 ? 1 : -1, node)) continue;
          return true;
        }
      }
    }
    return false;
  }
  /** How far ahead along our way (heading ax,az into the node, dN out) the nearest car in the
   *  junction's box that stands across our lane is, or 1e9. */
  private boxAhead(i: number, node: number, sb: number, ax: number, az: number, dN: number) {
    const W = this.w, H = this.bHead, N = this.bNext, nx = W.nodeXZ![node * 2], nz = W.nodeXZ![node * 2 + 1];
    // our lane's line through the box (right-hand traffic: right of travel is (-az, ax))
    const lane = (this.x[i] - nx) * -az + (this.z[i] - nz) * ax;
    let best = 1e9;
    for (let k = W.nodeEdgeStart[node]; k < W.nodeEdgeStart[node + 1]; k++) {
      const e2 = W.nodeEdges[k];
      if (!this.drivable(e2)) continue;
      const end2 = W.edgeNodes[e2 * 2] === node ? 0 : 1, L2 = W.edgeLen[e2];
      for (const b of [e2 * 2, e2 * 2 + 1])
        for (let j = H[b]; j >= 0; j = N[j]) {
          if (j === i) continue;
          const dj = end2 ? L2 - this.s[j] : this.s[j];
          if (dj > sb + 1) continue; // (not in the box)
          const rx = this.x[j] - nx, rz = this.z[j] - nz;
          const along = rx * ax + rz * az, lat = rx * -az + rz * ax - lane;
          // (only what is ahead of us: the car queued behind us in our own lane is in the box's
          // reach too — counted as "right in front", every car at the line waited on its follower
          // and a signalled junction locked solid)
          if (Math.abs(lat) > 2.2 || along < -sb - 1 || dN + along < 0.5) continue;
          best = Math.min(best, dN + along);
        }
    }
    return best;
  }
  /** Another car is in (or just entering) this junction's box. */
  private boxBusy(node: number, i: number, clock: number) {
    const r = this.jroot[node], c = this.claim[r];
    if (c < 0 || c === i) return false;
    const age = clock - this.claimT[r], at = this.claimAt[r];
    const xz = this.w.nodeXZ!;
    const out = Math.hypot(this.x[c] - xz[at * 2], this.z[c] - xz[at * 2 + 1]) > (this.w.nodeSet![at] + STOP_BACK + 1.5 + this.jspan[r]);
    if (!this.active[c] || age > 5 || age < 0 || (out && age > 0.8)) { this.claim[r] = -1; return false; }
    return true;
  }
  /** At an unmarked corner, first come first served: nobody on another arm gets to the box before
   *  us (a dead heat goes to the one on our right), and nobody is in it coming across. */
  private firstCome(i: number, e: number, end: number, node: number, dStop: number) {
    const W = this.w, H = this.bHead, N = this.bNext, sb = W.nodeSet ? W.nodeSet[node] : 0;
    this.sample(e, end ? W.edgeLen[e] : 0, this.tmp);
    const d = end ? 1 : -1, ax = this.tmp[3] * d, az = this.tmp[4] * d; // our heading into the node
    const ti = Math.max(0, dStop) / Math.max(1.5, this.speed[i]);
    for (let k = W.nodeEdgeStart[node]; k < W.nodeEdgeStart[node + 1]; k++) {
      const e2 = W.nodeEdges[k];
      if (e2 === e || !this.drivable(e2)) continue;
      const end2 = W.edgeNodes[e2 * 2] === node ? 0 : 1, L2 = W.edgeLen[e2];
      if (W.edgeNodes[e2 * 2 + end2] !== node) continue;
      for (let j = H[e2 * 2 + end2]; j >= 0; j = N[j]) { // cars on e2 heading into the node
        if (j === i) continue;
        const dj = end2 ? L2 - this.s[j] : this.s[j], dsj = dj - sb - STOP_BACK;
        if (dsj < -0.5) { if (dj > 0.5) return false; continue; } // in the box, coming across
        if (this.speed[j] < 0.5 && dsj > 3) continue; // waiting further back: a queue, not a rival
        const tj = dsj / Math.max(1.5, this.speed[j]);
        if (tj < ti - 0.4) return false;
        if (tj <= ti + 0.4) {
          // a dead heat: whoever has the other on their right gives way
          this.sample(e2, end2 ? L2 : 0, this.tmp);
          const hx = this.tmp[3] * (end2 ? 1 : -1), hz = this.tmp[4] * (end2 ? 1 : -1);
          if (-hx * -az + -hz * ax > 0.5) return false; // it comes from our right
        }
      }
    }
    return true;
  }
  /** Nothing about to arrive in this junction's box: every car heading in is stopped, or more
   *  than 2.5 s (and a couple of metres) out. */
  private lull(i: number, node: number) {
    const W = this.w, H = this.bHead, N = this.bNext, sb = W.nodeSet ? W.nodeSet[node] : 0;
    for (let k = W.nodeEdgeStart[node]; k < W.nodeEdgeStart[node + 1]; k++) {
      const e2 = W.nodeEdges[k];
      if (!this.drivable(e2)) continue;
      const end2 = W.edgeNodes[e2 * 2] === node ? 0 : 1, L2 = W.edgeLen[e2];
      for (let j = H[e2 * 2 + end2]; j >= 0; j = N[j]) { // cars on e2 heading toward this end
        if (j === i || this.speed[j] < 0.5) continue;
        const dj = end2 ? L2 - this.s[j] : this.s[j];
        if (dj < sb + 2 + this.speed[j] * 2.5) return false;
      }
    }
    return true;
  }
  /** After its stop (or on its yield), may this car pull out? The box must be clear, and at a
   *  stop / give-way the main road's traffic must not be close (3.5 s or 8 m out). */
  private mayGo(i: number, node: number, ctl: number, clock: number) {
    if (this.boxBusy(node, i, clock)) return false;
    if (ctl === CTL.ALL_STOP) return true; // all-way: whoever stopped first claims the box first
    const W = this.w, H = this.bHead, N = this.bNext;
    for (let k = W.nodeEdgeStart[node]; k < W.nodeEdgeStart[node + 1]; k++) {
      const e2 = W.nodeEdges[k];
      if (!this.drivable(e2)) continue;
      for (const end2 of [0, 1]) {
        if (W.edgeNodes[e2 * 2 + end2] !== node || (W.armCtl && W.armCtl[e2 * 2 + end2] !== CTL.GO)) continue;
        const L2 = W.edgeLen[e2];
        for (let j = H[e2 * 2 + end2]; j >= 0; j = N[j]) { // cars on e2 heading toward this end
          if (j === i) continue;
          const dj = end2 === 1 ? L2 - this.s[j] : this.s[j];
          if (dj < W.nodeSet![node] + 3 || (dj < 60 && dj < this.speed[j] * 4.5 + W.nodeSet![node] + 4 && this.speed[j] > 0.5)) return false;
        }
      }
    }
    return true;
  }

  /** Cars by (edge, direction) — a car only follows the car directly ahead of it in its own lane;
   *  a walker at a corner looks along the streets it would cross. */
  private bucketCars() {
    const [c0, c1] = RANGES.cars, H = this.bHead, N = this.bNext;
    H.fill(-1);
    for (let i = c0; i < c1; i++) {
      if (!this.active[i]) continue;
      const k = this.edge[i] * 2 + (this.dir[i] > 0 ? 1 : 0);
      N[i] = H[k]; H[k] = i;
    }
  }
  private stepCars(dt: number) {
    const [c0, c1] = RANGES.cars;
    const { playerX: px, playerZ: pz, night } = this.env;
    const H = this.bHead, N = this.bNext;
    this.bucketCars();
    for (let i = c0; i < c1; i++) {
      this.leadGap[i] = 1e9; this.lead[i] = -1;
      if (!this.active[i]) continue;
      const li = this.laneOf(i, this.edge[i]);
      for (let j = H[this.edge[i] * 2 + (this.dir[i] > 0 ? 1 : 0)]; j >= 0; j = N[j]) {
        if (j === i || this.laneOf(j, this.edge[j]) !== li) continue;
        const ahead = (this.s[j] - this.s[i]) * this.dir[i];
        // (a dead heat — two cars at one spot — goes to the lower slot, so one of them yields)
        if ((ahead > 0 || (ahead === 0 && j < i)) && ahead < this.leadGap[i]) { this.leadGap[i] = ahead; this.lead[i] = j; }
      }
    }
    const W = this.w, clock = this.env.clock;
    for (let i = c0; i < c1; i++) {
      if (!this.active[i]) continue;
      const e = this.edge[i];
      const r = this.rank(e);
      let target = (r >= 5 ? 12.5 : r >= 3 ? 10 : 7.5) * (0.88 + (this.variant[i] % 5) * 0.04);
      // ---- the junction ahead: look across it, slow for the turn, obey its control ----
      const d0 = this.dir[i], L0 = W.edgeLen[e], end = d0 > 0 ? 1 : 0, node = W.edgeNodes[e * 2 + end];
      const dN = d0 > 0 ? L0 - this.s[i] : this.s[i];
      const sb = W.nodeSet ? W.nodeSet[node] : 0, dStop = dN - (sb > 0 ? sb + STOP_BACK : 0);
      let nextGap = 1e9;
      if (dN < 45) {
        if (this.nxtE[i] < 0) { const [ne, nd] = this.nextEdge(node, e, true); this.nxtE[i] = ne; this.nxtD[i] = nd; }
        const ne = this.nxtE[i], nd = this.nxtD[i], L2 = W.edgeLen[ne], ln = this.laneOf(i, ne);
        // the car ahead may already be round the corner: follow it across the junction
        for (let j = H[ne * 2 + (nd > 0 ? 1 : 0)]; j >= 0; j = N[j]) {
          if (j === i || this.laneOf(j, ne) !== ln) continue;
          const along = nd > 0 ? this.s[j] : L2 - this.s[j];
          nextGap = Math.min(nextGap, along);
          if (dN + along < this.leadGap[i]) { this.leadGap[i] = dN + along; this.lead[i] = j; }
        }
        // two lanes becoming one round the corner: whoever is in front in the other lane, bound for
        // the same lane, merges ahead — side by side into one lane is how cars end up fused
        const li = this.laneOf(i, e);
        for (let j = H[e * 2 + end]; j >= 0; j = N[j]) {
          if (j === i || this.nxtE[j] !== ne || this.laneOf(j, e) === li || this.laneOf(j, ne) !== ln) continue;
          const ahead = (this.s[j] - this.s[i]) * d0;
          if ((ahead > 0 || (ahead === 0 && j < i)) && ahead < this.leadGap[i]) { this.leadGap[i] = ahead; this.lead[i] = j; }
        }
        // and from the other approaches: a car already rolling into the box bound for the same lane
        // goes first (zip in behind it) — whatever the signs said, two cars can't share a lane
        if (sb > 0)
          for (let k = W.nodeEdgeStart[node]; k < W.nodeEdgeStart[node + 1]; k++) {
            const e3 = W.nodeEdges[k];
            if (e3 === e || !this.drivable(e3)) continue;
            const end3 = W.edgeNodes[e3 * 2] === node ? 0 : 1, L3 = W.edgeLen[e3];
            for (let j = H[e3 * 2 + end3]; j >= 0; j = N[j]) {
              if (this.nxtE[j] !== ne || this.speed[j] < 1.5 || this.laneOf(j, ne) !== ln) continue;
              const dj = end3 ? L3 - this.s[j] : this.s[j];
              if (dj > sb + STOP_BACK + 0.5) continue; // not over its line yet
              const gap = dN - dj;
              if ((gap > 0 || (gap === 0 && j < i)) && gap < this.leadGap[i]) { this.leadGap[i] = gap; this.lead[i] = j; }
            }
          }
        // corners are taken at walking-the-dog speed, not at the limit
        this.sample(e, d0 > 0 ? L0 : 0, this.tmp);
        const ax = this.tmp[3] * d0, az = this.tmp[4] * d0;
        this.sample(ne, nd > 0 ? 0 : L2, this.tmp);
        const turn = ax * this.tmp[3] * nd + az * this.tmp[4] * nd;
        if (turn < 0.8) { const vT = turn < -0.3 ? 2.5 : 4.8; target = Math.min(target, Math.sqrt(vT * vT + 2 * 2.5 * Math.max(0, dStop))); }
        // anyone in the box across our lane — a turning car just off our street, cross traffic
        // clearing it — is in front of us, whatever edge the graph has put it on
        if (sb > 0 && dN < sb + STOP_BACK + 12) {
          const g = this.boxAhead(i, node, sb, ax, az, dN);
          if (g < this.leadGap[i]) { this.leadGap[i] = g; }
        }
      }
      if (sb > 0 && dStop > -0.5) {
        const ctl = W.armCtl ? W.armCtl[e * 2 + end] : CTL.GO;
        // `hard` holds are the ones a stuck junction may never talk its way past: a red light,
        // traffic we'd turn across, someone on the crosswalk
        let hold = false, hard = false;
        // turning left across the oncoming lane: wait for a gap in the traffic coming the other way
        if ((ctl === CTL.GO || ctl === CTL.SIG_A || ctl === CTL.SIG_B) && this.nxtE[i] >= 0 && dStop < 25 && this.leftTurn(i, e, d0, node) && this.oncoming(i, e, d0, node)) hold = hard = true;
        if (ctl === CTL.SIG_A || ctl === CTL.SIG_B) {
          const st = signalState(ctl - CTL.SIG_A, clock, W.nodeKey![node]);
          // red: stop at the line; amber: stop if it can be done comfortably, else carry on through
          if (st === 2 || (st === 1 && dStop > (this.speed[i] * this.speed[i]) / 9 + 1)) hold = hard = true;
          // a left turn that has waited out a red has taken the box: let it finish
          else if (this.boxBusy(node, i, clock)) hold = hard = true;
        } else if (ctl === CTL.STOP || ctl === CTL.ALL_STOP) {
          if (this.stopDone[i] !== node + 1) {
            hold = true; // a full stop at the line first
            if (dStop < 3.5 && this.speed[i] < 0.5 && (this.waitT[i] += dt) > 0.9) { this.stopDone[i] = node + 1; this.waitT[i] = 0; }
          } else if (!this.mayGo(i, node, ctl, clock)) hold = true;
        } else if (ctl === CTL.YIELD) {
          if (!this.mayGo(i, node, ctl, clock)) hold = true;
          else target = Math.min(target, Math.sqrt(30 + 6 * Math.max(0, dStop)));
        } else if (ctl === CTL.OPEN) {
          // an unmarked corner: slow, look, and go in turn — no stop unless someone's there first
          if (!this.mayGo(i, node, ctl, clock) || !this.firstCome(i, e, end, node, dStop)) hold = true;
          else target = Math.min(target, Math.sqrt(22 + 6 * Math.max(0, dStop)));
        } else if (this.boxBusy(node, i, clock)) hold = true; // the main road still lets a car already in the box clear it
        // anyone crossing the street we're on, or the one we're turning into: wait at the line for
        // them to reach the far kerb (looked for from a comfortable braking distance out)
        if (this.xHead[node] >= 0 && dStop < Math.max(14, (this.speed[i] * this.speed[i]) / 10 + 5)) {
          const bits = this.armBit(node, e, end) | (this.nxtE[i] >= 0 ? this.armBit(node, this.nxtE[i], this.nxtD[i] > 0 ? 0 : 1) : 0);
          if (this.crossingAt(node, bits)) hold = hard = true;
        }
        // don't block the box: the queue past the junction must leave room for this car beyond it
        if (!hold && nextGap < sb + 9) hold = true;
        // a knot in a weird graph (cars waiting on each other's right of way) eventually just goes
        if (hold && this.speed[i] < 0.3) this.holdT[i] += dt;
        // (…but only into a lull: at a stop sign onto a busy road it pulled out into the next car)
        if (hold && !hard && this.holdT[i] > 25 && this.lull(i, node)) hold = false;
        if (hold) target = Math.min(target, Math.sqrt(2 * 6 * Math.max(0, dStop - 0.4)));
        else {
          // over the line into the box: claim it (at a signal only a left turn does — the cross
          // traffic is held by the lights)
          const turnL = (ctl === CTL.SIG_A || ctl === CTL.SIG_B) && this.nxtE[i] >= 0 && this.leftTurn(i, e, d0, node);
          const jr = this.jroot[node];
          if ((turnL || (ctl !== CTL.SIG_A && ctl !== CTL.SIG_B)) && dStop < 1.5 && this.claim[jr] !== i) { this.claim[jr] = i; this.claimT[jr] = clock; this.claimAt[jr] = node; }
          if (this.speed[i] > 1) this.holdT[i] = 0;
        }
      }
      // in the box already: someone who stepped onto the crosswalk we're heading out over (the
      // light changed, they misjudged us) — stop short of it
      if (sb > 0 && dStop <= -0.5 && dN > 0 && this.xHead[node] >= 0 && this.nxtE[i] >= 0 && this.crossingAt(node, this.armBit(node, this.nxtE[i], this.nxtD[i] > 0 ? 0 : 1)))
        target = Math.min(target, Math.sqrt(2 * 6 * Math.max(0, dN + sb - 0.3 - 2.5)));
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
        const [ne, nd] = this.nxtE[i] >= 0 ? [this.nxtE[i], this.nxtD[i]] : this.nextEdge(node, e, true);
        this.placeOnEdge(i, ne, nd, Math.min(this.w.edgeLen[ne], nd > 0 ? over : this.w.edgeLen[ne] - over));
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

  // Walkers bucketed by edge (the same head/next lists the cars use, in the peds' own range), so a
  // walker can find someone on its own stretch of sidewalk to stop and talk to.
  private pHead = new Int32Array(0);
  private meet(i: number) {
    const e = this.edge[i];
    if (e < 0 || e >= this.pHead.length) return;
    const my = this.lateral(i);
    for (let j = this.pHead[e]; j >= 0; j = this.bNext[j]) {
      if (j === i || this.state[j] !== ST.WALK || this.lights[j] & PED.JOG) continue;
      const d = Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]);
      if (d < 0.7 || d > 1.8 || Math.sign(this.lateral(j)) !== Math.sign(my)) continue; // same side of the street
      // stop and talk, face to face at a talking distance (~1.1 m), for a while
      const t = this.rng.range(8, 26), mx = (this.x[i] + this.x[j]) / 2, mz = (this.z[i] + this.z[j]) / 2;
      const ux = (this.x[j] - this.x[i]) / d, uz = (this.z[j] - this.z[i]) / d;
      this.x[i] = mx - ux * 0.55; this.z[i] = mz - uz * 0.55;
      this.x[j] = mx + ux * 0.55; this.z[j] = mz + uz * 0.55;
      for (const [a, b] of [[i, j], [j, i]]) {
        this.state[a] = ST.CHAT;
        this.timer[a] = t;
        this.lead[a] = b; // (a walker's lead slot holds who it is talking to)
        this.yaw[a] = Math.atan2(-(this.x[b] - this.x[a]), -(this.z[b] - this.z[a]));
      }
      return;
    }
  }
  /** Which side of its street a walker is on (the sign of its offset from the centre line). */
  private lateral(i: number) { return this.side[i] * this.dir[i] + this.dodge[i] * 0.1; }
  /** Where a walker on edge e (heading d) stands at distance s along it: its sidewalk, not the
   *  crown of the road. Into tx/ty/tz. */
  private pedPoint(i: number, e: number, d: number, s: number) {
    this.sample(e, s, this.tmp);
    const tx = this.tmp[3] * d, tz = this.tmp[4] * d, r = this.rank(e);
    const off = (r >= 2 ? this.width(e) / 2 + (r >= 5 ? 3.0 : 1.7) : 0.3) * this.side[i] * d;
    this.tx[i] = this.tmp[0] - tz * off; this.tz[i] = this.tmp[2] + tx * off; this.ty[i] = this.tmp[1] + 0.12;
  }
  /** The bit of the node's arm that edge e's `end` is (0 if it doesn't end here). */
  private armBit(node: number, e: number, end: number) {
    const W = this.w, k0 = W.nodeEdgeStart[node];
    if (e < 0 || W.edgeNodes[e * 2 + end] !== node) return 0;
    for (let k = k0; k < W.nodeEdgeStart[node + 1]; k++) if (W.nodeEdges[k] === e) return 1 << Math.min(30, k - k0);
    return 0;
  }
  /** Which of a junction's carriageways the line (ax,az)→(bx,bz) crosses: each drivable arm is a
   *  box from the junction's centre out past its stop line, as wide as its road. */
  private crossMask(node: number, sb: number, ax: number, az: number, bx: number, bz: number) {
    const W = this.w, k0 = W.nodeEdgeStart[node];
    let m = 0;
    for (let k = k0; k < W.nodeEdgeStart[node + 1]; k++) {
      const e2 = W.nodeEdges[k];
      if (!this.drivable(e2)) continue;
      const end2 = W.edgeNodes[e2 * 2] === node ? 0 : 1, L2 = W.edgeLen[e2];
      this.sample(e2, end2 ? L2 : 0, this.tmp);
      const ox = this.tmp[0], oz = this.tmp[2], ux = this.tmp[3] * (end2 ? -1 : 1), uz = this.tmp[4] * (end2 ? -1 : 1);
      const hw = this.width(e2) / 2 + 0.3, len = Math.min(L2, sb + STOP_BACK);
      // the line in the arm's frame (u out along it, v across it), clipped against the box
      const au = (ax - ox) * ux + (az - oz) * uz, av = (az - oz) * ux - (ax - ox) * uz;
      const du = (bx - ox) * ux + (bz - oz) * uz - au, dv = (bz - oz) * ux - (bx - ox) * uz - av;
      let t0 = 0, t1 = 1, hit = true;
      for (const [p, q] of [[-du, au], [du, len - au], [-dv, av + hw], [dv, hw - av]]) {
        if (p === 0) { if (q < 0) { hit = false; break; } continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) { hit = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { hit = false; break; } if (r < t1) t1 = r; }
      }
      if (hit) m |= 1 << Math.min(30, k - k0);
    }
    return m;
  }
  /** At a junction's corner: choose where to go next and, if that means crossing a street, the
   *  way over — along the corner to the crosswalk's near end, over it to the far kerb, and on to
   *  the sidewalk of the next street (tx/ty/tz) — and the arms it crosses. */
  private planCross(i: number, node: number, sb: number) {
    const W = this.w, e = this.edge[i];
    const [ne, nd] = this.nextEdge(node, e, false);
    this.nxtE[i] = ne; this.nxtD[i] = nd;
    this.xmask[i] = 0;
    if (ne === e) return; // a dead end: turn round where you stand
    this.updatePedPose(i, 0); // (from the kerb itself)
    const L2 = W.edgeLen[ne], ax = this.x[i], az = this.z[i], sB = nd > 0 ? Math.min(sb, L2 * 0.5) : Math.max(L2 * 0.5, L2 - sb);
    // which sidewalk of the next street: the one that means crossing fewest streets (people cross
    // once, not diagonally through the junction), else the same hand as now
    const keep = this.side[i] * this.dir[i] * nd;
    let best = keep, bestN = 99;
    for (const sd of [keep, -keep]) {
      this.side[i] = sd;
      this.pedPoint(i, ne, nd, sB);
      let m = this.crossMask(node, sb, ax, az, this.tx[i], this.tz[i]), n = 0;
      for (; m; m &= m - 1) n++;
      if (n < bestN) { bestN = n; best = sd; }
    }
    this.side[i] = best;
    this.pedPoint(i, ne, nd, sB);
    const m = (this.xmask[i] = this.crossMask(node, sb, ax, az, this.tx[i], this.tz[i]));
    const o = i * 4, X = this.xp;
    X[o] = ax; X[o + 1] = az; X[o + 2] = this.tx[i]; X[o + 3] = this.tz[i]; // (no crosswalk: straight over)
    this.leg[i] = 0;
    if (!m || m & (m - 1)) return; // a corner, or a diagonal over more than one street
    // one street: over it on its crosswalk, square across, from the kerb on our side
    const k0 = W.nodeEdgeStart[node], e2 = W.nodeEdges[k0 + 31 - Math.clz32(m)];
    const end2 = W.edgeNodes[e2 * 2] === node ? 0 : 1, L3 = W.edgeLen[e2];
    this.sample(e2, end2 ? L3 : 0, this.tmp);
    const ox = this.tmp[0], oz = this.tmp[2], ux = this.tmp[3] * (end2 ? -1 : 1), uz = this.tmp[4] * (end2 ? -1 : 1);
    const u = Math.min(L3 * 0.5, sb + CROSSWALK), hw = this.width(e2) / 2 + 0.5;
    const near = (az - oz) * ux - (ax - ox) * uz >= 0 ? 1 : -1; // which side of it we stand on
    // v across the arm is (−uz, ux)
    X[o] = ox + ux * u - uz * hw * near; X[o + 1] = oz + uz * u + ux * hw * near;
    X[o + 2] = ox + ux * u + uz * hw * near; X[o + 3] = oz + uz * u - ux * hw * near;
  }
  /** Standing at the kerb: is it safe to step off? At a signal, the streets being crossed must be
   *  held at red (with a few seconds of it left — the flashing hand) and no car turning through
   *  the crosswalk. Anywhere else: no car whose way through the junction crosses ours (along a
   *  street we'd cross, or into one — a car still deciding counts) may be closing on it fast
   *  enough to arrive before we're over, or be driving through it. A car stopped at its line
   *  waits for us (crossingAt). After 25 s of a road that never clears, go at the first gap a
   *  car can stop for. */
  private crossWait(i: number, node: number, sb: number, dt: number) {
    const m = this.xmask[i];
    if (!m) return false;
    const impatient = (this.waitT[i] += dt) > 25;
    const W = this.w, H = this.bHead, N = this.bNext, k0 = W.nodeEdgeStart[node], k1 = W.nodeEdgeStart[node + 1];
    const clock = this.env.clock;
    const T = Math.min(9, Math.hypot(this.tx[i] - this.x[i], this.tz[i] - this.z[i]) / Math.max(0.8, this.speed[i]) + 1);
    for (let k = k0; k < k1; k++) {
      const e2 = W.nodeEdges[k];
      if (!this.drivable(e2)) continue;
      const bit = 1 << Math.min(30, k - k0), end2 = W.edgeNodes[e2 * 2] === node ? 0 : 1, L2 = W.edgeLen[e2];
      const ctl = W.armCtl ? W.armCtl[e2 * 2 + end2] : CTL.GO;
      const sig = ctl === CTL.SIG_A || ctl === CTL.SIG_B;
      const red = sig && signalState(ctl - CTL.SIG_A, clock, W.nodeKey![node]) === 2; // (its cars are held)
      // over a signalled street only on the walk: its red, the first ten seconds of it (then the
      // hand flashes — the turning cars get the rest of the green), and not with the red ending
      if (m & bit && sig && (!red || signalState(ctl - CTL.SIG_A, clock + 4, W.nodeKey![node]) !== 2 || signalState(ctl - CTL.SIG_A, clock - 10, W.nodeKey![node]) === 2)) return true;
      for (let j = H[e2 * 2 + end2]; j >= 0; j = N[j]) { // coming toward the junction along this arm
        const ex = this.nxtE[j];
        if (!(m & bit) && ex >= 0 && !(m & this.armBit(node, ex, this.nxtD[j] > 0 ? 0 : 1))) continue; // its way doesn't cross ours
        const dj = end2 ? L2 - this.s[j] : this.s[j], v = this.speed[j];
        const line = sb + STOP_BACK; // (its stop line: a car stopped there waits for us — unless it's
        // been waiting a while for walkers already, and it's its turn: then we let it go)
        if (dj < line - 0.5) return true; // over its line: in the box (even waiting in it), it's coming through
        if (dj < line + 1 ? v > 0.3 || (!red && this.holdT[j] > 8) : !red && v > 1 && dj - line < Math.max((v * v) / 10 + 3, impatient ? 0 : Math.min(70, v * T + 3))) return true;
      }
      if (m & bit) for (let j = H[e2 * 2 + 1 - end2]; j >= 0; j = N[j]) { // leaving along it, still in the crosswalk
        const dj = end2 ? L2 - this.s[j] : this.s[j];
        if (dj < sb + STOP_BACK && this.speed[j] > 0.5) return true;
      }
    }
    return false;
  }
  /** Someone crossing at this node over one of the arms in `bits`. */
  private crossingAt(node: number, bits: number) {
    for (let j = this.xHead[node]; j >= 0; j = this.xNext[j]) if (this.xmask[j] & bits) return true;
    return false;
  }

  private stepPeds(dt: number) {
    const [p0, p1] = RANGES.peds;
    const { playerX: px, playerZ: pz } = this.env;
    const E = this.w.edgeLen.length;
    this.bucketCars(); // (where the cars are now, after this tick's moves)
    if (this.pHead.length !== E) this.pHead = new Int32Array(E);
    this.pHead.fill(-1);
    for (let i = p0; i < p1; i++) if (this.active[i] && this.state[i] === ST.WALK && this.edge[i] >= 0) { this.bNext[i] = this.pHead[this.edge[i]]; this.pHead[this.edge[i]] = i; }
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
      if (st === ST.PAUSE || st === ST.CHAT) {
        moving = 0;
        const j = this.lead[i];
        const alone = st === ST.CHAT && (j < 0 || !this.active[j] || this.state[j] !== ST.CHAT || this.lead[j] !== i);
        if ((this.timer[i] -= dt) <= 0 || alone) {
          this.state[i] = this.edge[i] >= 0 ? ST.WALK : ST.BEACH;
          // a conversation ends for both at once
          if (st === ST.CHAT && !alone) { this.state[j] = this.edge[j] >= 0 ? ST.WALK : ST.BEACH; this.lead[j] = -1; }
          this.lead[i] = -1;
        }
      } else if (st === ST.WALK) {
        const W = this.w, e = this.edge[i], d = this.dir[i], L = W.edgeLen[e];
        const node = W.edgeNodes[e * 2 + (d > 0 ? 1 : 0)], sb = W.nodeSet ? W.nodeSet[node] : 0;
        const kerb = d > 0 ? Math.max(0, L - sb) : Math.min(L, sb);
        if (sb > 0 && (this.s[i] - kerb) * d >= -0.05) {
          // at the corner: plan the way over, then wait for the light / a gap, facing the crossing
          if (this.nxtE[i] < 0) this.planCross(i, node, sb);
          if (this.nxtE[i] === e) { this.placeOnEdge(i, e, -d, this.s[i]); this.updatePedPose(i, dt); }
          else this.state[i] = ST.CROSS;
        } else {
          this.waitT[i] = 0;
          this.s[i] += this.speed[i] * dt * d;
          if (sb > 0 && (this.s[i] - kerb) * d > 0) this.s[i] = kerb; // (up to the kerb, not over it)
          if (this.s[i] > L || this.s[i] < 0) {
            // a bend in the street (no junction here): straight on to the next piece, same sidewalk
            const [ne, nd] = this.nextEdge(node, e, false);
            if (ne !== e) this.side[i] = this.side[i] * d * nd;
            this.placeOnEdge(i, ne, nd, nd > 0 ? 0 : W.edgeLen[ne]);
          }
          this.updatePedPose(i, dt);
        }
        const shops = this.w.edgeShops ? this.w.edgeShops[this.edge[i]] : 0;
        const jog = (this.lights[i] & PED.JOG) !== 0, dog = (this.lights[i] & PED.DOG) !== 0;
        if (jog || this.state[i] !== ST.WALK || this.nxtE[i] >= 0) { /* a jogger keeps going; at a corner, cross first */ }
        else if (moving && dog && this.rng.float() < dt * 0.05) { this.state[i] = ST.PAUSE; this.timer[i] = this.rng.range(3, 10); } // the dog stops to sniff
        else if (moving && this.rng.float() < dt * (0.02 + Math.min(0.05, shops * 0.01))) {
          this.state[i] = ST.PAUSE;
          this.timer[i] = this.rng.range(2, 9);
          if (shops > 0.5 && this.rng.float() < 0.7) {
            // window shopping: turn to the shop fronts and linger
            this.sample(this.edge[i], this.s[i], this.tmp);
            const lx = this.x[i] - this.tmp[0], lz = this.z[i] - this.tmp[2];
            if (Math.hypot(lx, lz) > 0.5) this.yaw[i] = Math.atan2(-lx, -lz);
            this.timer[i] = this.rng.range(4, 14);
          }
        } else if (moving && this.rng.float() < dt * 0.05) this.meet(i);
        else if (moving && !dog && this.rng.float() < dt * 0.07) this.tryVisit(i);
      } else if (st === ST.CROSS) {
        // round the corner to the crosswalk (leg 0), wait there for the light or a gap, over it
        // (leg 1 — the cars on it wait: crossingAt), then on to the next street's sidewalk (leg 2)
        const W = this.w, e = this.edge[i], node = W.edgeNodes[e * 2 + (this.dir[i] > 0 ? 1 : 0)];
        const sb = W.nodeSet ? W.nodeSet[node] : 0, o = i * 4, lg = this.leg[i];
        const gx = lg === 0 ? this.xp[o] : lg === 1 ? this.xp[o + 2] : this.tx[i], gz = lg === 0 ? this.xp[o + 1] : lg === 1 ? this.xp[o + 3] : this.tz[i];
        const dx = gx - this.x[i], dz = gz - this.z[i], l = Math.hypot(dx, dz), stp = this.speed[i] * dt;
        const ne = this.nxtE[i], nd = this.nxtD[i];
        if (ne < 0) { this.state[i] = ST.WALK; this.updatePedPose(i, dt); } // (lost its plan: back to the sidewalk)
        else if (l > stp) {
          this.x[i] += (dx / l) * stp; this.z[i] += (dz / l) * stp;
          this.y[i] += (this.ty[i] - this.y[i]) * Math.min(1, stp / Math.max(stp, Math.hypot(this.tx[i] - this.x[i], this.tz[i] - this.z[i])));
          this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-dx, -dz), Math.min(1, dt * 6));
        } else {
          this.x[i] = gx; this.z[i] = gz;
          if (lg === 0) {
            if (this.crossWait(i, node, sb, dt)) {
              moving = 0; // at the kerb, facing the far side
              this.yaw[i] = angLerp(this.yaw[i], Math.atan2(-(this.xp[o + 2] - gx), -(this.xp[o + 3] - gz)), Math.min(1, dt * 4));
            } else this.leg[i] = 1;
          } else if (lg === 1) this.leg[i] = 2;
          else {
            const L2 = W.edgeLen[ne];
            this.placeOnEdge(i, ne, nd, nd > 0 ? Math.min(sb, L2 * 0.5) : Math.max(L2 * 0.5, L2 - sb));
            this.state[i] = ST.WALK; this.leg[i] = 0;
            this.updatePedPose(i, dt);
          }
        }
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
      } else if (st === ST.DOWN) {
        // thrown, sliding to a stop on the ground, then back on their feet
        moving = 0;
        this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt;
        this.y[i] = Math.max(this.ty[i], this.y[i] + this.vy[i] * dt);
        this.vy[i] = this.y[i] <= this.ty[i] ? 0 : this.vy[i] - 9.8 * dt;
        const f = Math.exp(-dt * 2.6);
        this.vx[i] *= f; this.vz[i] *= f;
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) {
          // up again: brush off and walk back to the path (no teleport), then carry on along it
          const ne = this.nearestEdge(this.x[i], this.z[i], (e) => this.walkable(e), 30);
          if (!ne) { this.active[i] = 0; this.y[i] = -1000; this.snapPrev(i); }
          else {
            this.sample(ne[0], ne[1], this.tmp);
            const dx = this.tmp[0] - this.x[i], dz = this.tmp[2] - this.z[i], L = Math.hypot(dx, dz);
            if (L < 0.35 || this.timer[i] < -4) { this.placeOnEdge(i, ne[0], this.rng.float() < 0.5 ? 1 : -1, ne[1]); this.state[i] = ST.WALK; this.updatePedPose(i, 1); this.snapPrev(i); }
            else {
              const st = Math.min(L, 1.2 * dt);
              this.x[i] += dx / L * st; this.z[i] += dz / L * st; this.y[i] += (this.tmp[1] - this.y[i]) * Math.min(1, dt * 4);
              this.yaw[i] = Math.atan2(-dx, -dz);
              this.vx[i] = 0; this.vz[i] = 0;
              moving = 1;
            }
          }
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
      // knocked down: −1…−1.9 sprawled (the fraction is how far into the fall — the renderer tumbles
      // them once), −2.5 sitting up; back to a walk (≥ 0) once the timer runs out
      this.amt[i] = st === ST.DOWN && this.timer[i] > 0 ? (this.timer[i] > 1.1 ? -1 - Math.min(0.9, Math.max(0, (2.6 - this.timer[i]) / 1.5)) : -2.5) : st === ST.CHAT ? AMT_CHAT : moving && this.lights[i] & PED.JOG ? AMT_RUN : moving;
      this.anim[i] += moving * this.speed[i] * dt * 5.2;
    }
    // who is crossing where (the cars read it next tick)
    this.xHead.fill(-1);
    for (let i = p0; i < p1; i++) {
      if (!this.active[i] || this.state[i] !== ST.CROSS || !this.xmask[i] || this.leg[i] !== 1) continue; // (in the road)
      const e = this.edge[i], node = this.w.edgeNodes[e * 2 + (this.dir[i] > 0 ? 1 : 0)];
      this.xNext[i] = this.xHead[node]; this.xHead[node] = i;
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
      if (this.tick % 40 === 0) this.sizeBubble();
      this.recycle(RANGES.peds, this.bubble.ped, 6);
      this.recycle(RANGES.cars, this.bubble.car, 5);
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

