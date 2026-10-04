// map-game tile service (Cloudflare Worker).
//
//   GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg>
//   GET /measured/<cx>_<cz>.json?olat=<deg>&olon=<deg>&v=1   (measure.js: the cell's LiDAR, once)
//   GET /places/search?q=&lat=&lon=  ·  GET /places/rt/<ix>_<iy>.json   (places.js: our own place index)
//
// One cell of the walking world as TileJson: Overpass elements for the cell's lat/lon
// bbox (+48 m margin), transformed by src/world/realTile.ts (bundled verbatim), cached in
// R2 forever so each street is fetched from Overpass once per *population*, not per player.
// Cache chain per request: edge Cache API (per-colo) -> R2 (global) -> Overpass.
//
// Free-tier reality check: Workers free = 100k req/day + 10 ms CPU; Overpass politely =
// ~100 uncached queries/day for a proxied service. R2 is what makes this viable — cache
// hits never touch Overpass (empty cells are cached too: they are valid data, not failures).
import { osmToTile, makeProjector, overpassQuery } from '../../src/world/realTile';
import { measured } from './measure';
import { places } from './places';

const CELL = 1024; // game cells, metres (region-local frame anchored at olat/olon)
const MARGIN = 48; // context ring, same as the bake's TILE_MARGIN
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'map-game-tiles/0.1 (watercolor walking sim; OSM per-cell tile service; github.com/dero24/Map_Game)';
const OSM_CREDIT = 'Map data (c) OpenStreetMap contributors, ODbL - https://www.openstreetmap.org/copyright';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '86400',
  // The game page runs cross-origin-isolated (COEP) in dev — tiles must be CORP-readable.
  'cross-origin-resource-policy': 'cross-origin',
};
const USAGE = 'GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg> | GET /measured/<cx>_<cz>.json?olat=<deg>&olon=<deg>&v=1 | GET /dem/<z>/<x>/<y>.png | GET /naip?bbox=<w,s,e,n>&size=<W,H> | GET /places/search?q=<text>&lat=<deg>&lon=<deg> | GET /places/rt/<ix>_<iy>.json';
const json = (body, init = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, 'x-osm-attribution': OSM_CREDIT, ...(init.headers || {}) },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' || url.pathname === '/health')
      return json({ ok: true, service: 'map-game-tiles', usage: USAGE });
    const dm = url.pathname.match(/^\/dem\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (dm) return dem(request, env, ctx, url, parseInt(dm[1]), parseInt(dm[2]), parseInt(dm[3]));
    if (url.pathname === '/naip') return naip(request, ctx, url);
    if (url.pathname.startsWith('/places/')) {
      const r = await places(request, env, ctx, url, { json });
      if (r) return r;
    }
    const mm = url.pathname.match(/^\/measured\/(-?\d+)_(-?\d+)\.json$/);
    if (mm) return measured(request, env, ctx, url, parseInt(mm[1]), parseInt(mm[2]), { json, tileText: (olat, olon, cx, cz) => tileText(env, olat, olon, cx, cz) });
    const m = url.pathname.match(/^\/tile\/(-?\d+)_(-?\d+)\.json$/);
    if (!m) return json({ error: 'unknown route', usage: USAGE }, { status: 404 });
    return tile(request, env, ctx, url, parseInt(m[1]), parseInt(m[2]));
  },
};

// GET /dem/<z>/<x>/<y>.png — Terrarium DEM tile via AWS Open Data. The game is COEP-
// isolated: fetching s3.amazonaws.com directly from a module worker is blocked (the
// bucket sends no CORP header), so the worker proxies it — PNGs are immutable, so
// edge-cache them for a week and stash in R2 forever (same cache chain as tiles).
async function dem(request, env, ctx, url, z, x, y) {
  if (z > 15 || y >= 2 ** z || x < 0 || y < 0) return json({ error: 'bad dem tile' }, { status: 400 });
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const okey = `dem/v1/${z}/${x}/${y}.png`;
  const bucket = env.TILES ?? null;
  if (bucket) {
    try {
      const o = await bucket.get(okey);
      if (o) {
        const res = new Response(o.body, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800, immutable', 'x-dem-cache': 'r2', ...CORS } });
        ctx.waitUntil(cache.put(request, res.clone()));
        return res;
      }
    } catch (e) { console.warn('R2 dem get failed', e); }
  }
  try {
    const up = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, { signal: AbortSignal.timeout(10000) });
    if (!up.ok) return json({ error: `dem upstream ${up.status}` }, { status: 502 });
    const bytes = await up.arrayBuffer();
    if (bucket) ctx.waitUntil(bucket.put(okey, bytes, { httpMetadata: { contentType: 'image/png' } }).catch((e) => console.warn('R2 dem put failed', e)));
    const res = new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800, immutable', 'x-dem-cache': 'miss', ...CORS } });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  } catch (e) {
    return json({ error: `dem fetch ${e?.message ?? e}` }, { status: 502 });
  }
}

