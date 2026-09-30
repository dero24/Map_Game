#!/usr/bin/env node
// Neighbourhood fixtures (docs/NEIGHBOURHOODS.md §4): frozen snapshots of the houses round each
// reference neighbourhood, for tests/hoods.test.ts. Taken from the game's own tile service — the
// real-lite tile a visitor would stream there (worker/, realTile.ts) — so the test measures exactly
// what the game measures. Only the fields the measure reads are kept (ring, kind, height, floors,
// fill flag), for the one 1024 m tile holding the point. Re-run to refresh; a place the service
// can't answer just now keeps its old fixture. (ODbL: © OpenStreetMap contributors.)
//
//   node tools/hood-fixtures.mjs [--only=ny-tract,il-bungalow] [--tries=3]
//   (behind a proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle> node tools/hood-fixtures.mjs)
// The shore's own towns (Rumson, Fair Haven, Red Bank) need no fixture: the baked pack is in the repo.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
// expect: the class most of the place's measured homes should take (hood.ts)
export const HOODS = [
  { id: 'ny-tract', place: 'Levittown NY', lat: 40.727, lon: -73.514, expect: 'tract' },
  { id: 'az-tract', place: 'Gilbert AZ', lat: 33.35, lon: -111.755, expect: 'tract' },
  { id: 'il-bungalow', place: 'Chicago, Portage Park IL', lat: 41.955, lon: -87.764, expect: 'grid' },
  { id: 'wa-craftsman', place: 'Seattle, Wallingford WA', lat: 47.66, lon: -122.337, expect: 'grid' },
  { id: 'ct-estate', place: 'Greenwich CT (back country)', lat: 41.08, lon: -73.66, expect: 'estate' },
  { id: 'tx-suburb', place: 'Sugar Land TX', lat: 29.598, lon: -95.62, expect: 'suburb' },
];
const BASE = args.base ?? 'https://map-game-tiles.map-game-tiles.workers.dev';
const V = 22; // (the client's &v= — src/world/stream.ts)
const TRIES = +(args.tries ?? 3);

const only = args.only ? String(args.only).split(',') : null;
mkdirSync(resolve(ROOT, 'tests/fixtures/hoods'), { recursive: true });
for (const h of HOODS) {
  if (only && !only.includes(h.id)) continue;
  // the stream's frame: origin snapped to 1/64°, 1024 m tiles, +x east, +z south
  const olat = Math.round(h.lat * 64) / 64, olon = Math.round(h.lon * 64) / 64;
  const x = (h.lon - olon) * 111320 * Math.cos((olat * Math.PI) / 180), z = -(h.lat - olat) * 111320;
  const key = `${Math.floor(x / 1024)}_${Math.floor(z / 1024)}`;
  let tile = null;
  for (let t = 0; t < TRIES && !tile; t++) {
    try {
      const r = await fetch(`${BASE}/tile/${key}.json?olat=${olat}&olon=${olon}&v=${V}`, { signal: AbortSignal.timeout(150000) });
      if (r.ok) tile = await r.json();
      else console.warn(h.id, 'try', t + 1, r.status);
    } catch (e) { console.warn(h.id, 'try', t + 1, String(e).slice(0, 80)); }
    if (!tile) await new Promise((r) => setTimeout(r, 20000));
  }
  if (!tile) { console.warn(h.id, 'no answer — kept the old fixture (if any)'); continue; }
  const buildings = (tile.buildings ?? []).filter((b) => b.own !== 0 && (b.k === 'house' || b.k === 'large'))
    .map((b) => ({ r: b.r, h: b.h, k: b.k, s: b.s, roof: b.roof, ...(b.fl ? { fl: b.fl } : {}), ...(b.gen ? { gen: b.gen } : {}) }));
  const out = { id: h.id, place: h.place, lat: h.lat, lon: h.lon, expect: h.expect, tile: key, source: '© OpenStreetMap contributors (ODbL), via the map_game tile service', fetched: new Date().toISOString().slice(0, 10), buildings };
  writeFileSync(resolve(ROOT, `tests/fixtures/hoods/${h.id}.json`), JSON.stringify(out));
  console.log(h.id, h.place, buildings.length, 'homes', buildings.filter((b) => b.gen === 'fill').length, 'of them guesses');
}
