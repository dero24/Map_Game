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
import { activeStyle } from './styles';
import { roadNear } from './roadBounds';

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

function grassMaterial() {
  return paintMaterial({
    side: THREE.DoubleSide,
    // Blades write depth (so they sort) and alpha 0: the post pass reads scene alpha as a
    // "foliage" mask, so the ink never scribbles over blades and Kuwahara softens them.
    vertex: /* glsl */ `
      attribute vec3 color;
      uniform float uSnow;
      varying float vT;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        vec3 p = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vT = color.r;
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
      varying float vT;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        vec3 N = normalize(vNormalW);
        // dark, damp base → sunlit tip; the instance tint carries the region's green (or a flower)
        // roots sink into the lawn wash (ground.ts lawn colour), tips carry the tint
        vec3 alb = mix(vec3(0.30, 0.34, 0.18), vTint, smoothstep(0.0, 0.55, vT)) * mix(0.75, 1.1, vT);
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

export class GrassField {
  readonly group = new THREE.Group();
  private geo = tuftGeo();
  private mat = grassMaterial();
  private cells = new Map<string, THREE.InstancedMesh | null>();
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
  ) {
    this.group.name = 'grass';
  }

  /** Streamed tiles changed: rebuild cells so grass never grows through new roads/buildings. */
  invalidate() {
    for (const m of this.cells.values()) if (m) { this.group.remove(m); m.dispose(); }
    this.cells.clear();
  }
  /** Only the cells a freshly mounted tile touches (its box + margin). */
  invalidateBox(b: { x0: number; z0: number; x1: number; z1: number }) {
    for (const [k, m] of this.cells) {
      const [cx, cz] = k.split('_').map(Number);
      const x0 = cx * CELL, z0 = cz * CELL;
      if (x0 + CELL < b.x0 - 50 || x0 > b.x1 + 50 || z0 + CELL < b.z0 - 50 || z0 > b.z1 + 50) continue;
      if (m) { this.group.remove(m); m.dispose(); }
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
    for (const [k, m] of this.cells) if (!want.has(k)) { if (m) { this.group.remove(m); m.dispose(); } this.cells.delete(k); }
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

  private build(cx: number, cz: number): THREE.InstancedMesh | null {
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
    const [dry, lush, cold] = st.biome;
    const greens = (LUSH[st.climate] ?? LUSH.temperate).map((h) => { const c = new THREE.Color(h), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); return c.setHSL(hsl.h, hsl.s * DESAT, hsl.l); });
    const straw = new THREE.Color(0xc2a86a);
    const flowers = [0xf4f1ea, 0xe8c547, 0xc8584f, 0x9a86c8, 0xf0a7b8].map((h) => new THREE.Color(h));
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
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let gz = z0; gz < z0 + CELL; gz += lstep)
      for (let gx = x0; gx < x0 + CELL; gx += lstep) {
        const x = gx + hash(gx, gz, 2) * lstep, z = gz + hash(gx, gz, 3) * lstep;
        // open land only (cheapest tests first: in a city most of a cell is paint the mask already
        // turned down, and asking the walk world about every one of those was a 10–19 ms cell)
        if (!open(x, z) || nearRoad(x, z)) continue;
        if (t.sdfAt(x, z) < 4 || t.oceanDistAt(x, z) < 70) continue; // shore, sand, water
        const cov = t.coverAt(x, z);
        if (cov === 60 || cov === 70 || cov === 80) continue; // bare, snow/ice, open water
        if (walk.buildingAt(x, z) >= 0 || walk.blocked(x, z, 0.5) || walk.deckAt(x, z) !== null) continue;
        // patchiness: meadow vs mown lawn vs bare-ish; lawns hug the houses
        const meadow = vn(x * 0.045, z * 0.045) * 0.7 + vn(x * 0.13 + 9, z * 0.13) * 0.3;
        const nearHouse = built || !WILD.has(cov) || walk.blocked(x, z, 7);
        // coverage: near-continuous; patchiness comes from height, not bare gaps
        if (hash(x, z, 4) > (nearHouse ? 0.97 : 0.8 + meadow * 0.2) - dry * 0.4) continue;
        // three height tiers (short / mid / tall): open ground is roughly half tall in lush places,
        // meadow patches taller still; lawns by the houses stay mown
        const roll = hash(x, z, 5);
        const tallP = (0.3 + meadow * 0.45) * (1 + lush * 0.3) * (1 - dry * 0.5);
        const tier = nearHouse ? 0.14 + hash(x, z, 13) * 0.16 : roll < tallP ? 0.6 + hash(x, z, 13) * 0.45 : roll < tallP + 0.3 ? 0.55 + hash(x, z, 13) * 0.35 : 0.25 + hash(x, z, 13) * 0.25;
        const hgt = Math.max(0.08, tier * (0.85 + hash(x, z, 14) * 0.3));
        // lawn tufts splay wide and low (a carpet); meadow clumps stand tighter
        const wid = nearHouse ? 0.75 + hash(x, z, 6) * 0.35 : 0.8 + hash(x, z, 6) * 0.6;
        p.set(x, t.heightAt(x, z) - 0.02, z);
        q.setFromAxisAngle(up, hash(x, z, 7) * 6.283);
        s.set(wid, hgt, wid);
        mats.push(new THREE.Matrix4().compose(p, q, s));
        const flower = !nearHouse && hgt > 0.55 && hash(x, z, 8) < 0.035;
        const c = flower ? flowers[Math.floor(hash(x, z, 9) * flowers.length)].clone() : greens[Math.floor(hash(x, z, 10) * greens.length)].clone();
        if (!flower) {
          // lush by default; dry regions (and the odd seed head) go to straw
          c.lerp(straw, Math.min(1, dry * 0.85 + (hgt > 0.9 && hash(x, z, 12) < 0.25 ? 0.25 : 0) + hash(x, z, 11) * 0.06));
          c.multiplyScalar((1 - cold * 0.2) * (1 + lush * 0.12));
          c.offsetHSL(0, 0.04, nearHouse ? 0.03 : 0); // mown lawns read a touch brighter
          if (nearHouse) c.lerp(lawnWash, 0.35);
        }
        cols.push(c);
      }
    if (!mats.length) return null;
    const m = new THREE.InstancedMesh(this.geo, this.mat, mats.length);
    m.renderOrder = 5;
    mats.forEach((mm, i) => { m.setMatrixAt(i, mm); m.setColorAt(i, cols[i]); });
    m.frustumCulled = false; // cells are small; the shader fade handles distance
    return m;
  }
}
