// Rideable vehicles — cars, boats and a light plane. Walk up to one and press E. You get your own
// by painting them (ui/brush.ts: paint the kind from life, then paint it where you aim; the spot
// rules are player/place.ts); the old free summons — V car, Shift+B boat, N plane — are a
// developer switch in the panel. The world keeps streaming around whatever you ride:
// the walker is carried along (streaming, life, HUD and interiors all key off it), and the camera
// becomes a chase cam you can orbit with the mouse.
//
// Physics is arcade and deterministic-free (it's the player's own state): a bicycle model on
// terrain + decks for cars (buildings collide through WalkWorld), a water-bound hull for boats,
// and a lift/stall/bank model for the plane that lands on terrain or water-as-runway-at-your-peril.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial, colored } from '../render/propMaterial';
import { carMix, carLib, boatLib, boatRecipe, planeGeometry, planeRecipe, pickFrom, carRecipe, PLANE_TYPES, CAR_TYPES, type CarType, type BoatType, type PlaneType } from '../assets/kit';
import { personLib, MARK } from '../assets/people';
import { KERB_STRIDE } from '../world/kerbCars';
import type { WalkWorld } from './collision';
import { walkParams, type Walker } from './controller';
import type { Road, Terrain } from '../world/data';
import { activeStyle } from '../world/styles';
import { GEAR_NAME, type CarGear } from '../assets/furniture';
import { placeBoat, placeCar, type PlaceWorld, type Spot } from './place';

export type VKind = 'car' | 'boat' | 'plane';

interface Veh {
  kind: VKind;
  color?: number;
  model: string; // the asset kit type (sedan, pickup, console, seaplane …)
  gearY: number; // plane: height of the gear above the origin
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
  boat: { reach: 7, camDist: 10, camH: 3.4, look: 1.2 }, // (a hull needs 5 m of open water round it: board from the shallows)
  plane: { reach: 7.5, camDist: 15, camH: 4.2, look: 1.4 },
} as const;
const CAR_COLORS = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x5a5e64, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e, 0x7a8894];
const MAX_KEPT = 24; // parked player vehicles left around the world (oldest recycled)
// Where you left things survives the session: the rides you parked (by real lat/lon) and the
// driveway cars you drove off in (tile-instance keys are deterministic, so they stay gone).
const STORE = 'map-game.vehicles.v1';
interface Saved { taken: string[]; kept: { kind: VKind; model: string; lat: number; lon: number; yaw: number; color?: number }[] }

// Someone at the helm of the boat you ride (Round 9: "nobody is at the helm"): the crowd's body,
// one look (short hair, the rest of the wardrobe dropped), seated for a tiller or standing at a
// console. Built once.
let helmCache: { sit: THREE.BufferGeometry; stand: THREE.BufferGeometry } | null = null;
function helmGeometry(sit: boolean) {
  if (!helmCache) {
    const src = personLib();
    const pos = src.getAttribute('position') as THREE.BufferAttribute, col = src.getAttribute('color') as THREE.BufferAttribute, part = src.getAttribute('aPart') as THREE.BufferAttribute;
    const recolour: [readonly number[], number][] = [[MARK.skin, 0xc68642], [MARK.hair, 0x3b2a1e], [MARK.pants, 0x2e3a52], [MARK.shin, 0x2e3a52], [MARK.forearm, 0xd8cfa8], [[1, 1, 1], 0xd8cfa8]];
    const make = (seated: boolean) => {
      const P: number[] = [], C: number[] = [];
      for (let t = 0; t < pos.count; t += 3) {
        const id = part.getX(t);
        if (id >= 10) continue; // (the other hairstyles, the cap, the headphones)
        for (let k = 0; k < 3; k++) {
          const i = t + k;
          let y = pos.getY(i), z = pos.getZ(i);
          const x = pos.getX(i);
          if (seated && (id === 1 || id === 2)) {
            // the thigh swings forward about the hip, the shin hangs from the knee
            if (y > 0.47) { const d = 0.87 - y; y = 0.87 - 0.03 * (d / 0.4); z -= d; } else { y += 0.4; z -= 0.4; }
          }
          if (seated) y -= 0.45;
          P.push(x, y, z);
          let r = col.getX(i), g = col.getY(i), b = col.getZ(i);
          for (const [m, hex] of recolour) if (Math.abs(r - m[0]) < 0.01 && Math.abs(g - m[1]) < 0.01 && Math.abs(b - m[2]) < 0.01) { const c = new THREE.Color(hex); r = c.r; g = c.g; b = c.b; break; }
          C.push(r, g, b);
        }
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      out.computeVertexNormals();
      return out;
    };
    helmCache = { sit: make(true), stand: make(false) };
  }
  return sit ? helmCache.sit : helmCache.stand;
}

// Paint the white (tintable) parts of a vertex-coloured model.
function tint(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.98 && col.getY(i) > 0.98 && col.getZ(i) > 0.98) col.setXYZ(i, c.r, c.g, c.b);
  return g;
}

