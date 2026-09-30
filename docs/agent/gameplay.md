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
  - A raised house's stair takes the first shape whose flight, and the metre past its foot, stands
    clear of every other footprint (`C.rings`). The order is along the wall, round the side, a
    switchback, then straight out. Round the side also needs a walkway beside the flight, since its
    foot faces the back. None clear: the least-blocked shape.
- Buildings inside buildings (`nest.ts`, run first in `buildBuildings`). A standing building
  ≥ 90% inside a larger one rises from its roof as a part of it (`lf`, `pt`, `po`) or, if no
  taller, is hidden (`in: 1`: no walls, footprint or door). This covers towers mapped tier by tier
  from the ground (the wedding cake), a building mapped twice, and a LiDAR block across a mapped
  one. It is pure and idempotent. Margin context (`own: 0`) is read, never changed.
- Where a stand-in meets a real cell, the stand-in's copies of the real cell's buildings hide
  (`seams.ts` `seamDuplicates`, `stream.ts` `reconcileSeams`). Stand-in footprints register in
  scopes of their own for this.
- Front doors (`pickDoorWall`) go only on a wall whose outside is open ground. It's probed
  across the opening from 0.3 m inside the wall to 2.2 m out, against the walkable buildings round
  it, the tile's margin neighbours included (`doorOpen`, `solid`). From inside the wall because an
  outline overlapping the front (a terminal under a tower) stands its wall across the doorway.
  - It tries the seeded spot along the wall, then its middle, then near each end.
  - No wall open: no door and no interior. The building stays solid rather than a room you
    can't leave (Robby, downtown Seattle: doors on party walls and on the back of the building in
    front).
