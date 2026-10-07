// A far tile's small things aren't drawn past streamParams.smallCull × their own size (world/stream.ts):
// the size an instanced mesh is judged by is its model's radius at its largest instance's scale — a
// mailbox's metre, a tree's crown at the tallest tree's scale (never the ring's whole spread).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spanOf, streamParams } from '../src/world/stream';

describe('smallCull', () => {
  it("judges an instanced mesh by its model's radius at its largest instance's scale", () => {
    const box = new THREE.BoxGeometry(1, 1, 1); // (radius √3/2)
    const im = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial(), 3);
    const m = new THREE.Matrix4();
    im.setMatrixAt(0, m.makeTranslation(500, 0, 0));
    im.setMatrixAt(1, m.compose(new THREE.Vector3(-400, 0, 20), new THREE.Quaternion(), new THREE.Vector3(1, 3, 1)));
    im.setMatrixAt(2, m.makeTranslation(0, 0, -300));
    expect(spanOf(im)).toBeCloseTo((Math.sqrt(3) / 2) * 3, 4);
  });
  it('a mailbox goes from a desktop past ~200 m, a tree never within the ring', () => {
    expect(streamParams.smallCull).toBeGreaterThanOrEqual(100);
    expect(0.6 * streamParams.smallCull).toBeLessThan(300); // (a 60 cm post)
    expect(8 * streamParams.smallCull).toBeGreaterThan(1500); // (an 8 m crown: the whole detail ring)
  });
});
