import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as THREE from 'three';
import { WalkWorld, floorAt } from '../src/player/collision';
import { Interiors, planInterior, registerPlan, unstack } from '../src/world/interiors';
import { layoutInterior, registerLayout } from '../src/world/interior/layout';
import { toW, mainAt, liftCars, type Plan, type Lift } from '../src/world/interior/plan';
import { LiftRide, type Rider } from '../src/player/lift';
import { floorHeight, GLSL_WINDOWS, buildingMaterial, type Footprint, type Door } from '../src/world/buildings';
import { Terrain, TerrainLayer, type Building } from '../src/world/data';
import { buildTile } from '../src/world/tileBuild';
import { rect, fpOf, doorN, terrain, flood, nobodys, wallsOnWindows, wallsOnWindows2 } from './helpers/interiorCheck';
// @ts-expect-error plain js lib
import { packToBin } from '../scripts/lib/tiles.mjs';

// (a 39-storey tower's plans take 5–6 s on a slow machine — past vitest's 5 s default, not a failure)
vi.setConfig({ testTimeout: 30000 });

// Slice 3 of docs/INTERIORS_PLAN.md — towers: every storey of a tall building exists, a lobby at the
// ground and a core whose lifts and stair rise through all of them; you ride a lift to any storey
// or climb the stairs, and only the storeys round you are built.

const TOWER = (): Footprint => fpOf(rect(40, 40), 'commercial', 150, 'office');
const DOOR = doorN(40, 0.3, 1.8);
/** A 60 × 60 m, 20 m podium with a 30 × 30 m tower standing on it to 150 m. */
const PODIUM = (): Footprint => ({ ...fpOf(rect(60, 60), 'commercial', 20, 'office'), tiers: [{ ring: rect(30, 30), lo: 20.2, top: 150 }] });

const world = () => new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
const f = (P: Plan, k: number) => P.floor0 + k * P.floorH;
const local = (P: Plan, x: number, z: number) => [(x - P.cx) * P.ux + (z - P.cz) * P.uz, (x - P.cx) * P.vx + (z - P.cz) * P.vz];

/** Someone who walks (and rides): where they stand, their feet on whatever the walk world has there. */
class Walkerish implements Rider {
  x = 0; z = 0; yaw = 0; pitch = 0; feet = 0; holdMove = false;
  constructor(private w: WalkWorld) {}
  place(x: number, z: number, yaw = this.yaw, pitch = 0, feet?: number) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = pitch;
    this.feet = this.w.surfaceAt(x, z, feet);
  }
}
/** A tower standing in a walk world with its interior open (the ground floor built): the walker has
 *  come in through the front door and stands in the lift lobby. */
function open(fp = TOWER(), door: Door = DOOR) {
  const w = world();
  const P = planInterior('t', fp, door, 99);
  const pid = registerPlan(w, fp, P);
  const I = new Interiors(w);
  I.register('t', fp, P, pid);
  const r = new Walkerish(w);
  r.place(door.fx, door.fz, 0, 0, door.fy);
  for (let i = 0; i < 400 && !(I.activeLayout && I.built); i++) I.update(r.x, r.z, 0.25, r.feet);
  I.flush();
  const [x, z] = I.liftSpot(P.lifts![0]);
  r.place(x, z, 0, 0, f(P, 0));
  for (let i = 0; i < 3; i++) I.update(r.x, r.z, 0.25, r.feet);
  return { w, P, I, r, pid, ride: new LiftRide(I, w, r) };
}
/** Ride to storey k: the whole ride, frame by frame (30 fps), the interior updating as in play. */
function rideTo(o: ReturnType<typeof open>, k: number) {
  expect(o.ride.go(k)).toBe(true);
  let frames = 0;
  for (; frames < 2000 && o.ride.busy; frames++) {
    o.ride.update(1 / 30);
    o.I.update(o.r.x, o.r.z, 1 / 30, o.r.feet);
  }
  return frames;
}
/** Walk from where you are to (tx, tz) the way the walker does — small steps through the collision
 *  world, the feet on whatever's underfoot, never dropping more than 0.4 m in a step. null: stuck. */
function walkTo(w: WalkWorld, at: [number, number, number], tx: number, tz: number): [number, number, number] | null {
  let [x, z, ft] = at;
  for (let i = 0; i < 400; i++) {
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz);
    if (l < 0.03) return [x, z, ft];
    const s = Math.min(0.1, l);
    const [nx, nz] = w.move(x, z, (dx / l) * s, (dz / l) * s, 0.32, ft);
    if (Math.hypot(nx - x, nz - z) < 1e-4) return null;
    const t = w.surfaceAt(nx, nz, ft);
    if (t < ft - 0.4) return null;
    [x, z, ft] = [nx, nz, t];
  }
  return null;
}

