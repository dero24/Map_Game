// Interiors bench (docs/INTERIORS_PLAN.md §1, §4) — reads the repo, writes nothing.
//   npx tsx tools/bench-interiors.mts
// Plans, lays out and builds synthetic buildings the way an activation does (Stage A in the tile
// worker; Stage B and the sliced mesh build as the steps the pump runs on activation) and reports
// rooms per storey, the largest room, vertices, draw calls and the worst single step — CPU time,
// the median of five builds after a warm-up one (tests/interiorBudget.test.ts holds the budgets).
import * as THREE from 'three';
import { planInterior, registerPlan, Interiors } from '../src/world/interiors';
import { WalkWorld } from '../src/player/collision';
import type { Footprint, Door } from '../src/world/buildings';

type P2 = [number, number];
type Cpu = { user: number; system: number };
const cpuUsage = (prev?: Cpu): Cpu => (globalThis as unknown as { process: { cpuUsage(p?: Cpu): Cpu } }).process.cpuUsage(prev);
const terrain = { heightAt: () => 0.5, sdfAt: () => 50 } as never;
const rect = (L: number, W: number): P2[] => [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
const fp = (L: number, W: number, kind: string, top: number, use?: string): Footprint => ({ ring: rect(L, W), base: 0.2, top, floor0: 0.5, raise: 0, kind, use, eave: top - 0.2, seed: 0.3, id: 7 });
const door = (W: number, x = 0.3, w = 1): Door => ({ x, z: -W / 2 - 0.2, y: 0.5, nx: 0, nz: -1, fx: x, fz: -W / 2 - 1.4, fy: 0.5, b: 0, w, h: 2.15, wx: x, wz: -W / 2, col: 0 });
/** Circulation and open floor: not counted as rooms. */
const CIRC = new Set(['hall', 'landing', 'corridor', 'lobby', 'stair', 'lift', 'open', 'shop', 'cafe', 'bar', 'diner', 'church', 'great', 'void']);
const area = (r: { u0: number; u1: number; v0: number; v1: number }) => (r.u1 - r.u0) * (r.v1 - r.v0);

// (a tall building — ≥ 5 storeys — is built three storeys at a time round the walker: k says which)
const cases: [string, Footprint, Door, number?][] = [
  ['house 12x8, 2 storeys', fp(12, 8, 'house', 6.7), door(8, -2)],
  ['apartments 45x16, 19.5 m', fp(45, 16, 'large', 19.5), door(16)],
  ['office 60x30, 31 m', fp(60, 30, 'commercial', 31, 'office'), door(30, 0.3, 1.8)],
  ['tower 40x40, 150 m', fp(40, 40, 'commercial', 150, 'office'), door(40, 0.3, 1.8)],
  ['tower 40x40, 150 m, floor 24', fp(40, 40, 'commercial', 150, 'office'), door(40, 0.3, 1.8), 23],
  ['flats tower 30x30, 90 m, floor 21', fp(30, 30, 'large', 90), door(30), 20],
  ['podium 60x60 + tower, floor 11', { ...fp(60, 60, 'commercial', 20, 'office'), tiers: [{ ring: rect(30, 30), lo: 20.2, top: 150 }] }, door(60, 0.3, 1.8), 10],
  ['"hotel" 60x18, 30 m (no tag)', fp(60, 18, 'commercial', 30), door(18, 0.3, 1.8)],
  ['supermarket 60x40', fp(60, 40, 'commercial', 7, 'supermarket'), door(40, 0.3, 1.8)],
];

// 1. houses: rooms per storey (not the hall or landing) over 40 door positions
for (const [L, W] of [[9, 7], [12, 8], [14, 9], [16, 10]]) {
  const hist: Record<number, number> = {};
  for (let k = 0; k < 40; k++) {
    const x = -L / 2 + L * (0.28 + 0.44 * (k / 39));
    const f = { ...fp(L, W, 'house', 6.7), seed: 0.3 + k / 100 };
    const p = planInterior('h', f, door(W, x), 1000 + k);
    const I = new Interiors(new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 }));
    const g = I.buildSteps(p, f);
    let r = g.next();
    while (!I.activeLayout && !r.done) r = g.next();
    const Ly = I.activeLayout!;
    for (let lv = 0; lv < p.levels; lv++) {
      const n = Ly.rooms.filter((q) => q.level === lv && !CIRC.has(q.type)).length;
      hist[n] = (hist[n] ?? 0) + 1;
    }
  }
  console.log(`house ${L}x${W}: rooms/storey histogram`, JSON.stringify(hist));
}

// 2. plans + activations: a warm-up build, then three timed ones
for (const [name, f, d, k = 0] of cases) {
  const runs: number[][] = [];
  let tPlan = 0, total = 0, last: { I: Interiors; plan: ReturnType<typeof planInterior>; obj: THREE.Object3D } | null = null;
  for (let pass = 0; pass < 6; pass++) {
    const w = new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
    const t0 = performance.now();
    const plan = planInterior('b', f, d, 99);
    tPlan = performance.now() - t0;
    const I = new Interiors(w);
    I.register('b', f, plan, registerPlan(w, f, plan));
    const gen = I.buildSteps(plan, f, k);
    const ms: number[] = [];
    const t1 = performance.now();
    let r: IteratorResult<void, THREE.Object3D>;
    do {
      const c0 = cpuUsage();
      r = gen.next();
      const c = cpuUsage(c0);
      ms.push((c.user + c.system) / 1000);
    } while (!r.done);
    total = performance.now() - t1;
    if (pass) runs.push(ms);
    last = { I, plan, obj: r.value };
  }
  const { I, plan, obj } = last!;
  const n = runs[0].length;
  const worst = Math.max(...Array.from({ length: n }, (_, i) => runs.map((m) => m[i]).sort((a, b) => a - b)[2]));
  const Ly = I.activeLayout!;
  const st = I.lastStats;
  const built = [...new Set(Ly.rooms.map((q) => q.level))].sort((a, b) => a - b);
  const perStorey = built.map((lv) => Ly.rooms.filter((q) => q.level === lv && !CIRC.has(q.type) && q.type !== 'shaft').length);
  const largest = Math.max(0, ...Ly.rooms.filter((q) => !CIRC.has(q.type)).map((q) => area(q.r)));
  const open = Ly.rooms.filter((q) => ['open', 'shop'].includes(q.type)).reduce((s, q) => s + area(q.r), 0);
  let draws = 0;
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) draws++; });
  const byHeight = Math.floor((f.top - f.floor0) / plan.floorH);
  console.log(`${name.padEnd(30)} ${plan.arch}/${plan.up} storeys ${plan.levels}/${byHeight} (built ${built.join(',')})  rooms/storey ${perStorey.join(',')}  largest room ${largest.toFixed(0)} m2${open ? ` (open floor ${open.toFixed(0)} m2, ${Ly.desks.length} desks)` : ''}  verts ${st.verts} (${((st.verts * 76) / 1e6).toFixed(1)} MB)  draws ${draws}  instances ${st.instances}  plan ${tPlan.toFixed(2)} ms  build ${total.toFixed(0)} ms / ${n} steps, worst step ${worst.toFixed(1)} ms cpu`);
}
