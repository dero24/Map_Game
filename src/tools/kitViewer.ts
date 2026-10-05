// The asset foundry's workbench (kit.html): every family on a grid in the game's own painted
// materials — vehicles (with gear), rocks, trees (every species × grown variant), garden plants
// (growth slider), wildlife (animated), street + beach furniture, and trees up close: every species'
// far model handing over to its near model (world/nearTrees.ts, the game's own layer) as you orbit
// in and out. Seeds reroll, and a .glb export
// of whatever is shown (recipes are the source of truth; GLB is a byproduct for sharing/Blender).
// `window.__KIT__` exposes the scene for montage shots.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { BOAT_TYPES, CAR_TYPES, PLANE_TYPES, boatGeometry, boatRecipe, carGeometry, carRecipe, planeGeometry, planeRecipe, rockGeometry, type RockType } from '../assets/kit';
import { TREE_KINDS, TREE_VARIANTS, treeLib, treeMeta, crownField, DECIDUOUS, fallHueOf, BLOSSOM_OF, MOTION_OF, PLANT_SPECIES, plantGeometry, SPECIES } from '../assets/flora';
import { NearTrees, nearKinds } from '../world/nearTrees';
import { CRITTERS, CRITTER_TINT, ROLE, critterLib, critterMaterial, dogLib, dogMaterial, DOG_COLLAR } from '../assets/fauna';
import { personLib, personLiteLib, leadHand, atWorld } from '../assets/people';
import { creatureMaterial } from '../render/creature';
import { MAILBOXES, mailboxLib, beachLib, CAR_GEAR, gearGeometry } from '../assets/furniture';
import { MICRO_KINDS } from '../assets/micro';
import { MicroLayer } from '../world/microLayer';
import { MICRO_TIERS, TREE_TIERS } from '../render/quality';
import { merge } from '../assets/core';
import { propMaterial } from '../render/propMaterial';
import { U } from '../render/shared';
import { WatercolorPost, postParams } from '../render/post';

const PAINT = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e, 0x7a8894, 0xc7902a];
const GREENS = [0x5f7f3a, 0x6f8a42, 0x4f7236, 0x7d9a4a];
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); // the watercolor pass sizes its targets in CSS pixels
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5efe1);
// the painted materials read the shared uniforms: a soft afternoon sun, no shadow map here
U.uShadowOn.value = 0;
U.uKeyDir.value.set(0.5, 0.75, 0.42).normalize();
U.uSunDir.value.copy(U.uKeyDir.value);
U.uKeyColor.value.setRGB(1.05, 0.98, 0.9);
U.uFogDensity.value = 0.00005;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0xe6dcc6 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 2000);
camera.position.set(38, 30, 48);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
const root = new THREE.Group();
scene.add(root);
// the game's own watercolor pass, so the workbench shows assets as they'll look in the world
const post = new WatercolorPost(renderer);
postParams.vignette = 0.25;
post.setSize(innerWidth, innerHeight);

function tinted(g: THREE.BufferGeometry, hex: number) {
  const geo = g.clone();
  const c = new THREE.Color(hex), col = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.98 && col.getY(i) > 0.98 && col.getZ(i) > 0.98) col.setXYZ(i, c.r, c.g, c.b);
  return geo;
}
const mats = { plain: propMaterial(), foliage: propMaterial({ wind: true, foliage: true }), bob: propMaterial({ bob: true }) };
function add(g: THREE.BufferGeometry, x: number, z: number, hex: number, name: string, y = 0, mat: THREE.Material = mats.plain) {
  const m = new THREE.Mesh(tinted(g, hex), mat);
  m.position.set(x, y, z);
  m.rotation.y = -0.6;
  m.name = name;
  root.add(m);
  return m;
}
const animated: { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute; hz: number; kind: string }[] = [];
let micro: MicroLayer | null = null;
let nearTrees: NearTrees | null = null;
function addCritter(kind: (typeof CRITTERS)[number], x: number, z: number, color: number) {
  const geo = critterLib(kind).clone();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
  geo.setAttribute('aAnim', anim);
  const m = new THREE.InstancedMesh(geo, critterMaterial(kind), 1);
  const small = kind === 'deer' ? 1 : kind === 'butterfly' || kind === 'firefly' ? 8 : ROLE[kind] === 'songbird' || kind === 'sandpiper' ? 5 : 3.5;
  m.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(x, kind === 'butterfly' || kind === 'firefly' ? 0.6 : 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.9), new THREE.Vector3(small, small, small)));
  m.setColorAt(0, new THREE.Color(color));
  m.name = `critter-${kind} (shown ×${small})`;
  root.add(m);
  animated.push({ m, anim, hz: kind === 'deer' ? 0.9 : kind === 'sandpiper' ? 3 : 1.6, kind });
}

