# Gameplay systems — buildings, interiors, collision, vehicles, life, asset kit, the sketchbook layer

Read this when the task touches building/prop geometry, interiors, collision, rideable
vehicles, ambient life, the asset kit, or the player-facing layer (explore/paint-in, photo mode,
sketchbook, commissions, atlas map + search, hints, arrival cards, sound).

**The game's verbs and direction are `docs/GAMEPLAY_VISION.md`** (read it before any gameplay
work): the world blooms from pencil into colour on first sight (§1), pencil means collectable —
tap to paint it within ~30 m (§2), regional rares as data (§3), travel (§4), your own private
layer of the world (§6), one home behind every vehicle's door (§7), and §17's tiers: foundations
first, then the world looking right everywhere, then the game. This file describes what is built;
where the two disagree, the vision is the target and this file is the current state.

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
  - A raised house's door goes on a wall whose stair stands in the open (`raisedDoorWall` over
    `doorWalls`, the open walls best-facing first, up to 8); none: the least-blocked one. Every
    other building keeps `pickDoorWall`'s wall, `doorWalls`' first.
  - Under a raised house (review round 11, frame 5: "grass grows in the deep shade under the raised
    house") the ground is a parking pad, gravel or — within 400 m of the sea — sand, never its yard's
    lawn (`pads.ts` `underRaised`, a hash of where it stands: about two in five a pad). Every mounted
    tile's go to the painter (`main.ts` `onTile` → `groundPaint.ts` `setPads`, dropped with the tile),
    which fills the footprint with it after the yards (gravel lays its stones); the grass mask reads
    only green paint, so no blade grows there (`tests/raisedGround.test.ts`, the mask rastered from
    the painter's strokes).
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
  - Budgets (`tests/interiorBudget.test.ts`): no step over 8 ms, ≤ 120k vertices (a house 40k, a
    supermarket 90k), ≤ 60 draws, a tall building ≤ 3 storeys built; layout rules in
    `tests/interiorLayout.test.ts`; `npx tsx tools/bench-interiors.mts`. Instanced pieces take up to
    `MAX_INSTANCED` (47) draws; past it the rarest keys are baked into the merged mesh (the 120 × 40 m
    flats: 115.6k vertices in 50 draws).
- The way in (review round 10, must-fix 4: "the front door opens on a home"; `tests/interiorLayout.test.ts`,
  `interiorBudget.test.ts` "the way in", `tests/helpers/homes.ts`):
  - A cottage (plan.ts `COTTAGE`: ≤ 110 m² a storey, and wide enough for a living room of 3.2 m
    beside its stair and a bedroom beside that) has no hall. The strip from the front door is its living
    room (`Plan.cottage`): the kitchen at the back of it in the same space (no wall), or one `great` room
    when it's under 6.4 m deep; the stair up an inside wall of it; bedrooms, the bathroom (a WC behind
    the stair over a storey) off it — off its kitchen end where they can, else near the front, so the
    living room keeps a long wall for its sofa. Upstairs the landing is the stair's lane and a passage
    (`Plan.land`, its wall between windows); the rest of the strip is bedrooms.
  - A bigger house keeps its hall: the stair's foot no more than 40° off the door's axis (a door far
    across a wide hall pushes the foot further in), the living room on the passage side, opening off
    the hall through a cased opening of 1.2–1.6 m (`LIVING_OPEN`; no leaf over 1.15 m) whose middle is
    within 30° of the axis (`LIVING_ANGLE`: t − ud ≥ |v − vd| · cot 30°). A WC along a wide hall's
    passage side is passed over when it would leave that wall too short for such an opening.
  - The hall at the front door (`furnish.ts` `wayIn`): a bordered runner down its way past the stair, the
    console with its lamp lit (always) and a mirror over it on a wall ahead of the door (`bestAgainst`:
    the best spot by a score, not the first random one), coats on their rail by the door (a cottage hangs
    them in its living room). Pieces: `decor.ts` `coatRail` (3–4 turned coats of 0.9–1.1 m), `runner`,
    `consoleLamp`, `mirror`, `skirting`, `ceilingDome`.
  - Skirting (`skirtRoom`, before the furniture): 12 cm of trim white along every stretch of every room's
    walls, both faces of a partition, stopping at doorways — one 1 m piece stretched per stretch
    (`Instancer.put`'s `sx`), so a block of flats' thousands cost one draw.
  - Ceiling lights in a home: a glass dome, off by day in a room with windows (decor mat `lamp` → part
    `IP.night`, lit by `uNight`; its `Light.n` weighted by the night in `pickLights`), on all day in one
    without (a hall, a landing, a WC). Lamps on tables and floors stay lit.
  - Sun pools come only through the facade's own window cells (spacing, sill, head by kind — a
    storefront's glass on the ground, a curtain wall's floor to ceiling: `uSunWin`, `uSunWinUp`), and only
    where the wall the ray leaves by is the same room's (the room map a hand's width inside it): no
    "morning sun" in a hall with no window.
  - In the room the front door opens on, the free-standing pieces (the armchair, the big plant) stay off
    the line from the door to the room's far end: the view in reaches the kitchen and its table.
