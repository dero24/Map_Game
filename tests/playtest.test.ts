import { describe, it, expect } from 'vitest';
import {
  CHECKS, SLOW, planChecks, rng, yawTo, wrapAngle, percentile, frameStats, judgeFrames, softGpu, FRAME_BUDGETS,
  gridPath, roadGraph, nearestNode, deadEnd, randomRoute, cumLength, pointAlong, closestAlong, offsetPolyline, resample,
  roadIndex, roadDist, summarize, formatReport, verdictLine, type StepFn,
} from '../tools/playtest-core.js';

// The playtest's pure parts (tools/playtest-core.js): what the page's gameplay checks and the Node
// runner lean on — seeded choice, the lattice planner over a step function, road routes, frame
// statistics and the report's text.

// A walker in a 2D world of wall segments: a move a → b is refused when the 0.32 m body touches a
// wall anywhere along it (sampled every 10 cm), and the ground is flat.
type Seg = [number, number, number, number];
const segDist = (x: number, z: number, [ax, az, bx, bz]: Seg) => {
  const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
  const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
  return Math.hypot(ax + ex * t - x, az + ez * t - z);
};
const walls = (segs: Seg[]): StepFn => (ax, az, af, bx, bz) => {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
  for (let k = 1; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
    if (segs.some((s) => segDist(x, z, s) < 0.32)) return NaN;
  }
  return af;
};
// a 10 m room (x, z in 0..10) with a 2 m doorway in its west wall (z 4..6)
const ROOM: Seg[] = [[0, 0, 10, 0], [10, 0, 10, 10], [10, 10, 0, 10], [0, 10, 0, 6], [0, 4, 0, 0]];

describe('playtest: the checks and the seeded stream', () => {
  it('runs every check unless narrowed, skipped or switched off', () => {
    expect(planChecks({})).toEqual(CHECKS);
    expect(planChecks({ only: 'doors,drive' })).toEqual(['doors', 'drive']);
    expect(planChecks({ only: ['walkabout', 'drive'], drive: false })).toEqual(['walkabout']);
    expect(planChecks({ skip: 'altitude, flicker' }).includes('altitude')).toBe(false);
    // (a number under a check's name is the older checks' option — the flicker's frame count)
    expect(planChecks({ frames: 3 }).includes('frames')).toBe(true);
    expect(planChecks({ frames: false }).includes('frames')).toBe(false);
    // quick: none of the checks that wait on the page's frames
    const quick = planChecks({ quick: true });
    expect(quick.length).toBe(CHECKS.length - SLOW.length);
    for (const c of SLOW) expect(quick.includes(c)).toBe(false);
    expect(quick.includes('walkabout')).toBe(true);
  });

  it('gives the same stream for the same seed, another for another', () => {
    const a = rng(7), b = rng(7), c = rng(8);
    const sa = [a(), a(), a(), a()], sb = [b(), b(), b(), b()], sc = [c(), c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of [...sa, ...sc]) expect(v >= 0 && v < 1).toBe(true);
  });

  it('faces the way the game faces: yaw 0 north (−z), west is +π/2', () => {
    expect(yawTo(0, -1)).toBeCloseTo(0, 9);
    expect(yawTo(-1, 0)).toBeCloseTo(Math.PI / 2, 9);
    const y = yawTo(3, 4);
    expect(-Math.sin(y)).toBeCloseTo(0.6, 9); // forward is (−sin yaw, −cos yaw)
    expect(-Math.cos(y)).toBeCloseTo(0.8, 9);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-3.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 9);
  });
});