// The walking stick as a ride's controls. A thumb steering sideways always wanders a little up or
// down, and the stick taken straight as the pedals turned that wander into full throttle or the
// brakes (a plane's nose never settled): a small dead zone round the centre for steering and
// banking, a wider one along the throttle (a plane's pitch), each rescaled so the rest of the
// throw is the whole range. Keys don't come through here: they're all the way, as ever.
const STEER_DZ = 0.1, THROTTLE_DZ = 0.25;
const deadZone = (v: number, d: number) => { const a = Math.abs(v); return a <= d ? 0 : Math.sign(v) * Math.min(1, (a - d) / (1 - d)); };
/** The touch stick's pull (−1..1 each way, +y down) as ride inputs: x steers or banks, y the throttle or pitch. */
export function stickAxes(x: number, y: number) { return { x: deadZone(x, STEER_DZ), y: deadZone(y, THROTTLE_DZ) }; }
/** A phone or tablet (no mouse to hand): the rides say how the touch controls work, not the keys. */
const thumbs = () => typeof document !== 'undefined' && document.body.classList.contains('nomouse');

function propGeo() {
  return mergeGeometries([colored(new THREE.BoxGeometry(2.1, 0.14, 0.05), 0x2a2a2c), colored(new THREE.BoxGeometry(0.14, 2.1, 0.05), 0x2a2a2c)]);
}
// Summoned boats cycle the kit's hulls; hull paint rotates independently.
const BOAT_CYCLE: BoatType[] = ['console', 'skiff', 'cabin', 'sail', 'pontoon', 'lobster'];
const HULLS = [0xf4f1ea, 0xeef0f0, 0x2d4a6a, 0xd9e4ea, 0x9b3b32];
const NAME: Record<string, string> = { hatch: 'hatchback', suv: 'SUV', console: 'center-console', cabin: 'cabin cruiser', sail: 'sailboat', pontoon: 'pontoon boat', lobster: 'lobster boat', highwing: 'high-wing plane', lowwing: 'low-wing plane', seaplane: 'seaplane', biplane: 'biplane' };
export const modelName = (m: string) => {
  const [base, gear] = m.split('+');
  return (NAME[base] ?? base) + (gear && gear in GEAR_NAME ? ` with ${GEAR_NAME[gear as CarGear]}` : '');
};
/** Every baked driveway-car mesh in a tile (props.ts: one InstancedMesh per kit type, named 'parked-cars:<type>'). */
function parkedMeshes(g: THREE.Object3D) {
  const out: THREE.InstancedMesh[] = [];
  for (const c of g.children) if (c.name.startsWith('parked-cars')) out.push(c as THREE.InstancedMesh);
  return out;
}

export class Vehicles {
  private list: Veh[] = [];
  private active: Veh | null = null;
  private mat = propMaterial();
  private group = new THREE.Group();
  private hud: HTMLElement;
  private hudVal: HTMLElement;
  private hudKeys: HTMLElement;
  private keys = new Set<string>();
  private touchBoost = false;
  private touchThrottle = 0;
  private taken = new Set<string>(); // parked-car instances ('tile:index') the player drove off in
  private camPos = new THREE.Vector3();
  private camInit = false;
  private orbitYaw = 0;
  private orbitPitch = 0;
  private seed = 1;
  private exitT = -1e9; // (walk-in boarding waits a moment after you step off)
  private approachT = 0;
  private settle = new Map<Veh, number>(); // a painted boat dropping onto the water
  private helm: THREE.Mesh | null = null;
  private boatN = 0;
  private planeN = 0;

