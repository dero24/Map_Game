// Grass: a player-centred field of instanced tufts that grows where the land is open — lawns,
// verges, parks, fields — never on roads, sidewalks, driveways, buildings, sand, decks or water.
// Mown short near houses, tall and lush on open ground and in meadow patches (the odd wildflower),
// swaying with the shared wind. Deterministic per 24 m cell (position-hashed, no rng sequence), so
// the same verge looks the same every visit. Region style sets greens, density and dryness.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintMaterial } from '../render/shared';
import type { Road, Terrain } from './data';
import type { WalkWorld } from '../player/collision';
import { activeStyle, castOf } from './styles';
import { wildflowerMix, prairieMix, cordgrassCoast } from '../assets/flora';
import { WILDFLOWERS } from '../render/treeSeasons';
import { blob } from '../assets/core';
import { cropMix, fieldAt, CROPS, ROW, GLSL_CROPS, type Crop } from './fields';
import { roadNear } from './roadBounds';
import { underWood, type Crown } from './understory';

const CELL = 20;
const DESAT = 0.7;
// ESA WorldCover classes where wild (unmown) grass can stand: grassland, wetland, mangrove, moss
const WILD = new Set([30, 90, 95, 100]);
const RADIUS = 72; // metres of grass around the walker (fades out over the last ~25 m)
const PER_FRAME = 3; // cells built per frame
const MAIN = new Set(['primary', 'secondary', 'trunk', 'motorway', 'tertiary']);
const NEAR_MOVE = 25; // m walked before the nearby-streets list is redrawn
const HW_MAX = 60; // m — more than the widest reach a street's bare strip has from its line (w/2 + 3.8)

// Fresh greens per climate. They are desaturated ~30% at use (DESAT) so the grass shares the
// painted world's chroma budget: saturated blades read as a separate game pasted on top.
const LUSH: Record<string, number[]> = {
  temperate: [0x6fae3a, 0x5d9e34, 0x7fbf45, 0x4f8f2f, 0x8cc152, 0x66a83c],
  continental: [0x5f9e36, 0x4f8c30, 0x74b041, 0x6aa53a],
  boreal: [0x4f7f36, 0x5a8a3a, 0x46743a, 0x6a9442],
  polar: [0x7d8a5a, 0x8a946a, 0x6f7d52],
  mediterranean: [0x8fae4a, 0x9fb55a, 0x7a9e40, 0xb5b56a],
  arid: [0xc2a86a, 0xb89a5a, 0xa8a060, 0xd2bc80],
  tropical: [0x3f9e3a, 0x4fb040, 0x2f8f34, 0x5cbf48, 0x46a83c],
};

// One tuft: seven curved blades around a clump centre, ~1 m tall before instance scaling.
// Vertex colour carries the blade height fraction in .r (0 base → 1 tip) for the shader gradient.
function tuftGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + i * 0.9;
    const r = 0.06 + (i % 3) * 0.05;
    const h = 0.75 + ((i * 37) % 10) / 18;
    const lean = 0.16 + ((i * 13) % 7) / 22;
    const w = 0.06;
    const pos: number[] = [], col: number[] = [];
    const segs = 2;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const P = (t: number, side: number) => {
      const bend = lean * t * t; // quadratic arc
      const ww = w * (1 - t * 0.92);
      return [ox + dx * bend + px * ww * side, h * t, oz + dz * bend + pz * ww * side];
    };
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const a0 = P(t0, -1), b0 = P(t0, 1), a1 = P(t1, -1), b1 = P(t1, 1);
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      col.push(t0, 0, 0, t0, 0, 0, t1, 0, 0, t0, 0, 0, t1, 0, 0, t1, 0, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  // soft, upward-biased normals: grass reads as a lit mass, not a pile of paper strips
  const n = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < n.length; i += 3) (n[i] = 0), (n[i + 1] = 1), (n[i + 2] = 0);
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

