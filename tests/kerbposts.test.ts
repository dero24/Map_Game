import { describe, it, expect, beforeAll } from 'vitest';
import { Terrain, TerrainLayer } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { replayOps } from '../src/world/pack';
import { buildTile } from '../src/world/tileBuild';
import { offCarriageway, carriagewaysNear } from '../src/world/props';
// @ts-expect-error plain js lib
import { packToBin } from '../scripts/lib/tiles.mjs';

// Posts stay out of the carriageway (tools/playtest.js __ROADPOSTS__ found them in the baked
// region's streets: a signal mast on a main road's centre line that stopped every car dead,
// street-name poles on the centre lines of streets that change their name, mapped poles and
// hydrants a metre into the lanes).

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
const L = packToBin({ grid: { x0: 0, z0: 0, cell: 4, w: 64, h: 64 }, height: new Int16Array(4096).fill(120), sdf: new Int16Array(4096).fill(300), cover: new Uint8Array(4096).fill(30), flags: new Uint8Array(4096), oceanD: new Uint8Array(4096).fill(200) });
// (the pack's bytes as an ArrayBuffer: a typed array made over a Buffer copies it byte by byte)
const ab = L.buf.buffer.slice(L.buf.byteOffset, L.buf.byteOffset + L.buf.byteLength) as ArrayBuffer;
const terrain = new Terrain(new TerrainLayer(ab, L.layout), new TerrainLayer(ab, L.layout));

type Rd = { p: number[]; c: string; w: number; n?: string };
/** How far (x, z) is inside the nearest carriageway (its half width minus the distance to its line). */
const depth = (roads: Rd[], x: number, z: number) => {
  let best = -Infinity;
  for (const r of roads)
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, sx = r.p[i + 2] / 10 - ax, sz = r.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
      best = Math.max(best, r.w / 2 - Math.hypot(ax + sx * t - x, az + sz * t - z));
    }
  return best;
};
/** The posts the tile stood in the walk world: short collision walls (sides under a metre),
 *  gathered into one centre per post. */
const posts = (w: WalkWorld) => {
  const W = w as unknown as { segs: number[][]; segDead: number[] }, out: { x: number; z: number; side: number }[] = [];
  W.segs.forEach((s, i) => {
    if (W.segDead[i]) return;
    const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (len > 1 || len < 0.01) return;
    const x = (s[0] + s[2]) / 2, z = (s[1] + s[3]) / 2;
    if (!out.some((p) => Math.hypot(p.x - x, p.z - z) < 0.6)) out.push({ x, z, side: len });
  });
  return out;
};

