import { describe, it, expect } from 'vitest';
import { LifeSim, LAND, RHYTHM, homeCurve, landShare, pedShare, rhythmCurve, ruralShare, type Place } from '../src/sim/lifeSim';
import { crowdOf, lifeParams } from '../src/sim/life';
import { RANGES, SIM_HZ, type LifeInit } from '../src/sim/protocol';

// Who's about, by the kind of place and the hour (lifeSim.ts LAND, pedShare, ruralShare; sim/life.ts
// crowdOf): the walkers and the cars the sim wants about the walker, at the default knobs on a desktop,
// against a target table. Robby, 2026-10-07: "it is still so crowded at nighttime in a lot of places
// where it shouldnt be and like random desert roads are crowded too".

/** A road `len` m long of this rank (2 residential or farm, 3 tertiary, 5 primary) through the walker at
 *  (0, 0), and `foot` m of footpath beside it (a park's paths). */
function road(rank: number, len = 2000, foot = 0): LifeInit {
  const pts: number[] = [], start: number[] = [], count: number[] = [], lens: number[] = [], info: number[] = [], nodes: number[] = [];
  const edge = (z: number, L: number, r: number) => {
    start.push(pts.length / 3);
    for (let k = 0; k <= 40; k++) pts.push(-L / 2 + (L * k) / 40, 1.5, z);
    count.push(41); lens.push(L); info.push(r, r >= 2 ? 7 : 2.5, 0, 1); nodes.push(nodes.length, nodes.length + 1);
  };
  edge(0, len, rank);
  if (foot > 0) edge(25, foot, 0);
  const n = nodes.length;
  return {
    seed: 11, bounds: [-len / 2 - 50, -100, len / 2 + 50, 100],
    edgePts: new Float32Array(pts), edgeStart: new Int32Array(start), edgeCount: new Int32Array(count), edgeLen: new Float32Array(lens),
    edgeInfo: new Float32Array(info), edgeNodes: new Int32Array(nodes),
    nodeEdgeStart: new Int32Array(Array.from({ length: n + 1 }, (_, i) => i)), nodeEdges: new Int32Array(Array.from({ length: n }, (_, i) => i >> 1)),
    beachPts: new Float32Array(0), waterGrid: new Uint8Array(4), waterG: [-50, -50, 400, 2, 2], downtown: [0, 0, 0, 0], seaward: [1, 0], doors: new Float32Array(0),
  };
}
type Rh = 'shore' | 'town' | 'desert';
/** The kinds of place: main.ts townAt, cityAt, settledHere about the walker. */
const PLACES: Record<string, { place: Place; rhythm: Rh; world: () => LifeInit }> = {
  city: { place: { town: 1, city: 1, settled: 1 }, rhythm: 'town', world: () => road(3) },
  main: { place: { town: 1, city: 0, settled: 1 }, rhythm: 'shore', world: () => road(5) },
  suburb: { place: { town: 0, city: 0, settled: 1 }, rhythm: 'shore', world: () => road(2) },
  rural: { place: { town: 0, city: 0, settled: 0.08 }, rhythm: 'town', world: () => road(2) },
  desert: { place: { town: 0, city: 0, settled: 0 }, rhythm: 'desert', world: () => road(3) },
  park: { place: { town: 0, city: 0, settled: 0 }, rhythm: 'town', world: () => road(2, 2000, 2500) },
};
/** Night by the hour in October at 40° N (sunset ~18:30): dark from 19:30 to 6:30. */
const nightAt = (h: number) => (h >= 19.5 || h < 6.5 ? 1 : h >= 18.5 ? h - 18.5 : 0);
/** The walkers (or cars) the sim wants about the walker: the mean over the slow coin's tosses. */
function want(kind: 'ped' | 'car', key: string, hour: number, place: Place | null = PLACES[key].place) {
  const P = PLACES[key];
  const sim = new LifeSim({ ...P.world(), rhythm: P.rhythm });
  const S = sim as unknown as { desired(k: 'ped' | 'car'): number; sizeBubble(): void; tick: number };
  sim.setEnv({ playerX: 0, playerZ: 0, hour, night: nightAt(hour), density: lifeParams.density * crowdOf(P.place.town, P.place.city), wind: 0.5, place: place ?? undefined });
  S.sizeBubble();
  let n = 0;
  for (let m = 0; m < 40; m++) { S.tick = m * 60 * SIM_HZ; n += S.desired(kind); }
  return n / 40;
}

