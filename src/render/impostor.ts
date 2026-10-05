// Impostors: the small things of a street (a trash cart, a beach chair, a dock cleat) drawn past
// arm's length as one painted card each, thousands of them in a single draw.
//
// Each foundry piece is photographed once, in the browser, from N × N directions over the upper
// half of a sphere (a hemi-octahedral grid: the square's middle looks straight down, its rim runs
// round the horizon) into a texture atlas — its colour and coverage in one texture, its surface
// normal, depth and paintable (white) parts in another. At run time every far piece is a quad
// turned to face the eye. It finds the three pictures taken nearest its own view (a triangle of the
// grid), lays each back onto the quad along the true sight line (a plane through the piece's
// middle, as in Brucks' octahedral impostors) and mixes them by how near each was. The surface it
// shows is lit like the real piece: its normal turned by the piece's yaw, under the same sun,
// shadow map, lamp pools, snow and fog the painted props get (propMaterial). Its depth goes into
// the depth buffer, so it sits in the ground and behind posts where the real thing would, and the
// ink finds its outline.
//
// Close up the real 3D piece is drawn instead; across a band of a few metres the two trade places
// pixel by pixel on the same ordered dither (shared.ts dither4), so neither pops.
import * as THREE from 'three';
import { paintMaterial } from './shared';

export type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- view maths (pure, tested)

/** A direction in the upper hemisphere (y up) → the hemi-octahedral square, [-1, 1]². Below the
 *  horizon counts as on it. The square's corners are ±x and ±z, its rim the horizon, its middle
 *  straight up. */
export function hemiOctEncode(x: number, y: number, z: number): [number, number] {
  const s = Math.abs(x) + Math.max(y, 0) + Math.abs(z) || 1;
  const px = x / s, pz = z / s;
  return [px + pz, px - pz];
}
/** The square back to a unit direction. */
export function hemiOctDecode(u: number, v: number): V3 {
  const px = (u + v) / 2, pz = (u - v) / 2, y = Math.max(0, 1 - Math.abs(px) - Math.abs(pz));
  const L = Math.hypot(px, y, pz) || 1;
  return [px / L, y / L, pz / L];
}
/** The direction picture (i, j) of an N × N grid was taken from (piece toward its camera). */
export const frameDir = (i: number, j: number, N: number): V3 => hemiOctDecode((i / (N - 1)) * 2 - 1, (j / (N - 1)) * 2 - 1);
/** A picture's right and up as seen from direction d: right level (square to the world's up), up
 *  square to both; looking straight down, right is +x and up is −z (north). The bake and the
 *  card agree on this. */
export function frameBasis(d: V3): { r: V3; u: V3 } {
  let rx = d[2], rz = -d[0];
  const L = Math.hypot(rx, rz);
  if (L < 1e-4) (rx = 1), (rz = 0);
  else (rx /= L), (rz /= L);
  return { r: [rx, 0, rz], u: [d[1] * rz, d[2] * rx - d[0] * rz, -d[1] * rx] };
}
/** The three pictures nearest a view direction (piece-local, toward the eye) and how much of each:
 *  the grid cell it falls in, split along its diagonal, weighed barycentrically. The weights sum to
 *  1, and are continuous as the view moves from cell to cell. */
export function pickFrames(vx: number, vy: number, vz: number, N: number): { i: number[]; j: number[]; w: number[] } {
  const [u, v] = hemiOctEncode(vx, vy, vz);
  const gx = Math.min(N - 1, Math.max(0, (u * 0.5 + 0.5) * (N - 1))), gy = Math.min(N - 1, Math.max(0, (v * 0.5 + 0.5) * (N - 1)));
  const i0 = Math.min(Math.floor(gx), N - 2), j0 = Math.min(Math.floor(gy), N - 2), fx = gx - i0, fy = gy - j0;
  if (fx + fy < 1) return { i: [i0, i0 + 1, i0], j: [j0, j0, j0 + 1], w: [1 - fx - fy, fx, fy] };
  return { i: [i0 + 1, i0 + 1, i0], j: [j0 + 1, j0, j0 + 1], w: [fx + fy - 1, 1 - fy, 1 - fx] };
}
/** Where a point p (piece-local, from its middle), seen along the ray w (eye → piece), lands on the
 *  picture taken from d: the ray carried to that picture's plane, in its right / up, as a share of
 *  the radius R ([-1, 1]² inside the picture). Seen square on (w = −d) it is the picture's own
 *  projection of p. */
