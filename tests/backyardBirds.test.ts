import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CRITTERS, CRITTER_TINT, ROLE, GAIT, critterGeometry, faunaMix, flapOf, type CritterKind } from '../src/assets/fauna';
import { P } from '../src/assets/core';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Package #11 (docs/regional-life/models.md build order 11): the backyard birds — each region's own,
// each known at twenty metres by its colour masses, its crest or its bill, the way it moves
const birdsAt = (lat: number, lon: number) => {
  const st = regionStyle(lat, lon);
  return (faunaMix(st.region, st.climate, castOf(st)).songbird ?? []).map(([k]) => k);
};
const BOSTON = [42.36, -71.06], ATLANTA = [33.75, -84.39], CHICAGO = [41.88, -87.63], DALLAS = [32.78, -96.8], MIAMI = [25.76, -80.19];
const SEATTLE = [47.61, -122.33], LA = [34.05, -118.24], DENVER = [39.74, -104.99], SLC = [40.76, -111.89], PORTLAND = [45.52, -122.68];
const PHOENIX = [33.45, -112.07], TUCSON = [32.22, -110.97], ALBUQUERQUE = [35.08, -106.65];
const BIRDS: CritterKind[] = ['cardinal', 'bluejay', 'robin', 'stellersjay', 'gilawoodpecker', 'mourningdove', 'crow', 'pigeon'];
const has = (g: THREE.BufferGeometry, hex: number) => {
  const c = g.getAttribute('color'), t = new THREE.Color(hex);
  for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - t.r) < 0.004 && Math.abs(c.getY(i) - t.g) < 0.004 && Math.abs(c.getZ(i) - t.b) < 0.004) return true;
  return false;
};
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};

