import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { faunaMix, type CritterKind } from '../src/assets/fauna';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { LifeSim } from '../src/sim/lifeSim';
import { RANGES } from '../src/sim/protocol';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';
import type { LifeInit } from '../src/sim/protocol';

// The ecosystem review (2026-10-06, Robby: "six gulls in the road … balance the ecosystem, plants are
// coming next"): each animal on its own ground, as many as there'd be, in its season, in its range
const has = (lat: number, lon: number, k: CritterKind, month?: number) => {
  const st = regionStyle(lat, lon);
  return Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().some(([kk]) => kk === k);
};
const walk = { buildingAt: () => -1, blocked: () => false, deckAt: () => null } as unknown as WalkWorld;
const env = (lat: number, lon: number, o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 11, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], place: castOf(regionStyle(lat, lon)), ...o });
const kinds = (T: Terrain, e: CritterEnv, steps = 300, wz = 0) => {
  const c = new Critters(T, walk), seen = new Set<string>();
  c.everyone = true;
  for (let i = 0; i < steps; i++) { c.update(0.05, 0, wz, e); for (const o of (c as unknown as { list: { kind: string }[] }).list) seen.add(o.kind); }
  return seen;
};

describe('each on its own ground', () => {
  it("the pigeons on a plaza or a lot, never in the road", () => {
    const built = { heightAt: () => 0, sdfAt: () => 60, coverAt: () => 50, oceanDistAt: () => 5000 } as unknown as Terrain;
    const nyc = (o: Partial<CritterEnv>) => env(40.75, -73.99, { hour: 8, urban: 1, ...o });
    expect(kinds(built, nyc({ paved: () => true, lot: () => false })).has('pigeon')).toBe(false);
    expect(kinds(built, nyc({ paved: () => true, lot: () => true })).has('pigeon')).toBe(true);
  });
  it("the fiddler crabs on the salt marsh's mud, never on the swimming beach's sand", () => {
    // the sea north of z = 0: a sandy beach, then the same shore as salt marsh
    const beach = { heightAt: (_x: number, z: number) => (z > 0 ? 0.4 : -2), sdfAt: (_x: number, z: number) => z, coverAt: () => 60, oceanDistAt: (_x: number, z: number) => Math.max(0, z) } as unknown as Terrain;
    const marsh = { heightAt: (_x: number, z: number) => (z > 0 ? 0.3 : -1), sdfAt: (_x: number, z: number) => z, coverAt: (_x: number, z: number) => (z > 0 ? 90 : 80), oceanDistAt: () => 600 } as unknown as Terrain;
    const savannah = env(32.0, -80.85, { hour: 12 });
    expect(kinds(beach, savannah, 300, 20).has('fiddlercrab')).toBe(false);
    expect(kinds(marsh, savannah, 300, 20).has('fiddlercrab')).toBe(true);
  });
  it("the mullet in the sea's water and the canals off it, not in a pond a few streets inland", () => {
    const pond = { heightAt: () => -1, sdfAt: () => -10, coverAt: () => 80, oceanDistAt: () => 1500 } as unknown as Terrain;
    const bay = { heightAt: () => -1, sdfAt: () => -10, coverAt: () => 80, oceanDistAt: () => 0 } as unknown as Terrain;
    const miami = env(25.76, -80.19, { hour: 7 });
    expect(kinds(pond, miami).has('mullet')).toBe(false);
    expect(kinds(bay, miami).has('mullet')).toBe(true);
  });
  it('the bison only out in the wild: never by a suburb', () => {
    const range = { heightAt: () => 0, sdfAt: () => 500, coverAt: () => 30, oceanDistAt: () => 900_000 } as unknown as Terrain;
    const wy = (settled: number) => env(44.9, -110.22, { hour: 7.5, settled });
    expect(kinds(range, wy(0), 600).has('bison')).toBe(true);
    expect(kinds(range, wy(0.3), 600).has('bison')).toBe(false);
  });
});

