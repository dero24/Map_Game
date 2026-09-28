import { describe, it, expect } from 'vitest';
import { demLayer } from '../src/world/dem';
import { shoreStrip, shoreDistance, SHORE_W } from '../src/world/shore';

// A cell 160 m square on a 4 m grid: land to the west, the sea from x = 80 m east (a seawall
// running north–south), and — in the second case — a lake instead of the sea.
const grid = (sea: (x: number, z: number) => boolean, lake = false) => {
  const nx = 40, nz = 40, h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = sea((i + 0.5) * 4, (j + 0.5) * 4) ? -2 : 3;
  const L = demLayer({ heights: h, x0: 0, z0: 0, pitch: 4, nx, nz });
  if (lake) new Uint8Array(L.buf, L.layout.oceanD.offset, nx * nz).fill(255);
  return L;
};
const box = { x0: 0, z0: 0, x1: 160, z1: 160 };

describe('the shore strip', () => {
  it('measures every sea node from the land, and lays a strip along the coast only', () => {
    const L = grid((x) => x > 80);
    const d = shoreDistance(L);
    expect(d[5 * 40 + 19]).toBe(0); // the land's last node (x = 78)
    expect(d[5 * 40 + 20]).toBeCloseTo(4, 5); // the first sea node
    expect(d[5 * 40 + 25]).toBeCloseTo(24, 5);
    const g = shoreStrip(L, box)!;
    const p = g.getAttribute('position'), s = g.getAttribute('aShore');
    let xmin = Infinity, xmax = -Infinity;
    for (let i = 0; i < p.count; i++) {
      (xmin = Math.min(xmin, p.getX(i))), (xmax = Math.max(xmax, p.getX(i)));
      expect(p.getY(i)).toBeGreaterThan(0); // just over the sea plane
      if (p.getX(i) < 80) expect(s.getX(i)).toBe(0); // the waterline is the land's edge
    }
    expect(xmin).toBeCloseTo(78, 5); // from the waterline…
    expect(xmax).toBeLessThanOrEqual(80 + SHORE_W + 4); // …a strip's width out, no further
    expect(g.getIndex()!.count / 6).toBe(39 * Math.ceil((SHORE_W + 4) / 4 - 1)); // one row of quads per node row
  });
  it('none where there is no coast: all land, all sea, or a lake (its own sheet)', () => {
    expect(shoreStrip(grid(() => false), box)).toBeNull();
    expect(shoreStrip(grid(() => true), box)).toBeNull();
    expect(shoreStrip(grid((x) => x > 80, true), box)).toBeNull();
  });
  it('a cell lays only its own part of a coast that runs on', () => {
    const g = shoreStrip(grid((x) => x > 80), { x0: 0, z0: 0, x1: 160, z1: 80 })!;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getZ(i)).toBeLessThanOrEqual(82);
  });
});
