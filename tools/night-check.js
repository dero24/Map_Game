// The night street, measured (reviewer round 10, must-fix 2: "night that reads as night"), in-page
// on a `?capture=1` page:
//   await import('/tools/night-check.js'); await __NIGHTCHECK__('tag'[, poses, opts])
// Each pose (default: the review's night street, frame 3 — shot 'ocean-night' at 22:00 — and Center
// Street at 22:00) is settled, then measured on the frame as painted (the paper margin left off):
//   lens   nothing within 2.5 m of the lens over 5% of the frame (tools/id-pass.js)
//   wires  a wire-only mask: the wires drawn alone, flat, against the world's depth; the frame with
//          and without them. Their mean L* where the sky is behind them ≤ the sky's L* + 2
//   dark   the bottom 40% outside the lamp hearts: L* ≤ 18, hue 200–290° or C* ≤ 6. A heart is where
//          the lamp field (the pools' own shape, 0–1, drawn per pixel from the lamp map the shaders
//          read) is ≥ 0.25
//   pools  every lamp ahead in a corridor round the view (25 m either side, 3–160 m out) whose heart
//          is in sight: its heart's mean luminance against the dark ground (field < 0.05) between it
//          and the next pool down the street. ≥ 2 pools at ≥ 2.5×
// Saves shots/nightcheck-<tag>.jpg (each pose as painted, and the same frame with what was measured drawn
// on it) and returns the numbers, with pass flags. opts: { settle, heart, gap }.
import { idPass, flatPass, lensVerdict } from './id-pass.js';
import { regionColour, nightDarkPasses, wiresVsSky, poolContrast, windowMean, flipRows, luminance } from './night-core.js';

await import('/tools/inpage-montage.js');

const frames = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
const grab = () => {
  const cv = document.querySelector('canvas'), W = cv.width, H = cv.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(cv, 0, 0);
  return { px: x.getImageData(0, 0, W, H).data, W, H };
};
const wireMeshes = (G) => {
  const out = [];
  G.scene.getObjectByName('world').traverse((o) => { if (o.isMesh && o.geometry?.attributes?.aOther) out.push(o); });
  return out;
};

