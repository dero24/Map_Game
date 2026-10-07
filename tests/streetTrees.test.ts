import { describe, it, expect, beforeAll } from 'vitest';
import { type TileJson } from '../src/world/data';
import { virtualRegion } from '../src/world/virtual';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { buildTile } from '../src/world/tileBuild';
import { treeMeta, coniferMix, aspenShare, snagShare, broadMix, rosebayShare, bankMix, redcedarShare, understoryTrees, swampMix, swampForm, manzanitaShare, sequoiaBand, redwoodCountry, westForm, desertMix, desertTrees, pjBand, palmMix, palmettoShare, SMALL_TREE, type TreeKind } from '../src/assets/flora';
import { meanTemp } from '../src/world/season';
import { caRedwoodBelt } from '../src/world/ecoregions';
import { castOf } from '../src/world/styles';

// The survey's street trees stand (props.ts, the LiDAR trees): a crown measured over the street has
// its trunk at the kerb — on the verge past the paved band, or in a pit where the sidewalk runs wall
// to wall — and a step along the street when a stoop or a door's way in is where it would stand.
// Both used to be dropped: of the 35 trees the survey measured within 50 m of a Savannah street under
// live oaks, the game kept 6, and the green spots read 3% vegetation where the photos read 35%.
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

const m = (v: number) => Math.round(v * 10);
// (a virtual region's own ground, as the streamed towns build on: tests/mustLoad.test.ts)
const AT: [number, number] = [32.0745, -81.095];
const terrain = virtualRegion(AT).terrain;

// A row-house street: 8 m wide along z = 130, a 2.5 m sidewalk, and houses 7.6 m wide front to
// front down both sides, each with its door on the street — and the survey's trees, 18 m tall (no
// other rule plants that height), crowns centred over the kerb every 10 m on both sides.
const STREET_Z = 130, TALL = 18;
function rowStreet(): TileJson {
  const buildings = [];
  for (let x = 30; x < 230; x += 8)
    for (const side of [1, -1]) {
      const z0 = STREET_Z + side * 6.5, z1 = STREET_Z + side * 16.5;
      buildings.push({ r: [m(x), m(z0), m(x + 7.6), m(z0), m(x + 7.6), m(z1), m(x), m(z1)], h: 9, k: 'house', roof: 'flat', s: x + side });
    }
  const trees: number[] = [];
  for (let x = 40; x <= 220; x += 10) for (const side of [1, -1]) trees.push(m(x), m(STREET_Z + side * 4.5), m(TALL), m(4));
  return {
    version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
    origin: { lat: 32.07, lon: -81.09 }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
    landmarks: [], buildings, areas: [], lines: [], points: [],
    roads: [{ p: [m(10), m(STREET_Z), m(246), m(STREET_Z)], c: 'residential', w: 8, n: 'Jones Street' }],
    trees, treeCov: Array(256).fill(1),
  } as unknown as TileJson;
}

describe("the survey's street trees", () => {
  it("a desert town's measured crowns are trees: never a cholla, a prickly pear or a creosote stretched to fit one (Tucson's black poles)", async () => {
    // (a slim crown was a pine pick, and where no conifer grows the low desert's shrub took it — the 2 m
    // cholla stretched to a 9 m crown, its black dead joints a pole on West Washington Street)
    const at: [number, number] = [32.2226, -110.9747];
    setActiveStyle(regionStyle(at[0], at[1]));
    const tj = rowStreet();
    tj.origin = { lat: at[0], lon: at[1] };
    const trees: number[] = [];
    for (let i = 0; i < 160; i++) {
      const x = 12 + (i % 16) * 15, z = 12 + Math.floor(i / 16) * 24, h = 4.2 + (i % 7) * 1.6, r = i % 2 ? h * 0.2 : h * 0.5;
      trees.push(m(x), m(z), m(h), m(r));
    }
    tj.trees = trees;
    const built = await buildTile(tj, virtualRegion(at).terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
    let n = 0;
    for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
      if (!o.n?.startsWith('trees:') || !o.im) continue;
      const [, kind, v] = o.n.split(':'), cap = SMALL_TREE[kind as TreeKind], mh = treeMeta(kind as TreeKind, +v || 0).h;
      for (let i = 0; i + 15 < o.im.length; i += 16) {
        n++;
        if (cap) expect(Math.hypot(o.im[i + 4], o.im[i + 5], o.im[i + 6]) * mh, kind).toBeLessThanOrEqual(cap * 1.15 + 0.05);
      }
    }
    expect(n).toBeGreaterThan(60);
  }, 60000);
  it('a crown over the kerb of a row-house street keeps its tree: at the kerb, clear of the stoops and doors', async () => {
    setActiveStyle(regionStyle(AT[0], AT[1]));
    const tj = rowStreet(), want = tj.trees!.length / 4;
    const built = await buildTile(tj, terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
    // the survey's trees as built: an instance of a 'trees:<kind>:<variant>' mesh standing ~18 m tall
    let kept = 0, onStreet = 0;
    for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
      if (!o.n?.startsWith('trees:') || !o.im) continue;
      const [, kind, v] = o.n.split(':');
      const mh = treeMeta(kind as TreeKind, +v || 0).h;
      for (let i = 0; i + 15 < o.im.length; i += 16) {
        const sy = Math.hypot(o.im[i + 4], o.im[i + 5], o.im[i + 6]), x = o.im[i + 12], z = o.im[i + 14];
        if (Math.abs(sy * mh - TALL) > 1) continue;
        kept++;
        if (Math.abs(Math.abs(z - STREET_Z) - 5.1) > 0.5 && Math.abs(z - STREET_Z) < 4.2) onStreet++; // (never on the carriageway)
        expect(x).toBeGreaterThan(30);
      }
    }
    expect(onStreet).toBe(0);
    expect(kept).toBeGreaterThanOrEqual(Math.ceil(want * 0.8));
  }, 30000);
});

