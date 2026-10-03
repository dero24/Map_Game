import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Terrain, TerrainLayer, type TileJson, type TileSpec } from '../src/world/data';
import { buildTile } from '../src/world/tileBuild';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { storeysOf } from '../src/world/interior/plan';
import type { Rec } from '../src/world/lidar';
import type { BuiltTile } from '../src/world/pack';

// Phone / desktop parity (the measured-heights goal: every building its real height on every device,
// the same on a PC and a phone). On the baked shore with its sidecar, Bain's Hardware's cell and a
// Monmouth Beach cell go through enrichTile as a phone (`initLidar(…, false)`: it never reads a
// survey) and as a desktop (`true`: it reads one only for what a record lacks — and with the
// sidecar complete, nothing), then through the real builder: every building's wall top and storeys
// (the interior planner's count, plan.ts `storeysOf`) must be the same. No network: a desktop that
// tried to read the survey would find fetch failing, and the test says so.

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

type ReadFile = { (p: URL, enc: 'utf8'): string; (p: URL): Uint8Array };
let readFileSync: ReadFile;
const R = new URL('../public/data/shore/', import.meta.url);
let man: { origin: { lat: number; lon: number }; tiles: TileSpec[]; terrain: { slice: never; backdrop: never } };
let terrain: Terrain;
const fetches: string[] = [];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas;
  globalThis.fetch = (async (u: string) => { fetches.push(String(u)); throw new TypeError('no network in this test'); }) as typeof fetch;
  setActiveStyle(regionStyle(40.36, -73.98));
  readFileSync = ((await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync: ReadFile }).readFileSync;
  man = JSON.parse(readFileSync(new URL('manifest.json', R), 'utf8'));
  const buf = readFileSync(new URL('terrain.bin', R));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  terrain = new Terrain(new TerrainLayer(ab, man.terrain.slice), new TerrainLayer(ab, man.terrain.backdrop));
});
afterAll(() => void (globalThis.fetch = realFetch));

type Seen = { x: number; z: number; kind: string; wall: number; storeys: number; pitched: boolean };
// One cell built as one device builds it: `measure` (a desktop) or not (a phone); `sidecar` or not.
async function built(id: string, measure: boolean, sidecar = true): Promise<{ e: string; seen: Seen[]; tile: BuiltTile }> {
  vi.resetModules(); // (a fresh lidar.ts each time: nothing remembered from the other device's build)
  const L = await import('../src/world/lidar');
  L.initLidar(man.origin, measure);
  const spec = man.tiles.find((t) => t.id === id)!;
  const tj = JSON.parse(readFileSync(new URL(spec.file!, R), 'utf8')) as TileJson;
  const rec = (JSON.parse(readFileSync(new URL(`measured/${id}.json`, R), 'utf8')) as { rec: Rec }).rec;
  const e = await L.enrichTile(tj, spec.box, null, true, sidecar ? () => Promise.resolve(rec) : undefined);
  const tile = await buildTile(tj, terrain, spec, 0);
  const seen = tile.fps.map((f) => {
    let x = 0, z = 0;
    for (const [px, pz] of f.ring) (x += px), (z += pz);
    return { x: +(x / f.ring.length).toFixed(2), z: +(z / f.ring.length).toFixed(2), kind: f.kind, wall: +(f.top - f.base).toFixed(2), storeys: storeysOf(f.kind, f.top, f.floor0), pitched: !!f.pitched };
  });
  return { e, seen, tile };
}
const at = (seen: Seen[], tile: BuiltTile, x: number, z: number) => {
  const inRing = (r: [number, number][]) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
  const i = tile.fps.findIndex((f) => inRing(f.ring as [number, number][]));
  return seen[i];
};

describe('phone / desktop parity on the measured shore', () => {
  it('Bain\'s Hardware\'s cell: every building the same height and storeys on both; Bain\'s measured', async () => {
    const phone = await built('0_-1', false), desk = await built('0_-1', true), before = await built('0_-1', false, false);
    expect(phone.e).toBe('done');
    expect(desk.e).toBe('done');
    expect(fetches).toEqual([]); // (the desktop read no survey: the sidecar covers the cell)
    expect(phone.seen.length).toBeGreaterThan(50);
    expect(desk.seen).toEqual(phone.seen);
    // Bain's (NJ MOD-IV 1092 Ocean Ave, "3SB"): the survey's 12.1 m flat block on both
    const b = at(phone.seen, phone.tile, 96, -13.5);
    expect(b.wall).toBeGreaterThan(12);
    expect(b.wall).toBeLessThan(13);
    expect(b.pitched).toBe(false);
    expect(b.storeys).toBeGreaterThanOrEqual(3);
    // …where a phone without the sidecar stood it two storeys under a hip roof (Robby's report)
    const was = at(before.seen, before.tile, 96, -13.5);
    expect(was.storeys).toBe(2);
    expect(was.pitched).toBe(true);
  }, 180000);
  it('a Monmouth Beach cell: every house the same on both, and two storeys where the survey says so', async () => {
    const phone = await built('-1_2', false), desk = await built('-1_2', true), before = await built('-1_2', false, false);
    expect(fetches).toEqual([]);
    expect(desk.seen).toEqual(phone.seen);
    const houses = phone.seen.filter((s) => s.kind === 'house');
    expect(houses.length).toBeGreaterThan(150);
    // the house Robby's report is about (-1_2 #42: measured 9.9 m, the pack's ML height 4.7 m)
    expect(at(phone.seen, phone.tile, -756.1, 2542.2).storeys).toBe(2);
    expect(at(before.seen, before.tile, -756.1, 2542.2).storeys).toBe(1);
    // and the cell as a whole: houses of two storeys and up, measured or borrowed from measured neighbours
    const two = (s: Seen[]) => s.filter((h) => h.kind === 'house' && h.storeys >= 2).length / s.filter((h) => h.kind === 'house').length;
    expect(two(phone.seen)).toBeGreaterThan(two(before.seen) + 0.2);
  }, 180000);
});