describe('a 40 × 40 m, 150 m tower', () => {
  it('has all 39 storeys, a lobby at the ground and a core — lifts and a stair — rising through every one', () => {
    const { P, w, pid } = open();
    expect(P.levels).toBe(39);
    expect(P.n).toBe(39);
    expect(P.tall).toBe(1);
    expect(P.arch).toBe('office');
    // the lifts: a bank of cars in the core
    expect(P.lifts?.length).toBe(1);
    expect(P.lifts![0].cars).toBeGreaterThanOrEqual(2);
    // the lobby at the front door, and the lift lobby off it
    const L = layoutInterior(P, TOWER(), [0, 1]);
    const [du, dv] = local(P, DOOR.wx, DOOR.wz);
    const lobby = L.rooms.find((r) => r.level === 0 && r.type === 'lobby')!;
    expect(lobby).toBeTruthy();
    expect(du + 0.3).toBeGreaterThan(lobby.r.u0 - 0.01);
    expect(dv).toBeGreaterThan(lobby.r.v0);
    expect(dv).toBeLessThan(lobby.r.v1);
    expect(L.rooms.some((r) => r.level === 0 && r.type === 'lift')).toBe(true);
    // the shafts: no floor in the lift's or the stair's on any storey above the ground (and
    // floor all round them), the lift's walled all round
    const fl = w.floorsOf(pid)!;
    expect(fl.shafts?.length).toBe(2);
    for (const s of fl.shafts!) expect([s.from, s.to]).toEqual([1, 38]);
    const Lf = P.lifts![0];
    const [sx, sz] = toW(P, (Lf.r.u0 + Lf.r.u1) / 2, (Lf.r.v0 + Lf.r.v1) / 2);
    const st = unstack(P, 23, 23).holes.find((h) => h.level === 24)!;
    const [hx, hz] = toW(P, (st.u0 + st.u1) / 2, (st.v0 + st.v1) / 2);
    const [lx, lz] = toW(P, (Lf.lobby.u0 + Lf.lobby.u1) / 2, (Lf.lobby.v0 + Lf.lobby.v1) / 2);
    for (const k of [1, 23, 38]) {
      expect(floorAt(fl, k, sx, sz)).toBe(false);
      expect(floorAt(fl, k, hx, hz)).toBe(false);
      expect(floorAt(fl, k, lx, lz)).toBe(true);
    }
    expect(floorAt(fl, 0, sx, sz)).toBe(true); // (the pit)
    expect(w.surfaceAt(lx, lz, f(P, 23))).toBeCloseTo(f(P, 23), 5);
    // in at the front door, across the lobby, into the lift lobby — on foot
    const bw = world();
    registerPlan(bw, TOWER(), P);
    registerLayout(bw, unstack(P, 0, 1), L);
    const { reached } = flood({ fp: TOWER(), P: unstack(P, 0, 1), L, w: bw }, 0.5, undefined, [f(P, 0) - 0.3, f(P, 0) + 0.3]);
    expect(L.rooms.filter((r) => r.level === 0 && (r.type === 'lift' || r.type === 'lobby') && !reached.has(r.id)).map((r) => r.type)).toEqual([]);
  });

  it('has a double-height lobby: no storey-1 floor over it, a rail round the void up there, the rooms of storey 1 all reachable', () => {
    const o = open();
    const { P, w, pid } = o;
    const A = P.atrium!;
    expect(A).toBeTruthy();
    // the lobby hole: storey 1 only, over the entrance lobby from the door's wall to a gallery along the core
    expect(P.holes.filter((h) => h.level === 1 && !h.rep)).toEqual([{ ...A, level: 1 }]);
    const [du, dv] = local(P, DOOR.wx, DOOR.wz);
    expect(A.u0).toBeCloseTo(du, 1);
    expect(dv).toBeGreaterThan(A.v0);
    expect(dv).toBeLessThan(A.v1);
    expect(P.core!.u0 - A.u1).toBeCloseTo(1.6, 5);
    expect((A.u1 - A.u0) * (A.v1 - A.v0)).toBeGreaterThan(150);
    const fl = w.floorsOf(pid)!;
    const [ax, az] = toW(P, (A.u0 + A.u1) / 2, (A.v0 + A.v1) / 2);
    expect(floorAt(fl, 0, ax, az)).toBe(true);
    expect(floorAt(fl, 1, ax, az)).toBe(false);
    expect(floorAt(fl, 2, ax, az)).toBe(true);
    // on storey 1 (built round storey 1), walking at the void stops at its rail, feet still on storey 1 —
    // from the gallery (the lift lobby's end) and from the open plan beside it
    rideTo(o, 1);
    expect(o.I.built).toEqual([0, 2]);
    for (const [from, to] of [[[P.core!.u0 - 0.8, (P.lifts![0].lobby.v0 + P.lifts![0].lobby.v1) / 2], [A.u0 + 2, (A.v0 + A.v1) / 2]], [[(A.u0 + A.u1) / 2, A.v1 + 3], [(A.u0 + A.u1) / 2, A.v0 + 2]]] as const) {
      const [x0, z0] = toW(P, from[0], from[1]), [x1, z1] = toW(P, to[0], to[1]);
      let [x, z, ft] = [x0, z0, w.surfaceAt(x0, z0, f(P, 1))];
      expect(ft).toBeCloseTo(f(P, 1), 5);
      for (let i = 0; i < 200; i++) {
        const dx = x1 - x, dz = z1 - z, l = Math.hypot(dx, dz);
        if (l < 0.05) break;
        [x, z] = w.move(x, z, (dx / l) * 0.1, (dz / l) * 0.1, 0.32, ft);
        ft = w.surfaceAt(x, z, ft);
      }
      const [u, v] = local(P, x, z);
      expect(u > A.u0 + 0.1 && u < A.u1 - 0.1 && v > A.v0 + 0.1 && v < A.v1 - 0.1).toBe(false);
      expect(ft).toBeCloseTo(f(P, 1), 5);
    }
    // storey 1's rooms: the void is nobody's (no desks, no meeting room by its rail), the rest reachable
    const L = o.I.activeLayout!;
    const v = L.rooms.filter((r) => r.level === 1 && r.type === 'void');
    expect(v.map((r) => r.r)).toEqual([A]);
    const g = { u0: A.u0 - 0.9, u1: A.u1 + 0.9, v0: A.v0 - 0.9, v1: A.v1 + 0.9 };
    expect(L.desks.filter((q) => q.level === 1 && q.u > g.u0 && q.u < g.u1 && q.v > g.v0 && q.v < g.v1)).toEqual([]);
    expect(L.desks.filter((q) => q.level === 1).length).toBeGreaterThan(40);
    const Lf = P.lifts![0];
    const [lx, lz] = toW(P, (Lf.lobby.u0 + Lf.lobby.u1) / 2, (Lf.lobby.v0 + Lf.lobby.v1) / 2);
    const { reached, pts } = flood({ fp: TOWER(), P: unstack(P, 0, 2), L, w }, 0.5, [lx, lz, f(P, 1)], [f(P, 1) - 0.3, f(P, 1) + 0.3]);
    expect(L.rooms.filter((r) => r.level === 1 && !nobodys(r) && !reached.has(r.id)).map((r) => r.type)).toEqual([]);
    // (and nowhere the flood went is over the void on storey 1)
    expect(pts.filter(([x, z, ft]) => Math.abs(ft - f(P, 1)) < 0.3 && ((u, vv) => u > A.u0 + 0.05 && u < A.u1 - 0.05 && vv > A.v0 + 0.05 && vv < A.v1 - 0.05)(...(local(P, x, z) as [number, number])))).toEqual([]);
  });

  it("is planned small (Stage A ≤ 2 KB: the stair one stacked storey) and the same every time", () => {
    const P = planInterior('t', TOWER(), DOOR, 99);
    expect(JSON.stringify(P).length).toBeLessThanOrEqual(2048);
    expect(P.flights.every((F) => F.rep === 37)).toBe(true);
    expect(planInterior('t', TOWER(), DOOR, 99)).toEqual(P);
  });

  it('lift 0 → 23: the feet land at floor0 + 23 × fH, out of the car in its lift lobby, the storeys round 23 built, nothing shutting you in', () => {
    const o = open();
    const { P, I, r, w, ride } = o;
    expect(I.built).toEqual([0, 1]);
    const at = I.liftAt(r.x, r.z, r.feet)!;
    expect(at.storey).toBe(0);
    expect(at.n).toBe(39);
    const car = I.carNear(at.lift, r.x, r.z), sp = I.carSpot(at.lift, car);
    const frames = rideTo(o, 23);
    expect(ride.phase).toBe('idle');
    expect(frames).toBeLessThan(300); // (doors, in, doors, the ride, doors, out: ~7 s)
    expect(r.feet).toBeCloseTo(P.floor0 + 23 * P.floorH, 6);
    // stepped out 1.3 m in front of the car's doors, facing out
    expect(Math.hypot(r.x - (sp.door[0] + sp.out[0] * 1.3), r.z - (sp.door[1] + sp.out[1] * 1.3))).toBeLessThan(1e-6);
    expect(Math.abs(Math.atan2(-sp.out[0], -sp.out[1]) - r.yaw) % (2 * Math.PI)).toBeLessThan(1e-6);
    expect(I.built).toEqual([22, 24]);
    expect(I.lastStats.storeys).toBe(3);
    expect(w.touching(r.x, r.z, 0.28, r.feet)).toBe(false);
    expect(I.roomName(r.x, r.z, r.feet)).toBe('elevator lobby');
    expect(I.liftAt(r.x, r.z, r.feet)?.storey).toBe(23);
    expect(r.holdMove).toBe(false);
    // and back down to the lobby
    rideTo(o, 0);
    expect(r.feet).toBeCloseTo(P.floor0, 6);
    expect(I.built).toEqual([0, 1]);
  });

  it('the ride is a real one: the doors slide open, you step into the car and turn round, they shut, the car carries you (its floor under you), they open on the storey you chose', () => {
    const o = open();
    const { P, I, r, w, ride } = o;
    const L = P.lifts![0], car = I.carNear(L, r.x, r.z), sp = I.carSpot(L, car);
    const leaves = () => Array.from((I.group.getObjectByName('interior:liftLeaf') as THREE.InstancedMesh).instanceMatrix.array);
    const shut0 = leaves();
    const inShaft = () => { const [u, v] = local(P, r.x, r.z); return u > L.r.u0 && u < L.r.u1 && v > L.r.v0 && v < L.r.v1; };
    const carShown = () => !!I.group.getObjectByName('liftCar');
    expect(ride.go(23)).toBe(true);
    const seen = new Set<string>();
    let rodeIn = false, opened = false, shutForRide = false, lookedOut = false;
    for (let i = 0; i < 400 && ride.busy; i++) {
      ride.update(1 / 30);
      // (the doors shut behind you before it goes — checked before the building re-centres on you)
      if (ride.phase === 'ride' && !rodeIn) shutForRide = leaves().every((x, j) => Math.abs(x - shut0[j]) < 1e-4);
      I.update(r.x, r.z, 1 / 30, r.feet);
      seen.add(ride.phase);
      if (ride.phase === 'board') {
        // (nothing may "settle" you out of the shaft's wall as you step through it: main.ts)
        expect(I.riding).toBe(true);
        // the car's doors are open: two leaves slid half a metre into the wall either side
        const now = leaves();
        opened ||= now.some((x, j) => Math.abs(x - shut0[j]) > 0.5);
        expect(carShown()).toBe(true);
      }
      if (ride.phase === 'ride') {
        // shut in the car, on its floor in the shaft, on the storey you're going to
        expect(inShaft()).toBe(true);
        expect(r.feet).toBeGreaterThan(f(P, 23) - 0.001);
        expect(w.surfaceAt(r.x, r.z, r.feet)).toBeCloseTo(f(P, 23) + 0.01, 3);
        expect(r.holdMove).toBe(true);
        rodeIn = true;
        // (facing out of the car: you turned round as you stepped in)
        lookedOut ||= Math.hypot(-Math.sin(r.yaw) - sp.out[0], -Math.cos(r.yaw) - sp.out[1]) < 1e-3;
      }
    }
    expect([...seen]).toEqual(['open', 'board', 'close', 'ride', 'arrive', 'alight', 'shut', 'idle']);
    expect(opened).toBe(true);
    expect(rodeIn && shutForRide && lookedOut).toBe(true);
    // done: out of the car, the car gone (and its floor), the doors shut behind you
    expect(I.riding).toBe(false);
    expect(inShaft()).toBe(false);
    expect(carShown()).toBe(false);
    const [cx, cz] = sp.inside;
    expect(w.surfaceAt(cx, cz, f(P, 23) + 0.5)).toBeLessThan(f(P, 23) - 1);
  });

  it('a ride you are taken away from (a teleport) just ends, leaving you where you went', () => {
    const o = open();
    const { I, r, ride } = o;
    expect(ride.go(12)).toBe(true);
    for (let i = 0; i < 30 && ride.phase !== 'board'; i++) { ride.update(1 / 30); I.update(r.x, r.z, 1 / 30, r.feet); }
    r.place(300, 300, 0, 0, 0.5);
    ride.update(1 / 30);
    expect(ride.phase).toBe('idle');
    expect([r.x, r.z]).toEqual([300, 300]);
    expect(r.holdMove).toBe(false);
    expect(I.riding).toBe(false);
  });

  it('a ride the building goes from under ends on a floor, free to walk', () => {
    const o = open();
    const { P, I, r, w, ride } = o;
    expect(ride.go(12)).toBe(true);
    for (let i = 0; i < 400 && ride.phase !== 'ride'; i++) { ride.update(1 / 30); I.update(r.x, r.z, 1 / 30, r.feet); }
    expect(ride.phase).toBe('ride');
    I.unregister(['t']); // (the tile went: its interior with it)
    ride.update(1 / 30);
    expect(ride.phase).toBe('idle');
    expect(r.holdMove).toBe(false);
    expect(r.feet).toBeCloseTo(f(P, 12), 5);
    expect(w.touching(r.x, r.z, 0.28, r.feet)).toBe(false);
    const [u, v] = local(P, r.x, r.z), L = P.lifts![0];
    expect(u > L.r.u0 && u < L.r.u1 && v > L.r.v0 && v < L.r.v1).toBe(false);
  });

  it('builds ≤ 3 storeys at a time: ≤ 120k vertices, ≤ 60 draws, whichever storey you ride to', () => {
    const o = open();
    for (const k of [23, 38, 12]) {
      rideTo(o, k);
      const { I } = o;
      const st = I.lastStats;
      expect(st.storeys).toBeLessThanOrEqual(3);
      expect(st.verts).toBeLessThanOrEqual(120000);
      expect(st.draws).toBeLessThanOrEqual(60);
      const levels = new Set(I.activeLayout!.rooms.map((r) => r.level));
      expect(levels.size).toBeLessThanOrEqual(3);
      for (const lv of levels) expect(Math.abs(lv - k)).toBeLessThanOrEqual(1);
    }
  });

  it("you can't step (or fall) into a lift's shaft", () => {
    const o = open();
    rideTo(o, 23);
    const { P, w, r } = o;
    const L: Lift = P.lifts![0];
    // walk at the doors, and past them: stopped at the shaft's wall, still on storey 23
    const [sx, sz] = toW(P, (L.r.u0 + L.r.u1) / 2, (L.r.v0 + L.r.v1) / 2);
    let [x, z, ft] = [r.x, r.z, r.feet];
    for (let i = 0; i < 80; i++) {
      const dx = sx - x, dz = sz - z, l = Math.hypot(dx, dz);
      [x, z] = w.move(x, z, (dx / l) * 0.1, (dz / l) * 0.1, 0.32, ft);
      ft = w.surfaceAt(x, z, ft);
    }
    const [u, v] = local(P, x, z);
    expect(u > L.r.u0 && u < L.r.u1 && v > L.r.v0 && v < L.r.v1).toBe(false);
    expect(ft).toBeCloseTo(f(P, 23), 5);
    // (though the shaft's wall has an opening for each car's doors — the car shows through them
    // on a ride — the shaft's own walls in the collision world keep it shut)
    const c = liftCars(L);
    const gaps = o.I.activeLayout!.walls.filter((q) => q.level === 23 && q.ax === c.row && Math.abs(q.c - c.fc) < 0.03).flatMap((q) => q.gaps);
    expect(gaps.map(([a, b]) => [+((a + b) / 2).toFixed(3), +(b - a).toFixed(3)])).toEqual(c.along.map((t) => [+t.toFixed(3), 1.1]));
  });

  it('the stair from storey 23 to 24 is walkable: up flight a, across the half landing, up flight b', () => {
    const o = open();
    rideTo(o, 23);
    const { P, w, r } = o;
    const U = unstack(P, 23, 23);
    const a = U.flights.find((F) => F.level === 23 && !F.lo)!, b = U.flights.find((F) => F.level === 23 && F.lo)!;
    const ax = a.axis ? 1 : 0, dir = Math.sign(a.topU - a.bottomU);
    const W = (along: number, across: number) => (ax ? toW(P, across, along) : toW(P, along, across));
    const ca = ax ? (a.u0 + a.u1) / 2 : (a.v0 + a.v1) / 2, cb = ax ? (b.u0 + b.u1) / 2 : (b.v0 + b.v1) / 2;
    // from the lift lobby to the foot of flight a, then the stair
    const route = [W(a.bottomU - dir * 0.6, ca), W(a.topU + dir * 0.35, ca), W(a.topU + dir * 0.35, cb), W(b.topU - dir * 0.6, cb)];
    let at: [number, number, number] | null = [r.x, r.z, r.feet];
    const feet: number[] = [];
    for (const [tx, tz] of route) {
      at = walkTo(w, at!, tx, tz);
      expect(at).not.toBeNull();
      feet.push(at![2]);
    }
    expect(feet[0]).toBeCloseTo(f(P, 23), 5);
    expect(feet[1]).toBeCloseTo(f(P, 23) + (a.hi ?? 1) * P.floorH, 1); // (the half landing)
    expect(feet[3]).toBeCloseTo(f(P, 24), 5);
    // the build window follows you up: storey 24 is the middle of it once you're there
    o.I.update(at![0], at![1], 0.25, at![2]);
    o.I.flush();
    expect(o.I.built).toEqual([23, 25]);
    expect(w.touching(at![0], at![1], 0.28, at![2])).toBe(false);
  });

  it('a storey is laid out the same whichever window builds it', () => {
    const P = planInterior('t', TOWER(), DOOR, 99);
    const a = layoutInterior(P, TOWER(), [22, 24]), b = layoutInterior(P, TOWER(), [23, 25]);
    const at = (L: typeof a, k: number) => ({
      rooms: L.rooms.filter((r) => r.level === k).map((r) => [r.type, r.r]),
      walls: L.walls.filter((q) => q.level === k).map((q) => [q.ax, q.c, q.a, q.b, q.gaps]),
      doors: L.doors.filter((q) => q.level === k).map((q) => [q.ax, q.c, q.t, q.w]),
      desks: L.desks.filter((q) => q.level === k),
    });
    for (const k of [23, 24]) expect(at(a, k)).toEqual(at(b, k));
  });
});