describe("the map's own woods", () => {
  it('a wood or forest the map draws grows a forest on a streamed cell with no survey', async () => {
    // (a streamed cell's ground is the DEM's, its cover grassland everywhere: Longmire, inside Mount
    // Rainier's old growth, stood on an open lawn)
    setActiveStyle(regionStyle(AT[0], AT[1]));
    const sq = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
      origin: { lat: AT[0], lon: AT[1] }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
      landmarks: [], buildings: [], roads: [], lines: [], points: [],
      areas: [{ c: 'wood', o: [sq(20, 20, 120, 120)], i: [] }],
    } as unknown as TileJson;
    const built = await buildTile(tj, terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
    let inWood = 0, outside = 0;
    for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
      if (!o.n?.startsWith('trees:') || !o.im) continue;
      for (let i = 0; i + 15 < o.im.length; i += 16) {
        const x = o.im[i + 12], z = o.im[i + 14];
        if (x > 20 && x < 120 && z > 20 && z < 120) inWood++;
        else if (x > 140 && z > 140) outside++;
      }
    }
    // a hectare of wood: a forest (the scan's 85% a 9 m cell is ~100 a hectare); open ground stays open
    expect(inWood).toBeGreaterThan(60);
    expect(outside).toBeLessThan(inWood / 4);
  }, 30000);
});

// The Northwest's own woods (docs/regional-life/16-pnw.md; Robby: "do northwest"): west of the
// Cascades' crest a mapped wood grows Douglas fir, western hemlock and redcedar — Sitka spruce too
// in the outer coast's fog belt — tall, never the generic spruce or pine; east of the crest the dry
// side is the Mountain West's.
describe("the Northwest's woods", () => {
  const wood = async (at: [number, number]) => {
    setActiveStyle(regionStyle(at[0], at[1]));
    const sq = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
      origin: { lat: at[0], lon: at[1] }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
      landmarks: [], buildings: [], roads: [], lines: [], points: [],
      areas: [{ c: 'wood', o: [sq(10, 10, 240, 240)], i: [] }],
    } as unknown as TileJson;
    const built = await buildTile(tj, virtualRegion(at).terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
    const kinds: Record<string, { n: number; tall: number }> = {};
    for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
      if (!o.n?.startsWith('trees:') || !o.im) continue;
      const [, kind, v] = o.n.split(':'), mh = treeMeta(kind as TreeKind, +v || 0).h, q = (kinds[kind] ??= { n: 0, tall: 0 });
      for (let i = 0; i + 15 < o.im.length; i += 16) { q.n++; if (Math.hypot(o.im[i + 4], o.im[i + 5], o.im[i + 6]) * mh > 20) q.tall++; }
    }
    return kinds;
  };
  it('west of the crest: Douglas fir, hemlock and redcedar, tall; Sitka spruce on the outer coast', async () => {
    const inland = await wood([47.6, -122.3]), coast = await wood([47.9, -124.4]);
    for (const k of [inland, coast]) {
      expect(k.spruce?.n ?? 0).toBe(0);
      expect(k.pine?.n ?? 0).toBe(0);
      const nw = ['fir', 'hemlock', 'cedar', 'sitka'].reduce((s, c) => s + (k[c]?.n ?? 0), 0), all = Object.values(k).reduce((s, q) => s + q.n, 0);
      expect(nw / all).toBeGreaterThan(0.45); // conifer country
      expect(k.fir.tall / k.fir.n).toBeGreaterThan(0.8); // towering
    }
    expect(inland.hemlock?.n ?? 0).toBeGreaterThan(0);
    expect(inland.cedar?.n ?? 0).toBeGreaterThan(0);
    expect(inland.sitka?.n ?? 0).toBe(0); // (no fog belt on the Sound)
    expect(coast.sitka?.n ?? 0).toBeGreaterThan(0);
  }, 60000);
  it("east of the crest the dry side is the Mountain West: ponderosa country, none of the westside's own conifers, no moss", async () => {
    expect(regionStyle(44.06, -121.31).sub).toBe('mountain');
    expect(regionStyle(46.6, -120.5).sub).toBe('mountain');
    expect(regionStyle(47.6, -122.33).sub).toBe('pnw');
    expect(regionStyle(47.6, -122.33).moss).toBeGreaterThan(0.8);
    expect(regionStyle(44.06, -121.31).moss).toBeLessThan(0.2);
    const dry = await wood([44.06, -121.31]);
    expect(['hemlock', 'cedar', 'sitka'].reduce((s, c) => s + (dry[c]?.n ?? 0), 0)).toBe(0);
    // (Bend: "ponderosa and juniper" — docs/regional-life/16-pnw.md; the interior's Douglas fir a few)
    expect(dry.ponderosa?.n ?? 0).toBeGreaterThan(dry.fir?.n ?? 0);
  }, 60000);
  // The northern and mountain forests (docs/regional-life/models.md build order #3)
  it("the Adirondacks' woods: white pine, red spruce, balsam fir and hemlock — never the West's conifers", async () => {
    const k = await wood([44.28, -73.98]);
    expect(k.whitepine?.n ?? 0).toBeGreaterThan(0);
    expect((k.redspruce?.n ?? 0) + (k.balsamfir?.n ?? 0)).toBeGreaterThan(0);
    for (const w of ['ponderosa', 'lodgepole', 'engelmann', 'subalpinefir', 'fir']) expect(k[w]?.n ?? 0, w).toBe(0);
    const ash = await wood([35.6, -82.55]); // Asheville's coves
    expect(ash.easthemlock?.n ?? 0).toBeGreaterThan(0);
  }, 60000);
});

