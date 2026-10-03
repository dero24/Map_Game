// GET /measured/<cx>_<cz>.json?olat=<deg>&olon=<deg>&v=1 — one cell's LiDAR measurement, made once.
//
// The first request for a cell has the service read USGS 3DEP for it (the game's own measure code,
// src/world/lidarCell.ts + laz-perf, bundled), from the cell's buildings as its own /tile answer
// has them; the record goes to R2 for good (`m/v1/<olat,olon>/<cx>_<cz>.json`) and every device,
// phones and desktops alike, builds the same measured buildings from it. While one request is
// measuring a cell, the others are answered 202 (come back in a few seconds) — never a second
// measure, and never a request waiting on another's promise (workerd cancels those as hung): an
// R2 marker (`….pending`, created only if absent) says it's in hand, across isolates;
// a marker older than STALE_MS is a measure that died (the isolate ran out of memory or CPU) and
// the next request takes it over, at most TRIES times.
//
// In a Worker's 128 MB the survey is streamed: each octree node is decoded straight into the 1 m
// grid in node order (`lean`), one cell at a time per isolate, nothing kept between cells.
// Answers: 200 the record (the client checks its `ver`), 202 pending, 422 given up on, 400/503.
import createLazPerf from '../../src/vendor/laz-perf/laz-perf.js';
import LAZ_WASM from '../.gen/laz-perf.wasm';
import { cellKeyOf, cellPlan, cellRequest, foldRes, surveyed, VER, INDEX_MADE } from '../../src/world/lidar';
import { measureCell, setLazPerf, dropCellCaches } from '../../src/world/lidarCell';
import { measuredText, MEASURED_V } from '../../src/world/measuredFile';

const CELL = 1024;
const STALE_MS = 4 * 60 * 1000; // a marker this old is a measure that died
const TRIES = 3; // …taken over at most this often, then the cell is given up on (422)

// laz-perf is Emscripten's worker build: it wants a worker's globals when it starts, and a Worker
// may not compile WASM from bytes — its module is compiled at deploy (wrangler's .wasm import).
setLazPerf(() => {
  globalThis.location ??= { href: 'https://map-game-tiles.invalid/' };
  globalThis.importScripts ??= () => {};
  return createLazPerf({
    instantiateWasm(imports, done) {
      const inst = new WebAssembly.Instance(LAZ_WASM, imports);
      done(inst, LAZ_WASM);
      return inst.exports;
    },
  });
});

// One measure at a time per isolate (each holds a cell's rasters in its 128 MB). A request that
// finds the isolate busy is answered 202 rather than queued: workerd cancels, as hung, a request
// whose only pending work is a promise another request will settle — so no request ever waits on
// another's; the client comes back in a few seconds (and may land on another isolate).
let busy = false;
const pending = (io) => io.json({ pending: 1 }, { status: 202, headers: { 'retry-after': '8', 'cache-control': 'no-store' } });

/**
 * @param {{ json: Function, tileText: (olat: number, olon: number, cx: number, cz: number) => Promise<string | null> }} io
 */
