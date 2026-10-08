// Land cover where the map is silent: ESA WorldCover (2021 v200, 10 m, CC BY 4.0 — docs/DATA_SOURCES.md),
// carried by a streamed cell (TileJson.lc). The tile service reads it once a cell from WorldCover's public
// cloud-optimized GeoTIFFs (worker/src/landcover.js) and keeps it with the cell's tile; the game lays it
// under the map's own areas (dem.ts coverPatch) — the woods nothing maps (the Olympic Peninsula's coastal
// forest down to Ruby Beach, Longmire's old growth, the Adirondacks), the sand at the sea, the fields, the
// marshes — and washes the ground with it (groundPaint.ts). WorldCover's own codes, the ones the bake and
// every cover reader here already use: 10 tree cover, 20 shrubland, 30 grassland, 40 cropland, 50
// built-up, 60 bare or sparse (the sand at the sea, the desert's open ground, rock), 70 snow and ice, 80
// water, 90 herbaceous wetland, 95 mangroves, 100 moss and lichen; 0 none (past the data).
import type { Box } from './data';

/** A cell's land cover: an 8 m grid over the cell and the 96 m its ground overhangs (dem.ts), in its
 *  region's frame; `d` its classes, a byte a grid cell, row by row (z), base64. */
export interface LandCover { x0: number; z0: number; cell: number; w: number; h: number; d: string }
export const LC_CELL = 8, LC_OVER = 96;

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => {
  const t = atob(s), b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
};

/** The grid over a cell (`box`, in its region's frame): each 8 m cell's class from `sample(lat, lon)` at
 *  its middle. Null when nothing in it is land the map wouldn't know of already — none or only water
 *  (the open sea, past the data). */
export function landCoverGrid(box: Box, unproject: (x: number, z: number) => [number, number], sample: (lat: number, lon: number) => number, cell = LC_CELL, over = LC_OVER): LandCover | null {
  const x0 = box.x0 - over, z0 = box.z0 - over;
  const w = Math.round((box.x1 - box.x0 + 2 * over) / cell), h = Math.round((box.z1 - box.z0 + 2 * over) / cell);
  const d = new Uint8Array(w * h);
  let land = false;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const [lat, lon] = unproject(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
      const v = sample(lat, lon) | 0;
      d[j * w + i] = v;
      if (v && v !== 80) land = true;
    }
  return land ? { x0, z0, cell, w, h, d: toBase64(d) } : null;
}

const BYTES = new WeakMap<LandCover, Uint8Array>();
/** A land cover's classes, decoded once. */
export function landCoverBytes(lc: LandCover): Uint8Array {
  let b = BYTES.get(lc);
  if (!b) BYTES.set(lc, (b = fromBase64(lc.d)));
  return b;
}
/** The class at (x, z), or 0 off the grid. */
export function landCoverAt(lc: LandCover, x: number, z: number): number {
  const i = Math.floor((x - lc.x0) / lc.cell), j = Math.floor((z - lc.z0) / lc.cell);
  if (i < 0 || j < 0 || i >= lc.w || j >= lc.h) return 0;
  return landCoverBytes(lc)[j * lc.w + i];
}