/** The lamp field per pixel (R: the pools' shape 0–1, A: anything there) at W×H, rows from the top. */
async function lampField(G, W, H) {
  const T = G.THREE, S = await import('/src/render/shared.ts');
  // the shaders' own lamp code, fed the page's own uniforms (the module imported here is only its text)
  const expr = S.GLSL_SHARED.includes('lampField(') ? 'lampField(vWorldPos)' : 'lampAt(vWorldPos) / max(uLampPower, 1e-4)';
  const mat = (window.__NIGHTFIELD__ ??= new T.ShaderMaterial({
    uniforms: { ...G.U },
    vertexShader: S.GLSL_VERT_COMMON + `void main() { vec4 wp = worldMat() * vec4(position, 1.0); vWorldPos = wp.xyz + uWorldOffset; vNormalW = vec3(0.0, 1.0, 0.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: S.GLSL_SHARED + `void main() { gl_FragColor = vec4(clamp(${expr}, 0.0, 1.0), 0.0, 0.0, 1.0); }`,
    side: T.DoubleSide,
  }));
  return flipRows(flatPass(G, mat, W, H), W, H);
}

/** The wires alone, flat, against the world's depth: a mask (1 = wire) at W×H, rows from the top. */
function wireMask(G, W, H) {
  const T = G.THREE, wires = wireMeshes(G);
  if (!wires.length) return new Uint8Array(W * H);
  const depthOnly = (window.__DEPTHONLY__ ??= new T.MeshBasicMaterial({ colorWrite: false, side: T.DoubleSide }));
  const px = flatPass(G, depthOnly, W, H, (R, rt, world, hide) => {
    const keep = new Set();
    for (const w of wires) for (let p = w; p && p !== world; p = p.parent) keep.add(p);
    world.traverse((o) => { if (o !== world && !keep.has(o)) hide(o); });
    const mats = wires.map((w) => w.material);
    for (const w of wires) {
      const m = w.material.clone();
      m.uniforms = w.material.uniforms; // (the live viewport and fog, by reference)
      m.fragmentShader = 'void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }';
      m.transparent = false; m.depthWrite = false; m.blending = T.NoBlending;
      w.material = m;
    }
    R.setClearColor(0x000000, 0);
    R.clearColor();
    R.render(G.scene, G.camera);
    wires.forEach((w, i) => { w.material.dispose(); w.material = mats[i]; });
  });
  const f = flipRows(px, W, H), m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = f[i * 4] > 127 && f[i * 4 + 2] > 127 ? 1 : 0;
  return m;
}

/** Pools down the street: lamps ahead in a corridor round the view, nearest first. */
function pools(G, shot, field, opts) {
  const T = G.THREE, cam = G.camera, U = G.U, { W, H, px } = shot;
  const off = U.uWorldOffset.value, cp = new T.Vector3(), fw = new T.Vector3();
  cam.getWorldPosition(cp); cam.getWorldDirection(fw);
  const cx = cp.x + off.x, cz = cp.z + off.z, fl = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / fl, fz = fw.z / fl;
  const lamps = [];
  for (const pts of G.stream.lampPts?.values?.() ?? [])
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1], dx = x - cx, dz = z - cz, ahead = dx * fx + dz * fz, side = -dx * fz + dz * fx;
      if (ahead < 3 || ahead > 160 || Math.abs(side) > 25) continue;
      if (lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 2)) continue; // (a lamp two tiles both list)
      lamps.push({ x, z, ahead, side });
    }
  lamps.sort((a, b) => a.ahead - b.ahead);
  const v = new T.Vector3();
  const toScreen = (x, z) => {
    const y = G.world.terrain.heightAt(x, z);
    v.set(x - off.x, (Number.isFinite(y) ? y : 0) + 0.05 - off.y, z - off.z).project(cam);
    return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 ? [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H] : null;
  };
  const F = (i) => field[i * 4] / 255, there = (i) => field[i * 4 + 3] > 127;
  // each lamp's heart in sight: the pixels round its foot where the field is ≥ 0.5
  const seen = [];
  for (const l of lamps) {
    const s = toScreen(l.x, l.z);
    if (!s) continue;
    const rx = Math.max(3, Math.min(60, (4 * H) / l.ahead)), ry = Math.max(2, Math.min(40, (1.65 * H * 4) / (l.ahead * l.ahead) + 2));
    const heart = windowMean(px, W, H, s[0], s[1], rx, ry, (i) => there(i) && F(i) >= 0.5);
    if (heart.n < 2) continue;
    seen.push({ ...l, at: s.map(Math.round), heartY: heart.Y, heartN: heart.n, rx, ry });
  }
  // the gap down the street from each: the dark ground between its foot and the next one's (a lone
  // pool: the street 18 m short of it, on the way there)
  for (let k = 0; k < seen.length; k++) {
    const a = seen[k], t0 = (a.ahead - 18) / a.ahead;
    const b = seen[k + 1] ?? seen[k - 1] ?? (a.ahead > 20 ? { x: cx + (a.x - cx) * t0, z: cz + (a.z - cz) * t0 } : null);
    if (!b) { a.gapY = null; continue; }
    let n = 0, sY = 0;
    const marks = [];
    for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const s = toScreen(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!s) continue;
      marks.push(s.map(Math.round));
      const g = windowMean(px, W, H, s[0], s[1], 4, 2, (i) => there(i) && F(i) < opts.gap);
      if (g.n) (n += g.n), (sY += g.Y * g.n);
    }
    a.gapY = n ? sY / n : null;
    a.gapAt = marks;
  }
  return seen;
}

async function measure(G, label, opts, judge = ['lens', 'wires', 'dark', 'pools']) {
  const P = G.postParams, vig = P.vignette;
  P.vignette = 0; // (measured on the painting: the paper margin isn't the street)
  await frames(3);
  const A = grab();
  const wires = wireMeshes(G);
  for (const w of wires) w.visible = false;
  await frames(3);
  const B = grab();
  for (const w of wires) w.visible = true;
  P.vignette = vig;
  await frames(2);
  const { W, H } = A;
  const lens = idPass(G);
  const field = await lampField(G, W, H);
  const wm = wireMask(G, W, H);
  // the wires where the sky is behind them (nothing of the world drawn there)
  const skyWire = wm.map((m, i) => (m && field[i * 4 + 3] < 128 ? 1 : 0));
  const wire = wiresVsSky(A.px, B.px, skyWire);
  const y0 = Math.floor(H * 0.6);
  const F = (i) => field[i * 4] / 255, there = (i) => field[i * 4 + 3] > 127;
  const dark = regionColour(A.px, W, H, (i) => i >= y0 * W && there(i) && F(i) < opts.heart);
  const all40 = regionColour(A.px, W, H, (i) => i >= y0 * W);
  const hearts40 = regionColour(A.px, W, H, (i) => i >= y0 * W && there(i) && F(i) >= opts.heart);
  // (the same dark with the heart drawn tighter and looser: how much the verdict leans on where a
  // heart ends)
  const darkAt = {};
  for (const t of [0.1, 0.25, 0.5]) { const c = regionColour(A.px, W, H, (i) => i >= y0 * W && there(i) && F(i) < t); darkAt[t] = [c.L, c.C, c.h, nightDarkPasses(c).pass]; }
  const P2 = poolContrast(pools(G, A, field, opts).map((p) => ({ ...p })), { ratio: 2.5, need: 2 });
  const darkV = nightDarkPasses(dark);
  const lensWhy = lensVerdict(lens);
  const r = {
    label,
    at: [Math.round(G.walker.x), Math.round(G.walker.z), +G.walker.yaw.toFixed(2)],
    lens: { ...lens, pass: !lensWhy.length, why: lensWhy.join(', ') },
    wires: { ...wire, meshes: wires.length, maskPx: wm.reduce((s, m) => s + m, 0) },
    dark: { ...dark, pass: darkV.pass, why: darkV.why, heart: opts.heart, heartShare: +(hearts40.n / Math.max(1, all40.n)).toFixed(3), all: all40, hearts: hearts40, at: darkAt },
    pools: { good: P2.good, pass: P2.pass, list: P2.pools.map((p) => ({ ahead: Math.round(p.ahead), side: Math.round(p.side), at: p.at, heartL: +(116 * Math.cbrt(p.heartY) - 16).toFixed(1), gapL: p.gapY == null ? null : +(116 * Math.cbrt(Math.max(p.gapY, 0.0089)) - 16).toFixed(1), ratio: p.ratio })) },
  };
  // (a pose judges what applies to it: a street with one lamp in sight has no pools to count)
  r.judged = judge;
  r.pass = judge.every((k) => r[k].pass !== false);
  return { r, A, field, wm, plist: P2.pools };
}

/** The frame with what was measured drawn on it. */
function overlay(m) {
  const { A, field, wm, plist, r } = m, { W, H } = A;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(A.px), W, H);
  const d = img.data;
  for (let i = 0; i < W * H; i++) {
    const f = field[i * 4] / 255;
    if (wm[i]) { d[i * 4] = 255; d[i * 4 + 1] = 0; d[i * 4 + 2] = 255; continue; }
    if (field[i * 4 + 3] > 127 && f >= 0.25) { // hearts: lifted toward orange
      d[i * 4] = Math.min(255, d[i * 4] * 0.5 + 128); d[i * 4 + 1] = d[i * 4 + 1] * 0.5 + 40; d[i * 4 + 2] *= 0.4;
    }
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = '#7fffd4'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, H * 0.6); x.lineTo(W, H * 0.6); x.stroke();
  x.font = '13px monospace';
  for (const p of plist) {
    x.strokeStyle = p.ratio >= 2.5 ? '#ffe14d' : '#ff4d4d';
    x.strokeRect(p.at[0] - p.rx, p.at[1] - p.ry, p.rx * 2, p.ry * 2);
    x.fillStyle = x.strokeStyle;
    x.fillText(`${Number.isFinite(p.ratio) ? p.ratio : '∞'}×`, p.at[0] + p.rx + 3, p.at[1] + 4);
    x.fillStyle = '#4dd2ff';
    for (const g of p.gapAt ?? []) x.fillRect(g[0] - 2, g[1] - 1, 4, 3);
  }
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, W, 64);
  x.fillStyle = '#fff';
  const ok = (b) => (b ? 'ok' : 'FAIL');
  x.fillText(`lens ${ok(r.lens.pass)} near2.5 ${r.lens.near25}  wires ${r.wires.pass == null ? 'n/a' : ok(r.wires.pass)} ${r.wires.wireL} vs sky ${r.wires.skyL} (${r.wires.n} px)`, 8, 18);
  x.fillText(`dark ${ok(r.dark.pass)} L* ${r.dark.L} C* ${r.dark.C} h ${r.dark.h}°  (all ${r.dark.all.L}/${r.dark.all.C}/${r.dark.all.h}°, hearts ${Math.round(r.dark.heartShare * 100)}%)`, 8, 36);
  x.fillText(`pools ${ok(r.pools.pass)} ${r.pools.good} ≥ 2.5×: ${r.pools.list.map((p) => `${p.ahead}m ${p.heartL}/${p.gapL ?? '-'}`).join('  ')}`, 8, 54);
  return c;
}

// opts.variants: [{ name, apply(G) }] — each measured on every pose without re-posing it (a knob
// turned in the page, three frames to show it); the sheet then has one row per pose and variant.
window.__NIGHTCHECK__ = async (tag = 'n', poses = null, opts = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  opts = { settle: 12, heart: 0.25, gap: 0.05, ...opts };
  G.timeParams.speed = 0;
  poses ??= [
    { label: 'the night street (review 3: ocean-night, 22:00)', fn: () => { window.__APPLY_SHOT__('ocean-night'); G.setHour(22); } },
    // (Center Street's lamps hang every third pole, ~114 m apart: one is in sight, so its pools are
    // measured, not judged)
    { label: 'Center Street, 22:00', judge: ['lens', 'wires', 'dark'], fn: () => { G.walkParams.fly = false; G.walker.place(52, 257, 1.52, 0.0); G.setHour(22); } },
  ];
  const variants = opts.variants ?? [{ name: '', apply: () => {} }];
  const out = [], sheets = [];
  for (const p of poses) {
    await p.fn(G);
    G.timeParams.speed = 0;
    await frames(opts.settle);
    for (const v of variants) {
      await v.apply(G);
      if (variants.length > 1) await frames(3);
      const label = v.name ? `${p.label} [${v.name}]` : p.label;
      const m = await measure(G, label, opts, p.judge);
      out.push(m.r);
      console.log(`[night] ${JSON.stringify(m.r)}`);
      const a = document.createElement('canvas');
      a.width = m.A.W; a.height = m.A.H;
      a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.A.px), m.A.W, m.A.H), 0, 0);
      sheets.push([a, label], [overlay(m), `measured — ${m.r.pass ? 'PASS' : 'FAIL'}`]);
      if (opts.eachSave) await saveSheet(sheets, tag, opts); // (a long sweep keeps what it has so far)
    }
  }
  await saveSheet(sheets, tag, opts);
  return { tag, sheet: `shots/nightcheck-${tag}.jpg`, pass: out.every((r) => r.pass), poses: out };
};

async function saveSheet(sheets, tag, opts) {
  // the sheet: each pose as painted, then measured
  const CW = opts.cw ?? 560, CH = Math.round((CW * sheets[0][0].height) / sheets[0][0].width), PAD = 22, cols = 2;
  const sh = document.createElement('canvas');
  sh.width = cols * CW; sh.height = Math.ceil(sheets.length / cols) * (CH + PAD);
  const sx = sh.getContext('2d');
  sx.fillStyle = '#f5efe1'; sx.fillRect(0, 0, sh.width, sh.height);
  sx.font = '14px Georgia, serif'; sx.fillStyle = '#3a3346';
  sheets.forEach(([cv, label], i) => {
    const x = (i % cols) * CW, y = Math.floor(i / cols) * (CH + PAD);
    sx.drawImage(cv, x, y, CW, CH);
    sx.fillText(label, x + 8, y + CH + 16);
  });
  const blob = await new Promise((r) => sh.toBlob(r, 'image/jpeg', 0.85));
  await fetch(`/__shot?name=${encodeURIComponent(`nightcheck-${tag}.jpg`)}`, { method: 'POST', body: blob });
}