describe('the backyard birds', () => {
  it("each region's own: the cardinal and the blue jay east of the Rockies, the Steller's jay in the West's conifers, the Gila woodpecker in the Sonoran only", () => {
    for (const [lat, lon] of [BOSTON, ATLANTA, CHICAGO, DALLAS, MIAMI]) expect(birdsAt(lat, lon), `${lat},${lon}`).toEqual(expect.arrayContaining(['cardinal', 'bluejay', 'mourningdove', 'crow']));
    for (const [lat, lon] of [SEATTLE, LA, DENVER, SLC, PORTLAND, PHOENIX]) {
      expect(birdsAt(lat, lon), `${lat},${lon}`).not.toContain('cardinal');
      expect(birdsAt(lat, lon), `${lat},${lon}`).not.toContain('bluejay');
    }
    for (const [lat, lon] of [SEATTLE, DENVER, PORTLAND, [39.1, -120.03] /* Lake Tahoe */]) expect(birdsAt(lat, lon), `${lat},${lon}`).toContain('stellersjay');
    for (const [lat, lon] of [BOSTON, ATLANTA, CHICAGO, DALLAS, MIAMI, LA, PHOENIX]) expect(birdsAt(lat, lon), `${lat},${lon}`).not.toContain('stellersjay');
    for (const [lat, lon] of [PHOENIX, TUCSON]) expect(birdsAt(lat, lon), `${lat},${lon}`).toContain('gilawoodpecker');
    for (const [lat, lon] of [ALBUQUERQUE, LA, DALLAS, DENVER]) expect(birdsAt(lat, lon), `${lat},${lon}`).not.toContain('gilawoodpecker');
    // the robin on the lawns from Boston to Seattle; the crow and the pigeon nearly everywhere
    for (const [lat, lon] of [BOSTON, CHICAGO, SEATTLE, DENVER, LA, SLC]) expect(birdsAt(lat, lon), `${lat},${lon}`).toContain('robin');
    for (const [lat, lon] of [BOSTON, MIAMI, SEATTLE, LA, PHOENIX, DENVER]) expect(birdsAt(lat, lon), `${lat},${lon}`).toContain('pigeon');
    for (const k of BIRDS) expect(ROLE[k]).toBe('songbird');
  });
  it('each known by its marks: the cardinal\'s crest and black mask, the jay\'s necklace, the robin\'s breast, the woodpecker\'s barring, the pigeon\'s green neck', () => {
    const g = Object.fromEntries(BIRDS.map((k) => [k, critterGeometry(k)])) as Record<CritterKind, THREE.BufferGeometry>;
    expect(has(g.cardinal, 0x1a1414)).toBe(true); // the mask
    expect(has(g.cardinal, 0xe0603a)).toBe(true); // the orange-red bill
    expect(box(g.cardinal, P.skull).max.y).toBeGreaterThan(box(g.songbird ?? critterGeometry('songbird'), P.skull).max.y * 1.3 * 1.15); // (the crest, over a bigger songbird's head)
    expect(has(g.bluejay, 0x1a1a22)).toBe(true); // the necklace
    expect(has(g.bluejay, 0xf4f4f2)).toBe(true); // the white wing bar
    expect(has(g.robin, 0xc4602c) && has(g.robin, 0x2c2826)).toBe(true); // the brick breast, the dark head
    expect(has(g.stellersjay, 0x1c1f28)).toBe(true); // the sooty hood and crest
    expect(has(g.gilawoodpecker, 0x1c1c1e)).toBe(true); // the barring
    expect(has(g.pigeon, 0x5a8a74)).toBe(true); // the green neck
    expect(has(g.mourningdove, 0xeeeae2)).toBe(true); // the white tail corners
    // the TINT parts painted per bird: the cardinal's red or the female's tan, the pigeon's own grey, the woodpecker's cap
    for (const k of ['cardinal', 'pigeon', 'gilawoodpecker'] as CritterKind[]) expect(has(g[k], 0xffffff), k).toBe(true);
    expect(new THREE.Color(CRITTER_TINT.cardinal).r).toBeGreaterThan(0.5); // (the Almanac's card: a red cardinal)
    // a crow black all over
    const c = g.crow.getAttribute('color');
    for (let i = 0; i < c.count; i++) expect(c.getX(i) + c.getY(i) + c.getZ(i)).toBeLessThan(0.1);
    // the sizes: the crow the biggest, then the pigeon and the dove, the robin, the cardinal
    const L = (k: CritterKind) => { const b = box(g[k]); return b.max.z - b.min.z; };
    expect(L('crow')).toBeGreaterThan(L('pigeon'));
    expect(L('pigeon')).toBeGreaterThan(L('robin'));
    expect(L('mourningdove')).toBeGreaterThan(L('robin')); // (the long tail)
    expect(L('robin')).toBeGreaterThan(L('cardinal'));
  });
  it('the bird plan for all: a fan of a tail (the hawk\'s red one spread), a leg each side to walk or hop, the head on its neck', () => {
    for (const k of CRITTERS.filter((k) => ROLE[k] === 'songbird' || ROLE[k] === 'shorebird' || k === 'hawk')) {
      const g = critterGeometry(k);
      expect(box(g, P.fore).isEmpty(), k).toBe(false);
      expect(box(g, P.hind).isEmpty(), k).toBe(false);
      const t = box(g, P.tail);
      expect(t.max.x - t.min.x, k).toBeGreaterThan(0.025); // (a fan, not a sliver)
    }
    const hawkTail = box(critterGeometry('hawk'), P.tail);
    expect(hawkTail.max.x - hawkTail.min.x).toBeGreaterThan(0.2);
  });
  it('how each moves: the robin, the dove, the crow and the pigeon walk; the cardinal, the jays and the woodpecker hop; every bird pecks down; the crow rows slowly, the pigeon claps', () => {
    for (const k of ['robin', 'mourningdove', 'crow', 'pigeon'] as CritterKind[]) expect(GAIT[k][0], k).toBeCloseTo(Math.PI, 1);
    for (const k of ['cardinal', 'bluejay', 'stellersjay', 'gilawoodpecker', 'songbird'] as CritterKind[]) expect(GAIT[k][0], k).toBe(0);
    for (const k of CRITTERS.filter((k) => ROLE[k] === 'songbird' || ROLE[k] === 'shorebird')) expect(GAIT[k][3], k).toBeLessThan(0);
    for (const k of ['deer', 'rabbit', 'fox'] as CritterKind[]) expect(GAIT[k][3], k).toBeGreaterThan(0); // (a grazer's head comes up)
    expect(flapOf('crow')).toBeLessThan(flapOf('pigeon'));
    expect(flapOf('pigeon')).toBeLessThan(flapOf('songbird'));
    expect(flapOf('hawk')).toBeLessThan(flapOf('crow'));
  });
  it("the town's pigeons: on the plaza downtown, few in the country", () => {
    const terrain = { heightAt: () => 0, sdfAt: () => 20, coverAt: () => 30, oceanDistAt: () => 500 } as unknown as Terrain;
    const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
    const place = castOf(regionStyle(40.75, -73.99));
    const env = (o: Partial<CritterEnv>): CritterEnv => ({ hour: 8, night: 0, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], place, ...o });
    const tally = (e: CritterEnv) => {
      const c = new Critters(terrain, walk), n: Record<string, number> = {};
      const list = (c as unknown as { list: { kind: string }[] }).list;
      for (let t = 0; t < 3000; t++) {
        c.update(0.05, 0, 0, e);
        if (t % 40 === 0) { for (const o of list) n[o.kind] = (n[o.kind] ?? 0) + 1; list.length = 0; } // (sample, then clear for fresh spawns)
      }
      return n;
    };
    // downtown, all paved: only the pigeons come down (the others want grass)
    const town = tally(env({ urban: 1, paved: () => true }));
    expect(town.pigeon ?? 0).toBeGreaterThan(5);
    for (const k of BIRDS.filter((k) => k !== 'pigeon')) expect(town[k] ?? 0, k).toBe(0);
    // the country's lawns: robins and the rest, a pigeon now and then
    const country = tally(env({ urban: 0 }));
    const total = Object.values(country).reduce((a, b) => a + b, 0);
    expect((country.pigeon ?? 0) / total).toBeLessThan(0.06);
    expect(country.robin ?? 0).toBeGreaterThan(country.pigeon ?? 0);
    expect(new Set(Object.keys(country)).size).toBeGreaterThan(4);
  });
});
