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

describe('street ribbons on hills', () => {
  it('follow a crest in short stations, and stay one quad a side on the flat', async () => {
    const { roadRibbons } = await import('../src/world/synth');
    const THREE = await import('three');
    const road = { p: [0, 0, 1200, 0], c: 'residential', w: 8 } as unknown as Parameters<typeof roadRibbons>[0][number];
    const hill = { heightAt: (x: number) => 30 + 6 * (1 - ((x - 60) / 60) ** 2) }; // a 6 m crest over a 120 m block
    const check = (t: { heightAt(x: number, z: number): number }) => {
      const g = roadRibbons([road], t).geometry, P = g.getAttribute('position'), I = g.getIndex()!;
      let off = 0, down = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let k = 0; k < I.count; k += 3) {
        a.fromBufferAttribute(P, I.getX(k)); b.fromBufferAttribute(P, I.getX(k + 1)); c.fromBufferAttribute(P, I.getX(k + 2));
        if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y <= 0) down++;
        off = Math.max(off, Math.abs((a.y + b.y + c.y) / 3 - 0.06 - t.heightAt((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3)));
      }
      return { verts: P.count, off, down };
    };
    const h = check(hill), f = check({ heightAt: () => 5 });
    expect(h.off).toBeLessThan(0.1); // on the crest, not buried under it (a flat quad sat 6 m low)
    expect(h.down).toBe(0);
    expect(f.verts).toBe(6); // flat: one section a end — both kerbs and the crown
    expect(f.down).toBe(0);
  });
  it('ride over the rendered ground in a sag, where the 8 m lattice sits above the DEM', async () => {
    const { roadRibbons } = await import('../src/world/synth');
    const { latticeHeight } = await import('../src/world/ground');
    const THREE = await import('three');
    // a hollow across the street and along it: the lattice's chords sit above the true ground
    const sag = { heightAt: (x: number, z: number) => 30 + 8 * ((x - 64) / 64) ** 2 + 2 * ((z - 3) / 12) ** 2 };
    const road = { p: [40, 30, 1240, 30], c: 'tertiary', w: 10 } as unknown as Parameters<typeof roadRibbons>[0][number];
    const g = roadRibbons([road], sag).geometry, P = g.getAttribute('position'), I = g.getIndex()!;
    const hAt = (x: number, z: number) => sag.heightAt(x, z);
    let worst = Infinity;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let k = 0; k < I.count; k += 3) {
      a.fromBufferAttribute(P, I.getX(k)); b.fromBufferAttribute(P, I.getX(k + 1)); c.fromBufferAttribute(P, I.getX(k + 2));
      for (const [wa, wb] of [[1 / 3, 1 / 3], [0.8, 0.1], [0.1, 0.8], [0.1, 0.1]]) {
        const x = a.x * wa + b.x * wb + c.x * (1 - wa - wb), z = a.z * wa + b.z * wb + c.z * (1 - wa - wb), y = a.y * wa + b.y * wb + c.y * (1 - wa - wb);
        worst = Math.min(worst, y - latticeHeight(hAt, x, z));
      }
    }
    expect(worst).toBeGreaterThan(0.02); // never under the ground mesh the tile draws
  });
  it('the lattice height is the ground grid itself', async () => {
    const { latticeHeight, buildGrid } = await import('../src/world/ground');
    const hAt = (x: number, z: number) => Math.sin(x * 0.05) * 4 + Math.cos(z * 0.07) * 3 + x * 0.02;
    const g = buildGrid({ x0: 0, z0: 0, x1: 64, z1: 64, step: 8 }, hAt, () => true);
    const P = g.getAttribute('position'), I = g.getIndex()!;
    const THREE = await import('three');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let err = 0;
    for (let k = 0; k < I.count; k += 3) {
      a.fromBufferAttribute(P, I.getX(k)); b.fromBufferAttribute(P, I.getX(k + 1)); c.fromBufferAttribute(P, I.getX(k + 2));
      const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3, y = (a.y + b.y + c.y) / 3;
      err = Math.max(err, Math.abs(latticeHeight(hAt, x, z) - y));
    }
    expect(err).toBeLessThan(1e-4);
  });
});
