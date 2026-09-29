import { describe, it, expect, beforeAll } from 'vitest';
import { Terrain, TerrainLayer } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { replayOps, unpackDeck } from '../src/world/pack';
import { buildTile } from '../src/world/tileBuild';
import { registerPlan } from '../src/world/interiors';
import type { Door } from '../src/world/buildings';
// @ts-expect-error plain js lib
import { packToBin } from '../scripts/lib/tiles.mjs';

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

const m = (v: number) => Math.round(v * 10);
const rect = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
const L = packToBin({ grid: { x0: 0, z0: 0, cell: 4, w: 64, h: 64 }, height: new Int16Array(4096).fill(12), sdf: new Int16Array(4096).fill(300), cover: new Uint8Array(4096).fill(10), flags: new Uint8Array(4096), oceanD: new Uint8Array(4096).fill(200) });
const terrain = new Terrain(new TerrainLayer(L.buf, L.layout), new TerrainLayer(L.buf, L.layout));
const pip = (x: number, z: number, r: number[]) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] / 10 > z !== r[j + 1] / 10 > z && x < ((r[j] / 10 - r[i] / 10) * (z - r[i + 1] / 10)) / (r[j + 1] / 10 - r[i + 1] / 10) + r[i] / 10) c = !c;
  return c;
};
const tileOf = (buildings: unknown[], lines: unknown[] = []) => ({
  version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.4, lon: -73.97 },
  slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
  buildings, roads: [{ p: [m(20), m(132), m(230), m(132)], c: 'residential', w: 8, n: 'Ocean Ave' }], areas: [], points: [], lines,
});
/** The walk world the stream mounts for a tile (stream.ts mount): ops, the footprints with their rooms, walls, decks. */
const mount = async (tj: ReturnType<typeof tileOf>) => {
  const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
  const w = new WalkWorld(terrain, { x0: -50, z0: -50, x1: 300, z1: 300 });
  replayOps(w, t.ops);
  const plans = new Map(t.plans.map((p) => [p.i, p.p]));
  t.fps.forEach((f, i) => { const p = plans.get(i); if (p) registerPlan(w, f, p); else w.addPolygon(f.ring); });
  for (const [a, b, y0, y1] of t.walls) w.addWall(a, b, y0, y1);
  for (const d of t.decks) w.addDeck(unpackDeck(d));
  return { t, w };
};
/** Can the walker get from the street (14 m out) into the door's rooms, by its own moves (35 cm
 *  steps sliding on walls, climbing up to 75 cm a step)? */
const reachable = (w: WalkWorld, d: Door) => {
  const S = 0.35, N = 40, tx = -d.nz, tz = d.nx, at = (i: number, j: number) => [d.wx + tx * i * S + d.nx * j * S, d.wz + tz * i * S + d.nz * j * S];
  const home = w.buildingAt(d.wx - d.nx * 0.7, d.wz - d.nz * 0.7), feet = new Map<number, number>(), q: [number, number][] = [];
  for (let i = -N; i <= N; i++) { const [x, z] = at(i, N); if (!w.blocked(x, z, 0.32)) { feet.set((i + N) * 1000 + 2 * N, w.surfaceAt(x, z, 1.5)); q.push([i, N]); } }
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h], f0 = feet.get((i + N) * 1000 + j + N)!, [x, z] = at(i, j);
    if (j <= -2 && home >= 0 && w.buildingAt(x, z) === home) return true;
    for (const [di, dj] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const ni = i + di, nj = j + dj, k = (ni + N) * 1000 + nj + N;
      if (Math.abs(ni) > N || Math.abs(nj) > N || feet.has(k)) continue;
      const [bx, bz] = at(ni, nj), [mx, mz] = w.move(x, z, bx - x, bz - z, 0.32, f0);
      if (Math.abs(mx - bx) + Math.abs(mz - bz) > 0.03) continue;
      const f1 = w.surfaceAt(bx, bz, f0);
      if (f1 - f0 > 0.75) continue;
      feet.set(k, f1);
      q.push([ni, nj]);
    }
  }
  return false;
};

describe("a raised house's stair stands in the open, and you can climb it to the door", () => {
  it('between two close neighbours: the stair goes where there is room (never inside the house next door)', async () => {
    const A = { r: rect(100, 100, 108, 114), h: 9, k: 'house', roof: 'gable', s: 3, mh: 3 };
    const east = { r: rect(108.5, 100, 116, 114), h: 8, k: 'house', roof: 'gable', s: 4 }, west = { r: rect(92, 100, 99.5, 114), h: 8, k: 'house', roof: 'gable', s: 5 };
    const { t, w } = await mount(tileOf([A, east, west]));
    const fa = t.fps.find((f) => f.ring.some(([x]) => Math.abs(x - 100) < 0.3) && f.ring.some(([x]) => Math.abs(x - 108) < 0.3))!;
    expect(fa.raise).toBeGreaterThan(2);
    const d = t.doors[fa.door!];
    // no step or landing of its stair inside either neighbour
    for (const pd of t.decks) for (const [x, z] of unpackDeck(pd).pts) for (const n of [east, west]) expect(pip(x, z, n.r)).toBe(false);
    expect(reachable(w, d)).toBe(true);
  });

  it("a mapped fence along the side it wraps down stops short of the flight (and a deck passes over a fence's line)", async () => {
    // a long lot: the stair wraps down the east side, where the map draws the lot-line fence
    const A = { r: rect(100, 96, 106, 114), h: 9, k: 'house', roof: 'gable', s: 3, mh: 3 };
    const fence = { c: 'fence', p: [m(107.1), m(90), m(107.1), m(116)], ft: 3 };
    const { t, w } = await mount(tileOf([A], [fence]));
    const fa = t.fps.find((f) => f.raise > 2)!;
    const d = t.doors[fa.door!];
    expect(reachable(w, d)).toBe(true);
    // the fence's own walls end at its top: nothing of it stands above 1.5 m over the ground
    const fenceWalls = t.ops.filter((o) => o.o === 'w' && Math.abs(o.a[0] - 107.1) < 0.01 && Math.abs(o.b[0] - 107.1) < 0.01);
    expect(fenceWalls.length).toBeGreaterThan(0);
    for (const o of fenceWalls) expect((o as { y1: number }).y1).toBeLessThan(terrain.heightAt(107, 100) + 1.6);
  });

  it('a house at the kerb never runs its stair across the street, even when the sides are tight', async () => {
    // the front wall 30 cm from the kerb of an 8 m street; a shed by each side's stair foot
    const A = { r: rect(100, 100, 108, 114), h: 9, k: 'house', roof: 'gable', s: 3, mh: 3 };
    const sheds = [{ r: rect(108.3, 107.5, 110, 110), h: 3, k: 'shed', roof: 'flat', s: 6 }, { r: rect(98, 107.5, 99.7, 110), h: 3, k: 'shed', roof: 'flat', s: 7 }];
    const tj = { ...tileOf([A, ...sheds]), roads: [{ p: [m(20), m(118.3), m(230), m(118.3)], c: 'residential', w: 8, n: 'Front St' }] };
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    expect(t.fps.find((f) => f.raise > 2)?.door !== undefined).toBe(true);
    const flights = t.decks.map(unpackDeck).filter((d) => d.profile?.k === 'ramp');
    expect(flights.length).toBeGreaterThan(0);
    for (const d of flights) for (const [, z] of d.pts) expect(Math.abs(z - 118.3)).toBeGreaterThan(4); // (no end of a flight in the carriageway)
  });
});
