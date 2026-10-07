import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Painter, DetailGround, slices, inWindow } from '../src/world/groundPaint';
import { LANE, COVERS, laneLayout, wheelPaths } from '../src/world/groundCover';
import { lotLayout } from '../src/world/lots';
import type { Road, WorldJson, TerrainLayer } from '../src/world/data';

// A recording 2D context: every fill and stroke with its style, width and the rings it drew.
type Ring = [number, number][];
interface Op { op: 'fill' | 'stroke' | 'fillRect'; style: string; width: number; rings: Ring[] }
function recorder() {
  const ops: Op[] = [];
  let rings: Ring[] = [], cur: Ring | null = null;
  const st: Record<string, unknown> = { lineWidth: 1, fillStyle: '#000', strokeStyle: '#000' };
  const fns: Record<string, (...a: number[]) => void> = {
    beginPath: () => { rings = []; cur = null; },
    moveTo: (x, z) => { cur = [[x, z]]; rings.push(cur); },
    lineTo: (x, z) => { cur?.push([x, z]); },
    fill: () => { ops.push({ op: 'fill', style: String(st.fillStyle), width: 0, rings: rings.slice() }); },
    stroke: () => { ops.push({ op: 'stroke', style: String(st.strokeStyle), width: st.lineWidth as number, rings: rings.slice() }); },
    fillRect: (x, z, w, h) => { ops.push({ op: 'fillRect', style: String(st.fillStyle), width: 0, rings: [[[x, z], [x + w, z], [x + w, z + h], [x, z + h]]] }); },
  };
  const ctx = new Proxy({}, {
    get: (_, k: string) => fns[k] ?? (k in st ? st[k] : () => null),
    set: (_, k: string, v) => { st[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}
const PAVE = '#b1ab9d';
const json = { areas: [], roads: [], buildings: [] } as unknown as WorldJson;
const ang = (32 * Math.PI) / 180;
const rot = (u: number, v: number): [number, number] => [u * Math.cos(ang) - v * Math.sin(ang), u * Math.sin(ang) + v * Math.cos(ang)];
const box = (u: number, v: number, w: number, h: number): Ring => [rot(u, v), rot(u + w, v), rot(u + w, v + h), rot(u, v + h)];
const street = (a: [number, number], b: [number, number]): Road => ({ c: 'residential', w: 11, p: [a[0] * 10, a[1] * 10, b[0] * 10, b[1] * 10] });

function paint(rings: Ring[], weights: number[], roads: Road[] = []) {
  const P = new Painter(json, []);
  P.setTile('t', roads, rings, [-400, -400, 400, 400], rings.map(() => false), [], weights, []);
  const { ctx, ops } = recorder();
  P.paint(ctx, -150, -150, 150, 150, 7, 2);
  return ops.filter((o) => o.style === PAVE);
}

describe('block paving', () => {
  // a downtown on a grid turned 32° off north: 72 m blocks, four towers in each
  const towers: Ring[] = [];
  for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) for (let q = 0; q < 4; q++) towers.push(box(i * 72 + 13 + (q % 2) * 24, j * 72 + 13 + Math.floor(q / 2) * 24, 22, 22));
  const roads: Road[] = [];
  for (let k = -3; k <= 3; k++) roads.push(street(rot(k * 72, -250), rot(k * 72, 250)), street(rot(-250, k * 72), rot(250, k * 72)));
  it('paves round a dense grid in its own orientation — no north-up squares', () => {
    const ops = paint(towers, towers.map(() => 1), roads);
    expect(ops.some((o) => o.op === 'fillRect')).toBe(false);
    const aprons = ops.filter((o) => o.op === 'stroke');
    expect(aprons.length).toBeGreaterThan(0);
    // every ring the paving draws is a building's own outline
    const key = (r: Ring) => r.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join(' ');
    const outlines = new Set(towers.map(key));
    for (const o of aprons) for (const r of o.rings) expect(outlines.has(key(r))).toBe(true);
    // the towers in view are all paved, the core wider than the threshold's 8 m
    const paved = new Set(aprons.flatMap((o) => o.rings.map(key)));
    const inView = towers.filter((t) => t.every(([x, z]) => Math.abs(x) < 140 && Math.abs(z) < 140));
    expect(inView.every((t) => paved.has(key(t)))).toBe(true);
    expect(Math.max(...aprons.map((o) => o.width))).toBeGreaterThan(16);
  });
  it('leaves a street of houses its lawns', () => {
    const houses: Ring[] = [];
    for (let i = -8; i < 8; i++) for (let j = -8; j < 8; j++) houses.push(box(i * 20 + 5, j * 30 + 8, 10, 12));
    expect(paint(houses, houses.map(() => 0.45))).toEqual([]);
  });
  it('paves the apron of one big building standing alone (a store, a block of flats)', () => {
    const ops = paint([box(-20, -20, 40, 30)], [1]);
    expect(ops.filter((o) => o.op === 'stroke').length).toBe(1);
    expect(paint([box(-6, -6, 12, 12)], [1])).toEqual([]); // (a lone shed doesn't)
  });
});

// ---- The ground windows on a flight ----
// Re-centring a window used to repaint all of it in one frame: the land-cover wash through a 6 px
// blur, every street and lot, a 2048² upload. That was half a second a time where the 2D canvas is
// rastered on the CPU, every 66 m of a flight (Robby: "every ~2 seconds it locks up"). A metering
// canvas counts the raster work each frame asks for: each draw's pixels on its canvas (inside the
// clip), those that went through a blur, and the canvas-to-canvas copies.
const work = { blurred: 0, drawn: 0, copied: 0, calls: 0 };
type Box4 = [number, number, number, number];
class MeterCanvas {
  private w = 0;
  private h = 0;
  readonly ctx: MeterCtx = new MeterCtx(this);
  get width() { return this.w; }
  set width(v: number) { this.w = v; this.ctx.reset(); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; this.ctx.reset(); }
  getContext() { return this.ctx; }
}
class MeterCtx {
  [k: string]: unknown; // (styles and modes it doesn't meter)
  m = [1, 0, 0, 1, 0, 0];
  clipBox: Box4 | null = null;
  filter = 'none';
  lineWidth = 1;
  path: Box4 = [Infinity, Infinity, -Infinity, -Infinity];
  private stack: [number[], Box4 | null, string, number][] = [];
  constructor(readonly canvas: MeterCanvas) {}
  reset() { this.m = [1, 0, 0, 1, 0, 0]; this.clipBox = null; this.filter = 'none'; this.stack = []; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.m = [a, b, c, d, e, f]; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  save() { this.stack.push([this.m, this.clipBox, this.filter, this.lineWidth]); }
  restore() { const s = this.stack.pop(); if (s) [this.m, this.clipBox, this.filter, this.lineWidth] = s; }
  private pt(x: number, y: number) {
    const [a, b, c, d, e, f] = this.m, X = a * x + c * y + e, Y = b * x + d * y + f, p = this.path;
    (p[0] = Math.min(p[0], X)), (p[1] = Math.min(p[1], Y)), (p[2] = Math.max(p[2], X)), (p[3] = Math.max(p[3], Y));
  }
  beginPath() { this.path = [Infinity, Infinity, -Infinity, -Infinity]; }
  moveTo(x: number, y: number) { this.pt(x, y); }
  lineTo(x: number, y: number) { this.pt(x, y); }
  closePath() {}
  rect(x: number, y: number, w: number, h: number) { this.pt(x, y); this.pt(x + w, y); this.pt(x, y + h); this.pt(x + w, y + h); }
  arc(x: number, y: number, r: number) { this.pt(x - r, y - r); this.pt(x + r, y + r); }
  clip() { const b = this.path, c = this.clipBox; this.clipBox = c ? [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])] : [...b]; }
  private area(b: Box4) {
    const c = this.clipBox ?? [-Infinity, -Infinity, Infinity, Infinity];
    const w = Math.min(b[2], c[2], this.canvas.width) - Math.max(b[0], c[0], 0), h = Math.min(b[3], c[3], this.canvas.height) - Math.max(b[1], c[1], 0);
    return w > 0 && h > 0 ? w * h : 0;
  }
  private count(b: Box4) {
    const a = this.area(b);
    work.drawn += a;
    work.calls++;
    if (this.filter.includes('blur')) work.blurred += a;
  }
  fill() { this.count(this.path); }
  stroke() { const s = (Math.hypot(this.m[0], this.m[1]) * this.lineWidth) / 2, p = this.path; this.count([p[0] - s, p[1] - s, p[2] + s, p[3] + s]); }
  fillRect(x: number, y: number, w: number, h: number) { const p = this.path; this.beginPath(); this.rect(x, y, w, h); this.count(this.path); this.path = p; }
  clearRect() {}
  drawImage(img: MeterCanvas, ...a: number[]) {
    const [x, y, w, h] = a.length === 2 ? [a[0], a[1], img.width, img.height] : a.length === 4 ? a : a.slice(4);
    const p = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    const b = this.path;
    this.path = p;
    // a canvas laid on another at its own scale is a copy, not a raster
    const same = a.length === 2 || (a.length === 4 ? w === img.width && h === img.height : a[2] === a[6] && a[3] === a[7]);
    if (same && !this.filter.includes('blur') && this.m[0] === 1 && this.m[3] === 1) work.copied += this.area(b);
    else this.count(b);
  }
  createPattern() { return null; }
}
// a town on a grid (streets every 80 m, four houses a block) under a bake's land cover: a coarse
// backdrop round a finer slice
const town = (() => {
  const roads: Road[] = [], buildings: { r: number[]; h: number; k: string; roof: string; s: number }[] = [];
  for (let k = -20; k <= 20; k++) roads.push({ c: 'residential', w: 9, p: [k * 800, -16000, k * 800, 16000] }, { c: 'secondary', w: 13, p: [-16000, k * 800, 16000, k * 800] });
  for (let i = -20; i < 20; i++)
    for (let j = -20; j < 20; j++)
      for (let q = 0; q < 4; q++) {
        const x = i * 80 + 14 + (q % 2) * 30, z = j * 80 + 14 + Math.floor(q / 2) * 30;
        buildings.push({ r: [x, z, x + 14, z, x + 14, z + 12, x, z + 12].map((v) => v * 10), h: 7, k: 'house', roof: 'gable', s: 1 });
      }
  return { areas: [], roads, buildings } as unknown as WorldJson;
})();
const cover = (x0: number, z0: number, w: number, h: number, cell: number) => {
  const img = new MeterCanvas();
  img.width = w;
  img.height = h;
  return { img: img as unknown as HTMLCanvasElement, L: { g: { x0, z0, w, h, cell } } as unknown as TerrainLayer };
};
interface Frame { x: number; z: number; blurred: number; drawn: number; copied: number; calls: number; uploaded: boolean; moved: boolean; inside: boolean }
// fly a window along v (m/s) for secs at 60 frames a second, metering each frame
function fly(D: DetailGround, from: [number, number], v: [number, number], secs: number, at?: (i: number) => void): Frame[] {
  const out: Frame[] = [];
  let ver = D.texture.version, bx = D.box.x, bz = D.box.y;
  for (let i = 0; i <= secs * 60; i++) {
    work.blurred = work.drawn = work.copied = work.calls = 0;
    const x = from[0] + (v[0] * i) / 60, z = from[1] + (v[1] * i) / 60;
    at?.(i);
    D.update(x, z);
    const h = D.size / 2, cx = D.box.x + h, cz = D.box.y + h;
    out.push({ x, z, ...work, uploaded: D.texture.version !== ver, moved: D.box.x !== bx || D.box.y !== bz, inside: Math.abs(x - cx) < 0.42 * D.size && Math.abs(z - cz) < 0.42 * D.size });
    (ver = D.texture.version), (bx = D.box.x), (bz = D.box.y);
  }
  return out;
}

// (an OffscreenCanvas: a slice is painted on one and handed over as a bitmap)
class MeterOffscreen extends MeterCanvas {
  constructor(w: number, h: number) {
    super();
    this.width = w;
    this.height = h;
  }
  transferToImageBitmap() {
    const b = Object.assign(new MeterCanvas(), { close() {} });
    b.width = this.width;
    b.height = this.height;
    this.ctx.reset();
    return b;
  }
}

describe('the ground windows on a flight', () => {
  const g = globalThis as Record<string, unknown>;
  let doc: unknown, off: unknown;
  beforeAll(() => {
    (doc = g.document), (off = g.OffscreenCanvas);
    g.document = { createElement: () => new MeterCanvas() };
    g.OffscreenCanvas = MeterOffscreen;
  });
  afterAll(() => { (g.document = doc), (g.OffscreenCanvas = off); });
  const res = 2048, full = res * res;
  const covers = () => [cover(-3000, -3000, 600, 600, 10), cover(-800, -1500, 800, 1500, 2)];

  it('re-centres the 300 m window a slice a frame: no frame blurs or paints a whole window', () => {
    const D = new DetailGround(new Painter(town, []), covers(), res, 300, 2, 6);
    const f = fly(D, [0, -900], [0, 40], 12); // 480 m south at the default flying speed
    expect(f[0].uploaded).toBe(true); // (the first paint is whole, at once)
    const rest = f.slice(1), moves = rest.filter((r) => r.moved).length;
    expect(moves).toBeGreaterThanOrEqual(6); // (66 m a move)
    // the land-cover wash's blur was a whole window's worth three times over (lawn, backdrop, slice)
    // on every re-centre: now a slice of it, and only what the land cover doesn't hide
    expect(Math.max(...rest.map((r) => r.blurred))).toBeLessThanOrEqual(full / 8);
    expect(Math.max(...rest.map((r) => r.copied))).toBeLessThanOrEqual(full * 1.05); // (one slide across a move)
    // the texture goes up only when a move is whole, and the window moves with it
    for (const r of rest) expect(r.uploaded).toBe(r.moved);
    expect(rest.filter((r) => r.uploaded).length).toBe(moves);
    // …and it keeps up: the walker never nears the edge of the window shown
    expect(rest.every((r) => r.inside)).toBe(true);
  });
  it("the ground underfoot costs a slice a few dozen draws: a frame's raster stays a fraction of the window", () => {
    // (the town's streets with their sidewalks in flags, kerbs and gutters, its houses in yards,
    // the streets worn: everything the fine window lays, a slice at a time on a flight)
    const D = new DetailGround(new Painter(town, [], () => 200), covers(), res, 300, 2, 6);
    const f = fly(D, [0, -900], [0, 40], 12).slice(1).filter((r) => r.calls > 0);
    expect(f.length).toBeGreaterThan(20);
    // (measured 2026-10-01: at most 63 draws and 0.48 of a window's pixels a frame, 0.19 on average —
    // each draw metered at its whole box, so a batched path of joints counts its slice once)
    expect(Math.max(...f.map((r) => r.calls))).toBeLessThanOrEqual(80);
    expect(Math.max(...f.map((r) => r.drawn))).toBeLessThanOrEqual(full * 0.6);
    expect(f.reduce((s, r) => s + r.drawn, 0) / f.length).toBeLessThanOrEqual(full * 0.25);
  });
  it('keeps up on a diagonal and at four times the speed', () => {
    for (const v of [[28, -28], [0, 160], [113, 113]] as [number, number][]) {
      const D = new DetailGround(new Painter(town, []), covers(), res, 300, 2, 6);
      const f = fly(D, [100, 100], v, 6).slice(1);
      expect(f.filter((r) => r.moved).length).toBeGreaterThan(1);
      expect(f.every((r) => r.inside)).toBe(true);
      expect(Math.max(...f.map((r) => r.blurred))).toBeLessThanOrEqual(full / 4); // (two land-cover layers by the slice's edge)
    }
  });
  it('re-centres the 1.6 km window the same way', () => {
    const D = new DetailGround(new Painter(town, []), covers(), res, 1600, 1, 2);
    const f = fly(D, [0, -600], [0, 40], 30).slice(1);
    expect(f.filter((r) => r.moved).length).toBeGreaterThanOrEqual(3); // (352 m a move)
    expect(Math.max(...f.map((r) => r.blurred))).toBeLessThanOrEqual(full / 4);
    expect(f.every((r) => r.inside)).toBe(true);
  });
  it('repaints where a tile changed, a slice a frame, and shows it', () => {
    const P = new Painter(town, []), D = new DetailGround(P, covers(), res, 300, 2, 6);
    // a streamed tile lands under the window while it's moving, and another while it stands
    const tile = (i: number) => {
      if (i !== 70 && i !== 400) return;
      const b: [number, number, number, number] = [-100, i * 0.6 - 900, 50, i * 0.6 - 800];
      P.setTile(`t${i}`, [{ c: 'primary', w: 15, p: [b[0] * 10, b[1] * 10, b[2] * 10, b[3] * 10] }], [], b);
      D.touch(b);
    };
    const f = fly(D, [0, -900], [0, 40], 4, tile).concat(fly(D, [0, -740], [0, 0], 2, (i) => tile(i + 400 - 30)));
    expect(Math.max(...f.slice(1).map((r) => r.blurred))).toBeLessThanOrEqual(full / 8);
    // standing still, the change still goes up (within a second) — without moving the window
    const still = f.slice(241);
    expect(still.slice(30, 90).some((r) => r.uploaded && !r.moved)).toBe(true);
  });
  it("doesn't let tiles landing under it hold it back on a fast flight", () => {
    // (the real tiles past the bake: a stand-in, then the tile itself, then its relief — each one
    // repaints its part of both windows, and a move falling due mid-change takes the rest along)
    const P = new Painter(town, []), D = new DetailGround(P, covers(), res, 300, 2, 6);
    const f = fly(D, [0, -1200], [0, 160], 8, (i) => {
      if (i % 90 !== 45) return;
      const z = -1200 + (160 * i) / 60, b: [number, number, number, number] = [-200, z - 100, 200, z + 300];
      P.setTile(`t${i}`, [{ c: 'primary', w: 15, p: [-2000, z * 10, 2000, z * 10] }], [], b);
      D.touch(b);
    }).slice(1);
    expect(f.every((r) => r.inside)).toBe(true);
    expect(f.filter((r) => r.moved).length).toBeGreaterThanOrEqual(15); // (1280 m: 66 m a move)
    expect(Math.max(...f.map((r) => r.blurred))).toBeLessThanOrEqual(full / 4);
  });
});

describe('slices of a window', () => {
  it('cover the marked cells once, a slice at most `max`, the edge bands apart', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const N = 16, cell = 32, max = 16 * cell * cell * 3;
    for (let t = 0; t < 40; t++) {
      const m = new Uint8Array(N * N);
      for (let k = 0; k < 3; k++) {
        const i0 = Math.floor(rnd() * N), j0 = Math.floor(rnd() * N), i1 = Math.min(N, i0 + 1 + Math.floor(rnd() * N)), j1 = Math.min(N, j0 + 1 + Math.floor(rnd() * N));
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) m[j * N + i] = 1;
      }
      const seen = new Uint8Array(N * N);
      for (const [x0, z0, x1, z1] of slices(m, N, cell, max)) {
        expect((x1 - x0) * (z1 - z0)).toBeLessThanOrEqual(max);
        // along each axis: the outer cell alone, or clear of it
        for (const [a, b] of [[x0, x1], [z0, z1]]) expect((a === 0 && b === cell) || (a === (N - 1) * cell && b === N * cell) || (a >= cell && b <= (N - 1) * cell)).toBe(true);
        for (let j = z0 / cell; j < z1 / cell; j++) for (let i = x0 / cell; i < x1 / cell; i++) seen[j * N + i]++;
      }
      expect(seen).toEqual(m);
    }
  });
});

