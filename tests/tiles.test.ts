import { describe, it, expect } from 'vitest';
// @ts-expect-error plain js lib
import { partitionEntities, tileSpecs, terrainPack, packToBin } from '../scripts/lib/tiles.mjs';

const B = { x0: 0, z0: 0, x1: 2048, z1: 1024 };
const SLICE = { x0: 0, z0: 0, x1: 1100, z1: 1024 }; // detail half
const m = (v: number) => Math.round(v * 10); // metres -> 0.1 m ints

const entities = {
  buildings: [
    { r: [m(100), m(100), m(120), m(100), m(120), m(120), m(100), m(120)], h: 8, k: 'house', roof: 'gable', s: 1 }, // tile 0_0
    { r: [m(1030), m(100), m(1050), m(100), m(1050), m(120), m(1030), m(120)], h: 8, k: 'house', roof: 'gable', s: 2 }, // centroid in tile 1_0, ring dips into 0_0's margin
    { r: [m(1500), m(500), m(1520), m(500), m(1520), m(520), m(1500), m(520)], h: 8, k: 'house', roof: 'gable', s: 3 }, // tile 1_0
  ],
  roads: [
    { p: [m(900), m(200), m(1100), m(200), m(1300), m(200)], c: 'residential', w: 6 }, // starts in tile 0_0, crosses into 1_0
    { p: [m(1400), m(200), m(1600), m(200)], c: 'residential', w: 6 }, // fully in tile 1_0
  ],
  areas: [{ c: 'beach', o: [[m(990), m(600), m(1060), m(600), m(1060), m(700), m(990), m(700)]], i: [] }], // straddles the seam
  lines: [{ c: 'seawall', p: [m(980), m(800), m(1100), m(800)] }],
  points: [
    { c: 'entrance', x: 100, z: 95 }, // tile 0_0
    { c: 'entrance', x: 1035, z: 55 }, // within margin of tile 0_0, owned by 1_0
    { c: 'tree', x: 1500, z: 300 },
  ],
};

describe('tileSpecs', () => {
  it('covers the region box and flags detail vs backdrop', () => {
    const specs = tileSpecs(B, SLICE);
    expect(specs).toHaveLength(6); // x: 0..2, z: 0..1
    const t00 = specs.find((t: { id: string }) => t.id === '0_0');
    const t10 = specs.find((t: { id: string }) => t.id === '1_0');
    expect(t00.lod).toBe(0); // inside slice
    expect(t10.lod).toBe(0); // overlaps the slice edge (1024 < 1100)
    expect(specs.find((t: { id: string }) => t.id === '2_0').lod).toBe(1);
  });
});

describe('partitionEntities', () => {
  const specs = tileSpecs(B, SLICE);
  const parts = partitionEntities(entities, specs);
  const byId = (id: string) => parts.find((p: { spec: { id: string } }) => p.spec.id === id).tile;

  it('gives every building to exactly one tile', () => {
    const counts = new Map<number, number>();
    for (const p of parts)
      for (const b of p.tile.buildings) if (b.own !== 0) counts.set(b.s, (counts.get(b.s) ?? 0) + 1);
    for (const s of [1, 2, 3]) expect(counts.get(s)).toBe(1);
  });

  it('marks margin context with own:0', () => {
    const t00 = byId('0_0');
    const seamHouse = t00.buildings.find((b: { s: number }) => b.s === 2);
    expect(seamHouse.own).toBe(0); // in margin, owned by 1_0
    const t10 = byId('1_0');
    expect(t10.buildings.find((b: { s: number }) => b.s === 2).own).toBeUndefined(); // primary copy
    // the far building isn't context for tile 0_0
    expect(t00.buildings.some((b: { s: number }) => b.s === 3)).toBe(false);
  });

  it('includes boundary-crossing roads once as primary, elsewhere as context', () => {
    const r00 = byId('0_0').roads.find((r: { p: number[] }) => r.p[0] === m(900));
    const r10 = byId('1_0').roads.find((r: { p: number[] }) => r.p[0] === m(900));
    expect(r00.own).toBeUndefined(); // first vertex in 0_0 -> primary there
    expect(r10.own).toBe(0); // context in 1_0
    // fully-inside road is only in its tile
    expect(byId('0_0').roads.some((r: { p: number[] }) => r.p[0] === m(1400))).toBe(false);
    // a consumer emitting only prim roads never duplicates
    const primCount = parts.reduce((n: number, p: { tile: { roads: { own?: number }[] } }) => n + p.tile.roads.filter((r) => r.own !== 0).length, 0);
    expect(primCount).toBe(2);
  });

  it('areas and lines follow the same rule; points use the margin', () => {
    expect(byId('0_0').areas[0].own).toBeUndefined();
    expect(byId('1_0').areas[0].own).toBe(0);
    expect(byId('0_0').lines[0].own).toBeUndefined();
    expect(byId('1_0').lines[0].own).toBe(0);
    const p00 = byId('0_0').points;
    expect(p00.find((p: { x: number }) => p.x === 1035).own).toBe(0); // margin point
    expect(p00.some((p: { x: number }) => p.x === 1500)).toBe(false);
  });

  it('is deterministic', () => {
    const again = partitionEntities(entities, tileSpecs(B, SLICE));
    expect(JSON.stringify(again)).toBe(JSON.stringify(parts));
  });
});

