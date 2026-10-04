// Place names for the map search, arrival cards and sketchbook captions — from our own lower-48
// place index (placeIndex.ts: USGS GNIS and US Census names and boundaries, public domain), served
// by the tile service (worker/src/places.js) out of R2. No third-party geocoder and no street
// addresses. Offline, or past the lower 48: everything falls back to what the loaded world already
// knows (named streets, named buildings, baked POIs) — the game never waits on the network to be
// playable.
import { localityIn, tileOf, tileKey, type RevTile, type Locality } from './placeIndex';
export type { Locality } from './placeIndex';

export interface Place {
  name: string; // a town, a park, a street, a named building
  detail: string; // "borough · <County>, <ST>"
  lat: number;
  lon: number;
  kind: string; // borough / city / park / summit / street / building / poi / coords …
  local?: boolean; // answered from the loaded world, not the index
}

let base = ''; // the tile service ('' — none: the loaded world answers alone)
/** Where the place index lives: the tile service's base URL (main.ts, at boot). */
export function setPlaceService(url: string) { base = /^https?:\/\//.test(url) ? url.replace(/\/$/, '') : ''; }

const tiles = new Map<string, RevTile | null>();
const inflight = new Map<string, Promise<RevTile | null>>();
let offline = false;
let lastFail = -Infinity;

async function revTile(ix: number, iy: number): Promise<RevTile | null> {
  const k = tileKey(ix, iy);
  if (tiles.has(k)) return tiles.get(k)!;
  if (!base) return null;
  // a failure waits a while before asking again (offline, or the service down)
  if (performance.now() - lastFail < 30000) return null;
  let p = inflight.get(k);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`${base}/places/rt/${k}.json`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        const t = (await r.json()) as RevTile;
        tiles.set(k, t);
        offline = false;
        return t;
      } catch {
        offline = true;
        lastFail = performance.now();
        return null;
      } finally {
        inflight.delete(k);
      }
    })();
    inflight.set(k, p);
  }
  return p;
}

/** The town at a point: the Census place, else the township or town, else the county (null at
 *  sea, past the lower 48, or offline). One boundary tile per 0.25°, kept for the session. */
export async function reverse(lat: number, lon: number): Promise<Locality | null> {
  const [ix, iy] = tileOf(lat, lon);
  return localityIn(await revTile(ix, iy), lat, lon);
}

/** Search the index near a point. Throws when the service can't answer (the caller falls back to
 *  the loaded world). */
export async function searchRemote(q: string, near: { lat: number; lon: number }): Promise<Place[]> {
  if (!base) throw new Error('no place service');
  const url = `${base}/places/search?q=${encodeURIComponent(q)}&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}&n=8`;
  let r: Response;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(7000) });
  } catch (e) {
    offline = true;
    throw e;
  }
  if (!r.ok) throw new Error(`places ${r.status}`);
  offline = false;
  const j = (await r.json()) as { results?: Place[] };
  return (j.results ?? []).map((p) => ({ name: p.name, detail: p.detail, lat: p.lat, lon: p.lon, kind: p.kind }));
}

// (the USPS codes: a region's state written short where room is tight — a phone's arrival card)
const US_STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL',
  Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'Puerto Rico': 'PR',
};
/** A region written short: a US state at its end as its postal code ("<County>, New Jersey" →
 *  "<County>, NJ"); anything else as it is. */
export function shortRegion(region: string): string {
  const m = /^(.*,\s*)?([^,]+?)\s*$/.exec(region);
  const code = m ? US_STATES[m[2]] : undefined;
  return code ? `${m![1] ?? ''}${code}` : region;
}

/** "40.36, -73.97" → a place, or null. */
export function parseLatLon(q: string): Place | null {
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, detail: 'coordinates', lat, lon, kind: 'coords', local: true };
}

/** Fuzzy match over names the loaded world knows (streets, named buildings, POIs). */
export function searchLocal(q: string, items: { name: string; detail: string; lat: number; lon: number; kind: string }[], limit = 8): Place[] {
  const n = q.trim().toLowerCase();
  if (n.length < 2) return [];
  const words = n.split(/\s+/);
  const scored: [number, Place][] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const s = it.name.toLowerCase();
    if (!words.every((w) => s.includes(w))) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    scored.push([(s.startsWith(n) ? 0 : 1) + s.length / 100, { ...it, local: true }]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}

export const isOffline = () => offline;
