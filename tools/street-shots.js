// Street-life capture (the reviewer's "do the people and animals behave?" harness): someone on a
// crosswalk with the traffic waiting for them, a dog walker, a jogger (and a close look — about
// half of them wear headphones), squirrels on a trunk, and how many animals the busiest street
// has. Every pose is found from the live sim (the walkers' snapshot, the junction records, the
// critters' list), never hand-placed.
//
//   open  /?at=<lat>,<lon>&capture=1   then
//   await import('/tools/street-shots.js'); await __STREET__('tag')
//
// Saves shots/street-<tag>.jpg through the dev server's /__shot sink. Returns the counts too.
await import('/tools/inpage-montage.js');

window.__STREET__ = async (tag = 'street', opts = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  const wait = window.__WAIT__;
  const { unpackJunctions } = await import('/src/sim/traffic.ts');
  const { RANGES, S, H } = await import('/src/sim/protocol.ts');
  const set = (h) => { G.setHour(h); G.timeParams.speed = 0; G.postParams.sketch = true; };
  const idle = async (max = 120) => { for (let i = 0; i < max; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b) return; await wait(250); } };
  const g = (x, z) => G.world.terrain.heightAt(x, z);
  const x0 = G.walker.x, z0 = G.walker.z;
  await idle(240);
  const lookAt = (tx, tz, ty, fromX, fromZ, eye) => {
    G.walkParams.fly = eye - g(fromX, fromZ) > 2.2;
    G.walker.place(fromX, fromZ, Math.atan2(fromX - tx, fromZ - tz), -Math.atan2(eye - ty, Math.hypot(tx - fromX, tz - fromZ)));
    if (G.walkParams.fly) G.walker.y = eye;
  };
  // walkers and cars as the renderer sees them
  const agents = (range) => {
    const L = G.life, h = L.V.header, snap = L.V.snaps[h[H.FRONT]], out = [];
    for (let i = range[0]; i < range[1]; i++) {
      const o = i * S.STRIDE, f = snap[o + S.FLAGS];
      if (f & 1 && snap[o + S.Y] > -500) out.push({ i, x: snap[o + S.X], y: snap[o + S.Y], z: snap[o + S.Z], yaw: snap[o + S.YAW], amt: snap[o + S.AMT], flags: f });
    }
    return out;
  };
  const near = (list) => list.sort((a, b) => Math.hypot(a.x - G.walker.x, a.z - G.walker.z) - Math.hypot(b.x - G.walker.x, b.z - G.walker.z));
  // stand off to one side of someone and watch them (turn: the angle off their heading)
  const watch = (w, dist = 5.5, turn = 1.1, eyeUp = 1.65, aimUp = 1.2) => {
    // (swing round them, not closer, until the lens isn't in a wall or a shop window)
    let cx = 0, cz = 0;
    for (const da of [0, -2.2, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = w.yaw + turn + da;
      cx = w.x - Math.sin(a) * dist; cz = w.z - Math.cos(a) * dist;
      if (!G.walk.blocked(cx, cz, 0.35) && G.walk.buildingAt(cx, cz) < 0) break;
    }
    lookAt(w.x, w.z, w.y + aimUp, cx, cz, g(cx, cz) + eyeUp);
  };
  const J = [];
  for (const f of G.stream.junctions) for (const j of unpackJunctions(f)) J.push({ ...j, d: Math.hypot(j.x - x0, j.z - z0) });
  J.sort((a, b) => a.d - b.d);
  // someone on a crosswalk: across an arm, just past its setback, inside its carriageway
  const onCrosswalk = (w) => {
    for (const j of J) {
      if (Math.abs(j.x - w.x) > 25 || Math.abs(j.z - w.z) > 25) continue;
      for (const m of j.arms) {
        const rx = w.x - j.x, rz = w.z - j.z, u = rx * m.dx + rz * m.dz, v = rx * -m.dz + rz * m.dx;
        // (arms don't carry their width: the setback is the widest street's half-width + 1.5)
        if (u > j.setback - 0.8 && u < j.setback + 3.2 && Math.abs(v) < j.setback - 1.2) return { j, m };
      }
    }
    return null;
  };
  const found = { crossing: null, dog: null, jogger: null, squirrels: 0, squirrelsHigh: 0, critters: {} };
  const F = [
    { label: '1 on the crosswalk: the traffic waits', fn: async () => {
      set(12.5);
      G.walkParams.fly = false; G.walker.place(x0, z0, 0, 0);
      let pick = null;
      for (let k = 0; k < 60 && !pick; k++) {
        await wait(500);
        for (const w of near(agents(RANGES.peds))) { const c = onCrosswalk(w); if (c) { pick = { w, ...c }; break; } }
      }
      if (!pick) return;
      found.crossing = { x: Math.round(pick.w.x), z: Math.round(pick.w.z) };
      // from the corner behind them, along the arm, low: the walker and the cars at the line
      const { j, m } = pick, r = [m.dz, -m.dx], half = j.setback - 1.5;
      let fx = 0, fz = 0;
      for (const [back, side] of [[14, 3], [12, -3], [18, 4], [10, 2.5]]) {
        fx = j.x + m.dx * (j.setback + back) + r[0] * (half + side) * Math.sign(side); fz = j.z + m.dz * (j.setback + back) + r[1] * (half + side) * Math.sign(side);
        if (!G.walk.blocked(fx, fz, 0.5)) break;
      }
      lookAt(pick.w.x, pick.w.z, pick.w.y + 0.9, fx, fz, g(fx, fz) + 2.2);
    } },
    { label: '2 a dog walker', fn: async () => {
      set(10);
      let pick = null;
      for (let k = 0; k < 40 && !pick; k++) { await wait(500); pick = near(agents(RANGES.peds).filter((w) => w.flags & 2 && w.amt > 0.5))[0]; }
      if (pick) { found.dog = { x: Math.round(pick.x), z: Math.round(pick.z) }; watch(pick, 4.5, 1.35, 1.45, 0.6); }
    } },
    { label: '3 a jogger', fn: async () => {
      set(8.5);
      let pick = null;
      for (let k = 0; k < 40 && !pick; k++) { await wait(500); pick = near(agents(RANGES.peds).filter((w) => w.flags & 4 && w.amt > 1.2))[0]; }
      // ahead of them, a little to the side: they run into the frame while it settles
      if (pick) { found.jogger = { x: Math.round(pick.x), z: Math.round(pick.z) }; watch(pick, 7, 0.35); }
    } },
    { label: '4 joggers close up (about half wear headphones)', fn: async () => {
      set(8.5);
      let js = [];
      for (let k = 0; k < 20 && !js.length; k++) { await wait(300); js = near(agents(RANGES.peds).filter((w) => w.flags & 4 && w.amt > 1.2)); }
      if (js[0]) watch(js[0], 3.4, 0.3, 1.6, 1.5);
    } },
    { label: '5 squirrels on a trunk', fn: async () => {
      set(9.5);
      let best = null;
      for (let k = 0; k < 40 && !best; k++) {
        await wait(600);
        const L = G.critters.list.filter((c) => /squirrel/i.test(c.kind) && !c.dead);
        found.squirrels = L.length;
        found.squirrelsHigh = L.filter((c) => c.y - g(c.x, c.z) > 0.8).length;
        best = L.filter((c) => c.y - g(c.x, c.z) > 0.8).sort((a, b) => Math.hypot(a.x - G.walker.x, a.z - G.walker.z) - Math.hypot(b.x - G.walker.x, b.z - G.walker.z))[0];
      }
      if (best) {
        found.squirrel = { up: +(best.y - g(best.x, best.z)).toFixed(2), trunk: best.home?.trunk };
        const cx = best.x + 3.2, cz = best.z + 2.4;
        lookAt(best.x, best.z, best.y, cx, cz, g(cx, cz) + 1.7);
      }
    } },
    { label: '6 the busiest street: its animals', fn: async () => {
      set(13);
      // the walker at the densest junction (most arms, widest roads) nearby
      const j = J.slice(0, 30).sort((a, b) => b.arms.reduce((s, m) => s + m.w, 0) - a.arms.reduce((s, m) => s + m.w, 0))[0];
      if (!j) return;
      G.walkParams.fly = false; G.walker.place(j.x + 8, j.z + 8, 0.7, -0.05);
      await wait(8000);
      const within = G.critters.list.filter((c) => !c.dead && Math.hypot(c.x - j.x, c.z - j.z) < 90);
      for (const c of within) found.critters[c.kind] = (found.critters[c.kind] ?? 0) + 1;
      lookAt(j.x, j.z, g(j.x, j.z) + 1, j.x + 26, j.z + 20, g(j.x + 26, j.z + 20) + 7);
    } },
  ];
  const poses = [];
  for (const it of F) { const f = it.fn; it.fn = async () => { await f(); await wait(300); await idle(20); poses.push({ f: it.label.slice(0, 14), x: Math.round(G.walker.x), z: Math.round(G.walker.z) }); }; }
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 20, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 30, timers: true, cw: 800, cols: 2, save: `street-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  return { res, poses, found, junctions: J.length };
};
