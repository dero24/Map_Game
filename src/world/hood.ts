// Neighbourhood character (docs/NEIGHBOURHOODS.md): what kind of place a house stands in, measured
// from the houses round it — not from a list of towns (hard constraint 5). On a grid of 256 m
// cells (region frame), each cell's houses give a morphology: their typical footprint, how far
// apart they stand, how alike they are. That separates the three suburbs the eye knows at once:
//
//   estate — big houses far apart (Rumson's shingle and colonial estates on acre lots)
//   grid   — small houses close together on an old street grid (Red Bank's Victorians)
//   tract  — alike houses at an even spacing (Levittown's capes and ranches)
//   suburb — the rest: the region's own mix, exactly as before (the neutral path)
//
// The recipe, the lot dressing and the trees read the class (recipe.ts, buildings.ts, props.ts).
// Only measured footprints count: the hybrid fills (fixed-size guesses) would make everywhere a
// tract. Pure and deterministic: a cell's class is a function of the buildings in it.
import type { Building } from './data';

export type HoodClass = 'estate' | 'grid' | 'tract' | 'suburb';
export const HOOD_CELL = 256;
export interface HoodCell { n: number; area: number; p90: number; spacing: number; cv: number; klass: HoodClass }

const ringArea = (r: number[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 2; i + 1 < r.length; j = i, i += 2) a += (r[j] / 10) * (r[i + 1] / 10) - (r[i] / 10) * (r[j + 1] / 10);
  return Math.abs(a) / 2;
};
const centroid = (r: number[]): [number, number] => {
  let x = 0, z = 0;
  const n = r.length / 2;
  for (let i = 0; i + 1 < r.length; i += 2) (x += r[i] / 10), (z += r[i + 1] / 10);
  return [x / n, z / n];
};
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
export const hoodKey = (x: number, z: number) => `${Math.floor(x / HOOD_CELL)},${Math.floor(z / HOOD_CELL)}`;

/** A home, for the measure: a house (or a big footprint the map calls large but no taller than a
 *  house), mapped or found in the survey — not a guess, a shed or a piece of something else. */
function homeLike(b: Building) {
  if (b.gen === 'fill' || b.own === 0 || b.pt || b.in || b.lod || b.at) return false; // (a tile's own: a cell's class never depends on the tile that built it)
  if (b.k === 'house') return true;
  return b.k === 'large' && b.h <= 13 && (b.fl ?? 2) <= 3;
}

/** The class of a cell's morphology (the thresholds in m² and m of footprint and centroid spacing). */
export function classify(c: { n: number; area: number; spacing: number; cv: number }): HoodClass {
  if (c.n < 4) return 'suburb';
  if (c.area >= 230 && c.spacing >= 36) return 'estate';
  if (c.n >= 10 && c.cv <= 0.3 && c.area >= 70 && c.area <= 230 && c.spacing >= 17 && c.spacing <= 34) return 'tract';
  if (c.spacing <= 19 && c.area <= 200) return 'grid';
  return 'suburb';
}

/** Measure every cell the buildings stand in. */
export function measureHoods(buildings: Building[]): Map<string, HoodCell> {
  const byCell = new Map<string, { a: number[]; c: [number, number][] }>();
  for (const b of buildings) {
    if (!homeLike(b) || b.r.length < 6) continue;
    const a = ringArea(b.r);
    if (a < 40) continue;
    const c = centroid(b.r), k = hoodKey(c[0], c[1]);
    let e = byCell.get(k);
    if (!e) byCell.set(k, (e = { a: [], c: [] }));
    e.a.push(a);
    e.c.push(c);
  }
  const out = new Map<string, HoodCell>();
  for (const [k, e] of byCell) {
    const n = e.a.length;
    const nn: number[] = [];
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let j = 0; j < n; j++) if (j !== i) best = Math.min(best, Math.hypot(e.c[i][0] - e.c[j][0], e.c[i][1] - e.c[j][1]));
      if (best < Infinity) nn.push(best);
    }
    const mean = e.a.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(e.a.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const cell = { n, area: median(e.a), p90: pct(e.a, 0.9), spacing: median(nn), cv: mean ? sd / mean : 0 };
    out.set(k, { ...cell, klass: classify(cell) });
  }
  return out;
}

/** A lookup over measured cells: the class at (x, z) ('suburb' where nothing was measured). */
export function hoodLookup(cells: Map<string, HoodCell>) {
  return (x: number, z: number): HoodClass => cells.get(hoodKey(x, z))?.klass ?? 'suburb';
}
