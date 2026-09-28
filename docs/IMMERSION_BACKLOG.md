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
- **Last updated 2026-09-27 (night):** place parity — skyscrapers and building parts, row
  houses with fire escapes, the horizon ring, the skyline ring, city and desert sound, street
  furniture from OSM, North American cladding by subregion, and tunable looks (LOG entry (n),
  `docs/earth/PLACE_REFERENCES.md`). Earlier: `c08c82a`, `8b82dcc`.

---

## 0. Scaling rules (how every item below must be built)

1. **Data first.** Anything a dataset can tell us (OSM tags, Overture, LiDAR, NLCD/WorldCover,
   EPA ecoregions, USDA hardiness zones, SSURGO/lithology, NOAA climate normals, census block
   density) comes from data. Procedural generation fills only what data can't say.
2. **Tables, not towns.** Regional variety comes from lookup tables keyed on region, climate,
   ecoregion, state or OSM tag: `styles.ts`, `carMix`, `boatMix`, `plantMix`, `faunaMix`, the
   `uses.ts` tag table, `rhythmFor` and the new ones below.
3. **Foundry families.** Every new object is a recipe → genome → geometry family with tests,
   a vertex budget and a workbench row (docs/ASSET_FOUNDRY.md checklist). A new species or
   furniture piece is a table row.
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
| 1.7d | Visual regression gate: diff each round's fixed-pose montage, fail on big deltas | 🟡 P1 | the occluder assert is in (no mesh > 25 % of a pose within 4 m) |
| 1.8 | Cloud shadows: scrolling fbm in `shadowAt` | ⬜ P1 | cheap, adds a lot of motion |
| 1.9 | Vertex AO / cavity on buildings and props (paintLight `ao` still 1.0 in propMaterial) | 🟡 P1 | ASSET_FIDELITY §3; trees now have crown AO |
| 1.10 | Soffit and eave shadow band; contact shadow at wall bases | ⬜ P1 | buildings.ts shader |
| 1.11 | Roof hue gamut: no greens or teals (hue 75–170° → warm grey), palette roofs too | ✅ | recipe.ts `roofGamut` |
| 1.11b | Foliage self-shadow: crowns shaded by their sphere field + AO, not their own lobes | ✅ | propMaterial.ts |
| 1.11c | Crown depth from LiDAR (lowest canopy return = crown base); near leaf-card LOD | ⬜ P1 | **the reviewer's outstanding item: street trees read blocky at 5–10 m (3 rounds)** |
| 1.12 | Wet-edge "bloom" reveal as the world paints in, with a brush-and-water sound | ⬜ P1 | explore.ts + post |
| 1.13 | Seasonal grade: autumn crowns, winter bare trees + snow cover ✅ (season.ts from date × place; `?day=`/`?date=`, panel day of year); spring blossom, snowbanks on ploughed kerbs, dormant winter lawns ⬜ | 🟡 P1 | 2026-09-27 (o) |
| 1.14 | Weather that reads: rain streak wash, puddle glazes, sea fog banks, falling snow, storms that come and go (a real forecast feed later) | 🟡 P1 | snow cover by season exists; weather events thin |
| 1.15 | Tree impostors beyond ~1 km; far-field silhouettes painted | ⬜ P2 | perf plus horizon richness |
| 1.16 | Horizon and sky painting: layered cloud cards, sun/moon halos, lighthouse beams | 🟡 P2 | |
| 1.17 | Photo mode: brush size, paper choice, framing, time-lapse | 🟡 P3 | |
| 1.18 | **Looks you can tune + a chosen default**: 'watercolor HD' picked side by side on real places (`__PLACE__(tag, { looks })`); the Sep 27 default kept as 'classic (Sep 27 default)'; presets watercolor / fine detail / vivid painted (sci-fi) / storybook soft / classic half-res | ✅ | post.ts, panel.ts, docs/earth/LOOK_DEFAULTS.md — Robby tweaks, then says which knobs to lock |

## 2. Assets up close (the foundry) — P0/P1

Rule: a close-up at 1–3 m must read as *made*, not boxy. The budget goes on silhouette,
bevels and one or two signature details per object.

