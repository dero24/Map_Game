import { describe, it, expect } from 'vitest';
import { LifeSim, PED_STATE, PED } from '../src/sim/lifeSim';
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

  it("who walks in by the open building's door goes on in to a place, and stays inside through a close and a reopen", { timeout: 15000 }, () => {
    // (Robby: "people going into buildings disappear — it all needs to be persistent")
    const sim = new LifeSim(town());
    sim.setEnv({ playerX: -900, playerZ: -900, hour: 14, night: 0, density: 1, wind: 0.5 });
    const D = town().doors;
    // the first walker on a door's final approach: their building opens, three places inside it
    let i = -1;
    for (let t = 0; t < 20000 && i < 0; t++) {
      sim.step(0.05);
      for (let k = RANGES.peds[0]; k < RANGES.peds[1]; k++) if (sim.active[k] && sim.state[k] === PED_STATE.TO_DOOR && sim.leg[k] === 1) { i = k; break; }
    }
    expect(i).toBeGreaterThanOrEqual(0);
    const o = sim.door[i] * 6, dx = D[o], dz = D[o + 2], inward = Math.sign(D[o + 2] - D[o + 5]);
    const spots = new Float32Array([dx - 2, 1.8, dz + inward * 4, 0, dx, 1.8, dz + inward * 6, 0, dx + 2, 1.8, dz + inward * 4, 0]);
    sim.setIndoor({ door: [dx, dz], spots });
    const atSpot = () => [0, 1, 2].some((k) => Math.hypot(sim.x[i] - spots[k * 4], sim.z[i] - spots[k * 4 + 2]) < 0.35);
    let stayed = false;
    for (let t = 0; t < 2000 && !stayed; t++) {
      sim.step(0.05);
      if (sim.state[i] === PED_STATE.IN_WALK || sim.state[i] === PED_STATE.IN_STAY) expect(sim.y[i]).toBeGreaterThan(1); // seen, on the floor inside
      if (sim.state[i] === PED_STATE.IN_STAY) stayed = atSpot();
    }
    expect(stayed).toBe(true);
    // the building closes (you walked off): they're inside still, unseen
    sim.setIndoor(null);
    expect(sim.state[i]).toBe(PED_STATE.INSIDE);
    sim.step(0.05);
    expect(sim.y[i]).toBeLessThan(-500);
    // it opens again: there they are, at a place, at once
    sim.setIndoor({ door: [dx, dz], spots });
    expect(sim.state[i]).toBe(PED_STATE.IN_STAY);
    expect(atSpot()).toBe(true);
    // and in time they walk back out by the door, and on down the street
    let out = false;
    for (let t = 0; t < 12000 && !out; t++) { sim.step(0.05); out = sim.state[i] === PED_STATE.FROM_DOOR || sim.state[i] === PED_STATE.WALK; }
    expect(out).toBe(true);
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

// A grid town: 5 × 5 blocks of 80 m, doors along every street on both sides every 20 m (so a walker
// anywhere can find one) — the street's share of who's out, not one road's.
function grid(): LifeInit {
  const N = 6, B = 80, nodes: [number, number][] = [], edges: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) nodes.push([i * B, j * B]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * N + i; if (i + 1 < N) edges.push([a, a + 1]); if (j + 1 < N) edges.push([a, a + N]); }
  const pts: number[] = [], start: number[] = [], count: number[] = [], len: number[] = [], info: number[] = [], en: number[] = [], doors: number[] = [];
  for (const [a, b] of edges) {
    const [ax, az] = nodes[a], [bx, bz] = nodes[b], dx = (bx - ax) / B, dz = (bz - az) / B;
    start.push(pts.length / 3);
    for (let k = 0; k < 21; k++) pts.push(ax + ((bx - ax) * k) / 20, 1.5, az + ((bz - az) * k) / 20);
    count.push(21); len.push(B); info.push(2, 6.5, 0, 1); en.push(a, b);
    for (let t = 10; t < B; t += 20) for (const s of [-1, 1]) { const x = ax + dx * t, z = az + dz * t; doors.push(x - dz * s * 9, 1.8, z + dx * s * 9, x - dz * s * 6, 1.5, z + dx * s * 6); }
  }
  const adj: number[][] = nodes.map(() => []);
  edges.forEach(([a, b], e) => { adj[a].push(e); adj[b].push(e); });
  const nodeEdgeStart = [0], nodeEdges: number[] = [];
  for (const l of adj) { nodeEdges.push(...l); nodeEdgeStart.push(nodeEdges.length); }
  return {
    seed: 7, bounds: [-50, -50, N * B + 50, N * B + 50],
    edgePts: new Float32Array(pts), edgeStart: new Int32Array(start), edgeCount: new Int32Array(count), edgeLen: new Float32Array(len),
    edgeInfo: new Float32Array(info), edgeNodes: new Int32Array(en), nodeEdgeStart: new Int32Array(nodeEdgeStart), nodeEdges: new Int32Array(nodeEdges),
    beachPts: new Float32Array(0), waterGrid: new Uint8Array(4), waterG: [-50, -50, 400, 2, 2], downtown: [0, 0, 400, 400], seaward: [1, 0],
    doors: new Float32Array(doors),
  };
}

describe('who walks the street (review round 12: "dogs fill the street")', () => {
  it('dog walkers go in at doors too, so the street keeps the share of dog walkers the sim assigns', { timeout: 30000 }, () => {
    // (it was ~23% of who's out by day where 9% were assigned: only the others went indoors)
    const sim = new LifeSim(grid());
    sim.setEnv({ playerX: 200, playerZ: 200, hour: 14, night: 0, density: 1, wind: 0.5 });
    const out = new Float32Array(MAX_ENTITIES * S.STRIDE);
    let all = 0, dogs = 0, outdoors = 0, dogsOut = 0, dogInside = false;
    for (let t = 0; t < 12000; t++) {
      sim.step(0.05);
      if (t % 200 === 0) sim.publish(out);
      if (t < 3000 || t % 100) continue;
      for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
        if (!sim.active[i] || sim.lights[i] & PED.JOG) continue; // (joggers never stop: counted apart)
        const dog = (sim.lights[i] & PED.DOG) !== 0, inside = sim.state[i] === PED_STATE.INSIDE;
        all++; if (dog) dogs++;
        if (!inside) { outdoors++; if (dog) dogsOut++; }
        if (dog && inside) dogInside = true;
      }
    }
    const assigned = dogs / all, seen = dogsOut / outdoors;
    console.log(`[life] dog walkers: ${(assigned * 100).toFixed(1)}% assigned, ${(seen * 100).toFixed(1)}% of who's outdoors`);
    expect(dogInside).toBe(true);
    expect(assigned).toBeGreaterThan(0.04);
    expect(seen / assigned).toBeLessThan(1.3);
  });
});

