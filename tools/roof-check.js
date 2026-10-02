// Round 10's five-roof test (reviewer rounds 10–12, "roof hue: evidence owed"), in the page: five 6 × 6 m
// test houses by the spawn — grey 0x6b6b6b, clay 0xa0553b, blue metal 0x5d7091, green metal 0x4f6a52,
// brown 0x6b5e52 — drawn by the buildings' own material (buildings.ts: paintLight with the roof's
// skyNeutral, the roof materials' courses and ribs) and read raw (post.ts uRaw: the tonemapped scene,
// no paint) at 12:00 and 18:00 on the page's date:
//   · the four coloured roofs keep their albedo's hue ±12° and ≥ 80% of its chroma on the sunlit slope;
//   · the grey reads C*ab ≤ 4 on its sunlit slope at noon and ≤ 8 in shade: a cool grey, not teal;
//   · at 18:00 the grey roof's sunlit slope has a b* within 3 of the sunlit wall beside it.
// On a `?capture=1` page:
//   await import('/tools/roof-check.js'); await __ROOFCHECK__('tag')
//   → { pass, hours: { 12: { roofs: [...], wall }, 18: {...} } } and shots/roofcheck-<tag>.jpg: each raw
//   frame, the patches measured outlined.
// The houses stand 60 m over the spawn, 12 m apart north to south, hip-roofed at 30° (a slope to each
// side: the sunlit one and the one in shade at either hour), walls the grey's own colour — nothing of
// the town shades them, nor one another, with the sun high in the south or low in the west.
await import('/tools/inpage-montage.js');

