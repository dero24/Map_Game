import { describe, it, expect } from 'vitest';
import { analyzeJunctions, packJunctions, unpackJunctions, signalState, signalKey, SIG_CYCLE, CTL } from '../src/sim/traffic';
import { buildLifeInit, type LifeBase } from '../src/sim/life';
import { LifeSim, STOP_BACK } from '../src/sim/lifeSim';
import { RANGES } from '../src/sim/protocol';
import type { Road, Point } from '../src/world/data';

const road = (c: string, w: number, pts: [number, number][], ow?: 1): Road => ({ c, w, p: pts.flatMap(([x, z]) => [x * 10, z * 10]), ...(ow ? { ow } : {}) });
const cross = (a: string, wa: number, b: string, wb: number, L = 100) => [road(a, wa, [[-L, 0], [0, 0], [L, 0]]), road(b, wb, [[0, -L], [0, 0], [0, L]])];
const armAt = (J: ReturnType<typeof analyzeJunctions>[number], dx: number, dz: number) => J.arms.find((m) => m.dx * dx + m.dz * dz > 0.9)!;

describe('junction control: the rule of the road', () => {
  it('two equal streets crossing: an all-way stop in North America, give way elsewhere', () => {
    const [J] = analyzeJunctions(cross('residential', 6.5, 'residential', 6.5), [], true);
    expect(J.arms).toHaveLength(4);
    expect(J.arms.every((m) => m.ctl === CTL.ALL_STOP)).toBe(true);
    const [E] = analyzeJunctions(cross('residential', 6.5, 'residential', 6.5), [], false);
    expect(E.arms.every((m) => m.ctl === CTL.YIELD)).toBe(true);
  });

  it('a street meeting a main road stops (NA) or gives way (elsewhere); the main road goes', () => {
    const [J] = analyzeJunctions(cross('primary', 11, 'residential', 6.5), [], true);
    expect(armAt(J, 1, 0).ctl).toBe(CTL.GO);
    expect(armAt(J, -1, 0).ctl).toBe(CTL.GO);
    expect(armAt(J, 0, 1).ctl).toBe(CTL.STOP);
    expect(armAt(J, 0, -1).ctl).toBe(CTL.STOP);
    const [E] = analyzeJunctions(cross('primary', 11, 'residential', 6.5), [], false);
    expect(armAt(E, 0, 1).ctl).toBe(CTL.YIELD);
  });

  it('two main roads crossing are signalled: the wider road is phase A', () => {
    const [J] = analyzeJunctions(cross('primary', 11, 'secondary', 9), [], true);
    expect(J.signal).toBe(true);
    expect(armAt(J, 1, 0).ctl).toBe(CTL.SIG_A);
    expect(armAt(J, 0, 1).ctl).toBe(CTL.SIG_B);
    expect(J.setback).toBeCloseTo(11 / 2 + 1.5, 5);
  });

  it("a T of equal streets: the through street has the way, the stem stops", () => {
    const [J] = analyzeJunctions([road('residential', 6.5, [[-100, 0], [0, 0], [100, 0]]), road('residential', 6.5, [[0, 0], [0, 100]])], [], true);
    expect(J.arms).toHaveLength(3);
    expect(armAt(J, 1, 0).ctl).toBe(CTL.GO);
    expect(armAt(J, 0, 1).ctl).toBe(CTL.STOP);
  });

  it('mapped control wins: a signal node, a stop sign on one arm', () => {
    const sig: Point[] = [{ c: 'signal', x: 1, z: 1 }];
    expect(analyzeJunctions(cross('residential', 6.5, 'residential', 6.5), sig, true)[0].signal).toBe(true);
    const stop: Point[] = [{ c: 'stop', x: 1, z: 9 }];
    const [J] = analyzeJunctions(cross('residential', 6.5, 'residential', 6.5), stop, true);
    expect(armAt(J, 0, 1).ctl).toBe(CTL.STOP);
    expect(armAt(J, 1, 0).ctl).toBe(CTL.GO);
    expect(armAt(J, 0, -1).ctl).toBe(CTL.GO);
  });

  it('where the map marks its signs, a corner it leaves unmarked is open: no sign, give way', () => {
    // two stop signs mapped at the crossroads 150 m east: this map marks its signs
    const roads = [road('residential', 6.5, [[-100, 0], [0, 0], [150, 0], [250, 0]]), road('residential', 6.5, [[0, -100], [0, 0], [0, 100]]), road('residential', 6.5, [[150, -100], [150, 0], [150, 100]])];
    const signs: Point[] = [{ c: 'stop', x: 151, z: 9 }, { c: 'stop', x: 149, z: -9 }];
    const js = analyzeJunctions(roads, signs, true);
    const here = js.find((J) => J.x === 0)!, there = js.find((J) => J.x === 150)!;
    expect(here.arms.every((m) => m.ctl === CTL.OPEN)).toBe(true);
    expect(armAt(there, 0, 1).ctl).toBe(CTL.STOP); // (the mapped ones as mapped)
    expect(armAt(there, 1, 0).ctl).toBe(CTL.GO);
    // a street meeting a main road gives way, unsigned
    const [T] = analyzeJunctions(cross('primary', 11, 'residential', 6.5), [{ c: 'stop', x: 200, z: 9 }, { c: 'yield', x: 200, z: -9 }], true);
    expect(armAt(T, 0, 1).ctl).toBe(CTL.OPEN);
    expect(armAt(T, 1, 0).ctl).toBe(CTL.GO);
    // where the map marks no signs at all, the rule of the road fills them in
    expect(analyzeJunctions(roads, [], true).find((J) => J.x === 0)!.arms.every((m) => m.ctl === CTL.ALL_STOP)).toBe(true);
  });

  it('a one-way leaving the junction carries no arriving traffic', () => {
    const [J] = analyzeJunctions([road('residential', 6.5, [[-100, 0], [0, 0], [100, 0]]), road('residential', 6.5, [[0, 0], [0, 100]], 1)], [], true);
    expect(armAt(J, 0, 1).inb).toBe(false);
    expect(armAt(J, 1, 0).inb).toBe(true);
  });

  it('keeps only the junctions it owns, and packs round-trip', () => {
    const js = analyzeJunctions(cross('primary', 11, 'secondary', 9), [], true);
    expect(analyzeJunctions(cross('primary', 11, 'secondary', 9), [], true, (x) => x > 50)).toHaveLength(0);
    const [u] = [...unpackJunctions(packJunctions(js))];
    expect(u.x).toBe(0);
    expect(u.arms.map((m) => m.ctl).sort()).toEqual(js[0].arms.map((m) => m.ctl).sort());
  });

  it('signal phases: never both green, each gets its turn, amber before red', () => {
    const k = signalKey(12, 34);
    let greenA = 0, greenB = 0;
    for (let t = 0; t < SIG_CYCLE; t += 0.25) {
      const a = signalState(0, t, k), b = signalState(1, t, k);
      expect(a === 0 && b === 0).toBe(false);
      greenA += a === 0 ? 1 : 0; greenB += b === 0 ? 1 : 0;
      if (a === 2 && signalState(0, t - 0.25, k) === 0) throw new Error('green straight to red');
    }
    expect(greenA).toBeGreaterThan(greenB); // the main road gets the longer green
    expect(greenB).toBeGreaterThan(0);
  });
});

