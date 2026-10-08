// Our own OpenStreetMap extract, as the tile service reads it (docs/DATA_SOURCES.md §0, Robby
// 2026-10-03: "our own extract in R2", Overpass only a polite fallback). scripts/osm-extract.mjs cuts
// Geofabrik's US file (ODbL) on a fixed global grid — 1/128° tiles packed into one R2 object per 1°
// block, read by range — and the service assembles any cell's answer from the tiles under its box,
// shaped exactly as Overpass answers the cell query (osmQuery.ts): the elements a point or a segment
// of which lies in the box, with their full geometry. Pure: the extract, the service and the tests
// share it (tests/osmTiles.test.ts, tests/osmExtract.test.ts).
//
// A tile is lines of text, one an element:  <k>\t<id>\t<s>\t<w>\t<n>\t<e>\t<payload>
//   k: n / w / r — the payload is the element as Overpass prints it (`out geom`);
//      R — a big relation stored once in its home block's own section; the payload is that block's key.
// The bounds come first so a reader skips what can't be in its box without parsing it.
import type { OsmDoc, OsmElement } from './realTile';

export const TILE_PER_DEG = 128; // tiles a degree, each way (~0.87 × 0.67 km at 40°N)
export const BLOCK_TILES = 128; // a block is 1° × 1°: one R2 object (and its directory)
export const BIG = 50_000; // a relation's printed size past which it's stored once, in its home block

export interface BBox { s: number; w: number; n: number; e: number }
export const tileX = (lon: number) => Math.floor((lon + 180) * TILE_PER_DEG);
export const tileY = (lat: number) => Math.floor((lat + 90) * TILE_PER_DEG);
export const tileKey = (tx: number, ty: number) => `${tx}_${ty}`;
export const blockKey = (tx: number, ty: number) => `${Math.floor(tx / BLOCK_TILES)}_${Math.floor(ty / BLOCK_TILES)}`;
/** A tile's own box (the extract's envelope for it). */
export const tileBox = (tx: number, ty: number): BBox => ({ s: ty / TILE_PER_DEG - 90, w: tx / TILE_PER_DEG - 180, n: (ty + 1) / TILE_PER_DEG - 90, e: (tx + 1) / TILE_PER_DEG - 180 });
/** Every tile a box touches, edges included (a hair wider, so a point on a tile edge is never missed). */
export function tilesFor(bb: BBox): [number, number][] {
  const out: [number, number][] = [];
  const eps = 1e-9;
  for (let tx = tileX(bb.w - eps); tx <= tileX(bb.e + eps); tx++) for (let ty = tileY(bb.s - eps); ty <= tileY(bb.n + eps); ty++) out.push([tx, ty]);
  return out;
}

const inBox = (bb: BBox, lat: number, lon: number) => lat >= bb.s && lat <= bb.n && lon >= bb.w && lon <= bb.e;
/** Whether the segment (lat0, lon0)–(lat1, lon1) meets the box (Liang–Barsky, in degrees). */
export function segmentMeets(bb: BBox, lat0: number, lon0: number, lat1: number, lon1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = lon1 - lon0, dy = lat1 - lat0;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, lon0 - bb.w) && clip(dx, bb.e - lon0) && clip(-dy, lat0 - bb.s) && clip(dy, bb.n - lat0) && t0 <= t1;
}
type Pt = { lat: number; lon: number } | null;
const wayMeets = (bb: BBox, g: Pt[] | undefined) => {
  if (!g?.length) return false;
  for (const p of g) if (p && inBox(bb, p.lat, p.lon)) return true;
  for (let i = 1; i < g.length; i++) { const a = g[i - 1], b = g[i]; if (a && b && segmentMeets(bb, a.lat, a.lon, b.lat, b.lon)) return true; }
  return false;
};
/** Overpass's rule for a box: a node inside it; a way with a node inside or a segment crossing it
 *  ("at least one point (also points on the segment) is properly inside"); a relation one of whose
 *  members is — a member node inside, a member way by the way rule. */
export function selects(e: OsmElement, bb: BBox): boolean {
  if (e.type === 'node') return e.lat != null && e.lon != null && inBox(bb, e.lat, e.lon);
  if (e.type === 'way') return wayMeets(bb, e.geometry);
  for (const m of e.members ?? []) {
    const mm = m as { type: string; lat?: number; lon?: number; geometry?: Pt[] };
    if (mm.type === 'node' && mm.lat != null && mm.lon != null && inBox(bb, mm.lat, mm.lon)) return true;
    if (mm.type === 'way' && wayMeets(bb, mm.geometry)) return true;
  }
  return false;
}

