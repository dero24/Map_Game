// Design-review capture set (in-page, no Playwright). Open `?capture=1&sketch=1`, then:
//   await import('/tools/review-shots.js'); await __REVIEW__('r1')
// Saves shots/review-<tag>-a.jpg, -b.jpg (6 frames each) and -c.jpg (4), 800 px wide, through the dev
// server's /__shot sink. The same poses every round so the reviewer compares like with like.
// Needs /tools/inpage-montage.js (loaded here) and a landscape viewport (1600×900).
await import('/tools/inpage-montage.js');

window.__REVIEW__ = async (tag = 'r', opts = {}) => {
  const G = window.__GAME__, T = G.THREE, m = new T.Matrix4(), p = new T.Vector3();
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  // a camera spot with a clear view of t: not inside or against a wall, no building in between
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
  // follow a moving person (life agents keep walking while the frame settles)
  let track = 0;
  const follow = (name, i, dist, h, ang) => {
    clearInterval(track);
    let mesh = null; G.scene.traverse((o) => { if (o.name === name) mesh = o; });
    if (!mesh) return;
    const at = () => { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); return { x: p.x, y: p.y, z: p.z }; };
    const t0 = at(); look(t0, dist, h, ang, 0.05);
    const a = G.walker.yaw;
    track = setInterval(() => { const t = at(); if (m.elements[0] === 0) return; const cx = t.x + Math.sin(a) * dist, cz = t.z + Math.cos(a) * dist; G.walker.place(cx, cz, a, -0.05); }, 50);
  };
  const ground = (x, z, yaw, pitch = -0.03) => {
    // step off anything solid: spiral out to the nearest spot with 2 m of room
    if (G.walk) for (let r = 0; r < 60 && G.walk.blocked(x, z, 2); r += 2) { const a = r * 1.3; x += Math.sin(a) * 2; z += Math.cos(a) * 2; }
    G.walkParams.fly = false; G.walker.place(x, z, yaw, pitch);
  };
  // stand at the edge of the nearest street, looking along it (street-level shots)
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
  const shot = (n) => () => window.__APPLY_SHOT__(n);
  const s = G.spawn;
  const [mbx, mbz] = G.world ? (() => { const o = G.world.json.origin; const K = (Math.PI / 180) * 6378137; return [(-73.9818 - o.lon) * K * Math.cos((o.lat * Math.PI) / 180), (o.lat - 40.3312) * K]; })() : [0, 0];
  const lawn = (() => { for (let r = 20; r < 300; r += 7) for (let a = 0; a < 6.28; a += 0.35) { const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r; if (G.world.terrain.coverAt(x, z) === 30) return { x, z, y: G.world.terrain.heightAt(x, z) }; } return { x: s.x, z: s.z, y: 0 }; })();
  const um = near('beach:umbrella', s.x, s.z), boat = near('moored-boats:', s.x, s.z), bed = near('garden:hydrangea', s.x, s.z);
  const set = (h, sk = true) => { G.setHour(h); G.timeParams.speed = 0; G.postParams.sketch = sk; };
  const A = [
    { label: '1 arrival: Ocean Ave, golden hour', fn: () => { shot('ocean-golden')(); set(18.3); } },
    { label: '2 Ocean Ave, morning', fn: () => { shot('ocean-morning')(); set(8.2); } },
    { label: '3 night street', fn: () => { shot('ocean-night')(); set(22); } },
    { label: '4 houses from the street', fn: () => { shot('houses')(); set(11); } },
    { label: '5 a raised shore house', fn: () => { shot('raised')(); set(15.5); } },
    { label: '6 inside a house', fn: () => { shot('inside')(); set(11); } },
  ];
  const B = [
    { label: '7 lawn / grass close-up', fn: () => { set(10.5); ground(lawn.x, lawn.z, 0.7, -0.12); } },
    { label: '8 the summer beach', fn: () => { set(13); if (um) look(um, 26, 6, 0.5); } },
    { label: '9 marina, moored boats', fn: () => { set(17); if (boat) look(boat, 24, 7, 4.4); } },
    { label: '10 a house-front garden', fn: () => { set(10); for (let k = 0; k < 12; k++) { const b = near('garden:', s.x, s.z, k); if (b && look(b, 6, 2.2, 2.4)) break; } } },
    { label: '11 Monmouth Beach street', fn: async () => { set(16.5); await G.stream.ensureAround(mbx, mbz); street(mbx, mbz, 0.25); await wait(800); } },
    { label: '12 from the air', fn: () => { shot('roofs')(); set(17.8); } },
  ];
  // Long Branch (outside the bake: streamed tiles) — lamps, ground paint and houses at night
  const [lbx, lbz] = (() => { const o = G.world.json.origin; const K = (Math.PI / 180) * 6378137; return [(-73.9868 - o.lon) * K * Math.cos((o.lat * Math.PI) / 180), (o.lat - 40.3043) * K]; })();
  const C = [
    { label: '13 streamed street at night (Long Branch)', fn: async () => { set(21.5); await G.stream.ensureAround(lbx, lbz); street(lbx, lbz, 0.2); await wait(1500); } },
    { label: '14 people on the street', fn: async () => {
      set(16);
      // life is player-centred: stand at spawn first so the street fills with walkers again
      ground(s.x, s.z, 0); await wait(3500);
      // the nearest walker on a street (not the beach), followed while the frame settles
      let mesh = null; G.scene.traverse((o) => { if (o.name === 'life-ped') mesh = o; });
      let bi = -1, bd = 1e9;
      if (mesh) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); if (m.elements[0] === 0) continue; p.setFromMatrixPosition(m); const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd && G.world.terrain.sdfAt(p.x, p.z) > 40 && G.world.terrain.oceanDistAt(p.x, p.z) > 90) { bd = d; bi = i; } }
      if (bi >= 0) follow('life-ped', bi, 5.5, 1.75, 1.2);
    } },
    { label: '15 street trees, close', fn: () => { set(9.5); const tr = near('trees:', s.x, s.z, 3); if (tr) look({ ...tr, y: tr.y + 3 }, 11, 2, 2.0, 0.1); } },
    { label: '16 the beach at eye level', fn: () => { set(12); if (um) ground(um.x + 9, um.z + 14, 0.55, -0.04); } },
  ];
  // every pose waits for the streamer to finish mounting (a pose far from the last one would
  // otherwise be shot before its buildings and trees arrive — r2 frame 12)
  const idle = async () => { for (let i = 0; i < 160; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b) return; await wait(250); } };
  for (const L of [A, B, C]) for (const it of L) { const f = it.fn; it.fn = async () => { clearInterval(track); await f(); await wait(400); await idle(); }; }
  const settle = opts.settle ?? 45;
  await window.__MONTAGE__(A, { settle, timers: true, cw: 800, cols: 2, save: `review-${tag}-a.jpg` });
  window.__MONTAGE_CLOSE__?.();
  await wait(300);
  await window.__MONTAGE__(B, { settle, timers: true, cw: 800, cols: 2, save: `review-${tag}-b.jpg` });
  window.__MONTAGE_CLOSE__?.();
  if (opts.only !== 'ab') {
    await wait(300);
    await window.__MONTAGE__(C, { settle, timers: true, cw: 800, cols: 2, save: `review-${tag}-c.jpg` });
    window.__MONTAGE_CLOSE__?.();
  }
  clearInterval(track);
  return `review-${tag}-a.jpg, review-${tag}-b.jpg, review-${tag}-c.jpg`;
};
