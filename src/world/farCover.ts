// The far ring's land cover: the tile service's /cover blocks — 8 × 8 cells (8192 m) of the region's frame
// at 32 m, off WorldCover's 20 m overview (worker/src/landcover.js farCover). The far ring builds from
// synthetic cells (no tile-service request for a cell 2–8 km off), so its ground was a lawn to the
// horizon: the Olympic Peninsula's forested hills read as bare grass. Each far synthetic cell takes its
// woods from its block (one request a block, shared by its 64 cells, kept in the tile cache) and raises
// them into the ground's canopy (synth.ts synthTile, the bake's backdrop's "distant woods").
import { cachedFetchJson } from './cache';
import { landCoverAt, type LandCover } from './landcover';

export const FAR_BLOCK = 8192;
const blocks = new Map<string, Promise<LandCover | null>>();

/** The block holding a cell's box (its middle), or null when there's none to have (the open sea, no
 *  service, a failed read — a failure is forgotten, so a later cell asks again). */
export function farCoverFor(base: string, origin: { lat: number; lon: number }, box: { x0: number; z0: number; x1: number; z1: number }): Promise<LandCover | null> {
  const bx = Math.floor((box.x0 + box.x1) / 2 / FAR_BLOCK), bz = Math.floor((box.z0 + box.z1) / 2 / FAR_BLOCK);
  const key = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${bx}_${bz}`;
  let p = blocks.get(key);
  if (!p) {
    p = (cachedFetchJson(`${base}/cover/${bx}_${bz}.json?olat=${origin.lat}&olon=${origin.lon}&v=1`) as Promise<{ lc?: LandCover | null }>).then((j) => j?.lc ?? null);
    blocks.set(key, p);
    p.catch(() => blocks.delete(key));
    if (blocks.size > 64) blocks.delete(blocks.keys().next().value!);
  }
  return p.catch(() => null);
}

/** A far cell's canopy off its block: the share of WorldCover's tree cover (10) round (x, z), its 24 m
 *  neighbours with it — 0 to 1, the ground's canopy bump (0 past the block). */
export const farCanopy = (lc: LandCover) => (x: number, z: number) => {
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) n += landCoverAt(lc, x + dx * 24, z + dz * 24) === 10 ? 1 : 0;
  return n / 9;
};
