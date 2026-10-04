import { describe, expect, it, beforeAll } from 'vitest';
import { Terrain, TerrainLayer, type TileJson, type TileSpec } from '../src/world/data';
import { buildTile } from '../src/world/tileBuild';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { makeProjector } from '../src/world/realTile';
import { virtualRegion } from '../src/world/virtual';
import towns from '../tools/audit48-towns.json';

// The must-load towns (docs/GAMEPLAY_VISION.md §17, Tier 0): every town on the fixed list builds its
// spawn cell with land under the spawn, streets, buildings and trees. The streamed towns' cells are
// tests/fixtures/towns/*.tile.json.gz — each assembled from our own OSM extract exactly as the tile
// service does (tools/must-load.mjs --fixtures); a baked town reads its region's pack. Built through
// the real builder on the virtual regions' flat ground: at least half the cell's own mapped buildings must
// stand and some trees grow (a builder change that loses a town's buildings or trees fails here).
// The deployed service answering these towns live is tools/must-load.mjs --live (CI, every push).
type Fix = { id: string; name: string; kind: string; at: [number, number]; origin: { lat: number; lon: number }; spawn: [number, number]; cell: [number, number]; tile: TileJson };
class StubCtx {
  canvas: unknown; fillStyle = ''; strokeStyle = ''; lineWidth = 1; lineCap = ''; lineJoin = ''; globalCompositeOperation = ''; textBaseline = ''; font = '';
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
const must = (towns as unknown as { towns: { id: string; name: string; mustLoad?: boolean; at: [number, number] }[] }).towns.filter((t) => t.mustLoad);
const fixtures = new Map<string, Fix>();
let shore: { origin: { lat: number; lon: number }; backdrop: { x0: number; z0: number; x1: number; z1: number }; tiles: TileSpec[]; terrain: { slice: never; backdrop: never } };
let shoreTerrain: Terrain;
type FS = { readdirSync(p: URL): string[]; readFileSync(p: URL, enc?: 'utf8'): Uint8Array & string };
let fs: FS;
beforeAll(async () => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas;
  fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as FS;
  const zlib = (await import(/* @vite-ignore */ `node:${'zlib'}`)) as { gunzipSync(b: Uint8Array): Uint8Array };
  const dir = new URL('./fixtures/towns/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.tile.json.gz'))) {
    const j = JSON.parse(new TextDecoder().decode(zlib.gunzipSync(fs.readFileSync(new URL(f, dir))))) as Fix;
    fixtures.set(j.id, j);
  }
  const R = new URL('../public/data/shore/', import.meta.url);
  shore = JSON.parse(fs.readFileSync(new URL('manifest.json', R), 'utf8'));
  const buf = fs.readFileSync(new URL('terrain.bin', R));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  shoreTerrain = new Terrain(new TerrainLayer(ab, shore.terrain.slice), new TerrainLayer(ab, shore.terrain.backdrop));
});

const inPoly = (r: number[], x: number, z: number) => {
  let ins = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i] / 10, zi = r[i + 1] / 10, xj = r[j] / 10, zj = r[j + 1] / 10;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
};
const inWater = (tj: TileJson, x: number, z: number) => tj.areas.some((a) => a.c === 'water' && a.o.some((r) => inPoly(r, x, z)) && !a.i.some((r) => inPoly(r, x, z)));
const treesOf = (objs: { n?: string; im?: Float32Array }[]) => objs.reduce((n, o) => n + (o.n?.startsWith('trees:') && o.im ? o.im.length / 16 : 0), 0);

describe('the must-load towns build with land, streets, buildings and trees', () => {
  it('every must-load town has its cell (a fixture, or the baked pack)', () => {
    const P = makeProjector(shore.origin);
    const missing = must.filter((t) => {
      if (fixtures.has(t.id)) return false;
      const [x, z] = P.project(t.at[0], t.at[1]);
      const b = shore.backdrop;
      return !(x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
    });
    expect(missing.map((t) => t.id)).toEqual([]);
    expect(must.length).toBeGreaterThanOrEqual(8);
  });
  for (const t of must) {
    it(t.name, async () => {
      const f = fixtures.get(t.id);
      let tj: TileJson, spec: TileSpec, terrain: Terrain, sx: number, sz: number;
      if (f) {
        setActiveStyle(regionStyle(t.at[0], t.at[1]));
        tj = f.tile;
        terrain = virtualRegion(t.at).terrain;
        [sx, sz] = f.spawn;
        spec = { id: `w${f.cell[0]}_${f.cell[1]}`, box: tj.box, lod: 0, file: '', world: 1 };
      } else {
        // a baked town: the shore pack's tile under the spawn
        setActiveStyle(regionStyle(t.at[0], t.at[1]));
        [sx, sz] = makeProjector(shore.origin).project(t.at[0], t.at[1]);
        spec = shore.tiles.find((s) => sx >= s.box.x0 && sx < s.box.x1 && sz >= s.box.z0 && sz < s.box.z1)!;
        tj = JSON.parse(fs.readFileSync(new URL(`../public/data/shore/${spec.file}`, import.meta.url), 'utf8'));
        terrain = shoreTerrain;
      }
      expect(tj.buildings.length, `${t.name}: buildings in the data`).toBeGreaterThan(5);
      expect(tj.roads.filter((r) => !r.lod).length, `${t.name}: streets`).toBeGreaterThan(5);
      expect(inWater(tj, sx, sz), `${t.name}: the spawn is on land`).toBe(false);
      const built = await buildTile(tj, terrain, spec, 0);
      const trees = treesOf(built.objs);
      // (the cell's own outlines: a tile also carries its neighbours' buildings for context, which they
      // build, and the parts a tower is drawn by, which have no footprint of their own)
      const own = tj.buildings.filter((b) => b.own === undefined && !b.pt).length;
      expect(built.fps.length, `${t.name}: buildings built (of ${own} its own)`).toBeGreaterThan(Math.floor(own * 0.5));
      expect(trees, `${t.name}: trees`).toBeGreaterThan(0);
    }, 120000);
  }
});
