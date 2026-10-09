// Night, laid the way a watercolourist lays it: one deep, cool wash over everything, and the street
// lamps' pools left warm — a pale cream glow under each lamp that dies away into the night — with
// the lit windows as the accents. A town's night is never black between its lamps: the sky's glow
// and the spill of windows and porches keep the street readable, a deep blue. The pools' shape, that
// floor of light and the night grade live here as plain functions (tests/nightLight.test.ts); the
// shaders run their GLSL twins below, fed the same numbers through shared uniforms (U.uLampPool,
// U.uPoolColor, U.uNightFloor; the post's uNightGrade, uNightWarm, uNightFade).

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
type RGB = [number, number, number];

/** A street lamp's pool on the ground. A lamp `height` m up lights the street under it as
 *  h³/(h² + d²)^1.5 at d m from its foot: half at 6 m, 17% at 12 m, 9% at 16 m — a broad heart that
 *  dies away, never a disc with an edge. Past `ease` m it eases out to nothing at `reach`, so lamps
 *  closer than twice the reach meet faintly between them.
 *  The lamp map (stream.ts repaintLamps, ~2 m texels) holds that light in its red channel: one stamp
 *  per lamp, added up — light adds — and divided by `headroom` so pools that overlap can add up past
 *  a lone heart before the 8-bit map runs out. (It once held a cone of distance the shaders shaped
 *  into a heart: exp(−(d/5.2)³), cut to nothing by 9 m — a flat top with a cliff, every lamp a stage
 *  light. A lamp's own fall-off is smooth enough to hold as light at 2 m texels.) */
export const POOL = {
  height: 8, // m: the lamp over the street (a cobra head on its mast, 8 m up)
  reach: 22, // m: how far a pool runs in the map
  ease: 12, // m: the lamp's own fall-off holds to here, then eases out to nothing at the reach
  // the heart's light against the lamp's colour: a lit midtone (L* ~65 on asphalt) on the filmic
  // curve's straight part, so the glow's fall-off shows and what stands in it keeps its own colour.
  // (At 3, right for the old small disc, a broad pool sat on the curve's shoulder: a flat cream
  // plateau. At 1.8, L* ~75, the cars and the street under a lamp went one pale beige — Robby,
  // 2026-10-04: "makes cars and everything glow way too light where it washes it all out".)
  gain: 1.2,
  headroom: 2, // the map holds light ÷ this: overlapping pools add up to twice a lone heart
  // the light (linear): a warm cream, about 4000 K — not the sodium orange (#ffb86a) that painted every
  // heart at C* 48–55 (a shade paler since the heart dimmed: at a midtone the cream read orange)
  color: [1.0, 0.86, 0.68] as RGB,
  // how much of a surface's own colour the lamplight mutes (by night the lamp's cream leads: a tan
  // sidewalk or a lawn under it doesn't flare orange or lime)
  mute: 0.55,
  // the darkest a surface reads under the lamp (its albedo, before the lamp's colour): a pool is painted
  // as light, so black asphalt still glows (it also keeps a lawn's green from going lime)
  floor: 0.28,
};
export type Pool = typeof POOL;

/** The pool's light (0–1 of its heart) d m from the lamp's foot. */
export const poolLight = (d: number, p: Pool = POOL) => (p.height ** 3 / (p.height ** 2 + d * d) ** 1.5) * (1 - smoothstep(p.ease, p.reach, d));
/** What a lamp stamps into the map d m from its foot (0 – 1/headroom). */
export const poolStamp = (d: number, p: Pool = POOL) => poolLight(d, p) / p.headroom;
/** The pools' light read back from the map's value (every lamp's stamp, added up). */
export const poolRead = (g: number, p: Pool = POOL) => clamp01(g) * p.headroom;
/** The stamp's colour stops for a canvas radial gradient out to the reach (linear between stops:
 *  within a hundredth of the curve at 16 stops). */
export const poolStops = (n = 16, p: Pool = POOL) => Array.from({ length: n + 1 }, (_, i) => [i / n, poolStamp((i / n) * p.reach, p)] as [number, number]);

/** A pool's light on a surface (scene linear), `light` its share of a heart there (poolLight): the
 *  lamp's colour × gain on the surface's albedo — its own colour muted, and never under 0.3 (a pool
 *  is painted as light: dark asphalt would halve every heart) — the full of it on the ground, half
 *  on a wall, none on what faces down (the lamp is overhead: a passer-by isn't lit like the street). */
export function poolOn(albedo: RGB, light: number, up = 1, p: Pool = POOL): RGB {
  const l = albedo[0] * 0.2126 + albedo[1] * 0.7152 + albedo[2] * 0.0722, face = 0.5 + 0.5 * up;
  return albedo.map((a, i) => Math.max(a + (l - a) * p.mute, p.floor) * p.color[i] * p.gain * light * face) as RGB;
}

