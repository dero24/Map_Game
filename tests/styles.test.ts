import { describe, it, expect } from 'vitest';
import { regionStyle, styleByKey, styleFor, climateAt, pickWeighted } from '../src/world/styles';
import { recipeFor, SIDING } from '../src/world/recipe';
import type { Building } from '../src/world/data';

describe('regionStyle (Phase I)', () => {
  it('keeps the NJ shore on the original clapboard look', () => {
    const s = regionStyle(40.362, -73.9755);
    expect(s.climate).toBe('temperate');
    expect(s.family).toBe('clapboard');
    expect(s.driveLeft).toBe(false);
    expect(s.facadeHouse[0]).toBe(0xf2eee4); // the pre-Phase-I shore palette, unchanged
    expect(s.windowCode).toBe(0);
  });
  it('gives visibly different places different looks', () => {
    const oslo = regionStyle(59.91, 10.75), windhoek = regionStyle(-22.56, 17.08), london = regionStyle(51.5, -0.12);
    const sydney = regionStyle(-33.87, 151.21), tokyo = regionStyle(35.68, 139.69), cairo = regionStyle(30.04, 31.24);
    expect(oslo.family).toBe('nordic');
    expect(windhoek.climate).toBe('arid');
    expect(windhoek.family).toBe('adobe');
    expect(london.family).toBe('brick');
    expect(london.driveLeft).toBe(true);
    expect(sydney.driveLeft).toBe(true);
    expect(tokyo.driveLeft).toBe(true);
    expect(tokyo.family).toBe('eastasian');
    expect(cairo.climate).toBe('arid');
    expect(regionStyle(41.9, 12.5).climate).toBe('mediterranean'); // Rome
    expect(regionStyle(1.35, 103.82).climate).toBe('tropical'); // Singapore
    expect(climateAt(64.8, -147.7)).toBe('boreal'); // Fairbanks
    expect(climateAt(72, -40)).toBe('polar'); // Greenland
  });
  it('round-trips through meta.style keys and falls back to the origin', () => {
    const s = regionStyle(59.91, 10.75);
    expect(styleByKey(s.key)).toEqual(s);
    expect(styleByKey('nonsense')).toBeNull();
    expect(styleFor({ style: s.key }, { lat: 40, lon: -74 }).key).toBe(s.key);
    expect(styleFor({ style: 'bad/key' }, { lat: 40.362, lon: -73.9755 }).family).toBe('clapboard');
  });
  it('pickWeighted is a deterministic weighted choice', () => {
    expect(pickWeighted([1, 0, 0], 0.99)).toBe(0);
    expect(pickWeighted([0, 0, 1], 0.0)).toBe(2);
    expect(pickWeighted([1, 1], 0.49)).toBe(0);
    expect(pickWeighted([1, 1], 0.51)).toBe(1);
  });
});

