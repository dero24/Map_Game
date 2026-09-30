// Per-building recipe (Phase I + J2): every look decision for one building as a pure function of
// its stable seed `bd.s`, the region style, and whatever real data the feeder carried (fc/rc,
// kind, height). No rng sequences — the same building resolves identically in every tile, every
// session, every feeder (baked / real-lite / hybrid / synth). Real data always wins: a mapped
// facade colour picks the siding that colour implies instead of overriding it.
import type { Building } from './data';
import type { RegionStyle } from './styles';
import type { HoodClass } from './hood';
import { hash01 } from '../core/rng';

// Shader codes (buildings.ts): siding rides in the fraction of vInfo.y (kind + code/10), roof
// material in vInfo.w on roof faces (walls use that slot for the foundation height).
export const SIDING = { clapboard: 0, shingle: 1, brick: 2, stucco: 3, batten: 4, glass: 5 } as const;
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

// Towers and urban blocks are stone, brick, concrete and glass whatever the local house paint:
// seven-plus storeys never wear clapboard. Masonry palettes lean brick where brick is the habit.
const TOWER: Partial<Record<RegionStyle['family'], number[]>> & { default: number[] } = {
  brick: [0x9a5a46, 0x8a4f3c, 0xa8674f, 0xc9bfae, 0xd8cdb8, 0x6f4a3c, 0xe4dccb],
  clapboard: [0xd9d0bf, 0xc8bca6, 0xe4ddd0, 0xbdb8ae, 0xa8674f, 0x8a4f3c, 0x9a948a, 0xefe9dc, 0xb9a88c],
  default: [0xe9e4d8, 0xd9d0bf, 0xbdb8ae, 0xc8bca6, 0xefe8da, 0xa9a59c, 0xf3efe6],
};
// North American pre-war walk-ups and loft blocks: red, brown and buff brick
const BRICKS = [0x9a5a46, 0x8a4f3c, 0xa8674f, 0x7e4a3a, 0xb07a5c, 0xc9a27e];
// How much of a North American subregion's housing is brick-clad (the rest siding): Texas and
// Georgia suburbs are brick ranches, New England is clapboard, the Northwest is cedar and
// shingle. (The Northeast stays the original clapboard look — the Jersey shore must not change.)
const BRICK_SHARE: Record<string, number> = { south: 0.55, midwest: 0.35, mountain: 0.22, northeast: 0, pnw: 0.04 };
const HOUSE_BRICKS = [0x9a5a46, 0xa8674f, 0x8a4f3c, 0xb07a5c, 0xc9a27e, 0x7e4a3a, 0xa87a62, 0xbf8f6e];
// row-house fronts that aren't brick: brownstone, limestone, grey stone, painted, buff
const ROWSTONE = [0x7a5a48, 0x6f5040, 0xd9d0bf, 0xbdb8ae, 0xe9e1cf, 0xc9a27e];
// curtain-wall glass tints (blue-grey, green, grey, silver, bronze-dark)
const GLASS = [0x55626e, 0x4a5552, 0x656b72, 0x7d858b, 0x3a4048, 0x5f6e78, 0x6f777c, 0x4a4640];
// by era: the bronze and black boxes of the '60s–'80s; the grey-blue low-e glass of the 2000s
const GLASS_OLD = [0x3a3530, 0x2e2f33, 0x4a4238, 0x343a3e];
const GLASS_NEW = [0x6b7a88, 0x7d8a95, 0x5d6b78, 0x8a949b, 0x707c84];
const pick = <T>(a: readonly T[], r: number) => a[Math.min(a.length - 1, Math.floor(r * a.length))];
// Neighbourhood archetypes (hood.ts; docs/NEIGHBOURHOODS.md) — North American houses only:
// estates wear white and grey clapboard, weathered cedar shingle, some Tudor render and brick,
// under slate and shake; old grids wear painted Victorians; tracts repeat one model a street, in
// a narrow pastel range.
const ESTATE_FACADES = [0xf4f1ea, 0xece8de, 0xdcd8cc, 0xb9b3a7, 0x9a8a74, 0x8f7a63, 0xa9b0a4, 0xe3dccb];
const ESTATE_ROOFS = [0x4a4f57, 0x55585e, 0x3f4347, 0x6b5e52, 0x5d5448];
const PAINTED = [0xc9b27a, 0x6f8a86, 0xa35b4f, 0x5d7091, 0xd8cfb2, 0x7a8f63, 0xb98b6e, 0x8c6f8f];
const TRACT_FACADES = [0xe9e2cf, 0xd7d9cf, 0xc9d3d8, 0xe3d3b8, 0xbfc7b5, 0xeae6dc];
const TRACT_ROOFS = [0x5a5d61, 0x6d6a66, 0x4f5257];
// the old grid is regional: the Midwest's is a brick bungalow belt (dark brick, low hips, the front
// bay), the Northwest's craftsman (stained shingle in deep greens and browns, low wide gables)
const BUNGALOW_BRICKS = [0x7e4a3a, 0x8a4f3c, 0x9a5a46, 0x6f4636, 0xa8674f, 0xb07a5c, 0x8b6a4f];
const CRAFTSMAN = [0x5b6b4f, 0x6b5a45, 0x4f5b5e, 0x7a6a52, 0x8a7a5c, 0x3f4a44, 0xb9ad8e, 0x7d4f3f];
// a desert tract: stucco in sand and adobe tones under red and brown tile
const DESERT_TRACT = [0xe3d3b8, 0xd9c3a0, 0xcdb593, 0xe8dcc6, 0xc9a77f, 0xd8c8ae];
const DESERT_ROOFS = [0xa0553b, 0x8f5a44, 0x7a5a48, 0xb06a4a];

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
  // greens, teals and slate blues never survive: they read teal under a blue sky fill, so they
  // become warm greys (asphalt shingle) — real green roofs are rare enough to lose
  if (hdeg >= 75 && hdeg <= 260) { hdeg = 35; s = Math.min(s, 0.04); }
  const L = Math.max(0.16, Math.min(0.58, l));
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s, p = 2 * L - q;
  const hk = hdeg / 360;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  [r, g, b] = [f(hk + 1 / 3), f(hk), f(hk - 1 / 3)];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** Does this region read a row building (party walls, dense block) as masonry with a flat roof?
 *  North American cities do (NYC walk-ups, Philly and Baltimore rowhouses, brownstones); a
 *  London terrace or an Amsterdam canal house keeps its pitched roof. */