describe('junction control: the traffic obeys it', () => {
  const base: LifeBase = { seed: 7, bounds: [-500, -500, 500, 500], beachPts: new Float32Array(0), waterGrid: new Uint8Array(1), waterG: [0, 0, 8, 1, 1], downtown: [-100, -100, 100, 100], seaward: [1, 0] };
  const walk = { outdoorSurfaceAt: () => 0 } as unknown as Parameters<typeof buildLifeInit>[2];
  const scene = (roads: Road[]) => {
    const init = buildLifeInit(base, roads, walk, [], [packJunctions(analyzeJunctions(roads, [], true))]);
    const sim = new LifeSim(init);
    for (const [a, b] of [RANGES.cars, RANGES.peds]) for (let i = a; i < b; i++) { sim.active[i] = 0; sim.y[i] = -1000; }
    // one car on the north arm (x = 0, z > 0) heading south toward the junction, 60 m out
    const E = init.edgeLen.length;
    let e = -1, dir = 1;
    for (let k = 0; k < E; k++) {
      const a = init.edgeStart[k] * 3, b = (init.edgeStart[k] + init.edgeCount[k] - 1) * 3, P = init.edgePts;
      if (Math.abs(P[a]) < 0.1 && Math.abs(P[b]) < 0.1 && Math.max(P[a + 2], P[b + 2]) > 50) { e = k; dir = P[b + 2] < P[a + 2] ? 1 : -1; }
    }
    const c = RANGES.cars[0];
    sim.active[c] = 1; sim.edge[c] = e; sim.dir[c] = dir; sim.s[c] = dir > 0 ? init.edgeLen[e] - 60 : 60; sim.speed[c] = 8;
    return { sim, c, init, e };
  };
  const drive = (sim: LifeSim, t0: number, t1: number) => {
    for (let t = t0; t < t1; t += 0.05) { sim.setEnv({ playerX: 40, playerZ: 30, hour: 12, night: 0, density: 0, wind: 0, clock: t }); sim.step(0.05); }
  };

  it('stops at a red light behind the stop line, and goes on the green', () => {
    const { sim, c, e } = scene(cross('primary', 11, 'secondary', 9));
    expect(signalKey(0, 0)).toBe(0); // phase A (the primary) is green first: the cross street waits
    drive(sim, 0, 20);
    expect(sim.edge[c]).toBe(e);
    expect(sim.speed[c]).toBeLessThan(0.3);
    expect(sim.z[c]).toBeGreaterThan(11 / 2 + 1.5 + STOP_BACK - 0.5); // not over the stop line: its bumper short of the crosswalk
    expect(sim.z[c]).toBeLessThan(11 / 2 + 1.5 + STOP_BACK + 2);
    drive(sim, 20, 45); // the cross street's green comes round
    expect(sim.edge[c]).not.toBe(e);
  });

  // a walker on the north arm's sidewalk, at its corner, whose planned way over crosses the
  // arms `want` picks (re-rolled until it does: where a walker goes next is its own choice)
  type X = { xmask: Int32Array; nxtE: Int32Array; state: Uint8Array; leg: Uint8Array; xp: Float32Array };
  const northArm = (init: ReturnType<typeof buildLifeInit>) => {
    let e = -1, dir = 1;
    for (let k = 0; k < init.edgeLen.length; k++) {
      const a = init.edgeStart[k] * 3, b = (init.edgeStart[k] + init.edgeCount[k] - 1) * 3, P = init.edgePts;
      if (Math.abs(P[a]) < 0.1 && Math.abs(P[b]) < 0.1 && Math.max(P[a + 2], P[b + 2]) > 50) { e = k; dir = P[b + 2] < P[a + 2] ? 1 : -1; }
    }
    return { e, dir };
  };
  /** Bits of the centre node's arms running east-west (the main road in these scenes). */
  const ewBits = (init: ReturnType<typeof buildLifeInit>) => {
    let node = -1;
    for (let n = 0; n < init.nodeXZ!.length / 2; n++) if (Math.hypot(init.nodeXZ![n * 2], init.nodeXZ![n * 2 + 1]) < 0.1) node = n;
    let m = 0;
    for (let k = init.nodeEdgeStart[node]; k < init.nodeEdgeStart[node + 1]; k++) {
      const e = init.nodeEdges[k], a = init.edgeStart[e] * 3, b = (init.edgeStart[e] + init.edgeCount[e] - 1) * 3;
      if (Math.abs(init.edgePts[a + 2]) < 0.1 && Math.abs(init.edgePts[b + 2]) < 0.1) m |= 1 << (k - init.nodeEdgeStart[node]);
    }
    return m;
  };
  const atCorner = (sim: LifeSim, init: ReturnType<typeof buildLifeInit>, t0: number, setup: () => void, want: (m: number, st: number) => boolean) => {
    const { e, dir } = northArm(init), p = RANGES.peds[0], sb = init.nodeSet![init.edgeNodes[e * 2 + (dir > 0 ? 1 : 0)]];
    const X = sim as unknown as X;
    for (let k = 0; k < 60; k++) {
      setup();
      sim.active[p] = 1; sim.edge[p] = e; sim.dir[p] = dir; sim.s[p] = dir > 0 ? init.edgeLen[e] - sb : sb; sim.speed[p] = 1.3; sim.side[p] = 1; X.state[p] = 0; X.nxtE[p] = -1;
      sim.setEnv({ playerX: 40, playerZ: 30, hour: 12, night: 0, density: 0, wind: 0, clock: t0 });
      sim.step(0.05);
      if (want(X.xmask[p], X.state[p])) return { p, e, dir, sb, X };
    }
    throw new Error('no crossing plan over the main road');
  };
  // does the walker stand inside a car's footprint?
  const struck = (sim: LifeSim, p: number, c: number) => {
    const fx = -Math.sin(sim.yaw[c]), fz = -Math.cos(sim.yaw[c]), dx = sim.x[p] - sim.x[c], dz = sim.z[p] - sim.z[c];
    return Math.abs(dx * fx + dz * fz) < 2.4 && Math.abs(dx * -fz + dz * fx) < 1.1;
  };

  it('walkers wait at the corner for their light, at the crosswalk', () => {
    const { sim, init } = scene(cross('primary', 11, 'secondary', 9));
    sim.active[RANGES.cars[0]] = 0; sim.y[RANGES.cars[0]] = -1000;
    const ew = ewBits(init);
    // their way over crosses the main road, whose green comes first: they wait at its kerb
    const { p, X } = atCorner(sim, init, 0, () => {}, (m) => (m & ew) !== 0);
    drive(sim, 0.05, 25);
    expect(X.state[p]).toBe(11);
    expect(X.leg[p]).toBe(0);
    expect(Math.hypot(sim.x[p] - X.xp[p * 4], sim.z[p] - X.xp[p * 4 + 1])).toBeLessThan(0.05);
    // square across the painted crosswalk, just past the stop line of the street it crosses
    expect(Math.abs(Math.hypot(X.xp[p * 4] - X.xp[p * 4 + 2], X.xp[p * 4 + 1] - X.xp[p * 4 + 3]) - (11 + 1))).toBeLessThan(0.3);
    drive(sim, 25, 45); // the main road's red comes round: over they go
    expect(X.state[p] !== 11 || X.leg[p] > 0).toBe(true);
  });

  it('at a corner with no light, a walker lets the car coming go by, then crosses behind it', () => {
    const { sim, c, init } = scene(cross('primary', 11, 'residential', 6.5));
    const ew = ewBits(init);
    // the car: on the main road's east arm heading west, 50 m out at 12 m/s
    let ce = -1;
    for (let k = 0; k < init.edgeLen.length; k++) { const a = init.edgeStart[k] * 3, P = init.edgePts; if (Math.abs(P[a + 2]) < 0.1 && Math.max(P[a], P[(init.edgeStart[k] + init.edgeCount[k] - 1) * 3]) > 50) ce = k; }
    const ca = init.edgeStart[ce] * 3, cdir = init.edgePts[ca] > 1 ? 1 : -1; // toward the centre
    const setCar = () => { sim.active[c] = 1; sim.edge[c] = ce; sim.dir[c] = cdir; sim.s[c] = cdir > 0 ? init.edgeLen[ce] - 50 : 50; sim.speed[c] = 12; };
    const { p, X } = atCorner(sim, init, 0, setCar, (m) => (m & ew) !== 0);
    let crossedAt = -1, hit = 0;
    for (let t = 0.05; t < 20; t += 0.05) {
      sim.setEnv({ playerX: 40, playerZ: 30, hour: 12, night: 0, density: 0, wind: 0, clock: t });
      sim.step(0.05);
      if (crossedAt < 0 && X.state[p] === 11 && X.leg[p] > 0) crossedAt = t;
      if (struck(sim, p, c)) hit++;
    }
    expect(hit).toBe(0);
    expect(crossedAt).toBeGreaterThan(3); // not in front of it
    expect(crossedAt).toBeLessThan(10); // but promptly once it's by
  });

  it('cars wait at the line for someone crossing in front of them', () => {
    const { sim, c, init } = scene(cross('primary', 11, 'residential', 6.5, 300));
    const ew = ewBits(init);
    let ce = -1;
    for (let k = 0; k < init.edgeLen.length; k++) { const a = init.edgeStart[k] * 3, P = init.edgePts; if (Math.abs(P[a + 2]) < 0.1 && Math.max(P[a], P[(init.edgeStart[k] + init.edgeCount[k] - 1) * 3]) > 50) ce = k; }
    const ca = init.edgeStart[ce] * 3, cdir = init.edgePts[ca] > 1 ? 1 : -1;
    // the car is far enough off that the walker sets out — and arrives while they're still crossing
    const setCar = () => { sim.active[c] = 1; sim.edge[c] = ce; sim.dir[c] = cdir; sim.s[c] = cdir > 0 ? init.edgeLen[ce] - 130 : 130; sim.speed[c] = 12; };
    const { p, X } = atCorner(sim, init, 0, setCar, (m) => (m & ew) !== 0);
    let hit = 0, waited = false, crossed = false;
    for (let t = 0.05; t < 40; t += 0.05) {
      sim.setEnv({ playerX: 40, playerZ: 30, hour: 12, night: 0, density: 0, wind: 0, clock: t });
      sim.step(0.05);
      if (struck(sim, p, c)) hit++;
      if (X.state[p] === 11 && X.leg[p] === 1) crossed = true;
      if (X.state[p] === 11 && X.leg[p] === 1 && sim.edge[c] === ce && sim.speed[c] < 0.3) waited = true;
    }
    expect(crossed).toBe(true);
    expect(hit).toBe(0);
    expect(waited).toBe(true);
    expect(sim.edge[c]).not.toBe(ce); // and then drove on
  });

  it('an open corner: a lone car rolls through; two at once take turns, the one on the right first', () => {
    const roads = cross('residential', 6.5, 'residential', 6.5, 150);
    const signs: Point[] = [{ c: 'stop', x: 140, z: 150 }, { c: 'yield', x: 150, z: 140 }]; // marked round here, not at this corner
    const Js = analyzeJunctions(roads, signs, true);
    expect(Js[0].arms.every((m) => m.ctl === CTL.OPEN)).toBe(true);
    const init = buildLifeInit(base, roads, walk, [], [packJunctions(Js)]);
    const edgeFrom = (x0: number, z0: number, x1: number, z1: number) => {
      for (let k = 0; k < init.edgeLen.length; k++) {
        const a = init.edgeStart[k] * 3, b = (init.edgeStart[k] + init.edgeCount[k] - 1) * 3, P = init.edgePts;
        if (Math.hypot(P[a] - x0, P[a + 2] - z0) < 0.1 && Math.hypot(P[b] - x1, P[b + 2] - z1) < 0.1) return k;
      }
      return -1;
    };
    const north = edgeFrom(0, -150, 0, 0), east = edgeFrom(0, 0, 150, 0);
    const setup = (both: boolean) => {
      const sim = new LifeSim(init);
      for (const [a, b] of [RANGES.cars, RANGES.peds]) for (let i = a; i < b; i++) { sim.active[i] = 0; sim.y[i] = -1000; }
      const A = RANGES.cars[0], B = A + 1;
      // A comes south down the north arm, B west along the east arm: both 40 m out at 8 m/s
      sim.active[A] = 1; sim.edge[A] = north; sim.dir[A] = 1; sim.s[A] = 150 - 40; sim.speed[A] = 8;
      if (both) { sim.active[B] = 1; sim.edge[B] = east; sim.dir[B] = -1; sim.s[B] = 40; sim.speed[B] = 8; }
      return { sim, A, B };
    };
    const drive = (sim: LifeSim, f: (t: number) => void) => { for (let t = 0; t < 20; t += 0.05) { sim.setEnv({ playerX: 60, playerZ: 60, hour: 12, night: 0, density: 0, wind: 0, clock: t }); sim.step(0.05); f(t); } };
    // alone: slows for the corner, looks, rolls through without stopping
    const one = setup(false);
    let slowest = 99;
    drive(one.sim, () => { if (one.sim.edge[one.A] === north) slowest = Math.min(slowest, one.sim.speed[one.A]); });
    expect(one.sim.edge[one.A]).not.toBe(north);
    expect(slowest).toBeGreaterThan(3);
    // together: B has A on its right and gives way; A goes first; they never touch
    const two = setup(true);
    let aOut = -1, bIn = -1, closest = 99;
    drive(two.sim, (t) => {
      const { sim, A, B } = two;
      if (aOut < 0 && sim.edge[A] !== north) aOut = t;
      if (bIn < 0 && sim.edge[B] === east && sim.s[B] < 11 / 2 - 0.5) bIn = t; // (into the box)
      if (bIn < 0 && sim.edge[B] !== east) bIn = t;
      closest = Math.min(closest, Math.hypot(sim.x[A] - sim.x[B], sim.z[A] - sim.z[B]));
    });
    expect(aOut).toBeGreaterThan(0);
    expect(bIn).toBeGreaterThan(aOut);
    expect(closest).toBeGreaterThan(3);
  });

  it('comes to a full stop at a stop sign, then pulls out', () => {
    const { sim, c, e } = scene(cross('primary', 11, 'residential', 6.5));
    let stopped = false;
    for (let t = 0; t < 30 && sim.edge[c] === e; t += 0.05) {
      sim.setEnv({ playerX: 40, playerZ: 30, hour: 12, night: 0, density: 0, wind: 0, clock: t });
      sim.step(0.05);
      if (sim.speed[c] < 0.3 && sim.z[c] < 11 / 2 + 1.5 + STOP_BACK + 1) stopped = true;
    }
    expect(stopped).toBe(true);
    expect(sim.edge[c]).not.toBe(e);
  });
});

