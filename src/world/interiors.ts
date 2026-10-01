// Enterable buildings (docs/INTERIORS_PLAN.md). Every building with a door gets a deterministic shell
// at tile build (interior/plan.ts: storeys, straight or dogleg stairs with real stairwells, the
// hall, corridors and cores the rooms hang off), so collision is right everywhere. Walking up to
// one lays out its rooms (interior/layout.ts: a house's hall with rooms either side, a block's flats
// off its corridor, an office's core and open plan) — their walls enter the collision world a few
// frames in — and builds its meshes over a few more (interior/mesh.ts, interior/furnish.ts): walls with
// real window openings, floors, ceilings, stairs, cased doorways with their doors standing open,
// furniture by room (repeated pieces instanced), lamps, residents. Leaving drops it all.
//
// A tall building (plan.ts `tall`: a tower, a long block of flats) has every storey, and is built a
// window at a time: the walker's storey and the one either side (≤ 3), furnished, round wherever
// they stand — the next window builds while the standing one stays (its own collision scope), then
// swaps in whole; climbing a storey re-centres it. Each storey draws its layout, paint, furniture
// and residents from seeds of its own, so it looks the same from any window. Its lifts (`liftAt`,
// player/lift.ts) ride you to any storey: the doors slide (`liftDoor`), the car stands in the shaft
// (`showCar`), and the window re-centres on the new storey while the car's doors are shut.
import * as THREE from 'three';
import type { Footprint } from './buildings';
import { activeBuilding, GLSL_WINDOWS, KIND } from './buildings';
import type { WalkWorld } from '../player/collision';
import { paintMaterial, lin, U, HOLE_MAX } from '../render/shared';
import { makeRng, type Rng } from '../core/rng';
import { pedGeo, creatureMaterial } from '../sim/life';
import * as D from '../assets/decor';
import { toW, unstack, plateAt, storeyAt, ringOf, atriumEdges, liftCars, type Plan, type Rect, type Lift } from './interior/plan';
import { layoutSteps, registerLayout, type Layout, type Room } from './interior/layout';
import { Mesher, Draw, Instancer, IP, WOOD, roomMapGen, drawStairs, drawPartitionsGen, pieceGeo, type RoomMap } from './interior/mesh';
import { Furnisher, furnishRoom, furnishLifts, FABRIC, type Light, type NpcSpot } from './interior/furnish';

export { planInterior, registerPlan, unstack, LocalPoly, type Plan, type Flight, type Lift } from './interior/plan';
export { layoutInterior, registerLayout, type Layout, type Room } from './interior/layout';

type P2 = [number, number];
/** The interior's own collision scopes: the standing build's, and the next window's (one interior
 *  stands open at a time). */
const SCOPES = [-7, -8];
/** The lift car's floor while you ride (player/lift.ts): its own collision scope. */
const CAR_SCOPE = -9;
/** A lift car's inside (liftCar): 2.1 m across, 1.6 m deep, standing 0.12 m behind the shaft's face. */
const CAR = { w: 2.1, d: 1.6, gap: 0.12 };
const NPC_MAX = 12; // residents an interior shows at once (the shared ped geometry's aAnim covers this many)
/** Draw calls an interior may take for its instanced pieces (the budget is 60 all told). */
const MAX_INSTANCED = 44;
/** Vertices past which no more rooms are furnished (the budget is 120k: a room's worth of margin). */
const FURNISH_MAX = 110000;
/** A tall building's storey stops furnishing past this many of its own merged vertices (a third of
 *  the budget, less the shell's: its share whichever window it's built in). */
const STOREY_MAX = 30000;
export interface InteriorStats { verts: number; draws: number; instances: number; texels: number; rooms: number; storeys: number }
const ROOM_NAME: Partial<Record<Room['type'], string>> = {
  hall: 'hall', landing: 'landing', corridor: 'corridor', lobby: 'lobby', living: 'living room', kitchen: 'kitchen',
  dining: 'dining room', bath: 'bathroom', bed: 'bedroom', study: 'study', utility: 'utility room', closet: 'closet',
  store: 'storeroom', open: 'open-plan office', meeting: 'meeting room', lift: 'elevator lobby', shop: 'shop floor',
  stock: 'stockroom', cafe: 'café', bar: 'bar', diner: 'dining room', galley: 'kitchen', church: 'nave', great: 'living room',
  guest: 'guest room', classroom: 'classroom', assembly: 'school hall', staff: 'staff room', narthex: 'vestibule', prayer: 'prayer hall',
  library: 'library', bank: 'banking hall', post: 'post office', gym: 'gym',
};

/** A build: an activation's, or a tall building's next window. What it made waits here until it
 *  swaps in (or is dropped unfinished). */
interface Job {
  fi: string;
  k: number; // the storey its window is centred on (−1: the whole building)
  win: [number, number];
  scope: number;
  gen: Generator<void, THREE.Object3D, void>;
  layout: Layout | null;
  roomTex: RoomMap | null;
  inst: Instancer | null;
  lights: Light[];
  leaves: Furnisher['liftLeaves'];
  stats: InteriorStats | null;
  fab: number;
  dims: [number, number];
}

