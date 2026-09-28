// Place-parity capture (the streamed-parity harness): the same pose TYPES anywhere on Earth, chosen
// from the map itself — so a reviewer can put the game next to reference photos of a real place
// (Sea Bright's Ocean Ave, Tucson's 4th Avenue, a Manhattan avenue) and judge "does this feel like
// home?". No hand-placed cameras: every pose is found from roads, doors and footprints.
//
//   open  /?at=<lat>,<lon>&capture=1[&tiles=direct]   then
//   await import('/tools/place-shots.js'); await __PLACE__('tucson')
//
// Saves shots/place-<tag>.jpg (8 frames, 2 columns) through the dev server's /__shot sink.
await import('/tools/inpage-montage.js');

window.__PLACE__ = async (tag = 'place', opts = {}) => {
  const G = window.__GAME__, T = G.THREE;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const idle = async (max = 240) => { for (let i = 0; i < max; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b && !G.stream.worldPending) return; await wait(250); } };
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; G.postParams.sketch = true; };
  const { useOf } = await import('/src/world/uses.ts');
  const x0 = G.walker.x, z0 = G.walker.z;
  await idle();

  // ---- find the place's streets from the map ----
  const fps = [...G.stream.fpByKey.values()];
  const cen = (f) => { let x = 0, z = 0; for (const p of f.ring) (x += p[0]), (z += p[1]); return [x / f.ring.length, z / f.ring.length]; };
  const shops = fps.filter((f) => f.kind === 'commercial').map((f) => ({ f, c: cen(f), u: useOf(f.name, f.use) }));
  const homes = fps.filter((f) => f.kind === 'house').map((f) => ({ f, c: cen(f) }));
  const tallest = fps.reduce((b, f) => (!b || f.top - f.base > b.top - b.base ? f : b), null);
  const segs = [];
  for (const r of G.stream.primRoads) {
    if (!r.w || r.lod || !['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'trunk'].includes(r.c)) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az);
      if (L < 15 || Math.hypot((ax + bx) / 2 - x0, (az + bz) / 2 - z0) > 700) continue;
      segs.push({ ax, az, bx, bz, L, w: r.w, c: r.c, n: r.n });
    }
  }
  const near = (list, s, R) => {
    let n = 0;
    for (const o of list) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, t = Math.max(0, Math.min(1, ((o.c[0] - s.ax) * dx + (o.c[1] - s.az) * dz) / (s.L * s.L)));
      if (Math.hypot(s.ax + dx * t - o.c[0], s.az + dz * t - o.c[1]) < R) n++;
    }
    return n;
  };
  const best = (score) => segs.reduce((b, s) => { const v = score(s); return v > (b?.v ?? 0) ? { s, v } : b; }, null)?.s;
  const main = best((s) => near(shops, s, s.w / 2 + 28) / Math.max(1, s.L / 40));
  const resi = best((s) => (s.c === 'residential' ? near(homes, s, s.w / 2 + 22) / Math.max(1, s.L / 40) : 0));
  // stand at the kerb of a segment, looking along it (or `turn` toward the buildings)
  const kerb = (s, side = 1, turn = 0, back = 0) => {
    const dx = (s.bx - s.ax) / s.L, dz = (s.bz - s.az) / s.L, nx = -dz * side, nz = dx * side, off = s.w / 2 + 1.0;
    const px = s.ax + dx * back, pz = s.az + dz * back;
    G.walkParams.fly = false;
    G.walker.place(px + nx * off, pz + nz * off, Math.atan2(-dx, -dz) + turn * side, -0.03);
  };
  const lookAt = (tx, tz, ty, fromX, fromZ, eye) => {
    const g = G.world.terrain.heightAt(fromX, fromZ);
    G.walkParams.fly = eye - g > 2;
    G.walker.place(fromX, fromZ, Math.atan2(fromX - tx, fromZ - tz), -Math.atan2(eye - ty, Math.hypot(tx - fromX, tz - fromZ)));
    if (G.walkParams.fly) G.walker.y = eye;
  };
  const interior = async (want) => {
    let bp = null, bd = Infinity;
    for (const P of G.plans.values()) {
      const f = G.stream.fpByKey.get(P.fp);
      if (!f || f.kind !== 'commercial' || !want.includes(useOf(f.name, f.use))) continue;
      const d = Math.hypot(P.door.x - x0, P.door.z - z0);
      if (d < bd) (bd = d), (bp = P);
    }
    if (!bp) return false;
    const d = bp.door;
    for (let k = 0; k < 2; k++) {
      G.walker.place(d.wx - d.nx * 2.6, d.wz - d.nz * 2.6, Math.atan2(d.nx, d.nz) + 0.35, -0.12, d.y);
      for (let i = 0; i < 8; i++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
      G.interiors.flush?.();
    }
    await wait(2500);
    return G.stream.fpByKey.get(bp.fp)?.name ?? true;
  };

  const lbl = (s) => (s?.n ? ` (${s.n})` : '');
  const F = [
    { label: `1 main street, morning${lbl(main)}`, fn: async () => { set(9.5); if (main) kerb(main, 1, 0); await wait(1200); } },
    { label: `2 main street, looking at the shops${lbl(main)}`, fn: async () => { set(12.5); if (main) kerb(main, -1, 0.9, main.L * 0.5); await wait(1200); } },
    { label: `3 main street at golden hour${lbl(main)}`, fn: async () => { set(18.6); if (main) kerb(main, -1, Math.PI); await wait(1200); } },
    { label: `4 main street at night${lbl(main)}`, fn: async () => { set(21.5); if (main) kerb(main, 1, 0.15); await wait(1200); } },
    { label: `5 a residential street${lbl(resi)}`, fn: async () => { set(10.5); if (resi) kerb(resi, 1, 0.3); await wait(1200); } },
    { label: '6 from the air', fn: async () => { set(15); const s = main ?? resi; if (s) lookAt((s.ax + s.bx) / 2, (s.az + s.bz) / 2, 0, (s.ax + s.bx) / 2 + 110, (s.az + s.bz) / 2 + 110, 120); await wait(1500); } },
    { label: `7 the tallest building (${tallest ? Math.round(tallest.top - tallest.base) + ' m' : '—'})`, fn: async () => { set(14); if (tallest) { const [cx, cz] = cen(tallest); lookAt(cx, cz, tallest.base + (tallest.top - tallest.base) * 0.6, cx + 90, cz + 70, tallest.base + 1.7); } await wait(1500); } },
    { label: '8 inside a café / restaurant', fn: async () => { set(13); const r = await interior(['cafe', 'restaurant', 'bar']); if (typeof r === 'string') F[7].label = `8 inside ${r}`; } },
  ];
  for (const it of F) { const f = it.fn; it.fn = async () => { await f(); await wait(400); await idle(40); }; }
  // warm-up: the first capture after load can come back blank — pose frame 1 and throw one away
  await F[0].fn(); await wait(3000);
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 20, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 45, timers: true, cw: 800, cols: 2, save: `place-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  return { res, main: main && { n: main.n, c: main.c, w: main.w, shops: near(shops, main, main.w / 2 + 28) }, resi: resi?.n, tallest: tallest && Math.round(tallest.top - tallest.base), shops: shops.length, homes: homes.length };
};
