import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Painter, DetailGround, slices } from '../src/world/groundPaint';
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
const work = { blurred: 0, drawn: 0, copied: 0 };
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
interface Frame { x: number; z: number; blurred: number; drawn: number; copied: number; uploaded: boolean; moved: boolean; inside: boolean }
// fly a window along v (m/s) for secs at 60 frames a second, metering each frame
function fly(D: DetailGround, from: [number, number], v: [number, number], secs: number, at?: (i: number) => void): Frame[] {
  const out: Frame[] = [];
  let ver = D.texture.version, bx = D.box.x, bz = D.box.y;
  for (let i = 0; i <= secs * 60; i++) {
    work.blurred = work.drawn = work.copied = 0;
    const x = from[0] + (v[0] * i) / 60, z = from[1] + (v[1] * i) / 60;
    at?.(i);
    D.update(x, z);
    const h = D.size / 2, cx = D.box.x + h, cz = D.box.y + h;
    out.push({ x, z, ...work, uploaded: D.texture.version !== ver, moved: D.box.x !== bx || D.box.y !== bz, inside: Math.abs(x - cx) < 0.42 * D.size && Math.abs(z - cz) < 0.42 * D.size });
    (ver = D.texture.version), (bx = D.box.x), (bz = D.box.y);
  }
  return out;
}

describe('the ground windows on a flight', () => {
  let doc: unknown;
  beforeAll(() => {
    doc = (globalThis as Record<string, unknown>).document;
    (globalThis as Record<string, unknown>).document = { createElement: () => new MeterCanvas() };
  });
  afterAll(() => { (globalThis as Record<string, unknown>).document = doc; });
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
