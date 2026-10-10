// The van's checks, in the page (docs/agent/gameplay.md "The van"; docs/agent/debugging.md).
// On a `?capture=1&poc=1` page: `await import('/tools/van-check.js'); await __VANCHECK__()` →
//   seam: standing in the doorway's band (where either way of drawing the van may be the one on
//         screen), the frame drawn out and drawn in, looking in, out, sideways, up and down — each
//         pair's difference beside the same view drawn twice a few frames apart (the world's own
//         motion: leaves, grass, water). Seamless: no pair differs more than the world does by itself.
//   walk: from where you wake (standing by the bed) to the doorway and four metres out behind the
//         van, keys held — you cross the room, step down out of the doorway; in → out exactly once,
//         no jump in the eye's height over 6 cm a frame from the first step, the town's bloom armed
//         once you're out.
// (tools/capture.mjs --eval runs it too; it needs the dev server's /tools/ path.)
window.__VANCHECK__ = async () => {
  const G = window.__GAME__, V = G?.van;
  if (!V) return { error: 'no van: open the page with ?poc=1' };
  const L = V.layout, W = G.walker;
  const frames = (n) => new Promise((r) => { let i = 0; const t = () => (++i >= n ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const toW = (lx, lz) => { const p = V.pose, c = Math.cos(p.yaw), s = Math.sin(p.yaw); return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]; };
  const toL = (x, z) => { const p = V.pose, c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = x - p.x, dz = z - p.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const cv = G.renderer.domElement, gl = G.renderer.getContext();
  const grab = () => { const w = cv.width, h = cv.height, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const diff = (a, b) => { let s = 0, big = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); s += d; if (d > 60) big++; } return { mean: +(s / (a.length / 4) / 3).toFixed(2), big: +(big / (a.length / 4)).toFixed(4) }; };

  // ---- seam
  window.__APPLY_SHOT__('van-near');
  await frames(30);
  const seam = [];
  const depth = (L.enter + L.leave) / 2;
  const [x, z] = toW(0.1, L.door.z - depth);
  for (const [view, lyaw, pitch] of [['in', 0, -0.05], ['out', Math.PI, -0.05], ['side', Math.PI / 2, 0], ['up', 0, 0.6], ['down-out', Math.PI, -0.7]]) {
    W.space = null;
    W.place(x, z, lyaw + V.pose.yaw, pitch, V.pose.y + L.floor);
    V.mode = 'out'; await frames(4); const a = grab();
    await frames(8); const a2 = grab();
    V.mode = 'in'; await frames(4); const b = grab();
    const world = diff(a, a2), modes = diff(a2, b);
    seam.push({ view, modes, world, ok: modes.mean <= world.mean + 0.15 && modes.big <= world.big + 0.002 });
  }

  // ---- walk
  window.__APPLY_SHOT__('van-wake');
  await frames(10);
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const route = [[0.2, L.room.z1 - 1.2], [0.05, L.door.z - 0.1], [0, L.door.z + 1.2], [0, L.door.z + 4]];
  key('KeyW', true);
  let wi = 0, prevY = W.y, maxDy = 0;
  const modes = [V.mode];
  try {
    for (let f = 0; f < 900 && wi < route.length; f++) {
      const [tx, tz] = toW(route[wi][0], route[wi][1]);
      W.yaw = Math.atan2(-(tx - W.x), -(tz - W.z));
      await frames(1);
      if (V.mode !== modes[modes.length - 1]) modes.push(V.mode);
      if (f > 0) maxDy = Math.max(maxDy, Math.abs(W.y - prevY)); // (from the first step: you wake standing)
      prevY = W.y;
      if (Math.hypot(tx - W.x, tz - W.z) < 0.25) wi++;
    }
  } finally { key('KeyW', false); }
  const [ex, ez] = toL(W.x, W.z);
  const walk = { reached: `${wi}/${route.length}`, end: [+ex.toFixed(2), +ez.toFixed(2)], modes: modes.join('→'), maxDy: +maxDy.toFixed(3), bloom: !!(G.sight?.armed || G.sight?.held > 0) };
  walk.ok = wi === route.length && walk.modes === 'in→out' && maxDy < 0.06 && walk.bloom;
  return { ok: seam.every((s) => s.ok) && walk.ok, seam, walk };
};
