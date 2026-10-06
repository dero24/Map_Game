import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CRITTERS, type CritterKind } from '../src/assets/fauna';
import { animalList, bearing, habitatOf, hourOf, livesAt, standBy, whereToSee } from '../src/ui/seeIt';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { TIER_LIFE, crowdOf, lifeParams } from '../src/sim/life';
import { LifeSim, RHYTHM } from '../src/sim/lifeSim';
import { CrowdLayer, CROWD_TIERS } from '../src/world/crowdLayer';
import { CROWD_STRIDE } from '../src/world/crowd';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';
import type { LifeInit } from '../src/sim/protocol';

// The developer panel's Creatures folder (ui/seeIt.ts): every animal has a place, a month and an hour to
// go and see it; you're stood by its water if it keeps to one; it's made sure to come; and how busy the
// world is, by the kind of place (sim/life.ts lifeParams, crowdOf; lifeSim.ts RHYTHM)
describe('go see it', () => {
  it('every animal has somewhere to go, in a month and at an hour it is there', () => {
    for (const k of CRITTERS) {
      const w = whereToSee(k);
      expect(w, k).not.toBeNull();
      expect(livesAt(k, w!.spot as Parameters<typeof livesAt>[1], w!.month), k).toBe(true);
      expect(w!.hour, k).toBeGreaterThanOrEqual(0);
      expect(w!.hour, k).toBeLessThan(24);
    }
    const list = animalList();
    expect(Object.keys(list).length).toBe(CRITTERS.length);
    expect(new Set(Object.values(list)).size).toBe(CRITTERS.length);
  });
  it("each one's own place where it has one: the sea otters at Monterey, the orcas off San Juan Island in summer, the gray whales in January, the monarchs' winter roost", () => {
    expect(whereToSee('seaotter')!.spot).toBe('monterey');
    expect(whereToSee('orca')).toMatchObject({ spot: 'fridayharbor', month: 7 });
    expect(whereToSee('graywhale')).toMatchObject({ spot: 'monterey', month: 1 });
    expect(whereToSee('monarch')).toMatchObject({ spot: 'pacificgrove', month: 12, hour: 13 });
    expect(whereToSee('dolphin')).toMatchObject({ spot: 'seabright', month: 7 });
  });
  it('what to stand by, and when: the sea for the seals, the dolphins and the schools; fresh water for the beaver, the trout and the turtles; the night for the raccoon, dusk for the deer', () => {
    for (const k of ['dolphin', 'humpback', 'harborseal', 'seaotter', 'shoal', 'mullet', 'fiddlercrab', 'laughinggull'] as CritterKind[]) expect(habitatOf(k), k).toBe('sea');
    for (const k of ['beaver', 'riverotter', 'rainbowtrout', 'paintedturtle', 'alligator', 'mallard', 'greatblueheron', 'crawfish'] as CritterKind[]) expect(habitatOf(k), k).toBe('fresh');
    for (const k of ['squirrel', 'deer', 'cardinal', 'hornedlizard'] as CritterKind[]) expect(habitatOf(k), k).toBe('land');
    expect(hourOf('raccoon', 7)).toBe(22);
    expect(hourOf('deer', 7)).toBeGreaterThan(19);
    expect(hourOf('deer', 1)).toBeLessThan(18);
    expect(hourOf('firefly', 6)).toBeGreaterThan(21);
  });
  it('stood on the beach facing the sea; on a pond\'s bank facing the pond; left be on land', () => {
    const ok = () => true;
    // the sea to the north (z < 0), arriving 300 m inland
    const coast = { sdfAt: (_x: number, z: number) => z, oceanDistAt: (_x: number, z: number) => Math.max(0, z) };
    const b = standBy('sea', 0, 300, coast, ok)!;
    expect(b.z).toBeGreaterThan(1);
    expect(b.z).toBeLessThan(12);
    expect(-Math.cos(b.yaw)).toBeLessThan(-0.9); // (looking north, out to sea)
    // a pond 30 m across, 500 m east
    const pond = { sdfAt: (x: number, z: number) => Math.hypot(x - 500, z) - 30, oceanDistAt: () => 5000 };
    const p = standBy('fresh', 0, 0, pond, ok)!;
    expect(Math.hypot(p.x - 500, p.z) - 30).toBeGreaterThan(1.5);
    expect(Math.hypot(p.x - 500, p.z) - 30).toBeLessThan(8);
    const look = [-Math.sin(p.yaw), -Math.cos(p.yaw)], to = [500 - p.x, -p.z], L = Math.hypot(to[0], to[1]);
    expect((look[0] * to[0] + look[1] * to[1]) / L).toBeGreaterThan(0.9); // (facing the pond)
    expect(standBy('fresh', 0, 0, pond, (x) => x < 400)).toBeNull(); // (nowhere to stand that's allowed)
    expect(standBy('land', 0, 0, pond, ok)).toBeNull();
  });
  it('how far and which way: north is −z', () => {
    expect(bearing(0, 0, 0, -40)).toBe('40 m north');
    expect(bearing(0, 0, 30, 30)).toBe('42 m south-east');
    expect(bearing(0, 0, -2500, 0)).toBe('2.5 km west');
  });
  it("the spotlit animal comes, even where it's rare (a turkey on a settled shore town's lawn), and is found", () => {
    const lawn = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
    const walk = { buildingAt: () => -1, blocked: () => false, deckAt: () => null } as unknown as WalkWorld;
    const env: CritterEnv = { hour: 11, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], place: castOf(regionStyle(40.36, -73.97)), urban: 0.3, settled: 1 };
    const seen = (spot: boolean) => {
      let n = 0;
      for (let p = 0; p < 10; p++) {
        const c = new Critters(lawn, walk), x = p * 400;
        if (spot) c.spotlight = 'wildturkey';
        for (let i = 0; i < 60; i++) c.update(0.05, x, 0, env);
        if (c.nearestOf('wildturkey', x, 0)) n++;
      }
      return n;
    };
    expect(seen(true)).toBeGreaterThanOrEqual(9);
    expect(seen(false)).toBeLessThanOrEqual(2);
  });
});

