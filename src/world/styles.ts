// Phase I — regional style engine. regionStyle(lat, lon) → how a place *looks*: climate, the
// building family (materials + palettes + roof habits + window vocabulary), tree species and
// greens, ground dryness, driving side. Pure data lookups on coordinates — never place names
// (AGENTS.md rule): a coarse Köppen approximation from latitude + continental-scale boxes
// (deserts, Mediterranean coasts, continental interiors), and a coarse world-region code.
//
// It is deliberately coarse (±a few hundred km at climate borders). The upgrade path is a real
// raster — Beck et al. Köppen-Geiger (CC BY 4.0) at ~0.5° baked to a byte grid + WorldCover —
// behind the same function; every consumer keeps its signature.
//
// Every feeder uses it: baked regions derive their style from the manifest origin (or an
// explicit meta.style), virtual ?at= manifests emit meta.style, and the tile worker receives
// the key at init — so synth, hybrid, real-lite and baked tiles in one session agree.
//
// In the lower 48 the key also carries where the place is in the land's life (world/ecoregions.ts:
// the region of docs/REGIONAL_LIFE.md §2, the EPA ecoregion and the state), which the casts read —
// the trees' species and mix, the moss, the gardens, the forest floor, the animals.
import { ecoAt, PNW_DRY, type EcoRegion } from './ecoregions';

export type Climate = 'tropical' | 'arid' | 'mediterranean' | 'temperate' | 'continental' | 'boreal' | 'polar';
export type Family = 'clapboard' | 'brick' | 'nordic' | 'stucco' | 'adobe' | 'tropical' | 'eastasian';
export type WorldRegion = 'na' | 'latam' | 'eu' | 'mena' | 'africa' | 'sasia' | 'easia' | 'seasia' | 'oceania' | 'north';

export interface RegionStyle {
  key: string; // `${climate}/${family}/${L|R}/${region}/${sub}/${eco}.${l3}.${state}` — what meta.style stores
  climate: Climate;
  family: Family;
  region: WorldRegion;
  /** A building-culture subregion within a world region (North America: south / midwest /
   *  northeast / mountain / pnw) — what houses are clad in there. '' when not refined. */
  sub: string;
  driveLeft: boolean;
  facadeHouse: number[]; facadeShop: number[]; facadeLarge: number[];
  roof: number[]; flatRoof: number[];
  trim: number; // default window/door casing colour
  pitch: [number, number]; // roof pitch range (rise/run) for pitched roofs
  roofMix: [number, number]; // synth lots: P(gable), P(hip), rest flat
  windowCode: number; // 0 N.American sash+shutters · 1 European casement · 2 Mediterranean shuttered · 3 Nordic · 4 deep-set small
  shutterP: number; // share of houses with shutters (windowCode 0/2)
  trees: [number, number, number, number, number]; // weights: round deciduous, oak, shrub, pine, spruce
  treeDensity: number; // multiplier on the procedural tree scan
  greens: number[]; // canopy palette
  biome: [number, number, number, number]; // ground: dry (0..1), lush, cold/dark, reserved
  /** Moss on the trees' bark, 0–1 (propMaterial, U.uMoss): the westside Northwest's trunks wrapped
   *  in it, a damp Eastern wood's north sides green, a desert's bare. */
  moss: number;
  water: WaterLook;
  /** Where the place is in the lower 48's life (world/ecoregions.ts): one of the sixteen regions
   *  whose plants and animals belong there — '' outside the lower 48, where the casts fall back to
   *  the climate's. */
  eco: EcoRegion | '';
  /** Its EPA Level III ecoregion (1–85; 0 outside) and its state's postal code ('' outside). */
  l3: number;
  state: string;
}

/** The colour of a region's water, sRGB: the sea's deep and shallow washes, and fresh water's
 *  (rivers, lakes). Read off the Forel-Ule scale — the colour of natural water, 1 indigo … 21 cola,
 *  that satellite ocean-colour climatologies (ESA OC-CCI) put on every coast: the clear blue of the
 *  subtropics over white sand, the green-steel of a cold, plankton-rich sound, the olive of
 *  marsh-fed Gulf water, glacial flour's milky jade. */
export interface WaterLook { deep: number; shallow: number; riverDeep: number; riverShallow: number }

