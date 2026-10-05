// Bake the EPA's Level III ecoregions (and the states they're cut by) into two lat/lon byte grids
// over the lower 48, written as a generated module the game reads: src/world/ecoGrid.ts.
//
//   node scripts/bake-ecoregions.mjs [--step=0.05] [--src=raw/ecoregions/us_eco_l3_state_boundaries.shp]
//
// Source: US EPA, "Level III Ecoregions of the Continental United States" with state boundaries
// (us_eco_l3_state_boundaries.zip, https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states).
// Public domain: "Use constraints: None … acknowledgement of the EPA would be appreciated" (its metadata).
// Fetched by this script into raw/ecoregions/ (git-ignored) when it isn't there yet.
//
// The shapefile is in the USGS's Albers equal-area conic (NAD83, GRS 1980). Its vertices are taken
// back to lat/lon and each polygon is scan-filled at cell centres: a cell holds the ecoregion and
// the state its centre falls in, 0 for water and outside the lower 48 (the game's lookup takes the
// nearest land cell for a coast). Each grid row is run-length coded, then base64.
// Deterministic: the same shapefile gives a byte-identical module.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const STEP = +(args.step ?? 0.05);
const RAWDIR = resolve(ROOT, 'raw/ecoregions');
const SRC = resolve(ROOT, String(args.src ?? 'raw/ecoregions/us_eco_l3_state_boundaries.shp'));
const URL = 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/us/us_eco_l3_state_boundaries.zip';
const OUT = resolve(ROOT, 'src/world/ecoGrid.ts');
// the grid: the lower 48 with a margin (the Florida Keys to the Lake of the Woods, Cape Flattery to Maine)
const LAT0 = 24, LAT1 = 50, LON0 = -125, LON1 = -66;

if (!existsSync(SRC)) {
  mkdirSync(RAWDIR, { recursive: true });
  const zip = resolve(RAWDIR, 'us_eco_l3_state_boundaries.zip');
  console.log(`fetching ${URL}`);
  execFileSync('curl', ['-sS', '-L', '-o', zip, URL], { stdio: 'inherit' });
  execFileSync('unzip', ['-o', '-q', zip, '-d', RAWDIR], { stdio: 'inherit' });
}

// ---- the states, by name → postal code (the shapefile names them in full) ----
const POSTAL = {
  Alabama: 'AL', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI',
  Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY',
};
const STATES = Object.values(POSTAL).sort(); // index + 1 is the state grid's byte

// ---- the attribute table ----
function readDbf(path) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: b[o + 16] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = hl + i * rl + 1;
    const r = {};
    for (const f of fields) (r[f.name] = b.toString('latin1', o, o + f.len).trim()), (o += f.len);
    rows.push(r);
  }
  return rows;
}

// ---- the shapes (polygon records: rings of x, y in metres) ----
function readShp(path) {
  const b = readFileSync(path);
  const shapes = [];
  let o = 100;
  while (o + 8 <= b.length) {
    const len = b.readInt32BE(o + 4) * 2;
    const c = o + 8;
    const type = b.readInt32LE(c);
    if (type === 5 || type === 15 || type === 25) {
      const nParts = b.readInt32LE(c + 36), nPts = b.readInt32LE(c + 40);
      const parts = [];
      for (let i = 0; i < nParts; i++) parts.push(b.readInt32LE(c + 44 + i * 4));
      const p0 = c + 44 + nParts * 4;
      const rings = [];
      for (let i = 0; i < nParts; i++) {
        const a = parts[i], z = i + 1 < nParts ? parts[i + 1] : nPts;
        const ring = new Float64Array((z - a) * 2);
        for (let k = a; k < z; k++) (ring[(k - a) * 2] = b.readDoubleLE(p0 + k * 16)), (ring[(k - a) * 2 + 1] = b.readDoubleLE(p0 + k * 16 + 8));
        rings.push(ring);
      }
      shapes.push(rings);
    } else shapes.push([]);
    o = c + len;
  }
  return shapes;
}

