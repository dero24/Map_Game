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
- Tile cache key: worker R2 `t/v24`, client `&v=24`, and the direct (Overpass) cache's `DIRECT_V` 24 in `tile.worker.ts` — bump all three together when realTile output changes (v24: `roof:levels` → `Building.rl`, its storeys counted in the height; v23: a bridge's `bridge:structure` → `Road.bs`, drawn by bridges.ts as a truss, an arch, a suspension or a cable-stayed span, and `bridge:movable` → `Road.bm`, a lift or swing span; and the micro layer's furniture — picnic tables, fire rings, grills, planters, boards, recycling, street cabinets, vending machines, clocks, seamarks; v7: named business nodes → `Building.n` / `Building.u`; the worker's Overpass query fetches `node[name][amenity|shop|office]`). **Redeploy the worker** (`cd worker && npx wrangler deploy`) for streamed towns to carry them.
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

## Our own OpenStreetMap extract (the tile service's source; Overpass only a polite fallback)

The public Overpass servers aren't a game's backend (their usage policy; `docs/DATA_SOURCES.md` §0),
and in October 2026 they mostly didn't answer at all. Robby's call (2026-10-03): our own extract in
R2, matching Overpass exactly and proven so, packed rather than millions of files, cut on the game's
own grid, refreshed monthly by a script on his PC.

- **The query, written once** (`src/world/osmQuery.ts`): the cell query's statements. `overpassQuery`
  is generated from them, byte for byte the old query (`tests/osmQuery.test.ts` keeps a frozen copy);
  the extract selects with the same list (`sqlWhere` for DuckDB, `matchesQuery` in JS). A new tag the
  game reads goes into `STATEMENTS` — both sources pick it up together.
- **The grid** (`src/world/osmTiles.ts`): fixed 1/128° tiles (~0.87 × 0.67 km at 40°N) in 1° blocks,
  global, so every origin's cells read the same tiles (a game cell's grid depends on where the session
  started; the extract's doesn't). No state lines: the extract is cut from Geofabrik's whole-US file.
- **Overpass's rule, reproduced** (`selects`, `assemble`): an element is in a box's answer when a node
  or a segment of it is inside the box ("at least one point (also points on the segment) is properly
  inside") — a big lake whose shore never enters the box is not; a relation by any member; full
  geometry, members in order (`out geom`). Each tile line leads with its bounds, so a reader skips what
  can't be in its box without parsing it.
- **The extract** (`scripts/osm-extract.mjs`, DuckDB `ST_ReadOSM`): Geofabrik's file → the query's
  elements with their geometry → each way's tiles (its line against each tile's envelope, edges
  included) → a block's tiles gzipped back to back (a part per 200 MB), its tall things (the skylines'
  layer: buildings ≥ 45 m or 14 storeys, building parts and relations ≥ 45 m, towers and masts
  ≥ 150 m), its big relations (> 50 KB printed, stored once in their home block, tiles point there) and
  a directory. Lean on disk: the file read once per kind, each step's table dropped once used, each way
  printed while it's packed. New Jersey: 2.5 M elements, 373 MB packed, ~1 min.
