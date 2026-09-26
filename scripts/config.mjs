// Shared bake configuration. Everything is download-once -> bake offline -> ship static.
// Adding a town = one REGIONS entry + `npm run fetch -- --region=<id>` + `npm run bake -- --region=<id>`.
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Per-region spec:
//   slice      playable bbox {s,w,n,e} — full detail
//   backdrop   horizon bbox (buildings/terrain at LOD) — must contain slice
//   origin     local tangent-plane anchor {lat,lon}; +x east, +z south, metres
//   tz         IANA timezone (sun ephemeris + clock + 'real town time' mode)
//   oceanEdge  which slice/backdrop edge the open ocean touches ('e'|'w'|'n'|'s') — drives the ocean flood-fill
//   spawn      { on: '<road name>', near?: {road, bridge?, extreme:'e'|'w'|'n'|'s'}, offset?:[m,m],
//                toward:'n'|'s'|'e'|'w', sidewalk?: m } — anchor: extreme point of `near.road` (else slice centre);
//              then nearest point on `on` to anchor+offset, facing `toward`, stepped `sidewalk` m right.
//   roads      { main?: '<name>', bridge?: '<name>' } — anchor names for the debug/capture shots
//   shoreLabel HUD label when near the ocean but not on a named road
//   landmarks  skyline-only features beyond the backdrop: {id,name,lat,lon,h,ground}
//   imagery    false to skip the aerial roof-colour pass (default: USDA NAIP where it has coverage)
export const REGIONS = {
  // The one world: Sea Bright through Monmouth Beach as a single bake (shared origin = Sea
  // Bright's, so its spawn is unchanged); everything beyond streams real-lite tiles.
  // Built offline from the two towns' fetches: `node scripts/merge-raw.mjs --region=shore`
  // then `npm run bake -- --region=shore` (or fetch it fresh over the union bbox).
  shore: {
    name: 'Sea Bright',
    title: 'The Jersey Shore',
    sub: 'a watercolor walk · Sea Bright to Monmouth Beach, New Jersey — and beyond',
    tz: 'America/New_York',
    slice: { s: 40.316, w: -74.005, n: 40.372, e: -73.963 },
    // w = -74.04: the union rectangle's NW corner (Highlands hills) lies outside both towns'
    // fetches — past this edge the tile service streams real cells instead.
    backdrop: { s: 40.27, w: -74.04, n: 40.475, e: -73.94 },
    origin: { lat: 40.362, lon: -73.9755 },
    oceanEdge: 'e',
    spawn: { on: 'Ocean Avenue', near: { road: 'Rumson Road', bridge: true, extreme: 'e' }, offset: [40, 215], toward: 'south', sidewalk: 7.5 },
    roads: { main: 'Ocean Avenue', bridge: 'Rumson Road' },
    shoreLabel: 'the beach',
    landmarks: [
      { id: 'sandy-hook-light', name: 'Sandy Hook Lighthouse', lat: 40.46173, lon: -74.00197, h: 31, ground: 3 },
    ],
    mergeFrom: ['seabright', 'monmouthbeach'],
  },
  // Merge sources for `shore` (hidden: fetched per town, never listed as separate worlds).
  seabright: {
    hidden: true,
    name: 'Sea Bright',
    title: 'Sea Bright, N.J.',
    sub: 'a watercolor walk · Monmouth County, New Jersey',
    tz: 'America/New_York',
    slice: { s: 40.352, w: -73.993, n: 40.372, e: -73.964 },
    backdrop: { s: 40.3, w: -74.04, n: 40.475, e: -73.94 },
    origin: { lat: 40.362, lon: -73.9755 },
    oceanEdge: 'e',
    spawn: { on: 'Ocean Avenue', near: { road: 'Rumson Road', bridge: true, extreme: 'e' }, offset: [40, 215], toward: 'south', sidewalk: 7.5 },
    roads: { main: 'Ocean Avenue', bridge: 'Rumson Road' },
    shoreLabel: 'the beach',
    landmarks: [
      { id: 'sandy-hook-light', name: 'Sandy Hook Lighthouse', lat: 40.46173, lon: -74.00197, h: 31, ground: 3 },
    ],
  },
  monmouthbeach: {
    hidden: true,
    name: 'Monmouth Beach',
    title: 'Monmouth Beach, N.J.',
    sub: 'a watercolor walk · Monmouth County, New Jersey',
    tz: 'America/New_York',
    slice: { s: 40.316, w: -74.005, n: 40.346, e: -73.963 },
    backdrop: { s: 40.27, w: -74.07, n: 40.44, e: -73.93 },
    origin: { lat: 40.3304, lon: -73.9862 },
    oceanEdge: 'e',
    spawn: { on: 'Ocean Avenue', toward: 'north', sidewalk: 7.5 },
    roads: { main: 'Ocean Avenue' },
    shoreLabel: 'the beach',
    landmarks: [
      { id: 'sandy-hook-light', name: 'Sandy Hook Lighthouse', lat: 40.46173, lon: -74.00197, h: 31, ground: 3 },
    ],
  },
};

// Region selection: `--region=<id>` argv flag wins, then REGION env var, else 'seabright'.
const arg = process.argv.find((a) => a.startsWith('--region='))?.split('=')[1];
export const REGION = arg ?? process.env.REGION ?? 'shore';
export const CFG = REGIONS[REGION];
if (!CFG) {
  console.error(`unknown region '${REGION}' — known: ${Object.keys(REGIONS).join(', ')}`);
  process.exit(2);
}

const rawRoot = resolve(ROOT, 'raw');
// Transition shim: the original flat raw/ layout (osm.json at top level) counts as seabright's data,
// so no files need moving. Once data lives under raw/<region>/ for every region, drop this.
export const RAW = REGION === 'seabright' && existsSync(resolve(rawRoot, 'osm.json')) && !existsSync(resolve(rawRoot, 'seabright', 'osm.json'))
  ? rawRoot
  : resolve(rawRoot, REGION);                              // per-region downloaded inputs
export const OUT = resolve(ROOT, 'public', 'data', REGION); // per-region baked pack
export const DATA = resolve(ROOT, 'public', 'data');        // shared: regions.json manifest

export const SLICE = CFG.slice;
export const BACKDROP = CFG.backdrop;
export const ORIGIN = CFG.origin;

export const UA = `map_game-bake/0.1 (watercolor ${CFG.name} walk; offline one-time bake)`;