describe('a storey is the same whichever window builds it', () => {
  it('its paint, its furniture and its people: storeys 23 and 24 built round 23 and round 24', () => {
    const fp = TOWER(), w = world();
    const P = planInterior('t', fp, DOOR, 99);
    const I = new Interiors(w);
    I.register('t', fp, P, registerPlan(w, fp, P));
    /** Build the window round storey `centre`; what storey k looks like in it. */
    const look = (centre: number, k: number) => {
      const g = I.buildSteps(P, fp, centre);
      let r = g.next();
      while (!r.done) r = g.next();
      const map = I.roomMapU.value as THREE.DataTexture, pal = (I.roomPalU.value as THREE.DataTexture).image.data as Float32Array;
      const info = I.roomInfoU.value, dim = I.roomDimU.value;
      const px = map.image.data as Uint8Array;
      // each room's wall and floor paint, from the room map at its middle
      const paint = I.activeLayout!.rooms.filter((q) => q.level === k && q.type !== 'shaft').map((q) => {
        const i = Math.floor(((q.r.u0 + q.r.u1) / 2 - info.x) * info.z), j = Math.floor(((q.r.v0 + q.r.v1) / 2 - info.y) * info.z) + (k - dim.z) * info.w;
        const pi = px[j * dim.x + i];
        return `${q.type} ${[...pal.slice(pi * 4, pi * 4 + 4), ...pal.slice((256 + pi) * 4, (256 + pi) * 4 + 4)].map((x) => x.toFixed(4)).join(',')}`;
      });
      // the residents on that storey
      const folk: string[] = [];
      const m4 = new THREE.Matrix4(), c = new THREE.Color();
      r.value.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (!im.isInstancedMesh || !im.geometry.getAttribute('aAnim')) return;
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m4);
          im.getColorAt(i, c);
          const e = m4.elements;
          if (Math.round((e[13] - P.floor0) / P.floorH) === k) folk.push([e[12], e[13], e[14], e[0], e[2], c.r, c.g, c.b].map((x) => x.toFixed(3)).join(','));
        }
      });
      return { paint, pieces: I.piecesOn(k), folk: folk.sort() };
    };
    for (const k of [23, 24]) {
      const a = look(23, k), b = look(24, k);
      expect(I.built).toEqual([23, 25]);
      expect(a.paint.length).toBeGreaterThan(5);
      expect(a.pieces.length).toBeGreaterThan(100);
      expect(b.paint).toEqual(a.paint);
      expect(b.pieces).toEqual(a.pieces);
      expect(b.folk).toEqual(a.folk);
    }
  });
});