- The kitchen and the table (review round 11: "a sink run, with no range, fridge or wall cabinets";
  "three chairs crowd one side of the table"; "a WC is in view through the living room's left door";
  `tests/interiorHome.test.ts`):
  - A home's kitchen is one piece along a wall, `decor.ts` `kitchen(spec)` (`KitchenSpec`: its length,
    the sink, the cooker — a range set in, its chimney hood over it — the fridge at an end with a
    cabinet over it, and the stretches with a window over them): base units and the worktop, wall
    cabinets wherever the wall above is solid, a low upstand under a window. `furnish.ts`
    `planKitchen` picks its wall and length (from each end of every stretch and every 40 cm, the
    longest it takes and a few shorter: 30 cm steps in a house, 60 in a block of flats so its kitchens
    are a few instanced pieces) by `runLayouts` — the run laid out in its own x round its windows,
    memoized: the fridge and the cooker only on solid wall (never in a window's stretch), the sink
    under the window where it fits beside the cooker, the most wall cabinets, the far end of the room
    from the door you come in by. A windowless run keeps its fridge on its left (a mirrored flat's is
    the same piece turned round). What the run can't hold stands on a wall of its own, as near it as it
    goes (`stove`, `fridge`: round the corner, an L; else the living room's kitchen end). One kitchen a
    space (a kitchen the stair's wet room cuts in two has it in its biggest part). A fridge with no
    wall for a full-size one is a slim 60 cm one. Of the 82 seeded homes' kitchens, 80 have their
    cooker under a hood, a fridge and ≥ 0.6 m of wall cabinets (two have no wall left for a fridge).
  - Wall cabinets read as cabinets (review round 12, frame 6: "flat cut-outs in the curtains' own blue,
    and the two merge"): `WALL_D` (32 cm) off the wall, a 2 cm dark joint between each pair of ~0.6 m
    doors, a handle on every door and the bottom rail's line, and the shadow they throw on the
    splashback under them (`SHADOW_DARK`: 5.5 cm at half the splashback's light, 5 cm at three
    quarters). Their colour keeps its own against the room's curtains (`interiors.ts` job.fab →
    `Furnisher.fab`; `furnish.ts cabinetColour`: the picked colour, else white, else the next paint at
    ΔE76 ≥ `CABINET_DE` 22 from the fabric).
  - Dining chairs: a place per ~0.7 m of the table's edge, never under `DINE_PLACE` (0.6 m) —
    `placesAlong`: two a side at 1.2–2.0 m, three from 2.1 m — and one at each end of a table of
    `DINE_ENDS` (1.4 m) or longer where there's room behind it to draw the chair out (the table is
    placed with that room first, then without).
  - A WC's or a bathroom's door off a room of the day (living, great room, kitchen, dining) stands
    shut in its doorway (`mesh.ts` `LeafSpot.shut`; a `leafShut:` piece, MOVING so it stays
    instanced) and swings into its room as you step up to it — in front of the doorway within a stride,
    or in the room itself — and shuts again once you've stepped away (`interiors.ts` `swingDoors`, a
    quarter turn in ~0.25 s). Walking past it along the wall leaves it shut; the doorway is always open
    in the walk world. Every other leaf stands open as before.
  - Pose 19 (`tools/review-shots.js`, "morning sun"): of the 'inside' house and its 24 nearest, the room
    with the most east-to-south glass (`interior/views.ts` `glassFacing`, `sunniest`; of rooms with as
    much, a room of the day before a bedroom, then the one whose floor takes more of the light), framed
    where the most sunlit floor is in the lens (`sunRoomView`: from a 40 cm grid and its doorways, never
    inside its furniture — `Interiors.activeTaken`, the floor it claimed — each turned a little either
    way and pitched 0.2–0.44 down; a coarse lens of rays through the room's box, its furniture as low
    blocks, estimates the frame's sunlit floor — `sunlit`: back toward the real sun, `uKeyDir`, through
    the room's own window cells — its bare floor and its biggest wall, and keeps the most light with
    neither over about a quarter of the frame). Without the sun: its doorway or far side, looking at the
    floor a stride in from those windows.
  - Measuring a frame (an id pass): with `window.__TAG_PIECES__` set, a build's merged mesh carries an
    `aObj` stream — each piece drawn while furnishing, each baked piece, its own tag; 0 the building
    (`mesh.ts` `tagging`, `ARCH_KEY` for the pieces that are the building's).
- Deeper archetypes (Slice 4, `tests/interiorArch.test.ts`): `uses.ts placeOf(name, tag)` says what a
  building is (its tag first — a pub called "The Library" stays a pub — else its name, several
  languages) and plan.ts picks the family: `market` (a supermarket, a grocery ≥ 400 m², a pharmacy
  ≥ 500 m², a tagged shop ≥ 1,500 m² on one storey), `hotel` / `school` (corridor strips: `STRIPS`,
  the corridor where both bands come out most even; on a storefront's glass the ground storey is
  `P.pub`, a public floor), a library/bank/post office/gym/pharmacy as its shop floor (a big one an
  office core round its hall), a church or mosque (`P.place`).
  - Layout: `backStrip` puts a big floor's back of house at the depth that makes its share (20–25% a
    supermarket's, 30–40% a restaurant's kitchen) — across the middle it meets no facade; at each
    side wall it jogs to that wall's pier, the corner between a back room. `bandCuts` picks a band's
    party walls together on a 10 cm grid (a DP: rooms nearest the width wanted, out-of-range only
    where no pier allows better; a greedy pick strands the next room in a window).
  - A big floor is planned round its fixtures (`Layout.fix`: kind, rect, facing, modules): a
    supermarket's checkouts by the door (lanes on a 2.5 m pitch), produce on the door's other side,
    the main aisle, gondola runs (1.25 m modules, ≤ 11 a run: a cross aisle every 13.75 m, 1.8 m
    aisles), chillers and freezers along the back partition; a church's pews (0.91 m pitch, a 1.5 m
    centre aisle) and altar. `finish` drops a fixture a doorway came to land by.
  - Rooms: `guest` (bath inboard, the entry passage open to the bedroom, mirrored pairs), `classroom`
    (50–65 m², the board on a solid end wall), `assembly`, `staff` (a gym's changing room),
    `narthex`, `prayer` (carpet rows, the mihrab and minbar on the far wall), `library`, `bank`,
    `post`, `gym`; furnished in `furnish.ts` (`fixtures()` first, then the room's own).
  - Not done: a dais (the type is there), a qibla from the real bearing, hotels' and gyms' tags
    (`tourism`, `leisure` aren't in the tile's use tag yet: their names find them).
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
- Lunch on the tables (review round 12, frame 18: "a cup, a plate or a glass at every occupied
  table"): every seat a café, a bar's high tops or a diner's booths offer a customer (`F.npcs` with a
  seat — the build picks who sits from these) has lunch in front of it — a plate, and a coffee or a
  glass of water (`furnish.ts lunch`; decor.ts `tableware`, keys `tw:plate`, `tw:cup`, `tw:glass`, chosen
  by the place, no draw on the room's seed). `tests/interiorHome.test.ts`: every table someone sits at
  in two cafés, a bar and a diner over three seeds is set.
- Sun pools: the interior shader traces the sun ray to the outer wall (`uDims`) and lights the
  floor where it passes one of that wall's real window cells (the facade's spacing, sill and head
  for the building's kind) and that wall is the same room's (see "The way in" above).
- Getting in (Robby, Brooklyn, 2026-10-04):
  - **Which building.** The door you're walking toward (`Interiors.vel`, your heading smoothed from
    your steps) counts as up to 8 m nearer. Past 16 m, only a door you're walking straight at counts.
    The nearest door used to change every few steps along a row of shopfronts, so the one you meant
    began building at 8 m.
  - **A shut door** (`shutDoor`, scope −10). Within 2.5 m of a door whose interior isn't open, a leaf
    stands across its doorway, and that building becomes the one building, built flat out (as a
    lift's next window is, 14 ms a frame). You stop at a closed door for a moment rather than walk
    into an empty shell and see through the house until it lands.
  - **The panes.** A pane opens whole or not at all, decided by your distance to its nearest point
    (under 6.5–8 m, a per-window threshold) and only on the storeys round yours. The old per-pixel
    noise around a 4.2 m distance to the pane's centre left a big storefront half-dissolved
    wherever you stood at that distance.
- People who go in stay in (`Interiors.visit` → `LifeClient.setIndoor` → `lifeSim.ts` `setIndoor`):
  - The building standing open publishes its door and the ground storey's free standing places:
    the residents' unused spots and a 1.2 m grid over the open floor. Both are only in the space the
    front door opens on, so nobody walks through a partition.
  - A walker going in by that door walks to a place (`IN_WALK`), stays there turned to the room
    (`IN_STAY`), and walks back out by the door (`IN_OUT` → `FROM_DOOR`): the same person, seen
    through the windows and in the room with you.
  - If the building closes, they're inside still, unseen, and come out when they would have. If it
    opens again, whoever went in by its door is already standing at a place.
  - `tests/lifeSim.test.ts` covers it.
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
- Road bridges (`world/bridges.ts`, called from `structures.ts`): the road-bridge ways a tile can
  see, its margin's included, chain where exactly two meet end to end; every tile profiles the
  whole chain and draws only the ways it owns, so pieces owned by different tiles meet (the
  Rumson–Sea Bright bascule's tiles meet mid-river: profiled per tile, it sagged to the water there).
  - The long section (`bridgeProfile`, stations at every vertex and 2 m between): lands on its
    approach streets at their height + 4 cm; over each run of water stands the clearance (a movable
    run `CLEAR_MOVABLE`, else `clearOver` the run's shore-to-shore width, measured on past an end
    in the air so every tile agrees) plus its girders' depth (span/25); clears roads and railways
    under it; climbs at its class's grade (1.3× off the street); never under the line between its
    ends; bascule leaves straight heel to heel. Chains are built longest first: one that runs onto
    another's deck (a ramp onto a viaduct) holds that deck's height where it joins (`Pin`), and
    neither parapet stands where they meet.
  - Collision is the deck as drawn: roadway and sidewalks are `table` decks (drawn station heights,
    exact over the worker boundary) with square ends (`Deck.cut` — a round end hung over the
    sloping street; where two ways' pieces meet, both end along the drawn mitre; a cut deck reads
    its height at the nearest point of its centreline); parapets are walls a deck-high band; piers,
    bascule piers, fenders and towers are walls below the deck. A pier never stands in the way of what
    passes under (`crossingsUnder`/`decksUnder`, kept with the profile): moved along its span up to
    15 m to clear it, or left out. A mapped sidewalk alongside widens
    the deck (`deckEdges`).
  - What carries it (`carriedBy`, OSM `bridge:structure` → `Road.bs`, real-lite tiles only — the
    baked pack has none): girders on piers (beam, the default); through trusses (80 m spans);
    an arch over a low deck (hangers) or under a high one (columns); a suspension bridge's two
    towers and cables; a cable-stayed bridge's pylons and stays. A higher OSM `layer` clears the
    bridge it crosses (`decksUnder`). A movable span is drawn closed (`opensBy`, OSM `bridge:movable` →
    `Road.bm`): a bascule's steel leaves, its piers, four tender houses (their lamps are `towers`)
    and timber fenders; a lift span's two towers and the machinery house over each; a swing span's
    rest piers, the round pier it turns on and the long fender along the river round that.
- **Streets kept clear** (Robby, 2026-10-07: "the roads have walls or buildings in them"). Measured by
  the playtest's `roads` check (tools/playtest.js `__ROADWALLS__`: every car street's travel lanes
  sampled at its own surface for walls at a car's height, footprints and deck gaps). In the tile build
  (tileBuild.ts), before any builder sees the roads:
  - The tile service's widths mended: a divided road's one-way halves their own lanes wide
    (realTile.ts `narrowOneWays`), a width tagged in feet read as feet (`feetWidths`).
  - Buildings: a house under a bridge's deck held under it (`bridges.ts fitUnderDecks`, `Building.hy`),
    the survey's blocks that were the deck dropped; a big low outline a street runs through for 40 m — an
    underground station's halls — dropped (`dropStreetCrossers`; realTile skips `location=underground`);
    what stands over a street lifted clear of it (`lf` 5.5 m, its top kept): a low one (20 m or less) the
    centre line runs through 25 m, a narrow one (15 m across or less, 20 m long, not a house) 4 m, a long
    narrow one over a travel lane 25 m — an elevated station's platform and canopy (Chicago's L), a skyway.
    A tower stands: the street is the one under it. A block the survey found where the map has none
    (`gen: 'lidar'`) that a car street's centre line runs through for 3 m, or its lanes for 8, is gone: a
    canopy, a truck or bus parked under trees, a flat crown (Tucson's West Pennington Street had three found
    "houses" in its lanes, a car stopped dead against one).
  - A street under a tower or under a street on a higher OSM layer — 40 m and half of what the tile sees of
    it — is a tunnel (`sinkLowerLevels`: only the traffic takes it): Chicago's lower levels (its upper
    streets are layer 1, the lower 0), drawn on the streets over them, their cars in the upper lanes.
  - **A street fitted to its fronts** (kerbside.ts `fitToFronts`): the tile service widens every
    untagged North American street for a parked lane at each kerb (10.9 m residential); where a tile's
    own street runs 12 m or more past mapped fronts within 1.5 m of its kerb, that stretch is cut out
    and drawn at its travel lanes' width, its parking given back (`pk` = `NO_PARK`: no paint's default
    parking, no shop-door cars, no kerb spaces); where fronts stand both sides closer than that (a
    width tagged in feet), as wide as the room between them less a 1.5 m sidewalk each side, never under
    a lane each way (3.6 m one-way, 5.6 m two-way), never a motorway or trunk. And open country gives the
    guess back too: a stretch of 60 m or more with fewer than four buildings within 50 m of it (`OPEN_R`,
    `OPEN_N`, `OPEN_RUN`) — a road through the desert, the woods, the fields, a strip's road past its car
    parks — drawn at its travel width, NO_PARK; a village on it keeps its parked lanes. (The guess made
    every rural road 4.4 m too wide: Saguaro's one-way Cactus Forest Drive 10.4 m, its scrub 9 m off its
    middle.) A pair of farmhouses doesn't make a town. Only the tile's own ways,
    from what it can see (its box + 40 m); a neighbour has the way whole at its first width as context
    and keeps its things off that wider street, which is safe.
  - Nothing set at a kerb in another street's lanes (kerbside.ts `carriageAt`): the survey's tree pits,
    the city's street trees, their bins (one street's kerb is another's lane at a junction); no parked
    car through a street, across two at a junction or across one's lanes (`streetThrough`), none in
    another street's lanes at its own level or above (props.ts `inOthers`: a slip road's, the street over a
    lower level's), none on a deck; walls to their own tops (streaming.md "Collision tops").

## Vehicles

- `src/player/vehicles.ts` — E enter/exit. Your own rides are painted with the brush (below); driveway
  cars (props' `parked-cars` InstancedMesh) and kerb cars are enterable. The old free summons (V car,
  Shift+B boat, N plane) are a developer switch: panel → Debug → free rides.
- While riding, `Vehicles.update` owns the camera and carries the walker (streaming/life/
  interiors key off it); `walker.update` is skipped.
- A car's collider is its own body (`carBody`: a capsule as long and wide as its kit recipe, a bike
  rack adding to the back), moved by `WalkWorld.moveBody` (`bodyPush` per wall). The bumper stops
  at a wall, and a post or corner brushing its side pushes it aside. It was a 1.05 m circle round
  the middle, and the nose went 1.15 m into a wall.

