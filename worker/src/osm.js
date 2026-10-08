// Our own OpenStreetMap extract (src/world/osmTiles.ts; built by scripts/osm-extract.mjs, uploaded by
// scripts/osm-upload.mjs): a cell's answer to the cell query, shaped exactly as Overpass gives it,
// from R2 — no request leaves Cloudflare. Overpass is now only the polite fallback for a cell the
// extract doesn't cover (index.js).
//
// R2 `osm/v1/`:
//   index.json            { v, ts, tile, block, cover: [[[lon, lat], …], …], blocks: { "<bx>_<by>": "<hash>" } }
//   b/<bx>_<by>.<hash>.json        the block's directory: { tiles: { "<tx>_<ty>": [offset, length, part] }, big: { "<id>": [offset, length, part] } }
//   b/<bx>_<by>.<hash>.<part>.bin  its tiles' gzipped lines back to back, then its big relations (a
//                                  block past 200 MB goes on in another part)
// A block's keys carry its content hash, so a refresh uploads new keys and switches the index last: a
// directory held from before the switch still reads the bytes it describes.
//
// R2 `osm/v1/addon/` (optional): the same layout — an add-on cut from the same snapshot, holding what a
// query statement gained since the extract was cut (scripts/osm-extract-addon.mjs: the natural areas
// mapped as relations, 2026-10-08). Read beside the extract only when its snapshot is the extract's;
// without its index the service is as it was. The next full cut carries them itself.
import { assemble, mergeSources, segmentMeets, selects, splitLine } from '../../src/world/osmTiles';

const PFX = 'osm/v1', ADD = 'osm/v1/addon';
const cache = new Map(); // prefix → { index, at }
const dirs = new Map(); // "<prefix>|<block>.<hash>" → directory (the last few blocks read)

async function getIndex(bucket, pfx = PFX) {
  let c = cache.get(pfx);
  if (!c || Date.now() - c.at > 600e3) {
    const o = await bucket.get(`${pfx}/index.json`).catch(() => null);
    c = { index: o ? await o.json().catch(() => null) : null, at: Date.now() };
    cache.set(pfx, c);
  }
  return c.index;
}
// (the source extract's outline: a box answered from the extract must lie wholly inside it)
function inRing(r, x, y) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
}
function crosses(r, bb) {
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x0, y0] = r[j], [x1, y1] = r[i];
    if (segmentMeets(bb, y0, x0, y1, x1)) return true; // the outline runs through the box: not wholly inside
  }
  return false;
}
export function covers(idx, bb) {
  if (!idx?.cover?.length) return false;
  const corners = [[bb.w, bb.s], [bb.e, bb.s], [bb.e, bb.n], [bb.w, bb.n]];
  return idx.cover.some((r) => corners.every(([x, y]) => inRing(r, x, y)) && !crosses(r, bb));
}

// (one read of a block's directory per request, however many of its tiles the box asks for at once:
// `pending` is the request's own — never another request's promise, which the runtime would cancel
// this one for waiting on)
async function directory(bucket, pfx, block, hash, pending) {
  const k = `${pfx}|${block}.${hash}`;
  const d = dirs.get(k);
  if (d) return d;
  let p = pending.get(k);
  if (!p) {
    p = (async () => {
      const o = await bucket.get(`${pfx}/b/${block}.${hash}.json`);
      if (!o) throw new Error(`extract directory ${pfx}/${block}.${hash} missing`);
      const d = await o.json();
      dirs.set(k, d);
      if (dirs.size > 8) dirs.delete(dirs.keys().next().value);
      return d;
    })();
    pending.set(k, p);
  }
  return p;
}
async function gunzipRange(bucket, key, at) {
  const o = await bucket.get(key, { range: { offset: at[0], length: at[1] } });
  if (!o) throw new Error(`extract ${key} unreadable`);
  return new Response(o.body.pipeThrough(new DecompressionStream('gzip'))).text();
}