/** The same, in the shaders (shared.ts lampField, paintLight): uLampPool = (height, reach, gain,
 *  headroom); the mute is baked in. */
export const GLSL_POOL = /* glsl */ `
float poolLight(float g) { return clamp(g, 0.0, 1.0) * uLampPool.w; }
vec3 poolOn(vec3 albedo, float light, float up) {
  vec3 a = max(mix(albedo, vec3(dot(albedo, vec3(0.2126, 0.7152, 0.0722))), ${POOL.mute.toFixed(3)}), vec3(${POOL.floor.toFixed(3)}));
  return a * uPoolColor * (light * (0.5 + 0.5 * up));
}`;

/** The night's floor: the town's own glow at street level — sky glow from above, the spill of lit
 *  windows and porches — that keeps the street between the pools readable, a deep blue (L* 10–20).
 *  It lights every surface near the street, fading with height as the lamps do (shared.ts
 *  streetLevel), and draws their albedos together toward one middle (`even`): by night a white wall
 *  and a black road sit closer in value than by day. Nothing by day: it goes with uNight. */
export const FLOOR = {
  color: [0.62, 0.78, 1.0] as RGB, // the glow's hue (linear): the night sky's blue
  strength: 0.16, // its light at street level, in the scene's linear units (a high gibbous moon's is ~0.08)
  even: 0.85, // how far it draws each albedo toward the grey below (asphalt 0.12 → 0.27, a sidewalk 0.47 → 0.32)
  grey: 0.3,
};
export type Floor = typeof FLOOR;

/** The floor's light on a surface of this albedo at street level (night: 0 day … 1 night). */
export function floorLight(albedo: RGB, night = 1, p: Floor = FLOOR): RGB {
  return albedo.map((a, i) => (a + (p.grey - a) * p.even) * p.color[i] * p.strength * clamp01(night)) as RGB;
}

/** The same, in the shaders (shared.ts paintLight): uNightFloor = (colour, strength). */
export const GLSL_FLOOR = /* glsl */ `
vec3 nightFloor(vec3 albedo, float level) {
  if (uNight <= 0.0) return vec3(0.0); // (by day: nothing to add, and nothing spent)
  return mix(albedo, vec3(${FLOOR.grey.toFixed(3)}), ${FLOOR.even.toFixed(3)}) * uNightFloor.rgb * (uNight * uNightFloor.w * level);
}`;

/** A figure by night (a person out of doors: creature.ts sets FIGURE_NIGHT, shared.ts paintLight).
 *  The floor evens the street's albedos toward a middle grey so the ground between the pools reads;
 *  a standing figure lit the same way — its sides as fully as the street, a pale shirt or pale skin
 *  lifted with the rest — read twice as light as the asphalt it walked on, pale and lit against the
 *  dark ground (Robby, 2026-10-07, the night from Liberty State Park). So the night's own light (the
 *  moon, the sky's fill, the floor) lights a figure's colours evened toward a dark grey (`grey`,
 *  `even`) — a white shirt a little lighter than the street, a navy coat darker, never black — and
 *  only half the sky's fill reaches a figure's sides (`fill`). A lamp's pool lights its own colours:
 *  a walker is lit where a lamp lights them. Nothing by day: it all goes with uNight. */
export const FIGURE = {
  grey: 0.19, // the value a figure's colours are evened toward by night (a little over the asphalt's 0.12)
  even: 0.84, // how far (white 0.86 → 0.30, navy 0.03 → 0.16: a white shirt about the street, a dark coat half of it)
  fill: 0.5, // the sky's fill a figure's sides lose by night (they see half the sky, and the street's bounce is dark)
};
export type Figure = typeof FIGURE;

/** A figure's colour as the night's own light sees it (night: 0 day … 1 night). */
export function figureAlbedo(albedo: RGB, night = 1, p: Figure = FIGURE): RGB {
  return albedo.map((a) => a + (p.grey - a) * p.even * clamp01(night)) as RGB;
}
/** The floor's light on a figure at street level: its (evened) colour, with no further evening. */
export function figureFloor(albedo: RGB, night = 1, f: Floor = FLOOR): RGB {
  return albedo.map((a, i) => a * f.color[i] * f.strength * clamp01(night)) as RGB;
}

