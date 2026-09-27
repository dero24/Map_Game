# Immersion & scale backlog — everything the lower 48 needs

The exhaustive list of what must be built or improved so that any street in the contiguous US
looks, sounds and plays like a real place. Sea Bright → Monmouth Beach is the proving ground;
nothing here may be solved per town. Every item names the **system** that scales it (a data
source, a region/climate table or a foundry family). No hand lists.

- Status marks: ✅ shipped · 🟡 partial · ⬜ not started.
- Priority: **P0** blocks "looks amazing" in the hero region · **P1** needed before a second
  region ships · **P2** depth, for the country-wide game · **P3** polish or stretch.
- Sources: this doc merges the AAA design review (docs/earth/REVIEWER.md, 2026-09-27),
  ASSET_FIDELITY.md, ASSET_FOUNDRY.md, CONSTRUCTION.md and OPEN_WORLD.md.
- Top items are mirrored into `feature_list.json`; this doc is the long list.

---

## 0. Scaling rules (how every item below must be built)

1. **Data first.** Anything a dataset can tell us (OSM tags, Overture, LiDAR, NLCD/WorldCover,
   EPA ecoregions, USDA hardiness zones, SSURGO/lithology, NOAA climate normals, census block
   density) comes from data. Procedural generation fills only what data can't say.
2. **Tables, not towns.** Regional variety comes from lookup tables keyed on region, climate,
   ecoregion, state or OSM tag: `styles.ts`, `carMix`, `boatMix`, `plantMix` and the new ones
   below.
3. **Foundry families.** Every new object is a recipe → genome → geometry family with tests,
   a vertex budget and a workbench row (docs/ASSET_FOUNDRY.md checklist).
4. **Deterministic.** Position-hashed choices only; the same street for every visitor.
5. **Best defaults.** No player should need the settings panel. Quality tiers are picked by a
   boot benchmark, not by sliders.

---

## 1. The painted look (renderer & post) — P0

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | Pencil hatching in unexplored areas removed; a pale "first wash" instead | ✅ | 2026-09-27 |
| 1.2 | Pigment turbulence anchored to the world, luminance only (no swimming, no pink or yellow tint on white) | ✅ | post.ts; turbulence back to 0.22 |
| 1.3 | Depth-adaptive Kuwahara: crisp near, broad washes far; foliage crisper | ✅ | post.ts |
| 1.4 | Luminous shadows (hue-shift glaze, not a multiply), tighter terminator, less sky fill | ✅ | shared.ts, atmosphere.ts |
| 1.5 | Grass depth plus an alpha "foliage" mask; no ink over blades | ✅ | grass.ts, post.ts |
| 1.6 | Water: no radial stroke fan; world-fixed strokes | ✅ | water.ts |
| 1.7 | **Boot GPU benchmark** (2 s) → renderScale, Kuwahara radius, grass density, shadow size, life caps | ⬜ P0 | the only honest "best defaults" on every machine |
| 1.7b | **Ground albedo calibration** — ground paint at real-world reflectance (asphalt ≈ 0.1, concrete ≈ 0.35, dry sand ≈ 0.4) | ✅ | groundPaint.ts tables, 2026-09-27 |
| 1.7c | Harness luminance check: flag a frame where > 20 % of pixels sit above L 0.9 (blown out) | ⬜ P1 | tools/review-shots.js |
| 1.7d | Visual regression gate: diff each round's fixed-pose montage, fail on big deltas | ⬜ P1 | would have caught r2 frame 12 |
| 1.8 | Cloud shadows: scrolling fbm in `shadowAt` | ⬜ P1 | cheap, adds a lot of motion |
| 1.9 | Vertex AO / cavity on buildings and props (paintLight `ao` still 1.0 in propMaterial) | 🟡 P1 | ASSET_FIDELITY §3; trees now have crown AO |
| 1.10 | Soffit and eave shadow band; contact shadow at wall bases | ⬜ P1 | buildings.ts shader |
| 1.11 | Roof hue gamut: no greens or teals (hue 75–170° → warm grey), palette roofs too | ✅ | recipe.ts `roofGamut` |
| 1.11b | Foliage self-shadow: crowns shaded by their sphere field + AO, not their own lobes | ✅ | propMaterial.ts |
| 1.11c | Crown depth from LiDAR (lowest canopy return = crown base); near leaf-card LOD | ⬜ P2 | |
| 1.12 | Wet-edge "bloom" reveal as the world paints in, with a brush-and-water sound | ⬜ P1 | explore.ts + post |
| 1.13 | Seasonal grade: autumn crowns, winter bare trees + snow cover, spring blossom | ⬜ P1 | calendar → flora + ground shader |
| 1.14 | Weather that reads: rain streak wash, puddle glazes, sea fog banks, snow | 🟡 P2 | weatherParams exist, visuals thin |
| 1.15 | Tree impostors beyond ~1 km; far-field silhouettes painted | ⬜ P2 | perf plus horizon richness |
| 1.16 | Horizon and sky painting: layered cloud cards, sun/moon halos, lighthouse beams | 🟡 P2 | |
| 1.17 | Photo mode: brush size, paper choice, framing, time-lapse | 🟡 P3 | |

