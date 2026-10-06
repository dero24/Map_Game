// Shader compile check: every propMaterial variant the foundry's trees and hangers use, and the near
// trees' leaf cards, built and drawn once — a GLSL error shows in the console (three.js logs it) and
// in the returned list. On any dev page:  await import('/tools/shader-check.js'); await __SHADERS__()
window.__SHADERS__ = async () => {
  const THREE = await import('three');
  const { propMaterial } = await import('/src/render/propMaterial.ts');
  const { leafCardGeometry, leafCardMaterial, leafTexture } = await import('/src/render/leafCards.ts');
  const { hangerLib } = await import('/src/assets/hangers.ts');
  const { treeLib } = await import('/src/assets/flora.ts');
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const renderer = new THREE.WebGLRenderer({ canvas });
  const errors = [];
  const orig = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 600)); orig(...a); };
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 4, 20); cam.lookAt(0, 4, 0);
  const add = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, 1); im.setMatrixAt(0, new THREE.Matrix4()); im.setColorAt(0, new THREE.Color(0.5, 0.6, 0.4)); scene.add(im); };
  const crown = [4, 3];
  add(treeLib('aspen', 0).clone(), propMaterial({ wind: true, foliage: true, crown, decid: true, fallHue: 2, motion: 1 }));
  // (package #4: every fall hue, every blossom, every motion — and their mixes as the trees wear them)
  const k4 = [
    ['dogwood', { decid: true, fallHue: 1, blossom: 2, motion: 2 }], ['redbud', { decid: true, fallHue: 2, blossom: 3 }], ['crapemyrtle', { decid: true, fallHue: 0, blossom: 4 }],
    ['sweetgum', { decid: true, fallHue: 4 }], ['buckeye', { decid: true, fallHue: 5 }], ['buroak', { decid: true, fallHue: 6 }], ['redcedar', { fallHue: 7 }],
    ['rosebay', { fallHue: 7, blossom: 5 }], ['longleaf', { motion: 3 }], ['cherry', { decid: true, fallHue: 1, blossom: 1 }],
    // (package #6: the manzanita's winter urns, the valley oak's russet)
    ['manzanita', { blossom: 6 }], ['valleyoak', { decid: true, fallHue: 6 }],
    // (package #7: the desert's flowers and fruit as parts of their own; the ocotillo's leaves after rain;
    // the cacti stiff in the wind)
    ['saguaro', { blossom: 7, wind: false }], ['ocotillo', { decid: true, fallHue: 8, blossom: 8 }], ['pricklypear', { blossom: 9, wind: false }], ['joshua', { blossom: 10, wind: false }],
    // (package #8: the palms' fronds thrown about in a gust)
    ['sabal', { motion: 4 }],
  ];
  for (const [k, o] of k4) add(treeLib(k, k === 'longleaf' ? 0 : 1).clone(), propMaterial({ wind: true, foliage: true, crown, ...o }));
  add(treeLib('liveoak', 0).clone(), propMaterial({ wind: true, foliage: true, crown }));
  add(treeLib('liveoak', 0).clone(), propMaterial({ wind: true, foliage: true, crown, treeLod: 'far' }));
  for (const t of ['spanish', 'resfern', 'ballmoss', 'lace']) add(hangerLib(t, t === 'lace' ? 'coastoak' : 'liveoak', 0, 1).clone(), propMaterial({ wind: true, hang: true }));
  // the grass (the summer-dry hills' hay: grass.ts)
  try {
    const { grassMaterial } = await import('/src/world/grass.ts');
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0.5, 0, 0.2, 0, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 0, 0, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    add(g, grassMaterial());
    // (package #10: the crops, grown and ripened by the calendar)
    const { cropMaterial } = await import('/src/world/grass.ts');
    const cg = g.clone();
    cg.setAttribute('aCrop', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    cg.setAttribute('aField', new THREE.InstancedBufferAttribute(new Float32Array([0.5]), 1));
    add(cg, cropMaterial());
  } catch (e) { errors.push('grass: ' + e.message); }
  // the critters (fauna.ts): a perched bird's closed wings, the hawk soaring, a butterfly, a fox
  try {
    const { critterLib, critterMaterial } = await import('/src/assets/fauna.ts');
    for (const k of ['cardinal', 'hawk', 'butterfly', 'fox', 'greatblueheron', 'turkeyvulture', 'elk', 'monarch', 'greendarner']) {
      const cg = critterLib(k).clone();
      cg.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array([0.3, 0.5, k === 'hawk' ? 2 : 0]), 3));
      add(cg, critterMaterial(k));
    }
  } catch (e) { errors.push('critters: ' + e.message); }
  // the water: the sea, a lake's sheet (the South's duckweed on still water), the coast's foam
  try {
    const { buildWater, lakeMaterial, shoreMaterial, waterParams } = await import('/src/world/water.ts');
    const tex = () => { const t = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
    const tt = { uTerrS: { value: tex() }, uTerrB: { value: tex() }, uTerrSBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uTerrBBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
    scene.add(buildWater(tt));
    waterParams.uDuckweed.value = 0.85;
    const sheet = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2);
    sheet.setAttribute('aStill', new THREE.Float32BufferAttribute(new Float32Array(sheet.attributes.position.count).fill(1), 1));
    scene.add(new THREE.Mesh(sheet, lakeMaterial()));
    const strip = new THREE.PlaneGeometry(4, 1).rotateX(-Math.PI / 2);
    strip.setAttribute('aShore', new THREE.Float32BufferAttribute(new Float32Array(strip.attributes.position.count).fill(2), 1));
    scene.add(new THREE.Mesh(strip, shoreMaterial()));
  } catch (e) { errors.push('water: ' + e.message); }
  const far = scene.children.find((o) => o.material?.defines?.TREE_LOD);
  if (far) far.geometry.setAttribute('aNear', new THREE.InstancedBufferAttribute(new Float32Array(1), 1));
  try {
    const cards = leafCardGeometry(4);
    cards.instanceCount = 1; // (draw one, so its program compiles)
    const mat = leafCardMaterial(leafTexture ? leafTexture(new Uint8Array(4 * 4 * 4), 4, 4) : null);
    const cm = new THREE.Mesh(cards, mat);
    cm.frustumCulled = false;
    scene.add(cm);
  } catch (e) { errors.push('leaf cards: ' + e.message); }
  renderer.render(scene, cam);
  console.error = orig;
  const gl = renderer.getContext();
  const programs = renderer.info.programs?.length ?? 0;
  renderer.dispose();
  return { programs, errors, glError: gl.getError() };
};
