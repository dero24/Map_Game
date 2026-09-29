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
  + height-banded rails (`registerPlan`); the on-demand mesh + per-room paint/floor uniforms
  live in `interiors.ts`, furniture from the `decor.ts` foundry family.
- Ground-floor role follows the business (`useOf`): café (counter, pastry case, bistro sets),
  diner for restaurants/bars (vinyl booths, counter + stools, menu board), office/civic (desks,
  monitors, office chairs), shop for groceries (stocked gondolas).
- Sun pools: the interior shader traces the sun ray to the outer wall (`uDims`) and lights the
  floor where it passes a window band (0.9–2.25 m, 2.7 m cells).

## Collision

- `WalkWorld.move(x,z,dx,dz,r,feetY)` — walls may carry a y-band; floors may have holes;
  `ground: true` floors (raised houses) keep the terrain walkable underneath.
- `interiorAt(x,z,feet)` = the building whose rooms you're in.

## Vehicles

- `src/player/vehicles.ts` — E enter/exit. Your own rides are painted with the brush (below); driveway
  cars (props' `parked-cars` InstancedMesh) and kerb cars are enterable. The old free summons (V car,
  Shift+B boat, N plane) are a developer switch: panel → Debug → free rides.
- While riding, `Vehicles.update` owns the camera and carries the walker (streaming/life/
  interiors key off it); `walker.update` is skipped.

## Ambient life + sound