  constructor(
    private o: {
      walk: WalkWorld;
      terrain: Terrain;
      walker: Walker;
      root: THREE.Object3D;
      toast: (m: string) => void;
      roads: () => Road[];
      tiles: () => Iterable<{ spec: { id: string }; group: THREE.Group }>;
      /** the city's kerb and lot cars (kerbCars.ts): drivable too */
      kerb?: { find(x: number, z: number, r: number): { key: string; x: number; z: number; yaw: number; color: number; model: string; d: number } | null; refresh(): void; skip: (key: string) => boolean };
      driveLeft: boolean;
      enabled: () => boolean; // false while menus/journal/intro are up
      /** the developer's free rides (panel switch): V car, Shift+B boat, N plane */
      summons?: () => boolean;
      geo?: { toLatLon: (x: number, z: number) => [number, number]; fromLatLon: (lat: number, lon: number) => [number, number] };
    },
  ) {
    this.group.name = 'player-vehicles';
    o.root.add(this.group);
    if (o.kerb) o.kerb.skip = (key) => this.taken.has(key); // a kerb car you drove off stays gone
    this.hud = document.createElement('div');
    this.hud.id = 'vehud';
    Object.assign(this.hud.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: '14px', background: 'rgba(245,239,225,0.82)', color: '#3a3346', font: '14px Georgia, serif', pointerEvents: 'none', display: 'none', zIndex: '20', whiteSpace: 'nowrap' });
    // the live numbers, then how to drive (a phone held upright shows only the numbers: style.css)
    this.hudVal = this.hud.appendChild(document.createElement('span'));
    this.hudKeys = this.hud.appendChild(document.createElement('span'));
    this.hudKeys.className = 'vkeys';
    document.body.appendChild(this.hud);
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
      this.keys.add(e.code);
      if (e.repeat || !o.enabled()) return;
      if (e.code === 'KeyE') this.toggle();
      else if (e.code === 'KeyV' || e.code === 'KeyN' || (e.code === 'KeyB' && e.shiftKey)) {
        if (o.summons?.()) this.summon(e.code === 'KeyV' ? 'car' : e.code === 'KeyN' ? 'plane' : 'boat');
        else if (e.code !== 'KeyB') o.toast('rides are painted now — paint one from life (P), then take out your brush (B)');
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touchBoost = false; this.touchThrottle = 0; });
    this.restore();
  }

  // ---------------- persistence ----------------
  private restore() {
    const g = this.o.geo;
    if (!g) return;
    try {
      const d = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Saved | null;
      if (!d) return;
      for (const k of d.taken ?? []) this.taken.add(k);
      for (const v of d.kept ?? []) {
        const [x, z] = g.fromLatLon(v.lat, v.lon);
        if (Number.isFinite(x) && Number.isFinite(z)) this.make(v.kind, x, z, v.yaw, v.color, v.model);
      }
    } catch { /* storage off or corrupt: start fresh */ }
  }
  private persist() {
    const g = this.o.geo;
    if (!g) return;
    const kept = this.list.map((v) => { const [lat, lon] = g.toLatLon(v.x, v.z); return { kind: v.kind, model: v.model, lat, lon, yaw: v.yaw, color: v.color }; });
    try { localStorage.setItem(STORE, JSON.stringify({ taken: [...this.taken].slice(-400), kept } satisfies Saved)); } catch { /* ignore */ }
  }

  get driving() { return this.active !== null; }
  /** The touch interaction button and double-tap use the same eligibility as E. */
  interact() { if (!this.o.enabled()) return false; this.toggle(); return true; }
  setTouchBoost(down: boolean) { this.touchBoost = down; }
  setTouchThrottle(value: number) { this.touchThrottle = Math.max(-1, Math.min(1, value)); }
  /** Each frame a ride moves: (kind, x, y, z, vx, vz). main.ts hands it to life (knockdowns) and critters (they scatter). */
  onMove: ((kind: VKind, x: number, y: number, z: number, vx: number, vz: number) => void) | null = null;
  /** The ride you're in (sound + HUD): kind, model, speed m/s, throttle 0..1. */
  get ride() { const v = this.active; return v ? { kind: v.kind, model: v.model, v: v.v, throttle: v.throttle, airborne: v.airborne } : null; }
  /** What E would board right now, without boarding it (context hints). */
  enterable(): { kind: VKind; model: string } | null {
    if (this.active || walkParams.fly) return null;
    const w = this.o.walker;
    let best: Veh | null = null, bd = Infinity;
    for (const v of this.list) {
      const d = Math.hypot(v.x - w.x, v.z - w.z) - SPECS[v.kind].reach;
      if (d < 0 && d < bd) (bd = d), (best = v);
    }
    if (best) return { kind: best.kind, model: best.model };
    const pk = this.parkedNear(w.x, w.z, SPECS.car.reach + 0.6);
    return pk ? { kind: 'car', model: pk.model } : null;
  }
  get activeKind(): VKind | null { return this.active?.kind ?? null; }
  /** The boat you're riding, as a wake source (wakes.ts) — null ashore, driving or flying. */
  get wake(): { id: number; x: number; z: number; yaw: number; v: number; stern: number; beam: number } | null {
    const v = this.active;
    return v && v.kind === 'boat' ? { id: -1, x: v.x, z: v.z, yaw: v.yaw, v: v.v, stern: 2.6, beam: 2.2 } : null;
  }

  // ---------------- world queries ----------------
  /** The world as the placement rules see it (player/place.ts). */
  get placeWorld(): PlaceWorld {
    return (this.pw ??= {
      height: (x, z) => this.o.terrain.heightAt(x, z),
      sdf: (x, z) => this.o.terrain.sdfAt(x, z),
      building: (x, z) => this.o.walk.buildingAt(x, z),
      roads: () => this.o.roads(),
      driveLeft: this.o.driveLeft,
    });
  }
  private pw?: PlaceWorld;
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
  /** A ride's model, painted `color` on its white parts, in `mat`. The brush builds its pencil
   *  sketch with the very same geometry, so the finished ride takes over from it unseen. */
  build(kind: VKind, model: string, color: number, seed: number, mat: THREE.Material) {
    const obj = new THREE.Group();
    let prop: THREE.Object3D | undefined;
    let gearY = 0;
    if (kind === 'car') {
      const [base, gear] = model.split('+');
      const m = ((CAR_TYPES as string[]).includes(base) ? base : 'sedan') as CarType;
      const g = gear && gear in GEAR_NAME ? (gear as CarGear) : null;
      model = g ? `${m}+${g}` : m;
      obj.add(new THREE.Mesh(tint(carLib(m, g).clone(), color), mat));
    } else if (kind === 'boat') {
      model = (BOAT_CYCLE as string[]).includes(model) ? model : 'skiff';
      obj.add(new THREE.Mesh(tint(boatLib(model as BoatType).clone(), color), mat));
    } else {
      model = (PLANE_TYPES as string[]).includes(model) ? model : 'highwing';
      const P = planeGeometry(planeRecipe(model as PlaneType, seed));
      obj.add(new THREE.Mesh(tint(P.geo, color), mat));
      prop = new THREE.Mesh(propGeo(), mat);
      prop.position.copy(P.prop);
      obj.add(prop);
      gearY = P.gearY;
    }
    obj.name = `ride-${kind}:${model}`; // the spotting log + hints read the model off the name
    return { obj, prop, gearY, model };
  }
  /** The paint a ride gets when nobody chose one. */
  defaultColor(kind: VKind, seed = this.seed) {
    return kind === 'car' ? CAR_COLORS[(seed * 7) % CAR_COLORS.length] : kind === 'boat' ? HULLS[seed % HULLS.length] : 0xf4f1ea;
  }
  get nextSeed() { return this.seed; }
  /** A painted ride, dry: it's real now, where the brush set it down (and it's saved there). */
  paint(kind: VKind, model: string, at: Spot, color: number) {
    const v = this.make(kind, at.x, at.z, at.yaw, color, model);
    if (kind === 'boat') this.settle.set(v, 1); // (it settles onto the water as the paint dries)
    return { kind: v.kind, model: v.model, x: v.x, z: v.z, obj: v.obj };
  }
  private make(kind: VKind, x: number, z: number, yaw: number, color?: number, model?: string): Veh {
    const seed = this.seed;
    const c = color ?? this.defaultColor(kind, seed);
    this.seed++;
    if (!model) {
      if (kind === 'car') model = pickFrom(carMix(activeStyle().region, activeStyle().climate), (seed * 0.618034) % 1);
      else if (kind === 'boat') model = BOAT_CYCLE[this.boatN++ % BOAT_CYCLE.length];
      else model = PLANE_TYPES[this.planeN++ % PLANE_TYPES.length];
    }
    const built = this.build(kind, model, c, seed, this.mat);
    const { obj, prop, gearY } = built;
    model = built.model;
    obj.traverse((m) => m.layers.enable(1));
    this.group.add(obj);
    const y = kind === 'boat' ? 0 : this.o.walk.surfaceAt(x, z);
    const v: Veh = { kind, color: c, model, gearY, obj, prop, x, y, z, yaw, pitch: 0, roll: 0, v: 0, steer: 0, throttle: 0, feet: y, airborne: false };
    this.list.push(v);
    // keep the world tidy: recycle the oldest parked player vehicle
    while (this.list.length > MAX_KEPT) {
      const old = this.list.find((q) => q !== this.active && q !== v);
      if (!old) break;
      this.remove(old);
    }
    this.pose(v);
    this.persist();
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
    let best: { key: string; im?: THREE.InstancedMesh; i: number; x: number; z: number; yaw: number; color: number; model: string; d: number } | null = null;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    for (const t of this.o.tiles()) {
      for (const im of parkedMeshes(t.group)) for (let i = 0; i < im.count; i++) {
        const key = `${t.spec.id}:${im.name}:${i}`;
        if (this.taken.has(key)) continue;
        im.getMatrixAt(i, m);
        m.decompose(p, q, s);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < r && (!best || d < best.d)) {
          e.setFromQuaternion(q, 'YXZ');
          if (im.instanceColor) im.getColorAt(i, c);
          best = { key, im, i, x: p.x, z: p.z, yaw: e.y, color: im.instanceColor ? c.getHex() : 0xb9bcc0, model: (im.name.split(':')[1] ?? 'sedan') + (im.name.split(':')[2] ? '+' + im.name.split(':')[2] : ''), d };
        }
      }
    }
    // …and the kerb and lot cars (kerbCars.ts records, not tile meshes)
    const k = this.o.kerb?.find(x, z, best ? best.d : r);
    if (k) best = { ...k, i: -1 };
    return best;
  }
  private hideInstance(im: THREE.InstancedMesh, i: number) {
    im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
  }
  /** Re-hide taken driveway cars when their tile remounts — and retire their parking outlines
   *  (the tile re-registers every parked car's walls when it mounts). */
  onTile(t: { spec: { id: string }; group: THREE.Group; kerb?: Float32Array }) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
    for (const im of parkedMeshes(t.group)) for (let i = 0; i < im.count; i++) {
      if (!this.taken.has(`${t.spec.id}:${im.name}:${i}`)) continue;
      im.getMatrixAt(i, m);
      m.decompose(p, q, sc);
      if (sc.x > 0) this.clearSpot(p.x, p.z, e.setFromQuaternion(q, 'YXZ').y, im.name.split(':')[1] ?? 'sedan');
      this.hideInstance(im, i);
    }
    const d = t.kerb;
    if (d) for (let i = 0, k = 0; i + KERB_STRIDE <= d.length; i += KERB_STRIDE, k++)
      if (this.taken.has(`${t.spec.id}:kerb:${k}`)) this.clearSpot(d[i], d[i + 2], d[i + 3], CAR_TYPES[d[i + 4]]);
  }
  /** A parked car's outline no longer boxes in the car that left it. */
  private clearSpot(x: number, z: number, yaw: number, model: string) {
    const type = (model.split('+')[0] || 'sedan') as CarType;
    const rc = CAR_TYPES.includes(type) ? carRecipe(type, 1) : carRecipe('sedan', 1);
    this.o.walk.clearFootprint(x, z, yaw, rc.L / 2, rc.W / 2 + 0.05);
  }

  // ---------------- enter / exit ----------------
  private toggle() {
    if (this.active) { this.exit(); this.persist(); return; }
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
        this.clearSpot(pk.x, pk.z, pk.yaw, pk.model);
        if (pk.im) this.hideInstance(pk.im, pk.i);
        else this.o.kerb?.refresh();
        best = this.make('car', pk.x, pk.z, pk.yaw, pk.color, pk.model);
      }
    }
    if (!best) return;
    this.enter(best);
    this.persist();
  }
  /** At the helm: seated at a skiff's tiller or a sailboat's, standing at a console or a wheel. */
  private helmOn(v: Veh) {
    if (v.kind !== 'boat' || this.helm) return;
    const sit = v.model === 'skiff' || v.model === 'sail', R = boatRecipe(v.model as BoatType, 1);
    this.helm = new THREE.Mesh(helmGeometry(sit), this.mat);
    this.helm.position.set(0, sit ? 0.12 : 0.18, sit ? R.L / 2 - 1.0 : R.L * 0.12);
    this.helm.name = 'helm';
    this.helm.layers.enable(1);
    v.obj.add(this.helm);
  }
  private helmOff() { if (this.helm) { this.helm.parent?.remove(this.helm); this.helm = null; } }
  private enter(v: Veh) {
    if (walkParams.fly) walkParams.fly = false;
    this.active = v;
    this.helmOn(v);
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.o.walker.yaw = 0; // walker yaw/pitch become orbit offsets while riding
    this.o.walker.pitch = 0;
    this.camInit = false;
    const hint = thumbs()
      ? v.kind === 'car' ? 'the stick drives and steers · hold ⇧ to boost' : v.kind === 'boat' ? 'the stick steers and throttles · hold ⇧ for more' : 'hold + for throttle · pull the stick back to climb'
      : v.kind === 'car' ? 'W/S drive · A/D steer · Shift boost · E to get out' : v.kind === 'boat' ? 'W/S throttle · A/D steer · E to get out (near shore)' : 'Shift/C throttle · W/S pitch · A/D bank · E to jump out';
    this.o.toast(hint);
  }
  private exit() {
    const v = this.active!;
    const w = this.o.walker, walk = this.o.walk;
    this.active = null;
    this.exitT = performance.now();
    this.helmOff();
    this.hud.style.display = 'none';
    const back = v.yaw; // restore a sensible look direction
    if (v.kind === 'plane' && v.airborne) {
      // a gift of the painted world: step out into the sky and keep flying
      w.place(v.x, v.z, back, -0.1);
      walkParams.fly = true;
      w.y = v.y + 1;
      this.o.toast(`you step out into the sky — ${thumbs() ? '✈' : 'F'} to come down`);
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
      this.exitT = -1e9;
      this.helmOn(v);
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
      const p = placeCar(this.placeWorld, w.x, w.z, w.yaw, 90);
      if (!p.ok) return this.o.toast('no street nearby for a car');
      const car = this.make('car', p.spot.x, p.spot.z, p.spot.yaw);
      return this.o.toast(`${/^[aeiou]|^SUV/i.test(modelName(car.model)) ? 'an' : 'a'} ${modelName(car.model)} pulls up — walk over and ${thumbs() ? 'tap Drive' : 'press E'}`);
    }
    if (kind === 'boat') {
      // the nearest open water with room for a hull, bow off the land
      const p = placeBoat(this.placeWorld, w.x, w.z, w.yaw, 700);
      if (!p.ok) return this.o.toast('no open water nearby');
      const b = this.make('boat', p.spot.x, p.spot.z, p.spot.yaw);
      const nm = modelName(b.model);
      return this.o.toast(p.spot.d < 60 ? `a ${nm} bobs at the water’s edge — ${thumbs() ? 'tap Board' : 'press E aboard'}` : `a ${nm} waits on the water ${Math.round(p.spot.d)} m away`);
    }
    // plane: airborne if you're flying; otherwise the nearest clear, flat run ahead of you
    if (walkParams.fly) {
      const p = this.make('plane', w.x + fx * 30, w.z + fz * 30, w.yaw);
      p.y = w.y;
      p.airborne = true;
      p.v = 45;
      p.throttle = 0.5;
      this.pose(p);
      return this.o.toast(`a plane swings alongside — ${thumbs() ? 'tap Board' : 'press E'}`);
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
          const pl = this.make('plane', sx, sz, yaw);
          return this.o.toast(`a ${modelName(pl.model)} is waiting on a clear run — ${thumbs() ? 'tap Board' : 'press E'}`);
        }
      }
    }
    const p = this.make('plane', w.x + fx * 40, w.z + fz * 40, w.yaw);
    p.y = Math.max(this.ground(p.x, p.z), 0) + 160;
    p.airborne = true;
    p.v = 48;
    p.throttle = 0.55;
    this.pose(p);
    this.o.toast(`no clear run here — a plane circles overhead; ${thumbs() ? '✈ to fly up, then Board' : 'F to fly up, then E'}`);
  }

  // ---------------- per-frame ----------------
  private k(c: string) { return this.keys.has(c); }
  private axis(pos: string[], neg: string[]) { return (pos.some((c) => this.k(c)) ? 1 : 0) - (neg.some((c) => this.k(c)) ? 1 : 0); }
  private axisTouch(pos: string[], neg: string[], touch: number) { return Math.max(-1, Math.min(1, this.axis(pos, neg) + touch)); }
  private get stick() { const a = this.o.walker.touchAxes; return stickAxes(a.x, a.y); }

  /** Advance the ridden vehicle and the camera. Returns false when on foot (walker drives the camera). */
  private saveT = 10;
  update(dt: number, cam: THREE.PerspectiveCamera): boolean {
    if (this.active && (this.saveT -= dt) <= 0) { this.saveT = 10; this.persist(); }
    for (const v of this.list) if (v.prop) v.prop.rotation.z += dt * (6 + (v === this.active ? v.throttle * 60 : 0));
    // your boats at rest ride the water; a freshly painted one settles onto it
    const t = performance.now() / 1000;
    for (const b of this.list) {
      if (b.kind !== 'boat' || b === this.active) continue;
      const s = this.settle.get(b) ?? 0;
      if (s > 0) this.settle.set(b, Math.max(0, s - dt * 1.4));
      b.y = 0.02 + Math.sin(t * 1.1 + b.x * 0.05) * 0.06 + 0.45 * s * s;
      b.roll = Math.sin(t * 0.8 + b.z * 0.04) * 0.035 + 0.05 * s * Math.sin(t * 7);
      b.pitch = Math.sin(t * 0.9 + b.x * 0.07) * 0.018;
      this.pose(b);
    }
    const v = this.active;
    if (!v) { this.walkIn(dt); return false; }
    dt = Math.min(dt, 0.05);
    if (v.kind === 'car') this.drive(v, dt);
    else if (v.kind === 'boat') this.sail(v, dt);
    else this.fly(v, dt);
    this.pose(v);
    // the world reacts to where the ride goes: walkers in a car's path, animals near anything moving
    if (Math.abs(v.v) > 1) this.onMove?.(v.kind, v.x, v.y, v.z, -Math.sin(v.yaw) * v.v, -Math.cos(v.yaw) * v.v);
    // carry the walker: streaming, life, interiors, HUD all read its position
    const w = this.o.walker;
    w.x = v.x;
    w.z = v.z;
    w.y = v.y + 1.4;
    this.chase(v, dt, cam);
    const kmh = Math.round(Math.abs(v.v) * 3.6);
    this.hud.style.display = 'block';
    const touch = thumbs();
    const val = v.kind === 'plane'
      ? `✈ ${kmh} km/h · alt ${Math.round(v.y - this.ground(v.x, v.z))} m · throttle ${Math.round(v.throttle * 100)}%`
      : `${v.kind === 'car' ? '🚗' : '⛵'} ${kmh} km/h`;
    const keys = v.kind === 'plane'
      ? ` · ${touch ? 'stick: pitch / bank · +/−: throttle' : 'E to jump out'}`
      : ` · ${touch ? 'left stick: steer / throttle · ⇧: boost' : 'E to get out'}`;
    if (this.hudVal.textContent !== val) this.hudVal.textContent = val;
    if (this.hudKeys.textContent !== keys) this.hudKeys.textContent = keys;
    return true;
  }

  private drive(v: Veh, dt: number) {
    const walk = this.o.walk;
    const axes = this.stick;
    const thr = this.axisTouch(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], -axes.y);
    const boost = this.k('ShiftLeft') || this.k('ShiftRight') || this.touchBoost;
    const vmax = boost ? 38 : 24;
    // (the stick part way: it cruises at that share of the top speed and brakes that gently — a
    // key is all the way, so the keyboard drives exactly as it always has)
    if (thr > 0 && (thr >= 1 || v.v < vmax * thr)) v.v += (v.v < -0.3 ? 14 : boost ? 9 : 6) * dt;
    else if (thr < 0) v.v -= (v.v > 0.3 ? 14 : 4) * -thr * dt;
    else v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), (1.6 + Math.abs(v.v) * 0.05) * dt);
    // the hill: a climb takes speed off, a descent coasts on, and stopped on a steep grade with
    // nothing pressed the car creeps back (a gentle one holds: the gearbox's creep, the brakes)
    const pull = 9.8 * Math.sin(v.pitch);
    if (thr !== 0 || Math.abs(v.v) > 0.3 || Math.abs(v.pitch) > 0.15) v.v -= pull * 0.8 * dt;
    v.v = Math.max(-7, Math.min(vmax, v.v));
    const st = this.axisTouch(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'], -axes.x);
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

  /** Walk into one of your boats and you're aboard: pressing on toward it from the water's edge,
   *  within its boarding reach (no key needed — Round 9: "walk in to board"). */
  private walkIn(dt: number) {
    const w = this.o.walker;
    if (walkParams.fly || performance.now() - this.exitT < 2500 || !this.o.enabled()) return void (this.approachT = 0);
    const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
    let target: Veh | null = null;
    for (const b of this.list) {
      if (b.kind !== 'boat') continue;
      const dx = b.x - w.x, dz = b.z - w.z, d = Math.hypot(dx, dz);
      if (d < SPECS.boat.reach && (dx * fx + dz * fz) / Math.max(d, 1e-3) > 0.75) { target = b; break; }
    }
    this.approachT = target && w.pushing ? this.approachT + dt : 0;
    if (target && this.approachT > 0.35) { this.approachT = 0; this.enter(target); this.persist(); }
  }

  private sail(v: Veh, dt: number) {
    const axes = this.stick;
    const thr = this.axisTouch(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], -axes.y);
    const boost = this.k('ShiftLeft') || this.k('ShiftRight') || this.touchBoost;
    const vmax = boost ? 20 : 12;
    const cruising = thr > 0 && thr < 1 && v.v >= vmax * thr; // (the stick part way: that share of the top speed)
    if (thr !== 0 && !cruising) v.v += thr * (thr > 0 ? 3.2 : 2.5) * dt;
    else v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), 1.1 * dt);
    v.v = Math.max(-4, Math.min(vmax, v.v));
    const st = this.axisTouch(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'], -axes.x);
    v.steer += (st - v.steer) * Math.min(1, dt * 3);
    v.yaw += v.steer * (0.22 + Math.min(Math.abs(v.v), 9) * 0.07) * Math.sign(v.v || 1) * dt;
    const nx = v.x - Math.sin(v.yaw) * v.v * dt, nz = v.z - Math.cos(v.yaw) * v.v * dt;
    if (this.water(nx, nz)) (v.x = nx), (v.z = nz);
    else v.v *= -0.25; // run aground gently: bump back off the shore
    const t = performance.now() / 1000, sp = Math.abs(v.v);
    // under way the bow lifts onto the plane (a hump near 8 m/s), then the hull rides up and flatter
    const hump = Math.exp(-((sp - 8) ** 2) / 8);
    v.y = 0.05 + Math.sin(t * 1.3 + v.x * 0.05) * 0.12 * (1 - Math.min(0.6, sp / 20)) + Math.min(0.2, Math.max(0, sp - 6) * 0.04);
    v.pitch = Math.sin(t * 1.1 + v.z * 0.07) * 0.025 + 0.03 * Math.min(1, sp / 6) + 0.07 * hump;
    v.roll = Math.sin(t * 0.9 + v.x * 0.04) * 0.05 - v.steer * Math.min(0.12, Math.abs(v.v) * 0.012);
  }

  private fly(v: Veh, dt: number) {
    const axes = this.stick;
    const thr = Math.max(-1, Math.min(1, this.axis(['ShiftLeft', 'ShiftRight', 'KeyR'], ['KeyC', 'KeyX']) + this.touchThrottle));
    v.throttle = Math.max(0, Math.min(1, v.throttle + thr * dt * 0.6));
    const pitchIn = this.axisTouch(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'], axes.y); // S = nose up (pull back)
    const rollIn = this.axisTouch(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'], -axes.x);
    const ground = this.ground(v.x, v.z);
    // gear on the ground; a raised nose swings the tail down about the origin, so lift by that
    const gear = v.gearY + 0.05 + Math.max(0, Math.sin(v.pitch)) * 3.4;
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