export function rowStyle(bd: Pick<Building, 'at' | 'k'>, st: Pick<RegionStyle, 'region' | 'family'>) {
  return !!bd.at && st.region === 'na' && (bd.k === 'house' || bd.k === 'large') && (st.family === 'clapboard' || st.family === 'brick');
}

export function recipeFor(bd: Building, st: RegionStyle, hood: HoodClass = 'suburb', cellSeed = 0): Recipe {
  const s = bd.s >>> 0;
  const r1 = hash01(s), r2 = hash01((s ^ 0x5bd1e995) >>> 0); // the builder's historic draws — kept so NJ colours don't reshuffle
  const house = bd.k === 'house', shop = bd.k === 'commercial', large = bd.k === 'large';
  const pal = shop ? st.facadeShop : large ? st.facadeLarge : st.facadeHouse;
  let facade = bd.fc ?? pal[Math.floor(r1 * pal.length)];
  if (bd.k === 'church' && bd.fc == null) facade = 0xf4f1ea;
  if (bd.k === 'lighthouse' && bd.fc == null) facade = 0x9a7b62;
  const flat = bd.roof === 'flat';
  const roof = roofGamut(bd.rc ?? (flat ? st.flatRoof : st.roof)[Math.floor(r2 * (flat ? st.flatRoof.length : st.roof.length))]);

  // Blocks and towers (flat, 15 m+): masonry or a glass curtain wall. Real data first (mapped
  // material, era), then height: the taller the tower, the likelier glass; nothing pre-1955 is.
  const tall = bd.h + (bd.lf ?? 0);
  const block = (shop || large) && flat && tall >= 15;
  let glass = false;
  if (bd.ma) glass = /glass|mirror/.test(bd.ma);
  else if (block && tall >= 28) {
    const yr = bd.yr ?? 0;
    const p = yr && yr < 1955 ? 0 : yr >= 1975 ? 0.8 : tall >= 150 ? 0.7 : tall >= 70 ? 0.45 : 0.16;
    glass = h(s, 0x61a5) < p;
  }
  if (bd.fc == null && block && !glass) {
    if (tall >= 24) facade = pick(TOWER[st.family] ?? TOWER.default, h(s, 0x70e1));
    else if (st.region === 'na' && (st.family === 'clapboard' || st.family === 'brick') && h(s, 0x70e2) < 0.4) facade = pick(BRICKS, h(s, 0x70e3));
  }
  if (house && bd.fc == null && !bd.at && st.family === 'clapboard' && h(s, 0xb71c) < (BRICK_SHARE[st.sub] ?? 0)) facade = pick(HOUSE_BRICKS, h(s, 0xb71d));
  if (glass && bd.fc == null) facade = pick(bd.yr && bd.yr < 1990 ? GLASS_OLD : bd.yr && bd.yr >= 2000 ? GLASS_NEW : GLASS, h(s, 0x61a6));
  // North American row buildings (walk-ups, brownstones, rowhouses — party walls in a dense
  // block): brick and stone fronts, not the suburb's siding
  const row = rowStyle(bd, st);
  if (bd.fc == null && row && !glass) facade = h(s, 0x70e4) < 0.55 ? pick(BRICKS, h(s, 0x70e5)) : pick(ROWSTONE, h(s, 0x70e6));

  // Siding: brick-coloured walls are brick; otherwise the regional habit by building kind.
  const rs = h(s, 0x51d1);
  let siding: number;
  if (glass) siding = SIDING.glass;
  else if (brickish(facade)) siding = SIDING.brick;
  else if (block || row) siding = SIDING.stucco; // stone, concrete, render — never wood at this size
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
  const dormers = house && !row && !flat && bd.h >= 7 && bd.fl == null ? (rd < (st.family === 'clapboard' || st.family === 'brick' ? 0.3 : 0.1) ? 1 + Math.floor(h(s, 0x1dd) * 2.6) : 0) : 0;
  // dormered 1½-storey houses carry steep roofs (8/12–12/12) — the attic is a real floor
  const basePitch = st.pitch[0] + r2 * (st.pitch[1] - st.pitch[0]);
  const pitch = dormers ? 0.8 + r2 * 0.22 : basePitch;
  const bay = house && !row && h(s, 0xba7) < (st.family === 'clapboard' || st.family === 'brick' ? 0.22 : 0.06);
  const downspouts = !flat && (house || shop) && h(s, 0xd05) < 0.8;
  const rc2 = h(s, 0xc41);
  const chimney: Recipe['chimney'] = house && !row && !flat && st.climate !== 'tropical' && st.climate !== 'arid' ? (rc2 < 0.42 ? 1 : rc2 < 0.62 ? 2 : 0) : 0;
  const base: Recipe = { facade, roof, trim, siding, roofMat, pitch, basePitch, dormers, bay, downspouts, chimney };
  return hood !== 'suburb' && house && !row && !flat && st.region === 'na' ? archetype(base, bd, hood, cellSeed, st) : base;
}

