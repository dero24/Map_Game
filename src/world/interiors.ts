// Enterable buildings (docs/INTERIORS_PLAN.md). Every building with a door gets a deterministic shell
// at tile build (interior/plan.ts: storeys, straight or dogleg stairs with real stairwells, the
// hall, corridors and cores the rooms hang off), so collision is right everywhere. Walking up to
// one lays out its rooms (interior/layout.ts: a house's hall with rooms either side, a block's flats
// off its corridor, an office's core and open plan) — their walls enter the collision world a few
// frames in — and builds its meshes over a few more (interior/mesh.ts, interior/furnish.ts): walls with
// real window openings, floors, ceilings, stairs, cased doorways with their doors standing open,
// furniture by room (repeated pieces instanced), lamps, residents. Leaving drops it all.
import * as THREE from 'three';
import type { Footprint } from './buildings';
import { activeBuilding, GLSL_WINDOWS, KIND } from './buildings';
import type { WalkWorld } from '../player/collision';
import { paintMaterial, lin, U, HOLE_MAX } from '../render/shared';
import { makeRng } from '../core/rng';
import { pedGeo, creatureMaterial } from '../sim/life';
import * as D from '../assets/decor';
import { toW, type Plan, type Rect } from './interior/plan';
import { layoutSteps, registerLayout, type Layout, type Room } from './interior/layout';
import { Mesher, Draw, Instancer, IP, WOOD, roomMapGen, drawStairs, drawPartitionsGen, type RoomMap } from './interior/mesh';
import { Furnisher, furnishRoom, FABRIC, type Light } from './interior/furnish';

export { planInterior, registerPlan, LocalPoly, type Plan, type Flight } from './interior/plan';
export { layoutInterior, registerLayout, type Layout, type Room } from './interior/layout';

