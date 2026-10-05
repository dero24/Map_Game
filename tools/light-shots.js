// Light shots: a look at real places by latitude/longitude without spot-shots' id passes and
// re-posing — for a software-GL session (a cloud box's SwiftShader renders a frame in seconds, and
// spot-shots' asserts take it tens of minutes). Waits for the stream to settle (bounded), stands the
// walker at each pose (the nearest open ground if it's inside a building), settles a few frames and
// saves the sheet through the dev server's /__shot sink. Read the montage like any other.
//
//   on a game page (?at=…&capture=1):  await import('/tools/light-shots.js');
//   await __LIGHT__('tag', [{ lat, lon, bearing: 90, pitch: 2, eye: 1.7, label: '…' }, …], { settle: 16, idle: 180 })
//   → shots/light-<tag>.jpg
await import('/tools/inpage-montage.js');

window.__LIGHT__ = async (tag = 'light', poses = [], opts = {}) => {
  const G = window.__GAME__;
  const { fromLatLon } = await import('/src/world/data.ts');
  const origin = G.world.json.origin;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const busy = () => (typeof G.stream.busy === 'function' ? G.stream.busy() : G.stream.busy);
  // the stream settles round the walker first (every pose's ground streamed in as the walker reaches it)
  const settleStream = async (s) => { for (let i = 0; i < s && busy(); i++) await wait(1000); };
  await settleStream(opts.idle ?? 180);
  const items = poses.map((p) => ({
    label: p.label ?? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
    fn: async () => {
      const [x, z] = fromLatLon(origin, p.lat, p.lon), b = ((p.bearing ?? 0) * Math.PI) / 180, eye = p.eye ?? 1.7;
      let px = x, pz = z;
      if (eye <= 2.2 && (G.walk.buildingAt(px, pz) >= 0 || G.walk.blocked(px, pz, 0.5))) [px, pz] = G.walk.nearestWalkable(px, pz);
      G.walkParams.fly = eye > 2.2;
      G.walker.place(px, pz, -b, ((p.pitch ?? 0) * Math.PI) / 180);
      if (G.walkParams.fly) G.walker.y = G.world.terrain.heightAt(px, pz) + eye;
      if (p.hour !== undefined) G.setHour?.(p.hour);
      await settleStream(opts.poseIdle ?? 60);
    },
  }));
  return await window.__MONTAGE__(items, { settle: opts.settle ?? 16, cols: opts.cols ?? Math.min(3, items.length), cw: opts.cw ?? 800, save: `light-${tag}.jpg` });
};
