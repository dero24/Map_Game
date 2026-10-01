// Night, laid the way a watercolourist lays it: one deep, cool wash over everything, the street
// lamps' pools left warm — a bright heart under each lamp, a quick soft edge, and real dark between
// one pool and the next — and the lit windows as the accents. The pools' shape and the night grade
// live here as plain functions (tests/nightLight.test.ts); the shaders run their GLSL twins below,
// fed the same numbers through shared uniforms (U.uLampPool, the post's uNightGrade).

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A street lamp's pool on the ground. The lamp map (stream.ts repaintLamps, ~2 m texels) holds a
 *  cone per lamp in its red channel — 1 at the lamp's foot, 0 at `reach` m, squared — and the shader
 *  turns that distance back into light. A pool painted into the map itself is a 2 m blur: it spread
 *  every lamp into a dim amber wash ~26 m across, and the wash of one ran into the next. A distance
 *  read back from it shapes a heart at any size. (The cones add up where lamps stand closer than
 *  2 × reach; squared, two meeting halfway read as a little brighter than either, as their light is.) */
export const POOL = {
  reach: 9, // m: the cone's radius in the map (the light is gone inside it; lamps 18 m apart don't meet)
  radius: 5.2, // m: the heart — the light is down to 1/e here
  edge: 3, // how quickly it goes: exp(-(d / radius)^edge) — a broad bright heart, then a soft, quick edge
  gain: 3, // the heart's light against the lamp's colour: paper-bright even on asphalt
};
export type Pool = typeof POOL;

/** The cone a lamp paints into the map, d m from its foot (0–1). */
export const poolCone = (d: number, p: Pool = POOL) => clamp01(1 - d / p.reach) ** 2;
/** The distance to the nearest lamp, read back from the map's value. */
export const poolDistance = (g: number, p: Pool = POOL) => p.reach * (1 - Math.sqrt(clamp01(g)));
/** The pool's light (0–1 of its heart) d m from the lamp's foot. */
export const poolLight = (d: number, p: Pool = POOL) => Math.exp(-Math.pow(d / p.radius, p.edge)) * (1 - smoothstep(0.8 * p.reach, p.reach, d));
/** The cone's colour stops for a canvas radial gradient (linear between stops: close enough to the
 *  square at a 2 m texel). */
export const poolConeStops = (n = 8, p: Pool = POOL) => Array.from({ length: n + 1 }, (_, i) => [i / n, poolCone((i / n) * p.reach, p)] as [number, number]);

/** The same, in the shaders (shared.ts lampField): uLampPool = (reach, radius, edge, gain). */
export const GLSL_POOL = /* glsl */ `
float poolLight(float g) {
  float d = uLampPool.x * (1.0 - sqrt(clamp(g, 0.0, 1.0)));
  return exp(-pow(d / uLampPool.y, uLampPool.z)) * (1.0 - smoothstep(0.8 * uLampPool.x, uLampPool.x, d));
}`;

/** The night grade (post.ts, after the colour grade, on display colour 0–1). Everything but the
 *  lights goes under one indigo glaze: its value kept, most of its own hue given up to the glaze
 *  (by night the eye reads value, not colour — a pool's dim amber edge, a lawn and a tan sidewalk
 *  all go the same blue), the darks a little deeper. A warm colour under it goes darker too, as a
 *  blue glaze over orange does on paper (and as reds do first in the dark): a pool's fading edge
 *  sinks into the night rather than ringing it in pale blue. The lights — a lamp's heart, a lit
 *  window, the moon — are bright and warm: they're left out of it, like paper reserved for them. */
export const NIGHT_GRADE = {
  tint: [0.42, 0.68, 1.0] as [number, number, number], // the glaze's hue (Payne's grey toward indigo; display colour)
  hue: 0.85, // how much of a colour's own hue the glaze takes
  deep: 0.22, // the darks' extra depth (at black; nothing by mid-tones)
  dim: 0.5, // how much darker a warm colour goes under the glaze (red over blue by 0.15 or more)
  reserve: [0.3, 0.56] as [number, number], // the lights: the brightest channel over this ramp…
  warm: [0.03, 0.2] as [number, number], // …and red over blue by this much
};
export type NightGradeParams = typeof NIGHT_GRADE;
type RGB = [number, number, number];
const luma = (c: RGB) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

/** How much of a pixel is a light the glaze leaves alone (0–1). */
export function reserved(c: RGB, P: NightGradeParams = NIGHT_GRADE) {
  return smoothstep(P.warm[0], P.warm[1], c[0] - c[2]) * smoothstep(P.reserve[0], P.reserve[1], Math.max(c[0], c[1], c[2]));
}

/** The night grade of one display colour. night: 0 day … 1 night; wash: the look's night wash
 *  (postParams.nightWash; the default look's 0.5 is the whole glaze). */
export function nightGrade(c: RGB, night: number, wash: number, P: NightGradeParams = NIGHT_GRADE): RGB {
  const L = luma(c), tl = luma(P.tint), res = reserved(c, P);
  const deep = (1 - P.deep * (1 - smoothstep(0, 0.45, L))) * (1 - P.dim * smoothstep(0, 0.15, c[0] - c[2]) * (1 - res));
  const k = clamp01(night) * clamp01(wash / 0.5) * (1 - res);
  return [0, 1, 2].map((i) => {
    const g = (c[i] + ((L * P.tint[i]) / tl - c[i]) * P.hue) * deep;
    return c[i] + (g - c[i]) * k;
  }) as RGB;
}

/** The same, in the post's composite: uNightGrade = (hue, deep, reserve.x, reserve.y), uNightWarm =
 *  (warm ramp, dim), uNightTint = tint. */
export const GLSL_NIGHT_GRADE = /* glsl */ `
vec3 nightGrade(vec3 c, float night, float wash) {
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  float res = smoothstep(uNightWarm.x, uNightWarm.y, c.r - c.b) * smoothstep(uNightGrade.z, uNightGrade.w, max(c.r, max(c.g, c.b)));
  float deep = (1.0 - uNightGrade.y * (1.0 - smoothstep(0.0, 0.45, L))) * (1.0 - uNightWarm.z * smoothstep(0.0, 0.15, c.r - c.b) * (1.0 - res));
  vec3 g = mix(c, L * uNightTint / dot(uNightTint, vec3(0.299, 0.587, 0.114)), uNightGrade.x) * deep;
  return mix(c, g, clamp(night, 0.0, 1.0) * clamp(wash / 0.5, 0.0, 1.0) * (1.0 - res));
}`;

/** The post's filmic curve (post.ts TONEMAP) and display encoding, for the tests' street. */
export function tonemap(x: number, exposure = 0.92) {
  const v = Math.max(0, x * exposure);
  return clamp01((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14));
}
export const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
