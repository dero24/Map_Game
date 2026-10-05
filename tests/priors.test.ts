import { describe, it, expect, beforeAll } from 'vitest';
import { makeProjector, osmToTile, plausibleHeight, type OsmElement } from '../src/world/realTile';
import { housePriors, hoodHeight, guessedHouse } from '../src/world/priors';
import { tractCape } from '../src/world/recipe';
import { enrichTile, initLidar, type Rec } from '../src/world/lidar';
import type { Building, TileJson } from '../src/world/data';
import type { HoodClass } from '../src/world/hood';

// Storeys as the builder counts them on flat ground (buildings.ts: the wall top is base + 0.3 + h,
// the ground floor ~0.5 m up; storeys first, at least a metre of roof): what a height looks like.
const storeys = (h: number) => Math.max(1, Math.floor((h + 0.3 - 0.5 - 1) / 2.9));
const NE = { region: 'na', sub: 'northeast', family: 'clapboard' } as const;
const house = (x: number, z: number, w: number, d: number, extra: Partial<Building> = {}): Building =>
  ({ r: [x * 10, z * 10, (x + w) * 10, z * 10, (x + w) * 10, (z + d) * 10, x * 10, (z + d) * 10], h: 4.6, k: 'house', roof: 'hip', s: (x * 7919 + z * 104729) >>> 0, ...extra }) as Building;

describe('priors: the map\'s own numbers first', () => {
  const ORIGIN = { lat: 40.362, lon: -73.9755 }, P = makeProjector(ORIGIN);
  const way = (id: number, tags: Record<string, string>, x: number, z: number): OsmElement => ({
    type: 'way', id, tags,
    geometry: [[x, z], [x + 12, z], [x + 12, z + 10], [x, z + 10], [x, z]].map(([px, pz]) => { const [lat, lon] = P.unproject(px, pz); return { lat, lon }; }),
  });
  const tile = osmToTile({ elements: [
    way(1, { building: 'house', 'building:levels': '2', 'roof:levels': '1' }, 100, 100),
    way(2, { building: 'house', 'building:levels': '2' }, 200, 100),
    way(3, { building: 'house', height: '7' }, 300, 100),
    way(4, { building: 'house' }, 400, 100),
  ] }, { id: '0_0', box: { x0: 0, z0: 0, x1: 1024, z1: 1024 }, origin: ORIGIN });
  const at = (x: number) => tile.buildings.find((b) => Math.abs(b.r[0] / 10 - x) < 1)!;
  it('roof:levels stand on building:levels: a storey in the roof is ~2.6 m more of it', () => {
    expect(at(100).fl).toBe(2);
    expect(at(100).rl).toBe(1);
    expect(at(100).h).toBeCloseTo(at(200).h + 2.6, 1);
    expect(plausibleHeight(NaN, 2, 120, false, 1)).toBeCloseTo(2 * 3.1 + 1.5 + 2.6, 5);
    expect(plausibleHeight(NaN, 2, 120)).toBeCloseTo(2 * 3.1 + 1.5, 5); // (no roof levels: as before)
  });
  it('a mapped height, levels or roof levels are never a guess; an untagged house is', () => {
    expect(at(300).h).toBe(7);
    expect(at(300).hq).toBe(1);
    expect([100, 200, 300].map((x) => guessedHouse(at(x)))).toEqual([false, false, false]);
    expect(guessedHouse(at(400))).toBe(true);
    expect(guessedHouse({ ...at(400), ms: 1 })).toBe(false);
  });
});

describe('priors: a guessed house stands as tall as the measured houses round it', () => {
  // a street in one 256 m cell: six measured two-storey houses and six guessed ones at 4.6 m (the
  // ML estimates a baked pack carries), and one tagged, one measured low
  const street = () => {
    const b: Building[] = [];
    for (let i = 0; i < 6; i++) b.push(house(10 + i * 20, 10, 11, 9, { h: 8.6 + i * 0.3, ms: 1 }));
    for (let i = 0; i < 6; i++) b.push(house(10 + i * 20, 40, 11, 9));
    b.push(house(10, 70, 11, 9, { h: 5.2, hq: 1 }), house(30, 70, 6, 5, { h: 4.1, ms: 1, roof: 'flat' })); // (a shed-sized one: out of their band)
    return b;
  };
  const suburb = () => 'suburb' as HoodClass;
  it('borrows a measured neighbour\'s height (no blanket one-storey houses among two-storey ones)', () => {
    const b = street();
    const measured = new Set(b.filter((x) => x.ms).map((x) => +x.h.toFixed(1)));
    expect(housePriors(b, suburb, NE)).toBe(6);
    for (const g of b.slice(6, 12)) expect(measured.has(g.h)).toBe(true);
    expect(b.slice(6, 12).filter((g) => storeys(g.h) >= 2).length).toBeGreaterThanOrEqual(5);
    // what was measured or mapped stands as it was
    expect(b[12].h).toBe(5.2);
    expect(b[13].h).toBe(4.1);
    expect(b.slice(0, 6).map((x) => +x.h.toFixed(1))).toEqual([8.6, 8.9, 9.2, 9.5, 9.8, 10.1]);
  });
  it('is deterministic: the same heights whatever order the map listed the houses in, and run again', () => {
    const a = street(), b = street().reverse();
    housePriors(a, suburb, NE);
    housePriors(b, suburb, NE);
    const key = (x: Building) => `${x.r[0]},${x.r[1]}:${x.h}`;
    expect(a.map(key).sort()).toEqual(b.map(key).sort());
    const again = a.map((x) => x.h);
    housePriors(a, suburb, NE);
    expect(a.map((x) => x.h)).toEqual(again);
  });
  it('borrows only from houses of about its size', () => {
    const b: Building[] = [];
    for (let i = 0; i < 4; i++) b.push(house(10 + i * 30, 10, 26, 20, { h: 11, ms: 1 })); // big houses
    for (let i = 0; i < 4; i++) b.push(house(10 + i * 30, 40, 9, 8, { h: 5.4, ms: 1 })); // cottages
    const g = house(10, 70, 9, 8);
    b.push(g);
    housePriors(b, suburb, NE);
    expect(g.h).toBe(5.4);
  });
});

