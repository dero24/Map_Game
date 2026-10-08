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

/** (package #9) The wildflowers that drift through a region's open grass (flora.ts wildflowerMix; the
 *  grass's tufts, grass.ts): each its colours (linear-ish rgb, a tuft picks one by its own number) and
 *  its window [from, to] of the calendar's year (season.ts year: 0 on January 20th, 0.5 at midsummer) —
 *  Texas's bluebonnets and paintbrush from late March, California's poppies, lupines and goldfields from
 *  February, the desert's marigolds and globemallow after the winter rains, the black-eyed Susans and
 *  coneflowers of June to August, the goldenrod and the asters of the fall, the fireweed of July. Each
 *  tuft WILD_SHIFT either way. */
export const WILDFLOWERS: { id: string; colours: [number, number, number][]; win: [number, number] }[] = [
  { id: 'bluebonnet', colours: [[0.28, 0.34, 0.82], [0.36, 0.4, 0.88]], win: [0.17, 0.28] },
  { id: 'paintbrush', colours: [[0.92, 0.32, 0.16], [0.95, 0.48, 0.22]], win: [0.17, 0.33] },
  { id: 'poppy', colours: [[0.98, 0.54, 0.06], [0.98, 0.68, 0.14]], win: [0.03, 0.33] },
  { id: 'lupine', colours: [[0.4, 0.36, 0.8], [0.54, 0.44, 0.86]], win: [0.1, 0.36] },
  { id: 'goldfields', colours: [[0.98, 0.84, 0.16]], win: [0.06, 0.25] },
  { id: 'blackeyed', colours: [[0.96, 0.68, 0.08], [0.98, 0.78, 0.16]], win: [0.38, 0.6] },
  { id: 'coneflower', colours: [[0.76, 0.42, 0.66], [0.84, 0.52, 0.72]], win: [0.4, 0.6] },
  { id: 'goldenrod', colours: [[0.92, 0.78, 0.12], [0.86, 0.72, 0.1]], win: [0.55, 0.75] },
  { id: 'aster', colours: [[0.56, 0.45, 0.84], [0.66, 0.55, 0.9], [0.9, 0.88, 0.94]], win: [0.6, 0.8] },
  { id: 'desertgold', colours: [[0.98, 0.86, 0.2], [0.95, 0.52, 0.3]], win: [0.08, 0.35] },
  { id: 'fireweed', colours: [[0.86, 0.3, 0.6], [0.78, 0.26, 0.56]], win: [0.45, 0.62] },
];
export const WILD_SHIFT = 0.02;
/** How far into flower a wildflower tuft (index in WILDFLOWERS, its number s) is on the calendar's
 *  `year` — the GLSL wildBloom's own sum. */
export function wildBloom(k: number, s: number, year: number): number {
  const w = WILDFLOWERS[k]?.win;
  if (!w) return 0;
  const sh = (s - 0.5) * 2 * WILD_SHIFT;
  return win(year, w[0] + sh, w[1] + sh);
}

