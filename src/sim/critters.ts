// Wildlife around the walker: squirrels at the foot of trees (they bolt up the trunk when you
// come close), rabbits on lawns at dawn and dusk, songbirds hopping on grass by day, sandpipers
// running the surf line, deer at the wood's edge, butterflies over gardens in the warm months and
// fireflies on summer nights. Habitat comes from the world itself (trees, land cover, the ocean
// edge, gardens) so every region grows its own — no per-town lists. A light main-thread sim: a
// few dozen animals within ~90 m, one instanced draw per species (fauna.ts).
import * as THREE from 'three';
import type { Terrain } from '../world/data';
import type { WalkWorld } from '../player/collision';
import { CRITTERS, critterLib, critterMaterial, type CritterKind } from '../assets/fauna';

// Small animals are drawn a little larger than life (×1.3–2): at painting scale a true-size
// squirrel dissolves into the grass wash — the same licence an illustrator takes.
interface Spec { cap: number; walk: number; flee: number; fleeR: number; gaitHz: number; scale: [number, number]; colors: number[] }
const SPEC: Record<CritterKind, Spec> = {
  squirrel: { cap: 8, walk: 1.6, flee: 5.5, fleeR: 7, gaitHz: 1.6, scale: [1.3, 1.5], colors: [0xffffff] },
  rabbit: { cap: 6, walk: 1.1, flee: 7, fleeR: 9, gaitHz: 1.3, scale: [1.15, 1.35], colors: [0xffffff] },
  songbird: { cap: 10, walk: 0.7, flee: 6, fleeR: 5, gaitHz: 3, scale: [1.4, 1.7], colors: [0xc2302a, 0x4f7cc0, 0x8a6a4e, 0x7a6a5a, 0x6a7a48] },
  sandpiper: { cap: 12, walk: 1.4, flee: 3.5, fleeR: 8, gaitHz: 4.5, scale: [1.25, 1.45], colors: [0xffffff] },
  deer: { cap: 3, walk: 1.0, flee: 8, fleeR: 26, gaitHz: 0.9, scale: [0.85, 1.05], colors: [0xffffff] },
  butterfly: { cap: 10, walk: 0.9, flee: 0.9, fleeR: 0, gaitHz: 0, scale: [1.5, 2.1], colors: [0xe8862a, 0xf2d24a, 0x7aa6e0, 0xf6f2e8, 0xd86a9a] },
  firefly: { cap: 30, walk: 0.4, flee: 0.4, fleeR: 0, gaitHz: 0, scale: [0.9, 1.1], colors: [0xffffff] },
};

type State = 'idle' | 'move' | 'flee' | 'climb' | 'perch' | 'fly' | 'drift';
interface Critter {
  kind: CritterKind; x: number; y: number; z: number; yaw: number; pitch: number;
  state: State; t: number; tx: number; tz: number; ty: number; home?: { x: number; z: number };
  phase: number; amt: number; s: number; c: THREE.Color; seed: number;
}
export interface CritterEnv {
  hour: number; night: number; month: number; wind: number; south: boolean;
  camFwd: THREE.Vector3;
  trees: (x: number, z: number, r: number) => { x: number; z: number }[];
  gardens: (x: number, z: number, r: number) => { x: number; z: number }[];
}

export class Critters {
  readonly group = new THREE.Group();
  private list: Critter[] = [];
  private meshes = new Map<CritterKind, { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute }>();
  private spawnT = 0;
  private seed = 1;
  private mat4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sv = new THREE.Vector3();
  enabled = true;
  onEvent: ((kind: CritterKind, what: 'flee' | 'flush', pan: number, dist: number) => void) | null = null;
  stats: Record<string, number> = {};

  constructor(private terrain: Terrain, private walk: WalkWorld) {
    this.group.name = 'critters';
    for (const k of CRITTERS) {
      const cap = SPEC[k].cap;
      const geo = critterLib(k).clone();
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAnim', anim);
      const m = new THREE.InstancedMesh(geo, critterMaterial(k), cap);
      m.name = `critter:${k}`;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.layers.enable(1);
      this.group.add(m);
      this.meshes.set(k, { m, anim });
    }
  }

