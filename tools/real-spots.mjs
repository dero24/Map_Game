#!/usr/bin/env node
// The real-world comparison loop's spots (docs/GAMEPLAY_VISION.md §17, Tier 1 #1): in every lower-48
// state, three towns — the largest place, a mid-sized town and a small one (US Census 2024 estimates;
// chosen by a seed of the state's code, so the same every time) — and named checks (Bain's Hardware,
// Shrewsbury, Monmouth Beach); for each, one recent Mapillary street photo near its centre (perspective,
// not a panorama, since 2019; the most recent few, one picked by the same seed). Only the photo's id and
// pose are kept (tools/real-spots.json, in the repo); the photos themselves are fetched by
// tools/real-compare.mjs into raw/mapillary/ (git-ignored), never shipped.
//
//   node tools/real-spots.mjs [--states=NJ,NY] [--per=3] [--recheck]   (needs raw/places: node scripts/build-places.mjs --fetch)
// A photo must be fit to compare against: Mapillary's quality score ≥ 0.4 (a rain-dark windscreen
// scored 0.05), taken in daylight (the sun up), and segmented — sky, street or walls, not only the
// objects Mapillary found in it (poles, signs: every labelled patch of the view 'other'), and not a
// close-up (a lens of 30° or more). `--recheck`
// tries a kept spot's photo against that again and picks anew where it fails (a spot with no fit photo
// keeps its old one, marked `unfit`).
// Mapillary: CC BY-SA 4.0 imagery, development use (docs/DATA_SOURCES.md §0); the token is .env's ACCESS_TOKEN.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
// (the git-ignored .env when there is one; else the environment — a cloud session's settings)
const env = Object.fromEntries((existsSync(resolve(ROOT, '.env')) ? readFileSync(resolve(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).filter((l) => /=/.test(l) && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const TOKEN = env.ACCESS_TOKEN ?? process.env.ACCESS_TOKEN;
if (!TOKEN?.startsWith('MLY|')) { console.error('ACCESS_TOKEN (a Mapillary client token, MLY|…) is missing: set it in .env or the environment'); process.exit(1); }
const H = { headers: { Authorization: `OAuth ${TOKEN}` } };
const PER = Number(args.per ?? 3);
const OUT = resolve(ROOT, 'tools/real-spots.json');
const LOWER48 = ['AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const STATES = args.states ? String(args.states).split(',') : LOWER48;
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// the towns: Census places with their 2024 population
const gaz = readFileSync(resolve(ROOT, 'raw/places/2026_Gaz_place_national.txt'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('|'));
const pop = new Map();
{
  const lines = readFileSync(resolve(ROOT, 'raw/places/sub-est.csv'), 'latin1').split(/\r?\n/);
  const h = lines[0].split(','), I = (k) => h.indexOf(k);
  for (const l of lines.slice(1)) { const v = l.split(','); if (v[I('SUMLEV')] === '162') pop.set(v[I('STATE')] + v[I('PLACE')], +v[I('POPESTIMATE2024')]); }
}
// (a town's centre: GNIS's populated place of its name — downtown, the post office corner — where
// there is one; the Census's internal point can lie in the water: Seattle's in Lake Union, Portland
// Maine's in Casco Bay)
const ST = { Alabama: 'AL', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const centre = new Map(); // "name|ST" → every GNIS populated place of that name in the state
for (const l of readFileSync(resolve(ROOT, 'raw/places/Text/DomesticNames_National.txt'), 'utf8').split(/\r?\n/)) {
  const v = l.split('|');
  if (v[2] !== 'Populated Place' || !ST[v[3]]) continue;
  const k = `${v[1]}|${ST[v[3]]}`;
  if (!centre.has(k)) centre.set(k, []);
  centre.get(k).push([+v[15], +v[16]]);
}
// (the one nearest the Census place's own point, within ~10 km: a state can have several of a name —
// Virginia's first Fredericksburg in GNIS is a Rockbridge County hamlet, 180 km from the city)
const nearest = (cands, lat, lon) => {
  let best = null, bd = 0.09;
  for (const c of cands ?? []) { const d = Math.hypot(c[0] - lat, (c[1] - lon) * Math.cos((lat * Math.PI) / 180)); if (d < bd) (bd = d), (best = c); }
  return best;
};
const towns = new Map();
for (const [usps, geoid, , , name, lsad, , , , , , lat, lon] of gaz) {
  const p = pop.get(geoid);
  if (!p) continue; // (incorporated places only: CDPs have no estimate)
  if (!towns.has(usps)) towns.set(usps, []);
  // (the Census's legal suffixes: "Ranson corporation", "Nashville-Davidson metropolitan government (balance)")
  const bare = name.replace(/ \(balance\)$/i, '').replace(/ (city|town|village|borough|municipality|city and borough|corporation|metropolitan government|metro government|consolidated government|unified government|urban county)$/i, '');
  const c = nearest(centre.get(`${bare}|${usps}`), +lat, +lon);
  towns.get(usps).push({ name: bare, geoid, pop: p, lat: c ? c[0] : +lat, lon: c ? c[1] : +lon });
}

async function images(bb) {
  const u = `https://graph.mapillary.com/images?fields=id,captured_at,computed_compass_angle,computed_geometry,computed_altitude,computed_rotation,camera_type,is_pano,camera_parameters,width,height,creator,quality_score&bbox=${bb.map((v) => v.toFixed(5)).join(',')}&limit=100`;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(u, { ...H, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r?.ok) return (await r.json()).data ?? [];
    if (r?.status === 500) return null; // (too dense for the box: try smaller)
    await new Promise((res) => setTimeout(res, 2000));
  }
  return [];
}
const SINCE = Date.UTC(2019, 0, 1);
// the sun's altitude, degrees (a low-precision solar position: a degree or so, plenty for day or night)
function sunAlt(lat, lon, t) {
  const R = Math.PI / 180, d = t / 86400000 - 10957.5; // days since J2000
  const g = (357.529 + 0.98560028 * d) * R, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * d) * R;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const ha = ((18.697374558 + 24.06570982441908 * d) % 24) * 15 * R + lon * R - ra;
  return Math.asin(Math.sin(lat * R) * Math.sin(dec) + Math.cos(lat * R) * Math.cos(dec) * Math.cos(ha)) / R;
}
// segmented: Mapillary's detections of the image include the view's own classes (null: couldn't ask)
async function segmented(id) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://graph.mapillary.com/${id}/detections?fields=value&limit=2000`, { ...H, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r?.ok) return ((await r.json()).data ?? []).some((d) => /^(nature--(sky|vegetation|terrain)|construction--(flat--(road|sidewalk)|structure--building))/.test(d.value));
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}
// (a lens under 30° is a close-up — Ashland's was a deer at 5.7° — not a view down the street)
const lensOf = (x) => { const f = x.camera_parameters?.[0], w = x.width, h = x.height; return f > 0 && w > 0 ? (2 * Math.atan((w / Math.max(w, h)) * 0.5 / f) * 180) / Math.PI : null; };
const fitWhy = async (x, lat, lon) => (x.quality_score != null && x.quality_score < 0.4 ? `quality ${x.quality_score}` : (lensOf(x) ?? 90) < 30 ? 'a close-up lens' : sunAlt(lat, lon, x.captured_at) < 0 ? 'taken in the dark' : (await segmented(x.id)) === false ? 'not segmented' : null);
// the camera's pitch, degrees up, from Mapillary's computed rotation (OpenSfM: world→camera, the world
// east-north-up, the camera's z its view): the view is the rotation's third row (its heading matches
// computed_compass_angle exactly). A dash camera tilts: −10° to +16° across the spots.
function pitchOf(rv) {
  if (!Array.isArray(rv) || rv.length !== 3) return null;
  const t = Math.hypot(...rv);
  if (!(t > 1e-9)) return 90; // (no rotation: the camera's z is the world's up)
  const kz = rv[2] / t, up = Math.cos(t) + kz * kz * (1 - Math.cos(t)); // (the view's up component: R[2][2], Rodrigues)
  return +((Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI).toFixed(1);
}
const usable = (x) => x.camera_type === 'perspective' && !x.is_pano && x.captured_at >= SINCE && x.computed_geometry && isFinite(x.computed_compass_angle) && x.camera_parameters?.[0] > 0;
async function photoNear(lat, lon, seed, aim = null) {
  // (small first: a dense centre answers "too much data" for a big box — then smaller still)
  for (const half of [0.001, 0.002, 0.004, 0.008, 0.016]) {
    let got = await images([lon - half, lat - half, lon + half, lat + half]);
    for (let h2 = half / 2; got === null && h2 > 0.0001; h2 /= 2) got = await images([lon - h2, lat - h2, lon + h2, lat + h2]);
    if (got === null) got = [];
    let ok = got.filter(usable);
    if (aim) ok = ok.filter((x) => { const [px, py] = x.computed_geometry.coordinates; const b = (Math.atan2((aim[1] - px) * Math.cos((py * Math.PI) / 180), aim[0] - py) * 180) / Math.PI; const d = Math.abs((((b - x.computed_compass_angle) % 360) + 540) % 360 - 180); return d < 25; });
    if (!ok.length) continue;
    ok.sort((a, b) => b.captured_at - a.captured_at || (a.id < b.id ? -1 : 1));
    // (the seed's pick of the newest eight, else the next of them that's fit to compare against)
    const cands = ok.slice(0, 8), k0 = seed % cands.length;
    let pick = null;
    for (let k = 0; k < cands.length && !pick; k++) { const x = cands[(k0 + k) % cands.length], why = await fitWhy(x, lat, lon); if (!why) pick = x; }
    if (!pick) continue;
    const [plon, plat] = pick.computed_geometry.coordinates;
    const f = pick.camera_parameters[0], w = pick.width, h = pick.height, D = 180 / Math.PI;
    // (Mapillary's focal is a share of the image's longer side)
    const along = (side) => 2 * Math.atan((side / Math.max(w, h)) * 0.5 / f) * D;
    const hfov = along(w), vfov = along(h);
    return { id: pick.id, lat: +plat.toFixed(7), lon: +plon.toFixed(7), heading: +pick.computed_compass_angle.toFixed(2), hfov: +hfov.toFixed(1), vfov: +vfov.toFixed(1), w, h, captured: new Date(pick.captured_at).toISOString(), by: pick.creator?.username ?? '', within: half, q: pick.quality_score ?? null, calt: Number.isFinite(pick.computed_altitude) ? +pick.computed_altitude.toFixed(1) : null, pitch: pitchOf(pick.computed_rotation) };
  }
  return null;
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { spots: [] };
const RECHECK = !!args.recheck;
async function unfitWhy(img) {
  if (!RECHECK) return null;
  const r = await fetch(`https://graph.mapillary.com/${img.id}?fields=id,quality_score,captured_at,computed_altitude,computed_rotation,camera_parameters,width,height`, { ...H, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r?.ok) return null; // (can't ask: keep it)
  const x = await r.json();
  const why = await fitWhy(x, img.lat, img.lon);
  if (!why) { img.q = x.quality_score ?? null; img.calt = Number.isFinite(x.computed_altitude) ? +x.computed_altitude.toFixed(1) : null; img.pitch = pitchOf(x.computed_rotation); delete img.unfit; return null; }
  console.log(`  ${img.id}: ${why} — picking anew`);
  return why;
}
const keep = new Map(prev.spots.map((s) => [s.id, s]));
const NAMED = [
  { id: 'named-bains-hardware', state: 'NJ', town: "Bain's Hardware, Sea Bright", kind: 'named', at: [40.3622, -73.97453], aim: true },
  { id: 'named-seabright-center', state: 'NJ', town: 'Center Street, Sea Bright', kind: 'named', at: [40.3597, -73.975] },
  { id: 'named-monmouth-beach', state: 'NJ', town: 'Ocean Avenue, Monmouth Beach', kind: 'named', at: [40.3335, -73.9818] },
  { id: 'named-shrewsbury', state: 'NJ', town: 'Broad Street, Shrewsbury', kind: 'named', at: [40.3297, -74.0617] },
];
// The green spots (Robby: "really compare … upstate NY, PNW moss trees, ferns, Kentucky, Florida,
// Texas, middle America"): leafy residential streets, parks, rural and forest roads, three to six a
// region — where a region's greenery is, not its downtowns. Public streets and roads.
const GREEN = [
  { id: 'green-new-england-monument-street-concord', region: 'new-england', state: 'MA', town: "Monument Street, Concord", kind: 'green', at: [42.4636, -71.3489] },
  { id: 'green-new-england-mountain-road-stowe', region: 'new-england', state: 'VT', town: "Mountain Road, Stowe", kind: 'green', at: [44.4865, -72.7369] },
  { id: 'green-new-england-park-loop-road-acadia', region: 'new-england', state: 'ME', town: "Park Loop Road, Acadia", kind: 'green', at: [44.3205, -68.2533] },
  { id: 'green-upstate-ny-saranac-avenue-lake-placid', region: 'upstate-ny', state: 'NY', town: "Saranac Avenue, Lake Placid", kind: 'green', at: [44.284, -73.9967] },
  { id: 'green-upstate-ny-north-broadway-saratoga-springs', region: 'upstate-ny', state: 'NY', town: "North Broadway, Saratoga Springs", kind: 'green', at: [43.0905, -73.7836] },
  { id: 'green-upstate-ny-fall-creek-ithaca', region: 'upstate-ny', state: 'NY', town: "Fall Creek, Ithaca", kind: 'green', at: [42.4482, -76.495] },
  { id: 'green-upstate-ny-ny-73-keene', region: 'upstate-ny', state: 'NY', town: "NY-73, Keene", kind: 'green', at: [44.205, -73.776] },
  { id: 'green-mid-atlantic-library-place-princeton', region: 'mid-atlantic', state: 'NJ', town: "Library Place, Princeton", kind: 'green', at: [40.348, -74.6672] },
  { id: 'green-mid-atlantic-hughes-street-cape-may', region: 'mid-atlantic', state: 'NJ', town: "Hughes Street, Cape May", kind: 'green', at: [38.933, -74.923] },
  { id: 'green-mid-atlantic-prince-george-street-annapolis', region: 'mid-atlantic', state: 'MD', town: "Prince George Street, Annapolis", kind: 'green', at: [38.979, -76.49] },
  { id: 'green-appalachia-old-frankfort-pike-lexington', region: 'appalachia', state: 'KY', town: "Old Frankfort Pike, Lexington", kind: 'green', at: [38.105, -84.6] },
  { id: 'green-appalachia-montford-avenue-asheville', region: 'appalachia', state: 'NC', town: "Montford Avenue, Asheville", kind: 'green', at: [35.607, -82.56] },
  { id: 'green-appalachia-little-river-road-the-smokies', region: 'appalachia', state: 'TN', town: "Little River Road, the Smokies", kind: 'green', at: [35.66, -83.6] },
  { id: 'green-appalachia-kanawha-boulevard-charleston', region: 'appalachia', state: 'WV', town: "Kanawha Boulevard, Charleston", kind: 'green', at: [38.342, -81.65] },
  { id: 'green-southeast-jones-street-savannah', region: 'southeast', state: 'GA', town: "Jones Street, Savannah", kind: 'green', at: [32.0745, -81.095] },
  { id: 'green-southeast-rutledge-avenue-charleston', region: 'southeast', state: 'SC', town: "Rutledge Avenue, Charleston", kind: 'green', at: [32.77, -79.935] },
  { id: 'green-southeast-inman-park-atlanta', region: 'southeast', state: 'GA', town: "Inman Park, Atlanta", kind: 'green', at: [33.758, -84.354] },
  { id: 'green-southeast-trinity-park-durham', region: 'southeast', state: 'NC', town: "Trinity Park, Durham", kind: 'green', at: [36.008, -78.905] },
  { id: 'green-florida-centerville-road-tallahassee', region: 'gulf', state: 'FL', town: "Centerville Road, Tallahassee", kind: 'green', at: [30.52, -84.24] },
  { id: 'green-florida-main-highway-coconut-grove', region: 'florida', state: 'FL', town: "Main Highway, Coconut Grove", kind: 'green', at: [25.728, -80.243] },
  { id: 'green-florida-interlachen-avenue-winter-park', region: 'florida', state: 'FL', town: "Interlachen Avenue, Winter Park", kind: 'green', at: [28.596, -81.35] },
  { id: 'green-florida-eaton-street-key-west', region: 'florida', state: 'FL', town: "Eaton Street, Key West", kind: 'green', at: [24.559, -81.8] },
  { id: 'green-gulf-st-charles-avenue-new-orleans', region: 'gulf', state: 'LA', town: "St. Charles Avenue, New Orleans", kind: 'green', at: [29.93, -90.095] },
  { id: 'green-gulf-girard-park-lafayette', region: 'gulf', state: 'LA', town: "Girard Park, Lafayette", kind: 'green', at: [30.213, -92.03] },
  { id: 'green-gulf-government-street-mobile', region: 'gulf', state: 'AL', town: "Government Street, Mobile", kind: 'green', at: [30.686, -88.06] },
  { id: 'green-texas-hyde-park-austin', region: 'texas', state: 'TX', town: "Hyde Park, Austin", kind: 'green', at: [30.306, -97.727] },
  { id: 'green-texas-main-street-fredericksburg', region: 'texas', state: 'TX', town: "Main Street, Fredericksburg", kind: 'green', at: [30.2752, -98.872] },
  { id: 'green-texas-north-boulevard-houston', region: 'texas', state: 'TX', town: "North Boulevard, Houston", kind: 'green', at: [29.727, -95.405] },
  { id: 'green-texas-king-william-san-antonio', region: 'texas', state: 'TX', town: "King William, San Antonio", kind: 'green', at: [29.414, -98.495] },
  { id: 'green-texas-wolflin-amarillo', region: 'texas', state: 'TX', town: "Wolflin, Amarillo", kind: 'green', at: [35.19, -101.865] },
  { id: 'green-plains-old-west-lawrence', region: 'plains', state: 'KS', town: "Old West Lawrence", kind: 'green', at: [38.969, -95.245] },
  { id: 'green-plains-sheridan-boulevard-lincoln', region: 'plains', state: 'NE', town: "Sheridan Boulevard, Lincoln", kind: 'green', at: [40.792, -96.658] },
  { id: 'green-plains-council-grove', region: 'plains', state: 'KS', town: "Council Grove", kind: 'green', at: [38.661, -96.489] },
  { id: 'green-plains-rapid-city', region: 'plains', state: 'SD', town: "Rapid City", kind: 'green', at: [44.075, -103.23] },
  { id: 'green-midwest-kenilworth-avenue-oak-park', region: 'midwest', state: 'IL', town: "Kenilworth Avenue, Oak Park", kind: 'green', at: [41.888, -87.788] },
  { id: 'green-midwest-burns-park-ann-arbor', region: 'midwest', state: 'MI', town: "Burns Park, Ann Arbor", kind: 'green', at: [42.27, -83.728] },
  { id: 'green-midwest-vilas-madison', region: 'midwest', state: 'WI', town: "Vilas, Madison", kind: 'green', at: [43.059, -89.41] },
  { id: 'green-midwest-traverse-city', region: 'midwest', state: 'MI', town: "Traverse City", kind: 'green', at: [44.76, -85.62] },
  { id: 'green-midwest-summit-street-iowa-city', region: 'midwest', state: 'IA', town: "Summit Street, Iowa City", kind: 'green', at: [41.651, -91.527] },
  { id: 'green-ozarks-eureka-springs', region: 'ozarks', state: 'AR', town: "Eureka Springs", kind: 'green', at: [36.401, -93.738] },
  { id: 'green-ozarks-branson', region: 'ozarks', state: 'MO', town: "Branson", kind: 'green', at: [36.644, -93.218] },
  { id: 'green-rockies-mapleton-hill-boulder', region: 'rockies', state: 'CO', town: "Mapleton Hill, Boulder", kind: 'green', at: [40.02, -105.286] },
  { id: 'green-rockies-south-willson-avenue-bozeman', region: 'rockies', state: 'MT', town: "South Willson Avenue, Bozeman", kind: 'green', at: [45.672, -111.039] },
  { id: 'green-rockies-jackson', region: 'rockies', state: 'WY', town: "Jackson", kind: 'green', at: [43.48, -110.762] },
  { id: 'green-rockies-coeur-d-alene', region: 'rockies', state: 'ID', town: "Coeur d'Alene", kind: 'green', at: [47.674, -116.77] },
  { id: 'green-desert-sw-sam-hughes-tucson', region: 'desert-sw', state: 'AZ', town: "Sam Hughes, Tucson", kind: 'green', at: [32.24, -110.94] },
  { id: 'green-desert-sw-encanto-palmcroft-phoenix', region: 'desert-sw', state: 'AZ', town: "Encanto-Palmcroft, Phoenix", kind: 'green', at: [33.475, -112.09] },
  { id: 'green-desert-sw-canyon-road-santa-fe', region: 'desert-sw', state: 'NM', town: "Canyon Road, Santa Fe", kind: 'green', at: [35.681, -105.93] },
  { id: 'green-desert-sw-las-cruces', region: 'desert-sw', state: 'NM', town: "Las Cruces", kind: 'green', at: [32.31, -106.77] },
  { id: 'green-desert-sw-cactus-forest-drive-saguaro', region: 'desert-sw', state: 'AZ', town: "Cactus Forest Drive, Saguaro", kind: 'green', at: [32.18, -110.73] },
  { id: 'green-great-basin-the-avenues-salt-lake-city', region: 'great-basin', state: 'UT', town: "The Avenues, Salt Lake City", kind: 'green', at: [40.776, -111.875] },
  { id: 'green-great-basin-old-southwest-reno', region: 'great-basin', state: 'NV', town: "Old Southwest, Reno", kind: 'green', at: [39.515, -119.82] },
  { id: 'green-great-basin-moab', region: 'great-basin', state: 'UT', town: "Moab", kind: 'green', at: [38.58, -109.54] },
  { id: 'green-california-bungalow-heaven-pasadena', region: 'california', state: 'CA', town: "Bungalow Heaven, Pasadena", kind: 'green', at: [34.159, -118.13] },
  { id: 'green-california-professorville-palo-alto', region: 'california', state: 'CA', town: "Professorville, Palo Alto", kind: 'green', at: [37.443, -122.155] },
  { id: 'green-california-fab-40s-sacramento', region: 'california', state: 'CA', town: "Fab 40s, Sacramento", kind: 'green', at: [38.572, -121.45] },
  { id: 'green-california-berkeley-hills', region: 'california', state: 'CA', town: "Berkeley hills", kind: 'green', at: [37.876, -122.255] },
  { id: 'green-california-highway-1-big-sur', region: 'california', state: 'CA', town: "Highway 1, Big Sur", kind: 'green', at: [36.27, -121.81] },
  { id: 'green-pnw-laurelhurst-portland', region: 'pnw', state: 'OR', town: "Laurelhurst, Portland", kind: 'green', at: [45.527, -122.626] },
  { id: 'green-pnw-federal-avenue-east-seattle', region: 'pnw', state: 'WA', town: "Federal Avenue East, Seattle", kind: 'green', at: [47.63, -122.314] },
  { id: 'green-pnw-forks', region: 'pnw', state: 'WA', town: "Forks", kind: 'green', at: [47.95, -124.385] },
  { id: 'green-pnw-upper-hoh-road-the-hoh-rainforest', region: 'pnw', state: 'WA', town: "Upper Hoh Road, the Hoh Rainforest", kind: 'green', at: [47.86, -124.25] },
  { id: 'green-pnw-bend-the-dry-side', region: 'pnw', state: 'OR', town: "Bend (the dry side)", kind: 'green', at: [44.056, -121.315] },
  { id: 'green-pnw-longmire-mount-rainier', region: 'pnw', state: 'WA', town: "Longmire, Mount Rainier", kind: 'green', at: [46.75, -121.813] },
];
const spots = [];
for (const st of STATES) {
  const list = (towns.get(st) ?? []).sort((a, b) => b.pop - a.pop);
  if (!list.length) continue;
  const seed = hash(st);
  const mids = list.filter((t) => t.pop >= 5000 && t.pop <= 50000), smalls = list.filter((t) => t.pop >= 800 && t.pop <= 4000);
  const pickTowns = [['largest', list[0]], ['mid', mids[seed % Math.max(1, mids.length)]], ['small', smalls[(seed >>> 8) % Math.max(1, smalls.length)]]].filter(([, t]) => t).slice(0, PER);
  for (const [kind, t] of pickTowns) {
    const id = `${st}-${kind}-${t.geoid}`;
    // (a kept spot is looked for again when its town's centre has moved — the old first-of-its-name pick)
    const was = keep.get(id);
    const same = was?.img && Math.hypot(was.at[0] - t.lat, was.at[1] - t.lon) < 0.01, why = same ? await unfitWhy(was.img) : null;
    if (same && !why) { spots.push({ ...was, town: `${t.name}, ${st}` }); continue; }
    const img = (await photoNear(t.lat, t.lon, hash(id))) ?? (same ? { ...was.img, unfit: why } : null);
    spots.push({ id, state: st, town: `${t.name}, ${st}`, kind, pop: t.pop, at: [t.lat, t.lon], img });
    console.log(`${id}: ${t.name} (${t.pop.toLocaleString()}) → ${img ? `${img.id} ${img.captured.slice(0, 10)} by ${img.by}, ${img.hfov}°, ${Math.round(img.within * 111000)} m box` : 'no photo near (aerial only)'}`);
  }
}
for (const n of [...NAMED, ...GREEN]) {
  if (!STATES.includes(n.state)) continue;
  const was = keep.get(n.id), why = was?.img ? await unfitWhy(was.img) : null;
  if (was?.img && !why) { spots.push(was); continue; }
  const img = (await photoNear(n.at[0], n.at[1], hash(n.id), n.aim ? [n.at[0], n.at[1]] : null)) ?? (was?.img ? { ...was.img, unfit: why } : null);
  spots.push({ id: n.id, state: n.state, town: n.town, kind: n.kind ?? 'named', ...(n.region ? { region: n.region } : {}), at: n.at, img });
  console.log(`${n.id}: ${img ? `${img.id} ${img.captured.slice(0, 10)}` : 'no photo'}`);
}
// (spots of other states kept as they were)
const out = [...prev.spots.filter((s) => !STATES.includes(s.state)), ...spots].sort((a, b) => (a.state < b.state ? -1 : a.state > b.state ? 1 : a.id < b.id ? -1 : 1));
writeFileSync(OUT, JSON.stringify({ note: 'tools/real-spots.mjs: the comparison loop\'s spots (Mapillary photo ids and poses only — the photos are never kept in the repo or shipped). Photos © their Mapillary contributors, CC BY-SA 4.0.', made: new Date().toISOString().slice(0, 10), spots: out }, null, 1));
console.log(`${out.length} spots (${out.filter((s) => s.img).length} with a photo) → tools/real-spots.json`);
