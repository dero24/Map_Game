import { describe, it, expect } from 'vitest';
import { synthTile } from '../src/world/synth';
import { pointInRing } from '../src/world/realTile';

// The procedural stand-ins' houses stay out of their streets. Each lot is set back from the street
// it fronts; the cross street at a corner and the bend of a wavy street went unchecked, and 8% of
// the stand-ins' houses stood across the lanes (tools/playtest.js __ROADPOSTS__ found their pilings
// on the streets' centre lines; a car stopped against their walls).

const terrain = { sdfAt: () => 100, heightAt: () => 1 }; // (flat dry land)
const unpack = (p: number[]) => { const out: [number, number][] = []; for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i] / 10, p[i + 1] / 10]); return out; };

describe('procedural stand-in lots', () => {
  it('never stand in a street', () => {
    let houses = 0;
    const bad: string[] = [];
    for (const seed of [12345, 987654321]) {
      for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [-1, -1], [2, -1], [-2, 1], [3, 3], [-3, 2]]) {
        const C = 500, spec = { id: `s${cx}_${cz}`, box: { x0: cx * C, z0: cz * C, x1: cx * C + C, z1: cz * C + C }, lod: 0, file: '', synth: 1 as const };
        const { tj } = synthTile(spec, seed, terrain);
        const segs = tj.roads.flatMap((r) => { const p = unpack(r.p); return p.slice(1).map((b, i) => ({ a: p[i], b, hw: r.w / 2 })); });
        const inStreet = (x: number, z: number) => segs.some(({ a, b, hw }) => {
          const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
          return Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z) < hw;
        });
        for (const b of tj.buildings) {
          if (b.own === 0) continue;
          houses++;
          const ring = unpack(b.r);
          let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
          for (const [x, z] of ring) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
          let hit = ring.some(([x, z]) => inStreet(x, z));
          for (let x = x0 + 0.5; x < x1 && !hit; x += 1) for (let z = z0 + 0.5; z < z1 && !hit; z += 1) if (pointInRing(x, z, ring) && inStreet(x, z)) hit = true;
          if (hit) bad.push(`${spec.id} at ${ring[0].map((v) => v.toFixed(1)).join(',')}`);
        }
      }
    }
    expect(houses).toBeGreaterThan(200);
    expect(bad.slice(0, 5)).toEqual([]);
  }, 60000); // (2.5 s alone; twice that with the whole suite running beside it)
});
