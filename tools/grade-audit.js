// Grade + traffic audit (the reviewer's MF2 tests, runnable on any streamed town):
//   on a game page (?at=…&capture=1):  await import('/tools/grade-audit.js');
//   __GRADES__()   every drivable way in the streamed real cells, its steepest 8 m of ground as
//                  the walker, the cars and the ribbons see it — none untagged may pass 25%
//   await __CAROBB__(seconds)   moving and parked cars sampled over time: overlapping footprints
//                  (oriented boxes, 4.4 × 1.8 m) — must be zero
//   await __CARPROBE__({ seconds })   the same for moving cars on a private copy of the sim, fast,
//                  each overlap classified, and whether the traffic flows or knots
// Nothing about a place is written here: the ways and cars are the page's own.

const DRIVE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;

window.__GRADES__ = (opts = {}) => {
  const G = window.__GAME__, T = G.world.terrain;
  const out = [];
  // only where real cells are loaded all round (a real cell's edge beside a stand-in or an
  // unloaded cell is a seam between graded and ungraded ground until the neighbour lands)
  const boxes = [...G.stream.loaded.values()].filter((t) => t?.spec?.world).map((t) => t.spec.box);
  const inside = (x, z) => boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) && [[8, 0], [-8, 0], [0, 8], [0, -8]].every(([dx, dz]) => boxes.some((b) => x + dx > b.x0 && x + dx < b.x1 && z + dz > b.z0 && z + dz < b.z1));
  for (const r of G.stream.primRoads) {
    if (!DRIVE.test(r.c) || r.br || r.tu || r.sy || r.lod) continue;
    let worst = 0, at = null;
    const p = r.p;
    // the surface a car on this way rides, every 4 m: the ground, or the deck (a pier, a lid) it
    // is already on — walk.outdoorNear, as the traffic sim samples it
    const pts = [];
    let next = 0, run = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az);
      while (next <= run + L) { const t = L ? (next - run) / L : 0; pts.push([ax + (bx - ax) * t, az + (bz - az) * t]); next += 4; }
      run += L;
    }
    let y = pts.length ? G.walk.outdoorSurfaceAt(pts[0][0], pts[0][1]) : 0;
    const ys = pts.map(([x, z]) => (y = G.walk.outdoorNear(x, z, y)));
    for (let k = 1; k + 1 < ys.length; k++) {
      if (!inside(pts[k - 1][0], pts[k - 1][1]) || !inside(pts[k + 1][0], pts[k + 1][1])) continue;
      const g = Math.abs(ys[k + 1] - ys[k - 1]) / Math.max(1e-3, Math.hypot(pts[k + 1][0] - pts[k - 1][0], pts[k + 1][1] - pts[k - 1][1]));
      if (g > worst) (worst = g), (at = pts[k]);
    }
    out.push({ n: r.n ?? '', c: r.c, ic: r.ic ?? null, g: +worst.toFixed(3), at: at && at.map(Math.round) });
  }
  out.sort((a, b) => b.g - a.g);
  const limit = (w) => (w.ic != null ? Math.max(0.25, w.ic + 0.05) : 0.25);
  const over = out.filter((w) => w.g > limit(w));
  const hist = [0.05, 0.1, 0.15, 0.2, 0.25, 1].map((t, i, a) => ({ upTo: t, ways: out.filter((w) => w.g <= t && w.g > (i ? a[i - 1] : -1)).length }));
  return { ways: out.length, over: over.length, overList: over.slice(0, 20), hist, top: out.slice(0, opts.top ?? 12) };
};

