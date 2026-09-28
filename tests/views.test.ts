import { describe, it, expect } from 'vitest';
import { viewCones, viewDir } from '../src/world/views';
import type { Point } from '../src/world/data';

// A lookout on a hill's brow: flat behind it (north), the ground falling 40 % to the south.
const hill = (_x: number, z: number) => (z > 0 ? 100 - z * 0.4 : 100);
const vp: Point = { c: 'viewpoint', x: 0, z: 0 };

describe('viewpoints', () => {
  it('look where the map says, else down the slope, else nowhere', () => {
    const [dx, dz] = viewDir({ ...vp, d: 90 }, hill)!;
    expect(dx).toBeCloseTo(1, 5); // east
    expect(dz).toBeCloseTo(0, 5);
    const [sx, sz] = viewDir(vp, hill)!;
    expect(sz).toBeGreaterThan(0.9); // south, downhill
    expect(Math.abs(sx)).toBeLessThan(0.4);
    expect(viewDir(vp, () => 50)).toBe(null); // a flat lookout: every way
  });
  it('keeps the crowns in front under the sightline, and leaves the rest', () => {
    const [c] = viewCones([vp, { c: 'bench', x: 5, z: 5 }], hill);
    // 40 m down the slope the ground is 16 m lower: a crown may stand ~15 m there
    const a40 = c.allow(0, 40, hill(0, 40));
    expect(a40).toBeGreaterThan(14);
    expect(a40).toBeLessThan(16);
    // right in front, on the brow: only a shrub fits under the eye
    expect(c.allow(0, 2, hill(0, 2))).toBeLessThan(2);
    // behind the lookout, off to the side and past 110 m: no limit
    expect(c.allow(0, -30, 100)).toBe(Infinity);
    expect(c.allow(60, 5, hill(60, 5))).toBe(Infinity);
    expect(c.allow(0, 150, hill(0, 150))).toBe(Infinity);
  });
});