describe('a busy grid of streets, three minutes of it', () => {
  // three avenues by three streets: a main road, a secondary one (their crossing is signalled), the
  // rest residential (all-way stops, stop signs onto the bigger roads)
  const line = (c: string, w: number, fixed: number, ns: boolean) => {
    const pts: [number, number][] = [];
    for (const t of [-250, -150, 0, 150, 250]) pts.push(ns ? [fixed, t] : [t, fixed]);
    return road(c, w, pts);
  };
  const roads = [
    line('primary', 11, 0, false), line('residential', 6.5, -150, false), line('residential', 6.5, 150, false),
    line('secondary', 9, 0, true), line('residential', 6.5, -150, true), line('residential', 6.5, 150, true),
  ];
  const base: LifeBase = { seed: 11, bounds: [-400, -400, 400, 400], beachPts: new Float32Array(0), waterGrid: new Uint8Array(1), waterG: [0, 0, 8, 1, 1], downtown: [-200, -200, 200, 200], seaward: [1, 0] };
  const walk = { outdoorSurfaceAt: () => 0 } as unknown as Parameters<typeof buildLifeInit>[2];

  it('nobody walks through a car, and no two cars drive fused together', () => {
    const init = buildLifeInit(base, roads, walk, [], [packJunctions(analyzeJunctions(roads, [], true))]);
    const sim = new LifeSim(init);
    let pedHits = 0, fused = 0, crossings = 0, cars = 0, peds = 0, moved = 0, longest = 0;
    const still = new Float32Array(RANGES.cars[1]);
    const X = sim as unknown as { state: Uint8Array };
    const [c0, c1] = RANGES.cars, [p0, p1] = RANGES.peds;
    for (let t = 0; t < 180; t += 0.05) {
      sim.setEnv({ playerX: 10, playerZ: 10, hour: 12, night: 0, density: 1, wind: 0, clock: t });
      sim.step(0.05);
      if (t < 10) continue;
      for (let c = c0; c < c1; c++) {
        still[c] = sim.active[c] && sim.speed[c] < 0.3 ? still[c] + 0.05 : 0;
        longest = Math.max(longest, still[c]);
        if (!sim.active[c]) continue;
        cars++; moved += sim.speed[c];
        const fx = -Math.sin(sim.yaw[c]), fz = -Math.cos(sim.yaw[c]);
        for (let p = p0; p < p1; p++) {
          if (!sim.active[p] || (X.state[p] !== 0 && X.state[p] !== 11) || sim.y[p] < -500) continue;
          const dx = sim.x[p] - sim.x[c], dz = sim.z[p] - sim.z[c];
          if (Math.abs(dx * fx + dz * fz) < 2.3 && Math.abs(dx * -fz + dz * fx) < 1.0) pedHits++;
        }
        for (let d = c + 1; d < c1; d++) if (sim.active[d] && Math.hypot(sim.x[d] - sim.x[c], sim.z[d] - sim.z[c]) < 2.5) fused++;
      }
      for (let p = p0; p < p1; p++) if (sim.active[p]) { peds++; if (X.state[p] === 11) crossings++; }
    }
    expect(cars / 3400).toBeGreaterThan(30); // (cars on the road, per tick)
    expect(crossings).toBeGreaterThan(200); // people do cross
    expect(pedHits).toBe(0);
    expect(fused).toBe(0);
    // and the traffic flows: queues at the lights and the crosswalks, but nobody stuck for good
    expect(moved / cars).toBeGreaterThan(1);
    expect(longest).toBeLessThan(150);
  });
});

