// Retaining walls (grade.ts): where a street is cut into a hill the hill is held back by a wall at
// the back of the sidewalk. Two kinds, as Seattle builds them: a rockery — basalt boulders stacked
// in courses, leaning back into the hill, moss in the lower joints — where the cut is low, and a
// cast-concrete wall in poured panels (joints every few metres, stained at the foot where the rain
// runs off, a coping along the top) where it's taller or the lot is built to the line. On top, a
// clipped hedge, or a pipe rail where the drop is worth a fall, or just the lawn. The panels come
// from the grading (x0, z0, x1, z1, foot0, top0, foot1, top1, the street toward the direction
// turned a quarter left). Walkers and cars meet them as walls (tile.walls). Where a house's front
// walk comes down to one, a flight of concrete steps climbs the face from the sidewalk to a landing
// at the top (wallStairs): the lots above the cut are places you can walk up to.
import * as THREE from 'three';
import { propMaterial } from '../render/propMaterial';

const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A run of panels end to end, and what it's built as. */
export interface WallRun { panels: number[]; kind: 'rockery' | 'concrete'; top: 'hedge' | 'rail' | 'none'; h: number }

/** The panels grouped into runs (each panel's far end is the next one's near end) and each run's
 *  kind: a rockery up to ~3 m (most low cuts), concrete above that; its top by the drop. */
export function wallRuns(walls: number[]): WallRun[] {
  const runs: WallRun[] = [];
  let cur: number[] = [];
  const close = () => {
    if (!cur.length) return;
    let h = 0;
    for (let i = 0; i + 7 < cur.length; i += 8) h = Math.max(h, cur[i + 5] - cur[i + 4], cur[i + 7] - cur[i + 6]);
    const u = hash(Math.round(cur[0] * 3.1) * 7919 + Math.round(cur[1] * 3.1)), u2 = hash(Math.round(cur[0] * 7.7) * 104729 + Math.round(cur[1] * 5.3) + 17);
    const kind = h <= 3.2 && u < 0.62 ? 'rockery' : 'concrete';
    const top = u2 < 0.45 ? 'hedge' : kind === 'concrete' && h > 1.8 ? 'rail' : 'none';
    runs.push({ panels: cur, kind, top, h });
    cur = [];
  };
  for (let i = 0; i + 7 < walls.length; i += 8) {
    const n = cur.length;
    if (n && Math.hypot(cur[n - 6] - walls[i], cur[n - 5] - walls[i + 1]) > 0.05) close();
    cur.push(...walls.slice(i, i + 8));
  }
  close();
  return runs;
}

let hedgeCache: THREE.BufferGeometry | null = null;
/** A clipped hedge run along x (3.4 m): a box of leaves, its top flat and its edges rounded by the
 *  shears, the sides a little uneven (the lumpy blobs a front garden's hedge is made of read as
 *  faceted boulders on a wall: round 9). */
function hedgeRun() {
  if (hedgeCache) return hedgeCache.clone();
  const L = 3.36, H = 0.84, D = 0.86, R = 0.16; // (length, height, depth, the shears' round)
  const g = new THREE.BoxGeometry(L, H, D, 12, 4, 4);
  const pos = g.attributes.position;
  const hx = L / 2 - R, hy = H / 2 - R, hz = D / 2 - R;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    // round the box: each point pulled onto a radius-R shell round the inner box
    const cx = Math.max(-hx, Math.min(hx, x)), cy = Math.max(-hy, Math.min(hy, y)), cz = Math.max(-hz, Math.min(hz, z));
    let dx = x - cx, dy = y - cy, dz = z - cz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    (dx = (dx / dl) * R), (dy = (dy / dl) * R), (dz = (dz / dl) * R);
    // leafy unevenness on the sides, less on the clipped top
    const n = 0.035 * Math.sin(x * 5.3 + z * 3.1) * Math.cos(y * 7.7 + x * 1.9) * (y > hy ? 0.4 : 1);
    pos.setXYZ(k, cx + dx * (1 + n), cy + dy + H / 2, cz + dz * (1 + n));
  }
  g.deleteAttribute('uv');
  hedgeCache = g.index ? g.toNonIndexed() : g;
  hedgeCache.computeVertexNormals();
  const n = hedgeCache.attributes.position.count;
  hedgeCache.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return hedgeCache.clone();
}

