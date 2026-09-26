// Rideable vehicles — cars, boats and a light plane. Walk up to one and press E; V / B / N summon
// a car (on the nearest street), a boat (on the nearest open water) or a plane (on the nearest
// clear run, or in the air if you're flying). The world keeps streaming around whatever you ride:
// the walker is carried along (streaming, life, HUD and interiors all key off it), and the camera
// becomes a chase cam you can orbit with the mouse.
//
// Physics is arcade and deterministic-free (it's the player's own state): a bicycle model on
// terrain + decks for cars (buildings collide through WalkWorld), a water-bound hull for boats,
// and a lift/stall/bank model for the plane that lands on terrain or water-as-runway-at-your-peril.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial, colored } from '../render/propMaterial';
import { carGeo, boatGeo } from '../sim/life';
import type { WalkWorld } from './collision';
import { walkParams, type Walker } from './controller';
import type { Road, Terrain } from '../world/data';

export type VKind = 'car' | 'boat' | 'plane';

interface Veh {
  kind: VKind;
  obj: THREE.Group;
  prop?: THREE.Object3D; // spinning propeller
  x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number;
  v: number; // forward speed m/s
  steer: number;
  throttle: number;
  feet: number; // ground/deck height under a car
  airborne: boolean;
}

const SPECS = {
  car: { reach: 4.2, camDist: 7.2, camH: 2.6, look: 1.1 },
  boat: { reach: 5.5, camDist: 10, camH: 3.4, look: 1.2 },
  plane: { reach: 7.5, camDist: 15, camH: 4.2, look: 1.4 },
} as const;
const CAR_COLORS = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x5a5e64, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e, 0x7a8894];
const MAX_KEPT = 6; // parked player vehicles left around the world (oldest recycled)

// Paint the white (tintable) parts of a vertex-coloured model.
function tint(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.98 && col.getY(i) > 0.98 && col.getZ(i) > 0.98) col.setXYZ(i, c.r, c.g, c.b);
  return g;
}

// A high-wing single-engine plane (nose toward -z, like every model here), ~8 m long.
function planeGeo() {
  const B = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
  const nose = colored(new THREE.CylinderGeometry(0.45, 0.62, 1.1, 10).rotateX(Math.PI / 2).translate(0, 1.0, -3.55), 0xf2efe6);
  const spinner = colored(new THREE.ConeGeometry(0.2, 0.45, 10).rotateX(-Math.PI / 2).translate(0, 1.0, -4.3), 0x9c2a26);
  const wheel = (x: number, z: number) => colored(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 10).rotateZ(Math.PI / 2).translate(x, 0.26, z), 0x1d1e21);
  return mergeGeometries([
    B(1.25, 1.35, 4.2, 0, 1.05, -0.9, 0xffffff), // cabin + engine bay (tintable stripe colour below)
    B(1.28, 0.18, 4.25, 0, 0.95, -0.9, 0x9c2a26), // cheat line
    B(0.9, 0.9, 3.6, 0, 1.2, 2.6, 0xffffff), // tail boom
    nose, spinner,
    B(1.1, 0.5, 1.4, 0, 1.6, -1.6, 0x2a3442), // windscreen / side windows
    B(10.6, 0.14, 1.55, 0, 1.86, -0.95, 0xf4f1ea), // high wing
    B(0.9, 0.16, 1.58, 4.9, 1.87, -0.95, 0x9c2a26), B(0.9, 0.16, 1.58, -4.9, 1.87, -0.95, 0x9c2a26), // wingtips
    B(0.07, 1.2, 0.07, 1.9, 1.25, -0.9, 0x8d8a82), B(0.07, 1.2, 0.07, -1.9, 1.25, -0.9, 0x8d8a82), // struts
    B(3.6, 0.1, 1.0, 0, 1.45, 4.05, 0xf4f1ea), // tailplane
    B(0.1, 1.5, 1.2, 0, 2.2, 4.1, 0xf4f1ea), B(0.12, 0.5, 0.5, 0, 2.7, 4.35, 0x9c2a26), // fin + flash
    B(0.08, 0.7, 0.08, 0.75, 0.55, -1.1, 0x5a5550), B(0.08, 0.7, 0.08, -0.75, 0.55, -1.1, 0x5a5550),
    wheel(0.85, -1.1), wheel(-0.85, -1.1), wheel(0, 3.5),
  ]);
}
function propGeo() {
  return mergeGeometries([colored(new THREE.BoxGeometry(2.1, 0.14, 0.05), 0x2a2a2c), colored(new THREE.BoxGeometry(0.14, 2.1, 0.05), 0x2a2a2c)]);
}

