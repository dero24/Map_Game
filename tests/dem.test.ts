import { describe, it, expect } from 'vitest';
import { demLayer, type DemGrid } from '../src/world/dem';
import { TerrainLayer } from '../src/world/data';

// H2: DEM patch packing — heights as f32 cm (mountains past 327 m), sdf/flags honest
// about sea (h <= 0.5 m => water), defaults land-ish elsewhere.
describe('demLayer', () => {
  const grid = (h: number[]): DemGrid => ({ heights: Float32Array.from(h), x0: 0, z0: 0, pitch: 16, nx: 2, nz: 2 });

  it('keeps heights in metres through the f32 channel (no 327 m i16 cap)', () => {
    const { buf, layout } = demLayer(grid([1600, 2400, -0.5, 55]));
    const L = new TerrainLayer(buf, layout);
    expect(L.heightAt(8, 8)).toBeCloseTo(1600, 0); // grid nodes sit at half-cell offsets
    // Edge nodes bilinear-clamp a hair inside (w-1.001) — assert within 1 m, not exact.
    expect(L.heightAt(24, 8)).toBeGreaterThan(2399);
    expect(L.heightAt(8, 24)).toBeLessThan(2); // -0.5 m node, edge-blended toward the 1600 m neighbour
    expect(L.heightAt(24, 24)).toBeGreaterThan(54);
  });

  it('derives sdf+water flags from elevation — sea reads as water, land as inland', () => {
    const { buf, layout } = demLayer(grid([0, 20, 0.4, 90]));
    const L = new TerrainLayer(buf, layout);
    expect(L.sdfAt(8, 8)).toBeLessThan(0); // sea node
    expect(L.sdfAt(8, 24)).toBeLessThan(0); // 0.4 m — shoreline flat, still water
    expect(L.sdfAt(24, 8)).toBeGreaterThan(0); // 20 m land
    expect(L.sdfAt(24, 24)).toBeGreaterThan(0); // 90 m land
    const flags = L.flags;
    expect(flags[0]).toBe(1); // water flag on the sea node
    expect(flags[2]).toBe(1);
    expect(flags[1]).toBe(0); // land: no water flag
    expect(flags[3]).toBe(0);
  });

  it('cover/oceanD get honest defaults (grass; far-from-sea on land, at-sea in water)', () => {
    const { buf, layout } = demLayer(grid([0, 50, 50, 50]));
    const L = new TerrainLayer(buf, layout);
    expect(L.coverAt(8, 8)).toBe(30);
    expect(L.oceanDistAt(8, 8)).toBe(0); // sea node
    expect(L.oceanDistAt(24, 24)).toBeCloseTo(510, 0); // land: 255*2 (edge bilinear blends a hair)
  });
});

// MF1: the map's water pressed into a cell's ground — the sea below the datum, a lake at its
// level, an island (a hole in its water) left standing; nodes are cell centres.
import { waterPatch, waterLevel } from '../src/world/dem';
describe('waterPatch / waterLevel', () => {
  // a 10×10 grid of 16 m cells at 20 m, one corner node at 4 m
  const land = () => {
    const h = new Array(100).fill(20);
    return demLayer({ heights: Float32Array.from(h), x0: 0, z0: 0, pitch: 16, nx: 10, nz: 10 });
  };
  const sq = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

  it('drops the sea to a flat floor below the datum and flags it water, but not its island', () => {
    const w = waterPatch(land(), [{ ring: sq(0, 0, 160, 80), holes: [sq(48, 16, 80, 48)] }]);
    const L = new TerrainLayer(w.buf, w.layout);
    expect(L.flags[0] & 1).toBe(1); // node (0,0) at (8,8): sea
    expect(L.heightAt(8, 8)).toBeCloseTo(-6, 1);
    expect(L.oceanDistAt(8, 8)).toBe(0);
    expect(L.flags[2 * 10 + 4] & 1).toBe(0); // node (4,2) at (72,40): on the island
    expect(L.flags[7 * 10 + 7] & 1).toBe(0); // node (7,7) at (120,120): inland
    expect(L.heightAt(120, 120)).toBeCloseTo(20, 1);
  });

  it('samples each node at its cell centre (half a pitch in)', () => {
    // a strip 0..12 m wide holds no node centre (they sit at 8, 24, …) until it passes 8 m
    const a = waterPatch(land(), [{ ring: sq(0, 0, 6, 160) }]);
    expect(new Uint8Array(a.buf, a.layout.flags.offset, 100)[0] & 1).toBe(0);
    const b = waterPatch(land(), [{ ring: sq(0, 0, 10, 160) }]);
    expect(new Uint8Array(b.buf, b.layout.flags.offset, 100)[0] & 1).toBe(1);
  });

  it('puts a lake at its level and the sea first where both are mapped', () => {
    const w = waterPatch(land(), [{ ring: sq(0, 0, 80, 160), level: 12 }, { ring: sq(0, 0, 40, 160) }]);
    const L = new TerrainLayer(w.buf, w.layout);
    expect(L.heightAt(56, 88)).toBeCloseTo(11.5, 1); // the lake: half a metre under its level
    expect(L.heightAt(8, 88)).toBeCloseTo(-6, 1); // the sea (mapped over the lake) wins
  });

  it('reads a lake\'s level from the flattened DEM inside it, not its smeared shore', () => {
    // a hydro-flattened lake at 6.4 m, its banks smeared up to 20 m over the outer ring of nodes
    const h = new Array(100).fill(20);
    for (let j = 2; j < 8; j++) for (let i = 2; i < 8; i++) h[j * 10 + i] = 6.4;
    for (let i = 2; i < 8; i++) h[2 * 10 + i] = 11; // a bluff's smear reaching in
    const d = demLayer({ heights: Float32Array.from(h), x0: 0, z0: 0, pitch: 16, nx: 10, nz: 10 });
    const lvl = waterLevel(d, { ring: sq(30, 30, 130, 130) }, () => 20);
    expect(lvl).toBeCloseTo(6.4, 1);
    // too small to hold six nodes: the shore's low ground
    const small = waterLevel(d, { ring: sq(60, 60, 70, 70) }, (x) => (x < 65 ? 5 : 9));
    expect(small).toBe(5);
  });
});

