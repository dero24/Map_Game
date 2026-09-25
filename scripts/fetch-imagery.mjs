// One-time roof-colour observation from public-domain aerial imagery (USDA NAIP via the USGS National Map
// ImageServer, 0.6 m, contiguous US). For every Overture footprint we sample the orthophoto inside the
// (eroded) outline, drop tree canopy / deep shadow / no-data pixels and keep a trimmed mean — the real
// colour of that roof. Only the per-building result is archived (raw/<region>/roofs.json), not the tiles.
// Regions outside NAIP coverage (or `imagery: false` in config) simply get no file; the bake falls back.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { RAW, SLICE, BACKDROP, CFG, UA } from './config.mjs';
import { parseWkt, pointInRing } from './lib/geo.mjs';

const SERVICE = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
const out = resolve(RAW, 'roofs.json');
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('roofs.json exists — use --force to refetch');
  process.exit(0);
}
if (CFG.imagery === false) {
  console.log('imagery disabled for this region');
  process.exit(0);
}
const src = resolve(RAW, 'overture-buildings.json');
if (!existsSync(src)) {
  console.error('run fetch-overture first');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(src, 'utf8')).rows;
const lat0 = (SLICE.s + SLICE.n) / 2;
const MX = (Math.PI / 180) * 6378137 * Math.cos((lat0 * Math.PI) / 180); // m per degree lon
const MZ = (Math.PI / 180) * 6378137; // m per degree lat

// Footprints in lon/lat with bbox.
const blds = [];
for (const r of rows) {
  for (const poly of parseWkt(r.wkt)) {
    const ring = poly[0];
    if (!ring || ring.length < 4) continue;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [lon, lat] of ring) (w = Math.min(w, lon)), (e = Math.max(e, lon)), (s = Math.min(s, lat)), (n = Math.max(n, lat));
    if (e < BACKDROP.w || w > BACKDROP.e || n < BACKDROP.s || s > BACKDROP.n) continue;
    const inSlice = e > SLICE.w - 0.001 && w < SLICE.e + 0.001 && n > SLICE.s - 0.001 && s < SLICE.n + 0.001;
    blds.push({ id: r.id, ring, w, s, e, n, inSlice, fine: [], coarse: [] });
  }
}
console.log(`${blds.length} footprints to sample`);

function tiles(b, res) {
  const out = [];
  const Wm = (b.e - b.w) * MX, Hm = (b.n - b.s) * MZ;
  const T = 2000 * res; // metres per tile
  const nx = Math.ceil(Wm / T), ny = Math.ceil(Hm / T);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const w = b.w + ((b.e - b.w) * i) / nx, e = b.w + ((b.e - b.w) * (i + 1)) / nx;
      const n = b.n - ((b.n - b.s) * j) / ny, s = b.n - ((b.n - b.s) * (j + 1)) / ny;
      out.push({ w, s, e, n, W: Math.round(((e - w) * MX) / res), H: Math.round(((n - s) * MZ) / res) });
    }
  return out;
}

