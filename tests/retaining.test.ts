import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { retainingWalls, retainingColliders, wallRuns } from '../src/world/retaining';

// Runs of 4 m panels along x (the street to their south, +z: wound with the street on the left),
// the street climbing 8% east, the hill `hA → hB` m above it.
const run = (x0: number, n: number, hA: number, hB: number) => {
  const w: number[] = [];
  for (let k = 0; k < n; k++) {
    const xa = x0 + k * 4, xb = xa + 4, fa = 0.08 * xa, fb = 0.08 * xb;
    w.push(xa, 0, xb, 0, fa - 0.3, fa + hA + ((hB - hA) * k) / n, fb - 0.3, fb + hA + ((hB - hA) * (k + 1)) / n);
  }
  return w;
};

describe('retaining walls', () => {
  it('panels end to end are one run, built as one kind: a rockery only where the cut is low', () => {
    const walls = [...run(-200, 6, 1.2, 2.4), ...run(-100, 6, 3.5, 5), ...run(0, 1, 1, 1)];
    const runs = wallRuns(walls);
    expect(runs.map((r) => r.panels.length / 8)).toEqual([6, 6, 1]);
    expect(runs[1].kind).toBe('concrete'); // (over 3.2 m: always poured)
    expect(runs[1].top === 'hedge' || runs[1].top === 'rail').toBe(true); // a 5 m drop gets a hedge or a rail
    expect(wallRuns(walls)).toEqual(runs); // the same every visit
    // over many places both kinds turn up, and every top
    const kinds = new Set<string>(), tops = new Set<string>();
    for (let i = 0; i < 40; i++) for (const r of wallRuns(run(i * 37.3, 3, 1.4, 2.2))) (kinds.add(r.kind), tops.add(r.top));
    expect([...kinds].sort()).toEqual(['concrete', 'rockery']);
    expect(tops.has('hedge') && tops.has('none')).toBe(true);
  });

  it('stays in its panels: nothing proud of the face by more than a stone, nothing past the ends', () => {
    for (let i = 0; i < 12; i++) {
      const walls = run(i * 41.7, 5, 1.1 + (i % 4) * 0.7, 2 + (i % 3));
      const g = retainingWalls(walls);
      const m = g.getObjectByName('retaining-walls') as THREE.Mesh;
      const p = m.geometry.attributes.position;
      const x0 = walls[0], x1 = walls[walls.length - 6];
      let proud = 0;
      for (let k = 0; k < p.count; k++) {
        expect(p.getX(k)).toBeGreaterThanOrEqual(x0 - 0.03); // (a rail post's half width)
        expect(p.getX(k)).toBeLessThanOrEqual(x1 + 0.03);
        proud = Math.max(proud, p.getZ(k)); // (toward the street)
        expect(p.getZ(k)).toBeGreaterThan(-1); // (a rockery leans back, a coping is 35 cm deep, a rail sits on it)
      }
      expect(proud).toBeLessThan(0.16);
      // a vertex budget: a rockery panel's boulders stay light
      expect(p.count / 5).toBeLessThan(420);
    }
  });

  it('a hedge-topped run carries its hedges along the top, set back from the edge', () => {
    let seen = 0;
    for (let i = 0; i < 30 && !seen; i++) {
      const walls = run(i * 53.1, 4, 1.5, 2.5);
      const [r] = wallRuns(walls);
      if (r.top !== 'hedge') continue;
      const im = retainingWalls(walls).getObjectByName('retaining-hedges') as THREE.InstancedMesh;
      expect(im.count).toBeGreaterThanOrEqual(4);
      const m = new THREE.Matrix4(), v = new THREE.Vector3();
      for (let k = 0; k < im.count; k++) {
        im.getMatrixAt(k, m);
        v.setFromMatrixPosition(m);
        const f = (v.x - walls[0]) / 16, top = walls[5] + (walls[walls.length - 1] - walls[5]) * f;
        expect(Math.abs(v.y - top)).toBeLessThan(0.6);
        expect(v.z).toBeLessThan(-0.3); // behind the edge, up on the hill
      }
      seen++;
    }
    expect(seen).toBe(1);
  });

  it('the walker meets each panel as a wall from its foot to just under its top', () => {
    const walls = run(0, 2, 2, 2);
    const c = retainingColliders(walls);
    expect(c).toHaveLength(2);
    expect(c[0][2]).toBeLessThan(walls[4]);
    expect(c[0][3]).toBeCloseTo(Math.min(walls[5], walls[7]) - 0.4, 5);
  });
});
