import { describe, it, expect } from 'vitest';
import { lotLayout, type P } from '../src/world/lots';

const rect = (x: number, z: number, w: number, d: number, rot = 0): P[] => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return ([[0, 0], [w, 0], [w, d], [0, d]] as P[]).map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]);
};
const inside = (ring: P[], x: number, z: number) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};

describe('parking lots', () => {
  it('lays stalls along the longest edge, all inside, with aisles between the rows', () => {
    const ring = rect(100, 200, 60, 42, 0.4);
    const L = lotLayout(ring)!;
    expect(L).toBeTruthy();
    // 60 m of frontage → 22 stalls a row; 42 m deep → the edge row + two back-to-back pairs
    expect(L.stalls.length).toBeGreaterThan(80);
    expect(L.stalls.length).toBeLessThan(120);
    for (const s of L.stalls) expect(inside(ring, s.x, s.z)).toBe(true);
    // rows are aligned with the long edge: every car faces across it (±v)
    for (const s of L.stalls) {
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      expect(Math.abs(fx * L.v[0] + fz * L.v[1])).toBeGreaterThan(0.99);
    }
    expect(L.lines.length % 4).toBe(0);
    expect(L.lines.length / 4).toBeGreaterThan(L.stalls.length);
  });
  it('is deterministic, and null for scraps', () => {
    const ring = rect(0, 0, 40, 25);
    expect(lotLayout(ring)).toEqual(lotLayout(ring));
    expect(lotLayout(rect(0, 0, 6, 4))).toBeNull();
    expect(lotLayout(rect(0, 0, 40, 5))).toBeNull(); // too shallow for a stall
  });
  it('caps the stalls it returns', () => {
    expect(lotLayout(rect(0, 0, 200, 150), 50)!.stalls.length).toBe(50);
  });
});
