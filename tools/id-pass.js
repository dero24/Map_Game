// The id pass: what the lens actually sees, drawn flat (spot-shots' asserts, reviewer rounds 8b–10),
// for any in-page tool on a `?capture=1` page:
//   const { idPass } = await import('/tools/id-pass.js');
//   idPass(window.__GAME__) → { near25, near4, world, subject }
// The world is drawn once through one flat material with depth, so only what's actually visible
// counts: green where a fragment stands within 2.5 m of the lens above knee height, blue within 4 m,
// alpha where anything is there at all (the sky is what's left). With a subject (a sphere and/or a
// name the mesh or a parent carries), a second pass draws only the subject against the first pass's
// depth: its visible share of the frame.
//   near25 ≤ 0.05 and near4 ≤ 0.15: nothing at the lens (the round-10 night street had a slab
//   filling its lower right that a ray grid let through); world ≥ 0.2: the pose isn't facing the sky.

/** Draw the world (only the world: the sky dome, the brush's sketch, anything carried with the camera
 *  stay out; grass blades at your feet aren't in the way) through `mat` into a W×H target, read it
 *  back, and put everything as it was. `then(R, rt)` may draw more into the same target before the
 *  read (it keeps the first pass's depth). Returns the RGBA bytes, row 0 at the bottom. */
export function flatPass(G, mat, W, H, then = null) {
  const THREE = G.THREE, R = G.renderer, cam = G.camera;
  const key = `${W}x${H}`;
  const rts = (window.__IDRTS__ ??= new Map());
  let rt = rts.get(key);
  if (!rt) rts.set(key, (rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true })));
  const world = G.scene.getObjectByName('world'), off = [];
  const hide = (o) => { if (o.visible) (off.push(o), (o.visible = false)); };
  for (const o of G.scene.children) if (o !== world) hide(o);
  for (const c of world.children) if (c.name === 'grass') hide(c);
  const bg = G.scene.background, fog = G.scene.fog, prevRT = R.getRenderTarget(), prevClear = R.getClearColor(new THREE.Color()), prevAlpha = R.getClearAlpha(), prevAuto = R.autoClear;
  const px = new Uint8Array(W * H * 4);
  try {
    G.scene.background = null; G.scene.fog = null; G.scene.overrideMaterial = mat;
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear();
    R.render(G.scene, cam);
    G.scene.overrideMaterial = null;
    if (then) { R.autoClear = false; then(R, rt, world, hide); }
    R.readRenderTargetPixels(rt, 0, 0, W, H, px);
  } finally {
    R.autoClear = prevAuto;
    G.scene.overrideMaterial = null; G.scene.background = bg; G.scene.fog = fog; R.setRenderTarget(prevRT); R.setClearColor(prevClear, prevAlpha);
    for (const o of off) o.visible = true;
  }
  return px;
}

const STAGE = /^(ground|water|horizon|skyline|grass)$/;
let idMat = null;
/** The lens check. subj: { sphere: { x, y, z, r } (render space), name: 'regexp source' } or null.
 *  W: the pass's width (its height follows the window's aspect). */