// People (people.ts + creature.ts): every pose the world uses, side by side — walkers through the
// stride, a runner, people standing (weight shifts), talking, a dog walker with the dog and lead,
// the beach's poses, seated, knocked down, and the lite body beside the full one. `aAnim` per
// figure: phase (advanced by time when `walk` is set), amount, the lead.
const people: { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute; ph0: number; amt: number; lead: number; walk: boolean }[] = [];
let leads: { line: THREE.LineSegments; who: number; dog: THREE.Vector3; dyaw: number; size: number } | null = null;
function addPerson(x: number, z: number, yaw: number, shirt: number, o: { amt?: number; ph?: number; lead?: number; walk?: boolean; defines?: Record<string, number>; pose?: number; lite?: boolean; seedAt?: number } = {}) {
  const geo = (o.lite ? personLiteLib() : personLib()).clone();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
  geo.setAttribute('aAnim', anim);
  if (o.pose !== undefined) geo.setAttribute('aPose', new THREE.InstancedBufferAttribute(new Float32Array([o.pose]), 1));
  const m = new THREE.InstancedMesh(geo, creatureMaterial(o.defines ?? { LEGS: 1, PEOPLE: 1 }), 1);
  m.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
  m.setColorAt(0, new THREE.Color(shirt));
  m.name = `person-${people.length}`;
  m.frustumCulled = false;
  root.add(m);
  people.push({ m, anim, ph0: o.ph ?? 0, amt: o.amt ?? 0, lead: o.lead ?? 0, walk: !!o.walk });
  return people.length - 1;
}
const SHIRTS = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0xf2efe6, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0x3f6f78];
function buildPeople(seed: number) {
  // row 0: the stride at eight phases, side on (+x is their right; they face −x here)
  for (let k = 0; k < 8; k++) addPerson(k * 1.1 - 3.85, 0, Math.PI / 2, SHIRTS[(k + seed) % 8], { amt: 1, ph: (k / 8) * Math.PI * 2 });
  // row 1: walking (animated), a runner, standing (weight shifts), talking residents, a chat
  addPerson(-3.6, 3, Math.PI / 2, SHIRTS[seed % 8], { amt: 1, walk: true });
  addPerson(-2.2, 3, Math.PI / 2, SHIRTS[(seed + 1) % 8], { amt: 1.5, walk: true });
  addPerson(-0.8, 3, 0.3, SHIRTS[(seed + 2) % 8], { amt: 0 });
  addPerson(0.4, 3, -0.4, SHIRTS[(seed + 3) % 8], { defines: { LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1 } });
  addPerson(1.6, 3, 0.2, SHIRTS[(seed + 4) % 8], { amt: -4 });
  addPerson(2.8, 3, 0, SHIRTS[(seed + 5) % 8], { amt: -2.5 });
  // row 2: a dog walker, side on, walking — the dog a lead's length ahead and to the right
  const who = addPerson(-0.6, 6, Math.PI / 2, 0xe0a33b, { amt: 1, walk: true, lead: 1.05 });
  const dg = dogLib().clone(), da = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
  dg.setAttribute('aAnim', da);
  const dogM = new THREE.InstancedMesh(dg, dogMaterial(), 1);
  const yaw = Math.PI / 2, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dog = new THREE.Vector3(-0.6 + fx * 1.25 + rx * 0.6, 0, 6 + fz * 1.25 + rz * 0.6), size = 1.0;
  dogM.setMatrixAt(0, new THREE.Matrix4().compose(dog, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(size, size, size)));
  dogM.setColorAt(0, new THREE.Color(0xd9a860));
  dogM.name = 'dog';
  root.add(dogM);
  animated.push({ m: dogM, anim: da, hz: 1 / (0.55 * size) / 5.2 * 1.3 * 5.2 / (Math.PI * 2) * Math.PI * 2, kind: 'dog' });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2320 }));
  line.frustumCulled = false;
  root.add(line);
  leads = { line, who, dog, dyaw: yaw, size };
  // a dog walker stopped (the dog sniffing): the lead slack, the arm easy
  addPerson(2.6, 6, -Math.PI / 2, 0x5b7fa6, { amt: 0, lead: 0.9 });
  // row 3: the beach — chair, lying, sitting on the sand, standing, a kid jumping, the lifeguard
  for (let pz = 0; pz < 6; pz++) addPerson(pz * 1.5 - 3.75, 9.5, 0, [0x1f3f7a, 0xc8302a, 0x2e8a6a, 0xf2c23a, 0xe0705a, 0xc8302a][pz], { defines: { LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, BEACH: 1 }, pose: pz });
  // row 4: seated (a café chair), the knocked down, and the lite body beside the full one
  addPerson(-3, 12.5, Math.PI, 0x7a5b8c, { defines: { LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, SEATED: 1, INDOOR: 1 } });
  addPerson(-1.4, 12.5, Math.PI, 0x3f6f78, { amt: -2.5 });
  addPerson(0.4, 12.5, Math.PI + 0.4, 0xe8d8b0, { amt: 0, lite: true });
  addPerson(1.4, 12.5, Math.PI + 0.4, 0xe8d8b0, { amt: 0 });
}

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
function build() {
  root.clear();
  animated.length = 0;
  people.length = 0;
  leads = null;
  const fam = ($('family') as unknown as HTMLSelectElement).value;
  const seed = +$('seed').value || 1;
  const growth = +$('growth').value;
  $('growth').parentElement!.style.display = fam === 'plants' || fam === 'all' ? '' : 'none';
  let row = 0;
  const rowOf = (n: number, gap: number, f: (i: number, x: number, z: number) => void, rowGap = 12) => {
    for (let i = 0; i < n; i++) f(i, (i - (n - 1) / 2) * gap, row);
    row += rowGap;
  };
  const vehicles = fam === 'all' || fam === 'vehicles';
  if (vehicles) {
    for (let s = 0; s < (fam === 'vehicles' ? 2 : 1); s++)
      rowOf(CAR_TYPES.length, 6.5, (i, x, z) => add(carGeometry(carRecipe(CAR_TYPES[i], seed + s)), x, z, PAINT[(i + s * 3 + seed) % PAINT.length], `car-${CAR_TYPES[i]}-${seed + s}`), 8);
    // gear: every kind on a wagon and an SUV
    rowOf(CAR_GEAR.length, 6.5, (i, x, z) => {
      const t = i % 2 ? 'suv' : 'wagon', r = carRecipe(t, seed);
      add(merge([carGeometry(r), gearGeometry(CAR_GEAR[i], r.roof, r.L, r.W, seed + i)]), x, z, PAINT[(i + seed) % PAINT.length], `car-${t}+${CAR_GEAR[i]}`);
    }, 12);
    rowOf(BOAT_TYPES.length, 13, (i, x, z) => { const r = boatRecipe(BOAT_TYPES[i], seed); add(boatGeometry(r), x, z, 0xf4f2ec, `boat-${BOAT_TYPES[i]}-${seed}`, r.draft); }, 14);
    rowOf(PLANE_TYPES.length, 14, (i, x, z) => add(planeGeometry(planeRecipe(PLANE_TYPES[i], seed)).geo, x, z, 0xf4f1ea, `plane-${PLANE_TYPES[i]}-${seed}`), 14);
  }
  if (fam === 'all' || fam === 'trees')
    for (let v = 0; v < TREE_VARIANTS; v++) rowOf(TREE_KINDS.length, 11, (i, x, z) => add(treeLib(TREE_KINDS[i], v), x, z, GREENS[(i + v) % GREENS.length], `tree-${TREE_KINDS[i]}-${v}`, 0, mats.foliage), 12);
  if (fam === 'neartrees') {
    // every species with a near model, three grown variants each, as a tile places them: one far
    // mesh per species × variant named as a tile's, which the near layer takes up close
    nearTrees ??= (() => {
      const l = new NearTrees({ ...TREE_TIERS.desktop });
      scene.add(l.group);
      return l;
    })();
    const g = new THREE.Group();
    const ks = nearKinds();
    ks.forEach((k, i) => {
      for (let v = 0; v < TREE_VARIANTS; v++) {
        const im = new THREE.InstancedMesh(treeLib(k, v).clone(), propMaterial({ wind: true, foliage: true, crown: crownField(treeMeta(k, v)), decid: DECIDUOUS.has(k), fallHue: fallHueOf(k, v), blossom: BLOSSOM_OF[k] ?? 0, motion: MOTION_OF[k] ?? 0 }), 1);
        im.name = `trees:${k}:${v}`;
        im.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3((i - (ks.length - 1) / 2) * 13, 0, v * 16), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.6 + v), new THREE.Vector3(1, 1, 1)));
        im.setColorAt(0, new THREE.Color(GREENS[(i + v) % GREENS.length]));
        g.add(im);
      }
    });
    root.add(g);
    nearTrees.add('kit', g);
  } else nearTrees?.remove('kit');
  if (fam === 'all' || fam === 'plants') {
    const g = fam === 'all' ? 1 : growth;
    rowOf(PLANT_SPECIES.length, 2.2, (i, x, z) => add(plantGeometry(PLANT_SPECIES[i], seed, g), x, z, GREENS[i % GREENS.length], `plant-${PLANT_SPECIES[i]} (${SPECIES[PLANT_SPECIES[i]].label}) g=${g}`, 0, mats.foliage), 3);
    if (fam === 'plants') for (const gg of [0.15, 0.4, 0.65, 1]) rowOf(PLANT_SPECIES.length, 2.2, (i, x, z) => add(plantGeometry(PLANT_SPECIES[i], seed + 1, gg), x, z, GREENS[i % GREENS.length], `plant-${PLANT_SPECIES[i]} g=${gg}`, 0, mats.foliage), 3);
  }
  if (fam === 'people') buildPeople(seed);
  if (fam === 'all' || fam === 'wildlife') rowOf(CRITTERS.length, 2.2, (i, x, z) => addCritter(CRITTERS[i], x, z, CRITTERS[i] === 'songbird' ? 0xb04a4c : CRITTER_TINT[CRITTERS[i]] ?? 0xffffff), 5);
  if (fam === 'all' || fam === 'rocks') {
    const T: RockType[] = ['boulder', 'riprap', 'stone'];
    rowOf(12, 3, (i, x, z) => add(rockGeometry(T[i % 3], seed * 10 + i), x, z, 0xffffff, `rock-${T[i % 3]}-${seed * 10 + i}`), 5);
  }
  if (fam === 'all' || fam === 'furniture') {
    rowOf(MAILBOXES.length, 1.6, (i, x, z) => add(mailboxLib(MAILBOXES[i]), x, z, [0x2b2d30, 0x2c3e5c, 0xf2efe6, 0x3e5b45, 0x2b2d30][i], `mailbox-${MAILBOXES[i]}`), 4);
    rowOf(5, 2.8, (i, x, z) => {
      const k = (['umbrella', 'umbrella', 'chair', 'towel', 'picnic'] as const)[i];
      add(beachLib(k, i), x, z, [0x3a8ac0, 0xd8342c, 0x5aa4c8, 0xf2c23a, 0x9a8f80][i], `beach-${k}`);
    }, 4);
  }
  if (fam === 'impostors') {
    // the impostor check: every micro piece's 3D model (left) beside its impostor card (right), the
    // same turn and paint — orbit round them: the card should read as the piece from every side
    micro ??= (() => {
      const l = new MicroLayer(renderer, { ...MICRO_TIERS.desktop, far: 3000, pxK: 9000 });
      l.mode = 1;
      scene.add(l.group);
      return l;
    })();
    const rec: number[] = [];
    for (let r0 = 0; r0 < MICRO_KINDS.length; r0 += 8) {
      const ks = MICRO_KINDS.slice(r0, r0 + 8);
      rowOf(ks.length, 6, (i, x, z) => {
        const hex = PAINT[(r0 + i + seed) % PAINT.length], w = Math.max(ks[i].box[0], ks[i].box[2]) * 0.5 + 0.4;
        add(ks[i].geo(), x - w, z, hex, `3d-${ks[i].id}`);
        rec.push(x + w, 0, z, -0.6, r0 + i, 1, hex, 0);
      }, 7);
    }
    micro.add('kit', new Float32Array(rec));
  } else micro?.remove('kit');
  if (fam === 'all' || fam === 'micro') {
    // the micro layer's small things (assets/micro.ts), ten to a row
    for (let r0 = 0; r0 < MICRO_KINDS.length; r0 += 10) {
      const ks = MICRO_KINDS.slice(r0, r0 + 10);
      rowOf(ks.length, 2.4, (i, x, z) => add(ks[i].geo(), x, z, PAINT[(r0 + i + seed) % PAINT.length], `micro-${ks[i].id}`), 5);
    }
  }
  frame();
}
function frame() {
  const b = new THREE.Box3().setFromObject(root);
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.z * 0.8, s.y * 1.5, 2);
  controls.target.copy(c);
  camera.position.set(c.x + r * 0.55, c.y + r * 0.55, c.z + r * 0.85);
  controls.update();
}
for (const id of ['family', 'seed', 'growth']) document.getElementById(id)!.addEventListener(id === 'growth' ? 'input' : 'change', build);
document.getElementById('reroll')!.addEventListener('click', () => { $('seed').value = String((+$('seed').value || 1) + 1); build(); });
document.getElementById('glb')!.addEventListener('click', () => {
  new GLTFExporter().parse(root, (out) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' }));
    a.download = 'map-game-assets.glb';
    a.click();
  }, (e) => console.error(e), { binary: true });
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});
build();
const t0 = performance.now();
const loop = () => {
  const t = (performance.now() - t0) / 1000;
  U.uTime.value = t;
  for (const a of people) {
    const ph = a.walk ? a.ph0 + t * 1.3 * 5.2 : a.ph0;
    a.anim.setXYZ(0, ph, a.amt, a.lead);
    a.anim.needsUpdate = true;
  }
  if (leads) {
    // the lead: from where the shader draws the walker's hand (people.ts leadHand) to the collar
    const P = people[leads.who], ph = P.walk ? P.ph0 + t * 1.3 * 5.2 : P.ph0, h = leadHand(ph, P.amt, U.uTime.value, 0, P.lead); // (each figure is its own mesh: instance 0, seed 0)
    const e = P.m.instanceMatrix.array, x = e[12], z = e[14], yaw = Math.atan2(e[8], e[10]);
    const [hx, hy, hz] = atWorld(x, 0, z, yaw, h);
    const cs = Math.cos(leads.dyaw), sn = Math.sin(leads.dyaw), [cx0, cy0, cz0] = DOG_COLLAR;
    const cx = leads.dog.x + (cx0 * cs + cz0 * sn) * leads.size, cy = cy0 * leads.size, cz = leads.dog.z + (-cx0 * sn + cz0 * cs) * leads.size;
    const sag = 0.05 * Math.hypot(cx - hx, cz - hz) * 0.6, lp = leads.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let s = 0; s < 4; s++) for (const k of [0, 1]) { const u = (s + k) / 4; lp.setXYZ(s * 2 + k, hx + (cx - hx) * u, hy + (cy - hy) * u - sag * 4 * u * (1 - u), hz + (cz - hz) * u); }
    lp.needsUpdate = true;
  }
  for (const a of animated) {
    // walk for a while, then stand and look about; flying things flap, fireflies glow
    const moving = a.kind === 'dog' || Math.sin(t * 0.5) > -0.2;
    const pose = a.kind === 'firefly' ? 3 : a.kind === 'butterfly' || (a.kind === 'songbird' && !moving) ? 2 : moving ? 1 : 0;
    a.anim.setXYZ(0, t * a.hz, moving ? 1 : 0, pose);
    a.anim.needsUpdate = true;
  }
  controls.update();
  camera.updateMatrixWorld();
  micro?.update(camera.position.x, camera.position.y, camera.position.z, camera);
  nearTrees?.update(camera.position.x, camera.position.y, camera.position.z);
  if (($('painted') as HTMLInputElement).checked) post.render(scene, camera, t, 0, 0, 0, 0);
  else renderer.render(scene, camera);
  requestAnimationFrame(loop);
};
loop();
(window as unknown as Record<string, unknown>).__KIT__ = { scene, camera, controls, renderer, build, root, frame, people, U, render: () => post.render(scene, camera, 0, 0, 0, 0, 0), get micro() { return micro; }, get nearTrees() { return nearTrees; }, ground, post };
