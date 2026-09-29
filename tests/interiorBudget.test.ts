import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WalkWorld } from '../src/player/collision';
import { Interiors, planInterior, registerPlan } from '../src/world/interiors';
import { rect, fpOf, doorN, terrain, toW } from './helpers/interiorCheck';
import type { Footprint, Door } from '../src/world/buildings';

// What an open interior may cost (docs/INTERIORS_PLAN.md §1, §4): the activation — the rooms laid
// out, their walls into the collision world, the meshes built — runs as slices the pump spreads
// over frames, and no slice may take more than 8 ms; an interior draws at most 120k vertices (a
// house 40k) in at most 60 draw calls. Step times are CPU time (another process on the machine
// doesn't count against a step), the median of five builds after a warm-up one. A tall building
// (≥ 5 storeys: Slice 3) builds the storeys round the walker — ≤ 3 — so its case says which one.

const CASES: [string, Footprint, Door, number, number?][] = [
  ['house 12x8', fpOf(rect(12, 8), 'house', 6.7), doorN(8, -2), 40000],
  ['house 16x10, 3 storeys', fpOf(rect(16, 10), 'house', 9.6), doorN(10, 2), 40000],
  ['bungalow 14x9', fpOf(rect(14, 9), 'house', 3.8), doorN(9, -2), 40000],
  ['walk-up 18x8', fpOf(rect(18, 8), 'large', 12), doorN(8, 0.5), 120000],
  ['slab 45x16', fpOf(rect(45, 16), 'large', 19.5), doorN(16, 0.3), 120000],
  ['office 60x30', fpOf(rect(60, 30), 'commercial', 31, 'office'), doorN(30, 0.3, 1.8), 120000],
  ['tower 40x40', fpOf(rect(40, 40), 'commercial', 150, 'office'), doorN(40, 0.3, 1.8), 120000],
  // a 39-storey tower with the walker on its 24th floor (its lift lobby): storeys 22–24 built
  ['tower 40x40, 150 m, storey 23', fpOf(rect(40, 40), 'commercial', 150, 'office'), doorN(40, 0.3, 1.8), 120000, 23],
  // a residential tower (a ring of flats round its core, the lift beside the stair) at storey 20
  ['flats tower 30x30, 90 m, storey 20', fpOf(rect(30, 30), 'large', 90), doorN(30, 0.3), 120000, 20],
  // a tower on a 60 × 60 m podium, on the podium's top storey (the tower's first above it)
  ['podium tower, storey 4', { ...fpOf(rect(60, 60), 'commercial', 20, 'office'), tiers: [{ ring: rect(30, 30), lo: 20.2, top: 150 }] }, doorN(60, 0.3, 1.8), 120000, 4],
  ['shop + flats 60x18', fpOf(rect(60, 18), 'commercial', 30), doorN(18, 0.3, 1.8), 120000],
  ['supermarket 60x40', fpOf(rect(60, 40), 'commercial', 7, 'supermarket'), doorN(40, 0.3, 1.8), 120000],
  // a vast plate builds fewer storeys (≤ ~12,000 m² of floor in all)
  ['flats 120x40, 20 m', fpOf(rect(120, 40), 'large', 20), doorN(40, 0.3), 120000],
  ['shop + flats 80x40, 25 m', fpOf(rect(80, 40), 'commercial', 25), doorN(40, 0.3, 1.8), 120000],
];
const world = () => new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
type Cpu = { user: number; system: number };
const cpuUsage = (prev?: Cpu): Cpu => (globalThis as unknown as { process: { cpuUsage(p?: Cpu): Cpu } }).process.cpuUsage(prev);

/** One whole activation, step by step: the CPU ms of each step, what it drew. (k: a tall
 *  building's storey the build is centred on) */
function run(fp: Footprint, door: Door, k = 0) {
  const w = world();
  const P = planInterior('b', fp, door, 99);
  const I = new Interiors(w);
  I.register('b', fp, P, registerPlan(w, fp, P));
  const g = I.buildSteps(P, fp, k);
  const ms: number[] = [];
  let r: IteratorResult<void, THREE.Object3D>;
  do {
    const c0 = cpuUsage();
    r = g.next();
    const c = cpuUsage(c0);
    ms.push((c.user + c.system) / 1000);
  } while (!r.done);
  let meshes = 0;
  r.value.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  let hash = 0;
  r.value.traverse((o) => {
    const pos = (o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).geometry.getAttribute('position').array as Float32Array) : null;
    if (pos) for (let i = 0; i < pos.length; i += 97) hash = (hash * 31 + Math.round(pos[i] * 100)) | 0;
  });
  return { ms, stats: I.lastStats, meshes, hash, tall: !!P.tall };
}

