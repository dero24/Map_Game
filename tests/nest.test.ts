import { describe, it, expect, beforeAll } from 'vitest';
import { nestBuildings } from '../src/world/nest';
import type { Building } from '../src/world/data';
import { Terrain, TerrainLayer } from '../src/world/data';
import { buildTile } from '../src/world/tileBuild';
// @ts-expect-error plain js lib
import { packToBin } from '../scripts/lib/tiles.mjs';

const m = (v: number) => Math.round(v * 10);
const rect = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
const b = (r: number[], h: number, extra: Partial<Building> = {}): Building => ({ r, h, k: 'large', roof: 'flat', s: 7, ...extra });

describe('buildings inside buildings (nest.ts)', () => {
  it('a wedding-cake tower mapped tier by tier from the ground stands as one stack of tiers', () => {
    // three tiers from the ground, sharing their south facade (the flicker: coplanar walls 0–22 m)
    const bs = [b(rect(0, 0, 60, 40), 22, { pt: 1 }), b(rect(10, 10, 50, 40), 60, { pt: 1 }), b(rect(20, 20, 40, 40), 115, { pt: 1 })];
    expect(nestBuildings(bs)).toBe(2);
    expect(bs[0].lf ?? 0).toBe(0);
    expect(bs[0].h).toBe(22);
    expect([bs[1].lf, bs[1].h, bs[1].po]).toEqual([22, 38, 0]); // on the podium's roof, its part
    expect([bs[2].lf, bs[2].h, bs[2].po]).toEqual([60, 55, 0]); // on the middle tier's, one building
    expect(bs[2].lf! + bs[2].h).toBe(115); // (the top where the map put it)
    // a second pass (a rebuild of the same tile) changes nothing
    const snap = JSON.stringify(bs);
    expect(nestBuildings(bs)).toBe(0);
    expect(JSON.stringify(bs)).toBe(snap);
  });

  it('a building mapped twice, or one inside a taller one: hidden inside, never a second set of walls', () => {
    const twins = [b(rect(0, 0, 20, 20), 12), b(rect(0, 0, 20, 20), 12)];
    nestBuildings(twins);
    expect([twins[0].in, twins[1].in]).toEqual([undefined, 1]); // the first mapped stands
    const inner = [b(rect(0, 0, 30, 30), 20), b(rect(5, 5, 15, 15), 9, { k: 'house' })];
    nestBuildings(inner);
    expect(inner[1].in).toBe(1);
    // a taller twin rises from the other's roof instead
    const tall = [b(rect(0, 0, 20, 20), 12), b(rect(0, 0, 20, 20), 30)];
    nestBuildings(tall);
    expect([tall[1].lf, tall[1].h]).toEqual([12, 18]);
  });

  it('neighbours, party walls, lifted parts and outlines drawn by their parts are left alone', () => {
    const bs = [
      b(rect(0, 0, 10, 10), 9), b(rect(10, 0, 20, 10), 12), // a row: party wall on x = 10
      b(rect(0, 12, 20, 30), 8), b(rect(4, 14, 16, 28), 40, { pt: 1, lf: 20 }), // already lifted: mapped
      b(rect(30, 0, 60, 30), 50, { hp: 1 }), b(rect(32, 2, 58, 28), 50, { pt: 1, po: 4 }), // outline drawn by its part
      b(rect(0, 40, 20, 60), 10), b(rect(12, 40, 32, 60), 10), // overlapping 40%: not nested
    ];
    const snap = JSON.stringify(bs);
    expect(nestBuildings(bs)).toBe(0);
    expect(JSON.stringify(bs)).toBe(snap);
  });

  it('a tower drawn by its parts over a low terminal, a steeple drawn by its parts inside its church', () => {
    // the terminal (low, huge), the tower's outline (its parts draw it) and the tower's part
    const bs = [b(rect(0, 0, 200, 200), 6.3, { k: 'commercial' }), b(rect(50, 50, 120, 120), 118, { hp: 1 }), b(rect(55, 55, 115, 115), 121, { pt: 1, po: 1 })];
    nestBuildings(bs);
    expect(bs[1].in).toBe(1); // the outline's footprint goes: the terminal is the walkable building
    expect([bs[2].lf, bs[2].h, bs[2].po]).toEqual([6.3, 114.7, 0]); // the tower rises from its roof
    // church outline (drawn by its nave part) with a steeple outline (drawn by its own parts) inside
    const ch = [
      b(rect(0, 0, 40, 25), 9, { k: 'church', hp: 1 }), b(rect(0, 0, 40, 25), 20, { k: 'church', pt: 1, po: 0 }),
      b(rect(2, 8, 8, 16), 60, { hp: 1 }), b(rect(2, 8, 8, 16), 28, { pt: 1, po: 2 }), b(rect(3, 9, 7, 15), 35, { pt: 1, po: 2 }),
    ];
    nestBuildings(ch);
    expect(ch[0].in).toBe(undefined); // the church keeps its footprint and door
    expect(ch[2].in).toBe(1); // the steeple's outline doesn't stand inside it as a second building
    expect(ch[3].lf).toBe(20); // its base tier stands on the nave's roof…
    expect(ch[4].lf).toBe(28); // …and the spire tier on that
    // a part is never nested into its own outline, nor an outline into its own part
    const own = [b(rect(0, 0, 30, 30), 40, { hp: 1 }), b(rect(0, 0, 30, 30), 40, { pt: 1, po: 0 })];
    expect(nestBuildings(own)).toBe(0);
  });

  it("a survey block across a mapped building is that building; one on open ground stays; the neighbour's copy is read, never changed", () => {
    const bs = [b(rect(0, 0, 20, 20), 12), b(rect(10, 0, 30, 20), 12, { gen: 'lidar' }), b(rect(50, 0, 60, 10), 6, { gen: 'lidar' })];
    nestBuildings(bs);
    expect([bs[1].in, bs[2].in]).toEqual([1, undefined]);
    const ctx = [b(rect(0, 0, 40, 40), 30, { own: 0 }), b(rect(5, 5, 35, 35), 90), b(rect(0, 0, 40, 40), 10, { own: 0 })];
    nestBuildings(ctx);
    expect([ctx[1].lf, ctx[1].h]).toEqual([30, 60]);
    expect(ctx[0].lf).toBe(undefined);
    expect(ctx[2].in).toBe(undefined); // (the neighbour tile decides about its own)
  });
});