// GET /naip?bbox=<w,s,e,n>&size=<W,H> — one cell's USDA NAIP orthophoto (public domain), relayed
// from the USGS National Map's ImageServer for a browser the server itself refuses (no CORS
// header for its origin, or a COEP-isolated page). The game reads roof colours off it in the
// tile worker (src/world/aerialFetch.ts), which asks the server directly first. Only one
// lower-48 cell's worth is relayed — the upstream query is rebuilt from the checked values,
// never passed through — and each answer is edge-cached for a month (the photos change yearly).
const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
async function naip(request, ctx, url) {
  const bbox = url.searchParams.get('bbox') ?? '', size = url.searchParams.get('size') ?? '';
  const bb = bbox.split(',').map(Number), sz = size.split(',').map(Number);
  if (bb.length !== 4 || !bb.every(isFinite) || sz.length !== 2 || !sz.every((v) => Number.isInteger(v) && v > 0 && v <= 2400))
    return json({ error: 'bad naip request', usage: USAGE }, { status: 400 });
  const [w, s, e, n] = bb;
  if (!(e > w && n > s && e - w < 0.03 && n - s < 0.02 && s > 24 && n < 50 && w > -125.5 && e < -66.5))
    return json({ error: 'one lower-48 cell at a time' }, { status: 400 });
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const q = `bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${size}&format=jpg&compressionQuality=85&interpolation=RSP_BilinearInterpolation&f=image`;
  try {
    const up = await fetch(`${NAIP}?${q}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) });
    const type = up.headers.get('content-type') ?? '';
    if (!up.ok || !type.startsWith('image/')) return json({ error: `naip upstream ${up.status} ${type}` }, { status: 502 });
    const res = new Response(await up.arrayBuffer(), { headers: { 'content-type': type, 'cache-control': 'public, max-age=2592000', 'x-naip-cache': 'miss', 'x-imagery': 'USDA NAIP via USGS The National Map (public domain)', ...CORS } });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  } catch (e) {
    return json({ error: `naip fetch ${e?.message ?? e}` }, { status: 502 });
  }
}

async function tile(request, env, ctx, url, cx, cz) {
  const olat = parseFloat(url.searchParams.get('olat') ?? 'NaN');
  const olon = parseFloat(url.searchParams.get('olon') ?? 'NaN');
  if (!isFinite(olat) || !isFinite(olon) || Math.abs(olat) > 78 || Math.abs(olon) > 180)
    return json({ error: 'bad origin', usage: '?olat=<deg -78..78>&olon=<deg -180..180>' }, { status: 400 });
  // ~20k km of longitude span max at any latitude, ~9k km north/south of any origin —
  // anything beyond that is a buggy client or a probe, not a walker.
  if (Math.abs(cx) > 20000 || Math.abs(cz) > 9000) return json({ error: 'cell out of range' }, { status: 400 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  // v4: fills gained per-road rng + land masks + interior clamp — bump the object key
  // so stale tile payloads can't be served past the edge TTL.
  // v23: bridges' bridge:structure / bridge:movable (Road.bs / Road.bm) and the micro layer's
  // furniture (picnic tables, boards, cabinets, recycling, clocks, seamarks…)
  // v24: roof:levels in the height (Building.rl)
  const okey = tileKey(olat, olon, cx, cz);
  const bucket = env.TILES ?? null; // binding may be absent under `wrangler dev` before the bucket exists
  if (bucket) {
    try {
      const obj = await bucket.get(okey);
      if (obj) {
        const resp = json(await obj.text(), { headers: { 'cache-control': 'public, max-age=86400, s-maxage=2592000', 'x-tile-cache': 'r2' } });
        ctx.waitUntil(cache.put(request, resp.clone()));
        return resp;
      }
    } catch (e) {
      console.warn('R2 get failed', e);
    }
  }

  // Cold path: Overpass bbox query for the cell + margin.
  const box = { x0: cx * CELL, z0: cz * CELL, x1: cx * CELL + CELL, z1: cz * CELL + CELL };
  const origin = { lat: olat, lon: olon };
  // Cold path, deduplicated: concurrent requests for the same cell share ONE Overpass
  // fetch — otherwise a player cluster would stampede upstream on every miss.
  const out = await cellBody(env, okey, cx, cz, box, origin);
  if (!out.body) {
    // Negative edge-cache for a minute: an upstream outage shouldn't be retried by every client.
    const resp = json({ error: 'overpass unavailable', detail: out.detail }, { status: 503, headers: { 'cache-control': 'public, max-age=60', 'retry-after': '60' } });
    ctx.waitUntil(cache.put(request, resp.clone()));
    return resp;
  }
  const headers = { 'cache-control': 'public, max-age=86400, s-maxage=2592000', 'x-tile-stats': out.stats };
  // The edge-cached copy mustn't inherit the 'miss' label — store a twin labelled 'edge'.
  ctx.waitUntil(cache.put(request, json(out.body, { headers: { ...headers, 'x-tile-cache': 'edge' } })));
  return json(out.body, { headers: { ...headers, 'x-tile-cache': 'miss' } });
}

const tileKey = (olat, olon, cx, cz) => `t/v24/${olat.toFixed(4)},${olon.toFixed(4)}/${cx}_${cz}.json`;
// A cell's TileJson text, as /tile answers it (R2, else the cold path), or null — the /measured
// route measures the buildings the client got from /tile, keyed the same way.
async function tileText(env, olat, olon, cx, cz) {
  const okey = tileKey(olat, olon, cx, cz);
  const bucket = env.TILES ?? null;
  if (bucket) {
    const obj = await bucket.get(okey).catch(() => null);
    if (obj) return obj.text();
  }
  const box = { x0: cx * CELL, z0: cz * CELL, x1: cx * CELL + CELL, z1: cz * CELL + CELL };
  return (await cellBody(env, okey, cx, cz, box, { lat: olat, lon: olon })).body;
}

// One Overpass fetch per cold cell per isolate. The others asking meanwhile wait for its answer in
// R2, polled on their own timer: a request whose only pending work is a promise another request
// will settle is cancelled by the runtime as hung (a 500 — concurrent cold requests for a cell
// used to get one each). Returns {body,stats} or {body:null,detail}; never rejects.
const inflight = new Set();
async function cellBody(env, okey, cx, cz, box, origin) {
  if (inflight.has(okey)) {
    const body = await awaitR2(env.TILES ?? null, okey, () => inflight.has(okey));
    return body ? { body, stats: 'shared' } : { body: null, detail: 'fetched by another request, not stored' };
  }
  inflight.add(okey);
  try {
    return await coldTile(env, okey, cx, cz, box, origin);
  } finally {
    inflight.delete(okey);
  }
}
async function awaitR2(bucket, key, going, ms = 90000) {
  if (!bucket) return null;
  for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
    const was = going();
    await new Promise((r) => setTimeout(r, 1000));
    const obj = await bucket.get(key).catch(() => null);
    if (obj) return obj.text();
    if (!was) return null; // (its fetch had ended, and nothing was stored: it failed)
  }
  return null;
}

// Cold cells: Overpass -> transform -> R2. Returns {body,stats} or {body:null,detail} —
// never rejects.
// Overpass allows a couple of concurrent queries per client IP; more just earn 429s and
// timeouts for all of them. One isolate serialises its cold queries through two slots — a
// waiting request polls for a free one on its own timer (handed one by another request's
// promise, the runtime would cancel it as hung).
let opSlots = 2;
async function overpassSlot(fn) {
  while (opSlots <= 0) await new Promise((r) => setTimeout(r, 250));
  opSlots--;
  try {
    return await fn();
  } finally {
    opSlots++;
  }
}
async function coldTile(env, okey, cx, cz, box, origin) {
  return overpassSlot(() => coldTileNow(env, okey, cx, cz, box, origin));
}
async function coldTileNow(env, okey, cx, cz, box, origin) {
  const bb = makeProjector(origin).localToBbox({ x0: box.x0 - MARGIN, z0: box.z0 - MARGIN, x1: box.x1 + MARGIN, z1: box.z1 + MARGIN });
  const query = overpassQuery(bb); // shared with the in-browser direct path (realTile.ts)
  const endpoints = (env.OVERPASS_ENDPOINTS ? env.OVERPASS_ENDPOINTS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ENDPOINTS);
  let osm = null;
  let lastErr = 'no endpoints';
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) {
        lastErr = `${ep} -> ${r.status}`;
        if (r.status === 429) await new Promise((res) => setTimeout(res, Math.min(8, +(r.headers.get('retry-after') ?? 2) || 2) * 1000));
        continue; // 429 rate-limit / 504 timeout: try the next mirror
      }
      const j = await r.json();
      // Overpass answers a timed-out / out-of-memory query with 200 and a `remark` (and
      // no or partial elements). That is a failure, not an empty cell — caching it would
      // leave a real town blank for every player, forever.
      if (typeof j.remark === 'string' && /runtime error|timed out|out of memory|runtime limit/i.test(j.remark)) {
        lastErr = `${ep} -> ${j.remark.slice(0, 120)}`;
        continue;
      }
      osm = j;
      break;
    } catch (e) {
      lastErr = `${ep} -> ${e?.message ?? e}`;
    }
  }
  if (!osm) return { body: null, detail: lastErr };
  try {
    const tj = osmToTile(osm, { id: `${cx}_${cz}`, box, origin });
    const body = JSON.stringify(tj);
    const bucket = env.TILES ?? null;
    if (bucket) await bucket.put(okey, body, { httpMetadata: { contentType: 'application/json' } }).catch((e) => console.warn('R2 put failed', e));
    return { body, stats: `b${tj.buildings.length} r${tj.roads.length} a${tj.areas.length}` };
  } catch (e) {
    return { body: null, detail: `transform ${e?.message ?? e}` };
  }
}
