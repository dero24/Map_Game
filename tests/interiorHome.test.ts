import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WalkWorld } from '../src/player/collision';
import { Interiors, planInterior, registerPlan } from '../src/world/interiors';
import * as D from '../src/assets/decor';
import { DINE_PLACE, DINE_ENDS, placesAlong } from '../src/world/interior/furnish';
import { rect, fpOf, doorN, terrain, toW } from './helpers/interiorCheck';
import { cottageCases, bigHouseCases } from './helpers/homes';
import type { Footprint, Door } from '../src/world/buildings';
import type { Layout, Room } from '../src/world/interior/layout';

// The review's round 11, "the kitchen and the table" (frames 6 and 19): "the kitchen in view is a sink
// run, with no range, fridge or wall cabinets"; "three chairs crowd one side of the table, backs
// touching"; "a WC is in view through the living room's left door". On whole builds of seeded homes.

const world = () => new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
interface Piece { key: string; u: number; v: number; au: number; av: number }
/** A whole build: its plan, its layout and the pieces on storey k (key, place and x axis, local). */
function built(fp: Footprint, door: Door, seed = 99, k = 0) {
  const w = world(), P = planInterior('b', fp, door, seed), I = new Interiors(w);
  I.register('b', fp, P, registerPlan(w, fp, P));
  const g = I.buildSteps(P, fp, 0);
  let r = g.next();
  while (!r.done) r = g.next();
  const at = (s: string): Piece => {
    const [key, x, , z, ax, az] = s.split(' '), wx = +x / 100, wz = +z / 100, ex = +ax / 100, ez = +az / 100;
    return { key, u: (wx - P.cx) * P.ux + (wz - P.cz) * P.uz, v: (wx - P.cx) * P.vx + (wz - P.cz) * P.vz, au: ex * P.ux + ez * P.uz, av: ex * P.vx + ez * P.vz };
  };
  return { P, L: I.activeLayout!, I, w, pieces: I.piecesOn(k).map(at) };
}
const inRoom = (R: Room, p: Piece, m = 0.1) => p.u >= R.r.u0 - m && p.u <= R.r.u1 + m && p.v >= R.r.v0 - m && p.v <= R.r.v1 + m;
/** The homes: 40 seeded cottages, 40 bigger houses, a 12 × 8 m house and a block of flats. */
const homes = (): [string, Footprint, Door, number][] => [
  ...cottageCases().map((c): [string, Footprint, Door, number] => [`cottage ${c.name}`, c.fp, c.door, c.seed]),
  ...bigHouseCases().map((c): [string, Footprint, Door, number] => [`house ${c.name}`, c.fp, c.door, c.seed]),
  ['house 12×8', fpOf(rect(12, 8), 'house', 6.7), doorN(8, -2), 99],
  ['walk-up 18×8', fpOf(rect(18, 8), 'large', 12), doorN(8, 0.5), 99],
];
const cache = new Map<string, ReturnType<typeof built>>();
const get = (name: string, fp: Footprint, door: Door, seed: number) => {
  let b = cache.get(name);
  if (!b) cache.set(name, (b = built(fp, door, seed)));
  return b;
};

