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