type Box = [number, number, number, number]; // latMin, latMax, lonMin, lonMax
const inside = (lat: number, lon: number, b: Box) => lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3];
const any = (lat: number, lon: number, bs: Box[]) => bs.some((b) => inside(lat, lon, b));

// Coarse climate boxes (continental scale). Order matters: deserts, then Mediterranean.
const DESERT: Box[] = [
  [15, 31, -17, 33], // Sahara
  [12, 32, 34, 59], // Arabia
  [25, 38, 52, 71], // Iran / Afghanistan / Pakistan plateau
  [24, 30, 68, 75.5], // Thar
  [37, 48, 51, 75], // Central Asian steppe-desert
  [36, 45.5, 75, 112], // Taklamakan / Gobi
  [-31, -19, 117, 143], // Australian interior
  [-29, -17, 11.5, 25], // Namib / Kalahari
  [2, 12, 40, 51.5], // Horn of Africa
  [24, 37.5, -117.5, -103], // US Southwest / N. Mexico
  [-30, -4, -81.5, -69.5], // Atacama / coastal Peru
  [-50, -38, -71, -63], // Patagonian steppe
];
const MED: Box[] = [
  [30, 45.5, -10, 37], // Mediterranean basin
  [32, 42.5, -124.5, -117.5], // California
  [-38, -30, -74, -70], // central Chile
  [-36, -30, 114, 120], // SW Australia
  [-35, -32.5, 17.5, 21], // Western Cape
];
const LEFT: Box[] = [
  [49.8, 61, -11, 2], // Britain + Ireland
  [24, 46, 128, 146], // Japan
  [5, 37, 60, 93], // Indian subcontinent (+ Sri Lanka, Nepal, Bangladesh)
  [-11, 21, 95, 141], // Thailand / Malaysia / Indonesia (Myanmar drives right — tolerated)
  [-35, -8, 11.5, 41], // southern Africa
  [-48, -9, 112, 179], // Australia + New Zealand
  [-4, 5, 29, 42], // Kenya / Uganda / Tanzania
];

/** North American building-culture subregion (coarse boxes, like the climate ones): the brick
 *  South and Midwest, the clapboard Northeast, the mountain West, the shingle-and-cedar Northwest.
 *  California and the desert Southwest are already their own families (stucco / adobe). */
/** The Cascades' crest, south to north (lat, lon): west of it the marine Northwest — fir, cedar and
 *  moss, mild wet winters — and east of it the dry side, the Mountain West's ponderosa, juniper and
 *  sage under cold winters (docs/regional-life/16-pnw.md). */
const CASCADE_CREST: [number, number][] = [[42, -122.2], [43, -122.1], [44, -121.85], [45.3, -121.7], [46.2, -121.5], [47.4, -121.4], [48.5, -121.1], [49, -120.8]];
export function westOfCascades(lat: number, lon: number) {
  const C = CASCADE_CREST;
  let crest = lat <= C[0][0] ? C[0][1] : C[C.length - 1][1];
  for (let i = 0; i + 1 < C.length; i++) if (lat >= C[i][0] && lat <= C[i + 1][0]) crest = C[i][1] + ((lat - C[i][0]) / (C[i + 1][0] - C[i][0])) * (C[i + 1][1] - C[i][1]);
  return lon < crest;
}
export function naSub(lat: number, lon: number): string {
  if (lon <= -117 && lat >= 42) return westOfCascades(lat, lon) ? 'pnw' : 'mountain';
  if (lon > -117 && lon <= -104) return 'mountain';
  if (lat < 36.8 && lon > -104) return 'south';
  if (lon > -104 && lon < -84.5) return 'midwest';
  if (lon >= -84.5) return lat < 36.8 ? 'south' : 'northeast';
  return '';
}

export function worldRegion(lat: number, lon: number): WorldRegion {
  if (lat > 60 || lat < -60) return 'north';
  if (lon >= -170 && lon < -50) return lat > 23 ? 'na' : 'latam';
  if (lon >= -50 && lon < -30) return 'latam';
  if (lat >= 35 && lon >= -30 && lon < 45) return 'eu';
  if (lat >= 45 && lon >= 45) return lat >= 50 || lon < 90 ? 'eu' : 'easia';
  if (lat >= 12 && lon >= -30 && lon < 63) return 'mena';
  if (lon >= -30 && lon < 52) return 'africa';
  if (lon >= 60 && lon < 92 && lat >= 5) return 'sasia';
  if (lat < -10 && lon >= 110) return 'oceania';
  if (lat < 18 && lon >= 92) return 'seasia';
  if (lon >= 92) return 'easia';
  return 'mena';
}