| # | Family / item | Status | Notes |
|---|---|---|---|
| 2.1 | **People**: jointed body (~1.72 m adult proportions), knee/arm gait, 5 hairstyles, skin/hair/trouser palettes, clothing by climate × season, seated and knocked-down poses; faces (eyes, brows, mouth; hair open at the front) | ✅ | `src/assets/people.ts`, `render/creature.ts` |
| 2.1b | People faces 2: expressions (smile, talk), glasses, beards, blinking; noses and ears with shape; a skin-shaded head that isn't a low-poly ball up close | ⬜ P1 | Robby: "faces need more detail" — first pass landed (o) |
| 2.2 | People 2: body types (child, tall, heavy, elderly with cane), bags, dogs on leads, strollers, bikes | ⬜ P1 | per-instance scale + add-on keys |
| 2.3 | People 3: activity props (surfboard carry, fishing rod, coffee cup, phone, umbrella in rain) chosen from the place | ⬜ P2 | OSM context → activity table |
| 2.4 | Cars near-LOD: bevelled bodies, wheel arches, mirrors, glazing inset; 3–4 seeded shapes per type | 🟡 P1 | kit.ts; vehicle-polish item |
| 2.5 | House near detail: door hardware, house numbers (`addr:housenumber`), gutters and downspouts, AC units, hose reels, window boxes, porch furniture, flags, wreaths | ⬜ P1 | new `facade-kit` family, keyed by style and region |
| 2.6 | Windows: bigger house sash (0.9×1.5), paired mulled units, fewer blanks, curtains and blinds in the glass | 🟡 P1 | buildings.ts |
| 2.7 | Storefronts: per-building sign fascia / solid trade-colour awning / rare stripes; signage from OSM `name`; displays lifted into the glass; café terraces with seated guests; curbside parking | 🟡 P1 | wares by `shop=*` still generic |
| 2.8 | Lot dressing for every house: driveway, parked car, hedge or fence, walk gap, trash cans on collection day | 🟡 P0 | mailboxes, drives + cars, hedges, picket fences ✅; trash day ⬜ |
| 2.9 | Fences and gates family: picket, split-rail, chain link, privacy, adobe wall, stone wall (by region) | 🟡 P1 | pickets only in clapboard country; rendered yard walls + wrought iron in adobe/stucco towns ✅ |
| 2.10 | Street furniture: benches, bins, bike racks, hydrants, parking meters, bus shelters, newspaper boxes | 🟡 P1 | benches, poles, lamps; OSM hydrants, traffic-signal masts, subway entrances ✅; main-street acorn posts ✅; steel masts in dense cores ✅ |
| 2.11 | Parking lots: stall striping, cars at ~60% occupancy, cart corrals | ⬜ P0 | fixes the aerial "ghost lots" |
| 2.12a | Sand surface: shore-parallel ripples, wrack line, footprint stipple (from the shore distance field) | ✅ | ground.ts |
| 2.12b | Beach props: dune fence, dune grass (not lawn), shells and sea glass, lifeguard stands everywhere | 🟡 P0 | umbrellas, towels, stands ✅ |
| 2.12c | Shorelines: bulkheads, riprap, seawalls (OSM `man_made=breakwater\|groyne`, `barrier=retaining_wall`), marsh edges with reeds | ⬜ P1 | the Sea Bright seawall is a defining feature |
| 2.12d | Crosswalks, stop bars, curb ramps in the ground paint | 🟡 P1 | ladder crosswalks at tertiary+ junctions ✅; stop bars, ramps ⬜ |
| 2.13 | Docks, piers, boardwalks, jetties from one recipe | 🟡 P1 | piers exist |
| 2.14 | Playgrounds, ball fields, courts (OSM `leisure=*`) | ⬜ P2 | |
| 2.15 | Holiday and seasonal decorations by calendar: July 4 bunting, Halloween pumpkins, Christmas lights | ⬜ P2 | calendar table |
| 2.16 | Trees 2: species by ecoregion (live oak + moss, cypress, saguaro, Joshua tree, aspen, redwood, sycamore, cottonwood) | 🟡 P1 | 8 species now (+ mesquite / palo verde in arid climates) |
| 2.17 | Trees 3: per-branch wind, leaf flutter, fall colour, bare winter form | ⬜ P2 | |
| 2.18 | Shrubs and groundcover by region: sagebrush, creosote, palmetto, azalea, rhododendron, prairie grasses | 🟡 P1 | plantMix has 12 species |
| 2.19 | Rocks and minerals by lithology: granite, sandstone, red rock, basalt, limestone, glacial erratics, coquina | 🟡 P1 | rocks exist but are not regional |
| 2.20 | Water details: buoys, crab-pot floats, channel markers, bridge fenders | ⬜ P2 | |
| 2.21 | **Furniture (decor) family**: sofa, armchair, bed, tables, chairs, bistro/office chairs, monitor, lamps, café counter, booth, shelves, plants, ceiling fan, storage bench, café set — tested, per-piece vertex budgets | ✅ | `src/assets/decor.ts` |

