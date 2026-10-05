import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { realExtras, faceUp } from '../src/world/synth';
import type { TileJson, Area } from '../src/world/data';

// A streamed cell's ground (synth.ts realExtras): the grid under its streets, cut away only under
// water — the ocean plane at sea level shows through a cut. Robby's phone at Monmouth Executive
// Airport (and his Shrewsbury report): blue ground with grass growing out of it, wherever New
// Jersey's land-use survey mapped a wooded swamp — a wetland was cut like a lake, and the sheet
// laid over the hole faced down for half the rings, by their winding, so the hole stayed open.
const BOX = { x0: 0, z0: 0, x1: 1024, z1: 1024 };
const flatGround = { sdfAt: () => 100, heightAt: () => 40 }; // (land everywhere, 40 m up)
const sq = (x: number, z: number, w: number, clockwise = false) => {
  const r = [[x, z], [x + w, z], [x + w, z + w], [x, z + w]];
  return (clockwise ? r.reverse() : r).flatMap(([a, b]) => [a * 10, b * 10]);
};
const tile = (areas: Area[]): TileJson => ({ version: 1, id: '0_0', lod: 0, box: BOX, origin: { lat: 40, lon: -74 }, slice: BOX, backdrop: BOX, buildings: [], roads: [], areas, lines: [], points: [] });
const ground = (g: THREE.Group) => g.children.find((o) => (o as THREE.Mesh).material && ((o as THREE.Mesh).material as THREE.Material).userData?.tag === 'gnd') as THREE.Mesh;
// (the sheets: flat coloured polygons with normals — not the ground, not the street ribbons, which this tile has none of)
const sheets = (g: THREE.Group) => g.children.filter((o) => { const m = o as THREE.Mesh; return m.isMesh && o !== ground(g) && !!m.geometry.getAttribute('normal') && (m.geometry.getAttribute('position')?.count ?? 0) > 0; });

describe('a streamed cell\'s ground: only water cuts it (synth.ts realExtras)', () => {
  const bare = ground(realExtras(tile([]), flatGround)).geometry.index!.count;
  it('a wetland keeps its ground and lays no sheet — either winding', () => {
    for (const cw of [false, true]) {
      const g = realExtras(tile([{ c: 'wetland', o: [sq(300, 300, 300, cw)], i: [] }]), flatGround);
      expect(ground(g).geometry.index!.count, `wound ${cw ? 'clockwise' : 'anticlockwise'}`).toBe(bare);
      expect(sheets(g)).toHaveLength(0);
    }
  });
  it('a pond cuts its hole and covers it with a sheet facing up', () => {
    for (const cw of [false, true]) {
      const g = realExtras(tile([{ c: 'water', o: [sq(300, 300, 300, cw)], i: [] }]), flatGround);
      expect(ground(g).geometry.index!.count).toBeLessThan(bare);
      const [s] = sheets(g) as THREE.Mesh[];
      expect(s).toBeDefined();
      s.geometry.computeVertexNormals();
      const ny = s.geometry.getAttribute('normal').getY(0);
      expect(ny, `wound ${cw ? 'clockwise' : 'anticlockwise'}`).toBeGreaterThan(0.99);
    }
  });
});

describe('faceUp: a flat sheet\'s triangles face the sky', () => {
  it('turns a triangle wound the other way, leaves one facing up', () => {
    const flat = [0, 0, 10, 0, 0, 10]; // (x, z) pairs
    const a = faceUp(flat, [0, 1, 2]), b = faceUp(flat, [0, 2, 1]);
    // (+z is south: x then z then back is clockwise seen from above, the face normal +y)
    const ny = (i: number[]) => (flat[i[1] * 2 + 1] - flat[i[0] * 2 + 1]) * (flat[i[2] * 2] - flat[i[0] * 2]) - (flat[i[1] * 2] - flat[i[0] * 2]) * (flat[i[2] * 2 + 1] - flat[i[0] * 2 + 1]);
    expect(ny(a)).toBeGreaterThan(0);
    expect(ny(b)).toBeGreaterThan(0);
  });
});