// ---- the USGS Albers (NAD83 / GRS 1980; standard parallels 29.5° and 45.5°, origin 23°N 96°W), inverted (Snyder 1987, §14) ----
const A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F), E = Math.sqrt(E2);
const D = Math.PI / 180;
const mOf = (p) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const qOf = (p) => { const s = Math.sin(p); return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s))); };
const P1 = 29.5 * D, P2 = 45.5 * D, P0 = 23 * D, L0 = -96 * D;
const m1 = mOf(P1), m2 = mOf(P2), q1 = qOf(P1), q2 = qOf(P2), q0 = qOf(P0);
const N = (m1 * m1 - m2 * m2) / (q2 - q1), C = m1 * m1 + N * q1, RHO0 = (A * Math.sqrt(C - N * q0)) / N;
function inverse(x, y) {
  const rho = Math.hypot(x, RHO0 - y), th = Math.atan2(x, RHO0 - y);
  const q = (C - (rho * rho * N * N) / (A * A)) / N;
  let p = Math.asin(Math.max(-1, Math.min(1, q / 2)));
  for (let i = 0; i < 12; i++) {
    const s = Math.sin(p), es = 1 - E2 * s * s;
    const dp = ((es * es) / (2 * Math.cos(p))) * (q / (1 - E2) - s / es + (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
    p += dp;
    if (Math.abs(dp) < 1e-12) break;
  }
  return [(L0 + th / N) / D, p / D]; // lon, lat
}
// (the forward map, to check the inverse round-trips)
function forward(lon, lat) {
  const rho = (A * Math.sqrt(C - N * qOf(lat * D))) / N, th = N * (lon * D - L0);
  return [rho * Math.sin(th), RHO0 - rho * Math.cos(th)];
}
for (const [lo, la] of [[-122.33, 47.61], [-80.19, 25.76], [-69.0, 47.0], [-96, 23]]) {
  const [x, y] = forward(lo, la), [lo2, la2] = inverse(x, y);
  if (Math.abs(lo2 - lo) > 1e-9 || Math.abs(la2 - la) > 1e-9) throw new Error(`Albers round trip failed at ${lo},${la}: ${lo2},${la2}`);
}

// ---- rasterise ----
const ROWS = Math.round((LAT1 - LAT0) / STEP), COLS = Math.round((LON1 - LON0) / STEP);
const l3 = new Uint8Array(ROWS * COLS), st = new Uint8Array(ROWS * COLS);
const dbf = readDbf(SRC.replace(/\.shp$/, '.dbf'));
const shp = readShp(SRC);
if (dbf.length !== shp.length) throw new Error(`records: ${dbf.length} in the table, ${shp.length} shapes`);
let filled = 0;
for (let r = 0; r < shp.length; r++) {
  const code = +dbf[r].US_L3CODE, sIdx = STATES.indexOf(POSTAL[dbf[r].STATE_NAME]) + 1;
  if (!(code >= 1 && code <= 255) || sIdx < 1) throw new Error(`record ${r}: code ${dbf[r].US_L3CODE}, state ${dbf[r].STATE_NAME}`);
  // every ring's edges in lat/lon; the crossings of each row's centre line (even-odd: holes cut out)
  const cross = new Map();
  for (const ring of shp[r]) {
    const n = ring.length / 2;
    const ll = new Float64Array(ring.length);
    for (let i = 0; i < n; i++) { const [lo, la] = inverse(ring[i * 2], ring[i * 2 + 1]); ll[i * 2] = lo; ll[i * 2 + 1] = la; }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = ll[i * 2], ay = ll[i * 2 + 1], bx = ll[j * 2], by = ll[j * 2 + 1];
      if (ay === by) continue;
      const lo = Math.min(ay, by), hi = Math.max(ay, by);
      // rows whose centre y = LAT0 + (k + 0.5)·STEP lies in [lo, hi)
      const k0 = Math.max(0, Math.ceil((lo - LAT0) / STEP - 0.5)), k1 = Math.min(ROWS - 1, Math.ceil((hi - LAT0) / STEP - 0.5) - 1);
      for (let k = k0; k <= k1; k++) {
        const y = LAT0 + (k + 0.5) * STEP;
        const x = ax + ((y - ay) / (by - ay)) * (bx - ax);
        (cross.get(k) ?? cross.set(k, []).get(k)).push(x);
      }
    }
  }
  for (const [k, xs] of cross) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const c0 = Math.max(0, Math.ceil((xs[i] - LON0) / STEP - 0.5)), c1 = Math.min(COLS - 1, Math.ceil((xs[i + 1] - LON0) / STEP - 0.5) - 1);
      for (let c = c0; c <= c1; c++) { if (!l3[k * COLS + c]) filled++; l3[k * COLS + c] = code; st[k * COLS + c] = sIdx; }
    }
  }
}

// ---- run-length code each row: [value, run (1–255)]… ----
function rle(g) {
  const out = [];
  for (let k = 0; k < ROWS; k++) {
    let c = 0;
    while (c < COLS) {
      const v = g[k * COLS + c];
      let n = 1;
      while (c + n < COLS && n < 255 && g[k * COLS + c + n] === v) n++;
      out.push(v, n);
      c += n;
    }
  }
  return Buffer.from(out).toString('base64');
}
const L3 = rle(l3), ST = rle(st);
const wrap = (s) => s.match(/.{1,120}/g).map((l) => `  '${l}'`).join(' +\n');
const src = `// GENERATED by scripts/bake-ecoregions.mjs — do not edit. The EPA's Level III ecoregions of the
// continental US (public domain; US EPA, "Level III Ecoregions of the Continental United States",
// us_eco_l3_state_boundaries) as two lat/lon byte grids over the lower 48: the ecoregion code (1–85)
// and the state (STATES[byte − 1]) at each cell's centre, 0 over water and outside. Rows run south
// to north from LAT0, columns west to east from LON0, STEP degrees a cell; each row run-length
// coded as [value, run]… bytes, base64. Read by world/ecoregions.ts.
export const ECO_GRID = {
  lat0: ${LAT0}, lon0: ${LON0}, step: ${STEP}, rows: ${ROWS}, cols: ${COLS},
  states: ${JSON.stringify(STATES)},
  l3:
${wrap(L3)},
  state:
${wrap(ST)},
};
`;
writeFileSync(OUT, src);
console.log(`${shp.length} polygons → ${ROWS}×${COLS} cells at ${STEP}°, ${filled} on land; ecoregions ${L3.length} B, states ${ST.length} B (base64) → ${OUT}`);
