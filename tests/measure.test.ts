import { describe, it, expect } from 'vitest';
import { measureFootprint, obb, robustFit } from '../src/world/measure';
import { LidarGrid, pullPush, mercToLocal, toMerc, candidates, depthFor, depthForDensity, detectTrees, detectBuildings, outlineCells, ringMask, projectLocal, unprojectLocal, type LidarIndex } from '../src/world/lidarCore';

type P2 = [number, number];
// A house: rectangle 2L×2W centred at (cx,cz) rotated by `a`, with a roof function of (u,v).
function house(cx: number, cz: number, L: number, W: number, a: number) {
  const ux = Math.cos(a), uz = Math.sin(a);
  const ring: P2[] = [[-L, -W], [L, -W], [L, W], [-L, W]].map(([u, v]) => [cx + u * ux - v * uz, cz + u * uz + v * ux]);
  const uv = (x: number, z: number) => { const dx = x - cx, dz = z - cz; return [dx * ux + dz * uz, -dx * uz + dz * ux]; };
  return { ring, uv };
}
const inside = (ring: P2[], x: number, z: number) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
// 1 m nearest-bin raster of a roof, like the real HAG grid
function raster(ring: P2[], roof: (x: number, z: number) => number, noise = 0) {
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  return (x: number, z: number) => {
    const bx = Math.floor(x) + 0.5, bz = Math.floor(z) + 0.5;
    return inside(ring, bx, bz) ? roof(bx, bz) + rnd() : 0;
  };
}

describe('measure: roof fits', () => {
  it('recovers a gable (eave 5.5 m, 6:12 pitch) on a rotated 14×9 m house', () => {
    const { ring, uv } = house(10, -4, 7, 4.5, 0.4);
    const at = raster(ring, (x, z) => { const [, v] = uv(x, z); return 5.5 + 0.5 * (4.5 - Math.abs(v)); }, 0.08);
    const m = measureFootprint(ring, at)!;
    expect(m.rs).toBe('gable');
    expect(m.eav).toBeCloseTo(5.5, 0);
    expect(Math.abs(m.h - 7.75)).toBeLessThan(0.45);
    expect(m.q).toBeGreaterThan(0.6);
  });
  it('tells a hip from a gable', () => {
    const { ring, uv } = house(0, 0, 8, 5, 1.1);
    const at = raster(ring, (x, z) => { const [u, v] = uv(x, z); return 4 + 0.45 * Math.min(5 - Math.abs(v), 8 - Math.abs(u)); }, 0.05);
    const m = measureFootprint(ring, at)!;
    expect(m.rs).toBe('hip');
    expect(Math.abs(m.eav - 4)).toBeLessThan(0.4);
  });
  it('calls a flat commercial roof flat, ignoring rooftop units', () => {
    const { ring } = house(0, 0, 20, 12, 0.2);
    const at = raster(ring, (x, z) => 9.2 + (Math.abs(x - 3) < 1.5 && Math.abs(z + 2) < 1.5 ? 2 : 0), 0.1);
    const m = measureFootprint(ring, at)!;
    expect(m.rs).toBe('flat');
    expect(m.h).toBeCloseTo(9.2, 0);
  });
  it('survives a tree over part of the roof', () => {
    const { ring, uv } = house(0, 0, 6, 4, 0);
    const at = raster(ring, (x, z) => { const [, v] = uv(x, z); const r = 3 + 0.6 * (4 - Math.abs(v)); return x > 3 && z > 0 ? r + 5 : r; });
    const m = measureFootprint(ring, at)!;
    expect(m.rs).toBe('gable');
    expect(Math.abs(m.h - 5.4)).toBeLessThan(0.6);
  });
  it('calls an L-shaped roof "pitched" (style left to the map) with a true eave', () => {
    const ring: [number, number][] = [[0, 0], [14, 0], [14, 8], [6, 8], [6, 16], [0, 16]];
    const d = (x: number, z: number) => Math.min(x, z, 14 - x, 16 - z, Math.max(8 - z, 6 - x) > 0 ? Math.max(8 - z, 6 - x) : 0);
    const at = raster(ring, (x, z) => 3.5 + 0.6 * d(x, z), 0.05);
    const m = measureFootprint(ring, at, 'gable')!;
    expect(m.rs).toBe('pitched');
    expect(Math.abs(m.eav - 3.5)).toBeLessThan(0.5);
  });
  it('restates a cross-ridge gable for the long-axis skeleton at the measured pitch', () => {
    const { ring, uv } = house(0, 0, 6, 5, 0);
    const at = raster(ring, (x, z) => { const [u] = uv(x, z); return 3 + 0.5 * (6 - Math.abs(u)); }, 0.03);
    const m = measureFootprint(ring, at)!;
    expect(m.rs).toBe('gableX');
    expect(Math.abs(m.h - 6)).toBeLessThan(0.4);
    expect(Math.abs(m.h - m.eav - 0.5 * 5)).toBeLessThan(0.4); // rise over W = 5 at k = 0.5
  });
  it('returns null where nothing stands (built after the survey)', () => {
    const { ring } = house(0, 0, 6, 4, 0);
    expect(measureFootprint(ring, () => 0.2)).toBeNull();
  });
  it('obb finds the long axis', () => {
    const { ring } = house(0, 0, 9, 3, 0.7);
    const b = obb(ring);
    expect(b.L).toBeCloseTo(9, 3);
    expect(b.W).toBeCloseTo(3, 3);
  });
  it('robustFit ignores outliers', () => {
    const f = Float64Array.from({ length: 50 }, (_, i) => i / 10), h = Float64Array.from(f, (x, i) => 2 + 0.5 * x + (i % 9 === 0 ? 6 : 0));
    const r = robustFit(f, h);
    expect(r.k).toBeCloseTo(0.5, 2);
    expect(r.e).toBeCloseTo(2, 2);
  });
});