## 2. Assets up close (the foundry) — P0/P1

Rule: a close-up at 1–3 m must read as *made*, not boxy. The budget goes on silhouette,
bevels and one or two signature details per object.

| # | Family / item | Status | Notes |
|---|---|---|---|
| 2.1 | **People**: jointed body, knee/arm gait, 5 hairstyles, skin/hair/trouser palettes, clothing by climate × season | ✅ | `src/assets/people.ts` (2026-09-27) |
| 2.2 | People 2: body types (child, tall, heavy, elderly with cane), bags, dogs on leads, strollers, bikes | ⬜ P1 | per-instance scale + add-on keys |
| 2.3 | People 3: activity props (surfboard carry, fishing rod, coffee cup, phone, umbrella in rain) chosen from the place | ⬜ P2 | OSM context → activity table |
| 2.4 | Cars near-LOD: bevelled bodies, wheel arches, mirrors, glazing inset; 3–4 seeded shapes per type | 🟡 P1 | kit.ts; vehicle-polish item |
| 2.5 | House near detail: door hardware, house numbers (`addr:housenumber`), gutters and downspouts, AC units, hose reels, window boxes, porch furniture, flags, wreaths | ⬜ P1 | new `facade-kit` family, keyed by style and region |
| 2.6 | Windows: bigger house sash (0.9×1.5), paired mulled units, fewer blanks, curtains and blinds in the glass | 🟡 P1 | buildings.ts |
| 2.7 | Storefronts: awnings, signage from OSM `name`, display windows with wares by `shop=*`, café tables out front | 🟡 P1 | signs.ts exists; wares are new |
| 2.8 | Lot dressing for every house: driveway, parked car, hedge or fence, walk gap, trash cans on collection day | 🟡 P0 | mailboxes ✅; generated drives + cars, hedges and picket fences for every NA house (2026-09-27); trash day ⬜ |
| 2.9 | Fences and gates family: picket, split-rail, chain link, privacy, adobe wall, stone wall (by region) | ⬜ P1 | |
| 2.10 | Street furniture: benches, bins, bike racks, hydrants, parking meters, bus shelters, newspaper boxes | 🟡 P1 | benches and poles only |
| 2.11 | Parking lots: stall striping, cars at ~60% occupancy, cart corrals | ⬜ P0 | fixes the aerial "ghost lots" |
| 2.12a | Sand surface: shore-parallel ripples, wrack line, footprint stipple (from the shore distance field) | ✅ | ground.ts |
| 2.12b | Beach props: dune fence, dune grass (not lawn), shells and sea glass, lifeguard stands everywhere | 🟡 P0 | umbrellas, towels, stands ✅ |
| 2.12c | Shorelines: bulkheads, riprap, seawalls (OSM `man_made=breakwater\|groyne`, `barrier=retaining_wall`), marsh edges with reeds | ⬜ P1 | the Sea Bright seawall is a defining feature |
| 2.12d | Crosswalks, stop bars, curb ramps in the ground paint | ⬜ P1 | streets read untended without them |
| 2.13 | Docks, piers, boardwalks, jetties from one recipe | 🟡 P1 | piers exist |
| 2.14 | Playgrounds, ball fields, courts (OSM `leisure=*`) | ⬜ P2 | |
| 2.15 | Holiday and seasonal decorations by calendar: July 4 bunting, Halloween pumpkins, Christmas lights | ⬜ P2 | calendar table |
| 2.16 | Trees 2: species by ecoregion (live oak + moss, cypress, saguaro, Joshua tree, aspen, redwood, sycamore, cottonwood) | 🟡 P1 | 7 species now |
| 2.17 | Trees 3: per-branch wind, leaf flutter, fall colour, bare winter form | ⬜ P2 | |
| 2.18 | Shrubs and groundcover by region: sagebrush, creosote, palmetto, azalea, rhododendron, prairie grasses | 🟡 P1 | plantMix has 12 species |
| 2.19 | Rocks and minerals by lithology: granite, sandstone, red rock, basalt, limestone, glacial erratics, coquina | 🟡 P1 | rocks exist but are not regional |
| 2.20 | Water details: buoys, crab-pot floats, channel markers, bridge fenders | ⬜ P2 | |

