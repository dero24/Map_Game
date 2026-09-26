// Shared uniforms + GLSL chunks for every painted material. Uniform objects are shared by reference,
// so updating U.* once per frame updates every material.
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) });
export const HOLE_MAX = 32;
const c3 = (hex: number) => ({ value: new THREE.Color(hex) });

export const U = {
  uTime: { value: 0 },
  uKeyDir: v3(0, 1, 0), // sun by day, moon by night
  uKeyColor: c3(0xffffff),
  uSunDir: v3(0, 1, 0),
  uSkyZenith: c3(0x6c95c8),
  uSkyHorizon: c3(0xd8e4ea),
  uAmbSky: c3(0x8fa6c0),
  uAmbGround: c3(0x9b8f78),
  uShadowTint: c3(0x5a63a8),
  uShadowTintAmt: { value: 0.35 },
  uFogColor: c3(0xd8e0e4),
  uFogSunColor: c3(0xffd9a8),
  uFogDensity: { value: 0.00035 },
  uFogFalloff: { value: 0.03 },
  uSeaFog: { value: 0 },
  uNight: { value: 0 },
  uGolden: { value: 0 },
  uWindowLit: { value: 0 },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 1 },
  uShadowTexel: { value: 1 / 2048 },
  uShadowStrength: { value: 0.8 },
  uLampMap: { value: null as THREE.Texture | null },
  uLampBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  // Floating origin: the world root renders shifted by -uWorldOffset so the camera stays near 0.
  // Shaders add it back where they need true region/world coords.
  uWorldOffset: { value: new THREE.Vector3() },
  uLampColor: c3(0xffb86a),
  uLampPower: { value: 0 },
  uPigment: { value: 0.22 },
  uPigmentScale: { value: 0.35 },
  uWind: { value: 0.5 },
  // Phase I biome wash for the ground: x = dryness (greens → straw/ochre), y = lushness,
  // z = cold/dark (boreal/polar greens). Set once per region from styles.ts.
  uBiome: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSliceBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  // footprint polygon of the building being visited: ground is cut away inside (below maxY)
  uHoleBox: { value: new THREE.Vector4() }, // x0 z0 x1 z1
  uHoleInfo: { value: new THREE.Vector4() }, // vertex count, maxY, enabled, -
  uHolePts: { value: Array.from({ length: HOLE_MAX }, () => new THREE.Vector2()) },
};
export type SharedUniforms = typeof U;

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise3(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }
`;

export const GLSL_SHARED = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vNormalW;
uniform float uTime;
uniform vec3 uKeyDir, uKeyColor, uSunDir, uSkyZenith, uSkyHorizon, uAmbSky, uAmbGround, uShadowTint;
uniform float uShadowTintAmt;
uniform vec3 uFogColor, uFogSunColor;
uniform float uFogDensity, uFogFalloff, uSeaFog, uNight, uGolden, uWindowLit;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn, uShadowTexel, uShadowStrength;
uniform sampler2D uLampMap;
uniform vec4 uLampBox;
uniform vec3 uLampColor;
uniform float uLampPower, uPigment, uPigmentScale, uWind;
uniform vec4 uBiome;
uniform vec4 uSliceBox;
uniform vec4 uHoleBox, uHoleInfo;
uniform vec2 uHolePts[${HOLE_MAX}];
${GLSL_NOISE}
bool inHole(vec3 p) {
  if (uHoleInfo.z < 0.5 || p.y > uHoleInfo.y) return false;
  if (p.x < uHoleBox.x || p.x > uHoleBox.z || p.z < uHoleBox.y || p.z > uHoleBox.w) return false;
  int n = int(uHoleInfo.x);
  bool inside = false;
  for (int i = 0; i < ${HOLE_MAX}; i++) {
    if (i >= n) break;
    vec2 a = uHolePts[i], b = uHolePts[i == 0 ? n - 1 : i - 1];
    if ((a.y > p.z) != (b.y > p.z) && p.x < (b.x - a.x) * (p.z - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
// Ordered 4x4 dither in [0,1) — used to cross-fade between painted and real window openings.
float bayer2(vec2 q) { return q.x < 0.5 ? (q.y < 0.5 ? 0.0 : 3.0) : (q.y < 0.5 ? 2.0 : 1.0); }
float dither4(vec2 fc) {
  vec2 q = mod(floor(fc), 4.0);
  return (bayer2(mod(q, 2.0)) * 4.0 + bayer2(floor(q / 2.0)) + 0.5) / 16.0;
}

float shadowAt(vec3 wpos, vec3 N) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(wpos + N * 0.12, 1.0);
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  // Brushed shadow edges: jitter the lookup with world-anchored noise.
  vec2 j = (vec2(vnoise(wpos.xz * 0.35 + wpos.y), vnoise(wpos.zx * 0.35 - wpos.y + 13.0)) - 0.5) * uShadowTexel * 1.8;
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    float d = textureLod(uShadowMap, p.xy + j + vec2(float(x), float(y)) * uShadowTexel * 1.25, 0.0).r;
    s += step(p.z - 0.00015, d);
  }
  s /= 9.0;
  vec2 e = min(p.xy, 1.0 - p.xy);
  float edgeFade = smoothstep(0.0, 0.06, min(e.x, e.y));
  return mix(1.0, s, uShadowStrength * edgeFade);
}

float lampAt(vec3 wpos) {
  if (uLampPower <= 0.001) return 0.0;
  vec2 uv = (wpos.xz - uLampBox.xy) * uLampBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  float h = clamp(1.0 - max(wpos.y - 1.5, 0.0) / 9.0, 0.0, 1.0);
  return texture2D(uLampMap, uv).r * uLampPower * h;
}

// Pigment turbulence (Bousseau et al.): density variation anchored to world space.
vec3 pigment(vec3 c, vec3 wpos) {
  float n = fbm3(wpos * uPigmentScale) - 0.5;
  float d = 1.0 + n * uPigment * 2.0;
  return clamp(c - (c - c * c) * (d - 1.0) * 1.6, 0.0, 4.0);
}

// Two-wash lighting: a light wash where the key light lands, one cool glaze where it doesn't.
// Wrapped terminator so low sun still warms horizontal ground (a painter's golden hour, not a photometer's).
vec3 paintLight(vec3 albedo, vec3 N, vec3 wpos, float shadow, float ao) {
  float ndl = dot(N, uKeyDir);
  float lowSun = 1.0 - smoothstep(0.05, 0.45, uKeyDir.y);
  float wrap = 0.3 + 0.25 * lowSun * step(0.7, N.y);
  float diff = smoothstep(-wrap, 0.55, ndl) * shadow;
  vec3 hemi = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 lit = albedo * (uKeyColor * diff + hemi * ao);
  lit = mix(lit, lit * uShadowTint * 1.8, (1.0 - diff) * uShadowTintAmt);
  lit += albedo * uLampColor * lampAt(wpos);
  return lit;
}

vec3 fogColorDir(vec3 dir) {
  float s = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  return mix(uFogColor, uFogSunColor, s * 0.6);
}
uniform vec3 uWorldOffset;
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 v = wpos - (cameraPosition + uWorldOffset);
  float d = length(v);
  float h = max(wpos.y, 0.0);
  float dens = uFogDensity * (1.0 + uSeaFog * 12.0 * exp(-h * 0.08)) ;
  float f = 1.0 - exp(-d * dens * exp(-h * uFogFalloff * (1.0 - uSeaFog * 0.7)));
  return mix(col, fogColorDir(v / max(d, 1e-3)), clamp(f, 0.0, 1.0));
}
`;

export const GLSL_VERT_COMMON = /* glsl */ `
uniform float uTime, uWind;
uniform vec3 uWorldOffset;
varying vec3 vWorldPos;
varying vec3 vNormalW;
mat4 worldMat() {
#ifdef USE_INSTANCING
  return modelMatrix * instanceMatrix;
#else
  return modelMatrix;
#endif
}
`;

// Helper to build a painted ShaderMaterial wired to the shared uniforms.
export function paintMaterial(opts: {
  vertex: string;
  fragment: string;
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number | boolean>;
  side?: THREE.Side;
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...(opts.uniforms ?? {}) },
    vertexShader: GLSL_VERT_COMMON + opts.vertex,
    fragmentShader: GLSL_SHARED + opts.fragment,
    defines: opts.defines ?? {},
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
    blending: opts.blending ?? THREE.NormalBlending,
  });
}

// Tiny helper for building sRGB palettes as linear THREE.Colors.
export const lin = (hex: number) => new THREE.Color(hex);