describe('lidarCore', () => {
  const origin = { lat: 40.362, lon: -73.9755 };
  it('mercator→local affine is exact to a few centimetres over a 1 km cell', () => {
    const box = { x0: 1024, z0: -2048, x1: 2048, z1: -1024 };
    const A = mercToLocal(origin, box);
    for (const [x, z] of [[2048, -1024], [1500, -1500], [1100, -2000]]) {
      const [la, lo] = unprojectLocal(origin, x, z);
      const [X, Y] = toMerc(la, lo);
      expect(Math.hypot(A.a * X + A.b * Y + A.c - x, A.d * X + A.e * Y + A.f - z)).toBeLessThan(0.05);
    }
    const [x, z] = projectLocal(origin, 40.37, -73.97);
    expect(unprojectLocal(origin, x, z)[0]).toBeCloseTo(40.37, 9);
  });
  it('pull-push fills ground under a roof from its surroundings', () => {
    const w = 40, h = 40, s = new Float32Array(w * h), n = new Uint16Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < 10 || i > 30 || j < 10 || j > 30) (s[j * w + i] = 5 + i * 0.01), (n[j * w + i] = 1);
    const g = pullPush(s, n, w, h);
    expect(g[20 * w + 20]).toBeGreaterThan(4.9);
    expect(g[20 * w + 20]).toBeLessThan(5.5);
    expect(g[0]).toBeCloseTo(5, 5);
  });
  it('bins points into height above ground', () => {
    const G = new LidarGrid(0, 0, 1, 20, 20);
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
      const roof = i >= 5 && i < 15 && j >= 5 && j < 15;
      G.add(i + 0.5, j + 0.5, roof ? 17 : 10, roof ? 1 : 2);
    }
    const H = G.hag();
    expect(H[10 * 20 + 10]).toBeCloseTo(7, 5);
    expect(H[0]).toBeCloseTo(0, 5);
  });
  it('picks the newest project covering a cell', () => {
    const sq = (w: number, s: number, e: number, n: number) => [w, s, e - w, 0, 0, n - s, w - e, 0, 0, s - n];
    const idx: LidarIndex = { v: 1, q: 1000, ept: '', p: [
      { n: 'OLD_2010', y: 2010, b: [-75000, 39000, -73000, 41000], r: [sq(-75000, 39000, -73000, 41000)] },
      { n: 'NEW_2019', y: 2019, b: [-74100, 40300, -73900, 40400], r: [sq(-74100, 40300, -73900, 40400)] },
      { n: 'FAR_2021', y: 2021, b: [-80000, 30000, -79000, 31000], r: [sq(-80000, 30000, -79000, 31000)] },
    ] };
    expect(candidates(idx, { s: 40.36, w: -73.98, n: 40.37, e: -73.97 }).map((p) => p.n)).toEqual(['NEW_2019', 'OLD_2010']);
  });
  it('depthFor reaches ~1 m spacing', () => {
    const d = depthFor({ bounds: [-8344569, 4877261, 0, -8189405, 5032425, 0], span: 256 }, 40.36);
    expect(d).toBe(9);
  });
});

describe('lidarCore: EPT depth by density', () => {
  it('stops at the depth whose cumulative density reaches the target', () => {
    // bounds 1024 m wide at the equator; one column per depth over the cell
    const E = { bounds: [0, 0, 0, 1024, 1024, 100], span: 128 };
    const H: Record<string, number> = { '0-0-0-0': 1024 * 1024 * 0.1, '1-0-0-0': 512 * 512 * 0.1, '1-0-0-1': 512 * 512 * 0.1, '2-0-0-0': 256 * 256 * 0.5, '3-0-0-0': 128 * 128 * 4 };
    // cumulative: d0 0.1, d1 0.1+0.2 (two stacked Z nodes share a column) = 0.3, d2 0.8, d3 4.8
    expect(depthForDensity(E, H, Object.keys(H), 0, 0.5, 9)).toBe(2);
    expect(depthForDensity(E, H, Object.keys(H), 0, 2, 9)).toBe(3);
    expect(depthForDensity(E, H, Object.keys(H), 0, 50, 5)).toBe(5);
  });
});