// The target table: walkers about the walker (the life bubble, 140–330 m) and cars (the streets within
// 350 m), [min, max] by the hour, at the default knobs on a desktop. A city's core and a main street keep
// their day; a home street goes in by 21:00; the open country next to nobody; a desert road a car every
// few minutes (a want under one is that share of the minutes: one car crossing the bubble in about one).
const TABLE: Record<string, Record<number, [number, number]>> = {
  city: { 3: [10, 60], 12: [400, 640], 20: [150, 640], 22: [10, 640] },
  main: { 3: [0, 4], 12: [120, 400], 17: [150, 400], 20: [50, 200], 22: [15, 50] },
  suburb: { 3: [0, 2], 8: [20, 90], 12: [15, 90], 17: [40, 150], 20: [3, 25], 22: [0, 3] },
  rural: { 3: [0, 0.5], 12: [0.5, 8], 17: [1, 10], 20: [0, 2], 22: [0, 0.5] },
  desert: { 3: [0, 0.2], 8: [0, 2], 12: [0, 1], 17: [0, 3], 20: [0, 1], 22: [0, 0.2] },
  park: { 3: [0, 2], 12: [15, 90], 22: [0, 3] },
};
const CARS: Record<string, Record<number, [number, number]>> = {
  desert: { 3: [0, 0.15], 12: [0.1, 0.6], 17: [0.3, 1.2], 22: [0.05, 0.4] }, // (a car every few minutes; at 3 am an hour can pass)
  rural: { 3: [0, 0.1], 12: [0.1, 0.6], 17: [0.1, 0.8] },
};

describe('who is about, by the place and the hour', () => {
  it('walkers: a city busy in the evening and quiet at 3 am, a main street into the evening, a suburb near empty at night, the country and a desert road next to nobody', () => {
    for (const [key, row] of Object.entries(TABLE))
      for (const [h, [lo, hi]] of Object.entries(row)) {
        const n = want('ped', key, +h);
        expect(n, `${key} ${h}h`).toBeGreaterThanOrEqual(lo);
        expect(n, `${key} ${h}h`).toBeLessThanOrEqual(hi);
      }
  });
  it("cars: a desert road or a farm road a car every few minutes, not a town's traffic", () => {
    for (const [key, row] of Object.entries(CARS))
      for (const [h, [lo, hi]] of Object.entries(row)) {
        const n = want('car', key, +h);
        expect(n, `${key} ${h}h`).toBeGreaterThanOrEqual(lo);
        expect(n, `${key} ${h}h`).toBeLessThanOrEqual(hi);
      }
    // a primary road out in the desert carries more than a farm road, and a share of a town's
    expect(want('car', 'desert', 17)).toBeLessThan(wantOn(road(5), 'desert', 17));
    expect(wantOn(road(5), 'desert', 17)).toBeLessThan(wantOn(road(5), 'main', 17) * 0.3);
  });
  it('before (2026-10-07, the place unknown to the sim): the desert road 150 walkers at 8 pm, a suburb 37 at 10 pm, a desert road 8 cars at 8 am', () => {
    expect(want('ped', 'desert', 20, null)).toBeGreaterThan(120);
    expect(want('ped', 'suburb', 22, null)).toBeGreaterThan(30);
    expect(want('ped', 'rural', 12, null)).toBeGreaterThan(100);
    expect(want('car', 'desert', 8, null)).toBeGreaterThan(5);
    // …and where the place is known, a city's core and a main street's day as they were
    for (const h of [8, 12, 17, 20]) {
      expect(want('ped', 'city', h)).toBeCloseTo(want('ped', 'city', h, null), 0);
      expect(want('ped', 'main', h)).toBeCloseTo(want('ped', 'main', h, null), 0);
    }
  });
  it("the pieces: the land, the home street's day, the late hours, the roads out in the country", () => {
    expect(landShare(0)).toBeCloseTo(LAND.country); expect(landShare(1)).toBe(1); expect(landShare(0.6)).toBe(1);
    expect(landShare(0.1)).toBeLessThan(0.2);
    // a home street's day: out in the morning and after work, in by 21:00; the desert's noon in the shade
    expect(homeCurve('town', 17)).toBeGreaterThan(homeCurve('town', 12));
    expect(homeCurve('town', 21.5)).toBeLessThan(0.05); expect(homeCurve('town', 3)).toBeLessThan(0.05);
    expect(homeCurve('desert', 13.5)).toBeLessThan(homeCurve('town', 13.5) * 0.5);
    // the late hours: a home street dark at 20:00 has half; a main street at 23:30 a sixth of its rhythm's
    const home = { town: 0, city: 0, settled: 1 }, main = { town: 1, city: 0, settled: 1 }, city = { town: 1, city: 1, settled: 1 };
    expect(pedShare('town', 20, 1, home) / pedShare('town', 20, 0, home)).toBeCloseTo(1 - LAND.dark, 5);
    expect(pedShare('shore', 23.5, 1, main) / Math.min(1, rhythmCurve('shore', 'ped', 23.5)) ** RHYTHM.peak).toBeCloseTo(1 - LAND.main, 5);
    expect(pedShare('town', 23.5, 1, city)).toBeCloseTo(Math.min(1, rhythmCurve('town', 'ped', 23.5)) ** RHYTHM.peak, 9);
    expect(pedShare('shore', 14, 0, main)).toBeCloseTo(Math.min(1, rhythmCurve('shore', 'ped', 14)) ** RHYTHM.peak, 9); // (by day a main street as it was)
    // the roads: a town's traffic where it's settled; out in the country each rank its share, the big roads more
    for (let r = 2; r <= 5; r++) { expect(ruralShare(r, 1)).toBe(1); expect(ruralShare(r, 0)).toBe(LAND.rural[r]); }
    expect(ruralShare(5, 0)).toBeGreaterThan(ruralShare(2, 0));
  });
  it('a park: its footpaths make it as walked as a suburb, with no houses about; and empty at night', () => {
    expect(want('ped', 'park', 12)).toBeGreaterThan(want('ped', 'desert', 12) * 20);
    expect(want('ped', 'park', 22)).toBeLessThan(3);
  });
});

