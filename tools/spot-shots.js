// Spot studio: look at real places by latitude/longitude — a street on a hill from the kerb, a
// market from above, a car on a slope from its side. The reviewer's "does it look right HERE?"
// harness for any town (poses are data, passed in; nothing about a place is written here).
//
//   on a game page (?at=…&capture=1):  await import('/tools/spot-shots.js');
//   await __SPOTS__('tag', [{ lat, lon, bearing: 180, pitch: -4, eye: 1.7, label: '…' },
//                            { lat, lon, car: true, label: 'a car on the grade' }, …])
//
// bearing: compass degrees the camera faces (0 north, 90 east). weather: { cloud, seaFog, haze }
// over the fair-day default. eye: metres above the ground
// (over ~2.2 m the walker flies). street: stand on the sidewalk of the nearest real street,
// looking along it (the way nearest the bearing). car: frame the steepest-driving car near the
// spot from its side. subject: { lat, lon, h, r } — what the frame is of (a point h m up, r m
// across): it must fill ≥ 5% of the frame.
// Every pose is checked: nothing within 2.5 m of the lens, not inside a building, not up on a
// roof (walking), the subject's fill — the result's `fails` lists the poses that missed. Once the
// frame has settled an id render measures what's actually seen: the subject's visible pixels (≥ 5%),
// anything within 2.5 m of the lens above knee height (≤ 5% of the frame) or within 4 m (≤ 15%);
// a miss is stamped on the sheet under its frame (✗ …).
// Saves shots/spots-<tag>.jpg; returns each pose's local position and, for car frames, the grade.
await import('/tools/inpage-montage.js');

