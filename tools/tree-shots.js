// Tree studio: every species × grown variant from the foundry, side by side at eye level on a
// plain lawn — a quick look at silhouettes (what the kit viewer shows, framed for a review).
//
//   on any dev page:  await import('/tools/tree-shots.js'); await __TREES__('tag', ['willow', …])
//
// Saves shots/trees-<tag>.jpg through the dev server's /__shot sink.
window.__TREES__ = async (tag = 'all', kinds = null) => {
  const THREE = await import('three');
  const { TREE_KINDS, TREE_VARIANTS, treeLib, treeMeta } = await import('/src/assets/flora.ts');
  const list = kinds ?? TREE_KINDS;
  const W = 1800, H = 900;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ea);
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x8a7a5a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
  sun.position.set(-30, 60, 40);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x9aae6a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const greens = [0x4d6a31, 0x5b7536, 0x6a823e];
  let x = 0;
  const gap = 7;
  for (const k of list) {
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const g = treeLib(k, v).clone();
      const c = g.getAttribute('color');
      const green = new THREE.Color(greens[v % greens.length]);
      for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.98 && c.getY(i) > 0.98 && c.getZ(i) > 0.98) c.setXYZ(i, green.r, green.g, green.b);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.position.set(x + v * gap, 0, 0);
      scene.add(m);
    }
    x += TREE_VARIANTS * gap + 4;
  }
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 1000);
  const mid = (x - 4 - gap) / 2;
  const dist = Math.max(26, x * 0.8); // (the row's width across the frame, at eye level)
  cam.position.set(mid, 5, dist);
  cam.lookAt(mid, 4.8, 0);
  renderer.render(scene, cam);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const res = await fetch(`/__shot?name=${encodeURIComponent(`trees-${tag}.jpg`)}`, { method: 'POST', body: blob });
  renderer.dispose();
  return res.ok ? `shots/trees-${tag}.jpg (${list.join(', ')})` : 'sink refused ' + res.status;
};

// In the world: the nearest of each species round the walker, framed at eye level from the
// open side (a montage, shots/species-<tag>.jpg), and how many of each stand within 600 m.
//   on a game page (?capture=1):  await import('/tools/tree-shots.js'); await __SPECIES__('tag')
window.__SPECIES__ = async (tag = 'here', kinds = ['maple', 'willow', 'elm', 'poplar', 'magnolia', 'cherry', 'round', 'oak']) => {
  await import('/tools/inpage-montage.js');
  const G = window.__GAME__;
  window.__PUMP__();
  const g = (x, z) => G.world.terrain.heightAt(x, z);
  const x0 = G.walker.x, z0 = G.walker.z;
  const counts = {};
  const all = G.ctx.instances('trees:', x0, z0, 600);
  for (const t of all) { const k = t.name.split(':')[1]; counts[k] = (counts[k] ?? 0) + 1; }
  const F = kinds.map((k) => ({ label: k, fn: async () => {
    G.setHour(15); G.timeParams.speed = 0;
    const near = all.filter((t) => t.name.split(':')[1] === k).sort((a, b) => Math.hypot(a.x - x0, a.z - z0) - Math.hypot(b.x - x0, b.z - z0))[0];
    if (!near) return;
    const h = (near.sy ?? 1) * 8;
    let cx = 0, cz = 0;
    for (let a = 0; a < 6.28; a += 0.5) {
      cx = near.x + Math.sin(a) * (h * 1.6 + 4); cz = near.z + Math.cos(a) * (h * 1.6 + 4);
      if (!G.walk.blocked(cx, cz, 0.5) && G.walk.buildingAt(cx, cz) < 0) break;
    }
    G.walkParams.fly = false;
    G.walker.place(cx, cz, Math.atan2(cx - near.x, cz - near.z), -Math.atan2(1.6 - h * 0.45, Math.hypot(cx - near.x, cz - near.z)));
  } }));
  const res = await window.__MONTAGE__(F, { settle: 30, timers: true, cw: 600, cols: 4, save: `species-${tag}.jpg` });
  window.__MONTAGE_CLOSE__?.();
  G.walker.place(x0, z0, G.walker.yaw, 0);
  return { res, counts };
};
