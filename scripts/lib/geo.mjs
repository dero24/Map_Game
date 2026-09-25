// Geometry helpers for the bake: local tangent-plane projection, ring assembly, polygon ops.
import { ORIGIN } from '../config.mjs';

const R = 6378137;
const K = Math.PI / 180;
const COS0 = Math.cos(ORIGIN.lat * K);

// Local frame: +x east, +z south (three.js convention: north is -z), meters.
export const project = (lat, lon) => [(lon - ORIGIN.lon) * K * R * COS0, -(lat - ORIGIN.lat) * K * R];
export const bboxToLocal = (b) => {
  const [x0, z0] = project(b.n, b.w);
  const [x1, z1] = project(b.s, b.e);
  return { x0, z0, x1, z1 };
};

export const ringArea = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
};
export const centroid = (r) => {
  let x = 0, z = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f;
    z += (r[j][1] + r[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return r[0];
  return [x / (3 * a), z / (3 * a)];
};
export const pointInRing = (x, z, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

// Drop closing duplicate and near-duplicate / collinear vertices.
export function cleanRing(r, eps = 0.15) {
  let pts = r.slice();
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  const out = [];
  for (const p of pts) {
    const q = out.at(-1);
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) <= eps) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.abs(cross) / Math.max(len, 1e-6) < 0.05) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

// Join way fragments (arrays of points) into closed rings by matching endpoints.
export function assembleRings(parts) {
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const pool = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.pop();
    let guard = 0;
    while (key(ring[0]) !== key(ring.at(-1)) && guard++ < 10000) {
      const end = key(ring.at(-1));
      const i = pool.findIndex((p) => key(p[0]) === end || key(p.at(-1)) === end);
      if (i < 0) break;
      const next = pool.splice(i, 1)[0];
      if (key(next[0]) !== end) next.reverse();
      ring = ring.concat(next.slice(1));
    }
    if (key(ring[0]) === key(ring.at(-1)) && ring.length > 3) rings.push(ring);
  }
  return rings;
}

// Oriented bounding box aligned to the polygon's best edge direction (minimum-area over edge angles).
export function obb(r) {
  let best = null;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of r) {
      const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ang, u0, u1, v0, v1 };
  }
  const { ang, u0, u1, v0, v1 } = best;
  const c = Math.cos(ang), s = Math.sin(ang);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { cx: cu * c - cv * s, cz: cu * s + cv * c, ang, len: u1 - u0, wid: v1 - v0, area: best.area };
}

export const segDist2 = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ez = az + t * dz - pz;
  return ex * ex + ez * ez;
};

// Douglas-Peucker for polylines.
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
      if (d > md) (md = d), (mi = i);
    }
    if (md > t2) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// WKT (MULTI)POLYGON -> array of polygons, each an array of rings of [lon,lat].
export function parseWkt(wkt) {
  const polys = [];
  const body = wkt.replace(/^MULTIPOLYGON\s*\(|^POLYGON\s*/, '');
  for (const pm of body.split(/\)\s*\)\s*,\s*\(\s*\(/)) {
    const rings = pm.replace(/[()]/g, '|').split('|').map((s) => s.trim()).filter((s) => /\d/.test(s) && s !== ',');
    polys.push(rings.map((r) => r.split(',').map((pt) => pt.trim().split(/\s+/).map(Number))));
  }
  return polys;
}

// Deterministic 32-bit hash of a string (FNV-1a) for stable per-building seeds.
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) (h ^= s.charCodeAt(i)), (h = Math.imul(h, 16777619));
  return h >>> 0;
}
