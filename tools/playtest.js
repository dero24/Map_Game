// Playtest: gameplay checks that run on any place the game can stream (?at=lat,lon&capture=1).
//   await import('/tools/playtest.js');
//   await __PLAYTEST__()            every check below, a pass/fail report (window.__PLAYTEST_LAST__)
//   __OVERLAPS__()                  walkable buildings standing inside or across each other
//   __DOORS__({ max: 80 })          walk in through every front door near you, and back out
//   await __FLICKER__({ frames })   the same view drawn twice: pixels that change with nothing moving
//   await __ALTITUDE__({ heights }) fly up and look down: the ground holds still (no water/land flashing)
// Nothing about a place is written here: the buildings, doors and ground are the page's own.

const G0 = () => window.__GAME__;

// ---- buildings inside buildings: nested or twin footprints in the walk world ----
window.__OVERLAPS__ = (opts = {}) => {
  const G = G0(), W = G.walk;
  const polys = W.polys, dead = W.polyDead;
  const boxes = [...G.stream.loaded.values()].filter((t) => opts.all || t.spec.world).map((t) => t.spec.box);
  const inBox = (x, z) => !boxes.length ? true : boxes.some((b) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1);
  const live = [];
  for (let i = 0; i < polys.length; i++) {
    if (dead[i]) continue;
    const r = polys[i];
    if (!r || r.length < 3) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0;
    for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
      const [x, z] = r[k];
      (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
      a += r[j][0] * r[k][1] - r[k][0] * r[j][1];
    }
    if (!inBox((x0 + x1) / 2, (z0 + z1) / 2)) continue;
    live.push({ i, r, x0, z0, x1, z1, a: Math.abs(a) / 2 });
  }
  const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
  const grid = new Map(), C = 32;
  for (const p of live) for (let u = Math.floor(p.x0 / C); u <= Math.floor(p.x1 / C); u++) for (let v = Math.floor(p.z0 / C); v <= Math.floor(p.z1 / C); v++) (grid.get(u + ',' + v) ?? grid.set(u + ',' + v, []).get(u + ',' + v)).push(p);
  const out = [];
  for (const p of live) {
    const cand = new Set();
    for (let u = Math.floor(p.x0 / C); u <= Math.floor(p.x1 / C); u++) for (let v = Math.floor(p.z0 / C); v <= Math.floor(p.z1 / C); v++) for (const q of grid.get(u + ',' + v) ?? []) if (q.i > p.i) cand.add(q);
    for (const q of cand) {
      if (q.x0 >= p.x1 || q.x1 <= p.x0 || q.z0 >= p.z1 || q.z1 <= p.z0) continue;
      const [s, b] = p.a <= q.a ? [p, q] : [q, p];
      const X0 = Math.max(s.x0, b.x0), X1 = Math.min(s.x1, b.x1), Z0 = Math.max(s.z0, b.z0), Z1 = Math.min(s.z1, b.z1);
      const st = Math.max(0.5, Math.sqrt((X1 - X0) * (Z1 - Z0)) / 20);
      let both = 0;
      for (let x = X0 + st / 2; x < X1; x += st) for (let z = Z0 + st / 2; z < Z1; z += st) if (pip(x, z, s.r) && pip(x, z, b.r)) both++;
      const ov = both * st * st;
      if (ov > 1) out.push({ frac: +(ov / Math.max(1, s.a)).toFixed(2), ov: Math.round(ov), small: Math.round(s.a), big: Math.round(b.a), at: [Math.round((X0 + X1) / 2), Math.round((Z0 + Z1) / 2)] });
    }
  }
  out.sort((a, b) => b.frac - a.frac);
  const nested = out.filter((o) => o.frac > 0.5);
  return { pass: nested.length === 0, buildings: live.length, touching: out.length, nested: nested.length, top: nested.slice(0, opts.top ?? 10) };
};

