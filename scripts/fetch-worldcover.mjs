// One-time windowed read of ESA WorldCover 2021 v200 (10 m, CC BY 4.0) from its public COG on AWS.
// Only the backdrop window is fetched via HTTP range requests (no full 3x3 degree tile download).
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fromUrl } from 'geotiff';
import { RAW, BACKDROP } from './config.mjs';

const out = resolve(RAW, 'worldcover.json');
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('worldcover.json exists — use --force to refetch');
  process.exit(0);
}
mkdirSync(RAW, { recursive: true });

// Tiles are named by their SW corner on a 3-degree grid: N39W075 covers lat 39..42, lon -75..-72.
// Computed from the backdrop's SW corner; the bake window must stay inside one tile (fine for town-scale slices).
const tlat = Math.floor(BACKDROP.s / 3) * 3;
const tlon = Math.floor(BACKDROP.w / 3) * 3;
const tile = `${tlat >= 0 ? 'N' : 'S'}${String(Math.abs(tlat)).padStart(2, '0')}${tlon >= 0 ? 'E' : 'W'}${String(Math.abs(tlon)).padStart(3, '0')}`;
if (BACKDROP.n > tlat + 3 || BACKDROP.e > tlon + 3) console.warn(`backdrop crosses out of WorldCover tile ${tile} — cover will clamp at the tile edge`);
const url = `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${tile}_Map.tif`;
try {
  const tiff = await fromUrl(url);
  const img = await tiff.getImage();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution();
  const px = (lon) => Math.floor((lon - ox) / rx);
  const py = (lat) => Math.floor((lat - oy) / ry);
  const window = [px(BACKDROP.w), py(BACKDROP.n), px(BACKDROP.e) + 1, py(BACKDROP.s) + 1];
  const [data] = await img.readRasters({ window });
  const w = window[2] - window[0], h = window[3] - window[1];
  const bbox = { w: ox + window[0] * rx, n: oy + window[1] * ry, e: ox + window[2] * rx, s: oy + window[3] * ry };
  const hist = {};
  for (const v of data) hist[v] = (hist[v] ?? 0) + 1;
  writeFileSync(out, JSON.stringify({ w, h, bbox, data: Buffer.from(data).toString('base64') }));
  console.log(`worldcover ${w}x${h}`, bbox, hist);
} catch (e) {
  console.warn('WorldCover fetch failed (vegetation will fall back to OSM landuse):', e.message);
  process.exit(0);
}