export function frameUV(p: V3, w: V3, d: V3, R: number): [number, number] {
  const b = frameBasis(d), t = dot(p, d) / Math.min(dot(w, d), -0.05);
  const X: V3 = [p[0] - w[0] * t, p[1] - w[1] * t, p[2] - w[2] * t];
  return [dot(X, b.r) / R, dot(X, b.u) / R];
}
/** A piece turned by yaw (THREE's rotation about y, as the props compose it): local → world… */
export const yawToWorld = (x: number, z: number, yaw: number): [number, number] => [Math.cos(yaw) * x + Math.sin(yaw) * z, -Math.sin(yaw) * x + Math.cos(yaw) * z];
/** …and back. */
export const yawToLocal = (x: number, z: number, yaw: number): [number, number] => [Math.cos(yaw) * x - Math.sin(yaw) * z, Math.sin(yaw) * x + Math.cos(yaw) * z];

// ---------------------------------------------------------------- the atlas layout

/** Where each piece's pictures sit: an N × N block of F-pixel pictures per piece (F a power of two,
 *  so the mip chain never mixes two pictures until a picture is a single texel), packed largest
 *  first on a grid of the smallest block. A piece with F = 0 (missing) gets no block. */
export interface AtlasLayout { N: number; W: number; H: number; blocks: { x: number; y: number; F: number }[] }
export function atlasLayout(Fs: number[], N: number, maxW: number): AtlasLayout {
  const sizes = Fs.map((F) => (F > 0 ? N * F : 0));
  const live = sizes.filter((s) => s > 0);
  const blocks = Fs.map((F) => ({ x: 0, y: 0, F: F > 0 ? F : 0 }));
  if (!live.length) return { N, W: 1, H: 1, blocks };
  const unit = Math.min(...live), big = Math.max(...live), area = live.reduce((a, s) => a + s * s, 0);
  let W = big;
  while (W * W < area && W * 2 <= maxW) W *= 2;
  W = Math.max(W, big);
  const cols = Math.floor(W / unit), used: boolean[][] = [];
  const free = (cx: number, cy: number, n: number) => {
    for (let y = cy; y < cy + n; y++) for (let x = cx; x < cx + n; x++) if (x >= cols || used[y]?.[x]) return false;
    return true;
  };
  let H = 0;
  const order = sizes.map((s, k) => [s, k]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [s, k] of order) {
    const n = s / unit;
    let done = false;
    for (let cy = 0; !done; cy += n)
      for (let cx = 0; cx + n <= cols && !done; cx += n)
        if (free(cx, cy, n)) {
          for (let y = cy; y < cy + n; y++) for (let x = cx; x < cx + n; x++) (used[y] ??= [])[x] = true;
          blocks[k].x = cx * unit;
          blocks[k].y = cy * unit;
          H = Math.max(H, (cy + n) * unit);
          done = true;
        }
  }
  return { N, W, H, blocks };
}
/** GPU memory the atlas holds: two RGBA8 textures with their mip chains. */
export const atlasBytes = (L: Pick<AtlasLayout, 'W' | 'H'>) => Math.round(L.W * L.H * 4 * 2 * (4 / 3));
/** The pictures' gutter: the sphere fills the middle 7/8 of each picture, so filtering at a
 *  picture's edge (to the mip where a picture is 4 texels) reads only its own empty rim. */
export const GUTTER = 1 / 16;
/** Where a piece of radius R hands over from its 3D model to its impostor: where a texel of its
 *  pictures covers about a pixel of the frame (pxK: pixels per metre at 1 m), kept in [lo, hi]. */
export const handoverAt = (R: number, F: number, pxK: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, (2 * R * pxK) / (F * (1 - 2 * GUTTER))));
/** The deepest mip a card reads: a picture 4 texels across. */
export const maxLodOf = (F: number) => Math.max(0, Math.log2(F) - 2);

