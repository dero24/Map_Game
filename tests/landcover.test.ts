// The land the map is silent on, from ESA WorldCover (src/world/landcover.ts): the tile service reads a
// cell's classes once (worker/src/landcover.js) and the tile carries them on an 8 m grid; the game lays
// them under the map's own areas (dem.ts coverPatch) and its tree scan grows WorldCover's woods
// (2026-10-08, Robby: "olympic peninsula is pretty bare, like ruby beach … is there even beaches where
// there's supposed to be beaches"). Ruby Beach's cell had two car parks and the sea: grass to the water.
import { describe, it, expect, beforeAll } from 'vitest';
import { landCoverGrid, landCoverAt, landCoverBytes, LC_CELL, LC_OVER, type LandCover } from '../src/world/landcover';
import { demLayer, coverPatch, flatDem } from '../src/world/dem';
import { TerrainLayer, type Area, type TileJson } from '../src/world/data';
import { makeProjector } from '../src/world/realTile';
import { virtualRegion } from '../src/world/virtual';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { buildTile } from '../src/world/tileBuild';

const m = (v: number) => Math.round(v * 10);
const rect = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
const area = (c: string, r: number[]): Area => ({ c, o: [r], i: [] });
// a grid over a box from a class function of the local frame (the service's sampling, in the region's own metres)
const lcOf = (box: { x0: number; z0: number; x1: number; z1: number }, cls: (x: number, z: number) => number): LandCover => {
  const origin = { lat: 47.7, lon: -124.4 }, P = makeProjector(origin);
  return landCoverGrid(box, P.unproject, (lat, lon) => { const [x, z] = P.project(lat, lon); return cls(x, z); })!;
};

describe('the land cover a tile carries', () => {
  it('an 8 m grid over the cell and its ground\'s overhang, the class at each middle; none for a cell of only water', () => {
    const box = { x0: 0, z0: 0, x1: 1024, z1: 1024 };
    // the forest east of x 600, the sand from 560 to 600, the sea west of it
    const lc = lcOf(box, (x) => (x > 600 ? 10 : x > 560 ? 60 : 80));
    expect([lc.x0, lc.z0, lc.cell, lc.w, lc.h]).toEqual([-LC_OVER, -LC_OVER, LC_CELL, (1024 + 2 * LC_OVER) / LC_CELL, (1024 + 2 * LC_OVER) / LC_CELL]);
    expect(landCoverAt(lc, 800, 500)).toBe(10);
    expect(landCoverAt(lc, 580, 500)).toBe(60);
    expect(landCoverAt(lc, 100, 500)).toBe(80);
    expect(landCoverAt(lc, -2000, 500)).toBe(0); // (off the grid)
    expect(landCoverBytes(lc).length).toBe(lc.w * lc.h);
    expect(lcOf(box, () => 80)).toBeNull(); // (the open sea: the map's water says it all)
    expect(lcOf(box, () => 0)).toBeNull(); // (past the data)
  });
  it("how much of the cell is water or past the data: the tile service's cue that a cell with no coast through it is out in a bay", () => {
    const box = { x0: 0, z0: 0, x1: 1024, z1: 1024 }, origin = { lat: 47.7, lon: -124.4 }, P = makeProjector(origin);
    const wet = (cls: (x: number, z: number) => number) => {
      const stats = { wet: -1 };
      landCoverGrid(box, P.unproject, (lat, lon) => { const [x, z] = P.project(lat, lon); return cls(x, z); }, LC_CELL, LC_OVER, stats);
      return stats.wet;
    };
    expect(wet(() => 80)).toBe(1); expect(wet(() => 0)).toBe(1); expect(wet(() => 10)).toBe(0);
    expect(wet((x) => (x < 512 ? 80 : 30))).toBeCloseTo(0.5, 2);
    // (the overhang doesn't count: the sea round a dry cell's edge)
    expect(wet((x, z) => (x < 0 || z < 0 || x > 1024 || z > 1024 ? 80 : 30))).toBe(0);
  });

  it("laid under the map's areas: WorldCover's woods, sand, fields and marsh where the map is silent; the map's own over them — but a mapped lawn not over its trees", () => {
    const nx = 100, nz = 50, L = demLayer({ heights: new Float32Array(nx * nz).fill(3), x0: 0, z0: 0, pitch: 4, nx, nz });
    // WorldCover: trees west of x 100, cropland to 200, sand to 260, built-up to 340, water beyond
    const lc = lcOf({ x0: 0, z0: 0, x1: 400, z1: 200 }, (x) => (x < 100 ? 10 : x < 200 ? 40 : x < 260 ? 60 : x < 340 ? 50 : 80));
    coverPatch(L, [area('grass', rect(20, 20, 80, 80)), area('grass', rect(270, 20, 330, 80)), area('pitch', rect(20, 120, 80, 180)), area('wood', rect(120, 20, 180, 80))], lc);
    const T = new TerrainLayer(L.buf, L.layout);
    expect(T.coverAt(50, 100)).toBe(10); // WorldCover's woods
    expect(T.coverAt(50, 50)).toBe(10); // (a mapped park over them: a park's trees are trees)
    expect(T.coverAt(50, 150)).toBe(30); // (a pitch is open, whatever grew there)
    expect(T.coverAt(150, 100)).toBe(40); // WorldCover's fields
    expect(T.coverAt(150, 50)).toBe(10); // (the map's wood over them)
    expect(T.coverAt(230, 100)).toBe(60); // the sand
    expect(T.coverAt(300, 100)).toBe(50); // built-up
    expect(T.coverAt(300, 50)).toBe(30); // (a mapped park over built-up ground: its lawn)
    expect(T.coverAt(370, 100)).toBe(30); // (WorldCover's water isn't the water: the ground as it was)
    // and without one, as before: a mapped lawn is a lawn
    const L2 = demLayer({ heights: new Float32Array(nx * nz).fill(3), x0: 0, z0: 0, pitch: 4, nx, nz });
    coverPatch(L2, [area('grass', rect(20, 20, 80, 80))]);
    expect(new TerrainLayer(L2.buf, L2.layout).coverAt(50, 50)).toBe(30);
  });
});

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