window.__CAROBB__ = async (seconds = 20) => {
  const G = window.__GAME__;
  const { RANGES, S, H } = await import('/src/sim/protocol.ts');
  const L = 4.4, W = 1.8;
  const corners = (c) => {
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = -fz, rz = fx;
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [c.x + fx * a * L / 2 + rx * b * W / 2, c.z + fz * a * L / 2 + rz * b * W / 2]);
  };
  // separating axis test for two oriented rectangles
  const overlap = (A, B) => {
    for (const P of [A, B])
      for (let i = 0; i < 2; i++) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 1], nx = z1 - z0, nz = x0 - x1;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
        for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
        if (a1 <= b0 || b1 <= a0) return false;
      }
    return true;
  };
  const hits = new Map();
  let frames = 0, seen = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < seconds * 1000) {
    const Lf = G.life, h = Lf.V.header, snap = Lf.V.snaps[h[H.FRONT]], cars = [];
    for (let i = RANGES.cars[0]; i < RANGES.cars[1]; i++) {
      const o = i * S.STRIDE;
      if (snap[o + S.FLAGS] & 1 && snap[o + S.Y] > -500) cars.push({ id: 'm' + i, x: snap[o + S.X], z: snap[o + S.Z], yaw: snap[o + S.YAW] });
    }
    // parked cars (kerb and lot records, kerbCars.ts: x, y, z, yaw, …) within 500 m of the walker
    const wx = G.walker.x ?? G.walker.pos?.x ?? 0, wz = G.walker.z ?? G.walker.pos?.z ?? 0;
    for (const [id, t] of G.stream.loaded)
      if (t.kerb) for (let i = 0, k = 0; i + 11 <= t.kerb.length; i += 11, k++) {
        const x = t.kerb[i], z = t.kerb[i + 2];
        if (Math.abs(x - wx) < 500 && Math.abs(z - wz) < 500) cars.push({ id: `k${id}:${k}`, x, z, yaw: t.kerb[i + 3] });
      }
    seen = Math.max(seen, cars.length);
    // a 6 m hash: only neighbours are tested
    const grid = new Map();
    cars.forEach((c, i) => { const k = Math.floor(c.x / 6) + ',' + Math.floor(c.z / 6); (grid.get(k) ?? grid.set(k, []).get(k)).push(i); });
    const cs = cars.map(corners);
    for (let a = 0; a < cars.length; a++) {
      const gx = Math.floor(cars[a].x / 6), gz = Math.floor(cars[a].z / 6);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        for (const b of grid.get(gx + dx + ',' + (gz + dz)) ?? []) {
          if (b <= a || (cars[a].id[0] === 'k' && cars[b].id[0] === 'k' && frames > 0)) continue; // (parked pairs once)
          if (overlap(cs[a], cs[b])) {
            const key = cars[a].id + '|' + cars[b].id;
            if (!hits.has(key)) hits.set(key, { a: cars[a].id, b: cars[b].id, x: Math.round(cars[a].x), z: Math.round(cars[a].z), d: +Math.hypot(cars[a].x - cars[b].x, cars[a].z - cars[b].z).toFixed(2) });
          }
        }
    }
    frames++;
    await new Promise((r) => setTimeout(r, 250));
  }
  const all = [...hits.values()], kind = (h) => (h.a[0] === 'm' ? 'm' : 'k') + (h.b[0] === 'm' ? 'm' : 'k');
  return { frames, cars: seen, pairs: all.length, moving: all.filter((h) => kind(h) === 'mm').length, movingParked: all.filter((h) => kind(h) !== 'mm' && kind(h) !== 'kk').length, parked: all.filter((h) => kind(h) === 'kk').length, sample: all.slice(0, 12) };
};