describe('nothing pops into view', () => {
  it('cars appear and vanish only where the walker is not looking', () => {
    const line = (c: string, w: number, fixed: number, ns: boolean) => road(c, w, [-250, -150, 0, 150, 250].map((t) => (ns ? [fixed, t] : [t, fixed]) as [number, number]));
    const roads = [line('primary', 11, 0, false), line('residential', 6.5, -150, false), line('residential', 6.5, 150, false), line('secondary', 9, 0, true), line('residential', 6.5, -150, true), line('residential', 6.5, 150, true)];
    const base: LifeBase = { seed: 5, bounds: [-400, -400, 400, 400], beachPts: new Float32Array(0), waterGrid: new Uint8Array(1), waterG: [0, 0, 8, 1, 1], downtown: [-200, -200, 200, 200], seaward: [1, 0] };
    const init = buildLifeInit(base, roads, { outdoorSurfaceAt: () => 0 } as unknown as Parameters<typeof buildLifeInit>[2], [], [packJunctions(analyzeJunctions(roads, [], true))]);
    const sim = new LifeSim(init);
    const [c0, c1] = RANGES.cars, was = new Uint8Array(c1);
    let popped = 0, changes = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const yaw = -Math.PI / 2 + 0.6 * Math.sin(t / 20); // looking east along the main road, turning a little
      // (the crowd swells and thins with the slider: cars come and go all the time)
      sim.setEnv({ playerX: -200, playerZ: 10, hour: 12, night: 0, density: 1 + Math.sin(t / 7), wind: 0, clock: t, playerYaw: yaw });
      sim.step(0.05);
      for (let c = c0; c < c1; c++) {
        if (t > 5 && sim.active[c] !== was[c]) {
          changes++;
          const x = sim.active[c] ? sim.x[c] : sim.px[c], z = sim.active[c] ? sim.z[c] : sim.pz[c], dx = x + 200, dz = z - 10, d = Math.hypot(dx, dz);
          if (d < 260 && (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d > 0.45) popped++;
        }
        was[c] = sim.active[c];
      }
    }
    expect(changes).toBeGreaterThan(20);
    expect(popped).toBe(0);
  });
});

