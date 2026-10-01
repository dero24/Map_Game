// Shared uniforms + GLSL chunks for every painted material. Uniform objects are shared by reference,
// so updating U.* once per frame updates every material.
import * as THREE from 'three';
import { POOL, GLSL_POOL, FLOOR, GLSL_FLOOR } from './nightLight';

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
  uViewport: { value: new THREE.Vector2(1600, 900) }, // render-target pixels (post.ts setSize)
  uLampMap: { value: null as THREE.Texture | null },
  uLampBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  uLampBaseY: { value: 0 }, // ground height around the walker: lamp pools light the street, not roofs
  // a pool (nightLight.ts POOL): the lamp's height and the pool's reach in the map (both as painted
  // there), the heart's gain over the pool's colour, and the map's headroom
  uLampPool: { value: new THREE.Vector4(POOL.height, POOL.reach, POOL.gain, POOL.headroom) },
  uPoolColor: { value: new THREE.Vector3(...POOL.color) }, // the pools' light (linear): a warm cream
  // the night's floor (nightLight.ts FLOOR): the town's glow at street level, its colour (linear) and
  // strength; it goes with uNight, so it's nothing by day
  uNightFloor: { value: new THREE.Vector4(...FLOOR.color, FLOOR.strength) },
  // Paint-as-you-explore window (src/world/explore.ts): R8 paint amount per 8 m texel, box = x0 z0 1/w 1/h.
  uExplore: { value: null as THREE.Texture | null },
  uExploreBox: { value: new THREE.Vector4(0, 0, 1 / 4096, 1 / 4096) },
  // …and its coarse far window (~32 km, 64 m texels: the painted share of each 64 m cell, and what
  // photos painted far away), read past the fine one — only by the far sketch (postParams.sketchFar)
  uExploreFar: { value: null as THREE.Texture | null },
  uExploreFarBox: { value: new THREE.Vector4(0, 0, 1 / 32768, 1 / 32768) },
  // The painted ground's detail window round the walker (groundPaint.ts DetailGround.box, x0 z0
  // 1/w 1/h; main shares the live Vector4): the far street ribbons step aside inside it.
  uDetailBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  // Floating origin: the world root renders shifted by -uWorldOffset so the camera stays near 0.
  // Shaders add it back where they need true region/world coords.
  uWorldOffset: { value: new THREE.Vector3() },
  uLampColor: c3(0xffb86a), // (a warm note the sea's foam keeps, day and night; the pools' own light is uPoolColor)
  uLampPower: { value: 0 },
  uPigment: { value: 0.22 },
  uPigmentScale: { value: 0.35 },
  uWind: { value: 0.5 },
  // Season (world/season.ts, set per frame from the date and the place): snow cover on up-facing
  // ground, roofs and props; the share of broadleaf leaves that are down; autumn colour
  uSnow: { value: 0 },
  uLeafFall: { value: 0 },
  uAutumn: { value: 0 },
  uTurn: { value: 0 }, // season.ts turn: the autumn's progress, each tree turning at its own point
  uBloom: { value: 0 }, // spring blossom on the flowering trees (season.ts bloom)
  // Phase I biome wash for the ground: x = dryness (greens → straw/ochre), y = lushness,
  // z = cold/dark (boreal/polar greens). Set once per region from styles.ts.
  uBiome: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSliceBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  // footprint polygon of the building being visited: ground is cut away inside (below maxY)
  uHoleBox: { value: new THREE.Vector4() }, // x0 z0 x1 z1
  uHoleInfo: { value: new THREE.Vector4() }, // vertex count, maxY, enabled, -
  uHolePts: { value: Array.from({ length: HOLE_MAX }, () => new THREE.Vector2()) },
  // The brush (ui/brush.ts, drawn by post.ts): the world pales round the sketch (x, z, radius m,
  // amount); the sketch pass (on, line strength, -, -); a ripple ring on the water (x, z, radius m,
  // strength) as a painted thing dries.
  uBrush: { value: new THREE.Vector4(0, 0, 1, 0) },
  uGhost: { value: new THREE.Vector4(0, 0, 0, 0) },
  uRipple: { value: new THREE.Vector4(0, 0, 0, 0) },
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
uniform vec4 uLampBox, uLampPool;
uniform float uLampBaseY;
uniform vec3 uLampColor, uPoolColor;
uniform vec4 uNightFloor;
uniform float uLampPower, uPigment, uPigmentScale, uWind;
uniform float uSnow, uLeafFall, uAutumn, uTurn, uBloom;
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