// ---- every front door near you: walk its approach (the foot of its steps, then the doorway) in,
// 1.5 m past the wall, and back out. Doors of stand-in tiles (placeholders until a cell's real tile
// lands) are counted apart.
window.__DOORS__ = (opts = {}) => {
  const G = G0(), W = G.walk, max = opts.max ?? 80, r = 0.32;
  const wx = G.walker.x, wz = G.walker.z;
  const standIn = new Set();
  for (const t of G.stream.loaded.values()) if (t.spec.synth) for (const f of t.fps) standIn.add(f);
  const doors = [];
  for (const [f, d] of G.stream.fpDoor ?? []) if (d) doors.push({ f, d, dist: Math.hypot(d.wx - wx, d.wz - wz) });
  doors.sort((a, b) => a.dist - b.dist);
  const fails = [], res = { real: { tried: 0, blocked: 0 }, standIn: { tried: 0, blocked: 0 } };
  for (const { f, d } of doors.slice(0, max)) {
    const side = standIn.has(f) ? res.standIn : res.real;
    side.tried++;
    // start on the sidewalk a step out from the foot of the steps — where it's free: a car at the
    // kerb or a bench can stand there (you'd come up the walk from beside it)
    const foot0 = [d.fx ?? d.wx + d.nx * 1.2, d.fz ?? d.wz + d.nz * 1.2];
    let x = foot0[0] + d.nx, z = foot0[1] + d.nz;
    for (const [o, s] of [[1, 0], [2, 0], [1, 1.2], [1, -1.2], [3, 0], [2, 2.4], [2, -2.4]]) {
      const sx = foot0[0] + d.nx * o - d.nz * s, sz = foot0[1] + d.nz * o + d.nx * s;
      if (!W.blocked(sx, sz, r)) { (x = sx), (z = sz); break; }
    }
    let feet = W.surfaceAt(x, z, (d.fy ?? d.y) + 0.6);
    const walkTo = (tx, tz) => {
      for (let k = 0; k < 120; k++) {
        const dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz);
        if (L < 0.05) return true;
        const s = Math.min(0.1, L);
        const [nx, nz] = W.move(x, z, (dx / L) * s, (dz / L) * s, r, feet);
        if (Math.hypot(nx - x, nz - z) < 0.002) return false; // stuck
        (x = nx), (z = nz);
        const t = W.surfaceAt(x, z, feet + 0.45);
        if (t - feet < 0.45) feet += (t - feet) * 0.8; // (steps up; a drop keeps the floor under you)
      }
      return false;
    };
    const foot = [d.fx ?? d.wx + d.nx * 1.2, d.fz ?? d.wz + d.nz * 1.2];
    const inOk = walkTo(foot[0], foot[1]) && walkTo(d.wx + d.nx * 0.3, d.wz + d.nz * 0.3) && walkTo(d.wx - d.nx * 1.5, d.wz - d.nz * 1.5);
    const inAt = [x, z];
    const outOk = inOk && walkTo(d.wx + d.nx * 0.3, d.wz + d.nz * 0.3) && walkTo(foot[0], foot[1]);
    if (!inOk || !outOk) {
      // not in a straight line: any way at all, round a tree, a hedge's end, a parked car?
      if (floodIn(W, d, r, (px, pz) => G.world.terrain.heightAt(px, pz))) { side.roundabout = (side.roundabout ?? 0) + 1; continue; }
      side.blocked++;
      fails.push({ at: [Math.round(d.wx), Math.round(d.wz)], tile: (f.key ?? '').split(':')[0], kind: f.kind, name: f.name ?? '', stuck: inAt.map((v) => +v.toFixed(1)), leg: !inOk ? 'in' : 'out' });
    }
  }
  return { pass: res.real.blocked === 0, ...res, fails: fails.slice(0, opts.top ?? 12) };
};

/** Is the door's inside (1.4 m past the wall) reachable from anywhere 14 m out in front, by the
 *  walker's own moves (35 cm steps in the door's frame, sliding on walls, climbing what the walker
 *  climbs: a surface up to 75 cm over its feet)? A flood, not a line: the way in may go round a
 *  tree, a hedge's end or a parked car. */
const floodIn = (W, d, r, ground, R = 14, dbg = null) => {
  const S = 0.35, N = Math.ceil(R / S), J0 = -N, tx = -d.nz, tz = d.nx; // (behind the facade too: side steps)
  const at = (i, j) => [d.wx + tx * i * S + d.nx * j * S, d.wz + tz * i * S + d.nz * j * S];
  const key = (i, j) => (i + N) * 1000 + (j - J0);
  const feet = new Map(), q = [];
  for (let i = -N; i <= N; i++) {
    const [x, z] = at(i, N);
    if (W.blocked(x, z, r)) continue;
    feet.set(key(i, N), W.surfaceAt(x, z, ground(x, z) + 0.3));
    q.push([i, N]);
  }
  // in: anywhere 70 cm or more past the doorway, in the building's own rooms (an inner stair can
  // stand square behind the door; you walk round it)
  const [gx, gz] = [d.wx - d.nx * 0.7, d.wz - d.nz * 0.7], home = W.buildingAt(gx, gz);
  if (dbg) Object.assign(dbg, { feet, at, key, S, N });
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h], f0 = feet.get(key(i, j)), [x, z] = at(i, j);
    if (j <= -2 && Math.abs(i) * S < 3 && home >= 0 && W.buildingAt(x, z) === home) return true;
    for (const [di, dj] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < -N || ni > N || nj < J0 || nj > N || feet.has(key(ni, nj))) continue;
      const [bx, bz] = at(ni, nj);
      const [mx, mz] = W.move(x, z, bx - x, bz - z, r, f0);
      if (Math.abs(mx - bx) + Math.abs(mz - bz) > 0.03) continue;
      const f1 = W.surfaceAt(bx, bz, f0);
      if (f1 - f0 > 0.75) continue;
      feet.set(key(ni, nj), f1);
      q.push([ni, nj]);
    }
  }
  return false;
};

