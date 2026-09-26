// Per-building recipe (Phase I + J2): every look decision for one building as a pure function of
// its stable seed `bd.s`, the region style, and whatever real data the feeder carried (fc/rc,
// kind, height). No rng sequences — the same building resolves identically in every tile, every
// session, every feeder (baked / real-lite / hybrid / synth). Real data always wins: a mapped
// facade colour picks the siding that colour implies instead of overriding it.
import type { Building } from './data';
import type { RegionStyle } from './styles';
import { hash01 } from '../core/rng';

// Shader codes (buildings.ts): siding rides in the fraction of vInfo.y (kind + code/10), roof
// material in vInfo.w on roof faces (walls use that slot for the foundation height).
export const SIDING = { clapboard: 0, shingle: 1, brick: 2, stucco: 3, batten: 4 } as const;
export const ROOFMAT = { asphalt: 0, metal: 1, tile: 2, slate: 3, shake: 4 } as const;

export interface Recipe {
  facade: number; // sRGB
  roof: number;
  trim: number;
  siding: number;
  roofMat: number;
  pitch: number; // rise/run for pitched roofs (steep when the house is planned 1½-storey with dormers)
  basePitch: number; // the style pitch — used when no dormer actually fits the roof
  dormers: number; // wanted dormers on the street-facing roof plane (builder checks they fit)
  bay: boolean; // a projecting bay window beside the front door
  downspouts: boolean;
  chimney: 0 | 1 | 2; // none · ridge stack · exterior side chimney up a gable end
}

const h = (s: number, k: number) => hash01((s ^ k) >>> 0);
const pick = <T>(a: readonly T[], r: number) => a[Math.min(a.length - 1, Math.floor(r * a.length))];

// Does a colour read as brick? (reddish-brown, not too light) — lets mapped materials/colours
// choose the siding instead of the dice.
function brickish(c: number) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  return r > g * 1.18 && r > b * 1.3 && lum < 0.62 && lum > 0.18;
}

