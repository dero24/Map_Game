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
  add(treeLib('aspen', 0).clone(), propMaterial({ wind: true, foliage: true, crown, decid: true, fallHue: 2, flutter: true }));
  add(treeLib('liveoak', 0).clone(), propMaterial({ wind: true, foliage: true, crown }));
  add(treeLib('liveoak', 0).clone(), propMaterial({ wind: true, foliage: true, crown, treeLod: 'far' }));
  for (const t of ['spanish', 'resfern', 'ballmoss', 'lace']) add(hangerLib(t, t === 'lace' ? 'coastoak' : 'liveoak', 0, 1).clone(), propMaterial({ wind: true, hang: true }));
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