describe('terrainPack', () => {
  // A 16 m grid at 2 m cells, every field filled with its own ramp so we can spot mix-ups.
  const gw = 8, gh = 8, cell = 2;
  const layer = {
    grid: { x0: 0, z0: 0, cell, w: gw, h: gh },
    height: new Int16Array(gw * gh).map((_, i) => i * 10),
    sdf: new Int16Array(gw * gh).map((_, i) => -i),
    cover: new Uint8Array(gw * gh).map((_, i) => i % 100),
    flags: new Uint8Array(gw * gh).map((_, i) => i % 3),
    oceanD: new Uint8Array(gw * gh).map((_, i) => 255 - (i % 200)),
  };

  it('extracts the exact subgrid a tile box covers', () => {
    const pack = terrainPack(layer, { x0: 4, z0: 4, x1: 12, z1: 12 });
    expect(pack.grid).toEqual({ x0: 4, z0: 4, cell, w: 4, h: 4 });
    expect([...pack.height.slice(0, 4)]).toEqual([180, 190, 200, 210]); // layer row j=2, cols i=2..5
    expect(pack.sdf[0]).toBe(-18);
    expect(pack.cover[5]).toBe(27); // pack (i=1,j=1) -> layer idx 27
    expect(pack.flags.length).toBe(16);
    expect(pack.oceanD[15]).toBe(210); // pack (i=3,j=3) -> layer idx 45
  });

  it('clamps to the layer edge and misses cleanly', () => {
    const pack = terrainPack(layer, { x0: 12, z0: 12, x1: 30, z1: 30 });
    expect(pack.grid).toEqual({ x0: 12, z0: 12, cell, w: 2, h: 2 });
    expect(terrainPack(layer, { x0: 100, z0: 100, x1: 200, z1: 200 })).toBeNull();
    expect(terrainPack(layer, { x0: -30, z0: -30, x1: -20, z1: -20 })).toBeNull();
  });

  it('serialises to an aligned layout the client can wrap in a TerrainLayer', () => {
    const pack = terrainPack(layer, { x0: 4, z0: 4, x1: 12, z1: 12 });
    const { layout, buf } = packToBin(pack);
    expect(layout.grid.w).toBe(4);
    expect(layout.height).toEqual({ offset: 0, length: 16, type: 'Int16Array' });
    expect(layout.sdf.offset).toBe(32);
    expect(layout.sdf.offset % 2).toBe(0);
    const h = new Int16Array(buf.buffer.slice(buf.byteOffset + layout.height.offset, buf.byteOffset + layout.height.offset + layout.height.length * 2));
    expect([...h.slice(0, 4)]).toEqual([180, 190, 200, 210]);
  });
});