// How much sky a street-level point loses between tall buildings (stream.ts paints the field
// into the lamp map's green channel): full near the ground, gone ~45 m up.
float canyonAt(vec3 wpos) {
  vec2 uv = (wpos.xz - uLampBox.xy) * uLampBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uLampMap, uv).g * (1.0 - smoothstep(0.0, 45.0, wpos.y - uLampBaseY));
}
// How much of the street's own light reaches a point: all of it up to 1.5 m over the local ground,
// none by 10.5 m — the lamps' pools and the night's floor light the street, not the roofs. (Relative
// to the local ground, not sea level: streamed towns sit on real (DEM) terrain, and an absolute clamp
// blacked out every pool more than ~10 m above the sea.)
float streetLevel(vec3 wpos) { return clamp(1.0 - max(wpos.y - uLampBaseY - 1.5, 0.0) / 9.0, 0.0, 1.0); }
${GLSL_POOL}
${GLSL_FLOOR}
// The street lamps' pools (0–1 of a lone heart) at a point: their light, added up in the lamp map —
// a pale glow under each lamp that dies away, meeting the next one's faintly (nightLight.ts).
float lampField(vec3 wpos) {
  vec2 uv = (wpos.xz - uLampBox.xy) * uLampBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return poolLight(texture2D(uLampMap, uv).r) * streetLevel(wpos);
}
float lampAt(vec3 wpos) {
  if (uLampPower <= 0.001) return 0.0;
  return lampField(wpos) * uLampPower * uLampPool.z;
}

// Pigment turbulence (Bousseau et al.): density variation anchored to world space.
vec3 pigment(vec3 c, vec3 wpos) {
  float n = fbm3(wpos * uPigmentScale) - 0.5;
  float d = 1.0 + n * uPigment * 2.0;
  return clamp(c - (c - c * c) * (d - 1.0) * 1.6, 0.0, 4.0);
}

// Snow on whatever faces the sky: patchy as it comes and goes (world-anchored drifts, so it never
// swims), full at uSnow 1. keep < 1 for surfaces that shed or get cleared (a ploughed road).
vec3 snowOn(vec3 alb, vec3 N, vec3 wpos, float keep) {
  if (uSnow < 0.002) return alb;
  float up = smoothstep(0.3, 0.85, N.y);
  float n = vnoise(wpos.xz * 0.21) * 0.6 + vnoise(wpos.xz * 1.7) * 0.4;
  float th = 1.0 - uSnow * keep;
  float cov = smoothstep(th - 0.07, th + 0.07, n) * up;
  // snow is blue-white; after dark it holds the sky's blue (a warm night wash turned it to sand)
  return mix(alb, mix(vec3(0.86, 0.89, 0.95), vec3(0.74, 0.81, 0.98), uNight), cov);
}
// How much snow a ground colour keeps: lawns and yards all of it; grey pavement is cleared —
// asphalt ploughed down to wet dark tracks, sidewalks shovelled to a patchy path.
float snowKeep(vec3 alb) {
  float lum = dot(alb, vec3(0.3, 0.59, 0.11));
  float sat = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
  float paved = 1.0 - smoothstep(0.025, 0.07, sat);
  return mix(1.0, mix(0.15, 0.55, smoothstep(0.14, 0.3, lum)), paved);
}