- **Upload** (`scripts/osm-upload.mjs`): content-addressed keys — `osm/v1/b/<bx>_<by>.<hash>.<part>.bin`
  and `.json` — so an unchanged block is never re-written (R2 bills writes), and the index
  (`osm/v1/index.json`: each block's hash, the snapshot's timestamp, the extract's outline from
  Geofabrik's `.poly`) goes up last: the service switches in one write, and a directory an isolate
  held from before still reads the bytes it describes. `--no-index` stages without switching;
  `--local` fills `wrangler dev`'s R2.
- **The service** (`worker/src/osm.js`): a cold `/tile` asks the extract first — a box wholly inside
  the outline (no outline edge crossing it) reads its tiles by range and answers as Overpass would
  (`x-tile-source: extract`); only a box outside it goes to Overpass, politely: two mirrors, 25 s each,
  a five-minute rest after three failures, a failure edge-cached ten minutes. `/skyline` serves both
  skylines from the tall layer (`skyline.ts readTowers`; the browser asks Overpass only on
  `?tiles=direct`). The browser's own direct-Overpass fallback is gone too: a cell the service can't
  build keeps its stand-in (the vector twin) and is asked for again later.
- **The proof** (`tests/osmExtract.test.ts`, `tools/osm-compare.mjs`): real cells' extract tiles and
  the TileJson the service built from Overpass for the same cell; the extract's, through the same
  `osmToTile`, must be identical (only `osmBase`, the snapshot's time, differs). `--save` asks Overpass
  for a box as of the extract's own moment (an attic query) and keeps its raw answer for an
  element-by-element test, once Overpass answers again.
- **Refresh, monthly** (on Robby's PC): download Geofabrik's `us-latest.osm.pbf` (12 GB, once — and
  check its `.md5`), read the timestamp from `us-updates/state.txt`, run the extract, upload (only the
  changed blocks go up), and the index switches. The R2 TileJson cache (`t/vN`) keeps each cell as it
  was first built; bump `t/vN` to rebuild every cell from the new extract.

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
- **Measured once, for every device.** Phones never read a survey (`quality.ts` `lidar: false`:
  a city's decode crashed them), so a cell's measurement is made ahead and shipped as the same
  `Rec` a desktop caches: `enrichTile(…, pre)` applies a precomputed record first, on every tier
  (`?measured=0` leaves it out — a desktop then measures everything itself, for comparing). Its
  fits win over a browser's own (`joinRec`); a desktop reads the survey only for what a record
  lacks (complete = trees + unmapped + ≤3% of footprints missing), a phone never.
  - **Baked packs: the sidecar** — `public/data/<region>/measured/<cell>.json` + `index.json`
    (`{v, ver, index, bakeId, cells: {id: fnv36 hash | 0}}`; 0 = open water / no survey). The
    pack's own files never change. `measured.ts` `bakedMeasured` reads the index once (kept in
    IndexedDB for offline), then `<cell>.json?h=<hash>` through the tile cache.
  - **Made by** `node scripts/measure-cells.mjs --region=<id> [--only=a,b] [--resume]`, the
    runtime's own code through Vite's module runner (`scripts/lib/measure-entry.ts`): `cellPlan`
    (the same footprints and keys `enrichTile` asks about), `cellRequest`, `measureCell` with
    `strict` (a failed read throws and is retried 4×, never measured off an older survey instead)
    and `lean` (nodes streamed into the grid). `--check` verifies the sidecar against the pack
    offline; `tests/measured.test.ts` does too (ver = `VER`, bakeId = the manifest's, every hash).
    **Re-run it after a re-bake or a `VER` bump** — the test fails until you do.
  - **Deterministic:** nodes are added to the grid in node order (float32 ground sums are
    order-sensitive), so a desktop's own read, the script's and the tile service's agree to the
    byte: the shore's 216 cells measured twice (once kept, once streamed) are byte-identical.
  - **Size:** shore 2026-10-03 — 127 records + 89 zeros, 12.4 MB raw / 4.6 MB gzipped (mean
    36 KB gz a cell, max 80 KB). The buildings are ~4 KB gz a cell; 85% is the survey's trees
    (up to 12,000 a cell), which phones now plant too — the same trees as a desktop.
  - **Streamed cells: the tile service measures them** (`worker/src/measure.js`, `GET
    /measured/<cx>_<cz>.json?olat&olon&v=1` → R2 `m/v1/…`, `worker/README.md`). The first request
    for a cell has the service read its survey over the buildings its own `/tile` answer has —
    keyed like `/tile`, so the record keys the client's footprints — and every tier uses the record
    from then on. `measured.ts` `serviceMeasured`: one request a cell a session (its relief rebuild
    awaits the same one), 202s polled for up to 3 minutes, kept in IndexedDB (`measured|v1|VER|…`:
    a revisit or the cell offline costs nothing), a record of another `VER` ignored, no request at
    all where `lidar.ts` `surveyed()` finds no survey. A failure isn't remembered (the next build asks).
  - **While a record is on its way** (the cell's first visitor): `enrichTile` races it against the
    usual wait, builds from priors ('late') and neither tier reads the survey; the relief rebuild
    takes the record. Only when the service can't answer (offline, an error, `?tiles=direct`) does
    a desktop measure the cell itself. A vector twin (stand-in) only peeks (IndexedDB) and, with a
    service, never reads the survey either — its real twin, built next, gets the record.
  - **Keys:** `MEASURED_V` (`measuredFile.ts`) is the worker's R2 `m/vN` and the client's `&v=N` —
    one constant, both import it. A `VER` bump re-makes records by itself (each carries its `ver`;
    the worker re-measures a stale one). Neither changes `TileJson`: no `t/vN` bump.
  - **Where nothing is measured** (no record yet, no survey, a fit too poor to use): a house's height
    is a measured neighbour's, else its neighbourhood's storeys (`priors.ts`, in the builder —
    `docs/NEIGHBOURHOODS.md` "Heights where nothing is measured"). Mapped `height`,
    `building:levels` and `roof:levels` always win. Phones still never read a survey: with the
    sidecar and the service there's no gap that would need it.
  - **Check it in a browser:** `npm run build && node tools/height-check.mjs --device=pixel7
    --at=<lat,lon> --probes=<x,z;…>` (and `--device=desktop --query=measured=0`, which reads
    the survey in the page) — wall top and storeys per probe; the two must print the same.

## Aerial roof colours (streamed US cells)

- `src/world/aerialFetch.ts` (tile worker IO) + `aerial.ts` (pure): a real cell's USDA NAIP photo
  is fetched from the start of its build (`prefetchAerial`), read after the LiDAR enrichment
  (`enrichAerial` → `Building.ar`), cached per cell in IndexedDB (`aerial|vN|…`); waits 1.5 s on
  a first visit, else `late` → relief rebuild. Direct from USGS, else the tile service's `/naip`
  relay. Baked tiles never fetch: `tileRoofs` balances their baked samples as they build.
- `?aerial=0` disables (and shows a baked pack's roofs as they were). Bump `VER` in
  aerialFetch.ts when the reading changes. Details and sources: `world-data.md` "Building colours
  from real data".

## What the tile service costs (Workers Paid; checked 2026-10-03)

The plan: $5 a month includes 10 M requests and 30 M CPU-ms (then $0.30 a million requests, $0.02 a
million CPU-ms); R2 stores 10 GB free (then $0.015 a GB-month), with 1 M writes (class A, then
$4.50 a million) and 10 M reads (class B, then $0.36 a million) a month free, and no egress fees. The
edge cache (`caches.default`) is free but per colo.

- **A first visit somewhere new** asks the service ~300–500 times: the detail ring's tiles (14–25) and
  their measured heights, the silhouette ring (to 8 km on a PC: ~200 cells; a phone's 4 km: ~50),
  the DEM tiles under them and the horizon's, the place index's boundary tile and searches, and the
  two skyline reads. A revisit is IndexedDB and the edge cache: a handful of requests. So the base
  plan's 10 M requests carry ~20–30 k new-area sessions a month before a cent more.
- **A cold cell** (first asked at its origin): our own extract's ranged reads (4–9 tiles and a
  directory an isolate keeps), osmToTile (~0.1–0.5 s CPU), one R2 write (the TileJson, kept for good)
  — the included CPU and writes cover about a million cold cells a month. Overpass costs nothing but
  reliability: it is only asked for a cell outside the extract's outline.
- **R2 storage:** the extract ~20–40 GB, the place index 0.1 GB, the measured heights and the TileJson
  cache growing with use (tens to hundreds of KB a cell) — a few dollars a month at most.
- **The one inefficiency:** the TileJson cache is keyed by the session's origin (the ?at= point
  snapped to 1/64°): two players who start 2 km apart build the same street twice. With the extract a
  rebuild is cheap; a cell key on a global grid would share it (a `t/vN` change, client and service
  together).
- **To check against the dashboard** (Robby): Workers → map-game-tiles → Metrics (requests, CPU time,
  errors), R2 → map-game-tiles → Metrics (class A/B operations, storage). `x-tile-cache`
  (`edge`/`r2`/`miss`) and `x-tile-source` (`extract`/`overpass`) on every answer say which path
  served it.