describe("WorldCover's woods grow a forest", () => {
  it("a streamed cell the map draws no wood on, WorldCover's trees over its east half: a forest there — the Olympic coast's conifers — and open ground west of it", async () => {
    const at: [number, number] = [47.71, -124.41]; // (Ruby Beach)
    setActiveStyle(regionStyle(at[0], at[1]));
    const box = { x0: 0, z0: 0, x1: 256, z1: 256 };
    const terrain = virtualRegion(at).terrain;
    // the cell's ground as the tile worker lays it: its grid, then the cover under the map's areas
    const L = demLayer(flatDem(box, (x, z) => Math.max(4, terrain.heightAt(x, z)), 4));
    const lc = lcOf(box, (x) => (x > 128 ? 10 : 30));
    coverPatch(L, [], lc);
    terrain.registerPatch('0_0', new TerrainLayer(L.buf, L.layout));
    const tj = {
      version: 1, id: '0_0', lod: 0, box, origin: { lat: at[0], lon: at[1] }, slice: box, backdrop: box,
      landmarks: [], buildings: [], roads: [], lines: [], points: [], areas: [], lc,
    } as unknown as TileJson;
    const built = await buildTile(tj, terrain, { id: 'w0_0', box, lod: 0, file: '', world: 1 }, 0);
    let east = 0, west = 0;
    const kinds = new Set<string>();
    for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
      if (!o.n?.startsWith('trees:') || !o.im) continue;
      for (let i = 0; i + 15 < o.im.length; i += 16) {
        const x = o.im[i + 12];
        if (x > 140) (east++, kinds.add(o.n.split(':')[1]));
        else if (x < 116) west++;
      }
    }
    // (the forest scan's 85% of a 9 m cell: ~380 in the east half's 1.4 thousand cells, less the coast's)
    expect(east).toBeGreaterThan(200);
    expect(west).toBeLessThan(east / 6);
    expect([...kinds].some((k) => ['sitka', 'fir', 'hemlock', 'cedar'].includes(k))).toBe(true); // (the westside's own)
    terrain.removePatch('0_0');
  }, 60000);
});

describe("the survey's forest, filled", () => {
  it("under the survey, where WorldCover sees a forest, the woods between the measured crowns are the scan's — never inside a crown's reach; without WorldCover, the survey as it is", async () => {
    // (the Hoh's old growth: 3.6–5.2 thousand measured crowns a square kilometre, ~4 m across the middle — a
    // quarter of the ground under them, sparse spires over grass)
    const at: [number, number] = [47.86, -123.93];
    setActiveStyle(regionStyle(at[0], at[1]));
    const box = { x0: 0, z0: 0, x1: 256, z1: 256 };
    const build = async (withLc: boolean) => {
      const terrain = virtualRegion(at).terrain;
      const L = demLayer(flatDem(box, (x, z) => Math.max(4, terrain.heightAt(x, z)), 4));
      const lc = lcOf(box, () => 10);
      coverPatch(L, [], withLc ? lc : undefined);
      terrain.registerPatch('0_0', new TerrainLayer(L.buf, L.layout));
      // a measured crown every 24 m: 30 m tall, 4 m across
      const trees: number[] = [];
      for (let x = 12; x < 256; x += 24) for (let z = 12; z < 256; z += 24) trees.push(m(x), m(z), m(30), m(4));
      const tj = {
        version: 1, id: '0_0', lod: 0, box, origin: { lat: at[0], lon: at[1] }, slice: box, backdrop: box,
        landmarks: [], buildings: [], roads: [], lines: [], points: [], areas: [], trees, treeCov: Array(256).fill(1), ...(withLc ? { lc } : {}),
      } as unknown as TileJson;
      const built = await buildTile(tj, terrain, { id: 'w0_0', box, lod: 0, file: '', world: 1 }, 0);
      const pts: [number, number][] = [];
      for (const o of built.objs as { n?: string; im?: Float32Array }[]) {
        if (!o.n?.startsWith('trees:') || !o.im) continue;
        for (let i = 0; i + 15 < o.im.length; i += 16) pts.push([o.im[i + 12], o.im[i + 14]]);
      }
      return { pts, crowns: trees.length / 4 };
    };
    const filled = await build(true), bare = await build(false);
    expect(bare.pts.length).toBe(bare.crowns); // (the survey's own, no more)
    expect(filled.pts.length).toBeGreaterThan(filled.crowns * 2.5); // (the woods between them)
    // none of the scan's in a measured crown's reach (its 4 m and 2.5 more): the crowns themselves at the 24 m lattice
    const gaps = filled.pts.filter(([x, z]) => Math.hypot(((x - 12) % 24 + 24) % 24, 0) > 0.5 || Math.hypot(((z - 12) % 24 + 24) % 24, 0) > 0.5);
    for (const [x, z] of gaps) {
      const cx = 12 + Math.round((x - 12) / 24) * 24, cz = 12 + Math.round((z - 12) / 24) * 24;
      expect(Math.hypot(x - cx, z - cz), `${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(6.4);
    }
  }, 60000);
});
