import { describe, it, expect } from 'vitest';
import { classify, measureHoods, hoodLookup } from '../src/world/hood';
import { recipeFor, SIDING, ROOFMAT } from '../src/world/recipe';
import { regionStyle } from '../src/world/styles';
import type { Building } from '../src/world/data';

// A square house of `area` m² at (x, z), in the tile format (0.1 m ints).
const house = (x: number, z: number, area: number, s: number, extra: Partial<Building> = {}): Building => {
  const hw = Math.sqrt(area) / 2, q = (v: number) => Math.round(v * 10);
  return { r: [q(x - hw), q(z - hw), q(x + hw), q(z - hw), q(x + hw), q(z + hw), q(x - hw), q(z + hw)], h: 8, k: 'house', roof: 'gable', s, ...extra };
};
// a street of houses laid out in a 256 m cell (x0, z0 its corner): `cols` × `rows`, `gap` apart
const street = (x0: number, z0: number, cols: number, rows: number, gap: number, area: (i: number) => number, seed = 1) => {
  const out: Building[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push(house(x0 + 20 + i * gap, z0 + 20 + j * gap, area(i + j * cols), seed * 1000 + i + j * cols));
  return out;
};
const jitter = (k: number) => ((k * 2654435761) % 1000) / 1000;

describe('neighbourhood morphology (hood.ts)', () => {
  it('tells estate country, an old grid and a tract apart, and leaves the rest alone', () => {
    const estate = street(0, 0, 4, 4, 55, (k) => 280 + jitter(k) * 250); // big houses on acre lots
    const grid = street(256, 0, 12, 12, 14, (k) => 70 + jitter(k) * 90); // small houses close on a grid
    const tract = street(512, 0, 9, 9, 24, (k) => 110 + jitter(k) * 12); // alike houses, even spacing
    const mixed = street(768, 0, 7, 7, 30, (k) => 90 + jitter(k) * 260); // everything else
    const cells = measureHoods([...estate, ...grid, ...tract, ...mixed]);
    const at = hoodLookup(cells);
    expect(at(50, 50)).toBe('estate');
    expect(at(300, 50)).toBe('grid');
    expect(at(560, 50)).toBe('tract');
    expect(at(820, 50)).toBe('suburb');
    expect(at(5000, 5000)).toBe('suburb'); // (nothing measured: the region's own mix)
    expect(cells.get('0,0')!.spacing).toBeCloseTo(55, 0);
  });

  it('counts only measured homes: guesses, sheds, neighbours\' houses and a lone house say nothing', () => {
    const fills = street(0, 0, 9, 9, 24, () => 120).map((b) => ({ ...b, gen: 'fill' as const }));
    expect(measureHoods(fills).size).toBe(0);
    const ctx = street(0, 0, 9, 9, 24, () => 120).map((b) => ({ ...b, own: 0 }));
    expect(measureHoods(ctx).size).toBe(0);
    expect(classify({ n: 2, area: 500, spacing: 80, cv: 0.1 })).toBe('suburb');
    // an estate's big footprint the map calls 'large' is still a home
    const big = street(0, 0, 4, 4, 55, () => 760).map((b) => ({ ...b, k: 'large' as const }));
    expect(hoodLookup(measureHoods(big))(50, 50)).toBe('estate');
  });

  it('the suburb (neutral) path is today\'s recipe exactly', () => {
    const st = regionStyle(40.36, -74.04);
    for (let s = 1; s < 200; s++) {
      const b = house(0, 0, 150, s * 7919);
      expect(recipeFor(b, st, 'suburb')).toEqual(recipeFor(b, st));
    }
  });

  it('estates, grids and tracts each get their own look; the map\'s colours still win', () => {
    const st = regionStyle(40.36, -74.04); // (the NJ shore's style: one table for all its towns)
    const N = 400, homes = Array.from({ length: N }, (_, i) => house(0, 0, 320, (i + 1) * 2654435761));
    const share = (hood: 'estate' | 'grid' | 'tract' | 'suburb', f: (r: ReturnType<typeof recipeFor>) => boolean) => homes.filter((b) => f(recipeFor(b, st, hood, 42))).length / N;
    // estates: shingle, slate and shake, steep roofs, two chimneys
    expect(share('estate', (r) => r.siding === SIDING.shingle)).toBeGreaterThan(share('suburb', (r) => r.siding === SIDING.shingle) + 0.1);
    expect(share('estate', (r) => r.roofMat === ROOFMAT.slate || r.roofMat === ROOFMAT.shake)).toBeGreaterThan(0.35);
    expect(share('estate', (r) => r.pitch >= 0.72)).toBe(1);
    expect(share('estate', (r) => r.chimney === 2)).toBeGreaterThan(0.45);
    // old grids: bays and steep roofs
    expect(share('grid', (r) => r.bay)).toBeGreaterThan(0.4);
    expect(share('grid', (r) => r.pitch >= 0.85)).toBe(1);
    // a tract: one model through the cell (same pitch and dormers for all), paint varies
    const tr = homes.map((b) => recipeFor(b, st, 'tract', 42));
    expect(new Set(tr.map((r) => r.pitch)).size).toBe(1);
    expect(new Set(tr.map((r) => r.dormers)).size).toBe(1);
    expect(new Set(tr.map((r) => r.facade)).size).toBeGreaterThan(3);
    // the old grid is regional: Chicago's bungalow belt is brick under low hips, Seattle's craftsman
    // shingle under low gables; a desert tract is stucco under tile
    const chi = regionStyle(41.955, -87.764), sea = regionStyle(47.66, -122.337), az = regionStyle(33.35, -111.755);
    const shareIn = (st2: typeof st, hood: 'grid' | 'tract', f: (r: ReturnType<typeof recipeFor>) => boolean) => homes.filter((b) => f(recipeFor(b, st2, hood, 42))).length / N;
    expect(shareIn(chi, 'grid', (r) => r.siding === SIDING.brick)).toBeGreaterThan(0.6);
    expect(shareIn(chi, 'grid', (r) => r.pitch <= 0.6)).toBe(1);
    expect(shareIn(sea, 'grid', (r) => r.siding === SIDING.shingle || r.siding === SIDING.clapboard)).toBeGreaterThan(0.8);
    expect(shareIn(sea, 'grid', (r) => r.siding === SIDING.brick)).toBeLessThan(0.2);
    expect(shareIn(az, 'tract', (r) => r.siding === SIDING.stucco && r.roofMat === ROOFMAT.tile)).toBe(1);
    expect(share('grid', (r) => r.siding === SIDING.brick)).toBeLessThan(shareIn(chi, 'grid', (r) => r.siding === SIDING.brick) - 0.4);
    // mapped colour and material win
    const mapped = house(0, 0, 320, 99, { fc: 0x123456, ma: 'brick' });
    expect(recipeFor(mapped, st, 'estate').facade).toBe(0x123456);
  });
});

// Real places: the class most of a place's measured homes take must be the one the place is known
// for — the check that neighbourhoods read as themselves, over many places, without a browser. The
// shore's own towns come from the baked pack (in the repo); the rest of the country from frozen
// real-lite tiles (tools/hood-fixtures.mjs: the tile a visitor streams there).
type Json = { buildings?: Building[] } & Record<string, unknown>;
const baked = import.meta.glob<Json>('../public/data/shore/tiles/*.json', { eager: true, import: 'default' });
const fixtureFiles = import.meta.glob<Json>('./fixtures/hoods/*.json', { eager: true, import: 'default' });
import world from '../public/data/shore/world.json';
const shares = (cells: Map<string, { n: number; klass: string }>, keep: (k: string) => boolean = () => true) => {
  const count: Record<string, number> = {};
  for (const [k, c] of cells) if (c.n >= 4 && keep(k)) count[c.klass] = (count[c.klass] ?? 0) + c.n; // (weighted by homes)
  const total = Object.values(count).reduce((s, v) => s + v, 0);
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { count, total, top };
};

describe('the shore\'s towns read as themselves (baked pack)', () => {
  const o = (world as unknown as { origin: { lat: number; lon: number } }).origin, kx = 111320 * Math.cos((o.lat * Math.PI) / 180);
  const all: Building[] = [];
  for (const t of Object.values(baked)) all.push(...(t.buildings ?? []));
  const cells = measureHoods(all);
  // the 5×5 cells (1.3 km) round a point
  const round = (lat: number, lon: number) => {
    const cx = Math.floor(((lon - o.lon) * kx) / 256), cz = Math.floor((-(lat - o.lat) * 111320) / 256);
    return shares(cells, (k) => { const [i, j] = k.split(',').map(Number); return Math.abs(i - cx) <= 2 && Math.abs(j - cz) <= 2; });
  };
  it.each([
    ['Rumson (Rumson Rd west)', 40.3635, -74.02, 'estate'],
    ['Fair Haven', 40.3605, -74.0385, 'grid'],
    ['Red Bank (east side)', 40.3478, -74.0636, 'grid'],
    ['Monmouth Beach', 40.3304, -73.9818, 'suburb'],
  ] as const)('%s', (_, lat, lon, want) => {
    const s = round(lat, lon);
    expect(s.total).toBeGreaterThan(80);
    expect(s.top, JSON.stringify(s.count)).toBe(want);
  });
  it('Rumson is told apart from its neighbours', () => {
    const est = (lat: number, lon: number) => { const s = round(lat, lon); return (s.count.estate ?? 0) / s.total; };
    expect(est(40.3635, -74.02)).toBeGreaterThan(0.35);
    for (const [lat, lon] of [[40.3605, -74.0385], [40.3478, -74.0636], [40.3304, -73.9818]]) expect(est(lat, lon)).toBeLessThan(0.05);
  });
});

const fixtures = Object.values(fixtureFiles).map((f) => f as { id: string; place: string; expect: string; buildings: Building[] });
describe('the country\'s neighbourhoods read as themselves (real-lite fixtures)', () => {
  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_, f) => {
    const s = shares(measureHoods(f.buildings));
    if (s.total < 40) return; // (too thinly mapped to say anything: the game stays neutral there)
    expect(s.top, `${f.place}: ${JSON.stringify(s.count)}`).toBe(f.expect);
  });
});
