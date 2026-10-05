import { describe, it, expect } from 'vitest';
import { floorAt, underWood, type Crown } from '../src/world/understory';
import { understoryMix, plantGeometry, SPECIES, plantMix, type CastPlace } from '../src/assets/flora';

const at = (sub: string, climate: string, eco = '', l3 = 0, west = false): CastPlace => ({ sub, climate, eco, l3, west });

// The forest floor (world/understory.ts): under the westside Northwest's firs, sword fern, salal and
// Oregon grape — under a wood's canopy only, never a lone yard tree, never on a path.
describe('the forest floor', () => {
  // a wood: firs every 7 m, crowns 6 m across… and a lone tree 60 m off
  const wood: Crown[] = [];
  for (let x = 0; x <= 42; x += 7) for (let z = 0; z <= 42; z += 7) wood.push({ x, z, r: 6 });
  const lone: Crown[] = [{ x: 100, z: 100, r: 6 }];
  const grid = (x0: number, z0: number, crowns: Crown[], mix = understoryMix(at('pnw', 'temperate', 'pnw', 2, true)), open = () => true) => {
    const got: string[] = [];
    for (let x = x0; x < x0 + 30; x += 1.8) for (let z = z0; z < z0 + 30; z += 1.8) {
      const f = floorAt(x, z, crowns, mix.mix, mix.density, open);
      if (f) got.push(f.sp);
    }
    return got;
  };
  it("grows the region's understory under a wood: sword fern most, salal, Oregon grape", () => {
    const got = grid(6, 6, wood);
    const n = (sp: string) => got.filter((s) => s === sp).length;
    expect(got.length).toBeGreaterThan(100); // (of 289 spots)
    expect(n('swordfern')).toBeGreaterThan(n('salal'));
    expect(n('salal')).toBeGreaterThan(n('oregongrape'));
    expect(n('oregongrape')).toBeGreaterThan(0);
  });
  it('never under a lone tree, on a path, or where the region has no understory yet', () => {
    expect(grid(85, 85, lone).length).toBe(0);
    expect(underWood(100, 102, lone)).toBe(false);
    expect(underWood(10, 12, wood)).toBe(true);
    expect(grid(6, 6, wood, understoryMix(at('pnw', 'temperate', 'pnw', 2, true)), () => false).length).toBe(0);
    expect(understoryMix(at('', 'arid')).mix.length).toBe(0);
    expect(understoryMix(at('', 'arid', 'desert-sw', 81)).mix.length).toBe(0);
    expect(understoryMix(at('mountain', 'temperate', 'pnw', 9)).mix.length).toBe(0); // (the dry side's is the Rockies' to come)
  });
  it("the forest plants are the forest's, never a garden's", () => {
    for (const c of ['temperate', 'continental', 'boreal', 'mediterranean', 'tropical', 'arid', 'polar'])
      for (const [sp] of plantMix(c)) expect(['swordfern', 'salal', 'oregongrape']).not.toContain(sp);
    // the sword fern a knee-high fountain wider than it stands; salal flowering pink-white in June
    const g = plantGeometry('swordfern', 1, 1, false, true);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.y).toBeGreaterThan(0.5);
    expect(b.max.x - b.min.x).toBeGreaterThan(b.max.y);
    expect(SPECIES.salal.months[0]).toBeLessThanOrEqual(6);
    expect(SPECIES.oregongrape.bloom[0]).toBe(0xe9c93a); // (yellow, in spring)
  });
});
