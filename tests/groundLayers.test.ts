import { describe, it, expect } from 'vitest';
import { seasonAt } from '../src/world/season';
import { WILDFLOWERS, wildBloom } from '../src/render/treeSeasons';
import { wildflowerMix, prairieMix, kudzuShare } from '../src/assets/flora';
import { castOf, regionStyle } from '../src/world/styles';
import { wildTuft } from '../src/world/grass';

// Package #9 (docs/regional-life/models.md build order 9): the ground layers in the open grass — each
// region's wildflower drifts in their own weeks, the prairie's bluestems (the forest floor's ferns are
// tests/understory.test.ts's)
const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
const ids = (lat: number, lon: number) => wildflowerMix(at(lat, lon)).map(([id]) => id);
const k = (id: string) => WILDFLOWERS.findIndex((w) => w.id === id);
const yearOn = (doy: number, lat = 40) => seasonAt(lat, -100, 100, doy).year;

describe('the ground layers: wildflowers and the prairie', () => {
  it("the calendar's year: 0 on January 20th, a half at midsummer, the southern year turned round", () => {
    expect(yearOn(20)).toBeCloseTo(0, 3);
    expect(yearOn(202)).toBeCloseTo(0.5, 2);
    expect(yearOn(19)).toBeGreaterThan(0.99);
    expect(seasonAt(-33.9, 151.2, 20, 20).year).toBeCloseTo(0.5, 2); // (Sydney's January is its July)
  });
  it('each drift in its own weeks: the bluebonnets in April, the poppies in March, the black-eyed Susans in July, the goldenrod in September, the asters in October — nothing in January', () => {
    const on = (id: string, doy: number) => wildBloom(k(id), 0.5, yearOn(doy));
    expect(on('bluebonnet', 100)).toBeGreaterThan(0.9);
    expect(on('bluebonnet', 160)).toBe(0);
    expect(on('poppy', 75)).toBeGreaterThan(0.9);
    expect(on('lupine', 105)).toBeGreaterThan(0.9);
    expect(on('blackeyed', 195)).toBeGreaterThan(0.9);
    expect(on('coneflower', 200)).toBeGreaterThan(0.9);
    expect(on('goldenrod', 255)).toBeGreaterThan(0.9);
    expect(on('aster', 285)).toBeGreaterThan(0.9);
    expect(on('fireweed', 205)).toBeGreaterThan(0.9);
    for (let i = 0; i < WILDFLOWERS.length; i++) for (const d of [5, 30, 350]) expect(wildBloom(i, 0.5, yearOn(d)), `${WILDFLOWERS[i].id} on ${d}`).toBe(0);
    // (each tuft a day or so off its neighbours: the drift comes in, it doesn't switch on)
    const y = yearOn(82);
    expect(wildBloom(k('bluebonnet'), 0, y)).not.toBe(wildBloom(k('bluebonnet'), 1, y));
  });
  it("each region's own: Texas's bluebonnets, California's poppies, the East's goldenrod — never another's", () => {
    expect(ids(30.27, -98.87)).toContain('bluebonnet'); // Fredericksburg
    expect(ids(32.78, -96.8)).toContain('bluebonnet'); // Dallas
    expect(ids(34.05, -118.24)).toContain('poppy');
    expect(ids(38.58, -121.49)).toContain('lupine');
    expect(ids(33.45, -112.07)).toContain('desertgold');
    for (const [lat, lon] of [[42.36, -71.06], [40.44, -80.0], [41.88, -87.63]]) expect(ids(lat, lon), `${lat},${lon}`).toContain('goldenrod');
    for (const [lat, lon] of [[42.36, -71.06], [33.75, -84.39], [47.6, -122.33], [34.05, -118.24], [41.88, -87.63]]) expect(ids(lat, lon), `${lat},${lon}`).not.toContain('bluebonnet');
    for (const [lat, lon] of [[42.36, -71.06], [33.75, -84.39], [30.27, -98.87], [41.88, -87.63]]) expect(ids(lat, lon), `${lat},${lon}`).not.toContain('poppy');
    expect(ids(47.6, -122.33)).toContain('fireweed');
  });
  it('drifts: patches where a third of the tufts flower, one species to a patch mostly, a scatter between', () => {
    const mix = wildflowerMix(at(30.27, -98.87)).map(([id, w]) => [k(id), w] as [number, number]);
    const cell = (x0: number, z0: number) => {
      let n = 0, fl = 0;
      const by = new Map<number, number>();
      for (let x = x0; x < x0 + 20; x += 0.7) for (let z = z0; z < z0 + 20; z += 0.7) {
        const t = wildTuft(x, z, 0.7, mix, null);
        n++;
        if (t.flower) (fl++, by.set(t.kind, (by.get(t.kind) ?? 0) + 1));
      }
      return { share: fl / n, top: Math.max(0, ...by.values()) / Math.max(1, fl) };
    };
    const cells = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) cells.push(cell(i * 20, j * 20));
    const shares = cells.map((c) => c.share).sort((a, b) => a - b);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.15); // (a drift)
    expect(shares[0]).toBeLessThan(0.05); // (the meadow between)
    const drifts = cells.filter((c) => c.share > 0.15);
    expect(drifts.reduce((a, c) => a + c.top, 0) / drifts.length).toBeGreaterThan(0.6); // (one species to a patch)
    // every flowering tuft one of the region's
    for (let x = 0; x < 100; x += 1.3) for (let z = 0; z < 100; z += 1.3) {
      const t = wildTuft(x, z, 0.7, mix, null);
      if (t.flower) expect(mix.map(([kk]) => 10 + kk)).toContain(t.kind);
    }
    // a short tuft never flowers; no mix, the old five colours' odd flower (kind 0)
    expect(wildTuft(3, 4, 0.2, mix, null).flower).toBe(false);
    let old = 0;
    for (let x = 0; x < 60; x += 0.9) for (let z = 0; z < 60; z += 0.9) { const t = wildTuft(x, z, 0.7, [], null); if (t.flower) (old++, expect(t.kind).toBe(0)); }
    expect(old).toBeGreaterThan(0);
  });
  it("the prairie's bluestems: the Flint Hills' big bluestem, the mixed-grass little; none east of the prairie or in the West", () => {
    const flint = prairieMix(at(38.6, -96.5))!;
    expect(flint.big).toBeGreaterThan(flint.little);
    for (const [lat, lon] of [[42.36, -71.06], [47.6, -122.33], [33.45, -112.07], [34.05, -118.24], [33.75, -84.39]]) expect(prairieMix(at(lat, lon)), `${lat},${lon}`).toBeNull();
    let big = 0, little = 0;
    for (let x = 0; x < 60; x += 0.8) for (let z = 0; z < 60; z += 0.8) {
      const t = wildTuft(x, z, 0.8, [], flint);
      if (t.kind === 1) big++;
      if (t.kind === 2) little++;
    }
    expect(big).toBeGreaterThan(little);
    expect(little).toBeGreaterThan(0);
  });
  it("kudzu on the Deep South's wood edges, a little in Virginia and Arkansas; never north or west", () => {
    for (const [lat, lon] of [[33.75, -84.39], [33.52, -86.8], [35.23, -80.84], [32.3, -90.18]]) expect(kudzuShare(at(lat, lon)), `${lat},${lon}`).toBeGreaterThan(0.15);
    for (const [lat, lon] of [[42.36, -71.06], [41.88, -87.63], [47.6, -122.33], [39.74, -104.99], [34.05, -118.24], [44.98, -93.27]]) expect(kudzuShare(at(lat, lon)), `${lat},${lon}`).toBe(0);
  });
});
