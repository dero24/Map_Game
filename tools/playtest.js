// Playtest: gameplay checks that run on any place the game can stream (?at=lat,lon&capture=1).
//   await import('/tools/playtest.js');
//   await __PLAYTEST__({ only, skip, quick, selftest, seed, seconds, <check>: false | {opts} })
//                                   every check below, a pass/fail report (window.__PLAYTEST_LAST__)
//   __OVERLAPS__()                  walkable buildings standing inside or across each other
//   __DOORS__({ max: 80 })          walk in through every front door near you, and back out
//   __ROADPOSTS__({ R: 600 })       posts, masts, poles standing in a car street's lanes
//   __ROADWALLS__({ R: 600 })       walls, footprints, deck gaps in a car street's lanes (bridges too)
//   await __FLICKER__({ frames })   the same view drawn twice: pixels that change with nothing moving
//   await __ALTITUDE__({ heights }) fly up and look down: the ground holds still (no water/land flashing)
//   await __FRAMES__({ seconds })   frame pacing standing, walking, then flying: percentiles and hitches against a budget
//   await __WALKABOUT__({ seconds, seed })  the walker's own moves on seeded routes: streets, in at doors, up the stairs, out
//   await __DRIVE__({ seconds, seed })      take a parked car with E, drive the streets, get out and back in
//   await __TELEPORTS__({ n, seed })        teleports to doors, streets and anywhere, settleWalker: where you're left
//   await __STREAMING__({ seconds })        after a teleport and on the move: the tile ring fills in, cleanly
//   await __SELFTESTS__({ only })           each check against failures planted for it (__<CHECK>_SELFTEST__)
// Nothing about a place is written here: the buildings, doors and ground are the page's own. The
// pure parts (routes, the path planner, frame statistics, the report's text) are playtest-core.js.
import { CHECKS, planChecks, rng, yawTo, wrapAngle, gridPath, roadGraph, nearestNode, NOT_FOR_CARS, randomRoute, cumLength, pointAlong, closestAlong, offsetPolyline, resample, roadIndex, roadDist, frameStats, judgeFrames, softGpu, FRAME_BUDGETS, summarize, verdictLine } from './playtest-core.js';

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

// ================================================================ play: walk, drive, teleport, stream, frames
// These drive the game's own code: the walker's `update` (its keys set for it, the yaw steered) and
// the interiors it walks into, the rides' `update` and E (`toggle`), `__GAME__.ctx.teleport` (the
// atlas's "walk here") and `settleWalker`, the tile stream. A walk or a drive runs in fixed 1/60 s
// steps, straight through (the page's own frames don't run in between unless asked): a slow GPU
// walks as far as a fast one, and a seed gives the same walk every time. Routes, doors and cars are
// chosen by a seeded stream over what stands near the start, in a stable order. Each check puts the
// walker back.
//
// Each check has a self-test (`__WALKABOUT_SELFTEST__` …, all of them: `__SELFTESTS__`) that plants
// the failures it claims to catch — a wall landing on the walker, a building with no walls on a
// car's route, a fenced yard with no gate where a teleport lands, a ghost copy of a tile, stalled
// frames — and passes only when the check fails on every one of them.

const WR = 0.32; // the walker's radius (controller.ts)
const PLANT = -4242; // the walk-world scope planted failures go in (tiles count up from 1; interiors use −7)
const breathe = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => (window.__WAIT__ ?? ((t) => new Promise((r) => setTimeout(r, t))))(ms);
const r2 = (v) => Math.round(v * 100) / 100;

/** The walker's own move a → b, as the planner sees it: the feet after the step, NaN when a wall,
 *  the water's edge or a rise of more than 75 cm is in the way (floodIn's rule). */
const walkStep = (W) => (ax, az, af, bx, bz) => {
  const [mx, mz] = W.move(ax, az, bx - ax, bz - az, WR, af);
  if (Math.abs(mx - bx) + Math.abs(mz - bz) > 0.03) return NaN;
  const f = W.surfaceAt(bx, bz, af);
  return Number.isFinite(f) && f - af <= 0.75 ? f : NaN;
};

/** A spot a walker can stand on near (x, z), out in the open (`want: 'out'`), in a building's
 *  rooms ('in') or either — rings out from r0 to R; `at`: on the floor at that height. [x, z, feet]
 *  or null. */
const freeNear = (G, x, z, { want = 'any', R = 3, r0 = 0, feet, at } = {}) => {
  const W = G.walk, T = G.world.terrain;
  for (let r = r0; r <= R + 1e-6; r += 0.35) {
    const n = r ? Math.ceil((2 * Math.PI * r) / 0.35) : 1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!W.walkable(px, pz)) continue;
      const b = W.buildingAt(px, pz);
      if ((want === 'out' && b >= 0) || (b >= 0 && !W.floorsOf(b))) continue;
      const f = W.surfaceAt(px, pz, feet ?? Math.max(T.heightAt(px, pz), -0.2) + 0.3);
      if (!Number.isFinite(f) || (want === 'in' && W.interiorAt(px, pz, f) < 0)) continue;
      if (at !== undefined && Math.abs(f - at) > 0.15) continue;
      if (W.touching(px, pz, WR + 0.03, f)) continue;
      return [px, pz, f];
    }
  }
  return null;
};

/** The wall nearest (x, z) whose height band holds `f` (evidence for a report). */
const nearSeg = (W, x, z, f) => {
  let best = null, bd = Infinity;
  for (let i = 0; i < W.segs.length; i++) {
    if (W.segDead[i]) continue;
    const s = W.segs[i];
    if (f !== undefined && (f < s[4] || f > s[5])) continue;
    if (Math.min(s[0], s[2]) > x + 8 || Math.max(s[0], s[2]) < x - 8 || Math.min(s[1], s[3]) > z + 8 || Math.max(s[1], s[3]) < z - 8) continue;
    const ex = s[2] - s[0], ez = s[3] - s[1], L2 = ex * ex + ez * ez;
    const t = L2 ? Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / L2)) : 0;
    const d = Math.hypot(s[0] + ex * t - x, s[1] + ez * t - z);
    if (d < bd) (bd = d), (best = { i, d: r2(d), a: [r2(s[0]), r2(s[1])], b: [r2(s[2]), r2(s[3])], band: [s[4] === -Infinity ? '-' : r2(s[4]), s[5] === Infinity ? '+' : r2(s[5])] });
  }
  return best;
};

/** How far (x, z) is from the nearest wall of any height (up to R): how deep a point that's inside a
 *  footprint is. Reads the walk world's own 8 m grid. */
const wallDist = (W, x, z, R = 3) => {
  const C = W.cell ?? 8, seen = new Set();
  let best = R;
  for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++)
    for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++)
      for (const id of W.grid?.get(i * 73856093 ^ j * 19349663) ?? []) {
        if (seen.has(id) || W.segDead[id]) continue;
        seen.add(id);
        const s = W.segs[id], ex = s[2] - s[0], ez = s[3] - s[1], L2 = ex * ex + ez * ez;
        const t = L2 ? Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / L2)) : 0;
        best = Math.min(best, Math.hypot(s[0] + ex * t - x, s[1] + ez * t - z));
      }
  return best;
};

/** What's wrong with standing at (x, z) with the feet at f: in a wall, in a solid building, off the
 *  walkable world (the water), under the ground or off the surface, shut in (nowhere 3 m away to
 *  walk to). An empty list is a good place to stand. */
const standProblems = (G, x, z, f) => {
  const W = G.walk, out = [];
  if (![x, z, f].every(Number.isFinite)) return ['NaN'];
  if (!W.walkable(x, z)) out.push('not walkable (water?)');
  if (W.touching(x, z, 0.28, f)) out.push('in a wall');
  const b = W.buildingAt(x, z);
  if (b >= 0 && !W.floorsOf(b)) out.push('in a solid building');
  const s = W.surfaceAt(x, z, f), low = W.surfaceAt(x, z, -1e6);
  if (f < low - 0.3) out.push(`under the ground (${r2(f - low)} m)`);
  else if (Math.abs(f - s) > 0.3) out.push(`off the surface (${r2(f - s)} m)`);
  const fl = gridPath({ start: { x, z, f }, goal: null, step: walkStep(W), cell: 0.35, radius: 5, maxNodes: 3000, layer: 1.2 });
  if (fl.far < 3) out.push(`shut in (${fl.far} m)`);
  return out;
};

/** Counts per kind of trouble, and the first examples (one per 3 m per kind). */
const events = (max = 40) => {
  const counts = {}, ex = [];
  const note = (kind, at, extra) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (ex.length < max && !ex.some((e) => e.kind === kind && Math.hypot(e.at[0] - at[0], e.at[1] - at[1]) < 3)) ex.push({ kind, at: at.map(r2), ...(extra ? extra() : {}) });
  };
  return { counts, ex, note };
};

/** Streets with a point within R of (x, z): the loaded tiles' own (full detail), else the manifest's. */
const roadsNear = (G, x, z, R) => {
  const src = G.stream.primRoads.length ? G.stream.primRoads : G.ctx.roads();
  return src.filter((r) => {
    for (let i = 0; i + 1 < r.p.length; i += 2) if (Math.abs(r.p[i] / 10 - x) < R && Math.abs(r.p[i + 1] / 10 - z) < R) return true;
    return false;
  });
};
/** Front doors within R of (x, z), nearest first (ties by position: a stable order). */
const doorList = (G, x, z, R) =>
  G.stream.doors
    .map((d) => ({ d, k: Math.hypot(d.wx - x, d.wz - z) }))
    .filter((e) => e.k < R)
    .sort((a, b) => a.k - b.k || a.d.wx - b.d.wx || a.d.wz - b.d.wz)
    .map((e) => e.d);
/** The building plan behind a front door (its storeys, flights), or null. */
const planOfDoor = (G, d) => {
  for (const [f, dd] of G.stream.fpDoor ?? []) if (dd === d) return G.stream.plans.get(f.key) ?? null;
  return null;
};
/** The way up a building's stair from its door's storey to the one above, as the walker climbs
 *  it: the foot of the first flight (60 cm before its bottom step, on its centreline), then the top
 *  of each flight in turn (a dogleg's two halves meet at a landing), the last one 80 cm onto the
 *  floor above (less if a wall stands there). [{ p: [x, z], f, what }] or null (no stair from the
 *  door's storey). */
const stairWay = (G, P) => {
  const W = G.walk, f0 = P.floor0, H = P.floorH;
  const toW = (u, v) => [P.cx + P.ux * u + P.vx * v, P.cz + P.uz * u + P.vz * v];
  const ends = (F) => {
    const c = F.axis ? (F.u0 + F.u1) / 2 : (F.v0 + F.v1) / 2, dir = Math.sign(F.topU - F.bottomU) || 1;
    const at = (a) => (F.axis ? toW(c, a) : toW(a, c));
    return { at, dir, bottom: at(F.bottomU), top: at(F.topU), lo: F.lo ?? 0, hi: F.hi ?? 1 };
  };
  const fl = (P.flights ?? []).filter((F) => F.level === 0).map((F) => ({ F, e: ends(F) }));
  const d = P.door;
  for (const s of fl.filter((q) => q.e.lo < 0.001).sort((a, b) => Math.hypot(a.e.bottom[0] - d.wx, a.e.bottom[1] - d.wz) - Math.hypot(b.e.bottom[0] - d.wx, b.e.bottom[1] - d.wz))) {
    // a chain of flights, each starting where the last stopped (its landing), up to the next storey
    const chain = [s];
    while (chain[chain.length - 1].e.hi < 0.999) {
      const last = chain[chain.length - 1].e;
      const next = fl.find((q) => !chain.includes(q) && Math.abs(q.e.lo - last.hi) < 0.01 && Math.hypot(q.e.bottom[0] - last.top[0], q.e.bottom[1] - last.top[1]) < 3);
      if (!next) break;
      chain.push(next);
    }
    if (chain[chain.length - 1].e.hi < 0.999) continue;
    const way = [];
    chain.forEach(({ e }, i) => {
      const y0 = f0 + e.lo * H, y1 = f0 + e.hi * H, lastOne = i === chain.length - 1;
      const F = chain[i].F;
      if (i > 0) {
        // (round the turn on the landing: its middle, then onto the next flight)
        const Lg = (P.landings ?? []).filter((q) => q.level === 0 && Math.abs(f0 + q.y * H - y0) < 0.05).map((q) => ({ c: toW((q.u0 + q.u1) / 2, (q.v0 + q.v1) / 2) })).sort((a, b) => Math.hypot(a.c[0] - e.bottom[0], a.c[1] - e.bottom[1]) - Math.hypot(b.c[0] - e.bottom[0], b.c[1] - e.bottom[1]))[0];
        if (Lg) way.push({ p: Lg.c, f: y0, what: 'landing' });
      }
      way.push(i === 0 ? { p: e.at(F.bottomU - e.dir * 0.6), f: y0, what: 'foot' } : { p: e.at(F.bottomU + e.dir * 0.3), f: y0, what: 'next flight' });
      let top = e.at(F.topU + e.dir * 0.3);
      if (lastOne) for (const past of [0.8, 0.55]) {
        const q = e.at(F.topU + e.dir * past), g = W.surfaceAt(q[0], q[1], y1 + 0.05);
        if (Math.abs(g - y1) < 0.05 && !W.touching(q[0], q[1], WR + 0.02, y1)) { top = q; break; }
      }
      way.push({ p: top, f: y1, what: lastOne ? 'top' : 'up to the landing' });
    });
    return way;
  }
  return null;
};

