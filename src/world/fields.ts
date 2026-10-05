// Fields (docs/regional-life/models.md build order 10): the farmland of a place (ESA WorldCover's
// cropland, class 40) planted field by field — corn, soybeans, winter wheat, spring wheat — each crop
// on its own calendar: the bare ground of spring, the rows coming up, the corn head-high by midsummer
// and tasselled, the soybeans gone yellow in September, the winter wheat green under the snow and gold
// in June, the stubble after the combine. Pure and deterministic: a field is a 400 m block of the
// survey's grid (the Public Land Survey runs north–south), its crop and its rows a hash of the block,
// its stage the calendar's (season.ts year: 0 on January 20th). The grass field grows the crops near
// the walker (grass.ts); the ground's wash colours the fields farther off (groundPaint.ts).
import { hashf } from '../assets/core';
import type { CastPlace } from '../assets/flora';

export type Crop = 'corn' | 'soy' | 'wheat' | 'swheat';
export const CROPS: Crop[] = ['corn', 'soy', 'wheat', 'swheat'];
/** A field's side (m): a quarter of a quarter section's mile, near enough — the fields of the Corn Belt. */
export const FIELD = 400;
/** The rows: corn and soybeans 30 inches apart, wheat drilled. */
export const ROW: Record<Crop, number> = { corn: 0.76, soy: 0.76, wheat: 0.5, swheat: 0.5 };

/** What a place's farms grow (crop, weight): the Corn Belt's corn and soybeans in rotation; the Plains'
 *  winter wheat (Kansas, Oklahoma, western Nebraska, the Panhandle) with some corn; the northern Plains'
 *  spring wheat with soybeans and corn; the East's and the South's corn and soybeans with a little
 *  wheat; the Palouse's wheat; California's valley a little of each (its orchards are another layer's).
 *  `lat`: the place's latitude (spring wheat north of ~45°N). */
export function cropMix(p: CastPlace, lat: number): [Crop, number][] {
  const st = p.state ?? '';
  switch (p.eco) {
    case 'midwest': return lat > 45.5 ? [['corn', 0.4], ['soy', 0.4], ['swheat', 0.2]] : [['corn', 0.52], ['soy', 0.43], ['wheat', 0.05]];
    case 'plains':
      if (lat > 45.5) return [['swheat', 0.45], ['soy', 0.28], ['corn', 0.27]];
      if (['KS', 'OK', 'TX', 'CO'].includes(st) || [25, 26, 27].includes(p.l3)) return [['wheat', 0.6], ['corn', 0.25], ['soy', 0.15]];
      return [['corn', 0.48], ['soy', 0.42], ['wheat', 0.1]];
    case 'pnw': return p.west ? [['wheat', 0.3], ['corn', 0.4], ['soy', 0.3]] : [['wheat', 0.85], ['swheat', 0.15]];
    case 'great-basin': case 'rockies': return [['wheat', 0.5], ['corn', 0.3], ['swheat', 0.2]];
    case 'california': return [['wheat', 0.4], ['corn', 0.4], ['soy', 0.2]];
    case 'texas': return [['wheat', 0.45], ['corn', 0.35], ['soy', 0.2]];
    case 'new-england': case 'upstate-ny': return [['corn', 0.65], ['soy', 0.2], ['wheat', 0.15]];
  }
  return [['corn', 0.45], ['soy', 0.42], ['wheat', 0.13]];
}

/** The field a point lies in: its crop (from `mix`), the way its rows run (0 east–west along x, 1
 *  north–south along z) and its own number (0–1: a few days off its neighbours at planting and harvest). */
export function fieldAt(x: number, z: number, mix: [Crop, number][]): { crop: Crop; dir: 0 | 1; n: number } {
  const i = Math.floor(x / FIELD), j = Math.floor(z / FIELD);
  const u = hashf(i * 92821 + j * 68917 + 4241), tot = mix.reduce((a, [, w]) => a + w, 0);
  let acc = 0, crop: Crop = mix[mix.length - 1][0];
  for (const [c, w] of mix) if (u * tot < (acc += w)) { crop = c; break; }
  return { crop, dir: hashf(i * 7919 + j * 104729 + 4243) < 0.5 ? 0 : 1, n: hashf(i * 31337 + j * 2971 + 4253) };
}

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Each crop's calendar on the year (season.ts year: 0 on January 20th, 0.5 at midsummer): [planted,
 *  full height, ripening from, ripe, harvested from, harvested by]. Winter wheat's year wraps: sown in
 *  October (0.7), green and short through the winter, growing again from March. */
