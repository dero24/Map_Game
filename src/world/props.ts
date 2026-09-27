// Street furniture and life: utility poles with sagging wires and cobra-head lamps (plus the lamp light map
// that paints warm pools on the ground at night), trees from WorldCover, moored boats, lifeguard stands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detailBox, type World, type WorldJson, type Road, type Box } from './data';
import type { WalkWorld } from '../player/collision';
import { propMaterial, colored } from '../render/propMaterial';
import { U, GLSL_NOISE } from '../render/shared';
import { makeRng, hash01 } from '../core/rng';
import { carGeo } from '../sim/life';
import type { Mailbox, Door } from './buildings';
import { makeCanvas } from './canvas';
import { activeStyle, pickWeighted } from './styles';

type P = [number, number];
const unpackPts = (f: number[]): P[] => {
  const o: P[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
  return o;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RANK: Record<string, number> = { residential: 2, unclassified: 2, living_street: 2, tertiary: 3, secondary: 4, primary: 5 };

export function wireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uNight: U.uNight },
    vertexShader: /* glsl */ `
      varying float vDist;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor; uniform float uFogDensity, uNight;
      varying float vDist;
      void main() {
        vec3 c = mix(vec3(0.16, 0.15, 0.17), vec3(0.05, 0.06, 0.1), uNight);
        float f = 1.0 - exp(-vDist * (uFogDensity * 2.0 + 0.004));
        gl_FragColor = vec4(mix(c, uFogColor, f), 1.0 - f * 0.9);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

// 2 m/px mask of paved / sandy / built-over ground where nothing should grow or stand.
function pavedMask(world: World, zone: { x0: number; z0: number; x1: number; z1: number }) {
  const { json } = world;
  const w = Math.ceil((zone.x1 - zone.x0) / 2), h = Math.ceil((zone.z1 - zone.z0) / 2);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })! as CanvasRenderingContext2D;
  ctx.setTransform(0.5, 0, 0, 0.5, -zone.x0 * 0.5, -zone.z0 * 0.5);
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const r of json.roads) {
    if (r.lod) continue;
    const p = unpackPts(r.p);
    ctx.beginPath();
    p.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.lineWidth = r.w + (RANK[r.c] ? 3 : 1.2);
    ctx.stroke();
  }
  for (const a of json.areas) {
    if (!['parking', 'plaza', 'beach', 'pier', 'pool', 'pitch', 'marina'].includes(a.c)) continue;
    ctx.beginPath();
    for (const ring of a.o) unpackPts(ring).forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.fill();
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return (x: number, z: number) => {
    const i = Math.floor((x - zone.x0) / 2), j = Math.floor((z - zone.z0) / 2);
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    return data[(j * w + i) * 4] > 60;
  };
}

// Night halos around lamp heads and lanterns (soft wet blooms, additive). Module-level so the
// tile worker's packed objects can be rebuilt with the same material on the main thread.
export function haloMaterial(size: number, color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uLampPower: U.uLampPower, uSize: { value: size }, uColor: { value: color }, uTime: U.uTime },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * 900.0 / -mv.z, 2.0, 220.0);
        vFade = clamp(1.0 - (-mv.z) / 2500.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLampPower, uTime;
      uniform vec3 uColor;
      varying float vFade;
      ${GLSL_NOISE}
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        float rag = 0.85 + 0.3 * vnoise(d * 7.0 + 3.0);
        float a = smoothstep(1.0 * rag, 0.0, r);
        a = a * a * uLampPower * vFade;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function haloPoints(pts: THREE.Vector3[], size: number, color: THREE.Color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  const pts3 = new THREE.Points(g, haloMaterial(size, color));
  pts3.renderOrder = 8;
  pts3.frustumCulled = false;
  return pts3;
}

// A clipped hedge run (3.4 × 0.85 × 0.55 m, same footprint the old box had): overlapping
// squashed blobs with a gently lumpy skin and a flatter top — reads as foliage, not a crate.
let hedgeCache: THREE.BufferGeometry | null = null;
function hedgeGeo() {
  if (hedgeCache) return hedgeCache.clone();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.IcosahedronGeometry(0.5, 1);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const n = 1 + 0.12 * Math.sin(x * 9.1 + i * 1.7) * Math.cos(z * 7.3 + y * 5.1);
      pos.setXYZ(k, x * 0.95 * n, Math.min(y, 0.36) * 0.95 * n, z * 0.6 * n);
    }
    g.computeVertexNormals();
    parts.push(g.translate((-1.36 + i * 0.68) * 0.86, 0.42, 0).scale(1, 1, 1));
  }
  hedgeCache = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  hedgeCache.computeVertexNormals();
  return hedgeCache.clone();
}

export function buildProps(world: World, walk: WalkWorld, pierSegs: { a: P; b: P; w: number }[], extras: { mailboxes?: Mailbox[]; doors?: Door[]; ctx?: WorldJson; box?: Box } = {}) {
  const { json, terrain } = world;
  const S = json.slice; // region slice: lamp-map compositor box
  // Placement gate: the detail zone (the backdrop for baked tiles, cell+margin for synthetic
  // and real-lite ones — so props render everywhere a tile is mounted at detail).
  const DZ = detailBox(json);
  const inSlice = (x: number, z: number, m = 0) => x > DZ.x0 - m && x < DZ.x1 + m && z > DZ.z0 - m && z < DZ.z1 + m;
  const group = new THREE.Group();
  group.name = 'props';
  const rng = makeRng(7);
  // The paved/blocked masks must see EVERY entity — margin-context roads (own: 0) are
  // stripped from `json` by prim(), but a tree dropped on a neighbour-owned road is still
  // a tree in the road. ctx carries the unfiltered tile json; box bounds the tree scan to
  // this tile's own area so overlapping scan zones never double-spawn the same tree.
  const ctxJson = extras.ctx ?? json;
  // Cap the mask canvas at the slice + margin: legacy regions hand us box=backdrop, which
  // would otherwise rasterize a ~12 km canvas (hundreds of MB) in the worker.
  const big = { x0: S.x0 - 250, z0: S.z0 - 250, x1: S.x1 + 250, z1: S.z1 + 250 };
  const maskZone = extras.box
    ? { x0: extras.box.x0 - 8, z0: extras.box.z0 - 8, x1: extras.box.x1 + 8, z1: extras.box.z1 + 8 }
    : big;
  const paved = pavedMask({ json: ctxJson, terrain }, maskZone);

  // ---------- utility poles, wires, lamps ----------
  const poleMats: THREE.Matrix4[] = [];
  const armMats: THREE.Matrix4[] = [];
  const lampHeads: THREE.Vector3[] = [];
  const lampGround: [number, number][] = [];
  const wire: number[] = [];
  const q = new THREE.Quaternion();
  const roads = json.roads.filter((r) => !r.lod && !r.br && (RANK[r.c] ?? 0) >= 2) as Road[];
  for (const r of roads) {
    const rank = RANK[r.c];
    const p = unpackPts(r.p);
    const side = hash01(r.p[0] * 31 + r.p[1]) < 0.5 ? 1 : -1;
    const off = (r.w / 2 + (rank >= 5 ? 3.8 : 1.6)) * side;
    const spacing = rank >= 5 ? 34 : 38;
    let carry = spacing * 0.35;
    let prev: { top: THREE.Vector3; ang: number } | null = null;
    let count = 0;
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      const nx = tz, nz = -tx;
      let s = carry;
      while (s < L) {
        const x = ax + tx * s + nx * off, z = az + tz * s + nz * off;
        s += spacing;
        if (!inSlice(x, z, 20) || terrain.sdfAt(x, z) < 1.5 || walk.blocked(x, z, 0.8)) { prev = null; continue; }
        const g = terrain.heightAt(x, z);
        const ang = Math.atan2(tz, tx);
        q.setFromAxisAngle(V(0, 1, 0), -ang);
        poleMats.push(new THREE.Matrix4().compose(V(x, g, z), q, V(1, 1, 1)));
        const top = V(x, g + 9.6, z);
        if (prev) {
          for (const [dv, dy] of [[-1.05, 0], [1.05, 0], [0, -2.0]] as const) {
            const ox = nx * dv, oz = nz * dv;
            const a = V(prev.top.x + ox, prev.top.y + dy, prev.top.z + oz), b = V(top.x + ox, top.y + dy, top.z + oz);
            const span = a.distanceTo(b);
            const sag = 0.012 * span + 0.15;
            const N = 8;
            for (let k = 0; k < N; k++) {
              const t0 = k / N, t1 = (k + 1) / N;
              const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
              p0.y -= sag * 4 * t0 * (1 - t0);
              p1.y -= sag * 4 * t1 * (1 - t1);
              wire.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            }
          }
        }
        prev = { top, ang };
        // cobra-head lamp on some poles, reaching over the street
        if (count++ % (rank >= 5 ? 2 : 3) === 0) {
          const dir = -side;
          const hx = x + nx * dir * 2.1, hz = z + nz * dir * 2.1;
          armMats.push(new THREE.Matrix4().compose(V(x, g, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang + (dir > 0 ? 0 : Math.PI)), V(1, 1, 1)));
          lampHeads.push(V(hx, g + 8.05, hz));
          lampGround.push([x + nx * dir * 4.5, z + nz * dir * 4.5]);
        }
      }
      carry = s - L;
    }
  }
  const poleGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.17, 10.2, 7).translate(0, 5.1, 0), 0x5e5043),
    colored(new THREE.BoxGeometry(0.12, 0.12, 2.5).translate(0, 9.6, 0), 0x5a4c3f),
    colored(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 5).translate(0, 9.8, -1.05), 0x9fb0a8),
    colored(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 5).translate(0, 9.8, 1.05), 0x9fb0a8),
    colored(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 8).translate(0.3, 8.3, 0), 0x6f7479), // transformer can
  ]);
  const poles = new THREE.InstancedMesh(poleGeo, propMaterial(), poleMats.length);
  poleMats.forEach((m, i) => poles.setMatrixAt(i, m));
  poles.layers.enable(1);
  group.add(poles);

  const armGeo = mergeGeometries([
    colored(new THREE.BoxGeometry(0.08, 0.08, 2.2).translate(0, 8.25, 1.1), 0x8d9296),
    colored(new THREE.BoxGeometry(0.34, 0.14, 0.62).translate(0, 8.12, 2.2), 0x9aa0a4),
  ]);
  const arms = new THREE.InstancedMesh(armGeo, propMaterial(), armMats.length);
  armMats.forEach((m, i) => arms.setMatrixAt(i, m));
  group.add(arms);
  // glowing lenses
  const lens = new THREE.InstancedMesh(colored(new THREE.BoxGeometry(0.3, 0.05, 0.5), 0xfff0d0), propMaterial({ emissive: new THREE.Color(1.0, 0.72, 0.4), emissiveNight: true }), lampHeads.length);
  lampHeads.forEach((p, i) => lens.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y - 0.02, p.z)));
  group.add(lens);

  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wires = new THREE.LineSegments(wg, wireMaterial());
  wires.renderOrder = 6;
  group.add(wires);

  // Lamp light map: soft warm pools painted top-down, sampled by every material at night.
  const LM = 1024;
  const lc = makeCanvas(LM, LM);
  const lctx = lc.getContext('2d')! as CanvasRenderingContext2D;
  lctx.fillStyle = '#000';
  lctx.fillRect(0, 0, LM, LM);
  const sx = LM / (S.x1 - S.x0), sz = LM / (S.z1 - S.z0);
  lctx.globalCompositeOperation = 'lighter';
  for (const [x, z] of lampGround) {
    const px = (x - S.x0) * sx, pz = (z - S.z0) * sz;
    const r = 15 * sx;
    const g = lctx.createRadialGradient(px, pz, 0, px, pz, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    lctx.fillStyle = g;
    lctx.fillRect(px - r, pz - r, r * 2, r * 2);
  }
  // The lamp map ships to the stream, which composites every mounted tile's pools into uLampMap.
  const lampBox: [number, number, number, number] = [S.x0, S.z0, 1 / (S.x1 - S.x0), 1 / (S.z1 - S.z0)];
  group.add(haloPoints(lampHeads, 1.6, new THREE.Color(1.0, 0.7, 0.38)));

  // ---------- trees ----------
  // kinds: 0 round deciduous, 1 tall oak, 2 shrub, 3 pine, 4 spruce
  const trees: { m: THREE.Matrix4; c: THREE.Color; k: number }[] = [];
  // When a tile box is provided the scan only walks cells this tile owns — neighbours cover
  // the rest. Without one (legacy single-tile worlds) it covers slice + margin as before.
  const zone = extras.box ?? { x0: S.x0 - 250, z0: S.z0 - 250, x1: S.x1 + 250, z1: S.z1 + 250 };
  const G = 9;
  const look = activeStyle(); // Phase I: region species mix, density and greens
  const green = look.greens;
  // Nearest point on any nearby road — used to slide mistagged street trees off the carriageway.
  const roadEdge = (x: number, z: number) => {
    let best: { x: number; z: number; w: number; d: number } | null = null;
    for (const r of ctxJson.roads) {
      if (r.lod || r.br) continue;
      const p = unpackPts(r.p);
      for (let i = 0; i + 1 < p.length; i++) {
        const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1];
        const L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - p[i][0]) * dx + (z - p[i][1]) * dz) / L2));
        const qx = p[i][0] + dx * t, qz = p[i][1] + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (!best || d < best.d) best = { x: qx, z: qz, w: r.w, d };
      }
    }
    return best && best.d < 60 ? best : null;
  };
  // LiDAR trees (lidar.ts): where the survey covered the ground, the real trees replace
  // both the WorldCover scan and OSM tree points (they're the same trees, measured).
  const LT = json.trees, LC = json.treeCov, TB = extras.box;
  const lidarCovered = (x: number, z: number) => {
    if (!LC || !TB) return false;
    const I = Math.floor(((x - TB.x0) / (TB.x1 - TB.x0)) * 16), J = Math.floor(((z - TB.z0) / (TB.z1 - TB.z0)) * 16);
    return I >= 0 && J >= 0 && I < 16 && J < 16 && LC[J * 16 + I] === 1;
  };
  for (let z = zone.z0; z < zone.z1; z += G)
    for (let x = zone.x0; x < zone.x1; x += G) {
      // Only cells this tile owns — the scan zones of adjacent tiles overlap the margin, and
      // the rng sequence is identical per tile. Skipping here also spares the ~9x redundant
      // terrain lookups the old S±250 zone spent on cells owned by neighbours.
      if (extras.box && (x < extras.box.x0 || x >= extras.box.x1 || z < extras.box.z0 || z >= extras.box.z1)) continue;
      const jx = x + rng.float() * G, jz = z + rng.float() * G;
      if (lidarCovered(jx, jz)) continue;
      const cov = terrain.coverAt(jx, jz);
      const beachy = terrain.oceanDistAt(jx, jz) < 90;
      const pr = cov === 10 ? 0.85 : beachy ? 0 : cov === 50 ? 0.035 : cov === 30 ? 0.05 : cov === 20 ? 0.3 : 0;
      if (rng.float() > pr * look.treeDensity) continue;
      if (terrain.sdfAt(jx, jz) < 3 || paved(jx, jz) || walk.blocked(jx, jz, 2.2)) continue;
      const g = terrain.heightAt(jx, jz);
      // species from the region's weights; coastal cells lean to wind-shaped pines everywhere
      const coastPine = terrain.oceanDistAt(jx, jz) < 500 && look.trees[3] > 0.5 && rng.float() < 0.35;
      const k = coastPine ? 3 : pickWeighted(look.trees, rng.float());
      const h = k === 2 ? 2.4 + rng.float() * 1.6 : (k >= 3 ? 7 : 8) + rng.float() * 7;
      const s = h / 10;
      const m = new THREE.Matrix4().compose(V(jx, g - 0.2, jz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(s * (0.85 + rng.float() * 0.3), s * (k === 2 ? 1.3 : 1), s * (0.85 + rng.float() * 0.3)));
      const c = new THREE.Color(rng.pick(green));
      if (k === 4) c.lerp(new THREE.Color(0x2e4630), 0.55); // spruces run dark
      else if (rng.float() < 0.12) c.lerp(new THREE.Color(0xb59a3e), 0.45); // first hints of autumn
      trees.push({ m, c, k });
    }
  for (const p of json.points) {
    if (p.c !== 'tree' || !inSlice(p.x, p.z) || lidarCovered(p.x, p.z)) continue;
    let { x, z } = p;
    if (paved(x, z)) {
      // OSM street trees are often tagged on the carriageway — slide to the near verge
      // instead of dropping them, so the canopy still shades the street.
      const e = roadEdge(x, z);
      if (!e) continue;
      const nx = x - e.x, nz = z - e.z, L = Math.hypot(nx, nz) || 1;
      const out = e.w / 2 + 2.0 + rng.float() * 1.2;
      x = e.x + (nx / L) * out;
      z = e.z + (nz / L) * out;
      if (paved(x, z) || walk.blocked(x, z, 2.2)) continue;
    }
    trees.push({ m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(0.9, 0.9, 0.9)), c: new THREE.Color(rng.pick(green)), k: rng.float() < 0.6 ? 0 : 1 });
  }

  if (LT && TB) {
    // model extents per kind (height to crown top, crown radius) — scale each to the measured tree
    const DIM: [number, number][] = [[9.7, 3.6], [10.7, 4.8], [3.3, 1.9], [10.4, 2.4], [9.6, 1.7]];
    const wsum = look.trees.reduce((a, b) => a + b, 0) || 1;
    const conifer = (look.trees[3] + look.trees[4]) / wsum; // the region's conifer share
    for (let i = 0; i + 3 < LT.length; i += 4) {
      let x = LT[i] / 10, z = LT[i + 1] / 10;
      const h = LT[i + 2] / 10, r = LT[i + 3] / 10;
      if (x < TB.x0 || x >= TB.x1 || z < TB.z0 || z >= TB.z1) continue; // each tree is its own cell's
      if (terrain.sdfAt(x, z) < 1) continue;
      if (paved(x, z)) {
        // crown tops over the street: plant the trunk on the verge beneath the edge of it
        const e = roadEdge(x, z);
        if (!e) continue;
        const nx = x - e.x, nz = z - e.z, L = Math.hypot(nx, nz) || 1;
        const out = e.w / 2 + 1.6 + rng.float() * 0.8;
        x = e.x + (nx / L) * out;
        z = e.z + (nz / L) * out;
        if (paved(x, z)) continue;
      }
      if (walk.blocked(x, z, 0.6)) continue;
      // species: shrubs are short; a narrow crown for its height reads conifer where the
      // region grows them; otherwise the region's broadleaf mix (oaks for the broad ones)
      const slim = r / h < 0.3;
      let k: number;
      if (h < 4.2) k = 2;
      else if (slim && rng.float() < Math.min(1, conifer * 3)) k = look.trees[4] > look.trees[3] ? 4 : 3;
      else if (!slim && conifer > 0.6 && rng.float() < 0.5) k = look.trees[4] > look.trees[3] ? 4 : 3;
      else k = r / h > 0.42 || rng.float() < look.trees[1] / Math.max(0.01, look.trees[0] + look.trees[1]) ? 1 : 0;
      const [mh, mr] = DIM[k];
      // crowns never thinner than ~the model's own proportions: a lone 20 m oak measured
      // at half-height reads narrow, and a stretched-thin model reads as a lollipop
      const sy = h / mh, sr = Math.max(0.85 * sy, Math.min(1.8 * sy, r / mr));
      const m = new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z) - 0.2, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(sr * (0.92 + rng.float() * 0.16), sy, sr * (0.92 + rng.float() * 0.16)));
      const c = new THREE.Color(rng.pick(green));
      if (k === 4) c.lerp(new THREE.Color(0x2e4630), 0.55);
      else if (rng.float() < 0.12) c.lerp(new THREE.Color(0xb59a3e), 0.45);
      trees.push({ m, c, k });
    }
  }

  // ---- clearance against buildings (every tree source) ----
  // Real trees overhang roofs, but a watercolour blob crown through a wall reads as a tree
  // growing inside the house. A crown that sits below the neighbouring roof is narrowed to
  // stop just short of the wall; one that clears the roof may overhang it; a trunk inside
  // or hugging a footprint is moved out to 1.3 m, and a tree squeezed to a stick is dropped.
  {
    type FB = { r: P[]; h: number; bb: [number, number, number, number] };
    const fbs: FB[] = [];
    const cellB = 32, byCell = new Map<number, FB[]>();
    const ck = (a: number, b: number) => a * 92821 + b;
    for (const bd of ctxJson.buildings) {
      const r = unpackPts(bd.r).map(([x, z]) => [x, z] as P);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of r) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
      const f: FB = { r, h: bd.h, bb: [x0, z0, x1, z1] };
      fbs.push(f);
      for (let a = Math.floor((x0 - 10) / cellB); a <= Math.floor((x1 + 10) / cellB); a++)
        for (let b = Math.floor((z0 - 10) / cellB); b <= Math.floor((z1 + 10) / cellB); b++) {
          const l = byCell.get(ck(a, b));
          if (l) l.push(f);
          else byCell.set(ck(a, b), [f]);
        }
    }
    // nearest footprint edge: distance, outward normal, inside?, building height
    const nearest = (x: number, z: number) => {
      let best: { d: number; nx: number; nz: number; inside: boolean; h: number } | null = null;
      for (const f of byCell.get(ck(Math.floor(x / cellB), Math.floor(z / cellB))) ?? []) {
        if (x < f.bb[0] - 10 || x > f.bb[2] + 10 || z < f.bb[1] - 10 || z > f.bb[3] + 10) continue;
        let inside = false, d = Infinity, qx = 0, qz = 0;
        for (let a = 0, b = f.r.length - 1; a < f.r.length; b = a++) {
          const [xa, za] = f.r[a], [xb, zb] = f.r[b];
          if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
          const dx = xb - xa, dz = zb - za, L2 = dx * dx + dz * dz || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - xa) * dx + (z - za) * dz) / L2));
          const px = xa + t * dx, pz = za + t * dz, dd = Math.hypot(x - px, z - pz);
          if (dd < d) (d = dd), (qx = px), (qz = pz);
        }
        const sd = inside ? -d : d;
        if (!best || sd < (best.inside ? -best.d : best.d)) {
          const L = Math.hypot(x - qx, z - qz) || 1;
          best = { d, nx: ((x - qx) / L) * (inside ? -1 : 1), nz: ((z - qz) / L) * (inside ? -1 : 1), inside, h: f.h };
        }
      }
      return best;
    };
    // per model: crown radius and crown-bottom height (at scale 1)
    const CR = [3.6, 4.8, 1.9, 2.4, 1.7], CB = [4.0, 5.7, 0.5, 3.4, 2.7];
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = trees.length - 1; i >= 0; i--) {
      const t = trees[i];
      t.m.decompose(pos, q, sc);
      let n = nearest(pos.x, pos.z);
      if (!n) continue;
      if (n.inside || n.d < 1.3) {
        const push = (n.inside ? n.d : -n.d) + 1.3;
        pos.x += n.nx * push;
        pos.z += n.nz * push;
        n = nearest(pos.x, pos.z);
        if (n && (n.inside || n.d < 1.2)) { trees.splice(i, 1); continue; } // wedged between houses
        pos.y = terrain.heightAt(pos.x, pos.z) - 0.2;
      }
      if (n) {
        const crownR = CR[t.k] * Math.max(sc.x, sc.z), crownBottom = CB[t.k] * sc.y;
        if (crownBottom < n.h + 0.8 && crownR > n.d + 0.4) {
          const f = (n.d + 0.4) / crownR;
          if (f * Math.max(sc.x, sc.z) < 0.45 * sc.y) { trees.splice(i, 1); continue; } // would be a stick
          sc.x *= f;
          sc.z *= f;
        }
      }
      t.m.compose(pos, q, sc);
    }
  }

  const blob = (r: number, y: number, ox: number, oz: number, seed: number, sy = 0.85) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = V(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = 0.82 + 0.3 * hash01(Math.floor((v.x + 9) * 3) * 73 + Math.floor((v.y + 9) * 3) * 19 + Math.floor((v.z + 9) * 3) + seed);
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x + ox, v.y * sy + y, v.z + oz);
    }
    g.computeVertexNormals();
    return colored(g, 0xffffff);
  };
  const decid = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.18, 0.3, 4.4, 5).translate(0, 2.2, 0), 0x6b5a48),
    blob(2.6, 6.2, 0, 0, 1), blob(2.0, 7.4, 1.4, 0.6, 2), blob(1.9, 5.6, -1.3, -0.8, 3), blob(1.6, 8.1, -0.4, 1.0, 4),
  ]);
  const oak = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.22, 0.36, 5.6, 5).translate(0, 2.8, 0), 0x6b5a48),
    blob(3.1, 7.6, 0, 0, 11, 0.62), blob(2.4, 8.4, 1.9, 0.8, 12, 0.55), blob(2.2, 6.9, -1.8, -0.7, 13, 0.6), blob(1.8, 8.9, -0.4, 1.5, 14, 0.5),
  ]);
  const shrub = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.09, 0.14, 1.3, 5).translate(0, 0.65, 0), 0x6b5a48),
    blob(1.35, 1.8, 0, 0, 15), blob(0.95, 2.4, 0.75, -0.35, 16), blob(0.9, 1.6, -0.7, 0.4, 17),
  ]);
  const pineGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.16, 0.26, 6.5, 5).translate(0, 3.25, 0), 0x6b5140),
    blob(1.9, 6.4, 0.3, 0, 5), blob(1.5, 8.2, -0.4, 0.3, 6), blob(1.4, 5.0, 0.8, -0.5, 7), blob(1.0, 9.4, 0, 0, 8),
  ]);
  const spruce = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.2, 6.0, 5).translate(0, 3.0, 0), 0x5d4a3a),
    blob(1.6, 4.3, 0, 0, 18, 0.95), blob(1.3, 5.7, 0.15, -0.1, 19, 0.95), blob(1.0, 7.0, -0.1, 0.15, 20, 0.95), blob(0.7, 8.2, 0, 0, 21, 0.95), blob(0.45, 9.1, 0, 0, 22, 0.95),
  ]);
  // Trunks keep their brown: instance colour only tints foliage (vertex color white there).
  const geos = [decid, oak, shrub, pineGeo, spruce];
  for (let k = 0; k < geos.length; k++) {
    const list = trees.filter((t) => t.k === k);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geos[k], propMaterial({ wind: true, foliage: true }), list.length);
    list.forEach((t, i) => { im.setMatrixAt(i, t.m); im.setColorAt(i, t.c); });
    im.layers.enable(1);
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- moored boats ----------
  const boats: THREE.Matrix4[] = [];
  const boatCol: THREE.Color[] = [];
  const sails: THREE.Matrix4[] = [];
  for (const s of pierSegs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const L = Math.hypot(dx, dz);
    if (L < 4) continue;
    const tx = dx / L, tz = dz / L;
    for (let d = 3; d < L - 2; d += 6.5) {
      for (const side of [-1, 1]) {
        if (rng.float() < 0.45) continue;
        const len = 7 + rng.float() * 6;
        const off = s.w / 2 + 1.9 + rng.float() * 0.4;
        const x = s.a[0] + tx * d + tz * side * off, z = s.a[1] + tz * d - tx * side * off;
        if (terrain.sdfAt(x, z) > -2.5 || walk.deckAt(x, z) !== null) continue;
        const ang = Math.atan2(tz, tx) + (rng.float() < 0.5 ? 0 : Math.PI);
        const m = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang), V(len / 10, len / 10, len / 10));
        boats.push(m);
        boatCol.push(new THREE.Color(rng.pick([0xf4f2ec, 0xf4f2ec, 0xeef0f0, 0x2d4a6a, 0xd9e4ea, 0x9b3b32])));
        if (rng.float() < 0.3) sails.push(m);
      }
    }
  }
  if (boats.length) {
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-5, -1.3); hullShape.lineTo(3.2, -1.3); hullShape.quadraticCurveTo(5.3, -0.6, 5.3, 0); hullShape.quadraticCurveTo(5.3, 0.6, 3.2, 1.3); hullShape.lineTo(-5, 1.3); hullShape.lineTo(-5, -1.3);
    const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 1.1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.35, 0);
    const boatGeo = mergeGeometries([
      colored(hull, 0xffffff),
      colored(new THREE.BoxGeometry(3.4, 0.9, 2.0).translate(-0.6, 1.2, 0), 0xf6f4ee),
      colored(new THREE.BoxGeometry(2.2, 0.25, 2.1).translate(-0.4, 1.75, 0), 0x3a4f63),
      colored(new THREE.BoxGeometry(10.1, 0.18, 2.66).translate(0.1, 0.75, 0), 0x3d4d5d),
    ]);
    const im = new THREE.InstancedMesh(boatGeo, propMaterial({ bob: true }), boats.length);
    boats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, boatCol[i]); });
    im.layers.enable(1);
    group.add(im);
    if (sails.length) {
      const mast = new THREE.InstancedMesh(colored(new THREE.CylinderGeometry(0.06, 0.08, 11, 5).translate(0.8, 6.2, 0), 0xd8d8d4), propMaterial({ bob: true }), sails.length);
      sails.forEach((m, i) => mast.setMatrixAt(i, m));
      group.add(mast);
    }
  }

  // ---------- lifeguard stands along the beach, facing the sea ----------
  const stands: THREE.Matrix4[] = [];
  const standAt: [number, number][] = [];
  const SZ = extras.box
    ? { x0: Math.max(DZ.x0 + 60, extras.box.x0), z0: Math.max(DZ.z0 + 60, extras.box.z0), x1: Math.min(DZ.x1 - 60, extras.box.x1), z1: Math.min(DZ.z1 - 60, extras.box.z1) }
    : { x0: DZ.x0 + 60, z0: DZ.z0 + 60, x1: DZ.x1 - 60, z1: DZ.z1 - 60 };
  for (let z = SZ.z0; z < SZ.z1; z += 12)
    for (let x = SZ.x0; x < SZ.x1; x += 3) {
      if (extras.box && (x < extras.box.x0 || x >= extras.box.x1 || z < extras.box.z0 || z >= extras.box.z1)) continue;
      const d = terrain.sdfAt(x, z);
      if (!(terrain.oceanDistAt(x, z) < 60 && d > 22 && d < 30) || standAt.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 140)) continue;
      const gx = terrain.oceanDistAt(x - 6, z) - terrain.oceanDistAt(x + 6, z), gz = terrain.oceanDistAt(x, z - 6) - terrain.oceanDistAt(x, z + 6);
      standAt.push([x, z]);
      // the chair's back (local -z) to the land, looking out along the seaward slope
      stands.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(gx, gz)), V(1, 1, 1)));
      walk.addLoop([[x - 1, z - 0.9], [x + 1, z - 0.9], [x + 1, z + 0.9], [x - 1, z + 0.9]]);
    }

  // ---------- parked cars at the house end of real driveways ----------
  const parked: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const CAR = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x5a5e64, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e, 0x7a8894];
  for (const r of json.roads) {
    if (r.lod || r.sv !== 'driveway' || r.p.length < 4) continue;
    const p = unpackPts(r.p);
    const h = hash01(r.p[0] * 131 + r.p[1] * 7);
    if (h > 0.62) continue;
    // the end farther from any street is the house end
    const a = p[0], b = p[p.length - 1];
    const blockedA = walk.blocked(a[0], a[1], 3), blockedB = walk.blocked(b[0], b[1], 3);
    const [e, f] = blockedA && !blockedB ? [a, p[1]] : blockedB && !blockedA ? [b, p[p.length - 2]] : hash01(r.p[2] * 17) < 0.5 ? [a, p[1]] : [b, p[p.length - 2]];
    const dx = f[0] - e[0], dz = f[1] - e[1], l = Math.hypot(dx, dz);
    if (l < 0.5) continue;
    const back = Math.min(3.2, l * 0.5);
    const x = e[0] + (dx / l) * back, z = e[1] + (dz / l) * back;
    const yaw = Math.atan2(-dx, -dz) + (h < 0.3 ? Math.PI : 0);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const corners: P[] = [[-1, -2.3], [1, -2.3], [1, 2.3], [-1, 2.3]].map(([u, v]) => [x + u * cy + v * sy, z - u * sy + v * cy]);
    if (!inSlice(x, z, 10) || corners.some(([cx, cz]) => walk.blocked(cx, cz, 0.3)) || terrain.sdfAt(x, z) < 2) continue;
    parked.push({ m: new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)), c: new THREE.Color(CAR[Math.floor(h * 97) % CAR.length]) });
    walk.addLoop(corners);
  }
  if (parked.length) {
    const im = new THREE.InstancedMesh(carGeo(), propMaterial(), parked.length);
    im.name = 'parked-cars'; // player/vehicles.ts finds these to let you drive off in one
    parked.forEach((p, i) => { im.setMatrixAt(i, p.m); im.setColorAt(i, p.c); });
    im.layers.enable(1);
    group.add(im);
  }

  // ---------- mapped fences (picket / rail) ----------
  const fm = new THREE.Group();
  const fencePosts: THREE.Matrix4[] = [], fenceRails: THREE.Matrix4[] = [];
  for (const l of json.lines) {
    if (l.c !== 'fence') continue;
    const p = unpackPts(l.p);
    if (!p.some(([x, z]) => inSlice(x, z, -20))) continue;
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) continue;
      const ang = Math.atan2(bz - az, bx - ax);
      const n = Math.max(1, Math.round(L / 2.2));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        fencePosts.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang), V(1, 1, 1)));
      }
      for (const y of [0.35, 0.95]) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        fenceRails.push(new THREE.Matrix4().compose(V(mx, terrain.heightAt(mx, mz) + y, mz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -ang), V(L, 1, 1)));
      }
      walk.addWall([ax, az], [bx, bz]);
    }
  }
  if (fencePosts.length) {
    const post = new THREE.InstancedMesh(colored(new THREE.BoxGeometry(0.1, 1.15, 0.1).translate(0, 0.575, 0), 0xefebe2), propMaterial(), fencePosts.length);
    fencePosts.forEach((mt, i) => post.setMatrixAt(i, mt));
    const rail = new THREE.InstancedMesh(colored(new THREE.BoxGeometry(1, 0.07, 0.04), 0xefebe2), propMaterial(), fenceRails.length);
    fenceRails.forEach((mt, i) => rail.setMatrixAt(i, mt));
    post.layers.enable(1);
    fm.add(post, rail);
    group.add(fm);
  }

  // ---------- curbside mailboxes for the houses with a mapped address ----------
  if (extras.mailboxes?.length) {
    const mb = mergeGeometries([
      colored(new THREE.BoxGeometry(0.09, 1.05, 0.09).translate(0, 0.52, 0), 0x6b5a48),
      colored(new THREE.BoxGeometry(0.24, 0.24, 0.5).translate(0, 1.15, 0), 0xffffff),
      colored(new THREE.BoxGeometry(0.03, 0.14, 0.04).translate(0.13, 1.2, -0.12), 0xc2412f),
    ]);
    const im = new THREE.InstancedMesh(mb, propMaterial(), extras.mailboxes.length);
    const MBC = [0x2b2d30, 0x2b2d30, 0xf2efe6, 0x3e5b45, 0x2c3e5c];
    extras.mailboxes.forEach((b, i) => {
      im.setMatrixAt(i, new THREE.Matrix4().compose(V(b.x, terrain.heightAt(b.x, b.z), b.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), b.yaw), V(1, 1, 1)));
      im.setColorAt(i, new THREE.Color(MBC[Math.floor(hash01(Math.floor(b.x * 10) ^ Math.floor(b.z * 10)) * MBC.length)]));
      walk.addLoop([[b.x - 0.12, b.z - 0.12], [b.x + 0.12, b.z - 0.12], [b.x + 0.12, b.z + 0.12], [b.x - 0.12, b.z + 0.12]]);
    });
    im.layers.enable(1);
    group.add(im);
  }
  if (stands.length) {
    const parts: THREE.BufferGeometry[] = [];
    for (const [x, zz] of [[-0.8, -0.7], [0.8, -0.7], [-0.8, 0.7], [0.8, 0.7]]) parts.push(colored(new THREE.BoxGeometry(0.14, 2.4, 0.14).translate(x, 1.2, zz).rotateX(zz * 0.12), 0xf4f1ea));
    parts.push(colored(new THREE.BoxGeometry(1.9, 0.12, 1.6).translate(0, 2.4, 0), 0xf4f1ea));
    parts.push(colored(new THREE.BoxGeometry(1.9, 1.0, 0.12).translate(0, 2.95, -0.75), 0xf4f1ea));
    parts.push(colored(new THREE.BoxGeometry(1.4, 0.35, 0.05).translate(0, 3.2, 0.3), 0xc2412f));
    for (let k = 0; k < 4; k++) parts.push(colored(new THREE.BoxGeometry(1.7, 0.06, 0.1).translate(0, 0.4 + k * 0.5, 0.78), 0xf4f1ea));
    const im = new THREE.InstancedMesh(mergeGeometries(parts), propMaterial(), stands.length);
    stands.forEach((m, i) => im.setMatrixAt(i, m));
    im.layers.enable(1);
    group.add(im);
  }

  // ---------- street furniture: hydrants, benches, bins, planters, front hedges ----------
  {
    // Distance from (x,z) to the nearest carriageway edge — the universal "not in the street"
    // check. Street furniture may sit on pavement but never inside the lane.
    const clearOfRoad = (x: number, z: number, margin: number) => {
      const e = roadEdge(x, z);
      return !e || e.d - e.w / 2 > margin;
    };
    const HY = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.13, 0.15, 0.55, 6).translate(0, 0.3, 0), 0xffffff),
      colored(new THREE.SphereGeometry(0.14, 6, 5).scale(1, 0.7, 1).translate(0, 0.6, 0), 0xffffff),
      colored(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 5).rotateZ(Math.PI / 2).translate(0, 0.44, 0), 0xffffff),
      colored(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 5).translate(0, 0.68, 0), 0xffffff),
    ]);
    const hydrants: THREE.Matrix4[] = [], hydCol: THREE.Color[] = [];
    for (const b of extras.mailboxes ?? []) {
      if (hash01(Math.floor(b.x * 7) ^ Math.floor(b.z * 13)) > 0.26) continue; // ~1 in 4 curbs
      const a = b.yaw + Math.PI / 2;
      const x = b.x + Math.sin(a) * 4.2, z = b.z + Math.cos(a) * 4.2;
      if (walk.blocked(x, z, 1.6) || !clearOfRoad(x, z, 0.8)) continue;
      hydrants.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), b.yaw), V(1, 1, 1)));
      hydCol.push(new THREE.Color(hash01(Math.floor(x * 5) ^ Math.floor(z * 5)) < 0.8 ? 0xb03024 : 0xd9a52c));
      walk.addLoop([[x - 0.14, z - 0.14], [x + 0.14, z - 0.14], [x + 0.14, z + 0.14], [x - 0.14, z + 0.14]], -Infinity, terrain.heightAt(x, z) + 0.7);
    }
    if (hydrants.length) {
      const im = new THREE.InstancedMesh(HY, propMaterial(), hydrants.length);
      hydrants.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, hydCol[i]); });
      im.layers.enable(1);
      group.add(im);
    }

    // Benches: real bench points, plus a rim of them inside plazas, parks, pitches and the
    // beach edge (seaward-facing there). They belong on pavement, so no paved check.
    const BEN = mergeGeometries([
      colored(new THREE.BoxGeometry(1.7, 0.08, 0.45).translate(0, 0.46, 0), 0xffffff),
      colored(new THREE.BoxGeometry(1.7, 0.4, 0.06).rotateX(-0.12).translate(0, 0.82, -0.22), 0xffffff),
      ...[-0.65, 0.65].flatMap((x) => [
        colored(new THREE.BoxGeometry(0.08, 0.46, 0.38).translate(x, 0.23, 0), 0x4a4239),
        colored(new THREE.BoxGeometry(0.08, 0.5, 0.06).translate(x, 0.7, -0.2), 0x4a4239),
      ]),
    ]);
    const benches: THREE.Matrix4[] = [], benCol: THREE.Color[] = [];
    const benchAt = (x: number, z: number, yaw: number) => {
      if (walk.blocked(x, z, 1.4) || !clearOfRoad(x, z, 1.6)) return;
      benches.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1)));
      benCol.push(new THREE.Color(rng.pick([0x8a6a4a, 0x9a8f80, 0x5d6e4f, 0x7a5b46])));
      walk.addLoop([[x - 0.85, z - 0.3], [x + 0.85, z - 0.3], [x + 0.85, z + 0.3], [x - 0.85, z + 0.3]], -Infinity, terrain.heightAt(x, z) + 0.9);
    };
    for (const p of json.points) if (p.c === 'bench') benchAt(p.x, p.z, rng.float() * 6.28);
    for (const a of json.areas) {
      if (!['plaza', 'grass', 'pitch', 'pool', 'beach', 'playground'].includes(a.c)) continue;
      const ring = a.o?.[0];
      if (!ring || ring.length < 8) continue;
      const pts = unpackPts(ring);
      const acx = pts.reduce((s, p) => s + p[0], 0) / pts.length, acz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const faceOut = a.c === 'beach'; // beach benches look at the water
      let along = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        along += L;
        if (along < 42) continue;
        along = 0;
        const rx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * 0.5, rz = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * 0.5;
        const cl = Math.hypot(acx - rx, acz - rz) || 1;
        const bx = rx + ((acx - rx) / cl) * 1.1, bz = rz + ((acz - rz) / cl) * 1.1; // a step inside the area, off any kerb
        const yaw = Math.atan2(acx - bx, acz - bz) + (faceOut ? Math.PI : 0);
        benchAt(bx, bz, yaw);
      }
    }
    if (benches.length) {
      const im = new THREE.InstancedMesh(BEN, propMaterial(), benches.length);
      benches.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, benCol[i]); });
      im.layers.enable(1);
      group.add(im);
    }

    // Bins: beside ~40% of benches, near plaza edges and a sprinkle at parking corners.
    const CAN = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.26, 0.24, 0.72, 7).translate(0, 0.38, 0), 0xffffff),
      colored(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 7).translate(0, 0.76, 0), 0x3a3d38),
      colored(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6).translate(0, 0.83, 0), 0x3a3d38),
    ]);
    const cans: THREE.Matrix4[] = [], canCol: THREE.Color[] = [];
    const canAt = (x: number, z: number) => {
      if (walk.blocked(x, z, 1.2) || !clearOfRoad(x, z, 1.0)) return;
      cans.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rng.float() * 6.28), V(1, 1, 1)));
      canCol.push(new THREE.Color(rng.pick([0x4a5548, 0x5a6166, 0x3e4a42, 0x6a6e5c])));
      walk.addLoop([[x - 0.2, z - 0.2], [x + 0.2, z - 0.2], [x + 0.2, z + 0.2], [x - 0.2, z + 0.2]], -Infinity, terrain.heightAt(x, z) + 0.85);
    };
    benches.forEach((m, i) => {
      if (i % 3 !== 0) return;
      const e = m.elements;
      const a = rng.float() * 6.28;
      canAt(e[12] + Math.sin(a) * 1.5, e[14] + Math.cos(a) * 1.5);
    });
    if (cans.length) {
      const im = new THREE.InstancedMesh(CAN, propMaterial(), cans.length);
      cans.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, canCol[i]); });
      im.layers.enable(1);
      group.add(im);
    }

    // Planters beside doors + hedge strips flanking the front walk — both need door data.
    if (extras.doors?.length) {
      const POT = mergeGeometries([
        colored(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 6).translate(0, 0.15, 0), 0xa9623f),
        blob(0.26, 0.42, 0, 0, 31),
      ]);
      const pots: THREE.Matrix4[] = [];
      const hedgeM: THREE.Matrix4[] = [], hedgeC: THREE.Color[] = [];
      for (const d of extras.doors) {
        const h0 = hash01(Math.floor(d.wx * 11) ^ Math.floor(d.wz * 17));
        const tx = -d.nz, tz = d.nx; // along the house front
        if (h0 < 0.2) {
          // planter pair tucked beside the door
          for (const s of h0 < 0.08 ? [-0.85, 0.85] : [h0 < 0.12 ? -0.8 : 0.8]) {
            const x = d.wx + d.nx * 0.7 + tx * s, z = d.wz + d.nz * 0.7 + tz * s;
            if (walk.blocked(x, z, 0.8)) continue;
            pots.push(new THREE.Matrix4().compose(V(x, terrain.heightAt(x, z), z), new THREE.Quaternion(), V(1, 0.9 + h0, 1)));
            walk.addLoop([[x - 0.16, z - 0.16], [x + 0.16, z - 0.16], [x + 0.16, z + 0.16], [x - 0.16, z + 0.16]], -Infinity, terrain.heightAt(x, z) + 0.6);
          }
        }
        if (h0 > 0.38 && h0 < 0.6 && !d.porch) {
          // Hedge run parallel to the front, split to leave the walk clear. Try the yard line
          // first (6 m out) then hug the foundation (2.4 m) — every point must be off pavement,
          // unblocked and at least 2.4 m inside the road edge so it can't land on a sidewalk.
          const LEN = 3.2;
          for (const D of [6.0, 2.4]) {
            let placed = 0;
            for (const s of [-2.8, 2.8]) {
              const hx = d.wx + d.nx * D + tx * s, hz = d.wz + d.nz * D + tz * s;
              const ax = hx - tx * LEN / 2, az = hz - tz * LEN / 2, bxx = hx + tx * LEN / 2, bz2 = hz + tz * LEN / 2;
              const ok = (x: number, z: number) => !walk.blocked(x, z, 1) && !paved(x, z) && clearOfRoad(x, z, 2.4);
              if (!ok(hx, hz) || !ok(ax, az) || !ok(bxx, bz2)) continue;
              hedgeM.push(new THREE.Matrix4().compose(V(hx, terrain.heightAt(hx, hz), hz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(tz, tx)), V(1, 1, 1)));
              hedgeC.push(new THREE.Color(rng.pick(green)).lerp(new THREE.Color(0x2e4630), 0.15));
              walk.addWall([ax, az], [bxx, bz2], -Infinity, terrain.heightAt(hx, hz) + 0.95);
              placed++;
            }
            if (placed) break; // one row only — foundation fallback fires when the yard is too shallow
          }
        }
      }
      if (pots.length) {
        const im = new THREE.InstancedMesh(POT, propMaterial(), pots.length);
        pots.forEach((m, i) => im.setMatrixAt(i, m));
        im.layers.enable(1);
        group.add(im);
      }
      if (hedgeM.length) {
        const im = new THREE.InstancedMesh(colored(hedgeGeo(), 0xffffff), propMaterial({ foliage: true }), hedgeM.length);
        hedgeM.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, hedgeC[i]); });
        im.layers.enable(1);
        group.add(im);
      }
    }
  }

  return { group, lampHeads, lampMap: lc, lampBox };
}