// ---- flicker: surfaces fighting for the same pixels (z-fighting), seen by identity, not colour ----
// Each object (and each building inside a merged building mesh, by its aInfo id) is drawn in a flat
// colour of its own. The camera then moves 1 cm sideways and the frame is drawn again: away from
// the edges, a pixel that shows a different surface is two surfaces fighting over it.
const idMaterial = () => {
  const THREE = G0().THREE;
  return (window.__PTID__ ??= new THREE.ShaderMaterial({
    uniforms: { uObj: { value: 0 }, uMode: { value: 0 } },
    vertexShader: `attribute vec4 aInfo; flat varying float vId;
      void main() {
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vId = aInfo.x;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * wp;
      }`,
    fragmentShader: `uniform float uObj; uniform int uMode; flat varying float vId;
      vec3 h3(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
      vec3 bytes(float v) { v = floor(v + 0.5); return vec3(mod(v, 256.0), mod(floor(v / 256.0), 256.0), mod(floor(v / 65536.0), 256.0)) / 255.0; }
      void main() {
        // (0: a colour per surface; 1: the object's number; 2: the building's id inside a merged mesh)
        gl_FragColor = vec4(uMode == 1 ? bytes(uObj) : uMode == 2 ? bytes(vId) : 0.1 + 0.9 * h3(vec2(uObj * 1.618, vId * 0.7071 + 3.0)), 1.0);
      }`,
  }));
};
const readIds = (mode = 0) => {
  const G = G0(), R = G.renderer, W = 320, H = Math.max(1, Math.round((W * innerHeight) / innerWidth));
  idMaterial().uniforms.uMode.value = mode;
  const rt = (window.__PTRT__ ??= new G.THREE.WebGLRenderTarget(W, H, { depthBuffer: true }));
  if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
  const mat = idMaterial(), saved = [];
  const hidden = [];
  G.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    // (a see-through surface that doesn't write depth — foam, wakes, glass — blends over what's
    // behind it: which of two draws last isn't a flicker)
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (o.visible && m0?.transparent && m0.depthWrite === false && m0.depthTest !== false) { o.visible = false; hidden.push(o); return; }
    saved.push([o, o.onBeforeRender]);
    // (drawn as the object's own material draws it: pushed back or pulled forward, depth-tested or
    // not — the sea's offset under the shore, the horizon ring behind everything)
    o.onBeforeRender = () => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      mat.uniforms.uObj.value = (o.id % 4093) + 1;
      mat.uniformsNeedUpdate = true;
      mat.polygonOffset = !!m?.polygonOffset;
      mat.polygonOffsetFactor = m?.polygonOffsetFactor ?? 0;
      mat.polygonOffsetUnits = m?.polygonOffsetUnits ?? 0;
      mat.depthTest = m?.depthTest ?? true;
      mat.depthWrite = m?.depthWrite ?? true;
      mat.side = m?.side ?? 0;
    };
  });
  const prev = G.scene.overrideMaterial, pb = G.scene.background;
  G.scene.overrideMaterial = mat;
  G.scene.background = null;
  R.setRenderTarget(rt);
  R.setClearColor(0x000000, 0);
  R.clear();
  R.render(G.scene, G.camera);
  const px = new Uint8Array(W * H * 4);
  R.readRenderTargetPixels(rt, 0, 0, W, H, px);
  R.setRenderTarget(null);
  G.scene.overrideMaterial = prev;
  G.scene.background = pb;
  for (const [o, f] of saved) o.onBeforeRender = f;
  for (const o of hidden) o.visible = true;
  return { px, W, H };
};
window.__FLICKER__ = async (opts = {}) => {
  // The real frame (the game's own materials — its water, grass and roofs move their vertices in
  // their shaders, which an id pass can't follow), drawn twice with the camera 1 cm apart. A pixel
  // inside a smooth patch of both frames that changes colour is two surfaces fighting over it;
  // edges (which do move a hair) and textured paint are left out.
  const G = G0(), R = G.renderer, cam = G.camera, wait = window.__WAIT__ ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const W = opts.w ?? 480, H = Math.max(1, Math.round((W * innerHeight) / innerWidth));
  const rt = new G.THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  // (opts.near: the frames with that near plane instead — an A/B against the old fixed 25 cm)
  // (opts.bare: the sea plane without its push-back — with near: 0.25, the old frame exactly)
  const sea = [];
  if (opts.bare) G.scene.traverse((o) => { if (o.name === 'water' && o.material?.polygonOffset) sea.push(o.material); });
  const grab = () => {
    const n0 = cam.near;
    for (const m of sea) m.polygonOffset = false;
    if (opts.near) { cam.near = opts.near; cam.updateProjectionMatrix(); }
    R.setRenderTarget(rt); R.clear(); R.render(G.scene, cam);
    const px = new Uint8Array(W * H * 4);
    R.readRenderTargetPixels(rt, 0, 0, W, H, px);
    R.setRenderTarget(null);
    if (opts.near) { cam.near = n0; cam.updateProjectionMatrix(); }
    for (const m of sea) m.polygonOffset = true;
    return px;
  };
  // how much a pixel differs from its neighbours (texture, or an edge)
  const vary = (p, i) => {
    let m = 0;
    for (const o of [-4, 4, -W * 4, W * 4, -W * 4 - 4, -W * 4 + 4, W * 4 - 4, W * 4 + 4]) m = Math.max(m, Math.abs(p[i] - p[i + o]) + Math.abs(p[i + 1] - p[i + o + 1]) + Math.abs(p[i + 2] - p[i + o + 2]));
    return m;
  };
  let worst = 0, total = 0, at = null;
  const right = new G.THREE.Vector3();
  for (let k = 0; k < (opts.frames ?? 3); k++) {
    await wait(opts.gap ?? 60);
    // (a step along the view: edges hardly move, but where two surfaces are within a step of the
    // depth buffer of each other the rounding re-rolls and they trade pixels)
    cam.updateMatrixWorld();
    cam.getWorldDirection(right);
    const a = grab();
    cam.position.addScaledVector(right, opts.shift ?? 0.05);
    cam.updateMatrixWorld();
    const b = grab();
    cam.position.addScaledVector(right, -(opts.shift ?? 0.05));
    cam.updateMatrixWorld();
    let fight = 0, sx = 0, sy = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        // a jump well past what the pixel's own neighbourhood varies by (a textured patch shimmers
        // a little as it slides; two surfaces trading the pixel jump from one colour to the other)
        const dv = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (dv <= (opts.jump ?? 40) || dv <= 2.5 * Math.max(vary(a, i), vary(b, i))) continue;
        fight++; sx += x; sy += H - 1 - y;
      }
    const share = fight / (W * H);
    total += fight;
    if (share > worst) (worst = share), (at = fight ? [Math.round(sx / fight), Math.round(sy / fight)] : null);
  }
  rt.dispose();
  return { pass: worst < (opts.limit ?? 0.002), worstShare: +worst.toFixed(4), pixels: total, centre: at };
};