/** The cell query's answer for a box from the extract, or null when the extract doesn't cover it. */
export async function extractDoc(env, bb) {
  const bucket = env.TILES ?? null;
  if (!bucket) return null;
  const idx = await getIndex(bucket);
  if (!idx || !covers(idx, bb)) return null;
  const pending = new Map();
  const main = packSource(bucket, PFX, idx, pending);
  // (the add-on, when it's from the extract's own snapshot)
  const add = await getIndex(bucket, ADD);
  const src = add && add.ts === idx.ts && add.blocks ? mergeSources(main, packSource(bucket, ADD, add, pending)) : main;
  return assemble(src, bb, idx.ts);
}
/** One pack's tiles and big relations, read by range under its prefix. */
function packSource(bucket, pfx, idx, pending) {
  return {
    async tile(block, tile) {
      const hash = idx.blocks[block];
      if (!hash) return null; // a block with nothing in it (open water inside the outline)
      const d = await directory(bucket, pfx, block, hash, pending);
      const at = d.tiles[tile];
      return at ? gunzipRange(bucket, `${pfx}/b/${block}.${hash}.${at[2] ?? 0}.bin`, at) : null;
    },
    async big(block, id) {
      const hash = idx.blocks[block];
      if (!hash) return null;
      const d = await directory(bucket, pfx, block, hash, pending);
      const at = d.big?.[id];
      return at ? gunzipRange(bucket, `${pfx}/b/${block}.${hash}.${at[2] ?? 0}.bin`, at) : null;
    },
  };
}

// ---- the skylines' towers (src/world/skyline.ts, farSkyline.ts): the extract's tall layer ----
// GET /skyline?s=&w=&n=&e=&h=45&floors=14&mast=0 → every building ≥ h m or `floors` storeys, building
// part and building relation ≥ h m, and (mast > 0) tower and mast ≥ `mast` m whose point or segment is
// in the box — what the skylines' Overpass queries asked for, from each block's tall section (one
// read a block), shaped as Overpass answers. Only what the extract covers: no Overpass for these.
const num = (v) => (typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v) ? Number(v) : NaN); // Overpass number(): a whole number or NaN
export function tallRule(q) {
  return (e) => {
    const t = e.tags ?? {};
    if (e.type === 'way' && t.building !== undefined && (num(t.height) >= q.h || num(t['building:levels']) >= q.floors)) return true;
    if (e.type === 'relation' && t.building !== undefined && num(t.height) >= q.h) return true;
    if (e.type === 'way' && t['building:part'] !== undefined && num(t.height) >= q.h) return true;
    return q.mast > 0 && /^(tower|mast)$/.test(t.man_made ?? '') && num(t.height) >= q.mast;
  };
}
export async function skylineDoc(env, bb, q) {
  const bucket = env.TILES ?? null;
  if (!bucket) return null;
  const idx = await getIndex(bucket);
  if (!idx) return null;
  const rule = tallRule(q);
  const pending = new Map();
  const seen = new Set(), out = [];
  for (let bx = Math.floor(bb.w + 180); bx <= Math.floor(bb.e + 180); bx++)
    for (let by = Math.floor(bb.s + 90); by <= Math.floor(bb.n + 90); by++) {
      const block = `${bx}_${by}`, hash = idx.blocks[block];
      if (!hash) continue;
      const d = await directory(bucket, PFX, block, hash, pending);
      if (!d.tall) continue;
      const text = await gunzipRange(bucket, `${PFX}/b/${block}.${hash}.${d.tall[2] ?? 0}.bin`, d.tall);
      for (const line of text.split('\n')) {
        const L = line && splitLine(line);
        if (!L || L.n < bb.s || L.s > bb.n || L.e < bb.w || L.w > bb.e || seen.has(L.k + L.id)) continue;
        seen.add(L.k + L.id);
        const e = JSON.parse(L.payload);
        if (rule(e) && selects(e, bb)) out.push(e);
      }
    }
  out.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type < b.type ? -1 : 1));
  return { elements: out, osm3s: { timestamp_osm_base: idx.ts } };
}
