// Road grading: the ground a street runs on, conditioned the way a road engineer would. The DEM
// (Terrarium z14, 7–10 m) smears a bluff or a retaining wall into a slope and draped streets
// inherit it — a car on a 50% "ski slope" beside Pike Place Market, where the real street is a
// terrace. Each drivable way gets a smoothed longitudinal profile (a longer average where the
// short one is still too steep for its class, unless the map tags an `incline`), the ways meeting
// at a node agree on its height, and the ground under each street and its sidewalks is cut or
// filled to that profile, blending back to the natural ground over a shoulder as wide as the cut
// is deep. Everything is local (kernels ≤ 80 m along a way; a cell's DEM grid overhangs it by
// 96 m and a tile carries every way that touches it whole), so two cells grade a street that
// crosses their seam identically.

import type { Road } from './data';

type P2 = [number, number];

/** Steepest grade a way of each class is built to (a tagged `incline` overrides). */
export const GRADE_MAX: Record<string, number> = {
  motorway: 0.06, motorway_link: 0.08, trunk: 0.07, trunk_link: 0.09, primary: 0.1, primary_link: 0.12,
  secondary: 0.14, secondary_link: 0.14, tertiary: 0.16, tertiary_link: 0.16,
  residential: 0.25, unclassified: 0.25, living_street: 0.25, service: 0.25,
};

/** The grade no stretch of a way may pass, whatever the DEM says (a tagged `incline` + 5 points
 *  overrides): past this a car climbs a wall. The class's GRADE_MAX is where smoothing starts. */
export const GRADE_HARD: Record<string, number> = {
  motorway: 0.08, motorway_link: 0.1, trunk: 0.1, trunk_link: 0.12, primary: 0.15, primary_link: 0.16,
  secondary: 0.21, secondary_link: 0.21, tertiary: 0.21, tertiary_link: 0.21,
  residential: 0.24, unclassified: 0.24, living_street: 0.24, service: 0.24,
};

/** A height grid in metres; node (i, j) sits at (x0 + (i + ½)·pitch, z0 + (j + ½)·pitch). */
export interface GradeGrid { x0: number; z0: number; pitch: number; nx: number; nz: number; heights: Float32Array }
/** `walls`: retaining walls where a street is cut into the hill, flat, 8 numbers a panel —
 *  x0, z0, x1, z1 (the foot line at the back of the sidewalk; the street lies toward
 *  (−(z1−z0), x1−x0), the direction turned a quarter left), then the foot and top heights at
 *  each end. */
export interface GradeReport { ways: number; nodes: number; maxShift: number; walls: number[] }
export interface GradeOpts {
  /** build retaining walls (detail builds) */
  walls?: boolean;
  /** ground a wall may not stand on (a building's footprint: its own wall is the wall) */
  blocked?: (x: number, z: number) => boolean;
}

const STEP = 4; // m between profile samples