export const CROP_CAL: Record<Crop, [number, number, number, number, number, number]> = {
  corn: [0.28, 0.48, 0.58, 0.68, 0.72, 0.8],
  soy: [0.3, 0.5, 0.6, 0.67, 0.7, 0.76],
  wheat: [0.13, 0.3, 0.32, 0.4, 0.42, 0.47],
  swheat: [0.25, 0.45, 0.47, 0.55, 0.56, 0.62],
};
/** A crop's stage on `year` in a field of number `n`: its height (0–1 of grown), its ripeness (0 green …
 *  1 ripe: the corn and soybeans tan, the wheat gold), and whether it's stubble (cut) or bare ground (not
 *  yet up). The GLSL cropStage's own sum. */
export function cropStage(crop: Crop, year: number, n: number): { h: number; ripe: number; stubble: boolean; bare: boolean } {
  const [p0, p1, r0, r1, h0, h1] = CROP_CAL[crop], sh = (n - 0.5) * 0.04, cut = h0 + (h1 - h0) * n;
  const y = year;
  if (crop === 'wheat') {
    // (winter wheat: sown in October, a green carpet under the winter, growing again from March)
    if (y >= 0.7 + sh || y < p0 + sh) return { h: 0.22 * sstep(0.7, 0.76, y >= 0.7 ? y : y + 1), ripe: 0, stubble: false, bare: y >= 0.7 && y < 0.72 };
    if (y >= cut) return { h: 0, ripe: 1, stubble: true, bare: false };
    return { h: 0.22 + 0.78 * sstep(p0 + sh, p1 + sh, y), ripe: sstep(r0 + sh, r1 + sh, y), stubble: false, bare: false };
  }
  if (y < p0 + sh) return { h: 0, ripe: 0, stubble: y > 0.85 || y < 0.2, bare: !(y > 0.85 || y < 0.2) };
  if (y >= cut) return { h: 0, ripe: 1, stubble: true, bare: false };
  return { h: sstep(p0 + sh, p1 + sh, y), ripe: sstep(r0 + sh, r1 + sh, y), stubble: false, bare: false };
}
/** The field's colour far off (the ground's wash, sRGB 0–255): bare tilled soil, the green of the
 *  growing crop, its ripe colour (the corn's tan, the soybeans' yellow then brown, the wheat's gold),
 *  the pale stubble. */
export function cropWash(crop: Crop, s: { h: number; ripe: number; stubble: boolean; bare: boolean }): [number, number, number] {
  if (s.stubble) return crop === 'wheat' || crop === 'swheat' ? [196, 178, 122] : [172, 156, 112];
  const soil: [number, number, number] = [138, 112, 84];
  const green: [number, number, number] = crop === 'soy' ? [104, 140, 64] : crop === 'corn' ? [92, 128, 60] : [118, 150, 70];
  const ripe: [number, number, number] = crop === 'soy' ? [190, 160, 70] : crop === 'corn' ? [186, 164, 110] : [214, 182, 96];
  const g = Math.min(1, s.h * 1.6), mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as [number, number, number];
  return mix(mix(soil, green, s.bare ? 0 : g), ripe, s.ripe);
}

const f = (x: number) => x.toFixed(3);
/** The crops' calendar for the crop shader (grass.ts): cropStage's sum on uYear, for crop index k
 *  (CROPS) and the field's number n — vec4(height, ripeness, stubble, bare). */
export const GLSL_CROPS = /* glsl */ `
vec4 cropStage(float k, float n) {
  float y = uYear, sh = (n - 0.5) * 0.04;
${CROPS.map((c, i) => {
  const [p0, p1, r0, r1, h0, h1] = CROP_CAL[c];
  const cut = `(${f(h0)} + ${f(h1 - h0)} * n)`;
  const body = c === 'wheat'
    ? `    if (y >= 0.7 + sh || y < ${f(p0)} + sh) return vec4(0.22 * smoothstep(0.7, 0.76, y >= 0.7 ? y : y + 1.0), 0.0, 0.0, y >= 0.7 && y < 0.72 ? 1.0 : 0.0);
    if (y >= ${cut}) return vec4(0.0, 1.0, 1.0, 0.0);
    return vec4(0.22 + 0.78 * smoothstep(${f(p0)} + sh, ${f(p1)} + sh, y), smoothstep(${f(r0)} + sh, ${f(r1)} + sh, y), 0.0, 0.0);`
    : `    if (y < ${f(p0)} + sh) return (y > 0.85 || y < 0.2) ? vec4(0.0, 0.0, 1.0, 0.0) : vec4(0.0, 0.0, 0.0, 1.0);
    if (y >= ${cut}) return vec4(0.0, 1.0, 1.0, 0.0);
    return vec4(smoothstep(${f(p0)} + sh, ${f(p1)} + sh, y), smoothstep(${f(r0)} + sh, ${f(r1)} + sh, y), 0.0, 0.0);`;
  return `  if (k < ${i}.5) {\n${body}\n  }`;
}).join('\n')}
  return vec4(0.0);
}
`;