// Two-wash lighting: a light wash where the key light lands, one cool glaze where it doesn't.
// Wrapped terminator so low sun still warms horizontal ground (a painter's golden hour, not a photometer's).
// skyNeutral: how much of the sky fill's blue to grey out before it lights the albedo (roofs face
// the sky, and a blue fill turned every grey shingle teal) — the surface keeps its own hue, the
// sun keeps its colour, the shade keeps the cool glaze every other surface has
vec3 paintLight(vec3 albedo, vec3 N, vec3 wpos, float shadow, float ao, float skyNeutral) {
  float ndl = dot(N, uKeyDir);
  float lowSun = 1.0 - smoothstep(0.05, 0.45, uKeyDir.y);
  float wrap = 0.15 + 0.25 * lowSun * step(0.7, N.y);
  float diff = smoothstep(-wrap, 0.55, ndl) * shadow;
  vec3 hemi = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * (1.0 - 0.45 * canyonAt(wpos));
  hemi = mix(hemi, dot(hemi, vec3(0.2126, 0.7152, 0.0722)) * vec3(1.03, 1.0, 0.96), skyNeutral);
  vec3 lit = albedo * (uKeyColor * diff + hemi * ao);
  // shadows are a transparent cool glaze: shift the hue toward the shadow tint but keep the value
  // (multiplying by a dark tint is what painters call mud)
  float lt = dot(uShadowTint, vec3(0.2126, 0.7152, 0.0722));
  vec3 glaze = mix(vec3(1.0), uShadowTint / max(lt, 1e-3), 0.4);
  lit = mix(lit, lit * glaze, (1.0 - diff) * uShadowTintAmt);
  // a lamp pool is painted as light, not albedo × light (dark asphalt would halve every pool)
  lit += max(albedo, vec3(0.3)) * uPoolColor * lampAt(wpos);
  // …and between the pools the night's floor, the town's own glow (nothing by day)
  lit += nightFloor(albedo, streetLevel(wpos));
  return lit;
}
vec3 paintLight(vec3 albedo, vec3 N, vec3 wpos, float shadow, float ao) { return paintLight(albedo, N, wpos, shadow, ao, 0.0); }

vec3 fogColorDir(vec3 dir) {
  float s = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  return mix(uFogColor, uFogSunColor, s * 0.6);
}
uniform vec3 uWorldOffset;
// The mean of exp(−k·h) over a straight line from height a to b (exact: the air thins with
// height, and a sight line crosses every layer between the two ends).
float layerMean(float k, float a, float b) {
  float dh = b - a;
  return abs(k * dh) < 1e-3 ? exp(-k * 0.5 * (a + b)) : (exp(-k * a) - exp(-k * b)) / (k * dh);
}
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 v = wpos - (cameraPosition + uWorldOffset);
  float d = length(v);
  // heights above the ground you're standing on (not sea level): a mile-high town keeps its haze.
  // The haze thins upward, so what fogs a point is the air along the whole sight line to it —
  // from the eye's height to the point's — not the point's own low, thick layer taken the whole
  // way: from a balloon or a hill, distant streets were drowned under a flat white sheet while the
  // towers' tops rose clear out of it. (At street level, eye and point share a layer: as before.)
  float base = max(uLampBaseY, 0.0);
  float h = max(wpos.y - base, 0.0), he = max(wpos.y - v.y - base, 0.0);
  float k = uFogFalloff * (1.0 - uSeaFog * 0.7);
  float mean = layerMean(k, he, h) + uSeaFog * 12.0 * layerMean(k + 0.08, he, h);
  float f = 1.0 - exp(-d * uFogDensity * mean);
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

// The far layer (horizon.ts's ring, farSkyline.ts's towers) lies out past the camera's far plane:
// it keeps a depth of its own, linear in true distance to 150 km, so it sorts among itself and is
// never clipped. The far skyline clears that depth before the near world draws, which then paints
// over the whole layer as it always has.
export const FAR_DEPTH_M = 150000;
export const GLSL_FAR_DEPTH = /* glsl */ `
float farDepth(float d) { return min(d / ${FAR_DEPTH_M.toFixed(1)}, 0.9999) * 2.0 - 1.0; }
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
