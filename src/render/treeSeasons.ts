// The trees' seasons as one set of sums (assets/flora.ts FALL_HUE, BLOSSOM_OF): the far crowns
// (propMaterial) and the near trees' leaf cards (leafCards) both run them, through shared.ts's GLSL, so
// the two read as one tree at the hand-over — and the flowering calendar is data here, so the tests
// read the same windows the shaders do.
//
// In the GLSL: s is the tree's own number (0–1, from where it stands), p a point (region frame), id a
// leaf's own number on a card (0 on a far crown). It needs uSpring, uSummer, uWinter, uSnow, uWet,
// uLeafFall, uTurn and vnoise3 (shared.ts).

/** When each blossom type is out (BLOSSOM_OF: 1 cherry, 2 dogwood, 3 redbud, 4 crape myrtle, 5
 *  rosebay, 6 manzanita). The spring flowers: a window [from, to] of uSpring (season.ts spring: the
 *  warming half's progress) — the redbud first, then the cherry, then the dogwood, the rosebay in June;
 *  each tree `SHIFT` either way of it by its own number. The crape myrtle: all summer, from uSummer
 *  `from` (the earliest trees) to `to` (the latest), never past the summer's end. The manzanita: in the
 *  depth of winter (uWinter, season.ts winter), its earliest trees opening at `from` (mid-November),
 *  its latest at `to` + 0.12 (mid-December), all out by the solstice's month and over by April — and
 *  not under snow (the GLSL's; this mirror leaves the snow out). */
export const BLOOM_WINDOWS: Record<number, [number, number]> = { 1: [0.18, 0.42], 2: [0.38, 0.62], 3: [0.2, 0.45], 4: [0.4, 0.75], 5: [0.84, 1.08], 6: [0.7, 0.8] };
export const SHIFT = 0.04;
/** (package #7) The desert's flowers (BLOSSOM 7–10, parts of their own: flora.ts BLOOM_PART) by the
 *  calendar: a window [from, to] of the year's progress to midsummer (1 − season.ts winter: 0 on
 *  January 20th … 1 on July 21st), in the warming half (spring > 0) — the Joshua tree's from late
 *  February, the ocotillo's from mid-March, the prickly pear's late April into May, the saguaro's late
 *  April to mid-June; each plant SHIFT either way. */
export const DESERT_BLOOM: Record<number, [number, number]> = { 7: [0.48, 0.88], 8: [0.18, 0.6], 9: [0.45, 0.75], 10: [0.1, 0.45] };
const f = (x: number) => x.toFixed(3);
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const win = (x: number, a: number, b: number) => sstep(a, a + 0.05, x) * (1 - sstep(b - 0.05, b, x));
/** How far into flower a tree of blossom `type` is (0–1), its number s, on a day of `spring`, `summer`
 *  and `winter` (season.ts) — the GLSL bloomNow's own sum. */
export function bloomNow(type: number, s: number, spring: number, summer: number, winter = 0): number {
  if (type >= 7) {
    const d = DESERT_BLOOM[type], sh = (s - 0.5) * 2 * SHIFT;
    return d && spring > 0 ? win(1 - winter, d[0] + sh, d[1] + sh) : 0;
  }
  const w = BLOOM_WINDOWS[type];
  if (!w) return 0;
  if (type === 6) return sstep(w[0] + 0.12 * s, w[1] + 0.12 * s, winter);
  if (type === 4) return sstep(w[0] + 0.35 * s, w[1] + 0.35 * s, summer);
  const sh = (s - 0.5) * 2 * SHIFT;
  return win(spring, w[0] + sh, w[1] + sh);
}

/** The desert's fruit, the GLSL fruitNow's sum (0–1): the saguaro's red fruit splitting open from mid-June
 *  into early August, the prickly pear's purple tunas from August into October. */
