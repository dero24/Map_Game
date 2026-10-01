// Terrain meshes (fine slice + coarse backdrop with a canopy bump for distant woods) and the ground material.
import * as THREE from 'three';
import type { World, TerrainLayer } from './data';
import { paintMaterial } from '../render/shared';
import { STONE_ALPHA, type GroundPaint } from './groundPaint';

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

/** The height of a buildGrid mesh at (x,z), for a grid on the global `step` lattice (a streamed
 *  tile's ground: box corners on multiples of 8 m) — the same two triangles per cell (a–c–b under
 *  the b–c diagonal, b–c–d over it). Whatever lies on the ground (the far road ribbons) rides this
 *  rather than the raw DEM between the lattice points, so a sag can't lift the ground through it. */
export function latticeHeight(heightFn: (x: number, z: number) => number, x: number, z: number, step = 8) {
  const fx = x / step, fz = z / step, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const x0 = i * step, z0 = j * step, x1 = x0 + step, z1 = z0 + step;
  const b = heightFn(x1, z0), c = heightFn(x0, z1);
  if (u + v <= 1) { const a = heightFn(x0, z0); return a + (b - a) * u + (c - a) * v; }
  const d = heightFn(x1, z1);
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

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
  // The coarse backdrop raises its wooded cells 11 m as a far-forest canopy — right for woods on
  // the horizon, wrong wherever a detail tile is mounted: there the trees are real instances and
  // the bump stood as a second, unwalkable hillside burying the houses (Rumson, beside the bake).
  // One texel per 1024 m cell over the backdrop: 128 = a detail tile is here (the canopy bump
  // drops back to the ground), 255 = a streamed cell with its own ground (synth.ts / realExtras,
  // DEM heights) is here (the backdrop steps aside altogether).
  const CC = 1024;
  const ci0 = Math.floor(B.x0 / CC), cj0 = Math.floor(B.z0 / CC);
  const cnx = Math.max(1, Math.floor(B.x1 / CC) - ci0 + 1), cnz = Math.max(1, Math.floor(B.z1 / CC) - cj0 + 1);
  const coverData = new Uint8Array(cnx * cnz);
  const cover = new THREE.DataTexture(coverData, cnx, cnz, THREE.RedFormat, THREE.UnsignedByteType);
  cover.magFilter = cover.minFilter = THREE.NearestFilter;
  cover.needsUpdate = true;
  group.userData.setDetailCells = (cells: Map<string, 128 | 255>) => {
    coverData.fill(0);
    for (const [k, val] of cells) {
      const [i, j] = k.split('_').map(Number);
      const u = i - ci0, v = j - cj0;
      if (u >= 0 && v >= 0 && u < cnx && v < cnz) coverData[v * cnx + u] = Math.max(coverData[v * cnx + u], val);
    }
    cover.needsUpdate = true;
  };

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
      uStreamed: { value: cover },
      uStreamedBox: { value: new THREE.Vector4(ci0 * CC, cj0 * CC, 1 / (cnx * CC), 1 / (cnz * CC)) },
    },
    vertex: /* glsl */ `
      attribute float aCanopy;
      varying float vCanopy;
      uniform sampler2D uStreamed;
      uniform vec4 uStreamedBox;
      void main() {
        vec3 p = position;
        vCanopy = 0.0;
        #ifdef CANOPY
          // a detail tile is mounted in this cell: its trees are real — the canopy bump (and its
          // leaf colour) goes, and this is plain ground
          vec2 sc = (p.xz - uStreamedBox.xy) * uStreamedBox.zw; // positions are region metres
          float drop = sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0 && texture2D(uStreamed, sc).r > 0.3 ? 1.0 : 0.0;
          p.y -= aCanopy * 11.0 * drop;
          vCanopy = aCanopy * (1.0 - drop);
        #endif
        vec4 wp = worldMat() * vec4(p, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normal;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      ${GLSL_TERRAIN}
      uniform sampler2D uPaintS, uPaintB, uPaintD, uPaintM;
      uniform vec4 uPaintSBox, uPaintBBox, uPaintDBox, uPaintMBox;
      varying float vCanopy;
      uniform sampler2D uStreamed;
      uniform vec4 uStreamedBox;
      // One octave of value noise at wavelength lam (m), kept only where it spans a few pixels
      // (fp: metres a pixel): finer, it would shimmer as you walk, and the brush would wipe it anyway.
      float octv(vec2 p, float lam, float fp) { return (vnoise(p / lam) - 0.5) * smoothstep(1.8, 4.5, lam / fp); }
      // Loose stone: a pebble per cell (c m) of a jittered grid — its shade (x) and how far in from
      // the gap round it (y, 0 on the gap)
      vec2 pebble(vec2 p, float c) {
        vec2 g = floor(p / c), f = p / c - g;
        float d1 = 9.0, d2 = 9.0, id = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j)), cg = g + o;
          vec2 r = o + vec2(hash12(cg), hash12(cg + 17.31)) * 0.76 + 0.12 - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; id = hash12(cg + 5.13); } else if (d < d2) d2 = d;
        }
        return vec2(id, sqrt(d2) - sqrt(d1));
      }
      void main() {
        if (inHole(vWorldPos)) discard;
        #if defined(CANOPY) || defined(SLICE)
          // a streamed cell's own ground is here: the backdrop — and a virtual region's slice,
          // built from the resident terrain before any cell knew its water — steps aside (the
          // slice stood 1–3 m over Elliott Bay wherever a cell cut its sea away: a lawn)
          vec2 sc = (vWorldPos.xz - uStreamedBox.xy) * uStreamedBox.zw;
          if (sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0 && texture2D(uStreamed, sc).r > 0.75) discard; // 255 only (128 = canopy drop)
        #endif
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
        // (the fine window's alpha marks loose stone — a gravel or shell yard, a gravel drive)
        float stone = 0.0;
        if (wd > 0.0) {
          vec4 pD = texture2D(uPaintD, ud);
          alb = mix(alb, pD.rgb, wd);
          stone = wd * (1.0 - smoothstep(${(STONE_ALPHA + 0.1).toFixed(2)}, ${(STONE_ALPHA + 0.3).toFixed(2)}, pD.a));
        }
        // Phase I biome wash: greens dry toward straw/ochre (arid, Mediterranean summers),
        // saturate (tropics) or darken/cool (boreal) — painted land cover stays the source.
        float greenness = clamp((alb.g - max(alb.r, alb.b)) * 6.0, 0.0, 1.0);
        float lum0 = dot(alb, vec3(0.3, 0.59, 0.11));
        // mown lawn stipple: fine value texture where the ground is green (fades with distance)
        alb *= 1.0 - greenness * (0.07 - 0.1 * vnoise(xz * 6.0)) * (1.0 - smoothstep(25.0, 60.0, length(vWorldPos - (cameraPosition + uWorldOffset))));
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
        // The ground underfoot in its own grain. Near the walker what the paint says is there gets the
        // texture you'd see standing on it: concrete's flecks and stains and asphalt's aggregate, the
        // stones of a gravel or shell yard, a beach's ripples, footprints and wrack. Each octave only
        // where it spans a few pixels (octv), so it fades into the paint's own wash with distance and
        // height, and never shimmers.
        vec3 eyeW = cameraPosition + uWorldOffset;
        float camD = length(vWorldPos - eyeW);
        float fp = max(length(dFdx(xz)), length(dFdy(xz)));
        float lumS = dot(alb, vec3(0.3, 0.59, 0.11));
        float rel = (max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b))) / max(lumS, 0.04);
        // sand: warm and light (not a concrete's warm grey, not a yard's stone), by the sea
        float sandy = (1.0 - greenness) * (1.0 - stone) * smoothstep(0.28, 0.4, lumS) * smoothstep(0.38, 0.5, (alb.r - alb.b) / max(lumS, 0.04)) * (1.0 - step(250.0, T.a)) * step(0.5, T.g);
        if (camD < 60.0 && fp < 0.3) {
          // paved: the low-chroma greys (concrete, gutters, asphalt), darker ones a little more
          float paved = (1.0 - greenness) * (1.0 - stone) * (1.0 - sandy) * (1.0 - smoothstep(0.3, 0.42, rel));
          if (paved > 0.0) {
            float g = octv(xz, 0.045, fp) * 0.9 + octv(xz + 3.7, 0.12, fp) + octv(xz - 7.1, 0.32, fp) * 0.85 + octv(xz + 1.3, 0.9, fp) * 0.6;
            // a stain now and then (gum, drips, the rust off a bike): soft dark blots
            float stain = smoothstep(0.66, 0.86, vnoise(xz * 1.3 + 11.0)) * smoothstep(0.3, 0.75, vnoise(xz * 4.1 - 3.0)) * smoothstep(1.0, 3.0, 0.4 / fp);
            float k = mix(0.62, 0.46, smoothstep(0.12, 0.35, lumS));
            alb *= (1.0 + paved * g * k) * (1.0 - paved * stain * 0.16);
          }
          // loose stone: pebbles of 3.5 cm close up, 9 cm clumps a little further, a dappled wash past them
          if (stone > 0.0) {
            vec2 pa = pebble(xz, 0.035), pb = pebble(xz + 0.5, 0.09);
            float wa = smoothstep(2.2, 4.5, 0.035 / fp), wb = smoothstep(2.2, 4.5, 0.09 / fp) * (1.0 - wa * 0.6);
            float tone = 1.0 + wa * (pa.x - 0.5) * 0.5 + wb * (pb.x - 0.5) * 0.36 + octv(xz, 0.3, fp) * 0.3;
            float gap = wa * (1.0 - smoothstep(0.0, 0.22, pa.y)) * 0.42 + wb * (1.0 - smoothstep(0.0, 0.18, pb.y)) * 0.3;
            // (a shell yard's blue-grey mussel bits, a gravel yard's rust-brown stones)
            vec3 odd = lumS > 0.55 ? vec3(0.62, 0.68, 0.8) : vec3(1.12, 0.92, 0.72);
            vec3 stc = alb * tone * (1.0 - gap);
            stc = mix(stc, stc * odd, wa * step(0.86, fract(pa.x * 7.31)));
            alb = mix(alb, stc, stone);
          }
          // the town lawn's mown stipple, a little stronger close up (the blades stand over it)
          alb *= 1.0 - greenness * (octv(xz, 0.06, fp) * 0.22 + octv(xz + 2.0, 0.17, fp) * 0.16);
        }
        // Ocean beaches read as sand: wind ripples across the wind off the sea in the dry band, the
        // wrack line of weed and shell at the last high tide, footprints and trampled sand where people
        // walk. All from the shore distance field and the painted sand colour, so every coast gets its
        // own — strong enough to come through the brush.
        if (sandy > 0.0) {
          vec2 gN = vec2(terrainAt(xz + vec2(1.5, 0.0)).g - T.g, terrainAt(xz + vec2(0.0, 1.5)).g - T.g);
          vec2 sN = gN / max(length(gN), 1e-3);
          float dry = smoothstep(13.0, 18.0, T.g) * (1.0 - smoothstep(70.0, 90.0, T.g));
          // the long swells of the dry sand
          alb *= 1.0 + 0.035 * sin(dot(xz, sN) * 2.4 + fbm(xz * 0.2) * 4.0) * dry * sandy;
          if (camD < 60.0) {
            // its ripples: 11 cm crests across the wind, wandering (a gentle rise, a steep lee)
            float ph = dot(xz, sN) / 0.11 + fbm(xz * 1.6) * 3.0 + vnoise(xz * 0.35) * 4.0;
            float saw = fract(ph), rip = smoothstep(0.0, 0.7, saw) - smoothstep(0.7, 1.0, saw) * 1.6;
            float ripA = dry * (1.0 - smoothstep(0.22, 0.5, fp * 1.3 / 0.11)); // (crests under ~4 px apart: gone)
            alb *= 1.0 + sandy * 0.11 * (rip - 0.2) * ripA;
            // trampled sand: churned by feet between the dunes and the wet sand
            float tramp = smoothstep(11.0, 16.0, T.g) * (1.0 - smoothstep(90.0, 130.0, T.g));
            float churn = octv(xz, 0.05, fp) + octv(xz + 4.0, 0.14, fp) * 0.9 + octv(xz - 2.0, 0.38, fp) * 0.7;
            alb *= 1.0 + sandy * tramp * churn * 0.34;
            // footprints: a heel-and-toe pit, its shadowed side dark and its rim pushed up light
            vec2 fc = floor(xz / 0.62), ff = xz / 0.62 - fc;
            if (hash12(fc + 3.7) < 0.55 * tramp) {
              float a = hash12(fc + 9.1) * 6.2832, ca = cos(a), sa = sin(a);
              vec2 q = (ff - 0.5 - (vec2(hash12(fc + 1.3), hash12(fc + 2.9)) - 0.5) * 0.4) * 0.62;
              q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y) / vec2(0.13, 0.055);
              float r = length(q), vis = smoothstep(1.5, 4.0, 0.1 / fp);
              alb *= 1.0 - sandy * vis * (0.24 * (1.0 - smoothstep(0.7, 1.0, r)) * (0.6 + 0.4 * q.y) - 0.1 * smoothstep(0.85, 1.0, r) * (1.0 - smoothstep(1.0, 1.3, r)));
            }
          }
          // the wrack line: clumps of dark weed, broken, with pale shell bits through it
          float band = smoothstep(7.5, 9.0, T.g) * (1.0 - smoothstep(12.0, 14.0, T.g));
          if (band > 0.0) {
            float clump = smoothstep(0.42, 0.62, vnoise(xz * 1.1 + sN * 2.0)) * smoothstep(0.35, 0.6, vnoise(xz * 4.3));
            alb = mix(alb, vec3(0.16, 0.13, 0.07) * (0.8 + 0.5 * vnoise(xz * 9.0)), 0.75 * band * clump * sandy);
            alb = mix(alb, vec3(0.86, 0.83, 0.76), 0.5 * band * sandy * step(0.9, vnoise(xz * 13.0)) * smoothstep(1.5, 4.0, 0.08 / fp));
          }
        }
        // snow: lawns, yards and sidewalks take it; dark asphalt is ploughed down to slushy tracks
        alb = snowOn(alb, N, vWorldPos, snowKeep(alb));
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
  const sliceMat = mat.clone();
  sliceMat.defines = { SLICE: 1 };
  sliceMat.uniforms = mat.uniforms;

  // Fine slice terrain, chunked for culling. Skip open water far from shore (the water shader paints it).
  const CH = 400;
  const heightS = (x: number, z: number) => terrain.slice.heightAt(x, z);
  for (let cz = S.z0; cz < S.z1; cz += CH)
    for (let cx = S.x0; cx < S.x1; cx += CH) {
      const g = buildGrid({ x0: cx, z0: cz, x1: Math.min(S.x1, cx + CH), z1: Math.min(S.z1, cz + CH), step: 3 }, heightS, (x, z) => terrain.slice.sdfAt(x, z) > -45);
      if (!g.index || g.index.count === 0) continue;
      const m = new THREE.Mesh(g, sliceMat);
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