describe('a tower on a podium', () => {
  it('a 60 × 60 m, 20 m podium: storey 10 stands inside the tower, with no floor outside it', () => {
    const fp = PODIUM();
    const w = world();
    const P = planInterior('p', fp, doorN(60, 0.3, 1.8), 99);
    registerPlan(w, fp, P);
    expect(P.levels).toBe(39);
    expect(P.plates?.map((p) => p.from)).toEqual([5]);
    // inside the tower's outline (clear of its core) and outside it, over the podium
    const inT: [number, number] = [12, 12], outT: [number, number] = [-24, 20];
    expect(w.surfaceAt(...inT, f(P, 10))).toBeCloseTo(f(P, 10), 5);
    expect(w.surfaceAt(...outT, f(P, 10))).toBeCloseTo(f(P, 4), 5); // (the podium's top storey, under its roof)
    expect(w.surfaceAt(...outT, f(P, 3))).toBeCloseTo(f(P, 3), 5); // (the podium's own storeys: all of it)
    // walking out of the tower on storey 10 you meet its wall, not the air over the podium roof
    const end = walkTo(w, [12, 12, f(P, 10)], 26, 12);
    expect(end).toBeNull();
    let [x, z] = [12, 12];
    for (let i = 0; i < 200; i++) [x, z] = w.move(x, z, 0.1, 0, 0.32, f(P, 10));
    expect(x).toBeLessThan(15);
    // and its rooms fill the tower's plate
    const L = layoutInterior(P, fp, [9, 11]);
    const M = mainAt(P, 10);
    expect(M.u1 - M.u0).toBeLessThan(31);
    for (const r of L.rooms.filter((q) => q.level === 10)) {
      for (const [u, v] of [[r.r.u0, r.r.v0], [r.r.u1, r.r.v1]]) {
        const [px, pz] = toW(P, u, v);
        expect(Math.max(Math.abs(px), Math.abs(pz))).toBeLessThanOrEqual(15.01);
      }
    }
  });
});

