# Gameplay systems — buildings, interiors, collision, vehicles, life, asset kit, the sketchbook layer

Read this when the task touches building/prop geometry, interiors, collision, rideable
vehicles, ambient life, the asset kit, or the player-facing layer (explore/paint-in, photo mode,
sketchbook, commissions, atlas map + search, hints, arrival cards, sound).

## Buildings

- Walls follow the true footprint; pitched roofs come from a straight skeleton
  (`src/world/roof.ts`, unit-tested) with gable folding.
- Raised houses (pilings), porches, stoops, railed stairs are in `buildings.ts`; their
  collision goes out as `colliders` (walls with a feet-height band + ramp decks) and is
  registered in `main.ts`.

## Interiors

- `planInterior` works on any polygon (local-frame spans); stair flights get stairwell holes
  + height-banded rails (`registerPlan`); the on-demand mesh + furniture kit + per-room
  paint/floor uniforms live in `interiors.ts`.

## Collision

- `WalkWorld.move(x,z,dx,dz,r,feetY)` — walls may carry a y-band; floors may have holes;
  `ground: true` floors (raised houses) keep the terrain walkable underneath.
- `interiorAt(x,z,feet)` = the building whose rooms you're in.

## Vehicles

- `src/player/vehicles.ts` — E enter/exit, V car, B boat, N plane; driveway cars (props'
  `parked-cars` InstancedMesh) are enterable.
- While riding, `Vehicles.update` owns the camera and carries the walker (streaming/life/
  interiors key off it); `walker.update` is skipped.

## Ambient life + sound

- Pure sim in `src/sim/lifeSim.ts` (testable), worker wrapper `ambient.worker.ts`,
  renderer/client `life.ts`, shared layout `protocol.ts` (SAB when cross-origin isolated,
  transferable copies otherwise). Sound: `src/audio/ambience.ts` (all synthesized).

## Asset kit (`src/assets/kit.ts`, viewer `/kit.html` with GLB export)

- Cars, boats, planes and rocks are built from recipe + seed → validated proportions →
  geometry.
- Conventions: non-indexed; vertex `color` (white = tint by instance colour); `aPart`
  (3 = head/nav lights, 4 = tail lights); front toward −z; origin on the ground or waterline.
- Draw one InstancedMesh per type from `carLib`/`boatLib`/`rockLib`. Pick types with
  `carMix(region, climate)` / `boatMix(climate)`; never with per-town lists.
- **In tile builders, `.clone()` the library geometry.** Pack transfers the buffers, so a
  shared cached geometry detaches and later tiles throw DataCloneError.
- `vehicles.ts` finds driveway cars by the `parked-cars:<type>` mesh-name prefix.

## Paint as you explore (`src/world/explore.ts`)

- Where you've been is a sparse bitmap on a **global** grid: Web-Mercator metres, 8 m cells,
  32×32-cell blocks. It survives re-anchoring, teleports and region changes. Blocks persist to
  IndexedDB (`map-game-explore`).
- A walker-centred R8 texture window (4 km, 8 m texels → `U.uExplore` / `U.uExploreBox`) feeds
  the post composite, which draws unvisited ground as graphite hatching on paper and blooms colour
  in with a noisy wet edge (`postParams.sketch`, panel "paint as you explore", `?sketch=0`).
- Capture mode keeps regression shots fully painted unless `?sketch=1`.
- Reveal radius grows with eye height (`revealRadius`), so flying paints wide.
  `paintedBefore(x,z)` reads the saved block, which is how an arrival card knows a first visit.

## The sketchbook layer (`src/ui/`)

- `ctx.ts` is the only view the UI gets of the game (`GameCtx`, built in `main.ts`).
  `instances(prefix,…)` finds visible kit instances by mesh-name prefix:
  - `parked-cars:`, `moored-boats:` (tile props)
  - `life-car:`, `life-boat:` (ambient life)
  - `ride-car:`, `ride-boat:`, `ride-plane:` (player vehicles)
- `photo.ts`: P frames the view, Space paints a page (the grab happens in `afterRender()`, right
  after `post.render`, so no `preserveDrawingBuffer` is needed), then a caption is added and it is
  stored via `book.ts` (IndexedDB `map-game-sketchbook`).
- `commissions.ts`: three active offers, generated from what's really near (named footprints, POIs,
  moored boat types) plus scenes (sea at golden hour, fog, sunrise, lamps, rooftops). `judge()`
  checks the camera frame and conditions at shoot time. It also keeps the spotting log.
- `atlas.ts` (M, or G to jump straight to search) has four pages:
  - Map (`mapview.ts`): pencil for unvisited, paint where explored; pins; drag, zoom, click to walk.
  - Sketchbook, with a lightbox (walk back / download / remove).
  - Commissions and the spotting log.
  - Journal: keys, stats and found places (`journal.ts` now renders only this page).
- `geo.ts`: Photon (komoot) geocoder for search and reverse lookup. It is cached, reverse lookups
  are throttled to one every 4 s, and it falls back to local streets, buildings and POIs when
  offline. Never block gameplay on it.
- `hints.ts`: providers return `{key, text, pri, once?}`, and the highest `pri` wins. `once` tips
  retire after 3 showings (localStorage). `arrival.ts` shows reverse-geocoded town cards at the
  start, on crossing into a new town, and after teleports.
- Sound (`ambience.ts`): `ui()` for brush, shutter, chime and page; halyards and lapping water
  near moored boats; leaves by tree cover; birdsong by hour; engine models for car, outboard and
  propeller (`vehicles.ride`).
