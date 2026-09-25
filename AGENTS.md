# map_game — watercolor walks in real places

- Play: `npm run dev` → http://localhost:5173 (click "Begin walking"). Prod: `npm run build && npm run preview` (:4173).
- Regions: `?region=<id>` selects the town; the intro lists all baked regions. Adding a town = one
  `REGIONS` entry in `scripts/config.mjs`, then `npm run fetch -- --region=<id>` and `npm run bake -- --region=<id>`.
  Region spec fields (slice/backdrop/origin/tz/oceanEdge/spawn/roads/shoreLabel/landmarks) are documented there.
- Typecheck: `npm run typecheck`. Tests: `npm test` (vitest: rng, sun ephemeris, LifeSim determinism/behaviour). Build must pass before handing off.
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
- Region identity (name/tz/spawn/labels) travels in `world.json` `meta` — runtime code must not hardcode place names.