// ---- fly up and look down: the ground holds still ----
window.__ALTITUDE__ = async (opts = {}) => {
  const G = G0(), wait = window.__WAIT__ ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const x = G.walker.x, z = G.walker.z, yaw = G.walker.yaw, out = [];
  for (const h of opts.heights ?? [150, 400, 900]) {
    G.walkParams.fly = true;
    G.walker.place(x, z, yaw, -0.6);
    G.walker.y = Math.max(0, G.world.terrain.heightAt(x, z)) + h;
    await wait(1500);
    const f = await window.__FLICKER__({ frames: opts.frames ?? 3, gap: 150, limit: opts.limit ?? 0.004, near: opts.near });
    out.push({ h, near: +G.camera.near.toFixed(2), ...f });
  }
  G.walkParams.fly = false;
  G.walker.place(x, z, yaw, 0);
  return { pass: out.every((o) => o.pass), heights: out };
};

window.__PLAYTEST__ = async (opts = {}) => {
  const t0 = performance.now(), report = {};
  report.overlaps = window.__OVERLAPS__(opts);
  report.doors = window.__DOORS__(opts);
  report.flicker = await window.__FLICKER__(opts);
  if (opts.altitude !== false) report.altitude = await window.__ALTITUDE__(opts);
  report.errors = window.__RENDER_INFO__?.errors ?? null;
  report.pass = Object.values(report).every((v) => !v || typeof v !== 'object' || v.pass !== false);
  report.ms = Math.round(performance.now() - t0);
  window.__PLAYTEST_LAST__ = report;
  return report;
};