/** A teleport there stays in this page (main.ts teleportTo): inside the region's backdrop, or
 *  within 80 km with a tile service. Anywhere else reloads the page on another region. */
const inFrame = (G, x, z) => {
  const b = G.world.json.backdrop;
  return (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) || (!!(G.stream.tilesBase || G.stream.man.tilesUrl) && Math.hypot(x, z) < 80000);
};

const gpuName = (G) => {
  try {
    const gl = G.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
    return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { return ''; }
};
/** Wait for the page to draw n more frames (or ms, whichever comes first). */
const frames = async (n = 1, ms = 8000) => {
  const f0 = window.__RENDER_INFO__?.frames ?? 0, t0 = performance.now();
  while ((window.__RENDER_INFO__?.frames ?? 0) - f0 < n && performance.now() - t0 < ms) await wait(30);
};
/** The game's own rescue (main.ts settleWalker: a wall through you, a solid building round you →
 *  stepped clear), run now rather than at its next once-a-second turn. */
const settle = (G) => G.stream.onMount?.(null);

// ---- planted failures (the self-tests): walls and footprints in a walk-world scope of their own ----
const plantIn = (W, fn) => W.withScope(PLANT, fn);
const unplant = (W) => W.removeScope(PLANT, true);
/** A closed ring of walls round (x, z) — a fenced yard with no gate. */
const plantRing = (W, x, z, r, n = 12) => plantIn(W, () => W.addLoop(Array.from({ length: n }, (_, k) => [x + Math.cos((k / n) * 2 * Math.PI) * r, z + Math.sin((k / n) * 2 * Math.PI) * r])));
/** A footprint with no rooms and no walls: a building nothing keeps you out of. */
const plantHollow = (W, x, z, hx, hz = hx) => plantIn(W, () => {
  const rec = W.scopeIds.get(PLANT), n0 = rec.segs.length;
  W.addPolygon([[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]]);
  for (const id of rec.segs.slice(n0)) W.segDead[id] = 1;
});
const PLANTED_ERR = 'playtest-planted'; // (a page error a self-test throws on purpose: the runner leaves it out)
/** A plant that fires until it says it's done (returns true); `.done` says whether it did. */
const once = (fn) => { const f = (...a) => { if (!f.done && fn(...a)) f.done = true; }; f.done = false; return f; };

// ---- walk: seeded routes along the streets (one side, then a door: up to it, in, up its stairs,
// and back out) ----
window.__WALKABOUT__ = async (opts = {}) => {
  const G = G0(), W = G.walk, w = G.walker, V = G.vehicles;
  // (simulated seconds: the walk runs in fixed steps, a few ms of real time a simulated second)
  const seconds = opts.seconds ?? 300, dt = opts.dt ?? 1 / 60, stuckS = opts.stuckS ?? 4, top = opts.top ?? 12;
  const R = rng((opts.seed ?? 1) * 7919 + 1), wall0 = performance.now(), maxMs = opts.maxMs ?? Math.max(120000, seconds * 1000);
  const plant = typeof opts.plant === 'function' ? opts.plant : () => {}; // (self-tests: a failure planted at a moment of the walk)
  if (V.driving) V.toggle();
  const fly0 = G.walkParams.fly;
  G.walkParams.fly = false;
  const start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const cam = new G.THREE.PerspectiveCamera(), keys = new Set(), step = walkStep(W);
  const { counts, ex, note } = events();
  const graph = roadGraph(roadsNear(G, start.x, start.z, 500));
  let simT = 0, ticks = 0, metres = 0, legs = 0, doorsIn = 0, doorsOut = 0, upstairs = 0, noUp = 0, shut = 0, noWay = 0, settled = 0, run = false;
  let underT = 0, floatT = 0, lastYield = 0;
  const tried = new Set(), log = [];
  const over = () => simT >= seconds || performance.now() - wall0 > maxMs;
  const trace = (what) => { if (opts.trace) log.push({ t: r2(simT), at: [r2(w.x), r2(w.z), r2(w.feet)], ...what }); };

  // after each step: never NaN, never in a wall (at 28 cm, inside the 32 cm body), never in a solid
  // building, never below every surface here, never floating or sunk for long (the feet settle
  // onto the surface in a fraction of a second: a step up a stair, a drop off a porch)
  const inspect = () => {
    const x = w.x, z = w.z, f = w.feet, at = [x, z, f];
    if (![x, z, w.y, f, w.yaw].every(Number.isFinite)) return note('nan', [0, 0, 0]), false;
    if (W.touching(x, z, 0.28, f)) note('wall', at, () => ({ seg: nearSeg(W, x, z, f) }));
    const b = W.buildingAt(x, z);
    if (b >= 0 && !W.floorsOf(b)) note('solid', at, () => ({ building: b }));
    const low = W.surfaceAt(x, z, -1e6), tgt = W.surfaceAt(x, z, f);
    underT = f < low - 0.3 ? underT + dt : 0;
    if (f < low - 1 || underT > 0.3) note('under', at, () => ({ by: r2(low - f) }));
    floatT = Math.abs(f - tgt) > 0.3 ? floatT + dt : 0;
    if (floatT > 0.5) note(f > tgt ? 'floating' : 'sunk', at, () => ({ by: r2(f - tgt) }));
    return true;
  };
  // one step of the game's walker, its keys held for it, and the interiors it walks past
  const tick = () => {
    const px = w.x, pz = w.z, real = w.keys;
    w.keys = keys;
    try { w.update(dt, cam); } finally { w.keys = real; }
    G.interiors.update(w.x, w.z, dt, w.feet, true);
    simT += dt;
    ticks++;
    metres += Math.hypot(w.x - px, w.z - pz) || 0;
    plant('tick', { G, W, w, simT, ticks });
    return inspect();
  };
  // `yieldS`: let the page run every so often (tiles land, a frame draws, settleWalker looks) —
  // whatever moved the walker meanwhile is the game stepping it out of something. Off by default:
  // the page's own frames would nudge the walk and a seed would no longer give the same walk.
  const breatheMaybe = async () => {
    if (simT - lastYield < (opts.yieldS ?? Infinity)) return;
    lastYield = simT;
    const x = w.x, z = w.z, f = w.feet;
    await breathe();
    if (Math.hypot(w.x - x, w.z - z) > 0.3) { settled++; note('settled', [x, z, f], () => ({ to: [r2(w.x), r2(w.z)] })); }
  };
  // steer along a planned path: face the farthest point within 1.3 m (the height counts: a flight
  // passes over the one below it), W held (Shift on a run in the street)
  const d3 = (p) => Math.hypot(p[0] - w.x, p[1] - w.z, (p[2] - w.feet) * 1.5);
  const inSight = (p) => { const [mx, mz] = W.move(w.x, w.z, p[0] - w.x, p[1] - w.z, WR, w.feet); return Math.abs(mx - p[0]) + Math.abs(mz - p[1]) < 0.05; };
  const follow = async (path) => {
    const n = path.length;
    let i = 0, best = 0, lastT = simT;
    for (;;) {
      if (over()) return 'time';
      while (i < n - 1 && d3(path[i]) < 0.5) i++;
      let j = i;
      while (j + 1 < n && d3(path[j + 1]) < 1.3) j++;
      // (the farthest of those it can walk straight at: never cut a corner through a wall's end)
      while (j > i && !inSight(path[j])) j--;
      const [tx, tz] = path[j], left = d3(path[n - 1]);
      if (left < 0.3) return 'arrived';
      if (Math.hypot(tx - w.x, tz - w.z) > 0.02) w.yaw = yawTo(tx - w.x, tz - w.z);
      keys.clear();
      keys.add('KeyW');
      if (run && left > 1.2) keys.add('ShiftLeft');
      const good = [w.x, w.z, w.feet];
      const ok = tick();
      keys.clear();
      if (!ok) { w.place(good[0], good[1], w.yaw, 0, good[2]); return 'nan'; }
      if (i > best) (best = i), (lastT = simT);
      else if (simT - lastT > stuckS) return left < 0.8 ? 'arrived' : 'stuck';
      await breatheMaybe();
    }
  };
  // plan (the walker's own moves on a 40 cm lattice, storeys apart) and walk there; stuck on a path
  // the planner walked → once more from where it stands (walls may have gone in: an interior's rooms)
  const go = async (goal, leg, o = {}) => {
    const from = () => ({ x: w.x, z: w.z, f: w.feet });
    for (let attempt = 0; attempt < 2; attempt++) {
      // (`level`: in and out of buildings — the planner keeps storeys apart, a node per 1.2 m of height)
      const layer = o.level ? 1.2 : 0;
      const plan = gridPath({ start: from(), goal: { x: goal[0], z: goal[1], f: o.level ? goal[2] : undefined }, step, cell: o.cell ?? 0.4, margin: o.margin ?? 8, maxNodes: o.maxNodes ?? opts.maxNodes ?? 30000, reach: 0.45, layer });
      if (!plan.found) {
        const fl = plan.far >= 3 ? plan : gridPath({ start: from(), goal: null, step, cell: 0.35, radius: 5, maxNodes: 3000, layer });
        if (fl.far < 3) return note('trapped', [w.x, w.z, w.feet], () => ({ far: fl.far, leg, seg: nearSeg(W, w.x, w.z, w.feet) })), 'trapped';
        return 'noway';
      }
      plant('path', { G, W, w, path: plan.path, leg });
      const r = await follow(plan.path);
      trace({ leg, to: goal.map(r2), r, nodes: plan.nodes, len: plan.path.length });
      if (r !== 'stuck') return r;
    }
    note('stuck', [w.x, w.z, w.feet], () => ({ to: goal.map(r2), leg, seg: nearSeg(W, w.x, w.z, w.feet) }));
    w.place(goal[0], goal[1], w.yaw, 0, goal[2]); // (carry on from where it was going)
    return 'stuck';
  };
  const fine = (r) => r !== 'time' && r !== 'nan' && r !== 'trapped';
  // a street: a seeded wander along the graph, walked beside it on one side, 10 m at a time
  const legStreet = async () => {
    const route = randomRoute(graph, w.x, w.z, R, 40 + R() * 90);
    if (route.pts.length < 2) return false;
    const side = R() < 0.5 ? -1 : 1, off = (route.widths[0] ?? 6) / 2 + 1.2;
    run = R() < (opts.run ?? 0.3);
    for (const p of resample(offsetPolyline(route.pts, side * off), 10)) {
      const goal = freeNear(G, p[0], p[1], { want: 'out', R: 3 });
      if (!goal) continue;
      const r = await go(goal, 'street');
      if (!fine(r)) return false;
      if (r === 'noway') noWay++;
    }
    return true;
  };
  // straight at a point, W held (a flight of stairs: the walker's own feet take the steps)
  const walkLine = async (tx, tz, leg) => {
    let bestD = Infinity, lastT = simT;
    for (;;) {
      if (over()) return 'time';
      const dd = Math.hypot(tx - w.x, tz - w.z);
      if (dd < 0.25) return 'arrived';
      if (dd < bestD - 0.05) (bestD = dd), (lastT = simT);
      else if (simT - lastT > 2) return trace({ leg, to: [r2(tx), r2(tz)], r: 'stuck' }), 'stuck';
      w.yaw = yawTo(tx - w.x, tz - w.z);
      keys.clear();
      keys.add('KeyW');
      const good = [w.x, w.z, w.feet];
      const ok = tick();
      keys.clear();
      if (!ok) { w.place(good[0], good[1], w.yaw, 0, good[2]); return 'nan'; }
    }
  };
  // up a building's stairs to the storey over the door's: planned to the foot of the stair, then up
  // each flight the way a player climbs it; back down the same way, and to where it came in
  const legUp = async (d) => {
    const P = planOfDoor(G, d), way = P && P.levels > 1 ? stairWay(G, P) : null;
    if (!way) return true;
    const back = [w.x, w.z, w.feet], f1 = P.floor0 + P.floorH, foot = way[0];
    let r = await go([foot.p[0], foot.p[1], foot.f], 'to the stairs', { level: true });
    if (r === 'noway') return (noUp++, true);
    if (r !== 'arrived') return fine(r);
    plant('stairs', { G, W, w, way, d });
    // each step of the way straight on; stalled, planned (on a fine lattice: a stair is under a
    // metre wide) — no way there at all is a stair you can't climb
    const climb = async (q, leg) => {
      let r1 = await walkLine(q.p[0], q.p[1], leg);
      if (r1 === 'stuck') r1 = await go([q.p[0], q.p[1], q.f], leg, { level: true, cell: 0.2, margin: 3, maxNodes: 40000 });
      return r1 === 'noway' ? 'stuck' : r1;
    };
    for (const q of way.slice(1)) if ((r = await climb(q, `stairs: ${q.what}`)) !== 'arrived') break;
    trace({ leg: 'up the stairs', r, feet: r2(w.feet), want: r2(f1) });
    if (Math.abs(w.feet - f1) < 0.3) upstairs++;
    else if (fine(r)) note('stairs', [w.x, w.z, w.feet], () => ({ door: [r2(d.wx), r2(d.wz)], want: r2(f1), stopped: r, seg: nearSeg(W, w.x, w.z, w.feet) }));
    if (!fine(r)) return false;
    // (down: the same waypoints the other way — from the top, each flight's foot on its landing)
    if (Math.abs(w.feet - f1) < 0.3) for (const q of [...way].reverse().slice(1)) if ((r = await climb(q, `stairs down: ${q.what}`)) !== 'arrived') break;
    if (!fine(r)) return false;
    r = await go(back, 'back from the stairs', { level: true });
    return fine(r);
  };
  // a door: one of the ten nearest not yet tried, from a step past the foot of its steps, in 1.5 m,
  // up its stairs (a building with storeys), and back out — there's always a way out
  const legDoor = async () => {
    const list = doorList(G, w.x, w.z, 90).filter((d) => !tried.has(d)).slice(0, 10);
    if (!list.length) return false;
    const d = list[Math.min(list.length - 1, Math.floor(R() * list.length))];
    tried.add(d);
    run = false;
    const fx = d.fx ?? d.wx + d.nx * 1.2, fz = d.fz ?? d.wz + d.nz * 1.2;
    const out = freeNear(G, fx + d.nx * 1.2, fz + d.nz * 1.2, { want: 'out', R: 3 });
    if (!out) return false;
    run = Math.hypot(out[0] - w.x, out[1] - w.z) > 20 && R() < (opts.run ?? 0.3);
    let r = await go(out, 'to a door');
    run = false;
    if (r !== 'arrived') return fine(r);
    const inside = freeNear(G, d.wx - d.nx * 1.5, d.wz - d.nz * 1.5, { want: 'in', R: 1.2, feet: d.y + 0.3 });
    if (!inside) return (shut++, true);
    r = await go(inside, 'in at a door', { level: true });
    if (r === 'noway') shut++;
    if (r !== 'arrived') return fine(r);
    if (W.interiorAt(w.x, w.z, w.feet) >= 0) {
      doorsIn++;
      plant('inside', { G, W, w, d });
      if (opts.stairs !== false && R() < (opts.upstairs ?? 0.75) && !(await legUp(d))) return false;
    }
    r = await go(out, 'out of a door', { level: true });
    // (no way found: look harder — a finer lattice threads a narrow doorway — before calling it
    // shut in)
    if (r === 'noway') r = await go(out, 'out of a door', { level: true, cell: 0.2, maxNodes: 150000, margin: 12 });
    if (r === 'noway') note('noExit', [w.x, w.z, w.feet], () => ({ door: [r2(d.wx), r2(d.wz)], building: W.buildingAt(w.x, w.z), inRooms: W.interiorAt(w.x, w.z, w.feet) >= 0 }));
    if (r === 'arrived' && W.buildingAt(w.x, w.z) < 0) doorsOut++;
    return fine(r) && r !== 'noway';
  };

  let misses = 0;
  try {
    plant('start', { G, W, w });
    if (!inspect()) return { pass: false, why: 'NaN at the start', fails: [] };
    // (a leg that got nowhere is a miss; six in a row, or shut in, and the walk is over)
    while (!over() && misses < 6 && !counts.trapped && !counts.nan && !counts.noExit) {
      legs++;
      const m0 = metres, ok = opts.doors !== false && R() < (opts.doorShare ?? 0.5) ? await legDoor() : await legStreet();
      misses = ok && metres > m0 + 0.5 ? 0 : misses + 1;
    }
  } finally {
    keys.clear();
    w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
    G.interiors.update(w.x, w.z, 0.25, w.feet, true);
    G.walkParams.fly = fly0;
  }
  const BAD = ['nan', 'wall', 'solid', 'under', 'floating', 'sunk', 'stuck', 'trapped', 'noExit', 'stairs'];
  const tally = Object.fromEntries(BAD.map((k) => [k, counts[k] ?? 0]));
  const got = metres >= 5 || !graph.nodes.length;
  return {
    pass: got && BAD.every((k) => !tally[k]),
    ...(got ? {} : { why: 'the walk never got going' }),
    seconds: r2(simT), metres: Math.round(metres), legs, doorsIn, upstairs, noUp, doorsOut, shut, noWay, ...tally, settled,
    fails: ex.filter((e) => BAD.includes(e.kind)).slice(0, top),
    ...(opts.trace ? { log } : {}),
  };
};

/** The walkabout has to fail on each failure planted for it: shut in by a ring of walls; a wall
 *  landing through the walker; a building with no walls on its path; the feet sunk under the
 *  ground, or held up off it; a controller that ignores its keys (stuck); a door walled up behind
 *  it (no way out); NaN. */
window.__WALKABOUT_SELFTEST__ = async (opts = {}) => {
  const G = G0(), W = G.walk, w = G.walker, s0 = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const upd = w.update, ownUpd = Object.prototype.hasOwnProperty.call(w, 'update'), base = { seconds: 14, seed: opts.seed ?? 1, stuckS: 2 };
  const cases = {
    trapped: { o: { doors: false, plant: once((ph, c) => ph === 'start' && (plantRing(c.W, c.w.x, c.w.z, 1.1), true)) } },
    wall: { o: { doors: false, plant: once((ph, c) => ph === 'tick' && c.ticks === 30 && (plantIn(c.W, () => c.W.addWall([c.w.x - 1, c.w.z + 0.1], [c.w.x + 1, c.w.z + 0.1])), true)) } },
    solid: {
      o: {
        doors: false,
        plant: once((ph, c) => {
          if (ph !== 'path') return false;
          // (a building with no walls standing across the path, 3 m on)
          let k = 1, s = 0;
          for (; k < c.path.length && s < 3; k++) s += Math.hypot(c.path[k][0] - c.path[k - 1][0], c.path[k][1] - c.path[k - 1][1]);
          if (s < 3) return false;
          plantHollow(c.W, c.path[k - 1][0], c.path[k - 1][1], 1.5);
          return true;
        }),
      },
    },
    under: { o: { doors: false, plant: once((ph, c) => ph === 'tick' && c.ticks === 30 && ((c.w.surfaceY -= 2), true)) } },
    floating: { o: { doors: false, plant: (ph, c) => { if (ph === 'tick' && c.ticks >= 30 && c.ticks < 110) c.w.surfaceY = c.W.surfaceAt(c.w.x, c.w.z, c.w.surfaceY - 1.2) + 1.2; } } },
    stuck: { o: { doors: false }, before: () => { w.update = function (dt, cam) { const k = this.keys; this.keys = new Set(); try { return upd.call(this, dt, cam); } finally { this.keys = k; } }; } },
    nan: { o: { doors: false, plant: once((ph, c) => ph === 'tick' && c.ticks === 20 && ((c.w.x = NaN), true)) } },
    // (a wall across the first flight, halfway up, once the walker stands at its foot)
    stairs: {
      o: {
        doorShare: 1, upstairs: 1, seconds: 480,
        plant: once((ph, c) => {
          if (ph !== 'stairs') return false;
          const [a, b] = [c.way[0].p, c.way[1].p], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const tx = -(b[1] - a[1]) / L, tz = (b[0] - a[0]) / L;
          plantIn(c.W, () => c.W.addWall([mx - tx * 1.5, mz - tz * 1.5], [mx + tx * 1.5, mz + tz * 1.5]));
          return true;
        }),
      },
    },
    // (a door walled up once the walker is through it: the way back out is gone)
    noExit: {
      o: {
        doorShare: 1, stairs: false, seconds: 120,
        plant: once((ph, c) => {
          if (ph !== 'inside') return false;
          const d = c.d, tx = -d.nz, tz = d.nx, h = d.w / 2 + 0.6;
          plantIn(c.W, () => c.W.addWall([d.wx + d.nx * 0.05 - tx * h, d.wz + d.nz * 0.05 - tz * h], [d.wx + d.nx * 0.05 + tx * h, d.wz + d.nz * 0.05 + tz * h]));
          return true;
        }),
      },
    },
  };
  const out = {};
  for (const [name, c] of Object.entries(opts.only ? Object.fromEntries(Object.entries(cases).filter(([k]) => opts.only.includes(k))) : cases)) {
    let r;
    try {
      c.before?.();
      r = await window.__WALKABOUT__({ ...base, ...c.o });
    } catch (e) { r = { pass: true, error: String(e?.message ?? e) }; } finally {
      if (ownUpd) w.update = upd;
      else delete w.update;
      unplant(W);
      w.place(s0.x, s0.z, s0.yaw, s0.pitch, s0.feet);
    }
    // (a case whose moment never came — no door to walk in at, no stair to climb — didn't get
    // planted: null. In a building too small to walk 3 m in, walled up is shut in: `trapped`)
    const setUp = c.o.plant?.done ?? true;
    const n = (r[name] ?? 0) + (name === 'noExit' ? r.trapped ?? 0 : 0);
    out[name] = { caught: setUp ? !r.pass && n > 0 : null, pass: r.pass, [name]: r[name] ?? 0, metres: r.metres, doorsIn: r.doorsIn, ...(r.error ? { error: r.error } : {}) };
  }
  const detects = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.caught]));
  return { pass: Object.values(detects).every((v) => v !== false), detects, cases: out };
};