/** A piece's bounding sphere (the middle its pictures are centred on, the radius they frame). */
export function sphereOf(g: THREE.BufferGeometry): [number, number, number, number] {
  g.computeBoundingBox();
  const b = g.boundingBox!, c = b.getCenter(new THREE.Vector3());
  const p = g.getAttribute('position');
  let r2 = 0;
  for (let i = 0; i < p.count; i++) r2 = Math.max(r2, (p.getX(i) - c.x) ** 2 + (p.getY(i) - c.y) ** 2 + (p.getZ(i) - c.z) ** 2);
  return [c.x, c.y, c.z, Math.sqrt(r2) * 1.02 + 0.005];
}

const HEMI_GLSL = /* glsl */ `
vec3 hemiOctDecode(vec2 e) {
  vec2 p = vec2(e.x + e.y, e.x - e.y) * 0.5;
  return normalize(vec3(p.x, max(0.0, 1.0 - abs(p.x) - abs(p.y)), p.y));
}
vec2 hemiOctEncode(vec3 d) {
  vec2 p = vec2(d.x, d.z) / (abs(d.x) + max(d.y, 0.0) + abs(d.z) + 1e-6);
  return vec2(p.x + p.y, p.x - p.y);
}
void frameBasis(vec3 d, out vec3 r, out vec3 u) {
  r = vec3(d.z, 0.0, -d.x);
  float L = length(r);
  r = L < 1e-4 ? vec3(1.0, 0.0, 0.0) : r / L;
  u = cross(d, r);
}
vec2 octEncode(vec3 n) {
  n /= abs(n.x) + abs(n.y) + abs(n.z);
  return n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
}
vec3 octDecode(vec2 f) {
  vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  float t = max(-n.z, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}
`;

/** The photographer: draws one piece from every grid direction at once (an instance per picture)
 *  into a block-sized target — colour (√, so dark paints keep their steps in 8 bits) and coverage;
 *  normal (octahedral, piece-local), depth toward the camera and the paintable (white) parts. */
