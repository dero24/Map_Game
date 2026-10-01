// Fly-in capture: approach a point from `from` metres out at `alt`, at a flying speed, and
// shoot the view every `step` metres — what a city looks like as you fly into it while its
// tiles stream (the skyline impostors hand off to the detail tiles; nothing may vanish).
//
//   on a game page (?at=…&capture=1):  await import('/tools/fly-shots.js');
//   await __FLY__('tag', { tx, tz, from: 1500, alt: 150, step: 180, speed: 60 })
//
// Saves shots/fly-<tag>.jpg; returns per-frame stream counts (real / synth tiles, visible
// skyline cells, tall meshes drawn).
await import('/tools/inpage-montage.js');

window.__FLY__ = async (tag = 'fly', o = {}) => {
  const G = window.__GAME__;
  window.__PUMP__();
  const wait = window.__WAIT__;
  const tx = o.tx ?? G.walker.x, tz = o.tz ?? G.walker.z, from = o.from ?? 1500, alt = o.alt ?? 150, step = o.step ?? 180, speed = o.speed ?? 60;
  const dir = o.dir ?? Math.PI; // approach from the west (bearing of the start from the target, radians from +z)
  const sx = tx + Math.sin(dir) * from, sz = tz + Math.cos(dir) * from;
  G.setHour(14); G.timeParams.speed = 0;
  G.walkParams.fly = true;
  const yaw = Math.atan2(sx - tx, sz - tz);
  const stats = [];
  const pose = (d) => {
    const x = tx + Math.sin(dir) * d, z = tz + Math.cos(dir) * d;
    G.walker.place(x, z, yaw, -0.12);
    G.walker.y = G.world.terrain.heightAt(x, z) + alt;
    return [x, z];
  };
  const count = () => {
    let real = 0, synth = 0, tall = 0;
    for (const a of G.stream.loaded.values()) (a.spec.synth ? synth++ : real++);
    const sky = G.scene.getObjectByName('skyline');
    const skyVis = sky ? sky.children.filter((c) => c.visible).length : 0;
    G.scene.traverseVisible((m) => { if (m.isMesh && !m.isInstancedMesh && m.geometry?.boundingBox && m.geometry.boundingBox.max.y > 60) tall++; });
    return { real, synth, skyVis, tall };
  };
  const F = [];
  for (let d = from; d >= Math.max(150, step); d -= step) {
    F.push({ label: `${Math.round(d)} m out`, fn: async () => {
      // fly the leg at speed (the stream updates as it would in play)
      const d0 = d + step, t0 = performance.now();
      if (d < from) {
        for (let k = 1; k <= 10; k++) { pose(d0 - (step * k) / 10); await wait((step / speed) * 100); }
      } else pose(d);
      const c = count();
      stats.push({ d: Math.round(d), ...c, t: Math.round(performance.now() - t0) });
    } });
  }
  const res = await window.__MONTAGE__(F, { settle: 12, timers: true, cw: 480, cols: 4, save: `fly-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  return { res, stats };
};