export function climateAt(lat: number, lon: number): Climate {
  const L = Math.abs(lat);
  if (L > 66.5 || lat < -60 || inside(lat, lon, [59, 84, -74, -11])) return 'polar'; // + Greenland
  if (any(lat, lon, DESERT)) return 'arid';
  if (any(lat, lon, MED)) return 'mediterranean';
  if (L < 23.5) return 'tropical';
  if (lat > 24 && lat < 27.5 && lon > -82.5 && lon < -79.5) return 'tropical'; // S. Florida
  // Continental interiors: maritime west coasts stay temperate.
  const na = lon >= -170 && lon < -50, eura = lon >= 20 && lon < 180;
  if (lat >= 55 && (na || (eura && !(lon < 30 && lat < 63)))) return 'boreal';
  if (lat >= 60) return 'boreal'; // Scandinavia north of the maritime rim
  if (lat >= 58.5 && lon >= 8 && lon < 32) return 'boreal'; // Oslo/Stockholm/Helsinki — east of Norway's maritime coast
  if (na && lat >= 41.5 && lon > -120) return 'continental';
  if (eura && lat >= 45 && lon >= 25) return 'continental';
  if (lat >= 35 && lat < 45 && lon >= 110 && lon < 131) return 'continental'; // N. China / Korea
  return 'temperate';
}

function familyOf(c: Climate, r: WorldRegion): Family {
  if (c === 'polar' || c === 'boreal') return r === 'na' ? 'clapboard' : 'nordic';
  if (c === 'arid') return 'adobe';
  if (c === 'mediterranean') return r === 'na' ? 'stucco' : 'stucco';
  if (c === 'tropical') return r === 'latam' || r === 'africa' ? 'stucco' : 'tropical';
  if (r === 'na' || r === 'oceania') return 'clapboard';
  if (r === 'eu') return c === 'continental' ? 'nordic' : 'brick';
  if (r === 'easia') return 'eastasian';
  return 'stucco';
}