## 3. Interiors — P1

Today: houses have furnished rooms, stairs, lamps and residents. The next step is **interior
archetypes chosen by OSM tag**, built from one room-kit vocabulary (counters, booths, shelves,
desks, fixtures) so every restaurant in 48 states is generated, never modelled.

| # | Archetype (OSM tag) | Signature read | Status |
|---|---|---|---|
| 3.1 | Light: daylight falloff from windows, corner darkening, sun pools through glass | — | ⬜ P0 |
| 3.2 | Diner / restaurant (`amenity=restaurant`, `cuisine=*`) | booths, counter with stools, pass-through, menu board, pie case | ⬜ P1 |
| 3.3 | Café / bakery | espresso bar, pastry case, chalkboard | ⬜ P1 |
| 3.4 | Pizza place / deli | oven glow, counter, slices under glass | ⬜ P1 |
| 3.5 | Bar / pub | back bar with bottles, taps, neon | ⬜ P2 |
| 3.6 | Grocery / convenience | aisles of shelves (colour blocks), coolers, checkout | ⬜ P1 |
| 3.7 | Surf / bait / marina store | boards on racks, rods, wetsuits | ⬜ P2 |
| 3.8 | Office (`office=*`, commercial) | open plan, meeting room, reception, water cooler | ⬜ P2 |
| 3.9 | Bank, post office, town hall, library, school, firehouse, church | counters, PO boxes, stacks, desks, trucks, pews | ⬜ P2 |
| 3.10 | Hotel / motel lobby and rooms | desk, key rack, corridors | ⬜ P2 |
| 3.11 | Homes 2: kitchens with appliances, bathrooms, kids' rooms, basements, attics; decor by region | ⬜ P1 | |
| 3.12 | Residents 2: routines (cooking, TV, reading, sleeping), and they leave for work | ⬜ P2 | |
| 3.13 | Interiors reflect time: lights on at dusk, closed shops dark, "Open" signs by `opening_hours` | ⬜ P1 | |

## 4. Animation & life — P1

| # | Item | Status |
|---|---|---|
| 4.1 | People gait (thigh, knee, arm counter-swing, bob) | ✅ |
| 4.2 | Idle set: weight shift and arm sway ✅; sit on benches and stoops, lean on railings, chat in pairs, jog, dog-walk ⬜ | 🟡 P1 |
| 4.2b | First-person presence: the player's shadow and feet; a hand/brush in photo mode | ⬜ P2 |
| 4.2c | Night from the street: lit interiors through windows, headlight pools, porch lights | 🟡 P1 |
| 4.3 | Density by place and time: beaches at noon in summer, downtown at lunch, empty at 3 am; day of week | 🟡 P1 |
| 4.4 | Doors open as people enter; car doors; garage doors | ⬜ P2 |
| 4.5 | Flags, laundry lines, wind chimes, beach umbrellas flutter with the shared wind | ⬜ P2 |
| 4.6 | Gulls land on posts and roofs; flocks wheel; pelicans skim waves (south) | 🟡 P2 |
| 4.7 | Traffic signals cycle; cars stop at stop signs; school buses in term time | ⬜ P2 |
| 4.8 | Wildlife 2 by ecoregion: herons, egrets, osprey, pelicans, deer, fox, raccoon, armadillo, lizards, roadrunner, moose, elk, bison, gators | 🟡 P1 |
| 4.9 | Fishing boats go out at dawn; ferries on real routes (OSM `route=ferry`) | ⬜ P2 |

## 5. Audio — P1

