// The mountains a place is known by, by name: OpenFreeMap's `mountain_peak` layer (OSM's
// natural=peak / volcano with their names and elevations) read from a few z8 tiles round the
// walker — enough for every prominent summit within ~160 km. A viewpoint (`tourism=viewpoint`)
// then knows what it looks at: "Mount Rainier, 97 km to the southeast", and turns you to it.
// The same tiles' `landcover` carries the mountains' glaciers and bare rock (OSM natural=glacier,
// bare_rock, scree): the horizon ring paints them (horizon.ts), whatever the season's snowline.
import { readMvt } from './mvt';

export interface Peak { name: string; ele: number; lat: number; lon: number }
export interface Sight { name: string; ele: number; km: number; bearing: number; angle: number }

const OFM = 'https://tiles.openfreemap.org/planet';
const EARTH = 6371000 * (7 / 6); // (refraction lengthens the apparent radius, as the horizon ring does)
let tpl: Promise<string | null> | null = null;

/** Peaks in the tiles of one vector tile's bytes (tile x, y at zoom z). */
export function peaksInTile(data: ArrayBuffer | Uint8Array, x: number, y: number, z: number): Peak[] {
  const out: Peak[] = [], Z = 2 ** z;
  for (const l of readMvt(data, (n) => n === 'mountain_peak'))
    for (const f of l.features) {
      const name = f.tags.name ? String(f.tags.name) : '', ele = +(f.tags.ele ?? 0);
      if (f.type !== 1 || !name || !(ele > 0) || ele > 9000) continue;
      for (const r of f.rings)
        for (const [px, py] of r) {
          const X = (x + px / l.extent) / Z, Y = (y + py / l.extent) / Z;
          out.push({ name, ele, lon: X * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180) / Math.PI });
        }
    }
  return out;
}

// (the low-zoom tiles, fetched once for the peaks and the horizon's landcover alike)
const tiles = new Map<string, Promise<ArrayBuffer | null>>();
async function ofmTile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  tpl ??= fetch(OFM, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ tiles?: string[] }>) : null))
    .then((j) => j?.tiles?.[0] ?? null)
    .catch(() => null);
  const t = await tpl;
  if (!t) { tpl = null; return null; }
  const k = `${z}/${x}/${y}`;
  let p = tiles.get(k);
  if (!p) {
    p = fetch(t.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal: AbortSignal.timeout(15000) })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    tiles.set(k, p);
    while (tiles.size > 48) tiles.delete(tiles.keys().next().value!);
  }
  const b = await p;
  if (!b) tiles.delete(k); // (a failure is tried again next time)
  return b;
}
/** The z tiles covering R m round a place. */
function tilesAround(lat: number, lon: number, R: number, z: number): [number, number][] {
  const dLat = R / 111320, dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180)), Z = 2 ** z;
  const tx = (lo: number) => Math.floor(((lo + 180) / 360) * Z);
  const ty = (la: number) => { const r = (la * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Z); };
  const out: [number, number][] = [];
  for (let x = tx(lon - dLon); x <= tx(lon + dLon); x++) for (let y = ty(lat + dLat); y <= ty(lat - dLat); y++) out.push([x, y]);
  return out;
}

/** Every named peak within ~R m of a place — null when the tiles couldn't be had (offline, the CDN
 *  down), [] where there are none (a Florida sky has no summits in it). */
export async function peaksAround(lat: number, lon: number, R = 160000, z = 8): Promise<Peak[] | null> {
  const got = await Promise.all(tilesAround(lat, lon, R, z).map(([x, y]) => ofmTile(z, x, y).then((b) => (b ? peaksInTile(b, x, y, z) : null))));
  if (got.every((g) => g === null)) return null;
  const seen = new Set<string>(), out: Peak[] = [];
  for (const p of got.flatMap((g) => g ?? [])) {
    const k = `${p.name}|${p.lat.toFixed(3)}|${p.lon.toFixed(3)}`;
    if (!seen.has(k)) (seen.add(k), out.push(p));
  }
  return out;
}

/** What you see of them from here (eye at `elev` m): each summit's distance, compass bearing and
 *  angle over the horizontal — the Earth's curve taken off — the tallest-looking first. `bearing`:
 *  only the ones within 70° of it (a viewpoint that looks one way). */
