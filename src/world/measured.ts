// Precomputed LiDAR measurements (tile worker IO). The same per-cell records lidar.ts caches
// after a desktop reads the survey, made ahead of time by `scripts/measure-cells.mjs` so every
// tier — phones included, which never decode a survey — builds the same measured buildings:
//
//   baked packs: public/data/<region>/measured/index.json + measured/<cell id>.json — a sidecar
//   beside the pack (the pack's own files never change), indexed so a cell without a record
//   costs no request, each file content-hashed into its URL so a regenerated sidecar is never
//   read stale out of the IndexedDB tile cache.
//
// Graceful: no sidecar, offline, a malformed file → null, and the tile builds as before.
import { cachedFetchJson, kvGet, kvPut } from './cache';
import type { MeasuredFile, Rec } from './lidar';

/** measured/index.json: what the sidecar covers. `cells[id]`: the record file's content hash,
 *  or 0 — the script settled that no survey covers this cell (or there's nothing on it). */
export interface MeasuredIndex { v: 1; ver: string; index: string; bakeId?: string; cells: Record<string, string | 0> }

const NONE: Rec = { none: 1, m: {} };
const idxP = new Map<string, Promise<MeasuredIndex | null>>();

export const validIndex = (j: unknown): j is MeasuredIndex =>
  !!j && typeof j === 'object' && (j as MeasuredIndex).v === 1 && typeof (j as MeasuredIndex).cells === 'object';
export const validFile = (j: unknown): j is MeasuredFile =>
  !!j && typeof j === 'object' && (j as MeasuredFile).v === 1 && !!(j as MeasuredFile).rec && typeof (j as MeasuredFile).rec.m === 'object';

function indexFor(base: string): Promise<MeasuredIndex | null> {
  let p = idxP.get(base);
  if (!p) {
    const key = `measured-index|${base}`;
    p = (async () => {
      try {
        const r = await fetch(base + 'measured/index.json', { cache: 'no-cache' });
        // (a dev server answers a missing file with its index.html — only a real index counts)
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (validIndex(j)) {
          void kvPut(key, j); // for the next visit offline
          return j;
        }
        if (r.ok || r.status === 404) return null; // no sidecar for this pack
      } catch {
        /* offline: the copy from the last visit */
      }
      const kept = await kvGet<MeasuredIndex>(key);
      return validIndex(kept) ? kept : null;
    })();
    idxP.set(base, p);
  }
  return p;
}

/** A baked cell's precomputed record (`base`: the pack's URL, ending in '/'), or null. */
export async function bakedMeasured(base: string, id: string): Promise<Rec | null> {
  const ix = await indexFor(base);
  const h = ix?.cells[id];
  if (h == null) return null;
  if (h === 0) return NONE;
  try {
    const j = await cachedFetchJson(`${base}measured/${id}.json?h=${h}`);
    return validFile(j) ? j.rec : null;
  } catch {
    return null;
  }
}