describe('a slice of the window', () => {
  it("draws the window's strokes that reach it, and only those, the same way", () => {
    // the town, and a streamed downtown over it turned 32°: paved blocks, worn streets
    const towers: Ring[] = [], roads: Road[] = [];
    for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) for (let q = 0; q < 4; q++) towers.push(box(i * 72 + 13 + (q % 2) * 24, j * 72 + 13 + Math.floor(q / 2) * 24, 22, 22));
    for (let k = -3; k <= 3; k++) roads.push(street(rot(k * 72, -250), rot(k * 72, 250)), street(rot(-250, k * 72), rot(250, k * 72)));
    const P = new Painter(town, []);
    P.setTile('t', roads, towers, [-400, -400, 400, 400], towers.map(() => false), [], towers.map(() => 1), []);
    const whole = recorder(), part = recorder();
    P.paint(whole.ctx, -150, -150, 150, 150, 6.8, 2);
    const clip: [number, number, number, number] = [-20, -150, 40, 150];
    P.paint(part.ctx, -150, -150, 150, 150, 6.8, 2, clip);
    const id = (o: Op, r: Ring) => `${o.op} ${o.style} ${o.width} ${JSON.stringify(r)}`;
    // every outline the slice draws, the window draws the same way (a band of paving is one path of
    // a few outlines: the slice's holds those of the window's that reach it)
    const wholeRings = new Set(whole.ops.flatMap((o) => o.rings.map((r) => id(o, r))));
    for (const o of part.ops) for (const r of o.rings) expect(wholeRings.has(id(o, r))).toBe(true);
    // …and every one of the window's that could touch a pixel of the slice is there
    const partRings = new Set(part.ops.flatMap((o) => o.rings.map((r) => id(o, r))));
    const touches = (r: Ring, pad: number) => {
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      return Math.max(...xs) + pad > clip[0] && Math.min(...xs) - pad < clip[2] && Math.max(...zs) + pad > clip[1] && Math.min(...zs) - pad < clip[3];
    };
    let n = 0;
    for (const o of whole.ops) for (const r of o.rings) if (touches(r, o.width / 2 + 0.5)) (n++, expect(partRings.has(id(o, r))).toBe(true));
    expect(n).toBeGreaterThan(50);
    expect(whole.ops.some((o) => o.style === PAVE) && part.ops.some((o) => o.style === PAVE)).toBe(true);
    expect(part.ops.length).toBeLessThan(whole.ops.length);
  });
});