describe('a home\'s kitchen (review round 11: "a sink run, with no range, fridge or wall cabinets")', () => {
  it('every kitchen has a cooker under its hood, a fridge and wall cabinets over its run', () => {
    let n = 0, whole = 0;
    const bad: string[] = [];
    for (const [name, fp, door, seed] of homes()) {
      const { L, pieces } = get(name, fp, door, seed);
      // (a kitchen's space: the stair's wet room may cut it in two — one kitchen between them)
      const spaces = new Map<number, Room[]>();
      for (const R of L.rooms) if (R.level === 0 && (R.type === 'kitchen' || R.type === 'great')) spaces.set(R.space, [...(spaces.get(R.space) ?? []), R]);
      for (const rooms of spaces.values()) {
        const R = rooms[0];
        n++;
        const mine = pieces.filter((p) => rooms.some((q) => inRoom(q, p)));
        const run = mine.find((p) => p.key.startsWith('kitchen:'));
        const spec = run ? D.kitchenSpecOf(run.key) : null;
        const range = (spec && spec.range !== null) || mine.some((p) => p.key === 'stove');
        const fridge = (spec && spec.fridge !== 0) || mine.some((p) => p.key.startsWith('fridge'));
        const wallM = spec ? D.wallCabinets(spec, true).reduce((a, [x0, x1]) => a + x1 - x0, 0) : 0;
        if (spec && range && fridge && wallM >= 0.6) whole++;
        else bad.push(`${name} ${R.type}: ${!spec ? 'no run' : ''}${range ? '' : ' no cooker'}${fridge ? '' : ' no fridge'}${wallM >= 0.6 ? '' : ` ${wallM.toFixed(2)} m of wall cabinets`}`);
      }
    }
    expect(n).toBeGreaterThan(80);
    expect(whole / n, bad.join('; ')).toBeGreaterThanOrEqual(0.95);
  }, 120000);
  it("the cooker's hood and the fridge stand on solid wall, never in a window's stretch; the sink under one where the run passes one", () => {
    let under = 0, passes = 0;
    for (const [name, fp, door, seed] of homes()) {
      const { pieces } = get(name, fp, door, seed);
      for (const p of pieces.filter((q) => q.key.startsWith('kitchen:'))) {
        const s = D.kitchenSpecOf(p.key)!;
        const hit = (a: number, b: number) => s.gaps.some(([g0, g1]) => a < g1 && b > g0);
        if (s.range !== null) expect(hit(s.range - D.COOKER_W / 2, s.range + D.COOKER_W / 2), `${name} ${p.key}`).toBe(false);
        if (s.fridge) expect(s.fridge < 0 ? hit(-s.len / 2, -s.len / 2 + D.FRIDGE_W) : hit(s.len / 2 - D.FRIDGE_W, s.len / 2), `${name} ${p.key}`).toBe(false);
        for (const [a, b] of D.wallCabinets(s)) expect(hit(a, b), `${name} ${p.key}`).toBe(false);
        // the sink and the cooker side by side, never one in the other
        if (s.range !== null) expect(Math.abs(s.sink - s.range)).toBeGreaterThanOrEqual(D.COOKER_W / 2 + 0.28 - 1e-6);
        if (s.gaps.length) { passes++; if (hit(s.sink - 0.28, s.sink + 0.28)) under++; }
      }
    }
    if (passes) expect(under / passes).toBeGreaterThanOrEqual(0.6);
  }, 120000);
  it('is the same kitchen every time', () => {
    const [name, fp, door, seed] = homes()[3];
    const a = built(fp, door, seed).pieces.filter((p) => /^(kitchen:|stove|fridge)/.test(p.key));
    expect(a.length).toBeGreaterThan(0);
    expect(get(name, fp, door, seed).pieces.filter((p) => /^(kitchen:|stove|fridge)/.test(p.key))).toEqual(a);
  }, 120000);
});

