// Life capture (the reviewer's "does the town live?" harness): junction control — a signalled
// junction from above (queues at the red), its lit lenses from the kerb, a stop sign from the
// driver's seat — and people at home and at work, faces close up. Every pose is found from the
// mounted map (junction records, plans, the residents the interiors seated), never hand-placed.
//
//   open  /?at=<lat>,<lon>&capture=1   then
//   await import('/tools/life-shots.js'); await __LIFE__('tag')
//
// Saves shots/life-<tag>.jpg through the dev server's /__shot sink.
await import('/tools/inpage-montage.js');

window.__LIFE__ = async (tag = 'life', opts = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  const wait = window.__WAIT__;
  const { unpackJunctions, CTL } = await import('/src/sim/traffic.ts');
  const { useOf } = await import('/src/world/uses.ts');
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; };
  const idle = async (max = 120) => { for (let i = 0; i < max; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b) return; await wait(250); } };
  const x0 = G.walker.x, z0 = G.walker.z;
  await idle(240);
  const lookAt = (tx, tz, ty, fromX, fromZ, eye) => {
    const g = G.world.terrain.heightAt(fromX, fromZ);
    G.walkParams.fly = eye - g > 2.2;
    G.walker.place(fromX, fromZ, Math.atan2(fromX - tx, fromZ - tz), -Math.atan2(eye - ty, Math.hypot(tx - fromX, tz - fromZ)));
    if (G.walkParams.fly) G.walker.y = eye;
  };
  // junctions within reach, nearest first
  const J = [];
  for (const f of G.stream.junctions) for (const j of unpackJunctions(f)) J.push({ ...j, d: Math.hypot(j.x - x0, j.z - z0) });
  J.sort((a, b) => a.d - b.d);
  const sig = J.find((j) => j.arms.some((m) => m.ctl === CTL.SIG_A));
  const stop = J.find((j) => j.arms.some((m) => m.ctl === CTL.STOP || m.ctl === CTL.ALL_STOP || m.ctl === CTL.YIELD));
  const g = (x, z) => G.world.terrain.heightAt(x, z);
  const widest = (j, pred) => j.arms.filter(pred).sort((a, b) => b.dx - a.dx)[0] ?? j.arms[0];

  // an interior, activated as the walker would find it: [plan, footprint]
  const enter = async (P) => {
    const d = P.door;
    const ring = G.stream.fpByKey.get(P.fp)?.ring ?? [];
    let cx = 0, cz = 0;
    for (const [x, z] of ring) (cx += x / ring.length), (cz += z / ring.length);
    const ix = d.wx - d.nx * 2.6, iz = d.wz - d.nz * 2.6;
    const yaw = Math.hypot(cx - ix, cz - iz) > 1 ? Math.atan2(-(cx - ix), -(cz - iz)) : Math.atan2(d.nx, d.nz) + 0.35;
    G.walkParams.fly = false;
    for (let k = 0; k < 2; k++) {
      G.walker.place(ix, iz, yaw, -0.12, d.y);
      for (let i = 0; i < 12; i++) G.interiors.update(G.walker.x, G.walker.z, 0.25, G.walker.feet);
      G.interiors.flush?.();
    }
    await wait(2000);
    return { ix, iz, yaw, y: d.y };
  };
  // the residents the active interior placed: [{ x, y, z, yaw, seated }]
  const residents = () => {
    const out = [];
    const m4 = new G.THREE.Matrix4(), p = new G.THREE.Vector3(), q = new G.THREE.Quaternion(), s = new G.THREE.Vector3();
    G.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.material?.defines?.PEOPLE || !o.material.defines.STATIC_PEOPLE || !o.visible) return;
      const seated = !!o.material.defines.SEATED, indoor = !!o.material.defines.INDOOR || !seated;
      if (!indoor && seated) return; // café terrace guests outdoors
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        if (m4.elements[0] === 0 && m4.elements[1] === 0 && m4.elements[2] === 0) continue; // (hidden: decompose would read it as a whole one at the origin)
        m4.premultiply(o.matrixWorld); m4.decompose(p, q, s);
        const e = new G.THREE.Euler().setFromQuaternion(q, 'YXZ');
        out.push({ x: p.x, y: p.y, z: p.z, yaw: e.y, seated });
      }
    });
    return out;
  };
  // stand in front of a resident (on their floor — flying would lift the walker out of the
  // interior and it would close), looking at their face, a little off-axis like a portrait
  const inRing = (x, z, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (ring[i][1] > z !== ring[j][1] > z && x < ((ring[j][0] - ring[i][0]) * (z - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c; return c; };
  const faceTo = (r, dist = 1.1, side = 0.25) => {
    const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
    const face = r.y + (r.seated ? 1.27 : 1.6), floor = r.seated ? r.y - 0.02 : r.y;
    // swing round them (not closer) until nothing — a wall, a table — stands where the lens goes
    const base = Math.atan2(side, dist), R = Math.hypot(dist, side);
    let cx = 0, cz = 0;
    for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.3, -1.3]) {
      const a = base + da, c = Math.cos(a), sn = Math.sin(a);
      cx = r.x + (fx * c - fz * sn) * R; cz = r.z + (fz * c + fx * sn) * R;
      if (!G.walk.blocked(cx, cz, 0.3) && (!r.ring || inRing(cx, cz, r.ring))) break;
    }
    G.walkParams.fly = false;
    G.walker.place(cx, cz, Math.atan2(cx - r.x, cz - r.z), -Math.atan2(floor + 1.62 - face, Math.hypot(cx - r.x, cz - r.z)), floor);
  };
  const plansOf = (pred) => [...G.plans.values()].map((P) => ({ P, f: G.stream.fpByKey.get(P.fp) })).filter(({ f }) => f && pred(f)).sort((a, b) => Math.hypot(a.P.door.x - x0, a.P.door.z - z0) - Math.hypot(b.P.door.x - x0, b.P.door.z - z0));
  let homeRes = null, shopRes = null;
  // a home with someone in a soft chair (sofa / armchair: the pose sits 2 cm above the 0.45 m
  // reference), else anyone seated
  const findHome = async () => {
    let any = null;
    for (const { P } of plansOf((f) => f.kind === 'house').slice(0, 14)) {
      await enter(P);
      // seated on this storey, within the house we walked into
      const rs = residents().filter((r) => r.seated && Math.abs(r.y - P.door.y) < 0.3 && Math.hypot(r.x - P.door.wx, r.z - P.door.wz) < 25);
      const ring = G.stream.fpByKey.get(P.fp)?.ring;
      const soft = rs.find((r) => Math.abs(r.y - P.door.y - 0.02) < 0.004);
      if (soft) return { ...soft, ring };
      any ??= rs[0] && { ...rs[0], P, ring };
    }
    if (any) await enter(any.P);
    return any;
  };

  // walkers as the renderer sees them: [{ i, x, y, z, yaw, amt }]
  const { RANGES, S, H } = await import('/src/sim/protocol.ts');
  const walkers = () => {
    const L = G.life, h = L.V.header, snap = L.V.snaps[h[H.FRONT]], out = [];
    for (let i = RANGES.peds[0]; i < RANGES.peds[1]; i++) {
      const o = i * S.STRIDE;
      if (snap[o + S.FLAGS] & 1) out.push({ i, x: snap[o + S.X], y: snap[o + S.Y], z: snap[o + S.Z], yaw: snap[o + S.YAW], amt: snap[o + S.AMT] });
    }
    return out;
  };
  const watch = (w, dist = 5.5, turn = 1.1) => {
    const a = w.yaw + turn, cx = w.x - Math.sin(a) * dist, cz = w.z - Math.cos(a) * dist;
    lookAt(w.x, w.z, w.y + 1.3, cx, cz, g(cx, cz) + 1.65);
  };
  const F = [
    { label: `1 a signalled junction from above${sig ? '' : ' (none mapped here)'}`, fn: async () => { set(12.5); if (sig) { const y = g(sig.x, sig.z); lookAt(sig.x, sig.z, y, sig.x + 38, sig.z + 30, y + 42); await wait(opts.traffic ?? 14000); } } },
    { label: '2 its signals from the kerb', fn: async () => {
      set(12.5);
      if (!sig) return;
      const m = widest(sig, (a) => a.ctl === CTL.SIG_A || a.ctl === CTL.SIG_B), r = [m.dz, -m.dx], back = sig.setback + 12, off = 5.5;
      const fx = sig.x + m.dx * back + r[0] * off, fz = sig.z + m.dz * back + r[1] * off;
      lookAt(sig.x - m.dx * sig.setback, sig.z - m.dz * sig.setback, g(sig.x, sig.z) + 4.6, fx, fz, g(fx, fz) + 1.6);
      await wait(2500);
    } },
    { label: `3 a ${stop && stop.arms.some((m) => m.ctl === CTL.YIELD) ? 'give-way' : 'stop'} sign from the driver's seat`, fn: async () => {
      set(10.5);
      if (!stop) return;
      // from the sidewalk behind the sign (a queued car in the lane would fill the lens)
      const m = stop.arms.find((a) => a.ctl === CTL.STOP || a.ctl === CTL.ALL_STOP || a.ctl === CTL.YIELD), r = [m.dz, -m.dx];
      let fx = 0, fz = 0;
      for (const [back, off] of [[11, 5.5], [11, 4.5], [14, 3.8], [9, 3.2], [16, 2.0]]) {
        fx = stop.x + m.dx * (stop.setback + back) + r[0] * off; fz = stop.z + m.dz * (stop.setback + back) + r[1] * off;
        if (!G.walk.blocked(fx, fz, 0.7)) break;
      }
      lookAt(stop.x + r[0] * 1.5, stop.z + r[1] * 1.5, g(stop.x, stop.z) + 1.5, fx, fz, g(fx, fz) + 1.6);
      await wait(2500);
    } },
    { label: '4 the junction at night', fn: async () => { set(21.5); if (sig) { const y = g(sig.x, sig.z); lookAt(sig.x, sig.z, y + 2, sig.x + 30, sig.z + 22, y + 22); await wait(3000); } } },
    { label: '5 at home: someone in a soft chair', fn: async () => { set(13); homeRes = await findHome(); if (homeRes) { faceTo(homeRes, 2.1, 0.4); await wait(1500); } } },
    { label: '6 their face', fn: async () => { set(13); if (homeRes) { faceTo(homeRes, 0.95, 0.2); await wait(1500); } } },
    { label: '7 at work: behind the counter', fn: async () => {
      set(13);
      for (const { P } of plansOf((f) => f.kind === 'commercial' && ['cafe', 'bar', 'shop', 'grocery', 'bakery', 'restaurant'].includes(useOf(f.name, f.use))).slice(0, 8)) {
        await enter(P);
        const rs = residents().filter((r) => !r.seated && Math.abs(r.y - P.door.y) < 0.3 && Math.hypot(r.x - P.door.wx, r.z - P.door.wz) < 30);
        if (rs.length) { shopRes = { ...rs[0], ring: G.stream.fpByKey.get(P.fp)?.ring }; break; }
      }
      if (shopRes) { const fx = -Math.sin(shopRes.yaw), fz = -Math.cos(shopRes.yaw); const cx = shopRes.x + fx * 3.2 + fz * 0.8, cz = shopRes.z + fz * 3.2 - fx * 0.8; G.walker.place(cx, cz, Math.atan2(cx - shopRes.x, cz - shopRes.z), -0.08, shopRes.y); await wait(1500); }
    } },
    { label: '8 a customer at a table', fn: async () => { set(13); const rs = shopRes ? residents().filter((r) => r.seated && Math.hypot(r.x - shopRes.x, r.z - shopRes.z) < 30 && Math.abs(r.y - shopRes.y) < 1) : []; if (rs.length) { faceTo({ ...rs[0], ring: shopRes.ring }, 1.5); await wait(1500); } } },
    { label: '9 two people stopped to talk', fn: async () => {
      set(15.5);
      // walk the street for a while (life only runs round the walker), then find a conversation
      G.walkParams.fly = false; G.walker.place(x0, z0, 0, 0);
      let pick = null;
      for (let k = 0; k < 30 && !pick; k++) { await wait(1000); pick = walkers().filter((w) => w.amt < -3.5 && w.amt > -4.5).sort((a, b) => Math.hypot(a.x - x0, a.z - z0) - Math.hypot(b.x - x0, b.z - z0))[0]; }
      if (pick) { watch(pick, 5, 1.2); await wait(1200); }
    } },
    { label: '10 waiting at the corner for the light', fn: async () => {
      set(12);
      if (!sig) return;
      G.walkParams.fly = false; G.walker.place(sig.x + 20, sig.z + 20, 0, 0);
      let pick = null;
      for (let k = 0; k < 40 && !pick; k++) {
        await wait(700);
        const a = walkers(); await wait(700); const b = new Map(walkers().map((w) => [w.i, w]));
        pick = a.find((w) => { const v = b.get(w.i); const d = Math.hypot(w.x - sig.x, w.z - sig.z); return v && w.amt === 0 && Math.hypot(v.x - w.x, v.z - w.z) < 0.05 && d > sig.setback - 1 && d < sig.setback + 9; });
      }
      if (pick) { watch(pick, 7, 0.9); await wait(1200); } else { const y = g(sig.x, sig.z); lookAt(sig.x, sig.z, y, sig.x + 16, sig.z + 12, y + 9); }
    } },
  ];
  const poses = [];
  for (const it of F) { const f = it.fn; it.fn = async () => { await f(); await wait(300); await idle(20); poses.push({ f: it.label.slice(0, 14), x: Math.round(G.walker.x), z: Math.round(G.walker.z) }); }; }
  await F[0].fn(); await wait(1500);
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 20, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 40, timers: true, cw: 800, cols: 2, save: `life-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  return { res, poses, junctions: J.length, sig: sig && { x: Math.round(sig.x), z: Math.round(sig.z), d: Math.round(sig.d) }, stop: stop && { x: Math.round(stop.x), z: Math.round(stop.z), d: Math.round(stop.d) }, home: !!homeRes, shop: !!shopRes };
};
