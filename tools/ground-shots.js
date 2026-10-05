// Ground frames (review round 12, must-fix 2): review poses 2, 10, 11, 16, 17 (tools/review-shots.js'
// posing) and merged-r12's m4, m6, m7 (the lead's cloud/merged.mjs). In-page, on `?capture=1`:
//   await import('/tools/ground-shots.js'); await __GROUNDSHOTS__('tag', 10)
// saves shots/ground-<tag>-a.jpg (the review frames at 800 px, two a row, as review-*.jpg), -b.jpg (the
// merged frames at 560 px, three a row) and each frame's PNG (ground-<tag>-<frame>.png) through the
// dev server's /__shot sink; `__GROUNDPOSE__(frame, settle)` poses and settles one frame for a driver
// that shoots the page itself. After each pose both paint windows repaint whole, so a short settle never
// shoots the old window (a jump past the fine window otherwise takes ~20 frames to paint in).
// (On SwiftShader, encoding a frame in the page takes minutes; a driver's page screenshot doesn't.)
await import('/tools/inpage-montage.js');

const setup = () => {
  const G = window.__GAME__, T = G.THREE, m = new T.Matrix4(), p = new T.Vector3();
  window.__PUMP__();
  const wait = window.__WAIT__;
  const near = (prefix, x, z, skip = 0) => {
    const all = [];
    G.scene.traverse((o) => {
      if (!o.name.startsWith(prefix) || !o.isInstancedMesh) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        if (m.elements[0] === 0) continue;
        p.setFromMatrixPosition(m);
        all.push({ d: Math.hypot(p.x - x, p.z - z), x: p.x, y: p.y, z: p.z, n: o.name });
      }
    });
    all.sort((a, b) => a.d - b.d);
    return all[Math.min(skip, all.length - 1)];
  };
  const clear = (t, ang, dist) => {
    const cx = t.x + Math.sin(ang) * dist, cz = t.z + Math.cos(ang) * dist;
    if (!G.walk || G.walk.blocked(cx, cz, 1.2) || G.walk.buildingAt(cx, cz) >= 0) return false;
    for (let k = 1; k < 8; k++) { const f = k / 10, x = cx + (t.x - cx) * f, z = cz + (t.z - cz) * f; if (G.walk.buildingAt(x, z) >= 0 || G.walk.blocked(x, z, 0.4)) return false; }
    return true;
  };
  const look = (t, dist0, h, ang0, pitchAdj = 0) => {
    let ang = ang0, dist = dist0, found = false;
    for (const dm of [1, 1.4, 0.75, 1.9]) {
      for (let k = 0; k < 24 && !found; k++) { const a = ang0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.27; if (clear(t, a, dist0 * dm)) { ang = a; dist = dist0 * dm; found = true; } }
      if (found) break;
    }
    const cx = t.x + Math.sin(ang) * dist, cz = t.z + Math.cos(ang) * dist;
    const g = G.world.terrain.heightAt(cx, cz);
    const eye = Math.max(g + 1.65, t.y + h);
    G.walkParams.fly = eye - g > 1.8;
    G.walker.place(cx, cz, ang, -Math.atan2(eye - t.y - 1, dist) + pitchAdj);
    if (G.walkParams.fly) G.walker.y = eye;
    return found;
  };
  const ground = (x, z, yaw, pitch = -0.03) => {
    if (G.walk) for (let r = 0; r < 60 && G.walk.blocked(x, z, 2); r += 2) { const a = r * 1.3; x += Math.sin(a) * 2; z += Math.cos(a) * 2; }
    G.walkParams.fly = false; G.walker.place(x, z, yaw, pitch);
  };
  const street = (x, z, h) => {
    let best = null;
    for (const r of [...(G.stream?.primRoads ?? []), ...G.world.json.roads]) {
      if (!r.w || r.lod || !['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street'].includes(r.c)) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0.2, Math.min(0.8, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(px - x, pz - z);
        if (L2 > 400 && (!best || d < best.d)) best = { d, px, pz, dx, dz, w: r.w };
      }
    }
    if (!best) return ground(x, z, 0);
    const L = Math.hypot(best.dx, best.dz), nx = -best.dz / L, nz = best.dx / L, off = best.w / 2 - 0.8;
    G.walkParams.fly = false;
    G.walker.place(best.px + nx * off, best.pz + nz * off, Math.atan2(best.dx, best.dz) + Math.PI + (h ?? 0), -0.02);
  };
  const s = G.spawn;
  const [mbx, mbz] = (() => { const o = G.world.json.origin; const K = (Math.PI / 180) * 6378137; return [(-73.9818 - o.lon) * K * Math.cos((o.lat * Math.PI) / 180), (o.lat - 40.3312) * K]; })();
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; };
  const walk = (x, z, yaw, pitch) => () => { set(14.5); G.walkParams.fly = false; G.walker.place(x, z, yaw, pitch); };
  const um = near('beach:umbrella', s.x, s.z) ?? near('beach:lifeguard', s.x, s.z);
  const frames = [
    { k: '2', fn: () => { window.__APPLY_SHOT__('ocean-morning'); set(8.2); } },
    { k: '10', fn: () => { set(10); for (let k = 0; k < 12; k++) { const b = near('garden:', s.x, s.z, k); if (b && look(b, 6, 2.2, 2.4)) break; } } },
    { k: '11', fn: async () => { set(16.5); await G.stream.ensureAround(mbx, mbz); street(mbx, mbz, 0.25); await wait(800); } },
    { k: '16', fn: () => { set(12); if (um) ground(um.x + 9, um.z + 14, 0.55, -0.04); } },
    { k: '17', fn: async () => { set(12.5); const t = near('terrace:', s.x, s.z); if (t) look({ ...t, y: t.y + 0.8 }, 7, 1.7, 0.9); await wait(800); } },
    { k: 'm4', fn: walk(110.5, -62, 0.12, -0.04) },
    { k: 'm6', fn: walk(282, -262, -2.6, -0.06) },
    { k: 'm7', fn: walk(52, 257, 1.52, 0.04) },
  ];
  const tick = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  return { G, wait, frames, tick };
};
window.__GROUNDSHOTS__ = async (tag = 'g', settle = 10) => {
  const { G, wait, frames, tick } = setup();
  const canvas = document.querySelector('canvas');
  const sheet = (cw, cols, n) => {
    const ch = Math.round((cw * canvas.height) / canvas.width), c = document.createElement('canvas');
    c.width = cols * cw; c.height = Math.ceil(n / cols) * (ch + 22);
    const g = c.getContext('2d');
    g.fillStyle = '#f5efe1'; g.fillRect(0, 0, c.width, c.height);
    g.font = '14px Georgia, serif'; g.fillStyle = '#3a3346';
    return { c, g, cw, ch, cols };
  };
  const A = sheet(800, 2, 5), B = sheet(560, 3, 3);
  const post = async (c, name, type, q) => {
    const blob = await new Promise((r) => c.toBlob(r, type, q));
    const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    if (!res.ok) throw new Error('shot sink refused: ' + res.status);
  };
  // warm-up: the first capture after a load can come back blank
  window.__APPLY_SHOT__('ocean-morning'); await tick(window.__WARM__ ?? 20);
  const log = [];
  const only = window.__ONLY__;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], t0 = performance.now();
    if (only && !only.includes(f.k)) continue;
    await f.fn();
    const t1 = performance.now();
    await wait(400);
    // the fine window whole, now, where the walker stands (a jump of 300 m otherwise shows the old
    // window for the ~20 frames its slices take); the mid window too unless told not to
    G.paint.detail.update(G.walker.x, G.walker.z, true);
    if (!window.__NOMID__) G.paint.mid.update(G.walker.x, G.walker.z, true);
    const t2 = performance.now();
    await tick(settle);
    console.log(`[ground] ${tag} ${f.k} pose ${Math.round(t1 - t0)} ms, windows ${Math.round(t2 - t1)} ms, settle ${Math.round(performance.now() - t2)} ms`);
    const S = i < 5 ? A : B, j = i < 5 ? i : i - 5, x = (j % S.cols) * S.cw, y = Math.floor(j / S.cols) * (S.ch + 22);
    S.g.drawImage(canvas, x, y, S.cw, S.ch);
    S.g.fillText(`${f.k}  (${G.walker.x.toFixed(1)}, ${G.walker.z.toFixed(1)}) yaw ${G.walker.yaw.toFixed(2)} pitch ${(G.walker.pitch ?? 0).toFixed(3)}`, x + 8, y + S.ch + 16);
    const full = document.createElement('canvas');
    full.width = canvas.width; full.height = canvas.height;
    full.getContext('2d').drawImage(canvas, 0, 0);
    await post(full, `ground-${tag}-${f.k}.png`, 'image/png');
    const cam = G.camera;
    log.push({ k: f.k, x: G.walker.x, z: G.walker.z, yaw: G.walker.yaw, pitch: G.walker.pitch, eye: cam.position.y - G.world.terrain.heightAt(G.walker.x, G.walker.z), fov: cam.fov, aspect: cam.aspect, w: canvas.width, h: canvas.height, ms: Math.round(performance.now() - t0) });
    console.log(`[ground] ${tag} ${f.k} done in ${Math.round(performance.now() - t0)} ms`);
  }
  await post(A.c, `ground-${tag}-a.jpg`, 'image/jpeg', 0.82);
  await post(B.c, `ground-${tag}-b.jpg`, 'image/jpeg', 0.82);
  return log;
};

// One frame posed and settled, for a driver that shoots the page itself (scratch/ground2.mjs).
let S = null;
window.__GROUNDPOSE__ = async (k, settle = 10) => {
  S ??= setup();
  const { G, wait, frames, tick } = S;
  if (!window.__WARMED__) { window.__WARMED__ = true; window.__APPLY_SHOT__('ocean-morning'); await tick(6); }
  const f = frames.find((q) => q.k === k), t0 = performance.now();
  await f.fn();
  const t1 = performance.now();
  await wait(400);
  G.paint.detail.update(G.walker.x, G.walker.z, true);
  G.paint.mid.update(G.walker.x, G.walker.z, true);
  const t2 = performance.now();
  await tick(settle);
  console.log(`[ground] ${k} pose ${Math.round(t1 - t0)} ms, windows ${Math.round(t2 - t1)} ms, settle ${Math.round(performance.now() - t2)} ms`);
  const cam = G.camera;
  return { k, x: G.walker.x, z: G.walker.z, yaw: G.walker.yaw, pitch: G.walker.pitch, eye: cam.position.y - G.world.terrain.heightAt(G.walker.x, G.walker.z), fov: cam.fov };
};
