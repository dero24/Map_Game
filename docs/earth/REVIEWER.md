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
