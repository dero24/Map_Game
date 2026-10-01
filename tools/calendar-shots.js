// The shore's calendar, shot and counted (in-page, like review-shots.js). Open `?capture=1&date=…`
// then:  await import('/tools/calendar-shots.js'); await __CALENDAR__('tag', { set: 'autumn' | 'summer' })
// Saves shots/calendar-<tag>-<set>.jpg and returns the counts the round-10 review asked for:
//   autumn (1 October): 9 re-shot (boats in frame, each ≥ 0.1% of it), 12 re-shot at 17:48 (the beach
//   lot's fill), a riverfront house's dock;
//   summer (15 July): micro-compare's 50 m pose at 13:00 (people and umbrellas in frame), a lifeguard
//   on duty, the umbrellas close to, the kids at the waterline, the beach lot at 13:00, the marina.
await import('/tools/inpage-montage.js');

window.__CALENDAR__ = async (tag = 'c', opts = {}) => {
  const G = window.__GAME__, T = G.THREE, m = new T.Matrix4(), p = new T.Vector3();
  window.__PUMP__();
  const wait = window.__WAIT__;
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; };
  const s = G.spawn, out = {};
  const instances = (prefix) => {
    const all = [];
    G.scene.traverse((o) => {
      if (!o.name.startsWith(prefix) || !o.isInstancedMesh) return;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); if (m.elements[0] === 0 && m.elements[10] === 0) continue; p.setFromMatrixPosition(m); all.push({ x: p.x, y: p.y, z: p.z, n: o.name, yaw: Math.atan2(m.elements[8], m.elements[10]) }); }
    });
    return all;
  };
  const nearest = (list, x, z) => list.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  // review-shots.js' look(): a clear spot `dist` m from t at `ang`, `h` m over it, looking at it
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
  };
  // what's in the frame: projected into the camera, in front of it
  const W = innerWidth, H = innerHeight;
  const inFrame = (x, y, z) => { p.set(x - G.U.uWorldOffset.value.x, y - G.U.uWorldOffset.value.y, z - G.U.uWorldOffset.value.z).project(G.camera); return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1; };
  /** A box's share of the frame (its eight corners' screen rectangle, clipped). */
  const share = (x, y, z, yaw, L, B, Ht) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (const u of [-B / 2, B / 2]) for (const v of [-L / 2, L / 2]) for (const yy of [y - 0.3, y + Ht]) {
      p.set(x + u * c + v * sn - G.U.uWorldOffset.value.x, yy - G.U.uWorldOffset.value.y, z - u * sn + v * c - G.U.uWorldOffset.value.z).project(G.camera);
      if (p.z >= 1) behind = true;
      (x0 = Math.min(x0, p.x)), (x1 = Math.max(x1, p.x)), (y0 = Math.min(y0, p.y)), (y1 = Math.max(y1, p.y));
    }
    if (behind) return 0;
    const w = Math.max(0, Math.min(1, x1) - Math.max(-1, x0)), h = Math.max(0, Math.min(1, y1) - Math.max(-1, y0));
    return (w * h) / 4;
  };
  const BOAT = { skiff: [5, 1.9, 1.2], console: [7.2, 2.5, 2.2], cabin: [10.5, 3.4, 3.2], sail: [9.5, 3, 4], pontoon: [7.5, 2.6, 1.8], lobster: [11, 3.6, 3.2] };
  const boatsInFrame = () => {
    const shares = instances('moored-boats:').map((b) => { const d = BOAT[b.n.split(':')[1]] ?? [6, 2.4, 1.6]; return share(b.x, b.y, b.z, b.yaw, d[0], d[1], d[2]); }).filter((v) => v > 0);
    // (a hull's box on screen: its rectangle over-counts a boat's pixels, so the ≥ 0.2% count is the
    // safe reading of "each ≥ 0.1% of the frame")
    return { inFrame: shares.length, over01: shares.filter((v) => v >= 0.001).length, over02: shares.filter((v) => v >= 0.002).length };
  };
  // the marina: the moored boat nearest the start with eight others within 45 m (review-shots.js 9)
  const marinaBoat = () => {
    const all = instances('moored-boats:').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
    return all.find((b) => all.filter((c) => Math.hypot(c.x - b.x, c.z - b.z) < 45).length >= 9) ?? all[0];
  };
  // a house's dock: the nearest boat with no other within 25 m
  const dockBoat = () => {
    const all = instances('moored-boats:').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
    return all.find((b) => !all.some((c) => c !== b && Math.hypot(c.x - b.x, c.z - b.z) < 25)) ?? all[0];
  };
  // the beach lot: the biggest parking lot within 400 m of the start with a beach within 150 m
  const { lotLayout } = await import('/src/world/lots.ts');
  const { parkedAt, KERB_STRIDE } = await import('/src/world/kerbCars.ts');
  const un = (f) => { const o = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
  const inRing = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
  const beachLot = () => {
    let best = null;
    for (const t of G.stream.loaded.values())
      for (const a of t.areas ?? []) {
        if (a.c !== 'parking' || !a.o?.[0]) continue;
        const ring = un(a.o[0]), cx = ring.reduce((q, v) => q + v[0], 0) / ring.length, cz = ring.reduce((q, v) => q + v[1], 0) / ring.length;
        if (Math.hypot(cx - s.x, cz - s.z) > 400 || G.world.terrain.oceanDistAt(cx, cz) > 250) continue;
        const L = lotLayout(ring, 600);
        if (L && (!best || L.stalls.length > best.stalls)) best = { ring, stalls: L.stalls.length, cx, cz };
      }
    return best;
  };
  const lotFill = (lot, hour) => {
    let n = 0;
    for (const t of G.stream.loaded.values()) { const d = t.kerb; if (d) for (let i = 0; i + KERB_STRIDE <= d.length; i += KERB_STRIDE) if (inRing(d[i], d[i + 2], lot.ring) && parkedAt(d, i, hour)) n++; }
    return { cars: n, stalls: lot.stalls, fill: +(n / lot.stalls).toFixed(3) };
  };
  // the beach's people and umbrellas in frame
  const crowdInFrame = () => {
    let people = 0, umbrellas = 0;
    for (const q of G.crowd.people()) if (Math.hypot(q.x - G.walker.x, q.z - G.walker.z) < 450 && inFrame(q.x, q.y + 0.6, q.z)) people++;
    for (const t of G.stream.loaded.values()) {
      const d = t.micro;
      if (d) for (let i = 0; i + 8 <= d.length; i += 8) if (d[i + 4] === UMB && Math.hypot(d[i] - G.walker.x, d[i + 2] - G.walker.z) < 450 && inFrame(d[i], d[i + 1] + 1.6, d[i + 2])) umbrellas++;
    }
    for (const u of instances('beach:umbrella')) if (Math.hypot(u.x - G.walker.x, u.z - G.walker.z) < 450 && inFrame(u.x, u.y + 1.6, u.z)) umbrellas++;
    return { people, umbrellas, ratio: +(people / Math.max(1, umbrellas)).toFixed(2) };
  };
  const { MICRO_INDEX } = await import('/src/assets/micro.ts');
  const UMB = MICRO_INDEX.umbrella;
  const stand = () => nearest(instances('beach:lifeguard'), s.x, s.z);
  const seaDir = (x, z) => { const t = G.world.terrain, gx = t.oceanDistAt(x - 6, z) - t.oceanDistAt(x + 6, z), gz = t.oceanDistAt(x, z - 6) - t.oceanDistAt(x, z + 6), L = Math.hypot(gx, gz) || 1; return [gx / L, gz / L]; };
  const lens = (f) => { G.walkParams.fov = f; };
  const note = (k, v) => { out[k] = v; console.log(`[calendar] ${k}: ${JSON.stringify(v)}`); };

  const autumn = [
    { label: '9 marina, moored boats, 17:00', fn: () => { lens(62); set(17); const b = marinaBoat(); if (b) look(b, 24, 7, 4.4); }, after: () => note('9 boats', boatsInFrame()) },
    { label: '12 from the air, 17:48', fn: () => { lens(62); window.__APPLY_SHOT__('roofs'); set(17.8); }, after: () => { const lot = beachLot(); if (lot) note('12 beach lot', lotFill(lot, 17.8)); } },
    { label: 'a riverfront house\'s dock, 16:00', fn: () => { lens(62); set(16); const b = dockBoat(); if (b) look(b, 13, 3.5, 2.2); } },
    { label: 'the beach lot from the ground, 17:48', fn: () => { lens(62); set(17.8); const lot = beachLot(); if (lot) { G.walkParams.fly = false; G.walker.place(lot.cx + 30, lot.cz + 50, Math.atan2(30, 50), -0.04); } } },
  ];
  const summer = [
    { label: 'the beach at ~50 m, 12° lens, 13:00', fn: () => {
      set(13); const st = stand(); if (!st) return;
      const [sx, sz] = seaDir(st.x, st.z), ax = -sz, az = sx; // (along the beach)
      const x = st.x - sx * 2 + ax * 2.2, z = st.z - sz * 2 + az * 2.2;
      G.walkParams.fly = false; G.walker.place(x, z, Math.atan2(-(ax + sx * 0.15), -(az + sz * 0.15)), -0.035); lens(12);
    }, after: () => note('50 m pose', crowdInFrame()) },
    { label: 'a lifeguard on duty, 12:00', fn: () => { lens(62); set(12); const st = stand(); if (st) { const [sx, sz] = seaDir(st.x, st.z); look({ ...st, y: st.y + 2.6 }, 7, 0.4, Math.atan2(sx, sz) + 0.5, 0.05); } } },
    { label: 'under the umbrellas, 13:00', fn: () => { lens(62); set(13); const t = stand(); if (t) { const [sx, sz] = seaDir(t.x, t.z); G.walkParams.fly = false; G.walker.place(t.x - sx * 9 + sz * 14, t.z - sz * 9 - sx * 14, Math.atan2(-(sx - sz * 0.6), -(sz + sx * 0.6)), -0.1); } } },
    { label: 'kids at the waterline, 13:00', fn: () => {
      lens(62); set(13); let best = null;
      for (const q of G.crowd.people()) if (q.pose === 4 && (!best || Math.hypot(q.x - s.x, q.z - s.z) < Math.hypot(best.x - s.x, best.z - s.z))) best = q;
      if (best) { const [sx, sz] = seaDir(best.x, best.z); G.walkParams.fly = false; G.walker.place(best.x - sx * 7 + sz * 3, best.z - sz * 7 - sx * 3, Math.atan2(-(sx - sz * 0.4), -(sz + sx * 0.4)), -0.06); }
    } },
    { label: 'the beach lot, 13:00', fn: () => { lens(62); window.__APPLY_SHOT__('roofs'); set(13); }, after: () => { const lot = beachLot(); if (lot) note('beach lot 13:00', lotFill(lot, 13)); } },
    { label: '9 marina, moored boats, 17:00 (July)', fn: () => { lens(62); set(17); const b = marinaBoat(); if (b) look(b, 24, 7, 4.4); }, after: () => note('9 boats (July)', boatsInFrame()) },
  ];
  const items = opts.set === 'summer' ? summer : autumn;
  const idle = async () => { for (let i = 0; i < 80; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b) return; await wait(250); } };
  for (const it of items) { const f = it.fn; it.fn = async () => { await f(); await wait(400); await idle(); }; }
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => { window.__APPLY_SHOT__('ocean-golden'); } }], { settle: 16, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const r = await window.__MONTAGE__(items, { settle: opts.settle ?? 12, timers: true, cw: 800, cols: 2, save: `calendar-${tag}-${opts.set ?? 'autumn'}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  lens(62);
  G.walkParams.fly = false;
  return { sheet: r, ...out };
};
