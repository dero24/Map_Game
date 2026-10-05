#!/usr/bin/env node
// Bake our own lower-48 place index (docs/GAMEPLAY_VISION.md §17, docs/DATA_SOURCES.md "Place
// names"): the map search and the arrival cards, from public-domain US data only — no Photon, no
// street addresses. Writes raw/places/out/{names.bin,names.json,rev.bin,rev.json} for R2
// (`places/v1/…`, served by worker/src/places.js) and a small NJ fixture for the tests.
//
// Inputs (raw/places/, fetched with `node scripts/build-places.mjs --fetch`):
//   - USGS GNIS Domestic Names (current, every other month): towns, hamlets and neighbourhoods,
//     summits, lakes, islands, beaches, falls … (DomesticNames_National_Text.zip)
//   - USGS GNIS 2021 archive (MainDomestic/AllStates.zip): the public places GNIS has since
//     retired — parks, forests, airports, trails, bridges, dams, towers, hospitals, schools …
//   - Census gazetteer 2026 (places, county subdivisions, counties, states: names + points)
//   - Census cartographic boundaries 2025, 1:500k (places, county subdivisions, counties —
//     clipped to the shoreline): the reverse lookup's tiles
//   - Census population estimates 2024 (sub-est2024.csv): a town's standing in the ranking
//
//   node scripts/build-places.mjs [--fetch] [--tol=0.00025]
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { readDbf, readShpPolygons } from './lib/shp.mjs';
import { STATES, nameShards, rowToTsv, normalize, RT, tileKey, km } from '../src/ui/placeIndex.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN = resolve(ROOT, 'raw/places'), OUT = resolve(IN, 'out');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
// the index's version: R2 `places/v<N>/`, worker/src/places.js `V` — bump both together on a re-bake
// (a worker holds a directory for an hour: new offsets under an old key would read the wrong bytes)
const INDEX_V = 3;
const TOL = Number(args.tol ?? 0.00025); // ~25 m: a town line drawn to the width of a street
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);

const SRC = {
  gnis: ['https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_National_Text.zip', 'gnis.zip'],
  gnis2021: ['https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/Archive/MainDomestic/AllStates.zip', 'gnis2021.zip', 'gnis2021'],
  gazPlace: ['https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip', 'gaz_place.zip'],
  gazCousub: ['https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_cousubs_national.zip', 'gaz_cousub.zip'],
  gazCounty: ['https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip', 'gaz_county.zip'],
  gazState: ['https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_state_national.zip', 'gaz_state.zip'],
  cbPlace: ['https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_place_500k.zip', 'cb_place.zip', 'cb_place'],
  cbCousub: ['https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cousub_500k.zip', 'cb_cousub.zip', 'cb_cousub'],
  cbCounty: ['https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip', 'cb_county.zip', 'cb_county'],
  pop: ['https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv', 'sub-est.csv'],
};
if (args.fetch) {
  mkdirSync(IN, { recursive: true });
  for (const [, [url, file, dir]] of Object.entries(SRC)) {
    log('fetch', url);
    execSync(`curl -sfL -o "${resolve(IN, file)}" "${url}"`);
    if (file.endsWith('.zip')) execSync(`unzip -o -q "${resolve(IN, file)}"${dir ? ` -d "${resolve(IN, dir)}"` : ''}`, { cwd: IN });
  }
}

const lower48 = new Set(Object.keys(STATES));
const pipe = (file, enc = 'utf8') => {
  const lines = readFileSync(file, enc).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split('|').map((s) => s.trim());
  return lines.slice(1).map((l) => { const v = l.split('|'); const o = {}; head.forEach((h, i) => (o[h] = (v[i] ?? '').trim())); return o; });
};

// ---- populations (2024 estimates): incorporated places, county subdivisions, counties ----
const pop = new Map();
{
  const lines = readFileSync(resolve(IN, 'sub-est.csv'), 'latin1').split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(',');
  const I = (k) => h.indexOf(k);
  for (const l of lines.slice(1)) {
    const v = l.split(',');
    const lev = v[I('SUMLEV')], st = v[I('STATE')], p = +v[I('POPESTIMATE2024')];
    if (lev === '162') pop.set(`p${st}${v[I('PLACE')]}`, p);
    else if (lev === '061') pop.set(`m${st}${v[I('COUNTY')]}${v[I('COUSUB')]}`, p);
    else if (lev === '050') pop.set(`c${st}${v[I('COUNTY')]}`, p);
  }
  log('populations', pop.size);
}
const standing = (base, p, area) => Math.min(99, Math.round(base + (p ? 7 * Math.log10(p + 1) : 3 * Math.log10(1 + (area ?? 0) / 1e6))));