// ---- why a door is shut: what stands round its approach (diagnostic) ----
window.__DOORWHY__ = (wx, wz, R = 3.5) => {
  const G = G0(), W = G.walk;
  let best = null, bd = 1e9;
  for (const [f, d] of G.stream.fpDoor ?? []) if (d) { const k = Math.hypot(d.wx - wx, d.wz - wz); if (k < bd) (bd = k), (best = { f, d }); }
  if (!best) return null;
  const { f, d } = best, cx = d.wx + d.nx * 1.5, cz = d.wz + d.nz * 1.5;
  const segs = [];
  W.segs.forEach((s, i) => {
    if (W.segDead[i]) return;
    const [ax, az, bx, bz, y0, y1] = s, ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
    const t = L2 ? Math.max(0, Math.min(1, ((cx - ax) * ex + (cz - az) * ez) / L2)) : 0;
    const dist = Math.hypot(ax + ex * t - cx, az + ez * t - cz);
    if (dist < R) segs.push({ i, dist: +dist.toFixed(2), a: [+ax.toFixed(2), +az.toFixed(2)], b: [+bx.toFixed(2), +bz.toFixed(2)], len: +Math.sqrt(L2).toFixed(2), y: [+y0.toFixed?.(2) ?? y0, +y1.toFixed?.(2) ?? y1] });
  });
  segs.sort((a, b) => a.dist - b.dist);
  const prof = [];
  for (const o of [4, 3, 2, 1.5, 1, 0.5, 0.3, 0, -0.5, -1.5]) {
    const x = d.wx + d.nx * o, z = d.wz + d.nz * o;
    prof.push({ o, poly: W.buildingAt(x, z), ground: +G.world.terrain.heightAt(x, z).toFixed(2), surf: +W.surfaceAt(x, z).toFixed(2), blocked: W.blocked(x, z, 0.32) });
  }
  return { door: { wx: +d.wx.toFixed(2), wz: +d.wz.toFixed(2), nx: +d.nx.toFixed(2), nz: +d.nz.toFixed(2), w: d.w, y: d.y, fy: d.fy, fx: d.fx, fz: d.fz }, fp: { kind: f.kind, base: f.base, floor0: f.floor0, raise: f.raise, top: f.top }, prof, segs: segs.slice(0, 24) };
};

// the flood's view of a door: how near it got, and what stopped it on the way up the steps
window.__DOORFLOOD__ = (wx, wz) => {
  const G = G0(), W = G.walk;
  let best = null, bd = 1e9;
  for (const [, d] of G.stream.fpDoor ?? []) if (d) { const k = Math.hypot(d.wx - wx, d.wz - wz); if (k < bd) (bd = k), (best = d); }
  const d = best, dbg = {};
  const ok = floodIn(W, d, 0.32, (x, z) => G.world.terrain.heightAt(x, z), 14, dbg);
  const cells = [...dbg.feet.entries()].map(([k, f]) => { const i = Math.floor(k / 1000) - dbg.N, j = (k % 1000) - dbg.N; const [x, z] = dbg.at(i, j); return { i, j, x, z, f }; });
  const near = (px, pz) => cells.reduce((b, c) => (Math.hypot(c.x - px, c.z - pz) < Math.hypot(b.x - px, b.z - pz) ? c : b), cells[0]);
  const r2 = (v) => +v.toFixed(2);
  const nf = d.fx != null ? near(d.fx, d.fz) : null, nd = near(d.wx + d.nx * 0.3, d.wz + d.nz * 0.3);
  // along the line from the foot of the steps to the porch in front of the door: the surface, and blocked?
  const line = [];
  if (d.fx != null) {
    const px = d.wx + d.nx * 0.8, pz = d.wz + d.nz * 0.8;
    for (let k = 0; k <= 16; k++) { const t = k / 16, x = d.fx + (px - d.fx) * t, z = d.fz + (pz - d.fz) * t; line.push([r2(x), r2(z), r2(W.surfaceAt(x, z)), W.blocked(x, z, 0.32) ? 'B' : '.']); }
  }
  const lane = (i) => cells.filter((c) => c.i === i).sort((a, b) => a.j - b.j).map((c) => [c.j, r2(c.f)]);
  window.__LANE__ = lane;
  return { ok, reached: cells.length, foot: d.fx != null ? [r2(d.fx), r2(d.fz), r2(d.fy)] : null, nearFoot: nf && [r2(nf.x), r2(nf.z), r2(nf.f), r2(Math.hypot(nf.x - d.fx, nf.z - d.fz))], nearDoor: [r2(nd.x), r2(nd.z), r2(nd.f), r2(Math.hypot(nd.x - d.wx - d.nx * 0.3, nd.z - d.wz - d.nz * 0.3))], line };
};

