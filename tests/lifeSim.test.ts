import { describe, it, expect } from 'vitest';
import { LifeSim, PED_STATE } from '../src/sim/lifeSim';
import { RANGES, S, MAX_ENTITIES, type LifeInit } from '../src/sim/protocol';

// A tiny synthetic town: a 400 m square loop (a main road + side streets), a beach strip and a bay.
function town(): LifeInit {
  const corners = [[0, 0], [400, 0], [400, 400], [0, 400]];
  const pts: number[] = [], start: number[] = [], count: number[] = [], len: number[] = [], info: number[] = [], nodes: number[] = [];
  for (let e = 0; e < 4; e++) {
    const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
    start.push(pts.length / 3);
    const n = 101;
    for (let k = 0; k < n; k++) pts.push(ax + ((bx - ax) * k) / (n - 1), 1.5, az + ((bz - az) * k) / (n - 1));
    count.push(n);
    len.push(400);
    info.push(e === 0 ? 5 : 2, e === 0 ? 11 : 6.5, 0, 1);
    nodes.push(e, (e + 1) % 4);
  }
  const nodeEdgeStart = new Int32Array([0, 2, 4, 6, 8]);
  const nodeEdges = new Int32Array([3, 0, 0, 1, 1, 2, 2, 3]);
  const beach: number[] = [];
  for (let z = 0; z <= 400; z += 5) beach.push(430, 1, z);
  const water = new Uint8Array(20 * 20);
  for (let j = 0; j < 20; j++) for (let i = 15; i < 20; i++) water[j * 20 + i] = 1;
  return {
    seed: 99,
    bounds: [-50, -50, 600, 450],
    edgePts: new Float32Array(pts), edgeStart: new Int32Array(start), edgeCount: new Int32Array(count), edgeLen: new Float32Array(len),
    edgeInfo: new Float32Array(info), edgeNodes: new Int32Array(nodes), nodeEdgeStart, nodeEdges,
    beachPts: new Float32Array(beach), waterGrid: water, waterG: [-50, -50, 32, 20, 20], downtown: [0, 0, 400, 400], seaward: [1, 0],
    // a row of shopfronts on both sides of the main road (z = 0), threshold 12 m back, front step 9 m back
    doors: new Float32Array(Array.from({ length: 16 }, (_, k) => {
      const x = 20 + (k >> 1) * 45, s = k & 1 ? 1 : -1;
      return [x, 1.8, 12 * s, x, 1.5, 9 * s];
    }).flat()),
  };
}

const run = (ticks: number, env = {}) => {
  const sim = new LifeSim(town());
  sim.setEnv({ playerX: 200, playerZ: 200, hour: 14, night: 0, density: 1, wind: 0.5, ...env });
  const out = new Float32Array(MAX_ENTITIES * S.STRIDE);
  for (let t = 0; t < ticks; t++) { sim.step(0.05); sim.publish(out); }
  return { sim, out };
};