describe('playtest: frame times', () => {
  it('reads percentiles between ranks', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.5)).toBe(15);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });

  it('counts hitches and paces a mostly 60 Hz run', () => {
    const iv = [...Array(98).fill(16.7), 60, 120];
    const st = frameStats(iv, Array(100).fill(8));
    expect(st.frames).toBe(100);
    expect(st.p50).toBe(16.7);
    expect(st.max).toBe(120);
    expect(st.hitch50).toBe(2);
    expect(st.hitch100).toBe(1);
    expect(st.fps).toBeGreaterThan(50);
    expect(st.work?.p95).toBe(8);
  });

  it('judges against a budget: steady 60 Hz passes, a stutter fails, software GL only fails a stall', () => {
    const smooth = frameStats(Array(600).fill(16.7));
    expect(judgeFrames(smooth, 'desktop').pass).toBe(true);
    const stutter = frameStats([...Array(90).fill(16.7), ...Array(10).fill(45)]);
    const j = judgeFrames(stutter, 'desktop');
    expect(j.pass).toBe(false);
    expect(j.over.join(' ')).toContain('p95');
    expect(judgeFrames(stutter, 'phone').pass).toBe(true);
    const soft = frameStats([4200, 3900, 5100, 4400, 6000, 45000]);
    expect(judgeFrames(soft, 'soft').pass).toBe(true); // (SwiftShader on a busy machine)
    expect(judgeFrames(frameStats([4000, 150000, 4000]), 'soft').pass).toBe(false); // (all but stopped)
    expect(judgeFrames(frameStats([16]), 'desktop').pass).toBe(false); // (nothing drew)
    expect(judgeFrames(smooth, { p95: 10 }).pass).toBe(false);
    expect(FRAME_BUDGETS.desktop.p95).toBeLessThan(FRAME_BUDGETS.phone.p95 as number);
  });

  it('knows a software renderer by its name', () => {
    expect(softGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(softGpu('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(softGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(softGpu(null)).toBe(false);
  });
});

describe('playtest: the lattice planner', () => {
  it('finds the way out of a room through its door, every step one the world allows', () => {
    const step = walls(ROOM);
    const p = gridPath({ start: { x: 5, z: 5, f: 0 }, goal: { x: -5, z: 5 }, step, cell: 0.4, margin: 6 });
    expect(p.found).toBe(true);
    const path = p.path!;
    expect(path[path.length - 1][0]).toBeCloseTo(-5, 6);
    for (let i = 1; i < path.length; i++) expect(Number.isFinite(step(path[i - 1][0], path[i - 1][1], 0, path[i][0], path[i][1]))).toBe(true);
    // (and it goes through the doorway, not the wall)
    const through = path.find((q, i) => i && path[i - 1][0] >= 0 && q[0] < 0)!;
    expect(through[1] > 4 && through[1] < 6).toBe(true);
  });

  it('is the same path every time', () => {
    const a = gridPath({ start: { x: 5, z: 5, f: 0 }, goal: { x: -5, z: 5 }, step: walls(ROOM) });
    const b = gridPath({ start: { x: 5, z: 5, f: 0 }, goal: { x: -5, z: 5 }, step: walls(ROOM) });
    expect(a.path).toEqual(b.path);
  });

  it('says when the walker is shut in: nowhere 3 m away', () => {
    const box: Seg[] = [[4, 4, 6, 4], [6, 4, 6, 6], [6, 6, 4, 6], [4, 6, 4, 4]];
    const p = gridPath({ start: { x: 5, z: 5, f: 0 }, goal: { x: 20, z: 5 }, step: walls(box), maxNodes: 5000 });
    expect(p.found).toBe(false);
    expect(p.far).toBeLessThan(3);
    const flood = gridPath({ start: { x: 5, z: 5, f: 0 }, goal: null, step: walls(ROOM), cell: 0.35, radius: 5 });
    expect(flood.found).toBe(false);
    expect(flood.far).toBeGreaterThan(3);
  });

  it('carries the feet along and refuses a climb the step function refuses', () => {
    // a 1 m ledge east of x = 3 (feet 0 → 1): the step says no to anything over 75 cm
    const ledge: StepFn = (_ax, _az, af, bx) => { const f = bx > 3 ? 1 : 0; return f - af > 0.75 ? NaN : f; };
    const up = gridPath({ start: { x: 0, z: 0, f: 0 }, goal: { x: 6, z: 0 }, step: ledge, maxNodes: 4000 });
    expect(up.found).toBe(false);
    const down = gridPath({ start: { x: 6, z: 0, f: 1 }, goal: { x: 0, z: 0 }, step: ledge });
    expect(down.found).toBe(true);
    expect(down.path![down.path!.length - 1][2]).toBe(0);
  });
});

describe('playtest: planning up a stair', () => {
  // A 10 m square "house" (x, z in 0..10), floor at 0, a storey at 3 m. A flight runs up the
  // strip x 4..5 from z 2 (0 m) to z 8 (3 m); the upper floor has a hole over it; a wall stands
  // along the flight's side at the upper storey only (a rail), so on the ground you walk under
  // it. The step function is the walker's rule: the highest surface within 75 cm of the feet.
  const onFlight = (x: number, z: number) => x >= 4 && x <= 5 && z >= 2 && z <= 8;
  const surfaces = (x: number, z: number) => {
    const s = [0];
    if (onFlight(x, z)) s.push(((z - 2) / 6) * 3);
    else if (!(x >= 3.6 && x <= 5.4 && z >= 1.6 && z <= 8)) s.push(3); // (the hole: no floor over the flight)
    return s;
  };
  const step: StepFn = (_ax, _az, af, bx, bz) => {
    if (bx < 0 || bx > 10 || bz < 0 || bz > 10) return NaN;
    let best = -Infinity;
    for (const h of surfaces(bx, bz)) if (h <= af + 0.75 && h > best) best = h;
    // the rail: at the upper storey, nobody steps off the flight sideways into the stairwell
    if (af > 1.5 && best > 1.5 && onFlight(bx, bz) !== onFlight(_ax, _az) && Math.abs(bz - _az) < 0.01) return NaN;
    return best;
  };

  it('finds the way up to a spot straight over its start, one storey up', () => {
    const p = gridPath({ start: { x: 2, z: 5, f: 0 }, goal: { x: 2, z: 5, f: 3 }, step, cell: 0.4, margin: 4, layer: 1.2 });
    expect(p.found).toBe(true);
    const path = p.path!;
    expect(path[path.length - 1][2]).toBeCloseTo(3, 6);
    // (it climbs the flight: every point on the way is on a surface there, never a jump over 75 cm)
    for (let i = 1; i < path.length; i++) expect(path[i][2] - path[i - 1][2]).toBeLessThanOrEqual(0.75);
    expect(path.some((q) => onFlight(q[0], q[1]) && q[2] > 1 && q[2] < 2)).toBe(true);
  });

  it('without storeys a cell holds one surface: the spot upstairs is never reached', () => {
    // (the cell under the goal is taken by the ground floor first — why the walkabout plans its
    // way in and out of buildings with layers)
    const p = gridPath({ start: { x: 2, z: 5, f: 0 }, goal: { x: 2, z: 5, f: 3 }, step, cell: 0.4, margin: 4, maxNodes: 5000 });
    expect(p.found).toBe(false);
    const flat = gridPath({ start: { x: 2, z: 5, f: 0 }, goal: { x: 8, z: 5 }, step, cell: 0.4, margin: 4 });
    expect(flat.found).toBe(true);
  });

  it('comes back down, and says when the storey it wants is out of reach', () => {
    const down = gridPath({ start: { x: 8, z: 5, f: 3 }, goal: { x: 8, z: 5, f: 0 }, step, cell: 0.4, margin: 4, layer: 1.2 });
    expect(down.found).toBe(true);
    expect(down.path![down.path!.length - 1][2]).toBe(0);
    const noStair: StepFn = (ax, az, af, bx, bz) => (onFlight(bx, bz) ? NaN : step(ax, az, af, bx, bz));
    const up = gridPath({ start: { x: 2, z: 5, f: 0 }, goal: { x: 2, z: 5, f: 3 }, step: noStair, cell: 0.4, margin: 4, layer: 1.2, maxNodes: 20000 });
    expect(up.found).toBe(false);
  });
});

describe('playtest: streets and routes', () => {
  // decimetre points, as the tiles carry them: a block (main street along z = 0 and back street
  // along z = −100, x −100..100 m, joined at both ends), a spur north off main street's middle (a
  // dead end), a footway off its east end, and a far-detail way that routes leave alone
  const main = { p: [-1000, 0, 0, 0, 1000, 0], c: 'residential', w: 6.5 };
  const back = { p: [-1000, -1000, 1000, -1000], c: 'residential', w: 6.5 };
  const west = { p: [-1000, 0, -1000, -1000], c: 'residential', w: 6.5 };
  const east = { p: [1000, 0, 1000, -1000], c: 'residential', w: 6.5 };
  const spur = { p: [0, 0, 0, -500], c: 'service', w: 4 };
  const foot = { p: [1000, 0, 1500, 0], c: 'footway', w: 1.8 };
  const far = { p: [0, 0, 0, 5000], c: 'residential', w: 6, lod: 1 as const };
  const roads = [main, back, west, east, spur, foot, far];

  it('joins ways where they share a point, whatever order they come in', () => {
    const g = roadGraph(roads);
    const t = nearestNode(g, 0, 0);
    expect(g.nodes[t]).toEqual([0, 0]);
    expect(g.adj[t].length).toBe(3); // west, east, the spur (the far-detail way is left out)
    expect(roadGraph([...roads].reverse())).toEqual(g);
  });

  it('leaves out what cars never drive, and whatever else it is told to', () => {
    const car = roadGraph(roads, { car: true });
    expect(car.nodes.some(([x, z]) => x === 150 && z === 0)).toBe(false); // the footway's far end
    expect(car.nodes.some(([x, z]) => x === 0 && z === -50)).toBe(true);
    const noService = roadGraph(roads, { car: true, skip: ['service'] });
    expect(noService.nodes.some(([x, z]) => x === 0 && z === -50)).toBe(false);
  });

  it('wanders the same way for the same seed, never straight back but at a dead end', () => {
    const g = roadGraph(roads);
    const a = randomRoute(g, -95, 3, rng(3), 900), b = randomRoute(g, -95, 3, rng(3), 900);
    expect(a).toEqual(b);
    expect(a.len).toBeGreaterThanOrEqual(900);
    expect(a.pts[0]).toEqual([-100, 0]);
    for (let i = 2; i < a.pts.length; i++) {
      const turned = a.pts[i][0] === a.pts[i - 2][0] && a.pts[i][1] === a.pts[i - 2][1];
      if (turned) expect(g.adj[nearestNode(g, a.pts[i - 1][0], a.pts[i - 1][1])].length).toBe(1);
    }
    expect(randomRoute(g, -95, 3, rng(4), 900)).not.toEqual(a);
  });

  it('keeps a car off a spur where it can go on', () => {
    const g = roadGraph(roads, { car: true });
    const t = nearestNode(g, 0, 0), tip = nearestNode(g, 0, -50), e = nearestNode(g, 100, 0);
    expect(deadEnd(g, t, tip)).toBe(true);
    expect(deadEnd(g, t, e)).toBe(false); // (round the block)
    for (let seed = 1; seed <= 12; seed++) {
      const r = randomRoute(g, -95, 0, rng(seed), 700, { avoidDeadEnds: true });
      expect(r.pts.some(([x, z]) => x === 0 && z === -50)).toBe(false);
      expect(r.len).toBeGreaterThanOrEqual(700);
    }
  });

  it('sets a moving car off ahead of it, the way it is going', () => {
    const g = roadGraph(roads, { car: true });
    // on main street at x = 60 heading east: the nearest node is (100, 0) ahead, not (0, 0) behind
    for (let seed = 1; seed <= 8; seed++) {
      const r = randomRoute(g, 60, 0, rng(seed), 150, { heading: [1, 0] });
      expect(r.pts[0]).toEqual([100, 0]);
      expect(r.pts[1][0] >= 100).toBe(true); // (on east, or round the corner: never back west first)
      const back = randomRoute(g, 60, 0, rng(seed), 150, { heading: [-1, 0] });
      expect(back.pts[0]).toEqual([0, 0]);
    }
  });

  it('walks beside a street: the right of a northward line is east', () => {
    const pts = [[0, 0], [0, -10], [0, -20]];
    expect(offsetPolyline(pts, 3)).toEqual([[3, 0], [3, -10], [3, -20]]);
    expect(offsetPolyline(pts, -3)[1]).toEqual([-3, -10]);
    const r = resample([[0, 0], [10, 0], [10, 10]], 5);
    expect(r.length).toBe(5);
    expect(r[2]).toEqual([10, 0]);
    const cum = cumLength([[0, 0], [10, 0], [10, 10]]);
    expect(cum).toEqual([0, 10, 20]);
    expect(pointAlong([[0, 0], [10, 0], [10, 10]], cum, 15)).toEqual([10, 5]);
    const c = closestAlong([[0, 0], [10, 0], [10, 10]], cum, 12, 4);
    expect(c.s).toBeCloseTo(14, 9);
    expect(c.d).toBeCloseTo(2, 9);
    expect(c.i).toBe(1);
  });
});

describe('playtest: the carriageway', () => {
  it('says how far past the nearest carriageway edge a point stands', () => {
    // a 10 m street along z = 0 (x −50..50) and a 5 m one north along x = 50; a footway beside
    const roads = [
      { p: [-500, 0, 500, 0], c: 'residential', w: 10, n: 'Main' },
      { p: [500, 0, 500, -500], c: 'residential', w: 5 },
      { p: [-500, 80, 500, 80], c: 'footway', w: 2 },
      { p: [0, 0, 0, 3000], c: 'residential', w: 6, lod: 1 as const },
    ];
    const ix = roadIndex(roads);
    const mid = roadDist(ix, 0, 2);
    expect(mid.out).toBeCloseTo(-3, 6); // (2 m off the centreline of a 10 m street: 3 m inside it)
    expect(mid.road).toBe('Main');
    expect(roadDist(ix, 10, 9).out).toBeCloseTo(4, 6); // (on the footway: it isn't a carriageway)
    expect(roadDist(ix, 52, -20).out).toBeCloseTo(-0.5, 6);
    expect(roadDist(ix, 0, 200).out).toBe(Infinity); // (the far-detail way is left out; nothing else near)
    expect(roadDist(roadIndex(roads, { skip: ['residential'] }), 0, 2).out).toBe(Infinity);
  });
});

describe('playtest: the report', () => {
  it('puts a verdict, the numbers and the first failures on a line each', () => {
    const rep = {
      pass: false, place: 'shore', at: [40.36, -73.97], ms: 61000,
      doors: { pass: true, real: { tried: 80, blocked: 0, roundabout: 9 }, standIn: { tried: 0, blocked: 0 }, fails: [] },
      drive: { pass: false, source: 'kerb', model: 'suv', metres: 540, clip: 12, clipMax: 1.35, fails: [{ kind: 'clip', at: [107, -7.7, 1.3], by: 1.35 }] },
      frames: { pass: true, budget: 'desktop', frames: 600, fps: 60, p50: 16.7, p95: 17.2, p99: 18, max: 20, hitch50: 0, hitch100: 0, over: [] },
      walkabout: { error: 'TypeError: boom\n at x' },
    };
    const txt = formatReport(rep);
    const lines = txt.split('\n');
    expect(lines[0]).toContain('FAIL');
    expect(lines[0]).toContain('shore');
    expect(txt).toContain('pass  doors      tried 80 · shut 0 · roundabout 9');
    expect(txt).toContain('FAIL  drive');
    expect(txt).toContain('clipMax 1.35');
    expect(txt).toContain('"kind":"clip"');
    expect(txt).toContain('ERROR walkabout  error: TypeError: boom');
    expect(summarize('frames', rep.frames)).toContain('p95 17.2');
    expect(lines.filter((l) => l.includes('overlaps')).length).toBe(0); // (checks that didn't run aren't listed)
    expect(verdictLine(rep)).toBe('FAIL — walkabout, drive (of 4 checks)'); // (in the checks' own order)
  });

  it('says which planted failures each self-test caught', () => {
    const rep = {
      pass: false, doors: { pass: true, real: { tried: 3, blocked: 0 }, fails: [] },
      selftest: { pass: false, walkabout: { pass: false, detects: { trapped: true, wall: false, noExit: null } }, drive: { pass: true, detects: { inside: true } } },
    };
    const txt = formatReport(rep);
    expect(txt).toContain('FAIL  self-tests');
    expect(txt).toContain('trapped caught · wall MISSED · noExit n/a'); // (null: its moment never came)
    expect(txt).toContain('pass  drive      inside caught');
    expect(verdictLine(rep)).toBe('FAIL — self-tests (of 1 checks)');
    expect(verdictLine({ doors: rep.doors })).toBe('PASS — 1 checks');
  });
});