## 3. Interiors — P1

Interior archetypes are chosen by the building's use (`useOf(name, Building.u)` — OSM tags
first), built from the decor family, with table counts scaled by floor area.

| # | Archetype (OSM tag) | Signature read | Status |
|---|---|---|---|
| 3.1 | Light: daylight falloff from windows, corner darkening, sun pools through glass (window shapes with muntins) | — | ✅ |
| 3.2 | Diner / restaurant (`amenity=restaurant`, `cuisine=*`) | booths, counter with stools, menu board, tables | ✅ (pie case, pass-through ⬜) |
| 3.3 | Café / bakery | counter facing the door, pastry case, espresso machine, menu board, back bar, pendants, 2.2 m table pitch | ✅ |
| 3.4 | Pizza place / deli | oven glow, counter, slices under glass | ⬜ P1 |
| 3.5 | Bar / pub | back bar with bottles, taps, neon | ⬜ P2 (uses the diner layout today) |
| 3.6 | Grocery / convenience | aisles of shelves (colour blocks), coolers, checkout | 🟡 P1 (stocked gondolas) |
| 3.7 | Surf / bait / marina store | boards on racks, rods, wetsuits | ⬜ P2 |
| 3.8 | Office (`office=*`, commercial) | desks, monitors, office chairs ✅; meeting room, reception ⬜ | 🟡 P2 |
| 3.9 | Bank, post office, town hall, library, school, firehouse, church | counters, PO boxes, stacks, desks, trucks, pews | 🟡 P2 (church pews exist) |
| 3.10 | Hotel / motel lobby and rooms | desk, key rack, corridors | ⬜ P2 |
| 3.11 | Homes 2: kitchens with appliances, bathrooms, kids' rooms, basements, attics; decor by region | 🟡 P1 | foundry furniture, fans, benches ✅ |
| 3.12 | Residents 2: routines (cooking, TV, reading, sleeping), and they leave for work | ⬜ P2 | |
| 3.13 | Interiors reflect time: lights on at dusk, closed shops dark, "Open" signs by `opening_hours` | ⬜ P1 | |

## 4. Animation & life — P1

| # | Item | Status |
|---|---|---|
| 4.1 | People gait (thigh, knee, arm counter-swing, bob) | ✅ |
| 4.2 | Idle set: weight shift and arm sway ✅; seated café guests ✅; residents sit on sofas / chairs / booths / stools and talk with their hands ✅; sit on benches and stoops, lean on railings, jog, dog-walk ⬜ | 🟡 P1 |
| 4.2d | **People doing things and interacting** (Robby, 2026-09-27): street groups that stop and talk (face each other, gesture, laugh, part), greetings and waves as walkers pass, window-shopping at storefronts, queues at a counter, staff who move (bartender pours, cook at the pass, cashier serves), residents who cook / read / watch TV / eat at the table, kids playing in yards, people walking dogs, carrying bags, holding phones; an activity table keyed by place (shop type, time, weather) so it scales | ⬜ P0 | lifeSim states + creature.ts poses + interiors activity spots |
| 4.2b | First-person presence: the player's shadow and feet; a hand/brush in photo mode | ⬜ P2 |
| 4.2c | Night from the street: lit interiors through windows, headlight pools, porch lights | 🟡 P1 |
| 4.3 | Density by place and time: shore / town / desert day rhythms ✅ (`rhythmFor`); day of week, season ⬜ | 🟡 P1 |
| 4.4 | Doors open as people enter; car doors; garage doors | ⬜ P2 |
| 4.5 | Flags, laundry lines, wind chimes, beach umbrellas flutter with the shared wind | ⬜ P2 |
| 4.6 | Gulls land on posts and roofs; flocks wheel; pelicans skim waves (south) | 🟡 P2 |
| 4.7 | **Cars follow traffic**: signals cycle (the mapped `traffic_signals` masts exist) and cars obey them, stop signs and all-way stops, yielding at turns, lane discipline on multi-lane roads, parking manoeuvres into the kerb cars' gaps, buses on `route=bus` that stop at the mapped bus stops, school buses in term time | ⬜ P0 | Robby: "cars follow traffic" |
| 4.8 | Wildlife 2 by region: 17 species on two body plans, cast by `faunaMix` (fox, hawk, coyote, jackrabbit, snowshoe hare, ground squirrel, mule deer, roadrunner, quail, ibis …); still to add: herons, egrets, osprey, pelicans, raccoon, armadillo, lizards, moose, elk, bison, gators | 🟡 P1 |
| 4.8b | **Ecosystem**: predators stalk/pounce and stoop; prey vigilance + alarm contagion; animals give way to traffic | ✅ |
| 4.8c | **Street physics**: cars knock walkers down (sprawl → sit up → walk back); next: animals crossing roads, AI traffic braking for them | 🟡 P2 |
| 4.9 | Fishing boats go out at dawn; ferries on real routes (OSM `route=ferry`) | ⬜ P2 |

