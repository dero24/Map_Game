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

## Asset foundry (`src/assets/`, workbench `/kit.html`)

Design and reasoning: `docs/ASSET_FOUNDRY.md`.

- `core.ts` holds the primitives:
  - shapes: part/merge/box/profile/lathe/limb/blob/card;
  - growth maths: GOLDEN, fibCount, fibSphere, taper;
  - `hashf`, `variantAt`, `validGeometry`, `cached`.
- Families:
  - `kit.ts`: cars (+ gear), boats, planes, rocks;
  - `flora.ts`: 7 tree species × 3 variants (`treeMeta` gives real dims), 12 garden species with growth stages, `plantMix`, `inBloom`;
  - `fauna.ts`: 7 animals on one jointed body plan + `critterMaterial`;
  - `people.ts`: one jointed person (~1.4k verts) for walkers and residents. Skin, hair and trouser palettes, 5 hairstyles, shorts/sleeves by `warmthFor(climate, month)` — all chosen per instance in the shader (`PEOPLE` define in `creatureMaterial`, marker vertex colours `MARK`), so a crowd is one draw;
  - `furniture.ts`: mailboxes, beach set, picnic table, car gear + `gearFor`.
- Lot dressing (NA): `buildings.ts` lays a generated drive (a 2.9 m strip in `walks`) beside the front walk where the map has no service way near the door, and emits `drives`; `props.ts` parks a car at the house end (never on paved ground or the sidewalk strip). Doors also get hedges or `fence:picket` runs.
- Conventions:
  - Non-indexed; vertex `color` (white = tint by instance colour); `aPart` channels: 0 body, 1/2 fore/hind limbs, 3 lights/glow, 4 tail lights, 5 tail, 6 head, 7 wings, 8 blossom. Animals also carry `aPivot`.
  - Front toward −z; origin on the ground or waterline.
- Variety budget: per-instance scale/colour first (free), then discrete variants (+1 draw each), then add-on model keys, then state rebuilds. Vertex budgets are enforced in `tests/foundry.test.ts`. World garden beds use the `lite` genome.
- **In tile builders, `.clone()` library geometry.** Pack transfers the buffers, so a shared cached geometry detaches and later tiles throw DataCloneError.
- Placement:
  - Choose variants by position (`variantAt`) and mixes by region/climate tables (`carMix`, `boatMix`, `plantMix`, `gearFor`). Never per-town lists.
  - Name each InstancedMesh `family:type[:variant]`:
    - `trees:`, `garden:`, `mailbox:`, `beach:`, `picnic:`, `parked-cars:<type>[:<gear>]`, `moored-boats:`, `rocks:` (tile props);
    - `critter:` (wildlife);
    - `plant:` (the player's garden).
  - The spotting log, commissions, hints and critter habitat all find things by these prefixes. A vehicle model string may carry gear: `suv+surf`.
- Wildlife (`src/sim/critters.ts`) is a main-thread sim within ~90 m of the walker. Habitat comes from tree instances, land cover, the ocean edge and gardens. Behaviours: wander, flee, climb, flush, drift. Animals are drawn 1.3–2× life size on purpose.
- Grow verb (`src/ui/garden.ts`): R plants, Shift+R picks the next seed. Plants grow while you play (about 20 min) and while you're away (IndexedDB `map-game-garden`). Each bed adds a collider and clears the grass.

## Paint as you explore (`src/world/explore.ts`)

- Where you've been is a sparse bitmap on a **global** grid: Web-Mercator metres, 8 m cells,
  32×32-cell blocks. It survives re-anchoring, teleports and region changes. Blocks persist to
  IndexedDB (`map-game-explore`).
- A walker-centred R8 texture window (4 km, 8 m texels → `U.uExplore` / `U.uExploreBox`) feeds
  the post composite, which paints unvisited ground as a paler, slightly desaturated first wash and
  deepens it with a noisy wet edge as you arrive (`postParams.sketch`, `?sketch=0`). Never a
  pencil sketch: the world always reads as painted.
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
  checks the camera frame and conditions at shoot time. It also keeps the spotting log and the
  **Almanac**: every family (cars, boats, planes, wildlife, trees, garden plants) is a set of cards;
  a card records where and when it was first seen (`state.seen`), and each town you reach gives
  a stamp (`state.stamps`, from `ctx.locality()` / `ctx.region()`). New families only need an
  entry in `FAMILY` and a mesh-name prefix in `spot()`.
- `cardArt.ts`: an Almanac card picture for any foundry model — rendered once to a 256 px target,
  finished as a watercolour plate on a 2D canvas, cached (`ctx.cardArt(family, type)`).
- `atlas.ts` (M, or G to jump straight to search) has five pages:
  - Map (`mapview.ts`): pencil for unvisited, paint where explored; pins; drag, zoom, click to walk.
  - Sketchbook, with a lightbox (walk back / download / remove).
  - Commissions and the spotting log.
  - Almanac: stamps, progress in the current county, and the card grid.
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