/** A flight up a wall's face where a front walk comes down to it: `x, z` the landing's middle at the
 *  face (the walk's crossing), `ux, uz` along the wall toward the flight's foot, `sx, sz` toward the
 *  street, `top` the landing's height, `foot` the sidewalk's at the bottom step, `run` the flight's
 *  length (0.28 m a step), `w` its width. */
export interface WallStair { x: number; z: number; ux: number; uz: number; sx: number; sz: number; top: number; foot: number; n: number; run: number; w: number }

/** Where each house's front walk (tile.walks: x0 z0 x1 z1 width; drives, 2.5 m and wider, go
 *  round) crosses a wall at least 0.7 m tall: a flight along the face, toward whichever end of the
 *  run has room for it, never two within 4 m. */
export function wallStairs(walls: number[], walks: number[]): WallStair[] {
  const out: WallStair[] = [];
  if (walls.length < 8 || !walks.length) return out;
  for (const run of wallRuns(walls)) {
    const P = run.panels, n = P.length / 8;
    // the run as a line: cumulative metres at each panel's start, for "is there room this way"
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(P[i * 8 + 2] - P[i * 8], P[i * 8 + 3] - P[i * 8 + 1]));
    const at = (m: number) => {
      // the run's foot and top m metres along it
      const i = Math.max(0, Math.min(n - 1, cum.findIndex((c, k) => k > 0 && c >= m) - 1)), q = i * 8;
      const f = Math.max(0, Math.min(1, (m - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i])));
      return { foot: P[q + 4] + (P[q + 6] - P[q + 4]) * f, top: P[q + 5] + (P[q + 7] - P[q + 5]) * f };
    };
    for (let w = 0; w + 4 < walks.length; w += 5) {
      const ax = walks[w], az = walks[w + 1], bx = walks[w + 2], bz = walks[w + 3], ww = walks[w + 4];
      if (ww >= 2.5) continue;
      for (let i = 0; i < n; i++) {
        const q = i * 8, px = P[q], pz = P[q + 1], dx = P[q + 2] - px, dz = P[q + 3] - pz, L = Math.hypot(dx, dz);
        const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (L < 0.5 || Math.abs(den) < 1e-6) continue;
        const t = ((ax - px) * ez - (az - pz) * ex) / den, u = ((ax - px) * dz - (az - pz) * dx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const m = cum[i] + t * L, here = at(m), sideW = Math.max(1.1, ww + 0.1);
        const ux0 = dx / L, uz0 = dz / L, sx = -uz0, sz = ux0;
        // this way or that along the wall: where the flight (and a step's clearance) fits the run
        for (const dir of [1, -1]) {
          const rise0 = here.top - (here.foot + 0.3);
          if (rise0 < 0.7) break;
          let steps = Math.max(3, Math.round(rise0 / 0.18)), len = steps * 0.28, foot = here.foot + 0.3;
          for (let it = 0; it < 2; it++) {
            // (the sidewalk at the foot of the flight: the street keeps climbing or falling under it)
            foot = at(m + dir * len).foot + 0.3;
            steps = Math.max(3, Math.round((here.top - foot) / 0.18));
            len = steps * 0.28;
          }
          const end = m + dir * (len + 0.3), land = m - dir * 0.9;
          if (end < 0.2 || end > cum[n] - 0.2 || land < 0.2 || land > cum[n] - 0.2 || here.top - foot < 0.7 || len > 14) continue;
          const x = px + dx * t, z = pz + dz * t;
          if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) break;
          out.push({ x, z, ux: ux0 * dir, uz: uz0 * dir, sx, sz, top: here.top, foot, n: steps, run: len, w: sideW });
          break;
        }
      }
    }
  }
  return out;
}