## 5. Audio — P1

| # | Item | Status |
|---|---|---|
| 5.1 | Footsteps by surface: sand, boards, grass, asphalt, tile, carpet, gravel, snow | 🟡 (grass/paved) |
| 5.2 | Room tone and reverb by room size; door open/close; muffled outdoors when inside | ⬜ P1 |
| 5.3 | Restaurant chatter, kitchen clatter, café grinder, store beeps (from the interior archetype) | ⬜ P1 |
| 5.4 | Regional soundscape tables: cicadas (SE), loons (N), coyotes (SW), frogs (wetlands), foghorns (coast) | 🟡 P1 — the city by built volume (roar, horns, sirens, crowd, pigeons) ✅; desert cicadas + dawn doves ✅; the sea only by the sea ✅ |
| 5.5 | Weather audio: rain on roofs and on the umbrella, thunder, wind in the pines vs. the palms | 🟡 P2 |
| 5.6 | Sparse adaptive music: piano/guitar phrases on arrival, at golden hour and when a painting completes | ⬜ P2 |
| 5.7 | Vehicle audio: engine by type, tyre on wet roads, boat outboards, planes; knockdown thud + "oof" ✅ | 🟡 P2 |

## 6. Gameplay — country-wide systems (data-driven)

The calm core loop is: **walk → the world blooms into colour → notice → frame → paint**.
Everything below gives that loop somewhere to land, across 48 states, without per-town content.

