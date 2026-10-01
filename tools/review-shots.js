// Design-review capture set (in-page, no Playwright). Open `?capture=1` (`&sketch=1`: sketch mode), then:
//   await import('/tools/review-shots.js'); await __REVIEW__('r1')
// Saves shots/review-<tag>-a.jpg, -b.jpg (6 frames each) and -c.jpg (4), 800 px wide, through the dev
// server's /__shot sink. The same poses every round so the reviewer compares like with like.
// Needs /tools/inpage-montage.js (loaded here) and a landscape viewport (1600×900).
await import('/tools/inpage-montage.js');
const { idPass, lensVerdict } = await import('/tools/id-pass.js');

window.__REVIEW__ = async (tag = 'r', opts = {}) => {
  const G = window.__GAME__, T = G.THREE, m = new T.Matrix4(), p = new T.Vector3();
  window.__PUMP__(); // frames even in a hidden pane (inpage-montage.js)
  const wait = window.__WAIT__; // pumped, so hidden-pane timer throttling can't stretch it
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
    const fly = G.walkParams.fly;
    track = setInterval(() => { const t = at(); if (m.elements[0] === 0) return; const cx = t.x + Math.sin(a) * dist, cz = t.z + Math.cos(a) * dist; G.walker.place(cx, cz, a, -0.05); if (fly) { G.walkParams.fly = true; G.walker.y = t.y + h; } }, 50);
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
  // (the umbrellas are out June–September; the rest of the year the beach shot frames a lifeguard stand)
  const um = near('beach:umbrella', s.x, s.z) ?? near('beach:lifeguard', s.x, s.z), boat = near('moored-boats:', s.x, s.z), bed = near('garden:hydrangea', s.x, s.z);
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; };
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
  // D: downtown life and interiors (the areas the user asked for by name)
  const { useOf } = await import('/src/world/uses.ts');
  // the enterable business (a plan whose footprint the map names) of the wanted use, nearest spawn
  const shopPlan = (want) => {
    let best = null, bd = Infinity;
    for (const P of G.plans.values()) {
      const f = G.stream.fpByKey.get(P.fp);
      if (!f || f.kind !== 'commercial' || !want.includes(useOf(f.name, f.use))) continue;
      const d = Math.hypot(P.door.x - s.x, P.door.z - s.z);
      if (d < bd) (bd = d), (best = P);
    }
    return best;
  };
  const inside = async (P, h) => {
    set(h);
    G.walkParams.fly = false;
    const d = P.door;
    G.walker.place(d.wx - d.nx * 2.6, d.wz - d.nz * 2.6, Math.atan2(d.nx, d.nz) + 0.35, -0.12, d.y);
    for (let k = 0; k < 8; k++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
    G.interiors.flush();
    // the plan's walls only register once its interior exists: place again so collision doesn't push us out
    G.walker.place(d.wx - d.nx * 2.6, d.wz - d.nz * 2.6, Math.atan2(d.nx, d.nz) + 0.35, -0.12, d.y);
    for (let k = 0; k < 4; k++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
    await wait(2500);
  };
  const D4 = [
    { label: '17 café terrace', fn: async () => { set(12.5); const t = near('terrace:', s.x, s.z); if (t) look({ ...t, y: t.y + 0.8 }, 7, 1.7, 0.9); await wait(800); } },
    { label: '18 inside a café / diner', fn: async () => { const P = shopPlan(['cafe', 'restaurant', 'bar']) ?? shopPlan(['shop', 'unknown']); if (P) await inside(P, 13); } },
    { label: '19 inside a house, morning sun', fn: async () => { shot('inside')(); set(9.3); await wait(1500); } },
    { label: '20 a walker, side on', fn: async () => {
      set(15); ground(s.x, s.z, 0); await wait(3500);
      let mesh = null; G.scene.traverse((o) => { if (o.name === 'life-ped') mesh = o; });
      let bi = -1, bd = 1e9;
      if (mesh) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); if (m.elements[0] === 0) continue; p.setFromMatrixPosition(m); const dd = Math.hypot(p.x - s.x, p.z - s.z); if (dd < bd && G.world.terrain.sdfAt(p.x, p.z) > 40) { bd = dd; bi = i; } }
      if (bi >= 0) { mesh.getMatrixAt(bi, m); const q = new T.Quaternion(), sc = new T.Vector3(); m.decompose(p, q, sc); const yaw = new T.Euler().setFromQuaternion(q, 'YXZ').y; follow('life-ped', bi, 4.5, 1.2, yaw + Math.PI / 2); }
    } },
  ];
  // E: the ecosystem and street physics (fox, hawk, a walker knocked down, a lamp close up)
  const crit = (kind, x, z, extra = {}) => {
    const C = G.critters.list;
    for (let i = C.length - 1; i >= 0; i--) if (C[i].kind === kind) C.splice(i, 1);
    const y = Math.max(0, G.world.terrain.heightAt(x, z));
    const c = { kind, x, y, z, yaw: 0.9, pitch: 0, state: 'perch', t: 999, tx: x, tz: z, ty: y, phase: 0.3, amt: 0, s: 1.1, c: new T.Color(1, 1, 1), seed: 7, vig: 0.5, ...extra };
    C.push(c);
    return c;
  };
  const E = [
    { label: '21 a red fox at dusk', fn: async () => { set(19.2); const f = crit('fox', lawn.x, lawn.z); look({ ...f, y: f.y + 0.3 }, 3.2, 0.7, 2.2, -0.05); await wait(600); } },
    { label: '22 a red-tailed hawk on the thermal', fn: async () => {
      set(13); const y = Math.max(0, G.world.terrain.heightAt(lawn.x, lawn.z)) + 24;
      crit('hawk', lawn.x + 18, lawn.z, { state: 'soar', y, ty: y, home: { x: lawn.x, z: lawn.z }, t: 999 });
      await wait(300); follow('critter:hawk', 0, 4.5, 0.9, 0.6);
    } },
    { label: '23 a walker knocked down by a car', fn: async () => {
      set(15); ground(s.x, s.z, 0); await wait(3500);
      let mesh = null; G.scene.traverse((o) => { if (o.name === 'life-ped') mesh = o; });
      let bi = -1, bd = 1e9, bp = null;
      if (mesh) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); if (m.elements[0] === 0) continue; p.setFromMatrixPosition(m); const dd = Math.hypot(p.x - s.x, p.z - s.z); if (dd < bd && G.world.terrain.sdfAt(p.x, p.z) > 40) { bd = dd; bi = i; bp = p.clone(); } }
      if (bi >= 0) { G.life.bump(bp.x - 1, bp.z, 9, 0); await wait(1400); follow('life-ped', bi, 4, 1.1, 2.4); }
    } },
    { label: '24 a street lamp, close, at dusk', fn: async () => { set(19.6); const L = near('lamp:lens', s.x, s.z, 2); if (L) look(L, 7, -7, 1.2, -0.1); } },
  ];
  // the lens: nothing within 2.5 m of it over 5% of the frame, nor within 4 m over 15%, measured on
  // what the frame actually shows — the id pass (tools/id-pass.js, spot-shots' asserts). The round-3/6
  // ray grid (25% of 40 rays within 4 m) let round 10's night street through with a slab filling its
  // lower right. (The ground at your feet is below knee height: it never counts.)
  const lensSeen = () => idPass(G);
  const occluder = () => { const why = lensVerdict(lensSeen(), { world: 0 }); return why.length ? why.join(', ') : null; };
  // …and a pose that fails it is re-posed: back and aside from where it stood, looking where it
  // looked, on open ground, until it passes (else the least blocked of them)
  const repose = async () => {
    const x0 = G.walker.x, z0 = G.walker.z, y0 = G.walker.y, yaw = G.walker.yaw, pitch = G.walker.pitch ?? -0.03, fly = G.walkParams.fly;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), px = -fz, pz = fx;
    const put = (x, z) => { G.walker.place(x, z, yaw, pitch); if (fly) { G.walkParams.fly = true; G.walker.y = y0; } };
    let best = null;
    for (const [back, side] of [[2, 0], [4, 0], [2, 2], [2, -2], [6, 0], [4, 3], [4, -3], [9, 0]]) {
      const x = x0 - fx * back + px * side, z = z0 - fz * back + pz * side;
      if (!fly && (G.walk.blocked(x, z, 0.6) || G.walk.buildingAt(x, z) >= 0)) continue;
      put(x, z);
      await wait(300);
      const s = lensSeen(), why = lensVerdict(s, { world: 0 });
      if (!why.length) return null;
      const sc = s.near25 * 4 + Math.max(0, s.near4 - 0.15) * 2;
      if (!best || sc < best.sc) best = { x, z, sc };
    }
    if (best) { put(best.x, best.z); await wait(300); }
    return occluder();
  };
  // F: the regional cast — each new species on the lawn, close (the Almanac's foundry models)
  const pair = (a, b, hour) => async () => {
    set(hour);
    const Lc = G.critters.list;
    for (let i = Lc.length - 1; i >= 0; i--) if (Lc[i].lineup) Lc.splice(i, 1); // the last pair walks off stage
    crit(a, lawn.x - 0.9, lawn.z, { lineup: true });
    crit(b, lawn.x + 0.9, lawn.z + 0.4, { lineup: true, yaw: 2.2 });
    look({ x: lawn.x, y: Math.max(0, G.world.terrain.heightAt(lawn.x, lawn.z)) + 0.35, z: lawn.z }, 3.6, 0.6, 2.4, -0.08);
    await wait(600);
  };
  const F = [
    { label: '25 coyote + black-tailed jackrabbit', fn: pair('coyote', 'jackrabbit', 17.5) },
    { label: '26 roadrunner + quail', fn: pair('roadrunner', 'quail', 10) },
    { label: '27 mule deer + ground squirrel', fn: pair('muleDeer', 'groundSquirrel', 16) },
    { label: '28 white ibis + snowshoe hare', fn: pair('ibis', 'snowshoe', 11) },
  ];
  for (const L of [A, B, C, D4, E, F]) for (const it of L) {
    const f = it.fn, label = it.label;
    it.fn = async () => {
      clearInterval(track); track = 0; await f(); await wait(400); await idle();
      // a parked car, a van going by, a slab of something right in the lens: re-posed round it
      const o = !track && !G.interiors.indoors ? occluder() : null;
      if (o) console.log(`[review] ${label}: ${o} — re-posed: ${(await repose()) ?? 'clear'}`);
    };
    it.after = () => {
      const o = G.interiors.indoors ? null : occluder(); // (indoors the walls are meant to be near)
      it.label = o ? `${label}  ⚠ occluder: ${o}` : label;
      if (o) console.warn('[review] occluder in', label, o);
    };
  }
  const settle = opts.settle ?? 45;
  // opts.only: which montages, e.g. 'ab', 'd', 'de' (default: all six)
  const want = (k) => (opts.only ?? 'abcdef').includes(k);
  const sets = [['a', A], ['b', B], ['c', C], ['d', D4], ['e', E], ['f', F]];
  // warm-up: the first capture after a fresh load can come back blank (paper) — throw one away
  // (it's always the arrival pose: pose it once and let the stream + post chain settle first)
  if (want('a')) { await A[0].fn(); await wait(4000); }
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 20, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  for (const [k, L] of sets) {
    if (!want(k)) continue;
    await window.__MONTAGE__(L, { settle, timers: true, cw: 800, cols: 2, save: `review-${tag}-${k}.jpg` });
    window.__MONTAGE_CLOSE__?.();
    await wait(300);
  }
  clearInterval(track);
  G.walkParams.fly = false;
  return sets.filter(([k]) => want(k)).map(([k]) => `review-${tag}-${k}.jpg`).join(', ');
};
