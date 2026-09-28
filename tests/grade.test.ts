import { describe, it, expect } from 'vitest';
import { gradeRoads, inclineOf, type GradeGrid } from '../src/world/grade';
import type { Road } from '../src/world/data';

// a cell's DEM grid with its 96 m overhang, 4 m pitch
const grid = (f: (x: number, z: number) => number): GradeGrid => {
  const pitch = 4, x0 = -96, z0 = -96, nx = 304, nz = 304, heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = f(x0 + (i + 0.5) * pitch, z0 + (j + 0.5) * pitch);
  return { x0, z0, pitch, nx, nz, heights };
};
const at = (g: GradeGrid, x: number, z: number) => {
  const fx = (x - g.x0) / g.pitch - 0.5, fz = (z - g.z0) / g.pitch - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * g.nx + i;
  return (g.heights[k] * (1 - u) + g.heights[k + 1] * u) * (1 - v) + (g.heights[k + g.nx] * (1 - u) + g.heights[k + g.nx + 1] * u) * v;
};
const road = (pts: [number, number][], c = 'residential', w = 8, extra: Partial<Road> = {}) => ({ p: pts.flatMap(([x, z]) => [x * 10, z * 10]), c, w, ...extra }) as Road;
const maxGrade = (g: GradeGrid, x0: number, x1: number, z: number) => {
  let m = 0;
  for (let x = x0; x < x1; x += 4) m = Math.max(m, Math.abs(at(g, x + 4, z) - at(g, x, z)) / 4);
  return m;
};