describe('posts keep out of the carriageway', () => {
  // A 11 m avenue running north–south along x = 128, a signalled junction at (128, 128) with a
  // side street arriving from the north-west at a slant (32° off the avenue), a hydrant mapped a
  // metre off the avenue's centre line, and an east–west street that changes its name at x = 80.
  const s = Math.sin((32 * Math.PI) / 180), c = Math.cos((32 * Math.PI) / 180);
  const roads: Rd[] = [
    { p: [m(128), m(20), m(128), m(128), m(128), m(236)], c: 'primary', w: 11, n: 'Main Avenue' },
    { p: [m(128 - s * 70), m(128 - c * 70), m(128), m(128)], c: 'residential', w: 6, n: 'Side Street' },
    { p: [m(20), m(200), m(80), m(200)], c: 'residential', w: 6.5, n: 'West Street' },
    { p: [m(80), m(200), m(115), m(200)], c: 'residential', w: 6.5, n: 'East Street' },
  ];
  const tj = {
    version: 1, id: '0_0', lod: 0, box: { x0: 0, z0: 0, x1: 256, z1: 256 }, origin: { lat: 40.36, lon: -73.97 },
    slice: { x0: 0, z0: 0, x1: 256, z1: 256 }, backdrop: { x0: 0, z0: 0, x1: 256, z1: 256 }, landmarks: [],
    buildings: [], roads, areas: [], lines: [],
    points: [{ c: 'signal', x: 128, z: 128 }, { c: 'hydrant', x: 129, z: 170 }],
  };

  it('stands the masts, signs, hydrants and name poles on the sidewalk', async () => {
    const t = await buildTile(tj as never, terrain, { id: '0_0', box: tj.box, lod: 0, file: 'x' }, 0);
    expect(t.objs.some((o) => o.n === 'street:signals')).toBe(true);
    expect(t.objs.some((o) => o.n === 'street:hydrants')).toBe(true);
    const w = new WalkWorld(terrain, { x0: -50, z0: -50, x1: 300, z1: 300 });
    replayOps(w, t.ops);
    for (const [a, b, y0, y1] of t.walls) w.addWall(a, b, y0, y1);
    // (trees keep off the roads by a canvas-drawn paved mask, which the stub canvas can't draw:
    // their trunks are left out here)
    const trunks: [number, number][] = [];
    for (const o of t.objs) if (/^(trees|garden):/.test(o.n ?? '') && o.im) for (let i = 0; i + 15 < o.im.length; i += 16) trunks.push([o.im[i + 12], o.im[i + 14]]);
    const found = posts(w).filter((p) => !trunks.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < p.side + 0.3));
    // the junction's masts, the hydrant and the name pole at the change of name are all there…
    expect(found.filter((p) => Math.hypot(p.x - 128, p.z - 128) < 20 && Math.abs(p.side - 0.36) < 0.02).length).toBeGreaterThanOrEqual(3);
    expect(found.some((p) => Math.abs(p.side - 0.36) < 0.02 && Math.abs(p.z - 170) < 1.5)).toBe(true);
    expect(found.some((p) => Math.abs(p.side - 0.16) < 0.02 && Math.hypot(p.x - 80, p.z - 200) < 10)).toBe(true);
    // …and none of them stands in a lane (a post's half side in from the kerb is a car's bumper)
    for (const p of found) expect(depth(roads, p.x, p.z), `post ${p.side} m at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBeLessThan(0);
  });

  it("a house's kerbside mailbox never stands in a slip road's lane (Sea Bright's Ocean Avenue at Rumson Road)", async () => {
    // the house faces the avenue; a junction's link (primary_link) runs along the avenue's east kerb
    // past its walk — buildings.ts finds the house's street among the plain streets and puts the box
    // at that kerb, which here is the link's lane
    const lroads: Rd[] = [
      { p: [m(128), m(20), m(128), m(236)], c: 'primary', w: 11, n: 'Main Avenue' },
      { p: [m(133.2), m(40), m(134.6), m(115)], c: 'primary_link', w: 6 }, // (it ends before the second house)
    ];
    const house = (z: number, s: number) => ({ r: [m(150), m(z - 5), m(160), m(z - 5), m(160), m(z + 5), m(150), m(z + 5)], h: 7, k: 'house', roof: 'flat', s });
    const ltj = { ...tj, roads: lroads, points: [], buildings: [house(100, 31), house(130, 32)] };
    const t = await buildTile(ltj as never, terrain, { id: '0_0', box: ltj.box, lod: 0, file: 'x' }, 0);
    const w = new WalkWorld(terrain, { x0: -50, z0: -50, x1: 300, z1: 300 });
    replayOps(w, t.ops);
    for (const [a, b, y0, y1] of t.walls) w.addWall(a, b, y0, y1);
    const trunks: [number, number][] = []; // (the stub canvas draws no paved mask: trees aren't kept off roads here)
    for (const o of t.objs) if (/^(trees|garden):/.test(o.n ?? '') && o.im) for (let i = 0; i + 15 < o.im.length; i += 16) trunks.push([o.im[i + 12], o.im[i + 14]]);
    expect(t.objs.some((o) => /^mailbox:/.test(o.n ?? '')), 'the house past the link keeps its box').toBe(true);
    const inLane = posts(w).filter((p) => !trunks.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < p.side + 0.3) && depth(lroads, p.x, p.z) > -0.2);
    expect(inLane.map((p) => `${p.side.toFixed(2)} m at ${p.x.toFixed(2)},${p.z.toFixed(2)}`)).toEqual([]);
  });

  it('offCarriageway: a point in a street steps out past its kerb on its own side; one clear stays put', () => {
    const near = carriagewaysNear(roads as never);
    expect(offCarriageway(near, 60, 100, 0.2)).toEqual([60, 100]);
    const [x, z] = offCarriageway(near, 129, 170, 0.2)!;
    expect(x).toBeCloseTo(128 + 5.5 + 0.5, 6); // (to the east kerb: the side it was mapped on)
    expect(z).toBeCloseTo(170, 6);
    const [x2] = offCarriageway(near, 128, 60, 0.2)!; // (on the line itself: a stable side)
    expect(Math.abs(x2 - 128)).toBeCloseTo(6, 6);
    expect(depth(roads, ...offCarriageway(near, 124, 131, 0.2)!)).toBeLessThan(-0.2); // (the corner: out of both streets)
  });
});