// ---------------- through the tile pipeline ----------------
class StubCtx {
  canvas: unknown; fillStyle = ''; strokeStyle = ''; lineWidth = 1; lineCap = ''; lineJoin = ''; globalCompositeOperation = ''; textBaseline = ''; font = '';
  constructor(c: unknown) { this.canvas = c; }
  setTransform() {} beginPath() {} moveTo() {} lineTo() {} stroke() {} fill() {} fillRect() {} fillText() {} drawImage() {}
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(t: string) { return { width: t.length * 8 }; }
  getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}
class StubCanvas {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return new StubCtx(this); }
  transferToImageBitmap() { return { width: this.width, height: this.height, close() {} } as ImageBitmap; }
}
beforeAll(() => { (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas; });
const m = (v: number) => Math.round(v * 10);
const box = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];

describe('a tower through buildTile', () => {
  it('its podium and its tower (mapped as parts) are one walkable footprint whose storeys climb the tower', async () => {
    const L = packToBin({ grid: { x0: 0, z0: 0, cell: 4, w: 64, h: 64 }, height: new Int16Array(4096).fill(120), sdf: new Int16Array(4096).fill(300), cover: new Uint8Array(4096).fill(10), flags: new Uint8Array(4096), oceanD: new Uint8Array(4096).fill(200) });
    const terr = new Terrain(new TerrainLayer(L.buf, L.layout), new TerrainLayer(L.buf, L.layout));
    const b = (r: number[], h: number, extra: Partial<Building> = {}): Building => ({ r, h, k: 'commercial', roof: 'flat', s: 7, ...extra });
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      // a podium and the tower on it, both mapped from the ground (the tower rises from the podium's roof: nest.ts)
      buildings: [b(box(80, 40, 140, 100), 20, { pt: 1 }), b(box(95, 55, 125, 85), 150, { pt: 1 })],
      roads: [{ p: [m(40), m(106), m(200), m(106)], c: 'primary', w: 12, n: 'Test Ave' }],
      areas: [], lines: [], points: [],
    };
    const t = await buildTile(tj as never, terr, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    expect(t.fps).toHaveLength(1);
    const fp = t.fps[0];
    expect(fp.tiers?.length).toBe(1);
    // (the tower stands on the podium's roof, 130 m tall)
    expect(Math.abs(fp.tiers![0].lo - fp.top)).toBeLessThan(0.5);
    expect(fp.tiers![0].top - fp.tiers![0].lo).toBeCloseTo(130, 1);
    const P = t.plans.find((p) => p.i === 0)!.p;
    expect(P.plates?.map((p) => p.from)).toEqual([5]);
    expect(P.levels).toBeGreaterThanOrEqual(38);
    expect(P.lifts?.length).toBe(1);
  });
});

