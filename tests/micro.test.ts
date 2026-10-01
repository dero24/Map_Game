import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
// @ts-expect-error node's own module (the project carries no node types)
import { readFileSync } from 'node:fs';
import { Terrain, TerrainLayer, type TileJson, type Building, type WorldJson } from '../src/world/data';
import { Painter } from '../src/world/groundPaint';
import { buildTile } from '../src/world/tileBuild';
import { setActiveStyle, regionStyle } from '../src/world/styles';
import { MICRO_STRIDE, setMicroDate, BEACH_SEASON } from '../src/world/micro';
import { MicroLayer, kindLod } from '../src/world/microLayer';
import { MICRO_KINDS, MICRO_INDEX, microLib, type MicroId } from '../src/assets/micro';
import { MICRO_TIERS, pickTier, type MicroTier } from '../src/render/quality';
import { furnitureClass, seamarkOf, overpassQuery } from '../src/world/realTile';
// @ts-expect-error plain js lib
import { packToBin } from '../scripts/lib/tiles.mjs';

// The micro layer: the small things of a place placed per tile (world/micro.ts) and drawn real
// close up, impostor cards further out, in two draws (world/microLayer.ts).

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
beforeAll(() => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = StubCanvas;
  setActiveStyle(regionStyle(40.36, -73.98)); // (the Jersey shore's: North American clapboard country)
  setMicroDate('2026-07-15'); // a July Wednesday: the beach in season
});

// flat land 1.2 m up, 30 m from the water everywhere (a beach's dry sand), the ocean 400 m off
const m = (v: number) => Math.round(v * 10);
const L = packToBin({ grid: { x0: -64, z0: -64, cell: 4, w: 160, h: 160 }, height: new Int16Array(25600).fill(120), sdf: new Int16Array(25600).fill(300), cover: new Uint8Array(25600).fill(30), flags: new Uint8Array(25600), oceanD: new Uint8Array(25600).fill(200) });
const ab = L.buf.buffer.slice(L.buf.byteOffset, L.buf.byteOffset + L.buf.byteLength) as ArrayBuffer;
const terrain = new Terrain(new TerrainLayer(ab, L.layout), new TerrainLayer(ab, L.layout));

const rect = (cx: number, cz: number, w: number, d: number) => [m(cx - w / 2), m(cz - d / 2), m(cx + w / 2), m(cz - d / 2), m(cx + w / 2), m(cz + d / 2), m(cx - w / 2), m(cz + d / 2)];
/** A street of houses both sides of an east–west street at z = 128, a row of shops on a north–south
 *  avenue at x = 230, a beach to the north-east and a pier. `own` keeps entities in [x0, x1). */