// ---- posts standing in a carriageway: short collision walls (a post, a mast, a hydrant: sides
// under a metre) inside a car street's lanes (60 cm or more in from its kerb). A car stops dead on
// one and traffic drives through it. Mapped bollards (24 cm) may stand in the road (props.ts) and
// are left out; bridges are too (their railings run along the deck edge). ----
// (what a post of that side most likely is — the builders' own collider sizes; a guess for the report)
const POST_LIKE = { '0.12': 'stop/yield sign', '0.16': 'street-name sign', '0.28': 'lamp post', '0.32': 'street-lamp mast', '0.34': 'piling', '0.36': 'signal mast or hydrant', '0.40': 'power pole' };
window.__ROADPOSTS__ = (opts = {}) => {
  const G = G0(), W = G.walk, x0 = opts.x ?? G.walker.x, z0 = opts.z ?? G.walker.z, R = opts.R ?? 600, C = 24;
  const cells = new Map();
  for (const r of roadsNear(G, x0, z0, R)) {
    if (r.lod || r.tu || r.br || NOT_FOR_CARS.includes(r.c) || r.c === 'service') continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const a = [r.p[i] / 10, r.p[i + 1] / 10], b = [r.p[i + 2] / 10, r.p[i + 3] / 10], hw = (r.w ?? 6) / 2;
      for (let u = Math.floor((Math.min(a[0], b[0]) - hw) / C); u <= Math.floor((Math.max(a[0], b[0]) + hw) / C); u++)
        for (let v = Math.floor((Math.min(a[1], b[1]) - hw) / C); v <= Math.floor((Math.max(a[1], b[1]) + hw) / C); v++) {
          const k = u + ',' + v;
          (cells.get(k) ?? cells.set(k, []).get(k)).push({ a, b, hw, r });
        }
    }
  }
  const found = [];
  for (let i = 0; i < W.segs.length; i++) {
    if (W.segDead[i]) continue;
    const s = W.segs[i], len = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (len > 1 || len < 0.01 || Math.abs(len - 0.24) < 0.02) continue;
    const mx = (s[0] + s[2]) / 2, mz = (s[1] + s[3]) / 2;
    if (Math.abs(mx - x0) > R || Math.abs(mz - z0) > R) continue;
    for (const q of cells.get(Math.floor(mx / C) + ',' + Math.floor(mz / C)) ?? []) {
      const [ax, az] = q.a, ex = q.b[0] - ax, ez = q.b[1] - az, L2 = ex * ex + ez * ez;
      const t = L2 ? Math.max(0, Math.min(1, ((mx - ax) * ex + (mz - az) * ez) / L2)) : 0;
      const d = Math.hypot(ax + ex * t - mx, az + ez * t - mz);
      if (d >= q.hw - 0.6) continue;
      // (one post is four sides: the first side found stands for it)
      if (!found.some((f) => Math.hypot(f.at[0] - mx, f.at[1] - mz) < 1)) found.push({ at: [r2(mx), r2(mz)], side: r2(len), like: POST_LIKE[r2(len).toFixed(2)] ?? 'post', fromCentre: r2(d), road: q.r.n ?? q.r.c, w: q.r.w });
      break;
    }
  }
  const list = found.sort((a, b) => a.fromCentre - b.fromCentre);
  return { pass: list.length === 0, posts: list.length, fails: list.slice(0, opts.top ?? 12) };
};