// ---- palettes (sRGB). clapboard is the original shore-town set: baked NJ must not change. ----
const PAL: Record<Family, Pick<RegionStyle, 'facadeHouse' | 'facadeShop' | 'facadeLarge' | 'roof' | 'flatRoof' | 'trim' | 'pitch' | 'roofMix' | 'windowCode' | 'shutterP'>> = {
  clapboard: {
    facadeHouse: [0xf2eee4, 0xe8e2d4, 0xf4f1ea, 0xbdb8ad, 0xa39f95, 0xaec2d1, 0x93adc2, 0xc9d8e0, 0xb7c1a3, 0xeee0aa, 0xdac9a6, 0xe9c7b3, 0xbbdace, 0x55657b, 0x5d5f63, 0xd9d4c4, 0x8f7c66],
    facadeShop: [0xa65a44, 0x3f8f8a, 0xf0dc9a, 0xf3efe6, 0xc9d9e2, 0x7fa0b8, 0xe1b48f, 0x9a4b50, 0xd8d0bf],
    facadeLarge: [0xe9e4d8, 0xd3cbbb, 0xbfc7cc, 0xc9b99f, 0xf1ede4],
    roof: [0x6b6b6b, 0x55585c, 0x3f4246, 0x7a6252, 0x8a4b3b, 0x5d6b58, 0x9aa3a8, 0x4b4f57, 0x74706a],
    flatRoof: [0x8c8a85, 0x9d9a92, 0x77757a, 0xa9a59a],
    trim: 0xf3f0e8, pitch: [0.5, 0.82], roofMix: [0.6, 0.25], windowCode: 0, shutterP: 0.45,
  },
  brick: {
    facadeHouse: [0x9c5a44, 0xa8674f, 0x8a4f3c, 0xb07a5c, 0x7e4a3a, 0xe9e1cf, 0xd8cdb8, 0xbdb7ab, 0xc98f6d, 0xa3624b],
    facadeShop: [0x2f4a3a, 0x6b2b24, 0xe9e1cf, 0x23364a, 0x9c5a44, 0xd8cdb8, 0x3a2e46],
    facadeLarge: [0xa8674f, 0xd8cdb8, 0x8a4f3c, 0xc9bfae, 0xe4dccb],
    roof: [0x5a5d63, 0x4a4d52, 0x8e4a36, 0xa25a3f, 0x6d4b3e, 0x3f4247],
    flatRoof: [0x7d7b77, 0x8c8a85, 0x6f6d6a],
    trim: 0xf1ede2, pitch: [0.75, 1.05], roofMix: [0.7, 0.2], windowCode: 1, shutterP: 0.04,
  },
  nordic: {
    facadeHouse: [0x8f2f25, 0x9b3a2c, 0xd9a441, 0xefece4, 0xe8d28a, 0x7d8fa0, 0x6f8a6a, 0xf1ede2, 0xc9b27a, 0x5f6f7c],
    facadeShop: [0xefece4, 0x8f2f25, 0x2f4a5a, 0xd9a441, 0x6f8a6a],
    facadeLarge: [0xe8e2d4, 0xd9c79a, 0xbfc5c8, 0xa9b3b8, 0xefe6cf],
    roof: [0x3a3c40, 0x2f3134, 0x8a3a2c, 0x4a4d52, 0x5a4a40],
    flatRoof: [0x6f6d6a, 0x5c5b59],
    trim: 0xf6f3ea, pitch: [0.7, 1.0], roofMix: [0.85, 0.1], windowCode: 3, shutterP: 0.0,
  },
  stucco: {
    facadeHouse: [0xf4efe6, 0xefe7d6, 0xe3c08a, 0xd99a6c, 0xe6b8a8, 0xf0dc9e, 0x9fc0d8, 0xf6f1e8, 0xdcc3a0, 0xc97f5a],
    facadeShop: [0xf4efe6, 0xe3c08a, 0x9fc0d8, 0xd99a6c, 0x6f9a8a, 0xf0dc9e],
    facadeLarge: [0xf1ece2, 0xe6d7bd, 0xd8c6a8, 0xefe4cf, 0xcbbca4],
    roof: [0xb45a3c, 0xa84e34, 0xc0673f, 0x9c4a32, 0xb8704e],
    flatRoof: [0xd8cdb8, 0xc9bca4, 0xe0d6c2],
    trim: 0xf6f2ea, pitch: [0.35, 0.55], roofMix: [0.25, 0.4], windowCode: 2, shutterP: 0.55,
  },
  adobe: {
    facadeHouse: [0xd8b98c, 0xcfa878, 0xe2cfa6, 0xc08a5e, 0xefe8da, 0xd9c3a0, 0xb9936a, 0xe8dcc2],
    facadeShop: [0xefe8da, 0xd8b98c, 0x8fb0b8, 0xc08a5e, 0xe2cfa6],
    facadeLarge: [0xe2cfa6, 0xd8c6a8, 0xefe4cf, 0xcdb48c],
    roof: [0xb8704e, 0xa86a4a, 0x9c7a5a],
    flatRoof: [0xd8c3a0, 0xcbb38c, 0xe0cfae, 0xbfa37c],
    trim: 0xe9ddc4, pitch: [0.3, 0.45], roofMix: [0.08, 0.07], windowCode: 4, shutterP: 0.0,
  },
  tropical: {
    facadeHouse: [0xf2d06b, 0x8fcfc0, 0xf2a58e, 0xfaf7ef, 0x9ec7e8, 0xd6e89a, 0xe89a8e, 0xf6e7b8, 0x7fbfa8],
    facadeShop: [0xf2d06b, 0x3f8f8a, 0xf2a58e, 0xfaf7ef, 0x9ec7e8],
    facadeLarge: [0xf4efe6, 0xe9e4d8, 0xd8e4e0, 0xefe2c8],
    roof: [0x9aa3a8, 0x8a4b3b, 0x5f7f6a, 0xa7473a, 0x7d8a90],
    flatRoof: [0xc9c4ba, 0xb8b3a8, 0xd8d2c4],
    trim: 0xfaf7ef, pitch: [0.35, 0.55], roofMix: [0.35, 0.45], windowCode: 2, shutterP: 0.3,
  },
  eastasian: {
    facadeHouse: [0xe8e6e0, 0xcfcac0, 0xb8b4ab, 0xefece6, 0xd9d2c4, 0xa8a49c, 0xc9c0ae],
    facadeShop: [0xefece6, 0xd9d2c4, 0x8a3a30, 0x2f3f4f, 0xe8e6e0],
    facadeLarge: [0xe8e6e0, 0xd3d0c8, 0xbfbcb4, 0xc9c6be],
    roof: [0x4a5058, 0x3d434b, 0x5a6068, 0x6b5a4a, 0x2f3438],
    flatRoof: [0x9a9892, 0x8c8a85, 0xa9a7a0],
    trim: 0xe9e6de, pitch: [0.45, 0.65], roofMix: [0.35, 0.45], windowCode: 1, shutterP: 0.0,
  },
};