// ---- walk a line the way the walker does, and say where it stopped and what it stood on ----
window.__WALKTRACE__ = (x0, z0, x1, z1, feet0) => {
  const G = G0(), W = G.walk, r = 0.32, out = [];
  let x = x0, z = z0, feet = feet0 ?? W.surfaceAt(x0, z0, G.world.terrain.heightAt(x0, z0) + 0.3);
  for (let k = 0; k < 400; k++) {
    const dx = x1 - x, dz = z1 - z, L = Math.hypot(dx, dz);
    if (L < 0.05) { out.push('arrived'); break; }
    const s = Math.min(0.1, L);
    const [nx, nz] = W.move(x, z, (dx / L) * s, (dz / L) * s, r, feet);
    if (Math.hypot(nx - x, nz - z) < 0.002) {
      // what's in the way: walls within r+0.05 whose band holds the feet
      const hit = [];
      W.segs.forEach((sg, i) => {
        if (W.segDead[i] || feet < sg[4] || feet > sg[5]) return;
        const [ax, az, bx, bz] = sg, ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
        const t = L2 ? Math.max(0, Math.min(1, ((x + (dx / L) * s - ax) * ex + (z + (dz / L) * s - az) * ez) / L2)) : 0;
        const dd = Math.hypot(ax + ex * t - x - (dx / L) * s, az + ez * t - z - (dz / L) * s);
        if (dd < r + 0.05) hit.push({ i, dd: +dd.toFixed(2), a: [+ax.toFixed(2), +az.toFixed(2)], b: [+bx.toFixed(2), +bz.toFixed(2)], y: [sg[4], sg[5]] });
      });
      out.push({ stuck: [+x.toFixed(2), +z.toFixed(2)], feet: +feet.toFixed(2), walkable: W.walkable(x + (dx / L) * s, z + (dz / L) * s), hit: hit.slice(0, 6) });
      break;
    }
    (x = nx), (z = nz);
    const t = W.surfaceAt(x, z, feet);
    if (isFinite(t)) feet = t;
    if (k % 5 === 0) out.push([+x.toFixed(2), +z.toFixed(2), +feet.toFixed(2)]);
  }
  return out;
};

// ---- the walls round a point (diagnostic): [a, b, band] within R ----
window.__SEGS__ = (cx, cz, R = 4, feet) => {
  const W = G0().walk, out = [];
  W.segs.forEach((s, i) => {
    if (W.segDead[i]) return;
    const [ax, az, bx, bz, y0, y1] = s;
    if (feet !== undefined && (feet < y0 || feet > y1)) return;
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
    const t = L2 ? Math.max(0, Math.min(1, ((cx - ax) * ex + (cz - az) * ez) / L2)) : 0;
    const d = Math.hypot(ax + ex * t - cx, az + ez * t - cz);
    if (d < R) out.push([i, +d.toFixed(2), [+ax.toFixed(2), +az.toFixed(2)], [+bx.toFixed(2), +bz.toFixed(2)], [y0 === -Infinity ? '-' : +y0.toFixed(2), y1 === Infinity ? '+' : +y1.toFixed(2)]]);
  });
  return out.sort((a, b) => a[1] - b[1]);
};

