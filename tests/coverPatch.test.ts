// A streamed cell's land cover and its distance to the sea come off its map (dem.ts coverPatch): the
// bake reads ESA WorldCover; a streamed cell was grass — 30 — everywhere and 510 m from any sea, so
// what keys on the land (a salt marsh's cordgrass and its fiddlers, the woods' animals, the forest
// floor's slugs, the lizards' scrub) never came beyond the baked region (2026-10-07: "go see it" found
// no fiddler, crawfish, bear or beaver).
import { describe, it, expect } from 'vitest';
import { demLayer, waterPatch, coverPatch } from '../src/world/dem';
import { TerrainLayer, type Area } from '../src/world/data';

const m = (v: number) => Math.round(v * 10);
const rect = (x0: number, z0: number, x1: number, z1: number) => [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)];
const area = (c: string, r: number[], holes: number[][] = []): Area => ({ c, o: [r], i: holes });

describe('coverPatch', () => {
  // a 400 × 200 m patch on a 4 m lattice, 3 m up; the sea west of x = 40
  const grid = () => {
    const nx = 100, nz = 50, heights = new Float32Array(nx * nz).fill(3);
    return demLayer({ heights, x0: 0, z0: 0, pitch: 4, nx, nz });
  };
  const at = (L: { buf: ArrayBuffer; layout: import('../src/world/data').LayerLayout }) => new TerrainLayer(L.buf, L.layout);

  it("lays the map's woods, scrub, lawns, beaches and wetlands as WorldCover's classes — the particular over the general, holes left", () => {
    const L = grid();
    coverPatch(L, [
      area('grass', rect(100, 20, 300, 180)), // a park…
      area('wood', rect(120, 40, 200, 160), [rect(140, 60, 160, 80)]), // …with a wood in it, a clearing in that
      area('wetland', rect(220, 40, 280, 100)), // …and a marsh
      area('scrub', rect(310, 20, 390, 180)),
      area('beach', rect(60, 20, 90, 180)),
      area('parking', rect(10, 10, 30, 30)), // (not a cover: left as it was)
    ]);
    const T = at(L);
    expect(T.coverAt(110, 30)).toBe(30);
    expect(T.coverAt(180, 120)).toBe(10);
    expect(T.coverAt(150, 70)).toBe(30); // (the clearing: the park's)
    expect(T.coverAt(250, 70)).toBe(90);
    expect(T.coverAt(350, 100)).toBe(20);
    expect(T.coverAt(75, 100)).toBe(60);
    expect(T.coverAt(20, 20)).toBe(30); // (the default ground's)
  });

  it("never over water, and the sea's distance measured within the cell in the bake's units", () => {
    const sea = { ring: [[-50, -50], [40, -50], [40, 250], [-50, 250]] as [number, number][] };
    const L = waterPatch(grid(), [sea]);
    coverPatch(L, [area('wetland', rect(0, 0, 400, 200))]);
    const T = at(L);
    expect(T.coverAt(20, 100)).not.toBe(90); // (the sea's nodes keep their cover)
    expect(T.coverAt(100, 100)).toBe(90);
    // ~2 m steps: 60 m from the shore line at x 40
    expect(Math.abs(T.oceanDistAt(100, 100) - 60)).toBeLessThan(6);
    expect(T.oceanDistAt(390, 100)).toBeGreaterThan(330);
    expect(T.oceanDistAt(20, 100)).toBe(0);
    // the shore's signed distance, both sides, the line where it was (between the last sea node and
    // the first land node: x 38–42)
    expect(Math.abs(T.sdfAt(100, 100) - 60)).toBeLessThan(4);
    expect(Math.abs(T.sdfAt(20, 100) + 20)).toBeLessThan(4);
    expect(T.sdfAt(36, 100)).toBeLessThan(0);
    expect(T.sdfAt(44, 100)).toBeGreaterThan(0);
    expect(T.sdfAt(-40, 100)).toBeGreaterThanOrEqual(-60);
  });

  it("a cell with no sea in it keeps its land far from any (as before)", () => {
    const L = grid();
    coverPatch(L, []);
    expect(at(L).oceanDistAt(200, 100)).toBe(510);
  });
});
