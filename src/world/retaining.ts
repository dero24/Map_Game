// Retaining walls (grade.ts): where a street is cut into a hill the hill is held back by a wall at
// the back of the sidewalk. Two kinds, as Seattle builds them: a rockery — basalt boulders stacked
// in courses, leaning back into the hill, moss in the lower joints — where the cut is low, and a
// cast-concrete wall in poured panels (joints every few metres, stained at the foot where the rain
// runs off, a coping along the top) where it's taller or the lot is built to the line. On top, a
// clipped hedge, or a pipe rail where the drop is worth a fall, or just the lawn. The panels come
// from the grading (x0, z0, x1, z1, foot0, top0, foot1, top1, the street toward the direction
// turned a quarter left). Walkers and cars meet them as walls (tile.walls).
import * as THREE from 'three';
import { propMaterial } from '../render/propMaterial';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
/** A clipped hedge run along x (3.4 m), the same lumpy blobs as a front garden's. */
function hedgeRun() {
  if (hedgeCache) return hedgeCache.clone();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.IcosahedronGeometry(0.5, 1);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const n = 1 + 0.12 * Math.sin(x * 9.1 + i * 1.7) * Math.cos(z * 7.3 + y * 5.1);
      pos.setXYZ(k, x * 0.95 * n, Math.min(y, 0.36) * 0.95 * n, z * 0.6 * n);
    }
    parts.push(g.translate((-1.36 + i * 0.68) * 0.86, 0.42, 0));
  }
  hedgeCache = mergeGeometries(parts); // (icosahedra come unindexed)
  hedgeCache.computeVertexNormals();
  const n = hedgeCache.attributes.position.count;
  hedgeCache.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return hedgeCache.clone();
}

export function retainingWalls(walls: number[]): THREE.Group {
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
        const face = [v * 0.97, v * 0.95, v * 0.9], foot = [v * 0.76, v * 0.74, v * 0.7], cap = [v * 1.08, v * 1.06, v * 1.02];
        const A = [x0, b0, z0], B = [x1, b1, z1], C = [x1, t1, z1], D = [x0, t0, z0];
        // (the rain's stain washing up from the foot)
        const m0 = b0 + Math.min(0.9, (t0 - b0) * 0.35), m1 = b1 + Math.min(0.9, (t1 - b1) * 0.35);
        quadV(A, B, [x1, m1, z1], [x0, m0, z0], foot, face);
        quad([x0, m0, z0], [x1, m1, z1], C, D, face);
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
          for (const hy of [ry, 0.55]) {
            const a = [x0 + cx, t0 + hy, z0 + cz], b = [x1 + cx, t1 + hy, z1 + cz];
            quad([a[0], a[1] - 0.025, a[2]], [b[0], b[1] - 0.025, b[2]], [b[0], b[1] + 0.025, b[2]], [a[0], a[1] + 0.025, a[2]], rail);
            quad([a[0], a[1] + 0.025, a[2]], [b[0], b[1] + 0.025, b[2]], [b[0] - sx * 0.05, b[1] + 0.025, b[2] - sz * 0.05], [a[0] - sx * 0.05, a[1] + 0.025, a[2] - sz * 0.05], rail);
          }
          const R = 2.2;
          for (let s = Math.ceil(along / R) * R - along; s < L; s += R) {
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
          const q = hash(Math.round(hx * 5) * 7919 + Math.round(hz * 5));
          hedges.push(new THREE.Matrix4().compose(new THREE.Vector3(hx, hy, hz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-ez, ex)), new THREE.Vector3(1, 1.05 + q * 0.4, 1.1)));
          hedgeCols.push(new THREE.Color().setRGB(0.22 + q * 0.06, 0.36 + q * 0.06, 0.18 + q * 0.03));
        }
      }
      along += L;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, propMaterial());
  m.name = 'retaining-walls';
  g.add(m);
  if (hedges.length) {
    const im = new THREE.InstancedMesh(hedgeRun(), propMaterial({ foliage: true }), hedges.length);
    hedges.forEach((mt, k) => { im.setMatrixAt(k, mt); im.setColorAt(k, hedgeCols[k]); });
    im.name = 'retaining-hedges';
    g.add(im);
  }
  return g;
}

/** The collider for each panel: a walker on the sidewalk meets it from the foot to 40 cm under
 *  its top (someone up on the hill steps off the top). */
export function retainingColliders(walls: number[]): [[number, number], [number, number], number, number][] {
  const out: [[number, number], [number, number], number, number][] = [];
  for (let i = 0; i + 7 < walls.length; i += 8)
    out.push([[walls[i], walls[i + 1]], [walls[i + 2], walls[i + 3]], Math.min(walls[i + 4], walls[i + 6]) - 1, Math.min(walls[i + 5], walls[i + 7]) - 0.4]);
  return out;
}