describe('the northern and mountain conifers by place (flora.ts coniferMix)', () => {
  const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
  const kinds = (m: [string, number][]) => m.map(([k]) => k);
  it('the West by elevation band: the foothills ponderosa, the montane lodgepole and Douglas fir, the subalpine spruce and fir', () => {
    const co = at(39.74, -104.99); // the Front Range
    expect(kinds(coniferMix(co, 'pine', 1700, 39.74))).toEqual(['ponderosa']);
    expect(kinds(coniferMix(co, 'pine', 2700, 39.74))).toContain('lodgepole');
    expect(kinds(coniferMix(co, 'spruce', 2700, 39.74))).toContain('fir');
    expect(kinds(coniferMix(co, 'spruce', 3200, 39.74)).sort()).toEqual(['engelmann', 'subalpinefir']);
    // the bands sit lower up north: Missoula's valley is ponderosa, Montana's 2,600 m subalpine
    const mt = at(46.87, -113.99);
    expect(kinds(coniferMix(mt, 'pine', 980, 46.87))).toEqual(['ponderosa']);
    expect(kinds(coniferMix(mt, 'spruce', 2600, 46.87)).sort()).toEqual(['engelmann', 'subalpinefir']);
    // Flagstaff's plateau a ponderosa forest; Tucson's desert floor keeps its own (piñon and juniper to come)
    expect(kinds(coniferMix(at(35.2, -111.65), 'pine', 2100, 35.2))).toEqual(['ponderosa']);
    expect(coniferMix(at(32.22, -110.97), 'pine', 800, 32.22)).toEqual([]);
  });
  it("never a western conifer east of the Plains; the East's own by region", () => {
    for (const [lat, lon] of [[44.28, -73.98], [42.36, -71.06], [35.6, -82.55], [40.36, -73.97], [46.79, -92.1], [38.04, -84.5], [32.08, -81.09]])
      for (const kind of ['pine', 'spruce'] as const) for (const elev of [50, 600, 1800])
        for (const w of kinds(coniferMix(at(lat, lon), kind, elev, lat))) expect(['ponderosa', 'lodgepole', 'engelmann', 'subalpinefir', 'fir'], `${w} at ${lat},${lon}`).not.toContain(w);
    expect(kinds(coniferMix(at(42.36, -71.06), 'pine', 30, 42.36))).toContain('whitepine');
    expect(kinds(coniferMix(at(35.6, -82.55), 'spruce', 1800, 35.6))).toContain('redspruce'); // the Smokies' spruce-fir summits
  });
  it('aspen groves in the mountains and the north woods; snags where beetles, the adelgid and beavers kill', () => {
    expect(aspenShare(at(39.19, -106.82), 2400, 39.19)).toBeGreaterThan(0.3); // Aspen
    expect(aspenShare(at(32.08, -81.09), 10, 32.08)).toBe(0);
    expect(aspenShare(at(41.88, -87.63), 180, 41.88)).toBe(0);
    expect(snagShare(at(39.19, -106.82), 'lodgepole', false)).toBeGreaterThan(0);
    expect(snagShare(at(35.6, -82.55), 'easthemlock', false)).toBeGreaterThan(0);
    expect(snagShare(at(44.28, -73.98), 'round', true)).toBeGreaterThan(0); // a beaver pond
    expect(snagShare(at(32.08, -81.09), 'liveoak', true)).toBe(0);
  });
});