export class Vehicles {
  private list: Veh[] = [];
  private active: Veh | null = null;
  private mat = propMaterial();
  private group = new THREE.Group();
  private hud: HTMLElement;
  private keys = new Set<string>();
  private taken = new Set<string>(); // parked-car instances ('tile:index') the player drove off in
  private camPos = new THREE.Vector3();
  private camInit = false;
  private orbitYaw = 0;
  private orbitPitch = 0;
  private seed = 1;

  constructor(
    private o: {
      walk: WalkWorld;
      terrain: Terrain;
      walker: Walker;
      root: THREE.Object3D;
      toast: (m: string) => void;
      roads: () => Road[];
      tiles: () => Iterable<{ spec: { id: string }; group: THREE.Group }>;
      driveLeft: boolean;
      enabled: () => boolean; // false while menus/journal/intro are up
    },
  ) {
    this.group.name = 'player-vehicles';
    o.root.add(this.group);
    this.hud = document.createElement('div');
    this.hud.id = 'vehud';
    Object.assign(this.hud.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: '14px', background: 'rgba(245,239,225,0.82)', color: '#3a3346', font: '14px Georgia, serif', pointerEvents: 'none', display: 'none', zIndex: '20', whiteSpace: 'nowrap' });
    document.body.appendChild(this.hud);
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
      this.keys.add(e.code);
      if (e.repeat || !o.enabled()) return;
      if (e.code === 'KeyE') this.toggle();
      else if (e.code === 'KeyV') this.summon('car');
      else if (e.code === 'KeyB') this.summon('boat');
      else if (e.code === 'KeyN') this.summon('plane');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get driving() { return this.active !== null; }
  get activeKind(): VKind | null { return this.active?.kind ?? null; }

  // ---------------- world queries ----------------
  private water(x: number, z: number) {
    const t = this.o.terrain;
    return t.heightAt(x, z) < -0.45 && t.sdfAt(x, z) < -1.2;
  }
  private ground(x: number, z: number) { return Math.max(this.o.terrain.heightAt(x, z), 0); }
  private roofTop(x: number, z: number) {
    const b = this.o.walk.buildingAt(x, z);
    if (b < 0) return -Infinity;
    const f = this.o.walk.floorsOf(b);
    return f ? f.floor0 + f.levels * f.floorH + 2.5 : this.ground(x, z) + 10;
  }

  // ---------------- lifecycle ----------------
  private make(kind: VKind, x: number, z: number, yaw: number, color?: number): Veh {
    const obj = new THREE.Group();
    let prop: THREE.Object3D | undefined;
    const c = color ?? CAR_COLORS[(this.seed++ * 7) % CAR_COLORS.length];
    if (kind === 'car') obj.add(new THREE.Mesh(tint(carGeo(), c), this.mat));
    else if (kind === 'boat') obj.add(new THREE.Mesh(tint(boatGeo(), 0xf4f1ea), this.mat));
    else {
      obj.add(new THREE.Mesh(tint(planeGeo(), c === 0x26282c ? 0xf4f1ea : 0xf4f1ea), this.mat));
      prop = new THREE.Mesh(propGeo(), this.mat);
      prop.position.set(0, 1.0, -4.55);
      obj.add(prop);
    }
    obj.traverse((m) => m.layers.enable(1));
    this.group.add(obj);
    const y = kind === 'boat' ? 0 : this.o.walk.surfaceAt(x, z);
    const v: Veh = { kind, obj, prop, x, y, z, yaw, pitch: 0, roll: 0, v: 0, steer: 0, throttle: 0, feet: y, airborne: false };
    this.list.push(v);
    // keep the world tidy: recycle the oldest parked player vehicle
    while (this.list.length > MAX_KEPT) {
      const old = this.list.find((q) => q !== this.active && q !== v);
      if (!old) break;
      this.remove(old);
    }
    this.pose(v);
    return v;
  }
  private remove(v: Veh) {
    this.group.remove(v.obj);
    v.obj.traverse((m) => (m as THREE.Mesh).geometry?.dispose?.());
    this.list.splice(this.list.indexOf(v), 1);
  }