// ---- The ground you walk on (the fine window) ----
// A residential street running east-west through z = 0 with houses on its north side (front walks
// and drives to the kerb), a main road across it at x = 60, and a beach to the south.
describe('the ground underfoot', () => {
  const S = { joint: '#857f73', face: '#867f77', faceMain: '#8b877c', gutter: '#8b867d', apron: '#c4beb0', drift: '#d8c69a', snake: 'rgba(24,23,22,0.66)', lawn: '#93a964', gravel: '#b9b4a9', shell: '#ddd5c2', worn: '#000', oil: 'rgba(32,28,24,0.13)', iron: '#4e4a44' };
  const house = (x: number, z: number): number[] => [x - 5, z - 4, x + 5, z - 4, x + 5, z + 4, x - 5, z + 4].map((v) => Math.round(v * 10));
  const scene = (beachZ: number) => ({
    areas: [{ c: 'beach', o: [[-150, beachZ, 150, beachZ, 150, beachZ + 40, -150, beachZ + 40].map((v) => v * 10)], i: [] }],
    roads: [{ c: 'residential', w: 6.5, p: [-1200, 0, 1200, 0] }, { c: 'primary', w: 11, p: [600, -1200, 600, 1200] }],
    buildings: Array.from({ length: 8 }, (_, i) => ({ r: house(-90 + i * 16, -14), k: 'house' })),
  }) as unknown as WorldJson;
  // each house's walk to the kerb, and every other one's drive (x0 z0 x1 z1 width: the street end last)
  const walks: number[] = [];
  for (let i = 0; i < 8; i++) {
    walks.push(-90 + i * 16, -9.5, -90 + i * 16, -3.85, 1.1);
    if (i % 2) walks.push(-84 + i * 16, -9.5, -84 + i * 16, -3.85, 2.9);
  }
  const painted = (beachZ = 20, clip?: [number, number, number, number]) => {
    const P = new Painter(scene(beachZ), walks, () => 200);
    const { ctx, ops } = recorder();
    P.paint(ctx, -100, -50, 100, 50, 6.83, 2, clip);
    return ops;
  };
  it("scores the sidewalk in 1.5 m flags (a centre joint down a wide one), and draws the kerb's face, the gutter pan and the drives' aprons", () => {
    const ops = painted();
    const joints = ops.filter((o) => o.op === 'stroke' && o.style === S.joint).flatMap((o) => o.rings);
    // the residential walk's joints, north side: across the band from the kerb's face (3.4 m) to its back (4.75)
    const north = joints.filter((r) => r.length === 2 && Math.abs(r[0][1] + 3.4) < 0.01 && Math.abs(r[1][1] + 4.75) < 0.01).map((r) => r[0][0]).sort((a, b) => a - b);
    expect(north.length).toBeGreaterThan(80);
    for (let i = 1; i < north.length; i++) expect(north[i] - north[i - 1]).toBeCloseTo(1.5, 6); // (counted from the way's start)
    // the main road's 3.5 m walks get a centre joint down the middle of each
    expect(joints.some((r) => r.length >= 2 && Math.abs(r[0][0] - (60 + (5.5 + 0.15 + 9) / 2)) < 0.01 && Math.abs(r[0][0] - r[r.length - 1][0]) < 0.01)).toBe(true);
    // the kerb: its face 15 cm each side; the gutter over the whole carriageway, the asphalt 0.6 m in
    const widths = (style: string) => ops.filter((o) => o.op === 'stroke' && o.style === style).map((o) => o.width);
    expect(widths(S.face)).toContain(6.5 + 0.3);
    expect(widths(S.faceMain)).toContain(11 + 0.3);
    expect(widths(S.gutter)).toContain(6.5);
    expect(widths(S.gutter)).toContain(11);
    expect(widths('#606265')).toContain(6.5 - 1.2);
    // each drive's apron across the walk, kerb to back — drawn over the kerb's face (the kerb cut)
    const aprons = ops.filter((o) => o.op === 'fill' && o.style === S.apron).flatMap((o) => o.rings);
    expect(aprons.length).toBe(4);
    for (const r of aprons) {
      const zs = r.map((p) => p[1]).sort((a, b) => a - b);
      expect(zs[0]).toBeCloseTo(-4.75, 3);
      expect(zs[3]).toBeCloseTo(-3.25, 3);
    }
    expect(ops.findIndex((o) => o.style === S.apron)).toBeGreaterThan(ops.findIndex((o) => o.style === S.face));
  });
  it("stands the houses in yards — never the walk's concrete — and wears the street and drifts the beach's sand over its walks", () => {
    const ops = painted();
    const yards = ops.filter((o) => [S.lawn, S.gravel, S.shell].includes(o.style));
    expect(yards.length).toBeGreaterThan(0);
    expect(ops.some((o) => o.style === PAVE)).toBe(false); // (a street of houses isn't a paved block)
    // every house is in one yard: its outline filled and stroked out to 5 m (and stroked again into
    // the alpha where the yard is loose stone)
    for (let i = 0; i < 8; i++) {
      const mine = yards.filter((o) => o.rings.some((r) => Math.abs(r[0][0] - (-95 + i * 16)) < 0.01 && Math.abs(r[0][1] + 18) < 0.01));
      expect(mine.filter((o) => o.op === 'fill').length).toBe(1);
      expect(new Set(mine.map((o) => o.style)).size).toBe(1);
    }
    expect(yards.filter((o) => o.op === 'stroke').every((o) => o.width === 10)).toBe(true);
    expect(ops.some((o) => o.style === S.snake && o.rings.length > 5)).toBe(true); // (tar snakes on the bake's own street)
    expect(ops.filter((o) => o.style === S.drift).flatMap((o) => o.rings).length).toBeGreaterThan(20);
    expect(painted(400).some((o) => o.style === S.drift)).toBe(false); // (no beach within 60 m: no drift)
  });
  it("is the same ground every time, and a slice draws exactly the window's strokes that reach it", () => {
    const id = (o: Op, r: Ring) => `${o.op} ${o.style} ${o.width} ${JSON.stringify(r)}`;
    const a = painted(), b = painted();
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
    const clip: [number, number, number, number] = [-31, -50, 7, 50];
    const part = painted(20, clip);
    const whole = new Set(a.flatMap((o) => o.rings.map((r) => id(o, r))));
    for (const o of part) for (const r of o.rings) expect(whole.has(id(o, r)), id(o, r).slice(0, 120)).toBe(true);
    const mine = new Set(part.flatMap((o) => o.rings.map((r) => id(o, r))));
    const touches = (r: Ring, pad: number) => {
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      return Math.max(...xs) + pad > clip[0] && Math.min(...xs) - pad < clip[2] && Math.max(...zs) + pad > clip[1] && Math.min(...zs) - pad < clip[3];
    };
    let n = 0;
    for (const o of a) for (const r of o.rings) if (touches(r, o.width / 2 + 0.05)) (n++, expect(mine.has(id(o, r)), id(o, r).slice(0, 120)).toBe(true));
    expect(n).toBeGreaterThan(100);
    for (const s of [S.joint, S.apron, S.drift, S.snake, S.gutter, S.face, S.worn, S.oil, S.iron]) expect(part.some((o) => o.style === s), s).toBe(true);
  });
});