// ---- counties ----
const stOf = new Map(); // STATEFP -> USPS
for (const r of pipe(resolve(IN, '2026_Gaz_state_national.txt'))) stOf.set(r.GEOID, r.USPS);
const gazCounty = new Map(pipe(resolve(IN, '2026_Gaz_counties_national.txt')).map((r) => [r.GEOID, r]));
const countyName = new Map(); // GEOID (5) -> "Monmouth County"
for (const [g, r] of gazCounty) countyName.set(g, r.NAME);
const cbC = readDbf(resolve(IN, 'cb_county/cb_2025_us_county_500k.dbf'));
const cbCPoly = readShpPolygons(resolve(IN, 'cb_county/cb_2025_us_county_500k.shp'));
const counties = [];
cbC.forEach((d, i) => {
  if (!d || !lower48.has(d.STUSPS) || !cbCPoly[i]) return;
  counties.push({ geoid: d.GEOID, name: d.NAMELSAD, st: d.STUSPS, rings: cbCPoly[i], bb: bbox(cbCPoly[i]) });
});
log('counties', counties.length);
function bbox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
  return [x0, y0, x1, y1];
}
function inPoly(rings, x, y) {
  let ins = false;
  for (const r of rings) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; }
  return ins;
}
// the county a point is in — or, for a point in the water (a harbour city's Census point out in
// its bay; the outlines are clipped to the shore), the county with the nearest shore round it
const countyAt = (lat, lon) => {
  const cand = counties.filter((c) => lon >= c.bb[0] - 0.05 && lon <= c.bb[2] + 0.05 && lat >= c.bb[1] - 0.05 && lat <= c.bb[3] + 0.05);
  const inside = cand.find((c) => inPoly(c.rings, lon, lat));
  if (inside) return inside;
  let best = null, bd = Infinity;
  for (const c of cand) for (const r of c.rings) for (let i = 0; i < r.length; i += 2) { const d = (r[i] - lon) ** 2 + (r[i + 1] - lat) ** 2; if (d < bd) (bd = d), (best = c); }
  return bd < 0.05 ** 2 ? best : null;
};

// ---- the rows: Census first (states, counties, places, active county subdivisions) ----
const rows = [];
const add = (r) => { if (r.name && isFinite(r.lat) && isFinite(r.lon) && (r.lat || r.lon)) rows.push(r); };
for (const r of pipe(resolve(IN, '2026_Gaz_state_national.txt'))) if (lower48.has(r.USPS)) add({ name: r.NAME, kind: 'state', st: r.USPS, county: '', lat: +r.INTPTLAT, lon: +r.INTPTLONG, w: 95 });
for (const [g, r] of gazCounty) if (lower48.has(r.USPS)) add({ name: r.NAME, kind: /parish/i.test(r.NAME) ? 'parish' : 'county', st: r.USPS, county: '', lat: +r.INTPTLAT, lon: +r.INTPTLONG, w: standing(52, pop.get(`c${g}`)) });

