import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildStairs, flightsOf } from '../src/world/stairs';
import { WalkWorld } from '../src/player/collision';
import type { Road, Terrain } from '../src/world/data';

// A hillside rising 3 m over 10 m eastward; a flight of steps climbs it from x = 0 to x = 10.
const hill = (x: number) => Math.max(0, Math.min(10, x)) * 0.3;
const terrain = { heightAt: (x: number) => hill(x), sdfAt: () => 50 } as unknown as Terrain;
const q = (pts: [number, number][]) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
const up: Road = { p: q([[0, 0], [10, 0]]), c: 'steps', w: 2 };

describe('outdoor stairs', () => {
  it('a flight of even risers up the slope, as many as the map counts where it counts them', () => {
    const [f] = flightsOf([up], (x) => hill(x));
    expect(f.n).toBe(Math.round(3 / 0.165));
    expect(flightsOf([{ ...up, sc: 22 }], (x) => hill(x))[0].n).toBe(22);
    expect(flightsOf([{ ...up, p: q([[20, 0], [30, 0]]) }], (x) => hill(x))).toEqual([]); // (flat: a path)
    expect(flightsOf([{ ...up, own: 0 }], (x) => hill(x))).toEqual([]); // (the neighbour's)
  });
  it('treads climb in even steps from the foot to the top, solid down into the slope, whichever way the way runs', () => {
    for (const r of [up, { ...up, p: q([[10, 0], [0, 0]]) }]) {
      const g = buildStairs([r], (x) => hill(x), new WalkWorld(terrain, { x0: -100, z0: -100, x1: 100, z1: 100 }));
      const treads = g.getObjectByName('stairs:treads') as THREE.Mesh;
      const pos = treads.geometry.getAttribute('position');
      // the top of each tread (the highest vertices) by x: rising with x, the last at the hill's top
      const tops = new Map<number, number>();
      for (let i = 0; i < pos.count; i++) { const k = Math.round(pos.getX(i) * 4); tops.set(k, Math.max(tops.get(k) ?? -9, pos.getY(i))); }
      let ymin = Infinity;
      for (let i = 0; i < pos.count; i++) ymin = Math.min(ymin, pos.getY(i));
      expect(ymin).toBeLessThan(-0.2); // (the blocks go down into the slope)
      const ks = [...tops.keys()].sort((a, b) => a - b);
      expect(tops.get(ks[ks.length - 1])!).toBeCloseTo(3, 1);
      expect(g.getObjectByName('stairs:rails')).toBeTruthy();
    }
  });
  it('never sinks into a convex hillside, and walls a tread that stands up off the slope', () => {
    // a hill steep at its foot and flat at its top: the straight flight would dive under it
    const convex = (x: number) => 3 * Math.sqrt(Math.max(0, Math.min(10, x)) / 10);
    const w = new WalkWorld({ heightAt: convex, sdfAt: () => 50 } as unknown as Terrain, { x0: -100, z0: -100, x1: 100, z1: 100 });
    const g = buildStairs([up], (x) => convex(x), w);
    const pos = (g.getObjectByName('stairs:treads') as THREE.Mesh).geometry.getAttribute('position');
    const top = new Map<number, number>();
    for (let i = 0; i < pos.count; i++) { const k = Math.round(pos.getX(i) * 2); top.set(k, Math.max(top.get(k) ?? -9, pos.getY(i))); }
    for (const [k, y] of top) if (k > 0 && k < 20) expect(y, `x ${k / 2}`).toBeGreaterThanOrEqual(convex(k / 2) - 0.25);
    // concave: flat at the foot, steep at the top — the treads stand on a plinth, walled at the sides
    const concave = (x: number) => 3 * (Math.max(0, Math.min(10, x)) / 10) ** 3;
    const w2 = new WalkWorld({ heightAt: concave, sdfAt: () => 50 } as unknown as Terrain, { x0: -100, z0: -100, x1: 100, z1: 100 });
    buildStairs([up], (x) => concave(x), w2);
    expect(w2.blocked(5, 1.05, 0.2)).toBe(true); // (beside the flight, down on the ground)
    expect(w2.blocked(5, 0, 0.2)).toBe(false); // (on it)
  });
  it('the walker climbs through the middle of each tread\'s top', () => {
    const w = new WalkWorld(terrain, { x0: -100, z0: -100, x1: 100, z1: 100 });
    buildStairs([up], (x) => hill(x), w);
    const n = Math.round(3 / 0.165), run = 10 / n, rise = 3 / n;
    for (const k of [0, 5, n - 1]) expect(w.surfaceAt((k + 0.5) * run, 0, rise * (k + 1))).toBeCloseTo(rise * (k + 1), 2);
  });
});
