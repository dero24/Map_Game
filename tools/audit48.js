// The lower-48 load audit, in the page (tools/audit48.mjs drives it; docs/agent/debugging.md).
// On a `?at=<lat>,<lon>&capture=1` page, once the ring round the walker has settled:
//   await import('/tools/audit48.js'); await __AUDIT__('shrewsbury', { realWait: 240 })
// returns what loaded (each detail cell of the ring: real, the vector twin, a stand-in, baked,
// failed), the ground (land or water under the ring), the buildings and their heights, the trees,
// the frame times standing and turning, the tile worker's errors — and the place-shots frames
// (main street, a residential street, from the air, the horizon) plus a straight-down view, as a
// JPEG data URL (`sheet`) for the runner's montage.
await import('/tools/inpage-montage.js');
await import('/tools/place-shots.js');

const quantile = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r1 = (v) => Math.round(v * 10) / 10;

window.__AUDIT__ = async (tag = 'audit', opts = {}) => {
  const G = window.__GAME__, S = G.stream;
  const x0 = G.walker.x, z0 = G.walker.z;
  const t0 = performance.now();
  // ---- what loaded: wait (up to realWait s) for every real cell of the ring, then idle ----
  const cell = S.man?.cell ?? 1024, loadR = opts.loadR ?? 1500;
  const ringKeys = [];
  for (let cx = Math.floor((x0 - loadR) / cell); cx <= Math.floor((x0 + loadR) / cell); cx++)
    for (let cz = Math.floor((z0 - loadR) / cell); cz <= Math.floor((z0 + loadR) / cell); cz++) {
      const dx = Math.max(cx * cell - x0, 0, x0 - (cx + 1) * cell), dz = Math.max(cz * cell - z0, 0, z0 - (cz + 1) * cell);
      if (Math.hypot(dx, dz) < loadR) ringKeys.push(`${cx}_${cz}`);
    }
  const baked = new Set((S.man?.tiles ?? []).map((t) => t.id));
  const state = () => {
    // a cell is its real tile, baked, or still a stand-in: the vector twin (real streets and
    // buildings from OpenFreeMap) or the procedural one — and a stand-in's real tile is on its way
    // (pending), failed (backing off), or not asked for
    const out = { real: 0, vec: 0, stand: 0, baked: 0, failed: 0, pending: 0, flat: 0, missing: 0, twin: 0, synth: 0, cells: {} };
    for (const k of ringKeys) {
      const w = S.loaded.get('w' + k), s = S.loaded.get('s' + k), b = baked.has(k) && S.loaded.get(k);
      const failed = S.failed?.has('w' + k), pending = S.fetching?.has('w' + k) || S.queued?.has('w' + k);
      let st = 'missing';
      if (b) st = 'baked';
      else if (w) st = w.vec ? 'vec' : 'real';
      else if (s) { st = failed ? 'failed' : pending ? 'pending' : 'stand'; out[s.vec ? 'twin' : 'synth']++; }
      if (w?.flat) out.flat++;
      out[st]++;
      out.cells[k] = st + (s && !w ? (s.vec ? ':twin' : ':synth') : '') + (w?.flat ? '(flat)' : '');
    }
    return out;
  };
  const wait = window.__WAIT__ ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const realWait = opts.realWait ?? 240;
  let st = state(), firstReal = st.real || st.baked ? 0 : null, allReal = null;
  // (until the stream is idle — nothing on the wire, nothing to build — for three seconds running: a
  // phone's ring leaves its far cells out on purpose, its vertex budget)
  let idleFor = 0;
  for (let i = 0; i < realWait && idleFor < 3; i++) {
    idleFor = !S.worldPending && !S.fetching?.size && !S.buildQueue?.length && i > 5 ? idleFor + 1 : 0; // (the detail ring; the silhouettes stream on for minutes)
    await wait(1000); st = state();
    if (firstReal === null && (st.real || st.baked)) firstReal = i + 1;
    if (allReal === null && st.real + st.baked + st.vec === ringKeys.length && !st.pending) allReal = i + 1;
  }
  if (allReal === null && st.real + st.baked + st.vec === ringKeys.length) allReal = Math.round((performance.now() - t0) / 1000);
  for (let i = 0; i < 120 && (S.busy || S.worldPending); i++) await wait(500);
  st = state();
  const loadS = r1((performance.now() - t0) / 1000);

  // ---- the ground: land or water under the ring (the terrain's signed distance to water) ----
  let land = 0, water = 0, ocean = 0;
  const T = G.world.terrain;
  for (let gx = -600; gx <= 600; gx += 40)
    for (let gz = -600; gz <= 600; gz += 40) {
      const x = x0 + gx, z = z0 + gz;
      if (T.sdfAt(x, z) < 0) { water++; if (T.layer(x, z).isOcean?.(x, z)) ocean++; } else land++;
    }
  const spawnWater = T.sdfAt(x0, z0) < 0;
  // (the arrival: outside, on land — never in a building's rooms)
  const spawnInside = G.walk.buildingAt(G.walker.x, G.walker.z) >= 0 || !!G.interiors?.indoors;

  // ---- the buildings of the ring's cells, and their heights ----
  const fps = [];
  for (const [id, L] of S.loaded) { if (id[0] === 's' && S.loaded.has('w' + id.slice(1))) continue; for (const f of L.fps ?? []) fps.push({ f, src: id[0] === 's' ? 'stand' : id[0] === 'w' ? 'real' : 'baked' }); }
  const near = fps.filter(({ f }) => { const p = f.ring[0]; return Math.hypot(p[0] - x0, p[1] - z0) < loadR; });
  const hs = near.map(({ f }) => f.top - f.base).filter((h) => h > 0);
  const fH = (k) => (k === 'commercial' ? 3.8 : k === 'large' ? 3.1 : 2.9);
  const storeys = near.map(({ f }) => (f.kind === 'church' ? 1 : Math.max(1, Math.floor((f.top - f.floor0 + 0.2) / fH(f.kind)))));
  const kinds = {};
  for (const { f } of near) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
  const bySrc = {};
  for (const { src } of near) bySrc[src] = (bySrc[src] ?? 0) + 1;
  // the streets the ring's real cells carry
  let roads = 0, named = 0;
  for (const r of S.primRoads ?? []) { if (!r.lod && r.w) { roads++; if (r.n && !r.n.startsWith('synth')) named++; } }

  // ---- trees: every tree instance mounted within the ring ----
  let trees = 0, treeMeshes = 0;
  G.scene.traverse((m) => {
    if (!m.isInstancedMesh || !/^trees:/.test(m.name) || !m.visible) return;
    treeMeshes++;
    const a = new G.THREE.Matrix4(), w = new G.THREE.Vector3();
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, a); w.setFromMatrixPosition(a).applyMatrix4(m.matrixWorld);
      if (Math.hypot(w.x - x0, w.z - z0) < loadR) trees++;
    }
  });

  // ---- frames: the page's own, standing then turning on the spot ----
  const frameStats = async (ms, turn) => {
    const d = [];
    let last = performance.now();
    const yaw0 = G.walker.yaw ?? 0;
    await new Promise((done) => {
      const end = last + ms;
      const f = (now) => {
        d.push(now - last); last = now;
        if (turn && 'yaw' in G.walker) G.walker.yaw = yaw0 + ((now - end + ms) / ms) * Math.PI * 2;
        if (now >= end) done(); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    d.shift();
    return { n: d.length, p50: r1(quantile(d, 0.5)), p95: r1(quantile(d, 0.95)), max: r1(Math.max(0, ...d)), over50: d.filter((v) => v > 50).length };
  };
  G.setHour(12.5); G.timeParams.speed = 0;
  await wait(1500);
  const stand = await frameStats(opts.frameMs ?? 5000, false);
  const turn = await frameStats(opts.frameMs ?? 5000, true);
  const info = { pendingWhileTimed: state().pending };

  // ---- the tile worker's notes: errors, measurements ----
  const wlog = [...(S.workerLog ?? [])];
  const workerErrors = wlog.filter((t) => /error|fail|threw|refused|timeout/i.test(t)).slice(-12);
  const measured = wlog.filter((t) => /measured/i.test(t)).length;

  // ---- the montage: place-shots' frames 1, 5, 6, 8 and a straight-down view of the ring ----
  let sheet = null;
  if (opts.shots !== false) {
    const res = await window.__PLACE__(tag, {
      only: [0, 4, 5, 7], realWait: 0, settle: opts.settle ?? 30, dataUrl: true, cw: opts.cw ?? 640, cols: opts.cols,
      extra: [{ label: '9 straight down, 700 m up', fn: async () => { G.setHour(13); G.timeParams.speed = 0; G.walkParams.fly = true; G.walker.place(x0, z0, 0, -1.5707); G.walker.y = T.heightAt(x0, z0) + 700; await wait(2500); } }],
    });
    sheet = res?.res ?? null;
    G.walkParams.fly = false;
    G.walker.place(x0, z0, 0, 0);
  }
  return {
    tag, at: G.at ?? null, tier: window.__TIER__?.tier ?? null, loadS,
    ring: { cells: ringKeys.length, real: st.real, vec: st.vec, stand: st.stand, baked: st.baked, failed: st.failed, pending: st.pending, missing: st.missing, flat: st.flat, twin: st.twin, synth: st.synth, firstRealS: firstReal, allRealS: allReal, detail: st.cells },
    ground: { land, water, ocean, waterShare: r1((100 * water) / (land + water)), spawnWater, spawnInside },
    buildings: { n: near.length, bySrc, kinds, medianH: r1(quantile(hs, 0.5)), p90H: r1(quantile(hs, 0.9)), maxH: r1(Math.max(0, ...hs)), twoPlus: r1((100 * storeys.filter((s) => s >= 2).length) / Math.max(1, storeys.length)) },
    roads: { n: roads, named },
    trees: { n: trees, meshes: treeMeshes },
    frames: { stand, turn, ...info },
    detailMB: r1((S.detailBytes ?? 0) / 1048576),
    worker: { errors: workerErrors, measuredNotes: measured },
    sheet,
  };
};
