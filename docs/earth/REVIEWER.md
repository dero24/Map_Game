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