export function sightsFrom(peaks: Peak[], lat: number, lon: number, elev: number, bearing: number | null = null): Sight[] {
  const out: Sight[] = [];
  const φ1 = (lat * Math.PI) / 180;
  for (const p of peaks) {
    const φ2 = (p.lat * Math.PI) / 180, dφ = φ2 - φ1, dλ = ((p.lon - lon) * Math.PI) / 180;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    const d = 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
    if (d < 3000 || d > 180000) continue;
    const angle = Math.atan2(p.ele - (d * d) / (2 * EARTH) - elev, d);
    if (angle < 0.004) continue; // (a quarter of a degree: lost in the haze and the near hills)
    const b = ((Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) * 180) / Math.PI + 360) % 360;
    if (bearing !== null && Math.abs(((b - bearing + 540) % 360) - 180) > 70) continue;
    out.push({ name: p.name, ele: p.ele, km: d / 1000, bearing: b, angle });
  }
  return out.sort((x, y) => y.angle - x.angle);
}

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
/** "the southeast" from a bearing. */
export const compassWord = (b: number) => POINTS[Math.round((((b % 360) + 360) % 360) / 45) % 8];

// ---------------- the mountains' own ice and rock ----------------

export type CoverKind = 'ice' | 'rock';
export interface CoverPoly { kind: CoverKind; rings: [number, number][][]; bb: [number, number, number, number] }

/** A tile's glaciers and bare rock (OpenMapTiles `landcover` class ice / rock) as lat/lon rings. */
export function coverInTile(data: ArrayBuffer | Uint8Array, x: number, y: number, z: number): CoverPoly[] {
  const out: CoverPoly[] = [], Z = 2 ** z;
  for (const l of readMvt(data, (n) => n === 'landcover'))
    for (const f of l.features) {
      const kind = f.tags.class === 'ice' ? 'ice' : f.tags.class === 'rock' ? 'rock' : null;
      if (f.type !== 3 || !kind || !f.rings.length) continue;
      let s = 90, w = 180, n = -90, e = -180;
      const rings = f.rings.map((r) => r.map(([px, py]): [number, number] => {
        const X = (x + px / l.extent) / Z, Y = (y + py / l.extent) / Z;
        const la = (Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180) / Math.PI, lo = X * 360 - 180;
        s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
        return [la, lo];
      }));
      out.push({ kind, rings, bb: [s, w, n, e] });
    }
  return out;
}

export interface Landcover { at: (lat: number, lon: number) => CoverKind | null; count: number }
/** Which of the polygons holds a point (ice over rock where both do): a 0.05° grid over them. */
export function coverIndex(polys: CoverPoly[]): Landcover {
  const G = 0.05, grid = new Map<string, CoverPoly[]>();
  for (const p of polys)
    for (let i = Math.floor(p.bb[0] / G); i <= Math.floor(p.bb[2] / G); i++)
      for (let j = Math.floor(p.bb[1] / G); j <= Math.floor(p.bb[3] / G); j++) {
        const k = `${i},${j}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(p);
      }
  const inside = (p: CoverPoly, la: number, lo: number) => {
    let ins = false; // (even-odd over every ring: a nunatak in a glacier stays rock)
    for (const r of p.rings)
      for (let a = 0, b = r.length - 1; a < r.length; b = a++)
        if (r[a][0] > la !== r[b][0] > la && lo < ((r[b][1] - r[a][1]) * (la - r[a][0])) / (r[b][0] - r[a][0]) + r[a][1]) ins = !ins;
    return ins;
  };
  return {
    count: polys.length,
    at: (la, lo) => {
      let hit: CoverKind | null = null;
      for (const p of grid.get(`${Math.floor(la / G)},${Math.floor(lo / G)}`) ?? []) {
        if (la < p.bb[0] || la > p.bb[2] || lo < p.bb[1] || lo > p.bb[3] || !inside(p, la, lo)) continue;
        if (p.kind === 'ice') return 'ice';
        hit = 'rock';
      }
      return hit;
    },
  };
}

/** The glaciers and bare rock within ~R m of a place, from the same z8 tiles as the peaks — null
 *  when none of the tiles could be had. */
export async function landcoverAround(lat: number, lon: number, R = 125000, z = 8): Promise<Landcover | null> {
  const got = await Promise.all(tilesAround(lat, lon, R, z).map(([x, y]) => ofmTile(z, x, y).then((b) => (b ? coverInTile(b, x, y, z) : null))));
  if (got.every((g) => g === null)) return null;
  return coverIndex(got.flatMap((g) => g ?? []));
}
