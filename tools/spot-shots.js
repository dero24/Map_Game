// Spot studio: look at real places by latitude/longitude — a street on a hill from the kerb, a
// market from above, a car on a slope from its side. The reviewer's "does it look right HERE?"
// harness for any town (poses are data, passed in; nothing about a place is written here).
//
//   on a game page (?at=…&capture=1):  await import('/tools/spot-shots.js');
//   await __SPOTS__('tag', [{ lat, lon, bearing: 180, pitch: -4, eye: 1.7, label: '…' },
//                            { lat, lon, car: true, label: 'a car on the grade' }, …])
//
// bearing: compass degrees the camera faces (0 north, 90 east). weather: { cloud, seaFog, haze }
// over the fair-day default. eye: metres above the ground (over ~2.2 m the walker flies).
// street: stand on the sidewalk of the nearest real street, looking along it (the way nearest the
// bearing). car: frame the steepest-driving car near the spot from its side.
// subject: { lat, lon, h, r, name } — what the frame is of: a sphere r m across centred h m up,
// and/or `name`, a pattern the thing's own name (or a parent's) must match ('retaining-walls',
// 'player-vehicles', 'trees:'). It must fill ≥ `fill` of the frame (default 5%).
//
// Asserts that SEE (reviewer rounds 8b and 9, must-fix 4): once the frame has settled, an id render
// through a flat material — with depth, so only what's actually visible counts — measures:
//   the subject's visible pixels (pass 2: only the subject drawn, against pass 1's depth);
//   anything within 2.5 m of the lens above knee height (≤ 5% of the frame) or within 4 m (≤ 15%);
//   how much of the frame is the world at all (≥ 20%: a pose facing the sky fails);
// plus nothing at the lens (a ray), not inside a building, not up on a roof. A frame that fails is
// RE-POSED, not stamped: the subject is circled at the distance that frames it, from the bearing
// asked first and then round it, eye-level on open ground, until every assert passes (`repose:
// false` keeps the pose as given — the sky test). Only what still fails after that is stamped ✗.
// Saves shots/spots-<tag>.jpg; returns each pose's local position, what the lens saw, and whether
// and where it was re-posed.
await import('/tools/inpage-montage.js');