window.__SPOTS__ = async (tag = 'spots', poses = [], opts = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  const wait = window.__WAIT__;
  const { fromLatLon } = await import('/src/world/data.ts');
  const { RANGES, S, H } = await import('/src/sim/protocol.ts');
  const origin = G.world.json.origin;
  const g = (x, z) => G.world.terrain.heightAt(x, z);
  const idle = async (max = 120) => { for (let i = 0; i < max; i++) { const b = typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy; if (!b) return; await wait(250); } };
  const cars = () => {
    const L = G.life, h = L.V.header, snap = L.V.snaps[h[H.FRONT]], out = [];
    for (let i = RANGES.cars[0]; i < RANGES.cars[1]; i++) {
      const o = i * S.STRIDE;
      if (snap[o + S.FLAGS] & 1 && snap[o + S.Y] > -500) out.push({ i, x: snap[o + S.X], y: snap[o + S.Y], z: snap[o + S.Z], yaw: snap[o + S.YAW], amt: snap[o + S.AMT] });
    }
    return out;
  };
  const info = [];
  // ---- asserts that see (the reviewer's round-8b must-fix 4): one extra render of the settled
  // frame through a flat id material — red where a fragment lies inside the subject's sphere, green
  // where one stands within 2.5 m of the lens, blue within 4 m (above knee height: the ground under
  // your feet is not an occluder) — with depth testing, so only what's actually visible counts
  const THREE = G.THREE;
  const idPass = (subj) => {
    const R = G.renderer, cam = G.camera, W = 320, H = Math.max(1, Math.round((W * window.innerHeight) / window.innerWidth));
    const rt = (window.__IDRT__ ??= new THREE.WebGLRenderTarget(W, H));
    if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
    const mat = (window.__IDMAT__ ??= new THREE.ShaderMaterial({
      uniforms: { uS: { value: new THREE.Vector4() }, uCam: { value: new THREE.Vector3() } },
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
      fragmentShader: `uniform vec4 uS; uniform vec3 uCam; varying vec3 vW;
        void main() {
          float d = distance(vW, uCam), up = step(uCam.y - 1.2, vW.y);
          gl_FragColor = vec4(uS.w > 0.0 && distance(vW, uS.xyz) < uS.w ? 1.0 : 0.0, d < 2.5 ? up : 0.0, d < 4.0 ? up : 0.0, 1.0);
        }`,
      side: THREE.DoubleSide,
    }));
    const world = G.scene.getObjectByName('world'), hidden = [];
    // (the ground, the water and the far rings are the stage, not the subject or an occluder)
    for (const c of world.children) if (/^(ground|water|horizon|skyline|grass)$/.test(c.name) && c.visible) (hidden.push(c), (c.visible = false));
    // (only the world: the sky dome round the lens, anything carried with the camera, stay out)
    const sky = [];
    for (const o of G.scene.children) if (o !== world && o.visible) (sky.push(o), (o.visible = false));
    if (subj) mat.uniforms.uS.value.set(subj.x, subj.y, subj.z, subj.r); else mat.uniforms.uS.value.set(0, 0, 0, 0);
    cam.getWorldPosition(mat.uniforms.uCam.value);
    const bg = G.scene.background, fog = G.scene.fog, prevRT = R.getRenderTarget(), prevClear = R.getClearColor(new THREE.Color()), prevAlpha = R.getClearAlpha();
    G.scene.background = null; G.scene.fog = null; G.scene.overrideMaterial = mat;
    R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(); R.render(G.scene, cam);
    const px = new Uint8Array(W * H * 4);
    R.readRenderTargetPixels(rt, 0, 0, W, H, px);
    G.scene.overrideMaterial = null; G.scene.background = bg; G.scene.fog = fog; R.setRenderTarget(prevRT); R.setClearColor(prevClear, prevAlpha);
    for (const o of [...hidden, ...sky]) o.visible = true;
    let sub = 0, n25 = 0, n4 = 0;
    for (let i = 0; i < px.length; i += 4) { if (px[i] > 127) sub++; if (px[i + 1] > 127) n25++; if (px[i + 2] > 127) n4++; }
    const N = W * H;
    return { subject: +(sub / N).toFixed(3), near25: +(n25 / N).toFixed(3), near4: +(n4 / N).toFixed(3) };
  };
  const F = poses.map((p, k) => ({ label: p.label ?? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, fn: async () => {
    G.setHour(p.hour ?? 14); G.timeParams.speed = 0; G.postParams.sketch = true;
    // (a fair day unless the pose asks for weather: the automatic weather drifts between frames)
    Object.assign(G.weatherParams, { autoWeather: false, cloud: 0.3, seaFog: 0, haze: 0.35, wind: 0.5 }, p.weather ?? {});
    const [x, z] = fromLatLon(origin, p.lat, p.lon);
    G.walkParams.fly = false;
    G.walker.place(x, z, 0, 0);
    await wait(400); await idle(p.wait ?? 160);
    const rec = { k, x: Math.round(x), z: Math.round(z) };
    if (p.car) {
      // the car on the steepest grade within 160 m, seen square from its kerb side
      let best = null, bg = 0;
      for (let t = 0; t < 30; t++) {
        await wait(400);
        for (const c of cars()) {
          if (Math.hypot(c.x - x, c.z - z) > 160) continue;
          const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
          const gr = Math.abs(g(c.x + fx * 3, c.z + fz * 3) - g(c.x - fx * 3, c.z - fz * 3)) / 6;
          if (gr > bg) (bg = gr), (best = c);
        }
        if (bg > (p.minGrade ?? 0.08)) break;
      }
      if (best) {
        const rx = Math.cos(best.yaw), rz = -Math.sin(best.yaw), d = p.dist ?? 7.5;
        const cx = best.x + rx * d, cz = best.z + rz * d, eye = g(cx, cz) + (p.eye ?? 1.5);
        G.walkParams.fly = true;
        G.walker.place(cx, cz, Math.atan2(cx - best.x, cz - best.z), -Math.atan2(eye - (best.y + 0.7), d));
        G.walker.y = eye;
        rec.car = { grade: +bg.toFixed(3), x: Math.round(best.x), z: Math.round(best.z) };
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
    // ---- the harness's own asserts (the reviewer's MF5): nothing at the lens, not inside a
    // building or up on a roof, and the pose's subject (if it names one) filling ≥ 5% of the frame
    await wait(60);
    const cam = G.camera, THREE = G.THREE, world = G.scene.getObjectByName('world');
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const ray = new THREE.Raycaster(cam.position.clone(), fwd, 0.1, 2.5);
    const kids = world.children.filter((c) => c.name !== 'ground' && c.name !== 'water' && c.name !== 'horizon' && c.name !== 'skyline' && c.visible !== false);
    // (an instanced crowd's hidden slots are zero-scaled: their hits come back at NaN metres)
    const hit = ray.intersectObjects(kids, true).find((h) => { if (!(h.distance <= 2.5)) return false; let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; });
    if (hit) rec.occluded = `${hit.object.name || hit.object.parent?.name || hit.object.type} at ${hit.distance.toFixed(1)} m`;
    const wx = G.walker.x, wz = G.walker.z, gy = g(wx, wz);
    if (!G.walkParams.fly) {
      if (G.walk.buildingAt(wx, wz) >= 0) rec.inside = true;
      const feet = (G.walker.y ?? gy) - (G.walker.eye ?? 1.7);
      if (feet - gy > 2.2) rec.onRoof = +(feet - gy).toFixed(1);
    }
    if (p.subject) {
      const [sx, sz] = fromLatLon(origin, p.subject.lat, p.subject.lon);
      const sy = g(sx, sz) + (p.subject.h ?? 2), r = p.subject.r ?? 3;
      const v = new THREE.Vector3(sx, sy, sz).applyMatrix4(world.matrixWorld);
      rec.sphere = { x: v.x, y: v.y, z: v.z, r };
      const d = v.distanceTo(cam.position), toS = v.clone().sub(cam.position).normalize();
      const H = window.innerHeight, W = window.innerWidth, f = H / 2 / Math.tan((cam.fov * Math.PI) / 360);
      const rpx = (r / Math.max(d, 0.1)) * f;
      rec.fill = toS.dot(fwd) > 0 ? +Math.min(1, (Math.PI * rpx * rpx) / (W * H)).toFixed(3) : 0;
      if (rec.fill < 0.05) rec.lowFill = true;
    }
    info.push(rec);
  }, after: async function () {
    const rec = info[info.length - 1];
    if (!rec || rec.k !== k) return;
    const seen = idPass(rec.sphere);
    rec.seen = seen;
    if (rec.sphere) { rec.fill = seen.subject; rec.lowFill = seen.subject < 0.05; }
    if (seen.near25 > 0.05) rec.near = `${Math.round(seen.near25 * 100)}% within 2.5 m`;
    else if (seen.near4 > 0.15) rec.near = `${Math.round(seen.near4 * 100)}% within 4 m`;
    const why = [rec.occluded && 'lens blocked', rec.inside && 'inside', rec.onRoof && 'on a roof', rec.lowFill && `subject ${Math.round((rec.fill ?? 0) * 100)}%`, rec.near].filter(Boolean);
    if (why.length) this.label = `${this.label}  ✗ ${why.join(' · ')}`;
    delete rec.sphere;
  } }));
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 10, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 40, timers: true, cw: opts.cw ?? 640, cols: opts.cols ?? 3, save: `spots-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  // every pose that failed an assert, by number — zero is the bar
  const fails = info.filter((r) => r.occluded || r.inside || r.onRoof || r.lowFill || r.near).map((r) => ({ k: r.k, occluded: r.occluded, inside: r.inside, onRoof: r.onRoof, fill: r.fill, near: r.near }));
  return { res, info, fails };
};