// Real roof colours (tags / aerial imagery) pulled into a roofing gamut: aerial samples carry
// haze, tree shadow and sea glare that read as sage/teal "sea-foam" roofs street after street.
// Keep the measured hue family and lightness order; cap chroma (greens/blues hardest, reds
// and browns gentler) and clamp lightness into what shingles, slate, metal and tile span.
export function roofGamut(c: number): number {
  let r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let hdeg = 0;
  if (d > 1e-6) hdeg = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hdeg *= 60;
  let s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const warm = hdeg < 45 || hdeg > 330; // reds, terracotta, browns
  s = Math.min(s, warm ? 0.42 : hdeg < 75 ? 0.22 : 0.1);
  const L = Math.max(0.16, Math.min(0.58, l));
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s, p = 2 * L - q;
  const hk = hdeg / 360;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  [r, g, b] = [f(hk + 1 / 3), f(hk), f(hk - 1 / 3)];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

export function recipeFor(bd: Building, st: RegionStyle): Recipe {
  const s = bd.s >>> 0;
  const r1 = hash01(s), r2 = hash01((s ^ 0x5bd1e995) >>> 0); // the builder's historic draws — kept so NJ colours don't reshuffle
  const house = bd.k === 'house', shop = bd.k === 'commercial', large = bd.k === 'large';
  const pal = shop ? st.facadeShop : large ? st.facadeLarge : st.facadeHouse;
  let facade = bd.fc ?? pal[Math.floor(r1 * pal.length)];
  if (bd.k === 'church' && bd.fc == null) facade = 0xf4f1ea;
  if (bd.k === 'lighthouse' && bd.fc == null) facade = 0x9a7b62;
  const flat = bd.roof === 'flat';
  const roof = bd.rc != null ? roofGamut(bd.rc) : (flat ? st.flatRoof : st.roof)[Math.floor(r2 * (flat ? st.flatRoof.length : st.roof.length))];

  // Siding: brick-coloured walls are brick; otherwise the regional habit by building kind.
  const rs = h(s, 0x51d1);
  let siding: number;
  if (brickish(facade)) siding = SIDING.brick;
  else if (bd.k === 'church' || bd.k === 'lighthouse') siding = st.family === 'clapboard' ? SIDING.clapboard : SIDING.stucco;
  else
    switch (st.family) {
      case 'clapboard': siding = house ? (rs < 0.6 ? SIDING.clapboard : rs < 0.84 ? SIDING.shingle : rs < 0.92 ? SIDING.batten : SIDING.stucco) : rs < 0.45 ? SIDING.stucco : rs < 0.8 ? SIDING.clapboard : SIDING.batten; break;
      case 'brick': siding = SIDING.stucco; break; // light walls in brick country are render
      case 'nordic': siding = rs < 0.55 ? SIDING.batten : rs < 0.9 ? SIDING.clapboard : SIDING.stucco; break;
      case 'tropical': siding = rs < 0.6 ? SIDING.stucco : SIDING.clapboard; break;
      default: siding = rs < 0.92 ? SIDING.stucco : SIDING.clapboard; // stucco, adobe, eastasian
    }

  // Roof material follows the region + the roof colour we ended up with.
  const rr = h(s, 0x7a11);
  let roofMat: number = ROOFMAT.asphalt;
  if (!flat) {
    const rc = roof, R = (rc >> 16) & 255, G = (rc >> 8) & 255;
    const terracotta = R > 140 && R > G * 1.45;
    if (st.family === 'stucco' || st.family === 'adobe' || (st.family === 'tropical' && terracotta)) roofMat = terracotta ? ROOFMAT.tile : ROOFMAT.metal;
    else if (st.family === 'tropical') roofMat = ROOFMAT.metal;
    else if (st.family === 'nordic') roofMat = rr < 0.45 ? ROOFMAT.metal : terracotta ? ROOFMAT.tile : ROOFMAT.asphalt;
    else if (st.family === 'brick') roofMat = terracotta ? ROOFMAT.tile : rr < 0.6 ? ROOFMAT.slate : ROOFMAT.asphalt;
    else if (st.family === 'eastasian') roofMat = rr < 0.7 ? ROOFMAT.tile : ROOFMAT.metal;
    else roofMat = rr < 0.08 ? ROOFMAT.metal : rr < 0.16 ? ROOFMAT.shake : ROOFMAT.asphalt; // N. American
  }

  // Trim: white/cream mostly; dark trim is a regional + brick habit.
  const rt = h(s, 0x3c6e);
  const trim = siding === SIDING.brick && rt < 0.3 ? pick([0x2f3a33, 0x3a3f46, 0xe9e4d8], rt / 0.3) : rt < 0.08 ? 0xe3dcc8 : st.trim;

  const rd = h(s, 0x9d0e);
  const dormers = house && !flat && bd.h >= 7 && bd.fl == null ? (rd < (st.family === 'clapboard' || st.family === 'brick' ? 0.3 : 0.1) ? 1 + Math.floor(h(s, 0x1dd) * 2.6) : 0) : 0;
  // dormered 1½-storey houses carry steep roofs (8/12–12/12) — the attic is a real floor
  const basePitch = st.pitch[0] + r2 * (st.pitch[1] - st.pitch[0]);
  const pitch = dormers ? 0.8 + r2 * 0.22 : basePitch;
  const bay = house && h(s, 0xba7) < (st.family === 'clapboard' || st.family === 'brick' ? 0.22 : 0.06);
  const downspouts = !flat && (house || shop) && h(s, 0xd05) < 0.8;
  const rc2 = h(s, 0xc41);
  const chimney: Recipe['chimney'] = house && !flat && st.climate !== 'tropical' && st.climate !== 'arid' ? (rc2 < 0.42 ? 1 : rc2 < 0.62 ? 2 : 0) : 0;
  return { facade, roof, trim, siding, roofMat, pitch, basePitch, dormers, bay, downspouts, chimney };
}