describe('road grading', () => {
  it('a street over a smeared 20 m bluff is graded to its class (not a 50% ski slope)', () => {
    // a retaining wall the DEM smeared into a 40 m ramp (50%)
    const g = grid((x) => Math.max(0, Math.min(20, (x - 480) / 2)));
    expect(maxGrade(g, 150, 850, 500)).toBeGreaterThan(0.45);
    gradeRoads(g, [road([[100, 500], [900, 500]])]);
    expect(maxGrade(g, 150, 850, 500)).toBeLessThan(0.26);
  });
  it('an arterial is held to its own, gentler grade; a tagged incline is left steep', () => {
    const g = grid((x) => Math.max(0, Math.min(12, (x - 480) / 2)));
    gradeRoads(g, [road([[100, 300], [900, 300]], 'primary', 12)]);
    // (the long window — ±88 m, all a cell's overhang allows — spreads 12 m to ~14%: an arterial
    // doesn't climb a bluff in reality, the data just smeared one under it)
    expect(maxGrade(g, 150, 850, 300)).toBeLessThan(0.16);
    const t = grid((x) => Math.max(0, Math.min(12, (x - 480) / 2)));
    gradeRoads(t, [road([[100, 300], [900, 300]], 'residential', 8)], () => 0.45);
    expect(maxGrade(t, 150, 850, 300)).toBeGreaterThan(0.26); // mapped as steep: steeper than any untagged street may be
  });
  it('an honest hill keeps its grade; flat ground and ground away from the streets are untouched', () => {
    const g = grid((x) => x * 0.18); // an even 18% (Queen Anne)
    const before = at(g, 500, 700);
    const rep = gradeRoads(g, [road([[100, 500], [900, 500]])]);
    expect(maxGrade(g, 200, 800, 500)).toBeLessThan(0.19);
    expect(maxGrade(g, 200, 800, 500)).toBeGreaterThan(0.17);
    expect(Math.abs(at(g, 500, 700) - before)).toBeLessThan(1e-6); // 200 m from the street
    expect(rep.maxShift).toBeLessThan(0.5);
  });
  it('two streets crossing on a slope meet at one height, and a seam is graded the same from both sides', () => {
    const f = (x: number, z: number) => x * 0.1 + Math.sin(z * 0.05) * 3;
    const roads = [road([[0, 500], [1000, 500]]), road([[500, 0], [500, 1000]])];
    const a = grid(f), b = grid(f);
    gradeRoads(a, roads);
    // the same roads seen by the neighbour's tile (listed in another order) grade the same
    gradeRoads(b, [...roads].reverse());
    for (let x = 100; x < 900; x += 37) expect(Math.abs(at(a, x, 500) - at(b, x, 500))).toBeLessThan(1e-4);
    // across the crossing, both streets' centres sit on one plateau
    expect(Math.abs(at(a, 500, 496) - at(a, 496, 500))).toBeLessThan(0.3);
  });
  it('a short block between two junctions on a smeared bluff: the junctions meet halfway, nothing past 25%', () => {
    // Union St between Western Ave and Post Alley: a 20 m block the DEM puts on a 50% smear
    const f = (x: number) => Math.max(0, Math.min(10, (x - 480) / 2));
    const roads = [
      road([[100, 500], [480, 500]]), road([[480, 500], [500, 500]]), road([[500, 500], [900, 500]]),
      road([[480, 300], [480, 500], [480, 700]]), road([[500, 300], [500, 500], [500, 700]]),
    ];
    const g = grid((x) => f(x));
    expect(maxGrade(g, 150, 850, 500)).toBeGreaterThan(0.45);
    gradeRoads(g, roads);
    expect(maxGrade(g, 150, 850, 500)).toBeLessThan(0.25);
    // the cross streets still meet the block at its junctions (one height across each crossing)
    expect(Math.abs(at(g, 480, 500) - at(g, 480, 506))).toBeLessThan(0.6);
    expect(Math.abs(at(g, 500, 500) - at(g, 500, 494))).toBeLessThan(0.6);
  });
  it('no untagged street passes its hard limit, even where the smoothing alone would leave it', () => {
    // a 30 m cliff the DEM smeared over 30 m (100%), a residential street straight over it
    const g = grid((x) => Math.max(0, Math.min(30, x - 485)));
    gradeRoads(g, [road([[100, 500], [900, 500]])]);
    expect(maxGrade(g, 150, 850, 500)).toBeLessThan(0.25);
  });
  it('a street cut into a side slope gets a retaining wall on the uphill side only — not across a crossing, a path or a building', () => {
    // a hillside rising 30% to the south (+z); a street along x cut level into it, a cross street,
    // a flight of steps climbing from the sidewalk, and a building on the uphill kerb
    const g = grid((_x, z) => Math.max(0, (z - 400) * 0.3));
    const roads = [road([[100, 500], [500, 500], [900, 500]], 'residential', 8), road([[500, 300], [500, 500], [500, 700]], 'residential', 8), road([[700, 506], [700, 540]], 'steps', 2)];
    const house = (x: number, z: number) => x > 300 && x < 330 && z > 505 && z < 530;
    // (the street along the contour: the DEM gives it a cross-fall of 30% — the grade flattens it)
    const rep = gradeRoads(g, roads, () => null, { walls: true, blocked: house });
    expect(rep.walls.length).toBeGreaterThan(0);
    const panels: number[][] = [];
    for (let i = 0; i < rep.walls.length; i += 8) panels.push(rep.walls.slice(i, i + 8));
    const along = panels.filter((w) => Math.abs(w[1] - w[3]) < 1 && Math.abs(w[1] - 500) < 10);
    // uphill (south, +z) only, at the back of the sidewalk, facing the street (north)
    expect(along.length).toBeGreaterThan(40);
    for (const w of along) {
      expect(w[1]).toBeGreaterThan(505);
      const sz = w[2] - w[0]; // the street lies toward (−dz, dx): for a wall along x, dx's sign gives it
      expect(Math.sign(sz)).toBe(-1); // (dx < 0 → toward −z: north, the street)
      expect(w[5]).toBeGreaterThan(w[4] + 0.6);
    }
    const mid = (w: number[]) => (w[0] + w[2]) / 2;
    expect(along.some((w) => Math.abs(mid(w) - 500) < 8)).toBe(false); // the crossing stays open
    expect(along.some((w) => Math.abs(mid(w) - 700) < 2)).toBe(false); // a gap for the steps
    expect(along.some((w) => mid(w) > 302 && mid(w) < 328)).toBe(false); // the house is its own wall
  });
  it('reads incline tags', () => {
    expect(inclineOf('15%')).toBeCloseTo(0.15);
    expect(inclineOf('-8.5 %')).toBeCloseTo(0.085);
    expect(inclineOf('up')).toBeNull();
  });
});