export const ROOFS = [['grey', 0x6b6b6b, 0], ['clay', 0xa0553b, 2], ['blue metal', 0x5d7091, 1], ['green metal', 0x4f6a52, 1], ['brown', 0x6b5e52, 0]];
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** CIE L*a*b* (D65) of an sRGB colour, 0–255 a channel. */
export function lab(r, g, b) {
  const R = lin(r / 255), Gc = lin(g / 255), B = lin(b / 255);
  const X = (0.4124 * R + 0.3576 * Gc + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * Gc + 0.0722 * B, Z = (0.0193 * R + 0.1192 * Gc + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const labHex = (hex) => lab(Math.floor(hex / 65536) % 256, Math.floor(hex / 256) % 256, hex % 256);
export const chroma = (L) => Math.hypot(L[1], L[2]);
export const hue = (L) => ((Math.atan2(L[2], L[1]) * 180) / Math.PI + 360) % 360;
export const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/** The test's verdicts on one hour's measures (pure: tests/roofCheck… can read it). */
export function roofVerdict(hour, roofs, wall) {
  const why = [];
  for (const r of roofs) {
    const A = labHex(r.hex), S = r.sun;
    if (r.name === 'grey') {
      if (hour === 12 && chroma(S) > 4) why.push(`grey sunlit C* ${chroma(S).toFixed(1)} > 4`);
      if (hour === 12 && chroma(r.shade) > 8) why.push(`grey in shade C* ${chroma(r.shade).toFixed(1)} > 8`);
      if (hour === 18 && wall && Math.abs(S[2] - wall[2]) > 3) why.push(`grey sunlit b* ${S[2].toFixed(1)} vs the wall's ${wall[2].toFixed(1)}`);
    } else {
      if (hueDiff(hue(S), hue(A)) > 12) why.push(`${r.name}: hue ${hue(S).toFixed(0)}° vs its albedo's ${hue(A).toFixed(0)}°`);
      if (chroma(S) < 0.8 * chroma(A)) why.push(`${r.name}: C* ${chroma(S).toFixed(1)} under 80% of its albedo's ${chroma(A).toFixed(1)}`);
    }
  }
  return why;
}

window.__ROOFCHECK__ = async (tag = 'r', opts = {}) => {
  const G = window.__GAME__, T = G.THREE, wait = window.__WAIT__;
  window.__PUMP__();
  const canvas = G.renderer.domElement;
  const frames = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  // the buildings' own material (any mounted tile's): its uniforms are the live sun, sky and shadows
  let mat = null;
  // (a mounted tile's building meshes are unpacked under names of their own: found by the material's own
  // uniform, uRoofSky — the interiors' material shares the walls' attributes but not that)
  G.scene.traverse((o) => { if (!mat && o.isMesh && o.material?.uniforms?.uRoofSky && o.geometry?.getAttribute?.('aWall')) mat = o.material; });
  if (!mat) throw new Error('roof-check: no building mounted to borrow the material from');
  const s = G.spawn, base = G.world.terrain.heightAt(s.x, s.z) + 60, WALL = 3, HALF = 3, PITCH = Math.tan(Math.PI / 6);
  const top = base + WALL, apex = top + HALF * PITCH;
  const P = [], N = [], C = [], AW = [], AI = [], AT = [];
  const put = (p, n, col, w, info, tan) => { P.push(...p); N.push(...n); C.push(col.r, col.g, col.b); AW.push(...w); AI.push(...info); AT.push(...tan); };
  const tri = (a, b, c, n, col, wa, wb, wc, info, tan) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flip = f[0] * n[0] + f[1] * n[1] + f[2] * n[2] < 0;
    for (const [q, w] of flip ? [[a, wa], [c, wc], [b, wb]] : [[a, wa], [b, wb], [c, wc]]) put(q, n, col, w, info, tan);
  };
  const houses = ROOFS.map(([name, hex, rm], k) => {
    const cx = s.x, cz = s.z - 24 + k * 12, id = 9.1e6 + k, col = new T.Color(hex), wallCol = new T.Color(0x6b6b6b);
    const c = [[cx - HALF, cz - HALF], [cx + HALF, cz - HALF], [cx + HALF, cz + HALF], [cx - HALF, cz + HALF]]; // NW, NE, SE, SW
    const walls = [], slopes = [];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const n = [dz / len, 0, -dx / len]; // (outward: the ring runs clockwise seen from above, +z south)
      const info = [id, 0, 0, 0], tan = [dx / len, dz / len];
      const A0 = [a[0], base, a[1]], B0 = [b[0], base, b[1]], B1 = [b[0], top, b[1]], A1 = [a[0], top, a[1]];
      tri(A0, B0, B1, n, wallCol, [0, 0, len, WALL], [len, 0, len, WALL], [len, WALL, len, WALL], info, tan);
      tri(A0, B1, A1, n, wallCol, [0, 0, len, WALL], [len, WALL, len, WALL], [0, WALL, len, WALL], info, tan);
      // the roof's slope over this wall, up to the apex
      const ap = [cx, apex, cz], e = [n[0] * PITCH, 1, n[2] * PITCH], L = Math.hypot(...e), sn = [e[0] / L, e[1] / L, e[2] / L];
      tri(A1, B1, ap, sn, col, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [id, 0, 1, rm], [0, 0]);
      walls.push({ n, a, b });
      slopes.push({ n: sn, pts: [A1, B1, ap] });
    }
    return { name, hex, walls, slopes };
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(C, 3));
  g.setAttribute('aWall', new T.Float32BufferAttribute(AW, 4));
  g.setAttribute('aInfo', new T.Float32BufferAttribute(AI, 4));
  g.setAttribute('aTan', new T.Float32BufferAttribute(AT, 2));
  g.computeBoundingSphere();
  const mesh = new T.Mesh(g, mat);
  mesh.name = 'roof-check';
  mesh.frustumCulled = false;
  const world = G.scene.getObjectByName('world');
  world.add(mesh);

  // reading the raw frame: the canvas as the post leaves it (uRaw: tonemapped, no paint)
  const read = () => { const c2 = document.createElement('canvas'); c2.width = canvas.width; c2.height = canvas.height; const x = c2.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0); return { c2, x, d: x.getImageData(0, 0, c2.width, c2.height).data }; };
  // (points in world coordinates, the camera in render space: the world root is offset by uWorldOffset)
  const proj = (p) => { const o = G.U.uWorldOffset.value, v = new T.Vector3(p[0] - o.x, p[1] - o.y, p[2] - o.z).project(G.camera); return [(v.x * 0.5 + 0.5) * canvas.width, (0.5 - v.y * 0.5) * canvas.height, v.z]; };
  /** the mean Lab over a polygon's middle (its corners pulled 30% to its centre), and its pixel count */
  const meanIn = (img, pts3, outline) => {
    const q = pts3.map(proj);
    if (q.some((v) => v[2] >= 1)) return null;
    const cx = q.reduce((a, v) => a + v[0], 0) / q.length, cy = q.reduce((a, v) => a + v[1], 0) / q.length;
    const r = q.map((v) => [cx + (v[0] - cx) * 0.7, cy + (v[1] - cy) * 0.7]);
    const x0 = Math.max(0, Math.floor(Math.min(...r.map((v) => v[0])))), x1 = Math.min(canvas.width - 1, Math.ceil(Math.max(...r.map((v) => v[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...r.map((v) => v[1])))), y1 = Math.min(canvas.height - 1, Math.ceil(Math.max(...r.map((v) => v[1]))));
    const inside = (x, y) => { let pos = 0, neg = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (cr > 0) pos++; else if (cr < 0) neg++; } return !(pos && neg); };
    let n = 0, L = 0, A = 0, B = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const i = (y * canvas.width + x) * 4, l = lab(img.d[i], img.d[i + 1], img.d[i + 2]);
      L += l[0]; A += l[1]; B += l[2]; n++;
    }
    if (outline) { img.x.strokeStyle = outline; img.x.lineWidth = 2; img.x.beginPath(); r.forEach((v, i) => (i ? img.x.lineTo(v[0], v[1]) : img.x.moveTo(v[0], v[1]))); img.x.closePath(); img.x.stroke(); }
    return n ? { lab: [L / n, A / n, B / n], n } : null;
  };
  const sheet = [], out = { hours: {}, pass: true };
  const raw0 = G.debugParams.rawScene;
  G.debugParams.rawScene = true;
  try {
    // (each hour as the roofs are — ROOF_SKY — then with the sky fill greyed more: uRoofSky turned)
    const rs0 = mat.uniforms.uRoofSky?.value;
    for (const hour of opts.hours ?? [12, 18]) for (const rs of rs0 === undefined ? [undefined] : [rs0, ...(opts.roofSky ?? [0.4, 0.3])]) {
      if (rs !== undefined) mat.uniforms.uRoofSky.value = rs;
      const vtag = rs === rs0 ? '' : ` · roofs grey ${rs} of the sky fill`;
      G.setHour(hour); G.timeParams.speed = 0;
      // (1) from above: every roof, its sunlit slope (most toward the sun) and its slope in shade (least)
      G.walkParams.fly = true;
      G.walker.place(s.x - 0.01, s.z, Math.PI / 2, -1.45);
      G.walker.y = apex + 36;
      await frames(opts.settle ?? 14);
      const kd = G.U.uKeyDir.value, sun = [kd.x, kd.y, kd.z]; // (the hour's sun, once a frame has set it)
      const dotS = (n) => n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
      const img = read();
      const roofs = houses.map((h) => {
        const by = [...h.slopes].sort((a, b) => dotS(b.n) - dotS(a.n)), sunS = by[0], shadeS = by[by.length - 1];
        const a = meanIn(img, sunS.pts, '#ffd400'), b = meanIn(img, shadeS.pts, '#00b4ff');
        return { name: h.name, hex: h.hex, sun: a?.lab ?? [NaN, NaN, NaN], shade: b?.lab ?? [NaN, NaN, NaN], px: [a?.n ?? 0, b?.n ?? 0], ndl: [+dotS(sunS.n).toFixed(2), +dotS(shadeS.n).toFixed(2)] };
      });
      sheet.push([img.c2, `${hour}:00 from above — sunlit slopes (yellow), in shade (blue)${vtag}`]);
      // (2) the grey house side on from the sun's side: its sunlit wall (below the sills) and the roof
      // slope over it, in one frame
      const grey = houses[0], w = [...grey.walls].sort((a, b) => dotS(b.n) - dotS(a.n))[0];
      const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
      G.walker.place(mx + w.n[0] * 14, mz + w.n[2] * 14, Math.atan2(w.n[0], w.n[2]), -0.2);
      G.walker.y = top + 3;
      await frames(opts.settle ?? 14);
      const img2 = read();
      const along = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
      const at = (u, v) => [w.a[0] + along[0] * u, base + v, w.a[1] + along[1] * u];
      const wl = meanIn(img2, [at(0.15, 0.3), at(0.85, 0.3), at(0.85, 0.8), at(0.15, 0.8)], '#ff3070');
      const sl = grey.slopes.find((q) => Math.abs(q.n[0] - (w.n[0] * PITCH) / Math.hypot(PITCH, 1)) < 1e-6 && Math.abs(q.n[2] - (w.n[2] * PITCH) / Math.hypot(PITCH, 1)) < 1e-6);
      const rl = sl ? meanIn(img2, sl.pts, '#ffd400') : null;
      sheet.push([img2.c2, `${hour}:00 the grey house from the sun's side — its wall (red), the slope over it (yellow)${vtag}`]);
      const wall = wl?.lab ?? null;
      if (rl) roofs[0].sideSun = rl.lab;
      const why = roofVerdict(hour, roofs, wall);
      if (hour === 18 && rl && wall && Math.abs(rl.lab[2] - wall[2]) > 3) why.push(`grey sunlit b* side on ${rl.lab[2].toFixed(1)} vs the wall's ${wall[2].toFixed(1)}`);
      (rs === rs0 ? out.hours : ((out.variants ??= {})[rs] ??= {}))[hour] = {
        sun: sun.map((v) => +v.toFixed(3)),
        roofs: roofs.map((r) => { const A = labHex(r.hex); return { name: r.name, albedo: { L: +A[0].toFixed(1), C: +chroma(A).toFixed(1), h: +hue(A).toFixed(0), b: +A[2].toFixed(1) }, sunlit: { L: +r.sun[0].toFixed(1), C: +chroma(r.sun).toFixed(1), h: +hue(r.sun).toFixed(0), b: +r.sun[2].toFixed(1), keep: +(chroma(r.sun) / Math.max(1e-6, chroma(A))).toFixed(2), dh: +hueDiff(hue(r.sun), hue(A)).toFixed(1), px: r.px[0], ndl: r.ndl[0] }, shade: { L: +r.shade[0].toFixed(1), C: +chroma(r.shade).toFixed(1), h: +hue(r.shade).toFixed(0), b: +r.shade[2].toFixed(1), px: r.px[1], ndl: r.ndl[1] }, ...(r.sideSun ? { sideOn: { L: +r.sideSun[0].toFixed(1), C: +chroma(r.sideSun).toFixed(1), b: +r.sideSun[2].toFixed(1) } } : {}) }; }),
        wall: wall ? { L: +wall[0].toFixed(1), a: +wall[1].toFixed(1), b: +wall[2].toFixed(1), C: +chroma(wall).toFixed(1), px: wl.n } : null,
        why,
      };
      if (why.length && rs === rs0) out.pass = false;
    }
  } finally {
    G.debugParams.rawScene = raw0;
    if (mat.uniforms.uRoofSky) mat.uniforms.uRoofSky.value = rs0;
    world.remove(mesh);
    g.dispose();
  }
  // the sheet: each frame, what was measured outlined on it
  const CW = 800, CH = Math.round((CW * canvas.height) / canvas.width), PAD = 22;
  const sh = document.createElement('canvas');
  sh.width = CW * 2; sh.height = Math.ceil(sheet.length / 2) * (CH + PAD);
  const x = sh.getContext('2d');
  x.fillStyle = '#f5efe1'; x.fillRect(0, 0, sh.width, sh.height); x.font = '14px Georgia, serif'; x.fillStyle = '#3a3346';
  sheet.forEach(([c2, label], i) => { const px = (i % 2) * CW, py = Math.floor(i / 2) * (CH + PAD); x.drawImage(c2, px, py, CW, CH); x.fillText(label, px + 8, py + CH + 16); });
  const blob = await new Promise((r) => sh.toBlob(r, 'image/jpeg', 0.88));
  await fetch(`/__shot?name=${encodeURIComponent(`roofcheck-${tag}.jpg`)}`, { method: 'POST', body: blob });
  G.walkParams.fly = false;
  out.sheet = `shots/roofcheck-${tag}.jpg`;
  return out;
};
