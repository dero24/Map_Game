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