| # | Item | Status |
|---|---|---|
| 5.1 | Footsteps by surface: sand, boards, grass, asphalt, tile, carpet, gravel, snow | 🟡 (grass/paved) |
| 5.2 | Room tone and reverb by room size; door open/close; muffled outdoors when inside | ⬜ P1 |
| 5.3 | Restaurant chatter, kitchen clatter, café grinder, store beeps (from the interior archetype) | ⬜ P1 |
| 5.4 | Regional soundscape tables: cicadas (SE), loons (N), coyotes (SW), frogs (wetlands), foghorns (coast) | ⬜ P1 |
| 5.5 | Weather audio: rain on roofs and on the umbrella, thunder, wind in the pines vs. the palms | 🟡 P2 |
| 5.6 | Sparse adaptive music: piano/guitar phrases on arrival, at golden hour and when a painting completes | ⬜ P2 |
| 5.7 | Vehicle audio: engine by type, tyre on wet roads, boat outboards, planes | 🟡 P2 |

## 6. Gameplay — country-wide systems (data-driven)

The calm core loop is: **walk → the world blooms into colour → notice → frame → paint**.
Everything below gives that loop somewhere to land, across 48 states, without per-town content.

| # | System | What it is | Status | Priority |
|---|---|---|---|---|
| 6.1 | **The Almanac** (field guide + passport) | Spotting draws a pencil card; painting the subject colours it in; place cards from named POIs/buildings (your painting is the card); one stamp per town; "found in <county>" | ✅ v1.1 (44 kind cards + infinite place cards) | next: regional sets (ecoregion/state tables), condition variants (heron at dawn, lighthouse in fog), streamed POIs |
| 6.2 | **Local Plates** | Walk into real diners and cafés (OSM `amenity` + `cuisine`), order at the counter, paint the dish; dishes from a state × cuisine table (taylor ham in NJ, crab cakes in MD, green chile in NM) | ⬜ | **P1, build second** |
| 6.3 | Commissions 2 | Requests keyed to OSM categories and time ("the lighthouse at dawn", "a red boat at the marina") | ✅ v1 | P1 |
| 6.4 | Daily Prompt | A date-seeded shared challenge for everyone ("something red at the water's edge at dusk") | ⬜ | P2 |
| 6.5 | Themed chains | OSM category × radius: lighthouses within 100 km, covered bridges, every diner on Route 36, state capitols | ⬜ | P2 |
| 6.6 | Road trips | Drive between towns on real highways; postcards at county and state lines; scenic byways (OSM route relations) | 🟡 (driving exists) | P2 |
| 6.7 | Seasons & calendar | Real date drives bloom, foliage, snow and events; seasonal commissions (pumpkins in October, fireworks on July 4) | 🟡 (bloom) | P2 |
| 6.8 | Beachcombing & rockhounding | Shells and sea glass on coasts; minerals inland from lithology; a shelf in your studio | ⬜ | P2 |
| 6.9 | Garden & studio | The Grow verb ✅; claim a real rental as your studio; paintings hang on its walls; the garden is out back | 🟡 | P2 |
| 6.10 | Sit verb | Sit on benches, docks and stoops; time passes faster; wildlife approaches the still | ⬜ | P1 (cheap, on-tone) |
| 6.11 | Sharing | Postcards export (image + real address + date), shared links to a place and time | 🟡 (photo) | P2 |
| 6.13 | **The first 10 minutes** | A systems-driven onboarding path: arrival card → first bloom → first spot → first commission → first painting | 🟡 (pieces exist) | P1 — decides retention |
| 6.12 | Accessibility | Colour-blind-safe UI, subtitles for sounds, remappable keys, gamepad, low-motion mode | ⬜ | P1 |

## 7. Regional flavour tables (content, not code)

Each is a table keyed on region, state, ecoregion or climate, read by the systems above.

