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
});