describe('priors: where nothing round it is measured, its neighbourhood\'s storeys', () => {
  const lone = (hood: HoodClass, st: Parameters<typeof hoodHeight>[1] = NE) => {
    const b = [house(40, 40, 11, 9)];
    housePriors(b, () => hood, st);
    return b[0].h;
  };
  it('estates and old grids stand two storeys and more; a suburb keeps its own mix', () => {
    for (let s = 0; s < 40; s++) {
      expect(storeys(hoodHeight('estate', NE, s / 40, 0)!)).toBeGreaterThanOrEqual(2);
      expect(storeys(hoodHeight('grid', NE, s / 40, 0)!)).toBeGreaterThanOrEqual(2);
    }
    expect(storeys(lone('estate'))).toBeGreaterThanOrEqual(2);
    expect(lone('suburb')).toBe(4.6); // (the neutral path: nothing changes)
    expect(lone('estate', { region: 'eu', sub: '', family: 'clapboard' })).toBe(4.6); // (the archetypes are North American)
  });
  it('a tract stands its cell\'s one model as the recipe draws it: a cape a storey and a half, a ranch one', () => {
    let capes = 0, ranches = 0;
    for (let c = 0; c < 64; c++) {
      const h = hoodHeight('tract', NE, 0.5, c * 7919)!;
      if (tractCape(c * 7919)) (capes++, expect(h).toBeGreaterThanOrEqual(7.2));
      else (ranches++, expect(storeys(h)).toBe(1));
    }
    expect(capes).toBeGreaterThan(10);
    expect(ranches).toBeGreaterThan(10);
    expect(storeys(hoodHeight('tract', { region: 'na', sub: 'southwest', family: 'stucco' }, 0.9, 0)!)).toBe(1);
  });
});

// The shore: half its houses have no usable survey fit and carry Microsoft's ML heights (4–6 m,
// a median 1.3 m under the survey). With the sidecar applied, the unmeasured ones should stand as
// their measured neighbours do — not a street of two-storey houses with every other one a bungalow.
describe('priors: Monmouth Beach with its sidecar', () => {
  type ReadFile = (p: URL, enc: 'utf8') => string;
  let read: ReadFile;
  const R = new URL('../public/data/shore/', import.meta.url);
  beforeAll(async () => {
    read = ((await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync: ReadFile }).readFileSync;
  });
  it('unmeasured houses take their measured neighbours\' storeys', async () => {
    const man = JSON.parse(read(new URL('manifest.json', R), 'utf8')) as { origin: { lat: number; lon: number }; tiles: { id: string; file: string; box: TileJson['box'] }[] };
    initLidar(man.origin, false); // (a phone: the sidecar only)
    const share = (hs: number[]) => hs.filter((h) => storeys(h) >= 2).length / Math.max(1, hs.length);
    const before: number[] = [], after: number[] = [], measured: number[] = [];
    for (const id of ['-1_2', '-1_3', '0_2']) {
      const t = man.tiles.find((x) => x.id === id)!;
      const tj = JSON.parse(read(new URL(t.file, R), 'utf8')) as TileJson;
      const rec = (JSON.parse(read(new URL(`measured/${id}.json`, R), 'utf8')) as { rec: Rec }).rec;
      expect(await enrichTile(tj, t.box, null, true, () => Promise.resolve(rec))).toBe('done');
      const homes = tj.buildings.filter((b) => b.k === 'house' && b.own !== 0 && !b.gen);
      const guessed = homes.filter(guessedHouse);
      before.push(...guessed.map((b) => b.h));
      measured.push(...homes.filter((b) => b.ms).map((b) => b.h));
      housePriors(tj.buildings, () => 'suburb', NE);
      after.push(...guessed.map((b) => b.h));
    }
    // (2026-10-03: 550 guessed, 308 measured; two storeys and up — guessed 9% → 49%, measured 41%)
    expect(before.length).toBeGreaterThan(300);
    // before: the guessed houses well under their measured neighbours (ML heights)
    expect(share(before)).toBeLessThan(share(measured) - 0.15);
    // after: the guessed ones in the measured mix (within ten points)
    expect(Math.abs(share(after) - share(measured))).toBeLessThan(0.1);
  });
});