/** A tile line, split (the payload left as text). */
export function splitLine(line: string): { k: string; id: number; s: number; w: number; n: number; e: number; payload: string } | null {
  let p = 0;
  const f: string[] = [];
  for (let i = 0; i < 6; i++) { const q = line.indexOf('\t', p); if (q < 0) return null; f.push(line.slice(p, q)); p = q + 1; }
  return { k: f[0], id: +f[1], s: +f[2], w: +f[3], n: +f[4], e: +f[5], payload: line.slice(p) };
}
export const lineOf = (k: string, id: number, b: BBox, payload: string) => `${k}\t${id}\t${b.s}\t${b.w}\t${b.n}\t${b.e}\t${payload}`;

/** Where the assembler reads from: a tile's text (null: no such tile — empty ground) and a big
 *  relation's printed element, by its home block. */
export interface TileSource {
  tile(block: string, tile: string): Promise<string | null>;
  big(block: string, id: number): Promise<string | null>;
}
/** Two packs read as one: the extract and its add-on — what a query statement gained since the
 *  extract was cut, cut from the same snapshot (scripts/osm-extract-addon.mjs). A tile's lines from both
 *  (the assembler keeps each element once), a big relation from whichever holds it. */
export function mergeSources(a: TileSource, b: TileSource): TileSource {
  return {
    async tile(block, tile) {
      const [x, y] = await Promise.all([a.tile(block, tile), b.tile(block, tile)]);
      return x && y ? (x.endsWith('\n') ? x : x + '\n') + y : x ?? y;
    },
    async big(block, id) { return (await a.big(block, id)) ?? b.big(block, id); },
  };
}
/** A box's answer, as Overpass gives the cell query: every selected element once, by id. */
export async function assemble(src: TileSource, bb: BBox, timestamp?: string): Promise<OsmDoc & { stats: { tiles: number; lines: number; parsed: number } }> {
  const ts = tilesFor(bb);
  // (one tile's text at a time, the next already on its way: a dense city's nine tiles are ~12 M
  // characters — two bytes each once a name isn't Latin-1 — and the service's isolate has 128 MB,
  // shared by whatever cells it is building at once)
  const get = (i: number) => (i < ts.length ? src.tile(blockKey(ts[i][0], ts[i][1]), tileKey(ts[i][0], ts[i][1])) : Promise.resolve(null));
  const seen = new Set<string>();
  const out: OsmElement[] = [];
  const bigs: { id: number; block: string }[] = [];
  let lines = 0, parsed = 0;
  let next = get(0);
  for (let t = 0; t < ts.length; t++) {
    const text = await next;
    next = get(t + 1);
    if (!text) continue;
    for (let p = 0; p < text.length; ) {
      let q = text.indexOf('\n', p);
      if (q < 0) q = text.length;
      const line = text.slice(p, q);
      p = q + 1;
      if (!line) continue;
      lines++;
      const L = splitLine(line);
      if (!L || L.n < bb.s || L.s > bb.n || L.e < bb.w || L.w > bb.e) continue; // its bounds miss the box
      const key = `${L.k === 'R' ? 'r' : L.k}${L.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (L.k === 'R') { bigs.push({ id: L.id, block: L.payload }); continue; }
      parsed++;
      const e = JSON.parse(L.payload) as OsmElement;
      if (selects(e, bb)) out.push(e);
    }
  }
  // (each its own read, a few at once: the add-on stores every relation past 2 KB once — a forest cell's
  // woods and marshes are a handful of reads, not one after another)
  for (let i = 0; i < bigs.length; i += 6) {
    const texts = await Promise.all(bigs.slice(i, i + 6).map((b) => src.big(b.block, b.id)));
    for (const text of texts) {
      if (!text) continue;
      parsed++;
      const e = JSON.parse(text) as OsmElement;
      if (selects(e, bb)) out.push(e);
    }
  }
  out.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type < b.type ? -1 : 1));
  return { elements: out, ...(timestamp ? { osm3s: { timestamp_osm_base: timestamp } } : {}), stats: { tiles: ts.length, lines, parsed } };
}

/** An element as osmToTile reads it — type, id, tags, a node's place, a way's geometry, a relation's
 *  members (type, ref, role, geometry or place) — for comparing two answers field by field. */
export function canonical(e: OsmElement): string {
  const g = (pts?: Pt[]) => (pts ?? []).map((p) => (p ? `${p.lat},${p.lon}` : '-')).join(' ');
  const tags = Object.entries(e.tags ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('|');
  if (e.type === 'node') return `n${e.id} ${e.lat},${e.lon} ${tags}`;
  if (e.type === 'way') return `w${e.id} [${g(e.geometry)}] ${tags}`;
  const mem = (e.members ?? []).map((m) => {
    const mm = m as { type: string; ref: number; role: string; lat?: number; lon?: number; geometry?: Pt[] };
    return `${mm.type}${mm.ref}:${mm.role}:${mm.type === 'node' ? `${mm.lat},${mm.lon}` : mm.type === 'way' ? g(mm.geometry) : ''}`;
  }).join(' ; ');
  return `r${e.id} {${mem}} ${tags}`;
}
