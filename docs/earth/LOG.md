# Earth expansion — session log

Newest first. One entry per work session: what changed, what was verified, what's next.

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