export class Interiors {
  readonly group = new THREE.Group();
  private active: string | null = null;
  private mesh: THREE.Object3D | null = null;
  private timer = 0;
  private doorGrid = new Map<number, string[]>();
  private plans = new Map<string, Plan>();
  private fps = new Map<string, Footprint>();
  readonly lightsU = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) };
  readonly frameU = { value: new THREE.Vector4() }; // cx, cz, ux, uz
  readonly levelsU = { value: new THREE.Vector4() }; // floor0, floorH, door x, door z
  readonly dimsU = { value: new THREE.Vector2(6, 4) }; // half length, half width of the footprint frame
  readonly doorU = { value: new THREE.Vector4() }; // door y, half width, height, curtains (1: homes upstairs)
  // the room map (a palette index per 0.1 m cell of each storey) and its palette: every room its paint
  readonly roomMapU = { value: null as THREE.Texture | null };
  readonly roomPalU = { value: null as THREE.Texture | null };
  readonly roomInfoU = { value: new THREE.Vector4(0, 0, 10, 1) }; // u of cell 0, v of cell 0, cells per m, rows per storey
  readonly roomDimU = { value: new THREE.Vector4(1, 1, 0, 0) }; // columns, storeys, the first storey's index
  readonly fabU = { value: new THREE.Color() };
  private mat: THREE.ShaderMaterial;
  private npcMat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1 });
  // residents in chairs, on sofas, in booths and on bar stools sit (INDOOR: they don't leave at dusk)
  private npcSeatMat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, SEATED: 1, INDOOR: 1 });
  private npcGeo = pedGeo();
  private lights: Light[] = [];
  private failed = new Set<string>();
  private pending: Job | null = null;
  private openAmt = 0;
  private opened = false; // hysteresis state for the facade openings (see update)
  private layout: Layout | null = null;
  private scope = 0; // the standing build's collision scope (0: none)
  private roomTex: RoomMap | null = null;
  private inst: Instancer | null = null;
  private at: { x: number; z: number; feet: number } | undefined;
  /** The standing build's storeys (a tall building's window; the whole building otherwise). */
  private win: [number, number] | null = null;
  /** The storey a tall building's window should be centred on (the walker's, with a little
   *  hysteresis half-way up the stairs; −1: none yet). */
  private want = -1;
  /** What the last build drew (the bench and the budget test read it). */
  lastStats: InteriorStats = { verts: 0, draws: 0, instances: 0, texels: 0, rooms: 0, storeys: 0 };
  indoors = false;
  onStairs = false;
  /** A lift ride's doors are shut: build the next window flat out (player/lift.ts). */
  hurry = false;
  /** A lift ride has the walker (stepping into the car, riding, stepping out: player/lift.ts) — they
   *  cross the shaft's wall on purpose, so nothing may "settle" them out of it meanwhile (main.ts). */
  riding = false;
  /** The standing build's lift door leaves (the 'liftLeaf' pieces' InstancedMesh) and each car's two
   *  on each storey built: instance index and resting place (world x, z). */
  private leafMesh: THREE.InstancedMesh | null = null;
  private leafAt = new Map<string, { idx: number; x: number; z: number; side: -1 | 1 }[]>();
  /** The car being ridden (shown only then): its body and its own two door leaves, where it is,
   *  its lamp. */
  private car: THREE.Group | null = null;
  private carAt: { li: number; car: number; k: number } | null = null;
  private carLamp: Light | null = null;

  constructor(private walk: WalkWorld) {
    this.group.name = 'interiors';
    this.mat = interiorMaterial(this);
    this.npcGeo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(NPC_MAX * 3), 3));
  }

  // Tile streaming registers each enterable footprint under a unique key ("tile:idx"); unloading a tile
  // drops its plans without disturbing the rest of the world.
  register(key: string, fp: Footprint, plan: Plan, walkPid: number) {
    this.plans.set(key, plan);
    this.fps.set(key, fp);
    this.walkIds.set(key, walkPid);
    const k = Math.floor(plan.door.x / 25) * 92821 + Math.floor(plan.door.z / 25);
    let l = this.doorGrid.get(k);
    if (!l) this.doorGrid.set(k, (l = []));
    l.push(key);
  }
  unregister(keys: Iterable<string>) {
    for (const key of keys) {
      this.plans.delete(key);
      this.fps.delete(key);
      this.walkIds.delete(key);
      this.failed.delete(key);
    }
    for (const l of this.doorGrid.values()) {
      for (let i = l.length - 1; i >= 0; i--) if (!this.plans.has(l[i])) l.splice(i, 1);
    }
    if (this.active !== null && !this.plans.has(this.active)) this.activate(null);
  }

  update(x: number, z: number, dt: number, feet = 0, onFoot = true) {
    this.at = { x, z, feet };
    // Driving or flying past, nobody walks in: no interior builds (a downtown drive passed a
    // door every second and each one assembled a whole interior — the Seattle hitch). One
    // that's assembling drops; one standing open stays until you're well past it.
    if (!onFoot && this.active !== null && ((this.pending && !this.mesh) || this.openAmt <= 0.001)) {
      const d = this.plans.get(this.active)?.door;
      if ((this.pending && !this.mesh) || !d || Math.hypot(d.x - x, d.z - z) > 30) this.activate(null);
    }
    // a tall building's window follows the walker's storey
    const TP = this.active !== null ? this.plans.get(this.active) : undefined;
    if (TP?.tall && (this.mesh || this.pending)) {
      const k = this.storeyFor(TP, feet);
      if (k !== this.want) this.recentre(k);
    }
    this.pump(this.hurry ? 14 : 3.5);
    const inside = this.walk.interiorAt(x, z, feet);
    this.indoors = inside >= 0 && inside === this.walkId(this.active);
    // Windows + door become real openings as you come close: a hysteresis switch (open < 8 m,
    // close > 10 m), only once the interior mesh exists, and a short time-based wash (~0.3 s,
    // world-anchored noise in the facade shader). (A tall building's next window building behind
    // the standing one keeps them open.)
    const afp = this.active !== null ? this.fps.get(this.active) : undefined;
    if (afp && this.mesh) {
      const d = this.indoors ? 0 : ringDist(afp.ring, x, z);
      this.opened = d < (this.opened ? 10 : 8);
    } else this.opened = false;
    const want = this.opened ? 1 : 0;
    this.openAmt += Math.max(-dt * 3.5, Math.min(dt * 3.5, want - this.openAmt));
    activeBuilding.uOpenAmt.value = this.openAmt < 0.02 ? 0 : this.openAmt > 0.98 ? 1 : this.openAmt;
    const P = this.active !== null ? this.plans.get(this.active) : undefined;
    if (P && this.indoors) {
      const lv = (feet - P.floor0) / P.floorH;
      this.onStairs = Math.abs(lv - Math.round(lv)) > 0.06;
    } else this.onStairs = false;
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.2;
    this.pickLights(x, feet + 1.4, z);
    if (!onFoot) return;
    let target: string | null = null;
    if (inside >= 0) {
      for (const [fi] of this.plans) if (this.walkId(fi) === inside) { target = fi; break; }
    }
    // An opened (or still-closing) house keeps the focus until its wash has run out —
    // switching mid-open used to snap its windows and door shut in one frame.
    if (target === null && this.active !== null && this.openAmt > 0.001) return;
    if (target === null) {
      let best = 16;
      const gx = Math.floor(x / 25), gz = Math.floor(z / 25);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const fi of this.doorGrid.get((gx + a) * 92821 + gz + b) ?? []) {
            const d = this.plans.get(fi)!.door;
            const dist = Math.hypot(d.x - x, d.z - z) - (fi === this.active ? 3 : 0);
            if (dist < best) (best = dist), (target = fi);
          }
    }
    if (target !== this.active && !(target !== null && this.failed.has(target))) this.activate(target);
  }

  get activeIndex() { return this.active; }
  get activePlan() { return this.active !== null ? this.plans.get(this.active) ?? null : null; }
  /** The laid-out rooms of the building standing open (null while none is). */
  get activeLayout() { return this.layout; }
  /** The storeys standing built (a tall building's window; the whole building otherwise). */
  get built() { return this.win; }
  fpOf(key: string | null) { return key !== null ? this.fps.get(key) : undefined; }
  planOf(key: string | null) { return key !== null ? this.plans.get(key) : undefined; }
  /** The room at a point of the open building (its storey from the feet). */
  roomAt(x: number, z: number, feet: number): Room | null {
    const P = this.activePlan, L = this.layout;
    if (!P || !L) return null;
    const u = (x - P.cx) * P.ux + (z - P.cz) * P.uz, v = (x - P.cx) * P.vx + (z - P.cz) * P.vz;
    const k = storeyAt(P, feet);
    return L.rooms.find((r) => r.level === k && r.type !== 'shaft' && r.type !== 'void' && u >= r.r.u0 && u <= r.r.u1 && v >= r.r.v0 && v <= r.r.v1) ?? null;
  }
  /** What the HUD calls the room at a point of the open building (null: none, or the stairs). */
  roomName(x: number, z: number, feet: number): string | null {
    const R = this.roomAt(x, z, feet);
    if (!R) return null;
    const home = this.fpOf(this.active)?.kind === 'house';
    return R.type === 'wc' ? (home ? 'half bath' : 'restroom') : ROOM_NAME[R.type] ?? null;
  }
  /** The lift whose lobby you're standing in (the open building's, on a storey that stands built,
   *  off the stairs): which storey you're on, of how many. */
  liftAt(x: number, z: number, feet: number): { lift: Lift; storey: number; n: number } | null {
    const P = this.activePlan;
    if (!P?.lifts?.length || !this.mesh || !this.win || !this.indoors || this.onStairs) return null;
    const k = storeyAt(P, feet);
    if (k < this.win[0] || k > this.win[1] || Math.abs(feet - (P.floor0 + k * P.floorH)) > 0.2) return null;
    const u = (x - P.cx) * P.ux + (z - P.cz) * P.uz, v = (x - P.cx) * P.vx + (z - P.cz) * P.vz;
    for (const L of P.lifts) {
      const r = L.lobby;
      if (u > r.u0 - 0.2 && u < r.u1 + 0.2 && v > r.v0 - 0.2 && v < r.v1 + 0.2) return { lift: L, storey: k, n: P.levels };
    }
    return null;
  }
  /** Where to stand stepping out of lift `L` (the lobby, in front of its doors), in the world. */
  liftSpot(L: Lift): P2 {
    const P = this.activePlan!, r = L.lobby;
    const [u, v] = L.face === 0 ? [r.u1 - 1.0, (r.v0 + r.v1) / 2] : L.face === 1 ? [r.u0 + 1.0, (r.v0 + r.v1) / 2] : L.face === 2 ? [(r.u0 + r.u1) / 2, r.v1 - 1.0] : [(r.u0 + r.u1) / 2, r.v0 + 1.0];
    return toW(P, Math.max(r.u0 + 0.4, Math.min(r.u1 - 0.4, u)), Math.max(r.v0 + 0.4, Math.min(r.v1 - 0.4, v)));
  }
  /** (tests, debugging) The pieces the standing build put on storey k: key, place, tint. */
  piecesOn(k: number): string[] {
    const P = this.inst?.P;
    return P ? this.inst!.placements(P.floor0 + k * P.floorH - 0.05, P.floor0 + (k + 1) * P.floorH - 0.05) : [];
  }
  /** Is storey k standing built — its window centred there, nothing more to build? (A lift ride
   *  keeps its doors shut until it is.) */
  ready(k: number) {
    const P = this.activePlan;
    return !!P && !!this.mesh && !this.pending && !!this.win && k >= this.win[0] && k <= this.win[1] && (!P.tall || this.want === k);
  }
  /** Where car `car` of lift L stands: its middle inside the shaft (`inside`, where a rider stands),
   *  the middle of its landing doors (`door`), the way out of it (`out`, a unit vector) — world. */
  carSpot(L: Lift, car: number): { inside: P2; door: P2; out: P2 } {
    const P = this.activePlan!;
    const c = liftCars(L), s = c.along[Math.max(0, Math.min(c.along.length - 1, car))];
    const at = (d: number) => (c.row ? toW(P, c.fc + c.out * d, s) : toW(P, s, c.fc + c.out * d));
    const [x0, z0] = at(0), [x1, z1] = at(1);
    return { inside: at(-(CAR.gap + CAR.d / 2)), door: [x0, z0], out: [x1 - x0, z1 - z0] };
  }
  /** The car of lift L nearest a point (a caller in its lobby). */
  carNear(L: Lift, x: number, z: number) {
    let best = 0, bd = Infinity;
    liftCars(L).along.forEach((_, i) => { const [dx, dz] = this.carSpot(L, i).door; const d = Math.hypot(dx - x, dz - z); if (d < bd) (bd = d), (best = i); });
    return best;
  }
  /** Slide the landing doors of car `car` of lift `li` on storey k: 0 shut … 1 open (the leaves into
   *  the wall either side). False when that storey's doors aren't built. */
  liftDoor(li: number, car: number, k: number, open: number): boolean {
    const P = this.activePlan, m = this.leafMesh, l = this.leafAt.get(`${li}:${car}:${k}`);
    if (!P || !m || !l) return false;
    const c = liftCars(P.lifts![li]);
    // (along the face, in the world)
    const ex = c.row ? P.vx : P.ux, ez = c.row ? P.vz : P.uz;
    const o = Math.max(0, Math.min(1, open)) * 0.55;
    const a = m.instanceMatrix.array as Float32Array;
    for (const q of l) {
      a[q.idx * 16 + 12] = q.x + ex * q.side * o;
      a[q.idx * 16 + 14] = q.z + ez * q.side * o;
    }
    m.instanceMatrix.needsUpdate = true;
    // (the car's own doors, standing there, go with them)
    const C = this.carAt;
    if (this.car && C && C.li === li && C.car === car && C.k === k) this.carDoors(open);
    return true;
  }
  /** The car's own leaves: in its doorway shut, into its front wall either side open. */
  private carDoors(open: number) {
    const o = Math.max(0, Math.min(1, open)) * 0.55;
    this.car?.children.forEach((c, i) => { if (i > 0) c.position.set((i === 1 ? -1 : 1) * (0.28 + o), 0, -CAR.d / 2 + 0.05); });
  }
  /** Show the car you ride inside lift li's shaft at car `car`, standing on storey k — its floor in
   *  the walk world (a deck: the shaft has none of its own), its lamp among the lights — or take it
   *  away (null). */
  showCar(at: { li: number; car: number; k: number } | null) {
    this.walk.removeScope(CAR_SCOPE, true);
    this.carLamp = null;
    this.carAt = null;
    if (this.car) { this.group.remove(this.car); this.car = null; }
    const P = this.activePlan;
    if (!at || !P?.lifts?.[at.li]) return;
    this.carAt = { ...at };
    const sp = this.carSpot(P.lifts[at.li], at.car);
    const y = P.floor0 + at.k * P.floorH + 0.01;
    // (the piece's front, −z, out of the shaft; its x along the face)
    const ax: P2 = [-sp.out[1], sp.out[0]];
    const m4 = new THREE.Matrix4().set(ax[0], 0, -sp.out[0], sp.inside[0], 0, 1, 0, y, ax[1], 0, -sp.out[1], sp.inside[1], 0, 0, 0, 1);
    this.car = new THREE.Group();
    this.car.name = 'liftCar';
    this.car.matrixAutoUpdate = false;
    this.car.matrix.copy(m4);
    this.car.matrixWorldNeedsUpdate = true;
    const body = new THREE.Mesh(pieceGeo('liftCar', () => D.liftCar(CAR.w, CAR.d)), this.mat);
    this.car.add(body);
    for (let i = 0; i < 2; i++) this.car.add(new THREE.Mesh(pieceGeo('liftLeaf', () => D.liftLeaf(0.56)), this.mat));
    this.car.traverse((o) => (o.frustumCulled = false));
    this.carDoors(0);
    this.group.add(this.car);
    this.carLamp = { x: sp.inside[0], y: y + 2.2, z: sp.inside[1], w: 1.3 };
    // its floor: a deck (a capsule round a line across the car, half its depth either side of it)
    const hw = CAR.d / 2 - 0.05, e = CAR.w / 2 - hw;
    const A: P2 = [sp.inside[0] - ax[0] * e, sp.inside[1] - ax[1] * e], B: P2 = [sp.inside[0] + ax[0] * e, sp.inside[1] + ax[1] * e];
    this.walk.withScope(CAR_SCOPE, () => this.walk.addDeck({ pts: [A, B], cum: [0, 2 * e], halfWidth: hw, heightAt: () => y, profile: { k: 'const', y } }));
    if (this.at) this.pickLights(this.at.x, this.at.feet + 1.4, this.at.z);
  }
  private walkIds = new Map<string, number>();
  private walkId(fi: string | null) { return fi !== null ? this.walkIds.get(fi) ?? -2 : -2; }

  private pickLights(x: number, y: number, z: number) {
    const ls = (this.carLamp ? [this.carLamp, ...this.lights] : this.lights.slice()).sort((a, b) => (a.x - x) ** 2 + ((a.y - y) * 2.5) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + ((b.y - y) * 2.5) ** 2 + (b.z - z) ** 2));
    for (let i = 0; i < 8; i++) {
      const l = ls[i];
      this.lightsU.value[i].set(l?.x ?? 0, l?.y ?? -999, l?.z ?? 0, l?.w ?? 0);
    }
  }

  // Build (or drop) a building's interior right now — used to compile the interior shaders during loading.
  prime(fi: string | null) { this.activate(fi, true); }

  /** A tall building's storey for feet at y: the walker's, held until they're most of the way to
   *  the next (so the window doesn't flip back and forth on a half landing). */
  private storeyFor(P: Plan, y: number) {
    const lv = (y - P.floor0) / P.floorH;
    const k = this.want >= 0 && Math.abs(lv - this.want) <= 0.6 ? this.want : Math.round(lv);
    return Math.max(0, Math.min(P.levels - 1, k));
  }
  /** The storeys a build centred on storey k takes: a tall building's walker's storey and the one
   *  either side of it (≤ 3), or the whole building. */
  private windowOf(P: Plan, k: number): [number, number] {
    if (!P.tall || k < 0) return [0, P.levels - 1];
    return [Math.max(0, k - 1), Math.min(P.levels - 1, k + 1)];
  }

  // Interior builds are sliced across frames: activation lands instantly (door and window uniforms
  // go live, the old interior drops) while a pending build lays out the rooms (their walls go into
  // the collision world a few frames in) and assembles the new mesh over ~3.5 ms/frame slices —
  // the approach walk (target picks ~16 m out) hides it. A tall building's next window builds the
  // same way behind the standing one, which it replaces whole when it's done.
  private pump(budget = 3.5) {
    const job = this.pending;
    if (!job) return;
    const t0 = performance.now();
    let mesh: THREE.Object3D;
    try {
      let r = job.gen.next();
      while (!r.done && performance.now() - t0 < budget) r = job.gen.next();
      if (!r.done) return;
      mesh = r.value;
    } catch (e) {
      console.warn('interior build failed', job.fi, e);
      this.failed.add(job.fi);
      this.pending = null;
      this.dropJob(job);
      this.activate(null); // restore terrain cut + door/active uniforms, drop its walls
      return;
    }
    this.pending = null;
    this.standUp(job, mesh);
  }

  // Drain any pending build right now — shots capture after the 0.2 s target loop and must
  // not fire while the interior is still assembling.
  flush() { while (this.pending) this.pump(Infinity); }

  /** A finished build takes the stage: the standing one (a tall building's last window) goes —
   *  its mesh, its walls, its room map, its pieces — and this one's stand in their place. */
  private standUp(job: Job, mesh: THREE.Object3D) {
    this.dropStanding();
    this.mesh = mesh;
    this.group.add(mesh);
    this.scope = job.scope;
    this.layout = job.layout;
    this.win = job.win;
    this.roomTex = job.roomTex;
    this.roomMapU.value = job.roomTex?.map ?? null;
    this.roomPalU.value = job.roomTex?.pal ?? null;
    if (job.roomTex) { this.roomInfoU.value.copy(job.roomTex.info); this.roomDimU.value.copy(job.roomTex.dim); }
    this.inst = job.inst;
    this.lights = job.lights;
    // (the lift doors a ride slides: each leaf's instance and its resting place)
    this.leafAt.clear();
    this.leafMesh = (mesh.getObjectByName('interior:liftLeaf') as THREE.InstancedMesh | undefined) ?? null;
    if (this.leafMesh) {
      const a = this.leafMesh.instanceMatrix.array;
      for (const q of job.leaves) {
        const key = `${q.lift}:${q.car}:${q.level}`;
        const l = this.leafAt.get(key) ?? [];
        l.push({ idx: q.idx, x: a[q.idx * 16 + 12], z: a[q.idx * 16 + 14], side: q.side });
        this.leafAt.set(key, l);
      }
    }
    this.fabU.value.set(job.fab);
    this.dimsU.value.set(job.dims[0], job.dims[1]);
    if (job.stats) this.lastStats = job.stats;
    if (this.at) this.pickLights(this.at.x, this.at.feet + 1.4, this.at.z);
  }
  /** The standing build goes (its mesh, walls, room map and pieces). */
  private dropStanding() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        // (the instanced pieces' geometry lives in the shared cache; only their instance buffers go)
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
        if (g && g !== this.npcGeo && !g.userData.shared) g.dispose();
      });
      this.mesh = null;
    }
    if (this.scope) { this.walk.removeScope(this.scope, true); this.scope = 0; }
    if (this.roomTex) { this.roomTex.map.dispose(); this.roomTex.pal.dispose(); this.roomTex = null; }
    this.roomMapU.value = null;
    this.roomPalU.value = null;
    this.inst?.release();
    this.inst = null;
    this.layout = null;
    this.win = null;
    this.leafMesh = null;
    this.leafAt.clear();
  }
  /** An unfinished build goes: whatever it had made (walls in its scope, a room map, pieces). */
  private dropJob(job: Job) {
    if (job.scope !== this.scope) this.walk.removeScope(job.scope, true);
    if (job.roomTex) { job.roomTex.map.dispose(); job.roomTex.pal.dispose(); }
    job.inst?.release();
    job.roomTex = null;
    job.inst = null;
  }
  private drop() {
    if (this.pending) { this.dropJob(this.pending); this.pending = null; }
    this.showCar(null);
    this.dropStanding();
    this.lights = [];
    this.want = -1;
  }

  /** A tall building's window re-centres on storey k: the next build starts (one still underway
   *  for another storey is dropped — the standing window stays up meanwhile). */
  private recentre(k: number) {
    const P = this.active !== null ? this.plans.get(this.active) : undefined, fp = this.active !== null ? this.fps.get(this.active) : undefined;
    if (!P || !fp) return;
    this.want = k;
    if (this.pending) { this.dropJob(this.pending); this.pending = null; }
    this.pending = this.job(this.active!, P, fp, k);
  }
  private job(fi: string, P: Plan, fp: Footprint, k: number): Job {
    const job: Job = { fi, k: P.tall ? k : -1, win: this.windowOf(P, P.tall ? k : -1), scope: SCOPES[0] === this.scope ? SCOPES[1] : SCOPES[0], gen: null!, layout: null, roomTex: null, inst: null, lights: [], leaves: [], stats: null, fab: 0xffffff, dims: [P.L / 2, P.W / 2] };
    job.gen = this.steps(P, fp, job);
    return job;
  }

  private activate(fi: string | null, sync = false) {
    this.drop();
    this.active = fi;
    this.openAmt = 0;
    this.opened = false;
    U.uHoleInfo.value.z = 0;
    if (fi === null) {
      activeBuilding.uActiveId.value = -1;
      return;
    }
    const P = this.plans.get(fi), fp = this.fps.get(fi);
    if (!P || !fp) {
      this.failed.add(fi);
      this.activate(null);
      return;
    }
    if (fp.raise < 0.5) {
      // cut the terrain away inside the footprint (it may stand proud of the floor on a slope)
      const step = Math.ceil(fp.ring.length / HOLE_MAX);
      const pts = fp.ring.filter((_, i) => i % step === 0);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      pts.forEach(([x, z], i) => { U.uHolePts.value[i].set(x, z); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); });
      U.uHoleBox.value.set(x0, z0, x1, z1);
      U.uHoleInfo.value.set(pts.length, P.floor0 + 1.2, 1, 0);
    }
    activeBuilding.uActiveId.value = fp.id;
    activeBuilding.uOpenDoor.value.set(P.door.wx, P.door.y, P.door.wz, P.door.w / 2);
    activeBuilding.uOpenDoorH.value = P.door.h;
    // (the building's frame, storeys and door: the same for every window of it)
    this.frameU.value.set(P.cx, P.cz, P.ux, P.uz);
    this.dimsU.value.set(P.L / 2, P.W / 2);
    this.levelsU.value.set(P.floor0, P.levels > 1 ? P.floorH : P.ceilTop - P.floor0, P.door.wx, P.door.wz);
    this.doorU.value.set(P.door.y, P.door.w / 2, P.door.h, P.up === 'office' ? 0 : 1); // (an office's windows: no curtains)
    // a tall building builds round the walker's storey (at the door: the ground)
    const k = P.tall ? this.storeyFor(P, this.at?.feet ?? P.floor0) : -1;
    this.want = k;
    const job = this.job(fi, P, fp, k);
    try {
      if (sync) {
        let r = job.gen.next();
        while (!r.done) r = job.gen.next();
        this.standUp(job, r.value);
      } else this.pending = job;
    } catch (e) {
      console.warn('interior build failed', fi, e);
      this.failed.add(fi);
      this.dropJob(job);
      this.activate(null);
    }
  }

  /** (the bench and the budget test) The whole activation as the steps the pump runs — a tall
   *  building's window centred on storey k (the ground by default). */
  buildSteps(P: Plan, fp: Footprint, k = 0) {
    const job = this.job(P.fp, P, fp, k);
    const self = this;
    return (function* () {
      const mesh = yield* job.gen;
      self.standUp(job, mesh);
      return mesh;
    })();
  }

  /** An activation's work, sliced: Stage B a storey at a time, the rooms' walls into the collision
   *  world (never onto the walker: one within reach gets a doorway where they stand), the mesh. A
   *  tall building's: the storeys of its window only. */
  private *steps(P: Plan, fp: Footprint, job: Job): Generator<void, THREE.Object3D, void> {
    const [k0, k1] = job.win;
    const PW = unstack(P, k0, k1);
    const L = yield* layoutSteps(PW, fp, job.win);
    yield;
    // (the walker's own storey already standing — a window moving up the stairs with them — has
    // these very walls up already, round them: a doorway where they happen to stand isn't wanted)
    const ks = storeyAt(P, this.at?.feet ?? P.floor0);
    const had = !!this.mesh && !!this.win && ks >= this.win[0] && ks <= this.win[1] && this.fps.get(job.fi) === fp;
    for (let i = 0; i < L.walls.length; i += 400) {
      const part = { ...L, walls: L.walls.slice(i, i + 400) };
      this.walk.withScope(job.scope, () => registerLayout(this.walk, PW, part, had ? undefined : this.at));
      yield;
    }
    job.layout = L;
    return yield* this.buildGen(PW, fp, L, job);
  }

  private *buildGen(P: Plan, fp: Footprint, L: Layout, job: Job): Generator<void, THREE.Object3D, void> {
    const rng = makeRng(Math.floor(fp.seed * 1e9) ^ 0x1234);
    const m = new Mesher(16384);
    const kind = KIND[fp.kind as keyof typeof KIND] ?? 0;
    m.setInfo(fp.id, kind, fp.floor0 - fp.base);
    const d = new Draw(P, m);
    const inst = new Instancer(P);
    job.inst = inst;
    const s = ringSign(fp.ring);
    const [k0, k1] = job.win;
    const f0 = P.floor0, fH = P.floorH, top = P.ceilTop;
    const fl = (k: number) => f0 + k * fH;
    const ceil = (k: number) => (k === P.levels - 1 ? top : fl(k + 1) - 0.02);
    job.fab = FABRIC[Math.floor(rng.float() * FABRIC.length)];
    // (a tower's storeys stand on a tier's plate: its outline, its eave)
    const ringAt = (k: number) => plateAt(P, k)?.ring ?? fp.ring;
    {
      // daylight falls off from the walls of the storeys built (a tier's are its own)
      const pl = plateAt(P, Math.round((k0 + k1) / 2));
      let du = P.L / 2, dv = P.W / 2;
      if (pl) {
        du = 0; dv = 0;
        for (const [u, v] of pl.loc) (du = Math.max(du, Math.abs(u))), (dv = Math.max(dv, Math.abs(v)));
      }
      job.dims = [du, dv];
    }

    // Walls: inner faces of the facade, inset a little; window panes are cut out in the shader. (A
    // tower's: its window's storeys, plate by plate.)
    const bands: [P2[], number, number, number, boolean][] = []; // ring, y0, y1, eave (wall-UV), glass
    {
      const cuts = [k0, ...(P.plates ?? []).map((p) => p.from).filter((f) => f > k0 && f <= k1), k1 + 1];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const a = cuts[i], b = cuts[i + 1] - 1;
        const pl = plateAt(P, a);
        bands.push([ringAt(a), fl(a) - 0.02, ceil(b), pl ? pl.eave : fp.eave, !!(pl ? pl.glass : fp.glass)]);
      }
    }
    for (const [ring, y0, y1, eave, glass] of bands) {
      // (a curtain wall's siding code rides in the kind's fraction, as on the facade: glazed floor to ceiling)
      m.setInfo(fp.id, kind + (glass ? 0.46 : 0), fp.floor0 - fp.base);
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const ox = (dz / len) * s, oz = (-dx / len) * s;
        const ins = 0.14;
        const a = [p[0] - ox * ins, p[1] - oz * ins], b = [q[0] - ox * ins, q[1] - oz * ins];
        m.setOut(ox, oz);
        m.part(IP.wall).color(0xffffff);
        const base = fp.base;
        m.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [-ox, 0, -oz],
          [[0, y0 - base, len, eave], [len, y0 - base, len, eave], [len, y1 - base, len, eave], [0, y1 - base, len, eave]]);
      }
    }
    m.setOut(0, 0);
    m.setInfo(fp.id, kind, fp.floor0 - fp.base);
    yield; // facade shell done

    // Floors and ceilings for each storey, with the stairwell openings cut out.
    const holeRing = (r: Rect) => ringOf(P, r);
    const ringFlat = (ring: P2[], y: number, up: boolean, holes: P2[][], part: number) => {
      let idx: number[][];
      try {
        idx = THREE.ShapeUtils.triangulateShape(ring.map((r) => new THREE.Vector2(r[0], r[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
      } catch { idx = THREE.ShapeUtils.triangulateShape(ring.map((r) => new THREE.Vector2(r[0], r[1])), []); holes = []; }
      const pts = [...ring, ...holes.flat()];
      m.part(part).color(0xffffff);
      const n = [0, up ? 1 : -1, 0];
      for (const [i0, i1, i2] of idx) m.tri([pts[i0][0], y, pts[i0][1]], [pts[i1][0], y, pts[i1][1]], [pts[i2][0], y, pts[i2][1]], n);
    };
    for (let k = k0; k <= k1; k++) {
      ringFlat(ringAt(k), fl(k) + 0.01, true, P.holes.filter((H) => H.level === k).map(holeRing), IP.floor);
      ringFlat(ringAt(k), ceil(k), false, P.holes.filter((H) => H.level === k + 1).map(holeRing), IP.ceil);
      yield; // one storey of slab + ceiling
    }
    // dark caps where the stairwells run on past the storeys built (a tower's window)
    m.part(IP.solid).color(0x2a2622);
    for (const H of P.holes) {
      const [a, b, c, e] = holeRing(H);
      if (H.level === k1 + 1 && k1 + 1 < P.levels) { const y = fl(k1 + 1) + 0.05; m.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [e[0], y, e[1]], [0, -1, 0]); }
      if (H.level === k0 && k0 > 0) { const y = fl(k0) - 0.3; m.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [e[0], y, e[1]], [0, 1, 0]); }
    }

    // Stairs: treads, risers, strings, rails; a runner on the treads now and then.
    const treadC = WOOD[Math.floor(rng.float() * WOOD.length)];
    drawStairs(d, P, treadC, rng.float() < 0.45 ? FABRIC[Math.floor(rng.float() * FABRIC.length)] : null, k0, k1);
    // a double-height lobby: storey 1's slab stops at a fascia round the void, a rail along it
    if (P.atrium && k0 <= 1 && k1 >= 1)
      for (const [ua, va, ub, vb] of atriumEdges(P)) {
        d.panel(ua, va, ub, vb, fl(1) - 0.36, fl(1) + 0.012, 0xe9e5dc, IP.solid);
        d.rail(ua, va, ub, vb, fl(1), 1.08);
      }
    yield;

    // Partitions with their doorways: casings round each opening, the leaf standing open into the room.
    const { leaves } = yield* drawPartitionsGen(d, P, L, ceil);
    const leafHex = rng.float() < 0.6 ? 0xf2efe6 : treadC;
    let nd = 0;
    for (const dw of L.doors) {
      if (++nd % 250 === 0) yield;
      const w = Math.round(dw.w * 20) / 20;
      const [uc, vc] = dw.ax === 0 ? [dw.t, dw.c] : [dw.c, dw.t];
      inst.put(`frame:${w}`, () => D.doorFrame(w), uc, vc, fl(dw.level), dw.ax === 0 ? [1, 0] : [0, 1]);
    }
    yield;
    for (const lf of leaves) {
      if (++nd % 250 === 0) yield;
      // the leaf's x runs from the hinge into the room
      const [uc, vc] = lf.ax === 0 ? [lf.hinge, lf.c + lf.side * 0.02] : [lf.c + lf.side * 0.02, lf.hinge];
      const ax: P2 = lf.ax === 0 ? [0, lf.side] : [lf.side, 0];
      const w = Math.round(lf.w * 20) / 20;
      inst.put(`leaf:${w}`, () => D.doorLeaf(w - 0.04), uc, vc, fl(lf.level), ax, leafHex);
    }
    yield;

    // ---- the front door, standing open inward (the ground storey built) ----
    if (k0 === 0) {
      const dr = P.door;
      const tu = (dr.wx - P.cx) * P.ux + (dr.wz - P.cz) * P.uz, tv = (dr.wx - P.cx) * P.vx + (dr.wz - P.cz) * P.vz;
      // wall tangent in local coords: perpendicular to the door normal
      const nl: P2 = [dr.nx * P.ux + dr.nz * P.uz, dr.nx * P.vx + dr.nz * P.vz];
      const tl: P2 = [-nl[1], nl[0]];
      const hinge: P2 = [tu + tl[0] * (dr.w / 2) - nl[0] * 0.16, tv + tl[1] * (dr.w / 2) - nl[1] * 0.16];
      const tip: P2 = [hinge[0] - nl[0] * dr.w, hinge[1] - nl[1] * dr.w];
      const a = toW(P, hinge[0], hinge[1]), b = toW(P, tip[0], tip[1]);
      const nn = [b[1] - a[1], 0, -(b[0] - a[0])], nlen = Math.hypot(nn[0], nn[2]) || 1;
      const nv = [nn[0] / nlen, 0, nn[2] / nlen];
      m.part(IP.solid).color(dr.col);
      for (const sg of [1, -1]) m.quad([a[0], dr.y, a[1]], [b[0], dr.y, b[1]], [b[0], dr.y + dr.h - 0.02, b[1]], [a[0], dr.y + dr.h - 0.02, a[1]], [nv[0] * sg, 0, nv[2] * sg]);
      // the leaf reads as a door, not a slab: a shop door is mostly glass in a slim frame, any
      // other door has four raised panels a shade off its paint; a brass knob near the free edge
      const at = (t: number, yy: number, off: number) => [a[0] + (b[0] - a[0]) * t + nv[0] * off, yy, a[1] + (b[1] - a[1]) * t + nv[2] * off];
      const inset = (s0: number, s1: number, y0: number, y1: number, off: number) => {
        for (const sg of [1, -1]) m.quad(at(s0, y0, sg * off), at(s1, y0, sg * off), at(s1, y1, sg * off), at(s0, y1, sg * off), [nv[0] * sg, 0, nv[2] * sg]);
      };
      const fw = 0.1 / Math.max(0.5, dr.w); // frame width as a fraction of the leaf
      if (dr.kind === 'commercial') {
        m.part(IP.glass).color(0x9fb3bf);
        inset(fw, 1 - fw, dr.y + 0.3, dr.y + dr.h - 0.14, 0.008);
        m.part(IP.solid).color(0xc9c4ba); // push bar across the glass
        inset(0.12, 0.88, dr.y + 1.0, dr.y + 1.05, 0.02);
      } else {
        m.part(IP.solid).color(new THREE.Color(dr.col).multiplyScalar(0.68).getHex());
        for (const [s0, s1] of [[fw, 0.5 - fw / 2], [0.5 + fw / 2, 1 - fw]]) for (const [y0, y1] of [[0.18, 0.95], [1.15, dr.h - 0.2]]) inset(s0, s1, dr.y + y0, dr.y + y1, 0.008);
        m.part(IP.solid).color(0xc9a74a);
        inset(0.86, 0.92, dr.y + 0.95, dr.y + 1.02, 0.03);
      }
      // doormat just inside
      const mat: P2 = [tu - nl[0] * 0.75, tv - nl[1] * 0.75];
      d.box(mat[0] - 0.4, mat[0] + 0.4, mat[1] - 0.3, mat[1] + 0.3, f0 + 0.01, f0 + 0.025, 0x6b5a45, IP.fabric);
    }

    // (a tall building is built a few storeys at a time, whichever few: each storey draws its
    // paint, its furniture and its people from seeds of its own — it looks the same from any window,
    // so a storey you can see doesn't change as the window moves up the stairs with you)
    const tallB = !!P.tall;
    const seedB = Math.floor(fp.seed * 1e9);
    const storeyRng = (k: number, salt: number) => makeRng((seedB ^ Math.imul(k + 1, 0x2c1b3c6d) ^ salt) >>> 0);

    // The room map: each room's wall paint and floor, looked up per pixel (it goes live when this
    // build stands up: a tower's standing window keeps painting from its own till then).
    const paintRng = new Map<number, Rng>();
    const paint = tallB
      ? (lv: number) => {
          let r = paintRng.get(lv);
          if (!r) paintRng.set(lv, (r = storeyRng(lv, 0x9a17)));
          return r.float();
        }
      : () => rng.float();
    const rm = yield* roomMapGen(P, L, paint, k0, k1);
    job.roomTex = rm;
    yield;

    // Furniture, room by room (a vast building stops short of the vertex budget: the rooms past it
    // stay bare — a tall building's storeys each at their own share of it)
    const F = new Furnisher(P, fp, L, m, inst, tallB ? storeyRng(-1, 0xf0d5) : rng, leaves, ceil);
    for (let k = k0; k <= k1; k++) furnishLifts(F, k);
    const nth = new Map<number, number>();
    let lv = -1, lvBase = 0;
    for (const R of L.rooms) {
      if (m.n + inst.uniqueVerts() > FURNISH_MAX) break;
      if (tallB) {
        const i = nth.get(R.level) ?? 0;
        nth.set(R.level, i + 1);
        F.rng = storeyRng(R.level, Math.imul(i + 1, 0x68e31da5) ^ 0x5eed);
        if (R.level !== lv) (lv = R.level), (lvBase = m.n);
        if (m.n - lvBase > STOREY_MAX) continue;
      }
      yield* furnishRoom(F, R);
      yield; // one room's furniture done
    }

    // Assemble: the merged mesh, one InstancedMesh per repeated piece; then the residents.
    const group = new THREE.Group();
    const { meshes, verts } = yield* inst.finishGen(m, this.mat, MAX_INSTANCED, fl(k0), ceil(k1));
    yield;
    const main = m.geometries();
    for (const g of main) group.add(new THREE.Mesh(g, this.mat));
    for (const im of meshes) group.add(im);
    const busy = fp.kind === 'commercial' || fp.kind === 'church';
    const SH = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0xf2efe6, 0x3f6f78];
    const stand: [THREE.Matrix4, THREE.Color][] = [], sit: [THREE.Matrix4, THREE.Color][] = [];
    const ang = Math.atan2(P.uz, P.ux);
    /** Up to n residents on these spots, drawn with r: staff first (a shop is never unattended),
     *  then customers / residents at random. */
    const people = (spots: NpcSpot[], r: Rng, n: number) => {
      const used = new Set<number>();
      const staff = spots.map((sp, k) => (sp[5] ? k : -1)).filter((k) => k >= 0);
      for (let i = 0; i < n; i++) {
        let k = i < staff.length ? staff[i] : Math.floor(r.float() * spots.length);
        for (let t = 0; t < 8 && used.has(k); t++) k = Math.floor(r.float() * spots.length);
        if (used.has(k)) continue;
        used.add(k);
        const [u, v, y, yaw, seat] = spots[k];
        const w = toW(P, u, v);
        const col = new THREE.Color(SH[Math.floor(r.float() * SH.length)]);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + yaw + (seat ? r.range(-0.15, 0.15) : r.range(-0.4, 0.4)));
        // seated: the pose puts the hips 0.45 m up — raise it to the seat (a bar stool is 0.76)
        if (seat) sit.push([new THREE.Matrix4().compose(new THREE.Vector3(w[0], y + seat - 0.45, w[1]), q, new THREE.Vector3(1, 1, 1)), col]);
        else {
          stand.push([new THREE.Matrix4().compose(new THREE.Vector3(w[0], y, w[1]), q, new THREE.Vector3(1, 1, 1)), col]);
          // a standing resident at home often has company: a second person a step away facing
          // them (chatting) — or, when that's the counter, alongside them (cooking together)
          if (!busy && i === 0 && r.float() < 0.5) {
            const level = Math.round((y - f0) / Math.max(0.1, fH));
            const fu = -Math.sin(yaw), fv = -Math.cos(yaw); // this resident's facing in u/v
            for (const [du, dv, turn] of [[fu * 1.05, fv * 1.05, Math.PI], [-fv * 0.65, fu * 0.65, 0], [fv * 0.65, -fu * 0.65, 0]] as const) {
              const u2 = u + du, v2 = v + dv;
              if (!F.freeAt(level, { u0: u2 - 0.22, u1: u2 + 0.22, v0: v2 - 0.22, v1: v2 + 0.22 })) continue;
              const w2 = toW(P, u2, v2);
              const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + yaw + turn + r.range(-0.2, 0.2));
              stand.push([new THREE.Matrix4().compose(new THREE.Vector3(w2[0], y, w2[1]), q2, new THREE.Vector3(1, 1, 1)), new THREE.Color(SH[Math.floor(r.float() * SH.length)])]);
              break;
            }
          }
        }
      }
    };
    if (tallB) {
      // (a storey's own few, from its own seed: NPC_MAX shared by the window's storeys)
      const per = Math.floor(NPC_MAX / 3);
      for (let k = k0; k <= k1; k++) {
        const spots = F.npcs.filter((sp) => storeyAt(P, sp[2]) === k);
        const r = storeyRng(k, 0x9e0);
        people(spots, r, Math.min(per, spots.length, busy ? 1 + Math.floor(r.float() * 3) : 1 + Math.floor(r.float() * 2)));
      }
    } else people(F.npcs, rng, Math.min(NPC_MAX, F.npcs.length, busy ? 2 + Math.floor(rng.float() * 6) : 1 + Math.floor(rng.float() * 3)));
    let npcDraws = 0;
    for (const [list, mt] of [[stand, this.npcMat], [sit, this.npcSeatMat]] as const) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(this.npcGeo, mt, Math.min(NPC_MAX, list.length));
      list.slice(0, NPC_MAX).forEach(([m4, c], i) => { im.setMatrixAt(i, m4); im.setColorAt(i, c); });
      im.frustumCulled = false;
      group.add(im);
      npcDraws++;
    }
    job.lights = F.lights;
    job.leaves = F.liftLeaves;
    job.stats = { verts: m.n + verts, draws: main.length + meshes.length + npcDraws, instances: meshes.reduce((a, im) => a + im.count, 0), texels: rm.texels, rooms: L.rooms.length, storeys: k1 - k0 + 1 };
    return group;
  }
}

