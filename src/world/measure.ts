// Roof measurement from a height-above-ground raster (LiDAR, see lidarCore.ts / lidar.ts).
//
// For one footprint: sample the raster on a 1 m grid inside the outline (inset from the
// walls so no sample straddles roof and ground), then fit each roof family as a straight
// line in one feature, h = eave + k·f, with Tukey-reweighted least squares (a tree over
// the eaves or an AC unit on a flat roof is an outlier, not data):
//   flat          f = 0
//   hip           f = distance to the outline — for a rectangle exactly the equal-pitch hip;
//                 for other outlines a close stand-in (it departs from the true straight
//                 skeleton near reflex corners), so there it only says "pitched" (rise and
//                 eave) and the building keeps its mapped gable/hip style
//   gable (rect)  f = distance to the two long walls (ridge along the long axis), or to
//                 the two short walls (ridge across) — only for near-rectangles
// The eave comes out at the wall line (f = 0) and the ridge at the largest f, so the game
// gets true wall and ridge heights instead of a storey count guessed from one number.
type P2 = [number, number];

// 'gableX': ridge across the short axis (the game's skeleton roofs run it along the long
// axis — eav is then restated for that orientation at the measured pitch). 'pitched': a
// non-rectangular outline whose style the fit can't tell apart.
export type RoofFit = 'flat' | 'hip' | 'gable' | 'gableX' | 'pitched';
export interface Measured {
  h: number; // ridge (or flat roof) height above ground, m
  eav: number; // eave height at the wall line, m
  rs: RoofFit;
  k: number; // slope (rise per horizontal metre)
  rms: number; // robust residual, m
  q: number; // 0..1 confidence
  n: number; // samples used
}