// Package #4 (docs/regional-life/models.md build order 4; ranges.md): the eastern hardwoods, the
// flowering understory and the southern pines, each where it grows and nowhere else
describe('package #4 by place (flora.ts broadMix, coniferMix, rosebayShare, bankMix)', () => {
  const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
  const has = (m: [string, number][], k: string) => m.some(([kk, w]) => kk === k && w > 0);
  const NORTH: [number, number][] = [[42.36, -71.06], [44.48, -73.21], [42.89, -78.88], [40.74, -74.17], [39.95, -75.17], [41.88, -87.63], [44.98, -93.27], [41.26, -95.94], [46.88, -96.79], [43.04, -87.91]];
  const WEST: [number, number][] = [[47.6, -122.33], [45.52, -122.68], [37.77, -122.42], [34.05, -118.24], [32.72, -117.16], [33.45, -112.07], [32.22, -110.97], [40.76, -111.89], [39.74, -104.99], [43.62, -116.2], [36.17, -115.14], [35.08, -106.65]];
  it('no crape myrtle in the North; on the streets of the South', () => {
    for (const [lat, lon] of [...NORTH, ...WEST, [40.44, -80.0]]) expect(has(broadMix(at(lat, lon)), 'crapemyrtle'), `${lat},${lon}`).toBe(false); // (Pittsburgh's Appalachia too)
    for (const [lat, lon] of [[33.75, -84.39], [32.08, -81.09], [29.76, -95.37], [32.78, -96.8], [30.69, -88.04], [38.9, -77.04], [35.96, -83.92], [29.95, -90.07]]) expect(has(broadMix(at(lat, lon)), 'crapemyrtle'), `${lat},${lon}`).toBe(true);
  });
  it('longleaf only on the southern coastal plain and the sandhills', () => {
    const pines = (lat: number, lon: number) => [20, 300, 900].flatMap((e) => coniferMix(at(lat, lon), 'pine', e, lat).map(([k]) => k));
    // the Sandhills, the Georgia and Carolina coast, the Gulf's coastal plain, north Florida, the Big Thicket
    for (const [lat, lon] of [[35.05, -78.88], [32.08, -81.09], [32.78, -79.93], [30.69, -88.04], [30.44, -84.28], [29.65, -82.32], [31.34, -94.73]]) expect(pines(lat, lon), `${lat},${lon}`).toContain('longleaf');
    // never the Piedmont, the mountains, the Plateau, the Delta's north, Houston's prairie, South Florida, the North or the West
    for (const [lat, lon] of [[33.75, -84.39], [37.54, -77.43], [35.6, -82.55], [36.16, -86.78], [32.78, -96.8], [29.76, -95.37], [25.76, -80.19], [34.75, -92.29], ...NORTH, ...WEST]) expect(pines(lat, lon), `${lat},${lon}`).not.toContain('longleaf');
    // the loblolly on the Piedmont; South Florida's own slash pine
    expect(pines(33.75, -84.39)).toContain('loblolly');
    expect([...new Set(pines(25.76, -80.19))]).toEqual(['slashpine']);
  });
  it('rosebay only in Appalachia', () => {
    expect(rosebayShare(at(35.6, -82.55), true, false)).toBeGreaterThan(0.5); // Asheville's creeks
    expect(rosebayShare(at(35.6, -82.55), false, true)).toBeGreaterThan(0); // and its laurel hells
    for (const [lat, lon] of [[33.75, -84.39], [32.08, -81.09], [36.16, -86.78], [38.9, -77.04], [29.76, -95.37], ...NORTH, ...WEST])
      for (const [stream, wood] of [[true, false], [false, true]]) expect(rosebayShare(at(lat, lon), stream, wood), `${lat},${lon}`).toBe(0);
  });
  it('no sweetgum — nor tulip tree, buckeye, dogwood or redbud — in the West', () => {
    for (const [lat, lon] of WEST) for (const k of ['sweetgum', 'tuliptree', 'buckeye', 'dogwood', 'redbud', 'hickory', 'buroak']) expect(has(broadMix(at(lat, lon)), k), `${k} at ${lat},${lon}`).toBe(false);
    expect(has(broadMix(at(33.75, -84.39)), 'sweetgum')).toBe(true);
    expect(has(broadMix(at(35.6, -82.55)), 'tuliptree')).toBe(true); // the Appalachian coves'
    expect(has(broadMix(at(41.88, -87.63)), 'buroak')).toBe(true); // the Midwest's savannas'
    expect(has(broadMix(at(44.98, -93.27)), 'dogwood')).toBe(false); // (the north woods are past its range)
  });
  it("the sycamore over the East's creeks, the redcedar on its old fields, the dogwood and the redbud under its woods", () => {
    expect(bankMix(at(35.6, -82.55)).map(([k]) => k)).toContain('sycamore');
    expect(bankMix(at(47.6, -122.33)).map(([k]) => k)).toEqual(['willow']);
    expect(redcedarShare(at(36.37, -94.21))).toBeGreaterThan(0.4); // an Ozark glade
    expect(redcedarShare(at(39.74, -104.99))).toBe(0);
    expect(understoryTrees(at(35.6, -82.55)).map(([k]) => k).sort()).toEqual(['dogwood', 'redbud']);
    expect(understoryTrees(at(47.6, -122.33))).toEqual([]);
  });
});