| Table | Keys | Feeds | Status |
|---|---|---|---|
| Architecture vocabulary | style region | Cape Cod, saltbox, triple-decker, rowhouse, Victorian, Craftsman, ranch, split-level, shotgun, Creole cottage, dogtrot, adobe/pueblo revival, Spanish mission, Florida cracker, A-frame, farmhouse + barn + silo, grain elevator, mobile home, raised coastal | 🟡 (styles.ts) |
| Flora | EPA Level III ecoregion + hardiness zone | tree species, shrubs, lawn vs xeriscape, crops in fields | 🟡 |
| Fauna | ecoregion + habitat + hour | critter mix | 🟡 |
| Minerals & rock | lithology raster (USGS) | rocks, beach sand colour, stone walls, road shoulders | ⬜ |
| Dishes | state × cuisine | Local Plates | ⬜ |
| Signage | state DOT | route shields, street-sign colours, plate designs | 🟡 |
| Vehicles | region + climate + urban/rural | carMix (pickups rural, Jeeps coastal), boatMix | ✅ |
| Festivals & events | state/county × month | seasonal commissions, decorations | ⬜ |
| Soundscape | ecoregion × season × hour | ambience beds | ⬜ |
| Clothing | climate × season × place | people warmth (✅ v1), beachwear, workwear | 🟡 |

## 8. World data coverage (every region, not just the bake)

| # | Item | Status | Priority |
|---|---|---|---|
| 8.1 | Streamed (`w-*`) tiles carry landuse, POIs, addresses, opening hours | 🟡 | P0 for Local Plates |
| 8.2 | Ground paint outside the baked slice: walks, drives, lawns, parking stripes | 🟡 | P0 |
| 8.3 | Per-tile lamp pools on streamed streets at night | ✅ | the clamp was absolute height vs DEM ground; now relative to the local ground (`uLampBaseY`) |
| 8.3b | **World persistence**: traffic/walkers survive tile streaming (`LifeSim.adopt`); parked player vehicles + taken driveway cars survive sessions | ✅ | next: persist moved props, opened doors, time-of-day routines per agent |
| 8.4 | LiDAR everywhere 3DEP covers; Overture heights/floors elsewhere | 🟡 | P1 |
| 8.5 | Fauna, rocks and beach gear chosen by region (today: beach gear on any coast, rocks generic) | ⬜ | P1 |
| 8.6 | Hero region 02: a desert Southwest town (adobe, xeriscape, saguaro, lizards, red rock) proves the tables | ⬜ | P1 (`hero-region-02`) |
| 8.7 | Hero regions 03–05: Gulf coast (live oak + moss, shotgun houses), Mountain West (aspen, A-frames, elk), Midwest farm town (grain elevator, cornfields, Main Street) | ⬜ | P2 |
| 8.8 | Water bodies: lakes, rivers, reservoirs, marsh — flow direction, reeds, lily pads by region | 🟡 | P2 |
| 8.9 | Roads: correct widths and markings by class and state; rural shoulders; dirt roads | 🟡 | P2 |

## 9. Tech & performance

| # | Item | Status | Priority |
|---|---|---|---|
| 9.1 | Boot GPU benchmark → quality tier (see 1.7) | ⬜ | P0 |
| 9.2 | GPU-placed grass from the mask texture (no CPU per-cell builds) | ⬜ | P1 |
| 9.3 | Kuwahara at 4K: 4-sector variant or quarter-res for far pixels | ⬜ | P1 |
| 9.4 | Per-tile draw-call budget + merged static props | 🟡 | P1 |
| 9.5 | People: ~1.4k verts × cap 640 ≈ 0.9 M verts; distance LOD (billboard figures beyond 60 m) | ⬜ | **P0** |
| 9.6 | Traversal spike: 25 m/s driving stress on LOAD_R, worker queue and DEM | ⬜ | P1 (`traversal-spike`) |
| 9.7 | Review harness: fixed-pose montages every round (tools/review-shots.js), clear-view pose search | ✅ | |
| 9.8 | Headless CI capture at low resolution (the container is too slow for 1600×900) | ⬜ | P3 |

---

## Build order (the reviewer's amended order at the hero-region PASS, 2026-09-27)

The hero region passed at 8.5/10 on streets, beach, night and the Almanac loop — **not yet on
interiors or the Ocean Ave downtown**. Carried-forward P0 checks: night pool rhythm, downtown
wares/café tables, interior sun pools + foundry furniture, tree-lobe silhouette noise.

1. **Boot GPU benchmark + quality tiers** (1.7).
2. **Streamed-parity harness**: the same pose types on 3 random US towns every review round.
3. **Almanac regional sets + place cards from streamed POIs** (6.1, 8.1).
4. **Local Plates + restaurant, café and home interiors** (6.2, 3.1–3.4, 3.11).
5. **Hero region 02** (desert SW) to prove every table in §7 on a second climate.
6. The rest by priority, one feature_list item at a time.
