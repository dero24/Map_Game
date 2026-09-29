// What a frame sees, as points in the world. Photo mode (with the far sketch on) paints everything in
// frame into the explore record: post.ts reads the depth it just drew back on a small grid
// (`readSeen`, packed by GLSL_PACK_DEPTH), and this unprojects it — exactly what was drawn
// (terrain, buildings, trees, the horizon ring's mountains), which a ray march over the height
// field can't know. Pure, so it's testable without a GPU.

/** GLSL (needs uNear/uFar): pack the view depth under `d` (a depth-buffer value) into RGBA8 as log
 *  depth over [near, far], 24 bits (~1e-6 relative); alpha 0 where nothing was drawn — the sky, and
 *  past ~12.5 km (d ≥ 0.99999), which the composite treats as sky too and never sketches. */
export const GLSL_PACK_DEPTH = /* glsl */ `
vec4 packDepth(float d) {
  if (d >= 0.99999) return vec4(0.0);
  float zn = d * 2.0 - 1.0;
  float lz = 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear));
  float v = floor(clamp(log(lz / uNear) / log(uFar / uNear), 0.0, 1.0) * 16777215.0 + 0.5);
  float r = floor(v / 65536.0);
  v -= r * 65536.0;
  float g = floor(v / 256.0);
  return vec4(r, g, v - g * 256.0, 255.0) / 255.0;
}
`;

/** The view depth where GLSL_PACK_DEPTH (and the composite) call it sky: d = 0.99999 — ~12.5 km
 *  for the game's camera (near 0.25, far 25 km). */
export function skyDepth(near: number, far: number) {
  return (2 * near * far) / (far + near - 0.99998 * (far - near));
}

/** The CPU mirror of GLSL_PACK_DEPTH for a view depth `z` (tests, and to document the format). */
export function packDepth(z: number, near: number, far: number): [number, number, number, number] {
  if (!(z > 0)) return [0, 0, 0, 0];
  const v = Math.floor(Math.min(1, Math.max(0, Math.log(z / near) / Math.log(far / near))) * 16777215 + 0.5);
  return [v >> 16, (v >> 8) & 255, v & 255, 255];
}

/** RGBA8 texels (GLSL_PACK_DEPTH) → view depths in metres; 0 where nothing was drawn. */
export function unpackDepth(px: ArrayLike<number>, near: number, far: number): Float32Array {
  const n = px.length >> 2, out = new Float32Array(n), L = Math.log(far / near);
  for (let k = 0; k < n; k++) {
    if (px[k * 4 + 3] < 128) continue;
    const v = px[k * 4] * 65536 + px[k * 4 + 1] * 256 + px[k * 4 + 2];
    out[k] = near * Math.exp((v / 16777215) * L);
  }
  return out;
}

/** A frame's visible surfaces on a w×h grid (row 0 = the bottom of the frame, as readPixels gives
 *  it): world positions and view depths (0 = sky). A sample's footprint — the spacing between
 *  neighbouring samples, across the view — is `depth × foot` metres; `cut` is the depth past which
 *  the readback calls it sky (skyDepth), so ground running on toward the horizon went at least
 *  that far. */
export interface SeenGrid {
  w: number;
  h: number;
  pos: Float32Array; // world x, y, z per sample (region frame, metres)
  depth: Float32Array; // view depth (m) per sample; 0 = nothing drawn
  foot: number;
  cut: number;
}

/** Unproject a grid of view depths through a camera: `invProj` / `camWorld` are its
 *  projectionMatrixInverse and matrixWorld (column-major elements, as three keeps them) and `off`
 *  the floating origin the renderer subtracted (U.uWorldOffset), added back. */
export function unprojectDepth(depth: Float32Array, w: number, h: number, invProj: ArrayLike<number>, camWorld: ArrayLike<number>, off: { x: number; y: number; z: number }, cut = Infinity): SeenGrid {
  const P = invProj, M = camWorld;
  // a view-space point on the far plane for NDC (x, y); scaled so its depth (−z) is the sample's
  const ray = (nx: number, ny: number) => {
    const x = P[0] * nx + P[4] * ny + P[8] + P[12], y = P[1] * nx + P[5] * ny + P[9] + P[13];
    const z = P[2] * nx + P[6] * ny + P[10] + P[14], w4 = P[3] * nx + P[7] * ny + P[11] + P[15];
    return [x / w4, y / w4, z / w4];
  };
  const pos = new Float32Array(w * h * 3);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i, d = depth[k];
      if (!(d > 0)) continue;
      const [vx, vy, vz] = ray(((i + 0.5) / w) * 2 - 1, ((j + 0.5) / h) * 2 - 1);
      const s = d / -vz, px = vx * s, py = vy * s, pz = -d;
      pos[k * 3] = M[0] * px + M[4] * py + M[8] * pz + M[12] + off.x;
      pos[k * 3 + 1] = M[1] * px + M[5] * py + M[9] * pz + M[13] + off.y;
      pos[k * 3 + 2] = M[2] * px + M[6] * py + M[10] * pz + M[14] + off.z;
    }
  // footprint per metre of depth: the frustum's width (height) over the samples across it
  const [rx, , rz] = ray(1, 0), [, uy, uz] = ray(0, 1);
  const foot = Math.max((2 * rx) / -rz / w, (2 * uy) / -uz / h);
  return { w, h, pos, depth, foot, cut };
}
