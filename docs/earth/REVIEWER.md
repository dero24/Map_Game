# REVIEWER — world-design judgment log

The reviewer is a read-only "master open-world AAA game designer" subagent. Each review
round appends a dated verdict below. This file is the reviewer's memory: before judging a
new round, read every prior verdict so continuity is kept (what was promised, what was
already criticized, what shipped).

A round passes only when the latest verdict has **no open must-fix items**.

## What the reviewer evaluates

- Does a frame read as *a place* or as procedural noise? (composition, silhouette, rhythm)
- Seam quality at tile boundaries — do streets/lots continue or visibly cut?
- Density logic — does the town mask clump believably (cores, edges, countryside)?
- Scale correctness — road widths, lot sizes, setbacks, building heights vs walkers.
- Watercolor coherence — synth content should not fight the baked look.
- Walkability feel — can you keep walking, is the horizon interesting?
- **Everything Robby judges when he plays (2026-09-27, the standing checklist):** driving feel
  and taking a parked car; traffic that follows the rules (signals, stop signs, no fused or
  bunched cars, turns); people doing things (talking, window shopping, waiting for the light,
  dog walkers, joggers, variety of people) and crossing safely; persistence (someone who walks
  into a house is in it); animals where animals live (not crowding parking lots), none floating;
  swimming; water traffic (boat variety, colour, shape); plants and trees by species (willows,
  leaf arrangement), indoor plants; car detail (lights, grilles); bridges; hills (Seattle's
  streets); map search landing on the place; real map data everywhere (never "synth" streets in a
  real town); streaming (towers that don't vanish, no small-town placeholders in a city); and the
  big goals — physics with weight, destruction, a flexible animation engine, magic creation.
  Sea Bright is the gold standard; every region must match its own vibe from seed + real data.

## Verdicts

### 2026-09-23 — Round 1: procedural fallback tiles (first synth pass)
**Verdict:** PASS WITH CONDITIONS
**Reads real:** The field-driven architecture is genuinely shippable — warped sine grid at 108 m
pitch kills the "perfect Manhattan lattice" look, town-mask density clumping gives cores/edges,
land-run road splitting frays the coast correctly, margin ownership + identical builder pipeline
means interiors/doors/collision just work, and the coarse silhouette ring guarantees no horizon
holes. The skeleton is right.
**Reads fake:** Streets existed at 80% coverage everywhere regardless of the town mask (ghost
grids in open country); coplanar ribbon quads z-fought at intersections; zero street furniture /
entrances — houses hovered on a flat slab beside bare ribbons; ambient life stopped at the bake
boundary (silence cliff); all footprints were plain rectangles on a rigid 21 m pitch. NB: no
screenshots reached the reviewer (subagent sandbox couldn't read `shots/`) — visual claims were
inferred from the generator; ground/travel captures existed (`seabright-montage.jpg`,
`seabright-top_-6800_-200_700.png`) and did show streets, sidewalks, poles, varied houses.
**Must-fix:** (status after same-session pass)
1. ~~Gate `segOn` on `town()`~~ — done: rural cells now collapse to sparse lanes; every 4th
   line survives as a low-density arterial (`synth.ts:39`).
2. ~~Intersection z-fighting~~ — done: per-axis ribbon heights, EW asphalt +0.085 vs NS +0.075
   (`synth.ts:193`).
3. ~~Streetscape~~ — partially done: pole/lamp/wire props now emit on synth roads (inSlice fix
   + RANK≥2), benches + entrance door-hints emitted (`synth.ts:133,150`). Driveways/hedges open.
4. ~~Lot rhythm~~ — done: jittered step (17–26 m) and setbacks (±5 m), ~20% L-shaped houses,
   corner lots fully land-gated (`synth.ts:105-155`).
5. ~~Ambient-life cliff~~ — partially done: `life.ts` env bounds widened ±10 km; synth roads
   already flow into `primRoads` so the sim graph covers them. Full continuity untested.
**Nice-to-have (open):** order-independent lot dedupe across tiles; cul-de-sac caps at water
cutoffs; synth-only "arrival" moments (church/landmark at town-mask peaks); driveway/hedge
ground paint for synth lots.
**Score:** 6/10 — correct bones, empty body → post-pass: skeleton + streetscape both fixed;
Round 2 (with pixels) is the confirmation gate.

### Round 2 needs (for the next reviewer session)
- Screenshots must be verified reachable — subagents' file tools may not see `shots/`; the
  orchestrator should either embed images in prompt paths it can open, or confirm montage path.
- Judge: town/clump believability from the air; seam cleanliness on a tile boundary; whether
  the streetscape pass reads at ground level; water-adjacent behaviour.

---

### 2026-09-25 — H1 Round 1: real-lite tile service + open-world `?at=`
**Verdict:** 6.5/10 — "the skeleton shipped; the fantasy still arrives late."
**Reads real:** the `w-*`/`s-*` twin architecture is right — one `buildTile → pack → mount`
pipeline for all four feeders, placeholder mounts instantly, real tile upgrades in place,
scoped collision. Verified live in dev at `?at=51.5033,-0.1195` (Elephant & Castle):
8.3k footprints / 8.5k roads from real OSM.
**Reads fake:** zero UI signal while real tiles stream (player meets synth suburbia and
assumes that IS the mode); `?at=` without `?tiles` stranded the spawn ~5,500 km out;
virtual spawn faced north regardless of streets; HUD could never learn a street name;
UTC clock; the swap could tombstone collision under the player's feet; grass footsteps
on London tarmac; intro card showed raw coordinates.
**Must-fix (all applied, `5dc3f9e`):** painting toast while `worldPending`; stranded-`at`
guard + `teleportTo` drops `region`; HUD scans `stream.primRoads` (verified: showed
"The Queen's Walk"); `Etc/GMT±lon/15` tz; `onMount`+`settleWalker` nudge; spawn yaw from
mounted roads; `natural=tree`/`amenity=bench` OSM nodes → points; paved footsteps near
streets; place-like virtual sub.
**Deferred (tracked):** flat terrain → H2 DEM gate; per-tile lamp pools + life palette →
J/K; coarse ring stays synth by design.

### 2026-09-25 — H1 Round 2: re-review of the fixes
**Verdict:** 8/10 — fixes landed; `?at=` is honest behind the flag. `?at=` may ship publicly
once H2's DEM lands.
**Caught in the fix set (all applied, `adc60f5`):** `settleWalker` yanked legit indoor
players on any mount (2D footprint test can't tell indoor from swallowed — now gated on
wall-through-body `blocked@0.28` + solid-footprint-no-interior); `?region=x&at=far` still
stranded silently (boot redirect drops `region`); paint toast stomped other toasts + died
after one window (now defers, re-arms per burst, throttles 2.7→9 s after 3 fires).
**Open polish:** toast queue proper; wall-band/deck swallow detection partial; coarse ring
synth forever (accepted design, may revisit with idle-queue prefetch).

### For the next phase review (H3 hybrid fill)
- The feature under review: sparse real-lite cells fill lots along real roads (synth
  houses seeded per-cell). Judge: does hybrid sell "a real place" or read as planted?
- Density gating is the risk — a village with 5 mapped buildings but real character
  shouldn't get buried in generated lots.

---

### 2026-09-25 — H3-lite Round 1: hybrid fill on sparse real streets
**Verdict:** 7.5/10 — idea and gating right; betrayed by cap distribution + missing land masks.
**Findings (all applied):**
1. ~~90-cap starved later roads~~ — sites now collect per-road and emit round-robin;
   verified live (Hastings fills spread 18/28/24/20 across 256 m z-bands).
2. ~~fills could plant in parks/farmland~~ — query gains `leisure`/`landuse` ways+relations;
   rings become reject masks (not rendered).
3. ~~corners-only containment missed small buildings inside a fill rect~~ — mapped
   building centroids now stamp the 18 m buckets before fills start.
4. ~~margin fills could stack across cell seams~~ — fill centers clamp to cell interior.
**Also:** diagonal bucket neighbours; fills position-seeded (`cx_cz`) so a different
element order still yields the same building seed; cache keys bumped `v2 → v3`.
**Confirmed correct:** winding matches `ringArea` expectation; fills are plain `k:'house'`
(doors/interiors/porches all work); `service`/`track` excluded from fill streets.

### 2026-09-25 — H3-lite Round 2: re-review of the fill fixes
**Verdict:** 8.5/10 — no must-fix, no blocking should-fix. **Move to H2.**
All four fixes landed correctly (round-robin fairness incl. unequal lists; land masks
with proper fall-through for `landuse+building` ways; bucket-stamp kills the
small-building-in-rect case; interior clamp is consistent with the emit rule).
**Applied from polish:** per-road rng streams (true mirror-order independence — element
ordering no longer perturbs lot positions) and height derived from `s` (no shared-rng
draw at emit time). Cache v3→v4.
**Open polish (accepted, post-H2):** `highway`-tagged plazas bypass masks; tangential
graze vs large mapped buildings; cross-seam fill-vs-fill adjacency; wasted inner-ring
collection. All rare-input.

---

### 2026-09-25 — H2 review: Terrarium DEM for virtual cells
**Verdict:** **8.5/10 — PASS, ship `?at=` publicly once the worker is deployed.**
Strongest-scoped phase yet: "DEM is just another TerrainLayer patch" rides the same
mount/unload + refcount lifecycle as everything else — zero new consumers.
**Applied from the review:**
1. ~~sdf `+50m` lie → ocean read as lawn, synth could plant suburbs in bays~~ — sdf/flags
   now derive from elevation (h ≤ 0.5 m = water); below-sea-level land reads water too
   (rare, placement-only, heights stay true).
2. ~~`patchFor` keyed only the sample's cell → flat shelf at edges~~ — neighbour cells
   checked (DEM patches overhang by design).
3. ~~localhost TILES auto-default could spam a dead worker~~ — `/health` probe on first
   use → toast + synth-only fallback.
**Also applied during bring-up:** corner-aligned → cell-center sampling (TerrainLayer's
bilinear convention), `bmp.close()` dims bug, fetch stampede → slippy dedupe + gate,
timed-promise cache poisoning, `dem.buf` detachment.
**Confirmed correct:** mercator frame math, nodata sentinel, refcount+ordering on the
s→w swap, coarse tiers get free real-mountain silhouettes (kept deliberately).
**Deferred:** partial-tile-failure shelf (retry), spawn-adjacent DEM priority if the
flat→hill pop reads badly, comment-vs-code drift cleanup.
**Player-found (new, not from this review):** window-sill/door decal flicker at
approach — cosmetic, queued.

---

### 2026-09-26 — One World + Phase I style + house realism (J2-a)
**Verdict:** 7/10 — NOT PASSED at review time (3 must-fix); all three + the key should-fixes
were applied the same session (see below). Architecture right; new house features were
visibly misfiring in the montages.
**Reads real:** Sea Bright / N. Monmouth Beach street views are the most convincing yet —
raised post-Sandy houses on pilings with stairs, centre-hall colonial with chimney, hip
bungalows, shutters, painted sash windows. Recipe is pure f(bd.s, style, fc/rc); detailBox
kills the permanent low-detail ring; bakeId in the cache fingerprint; style key reaches the
worker; NJ palettes/pitch bit-identical.
**Reads fake:** Rumson read as a motel/trailer park (flat boxes, 40 m ranch) — real Rumson is
big pitched colonials under oaks; Long Branch has no walks/drives (outside slice paint);
ground is one undifferentiated wash; lollipop trees on 5–6 m bare trunks; every roof sage/teal;
only 1 of 5 "dormer" frames showed a dormer.
**Must-fix (all applied):**
1. ~~Side chimneys painted as concrete block~~ — `fo` 99 put the whole stack under the
   foundation band; now `fo = 0` (brick-coded wall, faces < 2 m carry no windows).
2. ~~Side chimney on the street/door gable, collider walls off the stoop~~ — now placed after
   the door: never the door wall, prefers the gable facing away from the street, clearance
   test against neighbours (`rings.hit`) and roads.
3. ~~Dormers promised but not delivered~~ — pure `planDormers` pre-pass on the roof; the
   1½-storey massing + steep pitch only apply when ≥1 dormer fits, else the house is rebuilt
   full-storey with the style pitch; dormers ≥ 2.1 m wide and flagged (len+1000) so windowAt
   never drops their window.
**Should-fix applied:** porch roofs carry the recipe roof material (were `round(fo)` → random
metal/tile); convex-hull hip roof for outlines the skeleton rejects (walls rise to meet it) —
houses only go flat when the data says so (~4.4%, measured in-game); lite (coarse-ring)
builds skip all detail geometry again (`buildBuildings(…, lite)`); baked cells never sample a
neighbour's DEM overhang (`Terrain.baked`); merge-raw asserts backdrop coverage + clamps the
WorldCover mosaic (shore backdrop trimmed to w −74.04 / e −73.94 — the union's NW corner had
no data); aerial roof colours clamped into a roofing gamut (`roofGamut`); hedge run 3.4 m.
**Open (tracked):** per-tile lamp pools for the now-walkable ring (J1); ground paint (walks,
drives, lawns) outside the slice (J1); lollipop trees → street-tree species/scale; bay side
glazing; bakeId ignores terrain.bin; old `?region=` links → `?at=`.
**Plan re-order (reviewer + fidelity research agree):** must-fixes → **L-lite** (measured
heights/storeys: Overture height/num_floors, 3D-GloBFP) ∥ **J1** (ground paint + lamps for the
whole backdrop) → J2 → vehicle/traversal spike (stress LOAD_R/worker/DEM at 25 m/s) → K.
Silhouette/storeys drive recognition at 50–300 m; asset polish on wrong massing is wasted.

## 2026-09-26 (d) — LiDAR measured buildings: code review (engineering, not visual)
**Scope:** `lidar.ts`, `lidarCore.ts`, `measure.ts`, worker/stream relief wiring, builder use.
**Verdict:** sound architecture; 6 must-fix, 11 nice-to-have. The synth-DEM relief path is
unchanged, and there is no relief loop (relief builds wait with no timer).
**Must-fix (all applied):**
- Cross-ridge gables collapsed to the long-axis skeleton at double pitch → keep the ridge and
  pitch, and restate the eave.
- The shared point budget starved later candidate surveys, and `none` was then cached for
  good → budget per survey; `none` only when every survey was read.
- One failing survey broke the whole cell, and `none` never expired → try/catch per
  candidate; key includes the index date plus a version.
- L/T-shaped gables became hips → non-rectangles are "pitched" and keep the mapped style.
- No plausibility or units gate → reject houses over 40 m; detect feet by the median house.
- Unbounded reads with FIFO queueing → 30 s fetch timeout; LIFO slot handoff.

**Nice-to-have applied:**
- expand the hierarchy to the cap
- deterministic level-budget read order
- masked point format
- mean hole fill
- settle no-coverage cells early
- limiter race and recMem race
- slope (mean ground)
- widened coverage test

**Deferred:**
- ridge-axis flag in `buildRoof`
- float32 node cache / a dedicated LiDAR worker
- cross-survey datum offset
- hierarchy cache eviction

**Visual check** (same poses, on vs off): Sea Bright and Denver both read truer (flat
Ocean Ave blocks, raised 9 m post-Sandy houses, Denver-square hips, flat alley garages).
A design review with screenshots is still owed for the next visual round.

---

### 2026-09-27 — AAA look + play review, rounds 1–5 (Sea Bright → Monmouth Beach, default settings) — PASS 8.5
Reviewer persona: a Nintendo EAD / Rockstar North art, design and engineering lead. The bar is
"Sea Bright and Monmouth Beach look amazing and play fun, and it scales to 48 states". The
harness is `tools/review-shots.js`: 16 fixed poses in three montages, including a streamed Long
Branch street at night, people up close, street trees up close and the beach at eye level.

**Round 1 — 6/10, NOT PASSED.** Four of the problems broke the illusion on their own:
- neon grass taller than the camera;
- a radial fan in the water;
- a muddy shadow plan;
- box people.

The key finding was that the "moving blotches" came from the turbulence *formula*: it was a
screen-anchored field applied per channel, which tinted white sand. Its strength wasn't the
cause. Must-fixes, all applied:
1. World-anchored, luminance-only pigment turbulence (0.22).
2. Mown lawns in towns (built cells / non-wild cover); meadow only in open country; greens
   desaturated ×0.7.
3. Grass writes depth plus alpha 0; the composite masks ink by scene alpha.
4. Water strokes in two world-fixed frames.
5. A hue-shift shadow glaze (value kept), a tighter terminator, less and greyer sky fill;
   exposure 0.9 and saturation 1.12.
6. Depth-adaptive Kuwahara.
7. Crown-sphere normals and underside AO for trees.
8. People: `src/assets/people.ts`.

**Round 2 — 7/10, NOT PASSED.** Must-fixes, all applied:
1. Ground albedo at real reflectance.
2. Crowns shaded by their sphere field, not their own lobes; ellipsoid `blob` normals.
3. Street trees: broadleaf in built cells, and no model whose crown starts above 56% of its
   height.
4. Lawn texture (denser, tinted toward the wash, a mown stipple).
5. Sand ripples, wrack line and footprints from the shore distance field.
6. The capture waits for streaming (the aerial had lost its town).

Should-fixes also applied:
- the roof gamut;
- skin palette at 0.72;
- idle sway;
- interior daylight falloff;
- **lot dressing**: generated drives with parked cars, plus picket fences, for NA houses.

**Round 3 — 7.5/10, NOT PASSED.** The hero region now reads as a real place (the Monmouth Beach
street, house fronts, the aerial, the streamed night). Must-fixes, all applied:
1. Car close-ups: recessed rims, round treads, wheel arches, a softer bevel, inset glass.
2. Roofs: gamut 75–260° → warm grey, plus a daytime desaturation in the roof shader.
3. Lamp pools: `max(albedo, 0.3)`.
4. Pine and round tree silhouettes.
5. **The Almanac v1**, the hour-to-hour home: cards per family, first-seen town and date, town
   stamps, a new atlas tab.

**Round 4 — 8/10, NOT PASSED** ("close, finite"). Roofs fixed, the arrival frame clear, people
read. Still blocking, all applied in the same session:
- Streamed lamp pools were clamped by *absolute* height. They are now relative to the local
  ground (`uLampBaseY`).
- Pine is three overlapping tiers of tufts, with a top lobe that swallows the upper tier.
- The squirrel's tail is one continuous curled plume; the deer has a forward neck and
  thigh-plus-cannon legs.
- Card art goes through a watercolour plate: Kuwahara, rim pooling, a ragged wet edge, a pencil
  ground line.

The reviewer judged the Almanac right as the spine, with three changes needed to scale:
1. Collect by *painting*, not proximity.
2. Add place cards from real data so it never runs out.
3. Detect by what's in view.

v1.1 (applied): spotting makes a **pencil** card, and a painting with the subject in frame
colours it in. **Place cards** come from named POIs and buildings; your painting becomes the
card. One stamp per town.

**User direction folded in:**
- "Paint as you explore" keeps the bloom only near you; `sketchAmt` fades out by 160 m, so the
  horizon is always finished watercolour. The atlas keeps pencil for unvisited places.
- Traffic and walkers persist across road-graph rebuilds (`LifeSim.adopt`), and parked player
  vehicles and taken driveway cars persist across sessions.

**Round 5 — 8.5/10, PASS (hero region cleared for scale-out).** Every round-4 item is visible
in the same poses:
- streamed night lamps (the clamp was absolute height against DEM ground, a bug class that
  would have hit every inland town);
- the pine is one mass;
- painted plates and pencil cards;
- paint-to-complete plus place cards (one painting coloured 4 place cards and a car);
- a finished far world with pencil kept in the atlas;
- life persistence (522 of 524 agents kept).

Owed evidence: the post-fix squirrel and deer cards. Delivered in `shots/almanac-cards3.jpg`:
the tail is attached and curls over the back, the deer has its forward neck.

**Carried forward as the opening checks of the next round (P0 on the backlog):**
1. Night amber-mud. Pools narrowed to 13 m with a `pow(1.6)` falloff and a stricter night-glaze
   exemption (applied); the rhythm still needs verifying in frames 3 and 13.
2. Frames 2, 5 and 6 unchanged since round 1:
   - Ocean Ave downtown needs wares, café tables and parked cars;
   - interiors need sun pools and foundry furniture.
   The user asked for restaurant, house and office interiors. **The region passes on streets,
   beach, night and loop, not on interiors.**
3. Tree silhouettes at 5–10 m: vertex-noise displacement on the outer lobes.
4. Frame 14 harness pick is flaky: pin a walker within 6 m facing the camera.

**Scale-out order (amended at PASS):**
1. Boot GPU benchmark and quality tiers.
2. A streamed-parity harness on 3 random US towns per round.
3. Almanac regional sets plus place cards from streamed POIs.
4. Local Plates, plus the restaurant, café and home interior pass.
5. Hero region 02, desert Southwest.

---

### 2026-09-27 — Round 6: downtown, interiors, ecosystem (expanded scope) — 8/10, NOT PASSED on the expanded scope
The same reviewer read montages r14 a–e: the 16 old poses plus **d** (terrace, café interior,
house in morning sun, a walker side-on) and **e** (fox, hawk, knocked-down walker, lamp).

**Landed:**
- Frame 17, the café terrace, is the best downtown frame yet.
- The walker's proportions (20).
- The fox reads (21).
- The lamp head, arm and lens (24).
- Night rhythm in 13.
- Frame 14's pick.

**Must-fixes, applied the same session (r15–r17):**
1. **A grey beam across the arrival frame.** It was a vehicle or parked car right at the lens.
   - The harness now runs the occluder assert asked for in round 3: no mesh may fill more than
     25% of a pose within 4 m. It steps back up to 3× and labels any frame it can't clear.
   - Curbside parking now finds the nearest *carriageway*, not the footway.
2. **The café reads as a ballroom.** Now zoned:
   - the counter, pastry case, espresso machine, menu board and a back bar of cups sit on the wall
     facing the entrance;
   - tables are on a ~2.2 m pitch (floor area / 4.8), with 2 or 4 chairs;
   - a pendant hangs over every table, emissive with 3 of them lit as lights;
   - wall art scales with the wall length;
   - generic clutter is barred from businesses.
3. **The knockdown reads as a fatality.** It is now slapstick:
   - laid back with one log-roll while sliding;
   - sprawled face-up with the knees drawn up and one arm flung out for ~1.5 s;
   - sitting up for ~1 s;
   - walking back to the path (no teleport), with a soft thud and an "oof".
   - Never motionless face-down. Tested.
4. **The hawk is a toy.** It now has a slim body (0.58 × 1.5), broad wings with a 1.26 m span,
   4 fingered primaries, a rufous tail, a cream belly with a dark band, and an 8° soaring
   dihedral. It soars 55–75 m up.
5. **Ocean Ave empty in the morning.**
   - Curbside parking now finds the carriageway (the footway was nearer, so every shop failed the
     wide-road gate).
   - Pedestrian demand has a coffee-run morning (0.5) and a lunch hour (0.35), so downtown is
     never empty 8 am – 8 pm.
   - Frame 2 now shows parked cars and walkers.

**Should-fixes applied:**
- The ceiling "plank" was a fan built from two crossed boards; it is now a foundry ceiling fan
  with a downrod, motor, glass globe and five pitched blades.
- Sun pools are 2× brighter, with crisp window edges and the muntin cross printed in the light.
- The shop-window displays were raised 0.3 m to clear the sill and spot-lit.
- The fox's brush droops ~20° and sways more with the trot.

**User direction folded in:** "the red and white sidings on like all restaurants, convenience
stores … need to change". Every storefront shared one striped band. Now each building gets its
own:
- 58% a sign fascia (a dark trade colour, or the wall's own shade, between mouldings);
- the rest a solid fabric awning over the windows only, in a trade colour;
- striped awnings only 5% of the time.

Real facade colours already come from `building:colour`, Overture or material tags where
mapped; awnings aren't in the data.

**Carried to round 7:** tree crowns at 5–10 m (frame 15, outer-lobe silhouette; now three rounds
old, so round 7 treats it as a must-fix). A blank first capture of montage **a** after a fresh
load: a harness warm-up is in and needs confirming.

## Place parity (does it feel like home?) — 2026-09-27

A new track beside the AAA rounds: `tools/place-shots.js` montages judged against real
reference photos (`docs/earth/PLACE_REFERENCES.md`). Score = "would a local recognise it?".

- **NYC round 1 — 5/10.** Recognisable only from the air and looking up. Gaps: no street life,
  no continuous storefront band, suburban sidewalk grammar (grass verges), pastel walk-ups with
  coloured doors and cyan glass, no canyon light; bugs: a black slab in frame 5 (a pole shadow
  at the lens), the horizon pose inside walls, golden hour rendered as night.
- **NYC round 2 — 6/10.** Landed: the skyline ring, signal masts, storefront band, lit shops at
  night, paved sidewalks, restaurant booths on one wall. Open: street life still thin at the
  pose; low-sun canyon glow (shadow map ±170 m); pale strips inside the carriageway (lane
  model); tree pits / bins / lamps on side streets; cornices + shop band on every avenue bay.
- **Tucson round 1 — 5/10.** Right: low flat parapet stucco and brick, terraces with names,
  gravel verges, tile roofs and spires from the air. Open: savanna-umbrella mesquite and coconut
  palms (want Washingtonia fan palms), the Catalinas too faint and low (z10 DEM, thinner desert
  haze), no overhead wires (they must survive the brush), fresh grey asphalt, no zero-setback
  barrio facades, empty streets, a bar that reads as a ballroom.
- **Tucson round 3 — 6/10** (E 7th St — the harness drifted off 4th Ave; poses are pinned by
  name since). Right: kerb parking makes the streets inhabited; the golden-hour frame (brick
  rows with porches, acorn lamps, wooden poles, cars on both kerbs) reads like Armory Park; fan
  palms read as palms. Worse: a 6 m shop apron plus paved blocks turned front lots into a white
  concrete plain (→ 3.5 m apron, mapped lots striped and parked); the nearest lite car read as a
  black toy box (→ a per-car level of detail). Open: wires between poles, parking lots, tree
  species by ecoregion, horizon ridges, worn asphalt + zero-setback barrio fronts.
- **Tucson round 4 — 6.5/10** (4th Ave, pinned). Improved: wires finally read (a blocked pole
  used to end the wire run), dense believable kerb parking, surface lots with stalls and cars
  (the aerial reads as a real US city), the apron plain gone, mesquite/palo verde tints, lamp
  heads at night. Flagged: the carriageway looks pale at eye level (it was the mid-sidewalk
  framing — the sidewalk runs down the middle of the frame; the road is grey from above);
  close cars still lite-kit boxes (the 30 m full-kit tier landed after this capture). Open:
  road surface wear everywhere (cracks + patches queued), interiors as ballrooms (third flag —
  partitions + scaled bar furniture landed), horizon mountains unchanged for three rounds
  (clarity + blue-violet aerial perspective landed; ridge detail still open).

### 2026-09-28 — Round 7: Seattle hills, Pike Place, tunnels, coasts, courts (s)

**Verdict: NOT PASSED — 6/10 on streamed Seattle.** *"The streets climb now — but Elliott Bay is a
lawn and Pike Place is still off camera."* The engineering is right, and qa-rib is model evidence.
But Robby's complaints are proven only from 70 m up (hills), only on a slope that doesn't exist
(cars), or not at all (Pike Place).

**Landed:** Queen Anne's streets are continuous asphalt (qa-after 1 vs qa-rib 1); qa-after 2 is the
best Seattle aerial yet; cars pitch on four wheels (pike2 5; in sea-before 2 they were buried to the
axle); the market cell has ground and Western Ave is a street (pike2 6; pike 6 was a groundless
void); no tower vanishes flying into Manhattan (fly-nyc1); willows read as willows.

**Reads fake / broken:** Elliott Bay is a park — the market's postcard view is 500 m of lawn (bay
1, pike2 3–4), from above a green diamond with trees standing on water (bay 2). The car pitch in
pike2 5 is correct on a 50% "ski slope" Seattle doesn't have (streets top out near 20%). Trees on
structures: one on a skyscraper roof (pike2 4), a tower-tall green column (bay 2), three ~60 m
cypresses crowning Queen Anne (qa-after 2 — likely its broadcast masts). No eye-level Pike Place;
from above it reads as a car park with nobody walking (pike2 2). Small artefacts: a dog-sized
squirrel climbing a metre off its trunk (street-q3 5), 1 m stair-steps through the sidewalk paint
(pike2 6). Harness failures beyond the known roof/house misses: an empty 60 m hall (sea-before 5),
cars at the lens (qa-close 1, pike 3), poplar and magnolia shot inside a willow, a blocked horizon
(place 8); tunnels, canopies and courts unphotographed.

**Must-fix (ranked):**
1. **Water can't become lawn** (bay 1–2). A 504'd cell falls back to synth, which trusts a DEM
   reading +3..+15 m over water; trees use yet another mask. Land/water from map data, never the
   DEM; split and retry 504s, never cache the stand-in. *Test:* force a 504 on the bay cell —
   bay 1–2 ≥95% water, nothing standing on it.
2. **Road grade conditioning** (pike2 5) — the real cause of "cars through roads": a 7–10 m DEM
   smears bluffs and walls and the roads drape over it. Smoothed per-way profile clamped by road
   class unless `incline` is tagged; ways meeting at a junction agree on its height; cut/fill the
   corridor, walls where Δh > 0.6 m. *Test:* max grade per drivable way printed, none untagged over
   25%; a car at eye level cresting and dipping on Queen Anne Ave N, tyres touching; zero
   intersecting car OBBs; no ribbon drawn over far tyres.
3. **No trees on structures** (pike2 4, bay 2, qa-after 2): tree base on bare earth; reject
   candidates inside footprints or within 15 m of `man_made=mast/tower`; clamp height by species;
   draw the masts. *Test:* no tree more than 3 m above the ground or over 45 m tall; qa-after 2
   shows masts.
4. **Pike Place at eye level, reading as a market** (pike2 2): from tags, not names — shops under
   `building=roof` arcades or `amenity=marketplace` → stalls, awnings, crates, vendors, crowds;
   `surface=brick/sett` → paint; kerb parking only where `parking:*`/access allow. *Test:* pinned
   frames under the arcade (≥15 people), along Pike Place (≤4 parked cars per 60 m, walkers in the
   carriageway), and of the bay view.
5. **Evidence for every claim:** run the round-6 occluder assert in every spot harness, plus
   inside/on-roof asserts; every pose names a subject filling ≥5% of the frame. *Test:* pinned
   frames of a car mid-dive at the SR 99 portal (vanishing without a portal face or trench reads as
   sinking through asphalt), a fuel canopy, basketball, tennis and a diamond, Queen Anne uphill and
   downhill at eye level — zero harness failures.
6. **Tree crowns at 5–10 m** (four rounds old): faceted flat lobes, the cherry's tabletop
   underside, top tufts floating off the fastigiate columns (trees-p3). *Test:* frames at 5, 8,
   10 m with no straight silhouette edge longer than 15% of the crown width, no sky gaps.

**Should-fix:** the sea reads as grey concrete (bay 2) — Puget Sound green-steel, ripples, wakes,
foam at the seawall; ~80% parking occupancy with mapped clearances (hydrants, crossings,
driveways, bus stops); pin a `tourism=viewpoint` pose where Rainier (95 km) must read; ballroom
interiors, fourth flag (big floorplates need a lobby and retail bays); the oak is a median
lollipop, the maple the round tree recoloured, no late-September colour; stair-step paint edges
(pike2 6) and dark car shapes floating over downtown (pike2 4).

**Gameplay / UX ideas:** hill driving with weight (rollback on hill starts, engine load, curbed
wheels when parked, air off crests); every `highway=steps` a walkable flight with a step count and
an Almanac stamp (the waterfront-to-market climb first); `tourism=viewpoint` at golden hour eases
the camera onto the skyline and Rainier and offers "paint this"; walk-on ferries across the Sound
on their GTFS timetable; market stalls that sell things you carry and give away; pickup games on
mapped courts by the hour that you can join for a shot.

**On the data catalogue:** thin on ground, which is where this round failed — add static land
polygons (the coast fallback), NOAA CUDEM topobathy, 3DEP 1 m bare earth in metros (rasterise
EPT class-2 ground along roads), and the tags `barrier=retaining_wall`, `embankment`, `cutting`,
`incline`, `natural=cliff`. Move the offline pipeline from #7 to #1 for metros — one 504 turned a
bay into a park; until then a PMTiles basemap on R2 (e.g. Protomaps) beats synth as the fallback.
Keep street furniture first but fold in steps, retaining walls and parking clearances; tint the
harness top-downs by provenance so "exactly where" can be audited.

### 2026-09-28 — Round 8: Seattle on the vector twin — bay and Needle land, market and hill don't (v)

**Verdict: NOT PASSED — 6.5/10 on streamed Seattle.** *"Elliott Bay is finally water and the Needle is on
the postcard — but walk to Pike Place and you get an empty lane with a wall in your face."* Every frame is a
vector twin (Overpass unreachable). The floor held; eye level didn't.

**Landed:** the bay is water on the fallback path (city 3, final 6, market 4); a real postcard — the Needle in
front of downtown with Rainier ~11° to its right at its true height (kerry-zoom 1); from the air a city
(continuous streets, full kerbs, autumn trees — qa 6; zebra ladders and a pier — final 3; blocks paved to the
building line — final 5); no ribbon over tyres on a cross-slope (qa 3); Pike Place's brick-and-pastel
frontage (final 1); Sea Bright holds.

**Reads fake / broken — engine:** Pike Place an empty asphalt lane (final 1–2 ≈ market 1–2: the stall fix
changed nothing on camera; nothing from 55 m either); final 9 a pile-up (the wagon pitched far steeper than the
SUV beside it); 3rd & Pike road and sidewalk one grey, the kerb a white line, no crosswalk, bus or crowd
(final 4); **no daylight saving** (`virtual.ts` `Etc/GMT+8`): "18:20 golden" put the sun at −5° instead of
+4.9° — every `?at=` region an hour late all summer; Rainier's ice darker than its sky; past ~3 km the city a
sand plain with ghost towers (kerry-zoom 2). **Harness / pose:** QA Ave N climbs only 5–11% on camera (the
Counterbalance is ~18%); the occluder assert is one centre ray (walls at ~1 m, a lamp mast, the viewer at
0.5 m, kerb cars at the lens all pass); the subject check ignores occlusion and the frustum (no Hillclimb,
portal, boat or moving car in their frames; "2 m behind the viewer" was ~15 m); pike 1–2 landed on Western
Ave; Steinbrueck all lawn; (v)'s "22 boats" = one faint wake and an empty sea.

**Round 7 must-fixes:** MF1 **closed** (twins). MF2 **partly** (grading, walls, portals built; a steep
eye-level crest, a clean final 9, a re-run of (t)'s 47 ways over 25% and `__CAROBB__` missing). MF3 **partly**
(no roof trees seen; masts unshot, `__TREES__` not zero). MF4 **open** (final 1–3). MF5 **partly** (asserts
blind). MF6 **open**, fifth round (final 4's tree at ~7 m is stacked flat slabs).

**Must-fix (ranked):**
1. **Pike Place a market from what the twin keeps** — the marketplace POI plus POI density lines the
   street's frontage with stalls both sides; crowds; a market-paving prior; cars at walking pace; the
   Hillclimb a visible flight. *Test:* lens mid-street at the Corner Market NW and SE: ≥ 8 stalls, ≥ 15
   people; the Hillclimb's foot showing ≥ 10 m of rise.
2. **The steep hill at eye level, roads that read as roads, cars clean on them.** *Test:* a road-crown pose
   on the Counterbalance (QA Ave N, W Roy–W Galer) looking south: the kerb 50 m ahead ≥ 8° below eye level,
   the Needle past the crest; a kerb face and a lighter sidewalk; a frozen, unoccluded moving car on four
   tyres; `__GRADES__` (untagged > 25%) and `__CAROBB__` both 0 on the twins.
3. **Asserts that see** — an id-buffer pass: the subject's visible pixels ≥ 5%; nothing within 2.5 m over 5%
   of the frame, nothing within 4 m over 15%; freeze the sim; street poses on the building line or the road
   crown; fails stamped on the sheet. *Test:* every frame named here re-shot, zero fails.
4. **The far city** — ground coloured by OMT landuse; z13 buildings or landuse blocks at a height prior;
   towers opaque. *Test:* kerry-zoom 2 re-shot, ≥ 70% urban ground past 3 km, no sand hue.
5. **The clock and the postcard** — the IANA zone from a lat/lon lookup; Rainier's ice lit above its sky,
   alpenglow at sunset. *Test:* sun +4.9° ± 0.5° at Kerry Park 18:20 on 28 Sep, frame lit gold; summit ≥ sky
   +10% at 15:30.
6. **Crowns at 5–10 m.** *Test:* final 4's tree and a PNW conifer at 5, 8 and 10 m, no straight silhouette
   edge over 15% of the crown width, no stacked-disc columns.

**Should-fix:** Manhattan's cedar water tanks on Seattle roofs (final 3, 8 — `towerTop`: only where mapped);
the playground kit (posts overshoot the deck, the slide misses it, it stands on beach sand at a seawall —
pike 5); downtown crowds by POI and stop density; Steinbrueck shot from the rail at −10°; a wake at eye
level with its boat in frame; tower tops from the twin's building parts; Sea Bright re-shot after the paving
change.

**Gameplay / UX ideas:** "The Mountain is out" — each viewpoint's DEM viewshed to named peaks; on a clear
day the HUD calls it, a Rainier painting a rare card (Hood from Portland by the same rule). Stairways
(`highway=steps`, hundreds in Seattle) as an Almanac set, and a Hillclimb time trial from the ferry dock to
the fish stalls. Curb your wheels (Washington law): park steep without turning them and the car creeps into
the junction (the creep is built) — a ticket or a chase. Stall trades from the POIs inside: the fishmonger
throws you one to catch; the florist's bouquet is yours to give. NOAA tides move the waterline, pilings and
foam ~3.5 m on schedule. GTFS queues at 3rd & Pike; ride the trolleybus up the Counterbalance.

**On the twin:** the right floor; what it loses is exactly the eye-level grammar. Infer from POI density and
class, never names — then own the tiles: a Planetiler profile of the state extract that keeps the tags the
game reads, served from R2.

**Same-session follow-up (v):** MF5-clock fixed — the open world takes its US zone with summer time
(`tz.ts`, 26 cities tested; Kerry Park is America/Los_Angeles). MF1-market: shared streets within 60 m of a
market hall get stalls down both sides and park no cars (`props.ts`). MF6: spruce whorls overlap to a leader;
the rim dissolve bites lobe sides only. Rainier: glaciers and rock from OpenFreeMap landcover, max-filtered
ring. Open: the Counterbalance frame and grade audit on the twins, the id-buffer asserts, the far city, the
round tree's slabs at 7 m, the water tanks, the playground kit.


**Round 8b (same session) — verdict update: 7/10 on streamed Seattle, NOT PASSED.** *"Pike Place opened
and the cars stopped crashing — now they barely move."*
- **Closed / moved:** MF1 **mostly closed** — market2 1–2 meet the count (stalls, crowd) on car-free
  brick; the Hillclimb still unshot. MF2 **moved** — the kerb 50 m ahead 11.5° below eye passes,
  counter2 1 reads as a real brow; the crosswalk-stub fix is proven (overlapping pairs 35 → 1,
  pair-ticks 5,677 → 4–16); still open: `__GRADES__` 60, `__CAROBB__` 1, no frame pins a moving car on
  the grade. MF3 **open** — a shopper's back at arm's length fills ~10% of market2 2; the Needle frame
  (counter2 2) has a street tree where the Needle should be; "queued, not fused" (counter2 5) shows no
  queue; counter 4's wall 1.4 m from the lens passed (only counter 6 flagged). MF5 **half** — the clock
  is fixed, the postcard lost: Kerry Park 18:20 is a lawn and a horizon within ~5% of the sky's
  brightness — no city, no Needle, no Rainier, no shadows (at +4.9° they'd run 12× an object's height);
  the gold is a grade, not a low sun. MF4 **open** (not shot). MF6 **open**, sixth round — the spruce
  reads now, broadleaf crowns still faceted (counter2 1, 4).
- **Still reads fake:** stalls against a long windowless brick wall (market2 1, left) instead of a hall
  open to the street; from 45 m the awnings are one rainbow of identical shapes at a fixed pitch beside
  a Manhattan water tank (market2 3); the Counterbalance's west sidewalk a blank grey plane filling a
  quarter of counter 4.
- **Next must-fix (ranked):**
  1. **Traffic that flows** — 61% of cars stopped at a 1.9 m/s mean is gridlock; most Seattle
     side-street corners are uncontrolled or traffic circles, arterials have priority. Control from the
     tags, not all-way stops everywhere; merge junctions within 12 m; never spawn a car in view.
     *Test:* Queen Anne 150 s: 0 overlapping pair-ticks, ≤ 25% of cars stopped, arterial speed between
     junctions ≥ 8 m/s; a car driving up QA Ave N stops only at mapped controls, pinned mid-slope on
     four tyres.
  2. **Open the hall** — the claimed building opens to the street as an arcade with stalls inside and
     its name on a sign; shopfronts opposite; stall goods from the POIs. *Test:* lens mid-street: the
     hall's inside visible, ≥ 3 kinds of goods, no blank frontage over 15 m, Post Alley brick, the
     Hillclimb showing ≥ 10 m of rise.
  3. **Cuts as places** — any cut over 1 m a capped rockery or concrete wall with a hedge on top and a
     stair to each lot; bridges keep their deck heights. *Test:* counter 4 and 6 re-shot;
     `__GRADES__` 0.
  4. **Asserts that see** — id-buffer subjects; viewpoint poses at the rail. *Test:* Kerry Park 18:20
     with the Needle ≥ 5% of pixels, the skyline ≥ 15% darker than the sky behind it, shadows on the
     lawn; counter2 2 and 5 re-shot, fails stamped on the sheet.
- **Gameplay idea — the Queen Anne road test:** the sim now decides whose turn it is at every junction,
  so it can grade the player by the same rules — full stops, turn order, not blocking the box, wheels
  curbed when parked. A hill start on the Counterbalance with a car queued behind: roll back and you tap
  it. Pass for a licence stamp; roll a stop in front of a patrol car and it pulls you over.

## Round 9 — 2026-09-28 — "Wired, not yet magic" — 7/10 on streamed Seattle, NOT PASSED; the boat minute 6/10 as a slice, NOT PASSED (GAME_DESIGN §14)

*"The sketch looks real, the wash looks like a wipe, and your boat looks like everyone else's."*

- **Closed / moved:**
  - **MF1 traffic: open.** The numbers are honest now: the probe ticks the clock, 0 pair-ticks at 150 s, and moving-vs-parked overlaps fell from 68 to 4 per 20 s. But 63% of cars are stopped (the bar is ≤ 25%) at a 2.0 m/s mean, and three-quarters of those are queued behind other cars. That points to density or discharge, not the signs. No moving car is pinned.
  - **MF2 hall: open.** Untouched.
  - **MF3 cuts: moved.** Walls are built, but r9-walls 1 reads as a warehouse side, 2's hedge as faceted boulders, and 3's rockery is ~1% of the frame. No stairs; `__GRADES__` unreported.
  - **MF4 asserts: moved.** The proximity stamps are honest. The subject check is blind: 3 passes with its subject at ~1%, and 6 with no steps. It stamps instead of re-posing, so 4 of 6 frames fail.
- **The boat minute:** it works end to end, touch included, and starting the wash where you touch is right. Before showing anyone:
  - **The sketch reads as a real boat.** It's opaque hatched grey: at ~30 m, a dinghy under a tarp. Make it translucent paper with a boiling graphite line, and pale the world around it.
  - **The ghost goes missing.** On desktop it's behind a tree slab at the lens; on the phone it's a cut-off slab while the line says "tap the sketch". Never snap it out of view.
  - **The wash is a wipe.** Sketch to dry is ΔE ≈ 13, lightness only, on ~0.5% of the frame. Go wet first (saturated, bleeding, a brush sound on the rub), then dry at ~2 s: it lightens and settles, with a ripple ring and a push-in.
  - **The boat isn't yours.** Use a bold first colour; the default white and green is the moored skiff's livery.
  - **No payoff.** Nobody is at the helm, the wake is a detached stripe, and the boat doesn't plane at 12 m/s. Rumson is neither reached nor signposted.
  - **Five cards at once is wrong for minute one.** It's a list, not a gift, and scarcity dies at the first marina. Teach one card first; then only what's composed (≥ 4% visible each, at most 3).
  - **Prompts and chips.** The desktop status line is a third prompt with five verbs, while boarding and Rumson get none. The pale chips offer a pickup over water. On the phone the ribbon covers the move stick and hides the swatches. The 90 s cold run is unmeasured.
- **Still reads fake (Seattle):**
  - One walker in six frames.
  - 1's wall is a blank 5 m plane that only its rail explains.
  - The crowns are still wrong in 4 (seventh round).
  - The Manhattan water tank is back in 6.
- **Next must-fix (ranked):**
  1. **Sketch, wash and ownership readable on a phone.** *Test:* at 375×812, with the boat ≥ 2% of the frame's pixels, sketch→dry ΔE ≥ 25; the ghost ≥ 70% visible in every brush frame.
  2. **The minute on its own bar.** Snap where you can step aboard; walk in to board; light Rumson's landing; put the avatar at the tiller; teach one card first. *Test:* three cold players on a real phone and a desktop, spawn to Rumson dock in < 90 s, ≤ 2 prompts counting the status line.
  3. **Traffic that flows.** Green discharge ≥ 0.4 vehicles/s per lane; density from road-class volumes. *Test:* round 8b's.
  4. **Asserts that see and re-pose.** *Test:* the six frames re-shot with zero stamps; a sky-facing pose must fail; the boat frames go through the id pass.
  5. **Cuts as places.** Board-form concrete, stains, moss and coping; clipped hedges; stairs to the lots. *Test:* r9-walls 1 and 3 re-shot with the wall ≥ 15% of the frame; `__GRADES__` 0.
- **Gameplay idea: paint the past back.** OpenHistoricalMap and OSM's `abandoned:` / `razed:` tags remember ferry landings, piers and streetcar lines. Near the brush they show as pencil already in place, so Span and Line need no aim; own the kind and you can paint them back. The Counterbalance streetcar, counterweighted until 1940, becomes a ride up the real grade.

## Round 10 — 2026-10-01 — "Real at thirty metres, bare at three" — 8/10 on Sea Bright (expanded scope), NOT PASSED

*"The bins are out on collection day and the bridge finally stands. Then you open a front door onto the same empty hall."*

This round is back on the gold standard after three Seattle rounds (6–7) and the boat minute (6). The look holds round 5's 8.5 and the expanded scope holds round 6's 8. Everything this round added works at 25–80 m, and it reads. Nothing at 0–5 m moved: the hall behind the front door (6, 19), the ground under your feet, the night foreground (3), and people and cars at arm's length. The merged-a, micro-detail, bridge-before/after and farsky-c frames are numbered in reading order.

- **Scores:**
  - **The look (Sea Bright): 8.5.** It holds. The arrival (1) still sells the place. With the pale wash gone, the river, Rumson and the far shore are finished paint to the horizon (12; merged 2, 9). The 0–10 m band is unchanged (2's ground, 3's night).
  - **Life and micro detail: 7.5.** Collection-day carts, porch chairs and flags make the streets look lived in, and the hand-over to impostor cards can't be seen.
    - The marina has one boat (9).
    - The summer beach is umbrellas with nobody under them.
    - The 37 new things are scenery: none is an Almanac card or a brush kind.
  - **Structures (bridges): 7.5.** It went from "collapsed" to a credible bascule at every distance. It isn't a drawbridge yet:
    - There are no gates, signals, lamps or leaf joint.
    - The tender houses read as garden sheds (a white box under a green pyramid roof).
    - The clearance comes from a width rule (`clearOver`, `CLEAR_MOVABLE` 3.5 m). It doesn't come from `seamark:bridge:clearance_height*` or the chart.
  - **Roofs and colour: 7.5.** It went from one grey on 97% of roofs to a believable spread of charcoal, pewter, driftwood and pale membrane (merged 8; 12). Painted metal and clay are still desaturated twice. The same pull also takes golden hour's warmth off the roofs (see the roof answer below).
  - **Interiors: 6.5.** Slice 4 gives each type a purpose at real proportions: the classroom, the library, the oak nave and the checkouts. But the house is still an empty peach hall (6, 19), and the galley, the hotel corridor and the guest room are bare (synthin-b).
  - **The game loop and feel: 7.** Paint-to-own speaks on the HUD; the phone shows "van sketched in pencil — paint one to finish the card (2 of 8 cars)". The flight's half-second locks are gone by mechanism.
    - With the wash removed, a default player never sees the world bloom, which is the documented loop's second beat. Either:
      - start a first visit in pencil until the first Paint, so the player causes one bloom and never sees a pale distance; or
      - rewrite the loop as walk → notice → frame → paint → own.
    - Nothing new this round is a verb.
  - **Phone presentation: 7.** Every button is named, the stick sits under the thumb, the ODbL credit holds on one line, and the frame is sharp at DPR 3. But:
    - portrait is a 31° slot, where a PC sees 94°;
    - the toast sits on the centre third;
    - "3:00 pm" is grey on a grey wall;
    - the lower 45% is the flattest ground of any frame.
  - **Overall: 8/10, NOT PASSED.**
- **Closed / moved:**
  - **"The bridge looks collapsed" (Robby; R.14): closed.** Before: a V in the river and walkers standing on the water (bridge-before 3, 5). Now: a level deck on piers, the leaf between tender houses and a sidewalk behind a parapet (bridge-after 2–5; merged 1–3).
  - **The pale distance Robby read as fog: closed by removal** (12; merged 2, 9). Its cost to the loop is under that score.
  - **Roofs (round 1's sage, then one grey): moved** (shore-roofs-montage; merged 8).
  - **Round 5's carry "interiors need sun pools and furniture": still open for the house.** The frame hasn't changed since round 1. Frames 6 and 19 are the same picture, with a mean difference of 5.8/255. The café (18) holds round 6's zoning.
  - **Round 5's carry "night amber-mud": open** (3).
  - **Round 6's blank first capture: closed.**
  - **The flying hitch: closed on mechanism** (merged 9: no seam after a flight). The 4.6 s worst headless frame that remains is a tile mount. That's the next hitch to chase on a phone.
  - **R.30 far cities: moved, unproven** (see "Still reads fake" 8).
  - **Tree crowns at 5–10 m: unshot, eighth round.** Sheet c was skipped, so frame 15 must come back next round. In 11, the crowns at 20–60 m are still smooth balls.
  - **Round 9's five must-fixes:** answered with numbers in (x), (y) and (ab), but none is re-shot here. Measured, not seen.
- **Reads real:**
  - **The bridge.** From 60 m it matches the aerial photo (merged 2). On the deck, you walk a real bascule: parapet and rail, cars queued, a tender house at the leaf (merged 3).
  - **Collection day.** Blue and black carts stand at alternate doors down both kerbs of Center Street (merged 7; also 10, 17, 20). It's the best small-thing read in the game, because it tells you what day it is.
  - **Porches people use.** A red Adirondack pair (10); a flag on its bracket and mailboxes on posts (merged 5).
  - **An errand.** A couple walks their dog along the shops (merged 4). On the phone, there's a crowd at the café umbrellas down the block.
  - **Roofs from 80 m** read as many owners, not one grey sheet (merged 8).
  - **The hand-over.** At 50 m, the 3D, card-only and as-played frames match. The 3D takes over at 25 m, before the cards break (micro-compare). All of it costs +2 draws.
  - **Rooms with a purpose:**
    - the classroom: desks in rows, the teacher's desk, curtained windows (synthin-b);
    - the library's coloured stacks (synthin-b);
    - the oak nave with its red runner (synthin-c);
    - six checkouts and the cold cases on the back wall (synthin-a).
- **Still reads fake** (most damaging first):
  1. **Every front door opens on nothing (6 = 19).**
     - It's a bare peach hall: the coat rail reads as two cabinet doors, and there's no stair, no lit lamp and no skirting.
     - "Morning sun" lands in a hall with no window.
     - Walking into any house is the promise, and this frame is what it delivers.
  2. **The ground is blank paper at eye level (2, 10, 17, merged 4, 6, 7, phone).**
     - The bottom 40% of every eye-level frame has a median local L\* std of 1.0–1.5, which is the paper grain alone. The lawn in 7 measures 2.4 and the beach (merged 6) 0.83.
     - There are no sidewalk flags, kerb faces, gutters, drive aprons, stains or sand drift. Yard, walk and road are one sheet.
     - 10's birdbath stands on concrete, and the phone frame has a curbside mailbox on a shop sidewalk.
  3. **The night street (3).**
     - The overhead wires glow at L\* 14–20 against a sky at L\* 4, and read as searchlights.
     - The lower 40% is a dim amber-brown wash (L\* 26, hue 46°, chroma 15) across three-quarters of the width. That's the amber-mud again.
     - A tan slab fills the lower right at the lens.
  4. **The marina is a pond (9).**
     - One skiff at one float, in the frame meant to show moored boats.
     - A mapped `leisure=marina` gets a grey ground paint and no slips. Boats only line mapped `pier` lines (`structures.ts` → `props.ts`).
     - The white block's right-hand windows are dithered smears. That's the painted-to-real window cross-fade under the brush, and the windows read as burnt out.
     - From the air, the beach lot holds well over a hundred cars on an October evening (12). Lot occupancy depends only on built density (`OCCUPANCY` 0.82) and ignores the season the beach table keeps.
  5. **Arm's length (phone, merged 5, 17, micro-detail 1).**
     - People are faceted mannequins with block hands, stair-stepped at the phone's paint scale.
     - Cars are boxes with a flat glass band.
     - The watercolour sells everything past 10 m and nothing at 3.
  6. **A beach of empty umbrellas (micro-compare, summer).**
     - Two dozen umbrellas with chairs, towels and coolers, and nobody sits or lies under one. The beach walkers only wander the surf line.
     - It's eerie in the one season when the beach is the postcard.
  7. **The bare rooms.**
     - The galley is a range under a hood and mostly empty floor: no prep island, no pass, no shelving, no dish pit.
     - The hotel corridor is a peach tube with no door numbers or art, and the bed reads as a slab (synthin-b).
     - The supermarket's goods are colour slabs (synthin-a).
     - The café at 13:00 has one customer at bare tables (18).
  8. **The far skyline can't be seen (farsky-c 1–6).**
     - From a beach-level eye, the berm hides it. From the balloon at 300 m, it's at most 4 px tall and faint. Unproven, not wrong.
     - To close it: from the balloon facing north (Midtown bears about 359°, 44 km), at the 18° zoom on a clear noon, the cluster stands ≥ 20 px tall and ≥ 6 L\* off the sky.
     - Then give it its night. What a Jersey beach really sees is the city's glow on the northern horizon, and windowless prisms can't show that.
- **Next must-fix** (ranked by what an hour buys; the front door is the most damaging but also the most work):
  1. **A phone is a window, not a slot.**
     - The vertical FOV is a fixed 62° at every aspect. That gives 31° across in portrait at 390×844, 105° across on a phone held sideways, and 94° on a 16:9 PC.
     - Set it by aspect:
       - portrait: 78° vertical (41° across);
       - sideways: capped at 95° across;
       - 4:3 to 16:9: unchanged.
     - Scale photo zoom with it.
     - Move phone toasts to the top band under the place name, or just above the stick, at most two lines: "Van, in pencil — paint one to finish it · 2 of 8 cars".
     - Give the clock and the place name a paper wash behind them.
     - *Test:*
       - a probe reads ≥ 40° across at 390×844 and ≤ 95° at 844×390;
       - `hud-audit` adds a rule "nothing in x 15–85%, y 30–62%" while walking or riding, toasts included, on all its phones in both orientations;
       - in the re-shot phone frame, the clock is ≥ 4.5:1 against the pixels under it.
  2. **Night that reads as night (3).**
     - `wireMaterial` (`props.ts` ~l.179) paints wires a fixed `vec3(0.05, 0.06, 0.1)` at night, more than ten times the night zenith's luminance (0x060a1c). So every wire draws lighter than the sky. Tie the colour to the sky (e.g. `uSkyZenith * 0.6` at night) so a wire is always darker than what's behind it.
     - Lamp pools: a bright, warm heart and a cool, dark gap, not a dim warm wash.
     - Port spot-shots' id-pass asserts into `review-shots.js`. The old ray test (25% within 4 m) let 3's slab through.
     - *Test:*
       - 3 re-shot: wire pixels (a wire-only mask) ≤ sky L\* + 2;
       - the bottom 40% outside lamp hearts at L\* ≤ 18 and hue 200–290° (or chroma ≤ 6);
       - ≥ 2 pools down the street, with heart-to-gap luminance ≥ 2.5×;
       - nothing within 2.5 m covering more than 5% of the frame.
  3. **Paint the ground you walk on.**
     - In the 300 m detail window (15 cm/px), paint:
       - sidewalk flags scored every 1.5 m, plus a centre joint on walks ≥ 3 m wide;
       - the kerb as a 15 cm face with a shadow line 25% darker, and a 0.6 m gutter pan;
       - drive aprons across the walk;
       - tar snakes and patches on the baked asphalt, as streamed streets already have;
       - sand drift on walks within ~60 m of a beach (from the shore field, not by place name);
       - front yards as lawn, gravel or crushed shell by neighbourhood, never the walk's concrete;
       - on the beach: the wrack line, footprints and wind ripples, strong enough to survive the brush.
     - Placement rules:
       - lawn pieces (birdbath, kayak, bike, hoop) only on lawn or gravel;
       - curbside mailboxes and hydrants within 1 m of a kerb face;
       - no lot mailbox within 10 m of a commercial door.
     - *Test:*
       - the bottom 40%'s median local L\* std (windows 1.5% of the frame width) ≥ 2.5 in 2, 10, 17, merged 4, merged 7 and the phone (today 1.0–1.5), and ≥ 2.0 on merged 6 (today 0.83);
       - the walk-to-road edge a step of ≥ 8 L\* along ≥ 70% of its on-screen length in merged 4 and 7;
       - `micro.test.ts` on the shore pack: 0 lawn pieces on paved cover, 0 misplaced mailboxes.
  4. **The front door opens on a home (6, 19).**
     - A house of ≤ 110 m² a storey (the shore's cottages) opens straight into its living room.
     - A larger house keeps its hall, with two conditions:
       - the stair's foot stands ≤ 5 m from the door and inside the view from it;
       - the living room opens off the hall through a cased opening ≥ 1.2 m wide, within 30° of the door's axis.
     - Give every wall 12 cm of skirting in trim white.
     - Coats hang as coats: at least 3, rounded, 0.9–1.1 m long.
     - The hall gets a bordered runner, a lit console lamp, a mirror, and its ceiling light on if it has no window.
     - Pose 19 picks the room with the most east-to-south glass and frames it.
     - *Test:*
       - 6 and 19 re-shot: the id pass counts ≥ 8 furnishing instances in 6, each ≥ 0.15% of the frame;
       - no bare plane over 30% of the frame;
       - sun-pool pixels (floor mask, ≥ 1.6× the floor median) ≥ 3% of 19;
       - 6 vs 19 mean ΔE76 ≥ 10;
       - `interiorLayout`: of 40 seeded cottages, ≥ 80% open into the living room or great room; of 40 houses over 150 m², ≥ 80% have the stair in the door's view.
  5. **The shore keeps one calendar.**
     - A mapped marina gets finger piers every 4.5 m off its waterline, with boats moored bow-in from `boatMix` at the month's occupancy (October ~0.55, July–August ~0.9).
     - About 40% of riverfront house lots with no mapped dock within 30 m get a dock and a boat.
     - In season:
       - each occupied umbrella cell gets 1–3 people seated or lying;
       - kids play at the waterline;
       - a lifeguard sits in each stand from 10:00 to 17:00.
     - Lots within 150 m of a beach fill by `BEACH_SEASON` × the hour.
     - *Test:*
       - 9 re-shot with ≥ 8 boats, each ≥ 0.1% of the frame;
       - a pack test: ≥ 8 boats per 100 m of mapped marina waterline;
       - micro-compare's 50 m pose at 13:00 in July: ≥ 25 people, and people ÷ umbrellas ≥ 1.2;
       - 12 re-shot on 1 October at 17:48 with the beach lot ≤ 25% full.
- **Roof hue: drop the pull to zero on the roof's own colour, and grey the sky fill instead.**
  - The 40% pull (`buildings.ts` ~l.2122) desaturates the whole lit colour. That removes three things:
    - the photo's hue: on top of `aerialRoof`'s caps (0.10 for greens, 0.11 for blues), a painted-metal roof ends at about 0.07 saturation, which is grey under the sky fill;
    - the shared cool shadow glaze;
    - golden hour's warmth, so roofs are duller than the walls beside them at sunset.
  - The teal comes only from `hemi` in `paintLight`, so neutralise only that:
    - Add an overload `paintLight(alb, N, wpos, sh, ao, skyNeutral)` that greys `hemi` before it multiplies the albedo: `hemi = mix(hemi, dot(hemi, vec3(0.2126, 0.7152, 0.0722)) * vec3(1.03, 1.0, 0.96), skyNeutral)`.
    - Roofs call it with 0.6 by day, scaled by `(1.0 - uNight)`, and the 0.4 line goes.
    - The albedo keeps its whole hue and the sun keeps its colour. A grey shingle's shaded slope keeps the shared cool glaze, like the walls.
    - Then raise `aerialRoof`'s green and blue caps to 0.14.
    - If you want a one-liner first, change 0.4 to 0.15.
  - *Test:* place five 6 × 6 m test roofs by the spawn (grey 0x6b6b6b, clay 0xa0553b, blue metal 0x5d7091, green metal 0x4f6a52, brown 0x6b5e52) and read them raw (`uRaw`) at 12:00 and 18:00.
    - The four coloured roofs keep their albedo hue ±12° and ≥ 80% of its chroma on the sunlit slope.
    - The grey reads C\*ab ≤ 4 sunlit at noon and ≤ 8 in shade: cool grey, not teal.
    - At 18:00, the sunlit grey roof's b\* is within 3 of the sunlit wall beside it.
- **Gameplay idea: the bridge opens.**
  - Sea Bright's bascule is a real one now, so run it on its real rule. Every US movable bridge has one in 33 CFR Part 117, and OSM marks which spans move. In summer 2025 the Rumson–Sea Bright bridge opened on the hour from 9 to 7, Friday to Sunday until Labor Day, and on signal otherwise.
  - On the hour, bells ring, the gates drop, traffic queues on both approaches, the leaves rise and the masts waiting in the channel file through. The town performs this whether or not you're there (Rockstar).
  - In your boat, you sound one prolonged and one short blast, the real request signal. The tender answers in kind and opens, or with five short blasts for "not now". You learn the signal by watching the first sailboat do it, never from a tooltip (Nintendo).
  - Paint the leaves raised with a mast between them at golden hour. That earns a rare card, and a commission that sends you down the coast to every movable bridge the map tags.

Sources: [Rumson–Sea Bright Bridge opening schedule](https://www.rumsonseabrightbridge.com/bridge-opening-schedule/) · [New bridge open to vehicles and pedestrians](https://www.rumsonseabrightbridge.com/new-bridge-open-to-vehicles-and-pedestrians/)

## Round 11 — 2026-10-01 — "Five for five, and three overshot" — 8.5/10 on Sea Bright (expanded scope), NOT PASSED

*"The front door opens on a home and the beach has people on it. Then the sidewalk looks dirty and every streetlamp is a stage light."*

All five of round 10's must-fixes are built. Two of them move their areas a full point: the front door (6, 19) and the shore's calendar (the summer beach). Three overshot: the ground's grain, the lamp pools and the beach's tint. They need tuning, not rebuilding. The overall moves from 8 to 8.5. It doesn't pass, because the overshoots sit in the standard frames (1, 2, 3, 11, 13, 16, 17) and the trees are in their ninth round. `merged-r11`, `nightcheck-r11` and the `phone-r11` frames hadn't rendered when this was written. The helper sheets are numbered in reading order.

- **Scores:**
  - **The look (Sea Bright): 8.5.** Held, not raised. The yards are now lawn and shell (5, 10) and the night has its indigo structure (3). But the 0–10 m band traded blank paper for grime (1, 2, 17), gravel-looking asphalt (11) and stage-light pools (3, 13).
  - **Life and micro detail: 8** (from 7.5). The summer beach keeps its day, the marina and the house docks have boats, the café has customers (18), and the beach lot follows the season (12). People at arm's length hold it back.
  - **Structures (bridges): 7.5.** Not touched this round.
  - **Roofs and colour: 7.5.** `paintLight(…, skyNeutral)` at 0.6 and the 0.14 caps are in, as specified. The five-roof test isn't reported, and nothing at frame 12's scale shows the change. Evidence owed.
  - **Interiors: 7.5** (from 6.5). The cottage opens on a lived-in room (6), and the morning lands on a dining-room floor in window-shaped pools (19). The kitchen is a sink run, and the table crowds its chairs.
  - **The game loop and feel: 7.** Unchanged in kind. Nothing new is a verb, and round 10's first-visit bloom question is still open. The beach's day is the best new reason to stop and watch.
  - **Phone presentation: 8** (from 7). Portrait is now a 41° window, the HUD is out of the middle and the clock is legible. But the messages end in "…", and there's no merged-build phone frame yet.
  - **Overall: 8.5/10, NOT PASSED.** Close and finite.
- **Closed / moved:**
  - **Round 10 MF1, the phone window: closed.** 41.0° across at 390×844, 95.0° on its side, the toast under the place name, the clock at 7.45:1 on its wash, and `hud-audit`'s middle band clear in all 560 layouts (phonefov-r2, hud). New: long messages end in "…" (must-fix 3).
  - **MF2, night: moved.**
    - Closed: the wires (L\* 2.1 against a sky of 2.5), the lens (0%), and frame 3's gaps (L\* 8–12, hue 255–273°).
    - Overshot: the pools (see "Still reads fake" 1).
    - My round 10 test gave the dark a ceiling but no floor. Frame 13's black gaps (L\* 2.7) pass it. The test below has both.
  - **MF3, the ground: moved.**
    - Closed: flags, the kerb face, the gutter, aprons, and yards by neighbourhood (5, 10). The placement rules pass: no lawn pieces on paving, and mailboxes stand 0.45 m behind the kerb.
    - The texture metric passes (std 2.6–4.5), but speckle carries it. That's my metric's blind spot: it measured how much texture there was, not what kind. The speck test below closes it.
  - **MF4, the front door: closed.** 6 and 19 are different rooms now (ΔE76 25.4, against a mean difference of 5.8/255 in round 10).
  - **MF5, the shore's calendar: closed.**
    - Summer: 219 people under 80 umbrellas at 13:00, a lifeguard in the stand and kids in the shallows. October: the beach lot is 13% full (12).
    - Frame 9's pose still lands on house docks with about five small boats. Re-aim it at the marina (calendar-autumn 1).
  - **Roof hue: in as specified, evidence owed.**
  - **Tree crowns at 5–10 m: open, ninth round** (15; must-fix 4).
  - **R.30 far skyline: unchanged, unproven.**
- **Reads real:**
  - **The Jersey Shore in July** (calendar-summer 4–5). Chairs and towels under umbrellas, a lifeguard up in the stand, the brick block behind, a gull overhead. It keeps the day: empty at 8:30, full at 13:00, packing up at 18:30 (2–3). This is the first frame in the game a local would post.
  - **A home behind the door.** 6 shows a cottage's kitchen-living room: a sofa, a table and chairs, a plant, the sink under a curtained window, a lit dome. In 19, the morning falls on a dining-room floor in pools that carry the window's muntins.
  - **Yards.** The raised house stands on its lawn (5), and the porch chairs look over grass, not concrete (10).
  - **The night's bones** (3). The wires are silhouettes, the gaps between lamps are indigo, and the lit windows are the accents.
  - **Water with boats.** Finger piers with a sailboat, a cruiser and skiffs (calendar-autumn 1), and a house's own dock with its centre-console (3).
  - **The phone** (phonefov-r2). 41° holds the shopfronts and the parked van in one view, and the toast sits under the place name.
- **Still reads fake** (most damaging first):
  1. **Every streetlamp is a stage light (3, 13).**
     - Frame 13 is one flat orange ellipse (L\* 68, C\* 55, hue 76°) on black ground (L\* 2.7), a 125:1 step. The pool's near edge drops from L\* 55 to 14 in about 18 px.
     - In 3 the camera stands in a heart, so 35% of the frame is an orange carpet (bottom 40% at L\* 54, C\* 34; the heart at C\* 48).
     - The cause is two things together:
       - `exp(−(d/5.2)³)`, cut to zero by 9 m, is a flat top with a cliff;
       - the night grade reserves the heart (brightest channel 0.3–0.56) at full chroma, and glazes and halves everything warm below it (`dim` 0.5). That turns the pool's own fall-off into a rim.
     - A watercolourist paints a lamp's pool as a warm, pale glow that dies away, and a town's gaps are lit by porches, windows and sky glow. They're never black.
  2. **The grain reads as grime (1, 2, 11, 17, 20, phone-gp-v2b).**
     - 10–13% of the bottom 40% sits ≥ 6 L\* below its local mean, in 0.7–1.1 dark blobs per 1,000 px. That's busier than the lawn in 7 (8%, 0.5). In round 10, frames 1, 2, 11 and 17 had 0.04–0.17 blobs per 1,000 px.
     - On 11's pale asphalt (L\* ≈ 65), the dark specks read as gravel.
     - On the beach (16) there are half a dozen peach discs: a\* 6–7 against the sand's 1–2, hue 72–78° against 86–88°, ΔE 6–14. The ripples read as wood grain (16) or cobbles (gp-v2-b, merged 6).
  3. **Trees at 8 m (15), ninth round.**
     - A closed green lump on a pole. The crown's top is one straight edge, 31% of its width, and 0% of the crown shows sky.
     - No limb enters the crown, and the trunk doesn't taper.
     - Every tree in 11 is still a ball.
  4. **Arm's length (20; calendar-summer 1; 6).**
     - The dog walker stands stiff with his arms hanging, as if the lead weren't there, on a black block where his shoes should be. The dog's tail drags on the ground like a fifth leg.
     - At the 12° lens the bathers are faceted mannequins.
     - In 6, a resident is cut off at the lens.
  5. **The reward is cut off (hud-montage).** The paint result, the game's payoff, ends "…you've painted an area…". The arrival card ends "· 7:42 pm · …".
  6. **The kitchen and the table (6, 19).**
     - The kitchen in view is a sink run, with no range, fridge or wall cabinets.
     - Three chairs crowd one side of the table, backs touching.
     - A WC is in view through the living room's left door.
  7. **Small reads.**
     - A red block fills the lower right of 1 at the lens, where round 10 had the hedge, and the id pass let it through.
     - White lozenges fan across the water at the house's dock (calendar-autumn 3). If that's a passing boat's wake, its foam is too thick and opaque at 10 m.
     - Grass grows in the deep shade under the raised house (5); that's usually where people park.
- **Next must-fix** (ranked by what an hour buys):
  1. **Pools as light, not stage discs (3, 13).**
     - The fall-off: change it to a lamp's own, `h³/(h² + d²)^1.5` at h = 8 m. That's half at 6 m, 17% at 12 m and 9% at 16 m. Widen the map's reach from 9 m to about 22 m so pools meet faintly between lamps.
     - The heart is a warm cream, with chroma ≤ 30 (today 48–55).
     - Widen the grade's reserve ramp (0.3–0.56 → 0.15–0.6) and stop `dim` biting the pool's own edge.
     - A floor of sky glow and window and porch spill keeps the gaps at L\* 10–20.
     - *Test* (`night-check`):
       - 13: the heart's C\* ≤ 30; the gap's ground at L\* 10–20 and hue 220–280°; along the road, the pool's light halves at ≥ 5 m from the heart and is still ≥ 8% of it at 12 m (no rim);
       - 3: the bottom 40% at C\* ≤ 22;
       - kept: ≥ 2 pools at ≥ 2.5× their gap, the wires, and the lens.
  2. **Texture from structure, not grime.**
     - Concrete: keep the flags, joints, kerb, gutter and broad low-contrast mottle. Cut the dark pebble and pock speckle by about two-thirds, and make specks as often lighter than the slab as darker.
     - Asphalt: darker than its walk, with light aggregate on a dark base. Tar snakes are lines, patches are rectangles, and there's no speckle field.
     - Beach: find the peach discs. Ripples get an 8–15 cm wavelength, ΔL\* ≤ 4, long crests broken by footprints, and fade out by 15 m.
     - *Test:*
       - the bottom-40% local L\* std stays ≥ 2.5 in 2, 10, 11, 17, merged 4 and 7, and the phone;
       - in those frames, the share ≥ 6 L\* below the local mean is ≤ 6%, in ≤ 0.35 blobs per 1,000 px;
       - in 11 the road reads ≥ 8 L\* darker than the walk or verge beside it;
       - on 16 and merged 6, no blotch ≥ (2% of the frame width)² has a\* ≥ the sand's + 3;
       - the ripple band's ΔL\* is ≤ 4.
  3. **No message cut off, and the phone shown on the merged build.**
     - Write every toast and the arrival card to fit two lines at 320–390 px. For example: "Painted out to 1.2 km · 0.35 km²" and "Monmouth County, NJ · 7:42 pm".
     - Re-shoot `phone-r11-portrait` and `phone-r11-landscape` on the merged build.
     - *Test:*
       - `hud-audit` renders the full copy set at 320, 375 and 390 px with no "…" and at most two lines;
       - the merged phone frame reads ≥ 40° across, the clock ≥ 4.5:1, and the ground passes test 2.
  4. **Trees at 5–10 m, ninth round: change the approach.**
     - Six rounds of noise on solid lobes haven't converged. Build the near LOD the backlog already names (1.11c):
       - the species' branch skeleton to second order;
       - 8–20 alpha-tested leaf-cluster cards per crown, shaded by round 2's sphere field so the outline breaks up and sky shows through;
       - a trunk that tapers and forks into the crown;
       - today's crowns from about 30 m out.
     - Budget: ≤ 2,500 vertices and no extra draws per near tree (instanced cards), and ≤ 40 near trees on a phone.
     - *Test:*
       - 15 re-shot at 5, 8 and 10 m: sky through 4–12% of the crown's pixels (today 0%);
       - the longest straight silhouette edge ≤ 15% of the crown's width (today 31%);
       - ≥ 3 limbs visible entering the crown;
       - the trunk's base ≥ 30% wider than where it meets the crown;
       - a foundry vertex-budget test.
  5. **People at arm's length.**
     - Feet are shoes, planted, never a block.
     - A dog walker's hand holds the lead, and the arm follows it. Standing idles shift weight.
     - Within 10 m, limbs are smooth-shaded with rounded hands.
     - A walking dog's tail stays off the ground.
     - *Test:*
       - 20 and calendar-summer 1 re-shot;
       - the lead's end within 5 cm of a hand;
       - no shoe wider than 14 cm or sunk below the ground;
       - a walking dog's tail tip ≥ 15 cm up;
       - a mesh test: no normal break over 25° along a limb.
- **Gameplay idea: series.**
  - The shore keeps time now, so make time something you collect. A viewpoint can ask for a series: the same frame, within 5 m and 8° of the first panel, at three hours or in three seasons. The candidates are a `tourism=viewpoint`, a lifeguard stand, a movable bridge's sidewalk, or a named storefront.
  - Examples:
    - the beach at 8:30, 13:00 and 18:30;
    - the bascule closed, rising and open on the hour (the bridge idea's first series);
    - Ocean Ave in October and under snow.
  - A finished series is one card that cross-fades between its panels in the sketchbook, and its rarity is the time it took.
  - It's Monet's haystacks as a collection: Animal Crossing's come-back-at-another-hour patience loop, built on a world that runs on its own clock the way Rockstar's do. It rewards exactly what this round made true.

## Round 12 — 2026-10-01 — "The trees grew limbs; the night went floodlit" — 8.5/10 on Sea Bright (expanded scope), NOT PASSED

*"Someone's making lunch in the cottage, and the street trees finally have limbs. Then the night street lights up like a car park, and Center Street turns to cobbles."*

Two of round 11's five must-fixes are closed by their tests and by eye: trees at 5–10 m (15) and people at arm's length (1, 3, 20). Most of the small reads are closed too. The messages weren't done. Night and the ground both overshot again, this time in the other direction: from stage discs to floodlight, and from grime to cobbles. Both overshoots got past my round 11 tests:

- the night test capped the heart's chroma, not its value;
- the grain test counted dark specks, not their size with distance.

The tests below close both gaps. The overall holds at 8.5: the frames are better at arm's length and worse at night.

`calendar-r12-summer` and `phone-r12-*` hadn't rendered when this was written. I also read the round 11 captures that arrived after that verdict (`phone-r11-*`, `calendar-r11-summer`). Helper sheets are numbered in reading order; "m" frames are `merged-r12`.

- **Scores:**
  - **The look (Sea Bright): 8.5.** Held. The beach reads as sand at last (8, 16), the walks are cleaner (2, 17), and the nearest trees have limbs (11, 15). But the night is floodlit (3, 13), asphalt reads as cobbles (11, 20, m7), and trees past 30 m are still balls.
  - **Life and micro detail: 8.5** (from 8). People hold up at arm's length: smooth limbs, shoes on the ground, the lead in hand, the tail carried (20, kit). There's a cook at the stove (6), dogs walked at golden hour and at 22:00 (1, 3), and customers in the café (18). Held back by the dog share and the shoulders (see "Still reads fake" 4–5).
  - **Structures (bridges): 7.5.** Untouched. The tender houses are still garden sheds (m1, m3).
  - **Roofs and colour: 7.5.** The five-roof test is owed for the third time.
  - **Interiors: 8** (from 7.5). The cottage's kitchen has a cooker under its hood, a fridge, wall cabinets and someone making lunch (6). Chairs are spaced (19), and 19's bare floor is down from 48% of the frame to 30%. Held back by flat wall cabinets and bare café tables.
  - **The game loop and feel: 7.** Unchanged, and still nothing new is a verb. Round 10's first-visit bloom is still Robby's call: pencil on a first arrival until the first Paint, then painted for good.
  - **Phone presentation: 8.** Held on round 11's helper frames. The merged build hasn't been seen on a phone for two rounds: both `phone-r11` frames are behind the watchdog's report.
  - **Overall: 8.5/10, NOT PASSED.**
- **Closed / moved:**
  - **Round 11 MF1, lamplight: moved and overshot.**
    - Gone: the stage disc. The heart is a cream at C\* 16–19 with no rim, and frame 3's pool halves at 9.5 m and holds 37% at 12 m.
    - Overshot:
      - 3's heart sits at L\* 75.9, 6 L\* under the lit windows (81.9), and its gap is L\* 26.5;
      - 13's whole street is one olive field: the near ground at L\* 47–55, hue 88–100°;
      - past 60 m in both frames, pools run only 1.2–1.5× over gaps of L\* 49–59.
  - **MF2, the grain: moved and overshot.**
    - Fixed:
      - the dark speckle is down: 5–8% of the bottom 40% in 2, 10, 11 and 20 (round 11: 8–13%), at 0.35–0.50 blobs/kpx (0.57–0.98);
      - the pink is gone: 0.0% on 8 and 16 (round 11's 16: 6.2%, 4 blotches);
      - the sand's marks are gentle: the p5–p95 L\* range on 16 is 6.8 (was 22.0).
    - Overshot: the stones are screen-sized, so asphalt reads as cobbles, and the near sand shows a grid (MF2).
  - **MF3, messages: open, not done.** It's now part of MF4.
  - **MF4, trees at 5–10 m: closed** after nine rounds.
    - Sky shows through 6–9% of the crown, the longest straight edge is 4–9% of the crown's width, 3–4 limbs enter the crown, and the trunk tapers 1.45–1.5.
    - The nearest tree in 11 is leafy and ragged.
    - Open past 30 m (MF3).
  - **MF5, people at arm's length: closed by its tests.** The lead is 1.9 cm from the hand, shoes are 10.6 cm wide, the tail is carried 47 cm up, and the worst normal break is 23.7°. One new flaw: the shoulders (MF5).
  - **The small reads:**
    - Closed:
      - the kitchens (6);
      - the chairs (19);
      - the WC door shut (6);
      - the ground under the raised house, now a sand pad (5; green under it 22%, from 38%).
    - Moved: frame 9, the marina. A sailboat, a cruiser and a centre-console are up close, and a few more boats at the far pier.
    - Unverified: the wakes. The dock's white lozenges are still there (pick-r12a 5; MF5).
  - **Roof hue: open, third request.**
- **Reads real:**
  - **Lunch** (6). A resident at the cooker under the hood, the fridge, the sink under the window, the WC door shut, the sofa. The cottage is lived in.
  - **Street trees up close** (15; 11's nearest). Forked trunks rise into leafy crowns, with sky through the leaf clusters and broken edges.
  - **Dogs walked** at golden hour (1), at 22:00 (3), and side on with the lead in hand and the tail up (20).
  - **Sand that reads as sand** (8, 16, m6). The pink and the dark smudges are gone, and a warm October day has a few sunbathers on it (m6).
  - **The night's shape** (3). Pools die away with no rim, the wires are silhouettes, and the lit windows are the accents.
  - **River Street** (m5). A raised house on its pilings over a shell yard, mailboxes, a hydrant, a flag and the wires: a Sea Bright street.
- **Still reads fake** (most damaging first):
  1. **The night is floodlit (13, 3).** 13 reads as a lit car park in olive, with no pool you can find. In 3, the ground under your feet competes with the windows. The causes are listed under MF1.
  2. **Asphalt reads as cobbles (11, 20, 5's road, m5, m7), and the beach has a grid (m6, 16).**
     - `stones()` keeps an octave for every distance, so each stone stays 3–16 px on screen. In m7 the flecks grow from 4 px near to 10 px far: 2–3 cm at your feet, 30–60 cm by 20 m.
     - The near sand on m6 carries a second family of lines at right angles (MF2's test).
  3. **Trees past 30 m are the old balls (11).** And every tree in 15 is the same slingshot: a straight trunk forking into two straight limbs at ~2 m. The grove's crowns go to a dark olive (L\* 30, against the single tree's 56).
  4. **Dogs fill the street.**
     - 7 of the 9 walkers within ~15 m of a lens (1, 3, 20, compare-20) walk a dog.
     - The sim assigns 9% dog walkers, but only the others visit doors: at ~0.07/s while walking, staying 15–110 s by day and four times that at night (`lifeSim.ts` l.1445, l.1485). The street keeps the dogs: roughly 24% of who's outdoors by day and 40% at night, plus the joggers.
     - Make dog walkers stop at a porch or a café too, or slow the others' visits, until the outdoor share matches the assigned one.
     - A dog on Sea Bright's beach at 13:00 in July (calendar-r11-summer 1) breaks the town's own rule: no dogs from May 15 to Sept 15. That belongs in a dated ordinance table by municipality, never a place name in code.
  5. **Arm's length** (MF5): the shoulders, the wall cabinets, the bare café tables. The kerb car at the lens in 1 is still a navy box.
  6. **The dock's white lozenges** (pick-r12a 5) survived the wake rewrite (MF5).
  7. **A dark grey disc over the beach** (16; it was behind round 11's tree). If it's a balloon, a backlit envelope should glow, not read as a blot. If not, the id pass should name it.
  8. **The harness.**
     - 14's id pass re-posed "people on the street" onto empty sand. A walker pose must fail when no walker covers ≥ 1% of the frame.
     - A pole at ~2 m splits m5 in two at 3.7% of its pixels, under the 5% rule. A thin occluder crossing ≥ 60% of the frame's height should fail too.
- **Next must-fix** (ranked by what an hour buys):
  1. **Night: one value plan, the windows brightest (13, 3).**
     - The causes, in `nightLight.ts`:
       - `POOL.gain` 1.8 puts a heart on the filmic shoulder (L\* 75), so its skirt is still L\* 45–50 at 12–15 m;
       - `FLOOR.strength` 0.16 with `even` 0.85 lifts every gap to L\* ≥ 26 and flattens every surface toward one grey;
       - `NIGHT_GRADE.fade` 0.8 by luma 0.4 hands the mid-tones their own hue back, so 13's lit lawn and asphalt go olive;
       - a 22 m `reach` with lamps 30–40 m apart leaves no dark between them.
     - The fix:
       - gain ~1.0;
       - floor ~0.05 with `even` ~0.35;
       - `fade` ~0.3;
       - `reach` ~16 m;
       - reserve the lights by what they are (an emissive flag on windows, lamp heads and headlamps), not by brightness.
     - *Test* (`night-check`, 3 and 13 both pass):
       - the heart at L\* 50–62 and ≥ 15 L\* under the lit windows' median, with no ground pixel above that median;
       - it halves 5–8 m from the lamp's foot, is 10–25% at 12 m, and is within 1.3× its gap by 16 m;
       - 13: ≥ 2 pools 14–90 m ahead at ≥ 2.5× their gap (today 1);
       - every gap at L\* 10–20, hue 220–280°, C\* ≤ 10;
       - kept: the wires, the lens, and the heart's C\* ≤ 30.
  2. **Aggregate at its real size, and structure past it.**
     - Asphalt and concrete keep a 1–3 cm stone octave only, gone where a stone spans under 2 px (about 5 m at 960×540).
     - Past that, a street's texture is structure:
       - each lane's two wheel paths, a shade darker and smoother;
       - an oil streak down each lane and parking space;
       - manholes and valve covers;
       - the tar snakes, patches, joints and flags it already has.
     - Beach ripples are curving crests across the wind, broken where walked, never a second family at right angles.
     - *Test:*
       - in m7, the median light fleck 10–20 m out is ≤ ⅓ the size of one 2–4 m out (today 2.5× larger);
       - after a 2 px blur, which removes the aggregate, the bottom 40% keeps a local L\* std ≥ 2.0 in 2, 10, 11, 17, m4 and m7: structure has to carry it;
       - kept: dark specks ≥ 6 L\* ≤ 6% at ≤ 0.35 blobs/kpx, and no pink;
       - on m6 and 16, the near sand's column-profile autocorrelation is ≤ 0.2 (m6 today: 0.48 at a 10 px period).
  3. **Every tree, not only the near ones.**
     - Bake each species' near model (a few seeds × the season) into the micro layer's hemi-octahedral impostor cards (`render/impostor.ts`). Draw them from 30 m to ~300 m, and the balls only past that.
     - Vary the scaffold: a leader with 3–5 scaffold limbs at 1.8–3.5 m, angled by species.
     - *Test:*
       - in 11, the five nearest trees past 30 m each show sky through ≥ 3% of the crown, with the longest straight silhouette edge ≤ 15% of the crown's width (`tree-metrics`);
       - at 30 m, near model vs card on the same tree: ΔE2000 ≤ 5 over the crown and silhouette IoU ≥ 0.8;
       - ≤ +2 draws, an atlas ≤ 2048² on desktop and 1024² on phones, and `__FRAMES__` within the phone budget on Ocean Ave;
       - in 15, no two neighbours fork within 0.3 m of the same height and 10° of the same angle.
  4. **Evidence owed, the third time: the messages, a merged-build phone frame, the roofs.**
     - Every toast and the arrival card fit two lines at 320–390 px with no "…". For example: "Painted out to 1.2 km · 0.35 km²" and "Monmouth County, NJ · 7:42 pm".
     - In capture mode, the 15 s no-frame watchdog waits 180 s, or the capture runs at DPR 2 with the same CSS viewport.
     - Run round 10's five-roof test.
     - *Test:*
       - `hud-audit` renders the full copy set with no "…";
       - `phone-r13-portrait` and `-landscape` with no report on screen, ≥ 40° across, the clock ≥ 4.5:1, and the ground passing must-fix 2;
       - the five roofs' numbers as round 10 specified.
  5. **Arm's length, round two.**
     - **Shoulders** (kit 3, 5; 18). Each arm tube's flat top stands proud of the shoulder like an epaulette. Cap the arm with a sphere at a joint inside the torso, so the deltoid rounds into the arm. *Test:* front and side at 1.5 m, no arm vertex above the torso's surface at the shoulder.
     - **Wall cabinets** (6). They're flat cut-outs in the curtains' own blue, and the two merge. Give them door joints, 30 cm of depth with a shadowed underside, and a colour of their own. *Test:* ΔE ≥ 15 between the cabinets and the curtains; an underside shadow band ≥ 3 px tall and ≥ 10 L\* under the splashback.
     - **A café set for lunch** (18): a cup, a plate or a glass at every occupied table. *Test:* the id pass counts ≥ 1 piece per occupied table.
     - **The dock's lozenges** (pick-r12a 5). Name them with an id pass on that frame. *Test:* no white blob (L\* ≥ 85, ≥ 0.2% of the frame) on the water within 15 m of the dock.
- **Gameplay idea: a dog of your own, who notices.**
  - The town is full of dogs now, so give the player one: from a mapped shelter (OSM `amenity=animal_shelter`), or the one waiting at the arrival.
  - It does the noticing. It stops and points at what you haven't painted: a heron in the marsh, a cat on a porch, the boat coming in. It pulls toward the nearest place card. Its nose is the hint system, with no UI.
  - Other dogs greet it, so their walkers stop and talk. That gives the sim's CHAT a reason, and the meeting is a frame to paint.
  - It keeps the real rules, from a dated ordinance table plus OSM `dog=*`:
    - it runs on Sea Bright's beach from Sept 16 to March 14 and waits at the dune crossing in summer;
    - it stays out of Monmouth Beach's fenced plover nesting areas until Oct 1.
  - It rides at the bow of your boat and in the balloon's basket, and it's in every painting you make. That's RDR2's horse bond and Nintendogs' attachment, and it makes "notice" something you do with someone.

Sources: [New Jersey Shore dog beach guide (Sea Bright, Monmouth Beach, Long Branch rules)](https://www.aol.com/jersey-shore-dog-beach-guide-090355635.html)