// ---- who fights: the objects (and buildings) behind the flickering pixels ----
window.__FLICKERWHO__ = (opts = {}) => {
  const G = G0(), cam = G.camera, byObj = new Map();
  G.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) byObj.set((o.id % 4093) + 1, o); });
  const shift = opts.shift ?? 0.01, right = new G.THREE.Vector3();
  cam.updateMatrixWorld();
  right.setFromMatrixColumn(cam.matrixWorld, 0);
  const shot = () => [readIds(0), readIds(1), readIds(2)];
  const A = shot();
  cam.position.addScaledVector(right, shift); cam.updateMatrixWorld();
  const B = shot();
  cam.position.addScaledVector(right, -shift); cam.updateMatrixWorld();
  const px = A[0].px, W = A[0].W, H = A[0].H, same = (p, i, j) => p[i] === p[j] && p[i + 1] === p[j + 1] && p[i + 2] === p[j + 2];
  const val = (p, i) => p[i] + p[i + 1] * 256 + p[i + 2] * 65536;
  const pairs = new Map();
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      if (px[i + 3] === 0 || !same(px, i, i - 4) || !same(px, i, i + 4) || !same(px, i, i - W * 4) || !same(px, i, i + W * 4)) continue;
      if (same(px, i, i) && px[i] === B[0].px[i] && px[i + 1] === B[0].px[i + 1] && px[i + 2] === B[0].px[i + 2]) continue;
      const oa = byObj.get(val(A[1].px, i)), ob = byObj.get(val(B[1].px, i));
      const nm = (o) => (o ? o.name || `${o.parent?.name || '-'}/${o.type}(r${o.renderOrder},${o.material?.transparent ? 't' : 'o'}${o.material?.depthTest === false ? ',nodepth' : ''},${Math.round(o.geometry?.boundingSphere?.radius ?? -1)}m)` : '?');
      const na = `${nm(oa)}#${val(A[2].px, i)}`, nb = `${nm(ob)}#${val(B[2].px, i)}`;
      const k = [na, nb].sort().join(' ⇄ ');
      const e = pairs.get(k) ?? { n: 0, x: 0, y: 0 };
      e.n++; e.x += x; e.y += y;
      pairs.set(k, e);
    }
  return [...pairs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, opts.top ?? 10).map(([k, e]) => ({ pair: k, px: e.n, at: [Math.round(e.x / e.n), Math.round(e.y / e.n)] }));
};

// ---- the id frames and their difference, as pictures (diagnostic): saved to shots/ ----
window.__FLICKERPNG__ = async (tag = 'fl', shift = 0.01) => {
  const G = G0(), cam = G.camera, right = new G.THREE.Vector3();
  cam.updateMatrixWorld();
  right.setFromMatrixColumn(cam.matrixWorld, 0);
  const a = readIds(0);
  cam.position.addScaledVector(right, shift); cam.updateMatrixWorld();
  const b = readIds(0);
  cam.position.addScaledVector(right, -shift); cam.updateMatrixWorld();
  const { W, H } = a, c = document.createElement('canvas');
  c.width = W * 3; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W * 3, H);
  for (let y = 0; y < H; y++)
    for (let i = 0; i < W; i++) {
      const s = ((H - 1 - y) * W + i) * 4; // (GL rows run bottom-up)
      for (let k = 0; k < 3; k++) {
        const d = (y * W * 3 + i + k * W) * 4;
        const diff = a.px[s] !== b.px[s] || a.px[s + 1] !== b.px[s + 1] || a.px[s + 2] !== b.px[s + 2];
        const src = k === 0 ? a.px : b.px;
        if (k < 2) { img.data[d] = src[s]; img.data[d + 1] = src[s + 1]; img.data[d + 2] = src[s + 2]; }
        else { img.data[d] = diff ? 255 : a.px[s] * 0.25; img.data[d + 1] = diff ? 0 : a.px[s + 1] * 0.25; img.data[d + 2] = diff ? 0 : a.px[s + 2] * 0.25; }
        img.data[d + 3] = 255;
      }
    }
  x.putImageData(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch(`/__shot?name=${tag}.png`, { method: 'POST', body: blob });
  return `${tag}.png`;
};