describe('arriving', () => {
  const active = (sim: LifeSim, [a, b]: readonly [number, number]) => { let n = 0; for (let i = a; i < b; i++) n += sim.active[i]; return n; };
  it("the first crowd is the hour's and the place's (it was a noon crowd at full density, thinned a walker every half second)", () => {
    const P = PLACES.suburb, env = (hour: number, place?: Place) => ({ playerX: 0, playerZ: 0, hour, night: nightAt(hour), density: lifeParams.density * crowdOf(0, 0), wind: 0.5, place });
    const night = new LifeSim({ ...P.world(), rhythm: P.rhythm }, undefined, env(22, P.place));
    const before = new LifeSim({ ...P.world(), rhythm: P.rhythm }); // (the worker's way before: the sim's own default env)
    expect(active(night, RANGES.peds)).toBeLessThanOrEqual(3);
    expect(active(before, RANGES.peds)).toBeGreaterThan(100);
    // the place not known yet: no crowd until it is, then the place's
    const wait = new LifeSim({ ...P.world(), rhythm: P.rhythm }, undefined, env(12));
    expect(active(wait, RANGES.peds)).toBe(0);
    wait.step(0.05);
    expect(active(wait, RANGES.peds)).toBe(0);
    wait.setEnv({ place: P.place });
    wait.step(0.05);
    const n = active(wait, RANGES.peds);
    expect(n).toBeGreaterThan(10); expect(n).toBeLessThanOrEqual(Math.ceil(want('ped', 'suburb', 12)) + 1);
  });
  it('a road graph rebuilt before the place is known still waits for it, then seeds the crowd at once', () => {
    const P = PLACES.suburb;
    const first = new LifeSim({ ...P.world(), rhythm: P.rhythm }, undefined, { playerX: 0, playerZ: 0, hour: 12, night: 0, density: lifeParams.density * crowdOf(0, 0), wind: 0.5 });
    const next = new LifeSim({ ...P.world(), rhythm: P.rhythm }, first); // (the worker's regraph: new tiles in)
    next.setEnv({ playerX: 0, playerZ: 0, hour: 12, night: 0, density: lifeParams.density * crowdOf(0, 0), wind: 0.5, place: P.place });
    next.step(0.05);
    expect(active(next, RANGES.peds)).toBeGreaterThan(10);
  });
  it('the night preset: a noon crowd thins in seconds, not minutes — and nobody within 100 m vanishes', () => {
    const P = PLACES.main, env = (hour: number) => ({ playerX: 0, playerZ: 0, hour, night: nightAt(hour), density: lifeParams.density * crowdOf(1, 0), wind: 0.5, place: P.place });
    const sim = new LifeSim({ ...P.world(), rhythm: P.rhythm }, undefined, env(15));
    for (let t = 0; t < 40; t++) sim.step(0.05);
    const noon = active(sim, RANGES.peds);
    const near = () => { let n = 0; for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) if (sim.active[i] && Math.hypot(sim.x[i], sim.z[i]) <= 100) n++; return n; };
    const near0 = near();
    sim.setEnv(env(3));
    for (let t = 0; t < 10 * 20; t++) sim.step(0.05); // (10 s)
    const night = active(sim, RANGES.peds), goal = want('ped', 'main', 3);
    expect(noon).toBeGreaterThan(100);
    // what's left is the night's few and those still within 100 m (they walk off before they go)
    expect(night).toBeLessThanOrEqual(Math.ceil(goal) + near0 + 2);
    expect(night).toBeLessThan(noon * 0.35);
  });
});

/** The cars the sim wants on another road, as the place `key` (its land, rhythm and knobs). */
function wantOn(world: LifeInit, key: string, hour: number) {
  const P = PLACES[key];
  const sim = new LifeSim({ ...world, rhythm: P.rhythm });
  const S = sim as unknown as { desired(k: 'ped' | 'car'): number; sizeBubble(): void; tick: number };
  sim.setEnv({ playerX: 0, playerZ: 0, hour, night: nightAt(hour), density: lifeParams.density * crowdOf(P.place.town, P.place.city), wind: 0.5, place: P.place });
  S.sizeBubble();
  let n = 0;
  for (let m = 0; m < 40; m++) { S.tick = m * 60 * SIM_HZ; n += S.desired('car'); }
  return n / 40;
}
