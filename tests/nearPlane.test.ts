import { describe, it, expect } from 'vitest';
import { nearPlane, depthStep, NEAR_MIN, NEAR_MAX } from '../src/render/nearPlane';

const flat = (h: number) => () => h;

describe('the near plane rides the clearance (render/nearPlane.ts)', () => {
  it('on foot, and on a roof, it stays at arm’s length', () => {
    expect(nearPlane(1.6, 0, 0, flat(0))).toBe(NEAR_MIN);
    expect(nearPlane(31.6, 0, 0, flat(30))).toBe(NEAR_MIN);
    expect(nearPlane(20, 0, 0, flat(-50))).toBe(NEAR_MIN); // (over the sea: the sea is the floor)
  });

  it('up high, low shore ground and the sea under it no longer fight: a step is centimetres', () => {
    for (const up of [300, 1000, 3000]) {
      const n = nearPlane(up + 2, 0, 0, flat(2));
      expect(n).toBeGreaterThan(up * 0.005);
      expect(n).toBeLessThanOrEqual(up * 0.01 + 1e-9); // (never past the clearance's 1%)
      // straight down and 3× as far out on a slant: under 20 cm between ground and sea
      expect(depthStep(up, n)).toBeLessThan(0.05);
      expect(depthStep(up * 3, n)).toBeLessThan(0.2);
    }
    // the old fixed 25 cm: a metre out at 2 km, the flashing
    expect(depthStep(2000, NEAR_MIN)).toBeGreaterThan(0.9);
    expect(nearPlane(20000, 0, 0, flat(0))).toBe(NEAR_MAX);
  });

  it('a cliff beside the flight sets it, not only the valley floor under it', () => {
    const cliff = (x: number) => (x > 40 ? 480 : 0);
    expect(nearPlane(500, 0, 0, cliff)).toBe(NEAR_MIN); // 20 m off the cliff top's height: arm's length
    expect(nearPlane(500, 0, 0, flat(0))).toBeGreaterThan(3);
  });

  it('in steps: a drifting height keeps the same projection', () => {
    const a = nearPlane(1000, 0, 0, flat(0)), b = nearPlane(1010, 0, 0, flat(0));
    expect(a).toBe(b);
    const seen = new Set<number>();
    for (let y = 0; y < 5000; y += 5) seen.add(nearPlane(y, 0, 0, flat(0)));
    expect(seen.size).toBeLessThan(35); // (a thousand heights, a few dozen projections)
  });
});
