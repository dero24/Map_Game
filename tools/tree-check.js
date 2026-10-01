// The review's street tree close up, measured (reviewer round 11, must-fix 4: "trees at 5–10 m"),
// in-page on a `?capture=1` page:
//   await import('/tools/tree-check.js'); await __TREECHECK__('tag'[, { settle, dists }])
// Frame 15's tree (review-shots.js: the fourth-nearest tree to the spawn, framed from 5 m over its
// foot looking level at 3 m up, the camera bearing 2.0 rad from it) is shot at 5, 8 and 10 m and at
// the review's own 11 m, painted; then across the hand-over to the far crowns at 30 m — the near
// model alone, the far alone, and the two handing over — and from 40 m.
// Each close frame also gets a mask pass: only that tree's near model, drawn flat (leaves green,
// wood red) against a pure blue sky — and the far crown alone the same way ("before"). The masks
// are saved as shots/treecheck-<tag>-<name>-mask.png for tools/tree-metrics.py, which measures what
// the reviewer asked for: sky through the crown, the longest straight edge of its outline, the limbs
// entering it and the trunk's taper.
// Saves shots/treecheck-<tag>.jpg (the painted frames) and shots/treecheck-<tag>-masks.jpg.
await import('/tools/inpage-montage.js');

window.__TREECHECK__ = async (tag = 't', opts = {}) => {
  const G = window.__GAME__, T = G.THREE, m = new T.Matrix4(), p = new T.Vector3();
  window.__PUMP__();
  const wait = window.__WAIT__;
  const s = G.spawn, L = G.nearTrees;
  // the review's pick (review-shots.js `near('trees:', s.x, s.z, 3)`)
  const all = [];
  G.scene.traverse((o) => {
    if (!o.name.startsWith('trees:') || !o.isInstancedMesh) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      if (m.elements[0] === 0) continue;
      p.setFromMatrixPosition(m);
      all.push({ d: Math.hypot(p.x - s.x, p.z - s.z), x: p.x, y: p.y, z: p.z, n: o.name });
    }
  });
  all.sort((a, b) => a.d - b.d);
  const tr = all[Math.min(3, all.length - 1)];
  if (!tr) return 'no trees';
  const t = { ...tr, y: tr.y + 3 };
  // a spot `d` m off with a clear view of it (the review's look(), at exactly that distance)
  const clear = (ang, dist) => {
    const cx = t.x + Math.sin(ang) * dist, cz = t.z + Math.cos(ang) * dist;
    if (!G.walk || G.walk.blocked(cx, cz, 1.2) || G.walk.buildingAt(cx, cz) >= 0) return false;
    for (let k = 1; k < 8; k++) { const f = k / 10, x = cx + (t.x - cx) * f, z = cz + (t.z - cz) * f; if (G.walk.buildingAt(x, z) >= 0) return false; }
    return true;
  };
  const look = (dist, mode) => {
    L.mode = mode;
    let ang = 2.0;
    for (let k = 0; k < 24; k++) { const a = 2.0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.27; if (clear(a, dist)) { ang = a; break; } }
    const cx = t.x + Math.sin(ang) * dist, cz = t.z + Math.cos(ang) * dist;
    const g = G.world.terrain.heightAt(cx, cz);
    const eye = Math.max(g + 1.65, t.y + 2);
    G.walkParams.fly = eye - g > 1.8;
    G.walker.place(cx, cz, ang, -Math.atan2(eye - t.y - 1, dist) + 0.1);
    if (G.walkParams.fly) G.walker.y = eye;
    G.setHour(9.5); G.timeParams.speed = 0;
  };
  // the mask pass: the near layer alone (its mask mode: this tree only, flat), or the far crown
  // alone through a flat override (vertex white = leaves), into a target, saved as a PNG
  let farMat = null;
  const maskPass = async (name, far) => {
    const R = G.renderer, cam = G.camera, W = R.domElement.width, H = R.domElement.height;
    const rt = new T.WebGLRenderTarget(W, H, { depthBuffer: true });
    const world = G.scene.getObjectByName('world'), off = [];
    const hide = (o) => { if (o.visible) (off.push(o), (o.visible = false)); };
    for (const o of G.scene.children) if (o !== world) hide(o);
    world.traverse((o) => {
      if (o === world) return;
      if (far) { if ((o.isMesh || o.isPoints || o.isLine) && !(o.isInstancedMesh && o.name === tr.n)) hide(o); }
      else if (o.parent === world && o !== L.group) hide(o);
    });
    farMat ??= new T.ShaderMaterial({
      uniforms: { uS: { value: new T.Vector4() } },
      vertexShader: `attribute vec3 color; varying vec3 vC; varying vec3 vW;
        void main() { vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vC = color; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec4 uS; varying vec3 vC; varying vec3 vW;
        void main() { if (distance(vW.xz, uS.xy) > uS.w) discard; gl_FragColor = min(vC.r, min(vC.g, vC.b)) > 0.98 ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0); }`,
    });
    const bg = G.scene.background, fog = G.scene.fog, prev = R.getRenderTarget(), pc = R.getClearColor(new T.Color()), pa = R.getClearAlpha();
    const px = new Uint8Array(W * H * 4);
    try {
      G.scene.background = null; G.scene.fog = null;
      if (far) { G.scene.overrideMaterial = farMat; farMat.uniforms.uS.value.set(tr.x - G.U.uWorldOffset.value.x, tr.z - G.U.uWorldOffset.value.z, 0, 1.0); }
      else L.mask(true, tr.x, tr.z, 1.0);
      R.setRenderTarget(rt); R.setClearColor(0x0000ff, 1); R.clear();
      R.render(G.scene, cam);
      R.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally {
      L.mask(false);
      G.scene.overrideMaterial = null; G.scene.background = bg; G.scene.fog = fog;
      R.setRenderTarget(prev); R.setClearColor(pc, pa);
      for (const o of off) o.visible = true;
      rt.dispose();
    }
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d'), img = x.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // (rows from the top)
    x.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await fetch(`/__shot?name=${encodeURIComponent(`treecheck-${tag}-${name}-mask.png`)}`, { method: 'POST', body: blob });
    return c;
  };
  const masks = [];
  const settle = opts.settle ?? 10;
  const dists = opts.dists ?? [5, 8, 10];
  const items = [
    ...dists.map((d) => ({ label: `15 at ${d} m — near model`, fn: async () => { look(d, 0); await wait(400); }, after: async () => masks.push({ label: `${d} m mask`, c: await maskPass(`${d}m`, false) }) })),
    { label: '15 at 11 m (the review\'s framing)', fn: async () => { look(11, 0); await wait(400); } },
    { label: '15 at 8 m — far crowns only (before)', fn: async () => { look(8, 1); await wait(400); }, after: async () => masks.push({ label: '8 m far crown (before)', c: await maskPass('8m-far', true) }) },
    { label: '30 m — handing over', fn: async () => { look(30, 0); await wait(400); } },
    { label: '30 m — near model only', fn: async () => { look(30, 2); await wait(400); } },
    { label: '30 m — far crowns only', fn: async () => { look(30, 1); await wait(400); } },
    { label: '40 m — handing over', fn: async () => { look(40, 0); await wait(400); } },
  ];
  const out = await window.__MONTAGE__(items, { settle, timers: true, cw: 640, cols: 3, save: `treecheck-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  L.mode = 0;
  // the masks on a sheet of their own
  const CW = 480, CH = Math.round((CW * masks[0].c.height) / masks[0].c.width), PAD = 22;
  const sheet = document.createElement('canvas');
  sheet.width = CW * masks.length; sheet.height = CH + PAD;
  const cx = sheet.getContext('2d');
  cx.fillStyle = '#f5efe1'; cx.fillRect(0, 0, sheet.width, sheet.height);
  cx.font = '14px Georgia, serif'; cx.fillStyle = '#3a3346';
  masks.forEach((q, i) => { cx.drawImage(q.c, i * CW, 0, CW, CH); cx.fillText(q.label, i * CW + 8, CH + 16); });
  const blob = await new Promise((r) => sheet.toBlob(r, 'image/jpeg', 0.9));
  await fetch(`/__shot?name=${encodeURIComponent(`treecheck-${tag}-masks.jpg`)}`, { method: 'POST', body: blob });
  return { tree: { ...tr, kind: tr.n }, stats: { ...L.stats }, sheet: out };
};
