// A road's bounding box, measured once per road object. The loaded ring of a city holds tens of
// thousands of roads and hundreds of thousands of segments: anything that asks "which streets
// pass near here" per frame (grass cells, the footstep surface) checks the box before walking
// the polyline. Roads are immutable once a tile is built, so the box never goes stale; the
// WeakMap lets it go with the tile.
import type { Road } from './data';

const boxes = new WeakMap<Road, Float64Array>();

/** x0, z0, x1, z1 in metres (Road.p is decimetres). */
export function roadBounds(r: Road): Float64Array {
  let b = boxes.get(r);
  if (!b) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i + 1 < r.p.length; i += 2) {
      const x = r.p[i] / 10, z = r.p[i + 1] / 10;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    b = new Float64Array([x0, z0, x1, z1]);
    boxes.set(r, b);
  }
  return b;
}

/** Does the road's box come within `pad` m of the rectangle [x0, x1] × [z0, z1]? */
export function roadNear(r: Road, x0: number, z0: number, x1: number, z1: number, pad: number) {
  const b = roadBounds(r);
  return b[0] <= x1 + pad && b[2] >= x0 - pad && b[1] <= z1 + pad && b[3] >= z0 - pad;
}