export async function measured(request, env, ctx, url, cx, cz, io) {
  const olat = parseFloat(url.searchParams.get('olat') ?? 'NaN');
  const olon = parseFloat(url.searchParams.get('olon') ?? 'NaN');
  if (!isFinite(olat) || !isFinite(olon) || Math.abs(olat) > 78 || Math.abs(olon) > 180) return io.json({ error: 'bad origin' }, { status: 400 });
  if (Math.abs(cx) > 20000 || Math.abs(cz) > 9000) return io.json({ error: 'cell out of range' }, { status: 400 });
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const okey = `m/v${MEASURED_V}/${olat.toFixed(4)},${olon.toFixed(4)}/${cx}_${cz}.json`, pkey = okey.replace(/\.json$/, '.pending');
  const bucket = env.TILES ?? null;
  const done = (body, how) => {
    const res = io.json(body, { headers: { 'cache-control': 'public, max-age=86400, s-maxage=2592000', 'x-measured-cache': how } });
    ctx.waitUntil(cache.put(request, io.json(body, { headers: { 'cache-control': 'public, max-age=86400, s-maxage=2592000', 'x-measured-cache': 'edge' } })));
    return res;
  };
  if (bucket) {
    const obj = await bucket.get(okey).catch(() => null);
    if (obj) {
      const text = await obj.text();
      let ver = null;
      try { ver = JSON.parse(text).ver; } catch { /* a broken object: re-made */ }
      // (a record from before a measure-logic change is re-made, not served)
      if (ver === VER) return done(text, 'r2');
    }
  }
  const origin = { lat: olat, lon: olon };
  const box = { x0: cx * CELL, z0: cz * CELL, x1: cx * CELL + CELL, z1: cz * CELL + CELL };
  // No survey near the cell at all (outside the US, open ocean): settled without a read.
  if (!surveyed(origin, box)) return done(measuredText(VER, INDEX_MADE, cellKeyOf(origin, box), `${cx}_${cz}`, { none: 1, m: {} }), 'none');
  // Measuring already (this cell or another) in this isolate, or in another isolate (its marker):
  // come back shortly. (The marker is created only if absent — one measure per cell, anywhere.)
  // (the isolate is taken before the claim: a request that claimed a marker always measures it)
  if (busy) return pending(io);
  busy = true;
  const claim = bucket ? await claimMarker(bucket, pkey).catch(() => 'busy') : 'mine';
  if (claim !== 'mine') {
    busy = false;
    return claim === 'gave-up' ? io.json({ error: 'unmeasurable here' }, { status: 422, headers: { 'cache-control': 'public, max-age=86400' } }) : pending(io);
  }
  const p = measureNow(env, okey, pkey, origin, box, cx, cz, io).finally(() => (busy = false));
  ctx.waitUntil(p); // (a client that leaves mid-read doesn't cancel it: the record is for everyone)
  const r = await p;
  return r.body ? done(r.body, 'miss') : io.json({ error: r.error }, { status: r.status ?? 503, headers: { 'cache-control': 'no-store' } });
}

// 'mine' (go ahead), 'busy' (someone's measuring it), 'gave-up' (it died TRIES times).
async function claimMarker(bucket, pkey) {
  for (let i = 0; i < 2; i++) {
    const head = await bucket.head(pkey).catch(() => null);
    let n = 0;
    if (head) {
      n = +(head.customMetadata?.n ?? 0);
      if (Date.now() - head.uploaded.getTime() < STALE_MS) return 'busy';
      if (n >= TRIES) return 'gave-up';
      await bucket.delete(pkey).catch(() => {});
    }
    const put = await bucket.put(pkey, '1', { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { n: String(n + 1) } }).catch(() => null);
    if (put) return 'mine';
  }
  return 'busy';
}

async function measureNow(env, okey, pkey, origin, box, cx, cz, io) {
  const bucket = env.TILES ?? null;
  const t0 = Date.now();
  try {
    const text = await io.tileText(origin.lat, origin.lon, cx, cz);
    if (!text) return { error: 'tile unavailable', status: 503 };
    const tj = JSON.parse(text);
    const plan = cellPlan(tj, box, origin);
    const q = cellRequest(tj, box, origin, plan.ck, plan.todo.map((b, i) => [b, plan.keys[i]]), undefined);
    const rec = q ? foldRes(undefined, await measureCell({ ...q, strict: true, lean: true })) : { none: 1, m: {} };
    const body = measuredText(VER, INDEX_MADE, plan.ck, `${cx}_${cz}`, rec);
    if (bucket) await bucket.put(okey, body, { httpMetadata: { contentType: 'application/json' } });
    console.log(`measured ${cx}_${cz} @${origin.lat},${origin.lon}: ${q?.bld.length ?? 0} footprints, ${rec.src ?? 'no survey'}, ${(body.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return { body };
  } catch (e) {
    console.warn(`measure ${cx}_${cz} failed`, e?.message ?? e);
    return { error: `measure failed: ${e?.message ?? e}`, status: 503 };
  } finally {
    dropCellCaches();
    if (bucket) await bucket.delete(pkey).catch(() => {});
  }
}