// Package #5 (models.md build order 5): the swamps and the rivers
describe('package #5 by place (flora.ts swampMix, bankMix)', () => {
  const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
  const kinds = (p: ReturnType<typeof at>) => [...swampMix(p).mix, ...bankMix(p), ...broadMix(p)].filter(([, w]) => w > 0).map(([k]) => k);
  const NORTH_WEST: [number, number][] = [[42.36, -71.06], [44.48, -73.21], [40.74, -74.17], [41.88, -87.63], [44.98, -93.27], [46.88, -96.79], [47.6, -122.33], [45.52, -122.68], [37.77, -122.42], [39.74, -104.99], [33.45, -112.07], [40.76, -111.89]];
  it('the bald cypress only in the South\'s swamps and rivers, the Delta and the Chesapeake\'s south', () => {
    for (const [lat, lon] of NORTH_WEST) for (const k of ['baldcypress', 'pondcypress', 'tupelo']) expect(kinds(at(lat, lon)), `${k} at ${lat},${lon}`).not.toContain(k);
    // the Atchafalaya, the Okefenokee's coast, Houston's bayous, north Florida, the Hill Country's rivers
    for (const [lat, lon] of [[30.3, -91.7], [32.08, -81.09], [29.76, -95.37], [29.65, -82.32], [29.88, -98.8]]) expect(swampMix(at(lat, lon)).mix.map(([k]) => k), `${lat},${lon}`).toContain('baldcypress');
    // Florida's domes of pond cypress; the dwarf cypress only on South Florida's marl prairie
    expect(swampMix(at(29.65, -82.32)).mix[0][0]).toBe('pondcypress');
    expect(swampForm('pondcypress', 0.1, true, at(29.65, -82.32))).not.toBe(2);
    expect(swampForm('pondcypress', 0.1, true, at(25.9, -81.0))).toBe(2);
  });
  it("the cottonwood along the Plains' rivers, Fremont's down the Southwest's washes — never the other's", () => {
    const bank = (lat: number, lon: number) => bankMix(at(lat, lon)).map(([k]) => k);
    for (const [lat, lon] of [[41.26, -95.94], [39.05, -95.68], [39.74, -104.99], [41.88, -87.63]]) expect(bank(lat, lon), `${lat},${lon}`).toContain('cottonwood');
    for (const [lat, lon] of [[33.45, -112.07], [32.22, -110.97], [40.76, -111.89], [38.58, -121.49]]) expect(bank(lat, lon), `${lat},${lon}`).toContain('fremont');
    for (const [lat, lon] of [[33.45, -112.07], [47.6, -122.33], [42.36, -71.06]]) expect(bank(lat, lon), `${lat},${lon}`).not.toContain('cottonwood');
    for (const [lat, lon] of [[41.26, -95.94], [41.88, -87.63], [33.75, -84.39], [47.6, -122.33], [40.8, -124.16]]) expect(bank(lat, lon), `${lat},${lon}`).not.toContain('fremont');
  });
});