/** __ROADPOSTS__ has to find a planted lamp-post-sized post in the middle of the nearest street. */
window.__ROADPOSTS_SELFTEST__ = () => {
  const G = G0(), W = G.walk, w = G.walker;
  const ix = roadIndex(roadsNear(G, w.x, w.z, 300), { skip: ['service'] });
  // the nearest carriageway point: a street's centreline, a step along from the walker's nearest
  let best = null;
  for (const segs of ix.cells.values())
    for (const s of segs) {
      if (s.hw < 2.5) continue;
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2, d = Math.hypot(mx - w.x, mz - w.z);
      if (!best || d < best.d) best = { d, x: mx, z: mz };
    }
  if (!best) return { pass: true, detects: { post: null }, why: 'no street near' };
  const before = window.__ROADPOSTS__({ x: best.x, z: best.z, R: 40 });
  const h = 0.14; // (a 28 cm post: a lamp post's collider)
  plantIn(W, () => W.addLoop([[best.x - h, best.z - h], [best.x + h, best.z - h], [best.x + h, best.z + h], [best.x - h, best.z + h]]));
  let after;
  try { after = window.__ROADPOSTS__({ x: best.x, z: best.z, R: 40 }); } finally { unplant(W); }
  const found = after.fails.some((p) => Math.hypot(p.at[0] - best.x, p.at[1] - best.z) < 0.5) || after.posts > before.posts;
  return { pass: found && !after.pass, detects: { post: found && !after.pass }, at: [r2(best.x), r2(best.z)], before: before.posts, after: after.posts };
};

// ---- roads: what stands in a car street's lanes — a wall, a building's footprint, ground a car can't
// go on (water, a gap in a bridge's deck) — sampled every couple of metres down every car street,
// bridges at their deck, at the height a car's body is (Robby: "going over sandy hook bridge and
// driving through main cities sometimes the roads have walls or buildings in them") ----
window.__ROADWALLS__ = (opts = {}) => {
  const G = G0(), W = G.walk, T = G.world.terrain, x0 = opts.x ?? G.walker.x, z0 = opts.z ?? G.walker.z, R = opts.R ?? 600, step = opts.step ?? 2;
  const { counts, ex, note } = events(opts.top ?? 24);
  let samples = 0;
  const near = (x, z) => { // (what stands there: the nearest live wall's length and band, its building)
    let best = null;
    for (let i = 0; i < W.segs.length; i++) {
      if (W.segDead[i]) continue;
      const q = W.segs[i];
      if (Math.max(q[0], q[2]) < x - 1.5 || Math.min(q[0], q[2]) > x + 1.5 || Math.max(q[1], q[3]) < z - 1.5 || Math.min(q[1], q[3]) > z + 1.5) continue;
      const ex2 = q[2] - q[0], ez2 = q[3] - q[1], L2 = ex2 * ex2 + ez2 * ez2, t = L2 ? Math.max(0, Math.min(1, ((x - q[0]) * ex2 + (z - q[1]) * ez2) / L2)) : 0;
      const d = Math.hypot(q[0] + ex2 * t - x, q[1] + ez2 * t - z);
      if (!best || d < best.d) best = { d, len: Math.hypot(ex2, ez2), y0: q[4], y1: q[5] };
    }
    return best && { wallLen: r2(best.len), band: [Number.isFinite(best.y0) ? r2(best.y0) : '-inf', Number.isFinite(best.y1) ? r2(best.y1) : 'inf'], wallOff: r2(best.d) };
  };
  for (const r of roadsNear(G, x0, z0, R)) {
    if (r.lod || r.tu || NOT_FOR_CARS.includes(r.c) || r.c === 'service') continue;
    // the lanes: the carriageway less a car's half width and a little (a kerb's wall is fine), and less
    // the parked cars where it parks (kerbside.ts: a parallel car's inside edge 2.2 m from the kerb,
    // an angled bay's 4.6 m) — the travel lanes; a cross street's own samples still cross this one's
    // parking at its mouth, where no car may stand
    // (a main street — 9 m and more — parks at its kerbs in front of shops whatever the map says: props.ts)
    const hw = (r.w ?? 6) / 2, pk = (r.w ?? 0) >= 10 && r.pk ? r.pk : (r.w ?? 0) >= 9 && !r.br ? 1 + 4 : 0;
    const laneOf = (mode) => Math.max(0, hw - (mode === 2 ? 5.6 : mode === 1 ? 3.2 : 1.4));
    const lanes = [-laneOf(pk & 3), 0, laneOf((pk >> 2) & 3)].filter((o, k, a) => k === 1 || Math.abs(o) > 0.4);
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let s = step / 2; s < L; s += step) {
        const cx = ax + ux * s, cz = az + uz * s;
        if (Math.abs(cx - x0) > R || Math.abs(cz - z0) > R) continue;
        for (const o of lanes) {
          const x = cx - uz * o, z = cz + ux * o;
          samples++;
          const info = () => ({ road: r.n ?? r.c, cls: r.c, w: r.w, bridge: !!r.br, off: r2(o) });
          if (!W.walkable(x, z)) { note(r.br ? 'deckGap' : 'unwalkable', [x, z], info); continue; }
          // (a footprint under a bridge's deck is under it — its walls, if they reach the deck, count below)
          const b = r.br ? -1 : W.buildingAt(x, z);
          if (b >= 0) { note('building', [x, z], () => ({ ...info(), floors: W.floorsOf(b) ? 1 : 0 })); continue; }
          // the street's own surface (a bridge's deck, else the ground), a car's body a hand over it
          const y = r.br ? W.surfaceAt(x, z) : W.surfaceAt(x, z, Math.max(T.heightAt(x, z), -0.2) + 0.3);
          if (W.touching(x, z, 0.8, y + 0.3)) note(r.br ? 'bridgeWall' : 'wall', [x, z], () => ({ ...info(), y: r2(y), ...near(x, z) }));
        }
      }
    }
  }
  // The verdict: nothing on a bridge's deck (a wall there is a car stopped mid-span), and elsewhere
  // under 2 a thousand samples — a kerb's frame, a low wall where the map's street runs wider than
  // the real one: the shore 1.3, Red Bank 1.0 (2026-10-07); before that day's fixes, Highlands' 26
  const n = Object.values(counts).reduce((a, b) => a + b, 0), deck = (counts.bridgeWall ?? 0) + (counts.deckGap ?? 0);
  const perK = samples ? (1000 * (n - deck)) / samples : 0;
  return { pass: deck === 0 && perK <= (opts.perK ?? 2), samples, hits: n, perK: r2(perK), walls: counts.wall ?? 0, bridgeWalls: counts.bridgeWall ?? 0, buildings: counts.building ?? 0, gaps: (counts.deckGap ?? 0) + (counts.unwalkable ?? 0), counts, fails: ex };
};
/** __ROADWALLS__ has to find a wall planted across the nearest street, and a footprint laid on it. */
window.__ROADWALLS_SELFTEST__ = () => {
  const G = G0(), W = G.walk, w = G.walker;
  let best = null;
  for (const r of roadsNear(G, w.x, w.z, 300)) {
    if (r.lod || r.tu || r.br || NOT_FOR_CARS.includes(r.c) || r.c === 'service' || (r.w ?? 6) < 5) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az);
      if (L < 12) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, d = Math.hypot(mx - w.x, mz - w.z);
      if (!best || d < best.d) best = { d, x: mx, z: mz, ux: (bx - ax) / L, uz: (bz - az) / L, hw: (r.w ?? 6) / 2 };
    }
  }
  if (!best) return { pass: null, why: 'no street to plant in' };
  const before = window.__ROADWALLS__({ x: best.x, z: best.z, R: 30, perK: 0 });
  const { x, z, ux, uz, hw } = best, px = -uz, pz = ux;
  // a wall across the lanes, kerb to kerb
  plantIn(W, () => W.addWall([x + px * hw, z + pz * hw], [x - px * hw, z - pz * hw]));
  let wall;
  try { wall = window.__ROADWALLS__({ x, z, R: 30, perK: 0 }); } finally { unplant(W); }
  // a 6 m square footprint in the middle of it, 20 m on
  const cx = x + ux * 20, cz = z + uz * 20, h = 3;
  plantIn(W, () => W.addPolygon([[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]]));
  let bld;
  try { bld = window.__ROADWALLS__({ x, z, R: 40, perK: 0 }); } finally { unplant(W); }
  const detects = { wall: wall.walls > before.walls, building: bld.buildings > before.buildings };
  return { pass: detects.wall && detects.building, detects, at: [r2(x), r2(z)], before: before.hits };
};

