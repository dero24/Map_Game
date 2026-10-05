// Heights for the houses nothing measured and nothing mapped (docs/NEIGHBOURHOODS.md; hard
// constraint 4: real data is the product, the procedural the floor). A house with a survey fit
// (`ms`), a mapped `height` (`hq`) or mapped `building:levels` (`fl`) keeps its height. The rest —
// the region's priors, a baked pack's ML height estimates (Microsoft's, via Overture: 4–6 m for the
// shore's two-storey houses, a median 1.3 m under the survey), a stand-in's lots — take, in order:
//
//   1. a measured neighbour's height: one of the measured houses of about its size (half to twice
//      its footprint) in its 256 m hood cell, drawn by its own seed — so an unmeasured house on a
//      street of measured two-storey houses is two storeys, in the street's own mix;
//   2. its neighbourhood's storeys where nothing round it is measured (a cell whose record hasn't
//      come yet, a place past the survey): an estate's and an old grid's two and more, a tract's one
//      model (cape or ranch, as recipe.ts draws it), a bungalow grid's storey and a half;
//   3. else its height as it was (the neutral `suburb` path: the region's own mix).
//
// Pure and deterministic (each house's draw is f(its seed, the measured heights round it)), the same
// on every device — the measurements are (lidar.ts, measured.ts). Idempotent: it never reads a
// height it wrote.
import type { Building } from './data';
import { HOOD_CELL, type HoodClass } from './hood';
import type { RegionStyle } from './styles';
import { tractCape } from './recipe';
import { hash01 } from '../core/rng';

/** A house whose height is a guess: nothing measured, nothing mapped. */
export const guessedHouse = (b: Building) => b.k === 'house' && !b.ms && !b.hq && b.fl == null && b.rl == null && b.gen !== 'lidar' && b.own !== 0 && !b.pt && !b.lf && !b.at;
/** A house the survey measured, standing on its own (a neighbour to borrow a height from). */
const measuredHouse = (b: Building) => b.k === 'house' && !!b.ms && b.own !== 0 && !b.pt && !b.lf && !b.at && b.h <= 20;

const areaOf = (r: number[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 2; i + 1 < r.length; j = i, i += 2) a += (r[j] / 10) * (r[i + 1] / 10) - (r[i] / 10) * (r[j + 1] / 10);
  return Math.abs(a) / 2;
};
const centre = (r: number[]): [number, number] => {
  let x = 0, z = 0;
  const n = r.length / 2;
  for (let i = 0; i + 1 < r.length; i += 2) (x += r[i] / 10), (z += r[i + 1] / 10);
  return [x / n, z / n];
};
const cellOf = (x: number, z: number) => `${Math.floor(x / HOOD_CELL)},${Math.floor(z / HOOD_CELL)}`;

/** The neighbourhood's height for a house with nothing measured round it (ridge, m), or null (keep
 *  the prior). `r` ∈ [0,1) the house's own draw; `cellSeed` the recipe's (tract models by cell). */
export function hoodHeight(hood: HoodClass, st: Pick<RegionStyle, 'region' | 'sub' | 'family'>, r: number, cellSeed: number): number | null {
  if (st.region !== 'na') return null; // (the archetypes are North American: recipe.ts)
  switch (hood) {
    case 'estate':
      return 9 + r * 2.5; // two storeys and more under a steep roof
    case 'grid':
      if (st.sub === 'midwest') return 6.4 + r * 1.4; // brick bungalows: a storey, some a half more
      if (st.sub === 'pnw') return 7.2 + r * 1.6; // craftsman: a storey and a half
      return 8.6 + r * 2.4; // painted Victorians: two storeys and the attic
    case 'tract':
      if (st.family === 'adobe' || st.family === 'stucco') return 4.8 + r * 0.8; // single-storey stucco
      return tractCape(cellSeed) ? 7.2 + r * 0.8 : 5 + r * 0.8; // the cell's cape, or its ranch
    default:
      return null;
  }
}

type M = { a: number; h: number };
/** The measured houses of a tile by hood cell (and all of them), to borrow heights from. */
export interface Neighbours { byCell: Map<string, M[]>; all: M[] }
export function neighbours(buildings: Building[]): Neighbours {
  const byCell = new Map<string, M[]>(), all: M[] = [];
  for (const b of buildings) {
    if (!measuredHouse(b) || b.r.length < 6) continue;
    const [x, z] = centre(b.r), m = { a: areaOf(b.r), h: b.h }, k = cellOf(x, z);
    (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(m);
    all.push(m);
  }
  // (the pools in a fixed order: a house's draw never depends on the order the map listed them in)
  const order = (p: M[]) => p.sort((u, v) => u.h - v.h || u.a - v.a);
  for (const p of byCell.values()) order(p);
  order(all);
  return { byCell, all };
}

/** A guessed house's height (m) at (x, z), footprint `a` m² — a measured neighbour's, else its
 *  neighbourhood's (`hood`, `cellSeed`: the recipe's own) — or null: keep it. */
export function priorHeight(b: Building, x: number, z: number, a: number, nb: Neighbours, hood: HoodClass, st: Pick<RegionStyle, 'region' | 'sub' | 'family'>, cellSeed: number): number | null {
  if (!guessedHouse(b)) return null;
  const s = b.s >>> 0;
  const alike = (p: M[]) => p.filter((m) => m.a >= a * 0.5 && m.a <= a * 2);
  const cell = nb.byCell.get(cellOf(x, z)) ?? [];
  let pool = alike(cell);
  if (pool.length < 3) pool = cell.length >= 3 ? cell : alike(nb.all).length >= 6 ? alike(nb.all) : [];
  const h = pool.length ? pool[Math.floor(hash01((s ^ 0x9e1a) >>> 0) * pool.length)].h : hoodHeight(hood, st, hash01((s ^ 0x9e1b) >>> 0), cellSeed);
  return h == null ? null : +Math.max(3.2, h).toFixed(1);
}

/** Every guessed house's height set (centres and hoods as the builder works them out; for tools and
 *  tests — buildings.ts applies `priorHeight` itself, in its own loop). Returns how many it set. */
export function housePriors(buildings: Building[], hoodAt: (x: number, z: number) => HoodClass, st: Pick<RegionStyle, 'region' | 'sub' | 'family'>): number {
  const nb = neighbours(buildings);
  let n = 0;
  for (const b of buildings) {
    if (b.r.length < 6) continue;
    const [x, z] = centre(b.r);
    const h = priorHeight(b, x, z, areaOf(b.r), nb, st.region === 'na' ? hoodAt(x, z) : 'suburb', st, Math.floor(x / 256) * 7919 + Math.floor(z / 256) * 104729);
    if (h != null) (b.h = h), n++;
  }
  return n;
}
