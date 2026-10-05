import { describe, it, expect } from 'vitest';
import { wallWindows } from '../src/world/interior/plan';
import { KIND } from '../src/world/buildings';

// The interior's walls cut the facade's own glass (plan.ts windowsOf mirrors buildings.ts windowAt):
// a storefront street floor under apartments (Footprint.gf, the shader's kind +0.04) is glazed as a
// shop's — Robby, Brooklyn: the shop window opened whole, the wall behind cut "just a tiny square".
describe("the interior's windows match the facade's", () => {
  it('apartments over shops: the ground storey cuts storefront glass, the storeys above sash windows', () => {
    const M = { kind: KIND.large, eave: 12, fo: 0.4, shop: true };
    const g = wallWindows(10, 0, M)!, up = wallWindows(10, 1, M)!;
    expect(g.n).toBe(2); // (3.4 m storefront bays)
    expect(g.half).toBeCloseTo((10 / 2) * 0.78 / 2 + 0.04, 5);
    expect(up.half).toBeLessThan(0.6); // (a 1 m sash window above)
    const plain = wallWindows(10, 0, { kind: KIND.large, eave: 12, fo: 0.4 })!;
    expect(plain.half).toBeLessThan(0.6); // (no shop under it: a sash window on the ground storey too)
  });
});