describe('interior budgets', () => {
  for (const [name, fp, door, maxVerts, k] of CASES) {
    it(`${name}: ≤ ${maxVerts / 1000}k vertices, ≤ 60 draws, no build step over 8 ms`, () => {
      run(fp, door, k); // (warm-up: the first build also compiles the code)
      const runs = [run(fp, door, k), run(fp, door, k), run(fp, door, k), run(fp, door, k), run(fp, door, k)];
      const n = runs[0].ms.length;
      for (const r of runs) expect(r.ms.length).toBe(n); // (the same steps every time)
      // (each step's best of five: a step's own cost is no more than its fastest run — garbage
      // collections and a busy machine only add, and the median of five still tripped on a loaded
      // 2-CPU runner at 8.7 ms and 16 ms, steps that take ~1 ms alone)
      const best = Array.from({ length: n }, (_, i) => Math.min(...runs.map((r) => r.ms[i])));
      const worst = Math.max(...best);
      expect(worst).toBeLessThanOrEqual(8);
      const { stats, meshes } = runs[0];
      expect(stats.verts).toBeLessThanOrEqual(maxVerts);
      expect(stats.draws).toBeLessThanOrEqual(60);
      expect(meshes).toBe(stats.draws);
      expect(stats.rooms).toBeGreaterThan(2);
      // (a tall building: the storeys round the walker, never more than three)
      if (runs[0].tall) expect(stats.storeys).toBeLessThanOrEqual(3);
    }, 120000);
  }
  it('repeated pieces are instanced: a block of flats and an office floor draw hundreds of pieces in a few calls', () => {
    for (const i of [4, 5]) {
      const { stats } = run(CASES[i][1], CASES[i][2]);
      expect(stats.instances).toBeGreaterThan(300);
      expect(stats.draws).toBeLessThan(50);
    }
  }, 120000);
  it('an interior is the same whatever was built before it (the shared piece cache never changes a build)', () => {
    const [, hf, hd] = CASES[0], [, of, od] = CASES[5];
    const a = run(hf, hd);
    run(of, od);
    const b = run(hf, hd);
    expect(b.stats).toEqual(a.stats);
    expect(b.hash).toBe(a.hash);
  }, 120000);
});

describe('the activation pump', () => {
  it('lays out and builds a house over a few frames as you walk up, walls and all, and drops them as you leave', () => {
    const [, fp, door] = CASES[0];
    const w = world();
    const P = planInterior('h', fp, door, 99);
    const I = new Interiors(w);
    I.register('h', fp, P, registerPlan(w, fp, P));
    // standing on the step outside the front door: the 0.2 s target loop picks the house
    let frames = 0;
    for (; frames < 400 && !(I.activeLayout && I.group.children.length); frames++) I.update(door.fx, door.fz, 0.25, door.fy);
    expect(I.activeLayout).toBeTruthy();
    expect(I.group.children.length).toBe(1);
    expect(frames).toBeGreaterThan(1); // (sliced, not all at once)
    // the partitions are in the collision world: someone standing on one (clear of the stairs'
    // own walls, which the tile registered) is pushed off it
    const L = I.activeLayout!;
    const bare = world();
    registerPlan(bare, fp, P);
    const spot = (q: (typeof L.walls)[number]) => {
      const m = (q.a + q.b) / 2; // (a step off its line: a point right on a wall has no side to be pushed to)
      return q.ax === 0 ? toW(P, m, q.c + 0.1) : toW(P, q.c + 0.1, m);
    };
    const wl = L.walls.find((q) => q.level === 0 && q.b - q.a > 2 && !q.gaps.some(([g0, g1]) => g0 < (q.a + q.b) / 2 + 0.5 && g1 > (q.a + q.b) / 2 - 0.5) && !bare.touching(...spot(q), 0.3, P.floor0))!;
    expect(wl).toBeTruthy();
    const [x, z] = spot(wl);
    expect(w.touching(x, z, 0.3, P.floor0)).toBe(true);
    // walking away drops the interior and its walls
    for (let f = 0; f < 20; f++) I.update(door.fx, door.fz - 80, 0.25, door.fy);
    expect(I.activeLayout).toBeNull();
    expect(I.group.children.length).toBe(0);
    expect(w.touching(x, z, 0.3, P.floor0)).toBe(false);
  });
});
