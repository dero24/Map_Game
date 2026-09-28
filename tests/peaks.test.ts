import { describe, it, expect } from 'vitest';
import { peaksInTile, sightsFrom, compassWord, coverInTile, coverIndex } from '../src/world/peaks';
import { viewBearing } from '../src/world/realTile';

const rainier = { name: 'Mount Rainier', ele: 4392, lat: 46.8529, lon: -121.7604 };
const baker = { name: 'Mount Baker', ele: 3286, lat: 48.7768, lon: -121.8145 };
const hill = { name: 'Tiger Mountain', ele: 922, lat: 47.4876, lon: -121.9412 };

describe('the peaks a viewpoint looks at', () => {
  it('reads named summits out of a vector tile at their place', async () => {
    const { encodeTile } = await import('./helpers/mvtEncode');
    // the z8 tile holding Rainier, the summit at its own position in tile units
    const z = 8, Z = 2 ** z, X = ((rainier.lon + 180) / 360) * Z, r = (rainier.lat * Math.PI) / 180, Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Z;
    const x = Math.floor(X), y = Math.floor(Y), px = Math.round((X - x) * 4096), py = Math.round((Y - y) * 4096);
    const t = encodeTile([{ name: 'mountain_peak', features: [{ type: 1, tags: { name: 'Mount Rainier', ele: 4392, class: 'volcano' }, geom: [[[px, py]]] }, { type: 1, tags: { ele: 100 }, geom: [[[10, 10]]] }] }]);
    const [p] = peaksInTile(t, x, y, z);
    expect(p.name).toBe('Mount Rainier');
    expect(p.ele).toBe(4392);
    expect(p.lat).toBeCloseTo(rainier.lat, 2);
    expect(p.lon).toBeCloseTo(rainier.lon, 2);
    expect(peaksInTile(t, x, y, z).length).toBe(1); // (an unnamed bump is not a sight)
  });
  it('from Kerry Park: Rainier to the southeast, ~97 km, the tallest-looking thing there is', () => {
    const [s] = sightsFrom([hill, baker, rainier], 47.6295, -122.3599, 90);
    expect(s.name).toBe('Mount Rainier');
    expect(s.km).toBeGreaterThan(90);
    expect(s.km).toBeLessThan(100);
    expect(compassWord(s.bearing)).toBe('southeast');
    // a viewpoint that looks north sees Baker, not Rainier
    expect(sightsFrom([hill, baker, rainier], 47.6295, -122.3599, 90, 0).map((q) => q.name)).toEqual(['Mount Baker']);
  });
  it('reads a viewpoint\'s direction as the map writes it', () => {
    expect(viewBearing('SE')).toBe(135);
    expect(viewBearing('90-180')).toBe(135);
    expect(viewBearing('NW-NE')).toBe(0);
    expect(viewBearing('0-360')).toBeNull();
    expect(viewBearing('-45')).toBe(315);
    expect(viewBearing(undefined)).toBeNull();
  });
  it('paints the far mountains\' own ice and rock, from the same tiles (a nunatak stays rock)', async () => {
    const { encodeTile } = await import('./helpers/mvtEncode');
    const z = 8, Z = 2 ** z, X = ((rainier.lon + 180) / 360) * Z, r = (rainier.lat * Math.PI) / 180, Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Z;
    const x = Math.floor(X), y = Math.floor(Y), px = Math.round((X - x) * 4096), py = Math.round((Y - y) * 4096);
    const sq = (c: number, h: number): [number, number][] => [[c - h, py - h], [c + h, py - h], [c + h, py + h], [c - h, py + h], [c - h, py - h]].map(([a, b]) => [a + (px - c), b]) as [number, number][];
    const t = encodeTile([{ name: 'landcover', features: [
      { type: 3, tags: { class: 'rock', subclass: 'bare_rock' }, geom: [sq(px, 120)] },
      { type: 3, tags: { class: 'ice', subclass: 'glacier' }, geom: [sq(px, 60), sq(px, 8).reverse()] },
      { type: 3, tags: { class: 'wood' }, geom: [sq(px, 200)] },
    ] }]);
    const polys = coverInTile(t, x, y, z);
    expect(polys.map((p) => p.kind).sort()).toEqual(['ice', 'rock']);
    const cov = coverIndex(polys);
    const deg = 1 / (Z * 4096) * 360; // a tile unit, in degrees of longitude
    expect(cov.at(rainier.lat, rainier.lon + 30 * deg)).toBe('ice');
    expect(cov.at(rainier.lat, rainier.lon)).toBe('rock'); // (the hole in the ice)
    expect(cov.at(rainier.lat, rainier.lon + 100 * deg)).toBe('rock');
    expect(cov.at(rainier.lat, rainier.lon + 300 * deg)).toBe(null);
  });
});
