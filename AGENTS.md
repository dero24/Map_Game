# map_game — watercolor walks in real places

- Play: `npm run dev` → http://localhost:5173 (click "Begin walking"). Prod: `npm run build && npm run preview` (:4173).
- Regions: `?region=<id>` selects the town; the intro lists all baked regions. Adding a town = one
  `REGIONS` entry in `scripts/config.mjs`, then `npm run fetch -- --region=<id>` and `npm run bake -- --region=<id>`.
  Region spec fields (slice/backdrop/origin/tz/oceanEdge/spawn/roads/shoreLabel/landmarks) are documented there.
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
- Real-lite tiles (open world, `worker/`): `cd worker && npx wrangler dev` → `http://localhost:8787`. On localhost
  the game auto-defaults `tiles` to that base (`?tiles=` explicit overrides, `?tiles=off` disables; a `/health`
  probe falls back to pure procedural with a toast if no worker answers). `?at=lat,lon` beyond every baked
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
- Local frame: +x east, +z south (north = -z), metres, per-region origin from config.
- All materials are custom ShaderMaterials sharing uniforms in `src/render/shared.ts`; the look lives in `src/render/post.ts`.
- Region identity (name/tz/spawn/labels/style) travels in `world.json`/`manifest` `meta` — runtime code must not
  hardcode place names. Virtual manifests must emit `meta.style` too (derive from `?at=` via the same LUT —
  see `docs/ASSET_FIDELITY.md` §4).
- Roadmap/working docs: `docs/earth/OPEN_WORLD.md` (phase list: H1✅ H2✅ H3-lite✅ → I style+recipe → J detail →
  J2 asset craft → L measured tier → K life), `docs/earth/LOG.md` (session log + queued bugs), 
  `docs/earth/PROGRESS.md` (tracker), `docs/earth/REVIEWER.md` (expert-review history — keep scores/rationale
  consistent), `docs/ASSET_FIDELITY.md` (data/builder upgrade plan for J2/L).
