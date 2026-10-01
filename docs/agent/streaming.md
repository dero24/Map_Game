# Streaming — tiles, workers, real-lite, DEM, LiDAR

Read this when the task touches tile streaming, the tile worker, the Cloudflare worker,
terrain/DEM, or the LiDAR measure pipeline.

## Tile stream (`src/world/stream.ts`)

- Runtime loads `manifest.json` + `terrain.bin` + `paint.json`, then streams
  `tiles/<cx>_<cz>.json` (1024 m cells, 48 m margin) around the walker.
- Margin entities carry `own: 0` (context only — buildings/roads/areas/lines/points are
  emitted once by their owner tile; context copies exist for door snapping, porch clearance
  and sign intersections).
- `WalkWorld.beginScope/endScope/removeScope` scopes all collision per tile; interiors
  register under `"tile:idx"` keys and unregister on unload.
- The ambient-life worker re-inits when the loaded set settles (or after 4 s). The road graph
  it gets is built a few ms a frame (`life.ts` `lifeInitSteps`, pumped in `main.ts`): a city
  ring's rebuild in one go was 0.5 s, every few seconds on a drive.
- A mounted tile shows 12 MB (or 24 meshes) a frame (`TileStream.reveal`), each drawn the
  frame it appears, even off-screen, so its buffers go up then. Whatever it replaces — its
  stand-in twin, its coarse silhouette, a flat first build — is handed over (`retire`) and stays
  on screen until the new tile is whole. `ensureAround` (spawn) mounts all at once.
  `TileStream.lastMount` says where the last mount's time went.
- A phone's budget (`streamParams.budgetMB`, set by its quality tier; 0 on a PC = no budget):
  each detail tile's vertex data is measured when it mounts (`TileArt.bytes`, remembered per id
  for the next visit), and `world/budget.ts` `admitCells` keeps the ring's cells nearest first
  while they fit — the cell you stand in (and within 150 m) always; a built cell counts 150 m
  nearer (no flip-flop). A cell past the budget unloads to its silhouette; queued builds for it
  are dropped; `ensureAround` leaves real tiles to `update()` (a teleport into Midtown built the
  whole ring at once). `realConc` caps real builds in flight (4 on a PC). `coarseMB` (phone 90, low 60, a PC none) caps the silhouette ring's vertex data: over it the farthest silhouettes go and nothing past that distance is fetched until the ring is under ~70% (`coarseCut`) — Midtown's stand-in silhouettes were 175–190 MB of a phone's ring, three times its detail tiles. `purge` (all tiers)
  takes an unloaded tile's walls out of the walk world a slice a frame (`removeScope(id, 'later')`
  → `WalkWorld.purgeSome`, ~1.5 ms, from `update()`); they stop blocking at once, and their ids
  are reused only once out of every grid cell.
- `TileStream.dispose` frees a tile's sign atlas with its geometry (`group.userData.atlas`) — it
  was the one per-tile texture, and it leaked on every unload.
- The walker's neighbourhood grids (`houseGrid`, `shopGrid`, `cityGrid`, `pavedIndex`) are
  summed from each tile's own, worked out once per tile (they were rebuilt from every footprint
  and segment in the ring on every mount).
- Regions without a manifest fall back to a single-tile world.json.

## Tile worker + packing

- Tile builds run in a module worker (`src/world/tile.worker.ts`): fetch + decode + builders +
  interior plans + a recording scratch `WalkWorld` happen off-thread (`src/world/tileBuild.ts`,
  shared with the no-worker fallback).
- Results cross as `BuiltTile` records (`src/world/pack.ts`): attribute arrays + material
  tags → `buildObject` recreates meshes/materials on mount; canvas work ships as
  `ImageBitmap` (sign atlas; per-tile lamp pools are composited into `U.uLampMap` by the
  stream); collision ships as `WalkOp`s replayed inside the scope; deck heights ship as exact
  `DeckProfile` params (ramp/const/arch/table on the `Deck` interface; a bridge's `table` is its
  drawn heights, its `cut` its square ends).

## Terrain packs

- lod-0 tiles also fetch `tiles/<cx>_<cz>.terrain.bin` — a subgrid of the slice layer snapped
  to the shared lattice (no margin). Virtual cells carry a DEM `TerrainLayer` in-band instead
  (`BuiltTile.dem`).
- `Terrain.registerPatch/removePatch` (called alongside the walk scope on mount/unload) makes
  the pack the preferred sampling layer for its box; `patchFor` also checks the 8 neighbour
  cells (DEM grids overhang by a pitch) so a not-yet-loaded neighbour doesn't leave a flat
  shelf.
- Region slice/backdrop layers stay resident, so unloaded areas still answer at region
  resolution and every consumer keeps the same signatures.