// Package #6 (models.md build order 6): California's oaks, its giants and its chaparral
describe('package #6 by place (flora.ts broadMix, coniferMix, redwoodCountry, sequoiaBand, manzanitaShare)', () => {
  const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
  const has = (m: [string, number][], k: string) => m.some(([kk, w]) => kk === k && w > 0);
  const ELSEWHERE: [number, number][] = [[47.6, -122.33], [45.52, -122.68], [42.19, -122.7], [39.74, -104.99], [33.45, -112.07], [40.76, -111.89], [42.36, -71.06], [33.75, -84.39], [29.76, -95.37], [41.88, -87.63], [35.6, -82.55]];
  it("California's oaks only in California: the valley oak on the valley floor, the blue oak round the foothills", () => {
    for (const [lat, lon] of ELSEWHERE) for (const k of ['valleyoak', 'blueoak', 'redwood', 'sequoia']) expect(has(broadMix(at(lat, lon)), k), `${k} at ${lat},${lon}`).toBe(false);
    expect(has(broadMix(at(38.58, -121.49)), 'valleyoak')).toBe(true); // Sacramento
    expect(has(broadMix(at(38.9, -121.08)), 'blueoak')).toBe(true); // Auburn, in the foothills
    expect(has(broadMix(at(35.63, -120.69)), 'blueoak')).toBe(true); // Paso Robles
    expect(has(broadMix(at(34.05, -118.24)), 'blueoak')).toBe(false); // (never Los Angeles's basin)
    // the coast live oak still the commonest oak of all the state's
    const sac = broadMix(at(38.58, -121.49)), w = (k: string) => sac.find(([kk]) => kk === k)?.[1] ?? 0;
    expect(w('coastoak')).toBeGreaterThan(w('blueoak'));
  });
  it('the coast redwood wild in its belt — the north coast, Muir Woods, the Santa Cruz Mountains, Big Sur — and nowhere else', () => {
    const wild = (lat: number, lon: number) => [20, 300, 800].flatMap((e) => [...coniferMix(at(lat, lon), 'pine', e, lat, false, caRedwoodBelt(lat, lon)), ...coniferMix(at(lat, lon), 'spruce', e, lat, false, caRedwoodBelt(lat, lon))].map(([k]) => k));
    for (const [lat, lon] of [[40.8, -124.16], [41.75, -124.2], [37.89, -122.57], [37.05, -122.1], [36.27, -121.81]]) expect(wild(lat, lon), `${lat},${lon}`).toContain('redwood');
    // not Sacramento's valley, Napa's, San Jose's, Fresno's, Los Angeles's, San Diego's — nor Oregon's or anywhere else
    for (const [lat, lon] of [[38.58, -121.49], [38.3, -122.29], [37.34, -121.89], [36.74, -119.79], [34.05, -118.24], [32.72, -117.16], ...ELSEWHERE]) expect(wild(lat, lon), `${lat},${lon}`).not.toContain('redwood');
    expect(redwoodCountry(at(40.8, -124.16), false)).toBe(true); // (the north coast whatever the belt says)
    expect(redwoodCountry(at(38.58, -121.49), true)).toBe(false); // (the valley never)
    // a grove's bare columns, a yard's young spires
    expect(westForm('redwood', 0.5, true)).toBe(1);
    expect(westForm('redwood', 0.1, true)).toBe(2);
    expect(westForm('redwood', 0.3, false)).toBe(0);
    expect(westForm('oak', 0.3, false)).toBe(-1);
  });
  it("the giant sequoia in the Sierra's band, 1,400–2,300 m on its west slope; the chaparral's manzanita", () => {
    expect(sequoiaBand(at(36.56, -118.75), 2000, 36.56)).toBe(true); // the Giant Forest
    expect(sequoiaBand(at(37.5, -119.6), 1900, 37.5)).toBe(true); // the Mariposa Grove
    expect(sequoiaBand(at(36.56, -118.75), 3000, 36.56)).toBe(false); // (above it)
    expect(sequoiaBand(at(36.56, -118.75), 900, 36.56)).toBe(false); // (below)
    expect(sequoiaBand(at(39.74, -105.5), 2000, 39.74)).toBe(false); // (the Rockies never)
    expect(coniferMix(at(36.56, -118.75), 'pine', 2000, 36.56).map(([k]) => k)).toContain('sequoia');
    expect(coniferMix(at(39.6, -120.5), 'pine', 2000, 39.6).map(([k]) => k)).not.toContain('sequoia'); // (north of the American's groves)
    expect(manzanitaShare(at(34.05, -118.24))).toBeGreaterThan(0.3); // the San Gabriels' chaparral over Los Angeles
    expect(manzanitaShare(at(38.9, -121.08))).toBeGreaterThan(0.3); // the foothills'
    expect(manzanitaShare(at(38.58, -121.49))).toBeLessThan(0.1); // (the valley floor's few)
    expect(manzanitaShare(at(34.54, -112.47))).toBeGreaterThan(0); // Prescott's pointleaf manzanita
    for (const [lat, lon] of [[47.6, -122.33], [42.36, -71.06], [33.75, -84.39], [41.88, -87.63]]) expect(manzanitaShare(at(lat, lon)), `${lat},${lon}`).toBe(0);
  });
});

// Package #7 (models.md build order 7): the desert, the piñon-juniper and the sagebrush sea
describe('package #7 by place (flora.ts desertMix, desertTrees, pjBand, coniferMix)', () => {
  const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
  const kinds = (lat: number, lon: number, elev: number) => [...desertMix(at(lat, lon), elev, lat), ...desertTrees(at(lat, lon), elev, lat)].filter(([, w]) => w > 0).map(([k]) => k);
  const EAST_WEST: [number, number][] = [[42.36, -71.06], [33.75, -84.39], [41.88, -87.63], [47.6, -122.33], [45.52, -122.68], [37.77, -122.42], [29.95, -90.07], [44.98, -93.27], [35.6, -82.55]];
  it("the saguaro only in Arizona's Sonoran desert; the Joshua tree only in the Mojave's band", () => {
    expect(kinds(32.22, -110.97, 750)).toContain('saguaro'); // Tucson
    expect(kinds(33.45, -112.07, 340)).toContain('saguaro'); // Phoenix
    expect(kinds(33.83, -116.55, 150)).not.toContain('saguaro'); // Palm Springs: the Colorado Desert, California's
    expect(kinds(32.22, -110.97, 1500)).not.toContain('saguaro'); // (above its frost line)
    expect(kinds(34.13, -116.31, 1200)).toContain('joshua'); // Joshua Tree's high desert
    expect(kinds(36.17, -115.14, 900)).toContain('joshua'); // the Las Vegas valley's edge
    expect(kinds(33.83, -116.55, 150)).not.toContain('joshua'); // (the low desert)
    expect(kinds(32.22, -110.97, 750)).not.toContain('joshua');
    // the warm deserts' creosote; El Paso's Chihuahuan ocotillo and prickly pear
    for (const [lat, lon, e] of [[32.22, -110.97, 750], [36.17, -115.14, 650], [31.76, -106.49, 1140]] as [number, number, number][]) expect(kinds(lat, lon, e), `${lat},${lon}`).toContain('creosote');
    expect(kinds(31.76, -106.49, 1140)).toContain('ocotillo');
    // none of it in the East, the Northwest's west side, the Bay
    for (const [lat, lon] of EAST_WEST) expect(kinds(lat, lon, 200), `${lat},${lon}`).toEqual([]);
  });
  it('the sagebrush sea in the basins; the piñon-juniper in its band, below the ponderosa', () => {
    expect(kinds(39.53, -119.81, 1400)).toContain('sagebrush'); // Reno
    expect(kinds(40.83, -115.76, 1550)).toContain('sagebrush'); // Elko
    // Santa Fe's piñon and juniper; Prescott's; never on the basin floor nor up in Flagstaff's pines
    const pines = (lat: number, lon: number, elev: number) => coniferMix(at(lat, lon), 'pine', elev, lat).map(([k]) => k);
    expect(pines(35.69, -105.94, 2150)).toContain('pinyon');
    expect(pines(34.54, -112.47, 1650)).toContain('pinyon');
    expect(pines(35.2, -111.65, 2100)).not.toContain('pinyon');
    expect(pines(35.2, -111.65, 2100)).toContain('ponderosa');
    expect(pjBand(at(39.53, -119.81), 39.53)!.lo).toBeGreaterThan(1400);
    for (const [lat, lon] of EAST_WEST) expect(pines(lat, lon, 1800), `${lat},${lon}`).not.toContain('pinyon');
    // the Great Basin's towns grow planted shade trees, not the Sonoran's mesquite
    expect(broadMix(at(39.53, -119.81)).map(([k]) => k)).not.toContain('mesquite');
    // the Hill Country's Ashe juniper, not Dallas's or Houston's
    expect(broadMix(at(30.27, -98.87)).map(([k]) => k)).toContain('ashejuniper');
    for (const [lat, lon] of [[32.78, -96.8], [29.76, -95.37], [33.75, -84.39]]) expect(broadMix(at(lat, lon)).map(([k]) => k), `${lat},${lon}`).not.toContain('ashejuniper');
  });
});