// Vegetation per climate. Tree kinds: round deciduous, oak, shrub, pine, spruce.
const VEG: Record<Climate, Pick<RegionStyle, 'trees' | 'treeDensity' | 'greens' | 'biome' | 'moss'>> = {
  temperate: { trees: [5.5, 2.5, 1, 1.4, 0.6], treeDensity: 1, greens: [0x4d6a31, 0x5b7536, 0x6a823e, 0x55703a, 0x72893f, 0x3f5a2e], biome: [0, 0, 0, 0], moss: 0.25 },
  continental: { trees: [4, 2, 1, 2, 2.5], treeDensity: 1, greens: [0x4a6630, 0x56703a, 0x3f5a2e, 0x61793a, 0x4e6a3e], biome: [0.05, 0, 0.1, 0], moss: 0.2 },
  boreal: { trees: [1, 0, 1, 3, 7], treeDensity: 1.2, greens: [0x3a5230, 0x2f4a2e, 0x46603a, 0x2e4630, 0x566e3e], biome: [0, 0, 0.35, 0], moss: 0.35 },
  polar: { trees: [0, 0, 3, 0, 1], treeDensity: 0.15, greens: [0x5a6a48, 0x4e5e42, 0x66704e], biome: [0.25, 0, 0.55, 0], moss: 0.1 },
  mediterranean: { trees: [2, 1.5, 3, 3.5, 0], treeDensity: 0.7, greens: [0x5f6f38, 0x6e7a3e, 0x55653a, 0x7a8045, 0x4a5a34], biome: [0.45, 0, 0, 0], moss: 0.1 },
  arid: { trees: [0.3, 0, 6, 1, 0], treeDensity: 0.22, greens: [0x6e7442, 0x7d7a48, 0x5f6a3e, 0x8a8452], biome: [0.9, 0, 0, 0], moss: 0 },
  tropical: { trees: [6, 1.5, 3, 0.2, 0], treeDensity: 1.25, greens: [0x3f7a2e, 0x4a8a34, 0x2f6a2a, 0x5a9a3a, 0x3a6e30], biome: [0, 0.6, 0, 0], moss: 0.3 },
};

