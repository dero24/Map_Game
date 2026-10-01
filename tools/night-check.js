// The night street, measured (reviewer round 10, "night that reads as night", and round 11, "pools
// as light, not stage discs"), in-page on a `?capture=1` page:
//   await import('/tools/night-check.js'); await __NIGHTCHECK__('tag'[, poses, opts])
// poses: an array of pose keys (POSES below) or pose objects. The default is the review's two night
// frames: 3, its night street (shot 'ocean-night' at 22:00), and 13, its streamed street at night
// (Long Branch at 21:30: streamed tiles, or whatever stands in for them where no tile service is
// reachable). Each is settled, then measured on the frame as painted (the paper margin left off):
//   lens     nothing within 2.5 m of the lens over 5% of the frame (tools/id-pass.js)
//   wires    a wire-only mask: the wires drawn alone, flat, against the world's depth; the frame with
//            and without them. Their mean L* where the sky is behind them ≤ the sky's L* + 2
//   band     the bottom 40% of the frame: C* ≤ 22 (no orange carpet where you stand in a pool)
//   heart    the ground in the pools' hearts (the lamp field ≥ 0.6: within ~5 m of a lamp's foot):
//            a warm cream, C* ≤ 30
//   gap      the ground past the pools' reach (field ≤ 0.02) in the lower half of the frame: lit by
//            the night's floor, L* 10–20 and hue 220–280°
//   falloff  the nearest pool ahead, along the line from its heart toward you: its own light (over
//            the floor) halves no nearer than 5 m from the heart and is still ≥ 8% of it at 12 m
//   pools    every lamp ahead in a corridor round the view (25 m either side, 3–160 m out) whose
//            heart is in sight: its heart's mean luminance against the ground between it and the
//            next pool down the street. ≥ 2 pools at ≥ 2.5×
// The lamp field is the pools' own light per pixel (0–1 of a lone heart), drawn by the shaders' own
// lamp code from the lamp map they read; the ground is what faces up within a metre of the street.
// Each pose judges what applies to it (round 11: frame 3 its band, pools, wires and lens; frame 13
// its heart, gap, fall-off, wires and lens); everything is measured and reported for every pose.
// Saves shots/nightcheck-<tag>.jpg (each pose as painted, and the same frame with what was measured
// drawn on it), each pose's frame as shots/nightcheck-<tag>-<key>.png (opts.png), and returns the
// numbers with pass flags. opts: { settle, heart, gap, png }.
import { idPass, flatPass, lensVerdict } from './id-pass.js';
import { regionColour, nightDarkPasses, nightGapPasses, chromaPasses, poolFalloff, wiresVsSky, poolContrast, windowMean, flipRows, lstar, luminance } from './night-core.js';

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

/** Per pixel at W×H, rows from the top: R the lamp field (the pools' own light, 0–1 of a heart), G how
 *  squarely the surface faces up (|n.y|), B its height over the street (−4…+4 m → 0–1), A anything
 *  there. */