// ---- drive: a parked car (driveway or kerb) taken with E, driven along the streets, left and
// re-entered every so often, and left for good at the end ----
const BODY = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0]]; // (along, across) the car's outline
window.__DRIVE__ = async (opts = {}) => {
  const G = G0(), W = G.walk, w = G.walker, V = G.vehicles;
  const seconds = opts.seconds ?? 60, dt = 1 / 60, speed = opts.speed ?? 11, top = opts.top ?? 12, exitEvery = opts.exitEvery ?? 10;
  const margin = opts.roadMargin ?? 1.5; // (m past the carriageway's edge: a wheel over the kerb is fine, the sidewalk isn't)
  const R = rng((opts.seed ?? 1) * 104729 + 7), wall0 = performance.now(), maxMs = opts.maxMs ?? Math.max(60000, seconds * 4000);
  const plant = typeof opts.plant === 'function' ? opts.plant : () => {};
  const cam = new G.THREE.PerspectiveCamera(), keys = new Set();
  const start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const fly0 = G.walkParams.fly;
  const STORE = 'map-game.vehicles.v1';
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch { /* storage off */ }
  const taken0 = new Set(V.taken);
  const { counts, ex, note } = events();
  let simT = 0, metres = 0, maxV = 0, routes = 0, reverses = 0, exits = 0, exitFails = 0, clip = 0, clipMax = 0, clipAt = null, underHouse = 0, flyT = 0, sinkT = 0, lastYield = 0;
  let onRoad = false, offT = 0, offRoad = 0, offRoadMax = 0, calmT = 0, jumps = 0, errNow = 0, segNow = 0, turns = 0, turning = false;
  const clipTol = opts.clipTol ?? 0.6; // (m into a wall: a scrape shows a hand's width, a nose in a house fails)
  let car = V.driving && V.activeKind === 'car' ? V.active : null, source = car ? 'riding' : '';
  const own = !car, cleared = [];
  // the driveway cars as they stand (the one taken is hidden: shown again afterwards)
  const inst0 = new Map();
  for (const t of G.stream.loaded.values()) for (const m of t.group.children) if (m.name?.startsWith('parked-cars') && m.instanceMatrix) inst0.set(m, m.instanceMatrix.array.slice());

  // the streets it drives: the car's graph round the start, without the service ways (driveways,
  // alleys, parking aisles: a car barely fits them) unless asked; the
  // carriageways it must stay on: every way a car may use, service ways too
  const roads = roadsNear(G, start.x, start.z, 1000);
  const graph = roadGraph(roads, { car: true, skip: opts.service ? [] : ['service'] });
  const ix = roadIndex(roads);
  const toStreet = (x, z) => { const i = nearestNode(graph, x, z); return i < 0 ? Infinity : Math.hypot(graph.nodes[i][0] - x, graph.nodes[i][1] - z); };
  // ---- take a car: stand beside one of the nearest few by a street (seeded) and press E ----
  if (!car) {
    if (V.driving) V.toggle();
    G.walkParams.fly = false;
    const all = [...G.ctx.instances('parked-cars:', w.x, w.z, 350), ...G.ctx.instances('kerb-cars:', w.x, w.z, 350)]
      .map((c) => ({ ...c, d: Math.hypot(c.x - start.x, c.z - start.z), s: toStreet(c.x, c.z) }))
      .sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
    const byStreet = all.filter((c) => c.s < 25);
    const found = (byStreet.length ? byStreet : all).slice(0, 8);
    const order = found.map((c) => [R(), c]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    for (const c of order) {
      const spot = freeNear(G, c.x, c.z, { want: 'out', R: 4, r0: 2.1 });
      if (!spot) continue;
      w.place(spot[0], spot[1], w.yaw, 0, spot[2]);
      const dead0 = W.segDead.slice();
      V.toggle(); // E: the vehicles' own "get in" — the nearest enterable car in reach
      // (what taking it cleared: its parking outline — put back afterwards)
      for (let i = 0; i < W.segDead.length; i++) if (W.segDead[i] && !dead0[i]) cleared.push([i, W.segs[i]]);
      if (V.driving && V.activeKind === 'car') { car = V.active; source = c.name.startsWith('kerb') ? 'kerb' : 'driveway'; break; }
      if (V.driving) V.toggle();
    }
    if (!car) {
      // none in reach: the developer's summons (a car pulls up in the nearest street lane)
      const n0 = V.list.length;
      V.summon('car');
      const v = V.list.length > n0 ? V.list[V.list.length - 1] : null;
      const spot = v && freeNear(G, v.x, v.z, { want: 'out', R: 4, r0: 2.1 });
      if (spot) { w.place(spot[0], spot[1], w.yaw, 0, spot[2]); V.toggle(); }
      if (V.driving && V.activeKind === 'car') { car = V.active; source = 'summoned'; }
      else if (v) V.remove(v);
    }
  }
  if (!car) {
    w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
    G.walkParams.fly = fly0;
    return { pass: false, why: 'no car to take near here', fails: [] };
  }
  // the body's half length and width (the kit model: front toward −z)
  let HL = 2.2, HW = 0.85;
  try {
    const bb = new G.THREE.Box3();
    car.obj.children.forEach((c) => { if (c.geometry) { c.geometry.computeBoundingBox(); bb.union(c.geometry.boundingBox); } });
    if (!bb.isEmpty()) (HL = Math.max(-bb.min.z, bb.max.z) - 0.1), (HW = Math.max(-bb.min.x, bb.max.x) - 0.05);
  } catch { /* the defaults */ }

  // after each step: never NaN; never inside a building (the centre in a footprint — pilings
  // aside — or a corner more than `clipTol` into one); on the ground (not flying, not sunk); no
  // teleport-sized jump since the last step; on the carriageway
  const inspectCar = (px, pz, py) => {
    const x = car.x, z = car.z, at = [x, z, car.y];
    if (![x, z, car.y, car.yaw, car.v].every(Number.isFinite)) return note('nan', [0, 0, 0]), false;
    const b = W.buildingAt(x, z), fb = b >= 0 ? W.floorsOf(b) : null;
    if (b >= 0 && fb?.ground) underHouse++; // (between a raised house's pilings: parking under a beach house)
    else if (b >= 0) note('inside', at, () => ({ building: b, kmh: Math.round(car.v * 3.6) }));
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    // the body (the collider is a capsule as long and wide as the car, so its rounded corners can
    // reach a little past a wall on a slanting hit): how deep its corners and ends reach into a footprint
    let deep = 0, pt = null;
    for (const [u, v] of BODY) {
      const qx = x + fx * u * HL + rx * v * HW, qz = z + fz * u * HL + rz * v * HW, bb = W.buildingAt(qx, qz);
      if (bb >= 0 && !W.floorsOf(bb)?.ground) {
        const d = wallDist(W, qx, qz);
        if (d > deep) (deep = d), (pt = [r2(qx), r2(qz)]);
      }
    }
    if (deep > 0) {
      clip++;
      if (deep > clipMax) (clipMax = deep), (clipAt = { at: [r2(x), r2(z)], yaw: r2(car.yaw), point: pt, by: r2(deep), kmh: Math.round(car.v * 3.6) });
      if (deep > clipTol) note('clip', at, () => ({ by: r2(deep), kmh: Math.round(car.v * 3.6) }));
    }
    const g = W.outdoorNear(x, z, car.y), o = car.y - g;
    flyT = o > 0.5 ? flyT + dt : 0;
    sinkT = o < -0.3 ? sinkT + dt : 0;
    if (flyT > 0.5) note('flying', at, () => ({ by: r2(o) }));
    if (sinkT > 0.5) note('sinking', at, () => ({ by: r2(o) }));
    // a jump: farther in one step than the car goes at three times its speed (and 1.5 m), or a
    // metre up or down
    const dh = Math.hypot(x - px, z - pz), dy = car.y - py;
    if (dh > Math.max(1.5, Math.abs(car.v) * dt * 3 + 0.5) || Math.abs(dy) > 1) (jumps++, note('jump', at, () => ({ from: [r2(px), r2(pz), r2(py)], by: r2(dh), up: r2(dy) })));
    // the carriageway: within its half width (+ margin) of the nearest street a car may use — from
    // the moment it's first on one, lined up with its route (it sets off from a driveway), and
    // only while the driver is lined up (not turning round, not backing off a stall): off the
    // road then, something put it there
    // (judged again after a manoeuvre only once it's back on the road, lined up with it)
    const rd = roadDist(ix, x, z), lined = Math.abs(errNow) < 1.2 && segNow >= 1 && !turning; // (segment 0: from where it set off to the first street node)
    if (rd.out <= 0.3 && Math.abs(errNow) < 0.3 && segNow >= 1) onRoad = true;
    calmT = Math.max(0, calmT - dt);
    if (onRoad && calmT <= 0 && lined && rd.out > margin) {
      offT += dt;
      offRoadMax = Math.max(offRoadMax, rd.out);
      if (offT > 1 && offT - dt <= 1) (offRoad++, note('offroad', at, () => ({ by: r2(rd.out), road: rd.road, w: r2(rd.hw * 2), kmh: Math.round(car.v * 3.6) })));
    } else offT = 0;
    return true;
  };
  let route = null, cum = null, segI = 0, lastS = 0, stall = { s: 0, t: 0 }, revT = 0, revs = 0, turnT = 0, turnCool = 0;
  const tick = () => {
    const px = car.x, pz = car.z, py = car.y, real = V.keys;
    V.keys = keys;
    try { V.update(dt, cam); } finally { V.keys = real; }
    simT += dt;
    plant('tick', { G, W, car, simT, route, cum, s: lastS, seg: segNow, err: errNow, turning, ix });
    metres += Math.hypot(car.x - px, car.z - pz) || 0;
    maxV = Math.max(maxV, Math.abs(car.v) || 0);
    return inspectCar(px, pz, py);
  };
  // pull over, get out (E), and see where the walker stands; then back in
  const stopAndExit = (again) => {
    for (let k = 0; k < 600 && Math.abs(car.v) > 0.3; k++) {
      keys.clear();
      keys.add(car.v > 0 ? 'KeyS' : 'KeyW');
      if (!tick()) break;
    }
    keys.clear();
    V.toggle();
    exits++;
    if (V.driving) return (exitFails++, note('exit', [car.x, car.z, car.y], () => ({ why: 'stayed aboard' })), false);
    const p = standProblems(G, w.x, w.z, w.feet);
    if (p.length) (exitFails++, note('exit', [w.x, w.z, w.feet], () => ({ why: p.join(', '), car: [r2(car.x), r2(car.z)] })));
    if (!again) return true;
    V.toggle();
    if (!V.driving) {
      // (placed out of reach — the nearest dry land): walk back over, then E
      const spot = freeNear(G, car.x, car.z, { want: 'out', R: 4, r0: 2.1 });
      if (spot) (w.place(spot[0], spot[1], w.yaw, 0, spot[2]), V.toggle());
    }
    if (!V.driving) return note('reenter', [car.x, car.z, car.y], () => ({ walker: [r2(w.x), r2(w.z)] })), false;
    return true;
  };

  // ---- drive: pure pursuit along seeded routes of the car's street graph ----
  const newRoute = () => {
    routes++;
    // (a moving car sets off the way it's going: a node ahead of it, not a U-turn in the street)
    const heading = Math.abs(car.v) > 1 ? [-Math.sin(car.yaw) * Math.sign(car.v), -Math.cos(car.yaw) * Math.sign(car.v)] : undefined;
    const r = randomRoute(graph, car.x, car.z, R, 250 + R() * 250, { avoidDeadEnds: true, heading });
    if (r.pts.length < 2) return false;
    route = [[car.x, car.z], ...r.pts];
    cum = cumLength(route);
    segI = 0;
    stall = { s: 0, t: simT };
    revs = 0;
    return true;
  };
  let lastExit = 0, ok = newRoute();
  const trace = [];
  try {
    while (ok && simT < seconds && performance.now() - wall0 < maxMs) {
      const c = closestAlong(route, cum, car.x, car.z, segI - 2, segI + 40);
      segI = segNow = c.i;
      lastS = c.s;
      // turning at a junction: a vertex of the route within 15 m that turns more than ~35° (the
      // pursuit swings wide there, as a driver takes a corner: not judged off the road)
      turning = false;
      for (let k = Math.max(1, c.i - 1); k <= Math.min(route.length - 2, c.i + 2) && !turning; k++) {
        if (Math.abs(cum[k] - c.s) > 15) continue;
        const a1 = Math.atan2(route[k][1] - route[k - 1][1], route[k][0] - route[k - 1][0]), a2 = Math.atan2(route[k + 1][1] - route[k][1], route[k + 1][0] - route[k][0]);
        turning = Math.abs(wrapAngle(a2 - a1)) > 0.6;
      }
      if (c.d > 18 || c.s > cum[cum.length - 1] - 4 || revs > 3) { if (routes > 60 || !newRoute()) break; continue; }
      const look = 5 + Math.abs(car.v) * 0.5;
      const [tx, tz] = pointAlong(route, cum, c.s + look), [ax, az] = pointAlong(route, cum, c.s + look + 14);
      const head = yawTo(tx - car.x, tz - car.z), err = wrapAngle(head - car.yaw);
      const bend = Math.abs(wrapAngle(yawTo(ax - tx, az - tz) - head));
      const want = Math.abs(err) > 0.8 || bend > 0.9 ? 5 : bend > 0.45 ? 8 : speed;
      errNow = err;
      // the way on is behind it (parked nose-in; the end of a street): back round, the wheel the
      // other way, then on round forward — a three-point turn. A forward U-turn doesn't fit most
      // streets: it would run up onto the sidewalk.
      turnCool -= dt;
      if (Math.abs(err) > 2 && revT <= 0 && turnT <= 0 && turnCool <= 0 && Math.abs(car.v) < 3) (turnT = 2.5), (turnCool = 5), turns++, (calmT = Math.max(calmT, 4)), (onRoad = false);
      if (turnT > 0 && Math.abs(err) < 1) turnT = 0;
      // (turning round, nose toward a wall: back off it first, the wheel the other way)
      const fgx = car.x - Math.sin(car.yaw) * (HL + 0.6), fgz = car.z - Math.cos(car.yaw) * (HL + 0.6);
      if (revT <= 0 && turnT <= 0 && car.v > 0.3 && Math.abs(err) > 1 && W.blocked(fgx, fgz, 0.6)) (turnT = 1.5), (calmT = Math.max(calmT, 4)), (onRoad = false);
      keys.clear();
      // (backing up at a walking pace, and never into something: the rear 60 cm from a wall or a
      // building ends it)
      const bx = car.x + Math.sin(car.yaw) * (HL + 0.6), bz = car.z + Math.cos(car.yaw) * (HL + 0.6);
      if ((revT > 0 || turnT > 0) && W.blocked(bx, bz, 0.6)) revT = turnT = 0;
      if (revT > 0 || turnT > 0) {
        // backing off whatever stopped it (or backing round), the wheel turned the other way
        if (car.v > -2.5) keys.add('KeyS');
        keys.add(err > 0 ? 'KeyD' : 'KeyA');
        if (revT > 0) revT -= dt;
        else turnT -= dt;
      } else if (Math.abs(err) > 2 && car.v > 3) {
        keys.add('KeyS'); // (the way on is behind it: stop first, then turn round in three)
      } else {
        if (car.v < want - 0.5) keys.add('KeyW');
        else if (car.v > want + 2) keys.add('KeyS');
        if (err > 0.03) keys.add('KeyA');
        else if (err < -0.03) keys.add('KeyD');
      }
      if (!tick()) break;
      if (c.s > stall.s + 1) stall = { s: c.s, t: simT };
      else if (simT - stall.t > 3 && revT <= 0) {
        (revT = 1.5), reverses++, revs++, (stall = { s: c.s, t: simT + 1.5 }), (calmT = 3), (onRoad = false);
        // (measured from the front of the body's axis: the collider is the car's own shape, so it
        // stops with its bumper at a wall, its middle half a car's length back)
        const bd = car.body ?? { f: Math.max(0, HL - HW), r: HW };
        const wall = nearSeg(W, car.x - Math.sin(car.yaw) * bd.f, car.z - Math.cos(car.yaw) * bd.f, car.feet);
        note('stall', [car.x, car.z, car.y], () => ({ off: r2(c.d), wall }));
        // stopped dead on its street, lined up with it, a wall at its bumper: something stands in
        // the road (a post, a mast, a building across the carriageway)
        if (c.i >= 1 && c.d < 1.5 && Math.abs(err) < 0.6 && wall && wall.d < bd.r + 0.4) note('blocked', [car.x, car.z, car.y], () => ({ wall, kmh: Math.round(car.v * 3.6) }));
        if (opts.trace) trace.push({ t: r2(simT), rev: [r2(car.x), r2(car.z)], v: r2(car.v), err: r2(err), off: r2(c.d), s: r2(c.s), seg: nearSeg(W, car.x, car.z, car.feet), route: route.slice(Math.max(0, c.i - 1), c.i + 3).map((p) => p.map(r2)) });
      }
      if (opts.trace && Math.round(simT * 60) % (opts.trace === 'fine' ? 6 : 30) === 0) trace.push([r2(simT), r2(car.x), r2(car.z), r2(car.v), r2(err), r2(c.d), [...keys].join(''), r2(roadDist(ix, car.x, car.z).out), onRoad ? 1 : 0, r2(calmT), segNow]);
      if (simT - lastExit > exitEvery) {
        lastExit = simT;
        if (!stopAndExit(true)) break;
      }
      if (simT - lastYield > (opts.yieldS ?? Infinity)) (lastYield = simT), await breathe();
    }
    if (V.driving && V.active === car && [car.x, car.z].every(Number.isFinite)) stopAndExit(false);
  } finally {
    keys.clear();
    if (V.driving) V.toggle();
    // leave the world as it was: the test's car goes, the parked one it took is back in its spot
    // (shown, its outline a wall again, not remembered as taken)
    if (own) {
      try { V.remove(car); } catch { /* (older builds) */ }
      V.taken.clear();
      for (const k of taken0) V.taken.add(k);
      for (const [i, seg] of cleared) if (W.segs[i] === seg) W.segDead[i] = 0;
      for (const [m, a] of inst0) {
        const cur = m.instanceMatrix.array;
        if (cur.length === a.length && cur.some((v, k) => v !== a[k])) (cur.set(a), (m.instanceMatrix.needsUpdate = true));
      }
      V.o?.kerb?.refresh?.();
      try { saved === null ? localStorage.removeItem(STORE) : localStorage.setItem(STORE, saved); } catch { /* storage off */ }
    }
    w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
    G.walkParams.fly = fly0;
  }
  const BAD = ['nan', 'inside', 'clip', 'flying', 'sinking', 'jump', 'offroad', 'blocked', 'exit', 'reenter'];
  const tally = Object.fromEntries(['nan', 'inside', 'flying', 'sinking', 'blocked'].map((k) => [k, counts[k] ?? 0]));
  const moved = metres >= Math.min(seconds, simT) * 1.5;
  return {
    pass: moved && BAD.every((k) => !counts[k]),
    ...(moved ? {} : { why: `hardly moved: ${Math.round(metres)} m in ${Math.round(simT)} s` }),
    source, model: car.model, seconds: r2(simT), metres: Math.round(metres), maxKmh: Math.round(maxV * 3.6), routes, stalls: reverses, turns,
    offRoad, offRoadMax: r2(offRoadMax), jumps, ...tally, clip, clipMax: r2(clipMax), clipAt, underHouse, exits, exitFails,
    fails: ex.filter((e) => BAD.includes(e.kind)).slice(0, top),
    stallsAt: ex.filter((e) => e.kind === 'stall').slice(0, 4),
    ...(opts.trace ? { trace } : {}),
  };
};

/** The drive has to fail on each failure planted for it, a few seconds into the drive: a building
 *  with no walls across the route ahead (it drives into it), the car held off the street on a
 *  sidewalk or a lawn, a 4 m jump in one step, the car held 2.5 m over the road, NaN speed. */
window.__DRIVE_SELFTEST__ = async (opts = {}) => {
  const G = G0(), W = G.walk, base = { seconds: opts.seconds ?? 20, seed: opts.seed ?? 1, exitEvery: 1e9 };
  const going = (c) => c.simT >= 3 && c.car.v > 5 && c.seg >= 1 && c.route && roadDist(c.ix, c.car.x, c.car.z).out < 0; // (on its way down its street)
  let armed = null;
  const cases = {
    inside: (ph, c) => {
      if (armed || !going(c)) return;
      // (straight ahead of it: a 12 m block starting 2 m past its middle)
      plantHollow(W, c.car.x - Math.sin(c.car.yaw) * 8, c.car.z - Math.cos(c.car.yaw) * 8, 6);
      armed = true;
    },
    offRoad: (ph, c) => {
      // driving on along its street but beside it, on the verge: held its road's half width + 4 m
      // to the side (toward the open side) for 1.7 s while it keeps going
      if (!armed) {
        if (!going(c) || Math.abs(c.err) > 0.2 || c.turning) return;
        // (the side that takes it farther off every carriageway — not back across its own road)
        const rx = Math.cos(c.car.yaw), rz = -Math.sin(c.car.yaw), off = roadDist(c.ix, c.car.x, c.car.z).hw + 4;
        const outAt = (sd) => roadDist(c.ix, c.car.x + rx * sd * off, c.car.z + rz * sd * off).out, sd = outAt(1) >= outAt(-1) ? 1 : -1;
        if (outAt(sd) < 3) return; // (a junction beside it: try further on)
        armed = { sd, n: 0, rx, rz, x0: c.car.x, z0: c.car.z, off };
      }
      if (armed.n++ < 100) {
        const lat = (c.car.x - armed.x0) * armed.rx + (c.car.z - armed.z0) * armed.rz, k = armed.sd * armed.off - lat;
        (c.car.x += armed.rx * k), (c.car.z += armed.rz * k);
      }
    },
    jumps: (ph, c) => { if (!armed && going(c)) (c.car.x += 4), (armed = true); },
    flying: (ph, c) => {
      if (!armed && going(c)) armed = { n: 0 };
      if (armed && armed.n++ < 60) c.car.y = c.car.feet = W.outdoorNear(c.car.x, c.car.z, c.car.y) + 2.5;
    },
    nan: (ph, c) => { if (!armed && going(c)) (c.car.v = NaN), (armed = true); },
  };
  const out = {};
  for (const [name, fn] of Object.entries(cases)) {
    armed = null;
    let r;
    try { r = await window.__DRIVE__({ ...base, plant: fn }); } catch (e) { r = { pass: true, error: String(e?.message ?? e) }; } finally { unplant(W); }
    out[name] = { caught: armed ? !r.pass && (r[name] ?? 0) > 0 : null, pass: r.pass, [name]: r[name] ?? 0, metres: r.metres, ...(r.error ? { error: r.error } : {}), ...(r.why ? { why: r.why } : {}) };
  }
  const detects = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.caught]));
  return { pass: Object.values(detects).every((v) => v !== false), detects, cases: out };
};