export function polyArea(r: P2[]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a) / 2;
}
function inPoly(r: P2[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDist(r: P2[], x: number, z: number) {
  let m = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j], [bx, bz] = r[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    m = Math.min(m, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return m;
}
function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Minimum-area bounding rectangle (rotating the hull's edge directions).
export function obb(r: P2[]) {
  const H = hull(r);
  let best = { area: Infinity, cx: 0, cz: 0, ux: 1, uz: 0, L: 0, W: 0 };
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of H) {
      const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux;
      (u0 = Math.min(u0, u)), (u1 = Math.max(u1, u)), (v0 = Math.min(v0, v)), (v1 = Math.max(v1, v));
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) {
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      let L = (u1 - u0) / 2, W = (v1 - v0) / 2, ax = ux, az = uz;
      if (W > L) [L, W, ax, az] = [W, L, -uz, ux]; // u = long axis
      best = { area, cx: uc * ux - vc * uz, cz: uc * uz + vc * ux, ux: ax, uz: az, L, W };
    }
  }
  return best;
}

interface Fit { e: number; k: number; rms: number; inl: number }
// h ≈ e + k·f, Tukey biweight IRLS; k ≥ 0 (roofs rise inward). `flat` pins k = 0.
export function robustFit(f: Float64Array, h: Float64Array, flat = false): Fit {
  const n = h.length, w = new Float64Array(n).fill(1), res = new Float64Array(n);
  let e = 0, k = 0;
  for (let it = 0; it < 8; it++) {
    let sw = 0, sf = 0, sh = 0, sff = 0, sfh = 0;
    for (let i = 0; i < n; i++) {
      const wi = w[i];
      if (!wi) continue;
      (sw += wi), (sf += wi * f[i]), (sh += wi * h[i]), (sff += wi * f[i] * f[i]), (sfh += wi * f[i] * h[i]);
    }
    if (sw <= 0) break;
    const den = sw * sff - sf * sf;
    k = flat || Math.abs(den) < 1e-9 ? 0 : Math.max(0, (sw * sfh - sf * sh) / den);
    e = (sh - k * sf) / sw;
    for (let i = 0; i < n; i++) res[i] = h[i] - e - k * f[i];
    const a = Array.from(res, Math.abs).sort((x, y) => x - y);
    const s = 1.4826 * a[n >> 1] + 0.08; // floor: raster noise ~ a few cm; keep the scale sane on perfect data
    for (let i = 0; i < n; i++) { const u = res[i] / (4.685 * s); w[i] = Math.abs(u) < 1 ? (1 - u * u) ** 2 : 0; }
  }
  let sw = 0, sr = 0, inl = 0;
  for (let i = 0; i < n; i++) { (sw += w[i]), (sr += w[i] * res[i] * res[i]); if (w[i] > 0) inl++; }
  return { e, k, rms: Math.sqrt(sr / Math.max(sw, 1e-9)), inl: inl / n };
}

export function measureFootprint(ring: P2[], at: (x: number, z: number) => number, prior?: 'gable' | 'hip' | 'flat'): Measured | null {
  const area = polyArea(ring);
  if (area < 18) return null; // a shed's worth of 1 m bins is noise
  const B = obb(ring);
  const rect = area / (4 * B.L * B.W) > 0.86;
  const inset = B.W > 3 ? 0.75 : 0.45;
  const us: number[] = [], vs: number[] = [], ds: number[] = [], hs: number[] = [];
  let tried = 0;
  const step = 1;
  for (let u = -B.L + step / 2; u < B.L; u += step) for (let v = -B.W + step / 2; v < B.W; v += step) {
    const x = B.cx + u * B.ux - v * B.uz, z = B.cz + u * B.uz + v * B.ux;
    if (!inPoly(ring, x, z)) continue;
    const d = edgeDist(ring, x, z);
    if (d < inset) continue;
    tried++;
    const hv = at(x, z);
    if (!Number.isFinite(hv)) continue;
    us.push(u), vs.push(v), ds.push(d), hs.push(hv);
  }
  const n = hs.length;
  if (n < 8 || n < tried * 0.5) return null;
  const H = Float64Array.from(hs);
  const med = [...hs].sort((a, b) => a - b)[n >> 1];
  if (med < 1.8) return null; // nothing standing there in the survey (demolished, or built after it)

  const flat = robustFit(new Float64Array(n), H, true);
  type C = { rs: RoofFit; fit: Fit; dmax: number };
  const cands: C[] = [];
  let dmax = 0;
  for (const d of ds) dmax = Math.max(dmax, d);
  // the inner-most sample sits within a bin of the true skeleton peak
  const hipMax = Math.max(dmax, Math.min(B.W, dmax + 0.5));
  cands.push({ rs: 'hip', fit: robustFit(Float64Array.from(ds), H), dmax: hipMax });
  if (rect) {
    cands.push({ rs: 'gable', fit: robustFit(Float64Array.from(vs, (v) => B.W - Math.abs(v)), H), dmax: B.W });
    if (B.L < 2.2 * B.W) cands.push({ rs: 'gableX', fit: robustFit(Float64Array.from(us, (u) => B.L - Math.abs(u)), H), dmax: B.L });
  }
  // gable and hip differ only near the ends of a long roof: ties (within 6 %) go to the
  // mapped kind, else the simpler-looking gable.
  const tie = (c: C) => c.fit.rms * (c.rs === prior || (prior === 'gable' && c.rs === 'gableX') ? 0.94 : c.rs === 'gable' ? 0.97 : 1);
  cands.sort((a, b) => tie(a) - tie(b));
  const best = cands[0];
  const k = Math.min(best.fit.k, 1.7); // 60° — anything steeper is a tree, not a roof
  const rise = k * best.dmax;
  const pitched = rise >= 0.8 && best.fit.k >= 0.1 && best.fit.rms < flat.rms * 0.8;
  if (!pitched) {
    const q = flat.inl * Math.max(0, 1 - flat.rms / 1.5);
    return { h: flat.e, eav: flat.e, rs: 'flat', k: 0, rms: flat.rms, q, n };
  }
  const h = best.fit.e + rise;
  // gableX: the skeleton will put the ridge along the long axis over half-width W — keep
  // the measured ridge and pitch, which puts the eave at h − k·W (a truer silhouette than
  // squeezing the long-axis rise into W at double the pitch)
  const eav = best.rs === 'gableX' ? Math.max(best.fit.e, h - k * B.W) : best.fit.e;
  const rs: RoofFit = !rect && best.rs === 'hip' ? 'pitched' : best.rs;
  const q = best.fit.inl * Math.max(0, 1 - best.fit.rms / 1.5) * (best.fit.k > 1.7 ? 0.6 : 1);
  return { h, eav, rs, k, rms: best.fit.rms, q, n };
}