export function grassMaterial() {
  return paintMaterial({
    side: THREE.DoubleSide,
    // Blades write depth (so they sort) and alpha 0: the post pass reads scene alpha as a
    // "foliage" mask, so the ink never scribbles over blades and Kuwahara softens them.
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aKind;
      uniform float uSnow;
      flat varying float vKind;
      flat varying float vSeed;
      varying float vT;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        vec3 p = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vT = color.r;
        vKind = aKind;
        vSeed = fract(sin(dot(origin.xz + uWorldOffset.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vTint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        // fade with distance by shrinking (no alpha sorting, no pop)
        float d = length(origin + uWorldOffset - (cameraPosition + uWorldOffset));
        vFade = 1.0 - smoothstep(${(RADIUS - 28).toFixed(1)}, ${(RADIUS - 4).toFixed(1)}, d);
        // under snow the tufts go (the ground shader paints the snow): a dusting leaves the tall
        // ones poking through
        p.y *= vFade * (1.0 - smoothstep(0.15, 0.7, uSnow));
        vec4 wp = m * vec4(p, 1.0);
        // wind: tips sway, bases stay put; gusts roll across the field
        float ph = dot(origin.xz + uWorldOffset.xz, vec2(0.13, 0.09));
        float gust = 0.5 + 0.5 * sin(uTime * 0.7 + ph * 0.6);
        float sway = (0.06 + 0.16 * uWind) * (0.5 + gust) * vT * vT;
        wp.x += sin(uTime * 1.9 + ph) * sway;
        wp.z += cos(uTime * 1.5 + ph * 1.3) * sway * 0.7;
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(vec3(0.0, 1.0, 0.0) + vec3(sin(ph), 0.0, cos(ph)) * 0.25);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      flat varying float vKind;
      flat varying float vSeed;
      varying float vT;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        vec3 N = normalize(vNormalW);
        // dark, damp base → sunlit tip; the instance tint carries the region's green (or a flower)
        // roots sink into the lawn wash (ground.ts lawn colour), tips carry the tint
        vec3 alb = mix(vec3(0.30, 0.34, 0.18), vTint, smoothstep(0.0, 0.55, vT)) * mix(0.75, 1.1, vT);
        // the summer-dry hills gone gold (season.ts hay): oat-straw by the tuft, the tips first, a
        // greener tuft here and there in a hollow
        float gold = uHay * smoothstep(0.15, 0.55, vnoise(vWorldPos.xz * 0.11) * 0.6 + 0.25 + 0.35 * vT);
        alb = mix(alb, vec3(0.74, 0.62, 0.36) * mix(0.8, 1.08, vT) * (0.92 + 0.16 * vnoise(vWorldPos.xz * 0.7)), gold);
        if (vKind > 2.5 && vKind < 3.5) {
          // smooth cordgrass (the salt marsh): a fresh yellow-green through the summer, gold-tan as the
          // fall comes on, the tips first, a tawny straw through the winter (the marsh's colour then)
          alb *= vec3(1.02, 1.04, 0.86);
          float turn = smoothstep(0.02, 0.5, uTurn + 0.5 * uLeafFall) * smoothstep(0.05, 0.5, vT + 0.25);
          alb = mix(alb, vec3(0.76, 0.62, 0.36) * mix(0.8, 1.08, vT), turn);
          alb = mix(alb, vec3(0.62, 0.52, 0.38) * mix(0.82, 1.04, vT), 0.75 * smoothstep(0.5, 1.0, uLeafFall));
        } else if (vKind > 0.5 && vKind < 2.5) {
          // the prairie's bluestems (flora.ts prairieMix): blue-green through the summer, then as the
          // autumn turns the big bluestem copper-red and the little bluestem orange, tips first; a pale
          // bronze-tan through the winter
          alb *= vec3(0.9, 1.0, 1.08);
          vec3 fallC = vKind < 1.5 ? vec3(0.6, 0.28, 0.16) : vec3(0.8, 0.46, 0.18);
          float turn = smoothstep(0.02, 0.5, uTurn + 0.5 * uLeafFall) * smoothstep(0.05, 0.5, vT + 0.2);
          alb = mix(alb, fallC * mix(0.78, 1.1, vT), turn);
          alb = mix(alb, vec3(0.7, 0.58, 0.42) * mix(0.8, 1.05, vT), 0.6 * smoothstep(0.5, 1.0, uLeafFall));
        } else if (vKind > 9.5) {
          // a wildflower drift (treeSeasons.ts WILDFLOWERS): its heads on the tufts' tips in its own weeks
          float k = vKind - 10.0, bl = wildBloom(k, vSeed);
          alb = mix(alb, wildColour(k, fract(vSeed * 7.3)) * (0.92 + 0.16 * vnoise(vWorldPos.xz * 3.0)), bl * smoothstep(0.55, 0.85, vT));
        }
        alb *= 0.9 + 0.2 * vnoise(vWorldPos.xz * 1.7);
        alb = pigment(alb, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, mix(1.0, sh, 0.8), mix(0.55, 1.0, vT));
        // back-lit tips: looking toward the sun, the blades glow (the dreamy read)
        vec3 V = normalize(vWorldPos - (cameraPosition + uWorldOffset));
        float back = pow(max(dot(V, uSunDir), 0.0), 3.0) * vT * vT;
        col += alb * uKeyColor * back * (0.5 * sh + 0.1) * (1.0 - uNight);
        gl_FragColor = vec4(applyFog(col, vWorldPos), 0.0);
      }`,
  });
}

// (package #10) The crops (fields.ts): a corn row's segment — 2 m of it along +x, a wall of leaves either
// side of the stalks with a ragged top and its tassels over it; a soybean row's metre, a low, lumpy
// hedge. (The wheat is the grass's own tuft, wider.) Vertex colour .r the height fraction, .g 1 on a
// tassel or a head.
function cornRowGeo() {
  const pos: number[] = [], col: number[] = [], L = 2, segs = 5;
  const top = (k: number, side: number) => 0.86 + 0.14 * Math.abs(Math.sin(k * 2.7 + side * 1.3));
  for (const side of [-1, 1]) {
    const zz = side * 0.11;
    for (let k = 0; k < segs; k++) {
      const x0 = -L / 2 + (L * k) / segs, x1 = -L / 2 + (L * (k + 1)) / segs, t0 = top(k, side), t1 = top(k + 1, side);
      const a = [x0, 0, zz], b = [x1, 0, zz], c = [x1, t1, zz + side * 0.06], d = [x0, t0, zz + side * 0.06];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c);
      col.push(0, 0, 0, 0, 0, 0, t1, 0, 0, 0, 0, 0, t1, 0, 0, t0, 0, 0, 0, 0, 0, t1, 0, 0, 0, 0, 0, 0, 0, 0, t0, 0, 0, t1, 0, 0);
    }
  }
  // the tassels: a spike over each stalk, a third of a metre apart
  for (let i = 0; i < 6; i++) {
    const x = -L / 2 + (i + 0.5) * (L / 6), z = ((i % 2) - 0.5) * 0.08;
    pos.push(x - 0.03, 0.92, z, x + 0.03, 0.92, z, x, 1.08, z, x - 0.03, 0.92, z, x, 1.08, z, x + 0.03, 0.92, z);
    col.push(0.95, 1, 0, 0.95, 1, 0, 1, 1, 0, 0.95, 1, 0, 1, 1, 0, 0.95, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function soyRowGeo() {
  const g = blob(0.5, 4401, { detail: 0, lump: 0.35, squash: 1 }).scale(1.05, 0.8, 0.42).translate(0, 0.32, 0);
  const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) col[i * 3] = Math.max(0, Math.min(1, P.getY(i) / 0.72));
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}
/** The crops' geometries (corn's row segment, soybeans', wheat's tuft) — for the field and its tests. */
export const cropGeometries = () => ({ corn: cornRowGeo(), soy: soyRowGeo(), wheat: tuftGeo() });
/** The crops' material: each instance grown to its stage by the calendar (fields.ts GLSL_CROPS on
 *  uYear) — up from the bare ground, head-high, ripening, cut to stubble — and coloured by it. */
export function cropMaterial() {
  return paintMaterial({
    side: THREE.DoubleSide,
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aCrop;
      attribute float aField;
      uniform float uSnow, uYear;
      flat varying vec4 vStage;
      flat varying float vCrop;
      varying float vT;
      varying float vHead;
      varying vec3 vTint;
      ${GLSL_CROPS}
      void main() {
        vec3 p = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 st = cropStage(aCrop, aField);
        vStage = st; vCrop = aCrop; vT = color.r; vHead = color.g;
        vTint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        // (bare ground: nothing up yet; stubble: the cut stalks a hand high; under snow, nothing)
        if (st.w > 0.5 || uSnow > 0.6) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        float h = st.z > 0.5 ? (aCrop < 0.5 ? 0.14 : aCrop < 1.5 ? 0.06 : 0.12) : max(st.x, 0.04);
        p.y *= h;
        if (st.z > 0.5 && color.g > 0.5) p.y = 0.0; // (no tassels on stubble)
        vec4 wp = m * vec4(p, 1.0);
        // the wind: the tops sway, the wheat in waves rolling across the field
        float ph = dot(origin.xz + uWorldOffset.xz, vec2(0.11, 0.07));
        float gust = 0.5 + 0.5 * sin(uTime * 0.8 - ph * 0.9);
        float sway = (0.04 + 0.12 * uWind) * (0.4 + gust) * vT * vT * h;
        wp.x += sin(uTime * 1.7 + ph) * sway;
        wp.z += cos(uTime * 1.3 + ph * 1.2) * sway * 0.6;
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(vec3(0.0, 1.0, 0.0) + mat3(m) * normal * 0.4);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      flat varying vec4 vStage;
      flat varying float vCrop;
      varying float vT;
      varying float vHead;
      varying vec3 vTint;
      void main() {
        vec3 N = normalize(vNormalW);
        // green growing (the corn's darkest, the soybeans' fresher), ripening to its own colour —
        // the corn's tan, the soybeans' yellow and then brown, the wheat's gold — the stubble pale straw
        vec3 green = vCrop < 0.5 ? vec3(0.2, 0.34, 0.11) : vCrop < 1.5 ? vec3(0.27, 0.42, 0.13) : vec3(0.3, 0.45, 0.14);
        vec3 ripe = vCrop < 0.5 ? vec3(0.62, 0.52, 0.32) : vCrop < 1.5 ? mix(vec3(0.7, 0.58, 0.16), vec3(0.5, 0.36, 0.2), smoothstep(0.6, 1.0, vStage.y)) : vec3(0.8, 0.64, 0.26);
        vec3 alb = mix(green, ripe, vStage.y) * vTint;
        alb *= mix(0.62, 1.08, vT); // (dark down among the stalks, sunlit at the top)
        // the corn's tassels and the wheat's heads: straw-gold over the green
        if (vHead > 0.5 || (vCrop > 1.5 && vT > 0.78)) alb = mix(alb, vec3(0.86, 0.74, 0.4), vCrop > 1.5 ? 0.35 + 0.6 * vStage.y : 0.85);
        if (vStage.z > 0.5) alb = vec3(0.7, 0.62, 0.42) * (0.85 + 0.25 * vnoise(vWorldPos.xz * 2.0));
        // the stalks a shade darker in their lines, leaf by leaf lighter
        alb *= 0.9 + 0.2 * vnoise(vWorldPos.xz * 3.1 + vWorldPos.y * 2.0);
        if (vCrop < 0.5 && vHead < 0.5 && vStage.z < 0.5) {
          // the corn's wall broken into its plants: a stalk's dark line every third of a metre, its leaves
          // arching out in light flecks, and the top ragged with them
          alb *= 0.82 + 0.18 * smoothstep(0.0, 0.25, abs(fract((vWorldPos.x + vWorldPos.z) * 3.0) - 0.5) * 2.0);
          alb *= 0.9 + 0.25 * smoothstep(0.55, 0.8, vnoise3(vWorldPos * vec3(5.0, 2.2, 5.0)));
          if (vT > 0.8 && vnoise3(vWorldPos * 6.0) < (vT - 0.8) * 3.5) discard;
        }
        alb = pigment(alb, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, mix(1.0, sh, 0.8), mix(0.6, 1.0, vT));
        gl_FragColor = vec4(applyFog(col, vWorldPos), 0.0);
      }`,
  });
}

const hash = (x: number, z: number, k: number) => {
  let h = Math.imul(Math.floor(x * 7.31) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(Math.floor(z * 5.17) + k * 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};
// smooth value noise for patches (meadow vs lawn), 2 octaves
const vn = (x: number, z: number) => {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, 1), b = hash(xi + 1, zi, 1), c = hash(xi, zi + 1, 1), d = hash(xi + 1, zi + 1, 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

/** A wild (unmown) tuft's kind — pure: the field and the tests share it. A drift is a patch of the
 *  meadow where a third of the tufts flower (the rest of the meadow a scatter), mostly one species to a
 *  patch (`mix`: [WILDFLOWERS index, weight]); where the region has no drifts, the odd flower of the old
 *  five colours (`flower` with kind 0). Else on the prairie (`prairie`: flora.ts prairieMix) a tall tuft
 *  is a big bluestem (1) or a little one (2). `hgt`: the tuft's height (m). */
/** Whether a spot is salt marsh: the land cover's herbaceous wetland (ESA WorldCover 90) within 3 km of
 *  the sea, on land (a hair above the water's edge). Pure: the field and the tests share it. */
export function saltMarsh(cover: number, sdf: number, oceanDist: number) { return cover === 90 && oceanDist < 3000 && sdf > 0.3; }
/** A cordgrass tuft's height (m): the tall form along the water's edge and the creeks (a metre and more),
 *  the short form back on the high marsh (knee-high). */
export function cordgrassHeight(sdf: number, x: number, z: number) {
  return sdf < 6 ? 1.0 + hash(x, z, 14) * 0.7 : 0.35 + hash(x, z, 14) * 0.35;
}

export function wildTuft(x: number, z: number, hgt: number, mix: [number, number][], prairie: { big: number; little: number } | null): { flower: boolean; kind: number } {
  const drift = vn(x * 0.06 + 31, z * 0.06 - 17);
  const flower = hgt > 0.45 && hash(x, z, 8) < (mix.length ? (drift > 0.62 ? 0.34 : 0.025) : 0.035);
  if (flower && mix.length) {
    const u = hash(x, z, 16) < 0.8 ? vn(x * 0.02 - 5, z * 0.02 + 11) : hash(x, z, 17);
    const tot = mix.reduce((a, [, w]) => a + w, 0);
    let acc = 0;
    for (const [k, w] of mix) if (u * tot < (acc += w)) return { flower, kind: 10 + k };
    return { flower, kind: 10 + mix[mix.length - 1][0] };
  }
  if (!flower && prairie && hgt > 0.5) {
    const u = hash(x, z, 18);
    return { flower, kind: u < prairie.big ? 1 : u < prairie.big + prairie.little ? 2 : 0 };
  }
  return { flower, kind: 0 };
}

export class GrassField {
  readonly group = new THREE.Group();
  private geo = tuftGeo();
  private mat = grassMaterial();
  // (package #10: the crops in the fields)
  private cropGeos: Record<'corn' | 'soy' | 'wheat', THREE.BufferGeometry> = cropGeometries();
  private cropMat = cropMaterial();
  private cells = new Map<string, THREE.Object3D | null>();
  private queue: [number, number][] = [];
  // the streets that can touch a cell around the walker: the ring's 20k roads, sorted once per
  // 25 m walked (or when the tile set changes) instead of for every cell built
  private near: Road[] = [];
  private nearOf: Road[] | null = null;
  private nearX = Infinity;
  private nearZ = Infinity;
  enabled = true;
  density = 1; // user/perf knob

  constructor(
    private terrain: Terrain,
    private walk: WalkWorld,
    private roads: () => Road[],
    private mask?: (x0: number, z0: number, size: number) => { res: number; data: Uint8Array },
    /** the trees round a point (NearTrees.crownsNear): under a wood's closed canopy the floor is
     *  ferns, moss and needles (understory.ts), not lawn — the odd tuft only, dark */
    private crowns?: (x: number, z: number, r: number) => Crown[],
    /** the region's latitude (the northern Plains' spring wheat: fields.ts cropMix) */
    private lat = 40,
  ) {
    this.group.name = 'grass';
  }
  /** A cell's meshes away: its own geometries (the tufts' kinds, the crops') with it. */
  private drop(o: THREE.Object3D) {
    this.group.remove(o);
    o.traverse((c) => { if (c instanceof THREE.InstancedMesh) (c.dispose(), c.geometry.dispose()); });
  }

  /** Streamed tiles changed: rebuild cells so grass never grows through new roads/buildings. */
  invalidate() {
    for (const m of this.cells.values()) if (m) this.drop(m);
    this.cells.clear();
  }
  /** Only the cells a freshly mounted tile touches (its box + margin). */
  invalidateBox(b: { x0: number; z0: number; x1: number; z1: number }) {
    for (const [k, m] of this.cells) {
      const [cx, cz] = k.split('_').map(Number);
      const x0 = cx * CELL, z0 = cz * CELL;
      if (x0 + CELL < b.x0 - 50 || x0 > b.x1 + 50 || z0 + CELL < b.z0 - 50 || z0 > b.z1 + 50) continue;
      if (m) this.drop(m);
      this.cells.delete(k);
    }
  }

  update(x: number, z: number) {
    if (!this.enabled) { if (this.cells.size) this.invalidate(); return; }
    const c0x = Math.floor((x - RADIUS) / CELL), c1x = Math.floor((x + RADIUS) / CELL);
    const c0z = Math.floor((z - RADIUS) / CELL), c1z = Math.floor((z + RADIUS) / CELL);
    const want = new Set<string>();
    this.queue.length = 0;
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const mx = (cx + 0.5) * CELL, mz = (cz + 0.5) * CELL;
        if (Math.hypot(mx - x, mz - z) > RADIUS + CELL * 0.72) continue;
        const k = `${cx}_${cz}`;
        want.add(k);
        if (!this.cells.has(k)) this.queue.push([cx, cz]);
      }
    for (const [k, m] of this.cells) if (!want.has(k)) { if (m) this.drop(m); this.cells.delete(k); }
    this.queue.sort((a, b) => Math.hypot((a[0] + 0.5) * CELL - x, (a[1] + 0.5) * CELL - z) - Math.hypot((b[0] + 0.5) * CELL - x, (b[1] + 0.5) * CELL - z));
    if (this.queue.length) {
      const roads = this.roads();
      if (roads !== this.nearOf || Math.hypot(x - this.nearX, z - this.nearZ) > NEAR_MOVE) {
        // every cell built from here lies within RADIUS + a cell of the walker, and a road reaches
        // at most HW_MAX past its line
        const R = RADIUS + CELL + HW_MAX + NEAR_MOVE;
        this.near = roads.filter((r) => !r.br && roadNear(r, x - R, z - R, x + R, z + R, 0));
        this.nearOf = roads;
        this.nearX = x;
        this.nearZ = z;
      }
    }
    // nearest first, a few a frame — and never more than ~3 ms of them (a downtown cell asks the
    // walk world about every tuft; three of them in one frame was a visible stutter at speed)
    const t0 = performance.now();
    for (let i = 0; i < Math.min(PER_FRAME, this.queue.length); i++) {
      const [cx, cz] = this.queue[i];
      const m = this.build(cx, cz);
      this.cells.set(`${cx}_${cz}`, m);
      if (m) this.group.add(m);
      if (performance.now() - t0 > 3) break;
    }
  }

  private build(cx: number, cz: number): THREE.Object3D | null {
    const t = this.terrain, walk = this.walk, st = activeStyle();
    const x0 = cx * CELL, z0 = cz * CELL;
    // roads touching this cell (+ margin): the carriageway, sidewalk strip and driveways stay bare
    const segs: number[] = [];
    for (const r of this.near) {
      // carriageway + the sidewalk strip the ground painter draws (w+3, main roads w+7), for
      // streamed streets the painter mask doesn't know
      const main = MAIN.has(r.c);
      const hw = r.w / 2 + (r.c === 'footway' || r.c === 'path' || r.sw ? 0.5 : r.sv === 'driveway' || r.c === 'service' ? 0.8 : main ? 3.8 : 1.9);
      if (!roadNear(r, x0, z0, x0 + CELL, z0 + CELL, hw)) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
        if (Math.max(ax, bx) < x0 - hw || Math.min(ax, bx) > x0 + CELL + hw || Math.max(az, bz) < z0 - hw || Math.min(az, bz) > z0 + CELL + hw) continue;
        // (with its reach as a box: most tufts are ruled out by four comparisons)
        segs.push(ax, az, bx, bz, hw, Math.min(ax, bx) - hw, Math.max(ax, bx) + hw, Math.min(az, bz) - hw, Math.max(az, bz) + hw);
      }
    }
    const nearRoad = (x: number, z: number) => {
      for (let i = 0; i < segs.length; i += 9) {
        if (x < segs[i + 5] || x > segs[i + 6] || z < segs[i + 7] || z > segs[i + 8]) continue;
        const ax = segs[i], az = segs[i + 1], dx = segs[i + 2] - ax, dz = segs[i + 3] - az, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - ax - dx * u, z - az - dz * u) < segs[i + 4]) return true;
      }
      return false;
    };
    const [dry0, lush, cold] = st.biome;
    // (the summer-dry climates grow green, the season turns them gold in the shader: uHay)
    const dry = st.climate === 'mediterranean' ? dry0 * 0.25 : dry0;
    const greens = (LUSH[st.climate] ?? LUSH.temperate).map((h) => { const c = new THREE.Color(h), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); return c.setHSL(hsl.h, hsl.s * DESAT, hsl.l); });
    const straw = new THREE.Color(0xc2a86a);
    const flowers = [0xf4f1ea, 0xe8c547, 0xc8584f, 0x9a86c8, 0xf0a7b8].map((h) => new THREE.Color(h));
    // (package #9: the region's wildflower drifts, each in its season, and the prairie's bluestems —
    // flora.ts wildflowerMix, prairieMix; a tuft's kind rides its aKind: 0 grass, 1 big bluestem, 2
    // little bluestem, 10 + the WILDFLOWERS index)
    const place = castOf(st), MARSH = cordgrassCoast(place), WILD_MIX = wildflowerMix(place).map(([id, w]) => [WILDFLOWERS.findIndex((f) => f.id === id), w] as [number, number]).filter(([k]) => k >= 0), PRAIRIE = prairieMix(place);
    const kinds: number[] = [];
    const step = 0.62 / Math.sqrt(Math.max(0.2, this.density * (1 + lush * 0.4) * (1 - dry * 0.55)));
    const M = this.mask?.(x0, z0, CELL);
    const open = (x: number, z: number) => {
      if (!M) return true;
      const i = Math.min(M.res - 1, Math.max(0, Math.floor(((x - x0) / CELL) * M.res))), j = Math.min(M.res - 1, Math.max(0, Math.floor(((z - z0) / CELL) * M.res)));
      return M.data[j * M.res + i] === 1;
    };
    // Towns are mown: a cell with a street, a building within 25 m or built-up land cover only
    // grows lawn. Meadow (mid/tall) grass needs open country and a wild land-cover class.
    const mx = x0 + CELL / 2, mz = z0 + CELL / 2;
    const built = segs.length > 0 || t.coverAt(mx, mz) === 50 || walk.blocked(mx, mz, 25);
    // a lawn reads as a texture, not countable tufts: denser, and tinted toward the lawn wash
    const lstep = built ? step * 0.8 : step;
    const lawnWash = new THREE.Color(0xa6b27a);
    const mats: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
    const C = this.crowns?.(x0 + CELL / 2, z0 + CELL / 2, CELL * 0.75 + 14) ?? [];
    const shade = new THREE.Color(0x4a5a2c);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let gz = z0; gz < z0 + CELL; gz += lstep)
      for (let gx = x0; gx < x0 + CELL; gx += lstep) {
        const x = gx + hash(gx, gz, 2) * lstep, z = gz + hash(gx, gz, 3) * lstep;
        // open land only (cheapest tests first: in a city most of a cell is paint the mask already
        // turned down, and asking the walk world about every one of those was a 10–19 ms cell)
        if (!open(x, z) || nearRoad(x, z)) continue;
        // (a salt marsh — the land cover's wetland by the sea — grows its cordgrass right down to the water)
        const sd = t.sdfAt(x, z), marsh = MARSH && saltMarsh(t.coverAt(x, z), sd, t.oceanDistAt(x, z));
        if (!marsh && (sd < 4 || t.oceanDistAt(x, z) < 70)) continue; // shore, sand, water
        const cov = t.coverAt(x, z);
        if (cov === 60 || cov === 70 || cov === 80) continue; // bare, snow/ice, open water
        if (cov === 40 && !built) continue; // (a field: its crops' rows, below — no lawn between them)
        if (walk.buildingAt(x, z) >= 0 || walk.blocked(x, z, 0.5) || walk.deckAt(x, z) !== null) continue;
        const wooded = C.length >= 3 && underWood(x, z, C);
        if (wooded && hash(x, z, 15) < 0.85) continue;
        // patchiness: meadow vs mown lawn vs bare-ish; lawns hug the houses
        const meadow = vn(x * 0.045, z * 0.045) * 0.7 + vn(x * 0.13 + 9, z * 0.13) * 0.3;
        const nearHouse = !marsh && (built || !WILD.has(cov) || walk.blocked(x, z, 7));
        // coverage: near-continuous; patchiness comes from height, not bare gaps
        if (hash(x, z, 4) > (nearHouse ? 0.97 : 0.8 + meadow * 0.2) - dry * 0.4) continue;
        // three height tiers (short / mid / tall): open ground is roughly half tall in lush places,
        // meadow patches taller still; lawns by the houses stay mown
        const roll = hash(x, z, 5);
        const tallP = (0.3 + meadow * 0.45) * (1 + lush * 0.3) * (1 - dry * 0.5);
        const tier = nearHouse ? 0.14 + hash(x, z, 13) * 0.16 : roll < tallP ? 0.6 + hash(x, z, 13) * 0.45 : roll < tallP + 0.3 ? 0.55 + hash(x, z, 13) * 0.35 : 0.25 + hash(x, z, 13) * 0.25;
        const hgt = marsh ? cordgrassHeight(sd, x, z) : Math.max(0.08, tier * (0.85 + hash(x, z, 14) * 0.3));
        // lawn tufts splay wide and low (a carpet); meadow clumps stand tighter
        const wid = nearHouse ? 0.75 + hash(x, z, 6) * 0.35 : 0.8 + hash(x, z, 6) * 0.6;
        p.set(x, t.heightAt(x, z) - 0.02, z);
        q.setFromAxisAngle(up, hash(x, z, 7) * 6.283);
        s.set(wid, hgt, wid);
        mats.push(new THREE.Matrix4().compose(p, q, s));
        const { flower, kind } = marsh ? { flower: false, kind: 3 } : nearHouse ? { flower: false, kind: 0 } : wildTuft(x, z, hgt, WILD_MIX, PRAIRIE);
        if (kind === 1) {
          s.y *= 1.6; // (the big bluestem head-high: "turkeyfoot" over a rider's stirrups)
          mats[mats.length - 1].compose(p, q, s);
        }
        kinds.push(kind);
        const c = flower && !WILD_MIX.length ? flowers[Math.floor(hash(x, z, 9) * flowers.length)].clone() : greens[Math.floor(hash(x, z, 10) * greens.length)].clone();
        if (!(flower && !WILD_MIX.length)) {
          // lush by default; dry regions (and the odd seed head) go to straw
          c.lerp(straw, Math.min(1, dry * 0.85 + (hgt > 0.9 && hash(x, z, 12) < 0.25 ? 0.25 : 0) + hash(x, z, 11) * 0.06));
          c.multiplyScalar((1 - cold * 0.2) * (1 + lush * 0.12));
          c.offsetHSL(0, 0.04, nearHouse ? 0.03 : 0); // mown lawns read a touch brighter
          if (nearHouse) c.lerp(lawnWash, 0.35);
          if (wooded) c.lerp(shade, 0.6); // (the few under the canopy, in its shade)
        }
        cols.push(c);
      }
    const crops = built ? [] : this.crops(x0, z0, open, nearRoad);
    if (!mats.length && !crops.length) return null;
    const cell = new THREE.Group();
    if (mats.length) {
      // (each cell its own copy of the tuft, for its tufts' kinds: sixty vertices)
      const g = this.geo.clone();
      g.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(kinds), 1));
      const m = new THREE.InstancedMesh(g, this.mat, mats.length);
      m.renderOrder = 5;
      mats.forEach((mm, i) => { m.setMatrixAt(i, mm); m.setColorAt(i, cols[i]); });
      m.frustumCulled = false; // cells are small; the shader fade handles distance
      cell.add(m);
    }
    for (const c of crops) cell.add(c);
    return cell;
  }

  /** (package #10) A cell's crops (fields.ts): where the land is a field (WorldCover cropland), each
   *  field's crop in its rows — corn in 2 m segments, soybeans in 1 m, wheat as wide tufts — the rows
   *  running as its field's do. One mesh a crop. */
  private crops(x0: number, z0: number, open: (x: number, z: number) => boolean, nearRoad: (x: number, z: number) => boolean): THREE.InstancedMesh[] {
    const t = this.terrain, walk = this.walk;
    let any = false;
    for (let i = 0; i < 3 && !any; i++) for (let j = 0; j < 3 && !any; j++) any = t.coverAt(x0 + 3 + i * 7, z0 + 3 + j * 7) === 40;
    if (!any) return [];
    const mix = cropMix(castOf(activeStyle()), this.lat);
    const out: Record<'corn' | 'soy' | 'wheat', { m: THREE.Matrix4[]; n: number[]; k: number[]; c: THREE.Color[] }> = { corn: { m: [], n: [], k: [], c: [] }, soy: { m: [], n: [], k: [], c: [] }, wheat: { m: [], n: [], k: [], c: [] } };
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    const fld = fieldAt(x0 + CELL / 2, z0 + CELL / 2, mix), crop: Crop = fld.crop, geo = crop === 'corn' ? 'corn' : crop === 'soy' ? 'soy' : 'wheat';
    const row = ROW[crop], seg = crop === 'corn' ? 2 : crop === 'soy' ? 1 : 0.8, k = CROPS.indexOf(crop);
    // (the rows on the survey's grid: every field's rows line up with the next one's)
    const a0 = fld.dir === 0 ? z0 : x0, b0 = fld.dir === 0 ? x0 : z0;
    for (let a = (Math.floor(a0 / row) + 0.5) * row; a < a0 + CELL; a += row)
      for (let b = (Math.floor(b0 / seg) + 0.5) * seg; b < b0 + CELL; b += seg) {
        const x = fld.dir === 0 ? b : a, z = fld.dir === 0 ? a : b;
        if (x < x0 || z < z0 || t.coverAt(x, z) !== 40 || !open(x, z) || nearRoad(x, z) || t.sdfAt(x, z) < 4) continue;
        if (walk.buildingAt(x, z) >= 0 || walk.blocked(x, z, 0.8)) continue;
        // (corn head-high: 2.4–2.8 m; soybeans to the knee; wheat to the waist)
        const H = crop === 'corn' ? 2.4 + hash(x, z, 21) * 0.4 : crop === 'soy' ? 0.8 + hash(x, z, 21) * 0.2 : 0.85 + hash(x, z, 21) * 0.2;
        p.set(x, t.heightAt(x, z) - 0.03, z);
        q.setFromAxisAngle(up, (fld.dir === 0 ? 0 : Math.PI / 2) + (geo === 'wheat' ? hash(x, z, 22) * 6.28 : (hash(x, z, 22) - 0.5) * 0.08));
        s.set(geo === 'wheat' ? 1.5 : 1, H, geo === 'wheat' ? 1.5 : 1);
        const o = out[geo];
        o.m.push(new THREE.Matrix4().compose(p, q, s));
        o.n.push(fld.n);
        o.k.push(k);
        o.c.push(new THREE.Color(1, 1, 1).multiplyScalar(0.92 + hash(x, z, 23) * 0.16));
      }
    const meshes: THREE.InstancedMesh[] = [];
    for (const g of ['corn', 'soy', 'wheat'] as const) {
      const o = out[g];
      if (!o.m.length) continue;
      const geom = this.cropGeos[g].clone();
      geom.setAttribute('aField', new THREE.InstancedBufferAttribute(new Float32Array(o.n), 1));
      geom.setAttribute('aCrop', new THREE.InstancedBufferAttribute(new Float32Array(o.k), 1));
      const m = new THREE.InstancedMesh(geom, this.cropMat, o.m.length);
      m.renderOrder = 5;
      o.m.forEach((mm, i) => { m.setMatrixAt(i, mm); m.setColorAt(i, o.c[i]); });
      m.frustumCulled = false;
      m.name = `crops:${g}`;
      meshes.push(m);
    }
    return meshes;
  }
}
