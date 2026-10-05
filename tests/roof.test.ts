import { describe, it, expect } from 'vitest';
import { straightSkeleton, buildRoof, ringArea, tidyRing, type V2 } from '../src/world/roof';
import { makeRng } from '../src/core/rng';

const faceArea = (sk: NonNullable<ReturnType<typeof straightSkeleton>>) =>
  sk.faces.reduce((a, f) => a + ringArea(f.map((k) => [sk.nodes[k].x, sk.nodes[k].z] as V2)), 0);

const RECT: V2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
const L: V2[] = [[0, 0], [12, 0], [12, 5], [5, 5], [5, 11], [0, 11]];
const T: V2[] = [[0, 0], [14, 0], [14, 5], [9, 5], [9, 12], [5, 12], [5, 5], [0, 5]];
const U: V2[] = [[0, 0], [12, 0], [12, 9], [8, 9], [8, 4], [4, 4], [4, 9], [0, 9]];

describe('straight skeleton', () => {
  it('splits a rectangle into two trapezoids and two hip ends', () => {
    const sk = straightSkeleton(RECT)!;
    expect(sk).not.toBeNull();
    expect(sk.faces.length).toBe(4);
    expect(sk.maxT).toBeCloseTo(3);
    expect(faceArea(sk)).toBeCloseTo(60, 3);
    expect(sk.faces.map((f) => f.length).sort()).toEqual([3, 3, 4, 4]);
  });

  it('handles L, T and U footprints (reflex corners, split events)', () => {
    for (const ring of [L, T, U]) {
      const sk = straightSkeleton(ring)!;
      expect(sk).not.toBeNull();
      expect(sk.faces.length).toBe(ring.length);
      expect(faceArea(sk)).toBeCloseTo(ringArea(ring), 2);
    }
  });

  it('survives noisy, slightly skewed machine-traced outlines', () => {
    const rng = makeRng(5);
    let ok = 0;
    for (let k = 0; k < 300; k++) {
      const base = [RECT, L, T, U][k % 4];
      const a = rng.range(0, Math.PI), c = Math.cos(a), s = Math.sin(a);
      const ring = base.map(([x, z]) => [x * c - z * s + rng.range(-0.15, 0.15), x * s + z * c + rng.range(-0.15, 0.15)] as V2);
      const sk = straightSkeleton(tidyRing(ring));
      if (sk && Math.abs(faceArea(sk) - Math.abs(ringArea(ring))) < Math.abs(ringArea(ring)) * 0.03) ok++;
    }
    expect(ok).toBeGreaterThan(285);
  });

  it('is fast enough for a whole town', () => {
    const t0 = performance.now();
    for (let k = 0; k < 3000; k++) straightSkeleton(k % 2 ? L : T);
    expect(performance.now() - t0).toBeLessThan(2500);
  });
});

describe('roofs', () => {
  it('builds a gabled roof on a rectangle: two slopes, two gable walls, ridge at the pitch', () => {
    const r = buildRoof(RECT, 'gable', 0.6, 0.4, 10)!;
    expect(r.gables.length).toBe(2);
    expect(r.rise).toBeCloseTo(3 * 0.6, 3);
    for (const g of r.gables) expect(g.h).toBeCloseTo(1.8, 2);
    for (const t of r.tris) for (const p of t.p) expect(p[1]).toBeGreaterThanOrEqual(r.lowH - 1e-6);
  });

  it('a triangle asked for gables gets a hip: slopes and a peak, never three gable walls and no roof', () => {
    // (every face met the gable rule round the one apex: no slopes, the peak left at −∞ — a chimney
    // built on it stood at minus infinity and culled its chunk; seen at Ely, NV and Santa Monica)
    const tri: V2[] = [[3.88, -0.88], [-1.29, 4.78], [-1.55, -4.8]];
    const r = buildRoof(tri, 'gable', 0.6, 0.4, 10)!;
    expect(r.tris.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.peak[1])).toBe(true);
  });

  it('every roof of a thousand random footprints has a finite peak and finite corners', () => {
    const R = makeRng(20261004), rng = () => R.float();
    let built = 0;
    for (let t = 0; t < 1000; t++) {
      const k = 3 + Math.floor(rng() * 6), ring: V2[] = [];
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + (rng() - 0.5) * 0.6, r = 4 + rng() * 10;
        ring.push([Math.cos(a) * r * (0.5 + rng()), Math.sin(a) * r]);
      }
      const tidy = tidyRing(ring);
      if (!tidy || tidy.length < 3) continue;
      for (const style of ['gable', 'hip'] as const) {
        const r = buildRoof(tidy, style, 0.6, 0.4, 10);
        if (!r) continue;
        built++;
        expect(Number.isFinite(r.peak[1]), `${style} on ${JSON.stringify(tidy)}`).toBe(true);
        for (const tr of r.tris) for (const p of tr.p) expect(p.every(Number.isFinite)).toBe(true);
      }
    }
    expect(built).toBeGreaterThan(1000);
  });

  it('cross-gables an L-shaped house and caps the rise', () => {
    const r = buildRoof(L, 'gable', 0.7, 0.4, 2.5)!;
    expect(r.gables.length).toBe(2);
    expect(r.rise).toBeLessThanOrEqual(2.5 + 1e-6);
    const hip = buildRoof(L, 'hip', 0.7, 0.4, 5)!;
    expect(hip.gables.length).toBe(0);
    expect(hip.tris.length).toBeGreaterThan(6);
  });
});
