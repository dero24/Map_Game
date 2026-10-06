// "Go see it" (the developer panel's Creatures folder): for each animal, a place it lives, a month it's
// about and an hour it's up — and what to stand by when you get there (the sea's beach, a pond's or a
// river's bank, or anywhere). The places are a spread of the lower 48's (each animal's own where it has
// one: the sea otters at Monterey, the orcas off San Juan Island, the monarchs' winter roost); the rest
// are found by asking the cast (fauna.ts faunaMix) where and when each one is.
import { CRITTERS, CRITTER_NAME, ROLE, faunaMix, type CritterKind } from '../assets/fauna';
import { castOf, regionStyle } from '../world/styles';

/** The places (lat, lon), roughly east to west: the order the search tries them in. */
export const SPOTS: Record<string, [number, number]> = {
  seabright: [40.3645, -73.9725], chatham: [41.682, -69.96], barharbor: [44.388, -68.204], lakeplacid: [44.279, -73.98],
  pinebarrens: [39.8, -74.53], asheville: [35.595, -82.551], cadescove: [35.6, -83.8], savannah: [32.0, -80.85],
  crystalriver: [28.9, -82.59], everglades: [25.39, -80.58], keywest: [24.552, -81.78], miami: [25.79, -80.13],
  neworleans: [29.95, -90.07], galveston: [29.3, -94.79], austin: [30.27, -97.74], branson: [36.64, -93.22],
  chicago: [41.88, -87.62], peoria: [40.69, -89.59], wichita: [37.69, -97.34], windcave: [43.57, -103.48],
  cheyenne: [41.14, -104.82], estespark: [40.377, -105.52], yellowstone: [44.9, -110.22], tucson: [32.22, -110.97],
  saltlake: [40.76, -111.89], yosemite: [37.745, -119.59], monterey: [36.6, -121.89], pacificgrove: [36.62, -121.92],
  pointreyes: [38.07, -122.88], losangeles: [34.01, -118.5], seattle: [47.61, -122.33], fridayharbor: [48.535, -123.015],
  hoh: [47.86, -123.93], bend: [44.06, -121.31],
};
type Spot = keyof typeof SPOTS;
/** Each animal's own place (and month, hour) where it has one — tried first, kept only if the cast
 *  agrees it's there then. */
const OWN: Partial<Record<CritterKind, [Spot, number?, number?]>> = {
  seaotter: ['monterey'], sealion: ['monterey'], graywhale: ['monterey', 1], humpback: ['monterey', 7], orca: ['fridayharbor', 7],
  harborseal: ['chatham', 7], grayseal: ['chatham', 7], dolphin: ['seabright', 7], porpoise: ['barharbor', 7],
  shoal: ['keywest', 3], tarpon: ['keywest', 5], mullet: ['keywest', 3], silvercarp: ['peoria', 7], salmon: ['seattle', 10], rainbowtrout: ['estespark', 7],
  monarch: ['pacificgrove', 12, 13], bison: ['yellowstone', 7], prairiedog: ['windcave', 7], pronghorn: ['cheyenne', 7], elk: ['estespark', 9],
  bighorn: ['estespark', 7], moose: ['barharbor', 7], blackbear: ['cadescove', 6], alligator: ['everglades', 3], manatee: ['crystalriver', 1],
  fiddlercrab: ['savannah', 7], crawfish: ['neworleans', 4], spoonbill: ['everglades', 3], loon: ['lakeplacid', 7], beaver: ['lakeplacid', 7],
  bananaslug: ['hoh', 10, 10], hornedlizard: ['tucson', 5], collaredlizard: ['tucson', 5], spinylizard: ['tucson', 5], sideblotched: ['tucson', 5],
  roadrunner: ['tucson', 4], gilawoodpecker: ['tucson', 4], greenanole: ['savannah', 6], brownanole: ['miami', 6], armadillo: ['austin', 6],
  annualcicada: ['seabright', 7, 14], cicadashell: ['seabright', 7, 14], firefly: ['pinebarrens', 6], stellersjay: ['seattle', 7], baldeagle: ['seattle', 7],
};
/** The months tried, best first: high summer, then spring and fall, the winter last. */
const MONTHS = [7, 6, 8, 5, 9, 10, 4, 3, 11, 12, 1, 2];

/** What to stand by: the sea's beach, fresh water's bank, or wherever you land. */
export type Habitat = 'sea' | 'fresh' | 'land';
const SALT = new Set<CritterKind>(['mullet', 'tarpon', 'shoal', 'fiddlercrab', 'sandpiper']);
export function habitatOf(k: CritterKind): Habitat {
  const r = ROLE[k];
  if (SALT.has(k) || r === 'cetacean' || r === 'gull' || (r === 'swimmer' && k !== 'riverotter')) return 'sea';
  if (r === 'fish' || r === 'swimmer' || r === 'waterfowl' || r === 'wader' || r === 'basker' || r === 'dragonfly' || k === 'crawfish' || k === 'ibis') return 'fresh';
  return 'land';
}
/** The hour it's up and about (sim/critters.ts want): the night's foragers and the fireflies after dark;
 *  the deer, the herds, the foxes and the rabbits at dusk (earlier in the winter); the rest by day. */