| # | System | What it is | Status | Priority |
|---|---|---|---|---|
| 6.1 | **The Almanac** (field guide + passport) | Spotting draws a pencil card; painting the subject colours it in; place cards from named POIs/buildings (your painting is the card); one stamp per town; "found in <county>" | ✅ v1.1 (52 kind cards + infinite place cards) | next: regional sets (filter by `faunaMix` / plantMix), condition variants, streamed POIs |
| 6.2 | **Local Plates** | Walk into real diners and cafés (OSM `amenity` + `cuisine`), order at the counter, paint the dish; dishes from a state × cuisine table (taylor ham in NJ, crab cakes in MD, green chile in NM) | 🟡 (the diners and cafés exist; ordering ⬜) | **P1, build next** |
| 6.3 | Commissions 2 | Requests keyed to OSM categories and time ("the lighthouse at dawn", "a red boat at the marina") | ✅ v1 | P1 |
| 6.4 | Daily Prompt | A date-seeded shared challenge for everyone ("something red at the water's edge at dusk") | ⬜ | P2 |
| 6.5 | Themed chains | OSM category × radius: lighthouses within 100 km, covered bridges, every diner on Route 36, state capitols | ⬜ | P2 |
| 6.6 | Road trips | Drive between towns on real highways; postcards at county and state lines; scenic byways (OSM route relations) | 🟡 (driving exists) | P2 |
| 6.7 | Seasons & calendar | Real date drives bloom, foliage, snow and events; seasonal commissions (pumpkins in October, fireworks on July 4) | 🟡 (bloom, winter hares) | P2 |
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
| Fauna | climate (→ ecoregion next) × role | `faunaMix`: species per ecological role | 🟡 (climate rows for NA; other continents fall back) |
| Business uses | OSM amenity / shop / office / craft | terraces, interiors, storefronts (`uses.ts`) | ✅ (+ en/es/fr/it/de/pt name fallback) |
| Street rhythm | climate + coast | pedestrian and traffic day curves (`rhythmFor`) | 🟡 (shore/town/desert; day of week ⬜) |
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
| 8.1 | Streamed (`w-*`) tiles carry landuse, POIs, addresses, opening hours | 🟡 | P0 for Local Plates — named business nodes, building parts, rows, signals/hydrants (tile cache **v10; needs a worker redeploy**). `?tiles=direct` streams from three Overpass mirrors meanwhile |
| 8.2 | Ground paint outside the baked slice: walks, drives, lawns, parking stripes | 🟡 | P0 |
| 8.3 | Per-tile lamp pools on streamed streets at night | ✅ | the clamp was absolute height vs DEM ground; now relative to the local ground (`uLampBaseY`) |
| 8.3b | **World persistence**: traffic/walkers survive tile streaming (`LifeSim.adopt`); parked player vehicles + taken driveway cars survive sessions | ✅ | next: persist moved props, opened doors, time-of-day routines per agent |
| 8.4 | LiDAR everywhere 3DEP covers; Overture heights/floors elsewhere | 🟡 | P1 |
| 8.5 | Fauna, rocks and beach gear chosen by region | 🟡 | P1 — fauna ✅ (`faunaMix`, verified streaming a desert town); rocks and beach gear ⬜ |
| 8.6 | Hero region 02: a desert Southwest town (adobe, xeriscape, saguaro, lizards, red rock) proves the tables | 🟡 | P1 (`hero-region-02`) — streamed Tucson shows arid/adobe style + desert cast; needs real OSM tiles (worker) and saguaro/lizards |
| 8.7 | Hero regions 03–05: Gulf coast (live oak + moss, shotgun houses), Mountain West (aspen, A-frames, elk), Midwest farm town (grain elevator, cornfields, Main Street) | ⬜ | P2 |
| 8.8 | Water bodies: lakes, rivers, reservoirs, marsh — flow direction, reeds, lily pads by region | 🟡 | P2 |
| 8.9 | Roads: correct widths and markings by class and state; rural shoulders; dirt roads | 🟡 | P2 |

## 8b. Place parity — would someone from here recognise it?

Reference photos + per-place trait tables: `docs/earth/PLACE_REFERENCES.md`. Harness:
`tools/place-shots.js` (`__PLACE__(tag)`, nine frames anywhere). Reviewer NYC round 1: 5/10.