describe('how busy the world is', () => {
  it("toned down (Robby: \"still too busy … too much\"): all of it at 0.7, the suburbs' and the country's streets thinner than a main street or the towers, a phone at half; the knobs per kind of place", () => {
    expect(lifeParams.density).toBeLessThanOrEqual(0.7);
    expect(lifeParams.animals).toBeLessThanOrEqual(0.5);
    expect(TIER_LIFE.phone).toBeLessThanOrEqual(0.5);
    expect(TIER_LIFE.low).toBeLessThan(TIER_LIFE.phone);
    expect(TIER_LIFE.desktop).toBe(1);
    expect(crowdOf(1, 0)).toBeCloseTo(1); // (a main street: the busiest of the town)
    expect(crowdOf(1, 1)).toBeCloseTo(2.6); // (a Midtown core)
    expect(crowdOf(0, 0)).toBeCloseTo(0.55); // (a quiet street, a country road)
    expect(crowdOf(0.5, 0)).toBeCloseTo(0.775);
    expect(crowdOf(0, 0, { suburbs: 1, towns: 1, cities: 1 })).toBeCloseTo(1);
    expect(crowdOf(1, 1, { suburbs: 1, towns: 1, cities: 0.5 })).toBeCloseTo(1.3);
    expect(crowdOf(1, 0, { suburbs: 1, towns: 2, cities: 1 })).toBeCloseTo(2);
  });
  it("the day's peaks kept and the hours between them quieter (a shore town: the afternoon's beach crowd as before, the morning thinner)", () => {
    const init: LifeInit = {
      seed: 7, bounds: [-50, -50, 450, 450], edgePts: new Float32Array([0, 1.5, 0, 400, 1.5, 0]), edgeStart: new Int32Array([0]), edgeCount: new Int32Array([2]), edgeLen: new Float32Array([400]),
      edgeInfo: new Float32Array([2, 6.5, 0, 1]), edgeNodes: new Int32Array([0, 1]), nodeEdgeStart: new Int32Array([0, 1, 2]), nodeEdges: new Int32Array([0, 0]),
      beachPts: new Float32Array(0), waterGrid: new Uint8Array(4), waterG: [-50, -50, 400, 2, 2], downtown: [0, 0, 400, 400], seaward: [1, 0], doors: new Float32Array(0),
    };
    const want = (hour: number, peak: number) => {
      const was = RHYTHM.peak;
      RHYTHM.peak = peak;
      try {
        const sim = new LifeSim(init);
        sim.setEnv({ playerX: 200, playerZ: 0, hour, night: 0, density: 1, wind: 0.5 });
        return (sim as unknown as { desired(k: 'ped' | 'car'): number }).desired('ped');
      } finally { RHYTHM.peak = was; }
    };
    expect(RHYTHM.peak).toBeGreaterThan(1);
    expect(want(15.5, RHYTHM.peak) / want(15.5, 1)).toBeGreaterThan(0.95); // (the afternoon's peak, near enough as it was)
    expect(want(10, RHYTHM.peak) / want(10, 1)).toBeLessThan(0.85); // (mid-morning, a good deal thinner)
  });
  it("the beach's people: a share of them by the knob — the same ones each time, by where they'd sit", () => {
    const rec: number[] = [];
    for (let k = 0; k < 400; k++) rec.push((k % 20) * 4, 0, Math.floor(k / 20) * 4, 0, 0, 1, 1, 1, 1, 0, 24);
    expect(rec.length).toBe(400 * CROWD_STRIDE);
    const L = new CrowdLayer(CROWD_TIERS.desktop);
    L.add('t', new Float32Array(rec));
    L.update(40, 40, 13, undefined, 1, 1);
    expect(L.drawn.full + L.drawn.lite).toBe(400);
    L.update(40, 40, 13, undefined, 1, 0.5);
    const half = L.drawn.full + L.drawn.lite;
    expect(half).toBeGreaterThan(150);
    expect(half).toBeLessThan(250);
    const M = new CrowdLayer(CROWD_TIERS.desktop);
    M.add('t', new Float32Array(rec));
    M.update(40, 40, 13, undefined, 1, 0.5);
    expect(M.drawn.full + M.drawn.lite).toBe(half); // (deterministic)
    expect(lifeParams.beach).toBeLessThan(1); // (the beach thinned too)
  });
});