  private rnd() { this.seed = (Math.imul(this.seed ^ 0x9e3779b9, 0x85ebca6b) + 0x6b43a9b3) >>> 0; return this.seed / 4294967296; }

  // ---------------- habitat ----------------
  private ground(x: number, z: number) { return Math.max(this.terrain.heightAt(x, z), 0); }
  private open(x: number, z: number, r = 0.6) { return this.terrain.sdfAt(x, z) > 2 && this.walk.buildingAt(x, z) < 0 && !this.walk.blocked(x, z, r); }
  private lawn(x: number, z: number) { const c = this.terrain.coverAt(x, z); return (c === 30 || c === 10 || c === 20) && this.terrain.oceanDistAt(x, z) > 60 && this.open(x, z, 1.2); }
  private shore(x: number, z: number) { const s = this.terrain.sdfAt(x, z); return this.terrain.oceanDistAt(x, z) < 45 && s > 0.5 && s < 14; }
  private want(k: CritterKind, env: CritterEnv) {
    const h = env.hour, day = env.night < 0.35;
    const warm = (env.south ? ((env.month + 5) % 12) + 1 : env.month);
    const summer = warm >= 5 && warm <= 9;
    const dawnDusk = (h > 5 && h < 9.5) || (h > 16.5 && h < 20.5);
    switch (k) {
      case 'squirrel': return day ? 6 : 0;
      case 'rabbit': return dawnDusk ? 4 : day ? 1 : 0;
      case 'songbird': return day ? (h < 10 ? 8 : 5) : 0;
      case 'sandpiper': return day ? 10 : 0;
      case 'deer': return dawnDusk ? 2 : 0;
      case 'butterfly': return day && summer && env.wind < 0.75 ? 8 : 0;
      case 'firefly': return env.night > 0.6 && warm >= 6 && warm <= 8 ? 26 : 0;
    }
  }
  private place(k: CritterKind, wx: number, wz: number, env: CritterEnv): Omit<Critter, 'kind' | 'seed' | 'c' | 's'> | null {
    const near = k === 'butterfly' || k === 'firefly';
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rnd() * Math.PI * 2;
      const d = near ? 6 + this.rnd() * 22 : 20 + this.rnd() * 40;
      let x = wx + Math.sin(a) * d, z = wz + Math.cos(a) * d;
      // don't pop into existence in plain view (unless far or tiny)
      const f = env.camFwd;
      if (!near && d < 38 && (Math.sin(a) * f.x + Math.cos(a) * f.z) > 0.25) continue;
      let home: { x: number; z: number } | undefined;
      if (k === 'squirrel') {
        const t = env.trees(x, z, 14);
        if (!t.length) continue;
        home = t[Math.floor(this.rnd() * t.length)];
        const ra = this.rnd() * 6.28;
        x = home.x + Math.sin(ra) * (1.5 + this.rnd() * 3);
        z = home.z + Math.cos(ra) * (1.5 + this.rnd() * 3);
        if (!this.open(x, z, 0.3)) continue;
      } else if (k === 'rabbit' || k === 'songbird') {
        if (!this.lawn(x, z)) continue;
      } else if (k === 'sandpiper') {
        if (!this.shore(x, z)) continue;
      } else if (k === 'deer') {
        if (this.terrain.coverAt(x, z) !== 10 || !this.open(x, z, 3) || env.trees(x, z, 12).length < 3) continue;
      } else if (k === 'butterfly') {
        const gd = env.gardens(x, z, 20);
        if (gd.length) { const g = gd[Math.floor(this.rnd() * gd.length)]; x = g.x; z = g.z; }
        else if (!this.lawn(x, z)) continue;
      } else if (k === 'firefly') {
        if (!this.lawn(x, z) && this.terrain.coverAt(x, z) !== 10) continue;
      }
      const y = this.ground(x, z) + (k === 'butterfly' ? 0.6 + this.rnd() : k === 'firefly' ? 0.4 + this.rnd() * 1.6 : 0);
      return { x, y, z, yaw: this.rnd() * 6.28, pitch: 0, state: near ? 'drift' : 'idle', t: 1 + this.rnd() * 3, tx: x, tz: z, ty: y, home, phase: this.rnd(), amt: 0 };
    }
    return null;
  }

  // ---------------- tick ----------------
  update(dt: number, wx: number, wz: number, env: CritterEnv) {
    const count: Record<string, number> = {};
    for (const c of this.list) count[c.kind] = (count[c.kind] ?? 0) + 1;
    if (this.enabled && (this.spawnT -= dt) <= 0) {
      this.spawnT = 0.6;
      for (const k of CRITTERS) {
        const want = Math.min(SPEC[k].cap, this.want(k, env));
        if ((count[k] ?? 0) >= want) continue;
        const p = this.place(k, wx, wz, env);
        if (!p) continue;
        const S = SPEC[k];
        this.list.push({ ...p, kind: k, seed: this.seed, s: S.scale[0] + this.rnd() * (S.scale[1] - S.scale[0]), c: new THREE.Color(S.colors[Math.floor(this.rnd() * S.colors.length)]) });
        count[k] = (count[k] ?? 0) + 1;
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const d = Math.hypot(c.x - wx, c.z - wz);
      const gone = d > 95 || (!this.enabled) || (this.want(c.kind, env) === 0 && d > 30) || (c.state === 'fly' && c.t <= 0) || (c.state === 'perch' && c.t <= 0 && d > 18);
      if (gone) { this.list.splice(i, 1); continue; }
      this.step(c, dt, wx, wz, d, env);
    }
    this.stats = count;
    this.draw();
  }

  private step(c: Critter, dt: number, wx: number, wz: number, d: number, env: CritterEnv) {
    const S = SPEC[c.kind];
    c.t -= dt;
    // startle
    if (S.fleeR && d < S.fleeR && (c.state === 'idle' || c.state === 'move')) {
      const pan = Math.max(-1, Math.min(1, ((c.x - wx) * env.camFwd.z - (c.z - wz) * env.camFwd.x) / Math.max(1, d)));
      if (c.kind === 'songbird') { c.state = 'fly'; c.t = 3.5; this.onEvent?.(c.kind, 'flush', pan, d); }
      else if (c.kind === 'squirrel' && c.home && Math.hypot(c.home.x - c.x, c.home.z - c.z) < 14) { c.state = 'flee'; c.tx = c.home.x; c.tz = c.home.z; c.t = 4; this.onEvent?.(c.kind, 'flee', pan, d); }
      else {
        c.state = 'flee';
        c.t = c.kind === 'deer' ? 5 : 1.6;
        const a = Math.atan2(c.x - wx, c.z - wz) + (this.rnd() - 0.5) * 0.9;
        c.tx = c.x + Math.sin(a) * 40; c.tz = c.z + Math.cos(a) * 40;
        if (c.kind === 'sandpiper' || c.kind === 'deer') this.onEvent?.(c.kind, c.kind === 'deer' ? 'flee' : 'flush', pan, d);
      }
    }
    let speed = 0;
    switch (c.state) {
      case 'idle':
        c.amt = Math.max(0, c.amt - dt * 4);
        if (c.t <= 0) {
          for (let k = 0; k < 4; k++) {
            const a = this.rnd() * 6.28, r = 2 + this.rnd() * (c.kind === 'deer' ? 8 : 5);
            const tx = c.x + Math.sin(a) * r, tz = c.z + Math.cos(a) * r;
            if (!this.open(tx, tz, 0.2)) continue;
            if (c.kind === 'sandpiper' && !this.shore(tx, tz)) continue;
            c.tx = tx; c.tz = tz; c.state = 'move'; c.t = 6; break;
          }
          if (c.state === 'idle') c.t = 1 + this.rnd() * 2;
        }
        break;
      case 'move': case 'flee': {
        speed = c.state === 'flee' ? S.flee : S.walk;
        const dx = c.tx - c.x, dz = c.tz - c.z, L = Math.hypot(dx, dz);
        if (L < 0.3 || c.t <= 0) {
          if (c.state === 'flee' && c.kind === 'squirrel' && c.home && L < 0.6) { c.state = 'climb'; c.t = 1.4; c.ty = c.y + 3 + this.rnd() * 2.5; break; }
          if (c.state === 'flee' && c.kind === 'sandpiper' && d < S.fleeR) { c.state = 'fly'; c.t = 3; break; }
          c.state = 'idle'; c.t = 0.8 + this.rnd() * 3; break;
        }
        const step = Math.min(L, speed * dt);
        const nx = c.x + (dx / L) * step, nz = c.z + (dz / L) * step;
        if (!this.open(nx, nz, 0.15) && !(c.kind === 'squirrel' && c.state === 'flee')) { c.state = 'idle'; c.t = 0.4; break; }
        c.x = nx; c.z = nz;
        c.yaw = Math.atan2(-dx, -dz);
        c.y = this.ground(c.x, c.z);
        c.amt = Math.min(1, c.amt + dt * 6);
        c.phase += dt * S.gaitHz * (c.state === 'flee' ? 2.2 : 1);
        break;
      }
      case 'climb':
        c.pitch = Math.min(Math.PI / 2 - 0.1, c.pitch + dt * 4);
        c.y = Math.min(c.ty, c.y + dt * 3.2);
        c.amt = 1; c.phase += dt * 3.5;
        if (c.y >= c.ty) { c.state = 'perch'; c.t = 8; c.amt = 0; }
        break;
      case 'perch':
        c.amt = 0;
        break;
      case 'fly': {
        const a = Math.atan2(c.x - wx, c.z - wz);
        c.x += Math.sin(a) * 7 * dt; c.z += Math.cos(a) * 7 * dt;
        c.y += 2.6 * dt; c.yaw = a + Math.PI; c.pitch = 0.2;
        c.amt = 0.2; c.phase += dt * 3;
        break;
      }
      case 'drift': {
        // butterflies and fireflies wander on smooth random curves near the ground
        const tt = performance.now() / 1000 + c.phase * 50;
        const fx = Math.sin(tt * 0.7 + c.phase * 9) + Math.sin(tt * 1.9) * 0.4, fz = Math.cos(tt * 0.6 + c.phase * 5) + Math.cos(tt * 1.7) * 0.4;
        c.x += fx * S.walk * dt; c.z += fz * S.walk * dt;
        const base = this.ground(c.x, c.z);
        const target = base + (c.kind === 'butterfly' ? 0.7 + 0.5 * Math.sin(tt * 1.3 + c.phase) : 0.8 + 0.8 * Math.sin(tt * 0.5 + c.phase * 7));
        c.y += (target - c.y) * Math.min(1, dt * 2);
        c.yaw = Math.atan2(-fx, -fz);
        if (Math.hypot(c.x - wx, c.z - wz) > 40 && !env.gardens(c.x, c.z, 25).length && c.kind === 'butterfly') c.t = Math.min(c.t, 0);
        break;
      }
    }
  }

  private draw() {
    const per = new Map<CritterKind, number>();
    for (const c of this.list) {
      const M = this.meshes.get(c.kind)!;
      const i = per.get(c.kind) ?? 0;
      if (i >= M.m.instanceMatrix.count) continue;
      per.set(c.kind, i + 1);
      // climbing / perched squirrels face up the trunk, a little out from it
      let x = c.x, z = c.z;
      if ((c.state === 'climb' || c.state === 'perch') && c.home) {
        const dx = c.x - c.home.x, dz = c.z - c.home.z, L = Math.hypot(dx, dz) || 1;
        x = c.home.x + (dx / L) * 0.32; z = c.home.z + (dz / L) * 0.32;
        c.yaw = Math.atan2(dx, dz);
      }
      this.e.set(c.pitch, c.yaw, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.mat4.compose(this.v.set(x, c.y, z), this.q, this.sv.setScalar(c.s));
      M.m.setMatrixAt(i, this.mat4);
      M.m.setColorAt(i, c.c);
      const pose = c.kind === 'firefly' ? 3 : c.state === 'fly' || c.kind === 'butterfly' ? 2 : c.amt > 0 ? 1 : 0;
      M.anim.setXYZ(i, c.phase, c.amt, pose);
    }
    for (const [k, M] of this.meshes) {
      M.m.count = per.get(k) ?? 0;
      M.m.instanceMatrix.needsUpdate = true;
      if (M.m.instanceColor) M.m.instanceColor.needsUpdate = true;
      M.anim.needsUpdate = true;
    }
  }
}
