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
