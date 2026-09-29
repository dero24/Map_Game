// A frame as the GPU would hand it back to a photo (post.ts readSeen), for tests: view depths on a
// w×h grid (row 0 = the bottom; 0 where nothing is drawn, or past `cut`) of flat ground (y = 0) and
// boxes, seen through a three camera — optionally through the RGBA8 packing, like the readback.
import * as THREE from 'three';
import { packDepth, unpackDepth } from '../../src/render/seen';

/** A camera at `pos` (world), turned `yawDeg` (0 = north, −z; 90 = west) and pitched `pitchDeg`. */
export function camera(pos: [number, number, number], pitchDeg: number, yawDeg = 0, fov = 62, aspect = 16 / 9) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.25, 25000);
  cam.position.set(...pos);
  cam.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0, 'YXZ');
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

/** The ray through a sample's centre (NDC from its grid position). */
export function sampleRay(cam: THREE.PerspectiveCamera, i: number, j: number, w: number, h: number) {
  const v = new THREE.Vector3(((i + 0.5) / w) * 2 - 1, ((j + 0.5) / h) * 2 - 1, 0.5).unproject(cam);
  return new THREE.Ray(cam.position.clone(), v.sub(cam.position).normalize());
}

export function planeFrame(cam: THREE.PerspectiveCamera, w: number, h: number, boxes: THREE.Box3[] = [], cut = Infinity, packed = true) {
  const depth = new Float32Array(w * h), hit = new THREE.Vector3(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const ray = sampleRay(cam, i, j, w, h);
      let best: THREE.Vector3 | null = ray.intersectPlane(ground, hit) ? hit.clone() : null;
      for (const b of boxes) if (ray.intersectBox(b, hit) && (!best || hit.distanceTo(ray.origin) < best.distanceTo(ray.origin))) best = hit.clone();
      if (!best) continue;
      const z = -best.applyMatrix4(cam.matrixWorldInverse).z;
      if (z < cut) depth[j * w + i] = z;
    }
  if (!packed) return depth;
  const px = new Uint8Array(w * h * 4);
  depth.forEach((z, k) => px.set(packDepth(z, cam.near, cam.far), k * 4));
  return unpackDepth(px, cam.near, cam.far);
}