describe('the dining table (review round 11: "three chairs crowd one side of the table, backs touching")', () => {
  it('seats its chairs at ≥ 0.6 m a place round the table by its size, the ends of a long table where the room allows', () => {
    let tables = 0, long = 0, withEnds = 0;
    const bad: string[] = [];
    for (const [name, fp, door, seed] of homes()) {
      const { pieces } = get(name, fp, door, seed);
      for (const t of pieces.filter((p) => /^table:[\d.]+x[\d.]+x0\.76$/.test(p.key))) {
        const [w, d] = t.key.slice(6).split('x').map(Number);
        const alongU = w >= d, len = Math.max(w, d), dep = Math.min(w, d);
        // its chairs: within reach of its edge
        const ch = pieces.filter((p) => p.key === 'chair' && Math.abs(p.u - t.u) < w / 2 + 0.75 && Math.abs(p.v - t.v) < d / 2 + 0.75);
        const s = (p: Piece) => (alongU ? p.u - t.u : p.v - t.v), q = (p: Piece) => (alongU ? p.v - t.v : p.u - t.u);
        tables++;
        // two sides and the ends
        for (const sd of [-1, 1]) {
          const row = ch.filter((p) => Math.abs(s(p)) < len / 2 && Math.sign(q(p)) === sd).map(s).sort((a, b) => a - b);
          if (row.length > placesAlong(len)) bad.push(`${name}: ${row.length} chairs along a ${len} m side`);
          for (let i = 1; i < row.length; i++) if (row[i] - row[i - 1] < DINE_PLACE - 1e-6) bad.push(`${name}: chairs ${(row[i] - row[i - 1]).toFixed(2)} m apart on a ${len} m table`);
          // (each place's 0.6 m of edge within the table's length)
          for (const x of row) if (Math.abs(x) > len / 2 - DINE_PLACE / 2 + 1e-6) bad.push(`${name}: a chair ${x.toFixed(2)} off the middle of a ${len} m side`);
        }
        const ends = ch.filter((p) => Math.abs(s(p)) >= len / 2);
        for (const p of ends) expect(Math.abs(q(p))).toBeLessThan(dep / 2 - 0.1);
        if (len >= DINE_ENDS) { long++; if (ends.length === 2) withEnds++; }
        else expect(ends.length).toBe(0);
        // nobody's chair in anybody else's: 0.5 m between any two
        for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) if (Math.hypot(ch[i].u - ch[j].u, ch[i].v - ch[j].v) < 0.5) bad.push(`${name}: two chairs ${Math.hypot(ch[i].u - ch[j].u, ch[i].v - ch[j].v).toFixed(2)} m apart`);
      }
    }
    expect(bad).toEqual([]);
    expect(tables).toBeGreaterThan(20);
    // (a long table seats its ends nearly always: the room round it was found for its chairs)
    expect(withEnds / Math.max(1, long)).toBeGreaterThanOrEqual(0.8);
    // a 1.8 m table: two a side, never three
    expect(placesAlong(1.8)).toBe(2);
    expect(placesAlong(1.2)).toBe(2);
    expect(placesAlong(2.1)).toBe(3);
    for (let w = 0.6; w <= 3.0; w += 0.1) expect(w / placesAlong(w)).toBeGreaterThanOrEqual(DINE_PLACE - 1e-6);
  }, 120000);
});