async function fetchTile(t) {
  const url = `${SERVICE}?bbox=${t.w},${t.s},${t.e},${t.n}&bboxSR=4326&imageSR=4326&size=${t.W},${t.H}&format=png&f=image`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return PNG.sync.read(buf);
    } catch (e) {
      console.warn(`  tile retry ${attempt + 1}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return null;
}

// Distance (m) from a lon/lat point to the ring boundary.
function edgeDist(lon, lat, ring) {
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const ax = (ring[i][0] - lon) * MX, az = (ring[i][1] - lat) * MZ, bx = (ring[i + 1][0] - lon) * MX, bz = (ring[i + 1][1] - lat) * MZ;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t, az + dz * t));
  }
  return best;
}

async function sampleLayer(box, res, key, erode, filter) {
  const list = tiles(box, res);
  console.log(`${key}: ${list.length} tiles at ${res} m/px`);
  let got = 0;
  for (const [k, t] of list.entries()) {
    const png = await fetchTile(t);
    if (!png) continue;
    let data = 0;
    for (let i = 3; i < png.data.length; i += 4 * 97) if (png.data[i] > 0 && png.data[i - 1] + png.data[i - 2] + png.data[i - 3] > 0) data++;
    if (data < 10) { console.log(`  tile ${k + 1}/${list.length}: no imagery here`); continue; }
    got++;
    const px = (lon) => ((lon - t.w) / (t.e - t.w)) * png.width - 0.5;
    const py = (lat) => ((t.n - lat) / (t.n - t.s)) * png.height - 0.5;
    let n = 0;
    for (const b of blds) {
      if (!filter(b) || b.e < t.w || b.w > t.e || b.n < t.s || b.s > t.n) continue;
      const i0 = Math.max(0, Math.floor(px(b.w))), i1 = Math.min(png.width - 1, Math.ceil(px(b.e)));
      const j0 = Math.max(0, Math.floor(py(b.n))), j1 = Math.min(png.height - 1, Math.ceil(py(b.s)));
      const acc = b[key];
      const stride = Math.max(1, Math.floor(Math.sqrt(((i1 - i0 + 1) * (j1 - j0 + 1)) / 500)));
      for (let j = j0; j <= j1; j += stride)
        for (let i = i0; i <= i1; i += stride) {
          const lon = t.w + ((i + 0.5) / png.width) * (t.e - t.w), lat = t.n - ((j + 0.5) / png.height) * (t.n - t.s);
          if (!pointInRing(lon, lat, b.ring)) continue;
          if (erode > 0 && edgeDist(lon, lat, b.ring) < erode) continue;
          const o = (j * png.width + i) * 4;
          if (png.data[o + 3] < 200) continue;
          acc.push(png.data[o], png.data[o + 1], png.data[o + 2]);
        }
      n++;
    }
    console.log(`  tile ${k + 1}/${list.length}: ${png.width}x${png.height}, ${n} footprints`);
  }
  return got;
}

const t0 = Date.now();
const fineBox = { w: SLICE.w - 0.001, s: SLICE.s - 0.001, e: SLICE.e + 0.001, n: SLICE.n + 0.001 };
const gotFine = await sampleLayer(fineBox, 0.6, 'fine', 0.6, (b) => b.inSlice);
const gotCoarse = await sampleLayer(BACKDROP, 2.4, 'coarse', 0, (b) => !b.inSlice);
if (!gotFine && !gotCoarse) {
  console.log('no imagery coverage — skipping roofs.json');
  process.exit(0);
}

// Robust roof colour: drop canopy, deep shadow and blown highlights, then a luminance-trimmed mean.
const colors = {};
let ok = 0;
for (const b of blds) {
  const a = b.fine.length >= 18 ? b.fine : b.coarse;
  if (a.length < 6) continue;
  const px = [];
  for (let i = 0; i < a.length; i += 3) {
    const r = a[i], g = a[i + 1], bl = a[i + 2];
    const lum = 0.3 * r + 0.59 * g + 0.11 * bl;
    // excess-green index: NAIP greys lean slightly green, real canopy leans a lot
    const canopy = 2 * g - r - bl > 22 && g > r + 8 && lum < 175;
    if (canopy || lum < 24 || lum > 250) continue;
    px.push([lum, r, g, bl]);
  }
  if (px.length < Math.max(3, (a.length / 3) * 0.35)) continue;
  px.sort((p, q) => p[0] - q[0]);
  const lo = Math.floor(px.length * 0.3), hi = Math.max(lo + 1, Math.ceil(px.length * 0.8));
  let r = 0, g = 0, bl = 0;
  for (let i = lo; i < hi; i++) (r += px[i][1]), (g += px[i][2]), (bl += px[i][3]);
  const k = hi - lo;
  const hex = ((Math.round(r / k) << 16) | (Math.round(g / k) << 8) | Math.round(bl / k)).toString(16).padStart(6, '0');
  if (!colors[b.id]) ok++;
  colors[b.id] = hex;
}
writeFileSync(out, JSON.stringify({ source: 'USDA NAIP via USGS National Map (public domain)', fetched: new Date().toISOString().slice(0, 10), colors }));
console.log(`roof colours for ${ok} of ${rows.length} buildings in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
