// The brush's readability check (reviewer round 9, must-fix 1), in-page on a `?capture=1` URL with
// the brush out and a sketch showing:
//   await import('/tools/brush-check.js'); await __BRUSHCHECK__()
// It measures, on the frame itself: how much of the frame the sketch covers, how much of it is
// hidden behind something (post.ts draws a mask when U.uGhost.w is set: red = sketch, green =
// hidden), then paints it in and measures the colour change sketch → dry over the sketch's own
// pixels (mean ΔE, CIE76 and CIEDE2000, sRGB → Lab D65). The bar: the boat ≥ 2 % of the frame,
// ΔE ≥ 25, the sketch ≥ 70 % visible in every brush frame (sampled through the wash).
const W = 480; // the frame is read at this width (plenty for means over thousands of pixels)
const frames = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
function grab() {
  const cv = document.querySelector('canvas');
  const h = Math.round((W * cv.height) / cv.width);
  const c = document.createElement('canvas');
  c.width = W; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(cv, 0, 0, W, h);
  return x.getImageData(0, 0, W, h).data;
}
async function mask() {
  const U = window.__GAME__.U;
  U.uGhost.value.w = 1;
  await frames(2);
  const d = grab();
  U.uGhost.value.w = 0;
  await frames(2);
  const m = new Uint8Array(d.length / 4);
  let here = 0, hid = 0;
  for (let i = 0; i < m.length; i++) {
    if (d[i * 4] > 127) { m[i] = d[i * 4 + 1] > 127 ? 2 : 1; here++; if (m[i] === 2) hid++; }
  }
  return { m, here, hid, visible: here ? 1 - hid / here : 0, frac: here / m.length };
}
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function de2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { const t = Math.atan2(b, a) / rad; return t < 0 ? t + 360 : t; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2), dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1;
  if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2), Lm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2) : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
function meanDE(A, C, m) {
  let n = 0, e76 = 0, e00 = 0;
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== 1) continue; // the sketch's visible pixels
    const p = lab(A[i * 4], A[i * 4 + 1], A[i * 4 + 2]), q = lab(C[i * 4], C[i * 4 + 1], C[i * 4 + 2]);
    e76 += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    e00 += de2000(p, q);
    n++;
  }
  return { n, e76: n ? +(e76 / n).toFixed(1) : 0, e00: n ? +(e00 / n).toFixed(1) : 0 };
}

window.__BRUSHCHECK__ = async (opts = {}) => {
  const B = window.__BRUSH__;
  if (!B.state().spot) return { error: 'no sketch showing (open the brush and aim at a fitting spot first)' };
  await frames(opts.settle ?? 20);
  const m0 = await mask();
  const A = grab();
  // paint it in, sampling the sketch's visibility through the wash
  if (!B.paint()) return { error: 'the brush would not start the wash' };
  const during = [];
  for (let k = 0; k < 6 && B.state().washing; k++) { await frames(8); if (B.state().washing) during.push(+(await mask()).visible.toFixed(3)); }
  while (B.state().active) await frames(4);
  await frames(opts.dry ?? 40);
  const C = grab();
  const de = meanDE(A, C, m0.m);
  const worst = Math.min(m0.visible, ...during);
  return {
    frame: +(m0.frac * 100).toFixed(2) + '%', visibleAtSketch: +m0.visible.toFixed(3), visibleDuringWash: during, worstVisible: +worst.toFixed(3),
    dE76: de.e76, dE2000: de.e00, pixels: de.n,
    pass: { frame: m0.frac >= 0.02, dE: de.e76 >= 25, visible: worst >= 0.7 },
  };
};