// a Census name's kind: what NAMELSAD adds to NAME ("Shrewsbury borough" → borough); a CDP is a community
const lsadKind = (name, namelsad) => { const k = namelsad.startsWith(name) ? namelsad.slice(name.length).trim() : ''; return !k || /CDP/.test(k) ? 'community' : k.replace(/^\(|\)$/g, ''); };
const gazPlace = new Map(pipe(resolve(IN, '2026_Gaz_place_national.txt')).map((r) => [r.GEOID, r]));
const cbP = readDbf(resolve(IN, 'cb_place/cb_2025_us_place_500k.dbf'));
const cbPPoly = readShpPolygons(resolve(IN, 'cb_place/cb_2025_us_place_500k.shp'));
const places = [];
cbP.forEach((d, i) => {
  if (!d || !lower48.has(d.STUSPS) || !cbPPoly[i]) return;
  const g = gazPlace.get(d.GEOID);
  const lat = g ? +g.INTPTLAT : NaN, lon = g ? +g.INTPTLONG : NaN;
  const cdp = d.LSAD === '57';
  const c = isFinite(lat) ? countyAt(lat, lon) : null;
  const kind = lsadKind(d.NAME, d.NAMELSAD);
  places.push({ geoid: d.GEOID, name: d.NAME, kind, st: d.STUSPS, county: c?.name ?? '', rings: cbPPoly[i], bb: bbox(cbPPoly[i]) });
  add({ name: d.NAME, kind, st: d.STUSPS, county: c?.name ?? '', lat, lon, w: standing(cdp ? 40 : 46, cdp ? 0 : pop.get(`p${d.GEOID}`), cdp ? +d.ALAND : 0) });
});
log('places', places.length);
// county subdivisions: only active governments (a New England town, a township); the statistical
// ones (CCDs, unorganized territories) aren't names anyone uses
const gazCousub = new Map(pipe(resolve(IN, '2026_Gaz_cousubs_national.txt')).map((r) => [r.GEOID, r]));
const cbM = readDbf(resolve(IN, 'cb_cousub/cb_2025_us_cousub_500k.dbf'));
const cbMPoly = readShpPolygons(resolve(IN, 'cb_cousub/cb_2025_us_cousub_500k.shp'));
const mcds = [];
const placeKey = new Map(); // normalized name|state -> [lat, lon, kind][] (for dedupe)
const remember = (name, st, lat, lon, kind) => { const k = `${normalize(name)}|${st}`; if (!placeKey.has(k)) placeKey.set(k, []); placeKey.get(k).push([lat, lon, kind]); };
// the same name near by — of the same kind when one is given (Shrewsbury borough and Shrewsbury
// township are two towns 2 km apart; a borough that is its own county subdivision is one)
const known = (name, st, lat, lon, within, kind) => (placeKey.get(`${normalize(name)}|${st}`) ?? []).some(([a, b, k]) => km(a, b, lat, lon) < within && (!kind || k === kind));
for (const r of rows) if (r.kind !== 'state') remember(r.name, r.st, r.lat, r.lon, r.kind);
cbM.forEach((d, i) => {
  if (!d || !lower48.has(d.STUSPS) || !cbMPoly[i]) return;
  const g = gazCousub.get(d.GEOID);
  if (!g || !['A', 'B', 'C'].includes(g.FUNCSTAT)) return;
  const county = countyName.get(d.GEOID.slice(0, 5)) ?? '';
  const kind = lsadKind(d.NAME, d.NAMELSAD);
  if (kind === 'community') return;
  mcds.push({ geoid: d.GEOID, name: d.NAME, kind, st: d.STUSPS, county, rings: cbMPoly[i], bb: bbox(cbMPoly[i]) });
  const lat = +g.INTPTLAT, lon = +g.INTPTLONG;
  // a township that is also the place of its name (a city that is its own MCD) is one row
  if (known(d.NAME, d.STUSPS, lat, lon, 3, kind)) return;
  add({ name: d.NAME, kind, st: d.STUSPS, county, lat, lon, w: standing(42, pop.get(`m${d.GEOID}`)) });
  remember(d.NAME, d.STUSPS, lat, lon, kind);
});
log('county subdivisions (active)', mcds.length);

// ---- GNIS: populated places and the land's own names (current), public places (2021) ----
const GNIS_NOW = { 'Populated Place': ['community', 36], Summit: ['summit', 32], Lake: ['lake', 31], Reservoir: ['reservoir', 28], Island: ['island', 33], Bay: ['bay', 33], Cape: ['cape', 30],
  Beach: ['beach', 37], Falls: ['falls', 36], Glacier: ['glacier', 36], Arch: ['arch', 36], Valley: ['valley', 22], Ridge: ['ridge', 23], Range: ['range', 34], Basin: ['basin', 21],
  Cliff: ['cliff', 22], Pillar: ['pillar', 25], Crater: ['crater', 30], Lava: ['lava field', 25], Spring: ['spring', 16], Stream: ['stream', 21], Canal: ['canal', 21], Channel: ['channel', 20],
  Gap: ['gap', 20], Swamp: ['swamp', 17], Woods: ['woods', 21], Flat: ['flat', 14], Bar: ['bar', 14], Bend: ['bend', 11], Gut: ['gut', 11], Sea: ['sea', 40], Isthmus: ['isthmus', 24],
  Plain: ['plain', 19], Slope: ['slope', 11], Bench: ['bench', 10], Rapids: ['rapids', 21], Arroyo: ['arroyo', 14], Crossing: ['crossing', 14], Area: ['area', 12] };
