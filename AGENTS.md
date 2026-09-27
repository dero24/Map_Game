# map_game — watercolor walks in real places

- Play: `npm run dev` → http://localhost:5173 (click "Begin walking"). Prod: `npm run build && npm run preview` (:4173).
- One world: the game ships a single baked region, `shore` (Sea Bright → Monmouth Beach, Sea Bright's
  origin/spawn); everything past its backdrop streams real-lite tiles. `seabright`/`monmouthbeach` are
  `hidden` merge sources: `node scripts/merge-raw.mjs --region=shore` unions their raw fetches (coverage
  asserted), then `npm run bake -- --region=shore`. Unknown `?region=` values land in the listed world.
  Adding a region = one `REGIONS` entry in `scripts/config.mjs` + fetch + bake. Spec fields
  (slice/backdrop/origin/tz/oceanEdge/spawn/roads/shoreLabel/landmarks/mergeFrom/hidden/detail) are documented there.
- Detail zone: the bake keeps full detail across the whole backdrop; builders gate on
  `detailBox(json)` (= `json.detail ?? json.slice`). The slice only sets the 2 m terrain lattice and
  the lamp-map compositor box. `manifest.bakeId` (tile content hash) is part of the IDB cache key.
- Style + recipe: `src/world/styles.ts` (`regionStyle(lat,lon)`, `meta.style`, `setActiveStyle` on
  main + tile worker) and `src/world/recipe.ts` (`recipeFor(bd, style)` — every per-building look
  decision, pure f(bd.s, style, fc/rc)). Facade shader codes: siding in the fraction of `vInfo.y`
  (kind + code/10), roof material in `vInfo.w` on roof faces, region window vocabulary in `uWinStyle`.
- Deep links: `?at=lat,lon` picks the region whose slice (then backdrop, then nearest origin) contains
  the point and spawns there — on a doorstep it places you 2.2 m outside the nearest building's front door.
- Typecheck: `npm run typecheck`. Tests: `npm test` (vitest: rng, sun ephemeris, LifeSim determinism/behaviour,
  realTile OSM→TileJson, demLayer packing). Build must pass before handing off.
- Ambient life: pure sim in `src/sim/lifeSim.ts` (testable), worker wrapper `ambient.worker.ts`, renderer/client `life.ts`,
  shared layout `protocol.ts` (SAB when cross-origin isolated, transferable copies otherwise). Sound: `src/audio/ambience.ts` (all synthesized).
- Data: `npm run fetch` (osm/terrain/worldcover/overture/imagery, raw → `raw/<region>/`, archived),
  then `npm run bake` → `public/data/<region>/{world.json,terrain.bin,manifest.json,paint.json,tiles/*.json}` + `public/data/regions.json`.
  Debug masks land in `raw/<region>/debug/`.
  `fetch-imagery.mjs` samples USDA NAIP aerial photos (public domain, US only) inside every footprint → `raw/<region>/roofs.json`
  (real roof colours; tags/materials still win). Neither town has mapped facade/roof colours in OSM/Overture.
- Streaming (`src/world/stream.ts`): the runtime loads `manifest.json` + `terrain.bin` + `paint.json`, then streams
  `tiles/<cx>_<cz>.json` (1024 m cells, 48 m margin) around the walker. Margin entities carry `own: 0` (context only —
  buildings/roads/areas/lines/points are emitted once by their owner tile; context copies exist for door snapping,
  porch clearance and sign intersections). `WalkWorld.beginScope/endScope/removeScope` scopes all collision per tile;
  interiors register under `"tile:idx"` keys and unregister on unload. The ambient-life worker re-inits when the
  loaded set settles (or after 4 s). Regions without a manifest fall back to a single-tile world.json.