// ---- A street's structure past the aggregate (review round 12, must-fix 2) ----
describe('the street as traffic wears it', () => {
  const S = { worn: '#000', oil: 'rgba(32,28,24,0.13)', iron: '#4e4a44' };
  const rec = (json: WorldJson, x0 = -100, z0 = -50, x1 = 100, z1 = 50, clip?: [number, number, number, number]) => {
    const P = new Painter(json, [], () => 2000);
    const { ctx, ops } = recorder();
    P.paint(ctx, x0, z0, x1, z1, 6.83, 2, clip);
    return ops;
  };
  const centre = (r: Ring) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  it('lays out a street kerb to kerb: two lanes on a residential street, parked kerbs on a wide one, the map\'s parking first', () => {
    // a 6.5 m residential street inside its gutter pans: a lane each way, nobody parked
    const res = laneLayout({}, 6.5 - 1.2, true);
    expect(res.park).toEqual([]);
    expect(res.travel.map((l) => +l.o.toFixed(3))).toEqual([1.325, -1.325]);
    // an 11 m main street (Ocean Ave): both kerbs parked, a lane each way between
    const main = laneLayout({}, 11 - 1.2, true);
    expect(main.park.map((l) => [+l.o.toFixed(2), l.w])).toEqual([[3.8, 2.2], [-3.8, 2.2]]);
    expect(main.travel.length).toBe(2);
    // …but not outside North America, where only mapped parking counts; mapped angled bays on the left
    expect(laneLayout({}, 9.8, false).park).toEqual([]);
    const bays = laneLayout({ pk: 2 }, 14, true);
    expect(bays.park).toEqual([{ o: 7 - LANE.angled / 2, w: LANE.angled, mode: 2 }]);
    // a one-way service lane: one lane, its wheel paths inside it
    const one = laneLayout({ ow: 1 }, 4, false);
    expect(one.travel.length).toBe(1);
    for (const lane of [...res.travel, ...main.travel, ...one.travel]) for (const o of wheelPaths(lane)) expect(Math.abs(o - lane.o) + LANE.path / 2).toBeLessThan(lane.w / 2);
  });
  it('wears each lane two wheel paths (marked smooth in the alpha), streaks its middle with oil, and sets manholes and valve covers down the street', () => {
    const json = { areas: [], roads: [{ c: 'residential', w: 6.5, p: [-1200, 0, 1200, 0] }], buildings: [] } as unknown as WorldJson;
    const ops = rec(json);
    // the wheel paths: erased to WORN_ALPHA along the lanes, ±0.475 and ±2.175 m off the centre line
    // (each lane's middle ± half a track)
    const worn = ops.filter((o) => o.op === 'stroke' && o.style === S.worn && o.width === LANE.path).flatMap((o) => o.rings);
    expect(worn.map((r) => +r[0][1].toFixed(3)).sort((a, b) => a - b)).toEqual([-2.175, -0.475, 0.475, 2.175]);
    for (const r of worn) expect(r.every((p) => p[1] === r[0][1])).toBe(true); // (straight down the street)
    // the oil: smears down each lane's middle (1.325 m off the centre line), none in the wheel paths
    const oil = ops.filter((o) => o.op === 'fill' && o.style === S.oil).flatMap((o) => o.rings).map(centre);
    expect(oil.length).toBeGreaterThan(40);
    for (const [, z] of oil) expect(Math.abs(Math.abs(z) - 1.325)).toBeLessThan(0.13);
    // the covers: manholes on the centre line, evenly between the way's ends (240 m: two), valve covers
    // toward a kerb (240 m: three)
    const iron = ops.filter((o) => o.op === 'fill' && o.style === S.iron).flatMap((o) => o.rings);
    const big = iron.filter((r) => r.length === 14).map(centre), small = iron.filter((r) => r.length === 8).map(centre);
    expect(big.map(([x, z]) => [Math.round(x), Math.round(z)])).toEqual([[-40, 0], [40, 0]]);
    expect(small.map(([x]) => Math.round(x) + 0)).toEqual([-80, 0, 80]);
    for (const [, z] of small) expect(Math.abs(z)).toBeCloseTo(6.5 / 2 - KERB_GUTTER - 1.1, 3);
    for (const r of iron.filter((r) => r.length === 14)) expect(Math.hypot(r[0][0] - centre(r)[0], r[0][1] - centre(r)[1])).toBeCloseTo(COVERS.manhole, 3);
  });
  it('puts a manhole in every junction and valve covers into its arms, the same from every slice', () => {
    // a residential street ending on a main road at (60, 0), and the main road through the node
    const json = { areas: [], buildings: [], roads: [{ c: 'residential', w: 6.5, p: [-1000, 0, 600, 0] }, { c: 'primary', w: 11, p: [600, -1000, 600, 0, 600, 1000] }] } as unknown as WorldJson;
    const ops = rec(json);
    const iron = ops.filter((o) => o.op === 'fill' && o.style === S.iron).flatMap((o) => o.rings);
    expect(iron.filter((r) => r.length === 14).map(centre).some(([x, z]) => Math.hypot(x - 60, z) < 1.7)).toBe(true);
    expect(iron.filter((r) => r.length === 8).map(centre).some(([x, z]) => Math.hypot(x - 60, z) > 3 && Math.hypot(x - 60, z) < 9)).toBe(true);
    // the same covers from a slice through the junction
    const part = rec(json, -100, -50, 100, 50, [50, -10, 70, 10]);
    const key = (r: Ring) => r.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' ');
    const whole = new Set(iron.map(key));
    const mine = part.filter((o) => o.op === 'fill' && o.style === S.iron).flatMap((o) => o.rings);
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) expect(whole.has(key(r))).toBe(true);
    for (const r of iron) if (centre(r)[0] > 49 && centre(r)[0] < 71 && Math.abs(centre(r)[1]) < 11) expect(mine.map(key)).toContain(key(r));
  });
  it('stains about two in three of a lot\'s stalls under the engine', () => {
    const lot = [[0, 0], [40, 0], [40, 30], [0, 30]].flatMap(([x, z]) => [x * 10, z * 10]);
    const json = { areas: [{ c: 'parking', o: [lot], i: [] }], roads: [], buildings: [] } as unknown as WorldJson;
    const stalls = lotLayout([[0, 0], [40, 0], [40, 30], [0, 30]])!.stalls;
    const oil = rec(json).filter((o) => o.op === 'fill' && o.style === S.oil).flatMap((o) => o.rings).map(centre);
    expect(oil.length).toBeGreaterThan(stalls.length * 0.5);
    expect(oil.length).toBeLessThan(stalls.length * 0.85);
    // each a little toward its stall's nose
    for (const [x, z] of oil) expect(stalls.some((s) => Math.abs(Math.hypot(x - s.x, z - s.z) - 0.9) < 0.01)).toBe(true);
  });
});
const KERB_GUTTER = 0.6;