describe('waterPatch with the map as truth', () => {
  it('turns the DEM\'s sea back into land where the map says land (a shore\'s smear, a town below sea level)', () => {
    const h = new Array(100).fill(20);
    for (let i = 0; i < 100; i++) if (i % 10 < 3) h[i] = -2; // three columns the DEM calls sea (-2 m)
    const d = demLayer({ heights: Float32Array.from(h), x0: 0, z0: 0, pitch: 16, nx: 10, nz: 10 });
    const sq = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    // the map's sea covers only the first column
    const kept = waterPatch(d, [{ ring: sq(0, 0, 16, 160) }]);
    const truth = waterPatch(d, [{ ring: sq(0, 0, 16, 160) }], true);
    const fk = (w: typeof kept) => new Uint8Array(w.buf, w.layout.flags.offset, 100);
    expect(fk(kept)[1] & 1).toBe(1); // (DEM water left alone)
    expect(fk(truth)[0] & 1).toBe(1); // the map's sea
    expect(fk(truth)[1] & 1).toBe(0); // the DEM's "sea" the map calls land
    expect(new TerrainLayer(truth.buf, truth.layout).heightAt(40, 88)).toBeCloseTo(0.5, 1);
    expect(new TerrainLayer(truth.buf, truth.layout).sdfAt(40, 88)).toBeGreaterThan(0);
  });
});

describe('waterPatch below the datum', () => {
  it('a basin below sea level is dry land at the datum, its lake a lake there too (the open world\'s one ocean plane)', () => {
    const h = new Array(100).fill(-60);
    const d = demLayer({ heights: Float32Array.from(h), x0: 0, z0: 0, pitch: 16, nx: 10, nz: 10 });
    const sq: [number, number][] = [[30, 30], [130, 30], [130, 130], [30, 130]];
    const lvl = waterLevel(d, { ring: sq }, () => -60);
    expect(lvl).toBe(0);
    const w = waterPatch(d, [{ ring: sq, level: lvl }], true);
    const L = new TerrainLayer(w.buf, w.layout);
    expect(L.heightAt(72, 72)).toBeLessThan(0.5); // the lake's bed under its surface
    expect(L.oceanDistAt(72, 72)).toBeGreaterThan(0); // (a lake, not the sea)
    expect(L.heightAt(8, 8)).toBeCloseTo(0.5, 1); // its shore dry, just above the plane
    expect(L.flags[0] & 1).toBe(0);
  });
});