- Real-lite tiles (open world, `worker/`): `cd worker && npx wrangler dev` (port 8787, or 8788/8789 if taken).
  In dev the Vite server proxies `/__tiles/*` to whichever port answers and the game probes that first
  (`?tiles=` explicit overrides, `?tiles=off` disables; no worker → procedural past the bake + a toast).
  Tile cache key: worker R2 `t/v5`, client `&v=5` — bump both when realTile output changes. `?at=lat,lon` beyond every baked
  backdrop builds a virtual manifest (origin snapped to 1/64° so players share cell/R2 keys) —
  `w-<cx>_<cz>` specs stream OSM→TileJson while `s-*` synth twins mount instantly and upgrade in place.
  Terrain: worker route `GET /dem/<z>/<x>/<y>.png` proxies Terrarium (S3 has no CORP headers — module-worker
  fetches must go through the proxy). `src/world/dem.ts` decodes z14 PNGs → 64×64 grid at 16 m pitch → a
  synthetic `TerrainLayer` (heights f32-cm; sdf/flags derive from elevation — sea nodes = water). The worker
  registers the patch before `buildTile` so props/ground/interiors sit on real heights; `BuiltTile.dem` ships
  a copy to the main thread, which registers it under the cell key with `demHolders` refcounting so the s→w
  swap can't drop terrain. Placeholder tiles race DEM at 4 s; real tiles await it.
  Deploy once: `npx wrangler login`, `npx wrangler r2 bucket create map-game-tiles`, `npx wrangler deploy`, then
  set `AtlasManifest.tilesUrl` (or pass `?tiles=`). The shared transform is `src/world/realTile.ts` (bundled by
  the worker, unit-tested client-side — keep its tag tables in sync with `scripts/bake.mjs`/`lib/colour.mjs`).
  The `© OpenStreetMap contributors` HUD credit is ODbL-required — keep it visible.
- Tile builds run in a module worker (`src/world/tile.worker.ts`): fetch + decode + builders + interior plans +
  a recording scratch `WalkWorld` happen off-thread (`src/world/tileBuild.ts`, shared with the no-worker fallback).
  Results cross as `BuiltTile` records (`src/world/pack.ts`): attribute arrays + material tags → `buildObject`
  recreates meshes/materials on mount; canvas work ships as `ImageBitmap` (sign atlas; per-tile lamp pools are
  composited into `U.uLampMap` by the stream); collision ships as `WalkOp`s replayed inside the scope; deck heights
  ship as exact `DeckProfile` params (ramp/const/arch on the `Deck` interface).
- Terrain packs: lod-0 tiles also fetch `tiles/<cx>_<cz>.terrain.bin` — a subgrid of the slice layer snapped to the
  shared lattice (no margin). Virtual cells carry a DEM `TerrainLayer` in-band instead (`BuiltTile.dem`, see above).
  `Terrain.registerPatch/removePatch` (called alongside the walk scope on mount/unload) makes the pack the preferred
  sampling layer for its box; `patchFor` also checks the 8 neighbour cells (DEM grids overhang by a pitch) so a
  not-yet-loaded neighbour doesn't leave a flat shelf. Region slice/backdrop layers stay resident, so unloaded
  areas still answer at region resolution and every consumer keeps the same signatures.
- Buildings: walls follow the true footprint; pitched roofs come from a straight skeleton (`src/world/roof.ts`, unit-tested)
  with gable folding. Raised houses (pilings), porches, stoops, railed stairs are in `buildings.ts`; their collision goes out
  as `colliders` (walls with a feet-height band + ramp decks) and is registered in `main.ts`.
- Asset kit (`src/assets/kit.ts`, viewer `/kit.html` with GLB export): cars, boats, planes and rocks are built from recipe + seed → validated proportions → geometry.
  - Convention: non-indexed; vertex `color` (white = tint by instance colour); `aPart` (3 = head/nav lights, 4 = tail lights); front toward −z; origin on the ground or waterline.
  - Draw one InstancedMesh per type from `carLib`/`boatLib`/`rockLib`. Pick types with `carMix(region, climate)` / `boatMix(climate)`; never with per-town lists.
  - **In tile builders, `.clone()` the library geometry.** Pack transfers the buffers, so a shared cached geometry detaches and later tiles throw DataCloneError.
  - `vehicles.ts` finds driveway cars by the `parked-cars:<type>` mesh-name prefix.
- Interiors: `planInterior` works on any polygon (local-frame spans), stair flights get stairwell holes + height-banded rails
  (`registerPlan`); the on-demand mesh + furniture kit + per-room paint/floor uniforms live in `interiors.ts`.
- Collision: `WalkWorld.move(x,z,dx,dz,r,feetY)` — walls may carry a y-band; floors may have holes; `ground: true` floors
  (raised houses) keep the terrain walkable underneath. `interiorAt(x,z,feet)` = the building whose rooms you're in.
- Freeze hunting: `node tools/soak.mjs --region=<id> --seconds=120` drives the game (doors, stairs, streets, flight) and
  reports stalls/hitches/page errors. The frame loop schedules itself first and survives exceptions (counted in `__RENDER_INFO__.errors`).