window.__SPOTS__ = async (tag = 'spots', poses = [], opts = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  const wait = window.__WAIT__;
  const { fromLatLon, toLatLon } = await import('/src/world/data.ts');
  const { RANGES, S, H } = await import('/src/sim/protocol.ts');
  const origin = G.world.json.origin;
  const g = (x, z) => G.world.terrain.heightAt(x, z);
  const idle = async (max = 120) => { for (let i = 0; i < max; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b) return; await wait(250); } };
  const frames = (n) => new Promise((done) => { let i = 0; const t = () => (++i >= n ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const cars = () => {
    const L = G.life, h = L.V.header, snap = L.V.snaps[h[H.FRONT]], out = [];
    for (let i = RANGES.cars[0]; i < RANGES.cars[1]; i++) {
      const o = i * S.STRIDE;
      if (snap[o + S.FLAGS] & 1 && snap[o + S.Y] > -500) out.push({ i, x: snap[o + S.X], y: snap[o + S.Y], z: snap[o + S.Z], yaw: snap[o + S.YAW], amt: snap[o + S.AMT] });
    }
    return out;
  };
  const info = [];
  const THREE = G.THREE;
  const STAGE = /^(ground|water|horizon|skyline|grass)$/;
  // ---- the id render: pass 1 draws the world (the ground and the far rings too: they hide what's
  // behind a hill, and they're what "the frame is the world" counts) in flat channels — green where a
  // fragment stands within 2.5 m of the lens above knee height, blue within 4 m, alpha = something
  // there; pass 2 draws only the subject (by name, else everything but the stage) against pass 1's
  // depth, red where it's the nearest thing and inside the sphere if there is one
  const idPass = (subj) => {
    const R = G.renderer, cam = G.camera, W = 320, Hh = Math.max(1, Math.round((W * window.innerHeight) / window.innerWidth));
    const rt = (window.__IDRT2__ ??= new THREE.WebGLRenderTarget(W, Hh, { depthBuffer: true }));
    if (rt.width !== W || rt.height !== Hh) rt.setSize(W, Hh);
    const mat = (window.__IDMAT2__ ??= new THREE.ShaderMaterial({
      uniforms: { uS: { value: new THREE.Vector4() }, uCam: { value: new THREE.Vector3() }, uPass: { value: 0 } },
      vertexShader: `varying vec3 vW;
        void main() {
          vec4 wp = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `uniform vec4 uS; uniform vec3 uCam; uniform float uPass; varying vec3 vW;
        void main() {
          if (uPass > 0.5) {
            if (uS.w > 0.0 && distance(vW, uS.xyz) > uS.w) discard;
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
            return;
          }
          float d = distance(vW, uCam), up = step(uCam.y - 1.2, vW.y);
          gl_FragColor = vec4(0.0, d < 2.5 ? up : 0.0, d < 4.0 ? up : 0.0, 1.0);
        }`,
      side: THREE.DoubleSide,
      depthFunc: THREE.LessEqualDepth,
    }));
    const world = G.scene.getObjectByName('world'), off = [];
    const hide = (o) => { if (o.visible) (off.push(o), (o.visible = false)); };
    // (only the world: the sky dome round the lens, anything carried with the camera, stay out)
    for (const o of G.scene.children) if (o !== world) hide(o);
    for (const c of world.children) if (c.name === 'grass') hide(c); // (blades at your feet aren't in the way)
    if (subj?.sphere) mat.uniforms.uS.value.set(subj.sphere.x, subj.sphere.y, subj.sphere.z, subj.sphere.r); else mat.uniforms.uS.value.set(0, 0, 0, 0);
    cam.getWorldPosition(mat.uniforms.uCam.value);
    const bg = G.scene.background, fog = G.scene.fog, prevRT = R.getRenderTarget(), prevClear = R.getClearColor(new THREE.Color()), prevAlpha = R.getClearAlpha(), prevAuto = R.autoClear;
    G.scene.background = null; G.scene.fog = null; G.scene.overrideMaterial = mat;
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear();
    mat.uniforms.uPass.value = 0;
    R.render(G.scene, cam);
    const px1 = new Uint8Array(W * Hh * 4);
    R.readRenderTargetPixels(rt, 0, 0, W, Hh, px1);
    let sub = 0;
    if (subj) {
      // pass 2: the subject alone (its meshes, and whatever holds them), depth kept from pass 1
      const re = subj.name ? new RegExp(subj.name) : null, named = (o) => { for (let p = o; p && p !== world; p = p.parent) if (re.test(p.name)) return true; return false; };
      const shown = new Set();
      world.traverse((o) => {
        if (o === world || !(o.isMesh || o.isPoints || o.isLine) || !o.visible) return;
        let top = o; while (top.parent && top.parent !== world) top = top.parent;
        if (re ? named(o) : !STAGE.test(top.name)) for (let p = o; p && p !== world; p = p.parent) shown.add(p);
      });
      world.traverse((o) => { if (o !== world && !shown.has(o)) hide(o); });
      R.autoClear = false;
      R.setClearColor(0x000000, 0);
      R.clearColor();
      mat.uniforms.uPass.value = 1;
      R.render(G.scene, cam);
      R.autoClear = prevAuto;
      const px2 = new Uint8Array(W * Hh * 4);
      R.readRenderTargetPixels(rt, 0, 0, W, Hh, px2);
      for (let i = 0; i < px2.length; i += 4) if (px2[i] > 127) sub++;
    }
    G.scene.overrideMaterial = null; G.scene.background = bg; G.scene.fog = fog; R.setRenderTarget(prevRT); R.setClearColor(prevClear, prevAlpha);
    for (const o of off) o.visible = true;
    let n25 = 0, n4 = 0, there = 0;
    for (let i = 0; i < px1.length; i += 4) { if (px1[i + 1] > 127) n25++; if (px1[i + 2] > 127) n4++; if (px1[i + 3] > 127) there++; }
    const N = W * Hh;
    return { subject: +(sub / N).toFixed(3), near25: +(n25 / N).toFixed(3), near4: +(n4 / N).toFixed(3), world: +(there / N).toFixed(3) };
  };
  // the subject's sphere in render space (null: a name alone)
  const sphereOf = (p) => {
    if (!p.subject || p.subject.lat == null) return null;
    const [sx, sz] = fromLatLon(origin, p.subject.lat, p.subject.lon);
    const sy = g(sx, sz) + (p.subject.h ?? 2), r = p.subject.r ?? 3;
    const world = G.scene.getObjectByName('world');
    const v = new THREE.Vector3(sx, sy, sz).applyMatrix4(world.matrixWorld);
    return { x: v.x, y: v.y, z: v.z, r, wx: sx, wy: sy, wz: sz };
  };
  // every assert on the frame as it stands: [] when it passes
  const check = (p, rec) => {
    const cam = G.camera, world = G.scene.getObjectByName('world');
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const ray = new THREE.Raycaster(cam.position.clone(), fwd, 0.1, 2.5);
    const kids = world.children.filter((c) => !STAGE.test(c.name) && c.visible !== false);
    // (an instanced crowd's hidden slots are zero-scaled: their hits come back at NaN metres)
    const hit = ray.intersectObjects(kids, true).find((h) => { if (!(h.distance <= 2.5)) return false; let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; });
    rec.occluded = hit ? `${hit.object.name || hit.object.parent?.name || hit.object.type} at ${hit.distance.toFixed(1)} m` : undefined;
    const wx = G.walker.x, wz = G.walker.z, gy = g(wx, wz);
    rec.inside = !G.walkParams.fly && G.walk.buildingAt(wx, wz) >= 0 ? true : undefined;
    const feet = G.walker.feet ?? gy;
    rec.onRoof = !G.walkParams.fly && feet - gy > 2.2 ? +(feet - gy).toFixed(1) : undefined;
    const subj = p.subject ? { sphere: sphereOf(p), name: p.subject.name } : null;
    const seen = idPass(subj);
    rec.seen = seen;
    rec.fill = subj ? seen.subject : undefined;
    const why = [];
    if (rec.occluded) why.push('lens blocked');
    if (rec.inside) why.push('inside');
    if (rec.onRoof) why.push('on a roof');
    if (subj && seen.subject < (p.subject.fill ?? 0.05)) why.push(`subject ${Math.round(seen.subject * 100)}%`);
    if (seen.near25 > 0.05) why.push(`${Math.round(seen.near25 * 100)}% within 2.5 m`);
    else if (seen.near4 > 0.15) why.push(`${Math.round(seen.near4 * 100)}% within 4 m`);
    if (seen.world < 0.2) why.push(`the world ${Math.round(seen.world * 100)}% of the frame`);
    return why;
  };
  // the lens square to a car's side, `side` ±1, d m out, `along` m toward its nose, looking at it
  const putCar = (c, side, d, along, p) => {
    const rx = Math.cos(c.yaw) * side, rz = -Math.sin(c.yaw) * side, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const cx = c.x + rx * d + fx * along, cz = c.z + rz * d + fz * along, eye = g(cx, cz) + (p.eye ?? 1.5);
    G.walkParams.fly = true;
    G.walker.place(cx, cz, Math.atan2(cx - c.x, cz - c.z), -Math.atan2(eye - (c.y + 0.7), Math.hypot(cx - c.x, cz - c.z)));
    G.walker.y = eye;
    return !G.walk.blocked(cx, cz, 1.0) && G.walk.buildingAt(cx, cz) < 0;
  };
  // a car frame: from either side, near and farther, a little fore or aft — the first place
  // every assert passes (the car seen, nothing at the lens: across a street the far kerb's
  // parked cars stand where a lens 7.5 m out would be), else the best of them
  const carPose = async (p, rec) => {
    const c = rec.carAt;
    let best = null, n = 0;
    for (const d of [p.dist ?? 7.5, 6, 9.5, 5, 12])
      for (const side of [1, -1])
        for (const along of [0, 2.5, -2.5]) {
          if (!putCar(c, side, d, along, p)) continue;
          n++;
          await frames(opts.reposeSettle ?? 16);
          const why = check(p, rec), sc = Math.min(rec.seen.subject, 0.04) / 0.04 - rec.seen.near25 * 4 - Math.max(0, rec.seen.near4 - 0.15) * 2 - (why.includes('lens blocked') ? 1 : 0);
          if (!why.length) { rec.reposed = { tries: n, side, d, along }; return []; }
          if (!best || sc > best.sc) best = { side, d, along, sc };
        }
    if (best) { putCar(c, best.side, best.d, best.along, p); await frames(opts.reposeSettle ?? 16); }
    rec.reposed = { tries: n, failed: true };
    return null;
  };
  // a walking eye on open ground at (x, z) looking at (tx, ty, tz); false where it can't stand
  const stand = (x, z, tx, ty, tz, eye = 1.7) => {
    if (!G.walk.walkable(x, z) || G.walk.buildingAt(x, z) >= 0 || G.walk.blocked(x, z, 0.6) || G.world.terrain.sdfAt(x, z) < 1) return false;
    const ey = g(x, z) + eye, d = Math.hypot(tx - x, tz - z);
    G.walkParams.fly = false;
    G.walker.place(x, z, Math.atan2(x - tx, z - tz), Math.atan2(ty - ey, d));
    return true;
  };
  // Re-pose: circle the subject at the distance that frames it (its sphere ~12% of the frame), from
  // the bearing asked first, then round it — closer along a bearing where it showed but small — or,
  // with no subject, step back and aside from the pose. None passing: the best of them (the most
  // subject, the least in the way) is the frame, and what it still misses is stamped.
  const repose = async (p, rec) => {
    const s = sphereOf(p);
    const cam = G.camera, Wd = window.innerWidth, Hd = window.innerHeight, f = Hd / 2 / Math.tan((cam.fov * Math.PI) / 360);
    const x0 = G.walker.x, z0 = G.walker.z, yaw0 = G.walker.yaw, want = p.subject?.fill ?? 0.05;
    const queue = [];
    if (s) {
      const dT = (s.r * f) / Math.sqrt((0.12 * Wd * Hd) / Math.PI);
      const b0 = Math.atan2(x0 - s.wx, z0 - s.wz); // (the side the pose looked from)
      for (const k of [1, 0.7, 1.4, 0.5, 2])
        for (const db of [0, 30, -30, 60, -60, 90, -90, 125, -125, 180]) queue.push({ b: b0 + (db * Math.PI) / 180, d: dT * k });
    } else {
      const fx = -Math.sin(yaw0), fz = -Math.cos(yaw0), px = -fz, pz = fx;
      for (const [back, side] of [[2, 0], [4, 0], [2, 2], [2, -2], [6, 0], [4, 3], [4, -3], [9, 0]]) queue.push({ x: x0 - fx * back + px * side, z: z0 - fz * back + pz * side, tx: x0 + fx * 30, ty: g(x0, z0) + 1.7 + Math.tan(G.walker.pitch) * 30, tz: z0 + fz * 30 });
    }
    let n = 0, best = null;
    const score = (why, seen) => (s ? Math.min(seen.subject, want) / want : 1) - (why.includes('lens blocked') ? 1 : 0) - seen.near25 * 4 - Math.max(0, seen.near4 - 0.15) * 2;
    while (queue.length && n < (opts.reposeTries ?? 26)) {
      const c = queue.shift();
      const x = c.x ?? s.wx + Math.sin(c.b) * c.d, z = c.z ?? s.wz + Math.cos(c.b) * c.d;
      const tx = c.tx ?? s.wx, ty = c.ty ?? s.wy, tz = c.tz ?? s.wz;
      if (!stand(x, z, tx, ty, tz)) continue;
      n++;
      await frames(opts.reposeSettle ?? 16);
      const why = check(p, rec), sc = score(why, rec.seen);
      if (!best || sc > best.sc) best = { x, z, tx, ty, tz, sc };
      if (!why.length) {
        const [lat, lon] = toLatLon(origin, x, z);
        rec.reposed = { tries: n, lat: +lat.toFixed(5), lon: +lon.toFixed(5), bearing: Math.round(((Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI + 360) % 360) };
        return [];
      }
      // seen from here but small: come in along this bearing (the fill grows with the square)
      if (s && c.b != null && !c.closer && rec.seen.subject > 0.004 && rec.seen.subject < want && !why.includes('lens blocked'))
        queue.unshift({ b: c.b, d: Math.max(2.5, c.d * Math.sqrt(rec.seen.subject / (want * 1.3))), closer: true });
    }
    if (best) { stand(best.x, best.z, best.tx, best.ty, best.tz); await frames(opts.reposeSettle ?? 16); }
    rec.reposed = { tries: n, failed: true };
    return null;
  };
  window.__SPOTKIT__ = { idPass, check, sphereOf, stand, repose }; // (for poking at one pose by hand)
  const F = poses.map((p, k) => ({ label: p.label ?? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, fn: async () => {
    G.setHour(p.hour ?? 14); G.timeParams.speed = 0;
    // (a fair day unless the pose asks for weather: the automatic weather drifts between frames)
    Object.assign(G.weatherParams, { autoWeather: false, cloud: 0.3, seaFog: 0, haze: 0.35, wind: 0.5 }, p.weather ?? {});
    const [x, z] = fromLatLon(origin, p.lat, p.lon);
    G.walkParams.fly = false;
    G.walker.place(x, z, 0, 0);
    await wait(400); await idle(p.wait ?? 160);
    const rec = { k, x: Math.round(x), z: Math.round(z) };
    if (p.car) {
      // the car on the steepest grade within 160 m, seen square from its kerb side (`car: 'parked'`:
      // the kerb's and the lots' parked cars — they hold still for the frame, a driving one moves
      // off it while the frame settles)
      let best = null, bg = 0;
      const pool = () => (p.car === 'parked' ? [...G.ctx.instances('kerb-cars:', x, z, 160), ...G.ctx.instances('parked-cars:', x, z, 160)].map((c) => ({ x: c.x, y: c.y, z: c.z, yaw: c.yaw ?? 0 })) : cars());
      for (let t = 0; t < 30; t++) {
        await wait(400);
        for (const c of pool()) {
          if (Math.hypot(c.x - x, c.z - z) > 160) continue;
          const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
          const gr = Math.abs(g(c.x + fx * 3, c.z + fz * 3) - g(c.x - fx * 3, c.z - fz * 3)) / 6;
          if (gr > bg) (bg = gr), (best = c);
        }
        if (bg > (p.minGrade ?? 0.08)) break;
      }
      if (best) {
        // square to its side (placed for real in the after hook, where every candidate is checked)
        rec.car = { grade: +bg.toFixed(3), x: Math.round(best.x), z: Math.round(best.z) };
        rec.carAt = best;
        putCar(best, 1, p.dist ?? 7.5, 0, p);
        // …and the car is the frame's subject: it must be there, and seen
        const [clat, clon] = toLatLon(origin, best.x, best.z);
        p.subject = { lat: clat, lon: clon, h: best.y + 0.8 - g(best.x, best.z), r: 2.6, fill: p.carFill ?? 0.04, name: p.car === 'parked' ? 'kerb-cars|parked-cars' : 'life-car' };
      }
    } else if (p.street) {
      // the nearest real street (not a path) to the spot: stand on its sidewalk, looking along it
      // the way nearest the bearing asked for
      const want = ((p.bearing ?? 0) * Math.PI) / 180, fx0 = Math.sin(want), fz0 = -Math.cos(want);
      let best = null, bd = 80;
      for (const r of G.stream.primRoads) {
        if (!r.w || r.lod || /^(path|footway|cycleway|steps|bridleway|track|service)$/.test(r.c)) continue;
        for (let i = 0; i + 3 < r.p.length; i += 2) {
          const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az);
          if (L < 8) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
          const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
          if (d < bd) (bd = d), (best = { ax, az, bx, bz, L, t, w: r.w, n: r.n });
        }
      }
      if (best) {
        let ux = (best.bx - best.ax) / best.L, uz = (best.bz - best.az) / best.L;
        if (ux * fx0 + uz * fz0 < 0) (ux = -ux), (uz = -uz);
        const nx = -uz, nz = ux, side = p.side ?? 1;
        let px = 0, pz = 0;
        let ok = false;
        for (const back of [0, 6, 12, -6, 18, 24, 36, -18]) {
          for (const sd of [side, -side]) {
            px = best.ax + (best.bx - best.ax) * best.t - ux * back + nx * sd * (best.w / 2 + 1.4);
            pz = best.az + (best.bz - best.az) * best.t - uz * back + nz * sd * (best.w / 2 + 1.4);
            if (!G.walk.blocked(px, pz, 0.6) && G.walk.buildingAt(px, pz) < 0) { ok = true; break; }
          }
          if (ok) break;
        }
        // (a street through a building passage: the nearest open ground instead of its roof)
        if (!ok) [px, pz] = G.walk.nearestWalkable(px, pz);
        G.walkParams.fly = false;
        G.walker.place(px, pz, Math.atan2(-ux, -uz), ((p.pitch ?? -2) * Math.PI) / 180);
        rec.street = best.n ?? '(unnamed)';
      }
    } else {
      const b = ((p.bearing ?? 0) * Math.PI) / 180, eye = p.eye ?? 1.7;
      let px = x, pz = z;
      // (never inside a building or a wall: the nearest open ground)
      if (eye <= 2.2 && (G.walk.buildingAt(px, pz) >= 0 || G.walk.blocked(px, pz, 0.5))) [px, pz] = G.walk.nearestWalkable(px, pz);
      G.walkParams.fly = eye > 2.2;
      G.walker.place(px, pz, -b, ((p.pitch ?? 0) * Math.PI) / 180);
      if (G.walkParams.fly) G.walker.y = g(px, pz) + eye;
    }
    info.push(rec);
  }, after: async function () {
    const rec = info[info.length - 1];
    if (!rec || rec.k !== k) return;
    let why = check(p, rec);
    // a frame that misses is re-posed until it doesn't (a car frame round its car)
    if (why.length && p.repose !== false) {
      if (p.car) { if (rec.carAt) await carPose(p, rec); }
      else await repose(p, rec);
      await frames(opts.settle ?? 40); // (the re-posed frame settles like the others before it's drawn)
      why = check(p, rec); // (what the frame as drawn still misses)
    }
    rec.why = why;
    if (why.length) this.label = `${this.label}  ✗ ${why.join(' · ')}`;
    else if (rec.reposed) this.label = `${this.label}  (re-posed)`;
  } }));
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 10, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 40, timers: true, cw: opts.cw ?? 640, cols: opts.cols ?? 3, save: `spots-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  // every pose that still fails an assert, by number — zero is the bar (a pose marked `expectFail`,
  // the sky test, must be among them)
  const fails = info.filter((r) => r.why?.length).map((r) => ({ k: r.k, why: r.why, fill: r.fill, reposed: r.reposed }));
  const selftest = poses.map((p, k) => (p.expectFail ? { k, failed: fails.some((f) => f.k === k) } : null)).filter(Boolean);
  return { res, info, fails: fails.filter((f) => !poses[f.k].expectFail), selftest };
};