function town(x0 = 0, x1 = 256): TileJson {
  const b: Building[] = [];
  for (let x = 14; x < 200; x += 22) {
    b.push({ r: rect(x, 104, 11, 9), h: 7, k: 'house', roof: 'gable', s: x * 0.013 + 0.11, ad: `${x} Main St` });
    b.push({ r: rect(x + 6, 152, 11, 9), h: 7, k: 'house', roof: 'gable', s: x * 0.017 + 0.07, ad: `${x + 1} Main St` });
  }
  for (let z = 20; z < 250; z += 16) b.push({ r: rect(246, z, 12, 12), h: 8, k: 'commercial', roof: 'flat', s: z * 0.011 + 0.3, n: `Shop ${z}`, u: 'cafe' });
  const roads = [
    { p: [m(-40), m(128), m(222), m(128)], c: 'residential', w: 6.5, n: 'Main Street' },
    { p: [m(230), m(-40), m(230), m(300)], c: 'secondary', w: 9, n: 'Ocean Avenue' },
  ];
  const own = (x: number) => (x >= x0 && x < x1 ? {} : { own: 0 });
  return {
    version: 1, id: 't', lod: 0, box: { x0, z0: 0, x1, z1: 256 }, origin: { lat: 40.36, lon: -73.97 },
    slice: { x0: -64, z0: -64, x1: 576, z1: 576 }, backdrop: { x0: -64, z0: -64, x1: 576, z1: 576 }, landmarks: [],
    buildings: b.map((q) => ({ ...q, ...own(q.r[0] / 10) })),
    roads: roads.map((r) => ({ ...r, ...own(r.p[0] / 10 + 1) })),
    areas: [{ c: 'beach', o: [[m(150), m(170), m(420), m(170), m(420), m(250), m(150), m(250)]], i: [], ...own(150) }],
    lines: [],
    points: [{ c: 'picnic', x: 100, z: 60 }, { c: 'cabinet', x: 120, z: 133 }, { c: 'nonsense', x: 10, z: 10 }],
  } as unknown as TileJson;
}
const spec = (x0: number, x1: number) => ({ id: `${x0}`, box: { x0, z0: 0, x1, z1: 256 }, lod: 0, file: 'x' });
const recs = (a?: Float32Array) => {
  const out: { x: number; y: number; z: number; yaw: number; k: MicroId }[] = [];
  for (let i = 0; a && i + MICRO_STRIDE <= a.length; i += MICRO_STRIDE) out.push({ x: a[i], y: a[i + 1], z: a[i + 2], yaw: a[i + 3], k: MICRO_KINDS[a[i + 4]].id });
  return out;
};
const inRing = (x: number, z: number, r: number[]) => {
  let ins = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] / 10 > z !== r[j + 1] / 10 > z && x < ((r[j] / 10 - r[i] / 10) * (z - r[i + 1] / 10)) / (r[j + 1] / 10 - r[i + 1] / 10) + r[i] / 10) ins = !ins;
  return ins;
};
/** How far inside the nearest carriageway (x, z) is (< 0: outside every one). */
const depth = (roads: { p: number[]; w: number }[], x: number, z: number) => {
  let best = -Infinity;
  for (const r of roads)
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, sx = r.p[i + 2] / 10 - ax, sz = r.p[i + 3] / 10 - az, L2 = sx * sx + sz * sz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
      best = Math.max(best, r.w / 2 - Math.hypot(ax + sx * t - x, az + sz * t - z));
    }
  return best;
};

describe('micro placement (world/micro.ts)', () => {
  it('dresses the street: carts, porch and lawn things, the shops\' A-frames and planters, the beach, the mapped pieces', async () => {
    const t = await buildTile(town(), terrain, spec(0, 256), 0);
    const r = recs(t.micro), kinds = new Set(r.map((q) => q.k));
    expect(r.length).toBeGreaterThan(60);
    for (const k of ['cart', 'umbrella', 'towel', 'picnic', 'cabinet'] as MicroId[]) expect(kinds.has(k), k).toBe(true);
    expect(kinds.has('aframe') || kinds.has('planter')).toBe(true);
    // (an unknown class the map might carry is no piece)
    expect(r.every((q) => MICRO_INDEX[q.k] >= 0)).toBe(true);
    // every record is a finite piece the family has, on its own ground
    for (const q of r) {
      for (const v of [q.x, q.y, q.z, q.yaw]) expect(Number.isFinite(v)).toBe(true);
      expect(q.x >= 0 && q.x < 256 && q.z >= 0 && q.z < 256).toBe(true);
    }
  });
  it('places nothing inside a building or a carriageway', async () => {
    const tj = town();
    const t = await buildTile(tj, terrain, spec(0, 256), 0);
    for (const q of recs(t.micro)) {
      const K = MICRO_KINDS[MICRO_INDEX[q.k]];
      if (K.mount === 'wall') continue; // (a flag hangs on the wall, its foot is the bracket)
      for (const b of tj.buildings) expect(inRing(q.x, q.z, b.r), `${q.k} at ${q.x.toFixed(1)},${q.z.toFixed(1)}`).toBe(false);
      // its footprint too: the corners of its collider (or its box) stay out of the lanes
      const [hx, hz] = K.solid ?? [K.box[0] / 2, K.box[2] / 2];
      const c = Math.cos(q.yaw), s = Math.sin(q.yaw);
      for (const [u, v] of [[0, 0], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) {
        const x = q.x + c * u + s * v, z = q.z - s * u + c * v;
        expect(depth(tj.roads, x, z), `${q.k} at ${q.x.toFixed(1)},${q.z.toFixed(1)}`).toBeLessThan(0);
      }
    }
  });
  it('is deterministic: the same tile twice is the same records, and a neighbour\'s build changes none of them', async () => {
    const a = await buildTile(town(), terrain, spec(0, 256), 0);
    const b = await buildTile(town(), terrain, spec(0, 256), 0);
    expect(a.micro!.length).toBeGreaterThan(0);
    expect(Array.from(a.micro!)).toEqual(Array.from(b.micro!));
    // the beach runs on into the next cell: each tile dresses its own stretch on one world grid —
    // no piece twice, none over the seam
    const c = await buildTile(town(256, 512), terrain, spec(256, 512), 0);
    const left = recs(a.micro).filter((q) => q.k === 'umbrella'), right = recs(c.micro).filter((q) => q.k === 'umbrella');
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.every((q) => q.x < 256)).toBe(true);
    expect(right.every((q) => q.x >= 256)).toBe(true);
    const a2 = await buildTile(town(), terrain, spec(0, 256), 0);
    expect(Array.from(a2.micro!)).toEqual(Array.from(a.micro!));
  });
  it('follows the season: a July beach is busy, a January one empty', async () => {
    const july = recs((await buildTile(town(), terrain, spec(0, 256), 0)).micro).filter((q) => q.k === 'umbrella' || q.k === 'towel').length;
    setMicroDate('2026-01-14');
    const jan = recs((await buildTile(town(), terrain, spec(0, 256), 0)).micro).filter((q) => q.k === 'umbrella' || q.k === 'towel').length;
    setMicroDate('2026-07-15');
    expect(july).toBeGreaterThan(5);
    expect(jan).toBe(0);
    expect(BEACH_SEASON[6]).toBe(1);
  });
});