const W = BLOOM_WINDOWS, D = DESERT_BLOOM;
const glslColour = (c: [number, number, number]) => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
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
// the wildflowers in the grass (WILDFLOWERS): how far into flower a tuft of kind k (its number s) is
// today, on the calendar's year, and its colour
float wildBloom(float k, float s) {
  float sh = (s - 0.5) * ${f(2 * WILD_SHIFT)};
${WILDFLOWERS.map((w, i) => `  if (k < ${i}.5) return bloomWin(uYear, ${f(w.win[0])} + sh, ${f(w.win[1])} + sh);`).join('\n')}
  return 0.0;
}
vec3 wildColour(float k, float s) {
${WILDFLOWERS.map((w, i) => `  if (k < ${i}.5) return ${w.colours.length > 1 ? w.colours.slice(0, -1).map((c, j) => `s < ${f((j + 1) / w.colours.length)} ? ${glslColour(c)} : `).join('') : ''}${glslColour(w.colours[w.colours.length - 1])};`).join('\n')}
  return vec3(1.0);
}
float bloomCover(float type, vec3 p, float hi) {
  if (type > 5.5) return smoothstep(0.42, 0.6, vnoise3(p * 4.4)) * (0.55 + 0.45 * hi);
  if (type > 4.5) return smoothstep(0.55, 0.7, vnoise3(p * 3.1));
  if (type > 3.5) return smoothstep(0.35, 0.75, hi) * smoothstep(0.4, 0.6, vnoise3(p * 1.7) * 0.7 + 0.3 * hi);
  if (type > 2.5) return smoothstep(0.3, 0.5, vnoise3(p * 2.6) * 0.8 + 0.25);
  if (type > 1.5) return smoothstep(0.5, 0.62, vnoise3(p * 5.3)) * (0.6 + 0.4 * hi);
  return smoothstep(0.2, 0.5, vnoise3(p * 1.6) * 0.8 + 0.3);
}
// ---- the far woods (world/farWoods.ts; ground.ts CANOPY, horizon.ts): the forest past the trees, drawn
// without a tree — uWoods.x of its crowns broadleaves, turning in uFallMix's hues and going bare by the far
// crowns' own sums (propMaterial), so it turns with the trees in front of it. k: a colour's lightness over
// the far canopy's summer green (FAR_LEAF, ground.ts) — the horizon's wooded ridges are darker.
const vec3 FAR_LEAF = vec3(0.16, 0.22, 0.08);
// a bare wood far off: grey-brown twigs over the leaf litter
const vec3 FAR_BARE = vec3(0.17, 0.14, 0.11);
// the leaf litter on a wood's floor once its leaves are down (ground.ts): oak and maple leaves gone tan
// and brown, as light as the floor's summer olive
const vec3 WOODS_LITTER = vec3(0.25, 0.165, 0.085);
// the fall colours far off: a crown's colour in its own shade
const float FAR_FALL = 0.75;
// (uWoods.y 0: the summer green all year, as before — the developer settings' switch)
bool woodsTurning() { return uWoods.y > 0.5 && (uTurn > 0.0 || uLeafFall > 0.0); }
// A stand of broadleaves of fall hue \`hue\`, its own number s: its colour today over its summer
// colour \`leaf\` (turning at its own point of the season, as a far crown does — \`shift\` ahead of it,
// its grove's), and the share of its leaves down.
vec3 standNow(vec3 leaf, float hue, float s, vec3 p, float k, float shift, out float down) {
  float onset = fallOnset(hue, s);
  float turn = smoothstep(onset - 0.02, onset + 0.22, max(uTurn + shift, 0.0) * 1.25) * smoothstep(0.0, 0.04, uTurn);
  vec3 c = mix(leaf, fallColour(hue, s, p, 0.0) * FAR_FALL * k, turn);
  down = leafDown(hue, s);
  return mix(c, FAR_BARE * k, down);
}
// The share of a grove's broadleaves of fall hue i: the region's (uFallMix), half of it given to the
// grove's lead hue (a cove of tulip trees, a ridge of oaks) — none when lead < 0.
float groveShare(int i, float lead) {
  return lead < 0.0 ? uFallMix[i] : 0.5 * uFallMix[i] + (abs(float(i) - lead) < 0.5 ? 0.5 : 0.0);
}
// A wood too far off for its stands to tell apart: their mean — each hue's stands turned as far as the
// season has turned them (fallOnset runs linear in s: the share past their onset), coloured as the middle
// one — and the share of its crowns bare. decid: its share of broadleaves; lead: its lead hue (groveShare);
// shift: how far ahead of the season it is turning (a grove's own).
vec3 woodsMix(vec3 leaf, vec3 p, float k, float decid, float lead, float shift, out float down) {
  vec3 b = vec3(0.0);
  down = 0.0;
  float t = max(uTurn + shift, 0.0);
  for (int i = 0; i < 8; i++) {
    float w = groveShare(i, lead);
    if (w <= 0.0) continue;
    float hue = float(i), a = fallOnset(hue, 0.0), span = max(fallOnset(hue, 1.0) - a, 0.05);
    float turned = clamp((t * 1.25 - 0.1 - a) / span, 0.0, 1.0) * smoothstep(0.0, 0.04, uTurn);
    float dn = leafDown(hue, 0.5);
    b += w * mix(mix(leaf, fallColour(hue, 0.5, p, 0.0) * FAR_FALL * k, turned), FAR_BARE * k, dn);
    down += w * dn;
  }
  down *= decid;
  return mix(leaf, b, decid);
}
vec3 woodsMean(vec3 leaf, vec3 p, float k, out float down) { return woodsMix(leaf, p, k, uWoods.x, -1.0, 0.0, down); }
`;