describe('a tall building the room planner does not take (a ragged outline)', () => {
  // a 36 m square 100 m tower, its front straight, its other walls sawtoothed (52 corners): the open
  // plan, its stairs along the walls — and a lift
  const ring: [number, number][] = [[-18, -18], [18, -18]];
  for (let i = 1; i < 16; i++) ring.push([i % 2 ? 17.3 : 18, -18 + i * 2.25]);
  ring.push([18, 18]);
  for (let i = 1; i < 16; i++) ring.push([18 - i * 2.25, i % 2 ? 17.3 : 18]);
  ring.push([-18, 18]);
  for (let i = 1; i < 16; i++) ring.push([i % 2 ? -17.3 : -18, 18 - i * 2.25]);
  const fp = (): Footprint => fpOf(ring, 'commercial', 100, 'office');
  const door = doorN(36, 0.3, 1.8);
  it('still has a lift, off the facade and the stairs, that rides you to any storey', () => {
    const o = open(fp(), door);
    const { P, I, r, w } = o;
    expect(ring.length).toBeGreaterThan(40);
    expect(P.arch).toBe('open');
    expect(P.levels).toBe(26);
    expect(P.lifts?.length).toBe(1);
    const L = P.lifts![0];
    for (const F of P.flights) expect(L.r.u1 <= F.u0 || L.r.u0 >= F.u1 || L.r.v1 <= F.v0 || L.r.v0 >= F.v1).toBe(true);
    // (the walker walked in from the door to the lift lobby: it's on the ground floor's open floor)
    expect(I.liftAt(r.x, r.z, r.feet)?.storey).toBe(0);
    rideTo(o, 12);
    expect(r.feet).toBeCloseTo(f(P, 12), 6);
    expect(I.built).toEqual([11, 13]);
    expect(w.touching(r.x, r.z, 0.28, r.feet)).toBe(false);
    // the lobby is reachable on foot from the front door on the ground floor
    const Ly = layoutInterior(P, fp(), [0, 1]);
    const bw = world();
    registerPlan(bw, fp(), P);
    registerLayout(bw, unstack(P, 0, 1), Ly);
    const { pts } = flood({ fp: fp(), P: unstack(P, 0, 1), L: Ly, w: bw }, 0.5, undefined, [f(P, 0) - 0.3, f(P, 0) + 0.3]);
    const lob = L.lobby;
    expect(pts.some(([x, z, ft]) => { const [u, v] = local(P, x, z); return Math.abs(ft - f(P, 0)) < 0.1 && u > lob.u0 && u < lob.u1 && v > lob.v0 && v < lob.v1; })).toBe(true);
  });
});