/** The same, in the shaders (shared.ts paintLight under FIGURE_NIGHT). */
export const GLSL_FIGURE = /* glsl */ `
vec3 figureAlbedo(vec3 albedo) { return mix(albedo, vec3(${FIGURE.grey.toFixed(3)}), ${FIGURE.even.toFixed(3)} * uNight); }
float figureFill() { return 1.0 - ${FIGURE.fill.toFixed(3)} * uNight; }
vec3 figureFloor(vec3 albedo, float level) {
  if (uNight <= 0.0) return vec3(0.0);
  return albedo * uNightFloor.rgb * (uNight * uNightFloor.w * level);
}`;

/** The night grade (post.ts, after the colour grade, on display colour 0–1). Everything but the
 *  lights goes under one indigo glaze: its value kept, most of its own hue given up to the glaze —
 *  by night the eye reads value, not colour, and the floor's street, a lawn and a tan sidewalk all go
 *  the same deep blue — the darks a little deeper. The glaze thins as the value rises (`fade`): the
 *  last of a pool's glow, dying into the night, goes a warm grey and then the night's blue, never a
 *  ring of pale blue round the warm heart. The lights — a lamp's heart, a lit window — are bright and
 *  warm, and left out of it like paper reserved for them; the reserve comes on over a wide ramp
 *  (0.15–0.6 of the brightest channel) so a pool's light hands over to the night gradually. (The
 *  reserve once ran 0.3–0.56, and everything warm below it went half as dark again under the glaze:
 *  that turned a pool's own fall-off into a rim.) */
export const NIGHT_GRADE = {
  tint: [0.42, 0.68, 1.0] as RGB, // the glaze's hue (Payne's grey toward indigo; display colour)
  hue: 0.85, // how much of a colour's own hue the glaze takes, in the darks
  deep: 0.22, // the darks' extra depth (at black; nothing by mid-tones)
  fade: 0.8, // how much of that hue the glaze gives back by the top of…
  fadeAt: [0.08, 0.4] as [number, number], // …this ramp of luma
  reserve: [0.15, 0.6] as [number, number], // the lights: the brightest channel over this ramp…
  warm: [0.03, 0.2] as [number, number], // …and red over blue by this much
};
export type NightGradeParams = typeof NIGHT_GRADE;
const luma = (c: RGB) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

/** How much of a pixel is a light the glaze leaves alone (0–1). */
export function reserved(c: RGB, P: NightGradeParams = NIGHT_GRADE) {
  return smoothstep(P.warm[0], P.warm[1], c[0] - c[2]) * smoothstep(P.reserve[0], P.reserve[1], Math.max(c[0], c[1], c[2]));
}

/** The night grade of one display colour. night: 0 day … 1 night; wash: the look's night wash
 *  (postParams.nightWash; the default look's 0.5 is the whole glaze). */
export function nightGrade(c: RGB, night: number, wash: number, P: NightGradeParams = NIGHT_GRADE): RGB {
  const L = luma(c), tl = luma(P.tint), res = reserved(c, P);
  const deep = 1 - P.deep * (1 - smoothstep(0, 0.45, L));
  const hue = P.hue * (1 - P.fade * smoothstep(P.fadeAt[0], P.fadeAt[1], L));
  const k = clamp01(night) * clamp01(wash / 0.5) * (1 - res);
  return [0, 1, 2].map((i) => {
    const g = (c[i] + ((L * P.tint[i]) / tl - c[i]) * hue) * deep;
    return c[i] + (g - c[i]) * k;
  }) as RGB;
}

/** The same, in the post's composite: uNightGrade = (hue, deep, reserve.x, reserve.y), uNightWarm =
 *  warm ramp, uNightFade = (fade, fadeAt.x, fadeAt.y), uNightTint = tint. */
export const GLSL_NIGHT_GRADE = /* glsl */ `
vec3 nightGrade(vec3 c, float night, float wash) {
  if (night <= 0.0) return c; // (by day: nothing to do, and nothing spent)
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  float res = smoothstep(uNightWarm.x, uNightWarm.y, c.r - c.b) * smoothstep(uNightGrade.z, uNightGrade.w, max(c.r, max(c.g, c.b)));
  float deep = 1.0 - uNightGrade.y * (1.0 - smoothstep(0.0, 0.45, L));
  float hue = uNightGrade.x * (1.0 - uNightFade.x * smoothstep(uNightFade.y, uNightFade.z, L));
  vec3 g = mix(c, L * uNightTint / dot(uNightTint, vec3(0.299, 0.587, 0.114)), hue) * deep;
  return mix(c, g, clamp(night, 0.0, 1.0) * clamp(wash / 0.5, 0.0, 1.0) * (1.0 - res));
}`;

/** The post's filmic curve (post.ts TONEMAP) and display encoding, for the tests' street. */
export function tonemap(x: number, exposure = 0.92) {
  const v = Math.max(0, x * exposure);
  return clamp01((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14));
}
export const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