describe('inWindow', () => {
  // (the painter's lists by 64 m cell: a 20 m grass mask asked the whole of a 1 km tile's footprints)
  it("gives every item within 100 m of the window, in the list's order; a long one always; a wide window the list itself", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const list = Array.from({ length: 600 }, (_, i) => {
      const x = rnd() * 3000 - 1500, z = rnd() * 3000 - 1500, w = i % 50 === 0 ? 1800 : rnd() * 40, d = i % 50 === 0 ? 30 : rnd() * 40;
      return { x0: x, z0: z, x1: x + w, z1: z + d, i };
    });
    for (let k = 0; k < 200; k++) {
      const x0 = rnd() * 3000 - 1500, z0 = rnd() * 3000 - 1500, s = 5 + rnd() * 300, x1 = x0 + s, z1 = z0 + s;
      const got = inWindow(list, x0, z0, x1, z1);
      const want = list.filter((p) => p.x1 > x0 - 100 && p.x0 < x1 + 100 && p.z1 > z0 - 100 && p.z0 < z1 + 100);
      const ids = new Set(got.map((p) => p.i));
      for (const p of want) expect(ids.has(p.i), `item ${p.i} for window ${k}`).toBe(true);
      for (let j = 1; j < got.length; j++) expect(got[j].i).toBeGreaterThan(got[j - 1].i);
      expect(got.length).toBeLessThan(list.length);
    }
    expect(inWindow(list, -1500, -1500, 1500, 1500)).toBe(list);
    const few = list.slice(0, 100);
    expect(inWindow(few, 0, 0, 10, 10)).toBe(few);
  });
});