- Knockdowns: `Vehicles.onMove` → `LifeClient.bump` (throttled ~11 Hz) → worker `lifeSim.bump`: walkers in the car's path go `DOWN` — thrown with the car, slide with friction, lie 3–5 s (rolled on their side by the renderer, `amt −1`), snap back to the nearest walkable edge and walk on. `onBumped` plays a thud.
- Business use: `Building.u` carries the OSM amenity / shop / office / craft value (bake: building tags or a POI inside; real-lite: building tags or a named business node inside the outline, which also names it and makes a house-sized footprint a storefront). `useOf(name, tag)` reads the tag first — the same values in every language — and a multilingual name vocabulary (en/es/fr/it/de/pt) only as a fallback. `Footprint.use` / `Door.use` carry it to consumers.
- Street rhythm: `LifeInit.rhythm` (`rhythmFor(climate, coastal)`): *shore* (the beach crowd builds to mid-afternoon), *town* (commute, lunch, errands, evening stroll), *desert* (busy early and after sunset, a midday lull).
- Downtown: café terraces at commercial doors whose use (`world/uses.ts` `useOf(name, Door.use)`) is café/restaurant/bar — table sets, parasols in warm climates, seated guests (`SEATED` define, one instanced draw, hidden at night); curbside parking on wide streets (enterable).

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
  - `fauna.ts`: 9 animals (incl. red fox, red-tailed hawk) on one jointed body plan + `birdGeometry` + `critterMaterial`;
  - `decor.ts`: the furniture family for interiors and terraces (sofa, armchair, bed, tables, chairs, bistro and office chairs, monitor, lamps, café counter, booth, stocked shelves, plants, ceiling fan, storage bench, `cafeSet`), rounded boxes (one bevel segment; plain boxes under 1.5 cm radius) and tapered legs, merged by `mergeDecor` or placed by `piece()` in `interiors.ts`; per-piece vertex budgets in `tests/foundry.test.ts` (a sofa < 4000, a chair < 1500);
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
- Wildlife (`src/sim/critters.ts`) is a main-thread sim within ~90 m of the walker. Behaviour is per *role*; the species filling each role comes from `faunaMix(region, climate)` (`env.region/climate` from the region style), so a desert walk meets jackrabbits, quail, a roadrunner and a coyote with no new code. Burrowers dive down a burrow (despawn) when startled. Habitat comes from tree instances, land cover (`field()`: lawn, meadow, shrub, crops, bare desert), the ocean edge and gardens. Behaviours: wander, flee, climb, flush, drift, and the ecosystem states stalk/pounce (fox), soar/stoop/rise (hawk). Threats: the walker, predators, and `env.movers` (traffic from `LifeClient.movers` plus the player's ride via `Vehicles.onMove`). Alarms spread (`alarm` delay). `critters.eco` tallies hunts, catches and scares. Animals are drawn 1.3–2× life size on purpose.
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

## The brush (`src/ui/brush.ts`, `src/player/place.ts`) — `docs/GAME_DESIGN.md`

- Paint-to-own: a coloured Almanac card (painted from life with P — `Commissions.paintFrame`, which
  records `pt` and `fresh`) is a kind you can paint: `Commissions.owned(families)`. The families the
  brush knows are `PAINTABLE` (boat, car; planes once airfields have planes to paint from life).
  A painting teaches sparingly: the first, the one most prominent kind (≥ 1.5% of the frame); after
  that only composed ones (≥ 4% each, at most 3, not already painted) — the rest stay pencil.
- B (✎ on touch) takes it out. Chips: the kinds you own (last used first), the one fitting what you
  aim at picked for you until you pick by hand (water → boat, a street → car); a pencil chip for a
  family you don't own yet says where the nearest real one is.
- Aim: the screen centre (locked mouse), the cursor (unlocked), a tap (touch; it stays put).
  `cast()` marches the view ray over terrain / water (y = max(h, 0)) and roofs, 160 m.
- Placement: the pure solvers in `place.ts` (`placeBoat`, `placeCar`) over `Vehicles.placeWorld`;
  a boat asks for its own hull's room (`Hull`, from `kit.ts boatDims`: a skiff lies near the bank).
  The brush's `free` keeps it off what's there (other boats: hull room + 3.2 m; cars 4.2 m), in view
  and clear of the bar's own rectangle, not under a nearer boat or car on screen nor behind a
  building, and — a boat — with footing in boarding reach; tried near-and-clear first (20 m), then
  near with an edge hidden, then out to 40 m. The developer summons use the same solvers.
- The sketch is `Vehicles.build(kind, model, colour, seed, mat)` in `propMaterial({ wash: true })`,
  in the brush's own scene (`Brush.scene`/`overlay`), drawn by post.ts's sketch pass over the
  painting (rendering.md): paper and hatched strokes, a boiling graphite outline, dashed where
  something's in front, the world paling round it (`U.uBrush`). A click / a tap on the sketch starts
  the wash from that point (`uWashAt`; `WASH_S` 1.3 s, rubbing up to 3×, `walker.holdLook` holds the
  view): wet (darker, richer, bleeding) → `Vehicles.paint()` → it dries over `DRY_S` 0.9 s
  (`uWash`: the sketch lifts off the real boat as it settles), a ripple ring (`U.uRipple`), a 6°
  push-in (`walker.zoom`), the 'settle' and chime sounds. Painted things start bold (one of four
  colours per kind). Walk into your boat from the water's edge to board it (`Vehicles.walkIn`).
- Keys while it's out: 1–9 / wheel choose, R / Shift+R turn (a car takes the other lane), C colour,
  Esc / right-click put away. Hints: "P — paint that boat from life" (until you own one), then
  "B — your brush" (until you've painted once).
- Harness: `window.__BRUSH__` (open / close / aim(x, z) / choose / paint / state); `__GAME__.brush`;
  `tools/brush-check.js` → `__BRUSHCHECK__()` measures the reviewer's readability bar on the frame
  (the sketch's share of it, how much is hidden through the wash, ΔE sketch → dry) — debugging.md.

## The sketchbook layer (`src/ui/`)

- `ctx.ts` is the only view the UI gets of the game (`GameCtx`, built in `main.ts`).
  `instances(prefix,…)` finds visible kit instances by mesh-name prefix:
  - `parked-cars:`, `moored-boats:` (tile props); `kerb-cars:` (the city's kerb and lot cars)
  - `life-car:`, `life-boat:` (ambient life)
  - `ride-car:`, `ride-boat:`, `ride-plane:` (player vehicles)
- `photo.ts`: P frames the view, Space paints a page (the grab happens in `afterRender()`, right
  after `post.render`, so no `preserveDrawingBuffer` is needed), then a caption is added and it is
  stored via `book.ts` (IndexedDB `map-game-sketchbook`).
- `commissions.ts`: three active offers, generated from what's really near (named footprints, POIs,
  moored boat types) plus scenes (sea at golden hour, fog, sunrise, lamps, rooftops). `judge()`
  checks the camera frame and conditions at shoot time. It also keeps the spotting log and the
  **Almanac**: every family (cars, boats, planes, wildlife, trees, garden plants) is a set of cards;
  a card records where and when it was first seen (`state.seen`) — coloured in once painted from life, when the brush can paint it — and each town you reach gives
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