// The same test, fast and explained: a private LifeSim on the page's road graph, stepped on the
// main thread (minutes of traffic in seconds), every overlapping pair of moving cars classified —
// same lane (following failed), opposite lanes, a junction (two arms of one node), unrelated
// edges, different levels (a bridge over a street) — plus how the traffic flows (a queue is fine,
// a car stopped for good is a knot). The walker stands `at` (default: 40 m off the nearest street,
// so no car stops for them).
//   await __CARPROBE__({ seconds: 150, x, z })
window.__CARPROBE__ = async (opts = {}) => {
  const G = window.__GAME__;
  const { buildLifeBase, buildLifeInit } = await import('/src/sim/life.ts');
  const { LifeSim } = await import('/src/sim/lifeSim.ts');
  const { RANGES, SIM_HZ } = await import('/src/sim/protocol.ts');
  const init = buildLifeInit(buildLifeBase(G.world, G.walk), G.stream.primRoads, G.walk, G.stream.doors, G.stream.junctions, G.stream.tunnels);
  const sim = new LifeSim(init);
  const px = opts.x ?? G.walker.x, pz = opts.z ?? G.walker.z;
  const env = { playerX: px, playerZ: pz, night: 0, hour: opts.hour ?? 14, density: 1, wind: 0.3, clock: 50000 };
  sim.setEnv(env);
  const L = 4.4, W = 1.8, NE = init.edgeNodes, [c0, c1] = RANGES.cars;
  const box = (i) => {
    const fx = -Math.sin(sim.yaw[i]), fz = -Math.cos(sim.yaw[i]);
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [sim.x[i] + fx * a * L / 2 - fz * b * W / 2, sim.z[i] + fz * a * L / 2 + fx * b * W / 2]);
  };
  const overlap = (A, B) => {
    for (const P of [A, B])
      for (let i = 0; i < 2; i++) {
        const nx = P[i + 1][1] - P[i][1], nz = P[i][0] - P[i + 1][0];
        const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
        if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
      }
    return true;
  };
  const kinds = {}, pairs = new Set(), sample = [], still = new Float32Array(c1);
  let checks = 0, n = 0, moving = 0, stopped = 0, longest = 0;
  const steps = Math.round((opts.seconds ?? 150) * SIM_HZ), warm = 20 * SIM_HZ;
  for (let t = 0; t < steps; t++) {
    env.clock += 1 / SIM_HZ;
    sim.setEnv({ clock: env.clock }); // (setEnv copies: without this the lights never changed and no box claim ever aged)
    sim.step(1 / SIM_HZ);
    for (let i = c0; i < c1; i++) { still[i] = sim.active[i] && sim.speed[i] < 0.3 ? still[i] + 1 / SIM_HZ : 0; if (t >= warm) longest = Math.max(longest, still[i]); }
    if (t < warm || t % 5) continue;
    checks++;
    const ids = [];
    for (let i = c0; i < c1; i++) if (sim.active[i] && sim.y[i] > -500) { ids.push(i); n++; moving += sim.speed[i]; if (sim.speed[i] < 0.3) stopped++; }
    const B = new Map(ids.map((i) => [i, box(i)]));
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const i = ids[a], j = ids[b];
        if (Math.abs(sim.x[i] - sim.x[j]) > 5 || Math.abs(sim.z[i] - sim.z[j]) > 5 || !overlap(B.get(i), B.get(j))) continue;
        const ei = sim.edge[i], ej = sim.edge[j];
        const k = Math.abs(sim.y[i] - sim.y[j]) > 2.5 ? 'levels' : ei === ej ? (sim.dir[i] === sim.dir[j] ? 'same-lane' : 'opposite') : [NE[ei * 2], NE[ei * 2 + 1]].some((m) => m === NE[ej * 2] || m === NE[ej * 2 + 1]) ? 'junction' : 'unrelated';
        kinds[k] = (kinds[k] ?? 0) + 1;
        const key = i + ':' + j;
        if (!pairs.has(key) && sample.length < 8) sample.push({ t: +(t / SIM_HZ).toFixed(1), k, x: Math.round(sim.x[i]), z: Math.round(sim.z[i]) });
        pairs.add(key);
      }
  }
  return { cars: +(n / Math.max(1, checks)).toFixed(0), overlapTicks: Object.values(kinds).reduce((a, b) => a + b, 0), pairs: pairs.size, kinds, meanSpeed: +(moving / Math.max(1, n)).toFixed(2), stoppedShare: +(stopped / Math.max(1, n)).toFixed(2), longestStop: +longest.toFixed(0), sample };
};

// Trees (MF3): every instanced tree in the streamed cells — its base against the ground under it
// (a tree more than 3 m up stands on a roof or floats), its height (nothing over 45 m), and its
// trunk inside a building footprint (a tree on a structure).
window.__TREES__ = () => {
  const G = window.__GAME__, T = G.world.terrain, THREE = G.THREE;
  const world = G.scene.getObjectByName('world');
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let n = 0, maxH = 0;
  const up = [], tall = [], inside = [];
  world.traverse((o) => {
    if (!o.isInstancedMesh || !/^trees:/.test(o.name)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const top = o.geometry.boundingBox.max.y;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      m.decompose(p, q, s);
      n++;
      const g = T.heightAt(p.x, p.z), h = top * s.y;
      maxH = Math.max(maxH, h);
      const rec = { t: o.name, x: Math.round(p.x), z: Math.round(p.z), base: +(p.y - g).toFixed(1), h: +h.toFixed(1) };
      if (p.y - g > 3) up.push(rec);
      if (h > 45) tall.push(rec);
      if (G.walk.buildingAt(p.x, p.z) >= 0) inside.push(rec);
    }
  });
  return { trees: n, maxH: +maxH.toFixed(1), up: up.length, tall: tall.length, inside: inside.length, sample: [...up.slice(0, 5), ...tall.slice(0, 5), ...inside.slice(0, 5)] };
};
