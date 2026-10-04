# map-game-tiles — real-lite tile service (Phase H1a)

`GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg>` → one 1024 m world cell as `TileJson`.

Cold path per cell: R2 hit → else Overpass bbox query (cell + 48 m margin, `out geom`)
→ `src/world/realTile.ts` transform → R2 + edge cache. Warm cells never touch Overpass.

Two relays the game's module workers read through when an upstream sends no CORS/CORP
headers: `GET /dem/<z>/<x>/<y>.png` (Terrarium heights) and `GET /naip?bbox=<w,s,e,n>&size=<W,H>`
(one cell's USDA NAIP orthophoto from the USGS National Map, for real roof colours —
`src/world/aerialFetch.ts`; the game asks USGS directly first, so the relay only carries the
browsers it refuses; edge-cached a month, one lower-48 cell per request).

`GET /measured/<cx>_<cz>.json?olat=<deg>&olon=<deg>&v=1` → the cell's LiDAR measurement
(`src/measure.js`): the first request for a cell reads USGS 3DEP for it — the game's own measure
code (`src/world/lidarCell.ts`, laz-perf, bundled) over the buildings its `/tile` answer has — and
keeps the record in R2 for good (`m/v1/<olat,olon>/<cx>_<cz>.json`, 1–50 KB). Every device then
builds the same measured buildings from it: phones, which never read a survey, and desktops, which
stop reading cells that have a record. Byte-identical to a desktop's own read of the same cell.

- **Answers:** 200 the record (it carries `ver`, the game's `lidar.ts` `VER`: a client of other
  measure code ignores it; a record of an older `VER` is re-made, not served); 202 + `retry-after:
  8` while it's being measured (by this isolate or another — an R2 marker `….pending`, created only
  if absent, so one measure per cell anywhere; a marker older than 4 min is a measure that died and
  is taken over, at most 3 times, then 422); a cell with no survey near it (outside the US, open
  sea) is settled at once with `none`.
- **In a Worker's 128 MB:** one cell at a time per isolate (a request finding it busy gets the 202),
  each survey node decoded straight into the 1 m grid in node order (`lean`), nothing kept between
  cells. Measured in Node on Midtown (the densest cell: 1,839 footprints, NYC 2017): ~3 MB of live
  JS heap + ~38 MB of buffers (the grid, its rasters, laz-perf's 7.4 MB heap) over the baseline,
  6.3 s CPU; in `wrangler dev` 6–10 s a cell end to end, the same bytes as Node.
- **Needs Workers Paid** (free is 10 ms CPU): `[limits] cpu_ms = 60000` in `wrangler.toml`.
  laz-perf's WASM is compiled at deploy (a Worker may not compile bytes at run time): `[build]`
  runs `scripts/gen-wasm.mjs`, which decodes the game's own copy into `.gen/laz-perf.wasm`.
- **No request waits on another's promise.** workerd cancels, as hung (a 500), a request whose only
  pending work is a promise another request will settle. So a cold `/tile` cell another request is
  fetching is waited for in R2 on the asker's own timer, Overpass slots are polled for, and a busy
  isolate answers `/measured` with 202 (the client polls; `src/world/measured.ts`).

## Setup (once, needs a free Cloudflare account)

```bash
cd worker
npx wrangler login                          # browser auth
npx wrangler r2 bucket create map-game-tiles
```

## Run locally

```bash
npx wrangler dev                 # http://localhost:8787 (local R2 emulation)
curl "http://localhost:8787/tile/0_0.json?olat=40.362&olon=-73.9755"
curl "http://localhost:8787/measured/0_0.json?olat=40.362&olon=-73.9755&v=1"
```

Local dev is HTTP/1.1: a browser holds six connections to it, so a `/measured` request can queue
behind slow cold `/tile` calls (the deployed service is HTTP/2). To test the measure path in the
game, seed R2 (`npx wrangler r2 object put map-game-tiles/t/v24/<olat4>,<olon4>/<cx>_<cz>.json
--file=… --local`) and make cold cells fail fast: `npx wrangler dev --var
OVERPASS_ENDPOINTS:http://127.0.0.1:9/api/interpreter`.

## Deploy

```bash
npx wrangler deploy              # -> https://map-game-tiles.<account>.workers.dev
```

Then point the game at it: `?tiles=https://map-game-tiles.<account>.workers.dev`
(or bake `tilesUrl` into a region manifest — `AtlasManifest.tilesUrl`).

## Notes

- **Plan**: `/measured` needs Workers Paid ($5/mo: 10M requests and 30M CPU-ms a month included;
  a measured cell is ~1–7 s of CPU once, ever). The free tier (100k req/day, 10 ms CPU) still
  serves `/tile`, `/dem` and `/naip`. R2 10 GB / 10M reads / 1M writes free.
- **Overpass politeness**: treat uncached queries as ~100/day. The R2 cache (incl.
  empty results) is the mitigation; 429/504 rotates to the next mirror; upstream
  outages 503 + a 60 s negative edge-cache so clients don't hammer.
- **`olat`/`olon`** anchor the game's local metre frame for this session. The game
  snaps virtual origins to a 1/64° grid so players at the same place share cells
  (and the R2 cache). Cache key: `t/v1/<olat>,<olon>/<cx>_<cz>.json`.
- **Polar**: `|olat| > 78` rejected — the equirectangular frame degenerates.
- Attribution header `x-osm-attribution` + `attribution` field in every tile (ODbL).

## Place index (`src/places.js`)

`GET /places/search?q=<text>&lat=<deg>&lon=<deg>[&n=8]` and `GET /places/rt/<ix>_<iy>.json` — our own
lower-48 place index (USGS GNIS + US Census, public domain; `src/ui/placeIndex.ts`), replacing the
Photon geocoder. Built by `node scripts/build-places.mjs` into `raw/places/out/`; upload all four
files to `places/v<N>/` (`npx wrangler r2 object put map-game-tiles/places/v<N>/names.bin
--file=../raw/places/out/names.bin --remote`, and `names.json`, `rev.bin`, `rev.json`), then deploy
with `V` here and `INDEX_V` in the bake bumped together — an isolate keeps a directory for an hour,
and new offsets under an old key would read the wrong bytes. A search reads one gzipped shard by
range (median 356 B, the largest ~3 MB: "church"); answers are edge-cached a day, keyed on the
normalized query, the position rounded to 0.1° and `RANK_V`; tiles are immutable for a month.
