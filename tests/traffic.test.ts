import { describe, it, expect } from 'vitest';
import { analyzeJunctions, packJunctions, unpackJunctions, signalState, signalKey, SIG_CYCLE, CTL } from '../src/sim/traffic';
import { buildLifeInit, type LifeBase } from '../src/sim/life';
import { LifeSim } from '../src/sim/lifeSim';
import { RANGES } from '../src/sim/protocol';
import type { Road, Point } from '../src/world/data';

const road = (c: string, w: number, pts: [number, number][], ow?: 1): Road => ({ c, w, p: pts.flatMap(([x, z]) => [x * 10, z * 10]), ...(ow ? { ow } : {}) });
const cross = (a: string, wa: number, b: string, wb: number) => [road(a, wa, [[-100, 0], [0, 0], [100, 0]]), road(b, wb, [[0, -100], [0, 0], [0, 100]])];
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
    expect(sim.z[c]).toBeGreaterThan(11 / 2 + 1.5 - 0.5); // not over the stop line
    expect(sim.z[c]).toBeLessThan(16);
    drive(sim, 20, 45); // the cross street's green comes round
    expect(sim.edge[c]).not.toBe(e);
  });

  it('walkers wait at the corner for their light', () => {
    const { sim, init } = scene(cross('primary', 11, 'secondary', 9));
    // a walker on the north arm's sidewalk heading for the junction (the cross street's phase: red first)
    const p = RANGES.peds[0];
    let e = -1, dir = 1;
    for (let k = 0; k < init.edgeLen.length; k++) {
      const a = init.edgeStart[k] * 3, b = (init.edgeStart[k] + init.edgeCount[k] - 1) * 3, P = init.edgePts;
      if (Math.abs(P[a]) < 0.1 && Math.abs(P[b]) < 0.1 && Math.max(P[a + 2], P[b + 2]) > 50) { e = k; dir = P[b + 2] < P[a + 2] ? 1 : -1; }
    }
    sim.active[p] = 1; sim.edge[p] = e; sim.dir[p] = dir; sim.s[p] = dir > 0 ? init.edgeLen[e] - 20 : 20; sim.speed[p] = 1.4; sim.side[p] = 1; sim.state[p] = 0;
    drive(sim, 0, 20); // 20 s of red for the cross street
    const dN = dir > 0 ? init.edgeLen[e] - sim.s[p] : sim.s[p];
    expect(sim.edge[p]).toBe(e);
    expect(dN).toBeGreaterThan(11 / 2 + 1.5 - 1.3);
    expect(dN).toBeLessThan(11 / 2 + 1.5 + 0.7);
    drive(sim, 20, 45); // the walk comes round
    expect(sim.edge[p] !== e || Math.abs((dir > 0 ? init.edgeLen[e] - sim.s[p] : sim.s[p]) - dN) > 3).toBe(true);
  });

  it('comes to a full stop at a stop sign, then pulls out', () => {
    const { sim, c, e } = scene(cross('primary', 11, 'residential', 6.5));
    let stopped = false;
    for (let t = 0; t < 30 && sim.edge[c] === e; t += 0.05) {
      sim.setEnv({ playerX: 40, playerZ: 30, hour: 12, night: 0, density: 0, wind: 0, clock: t });
      sim.step(0.05);
      if (sim.speed[c] < 0.3 && sim.z[c] < 12) stopped = true;
    }
    expect(stopped).toBe(true);
    expect(sim.edge[c]).not.toBe(e);
  });
});