describe('fewer animals about', () => {
  const coast = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 30, oceanDistAt: () => 500 } as unknown as Terrain;
  const walk = { buildingAt: () => -1, blocked: () => false, deckAt: () => null } as unknown as WalkWorld;
  const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 11, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [{ x: 5, z: 5 }], gardens: () => [], movers: [], place: castOf(regionStyle(40.36, -73.97)), ...o });
  const GULLS = new Set(['laughinggull', 'herringgull', 'ringbilledgull']);
  const run = (o: Partial<CritterEnv>, amount = 1) => {
    const c = new Critters(coast, walk);
    c.everyone = true;
    c.amount = amount;
    const kinds: string[] = [];
    for (let i = 0; i < 200; i++) { c.update(0.05, 0, 0, env(o)); }
    for (const k of (c as unknown as { list: { kind: string }[] }).list) kinds.push(k.kind);
    return kinds;
  };
  it("a shore town's gulls come down on its parking lots, never in its streets (Robby: six gulls in the road wherever he went)", () => {
    expect(run({ paved: () => true, lot: () => false }).filter((k) => GULLS.has(k)).length).toBe(0);
    expect(run({ paved: () => true, lot: () => true }).filter((k) => GULLS.has(k)).length).toBeGreaterThan(0);
  });
  it("the game's share of each role's animals: half as many at 0.5", () => {
    const all = run({}).length, half = run({}, 0.5).length;
    expect(half).toBeLessThan(all * 0.7);
    expect(half).toBeGreaterThan(0);
  });
});
