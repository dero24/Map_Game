// The night check's pure parts (tools/night-check.js; tests/nightCheck.test.ts): colour science on
// 8-bit sRGB frames and the reviewer's round-10 night tests, kept free of the page so Node can test
// them. A frame is RGBA bytes, row 0 at the TOP (as a 2D canvas reads it), w × h.

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LIN = new Float64Array(256).map((_, i) => lin(i));

/** Relative luminance Y (0–1) of an 8-bit sRGB colour. */
export function luminance(r, g, b) {
  return 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
}

/** CIELab (D65) of an 8-bit sRGB colour: [L*, a*, b*]. */
export function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** L* of a relative luminance. */
export const lstar = (Y) => (Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y);

/** Chroma and hue (degrees, 0–360) of a*, b*. */
export function lch(a, b) {
  return { C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** The colour of a region: mean L*, the chroma and hue of the mean a* and b* (how a wash reads as a
 *  whole), the 90th-percentile L* and how many pixels it had. keep(i) picks pixel i (row-major). */
export function regionColour(px, w, h, keep) {
  let n = 0, sL = 0, sa = 0, sb = 0;
  const Ls = [];
  for (let i = 0, N = w * h; i < N; i++) {
    if (!keep(i)) continue;
    const [L, a, b] = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    n++; sL += L; sa += a; sb += b; Ls.push(L);
  }
  if (!n) return { n: 0, L: null, C: null, h: null, L90: null };
  Ls.sort((x, y) => x - y);
  const { C, h: hue } = lch(sa / n, sb / n);
  return { n, L: +(sL / n).toFixed(1), C: +C.toFixed(1), h: Math.round(hue), L90: +Ls[Math.floor(0.9 * (n - 1))].toFixed(1) };
}

/** The reviewer's night dark (round 10): L* ≤ 18, and cool (hue 200–290°) or near grey (C* ≤ 6). */
export function nightDarkPasses(c, { maxL = 18, hue = [200, 290], maxC = 6 } = {}) {
  if (!c || !c.n) return { pass: false, why: 'no pixels' };
  const why = [];
  if (c.L > maxL) why.push(`L* ${c.L} > ${maxL}`);
  if (!(c.C <= maxC || (c.h >= hue[0] && c.h <= hue[1]))) why.push(`hue ${c.h}° at C* ${c.C}`);
  return { pass: !why.length, why: why.join(', ') };
}

/** Wires against the sky: per wire pixel (mask[i]), L* with the wires drawn vs hidden (the sky
 *  behind them). The bar: the wires' mean L* ≤ the sky's + 2. */
export function wiresVsSky(shown, hidden, mask, { tol = 2 } = {}) {
  let n = 0, sS = 0, sH = 0, over = 0;
  const d = [];
  for (let i = 0, N = mask.length; i < N; i++) {
    if (!mask[i]) continue;
    const Ls = lstar(luminance(shown[i * 4], shown[i * 4 + 1], shown[i * 4 + 2]));
    const Lh = lstar(luminance(hidden[i * 4], hidden[i * 4 + 1], hidden[i * 4 + 2]));
    n++; sS += Ls; sH += Lh; d.push(Ls - Lh);
    if (Ls > Lh + tol) over++;
  }
  if (!n) return { n: 0, wireL: null, skyL: null, delta: null, d95: null, over: 0, pass: null };
  d.sort((x, y) => x - y);
  const wireL = sS / n, skyL = sH / n;
  return { n, wireL: +wireL.toFixed(1), skyL: +skyL.toFixed(1), delta: +(wireL - skyL).toFixed(2), d95: +d[Math.floor(0.95 * (n - 1))].toFixed(1), over: +(over / n).toFixed(3), pass: wireL <= skyL + tol };
}

/** Lamp pools down the street, heart against gap. pools: each { heartY, gapY } (mean relative
 *  luminance of the pool's heart and of the dark ground between it and the next pool down the
 *  street; null: no dark ground there at all — the pools run together), nearest first. A pool
 *  counts when heart ≥ ratio × gap. */
export function poolContrast(pools, { ratio = 2.5, need = 2 } = {}) {
  const rows = pools.map((p) => ({ ...p, ratio: p.gapY == null ? 0 : p.gapY > 0 ? +(p.heartY / p.gapY).toFixed(2) : p.heartY > 0 ? Infinity : 0 }));
  const good = rows.filter((p) => p.ratio >= ratio).length;
  return { pools: rows, good, pass: good >= need };
}

/** A pixel's 8-bit sRGB → { Y, L, a, b }: for a mean over a window. */
export function windowMean(px, w, h, cx, cy, rx, ry, keep = () => true) {
  let n = 0, sY = 0;
  for (let y = Math.max(0, Math.round(cy - ry)); y <= Math.min(h - 1, Math.round(cy + ry)); y++)
    for (let x = Math.max(0, Math.round(cx - rx)); x <= Math.min(w - 1, Math.round(cx + rx)); x++) {
      const i = y * w + x;
      if (!keep(i)) continue;
      n++; sY += luminance(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    }
  return n ? { n, Y: sY / n } : { n: 0, Y: null };
}

/** Flip a WebGL read-back (row 0 at the bottom) to the canvas order (row 0 at the top). */
export function flipRows(px, w, h) {
  const out = new Uint8Array(px.length), row = w * 4;
  for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return out;
}