## The van (`src/van/`, the default start; `?poc=0` the old one) — bigger on the inside

Robby, 2026-10-09: "the van is the heart … the van in and out should be seamless like how it is walking
into buildings already". You wake in the back of your camper van (on by default since 2026-10-10 — Robby:
"make poc1 the default url"; `src/poc.ts`: `?poc=0` is the old start, and the review tools' `?capture=1`
keeps the old start unless it adds `&poc=1`), parked in the nearest car
park, the town in pencil; without it the game is unchanged (no van, no stencil, nothing drawn).

- **The body** (`assets/camper.ts`, a foundry family: `camperRecipe(seed)` → `camperGeometry` → body,
  its two cargo sides, the bumper and step, one door leaf): a 5.6 m high-roof camper (2.72 m tall: the
  back doorway is 1.5 × 1.95 m over a 0.58 m floor, so a walker's eye clears its head by 0.3 m), two-tone,
  windows along the back and in the back doors open right through (`camperFrame` `win`, `leafWin`: a
  black rubber frame, the room's mustard curtains tied back at their ends, a pane each that is never
  drawn but casts the shadow glass would — `panes`, `leafPane`), an open cab with seats,
  dash and wheel behind a curtain, barn doors that swing round against its sides (`DOOR_OPEN` 261°)
  as you come within ~2 m of them, from inside or out (a latch sound). Budget `CAMPER_BUDGET` 16k
  vertices (`tests/foundry.test.ts`, `tests/van.test.ts`). Seed 1, yours, is the sea-foam one.
- **The room shares the van's frame** (`layout.ts`: van-local +x right, +z toward the back): 4.8 m
  across, 6 m deep, 2.85 m to the ceiling, its back wall at the van's back with the doorway a 0.6 m
  passage through it (`tunnel`). So the windows look out from where the van really stands, with true
  parallax, and walking in is just walking — no teleport. The room overlaps the world round the van;
  it's only ever drawn where you can see it:
  - **outside** (`van.ts beforeRender`, `after`): the room is rendered from your eye into `portalRT`
    (colour + depth), scissored to the patch of the screen the doorway (from behind the van) and the
    windows of the side you're beside cover. After the world, the passage's five faces and a face
    across each side window (`windowFaces`, at the panel's inside: the frame and the curtains stand in
    front) — the portal — draw twice: a stencil mark (depth-tested — a walker in front of the van
    stays in front), then the room's colour and its **true depth** (`gl_FragDepthEXT`) where marked,
    so the paint, the ink and the brush treat the room exactly as from inside. Where the room shows
    nothing (its windows) nothing is laid: the world behind shows through. The post's scene target
    keeps a stencil only when there's a van (`WatercolorPost({ stencil })`).
  - **looking in at the windows** (Robby, 2026-10-10: "why can we not look in the windows of van from
    outside?"): the room is wider than the van, so from beside it the room's near side stands outside
    the van, between you and the window — through a side's windows only what's beyond their plane is
    drawn (`peekSide`, `windowClip` → the room's materials' `uClip`, the rest discarded): you see across
    the room to its far wall, well past the van's other side. A look through the doorway from beside
    the van runs away from that side and never crosses its plane, so one draw serves the doorway and
    the windows both. Shut, the back doors' windows look into the passage and the room beyond it; open
    (folded against the sides), what's behind them.
  - **inside** (`after`, from `post.render`'s new `after` hook): the world draws as ever from where
    you stand (the van's body swapped to an invisible material — it still casts its shadow — and each
    cargo side drawn only from outside it: `beforeRender`), then the room: its shell (convex from
    inside, `shellGeometry`) with no depth test, so the world shows only through its openings, then
    the passage and furniture with one.
  - **the change** (`nextMode`): in once you're 0.30 m past the door's plane, out under 0.22 m, only
    through the doorway's width. Anywhere in that band both draws show the same surfaces (out is
    valid while the passage's far end is past the 0.25 m near plane; in, anywhere in the passage), so
    the change is invisible — `tools/van-check.js` measures it (docs/agent/debugging.md). Decided
    after the walker moves, from where the eye is now (`van.update` after `walker.update`).
- **Walking**: outside, the WalkWorld has the van as walls (scope −5,000,000, open at the doorway, the
  doorway's sides running 1.2 m in) and decks (the step behind it at 0.32 m, the passage's floor at
  the floor) — you step up as onto any porch. Inside, the walker walks `VanSpace` (`space.ts`:
  the room's walls and furniture in the van's frame, its floor; `Walker.space`), so the van can later
  move under you. `settleWalker` and the interiors leave you alone while you're in; the HUD says "in the
  van"; sound is indoor. Flying, you're out. You wake standing at the bed's foot (`layout.wake`: a start
  sitting on it read as sunk into the floor, then floating up as you got up — Robby, 2026-10-10).
- **The room** (`room.ts`): wainscot and plaster, plank floor, beams and two strings of lights, four
  windows with frames, glazing bars and tied-back curtains, a bed in the front-right corner, the map
  table (a drawn chart: `chartCanvas`, its own material), chairs, a rug, shelves and a little kitchen
  either side of the doorway, coats by it, an armchair in the front-left corner under the empty wall (a
  picture rail and two brass hooks: your first painting's place). Its own light (`roomLight`): the sky
  through each window and the doorway, warm lamps brighter after dark — never the sun's shadow map.
  Furniture is decor's (`Furn.hx/hz`: half sizes along the piece's own x and z).
- **Always painted**: the van, its room and the portal write alpha 0.75 (propMaterial `keep`, the
  room's materials): the post's sketch mode leaves those pixels painted, and a look (below) reads them
  as sky — your home is never the town's pencil.
- **Where it parks** (`spot.ts findVanSpot`): the map's own car parks within 700 m of the spawn (paint
  and tile `areas` with `c: 'parking'`), the 200 stalls of each nearest the sea and the spawn, the four
  stall directions: the van clear of every wall (parked cars move on — `kerbCars.keepOut` hides the ones
  in the van's room and stops the ones that come and go from parking there), off the aisles (roads),
  nothing behind its back door, no building where the room stands, its back toward the sea and close to
  it. Sea Bright: the beach end of the big lot, stepping out onto the beach. ~0.3 s at boot.
- **Colour by sight** (`world/sight.ts`, the first bloom): sketch mode on; the explore record kept in
  memory (`Explore({ persist: false })`: every visit's first morning is in pencil) and nothing painted
  round you as you walk; photo mode's read-back (post.readSeen → render/seen.ts → paintSeenSliced) run
  whenever the view has turned ~7°, moved 3 m, or every 2.5 s (`shouldLook`, at most every 0.35 s, one
  at a time). Off until you first step out of the back door; then a held breath (`Ambience.hush`, 0.9 s),
  the wash (`ui('wash')`) and a chime, and the colour runs out from you to the horizon.
- **The cab** (`van.ts` `action`/`act`, `seat`): E — on a phone the button by your thumb, its word the
  action's (`VanAction`: Sit, Back, Map) — at the driver's door (outside, on the left: `layout.cab.door`)
  eases you into the driver's seat (`cab.eye`); the camera rides the van there, your look free, through
  its own lens (`walkParams.cabFov`, 74: the panel's "driving field of view" while the van is on), the dash,
  the binnacle, the steering wheel (its own mesh, turned by how fast the van turns), the thin dark
  windshield pillars and the mirrors round it. From the seat, E: into the back — a curtain brushes past
  (`wipe`: a quarter second in, at its fullest you're through, then out — no fade), and you come out of
  the curtained way in the room's front wall (`cab.way`, `cab.into`); walk into that curtain and you're
  back at the wheel. `nextMode` keeps you seated (`'cab'`); vehicles.ts's E steps aside while the van
  has an action or you're in it.
- **Driving itself** (`drive.ts`; `van.ts driveTo`, `move`): E at the map table opens the atlas with a
  pick that drives (`atlas.driveTo`: "drive here"; a search result too). The route: A* over the map's
  own roads (the baked region's paint roads, every class a car takes; the streamed cells' primary roads)
  joined where they share points, the main roads cheaper (`CLASS_COST`). The path: half a lane right of
  the middle (left where they drive on the left), out of its stall along its nose onto its lane a van's
  turn away, every corner rounded, a point a metre, the last 30 m pulled over to the kerb; a speed for
  every metre — the road's (`CLASS_SPEED`: 25–30 mph in town, a car park's crawl), no faster than a bend
  allows (2 m/s² sideways), easing on (1.4) and off (2.2) — and the heading eased, never turning tighter
  than a 4 m circle. The back doors shut first (the doorway is a wall while they're not open), then it
  goes: out of the WalkWorld while it moves (back in when it parks), the walker carried (`Walker.shift`:
  in the room your spot holds; at the wheel the seat does), the engine heard (a car's), animals giving
  way (`onMove` → main's movers), the parked cars along the way left alone (`covers` is the van alone
  while it drives). It pulls away the town's bloom if you never stepped out (`onDepart`). Sea Bright to
  ~1 km down the shore: the cells 120 m ahead were always built (0 of 200 samples), and what you see
  out of the windshield colours as you go.
- **Driving it yourself** (`drive.ts stepWheel`, `HANDLING`; `van.ts wheelInput`, `move`; Robby,
  2026-10-10: "now i want to be able to drive it"): at the wheel, W/S and A/D (arrows too) are the
  pedals and the wheel; a phone's walking stick is both (past `stickAxes`' dead zones; part way, that
  share of the top speed). A camper's handling: 22 m/s top (~50 mph), a pull that fades toward it (~9 m/s
  in 3 s), brakes of 9 m/s² (45 mph to a stop in ~22 m), S held past the stop backs it up (5 m/s), it
  coasts down when you let go; a 3.4 m wheelbase and a 0.6 rad lock (a ~5 m turning circle at a crawl),
  never more sideways pull than 7 m/s² (`wheelLock`: at speed the wheel turns it gently, so the view from
  the seat never swings hard). Sitting down shuts the back doors. The first press takes it out of the
  WalkWorld (`depart`, the town's bloom if you never stepped out); it moves against the world's walls with
  its own shape (`walk.moveBody`, as a car's: buildings, kerb cars, fences, the water's edge — it bumps
  off and loses its speed); the ground under it as the self-drive's (it stays level: the room shares its
  frame). While it drives itself (from the map table) the pedals and the wheel don't move it: the hint
  says so — "hold to take the wheel · the van is driving itself" (a phone: hold the stick up) — and a
  pedal held 1.1 s (`TAKE_S`) takes the wheel at the speed it was doing ("you have the wheel"). Get up (E,
  Back) and it brakes to a stop by itself (`stepWheel`'s `hold`); stopped with nobody at the wheel it
  parks (`arrive`: back in the WalkWorld, the kerb cars round it). The hint at the wheel, stopped: "W
  drive · S brake, back · A D steer · V view · E get up" (a phone: "the stick drives · View: from
  behind"); the stick's label says "drive".
- **Painting it where you want it** (the brush, below; Robby: "we should be able to spawn the van like we
  do other cars and boats"): your van is a chip among the cars ("your van", its picture `camperPicture`
  — the whole van, doors shut — on the chip and as the pencil sketch), always yours (never painted from
  life first; the "a car?" chip still shows till you have). There's only the one: painting it brings it,
  room and all, to the street spot you painted (`brush.van`, main.ts: `van.park` there, the kerb cars
  round its room moved on), "your van, here — its back doors open as you come to them". Only from
  outside it while it's parked; never on top of you (its spot 4.5 m off at least) nor of a parked car
  (5.2 m); its own paint (no swatches).
- **From behind** (`van.ts chase`, `third`, `toggleView`; Robby: "van can also be driven in third person
  too"): V at the wheel (a phone: the View button, the balloon's, in the ride cluster — `body.driving`,
  `data-ride="van"`; `tools/hud-audit.mjs` "at the van's wheel") swings the view behind the van, 9.5 m back
  and above it, round your look (the mouse orbits it; with no mouse it swings back behind the van), the
  walking lens; V again, back in the seat. Seen from behind it's drawn as from outside (`chasing`: its
  sides and the room through its windows — shut, the back doors' windows show the room as it drives).
- Harness: `window.__VAN__` / `__GAME__.van`, `__GAME__.sight`; shots (`?capture=1&poc=1`): `van-wake`,
  `van-room`, `van-door`, `van-window`, `van-wall`, `van-doorway`, `van-near`, `van-step`, `van-back`,
  `van-side`, `van-curtain`, `van-cab`, `van-cab-left`, `van-cab-right`, `van-drive` (35 s into a drive
  down the shore, at the wheel), `van-drive-out` (the van from the roadside), `van-peek` (in at the
  kerb side's window), `van-peek-left` (the driver's side, toward the front), `van-peek-back` (the back
  doors shut: in at their windows), `van-third` (at the wheel in its stall, from behind), `van-wheel`
  (25 s into the drive down the shore you take the wheel: 1.5 s on the pedal), `van-wheel-third` (the
  same from behind), `bloom-0`, `bloom-1` (`--settle=300` for the bloom). A van shot opens the back doors
  unless the van is still rolling from the shot before.
- Not yet: fuel and legs and sleep (later, by the plan), the room's things working, saving the van;
  mirrors that show what's behind (backing up is by looking round); it stays level on a slope; parking
  (by hand or at the end of a drive) can put the room's far side into a building beside it (seen only
  through that side's windows).

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
  run; flying, 4× speed), the rest drags the look (scaled by the panel's look sensitivity). The
  stick is drawn where it rests (`#stick-home`, labelled "walk" until you've walked with it once —
  `map-game.stick-taught.v1`), comes to the thumb wherever it lands, and follows a thumb that runs
  past its rim (the origin drags along) — you never have to lift and find it again.
  `releaseTouches()` drops both (a pinch, the page going to sleep). `waitGround` holds walking
  while the cell underfoot isn't built (main.ts `groundCheck`); `climb` is Up / Down while flying.
- The buttons (index.html): every one a drawn SVG icon with its word under it (`data-label`, the
  `::after`; `syncTouchControls` changes the words — Fly/Land, Up/Down or Burn/Vent). Two places:
  the bar along the top right (`#tbar`: Go — search, focused in the tap so iOS raises its keyboard;
  Map — the atlas; More — the drawer: plant, next seed, +1 hour, options; any touch on the world
  closes it) for what you do now and then, and the cluster under the right thumb (`#tdock`, every
  button placed from one corner anchor by CSS variables `--big --btn --col --row --dock-b`): Paint
  (72 px, ink — the game's verb; the same as P: the brush away, a viewpoint faced) in the corner,
  Fly over it, Brush beside it, Lift over the brush in a lobby. A tick of vibration on every press
  (Android), and each button shrinks under the finger (`.held` while one is held down).
- The ride's own button (`#touch-action`, main.ts `touchActionState`): Drive / Board / Step in
  beside a ride, Get out / Jump out in one — an ink pill over the cluster that pops in; a
  double-tap on the look side does it too, but gets you out only once stopped. `#ride-touch`
  holds the held buttons, in the cluster's own places: Boost (car, boat — the corner), Faster /
  Slower (plane), Up / Down (flying on foot; a balloon's Burn / Vent) beside Paint, View over it
  in a balloon. A held button lets go when its finger lifts, it disappears, the window blurs or
  the page sleeps (`bindHold`, `releaseHolds`).
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
- The frame (`player/frame.ts`, reviewer round 10 "a phone is a window, not a slot"):
  `walkParams.fov` is the lens — the vertical angle on a PC's 4:3–16:9 screen, which those screens
  keep exactly — and `frameFov(lens, aspect)` fits the camera to the screen's shape. Upright (any
  tall window) the frame opens taller until it shows 41° across (78° tall at 390×844, where a fixed
  62° was a 31° slot; at most 84° tall); on its side (or an ultrawide) it stops at 95° across (it
  showed 105°; the height gives). `setLens(cam, lens)` (controller.ts) is how every camera that
  follows you sets it — the walker (less the brush's push-in), the chase, the basket — and main.ts's
  resize, which also runs on a turn of the phone (`screen.orientation` change, or
  `orientationchange`) and again once the new size has settled. Every zoom turns the lens (photo
  mode's wheel, pinch and ± buttons; the panel's "field of view"), so the frame follows in
  proportion: upright, photo zoom runs from a 24° to a 97° tall frame. `tests/frame.test.ts`.
- The phone HUD (style.css "the phone HUD"; `body[data-ride]` = car / boat / plane / balloon /
  fly / near, set in `syncTouchControls`). The middle of the frame — x 15–85%, y 30–62% — is the
  world's: nothing of the HUD stands in it while you walk or ride, toasts included. The place name
  and the clock sit on a paper wash, the clock in full ink (it was grey at 0.75 — under 4.5:1 on a
  grey wall).
  - Upright: the place, then the hint (or a ride's readout — live numbers only — then the hint)
    read down the top left, clear of the bar; the bar's column keeps to the right 15% (its margin narrows on a
    narrow phone, its buttons 40 px on a 320-wide one); the word for what you're next to sits just
    over Fly; an SE's cluster is a size smaller.
  - On its side: the bar a row; the place, then one message under it; the ride's readout along the
    bottom like a dashboard, between the stick and the cluster; the cluster a row along the bottom
    (Lift, Up or Burn beside the brush) with Fly — and the word over it — up the right edge; a
    smaller stick ring, lower.
  - A toast (main.ts `toast`, `body.toasting`) takes the hint's place for its few seconds, two lines
    at most (clamped; its margin is a clear border, so no third line peeks out of the padding), and
    the hint steps aside till it has faded. An arrival card (`body.arriving`) is painted smaller
    where the place name stands, on the same wash, and the place name waits till the card's fade
    ends (`animationend` — the wall clock, not the slow frames' game time).
  - Never cut off (review round 12, must-fix 4: the paint result ended "…you've painted an area…").
    Every toast is written to fit two lines at 320–390 px — "painted out to 1.2 km · 0.35 km² ·
    Map: your sketchbook", a milestone ("you've painted an area the size of Central Park") a toast of its
    own after it — and `toast()` says anything longer in parts, split at its last break that fits (" — ",
    " · ", ": ", "; "). A phone's arrival card is two lines: the name, then the region written short
    and the time ("Monmouth County, NJ · 7:42 pm": `geo.ts shortRegion`; `.a-short`/`.a-long`/`.a-more`
    — the long region and the sky's words are a PC's); a name too long for its line is painted a size
    smaller (`.a-small`), a region too long for the second steps aside for the time (`.a-tight`). No
    message carries a literal "…" either. `tools/hud-audit.mjs` renders all of it on its ten phones.
  - The map-data credit on one line along the bottom edge, under the stick and the cluster. The
    words in hints and toasts are the buttons' own (Paint, Land, Map, Go, More, Boost, Burn…).
  - `tools/hud-audit.mjs` checks it: 10 phones × both ways × 7 states × 4 message sets (none, a
    toast, an arrival card, both) — every button with its word, no overlaps, nothing in the middle.
- The options panel (lil-gui, More → Options) on a phone: an opaque sheet across the top leaving
  the bottom ~300 px (stick, cluster, Get out) in reach — down the left on its side — with a
  "× Close" pill. lil-gui 0.21's root is `.lil-root` (style.css matches `.root` too), and its theme
  vars are set on every `.lil-gui` level.

## Ambient life + sound

- Knockdowns: `Vehicles.onMove` → `LifeClient.bump` (throttled ~11 Hz) → worker `lifeSim.bump`: walkers in the car's path go `DOWN` — thrown with the car, slide with friction, lie 3–5 s (rolled on their side by the renderer, `amt −1`), snap back to the nearest walkable edge and walk on. `onBumped` plays a thud.
- Business use: `Building.u` carries the OSM amenity / shop / office / craft value (bake: building tags or a POI inside; real-lite: building tags or a named business node inside the outline, which also names it and makes a house-sized footprint a storefront). `useOf(name, tag)` reads the tag first — the same values in every language — and a multilingual name vocabulary (en/es/fr/it/de/pt) only as a fallback. `Footprint.use` / `Door.use` carry it to consumers.
- Street rhythm: `LifeInit.rhythm` (`rhythmFor(climate, coastal)`): *shore* (the beach crowd builds to mid-afternoon), *town* (commute, lunch, errands, evening stroll), *desert* (busy early and after sunset, a midday lull).
- Downtown: café terraces at commercial doors whose use (`world/uses.ts` `useOf(name, Door.use)`) is café/restaurant/bar — table sets, parasols in warm climates, seated guests (`SEATED` define, one instanced draw, hidden at night); curbside parking on wide streets (enterable).

- Pure sim in `src/sim/lifeSim.ts` (testable), worker wrapper `ambient.worker.ts`,
  renderer/client `life.ts`, shared layout `protocol.ts` (SAB when cross-origin isolated,
  transferable copies otherwise). Sound: `src/audio/ambience.ts` (all synthesized).
- Walkers are the foundry's person (`people.ts`), posed in the shader from `aAnim` (phase,
  amount — 0 standing, 1 walking, 1.5 running, the knockdown and chat codes — and the lead). One
  draw for all of them (`life-ped`), the residents and the café guests too, each in its own mesh.
  - Standing (a pause, a chat, a corner) is never frozen: the weight goes over one foot, then the
    other, the free knee easing, the head looking about (`walkPose`'s idle).
  - **Dog walkers go in at doors too** (`lifeSim.ts`, the visit roll): the dog goes in with them and
    comes out with them. Only the others visited (round 12, "dogs fill the street"), so the street
    kept ~23% dog walkers by day where the sim assigns 9%; now the share outdoors is the share
    assigned (`tests/lifeSim.test.ts`: 10.7% assigned, 11.3% outdoors on a grid town by day). Not
    done: a beach's no-dogs season as a dated ordinance table by municipality (it belongs in region
    data, never a place name in code).
  - **Dog walkers** (`PED.DOG`): `life.ts` `walkDog` puts the dog a lead's length ahead and to the
    right, on the walker's own ground, and tells the walker's shader `aAnim.z` = 1 + how far the
    dog has wandered sideways — the right arm holds the lead out toward it. The lead (`LEAD_V` 8
    vertices, four segments sagging a little) runs from `leadHand` — the shader's own pose maths
    on the CPU, so it ends in the drawn hand (within 2 cm: `tests/people.test.ts`) — to the
    dog's collar (`DOG_COLLAR`). The dogs draw with `dogMaterial`: the fox's trot, the tail
    carried and wagged side to side.
  - Walkers are drawn on the ground under them (`life.ts`, `ground` = `WalkWorld.outdoorNear`, within
    150 m): the sim walks them 12 cm over their street's own height, and the shoes hovered.
  - Nobody stands in the first steps in from a front door, or sits within 2.2 m of where you stand
    once you're in (`interiors.ts` `people`): a resident there was cut in half at the lens of
    anyone walking in.

## The shore's calendar (`src/world/calendar.ts`) — round 10's must-fix 5

The season and the hour decide how full the marina, the beach and its parking are, everywhere at
once, from the map and seeds. No place names: a beach is a mapped `beach`, a marina a mapped
`marina`, a riverfront lot a house with sea-level water within 30 m of its walls.

- **One calendar**: the world's day (`setWorldDate`, from `?date=` — the tile worker at init, the
  page at boot for in-page builds; else today), `BEACH_SEASON` (moved from micro.ts, which
  re-exports it), `MARINA_SEASON` (slips taken: July–August 0.9, October 0.55, a temperate winter
  ~0.22; a warm coast ≥ 0.72, a cold one less), `beachDay(hour)` (one rise, one fall: full 11:30–
  15:30, about half at six, empty by 20:30), `beachLotFill`, `lifeguardSeason` (the last Monday of
  May to the first Monday of September; half a year round in the south) and `LIFEGUARD_HOURS`
  10–17. The month is fixed when a tile builds; the hour moves while you watch.
- **Windows**: something that comes and goes carries the hours it's there (`windowFor(u, fill)`:
  there while u < fill(h) — for a one-rise-one-fall day that's one stretch; the lowest keys come
  first and stay latest, and the count at any hour is exactly the fill). `present(h, a, b)`; [0, 24]
  is all day, b < a overnight.
- **The beach lot** (`props.ts`): a lot within 150 m of a mapped beach (none in the tile's context:
  within 150 m of the open sea) fills by `beachLotFill(hour, season)` — 6% all day and night, then
  the beach's day × its season (1 October 17:48: ~10%; a July afternoon: full). Each car's record
  carries its hours (`KERB_STRIDE` 13: … arrive, leave). Its walls go in the builders' scratch walk
  only (`scratchOnly`: what's placed after keeps off the stall); `kerbCars.ts` draws it, finds it
  for E and walls it only in its hours — one collision scope a car (−1,000,000 down), in and out of
  the walk world as it arrives and leaves (`KerbCars.walls` = the walk world; `update(x, z, hour,
  view)`). One due to arrive or leave within 140 m in front of you waits until you look away (a jump
  of the clock — a shot, the panel — applies at once); its walls follow what's drawn. Other lots
  keep the town's fill (built density, `OCCUPANCY`) all day.
- **Marinas and docks** (`docks.ts` `shoreDocks`, called in `tileBuild.ts` before the structures):
  - a mapped marina's waterline — the distance-to-water field's zero line through it (or within 6 m
    of its outline: an outline round the basin is the bulkhead), marching squares on 1.5 m — gets
    finger piers (`SLIP` 4.5 m apart, `FINGER` 9 m long, 0.9 m wide) where the water is deep and
    goes on past the tip, never within a slip's width of the map's own piers (their stretch is
    theirs); a boat from `boatMix` (narrow enough for the slip) lies bow-in in each slip between
    two fingers. Every tile that sees the marina lays it out whole and builds the fingers rooted on
    its own ground, so a marina across a tile edge meets itself;
  - two in five riverfront house lots (sea-level water within 30 m of the walls, nothing between,
    not the ocean's beach, no mapped pier within 30 m) get a 6–9 m dock off the bulkhead and a boat
    alongside (`riverfront` counts the lots that could);
  - the generated piers are the map's `pier` lines with `gen` set (`'slip'`, `'dock'`; never in a
    tile file): `structures.ts` decks and posts them, the micro layer cleats them; `props.ts` moors
    their boats at the berths, not along them;
  - piers (mapped and generated) are built on fine ground only (`pierGround`: the region's 2 m
    lattice and 150 m round it, or a tile's pack / a streamed cell's DEM — not the 10 m backdrop);
    boats only on sea-level water (`seaLevel`);
  - every moored boat (the map's piers too) is in the water at the month's share, keyed by where
    it lies, and no two hulls overlap (`oneToASpace`).
- **The beach's people** (`crowd.ts` `beachCrowd`, after the micro layer in `tileBuild.ts` →
  `BuiltTile.crowd` → `crowdLayer.ts`):
  - they go where the beach's things are: a person on each chair (`CHAIR`) and towel (`LIE` or
    `SIT`) of the micro layer's umbrella cells and of the summer beach round the stands (props.ts
    `beach`), one to three to an umbrella (someone sitting in its shade if no seat is taken), now
    and then one standing to talk; a third of the parties' kids at the waterline jumping the waves
    (`PLAY`, 0.56–0.72 scale), some a parent wading waist-deep; a lifeguard on each stand's seat
    (`GUARD`, `GUARD_SEAT` 2.88 m — the stand gained the seat) in season, 10–17. Each party shares
    a window over `beachDay`. Out of season there's no gear and nobody on it.
  - The gear comes and goes with its people: the stands' summer beach (props.ts `beach.gear`) is
    appended to the tile's micro records, and every umbrella, chair, towel and cooler carries its
    party's hours in the record's `flags` (`packWindow`; 0 = all day). `microLayer.ts` draws a
    flagged piece only in its hours (`update(…, camera, hour)`), holding one in front of you like
    the crowd does. No more empty umbrellas at eight in the morning.
  - `CrowdLayer` draws every tile's records: the nearest in the full body, the rest in the lite one
    (`people.ts` `personLiteGeometry`, 193 vertices, smooth, the same joints/parts/markers) out to
    `farR`, two draws (`beach-people`, `beach-people:lite`; no shadow — the shadow pass would draw
    the standing body); `CROWD_TIERS`: desktop 120 + 1,400 to 420 m, phone 40 + 280 to 240 m (half
    `CAPS.peds`), low 20 + 140. `nearR` is for the walking lens: `update(…, lens)` stretches it by
    the camera's magnification over 62° (main.ts passes tan 31° ÷ tan(fov/2): about 5.5 at the
    calendar's 12° shot), so who gets the full body follows how big they are on screen — the
    caps don't move. Refilled every 4 m walked, ~1 minute of the clock or a 10% change of lens;
    someone due to come or go in front of you within 140 m waits until
    you look away (a jump of the clock — a shot, the panel — applies at once). `crowd.people()`
    lists who's drawn (probes).
  - `creature.ts` `BEACH`: swimwear (bare arms and legs, trunks or a suit in the instance colour,
    half a top; the guard red), bare feet (the shoe flattened to a foot in skin), and the poses
    (`people.ts` `beachPose`: joint angles for the chair, the towel — the whole body turned onto
    its back — the sand, the waves and the stand; heels on the sand, never in it). A standing
    beach-goer shifts their weight like anyone standing.
- Tests: `tests/calendar.test.ts` (the curves, windows exact to 2%, the lifeguard dates),
  `tests/shoreCalendar.test.ts` (on the baked pack: the beach lot ≤ 25% at 17:48 on 1 October and
  > 85% at 13:00 in July; comers never in the tile's collision; ≥ 8 boats a 100 m of the marina's
  waterline in October, fingers 4.5 m apart, bow-in; docks on 30–45% of riverfront lots; ≥ 1.2
  people an umbrella at 13:00 in July, 1–3 under each, a guard in every stand 10–17, none in
  October, nobody in January; deterministic; the tiers' caps and vertices), `tests/kerbCars.test.ts`
  (hours, walls, overnight), `tests/foundry.test.ts` (the lite body). Shots:
  `tools/calendar-shots.js` (`__CALENDAR__(tag, { set: 'autumn' | 'summer' })`: 9 and 12 re-shot
  with their counts, a house's dock, the 50 m beach pose at 13:00 in July with people and umbrellas
  in frame, a lifeguard, the kids).
- Review frame 9 (`tools/review-shots.js`, round 11: "still lands on house docks with about five
  small boats"): a mapped marina — the loaded tiles' `marina` area with the most moored boats in or
  within 25 m of its outline (≥ 8), its slips — framed, when the pose is taken, from the stand round
  them (20–40 m out, 7 m up, every 15°, clear of buildings) where the most of its boats are in the lens
  at ≥ 0.2% of the frame each (their hulls' boxes projected through the game's lens); it logs the
  count (`[review] 9 marina: …`, `window.__REVIEW_COUNTS__[9]`). No such marina: the old nearest
  cluster.
- The water's glitter (`water.ts`; round 12, pick-r12a 5: "the dock's white lozenges"): the sun's
  dashes lie across the view — the dry-brush strokes' two world-fixed frames, blended by the camera's
  forward — and near the lens (a finer, sparser octave within ~20 m, the dashes from ~60 m) break into
  sparkles tens of centimetres long. They were world-fixed along z only: metres-long dashes that fanned
  toward the vanishing point as white lozenges at a dock 10 m off, facing the afternoon sun
  (`uGlitterFine` 0 draws them as they were, for the A/B in `tools/arm-check.js`).
- Wakes (`src/world/wakes.ts`; round 11, calendar-autumn 3: "white lozenges fan across the water at
  the house's dock … its foam is too thick and opaque at 10 m"): each arm a ~20 cm line of broken
  white in dashes along it (noise along the track, crawling outward) with a fainter line inside, faint
  thin crests across the track, the churn in streaks along it; at most `WAKE_MAX` (55%) white, fading
  by ~40 m. `wakeFoam` is the shader's TS twin (`tests/wakes.test.ts`). `Wakes.bedAt` (the terrain:
  main.ts) fades a wake out over water shallower than `SHALLOW` (0.45 → 1.3 m): a dock's sand, a bar.

## Asset foundry (`src/assets/`, workbench `/kit.html`)

Design and reasoning: `docs/ASSET_FOUNDRY.md`.

- `core.ts` holds the primitives:
  - shapes: part/merge/box/profile/lathe/limb/blob/card;
  - growth maths: GOLDEN, fibCount, fibSphere, taper;
  - `hashf`, `variantAt`, `validGeometry`, `cached`.
- Families:
  - `kit.ts`: cars (+ gear), boats, planes, rocks;
  - `flora.ts`: 35 tree species × 3 variants (`treeMeta` gives real dims) — among them the Northwest's Douglas fir, western hemlock, Sitka spruce, western redcedar, red alder and vine maple, each in an open-grown, a forest and an old form (`SPIRES`), and the live oaks — the South's, the Hill Country's plateau oak, California's coast live oak (`OAKS`: umbrellas twice as wide as they stand, limbs resting on the ground, a mott's trunks), and the northern and mountain forests — eastern white pine, ponderosa, lodgepole (`PINES`), red spruce, balsam fir, Engelmann spruce, subalpine fir, eastern hemlock (`SPIRES` rows), quaking aspen (trembling: `propMaterial` flutter, the leaf cards' flag 16), willow thickets and the snag — placed by `coniferMix` (the West by elevation band: `bandElevation`, `BANDS`), `aspenShare` (clonal groves), `willowThickets`, `snagShare`;
  - `hangers.ts`: what grows on the limbs — Spanish moss, resurrection fern, ball moss, lace lichen — grown on a tree's own plan (its boughs and its crown's undersides), a layer of its own (`props.ts` `hang:<type>:<kind>:<v>:<load>`, on the trees' own matrices; the region's range rules in `hangerMix`), the strands swinging in `propMaterial` `hang` (`aHang`: depth, length, phase, kind) and the fern greening with `U.uWet` (`season.ts wetness`, from the day's clouds); 12 garden species with growth stages, `plantMix`, `inBloom`, each through its year by the place's season (`plantNow`, `Species.life`: evergreen, a shrub's bare winter twigs, a perennial gone back under the ground, an annual in its warm weeks); street trees on a residential street's verges where nothing measured it (`vergeShare`, `vergeHeight`: props.ts, a slot every ~11 m a side past the paved band, as often as the region's towns and the neighbourhood grow them, only along a street that fronts homes); the dry country's own floor on open, unbuilt land the map draws nothing on (`desertCover`: the tree scan's chance there — the Sonoran upland's 0.6, the sagebrush sea's 0.65, the Mojave's creosote flats 0.25 — of `desertMix`'s plants, where an arid town's planting keeps `treeDensity` 0.22 — and under the LiDAR survey too, whose crowns start at 2.5 m (`lidarCore detectTrees`): there only the kinds it can't have seen, grown under 2.4 m (props.ts `surveyFloor`: Saguaro's creosote, cholla and prickly pear between its measured saguaros); in a wood (the map's, or WorldCover's trees where the map draws none) the survey's gaps too — it finds a forest's tall crowns, a fifth to a quarter of the Hoh's ground, not the trees between them: `surveyGap` grows the region's own mix there (the westside's conifers, its vine maple and shrubs at their own heights) at two thirds to nine tenths of the nearest crown's height, never within a crown's reach and 2.5 m; WorldCover's woods, scrub, wetland and mangrove read through a lawn the map draws over them (`lcOn`: a cell carrying `TileJson.lc` — the Olympic Peninsula's forests were bare grass), and a westside wood's wild maples are bigleaf; a scan point jittered past a surveyed tile's east or south edge is that edge block's, no procedural tree (`edgeCovered`, dropped after its draws so the scan's random sequence stays); planted palms (the dry coasts', the desert's fan palms) only where people live — an 80 m block a hundredth under roofs — never a measured crown out in the wild desert; the forest floor's sword fern, salal and Oregon grape (`understoryMix`, grown by `world/understory.ts` under a wood's canopy);
  - `fauna.ts`: 95 animals (incl. red fox, red-tailed hawk, coyote, mule deer, roadrunner; the backyard birds — cardinal, blue jay, robin, Steller's jay, Gila woodpecker, mourning dove, crow, rock pigeon; the water and big birds — Canada goose, mallard drake and hen, loon, great blue heron, great and snowy egret, roseate spoonbill, sandhill crane, turkey vulture, bald eagle, osprey, wild turkey, California quail, brown pelican, laughing and California gull, and the inland gulls — ring-billed and herring, their bill marks; the mammals on the existing bases — raccoon, opossum, skunk, fox squirrel, chipmunk, woodchuck, beaver, prairie dog, elk, moose, pronghorn, bighorn, with antlers and horns on their own part worn in season; the new plans' black bear, bison, armadillo and manatee — `NEW_PLAN`; the reptiles — alligator and the green and brown anoles on `sprawlerGeometry`, the painted turtle and the two sliders on `turtleGeometry`, basking on `signs.ts` logs; the West's lizards on the same sprawler plan — fence, side-blotched, spiny, collared, horned; the small life — the monarch on the butterfly row with its flap-glide, fall streams and winter roosts, the green darner on `dragonflyGeometry`, the annual cicada and its shell on `bugGeometry`, the banana slug on `slugGeometry`, the fiddler crab and the crawfish on `crabGeometry`, the crawfish's chimneys in `signs.ts`; the water's life seen from above — rainbow trout, largemouth bass, mullet, salmon, tarpon, silver carp and the schools of little fish on `fishGeometry`/`shoalGeometry` (the tail fin's side-to-side `uWag`), the bottlenose dolphin, harbor porpoise, orca, humpback and gray whale on `whaleGeometry` (flukes on the tail's pivot), the harbor and gray seals, the California sea lion, the sea otter and the river otter on `pinnipedGeometry`, and the beaver on its own `beaverGeometry`) on one jointed body plan + `birdGeometry` (a bird is a row of marks: hood, cap, mask, necklace, neck patch, breast, cheek, wattle, wing bars or barring, wingtips, a broad wing's trailing band, crest, bill shape, a long neck, fan or wedge tail; TINT parts painted per bird) + `critterMaterial` (a perched bird's wings closed along its flank, a walk or a hop by the legs' phase, a peck downward, each species' wingbeat `flapOf`, its flight mode and dihedral `FLIGHT`, a display pose), cast per region by role and season (`faunaMix(region, climate, place, month)`; the sim's roles: climber, burrower, grazer, songbird, shorebird, browser, butterfly, firefly, predator, raptor, waterfowl, wader, gull, fowl, forager, herd, basker, dragonfly, bug, crawler, crab, lizard, fish, swimmer, cetacean — the fish only within ~30 m of fresh or salt water, not drawn while under the surface, seen when they rise, roll or leap; the pods beyond the breakers; one or two whales 250–700 m out, kept to 1.5 km; the water's rings and blows capped at a dozen each (`Critters.fx`); how common each species is, `ABUNDANCE` + `presenceOdds`: a lottery per 160 m patch and month, the odds falling with how settled the land is (`CritterEnv.settled`, main.ts: the houses about the walker) — the squirrels and the town birds everywhere, a turkey, a fox or a deer a sighting in a town, an elk, a moose, a bear rare even in the wild; budgets by size, `critterBudget`; animals well behind the walker aren't drawn); `CRITTER_TINT` paints a species' portrait (the Almanac's card, the kit viewer); and the walkers' dog (`dogLib`, `dogMaterial`: the tail carried and wagged side to side, `DOG_COLLAR` for the lead);
  - `signs.ts`: what animals build (the `sign†` genome) — the osprey's nest on its platform pole, the beaver's lodge, a prairie dog town's mounds (`cellSpots`: one to a cell, a cell deciding for itself; `prairieTown`, pure, shared with the sim; props.ts places them);
  - `decor.ts`: the furniture family for interiors and terraces (sofa, armchair, bed, tables, chairs, bistro and office chairs, monitor, lamps, café counter, booth, stocked shelves, plants, ceiling fan, storage bench, `cafeSet`), rounded boxes (one bevel segment; plain boxes under 1.5 cm radius) and tapered legs, merged by `mergeDecor` or instanced by `interior/mesh.ts`, plus the plain-box pieces planned rooms repeat (kitchen run, workstation, door frame and leaf, WC, vanity, bath, wardrobe, dresser, bookcase, gondola, washer, lift doors, mailboxes, racking, range), and the way in (coats on their rail, a bordered runner, the console with its lamp, a mirror, skirting stretched to each wall, a ceiling dome lit after dark or all day), and lunch on a table (`tableware`: a plate, a coffee, a glass of water, each < 500 vertices); per-piece vertex budgets in `tests/foundry.test.ts` (a sofa < 4000, a chair < 1500, the coat rail < 3200), and the wall cabinets checked there (32 cm deep, joints, handles, the shadow band, ΔE to every curtain fabric);
  - `people.ts`: one jointed person for walkers and residents — indexed and smooth (1,538 vertices, 2,626 triangles: limbs as tubes through the joints, shoes on soles, rounded hands), skinned in the shader by joint angles (`Pose`, `aSkin`; `POSE_GLSL` mirrors the TypeScript `walkPose`/`seatPose`/`beachPose`/`downPose`/`skinPoint`, which the lead and the helm's skipper use) — and its lite twin (`personLiteGeometry`, 193 vertices, smooth: the beach crowd where people are small on screen). Skin, hair, trouser and shoe palettes, 5 hairstyles, shorts/sleeves by `warmthFor(climate, month)` — all chosen per instance in the shader (`PEOPLE` define in `creatureMaterial`, marker vertex colours `MARK`; `BEACH`: swimwear, bare feet and poses), so a crowd is one draw. The shoulder joint stands inside the torso, capped by the deltoid (a sphere on it: `DELTOID`), so the arm rounds into the shoulder (round 12: the arm tube's top stood proud of it like an epaulette). Measured in `tests/people.test.ts`: no arm-top vertex above the torso's outline seen from the front and either side at 1.5 m in 45 poses (10 mm under it at worst); shoes ≤ 14 cm across and never below the ground on their feet, no normal break over 25° along a limb in 69 poses, the lead within 5 cm of the hand, standing weight shifts with planted feet, the dog's tail tip ≥ 15 cm up. Workbench: `/kit.html` → people;
  - `furniture.ts`: mailboxes, beach set, picnic table, car gear + `gearFor`;
  - `micro.ts`: the micro layer's small things (carts, A-frames, porch chairs, flags, hoops, cleats, buoys, beach gear, the mapped picnic tables, boards, cabinets, clocks, channel marks), placed by `world/micro.ts` and drawn real close up, as impostor cards further out (`docs/agent/rendering.md`).
- Lot dressing (NA): `buildings.ts` lays a generated drive (a 2.9 m strip in `walks`) beside the front walk where the map has no service way near the door, and emits `drives`; `props.ts` parks a car at the house end (never on paved ground or the sidewalk strip). Doors also get hedges or `fence:picket` runs.
  - The kerb line: a house's curbside box stands with its post 45 cm behind the kerb's face (the
    carriageway's edge; `buildings.ts`), a hydrant 60 cm (`props.ts`, 4.2 m along the kerb from a
    box, and only where that is still 35–100 cm off the kerb's face — not past a bend or the street's
    end; its mesh is `street:hydrants:kerb`). No house's box within 10 m of a commercial door (the
    margin's shops by their walls): a shop's sidewalk carries none. The ground the paint lays round
    them — flags, kerb face, gutter pan, aprons — is `docs/agent/rendering.md` "The ground you walk on".
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
    - `trees:`, `garden:`, `mailbox:`, `beach:`, `picnic:`, `parked-cars:<type>[:<gear>]`, `moored-boats:` (the map's piers, a marina's slips and a house's dock alike), `rocks:` (tile props);
    - `critter:` (wildlife);
    - `plant:` (the player's garden).
  - The spotting log, commissions, hints and critter habitat all find things by these prefixes. A vehicle model string may carry gear: `suv+surf`.
- Wildlife (`src/sim/critters.ts`) is a main-thread sim within ~90 m of the walker. Behaviour is per *role*; the species filling each role comes from `faunaMix(region, climate, place)` (`env.region/climate` from the region style; `env.place` = `styles.ts castOf`: in the lower 48 the region's own cast, `fauna.ts REGION_FAUNA`, with the range rules — fireflies only east of the Plains, the ibis on the Southern coasts, the snowshoe in the north woods), so a desert walk meets jackrabbits, quail, a roadrunner and a coyote with no new code. An animal leaves only out of sight (`STAY`: past ~95 m, out of its hours or habitat, or flown off with nowhere to land, it goes once it isn't drawn, is outside ~70° of the view, or is too small to make out — its body's radius × 600 m, at most 400 m): a flushed bird flies on level and comes down a little way on (`landing`: a duck onto its water, a heron at the edge, a sandpiper on its shore, a cicada on another trunk), a squirrel, raccoon or cub comes down its tree head first once you're well off (`descend`), and a burrower dives down its hole when startled and comes up again once you've gone by; indoors (`enabled` false) the animals outside wait where they are, unseen, the same ones when you step out (Robby, 2026-10-08: animals vanished as he followed them). Habitat comes from tree instances, land cover (`field()`: lawn, meadow, shrub, crops, bare desert), the ocean edge and gardens. Behaviours: wander, flee, climb, flush, drift, and the ecosystem states stalk/pounce (fox), soar/stoop/rise (hawk). Threats: the walker, predators, and `env.movers` (traffic from `LifeClient.movers` plus the player's ride via `Vehicles.onMove`). Alarms spread (`alarm` delay). `critters.eco` tallies hunts, catches and scares. Animals are drawn 1.3–2× life size on purpose.
- Grow verb (`src/ui/garden.ts`): R plants, Shift+R picks the next seed. Plants grow while you play (about 20 min) and while you're away (IndexedDB `map-game-garden`). Each bed adds a collider and clears the grass.

## Exploring: the map paints in, and sketch mode (`src/world/explore.ts`)

(The vision's bloom, §1 — everything in view colours on first sight, to the view distance — is built
behind `?poc=1`: `world/sight.ts`, "The van" above. Without it, sketch mode below paints where you walk
and what photos frame.)


- Where you've been is a sparse bitmap on a **global** grid: Web-Mercator metres, 8 m cells,
  32×32-cell blocks. It survives re-anchoring, teleports and region changes. Blocks persist to
  IndexedDB (`map-game-explore`). It's always recorded (`explore.enabled`): the map paints in
  where you've walked (mapview.ts), and the atlas, the journal and the arrival cards count it.
- The world itself is simply painted, near and far — unless **sketch mode** is on
  (`postParams.sketchFar`, panel "sketch mode", OFF by default; `?sketch=1`, `?loop=paint`): then
  everywhere you haven't been is a pencil underdrawing to the horizon, walking paints it in round
  you and a photo paints what it frames. A walker-centred R8 texture window (4 km, 8 m texels →
  `U.uExplore` / `U.uExploreBox`) and the far window feed the post composite (`uSketch`).
  (Until 2026-10-01 a lighter "paint as you explore", on by default, laid a pale first wash over
  the unwalked ground near you. It read as fog in the distance and was removed: the map is where
  exploring shows.) The arrival card says "walk to paint it in" only in sketch mode.
- Capture mode keeps regression shots fully painted unless `?sketch=1`.
- Reveal radius grows with eye height (`revealRadius`), so flying paints wide.
  `paintedBefore(x,z)` reads the saved block, which is how an arrival card knows a first visit.
- Far cells: 64 m (8×8 fine cells), 32×32 to a block, keyed `f:bx,by` in the same store; each
  holds what photos painted there and the painted share of its fine cells (kept up as you walk and
  as blocks load). They feed the far window (`farTexture`, filled only while `explore.far` —
  main sets it with the far sketch). `valueAt` is walked or photo-painted, so the map shows both.
- Photos paint what they frame (the far sketch only; `ctx.paintView`, called from photo mode's
  shot): the frame's depth → mended (`mendDepth`: what stands thin in front of the ground — a rope,
  a post, a wire, a bird, ≤ 6% of the frame — and, riding, the ride itself (nearer than 30 m in a
  balloon's basket, 70 m in third person, 45 plane, 11 car, 14 boat) are bridged in 1/depth from
  the ground on both sides, never into the sky; unmended, a basket rope was a streak of canvas
  from you to the horizon) → world points (`render/seen.ts`) → `paintSeen` / `paintSeenSliced`
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

## The brush (`src/ui/brush.ts`, `src/player/place.ts`) — a prototype of placing

Built to the superseded `docs/GAME_DESIGN.md` §4b. Under `docs/GAMEPLAY_VISION.md` collecting is
a tap on a pencil thing (§2) and placing is "hold to paint from the sketchbook" onto your layer or
home (§6, §7); the solvers below are what decides where a thing settles. Until those land, this is
what the code does:


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
- Your van is a car chip here (`VanHook`, `brush.van`: "The van" above) — `__BRUSH__.choose('car', 'camper')`.
- Harness: `window.__BRUSH__` (open / close / aim(x, z) / choose / paint / state); `__GAME__.brush`;
  `tools/brush-check.js` → `__BRUSHCHECK__()` measures the reviewer's readability bar on the frame
  (the sketch's share of it, how much is hidden through the wash, ΔE sketch → dry) — debugging.md.

## The sketchbook layer (`src/ui/`)

- `ctx.ts` is the only view the UI gets of the game (`GameCtx`, built in `main.ts`).
  `instances(prefix,…)` finds visible kit instances by mesh-name prefix:
  - `parked-cars:`, `moored-boats:` (tile props); `kerb-cars:` (the city's kerb and lot cars)
  - `life-car:`, `life-boat:` (ambient life)
  - `ride-car:`, `ride-boat:`, `ride-plane:` (player vehicles)
- `photo.ts`: P frames the view (the zoom turns the lens: the frame follows on every screen, and
  the millimetres name the lens), Space paints a page (the grab happens in `afterRender()`, right
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
- `geo.ts`: our own lower-48 place index (Photon is gone: its public server isn't for a commercial
  game — `docs/DATA_SOURCES.md` §0). `placeIndex.ts` is the pure part, shared by the bake
  (`scripts/build-places.mjs`), the tile service (`worker/src/places.js`) and the game:
  - **Search** (`searchRemote`): `GET <tiles>/places/search?q=&lat=&lon=` — the service reads one
    gzipped shard (the query's rarest word's first three letters) from R2 `places/vN/names.bin` by
    range and ranks it (standing, name match, nearness); answers are edge-cached. Public-domain names
    only (USGS GNIS, the US Census): towns, townships, counties, hamlets, parks, peaks, lakes,
    landmarks — never a street address.
  - **Reverse** (`reverse`, arrival cards): the 0.25° tile of Census boundaries round the point
    (`/places/rt/<ix>_<iy>.json`, kept for the session) → the place it's in, else the active county
    subdivision (a township, a New England town), else the county. At sea there's no town: the card
    keeps the one you were in.
  - The base is the tile service (`setPlaceService`, main.ts; the deployed one unless `?places=<url>`
    or `?places=off`). Offline or past the lower 48 it falls back to the loaded world's streets,
    named buildings and POIs (`searchLocal` — named buildings only: no house by its address). Never
    block gameplay on it.
  - Re-baking: `node scripts/build-places.mjs [--fetch]`, then upload `raw/places/out/*` to R2
    `places/v<N>/` and deploy with `INDEX_V` (the bake) and `V` (places.js) bumped together; a ranking
    change alone bumps `RANK_V` (placeIndex.ts) and needs only a deploy.
- `credits.ts`: the credits screen — every source and service with its credit and licence, opened from
  the intro, the HUD's credit line and the journal page. `tests/licences.test.ts` fails on an outside
  host in the code with no credit, and on Photon or Open-Meteo coming back.
- `hints.ts`: providers return `{key, text, pri, once?}`, and the highest `pri` wins. `once` tips
  retire after 3 showings (localStorage). `arrival.ts` shows the place index's town cards at the
  start, on crossing into a new town, and after teleports.
- Sound (`ambience.ts`): `ui()` for brush, shutter, chime and page; halyards and lapping water
  near moored boats; leaves by tree cover; birdsong by hour; engine models for car, outboard and
  propeller (`vehicles.ride`).