export function retainingWalls(walls: number[], stairs: WallStair[] = []): THREE.Group {
  const g = new THREE.Group();
  if (walls.length < 8) return g;
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  // a flat-shaded triangle (the watercolour reads each facet as its own wash)
  const tri = (a: number[], b: number[], c: number[], k: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    (nx /= l), (ny /= l), (nz /= l);
    for (const p of [a, b, c]) (pos.push(p[0], p[1], p[2]), nrm.push(nx, ny, nz), col.push(k[0], k[1], k[2]));
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], k: number[]) => (tri(a, b, c, k), tri(a, c, d, k));
  // (a quad washed from one colour at a–b to another at c–d)
  const quadV = (a: number[], b: number[], c: number[], d: number[], kab: number[], kcd: number[]) => {
    const n0 = pos.length;
    quad(a, b, c, d, kab);
    for (const [k, v] of [[2, 1], [4, 1], [5, 1]] as const) for (let j = 0; j < 3; j++) col[n0 + k * 3 + j] = kcd[j] * v; // c, c, d
  };
  const hedges: THREE.Matrix4[] = [], hedgeCols: THREE.Color[] = [];
  // the stretches of a panel (metres along it) a flight's landing leaves open at the top
  const open = (px: number, pz: number, ex: number, ez: number, L: number): [number, number][] => {
    let spans: [number, number][] = [[0, L]];
    for (const st of stairs) {
      const u = (st.x - px) * ex + (st.z - pz) * ez, off = Math.abs((st.x - px) * -ez + (st.z - pz) * ex);
      if (off > 0.3 || u < -1.2 || u > L + 1.2) continue;
      const a = u - 0.9, b = u + 0.9;
      spans = spans.flatMap(([s0, s1]) => (b <= s0 || a >= s1 ? [[s0, s1]] : [...(a > s0 ? [[s0, a]] : []), ...(b < s1 ? [[b, s1]] : [])]) as [number, number][]);
    }
    return spans.filter(([s0, s1]) => s1 - s0 > 0.05);
  };
  for (const run of wallRuns(walls)) {
    const P = run.panels;
    const ru = hash(Math.round(P[0] * 3.1) * 7919 + Math.round(P[1] * 3.1));
    let along = 0; // metres along the run (joints and courses carry across panels)
    for (let i = 0; i + 7 < P.length; i += 8) {
      const x0 = P[i], z0 = P[i + 1], x1 = P[i + 2], z1 = P[i + 3];
      const b0 = P[i + 4], t0 = P[i + 5], b1 = P[i + 6], t1 = P[i + 7];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
      const ex = dx / L, ez = dz / L, sx = -ez, sz = ex; // along; toward the street
      const pu = hash(Math.round(x0 * 3.1) * 7919 + Math.round(z0 * 3.1));
      if (run.kind === 'concrete') {
        // a poured panel: its own tone, darker at the foot, the coping lightest, 35 cm deep
        const v = 0.56 + pu * 0.08, T = 0.35;
        // (moss creeping up the foot of one panel in three, where the rain sits)
        const mossy = hash(Math.round(x0 * 3.1) * 7919 + Math.round(z0 * 3.1) + 4242) < 0.33;
        const face = [v * 0.97, v * 0.95, v * 0.9], foot = mossy ? [v * 0.62, v * 0.7, v * 0.5] : [v * 0.76, v * 0.74, v * 0.7], cap = [v * 1.08, v * 1.06, v * 1.02];
        const A = [x0, b0, z0], B = [x1, b1, z1], D = [x0, t0, z0];
        // (the rain's stain washing up from the foot)
        const m0 = b0 + Math.min(0.9, (t0 - b0) * 0.35), m1 = b1 + Math.min(0.9, (t1 - b1) * 0.35);
        quadV(A, B, [x1, m1, z1], [x0, m0, z0], foot, face);
        // board-formed: poured against planks, a course every ~0.3 m, each its own shade
        const courses = Math.max(1, Math.round(Math.max(t0 - m0, t1 - m1) / 0.3));
        for (let c = 0; c < courses; c++) {
          // (alternate boards a shade apart, each with its own wander: the grain reads from the street)
          const f0 = c / courses, f1 = (c + 1) / courses, k = (c % 2 ? 0.87 : 0.99) + 0.05 * hash(Math.round((along + L * 0.5) * 7) * 31 + c * 977 + Math.round(ru * 1e4));
          const ya0 = m0 + (t0 - m0) * f0, ya1 = m0 + (t0 - m0) * f1, yb0 = m1 + (t1 - m1) * f0, yb1 = m1 + (t1 - m1) * f1;
          quad([x0, ya0, z0], [x1, yb0, z1], [x1, yb1, z1], [x0, ya1, z0], [face[0] * k, face[1] * k, face[2] * k]);
        }
        // streaks where the rain runs off the coping: dark under it, fading down the face
        for (let q = 0; q < 2; q++) {
          const h = hash(Math.round(x0 * 5.3) * 131 + Math.round(z0 * 5.3) + q * 7717);
          if (h > 0.55) continue;
          const u0 = 0.4 + h * (L - 1.2), sw2 = 0.25 + h * 0.5, f = u0 / L, ya = t0 + (t1 - t0) * f, yb = b0 + (b1 - b0) * f;
          const dn = Math.min(ya - yb - 0.3, 0.8 + h * 2.2), px2 = x0 + dx * f + sx * 0.008, pz2 = z0 + dz * f + sz * 0.008;
          const streak = [v * 0.58, v * 0.58, v * 0.57];
          quadV([px2 + ex * sw2, ya - 0.05, pz2 + ez * sw2], [px2, ya - 0.05, pz2], [px2, ya - 0.05 - dn, pz2], [px2 + ex * sw2, ya - 0.05 - dn, pz2 + ez * sw2], streak, face);
        }
        const C = [x1, t1, z1];
        quad(D, C, [x1 - sx * T, t1, z1 - sz * T], [x0 - sx * T, t0, z0 - sz * T], cap);
        quad([x0 + sx * 0.04, t0 + 0.12, z0 + sz * 0.04], [x1 + sx * 0.04, t1 + 0.12, z1 + sz * 0.04], [x1 + sx * 0.04, t1, z1 + sz * 0.04], [x0 + sx * 0.04, t0, z0 + sz * 0.04], cap);
        // the joints between pours, every ~3.3 m along the run
        const J = 3.1 + ru * 0.6;
        for (let s = Math.ceil(along / J) * J - along; s < L; s += J) {
          if (along + s < 0.5) continue; // (the wall's end is its end, not a joint)
          const f = s / L, jb = b0 + (b1 - b0) * f, jt = t0 + (t1 - t0) * f, jx = x0 + dx * f + sx * 0.012, jz = z0 + dz * f + sz * 0.012;
          quad([jx - ex * 0.03, jb, jz - ez * 0.03], [jx + ex * 0.03, jb, jz + ez * 0.03], [jx + ex * 0.03, jt, jz + ez * 0.03], [jx - ex * 0.03, jt, jz - ez * 0.03], [v * 0.62, v * 0.6, v * 0.57]);
        }
        // a pipe rail along the coping where the drop is worth a fall
        if (run.top === 'rail') {
          const rail = [0.24, 0.27, 0.25], ry = 1.05;
          const cx = -sx * 0.16, cz = -sz * 0.16;
          // (open where a flight's landing comes up through it)
          for (const [ua, ub] of open(x0, z0, ex, ez, L)) {
            const fa = ua / L, fb = ub / L;
            for (const hy of [ry, 0.55]) {
              const a = [x0 + dx * fa + cx, t0 + (t1 - t0) * fa + hy, z0 + dz * fa + cz], b = [x0 + dx * fb + cx, t0 + (t1 - t0) * fb + hy, z0 + dz * fb + cz];
              quad([a[0], a[1] - 0.025, a[2]], [b[0], b[1] - 0.025, b[2]], [b[0], b[1] + 0.025, b[2]], [a[0], a[1] + 0.025, a[2]], rail);
              quad([a[0], a[1] + 0.025, a[2]], [b[0], b[1] + 0.025, b[2]], [b[0] - sx * 0.05, b[1] + 0.025, b[2] - sz * 0.05], [a[0] - sx * 0.05, a[1] + 0.025, a[2] - sz * 0.05], rail);
            }
          }
          const R = 2.2;
          for (let s = Math.ceil(along / R) * R - along; s < L; s += R) {
            if (!open(x0, z0, ex, ez, L).some(([ua, ub]) => s >= ua && s <= ub)) continue;
            const f = s / L, px = x0 + dx * f + cx, pz = z0 + dz * f + cz, py = t0 + (t1 - t0) * f;
            quad([px - ex * 0.025, py, pz - ez * 0.025], [px + ex * 0.025, py, pz + ez * 0.025], [px + ex * 0.025, py + ry + 0.03, pz + ez * 0.025], [px - ex * 0.025, py + ry + 0.03, pz - ez * 0.025], rail);
          }
        }
      } else {
        // a rockery: boulders in courses on a face leaning back into the hill, the gaps dark
        const h = Math.max(t0 - b0, t1 - b1), bat = Math.min(0.6, 0.18 * h);
        const at = (u: number, w: number, out: number) => {
          // a point u m along the panel, w (0 foot … 1 top) up its face, out m proud of it
          const f = Math.max(0, Math.min(1, u / L)), fb = b0 + (b1 - b0) * f, ft = t0 + (t1 - t0) * f;
          const back = bat * w - out;
          return [x0 + dx * f - sx * back, fb + (ft - fb) * w, z0 + dz * f - sz * back];
        };
        const gap = [0.2, 0.19, 0.175];
        quad(at(0, 0, 0), at(L, 0, 0), at(L, 1, 0), at(0, 1, 0), gap);
        const rows = Math.max(1, Math.round(h / 0.6));
        const vm = 0.02 / Math.max(0.3, h / rows); // (≈2 cm of dark joint top and bottom, as a share of the course)
        for (let r = 0; r < rows; r++) {
          const w0 = r / rows, w1 = (r + 1) / rows;
          const rh = hash(r * 31 + Math.round(ru * 1e5));
          // (courses break joint: each starts at its own offset, carried along the run)
          let u = -((along + rh * 1.1) % 1.1);
          for (let k = 0; u < L; k++) {
            const key = Math.round((along + u) * 13) * 131 + r * 977 + Math.round(ru * 1e4);
            const q = hash(key), q2 = hash(key + 1), q3 = hash(key + 2);
            const sw = 0.5 + q * 0.8, ua = Math.max(0, u + 0.02), ub = Math.min(L, u + sw - 0.02);
            u += sw;
            if (ub - ua < 0.15) continue;
            // a boulder filling its cell: six points close round it (two corners cut, its top and
            // bottom edges wandering a little), rising gently to a crown a little off its middle
            const top = r === rows - 1 ? w1 : w1 - vm - q2 * (w1 - w0) * 0.06, bot = w0 + vm + q3 * (w1 - w0) * 0.05;
            const W = ub - ua, Hh = top - bot, j = (n: number) => (hash(key + 7 + n) - 0.5) * 0.08;
            const out = 0.02 + q * 0.03, crown = out + 0.05 + q3 * 0.05;
            const ring = [at(ua, bot + Hh * (0.18 + j(0)), out * 0.6), at(ua + W * (0.13 + j(1)), bot, out * 0.7), at(ub - W * (0.09 + j(2)), bot, out * 0.6), at(ub, bot + Hh * (0.55 + j(3)), out * 0.65), at(ub - W * (0.12 + j(4)), top, out * 0.55), at(ua + W * (0.08 + j(5)), top, out * 0.6)];
            const c = at(ua + W * (0.45 + (q2 - 0.5) * 0.2), bot + Hh * (0.55 + (q - 0.5) * 0.2), crown);
            // basalt: dark grey-brown, each stone its own; moss on some of the lower courses
            const t = 0.33 + q * 0.14, moss = r < Math.max(1, rows / 2) && hash(key + 5) < 0.13;
            const k0 = moss ? [t * 0.84, t * 0.93, t * 0.7] : [t, t * 0.97, t * 0.93];
            for (let j = 0; j < 6; j++) tri(c, ring[j], ring[(j + 1) % 6], j % 2 ? k0 : [k0[0] * 0.92, k0[1] * 0.92, k0[2] * 0.92]);
          }
        }
      }
      // a clipped hedge along the top, half a metre back from the edge
      if (run.top === 'hedge') {
        const S = 3.3;
        for (let s = Math.ceil((along - S / 2) / S) * S + S / 2 - along; s < L; s += S) {
          const f = s / L, hx = x0 + dx * f - sx * 0.6, hz = z0 + dz * f - sz * 0.6, hy = t0 + (t1 - t0) * f - 0.08;
          if (stairs.some((st) => Math.hypot(st.x - (x0 + dx * f), st.z - (z0 + dz * f)) < 2.6)) continue; // (the steps come up here)
          const q = hash(Math.round(hx * 5) * 7919 + Math.round(hz * 5));
          hedges.push(new THREE.Matrix4().compose(new THREE.Vector3(hx, hy, hz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-ez, ex)), new THREE.Vector3(1, 1.05 + q * 0.4, 1.1)));
          hedgeCols.push(new THREE.Color().setRGB(0.22 + q * 0.06, 0.36 + q * 0.06, 0.18 + q * 0.03));
        }
      }
      along += L;
    }
  }
  const nWall = pos.length;
  // the flights: solid concrete steps against the face, a landing at the top, a pipe rail on the open side
  for (const st of stairs) {
    const { x, z, ux, uz, sx, sz, top, foot, n, run: len, w } = st;
    const rs = (top - foot) / n, stone = [0.62, 0.6, 0.56], tread = [0.7, 0.68, 0.64], rail = [0.24, 0.27, 0.25];
    const box = (u0: number, u1: number, y0: number, y1: number, k: number[]) => {
      // a block from u0 to u1 m along the flight (from the landing toward the foot), across its width
      const a = (u: number, s: number): number[] => [x + ux * u + sx * s, 0, z + uz * u + sz * s];
      const [p0, p1, p2, p3] = [a(u0, 0.04), a(u1, 0.04), a(u1, 0.04 + w), a(u0, 0.04 + w)];
      const P = (p: number[], y: number) => [p[0], y, p[2]];
      quad(P(p0, y1), P(p1, y1), P(p2, y1), P(p3, y1), tread); // the tread
      quad(P(p3, y0), P(p2, y0), P(p2, y1), P(p3, y1), k); // the open side
      quad(P(p1, y0), P(p2, y0), P(p2, y1), P(p1, y1), k); // the riser (toward the foot)
      quad(P(p0, y0), P(p3, y0), P(p3, y1), P(p0, y1), k); // the back
    };
    box(-0.9, 0.3, foot - 0.2, top, stone); // the landing
    for (let k = 0; k < n; k++) box(0.3 + k * 0.28, 0.3 + (k + 1) * 0.28, foot - 0.2, top - k * rs, stone);
    // a pipe rail up the open side, posts at the landing and the foot
    const rx = (u: number) => x + ux * u + sx * (0.04 + w - 0.06), rz = (u: number) => z + uz * u + sz * (0.04 + w - 0.06);
    const ya = top + 0.95, yb = foot + 0.95;
    quad([rx(-0.9), ya - 0.025, rz(-0.9)], [rx(0.3), ya - 0.025, rz(0.3)], [rx(0.3), ya + 0.025, rz(0.3)], [rx(-0.9), ya + 0.025, rz(-0.9)], rail);
    quad([rx(0.3), ya - 0.025, rz(0.3)], [rx(0.3 + len), yb - 0.025, rz(0.3 + len)], [rx(0.3 + len), yb + 0.025, rz(0.3 + len)], [rx(0.3), ya + 0.025, rz(0.3)], rail);
    for (const [u, y] of [[-0.9, top], [0.3, top], [0.3 + len - 0.1, foot + (0.1 / 0.28) * rs]] as const)
      quad([rx(u) - ux * 0.025, y, rz(u) - uz * 0.025], [rx(u) + ux * 0.025, y, rz(u) + uz * 0.025], [rx(u) + ux * 0.025, y + 0.98, rz(u) + uz * 0.025], [rx(u) - ux * 0.025, y + 0.98, rz(u) - uz * 0.025], rail);
  }
  // the walls, and the steps as their own mesh (what a frame of "the steps" is of)
  const mesh = (a: number, b: number, name: string) => {
    if (b <= a) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(a, b), 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm.slice(a, b), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col.slice(a, b), 3));
    const m = new THREE.Mesh(geo, propMaterial());
    m.name = name;
    g.add(m);
  };
  mesh(0, nWall, 'retaining-walls');
  mesh(nWall, pos.length, 'retaining-steps');
  if (hedges.length) {
    const im = new THREE.InstancedMesh(hedgeRun(), propMaterial({ foliage: true }), hedges.length);
    hedges.forEach((mt, k) => { im.setMatrixAt(k, mt); im.setColorAt(k, hedgeCols[k]); });
    im.name = 'retaining-hedges';
    g.add(im);
  }
  return g;
}

