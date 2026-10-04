// The class pass (tools/real-compare.mjs): what share of the frame is sky, buildings, vegetation,
// ground, water, vehicles and everything else — the classes Mapillary's segmentation gives a street
// photo, so a game frame and the photo from the same spot can be compared class by class.
// On a `?capture=1` page:  const { classPass } = await import('/tools/class-pass.js'); classPass(window.__GAME__)
// → { sky, building, vegetation, ground, water, vehicle, other } (shares of the frame, summing to 1),
// and with `mask: true` the pass's own pixels (row 0 at the bottom) to look at.
export const CLASSES = ['sky', 'building', 'vegetation', 'ground', 'water', 'vehicle', 'other'];
const COLOUR = { building: [255, 0, 0], vegetation: [0, 255, 0], ground: [0, 0, 255], water: [0, 255, 255], vehicle: [255, 255, 0], other: [255, 0, 255] };

/** A mesh's class from its name and its parents' (the scene's family:type naming), else its geometry. */
export function classOf(o, chain) {
  const n = chain.join('/').toLowerCase();
  if (/(^|\/)(trees|garden|plant|leaf|near-?trees|leafcards|hedge)/.test(n)) return 'vegetation';
  if (/(parked-cars|kerb-cars|life-car|ride-car|life-boat|ride-boat|ride-plane|moored-boats|balloon)/.test(n)) return 'vehicle';
  if (/(^|\/)(water|wakes|lake|shore|sea)/.test(n)) return 'water';
  if (/(^|\/)(ground|grass|road|terrain|beach|sidewalk|kerb(?!-cars)|lot)/.test(n)) return 'ground';
  if (o.geometry?.attributes?.aWall || /(building|roof|structures|bridge|skyline|far-skyline|tower)/.test(n)) return 'building';
  return 'other';
}

/** Draw the world once with each mesh in its class's flat colour (what the lens actually sees: depth
 *  decides), read it back, and count. W: the pass's width (its height follows the window's aspect). */
export function classPass(G, { W = 256, mask = false } = {}) {
  const THREE = G.THREE, R = G.renderer, cam = G.camera;
  const H = Math.max(1, Math.round((W * window.innerHeight) / window.innerWidth));
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const world = G.scene.getObjectByName('world');
  // (flat colours, not tone-mapped; an instanced mesh's own instance colours are set aside for the pass —
  // they'd tint the class colour: a dark tree read as no class at all)
  const mats = new Map(Object.entries(COLOUR).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), side: THREE.DoubleSide, toneMapped: false })]));
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0, 1), toneMapped: false });
  const tints = [];
  const swapped = [], off = [];
  for (const o of G.scene.children) if (o !== world && o.visible) (off.push(o), (o.visible = false));
  world.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints) || !o.visible) return;
    const chain = [];
    for (let p = o; p && p !== world; p = p.parent) chain.unshift(p.name || '');
    swapped.push([o, o.material]);
    o.material = o.isLine || o.isPoints ? lineMat : mats.get(classOf(o, chain));
    if (o.isInstancedMesh && o.instanceColor) { tints.push([o, o.instanceColor]); o.instanceColor = null; }
  });
  const px = new Uint8Array(W * H * 4);
  const bg = G.scene.background, fog = G.scene.fog, prevRT = R.getRenderTarget(), prevClear = R.getClearColor(new THREE.Color()), prevAlpha = R.getClearAlpha();
  try {
    G.scene.background = null; G.scene.fog = null;
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear();
    R.render(G.scene, cam);
    R.readRenderTargetPixels(rt, 0, 0, W, H, px);
  } finally {
    G.scene.background = bg; G.scene.fog = fog; R.setRenderTarget(prevRT); R.setClearColor(prevClear, prevAlpha);
    for (const [o, m] of swapped) o.material = m;
    for (const [o, c] of tints) o.instanceColor = c;
    for (const o of off) o.visible = true;
    rt.dispose(); for (const m of mats.values()) m.dispose(); lineMat.dispose();
  }
  const count = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const near = (r, g, b, c) => Math.abs(r - c[0]) < 60 && Math.abs(g - c[1]) < 60 && Math.abs(b - c[2]) < 60;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) { count.sky++; continue; }
    const r = px[i], g = px[i + 1], b = px[i + 2];
    let k = 'other';
    for (const [name, c] of Object.entries(COLOUR)) if (near(r, g, b, c)) { k = name; break; }
    count[k]++;
  }
  const n = W * H;
  const share = Object.fromEntries(CLASSES.map((c) => [c, Math.round((count[c] / n) * 1000) / 1000]));
  return mask ? { ...share, W, H, px } : share;
}