// Subregions whose woods aren't their climate's: the Pacific Northwest — Douglas fir and cedar
// (the spruce and pine kinds) among bigleaf maples, dense, dark and lush even in late summer;
// the Mountain West's pines, spruce and aspen.
type Veg = Partial<Pick<RegionStyle, 'trees' | 'treeDensity' | 'greens' | 'biome' | 'moss'>>;
const SUB_VEG: Record<string, Veg> = {
  // (the westside's trunks and limbs wrapped in moss: one of the mossiest places on Earth)
  pnw: { trees: [3, 0.8, 1, 1.6, 4.5], treeDensity: 1.25, greens: [0x3d6632, 0x4a7539, 0x33582e, 0x56803e, 0x2f4f2c, 0x5f8a44], biome: [0, 0.35, 0.05, 0], moss: 1 },
  mountain: { trees: [1.5, 0.3, 2, 3.5, 3], treeDensity: 0.8, moss: 0.1 },
  south: { moss: 0.35 }, // (the humid South's north sides; its Spanish moss hangs, a model of its own)
};
// …and in the lower 48, the region's own (docs/regional-life/): the tree kinds' weights where its
// woods aren't its climate's — New England's white pine and hemlock among the maples, Appalachia's
// cove hardwoods, the Southeast's and the Gulf's loblolly and longleaf, Texas's oaks and brush, the
// Ozarks' oak-hickory, the Great Basin's juniper and piñon, the Northwest's dry side's ponderosa —
// and moss on the bark by the region's damp. (The Mid-Atlantic is the shore's original look.)
const ECO_VEG: Partial<Record<EcoRegion | 'pnw-dry', Veg>> = {
  'new-england': { trees: [4.2, 2, 1, 2.6, 2], moss: 0.4 },
  'upstate-ny': { trees: [4.8, 1.8, 1, 2, 2], moss: 0.4 },
  appalachia: { trees: [5.5, 3, 1, 1, 0.5], moss: 0.45 },
  southeast: { trees: [4, 2.6, 1, 3, 0], moss: 0.35 },
  florida: { moss: 0.35 },
  gulf: { trees: [4.5, 2.6, 1, 2.4, 0], moss: 0.45 },
  texas: { trees: [3, 4.2, 2.2, 0.6, 0], moss: 0.15 },
  plains: { trees: [5, 1.4, 2, 0.6, 0.6], moss: 0.1 },
  midwest: { trees: [5.5, 3, 1, 0.8, 0.6], moss: 0.25 },
  ozarks: { trees: [4.2, 4, 1, 1.2, 0], moss: 0.3 },
  rockies: { moss: 0.15 },
  'desert-sw': { moss: 0 },
  'great-basin': { trees: [0.8, 0.2, 5.5, 1.6, 0.4], moss: 0.05 },
  california: { moss: 0.15 },
  'pnw-dry': { trees: [1.2, 0.3, 2.2, 4.2, 0.6], treeDensity: 0.8, moss: 0.1 },
};
/** The westside Northwest: west of the Cascades' crest (naSub) and, in the lower 48, not in a dry-side
 *  ecoregion — the Douglas fir, cedar and hemlock, the moss, the sword fern. (The Cascades' ecoregion
 *  straddles the crest: its east-slope towns are the crest line's to call.) */
export const westside = (s: Pick<RegionStyle, 'sub' | 'eco' | 'l3' | 'climate'>) =>
  s.sub === 'pnw' && s.climate !== 'arid' && s.climate !== 'continental' && (!s.eco || (s.eco === 'pnw' && !PNW_DRY.has(s.l3)));

// Water per climate (temperate is the original shore's Atlantic: baked NJ must not change), then
// per climate + subregion where the coast's water isn't its climate's.
const SHORE: WaterLook = { deep: 0x2c4f6e, shallow: 0x5fa3a0, riverDeep: 0x3d5a5c, riverShallow: 0x7a9a84 };
const WATER: Record<Climate, WaterLook> = {
  temperate: SHORE,
  continental: SHORE,
  boreal: { deep: 0x283f52, shallow: 0x4f7a80, riverDeep: 0x2f4448, riverShallow: 0x5f7a70 }, // dark, tannin-tinged
  polar: { deep: 0x2a4458, shallow: 0x5f8f98, riverDeep: 0x4f6f78, riverShallow: 0x8fb0b0 }, // glacial flour
  mediterranean: { deep: 0x234c74, shallow: 0x4f9aa4, riverDeep: 0x3d5a5c, riverShallow: 0x7a9a84 },
  arid: { deep: 0x245a80, shallow: 0x55a8a8, riverDeep: 0x3f6468, riverShallow: 0x7fa296 }, // desert reservoirs
  tropical: { deep: 0x1c5a8a, shallow: 0x40b8b4, riverDeep: 0x3f4f3a, riverShallow: 0x7f8a5c }, // turquoise over sand; tea-dark swamps
};
const SUB_WATER: Record<string, WaterLook> = {
  // Puget Sound, the Salish Sea, the Columbia: cold, deep, green with plankton — green-steel, never blue
  'temperate/pnw': { deep: 0x28423f, shallow: 0x4e6c63, riverDeep: 0x2e4846, riverShallow: 0x5f7f6c },
  // the Gulf and the Carolina sounds: marsh-fed, silty — olive over grey-green
  'temperate/south': { deep: 0x33545a, shallow: 0x6f9580, riverDeep: 0x4a5a48, riverShallow: 0x8a9070 },
};

const cache = new Map<string, RegionStyle>();

