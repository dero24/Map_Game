// The precomputed record's file form (pure; shared by scripts/measure-cells.mjs and the tests).
// One canonical text per record — the same cell measured twice writes the same bytes, and the
// content hash in the sidecar index (and so in the URL the tile worker fetches) only moves
// when a measurement does.
import type { MeasuredFile, Rec } from './lidar';

/** The tile service's measured records: its R2 keys (`m/vN/…`) and the client's `&v=N` — bump
 *  together (with a `VER` bump in lidar.ts the records re-make themselves: each carries its `ver`). */
export const MEASURED_V = 1;

/** FNV-1a over the text, base 36: the sidecar index's per-cell content hash. */
export function fnv36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The file's text: fixed field order (building fits in the cell's own footprint order). */
export function measuredText(ver: string, index: string, ck: string, id: string | undefined, rec: Rec): string {
  const r: Rec = { m: rec.m };
  if (rec.none) r.none = 1;
  if (rec.src != null) r.src = rec.src;
  if (rec.yr != null) r.yr = rec.yr;
  if (rec.t) r.t = rec.t;
  if (rec.tc) r.tc = rec.tc;
  if (rec.nb) r.nb = rec.nb;
  const f: MeasuredFile = { v: 1, ver, index, ck, ...(id != null ? { id } : {}), rec: r };
  return JSON.stringify(f);
}
