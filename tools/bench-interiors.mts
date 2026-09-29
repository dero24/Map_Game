// Baseline for docs/INTERIORS_PLAN.md §1 — reads the repo, writes nothing.
//   npx tsx tools/bench-interiors.mts
// (Slice 1 turns it into tests/interiorBudget.test.ts)
import * as THREE from 'three';
import { planInterior, registerPlan, Interiors } from '../src/world/interiors';
import { WalkWorld } from '../src/player/collision';
import type { Footprint, Door } from '../src/world/buildings';

type P2 = [number, number];
const terrain = { heightAt: () => 0.5, sdfAt: () => 50 } as never;
const rect = (L: number, W: number): P2[] => [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
const fp = (L: number, W: number, kind: string, top: number, use?: string): Footprint => ({ ring: rect(L, W), base: 0.2, top, floor0: 0.5, raise: 0, kind, use, eave: top - 0.2, seed: 0.3, id: 7 });
const door = (W: number, x = 0.3): Door => ({ x, z: -W / 2 - 0.2, y: 0.5, nx: 0, nz: -1, fx: x, fz: -W / 2 - 1.4, fy: 0.5, b: 0, w: 1, h: 2.15, wx: x, wz: -W / 2, col: 0 });

const cases: [string, Footprint, Door][] = [
  ['house 12x8, 2 storeys', fp(12, 8, 'house', 6.7), door(8, -2)],
  ['apartments 45x16, 19.5 m', fp(45, 16, 'large', 19.5), door(16)],
  ['office 60x30, 31 m', fp(60, 30, 'commercial', 31, 'office'), door(30)],
  ['tower 40x40, 150 m', fp(40, 40, 'commercial', 150, 'office'), door(40)],
  ['"hotel" 60x18, 30 m (no tag)', fp(60, 18, 'commercial', 30), door(18)],
  ['supermarket 60x40', fp(60, 40, 'commercial', 7, 'supermarket'), door(40)],
];

// 1. two-storey houses: rooms per storey over 40 door positions
for (const [L, W] of [[9, 7], [12, 8], [14, 9], [16, 10]]) {
  const hist: Record<number, number> = {};
  for (let k = 0; k < 40; k++) {
    const x = -L / 2 + L * (0.28 + 0.44 * (k / 39));
    const p = planInterior('h', { ...fp(L, W, 'house', 6.7), seed: 0.3 + k / 100 }, door(W, x), 1000 + k);
    hist[p.parts.length + 1] = (hist[p.parts.length + 1] ?? 0) + 1;
  }
  console.log(`house ${L}x${W}: rooms/storey histogram`, JSON.stringify(hist));
}

// 2. plans + builds (second pass = warm JIT)
for (const pass of [0, 1])
  for (const [name, f, d] of cases) {
    const w = new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
    const t0 = performance.now();
    const plan = planInterior('b', f, d, 99);
    const tPlan = performance.now() - t0;
    const I = new Interiors(w);
    I.register('b', f, plan, registerPlan(w, f, plan));
    const gen = (I as unknown as { buildGen: (p: typeof plan, f: Footprint) => Generator<void, THREE.Object3D> }).buildGen(plan, f);
    let r = gen.next(), worst = 0, last = performance.now(), steps = 0;
    const t1 = last;
    while (!r.done) { const now = performance.now(); worst = Math.max(worst, now - last); last = now; r = gen.next(); steps++; }
    worst = Math.max(worst, performance.now() - last);
    const total = performance.now() - t1;
    if (!pass) continue;
    let verts = 0;
    r.value.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) verts += m.geometry.getAttribute('position').count; });
    const us = [-plan.L / 2, ...plan.parts.map((q) => q.u).sort((a, b) => a - b), plan.L / 2];
    const widest = Math.max(...us.slice(1).map((u, i) => u - us[i]));
    const byHeight = Math.floor((f.top - f.floor0) / plan.floorH);
    console.log(`${name.padEnd(30)} storeys ${plan.levels}/${byHeight}  rooms/storey ${us.length - 1}  largest ${(widest * plan.W).toFixed(0)} m2  verts ${verts}  ${(verts * 76 / 1e6).toFixed(1)} MB  plan ${tPlan.toFixed(2)} ms  build ${total.toFixed(0)} ms / ${steps} steps, worst ${worst.toFixed(0)} ms`);
  }