const GNIS_2021 = { Park: ['park', 39], Forest: ['forest', 41], Reserve: ['reserve', 39], Airport: ['airport', 41], Trail: ['trail', 29], Harbor: ['harbor', 31], Bridge: ['bridge', 31],
  Tunnel: ['tunnel', 29], Tower: ['tower', 31], Dam: ['dam', 27], Hospital: ['hospital', 27], Building: ['building', 26], School: ['school', 21], Church: ['place of worship', 17],
  Cemetery: ['cemetery', 14], 'Post Office': ['post office', 14] };
const stateByName = new Map(Object.entries(STATES).map(([c, n]) => [n, c]));
// the parks a country knows by name stand above every other park, a state's above a town's
const fame = (name) => (/\bNational (Park|Monument|Seashore|Lakeshore|Recreation Area|Historical Park|Historic Site|Preserve|Memorial|Forest|Wildlife Refuge|Battlefield|Scenic River)$/.test(name) ? 30 : /\bState (Park|Forest|Beach|Recreation Area)$/.test(name) ? 10 : 0);
let gn = 0;
for (const r of pipe(resolve(IN, 'Text/DomesticNames_National.txt'))) {
  const k = GNIS_NOW[r.feature_class], st = stateByName.get(r.state_name);
  if (!k || !st) continue;
  const lat = +r.prim_lat_dec, lon = +r.prim_long_dec;
  if (!lat || !lon) continue;
  if (k[0] === 'community' && known(r.feature_name, st, lat, lon, 6)) continue; // already a Census place
  add({ name: r.feature_name, kind: k[0], st, county: countyName.get(`${r.state_numeric}${r.county_numeric}`) ?? '', lat, lon, w: k[1] });
  gn++;
}
log('GNIS (current)', gn);
gn = 0;
for (const f of readdirSync(resolve(IN, 'gnis2021')).filter((f) => f.endsWith('.txt'))) {
  for (const r of pipe(resolve(IN, 'gnis2021', f))) {
    const k = GNIS_2021[r.FEATURE_CLASS], st = r.STATE_ALPHA;
    if (!k || !lower48.has(st)) continue;
    const lat = +r.PRIM_LAT_DEC, lon = +r.PRIM_LONG_DEC;
    if (!lat || !lon) continue;
    add({ name: r.FEATURE_NAME, kind: k[0], st, county: countyName.get(`${r.STATE_NUMERIC}${r.COUNTY_NUMERIC}`) ?? '', lat, lon, w: k[1] + fame(r.FEATURE_NAME) });
    gn++;
  }
}
log('GNIS (2021 public places)', gn, '· rows', rows.length);

// ---- the shards: every row under each word's first three letters, best first ----
mkdirSync(OUT, { recursive: true });
const shards = new Map();
for (const r of rows) {
  const line = rowToTsv(r);
  for (const k of nameShards(r.name)) { if (!shards.has(k)) shards.set(k, []); shards.get(k).push([r.w, line]); }
}
const pack = (entries, file) => {
  const dir = {};
  const bufs = [];
  let off = 0;
  for (const [k, body] of entries) {
    const gz = gzipSync(Buffer.from(body), { level: 9 });
    dir[k] = [off, gz.length];
    bufs.push(gz);
    off += gz.length;
  }
  writeFileSync(resolve(OUT, file), Buffer.concat(bufs));
  return { dir, bytes: off };
};
const keys = [...shards.keys()].sort();
const nameEntries = keys.map((k) => [k, shards.get(k).sort((a, b) => b[0] - a[0]).map((x) => x[1]).join('\n') + '\n']);
const names = pack(nameEntries, 'names.bin');
const made = new Date().toISOString().slice(0, 10);
const SOURCES = ['USGS GNIS Domestic Names (2026-09)', 'USGS GNIS 2021 archive (public places)', 'US Census Bureau 2026 Gazetteer', 'US Census Bureau 2024 population estimates'];
const sizes = Object.values(names.dir).map((v) => v[1]).sort((a, b) => a - b);
writeFileSync(resolve(OUT, 'names.json'), JSON.stringify({ v: INDEX_V, made, rows: rows.length, sources: SOURCES, shards: Object.fromEntries(keys.map((k, i) => [k, [...names.dir[k], shards.get(k).length]])) }));
log(`names.bin ${(names.bytes / 1e6).toFixed(1)} MB in ${keys.length} shards (median ${sizes[sizes.length >> 1]} B, p99 ${sizes[Math.floor(sizes.length * 0.99)]} B, max ${sizes.at(-1)} B gz)`);