describe('tall blocks of flats', () => {
  it('a six-storey slab and a residential tower get a lift beside the stair, its lobby off the corridor, every room of a storey reachable from it', () => {
    for (const [fp, door, k] of [[fpOf(rect(45, 16), 'large', 19.5), doorN(16, 0.3), 3], [fpOf(rect(30, 30), 'large', 90), doorN(30, 0.3), 20]] as const) {
      const P = planInterior('f', fp, door, 99);
      expect(P.tall).toBe(1);
      expect(P.arch).toBe('flats');
      expect(P.lifts?.length).toBeGreaterThanOrEqual(1);
      const w = world();
      registerPlan(w, fp, P);
      const L = layoutInterior(P, fp, [k - 1, k + 1]);
      registerLayout(w, P, L);
      const Lf = P.lifts![0];
      const [x, z] = toW(P, (Lf.lobby.u0 + Lf.lobby.u1) / 2, (Lf.lobby.v0 + Lf.lobby.v1) / 2);
      expect(L.rooms.find((r) => r.level === k && r.type === 'lift')).toBeTruthy();
      const { reached } = flood({ fp, P: unstack(P, k - 1, k + 1), L, w }, 0.5, [x, z, f(P, k)], [f(P, k) - 0.3, f(P, k) + 0.3]);
      expect(L.rooms.filter((r) => r.level === k && !nobodys(r) && !reached.has(r.id)).map((r) => `${r.type}@${r.level}`)).toEqual([]);
    }
  }, 60000);
});

