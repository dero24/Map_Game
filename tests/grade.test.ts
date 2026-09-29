import { describe, it, expect } from 'vitest';
import { gradeRoads, inclineOf, type GradeGrid } from '../src/world/grade';
import type { Road } from '../src/world/data';
import hillside from './fixtures/grade-hillside.json';

// a cell's DEM grid with its 96 m overhang, 4 m pitch (the cell at the origin, or the one east of it)
const grid = (f: (x: number, z: number) => number, x0 = -96): GradeGrid => {
  const pitch = 4, z0 = -96, nx = 304, nz = 304, heights = new Float32Array(nx * nz);
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
const sv = (pts: [number, number][], kind = 'driveway') => road(pts, 'service', 4, { sv: kind });
const on = (g: GradeGrid) => (x: number, z: number) => at(g, x, z);
/** The reviewer's audit (tools/grade-audit.js): a way's surface sampled every 4 m from `phase` m
 *  along it, the steepest |Δh| over the chord between each sample's neighbours — counted only where
 *  all three lie between `s0` and `s1` m along it, and where `keep` holds. */
const audit = (surf: (x: number, z: number) => number, r: Road, o: { s0?: number; s1?: number; phase?: number; keep?: (x: number, z: number) => boolean } = {}) => {
  const pts: [number, number, number][] = [];
  let next = o.phase ?? 0, run = 0;
  for (let i = 0; i + 3 < r.p.length; i += 2) {
    const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az);
    while (next <= run + L) { const t = L ? (next - run) / L : 0; pts.push([ax + (bx - ax) * t, az + (bz - az) * t, next]); next += 4; }
    run += L;
  }
  let worst = 0;
  for (let k = 1; k + 1 < pts.length; k++) {
    const [ax, az, sa] = pts[k - 1], [bx, bz, sb] = pts[k + 1];
    if (sa < (o.s0 ?? 0) || sb > (o.s1 ?? Infinity) || (o.keep && !(o.keep(ax, az) && o.keep(bx, bz)))) continue;
    worst = Math.max(worst, Math.abs(surf(bx, bz) - surf(ax, az)) / Math.hypot(bx - ax, bz - az));
  }
  return worst;
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
  it('a street climbing a hill through a grid of cross streets has no knee at the junctions', () => {
    // Queen Anne: a 30% hillside, a street straight up it, cross streets every 70 m. Each crossing is
    // a flat band a cross street wide; the climb must happen between the bands — at the band's
    // edge the ground once caught up with the capped profile in a few metres (a 50% knee: the car
    // on the grade pitched like a ski jump)
    const worstOn = (slope: number) => {
      const g = grid((x) => x * slope);
      // (the map's crossings share their node)
      const xs = [300, 370, 440, 510, 580, 650, 720];
      const roads = [road([[100, 500], ...xs.map((x): [number, number] => [x, 500]), [900, 500]], 'residential', 11)];
      for (const x of xs) roads.push(road([[x, 300], [x, 500], [x, 700]], 'residential', 11));
      gradeRoads(g, roads);
      let worst = 0;
      for (let x = 220; x < 780; x += 2) worst = Math.max(worst, Math.abs(at(g, x + 2, 500) - at(g, x - 2, 500)) / 4);
      return worst;
    };
    expect(worstOn(0.18)).toBeLessThan(0.25); // (18% between the bands' flats: ~22% where it climbs)
    expect(worstOn(0.22)).toBeLessThan(0.3); // (steeper than a street is built: evenly over, never a step)
  });
  // ---- the live audit's offenders, one cause each (the grader's old answer in brackets) ----
  it('a driveway stopping short in a hillside ends on its own ground, not on a ramp up into the untouched hill', () => {
    // a garage cut into a 38% slope: the grid past a dead end was left as the hill, and the driveway's
    // last metres were read off a lattice half at its profile, half at the hill (54%)
    const f = (_x: number, z: number) => Math.max(0, (500 - z) * 0.38);
    const g = grid(f), drive = sv([[500, 500], [500, 468]]);
    gradeRoads(g, [road([[300, 500], [500, 500], [700, 500]], 'residential', 11.8), drive]);
    expect(audit(on(g), drive)).toBeLessThan(0.25);
    expect(Math.abs(at(g, 500, 436) - f(500, 436))).toBeLessThan(1e-3); // (the hill 30 m on keeps its ground)
  });
  it('a street ending at the foot of steps up a bank is its own ground to its last metre', () => {
    const g = grid((x) => Math.max(0, (x - 400) * 0.4)), street = road([[100, 500], [460, 500]], 'residential', 11.8);
    gradeRoads(g, [street, road([[460, 500], [520, 500]], 'steps', 2)]);
    expect(audit(on(g), street)).toBeLessThan(0.25); // (52%)
  });
  it('alleys joining a street leave its climb alone: they tie into it, and only its own rank makes a plateau', () => {
    // an alley's node made a plateau on the street, flat for the street's own width either side at the
    // mean ground: alleys every 30 m up a 22% hill squeezed its climb between the bands (33%)
    const g = grid((x) => x * 0.22), xs = [400, 430, 460, 490, 520];
    const street = road([[100, 500], ...xs.map((x): [number, number] => [x, 500]), [900, 500]], 'residential', 11.8);
    gradeRoads(g, [street, ...xs.map((x) => sv([[x, 500], [x, 440]], 'alley'))]);
    expect(audit(on(g), street)).toBeLessThan(0.25);
    expect((at(g, 464, 500) - at(g, 456, 500)) / 8).toBeGreaterThan(0.2); // (no flat band at an alley)
  });
  it("a street crossed at 30° is flat across the whole of the crossing's carriageway, not a perpendicular band", () => {
    // a 50% slope the crossing street follows the contour of, the other climbing it at 25%: at 30° the
    // crossing's carriageway covers it for twice its width — past a perpendicular crossing's band the
    // two were averaged, the crossing's level ground dragging the climb down (30%)
    const g = grid((x, z) => 0.5 * ((x - 500) * 0.5 - (z - 500) * 0.866));
    const main = road([[300, 500], [500, 500], [700, 500]], 'residential', 11.8);
    gradeRoads(g, [main, road([[326.8, 400], [500, 500], [673.2, 600]], 'residential', 11.8)]);
    expect(audit(on(g), main, { s0: 160, s1: 240 })).toBeLessThan(0.25);
    expect(Math.abs(at(g, 490, 500) - at(g, 500, 500))).toBeLessThan(0.05);
  });
  it("an alley leaving a street at an angle climbs from the street's own surface — the carriageway it crosses is the street's", () => {
    // the street cut level across a 30% hill, the alley leaving it at 60° at its limit: its first metres
    // lie on the street's carriageway, where the two were averaged (27%)
    const g = grid((_x, z) => Math.max(0, (500 - z) * 0.3));
    const alley = sv([[500, 500], [500 + 120 * Math.cos(1.05), 500 - 120 * Math.sin(1.05)]], 'alley');
    gradeRoads(g, [road([[300, 500], [500, 500], [800, 500]], 'residential', 11.8), alley]);
    expect(audit(on(g), alley, { s1: 32 })).toBeLessThan(0.25);
  });
  it("a driveway along an arterial's sidewalk on a bank, then climbing away, rides its own ground — and the arterial keeps its level", () => {
    // a 4 m way's surface is read off nodes up to 2.8 m from its centreline: those on the arterial's
    // carriageway pulled it down to the arterial and piled its climb into the metres past (26%)
    const g = grid((x, z) => (z < 505 ? 0 : Math.min(2.4, (z - 505) * 0.6) + Math.max(0, x - 560) * 0.22));
    const drive = sv([[480, 500], [490, 507.6], [560, 507.6], [600, 540]]);
    gradeRoads(g, [road([[300, 500], [480, 500], [800, 500]], 'secondary', 13.4), drive]);
    expect(audit(on(g), drive)).toBeLessThan(0.25);
    for (let x = 320; x <= 780; x += 20) expect(Math.abs(at(g, x, 500))).toBeLessThan(0.1);
  });
  it('a driveway climbing through a right-angle bend holds its limit over the chord a car spans', () => {
    // 24% a metre round the corner is 34% across the 5.7 m chord of the 8 m a car spans there (30%)
    const f = (x: number, z: number) => 0.3 * Math.min(80, Math.max(0, 520 - z)) + (z < 520 ? 0.3 * Math.min(80, Math.max(0, x - 500)) : 0);
    const g = grid(f), drive = sv([[500, 540], [500, 440], [620, 440]]);
    gradeRoads(g, [road([[300, 540], [500, 540], [520, 540]], 'residential', 11.8), drive]);
    expect(audit(on(g), drive, { s0: 80, s1: 140 })).toBeLessThan(0.25);
  });
  it('two cells grade the ways across their seam identically, each on its own grid with the ways its tile carries', () => {
    // a crest at the seam, a smeared bluff 100–130 m past it (inside the east cell's grid, past the
    // west one's): the smoothing reached 160 m along a way, the west cell read the bluff as its grid's
    // flat edge, and the surface stepped where it switches from one cell's ground to the other's (25 mm)
    const crest = (t: number) => (Math.abs(t) < 150 ? -0.0006 * t * t : -13.5 - 0.18 * (Math.abs(t) - 150));
    const f = (x: number, z: number) => 40 + crest(x - 1024) + Math.max(0, Math.min(12, (x - 1124) * 0.4)) + 0.04 * (z - 500);
    const roads = [
      road([[700, 500], [980, 500], [1010, 500], [1060, 500], [1400, 500]], 'residential', 11.8),
      road([[980, 300], [980, 500], [980, 700]], 'residential', 11.8),
      road([[1060, 300], [1060, 500], [1060, 700]], 'residential', 11.8),
      sv([[1010, 500], [1010, 460]]),
      road([[700, 640], [1400, 640]], 'secondary', 13.4),
      sv([[1000, 640], [1040, 610], [1090, 600]], 'alley'),
    ];
    // (a tile carries every way that comes within 48 m of its cell, whole)
    const carried = (r: Road, x0: number, x1: number) => r.p.some((_, i) => i % 2 === 0 && i + 2 < r.p.length && Math.min(r.p[i], r.p[i + 2]) / 10 < x1 + 48 && Math.max(r.p[i], r.p[i + 2]) / 10 > x0 - 48);
    const A = grid(f), B = grid(f, 928);
    gradeRoads(A, roads.filter((r) => carried(r, 0, 1024)), () => null, { walls: true });
    gradeRoads(B, [...roads].reverse().filter((r) => carried(r, 1024, 2048)), () => null, { walls: true });
    for (const r of roads)
      for (let i = 0; i + 3 < r.p.length; i += 2)
        for (let t = 0; t <= 1; t += 1 / 256) {
          const x = (r.p[i] + (r.p[i + 2] - r.p[i]) * t) / 10, z = (r.p[i + 1] + (r.p[i + 3] - r.p[i + 1]) * t) / 10;
          if (Math.abs(x - 1024) <= 4) expect(Math.abs(at(A, x, z) - at(B, x, z))).toBeLessThan(1e-3);
        }
    // …and across the seam, the ground as the game reads it (each cell's own)
    for (const r of roads) expect(audit((x, z) => (x < 1024 ? at(A, x, z) : at(B, x, z)), r)).toBeLessThan(0.25);
  });
  it('the last pass holds the surface itself: every way of a steep neighbourhood within its limit at every metre, whatever order its ways come in', () => {
    // a 20% hillside with a smeared 7 m bluff across its blocks — streets, the alleys between them,
    // driveways into the hill. One alley's block climbs 31 m in 120 m, more than it may: where its own
    // ground can't hold the excess, the streets it joins give
    const f = (x: number, z: number) => 0.2 * (x - 300) + 2.5 * Math.sin(z / 35) + 7 / (1 + Math.exp(-(x + z - 1000) / 8));
    const X = [350, 470, 590, 710], Z = [380, 480, 580];
    const roads = [
      ...Z.map((z) => road([[250, z], ...X.map((x): [number, number] => [x, z]), [750, z]], 'residential', 11.8)),
      ...X.map((x) => road([[x, 330], ...Z.map((z): [number, number] => [x, z]), [x, 630]], 'residential', 11.8)),
      ...[430, 530].map((z) => sv(X.map((x): [number, number] => [x, z]), 'alley')),
      sv([[410, 480], [410, 452]]), sv([[530, 380], [545, 352]]), sv([[650, 580], [650, 612]]), sv([[590, 430], [622, 430], [642, 410]]),
    ];
    const g = grid(f), h = grid(f);
    gradeRoads(g, roads, () => null, { walls: true });
    gradeRoads(h, [...roads].reverse(), () => null, { walls: true });
    for (const r of roads) for (const phase of [0, 1, 2, 3]) expect(audit(on(g), r, { phase })).toBeLessThan(0.25);
    let d = 0;
    for (let k = 0; k < g.heights.length; k++) d = Math.max(d, Math.abs(g.heights[k] - h.heights[k]));
    expect(d).toBeLessThan(1e-4);
  });
  it('on real ground: two driveways that climbed into a hillside at 56% and 33% hold their limit, and so does every way round them', () => {
    // (a live tile's ground before grading and its drivable ways, trimmed to 192 m; counted where the
    // grid holds every way the last pass could need — 56 m inside it)
    const E = hillside as { pitch: number; nx: number; nz: number; h: number[]; roads: Road[] };
    const g: GradeGrid = { x0: 0, z0: 0, pitch: E.pitch, nx: E.nx, nz: E.nz, heights: Float32Array.from(E.h, (v) => v / 100) };
    gradeRoads(g, E.roads.map((r) => ({ ...r })), (r) => r.ic ?? null, { walls: true });
    const W = E.nx * E.pitch, keep = (x: number, z: number) => x > 56 && x < W - 56 && z > 56 && z < W - 56;
    let worst = 0;
    for (const r of E.roads) worst = Math.max(worst, audit(on(g), r, { keep }));
    expect(worst).toBeLessThan(0.25);
    expect(worst).toBeGreaterThan(0.2); // (the steep ones are still steep: graded to their limit, not flattened)
  });
  it('reads incline tags', () => {
    expect(inclineOf('15%')).toBeCloseTo(0.15);
    expect(inclineOf('-8.5 %')).toBeCloseTo(0.085);
    expect(inclineOf('up')).toBeNull();
  });
});