  // Driveway cars baked into tiles (props.ts names their InstancedMesh 'parked-cars'): the one you
  // take is hidden (and stays hidden across tile reloads) and becomes your car.
  private parkedNear(x: number, z: number, r: number) {
    let best: { key: string; im: THREE.InstancedMesh; i: number; x: number; z: number; yaw: number; color: number; d: number } | null = null;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    for (const t of this.o.tiles()) {
      const im = t.group.getObjectByName('parked-cars') as THREE.InstancedMesh | undefined;
      if (!im) continue;
      for (let i = 0; i < im.count; i++) {
        const key = `${t.spec.id}:${i}`;
        if (this.taken.has(key)) continue;
        im.getMatrixAt(i, m);
        m.decompose(p, q, s);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < r && (!best || d < best.d)) {
          e.setFromQuaternion(q, 'YXZ');
          if (im.instanceColor) im.getColorAt(i, c);
          best = { key, im, i, x: p.x, z: p.z, yaw: e.y, color: im.instanceColor ? c.getHex() : 0xb9bcc0, d };
        }
      }
    }
    return best;
  }
  private hideInstance(im: THREE.InstancedMesh, i: number) {
    im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
  }
  /** Re-hide taken driveway cars when their tile remounts. */
  onTile(t: { spec: { id: string }; group: THREE.Group }) {
    const im = t.group.getObjectByName('parked-cars') as THREE.InstancedMesh | undefined;
    if (!im) return;
    for (let i = 0; i < im.count; i++) if (this.taken.has(`${t.spec.id}:${i}`)) this.hideInstance(im, i);
  }

  // ---------------- enter / exit ----------------
  private toggle() {
    if (this.active) return this.exit();
    const w = this.o.walker;
    let best: Veh | null = null, bd = Infinity;
    for (const v of this.list) {
      const d = Math.hypot(v.x - w.x, v.z - w.z) - SPECS[v.kind].reach;
      if (d < 0 && d < bd) (bd = d), (best = v);
    }
    if (!best && !walkParams.fly) {
      const pk = this.parkedNear(w.x, w.z, SPECS.car.reach + 0.6);
      if (pk) {
        this.taken.add(pk.key);
        this.hideInstance(pk.im, pk.i);
        best = this.make('car', pk.x, pk.z, pk.yaw, pk.color);
      }
    }
    if (!best) return;
    this.enter(best);
  }
  private enter(v: Veh) {
    if (walkParams.fly) walkParams.fly = false;
    this.active = v;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.o.walker.yaw = 0; // walker yaw/pitch become orbit offsets while riding
    this.o.walker.pitch = 0;
    this.camInit = false;
    const hint = v.kind === 'car' ? 'W/S drive · A/D steer · Shift boost · E to get out' : v.kind === 'boat' ? 'W/S throttle · A/D steer · E to get out (near shore)' : 'Shift/C throttle · W/S pitch · A/D bank · E to jump out';
    this.o.toast(hint);
  }
  private exit() {
    const v = this.active!;
    const w = this.o.walker, walk = this.o.walk;
    this.active = null;
    this.hud.style.display = 'none';
    const back = v.yaw; // restore a sensible look direction
    if (v.kind === 'plane' && v.airborne) {
      // a gift of the painted world: step out into the sky and keep flying
      w.place(v.x, v.z, back, -0.1);
      walkParams.fly = true;
      w.y = v.y + 1;
      this.o.toast('you step out into the sky — F to come down');
      v.v = 0;
      v.airborne = false;
      v.y = this.ground(v.x, v.z) + 1.2;
      this.pose(v);
      return;
    }
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw); // vehicle's right
    const side = v.kind === 'car' ? 1.9 : v.kind === 'plane' ? 3.2 : 2.5;
    for (const [ox, oz] of [[-rx * side, -rz * side], [rx * side, rz * side], [Math.sin(v.yaw) * 3.5, Math.cos(v.yaw) * 3.5]]) {
      const x = v.x + ox, z = v.z + oz;
      if (walk.walkable(x, z) && walk.buildingAt(x, z) < 0 && !walk.blocked(x, z, 0.4)) {
        w.place(x, z, back, 0);
        return;
      }
    }
    const [x, z] = walk.nearestWalkable(v.x, v.z);
    if (Math.hypot(x - v.x, z - v.z) > 40) {
      this.active = v; // no dry land in reach — stay aboard
      this.o.toast('no dry land within reach — head for shore');
      return;
    }
    w.place(x, z, back, 0);
  }

  // ---------------- summoning ----------------
  summon(kind: VKind) {
    if (this.active) {
      // hop straight into the new ride: the old one stays where it is (moored, parked or circling)
      const old = this.active;
      this.active = null;
      this.hud.style.display = 'none';
      this.o.walker.place(old.x, old.z, old.yaw, 0);
      if (old.kind === 'plane' && old.airborne) { old.airborne = false; old.v = 0; old.y = this.ground(old.x, old.z) + 1; this.pose(old); }
    }
    const w = this.o.walker;
    const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
    if (kind === 'car') {
      // the nearest street lane, pointing the way you're facing
      let best: { x: number; z: number; yaw: number; d: number } | null = null;
      for (const r of this.o.roads()) {
        if (r.lod || r.br || ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'].includes(r.c)) continue;
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
          const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
          if (L2 < 4) continue;
          const t = Math.max(0, Math.min(1, ((w.x - ax) * dx + (w.z - az) * dz) / L2));
          const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - w.x, pz - w.z);
          if (d > 90 || (best && d > best.d)) continue;
          const L = Math.sqrt(L2), ux = dx / L, uz = dz / L, dir = ux * fx + uz * fz >= 0 ? 1 : -1;
          // keep to the lane: right-hand traffic pulls right of the centreline (left where they drive left)
          const lane = Math.min(2.2, r.w / 4) * (this.o.driveLeft ? -1 : 1);
          const x = px + -uz * dir * lane, z = pz + ux * dir * lane;
          if (this.o.walk.buildingAt(x, z) >= 0) continue;
          best = { x, z, yaw: Math.atan2(-ux * dir, -uz * dir), d };
        }
      }
      if (!best) return this.o.toast('no street nearby for a car');
      this.make('car', best.x, best.z, best.yaw);
      return this.o.toast('a car pulls up — walk over and press E');
    }
    if (kind === 'boat') {
      for (let r = 6; r <= 700; r += 8) {
        const n = Math.max(8, Math.floor((r * 2 * Math.PI) / 10));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + Math.atan2(fx, fz);
          const x = w.x + Math.sin(a) * r, z = w.z + Math.cos(a) * r;
          if (!this.water(x, z) || !this.water(x + 5, z) || !this.water(x - 5, z) || !this.water(x, z + 5) || !this.water(x, z - 5)) continue;
          // bow away from land: along the terrain's falling slope
          const gx = this.o.terrain.heightAt(x + 8, z) - this.o.terrain.heightAt(x - 8, z), gz = this.o.terrain.heightAt(x, z + 8) - this.o.terrain.heightAt(x, z - 8);
          const yaw = Math.hypot(gx, gz) > 1e-3 ? Math.atan2(gx, gz) : w.yaw;
          this.make('boat', x, z, yaw);
          return this.o.toast(r < 60 ? 'a boat bobs at the water’s edge — press E aboard' : `a boat waits on the water ${Math.round(r)} m away`);
        }
      }
      return this.o.toast('no open water nearby');
    }
    // plane: airborne if you're flying; otherwise the nearest clear, flat run ahead of you
    if (walkParams.fly) {
      const p = this.make('plane', w.x + fx * 30, w.z + fz * 30, w.yaw);
      p.y = w.y;
      p.airborne = true;
      p.v = 45;
      p.throttle = 0.5;
      this.pose(p);
      return this.o.toast('a plane swings alongside — press E');
    }
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const yaw = w.yaw + turn, ux = -Math.sin(yaw), uz = -Math.cos(yaw);
      for (let off = 8; off <= 60; off += 13) {
        const sx = w.x + ux * off, sz = w.z + uz * off;
        let ok = true;
        const h0 = this.o.terrain.heightAt(sx, sz);
        for (let s = 0; s <= 160 && ok; s += 10) {
          const x = sx + ux * s, z = sz + uz * s;
          for (const lat of [-5, 0, 5]) {
            const px = x + -uz * lat, pz = z + ux * lat;
            if (this.o.walk.buildingAt(px, pz) >= 0 || this.water(px, pz) || Math.abs(this.o.terrain.heightAt(px, pz) - h0) > 3) { ok = false; break; }
          }
        }
        if (ok) {
          this.make('plane', sx, sz, yaw);
          return this.o.toast('a plane is waiting on a clear run — press E');
        }
      }
    }
    const p = this.make('plane', w.x + fx * 40, w.z + fz * 40, w.yaw);
    p.y = Math.max(this.ground(p.x, p.z), 0) + 160;
    p.airborne = true;
    p.v = 48;
    p.throttle = 0.55;
    this.pose(p);
    this.o.toast('no clear run here — a plane circles overhead; F to fly up, then E');
  }

  // ---------------- per-frame ----------------
  private k(c: string) { return this.keys.has(c); }
  private axis(pos: string[], neg: string[]) { return (pos.some((c) => this.k(c)) ? 1 : 0) - (neg.some((c) => this.k(c)) ? 1 : 0); }

  /** Advance the ridden vehicle and the camera. Returns false when on foot (walker drives the camera). */
  update(dt: number, cam: THREE.PerspectiveCamera): boolean {
    for (const v of this.list) if (v.prop) v.prop.rotation.z += dt * (6 + (v === this.active ? v.throttle * 60 : 0));
    const v = this.active;
    if (!v) return false;
    dt = Math.min(dt, 0.05);
    if (v.kind === 'car') this.drive(v, dt);
    else if (v.kind === 'boat') this.sail(v, dt);
    else this.fly(v, dt);
    this.pose(v);
    // carry the walker: streaming, life, interiors, HUD all read its position
    const w = this.o.walker;
    w.x = v.x;
    w.z = v.z;
    w.y = v.y + 1.4;
    this.chase(v, dt, cam);
    const kmh = Math.round(Math.abs(v.v) * 3.6);
    this.hud.style.display = 'block';
    this.hud.textContent = v.kind === 'plane'
      ? `✈ ${kmh} km/h · alt ${Math.round(v.y - this.ground(v.x, v.z))} m · throttle ${Math.round(v.throttle * 100)}% · E to jump out`
      : `${v.kind === 'car' ? '🚗' : '⛵'} ${kmh} km/h · E to get out`;
    return true;
  }

  private drive(v: Veh, dt: number) {
    const walk = this.o.walk;
    const thr = this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const boost = this.k('ShiftLeft') || this.k('ShiftRight');
    const vmax = boost ? 38 : 24;
    if (thr > 0) v.v += (v.v < -0.3 ? 14 : boost ? 9 : 6) * dt;
    else if (thr < 0) v.v -= (v.v > 0.3 ? 14 : 4) * dt;
    else v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), (2.2 + Math.abs(v.v) * 0.05) * dt);
    v.v = Math.max(-7, Math.min(vmax, v.v));
    const st = this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    v.steer += (st - v.steer) * Math.min(1, dt * 5);
    const maxSteer = 0.55 / (1 + Math.abs(v.v) * 0.06);
    v.yaw += (v.v / 2.7) * Math.tan(v.steer * maxSteer) * dt;
    const dx = -Math.sin(v.yaw) * v.v * dt, dz = -Math.cos(v.yaw) * v.v * dt;
    const [nx, nz] = walk.move(v.x, v.z, dx, dz, 1.05, v.feet);
    const want = Math.hypot(dx, dz), got = Math.hypot(nx - v.x, nz - v.z);
    if (want > 1e-4 && got < want * 0.5) v.v *= 0.35; // bumped a wall / kerb of the water
    v.x = nx;
    v.z = nz;
    const target = walk.surfaceAt(v.x, v.z, v.feet);
    if (isFinite(target)) v.feet += (target - v.feet) * Math.min(1, dt * (target > v.feet ? 12 : 8));
    v.y = v.feet;
    // settle the body on the ground under its wheels
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    const h = (ox: number, oz: number) => walk.surfaceAt(v.x + ox, v.z + oz, v.feet);
    const pf = h(fx * 1.6, fz * 1.6), pb = h(-fx * 1.6, -fz * 1.6), pl = h(-rx * 0.9, -rz * 0.9), pr = h(rx * 0.9, rz * 0.9);
    const tp = isFinite(pf) && isFinite(pb) ? Math.atan2(pf - pb, 3.2) : 0, tr = isFinite(pl) && isFinite(pr) ? Math.atan2(pl - pr, 1.8) : 0;
    v.pitch += (Math.max(-0.4, Math.min(0.4, tp)) - v.pitch) * Math.min(1, dt * 8);
    v.roll += (Math.max(-0.3, Math.min(0.3, tr)) - v.roll) * Math.min(1, dt * 8);
  }

  private sail(v: Veh, dt: number) {
    const thr = this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const boost = this.k('ShiftLeft') || this.k('ShiftRight');
    const vmax = boost ? 20 : 12;
    if (thr !== 0) v.v += thr * (thr > 0 ? 3.2 : 2.5) * dt;
    else v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), 1.1 * dt);
    v.v = Math.max(-4, Math.min(vmax, v.v));
    const st = this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    v.steer += (st - v.steer) * Math.min(1, dt * 3);
    v.yaw += v.steer * (0.22 + Math.min(Math.abs(v.v), 9) * 0.07) * Math.sign(v.v || 1) * dt;
    const nx = v.x - Math.sin(v.yaw) * v.v * dt, nz = v.z - Math.cos(v.yaw) * v.v * dt;
    if (this.water(nx, nz)) (v.x = nx), (v.z = nz);
    else v.v *= -0.25; // run aground gently: bump back off the shore
    const t = performance.now() / 1000;
    v.y = 0.05 + Math.sin(t * 1.3 + v.x * 0.05) * 0.12;
    v.pitch = Math.sin(t * 1.1 + v.z * 0.07) * 0.03 + Math.min(0.08, Math.abs(v.v) * 0.006); // bow lifts under way
    v.roll = Math.sin(t * 0.9 + v.x * 0.04) * 0.05 - v.steer * Math.min(0.12, Math.abs(v.v) * 0.012);
  }

  private fly(v: Veh, dt: number) {
    const thr = this.axis(['ShiftLeft', 'ShiftRight', 'KeyR'], ['KeyC', 'KeyX']);
    v.throttle = Math.max(0, Math.min(1, v.throttle + thr * dt * 0.6));
    const pitchIn = this.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']); // S = nose up (pull back)
    const rollIn = this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const ground = this.ground(v.x, v.z);
    const gear = 1.0;
    const vTarget = v.throttle * 72;
    v.v += (vTarget - v.v) * dt * 0.28 - Math.sin(v.pitch) * 9.8 * dt * 0.55;
    v.v = Math.max(0, v.v);
    const VR = 27; // rotation speed
    if (!v.airborne) {
      v.roll += -v.roll * Math.min(1, dt * 6);
      const st = rollIn; // on the ground A/D steer the nosewheel
      v.yaw += st * 0.6 * Math.min(1, v.v / 10) * dt;
      if (v.v < 1 && v.throttle === 0) v.v = 0;
      if (v.throttle < 0.05) v.v -= Math.min(v.v, 5 * dt);
      v.pitch += ((v.v > VR && pitchIn > 0 ? 0.18 : 0) - v.pitch) * Math.min(1, dt * 2);
      if (v.v > VR && v.pitch > 0.1) v.airborne = true;
    } else {
      v.pitch += pitchIn * dt * 0.8;
      if (!pitchIn) v.pitch *= 1 - Math.min(1, dt * 0.35); // arcade: the nose settles back to level
      v.pitch = Math.max(-0.7, Math.min(0.6, v.pitch));
      if (rollIn) v.roll += rollIn * dt * 1.5;
      else v.roll += -v.roll * Math.min(1, dt * 0.9);
      v.roll = Math.max(-1.1, Math.min(1.1, v.roll));
      v.yaw += (9.8 * Math.tan(v.roll)) / Math.max(v.v, 18) * dt;
      if (v.v < 22) v.pitch -= (22 - v.v) * 0.03 * dt; // stall: the nose drops
    }
    const cp = Math.cos(v.pitch);
    const sink = v.airborne && v.v < 24 ? (24 - v.v) * 0.45 : 0;
    v.x += -Math.sin(v.yaw) * cp * v.v * dt;
    v.z += -Math.cos(v.yaw) * cp * v.v * dt;
    v.y += (v.airborne ? Math.sin(v.pitch) * v.v - sink : 0) * dt;
    const floor = ground + gear;
    const roof = this.roofTop(v.x, v.z);
    if (v.airborne && roof > -Infinity && v.y < roof) return this.crash(v, 'clipped a rooftop');
    if (v.y <= floor || !v.airborne) {
      if (v.airborne) {
        const descent = -(Math.sin(v.pitch) * v.v - sink);
        if (descent > 7 || Math.abs(v.roll) > 0.45 || v.pitch < -0.25) return this.crash(v, 'a hard landing');
        v.airborne = false;
        this.o.toast(this.water(v.x, v.z) ? 'splashdown — the painted sea is forgiving' : 'touchdown');
      }
      v.y = floor;
      if (this.o.walk.buildingAt(v.x, v.z) >= 0) v.v *= 0.2;
    }
  }
  private crash(v: Veh, why: string) {
    const [x, z] = this.o.walk.nearestWalkable(v.x, v.z);
    v.x = x;
    v.z = z;
    v.y = this.ground(x, z) + 1;
    v.v = 0;
    v.throttle = 0;
    v.pitch = 0;
    v.roll = 0;
    v.airborne = false;
    this.o.toast(`${why} — the paint forgives you; plane set down nearby`);
  }

  private pose(v: Veh) {
    v.obj.position.set(v.x, v.y, v.z);
    v.obj.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');
  }

  // Chase camera: behind and above, following heading (and the plane's pitch), orbitable with
  // the mouse (the walker's yaw/pitch are the offsets; they ease back behind when left alone).
  private chase(v: Veh, dt: number, cam: THREE.PerspectiveCamera) {
    const S = SPECS[v.kind], w = this.o.walker;
    this.orbitYaw = w.yaw;
    this.orbitPitch = w.pitch;
    if (!w.locked) {
      w.yaw *= 1 - Math.min(1, dt * 1.2);
      w.pitch *= 1 - Math.min(1, dt * 1.2);
    }
    const yaw = v.yaw + this.orbitYaw;
    const pitchFollow = v.kind === 'plane' ? v.pitch * 0.7 : 0;
    const el = Math.max(-0.2, Math.min(1.2, 0.18 + this.orbitPitch * 0.8 + pitchFollow));
    const dist = S.camDist * (1 + Math.min(0.5, Math.abs(v.v) / 90));
    const tx = v.x + Math.sin(yaw) * Math.cos(el) * dist;
    const tz = v.z + Math.cos(yaw) * Math.cos(el) * dist;
    let ty = v.y + S.camH + Math.sin(el) * dist;
    ty = Math.max(ty, this.ground(tx, tz) + 1.2); // never under the ground
    const target = new THREE.Vector3(tx, ty, tz);
    if (!this.camInit) { this.camPos.copy(target); this.camInit = true; }
    this.camPos.lerp(target, Math.min(1, dt * (v.kind === 'plane' ? 4 : 6)));
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(v.x, v.y + S.look, v.z);
    if (v.kind === 'plane') cam.rotateZ(v.roll * 0.35);
    if (cam.fov !== walkParams.fov) {
      cam.fov = walkParams.fov;
      cam.updateProjectionMatrix();
    }
  }
}