export function idPass(G, subj = null, W = 320) {
  const THREE = G.THREE, cam = G.camera, Hh = Math.max(1, Math.round((W * window.innerHeight) / window.innerWidth));
  idMat ??= new THREE.ShaderMaterial({
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
  });
  const mat = idMat;
  if (subj?.sphere) mat.uniforms.uS.value.set(subj.sphere.x, subj.sphere.y, subj.sphere.z, subj.sphere.r); else mat.uniforms.uS.value.set(0, 0, 0, 0);
  cam.getWorldPosition(mat.uniforms.uCam.value);
  mat.uniforms.uPass.value = 0;
  let px2 = null;
  const px1 = flatPass(G, mat, W, Hh, subj ? (R, rt, world, hide) => {
    // pass 1's picture, read before pass 2 clears its colour
    const first = new Uint8Array(W * Hh * 4);
    R.readRenderTargetPixels(rt, 0, 0, W, Hh, first);
    px2 = first;
    // pass 2: the subject alone (its meshes, and whatever holds them), depth kept from pass 1
    const re = subj.name ? new RegExp(subj.name) : null, named = (o) => { for (let p = o; p && p !== world; p = p.parent) if (re.test(p.name)) return true; return false; };
    const shown = new Set();
    world.traverse((o) => {
      if (o === world || !(o.isMesh || o.isPoints || o.isLine) || !o.visible) return;
      let top = o; while (top.parent && top.parent !== world) top = top.parent;
      if (re ? named(o) : !STAGE.test(top.name)) for (let p = o; p && p !== world; p = p.parent) shown.add(p);
    });
    world.traverse((o) => { if (o !== world && !shown.has(o)) hide(o); });
    R.setClearColor(0x000000, 0);
    R.clearColor();
    G.scene.overrideMaterial = mat;
    mat.uniforms.uPass.value = 1;
    R.render(G.scene, G.camera);
    G.scene.overrideMaterial = null;
  } : null);
  // (with a subject the read-back is pass 2's; pass 1's was kept before it)
  const first = px2 ?? px1, sec = px2 ? px1 : null;
  let n25 = 0, n4 = 0, there = 0, sub = 0;
  for (let i = 0; i < first.length; i += 4) { if (first[i + 1] > 127) n25++; if (first[i + 2] > 127) n4++; if (first[i + 3] > 127) there++; }
  if (sec) for (let i = 0; i < sec.length; i += 4) if (sec[i] > 127) sub++;
  const N = W * Hh;
  return { subject: +(sub / N).toFixed(3), near25: +(n25 / N).toFixed(3), near4: +(n4 / N).toFixed(3), world: +(there / N).toFixed(3), span: +nearSpan(first, W, Hh).toFixed(3) };
}

/** The tallest thing at the lens: of the connected pieces within 2.5 m (the id pass's green), the
 *  most rows of the frame one crosses, as a share of its height. A pole 2 m off splits a frame in
 *  two at a few % of its pixels — under the area rule, over this one (review round 12, m5). `px`:
 *  the pass's RGBA bytes (any row order), W × H. */
export function nearSpan(px, W, H) {
  const lab = new Int32Array(W * H).fill(-1), stack = [];
  let best = 0;
  for (let s = 0; s < W * H; s++) {
    if (lab[s] >= 0 || px[s * 4 + 1] <= 127) continue;
    let y0 = H, y1 = -1;
    lab[s] = s;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
        if (j >= 0 && lab[j] < 0 && px[j * 4 + 1] > 127) { lab[j] = s; stack.push(j); }
    }
    best = Math.max(best, (y1 - y0 + 1) / H);
  }
  return best;
}

/** What a frame's id pass says is wrong with it ([] when it passes): something at the lens — over
 *  5% of the frame within 2.5 m or 15% within 4 m, or a thin thing within 2.5 m crossing 60% of
 *  its height (`span`: a pole that splits the frame) — or a pose that sees almost no world; with
 *  `subject` set, a subject under that share of the frame (a walker pose with no walker in it). */
export function lensVerdict(seen, { near25 = 0.05, near4 = 0.15, world = 0.2, span = 0.6, subject = 0 } = {}) {
  const why = [];
  if (seen.near25 > near25) why.push(`${Math.round(seen.near25 * 100)}% within 2.5 m`);
  else if (seen.near4 > near4) why.push(`${Math.round(seen.near4 * 100)}% within 4 m`);
  if ((seen.span ?? 0) >= span) why.push(`a thin thing within 2.5 m across ${Math.round(seen.span * 100)}% of the frame's height`);
  if (seen.world < world) why.push(`the world ${Math.round(seen.world * 100)}% of the frame`);
  if (subject > 0 && seen.subject < subject) why.push(`the subject ${+(seen.subject * 100).toFixed(1)}% of the frame (under ${+(subject * 100).toFixed(1)}%)`);
  return why;
}