describe('in their seasons and their ranges', () => {
  it("the robins off the northern lawns in midwinter and the South's only in its winter; the ground squirrels asleep; the beaver under the ice; the cold country's fish still", () => {
    expect(has(42.36, -71.06, 'robin', 7)).toBe(true);
    expect(has(42.36, -71.06, 'robin', 1)).toBe(false); // (Boston, January)
    expect(has(25.76, -80.19, 'robin', 1)).toBe(true); // (Miami's winter visitors)
    expect(has(25.76, -80.19, 'robin', 7)).toBe(false);
    expect(has(33.75, -84.39, 'robin', 7)).toBe(true); // (Atlanta's breed)
    expect(has(39.74, -104.99, 'groundSquirrel', 7)).toBe(true);
    expect(has(39.74, -104.99, 'groundSquirrel', 1)).toBe(false); // (Denver, asleep)
    expect(has(34.05, -118.24, 'groundSquirrel', 1)).toBe(true); // (California's, awake all year)
    expect(has(42.36, -71.06, 'beaver', 1)).toBe(false);
    expect(has(42.36, -71.06, 'beaver', 7)).toBe(true);
    expect(has(41.88, -87.63, 'largemouthbass', 1)).toBe(false);
    expect(has(25.76, -80.19, 'largemouthbass', 1)).toBe(true);
  });
  it("no alligator in the Ozark Highlands (southern Arkansas's lowlands only)", () => {
    expect(has(36.64, -93.22, 'alligator', 7)).toBe(false); // (Branson)
    expect(has(29.76, -95.37, 'alligator', 7)).toBe(true); // (Houston)
  });
});

describe('as many as there would be', () => {
  it("a few gulls on a beach, a couple at a lot in town; a hawk or two overhead, not three", () => {
    const c = new Critters({ heightAt: () => 0, sdfAt: () => 60, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain, walk) as unknown as { want(r: string, e: CritterEnv): number; wetAt(x: number, z: number): void };
    const e = env(40.36, -73.97);
    c.wetAt(0, 0);
    expect(c.want('gull', e)).toBeLessThanOrEqual(2);
    expect(c.want('raptor', e)).toBeLessThanOrEqual(2);
  });
  it("the gulls over the beach as many as the place is busy (the life sim's flock follows the knobs)", () => {
    const beach: number[] = [];
    for (let k = 0; k < 60; k++) beach.push(1000 + k * 20, 0.5, 600);
    const init: LifeInit = {
      seed: 7, bounds: [-50, -50, 2400, 800], edgePts: new Float32Array([0, 1.5, 0, 400, 1.5, 0]), edgeStart: new Int32Array([0]), edgeCount: new Int32Array([2]), edgeLen: new Float32Array([400]),
      edgeInfo: new Float32Array([2, 6.5, 0, 1]), edgeNodes: new Int32Array([0, 1]), nodeEdgeStart: new Int32Array([0, 1, 2]), nodeEdges: new Int32Array([0, 0]),
      beachPts: new Float32Array(beach), waterGrid: new Uint8Array(4), waterG: [-50, -50, 400, 2, 2], downtown: [0, 0, 400, 400], seaward: [0, 1], doors: new Float32Array(0),
    };
    const gulls = (density: number) => {
      const sim = new LifeSim(init);
      sim.setEnv({ playerX: 0, playerZ: 0, hour: 12, night: 0, density, wind: 0.5 });
      for (let t = 0; t < 40; t++) sim.step(0.05);
      let n = 0;
      for (let i = RANGES.gulls[0]; i < RANGES.gulls[1]; i++) n += sim.active[i];
      return n;
    };
    const full = gulls(1), few = gulls(0.3);
    expect(full).toBe(RANGES.gulls[1] - RANGES.gulls[0]);
    expect(few).toBeLessThan(full * 0.4);
    expect(few).toBeGreaterThan(0);
  });
});