describe('the facade of a curtain-wall tower', () => {
  it('is glazed floor to ceiling inside too: its partitions meet the glass on its mullions', () => {
    const fp: Footprint = { ...fpOf(rect(30, 30), 'large', 90), glass: 1 };
    const P = planInterior('g', fp, doorN(30, 0.3), 99);
    expect(P.glass).toBe(1);
    const L = layoutInterior(P, fp, [9, 11]);
    const w = world();
    registerPlan(w, fp, P);
    const b = { fp, P, L, w };
    expect(wallsOnWindows(b)).toEqual([]);
    expect(wallsOnWindows2(b)).toEqual([]);
    // (party walls between the flats do meet it: on a mullion, 1.5 m apart from the wall's corner)
    let met = 0;
    for (const q of L.walls) for (const end of [q.a, q.b]) {
      const [u, v] = q.ax === 0 ? [end, q.c] : [q.c, end];
      const [x, z] = toW(P, u, v);
      const edge = Math.min(Math.abs(Math.abs(x) - 15), Math.abs(Math.abs(z) - 15));
      if (edge > 0.2) continue;
      met++;
      const along = (Math.abs(Math.abs(x) - 15) < Math.abs(Math.abs(z) - 15) ? z : x) + 15; // (from the edge's corner)
      const m = Math.min(along % 1.5, 1.5 - (along % 1.5));
      expect(m).toBeLessThanOrEqual(0.15);
    }
    expect(met).toBeGreaterThan(4);
  });
  it("draws its slabs where the interior's storeys are: windowAt's fH is the plan's", () => {
    const m = /w\.floorH = shop \? ([\d.]+) : \(kind > 2\.5 && kind < 3\.5 \? ([\d.]+) : church \? [\d.]+ : ([\d.]+)\)/.exec(GLSL_WINDOWS);
    expect(m).toBeTruthy();
    expect(+m![1]).toBe(floorHeight('commercial'));
    expect(+m![2]).toBe(floorHeight('large'));
    expect(+m![3]).toBe(floorHeight('house'));
    const frag = buildingMaterial().fragmentShader;
    expect(/float cfH = W\.floorH/.test(frag)).toBe(true);
    expect(/cfH = 3\.9/.test(frag)).toBe(false);
  });
});
