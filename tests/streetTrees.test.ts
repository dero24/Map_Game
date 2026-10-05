import { describe, it, expect, beforeAll } from 'vitest';
import { type TileJson } from '../src/world/data';
import { virtualRegion } from '../src/world/virtual';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { buildTile } from '../src/world/tileBuild';
import { treeMeta, type TreeKind } from '../src/assets/flora';

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