- Building parts (realTile's part join): an outline drawn by its parts (`hp`) when they cover its
  ground, or when a lifted part overhangs it and something stands under it (the Space Needle's
  saucer). Otherwise it's a podium, capped under the lifted parts. LiDAR never measures an outline
  that parts stand on.

## Interiors

- Two stages (docs/INTERIORS_PLAN.md, Slice 1 "rooms, not halls"):
  - Stage A, `interior/plan.ts` `planInterior` (tile worker, in `BuiltTile`): the shell — storeys,
    real stairs (domestic riser ≤ 0.196 m, going 0.26; office ≤ 0.178 / 0.28; straight or dogleg)
    with stairwell holes, a house's hall strip, a block's corridor by depth (none ≤ 9.1 m,
    single-loaded to 14, double-loaded on the centreline to 24, a ring round a core beyond), an
    office's core (15–30% of the plate), flats over a shop. `registerPlan` puts the floors, flights,
    landings and stair walls into the tile's collision scope.
  - Stage B, `interior/layout.ts` `layoutSteps`/`layoutInterior` (on activation, a storey a step):
    rooms as rectangles per family (a house's rooms off its hall, a block's flats — hall, bath,
    kitchen inboard, living room and bedrooms on the facade — off corridor or landing, an office's
    core pieces, meeting rooms and desk benches, a shop's back of house), walls where rooms of
    different spaces meet, doors (0.9 into a flat, 0.8 inside, ≥ 0.3 from corners, clear of the
    stairs), every room reachable from the front door. Partitions only meet the facade between
    windows (`endOK` mirrors the shader's `windowAt`). `registerLayout` puts exactly the drawn walls
    into the interior's own collision scope (−7, `WalkWorld.withScope`; dropped with a purge on
    leaving) — never onto the walker: a wall within 0.45 m of them gets a doorway where they stand.
  - `interior/mesh.ts` (chunked vertex streams, the shell, stairs, partitions with cased doorways,
    the room map — a texture of which room each floor/wall point is in, painted per room by the
    shader — and the instancer: a repeated piece is one InstancedMesh tinted per instance; its
    white and white-shaded grey parts take the tint) and `interior/furnish.ts` (furniture by room
    type) build the mesh as generator steps the pump runs ≤ 3.5 ms a frame. Piece keys must fully
    determine their geometry (the piece cache is shared across builds).
  - Budgets (`tests/interiorBudget.test.ts`): no step over 8 ms, ≤ 120k vertices (a house 40k),
    ≤ 60 draws, a tall building ≤ 3 storeys built; layout rules in `tests/interiorLayout.test.ts`;
    `npx tsx tools/bench-interiors.mts`.
- Tall buildings (Slice 3, `tests/interiorTower.test.ts`): plan.ts `tall` — ≥ 5 storeys, or more than
  12,000 m² of floor. Every storey exists: n = floor((top − floor0 + 0.2) ÷ fH), the facade's window
  rows (a 150 m office tower: 39).
  - Stage A stays one storey's worth: stacked stairs (`Stacked.rep`/`every`; `unstack(P, k0, k1)`
    lays out a window's), lifts (`Plan.lifts`: the shaft rect, its door face, cars, the lobby in front)
    — an office tower's bank across its core's end nearer the door (a 3.2 m lift lobby across the
    core, open at both ends, the dogleg beyond; cars = clamp(round(gross ÷ 4,000 m²), 2, 8)), a
    block's lift beside its core stair, a free-standing shaft on an open plan (`openLift`). An office
    of ≥ 6 storeys gets a double-height lobby (`Plan.atrium`: a storey-1 hole from the door's wall to
    a 1.6 m gallery along the core, a rail round it). A tower on a podium: `Footprint.tiers` (lifted
    building parts, `buildBuildings`) → `Plan.plates` (from which storey each tier's plate holds the
    rooms; the core fits the top one).
  - Collision (`registerPlan`): a stacked flight or landing is one deck with `rep` copies
    (`Deck.rep`/`dy`); stacked stairwells and lift shafts are `Floors.shafts` (no floor from storey
    `from` to `to`); `Floors.tiers` (a storey only inside its tier's ring) plus the tier's outline as a
    wall from its first storey; lift shafts walled all round at every height (`floorAt` answers all
    of it).
  - Build window (`interiors.ts`): the walker's storey ± 1 (≤ 3) laid out, walled (scopes −7/−8 in
    turn), meshed and furnished; the next window builds behind the standing one and swaps in whole
    (`standUp`); past 60% of a flight it re-centres. Each storey draws its layout, paint, furniture
    and residents from seeds of its own, so it looks the same from any window (no pop on the stairs).
  - Lifts (`player/lift.ts`, `ui/lift.ts`): L in a lift lobby (`liftAt`) opens a floor chooser (↑↓ or
    W S, PgUp/PgDn, digits, L/Enter, Esc). The ride is a real one: the nearest car's landing doors
    slide open (`liftDoor`: the 'liftLeaf' instances, always instanced — `mesh.ts` MOVING), the car
    stands in the shaft (`showCar`: its body and own doors, its floor a deck in scope −9, its lamp),
    you step in and turn round, the doors shut, your feet go to floor0 + k × fH and the window
    re-centres there under them (the ride holds for `ready(k)`), the display counts the floors, the
    doors open and you step out 1.3 m. `interiors.riding` keeps `settleWalker` off meanwhile; a
    teleport just ends the ride; a building dropped mid-ride puts you out of the doors on its floor.
    HUD: "floor 24 of 39".
  - Facades: a curtain wall's slabs are `windowAt`'s floorH (3.8 m commercial, 3.1 m flats) — the
    interior's storeys; inside, the glass runs floor to ceiling between mullions every 1.5 m from the
    wall's start, and partitions meet it on a mullion. Tall commercial blocks (≥ 8 storeys) and every
    curtain wall map offices behind their glass (`room()`: a suspended ceiling with rows of light
    panels, desks and screens), lit floor by floor at night.
- Ground-floor role follows the business (`useOf`): café (counter, pastry case, bistro sets),
  diner for restaurants/bars (vinyl booths, counter + stools, menu board), office/civic (desks,
  monitors, office chairs), shop for groceries (stocked gondolas).
- Sun pools: the interior shader traces the sun ray to the outer wall (`uDims`) and lights the
  floor where it passes a window band (0.9–2.25 m, 2.7 m cells).
- Only on foot: driving or flying (`interiors.update(..., onFoot)`), no interior activates; a build
  in progress drops, and an open one goes once you're 30 m past its door. A downtown drive used to
  assemble an interior for every door it passed, with 70–200 ms spikes.

## Collision

- `WalkWorld.move(x,z,dx,dz,r,feetY)` — walls may carry a y-band; floors may have holes;
  `ground: true` floors (raised houses) keep the terrain walkable underneath.
  - A step longer than ¾ of the radius goes in pieces: in one, a slow frame at a run or a fast car
    landed past a wall's line and was pushed out on the far side, into the building.
- `interiorAt(x,z,feet)` = the building whose rooms you're in. `touching(x,z,r,feet)` = a wall
  within r at those feet. That's not `blocked`, which is true anywhere inside a footprint.
- `settleWalker` (`main.ts`: on every mount, and once a second on foot) steps you clear of a wall
  through your body or a solid footprint (no rooms, no pilings). An indoor walker stays put.
  Teleports never pick a door whose outside is a building or a wall.
- Stairs up a retaining wall (`retaining.ts` `wallStairs` → `stairColliders`): a ramp deck from
  the sidewalk to the landing, walls along its open side and past the landing. A retaining wall's
  own collider stops 0.4 m under its top, so from the landing you step over the coping onto the lot.

## Vehicles

- `src/player/vehicles.ts` — E enter/exit. Your own rides are painted with the brush (below); driveway
  cars (props' `parked-cars` InstancedMesh) and kerb cars are enterable. The old free summons (V car,
  Shift+B boat, N plane) are a developer switch: panel → Debug → free rides.
- While riding, `Vehicles.update` owns the camera and carries the walker (streaming/life/
  interiors key off it); `walker.update` is skipped.

## Hot air balloons

- **The family** (`assets/balloon.ts`): a ~2,800 m³ sport balloon from a seed — 12 or 16 scalloped
  gores, a pattern (gores / bands / chevron / harlequin) in 2–3 colours with a crown band, an inner
  skin in its own shade (look up from the basket), wicker basket, burner frame, cables; the flame
  is its own mesh (glow channel). Vertex colour, no tint: the brush picks the colours. Budget
  < 4,800 vertices (a handful in the sky at once; `tests/balloon.test.ts`).
- **Physics** (`player/balloonPhysics.ts`, pure): buoyancy of the envelope's hot air in ISA air
  (L = V·ρ·(1 − Tₐ/T)·g) against weight and quadratic drag, over the balloon's mass plus the air it
  carries (the seconds of lag you fly by); the burner heats, the fabric cools, the vent dumps. You
  can't steer: the basket takes up the wind at its height, plus a ±1.5 m/s "fan" (the stick). Let go
  of burner and vent and the assist holds the height you let go at (`hold`); `Vehicles.holdAt`
  flies to a height.
- **Winds aloft** (`world/wind.ts`): four layers (surface, 200, 600, 1,500 m) veering and
  strengthening with height, seeded by region (0.25°) and the world's UTC hour, eased hour to hour.
- **Riding** (`vehicles.ts`, kind `balloon`): Space / ▲ burn, C / ▼ vent, WASD / the stick the fan
  (relative to your look), V / ⤢ first ↔ third person, E / Get out · Jump out (over the side: fly
  on; the empty balloon holds a while, then comes down on its own). First person is your own look
  from the basket; photo mode works in the basket (P / ▣) — the best seat for a painting. The
  burner has a roar (`ambience.ts`). Boarding needs you at the basket, not flying over it.
- **Other people's balloons** (`world/balloons.ts` `AmbientBalloons`): each ~5 km cell of the real
  map (0.05°) rolls once per half hour of the world's clock — ~30% at dawn and dusk, ~10% by day,
  none at night (the world's hour gates it). A flight climbs, cruises on its layer's wind, then
  comes down on the nearest beach within 2.5 km of where the wind took it (else open ground within
  800 m, else it flies on out of sight), sits ~8 min envelope up (step in: it's yours —
  `Vehicles.o.ambient`), and packs away. Off in capture mode (they keep the real clock).
- **A first visit**: a balloon waits on the nearest beach within 1.5 km of the spawn
  (`Vehicles.giftBalloon`, once per browser; none inland).
- **Painting them**: a balloon in frame colours its Almanac card (`balloon:` / `ride-balloon:`;
  taught from further off than a car); the brush paints one on open ground (`place.ts`
  `placeBalloon`) in any colours — every ride's swatch row has a free colour picker, a balloon a
  second one for its stripes.

## Touch controls (phones, tablets)

- `body.touch` (a touch screen) shows the touch UI; `body.nomouse` (no fine pointer: a phone or a
  tablet) makes hints, toasts and the ride HUD name the touch buttons instead of keys — a
  touch-screen laptop keeps its key names. Both are set in index.html's boot guard.
- Walker (`player/controller.ts`): the left 45% of the screen is a floating stick (full push =
  run; flying, 4× speed), the rest drags the look (scaled by the panel's look sensitivity).
  `releaseTouches()` drops both (a pinch, the page going to sleep). `waitGround` holds walking
  while the cell underfoot isn't built (main.ts `groundCheck`); `climb` is ▲ ▼ while flying.
- The dock (`#touchui`): ✈ fly/land (a phone's landing waits for the street below), ⌂ search
  (focused in the tap, so iOS raises its keyboard), ☰ atlas, ▣ photo (the same as P: the brush
  away, a viewpoint faced), ✎ brush, ⋯ drawer (plant, next seed, +1 hour, options; any touch on
  the world closes it, and it closes behind an overlay), ⇅ lift in a lobby.
- The ride's own button (`#touch-action`, main.ts `touchActionState`): Drive / Board beside a
  ride, Get out / Jump out in one; a double-tap on the look side does it too, but gets you out
  only once stopped. `#ride-touch` holds the held buttons: ⇧ boost (car, boat), + − throttle
  (plane), ▲ ▼ climb/sink (flying on foot). A held button lets go when its finger lifts, it
  disappears, the window blurs or the page sleeps (`bindHold`, `releaseHolds`).
- Rides on the stick (`vehicles.ts` `stickAxes`): a 0.1 dead zone for steering/banking and 0.25
  along the throttle/pitch (a thumb steering sideways never touches the pedals), rescaled. Part
  way cruises at that share of the top speed and brakes that gently; keys are always ±1, so the
  keyboard's driving is unchanged. Plane: pull the stick back (down) to climb.
- Pinch: photo mode zooms (its fingers released from stick and look); the atlas map zooms about
  the fingers (`mapview.ts`). The page itself never zooms (`touch-action` in style.css; iOS's
  gesture events stopped in index.html — it ignores `user-scalable=no`).
- Sleep (`ui/lifecycle.ts`): hidden → sound suspended (phones; a PC tab sounds on), the life
  worker paused (everywhere), held input released; an iPhone's interrupted audio resumes on the
  next tap.
- The phone HUD (style.css; `body[data-ride]` = car / boat / plane / fly / near, set in
  `syncTouchControls`): upright, the ride's readout sits in the corner under the dock with its
  live numbers only (the ride's toast says how to drive), the place name keeps the left half
  while riding, and the hint ends short of whatever stands beside the dock. On its side, the
  hint is centred over the place name (over Get out while riding, clear of ▲ ▼ while flying), the
  readout sits beside the ride's buttons, and the map-data credit runs along the top edge (the
  bottom has no room for it). A geometry audit (HUD boxes, 10 phone sizes × both ways × 5
  states) found no overlaps — see docs/earth/LOG.md 2026-09-30.

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
  - `decor.ts`: the furniture family for interiors and terraces (sofa, armchair, bed, tables, chairs, bistro and office chairs, monitor, lamps, café counter, booth, stocked shelves, plants, ceiling fan, storage bench, `cafeSet`), rounded boxes (one bevel segment; plain boxes under 1.5 cm radius) and tapered legs, merged by `mergeDecor` or instanced by `interior/mesh.ts`, plus the plain-box pieces planned rooms repeat (kitchen run, workstation, door frame and leaf, WC, vanity, bath, wardrobe, dresser, bookcase, gondola, washer, lift doors, mailboxes, racking, range); per-piece vertex budgets in `tests/foundry.test.ts` (a sofa < 4000, a chair < 1500);
  - `people.ts`: one jointed person (~1.4k verts) for walkers and residents. Skin, hair and trouser palettes, 5 hairstyles, shorts/sleeves by `warmthFor(climate, month)` — all chosen per instance in the shader (`PEOPLE` define in `creatureMaterial`, marker vertex colours `MARK`), so a crowd is one draw;
  - `furniture.ts`: mailboxes, beach set, picnic table, car gear + `gearFor`.
- Lot dressing (NA): `buildings.ts` lays a generated drive (a 2.9 m strip in `walks`) beside the front walk where the map has no service way near the door, and emits `drives`; `props.ts` parks a car at the house end (never on paved ground or the sidewalk strip). Doors also get hedges or `fence:picket` runs.
- Keeping the way in clear while a tile builds (`tileBuild.ts`): the builders' scratch walk holds,
  unrecorded, the margin buildings' outlines, a 3.2 m apron in front of every door (`doorApron`),
  the tile's own footprints, and its stairs and landings (`deckKeepOut`, with 1.2 m past a flight's
  foot). Everything `props.ts` places with `walk.blocked` stays off them. What the tile's own buildings
  put round them (hydrants from its mailboxes, front hedges) stays in its own cell (`ownGround`),
  because the next tile's doors aren't in its scratch walk.
- Mapped fences get a gate where they cross a door's line within 6 m (`fenceGaps`). They also stop
  short of a stair or deck lower than their top that they cross or run within 80 cm of
  (`deckGaps`). Their walls block only up to their top, so a landing or bridge passes over.
- Posts keep out of the carriageway (`props.ts` `offCarriageway`): a signal mast, a stop sign, a
  hydrant, a main-street lamp, a mapped power pole or bin that lands in a street (a node mapped a metre in, a corner rule
  on a slanting arm) steps out past the kerb on its own side, and out of the next street at a
  corner; no sidewalk to be found, it isn't placed. A street-name pole stands clear of both streets
  it names, and beside the road where a street only changes its name (`signs.ts`). A car stopped
  dead on a post in its lane (`tools/playtest.js` `__ROADPOSTS__`, `__DRIVE__`'s `blocked`).
- Tall structures (`props.ts`): one mapped inside a standing building's outline stands on its roof
  (`roofUnder`: flat top, or a pitched roof's eaves). It is rooftop-sized (`ROOFTOP_H`) unless the
  map gives a height; a height past the roof counts from the street. Its collider starts at the
  roof. One in a door's way stands beside the door (`clearOfDoors`).
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
- Far cells: 64 m (8×8 fine cells), 32×32 to a block, keyed `f:bx,by` in the same store; each
  holds what photos painted there and the painted share of its fine cells (kept up as you walk and
  as blocks load). They feed the far window (`farTexture`, filled only while `explore.far` —
  main sets it with the far sketch). `valueAt` is walked or photo-painted, so the map shows both.
- Photos paint what they frame (the far sketch only; `ctx.paintView`, called from photo mode's
  shot): the frame's depth → world points (`render/seen.ts`) → `paintSeen` / `paintSeenSliced`
  (a slice a frame, ~4 ms). Each sample paints a disc its footprint wide (at least 1.5 cells);
  neighbours on one surface (`joined`: a smooth ramp in 1/depth, so ground at a grazing angle —
  not across a silhouette) are filled between; ground running on into the sky as a plane does
  continues to the sky cut while the terrain keeps it in sight (the sea to the horizon, not a
  plateau's hidden far side). Nearer than `SEEN_SPLIT` (2 km) it paints 8 m cells, past it far
  cells, out to `postParams.photoReach` (panel: "a photo paints out to", default and max
  `SEEN_REACH` = 22 km, level). The pinholes and hairline gaps a frame's sampling leaves between
  discs (the far "canvas clouds") are closed (`Stamps.close`: a bare cell with ≥ 5 of 8 stamped
  neighbours, far cells ≥ 4, twice) — an edge never grows, so what a building hides stays hidden.
  It blooms over ~2.4 s a cell, the farthest starting 2.2 s late (the colour runs out to the
  horizon). Walks' `painted` is untouched; `stats().photoKm2` counts what photos brought to full.
  Measured from a balloon at 150 m over Sea Bright: bare pixels in frame 0.1–0.4% out to 15 km
  (3–5% before the closing). The shot's toast says the reach and area, or where the pencil still
  is (`PhotoMode.pencilWay`); a painted-area milestone is said once (`milestone`).
- Walking paint (the far sketch) soaks in: strokes at 20 Hz (`TICK`), ~1.5 s blank to full
  underfoot, and the composite paints in two passes — a pale first wash over the pencil, then the
  pigment deepening — its edge ragged by paper and brush-stroke noise that never reaches bare
  paper or finished paint.

## The brush (`src/ui/brush.ts`, `src/player/place.ts`) — `docs/GAME_DESIGN.md`

- Paint-to-own: a coloured Almanac card (painted from life with P — `Commissions.paintFrame`, which
  records `pt` and `fresh`) is a kind you can paint: `Commissions.owned(families)`. The families the
  brush knows are `PAINTABLE` (boat, car, balloon — on open ground; planes once airfields have planes to paint from life).
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
  stored via `book.ts` (IndexedDB `map-game-sketchbook`). With the far sketch on, the same shot
  paints everything in frame into the world (`ctx.paintView`; toast "painted in what you framed
  — out to N km").
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
