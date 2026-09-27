// Terrain meshes (fine slice + coarse backdrop with a canopy bump for distant woods) and the ground material.
import * as THREE from 'three';
import type { World, TerrainLayer } from './data';
import { paintMaterial } from '../render/shared';
import type { GroundPaint } from './groundPaint';

// Terrain data texture: R height (m), G signed shore distance (m, + land), B ocean flag, A distance to ocean (m).
function layerTexture(L: TerrainLayer) {
  const { w, h } = L.g;
  const data = new Uint16Array(w * h * 4);
  const half = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = half(L.height[i] / 100);
    data[i * 4 + 1] = half(L.sdf[i] / 10);
    data[i * 4 + 2] = half(L.flags[i] & 2 ? 1 : 0);
    data[i * 4 + 3] = half(L.oceanD[i] * 2);
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
const boxUniform = (L: TerrainLayer) => new THREE.Vector4(L.g.x0, L.g.z0, 1 / (L.g.w * L.g.cell), 1 / (L.g.h * L.g.cell));

export interface TerrainTextures {
  uTerrS: { value: THREE.Texture };
  uTerrB: { value: THREE.Texture };
  uTerrSBox: { value: THREE.Vector4 };
  uTerrBBox: { value: THREE.Vector4 };
}
export function terrainTextures(world: World): TerrainTextures {
  const { slice, backdrop } = world.terrain;
  return {
    uTerrS: { value: layerTexture(slice) },
    uTerrB: { value: layerTexture(backdrop) },
    uTerrSBox: { value: boxUniform(slice) },
    uTerrBBox: { value: boxUniform(backdrop) },
  };
}
export const GLSL_TERRAIN = /* glsl */ `
uniform sampler2D uTerrS, uTerrB;
uniform vec4 uTerrSBox, uTerrBBox;
vec4 terrainAt(vec2 xz) {
  vec4 r = vec4(-8.0, -600.0, 1.0, 0.0);
  vec2 us = (xz - uTerrSBox.xy) * uTerrSBox.zw;
  vec2 ub = (xz - uTerrBBox.xy) * uTerrBBox.zw;
  if (us.x > 0.001 && us.y > 0.001 && us.x < 0.999 && us.y < 0.999) r = texture2D(uTerrS, us);
  else if (ub.x > 0.0 && ub.y > 0.0 && ub.x < 1.0 && ub.y < 1.0) r = texture2D(uTerrB, ub);
  return r;
}
`;

export interface GridSpec { x0: number; z0: number; x1: number; z1: number; step: number }

export function buildGrid(spec: GridSpec, heightFn: (x: number, z: number) => number, keepQuad: (x: number, z: number, h: number[]) => boolean, extra?: (x: number, z: number) => number) {
  const nx = Math.ceil((spec.x1 - spec.x0) / spec.step) + 1;
  const nz = Math.ceil((spec.z1 - spec.z0) / spec.step) + 1;
  const H = new Float32Array(nx * nz);
  const E = extra ? new Float32Array(nx * nz) : null;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = Math.min(spec.x1, spec.x0 + i * spec.step), z = Math.min(spec.z1, spec.z0 + j * spec.step);
      H[j * nx + i] = heightFn(x, z);
      if (E) E[j * nx + i] = extra!(x, z);
    }
  const pos: number[] = [], nrm: number[] = [], ext: number[] = [], idx: number[] = [];
  const map = new Int32Array(nx * nz).fill(-1);
  const vert = (i: number, j: number) => {
    const k = j * nx + i;
    if (map[k] >= 0) return map[k];
    const x = Math.min(spec.x1, spec.x0 + i * spec.step), z = Math.min(spec.z1, spec.z0 + j * spec.step);
    const hl = H[j * nx + Math.max(0, i - 1)], hr = H[j * nx + Math.min(nx - 1, i + 1)];
    const hu = H[Math.max(0, j - 1) * nx + i], hd = H[Math.min(nz - 1, j + 1) * nx + i];
    const n = new THREE.Vector3(hl - hr, 2 * spec.step, hu - hd).normalize();
    map[k] = pos.length / 3;
    pos.push(x, H[k], z);
    nrm.push(n.x, n.y, n.z);
    if (E) ext.push(E[k]);
    return map[k];
  };
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const x = spec.x0 + (i + 0.5) * spec.step, z = spec.z0 + (j + 0.5) * spec.step;
      const hs = [H[j * nx + i], H[j * nx + i + 1], H[(j + 1) * nx + i], H[(j + 1) * nx + i + 1]];
      if (!keepQuad(x, z, hs)) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  if (E) g.setAttribute('aCanopy', new THREE.Float32BufferAttribute(ext, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function buildGround(world: World, paint: GroundPaint, tt: TerrainTextures) {
  const { json, terrain } = world;
  const S = json.slice, B = json.backdrop;
  const group = new THREE.Group();
  group.name = 'ground';

  const mat = paintMaterial({
    uniforms: {
      ...tt,
      uPaintS: { value: paint.slice },
      uPaintB: { value: paint.backdrop },
      uPaintD: { value: paint.detail.texture },
      uPaintDBox: { value: paint.detail.box },
      uPaintM: { value: paint.mid.texture },
      uPaintMBox: { value: paint.mid.box },
      uPaintSBox: { value: new THREE.Vector4(S.x0, S.z0, 1 / (S.x1 - S.x0), 1 / (S.z1 - S.z0)) },
      uPaintBBox: { value: new THREE.Vector4(B.x0, B.z0, 1 / (B.x1 - B.x0), 1 / (B.z1 - B.z0)) },
    },
    vertex: /* glsl */ `
      attribute float aCanopy;
      varying float vCanopy;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normal;
        #ifdef CANOPY
        vCanopy = aCanopy;
        #else
        vCanopy = 0.0;
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      ${GLSL_TERRAIN}
      uniform sampler2D uPaintS, uPaintB, uPaintD, uPaintM;
      uniform vec4 uPaintSBox, uPaintBBox, uPaintDBox, uPaintMBox;
      varying float vCanopy;
      void main() {
        if (inHole(vWorldPos)) discard;
        vec3 N = normalize(vNormalW);
        vec2 xz = vWorldPos.xz;
        vec2 us = (xz - uPaintSBox.xy) * uPaintSBox.zw;
        vec3 alb;
        vec2 ub = (xz - uPaintBBox.xy) * uPaintBBox.zw;
        if (us.x > 0.0 && us.y > 0.0 && us.x < 1.0 && us.y < 1.0) alb = texture2D(uPaintS, us).rgb;
        else if (ub.x > 0.0 && ub.y > 0.0 && ub.x < 1.0 && ub.y < 1.0) alb = texture2D(uPaintB, ub).rgb;
        else alb = vec3(0.381, 0.445, 0.195); // past the bake: the town-lawn wash (the windows paint over it)
        // J1: the walker-centred windows paint baked AND streamed features everywhere —
        // mid (1.6 km: sidewalks, walks, markings), then detail (300 m: curbs, fine lines)
        vec2 um = (xz - uPaintMBox.xy) * uPaintMBox.zw;
        vec2 em = min(um, 1.0 - um);
        float wm = smoothstep(0.0, 0.06, min(em.x, em.y));
        if (wm > 0.0) alb = mix(alb, texture2D(uPaintM, um).rgb, wm);
        vec2 ud = (xz - uPaintDBox.xy) * uPaintDBox.zw;
        vec2 e = min(ud, 1.0 - ud);
        float wd = smoothstep(0.0, 0.08, min(e.x, e.y));
        if (wd > 0.0) alb = mix(alb, texture2D(uPaintD, ud).rgb, wd);
        // Phase I biome wash: greens dry toward straw/ochre (arid, Mediterranean summers),
        // saturate (tropics) or darken/cool (boreal) — painted land cover stays the source.
        float greenness = clamp((alb.g - max(alb.r, alb.b)) * 6.0, 0.0, 1.0);
        float lum0 = dot(alb, vec3(0.3, 0.59, 0.11));
        vec3 straw = vec3(lum0 * 1.32, lum0 * 1.12, lum0 * 0.72) * (0.92 + 0.16 * fbm(xz * 0.03 + 7.0));
        alb = mix(alb, straw, uBiome.x * greenness);
        alb = mix(alb, alb * vec3(0.9, 1.08, 0.86), uBiome.y * greenness);
        alb = mix(alb, alb * vec3(0.82, 0.88, 0.86), uBiome.z * greenness);
        float n1 = vnoise(xz * 0.9), n2 = fbm(xz * 0.06);
        alb *= 0.9 + 0.16 * n1 + 0.12 * (n2 - 0.5);
        // distant woods: lumpy canopy
        if (vCanopy > 0.01) {
          vec3 leaf = mix(vec3(0.10, 0.16, 0.06), vec3(0.22, 0.28, 0.10), fbm(xz * 0.05 + 3.0));
          leaf *= 0.75 + 0.5 * vnoise(xz * 0.18);
          alb = mix(alb, leaf, smoothstep(0.05, 0.6, vCanopy));
          N = normalize(N + vec3(vnoise(xz * 0.11) - 0.5, 0.0, vnoise(xz * 0.11 + 9.0) - 0.5) * 1.2);
        }
        float h = vWorldPos.y;
        vec4 T = terrainAt(xz);
        // wet sand just above the ocean waterline, darker bed below water
        float wet = smoothstep(1.1, 0.25, h) * step(0.5, T.b + step(T.w, 60.0));
        alb *= mix(1.0, 0.72, wet);
        alb = mix(alb, alb * vec3(0.62, 0.66, 0.6), smoothstep(0.0, -1.0, h));
        alb = pigment(alb, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, sh, 1.0);
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
  // the shared ground material — synthetic tiles pack 'gnd' chunks that resolve to it
  group.userData.groundMat = mat;
  const canopyMat = mat.clone();
  canopyMat.defines = { CANOPY: 1 };
  // clone() copies uniform values, not references: re-share the global ones.
  canopyMat.uniforms = mat.uniforms;

  // Fine slice terrain, chunked for culling. Skip open water far from shore (the water shader paints it).
  const CH = 400;
  const heightS = (x: number, z: number) => terrain.slice.heightAt(x, z);
  for (let cz = S.z0; cz < S.z1; cz += CH)
    for (let cx = S.x0; cx < S.x1; cx += CH) {
      const g = buildGrid({ x0: cx, z0: cz, x1: Math.min(S.x1, cx + CH), z1: Math.min(S.z1, cz + CH), step: 3 }, heightS, (x, z) => terrain.slice.sdfAt(x, z) > -45);
      if (!g.index || g.index.count === 0) continue;
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
    }

  // Coarse backdrop with canopy bump where WorldCover says trees (outside the instanced-tree zone).
  const L = terrain.backdrop;
  const treeZone = (x: number, z: number) => x > S.x0 - 250 && x < S.x1 + 250 && z > S.z0 - 250 && z < S.z1 + 250;
  const canopyAt = (x: number, z: number) => {
    if (treeZone(x, z)) return 0;
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) n += L.coverAt(x + dx * 12, z + dz * 12) === 10 ? 1 : 0;
    return n / 9;
  };
  const heightB = (x: number, z: number) => {
    const inside = x > S.x0 + 1 && x < S.x1 - 1 && z > S.z0 + 1 && z < S.z1 - 1;
    const h = terrain.heightAt(x, z);
    return inside ? h - 2.5 : h + canopyAt(x, z) * 11;
  };
  const CB = 1500;
  for (let cz = B.z0; cz < B.z1; cz += CB)
    for (let cx = B.x0; cx < B.x1; cx += CB) {
      const g = buildGrid(
        { x0: cx, z0: cz, x1: Math.min(B.x1, cx + CB), z1: Math.min(B.z1, cz + CB), step: 20 },
        heightB,
        (x, z) => {
          const inside = x > S.x0 + 25 && x < S.x1 - 25 && z > S.z0 + 25 && z < S.z1 - 25;
          return !inside && L.sdfAt(x, z) > -60;
        },
        canopyAt,
      );
      if (!g.index || g.index.count === 0) continue;
      group.add(new THREE.Mesh(g, canopyMat));
    }
  return group;
}