// ---------------- through the tile pipeline ----------------
class StubCtx {
  canvas: unknown; fillStyle = ''; strokeStyle = ''; lineWidth = 1; lineCap = ''; lineJoin = ''; globalCompositeOperation = ''; textBaseline = ''; font = '';
  constructor(c: unknown) { this.canvas = c; }
  setTransform() {} beginPath() {} moveTo() {} lineTo() {} stroke() {} fill() {} fillRect() {} fillText() {} drawImage() {}
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(t: string) { return { width: t.length * 8 }; }
  getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}
class StubCanvas {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return new StubCtx(this); }
  transferToImageBitmap() { return { width: this.width, height: this.height, close() {} } as ImageBitmap; }
}
beforeAll(() => { (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas; });

describe('a wedding-cake tower through buildTile', () => {
  it('one walkable footprint with one door; the tiers draw above the podium, never inside it', async () => {
    const L = packToBin({ grid: { x0: 0, z0: 0, cell: 4, w: 64, h: 64 }, height: new Int16Array(4096).fill(120), sdf: new Int16Array(4096).fill(300), cover: new Uint8Array(4096).fill(10), flags: new Uint8Array(4096), oceanD: new Uint8Array(4096).fill(200) });
    const terrain = new Terrain(new TerrainLayer(L.buf, L.layout), new TerrainLayer(L.buf, L.layout));
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      buildings: [b(rect(80, 60, 140, 100), 22, { pt: 1 }), b(rect(90, 70, 130, 100), 60, { pt: 1 }), b(rect(100, 80, 120, 100), 115, { pt: 1 })],
      roads: [{ p: [m(40), m(106), m(200), m(106)], c: 'primary', w: 12, n: 'Test Ave' }],
      areas: [], lines: [], points: [],
    };
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    expect(t.fps).toHaveLength(1); // the podium's footprint: the only walkable building
    expect(t.fps[0].ring.some(([x]) => Math.abs(x - 80) < 0.5)).toBe(true);
    expect(t.doors.length).toBe(1);
    // its door opens from the street into the podium's own ground floor (no tier's wall in the way)
    const d = t.doors[0];
    expect(d.wz).toBeGreaterThan(99);
  });
});
