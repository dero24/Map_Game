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
  window.__PUMP__(); // frames even in a hidden pane (inpage-montage.js)
  const wait = window.__WAIT__; // pumped, so hidden-pane timer throttling can't stretch it
  const idle = async (max = 240) => { for (let i = 0; i < max; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b && !G.stream.worldPending) return; await wait(250); } };
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; G.postParams.sketch = true; };
  const { useOf } = await import('/src/world/uses.ts');
  const x0 = G.walker.x, z0 = G.walker.z;
  // real map first: wait (up to realWait s) until no synth placeholder is left within 800 m
  const synthNear = () => [...G.stream.loaded.entries()].filter(([k, a]) => k[0] === 's' && Math.hypot(Math.max(a.spec.box.x0 - x0, 0, x0 - a.spec.box.x1), Math.max(a.spec.box.z0 - z0, 0, z0 - a.spec.box.z1)) < 800).length;
  for (let i = 0; i < (opts.realWait ?? 300) && synthNear(); i++) await wait(1000);
  await idle();

  // ---- find the place's streets from the map ----
  const fps = [...G.stream.fpByKey.entries()].filter(([k]) => k[0] !== 's').map(([, f]) => f); // placeholders aren't the place
  const cen = (f) => { let x = 0, z = 0; for (const p of f.ring) (x += p[0]), (z += p[1]); return [x / f.ring.length, z / f.ring.length]; };
  const shops = fps.filter((f) => f.kind === 'commercial').map((f) => ({ f, c: cen(f), u: useOf(f.name, f.use) }));
  const homes = fps.filter((f) => f.kind === 'house').map((f) => ({ f, c: cen(f) }));
  const tallest = fps.reduce((b, f) => (!b || f.top - f.base > b.top - b.base ? f : b), null);
  const segs = [];
  for (const r of G.stream.primRoads) {
    if (!r.w || r.lod || r.n?.startsWith('synth') || !['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'trunk'].includes(r.c)) continue;
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
  // opts.main / opts.resi pin a round's poses to named streets (so rounds compare like for like);
  // otherwise the busiest shop street and the most-lived-on residential street nearby
  const named = (n) => (s) => (n && s.n === n ? 1 : 0);
  const main = (opts.main && best((s) => named(opts.main)(s) * (1 + near(shops, s, s.w / 2 + 28)) / Math.max(1, s.L / 40))) || best((s) => near(shops, s, s.w / 2 + 28) / Math.max(1, s.L / 40));
  const resi = (opts.resi && best((s) => named(opts.resi)(s) * (1 + near(homes, s, s.w / 2 + 22)) / Math.max(1, s.L / 40))) || best((s) => (s.c === 'residential' ? near(homes, s, s.w / 2 + 22) / Math.max(1, s.L / 40) : 0));
  // stand at the kerb of a segment, looking along it (or `turn` toward the buildings)
  const kerb = (s, side = 1, turn = 0, back = 0) => {
    // mid-sidewalk (2 m behind the kerb line): a row of parked cars at the kerb stays in front of
    // the lens, not in it
    const dx = (s.bx - s.ax) / s.L, dz = (s.bz - s.az) / s.L, nx = -dz * side, nz = dx * side;
    const yaw = Math.atan2(-dx, -dz) + turn * side, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // step along the kerb (and across the sidewalk) until nothing — a pole, a mast, a parked car —
    // stands at the lens or just in front of it
    let best = null;
    for (let k = 0; k < 16 && !best; k++)
      for (const o of [2.0, 1.2, 2.8]) {
        const x = s.ax + dx * (back + k * 2.5) + nx * (s.w / 2 + o), z = s.az + dz * (back + k * 2.5) + nz * (s.w / 2 + o);
        if (!G.walk.blocked(x, z, 1.0) && !G.walk.blocked(x + fx * 3, z + fz * 3, 1.0)) { best = [x, z]; break; } // 3 m clear in front of the lens
      }
    best ??= [s.ax + dx * back + nx * (s.w / 2 + 2.0), s.az + dz * back + nz * (s.w / 2 + 2.0)];
    G.walkParams.fly = false;
    G.walker.place(best[0], best[1], yaw, -0.03);
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
    G.walkParams.fly = false;
    // two and a half steps in, facing the middle of the room (not whatever stands beside the door)
    const ring = G.stream.fpByKey.get(bp.fp)?.ring ?? [];
    let cx = 0, cz = 0;
    for (const [x, z] of ring) (cx += x / ring.length), (cz += z / ring.length);
    const ix = d.wx - d.nx * 2.6, iz = d.wz - d.nz * 2.6;
    const yaw = ring.length && Math.hypot(cx - ix, cz - iz) > 1 ? Math.atan2(-(cx - ix), -(cz - iz)) : Math.atan2(d.nx, d.nz) + 0.35;
    for (let k = 0; k < 2; k++) {
      G.walker.place(ix, iz, yaw, -0.12, d.y);
      for (let i = 0; i < 8; i++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
      G.interiors.flush?.();
    }
    await wait(2500);
    return G.stream.fpByKey.get(bp.fp)?.name ?? true;
  };

  // the direction the far terrain (world/horizon.ts) rises highest over the eye: the place's mountains
  const skyline = () => {
    // stand above the local roofs (in a canyon the street sees only walls)
    let roofs = 0;
    for (const f of fps) { const [cx, cz] = cen(f); if (Math.hypot(cx - x0, cz - z0) < 250) roofs = Math.max(roofs, f.top); }
    const eye = Math.max(G.world.terrain.heightAt(x0, z0) + 35, roofs + 8);
    const ring = G.scene.getObjectByName('horizon:ring');
    if (!ring) return { yaw: 0, pitch: 0.02, eye, what: 'no horizon ring' };
    const p = ring.geometry.attributes.position, best = { a: -1, yaw: 0, peak: 0, d: 0 };
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - x0, dz = p.getZ(i) - z0, d = Math.hypot(dx, dz);
      if (d < 7000) continue;
      const a = (p.getY(i) - eye) / d;
      if (a > best.a) Object.assign(best, { a, yaw: Math.atan2(dx, dz), peak: p.getY(i), d });
    }
    return { yaw: best.yaw, pitch: Math.max(0.02, Math.atan(best.a) * 0.6), eye, what: `${Math.round(best.peak)} m, ${Math.round(best.d / 1000)} km away` };
  };
  // stand where the whole tower shows: the open ground (16 bearings, 3 distances) whose sight
  // line to the tower runs furthest before any other building gets in the way
  const tallPose = (f) => {
    const [cx, cz] = cen(f), H = f.top - f.base;
    let best = { x: cx + 90, z: cz + 70, score: -1 };
    for (let a = 0; a < 16; a++) for (const D of [Math.max(60, H * 0.7), Math.max(90, H), 45]) {
      const ang = (a / 16) * Math.PI * 2, x = cx + Math.sin(ang) * D, z = cz + Math.cos(ang) * D;
      if (G.walk.blocked(x, z, 1)) continue;
      let t = 0;
      while (t < 1 && !G.walk.blocked(x + (cx - x) * t, z + (cz - z) * t, 0.4)) t += 0.02;
      const inTower = (() => { const px = x + (cx - x) * t, pz = z + (cz - z) * t; let c = false; const r = f.ring; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > pz !== r[j][1] > pz && px < ((r[j][0] - r[i][0]) * (pz - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; })();
      const score = inTower ? 1 + t : t; // the sight line reaching the tower itself wins
      if (score > best.score) best = { x, z, score };
    }
    return best;
  };
  // this place's golden hour today (the game's own sun, not a fixed clock time)
  const goldenHour = async () => {
    let best = 18.6, bv = -1;
    for (let h = 15.5; h <= 20.5; h += 0.25) { set(h); await wait(150); const e = G.ctx.env(); const v = e.golden * (1 - e.night); if (v > bv) (bv = v), (best = h); }
    return best;
  };
  const lbl = (s) => (s?.n ? ` (${s.n})` : '');
  const F = [
    { label: `1 main street, morning${lbl(main)}`, fn: async () => { set(9.5); if (main) kerb(main, 1, 0); await wait(1200); } },
    { label: `2 main street, looking at the shops${lbl(main)}`, fn: async () => { set(12.5); if (main) kerb(main, -1, 0.9, main.L * 0.5); await wait(1200); } },
    { label: `3 main street at golden hour${lbl(main)}`, fn: async () => { set(await goldenHour()); if (main) kerb(main, -1, Math.PI); await wait(1200); } },
    { label: `4 main street at night${lbl(main)}`, fn: async () => { set(21.5); if (main) kerb(main, 1, 0.15); await wait(1200); } },
    { label: `5 a residential street${lbl(resi)}`, fn: async () => { set(10.5); if (resi) kerb(resi, 1, 0.3); await wait(1200); } },
    { label: '6 from the air', fn: async () => {
      set(15);
      const s = main ?? resi;
      if (s) {
        // above every roof between the lens and the street (in Midtown 120 m is inside a tower)
        const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2, g = G.world.terrain.heightAt(mx, mz);
        let roof = g;
        for (const f of fps) { const [cx, cz] = cen(f); for (let t = 0; t <= 1; t += 0.25) if (Math.hypot(cx - (mx + 110 * t), cz - (mz + 110 * t)) < 60) roof = Math.max(roof, f.top); }
        lookAt(mx, mz, g, mx + 110, mz + 110, Math.max(g + 120, roof + 30));
      }
      await wait(1500);
    } },
    { label: `7 the tallest building (${tallest ? Math.round(tallest.top - tallest.base) + ' m' : '—'})`, fn: async () => { set(14); if (tallest) { const [cx, cz] = cen(tallest), P = tallPose(tallest); lookAt(cx, cz, tallest.base + (tallest.top - tallest.base) * 0.55, P.x, P.z, G.world.terrain.heightAt(P.x, P.z) + 1.7); } await wait(1500); } },
    { label: '8 the horizon', fn: async () => { set(16.5); const h = skyline(); lookAt(x0 + Math.sin(h.yaw) * 1000, z0 + Math.cos(h.yaw) * 1000, h.eye + Math.tan(h.pitch) * 1000, x0, z0, h.eye); F[7].label = `8 the horizon (${h.what})`; await wait(1500); } },
    { label: '9 inside a café / restaurant', fn: async () => { set(13); const r = await interior(['cafe', 'restaurant', 'bar']); if (typeof r === 'string') F[8].label = `9 inside ${r}`; } },
  ];
  // Look comparison: opts.looks = ['watercolor', 'fine detail', …] renders opts.frames (default: the
  // morning street, golden hour and the horizon) once per look, a row per look, to
  // shots/looks-<tag>.jpg — the defaults are chosen side by side on real places, not by eye alone
  if (opts.looks) {
    const { LOOKS, postParams } = await import('/src/render/post.ts');
    const keep = { ...postParams };
    const pick = opts.frames ?? [0, 2, 7];
    const L = [];
    for (const k of opts.looks)
      for (const i of pick) {
        const f = F[i];
        L.push({ label: `${k} — ${f.label}`, fn: async () => { Object.assign(postParams, keep, LOOKS[k] ?? {}); dispatchEvent(new Event('resize')); await f.fn(); await wait(400); await idle(40); } });
      }
    await F[pick[0]].fn(); await wait(2000);
    await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 20, timers: true, cw: 200, cols: 1 });
    window.__MONTAGE_CLOSE__?.();
    const res = await window.__MONTAGE__(L, { settle: opts.settle ?? 40, timers: true, cw: opts.cw ?? 640, cols: pick.length, save: `looks-${tag}.jpg` });
    window.__MONTAGE_CLOSE__?.();
    Object.assign(postParams, keep);
    dispatchEvent(new Event('resize'));
    return { res, looks: opts.looks, frames: pick.map((i) => F[i].label) };
  }
  const poses = [];
  for (const it of F) { const f = it.fn; it.fn = async () => { await f(); await wait(400); await idle(40); poses.push({ f: it.label.slice(0, 18), x: Math.round(G.walker.x), z: Math.round(G.walker.z), y: Math.round(G.walker.y), fly: G.walkParams.fly }); }; }
  // warm-up: the first capture after load can come back blank — pose frame 1 and throw one away
  await F[0].fn(); await wait(3000);
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 20, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 45, timers: true, cw: 800, cols: 2, save: `place-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  return { res, poses, main: main && { n: main.n, c: main.c, w: main.w, shops: near(shops, main, main.w / 2 + 28) }, resi: resi?.n, tallest: tallest && Math.round(tallest.top - tallest.base), shops: shops.length, homes: homes.length };
};
