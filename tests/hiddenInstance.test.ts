import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hiddenInstance } from '../src/player/vehicles';

// A hidden instance is zero-scaled (life.ts's empty slots, a taken driveway car). three.js's decompose
// reads a singular matrix as scale 1 with no rotation at its translation: a hidden instance as a whole one
// at the origin — the "walkers and cars stacked at a region's origin" a probe counted (bug-life-origin-stack)
// were the life sim's empty slots, never drawn.
describe('a hidden instance', () => {
  it("decompose reads it as a whole one at the origin; hiddenInstance doesn't", () => {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    zero.decompose(p, q, s);
    expect(s.x).toBe(1); // (what the probes saw)
    expect(p.length()).toBe(0);
    expect(hiddenInstance(zero)).toBe(true);
    // a whole one turned any way — side-on, its matrix's first element 0 — is not hidden
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.1]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(5, 0, 7), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1.2, 1));
      expect(hiddenInstance(m)).toBe(false);
    }
  });
});