describe('recipeFor', () => {
  const bd = (s: number, extra: Partial<Building> = {}): Building => ({ r: [], h: 8, k: 'house', roof: 'gable', s, ...extra });
  const nj = regionStyle(40.362, -73.9755);
  it('is a pure function of the seed + style', () => {
    for (let s = 1; s < 200; s += 17) expect(recipeFor(bd(s * 7919), nj)).toEqual(recipeFor(bd(s * 7919), nj));
  });
  it('lets real data win: a mapped brick-red facade gets brick siding and keeps its colour', () => {
    const r = recipeFor(bd(12345, { fc: 0x9c5a44 }), nj);
    expect(r.facade).toBe(0x9c5a44);
    expect(r.siding).toBe(SIDING.brick);
  });
  it('varies across a street and follows regional habits', () => {
    const sidings = new Set<number>(), dorm = [0, 0];
    for (let s = 0; s < 400; s++) {
      const r = recipeFor(bd(s * 2654435761), nj);
      sidings.add(r.siding);
      dorm[r.dormers ? 1 : 0]++;
      expect(r.pitch).toBeGreaterThan(0.45);
    }
    expect(sidings.size).toBeGreaterThanOrEqual(3);
    expect(dorm[1]).toBeGreaterThan(40); // some, not all, houses carry dormers
    expect(dorm[0]).toBeGreaterThan(200);
    const med = regionStyle(41.9, 12.5);
    let stucco = 0;
    for (let s = 0; s < 100; s++) if (recipeFor(bd(s * 2654435761, { fc: undefined }), med).siding === SIDING.stucco) stucco++;
    expect(stucco).toBeGreaterThan(70);
  });
  it('North American houses wear their subregion: brick ranches down South, clapboard up North', () => {
    const atl = regionStyle(33.75, -84.39), bos = regionStyle(42.36, -71.06), sea = regionStyle(47.61, -122.33);
    expect(atl.sub).toBe('south');
    expect(bos.sub).toBe('northeast');
    expect(sea.sub).toBe('pnw');
    const brick = (st: typeof atl) => { let n = 0; for (let s = 0; s < 400; s++) if (recipeFor(bd(s * 2654435761), st).siding === SIDING.brick) n++; return n / 400; };
    expect(brick(atl)).toBeGreaterThan(0.4);
    expect(brick(bos)).toBeLessThan(0.1);
  });
  it('towers are glass or masonry, never clapboard; old ones never glass; mapped glass is glass', () => {
    const nyc = regionStyle(40.758, -73.9855);
    const wood: number[] = [SIDING.clapboard, SIDING.shingle, SIDING.batten];
    let glass = 0;
    for (let s = 0; s < 300; s++) {
      const r = recipeFor(bd(s * 2654435761, { k: 'commercial', roof: 'flat', h: 220 }), nyc);
      expect(wood.includes(r.siding)).toBe(false);
      if (r.siding === SIDING.glass) glass++;
      expect(recipeFor(bd(s * 2654435761, { k: 'large', roof: 'flat', h: 120, yr: 1928 }), nyc).siding).not.toBe(SIDING.glass);
    }
    expect(glass).toBeGreaterThan(150); // most supertall towers are curtain walls…
    expect(glass).toBeLessThan(280); // …not all
    expect(recipeFor(bd(7, { k: 'large', roof: 'flat', h: 30, ma: 'glass' }), nyc).siding).toBe(SIDING.glass);
    // a tower's parts share its seed and resolve to one facade (podium masonry may differ from the glass shaft)
    const tier = recipeFor(bd(99, { k: 'commercial', roof: 'flat', h: 140, lf: 60, pt: 1 }), nyc);
    expect(tier).toEqual(recipeFor(bd(99, { k: 'commercial', roof: 'flat', h: 140, lf: 60, pt: 1 }), nyc));
  });
});

import { signName } from '../src/world/signs';
describe('street-name blades', () => {
  it('abbreviates like the real signs', () => {
    expect(signName('North Ocean Avenue')).toBe('N Ocean Ave');
    expect(signName('Peninsula Avenue')).toBe('Peninsula Ave');
    expect(signName('Avenue of Two Rivers')).toBe('Avenue of Two Rivers');
    expect(signName('Saint Johns Boulevard')).toBe('St Johns Blvd');
    expect(signName('Rumson Road (County Route 520)')).toBe('Rumson Rd');
  });
  it('the Pacific Northwest is conifer country, lush; its climate twin in the East is not', () => {
    const pnw = regionStyle(47.6284, -122.3567), ne = regionStyle(40.36, -73.97);
    expect(pnw.sub).toBe('pnw');
    expect(pnw.trees[4] + pnw.trees[3]).toBeGreaterThan(pnw.trees[0] + pnw.trees[1]); // fir and cedar over broadleaf
    expect(ne.trees[4] + ne.trees[3]).toBeLessThan(ne.trees[0] + ne.trees[1]);
    expect(pnw.biome[1]).toBeGreaterThan(0); // lush
  });
});