// ---- teleports: to a door (a click on a house), a street, anywhere (the map's "walk here" on the
// water, a roof, a yard) — the atlas's own path — then the game's settleWalker and a frame: where
// the walker is left ----
window.__TELEPORTS__ = async (opts = {}) => {
  const G = G0(), W = G.walk, w = G.walker, V = G.vehicles;
  const n = opts.n ?? 6, radius = opts.radius ?? 1200, top = opts.top ?? 12, kinds = opts.kinds ?? ['door', 'street', 'spot'];
  const R = rng((opts.seed ?? 1) * 15485863 + 3);
  const plant = typeof opts.plant === 'function' ? opts.plant : () => {};
  if (V.driving) V.toggle();
  const fly0 = G.walkParams.fly;
  G.walkParams.fly = false;
  const start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const doors = doorList(G, start.x, start.z, radius);
  const roads = roadsNear(G, start.x, start.z, radius).sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1] || a.p.length - b.p.length);
  const out = [];
  try {
    for (let k = 0; k < n; k++) {
      let kind = kinds[k % kinds.length], x, z;
      if (kind === 'at' && opts.at) [x, z] = opts.at;
      else if (kind === 'door' && doors.length) {
        const d = doors[Math.floor(R() * doors.length)];
        (x = (d.fx ?? d.wx) + d.nx * 2), (z = (d.fz ?? d.wz) + d.nz * 2);
      } else if (kind === 'street' && roads.length) {
        const r = roads[Math.floor(R() * roads.length)], i = 2 * Math.floor(R() * (r.p.length / 2 - 1));
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az) || 1;
        const t = R(), off = (R() < 0.5 ? -1 : 1) * ((r.w ?? 6) / 2 + 1.5);
        (x = ax + (bx - ax) * t - ((bz - az) / L) * off), (z = az + (bz - az) * t + ((bx - ax) / L) * off);
      } else {
        kind = 'spot';
        const a = R() * 2 * Math.PI, d = radius * Math.sqrt(R());
        (x = start.x + Math.cos(a) * d), (z = start.z + Math.sin(a) * d);
      }
      if (!inFrame(G, x, z)) continue; // (it would reload the page on another region)
      const [lat, lon] = G.ctx.toLatLon(x, z), t0 = performance.now();
      await (opts.atlas === false ? G.teleport(lat, lon) : G.ctx.teleport(lat, lon));
      const ms = performance.now() - t0;
      plant('landed', { G, W, w, x: w.x, z: w.z });
      const x1 = w.x, z1 = w.z, first = standProblems(G, w.x, w.z, w.feet);
      // the game looks after it: settleWalker (a wall through you, a solid building round you),
      // then a frame (the tile under you, the interior's walls), and settleWalker again
      settle(G);
      await frames(1);
      settle(G);
      const moved = Math.hypot(w.x - x1, w.z - z1);
      const problems = standProblems(G, w.x, w.z, w.feet);
      const inRooms = W.interiorAt(w.x, w.z, w.feet) >= 0;
      // (in a building's rooms: looking into them or out of its door?)
      let facing = null;
      if (inRooms) {
        const d = doorList(G, w.x, w.z, 4)[0];
        if (d) facing = -Math.sin(w.yaw) * d.nx - Math.cos(w.yaw) * d.nz > 0 ? 'out' : 'in';
      }
      out.push({ kind, to: [r2(x), r2(z)], at: [r2(w.x), r2(w.z), r2(w.feet)], off: r2(Math.hypot(w.x - x, w.z - z)), ms: Math.round(ms), inRooms, facing, settled: moved > 0.05 ? r2(moved) : 0, ...(moved > 0.05 && first.length ? { before: first } : {}), problems });
    }
  } finally {
    await G.stream.ensureAround(start.x, start.z);
    w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
    G.walkParams.fly = fly0;
  }
  const by = {};
  for (const r of out) {
    const b = (by[r.kind] ??= { n: 0, bad: 0, inRooms: 0, facingIn: 0, settled: 0 });
    b.n++;
    if (r.problems.length) b.bad++;
    if (r.inRooms) b.inRooms++;
    if (r.facing === 'in') b.facingIn++;
    if (r.settled) b.settled++;
  }
  const bad = out.filter((r) => r.problems.length), ms = out.map((r) => r.ms);
  return {
    pass: bad.length === 0, n: out.length, bad: bad.length, inRooms: out.filter((r) => r.inRooms).length, settled: out.filter((r) => r.settled).length, byKind: by,
    meanMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, maxMs: ms.length ? Math.max(...ms) : null,
    fails: bad.slice(0, top), landings: out,
  };
};

/** The teleports check has to fail where the landing is bad and the game can't mend it: a fenced
 *  yard with no gate round the spot (shut in); a building with no walls or rooms dropped over the
 *  landing, wider than settleWalker looks (in a solid building); walls every 30 cm over it (in a
 *  wall). And where it stands: on the water, under the ground. (Doors are hidden meanwhile, so the
 *  teleport lands on the spot itself rather than inside the nearest house.) */
window.__TELEPORTS_SELFTEST__ = async () => {
  const G = G0(), W = G.walk, w = G.walker, S = G.stream;
  const x0 = w.x, z0 = w.z, f0 = w.feet;
  const cases = {
    shutIn: { pre: () => plantRing(W, x0, z0, 2.4, 16), want: /shut in/ },
    solid: { plant: once((ph, c) => ph === 'landed' && (plantHollow(W, c.x, c.z, 22), true)), want: /solid building/ },
    wall: { plant: once((ph, c) => ph === 'landed' && (plantIn(W, () => { for (let k = -64; k <= 64; k++) W.addWall([c.x - 20, c.z + k * 0.3 + 0.05], [c.x + 20, c.z + k * 0.3 + 0.05]); }), true)), want: /in a wall/ },
  };
  const out = {};
  for (const [name, c] of Object.entries(cases)) {
    let r;
    Object.defineProperty(S, 'doors', { get: () => [], configurable: true });
    try {
      c.pre?.();
      r = await window.__TELEPORTS__({ n: 1, kinds: ['at'], at: [x0, z0], plant: c.plant });
    } catch (e) { r = { pass: true, error: String(e?.message ?? e), landings: [] }; } finally {
      delete S.doors;
      unplant(W);
      w.place(x0, z0, w.yaw, 0, f0);
    }
    const l = r.landings?.[0], hit = !!l?.problems.some((p) => c.want.test(p));
    out[name] = { caught: !r.pass && hit, problems: l?.problems ?? [], settled: l?.settled ?? null, ...(r.error ? { error: r.error } : {}) };
  }
  // where it stands: the water (the nearest non-walkable ground, if any is near), under the ground
  let water = null;
  for (let rr = 25; rr <= 1500 && !water; rr += 25)
    for (let k = 0, n = Math.ceil((2 * Math.PI * rr) / 25); k < n && !water; k++) {
      const x = x0 + Math.cos((k / n) * 2 * Math.PI) * rr, z = z0 + Math.sin((k / n) * 2 * Math.PI) * rr, b = W.bounds;
      if (x > b.x0 + 40 && x < b.x1 - 40 && z > b.z0 + 40 && z < b.z1 - 40 && !W.walkable(x, z)) water = [x, z];
    }
  if (water) {
    const p = standProblems(G, water[0], water[1], 0);
    out.water = { caught: p.some((q) => /not walkable/.test(q)), at: water.map(r2), problems: p };
  } else out.water = { caught: null, why: 'no water within 1.5 km' };
  const pu = standProblems(G, x0, z0, f0 - 2);
  out.under = { caught: pu.some((q) => /under the ground/.test(q)), problems: pu };
  const detects = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.caught]));
  return { pass: Object.values(detects).every((v) => v !== false), detects, cases: out };
};