export function hourOf(k: CritterKind, month: number) {
  const r = ROLE[k], dusk = month >= 5 && month <= 8 ? 19.6 : month === 4 || month === 9 ? 18.8 : 17.2;
  if (r === 'forager') return 22;
  if (r === 'firefly') return 21.6;
  if (r === 'browser' || r === 'herd' || r === 'predator' || r === 'grazer') return dusk;
  if (r === 'fish' || r === 'songbird') return 8;
  if (r === 'bug') return 14;
  return 11;
}

const styles = new Map<Spot, ReturnType<typeof castOf> & { region: string; climate: string }>();
const styleOf = (s: Spot) => {
  let st = styles.get(s);
  if (!st) { const r = regionStyle(...SPOTS[s]); st = { ...castOf(r), region: r.region as string, climate: r.climate as string }; styles.set(s, st); }
  return st;
};
/** Whether the animal is in the place's cast that month. */
export function livesAt(k: CritterKind, s: Spot, month: number) {
  const st = styleOf(s);
  return Object.values(faunaMix(st.region, st.climate, st, month)).flat().some(([kk]) => kk === k);
}

export interface SeeIt { kind: CritterKind; name: string; spot: Spot; lat: number; lon: number; month: number; hour: number; habitat: Habitat }
const memo = new Map<CritterKind, SeeIt | null>();
/** Where and when to go to see it (null: nowhere in the lower 48's places — none yet). */
export function whereToSee(k: CritterKind): SeeIt | null {
  if (memo.has(k)) return memo.get(k)!;
  const out = (spot: Spot, month: number, hour?: number): SeeIt => ({ kind: k, name: CRITTER_NAME[k], spot, lat: SPOTS[spot][0], lon: SPOTS[spot][1], month, hour: hour ?? hourOf(k, month), habitat: habitatOf(k) });
  let r: SeeIt | null = null;
  const own = OWN[k];
  if (own) {
    const [spot, m, h] = own;
    const month = m !== undefined ? (livesAt(k, spot, m) ? m : undefined) : MONTHS.find((mm) => livesAt(k, spot, mm));
    if (month !== undefined) r = out(spot, month, h);
  }
  for (let i = 0; !r && i < MONTHS.length; i++) for (const spot of Object.keys(SPOTS) as Spot[]) if (livesAt(k, spot, MONTHS[i])) { r = out(spot, MONTHS[i]); break; }
  memo.set(k, r);
  return r;
}
/** The panel's list: every animal by its name (a–z), to its kind. */
export function animalList(): Record<string, CritterKind> {
  const out: Record<string, CritterKind> = {};
  for (const k of [...CRITTERS].sort((a, b) => CRITTER_NAME[a].localeCompare(CRITTER_NAME[b]))) out[out[CRITTER_NAME[k]] ? `${CRITTER_NAME[k]} (${k})` : CRITTER_NAME[k]] = k;
  return out;
}

/** Somewhere to stand by its habitat, nearest the arrival first (rings out to `reach` m): on the beach
 *  by the sea, on a bank by fresh water — found where the water's within a hundred metres or so, then
 *  stepped down the distance's slope to a few metres from its edge. Faces the water. Null when there's
 *  none in reach (or for 'land': stay where you are). */
export function standBy(h: Habitat, x0: number, z0: number, T: { sdfAt(x: number, z: number): number; oceanDistAt(x: number, z: number): number }, ok: (x: number, z: number) => boolean, reach = 1500) {
  if (h === 'land') return null;
  const sea = h === 'sea';
  const near = (x: number, z: number) => { const s = T.sdfAt(x, z); return s > 0 && s < 120 && (sea ? T.oceanDistAt(x, z) < 400 : T.oceanDistAt(x, z) > 300); };
  const fits = (x: number, z: number) => {
    const s = T.sdfAt(x, z);
    return sea ? T.oceanDistAt(x, z) < 40 && s > 1 && s < 12 : s > 1.5 && s < 8 && T.oceanDistAt(x, z) > 300;
  };
  const grad = (x: number, z: number) => {
    const gx = T.sdfAt(x + 2, z) - T.sdfAt(x - 2, z), gz = T.sdfAt(x, z + 2) - T.sdfAt(x, z - 2), L = Math.hypot(gx, gz) || 1;
    return [gx / L, gz / L];
  };
  for (let r = 0; r <= reach; r += 20) {
    const n = r === 0 ? 1 : Math.min(480, Math.max(8, Math.round((2 * Math.PI * r) / 20)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let x = x0 + Math.sin(a) * r, z = z0 + Math.cos(a) * r;
      if (!near(x, z)) continue;
      // down the slope to ~5 m from the water's edge
      for (let k = 0; k < 6; k++) { const [gx, gz] = grad(x, z), st = T.sdfAt(x, z) - 5; x -= gx * st; z -= gz * st; }
      if (!fits(x, z) || !ok(x, z)) continue;
      // facing the water: down the slope (the walker looks along −(sin yaw, cos yaw))
      const [gx, gz] = grad(x, z);
      return { x, z, yaw: Math.atan2(gx, gz) };
    }
  }
  return null;
}

/** "40 m north-east": how far and which way from (x, z) to (tx, tz) (north is −z). */
export function bearing(x: number, z: number, tx: number, tz: number) {
  const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  return `${d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`} ${names[Math.round(a / (Math.PI / 4)) % 8]}`;
}