describe('lidarCore: coverage', () => {
  it('counts a sparse but complete survey as covered', () => {
    const G = new LidarGrid(0, 0, 1, 40, 40);
    let s = 7;
    for (let n = 0; n < 1600; n++) { s = (s * 16807) % 2147483647; const x = (s % 4000) / 100; s = (s * 16807) % 2147483647; G.add(x, (s % 4000) / 100, 5, 2); }
    expect(G.surfaceFraction()).toBeGreaterThan(0.9);
  });
});

describe('lidarCore: trees', () => {
  const g = { x0: 0, z0: 0, res: 1, w: 80, h: 80 };
  const box = { x0: 0, z0: 0, x1: 80, z1: 80 };
  // three crowns (h, radius), a flat unmapped roof, a mapped house, a pole — with leafy noise
  function scene() {
    const H = new Float32Array(g.w * g.h);
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
    const crowns = [[15, 15, 12, 4], [40, 20, 8, 3], [20, 55, 18, 6]];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const x = i + 0.5, z = j + 0.5;
      let v = 0;
      for (const [cx, cz, h, r] of crowns) {
        const d = Math.hypot(x - cx, z - cz);
        if (d < r * 1.3) v = Math.max(v, h * (1 - 0.45 * (d / r) ** 2) + rnd() * 1.2);
      }
      if (x > 55 && x < 70 && z > 50 && z < 62) v = 6.5; // unmapped flat roof
      if (x > 50 && x < 62 && z > 8 && z < 18) v = 7 - 0.5 * Math.abs(z - 13); // mapped gable house
      if (Math.abs(x - 70.5) < 0.6 && Math.abs(z - 30.5) < 0.6) v = 9; // pole
      H[j * g.w + i] = v;
    }
    return H;
  }
  it('finds each crown once, with a sane radius, and nothing else', () => {
    const house: [number, number][] = [[50, 8], [62, 8], [62, 18], [50, 18]];
    const mask = ringMask(g, [house], 1);
    const T = detectTrees(g, scene(), mask, box, true);
    expect(T.length).toBe(3);
    const big = T.find((t) => Math.hypot(t.x - 20, t.z - 55) < 2)!;
    expect(big.h).toBeGreaterThan(16);
    expect(big.r).toBeGreaterThan(3.5);
    expect(big.r).toBeLessThan(8);
  });
  it('ringMask covers the footprint plus the pad', () => {
    const m = ringMask(g, [[[10, 10], [20, 10], [20, 20], [10, 20]]], 1);
    expect(m[15 * 80 + 15]).toBe(1);
    expect(m[15 * 80 + 20]).toBe(1); // 0.5 m outside
    expect(m[15 * 80 + 23]).toBe(0);
  });
});

describe('lidarCore: unmapped buildings', () => {
  const g = { x0: 0, z0: 0, res: 1, w: 100, h: 100 };
  const box = { x0: 0, z0: 0, x1: 100, z1: 100 };
  function scene() {
    const H = new Float32Array(g.w * g.h);
    let s = 9;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const x = i + 0.5, z = j + 0.5;
      let v = rnd() * 0.05;
      if (x > 10 && x < 24 && z > 10 && z < 20) v = 4 + 0.5 * (5 - Math.abs(z - 15)); // gable 14×10
      if ((x > 40 && x < 60 && z > 10 && z < 18) || (x > 40 && x < 48 && z > 18 && z < 34)) v = 6.2; // flat L
      const d = Math.hypot(x - 30, z - 70);
      if (d < 6) v = 12 * (1 - 0.4 * (d / 6) ** 2) + rnd() * 1.5; // a tree
      if (x > 70 && x < 84 && z > 60 && z < 72) v = 5.5; // a mapped building
      H[j * g.w + i] = v;
    }
    return H;
  }
  it('outlines unmapped roofs (rectangle, L) and skips trees and mapped footprints', () => {
    const mapped = ringMask(g, [[[70, 60], [84, 60], [84, 72], [70, 72]]], 1);
    const B = detectBuildings(g, scene(), null, mapped, box);
    expect(B.length).toBe(2);
    const gable = B.find((b) => b.ring.every(([x]) => x < 30))!;
    expect(gable.ring.length).toBe(4);
    expect(Math.abs(gable.area - 140)).toBeLessThan(30);
    const L = B.find((b) => b.ring.some(([x]) => x > 40))!;
    expect(L.ring.length).toBeGreaterThanOrEqual(6);
  });
  it('outlineCells traces an L', () => {
    const on = [true, true, false, true, false, false, false, false, false];
    const loop = outlineCells(on, 3)!;
    expect(loop.length).toBe(6);
  });
});
