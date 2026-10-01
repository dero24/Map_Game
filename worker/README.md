# map-game-tiles — real-lite tile service (Phase H1a)

`GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg>` → one 1024 m world cell as `TileJson`.

Cold path per cell: R2 hit → else Overpass bbox query (cell + 48 m margin, `out geom`)
→ `src/world/realTile.ts` transform → R2 + edge cache. Warm cells never touch Overpass.

Two relays the game's module workers read through when an upstream sends no CORS/CORP
headers: `GET /dem/<z>/<x>/<y>.png` (Terrarium heights) and `GET /naip?bbox=<w,s,e,n>&size=<W,H>`
(one cell's USDA NAIP orthophoto from the USGS National Map, for real roof colours —
`src/world/aerialFetch.ts`; the game asks USGS directly first, so the relay only carries the
browsers it refuses; edge-cached a month, one lower-48 cell per request).

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
```

## Deploy

```bash
npx wrangler deploy              # -> https://map-game-tiles.<account>.workers.dev
```

Then point the game at it: `?tiles=https://map-game-tiles.<account>.workers.dev`
(or bake `tilesUrl` into a region manifest — `AtlasManifest.tilesUrl`).

## Notes

- **Free tier**: 100k worker req/day, 10 ms CPU, R2 10 GB / 10M reads / 1M writes.
  R2 needs R2 enabled on the account (payment method on file, still free tier).
- **Overpass politeness**: treat uncached queries as ~100/day. The R2 cache (incl.
  empty results) is the mitigation; 429/504 rotates to the next mirror; upstream
  outages 503 + a 60 s negative edge-cache so clients don't hammer.
- **`olat`/`olon`** anchor the game's local metre frame for this session. The game
  snaps virtual origins to a 1/64° grid so players at the same place share cells
  (and the R2 cache). Cache key: `t/v1/<olat>,<olon>/<cx>_<cz>.json`.
- **Polar**: `|olat| > 78` rejected — the equirectangular frame degenerates.
- Attribution header `x-osm-attribution` + `attribution` field in every tile (ODbL).
