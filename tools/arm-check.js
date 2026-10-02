// Round 12's must-fix 5, measured on the frames (in the page, `?capture=1`): "arm's length, round two".
//   await import('/tools/arm-check.js'); await __ARMCHECK__('tag', { only: ['6', '18', 'dock'] })
//   → { 6: {...}, 18: {...}, dock: {...}, pass } and shots/armcheck-<tag>.jpg (each frame as painted,
//   then what was measured drawn over it).
// · 6, the cottage's kitchen (review-shots' pose): the wall cabinets against the curtains — ΔE76 ≥ 15
//   between their mean colours in the painted frame — and the shadow band under the cabinets on the
//   splashback: ≥ 3 px tall and ≥ 10 L* under the splashback below it. Found by an id pass: the
//   interior drawn flat with its albedo and each pixel's height over the floor (the cabinets are the
//   kitchen's tint 0.03–0.7 m over WALL_Y; the band and the tiles their own colours under it); the
//   curtains are what changes when the curtains' fabric (uFab) is swapped for magenta.
// · 18, inside a café (review-shots' pose): every occupied table in sight has lunch on it — the id
//   pass counts the plates, cups and glasses (`interior:tw:*`, an instance each) seen on each table a
//   seated resident sits at: ≥ 1 a table.
// · dock, pick-r12a 5 (the riverfront dock at 16:00, a boat passing 18 m out at 5 m/s): no white blob —
//   L* ≥ 85, ≥ 0.2% of the frame — on the water within 15 m of the dock; and what each blob is, by an
//   id pass of the wakes, the water, the micro layer's floats and the boats.
await import('/tools/inpage-montage.js');

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(r, g, b) {
  const R = lin(r / 255), Gc = lin(g / 255), B = lin(b / 255);
  const X = (0.4124 * R + 0.3576 * Gc + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * Gc + 0.0722 * B, Z = (0.0193 * R + 0.1192 * Gc + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

window.__ARMCHECK__ = async (tag = 'a', opts = {}) => {
  const G = window.__GAME__, T = G.THREE, R = G.renderer, wait = window.__WAIT__;
  window.__PUMP__();
  const canvas = R.domElement, W = canvas.width, H = canvas.height;
  const frames = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const world = G.scene.getObjectByName('world');
  const rt = new T.WebGLRenderTarget(W, H, { depthBuffer: true });
  const rt2 = new T.WebGLRenderTarget(W, H, { depthBuffer: true });
  // ---- the id passes: the world drawn flat for its depth, then only the targets through `mat` ----
  const depthMat = new T.MeshBasicMaterial({ color: 0x000000 });
  const idMat = new T.ShaderMaterial({
    uniforms: { uTag: { value: 0 }, uMode: { value: 0 }, uRef: { value: new T.Vector4() } },
    vertexShader: `attribute vec3 color; varying vec3 vW; varying vec3 vCol; flat varying float vInst;
      void main() {
        vec4 wp = vec4(position, 1.0);
        vCol = color;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp; vInst = float(gl_InstanceID);
        #else
          vInst = 0.0;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol *= instanceColor;
        #endif
        wp = modelMatrix * wp; vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `uniform float uTag, uMode; uniform vec4 uRef; varying vec3 vW; varying vec3 vCol; flat varying float vInst;
      void main() {
        if (uMode < 0.5) gl_FragColor = vec4(uTag / 255.0, mod(vInst, 256.0) / 255.0, floor(vInst / 256.0) / 255.0, 1.0);
        else if (uMode < 1.5) gl_FragColor = vec4(distance(vW.xz, uRef.xz) < uRef.w ? 1.0 : 0.0, 0.0, 0.0, 1.0);
        else gl_FragColor = vec4(vCol, clamp((vW.y - uRef.y) / 2.55, 0.0, 1.0));
      }`,
    side: T.DoubleSide,
    depthFunc: T.LessEqualDepth,
  });
  const read = (target) => { const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(target, 0, 0, W, H, px); return px; };
  /** Draw the world (only the world) flat into rt for its depth; then each pass draws only the meshes
   *  `pick` keeps (an Object3D test), cleared to black, through idMat as set up, and reads it back. */
  const idPasses = (passes) => {
    const off = [], hideAll = (o) => { if (o.visible) { off.push(o); o.visible = false; } };
    for (const o of G.scene.children) if (o !== world) hideAll(o);
    for (const c of world.children) if (c.name === 'grass') hideAll(c);
    const bg = G.scene.background, fog = G.scene.fog, prev = R.getRenderTarget(), auto = R.autoClear, cc = R.getClearColor(new T.Color()), ca = R.getClearAlpha();
    const out = [];
    try {
      G.scene.background = null; G.scene.fog = null;
      R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear();
      G.scene.overrideMaterial = depthMat;
      R.render(G.scene, G.camera);
      R.autoClear = false;
      for (const ps of passes) {
        const keep = new Set();
        world.traverse((o) => { if (o !== world && (o.isMesh || o.isPoints || o.isLine) && o.visible && ps.pick(o)) for (let p = o; p && p !== world; p = p.parent) keep.add(p); });
        const hid = [];
        world.traverse((o) => { if (o !== world && !keep.has(o) && o.visible) { hid.push(o); o.visible = false; } });
        Object.assign(idMat.uniforms.uTag, { value: ps.tag ?? 1 });
        idMat.uniforms.uMode.value = ps.mode ?? 0;
        if (ps.ref) idMat.uniforms.uRef.value.set(...ps.ref);
        G.scene.overrideMaterial = idMat;
        R.clearColor();
        R.render(G.scene, G.camera);
        out.push(read(rt));
        for (const o of hid) o.visible = true;
      }
    } finally {
      G.scene.overrideMaterial = null; G.scene.background = bg; G.scene.fog = fog; R.autoClear = auto; R.setRenderTarget(prev); R.setClearColor(cc, ca);
      for (const o of off) o.visible = true;
    }
    return out;
  };
  /** The real scene (its own materials, no paint) into rt2: two renders differ where a uniform swap shows. */
  const sceneRaw = () => { const prev = R.getRenderTarget(); R.setRenderTarget(rt2); R.clear(); R.render(G.scene, G.camera); R.setRenderTarget(prev); return read(rt2); };
  const painted = () => { const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x = c2.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0); return { c2, x, d: x.getImageData(0, 0, W, H).data }; };
  // (render targets read bottom row first; the canvas top row first)
  const at = (px, x, y) => ((H - 1 - y) * W + x) * 4;
  const erode = (mask, r) => { const o = new Uint8Array(W * H); for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { let ok = mask[y * W + x]; for (let d = 1; ok && d <= r; d++) ok = mask[y * W + x - d] && mask[y * W + x + d] && mask[(y - d) * W + x] && mask[(y + d) * W + x]; o[y * W + x] = ok ? 1 : 0; } return o; };
  const meanLab = (img, mask) => { let n = 0, L = 0, A = 0, B = 0; for (let i = 0; i < W * H; i++) if (mask[i]) { const l = lab(img.d[i * 4], img.d[i * 4 + 1], img.d[i * 4 + 2]); L += l[0]; A += l[1]; B += l[2]; n++; } return n ? [L / n, A / n, B / n, n] : null; };
  const tint = (img, mask, rgb) => { for (let i = 0; i < W * H; i++) if (mask[i]) { img.d[i * 4] = (img.d[i * 4] + rgb[0]) / 2; img.d[i * 4 + 1] = (img.d[i * 4 + 1] + rgb[1]) / 2; img.d[i * 4 + 2] = (img.d[i * 4 + 2] + rgb[2]) / 2; } };
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; };
  const s = G.spawn, m = new T.Matrix4(), p = new T.Vector3();
  const sheet = [], out = { pass: true };
  const want = (k) => (opts.only ?? ['6', '18', 'dock']).includes(k);

  // ---------------- 6: the wall cabinets ----------------
  if (want('6')) {
    window.__APPLY_SHOT__('inside'); set(11);
    await wait(2500);
    await frames(opts.settle ?? 40);
    const I = G.interiors, Pl = I.activePlan;
    const r = { cabinets: null, curtains: null, dE: null, band: null };
    const kit = (I.piecesOn(0) ?? []).find((q) => q.startsWith('kitchen:'));
    if (Pl && kit) {
      const tintLin = kit.split(' ').at(-1).split(',').map(Number); // (the kitchen's tint, linear)
      const WALL_Y = 1.45, floor = Pl.floor0;
      const [alb] = idPasses([{ pick: (o) => { for (let q = o; q && q !== world; q = q.parent) if (q === I.group) return true; return false; }, mode: 2, ref: [0, floor, 0, 0] }]);
      const cab = new Uint8Array(W * H), band = new Uint8Array(W * H), tile = new Uint8Array(W * H);
      const splash = [0xe9, 0xee, 0xf0].map((c) => lin(c / 255)), near = (a, b, tol) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = at(alb, x, y), a = [alb[i] / 255, alb[i + 1] / 255, alb[i + 2] / 255], hy = (alb[i + 3] / 255) * 2.55;
        if (alb[i + 3] === 0 && a[0] + a[1] + a[2] === 0) continue;
        const k = y * W + x;
        if (hy > WALL_Y + 0.03 && hy < WALL_Y + 0.7 && near(a, tintLin, 0.02)) cab[k] = 1;
        else if (hy > WALL_Y - 0.06 && hy < WALL_Y + 0.004 && near(a, splash.map((c) => c * 0.5), 0.03)) band[k] = 1;
        else if (hy > 0.95 && hy < WALL_Y - 0.12 && near(a, splash, 0.03)) tile[k] = 1;
      }
      // the curtains: what changes when their fabric turns magenta
      const fab = I.fabU.value.clone();
      const a0 = sceneRaw();
      I.fabU.value.setRGB(1, 0, 1);
      const a1 = sceneRaw();
      I.fabU.value.copy(fab);
      const cur = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = at(a0, x, y); if (Math.abs(a0[i] - a1[i]) + Math.abs(a0[i + 1] - a1[i + 1]) + Math.abs(a0[i + 2] - a1[i + 2]) > 40) cur[y * W + x] = 1; }
      const img = painted();
      const cabE = erode(cab, 2), curE = erode(cur, 2);
      const lc = meanLab(img, cabE), lu = meanLab(img, curE);
      if (lc) r.cabinets = { L: +lc[0].toFixed(1), a: +lc[1].toFixed(1), b: +lc[2].toFixed(1), px: lc[3], tint: kit.split(' ').at(-1) };
      if (lu) r.curtains = { L: +lu[0].toFixed(1), a: +lu[1].toFixed(1), b: +lu[2].toFixed(1), px: lu[3] };
      if (lc && lu) r.dE = +Math.hypot(lc[0] - lu[0], lc[1] - lu[1], lc[2] - lu[2]).toFixed(1);
      // the band, column by column where the tiles show under it: its height in px, its L* against the tiles'
      const hts = [], dl = [];
      for (let x = 0; x < W; x++) {
        let nb = 0, nt = 0, lb = 0, lt = 0;
        for (let y = 0; y < H; y++) { const k = y * W + x; if (band[k]) { nb++; lb += lab(img.d[k * 4], img.d[k * 4 + 1], img.d[k * 4 + 2])[0]; } else if (tile[k]) { nt++; lt += lab(img.d[k * 4], img.d[k * 4 + 1], img.d[k * 4 + 2])[0]; } }
        if (nb && nt >= 3) { hts.push(nb); dl.push(lt / nt - lb / nb); }
      }
      const med = (v) => { const q = [...v].sort((a, b) => a - b); return q.length ? q[Math.floor(q.length / 2)] : null; };
      r.band = { columns: hts.length, heightPx: med(hts), dL: med(dl) === null ? null : +med(dl).toFixed(1) };
      r.pass = r.dE !== null && r.dE >= 15 && r.band.columns > 0 && r.band.heightPx >= 3 && r.band.dL >= 10;
      tint(img, cabE, [255, 212, 0]); tint(img, curE, [0, 180, 255]); tint(img, band, [255, 48, 112]);
      img.x.putImageData(new ImageData(img.d, W, H), 0, 0);
      sheet.push([img.c2, `6 the cabinets (yellow) and the curtains (blue): ΔE ${r.dE} · the band under the cabinets (red): ${r.band.heightPx} px, ${r.band.dL} L* under the tiles`]);
    } else r.pass = false;
    out[6] = r;
    if (!r.pass) out.pass = false;
  }

  // ---------------- 18: lunch at every occupied table ----------------
  if (want('18')) {
    const { useOf } = await import('/src/world/uses.ts');
    const shopPlan = (wantU) => { let best = null, bd = Infinity; for (const P of G.plans.values()) { const f = G.stream.fpByKey.get(P.fp); if (!f || f.kind !== 'commercial' || !wantU.includes(useOf(f.name, f.use))) continue; const d = Math.hypot(P.door.x - s.x, P.door.z - s.z); if (d < bd) (bd = d), (best = P); } return best; };
    const P = shopPlan(['cafe', 'restaurant', 'bar']) ?? shopPlan(['shop', 'unknown']);
    const r = { tables: [], occupied: 0, served: 0, inSight: 0 };
    if (P) {
      // (review-shots' 18: in at the door, turned a little, the interior built round you)
      set(13); G.walkParams.fly = false;
      const d = P.door;
      G.walker.place(d.wx - d.nx * 2.6, d.wz - d.nz * 2.6, Math.atan2(d.nx, d.nz) + 0.35, -0.12, d.y);
      for (let k = 0; k < 8; k++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
      G.interiors.flush();
      G.walker.place(d.wx - d.nx * 2.6, d.wz - d.nz * 2.6, Math.atan2(d.nx, d.nz) + 0.35, -0.12, d.y);
      for (let k = 0; k < 4; k++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
      await wait(2500);
      await frames(opts.settle ?? 40);
      const I = G.interiors, grp = I.group;
      const meshes = []; grp.traverse((o) => { if (o.isInstancedMesh) meshes.push(o); });
      const pos = (im, i) => { im.getMatrixAt(i, m); p.setFromMatrixPosition(m); return [p.x, p.y, p.z]; };
      const tables = [], ware = [], sitters = [];
      for (const im of meshes) {
        if (/^interior:(cafeTable:|highTop|booth:)/.test(im.name)) for (let i = 0; i < im.count; i++) tables.push({ im, i, at: pos(im, i), booth: im.name.includes('booth') });
        else if (/^interior:tw:/.test(im.name)) for (let i = 0; i < im.count; i++) ware.push({ im, i, at: pos(im, i) });
        else if (im.material === I.npcSeatMat) for (let i = 0; i < im.count; i++) sitters.push(pos(im, i));
      }
      // the id passes: the tables, then the tableware (a pass a mesh, each instance its own colour)
      const kinds = [...new Set(tables.map((t) => t.im)), ...new Set(ware.map((w) => w.im))];
      const px = idPasses(kinds.map((im, k) => ({ pick: (o) => o === im, tag: k + 1 })));
      const seen = new Map(); // im → instance → pixels
      kinds.forEach((im, k) => { const c = new Map(); const a = px[k]; for (let i = 0; i < W * H; i++) if (a[i * 4] === k + 1) { const inst = a[i * 4 + 1] + 256 * a[i * 4 + 2]; c.set(inst, (c.get(inst) ?? 0) + 1); } seen.set(im, c); });
      for (const t of tables) {
        const by = sitters.some((q) => Math.hypot(q[0] - t.at[0], q[2] - t.at[2]) < 1.0);
        const tpx = seen.get(t.im)?.get(t.i) ?? 0;
        const mine = ware.filter((w) => Math.hypot(w.at[0] - t.at[0], w.at[2] - t.at[2]) < (t.booth ? 0.7 : 0.45));
        const vis = mine.map((w) => seen.get(w.im)?.get(w.i) ?? 0);
        const entry = { table: t.im.name.replace('interior:', ''), occupied: by, tablePx: tpx, pieces: mine.length, piecesSeen: vis.filter((v) => v >= 4).length, piecePx: vis };
        r.tables.push(entry);
        if (by) { r.occupied++; if (tpx >= 30) { r.inSight++; if (entry.piecesSeen >= 1) r.served++; } }
      }
      r.pass = r.inSight > 0 && r.served === r.inSight;
      const img = painted();
      sheet.push([img.c2, `18 lunch: ${r.served} of the ${r.inSight} occupied tables in sight have a plate, cup or glass seen on them (${r.occupied} occupied)`]);
    } else r.pass = false;
    out[18] = r;
    if (!r.pass) out.pass = false;
  }

  /** The dock's frame, measured: the water within 15 m of the boat at its dock (b), the white on it
   *  (L* ≥ 85) as 8-connected blobs, each with its share of the frame and who draws it; `draw` paints
   *  what was measured over the frame and adds it to the sheet. */
  const measureDock = (b, draw, note = '') => {
    const r = { blobs: [] };
    const img = painted();
    const tags = [['wakes', (o) => o.name === 'wakes'], ['water', (o) => o.name === 'water'], ['micro', (o) => { for (let q = o; q && q !== world; q = q.parent) if (/micro/.test(q.name)) return true; return false; }], ['boats', (o) => /boat/.test(o.name)]];
    const [near, ...who] = idPasses([{ pick: (o) => o.name === 'water' || o.name === 'wakes', mode: 1, ref: [b.x - G.U.uWorldOffset.value.x, 0, b.z - G.U.uWorldOffset.value.z, 15] }, ...tags.map(([, f], k) => ({ pick: f, tag: k + 1 }))]);
    const water = new Uint8Array(W * H), white = new Uint8Array(W * H);
    let nw = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (near[at(near, x, y)] < 128) continue;
      water[k] = 1;
      if (lab(img.d[k * 4], img.d[k * 4 + 1], img.d[k * 4 + 2])[0] >= 85) { white[k] = 1; nw++; }
    }
    r.waterPx = water.reduce((a, v) => a + v, 0);
    r.whiteShare = +(nw / Math.max(1, r.waterPx)).toFixed(4);
    const lb = new Int32Array(W * H).fill(-1), st = [];
    for (let s0 = 0; s0 < W * H; s0++) {
      if (!white[s0] || lb[s0] >= 0) continue;
      const pix = []; lb[s0] = s0; st.push(s0);
      while (st.length) { const i = st.pop(); pix.push(i); const x = i % W, y = (i - x) / W; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (white[j] && lb[j] < 0) { lb[j] = s0; st.push(j); } } }
      if (pix.length < 20) continue;
      const by = {};
      tags.forEach(([nm], k) => { const a = who[k]; let n = 0; for (const i of pix) { const x = i % W, y = (i - x) / W; if (a[at(a, x, y)] === k + 1) n++; } by[nm] = +(n / pix.length).toFixed(2); });
      r.blobs.push({ share: +(pix.length / (W * H)).toFixed(4), px: pix.length, by });
    }
    r.blobs.sort((a, c) => c.px - a.px);
    r.big = r.blobs.filter((q) => q.share >= 0.002).length;
    if (draw) {
      tint(img, white, [255, 48, 112]);
      for (let i = 1; i < W * H; i++) if (water[i] && !water[i - 1]) { img.d[i * 4] = 0; img.d[i * 4 + 1] = 160; img.d[i * 4 + 2] = 255; }
      img.x.putImageData(new ImageData(img.d, W, H), 0, 0);
      sheet.push([img.c2, `dock, 16:00, a boat passing${note}: ${r.big} white blob(s) ≥ 0.2% of the frame on the water within 15 m (red); white ${(r.whiteShare * 100).toFixed(2)}% of that water`]);
    }
    return r;
  };

  // ---------------- the dock: no white blob on the water within 15 m ----------------
  if (want('dock')) {
    set(16);
    const all = [];
    G.scene.traverse((o) => { if (!o.name.startsWith('moored-boats:') || !o.isInstancedMesh) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); if (m.elements[0] === 0 && m.elements[10] === 0) continue; p.setFromMatrixPosition(m); all.push({ x: p.x, y: p.y, z: p.z }); } });
    all.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
    const b = all.find((q) => !all.some((c) => c !== q && Math.hypot(c.x - q.x, c.z - q.z) < 25)) ?? all[0];
    const r = { blobs: [], whiteShare: 0 };
    if (b) {
      // (pick-shots' pose: a clear stand 13 m off the boat, 3.5 m up, looking at it)
      const clear = (t, ang, dist) => { const cx = t.x + Math.sin(ang) * dist, cz = t.z + Math.cos(ang) * dist; if (!G.walk || G.walk.blocked(cx, cz, 1.2) || G.walk.buildingAt(cx, cz) >= 0) return false; for (let k = 1; k < 8; k++) { const f = k / 10, x = cx + (t.x - cx) * f, z = cz + (t.z - cz) * f; if (G.walk.buildingAt(x, z) >= 0 || G.walk.blocked(x, z, 0.4)) return false; } return true; };
      let ang = 2.2, dist = 13;
      search: for (const dm of [1, 1.4, 0.75, 1.9]) for (let k = 0; k < 24; k++) { const a = 2.2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.27; if (clear(b, a, 13 * dm)) { ang = a; dist = 13 * dm; break search; } }
      const cx = b.x + Math.sin(ang) * dist, cz = b.z + Math.cos(ang) * dist, gnd = G.world.terrain.heightAt(cx, cz), eye = Math.max(gnd + 1.65, b.y + 3.5);
      G.walkParams.fly = eye - gnd > 1.8;
      G.walker.place(cx, cz, ang, -Math.atan2(eye - b.y - 1, dist));
      if (G.walkParams.fly) G.walker.y = eye;
      // the boat passing: 18 m out in the channel at 5 m/s, its wake laid over the frames before the shot
      const T0 = G.world.terrain, gx = T0.sdfAt(b.x + 3, b.z) - T0.sdfAt(b.x - 3, b.z), gz = T0.sdfAt(b.x, b.z + 3) - T0.sdfAt(b.x, b.z - 3), L = Math.hypot(gx, gz) || 1;
      const nx = -gx / L, nz = -gz / L, ax = -nz, az = nx;
      const Wk = G.wakes, up = Wk.update.bind(Wk), t0 = performance.now() / 1000;
      Wk.update = (t, list) => { const dt = performance.now() / 1000 - t0, along = -30 + dt * 5; return up(t, [...list, { id: 9001, x: b.x + nx * 18 + ax * along, z: b.z + nz * 18 + az * along, yaw: Math.atan2(-ax, -az), v: 5, y: 0, stern: 3.5, beam: 2.6 }]); };
      // the frame as it is; then each suspect turned down or off, to name what the white is: the wake's
      // foam at its whitest (uWakeMax), the water's glitter as it was before round 13 (uGlitterFine 0:
      // world-fixed dashes along z) and no glitter at all (uGlitter 0)
      const wm = Wk.mesh.material.uniforms?.uWakeMax, max0 = wm?.value;
      const wu = G.scene.getObjectByName('water')?.material?.uniforms, fine0 = wu?.uGlitterFine?.value, gl0 = wu?.uGlitter?.value;
      const restore = () => { if (wm) wm.value = max0; if (wu?.uGlitterFine) wu.uGlitterFine.value = fine0; if (wu?.uGlitter) wu.uGlitter.value = gl0; };
      const variants = [['as it is', () => {}]];
      if (wm) for (const v of opts.wakeMax ?? [0.35, 0]) variants.push([`the wake's foam at ${v}`, () => { wm.value = v; }]);
      if (wu?.uGlitterFine) variants.push(['the old glitter (world-fixed dashes)', () => { wu.uGlitterFine.value = 0; }]);
      if (wu?.uGlitter && opts.noGlitter !== false) variants.push(['no glitter', () => { wu.uGlitter.value = 0; }]);
      try {
        await wait(6000);
        for (const [name, apply] of variants) {
          restore(); apply();
          await frames(opts.settle ?? 40);
          const first = name === 'as it is';
          const m1 = measureDock(b, true, first ? '' : ` — ${name}`);
          if (first) Object.assign(r, m1);
          else (r.variants ??= {})[name] = { big: m1.big, whiteShare: m1.whiteShare, blobs: m1.blobs.slice(0, 4) };
        }
        r.pass = r.big === 0;
      } finally { Wk.update = up; restore(); }
    } else r.pass = false;
    out.dock = r;
    if (!r.pass) out.pass = false;
  }
  rt.dispose(); rt2.dispose(); depthMat.dispose(); idMat.dispose();
  G.walkParams.fly = false;
  const CW = 800, CH = Math.round((CW * H) / W), PAD = 22;
  const sh = document.createElement('canvas');
  sh.width = CW * Math.min(2, sheet.length || 1); sh.height = Math.ceil(sheet.length / 2) * (CH + PAD);
  const x = sh.getContext('2d');
  x.fillStyle = '#f5efe1'; x.fillRect(0, 0, sh.width, sh.height); x.font = '13px Georgia, serif'; x.fillStyle = '#3a3346';
  sheet.forEach(([c2, label], i) => { const px = (i % 2) * CW, py = Math.floor(i / 2) * (CH + PAD); x.drawImage(c2, px, py, CW, CH); x.fillText(label, px + 6, py + CH + 16); });
  if (sheet.length) { const blob = await new Promise((r2) => sh.toBlob(r2, 'image/jpeg', 0.88)); await fetch(`/__shot?name=${encodeURIComponent(`armcheck-${tag}.jpg`)}`, { method: 'POST', body: blob }); }
  out.sheet = `shots/armcheck-${tag}.jpg`;
  return out;
};