// Robby, 2026-10-04: "people walking sometimes walk through walls of building to other side around
// corners and when walking on porch into house they fall into the floor then stand normal on floor again"
describe('walkers keep to open ground', () => {
  it('climb a porch: up its steps, then level across the deck — never sinking into either', { timeout: 30000 }, () => {
    // town()'s shopfronts given porches: the deck 1.1 m up, 2 m deep before the wall, its steps 1 m
    // from the foot (9 m back from the road) to the deck's edge (10 m)
    const w = town(), n = w.doors.length / 6, path: number[] = [], at = [0];
    for (let k = 0; k < n; k++) {
      const s = Math.sign(w.doors[k * 6 + 2]);
      w.doors[k * 6 + 1] = 2.6;
      path.push(w.doors[k * 6], 2.6, 10 * s);
      at.push(path.length / 3);
    }
    w.doorPath = new Float32Array(path); w.doorPathAt = new Int32Array(at);
    w.doorN = new Float32Array(Array.from({ length: n }, (_, k) => [0, -Math.sign(w.doors[k * 6 + 2])]).flat());
    const profile = (z: number) => { const a = Math.abs(z); return a >= 10 ? 2.6 : a <= 9 ? 1.5 : 1.5 + 1.1 * (a - 9); };
    const sim = new LifeSim(w);
    sim.setEnv({ playerX: 200, playerZ: 0, hour: 14, night: 0, density: 1, wind: 0.5 });
    let onSteps = 0, worst = 0;
    for (let t = 0; t < 9000; t++) {
      sim.step(0.05);
      for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
        const st = sim.state[i];
        // (the stair legs: up from the foot to the door, down from the door to the foot)
        if (!sim.active[i] || !((st === PED_STATE.TO_DOOR && sim.leg[i] === 1) || (st === PED_STATE.FROM_DOOR && sim.leg[i] === 0))) continue;
        const a = Math.abs(sim.z[i]);
        if (a < 9.05 || a > 12) continue;
        onSteps++;
        worst = Math.max(worst, profile(sim.z[i]) - sim.y[i]);
      }
    }
    console.log(`[life] porch: ${onSteps} samples on the steps and deck, deepest ${worst.toFixed(2)} m under`);
    expect(onSteps).toBeGreaterThan(50);
    expect(worst).toBeLessThan(0.08); // (a step's nosing, at most — a straight glide was 0.7 m under)
  });

  it('never set out for a door round the corner, through its building', { timeout: 30000 }, () => {
    // grid()'s blocks with a door every 10 m down every street (both sides, 9 m back): the buildings
    // fill each block more than 9.5 m from its streets
    const crossings = (normals: boolean) => {
      const w = grid(), N = 6, B = 80, doors: number[] = [], nrm: number[] = [];
      for (let e = 0; e < w.edgeNodes.length / 2; e++) {
        const a = w.edgeNodes[e * 2], b = w.edgeNodes[e * 2 + 1];
        const ax = (a % N) * B, az = Math.floor(a / N) * B, dx = ((b % N) * B - ax) / B, dz = (Math.floor(b / N) * B - az) / B;
        for (let t = 5; t < B; t += 10) for (const s of [-1, 1]) {
          const x = ax + dx * t, z = az + dz * t;
          doors.push(x - dz * s * 9, 1.8, z + dx * s * 9, x - dz * s * 6, 1.5, z + dx * s * 6);
          nrm.push(dz * s, -dx * s);
        }
      }
      w.doors = new Float32Array(doors);
      if (normals) w.doorN = new Float32Array(nrm);
      const sim = new LifeSim(w);
      sim.setEnv({ playerX: 200, playerZ: 200, hour: 14, night: 0, density: 1, wind: 0.5 });
      const was = new Uint8Array(sim.state.length);
      const inBlock = (x: number, z: number) => { const u = ((x % B) + B) % B, v = ((z % B) + B) % B; return u > 9.5 && u < B - 9.5 && v > 9.5 && v < B - 9.5; };
      let set = 0, through = 0;
      for (let t = 0; t < 6000; t++) {
        sim.step(0.05);
        for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
          if (sim.state[i] === PED_STATE.TO_DOOR && was[i] !== PED_STATE.TO_DOOR) {
            set++;
            const o = sim.door[i] * 6, fx = w.doors[o + 3], fz = w.doors[o + 5];
            let hit = false;
            for (let k = 1; k < 20 && !hit; k++) hit = inBlock(sim.fx[i] + ((fx - sim.fx[i]) * k) / 20, sim.fz[i] + ((fz - sim.fz[i]) * k) / 20);
            if (hit) through++;
          }
          was[i] = sim.state[i];
        }
      }
      return { set, through };
    };
    const before = crossings(false), after = crossings(true);
    console.log(`[life] corners: ${before.through}/${before.set} set out through a building without the wall's side, ${after.through}/${after.set} with it`);
    expect(before.through).toBeGreaterThan(0); // (the test sees the glitch)
    expect(after.set).toBeGreaterThan(30);
    expect(after.through).toBe(0);
  });
});
