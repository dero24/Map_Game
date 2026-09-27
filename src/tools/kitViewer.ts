// Dev page for the asset kit (kit.html): every family on a turntable grid, seeds to reroll,
// and a .glb export of whatever is shown (recipes are the source of truth; GLB is a byproduct
// for sharing / Blender). `window.__KIT__` exposes the scene for montage shots.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  BOAT_TYPES, CAR_TYPES, PLANE_TYPES, boatGeometry, boatRecipe, carGeometry, carRecipe, planeGeometry, planeRecipe, rockGeometry, type RockType,
} from '../assets/kit';

const PAINT = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e, 0x7a8894, 0xc7902a];
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5efe1);
scene.add(new THREE.HemisphereLight(0xfff7e6, 0x8a8170, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(20, 40, 25);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xd9d2bf }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(38, 30, 48);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
const root = new THREE.Group();
scene.add(root);

function tinted(g: THREE.BufferGeometry, hex: number) {
  const geo = g.clone();
  const c = new THREE.Color(hex), col = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.98 && col.getY(i) > 0.98 && col.getZ(i) > 0.98) col.setXYZ(i, c.r, c.g, c.b);
  return geo;
}
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
function add(g: THREE.BufferGeometry, x: number, z: number, hex: number, name: string, y = 0) {
  const m = new THREE.Mesh(tinted(g, hex), mat);
  m.position.set(x, y, z);
  m.rotation.y = -0.6;
  m.name = name;
  root.add(m);
}
function build() {
  root.clear();
  const fam = (document.getElementById('family') as HTMLSelectElement).value;
  const seed = +(document.getElementById('seed') as HTMLInputElement).value || 1;
  let row = 0;
  const rowOf = (n: number, gap: number, f: (i: number, x: number, z: number) => void) => {
    for (let i = 0; i < n; i++) f(i, (i - (n - 1) / 2) * gap, row * 12 - 18);
    row++;
  };
  if (fam === 'all' || fam === 'cars')
    for (let s = 0; s < (fam === 'cars' ? 3 : 1); s++)
      rowOf(CAR_TYPES.length, 6.5, (i, x, z) => add(carGeometry(carRecipe(CAR_TYPES[i], seed + s)), x, z, PAINT[(i + s * 3 + seed) % PAINT.length], `car-${CAR_TYPES[i]}-${seed + s}`));
  if (fam === 'all' || fam === 'boats') rowOf(BOAT_TYPES.length, 13, (i, x, z) => { const r = boatRecipe(BOAT_TYPES[i], seed); add(boatGeometry(r), x, z, 0xf4f2ec, `boat-${BOAT_TYPES[i]}-${seed}`, r.draft); });
  if (fam === 'all' || fam === 'planes') rowOf(PLANE_TYPES.length, 14, (i, x, z) => add(planeGeometry(planeRecipe(PLANE_TYPES[i], seed)).geo, x, z, 0xf4f1ea, `plane-${PLANE_TYPES[i]}-${seed}`));
  if (fam === 'all' || fam === 'rocks') {
    const T: RockType[] = ['boulder', 'riprap', 'stone'];
    rowOf(12, 3, (i, x, z) => add(rockGeometry(T[i % 3], seed * 10 + i), x, z, 0xffffff, `rock-${T[i % 3]}-${seed * 10 + i}`));
  }
}
document.getElementById('family')!.addEventListener('change', build);
document.getElementById('seed')!.addEventListener('change', build);
document.getElementById('reroll')!.addEventListener('click', () => {
  const s = document.getElementById('seed') as HTMLInputElement;
  s.value = String((+s.value || 1) + 1);
  build();
});
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
});
build();
const loop = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); };
loop();
(window as unknown as Record<string, unknown>).__KIT__ = { scene, camera, controls, renderer, build, root, render: () => renderer.render(scene, camera) };