export function gradeRoads(g: GradeGrid, roads: Road[], incline: (r: Road) => number | null = () => null, opts: GradeOpts = {}): GradeReport {
  const H0 = g.heights.slice();
  const X1 = g.x0 + g.nx * g.pitch, Z1 = g.z0 + g.nz * g.pitch;
  const h0 = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(g.nx - 1.001, (x - g.x0) / g.pitch - 0.5));
    const fz = Math.max(0, Math.min(g.nz - 1.001, (z - g.z0) / g.pitch - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * g.nx + i;
    return (H0[k] * (1 - u) + H0[k + 1] * u) * (1 - v) + (H0[k + g.nx] * (1 - u) + H0[k + g.nx + 1] * u) * v;
  };
  const inGrid = (x: number, z: number, m: number) => x > g.x0 - m && x < X1 + m && z > g.z0 - m && z < Z1 + m;
  const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

  // the drivable ways (no bridges — decks carry them — no tunnels)
  const ways: { r: Road; p: P2[]; gmax: number; hard: number }[] = [];
  for (const r of roads) {
    const gm = GRADE_MAX[r.c];
    if (gm === undefined || r.br || r.tu || r.lod) continue;
    const p: P2[] = [];
    for (let i = 0; i + 1 < r.p.length; i += 2) p.push([r.p[i] / 10, r.p[i + 1] / 10]);
    if (p.length < 2 || !p.some(([x, z]) => inGrid(x, z, 120))) continue;
    const t = incline(r);
    ways.push({ r, p, gmax: t !== null ? Math.max(gm, t + 0.03) : gm, hard: t !== null ? Math.max(0.25, t + 0.05) : GRADE_HARD[r.c] });
  }
  // nodes two or more ways share: they agree on one height, the mean ground round the node
  const count = new Map<string, { n: number; x: number; z: number; hw: number }>();
  for (const w of ways) {
    const seen = new Set<string>();
    for (const [x, z] of w.p) {
      const k = key(x, z);
      if (seen.has(k)) continue;
      seen.add(k);
      const c = count.get(k);
      if (c) (c.n++, (c.hw = Math.max(c.hw, w.r.w / 2)));
      else count.set(k, { n: 1, x, z, hw: w.r.w / 2 });
    }
  }
  const plateau0 = new Map<string, number>();
  for (const [k, c] of count) {
    if (c.n < 2 || !inGrid(c.x, c.z, 100)) continue;
    const rj = Math.min(12, c.hw + 2);
    let s = h0(c.x, c.z), n = 1;
    for (let a = 0; a < 8; a++) (s += h0(c.x + Math.cos(a * 0.785) * rj, c.z + Math.sin(a * 0.785) * rj)), n++;
    plateau0.set(k, s / n);
  }
  // Junctions a short block apart that the DEM puts further apart in height than the block can
  // climb (a bluff smeared between Post Alley and Western Ave: 9 m in 20 m) meet each other
  // halfway — one step, partners within 50 m along a way, so the answer stays local (both
  // junctions sit inside every tile's grid that can see them) and a seam grades the same twice.
  const moves = new Map<string, number[]>();
  for (const w of ways) {
    let prev: { k: string; s: number } | null = null, cum = 0;
    for (let i = 0; i < w.p.length; i++) {
      if (i) cum += Math.hypot(w.p[i][0] - w.p[i - 1][0], w.p[i][1] - w.p[i - 1][1]);
      const k = key(w.p[i][0], w.p[i][1]);
      if (!plateau0.has(k)) continue;
      if (prev && prev.k !== k && cum - prev.s <= 50) {
        // (the climb happens between the crossings' flat bands — each a cross street's corridor wide)
        const band = (q: string) => (count.get(q)?.hw ?? 0) + 2.5;
        const run = Math.max(2, cum - prev.s - band(prev.k) - band(k));
        const a = plateau0.get(prev.k)!, b = plateau0.get(k)!, lim = w.hard * 0.9 * run, ex = Math.abs(b - a) - lim;
        if (ex > 0) {
          const d = (Math.sign(b - a) * ex) / 2;
          (moves.get(prev.k) ?? moves.set(prev.k, []).get(prev.k)!).push(d);
          (moves.get(k) ?? moves.set(k, []).get(k)!).push(-d);
        }
      }
      prev = { k, s: cum };
    }
  }
  const plateau = new Map<string, number>();
  for (const [k, v] of plateau0) {
    const m = moves.get(k);
    plateau.set(k, m ? v + m.reduce((a, b) => a + b, 0) / m.length : v);
  }
  // box filter (two passes make it a triangle) over a sample array
  const box = (z: Float64Array, R: number) => {
    const n = z.length, out = new Float64Array(n), c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + z[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - R), b = Math.min(n - 1, i + R); out[i] = (c[b + 1] - c[a]) / (b - a + 1); }
    return out;
  };

  // every mapped way but the sidewalks (a path, a flight of steps, a driveway leaving the street is
  // a gap in a retaining wall), in 24 m buckets
  const segs = new Map<string, { r: Road; ax: number; az: number; bx: number; bz: number }[]>();
  if (opts.walls)
    for (const r of roads) {
      if (r.sw || r.tu) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
        for (let u = Math.floor(Math.min(ax, bx) / 24); u <= Math.floor(Math.max(ax, bx) / 24); u++)
          for (let v = Math.floor(Math.min(az, bz) / 24); v <= Math.floor(Math.max(az, bz) / 24); v++)
            (segs.get(u + ',' + v) ?? segs.set(u + ',' + v, []).get(u + ',' + v)!).push({ r, ax, az, bx, bz });
      }
    }
  const nearOther = (x: number, z: number, self: Road) => {
    for (const q of segs.get(Math.floor(x / 24) + ',' + Math.floor(z / 24)) ?? []) {
      if (q.r === self) continue;
      const dx = q.bx - q.ax, dz = q.bz - q.az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - q.ax) * dx + (z - q.az) * dz) / l2));
      if (Math.hypot(q.ax + dx * t - x, q.az + dz * t - z) < q.r.w / 2 + 1.5) return true;
    }
    return false;
  };
  const walls: number[] = [];
  const acc = new Float64Array(g.nx * g.nz), wsum = new Float64Array(g.nx * g.nz), wmax = new Float32Array(g.nx * g.nz);
  // per way, each node takes the target at its nearest point on the way (one answer a way, not
  // an average of every 4 m piece within reach — that smeared the profile's knees past its limit)
  const bestD = new Float32Array(g.nx * g.nz).fill(Infinity), bestT = new Float32Array(g.nx * g.nz);
  const touched: number[] = [];
  for (const w of ways) {
    // resample along the way every STEP m
    const cum = [0];
    for (let i = 1; i < w.p.length; i++) cum.push(cum[i - 1] + Math.hypot(w.p[i][0] - w.p[i - 1][0], w.p[i][1] - w.p[i - 1][1]));
    const L = cum[cum.length - 1];
    if (L < 2) continue;
    const n = Math.max(2, Math.ceil(L / STEP) + 1);
    const xs = new Float64Array(n), zs = new Float64Array(n), ss = new Float64Array(n), raw = new Float64Array(n);
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * L;
      while (seg < w.p.length - 2 && cum[seg + 1] < s) seg++;
      const t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      xs[k] = w.p[seg][0] + (w.p[seg + 1][0] - w.p[seg][0]) * t;
      zs[k] = w.p[seg][1] + (w.p[seg + 1][1] - w.p[seg][1]) * t;
      ss[k] = s;
      raw[k] = h0(xs[k], zs[k]);
    }
    const ds = L / (n - 1);
    const rs = Math.max(1, Math.round(12 / ds)), rb = Math.max(1, Math.round(44 / ds));
    // the filters see the ground carrying on past each end (the next street, or the hill a dead
    // end climbs into) — a window cut short at an end would pull an honest hill's end level
    const pad = 2 * rb, m = n + 2 * pad, ext = new Float64Array(m);
    const e0x = xs[0] - xs[1], e0z = zs[0] - zs[1], e0 = Math.hypot(e0x, e0z) || 1;
    const e1x = xs[n - 1] - xs[n - 2], e1z = zs[n - 1] - zs[n - 2], e1 = Math.hypot(e1x, e1z) || 1;
    for (let q = 0; q < pad; q++) {
      const d = (pad - q) * ds;
      ext[q] = h0(xs[0] + (e0x / e0) * d, zs[0] + (e0z / e0) * d);
      ext[m - 1 - q] = h0(xs[n - 1] + (e1x / e1) * d, zs[n - 1] + (e1z / e1) * d);
    }
    ext.set(raw, pad);
    const smallE = box(box(ext, rs), rs), bigE = box(box(ext, rb), rb);
    // where the short average is still too steep for the class, the long one takes over —
    // eased along the way over the long window, so the hand-over is itself no step
    const want = new Float64Array(m);
    for (let q = 1; q + 1 < m; q++) {
      const gr = Math.abs(smallE[q + 1] - smallE[q - 1]) / (2 * ds);
      const t = Math.max(0, Math.min(1, (gr - 0.8 * w.gmax) / (0.4 * w.gmax)));
      want[q] = t * t * (3 - 2 * t);
    }
    // (a max-then-average: a steep stretch hands over fully, and its neighbours ease into it)
    const wide = new Float64Array(m);
    for (let q = 0; q < m; q++) { let mx = 0; for (let r = Math.max(0, q - rb); r <= Math.min(m - 1, q + rb); r++) mx = Math.max(mx, want[r]); wide[q] = mx; }
    const blend = box(box(wide, rb), rb);
    const z = new Float64Array(n);
    for (let k = 0; k < n; k++) z[k] = smallE[k + pad] + (bigE[k + pad] - smallE[k + pad]) * Math.min(1, blend[k + pad]);
    // meet each shared node at its agreed height, easing in over 20 m
    const pins = new Map<number, number>();
    for (let i = 0; i < w.p.length; i++) {
      const ph = plateau.get(key(w.p[i][0], w.p[i][1]));
      if (ph === undefined) continue;
      for (let k = 0; k < n; k++) {
        const d = Math.abs(ss[k] - cum[i]);
        if (d >= 20) continue;
        const t = 1 - d / 20;
        z[k] += (ph - z[k]) * t * t * (3 - 2 * t);
      }
      pins.set(Math.max(0, Math.min(n - 1, Math.round(cum[i] / ds))), ph);
    }
    // …and nowhere steeper than a car can climb: between its junctions (pinned) the profile keeps
    // inside the cone each junction allows (where two pins ask more than the way can give, the
    // even grade between them), then a forward and a backward pass hold every 4 m step to it
    const G = w.hard, pk = [...pins.keys()].sort((a, b) => a - b);
    for (const [k, v] of pins) z[k] = v;
    if (pk.length) {
      for (let k = 0; k < n; k++) {
        if (pins.has(k)) continue;
        let lo = -Infinity, hi = Infinity;
        for (const q of pk) { const dz = G * Math.abs(ss[k] - ss[q]), v = pins.get(q)!; lo = Math.max(lo, v - dz); hi = Math.min(hi, v + dz); }
        if (lo <= hi) z[k] = Math.max(lo, Math.min(hi, z[k]));
        else {
          // bracketing pins: the even grade between them
          let a = pk[0], b = pk[pk.length - 1];
          for (const q of pk) { if (q < k) a = q; if (q > k) { b = q; break; } }
          const va = pins.get(a)!, vb = pins.get(b)!;
          z[k] = a === b ? va : va + ((vb - va) * (ss[k] - ss[a])) / (ss[b] - ss[a]);
        }
      }
    }
    for (let it = 0; it < 3; it++) {
      for (let k = 1; k < n; k++) if (!pins.has(k)) z[k] = Math.max(z[k - 1] - G * ds, Math.min(z[k - 1] + G * ds, z[k]));
      for (let k = n - 2; k >= 0; k--) if (!pins.has(k)) z[k] = Math.max(z[k + 1] - G * ds, Math.min(z[k + 1] + G * ds, z[k]));
    }
    // the street and its sidewalks at the profile, shoulders easing back to the natural ground
    // (past the way's own ends the next street, or nothing, decides — no round cap)
    const hw = w.r.w / 2 + 2.5;
    // Retaining walls: where the street is cut into the hill more than 0.6 m, a wall at the back of
    // the sidewalk holds the hill up (Seattle's concrete and rockery walls) — not across a crossing
    // street, a path or a driveway, not where a building stands (its own wall is the wall).
    if (opts.walls && n >= 2) {
      const band: number[] = [];
      for (let i = 0; i < w.p.length; i++) { const c = count.get(key(w.p[i][0], w.p[i][1])); if (c && c.n > 1) band.push(cum[i], c.hw + 3); }
      for (const side of [-1, 1]) {
        let run: number[] | null = null;
        // (each panel wound so the street lies to its left: its face turned to the sidewalk)
        const flush = () => {
          if (run && run.length >= 8)
            for (let q = 0; q + 7 < run.length; q += 4)
              if (side < 0) walls.push(run[q], run[q + 1], run[q + 4], run[q + 5], run[q + 2], run[q + 3], run[q + 6], run[q + 7]);
              else walls.push(run[q + 4], run[q + 5], run[q], run[q + 1], run[q + 6], run[q + 7], run[q + 2], run[q + 3]);
          run = null;
        };
        for (let k = 0; k < n; k++) {
          const kk = Math.min(n - 2, k), dx = xs[kk + 1] - xs[kk], dz = zs[kk + 1] - zs[kk], l = Math.hypot(dx, dz) || 1;
          const nx = (-dz / l) * side, nz = (dx / l) * side;
          const ex = xs[k] + nx * hw, ez = zs[k] + nz * hw;
          let ok = inGrid(ex, ez, 0) && !band.some((c, q) => q % 2 === 0 && Math.abs(ss[k] - c) < band[q + 1]);
          const top = ok ? Math.max(h0(ex + nx * 2, ez + nz * 2), h0(ex + nx * 4, ez + nz * 4)) : 0;
          if (ok && (top - z[k] <= 0.6 || nearOther(ex, ez, w.r) || opts.blocked?.(ex, ez))) ok = false;
          if (!ok) { flush(); continue; }
          (run ??= []).push(ex, ez, z[k] - 0.3, Math.min(z[k] + 7, top + 0.2));
        }
        flush();
      }
    }
    // (a junction end is capped round — the crossing is one plateau however short the next way;
    // a dead end is not: the hill it runs into keeps its ground)
    const cap0 = plateau.has(key(w.p[0][0], w.p[0][1])), cap1 = plateau.has(key(w.p[w.p.length - 1][0], w.p[w.p.length - 1][1]));
    const beyond = (x: number, zz: number) => (!cap0 && (x - xs[0]) * (xs[0] - xs[1]) + (zz - zs[0]) * (zs[0] - zs[1]) > 0) || (!cap1 && (x - xs[n - 1]) * (xs[n - 1] - xs[n - 2]) + (zz - zs[n - 1]) * (zs[n - 1] - zs[n - 2]) > 0);
    for (let k = 0; k + 1 < n; k++) {
      const ax = xs[k], az = zs[k], bx = xs[k + 1], bz = zs[k + 1];
      if (!inGrid((ax + bx) / 2, (az + bz) / 2, hw + 14)) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const R = hw + 12;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - g.x0) / g.pitch - 0.5)), i1 = Math.min(g.nx - 1, Math.ceil((Math.max(ax, bx) + R - g.x0) / g.pitch - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - g.z0) / g.pitch - 0.5)), j1 = Math.min(g.nz - 1, Math.ceil((Math.max(az, bz) + R - g.z0) / g.pitch - 0.5));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = g.x0 + (i + 0.5) * g.pitch, zz = g.z0 + (j + 0.5) * g.pitch;
          if (beyond(x, zz)) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (zz - az) * dz) / l2));
          const d = Math.hypot(ax + dx * t - x, az + dz * t - zz);
          if (d > R) continue;
          const kk = j * g.nx + i;
          if (d >= bestD[kk]) continue;
          if (bestD[kk] === Infinity) touched.push(kk);
          bestD[kk] = d;
          bestT[kk] = z[k] + (z[k + 1] - z[k]) * t;
        }
    }
    for (const kk of touched) {
      const d = bestD[kk], target = bestT[kk], nat = H0[kk];
      bestD[kk] = Infinity;
      const S = Math.max(2, Math.min(12, 1.5 * Math.abs(target - nat)));
      let wt = 1;
      if (d > hw) {
        if (d >= hw + S) continue;
        const q = 1 - (d - hw) / S;
        wt = q * q * (3 - 2 * q);
      }
      // (cubed: a street's own corridor outranks a neighbour's shoulder — an alley a storey
      // below no longer drags the avenue's kerb down with it)
      const w3 = wt * wt * wt;
      acc[kk] += w3 * target;
      wsum[kk] += w3;
      if (wt > wmax[kk]) wmax[kk] = wt;
    }
    touched.length = 0;
  }
  let nodes = 0, maxShift = 0;
  for (let k = 0; k < acc.length; k++) {
    if (!wsum[k]) continue;
    const h = H0[k] + (acc[k] / wsum[k] - H0[k]) * wmax[k];
    maxShift = Math.max(maxShift, Math.abs(h - H0[k]));
    g.heights[k] = h;
    nodes++;
  }
  return { ways: ways.length, nodes, maxShift, walls };
}

/** A way's tagged incline as a fraction (`incline=15%`, `incline=-8.5 %`), else null (up/down: null). */
export function inclineOf(tag: string | undefined): number | null {
  const m = /^\s*-?(\d+(?:\.\d+)?)\s*%\s*$/.exec(tag ?? '');
  return m ? +m[1] / 100 : null;
}