function bakeMaterial() {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uFrame: { value: new THREE.Vector4() }, uSphere: { value: new THREE.Vector4() } },
    vertexShader: /* glsl */ `
      uniform vec4 uFrame; // N, F, gutter share, block px
      uniform vec4 uSphere; // the piece's middle, radius
      in vec3 color;
      out vec3 vCol;
      out vec3 vNrm;
      out float vDepth;
      ${HEMI_GLSL}
      void main() {
        float N = uFrame.x, F = uFrame.y, g = uFrame.z * F, B = uFrame.w, id = float(gl_InstanceID);
        float i = mod(id, N), j = floor(id / N);
        vec3 D = hemiOctDecode(vec2(i, j) / (N - 1.0) * 2.0 - 1.0), R, U;
        frameBasis(D, R, U);
        vec3 p = (position - uSphere.xyz) / uSphere.w;
        vec3 q = vec3(dot(p, R), dot(p, U), dot(p, D));
        vec2 px = vec2(i, j) * F + g + (q.xy * 0.5 + 0.5) * (F - 2.0 * g);
        gl_Position = vec4(px / B * 2.0 - 1.0, -q.z * 0.98, 1.0);
        vCol = color;
        vNrm = normal;
        vDepth = q.z * 0.5 + 0.5;
      }`,
    fragmentShader: /* glsl */ `
      layout(location = 0) out highp vec4 oAlbedo;
      layout(location = 1) out highp vec4 oNormal;
      in vec3 vCol;
      in vec3 vNrm;
      in float vDepth;
      ${HEMI_GLSL}
      void main() {
        oAlbedo = vec4(sqrt(clamp(vCol, 0.0, 1.0)), 1.0);
        vec3 n = normalize(vNrm);
        if (!gl_FrontFacing) n = -n;
        oNormal = vec4(octEncode(n) * 0.5 + 0.5, clamp(vDepth, 0.0, 1.0), step(0.98, min(vCol.r, min(vCol.g, vCol.b))));
      }`,
    side: THREE.DoubleSide,
  });
}
/** Copies a baked block into its place in the atlas (both textures in one pass). */
function copyMaterial() {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uA: { value: null }, uN: { value: null }, uRect: { value: new THREE.Vector4() }, uSize: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `
      uniform vec4 uRect; // x, y, size (px) in the atlas
      uniform vec2 uSize; // atlas px
      void main() { gl_Position = vec4((uRect.xy + (position.xy * 0.5 + 0.5) * uRect.z) / uSize * 2.0 - 1.0, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      layout(location = 0) out highp vec4 oAlbedo;
      layout(location = 1) out highp vec4 oNormal;
      uniform sampler2D uA, uN;
      uniform vec4 uRect;
      void main() {
        ivec2 t = ivec2(gl_FragCoord.xy - uRect.xy);
        oAlbedo = texelFetch(uA, t, 0);
        oNormal = texelFetch(uN, t, 0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * The pictures of a set of pieces, baked on the GPU a few pieces a frame (`bake`). A piece whose
 * model is missing (null) keeps no block and is never drawn as an impostor.
 */
export class ImpostorAtlas {
  readonly L: AtlasLayout;
  readonly target: THREE.WebGLRenderTarget; // textures[0] colour + coverage, [1] normal, depth, paintable
  readonly spheres: Float32Array; // 4 per piece: middle x y z, radius (0: none)
  private done: Uint8Array;
  private queue: number[] = [];
  private temp: THREE.WebGLRenderTarget | null = null;
  private bakeMat = bakeMaterial();
  private copyMat = copyMaterial();
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private geos: (THREE.InstancedBufferGeometry | null)[];
  /** bumped when a piece's pictures land (the layer refreshes its table) */
  version = 0;

  constructor(private renderer: THREE.WebGLRenderer, pieces: (THREE.BufferGeometry | null)[], Fs: number[], N: number, maxW: number) {
    const maxTex = renderer.capabilities?.maxTextureSize ?? maxW;
    this.L = atlasLayout(pieces.map((g, k) => (g ? Fs[k] : 0)), N, Math.min(maxW, maxTex));
    const { W, H } = this.L;
    this.target = new THREE.WebGLRenderTarget(W, H, { count: 2, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
    for (const t of this.target.textures) (t.generateMipmaps = true), (t.minFilter = THREE.LinearMipmapLinearFilter), (t.magFilter = THREE.LinearFilter);
    this.spheres = new Float32Array(pieces.length * 4);
    this.done = new Uint8Array(pieces.length);
    this.geos = pieces.map((g, k) => {
      if (!g || !g.getAttribute('position')?.count) return null;
      const src = g.index ? g.toNonIndexed() : g;
      if (!src.getAttribute('normal')) src.computeVertexNormals();
      this.spheres.set(sphereOf(src), k * 4);
      const ig = new THREE.InstancedBufferGeometry();
      ig.setAttribute('position', src.getAttribute('position'));
      ig.setAttribute('normal', src.getAttribute('normal'));
      ig.setAttribute('color', src.getAttribute('color') ?? new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 3).fill(1), 3));
      ig.instanceCount = N * N;
      this.queue.push(k);
      return ig;
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat);
    this.quad.frustumCulled = false;
    // (made now, while its textures still ask for mips: the storage is fixed when it's made, and a
    // bake turns the mip step off between pieces)
    renderer.initRenderTarget?.(this.target);
  }
  get pending() { return this.queue.length; }
  ready(k: number) { return this.done[k] === 1; }
  /** Count every piece as photographed without drawing anything (tests and tools with no GPU). */
  assumeBaked() {
    for (const k of this.queue) this.done[k] = 1;
    this.queue = [];
    this.version++;
  }
  /** Every piece again (the GPU lost its memory: a context restored). */
  rebake() {
    this.done.fill(0);
    this.queue = this.geos.map((g, k) => (g ? k : -1)).filter((k) => k >= 0);
    this.version++;
  }
  /** Photograph up to `n` pieces now. Returns how many are left. */
  bake(n = 4) {
    if (!this.queue.length) return 0;
    const r = this.renderer, L = this.L;
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.autoClear = false;
    r.setClearColor(0x000000, 0);
    // (the atlas generates its mips once, after the last piece of this batch lands)
    for (const t of this.target.textures) t.generateMipmaps = false;
    try {
      for (let c = 0; c < n && this.queue.length; c++) {
        const k = this.queue.shift()!, g = this.geos[k]!, blk = L.blocks[k], B = L.N * blk.F;
        if (!this.temp || this.temp.width < B) {
          this.temp?.dispose();
          this.temp = new THREE.WebGLRenderTarget(B, B, { count: 2, depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
        }
        const s = this.spheres;
        // 1. every picture of the piece into the scratch block (its lower corner; a clear takes
        // the whole target whatever the viewport)
        this.temp.viewport.set(0, 0, B, B);
        r.setRenderTarget(this.temp);
        r.clear(true, true, false);
        this.bakeMat.uniforms.uFrame.value.set(L.N, blk.F, GUTTER, B);
        this.bakeMat.uniforms.uSphere.value.set(s[k * 4], s[k * 4 + 1], s[k * 4 + 2], s[k * 4 + 3]);
        const m = new THREE.Mesh(g, this.bakeMat);
        m.frustumCulled = false;
        this.scene.add(m);
        r.render(this.scene, this.cam);
        this.scene.remove(m);
        // 2. the block into its place in the atlas
        if (!this.queue.length || c === n - 1) for (const t of this.target.textures) t.generateMipmaps = true;
        this.copyMat.uniforms.uA.value = this.temp.textures[0];
        this.copyMat.uniforms.uN.value = this.temp.textures[1];
        this.copyMat.uniforms.uRect.value.set(blk.x, blk.y, B, 0);
        this.copyMat.uniforms.uSize.value.set(L.W, L.H);
        r.setRenderTarget(this.target);
        this.scene.add(this.quad);
        r.render(this.scene, this.cam);
        this.scene.remove(this.quad);
        this.done[k] = 1;
        this.version++;
      }
    } finally {
      for (const t of this.target.textures) t.generateMipmaps = true;
      this.temp?.viewport.set(0, 0, this.temp.width, this.temp.height);
      r.setRenderTarget(prevRT);
      r.autoClear = prevAuto;
      r.setClearColor(prevColor, prevAlpha);
    }
    if (!this.queue.length && this.temp) (this.temp.dispose(), (this.temp = null));
    return this.queue.length;
  }
  dispose() {
    this.target.dispose();
    this.temp?.dispose();
    this.bakeMat.dispose();
    this.copyMat.dispose();
    for (const g of this.geos) g?.dispose();
  }
}

// ---------------------------------------------------------------- the cards

/** Per piece, the texels of the table the card shader reads (one row a piece):
 *  0: middle (piece-local x, y, z), radius · 1: block x, y (px), picture size F (px), gutter share ·
 *  2: hand-over distance, far distance (m), ready (0/1), deepest mip. */
export const KIND_TEXELS = 3;

/**
 * The impostor material: one instanced draw of quads. Per instance `aPos` (x, y, z in the region
 * frame, yaw) and `aInfo` (piece, scale, colour as 0xRRGGBB, flags: 1 = its 3D model draws its
 * share close up). `uKinds` is the table above; `uLod` = (crossfade band m, mode: 0 auto · 1 cards
 * only · 2 never hand over, pixels per metre at 1 m, -).
 */
export function impostorMaterial(atlas: ImpostorAtlas, kinds: THREE.DataTexture) {
  const L = atlas.L;
  return paintMaterial({
    uniforms: {
      uAlbedo: { value: atlas.target.textures[0] },
      uNormal: { value: atlas.target.textures[1] },
      uKinds: { value: kinds },
      uAtlas: { value: new THREE.Vector4(1 / L.W, 1 / L.H, L.N, 0) },
      uLod: { value: new THREE.Vector4(6, 0, 900, 0) },
    },
    vertex: /* glsl */ `
      attribute vec4 aPos;
      attribute vec4 aInfo;
      uniform highp sampler2D uKinds;
      uniform vec4 uAtlas;
      uniform vec4 uLod;
      varying vec4 vUV01;
      varying vec2 vUV2;
      flat varying vec3 vW; // the three pictures' weights
      flat varying vec3 vTint;
      flat varying vec4 vVY; // toward the eye (world), yaw
      flat varying vec4 vDC; // clip z, w per metre toward the eye; radius (m); mip level
      flat varying vec2 vShare; // the 3D piece's share here; this card's (far fade)
      varying vec2 vClipZW;
      ${HEMI_GLSL}
      vec2 frameUV(vec2 ij, vec3 p, vec3 w, float R, vec4 blk) {
        float N = uAtlas.z, F = blk.z, g = blk.w * F;
        vec3 D = hemiOctDecode(ij / (N - 1.0) * 2.0 - 1.0), Rf, Uf;
        frameBasis(D, Rf, Uf);
        vec3 X = p - w * (dot(p, D) / min(dot(w, D), -0.05));
        vec2 q = vec2(dot(X, Rf), dot(X, Uf)) / R;
        // (a sight line that leaves this picture reads its empty rim, never the next picture)
        q = clamp(q, vec2(-1.04), vec2(1.04));
        return (blk.xy + ij * F + g + (q * 0.5 + 0.5) * (F - 2.0 * g)) * uAtlas.xy;
      }
      vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void main() {
        int k = int(aInfo.x + 0.5);
        vec4 K0 = texelFetch(uKinds, ivec2(0, k), 0); // middle (local), radius
        vec4 K1 = texelFetch(uKinds, ivec2(1, k), 0); // block x, y (px), F, gutter share
        vec4 K2 = texelFetch(uKinds, ivec2(2, k), 0); // hand-over, far (m), ready, deepest mip
        float s = aInfo.y, yaw = aPos.w, c = cos(yaw), sn = sin(yaw);
        vec3 org = (modelMatrix * vec4(aPos.xyz, 1.0)).xyz;
        vec3 lc = K0.xyz * s;
        vec3 mid = org + vec3(c * lc.x + sn * lc.z, lc.y, -sn * lc.x + c * lc.z);
        // the hand-over is measured to the piece's foot, as its 3D model measures it (propMaterial FADE)
        float dist = length(cameraPosition - org);
        vec3 toEye = cameraPosition - mid;
        float dm = max(length(toEye), 1e-3);
        vec3 V = toEye / dm;
        float band = uLod.x, hasNear = mod(aInfo.w, 2.0);
        float share = hasNear > 0.5 ? clamp((K2.x + band * 0.5 - dist) / band, 0.0, 1.0) : 0.0;
        if (uLod.y > 0.5) share = uLod.y > 1.5 ? 1.0 : 0.0;
        float farF = clamp((K2.y - dist) / (0.12 * K2.y), 0.0, 1.0);
        if (share > 0.999 || farF <= 0.0 || K2.z < 0.5 || K0.w <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        // the card: square to the sight line, through the piece's middle, as wide as its sphere
        vec3 Rw = abs(V.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(V.z, 0.0, -V.x));
        vec3 Uw = cross(V, Rw);
        float R = K0.w * s;
        vec3 off = position.x * Rw + position.y * Uw;
        vec3 P = mid + off * R * 1.02;
        // the view in the piece's own frame: which pictures, and where this corner lands on each
        vec3 Vl = vec3(c * V.x - sn * V.z, V.y, sn * V.x + c * V.z);
        vec3 ol = vec3(c * off.x - sn * off.z, off.y, sn * off.x + c * off.z) * K0.w * 1.02;
        vec3 Vh = normalize(vec3(Vl.x, max(Vl.y, 0.0), Vl.z) + vec3(0.0, 1e-4, 0.0));
        float N = uAtlas.z;
        vec2 gxy = clamp((hemiOctEncode(Vh) * 0.5 + 0.5) * (N - 1.0), 0.0, N - 1.0);
        vec2 i0 = min(floor(gxy), vec2(N - 2.0)), f = gxy - i0;
        vec2 fa, fb, fc;
        if (f.x + f.y < 1.0) { fa = i0; fb = i0 + vec2(1.0, 0.0); fc = i0 + vec2(0.0, 1.0); vW = vec3(1.0 - f.x - f.y, f.x, f.y); }
        else { fa = i0 + vec2(1.0); fb = i0 + vec2(1.0, 0.0); fc = i0 + vec2(0.0, 1.0); vW = vec3(f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x); }
        vUV01 = vec4(frameUV(fa, ol, -Vl, K0.w, K1), frameUV(fb, ol, -Vl, K0.w, K1));
        vUV2 = frameUV(fc, ol, -Vl, K0.w, K1);
        // the mip level: the picture's texels per pixel of the frame
        float px = 2.0 * R * uLod.z / dm;
        float lod = clamp(log2(K1.z * (1.0 - 2.0 * K1.w) / max(px, 1e-3)), 0.0, K2.w);
        vec4 cp = projectionMatrix * viewMatrix * vec4(P, 1.0);
        gl_Position = cp;
        vClipZW = cp.zw;
        vec4 dc = projectionMatrix * viewMatrix * vec4(V, 0.0);
        vDC = vec4(dc.zw, R, lod);
        vShare = vec2(share, farF);
        vWorldPos = P + uWorldOffset;
        vNormalW = V;
        vVY = vec4(V, yaw);
        float rgb = aInfo.z;
        vec3 sr = vec3(floor(rgb / 65536.0), mod(floor(rgb / 256.0), 256.0), mod(rgb, 256.0)) / 255.0;
        vTint = srgbToLinear(sr);
      }`,
    fragment: /* glsl */ `
      uniform sampler2D uAlbedo, uNormal;
      varying vec4 vUV01;
      varying vec2 vUV2;
      flat varying vec3 vW;
      flat varying vec3 vTint;
      flat varying vec4 vVY;
      flat varying vec4 vDC;
      flat varying vec2 vShare;
      varying vec2 vClipZW;
      ${HEMI_GLSL}
      void main() {
        float lod = vDC.w;
        // the 3D piece draws where the dither is under its share, this card the rest; past the far
        // ring the card thins out the same way
        float d = dither4(gl_FragCoord.xy);
        if (d < vShare.x || d >= vShare.y) discard;
        vec4 a0 = textureLod(uAlbedo, vUV01.xy, lod), a1 = textureLod(uAlbedo, vUV01.zw, lod), a2 = textureLod(uAlbedo, vUV2, lod);
        float cov = a0.a * vW.x + a1.a * vW.y + a2.a * vW.z;
        if (cov < 0.5) discard;
        // (the pictures are premultiplied by their coverage — their empty texels are all zero — so
        // a weighted sum over the coverage is the colour, normal and depth at the silhouette too)
        vec4 n0 = textureLod(uNormal, vUV01.xy, lod), n1 = textureLod(uNormal, vUV01.zw, lod), n2 = textureLod(uNormal, vUV2, lod);
        vec3 alb = (a0.rgb * vW.x + a1.rgb * vW.y + a2.rgb * vW.z) / cov;
        alb *= alb;
        vec3 nl = (a0.a > 0.01 ? octDecode(n0.xy / a0.a * 2.0 - 1.0) * vW.x * a0.a : vec3(0.0))
          + (a1.a > 0.01 ? octDecode(n1.xy / a1.a * 2.0 - 1.0) * vW.y * a1.a : vec3(0.0))
          + (a2.a > 0.01 ? octDecode(n2.xy / a2.a * 2.0 - 1.0) * vW.z * a2.a : vec3(0.0));
        float depth = (n0.z * vW.x + n1.z * vW.y + n2.z * vW.z) / cov;
        float tint = (n0.w * vW.x + n1.w * vW.y + n2.w * vW.z) / cov;
        alb = mix(alb, alb * vTint, smoothstep(0.3, 0.7, tint));
        float c = cos(vVY.w), s = sin(vVY.w);
        vec3 N = normalize(vec3(c * nl.x + s * nl.z, nl.y, -s * nl.x + c * nl.z) + vec3(0.0, 1e-4, 0.0));
        // the surface's own depth: toward the eye from the card's plane
        float toward = (depth * 2.0 - 1.0) * vDC.z;
        vec3 wpos = vWorldPos + vVY.xyz * toward;
        vec2 zw = vClipZW + vDC.xy * toward;
        gl_FragDepth = clamp(zw.x / zw.y * 0.5 + 0.5, 0.0, 1.0);
        alb = snowOn(alb, N, wpos, 0.9);
        alb = pigment(alb, wpos);
        vec3 col = paintLight(alb, N, wpos, shadowAt(wpos, N), 1.0);
        gl_FragColor = vec4(applyFog(col, wpos), 1.0);
      }`,
  });
}

/** The card: a quad, corners ±1 (the shader turns it to the eye and sizes it to the piece), with
 *  room for `cap` instances. */
export function cardGeometry(cap: number) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  return g;
}
