# Earth expansion — session log

Newest first. One entry per work session: what changed, what was verified, what's next.

## 2026-09-28 (v) — Seen in the browser: Seattle from the vector twins; why its traffic drove through itself (a crosswalk on every arm); summer time; stalls down Pike Place; hills without knees; Rainier's ice; Kerry Park's view kept open

Robby's computer came back: all of (u) synced (60 files), the device typecheck is clean, 275 tests
pass. Overpass was unreachable for most of the session — every mirror timed out from the browser
even for a one-node query, and the tile service (which asks Overpass from Cloudflare) timed out
with it, while OpenFreeMap, the OSM API, S3 and photon answered — so every Seattle cell came in as its vector twin
(14 of 14 on Queen Anne and at the market): real streets, buildings, parks, water, POIs, steps and
viewpoints, but none of the tags OpenMapTiles drops (a street's brick, a crossing's markings, a
steps' count, a tree's species). Late in the session Overpass answered again (504s in ~8 s at
first, then data): Queen Anne reloaded as 14 real cells, tags and all.

- **Paving follows the blocks** (the reviewer's "stair-steps through the sidewalk paint"): dense
  ground was paved in north-up 40 m squares, so any grid that isn't north-up (Seattle's is turned
  32°) got lawn in stair-steps through its blocks. Now each building is judged by the ground within
  60 m of it (a quarter built on — or one big building on its own) and paved round out to 8–14 m,
  in its own orientation (`groundPaint.ts`; a 2D render of a turned downtown before/after, and
  `tests/groundPaint.test.ts`: rings are buildings' own outlines, houses keep their lawns).
- **Wakes** (`wakes.ts`): every boat under way — the life sim's and the one you ride — draws its
  Kelvin wake behind it along its own track: two broken white arms spreading at 19.5°, faint crests
  across between them, the churned wash behind the stern, fading as they age (a turning boat's wake
  curves). Seen from 140 m over Elliott Bay: 22 boats, V wakes on the green-steel sea.
- **Hills at the wheel** (moved here from (u)'s list): the grade pulls on the car you drive.
- **Rainier on the skyline, for real**: the ring had it (97 km, 2.1° up) but as a faint bump the
  haze and a pale sky swallowed. Now (`horizon.ts`, `peaks.ts`): the glaciers and bare rock come
  from the same OpenFreeMap z8 tiles as the peaks (`landcover` ice / rock — OSM natural=glacier,
  bare_rock, scree: 211 polygons within 125 km of Seattle), each ring vertex coloured by the share
  of its own patch they cover; each vertex takes the highest of nine samples across its patch (the
  summit stood 2.6 or 3.7 km tall depending on where you stood); sunlit snow and ice carry through
  the haze, and far ranges read a step darker and bluer than the sky's horizon.
- **A viewpoint's view is kept open** (`views.ts`): the trees in front of a `tourism=viewpoint`
  (along its `direction`, else down its slope; 110 m out, ±55°) are cut back under the sightline —
  Kerry Park looked into its own spruces. The coin-op viewer faces the same way.
- **Spruces are cones, not plates on a pole**: each whorl at least as deep as the gap to the next,
  a leader closing the tip; and the near-crown rim dissolve (MF6) bites only a lobe's sides (a
  spruce's flat whorls seen level were all grazing surface and thinned to plates).
- **A market is its whole building** (`realTile.ts`): a marketplace node inside a building names it
  and sets its use over the diners and bars mapped inside first (the twin put Pike Place's Sanitary
  Market and Corner Market under their restaurants). Tile cache **v21** (`t/v21`, `&v=21`,
  `DIRECT_V` 21): **redeploy the tile worker**.
- Harness: `__SPOTS__` pins a fair day (the automatic weather drifted between frames); an
  instanced crowd's hidden slots no longer count as an occluder (NaN-distance hits);
  `?capture` frames keep running in a hidden pane via `__PUMP__`.
- A cloud copy of the game for smoke tests when the computer is away (esbuild bundle + static
  server + headless Chromium/SwiftShader on the Sea Bright bake; vite is blocked in the cloud):
  boots with no errors, golden hour, aerial and an interior render (scratch, not committed).

**Round 8** (REVIEWER.md): 6.5/10, not passed — the bay is water and the Needle is on the
postcard, but Pike Place was an empty lane, the clock an hour late, the far city a sand plain,
crowns still slabs, and the harness's asserts blind. What followed, same session:

- **Summer time** (MF5): the open world kept a longitude zone (`Etc/GMT+8`), so every `?at=` place
  ran an hour late all summer — "18:20 golden" at Kerry Park had the sun 5° under the horizon.
  `tz.ts` draws the four US zone lines latitude by latitude (Arizona apart; Mexico and the sea keep
  their longitude zone) and the browser's tz database does the rest: Seattle is
  America/Los_Angeles, 18:20 PDT is golden (`tests/tz.test.ts`, 26 cities; the panel names the zone).
- **Market streets** (MF1): within 60 m of a market hall, the shared streets (residential, living,
  pedestrian, service, footway) get stalls down both sides every 3 m where there's room, facing the
  street, and park no cars. Pike Place at the Corner and Sanitary Markets, lens mid-street both
  ways: stalls both sides, vendors, a crowd (shots/spots-r8-market2.jpg).
- **Knees in the graded streets** (MF2): each junction pin held only its own node flat, so on a
  steep grid a 22% street kinked from flat to 36% just past the crossing. Pins now hold the whole
  crossing band; a stretch between two pins that ask more than the class allows is capped per
  stretch; the ground target reads the carriageway before the corridor and the shoulder
  (`grade.ts`; `tests/grade.test.ts`, a Queen Anne–style grid: worst local grade < 25% on an 18%
  hill, < 30% at 22% — was 36%). `__GRADES__` on Queen Anne: 3,524 ways, 60 over 25% (was 108) —
  the rest at bridge ends and overpasses (N Northlake Way, N 34th St, 15th Ave W × W Garfield St),
  service roads, W Wheeler St, one knee left on 2nd Ave W.
- A LiDAR tree's crown is at most 1.35× as wide as it is tall (was 1.8×: wide flat stacks at 7 m).
- **The traffic that drove through itself** (Robby's "cars going through the roads"; MF2). With
  Overpass back, Queen Anne's real cells showed it at once — `__CAROBB__` 35 overlapping pairs,
  31 of them moving, and a new probe (`__CARPROBE__`: a private copy of the sim on the page's road
  graph, minutes of traffic in seconds, each overlap classified) 5,677 overlapping pair-ticks in
  70 s. The cause: Seattle maps a crosswalk on every arm of every junction (a footway crossing
  the street through a node), and the life graph split streets at every shared vertex — 70% of
  junction arms (3,016 of ~4,300) were 5–8 m stubs *inside* the junction's box. A car arrived on
  the stub already "in the box" and skipped the lights, the stop sign and the queue beyond; one
  edge of look-ahead couldn't brake for a queue two stubs on. Now a street isn't split where only
  a footway meets it within 34 m of a junction (`life.ts`; the crossing's two halves still join,
  and a mid-block crossing still joins the street). Then, with junctions obeyed, three more:
  the box check counted the car queued *behind* in the same lane as "0 m in front", so a car at
  the line waited on its own follower and signalled junctions locked solid (only cars ahead
  count now); a car could spawn 9 m in front of one doing 12 m/s and be rear-ended (spawns need
  braking room behind); the 25-s knot release at a stop sign pulled out into the next car on a
  busy road (it waits for a lull). Parked cars: a bend's inside kerb, a lot drawn up to the street
  and unjoined corners put two cars in one space — one car to a space now (`oneToASpace`, box
  test, first keeps it). **Result on Queen Anne: `__CAROBB__` 35 → 1 (moving 1, parked 0),
  the probe 5,677 → 4–16 pair-ticks, no car stopped for good.** Tests: a 3×3 grid with a
  crosswalk on every arm (8,053 overlapping pair-ticks → 0, and no approach split near a
  junction), a bend's and a lot's doubled spaces. The one residual is an offset "jog" (two
  T-junctions 7.8 m apart acting as two stops).
- The Counterbalance (MF2's test): from the crest on the road crown the kerb 50 m ahead is 11.5°
  below eye level (100 m: 9.8°, 400 m: 8.4° — 57 m of drop), the Needle past the brow
  (shots/spots-r8-counter2.jpg 1); a 3 m generated retaining wall stands 1.4 m from the west
  sidewalk where the DEM rises 3 m above the graded street (counter 4 — a pose the assert missed).

**Round 8b** (same session): 7/10, not passed — "Pike Place opened and the cars stopped crashing —
now they barely move": 61% of Queen Anne's cars stand still at any moment (all-way stops at every
unmapped residential corner; Seattle's are mostly uncontrolled or traffic circles). Next, ranked:
traffic that flows (control from the tags, junction clusters merged, no spawn in view), open the
market hall, cuts as places (rockeries, hedges, stairs to the lots), asserts that see.

- **Traffic that flows, first steps** (must-fix 1 — built and unit-tested after the computer went
  offline; not yet seen in Seattle):
  - *Unmarked corners where the map marks its signs* (`traffic.ts`): with stop or give-way signs
    mapped within ~250 m, a corner with none has none — its arms are OPEN: no sign; slow to ~4.5 m/s,
    look, first come first served, a dead heat to the car on the right; a minor arm gives way to the
    main road unsigned. Where the map marks no signs at all the rule of the road is unchanged (Sea
    Bright maps only its 9 signals: no change there).
  - *Junctions a short link apart are one box* (a jog, a divided road's two carriageways): a car in
    either holds both.
  - *Nothing pops into view*: the walker's facing reaches the life sim (header `PLAYER_YAW`); cars
    are spawned, recycled and thinned only outside a ~65° cone ahead within 260 m (a test grid: 130
    pop-ins in two minutes → 0).
  - Walkers resting on the beach no longer vanish when tiles stream in.
  - Tried and backed out, with the reasons in the scratch notes: a left-turn pocket on wide streets
    (followers passing a waiting turner overlapped it), a main road's own stream ignoring each other's
    box claims (overlaps at corners), traffic thinned by street class (it thinned the town, not the
    streets round the walker; spreading the ring instead exposed U-turns at dead ends).
  - **Measured live once the computer was back — and the probe corrected.** `__CARPROBE__` handed
    the sim its clock once (`setEnv` copies), so the lights never changed and no box claim ever
    aged. Its "55–65% stopped" (and 82% on Queen Anne at first) was mostly that. With the clock
    ticking, on Queen Anne's 16 real cells:
    - 150 s: 0 overlaps, 63% of cars stopped at a given moment, 2.0 m/s mean, the longest wait 56 s;
    - 300 s: 2 pairs at junctions, 66% stopped, the longest wait 61 s.
    - No knots. Of the stopped cars, 75% are in queues behind others; the queue heads are red
      lights 6%, priority arms 8%, stop signs 4%, all-way 3%, open corners 1%.
    - Next is the queues: discharge at green, and the demand model — traffic by street class
      entering at the ring's edge (R.26).
  - **Found live:** `__CAROBB__` shows moving cars through parked ones (66 pairs in 20 s), all on
    wide one-way streets with kerb parking (West Queen Anne Driveway, 10.9 m, parked both sides at
    ±4.3 m). A one-way's two lanes sit at ±w/4 = ±2.7 m, into the parking lanes. Fixed next: lanes
    between the parked cars.
- **Cuts as places** (must-fix 3, `retaining.ts`): a retaining wall is built the way Seattle
  builds them — a rockery where the cut is low (up to ~3 m, most of them): basalt boulders in
  courses on a face leaning back into the hill, dark joints, moss on some lower stones; else poured
  concrete: panel joints every ~3.3 m, the rain's stain washing up from the foot, a coping. On top
  a clipped hedge, a pipe rail along concrete over 1.8 m, or the lawn — no more blank grey slab
  (counter 4). Seen offline through the prop shader (scratch renders); `tests/retaining.test.ts`:
  runs and kinds, nothing proud of the face or past the ends, a vertex budget, hedges along the
  top. Next: a stair through the wall to each lot's door (needs the doors in the tile worker).
- **Asserts that see** (must-fix 4, `tools/spot-shots.js`): once a frame has settled, one extra
  render through a flat id material measures what the lens actually sees — the subject's visible
  pixels (≥ 5%, occlusion included), anything within 2.5 m above knee height (≤ 5% of the frame) or
  within 4 m (≤ 15%) — and a miss is stamped under its frame on the sheet (✗ …). Not yet run live.
- Tests: 288 pass (crosswalk grid, open corners and turn order, pop-ins, a bend's and a lot's
  doubled parking spaces, retaining walls). `__CARPROBE__` joins `tools/grade-audit.js`.

## 2026-09-28 (u) — A real cell in a second whatever Overpass does; Pike Place a market; the kerb as the map draws it; water with its own colour and foam; oaks and maples that read

The rest of round 7's must-fixes (MF4–MF6) and most of its should-fixes, built while Robby's
computer was unreachable: **typecheck + 268 tests pass, nothing below is browser-verified yet**
(the round-8 captures are the gate).

- **The vector twin** (`vectorTile.ts`). Overpass's mirrors stopped answering, so a cell's
  stand-in is now its OpenFreeMap vector tiles translated back into the Overpass JSON `osmToTile`
  reads — real streets with names, classes, bridges, tunnels and layers; buildings with their
  mapped heights and colours; parks, woods, pitches, water; named shops; bins, post boxes, racks,
  bollards — then built exactly as a real cell (its sea, its graded streets, its LiDAR). Undone
  from the tiles: ways cut at tile edges (stitched on the same edge line, facing, within a
  window), buildings in both tiles (kept once, whole when both tiles see them whole), junction
  nodes simplified off straight streets (streets re-noded where they cross, overshoot or fall
  short by a snap). Four code-review passes. `DIRECT_V` 20 / `t/v20`.
- **Pike Place reads as a market** (MF4, from tags): stalls under awnings along the street faces
  of any `amenity=marketplace` building (and canopies against one) — five trades, a vendor behind
  each, shoppers in front (`assets/market.ts`); `surface=brick/sett/paving_stones` paints the
  street in its courses (`streetSurface`).
- **Evidence** (MF5): every spot pose asserts no occluder within 2.5 m, not inside, not on a roof,
  its subject filling ≥ 5% (`tools/spot-shots.js` returns `fails`). **Tunnel portals**: a concrete
  headwall round a dark mouth where a street goes under (`portals.ts`) — SR 99's cars now dive
  into the dark, not through asphalt.
- **Crowns at 5–10 m** (MF6): a lobe's grazing rim breaks into leaf-sized bites near the eye;
  the cherry's underside hangs in clumps; the poplar's tiers overlap to its tip.
- **Water with its own colour** (styles.ts `WaterLook`, after the Forel-Ule scale satellite
  ocean-colour maps put on every coast): Puget Sound green-steel, the Keys turquoise over sand,
  the Gulf's marsh-fed olive, boreal and glacial waters; the NJ shore keeps its Atlantic.
  **Lakes are water**: their sheets use the water shader (ripples, the sky in them) instead of a
  flat colour. **Foam on every streamed coast** (`shore.ts`): each sea node's distance to the land
  from the cell's own patch; a strip of lace at the waterline, backwash and wash (the reviewer's
  "foam at the seawall").
- **Street furniture exactly where the map puts it** (`furnitureClass`, `assets/street.ts`):
  crossings (painted ladder or two lines by `crossing:markings`, nothing where unmarked; the
  junction's inferred crosswalk steps aside), street lamps (a mast at each, arm over the street,
  the spaced-out lamps step aside), bins, post boxes (blue box / red pillar), bike racks with a
  bike or two, drinking fountains, bollards, parking pay stations.
- **The kerb** (`kerbside.ts`): spaces kept clear of corners, driveway and alley mouths (curb
  cuts), crosswalks (mapped, or where a footway crosses), hydrants (15 ft, its own kerb) and bus
  zones; ~80% taken downtown, lots too. Far parked cars stand on the live ground (they hung over
  downtown where their tile was built on a stand-in's DEM).
- **Trees that read** (should-fix): the oak a broad, low-forking spreader with a billow at each
  heavy limb (never a ball on a pole); maples a full egg down near the lawn (sugar, red) or the
  Northwest's three-stemmed bigleaf (gold in autumn); autumn turns **tree by tree** — the first
  maples by late September, crowns from the sunlit top — instead of every tree faintly tinted.
- **Rainier on the skyline**: the horizon ring reached 70 km — Rainier stands 95 km from Kerry
  Park, so it was never drawn. Now z10 to 60 km and z9 to 125 km; summits see over the haze
  (the aerial wash thins with height), so snowfields read while their foothills go blue.
- **Trees keep their mapped species**: `natural=tree` with a `genus`, `species`, `taxon` or common
  name is that tree (maples, oaks, cherries and crab-apples, London planes, elms, firs and cedars,
  palms, palo verde…), at its mapped `height`; a LiDAR crown within 3.5 m of a named tree takes its
  species (the survey measures, the map names). The bigleaf maple grows only in the Northwest.
- **Big floorplates aren't ballrooms** (the fourth flag): an office, civic building or apartment
  block over ~450 m² is a lobby at the door and rooms off it every ~10 m (walls step round the
  stairs and the door; each room its own paint — seven a storey now, not three); open offices fill
  with desk pods, big lobbies with seating groups. A supermarket stays an open floor of aisles.
- **Every `highway=steps` a flight you climb** (`stairs.ts`): even risers (~16.5 cm, or the mapped
  `step_count`) between the ground at its two ends, each tread a solid concrete block into the
  slope, a handrail on posts either side, and the walker (and the town's walkers) climbing a deck
  through the middle of each tread — the Pike Street Hillclimb, Queen Anne's stairways. Generated
  retaining walls step aside where the map already has a wall.
- **Viewpoints know their view** (`tourism=viewpoint`, `peaks.ts`): a coin-op viewer stands on
  each, looking along its mapped `direction` (else downhill); the summits round you come by name
  and height from OpenFreeMap's `mountain_peak` layer (a few z8 tiles, refreshed every 40 km), so
  standing there says "the view: Mount Rainier, 97 km to the southeast — paint it", and P turns
  you to the summit before the sketchbook opens (the reviewer's Rainier pose, as gameplay).
- **Playgrounds** (`assets/play.ts`): swings, slides, play towers, seesaws, spring riders,
  roundabouts, sandpits and climbing frames where the map puts each (`playground=*`, nodes or
  ways); a mapped playground the map left empty gets a tower, swings and the rest fitted inside
  its outline along its longest side, clear of paths and each other.
- **Brick, sett and flagstone streets** are laid in their units (running bond, staggered setts,
  slabs — a canvas pattern at the paint's resolution) instead of dotted lines.
- **Hills at the wheel** (the reviewer's hill-driving idea, `vehicles.ts`, built after the rest,
  shipped with (v)): the grade under the car pulls on it — a climb takes speed off, a descent
  coasts on (rolling friction eased to let it), and a car stopped on a street past ~15% with
  nothing pressed creeps back down it; a gentler one holds.
- **A code review of all of it** (a separate agent, scripts against the real modules) found and
  this entry fixes: the pack **dropped the tree shader's defines** — every species' autumn hue,
  the cherries' blossom and the willows' sway were silently off on every streamed tile since they
  landed (now carried, with a test); the tile service still keyed R2 `t/v19` (now `t/v20` — v19
  JSON would have been served forever without species, furniture or crossings); market stalls
  doubled by a cell edge (each stall is its own cell's); office pods at ~7,700 vertices each
  (plain boxes now, a dozen a building); far parked cars posed and re-grounded 50–70k times a
  refill in Manhattan (only drawn cars are posed; their ground is cached until a tile mounts near
  them); the coast foam and lake sheets z-fighting past ~400 m (polygon offset); lamps hung on
  wires or walls built as masts in the road (dropped; one mapped in the carriageway steps back to
  the kerb); autumn colour that turned back at the end of the season (a one-way `turn` progress
  now, tested monotonic); one mapped crossing hiding three of a junction's four crosswalks (per
  arm now); a bus stop mapped on the street's own line clearing neither kerb (both now); the open
  world's sea plane drawn over the horizon ring's far low land (it fades out past the streamed
  cells — the ring carries the far sea); the DEM tile cache growing forever (LRU of 600).
  A second pass on the fixes and the new work found and this fixes: a lookbehind regex (older
  Safari can't parse one — the whole app would not have loaded on iOS ≤ 16.3); map text (a peak's
  name, a place label, a journal entry) put into the page as markup (now text); playground
  fitting that could cost seconds of worker time (a way grid, bounded tries, indoor playgrounds
  skipped); stairs sinking into convex hillsides (treads lifted to the ground, a plinth and side
  walls on concave ones); swings and climbing frames drawn as ways standing 90° off; a lamp on the
  street's own line left in the road; autumn snapping green on the 20th of January (it fades with
  the spring's warmth now, tested continuous all year in three climates); the DEM cache per thread
  (250 tiles); a failed peak fetch waiting 40 km to retry (a minute now; an empty sky isn't a
  failure).
  **Offline evidence**: every touched shader variant (water, lake, shore, 20 tree/prop variants,
  horizon, interiors — 25 programs) compiles in headless Chromium's WebGL2; the oak, maples,
  street furniture, stalls and paving rendered offline and looked at (scratch line-ups).
- Pending on the device: sync, worker `t/v20`, the vector twins on Queen Anne and Pike Place,
  stalls and brick, walls, `__GRADES__`/`__CAROBB__`/`__TREES__`, portals, crowns, foam, the
  Kerry Park pose (47.6295, −122.3599, bearing 152), then round 8.

## 2026-09-28 (t) — The bay is water from the map, the traffic rides the ground you see, streets graded like a road engineer would

Round 7 (6/10, not passed) ranked six must-fixes; this entry is the first three, plus the cause
of Robby's "the cars are still going through the roads in Seattle".

- **The cars drove on a different ground than the one drawn** (the real cause). A real cell's
  worker build carries its own ground — the DEM at 4 m, its streets graded into it, the map's
  water pressed in — but the main thread kept whichever patch registered first for the cell, and
  the 16 m stand-in always lands first. So the walker, the moving cars (`LifeClient.ground`), the
  parked cars' refits and every main-thread height read the stand-in's ungraded 16 m ground while
  the street you saw was cut into the hill a metre or three away. The real twin's patch now takes
  over (`stream.ts`, when it is at least as fine: `Terrain.patchPitch`). Measured downtown: the
  real cells' patches read 4 m after the swap (16 m before it).
- **Water from the map, never the DEM** (MF1). Stand-in cells (and a real cell's sea) take their
  water from OpenFreeMap's vector tiles — the OpenMapTiles planet, OSM's water and the coastline
  already closed into ocean polygons, from a CDN in a fifth of a second (Overpass took 25 s for a
  four-line query, then stopped answering at all). `mvt.ts` reads the protobuf (no dependency);
  holes are islands (they stay land); a lake stands at the level the hydro-flattened DEM gives
  inside it (p30 of its interior nodes — every cell along Lake Washington finds the same 6.4 m),
  its sheet clipped to the cell; where the vector tiles answer, ground the DEM called sea but the
  map calls land is land (a seawall no longer eaten by the smear, a town below sea level dry).
  A real cell wholly out on the bay (no coastline crossing it) was a DEM smear with nine trees on
  it; its sea is the ocean polygon now. And the virtual region's slice ground — built at startup
  before any cell knew its water — stood 1–3 m over Elliott Bay as a lawn wherever a cell cut its
  sea away; it steps aside for streamed cells now, like the backdrop (`ground.ts` SLICE).
  *Test (the reviewer's):* the four bay cells forced to 504 (`?fail=`): 3,203 wet samples raycast
  from 400 m, nothing standing on the water but Colman Dock's deck and Lake Union's sheet;
  `shots/spots-bay-mvt3.jpg`.
- **Black flecks on the sea** — the sun's glitter came out as a cloud of dirt. The Kuwahara pass
  divides by its sector weights with a floor of 1e-5; where every sector holds bright dashes the
  weights are ~1e-13 and the pixel went black. Divided by the true sum now (the plain mean if
  nothing is left).
- **Streets graded like a road engineer would** (MF2, `grade.ts`). On top of (s)'s smoothed
  profiles: a hard grade no stretch may pass whatever the DEM says (8% motorway … 24% residential;
  a tagged `incline` + 5 points), held by a cone from each junction and a forward/backward pass;
  junctions a short block apart that the DEM puts further apart in height than the block can
  climb meet each other halfway (one local step, so a seam still grades the same from both
  tiles); every junction a round plateau however short the next way; each ground node takes its
  target from the nearest point of each street (an average of every 4 m piece in reach smeared a
  profile's knees past its limit) and a street's own corridor outranks a neighbour's shoulder.
  **Retaining walls** where a street is cut more than 0.6 m into the hill: concrete panels at the
  back of the sidewalk, facing the street, stained at the foot, never across a crossing street, a
  path, the steps or a driveway, never where a building stands; walkers meet them as walls.
  Tests: a 20 m block on a 50% smear (junctions meet halfway, nothing past 25%), a 30 m cliff,
  honest 18% hills kept, seams identical, walls uphill only with their gaps.
  *Audit* (`tools/grade-audit.js` `__GRADES__`, the car's own surface — ground or deck — every
  4 m, only inside real cells): downtown 2,425 ways, 47 over 25%; the rest sit at seams with
  cells still loading, on Colman Dock's ramps and along I-5's trench and lids (open: trenches).
- **No trees on structures, and the masts drawn** (MF3, v19 work): broadcast masts, water towers,
  chimneys and flagpoles from `man_made` (a mast in red-and-white bands with a beacon, scaled to
  its mapped height); no tree inside a footprint or within 15 m of a mast, chimney or water tower;
  LiDAR "trees" over 50 m (masts, towers) dropped. `__TREES__` counts trees standing more than
  3 m up, over 45 m, or inside a footprint: downtown 14,683 trees — 20 up (raised plazas), 14
  over 45 m (48–50 m "spruces" by the stadiums: light towers the LiDAR read as crowns), 25 in a
  neighbouring cell's footprint at a seam. Open.
- **Tile cache v19** (`t/v19`, `&v=19`, `DIRECT_V` 19): **redeploy the tile worker.**
- Harness: `__GRADES__`, `__CAROBB__` (overlapping cars, moving and parked), `__TREES__`
  (`tools/grade-audit.js`); `?fail=cx_cz,…` makes a real cell answer as a 504 would.
- Overpass's three mirrors stopped answering during the session (status pages time out) — only
  cells the tile service had cached came in. Next: a vector-tile twin (real streets and buildings
  from the same CDN) in place of the synthetic stand-in, so a cell is real in a second whatever
  Overpass is doing.

## 2026-09-28 (s) — Seattle's hills and Pike Place: streets that lie on the ground, cars on four wheels, tunnels under the city, a bay that stays a bay; courts in the parks; the open-data catalogue

Robby: "the cars are still going through roads in Seattle, the roads aren't looking good with the
hills, and Pike Market too" — and: list every neighbourhood feature and the best open source for
it, so we know exactly where everything goes, at scale.

- **Streets on hills** (R.16). The far street ribbons were two strips draped separately 2 cm
  apart, asphalt over a wider sidewalk: on bumpy ground the sidewalk won as often as not, and
  Seattle's streets went pale and blotchy (measured: the ribbon's own sidewalk colour covering
  its asphalt; hiding the ribbons showed the painted streets underneath were right). Now the
  painted ground carries the street near the walker (lanes, kerbs, sidewalks, crossings, exactly
  on the ground) and the ribbon steps aside inside the paint's fine window (`propMaterial` PAVED
  dissolves over the same ramp the paint fades in). Past it, the ribbon is asphalt only, in the
  paint's own colour (`roadPalette.ts`, shared), each station a real cross-section (both kerbs and
  the crown) riding the rendered ground — the 8 m lattice the tile's ground is built on
  (`ground.ts latticeHeight`), never the raw DEM under it — with a depth offset that holds a
  kilometre out. Tests: a crest, a sag under the lattice, the lattice = the ground mesh.
- **Cars on four wheels** (R.16): moving cars (`LifeClient`) and parked ones within 110 m
  (`kerbCars.ts`) pitch up the grade and roll to the camber from the ground under their wheels
  (±1.4 m along, ±0.8 m across), not level on the one spot under their middle — no more bonnets
  buried in Queen Anne. The height comes from the open-air surface nearest the car
  (`WalkWorld.outdoorNear`), so a street under a bridge keeps its cars.
- **Tunnels** (`realTile` `tu`): SR 99's bored tunnel was drawn as a motorway across downtown and
  the waterfront, cars driving it through the blocks (so were Boston's Big Dig and the Hudson
  crossings). A tunnel is now split off at the one build choke point (`tileBuild.ts`): nothing
  paints, furnishes, parks along or faces a door to it; only the car graph gets it, dropping 9 m
  under the portal at 8 % so a car drives down into the ground and out of sight (hidden once
  under), and nobody walks it. Building passages stay streets. Indoor corridors mapped as
  footways and tunnelled rail are dropped.
- **Canopies** (`building=roof`, `carport`): a filling station's canopy, a market's covered walk,
  a platform roof were solid sheds standing in the street. Now an open roof at the right
  clearance (mapped `min_height`, or just under a mapped `height`, else 4.4 m for a big one, 3 m
  for a walkway, 2.4 m for a carport) on posts every ~7 m round its edge, walkable underneath.
- **The bay stays a bay** (`realTile` coastline): each stretch of coast was closed against the
  cell on its own, from ends projected onto the edge with a clamp that did nothing to a point
  inside — a pier's outline poking into the cell from the north claimed the whole cell as bay,
  so Pike Place Market's tile lost its ground, and the rest of Elliott Bay was lawn with trees.
  Now every stretch is cut exactly where it crosses the cell edge and the stretches are walked
  clockwise into one sea polygon (the same rule OSM's coastline tools use), headlands and piers
  left dry. Tests: Seattle's shape (a shore and a pier loop), a coast turning inside the cell.
  The sea gets no water sheet of its own any more — its ground is cut away and the ocean plane
  shows at sea level; a lake is a flat sheet at its shore's low ground (the DEM near a shore is a
  smear between the bluff and the bathymetry — Elliott Bay read +15 m a hundred metres out — and
  the draped sheets tilted through the air). Mapped pier decks are areas in their surface's
  colour (Seattle's concrete piers were lawn with trees).
- **Courts and fields** (`sports.ts`, `assets/sport.ts`): a mapped pitch keeps its `sport` and
  `surface`; the ground paints the court (run-off, playing surface, and in the fine window its
  real lines — keys and three-point arcs, singles and service lines, the kitchen, penalty boxes
  and arcs; a diamond's skinned infield, grass, mound and foul lines) and props stand the gear
  exactly on those lines: hoops on gooseneck posts (a half court gets one), tennis / pickleball /
  volleyball nets, full-size or kids' goals, a backstop and bases. A block of four tennis courts
  mapped as one polygon gets four courts. New foundry family with validation and budgets.
- **The open-data catalogue** (`docs/DATA_SOURCES.md`, also in the claude.ai project): the best
  open source for every kind of thing in the US (OSM, 3DEP LiDAR/DEM, Overture, NAIP, NLCD,
  canopy height, city tree inventories, GTFS, GBFS, HPMS traffic counts, Census/LODES, NHD, AIS,
  PAD-US, Mapillary…), a feature-by-feature catalogue with the exact OSM tags and what the game
  does with each today, the fallback ladder (mapped → measured → inferred → procedural), and the
  plan to scale past Overpass: cut our own cells offline from the OSM extract + Overture, enrich
  each once (LiDAR, NAIP, trees, transit, traffic), serve from R2.
- Also since (r): Seattle's ground was beige sand everywhere (the open world's flat layer said
  "ocean 0 m away"); a marine autumn now waits for the short days (Seattle turns in late October,
  not September); the PNW and the mountains get their conifers; house footprints count less than
  shops toward a block's paving.
- **Tile cache v18** (`t/v18`, `&v=18`, `DIRECT_V` 18) — tunnels, courts, coasts, canopies, pier decks:
  **redeploy the tile worker**.
- Harness: `tools/spot-shots.js` (`__SPOTS__`): look at real places by latitude/longitude — on the
  sidewalk of the nearest real street, from the air, or beside the steepest-driving car nearby.

## 2026-09-28 (r) — NYC's towers stop vanishing; no more streets named "synth"

- **Why the towers vanished** (R.17), measured in-page by raycasting every skyline tower top
  against the real tile that replaces it: (1) the skyline stood every tower on the zoom-9 DEM,
  and zooms 9–10 are SRTM-class surface models that read Midtown's roofs as ground (64 m at
  5th & 38th, 44 m at the Empire State; bare earth is 23 and 15) — every impostor tower stood
  30–40 m too tall and sank into the city when its tile swapped in. The skyline now reads
  zoom 11 (bare earth): after the fix most cells match their real tiles within 8 m (median
  0 m). (2) A tower straddling a cell edge lost its shaft: each building:part was owned by the
  tile holding its own centroid, so 30 Hudson Yards' outline and podium came with one tile and
  its 390 m shaft with the next — the skyline handed the tower off when the first tile landed.
  Parts now belong to the tile that owns their outline (`realTile.ts`; test). (3) A survey that
  predates a tower no longer shrinks it: a building mapped with 10+ floors keeps its height when
  the LiDAR saw less than 55 % of it (Hudson Yards went up after NYC's 2017 flight;
  `applyMeasure`, tests).
- **Tile cache v15** (`t/v15` in the worker, `&v=15`, `DIRECT_V` 15) for the part ownership —
  redeploy the tile worker.
- **Placeholder streets** (R.3): the synth stand-ins were named `synth-st-N` — on the place
  label, the map, street signs and search. They're unnamed now, and the map pencils them in
  (dashed, faint) with a note that the real map is still arriving.

## 2026-09-28 (q) — Crosswalks, dogs and joggers, squirrels on the bark, fewer animals downtown, six new trees

Robby's play-test list (backlog §10), the P0s that live in the sim and the foundry.

- **Crosswalks** (`lifeSim.ts`, R.15): a walker at a junction corner plans the way over — the next
  street's sidewalk chosen so they cross the fewest streets (people cross once, not diagonally
  through the box) — and walks round the corner to the kerb at the **painted crosswalk** (the
  ladder `groundPaint` draws at the setback + 1.2 m), waits there, crosses square to the far kerb
  (`CROSS` legs 0/1/2), and walks on. At a signal they start only on the walk (the crossed
  street's red, its first 10 s — then the hand flashes and turning cars get the rest of the
  green); elsewhere only in a real gap (no car whose way through the junction crosses theirs — a
  car still deciding counts — could arrive before they're over, none in the box, none turning
  into their street), with courtesy to a car that has waited 8 s. After 25 s they go at the first
  gap a car can stop for.
- **Cars stop for them** (`lifeSim.ts`): the stop line moved back — a waiting car's bumper is just
  short of the crosswalk (`STOP_BACK` 5.4 m behind the setback; the stop sign now stands there
  too, `props.ts`) — and a car holds at its line for anyone crossing the street it's on or the one
  it's turning into (looked for from a comfortable braking distance), and a car already in the box
  stops short of a crosswalk someone has stepped onto. Cars never spawn inside a junction box or
  within braking distance of one.
- **No more fused cars** (R.2): a signal no longer overwrote the left-turn yield (it did — left
  turners crossed oncoming traffic at every light); the oncoming queue at a green goes first unless
  the left turner has waited out a whole red, when it takes the box and the queue waits; two lanes
  merging into one zip (the car in front in the other lane leads); a car rolling into the box from
  another approach, bound for the same lane, goes first; anyone standing in the box across your
  lane is in front of you whatever edge the graph put them on; a duplicated way is one edge
  (`life.ts`); the 25 s jam breaker never overrides a red, a turn across traffic or a crossing.
  **A 3-minute busy grid** (primary × secondary signal, all-way stops, 46 cars, 343 walkers):
  0 walker-in-car ticks (was 2,656), 0 fused-car ticks (was 294), no car stuck > 150 s.
- **People variety** (R.11, part): dog walkers (a dog on a lead trotting ahead — coat by hash —
  it stops to sniff), joggers (running pose: elbows bent, leaning into a longer stride; they never
  stop to chat), headphones on one walker in seven and more than half the joggers.
- **Animals by habitat** (R.7): grazers and burrowers never on pavement (a paved-lot/plaza index
  from the tiles), squirrels not placed on the paved spot under a street tree, and every species'
  count scaled down in town (a downtown gets fewer). Sea Bright's busiest junction: 5 squirrels,
  8 butterflies, 2 songbirds, 1 rabbit within 90 m.
- **Squirrels on the bark** (R.8): the climb stops at the scaled tree's crown bottom (not the
  model's height) and the squirrel's feet sit on the trunk's surface at that height — its real
  radius (tapering), leaning with the tree (`TreeMeta.lean`, instance yaw/scale from
  `ctx.instances`, which now skips hidden meshes).
- **Six new trees** (R.5, `flora.ts`): maple (dense oval crown, scarlet in autumn), weeping willow
  (a dome and a curtain of tresses that swing in the wind — `propMaterial` WEEP — by fresh water),
  American elm (a vase of limbs under a broad dome, gold in autumn), columnar poplar (a spindle; a
  dark cypress on a Mediterranean hill), southern magnolia (evergreen, dark, an egg of foliage to
  the lawn), flowering cherry (low and spreading, pink in April — `season.ts` bloom, BLOSSOM).
  Picked per spot by region and subregion (maples and elms in the Northeast and Midwest,
  magnolias in the South, cherries and bigleaf maples in the PNW, poplars in the mountains) and by
  a LiDAR crown's proportions (slim → poplar, broad → oak/elm); within 600 m of Sea Bright's
  centre: 334 round, 269 oak, 178 maple, 66 elm, 63 poplar, 34 cherry, 32 willow, 291 pine.
- **Map search → landmark**: a landmark result (tower, monument, attraction…) lands you on open
  ground 90–220 m off, facing it (the Space Needle put you at its podium door); `view=1` carries it
  across a reload.
- Harnesses: `tools/street-shots.js` (`__STREET__`: crosswalk, dog walker, jogger, squirrels,
  downtown animal counts), `tools/tree-shots.js` (`__TREES__` studio rows, `__SPECIES__` in-world).
- Verified: typecheck; 168 tests (container runner) incl. crossing tests (waits at its kerb for the
  light on the painted crosswalk; lets the car coming go by then crosses; a car waits at the line
  for someone crossing) and the busy grid; montages `street-q3`, `trees-p1..3`,
  `species-seabright`.

## 2026-09-27 (p) — Traffic that follows the rules, people who do things: junction control, lit signals, stop signs, chats, window shopping, staff at work, residents who sit properly

Acting on the expert (Nintendo/Rockstar-bar) review's top two items — "cars follow traffic" and
"people doing things" — plus its red flags. One junction analysis feeds both what you see and
what the traffic does, so the lit lens and the stop sign are what the cars actually obey.

- **Junction control** (`src/sim/traffic.ts`, pure + 12 tests): every junction of ≥ 3 drivable
  arms, analysed in the tile builder from the real road network, ships with its tile
  (`BuiltTile.junc` → `stream.junctions` → `buildLifeInit` → per edge-end `armCtl`). Mapped
  control wins (OSM `highway=traffic_signals / stop / give_way`, `stop=all`; the Overpass query
  now asks for stop and give-way nodes); unmapped junctions get the rule of the road for their
  shape: two main roads (secondary+) crossing are signalled; a street meeting a bigger road stops
  (North America) or gives way (elsewhere); a T's stem stops; equal streets crossing are an
  all-way stop in North America. Two-phase signals (main road 26 s, cross street 16 s, 3.5 s
  amber, 1.5 s all-red) keyed by position so neighbours aren't in lockstep, on the shared clock
  (`uTime` → the life worker's header `CLOCK`).
- **Cars obey it** (`lifeSim.ts`): a car picks its next edge on the approach and looks across the
  junction (it follows the car already round the corner); slows for turns (4.8 m/s, 2.5 for a
  U-turn); stops at the stop line on red, and on amber when it comfortably can; comes to a full
  stop at a stop sign, then pulls out only when the main road is clear (3.5 s / 8 m) and the box
  is empty; takes turns at an all-way stop (first to stop claims the box); yields; never enters
  a box it can't clear; a 25 s jam breaker. Wide one-ways have two lanes and cars only follow cars
  in their own lane. Verified in Sea Bright: ~25 % of cars standing at any moment, queued 8–27 m
  from junction centres, the rest moving; no growth over a minute (no gridlock).
- **What you see** (`props.ts`, `propMaterial` SIGNAL): signal masts at every signalled junction
  (far-right corner of each approach, the arm over the lanes); the lens the traffic is obeying is
  lit (instance colour carries the junction key + phase group; the shader runs `signalState` —
  green bright, the others dark, a glow at night); red octagon stop signs (with an ALL-WAY plaque
  in North America) and give-way triangles at the stop line of every controlled arm.
- **People doing things** (`lifeSim.ts`, `creature.ts`): walkers on the same sidewalk stop and
  talk — face to face at ~1.1 m, gesturing and nodding for 8–26 s, and part together;
  window-shop (turn to the shop fronts and linger, more on shop streets); wait at a signalled
  corner for their street's green. Conversations are never cut in half by the life bubble.
- **Interiors: staff and customers where they'd be** (`interiors.ts`): café, bar and shop
  counters stand off the back wall with a 0.9 m working aisle — a barista at the espresso
  machine and one at the pastry case, a bartender, a shopkeeper at the till, each placed first
  (a business is never unattended) — with a customer waiting at the case / at the till,
  regulars on bar stools, company across café and high-top tables, a second diner across a big
  dining table; café tables ~1 per 7 m² (max 16 — the reviewer's 40-table ice-cream shop).
- **Residents sit properly** (`creature.ts` SEATED, `interiors.ts`): the pose now puts the seat of
  the trousers ON the surface and the shoes on the floor (it sat the hip joint on the seat: 8 cm
  into every chair, 19 cm into sofas — "waist-deep, shoes poking out"); thighs slope a touch to
  the knee, shins angle forward, forearms rest level, the back leans into the chair. Seats are
  the real surface heights (sofa/armchair 0.47 with give, dining 0.465, bistro 0.475, office 0.5,
  booth 0.43, stools 0.76–0.78, the foot of the bed 0.52), the sofa sitter is forward of the back
  cushions so the knees clear the front edge. **Everyone faces the right way**: a `yawTo()`
  helper replaced hand-written yaws — dining sitters, armchair sitters, booths, office workers
  and counter staff were facing away from their table/desk/customers.
- **Faces and hair** (`people.ts`): the black eye bars are whites with a dark iris; the hair
  crown has three bands and sits 6 % proud of the skull (no bald patch at the temples).
  1,584 vertices (budget 1,600).
- **Reviewer red flags**: the open front door is a door (a shop door is a glass leaf in a slim
  frame with a push bar; a house door has four raised panels and a brass knob) and apartment
  doors are painted, not black; street-tree trunks are a third thinner (`flora.ts` trunkR: a 7 m
  street tree had a 0.75 m barrel); mapped fences carry OSM `fence_type` (iron railings,
  chain-link, timber) and untyped fences in dense cores are iron railings, not white ranch rails;
  winter: asphalt keeps only ~15 % of the snow (ploughed, wet dark tracks), sidewalks are
  shovelled to a patchy path, lawns keep it all (`snowKeep` by saturation + value), snow holds the
  sky's blue after dark instead of reading as sand; open water from the DEM (a river at 0 m) now
  gets no ground chunk over it, so the water plane shows (Manhattan's far field was a tan plain);
  the aerial pose climbs above the roofs between it and the street; kerb poses keep 3 m clear.
- **City crowds** (`lifeSim.sizeBubble`): the life bubble sizes itself to the street density
  round the walker every 2 s (cars: the cap at ~25 m a car; walkers ~10 m), clamped 200–600 m /
  140–330 m, and respawns sample the ring itself (a random spot, then an edge through its cell)
  rather than the whole graph; the first crowd spawns in the bubble. Midtown at 1 pm: cars within
  150 m 9 → 67, walkers 42 → 127.
- **Robby's play-test (late)**: taking a parked car no longer stops after a second — its own
  parking outline boxed it in (`WalkWorld.clearFootprint`, also on tile remount); cars no longer
  drive fused together — spawns keep 9 m from any car, a dead heat goes to the lower slot, left
  turns wait for a gap in oncoming traffic (two opposite left turns pass), all-red 2.5 s. The rest
  of his list is triaged into `docs/IMMERSION_BACKLOG.md` §10 (bugs) and §11 (the big ideas), and
  the reviewer's brief now carries his whole checklist.
- **Harness**: `tools/life-shots.js` — `__LIFE__(tag)` → `shots/life-<tag>.jpg`: a signalled
  junction from above, its lenses from the kerb, a stop sign, the junction at night, a resident
  in a soft chair and their face, staff behind a counter, a customer at a table, two people
  stopped to talk, someone waiting at the corner for the light. (Run it with `__PUMP__()` going:
  a hidden pane stops rAF, and tiles stop mounting.)
- Tile cache **v14** (`t/v14`, `&v=14`, `DIRECT_V` 14): realTile emits `stop` / `stop_all` /
  `yield` points and `Line.ft`. **Redeploy the worker.**
- Verified: typecheck (check config + device tsconfig), 163 tests; montages
  `shots/life-seabright4.jpg`, `shots/place-nyc-r3.jpg`, `shots/life-nyc.jpg`.
- Next: buses on `route=bus` stopping at the mapped stops; crosswalk yielding (cars wait for
  walkers on the walk phase); protected left turns; parking manoeuvres into kerb gaps; people 2
  (dogs on leads, bags, phones, kids, queues); regional fauna in cities (pigeons, geese,
  squirrels); weather events; streaming (baked tiles on R2, dense-city placeholders).

## 2026-09-27 (o) — Place parity round 3: parked cities (kerbs, lots, a car LOD), seasons (snow, bare trees, autumn), a new default look, the Rumson double-terrain fix

Acting on the reviewer's round 2 (NYC 6/10, Tucson 5/10) and three asks from Robby: the look
chosen by side-by-side comparison (keeping the old default), snowy and other regions, and the
Rumson glitch. Reviewer after this round: **Tucson 6 → 6.5/10**.

- **Rumson double terrain — fixed everywhere** (`ground.ts`, `main.ts streamedGround`): the coarse
  backdrop raises its wooded cells 11 m as a far-forest canopy. Beside the bake (Rumson) that
  raised sheet was still drawn where detail tiles had mounted — a second, unwalkable hillside
  burying houses. A per-1024 m-cell mask over the backdrop now drops the canopy bump (and its
  leaf colour) wherever a detail tile is mounted, and discards the backdrop altogether where a
  streamed cell (or a coarse streamed cell) brings its own ground chunk. Verified at the same
  Rumson spot: trunks meet the lawn, no plateau.
- **No buildings in the river** (`buildings.ts`): the LiDAR pass adds buildings the map doesn't
  have — and over water those are bridges, barges and cranes (Sea Bright's old Rumson bridge came
  back as a row of flat blocks in the Shrewsbury). Unmapped survey finds whose centre or 40 % of
  whose outline is over water are dropped; mapped buildings over water (piers, boathouses) stay.
- **Walkers on invisible stairs — fixed** (`collision.ts outdoorSurfaceAt`, `life.ts`): street-life
  paths took the walk surface's highest candidate, so a sidewalk way clipping a footprint put its
  walkers on the top floor, striding through the air along the shopfronts. Life paths now sample
  the open-air surface (ground + decks: bridges and piers still carry traffic, floors never).
- **People with faces, sitting and talking** (`people.ts`, `creature.ts`, `interiors.ts`): eyes,
  brows (in the hair colour) and a mouth on every person (30 vertices; the hair is open at the
  front now, not a helmet over the eyes). Residents sit where the room has a seat — sofas,
  armchairs, dining chairs, booths, office chairs, bar stools (a SEATED+INDOOR variant) — and
  stand only at counters, bars and altars; a standing resident at home often has company facing
  them; businesses hold staff plus a room of customers (up to 12). Everyone talks with their
  hands now and then, and nods.
- **A skyline that stays** (`skyline.ts`): a cell's far towers now hide only once its real tile has
  mounted — hiding them within 900 m made Manhattan melt away as you flew in faster than its
  tiles streamed. Real-lite fetches run 4 at a time (was 3).
- **Seasons** (`season.ts`, pure + 5 tests): a coarse climatology — January mean from latitude,
  climate class and elevation (6 °C/km), an annual swing by climate (the North American east
  coast's continental cold, the Pacific Northwest's marine winters), a two-week lag — gives
  snow cover, broadleaf leaf fall, autumn colour and the far snowline for any place and day.
  Shaders: `snowOn` (shared.ts) whitens whatever faces the sky in world-anchored drifts —
  ground (ploughed asphalt keeps slushy tracks), roofs, sills, car roofs, conifer tops; grass
  tufts sink under it; broadleaf crowns (`propMaterial` DECID: round, oak, birch, shrub) drop
  clump by clump and colour yellow/orange/red per tree in autumn; the horizon's snowline
  follows the season (rebuilt when it moves 250 m). The date: the panel's **day of year**
  (0 = today), `?day=N` or `?date=YYYY-MM-DD` — the sun, the season, critters, gardens and the
  summer soundscape all follow the world's date now, not the machine's. Weather: **snow**
  (−1 = the season's own).
- **Look default: 'watercolor HD'** (`post.ts`): chosen side by side on Tucson (morning street,
  golden hour, horizon) against the Sep 27 default and the other presets — the same wash at a
  finer brush (paint detail 0.82, Kuwahara radius 4, sharpness 10.5) over a sharper frame, less
  paper and wobble, a light teal-shade/warm-light grade and vibrance 0.2. The old default is
  kept verbatim as the preset **'classic (Sep 27 default)'** (and 'classic half-res' for the
  look before the paint-detail knob); the full record is `docs/earth/LOOK_DEFAULTS.md`. The
  comparison harness: `__PLACE__(tag, { looks: [...], frames })` → `shots/looks-<tag>.jpg`.

- **Desert** (`flora.ts`, `props.ts`, `horizon.ts`, `groundPaint.ts`, `interiors.ts`)
  - a Washingtonia fan palm (kind 8: straight slim trunk, compact fan head, the skirt of dead
    fronds) replaces the coconut palm on dry coasts and in desert towns; coconut palms stay
    tropical;
  - mesquite / palo verde crowns are small irregular clouds with sky through them, not a flat
    umbrella;
  - the horizon reads Terrarium z10 (~130 m a pixel) to 70 km, and dry air hazes less (arid
    0.45×, Mediterranean / polar 0.7×) — desert ranges stand sharp and violet;
  - sun-bleached warm asphalt in arid climates;
  - a bar archetype (back bar of bottles on lit shelves, a stool-lined counter, high-tops,
    warm low light) instead of the diner layout.
- **Wires** (`props.ts` `wireMaterial`/`wireGeometry`): overhead wires are screen-space ribbons
  at their real projected width but never under 1.6 px, so the brush pass can't erase them —
  the criss-crossed sky of an American street reads again.
- **Streetcars**: OSM `railway=tram|light_rail` (not in tunnels) → contact wire on bracket-arm
  poles every 30 m (Tucson's Sun Link on 4th Ave).
- **Cities**
  - the life bubble (`lifeSim.recycle`): walkers > 600 m and cars > 900 m away recycle into the
    ring just out of sight (90–450 m / 110–650 m), so a city's crowd is where the player is;
  - tree pits (granite kerb, dark soil) with street trees every ~9 m and litter bins on dense-core
    side streets (none within 6 m of a mapped tree);
  - mapped `lanes` set carriageway width (3.2 m a lane + 1 m) when no `width` is tagged;
    cycleways paint as asphalt lanes (green in North America, red-brown in Europe), not a pale
    path down the avenue;
  - storefront street floors on 88 % of avenue rows (was 75 %);
  - the shadow camera reaches 1.4 km up the sun's ray (was 900 m), so towers' low-sun shadows
    land in the street.
- **Storefront frontage** (`groundPaint.ts`, `Footprint.front`): shops and apartments over shops
  stand on a 3.5 m paved apron in streamed tiles (a sidewalk's width; deeper set-backs are the
  mapped lots — the reviewer found 6 m turned front lots into a white concrete plain).
- **Fan palm crown** after the first look: sixteen broad fronds on long stalks (a ~4 m crown), a
  short trimmed skirt — it read as a knob on a pole. **Mesquite** crowns smaller, rounder lobes
  spread wider (they read as acacia umbrellas), and the desert legumes keep their own foliage
  whatever the regional greens: mesquite dusty grey-green, palo verde thin yellow-green.
- **Street wires**: a pole blocked by a porch or sign slides up to 8 m along the kerb, or is
  skipped with the wires spanning on to the next — it used to end the run, so whole streets had
  poles and no wires; ribbons never under 2 px (1.6 halved to under a pixel in the montages).
- **Auto quality** (`main.ts`): the crisper look defaults (paint detail 0.6, full screen
  resolution) step down once, ten seconds into a walk, on a GPU averaging over 25 ms a frame —
  never overriding a value the player set in the Look panel (`userKeys`). A stopgap until the
  boot benchmark (backlog 1.7).
- **Street parking** (`realTile.parkSide`, `Road.pk`, props.ts): OSM parking in either scheme
  (`parking:<side>` + orientation, or `parking:lane:<side>`) widens an untagged carriageway by a
  parked lane (2.2 m; angled bays 4.8 m) and lines that kerb with cars facing the traffic; in
  North America a town street (residential → secondary) parks both kerbs unless mapped otherwise.
  Occupancy follows built cover (most spaces downtown, a car every few houses in the suburbs,
  none on a country road); never within 10 m of a junction, 15 ft of a hydrant, or in a bus
  stop. Kerbside cars use a new lite car (kit.ts `carLiteLib`: no bevels, axle drums, lamp bars —
  and they are drivable like the driveway cars.
- **A level of detail for parked cars** (`kerbCars.ts`): props hand kerb and lot cars over as
  records (`BuiltTile.kerb`), and one manager draws every tile's — the cars within 110 m in a lite
  kit (kit.ts `carLiteLib`: one bevel step, axle drums under simple arches, lamp bars; ~700
  vertices against ~2,100), everything else out to 1.4 km as a two-block proxy (`carFarLib`, 72
  vertices, scaled to the type), refilled as the walker moves. A Manhattan tile's thousands of
  parked cars cost about a dozen draw calls; vehicles.ts finds them to drive off in (by key, so a
  taken car stays gone).
- **Parks, lots and pitches in streamed tiles** (`realTile` `LAND_CLASS`, `BuiltTile.areas` →
  `groundPaint.setTile`): the bake's land classes (parking, parks and lawns, woods, scrub,
  pitches and playgrounds, pools, golf, marinas, plazas) now reach real-lite tiles — before, the
  streamed world painted no parks at all. Surface **parking lots** get a stall layout (`lots.ts`:
  rows along the lot's longest edge, 2.7 × 5.5 m stalls, 7 m aisles) — the ground paint stripes
  it and props park cars in it at 30–75 % by built cover. Shared by both sides, so lines and cars
  always agree.
- **Bus stops**: OSM `highway=bus_stop` → a pole with a plate in the region's transit colours
  and a timetable case at the kerb; `shelter=yes` adds a glass-and-steel shelter with a bench.
- **Rails and trolley wires**: streetcar lines get their rails set in the street (two steel strips
  at standard gauge); roads tagged `trolley_wire` get a pair of wires over each direction's lane
  on kerbside bracket poles (Seattle, San Francisco, Dayton).
- **Paved city ground** (`groundPaint.ts`): a 40 m cell also paves when a third of the 120 m
  around it is built over, so the strips between a city's buildings and its kerbs pave too; the
  paving is painted under the areas, so a park in the city stays a park.
- **Life bubble, tighter**: walkers recycle past 330 m into 60–260 m (was 600 → 90–450), cars past
  600 m into 100–450 m — the NYC montage had its whole crowd a few hundred metres off.
- **Interiors that aren't ballrooms** (`interiors.ts`): a bar, café or restaurant over 20 m long
  gets one or two cross walls — the customer room at the door, a kitchen and back office behind;
  a big bar gets a longer counter (to 10 m), up to 24 high-tops and one or two pool tables.
- **Horizon air** (`horizon.ts`): the ring takes the local haze by the air's clarity (desert air
  carries far) and distant ranges go a deep blue-violet under the sky's tone, not a pale band.
- **Crosswalks only at real junctions** (three arms or more): a street whose way is split
  mid-block (a tag change) no longer paints a ladder there.
- **Worn asphalt** on streamed streets: hairline cracks and sealed patches, heavier in arid
  climates (the baked shore keeps its look).
- Harness (`tools/place-shots.js`): `opts.main` / `opts.resi` pin a round to named streets (rounds
  compare like for like); the kerb frames stand mid-sidewalk; the interior frame faces the middle
  of the room.
- Tile cache `t/v13` / `&v=13` / `DIRECT_V 13` (tram lines, parking, bus stops, trolley wires, land
  areas) — the worker needs a redeploy.
- Verified: typecheck (check config + the device's tsconfig) and 149 tests; montages `shots/place-tucson.jpg` (r4), `shots/place-nyc.jpg` (r3b), `shots/place-burlington-jan.jpg`, `shots/looks-tucson.jpg`. `npm run build` not run here (no build on this machine) — run it before pushing.
- Next: parked-car LOD for driveway cars and trees (the same manager pattern); a snowbank ridge along ploughed kerbs; mountains with ridge detail (z11 near 40 km); zero-setback barrio fronts; interiors furnished by floor area for every archetype; Seattle and Miami rounds.

## 2026-09-27 (n) — Hometowns that look like themselves: skyscrapers, row houses, mountains on the horizon, city sound, looks you can tune

The ask: compare Sea Bright / Monmouth Beach / Tucson (and a big city) against real photos so a
player's hometown feels familiar, and get skyscrapers + city life right. References and the
per-place trait table live in `docs/earth/PLACE_REFERENCES.md`; `tools/place-shots.js` poses the
same nine frames anywhere (`__PLACE__(tag)`). Everything below keys off map data, never a town list.

- **Towers** (`realTile.ts`, `bake.mjs`, `buildings.ts`, `recipe.ts`)
  - Heights: `parseLen` reads m / ft / 12'6"; `plausibleHeight` keeps real towers (cap 830 m),
    lets the floor count win over a unit slip, and clamps unverified "towers" on shed-sized
    footprints. Four-plus storeys is never `house`/`shed`. The 40 m clamp is gone.
  - OSM `building:part` (Simple 3D Buildings): parts lift by `min_height` (`lf`), share the
    outline's seed/id/kind/colours (one look, one door cut); an outline its parts cover draws
    nothing but keeps footprint + door + name (`hp`); a lone tower part leaves the outline as a
    four-storey podium, inset 12 cm so shared walls don't z-fight. Undersides of overhangs drawn.
  - Facades: glass curtain wall (siding 5, `.46` in the kind fraction — mullions, spandrels,
    muted sky reflection, floors lit at night, averaged far away) vs stone/brick with punched
    windows — by mapped material, era (`start_date`: nothing pre-1955 is glass; bronze/black
    '60s–'80s tints, grey-blue after 2000) and height. Towers never wear clapboard.
  - Roofs: mechanical penthouse on 36 m+, a wooden water tank on North American masonry
    mid-rises (16–90 m).
  - Interiors cap at four walk-up floors (a 300 m tower was a hundred stair flights).
  - LiDAR: skips parts and part-drawn outlines; a mapped tower height beats the roof median;
    feet-vs-metres now read from measured/mapped ratios where heights are mapped (`VER` v7).
- **Row buildings** (`realTile.markRows`): party walls (≥ 20 % of the perimeter) in a block
  the footprints cover 40 %+ of → `at`. In North American cities (`recipe.rowStyle`) they are
  brick / brownstone / limestone with flat roofs and cornices, apartments inside, dark doors,
  and — on brick walk-ups — a black iron **fire escape** on the street front. Rows on a
  primary/secondary road (or with a shop node inside) keep a storefront street floor (`gf`,
  read back in `windowAt` from the kind fraction).
- **Streets** (`props.ts`, `groundPaint.ts`)
  - Dense cores (`urbanCore`: 80 m cells, cover > 30 %, mean height > 16 m) bury their wires:
    steel street-light masts on both kerbs instead of wooden poles.
  - Main-street lamp posts (black acorn globe in North America, lantern elsewhere) wherever
    shops front the street.
  - Ladder crosswalks where a tertiary+ road meets another carriageway.
  - Dense blocks paint paved ground (no lawn, no grass tufts) between the buildings.
  - OSM `power=line` draws a sub-transmission run (15 m poles, two crossarms, six wires);
    minor lines stay the procedural street poles.
  - Yards by building tradition: pickets only where houses wear clapboard; adobe/stucco towns
    get low rendered walls, some with wrought iron.
  - A desert shade tree: `mesquite` (variant 2 = green-barked palo verde) replaces broadleaf in
    arid climates (foundry kind 7, within budget).
- **Life + sound**: pedestrians gather along shop frontage (`edgeShops`), the crowd scales with
  built volume (`crowd`), and a share of dense-core traffic is cabs (`taxi` gear + regional
  livery). The soundscape now knows the city (traffic roar, horns, sirens, crowd, pigeons by
  built volume) and the desert (summer cicadas, dawn doves); the sea (surf floor, gulls, bell
  buoy) stays by the sea.
- **The skyline** (`skyline.ts`): one Overpass read of every building ≥ 45 m or 14+ storeys
  within 8 km (through `osmToTile`, cached in IndexedDB) → lite silhouettes per 1024 m cell,
  hidden as soon as that cell's real tile mounts. The Empire State reads from Hell's Kitchen.
- **Canyon light**: stream.ts paints a canyon field (footprints × height, blurred) into the
  lamp map's green channel; `paintLight` dims the sky fill by up to 45 % near street level
  between tall buildings — deep street shade under a bright slot of sky.
- **The horizon** (`horizon.ts`): Terrarium z9 → a polar ring from 6 to 80 km drawn right after
  the sky with no depth (back to front), curvature + refraction, climate tones, snowline by
  latitude, aerial-perspective haze. Tucson now has the Santa Catalinas on its skyline. Height
  fog is measured from the ground you stand on (a mile-high town had no haze at all).
- **Look** (`post.ts`, `panel.ts`): the brush pass runs at `paintDetail` (0.6, was a fixed
  0.5 half-res) with the same brush size on screen; `hiDpi` renders at the screen's density
  (≤ 1.5×); vibrance + a split-tone colour grade; four presets (watercolor, fine detail, vivid
  painted (sci-fi), storybook soft) at the top of the ` panel.
- **Harness**: hidden panes no longer stall captures — `__PUMP__` drives frames through a
  MessageChannel and `__KICK__` restarts the game loop on it (capture builds); `__WAIT__` waits
  on the pump. Place shots wait for real tiles, skip synth streets, find golden hour from the
  game's own sun, stand where the tallest tower shows, dodge poles at the kerb, and add a
  horizon frame; per-frame poses come back in the result.
- **Fixes found on the way**: a DEM patch now overhangs its cell by 96 m (edge buildings in a
  mile-high town sampled the sea-level resident terrain and stood 370 m tall); the LiDAR
  ground-slope term is capped at 4 m; a tile mounting under a flying walker no longer yanks
  them to the ground (`settleWalker`).
- **Transport**: `?tiles=direct` (browser → Overpass → the same `osmToTile`, IndexedDB cache;
  two slots on overpass-api.de plus one per mirror, 429s cool a mirror down) and the shared
  `overpassQuery` (now with building parts, signals, hydrants, subway entrances, transmission
  lines). Tile cache `t/v10` / `&v=10` / `DIRECT_V 10` — **the worker
  needs a redeploy**.
- Reviewer, place parity NYC round 1: **5/10** ("recognisable from the air and looking up; at
  street level empty and generic"). Acted on: kerb occluders, golden-hour timing, the horizon
  pose, street life by frontage + volume, storefront street floors on avenues, paved dense
  blocks, darker era-based glass, dark apartment doors, restaurant layout (booths on one wall,
  clustered two- and four-tops). Open: canyon light (sky-view factor), signal masts at
  `traffic_signals`, hydrants/tree pits/subway entrances, buses from `route=bus`, a real-tower
  skyline ring past the 1.5 km detail ring.
- Verified: typecheck (check config) + 134 tests; montages `shots/place-nyc.jpg`,
  `shots/place-tucson.jpg`, `shots/horizon-test.jpg`.

## 2026-09-27 (m) — Scaling pass: furniture budgets, a regional wildlife cast, language-neutral business uses, regional street rhythms

The user asked whether this is being built for scale with the asset generator. The honest
answer named four gaps; this session closes them before a second region opens.

- **Furniture budgets** (`decor.ts`, `tests/foundry.test.ts`)
  - Each piece is tested: valid, non-indexed, grounded, within its declared footprint, and under a
    vertex budget.
  - Rounded boxes dropped from 2 bevel segments to 1, and radii under 1.5 cm are plain boxes.
  - Per-piece vertex counts, before → after:
    - sofa 9288 → 3528;
    - chair 5832 → 1224;
    - shelves 31500 → 1260;
    - ceiling fan 2256 → 816.
  - A 30-table café now costs roughly a fifth of what it did.
  - `ni()` replaces `toNonIndexed()` on geometry that is already non-indexed (the console spam).
  - Shelf stock no longer overhangs the unit.
- **A regional wildlife cast** (`fauna.ts`, `critters.ts`)
  - Behaviour belongs to a *role*: climber, burrower, grazer, songbird, shorebird, browser,
    predator, raptor, butterfly, firefly.
  - `faunaMix(region, climate)` picks the species for each role, like `plantMix` / `carMix`.
  - Eight new species, each a table row over the two body plans: coyote, black-tailed jackrabbit,
    snowshoe hare (white in winter), ground squirrel (dives down its burrow), mule deer, greater
    roadrunner, quail (topknot), white ibis (curved bill).
  - Deer habitat includes open shrubland where there are no woods; ground animals use `field()`,
    which covers lawn, meadow, shrub, crops and bare desert.
  - Predators and prey match by role, so a coyote hunts a jackrabbit exactly as the fox hunts a
    rabbit.
  - Empty species meshes are hidden, so there are no empty draws.
  - Verified streaming a desert town (`?at=32.2290,-110.9618`, style `arid/adobe`): coyote,
    ground squirrel, jackrabbit, quail and hawk spawn there; no fox, rabbit or firefly.
- **Business uses without language**
  - `Building.u` now carries OSM's amenity / shop / office / craft value.
  - The bake reads it from the building's tags or a POI inside it.
  - Real-lite tiles read it from the building's tags or from a named business node inside the
    outline. The node also names the building, and a house-sized footprint becomes a storefront.
  - The worker's Overpass query fetches those nodes. The tile cache is bumped to `t/v7` / `&v=7`.
    **The worker needs a redeploy** before streamed towns carry names and uses.
  - `useOf(name, tag)` reads the tag first (the same words in every country), then a small
    en/es/fr/it/de/pt name vocabulary. The brand-name list is gone.
  - `Footprint.use` and `Door.use` carry the value to terraces, interiors and the harness.
- **Street rhythms by place** (`protocol.ts` `rhythmFor`, `lifeSim.desired`)
  - *shore*: the beach town, unchanged.
  - *town*: commute, lunch, errands, evening stroll, and never empty mid-morning.
  - *desert*: busy early and after sunset, with a midday lull.
- **Harness**: montage **f**, the regional cast lined up on a lawn (`shots/review-r18-f*.jpg`).

Verified:
- `tsc` is clean and **126 tests** pass. New tests cover:
  - decor budgets and footprints (3);
  - the desert cast, a coyote hunting a jackrabbit, the burrow dive, the winter snowshoe (3);
  - the business-node join into buildings (1);
  - uses: tags first, multilingual names (3);
  - street rhythms per place (1).
- Montage r18 e/f; a desert town streamed live.
- `npm run build` needs the user's Windows toolchain. The session's Linux VM can't load the
  Windows rolldown binaries.

Next: redeploy the tile worker, then run a streamed-parity harness pass in Tucson (storefronts,
interiors, terraces from real OSM businesses). After that the tree-silhouette pass, and Almanac
regional sets (cards filtered by `faunaMix`).

## 2026-09-27 (l) — Downtown life, furnished interiors, walker proportions, a wildlife ecosystem, cars that hit people

This session came from user feedback:
- walkers' legs were too long;
- Ocean Ave downtown needed shop goods, café tables and more life;
- restaurant, house and office interiors needed real furniture and sunlight through the windows;
- lamp posts had a floating light, detached from the arm;
- animals should interact as an ecosystem, and cars should be able to hit people.

- **People.** `people.ts` is re-proportioned to a ~1.72 m adult: hip at 0.87, knee at 0.47, a
  shorter shin, the shoulder at 1.39 and the head at 1.6. The gait pivots moved with it.
  `creatureMaterial` now lives in `render/creature.ts`. A `SEATED` define folds the thighs
  forward and the shins down, bends the forearms, and drops the body 0.42 m; seated people are
  hidden at night.
- **Lamps.**
  - The arm rotation gets an extra half turn for poles on the +n side of the street, so the head,
    glow and pool are on the same side.
  - The lens is now set under the head and turns with the arm.
  - Rank-3+ streets have a lamp on every second pole.
- **Downtown** (`props.ts`, `world/uses.ts`)
  - `useOf(name, poiKind)` classifies a business as café, restaurant, bar, grocery, shop, office,
    civic or unknown, from its name plus the POI kind. There are no per-town lists.
  - Café, restaurant and bar doors get up to three terrace sets (`decor.cafeSet`), each with a
    walker loop. They get parasols in warm climates.
  - Terraces have seated guests: one instanced draw, with a pack material tag `people`.
  - Curbside parking on wide commercial streets; these cars are enterable.
  - Shop windows show goods on stands (the interior-mapping display planes).
  - Downtown walker weight is up from 3 to 6.
- **Interiors** (`assets/decor.ts`, a new foundry family)
  - Pieces: sofa, armchair, bed, table, round table, chair, bistro chair, office chair, monitor,
    lamp, café counter with a pastry case and espresso machine, diner booth, stocked shelves,
    potted plant, storage bench. They are built from rounded boxes and tapered legs, and placed by
    `piece()` / `fit()` / `facing()` in the plan frame with smooth normals (`Mesher.triN`).
  - The ground-floor role follows the business:
    - café: a counter with stools, and a table set per ~7 m²;
    - **diner** for restaurants and bars: vinyl booths, a counter with stools, a menu board, tables;
    - office: desks with monitors and office chairs;
    - grocery: stocked gondolas.
  - The generic box clutter (the "crates") is gone from businesses and replaced with decor pieces
    in homes.
  - **Sun pools**: the interior shader traces the sun ray to the outer wall (`uDims`). Where the
    ray passes the window band, the floor is lit, so morning sun lies across the boards.
- **Ecosystem** (`sim/critters.ts`, `assets/fauna.ts`)
  - A **red fox** (dusk and night: russet with black stockings, a white bib and a white-tipped
    brush) stalks with a slow creep and pounces on rabbits, squirrels and songbirds.
  - A **red-tailed hawk** (by day: the bird plan at 3.3×, broad fingered wings, a rufous tail, a
    soaring flap mode) circles a thermal and stoops on animals in the open, then labours back up.
  - Prey freeze for a beat first. The beat is shorter for watchful animals (per-animal
    vigilance). Then they flee the fox, a stooping hawk, the walker, or **moving traffic**
    (`LifeClient.movers` plus the player's ride). The faster a car comes, the sooner they go.
  - Alarms spread through a flock or warren, and to other small prey within 5 m.
  - `birdGeometry()` is the shared bird plan.
  - The Almanac wildlife family grows by two cards automatically.
- **Traffic physics.**
  - `Vehicles.onMove` → `LifeClient.bump` → `lifeSim.bump`: walkers in a moving car's path are
    thrown along with it, slide to a stop, lie on their side for 3–5 s, then get up and walk on.
  - A thud plays.
- **Harness.**
  - Montage **d** (terrace, café/diner, house in morning sun, a walker side on) and montage
    **e** (fox, hawk, a knocked-down walker, a lamp close up).
  - `opts.only` takes any subset, for example `'de'`.

- **Reviewer round 6** (8/10, not passed on the expanded scope; see REVIEWER.md). All five
  must-fixes were applied:
  - the arrival-frame occluder: a harness assert plus carriageway-aware curbside parking;
  - a zoned, filled and pendant-lit café;
  - slapstick knockdowns: sprawl, sit up, walk back;
  - a proper soaring hawk;
  - morning and lunch downtown life.
  Also a foundry ceiling fan, crisper and brighter sun pools with muntins, and lifted shop
  displays.
- **Storefronts** (user): the one red/white striped band on every shop is gone. Each building
  gets a sign fascia, a solid trade-colour awning over its windows, or rarely (5%) a striped one.
- Decor stopped calling `toNonIndexed()` on the already non-indexed rounded boxes, which was
  thousands of console warnings per interior build.

Verified:
- `tsc` is clean and **115 tests** pass: 4 new critters tests (car scare plus alarm, the fox
  catching a dozy rabbit while a watchful one escapes, the fox avoiding the walker, the hawk
  stoop), a lifeSim knockdown test, and fauna budget/wing checks. The fox is 1596 verts, under
  the 1600 budget.
- Montages r11–r17 (`shots/review-r17-*.jpg`).

Next: animals crossing roads and AI traffic braking for them; dogs on leads; ordering and painting
the dish at a diner (Local Plates); the tree silhouette pass at 5–10 m.

## 2026-09-27 (k) — The AAA look + play pass: five review rounds (PASS), people, the Almanac, a persistent town

This session came from user feedback:
- the distant pencil sketch looked broken;
- the watercolour filter smeared blotches over the grass that moved with the camera;
- assets and interiors should look better up close;
- the defaults should be the best without touching sliders;
- traffic and people kept resetting or vanishing while driving.

An expert reviewer subagent (persona: Nintendo EAD / Rockstar North) judged four rounds of
fixed-pose montages. Scores went 6 → 7 → 7.5 → 8 → **8.5 PASS** (the hero region is cleared for scale-out; interiors and downtown are the carried-forward gaps). The verdicts are in `docs/earth/REVIEWER.md`.

- **Look (post / lighting)**
  - The pencil hatching is gone. "Paint as you explore" is a pale first wash only within ~160 m
    (`sketchAmt` fades by camera distance), so the horizon is always finished watercolour. The
    atlas map keeps pencil for unvisited places.
  - Pigment turbulence is world-anchored and luminance-only. That was the real cause of the
    swimming, tinted blotches.
  - Depth-adaptive Kuwahara.
  - A hue-shift shadow glaze replaces the dark multiply ("mud").
  - Tighter terminator; less and greyer sky fill; exposure 0.9 / saturation 1.12.
  - Water strokes use world-fixed frames (the radial fan is gone).
  - Roofs: gamut 75–260° → warm grey, plus a daytime desaturation in the roof shader.
  - Interior daylight falls off from the outer walls; room edges are darker.
  - Lamp pools light the street relative to the local ground, so streamed DEM towns get pools.
    Pools are `max(albedo, 0.3)`, there are more lamps on rank-3+ streets, and pools are larger.
- **Grass**
  - Towns are mown (built cells and non-wild cover); meadow grass only in open country.
  - Greens are desaturated ×0.7, with roots in the lawn wash.
  - Blades write depth plus alpha 0, and the composite masks ink by scene alpha.
  - Lawn cells are denser and tinted toward the wash; the ground adds a mown stipple.
- **Ground**
  - Paint tables at real reflectance: asphalt #55575b, sidewalk #b3ad9f, sand #dccb9f, and so on.
  - Sand ripples, a wrack line and footprints come from the shore distance field.
- **Foundry**
  - New `people.ts`: one jointed person (~1.4k verts) with GPU-chosen skin, hair and trousers, 5
    hairstyles, and shorts/sleeves by climate × season. Knee flex, arm swing, idle sway. Tested.
  - `blob()` writes ellipsoid normals.
  - Trees: crown-sphere normals, underside AO and self-shadow lift. Pine has three overlapping
    tiers; round/oak crowns skirt their forks. Street trees are broadleaf in built cells.
  - Cars: recessed rims, round treads, wheel arches, softer bevel, inset glass.
  - Squirrel tail is one plume; the deer has a forward neck and two-part legs.
- **Lot dressing (NA)**
  - A generated drive with a parked car where the map has none (`buildings.ts` `drives` →
    `props.ts`).
  - `fence:picket` runs beside hedges.
- **The Almanac** (new atlas tab; `commissions.ts`, `cardArt.ts`)
  - 44 species/model cards across cars, boats, planes, wildlife, trees and garden plants.
  - Spotting draws a **pencil** card. Painting the subject (photo mode, in frame) colours it
    with a watercolour plate rendered from the real foundry model.
  - **Place cards** come from named POIs and buildings, and your painting becomes the card.
  - One stamp per town (reverse geocoder), and a "found in <county>" count.
- **Persistence**
  - Streaming no longer resets life. The worker takes a `regraph` message and `LifeSim.adopt`
    snaps every car and walker onto the new graph by position. Tested: nobody jumps, everyone
    is kept.
  - Parked player vehicles and taken driveway cars persist across sessions (localStorage,
    real lat/lon).
- **Defaults**
  - The settings panel is hidden (the backquote key opens it).
  - Settings persist as diffs against the defaults (v3), so improved defaults reach everyone.
- **Harness** (`tools/review-shots.js`)
  - 16 fixed poses (a/b/c montages).
  - Waits for streaming; searches for a clear view; places the camera at the street edge;
    follows a live walker.
- **Backlog:** `docs/IMMERSION_BACKLOG.md` is the exhaustive list for the 48-state scale-out.

Verified:
- `tsc` is clean and 110 tests pass (a vitest shim in the cloud mirror; the Windows toolchain
  is the user's).
- Montages r1–r9 were reviewed; card sheets are in `shots/almanac-cards*.jpg`.

Next (the reviewer's amended order): boot GPU benchmark → streamed-parity harness on 3 random
US towns → Almanac regional sets + streamed POIs → Local Plates + interiors → hero region 02
(desert SW). The next review opens with the four carried-forward checks in REVIEWER.md.

## 2026-09-27 (j) — The asset foundry: variety for everything, wildlife, gardens that grow

This is the `kit-variety` feature, grown into the foundry. The design and reasoning are in the new `docs/ASSET_FOUNDRY.md`.

- **Foundry core** (`src/assets/core.ts`).
  - The shared primitives: part, merge, box, profile, lathe, limb, blob, card.
  - Growth maths: golden angle, Fibonacci counts, Fibonacci-sphere organ placement, taper.
  - Position-hashed variants (`variantAt`), validation, and the geometry cache.
  - `kit.ts` now builds on it.
- **Flora** (`flora.ts`).
  - Trees: 7 species (round, oak, shrub, pine, spruce, palm, birch) × 3 grown variants.
    - The species is re-read by region: palms where it's warm by the sea, birches up north.
    - LiDAR trees now scale by each variant's real `treeMeta`, and building clearance uses the real crown and trunk.
    - Tree vertex counts are at or under the old hand-built trees (~800–1,260).
  - Gardens: 12 species in 6 growth forms. Each has a climate weighting (`plantMix`), a bloom season from the real calendar (flipped in the south), and 8 growth stages. Blossoms open from about 60% grown.
  - House-front beds on open ground use a `lite` genome (<900 vertices).
- **Fauna** (`fauna.ts` + `src/sim/critters.ts`).
  - Squirrel, rabbit, songbird, sandpiper, deer, butterfly and firefly, all on one jointed body plan (`aPivot`), animated in the vertex shader. Each species has its own gait offset and limb amplitude.
  - A main-thread sim within ~90 m, with habitat taken from the world:
    - squirrels at trees (they bolt up the trunk);
    - rabbits on lawns at dawn and dusk;
    - songbirds by day (they flush);
    - sandpipers on the surf line;
    - deer in woods at dawn and dusk;
    - butterflies over gardens in summer;
    - fireflies on summer nights.
  - Sounds: squirrel chatter, wing flush, a deer's snort.
  - Small animals are drawn 1.3–2× life size, because at painting scale they vanished into the grass.
- **Furniture** (`furniture.ts`).
  - Five mailbox styles, North American curbs only.
    - Every house with a walk to the street now gets one; before, only houses with a mapped house number did: 1 → ~1,290 at Sea Bright.
    - The door faces the street.
  - Summer beaches: umbrellas, towels and chairs around the lifeguard stands.
  - Picnic tables on greens and in parks.
- **Car variety.**
  - Each parked car and each car in traffic now has slightly different proportions (±3–4%), and some have sun-faded paint.
  - Gear by `gearFor`: surfboards and kayaks near the coast, racks, roof boxes, hitch bikes.
    - Driveway cars carry it as a model key (`parked-cars:suv:surf`). The car you take keeps it: "E drive this SUV with a surfboard".
    - Traffic carries roof gear on per-type roof heights.
- **Grow verb** (`src/ui/garden.ts`; CONSTRUCTION.md stage 1).
  - R plants the region's seed (Shift+R picks another) on valid ground.
  - It blooms after ~20 min of play and keeps growing while you're away (IndexedDB, real lat/lon).
  - Also: map pins (❀), a commission ("Paint the … you grew"), a bloom toast + chime, a solid bed that clears the grass, and a count on the journal page.
- **Spotting + commissions** now cover wildlife ("spotted a squirrel — 1 of 7 animal kinds") and "Paint a rabbit" style offers.
- **Workbench** `/kit.html` is now the Asset Foundry:
  - vehicles + gear, trees, garden plants (growth slider), animated wildlife, street + beach furniture, rocks;
  - rendered through the game's own watercolor pass.

Verified:
- tsc clean. 107 tests pass, including the new `tests/foundry.test.ts`: every family sane / grounded / deterministic / within its vertex budget; growth monotonic; blossoms only when mature and in season; the southern-hemisphere flip; gear on the roof; surfboards only near the coast.
- Workbench captures: trees, plants, wildlife, furniture, vehicles.
- In-game montages at Sea Bright:
  - house-front beds (hydrangea, sunflower, daylily …);
  - a summer beach, a wagon with a surfboard, a picnic table on a green, a rural mailbox;
  - wildlife in the grass;
  - five planted seeds going from seedlings to bloom, and still there after a reload.
- Counts at Sea Bright: trees in 7×3 variant meshes, ~1,290 mailboxes, ~6.6k garden plants, 264 umbrellas, 17 gear combinations on driveway cars.

Not run here: `npm run build` and the soak (Windows toolchain). Watch the frame cost of garden beds on low-end machines. The `lite` genome and the budget test are the dials.

## 2026-09-27 (i) — Paint your walk: sketch→paint world, sketchbook + commissions, atlas map + search, hints, arrival cards, sound

This is the `paint-your-walk` feature. Its source is the gameplay brainstorm: ideas 1 (the world paints in as you explore) and 2 (a sketchbook in place of a camera), plus the agreed UX list and the soundscape.

- **Paint as you explore** (`src/world/explore.ts`, post composite).
  - Every unvisited place is a pencil underdrawing: graphite hatching on paper, three stroke families by tone, a lighter hand with distance, and stronger ink.
  - Colour blooms in around you with a noisy wet edge and pigment pooling at the rim. Flying paints a wider circle, up to 450 m.
  - The record is a global Web-Mercator grid (8 m cells, IndexedDB), so it survives teleports, re-anchoring and regions.
  - Capture mode stays fully painted unless `&sketch=1`, so the old montages don't change.
- **Photo mode → sketchbook** (`src/ui/photo.ts`, `book.ts`).
  - P frames the view: viewfinder, wheel zoom, `[` `]` to move the hour, H to hide the frame.
  - Space paints a page: the frame is grabbed right after `post.render`, then gets a handwritten caption (place, time, light, date, lat/lon, commission).
  - Pages are stored as JPEG + thumbnail. The lightbox offers walk back / download / remove.
- **Commissions + spotting** (`src/ui/commissions.ts`).
  - Three live offers built from what's really there: named buildings (churches, lighthouses, shops), POIs, the boat types moored nearby, and scenes (sea at golden hour, fog, sunrise, lamps at night, rooftops from above).
  - A building that also appears as a POI yields one commission, not two (deduped by subject title).
  - `judge()` checks the camera frame and the conditions at the moment you paint.
  - The spotting log fills per family (car / boat / plane) as you look at kit models: tile props (`parked-cars:`, `moored-boats:`), ambient life (`life-car:`, `life-boat:`) and your own rides (`ride-*:`).
- **Atlas (M, G = search)** (`src/ui/atlas.ts`, `mapview.ts`, `geo.ts`). It replaces the old journal overlay and has four pages:
  - **Map:** hand-drawn from the loaded world — pencil streets, footprints, hatched water (from the terrain sdf) — and painted wherever your walks have been. It has pins, drag/zoom, and click → "walk here".
  - **Sketchbook.**
  - **Commissions + Spotted.**
  - **Journal:** keys, km² painted, found places.
  - **Search** uses the Photon OpenStreetMap geocoder (CORS, no key, cached), merged with local streets, named buildings, POIs and lat/lon. Offline it shows local matches only.
- **Context hints** (`hints.ts`). Examples:
  - "E drive this jeep" (`vehicles.enterable()`).
  - "walk through the door to go inside".
  - "P ✧ paint …" near a commission.
  - Flight keys.
  - "B call a boat" by the water.
  - First-time M/P/G tips that retire after three showings.
- **Arrival cards** (`arrival.ts`).
  - The reverse-geocoded town, "Monmouth County, New Jersey", the time and light, then either "first visit — walk to paint it in" (read from the *saved* explore block) or the km² painted so far.
  - Shown at the start of a walk, on crossing into a new town (the new name must hold for two looks) and after teleports.
  - The HUD now names the town from the same source.
- **Sound** (`ambience.ts`).
  - Brush / shutter / chime / page UI sounds, and a brush stroke when a patch blooms.
  - Halyards ringing on moored sailboats when it blows; water lapping near boats and on piers.
  - Leaves by tree cover; songbirds by hour.
  - Engine models: car (gears), outboard (throttle + spray), propeller (chop + wind rush).
- **Fixes along the way:**
  - A pointer-lock rejection no longer paints the red fatal bar (common in embedded panes).
  - The atlas hides lil-gui (the panel class is now `lil-root`; the old `.lil-gui.root` theme selector no longer matches — left as is).

Verified:
- tsc clean. 99 tests pass, including the new `tests/explore.test.ts`: reveal/bloom, painting stays local, the record survives a re-anchor, lat/lon parsing, local search ranking.
- Live session at Sea Bright, checked in the browser:
  - Sketch→paint montages at noon, golden hour, night and from the air.
  - Photo mode painted a page that completed "Gracie and the Dudes Homemade Ice Cream".
  - Sketchbook grid, and the commissions + spotting page (7/8 car types).
  - Map with the painted downtown.
  - Search "asbury park convention hall" → walk here → arrival card "Asbury Park · Monmouth County, New Jersey · first visit".
  - Hint pill "E drive this jeep".

Not run here: `npm run build` and the soak. Both need the Windows toolchain (native vite/rolldown + Playwright).

Noticed: the deployed tile worker sometimes answers cold cells near Asbury Park with a platform error that has no CORS headers (browser reports CORS; the client falls back to synth). Likely a CPU/time limit on cold Overpass fetches — worth a look in `worker/`.

## 2026-09-27 (h) — Asset kit (recipe + seed), stairs that hug the house, signs that fit, lamp pools everywhere

**Asset kit** (`src/assets/kit.ts`, viewer at `/kit.html`). This implements `3d_asset_creator.md`:
- A model is a *recipe* (type + seed → validated proportions) passed through one geometry function per family.
- Every family follows one convention: non-indexed, vertex `color` (white = tintable by instance colour), `aPart` (3 = head/nav lights, 4 = tail), front toward −z, origin on the ground or waterline.
- Families:
  - Cars: sedan, hatch, wagon, SUV, pickup, van, coupe, jeep.
  - Boats: skiff, console, cabin, sail, pontoon, lobster.
  - Planes: high-wing, low-wing, seaplane, biplane. The prop position is returned so the rider spins it in place.
  - Rocks: boulder, riprap, stone.
- `carLib`/`boatLib`/`rockLib` cache one canonical variant per type. The world draws one InstancedMesh per type.
- Wired in:
  - **Life traffic.** One mesh per type. Each agent picks a stable type from the street mix and is zero-scaled in the other meshes.
  - **Driveway cars.** `parked-cars:<type>` meshes. The collision footprint comes from the recipe's L×W.
  - **Moored boats.** `moored-boats:<type>`, packed bow-to-stern along each pier side, with empty slips.
  - **Player vehicles.** V picks from the street mix, B cycles boat types, N cycles plane types. The toast names the model ("a pickup pulls up"). Taking a driveway car keeps its model.
  - **Groynes and seawall.** 4 riprap and 4 boulder variants, yaw plus a small lean so flat undersides sit down. The seawall now carries armour stone on its seaward slope.
- **Scales by region.** `carMix(region, climate)` and `boatMix(climate)` shift the mix without any per-town code:
  - Europe and Japan get more hatchbacks and wagons.
  - The arid and continental interior gets more pickups.
  - Places with cold winters get SUVs and jeeps.
  - Lobster boats up north, center-consoles in warm water.
- **Worker gotcha.** Pack *transfers* geometry buffers. A cached library geometry mounted directly in a tile detaches on the first tile, and every later postMessage then throws DataCloneError. Tiles must `.clone()` library geometry; the main thread (life, vehicles) can share it.
- Old ad-hoc `carGeo`/`boatGeo`/`planeGeo` removed.

**Stairs.** Raised houses (flood zone) try these layouts in order:
1. A flight parallel to the door wall.
2. A flight wrapping down the adjacent side wall.
3. A dogleg with a mid landing.
4. The old perpendicular run, only as a last resort.

Stairs no longer poke into side streets. This is generic: it works from the footprint ring, not per town.

**Signs.** `signName` uses USPS suffix and directional abbreviations: only after the first word, parentheticals dropped, and Saint/Mount/Fort always shortened. The blade grows to 2.4 m, then the lettering shrinks, so every name fits.

**Lamp pools.** Tiles ship `lampPts`. `stream.ts` paints a walker-centred 2 km lamp light map and repaints on tile change or after moving 512 m. Night pools now work on every streamed tile, not just the bake.

**Tree trunks** collide (`walk.addLoop`); shrubs don't.

Verified:
- tsc clean and 94 tests pass, including the new `tests/kit.test.ts`: ground/waterline origins, determinism, prop at the nose, and the regional mix shift.
- In-game at Sea Bright: 107 driveway cars across 8 types, 180 moored boats across 6 types, about 8k rocks.
- Views checked: a console boat alongside its pier and a jeep in its driveway.

## 2026-09-27 (g) — Tile service deployed

The user created the R2 bucket and deployed `worker/` on Cloudflare. It is live at
`https://map-game-tiles.map-game-tiles.workers.dev`.
- `/health` answers.
- A cold cell took 28.5 s, all of it Overpass. The same cell cached took 50 ms.
- A DEM tile takes about 0.5 s.

`main.ts` routing:
- Production (not localhost, no `?tiles=`) uses the deployed service by default.
- Localhost still prefers a running `wrangler dev` (via `/__tiles`) and falls back to the
  deployed service.
- `?tiles=<url>` and `?tiles=off` behave as before.

To redeploy after `worker/` changes: `cd worker && npx wrangler deploy`.

## 2026-09-27 (f) — Past the bake: real houses from LiDAR, painted streets, tiles that arrive

**User report:** trees in and through buildings; flying to Monmouth Beach and beyond, the
roads lose all detail and the buildings look buried in the terrain.

**Diagnosis (in-game probes + shots):**
1. **Trees.**
   - Only 10 of 28k trunks stood inside a footprint.
   - About 2,000 stood within 3 m of a wall with crowns 4–7 m wide. Blob crowns through walls
     read as "a tree in the house".
2. **"Loses all detail" had four causes:**
   - **Unpainted ground.** The ground shader applied the detail paint window only inside the
     original slice. Everywhere else it showed the level-0 backdrop paint (no sidewalks,
     curbs or walks), and past the bake a smeared edge colour. Streamed tiles were never in
     the painter at all.
   - **Poisoned tile cache.** Overpass answers a timed-out query with HTTP 200 and a `remark`.
     The tile service cached those as empty cells in R2, forever. Elberon/Deal cells came
     back with 0 roads and 0 buildings.
   - **Tile pile-up.** The client fired every cold real cell at once. The service fanned all
     of them out to Overpass, which rate-limits per client, so everything timed out
     together. Meanwhile the placeholders sat over the bare sea plane.
   - **Blocked tile worker.** LiDAR decode and raster passes ran on the tile worker and held
     up every other build.
3. **"Buried".**
   - Coarse-ring synth silhouettes raced the DEM at 4 s and were never relieved when they
     lost, leaving flat plates sunk among DEM hills.
   - Real buildings were not the cause: every mounted footprint sat within 1 m of its ground
     (probe).

**Fixes:**
- **Tree clearance (props, every tree source).**
  - Trunks inside or within 1.3 m of a footprint move out to 1.3 m, or are dropped if wedged.
  - A crown whose bottom sits below the neighbouring roof is narrowed to stop 0.4 m short of
    the wall. If that would leave a stick, the tree is dropped.
  - Result: 0 trunks inside footprints (probe).
- **J1 — ground paint everywhere.** The painter takes streamed tiles' roads and footprints
  (`setTile`/`dropTile` on mount/unload).
  - A new **mid window** (1.6 km, about 0.8 m/px: sidewalks, walks, markings, contact
    shadows) joins the 300 m detail window.
  - Both paint over the backdrop and slice land cover, with a lawn wash past the bake.
  - The shader applies them anywhere. The mid repaint costs about 7 ms, at most one window
    per frame.
- **Unmapped buildings from LiDAR** (`detectBuildings`).
  - Roof pixels are ≥ 2.2 m, planar at 3×3, not vegetation and not under a mapped footprint.
    Ridges are rejoined and the outer ring grown back.
  - Components become a min-area rectangle, or an orthogonal quarter-cell outline (L/T/U).
    Each is measured like a mapped building.
  - Hybrid-fill guesses retire wherever the survey covered the ground.
  - Deal/Ocean Twp cells with 0–70 OSM buildings gained 190–430 real ones each.
- **LiDAR worker** (`lidar.worker.ts` + `lidarCell.ts`).
  - The page spawns it and wires it to the tile worker with a MessageChannel. Nested workers
    aren't available everywhere, and the first try hung silently.
  - The tile worker keeps the cache and apply logic; the LiDAR worker owns the rasters.
- **Tile service.**
  - A `remark` saying "runtime error / timed out / out of memory" is now a failure: the next
    mirror is tried, and nothing is cached.
  - Two Overpass slots per isolate.
  - On a 429, it waits (Retry-After, up to 8 s) before the next mirror.
  - Cache keys are bumped (R2 `t/v6`, URL `&v=6`), so the poisoned empties retire.
- **Client.**
  - Real-lite cells queue nearest-first, 3 in flight.
  - A synth placeholder isn't fetched once its real twin is mounted.
- **Coarse silhouettes** wait up to 20 s for their DEM instead of 4 s.

**Also:**
- `?hour=` works in capture mode.
- `__GAME__.setHour` is available to tools.
- The worker log keeps 400 lines.

**Verified:**
- Tree probe: 0 trunks inside footprints.
- `shots/south-after.jpg`: painted sidewalks and curbs past the bake.
- Asbury Park (z 16.5 km): 5 real cells mounted within 10 s of arriving (it was 0 in 40 s).
- 87 tests; `tsc` clean.

**Dev note.** Wrangler dev reloads the service on save. Its local R2 still holds the old
empties under `t/v5`; they are simply never asked for again.

## 2026-09-26 (e) — Real trees from the same LiDAR

**User direction:** yes, do trees next.

**What.** The cell read that measures roofs now also plants the real trees. `lidarCore.ts`
`detectTrees` finds individual crowns in the canopy height model:
- **Crown tops** are local maxima of the 3×3-smoothed height-above-ground (the search window
  grows with height).
- **Crown radius** is where the profile falls to half height, averaged over 8 directions.
- **Thinning** goes tallest-first so one crown never spawns two trees, with a 12k/cell cap.
- **Roofs are masked out:** every mapped footprint (+1 m) via `ringMask`.
- **Surveys that classify vegetation** (ASPRS 3/4/5) use a vegetation-only canopy.
- **Surveys that don't** (NJ 2014, Denver DRCOG 2020 both read "unclassified") get two extra
  rejects:
  - *Smooth tops:* a 5×5 plane-fit residual under 0.3 m, or a plateau with 60 % of cells
    within 25 cm of the top, is a roof, deck or tank.
  - *Pencil-thin peaks:* a crown radius under 1.4 m on anything over 5 m is a pole or wire.

**Caching.** Trees are cached in the cell's IDB record as lat/lon µ-degree offsets, so they
don't depend on the world's origin. With them goes a 16×16 coverage map of where the survey
saw the ground.

**Placement** (`TileJson.trees`/`treeCov` → props):
- Covered blocks replace both the WorldCover random scan and OSM tree points (the same trees,
  measured). Uncovered blocks keep the old scan.
- Crown tops over a street plant their trunk on the verge.
- Size and shape come from the measurement: model scaled to the measured height, crown to the
  measured radius (never thinner than 0.85× the model's proportions — thin reads as lollipop).
- Species are a short/slim/broad heuristic over the region's style weights.

**Verified.**
- Cell counts: Sea Bright barrier cells 190–400 trees, wooded Rumson 5–9k, Denver 2.8–4.1k.
- `shots/trees-on.jpg` vs `trees-off.jpg` (same poses):
  - Rumson now reads as the wooded town it is, with tall street trees lining the lanes.
  - Open lawns are open where the random scan had dotted them evenly.
- 85 tests (crowns found once each; flat roof, mapped house and pole rejected; mask padding),
  `tsc` clean.

**Next:**
- tree collision (trunks)
- J1 ground paint for streamed tiles
- vehicle polish

## 2026-09-26 (d) — Measured buildings for the lower 48 (USGS 3DEP LiDAR, in the browser)

**User direction:** make buildings match real life, MSFS-style but open-licensed — for the whole
lower 48, not just the shore.

**Why LiDAR, and which LiDAR.** Overture heights exist for 88 % of shore buildings but the median
house is 5.0 m (too low), there are no roof shapes, and OSM has 94 `building:levels` tags. The
Planetary Computer 3DEP HAG rasters work from the browser but cover only about half the metros
tested (no Chicago, LA, Seattle, Atlanta, Phoenix, Miami, Minneapolis). USGS's **Entwine Point
Tile** copy of 3DEP (`usgs-lidar-public` S3, 2,274 projects) covers everything, is CORS-open and
is public domain. So there is one source for all cells.

**Pipeline (tile worker, per real cell, no server compute):**
1. **Project index.** `src/world/lidar-index.json` is 331 KB, compacted from hobu's
   `resources.geojson` (`scripts/lidar-index.mjs`) and bundled into the worker chunk. It gives
   the candidate surveys for the cell, newest first.
2. **Octree read.** The EPT octree is read down to about 1.5 points/m², chosen from the
   hierarchy counts rather than a fixed depth (a 2020 Denver survey is 7× denser than NJ 2014),
   with whole levels dropped over a 4 M-point budget so the result is deterministic.
   - Nodes are decoded by vendored **laz-perf** WASM (`src/vendor/laz-perf`, Apache-2.0,
     inlined as base64).
3. **Height grids (`lidarCore.ts`).** Points are binned into 1 m grids: surface max over
   everything except noise and water, and ground mean. Pull-push fills the ground under roofs,
   giving height above ground.
4. **Roof fits (`measure.ts`).** On a 1 m grid inset from the walls, a Tukey-IRLS fit of
   h = eave + k·f is run for:
   - flat
   - hip (f = distance to the outline)
   - gable along either axis (rectangles only)

   Model choice gives a true ridge, a true eave, a style and a confidence score.
5. **Apply to the building.** `enrichTile` writes `h`, `eav`, `roof` and `ms` onto the Building,
   and `buildings.ts` builds exactly that:
   - rise = h − eav through the straight skeleton
   - top sits on the footprint's mean ground

   A cell is cached in IndexedDB as a few KB of fits, so it is measured once per browser.
6. **First visit.** A detail build waits 3.5 s, then builds from priors and flags `tile.late`.
   The stream's relief path (generalised from late-DEM) swaps in the measured rebuild when it
   lands. At most 2 cells read at once, newest request first.

**Verified.**
- **Registration.** HAG raster vs footprints is pixel-exact (`shots/hag.png`).
- **Sea Bright.** 11 spawn cells measured in about 21 s cold (41 % of footprints confidently).
  The rest are under canopy or newer than the 2014 survey, and they keep their priors.
- **Sea Bright looks.** `shots/lidar-on.jpg` vs `lidar-off.jpg` (same poses). Ocean Ave's
  flat-roofed blocks and townhouse rows come out flat. Raised post-Sandy houses get their real
  9 m ridges. Gables have true eaves.
- **Denver** (`?at=39.7005,-104.9705`, 2020 DRCOG survey).
  - 4–6 s per cell.
  - Detached alley garages go flat and Denver squares go hip: `shots/den-on.jpg` vs `den-off.jpg`.
- **Tests and types.** 83 unit tests pass (synthetic gable/hip/flat/tree/L-shape/cross-ridge
  fits, affine error under 5 cm, pull-push, EPT density depth, coverage) and `tsc` is clean.

**Review (subagent, 17 findings) — fixed:**
- **Candidate robustness**
  - Each candidate is tried separately, so a 404 after an index refresh skips that survey.
  - The point budget is per candidate.
  - `none` is written only when every survey was read and none had ground returns.
- **Cache key.** It is versioned and includes the index date.
- **Non-rectangular outlines** keep their mapped gable/hip style and take only the measured eave
  and ridge (no more L-houses turned into hips).
- **Cross-ridge gables** keep the measured ridge and pitch.
- **Plausibility gate.** Houses taller than 40 m are rejected.
- **Feet detection.** A survey whose median house is over 14 m is read as US feet and scaled
  (EPT keeps source Z units and `srs` doesn't say).
- **Octree and decoding**
  - Hierarchy expansion reaches the cap depth.
  - The point format comes from the masked header.
  - Holes fill with the mean of their neighbours.
- **Scheduling**
  - Fetches time out after 30 s.
  - The limiter hands its slot straight to the next waiter (LIFO).
  - Cells with no survey settle before queueing.
- **Slope.** Measured roofs stand on the footprint's mean ground.

**Deferred:**
- ridge axis for cross gables in `buildRoof`
- float32 node caches and a separate LiDAR worker
- vertical-datum offset when two surveys mix

**Also fixed.** Tile-fetch failures (for example the tile service returning 503 under Overpass
load) used to count toward "this worker can't build" and dropped every build to the main
thread. `FetchError` (cache.ts) now marks them `net`, and they retry via the failed-tile backoff.

**Dev notes.**
- Vite serves over HTTP/1.1. Slow `/__tiles` calls can starve other same-origin requests for
  minutes, which is why the index and WASM ship inside the worker bundle.
- Occluded browser panes stop `requestAnimationFrame`, so `__MONTAGE__(…, {timers: true})`
  drives the loop from timers instead.
- The worker's LiDAR notes land in the page console and `__GAME__.stream.workerLog`.

**Next:**
- trees from the same raster (canopy heights and positions: real street trees)
- J1 ground paint for streamed tiles
- vehicle polish

## 2026-09-26 (c) — Ride anything: cars, boats, planes · lush grass · sunrise start

**User direction:** buildings are good — now cars, boats and planes the player can ride/fly;
tall lush grass (not everywhere); grass must sit on lawns/fields, never sidewalks; start at
sunrise. (This is the plan's "traversal spike", pulled forward — it's also core gameplay.)

**Vehicles (`src/player/vehicles.ts`).** E enters/exits the nearest vehicle; V / B / N summon a
car (onto the nearest street lane, driving side from `styles.ts`), a boat (nearest open water,
bow away from land) or a plane (a clear 160 m run ahead, else circling overhead; airborne if
you're already flying). Driveway cars baked into tiles are enterable too: props names their
InstancedMesh `parked-cars`; the one you take is zero-scaled and stays hidden across tile
remounts. Arcade physics: car = bicycle model on terrain + decks with WalkWorld collision and
body pitch/roll from wheel heights; boat = water-bound (bumps off the shore), bobbing, bow
lift; plane = throttle (Shift/C), pitch (W/S), bank (A/D) → coordinated turn, stall sink,
takeoff rotation, landing/crash forgiveness (hard landings and rooftops set it down nearby),
auto-level; step out mid-air → free flight. Chase camera orbits with the mouse and eases
back; the walker is carried so streaming/life/interiors/HUD follow the vehicle. HUD shows
speed (+ altitude/throttle). Up to 6 player vehicles persist where you leave them.
Verified: `shots/vehicles-1.jpg`, `vehicles-2.jpg` (car on its lane + driving, boat on the
ocean, plane climbing/banking over the bay); 87–108 fps with grass on.

**Grass (`src/world/grass.ts`)** — after studying exploration-game3's GrassRenderer (dense
cheap blades, vivid per-biome tints, three height tiers, dark-base→bright-tip, continuous
coverage): player-centred instanced tufts in 20 m cells (72 m radius, shrink-fade, 3
cells/frame), deterministic per position. Lush saturated greens per climate, tall tiers
roughly half of open ground (meadow patches taller, the odd wildflower), mown lawns near
houses, wind sway with gusts, building shadows, back-lit glowing tips toward the sun. It
grows only where the *painted* ground is open: `GroundPaint.grassMask` paints each cell with
the same painter the player sees and allows only unpainted land or green washes — so no grass
on sidewalks, front walks, lots, plazas or beaches; streamed streets add a carriageway +
sidewalk margin. Built-up land-cover wash is now a muted lawn green (was grey khaki).

**Sunrise start.** Every walk begins a few minutes after today's real sunrise at the region's
location (ephemeris scan; `?hour=` overrides), then the clock runs on. Verified 07:10 at Sea
Bright (sun just over the ocean horizon) — `shots/start.jpg`.

**Teleport stays in the world.** `G` within ~80 km of the origin streams real tiles in the
same frame instead of reloading into a separate `?at=` world.

**Next:** vehicle polish (engine audio, headlights, ambient traffic you can hail, boat wake,
plane building collision via footprint heights, touch buttons); J1 ground paint for streamed
tiles (grass mask there is margin-based); L-lite measured heights.

## 2026-09-26 (b) — One consistent world, Phase I style, realistic houses

**User direction:** land in Sea Bright, walk to Monmouth Beach and beyond with no detail cliff;
houses should look real (shape, detail, windows, variety); one world to build on.

**One world (`shore`).** Diagnosis: each town had its own origin + bake, and the bake gave
full detail only inside `slice` — the whole backdrop ring (Rumson, Long Branch, Highlands)
was baked `lod` (simplified outlines, minor roads dropped, no addresses) and the runtime gated
doors/porches/interiors/props on the region slice. Fix, in three parts:
- `scripts/merge-raw.mjs` unions already-fetched regions (`mergeFrom`) — OSM by type+id,
  Overture by id, NAIP roof colours, WorldCover mosaic on ESA's 1/12000° grid, terrain tiles —
  with a coverage assertion. `shore` = Sea Bright → Monmouth Beach, Sea Bright's origin +
  spawn; the towns are `hidden` merge sources (never listed); old `?region=` links land in it.
- Bake detail zone = backdrop (`D`, `CFG.detail === 'slice'` restores the old behaviour);
  tiles carry `detail`; builders use `detailBox(json)` (buildings/props/signs). The slice keeps
  its two real jobs: the 2 m terrain lattice and the lamp compositor box.
- Past the backdrop, real-lite + DEM stream as before; DEM is now on whenever a tile service
  exists (baked regions included); baked cells never read a neighbour's DEM overhang.
Found en route: the IndexedDB cache fingerprint ignored tile *content* — a re-bake with the
same layout served stale tiles forever. Bake stamps `bakeId` (FNV over tile payloads).

**Dev plumbing.** `vite.config.ts`: `/__tiles/*` proxies to whichever port `wrangler dev`
took (8787/8788/8789) — the client probes it first (same-origin: no port guessing, no COEP
friction; the in-app browser blocks cross-port fetches). `/__shot` sink +
`tools/inpage-montage.js` (see AGENTS.md) — the shot harness for agents without Playwright.

**Phase I (first cut).** `src/world/styles.ts`: `regionStyle(lat,lon)` → climate (coarse
Köppen from latitude + continental boxes), world region, family (clapboard / brick / nordic /
stucco / adobe / tropical / eastasian), palettes, roof habits, window vocabulary, tree species
+ greens + density, biome ground wash, driving side. `meta.style` on virtual manifests; baked
regions derive it from the origin (NJ → `temperate/clapboard/R/na`, bit-identical palettes);
the key reaches the tile worker at init. Consumers: building palettes, synth roof mix, tree
scan, ground `uBiome`, facade `uWinStyle`. Upgrade path: a real Köppen/WorldCover raster
behind the same function. Tests: `tests/styles.test.ts` (NJ unchanged; Oslo nordic, Windhoek
adobe, London brick+left, Tokyo/Sydney left, Rome Mediterranean…; recipe determinism).

**Houses (J2-a, pulled forward — user priority).** `src/world/recipe.ts`: every per-building
decision = pure f(bd.s, style, fc/rc): facade/roof/trim colour, siding (clapboard / cedar
shingle / brick / stucco / board-and-batten → fraction of `vInfo.y`), roof material (asphalt /
standing-seam / clay tile / slate / shake → `vInfo.w` on roof faces), pitch, dormers, bay,
downspouts, chimney type; mapped brick-coloured walls get brick siding; aerial roof colours
clamp into a roofing gamut. Geometry: foundation plinth + ledge, parapet coping + cornice,
gabled dormers fitted into the street-facing roof plane (pure pre-pass → 1½-storey only when
one fits), downspouts with kick-outs, exterior side chimneys (door-aware, clearance-tested),
canted bay windows, lumpy clipped hedges. Roof priors: houses ~97% pitched (bake + realTile,
tile cache v4→v5); skeleton failures fall back to the other style, then a convex-hull hip
with walls rising to meet it. Regional sash vocabulary in the window shader.

**Verified:** typecheck; 67/67 tests (vitest-API shim — vitest can't load its Windows rolldown
binding from this sandbox); montages `shots/houses-1..4.jpg`, `dormers.jpg`, `oneworld.jpg`;
in-game roof audit 4.4% flat houses (= data). Expert review 7/10 → all must-fixes applied
(REVIEWER.md). `npm run build` still needs a run on the dev machine.

**Re-plan (why):** the fidelity research (massing/storeys/roof silhouette carry recognition;
facade colour is forgiven under paint) and the reviewer agree — **L-lite before J2**: measured
heights/storeys (Overture `height`/`num_floors` already in the raw join, 3D-GloBFP where
missing) matter more than more asset polish. **J1 in parallel**: the ring is walkable now, so
ground paint (walks, drives, lawns) and per-tile lamp pools outside the slice are the
"keep walking" contract. Then J2 rest, then a **vehicle/traversal spike** (25 m/s stresses
LOAD_R, worker throughput, DEM latency — and powers "ride any vehicle"/flight abilities),
then K life. Gameplay (vehicles, abilities) rides on the traversal spike, not before it.

## 2026-09-25 — Fidelity reality check (research, no code)

- User asked: MSFS shows "even my home house" via satellite imagery — should we chase
  it, pivot to an AI asset-builder product, or upgrade? 3 research agents ran.
- Findings + verdict in **`docs/FIDELITY_REALITY.md`**: MSFS = licensed photogrammetry
  (few hundred metros only, legally unreachable); per-house identity is achievable as
  *structural* truth (footprint+height+roof+roof color) under watercolor — facade
  color/texture is the one true gap (~1–3% global coverage, license-blocked).
  Japan PLATEAU is the outlier (CC-BY textured LOD2 — a JP bake could show real
  facades). Verdict: keep watercolor path; `bd.h` + US lidar roofs + vertex AO next;
  user-photo upload is the one legal path to true per-house fidelity.
- Also this session: dev UX — `TILES` auto-defaults to `localhost:8787`, `/health`
  probe + `?tiles=off`; user reported two queued bugs — window/door decal flicker
  (cosmetic) and the late-DEM seam (flat s-tiles beside hilled cells). Both logged in
  PROGRESS; handoff prompt written for the next agent.

## 2026-09-26 — Queued bugs fixed + the window asset rebuilt (Opus handoff session)

**Late-DEM seam (fixed).** s-tiles that lost the 4 s DEM race were built flat and never
revisited. Now the worker marks such a build `BuiltTile.demLate`; the stream records the
mount as `flat` and immediately asks for a *relief* build (`build(..., relief=true)`): the
worker awaits the untimed cell DEM (same promise the w-twin shares) and returns either
`null` (no patch — nothing to swap, retried ≤3× with 12/24/36 s backoff) or a full rebuild
on real heights. That lands in the build queue as `{replace:true}`; `mount()` unloads the
flat version and mounts the new one inside one synchronous call (fp/interior keys are
identical `${id}:${i}` across builds, so unload-first is required and no frame ever sees an
empty cell). Discarded if the w-twin already won or the cell unloaded. Related shelf bug
fixed en route: a *partially* failed DEM fetch sampled missing slippy tiles as 0 m — a fake
cliff to "sea" (also flagging water). `fetchDem` is now all-or-nothing, and neither the
slippy-tile cache nor the per-cell cache (worker + main-thread fallback) keeps failures, so
transient 5xx/timeouts retry instead of pinning a cell flat for the session.
Not yet verified live (needs `wrangler dev` running); typecheck + 60/60 tests.

**Window/door flicker (root cause found — it wasn't the fade).** `vInfo.x` (building id,
up to ~8.5 M for synth cells: `ord × 4096`) was an *interpolated* float varying; barycentric
error nudged it per pixel and `seedOf(id)` → every per-building choice (shutters or not,
their colour, siding, which windows exist) re-hashed pixel-to-pixel. That is the "black
sill/door flicker on approach": fine horizontal hatching that shifts with distance/angle,
which the Kuwahara pass then shredded into speckle. Fix: `flat varying` for `vInfo`,
`vTan` (buildings) and `vInfo`/`vOut` (interiors). Montage proof: raw close-up hatching gone.
Also fixed the transition itself: facade openings used to track distance continuously
(7–14 m) through a screen-space Bayer dither — standing mid-range left the house
permanently half-cut, crawling as you moved, and it opened onto nothing while the sliced
interior was still pending. Now: open only once the interior mesh exists, hysteresis
(open < 8 m, close > 10 m), ~0.3 s time-based wash with world-anchored `vnoise3` (can't
crawl), the opened house keeps focus until its wash runs out (no snap-shut when a neighbour's
door gets closer), and individual *windows* only turn into real openings within ~4–6 m of
that window — from the street the visited house keeps its glass like its neighbours.
Doors still read closed at range (kept, per the user).

**Window asset rebuilt** (user: "they look horrible" — agreed; J2's SDF-decal item pulled
forward). `buildings.ts` facade shader: head/drip-cap + light-catching sill with a soft
shadow down the siding; deep blue-grey glass with sky reflection (fresnel), one soft
diagonal sheen, reveal shadow at top/sides; muted interior-mapped room only up close and
darker than the street by day (that's what makes glass read as glass); per-building sash
style (6/6, 2/2, 1/1) with muntins that fade before they alias; pulled-down shades on ~⅓ of
windows (glow at night); panel shutters with a contact shadow replace the louvred stripes;
storefronts get mullions + transom bar, and shop lamps no longer tint daytime glass peach;
churches get round-headed lancets with stained-glass tint (`Win.arch`, `archIn()` shared
with the interior shader so the cut holes match); attic gable window gets lights + sill.
Hole geometry for interiors is unchanged (glass half-size `ww/2-0.08`).

**Tooling.** `tools/inpage-montage.js` + a dev-only `/__shot` sink in `vite.config.ts`:
agents driving a live browser (no Playwright) can pose shots and save a full-res contact
sheet to `shots/`. Vitest can't run in a Linux sandbox against a Windows `node_modules`
(rolldown native binding) — this session ran the suites through a throwaway ts-transpile +
vitest-API shim (60/60). `npm run build` still needs a run on the dev machine.
Shots: `shots/flicker-before.jpg`, `flicker-after.jpg`, `windows-before.jpg`,
`windows-after.jpg`, `shutter-close.jpg`.

## 2026-09-25 — H2: Terrarium DEM for virtual cells (shipped, reviewed 8.5/10)

**Status: shipped.** Expert review: **8.5/10 — SHIP, `?at=` earns the public flag once
the worker deploys** (user step: `wrangler login` → `r2 bucket create` → `wrangler deploy`
→ `manifest.tilesUrl`).

- New `src/world/dem.ts`: fetches Terrarium z14 PNGs through the CF worker's new
  `GET /dem/<z>/<x>/<y>.png` route (S3 `elevation-tiles-prod` proxy — required because
  the game is COEP-isolated and the bucket sends no CORP), decodes R*256+G+B/256-32768,
  bilinear-samples a 65×65 grid at 16 m pitch per cell, packs a synthetic TerrainLayer
  (heights f32-cm — i16 would cap real mountains at 327 m — plus honest defaults:
  sdf +50 m, cover 30 grass, flags 0, oceanD far).
- Plumbing: `BuiltTile.dem` carries `{buf, layout}`; tile worker fetches per-cell
  (s/w twins share via `demCache`), registers the patch BEFORE synthTile/buildTile so
  placeholder lots and real tiles both build on real heights; main thread registers
  under the cell key (prefix stripped) with `demHolders` refcounting so the s→w swap
  can't drop terrain mid-stride. `TerrainLayer.height` accepts `type:'f32'` chunks.
  s-tiles race DEM at 4 s; w-tiles await (masked by OSM). Enabled only when VIRTUAL.
- Cache: worker edge+R2 `dem/v1/` keys (PNGs immutable → 7-day edge TTL).
- **Verified live:** Presidio SF (37.8005,-122.4661) — 14 cells patched, heights
  71/96.7/94.7/25.2/56.7 m, walker stands at y=28.6 on a real hill. s-tiles get DEM.
- **Bugs found + fixed en route:** `bmp.close()` zeroed dims before `getImageData`
  (every fetch null — the real reason DEM silently failed); per-cell fetch bursts
  self-stampeded (now slippy-tile dedupe + 4-concurrency gate); the 4 s s-tile race
  poisoned the shared cache promise (now callers race an untimed per-cell promise).
- **FIXED pre-review:** `bmp.close()` zeroed dims before `getImageData` (silent-null
  root cause); per-cell DEM fetch stampede → slippy-tile dedupe + 4-concurrency gate;
  the 4 s s-tile race poisoned the shared cell promise → callers race an untimed one;
  `dem.buf` transfer detached the cached buffer → `slice(0)` per build; samples sat
  corner-aligned while `TerrainLayer.bil` expects cell centers → 64×64 at half-offsets.
- Reviewer should-fixes applied: sdf/flags now derive from elevation (sea = water —
  synth can't plant suburbs in bays anymore); `patchFor` checks the 8 neighbour cells
  (DEM overhang margin) so unbuilt rims don't leave flat shelves; health probe on the
  auto-defaulted service — dead worker → toast + synth-only (`?tiles=off` also works).
- Verified live: Presidio SF — 14 cells patched, heights 71/96.7/94.7/25.2/56.7 m,
  walker at y≈28 on a real hill, patches persist through s→w swaps; montage shows the
  bay and the real Marina grid with relief. 60/60 tests (new `dem.test.ts`), build clean.
- Deferred polish (reviewer): partial-tile-failure shelf (null cached per session),
  coarse-tier DEM is free real-mountain silhouettes (kept), spawn-adjacent DEM priority
  if the flat→hill pop reads badly in play, antimeridian (works — commented).
- User-reported cosmetic (queued): window-sill quads flicker black/pop at mid-distance;
  door meshes flicker on approach — likely the window-fade/door distance threshold or
  z-fighting on facade decals. Doors reading closed at range is liked; the pop-in is
  the ugly part.
- **User-reported seam bug (H2 follow-up, asked me not to fix yet):** flying past the
  bake edge, an s-tile whose DEM raced out at 4 s builds flat forever — beside a
  DEM-hilled cell it reads as sunken houses/trees + walking through the hill. Mesh
  heights and walker heights are consistent *within* a tile; the tile just never
  upgrades. Candidate fix: re-queue a rebuild when a mounted s-cell's DEM resolves
  late (mesh + collision-scope swap mid-walk), or lengthen the placeholder budget.
  Mostly affects cells reached slowly — spawn cells block on `ensureAround` and
  usually get DEM first.

- `realTile.ts` hybrid fill: when a cell's owner building density is <20/km of
  fillable road (residential/unclassified/tertiary/secondary/living_street), seeded
  L-shaped lots plant along real street edges — pitch ~22–32 m, jittered setback,
  alternating sides, 18 m bucket dedupe, rejects corners inside water or mapped
  footprints. Always `own` on the emitting (road-owner) cell so margin-landing fills
  don't get dropped by both neighbours. `Building.gen='fill'` marks them.
- Cache versioning: worker R2 key `t/v1→t/v2`; client tile URL gains `&v=2` (edge
  Cache API keys on the full URL — both layers bust together).
- Verified: 12/12 realTile tests (new: sparse→fills, dense→none, no water/footprint
  overlap, determinism); live worker on Hastings NE (40.586,-98.388): 88 mapped +
  90 fills = 153 bldgs; farmland/track-only cells correctly emit zero fills;
  56/56 suite, build clean, montage shows the sparse grid town reading as a place.
- Expert review round 1 on the fill (7.5/10) → fixes: fills emit round-robin across
  roads (cap can't starve later streets); `leisure`/`landuse` rings fetched as reject
  masks (no houses in parks/fields); mapped-building centroids stamp the 18 m buckets
  (small chapel inside a fill rect can't be swallowed); fill centers clamp to cell
  interior (no cross-seam stacking); diagonal bucket neighbours; position-seeded lots.
  Cache bumped v2→v3. Verified: 57/57 tests, live tile spread 18/28/24/20 by z-band.
- Round 2: **8.5/10 — no must-fix, "move to H2"**. Applied the cheap polish: per-road
  rng streams keyed by first vertex (mirror-order can't perturb lot positions), height
  derived from `s`, cache v3→v4. Deferred polish (rare-input): highway-plaza bypass,
  tangential graze vs large buildings, cross-seam fill adjacency.
- Commits: `7f32dfb` (fill), `e379253` (round-1 fixes), `96fe7c6` (round-2 polish).
  All local only — not yet pushed (earlier push went through `9a27f4d`).

## 2026-09-25 — Session handoff (for the next worker on this codebase)

**Where things stand.** H1 is done and reviewed twice (6.5 → 8/10). The open-world
premise is literally true in dev: `?at=51.5033,-0.1195&tiles=http://localhost:8787`
walked real London tonight — 8.3k footprints / 8.5k roads, real street names on the
HUD ("The Queen's Walk"), clean placeholder→real swaps, zero errors. `?at=` stays
behind the flag; the reviewer's gate for calling it shipped is H2's real terrain.

**Commits (all local — nothing pushed; branch is 4 ahead of origin):**
- `16095e9` Phase G: infinite world via deterministic procedural tiles
- `0107bb7` H1: real-lite tile service + open world `?at=` (worker/, realTile.ts, w-*/s-* swap, virtual manifest, ODbL credit)
- `5dc3f9e` Review round 1 fixes (painting toast, stranded-`?at` guard, HUD names, tz, settleWalker, spawn yaw, tree/bench points, paved footsteps)
- `adc60f5` Review round 2 fixes (settleWalker only fires on genuine swallows, region+far-`at` redirect, toast dedupe/throttle)

**Architecture in one paragraph.** `realTile.ts` (Overpass→TileJson) is the single
shared transform: the CF worker bundles it, vitest exercises it. `TileStream.specAt`
returns `[w-*, s-*]` twin specs for non-baked cells when `tilesBase` is set; s mounts
instantly, w retires it on arrival (`mount()` → `unload(s-twin)`). `virtual.ts` builds
a manifest with a snapped origin + flat 3 m synthetic terrain layer (rides in-band to
the tile worker as `bin`). Everything flows the same `buildTile → pack → mount` pipe.

**Gotchas learned the hard way.**
- The page is COEP-isolated: cross-origin worker responses need
  `Cross-Origin-Resource-Policy: cross-origin` or tiles get blocked.
- `x-tile-cache` baked into a cached response lies forever — store a twin response.
- Concurrent misses stampede Overpass unless the worker dedups in-flight promises.
- `--eval` strings in capture.mjs must be an IIFE/expression — top-level `return` throws.
- PowerShell: `git commit -m "<here-string>"` breaks on embedded quotes — write the
  message to `.commitmsg.tmp` and `git commit -F`.
- `worker/.wrangler/` is miniflare state — gitignored, keep it out of commits.
- Overpass reality tonight: 25–90 s/cell, 429/504 storms — the placeholder + negative
  edge cache + rotation all earned their keep. R2 makes it once-per-population.

**Next queue.** Worker deploy needs the user's Cloudflare account
(`wrangler login` → `r2 bucket create map-game-tiles` → `deploy`, then `tilesUrl` on
manifests / Pages). Then: H1c hybrid fill (synth lots on sparse real roads) → H2
Terrarium DEM (kills the flat plateau; ungates `?at=` publicly) → J/K parity.
Phase-G reviewer Round 2 (screenshot-backed) is still pending in `REVIEWER.md`.

---

## 2026-09-24 — Expert review round 2 → fixes (score 8/10)

- Re-review verdict: fixes landed; `?at=` is now honest behind the flag. Two real
  bugs in my round-1 code: `settleWalker` fired on every mount — including while the
  player stood legitimately inside a house (2D footprint test can't tell indoor from
  swallowed); and `?region=x&at=far-outside` still stranded silently.
- Fixed: `settleWalker` now only moves genuinely swallowed walkers — a wall through
  the body (`walk.blocked` at 0.28 < the 0.35 walker radius, so leaning on a wall is
  safe) or inside a solid footprint with no interior (`buildingAt` + `!interiors.indoors`
  + `interiorAt<0`). Boot-time `?region` + far `?at` redirects like `teleportTo` does
  (drops `region`, re-picks or goes virtual). Paint toast: re-arms per streaming
  burst, throttles after 3 fires (2.7 s → 9 s), defers instead of stomping other toasts.
- Verified: typecheck, 53/53 tests, build, 90 s soak with the hooks live — 0 stalls,
  0 hitches >250 ms, 0 frame errors (worst subsystem 9.9 ms interior).
- Reviewer's remaining notes (accepted, deferred): toast queue proper; wall-band/deck
  swallow detection is partial (wall-through-body covered); `?at=` public-shipped
  still gated on H2 DEM.

## 2026-09-24 — Expert review round 1 → fixes (score 6.5/10)

- Reviewer verdict: "the skeleton shipped; the fantasy still arrives late" — the
  open-world swap architecture is right, but the first minute gives zero signal that
  real streets are coming, `?at=` without `?tiles` could strand the spawn 5,500 km out,
  the HUD never learns a street name, UTC clock lied, and the s→w swap could tombstone
  collision under the player's feet.
- Fixed: persistent "the real streets are painting in…" toast while `w-*` fetches are
  in flight; `?at=` beyond all backdrops without a service now drops at the nearest
  baked town with an explanation (G-teleport redirects also drop `region`); HUD place
  line scans `stream.primRoads` so real names show (verified live: "The Queen's Walk",
  South Bank); virtual tz derived from longitude (`Etc/GMT±n`); `stream.onMount` +
  `settleWalker` nudges the player out of walls after a swap (verified live — fired);
  spawn yaw falls back to nearest mounted road instead of north; real-lite query now
  also pulls `natural=tree`/`amenity=bench` nodes → points; footsteps near mapped
  streets are 'paved' even where the flat layer says grass; virtual sub reads like a
  place ("51.50° N, 0.12° W — the real streets stream in").
- Held for later (documented): flat terrain/water gating → H2 DEM; per-tile lamp pools
  + hybrid lots + life palette → H3/J/K; coarse ring stays synth by design.
- Verified: typecheck, 53/53 tests, build, live probe in virtual London (toast fired,
  settle nudge fired, real names on HUD, 11 w-tiles mounted, 0 errors).

## 2026-09-24 — H1: real-lite tile service + open-world `?at=` — walking London

- **`src/world/realTile.ts`** (new): Overpass JSON → `TileJson`, shared verbatim between
  the Cloudflare worker and the client test-suite. Ports the bake's road/building/colour
  tables + `partitionEntities` margin/`own:0` semantics; coastline ways close against the
  cell boundary via a boundary-parametrized arc + wet-side probe (sea gets a real shore).
  Element-id-seeded heights/roofs → deterministic tiles for every client.
- **`worker/`** (new): `wrangler.toml` + `src/index.js` —
  `GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg>` → edge Cache API → R2 → Overpass
  (3-endpoint rotation on 429/504) → transform → R2+edge put. In-flight dedup so
  concurrent misses share one upstream call; 60 s negative edge-cache on upstream
  failure; CORS + `cross-origin-resource-policy` (the page is COEP-isolated in dev);
  `x-osm-attribution` header + `attribution` field on every tile (ODbL).
- **Client**: `?tiles=<base>` (or `AtlasManifest.tilesUrl`) → non-baked cells become
  `w-*` specs fetching absolute URLs (IndexedDB-cached as usual); each streams a `s-*`
  synth placeholder twin that mounts instantly and retires when the real tile lands —
  same seamless-swap idiom as coarse→detail. Coarse silhouettes stay synth (no Overpass
  burn for distant cells). `realExtras` gives w-tiles ground chunk + asphalt ribbons on
  real centrelines + water sheets (earcut, holes included). Lamp maps skip w/s cells.
- **Open world**: `?at=` beyond every baked backdrop + `?tiles` → `virtualRegion()`
  builds a manifest in code — origin snapped to a 1/64° grid (players at a place share
  cells AND the R2 cache), flat synthetic terrain layer (3 m land; H2 DEM replaces),
  terrain bytes passed in-band to the tile worker. `initCache` namespaces idb per origin.
- **UI**: `© OpenStreetMap contributors` credit line, bottom-right HUD, links to ODbL.
- **Verified**: typecheck, 53/53 tests (9 new realTile cases incl. neighbour-cell
  ownership + coastline wet side), build. Worker smoke under `wrangler dev`: real cells
  for Sea Bright (Ocean Ave, 7-Eleven) and central London (Blackfriars Rd, Inner London
  Crown Court — 1292 buildings/2740 roads per cell). Playwright probe at `?at=London`:
  8.3k footprints/8.5k roads mounted, s→w swaps clean, 0 errors. Montage shows real
  streets + buildings rendering in watercolor.
- **Upstream reality**: Overpass ran 25–90 s/cell tonight (not the 2–8 s the plan
  assumes). The placeholder absorbs it; R2 + in-flight dedup make each slow fetch
  one-time-per-population. Watch it — may warrant a `maxsize`/timeout tune or
  Geofabrik pre-seeding for popular regions.
- Next: H1c hybrid fill (synth lots on real roads where footprints are sparse), then
  H2 Terrarium DEM; deploy the worker (needs the user's Cloudflare account) and set
  `tilesUrl` on manifests / the Pages deployment.

## 2026-09-24 — Tiles → worker → cache → origin → coarse ring → deep links

- Shipped the whole Phase A–F sequence (commits `e433f1b`…`154cf60`): per-tile terrain packs,
  worker-built tiles (~5 ms mounts), IndexedDB cache, floating origin, 8 km coarse silhouette
  ring, `?at=lat,lon` deep links with doorstep-first spawn, plus `G` in-game teleport.
- Self-review pass (`5764762`): fixed worker-crash job deadlock; coarse→detail swap moved to
  just before the detail group lands.
- Trees: mistagged OSM road-side points now slide to the near verge instead of dropping;
  procedural scan trees get 4 new silhouettes (oak, shrub, spruce) via the same blob recipe.
- Root cause found for "trees still in the road": `pavedMask` ran on prim-filtered roads so
  margin-context (neighbour-owned) streets never masked anything, and the tree scan zone
  spanned overlapping tiles with an identical rng → duplicate trees at seams. Fixed by passing
  the unfiltered tile json (`ctx`) and clamping candidates to `spec.box`.
- Verified: typecheck, 44/44 tests, build, montages (street/porch/interior/bridge/top-downs),
  soak (stalls=2, frameErrors=0, mount ≤8 ms).
- Paused on masterplan phases; iterating on world variety next.

## 2026-09-24 (pm) — Variety pass 1: street furniture + real road fix

- Root-caused "trees still in the road" for real this time: `pavedMask` ran on the
  prim-filtered world (margin-context roads, `own:0`, stripped) so neighbour-owned streets
  never masked anything; also the identical per-tile rng meant scan candidates inside
  overlapping tile zones spawned twice. `buildProps` now takes `ctx` (unfiltered tile json)
  + `box` (scan clamp). Verified top-downs: lanes clear, yards full.
- New street furniture, all instanced + collision-scoped: fire hydrants (~1/4 of mailbox
  curbs, red/yellow), benches (real `bench` points + plaza/park/pitch/pool/beach-edge rims,
  seaward-facing on the beach), trash cans beside ~1/3 of benches, terracotta planters
  (some doors get a pair), and boxy front hedges flanking the walk on ~20% of houses.
- Hedge colour softened (15% toward dark spruce) and height dropped to 0.85 m after the
  first montage.
- Verified: typecheck, 44/44 tests, montages (shop/porch/doorway/raised/roofs/beach tops).

## 2026-09-24 (eve) — Placement fixes from play feedback

- User report: hedges/bushes landing on sidewalks and carriageways. Cause: hedge offsets were
  a fixed 6 m out from the door with only a `walk.blocked` check — nothing knew where the
  road edge was. Fix: `clearOfRoad(x,z,margin)` (road-edge distance) + `paved` checks on every
  hedge end/center; hedge tries yard depth first, falls back to foundation hug; porch doors
  skipped. Benches pull 1.1 m inside their area ring; hydrants/benches/cans all get road-edge
  margins (0.8/1.6/1.0 m — furniture may sit on pavement, never in lanes).
- Re-verified via porch/doorway/raised/shop + residential top-downs: shallow yards now skip
  hedges instead of planting on the sidewalk; lanes and kerbs clear.

## 2026-09-24 (night) — Interior amortization

- `Interiors.build` became `buildGen` — a generator yielding between sections (facade walls,
  per-storey slabs, per-partition, per-flight stairs, per-room furniture, assembly).
  `activate()` now lands state immediately and queues a pending build; `pump()` inside
  `update()` advances it under a ~3.5 ms/frame budget. The ~16 m door-proximity target means
  the approach walk covers the whole build; mesh swaps in atomically on completion.
  `prime()` keeps a synchronous drain for shader warmup at load.
- Soak: worst interior subsystem ms 112 → **7.3**, `stalls=0`, `hitches>250ms=0`,
  `frameErrors=0`, `maxFrame=167` over 90 s — the last real in-game stall is gone (residual
  multi-second frames from earlier soaks proved environmental).
- Interior montage (inside / inside-night / stairs / doorway): identical output.

## 2026-09-24 (night, review pass) — Six findings fixed

Reviewed commits `5199fe4`..`06ad50d` with a read-only subagent. Findings + fixes:

1. **Lifeguard stands scanned the whole (expanded) tile slice** — every tile emitted identical
   stands + duplicate collision ops. Clamped to `extras.box` like trees.
2. **Tree scan still ran `coverAt/sdfAt` over the entire ~2.9 km² zone per tile** — scan zone
   is now `extras.box` directly (off-box cells cost one comparison each, not terrain lookups).
3. **Legacy single-tile path built a backdrop-sized paved mask** — `maskZone` is now
   `box±8 ∩ slice±250`, capping the worker canvas.
4. **Deterministic `mount()` failure refetched every frame forever** — catch now records
   `failed` for the 10 s backoff.
5. **Shot loops could capture a hollow interior** — 8 pumped frames only cover ~28 ms of
   build; `interiors.flush()` drains pending before `inside/stairs` shots return.
6. **`plans.get(fi)!` outside try + pump failure left uniforms live** — stale keys mark failed
   and `activate(null)` restores the terrain cut + door uniforms instead of a permanent hole.

Post-fix soak: `stalls=0`, `hitches>250ms=1`, `interior=7.75ms`, `frameErrors=0`.

## 2026-09-24 (night) — Mobile support

- **Touch controls** (`controller.ts`): floating joystick on the left ~45% (analog walk,
  full push = run), look-drag on the rest; pinch-zoom disabled via viewport. Touch buttons
  (✈ fly, ⌂ teleport prompt, ☰ journal) appear when `body.touch` (coarse pointer or first
  touch). Keyboard/mouse untouched.
- **Why phones probably failed before**: tile-worker build failures (e.g. no OffscreenCanvas
  on old iOS) retried forever — never escalated to in-page builds. Now 3 consecutive job
  failures → `workerDead` → main-thread builds. And every `new OffscreenCanvas` went through
  `makeCanvas()` (new `world/canvas.ts`) with `document.createElement` fallback; atlas/lamp
  bitmaps via `canvasBitmap()` (`createImageBitmap` path on fallback canvases). `buildTile`
  is async now.
- **Fatal error overlay** (`#fatal`): `error`/`unhandledrejection` print to an on-screen
  panel — screenshot-able on phones.
- Small-screen CSS: intro card, HUD, journal collapse to column under 640 px.

## 2026-09-24 (night) — GitHub Pages deploy

- Pages was set to "Deploy from a branch: main /root" → it served the **raw TS source** —
  `index.html` loads but `./src/main.ts` can never execute → intro stuck at "mixing paints…"
  on every device. `.github/workflows/pages.yml` builds `dist/` (npm ci + build, node 20,
  `public/data/` is committed so tiles ship inside the artifact) and publishes via
  `actions/deploy-pages`. Required once: Settings → Pages → Source → **GitHub Actions**.
  Deployed: run 36200249416 green in 42 s — https://dero24.github.io/Map_Game/ now serves
  the built bundle.
- **Church steeple restored**: the roof-skeleton refactor dropped the backup-era steeple
  (white tower + green 4-sided spire). Re-added on the `roofG` path — tower at the ridge's
  longest-axis end (facade white), `cone()` spire in weathered copper green. Verified via
  ground-level shot at Saint George's: clearly a church again.

## 2026-09-23 � Infinite world: deterministic procedural fallback tiles

The world no longer ends at the manifest edge. Cells outside the baked region synthesize a
watercolor suburb forever � streets, sidewalks, poles, varied houses, benches, trees � via
the same build/pack/mount path as real tiles.

- **src/world/synth.ts** (new): synthTile(spec, seed, terrain) -> a full TileJson +
  extra group (ground chunk + road/sidewalk ribbons). Everything is *field-driven*: a
  warped street grid (108 m pitch, sine-wandered lines), a low-freq noise town mask for
  density, lattice-hash h for every choice. No per-tile RNG for layout -> seams are
  structurally impossible; neighbour tiles agree about shared roads/lots by position.
- **Streaming** (stream.ts): specAt(cx,cz) -> baked manifest tile or {id:s+key, synth:1}
  spec; update() iterates the cell window (not the manifest); radius sweep for drops.
  Fixes found by subagent trace: a queued set kills a resolved-but-unmounted refetch
  storm; coarse silhouettes now cover [LOAD_R, COARSE_R) (was [DROP_R, COARSE_R) - a
  900 m dead zone where nothing loaded); ensureAround enumerates synth cells too;
  synthOrd is cell-hashed (session-independent ids).
- **Worker** (	ile.worker.ts): init takes seed; spec.synth -> synthTile on-thread
  (pure JS, no fetches), then the identical uildTile+pack path. In-page fallback same.
- **Ground** (ground.ts/pack.ts): ground material exposed via userData.groundMat ->
  setGndMaterial(); new pack tag 'gnd'; synth tiles emit a ground chunk into extra.
- **Props** (props.ts): slice containment now uses the tile's own slice box (inSlice)
  so poles/trees/benches emit outside the baked grid; pavedMask bounds clamped for boxes
  fully outside the slice (was negative canvas size).
- **Buildings** (uildings.ts): landmarks ?? [] (synth has none).
- **Collision/main** (collision.ts, main.ts): walk.bounds widened to �4e6 m �
  walkable  forever, water still gates via height/sdf.
- **Life** (life.ts): env bounds widened �10 km so gulls/agents aren't slice-trapped;
  synth roads already reach the sim via primRoads.
- Determinism: seed = 
egionSeed(region) ^ cellHash; all layout choices hash position.
  ID_STRIDE reduced so fpIds stay exact in Float32 attrs.
- **Reviewer** (docs/earth/REVIEWER.md): persistent AAA-designer memory file created;
  round-1 verdict PASS WITH CONDITIONS 6/10 -> must-fixes applied same session
  (town-gated streets, per-axis ribbon heights, benches/entrances, lot jitter + L-shapes,
  life bounds). Round 2 (with screenshots) is the confirmation gate.
- Verified: typecheck + 44 tests + build + soak clean; captures at (-6800,-200) show a
  rendered suburb noon/golden/aerial.