type P2 = [number, number];
/** The interior's own collision scope (one interior stands open at a time). */
const SCOPE = -7;
const NPC_MAX = 12; // residents an interior shows at once (the shared ped geometry's aAnim covers this many)
/** Draw calls an interior may take for its instanced pieces (the budget is 60 all told). */
const MAX_INSTANCED = 44;
/** Vertices past which no more rooms are furnished (the budget is 120k: a room's worth of margin). */
const FURNISH_MAX = 110000;
export interface InteriorStats { verts: number; draws: number; instances: number; texels: number; rooms: number }
const ROOM_NAME: Partial<Record<Room['type'], string>> = {
  hall: 'hall', landing: 'landing', corridor: 'corridor', lobby: 'lobby', living: 'living room', kitchen: 'kitchen',
  dining: 'dining room', bath: 'bathroom', bed: 'bedroom', study: 'study', utility: 'utility room', closet: 'closet',
  store: 'storeroom', open: 'open-plan office', meeting: 'meeting room', lift: 'elevator lobby', shop: 'shop floor',
  stock: 'stockroom', cafe: 'café', bar: 'bar', diner: 'dining room', galley: 'kitchen', church: 'nave', great: 'living room',
};

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
  readonly doorU = { value: new THREE.Vector4() }; // door y, half width, height, -
  // the room map (a palette index per 0.1 m cell of each storey) and its palette: every room its paint
  readonly roomMapU = { value: null as THREE.Texture | null };
  readonly roomPalU = { value: null as THREE.Texture | null };
  readonly roomInfoU = { value: new THREE.Vector4(0, 0, 10, 1) }; // u of cell 0, v of cell 0, cells per m, rows per storey
  readonly roomDimU = { value: new THREE.Vector4(1, 1, 0, 0) }; // columns, storeys
  readonly fabU = { value: new THREE.Color() };
  private mat: THREE.ShaderMaterial;
  private npcMat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1 });
  // residents in chairs, on sofas, in booths and on bar stools sit (INDOOR: they don't leave at dusk)
  private npcSeatMat = creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, SEATED: 1, INDOOR: 1 });
  private npcGeo = pedGeo();
  private lights: Light[] = [];
  private failed = new Set<string>();
  private pending: { fi: string; gen: Generator<void, THREE.Object3D, void> } | null = null;
  private openAmt = 0;
  private opened = false; // hysteresis state for the facade openings (see update)
  private layout: Layout | null = null;
  private scoped = false;
  private roomTex: RoomMap | null = null;
  private inst: Instancer | null = null;
  private at: { x: number; z: number; feet: number } | undefined;
  /** What the last build drew (the bench and the budget test read it). */
  lastStats: InteriorStats = { verts: 0, draws: 0, instances: 0, texels: 0, rooms: 0 };
  indoors = false;
  onStairs = false;

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
    if (!onFoot && this.active !== null && (this.pending || this.openAmt <= 0.001)) {
      const d = this.plans.get(this.active)?.door;
      if (this.pending || !d || Math.hypot(d.x - x, d.z - z) > 30) this.activate(null);
    }
    this.pump();
    const inside = this.walk.interiorAt(x, z, feet);
    this.indoors = inside >= 0 && inside === this.walkId(this.active);
    // Windows + door become real openings as you come close: a hysteresis switch (open < 8 m,
    // close > 10 m), only once the interior mesh exists, and a short time-based wash (~0.3 s,
    // world-anchored noise in the facade shader).
    const afp = this.active !== null ? this.fps.get(this.active) : undefined;
    if (afp && !this.pending && this.mesh) {
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
  fpOf(key: string | null) { return key !== null ? this.fps.get(key) : undefined; }
  planOf(key: string | null) { return key !== null ? this.plans.get(key) : undefined; }
  /** The room at a point of the open building (its storey from the feet). */
  roomAt(x: number, z: number, feet: number): Room | null {
    const P = this.activePlan, L = this.layout;
    if (!P || !L) return null;
    const u = (x - P.cx) * P.ux + (z - P.cz) * P.uz, v = (x - P.cx) * P.vx + (z - P.cz) * P.vz;
    const k = Math.max(0, Math.min(P.levels - 1, Math.round((feet - P.floor0) / P.floorH)));
    return L.rooms.find((r) => r.level === k && u >= r.r.u0 && u <= r.r.u1 && v >= r.r.v0 && v <= r.r.v1) ?? null;
  }
  /** What the HUD calls the room at a point of the open building (null: none, or the stairs). */
  roomName(x: number, z: number, feet: number): string | null {
    const R = this.roomAt(x, z, feet);
    if (!R) return null;
    const home = this.fpOf(this.active)?.kind === 'house';
    return R.type === 'wc' ? (home ? 'half bath' : 'restroom') : ROOM_NAME[R.type] ?? null;
  }
  private walkIds = new Map<string, number>();
  private walkId(fi: string | null) { return fi !== null ? this.walkIds.get(fi) ?? -2 : -2; }

  private pickLights(x: number, y: number, z: number) {
    const ls = this.lights.slice().sort((a, b) => (a.x - x) ** 2 + ((a.y - y) * 2.5) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + ((b.y - y) * 2.5) ** 2 + (b.z - z) ** 2));
    for (let i = 0; i < 8; i++) {
      const l = ls[i];
      this.lightsU.value[i].set(l?.x ?? 0, l?.y ?? -999, l?.z ?? 0, l?.w ?? 0);
    }
  }

  // Build (or drop) a building's interior right now — used to compile the interior shaders during loading.
  prime(fi: string | null) { this.activate(fi, true); }

  // Interior builds are sliced across frames: activation lands instantly (door and window uniforms
  // go live, the old interior drops) while a pending generator lays out the rooms (their walls go
  // into the collision world a few frames in) and assembles the new mesh over ~3.5 ms/frame
  // slices — the approach walk (target picks ~16 m out) hides it.
  private pump(budget = 3.5) {
    const p = this.pending;
    if (!p) return;
    const t0 = performance.now();
    try {
      let r = p.gen.next();
      while (!r.done && performance.now() - t0 < budget) r = p.gen.next();
      if (!r.done) return;
      this.mesh = r.value;
      this.group.add(this.mesh);
    } catch (e) {
      console.warn('interior build failed', p.fi, e);
      this.failed.add(p.fi);
      this.mesh = null;
      this.pending = null;
      this.activate(null); // restore terrain cut + door/active uniforms, drop its walls
      return;
    }
    this.pending = null;
  }

  // Drain any pending build right now — shots capture after the 0.2 s target loop and must
  // not fire while the interior is still assembling.
  flush() { while (this.pending) this.pump(Infinity); }

  private drop() {
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
    if (this.scoped) { this.walk.removeScope(SCOPE, true); this.scoped = false; }
    if (this.roomTex) { this.roomTex.map.dispose(); this.roomTex.pal.dispose(); this.roomTex = null; }
    this.roomMapU.value = null;
    this.roomPalU.value = null;
    this.inst?.release();
    this.inst = null;
    this.layout = null;
  }

  private activate(fi: string | null, sync = false) {
    this.drop();
    this.pending = null;
    this.active = fi;
    this.lights = [];
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
    try {
      if (sync) {
        const g = this.steps(P, fp);
        let r = g.next();
        while (!r.done) r = g.next();
        this.mesh = r.value;
        this.group.add(this.mesh);
      } else this.pending = { fi, gen: this.steps(P, fp) };
    } catch (e) {
      console.warn('interior build failed', fi, e);
      this.failed.add(fi);
      this.activate(null);
    }
  }

  /** (the bench and the budget test) The whole activation as the steps the pump runs. */
  buildSteps(P: Plan, fp: Footprint) { return this.steps(P, fp); }

  /** An activation's work, sliced: Stage B a storey at a time, the rooms' walls into the collision
   *  world (never onto the walker: one within reach gets a doorway where they stand), the mesh. */
  private *steps(P: Plan, fp: Footprint): Generator<void, THREE.Object3D, void> {
    const L = yield* layoutSteps(P, fp);
    yield;
    this.scoped = true;
    for (let i = 0; i < L.walls.length; i += 400) {
      const part = { ...L, walls: L.walls.slice(i, i + 400) };
      this.walk.withScope(SCOPE, () => registerLayout(this.walk, P, part, this.at));
      yield;
    }
    this.layout = L;
    return yield* this.buildGen(P, fp, L);
  }

  private *buildGen(P: Plan, fp: Footprint, L: Layout): Generator<void, THREE.Object3D, void> {
    const rng = makeRng(Math.floor(fp.seed * 1e9) ^ 0x1234);
    const m = new Mesher(16384);
    const kind = KIND[fp.kind as keyof typeof KIND] ?? 0;
    m.setInfo(fp.id, kind, fp.floor0 - fp.base);
    const d = new Draw(P, m);
    const inst = new Instancer(P);
    this.inst = inst;
    const ring = fp.ring;
    const s = ringSign(ring);
    const f0 = P.floor0, fH = P.floorH, top = P.ceilTop;
    const fl = (k: number) => f0 + k * fH;
    const ceil = (k: number) => (k === P.levels - 1 ? top : fl(k + 1) - 0.02);
    this.frameU.value.set(P.cx, P.cz, P.ux, P.uz);
    this.dimsU.value.set(P.L / 2, P.W / 2);
    this.levelsU.value.set(f0, P.levels > 1 ? fH : top - f0, P.door.wx, P.door.wz);
    this.doorU.value.set(P.door.y, P.door.w / 2, P.door.h, 0);
    this.fabU.value.set(FABRIC[Math.floor(rng.float() * FABRIC.length)]);

    // Walls: inner faces of the facade, inset a little; window panes are cut out in the shader.
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const ox = (dz / len) * s, oz = (-dx / len) * s;
      const ins = 0.14;
      const a = [p[0] - ox * ins, p[1] - oz * ins], b = [q[0] - ox * ins, q[1] - oz * ins];
      m.setOut(ox, oz);
      m.part(IP.wall).color(0xffffff);
      const y0 = f0 - 0.02, y1 = top, eave = fp.eave, base = fp.base;
      m.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [-ox, 0, -oz],
        [[0, y0 - base, len, eave], [len, y0 - base, len, eave], [len, y1 - base, len, eave], [0, y1 - base, len, eave]]);
    }
    m.setOut(0, 0);
    yield; // facade shell done

    // Floors and ceilings for each storey, with the stairwell openings cut out.
    const holeRing = (r: Rect) => [toW(P, r.u0, r.v0), toW(P, r.u1, r.v0), toW(P, r.u1, r.v1), toW(P, r.u0, r.v1)] as P2[];
    const ringFlat = (y: number, up: boolean, holes: P2[][], part: number) => {
      let idx: number[][];
      try {
        idx = THREE.ShapeUtils.triangulateShape(ring.map((r) => new THREE.Vector2(r[0], r[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
      } catch { idx = THREE.ShapeUtils.triangulateShape(ring.map((r) => new THREE.Vector2(r[0], r[1])), []); holes = []; }
      const pts = [...ring, ...holes.flat()];
      m.part(part).color(0xffffff);
      const n = [0, up ? 1 : -1, 0];
      for (const [i0, i1, i2] of idx) m.tri([pts[i0][0], y, pts[i0][1]], [pts[i1][0], y, pts[i1][1]], [pts[i2][0], y, pts[i2][1]], n);
    };
    for (let k = 0; k < P.levels; k++) {
      ringFlat(fl(k) + 0.01, true, P.holes.filter((H) => H.level === k).map(holeRing), IP.floor);
      ringFlat(ceil(k), false, P.holes.filter((H) => H.level === k + 1).map(holeRing), IP.ceil);
      yield; // one storey of slab + ceiling
    }

    // Stairs: treads, risers, strings, rails; a runner on the treads now and then.
    const treadC = WOOD[Math.floor(rng.float() * WOOD.length)];
    drawStairs(d, P, treadC, rng.float() < 0.45 ? FABRIC[Math.floor(rng.float() * FABRIC.length)] : null);
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

    // ---- the front door, standing open inward ----
    {
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

    // The room map: each room's wall paint and floor, looked up per pixel.
    const rm = yield* roomMapGen(P, L, () => rng.float());
    this.roomTex = rm;
    this.roomMapU.value = rm.map;
    this.roomPalU.value = rm.pal;
    this.roomInfoU.value.copy(rm.info);
    this.roomDimU.value.copy(rm.dim);
    yield;

    // Furniture, room by room (a vast building stops short of the vertex budget: the rooms past it
    // stay bare)
    const F = new Furnisher(P, fp, L, m, inst, rng, leaves, ceil);
    for (const R of L.rooms) {
      if (m.n + inst.uniqueVerts() > FURNISH_MAX) break;
      yield* furnishRoom(F, R);
      yield; // one room's furniture done
    }

    // Assemble: the merged mesh, one InstancedMesh per repeated piece; then the residents.
    const group = new THREE.Group();
    const { meshes, verts } = yield* inst.finishGen(m, this.mat, MAX_INSTANCED);
    yield;
    const main = m.geometries();
    for (const g of main) group.add(new THREE.Mesh(g, this.mat));
    for (const im of meshes) group.add(im);
    const npcSpots = F.npcs;
    const busy = fp.kind === 'commercial' || fp.kind === 'church';
    const n = Math.min(NPC_MAX, npcSpots.length, busy ? 2 + Math.floor(rng.float() * 6) : 1 + Math.floor(rng.float() * 3));
    let npcDraws = 0;
    if (n > 0) {
      const SH = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0xf2efe6, 0x3f6f78];
      const stand: [THREE.Matrix4, THREE.Color][] = [], sit: [THREE.Matrix4, THREE.Color][] = [];
      const used = new Set<number>();
      const ang = Math.atan2(P.uz, P.ux);
      const staff = npcSpots.map((sp, k) => (sp[5] ? k : -1)).filter((k) => k >= 0);
      for (let i = 0; i < n; i++) {
        // staff first (a shop is never unattended), then customers / residents at random
        let k = i < staff.length ? staff[i] : Math.floor(rng.float() * npcSpots.length);
        for (let t = 0; t < 8 && used.has(k); t++) k = Math.floor(rng.float() * npcSpots.length);
        if (used.has(k)) continue;
        used.add(k);
        const [u, v, y, yaw, seat] = npcSpots[k];
        const w = toW(P, u, v);
        const col = new THREE.Color(SH[Math.floor(rng.float() * SH.length)]);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + yaw + (seat ? rng.range(-0.15, 0.15) : rng.range(-0.4, 0.4)));
        // seated: the pose puts the hips 0.45 m up — raise it to the seat (a bar stool is 0.76)
        if (seat) sit.push([new THREE.Matrix4().compose(new THREE.Vector3(w[0], y + seat - 0.45, w[1]), q, new THREE.Vector3(1, 1, 1)), col]);
        else {
          stand.push([new THREE.Matrix4().compose(new THREE.Vector3(w[0], y, w[1]), q, new THREE.Vector3(1, 1, 1)), col]);
          // a standing resident at home often has company: a second person a step away facing
          // them (chatting) — or, when that's the counter, alongside them (cooking together)
          if (!busy && i === 0 && rng.float() < 0.5) {
            const level = Math.round((y - f0) / Math.max(0.1, fH));
            const fu = -Math.sin(yaw), fv = -Math.cos(yaw); // this resident's facing in u/v
            for (const [du, dv, turn] of [[fu * 1.05, fv * 1.05, Math.PI], [-fv * 0.65, fu * 0.65, 0], [fv * 0.65, -fu * 0.65, 0]] as const) {
              const u2 = u + du, v2 = v + dv;
              if (!F.freeAt(level, { u0: u2 - 0.22, u1: u2 + 0.22, v0: v2 - 0.22, v1: v2 + 0.22 })) continue;
              const w2 = toW(P, u2, v2);
              const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + yaw + turn + rng.range(-0.2, 0.2));
              stand.push([new THREE.Matrix4().compose(new THREE.Vector3(w2[0], y, w2[1]), q2, new THREE.Vector3(1, 1, 1)), new THREE.Color(SH[Math.floor(rng.float() * SH.length)])]);
              break;
            }
          }
        }
      }
      for (const [list, mt] of [[stand, this.npcMat], [sit, this.npcSeatMat]] as const) {
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(this.npcGeo, mt, Math.min(NPC_MAX, list.length));
        list.slice(0, NPC_MAX).forEach(([m4, c], i) => { im.setMatrixAt(i, m4); im.setColorAt(i, c); });
        im.frustumCulled = false;
        group.add(im);
        npcDraws++;
      }
    }
    this.lights = F.lights;
    this.lastStats = { verts: m.n + verts, draws: main.length + meshes.length + npcDraws, instances: meshes.reduce((a, im) => a + im.count, 0), texels: rm.texels, rooms: L.rooms.length };
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
        float lvl = clamp(floor((vWorldPos.y - f0 + 0.015) / fH), 0.0, uRoomDim.y - 1.0);
        ivec2 tc = ivec2(int(clamp(floor((pr.x - uRoomInfo.x) * uRoomInfo.z), 0.0, uRoomDim.x - 1.0)), int(clamp(floor((pr.y - uRoomInfo.y) * uRoomInfo.z), 0.0, uRoomInfo.w - 1.0) + lvl * uRoomInfo.w));
        int ri = int(texelFetch(uRoomMap, tc, 0).r * 255.0 + 0.5);
        vec4 RA = texelFetch(uRoomPal, ivec2(ri, 0), 0), RB = texelFetch(uRoomPal, ivec2(ri, 1), 0);
        if (part < 0.5 || (part > 5.5 && part < 6.5)) {
          alb = RA.rgb;
          float style = RA.w;
          if (part < 0.5) {
            vec3 NO = normalize(vec3(vOut.x, 0.0, vOut.y));
            Win W = windowAt(vWall.x, vWall.y, vWall.z, vWall.w, seedOf(vInfo.x), vInfo.y, vInfo.w, NO);
            if (W.ok) {
              float inner = step(abs(W.cu), W.ww * 0.5 - 0.08) * step(abs(W.cy), W.wh * 0.5 - 0.08) * archIn(W, W.cu, W.cy, 0.08);
              if (inner > 0.5) discard;
              float frame = step(abs(W.cu), W.ww * 0.5 + 0.04) * step(abs(W.cy), W.wh * 0.5 + 0.06);
              // curtains + a valance, pulled to the sides
              if (!W.store && vInfo.y < 3.5) {
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