// ---- the real frame twice, the camera 1 cm apart: what changes (diagnostic, saved to shots/) ----
window.__REALDIFF__ = async (tag = 'rd', shift = 0.01) => {
  const G = G0(), R = G.renderer, cam = G.camera, W = 480, H = Math.max(1, Math.round((W * innerHeight) / innerWidth));
  const rt = new G.THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const grab = () => { R.setRenderTarget(rt); R.clear(); R.render(G.scene, cam); const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px); R.setRenderTarget(null); return px; };
  const right = new G.THREE.Vector3();
  cam.updateMatrixWorld();
  right.setFromMatrixColumn(cam.matrixWorld, 0);
  const a = grab();
  cam.position.addScaledVector(right, shift); cam.updateMatrixWorld();
  const b = grab();
  cam.position.addScaledVector(right, -shift); cam.updateMatrixWorld();
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = W * 3; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W * 3, H);
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let i = 0; i < W; i++) {
      const s = ((H - 1 - y) * W + i) * 4;
      const dv = Math.abs(a[s] - b[s]) + Math.abs(a[s + 1] - b[s + 1]) + Math.abs(a[s + 2] - b[s + 2]);
      if (dv > 24) n++;
      for (let k = 0; k < 3; k++) {
        const d = (y * W * 3 + i + k * W) * 4, src = k === 1 ? b : a;
        if (k < 2) for (let q = 0; q < 3; q++) img.data[d + q] = src[s + q];
        else { img.data[d] = dv > 24 ? 255 : a[s] * 0.3; img.data[d + 1] = dv > 24 ? 0 : a[s + 1] * 0.3; img.data[d + 2] = dv > 24 ? 0 : a[s + 2] * 0.3; }
        img.data[d + 3] = 255;
      }
    }
  x.putImageData(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await fetch(`/__shot?name=${tag}.png`, { method: 'POST', body: blob });
  return { file: `${tag}.png`, changed: +(n / (W * H)).toFixed(4) };
};

// ---- does __FLICKER__ see a fight? two coplanar quads in front of the camera must fail it ----
window.__FLICKER_SELFTEST__ = async () => {
  const G = G0(), T = G.THREE, cam = G.camera, fwd = new T.Vector3();
  cam.getWorldDirection(fwd);
  // (a real fight: two surfaces a hair apart, tessellated differently — like a sea plane under
  // shore ground, or two copies of one wall)
  const g = new T.Group();
  // two ground sheets seen at a slant, 5 mm apart (the sea plane under low shore, from the air)
  fwd.y = 0;
  fwd.normalize();
  [[0xff2020, 1, 0, 0], [0x20ff20, 9, 0.4, 0.005]].forEach(([c, seg, rot, off]) => {
    const m = new T.Mesh(new T.PlaneGeometry(300, 300, seg, seg).rotateZ(rot).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide }));
    m.position.copy(cam.position).addScaledVector(fwd, 300);
    m.position.y += 40 - off; // (a ceiling in the sky ahead: nothing of the world's in front of it)
    g.add(m);
  });
  G.scene.add(g);
  const r = await window.__FLICKER__({ frames: 2, near: 0.25 });
  G.scene.remove(g);
  return { detects: !r.pass, ...r };
};

// ---- a flight over the ground: frames as a contact sheet, and the ground's blue/green flips between
// frames (the ground should drift under you, never flash) ----
window.__FLYOVER__ = async (opts = {}) => {
  const G = G0(), h = opts.h ?? 800, n = opts.frames ?? 12, step = opts.step ?? 30, yaw = opts.yaw ?? Math.PI;
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const W = 192, H = 108, sheet = document.createElement('canvas');
  sheet.width = W * 4; sheet.height = H * Math.ceil(n / 4);
  const sx = sheet.getContext('2d'), frames = [];
  let x = opts.x ?? G.walker.x, z = opts.z ?? G.walker.z;
  G.walkParams.fly = true;
  const cls = (r, g, b) => (b > g + 12 && b > r + 12 ? 1 : g > b + 8 && g >= r - 6 ? 2 : 0); // water-ish / green-ish / other
  let flips = 0, worst = 0;
  for (let k = 0; k < n; k++) {
    G.walker.place(x, z, yaw, opts.pitch ?? -0.75);
    G.walker.y = Math.max(0, G.world.terrain.heightAt(x, z)) + h;
    for (let f = 0; f < (opts.settle ?? 3); f++) await raf();
    sx.drawImage(G.renderer.domElement, (k % 4) * W, Math.floor(k / 4) * H, W, H);
    const px = sx.getImageData((k % 4) * W, Math.floor(k / 4) * H, W, H).data, c = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) c[i] = cls(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (frames.length) {
      const p = frames[frames.length - 1];
      let d = 0;
      for (let i = 0; i < W * H; i++) if (c[i] && p[i] && c[i] !== p[i]) d++;
      flips += d;
      worst = Math.max(worst, d / (W * H));
    }
    frames.push(c);
    x += Math.sin(yaw) * -step; z += Math.cos(yaw) * -step; // (forward: the walker's −z at yaw 0)
  }
  G.walkParams.fly = false;
  const blob = await new Promise((r) => sheet.toBlob(r, 'image/jpeg', 0.85));
  const name = `${opts.tag ?? 'fly'}_${h}.jpg`;
  await fetch(`/__shot?name=${name}`, { method: 'POST', body: blob });
  return { file: name, worstFlip: +worst.toFixed(4), flips };
};
