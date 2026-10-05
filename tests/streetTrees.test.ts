import { describe, it, expect, beforeAll } from 'vitest';
import { type TileJson } from '../src/world/data';
import { virtualRegion } from '../src/world/virtual';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { buildTile } from '../src/world/tileBuild';
import { treeMeta, coniferMix, aspenShare, snagShare, type TreeKind } from '../src/assets/flora';
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