- Shots beyond the ocean/bridge set: `houses, porch, shop, sign, raised, roofs, doorway, inside, inside-night, stairs, upstairs`.
- Visual check: `node tools/capture.mjs --shots=ocean-golden,ocean-night,bridge-golden [--region=<id>]`
  → `shots/<region>-montage.jpg` (one JPEG contact sheet — agents: read ONLY this file, never the
  per-shot PNGs; `--montage=only` skips writing PNGs). Also `top:x:z:alt` top-down, `--eval="…"` to poke
  `window.__GAME__`. Uses Playwright from `../../shot-harness`.
- No Playwright? (agent driving the built-in/live browser): open `?capture=1&region=<id>`, then
  `await import('/tools/inpage-montage.js')` and `await __MONTAGE__([shotName | {label, fn(game)}], {save:'x.jpg'})`
  — the dev server's `/__shot` sink (vite.config.ts, serve-only) writes `shots/x.jpg`. Emulate a
  landscape viewport (e.g. 1600×900) first; the canvas is the capture size.
- Shader varyings that carry ids/seeds (`vInfo`, `vTan`, `vOut`) must be `flat` — interpolated ids
  (up to ~8.5 M) drift per pixel and every `seedOf(id)` choice shimmers (the old window flicker).
- Vehicles: `src/player/vehicles.ts` — E enter/exit, V car, B boat, N plane; driveway cars (props'
  `parked-cars` InstancedMesh) are enterable. While riding, `Vehicles.update` owns the camera and
  carries the walker (streaming/life/interiors key off it); `walker.update` is skipped.
- LiDAR runs in its own worker (`lidar.worker.ts` → `lidarCell.ts`: EPT reads, rasters, fits,
  `detectBuildings`, `detectTrees`), spawned by the stream and wired to the tile worker with a
  MessageChannel; `lidar.ts` (tile worker) owns the IDB cache and applies results.
- Ground paint: `groundPaint.ts` windows `detail` (300 m) + `mid` (1.6 km) re-centre on the
  walker and paint baked + streamed-tile features (stream `onTile`/`onUnload` →
  `paint.setTile/dropTile`); the shader applies them everywhere.
- Measured buildings: `src/world/lidar.ts` (worker IO: bundled 3DEP project index, EPT octree
  reads from the public `usgs-lidar-public` S3 bucket, laz-perf WASM in `src/vendor/laz-perf`,
  IndexedDB cache per cell `lidar|vN|…`) → `lidarCore.ts` (pure: projections, index lookup,
  1 m HAG grids) → `measure.ts` (pure roof fits). `enrichTile` writes `h/eav/roof/ms` onto real
  buildings before `buildTile`; a late read flags `tile.late` → stream relief rebuild.
  The same read plants real trees (`detectTrees` → `TileJson.trees/treeCov` → props, which
  keeps the WorldCover scan only where the survey has no coverage).
  `?lidar=0` disables. Bump `VER` in lidar.ts whenever measure/raster/tree logic changes.
  Worker notes: page console + `__GAME__.stream.workerLog`.
- Dev server is HTTP/1.1: slow `/__tiles` calls starve other same-origin fetches — anything the
  worker needs early ships in its bundle. Occluded browser panes stop rAF: montage with
  `{timers: true}`.
- Grass: `src/world/grass.ts` — player-centred tuft cells, masked by `GroundPaint.grassMask`
  (grows only where the painted ground is open/green). Walks start at today's sunrise (`?hour=`).
- Local frame: +x east, +z south (north = -z), metres, per-region origin from config.
- All materials are custom ShaderMaterials sharing uniforms in `src/render/shared.ts`; the look lives in `src/render/post.ts`.
- Region identity (name/tz/spawn/labels/style) travels in `world.json`/`manifest` `meta` — runtime code must not
  hardcode place names. Virtual manifests must emit `meta.style` too (derive from `?at=` via the same LUT —
  see `docs/ASSET_FIDELITY.md` §4).
- Roadmap/working docs: `docs/earth/OPEN_WORLD.md` (phase list: H1✅ H2✅ H3-lite✅ → I style+recipe → J detail →
  J2 asset craft → L measured tier → K life), `docs/earth/LOG.md` (session log + queued bugs), 
  `docs/earth/PROGRESS.md` (tracker), `docs/earth/REVIEWER.md` (expert-review history — keep scores/rationale
  consistent), `docs/ASSET_FIDELITY.md` (data/builder upgrade plan for J2/L).