describe('the map\'s micro furniture (realTile)', () => {
  it('reads picnic tables, boards, cabinets, recycling, grills, clocks, planters — and the channel\'s marks', () => {
    expect(furnitureClass({ leisure: 'picnic_table' })).toBe('picnic');
    expect(furnitureClass({ tourism: 'information', information: 'board' })).toBe('info');
    expect(furnitureClass({ tourism: 'information', information: 'office' })).toBeNull();
    expect(furnitureClass({ man_made: 'street_cabinet' })).toBe('cabinet');
    expect(furnitureClass({ amenity: 'recycling', recycling_type: 'container' })).toBe('recycling');
    expect(furnitureClass({ amenity: 'recycling', recycling_type: 'centre' })).toBeNull();
    expect(furnitureClass({ amenity: 'vending_machine', vending: 'drinks' })).toBe('vending');
    expect(furnitureClass({ amenity: 'vending_machine', vending: 'parking_tickets' })).toBe('meter'); // (as before)
    expect(furnitureClass({ amenity: 'clock', support: 'pole' })).toBe('clock');
    expect(furnitureClass({ amenity: 'clock', support: 'wall_mounted' })).toBeNull();
    expect(furnitureClass({ amenity: 'bbq' })).toBe('bbq');
    expect(furnitureClass({ leisure: 'firepit' })).toBe('firepit');
    expect(seamarkOf({ 'seamark:type': 'buoy_lateral', 'seamark:buoy_lateral:shape': 'conical', 'seamark:buoy_lateral:colour': 'red' })).toEqual({ c: 'buoy', sp: 'conical:red' });
    expect(seamarkOf({ 'seamark:type': 'beacon_lateral', 'seamark:beacon_lateral:colour': 'green' })).toEqual({ c: 'beacon', sp: ':green' });
    expect(seamarkOf({ 'seamark:type': 'mooring' })?.c).toBe('buoy');
    expect(seamarkOf({ 'seamark:type': 'light_major' })).toBeNull();
    const q = overpassQuery({ s: 40.3, w: -74, n: 40.31, e: -73.99 });
    for (const s of ['picnic_table', 'street_cabinet', 'seamark:type', 'recycling', '"information"']) expect(q).toContain(s);
  });
});

