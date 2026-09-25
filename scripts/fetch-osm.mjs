// One-time OSM pull via Overpass for the backdrop bbox (superset of the slice).
// Equivalent to an osmium bbox extract of the Geofabrik NJ pbf, but ~1000x smaller to download.
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAW, BACKDROP, SLICE, UA } from './config.mjs';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const bb = (b) => `${b.s},${b.w},${b.n},${b.e}`;
const B = bb(BACKDROP);
const S = bb(SLICE);

// Slice: everything we might draw. Backdrop: only what reads on the horizon.
const query = `[out:json][timeout:300][maxsize:536870912];
(
  nwr(${S});
  way["building"](${B});
  relation["building"](${B});
  way["building:part"](${B});
  way["natural"="coastline"](${B});
  nwr["natural"~"^(water|beach|sand|wood|scrub|wetland|grassland|heath)$"](${B});
  nwr["waterway"](${B});
  nwr["landuse"](${B});
  nwr["leisure"~"^(park|golf_course|marina|pitch|nature_reserve|beach_resort)$"](${B});
  way["highway"](${B});
  nwr["man_made"~"^(lighthouse|pier|groyne|breakwater|bridge|water_tower|tower)$"](${B});
  way["bridge"](${B});
  way["railway"](${B});
);
out body geom qt;`;

mkdirSync(RAW, { recursive: true });
const out = resolve(RAW, 'osm.json');
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log(`osm.json exists (${(statSync(out).size / 1e6).toFixed(1)} MB) — use --force to refetch`);
  process.exit(0);
}

for (const url of ENDPOINTS) {
  try {
    console.log('POST', url);
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    const text = await res.text();
    const json = JSON.parse(text);
    writeFileSync(out, text);
    const counts = {};
    for (const e of json.elements) counts[e.type] = (counts[e.type] ?? 0) + 1;
    console.log(`ok in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(text.length / 1e6).toFixed(1)} MB`, counts);
    console.log('osm3s timestamp:', json.osm3s?.timestamp_osm_base);
    process.exit(0);
  } catch (e) {
    console.warn('failed:', e.message);
  }
}
process.exit(1);
