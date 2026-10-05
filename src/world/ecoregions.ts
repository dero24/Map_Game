// Regions as data (docs/REGIONAL_LIFE.md §2): where a place is in the lower 48's life — which of the
// sixteen regions' plants and animals belong there — read from the EPA's Level III ecoregions
// (public domain), baked once into a lat/lon grid of ecoregion codes and states (world/ecoGrid.ts,
// scripts/bake-ecoregions.mjs). Never a place name: a code and a state.
//
// A place's region is its ecoregion's (the code → region table, REGIONAL_LIFE.md §2), save where a
// region's own reference draws its line by state (docs/regional-life/*.md, each file's "Covers"):
// New York City and Long Island are the Mid-Atlantic's, the Front Range cities the Rockies', the
// Florida Panhandle the Gulf's, all of Texas but its desert Texas's, and so on — the rules below.
import { ECO_GRID } from './ecoGrid';

export type EcoRegion =
  | 'new-england' | 'upstate-ny' | 'mid-atlantic' | 'appalachia' | 'southeast' | 'florida' | 'gulf' | 'texas'
  | 'plains' | 'midwest' | 'ozarks' | 'rockies' | 'desert-sw' | 'great-basin' | 'california' | 'pnw';
/** The sixteen, in the reference's order (docs/regional-life/01–16). */
export const ECO_REGIONS: EcoRegion[] = ['new-england', 'upstate-ny', 'mid-atlantic', 'appalachia', 'southeast', 'florida', 'gulf', 'texas', 'plains', 'midwest', 'ozarks', 'rockies', 'desert-sw', 'great-basin', 'california', 'pnw'];
export const ECO_NAME: Record<EcoRegion, string> = {
  'new-england': 'New England', 'upstate-ny': 'Upstate New York', 'mid-atlantic': 'the Mid-Atlantic coast', appalachia: 'Appalachia',
  southeast: 'the Southeast', florida: 'Florida', gulf: 'the Gulf Coast', texas: 'Texas', plains: 'the Great Plains', midwest: 'the Midwest',
  ozarks: 'the Ozarks', rockies: 'the Rocky Mountains', 'desert-sw': 'the Southwest deserts', 'great-basin': 'the Great Basin and Colorado Plateau',
  california: 'California', pnw: 'the Pacific Northwest',
};

/** A place in the lower 48's life: its region, its EPA Level III ecoregion (1–85) and its state. */
export interface EcoPlace { region: EcoRegion; l3: number; state: string }

/** The Northwest east of the Cascades' crest: the Eastern Cascades' slopes, the Columbia Plateau, the
 *  Blue Mountains and Spokane's corner of the Northern Rockies (EPA 9, 10, 11, 15) — ponderosa,
 *  juniper and sage under cold winters, not the westside's fir, cedar and moss
 *  (docs/regional-life/16-pnw.md). */
export const PNW_DRY = new Set([9, 10, 11, 15]);
/** The Northwest's outer coast: the Coast Range (EPA 1) — the Sitka spruce's fog belt. */
export const PNW_COAST = 1;

// ---- REGIONAL_LIFE.md §2: the code → region table ----
const BY_CODE: EcoRegion[] = [];
const put = (r: EcoRegion, codes: number[]) => codes.forEach((c) => (BY_CODE[c] = r));
put('new-england', [58, 59, 82]);
put('upstate-ny', [60, 61, 83]);
put('mid-atlantic', [63, 64, 84]);
put('appalachia', [62, 66, 67, 68, 69, 70, 71]);
put('southeast', [45, 65, 75]);
put('florida', [76]);
put('gulf', [34, 35, 73, 74]);
put('texas', [29, 30, 31, 32, 33]);
put('plains', [25, 26, 27, 28, 42, 43, 44, 46, 48]);
put('midwest', [40, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 72]);
put('ozarks', [36, 37, 38, 39]);
put('rockies', [15, 16, 17, 21, 41]);
put('desert-sw', [14, 23, 24, 79, 81]);
put('great-basin', [12, 13, 18, 19, 20, 22, 80]);
put('california', [5, 6, 7, 8, 85]);
put('pnw', [1, 2, 3, 4, 9, 10, 11, 77, 78]);