// A layer with no GPU: the atlas counted as photographed (tests have no WebGL).
const fakeRenderer = { capabilities: { maxTextureSize: 8192 }, initRenderTarget() {}, domElement: null } as unknown as THREE.WebGLRenderer;
const layerFor = (T: MicroTier, pieces?: (THREE.BufferGeometry | null)[]) => {
  const l = new MicroLayer(fakeRenderer, T, pieces);
  l.atlas.assumeBaked();
  return l;
};
/** n × n pieces of every kind in turn on a grid `gap` m apart, centred on the origin. */
function grid(n: number, gap: number, kinds = MICRO_KINDS.map((_, k) => k)) {
  const d = new Float32Array(n * n * MICRO_STRIDE);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * MICRO_STRIDE;
      d.set([(i - n / 2) * gap, 0, (j - n / 2) * gap, (i * 0.37) % 6.28, kinds[(i + j * 7) % kinds.length], 1, 0x3a6fb5, 0], o);
    }
  return d;
}

describe('micro layer budgets (world/microLayer.ts)', () => {
  it('two draws for the whole layer (one more in the shadow pass where the 3D pieces cast)', () => {
    for (const tier of ['desktop', 'phone', 'low'] as const) {
      const T = MICRO_TIERS[tier], l = layerFor(T);
      l.add('a', grid(60, 6));
      l.update(0, 1.6, 0);
      const meshes: THREE.Mesh[] = [];
      l.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      expect(meshes.length).toBe(2);
      expect(meshes.filter((o) => o.layers.isEnabled(1)).length).toBe(T.castNear ? 1 : 0);
      expect(pickTier({ coarse: tier !== 'desktop', hover: tier === 'desktop', touchPoints: 0, screenMin: 400, screenMax: 900, dpr: 1, ua: '', memoryGB: tier === 'low' ? 2 : 8 }).micro).toBeDefined();
    }
  });
  it('caps what it draws by tier, nearest first, and a phone draws less', () => {
    const D = MICRO_TIERS.desktop, P = MICRO_TIERS.phone, Lo = MICRO_TIERS.low;
    expect(P.cards).toBeLessThan(D.cards);
    expect(Lo.cards).toBeLessThan(P.cards);
    expect(P.nearVerts).toBeLessThan(D.nearVerts);
    expect(P.far).toBeLessThan(D.far);
    for (const T of [D, P, Lo]) {
      const l = layerFor(T);
      l.add('dense', grid(240, 3)); // 57,600 pieces within ±360 m
      l.update(0, 1.6, 0);
      const s = l.stats;
      expect(s.records).toBe(240 * 240);
      expect(s.cards).toBeGreaterThan(0);
      expect(s.cards).toBeLessThanOrEqual(T.cards);
      expect(s.near).toBeLessThanOrEqual(T.near);
      expect(s.nearVerts).toBeLessThanOrEqual(T.nearVerts);
      // nearest first: no card further than any piece left out
      const A = (l.cards.geometry.getAttribute('aPos') as THREE.BufferAttribute).array as Float32Array;
      let far = 0;
      for (let i = 0; i < s.cards; i++) far = Math.max(far, Math.hypot(A[i * 4], A[i * 4 + 1] - 1.6, A[i * 4 + 2]));
      expect(far).toBeLessThanOrEqual(T.far + 1);
    }
  });
  it('keeps the atlas, the 3D buffer and the card buffer within each tier\'s memory', () => {
    const MB: Record<string, [number, number, number]> = { desktop: [48, 8, 0.5], phone: [12, 2.5, 0.2], low: [12, 1.2, 0.1] };
    for (const [tier, [atlasMB, nearMB, cardMB]] of Object.entries(MB)) {
      const T = MICRO_TIERS[tier as keyof typeof MICRO_TIERS], l = layerFor(T);
      expect(l.stats.atlasMB, tier).toBeLessThanOrEqual(atlasMB);
      expect(l.stats.atlasW).toBeLessThanOrEqual(T.atlasW);
      expect(l.stats.atlasH).toBeLessThanOrEqual(4096);
      expect(l.stats.kinds).toBe(MICRO_KINDS.length);
      expect((T.nearVerts * (12 + 3 + 12 + 16)) / 1048576, tier).toBeLessThanOrEqual(nearMB);
      expect((T.cards * 32) / 1048576, tier).toBeLessThanOrEqual(cardMB);
    }
  });
  it('hands each piece over in one band: 3D inside, a card outside, both (and only both) in between', () => {
    const T = MICRO_TIERS.desktop, k = MICRO_INDEX.cart, l = layerFor(T);
    const n = 400, d = new Float32Array(n * MICRO_STRIDE);
    for (let i = 0; i < n; i++) d.set([1 + i, 0, 0, 0, k, 1, 0x2f4f3a, 0], i * MICRO_STRIDE);
    l.add('row', d);
    l.update(0, 0, 0);
    const G = l.kinds[k]!;
    expect(G.dh).toBeGreaterThanOrEqual(T.lo);
    expect(G.dh).toBeLessThanOrEqual(T.hi);
    expect(G.far).toBeGreaterThan(G.dh + T.band);
    // which pieces the 3D mesh holds (and whether each has a card), which the cards hold (and whether each's 3D draws)
    const F = (l.near.geometry.getAttribute('aFade') as THREE.BufferAttribute).array as Float32Array;
    const nearAt = new Map<number, number>();
    for (let v = 0; v < l.stats.nearVerts; v++) nearAt.set(Math.round(F[v * 4]), F[v * 4 + 3]);
    const A = (l.cards.geometry.getAttribute('aPos') as THREE.BufferAttribute).array as Float32Array, B = (l.cards.geometry.getAttribute('aInfo') as THREE.BufferAttribute).array as Float32Array;
    const cardAt = new Map<number, number>();
    for (let i = 0; i < l.stats.cards; i++) cardAt.set(Math.round(A[i * 4]), B[i * 4 + 3]);
    for (let i = 0; i < n; i++) {
      const x = 1 + i, inNear = nearAt.has(x), inCard = cardAt.has(x);
      if (x > G.far + T.step + 1) { expect(inNear || inCard).toBe(false); continue; }
      if (x > G.far) continue; // (a step past the far ring: kept for the camera's next few metres)
      expect(inNear || inCard, `piece at ${x} m`).toBe(true); // (never a hole)
      if (x < G.dh - T.band / 2 - T.step - 1) expect([inNear, inCard, nearAt.get(x)]).toEqual([true, false, -1]);
      if (x > G.dh + T.band / 2 + T.step + 1) expect([inNear, cardAt.get(x)]).toEqual([false, 0]);
      // in the band each knows the other draws the rest
      if (inNear && inCard) {
        expect(nearAt.get(x)!).toBeCloseTo(G.dh, 4);
        expect(cardAt.get(x)).toBe(1);
      }
    }
    expect([...nearAt.values()].some((v) => v > 0)).toBe(true);
  });
  it('a piece that is missing (or unknown to this build) is left out, the rest drawn', () => {
    const pieces = MICRO_KINDS.map((k, i) => (i === MICRO_INDEX.cart ? null : microLib(k.id)));
    const l = layerFor(MICRO_TIERS.desktop, pieces);
    expect(l.kinds[MICRO_INDEX.cart]).toBeNull();
    expect(l.atlas.L.blocks[MICRO_INDEX.cart].F).toBe(0);
    const d = new Float32Array(3 * MICRO_STRIDE);
    d.set([2, 0, 0, 0, MICRO_INDEX.cart, 1, 0, 0], 0);
    d.set([3, 0, 0, 0, 99, 1, 0, 0], MICRO_STRIDE);
    d.set([4, 0, 0, 0, MICRO_INDEX.aframe, 1, 0, 0], 2 * MICRO_STRIDE);
    l.add('x', d);
    expect(() => l.update(0, 0, 0)).not.toThrow();
    expect(l.stats.near).toBe(1);
    expect(microLib('no-such-piece' as MicroId)).toBeNull();
    // and a tile without records, or one that goes, is nothing
    l.add('empty', new Float32Array(0));
    l.add('none', undefined);
    l.remove('x');
    l.update(0, 0, 0);
    expect(l.stats.near + l.stats.cards).toBe(0);
  });
  it('works the hand-over out from the piece\'s size: bigger pieces later, all within the tier\'s range', () => {
    for (const T of [MICRO_TIERS.desktop, MICRO_TIERS.phone, MICRO_TIERS.low]) {
      const small = kindLod(0.4, T), big = kindLod(1.9, T);
      expect(small.dh).toBeGreaterThanOrEqual(T.lo);
      expect(big.dh).toBeLessThanOrEqual(T.hi);
      expect(big.dh).toBeGreaterThanOrEqual(small.dh);
      expect(big.F).toBe(T.Fbig);
      expect(small.F).toBe(T.Fsmall);
      expect(small.far).toBeGreaterThan(small.dh + T.band);
    }
  });
});

