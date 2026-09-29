// Where a stand-in meets a real cell. A stand-in (synth.ts / the vector twin) owns the buildings
// whose centre falls in its cell by ITS outlines — cut at tile edges and simplified — so a building
// straddling the seam can belong to the stand-in by its outline and to the real cell by the map's.
// Then both draw it: two copies of one building, flickering where their walls meet (z-fighting),
// and the stand-in's solid copy walls in the real building's door. Until the stand-in's own real
// tile lands (minutes, in a dense city on a slow day), its copies of the real cell's buildings go.
import type { Box } from './data';

type P2 = [number, number];
interface R { ring: P2[]; x0: number; z0: number; x1: number; z1: number; area: number }

const prep = (ring: P2[]): R => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, z] = ring[i];
    (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    a += ring[j][0] * z - x * ring[j][1];
  }
  return { ring, x0, z0, x1, z1, area: Math.abs(a) / 2 };
};
const pip = (x: number, z: number, r: P2[]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
/** Share of `a` inside `b`, on ~120 samples over `a`. */
const share = (a: R, b: R) => {
  if (a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1) return 0;
  const st = Math.max(0.25, Math.sqrt(((a.x1 - a.x0) * (a.z1 - a.z0)) / 120));
  let n = 0, k = 0;
  for (let x = a.x0 + st / 2; x < a.x1; x += st)
    for (let z = a.z0 + st / 2; z < a.z1; z += st) {
      if (!pip(x, z, a.ring)) continue;
      n++;
      if (pip(x, z, b.ring)) k++;
    }
  return n ? k / n : 0;
};

/** The stand-in footprints (indices into `stand`) that duplicate a real footprint of the cell `box`
 *  beside them: reaching into it, and covering a real building (≥ 30% of the stand-in's own area
 *  inside it, or half the real one inside the stand-in's). */
export function seamDuplicates(stand: { ring: P2[] }[], real: { ring: P2[] }[], box: Box, pad = 4): number[] {
  const R = real.map((f) => prep(f.ring)).filter((r) => r.x1 > box.x0 - pad && r.x0 < box.x1 + pad && r.z1 > box.z0 - pad && r.z0 < box.z1 + pad);
  if (!R.length) return [];
  const C = 32, grid = new Map<string, R[]>();
  for (const r of R)
    for (let u = Math.floor(r.x0 / C); u <= Math.floor(r.x1 / C); u++)
      for (let v = Math.floor(r.z0 / C); v <= Math.floor(r.z1 / C); v++) (grid.get(u + ',' + v) ?? grid.set(u + ',' + v, []).get(u + ',' + v)!).push(r);
  const out: number[] = [];
  stand.forEach((f, i) => {
    const s = prep(f.ring);
    if (s.x1 <= box.x0 - pad || s.x0 >= box.x1 + pad || s.z1 <= box.z0 - pad || s.z0 >= box.z1 + pad) return; // (doesn't reach the cell)
    const seen = new Set<R>();
    for (let u = Math.floor(s.x0 / C); u <= Math.floor(s.x1 / C); u++)
      for (let v = Math.floor(s.z0 / C); v <= Math.floor(s.z1 / C); v++)
        for (const r of grid.get(u + ',' + v) ?? []) {
          if (seen.has(r)) continue;
          seen.add(r);
          if (share(s, r) >= 0.3 || share(r, s) >= 0.5) { out.push(i); return; }
        }
  });
  return out;
}