// Package #8 (models.md build order 8): the palms and the palmettos
describe('package #8 by place (flora.ts broadMix, palmMix, palmettoShare)', () => {
  const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
  const has = (m: [string, number][], k: string) => m.some(([kk, w]) => kk === k && w > 0);
  const COLD: [number, number][] = [[42.36, -71.06], [41.88, -87.63], [47.6, -122.33], [39.74, -104.99], [44.98, -93.27], [35.6, -82.55], [36.16, -86.78]];
  it("the cabbage palmetto on the Southeast's coast, in Florida and on the Gulf; the royal palm South Florida's alone", () => {
    for (const [lat, lon] of [[32.78, -79.93], [32.08, -81.09], [27.95, -82.46], [29.95, -90.07], [29.76, -95.37]]) expect(has(broadMix(at(lat, lon)), 'sabal'), `${lat},${lon}`).toBe(true);
    for (const [lat, lon] of [[33.75, -84.39], [35.78, -78.64], ...COLD]) for (const k of ['sabal', 'royalpalm', 'queenpalm', 'canarypalm']) expect(has(broadMix(at(lat, lon)), k), `${k} at ${lat},${lon}`).toBe(false);
    expect(has(broadMix(at(27.95, -82.46)), 'royalpalm')).toBe(false); // (Tampa: too cold for it)
    expect(has(palmMix(at(25.76, -80.19), 'tropical'), 'royalpalm')).toBe(true); // Miami's
    expect(has(palmMix(at(34.05, -118.24), 'dry'), 'queenpalm')).toBe(true); // Los Angeles's planted palms
    expect(palmMix(at(36.17, -115.14), 'dry')[0][0]).toBe('fanpalm'); // Las Vegas's
  });
  it("planted palms only where the winter lets them: Phoenix, Las Vegas, Los Angeles and Sacramento, not Reno or Albuquerque", () => {
    for (const [lat, lon, e] of [[33.45, -112.07, 340], [36.17, -115.14, 620], [34.05, -118.24, 90], [38.58, -121.49, 10]] as [number, number, number][]) expect(meanTemp(lat, lon, e, 20), `${lat},${lon}`).toBeGreaterThan(3.5);
    for (const [lat, lon, e] of [[39.53, -119.81, 1370], [35.08, -106.65, 1620], [39.74, -104.99, 1610]] as [number, number, number][]) expect(meanTemp(lat, lon, e, 20), `${lat},${lon}`).toBeLessThan(3.5);
  });
  it('saw palmetto under the southern pines: Florida, the Georgia and Carolina coast, the Gulf; never inland or north', () => {
    for (const [lat, lon] of [[29.65, -82.32], [28.54, -81.38], [30.44, -84.28], [32.08, -81.09]]) expect(palmettoShare(at(lat, lon), true), `${lat},${lon}`).toBeGreaterThan(0.4);
    for (const [lat, lon] of [[33.75, -84.39], [35.78, -78.64], [32.78, -96.8], ...COLD]) expect(palmettoShare(at(lat, lon), true), `${lat},${lon}`).toBe(0);
  });
});

