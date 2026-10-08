import { describe, it, expect, beforeAll } from 'vitest';
import { seasonAt } from '../src/world/season';
import { plantNow, plantGeometry, understoryMix, plantMix, vergeShare, desertCover, treeMeta, SPECIES, PLANT_SPECIES, type PlantSpecies, type TreeKind } from '../src/assets/flora';
import { castOf, regionStyle, setActiveStyle } from '../src/world/styles';
import { virtualRegion } from '../src/world/virtual';
import { buildTile } from '../src/world/tileBuild';
import type { TileJson } from '../src/world/data';

// (the tile builder's canvases, stubbed as tests/streetTrees.test.ts does)
class StubCtx {
  canvas: unknown;
  fillStyle = ''; strokeStyle = ''; lineWidth = 1; lineCap = ''; lineJoin = ''; globalCompositeOperation = ''; textBaseline = ''; font = '';
  constructor(c: unknown) { this.canvas = c; }
  setTransform() {} beginPath() {} moveTo() {} lineTo() {} stroke() {} fill() {} fillRect() {} fillText() {} drawImage() {} closePath() {} arc() {} rect() {}
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(t: string) { return { width: t.length * 8 }; }
  getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}
class StubCanvas {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return new StubCtx(this); }
  transferToImageBitmap() { return { width: this.width, height: this.height, close() {} } as unknown as ImageBitmap; }
}
beforeAll(() => { (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas; });

// The flora review (2026-10-07, the ecosystem review's "next — plants"): each plant in its season, on
// its ground, in its numbers, in its range — as the animals were the day before
const JAN = 15, FEB = 46, APR = 105, MAY = 135, JUL = 196, OCT = 288, NOV = 319, DEC = 352;
const NYC = [40.71, -74.0, 10] as const, HOUSTON = [29.76, -95.37, 15] as const, MIAMI = [25.76, -80.19, 2] as const;
const at = (p: readonly [number, number, number], d: number) => seasonAt(p[0], p[1], p[2], d);

describe('in its season', () => {
  it("the mild South's and the West's broadleaves are bare at Christmas and in leaf by April; the tropics never drop; the North's autumn as it was", () => {
    // (a mean that never falls under 10 °C held a Houston sweetgum in leaf all winter)
    expect(at(HOUSTON, JAN).leafFall).toBeGreaterThan(0.9);
    expect(at(HOUSTON, FEB).leafFall).toBeGreaterThan(0.3); // (late February: the first leaves)
    expect(at(HOUSTON, APR).leafFall).toBe(0);
    expect(at(HOUSTON, NOV).leafFall).toBeLessThan(0.15); // (mid-November: still in leaf, colouring in December)
    expect(seasonAt(38.58, -121.49, 10, JAN).leafFall).toBeGreaterThan(0.9); // Sacramento's sycamores
    expect(seasonAt(33.45, -112.07, 340, JAN).leafFall).toBeGreaterThan(0.9); // Phoenix
    expect(seasonAt(28.54, -81.38, 30, JAN).leafFall).toBeGreaterThan(0.9); // Orlando's cypresses and maples
    for (const d of [JAN, FEB, APR, JUL, OCT, DEC]) expect(at(MIAMI, d).leafFall, `day ${d}`).toBe(0);
    // the North's late colour isn't hurried: New York in leaf through October, Seattle's into November
    expect(at(NYC, OCT).leafFall).toBe(0);
    expect(seasonAt(47.61, -122.33, 50, OCT).leafFall).toBeLessThan(0.15);
  });
  it("the lawns' winter: the hot South's warm-season grass straw-tan, the North's dulled, the marine coasts' green", () => {
    const dallas = (d: number) => seasonAt(32.78, -96.8, 140, d).dormant;
    expect(dallas(JAN)).toBeGreaterThan(0.9);
    expect(dallas(MAY)).toBe(0);
    expect(dallas(JUL)).toBe(0);
    expect(seasonAt(33.75, -84.39, 300, JAN).dormant).toBeGreaterThan(0.5); // Atlanta's Bermuda
    expect(seasonAt(36.17, -115.14, 610, JAN).dormant).toBeGreaterThan(0.8); // Las Vegas's
    expect(at(MIAMI, JAN).dormant).toBe(0); // St. Augustine green the year round
    expect(seasonAt(37.77, -122.42, 20, JAN).dormant).toBeLessThan(0.1); // San Francisco: the rains' green
    expect(seasonAt(47.61, -122.33, 50, JAN).dormant).toBeLessThan(0.2); // Seattle
    const ny = at(NYC, JAN).dormant;
    expect(ny).toBeGreaterThan(0.15); // a New York January lawn is dull…
    expect(ny).toBeLessThan(0.45); // …but no straw-tan Bermuda
  });
  it("the gardens' year: a northern January's beds are the evergreens and bare twigs; the perennials come up in April; the sunflowers only in their summer", () => {
    const ny = (sp: PlantSpecies, d: number) => plantNow(sp, at(NYC, d));
    for (const sp of ['hosta', 'daylily', 'coneflower', 'fern', 'bracken', 'cinnamonfern', 'sunflower'] as PlantSpecies[]) expect(ny(sp, JAN), sp).toBeNull();
    for (const sp of ['boxwood', 'rhododendron', 'azalea', 'lavender', 'agave', 'swordfern', 'salal', 'oregongrape'] as PlantSpecies[]) expect(ny(sp, JAN), sp).toEqual({ size: 1, brown: 0 });
    for (const sp of ['hydrangea', 'rose', 'beachgrass'] as PlantSpecies[]) expect(ny(sp, JAN)!.brown, sp).toBeGreaterThan(0.9); // bare twigs, dried heads, straw
    expect(ny('hydrangea', JUL)).toEqual({ size: 1, brown: 0 });
    // the hostas coming up in April, full by May; dying back in November; gone by Christmas
    expect(ny('hosta', APR)!.size).toBeLessThan(0.9);
    expect(ny('hosta', MAY)!.size).toBe(1);
    expect(ny('hosta', NOV)!.brown).toBeGreaterThan(0.3);
    expect(ny('hosta', DEC)).toBeNull();
    // the sunflowers: none in April, grown in July, a dead stalk in October
    expect(ny('sunflower', APR)).toBeNull();
    expect(ny('sunflower', JUL)!.size).toBeGreaterThan(0.9);
    expect(ny('sunflower', OCT)!.brown).toBeGreaterThan(0.3);
    // the bracken copper in its fall, as the month windows had it
    expect(ny('bracken', NOV)!.brown).toBeGreaterThan(0.35);
    // Miami's gardens green the year round
    for (const sp of PLANT_SPECIES) {
      const m = plantNow(sp, at(MIAMI, JAN));
      if (sp === 'sunflower') continue; // (an annual: sown in the warm weeks — Miami's January is one)
      expect(m, sp).not.toBeNull();
      expect(m!.brown, sp).toBe(0);
    }
  });
});

// An old residential grid with no survey: an 8 m street along z = 130, houses 9 m × 10 m every 14 m
// down both sides behind 10 m front yards — the trees the street grows on its verges (|z − 130| 6–8.5 m)
const m = (v: number) => Math.round(v * 10), STREET_Z = 130;
async function vergeTrees(at: [number, number], surveyed = false) {
  setActiveStyle(regionStyle(at[0], at[1]));
  const buildings = [];
  for (let x = 20; x < 236; x += 14)
    for (const side of [1, -1]) {
      const z0 = STREET_Z + side * 14, z1 = STREET_Z + side * 24;
      buildings.push({ r: [m(x), m(z0), m(x + 9), m(z0), m(x + 9), m(z1), m(x), m(z1)], h: 7, k: 'house', roof: 'gable', s: x + side });
    }
  const tj = {
    version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
    origin: { lat: at[0], lon: at[1] }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
    landmarks: [], buildings, areas: [], lines: [], points: [],
    roads: [{ p: [m(4), m(STREET_Z), m(252), m(STREET_Z)], c: 'residential', w: 8 }],
    ...(surveyed ? { trees: [], treeCov: Array(256).fill(1) } : {}),
  } as unknown as TileJson;
  const built = await buildTile(tj, virtualRegion(at).terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
  let verge = 0;
  for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
    if (!o.n?.startsWith('trees:') || !o.im) continue;
    for (let i = 0; i + 15 < o.im.length; i += 16) {
      const d = Math.abs(o.im[i + 14] - STREET_Z);
      if (d >= 6 && d <= 8.5) verge++;
    }
  }
  return { verge };
}

describe('in its numbers', () => {
  it("a street nothing measured is lined with the region's street trees: Durham's old grid leafy, Phoenix's nearly bare, a surveyed street left to its survey", async () => {
    // (Trinity Park, Durham: no LiDAR record, seven mapped trees in its square kilometre — the game showed
    // 2% vegetation where the photo shows 57%)
    expect(vergeShare(castOf(regionStyle(36.0055, -78.9056)), 'grid')).toBeGreaterThan(0.6);
    expect(vergeShare(castOf(regionStyle(33.45, -112.07)), 'grid')).toBeLessThan(0.2);
    expect(vergeShare(castOf(regionStyle(36.0055, -78.9056)), 'tract')).toBeLessThan(vergeShare(castOf(regionStyle(36.0055, -78.9056)), 'grid') / 2);
    const durham = await vergeTrees([36.0055, -78.9056]), phoenix = await vergeTrees([33.45, -112.07]), surveyed = await vergeTrees([36.0055, -78.9056], true);
    expect(durham.verge).toBeGreaterThan(12); // (40 slots, three in four planted, less the front walks' and the drives' ways)
    expect(phoenix.verge).toBeLessThan(durham.verge / 3);
    expect(surveyed.verge).toBe(0); // (the survey's own trees stand there: none here)
  }, 60000);
});

// A 256 m square of open ground the map draws nothing on — or, with `town`, a grid of houses over it
async function openGround(at: [number, number], town = false, surveyed = false) {
  setActiveStyle(regionStyle(at[0], at[1]));
  const buildings = [];
  if (town) for (let x = 8; x < 248; x += 16) for (let z = 8; z < 248; z += 16) buildings.push({ r: [m(x), m(z), m(x + 10), m(z), m(x + 10), m(z + 9), m(x), m(z + 9)], h: 5, k: 'house', roof: 'flat', s: x * 1000 + z });
  const tj = {
    version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
    origin: { lat: at[0], lon: at[1] }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
    landmarks: [], buildings, areas: [], lines: [], points: [], roads: [],
    ...(surveyed ? { trees: [], treeCov: Array(256).fill(1) } : {}),
  } as unknown as TileJson;
  const built = await buildTile(tj, virtualRegion(at).terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
  const kinds: Record<string, number> = {};
  let n = 0, tallest = 0;
  for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
    if (!o.n?.startsWith('trees:') || !o.im) continue;
    const [, kind, v] = o.n.split(':'), mh = treeMeta(kind as TreeKind, +v || 0).h;
    for (let i = 0; i + 15 < o.im.length; i += 16) (n++, (kinds[kind] = (kinds[kind] ?? 0) + 1), (tallest = Math.max(tallest, Math.hypot(o.im[i + 4], o.im[i + 5], o.im[i + 6]) * mh)));
  }
  return { n, kinds, tallest };
}

describe('on its ground', () => {
  it("the dry country's own floor where the map draws nothing and nothing's built: the Sonoran's thick, a desert town's sparse, a wet country's open ground as it was", async () => {
    const SAGUARO: [number, number] = [32.18, -110.73];
    expect(desertCover(castOf(regionStyle(...SAGUARO)), 900, SAGUARO[0])).toBeGreaterThan(0.5);
    expect(desertCover(castOf(regionStyle(36.0055, -78.9056)), 100, 36)).toBe(0); // (Durham's no desert)
    const wild = await openGround(SAGUARO), town = await openGround(SAGUARO, true), durham = await openGround([36.0055, -78.9056]);
    // (a 256 m square holds ~800 of the scan's 9 m cells: the Sonoran upland grows a plant in over a third)
    expect(wild.n).toBeGreaterThan(250);
    const own = ['creosote', 'cholla', 'pricklypear', 'ocotillo', 'saguaro', 'mesquite'].reduce((s, k) => s + (wild.kinds[k] ?? 0), 0);
    expect(own / wild.n).toBeGreaterThan(0.8); // the desert's own, not lawn trees
    for (const k of ['fanpalm', 'queenpalm', 'canarypalm', 'palm']) expect(wild.kinds[k] ?? 0, k).toBe(0); // (palms are planted: a town's, never the wild desert's)
    for (const k of Object.keys(wild.kinds)) expect(treeMeta(k as TreeKind, 0).h, k).toBeGreaterThan(0);
    expect(town.n).toBeLessThan(wild.n / 4); // (a town's yards keep the arid towns' sparse planting)
    expect(durham.n).toBeLessThan(wild.n / 4); // (open grass in the wet country: unchanged)
    // under the survey (its crowns from 2.5 m are the trees): the low floor still, nothing it could have seen
    const surveyed = await openGround(SAGUARO, false, true);
    expect(surveyed.n).toBeGreaterThan(150);
    expect(surveyed.tallest).toBeLessThan(2.5);
    for (const k of Object.keys(surveyed.kinds)) expect(['creosote', 'cholla', 'pricklypear', 'sagebrush'], k).toContain(k);
  }, 60000);
});

describe('as it should look', () => {
  it("the forest floor's plants each carry their own green: a merged floor cell has no instance colour to paint a tintable leaf", () => {
    // (the generic fern was TINT white — drawn white through every eastern, southern and Florida wood)
    const floors = new Set<PlantSpecies>();
    for (const [lat, lon] of [[44.26, -72.58], [42.65, -73.75], [35.6, -82.55], [38.9, -77.03], [33.75, -84.39], [30.45, -91.15], [28.54, -81.38], [36.37, -94.21], [44.98, -93.27], [47.61, -122.33], [41.0, -124.0]])
      for (const [sp] of understoryMix(castOf(regionStyle(lat, lon))).mix) floors.add(sp);
    expect(floors.size).toBeGreaterThan(3);
    for (const sp of floors) {
      expect(SPECIES[sp].leaf, sp).toBeDefined();
      const c = plantGeometry(sp, 1, 1, false, true).getAttribute('color');
      let white = 0;
      for (let i = 0; i < c.count; i++) if (Math.min(c.getX(i), c.getY(i), c.getZ(i)) > 0.98) white++;
      expect(white, sp).toBe(0);
    }
  });
  it('every garden plant has a year: what the gardens plant goes through one', () => {
    // (a perennial or an annual or a shrub turns with the season; an evergreen keeps — none undeclared
    // among the herbaceous: their months alone held a full green hosta through a Vermont January)
    const herbaceous: PlantSpecies[] = ['hosta', 'daylily', 'coneflower', 'sunflower', 'fern', 'bracken', 'cinnamonfern'];
    for (const sp of herbaceous) expect(SPECIES[sp].life, sp).toBeDefined();
    for (const c of ['temperate', 'continental', 'boreal', 'mediterranean', 'tropical', 'arid']) expect(plantMix(c).length).toBeGreaterThan(0);
  });
});
