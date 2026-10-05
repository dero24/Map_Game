// The trees' seasons as one set of sums (assets/flora.ts FALL_HUE, BLOSSOM_OF): the far crowns
// (propMaterial) and the near trees' leaf cards (leafCards) both run them, through shared.ts's GLSL, so
// the two read as one tree at the hand-over — and the flowering calendar is data here, so the tests
// read the same windows the shaders do.
//
// In the GLSL: s is the tree's own number (0–1, from where it stands), p a point (region frame), id a
// leaf's own number on a card (0 on a far crown). It needs uSpring, uSummer, uLeafFall, uTurn and
// vnoise3 (shared.ts).

/** When each blossom type is out (BLOSSOM_OF: 1 cherry, 2 dogwood, 3 redbud, 4 crape myrtle, 5
 *  rosebay). The spring flowers: a window [from, to] of uSpring (season.ts spring: the warming half's
 *  progress) — the redbud first, then the cherry, then the dogwood, the rosebay in June; each tree
 *  `SHIFT` either way of it by its own number. The crape myrtle: all summer, from uSummer `from` (the
 *  earliest trees) to `to` (the latest), never past the summer's end. */
export const BLOOM_WINDOWS: Record<number, [number, number]> = { 1: [0.18, 0.42], 2: [0.38, 0.62], 3: [0.2, 0.45], 4: [0.4, 0.75], 5: [0.84, 1.08] };
export const SHIFT = 0.04;
const f = (x: number) => x.toFixed(3);
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const win = (x: number, a: number, b: number) => sstep(a, a + 0.05, x) * (1 - sstep(b - 0.05, b, x));
/** How far into flower a tree of blossom `type` is (0–1), its number s, on a day of `spring` and
 *  `summer` (season.ts) — the GLSL bloomNow's own sum. */
export function bloomNow(type: number, s: number, spring: number, summer: number): number {
  const w = BLOOM_WINDOWS[type];
  if (!w) return 0;
  if (type === 4) return sstep(w[0] + 0.35 * s, w[1] + 0.35 * s, summer);
  const sh = (s - 0.5) * 2 * SHIFT;
  return win(spring, w[0] + sh, w[1] + sh);
}

const W = BLOOM_WINDOWS;
export const GLSL_TREE_SEASONS = /* glsl */ `
// ---- the trees' seasons (render/treeSeasons.ts)
// The autumn colour: 0 mixed (each tree yellow, orange or red), 1 red (the maples' scarlet and flame,
// the dogwood's), 2 gold, 3 drab (the alder's near-green), 4 jewel (the sweetgum: purple, red, orange
// and yellow on one tree, lobe by lobe and leaf by leaf), 5 pumpkin orange (the buckeye), 6 russet to tan
// (the bur oak's brown, the sycamore's)
vec3 fallColour(float hue, float s, vec3 p, float id) {
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
// the share of its leaves down: the season's — and the buckeye's gone early, bare by October
float leafDown(float hue, float s) {
  return hue > 4.5 && hue < 5.5 ? max(uLeafFall, clamp((uTurn - 0.35 - 0.25 * s) * 3.0, 0.0, 1.0)) : uLeafFall;
}
// Blossom: how far into flower the tree is today (BLOOM_WINDOWS) — the spring's flowers each in their
// window of the warming, the crape myrtle all summer; each tree a few days off its neighbours
float bloomWin(float x, float a, float b) { return smoothstep(a, a + 0.05, x) * (1.0 - smoothstep(b - 0.05, b, x)); }
float bloomNow(float type, float s) {
  float sh = (s - 0.5) * ${f(2 * SHIFT)};
  if (type > 4.5) return bloomWin(uSpring, ${f(W[5][0])} + sh, ${f(W[5][1])} + sh);
  if (type > 3.5) return smoothstep(${f(W[4][0])} + 0.35 * s, ${f(W[4][1])} + 0.35 * s, uSummer);
  if (type > 2.5) return bloomWin(uSpring, ${f(W[3][0])} + sh, ${f(W[3][1])} + sh);
  if (type > 1.5) return bloomWin(uSpring, ${f(W[2][0])} + sh, ${f(W[2][1])} + sh);
  if (type > 0.5) return bloomWin(uSpring, ${f(W[1][0])} + sh, ${f(W[1][1])} + sh);
  return 0.0;
}
// its colour, each tree its own: the cherry's pink flecked white, the dogwood's white bracts (one tree in
// six pink), the redbud's magenta, the crape myrtle's pink, watermelon red, lavender or white, the
// rosebay's white flushed pink
vec3 bloomColour(float type, float s, vec3 p) {
  float n = vnoise3(p * 2.3);
  if (type > 4.5) return mix(vec3(0.97, 0.92, 0.93), vec3(0.93, 0.74, 0.82), n * (0.4 + 0.6 * s));
  if (type > 3.5) return (s < 0.3 ? vec3(0.93, 0.48, 0.66) : s < 0.56 ? vec3(0.84, 0.16, 0.3) : s < 0.8 ? vec3(0.7, 0.55, 0.86) : vec3(0.96, 0.94, 0.92)) * (0.9 + 0.18 * n);
  if (type > 2.5) return mix(vec3(0.8, 0.3, 0.6), vec3(0.86, 0.45, 0.72), n) * (0.92 + 0.16 * s);
  if (type > 1.5) return fract(s * 7.3) < 0.16 ? mix(vec3(0.94, 0.68, 0.76), vec3(0.98, 0.86, 0.9), n) : mix(vec3(0.97, 0.96, 0.9), vec3(0.93, 0.93, 0.84), n);
  return mix(vec3(0.96, 0.72, 0.8), vec3(0.98, 0.9, 0.92), n);
}
// how much of the crown at p is in flower (hi: the point's height in its crown, 0 underside … 1 top):
// the cherry's cloud in clumps, the dogwood's bracts specked over its tiers' tops, the redbud's haze, the
// crape myrtle's cones on the crown's top and outside, the rosebay's trusses scattered
float bloomCover(float type, vec3 p, float hi) {
  if (type > 4.5) return smoothstep(0.55, 0.7, vnoise3(p * 3.1));
  if (type > 3.5) return smoothstep(0.35, 0.75, hi) * smoothstep(0.4, 0.6, vnoise3(p * 1.7) * 0.7 + 0.3 * hi);
  if (type > 2.5) return smoothstep(0.3, 0.5, vnoise3(p * 2.6) * 0.8 + 0.25);
  if (type > 1.5) return smoothstep(0.5, 0.62, vnoise3(p * 5.3)) * (0.6 + 0.4 * hi);
  return smoothstep(0.2, 0.5, vnoise3(p * 1.6) * 0.8 + 0.3);
}
`;