## Real-lite tiles (open world, `worker/`)

- Dev: `cd worker && npx wrangler dev` (port 8787, or 8788/8789 if taken). In dev the Vite
  server proxies `/__tiles/*` to whichever port answers and the game probes that first
  (`?tiles=` explicit overrides, `?tiles=off` disables; no worker → procedural past the bake
  + a toast).
- Tile cache key: worker R2 `t/v23`, client `&v=23`, and the direct (Overpass) cache's `DIRECT_V` 23 in `tile.worker.ts` — bump all three together when realTile output changes (v23: a bridge's `bridge:structure` → `Road.bs`, drawn by bridges.ts as a truss, an arch, a suspension or a cable-stayed span, and `bridge:movable` → `Road.bm`, a lift or swing span; and the micro layer's furniture — picnic tables, fire rings, grills, planters, boards, recycling, street cabinets, vending machines, clocks, seamarks; v7: named business nodes → `Building.n` / `Building.u`; the worker's Overpass query fetches `node[name][amenity|shop|office]`). **Redeploy the worker** (`cd worker && npx wrangler deploy`) for streamed towns to carry them.
- `?at=lat,lon` beyond every baked backdrop builds a virtual manifest (origin snapped to
  1/64° so players share cell/R2 keys) — `w-<cx>_<cz>` specs stream OSM→TileJson while `s-*`
  synth twins mount instantly and upgrade in place.
- A stand-in's lots are a pure function of position (`synth.ts` `standInLots`): kept in turn along
  each street, clashes between streets settled by hash rank in two rounds, so any tile with
  `LOT_REACH` of ground round its window keeps the same lots as its neighbour, lot for lot. Placed
  greedily in each tile's own street order, neighbours had disagreed on a third of the lots they
  share: doubled, overlapping or missing buildings along the seam. `tests/synthSeams.test.ts`.
- Deployed: live at `https://map-game-tiles.map-game-tiles.workers.dev` (R2 bound as TILES).
  Production defaults to it; localhost prefers `wrangler dev` and falls back to it. Redeploy:
  `cd worker && npx wrangler deploy`.
- The shared transform is `src/world/realTile.ts` (bundled by the worker, unit-tested
  client-side — keep its tag tables in sync with `scripts/bake.mjs`/`lib/colour.mjs`).

## DEM terrain

- Worker route `GET /dem/<z>/<x>/<y>.png` proxies Terrarium (S3 has no CORP headers —
  module-worker fetches must go through the proxy).
- `src/world/dem.ts` decodes z14 PNGs → 64×64 grid at 16 m pitch → a synthetic `TerrainLayer`
  (heights f32-cm; sdf/flags derive from elevation — sea nodes = water). The PNG is read byte for
  byte (`terrariumFromPng`: IDAT inflated with three's bundled fflate, the scanline filters
  undone) — no canvas, so no colour management, the same heights on every device, and a worker
  without OffscreenCanvas (iPhones before iOS 16.4) still gets its ground; the canvas path is only
  the fallback for a PNG it doesn't take.
- A virtual cell whose DEM is late or failed is built on `flatDem` (the same lattice at the
  stand-in's height) so the map's water still presses into it — a cell out on the Sound is sea,
  not a flat lawn over it; a stand-in built so is marked `late` for its relief rebuild.
- The worker registers the patch before `buildTile` so props/ground/interiors sit on real
  heights; `BuiltTile.dem` ships a copy to the main thread, which registers it under the cell
  key with `demHolders` refcounting so the s→w swap can't drop terrain.
- Placeholder tiles race DEM at 4 s; real tiles await it.

## LiDAR measured buildings

- `src/world/lidar.ts` — worker IO: bundled 3DEP project index, EPT octree reads from the
  public `usgs-lidar-public` S3 bucket, laz-perf WASM in `src/vendor/laz-perf`, IndexedDB
  cache per cell `lidar|vN|…`.
- `lidarCore.ts` — pure: projections, index lookup, 1 m HAG grids. `measure.ts` — pure roof
  fits.
- `enrichTile` writes `h/eav/roof/ms` onto real buildings before `buildTile`; a late read
  flags `tile.late` → stream relief rebuild.
- The same read plants real trees (`detectTrees` → `TileJson.trees/treeCov` → props, which
  keeps the WorldCover scan only where the survey has no coverage).
- Runs in its own worker (`lidar.worker.ts` → `lidarCell.ts`: EPT reads, rasters, fits,
  `detectBuildings`, `detectTrees`), spawned by the stream and wired to the tile worker with
  a MessageChannel; `lidar.ts` (tile worker) owns the IDB cache and applies results.
- `?lidar=0` disables. Bump `VER` in lidar.ts whenever measure/raster/tree logic changes.
