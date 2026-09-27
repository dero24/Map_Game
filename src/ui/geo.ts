// Place names for the map search, arrival cards and sketchbook captions.
// Online: Photon (komoot's OpenStreetMap geocoder — CORS-enabled, no key; light use only, so every
// answer is cached and reverse lookups are throttled). Offline or rate-limited: everything falls back
// to what the loaded world already knows (named streets, named buildings, baked POIs) — the game
// never waits on the network to be playable.

export interface Place {
  name: string; // "Monmouth Beach" / "Ocean Avenue" / "St. George's by-the-River"
  detail: string; // "Monmouth County, New Jersey"
  lat: number;
  lon: number;
  kind: string; // city / town / street / house / poi / local-road / coords …
  local?: boolean; // answered from the loaded world, not the geocoder
}
export interface Locality { locality: string; region: string; street?: string }

const PHOTON = 'https://photon.komoot.io';
const rcache = new Map<string, Locality | null>();
let lastReverse = 0;
let inflight: Promise<Locality | null> | null = null;
let offline = false;

type Props = Record<string, string | undefined>;
const localityOf = (p: Props) => p.city ?? p.town ?? p.village ?? p.hamlet ?? p.locality ?? p.district ?? p.county ?? p.state ?? '';
const county = (p: Props) => (p.county && p.countrycode === 'US' && !/county|parish|borough/i.test(p.county) ? `${p.county} County` : p.county);
const regionOf = (p: Props, skip: string) => [county(p), p.state].filter((s) => s && s !== skip).join(', ') || p.country || '';

/** The town/neighbourhood at a point (cached per ~300 m; at most one request every 4 s). */
export async function reverse(lat: number, lon: number): Promise<Locality | null> {
  const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (rcache.has(k)) return rcache.get(k)!;
  if (inflight) return inflight;
  if (offline && Date.now() - lastReverse < 60000) return null;
  if (Date.now() - lastReverse < 4000) return null;
  lastReverse = Date.now();
  inflight = (async () => {
    try {
      const r = await fetch(`${PHOTON}/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&lang=en&limit=1`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { features?: { properties: Props }[] };
      const p = j.features?.[0]?.properties;
      offline = false;
      const loc = p && localityOf(p) ? { locality: localityOf(p), region: regionOf(p, localityOf(p)), street: p.street } : null;
      rcache.set(k, loc);
      return loc;
    } catch {
      offline = true;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Search the geocoder near a point. Throws on network failure (the caller falls back to local). */
export async function searchRemote(q: string, near: { lat: number; lon: number }): Promise<Place[]> {
  const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&lat=${near.lat.toFixed(4)}&lon=${near.lon.toFixed(4)}&limit=8&lang=en`;
  const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`geocoder ${r.status}`);
  const j = (await r.json()) as { features?: { properties: Props; geometry: { coordinates: [number, number] } }[] };
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of j.features ?? []) {
    const p = f.properties;
    const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : undefined;
    const name = p.name ?? street ?? p.street ?? localityOf(p);
    if (!name) continue;
    const loc = localityOf(p);
    const detail = [street && p.name ? street : undefined, loc !== name ? loc : undefined, p.state, loc === name ? p.country : undefined].filter(Boolean).join(', ');
    const [lon, lat] = f.geometry.coordinates;
    const key = `${name}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, detail, lat, lon, kind: p.osm_value ?? p.type ?? 'place' });
  }
  return out;
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