const ringSign = (r: P2[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a > 0 ? 1 : -1;
};
function ringDist(r: P2[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

function interiorMaterial(I: Interiors) {
  return paintMaterial({
    uniforms: {
      uLights: I.lightsU, uFrame: I.frameU, uDims: I.dimsU, uLevels: I.levelsU, uDoor: I.doorU,
      uRoomMap: I.roomMapU, uRoomPal: I.roomPalU, uRoomInfo: I.roomInfoU, uRoomDim: I.roomDimU, uFab: I.fabU, uWindowColor: { value: lin(0xffc27a) },
    },
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute vec4 aWall;
      attribute vec4 aInfo;
      attribute vec2 aOut;
      varying vec3 vColor;
      varying vec4 vWall;
      flat varying vec4 vInfo;
      flat varying vec2 vOut;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          // a repeated piece: its white-painted parts (and their shaded greys) take the instance's
          // colour (a sofa's fabric, a table's wood)
          float tintable = step(0.25, color.g) * step(abs(color.r - color.g) + abs(color.g - color.b), 0.002);
          vColor = mix(color, color * instanceColor, tintable);
        #endif
        vWall = aWall; vInfo = aInfo; vOut = aOut;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform vec4 uLights[8];
      uniform vec4 uFrame, uLevels, uDoor, uRoomInfo, uRoomDim;
      uniform vec2 uDims;
      uniform sampler2D uRoomMap, uRoomPal;
      uniform vec3 uWindowColor, uFab;
      varying vec3 vColor;
      varying vec4 vWall;
      flat varying vec4 vInfo;
      flat varying vec2 vOut;
      ${GLSL_WINDOWS}

      // a little watercolour on the wall: sea, sky, dune — or a sailboat, or a bunch of washes
      vec3 painting(vec2 st, float style) {
        float k = floor(style), h = fract(style);
        float hz = 0.42 + 0.2 * h;
        vec3 sky = mix(vec3(0.95, 0.85, 0.7), vec3(0.55, 0.72, 0.86), st.y);
        vec3 sea = mix(vec3(0.2, 0.42, 0.55), vec3(0.35, 0.58, 0.66), st.y / hz);
        vec3 c = st.y > hz ? sky : sea;
        if (st.y < hz * 0.45 + 0.05 * sin(st.x * 9.0 + h * 6.0)) c = vec3(0.88, 0.8, 0.62);
        if (k > 0.5 && k < 1.5) { vec2 b = st - vec2(0.3 + h * 0.4, hz); if (b.y > 0.0 && b.y < 0.28 && abs(b.x) < b.y * 0.6) c = vec3(0.97, 0.95, 0.9); }
        if (k > 1.5 && k < 2.5) c = mix(vec3(0.85, 0.62, 0.45), vec3(0.4, 0.55, 0.7), smoothstep(0.2, 0.8, st.x + 0.3 * sin(st.y * 5.0 + h * 9.0)));
        if (k > 2.5 && k < 3.5) { float r = length(st - vec2(0.5, 0.55)); c = mix(vec3(0.95, 0.9, 0.8), vec3(0.85, 0.35, 0.3), smoothstep(0.25, 0.2, r)); c = mix(c, vec3(0.35, 0.55, 0.3), step(r, 0.08)); }
        if (k > 3.5) c = mix(vec3(0.96, 0.94, 0.88), vec3(0.2, 0.3, 0.45), step(0.5, fract((st.x + st.y) * 3.0 + h)) * 0.25);
        return c * (0.92 + 0.12 * vnoise(st * 14.0));
      }

      void main() {
        vec3 N = normalize(vNormalW);
        if (!gl_FrontFacing) N = -N;
        vec3 alb = vColor;
        float part = vInfo.z;
        float emis = 0.0, gloss = 0.0;
        float f0 = uLevels.x, fH = uLevels.y;
        float yl = mod(vWorldPos.y - f0, fH);
        vec2 rel = vWorldPos.xz - uFrame.xy;
        vec2 ua = uFrame.zw, va = vec2(-uFrame.w, uFrame.z);
        float pu = dot(rel, ua), pv = dot(rel, va);
        // which room am I in? (faces sample a hand's width into the room they look at) — the room
        // map holds a palette index per 0.1 m cell of each storey (interior/mesh.ts roomMap)
        vec2 pr = vec2(pu + dot(N.xz, ua) * 0.12, pv + dot(N.xz, va) * 0.12);
        // (a tower's map holds its build window's storeys: uRoomDim.z is the first one's index)
        float lvl = clamp(floor((vWorldPos.y - f0 + 0.015) / fH) - uRoomDim.z, 0.0, uRoomDim.y - 1.0);
        ivec2 tc = ivec2(int(clamp(floor((pr.x - uRoomInfo.x) * uRoomInfo.z), 0.0, uRoomDim.x - 1.0)), int(clamp(floor((pr.y - uRoomInfo.y) * uRoomInfo.z), 0.0, uRoomInfo.w - 1.0) + lvl * uRoomInfo.w));
        int ri = int(texelFetch(uRoomMap, tc, 0).r * 255.0 + 0.5);
        vec4 RA = texelFetch(uRoomPal, ivec2(ri, 0), 0), RB = texelFetch(uRoomPal, ivec2(ri, 1), 0);
        if (part < 0.5 || (part > 5.5 && part < 6.5)) {
          alb = RA.rgb;
          float style = RA.w;
          if (part < 0.5) {
            vec3 NO = normalize(vec3(vOut.x, 0.0, vOut.y));
            Win W = windowAt(vWall.x, vWall.y, vWall.z, vWall.w, seedOf(vInfo.x), vInfo.y, vInfo.w, NO);
            float sidW = floor(fract(vInfo.y + 0.001) * 10.0 + 0.5);
            if (sidW > 4.5 && !W.store && vWall.y > vInfo.w - 0.02) {
              // a curtain wall (buildings.ts): glass from the spandrel to the next slab, between
              // mullions every 1.5 m — the same panes the facade draws, cut through to the city
              float vf = vWall.y - vInfo.w, fy = vf - floor(vf / W.floorH) * W.floorH;
              float cx2 = (fract(vWall.x / 1.5) - 0.5) * 1.5;
              if (fy > 0.93 && fy < W.floorH - 0.045 && abs(cx2) < 0.705) discard;
              if (fy > 0.87) alb = vec3(0.6, 0.62, 0.64); // mullion, sill and head: anodised metal
            } else if (W.ok) {
              float inner = step(abs(W.cu), W.ww * 0.5 - 0.08) * step(abs(W.cy), W.wh * 0.5 - 0.08) * archIn(W, W.cu, W.cy, 0.08);
              if (inner > 0.5) discard;
              float frame = step(abs(W.cu), W.ww * 0.5 + 0.04) * step(abs(W.cy), W.wh * 0.5 + 0.06);
              // curtains + a valance, pulled to the sides
              if (!W.store && vInfo.y < 3.5 && uDoor.w > 0.5) {
                float side = step(W.ww * 0.5 + 0.04, abs(W.cu)) * step(abs(W.cu), W.ww * 0.5 + 0.34) * step(-W.wh * 0.5 - 0.2, W.cy) * step(W.cy, W.wh * 0.5 + 0.28);
                float val = step(abs(W.cu), W.ww * 0.5 + 0.34) * step(W.wh * 0.5 + 0.08, W.cy) * step(W.cy, W.wh * 0.5 + 0.3);
                float fold = 0.85 + 0.15 * sin(W.cu * 40.0);
                alb = mix(alb, uFab * fold, max(side, val) * step(0.3, fract(seedOf(vInfo.x) * 7.0)));
                if (frame > 0.5 && max(side, val) < 0.5) alb = vec3(0.95, 0.94, 0.9);
              } else if (frame > 0.5) alb = vec3(0.95, 0.94, 0.9);
            }
            // front doorway
            vec2 dd = vWorldPos.xz - uLevels.zw;
            if (length(dd) < uDoor.y + 0.03 && vWorldPos.y > uDoor.x - 0.05 && vWorldPos.y < uDoor.x + uDoor.z) discard;
          }
          // wallpaper / wainscot / tile by room
          if (style > 0.5 && style < 1.5) { if (yl < 0.9) alb = vec3(0.94, 0.93, 0.89) * (0.94 + 0.06 * step(0.5, fract(dot(vWorldPos.xz, va) * 3.0 + dot(vWorldPos.xz, ua) * 3.0))); if (abs(yl - 0.9) < 0.03) alb = vec3(0.85, 0.82, 0.76); }
          else if (style > 1.5 && style < 2.5) alb *= 0.9 + 0.1 * step(0.5, fract((dot(vWorldPos.xz, ua) + dot(vWorldPos.xz, va)) / 0.12));
          else if (style > 2.5 && style < 3.5) { vec2 g = fract(vec2(dot(vWorldPos.xz, ua) + dot(vWorldPos.xz, va), vWorldPos.y) / 0.18) - 0.5; alb = mix(alb, alb * 0.72, step(length(g), 0.12)); }
          else if (style > 3.5 && style < 4.5 && yl < 1.3) { vec2 g = fract(vec2(dot(vWorldPos.xz, ua) + dot(vWorldPos.xz, va), vWorldPos.y) / 0.15); alb = mix(vec3(0.95, 0.96, 0.95), vec3(0.78, 0.8, 0.8), step(0.93, max(g.x, g.y))); gloss = 0.25; }
          else if (style > 4.5 && yl < 1.1) alb = mix(vec3(0.55, 0.4, 0.28), vec3(0.62, 0.46, 0.32), step(0.5, fract(dot(vWorldPos.xz, ua + va) / 0.6)));
          if (yl < 0.12) alb = vec3(0.45, 0.36, 0.28); // baseboard
          alb *= 0.96 + 0.06 * vnoise(vWorldPos.xz * 3.0 + vWorldPos.y * 2.0);
        } else if (part < 1.5) {
          alb = RB.rgb;
          float ft = RB.w;
          if (ft < 0.5) {
            float plank = floor(pv / 0.16);
            float joint = floor((pu + hash12(vec2(plank, 3.0)) * 2.0) / 1.4);
            alb *= 0.82 + 0.26 * hash12(vec2(plank, joint));
            alb *= 1.0 - 0.35 * step(fract(pv / 0.16), 0.06);
            gloss = 0.12;
          } else if (ft < 1.5) {
            vec2 g = fract(vec2(pu, pv) / 0.3);
            alb *= 0.93 + 0.1 * step(0.5, mod(floor(pu / 0.3) + floor(pv / 0.3), 2.0));
            alb = mix(alb, vec3(0.7, 0.7, 0.68), step(0.95, max(g.x, g.y)));
            gloss = 0.2;
          } else if (ft < 2.5) alb *= 0.95 + 0.06 * vnoise(vec2(pu, pv) * 6.0);
          else { vec2 g = fract(vec2(pu, pv) / 0.6); alb *= 0.95 + 0.07 * step(0.5, mod(floor(pu / 0.6) + floor(pv / 0.6), 2.0)); alb = mix(alb, alb * 0.85, step(0.97, max(g.x, g.y))); gloss = 0.15; }
        } else if (part < 2.5) {
          alb *= 0.97;
        } else if (part > 3.5 && part < 4.5) {
          emis = 1.0;
        } else if (part > 4.5 && part < 5.5) {
          alb = painting(vWall.xy, vWall.z);
        } else if (part > 6.5 && part < 7.5) {
          alb *= 0.88 + 0.2 * vnoise(vWorldPos.xz * 30.0 + vWorldPos.y * 30.0);
        } else if (part > 7.5 && part < 8.5) {
          // rug: border, field and a pattern
          vec2 st = vWall.xy;
          float style = vWall.z, k = mod(floor(style), 10.0);
          vec3 c2 = mix(vec3(0.93, 0.9, 0.82), vec3(0.3, 0.35, 0.45), step(0.5, fract(floor(style / 10.0) * 0.37)));
          vec2 e = min(st, 1.0 - st) * vec2(vWall.w, vWall.w);
          float border = step(min(e.x, e.y), 0.12);
          if (k < 0.5) alb = mix(alb, c2, border);
          else if (k < 1.5) alb = mix(alb, c2, step(0.5, fract(st.x * 7.0)) * 0.6);
          else if (k < 2.5) alb = mix(alb, c2, border + step(abs(st.y - 0.5), 0.04) * 0.8);
          else { vec2 g = abs(fract(st * vec2(4.0, 3.0)) - 0.5); alb = mix(alb, c2, step(g.x + g.y, 0.25) + border); }
          alb *= 0.88 + 0.2 * vnoise(vWorldPos.xz * 25.0);
        } else if (part > 8.5 && part < 9.5) {
          gloss = 0.45;
        } else if (part > 9.5 && part < 10.5) {
          vec3 V = normalize(vWorldPos - (cameraPosition + uWorldOffset));
          alb = mix(alb, mix(uSkyHorizon, vec3(0.9, 0.88, 0.84), 0.5), 0.35 + 0.3 * pow(1.0 - abs(dot(V, N)), 2.0));
          gloss = 0.6;
        } else if (part > 10.5 && part < 11.5) {
          float g = vnoise(vec2(dot(vWorldPos.xz, ua) * 1.5 + vWorldPos.y * 1.5, dot(vWorldPos.xz, va) * 20.0 + vWorldPos.y * 20.0));
          alb *= 0.88 + 0.22 * g;
          gloss = 0.1;
        } else if (part > 11.5) {
          // railing panel: top rail, bottom rail, balusters
          float u = vWall.x, v = vWall.y, h = vWall.w;
          bool solid = v > h - 0.07 || v < 0.06 || fract(u / 0.12) < 0.3;
          if (!solid) discard;
        }
        alb = pigment(alb, vWorldPos);
        // daylight spilling in from the windows + warm lamps (lamps light only their own storey)
        vec3 amb = mix(vec3(0.5, 0.46, 0.42), uAmbSky * 1.5, 0.5) * (0.12 + 0.55 * (1.0 - uNight));
        // daylight falls off away from the outer walls (where the windows are), and the room's
        // edges — along the floor and under the ceiling — sit a little darker
        float dW = min(uDims.x - abs(pu), uDims.y - abs(pv));
        amb *= mix(mix(1.25, 0.72, smoothstep(0.5, 4.0, dW)), 1.0, uNight);
        amb *= mix(0.78, 1.0, smoothstep(0.0, 0.35, yl) * smoothstep(0.0, 0.45, fH - yl));
        vec3 lamp = vec3(0.0);
        vec3 V = normalize((cameraPosition + uWorldOffset) - vWorldPos);
        float spec = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 L = uLights[i];
          if (L.w <= 0.0) continue;
          vec3 d = L.xyz - vWorldPos;
          float same = step(L.y - fH + 0.05, vWorldPos.y) * step(vWorldPos.y, L.y + 0.4);
          float att = L.w / (1.0 + dot(d, d) * 0.22);
          vec3 ld = normalize(d);
          lamp += uWindowColor * att * same * (0.35 + 0.65 * max(dot(N, ld), 0.0));
          spec += att * same * pow(max(dot(reflect(-ld, N), V), 0.0), 24.0);
        }
        vec3 col = alb * (amb + lamp * (0.55 + 0.6 * uNight));
        // Sun through the windows: follow the ray toward the sun to the outer wall it leaves by,
        // and light this point if it passes through a pane (house windows: 0.9–2.25 m above the
        // floor, one per ~2.7 m of wall). Warm pools on the floorboards, slanting up the walls.
        if (uKeyDir.y > 0.04 && uNight < 0.5) {
          vec2 sd = vec2(dot(uKeyDir.xz, ua), dot(uKeyDir.xz, va));
          float hl = length(sd);
          if (hl > 1e-3) {
            vec2 hd = sd / hl;
            float tu = hd.x > 0.0 ? (uDims.x - pu) / hd.x : hd.x < 0.0 ? (-uDims.x - pu) / hd.x : 1e9;
            float tv = hd.y > 0.0 ? (uDims.y - pv) / hd.y : hd.y < 0.0 ? (-uDims.y - pv) / hd.y : 1e9;
            float t = min(tu, tv);
            float hitY = yl + t * uKeyDir.y / hl;
            float along = tu < tv ? pv + t * hd.y : pu + t * hd.x;
            float cellW = 2.7, cu = (fract(along / cellW) - 0.5) * cellW;
            // a crisp window shape with its muntin cross (sash bars) printed in the light
            float pane = (1.0 - smoothstep(0.455, 0.475, abs(cu))) * smoothstep(0.9, 0.92, hitY) * (1.0 - smoothstep(2.23, 2.25, hitY));
            pane *= smoothstep(0.018, 0.03, abs(cu)) * smoothstep(0.018, 0.03, abs(hitY - 1.575));
            float sun = pane * step(t, 7.0) * max(dot(N, uKeyDir), 0.0) * (1.0 - smoothstep(0.2, 0.5, uNight));
            col += alb * uKeyColor * sun * 1.5;
          }
        }
        col += uWindowColor * spec * gloss * 0.6;
        col += uWindowColor * emis * 2.2;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