// ---- where a region's reference draws its line by state (each file's "Covers") ----
// [states, codes (null: any), region, an extra test on the place (optional)]. First match wins;
// else the code's region.
type Rule = [string[], number[] | null, EcoRegion, ((lat: number, lon: number) => boolean)?];
const RULES: Rule[] = [
  // 01: all six New England states (Cape Cod's pine barrens, the Champlain Valley too)
  [['ME', 'NH', 'VT', 'MA', 'RI', 'CT'], null, 'new-england'],
  // 03: all of New Jersey, Delaware, DC; New York City and Long Island (and the near suburbs); the
  // Philadelphia corner; Maryland and Virginia east of the mountains (the Piedmont north of the James)
  [['NJ', 'DE', 'DC'], null, 'mid-atlantic'],
  [['NY'], null, 'mid-atlantic', (lat, lon) => lat < 41.2 && lon > -74.3],
  [['NY'], null, 'upstate-ny'], // 02: New York north of the NYC suburbs
  [['PA'], [58, 63, 64], 'mid-atlantic'],
  [['PA'], [61, 83], 'midwest'], // 10: the Lake Erie shore of Pennsylvania
  [['PA', 'WV'], null, 'appalachia'], // 04: central and western Pennsylvania, all of West Virginia
  [['MD', 'VA'], [66, 67, 69], 'appalachia'],
  [['VA'], [45], 'southeast', (lat) => lat < 37.5], // 05: Virginia's Southside Piedmont
  [['MD', 'VA'], null, 'mid-atlantic'],
  // 04: all of Kentucky but its Gulf-lowland Purchase; East and Middle Tennessee (West Tennessee and
  // Memphis are 07's); the Carolinas' and Georgia's mountains; Birmingham's ridges and the north of
  // Alabama; southeast Ohio's hills
  [['KY', 'TN'], [73, 74], 'gulf'],
  [['TN'], [65], 'gulf'],
  [['KY', 'TN'], null, 'appalachia'],
  [['NC', 'SC'], [66], 'appalachia'],
  [['NC', 'SC'], null, 'southeast'], // 05: the Carolinas east of the mountains, the coast included
  [['GA'], [66, 67, 68], 'appalachia'],
  [['AL'], [67, 68, 71], 'appalachia'],
  // 07: the Mississippi and Alabama coasts and their southern pine belt; the Delta
  [['AL', 'MS'], [73, 74, 75], 'gulf'],
  [['AL', 'MS'], [65], 'gulf', (lat) => lat < 31.5],
  [['GA', 'AL', 'MS'], null, 'southeast'],
  // 06: the peninsula from about Jacksonville, Gainesville and Ocala south; 07: the Panhandle
  [['FL'], null, 'gulf', (_lat, lon) => lon < -83.7],
  [['FL'], null, 'florida'],
  [['LA'], null, 'gulf'], // 07: all of Louisiana
  // 08: all of Texas, the Panhandle's High Plains too; its Chihuahuan desert is 13's
  [['TX'], [23, 24], 'desert-sw'],
  [['TX'], null, 'texas'],
  // 09: Oklahoma but its Ozark northeast and Ouachita southeast (11's); all of Kansas, Nebraska and
  // the Dakotas but the Black Hills (Rocky Mountain species); the Front Range cities are 12's
  [['OK'], [35, 36, 37, 38, 39], 'ozarks'],
  [['OK', 'KS', 'NE', 'ND', 'SD'], [39], 'ozarks'],
  [['SD'], [17], 'rockies'],
  [['OK', 'KS', 'NE', 'ND', 'SD'], null, 'plains'],
  [['CO'], [25, 26], 'rockies', (_lat, lon) => lon < -104.75],
  // 10: Minnesota but the Red River Valley's and the southwest's prairie; Missouri north of the
  // Ozarks (its Bootheel is 07's); all of Ohio's west, Indiana, Illinois, Michigan, Wisconsin, Iowa
  [['MO', 'AR'], [73, 74], 'gulf'],
  [['AR'], [35], 'gulf'],
  [['OH'], [70], 'appalachia'],
  [['OH', 'IN', 'IL', 'MI', 'WI', 'IA'], null, 'midwest'],
  // 13: New Mexico but its northern mountains (12's) and its northwest (14's: the Navajo Nation, the
  // Four Corners); Arizona below the Mogollon Rim (Flagstaff and the plateau are 14's)
  [['NM'], [22], 'great-basin', (_lat, lon) => lon <= -107.5],
  [['NM'], [22], 'desert-sw'],
  [['AZ'], [23], 'great-basin', (lat) => lat > 35],
  // 15: California but its deserts (13's) and the Modoc Plateau (14's) — the redwood coast, the
  // Klamath and Shasta country too
  [['CA'], [1, 4, 9, 78], 'california'],
  // 16: all of Washington and Oregon but SE Oregon's high desert (14's) — Spokane's corner too
  [['WA', 'OR'], [15], 'pnw'],
];

/** The region a place's ecoregion and state put it in. */
export function regionOf(l3: number, state: string, lat: number, lon: number): EcoRegion | null {
  for (const [states, codes, region, test] of RULES) {
    if (!states.includes(state) || (codes && !codes.includes(l3)) || (test && !test(lat, lon))) continue;
    return region;
  }
  return BY_CODE[l3] ?? null;
}

