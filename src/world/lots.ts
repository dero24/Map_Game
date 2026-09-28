// Parking lots: a stall layout for any mapped lot outline (OSM amenity=parking → Area 'parking'),
// shared by the ground paint (the stall lines) and the props (the cars), so the two always agree.
// Rows run along the lot's longest edge: a row of stalls nosed to that edge, a 7 m aisle, then
// back-to-back double rows with aisles between — the layout of nearly every American surface lot.
// Pure and deterministic: the same outline gives the same stalls on every machine.

export type P = [number, number];
export interface Stall { x: number; z: number; yaw: number; hq: number }
export interface LotLayout {
  /** unit vector along the rows, and across them (into the lot) */
  u: P;
  v: P;
  /** stall-line segments (x0, z0, x1, z1): the boundaries between and at the ends of stalls */
  lines: number[];
  stalls: Stall[];
}

const STALL_W = 2.7, STALL_L = 5.5, AISLE = 7;

function inside(ring: P[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const hash = (x: number, z: number) => {
  let h = (Math.floor(x * 7.31) * 73856093) ^ (Math.floor(z * 5.17) * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** Stall rows across the band [v0, v1] (metres from the anchor edge, into the lot). */
function rowBands(depth: number): [number, number, number][] {
  // [v0, v1, facing]: facing +1 = nose toward +v, −1 = nose toward −v (toward the anchor edge)
  const out: [number, number, number][] = [[0.4, 0.4 + STALL_L, -1]];
  for (let v = 0.4 + STALL_L + AISLE; v + STALL_L <= depth; v += 2 * STALL_L + AISLE) {
    out.push([v, v + STALL_L, 1]);
    if (v + 2 * STALL_L <= depth) out.push([v + STALL_L, v + 2 * STALL_L, -1]);
  }
  return out;
}

export function lotLayout(ring: P[], maxStalls = 400): LotLayout | null {
  if (ring.length < 3) return null;
  // the anchor: the longest edge
  let best = -1, bl = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) (bl = l), (best = i);
  }
  if (bl < STALL_W * 3) return null;
  const A = ring[best], B = ring[(best + 1) % ring.length];
  const u: P = [(B[0] - A[0]) / bl, (B[1] - A[1]) / bl];
  // v points into the lot: test the normal that has the centroid on its side
  let cx = 0, cz = 0;
  for (const [x, z] of ring) (cx += x / ring.length), (cz += z / ring.length);
  let v: P = [-u[1], u[0]];
  if ((cx - A[0]) * v[0] + (cz - A[1]) * v[1] < 0) v = [u[1], -u[0]];
  // the lot's extent in (u, v) from the anchor
  let u0 = Infinity, u1 = -Infinity, depth = 0;
  for (const [x, z] of ring) {
    const pu = (x - A[0]) * u[0] + (z - A[1]) * u[1], pv = (x - A[0]) * v[0] + (z - A[1]) * v[1];
    (u0 = Math.min(u0, pu)), (u1 = Math.max(u1, pu)), (depth = Math.max(depth, pv));
  }
  if (depth < STALL_L + 0.8) return null;
  const at = (pu: number, pv: number): P => [A[0] + u[0] * pu + v[0] * pv, A[1] + u[1] * pu + v[1] * pv];
  const lines: number[] = [], stalls: Stall[] = [];
  const m0 = Math.floor(u0 / STALL_W), m1 = Math.ceil(u1 / STALL_W) - 1;
  for (const [r0, r1, face] of rowBands(depth)) {
    // a stall exists only where all four corners are in the lot
    const ok = (m: number) => [at(m * STALL_W, r0), at((m + 1) * STALL_W, r0), at((m + 1) * STALL_W, r1), at(m * STALL_W, r1)].every(([x, z]) => inside(ring, x, z));
    let prev = false;
    for (let m = m0 - 1; m <= m1; m++) {
      const here = ok(m);
      // a line on every stall boundary with a stall on either side
      if (here || prev) {
        const [x0, z0] = at(m * STALL_W, r0), [x1, z1] = at(m * STALL_W, r1);
        lines.push(x0, z0, x1, z1);
      }
      prev = here;
      if (!here || stalls.length >= maxStalls) continue;
      const [sx, sz] = at((m + 0.5) * STALL_W, (r0 + r1) / 2);
      // nose toward the stall's head (the car model's bow is −z: yaw = atan2(−dx, −dz))
      const dx = v[0] * face, dz = v[1] * face;
      stalls.push({ x: sx, z: sz, yaw: Math.atan2(-dx, -dz), hq: hash(sx, sz) });
    }
    if (prev) {
      const [x0, z0] = at((m1 + 1) * STALL_W, r0), [x1, z1] = at((m1 + 1) * STALL_W, r1);
      lines.push(x0, z0, x1, z1);
    }
  }
  return lines.length || stalls.length ? { u, v, lines, stalls } : null;
}
