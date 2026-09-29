// Frame hitches, in-page (a `?capture=1` page pumped by inpage-montage's __PUMP__, or a live one):
//   await import('/tools/hitch-probe.js'); await __HITCH__({ seconds: 20, move: [vx, vz], deep: false })
// (To drive: __GAME__.vehicles.summon('car'), then walk into it and press E — or, scripted, the
// private __GAME__.vehicles.enter(<the car>) — and the probe moves the car instead of the walker.)
// Wraps the game's per-frame systems (everything __GAME__ exposes with an update / render / scan,
// the tile stream's mount / unmount / index rebuilds, the ground paint's tile hooks, plus
// ctx.instances) with timers, runs the loop for `seconds` — moving the walker (or the ride) at
// `move` m/s if given, the way a drive streams the world in — and reports the frames over `slow`
// ms: when, how long, which systems took the time, and what nothing wrapped accounts for
// (`other`: unwrapped main-loop code, garbage collection). A render that compiled shaders or
// uploaded new geometry/textures says so (`+prog`, `+geo`, `+tex`). The periodic ones show as a
// steady spacing between slow frames (`gaps`).
window.__HITCH__ = async (opts = {}) => {
  const G = window.__GAME__;
  const seconds = opts.seconds ?? 20, slow = opts.slow ?? 34, move = opts.move ?? null;
  const calls = []; // [name, t0, ms, depth]
  const undo = [];
  let depth = 0;
  const wrap = (obj, key, name) => {
    const f = obj?.[key];
    if (typeof f !== 'function' || f.__hitch) return;
    const own = Object.prototype.hasOwnProperty.call(obj, key);
    const w = function (...a) {
      const t0 = performance.now();
      depth++;
      try { return f.apply(this, a); } finally { depth--; calls.push([name, t0, performance.now() - t0, depth]); }
    };
    w.__hitch = true;
    obj[key] = w;
    undo.push(() => { if (own) obj[key] = f; else delete obj[key]; });
  };
  for (const [n, o] of Object.entries({ stream: G.stream, grass: G.grass, life: G.life, interiors: G.interiors, explore: G.explore, critters: G.critters, garden: G.garden, commissions: G.commissions, hints: G.hints, brush: G.brush, arrival: G.arrival, atlas: G.atlas, vehicles: G.vehicles, walker: G.walker, post: G.post }))
    for (const k of ['update', 'render', 'reinit', 'apply', 'tick']) wrap(o, k, `${n}.${k}`);
  for (const k of ['onChange', 'onTile', 'onUnload', 'onMount', 'mount', 'unload', 'mountCoarse', 'unloadCoarse', 'rebuild', 'houseGrid', 'shopGrid', 'cityGrid', 'pavedIndex', 'repaintLamps']) wrap(G.stream, k, `stream.${k}`);
  for (const k of ['setTile', 'dropTile', 'addWalks']) wrap(G.paint, k, `paint.${k}`);
  wrap(G.grass, 'invalidateBox', 'grass.invalidateBox');
  wrap(G.grass, 'build', 'grass.build');
  if (opts.deep) {
    // the fine grain (tens of thousands of calls a mount: the timers' own cost shows up in them)
    wrap(G.grass, 'mask', 'grass.mask');
    wrap(G.interiors, 'unregister', 'interiors.unregister');
    wrap(G.interiors, 'register', 'interiors.register');
    for (const k of ['addPolygon', 'addWall', 'addDeck', 'addLoop', 'removeScope']) wrap(G.walk, k, `walk.${k}`);
  }
  wrap(G.paint?.detail, 'update', 'paint.detail');
  wrap(G.paint?.mid, 'update', 'paint.mid');
  wrap(G.ctx, 'instances', 'ctx.instances');
  // the render: time, and whether it compiled programs or uploaded buffers
  const info = G.renderer.info, rr = G.renderer.render, marks = [];
  G.renderer.render = function (...a) {
    const p0 = info.programs?.length ?? 0, g0 = info.memory.geometries, x0 = info.memory.textures, t0 = performance.now();
    depth++;
    try { return rr.apply(this, a); } finally {
      depth--;
      const ms = performance.now() - t0;
      calls.push(['renderer.render', t0, ms, depth]);
      const dp = (info.programs?.length ?? 0) - p0, dg = info.memory.geometries - g0, dx = info.memory.textures - x0;
      if (dp || dg > 0 || dx > 0) marks.push([t0, `${dp ? `+prog${dp} ` : ''}${dg > 0 ? `+geo${dg} ` : ''}${dx > 0 ? `+tex${dx}` : ''}`.trim()]);
    }
  };
  undo.push(() => { G.renderer.render = rr; });
  // frames: the post pass ends each one
  const ends = [];
  const pr = G.post.render;
  G.post.render = function (...a) { const r = pr.apply(this, a); ends.push(performance.now()); return r; };
  undo.push(() => { G.post.render = pr; });
  const t0 = performance.now();
  const wait = (ms) => new Promise((r) => (window.__WAIT__ ? window.__WAIT__(ms).then(r) : setTimeout(r, ms)));
  while (performance.now() - t0 < seconds * 1000) {
    await wait(100);
    if (move) {
      // the ride you're in carries the walker (vehicles.update); on foot the walker itself moves
      const dt = 0.1, V = G.vehicles.active;
      if (V) { V.x += move[0] * dt; V.z += move[1] * dt; } else { G.walker.x += move[0] * dt; G.walker.z += move[1] * dt; }
    }
  }
  for (const u of undo.reverse()) u();
  // frame lengths: end to end
  const frames = [];
  for (let i = 1; i < ends.length; i++) frames.push([ends[i - 1], ends[i] - ends[i - 1]]);
  const bad = frames.filter(([, ms]) => ms > slow);
  const report = [...bad].sort((a, b) => b[1] - a[1]).slice(0, opts.top ?? 12).map(([s, ms]) => {
    const by = {};
    let top = 0;
    for (const [n, c0, d, dep] of calls) if (c0 >= s && c0 < s + ms) { by[n] = (by[n] ?? 0) + d; if (dep === 0) top += d; }
    const list = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, d]) => `${n} ${d.toFixed(1)}`);
    const mk = marks.filter(([t]) => t >= s && t < s + ms).map(([, m]) => m);
    return { at: +((s - t0) / 1000).toFixed(2), ms: +ms.toFixed(0), other: +(ms - top).toFixed(0), top: list, ...(mk.length ? { gpu: mk.join(' ') } : {}) };
  });
  const tot = {}, peak = {};
  for (const [n, , d] of calls) { tot[n] = (tot[n] ?? 0) + d; peak[n] = Math.max(peak[n] ?? 0, d); }
  const ms = frames.map(([, d]) => d).sort((a, b) => a - b);
  const pct = (p) => +(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0).toFixed(1);
  return {
    frames: frames.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: pct(1), slow: bad.length,
    gaps: bad.slice(1).map(([s], i) => +((s - bad[i][0]) / 1000).toFixed(1)).slice(0, 24),
    worst: report,
    totalsMs: Object.fromEntries(Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, d]) => [n, +d.toFixed(0)])),
    peakMs: Object.fromEntries(Object.entries(peak).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, d]) => [n, +d.toFixed(1)])),
  };
};