// ---- streaming: after a teleport, the ring of detail tiles round the walker fills in within the
// budget; then on the move (flying low at `speed` m/s) the walker's own cell is never empty. No
// tile mounts twice (a second copy over a live one, or a tile group left in the world that no
// loaded tile owns), no worker or page errors; the frames that hitched meanwhile are counted ----
window.__STREAMING__ = async (opts = {}) => {
  const G = G0(), S = G.stream, w = G.walker, V = G.vehicles;
  // (a software renderer mounts a tile a frame, a frame every few seconds: give it longer)
  const soft = softGpu(gpuName(G)), seconds = opts.seconds ?? (soft ? 120 : 30), speed = opts.speed ?? 20, moveS = opts.moveS ?? Math.min(20, seconds);
  const R = rng((opts.seed ?? 1) * 32452843 + 5), t0 = performance.now();
  const plant = typeof opts.plant === 'function' ? opts.plant : () => {};
  const loadR = G.streamParams?.loadR ?? window.__TIER__?.stream?.loadR ?? 1500, cell = S.man.cell;
  if (V.driving) V.toggle();
  const fly0 = G.walkParams.fly, start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const failed0 = new Map(S.failed), ids0 = new Set(S.loaded.keys()), dead0 = !!S.workerDead, err0 = window.__RENDER_INFO__?.errors ?? 0;
  const mounted = new Set(), dropped = new Set();
  // what the stream mounts and unmounts meanwhile (its own mount / unload, wrapped on the instance)
  const mounts = new Map(), twice = [], mountAt = [];
  let reliefs = 0, remounts = 0;
  const own = (k) => Object.prototype.hasOwnProperty.call(S, k), m0 = S.mount, u0 = S.unload, ownM = own('mount'), ownU = own('unload');
  S.mount = function (p, staged) {
    const id = p?.spec?.id, before = id ? S.loaded.get(id) : undefined;
    const r = m0.call(this, p, staged);
    const after = id ? S.loaded.get(id) : undefined;
    if (after && after !== before) {
      mountAt.push(performance.now());
      if (p.replace) reliefs++;
      else if (before) twice.push(id); // (a second copy over one still mounted)
      else if (mounts.has(id)) remounts++;
      mounts.set(id, (mounts.get(id) ?? 0) + 1);
    }
    return r;
  };
  S.unload = function (id, retire) { if (S.loaded.has(id)) dropped.add(id); return u0.call(this, id, retire); };
  // worker notes, warnings, page errors and frame errors meanwhile
  const logged = [], lp = S.workerLog.push;
  S.workerLog.push = function (...a) { logged.push(...a.map(String)); return lp.apply(this, a); };
  const warns = [], warn0 = console.warn, pageErrs = [];
  console.warn = function (...a) {
    const m = a.map((v) => (v instanceof Error ? v.message : String(v))).join(' ');
    if (/tile|worker|relief|coarse/i.test(m)) warns.push(m.slice(0, 200));
    return warn0.apply(this, a);
  };
  const onErr = (e) => pageErrs.push(String(e?.message ?? e?.error?.message ?? e).slice(0, 200));
  const onRej = (e) => pageErrs.push(String(e?.reason?.message ?? e?.reason ?? e).slice(0, 200));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);
  // the page's frames meanwhile: intervals, and the slow ones (a mount in them, or not)
  const starts = [];
  let rafOn = true;
  const raf = (t) => { if (!rafOn) return; starts.push(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  // the detail ring round (x, z): every cell within loadR, covered by its own tile or (a real-lite
  // cell still on the wire, or offline) by its stand-in
  const ring = (x, z) => {
    const out = { cells: 0, covered: 0, standIns: 0, own: true, missing: [] };
    for (let cz = Math.floor((z - loadR) / cell); cz <= Math.floor((z + loadR) / cell); cz++)
      for (let cx = Math.floor((x - loadR) / cell); cx <= Math.floor((x + loadR) / cell); cx++) {
        const sp = S.specAt(cx, cz), b = sp.box;
        const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
        if (dx * dx + dz * dz >= loadR * loadR) continue;
        out.cells++;
        const real = S.loaded.has(sp.id), stand = !real && !!sp.world && S.loaded.has('s' + sp.id.slice(1));
        if (real || stand) out.covered++;
        else {
          out.missing.push(sp.id);
          if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) out.own = false;
        }
        if (stand) out.standIns++;
      }
    return out;
  };
  const track = () => {
    for (const id of S.loaded.keys()) if (!ids0.has(id)) mounted.add(id);
  };
  // wait until the ring round the walker is whole (or `limit` s): seconds it took, null if never
  const whole = async (limit) => {
    const s0 = performance.now();
    for (;;) {
      track();
      const r = ring(w.x, w.z);
      if (r.covered === r.cells) return r2((performance.now() - s0) / 1000);
      if (performance.now() - s0 > limit * 1000) return null;
      await wait(250);
    }
  };
  // tile groups in the world no loaded tile owns (nor a tile still taking over from them): a
  // second copy drawn over the first, or one an unload left behind
  const ghosts = () => {
    const keep = new Set();
    for (const t of S.loaded.values()) keep.add(t.group);
    for (const c of S.coarseLoaded?.values() ?? []) keep.add(c.group);
    for (const r of S.reveals ?? []) { keep.add(r.group); for (const g of r.retire) keep.add(g); }
    const roots = new Set([...keep].map((g) => g.parent).filter(Boolean));
    const out = [];
    for (const root of roots) for (const g of root.children) if (/^c?tile:/.test(g.name ?? '') && !keep.has(g)) out.push(g.name);
    return out;
  };
  let teleportMs = null, coverS = null, move = null, rg = null, missing = [];
  try {
    plant('start', { G, S, w });
    if (opts.teleport !== false) {
      // somewhere new: half to one ring away (seeded), so part of the ring is new ground
      let tx = w.x, tz = w.z;
      for (let k = 0; k < 12; k++) {
        const a = R() * 2 * Math.PI, d = loadR * (0.5 + 0.5 * R());
        (tx = w.x + Math.cos(a) * d), (tz = w.z + Math.sin(a) * d);
        if (inFrame(G, tx, tz)) break;
      }
      const [lat, lon] = opts.at ?? G.ctx.toLatLon(tx, tz);
      const tt = performance.now();
      await G.teleport(lat, lon);
      teleportMs = Math.round(performance.now() - tt);
    }
    coverS = await whole(seconds);
    rg = ring(w.x, w.z);
    missing = rg.missing.slice(0, 6);
    if (speed > 0 && moveS > 0) {
      // fly low over it (no walls, no settling) at `speed`, in a seeded direction; sample the ring
      G.walkParams.fly = true;
      const a = R() * 2 * Math.PI, vx = Math.cos(a) * speed, vz = Math.sin(a) * speed;
      const T = G.world.terrain, m0t = performance.now(), x0 = w.x, z0 = w.z;
      let last = m0t, ownMiss = 0, minCover = 1, samples = 0;
      while (performance.now() - m0t < moveS * 1000) {
        await wait(100);
        const now = performance.now(), dts = (now - last) / 1000;
        last = now;
        w.x += vx * dts;
        w.z += vz * dts;
        w.y = Math.max(0, T.heightAt(w.x, w.z)) + 40;
        track();
        const r = ring(w.x, w.z);
        samples++;
        minCover = Math.min(minCover, r.cells ? r.covered / r.cells : 1);
        if (!r.own) ownMiss += dts;
      }
      const metres = Math.round(Math.hypot(w.x - x0, w.z - z0));
      w.setFly(false); // (comes down on the nearest walkable spot)
      const again = await whole(seconds);
      move = { metres, samples, minCover: r2(minCover), ownMissS: r2(ownMiss), coverS: again };
    }
    await wait(120); // (let what's pending land: a timer's error, a worker's reply)
  } finally {
    rafOn = false;
    if (ownM) S.mount = m0; else delete S.mount;
    if (ownU) S.unload = u0; else delete S.unload;
    delete S.workerLog.push;
    console.warn = warn0;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onRej);
    G.walkParams.fly = fly0;
  }
  track();
  const fails = { service: 0, baked: 0, synth: 0, coarse: 0 };
  for (const [id, t] of S.failed) {
    if (failed0.get(id) === t) continue;
    if (id[0] === 'c') fails.coarse++;
    else if (id[0] === 'w') fails.service++;
    else if (id[0] === 's') fails.synth++;
    else fails.baked++;
  }
  const mountFails = warns.filter((m) => /mount failed/.test(m)).length;
  // (the worker's log is notes — LiDAR read, a cell asked in quarters; data it couldn't fetch, being
  // offline or rate-limited, is `offline`, not an error)
  const unreachable = (m) => /unavailable|failed to fetch|no survey|net::|err_|fetch|rate.?limit|timed? ?out|429|50[234]/i.test(m);
  const offline = logged.filter((m) => unreachable(m)).length + warns.filter((m) => unreachable(m)).length;
  const workerErrs = [...logged.filter((m) => /fail|error|exception|died|disabled|crash/i.test(m) && !unreachable(m)), ...warns.filter((m) => ((/worker/i.test(m) && /fail|died|disabled/i.test(m)) || /relief build failed/i.test(m)) && !unreachable(m))];
  if (S.workerDead && !dead0) workerErrs.push('the tile worker died: building in-page from now on');
  const frameErrors = (window.__RENDER_INFO__?.errors ?? 0) - err0, ghost = ghosts();
  // the hitches: frames over 50 and 100 ms, the worst, and how many of the 100 ms ones mounted a tile
  const iv = [];
  let mountHitches = 0;
  for (let i = 1; i < starts.length; i++) {
    const d = starts[i] - starts[i - 1];
    iv.push(d);
    if (d > 100 && mountAt.some((t) => t > starts[i - 1] && t <= starts[i])) mountHitches++;
  }
  const hs = frameStats(iv);
  const why = [];
  if (coverS === null) why.push(`the ring wasn't whole after ${seconds} s (${rg?.covered}/${rg?.cells}; missing ${missing.join(' ')})`);
  if (move && move.ownMissS > (opts.ownMissS ?? 0.5)) why.push(`the walker's own cell was empty for ${move.ownMissS} s on the move`);
  if (move && move.coverS === null) why.push(`the ring wasn't whole ${seconds} s after the move`);
  if (mountFails) why.push(`${mountFails} tile mounts failed`);
  if (fails.baked || fails.synth) why.push(`${fails.baked} baked and ${fails.synth} stand-in tiles failed to load`);
  if (twice.length) why.push(`mounted twice: ${[...new Set(twice)].slice(0, 4).join(' ')}`);
  if (ghost.length) why.push(`tile groups no loaded tile owns: ${ghost.slice(0, 4).join(' ')}`);
  if (workerErrs.length) why.push(`worker: ${workerErrs[0]}`);
  if (pageErrs.length) why.push(`page error: ${pageErrs[0]}`);
  if (frameErrors > 0) why.push(`${frameErrors} new frame errors`);
  const tiles = S.loaded.size, coarse = S.coarseLoaded?.size ?? null, ms = Math.round(performance.now() - t0);
  // back where it started (`stay: true` keeps the walker where the move ended)
  if (!opts.stay && Math.hypot(w.x - start.x, w.z - start.z) > 0.5) {
    await S.ensureAround(start.x, start.z);
    w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
  }
  return {
    pass: why.length === 0, teleportMs, ring: rg?.cells ?? 0, covered: rg?.covered ?? 0, coverS, standIns: rg?.standIns ?? 0,
    mounts: mounted.size, unloads: dropped.size, reliefs, remounts, twice: twice.length, ghosts: ghost.length,
    failures: fails.service + fails.baked + fails.synth + fails.coarse, failed: fails, mountFails,
    workerErrors: workerErrs.length, pageErrors: pageErrs.length, frameErrors, offline,
    frames: hs.frames, hitch50: hs.hitch50, hitch100: hs.hitch100, worstMs: hs.max, mountHitches,
    workerDead: !!S.workerDead, jobFails: S.jobFails ?? 0, ownMissS: move?.ownMissS ?? 0, minCover: move?.minCover ?? 1, move,
    tiles, coarse, ms, warnings: [...new Set([...warns, ...workerErrs, ...pageErrs])].slice(0, 6), fails: why,
  };
};

/** The streaming check has to fail on: a second copy of a mounted tile left in the world; a worker
 *  error; a page error; a ring cell that never comes back (unloaded, its rebuild refused). */
window.__STREAMING_SELFTEST__ = async (opts = {}) => {
  const G = G0(), S = G.stream, w = G.walker, out = {};
  const loaded = [...S.loaded.values()], root = loaded[0]?.group.parent;
  if (!root) return { pass: false, detects: {}, why: 'no tiles mounted' };
  let ghost = null;
  const r1 = await window.__STREAMING__({
    teleport: false, speed: 0, seconds: opts.seconds ?? 6,
    plant: (ph) => {
      if (ph !== 'start') return;
      ghost = new G.THREE.Group();
      ghost.name = loaded[0].group.name;
      root.add(ghost);
      S.workerLog.push(`tile build failed: ${PLANTED_ERR}`);
      setTimeout(() => { throw new Error(`${PLANTED_ERR} page error`); }, 0);
    },
  });
  root.remove(ghost);
  out.ghost = { caught: !r1.pass && r1.ghosts > 0 };
  out.workerError = { caught: !r1.pass && r1.workerErrors > 0 };
  out.pageError = { caught: !r1.pass && r1.pageErrors > 0 };
  // a ring cell that isn't the walker's own, unloaded, its rebuilds refused
  const loadR = G.streamParams?.loadR ?? 1500;
  const victim = loaded.find((t) => {
    const b = t.spec.box, dx = Math.max(b.x0 - w.x, 0, w.x - b.x1), dz = Math.max(b.z0 - w.z, 0, w.z - b.z1);
    return !t.spec.world && (dx > 0 || dz > 0) && dx * dx + dz * dz < (loadR * 0.8) ** 2;
  });
  if (victim) {
    const id = victim.spec.id, f0 = S.fetch, ownF = Object.prototype.hasOwnProperty.call(S, 'fetch');
    S.fetch = function (t) { return t.id === id ? Promise.resolve(null) : f0.call(this, t); };
    let r2x;
    try {
      S.unload(id);
      r2x = await window.__STREAMING__({ teleport: false, speed: 0, seconds: opts.seconds ?? 6 });
    } finally {
      if (ownF) S.fetch = f0; else delete S.fetch;
      await S.ensureAround(w.x, w.z);
    }
    out.missing = { caught: !r2x.pass && r2x.coverS === null, cell: id, back: S.loaded.has(id) };
  } else out.missing = { caught: null, why: 'no other ring cell mounted' };
  const detects = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.caught]));
  return { pass: Object.values(detects).every((v) => v !== false), detects, cases: out };
};