/** A flight's collision: the ramp you walk (from the sidewalk at its foot up to the landing, level
 *  from there to the wall), its open side and the landing's far end as walls. */
export function stairColliders(stairs: WallStair[]): { walls: [[number, number], [number, number], number, number][]; decks: { pts: [number, number][]; cum: number[]; hw: number; p: { k: 'ramp'; y0: number; y1: number; total: number } }[] } {
  const walls: [[number, number], [number, number], number, number][] = [], decks: { pts: [number, number][]; cum: number[]; hw: number; p: { k: 'ramp'; y0: number; y1: number; total: number } }[] = [];
  for (const { x, z, ux, uz, sx, sz, top, foot, run, w } of stairs) {
    const mid = 0.04 + w / 2, at = (u: number, s: number): [number, number] => [x + ux * u + sx * s, z + uz * u + sz * s];
    const bottom = at(0.3 + run, mid), land = at(-0.9, mid), L = Math.hypot(land[0] - bottom[0], land[1] - bottom[1]);
    decks.push({ pts: [bottom, land], cum: [0, L], hw: w / 2 - 0.06, p: { k: 'ramp', y0: foot, y1: top, total: run } });
    walls.push([at(-0.9, 0.04 + w + 0.02), at(0.3 + run, 0.04 + w + 0.02), -Infinity, Infinity]); // the open side (railed)
    walls.push([at(-0.9, 0.02), at(-0.9, 0.04 + w + 0.02), -Infinity, Infinity]); // the landing's far end
  }
  return { walls, decks };
}

/** The collider for each panel: a walker on the sidewalk meets it from the foot to 40 cm under
 *  its top (someone up on the hill steps off the top). */
export function retainingColliders(walls: number[]): [[number, number], [number, number], number, number][] {
  const out: [[number, number], [number, number], number, number][] = [];
  for (let i = 0; i + 7 < walls.length; i += 8)
    out.push([[walls[i], walls[i + 1]], [walls[i + 2], walls[i + 3]], Math.min(walls[i + 4], walls[i + 6]) - 1, Math.min(walls[i + 5], walls[i + 7]) - 0.4]);
  return out;
}
