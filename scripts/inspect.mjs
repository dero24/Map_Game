// Dev aid: summarize what the raw OSM pull contains.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAW, SLICE } from './config.mjs';

const osm = JSON.parse(readFileSync(resolve(RAW, 'osm.json'), 'utf8'));
const inSlice = (e) => {
  const g = e.geometry ?? (e.lat ? [{ lat: e.lat, lon: e.lon }] : e.bounds ? [{ lat: e.bounds.minlat, lon: e.bounds.minlon }] : []);
  return g.some((p) => p && p.lat > SLICE.s && p.lat < SLICE.n && p.lon > SLICE.w && p.lon < SLICE.e);
};
const tally = {};
const bump = (k) => (tally[k] = (tally[k] ?? 0) + 1);
let bSlice = 0, bAll = 0, bH = 0, bL = 0, bRoof = 0, bColor = 0;
const names = new Set();
const buildingTypes = {};
for (const e of osm.elements) {
  const t = e.tags ?? {};
  const s = inSlice(e);
  if (t.building) {
    bAll++;
    if (s) {
      bSlice++;
      if (t.height) bH++;
      if (t['building:levels']) bL++;
      if (t['roof:shape']) bRoof++;
      if (t['building:colour']) bColor++;
      buildingTypes[t.building] = (buildingTypes[t.building] ?? 0) + 1;
    }
    continue;
  }
  if (!s) continue;
  for (const k of ['highway', 'natural', 'landuse', 'leisure', 'man_made', 'amenity', 'shop', 'tourism', 'barrier', 'waterway', 'bridge', 'surface', 'place', 'historic', 'power'])
    if (t[k]) bump(`${k}=${t[k]}`);
  if (t.name) names.add(`${t.name} [${Object.entries(t).filter(([k]) => /amenity|shop|leisure|tourism|highway|man_made|natural|landuse|club|building/.test(k)).map(([k, v]) => k + '=' + v).join(',')}] ${e.type}`);
}
console.log({ bAll, bSlice, bH, bL, bRoof, bColor });
console.log(buildingTypes);
console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
console.log([...names].sort().join('\n'));
