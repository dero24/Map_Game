// A stand-in object for compiling a material's shader before the real mesh exists (render/warm.ts).
import * as THREE from 'three';

/** A three-vertex geometry with these attributes. A program's key reads which a mesh has (a
 *  `position`, a `normal`), so a stand-in carries what the real mesh will. */
export function probeGeometry(names: readonly string[] = ['position', 'normal']) {
  const g = new THREE.BufferGeometry();
  for (const n of names) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(9), 3));
  return g;
}
