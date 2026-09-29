import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { retainingWalls, retainingColliders, wallRuns, wallStairs, stairColliders } from '../src/world/retaining';
import { WalkWorld } from '../src/player/collision';
import type { Terrain } from '../src/world/data';

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

  it('a front walk coming down to a wall gets a flight up its face: from the sidewalk to the lot', () => {
    const walls = run(0, 6, 2, 2); // a 2 m wall along z = 0 from x 0 to 24, the street south of it
    // a house up on the hill at x = 10: its walk runs down to the street's edge
    const stairs = wallStairs(walls, [10, -9, 10, 3, 1.1]);
    expect(stairs).toHaveLength(1);
    const st = stairs[0];
    expect(Math.hypot(st.x - 10, st.z)).toBeLessThan(0.01); // the landing where the walk meets the wall
    expect(st.n).toBeGreaterThanOrEqual(9); // ~0.18 m risers up a 2 m face
    expect(st.sz).toBeGreaterThan(0.99); // on the street side
    expect(wallStairs(walls, [10, -9, 10, 3, 2.9])).toHaveLength(0); // (a drive goes round)
    expect(wallStairs(walls, [30, -9, 30, 3, 1.1])).toHaveLength(0); // (a walk that misses the wall)
    // walk it: along the sidewalk to the foot, up the flight, onto the lot
    const ground = (x: number, z: number) => 0.08 * x + (z < -0.3 ? 2 : z > 0.2 ? 0 : (2 * (0.2 - z)) / 0.5);
    const terrain = { heightAt: ground, sdfAt: () => 50 } as unknown as Terrain;
    const w = new WalkWorld(terrain, { x0: -100, z0: -100, x1: 100, z1: 100 });
    for (const [a, b, y0, y1] of retainingColliders(walls)) w.addWall(a, b, y0, y1);
    const sc = stairColliders(stairs);
    for (const [a, b, y0, y1] of sc.walls) w.addWall(a, b, y0, y1);
    for (const d of sc.decks) w.addDeck({ pts: d.pts, cum: d.cum, halfWidth: d.hw, heightAt: (s) => d.p.y0 + (d.p.y1 - d.p.y0) * Math.min(1, Math.max(0, s / d.p.total)), profile: d.p });
    const mid = 0.04 + st.w / 2;
    let x = st.x + st.ux * (st.run + 1.5) + st.sx * mid, z = st.z + st.uz * (st.run + 1.5) + st.sz * mid, feet = w.surfaceAt(x, z, 0.8);
    const step = (dx: number, dz: number, k: number) => {
      for (let i = 0; i < k; i++) {
        [x, z] = w.move(x, z, dx, dz, 0.32, feet);
        const t = w.surfaceAt(x, z, feet);
        feet += (t - feet) * (t > feet ? 0.7 : 0.5);
      }
    };
    step(-st.ux * 0.1, -st.uz * 0.1, Math.round((st.run + 2.2) * 10)); // up the flight to the landing
    expect(feet).toBeGreaterThan(st.top - 0.15);
    step(-st.sx * 0.1, -st.sz * 0.1, 40); // over the coping onto the lot
    expect(z).toBeLessThan(-1.5);
    // …and along the sidewalk, away from the steps, the wall is a wall
    let x2 = 20, z2 = 1.5;
    for (let i = 0; i < 40; i++) [x2, z2] = w.move(x2, z2, 0, -0.1, 0.32, 0.08 * x2);
    expect(z2).toBeGreaterThan(0.2);
  });

  it('the flight is drawn: steps against the face, and no hedge where it comes up', () => {
    for (let i = 0; i < 30; i++) {
      const walls = run(i * 53.1, 4, 1.5, 2.5), [r] = wallRuns(walls);
      if (r.top !== 'hedge') continue;
      const x = walls[0] + 8, stairs = wallStairs(walls, [x, -9, x, 3, 1.1]);
      expect(stairs).toHaveLength(1);
      const g = retainingWalls(walls, stairs), bare = retainingWalls(walls);
      const steps = g.getObjectByName('retaining-steps') as THREE.Mesh; // (its own mesh: what a frame of the steps is of)
      expect(steps.geometry.attributes.position.count).toBeGreaterThan(100);
      expect(bare.getObjectByName('retaining-steps')).toBe(undefined);
      const im = g.getObjectByName('retaining-hedges') as THREE.InstancedMesh, m = new THREE.Matrix4(), v = new THREE.Vector3();
      for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m); v.setFromMatrixPosition(m); expect(Math.abs(v.x - x)).toBeGreaterThan(1.5); }
      return;
    }
    throw new Error('no hedge-topped run to try');
  });
});
