// Our own lower-48 place index (docs/GAMEPLAY_VISION.md §17; docs/DATA_SOURCES.md): public-domain
// names from USGS GNIS and the US Census (places, county subdivisions, counties, states), baked by
// scripts/build-places.mjs into R2 and served by the tile service (worker/src/places.js). Pure:
// the bake, the worker and the game share it (tests/placeIndex.test.ts).
//
// - Search: a name's words index it, three letters each (`shardKey`); the service reads one
//   shard and ranks its rows against the query (`rankRows`).
// - Reverse: the lower 48 cut into 0.25° tiles of Census boundaries (places, active county
//   subdivisions, counties — clipped to the shoreline), read by the game (`localityIn`).
// Names of places only: no street addresses, nothing about people.

/** One searchable name, as a shard row. */
export interface PlaceRow {
  name: string; // "Shrewsbury"
  kind: string; // borough / city / township / county / state / community / park / summit / lake …
  st: string; // USPS state code
  county: string; // "Monmouth County" ('' for a state or a county itself)
  lat: number;
  lon: number;
  w: number; // standing, 0–99: kind, then population (or size)
}
export interface PlaceHit { name: string; detail: string; lat: number; lon: number; kind: string; score: number }

export const STATES: Record<string, string> = {
  AL: 'Alabama', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida',
  GA: 'Georgia', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
// (words a name shares with half the country: never chosen as the shard to read when the query
// has a better word — they are still matched)
const STOP = new Set(['the', 'of', 'and', 'at', 'on', 'in', 'de', 'la', 'le', 'el', 'du', 'des', 'da', 'del', 'los', 'las']);
// (a query's state, by code or name: matched against each row's state, never the shard to read)
const STATE_WORDS = new Set(Object.entries(STATES).flatMap(([code, name]) => [code.toLowerCase(), ...name.toLowerCase().split(' ')]).filter((w) => !STOP.has(w)));

/** Lower case, no accents or punctuation, one space between words ("St. George's" → "st georges"). */
export function normalize(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export const tokens = (s: string) => normalize(s).split(' ').filter(Boolean);
/** The shard a word lives in: its first three letters (a shorter word, itself). */
export const shardKey = (word: string) => word.slice(0, 3);
/** The shards a name is filed under: one per distinct word (stop words too: "La Jolla" files under
 *  "la" and "jol"). */
export function nameShards(name: string): string[] {
  return [...new Set(tokens(name).map(shardKey))];
}
/** The shards worth reading for a query, best first: the rarer words (a smaller shard, when the
 *  directory's sizes are known; else the longer word) first, then words that name a state ("NJ",
 *  "Carolina": likely a qualifier, though "Virginia Beach" is a name), stop words last. */
export function queryShards(q: string, size?: (key: string) => number): string[] {
  const t = tokens(q);
  const keys = [...new Set(t.map(shardKey))];
  const words = (k: string) => t.filter((w) => shardKey(w) === k);
  const cost = (k: string) => (STOP.has(k) ? 1e12 : 0) + (words(k).every((w) => STATE_WORDS.has(w)) ? 1e10 : 0) + (size ? size(k) : -Math.max(...words(k).map((w) => w.length)));
  return keys.sort((a, b) => cost(a) - cost(b));
}

export const rowToTsv = (r: PlaceRow) => [r.name, r.kind, r.st, r.county, r.lat.toFixed(5), r.lon.toFixed(5), String(r.w)].join('\t');
export function parseRows(tsv: string): PlaceRow[] {
  const out: PlaceRow[] = [];
  for (const line of tsv.split('\n')) {
    if (!line) continue;
    const [name, kind, st, county, lat, lon, w] = line.split('\t');
    out.push({ name, kind, st, county, lat: +lat, lon: +lon, w: +w });
  }
  return out;
}

const R = 6371;
export function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const p = Math.PI / 180, dLat = (bLat - aLat) * p, dLon = (bLon - aLon) * p;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** "borough · Monmouth County, NJ" */
export function detailOf(r: PlaceRow): string {
  const where = r.kind === 'state' ? '' : [r.county, r.st].filter(Boolean).join(', ');
  return [r.kind === 'state' ? 'state' : r.kind, where].filter(Boolean).join(' · ');
}

/** The ranking's version: the tile service's search cache keys on it (a change here re-ranks every
 *  answer at once, with no re-bake). */
export const RANK_V = 3;
// (the parks the country knows by name: the one a search means, ahead of the hamlet named for it)
const FAMOUS = /\bNational (Park|Monument|Seashore|Lakeshore|Recreation Area|Historical Park|Preserve|Memorial)$/; // (the park itself, not its school)

/** The rows matching a query, best first: every query word starts a word of the name, its county or
 *  its state (so "Shrewsbury NJ" and "springfield illinois" work); ranked by standing, how well the
 *  name matches, and nearness to `near`. */
export function rankRows(rows: PlaceRow[], q: string, near?: { lat: number; lon: number }, limit = 8): PlaceHit[] {
  const qt = tokens(q);
  if (!qt.length) return [];
  const qn = qt.join(' ');
  const hits: PlaceHit[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const nt = tokens(r.name);
    const st = STATES[r.st] ?? '';
    const extra = [r.st.toLowerCase(), ...tokens(st), ...tokens(r.county)];
    let named = 0, exact = 0, ok = true;
    for (const w of qt) {
      const inName = nt.some((t) => t.startsWith(w));
      if (inName) { named++; if (nt.includes(w)) exact++; continue; }
      if (!extra.some((t) => t.startsWith(w))) { ok = false; break; }
    }
    if (!ok || !named) continue;
    const nn = nt.join(' ');
    let s = r.w / 100 + 0.12 * exact / qt.length;
    if (nn === qn || qn.startsWith(nn + ' ')) s += 0.6; // the whole name (then its state or county)
    else if (nn.startsWith(qn)) s += 0.3;
    if (FAMOUS.test(r.name)) s += 0.2;
    if (near) s -= 0.35 * Math.log10(1 + km(near.lat, near.lon, r.lat, r.lon) / 30);
    const key = `${nn}|${r.kind}|${r.st}|${r.county}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ name: r.name, detail: detailOf(r), lat: r.lat, lon: r.lon, kind: r.kind, score: Math.round(s * 1000) / 1000 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---- reverse: the 0.25° boundary tiles ----

export const RT = 0.25; // degrees a side
export const tileOf = (lat: number, lon: number): [number, number] => [Math.floor((lon + 180) / RT), Math.floor((lat + 90) / RT)];
export const tileKey = (ix: number, iy: number) => `${ix}_${iy}`;
/** One boundary in a tile: kind (p a Census place — city, town, borough, village, CDP; m an active
 *  county subdivision — a township or New England town; c a county), its name, the state, and its
 *  rings clipped to the tile as flat [lon, lat] × 1e5 integers. */
export interface Bound { k: 'p' | 'm' | 'c'; n: string; s: string; c?: string; r: number[][] }
export interface RevTile { v: number; b: Bound[] }
export interface Locality { locality: string; region: string; street?: string }

/** Even-odd containment over every ring (outer rings and holes alike). */
export function inRings(rings: number[][], lon: number, lat: number): boolean {
  const x = lon * 1e5, y = lat * 1e5;
  let ins = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
  return ins;
}
/** The town at a point, from its tile: the Census place it's in; else the township or town (an
 *  active county subdivision); else the county. Region: the county and the state, written out. */
export function localityIn(tile: RevTile | null, lat: number, lon: number): Locality | null {
  if (!tile) return null;
  let place: Bound | null = null, mcd: Bound | null = null, county: Bound | null = null;
  for (const b of tile.b) {
    if ((b.k === 'p' && place) || (b.k === 'm' && mcd) || (b.k === 'c' && county)) continue;
    if (!inRings(b.r, lon, lat)) continue;
    if (b.k === 'p') place = b; else if (b.k === 'm') mcd = b; else county = b;
  }
  const st = (county ?? place ?? mcd)?.s ?? '';
  const state = STATES[st] ?? st;
  const town = place ?? mcd;
  const cname = county?.n ?? town?.c ?? '';
  if (town) return { locality: town.n, region: [cname, state].filter(Boolean).join(', ') };
  if (county) return { locality: county.n, region: state };
  return null;
}
