// map-game tile service (Cloudflare Worker).
//
//   GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg>
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
      return json({ ok: true, service: 'map-game-tiles', usage: 'GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg> | GET /dem/<z>/<x>/<y>.png' });
    const dm = url.pathname.match(/^\/dem\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (dm) return dem(request, env, ctx, url, parseInt(dm[1]), parseInt(dm[2]), parseInt(dm[3]));
    const m = url.pathname.match(/^\/tile\/(-?\d+)_(-?\d+)\.json$/);
    if (!m) return json({ error: 'unknown route', usage: 'GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg> | GET /dem/<z>/<x>/<y>.png' }, { status: 404 });
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
  const okey = `t/v15/${olat.toFixed(4)},${olon.toFixed(4)}/${cx}_${cz}.json`;
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
  let pending = inflight.get(okey);
  if (!pending) {
    pending = coldTile(env, okey, cx, cz, box, origin);
    inflight.set(okey, pending);
    void pending.finally(() => inflight.delete(okey)); // coldTile never rejects
  }
  const out = await pending;
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

// Cold cells: Overpass -> transform -> R2. Returns {body,stats} or {body:null,detail} —
// never rejects (the inflight map would leak a rejection into every waiter).
const inflight = new Map();
// Overpass allows a couple of concurrent queries per client IP; more just earn 429s and
// timeouts for all of them. One isolate serialises its cold queries through two slots.
let opSlots = 2;
const opWait = [];
async function overpassSlot(fn) {
  if (opSlots <= 0) await new Promise((r) => opWait.push(r));
  else opSlots--;
  try {
    return await fn();
  } finally {
    const next = opWait.shift();
    if (next) next();
    else opSlots++;
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
