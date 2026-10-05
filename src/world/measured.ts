// Precomputed LiDAR measurements (tile worker IO). The same per-cell records lidar.ts caches
// after a desktop reads the survey, made ahead of time by `scripts/measure-cells.mjs` so every
// tier — phones included, which never decode a survey — builds the same measured buildings:
//
//   baked packs: public/data/<region>/measured/index.json + measured/<cell id>.json — a sidecar
//   beside the pack (the pack's own files never change), indexed so a cell without a record
//   costs no request, each file content-hashed into its URL so a regenerated sidecar is never
//   read stale out of the IndexedDB tile cache.
//
//   streamed cells: the tile service's GET /measured/<cx>_<cz>.json (worker/src/measure.js) — it
//   measures a cell the first time anyone asks and keeps the record in R2 for everyone.
//
// Graceful: no sidecar, offline, no service, outside the survey, a malformed or stale file → null,
// and the tile builds as before (a desktop then measures it itself).
import { cachedFetchJson, kvGet, kvPut } from './cache';
import { surveyed, VER, type MeasuredFile, type Rec } from './lidar';
import { MEASURED_V } from './measuredFile';
import type { Box } from './data';

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

// ---------- the tile service's records (streamed cells) ----------
const svcP = new Map<string, Promise<Rec | null>>();
const SVC_PATIENCE = 180000; // ms of 202s (another request measuring the cell) before giving up for now
/**
 * A streamed cell's record from the tile service (`base`: its URL), or null. One request per cell
 * per session, shared by the cell's builds (its relief rebuild awaits the same one). The first
 * visitor's request has the service measure the cell — it answers when the record is made; while
 * another request is making it, 202, asked again every few seconds. Kept in IndexedDB: a revisit,
 * or the cell offline, costs no request. `peek`: IndexedDB only (a stand-in or a silhouette never
 * asks the service to measure). A failure isn't remembered: the next build asks again.
 */
export async function serviceMeasured(base: string, o: { lat: number; lon: number }, cx: number, cz: number, box: Box, peek: boolean): Promise<Rec | null> {
  if (!surveyed(o, box)) return NONE; // (no survey near it: nothing to ask for)
  const key = `measured|v${MEASURED_V}|${VER}|${o.lat.toFixed(4)},${o.lon.toFixed(4)}|${cx}_${cz}`;
  const kept = await kvGet<Rec>(key);
  if (kept?.m || peek) return kept?.m ? kept : null;
  let p = svcP.get(key);
  if (!p) {
    const url = `${base}/measured/${cx}_${cz}.json?olat=${o.lat}&olon=${o.lon}&v=${MEASURED_V}`;
    p = (async () => {
      const until = Date.now() + SVC_PATIENCE;
      for (;;) {
        let r: Response;
        try {
          r = await fetch(url);
        } catch {
          return null; // offline, refused
        }
        if (r.status === 202 && Date.now() < until) {
          const s = Math.min(30, Math.max(2, Number(r.headers.get('retry-after')) || 8));
          await new Promise((res) => setTimeout(res, s * 1000));
          continue;
        }
        if (!r.ok) return null; // 422 given up on, 5xx, a service without the route
        const j = await r.json().catch(() => null);
        // (a record made by other measure code than this build's — an older service — isn't ours)
        if (!validFile(j) || j.ver !== VER) return null;
        void kvPut(key, j.rec);
        return j.rec;
      }
    })();
    svcP.set(key, p);
    void p.then((rec) => { if (!rec) svcP.delete(key); });
  }
  return p;
}