/** The full style for a meta.style key (`climate/family/L|R/region/sub/eco.l3.state`), or null if malformed. */
export function styleByKey(key: string): RegionStyle | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, f, side, reg, sub, place] = key.split('/');
  if (!(c in VEG) || !(f in PAL)) return null;
  const [e, l3, state] = (place ?? '').split('.');
  const eco = (ECO_REGION_SET.has(e) ? e : '') as EcoRegion | '';
  const base = { sub: sub ?? '', eco, l3: eco ? +l3 || 0 : 0, climate: c as Climate };
  const water = SUB_WATER[`${c}/${sub ?? ''}`] ?? WATER[c as Climate];
  const veg = eco === 'pnw' && !westside(base) ? 'pnw-dry' : eco;
  const s: RegionStyle = { key, climate: c as Climate, family: f as Family, region: (reg as WorldRegion) || 'na', sub: sub ?? '', driveLeft: side === 'L', ...PAL[f as Family], ...VEG[c as Climate], ...(SUB_VEG[sub ?? ''] ?? {}), ...((veg && ECO_VEG[veg]) || {}), water, eco, l3: base.l3, state: eco ? state ?? '' : '' };
  cache.set(key, s);
  return s;
}
const ECO_REGION_SET = new Set<string>(['new-england', 'upstate-ny', 'mid-atlantic', 'appalachia', 'southeast', 'florida', 'gulf', 'texas', 'plains', 'midwest', 'ozarks', 'rockies', 'desert-sw', 'great-basin', 'california', 'pnw']);
/** A place's key segment: its region, ecoregion and state — '' outside the lower 48. */
const placeOf = (lat: number, lon: number) => { const e = ecoAt(lat, lon); return e ? `${e.region}.${e.l3}.${e.state}` : ''; };

export function regionStyle(lat: number, lon: number): RegionStyle {
  const climate = climateAt(lat, lon);
  const region = worldRegion(lat, lon);
  const family = familyOf(climate, region);
  const left = any(lat, lon, LEFT);
  const sub = region === 'na' ? naSub(lat, lon) : '';
  const place = region === 'na' ? placeOf(lat, lon) : '';
  return styleByKey(`${climate}/${family}/${left ? 'L' : 'R'}/${region}${sub || place ? '/' + sub : ''}${place ? '/' + place : ''}`)!;
}

/** Where a place is, for the foundry's casts (flora.ts broadMix / understoryMix, fauna.ts faunaMix):
 *  its climate and subregion, its region and ecoregion in the lower 48, the Northwest's westside. */
export const castOf = (s: RegionStyle) => ({ climate: s.climate as string, sub: s.sub, eco: s.eco as string, l3: s.l3, west: westside(s), state: s.state });

/** meta.style wins (lets a baked region pin its look); else derive from the origin. A key pinned
 *  before the regions (five segments) takes its place in the land's life from the origin. */
export function styleFor(meta: { style?: string } | undefined | null, origin: { lat: number; lon: number }): RegionStyle {
  const pinned = meta?.style ? styleByKey(meta.style) : null;
  if (pinned && !pinned.eco && pinned.region === 'na' && pinned.key.split('/').length < 6) {
    const place = placeOf(origin.lat, origin.lon);
    if (place) return styleByKey(`${pinned.key.split('/').slice(0, 5).concat(['', '', '', '', '']).slice(0, 5).join('/')}/${place}`) ?? pinned;
  }
  return pinned || regionStyle(origin.lat, origin.lon);
}

// One region per page/worker — builders read the active style without threading it through
// every signature. Set once at init (main thread + tile worker) before any tile builds.
// (the NJ shore's original look, by key: a lat/lon lookup here would bake the ecoregion grid into every
// bundle that reads a style — the tile worker gets its place in the key)
let active: RegionStyle = styleByKey('temperate/clapboard/R/na/northeast')!;
export function setActiveStyle(s: RegionStyle) { active = s; }
export function activeStyle(): RegionStyle { return active; }

/** Weighted pick with a [0,1) draw — deterministic given the draw. */
export function pickWeighted(w: readonly number[], r: number): number {
  let sum = 0;
  for (const v of w) sum += v;
  let t = r * sum;
  for (let i = 0; i < w.length; i++) if ((t -= w[i]) < 0) return i;
  return w.length - 1;
}