// ---- the reverse tiles: boundaries simplified (~25 m) and clipped to 0.25° tiles ----
function simplify(r, tol) {
  const n = r.length / 2;
  if (n <= 4) return r;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = r[a * 2], ay = r[a * 2 + 1], bx = r[b * 2], by = r[b * 2 + 1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((r[i * 2] - ax) * dy - (r[i * 2 + 1] - ay) * dx) / L; if (d > bd) (bd = d), (best = i); }
    if (best >= 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(r[i * 2], r[i * 2 + 1]);
  return out.length >= 8 ? out : r;
}
function clip(r, x0, y0, x1, y1) {
  let pts = [];
  for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]);
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]], [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]]];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  const flat = [];
  for (const [x, y] of pts) flat.push(Math.round(x * 1e5), Math.round(y * 1e5));
  return flat;
}
const tiles = new Map();
const put = (b, kind) => {
  const rings = b.rings.map((r) => simplify(r, TOL));
  const [x0, y0, x1, y1] = bbox(rings);
  for (let ix = Math.floor((x0 + 180) / RT); ix <= Math.floor((x1 + 180) / RT); ix++)
    for (let iy = Math.floor((y0 + 90) / RT); iy <= Math.floor((y1 + 90) / RT); iy++) {
      const tx0 = ix * RT - 180, ty0 = iy * RT - 90, e = 1e-6;
      const cr = rings.map((r) => clip(r, tx0 - e, ty0 - e, tx0 + RT + e, ty0 + RT + e)).filter(Boolean);
      if (!cr.length) continue;
      const k = tileKey(ix, iy);
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push({ k: kind, n: b.name, s: b.st, ...(kind !== 'c' && b.county ? { c: b.county } : {}), r: cr });
    }
};
for (const p of places) put(p, 'p');
for (const m of mcds) put(m, 'm');
for (const c of counties) put(c, 'c');
const tkeys = [...tiles.keys()].sort();
const rev = pack(tkeys.map((k) => [k, JSON.stringify({ v: INDEX_V, b: tiles.get(k) })]), 'rev.bin');
writeFileSync(resolve(OUT, 'rev.json'), JSON.stringify({ v: INDEX_V, made, rt: RT, sources: ['US Census Bureau 2025 cartographic boundaries (1:500,000): places, county subdivisions, counties'], tiles: rev.dir }));
const tsz = Object.values(rev.dir).map((v) => v[1]).sort((a, b) => a - b);
log(`rev.bin ${(rev.bytes / 1e6).toFixed(1)} MB in ${tkeys.length} tiles (median ${tsz[tsz.length >> 1]} B, max ${tsz.at(-1)} B gz)`);

// ---- the tests' fixture: New Jersey's rows of a few shards, and the tiles round the shore ----
const FIX = resolve(ROOT, 'tests/fixtures/places');
mkdirSync(FIX, { recursive: true });
const fixShards = ['shr', 'mon', 'sea', 'red', 'spr', 'por', 'new', 'nav', 'asb'];
const fix = {};
// (New Jersey's towns and the shore's own names; every Springfield and Portland town for the ranking)
const townish = /\t(city|town|borough|village|township|community|county|state)\t/;
const keepFix = (l) => (/\tNJ\t/.test(l) && (townish.test(l) || /\t(beach|park|stream|island|bay)\t/.test(l)) && +l.split('\t')[6] >= 30) || (/^(Springfield|Portland)\t/.test(l) && townish.test(l));
for (const k of fixShards) fix[k] = (nameEntries.find(([kk]) => kk === k)?.[1] ?? '').split('\n').filter(keepFix).join('\n') + '\n';
const fixTiles = {};
for (const [lat, lon] of [[40.3297, -74.0617], [40.3597, -73.975], [40.31, -73.98], [40.2, -74.01], [40.36, -73.9]]) {
  const k = tileKey(Math.floor((lon + 180) / RT), Math.floor((lat + 90) / RT));
  if (tiles.has(k)) fixTiles[k] = { v: 1, b: tiles.get(k) };
}
writeFileSync(resolve(FIX, 'shards.json'), JSON.stringify(fix));
writeFileSync(resolve(FIX, 'rev.json'), JSON.stringify(fixTiles));
log('fixture', Object.keys(fix).length, 'shards,', Object.keys(fixTiles).length, 'tiles →', FIX);