/** The doorways between a WC or a bathroom and a room of the day (the rooms a front door opens on). */
const DAY = new Set(['living', 'great', 'kitchen', 'dining']);
const wetDoors = (L: Layout) => L.doors.filter((d) => {
  const [a, b] = d.rooms.map((i) => L.rooms[i].type);
  return d.w <= 1.15 && (((a === 'wc' || a === 'bath') && DAY.has(b)) || ((b === 'wc' || b === 'bath') && DAY.has(a)));
});
describe('a WC off the living room (review round 11: "a WC is in view through the living room\'s left door")', () => {
  it('its door stands shut, in the doorway, along the wall; every other leaf stands open', () => {
    let n = 0;
    for (const [name, fp, door, seed] of homes().slice(0, 40)) {
      const { L, pieces } = get(name, fp, door, seed);
      for (const d of wetDoors(L).filter((q) => q.level === 0)) {
        n++;
        // the leaf at one of its jambs, its x along the wall (ax 0: the wall runs along u)
        const jamb = (p: Piece) => (d.ax === 0 ? Math.abs(p.v - d.c) < 0.05 && Math.abs(Math.abs(p.u - d.t) - d.w / 2) < 0.05 : Math.abs(p.u - d.c) < 0.05 && Math.abs(Math.abs(p.v - d.t) - d.w / 2) < 0.05);
        const shut = pieces.filter((p) => p.key.startsWith('leafShut:') && jamb(p));
        expect(shut.length, `${name}`).toBe(1);
        const along = d.ax === 0 ? Math.abs(shut[0].au) : Math.abs(shut[0].av);
        expect(along, `${name}`).toBeCloseTo(1, 3);
        // and it closes the doorway: from its hinge toward the doorway's middle
        const toMid = d.ax === 0 ? Math.sign(d.t - shut[0].u) === Math.sign(shut[0].au) : Math.sign(d.t - shut[0].v) === Math.sign(shut[0].av);
        expect(toMid, `${name}`).toBe(true);
        expect(pieces.some((p) => p.key.startsWith('leaf:') && jamb(p)), `${name}`).toBe(false);
      }
      // (the other doors' leaves stand open, as before)
      expect(pieces.filter((p) => p.key.startsWith('leafShut:')).length).toBe(wetDoors(L).filter((q) => q.level === 0).length);
    }
    expect(n).toBeGreaterThan(10);
  }, 120000);
  it('swings open as you come to it, and shuts again behind you', () => {
    // a cottage with such a door: walked into (the build activated as you come to the front door),
    // the walker a step from that doorway, then back by the front door
    for (const [name, fp, door, seed] of homes().slice(0, 40)) {
      if (!wetDoors(get(name, fp, door, seed).L).some((q) => q.level === 0)) continue;
      const w = world(), P = planInterior('b', fp, door, seed), I = new Interiors(w);
      I.register('b', fp, P, registerPlan(w, fp, P));
      for (let f = 0; f < 12; f++) I.update(door.fx, door.fz, 0.25, door.fy);
      I.flush();
      const L = I.activeLayout!, d = wetDoors(L).find((q) => q.level === 0)!;
      const M = new THREE.Matrix4(), pos = new THREE.Vector3();
      /** The leaf's x along the wall: 1 shut, 0 open (the instance at this doorway's jamb). */
      const leaf = () => {
        let out = NaN;
        I.group.traverse((o) => {
          if (!o.name.startsWith('interior:leafShut:')) return;
          const m = o as THREE.InstancedMesh;
          for (let i = 0; i < m.count; i++) {
            m.getMatrixAt(i, M);
            pos.setFromMatrixPosition(M);
            const u = (pos.x - P.cx) * P.ux + (pos.z - P.cz) * P.uz, v = (pos.x - P.cx) * P.vx + (pos.z - P.cz) * P.vz;
            if (Math.hypot(u - (d.ax === 0 ? d.t : d.c), v - (d.ax === 0 ? d.c : d.t)) > d.w / 2 + 0.1) continue;
            const ex = M.elements[0], ez = M.elements[2];
            out = d.ax === 0 ? Math.abs(ex * P.ux + ez * P.uz) : Math.abs(ex * P.vx + ez * P.vz);
          }
        });
        return out;
      };
      const stand = (u: number, v: number) => { const [x, z] = toW(P, u, v); for (let f = 0; f < 30; f++) I.update(x, z, 1 / 30, P.floor0); };
      expect(leaf(), name).toBeCloseTo(1, 3);
      // a step from the doorway, on the room of the day's side
      const day = L.rooms[d.rooms.find((i) => DAY.has(L.rooms[i].type))!];
      const side = d.ax === 0 ? Math.sign((day.r.v0 + day.r.v1) / 2 - d.c) : Math.sign((day.r.u0 + day.r.u1) / 2 - d.c);
      const [su, sv] = d.ax === 0 ? [d.t, d.c + side * 0.9] : [d.c + side * 0.9, d.t];
      expect(w.interiorAt(...toW(P, su, sv), P.floor0)).toBeGreaterThanOrEqual(0);
      stand(su, sv);
      expect(leaf()).toBeLessThan(0.1);
      // across the room from it: it has shut again
      const far = [[day.r.u0 + 0.5, day.r.v0 + 0.5], [day.r.u0 + 0.5, day.r.v1 - 0.5], [day.r.u1 - 0.5, day.r.v0 + 0.5], [day.r.u1 - 0.5, day.r.v1 - 0.5]].sort((p, q2) => Math.hypot(q2[0] - (d.ax === 0 ? d.t : d.c), q2[1] - (d.ax === 0 ? d.c : d.t)) - Math.hypot(p[0] - (d.ax === 0 ? d.t : d.c), p[1] - (d.ax === 0 ? d.c : d.t)))[0];
      stand(far[0], far[1]);
      expect(leaf(), name).toBeCloseTo(1, 3);
      // walking in at the front door past it never opens it: only stepping up to it does
      stand(P.ud + 0.6, P.vd);
      expect(leaf(), name).toBeGreaterThan(0.99);
      return;
    }
    throw new Error('no cottage with a WC off its living room');
  }, 120000);
});