describe('mapped crosswalks (Seattle maps one on every arm of every junction)', () => {
  const base: LifeBase = { seed: 11, bounds: [-400, -400, 400, 400], beachPts: new Float32Array(0), waterGrid: new Uint8Array(1), waterG: [0, 0, 8, 1, 1], downtown: [-200, -200, 200, 200], seaward: [1, 0] };
  const walk = { outdoorSurfaceAt: () => 0 } as unknown as Parameters<typeof buildLifeInit>[2];
  const J = [-150, 0, 150];
  // the busy grid again, each street carrying a vertex `xw` out on every arm of every junction with
  // a crossing footway through it (and one mid-block crossing, 60 m along the main road)
  const grid = (xw: number) => {
    const line = (c: string, w: number, fixed: number, ns: boolean) => {
      const ts = [-250, ...J.flatMap((t) => [t - xw, t, t + xw]), 250];
      if (c === 'primary') ts.splice(ts.indexOf(0 + xw) + 1, 0, 60);
      return road(c, w, ts.map((t) => (ns ? [fixed, t] : [t, fixed]) as [number, number]));
    };
    const roads = [
      line('primary', 11, 0, false), line('residential', 6.5, -150, false), line('residential', 6.5, 150, false),
      line('secondary', 9, 0, true), line('residential', 6.5, -150, true), line('residential', 6.5, 150, true),
    ];
    for (const x of J) for (const z of J)
      for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const cx = x + dx * xw, cz = z + dz * xw; // across the arm, through its vertex
        roads.push(road('footway', 2, [[cx - dz * 8, cz - dx * 8], [cx, cz], [cx + dz * 8, cz + dx * 8]]));
      }
    roads.push(road('footway', 2, [[60, -8], [60, 0], [60, 8]]));
    return roads;
  };
  const obb = (sim: LifeSim, i: number, j: number) => {
    const box = (c: number) => { const fx = -Math.sin(sim.yaw[c]), fz = -Math.cos(sim.yaw[c]); return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [sim.x[c] + fx * a * 2.2 - fz * b * 0.9, sim.z[c] + fz * a * 2.2 + fx * b * 0.9]); };
    const A = box(i), B = box(j);
    for (const P of [A, B])
      for (let k = 0; k < 2; k++) {
        const nx = P[k + 1][1] - P[k][1], nz = P[k][0] - P[k + 1][0];
        const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
        if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
      }
    return true;
  };

  it('a crossing near a junction leaves its approach whole; one mid-block still joins the street', () => {
    const roads = grid(7);
    const init = buildLifeInit(base, roads, walk, [], [packJunctions(analyzeJunctions(roads, [], true))]);
    let shortest = Infinity, mid = false;
    for (let e = 0; e < init.edgeLen.length; e++) {
      if (init.edgeInfo[e * 4] < 2) continue;
      shortest = Math.min(shortest, init.edgeLen[e]);
      for (const end of [0, 1]) { const n = init.edgeNodes[e * 2 + end]; if (Math.hypot(init.nodeXZ![n * 2] - 60, init.nodeXZ![n * 2 + 1]) < 0.1) mid = true; }
    }
    expect(shortest).toBeGreaterThan(50); // (was 7 m: every arm a stub inside the junction's box)
    expect(mid).toBe(true);
  });

  it('three busy minutes: cars stop at the lines, and no two ever overlap', () => {
    const roads = grid(7);
    const init = buildLifeInit(base, roads, walk, [], [packJunctions(analyzeJunctions(roads, [], true))]);
    const sim = new LifeSim(init);
    const [c0, c1] = RANGES.cars;
    let overlaps = 0, cars = 0;
    for (let t = 0; t < 180; t += 0.05) {
      sim.setEnv({ playerX: 10, playerZ: 10, hour: 12, night: 0, density: 1, wind: 0, clock: t });
      sim.step(0.05);
      if (t < 10) continue;
      for (let c = c0; c < c1; c++) {
        if (!sim.active[c]) continue;
        cars++;
        for (let d = c + 1; d < c1; d++) if (sim.active[d] && Math.abs(sim.x[d] - sim.x[c]) < 5 && Math.abs(sim.z[d] - sim.z[c]) < 5 && obb(sim, c, d)) overlaps++;
      }
    }
    expect(cars / 3400).toBeGreaterThan(30);
    expect(overlaps).toBe(0); // (8,000 overlapping pair-ticks before: nobody stopped at a junction)
  });
});

