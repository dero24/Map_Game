import { describe, it, expect, beforeAll } from 'vitest';
import { Terrain, TerrainLayer } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { replayOps } from '../src/world/pack';
import { buildTile } from '../src/world/tileBuild';
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
const L = packToBin({ grid: { x0: 0, z0: 0, cell: 4, w: 64, h: 64 }, height: new Int16Array(4096).fill(120), sdf: new Int16Array(4096).fill(300), cover: new Uint8Array(4096).fill(10), flags: new Uint8Array(4096), oceanD: new Uint8Array(4096).fill(200) });
const terrain = new Terrain(new TerrainLayer(L.buf, L.layout), new TerrainLayer(L.buf, L.layout));

describe('the way to a front door stays open', () => {
  it("a yard fence across the front walk gets a gate; a mapped bike rack doesn't stand on the doorstep", async () => {
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      buildings: [{ r: [m(100), m(100), m(110), m(100), m(110), m(110), m(100), m(110)], h: 7, k: 'house', roof: 'flat', s: 5 }],
      roads: [{ p: [m(40), m(125), m(200), m(125)], c: 'residential', w: 7, n: 'Test St' }],
      areas: [], points: [{ c: 'bikerack', x: 105, z: 111.6 }],
      lines: [{ c: 'fence', p: [m(90), m(114), m(125), m(114)], ft: 3 }],
    };
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    expect(t.doors).toHaveLength(1);
    const d = t.doors[0];
    expect(d.nz).toBeGreaterThan(0.9); // faces the street
    expect(t.objs.some((o) => (o.n ?? '').startsWith('street:bikerack'))).toBe(false); // (not on the doorstep)
    const w = new WalkWorld(terrain, { x0: -50, z0: -50, x1: 300, z1: 300 });
    replayOps(w, t.ops);
    for (const [a, b, y0, y1] of t.walls) w.addWall(a, b, y0, y1);
    // from the sidewalk, straight up the walk to the doorstep
    let x = d.wx, z = 122;
    for (let i = 0; i < 120; i++) [x, z] = w.move(x, z, 0, -0.1, 0.32, 1.2);
    expect(z).toBeLessThan(d.wz + 1.0);
    // and beside the gate the fence is still a fence
    let x2 = d.wx + 6, z2 = 118;
    for (let i = 0; i < 60; i++) [x2, z2] = w.move(x2, z2, 0, -0.1, 0.32, 1.2);
    expect(z2).toBeGreaterThan(114);
  });

  it("no car parks on the sidewalk against the facades (a street modelled wider than the kerbs)", async () => {
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      // a built-up block (the kerbs park by how built the street is): the front row on the street,
      // more behind it and across it
      buildings: [
        ...[0, 1, 2, 3, 4, 5].map((i) => ({ r: [m(60 + i * 12), m(100), m(71 + i * 12), m(100), m(71 + i * 12), m(110), m(60 + i * 12), m(110)], h: 12, k: 'large', roof: 'flat', s: 11 + i })),
        ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [0, 1, 2].map((j) => ({ r: [m(40 + i * 18), m(40 + j * 18), m(56 + i * 18), m(40 + j * 18), m(56 + i * 18), m(56 + j * 18), m(40 + i * 18), m(56 + j * 18)], h: 20, k: 'large', roof: 'flat', s: 40 + i * 3 + j }))),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ r: [m(40 + i * 18), m(130), m(56 + i * 18), m(130), m(56 + i * 18), m(146), m(40 + i * 18), m(146)], h: 20, k: 'large', roof: 'flat', s: 80 + i })),
      ],
      // its edge 1 m off the facades: a parking lane there would be on the sidewalk
      roads: [{ p: [m(20), m(117), m(220), m(117)], c: 'residential', w: 12, n: 'Wide St', pk: 5 }], // (parked both kerbs, parallel)
      areas: [], points: [], lines: [],
    };
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    const k = t.kerb ?? new Float32Array(0);
    expect(k.length).toBeGreaterThan(0); // (the far kerb still parks)
    for (let i = 0; i + 10 < k.length; i += 11) if (k[i] > 60 && k[i] < 131) expect(Math.abs(k[i + 2] - 110)).toBeGreaterThan(2.4); // (car centre ≥ a car's half-width + 1.5 m off the facade)
  });

  it('a flag mapped over the front door stands beside it: the way in stays open', async () => {
    const mk = (points: unknown[]) => ({
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      buildings: [{ r: [m(100), m(100), m(114), m(100), m(114), m(110), m(100), m(110)], h: 14, k: 'large', roof: 'flat', s: 9 }],
      roads: [{ p: [m(40), m(125), m(200), m(125)], c: 'residential', w: 7, n: 'Test St' }],
      areas: [], points, lines: [],
    });
    const spec = { id: '0_0', box: { x0: 0, z0: 0, x1: 256, z1: 256 }, lod: 0, file: 'x' };
    const d0 = (await buildTile(mk([]) as never, terrain, spec, 0)).doors[0];
    // the map's pole: 60 cm out from the door (a flag on the facade, over the entrance)
    const tj = mk([{ c: 'flagpole', x: d0.wx + d0.nx * 0.6, z: d0.wz + d0.nz * 0.6 }]);
    const t = await buildTile(tj as never, terrain, spec, 0);
    const d = t.doors[0];
    const pole = t.objs.find((o) => o.n === 'tower:flagpole')!;
    const [px, pz] = [pole.im![12], pole.im![14]];
    expect(Math.abs((px - d.wx) * -d.nz + (pz - d.wz) * d.nx)).toBeGreaterThan(d.w / 2 + 0.35); // beside the doorway
    const w = new WalkWorld(terrain, { x0: -50, z0: -50, x1: 300, z1: 300 });
    replayOps(w, t.ops);
    for (const [a, b, y0, y1] of t.walls) w.addWall(a, b, y0, y1);
    let x = d.wx, z = 121;
    for (let i = 0; i < 120; i++) [x, z] = w.move(x, z, 0, -0.1, 0.32, 1.2);
    expect(z).toBeLessThan(d.wz + 1.0); // up to the door
  });

  it('a water tank, an antenna and a chimney mapped on a roof stand on it, not from the street inside', async () => {
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      buildings: [{ r: [m(100), m(100), m(130), m(100), m(130), m(120), m(100), m(120)], h: 30, k: 'large', roof: 'flat', s: 9 }],
      roads: [{ p: [m(40), m(135), m(200), m(135)], c: 'residential', w: 8, n: 'Test St' }],
      areas: [],
      points: [{ c: 'water_tower', x: 110, z: 108 }, { c: 'mast', x: 122, z: 106 }, { c: 'chimney', x: 104, z: 104, h: 50 }, { c: 'flagpole', x: 60, z: 60 }],
      lines: [],
    };
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    const g = terrain.heightAt(100, 100), roof = Math.max(g, 0.2) - 0.3 + 30;
    const at = (n: string) => { const im = t.objs.find((o) => o.n === n)!.im!; return { y: im[13], s: Math.hypot(im[4], im[5], im[6]) }; };
    const tank = at('tower:waterTower'), mast = at('tower:mast'), chim = at('tower:chimney'), pole = at('tower:flagpole');
    expect(tank.y).toBeCloseTo(roof - 0.05, 1); // on the roof…
    expect(tank.s).toBeGreaterThan(7); // …a rooftop tank, not a 36 m town tower
    expect(tank.s).toBeLessThan(11);
    expect(mast.y).toBeCloseTo(roof - 0.05, 1);
    expect(mast.s).toBeLessThan(15);
    expect(chim.s).toBeCloseTo(20, 1); // mapped 50 m from the street: the 20 m above the roof
    expect(pole.y).toBeCloseTo(g - 0.05, 1); // (one on open ground stands on the ground)
    expect(pole.s).toBeGreaterThan(9);
    // nothing of theirs stands in the rooms below: every loop inside the outline starts at the roof
    const loops = t.ops.filter((o) => o.o === 'l' && o.p.every(([x, z]) => x > 100 && x < 130 && z > 100 && z < 120));
    expect(loops.length).toBe(2); // (the mast's legs and the chimney; you walk under a tank)
    for (const l of loops) expect((l as { y0: number }).y0).toBeGreaterThan(roof - 1);
  });

  it("a door never opens where another building's outline runs across the front (a terminal under a tower)", async () => {
    const tj = {
      version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.75, lon: -73.98 },
      slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
      buildings: [
        // the low one: its outline runs 20 cm in front of the tower's street front, along half of it
        { r: [m(60), m(60), m(113), m(60), m(113), m(110.2), m(60), m(110.2)], h: 7, k: 'commercial', roof: 'flat', s: 21 },
        { r: [m(100), m(90), m(120), m(90), m(120), m(110), m(100), m(110)], h: 90, k: 'commercial', roof: 'flat', s: 22 },
      ],
      roads: [{ p: [m(20), m(125), m(220), m(125)], c: 'residential', w: 8, n: 'Front St' }],
      areas: [], points: [], lines: [],
    };
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    const pip = (x: number, z: number, r: [number, number][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
    const low = t.fps.find((f) => f.ring.some(([x]) => Math.abs(x - 60) < 0.5))!, tower = t.fps.find((f) => f.ring.some(([x]) => Math.abs(x - 120) < 0.5))!;
    expect(tower.door !== undefined).toBe(true);
    const d = t.doors[tower.door!];
    expect(pip(d.wx - d.nx * 0.3, d.wz - d.nz * 0.3, low.ring as [number, number][])).toBe(false); // not in the stretch the low one covers
    expect(pip(d.wx + d.nx * 0.1, d.wz + d.nz * 0.1, low.ring as [number, number][])).toBe(false);
  });
});
