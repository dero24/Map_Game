// Raster helpers: grid mapping, polygon scanline fill, segment rasterization, components, EDT.
import { segDist2 } from './geo.mjs';

export class Grid {
  constructor(x0, z0, x1, z1, cell) {
    this.cell = cell;
    this.w = Math.ceil((x1 - x0) / cell);
    this.h = Math.ceil((z1 - z0) / cell);
    this.x0 = x0;
    this.z0 = z0;
  }
  cx(i) { return this.x0 + (i + 0.5) * this.cell; }
  cz(j) { return this.z0 + (j + 0.5) * this.cell; }
  gi(x) { return Math.floor((x - this.x0) / this.cell); }
  gj(z) { return Math.floor((z - this.z0) / this.cell); }
  header() { return { x0: this.x0, z0: this.z0, cell: this.cell, w: this.w, h: this.h }; }
}

// Even-odd scanline fill of a set of rings (holes supported via parity). value written into arr.
export function fillRings(g, arr, rings, value) {
  let zmin = Infinity, zmax = -Infinity;
  for (const r of rings) for (const p of r) (zmin = Math.min(zmin, p[1])), (zmax = Math.max(zmax, p[1]));
  const j0 = Math.max(0, g.gj(zmin)), j1 = Math.min(g.h - 1, g.gj(zmax));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = g.cz(j);
    xs.length = 0;
    for (const r of rings)
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
        const [xa, za] = r[k], [xb, zb] = r[i];
        if (za > z !== zb > z) xs.push(xa + ((z - za) / (zb - za)) * (xb - xa));
      }
    xs.sort((a, b) => a - b);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const i0 = Math.max(0, Math.ceil((xs[n] - g.x0) / g.cell - 0.5));
      const i1 = Math.min(g.w - 1, Math.floor((xs[n + 1] - g.x0) / g.cell - 0.5));
      for (let i = i0; i <= i1; i++) arr[j * g.w + i] = value;
    }
  }
}

// Mark every cell a segment passes through (dense sampling at quarter-cell steps).
export function stampSegment(g, arr, ax, az, bx, bz, value) {
  const n = Math.max(1, Math.ceil((Math.hypot(bx - ax, bz - az) / g.cell) * 4));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const i = g.gi(ax + (bx - ax) * t), j = g.gj(az + (bz - az) * t);
    if (i >= 0 && j >= 0 && i < g.w && j < g.h) arr[j * g.w + i] = value;
  }
}

// 4-connected component labelling of cells where pred(idx) is true. Returns Int32Array labels (-1 = excluded).
export function components(g, pred) {
  const lab = new Int32Array(g.w * g.h).fill(-1);
  const stack = new Int32Array(g.w * g.h);
  let n = 0;
  for (let s = 0; s < lab.length; s++) {
    if (lab[s] >= 0 || !pred(s)) continue;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = n;
    while (sp) {
      const c = stack[--sp];
      const i = c % g.w, j = (c / g.w) | 0;
      const nb = [i > 0 ? c - 1 : -1, i < g.w - 1 ? c + 1 : -1, j > 0 ? c - g.w : -1, j < g.h - 1 ? c + g.w : -1];
      for (const q of nb) if (q >= 0 && lab[q] < 0 && pred(q)) (lab[q] = n), (stack[sp++] = q);
    }
    n++;
  }
  return { lab, count: n };
}

// Felzenszwalb-Huttenlocher squared Euclidean distance transform. f: Float64Array (0 at sites, Inf elsewhere).
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k] && k > 0) k--;
      else break;
    }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
export function edt(g, isSite) {
  const { w, h } = g;
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = isSite(i) ? 0 : 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) f[j] = out[j * w + i];
    edt1d(f, h, d, v, z);
    for (let j = 0; j < h; j++) out[j * w + i] = d[j];
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) f[i] = out[j * w + i];
    edt1d(f, w, d, v, z);
    for (let i = 0; i < w; i++) out[j * w + i] = Math.sqrt(d[i]) * g.cell;
  }
  return out;
}

// Signed distance (m, + on land) with exact segment distances near the shore and EDT elsewhere.
export function signedDistance(g, land, segs, exactBand = 24) {
  const dWater = edt(g, (i) => !land[i]); // distance from land cells to nearest water
  const dLand = edt(g, (i) => land[i]);
  const sdf = new Float32Array(g.w * g.h);
  // Bucket segments for the exact pass.
  const B = 32;
  const bw = Math.ceil((g.w * g.cell) / B), bh = Math.ceil((g.h * g.cell) / B);
  const buckets = new Map();
  for (const s of segs) {
    const i0 = Math.floor((Math.min(s[0], s[2]) - g.x0 - exactBand) / B), i1 = Math.floor((Math.max(s[0], s[2]) - g.x0 + exactBand) / B);
    const j0 = Math.floor((Math.min(s[1], s[3]) - g.z0 - exactBand) / B), j1 = Math.floor((Math.max(s[1], s[3]) - g.z0 + exactBand) / B);
    for (let i = Math.max(0, i0); i <= Math.min(bw - 1, i1); i++)
      for (let j = Math.max(0, j0); j <= Math.min(bh - 1, j1); j++) {
        const k = j * bw + i;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(s);
      }
  }
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const c = j * g.w + i;
      const coarse = land[c] ? dWater[c] - g.cell * 0.5 : -(dLand[c] - g.cell * 0.5);
      if (Math.abs(coarse) > exactBand) { sdf[c] = coarse; continue; }
      const x = g.cx(i), z = g.cz(j);
      const list = buckets.get(Math.floor((z - g.z0) / B) * bw + Math.floor((x - g.x0) / B));
      let best = Infinity;
      if (list) for (const s of list) best = Math.min(best, segDist2(x, z, s[0], s[1], s[2], s[3]));
      const d = Math.sqrt(best);
      sdf[c] = isFinite(d) && d < Math.abs(coarse) + g.cell * 1.5 ? (land[c] ? d : -d) : coarse;
    }
  return sdf;
}

export function bilinear(arr, w, h, fx, fy) {
  fx = Math.max(0, Math.min(w - 1.001, fx));
  fy = Math.max(0, Math.min(h - 1.001, fy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  const i = y0 * w + x0;
  return (arr[i] * (1 - ax) + arr[i + 1] * ax) * (1 - ay) + (arr[i + w] * (1 - ax) + arr[i + w + 1] * ax) * ay;
}