describe('tunnels: the cars dive under the blocks, nobody walks there', () => {
  it('a tunnel piece goes down from its portal, is not walkable, and its surface street is untouched', () => {
    const base: LifeBase = { seed: 3, bounds: [-900, -900, 900, 900], beachPts: new Float32Array(0), waterGrid: new Uint8Array(1), waterG: [0, 0, 8, 1, 1], downtown: [-100, -100, 100, 100], seaward: [1, 0] };
    const walk = { outdoorSurfaceAt: () => 20 } as unknown as Parameters<typeof buildLifeInit>[2];
    // a street in the open from x = -300 to 0, then the tunnel on to x = 400 (road() takes decimetres)
    const street = { p: [-3000, 0, 0, 0], c: 'primary', w: 11 } as Road;
    const tunnel = { p: [0, 0, 4000, 0], c: 'primary', w: 11, tu: 1 } as Road;
    const init = buildLifeInit(base, [street], walk, [], [], [tunnel]);
    expect(init.edgeLen.length).toBe(2);
    let te = -1;
    for (let e = 0; e < 2; e++) if (init.edgeInfo[e * 4 + 3] < 0.5) te = e;
    expect(te).toBeGreaterThanOrEqual(0); // the tunnel is the one nobody walks
    const c = init.edgeCount[te], s0 = init.edgeStart[te], P = init.edgePts;
    const ys = Array.from({ length: c }, (_, j) => P[(s0 + j) * 3 + 1]);
    const xs = Array.from({ length: c }, (_, j) => P[(s0 + j) * 3]);
    const atPortal = ys[xs[0] < xs[c - 1] ? 0 : c - 1], deepest = Math.min(...ys);
    expect(atPortal).toBeCloseTo(20, 1); // level with the street at the portal
    expect(deepest).toBeLessThan(20 - 8); // and well under the blocks further on
    const se = 1 - te;
    for (let j = 0; j < init.edgeCount[se]; j++) expect(P[(init.edgeStart[se] + j) * 3 + 1]).toBe(20);
  });
});

describe('tunnel portals', () => {
  it('finds the mouth where a tunnel meets a street, facing out along it', async () => {
    const { findPortals, portalMeshes } = await import('../src/world/portals');
    const road = (pts: [number, number][], extra: Record<string, unknown> = {}) => ({ p: pts.flatMap(([x, z]) => [x * 10, z * 10]), c: 'motorway', w: 14, ...extra }) as never;
    const ports = findPortals([road([[0, 0], [100, 0]]), road([[100, 0], [400, 0]], { tu: 1 }), road([[400, 0], [500, 0]])]);
    expect(ports.length).toBe(2);
    const west = ports.find((p) => p.x === 100)!;
    expect(west.ux).toBeCloseTo(1, 6); // into the tunnel, eastward
    const { group, walls } = portalMeshes(ports, () => 12);
    expect(group.children.length).toBe(1);
    expect(walls.length).toBe(4);
    // the opening leaves the carriageway clear: the piers stand outside it
    for (const [a, b] of walls) for (const [, z] of [a, b]) expect(Math.abs(z)).toBeGreaterThan(7);
  });
});