| # | Item | Status | Priority |
|---|---|---|---|
| P.1 | Real heights (m/ft, floors vs height sanity, 830 m cap), OSM `building:part` setbacks | ✅ | |
| P.2 | Tower facades: glass curtain wall vs masonry by material / era / height; penthouses, water tanks | ✅ | |
| P.3 | Row buildings (party walls in dense blocks): brick/brownstone, flat roofs + cornices, fire escapes, storefront street floors on avenues | ✅ | North America; Europe keeps pitched terraces |
| P.4 | Horizon ring: real mountains 6–80 km (Terrarium z9), curvature, haze from local ground | ✅ | |
| P.5 | Skyline ring: towers ≥ 45 m within 8 km as silhouettes past the detail ring; they now stay until their cell's real tile mounts (flying in used to melt the city away) | ✅ | |
| P.5b | **Dense-city placeholders**: a cell with skyline towers shouldn't show a synth small town while its real tile streams (Robby in Manhattan: "buildings in the distance but I was not in a city"); prefetch the cells ahead of a flying player; deploy the worker so R2 serves cold cells | ⬜ | P0 |
| P.6 | Canyon light: street-level ambient and key reduced by the sky-view factor | ⬜ | P1 |
| P.7 | Street life by frontage + built volume; taxis; bus stops + shelters ✅; buses from `route=bus` ⬜ | 🟡 | |
| P.8 | Urban sidewalk grammar: paved dense blocks + neighbourhoods ✅, tree pits + bins ✅, storefront aprons ✅; sidewalk sheds, newspaper boxes ⬜ | 🟡 | P1 |
| P.9 | Road width model: carriageway + parking lanes from `width` / `lanes` / `parking:*`; NA town streets park both kerbs; striped lots with cars; a per-car LOD (kerbCars.ts) | ✅ | 2026-09-27 (o) |
| P.9b | Worn asphalt (cracks, sealed patches) ✅ on streamed streets; lane paint wear, oil stains in parking lanes, manholes ⬜ | 🟡 | P1 |
| P.9c | Instanced LOD everywhere: the kerbCars manager pattern for driveway cars, trees (impostors past ~300 m), props | ⬜ | P1 |
| P.10 | House cladding by North American subregion (brick South / Midwest, clapboard Northeast, cedar Northwest) | ✅ | styles.ts `naSub` |
| P.11 | Hydrants / yield signs / kerb paint by state; US-flag banners on main-street lamps in summer | ⬜ | P2 |
| P.12 | Agave, yucca, saguaro, gravel yards for the desert; mesquite/palo verde foliage tints ✅ | 🟡 | P1 |
| P.13 | Far mountains with ridge detail (z11 inside 40 km), blue-violet aerial perspective ✅, clear desert air ✅ | 🟡 | P1 |
| P.14 | Zero-setback barrio fronts (Tucson Barrio Viejo): adobe rows at the sidewalk with a stone band, bright paint, tall narrow doors | ⬜ | P1 |
| P.15 | No phantom buildings: unmapped LiDAR finds over water dropped ✅; the backdrop canopy no longer buries detail tiles (Rumson) ✅ | ✅ | 2026-09-27 (o) |

## 9. Tech & performance

| # | Item | Status | Priority |
|---|---|---|---|
| 9.1 | Boot GPU benchmark → quality tier (see 1.7) | ⬜ | P0 |
| 9.2 | GPU-placed grass from the mask texture (no CPU per-cell builds) | ⬜ | P1 |
| 9.3 | Kuwahara at 4K: 4-sector variant or quarter-res for far pixels | ⬜ | P1 |
| 9.4 | Per-tile draw-call budget + merged static props | 🟡 | P1 — empty species meshes are hidden |
| 9.5 | People: ~1.4k verts × cap 640 ≈ 0.9 M verts; distance LOD (billboard figures beyond 60 m) | ⬜ | **P0** |
| 9.5b | Interior furniture vertex budgets (a café of 30 tables ≈ 1/5 of the old cost) | ✅ | tests/foundry.test.ts |
| 9.6 | Traversal spike: 25 m/s driving stress on LOAD_R, worker queue and DEM | ⬜ | P1 (`traversal-spike`) |
| 9.7 | Review harness: fixed-pose montages every round (a–f), clear-view pose search, occluder assert | ✅ | |
| 9.8 | Headless CI capture at low resolution (the container is too slow for 1600×900) | ⬜ | P3 |

---

## Build order

Reviewer round 6 (8/10 on the expanded scope) had all its must-fixes applied the same
session. Round 7 confirms them, and the tree silhouette (1.11c) is its first must-fix.

1. **Redeploy the tile worker** (v13) — every streamed town then gets parts, rows, signals,
   parking, bus stops, parks and lots from the shared R2 cache instead of the browser's Overpass
   queue (and Manhattan stops being a small town while it loads).
1b. **Game-quality review loop** (Robby, 2026-09-27): an expert reviewer (Nintendo / Rockstar
   bar: fun, feel, responsiveness, believability) plays montages of many places each round —
   real-world parity, cars that follow traffic (4.7), people who do things (4.2d), animals,
   weather (1.14) — across the lower 48, and the top fixes land before new scope.
2. Place-parity rounds: NYC to 8/10 (canyon light, street life, sidewalk grammar), then
   Seattle and Miami, then small towns in each NA subregion.
3. **Tree silhouettes at 5–10 m** (1.11c).
4. **Boot GPU benchmark + quality tiers** (1.7) and people LOD (9.5) — the looks panel exists,
   the benchmark picks a default tier.
5. **Local Plates** (6.2) on the diners and cafés that now exist.
6. **Almanac regional sets** (6.1) filtered by the place's tables.
7. **Hero region 02** (desert SW): saguaro, lizards, red rock, xeriscape.
8. The rest by priority, one feature_list item at a time.
