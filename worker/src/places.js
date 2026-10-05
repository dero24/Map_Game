// Our own lower-48 place index (src/ui/placeIndex.ts, baked by scripts/build-places.mjs):
//
//   GET /places/search?q=<text>&lat=<deg>&lon=<deg>[&n=8]   → { v, results: [{ name, detail, lat, lon, kind }] }
//   GET /places/rt/<ix>_<iy>.json                           → one 0.25° tile of Census boundaries (reverse lookups)
//
// Both read R2 `places/v1/…`: one packed file of gzipped shards (names.bin) or tiles (rev.bin) and its
// directory (names.json / rev.json: key → [offset, length]), each shard a ranged read. Public-domain
// names only (USGS GNIS, the US Census): no street addresses. Answers are edge-cached; the search's
// key rounds the asker's position to ~10 km (it only orders the results).
import { queryShards, rankRows, parseRows, normalize, RANK_V } from '../../src/ui/placeIndex';

const V = 3; // (scripts/build-places.mjs INDEX_V: bumped together)
const PFX = `places/v${V}`;
const dirs = { names: null, rev: null, at: 0 };
// (a few recent shards per isolate: typing a name asks for the same shard again and again)
const recent = new Map();

async function directory(bucket, which) {
  if (!dirs[which] || Date.now() - dirs.at > 3600e3) {
    const o = await bucket.get(`${PFX}/${which}.json`);
    if (!o) return null;
    dirs[which] = await o.json();
    dirs.at = Date.now();
  }
  return dirs[which];
}
async function unpack(bucket, file, at) {
  const o = await bucket.get(`${PFX}/${file}`, { range: { offset: at[0], length: at[1] } });
  if (!o) return null;
  return new Response(o.body.pipeThrough(new DecompressionStream('gzip'))).text();
}
async function shardRows(bucket, dir, key) {
  if (recent.has(key)) return recent.get(key);
  const at = dir.shards[key];
  if (!at) return [];
  const rows = parseRows((await unpack(bucket, 'names.bin', at)) ?? '');
  recent.set(key, rows);
  if (recent.size > 6) recent.delete(recent.keys().next().value);
  return rows;
}

export async function places(request, env, ctx, url, { json }) {
  const bucket = env.TILES ?? null;
  if (!bucket) return json({ error: 'no index bucket' }, { status: 503 });
  const cache = caches.default;

  const rt = url.pathname.match(/^\/places\/rt\/(\d+)_(\d+)\.json$/);
  if (rt) {
    const hit = await cache.match(request);
    if (hit) return hit;
    const dir = await directory(bucket, 'rev');
    if (!dir) return json({ error: 'index not loaded' }, { status: 503 });
    const at = dir.tiles[`${rt[1]}_${rt[2]}`];
    // (no tile: open sea, or outside the lower 48 — an empty tile, cached like any other)
    const body = at ? await unpack(bucket, 'rev.bin', at) : JSON.stringify({ v: V, b: [] });
    if (body === null) return json({ error: 'tile unreadable' }, { status: 502 });
    const res = json(body, { headers: { 'cache-control': 'public, max-age=2592000, immutable', 'x-places': `v${V}` } });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  }

  if (url.pathname === '/places/search') {
    const q = (url.searchParams.get('q') ?? '').slice(0, 80);
    const lat = parseFloat(url.searchParams.get('lat') ?? 'NaN'), lon = parseFloat(url.searchParams.get('lon') ?? 'NaN');
    const n = Math.max(1, Math.min(20, parseInt(url.searchParams.get('n') ?? '8') || 8));
    const qn = normalize(q);
    if (qn.length < 2) return json({ v: V, results: [] });
    const near = isFinite(lat) && isFinite(lon) ? { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 } : undefined;
    // the cache's key: the query as normalized and the position as rounded — the same answer
    const key = new Request(`${url.origin}/places/search?q=${encodeURIComponent(qn)}${near ? `&lat=${near.lat}&lon=${near.lon}` : ''}&n=${n}&v=${V}.${RANK_V}`);
    const hit = await cache.match(key);
    if (hit) return hit;
    const dir = await directory(bucket, 'names');
    if (!dir) return json({ error: 'index not loaded' }, { status: 503 });
    // the rarest word's shard first; a word that was only a qualifier ("Monmouth" in "Shrewsbury
    // Monmouth") finds nothing in its own shard, so the next is read — at most three
    let results = [];
    for (const k of queryShards(qn, (k) => dir.shards[k]?.[1] ?? Infinity).filter((k) => dir.shards[k]).slice(0, 3)) {
      results = rankRows(await shardRows(bucket, dir, k), qn, near, n);
      if (results.length) break;
    }
    const res = json({ v: V, results: results.map(({ score, ...r }) => r) }, { headers: { 'cache-control': 'public, max-age=86400', 'x-places': `v${V}` } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  return null;
}