export function fruitNow(type: number, s: number, spring: number, winter: number): number {
  const yr = 1 - winter, sh = (s - 0.5) * 2 * SHIFT;
  if (type === 7) return spring > 0 ? sstep(0.86 + sh, 0.9 + sh, yr) : sstep(0.93 + sh, 0.97 + sh, yr);
  if (type === 9) return spring > 0 ? sstep(0.95, 0.98, yr) : sstep(0.42 + sh, 0.5 + sh, yr);
  return 0;
}
/** The ocotillo's leaves (FALL_HUE 8), the GLSL rainLeaves' sum: 1 in leaf — after rain (season.ts
 *  wetness `wet`) in its rainy seasons, the summer monsoon (July to mid-September) and the late winter's
 *  (February to April); bare through the dry fore-summer and the autumn. */
export function rainLeaves(s: number, spring: number, winter: number, wet: number): number {
  const yr = 1 - winter;
  const season = spring > 0 ? Math.max(win(yr, 0.08, 0.5), sstep(0.93, 0.96, yr)) : sstep(0.72, 0.78, yr);
  return season * sstep(0.04, 0.12, wet + 0.04 * s);
}

const W = BLOOM_WINDOWS, D = DESERT_BLOOM;
export const GLSL_TREE_SEASONS = /* glsl */ `
// ---- the trees' seasons (render/treeSeasons.ts)
// The autumn colour: 0 mixed (each tree yellow, orange or red), 1 red (the maples' scarlet and flame,
// the dogwood's), 2 gold, 3 drab (the alder's near-green), 4 jewel (the sweetgum: purple, red, orange
// and yellow on one tree, lobe by lobe and leaf by leaf), 5 pumpkin orange (the buckeye), 6 russet to tan
// (the bur oak's brown, the sycamore's), 8 the ocotillo's leaves yellowing as they dry
vec3 fallColour(float hue, float s, vec3 p, float id) {
  if (hue > 7.5) return mix(vec3(0.72, 0.64, 0.24), vec3(0.6, 0.5, 0.2), s);
  if (hue > 5.5) return mix(vec3(0.56, 0.3, 0.12), vec3(0.6, 0.46, 0.22), s) * (0.9 + 0.2 * vnoise3(p * 0.7));
  if (hue > 4.5) return mix(vec3(0.9, 0.46, 0.08), vec3(0.8, 0.34, 0.06), s);
  if (hue > 3.5) {
    float k = fract(vnoise3(p * 0.9) * 1.9 + id * 0.45 + s * 2.3);
    return k < 0.24 ? vec3(0.42, 0.1, 0.24) : k < 0.5 ? vec3(0.72, 0.09, 0.08) : k < 0.76 ? vec3(0.86, 0.38, 0.06) : vec3(0.86, 0.68, 0.12);
  }
  if (hue > 2.5) return mix(vec3(0.36, 0.38, 0.12), vec3(0.42, 0.32, 0.12), s);
  if (hue > 1.5) return mix(mix(vec3(0.88, 0.7, 0.14), vec3(0.74, 0.52, 0.08), s), vec3(0.62, 0.62, 0.2), 0.25 * vnoise3(p * 0.7));
  if (hue > 0.5) return mix(s < 0.55 ? vec3(0.76, 0.13, 0.06) : vec3(0.86, 0.36, 0.05), vec3(0.9, 0.55, 0.1), 0.3 * vnoise3(p * 0.7));
  return mix(s < 0.4 ? vec3(0.78, 0.55, 0.08) : s < 0.75 ? vec3(0.8, 0.3, 0.06) : vec3(0.6, 0.1, 0.07), vec3(0.72, 0.5, 0.1), 0.35 * vnoise3(p * 0.7));
}
// where in the turning (uTurn) a tree turns: the buckeye first of all, the maples early, the sweetgum,
// the bur oak and the sycamore late
float fallOnset(float hue, float s) {
  if (hue > 4.5 && hue < 5.5) return s * 0.3;
  if (hue > 3.5) return 0.3 + s * 0.55;
  return s * 0.85 * (hue > 0.5 && hue < 1.5 ? 0.7 : 1.0);
}
// a window [a, b] of x, soft at both ends
float bloomWin(float x, float a, float b) { return smoothstep(a, a + 0.05, x) * (1.0 - smoothstep(b - 0.05, b, x)); }
// the ocotillo's leaves (rainLeaves in treeSeasons.ts): out after rain in its rainy seasons
float rainLeaves(float s) {
  float yr = 1.0 - uWinter;
  float season = uSpring > 0.0 ? max(bloomWin(yr, 0.08, 0.5), smoothstep(0.93, 0.96, yr)) : smoothstep(0.72, 0.78, yr);
  return season * smoothstep(0.04, 0.12, uWet + 0.04 * s);
}
// the share of its leaves down: the season's — and the buckeye's gone early, bare by October; the
// ocotillo's whenever it's dry
float leafDown(float hue, float s) {
  if (hue > 7.5) return max(uLeafFall, 1.0 - rainLeaves(s));
  return hue > 4.5 && hue < 5.5 ? max(uLeafFall, clamp((uTurn - 0.35 - 0.25 * s) * 3.0, 0.0, 1.0)) : uLeafFall;
}
// Blossom: how far into flower the tree is today (BLOOM_WINDOWS) — the spring's flowers each in their
// window of the warming, the crape myrtle all summer, the manzanita's in the winter (never under
// snow); each tree a few days off its neighbours
float bloomNow(float type, float s) {
  float sh = (s - 0.5) * ${f(2 * SHIFT)};
  if (type > 6.5) {
    // (the desert's, by the calendar in the warming half: DESERT_BLOOM)
    if (uSpring <= 0.0) return 0.0;
    float yr = 1.0 - uWinter;
    if (type > 9.5) return bloomWin(yr, ${f(D[10][0])} + sh, ${f(D[10][1])} + sh);
    if (type > 8.5) return bloomWin(yr, ${f(D[9][0])} + sh, ${f(D[9][1])} + sh);
    if (type > 7.5) return bloomWin(yr, ${f(D[8][0])} + sh, ${f(D[8][1])} + sh);
    return bloomWin(yr, ${f(D[7][0])} + sh, ${f(D[7][1])} + sh);
  }
  if (type > 5.5) return smoothstep(${f(W[6][0])} + 0.12 * s, ${f(W[6][1])} + 0.12 * s, uWinter) * (1.0 - smoothstep(0.2, 0.6, uSnow));
  if (type > 4.5) return bloomWin(uSpring, ${f(W[5][0])} + sh, ${f(W[5][1])} + sh);
  if (type > 3.5) return smoothstep(${f(W[4][0])} + 0.35 * s, ${f(W[4][1])} + 0.35 * s, uSummer);
  if (type > 2.5) return bloomWin(uSpring, ${f(W[3][0])} + sh, ${f(W[3][1])} + sh);
  if (type > 1.5) return bloomWin(uSpring, ${f(W[2][0])} + sh, ${f(W[2][1])} + sh);
  if (type > 0.5) return bloomWin(uSpring, ${f(W[1][0])} + sh, ${f(W[1][1])} + sh);
  return 0.0;
}
// the desert's fruit (fruitNow in treeSeasons.ts): the saguaro's red, mid-June into early August; the
// prickly pear's purple tunas, August into October
float fruitNow(float type, float s) {
  float yr = 1.0 - uWinter, sh = (s - 0.5) * ${f(2 * SHIFT)};
  if (type > 8.5 && type < 9.5) return uSpring > 0.0 ? smoothstep(0.95, 0.98, yr) : smoothstep(0.42 + sh, 0.5 + sh, yr);
  if (type > 6.5 && type < 7.5) return uSpring > 0.0 ? smoothstep(0.86 + sh, 0.9 + sh, yr) : smoothstep(0.93 + sh, 0.97 + sh, yr);
  return 0.0;
}
vec3 fruitColour(float type, float s, vec3 p) {
  float n = vnoise3(p * 5.0);
  return type > 8.5 ? mix(vec3(0.5, 0.1, 0.28), vec3(0.66, 0.14, 0.34), n) : mix(vec3(0.76, 0.14, 0.12), vec3(0.86, 0.26, 0.16), n);
}
// its colour, each tree its own: the cherry's pink flecked white, the dogwood's white bracts (one tree in
// six pink), the redbud's magenta, the crape myrtle's pink, watermelon red, lavender or white, the
// rosebay's white flushed pink, the manzanita's urns white to shell pink; the saguaro's waxy white with
// its yellow heart, the ocotillo's scarlet, the prickly pear's yellow (one plant in four orange), the
// Joshua tree's cream-green
vec3 bloomColour(float type, float s, vec3 p) {
  float n = vnoise3(p * 2.3);
  if (type > 9.5) return mix(vec3(0.9, 0.9, 0.72), vec3(0.84, 0.86, 0.62), n);
  if (type > 8.5) return (s < 0.75 ? vec3(0.96, 0.84, 0.22) : vec3(0.95, 0.56, 0.16)) * (0.92 + 0.16 * n);
  if (type > 7.5) return mix(vec3(0.86, 0.16, 0.08), vec3(0.94, 0.3, 0.1), n);
  if (type > 6.5) return mix(vec3(0.97, 0.95, 0.86), vec3(0.95, 0.86, 0.48), n * 0.4);
  if (type > 5.5) return mix(vec3(0.96, 0.94, 0.9), vec3(0.94, 0.72, 0.74), s * (0.5 + 0.5 * n));
  if (type > 4.5) return mix(vec3(0.97, 0.92, 0.93), vec3(0.93, 0.74, 0.82), n * (0.4 + 0.6 * s));
  if (type > 3.5) return (s < 0.3 ? vec3(0.93, 0.48, 0.66) : s < 0.56 ? vec3(0.84, 0.16, 0.3) : s < 0.8 ? vec3(0.7, 0.55, 0.86) : vec3(0.96, 0.94, 0.92)) * (0.9 + 0.18 * n);
  if (type > 2.5) return mix(vec3(0.8, 0.3, 0.6), vec3(0.86, 0.45, 0.72), n) * (0.92 + 0.16 * s);
  if (type > 1.5) return fract(s * 7.3) < 0.16 ? mix(vec3(0.94, 0.68, 0.76), vec3(0.98, 0.86, 0.9), n) : mix(vec3(0.97, 0.96, 0.9), vec3(0.93, 0.93, 0.84), n);
  return mix(vec3(0.96, 0.72, 0.8), vec3(0.98, 0.9, 0.92), n);
}
// how much of the crown at p is in flower (hi: the point's height in its crown, 0 underside … 1 top):
// the cherry's cloud in clumps, the dogwood's bracts specked over its tiers' tops, the redbud's haze, the
// crape myrtle's cones on the crown's top and outside, the rosebay's trusses scattered, the
// manzanita's little hanging clusters all over its twigs' ends
float bloomCover(float type, vec3 p, float hi) {
  if (type > 5.5) return smoothstep(0.42, 0.6, vnoise3(p * 4.4)) * (0.55 + 0.45 * hi);
  if (type > 4.5) return smoothstep(0.55, 0.7, vnoise3(p * 3.1));
  if (type > 3.5) return smoothstep(0.35, 0.75, hi) * smoothstep(0.4, 0.6, vnoise3(p * 1.7) * 0.7 + 0.3 * hi);
  if (type > 2.5) return smoothstep(0.3, 0.5, vnoise3(p * 2.6) * 0.8 + 0.25);
  if (type > 1.5) return smoothstep(0.5, 0.62, vnoise3(p * 5.3)) * (0.6 + 0.4 * hi);
  return smoothstep(0.2, 0.5, vnoise3(p * 1.6) * 0.8 + 0.3);
}
`;
