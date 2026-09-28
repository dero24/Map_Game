import { describe, it, expect } from 'vitest';
import { readMvt, ringArea } from '../src/world/mvt';
import { waterSheets } from '../src/world/synth';

// MF1: the stand-in's water comes from OpenFreeMap's vector tiles. A hand-encoded tile (the
// protobuf the CDN sends): a `water` layer with the sea (an island in it) and a pool, and a
// `building` layer the reader must skip unread.
const varint = (v: number, o: number[]) => { while (v >= 0x80) { o.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } o.push(v); };
const key = (f: number, w: number, o: number[]) => varint((f << 3) | w, o);
const bytes = (f: number, b: number[], o: number[]) => { key(f, 2, o); varint(b.length, o); o.push(...b); };
const str = (f: number, s: string, o: number[]) => bytes(f, [...new TextEncoder().encode(s)], o);
const zz = (n: number) => (n << 1) ^ (n >> 31);
/** Geometry commands for polygon rings (each ring: MoveTo, LineTo × n−1, ClosePath). */
function geom(rings: [number, number][][]) {
  const g: number[] = [];
  let cx = 0, cy = 0;
  for (const r of rings) {
    g.push((1 << 3) | 1, zz(r[0][0] - cx), zz(r[0][1] - cy));
    [cx, cy] = r[0];
    g.push(((r.length - 1) << 3) | 2);
    for (const [x, y] of r.slice(1)) (g.push(zz(x - cx), zz(y - cy)), ([cx, cy] = [x, y]));
    g.push((1 << 3) | 7);
  }
  return g;
}
function feature(tags: number[], type: number, g: number[]) {
  const o: number[] = [];
  const packed = (f: number, a: number[]) => { const b: number[] = []; for (const v of a) varint(v, b); bytes(f, b, o); };
  packed(2, tags);
  key(3, 0, o); varint(type, o);
  packed(4, g);
  return o;
}
function layer(name: string, keys: string[], vals: string[], feats: number[][]) {
  const o: number[] = [];
  key(15, 0, o); varint(2, o); // version
  str(1, name, o);
  for (const f of feats) bytes(2, f, o);
  for (const k of keys) str(3, k, o);
  for (const v of vals) { const b: number[] = []; str(1, v, b); bytes(4, b, o); }
  key(5, 0, o); varint(4096, o);
  return o;
}
function tile() {
  // the sea: the whole tile, clockwise on screen (y down) = positive; an island, anticlockwise
  const sea: [number, number][] = [[0, 0], [4096, 0], [4096, 4096], [0, 4096]];
  const island: [number, number][] = [[1000, 1000], [1000, 2000], [2000, 2000], [2000, 1000]];
  const pool: [number, number][] = [[3000, 3000], [3100, 3000], [3100, 3100], [3000, 3100]];
  const water = layer('water', ['class'], ['ocean', 'swimming_pool'], [feature([0, 0], 3, geom([sea, island])), feature([0, 1], 3, geom([pool]))]);
  const building = layer('building', ['render_height'], ['12'], [feature([0, 0], 3, geom([pool]))]);
  const o: number[] = [];
  bytes(3, building, o);
  bytes(3, water, o);
  return new Uint8Array(o);
}

describe('readMvt', () => {
  it('decodes the layers it is asked for — rings, tags, extent — and skips the rest', () => {
    const ls = readMvt(tile(), (n) => n === 'water');
    expect(ls.map((l) => l.name)).toEqual(['water']);
    const [sea, pool] = ls[0].features;
    expect(ls[0].extent).toBe(4096);
    expect(sea.type).toBe(3);
    expect(sea.tags.class).toBe('ocean');
    expect(pool.tags.class).toBe('swimming_pool');
    expect(sea.rings.length).toBe(2);
    expect(sea.rings[0]).toEqual([[0, 0], [4096, 0], [4096, 4096], [0, 4096]]);
    expect(sea.rings[1][2]).toEqual([2000, 2000]);
  });
  it('tells an outer ring from a hole by its winding (spec 4.3.4.4)', () => {
    const [sea] = readMvt(tile(), (n) => n === 'water')[0].features;
    expect(ringArea(sea.rings[0])).toBeGreaterThan(0);
    expect(ringArea(sea.rings[1])).toBeLessThan(0);
    expect(Math.abs(ringArea(sea.rings[1]))).toBe(1000 * 1000);
  });
});

describe('waterSheets', () => {
  it('lays each lake flat at its level, clipped to the cell (a lake four cells long is four sheets)', () => {
    const box = { x0: 0, z0: 0, x1: 100, z1: 100 };
    const g = waterSheets([
      { ring: [[-50, 20], [300, 20], [300, 80], [-50, 80]], level: 6.4 },
      { ring: [[10, 10], [20, 10], [20, 20]] }, // the sea: no sheet
    ], box);
    expect(g.children.length).toBe(1);
    const pos = (g.children[0] as import('three').Mesh).geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getX(i)).toBeGreaterThanOrEqual(0);
      expect(pos.getX(i)).toBeLessThanOrEqual(100);
      expect(pos.getY(i)).toBeCloseTo(6.46, 5);
    }
  });
  it('leaves an island dry (a hole in the sheet)', () => {
    const g = waterSheets([{ ring: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[40, 40], [40, 60], [60, 60], [60, 40]]], level: 2 }], { x0: 0, z0: 0, x1: 100, z1: 100 });
    const geo = (g.children[0] as import('three').Mesh).geometry, p = geo.getAttribute('position'), ix = geo.getIndex()!;
    let area = 0;
    for (let t = 0; t < ix.count; t += 3) {
      const [a, b, c] = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
      area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getX(c) - p.getX(a)) * (p.getZ(b) - p.getZ(a))) / 2;
    }
    expect(area).toBeCloseTo(100 * 100 - 20 * 20, 0);
  });
});