// ---- the grid ----
const SEARCH = 10; // cells round a sea cell to look for land
let l3Grid: Uint8Array | null = null, stGrid: Uint8Array | null = null;
function decode(b64: string): Uint8Array {
  const n = ECO_GRID.rows * ECO_GRID.cols, g = new Uint8Array(n);
  const bin = atob(b64);
  let i = 0;
  for (let o = 0; o + 1 < bin.length; o += 2) {
    const v = bin.charCodeAt(o), run = bin.charCodeAt(o + 1);
    g.fill(v, i, i + run);
    i += run;
  }
  if (i !== n) throw new Error(`ecoGrid: ${i} cells decoded, ${n} expected`);
  return g;
}
function grids() {
  if (!l3Grid) (l3Grid = decode(ECO_GRID.l3)), (stGrid = decode(ECO_GRID.state));
  return { l3: l3Grid, st: stGrid! };
}

/** The ecoregion and state at a lat/lon: the cell's, or — a coast, an island, a spit the 5 km
 *  cells don't resolve (the Outer Banks are a kilometre wide) — the nearest land cell's within ~50 km.
 *  Null at sea and outside the lower 48. */
export function ecoCell(lat: number, lon: number): { l3: number; state: string } | null {
  const G = ECO_GRID;
  const fr = (lat - G.lat0) / G.step, fc = (lon - G.lon0) / G.step;
  const r0 = Math.floor(fr), c0 = Math.floor(fc);
  if (r0 < -SEARCH || c0 < -SEARCH || r0 >= G.rows + SEARCH || c0 >= G.cols + SEARCH) return null;
  const { l3, st } = grids();
  const kx = Math.cos((lat * Math.PI) / 180); // a column's width against a row's height
  for (let R = 0; R <= SEARCH; R++) {
    let best = -1, bd = Infinity;
    for (let r = r0 - R; r <= r0 + R; r++)
      for (let c = c0 - R; c <= c0 + R; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== R || r < 0 || c < 0 || r >= G.rows || c >= G.cols) continue;
        const i = r * G.cols + c;
        if (!l3[i]) continue;
        const d = (r + 0.5 - fr) ** 2 + ((c + 0.5 - fc) * kx) ** 2;
        if (d < bd) (bd = d), (best = i);
      }
    if (best >= 0) return { l3: l3[best], state: G.states[st[best] - 1] ?? '' };
  }
  return null;
}

/** Where a place is in the lower 48's life — null outside it (the sea, Canada, Mexico, the world). */
export function ecoAt(lat: number, lon: number): EcoPlace | null {
  const cell = ecoCell(lat, lon);
  if (!cell) return null;
  const region = regionOf(cell.l3, cell.state, lat, lon);
  return region ? { region, ...cell } : null;
}

/** The Northwest's westside (west of the Cascades' crest: fir, cedar, hemlock and moss). */
export const pnwWestside = (p: { region: string; l3: number } | null | undefined) => !!p && p.region === 'pnw' && !PNW_DRY.has(p.l3);

/** California's coast, south to north (lat, lon): the coastal fog belt is the land within ~45 km of it
 *  (lace lichen on the oaks, the marine layer's summer). */
const CA_COAST: [number, number][] = [[32.5, -117.15], [33.7, -118.3], [34.05, -118.8], [34.45, -120.45], [35.4, -120.9], [36.3, -121.9], [37.0, -122.2], [37.8, -122.55], [38.5, -123.2], [39.5, -123.8], [40.4, -124.4], [41.5, -124.1], [42.0, -124.25]];
const caCoastLon = (lat: number) => {
  let coast = CA_COAST[0][1];
  for (let i = 0; i + 1 < CA_COAST.length; i++) if (lat >= CA_COAST[i][0] && lat <= CA_COAST[i + 1][0]) coast = CA_COAST[i][1] + ((lat - CA_COAST[i][0]) / (CA_COAST[i + 1][0] - CA_COAST[i][0])) * (CA_COAST[i + 1][1] - CA_COAST[i][1]);
  if (lat > CA_COAST[CA_COAST.length - 1][0]) coast = CA_COAST[CA_COAST.length - 1][1];
  return coast;
};
export function caFogBelt(lat: number, lon: number): boolean {
  if (lat < CA_COAST[0][0] - 0.2 || lat > CA_COAST[CA_COAST.length - 1][0] + 0.2) return false;
  const coast = caCoastLon(lat);
  return lon - coast < 0.5 && lon - coast > -0.6;
}
/** The coast redwood's belt: the fog belt's seaward ~35 km from Big Sur's canyons (35.8°N) to the
 *  Oregon line — Muir Woods, the Santa Cruz Mountains and the Oakland hills in it, Napa and San Jose
 *  past it (flora.ts redwoodCountry). */
export function caRedwoodBelt(lat: number, lon: number): boolean {
  if (lat < 35.8 || lat > CA_COAST[CA_COAST.length - 1][0] + 0.2) return false;
  const coast = caCoastLon(lat);
  return lon - coast < 0.38 && lon - coast > -0.6;
}