describe('LifeSim', () => {
  it('is deterministic for a seed and input sequence', () => {
    const a = run(400).out, b = run(400).out;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('spawns traffic and pedestrians by day and thins them at night', () => {
    const day = run(40).sim, night = run(1400, { hour: 3, night: 1, playerX: -5000, playerZ: -5000 }).sim;
    const count = (s: LifeSim, r: readonly [number, number]) => { let n = 0; for (let i = r[0]; i < r[1]; i++) n += s.active[i]; return n; };
    expect(count(day, RANGES.cars)).toBeGreaterThan(10);
    expect(count(day, RANGES.peds)).toBeGreaterThan(10);
    expect(count(night, RANGES.cars)).toBeLessThan(count(day, RANGES.cars));
    expect(count(night, RANGES.peds)).toBeLessThan(count(day, RANGES.peds));
  });

  it('keeps cars on the road network and moving', () => {
    const { sim } = run(600);
    let moving = 0;
    for (let i = RANGES.cars[0]; i < RANGES.cars[1]; i++) {
      if (!sim.active[i]) continue;
      const nearEdge = Math.min(Math.abs(sim.z[i]), Math.abs(sim.z[i] - 400), Math.abs(sim.x[i]), Math.abs(sim.x[i] - 400));
      expect(nearEdge).toBeLessThan(3.5);
      if (sim.speed[i] > 1) moving++;
    }
    expect(moving).toBeGreaterThan(3);
  });

  it('cars stop for the walker standing in the road (or inch past slowly, never hitting them)', () => {
    const { sim } = run(400, { playerX: 200, playerZ: 0 });
    for (let i = RANGES.cars[0]; i < RANGES.cars[1]; i++) {
      if (!sim.active[i]) continue;
      const d = Math.hypot(sim.x[i] - 200, sim.z[i]);
      if (d < 1.5) throw new Error(`car ${i} ran into the walker (d=${d.toFixed(2)})`);
      if (d < 3.5 && sim.speed[i] > 2.5) throw new Error(`car ${i} passed the walker at ${sim.speed[i].toFixed(1)} m/s (d=${d.toFixed(2)})`);
    }
  });

  it('gulls scatter from the walker and roost at night', () => {
    const { sim } = run(200, { playerX: 430, playerZ: 200 });
    for (let i = RANGES.gulls[0]; i < RANGES.gulls[1]; i++) {
      if (sim.state[i] === 4) expect(Math.hypot(sim.x[i] - 430, sim.z[i] - 200)).toBeGreaterThan(5);
    }
    const night = run(3000, { night: 1, hour: 23, playerX: -5000, playerZ: -5000 }).sim;
    let standing = 0;
    for (let i = RANGES.gulls[0]; i < RANGES.gulls[1]; i++) standing += night.state[i] === 4 ? 1 : 0;
    expect(standing / (RANGES.gulls[1] - RANGES.gulls[0])).toBeGreaterThan(0.6);
  });

  it('pedestrians walk up to doors, go inside (hidden) and come back out', { timeout: 15000 }, () => {
    const sim = new LifeSim(town());
    sim.setEnv({ playerX: -900, playerZ: -900, hour: 14, night: 0, density: 1, wind: 0.5 });
    const out = new Float32Array(MAX_ENTITIES * S.STRIDE);
    let sawInside = false, sawExit = false;
    for (let t = 0; t < 6000; t++) {
      sim.step(0.05);
      sim.publish(out);
      for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
        if (!sim.active[i]) continue;
        if (sim.state[i] === PED_STATE.INSIDE) {
          sawInside = true;
          expect(sim.y[i]).toBeLessThan(-500);
        }
        if (sim.state[i] === PED_STATE.FROM_DOOR) sawExit = true;
        if (sim.state[i] === PED_STATE.TO_DOOR && sim.leg[i] === 1) {
          // on the final approach they are between the front step and the threshold
          const o = sim.door[i] * 6;
          const D = town().doors;
          expect(Math.abs(sim.x[i] - D[o])).toBeLessThan(1.5);
        }
      }
    }
    expect(sim.visits).toBeGreaterThan(3);
    expect(sawInside).toBe(true);
    expect(sawExit).toBe(true);
  });

  it('boats stay on the water', () => {
    const { sim } = run(1200);
    for (let i = RANGES.boats[0]; i < RANGES.boats[1]; i++) {
      if (!sim.active[i]) continue;
      expect(sim.x[i]).toBeGreaterThan(-50 + 15 * 32 - 12);
    }
  });

  it('keeps every car and walker when the road graph is rebuilt (tiles streaming in)', () => {
    const { sim } = run(200);
    const next = new LifeSim(town(), sim); // the same roads, re-sent as a new graph
    let kept = 0, moved = 0;
    for (const r of [RANGES.cars, RANGES.peds])
      for (let i = r[0]; i < r[1]; i++) {
        if (!sim.active[i]) continue;
        if (next.active[i]) kept++;
        if (next.variant[i] !== sim.variant[i]) moved += 100;
        if (next.active[i] && next.y[i] > -500) moved = Math.max(moved, Math.hypot(next.x[i] - sim.x[i], next.z[i] - sim.z[i]));
      }
    let before = 0;
    for (const r of [RANGES.cars, RANGES.peds]) for (let i = r[0]; i < r[1]; i++) before += sim.active[i];
    expect(before).toBeGreaterThan(20);
    expect(kept).toBeGreaterThanOrEqual(before - Math.max(2, Math.ceil(before * 0.01))); // only door-bound walkers may vanish (≤ 1 %), and they're indoors
    expect(moved).toBeLessThan(0.5); // nobody jumps
    next.setEnv({ playerX: 200, playerZ: 200, hour: 14, night: 0, density: 1, wind: 0.5 });
    for (let t = 0; t < 40; t++) next.step(0.05); // and the town carries on
  });

  it('a car knocks walkers in its path down; they tumble, lie a moment, get up and walk on', () => {
    const { sim, out } = run(200);
    let i = -1;
    for (let k = RANGES.peds[0]; k < RANGES.peds[1]; k++) if (sim.active[k] && sim.state[k] !== PED_STATE.INSIDE) { i = k; break; }
    expect(i).toBeGreaterThanOrEqual(0);
    const x0 = sim.x[i], z0 = sim.z[i];
    // a car 1 m behind them doing ~40 km/h eastward
    expect(sim.bump(x0 - 1, z0, 11, 0)).toBeGreaterThanOrEqual(1);
    expect(sim.state[i]).toBe(PED_STATE.DOWN);
    sim.step(0.05); sim.publish(out);
    const amt0 = out[i * S.STRIDE + S.AMT];
    expect(amt0 <= -1 && amt0 > -2).toBe(true); // sprawled (the renderer tumbles them once)
    for (let t = 0; t < 20; t++) sim.step(0.05);
    expect(sim.x[i] - x0).toBeGreaterThan(1.5); // thrown along with the car
    expect(sim.y[i]).toBeGreaterThan(-1); // never through the ground
    for (let t = 0; t < 19; t++) sim.step(0.05); // 2.0 s in: past the ~1.5 s sprawl, before the ~2.6 s get-up
    sim.publish(out);
    expect(out[i * S.STRIDE + S.AMT]).toBe(-2.5); // sitting up after ~1.5 s, never left lying
    let jump = 0;
    for (let t = 0; t < 140; t++) { const px = sim.x[i], pz = sim.z[i]; sim.step(0.05); if (sim.state[i] === PED_STATE.DOWN) jump = Math.max(jump, Math.hypot(sim.x[i] - px, sim.z[i] - pz)); }
    expect(sim.state[i]).not.toBe(PED_STATE.DOWN); // back on their feet
    expect(jump).toBeLessThan(0.5); // walked back to the path, no teleport
    // a slow roll or a car going the other way hits nobody
    expect(sim.bump(sim.x[i] - 1, sim.z[i], 1.5, 0)).toBe(0);
  });

  it('cars never drive fused together (spawned apart, dead heats resolved, following across corners)', () => {
    const sim = new LifeSim(town());
    sim.setEnv({ playerX: 200, playerZ: 200, hour: 17.3, night: 0, density: 3, wind: 0.5 });
    let fused = 0, samples = 0;
    for (let t = 0; t < 1600; t++) {
      sim.step(0.05);
      if (t < 200 || t % 50) continue;
      samples++;
      for (let a = RANGES.cars[0]; a < RANGES.cars[1]; a++) {
        if (!sim.active[a]) continue;
        for (let b = a + 1; b < RANGES.cars[1]; b++) {
          if (!sim.active[b]) continue;
          if (Math.hypot(sim.x[a] - sim.x[b], sim.z[a] - sim.z[b]) < 2.2 && Math.abs(Math.sin(sim.yaw[a] - sim.yaw[b])) < 0.3) fused++;
        }
      }
    }
    expect(samples).toBeGreaterThan(20);
    expect(fused).toBe(0);
  });

  it('walkers stop to talk to each other (face to face, gesturing) and linger at shop windows', () => {
    const sim = new LifeSim(town());
    sim.setEnv({ playerX: 200, playerZ: 200, hour: 15, night: 0, density: 1, wind: 0.5 });
    let chats = 0, pairsFaceToFace = true;
    for (let t = 0; t < 1200; t++) {
      sim.step(0.05);
      if (t % 100) continue;
      for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
        if (!sim.active[i] || sim.state[i] !== PED_STATE.CHAT) continue;
        chats++;
        // the one they're talking to stands within a couple of metres, in front of them
        let partner = false;
        for (let j = RANGES.peds[0]; j < RANGES.peds[1] && !partner; j++) {
          if (j === i || sim.state[j] !== PED_STATE.CHAT) continue;
          const dx = sim.x[j] - sim.x[i], dz = sim.z[j] - sim.z[i], d = Math.hypot(dx, dz);
          if (d < 2.3 && (-Math.sin(sim.yaw[i]) * dx - Math.cos(sim.yaw[i]) * dz) / d > 0.9) partner = true;
        }
        if (!partner) pairsFaceToFace = false;
      }
    }
    expect(chats).toBeGreaterThan(0);
    expect(pairsFaceToFace).toBe(true);
  });

  it('each kind of place keeps its own day: beach afternoons, town errands, desert evenings', () => {
    const at = (rhythm: 'shore' | 'town' | 'desert', hour: number) => {
      const sim = new LifeSim({ ...town(), rhythm });
      sim.setEnv({ playerX: 200, playerZ: 200, hour, night: 0, density: 1, wind: 0.5 });
      return (sim as unknown as { desired(k: 'ped' | 'car'): number }).desired('ped');
    };
    expect(at('shore', 15)).toBeGreaterThan(at('shore', 10)); // the beach crowd builds
    expect(at('desert', 12.5)).toBeLessThan(at('desert', 8)); // the midday lull in the heat
    expect(at('desert', 12.5)).toBeLessThan(at('desert', 20)); // and life after sunset
    expect(at('town', 10)).toBeGreaterThan(at('town', 3) * 3); // an ordinary town isn't empty mid-morning
    expect(at('town', 12.5)).toBeGreaterThan(at('desert', 12.5));
  });
});