/** A house's recipe made over by its neighbourhood (mapped colours and materials always win). */
function archetype(r: Recipe, bd: Building, hood: HoodClass, cellSeed: number, st: RegionStyle): Recipe {
  const s = bd.s >>> 0, o = { ...r }, own = bd.fc == null && !bd.ma; // (own: the look is ours to choose)
  const up = bd.h >= 7 && bd.fl == null; // (dormers are for a storey and a half and up)
  if (hood === 'estate') {
    const m = h(s, 0xe52);
    if (own) {
      if (m < 0.1) { o.facade = pick(HOUSE_BRICKS, h(s, 0xe51)); o.siding = SIDING.brick; }
      else { o.facade = pick(ESTATE_FACADES, h(s, 0xe51)); o.siding = m < 0.46 ? SIDING.shingle : m < 0.84 ? SIDING.clapboard : SIDING.stucco; }
    }
    if (bd.rc == null) o.roof = pick(ESTATE_ROOFS, h(s, 0xe55));
    const rm = h(s, 0xe56);
    o.roofMat = rm < 0.32 ? ROOFMAT.slate : rm < 0.48 ? ROOFMAT.shake : ROOFMAT.asphalt;
    o.pitch = Math.max(o.pitch, 0.72 + h(s, 0xe57) * 0.3);
    if (up) o.dormers = h(s, 0xe53) < 0.55 ? 2 + Math.floor(h(s, 0xe58) * 2) : o.dormers;
    o.chimney = h(s, 0xe54) < 0.6 ? 2 : 1;
    o.bay = h(s, 0xe59) < 0.35;
    o.trim = h(s, 0xe5a) < 0.8 ? 0xf2efe6 : 0x2f3a33;
  } else if (hood === 'grid' && st.sub === 'midwest') {
    if (own && h(s, 0x6b1) < 0.75) { o.facade = pick(BUNGALOW_BRICKS, h(s, 0x6b2)); o.siding = SIDING.brick; }
    o.pitch = 0.45 + h(s, 0x6b4) * 0.15;
    o.basePitch = o.pitch;
    o.bay = h(s, 0x6b5) < 0.6;
    if (up) o.dormers = h(s, 0x6b6) < 0.45 ? 1 : 0;
    o.chimney = 1;
    o.trim = h(s, 0x6b7) < 0.5 ? 0xe9e1cf : 0x4a3a30;
  } else if (hood === 'grid' && st.sub === 'pnw') {
    if (own && h(s, 0x6c1) < 0.8) { o.facade = pick(CRAFTSMAN, h(s, 0x6c2)); o.siding = h(s, 0x6c3) < 0.55 ? SIDING.shingle : SIDING.clapboard; }
    o.pitch = 0.5 + h(s, 0x6c4) * 0.2;
    o.basePitch = o.pitch;
    o.bay = h(s, 0x6c5) < 0.25;
    if (up) o.dormers = h(s, 0x6c6) < 0.35 ? 1 : 0;
    o.chimney = h(s, 0x6c8) < 0.7 ? 1 : 0;
    o.trim = h(s, 0x6c7) < 0.6 ? 0xeee6d2 : 0x3a3a32;
  } else if (hood === 'grid') {
    if (own && h(s, 0x6a1) < 0.6) { o.facade = pick(PAINTED, h(s, 0x6a2)); o.siding = h(s, 0x6a3) < 0.75 ? SIDING.clapboard : SIDING.shingle; }
    o.pitch = Math.max(o.pitch, 0.85 + h(s, 0x6a4) * 0.25);
    o.bay = h(s, 0x6a5) < 0.5;
    if (up) o.dormers = h(s, 0x6a6) < 0.15 ? 1 : 0;
    o.chimney = 1;
    o.trim = h(s, 0x6a7) < 0.7 ? 0xf2efe6 : 0x5a4a3a;
  } else if (hood === 'tract' && (st.family === 'adobe' || st.family === 'stucco')) {
    // one model a street cell: low tile hips over stucco
    if (own) { o.facade = pick(DESERT_TRACT, h(s, 0x7c1)); o.siding = SIDING.stucco; }
    if (bd.rc == null) o.roof = pick(DESERT_ROOFS, h(cellSeed, 0x7c4));
    o.roofMat = ROOFMAT.tile;
    o.pitch = o.basePitch = 0.3 + h(cellSeed, 0x7c5) * 0.06;
    o.dormers = 0;
    o.bay = false;
    o.chimney = 0;
  } else if (hood === 'tract') {
    // one model a street cell (the builder's plan), each house its own paint from a narrow range
    const cape = h(cellSeed, 0x7a) < 0.5;
    if (own) { o.facade = pick(TRACT_FACADES, h(s, 0x7b1)); o.siding = h(s, 0x7b2) < 0.9 ? SIDING.clapboard : SIDING.brick; if (o.siding === SIDING.brick) o.facade = pick(HOUSE_BRICKS, h(s, 0x7b3)); }
    if (bd.rc == null) o.roof = pick(TRACT_ROOFS, h(cellSeed, 0x7b4));
    o.roofMat = ROOFMAT.asphalt;
    o.pitch = cape ? 0.82 + h(cellSeed, 0x7b5) * 0.08 : 0.34 + h(cellSeed, 0x7b5) * 0.06;
    o.basePitch = o.pitch;
    o.dormers = cape && bd.fl == null ? 2 : 0;
    o.bay = false;
    o.chimney = h(s, 0x7b6) < (cape ? 0.7 : 0.35) ? 1 : 0;
  }
  return o;
}