// Terrarium straight from its PNG (no canvas: every device the same heights; an old iPhone's worker,
// which has no OffscreenCanvas, reads them too). A tiny encoder here writes each scanline with a
// different filter, so all five are undone.
import { terrariumFromPng, flatDem } from '../src/world/dem';
import { zlibSync } from 'three/examples/jsm/libs/fflate.module.js';
describe('terrariumFromPng', () => {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const encode = (heights: Float32Array, bpp: 3 | 4) => {
    const w = 256, stride = w * bpp, px = new Uint8Array(w * w * bpp);
    heights.forEach((m, k) => { const v = Math.round((m + 32768) * 256); px.set([v >> 16, (v >> 8) & 255, v & 255], k * bpp); if (bpp === 4) px[k * bpp + 3] = 255; });
    const raw = new Uint8Array(w * (stride + 1));
    for (let y = 0; y < w; y++) {
      const f = y % 5, row = y * stride;
      raw[y * (stride + 1)] = f;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? px[row + i - bpp] : 0, b = y ? px[row - stride + i] : 0, c = y && i >= bpp ? px[row - stride + i - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        raw[y * (stride + 1) + 1 + i] = (px[row + i] - pred) & 255;
      }
    }
    const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, w);
    ihdr.set([8, bpp === 4 ? 6 : 2, 0, 0, 0], 8);
    const z = zlibSync(raw), half = z.length >> 1; // (two IDATs: a stream split across chunks)
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', z.subarray(0, half)), chunk('IDAT', z.subarray(half)), chunk('IEND', new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((s, q) => s + q.length, 0));
    parts.reduce((at, q) => (out.set(q, at), at + q.length), 0);
    return out;
  };
  // a coast: sea floor to −120 m, a shore, hills to 1,400 m (a basin at 4,392 m for R's high byte)
  const field = () => Float32Array.from({ length: 256 * 256 }, (_, k) => { const x = k % 256, y = (k / 256) | 0; return Math.round((-120 + x * 6 + Math.sin(y * 0.2) * 80 + (x > 200 && y < 20 ? 3000 : 0)) * 256) / 256; });

  it('reads the heights exactly, RGB or RGBA, every filter', () => {
    const f = field();
    for (const bpp of [3, 4] as const) {
      const got = terrariumFromPng(encode(f, bpp))!;
      expect(got).not.toBeNull();
      let worst = 0;
      for (let k = 0; k < f.length; k++) worst = Math.max(worst, Math.abs(got[k] - f[k]));
      expect(worst).toBeLessThan(1e-3);
    }
  });

  it('hands anything else to the canvas path (null), never a wrong grid', () => {
    expect(terrariumFromPng(new Uint8Array([1, 2, 3]))).toBeNull();
    const png = encode(field(), 3);
    png[8 + 8 + 8] = 16; // (IHDR bit depth → 16)
    expect(terrariumFromPng(png)).toBeNull();
  });
});

describe('flatDem: somewhere for the sea to go when the ground is late', () => {
  it("lays the fetchDem lattice at the stand-in height, and the map's sea presses into it", () => {
    const box = { x0: 0, z0: 0, x1: 1024, z1: 1024 };
    const g = flatDem(box, () => 3, 16);
    expect(g.nx).toBe(Math.round((1024 + 192) / 16));
    expect(g.x0).toBe(-96);
    expect(Math.min(...g.heights)).toBe(3);
    const sea = waterPatch(demLayer(g), [{ ring: [[-100, -100], [600, -100], [600, 1200], [-100, 1200]] }], true);
    const L = new TerrainLayer(sea.buf, sea.layout);
    expect(L.heightAt(200, 500)).toBeLessThan(0); // (out on the water: below the datum)
    expect(L.sdfAt(200, 500)).toBeLessThan(0);
    expect(L.heightAt(900, 500)).toBeCloseTo(3, 0); // (the land stays land)
  });
});

import { despike } from '../src/world/dem';
// The horizon's low-zoom tiles (Robby, 2026-10-07: "weird pyramid in background of a lot of landscapes
// when it doesn't exist"): the overviews carry single pixels hundreds of metres over flat land — the
// Pine Barrens' 617 m, Long Island's 300, JFK's 243 — each a pyramid on every horizon within 125 km.
describe('dem: the low zooms despiked', () => {
  const grid = (f: (i: number, j: number) => number) => { const h = new Float32Array(256 * 256); for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) h[j * 256 + i] = f(i, j); return h; };
  const at = (i: number, j: number) => j * 256 + i;
  it('puts a lone spike and a pair of them back down to the land round them', () => {
    const h = grid((i) => 20 + 0.1 * i);
    h[at(100, 100)] = 617;
    h[at(60, 50)] = 300; h[at(61, 50)] = 280; // (two pixels wide)
    h[at(0, 120)] = 541; // (on the tile's edge: five neighbours)
    const o = despike(h);
    for (const [i, j] of [[100, 100], [60, 50], [61, 50], [0, 120]]) expect(o[at(i, j)], `${i},${j}`).toBeLessThan(40);
    expect(o[at(10, 10)]).toBe(h[at(10, 10)]); // (the rest as it was)
  });
  it("keeps a real summit — the Grand Teton's z9 pixel, its ridge standing high with it — and a canyon's rim", () => {
    // (a steep peak, 130 m a pixel down every side, its summit's eight neighbours as the real tile has them:
    // 168 m under it at their middle, the second highest 99 under)
    const h = grid((i, j) => Math.max(1000, 3829 - 130 * Math.hypot(i - 128, j - 128)));
    const nb = [3760, 3730, 3700, 3670, 3652, 3600, 3550, 3500];
    h[at(128, 128)] = 3829;
    [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].forEach(([a, b], k) => (h[at(128 + a, 128 + b)] = nb[k]));
    const o = despike(h);
    expect(o[at(128, 128)]).toBe(3829);
    for (let k = 0; k < 256 * 256; k++) if (o[k] !== h[k]) throw new Error(`a mountain's pixel moved: ${k % 256},${Math.floor(k / 256)}`);
    // a rim 1,000 m over its canyon: three of its neighbours down in it, five on the plateau
    const c = grid((i) => (i < 100 ? 0 : 1000));
    expect(despike(c)[at(100, 50)]).toBe(1000);
  });
});
