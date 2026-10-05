import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cropMix, fieldAt, cropStage, cropWash, CROP_CAL, CROPS, FIELD, GLSL_CROPS, type Crop } from '../src/world/fields';
import { seasonAt } from '../src/world/season';
import { castOf, regionStyle } from '../src/world/styles';
import { cropGeometries } from '../src/world/grass';

// Fields (docs/regional-life/models.md build order 10): the farmland planted field by field, each crop
// on its own calendar — the Corn Belt's corn and soybeans, the Plains' winter wheat, the northern
// Plains' spring wheat
const at = (lat: number, lon: number) => cropMix(castOf(regionStyle(lat, lon)), lat);
const share = (m: [Crop, number][], c: Crop) => (m.find(([k]) => k === c)?.[1] ?? 0) / m.reduce((a, [, w]) => a + w, 0);
const yearOn = (doy: number) => seasonAt(41.6, -93.6, 280, doy).year;

describe('fields', () => {
  it("each region's own: Iowa's corn and soybeans, Kansas's winter wheat, North Dakota's spring wheat, the Palouse's wheat", () => {
    const iowa = at(41.6, -93.6);
    expect(share(iowa, 'corn') + share(iowa, 'soy')).toBeGreaterThan(0.85);
    const kansas = at(37.69, -97.34);
    expect(share(kansas, 'wheat')).toBeGreaterThan(0.5);
    expect(share(at(46.88, -96.79), 'swheat')).toBeGreaterThan(0.3); // Fargo
    expect(share(at(46.73, -117.18), 'wheat')).toBeGreaterThan(0.8); // Pullman
    expect(share(iowa, 'swheat')).toBe(0);
  });
  it('a field is a 400 m block of the survey grid: one crop and one way of rows inside it, the mix across many', () => {
    const mix = at(41.6, -93.6);
    const a = fieldAt(10, 10, mix), b = fieldAt(FIELD - 10, FIELD - 10, mix);
    expect(b).toEqual(a);
    expect(fieldAt(10, 10, mix)).toEqual(a); // (deterministic)
    const n: Record<string, number> = {}, dirs = [0, 0];
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const f = fieldAt(i * FIELD + 5, j * FIELD + 5, mix); n[f.crop] = (n[f.crop] ?? 0) + 1; dirs[f.dir]++; }
    expect(n.corn / 1600).toBeGreaterThan(0.4);
    expect(n.soy / 1600).toBeGreaterThan(0.33);
    expect(Math.min(...dirs) / 1600).toBeGreaterThan(0.4); // (rows both ways)
  });
  it("each crop's year: corn bare in April, knee-high by the Fourth, head-high and tasselled in July, tan in October, stubble in winter", () => {
    const corn = (doy: number) => cropStage('corn', yearOn(doy), 0.5);
    expect(corn(100).bare).toBe(true);
    expect(corn(20).stubble).toBe(true); // (last year's stalks through the winter)
    expect(corn(185).h).toBeGreaterThan(0.6);
    expect(corn(205).h).toBeGreaterThan(0.95);
    expect(corn(205).ripe).toBe(0);
    expect(corn(280).ripe).toBeGreaterThan(0.5);
    expect(corn(320).stubble).toBe(true);
    // soybeans yellow in late September, cut in October
    const soy = (doy: number) => cropStage('soy', yearOn(doy), 0.5);
    expect(soy(200).h).toBeGreaterThan(0.6);
    expect(soy(268).ripe).toBeGreaterThan(0.3);
    expect(soy(300).stubble).toBe(true);
    // winter wheat green and short through the winter, tall in May, gold in June, stubble in August, sown again
    const wheat = (doy: number) => cropStage('wheat', yearOn(doy), 0.5);
    expect(wheat(15).h).toBeGreaterThan(0.15);
    expect(wheat(15).ripe).toBe(0);
    expect(wheat(130).h).toBeGreaterThan(0.9);
    expect(wheat(170).ripe).toBeGreaterThan(0.5);
    expect(wheat(220).stubble).toBe(true);
    expect(wheat(320).h).toBeGreaterThan(0.1);
    // spring wheat gold in August
    const sw = (doy: number) => cropStage('swheat', yearOn(doy), 0.5);
    expect(sw(140).h).toBeGreaterThan(0);
    expect(sw(225).ripe).toBeGreaterThan(0.5);
    // a field's harvest its own few days: two fields cut a week apart
    expect(cropStage('corn', 0.74, 0.1).stubble).not.toBe(cropStage('corn', 0.74, 0.9).stubble);
  });
  it('the wash far off: green in summer, the crop\'s ripe colour, pale stubble, bare brown soil — and the shader runs the same calendar', () => {
    const lum = (c: number[]) => c[0] + c[1] + c[2];
    const summer = cropWash('corn', cropStage('corn', 0.5, 0.5)), bare = cropWash('corn', cropStage('corn', 0.22, 0.5)), stubble = cropWash('wheat', cropStage('wheat', 0.6, 0.5));
    expect(summer[1]).toBeGreaterThan(summer[0]); // green
    expect(bare[0]).toBeGreaterThan(bare[1]); // brown
    expect(lum(stubble)).toBeGreaterThan(lum(summer));
    for (const c of CROPS) {
      const [p0, p1, r0, r1, h0, h1] = CROP_CAL[c];
      for (const v of [p0, p1, r0, r1, h0, h1 - h0]) expect(GLSL_CROPS, c).toContain(v.toFixed(3));
    }
  });
  it('the crops\' own geometry: a corn row\'s 2 m segment head-high with its tassels, a soybean row\'s metre knee-high; light enough for a field', () => {
    const g = cropGeometries();
    const box = (b: THREE.BufferGeometry) => { b.computeBoundingBox(); return b.boundingBox!; };
    const c = box(g.corn);
    expect(c.max.x - c.min.x).toBeCloseTo(2, 1);
    expect(c.max.y).toBeGreaterThan(1); // (to be scaled to 2.4–2.8 m)
    const tassel = g.corn.getAttribute('color');
    let heads = 0;
    for (let i = 0; i < tassel.count; i++) if (tassel.getY(i) > 0.5) heads++;
    expect(heads).toBeGreaterThan(0);
    expect(g.corn.getAttribute('position').count).toBeLessThan(400);
    expect(g.soy.getAttribute('position').count).toBeLessThan(100);
    expect(box(g.soy).max.y).toBeLessThan(0.8);
  });
});