// ---- frame pacing: the page's own frames standing still, walking down the street, then flying
// straight on (streaming, interiors, life and the ground paint running as they do) ----
// Each frame's start (the rAF time every callback of a frame shares) and the end of its draw (the
// post pass is the last thing drawn) give the interval between frames and the frame's own work;
// long tasks catch the stalls between frames. Judged against a budget: `desktop`, `phone`, `soft`
// (software GL: SwiftShader draws a frame every second or two, so only a freeze fails there) or
// your own { p50, p95, p99, perMin100 }; by default `soft` on a software renderer, else the page's
// quality tier.
window.__FRAMES__ = async (opts = {}) => {
  const G = G0(), w = G.walker, seconds = opts.seconds ?? 8;
  const gpu = gpuName(G), soft = softGpu(gpu);
  const name = typeof opts.budget === 'string' ? opts.budget : opts.budget ? 'custom' : soft ? 'soft' : (window.__TIER__?.tier ?? 'desktop') === 'desktop' ? 'desktop' : 'phone';
  const budget = typeof opts.budget === 'object' && opts.budget ? opts.budget : FRAME_BUDGETS[name] ?? FRAME_BUDGETS.desktop;
  let longN = 0, longMax = 0, po = null;
  try {
    po = new PerformanceObserver((l) => { for (const e of l.getEntries()) (longN++, (longMax = Math.max(longMax, e.duration))); });
    po.observe({ type: 'longtask' });
  } catch { /* no long-task timing here */ }
  const P = window.__PERF__, perf0 = P ? { ...P } : null;
  if (P) (P.detail = 0), (P.interior = 0);
  const err0 = window.__RENDER_INFO__?.errors ?? 0;
  const start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const all = { iv: [], work: [] };
  // one phase: the page's frames for `seconds` (a software renderer: until there are a few)
  const measure = async () => {
    const starts = [], ends = [];
    let on = true;
    const raf = (t) => { if (!on) return; starts.push(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    const post = G.post, pr = post.render, ownR = Object.prototype.hasOwnProperty.call(post, 'render');
    post.render = function (...a) { const r = pr.apply(this, a); ends.push(performance.now()); return r; };
    const t0 = performance.now(), minFrames = opts.minFrames ?? 6, maxS = opts.maxS ?? Math.max(seconds, 90);
    try {
      await wait(seconds * 1000);
      while (starts.length < minFrames && performance.now() - t0 < maxS * 1000) await wait(250);
    } finally {
      on = false;
      if (ownR) post.render = pr; else delete post.render;
    }
    const iv = [];
    for (let i = 1; i < starts.length; i++) iv.push(starts[i] - starts[i - 1]);
    const work = ends.map((e) => { for (let i = starts.length - 1; i >= 0; i--) if (starts[i] <= e) return e - starts[i]; return NaN; });
    all.iv.push(...iv);
    all.work.push(...work);
    const st = frameStats(iv, work), j = judgeFrames(st, budget);
    return { ...st, pass: j.pass, over: j.over };
  };
  const out = {};
  if (opts.stand !== false) out.stand = await measure();
  // walk down the nearest street: the walker's own keys, held (W)
  if (opts.walk !== false && !G.vehicles.driving && !G.walkParams.fly) {
    const g = roadGraph(roadsNear(G, w.x, w.z, 120)), route = randomRoute(g, w.x, w.z, rng(opts.seed ?? 1), 60);
    if (route.pts.length > 1) w.yaw = yawTo(route.pts[1][0] - w.x, route.pts[1][1] - w.z);
    w.keys.add('KeyW');
    try { out.walk = await measure(); } finally { w.keys.delete('KeyW'); w.place(start.x, start.z, start.yaw, start.pitch, start.feet); }
  }
  // fly straight and level, 80 m up, at the default flying speed (W held): the ground paint's windows
  // move every 66 m and the ring streams in (Robby: "flying through Sea Bright it locks up every ~2 s"
  // — the walk never got 66 m from where it started)
  if (opts.fly !== false && !G.vehicles.driving) {
    const fly0 = G.walkParams.fly, y0 = w.y;
    G.walkParams.fly = true;
    w.y = w.feet + 80;
    w.pitch = 0;
    w.keys.add('KeyW');
    try { out.fly = await measure(); } finally {
      w.keys.delete('KeyW');
      G.walkParams.fly = fly0;
      w.y = y0;
      w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
    }
  }
  po?.disconnect();
  const st = frameStats(all.iv, all.work), errors = (window.__RENDER_INFO__?.errors ?? 0) - err0;
  const perf = P ? { detail: r2(P.detail), interior: r2(P.interior) } : null;
  if (P && perf0) (P.detail = Math.max(P.detail, perf0.detail)), (P.interior = Math.max(P.interior, perf0.interior));
  const over = Object.entries(out).flatMap(([k, v]) => v.over.map((o) => `${k}: ${o}`));
  if (errors) over.push(`${errors} new frame errors`);
  return { pass: Object.values(out).every((v) => v.pass) && errors === 0, budget: name, gpu, soft, ...st, ...out, longTasks: longN, longMax: Math.round(longMax), perf, errors, over, fails: over };
};

/** The frame check has to fail when frames stall: every third frame's draw held up by 2.5× this
 *  page's own median frame (at least 150 ms), judged against a budget of 1.8× that median. */
window.__FRAMES_SELFTEST__ = async (opts = {}) => {
  const G = G0(), post = G.post, s = opts.seconds ?? 2;
  const base = await window.__FRAMES__({ seconds: s, walk: false, minFrames: 6 });
  const m = base.stand?.p50 ?? 16, stallMs = Math.round(Math.max(150, 2.5 * m));
  const pr = post.render, ownR = Object.prototype.hasOwnProperty.call(post, 'render');
  let n = 0;
  post.render = function (...a) {
    const r = pr.apply(this, a);
    if (++n % 3 === 0) { const t = performance.now(); while (performance.now() - t < stallMs); }
    return r;
  };
  let r;
  try { r = await window.__FRAMES__({ seconds: s, walk: false, minFrames: 9, budget: { p50: null, p95: 1.8 * m + 20, p99: 1.8 * m + 20, perMin100: null } }); } finally {
    if (ownR) post.render = pr; else delete post.render;
  }
  const st = r.stand ?? {}, hitches = stallMs >= 100 ? st.hitch100 : st.hitch50;
  const caught = !r.pass && st.max >= stallMs * 0.9 && hitches >= 2;
  return { pass: caught, detects: { stalls: caught }, medianMs: m, stallMs, got: { frames: st.frames, p95: st.p95, max: st.max, hitch100: st.hitch100 } };
};

const RUN = {
  overlaps: (o) => window.__OVERLAPS__(o),
  doors: (o) => window.__DOORS__(o),
  posts: (o) => window.__ROADPOSTS__(o),
  roads: (o) => window.__ROADWALLS__(o),
  flicker: (o) => window.__FLICKER__(o),
  altitude: (o) => window.__ALTITUDE__(o),
  frames: (o) => window.__FRAMES__(o),
  walkabout: (o) => window.__WALKABOUT__(o),
  drive: (o) => window.__DRIVE__(o),
  teleports: (o) => window.__TELEPORTS__(o),
  streaming: (o) => window.__STREAMING__(o),
};
// The self-tests (overlaps and doors predate them; altitude is the flicker check at heights)
const SELF = {
  flicker: async () => { const r = await window.__FLICKER_SELFTEST__(); return { pass: r.detects, detects: { fight: r.detects }, worstShare: r.worstShare }; },
  posts: () => window.__ROADPOSTS_SELFTEST__(),
  roads: () => window.__ROADWALLS_SELFTEST__(),
  frames: (o) => window.__FRAMES_SELFTEST__(o),
  walkabout: (o) => window.__WALKABOUT_SELFTEST__(o),
  drive: (o) => window.__DRIVE_SELFTEST__(o),
  teleports: (o) => window.__TELEPORTS_SELFTEST__(o),
  streaming: (o) => window.__STREAMING_SELFTEST__(o),
};
/** Every check's self-test (or `only` some): each plants the failures its check claims to catch
 *  and passes when the check fails on each of them. A case that couldn't be set up here (no door
 *  to walk in at, no water near) is `null`, not a miss. */
window.__SELFTESTS__ = async (opts = {}) => {
  const G = G0(), w = G.walker, out = {};
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s) => String(s).trim()).filter(Boolean);
  const only = list(opts.only), skip = list(opts.skip);
  const start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  for (const name of Object.keys(SELF)) {
    if ((only.length && !only.includes(name)) || skip.includes(name)) continue;
    const t = performance.now();
    try { out[name] = await SELF[name]({ seed: opts.seed }); } catch (e) { out[name] = { pass: false, error: String(e?.stack ?? e).slice(0, 600) }; }
    out[name].ms = Math.round(performance.now() - t);
    console.info(`playtest self-test ${name}: ${out[name].error ? 'ERROR' : out[name].pass ? 'pass' : 'FAIL'} · ${Object.entries(out[name].detects ?? {}).map(([k, v]) => `${k} ${v === null ? 'n/a' : v ? 'caught' : 'MISSED'}`).join(' · ')}`);
    if (G.vehicles.driving) G.vehicles.toggle();
    unplant(G.walk);
    if (Math.hypot(w.x - start.x, w.z - start.z) > 0.5) await G.stream.ensureAround(start.x, start.z);
    w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
  }
  return { pass: Object.values(out).every((r) => r.pass), ...out };
};

/** Every check (or `only` / `skip` some; `<check>: false` drops one, `<check>: {…}` passes it
 *  options; `quick: true` leaves out the slow ones that wait on the page's frames — flicker,
 *  altitude, frames, streaming). Options at the top level go to every check (`seed`, `seconds`,
 *  `top`; the older checks' `max`, `frames`, `heights`). `selftest: true` also runs the self-tests
 *  of the checks that ran. Each check starts where the first did. The report (with a one-line
 *  `summary`) lands in window.__PLAYTEST_LAST__; each check's line goes to the console as it
 *  finishes. */
window.__PLAYTEST__ = async (opts = {}) => {
  const t0 = performance.now(), G = G0(), w = G.walker, report = {};
  const names = planChecks(opts);
  const common = {};
  for (const [k, v] of Object.entries(opts)) if (!['only', 'skip', 'quick', 'selftest'].includes(k) && (!CHECKS.includes(k) || typeof v === 'number')) common[k] = v;
  const start = { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch, feet: w.feet };
  const [lat, lon] = G.ctx.toLatLon(w.x, w.z);
  Object.assign(report, { place: G.stream?.man?.id ?? null, at: [+lat.toFixed(5), +lon.toFixed(5)], gpu: gpuName(G), checks: names });
  for (const name of names) {
    const o = { ...common, ...(opts[name] && typeof opts[name] === 'object' ? opts[name] : {}) }, t = performance.now();
    let r;
    try { r = await RUN[name](o); } catch (e) { r = { pass: false, error: String(e?.stack ?? e).slice(0, 800) }; }
    r = r && typeof r === 'object' ? r : { pass: false, error: `no report (${String(r)})` };
    r.ms = Math.round(performance.now() - t);
    report[name] = r;
    console.info(`playtest ${name}: ${r.error ? 'ERROR' : r.pass === false ? 'FAIL' : 'pass'} · ${summarize(name, r)}`);
    if (G.vehicles.driving) G.vehicles.toggle();
    if (Math.hypot(w.x - start.x, w.z - start.z) > 0.5) {
      await G.stream.ensureAround(start.x, start.z);
      w.place(start.x, start.z, start.yaw, start.pitch, start.feet);
    }
  }
  if (opts.selftest) report.selftest = await window.__SELFTESTS__({ only: names.filter((n) => SELF[n]), seed: opts.seed });
  report.errors = window.__RENDER_INFO__?.errors ?? null;
  report.pass = names.every((n) => report[n]?.pass !== false) && (!report.selftest || report.selftest.pass);
  report.ms = Math.round(performance.now() - t0);
  report.summary = verdictLine(report);
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