// ---- The ground you walk on, on the shore pack ----
// Sea Bright's middle (the shops on the avenue, the blocks behind them), built as the tile worker
// builds it, against the ground the paint lays there (groundPaint.ts Painter, from the bake's
// paint.json and the tiles' own walks and drives).
type POp = { op: 'fill' | 'stroke' | 'fillRect'; style: string; width: number; rings: [number, number][][] };
function paintRecorder() {
  const ops: POp[] = [];
  let rings: [number, number][][] = [], cur: [number, number][] | null = null;
  const st: Record<string, unknown> = { lineWidth: 1, fillStyle: '#000', strokeStyle: '#000' };
  const fns: Record<string, (...a: number[]) => void> = {
    beginPath: () => { rings = []; cur = null; },
    moveTo: (x, z) => { cur = [[x, z]]; rings.push(cur); },
    lineTo: (x, z) => { cur?.push([x, z]); },
    fill: () => { ops.push({ op: 'fill', style: String(st.fillStyle), width: 0, rings: rings.slice() }); },
    stroke: () => { ops.push({ op: 'stroke', style: String(st.strokeStyle), width: st.lineWidth as number, rings: rings.slice() }); },
    fillRect: () => {},
  };
  const ctx = new Proxy({}, { get: (_, k: string) => fns[k] ?? (k in st ? st[k] : () => null), set: (_, k: string, v) => { st[k] = v; return true; } }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}
const segD = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
};
const inside = (x: number, z: number, r: [number, number][]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
const covers = (o: POp, x: number, z: number) => {
  if (o.op === 'stroke') return o.rings.some((r) => r.some((p, i) => i > 0 && segD(x, z, r[i - 1], p) <= o.width / 2) || (r.length === 1 && Math.hypot(r[0][0] - x, r[0][1] - z) <= o.width / 2));
  return o.rings.filter((r) => r.length > 2 && inside(x, z, r)).length % 2 === 1;
};
// what the paint lays: the paved ground (streets, gutters and kerbs, sidewalks, walks, drives and
// their aprons, a block's paving, lots, plazas, piers) and the open (yards, the cover's lawn, sand,
// parks and wild ground) — the overlays (flags, joints, stains, shadows, drift, markings) say nothing
const PAVED = new Set(['#b1ab9d', '#b3ad9f', '#bab4a6', '#bdb5a3', '#5c5e61', '#bcb6a8', '#aaa498', '#c4beb0', '#867f77', '#8b877c', '#8b867d', '#55575b', '#606265', '#6f6d68', '#b8b2a4', '#bab4a7', '#687a62', '#8a8883', '#c2baa8', '#9c8466', '#aaa698', '#aaa597', '#63c2cf', '#8b5a47', '#8c8378', '#6f6a63', '#8e8c86', '#7a5d42', '#a39884', '#8c7a5e']);
const OPEN = new Set(['#93a964', '#b9b4a9', '#ddd5c2', '#dccb9f', '#617043', '#8a955c', '#8c9761', '#9fb56d', '#8db35f', '#9fc373', '#cbbb93']);
const LAWN_THINGS = new Set<MicroId>(['birdbath', 'kayak', 'hoop', 'yardsign', 'salesign', 'surfboard']);

describe('the ground you walk on (the shore pack)', () => {
  const at = (f: string) => new URL(`../public/data/shore/${f}`, import.meta.url);
  const man = JSON.parse(readFileSync(at('manifest.json'), 'utf8'));
  const bin = readFileSync(at('terrain.bin')), tab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
  const shore = new Terrain(new TerrainLayer(tab, man.terrain.slice), new TerrainLayer(tab, man.terrain.backdrop));
  it('stands no lawn thing on paved ground, every kerb box and hydrant at its kerb, none on a shop\'s sidewalk', async () => {
    setMicroDate('2026-07-15');
    const P = new Painter(JSON.parse(readFileSync(at('paint.json'), 'utf8')) as WorldJson, [], (x, z) => shore.oceanDistAt(x, z));
    const lawnThings: { x: number; z: number; k: MicroId }[] = [], boxes: [number, number][] = [], hydrants: [number, number][] = [], shopDoors: [number, number][] = [];
    const carriage: { p: number[]; w: number }[] = [];
    for (const id of ['0_-1', '0_0']) {
      const spec = man.tiles.find((t: { id: string }) => t.id === id);
      const tj = JSON.parse(readFileSync(at(spec.file), 'utf8')) as TileJson;
      const t = await buildTile(tj, shore, spec, 0);
      P.addWalks(t.walks, id);
      // (a bike leant on its own lawn, not one at a shop's door)
      const homeBike = (x: number, z: number) => { let best: { d: number; k?: string } = { d: 12 }; for (const d of t.doors) { const dd = Math.hypot(d.wx - x, d.wz - z); if (dd < best.d) best = { d: dd, k: d.kind }; } return best.k === 'house'; };
      for (const q of recs(t.micro)) if (LAWN_THINGS.has(q.k) || (q.k === 'bike' && homeBike(q.x, q.z))) lawnThings.push(q);
      for (const o of t.objs) {
        const put = (list: [number, number][]) => { for (let i = 0; i + 15 < o.im!.length; i += 16) list.push([o.im![i + 12], o.im![i + 14]]); };
        if (o.k === 'inst' && o.n?.startsWith('mailbox:')) put(boxes);
        if (o.k === 'inst' && o.n === 'street:hydrants:kerb') put(hydrants);
      }
      for (const d of t.doors) if (d.kind === 'commercial') shopDoors.push([d.wx, d.wz]);
      for (const r of tj.roads) if (!r.lod && !r.br && !r.tu && /^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|trunk)$/.test(r.c)) carriage.push(r);
    }
    expect(lawnThings.length).toBeGreaterThan(10);
    expect(boxes.length).toBeGreaterThan(20);
    // 1. every lawn thing on a lawn or a yard's gravel: the paint's top layer under it is open ground
    const bad: string[] = [];
    for (const q of lawnThings) {
      const { ctx, ops } = paintRecorder();
      P.paint(ctx, q.x - 15, q.z - 15, q.x + 15, q.z + 15, 7, 2);
      const top = [...ops].reverse().find((o) => (PAVED.has(o.style) || OPEN.has(o.style)) && covers(o, q.x, q.z));
      if (top && PAVED.has(top.style)) bad.push(`${q.k} at ${q.x.toFixed(1)},${q.z.toFixed(1)} on ${top.style}`);
    }
    expect(bad).toEqual([]);
    // 2. a kerb box and a hydrant stand within 1 m of the kerb's face (outside every carriageway);
    //    no box within 10 m of a shop's door
    const kerbGap = (x: number, z: number) => {
      let best = Infinity;
      for (const r of carriage) for (let i = 0; i + 3 < r.p.length; i += 2) best = Math.min(best, segD(x, z, [r.p[i] / 10, r.p[i + 1] / 10], [r.p[i + 2] / 10, r.p[i + 3] / 10]) - r.w / 2);
      return best;
    };
    const misplaced = [...boxes.map((b) => ['box', ...b] as const), ...hydrants.map((b) => ['hydrant', ...b] as const)].filter(([, x, z]) => { const g = kerbGap(x, z); return !(g > 0.1 && g <= 1.0); });
    expect(misplaced.map(([k, x, z]) => `${k} at ${x.toFixed(1)},${z.toFixed(1)}: ${kerbGap(x, z).toFixed(2)} m out`)).toEqual([]);
    expect(boxes.filter(([x, z]) => shopDoors.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 10))).toEqual([]);
  }, 240000);
});