describe('package #4 in the woods (a mapped wood, built)', () => {
  const wood = async (lat: number, lon: number, cls = 'wood') => {
    setActiveStyle(regionStyle(lat, lon));
    const sq = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 },
      origin: { lat, lon }, slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 },
      landmarks: [], buildings: [], roads: [], lines: [], points: [],
      areas: [{ c: cls, o: [sq(10, 10, 240, 240)], i: [] }],
    } as unknown as TileJson;
    const built = await buildTile(tj, virtualRegion([lat, lon]).terrain, { id: 'w0_0', box: tj.box, lod: 0, file: '', world: 1 }, 0);
    const out: Record<string, number[]> = {}; // 'kind:variant' → heights
    for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
      if (!o.n?.startsWith('trees:') || !o.im) continue;
      const [, kind, v] = o.n.split(':'), mh = treeMeta(kind as TreeKind, +v || 0).h, q = (out[`${kind}:${+v || 0}`] ??= []);
      for (let i = 0; i + 15 < o.im.length; i += 16) q.push(Math.hypot(o.im[i + 4], o.im[i + 5], o.im[i + 6]) * mh);
    }
    return out;
  };
  const count = (w: Record<string, number[]>, kind: string) => Object.entries(w).filter(([k]) => k.split(':')[0] === kind).reduce((s, [, h]) => s + h.length, 0);
  it("an Appalachian cove: tulip trees and hickories, tall; dogwoods, redbuds and rosebay under them", async () => {
    const w = await wood(35.6, -82.55);
    expect(count(w, 'tuliptree') + count(w, 'hickory') + count(w, 'buckeye')).toBeGreaterThan(0);
    for (const h of [...(w['tuliptree:0'] ?? []), ...(w['tuliptree:1'] ?? []), ...(w['tuliptree:2'] ?? [])]) expect(h).toBeGreaterThan(20); // (a cove's tulip trees tower)
    expect(count(w, 'dogwood') + count(w, 'redbud') + count(w, 'rosebay')).toBeGreaterThan(0);
    for (const k of ['dogwood:0', 'dogwood:1', 'dogwood:2', 'redbud:0', 'redbud:1', 'redbud:2']) for (const h of w[k] ?? []) expect(h).toBeLessThan(10); // (small trees stay small)
    for (const k of ['loblolly', 'longleaf', 'slashpine', 'crapemyrtle']) expect(count(w, k), k).toBe(0);
  }, 60000);
  it("a north coast wood: the coast redwood's grove, tall; no eastern trees", async () => {
    const w = await wood(40.75, -124.0);
    expect(count(w, 'redwood')).toBeGreaterThan(0);
    // (the grove's columns: most of them past 44 m — the few out on the tile's open margin, past the
    // mapped wood, a yard's)
    const cols = [...(w['redwood:1'] ?? []), ...(w['redwood:2'] ?? [])];
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.filter((h) => h > 44).length / cols.length).toBeGreaterThan(0.6);
    for (const k of ['tuliptree', 'sweetgum', 'loblolly', 'whitepine', 'sequoia', 'blueoak']) expect(count(w, k), k).toBe(0);
  }, 60000);
  it('a Florida flatwoods: longleaf and slash pine over saw palmetto', async () => {
    const w = await wood(29.6, -82.45);
    expect(count(w, 'sawpalmetto')).toBeGreaterThan(0);
    expect(count(w, 'longleaf') + count(w, 'slashpine')).toBeGreaterThan(0);
    expect(count(w, 'sawpalmetto')).toBeGreaterThan(count(w, 'shrub') * 0.8); // (the palmetto most of the flatwoods' shrubs; gallberry and wax myrtle the rest)
    for (const k of ['rosebay', 'sagebrush', 'manzanita']) expect(count(w, k), k).toBe(0);
  }, 60000);
  it("a Sonoran scrub near Tucson: saguaros, chollas, creosote and the rest; no eastern trees, no pitch pine", async () => {
    const w = await wood(32.3, -111.1, 'scrub');
    expect(count(w, 'saguaro') + count(w, 'creosote') + count(w, 'cholla')).toBeGreaterThan(0);
    for (const k of ['pine', 'tuliptree', 'sweetgum', 'whitepine', 'joshua', 'sagebrush']) expect(count(w, k), k).toBe(0);
    for (const h of [...(w['saguaro:1'] ?? []), ...(w['saguaro:2'] ?? [])]) expect(h).toBeGreaterThan(6.5);
  }, 60000);
  it('a Sandhills pine wood: longleaf over its grass stages and bottlebrushes, loblolly; no northern pines', async () => {
    const w = await wood(35.05, -78.88);
    expect(count(w, 'longleaf')).toBeGreaterThan(0);
    expect(count(w, 'loblolly')).toBeGreaterThan(0);
    for (const h of w['longleaf:0'] ?? []) expect(h).toBeLessThan(1); // the grass stage
    for (const h of w['longleaf:2'] ?? []) expect(h).toBeGreaterThan(20); // the old trees
    expect((w['longleaf:0']?.length ?? 0) + (w['longleaf:1']?.length ?? 0)).toBeGreaterThan(0);
    for (const k of ['whitepine', 'ponderosa', 'lodgepole', 'redspruce', 'rosebay']) expect(count(w, k), k).toBe(0);
  }, 60000);
});
