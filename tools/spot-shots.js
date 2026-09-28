// Spot studio: look at real places by latitude/longitude — a street on a hill from the kerb, a
// market from above, a car on a slope from its side. The reviewer's "does it look right HERE?"
// harness for any town (poses are data, passed in; nothing about a place is written here).
//
//   on a game page (?at=…&capture=1):  await import('/tools/spot-shots.js');
//   await __SPOTS__('tag', [{ lat, lon, bearing: 180, pitch: -4, eye: 1.7, label: '…' },
//                            { lat, lon, car: true, label: 'a car on the grade' }, …])
//
// bearing: compass degrees the camera faces (0 north, 90 east). eye: metres above the ground
// (over ~2.2 m the walker flies). street: stand on the sidewalk of the nearest real street,
// looking along it (the way nearest the bearing). car: frame the steepest-driving car near the
// spot from its side.
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
  const F = poses.map((p, k) => ({ label: p.label ?? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, fn: async () => {
    G.setHour(p.hour ?? 14); G.timeParams.speed = 0; G.postParams.sketch = true;
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
    info.push(rec);
  } }));
  await window.__MONTAGE__([{ label: 'warm-up', fn: () => {} }], { settle: 10, timers: true, cw: 200, cols: 1 });
  window.__MONTAGE_CLOSE__?.();
  const res = await window.__MONTAGE__(F, { settle: opts.settle ?? 40, timers: true, cw: opts.cw ?? 640, cols: opts.cols ?? 3, save: `spots-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  return { res, info };
};