async function lampField(G, W, H) {
  const T = G.THREE, S = await import('/src/render/shared.ts');
  // the shaders' own lamp code, fed the page's own uniforms (the module imported here is only its text)
  const expr = S.GLSL_SHARED.includes('lampField(') ? 'lampField(vWorldPos)' : 'lampAt(vWorldPos) / max(uLampPower, 1e-4)';
  const mat = (window.__NIGHTFIELD__ ??= new T.ShaderMaterial({
    uniforms: { ...G.U },
    vertexShader: S.GLSL_VERT_COMMON + `void main() { vec4 wp = worldMat() * vec4(position, 1.0); vWorldPos = wp.xyz + uWorldOffset; vNormalW = vec3(0.0, 1.0, 0.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: S.GLSL_SHARED + `void main() {
      vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
      gl_FragColor = vec4(clamp(${expr}, 0.0, 1.0), abs(n.y), clamp((vWorldPos.y - uLampBaseY + 4.0) / 8.0, 0.0, 1.0), 1.0);
    }`,
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

/** The view's frame of reference: the camera's foot in region metres, the way it looks (flat), and
 *  a projector from the ground at (x, z) to the frame's pixels (null: behind, or off the frame). */
function viewOf(G, W, H) {
  const T = G.THREE, cam = G.camera, off = G.U.uWorldOffset.value, cp = new T.Vector3(), fw = new T.Vector3(), v = new T.Vector3();
  cam.getWorldPosition(cp); cam.getWorldDirection(fw);
  const fl = Math.hypot(fw.x, fw.z) || 1;
  const toScreen = (x, z) => {
    const y = G.world.terrain.heightAt(x, z);
    v.set(x - off.x, (Number.isFinite(y) ? y : 0) + 0.05 - off.y, z - off.z).project(cam);
    return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 ? [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H] : null;
  };
  return { cx: cp.x + off.x, cz: cp.z + off.z, fx: fw.x / fl, fz: fw.z / fl, toScreen };
}

/** The lamps ahead in a corridor round the view (25 m either side, 3–160 m out), nearest first. */
function lampsAhead(G, view) {
  const { cx, cz, fx, fz } = view, lamps = [];
  for (const pts of G.stream.lampPts?.values?.() ?? [])
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1], dx = x - cx, dz = z - cz, ahead = dx * fx + dz * fz, side = -dx * fz + dz * fx;
      if (ahead < 3 || ahead > 160 || Math.abs(side) > 25) continue;
      if (lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 2)) continue; // (a lamp two tiles both list)
      lamps.push({ x, z, ahead, side });
    }
  return lamps.sort((a, b) => a.ahead - b.ahead);
}

/** Pools down the street: each lamp ahead whose heart is in sight, its heart against the ground
 *  between it and the next pool at least 12 m further down the street (a lone pool, or the last: the
 *  street 30 m short of it, on the way there). */
function pools(G, shot, view, M) {
  const { W, H, px } = shot, { cx, cz, toScreen } = view;
  const seen = [];
  for (const l of lampsAhead(G, view)) {
    const s = toScreen(l.x, l.z);
    if (!s) continue;
    const rx = Math.max(3, Math.min(60, (4 * H) / l.ahead)), ry = Math.max(2, Math.min(40, (1.65 * H * 4) / (l.ahead * l.ahead) + 2));
    const heart = windowMean(px, W, H, s[0], s[1], rx, ry, (i) => M.ground(i) && M.F(i) >= 0.5);
    if (heart.n < 2) continue;
    seen.push({ ...l, at: s.map(Math.round), heartY: heart.Y, heartN: heart.n, rx, ry });
  }
  for (let k = 0; k < seen.length; k++) {
    const a = seen[k], t0 = (a.ahead - 30) / a.ahead;
    const b = seen.slice(k + 1).find((q) => q.ahead - a.ahead >= 12) ?? (a.ahead > 34 ? { x: cx + (a.x - cx) * t0, z: cz + (a.z - cz) * t0 } : null);
    if (!b) { a.gapY = null; continue; }
    let n = 0, sY = 0;
    const marks = [];
    for (const t of [0.35, 0.425, 0.5, 0.575, 0.65]) {
      const s = toScreen(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!s) continue;
      marks.push(s.map(Math.round));
      const g = windowMean(px, W, H, s[0], s[1], 4, 2, M.ground);
      if (g.n) (n += g.n), (sY += g.Y * g.n);
    }
    a.gapY = n ? sY / n : null;
    a.gapAt = marks;
  }
  return seen;
}

/** The nearest pool ahead (14–70 m out, its heart in sight), sampled every metre along the line from
 *  its heart toward the camera's foot: the ground's mean luminance at each step (a window of the
 *  frame round where that ground point lands), and the floor — the same line past the pool's reach
 *  on either side, or failing that the gap's ground. */
function falloff(G, shot, view, M, gapY) {
  const { W, H, px } = shot, { cx, cz, toScreen } = view;
  for (const l of lampsAhead(G, view)) {
    if (l.ahead < 14 || l.ahead > 70 || Math.abs(l.side) > 15) continue;
    const s0 = toScreen(l.x, l.z);
    if (!s0) continue;
    const L0 = Math.hypot(cx - l.x, cz - l.z), ux = (cx - l.x) / L0, uz = (cz - l.z) / L0;
    const at = (d) => { const s = toScreen(l.x + ux * d, l.z + uz * d); return s ? windowMean(px, W, H, s[0], s[1], 3, 1, M.ground) : { n: 0 }; };
    const heart = at(0);
    if (heart.n < 3 || M.F(Math.round(s0[1]) * W + Math.round(s0[0])) < 0.6) continue;
    const samples = [], marks = [];
    for (let d = 0; d <= 20 && d < L0 - 3; d += 1) {
      const s = toScreen(l.x + ux * d, l.z + uz * d);
      if (!s) continue;
      const w = windowMean(px, W, H, s[0], s[1], 3, 1, M.ground);
      if (w.n) samples.push({ d, Y: w.Y }), marks.push([...s.map(Math.round), d]);
    }
    // the floor: the line past the reach, toward you and beyond the pool, where the field is ~0
    let n = 0, sY = 0;
    for (const d of [24, 26, 28, 30, -24, -26, -28, -30]) {
      if (d > 0 && d > L0 - 3) continue;
      const s = toScreen(l.x + ux * d, l.z + uz * d);
      if (!s) continue;
      const w = windowMean(px, W, H, s[0], s[1], 3, 1, (i) => M.ground(i) && M.F(i) <= 0.02);
      if (w.n) (n += w.n), (sY += w.Y * w.n);
    }
    const floorY = n >= 6 ? sY / n : gapY;
    const r = poolFalloff(samples, floorY);
    return { ...r, lamp: { ahead: Math.round(l.ahead), side: Math.round(l.side) }, floorFrom: n >= 6 ? 'the line past the reach' : 'the gap', marks, at: s0.map(Math.round) };
  }
  return { pass: false, why: 'no pool 14–70 m ahead with its heart in sight', profile: [], marks: [] };
}

async function measure(G, label, opts, judge) {
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
  const M = {
    F: (i) => field[i * 4] / 255,
    there: (i) => field[i * 4 + 3] > 127,
    // the ground: faces up, within a metre of the street's level (not a car's roof, nor a flat roof)
    ground: (i) => field[i * 4 + 3] > 127 && field[i * 4 + 1] > 235 && Math.abs((field[i * 4 + 2] / 255) * 8 - 4) < 1,
  };
  const view = viewOf(G, W, H);
  // the wires where the sky is behind them (nothing of the world drawn there)
  const skyWire = wm.map((m, i) => (m && !M.there(i) ? 1 : 0));
  const wire = wiresVsSky(A.px, B.px, skyWire);
  const y40 = Math.floor(H * 0.6), y50 = Math.floor(H * 0.5);
  const band = regionColour(A.px, W, H, (i) => i >= y40 * W);
  const heart = regionColour(A.px, W, H, (i) => M.ground(i) && M.F(i) >= opts.heart);
  const gap = regionColour(A.px, W, H, (i) => i >= y50 * W && M.ground(i) && M.F(i) <= opts.gap);
  const gapY = (() => { let n = 0, s = 0; for (let i = y50 * W; i < W * H; i++) if (M.ground(i) && M.F(i) <= opts.gap) { n++; s += luminance(A.px[i * 4], A.px[i * 4 + 1], A.px[i * 4 + 2]); } return n ? s / n : null; })();
  const fall = falloff(G, A, view, M, gapY);
  // round 10's dark (the bottom 40% outside the hearts), kept for comparison
  const dark = regionColour(A.px, W, H, (i) => i >= y40 * W && M.there(i) && M.F(i) < 0.25);
  const P2 = poolContrast(pools(G, A, view, M), { ratio: 2.5, need: 2 });
  const lensWhy = lensVerdict(lens);
  const gapV = nightGapPasses(gap), heartV = chromaPasses(heart, 30), bandV = chromaPasses(band, 22);
  const r = {
    label,
    at: [Math.round(G.walker.x), Math.round(G.walker.z), +G.walker.yaw.toFixed(2)],
    night: +G.U.uNight.value.toFixed(2), moon: +(G.U.uKeyColor.value.b * 1000).toFixed(1), // (the key light's blue ×1000: the moon's, by night)
    lens: { ...lens, pass: !lensWhy.length, why: lensWhy.join(', ') },
    wires: { ...wire, meshes: wires.length, maskPx: wm.reduce((s, m) => s + m, 0) },
    band: { ...band, pass: bandV.pass, why: bandV.why },
    heart: { ...heart, pass: heartV.pass, why: heartV.why },
    gap: { ...gap, pass: gapV.pass, why: gapV.why },
    falloff: { pass: fall.pass, why: fall.why, dHalf: fall.dHalf, at12: fall.at12, steep: fall.steep, rise: fall.rise, heartL: fall.heartL, floorL: fall.floorL, floorFrom: fall.floorFrom, lamp: fall.lamp, profile: fall.profile },
    dark: { ...dark, round10: nightDarkPasses(dark).pass },
    pools: { good: P2.good, pass: P2.pass, list: P2.pools.map((p) => ({ ahead: Math.round(p.ahead), side: Math.round(p.side), at: p.at, heartL: +lstar(p.heartY).toFixed(1), gapL: p.gapY == null ? null : +lstar(p.gapY).toFixed(1), ratio: p.ratio })) },
  };
  // (a pose judges what applies to it: a street with one lamp in sight has no pools to count)
  r.judged = judge;
  r.pass = judge.every((k) => r[k].pass !== false);
  return { r, A, field, wm, plist: P2.pools, fall, M };
}

/** The frame with what was measured drawn on it. */
function overlay(m) {
  const { A, field, wm, plist, r, fall, M } = m, { W, H } = A;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(A.px), W, H);
  const d = img.data;
  for (let i = 0; i < W * H; i++) {
    if (wm[i]) { d[i * 4] = 255; d[i * 4 + 1] = 0; d[i * 4 + 2] = 255; continue; }
    if (!M.ground(i)) continue;
    const f = field[i * 4] / 255;
    if (f >= 0.6) { d[i * 4] = Math.min(255, d[i * 4] * 0.5 + 128); d[i * 4 + 1] = d[i * 4 + 1] * 0.5 + 40; d[i * 4 + 2] *= 0.4; } // hearts: lifted toward orange
    else if (f <= 0.02 && i >= Math.floor(H * 0.5) * W) { d[i * 4] *= 0.5; d[i * 4 + 1] = d[i * 4 + 1] * 0.6 + 50; d[i * 4 + 2] = d[i * 4 + 2] * 0.6 + 60; } // the gap: toward teal
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
  // the fall-off's samples: white every metre, yellow at 5 and 12 m
  for (const [sx, sy, dm] of fall.marks ?? []) { x.fillStyle = dm === 5 || dm === 12 ? '#ffe14d' : '#ffffff'; x.fillRect(sx - 1, sy - 1, 3, 3); }
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, W, 82);
  x.fillStyle = '#fff';
  const ok = (k) => (r[k].pass === false ? 'FAIL' : r[k].pass == null ? 'n/a' : 'ok') + (r.judged.includes(k) ? '' : '·');
  const f = r.falloff;
  x.fillText(`lens ${ok('lens')} ${(r.lens.near25 * 100).toFixed(1)}%  wires ${ok('wires')} ${r.wires.wireL} vs sky ${r.wires.skyL}  band ${ok('band')} L* ${r.band.L} C* ${r.band.C} h ${r.band.h}°`, 8, 16);
  x.fillText(`heart ${ok('heart')} L* ${r.heart.L} C* ${r.heart.C} h ${r.heart.h}°   gap ${ok('gap')} L* ${r.gap.L} C* ${r.gap.C} h ${r.gap.h}°`, 8, 34);
  x.fillText(`falloff ${ok('falloff')} half at ${f.dHalf ?? '-'} m, ${f.at12 == null ? '-' : Math.round(f.at12 * 100)}% at 12 m, steepest ${f.steep ?? '-'} L*/m (${f.heartL ?? '-'} → ${f.floorL ?? '-'})`, 8, 52);
  x.fillText(`pools ${ok('pools')} ${r.pools.good} ≥ 2.5×: ${r.pools.list.slice(0, 6).map((p) => `${p.ahead}m ${p.heartL}/${p.gapL ?? '-'}`).join('  ')}`, 8, 70);
  return c;
}

// The poses, by key. (21:30 and 22:00 fall on whatever night the page is on — the review's own
// clock; 'n' poses move to the next night with the moon down, the night's floor alone.)
const POSES = {
  3: { label: 'the night street (review 3: ocean-night, 22:00)', judge: ['lens', 'wires', 'band', 'pools'], fn: (G) => { window.__APPLY_SHOT__('ocean-night'); G.setHour(22); } },
  13: { label: 'a streamed street at night (review 13: Long Branch, 21:30)', judge: ['lens', 'wires', 'heart', 'gap', 'falloff'], fn: async (G) => { G.setHour(21.5); G.timeParams.speed = 0; const [x, z] = lonLat(G, -73.9868, 40.3043); await G.stream.ensureAround(x, z); street(G, x, z, 0.2); await window.__WAIT__(1500); } },
  center: { label: 'Center Street, 22:00', judge: ['lens', 'wires'], fn: (G) => { G.walkParams.fly = false; G.walker.place(52, 257, 1.52, 0.0); G.setHour(22); } },
  day: { label: 'Ocean Ave, morning (review 2: the day, unchanged)', judge: [], fn: (G) => { window.__APPLY_SHOT__('ocean-morning'); G.setHour(8.2); } },
};
const lonLat = (G, lon, lat) => { const o = G.world.json.origin, K = (Math.PI / 180) * 6378137; return [(lon - o.lon) * K * Math.cos((o.lat * Math.PI) / 180), (o.lat - lat) * K]; };
// stand at the edge of the nearest street, looking along it (tools/review-shots.js)
function street(G, x, z, h) {
  let best = null;
  for (const r of [...(G.stream?.primRoads ?? []), ...G.world.json.roads]) {
    if (!r.w || r.lod || !['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street'].includes(r.c)) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0.2, Math.min(0.8, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(px - x, pz - z);
      if (L2 > 400 && (!best || d < best.d)) best = { d, px, pz, dx, dz, w: r.w };
    }
  }
  G.walkParams.fly = false;
  if (!best) return void G.walker.place(x, z, 0, -0.03);
  const L = Math.hypot(best.dx, best.dz), nx = -best.dz / L, nz = best.dx / L, off = best.w / 2 - 0.8;
  G.walker.place(best.px + nx * off, best.pz + nz * off, Math.atan2(best.dx, best.dz) + Math.PI + (h ?? 0), -0.02);
}
/** The first night after the page's own (within a month) with the moon under the horizon at `hour`. */
async function moonlessDay(G, hour) {
  const S = await import('/src/core/sun.ts'), o = G.world.json.origin, tz = G.world.json.meta?.tz ?? 'America/New_York';
  const now = Date.now(), year = new Date(now).getUTCFullYear(), d0 = G.timeParams.dayOfYear > 0 ? G.timeParams.dayOfYear : Math.floor((now - Date.UTC(year, 0, 1)) / 86400000) + 1;
  for (let k = 1; k < 31; k++) if (S.celestial(S.localToMs(Date.UTC(year, 0, d0 + k, 12), hour, tz), o.lat, o.lon).moonElevation < -4) return d0 + k;
  return d0;
}
// a key: '3', '13n' (the moon down), '13n@0.12' (…with the night's floor at that strength, in-page)
const poseOf = (key) => {
  if (typeof key !== 'string' && typeof key !== 'number') return key;
  const [k, floor] = String(key).split('@'), moonless = k.endsWith('n') && POSES[k.slice(0, -1)], base = POSES[moonless ? k.slice(0, -1) : k];
  if (!base) throw new Error(`night-check: no pose '${k}'`);
  const hour = k.startsWith('13') ? 21.5 : 22;
  const fn = async (G) => {
    if (moonless) G.timeParams.dayOfYear = await moonlessDay(G, hour);
    await base.fn(G);
    if (floor && G.U.uNightFloor) G.U.uNightFloor.value.w = Number(floor);
  };
  return { key: String(key).replace('@', '-f'), ...base, label: `${base.label}${moonless ? ', the moon down' : ''}${floor ? ` [floor ${floor}]` : ''}`, fn };
};

// opts.variants: [{ name, apply(G) }] — each measured on every pose without re-posing it (a knob
// turned in the page, three frames to show it); the sheet then has one row per pose and variant.
window.__NIGHTCHECK__ = async (tag = 'n', poses = null, opts = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  opts = { settle: 12, heart: 0.6, gap: 0.02, png: false, ...opts };
  G.timeParams.speed = 0;
  const day0 = G.timeParams.dayOfYear, floor0 = G.U.uNightFloor?.value.w;
  const list = (poses ?? ['3', '13']).map(poseOf);
  const variants = opts.variants ?? [{ name: '', apply: () => {} }];
  const out = [], sheets = [];
  for (const p of list) {
    G.timeParams.dayOfYear = day0;
    if (G.U.uNightFloor) G.U.uNightFloor.value.w = floor0;
    await p.fn(G);
    G.timeParams.speed = 0;
    await frames(opts.settle);
    for (const v of variants) {
      await v.apply(G);
      if (variants.length > 1) await frames(3);
      const label = v.name ? `${p.label} [${v.name}]` : p.label;
      const m = await measure(G, label, opts, p.judge ?? ['lens', 'wires']);
      m.r.key = p.key;
      out.push(m.r);
      console.log(`[night] ${JSON.stringify(m.r)}`);
      const a = document.createElement('canvas');
      a.width = m.A.W; a.height = m.A.H;
      a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.A.px), m.A.W, m.A.H), 0, 0);
      if (opts.png) {
        const blob = await new Promise((res) => a.toBlob(res, 'image/png'));
        await fetch(`/__shot?name=${encodeURIComponent(`nightcheck-${tag}-${p.key ?? out.length}${v.name ? '-' + v.name.replace(/\W+/g, '') : ''}.png`)}`, { method: 'POST', body: blob });
      }
      sheets.push([a, label], [overlay(m), `measured — ${m.r.judged.length ? (m.r.pass ? 'PASS' : 'FAIL') : 'not judged'}`]);
      if (opts.eachSave) await saveSheet(sheets, tag, opts); // (a long sweep keeps what it has so far)
    }
  }
  G.timeParams.dayOfYear = day0;
  if (G.U.uNightFloor) G.U.uNightFloor.value.w = floor0;
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
